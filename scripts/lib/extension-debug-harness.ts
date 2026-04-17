/**
 * @file
 * @brief Implements offline extension inspection and replay for the standalone debug harness.
 * @details Loads the extension default export as a black box, records registrations through `RecordingExtensionAPI`, replays `session_start`, command, and tool handlers through recorded public boundaries, and renders a deterministic usage manual. Runtime is O(r + u) where r is the number of registrations and u is the number of replayed side effects. Side effects are limited to dynamic module loading, temporary `process.cwd()` mutation during replay, filesystem existence checks, and any extension-owned side effects triggered by the recorded handlers.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { ReqError } from "../../src/core/errors.js";
import {
  type JsonValue,
  type RecordingExtensionSnapshot,
  type RecordingUiPlan,
  type RecordingUiStateSnapshot,
  RecordingCommandContext,
  RecordingExtensionAPI,
} from "./recording-extension-api.js";

/**
 * @brief Describes the public shape of an extension factory loaded by the harness.
 * @details Constrains the dynamic import result to the default-export contract used by pi extensions while remaining independent from the official SDK package at compile time. The interface is compile-time only and introduces no runtime cost.
 */
export interface ExtensionFactory {
  (pi: RecordingExtensionAPI): void | Promise<void>;
}

/**
 * @brief Describes the shared offline snapshot returned by all harness operations.
 * @details Aggregates normalized paths plus the recorded command, tool, event, active-tool, and user-message inventories so every subcommand can emit a stable machine-readable payload. The interface is compile-time only and introduces no runtime cost.
 */
export interface OfflineContractSnapshot extends RecordingExtensionSnapshot {
  extensionPath: string;
  requestedCwd: string;
  effectiveCtxCwd: string;
  effectiveProcessCwd: string;
}

/**
 * @brief Describes the `inspect` subcommand result.
 * @details Extends the base offline snapshot with a generated usage manual covering every registered `req-*` command and agent tool. The interface is compile-time only and introduces no runtime cost.
 */
export interface InspectReport extends OfflineContractSnapshot {
  manual: string;
}

/**
 * @brief Describes the `session-start` subcommand result.
 * @details Extends the base offline snapshot with the invoked event payload and all recorded UI side effects produced during `session_start` replay. The interface is compile-time only and introduces no runtime cost.
 */
export interface SessionStartReport extends OfflineContractSnapshot {
  eventName: "session_start";
  eventPayload: JsonValue;
  ui: RecordingUiStateSnapshot;
}

/**
 * @brief Describes the `command` subcommand result.
 * @details Extends the base offline snapshot with the executed command name, raw argument string, and recorded UI side effects produced by the command handler. The interface is compile-time only and introduces no runtime cost.
 */
export interface CommandReplayReport extends OfflineContractSnapshot {
  commandName: string;
  commandArgs: string;
  ui: RecordingUiStateSnapshot;
}

/**
 * @brief Describes the `tool` subcommand result.
 * @details Extends the base offline snapshot with the executed tool name, input parameter object, streamed updates, final result payload, and recorded UI side effects. The interface is compile-time only and introduces no runtime cost.
 */
export interface ToolReplayReport extends OfflineContractSnapshot {
  toolName: string;
  toolParams: JsonValue;
  toolUpdates: JsonValue[];
  toolResult: JsonValue;
  ui: RecordingUiStateSnapshot;
}

/**
 * @brief Describes the resolved harness execution target paths.
 * @details Stores absolute normalized filesystem locations for the requested working directory and extension entry path. The interface is compile-time only and introduces no runtime cost.
 */
export interface HarnessPaths {
  cwd: string;
  extensionPath: string;
}

/**
 * @brief Serializes arbitrary replay payloads into deterministic JSON-compatible values.
 * @details Uses JSON stringify/parse with function elision and bigint normalization so tool results, streamed updates, and event payloads remain stable in offline reports. Runtime is O(n) in payload size. No external state is mutated.
 * @param[in] value {unknown} Arbitrary payload value.
 * @return {JsonValue} JSON-compatible representation.
 */
function toJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value ?? null, (_key, currentValue) => {
    if (typeof currentValue === "function") {
      return undefined;
    }
    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }
    return currentValue;
  });
  return JSON.parse(serialized ?? "null") as JsonValue;
}

/**
 * @brief Validates and resolves the requested working directory and extension path.
 * @details Normalizes both inputs to absolute paths, rejects missing directories and files, and defaults the extension entry to `./src/index.ts` relative to the current process cwd when omitted. Runtime is O(p) in path length plus filesystem existence checks. Side effects are limited to filesystem reads.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @return {HarnessPaths} Resolved absolute paths.
 * @throws {ReqError} Throws when the working directory or extension entry does not exist.
 */
export function resolveHarnessPaths(cwd?: string, extensionPath?: string): HarnessPaths {
  const resolvedCwd = path.resolve(cwd ?? process.cwd());
  if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
    throw new ReqError(`Error: working directory not found: ${resolvedCwd}`, 1);
  }
  const resolvedExtensionPath = path.resolve(extensionPath ?? path.join(process.cwd(), "src", "index.ts"));
  if (!fs.existsSync(resolvedExtensionPath) || !fs.statSync(resolvedExtensionPath).isFile()) {
    throw new ReqError(`Error: extension entry not found: ${resolvedExtensionPath}`, 1);
  }
  return { cwd: resolvedCwd, extensionPath: resolvedExtensionPath };
}

/**
 * @brief Loads the extension default export as a black-box factory.
 * @details Performs a dynamic ESM import from the resolved extension path, verifies that the module exposes a callable default export, and returns that function without inspecting extension internals. Runtime is dominated by module loading. Side effects are limited to module evaluation.
 * @param[in] extensionPath {string} Absolute extension entry path.
 * @return {Promise<ExtensionFactory>} Loaded extension factory.
 * @throws {ReqError} Throws when the module lacks a callable default export.
 * @satisfies REQ-048
 */
export async function loadExtensionFactory(extensionPath: string): Promise<ExtensionFactory> {
  const moduleUrl = pathToFileURL(extensionPath).href;
  const loadedModule = await import(moduleUrl);
  if (typeof loadedModule.default !== "function") {
    throw new ReqError(`Error: extension default export is not callable: ${extensionPath}`, 1);
  }
  return loadedModule.default as ExtensionFactory;
}

/**
 * @brief Executes a callback with `process.cwd()` temporarily set to the requested directory.
 * @details Changes the current working directory before invoking the callback, records the effective cwd observed inside the callback, and restores the previous cwd in a `finally` block. Runtime is dominated by the callback. Side effects transiently mutate process cwd.
 * @param[in] cwd {string} Requested working directory.
 * @param[in] action {() => Promise<T> | T} Callback executed under the requested cwd.
 * @return {Promise<{ value: T; effectiveProcessCwd: string }>} Callback result plus the cwd observed during execution.
 */
async function withProcessCwd<T>(cwd: string, action: () => Promise<T> | T): Promise<{ value: T; effectiveProcessCwd: string }> {
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    const value = await action();
    return { value, effectiveProcessCwd: process.cwd() };
  } finally {
    process.chdir(previousCwd);
  }
}

/**
 * @brief Registers the target extension into a fresh recording API instance.
 * @details Resolves the harness paths, loads the extension default export, instantiates a new recorder, and invokes the factory as a black box under the requested cwd. Runtime is dominated by module loading plus extension registration. Side effects include any extension-owned registration-time behavior.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @return {Promise<{ api: RecordingExtensionAPI; paths: HarnessPaths; effectiveProcessCwd: string }>} Recorder plus resolved paths.
 * @satisfies REQ-048
 */
