/**
 * @file
 * @brief Registers the pi-usereq extension commands, tools, and configuration UI.
 * @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.
 */

/**
 * @brief Declares the extension version string.
 * @details The value is exported for external inspection and packaging metadata alignment. Access complexity is O(1).
 */
export const VERSION = "0.6.0"

import path from "node:path";
import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolInfo,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  buildTokenToolPayload,
  TOKEN_COUNTER_ENCODING,
  type TokenToolPayload,
} from "./core/token-counter.js";
import {
  buildDocsCheckToolPayload,
  buildGitCheckToolPayload,
  buildPathQueryToolPayload,
  buildStaticCheckToolPayload,
  buildStructuredToolExecuteResult,
  buildToolExecutionSection,
  buildWorktreeMutationToolPayload,
  buildWorktreeNameToolPayload,
  normalizeToolFailure,
} from "./core/agent-tool-json.js";
import {
  buildReferenceToolExecutionStderr,
  buildReferenceToolPayload,
  type ReferenceToolPayload,
} from "./core/reference-payload.js";
import {
  buildCompressToolExecutionStderr,
  buildCompressToolPayload,
  type CompressToolPayload,
} from "./core/compress-payload.js";
import {
  buildFindToolExecutionStderr,
  buildFindToolPayload,
  type FindToolPayload,
  type FindToolScope,
} from "./core/find-payload.js";
import {
  DEFAULT_SRC_DIRS,
  getDefaultConfig,
  getProjectConfigPath,
  loadConfig,
  normalizeConfigPaths,
  saveConfig,
  type StaticCheckEntry,
  type UseReqConfig,
} from "./core/config.js";
import {
  DEFAULT_PI_NOTIFY_CMD,
  DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
  DEFAULT_PI_NOTIFY_PUSHOVER_TITLE,
  DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD,
  DEFAULT_PI_NOTIFY_SOUND_LOW_CMD,
  DEFAULT_PI_NOTIFY_SOUND_MID_CMD,
  cyclePiNotifySoundLevel,
  formatPiNotifyBeepStatus,
  formatPiNotifyPushoverStatus,
  formatPiNotifyStatus,
  normalizePiNotifyCommand,
  normalizePiNotifyPushoverCredential,
  normalizePiNotifyPushoverPriority,
  normalizePiNotifyTemplateValue,
  runPiNotifyEffects,
  type PiNotifyEventRequest,
  type PiNotifyPushoverPriority,
  type PiNotifySoundLevel,
} from "./core/pi-notify.js";
import { formatRuntimePathForDisplay } from "./core/path-context.js";
import { resolveRuntimeGitPath } from "./core/runtime-project-paths.js";
import { showPiUsereqSettingsMenu, type PiUsereqSettingsMenuChoice } from "./core/settings-menu.js";
import {
  PI_USEREQ_STARTUP_TOOL_SET,
  isPiUsereqEmbeddedToolName,
  normalizeEnabledPiUsereqTools,
} from "./core/pi-usereq-tools.js";
import { renderPrompt } from "./core/prompts.js";
import { ensureBundledResourcesAccessible } from "./core/resources.js";
import {
  PI_USEREQ_STATUS_HOOK_NAMES,
  createPiUsereqStatusController,
  disposePiUsereqStatusController,
  renderPiUsereqStatus,
  setPiUsereqStatusConfig,
  updateExtensionStatus,
  type PiUsereqStatusController,
  type PiUsereqStatusHookName,
} from "./core/extension-status.js";
import {
  collectSourceFiles,
  runFilesStaticCheck,
  runGetBasePath,
  runGitCheck,
  runGitPath,
  runGitWtCreate,
  runGitWtDelete,
  runGitWtName,
  runProjectStaticCheck,
} from "./core/tool-runner.js";
import { LANGUAGE_TAGS } from "./core/find-constructs.js";
import {
  STATIC_CHECK_MODULES,
  getSupportedStaticCheckLanguageSupport,
  parseEnableStaticCheck,
} from "./core/static-check.js";
import { makeRelativeIfContainsProject, shellSplit } from "./core/utils.js";

/**
 * @brief Lists bundled prompt commands exposed by the extension.
 * @details Each entry maps to a `req-<name>` command that renders a bundled prompt and sends it to the active session. Access complexity is O(1).
 */
const PROMPT_NAMES = [
  "analyze",
  "change",
  "check",
  "cover",
  "create",
  "fix",
  "flowchart",
  "implement",
  "new",
  "readme",
  "recreate",
  "refactor",
  "references",
  "renumber",
  "workflow",
  "write",
] as const;

/**
 * @brief Describes the optional shortcut-registration surface used by pi-usereq.
 * @details Narrows the runtime API to the documented `registerShortcut(...)`
 * method so the extension can remain compatible with offline harnesses that do
 * not implement shortcut capture. Compile-time only and introduces no runtime
 * cost.
 */
interface PiShortcutRegistrar {
  registerShortcut?: (
    shortcut: string,
    options: {
      description?: string;
      handler: (ctx: ExtensionCommandContext) => Promise<void> | void;
    },
  ) => void;
}

/**
 * @brief Resolves the effective project base from a working directory.
 * @details Normalizes the provided cwd into an absolute path without consulting configuration. Time complexity is O(1). No I/O side effects occur.
 * @param[in] cwd {string} Current working directory.
 * @return {string} Absolute project base path.
 */
function getProjectBase(cwd: string): string {
  return path.resolve(cwd);
}

/**
 * @brief Loads project configuration for the extension runtime.
 * @details Resolves the project base, loads persisted config, and normalizes configured directory paths without reading or persisting runtime-derived `base-path` or `git-path` metadata. Runtime is dominated by config I/O. Side effects are limited to filesystem reads.
 * @param[in] cwd {string} Current working directory.
 * @return {UseReqConfig} Effective project configuration.
 * @satisfies REQ-030, REQ-145, REQ-146
 */
function loadProjectConfig(cwd: string): UseReqConfig {
  const projectBase = getProjectBase(cwd);
  return normalizeConfigPaths(projectBase, loadConfig(projectBase));
}

/**
 * @brief Persists project configuration from the extension runtime.
 * @details Resolves the project base, normalizes configured directory paths into project-relative form, and delegates persistence to `saveConfig` without serializing runtime-derived path metadata. Runtime is O(n) in config size. Side effects include config-file writes.
 * @param[in] cwd {string} Current working directory.
 * @param[in] config {UseReqConfig} Configuration to persist.
 * @return {void} No return value.
 * @satisfies REQ-146
 */
function saveProjectConfig(cwd: string, config: UseReqConfig): void {
  const projectBase = getProjectBase(cwd);
  saveConfig(projectBase, normalizeConfigPaths(projectBase, config));
}

/**
 * @brief Formats the current project config path for top-level menu display.
 * @details Resolves `<base-path>/.pi-usereq/config.json` from the cwd-derived
 * project base and formats it relative to the user home when possible. Runtime
 * is O(p) in path length. No external state is mutated.
 * @param[in] cwd {string} Current working directory.
 * @return {string} User-home-relative or absolute config path display value.
 * @satisfies REQ-162
 */
function formatProjectConfigPathForMenu(cwd: string): string {
  return formatRuntimePathForDisplay(getProjectConfigPath(getProjectBase(cwd)));
}

/**
 * @brief Collects the project-scoped static-check selection used by the agent tool.
 * @details Resolves configured source plus test directories, reuses the same fixture-root exclusions as `runProjectStaticCheck`, and returns canonical relative file paths for structured payload emission. Runtime is O(F) plus project file-discovery cost. Side effects are limited to filesystem reads and git subprocesses delegated through `collectSourceFiles`.
 * @param[in] projectBase {string} Resolved project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {{ selectionDirectoryPaths: string[]; excludedDirectoryPaths: string[]; selectedPaths: string[] }} Structured static-check selection facts.
 */
function collectProjectStaticCheckSelection(
  projectBase: string,
  config: UseReqConfig,
): {
  selectionDirectoryPaths: string[];
  excludedDirectoryPaths: string[];
  selectedPaths: string[];
} {
  const selectionDirectoryPaths = [...config["src-dir"], config["tests-dir"]];
  const testsDirRel = makeRelativeIfContainsProject(config["tests-dir"], projectBase)
    .split(path.sep)
    .join("/")
    .replace(/^\.?\/?/, "")
    .replace(/\/+$/, "");
  const excludedDirectoryPaths = [...new Set([
    "tests/fixtures",
    testsDirRel ? `${testsDirRel}/fixtures` : "fixtures",
  ])];
  const selectedPaths = collectSourceFiles(selectionDirectoryPaths, projectBase)
    .filter((filePath) => {
      const relativePath = path.relative(projectBase, filePath).split(path.sep).join("/");
      return !excludedDirectoryPaths.some((excludedDirectoryPath) => {
        return relativePath === excludedDirectoryPath || relativePath.startsWith(`${excludedDirectoryPath}/`);
      });
    })
    .map((filePath) => path.relative(projectBase, filePath).split(path.sep).join("/"));
  return {
    selectionDirectoryPaths,
    excludedDirectoryPaths,
    selectedPaths,
  };
}

/**
 * @brief Builds execution diagnostics for one token-tool payload.
 * @details Serializes skipped-input and read-error observations into stable stderr lines while leaving successful counted files silent. Runtime is O(n) in issue count. No side effects occur.
 * @param[in] payload {TokenToolPayload} Structured token payload.
 * @return {string} Newline-delimited execution diagnostics.
 */
function buildTokenToolExecutionStderr(payload: TokenToolPayload): string {
  const skippedLines = payload.files
    .filter((entry) => entry.status === "skipped" && entry.error_message)
    .map((entry) => `skipped: ${entry.canonical_path}: ${entry.error_message!}`);
  const errorLines = payload.files
    .filter((entry) => entry.status === "error" && entry.error_message)
    .map((entry) => `error: ${entry.canonical_path}: ${entry.error_message!}`);
  return [...skippedLines, ...errorLines].join("\n");
}

/**
 * @brief Builds the agent-oriented execute result returned by token-count tools.
 * @details Mirrors the structured token payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {TokenToolPayload} Structured token payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: TokenToolPayload & { execution: { code: number; stderr: string } } }} Token-tool execute result.
 * @satisfies REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075, REQ-099, REQ-102
 */