async function registerExtensionOffline(
  cwd?: string,
  extensionPath?: string,
): Promise<{ api: RecordingExtensionAPI; paths: HarnessPaths; effectiveProcessCwd: string }> {
  const paths = resolveHarnessPaths(cwd, extensionPath);
  const factory = await loadExtensionFactory(paths.extensionPath);
  const api = new RecordingExtensionAPI(paths.extensionPath);
  const registration = await withProcessCwd(paths.cwd, async () => {
    await factory(api);
    return undefined;
  });
  return { api, paths, effectiveProcessCwd: registration.effectiveProcessCwd };
}

/**
 * @brief Lists concrete manual examples for prompt-command replay.
 * @details Maps each known `req-*` command to a stable `npm run debug:ext:command` example used by the generated manual. Access complexity is O(1).
 */
const PROMPT_COMMAND_EXAMPLES: Record<string, string> = {
  "req-analyze": 'npm run debug:ext:command -- --name req-analyze --args "Analyze src/index.ts for REQ-004 evidence" --cwd . --format pretty',
  "req-change": 'npm run debug:ext:command -- --name req-change --args "Describe a delta for src/core/tool-runner.ts" --cwd . --format pretty',
  "req-check": 'npm run debug:ext:command -- --name req-check --args "Check REQ-024 against current git helpers" --cwd . --format pretty',
  "req-cover": 'npm run debug:ext:command -- --name req-cover --args "Draft tests for REQ-019 and REQ-020" --cwd . --format pretty',
  "req-create": 'npm run debug:ext:command -- --name req-create --args "Create initial requirements for a new module" --cwd . --format pretty',
  "req-fix": 'npm run debug:ext:command -- --name req-fix --args "Fix the failing static-check regression" --cwd . --format pretty',
  "req-flowchart": 'npm run debug:ext:command -- --name req-flowchart --args "Generate a flowchart for src/cli.ts" --cwd . --format pretty',
  "req-implement": 'npm run debug:ext:command -- --name req-implement --args "Implement the selected requirement delta" --cwd . --format pretty',
  "req-new": 'npm run debug:ext:command -- --name req-new --args "Propose a new feature request for debug tooling" --cwd . --format pretty',
  "req-readme": 'npm run debug:ext:command -- --name req-readme --args "Refresh README coverage for the CLI" --cwd . --format pretty',
  "req-recreate": 'npm run debug:ext:command -- --name req-recreate --args "Recreate the requirements docs from repository evidence" --cwd . --format pretty',
  "req-refactor": 'npm run debug:ext:command -- --name req-refactor --args "Refactor source-analyzer helpers without breaking REQ-011" --cwd . --format pretty',
  "req-references": 'npm run debug:ext:command -- --name req-references --args "Regenerate REFERENCES.md after code changes" --cwd . --format pretty',
  "req-renumber": 'npm run debug:ext:command -- --name req-renumber --args "Renumber requirements after section reorganization" --cwd . --format pretty',
  "req-workflow": 'npm run debug:ext:command -- --name req-workflow --args "Refresh WORKFLOW.md from current runtime evidence" --cwd . --format pretty',
  "req-write": 'npm run debug:ext:command -- --name req-write --args "Write missing documentation sections for req/docs" --cwd . --format pretty',
};

/**
 * @brief Lists concrete manual examples for tool replay.
 * @details Maps each known registered tool to a stable `npm run debug:ext:tool` example used by the generated manual. Access complexity is O(1).
 */
const TOOL_EXAMPLES: Record<string, string> = {
  "git-path": "npm run debug:ext:tool -- --name git-path --cwd . --format pretty",
  "get-base-path": "npm run debug:ext:tool -- --name get-base-path --cwd . --format pretty",
  "files-references": `npm run debug:ext:tool -- --name files-references --params '{"files":["src/index.ts","src/core/tool-runner.ts"]}' --cwd . --format pretty`,
  "files-compress": `npm run debug:ext:tool -- --name files-compress --params '{"files":["src/index.ts"],"enableLineNumbers":true}' --cwd . --format pretty`,
  "files-find": `npm run debug:ext:tool -- --name files-find --params '{"tag":"FUNCTION|METHOD","pattern":"^run","files":["src/core/tool-runner.ts"],"enableLineNumbers":true}' --cwd . --format pretty`,
  references: "npm run debug:ext:tool -- --name references --cwd . --format pretty",
  compress: `npm run debug:ext:tool -- --name compress --params '{"enableLineNumbers":true}' --cwd . --format pretty`,
  find: `npm run debug:ext:tool -- --name find --params '{"tag":"FUNCTION","pattern":"^run","enableLineNumbers":true}' --cwd . --format pretty`,
  tokens: "npm run debug:ext:tool -- --name tokens --cwd . --format pretty",
  "files-static-check": `npm run debug:ext:tool -- --name files-static-check --params '{"files":["src/index.ts"]}' --cwd . --format pretty`,
  "static-check": "npm run debug:ext:tool -- --name static-check --cwd . --format pretty",
  "git-check": "npm run debug:ext:tool -- --name git-check --cwd . --format pretty",
  "docs-check": "npm run debug:ext:tool -- --name docs-check --cwd . --format pretty",
  "git-wt-name": "npm run debug:ext:tool -- --name git-wt-name --cwd . --format pretty",
  "git-wt-create": `npm run debug:ext:tool -- --name git-wt-create --params '{"wtName":"useReq-demo-main-20260101010101"}' --cwd . --format pretty`,
  "git-wt-delete": `npm run debug:ext:tool -- --name git-wt-delete --params '{"wtName":"useReq-demo-main-20260101010101"}' --cwd . --format pretty`,
};

/**
 * @brief Builds the generated harness usage manual.
 * @details Emits one example for each debug mode plus one concrete replay example for every registered `req-*` command and agent tool. Runtime is O(c + t) in command and tool count. No external state is mutated.
 * @param[in] snapshot {RecordingExtensionSnapshot} Recorded registration snapshot.
 * @return {string} Markdown manual.
 * @satisfies REQ-052
 */