function buildTokenToolExecuteResult(
  payload: TokenToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: TokenToolPayload & { execution: { code: number; stderr: string } };
} {
  const details = {
    summary: payload.summary,
    files: payload.files,
    execution: {
      code: payload.summary.counted_file_count > 0 ? 0 : 1,
      stderr: buildTokenToolExecutionStderr(payload),
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Builds the agent-oriented execute result returned by references tools.
 * @details Mirrors the structured references payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {ReferenceToolPayload} Structured references payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: ReferenceToolPayload & { execution: { code: number; stderr: string } } }} References-tool execute result.
 * @satisfies REQ-076, REQ-077, REQ-078, REQ-079, REQ-099, REQ-102
 */
function buildReferenceToolExecuteResult(
  payload: ReferenceToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: ReferenceToolPayload & { execution: { code: number; stderr: string } };
} {
  const details = {
    summary: payload.summary,
    repository: payload.repository,
    files: payload.files,
    execution: {
      code: payload.summary.analyzed_file_count > 0 ? 0 : 1,
      stderr: buildReferenceToolExecutionStderr(payload),
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Builds the agent-oriented execute result returned by compression tools.
 * @details Mirrors the structured compression payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {CompressToolPayload} Structured compression payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: CompressToolPayload & { execution: { code: number; stderr: string } } }} Compression-tool execute result.
 * @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087, REQ-088, REQ-099, REQ-102
 */
function buildCompressionToolExecuteResult(
  payload: CompressToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: CompressToolPayload & { execution: { code: number; stderr: string } };
} {
  const details = {
    summary: payload.summary,
    repository: payload.repository,
    files: payload.files,
    execution: {
      code: payload.summary.compressed_file_count > 0 ? 0 : 1,
      stderr: buildCompressToolExecutionStderr(payload),
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Maps find-payload language identifiers to stable registration labels.
 * @details Preserves the canonical capitalization used by tool descriptions so supported-tag guidance remains deterministic across inspection snapshots. Access complexity is O(1).
 */
const FIND_TOOL_LANGUAGE_LABELS: Record<string, string> = {
  c: "C",
  cpp: "Cpp",
  csharp: "Csharp",
  elixir: "Elixir",
  go: "Go",
  haskell: "Haskell",
  java: "Java",
  javascript: "Javascript",
  kotlin: "Kotlin",
  lua: "Lua",
  perl: "Perl",
  php: "Php",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  scala: "Scala",
  shell: "Shell",
  swift: "Swift",
  typescript: "Typescript",
  zig: "Zig",
};

/**
 * @brief Defines the stable language order used by find-tool supported-tag guidance.
 * @details Keeps registration descriptions aligned with the repository-supported language matrix and preserves deterministic inspection snapshots. Access complexity is O(1).
 */
const FIND_TOOL_LANGUAGE_ORDER = [
  "c",
  "cpp",
  "csharp",
  "elixir",
  "go",
  "haskell",
  "java",
  "javascript",
  "kotlin",
  "lua",
  "perl",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "shell",
  "swift",
  "typescript",
  "zig",
] as const;

/**
 * @brief Builds the supported-tag guidance lines embedded in find-tool registrations.
 * @details Emits one deterministic line per supported language containing its canonical registration label and sorted tag list so downstream agents can specialize requests without invoking the tool first. Runtime is O(l * t log t). No side effects occur.
 * @return {string[]} Supported-tag guidance lines.
 */
function buildFindToolSupportedTagGuidelines(): string[] {
  return FIND_TOOL_LANGUAGE_ORDER
    .filter((language) => language in LANGUAGE_TAGS)
    .map((language) => `Supported tags [${FIND_TOOL_LANGUAGE_LABELS[language]}]: ${[...LANGUAGE_TAGS[language]!].sort().join(", ")}`);
}

/**
 * @brief Builds the schema description for one find-tool registration.
 * @details Specializes the input-scope sentence for explicit-file or configured-directory searches while keeping the JSON output contract stable and fully machine-readable. Runtime is O(1). No side effects occur.
 * @param[in] scope {FindToolScope} Find-tool scope.
 * @return {string} Parameter-schema description.
 */
function buildFindToolSchemaDescription(scope: FindToolScope): string {
  const inputContract = scope === "explicit-files"
    ? "Input contract: tag + pattern + files[] + optional enableLineNumbers."
    : "Input contract: tag + pattern + optional enableLineNumbers. Scope is the configured src-dir list resolved from the current project configuration.";
  return `${inputContract} Output contract: JSON object with summary, repository, files, and execution. Static supported-tag matrices are documented in tool registration metadata instead of runtime responses. File entries expose structured statuses, file_doxygen, and match records with typed line ranges, stripped code lines, and structured Doxygen fields. Regex matches construct names only.`;
}

/**
 * @brief Builds the prompt-guideline set for one find-tool registration.
 * @details Encodes scope selection, output schema, regex semantics, line-number behavior, tag-filter rules, and the full language-to-tag matrix as stable agent-oriented strings. Runtime is O(l * t log t). No side effects occur.
 * @param[in] scope {FindToolScope} Find-tool scope.
 * @return {string[]} Prompt-guideline strings.
 */
function buildFindToolPromptGuidelines(scope: FindToolScope): string[] {
  const scopeLine = scope === "explicit-files"
    ? "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute."
    : "Scope: resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.";
  const outputLine = scope === "explicit-files"
    ? "Output contract: summary + repository + files + execution. Repository exposes requested file scope only when it adds dynamic search context; supported tags remain documented in registration metadata. File entries expose status, line ranges, file_doxygen, and matches; match entries expose symbol_kind, signature_text, line ranges, code_lines, stripped_source_text, and structured Doxygen fields."
    : "Output contract: summary + repository + files + execution. Repository exposes source_directory_paths and file_canonical_paths when project-scope search context varies; supported tags remain documented in registration metadata. File entries expose status, line ranges, file_doxygen, and matches; match entries expose symbol_kind, signature_text, line ranges, code_lines, stripped_source_text, and structured Doxygen fields.";
  return [
    scopeLine,
    outputLine,
    "Regex rule: pattern is applied to construct names only with JavaScript RegExp search semantics; it never matches construct bodies; use ^...$ for exact-name matching.",
    "Tag rule: tag is pipe-separated and case-insensitive; unsupported tags are ignored; if no valid tag remains, the response search_status becomes invalid_tag_filter.",
    "Line-number behavior: enableLineNumbers changes only display_text and stripped_source_text rendering; numeric source_line_number and line_range facts remain dedicated fields.",
    "Failure contract: invalid tag filters, invalid regex patterns, unsupported extensions, unsupported tag-language combinations, no-match files, and analysis failures are surfaced as structured statuses plus optional execution.stderr diagnostics.",
    ...buildFindToolSupportedTagGuidelines(),
  ];
}

/**
 * @brief Builds the agent-oriented execute result returned by find tools.
 * @details Mirrors the structured find payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {FindToolPayload} Structured find payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: FindToolPayload & { execution: { code: number; stderr: string } } }} Find-tool execute result.
 * @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-097, REQ-098, REQ-099, REQ-102
 */
function buildFindToolExecuteResult(
  payload: FindToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: FindToolPayload & { execution: { code: number; stderr: string } };
} {
  const stderr = buildFindToolExecutionStderr(payload);
  const details = {
    summary: payload.summary,
    repository: payload.repository,
    files: payload.files,
    execution: {
      code: payload.summary.search_status === "matched" ? 0 : 1,
      stderr,
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Delivers one rendered prompt into the active session.
 * @details Writes the rendered prompt directly through `pi.sendUserMessage(...)` without creating replacement sessions or pre-reset flows. Runtime is O(n) in prompt length. Side effects are limited to user-message delivery.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] content {string} Rendered prompt markdown.
 * @return {Promise<void>} Promise resolved after the prompt is queued for delivery.
 * @satisfies REQ-004, REQ-067, REQ-068
 */
async function deliverPromptCommand(pi: ExtensionAPI, content: string): Promise<void> {
  pi.sendUserMessage(content);
}

/**
 * @brief Returns the configurable active-tool inventory visible to the extension.
 * @details Filters runtime tools against the canonical configurable-tool set, thereby combining extension-owned tools with supported embedded pi CLI tools. Output order is sorted by tool name. Runtime is O(t log t). No external state is mutated.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {ToolInfo[]} Sorted configurable tool descriptors.
 * @satisfies REQ-007, REQ-063
 */
function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[] {
  return pi.getAllTools()
    .filter((tool) => PI_USEREQ_STARTUP_TOOL_SET.has(tool.name))
    .filter((tool) => !isPiUsereqEmbeddedToolName(tool.name) || tool.sourceInfo?.source === "builtin")
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * @brief Normalizes and returns the configured enabled active tools.
 * @details Reuses repository normalization rules, updates the config object in place, and returns the normalized array. Runtime is O(n) in configured tool count. Side effect: mutates `config["enabled-tools"]`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {string[]} Normalized enabled tool names.
 */
function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[] {
  const enabledTools = normalizeEnabledPiUsereqTools(config["enabled-tools"]);
  config["enabled-tools"] = [...enabledTools];
  return enabledTools;
}

/**
 * @brief Classifies one configurable tool as embedded or extension-owned.
 * @details Uses the runtime `sourceInfo.source` field plus the supported embedded-name subset to produce one stable UI label. Runtime is O(1). No external state is mutated.
 * @param[in] tool {ToolInfo} Runtime tool descriptor.
 * @return {"builtin" | "extension"} Stable tool-kind label.
 */
function getPiUsereqToolKind(tool: ToolInfo): "builtin" | "extension" {
  if (tool.sourceInfo?.source === "builtin" && isPiUsereqEmbeddedToolName(tool.name)) {
    return "builtin";
  }
  return "extension";
}

/**
 * @brief Applies the configured active-tool enablement to the current session.
 * @details Preserves non-configurable active tools, removes every configurable tool from the active set, then re-adds only configured tools that exist in the current runtime inventory. Runtime is O(t). Side effects include `pi.setActiveTools(...)`.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {void} No return value.
 * @satisfies REQ-009, REQ-064
 */
function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void {
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  const allTools = pi.getAllTools();
  const configurableTools = getPiUsereqStartupTools(pi);
  const allToolNames = new Set(allTools.map((tool) => tool.name));
  const nextActive = new Set(pi.getActiveTools().filter((toolName) => allToolNames.has(toolName)));

  for (const tool of configurableTools) {
    nextActive.delete(tool.name);
  }
  for (const tool of configurableTools) {
    if (enabledTools.has(tool.name)) {
      nextActive.add(tool.name);
    }
  }

  pi.setActiveTools(allTools.map((tool) => tool.name).filter((toolName) => nextActive.has(toolName)));
}

/**
 * @brief Handles one intercepted pi lifecycle hook for pi-usereq status updates.
 * @details Applies session-start-specific resource validation, project-config
 * refresh, and startup-tool enablement before forwarding the originating hook
 * name and payload into the shared `updateExtensionStatus(...)` pipeline.
 * On `agent_end`, also dispatches configured command-notify, terminal-beep,
 * sound, and prompt-specific Pushover effects when the current run originates
 * from a bundled prompt command. Runtime is dominated by configuration loading during
 * `session_start`; all other hooks are O(1). Side effects include resource
 * checks, active-tool mutation, status updates, live-ticker disposal on
 * shutdown, stdout writes, optional child-process spawning, and outbound
 * HTTPS requests.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
 * @param[in] event {unknown} Hook payload forwarded by pi.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {Promise<void>} Promise resolved when hook processing completes.
 * @satisfies REQ-117, REQ-118, REQ-119, REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-177, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187
 */
async function handleExtensionStatusEvent(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
  hookName: PiUsereqStatusHookName,
  event: unknown,
  ctx: ExtensionContext,
): Promise<void> {
  const notifyRequest: PiNotifyEventRequest | undefined = hookName === "agent_end"
    && statusController.state.activePromptRequest !== undefined
    && statusController.state.runStartTimeMs !== undefined
    ? {
        promptName: statusController.state.activePromptRequest.promptName,
        promptArgs: statusController.state.activePromptRequest.promptArgs,
        basePath: path.resolve(ctx.cwd),
        completionTimeMs: Math.max(0, Date.now() - statusController.state.runStartTimeMs),
      }
    : undefined;
  if (hookName === "session_start") {
    ensureBundledResourcesAccessible();
    const config = loadProjectConfig(ctx.cwd);
    applyConfiguredPiUsereqTools(pi, config);
    setPiUsereqStatusConfig(statusController, config);
  }
  updateExtensionStatus(statusController, hookName, event, ctx);
  if (hookName === "agent_end") {
    if (statusController.config) {
      runPiNotifyEffects(
        statusController.config,
        event as { messages: AgentEndEvent["messages"] },
        notifyRequest,
      );
    }
    statusController.state.activePromptRequest = undefined;
  }
  if (hookName === "session_shutdown") {
    disposePiUsereqStatusController(statusController);
  }
}

/**
 * @brief Registers shared wrappers for every supported pi lifecycle hook.
 * @details Installs one generic wrapper per intercepted hook so every resource,
 * session, agent, model, tool, bash, and input event is routed through the
 * same extension-status update pipeline. Runtime is O(h) in registered hook
 * count. Side effects include hook registration.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies DES-002, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117
 */
function registerExtensionStatusHooks(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
): void {
  const registerHook = pi.on.bind(pi) as (
    event: PiUsereqStatusHookName,
    handler: (event: unknown, ctx: ExtensionContext) => Promise<void>,
  ) => void;
  for (const hookName of PI_USEREQ_STATUS_HOOK_NAMES) {
    registerHook(hookName, async (event, ctx) => {
      await handleExtensionStatusEvent(pi, statusController, hookName, event, ctx);
    });
  }
}

/**
 * @brief Replaces the configured active-tool selection and applies it immediately.
 * @details Normalizes the requested tool names, stores them in config, and synchronizes the active tool set with runtime registration state. Runtime is O(n + t). Side effect: mutates config and active tools.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @param[in] enabledTools {string[]} Requested enabled tool names.
 * @return {void} No return value.
 */
function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void {
  config["enabled-tools"] = normalizeEnabledPiUsereqTools(enabledTools);
  applyConfiguredPiUsereqTools(pi, config);
}

/**
 * @brief Renders a textual reference for configurable-tool configuration and runtime state.
 * @details Lists every configurable tool with configured enablement, runtime activation, builtin-versus-extension classification, source metadata, and optional descriptions. Runtime is O(t). No side effects occur.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Multiline tool-status report.
 */
function renderPiUsereqToolsReference(pi: ExtensionAPI, config: UseReqConfig): string {
  const tools = getPiUsereqStartupTools(pi);
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  const activeTools = new Set(pi.getActiveTools());
  const lines = [
    "# configurable active tools",
    "",
    `Configured enabled tools: ${enabledTools.size}/${tools.length}`,
    `Currently active tools: ${tools.filter((tool) => activeTools.has(tool.name)).length}/${tools.length}`,
    "",
    "Tools:",
  ];

  for (const tool of tools) {
    const configured = enabledTools.has(tool.name) ? "enabled" : "disabled";
    const active = activeTools.has(tool.name) ? "active" : "inactive";
    const source = tool.sourceInfo ? `${tool.sourceInfo.source}:${tool.sourceInfo.path}` : "unknown";
    lines.push(`- ${tool.name}`);
    lines.push(`  kind: ${getPiUsereqToolKind(tool)}`);
    lines.push(`  configured: ${configured}`);
    lines.push(`  runtime: ${active}`);
    lines.push(`  source: ${source}`);
    if (tool.description) {
      lines.push(`  description: ${tool.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/**
 * @brief Represents one persisted boolean notification-setting key.
 * @details Restricts menu toggles to the global enable flags and outcome-specific toggles used by command-notify, terminal-beep, sound, and Pushover configuration. Compile-time only and introduces no runtime cost.
 */
type PiNotifyBooleanConfigKey =
  | "notify-enabled"
  | "notify-on-end"
  | "notify-on-esc"
  | "notify-on-error"
  | "notify-beep-enabled"
  | "notify-beep-on-end"
  | "notify-beep-on-esc"
  | "notify-beep-on-error"
  | "notify-sound-on-end"
  | "notify-sound-on-esc"
  | "notify-sound-on-error"
  | "notify-pushover-enabled"
  | "notify-pushover-on-end"
  | "notify-pushover-on-esc"
  | "notify-pushover-on-error";

/**
 * @brief Flips one persisted boolean notification setting.
 * @details Negates the selected configuration flag in place and returns the resulting boolean value so callers can emit deterministic UI feedback. Runtime is O(1). Side effect: mutates `config`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @param[in] key {PiNotifyBooleanConfigKey} Boolean configuration key to toggle.
 * @return {boolean} Next enabled state.
 */
function togglePiNotifyFlag(config: UseReqConfig, key: PiNotifyBooleanConfigKey): boolean {
  config[key] = !config[key];
  return config[key];
}

/**
 * @brief Restores notification-related settings to their documented defaults.
 * @details Copies the command-notify, terminal-beep, sound, and Pushover
 * configuration subtree from a fresh default config into the supplied mutable
 * project config. Runtime is O(1). Side effect: mutates `config`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {void} No return value.
 * @satisfies REQ-174, REQ-177, REQ-178, REQ-184, REQ-195, REQ-196
 */
function resetPiNotifyConfigToDefaults(config: UseReqConfig): void {
  const defaults = getDefaultConfig("");
  config["notify-enabled"] = defaults["notify-enabled"];
  config["notify-on-end"] = defaults["notify-on-end"];
  config["notify-on-esc"] = defaults["notify-on-esc"];
  config["notify-on-error"] = defaults["notify-on-error"];
  config["notify-beep-enabled"] = defaults["notify-beep-enabled"];
  config["notify-beep-on-end"] = defaults["notify-beep-on-end"];
  config["notify-beep-on-esc"] = defaults["notify-beep-on-esc"];
  config["notify-beep-on-error"] = defaults["notify-beep-on-error"];
  config["notify-sound"] = defaults["notify-sound"];
  config["notify-sound-on-end"] = defaults["notify-sound-on-end"];
  config["notify-sound-on-esc"] = defaults["notify-sound-on-esc"];
  config["notify-sound-on-error"] = defaults["notify-sound-on-error"];
  config["notify-sound-toggle-shortcut"] = defaults["notify-sound-toggle-shortcut"];
  config["notify-pushover-enabled"] = defaults["notify-pushover-enabled"];
  config["notify-pushover-on-end"] = defaults["notify-pushover-on-end"];
  config["notify-pushover-on-esc"] = defaults["notify-pushover-on-esc"];
  config["notify-pushover-on-error"] = defaults["notify-pushover-on-error"];
  config["notify-pushover-user-key"] = defaults["notify-pushover-user-key"];
  config["notify-pushover-api-token"] = defaults["notify-pushover-api-token"];
  config["notify-pushover-priority"] = defaults["notify-pushover-priority"];
  config["notify-pushover-title"] = defaults["notify-pushover-title"];
  config["notify-pushover-text"] = defaults["notify-pushover-text"];
  config.PI_NOTIFY_CMD = defaults.PI_NOTIFY_CMD;
  config.PI_NOTIFY_SOUND_LOW_CMD = defaults.PI_NOTIFY_SOUND_LOW_CMD;
  config.PI_NOTIFY_SOUND_MID_CMD = defaults.PI_NOTIFY_SOUND_MID_CMD;
  config.PI_NOTIFY_SOUND_HIGH_CMD = defaults.PI_NOTIFY_SOUND_HIGH_CMD;
}

/**
 * @brief Formats one persisted Pushover priority for menu display.
 * @details Maps the canonical `0|1` priority domain to deterministic `Normal|High` labels reused by the Pushover configuration UI. Runtime is O(1). No external state is mutated.
 * @param[in] priority {PiNotifyPushoverPriority} Persisted Pushover priority.
 * @return {string} Menu-display label.
 * @satisfies REQ-172
 */
function formatPiNotifyPushoverPriority(priority: PiNotifyPushoverPriority): string {
  return priority === 1 ? "High" : "Normal";
}

/**
 * @brief Builds the direct Pushover rows rendered inside `Notifications`.
 * @details Serializes the global enable flag, per-event toggles, priority,
 * title, text, and credential rows into right-valued menu items appended after
 * the sound-command rows. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered direct Pushover rows.
 * @satisfies REQ-163, REQ-165, REQ-172, REQ-184, REQ-185, REQ-149
 */
function buildPiNotifyPushoverRows(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    {
      id: "notify-pushover-enabled",
      label: "Enable pushover",
      value: formatPiNotifyPushoverStatus(config),
      description: "Enable or disable all Pushover delivery globally.",
    },
    {
      id: "notify-pushover-on-end",
      label: "Toggle pushover on success",
      value: config["notify-pushover-on-end"] ? "on" : "off",
      description: "Toggle Pushover delivery for successful prompt completion.",
    },
    {
      id: "notify-pushover-on-esc",
      label: "Toggle pushover on escape",
      value: config["notify-pushover-on-esc"] ? "on" : "off",
      description: "Toggle Pushover delivery for escape-triggered prompt abortion.",
    },
    {
      id: "notify-pushover-on-error",
      label: "Toggle pushover on error",
      value: config["notify-pushover-on-error"] ? "on" : "off",
      description: "Toggle Pushover delivery for error-terminated prompt completion.",
    },
    {
      id: "notify-pushover-priority",
      label: "Pushover priority",
      value: formatPiNotifyPushoverPriority(config["notify-pushover-priority"]),
      description: "Select whether outbound Pushover messages use Normal or High priority.",
    },
    {
      id: "notify-pushover-title",
      label: "Pushover title",
      value: config["notify-pushover-title"],
      description: "Edit the title template used for outbound Pushover messages.",
    },
    {
      id: "notify-pushover-text",
      label: "Pushover text",
      value: config["notify-pushover-text"],
      description: "Edit the text template used for outbound Pushover messages.",
    },
    {
      id: "notify-pushover-user-key",
      label: "Pushover User Key/Delivery Group Key",
      value: config["notify-pushover-user-key"] || "(empty)",
      description: "Edit the Pushover user key or delivery group key used for outbound requests.",
    },
    {
      id: "notify-pushover-api-token",
      label: "Pushover Token/API Token Key",
      value: config["notify-pushover-api-token"] || "(empty)",
      description: "Edit the Pushover application token used for outbound requests.",
    },
  ];
}

/**
 * @brief Opens the shared settings-menu selector for Pushover priority.
 * @details Reuses the pi-usereq settings-menu renderer so Pushover priority selection remains stylistically aligned with the notification menus and returns the chosen priority or `undefined` on cancel. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] currentPriority {PiNotifyPushoverPriority} Persisted priority value.
 * @return {Promise<PiNotifyPushoverPriority | undefined>} Selected priority or `undefined` when cancelled.
 * @satisfies REQ-172, REQ-192
 */
async function selectPiNotifyPushoverPriority(
  ctx: ExtensionCommandContext,
  currentPriority: PiNotifyPushoverPriority,
): Promise<PiNotifyPushoverPriority | undefined> {
  const choice = await showPiUsereqSettingsMenu(ctx, "Pushover priority", [
    {
      id: "0",
      label: "Normal",
      value: currentPriority === 0 ? "selected" : "",
      description: "Send outbound Pushover messages with normal priority `0`.",
    },
    {
      id: "1",
      label: "High",
      value: currentPriority === 1 ? "selected" : "",
      description: "Send outbound Pushover messages with high priority `1`.",
    },
  ], { initialSelectedId: String(currentPriority) });
  if (!choice) {
    return undefined;
  }
  return normalizePiNotifyPushoverPriority(choice);
}

/**
 * @brief Builds the shared settings-menu choices for notification configuration.
 * @details Serializes command-notify, terminal-beep, sound, and direct
 * Pushover rows in the documented order so the shared settings-menu renderer
 * can expose one unified configuration surface. Runtime is O(1) plus
 * command-length formatting. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered notification-menu choice vector.
 * @satisfies REQ-137, REQ-149, REQ-150, REQ-151, REQ-152, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-182, REQ-183, REQ-188, REQ-189, REQ-193
 */
function buildPiNotifyMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    {
      id: "notify-enabled",
      label: "Enable notification",
      value: formatPiNotifyStatus(config),
      description: "Enable or disable command-notify delivery globally.",
    },
    {
      id: "notify-on-end",
      label: "Toggle notification on success",
      value: config["notify-on-end"] ? "on" : "off",
      description: "Toggle command-notify delivery for successful prompt completion.",
    },
    {
      id: "notify-on-esc",
      label: "Toggle notification on escape",
      value: config["notify-on-esc"] ? "on" : "off",
      description: "Toggle command-notify delivery for escape-triggered prompt abortion.",
    },
    {
      id: "notify-on-error",
      label: "Toggle notification on error",
      value: config["notify-on-error"] ? "on" : "off",
      description: "Toggle command-notify delivery for error-terminated prompt completion.",
    },
    {
      id: "notify-command",
      label: "Notify command",
      value: config.PI_NOTIFY_CMD,
      description: "Edit the shell command used for command-notify delivery.",
    },
    {
      id: "notify-beep-enabled",
      label: "Enable terminal beep",
      value: formatPiNotifyBeepStatus(config),
      description: "Enable or disable terminal-beep delivery globally.",
    },
    {
      id: "notify-beep-on-end",
      label: "Toggle terminal beep on success",
      value: config["notify-beep-on-end"] ? "on" : "off",
      description: "Toggle terminal-beep delivery for successful prompt completion.",
    },
    {
      id: "notify-beep-on-esc",
      label: "Toggle terminal beep on escape",
      value: config["notify-beep-on-esc"] ? "on" : "off",
      description: "Toggle terminal-beep delivery for escape-triggered prompt abortion.",
    },
    {
      id: "notify-beep-on-error",
      label: "Toggle terminal beep on error",
      value: config["notify-beep-on-error"] ? "on" : "off",
      description: "Toggle terminal-beep delivery for error-terminated prompt completion.",
    },
    {
      id: "selected-sound-command",
      label: "Enable sound",
      value: config["notify-sound"],
      description: "Select which sound command level is currently active.",
    },
    {
      id: "notify-sound-on-end",
      label: "Toggle sound on success",
      value: config["notify-sound-on-end"] ? "on" : "off",
      description: "Toggle sound-command delivery for successful prompt completion.",
    },
    {
      id: "notify-sound-on-esc",
      label: "Toggle sound on escape",
      value: config["notify-sound-on-esc"] ? "on" : "off",
      description: "Toggle sound-command delivery for escape-triggered prompt abortion.",
    },
    {
      id: "notify-sound-on-error",
      label: "Toggle sound on error",
      value: config["notify-sound-on-error"] ? "on" : "off",
      description: "Toggle sound-command delivery for error-terminated prompt completion.",
    },
    {
      id: "sound-toggle-hotkey-bind",
      label: "Sound toggle hotkey bind",
      value: config["notify-sound-toggle-shortcut"],
      description: "Edit the keyboard shortcut that cycles the selected sound command.",
    },
    {
      id: "sound-command-low",
      label: "Sound command (low vol.)",
      value: config.PI_NOTIFY_SOUND_LOW_CMD,
      description: "Edit the shell command used when the selected sound command is `low`.",
    },
    {
      id: "sound-command-mid",
      label: "Sound command (mid vol.)",
      value: config.PI_NOTIFY_SOUND_MID_CMD,
      description: "Edit the shell command used when the selected sound command is `mid`.",
    },
    {
      id: "sound-command-high",
      label: "Sound command (high vol.)",
      value: config.PI_NOTIFY_SOUND_HIGH_CMD,
      description: "Edit the shell command used when the selected sound command is `high`.",
    },
    ...buildPiNotifyPushoverRows(config),
    {
      id: "reset-defaults",
      label: "Reset defaults",
      value: "",
      description: "Restore the documented notification defaults for command-notify, terminal-beep, sound, and Pushover settings.",
    },
    {
      id: "save-and-close",
      label: "Save and close",
      value: "",
      description: "Return to the parent configuration menu.",
    },
  ];
}

/**
 * @brief Opens the shared settings-menu selector for the active sound level.
 * @details Reuses the pi-usereq settings-menu renderer so sound-level selection remains stylistically aligned with the notification menu and returns the chosen sound level or `undefined` on cancel. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] currentLevel {PiNotifySoundLevel} Currently selected sound level.
 * @return {Promise<PiNotifySoundLevel | undefined>} Selected sound level or `undefined` when cancelled.
 * @satisfies REQ-131, REQ-179, REQ-192
 */
async function selectPiNotifySoundLevel(
  ctx: ExtensionCommandContext,
  currentLevel: PiNotifySoundLevel,
): Promise<PiNotifySoundLevel | undefined> {
  const choice = await showPiUsereqSettingsMenu(ctx, "Enable sound", [
    {
      id: "none",
      label: "none",
      value: currentLevel === "none" ? "selected" : "",
      description: "Disable sound-command delivery while preserving per-event sound toggles.",
    },
    {
      id: "low",
      label: "low",
      value: currentLevel === "low" ? "selected" : "",
      description: "Use the low-volume sound command when sound delivery is enabled for the current event.",
    },
    {
      id: "mid",
      label: "mid",
      value: currentLevel === "mid" ? "selected" : "",
      description: "Use the mid-volume sound command when sound delivery is enabled for the current event.",
    },
    {
      id: "high",
      label: "high",
      value: currentLevel === "high" ? "selected" : "",
      description: "Use the high-volume sound command when sound delivery is enabled for the current event.",
    },
  ], { initialSelectedId: currentLevel });
  return choice ? choice as PiNotifySoundLevel : undefined;
}

/**
 * @brief Runs the interactive notification-configuration menu.
 * @details Exposes command-notify, terminal-beep, sound, and direct Pushover
 * controls through the shared settings-menu renderer while preserving row order,
 * submenu reset semantics, and row-focus retention across menu re-renders.
 * Runtime depends on user interaction count. Side effects include UI updates
 * and config mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<boolean>} `true` when the sound-toggle shortcut changed.
 * @satisfies REQ-129, REQ-131, REQ-133, REQ-134, REQ-137, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-182, REQ-183, REQ-184, REQ-188, REQ-189, REQ-192, REQ-193, REQ-195, REQ-196
 */
async function configurePiNotifyMenu(
  ctx: ExtensionCommandContext,
  config: UseReqConfig,
): Promise<boolean> {
  const originalShortcut = config["notify-sound-toggle-shortcut"];
  let focusedChoiceId: string | undefined;
  while (true) {
    const choice = await showPiUsereqSettingsMenu(
      ctx,
      "Notifications",
      buildPiNotifyMenuChoices(config),
      { initialSelectedId: focusedChoiceId },
    );
    if (!choice || choice === "save-and-close") {
      return config["notify-sound-toggle-shortcut"] !== originalShortcut;
    }
    focusedChoiceId = choice;
    if (
      choice === "notify-enabled"
      || choice === "notify-on-end"
      || choice === "notify-on-esc"
      || choice === "notify-on-error"
      || choice === "notify-beep-enabled"
      || choice === "notify-beep-on-end"
      || choice === "notify-beep-on-esc"
      || choice === "notify-beep-on-error"
      || choice === "notify-sound-on-end"
      || choice === "notify-sound-on-esc"
      || choice === "notify-sound-on-error"
      || choice === "notify-pushover-enabled"
      || choice === "notify-pushover-on-end"
      || choice === "notify-pushover-on-esc"
      || choice === "notify-pushover-on-error"
    ) {
      const enabled = togglePiNotifyFlag(config, choice as PiNotifyBooleanConfigKey);
      const labelMap: Record<string, string> = {
        "notify-enabled": "Notification",
        "notify-on-end": "Notification on success",
        "notify-on-esc": "Notification on escape",
        "notify-on-error": "Notification on error",
        "notify-beep-enabled": "Terminal beep",
        "notify-beep-on-end": "Terminal beep on success",
        "notify-beep-on-esc": "Terminal beep on escape",
        "notify-beep-on-error": "Terminal beep on error",
        "notify-sound-on-end": "Sound on success",
        "notify-sound-on-esc": "Sound on escape",
        "notify-sound-on-error": "Sound on error",
        "notify-pushover-enabled": "Pushover",
        "notify-pushover-on-end": "Pushover on success",
        "notify-pushover-on-esc": "Pushover on escape",
        "notify-pushover-on-error": "Pushover on error",
      };
      ctx.ui.notify(`${labelMap[choice]} ${enabled ? "enabled" : "disabled"}`, "info");
      continue;
    }
    if (choice === "notify-command") {
      const value = await ctx.ui.input("Notify command", config.PI_NOTIFY_CMD);
      if (value !== undefined) {
        config.PI_NOTIFY_CMD = normalizePiNotifyCommand(value, DEFAULT_PI_NOTIFY_CMD);
        ctx.ui.notify("Updated notify command", "info");
      }
      continue;
    }
    if (choice === "selected-sound-command") {
      const nextLevel = await selectPiNotifySoundLevel(ctx, config["notify-sound"]);
      if (nextLevel !== undefined) {
        config["notify-sound"] = nextLevel;
        ctx.ui.notify(`Enable sound set to ${nextLevel}`, "info");
      }
      continue;
    }
    if (choice === "sound-toggle-hotkey-bind") {
      const value = await ctx.ui.input("Sound toggle hotkey bind", config["notify-sound-toggle-shortcut"]);
      if (value?.trim()) {
        config["notify-sound-toggle-shortcut"] = value.trim();
        ctx.ui.notify(`Sound toggle hotkey bind set to ${config["notify-sound-toggle-shortcut"]}`, "info");
      }
      continue;
    }
    if (choice === "sound-command-low") {
      const value = await ctx.ui.input("Sound command (low vol.)", config.PI_NOTIFY_SOUND_LOW_CMD);
      if (value !== undefined) {
        config.PI_NOTIFY_SOUND_LOW_CMD = normalizePiNotifyCommand(
          value,
          DEFAULT_PI_NOTIFY_SOUND_LOW_CMD,
        );
        ctx.ui.notify("Updated sound command (low vol.)", "info");
      }
      continue;
    }
    if (choice === "sound-command-mid") {
      const value = await ctx.ui.input("Sound command (mid vol.)", config.PI_NOTIFY_SOUND_MID_CMD);
      if (value !== undefined) {
        config.PI_NOTIFY_SOUND_MID_CMD = normalizePiNotifyCommand(
          value,
          DEFAULT_PI_NOTIFY_SOUND_MID_CMD,
        );
        ctx.ui.notify("Updated sound command (mid vol.)", "info");
      }
      continue;
    }
    if (choice === "sound-command-high") {
      const value = await ctx.ui.input("Sound command (high vol.)", config.PI_NOTIFY_SOUND_HIGH_CMD);
      if (value !== undefined) {
        config.PI_NOTIFY_SOUND_HIGH_CMD = normalizePiNotifyCommand(
          value,
          DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD,
        );
        ctx.ui.notify("Updated sound command (high vol.)", "info");
      }
      continue;
    }
    if (choice === "notify-pushover-priority") {
      const nextPriority = await selectPiNotifyPushoverPriority(ctx, config["notify-pushover-priority"]);
      if (nextPriority !== undefined) {
        config["notify-pushover-priority"] = nextPriority;
        ctx.ui.notify(`Pushover priority set to ${formatPiNotifyPushoverPriority(nextPriority)}`, "info");
      }
      continue;
    }
    if (choice === "notify-pushover-title") {
      const value = await ctx.ui.input("Pushover title", config["notify-pushover-title"]);
      if (value !== undefined) {
        config["notify-pushover-title"] = normalizePiNotifyTemplateValue(
          value,
          DEFAULT_PI_NOTIFY_PUSHOVER_TITLE,
        );
        ctx.ui.notify("Updated Pushover title", "info");
      }
      continue;
    }
    if (choice === "notify-pushover-text") {
      const value = await ctx.ui.input("Pushover text", config["notify-pushover-text"]);
      if (value !== undefined) {
        config["notify-pushover-text"] = normalizePiNotifyTemplateValue(
          value,
          DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
        );
        ctx.ui.notify("Updated Pushover text", "info");
      }
      continue;
    }
    if (choice === "notify-pushover-user-key") {
      const value = await ctx.ui.input(
        "Pushover User Key/Delivery Group Key",
        config["notify-pushover-user-key"],
      );
      if (value !== undefined) {
        config["notify-pushover-user-key"] = normalizePiNotifyPushoverCredential(value);
        ctx.ui.notify("Updated Pushover user key", "info");
      }
      continue;
    }
    if (choice === "notify-pushover-api-token") {
      const value = await ctx.ui.input(
        "Pushover Token/API Token Key",
        config["notify-pushover-api-token"],
      );
      if (value !== undefined) {
        config["notify-pushover-api-token"] = normalizePiNotifyPushoverCredential(value);
        ctx.ui.notify("Updated Pushover API token", "info");
      }
      continue;
    }
    if (choice === "reset-defaults") {
      resetPiNotifyConfigToDefaults(config);
      ctx.ui.notify("Restored notification defaults", "info");
    }
  }
}

/**
 * @brief Registers the configurable successful-run sound shortcut when supported.
 * @details Loads the current project config, registers one raw pi shortcut when
 * the runtime exposes `registerShortcut(...)`, cycles persisted sound state on
 * invocation, saves the config, refreshes the status bar, and emits one info
 * notification. Runtime is O(1) for registration plus config I/O per shortcut
 * use. Side effects include shortcut registration, config writes, and status
 * updates.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-131, REQ-134, REQ-180
 */
function registerPiNotifyShortcut(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
): void {
  const shortcutRegistrar = pi as ExtensionAPI & PiShortcutRegistrar;
  if (typeof shortcutRegistrar.registerShortcut !== "function") {
    return;
  }
  const config = loadProjectConfig(process.cwd());
  shortcutRegistrar.registerShortcut(config["notify-sound-toggle-shortcut"], {
    description: "Cycle pi-usereq prompt-success sound level",
    handler: async (ctx) => {
      const nextConfig = loadProjectConfig(ctx.cwd);
      nextConfig["notify-sound"] = cyclePiNotifySoundLevel(nextConfig["notify-sound"]);
      saveProjectConfig(ctx.cwd, nextConfig);
      setPiUsereqStatusConfig(statusController, nextConfig);
      renderPiUsereqStatus(statusController, ctx);
      ctx.ui.notify(`pi-usereq sound:${nextConfig["notify-sound"]}`, "info");
    },
  });
}

/**
 * @brief Registers bundled prompt commands with the extension.
 * @details Creates one `req-<prompt>` command per bundled prompt name. Each handler ensures resources exist, records the prompt metadata needed for successful completion notifications, renders the prompt, and sends it into the current active session. Runtime is O(p) for registration; handler cost depends on prompt rendering plus prompt dispatch. Side effects include command registration, status-controller mutation, and user-message delivery during execution.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-004, REQ-067, REQ-068, REQ-169
 */
function registerPromptCommands(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
): void {
  PROMPT_NAMES.forEach((promptName) => {
    pi.registerCommand(`req-${promptName}`, {
      description: `Run pi-usereq prompt ${promptName}`,
      handler: async (args, ctx) => {
        ensureBundledResourcesAccessible();
        const projectBase = getProjectBase(ctx.cwd);
        const config = loadProjectConfig(ctx.cwd);
        statusController.state.pendingPromptRequest = {
          promptName,
          promptArgs: args,
        };
        const content = renderPrompt(promptName, args, projectBase, config);
        await deliverPromptCommand(pi, content);
      },
    });
  });
}


/**
 * @brief Registers pi-usereq agent tools exposed to the model.
 * @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-045, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-100, REQ-101, REQ-102
 */
function registerAgentTools(pi: ExtensionAPI): void {
  const gitPathSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with result and execution. Result exposes path_value and path_present for the cwd-derived runtime git root.",
    },
  );
  pi.registerTool({
    name: "git-path",
    label: "git-path",
    description: "Scope: current runtime path. Return a token-optimized JSON payload with result and execution sections. Result exposes the resolved `git-path` value through direct-access fields without request echoes.",
    promptSnippet: "Return the structured runtime git-root payload for the current project.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived runtime path context.",
      "Output contract: result + execution. Result exposes path_value and path_present.",
      "Behavior contract: git-path is derived at runtime from the current working directory and repository ancestry rules.",
      "Failure contract: configuration-loading failures surface through execution.code and execution.stderr_lines.",
    ],
    parameters: gitPathSchema,
    async execute() {
      ensureBundledResourcesAccessible();
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGitPath(projectBase, config);
      const payload = buildPathQueryToolPayload(
        "git-path",
        process.cwd(),
        projectBase,
        result.stdout.trimEnd(),
        buildToolExecutionSection(result),
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const basePathSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with result and execution. Result exposes path_value and path_present for the cwd-derived runtime base path.",
    },
  );
  pi.registerTool({
    name: "get-base-path",
    label: "get-base-path",
    description: "Scope: current runtime path. Return a token-optimized JSON payload with result and execution sections. Result exposes the resolved `base-path` value through direct-access fields without request echoes.",
    promptSnippet: "Return the structured runtime project-base payload.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived runtime path context.",
      "Output contract: result + execution. Result exposes path_value and path_present.",
      "Behavior contract: base-path equals the current working directory used by the extension command or tool.",
      "Failure contract: configuration-loading failures surface through execution.code and execution.stderr_lines.",
    ],
    parameters: basePathSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGetBasePath(projectBase, config);
      const payload = buildPathQueryToolPayload(
        "get-base-path",
        process.cwd(),
        projectBase,
        result.stdout.trimEnd(),
        buildToolExecutionSection(result),
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const filesReferencesSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
    },
    {
      description: "Input contract: files[]. Output contract: JSON object with summary, repository, files, and execution. File entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, standalone comments, and structured status facts. Missing or unsupported inputs become skipped entries. The tool fails when no source file can be analyzed.",
    },
  );
  const multiFileSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit file list preserved in caller order" },
      ),
    },
    {
      description: "Input contract: files[]. Output contract: JSON object with summary, files, and execution. File entries expose canonical paths, detected language, configured checker modules, selection status, and error facts.",
    },
  );
  const filesTokensSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute file path resolved from the current working directory when not already absolute" }),
        { description: "Input file list preserved in caller order" },
      ),
    },
    {
      description: "Input contract: files[]. Output contract: JSON object with summary, files, and execution. File entries expose direct-access facts, token metrics, and optional heading or Doxygen metadata. Missing or non-file inputs become skipped entries. The tool fails when no processable files remain.",
    },
  );

  pi.registerTool({
    name: "files-tokens",
    label: "files-tokens",
    description: "Scope: explicit files. Return a token-optimized JSON payload with summary, files, and execution sections. File entries expose direct-access path facts, status, size metrics, and optional heading or Doxygen metadata.",
    promptSnippet: "Return the structured token-analysis payload for caller-selected files.",
    promptGuidelines: [
      "Scope: explicit files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: summary + files + execution. File entries expose canonical paths, absolute paths, existence, file status, line range, line count, byte count, character count, token count, shares, and optional primary-heading or Doxygen file metadata.",
      "Numeric contract: counts, sizes, shares, and line ranges remain in dedicated numeric fields; static request metadata and derived guidance are omitted from runtime responses.",
      "Behavior contract: missing or non-file inputs become skipped entries; read failures become error entries; the tool fails only when no processable files remain.",
    ],
    parameters: filesTokensSchema,
    async execute(_toolCallId, params) {
      const payload = buildTokenToolPayload({
        toolName: "files-tokens",
        scope: "explicit-files",
        baseDir: process.cwd(),
        requestedPaths: params.files,
        encodingName: TOKEN_COUNTER_ENCODING,
      });
      return buildTokenToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "files-references",
    label: "files-references",
    description: "Scope: explicit source files. Return a token-optimized JSON payload with summary, repository, files, and execution sections. File entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, standalone comments, and structured status facts.",
    promptSnippet: "Return the structured references payload for caller-selected source files.",
    promptGuidelines: [
      "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: summary + repository + files + execution. File entries expose canonical paths, absolute paths, file status, line counts, line ranges, imports, symbols, child relationships, standalone comments, and structured Doxygen metadata.",
      "Numeric contract: line counts, line ranges, symbol counts, import counts, comment counts, and Doxygen counts remain in dedicated numeric fields; text is limited to residual comment or signature content that cannot be split safely.",
      "Behavior contract: missing inputs, non-file inputs, and unsupported extensions become structured skipped entries; analysis failures become structured error entries; the tool fails only when no source file can be analyzed.",
    ],
    parameters: filesReferencesSchema,
    async execute(_toolCallId, params) {
      const payload = buildReferenceToolPayload({
        toolName: "files-references",
        scope: "explicit-files",
        baseDir: process.cwd(),
        requestedPaths: params.files,
      });
      return buildReferenceToolExecuteResult(payload);
    },
  });

  const filesCompressSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `compressed_source_text` and `compressed_lines[].display_text` include original source line-number prefixes" })),
    },
    {
      description: "Input contract: files[] plus optional enableLineNumbers. Output contract: JSON object with summary, repository, files, and execution. File entries expose path identifiers, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts. Missing, unsupported, or invalid inputs become structured skipped entries. The tool fails when no file is compressed.",
    },
  );

  pi.registerTool({
    name: "files-compress",
    label: "files-compress",
    description: "Scope: explicit files. Return a token-optimized JSON payload with summary, repository, files, and execution sections. File entries expose canonical paths, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts.",
    promptSnippet: "Return the structured compression payload for caller-selected source files.",
    promptGuidelines: [
      "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: summary + repository + files + execution. File entries expose canonical paths, absolute paths, line_number_mode, source line counts, source line ranges, compressed line counts, removed line counts, compressed_lines, compressed_source_text, symbols, and file_doxygen.",
      "Line-number behavior: enableLineNumbers changes only rendered display strings; numeric source_line_number facts remain dedicated fields on compressed_lines for direct access.",
      "Behavior contract: missing inputs, non-file inputs, and unsupported extensions become structured skipped entries; compression failures become structured error entries; symbol-analysis failures retain compressed output with symbol_analysis_status=error; the tool fails only when no file is compressed.",
    ],
    parameters: filesCompressSchema,
    async execute(_toolCallId, params) {
      const payload = buildCompressToolPayload({
        toolName: "files-compress",
        scope: "explicit-files",
        baseDir: process.cwd(),
        requestedPaths: params.files,
        includeLineNumbers: params.enableLineNumbers ?? false,
      });
      return buildCompressionToolExecuteResult(payload);
    },
  });

  const filesFindSchema = Type.Object(
    {
      tag: Type.String({ description: "Pipe-separated construct-tag filter applied case-insensitively; unsupported tags are ignored" }),
      pattern: Type.String({ description: "JavaScript RegExp applied to construct names only; use ^...$ for exact-name matching" }),
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `code_lines[].display_text` and `stripped_source_text` include original source line-number prefixes" })),
    },
    {
      description: buildFindToolSchemaDescription("explicit-files"),
    },
  );

  pi.registerTool({
    name: "files-find",
    label: "files-find",
    description: "Scope: explicit source files. Return a token-optimized JSON payload with summary, repository, files, and execution sections. File entries expose structured statuses and match records with typed location, symbol, stripped-code, and Doxygen facts.",
    promptSnippet: "Return the structured construct-search payload for caller-selected source files.",
    promptGuidelines: buildFindToolPromptGuidelines("explicit-files"),
    parameters: filesFindSchema,
    async execute(_toolCallId, params) {
      const payload = buildFindToolPayload({
        toolName: "files-find",
        scope: "explicit-files",
        baseDir: process.cwd(),
        tagFilter: params.tag,
        pattern: params.pattern,
        requestedPaths: params.files,
        includeLineNumbers: params.enableLineNumbers ?? false,
      });
      return buildFindToolExecuteResult(payload);
    },
  });

  const referencesSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured src-dir list resolved from the current project configuration. Output contract: JSON object with summary, repository, files, and execution. Repository exposes the structured directory tree; file entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, and status facts. The tool fails when no configured source file can be analyzed.",
    },
  );
  const tokensSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured docs-dir plus canonical docs REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md. Output contract: same token-optimized JSON shape as files-tokens. Missing canonical docs become skipped entries. The tool fails when no processable canonical docs remain.",
    },
  );

  pi.registerTool({
    name: "references",
    label: "references",
    description: "Scope: configured project source directories. Return a token-optimized JSON payload with summary, repository, files, and execution sections. The repository section exposes the structured directory tree; file entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, standalone comments, and status facts.",
    promptSnippet: "Return the structured project references payload from the configured source directories.",
    promptGuidelines: [
      "Scope: no params; resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.",
      "Output contract: summary + repository + files + execution. Repository exposes source_directory_paths, file_canonical_paths, and directory_tree; file entries expose canonical paths, line counts, line ranges, imports, symbols, hierarchy, standalone comments, and structured Doxygen metadata.",
      "Configuration contract: output changes with cwd-derived project config, src-dir values, and repository source discovery; the tool does not accept explicit file overrides.",
      "Behavior contract: configured source files are analyzed in deterministic order, analysis failures become structured error entries, and the tool fails when no configured source file can be analyzed.",
    ],
    parameters: referencesSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const payload = buildReferenceToolPayload({
        toolName: "references",
        scope: "configured-source-directories",
        baseDir: projectBase,
        requestedPaths: collectSourceFiles(config["src-dir"], projectBase),
        sourceDirectoryPaths: config["src-dir"],
      });
      return buildReferenceToolExecuteResult(payload);
    },
  });

  const compressSchema = Type.Object(
    {
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `compressed_source_text` and `compressed_lines[].display_text` include original source line-number prefixes" })),
    },
    {
      description: "Input contract: optional enableLineNumbers boolean. Scope is the configured src-dir list resolved from the current project configuration. Output contract: JSON object with summary, repository, files, and execution. File entries expose path identifiers, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts. The tool fails when no configured source file is compressed.",
    },
  );

  pi.registerTool({
    name: "compress",
    label: "compress",
    description: "Scope: configured project source directories. Return a token-optimized JSON payload with summary, repository, files, and execution sections. File entries expose canonical paths, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts.",
    promptSnippet: "Return the structured project compression payload from the configured source directories.",
    promptGuidelines: [
      "Scope: resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.",
      "Output contract: summary + repository + files + execution. Repository exposes source_directory_paths and file_canonical_paths; file entries expose line_number_mode, source line counts, source line ranges, compressed line counts, removed line counts, compressed_lines, compressed_source_text, symbols, and file_doxygen.",
      "Configuration contract: output changes with cwd-derived project config, src-dir values, and repository source discovery; the tool does not accept explicit file overrides.",
      "Behavior contract: configured source files are processed in deterministic order, compression failures become structured error entries, symbol-analysis failures retain compressed output with symbol_analysis_status=error, and the tool fails only when no configured source file is compressed.",
    ],
    parameters: compressSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const sourceFiles = collectSourceFiles(config["src-dir"], projectBase);
      const payload = buildCompressToolPayload({
        toolName: "compress",
        scope: "configured-source-directories",
        baseDir: projectBase,
        requestedPaths: sourceFiles,
        includeLineNumbers: params.enableLineNumbers ?? false,
        sourceDirectoryPaths: config["src-dir"],
      });
      return buildCompressionToolExecuteResult(payload);
    },
  });

  const findSchema = Type.Object(
    {
      tag: Type.String({ description: "Pipe-separated construct-tag filter applied case-insensitively; unsupported tags are ignored" }),
      pattern: Type.String({ description: "JavaScript RegExp applied to construct names only; use ^...$ for exact-name matching" }),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `code_lines[].display_text` and `stripped_source_text` include original source line-number prefixes" })),
    },
    {
      description: buildFindToolSchemaDescription("configured-source-directories"),
    },
  );

  pi.registerTool({
    name: "find",
    label: "find",
    description: "Scope: configured project source directories. Return a token-optimized JSON payload with summary, repository, files, and execution sections. File entries expose structured statuses and match records with typed location, symbol, stripped-code, and Doxygen facts.",
    promptSnippet: "Return the structured construct-search payload from the configured source directories.",
    promptGuidelines: buildFindToolPromptGuidelines("configured-source-directories"),
    parameters: findSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const sourceFiles = collectSourceFiles(config["src-dir"], projectBase);
      const payload = buildFindToolPayload({
        toolName: "find",
        scope: "configured-source-directories",
        baseDir: projectBase,
        tagFilter: params.tag,
        pattern: params.pattern,
        requestedPaths: sourceFiles,
        includeLineNumbers: params.enableLineNumbers ?? false,
        sourceDirectoryPaths: config["src-dir"],
      });
      return buildFindToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "tokens",
    label: "tokens",
    description: "Scope: canonical docs from the configured docs-dir. Return the same token-optimized JSON contract as files-tokens, omitting canonical-doc request echoes from runtime responses.",
    promptSnippet: "Return the structured token-analysis payload for canonical documentation files.",
    promptGuidelines: [
      "Scope: no params; resolve docs-dir from project config; target canonical docs REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md.",
      "Output contract: summary + files + execution. Static docs-dir and canonical-doc selection facts remain documented in registration metadata; file entries expose direct-access path facts, line ranges, sizes, token metrics, and optional metadata.",
      "Numeric contract: counts, sizes, shares, and line ranges remain in dedicated numeric fields; derived guidance is omitted from runtime responses to reduce token cost.",
      "Behavior contract: missing canonical docs become skipped entries; read failures become error entries; the tool fails only when no processable canonical docs remain.",
    ],
    parameters: tokensSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const docsDir = config["docs-dir"].replace(/[/\\]+$/, "");
      const canonicalDocNames = ["REQUIREMENTS.md", "WORKFLOW.md", "REFERENCES.md"];
      const payload = buildTokenToolPayload({
        toolName: "tokens",
        scope: "canonical-docs",
        baseDir: projectBase,
        requestedPaths: canonicalDocNames.map((name) => path.join(docsDir, name)),
        docsDir,
        canonicalDocNames,
        encodingName: TOKEN_COUNTER_ENCODING,
      });
      return buildTokenToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "files-static-check",
    label: "files-static-check",
    description: "Scope: explicit files. Return a token-optimized JSON payload with summary, files, and execution sections. File entries expose canonical paths, detected language, configured checker modules, selection status, and stable error facts.",
    promptSnippet: "Return the structured explicit-file static-check payload for the current project configuration.",
    promptGuidelines: [
      "Input contract: files[]. Scope is explicit caller-selected files resolved from the current working directory.",
      "Output contract: summary + files + execution. File entries expose canonical_path, language_name, configured_checker_modules, status, and error_message.",
      "Configuration contract: checker selection is derived from the cwd-resolved static-check configuration and file extensions only.",
      "Failure contract: execution.code mirrors aggregated checker failures; execution.stdout_lines and execution.stderr_lines preserve residual checker diagnostics.",
    ],
    parameters: multiFileSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const staticCheckConfig = config["static-check"] ?? {};
      const result = runFilesStaticCheck(params.files, projectBase, config);
      const payload = buildStaticCheckToolPayload(
        "files-static-check",
        "explicit-files",
        projectBase,
        params.files,
        [],
        [],
        staticCheckConfig,
        buildToolExecutionSection(result),
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const staticCheckSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured src-dir plus tests-dir selection after fixture exclusion. Output contract: JSON object with summary, files, and execution.",
    },
  );
  pi.registerTool({
    name: "static-check",
    label: "static-check",
    description: "Scope: configured source and test directories. Return a token-optimized JSON payload with summary, files, and execution sections. File entries expose selected-path facts, checker coverage, selection status, and residual diagnostics metadata.",
    promptSnippet: "Return the structured project static-check payload for the current configuration.",
    promptGuidelines: [
      "Input contract: no params. Scope is src-dir plus tests-dir from the cwd-derived project configuration.",
      "Output contract: summary + files + execution. Selection-directory rules remain documented in registration metadata; file entries expose configured_checker_modules and status.",
      "Selection contract: tests/fixtures and <tests-dir>/fixtures are excluded before checker dispatch.",
      "Failure contract: execution.code mirrors aggregated checker failures or selection failures; execution.stderr_lines preserve residual diagnostics.",
    ],
    parameters: staticCheckSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const staticCheckConfig = config["static-check"] ?? {};
      const selectionDirectoryPaths = [...config["src-dir"], config["tests-dir"]];
      const testsDirRel = makeRelativeIfContainsProject(config["tests-dir"], projectBase)
        .split(path.sep)
        .join("/")
        .replace(/^\.?\/?/, "")
        .replace(/\/+$/, "");
      const excludedDirectoryPaths = [...new Set([
        "tests/fixtures",
        testsDirRel ? `${testsDirRel}/fixtures` : "fixtures",
      ])];
      let selectedPaths: string[] = [];
      let execution;
      try {
        selectedPaths = collectProjectStaticCheckSelection(projectBase, config).selectedPaths;
        execution = buildToolExecutionSection(runProjectStaticCheck(projectBase, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildStaticCheckToolPayload(
        "static-check",
        "configured-source-and-test-directories",
        projectBase,
        selectedPaths,
        selectionDirectoryPaths,
        excludedDirectoryPaths,
        staticCheckConfig,
        execution,
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitCheckSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with result and execution. Result exposes git-path presence plus aggregate repository status fields.",
    },
  );
  pi.registerTool({
    name: "git-check",
    label: "git-check",
    description: "Scope: current runtime path. Return a token-optimized JSON payload with result and execution sections. Result exposes repository validation status through direct fields without request echoes.",
    promptSnippet: "Return the structured git-validation payload for the runtime repository.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived runtime path context.",
      "Output contract: result + execution. Result exposes git_path_present and aggregate status.",
      "Behavior contract: the tool checks work-tree membership, porcelain cleanliness, and symbolic-or-detached HEAD validity.",
      "Failure contract: execution.code and execution.stderr_lines surface git-path or repository-state errors.",
    ],
    parameters: gitCheckSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      let execution;
      try {
        execution = buildToolExecutionSection(runGitCheck(projectBase, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildGitCheckToolPayload(projectBase, resolveRuntimeGitPath(projectBase), execution);
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const docsCheckSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with summary, files, and execution. File entries expose canonical paths, prompt_command remediation, and presence status for canonical docs.",
    },
  );
  pi.registerTool({
    name: "docs-check",
    label: "docs-check",
    description: "Scope: canonical docs. Return a token-optimized JSON payload with summary, files, and execution sections. File entries expose remediation prompt commands and direct presence facts for REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md.",
    promptSnippet: "Return the structured canonical-document validation payload.",
    promptGuidelines: [
      "Input contract: no params. Scope is docs-dir from the cwd-derived project configuration.",
      "Output contract: summary + files + execution. File entries expose file_name, canonical_path, prompt_command, and status.",
      "Specialization trigger: remediation differs per missing canonical file through prompt_command.",
      "Failure contract: execution.code is non-zero when any canonical document is missing; execution.stderr_lines enumerate missing files.",
    ],
    parameters: docsCheckSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const payload = buildDocsCheckToolPayload(projectBase, config["docs-dir"]);
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitWtNameSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with result and execution. Result exposes worktree_name when generation succeeds.",
    },
  );
  pi.registerTool({
    name: "git-wt-name",
    label: "git-wt-name",
    description: "Scope: current runtime path. Return a token-optimized JSON payload with result and execution sections. Result exposes the generated worktree name while static naming rules remain in registration metadata.",
    promptSnippet: "Return the structured worktree-name generation payload.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived runtime path context.",
      "Output contract: result + execution. Result exposes worktree_name.",
      "Behavior contract: generation follows useReq-<project>-<sanitized-branch>-<YYYYMMDDHHMMSS>.",
      "Failure contract: execution.code and execution.stderr_lines surface git-path or branch-resolution errors.",
    ],
    parameters: gitWtNameSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      let execution;
      try {
        execution = buildToolExecutionSection(runGitWtName(projectBase, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildWorktreeNameToolPayload(projectBase, resolveRuntimeGitPath(projectBase), execution);
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitWtCreateSchema = Type.Object(
    {
      wtName: Type.String({ description: "Exact target worktree name and branch name" }),
    },
    {
      description: "Input contract: wtName. Output contract: JSON object with result and execution. Result exposes worktree_name and derived worktree_path.",
    },
  );
  pi.registerTool({
    name: "git-wt-create",
    label: "git-wt-create",
    description: "Scope: current runtime path. Return a token-optimized JSON payload with result and execution sections. Result exposes the exact worktree name and derived path without static operation echoes.",
    promptSnippet: "Return the structured worktree-creation payload for the requested name.",
    promptGuidelines: [
      "Input contract: wtName is required and must match the exact worktree/branch name to create.",
      "Output contract: result + execution. Result exposes worktree_name and worktree_path.",
      "Specialization trigger: worktree_path depends on the runtime git root parent directory.",
      "Failure contract: execution.code and execution.stderr_lines surface invalid-name, git, or finalization errors.",
    ],
    parameters: gitWtCreateSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      let execution;
      try {
        execution = buildToolExecutionSection(runGitWtCreate(projectBase, params.wtName, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildWorktreeMutationToolPayload(
        "git-wt-create",
        projectBase,
        resolveRuntimeGitPath(projectBase),
        params.wtName,
        execution,
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitWtDeleteSchema = Type.Object(
    {
      wtName: Type.String({ description: "Exact target worktree name and branch name" }),
    },
    {
      description: "Input contract: wtName. Output contract: JSON object with result and execution. Result exposes worktree_name and derived worktree_path.",
    },
  );
  pi.registerTool({
    name: "git-wt-delete",
    label: "git-wt-delete",
    description: "Scope: current runtime path. Return a token-optimized JSON payload with result and execution sections. Result exposes the exact worktree name and derived path without static operation echoes.",
    promptSnippet: "Return the structured worktree-deletion payload for the requested name.",
    promptGuidelines: [
      "Input contract: wtName is required and must match the exact worktree/branch name to delete.",
      "Output contract: result + execution. Result exposes worktree_name and worktree_path.",
      "Specialization trigger: worktree_path depends on the runtime git root parent directory.",
      "Failure contract: execution.code and execution.stderr_lines surface missing-target or deletion errors.",
    ],
    parameters: gitWtDeleteSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      let execution;
      try {
        execution = buildToolExecutionSection(runGitWtDelete(projectBase, params.wtName, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildWorktreeMutationToolPayload(
        "git-wt-delete",
        projectBase,
        resolveRuntimeGitPath(projectBase),
        params.wtName,
        execution,
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });
}

/**
 * @brief Builds the shared settings-menu choices for startup-tool management.
 * @details Serializes startup-tool actions into right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(t) in configurable-tool count. No external state is mutated.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered startup-tool menu choices.
 * @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193
 */
function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const tools = getPiUsereqStartupTools(pi);
  return [
    {
      id: "show-tool-status",
      label: "Show tool status",
      value: `${getConfiguredEnabledPiUsereqTools(config).length}/${tools.length} enabled`,
      description: "Open the full startup-tool reference report in the editor.",
    },
    {
      id: "toggle-tool",
      label: "Toggle tool",
      value: `${getConfiguredEnabledPiUsereqTools(config).length} enabled`,
      description: "Open the per-tool toggle menu for configurable startup tools.",
    },
    {
      id: "enable-all-tools",
      label: "Enable all configurable tools",
      value: `${tools.length} targets`,
      description: "Enable every configurable startup tool for future session starts.",
    },
    {
      id: "disable-all-tools",
      label: "Disable all configurable tools",
      value: `${tools.length} targets`,
      description: "Disable every configurable startup tool for future session starts.",
    },
    {
      id: "reset-defaults",
      label: "Reset defaults",
      value: `${normalizeEnabledPiUsereqTools(undefined).length} defaults`,
      description: "Restore the documented default startup-tool selection.",
    },
    {
      id: "save-and-close",
      label: "Save and close",
      value: "",
      description: "Return to the parent configuration menu.",
    },
  ];
}

/**
 * @brief Builds the shared settings-menu choices for per-tool startup toggles.
 * @details Exposes every configurable startup tool as one row whose right-side value reports the current enabled state. Runtime is O(t) in configurable-tool count. No external state is mutated.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered per-tool toggle choices.
 * @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154
 */
function buildPiUsereqToolToggleChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  return [
    ...getPiUsereqStartupTools(pi).map((tool) => ({
      id: tool.name,
      label: tool.name,
      value: enabledTools.has(tool.name) ? "on" : "off",
      description: tool.description ?? `Toggle startup activation for ${tool.name}.`,
    })),
    {
      id: "back",
      label: "Back",
      value: "",
      description: "Return to the startup-tools menu.",
    },
  ];
}

/**
 * @brief Runs the interactive active-tool configuration menu.
 * @details Synchronizes runtime active tools with persisted config, renders startup-tool actions through the shared settings-menu UI, and updates configuration state in response to selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<void>} Promise resolved when the menu closes.
 * @satisfies REQ-007, REQ-063, REQ-064, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193
 */
async function configurePiUsereqToolsMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void> {
  applyConfiguredPiUsereqTools(pi, config);
  let focusedChoiceId: string | undefined;
  while (true) {
    const tools = getPiUsereqStartupTools(pi);
    const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
    const choice = await showPiUsereqSettingsMenu(ctx, "Enable tools", buildPiUsereqToolsMenuChoices(pi, config), {
      initialSelectedId: focusedChoiceId,
    });

    if (!choice || choice === "save-and-close") {
      return;
    }
    focusedChoiceId = choice;

    if (choice === "show-tool-status") {
      ctx.ui.setEditorText(renderPiUsereqToolsReference(pi, config));
      continue;
    }

    if (choice === "enable-all-tools") {
      setConfiguredPiUsereqTools(pi, config, tools.map((tool) => tool.name));
      ctx.ui.notify("Enabled all configurable active tools", "info");
      continue;
    }

    if (choice === "disable-all-tools") {
      setConfiguredPiUsereqTools(pi, config, []);
      ctx.ui.notify("Disabled all configurable active tools", "info");
      continue;
    }

    if (choice === "reset-defaults") {
      setConfiguredPiUsereqTools(pi, config, normalizeEnabledPiUsereqTools(undefined));
      ctx.ui.notify("Restored default configurable active tools", "info");
      continue;
    }

    if (choice === "toggle-tool") {
      const selectedToolName = await showPiUsereqSettingsMenu(ctx, "toggle startup tool", buildPiUsereqToolToggleChoices(pi, config));
      if (!selectedToolName || selectedToolName === "back") {
        continue;
      }
      if (enabledTools.has(selectedToolName)) {
        enabledTools.delete(selectedToolName);
      } else {
        enabledTools.add(selectedToolName);
      }
      setConfiguredPiUsereqTools(pi, config, tools.map((tool) => tool.name).filter((toolName) => enabledTools.has(toolName)));
      ctx.ui.notify(
        `${enabledTools.has(selectedToolName) ? "Enabled" : "Disabled"} ${selectedToolName}`,
        "info",
      );
    }
  }
}

/**
 * @brief Formats one static-check configuration entry for UI display.
 * @details Renders command-backed entries as `Command(cmd args...)` and all other modules as `Module(args...)`. Runtime is O(n) in parameter count. No side effects occur.
 * @param[in] entry {StaticCheckEntry} Static-check configuration entry.
 * @return {string} Human-readable entry summary.
 */
function formatStaticCheckEntry(entry: StaticCheckEntry): string {
  const params = Array.isArray(entry.params) && entry.params.length > 0 ? ` ${entry.params.join(" ")}` : "";
  if (entry.module === "Command") {
    return `${entry.module}(${entry.cmd ?? "?"}${params})`;
  }
  return `${entry.module}${params ? `(${entry.params!.join(" ")})` : ""}`;
}

/**
 * @brief Summarizes configured static-check languages.
 * @details Keeps only languages with at least one configured checker, sorts them, and emits a compact `Language (count)` list. Runtime is O(l log l). No side effects occur.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Compact summary string or `(none)`.
 */
function formatStaticCheckLanguagesSummary(config: UseReqConfig): string {
  const languages = Object.entries(config["static-check"])
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([language, entries]) => `${language} (${entries.length})`);
  return languages.join(", ") || "(none)";
}

/**
 * @brief Renders the static-check configuration reference view.
 * @details Produces a markdown-like summary containing configured entries, supported languages, the Command-only user module surface, and canonical example specifications. Runtime is O(l log l). No side effects occur.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Reference text for the editor view.
 */
function renderStaticCheckReference(config: UseReqConfig): string {
  const lines = ["# Static-check configuration", "", `Configured languages: ${formatStaticCheckLanguagesSummary(config)}`, ""];
  const configuredLanguages = Object.entries(config["static-check"])
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  if (configuredLanguages.length === 0) {
    lines.push("Configured entries: (none)");
  } else {
    lines.push("Configured entries:");
    for (const [language, entries] of configuredLanguages) {
      lines.push(`- ${language}: ${(entries as StaticCheckEntry[]).map(formatStaticCheckEntry).join(", ")}`);
    }
  }

  lines.push("", "Supported languages:");
  for (const { language, extensions } of getSupportedStaticCheckLanguageSupport()) {
    lines.push(`- ${language}: ${extensions.join(", ")}`);
  }
  lines.push(
    "",
    `Supported modules: ${STATIC_CHECK_MODULES.join(", ")}`,
    "",
    "Examples:",
    "- Python=Command,mypy,--strict",
    "- TypeScript=Command,eslint,--max-warnings,0",
  );
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Builds the shared settings-menu choices for static-check management.
 * @details Serializes Command-oriented static-check actions into right-valued menu rows consumed by the shared settings-menu renderer while omitting user-facing module selection. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered static-check menu choices.
 * @satisfies REQ-008, REQ-160, REQ-161, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193
 */
function buildStaticCheckMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const supportedLanguageCount = getSupportedStaticCheckLanguageSupport().length;
  const configuredLanguageCount = Object.values(config["static-check"]).filter((entries) => entries.length > 0).length;
  return [
    {
      id: "add-entry-supported-language",
      label: "Add entry for supported language",
      value: `${supportedLanguageCount} languages`,
      description: "Select a supported language, then configure the Command static-check executable.",
    },
    {
      id: "add-entry-raw-spec",
      label: "Add entry from LANG=MODULE[,CMD[,PARAM...]]",
      value: "raw spec",
      description: "Enter one raw Command-based static-check specification string in canonical CLI format.",
    },
    {
      id: "remove-language-entry",
      label: "Remove language entry",
      value: configuredLanguageCount > 0 ? `${configuredLanguageCount} configured` : "(none)",
      description: "Remove every configured static-check entry for one language.",
    },
    {
      id: "show-supported-languages",
      label: "Show supported languages",
      value: `${supportedLanguageCount} languages`,
      description: "Open the static-check reference report in the editor.",
    },
    {
      id: "reset-defaults",
      label: "Reset defaults",
      value: configuredLanguageCount > 0 ? `${configuredLanguageCount} configured` : "(none)",
      description: "Remove every configured static-check entry and restore the default empty static-check configuration.",
    },
    {
      id: "save-and-close",
      label: "Save and close",
      value: "",
      description: "Return to the parent configuration menu.",
    },
  ];
}

/**
 * @brief Builds the shared settings-menu choices for supported static-check languages.
 * @details Exposes every supported language as one row whose right-side value reports extensions plus the current configured checker count for Command-oriented configuration flows. Runtime is O(l log l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered language-choice vector.
 */
function buildSupportedStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    ...getSupportedStaticCheckLanguageSupport().map(({ language, extensions }) => {
      const configuredCount = config["static-check"][language]?.length ?? 0;
      const suffix = configuredCount === 1 ? "checker" : "checkers";
      return {
        id: language,
        label: language,
        value: `${extensions.join(", ")} • ${configuredCount} ${suffix}`,
        description: `Configure the Command static-check entry for ${language}. Supported extensions: ${extensions.join(", ")}.`,
      };
    }),
    {
      id: "back",
      label: "Back",
      value: "",
      description: "Return to the static-check menu.",
    },
  ];
}

/**
 * @brief Builds the shared settings-menu choices for configured static-check languages.
 * @details Exposes only languages that currently have at least one configured checker so removal remains deterministic. Runtime is O(l log l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered configured-language vector.
 */
function buildConfiguredStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    ...getSupportedStaticCheckLanguageSupport()
      .filter(({ language }) => (config["static-check"][language] ?? []).length > 0)
      .map(({ language, extensions }) => ({
        id: language,
        label: language,
        value: `${extensions.join(", ")} • ${config["static-check"][language]!.length} configured`,
        description: `Remove every configured static-check entry for ${language}.`,
      })),
    {
      id: "back",
      label: "Back",
      value: "",
      description: "Return to the static-check menu.",
    },
  ];
}

/**
 * @brief Runs the interactive static-check configuration menu.
 * @details Lets the user inspect support, add Command entries by guided prompts or raw spec strings, and remove configured language entries through the shared settings-menu renderer until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<void>} Promise resolved when the menu closes.
 * @satisfies REQ-008, REQ-160, REQ-161, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193, REQ-195
 */
async function configureStaticCheckMenu(ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void> {
  let focusedChoiceId: string | undefined;
  while (true) {
    const staticChoice = await showPiUsereqSettingsMenu(ctx, "Static code checkers", buildStaticCheckMenuChoices(config), {
      initialSelectedId: focusedChoiceId,
    });

    if (!staticChoice || staticChoice === "save-and-close") {
      return;
    }
    focusedChoiceId = staticChoice;

    if (staticChoice === "show-supported-languages") {
      ctx.ui.setEditorText(renderStaticCheckReference(config));
      continue;
    }

    if (staticChoice === "add-entry-supported-language") {
      const selectedLanguage = await showPiUsereqSettingsMenu(ctx, "static-check language", buildSupportedStaticCheckLanguageChoices(config));
      if (!selectedLanguage || selectedLanguage === "back") {
        continue;
      }

      const cmd = await ctx.ui.input(`Command executable for ${selectedLanguage}`, "");
      if (!cmd?.trim()) {
        ctx.ui.notify(`Command executable is required for ${selectedLanguage}`, "error");
        continue;
      }

      const entry: StaticCheckEntry = { module: "Command", cmd: cmd.trim() };
      const paramsInput = await ctx.ui.input(
        `Additional parameters for Command on ${selectedLanguage} (optional, shell-style)`,
        "",
      );
      const params = paramsInput?.trim() ? shellSplit(paramsInput.trim()) : [];
      if (params.length > 0) {
        entry.params = params;
      }

      config["static-check"][selectedLanguage] ??= [];
      config["static-check"][selectedLanguage]!.push(entry);
      ctx.ui.notify(`Added ${entry.module} checker for ${selectedLanguage}`, "info");
      continue;
    }

    if (staticChoice === "add-entry-raw-spec") {
      const spec = await ctx.ui.input("Static-check spec", "Python=Command,true");
      if (!spec?.trim()) {
        continue;
      }
      try {
        const [canonicalLang, entry] = parseEnableStaticCheck(spec.trim());
        config["static-check"][canonicalLang] ??= [];
        config["static-check"][canonicalLang]!.push(entry);
        ctx.ui.notify(`Added ${entry.module} checker for ${canonicalLang}`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
      continue;
    }

    if (staticChoice === "remove-language-entry") {
      const configuredLanguage = await showPiUsereqSettingsMenu(ctx, "Remove static code checker language", buildConfiguredStaticCheckLanguageChoices(config));
      if (!configuredLanguage || configuredLanguage === "back") {
        continue;
      }
      delete config["static-check"][configuredLanguage];
      ctx.ui.notify(`Removed static-check entries for ${configuredLanguage}`, "info");
      continue;
    }
    if (staticChoice === "reset-defaults") {
      config["static-check"] = {};
      ctx.ui.notify("Restored default static code checker configuration", "info");
    }
  }
}

/**
 * @brief Builds the shared settings-menu choices for the top-level pi-usereq configuration UI.
 * @details Serializes primary configuration actions into right-valued menu rows consumed by the shared settings-menu renderer, including the display-only config path beside `show-config`. Runtime is O(s) in source-directory count. No external state is mutated.
 * @param[in] cwd {string} Current working directory.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered top-level menu choices.
 * @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-162, REQ-190, REQ-191
 */
function buildPiUsereqMenuChoices(
  cwd: string,
  config: UseReqConfig,
): PiUsereqSettingsMenuChoice[] {
  return [
    {
      id: "docs-dir",
      label: "Document directory",
      value: config["docs-dir"],
      description: "Edit the repository-relative directory that stores REQUIREMENTS, WORKFLOW, and REFERENCES documents.",
    },
    {
      id: "src-dir",
      label: "Source-code directories",
      value: config["src-dir"].join(", "),
      description: "Manage the repository-relative source directories scanned by project-scope tools.",
    },
    {
      id: "tests-dir",
      label: "Unit tests directory",
      value: config["tests-dir"],
      description: "Edit the repository-relative directory used for project test assets and static-check selection.",
    },
    {
      id: "static-check",
      label: "Static code checkers",
      value: formatStaticCheckLanguagesSummary(config),
      description: "Manage configured static-check entries and inspect supported languages and modules.",
    },
    {
      id: "startup-tools",
      label: "Enable tools",
      value: `${getConfiguredEnabledPiUsereqTools(config).length} enabled`,
      description: "Manage which configurable tools become active during session_start.",
    },
    {
      id: "notifications",
      label: "Notifications",
      value: `notification:${formatPiNotifyStatus(config)} • beep:${formatPiNotifyBeepStatus(config)} • sound:${config["notify-sound"]} • pushover:${formatPiNotifyPushoverStatus(config)}`,
      description: "Manage command-notify, terminal-beep, sound, and direct Pushover settings in one unified menu.",
    },
    {
      id: "show-config",
      label: "Show configuration",
      value: formatProjectConfigPathForMenu(cwd),
      valueTone: "dim",
      description: "Write the current project configuration JSON into the editor without saving additional changes.",
    },
    {
      id: "reset-defaults",
      label: "Reset defaults",
      value: "",
      description: "Restore the default pi-usereq configuration for the current project base.",
    },
    {
      id: "save-and-close",
      label: "Save and close",
      value: "",
      description: "Persist the current configuration and return to the normal pi session UI.",
    },
  ];
}

/**
 * @brief Builds the shared settings-menu choices for source-directory management.
 * @details Exposes add and remove actions for `src-dir` entries through right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(s) in source-directory count. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered source-directory management choices.
 * @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193
 */
function buildSrcDirMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    {
      id: "add-src-dir-entry",
      label: "Add source-code directory",
      value: `${config["src-dir"].length} configured`,
      description: "Append one repository-relative source directory to the current configuration.",
    },
    {
      id: "remove-src-dir-entry",
      label: "Remove source-code directory",
      value: config["src-dir"].join(", "),
      description: "Select one configured source directory to remove from the current configuration.",
    },
    {
      id: "reset-defaults",
      label: "Reset defaults",
      value: `${DEFAULT_SRC_DIRS.join(", ")}`,
      description: "Restore the documented default source-directory configuration.",
    },
    {
      id: "save-and-close",
      label: "Save and close",
      value: "",
      description: "Return to the parent configuration menu.",
    },
  ];
}

/**
 * @brief Builds the shared settings-menu choices for removing one source-directory entry.
 * @details Exposes every configured `src-dir` entry as one removable row and appends a `Back` action for cancellation. Runtime is O(s) in source-directory count. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered removable source-directory choices.
 * @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154
 */
function buildSrcDirRemovalChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    ...config["src-dir"].map((entry) => ({
      id: entry,
      label: entry,
      value: "remove",
      description: `Remove the source-directory entry ${entry} from the current configuration.`,
    })),
    {
      id: "back",
      label: "Back",
      value: "",
      description: "Return to the source-directory menu.",
    },
  ];
}

/**
 * @brief Runs the top-level pi-usereq configuration menu.
 * @details Loads project config, exposes docs/test/source/static-check/startup-tool/notification actions through the shared settings-menu renderer, persists changes on exit, and refreshes the single-line status bar. Runtime depends on user interaction count. Side effects include UI updates, config writes, active-tool changes, and editor text updates.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
 * @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-162, REQ-190, REQ-191, REQ-192, REQ-194, REQ-195
 */
async function configurePiUsereq(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  statusController: PiUsereqStatusController,
): Promise<void> {
  let config = loadProjectConfig(ctx.cwd);
  const projectBase = getProjectBase(ctx.cwd);
  const initialShortcut = config["notify-sound-toggle-shortcut"];
  const ensureSaved = () => saveProjectConfig(ctx.cwd, config);
  const refreshStatus = () => {
    setPiUsereqStatusConfig(statusController, config);
    renderPiUsereqStatus(statusController, ctx);
  };

  let focusedChoiceId: string | undefined;
  while (true) {
    const choice = await showPiUsereqSettingsMenu(
      ctx,
      "pi-usereq",
      buildPiUsereqMenuChoices(ctx.cwd, config),
      { initialSelectedId: focusedChoiceId },
    );
    if (!choice || choice === "save-and-close") {
      ensureSaved();
      refreshStatus();
      if (config["notify-sound-toggle-shortcut"] !== initialShortcut) {
        ctx.ui.notify("Sound toggle hotkey bind updated; run /reload to apply the new binding", "info");
      }
      return;
    }
    focusedChoiceId = choice;
    if (choice === "docs-dir") {
      const value = await ctx.ui.input("Document directory", config["docs-dir"]);
      if (value?.trim()) config["docs-dir"] = value.trim();
      continue;
    }
    if (choice === "tests-dir") {
      const value = await ctx.ui.input("Unit tests directory", config["tests-dir"]);
      if (value?.trim()) config["tests-dir"] = value.trim();
      continue;
    }
    if (choice === "src-dir") {
      let srcFocusedChoiceId: string | undefined;
      while (true) {
        const srcAction = await showPiUsereqSettingsMenu(ctx, "Source-code directories", buildSrcDirMenuChoices(config), {
          initialSelectedId: srcFocusedChoiceId,
        });
        if (!srcAction || srcAction === "save-and-close") {
          break;
        }
        srcFocusedChoiceId = srcAction;
        if (srcAction === "add-src-dir-entry") {
          const value = await ctx.ui.input("New source-code directory", "src");
          if (value?.trim()) {
            config["src-dir"] = [...config["src-dir"], value.trim()];
          }
          continue;
        }
        if (srcAction === "remove-src-dir-entry") {
          const toRemove = await showPiUsereqSettingsMenu(ctx, "Remove source-code directory", buildSrcDirRemovalChoices(config));
          if (toRemove && toRemove !== "back") {
            config["src-dir"] = config["src-dir"].filter((entry) => entry !== toRemove);
            if (config["src-dir"].length === 0) {
              config["src-dir"] = ["src"];
            }
          }
          continue;
        }
        if (srcAction === "reset-defaults") {
          config["src-dir"] = [...DEFAULT_SRC_DIRS];
          ctx.ui.notify("Restored default source-code directories", "info");
        }
      }
      continue;
    }
    if (choice === "static-check") {
      await configureStaticCheckMenu(ctx, config);
      continue;
    }
    if (choice === "startup-tools") {
      await configurePiUsereqToolsMenu(pi, ctx, config);
      continue;
    }
    if (choice === "notifications") {
      await configurePiNotifyMenu(ctx, config);
      continue;
    }
    if (choice === "reset-defaults") {
      config = getDefaultConfig(projectBase);
      applyConfiguredPiUsereqTools(pi, config);
      ctx.ui.notify("Restored all default configuration values", "info");
      continue;
    }
    if (choice === "show-config") {
      ctx.ui.setEditorText(`${JSON.stringify(config, null, 2)}\n`);
      continue;
    }
  }
}

/**
 * @brief Registers configuration-management commands.
 * @details Adds the interactive `pi-usereq` configuration command only; the config-viewer action is now exposed exclusively inside that menu. Runtime is O(1) for registration. Side effects include command registration.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-006, REQ-031
 */
function registerConfigCommands(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
): void {
  pi.registerCommand("pi-usereq", {
    description: "Open the pi-usereq configuration menu",
    handler: async (_args, ctx) => {
      await configurePiUsereq(pi, ctx, statusController);
    },
  });
}

/**
 * @brief Registers the complete pi-usereq extension.
 * @details Validates installation-owned bundled resources, registers prompt and
 * configuration commands plus agent tools, registers the configurable
 * successful-run sound shortcut when the runtime supports shortcuts, and
 * installs shared wrappers for all supported pi lifecycle hooks so status
 * telemetry, context usage, prompt timing, cumulative runtime, prompt-specific
 * Pushover metadata, and pi-notify effects remain synchronized with runtime
 * events. Runtime is O(h) in hook
 * count during registration. Side effects include filesystem reads,
 * command/tool/shortcut registration, UI updates, active-tool changes, and
 * timer scheduling.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-045, REQ-067, REQ-068, REQ-109, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118, REQ-119, REQ-120, REQ-121, REQ-122, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-134, REQ-137, REQ-148, REQ-159, REQ-163, REQ-164, REQ-165, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-174, REQ-179, REQ-180, REQ-184, REQ-188, REQ-189, REQ-190, REQ-191, REQ-192, REQ-193, REQ-194, REQ-195, REQ-196
 */
export default function piUsereqExtension(pi: ExtensionAPI): void {
  const statusController = createPiUsereqStatusController();
  ensureBundledResourcesAccessible();
  registerPromptCommands(pi, statusController);
  registerAgentTools(pi);
  registerConfigCommands(pi, statusController);
  registerPiNotifyShortcut(pi, statusController);
  registerExtensionStatusHooks(pi, statusController);
}