export function buildDebugManual(snapshot: RecordingExtensionSnapshot): string {
  const lines: string[] = [
    "# Standalone extension debug harness manual",
    "",
    "## Modes",
    "- Inspect offline registrations: `npm run debug:ext:inspect -- --cwd . --format pretty`",
    '- Replay session_start offline: `npm run debug:ext:session -- --cwd . --format pretty`',
    '- Replay a command handler offline: `npm run debug:ext:command -- --name req-analyze --args "Analyze src/index.ts" --cwd . --format pretty`',
    '- Replay a tool handler offline: `npm run debug:ext:tool -- --name git-path --cwd . --format pretty`',
    '- Run SDK parity smoke: `npm run debug:ext:sdk -- --extension ./src/index.ts --cwd . --format pretty`',
    "",
    "## Prompt commands",
  ];

  for (const command of snapshot.commands.filter((entry) => entry.name.startsWith("req-"))) {
    lines.push(`### prompt /${command.name}`);
    lines.push(`- Example: \`${PROMPT_COMMAND_EXAMPLES[command.name] ?? `npm run debug:ext:command -- --name ${command.name} --args \"debug the prompt payload\" --cwd . --format pretty`}\``);
  }

  lines.push("", "## Agent tools");
  for (const tool of snapshot.tools) {
    lines.push(`### tool ${tool.name}`);
    lines.push(`- Example: \`${TOOL_EXAMPLES[tool.name] ?? `npm run debug:ext:tool -- --name ${tool.name} --cwd . --format pretty`}\``);
  }

  return `${lines.join("\n")}\n`;
}

/**
 * @brief Builds an offline inspection report without replaying runtime handlers.
 * @details Loads and registers the extension as a black box, captures the registration snapshot, and appends the generated usage manual. Runtime is dominated by extension registration. Side effects are limited to registration-time extension behavior.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @return {Promise<InspectReport>} Offline inspection report.
 * @satisfies REQ-048, REQ-050, REQ-051, REQ-052
 */
export async function inspectExtension(cwd?: string, extensionPath?: string): Promise<InspectReport> {
  const registration = await registerExtensionOffline(cwd, extensionPath);
  const snapshot = registration.api.snapshot();
  return {
    extensionPath: registration.paths.extensionPath,
    requestedCwd: registration.paths.cwd,
    effectiveCtxCwd: registration.paths.cwd,
    effectiveProcessCwd: registration.effectiveProcessCwd,
    commands: snapshot.commands,
    tools: snapshot.tools,
    eventHandlers: snapshot.eventHandlers,
    activeTools: snapshot.activeTools,
    sentUserMessages: snapshot.sentUserMessages,
    manual: buildDebugManual(snapshot),
  };
}

/**
 * @brief Replays the recorded `session_start` handlers offline.
 * @details Loads and registers the extension as a black box, invokes every recorded `session_start` handler in registration order, and captures final active tools, user messages, and UI side effects. Runtime is dominated by handler execution. Side effects include temporary `process.cwd()` mutation plus extension-owned handler behavior.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @param[in] eventPayload {Record<string, unknown> | undefined} Optional session-start payload. Defaults to `{ reason: "startup" }`.
 * @param[in] uiPlan {RecordingUiPlan | undefined} Optional scripted UI responses.
 * @return {Promise<SessionStartReport>} Offline session-start replay report.
 * @satisfies REQ-048, REQ-049, REQ-050, REQ-051, REQ-053
 */
export async function replaySessionStart(
  cwd?: string,
  extensionPath?: string,
  eventPayload?: Record<string, unknown>,
  uiPlan?: RecordingUiPlan,
): Promise<SessionStartReport> {
  const registration = await registerExtensionOffline(cwd, extensionPath);
  const context = new RecordingCommandContext(
    registration.paths.cwd,
    uiPlan,
    (content) => registration.api.recordSessionUserMessage(content),
  );
  const payload = eventPayload ?? { reason: "startup" };
  const replay = await withProcessCwd(registration.paths.cwd, async () => {
    for (const handler of registration.api.getEventHandlers("session_start")) {
      await handler(payload, context);
    }
    return undefined;
  });
  const snapshot = registration.api.snapshot();
  return {
    extensionPath: registration.paths.extensionPath,
    requestedCwd: registration.paths.cwd,
    effectiveCtxCwd: context.cwd,
    effectiveProcessCwd: replay.effectiveProcessCwd,
    commands: snapshot.commands,
    tools: snapshot.tools,
    eventHandlers: snapshot.eventHandlers,
    activeTools: snapshot.activeTools,
    sentUserMessages: snapshot.sentUserMessages,
    eventName: "session_start",
    eventPayload: toJsonValue(payload),
    ui: context.snapshotUiState(),
  };
}

/**
 * @brief Replays one recorded command handler offline.
 * @details Loads and registers the extension as a black box, resolves the named command from the recording API, executes its handler under the requested cwd, and captures resulting user messages plus UI side effects. Runtime is dominated by the command handler. Side effects include temporary `process.cwd()` mutation plus extension-owned command behavior.
 * @param[in] commandName {string} Registered command name.
 * @param[in] commandArgs {string} Raw command argument string.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @param[in] uiPlan {RecordingUiPlan | undefined} Optional scripted UI responses.
 * @return {Promise<CommandReplayReport>} Offline command replay report.
 * @throws {ReqError} Throws when the named command is not registered.
 * @satisfies REQ-048, REQ-049, REQ-050, REQ-051, REQ-054, REQ-058
 */
export async function replayCommand(
  commandName: string,
  commandArgs: string,
  cwd?: string,
  extensionPath?: string,
  uiPlan?: RecordingUiPlan,
): Promise<CommandReplayReport> {
  const registration = await registerExtensionOffline(cwd, extensionPath);
  const command = registration.api.getCommandDefinition(commandName);
  if (!command) {
    throw new ReqError(`Error: command not registered: ${commandName}`, 1);
  }
  const context = new RecordingCommandContext(
    registration.paths.cwd,
    uiPlan,
    (content) => registration.api.recordSessionUserMessage(content),
  );
  const replay = await withProcessCwd(registration.paths.cwd, async () => {
    await command.handler(commandArgs, context);
    return undefined;
  });
  const snapshot = registration.api.snapshot();
  return {
    extensionPath: registration.paths.extensionPath,
    requestedCwd: registration.paths.cwd,
    effectiveCtxCwd: context.cwd,
    effectiveProcessCwd: replay.effectiveProcessCwd,
    commands: snapshot.commands,
    tools: snapshot.tools,
    eventHandlers: snapshot.eventHandlers,
    activeTools: snapshot.activeTools,
    sentUserMessages: snapshot.sentUserMessages,
    commandName,
    commandArgs,
    ui: context.snapshotUiState(),
  };
}

/**
 * @brief Replays one recorded tool execute handler offline.
 * @details Loads and registers the extension as a black box, resolves the named tool from the recording API, executes its `execute(...)` handler under the requested cwd, records streamed updates, and captures the final return payload plus UI side effects. Runtime is dominated by the tool handler. Side effects include temporary `process.cwd()` mutation plus extension-owned tool behavior.
 * @param[in] toolName {string} Registered tool name.
 * @param[in] toolParams {Record<string, unknown>} Tool parameter object.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @param[in] uiPlan {RecordingUiPlan | undefined} Optional scripted UI responses.
 * @return {Promise<ToolReplayReport>} Offline tool replay report.
 * @throws {ReqError} Throws when the named tool is not registered or lacks an execute handler.
 * @satisfies REQ-048, REQ-049, REQ-050, REQ-051, REQ-055, REQ-058
 */
export async function replayTool(
  toolName: string,
  toolParams: Record<string, unknown>,
  cwd?: string,
  extensionPath?: string,
  uiPlan?: RecordingUiPlan,
): Promise<ToolReplayReport> {
  const registration = await registerExtensionOffline(cwd, extensionPath);
  const tool = registration.api.getToolDefinition(toolName);
  if (!tool) {
    throw new ReqError(`Error: tool not registered: ${toolName}`, 1);
  }
  if (typeof tool.execute !== "function") {
    throw new ReqError(`Error: tool has no execute handler: ${toolName}`, 1);
  }
  const context = new RecordingCommandContext(
    registration.paths.cwd,
    uiPlan,
    (content) => registration.api.recordSessionUserMessage(content),
  );
  const updates: JsonValue[] = [];
  const replay = await withProcessCwd(registration.paths.cwd, async () => {
    const toolResult = await tool.execute!(
      "offline-tool-call",
      toolParams,
      undefined,
      (update: unknown) => {
        updates.push(toJsonValue(update));
      },
      context,
    );
    return toolResult;
  });
  const snapshot = registration.api.snapshot();
  return {
    extensionPath: registration.paths.extensionPath,
    requestedCwd: registration.paths.cwd,
    effectiveCtxCwd: context.cwd,
    effectiveProcessCwd: replay.effectiveProcessCwd,
    commands: snapshot.commands,
    tools: snapshot.tools,
    eventHandlers: snapshot.eventHandlers,
    activeTools: snapshot.activeTools,
    sentUserMessages: snapshot.sentUserMessages,
    toolName,
    toolParams: toJsonValue(toolParams),
    toolUpdates: updates,
    toolResult: toJsonValue(replay.value),
    ui: context.snapshotUiState(),
  };
}
