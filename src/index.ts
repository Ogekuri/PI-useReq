/**
 * @file
 * @brief Registers the pi-usereq extension commands, tools, and configuration UI.
 * @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.
 */

/**
 * @brief Declares the extension version string.
 * @details The value is exported for external inspection and packaging metadata alignment. Access complexity is O(1).
 */
export const VERSION = "0.11.0";

import fs from "node:fs";
import path from "node:path";
import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolInfo,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  buildMonolithicToolExecuteResult,
  normalizeToolFailure,
} from "./core/agent-tool-json.js";
import type { FindToolScope } from "./core/find-payload.js";
import {
  DEFAULT_GIT_WORKTREE_PREFIX,
  DEFAULT_SRC_DIRS,
  createStaticCheckLanguageConfig,
  getDefaultConfig,
  getDefaultStaticCheckConfig,
  getProjectConfigPath,
  loadConfig,
  normalizeConfigPaths,
  resolveEffectiveGitWorktreeEnabled,
  saveConfig,
  type StaticCheckEntry,
  type StaticCheckLanguageConfig,
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
  formatPiNotifyControlSequenceText,
  formatPiNotifyPushoverStatus,
  formatPiNotifyStatus,
  hasPiNotifyPushoverCredentials,
  normalizePiNotifyCommand,
  normalizePiNotifyPushoverCredential,
  normalizePiNotifyPushoverPriority,
  normalizePiNotifyTemplateValue,
  parsePiNotifyControlSequenceText,
  runPiNotifyEffects,
  type PiNotifyEventRequest,
  type PiNotifyPushoverPriority,
  type PiNotifySoundLevel,
} from "./core/pi-notify.js";
import {
  bootstrapRuntimePathState,
  formatRuntimePathForDisplay,
  getRuntimeBasePath,
  getRuntimeContextPath,
  setRuntimeGitPath,
} from "./core/path-context.js";
import { showPiUsereqSettingsMenu, type PiUsereqSettingsMenuChoice } from "./core/settings-menu.js";
import {
  comparePiUsereqStartupToolNames,
  PI_USEREQ_CUSTOM_TOOL_NAMES,
  PI_USEREQ_EMBEDDED_TOOL_NAMES,
  PI_USEREQ_STARTUP_TOOL_SET,
  isPiUsereqEmbeddedToolName,
  normalizeEnabledPiUsereqTools,
  type PiUsereqStartupToolName,
} from "./core/pi-usereq-tools.js";
import { renderPrompt } from "./core/prompts.js";
import {
  abortPromptCommandExecution,
  activatePromptCommandExecution,
  classifyPromptCommandOutcome,
  finalizePromptCommandExecution,
  getPromptCommandErrorContext,
  preparePromptCommandExecution,
  restorePromptCommandExecution,
  type PromptCommandExecutionPlan,
} from "./core/prompt-command-runtime.js";
import {
  DEBUG_PROMPT_NAMES,
  DEBUG_WORKFLOW_STATES,
  DEFAULT_DEBUG_LOG_FILE,
  DEFAULT_DEBUG_LOG_ON_STATUS,
  DEFAULT_DEBUG_STATUS_CHANGES,
  DEFAULT_DEBUG_WORKFLOW_EVENTS,
  logDebugPromptEvent,
  logDebugPromptWorkflowEvent,
  logDebugToolExecution,
  normalizeDebugEnabledPrompts,
  normalizeDebugEnabledTools,
  normalizeDebugLogFile,
  normalizeDebugLogOnStatus,
  normalizeDebugStatusChanges,
  normalizeDebugWorkflowEvents,
  shouldLogDebugPromptWorkflowState,
  type DebugLogOnStatus,
  type DebugWorkflowState,
} from "./core/debug-runtime.js";
import { PROMPT_COMMAND_NAMES } from "./core/prompt-command-catalog.js";
import { resolveRuntimeGitPath } from "./core/runtime-project-paths.js";
import {
  readPersistedPromptCommandRuntimeState,
  writePersistedPromptCommandRuntimeState,
} from "./core/prompt-command-state.js";
import { ensureBundledResourcesAccessible, readBundledPromptDescription } from "./core/resources.js";
import { ReqError } from "./core/errors.js";
import {
  PI_USEREQ_STATUS_HOOK_NAMES,
  createPiUsereqStatusController,
  disposePiUsereqStatusController,
  getPiUsereqRuntimeSoundLevel,
  isStaleExtensionContextError,
  renderPiUsereqStatus,
  setPiUsereqRuntimeSoundLevel,
  setPiUsereqStatusConfig,
  setPiUsereqWorkflowState,
  shouldPreservePromptCommandStateOnShutdown,
  updateExtensionStatus,
  type PiUsereqStatusController,
  type PiUsereqStatusHookName,
} from "./core/extension-status.js";
import {
  runCompress,
  runFilesCompress,
  runFilesSearch,
  runFilesStaticCheck,
  runFilesSummarize,
  runFilesTokens,
  runProjectStaticCheck,
  runSearch,
  runSummarize,
  runTokens,
  type ToolResult,
} from "./core/tool-runner.js";
import { LANGUAGE_TAGS } from "./core/find-constructs.js";
import {
  getSupportedStaticCheckLanguageSupport,
} from "./core/static-check.js";
import { makeRelativeIfContainsProject, shellSplit } from "./core/utils.js";

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
  const runtimeBasePath = getRuntimeBasePath(cwd);
  if (fs.existsSync(runtimeBasePath)) {
    return runtimeBasePath;
  }
  bootstrapRuntimePathState(cwd, {
    gitPath: resolveRuntimeGitPath(cwd),
  });
  return getRuntimeBasePath(cwd);
}

/**
 * @brief Resolves a safe process working directory for extension-load paths.
 * @details Returns `process.cwd()` when available and falls back to absolute `PWD`, `HOME`, or `/` when the current shell directory has been deleted. Runtime is O(1). No external state is mutated.
 * @return {string} Absolute fallback-safe process working directory.
 */
function getProcessCwdSafe(): string {
  try {
    return process.cwd();
  } catch {
    const fallbackCwd = process.env.PWD ?? process.env.HOME ?? path.sep;
    return path.isAbsolute(fallbackCwd)
      ? fallbackCwd
      : path.resolve(path.sep, fallbackCwd);
  }
}

/**
 * @brief Resolves the live working directory used for bootstrap-sensitive flows.
 * @details Prefers the supplied cwd when it still exists. Otherwise reuses the tracked runtime context path when it remains live, then the tracked runtime base path, and finally a process-safe cwd so deleted worktree paths retained by stale contexts cannot poison later prompt preflight or lifecycle bootstrap. Runtime is O(1) plus bounded filesystem probes. No external state is mutated.
 * @param[in] cwd {string} Candidate context cwd.
 * @return {string} Existing absolute cwd used for bootstrap work.
 */
function resolveLiveBootstrapCwd(cwd: string): string {
  const normalizedCwd = path.resolve(cwd);
  if (fs.existsSync(normalizedCwd)) {
    return normalizedCwd;
  }
  const processCwd = getProcessCwdSafe();
  const runtimeContextPath = getRuntimeContextPath(processCwd);
  if (fs.existsSync(runtimeContextPath)) {
    return runtimeContextPath;
  }
  const runtimeBasePath = getRuntimeBasePath(processCwd);
  return fs.existsSync(runtimeBasePath) ? runtimeBasePath : processCwd;
}

/**
 * @brief Best-effort synchronizes one context `cwd` mirror with bootstrap reality.
 * @details Applies the resolved live cwd to the supplied context when writable and ignores stale or read-only mirrors so command bootstrap can continue using authoritative filesystem probes. Runtime is O(1). Side effects are limited to optional `ctx.cwd` mutation.
 * @param[in,out] ctx {{ cwd?: string }} Mutable context-like object.
 * @param[in] cwd {string} Resolved live cwd.
 * @return {void} No return value.
 */
function syncContextCwdMirror(ctx: { cwd?: string }, cwd: string): void {
  if (ctx.cwd === cwd) {
    return;
  }
  try {
    Reflect.set(ctx, "cwd", cwd);
  } catch {
    // Ignore stale or read-only context mirrors.
  }
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
 * @details Resolves `<base-path>/.pi-usereq.json` from the cwd-derived project base, reuses the shared runtime-path formatter, and rewrites a leading POSIX `$HOME` token to `~` for the `Show configuration` row only. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] cwd {string} Current working directory.
 * @return {string} `~`-relative or absolute config path display value.
 * @satisfies REQ-162
 */
function formatProjectConfigPathForMenu(cwd: string): string {
  return formatRuntimePathForDisplay(
    getProjectConfigPath(getProjectBase(cwd)),
  );
}

/**
 * @brief Builds the standardized terminal rows appended to every configuration menu.
 * @details Returns the canonical value-less `Reset defaults` row so all configuration menus and descendant selector menus share the same terminal ordering contract without rendering `Save and close`. Runtime is O(1). No external state is mutated.
 * @param[in] options {{ resetDefaultsDescription: string }} Menu-specific terminal-row metadata.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered terminal menu rows.
 * @satisfies REQ-193
 */
function buildTerminalSettingsMenuChoices(options: {
  resetDefaultsDescription: string;
}): PiUsereqSettingsMenuChoice[] {
  return [
    {
      id: "reset-defaults",
      label: "Reset defaults",
      value: "",
      description: options.resetDefaultsDescription,
    },
  ];
}

/**
 * @brief Describes one pending reset value change shown in confirmation menus.
 * @details Stores the row label plus its previous and next values so reset-confirmation submenus can expose machine-readable and human-verifiable change previews. The interface is compile-time only and introduces no runtime cost.
 */
interface ResetConfirmationChange {
  label: string;
  previousValue: string;
  nextValue: string;
}

/**
 * @brief Formats one reset-confirmation value pair for menu display.
 * @details Serializes the previous and next values into a deterministic `previous -> next` preview string used by confirmation submenus. Runtime is O(n) in combined value length. No external state is mutated.
 * @param[in] previousValue {string} Current persisted value.
 * @param[in] nextValue {string} Candidate default value.
 * @return {string} Rendered preview string.
 */
function formatResetConfirmationValue(previousValue: string, nextValue: string): string {
  return `${previousValue} -> ${nextValue}`;
}

/**
 * @brief Builds the shared settings-menu choices for one reset-confirmation submenu.
 * @details Renders each pending changed value as a disabled preview row, appends explicit approve and abort actions, and falls back to one disabled no-op row when no values would change. Runtime is O(n) in changed-value count. No external state is mutated.
 * @param[in] changes {ResetConfirmationChange[]} Changed-value preview rows.
 * @param[in] approveDescription {string} Description for the approve action.
 * @param[in] abortDescription {string} Description for the abort action.
 * @return {PiUsereqSettingsMenuChoice[]} Reset-confirmation submenu choices.
 */
function buildResetConfirmationChoices(
  changes: ResetConfirmationChange[],
  approveDescription: string,
  abortDescription: string,
): PiUsereqSettingsMenuChoice[] {
  const previewRows = changes.length > 0
    ? changes.map((change, index) => ({
      id: `reset-preview:${index}`,
      label: change.label,
      value: formatResetConfirmationValue(change.previousValue, change.nextValue),
      description: `Reset ${change.label} from ${change.previousValue} to ${change.nextValue}.`,
      disabled: true,
      labelTone: "dim" as const,
      valueTone: "dim" as const,
    }))
    : [{
      id: "reset-preview:none",
      label: "No value changes",
      value: "unchanged",
      description: "Approving the reset leaves the current values unchanged.",
      disabled: true,
      labelTone: "dim" as const,
      valueTone: "dim" as const,
    }];
  return [
    ...previewRows,
    {
      id: "reset-approve",
      label: "Approve reset",
      value: `${changes.length} changes`,
      description: approveDescription,
    },
    {
      id: "reset-abort",
      label: "Abort reset",
      value: "keep current",
      description: abortDescription,
    },
  ];
}

/**
 * @brief Opens one explicit reset-confirmation submenu.
 * @details Uses the shared settings-menu renderer to show every changed value before reset application and returns `true` only when the user selects the explicit approval action. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] title {string} Confirmation submenu title.
 * @param[in] changes {ResetConfirmationChange[]} Changed-value preview rows.
 * @param[in] approveDescription {string} Description for the approve action.
 * @param[in] abortDescription {string} Description for the abort action.
 * @return {Promise<boolean>} `true` when the reset is explicitly approved.
 */
async function confirmResetChanges(
  ctx: ExtensionCommandContext,
  title: string,
  changes: ResetConfirmationChange[],
  approveDescription: string,
  abortDescription: string,
): Promise<boolean> {
  const choice = await showPiUsereqSettingsMenu(
    ctx,
    title,
    buildResetConfirmationChoices(changes, approveDescription, abortDescription),
  );
  return choice === "reset-approve";
}

/**
 * @brief Writes the already-persisted project configuration file text into the editor.
 * @details Reads the current `.pi-usereq.json` file content from disk after the caller has saved any pending configuration changes and forwards that exact persisted text into the editor. Runtime is O(n) in serialized config size. Side effects include filesystem reads and editor-text mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] cwd {string} Current working directory.
 * @param[in] _config {UseReqConfig} Unused effective project configuration retained for stable call-site shape.
 * @return {void} No return value.
 * @satisfies REQ-031
 */
function writePersistedProjectConfigToEditor(
  ctx: ExtensionCommandContext,
  cwd: string,
  _config: UseReqConfig,
): void {
  const projectBase = getProjectBase(cwd);
  ctx.ui.setEditorText(fs.readFileSync(getProjectConfigPath(projectBase), "utf8"));
}

/**
 * @brief Maps search-tool language identifiers to stable registration labels.
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
 * @brief Defines the stable language order used by search-tool supported-tag guidance.
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
 * @brief Builds the supported-tag guidance lines embedded in search-tool registrations.
 * @details Emits one deterministic line per supported language containing its canonical registration label and sorted tag list so downstream agents can specialize requests without invoking the tool first. Runtime is O(l * t log t). No side effects occur.
 * @return {string[]} Supported-tag guidance lines.
 */
function buildSearchToolSupportedTagGuidelines(): string[] {
  return FIND_TOOL_LANGUAGE_ORDER
    .filter((language) => language in LANGUAGE_TAGS)
    .map((language) => `Supported tags [${FIND_TOOL_LANGUAGE_LABELS[language]}]: ${[...LANGUAGE_TAGS[language]!].sort().join(", ")}`);
}

/**
 * @brief Builds the schema description for one search-tool registration.
 * @details Specializes the explicit-file and configured-directory input contracts while documenting the monolithic markdown output channel and minimal execution details shape. Runtime is O(1). No side effects occur.
 * @param[in] scope {FindToolScope} Search-tool scope.
 * @return {string} Parameter-schema description.
 */
function buildSearchToolSchemaDescription(scope: FindToolScope): string {
  const inputContract = scope === "explicit-files"
    ? "Input contract: tag + pattern + files[] + optional enableLineNumbers."
    : "Input contract: tag + pattern + optional enableLineNumbers. Scope is the configured src-dir list resolved from the current project configuration.";
  return `${inputContract} Output contract: monolithic markdown in content[0].text plus details.execution diagnostics. Regex matches construct names only.`;
}

/**
 * @brief Builds the prompt-guideline set for one search-tool registration.
 * @details Encodes scope selection, monolithic markdown output semantics, regex semantics, line-number behavior, tag-filter rules, and the full language-to-tag matrix as stable agent-oriented strings. Runtime is O(l * t log t). No side effects occur.
 * @param[in] scope {FindToolScope} Search-tool scope.
 * @return {string[]} Prompt-guideline strings.
 */
function buildSearchToolPromptGuidelines(scope: FindToolScope): string[] {
  const scopeLine = scope === "explicit-files"
    ? "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute."
    : "Scope: resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.";
  return [
    scopeLine,
    "Output contract: monolithic markdown in content[0].text; details.execution preserves only exit code and residual diagnostics.",
    "Regex rule: pattern is applied to construct names only with JavaScript RegExp search semantics; it never matches construct bodies; use ^...$ for exact-name matching.",
    "Tag rule: tag is pipe-separated and case-insensitive; unsupported tags are ignored.",
    "Line-number behavior: enableLineNumbers toggles original source line prefixes inside fenced code blocks.",
    "Failure contract: invalid tag filters, invalid regex patterns, unsupported extensions, unsupported tag-language combinations, no-match files, and analysis failures surface through details.execution diagnostics.",
    ...buildSearchToolSupportedTagGuidelines(),
  ];
}

/**
 * @brief Describes the monolithic tool-result surface consumed by tool-row renderers.
 * @details Narrows execute-result data to the primary text content block plus the minimal `details.execution` metadata returned by monolithic tool wrappers. The alias is compile-time only and introduces no runtime cost.
 */
type MonolithicToolRenderResult = {
  content?: Array<{ type?: string; text?: string }>;
  details?: {
    execution?: {
      code?: number;
      stderr_lines?: string[];
      stderr?: string;
    };
  };
};

/**
 * @brief Extracts the primary monolithic text block from one tool result.
 * @details Returns the first text content block when present and falls back to an empty string when the tool emitted no LLM-facing content. Runtime is O(1). No external state is mutated.
 * @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
 * @return {string} Primary monolithic content text.
 */
function getMonolithicToolText(result: MonolithicToolRenderResult): string {
  const firstBlock = result.content?.find((entry) => entry?.type === "text" && typeof entry.text === "string");
  return typeof firstBlock?.text === "string" ? firstBlock.text : "";
}

/**
 * @brief Reads the first residual execution error string from one monolithic tool result.
 * @details Prefers the first `stderr_lines` entry when present and otherwise falls back to the first line of `stderr`. Runtime is O(1) plus first-line split cost. No external state is mutated.
 * @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
 * @return {string | undefined} First residual execution error string.
 */
function getMonolithicToolErrorText(result: MonolithicToolRenderResult): string | undefined {
  const stderrLines = result.details?.execution?.stderr_lines;
  if (Array.isArray(stderrLines) && stderrLines.length > 0 && typeof stderrLines[0] === "string") {
    return stderrLines[0];
  }
  const stderrText = result.details?.execution?.stderr;
  if (typeof stderrText !== "string" || stderrText === "") {
    return undefined;
  }
  return stderrText.split(/\r?\n/)[0] || undefined;
}

/**
 * @brief Formats one scalar or structural tool argument for compact render summaries.
 * @details Truncates long strings, compresses arrays into short previews, and renders plain object arguments as key indexes so collapsed tool rows stay compact while still exposing the essential invocation shape. Runtime is O(n) in preview size. No external state is mutated.
 * @param[in] value {unknown} Candidate tool argument value.
 * @return {string | undefined} Compact preview string or `undefined` when the value carries no useful summary.
 */
function formatCompactToolArgumentValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const compactText = value.length > 28 ? `${value.slice(0, 25)}...` : value;
    return JSON.stringify(compactText);
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }
    const renderedItems = value
      .slice(0, 2)
      .map((item) => formatCompactToolArgumentValue(item))
      .filter((item): item is string => typeof item === "string");
    if (renderedItems.length === 0) {
      return `[${value.length}]`;
    }
    return value.length <= 2
      ? `[${renderedItems.join(", ")}]`
      : `[${renderedItems.join(", ")}, ...+${value.length - 2}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) {
      return undefined;
    }
    return keys.length <= 2
      ? `{${keys.join(",")}}`
      : `{${keys.slice(0, 2).join(",")},...+${keys.length - 2}}`;
  }
  return undefined;
}

/**
 * @brief Builds the compact invocation summary appended to collapsed tool rows.
 * @details Renders only caller-supplied parameters that have stable, non-empty compact previews and joins them in insertion order so agents can infer how the tool was used without expanding the full result. Runtime is O(n) in argument count and preview size. No external state is mutated.
 * @param[in] args {Record<string, unknown> | undefined} Current tool call arguments.
 * @return {string} Compact invocation summary prefixed with one separating space, or the empty string when no useful preview exists.
 */
function buildCompactToolInvocationText(args: Record<string, unknown> | undefined): string {
  if (!args) {
    return "";
  }
  const entries = Object.entries(args)
    .map(([key, value]) => {
      const renderedValue = formatCompactToolArgumentValue(value);
      return renderedValue === undefined ? undefined : `${key}=${renderedValue}`;
    })
    .filter((entry): entry is string => typeof entry === "string");
  return entries.length === 0 ? "" : ` ${entries.join(" · ")}`;
}

/**
 * @brief Builds the compact default text for one monolithic tool result row.
 * @details Prefers the tool name, compact invocation preview, and success marker for collapsed rows, and falls back to residual execution diagnostics when the tool failed before completing successfully. Runtime is O(n) in compact argument-preview size. No external state is mutated.
 * @param[in] toolName {string} Registered tool name.
 * @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
 * @param[in] args {Record<string, unknown> | undefined} Current tool call arguments.
 * @return {string} Compact single-line summary.
 */
function summarizeStructuredToolResult(
  toolName: string,
  result: MonolithicToolRenderResult,
  args?: Record<string, unknown>,
): string {
  const success = result.details?.execution?.code === undefined
    ? true
    : result.details.execution.code === 0;
  const prefix = success ? "✓" : "✗";
  const invocationText = buildCompactToolInvocationText(args);
  const errorText = getMonolithicToolErrorText(result);
  if (!success && errorText) {
    return `${prefix} ${toolName}${invocationText}: ${errorText}`;
  }
  return `${prefix} ${toolName}${invocationText}`;
}

/**
 * @brief Builds a custom `renderResult` implementation for one monolithic tool.
 * @details Reuses a mutable `Text` component when possible, keeps the default collapsed row compact with essential invocation parameters plus result status, and reveals the full monolithic content only when the tool row is expanded. Runtime is O(n) in expanded content length and compact argument-preview size. No external state is mutated.
 * @param[in] toolName {string} Registered tool name.
 * @return {(result: MonolithicToolRenderResult, options: { expanded?: boolean; isPartial?: boolean }, _theme: unknown, context: { args?: Record<string, unknown>; lastComponent?: unknown }) => Text} Custom result renderer.
 * @satisfies REQ-210
 */
function buildStructuredToolRenderResult(toolName: string) {
  return (
    result: MonolithicToolRenderResult,
    options: { expanded?: boolean; isPartial?: boolean },
    _theme: unknown,
    context: { args?: Record<string, unknown>; lastComponent?: unknown },
  ): Text => {
    const textComponent = context.lastComponent instanceof Text
      ? context.lastComponent
      : new Text("", 0, 0);
    if (options.isPartial) {
      textComponent.setText(`… ${toolName}`);
      return textComponent;
    }
    const compactText = summarizeStructuredToolResult(toolName, result, context.args);
    const fullText = getMonolithicToolText(result);
    textComponent.setText(options.expanded && fullText !== "" ? fullText : compactText);
    return textComponent;
  };
}

/**
 * @brief Executes one CLI-style runner for a monolithic agent tool.
 * @details Reuses the standalone tool-runner contract, normalizes thrown failures into `ToolResult`, and wraps the selected stdout or stderr text into the monolithic content channel. Runtime is dominated by the delegated runner. Side effects depend on the selected tool.
 * @param[in] operation {() => ToolResult} Runner callback.
 * @return {ReturnType<typeof buildMonolithicToolExecuteResult>} Monolithic tool execute result.
 */
function executeMonolithicTool(operation: () => ToolResult): ReturnType<typeof buildMonolithicToolExecuteResult> {
  try {
    return buildMonolithicToolExecuteResult(operation());
  } catch (error) {
    return buildMonolithicToolExecuteResult(normalizeToolFailure(error));
  }
}

/**
 * @brief Starts delivery of one rendered prompt into the current active session.
 * @details Prefers the replacement-session `sendUserMessage(...)` helper exposed by `withSession(...)` callbacks after session replacement so post-switch prompt delivery never reuses stale pre-switch session-bound extension objects. Returns the underlying delivery promise without awaiting it so callers can record the `running` workflow transition as soon as prompt handoff is accepted instead of waiting for the full agent turn to complete on runtimes whose async replacement-session helpers resolve only after `agent_end`. When pi later invalidates that replacement-session context during successful prompt-end restoration, the helper suppresses the documented stale-extension-context rejection because the prompt was already accepted and late rethrow would surface a false orchestration failure. Falls back to `pi.sendUserMessage(...)` only for non-replacement flows or runtimes that do not expose replacement-session helpers. Runtime is O(n) in prompt length. Side effects are limited to user-message delivery.
 * @param[in] pi {ExtensionAPI} Handler-scoped extension API instance retained as the fallback dispatcher.
 * @param[in] content {string} Rendered prompt markdown.
 * @param[in] context {unknown} Optional replacement-session helper context.
 * @return {Promise<void>} Promise representing eventual prompt-delivery completion.
 * @satisfies REQ-004, REQ-067, REQ-068, REQ-227, REQ-281
 */
function deliverPromptCommand(
  pi: ExtensionAPI,
  content: string,
  context?: unknown,
): Promise<void> {
  const replacementContext = context as {
    sendUserMessage?: (message: string) => Promise<void> | void;
  } | undefined;
  if (typeof replacementContext?.sendUserMessage === "function") {
    return Promise.resolve(replacementContext.sendUserMessage(content)).catch((error) => {
      if (isStaleExtensionContextError(error)) {
        return;
      }
      throw error;
    });
  }
  pi.sendUserMessage(content);
  return Promise.resolve();
}

/**
 * @brief Detects prompt-delivery failures that can be ignored after prompt ownership has moved past the command handler.
 * @details Matches the documented stale-extension-context runtime error once prompt ownership has already moved beyond command-side preflight. The helper treats the failure as ignorable when the persisted prompt runtime state shows the same execution session as the active prompt run or when the persisted workflow state has already advanced beyond `checking|running`, because rethrowing at that point would incorrectly re-enter command-side abort logic after the prompt was already accepted. Runtime is O(n) in error-message length plus path length. No external state is mutated.
 * @param[in] error {unknown} Candidate prompt-delivery failure.
 * @param[in] workflowState {import("./core/extension-status.js").PiUsereqWorkflowState} Current shared prompt workflow state.
 * @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Prepared execution plan for the current prompt command.
 * @return {boolean} `true` when the failure is a late stale-context delivery rejection that MUST be ignored.
 * @satisfies REQ-208, REQ-280, REQ-281, REQ-282
 */
function shouldIgnoreLatePromptDeliveryFailure(
  error: unknown,
  workflowState: import("./core/extension-status.js").PiUsereqWorkflowState,
  executionPlan?: PromptCommandExecutionPlan,
): boolean {
  const persistedRuntimeState = readPersistedPromptCommandRuntimeState();
  const effectiveWorkflowState = persistedRuntimeState.workflowState || workflowState;
  const activeExecutionSessionFile = persistedRuntimeState.activePromptRequest?.executionSessionFile;
  const promptRunAlreadyActive = executionPlan !== undefined
    && typeof activeExecutionSessionFile === "string"
    && path.resolve(activeExecutionSessionFile) === path.resolve(executionPlan.executionSessionFile);
  return isStaleExtensionContextError(error)
    && (
      promptRunAlreadyActive
      || (effectiveWorkflowState !== "checking" && effectiveWorkflowState !== "running")
    );
}

/**
 * @brief Appends one workflow-state debug entry for a bundled prompt when selected.
 * @details Reuses the shared debug logger so `req-*` command handlers and prompt-end orchestration can record deterministic workflow transitions without duplicating JSON payload shaping. Runtime is O(n) in serialized payload size only when logging is enabled and O(1) otherwise. Side effects include debug-log file writes for matching enabled prompts.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
 * @param[in] previousState {string} Prior workflow state.
 * @param[in] nextState {import("./core/debug-runtime.js").DebugWorkflowState} Next workflow state.
 * @return {void} No return value.
 * @satisfies REQ-245, REQ-246, REQ-247
 */
function logPromptWorkflowStateChange(
  projectBase: string,
  config: UseReqConfig,
  promptName: import("./core/prompt-command-catalog.js").PromptCommandName,
  previousState: string,
  nextState: import("./core/debug-runtime.js").DebugWorkflowState,
): void {
  if (!shouldLogDebugPromptWorkflowState(config, nextState, promptName)) {
    return;
  }
  logDebugPromptEvent(
    projectBase,
    config,
    nextState,
    promptName,
    "workflow_state",
    { from_state: previousState, to_state: nextState },
    { success: true, workflow_state: nextState },
  );
}

/**
 * @brief Appends one dedicated prompt workflow debug entry when selected.
 * @details Reuses the shared workflow-event logger so prompt activation, restoration, closure, and session-shutdown paths can emit higher-granularity orchestration diagnostics without duplicating JSON payload shaping. Runtime is O(n) in serialized payload size only when logging is enabled and O(1) otherwise. Side effects include debug-log file writes for matching enabled prompts.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
 * @param[in] action {string} Workflow debug action identifier.
 * @param[in] input {unknown} Optional workflow debug input payload.
 * @param[in] result {unknown} Optional workflow debug result payload.
 * @param[in] isError {boolean} Workflow debug error flag.
 * @return {void} No return value.
 * @satisfies REQ-245, REQ-246, REQ-247, REQ-277
 */
function logPromptWorkflowEvent(
  projectBase: string,
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: import("./core/prompt-command-catalog.js").PromptCommandName,
  action: string,
  input?: unknown,
  result?: unknown,
  isError = false,
): void {
  logDebugPromptWorkflowEvent(
    projectBase,
    config,
    workflowState,
    promptName,
    action,
    input,
    result,
    isError,
  );
}

/**
 * @brief Transitions one prompt workflow state and logs the transition immediately after the state update.
 * @details Captures the previous workflow state, applies the new state through the shared status helper, and appends the gated `workflow_state` debug entry only after the transition has completed. Runtime is O(1). Side effects include status mutation, status-bar rendering, and optional debug-log writes.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @param[in] ctx {ExtensionContext | ExtensionCommandContext} Active extension context.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
 * @param[in] nextState {DebugWorkflowState} Next workflow state.
 * @return {void} No return value.
 */
function transitionPromptWorkflowState(
  statusController: PiUsereqStatusController,
  ctx: ExtensionContext | ExtensionCommandContext,
  projectBase: string,
  config: UseReqConfig,
  promptName: import("./core/prompt-command-catalog.js").PromptCommandName,
  nextState: DebugWorkflowState,
): void {
  const previousState = statusController.state.workflowState;
  setPiUsereqWorkflowState(statusController, nextState, ctx);
  if (previousState !== nextState) {
    logPromptWorkflowStateChange(projectBase, config, promptName, previousState, nextState);
  }
}

/**
 * @brief Resolves the runtime slash-command description for one bundled prompt.
 * @details Reads the bundled prompt front matter, extracts its normalized `description` field, and falls back to the historical generated label when the prompt metadata omits a description. Runtime is O(n) in prompt length. Side effects are limited to filesystem reads.
 * @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
 * @return {string} Runtime command description.
 */
function resolvePromptCommandDescription(
  promptName: import("./core/prompt-command-catalog.js").PromptCommandName,
): string {
  return readBundledPromptDescription(promptName) || `Run pi-usereq prompt ${promptName}`;
}

/**
 * @brief Resolves the original project base used for debug-log file writes.
 * @details Prefers the active or pending prompt execution plan so tool-result logging during worktree-backed prompt runs persists into the original repository path instead of transient worktree directories. Runtime is O(1). No external state is mutated.
 * @param[in] cwd {string} Current extension working directory.
 * @param[in] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {string} Absolute original project base path for debug logging.
 */
function resolveDebugProjectBase(cwd: string, statusController: PiUsereqStatusController): string {
  return statusController.state.activePromptRequest?.basePath
    ?? statusController.state.pendingPromptRequest?.basePath
    ?? getProjectBase(resolveLiveBootstrapCwd(cwd));
}

/**
 * @brief Delivers one best-effort UI notification without failing on stale replacement contexts.
 * @details Attempts to use the supplied extension context for UI notification delivery and suppresses the documented stale-extension-context runtime error raised after session replacement, because prompt-orchestration closure can outlive the context that initiated the switch. Runtime is O(n) in message length. Side effects are limited to user notification delivery when the context is still active.
 * @param[in] ctx {ExtensionContext | ExtensionCommandContext | undefined} Candidate UI context.
 * @param[in] message {string} Notification message.
 * @param[in] level {"info" | "error"} Notification severity.
 * @return {boolean} `true` when the notification was delivered and `false` when the context was already stale.
 * @satisfies REQ-280
 */
function notifyContextSafely(
  ctx: (ExtensionContext | ExtensionCommandContext) | undefined,
  message: string,
  level: "info" | "error",
): boolean {
  if (ctx === undefined) {
    return false;
  }
  try {
    ctx.ui.notify(message, level);
    return true;
  } catch (error) {
    if (isStaleExtensionContextError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * @brief Returns the configurable active-tool inventory visible to the extension.
 * @details Filters runtime tools against the canonical configurable-tool set, keeps only builtin-backed embedded tools, and orders the result by the documented custom/files/embedded/default-disabled grouping. Runtime is O(t log t). No external state is mutated.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {ToolInfo[]} Sorted configurable tool descriptors.
 * @satisfies REQ-007, REQ-063, REQ-231, REQ-232
 */
function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[] {
  return pi.getAllTools()
    .filter((tool) => PI_USEREQ_STARTUP_TOOL_SET.has(tool.name))
    .filter((tool) => !isPiUsereqEmbeddedToolName(tool.name) || tool.sourceInfo?.source === "builtin")
    .sort((left, right) => comparePiUsereqStartupToolNames(
      left.name as PiUsereqStartupToolName,
      right.name as PiUsereqStartupToolName,
    ));
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
 * @details Applies session-start-specific resource validation, project-config refresh, startup-tool enablement, and selected debug-tool logging before forwarding the originating hook name and payload into the shared `updateExtensionStatus(...)` pipeline. Before `agent_start`, re-verifies any prepared prompt execution session switch. On `agent_end`, dispatches configured command-notify, sound, and prompt-specific Pushover effects, logs dedicated workflow-closure diagnostics, restores the original session-backed `base-path` for every matched worktree-backed completion by reusing persisted replacement-session command contexts when event contexts omit `switchSession()`, executes the stash-assisted merge-and-delete finalization path only for matched successful completions, emits a warning-only notification when restored `base-path` changes are reapplied after merge, tolerates stale replacement-session notification contexts after session replacement, retains the worktree plus notifies closure failure for interrupted or failed outcomes, logs selected prompt workflow transitions, and transitions workflow state through `merging`, `error`, and `idle` as required. On `session_shutdown`, captures pre-update prompt snapshots so workflow-shutdown diagnostics and same-runtime command continuation preserve the active prompt workflow state across switch-triggered rebinding, then disposes the shared controller. Runtime is dominated by configuration loading during `session_start` and git finalization during matched successful `agent_end` handling; all other hooks are O(1). Side effects include resource checks, active-tool mutation, active-session replacement, status updates, live-ticker disposal on shutdown, optional child-process spawning, outbound HTTPS requests, branch merges, worktree deletion, and optional debug-log writes.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
 * @param[in] event {unknown} Hook payload forwarded by pi.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {Promise<void>} Promise resolved when hook processing completes.
 * @satisfies REQ-117, REQ-118, REQ-119, REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187, REQ-208, REQ-209, REQ-221, REQ-228, REQ-229, REQ-230, REQ-244, REQ-245, REQ-246, REQ-247, REQ-276, REQ-277, REQ-278, REQ-279, REQ-280, REQ-291, REQ-292
 */
async function handleExtensionStatusEvent(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
  hookName: PiUsereqStatusHookName,
  event: unknown,
  ctx: ExtensionContext,
): Promise<void> {
  const pendingPromptRequest = statusController.state.pendingPromptRequest;
  const activePromptRequest = statusController.state.activePromptRequest;
  const shutdownPromptRequest = hookName === "session_shutdown"
    ? activePromptRequest ?? pendingPromptRequest
    : undefined;
  const preservePromptCommandStateOnShutdown = hookName === "session_shutdown"
    ? shouldPreservePromptCommandStateOnShutdown(statusController.state)
    : false;
  if (hookName === "session_start") {
    ensureBundledResourcesAccessible();
    const startupCwd = resolveLiveBootstrapCwd(ctx.cwd);
    syncContextCwdMirror(ctx, startupCwd);
    bootstrapRuntimePathState(startupCwd, {
      gitPath: resolveRuntimeGitPath(startupCwd),
    });
    const config = loadProjectConfig(startupCwd);
    applyConfiguredPiUsereqTools(pi, config);
    setPiUsereqStatusConfig(statusController, config);
  }
  if (hookName === "before_agent_start") {
    const requestForActivation = activePromptRequest ?? pendingPromptRequest;
    if (requestForActivation !== undefined) {
      await activatePromptCommandExecution(requestForActivation, ctx);
    }
  }
  const notifyRequest: PiNotifyEventRequest | undefined = hookName === "agent_end"
    && activePromptRequest !== undefined
    && statusController.state.runStartTimeMs !== undefined
    ? {
        promptName: activePromptRequest.promptName,
        promptArgs: activePromptRequest.promptArgs,
        basePath: activePromptRequest.basePath,
        completionTimeMs: Math.max(0, Date.now() - statusController.state.runStartTimeMs),
      }
    : undefined;
  updateExtensionStatus(statusController, hookName, event, ctx);
  if (hookName === "tool_result" && statusController.config) {
    const toolEvent = event as {
      toolName?: string;
      input?: unknown;
      content?: unknown;
      details?: unknown;
      isError?: boolean;
    };
    if (typeof toolEvent.toolName === "string") {
      logDebugToolExecution(
        resolveDebugProjectBase(ctx.cwd, statusController),
        statusController.config,
        statusController.state.workflowState,
        toolEvent.toolName,
        toolEvent.input,
        {
          content: toolEvent.content,
          details: toolEvent.details,
        },
        toolEvent.isError === true,
      );
    }
  }
  if (hookName === "agent_end") {
    if (statusController.config) {
      runPiNotifyEffects(
        {
          ...statusController.config,
          "notify-sound": getPiUsereqRuntimeSoundLevel(statusController),
        },
        event as { messages: AgentEndEvent["messages"] },
        notifyRequest,
      );
    }
    if (activePromptRequest !== undefined) {
      const debugConfig = statusController.config;
      let promptContext = ctx;
      const outcome = classifyPromptCommandOutcome(
        event as { messages: AgentEndEvent["messages"] },
      );
      const closureFailureMessage = outcome !== "completed"
        && activePromptRequest.worktreeDir !== undefined
        ? `ERROR: Prompt closure retained worktree ${activePromptRequest.worktreeDir} after ${outcome} outcome.`
        : undefined;
      const shouldFinalizeMatchedSuccess = outcome === "completed"
        && statusController.state.workflowState === "running"
        && activePromptRequest.worktreeDir !== undefined;
      if (debugConfig) {
        logPromptWorkflowEvent(
          activePromptRequest.basePath,
          debugConfig,
          statusController.state.workflowState,
          activePromptRequest.promptName,
          "workflow_closure",
          {
            hook: "agent_end",
            outcome,
          },
          {
            should_finalize_matched_success: shouldFinalizeMatchedSuccess,
            worktree_dir: activePromptRequest.worktreeDir,
            event_context_has_switch_session: typeof (ctx as ExtensionCommandContext).switchSession === "function",
          },
        );
      }
      if (shouldFinalizeMatchedSuccess) {
        if (debugConfig) {
          transitionPromptWorkflowState(
            statusController,
            promptContext,
            activePromptRequest.basePath,
            debugConfig,
            activePromptRequest.promptName,
            "merging",
          );
        } else {
          setPiUsereqWorkflowState(statusController, "merging", promptContext);
        }
        let finalization:
          | {
            mergeAttempted: boolean;
            mergeSucceeded: boolean;
            cleanupSucceeded: boolean;
            errorMessage?: string;
            warningMessage?: string;
            activeContext?: unknown;
          }
          | undefined;
        try {
          finalization = await finalizePromptCommandExecution(
            activePromptRequest,
            promptContext,
            debugConfig
              ? { config: debugConfig, workflowState: statusController.state.workflowState }
              : undefined,
          );
          promptContext = (finalization.activeContext ?? promptContext) as typeof ctx;
        } catch (error) {
          promptContext = (getPromptCommandErrorContext(error) ?? promptContext) as typeof ctx;
          let errorMessage = error instanceof Error ? error.message : String(error);
          let cleanupSucceeded = false;
          try {
            promptContext = (await restorePromptCommandExecution(
              activePromptRequest,
              promptContext,
              debugConfig
                ? { config: debugConfig, workflowState: statusController.state.workflowState }
                : undefined,
            ) ?? promptContext) as typeof ctx;
            cleanupSucceeded = true;
          } catch (restoreError) {
            promptContext = (getPromptCommandErrorContext(restoreError) ?? promptContext) as typeof ctx;
            errorMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
          }
          finalization = {
            mergeAttempted: false,
            mergeSucceeded: false,
            cleanupSucceeded,
            errorMessage,
          };
        }
        if (
          finalization.errorMessage
          && (!finalization.cleanupSucceeded || !finalization.mergeSucceeded)
        ) {
          if (debugConfig) {
            transitionPromptWorkflowState(
              statusController,
              promptContext,
              activePromptRequest.basePath,
              debugConfig,
              activePromptRequest.promptName,
              "error",
            );
          } else {
            setPiUsereqWorkflowState(statusController, "error", promptContext);
          }
          notifyContextSafely(promptContext, finalization.errorMessage, "error");
        }
        if (
          finalization.warningMessage
          && finalization.cleanupSucceeded
          && finalization.mergeSucceeded
          && !finalization.errorMessage
        ) {
          notifyContextSafely(promptContext, finalization.warningMessage, "info");
        }
      } else {
        try {
          promptContext = (await restorePromptCommandExecution(
            activePromptRequest,
            promptContext,
            debugConfig
              ? { config: debugConfig, workflowState: statusController.state.workflowState }
              : undefined,
          ) ?? promptContext) as typeof ctx;
          if (closureFailureMessage !== undefined) {
            notifyContextSafely(promptContext, closureFailureMessage, "error");
          }
        } catch (error) {
          promptContext = (getPromptCommandErrorContext(error) ?? promptContext) as typeof ctx;
          if (debugConfig) {
            transitionPromptWorkflowState(
              statusController,
              promptContext,
              activePromptRequest.basePath,
              debugConfig,
              activePromptRequest.promptName,
              "error",
            );
          } else {
            setPiUsereqWorkflowState(statusController, "error", promptContext);
          }
          notifyContextSafely(promptContext, error instanceof Error ? error.message : String(error), "error");
        }
      }
      statusController.state.pendingPromptRequest = undefined;
      statusController.state.activePromptRequest = undefined;
      if (debugConfig) {
        transitionPromptWorkflowState(
          statusController,
          promptContext,
          activePromptRequest.basePath,
          debugConfig,
          activePromptRequest.promptName,
          "idle",
        );
      } else {
        setPiUsereqWorkflowState(statusController, "idle", promptContext);
      }
    }
  }
  if (hookName === "session_shutdown") {
    if (shutdownPromptRequest !== undefined && statusController.config) {
      logPromptWorkflowEvent(
        shutdownPromptRequest.basePath,
        statusController.config,
        preservePromptCommandStateOnShutdown
          ? statusController.state.workflowState
          : "idle",
        shutdownPromptRequest.promptName,
        "workflow_session_shutdown",
        {
          reason: (event as { reason?: unknown }).reason,
          target_session_file: (event as { targetSessionFile?: unknown }).targetSessionFile,
        },
        {
          preserve_prompt_command_state: preservePromptCommandStateOnShutdown,
          pending_prompt_request: pendingPromptRequest !== undefined,
          active_prompt_request: activePromptRequest !== undefined,
        },
      );
    }
    if (!preservePromptCommandStateOnShutdown) {
      if (shutdownPromptRequest !== undefined && statusController.config) {
        transitionPromptWorkflowState(
          statusController,
          ctx,
          shutdownPromptRequest.basePath,
          statusController.config,
          shutdownPromptRequest.promptName,
          "idle",
        );
      } else {
        setPiUsereqWorkflowState(statusController, "idle", ctx);
      }
    }
    disposePiUsereqStatusController(statusController);
  }
}

/**
 * @brief Registers shared wrappers for every supported pi lifecycle hook.
 * @details Installs one generic wrapper per intercepted hook so every resource,
 * session, agent, model, tool, bash, and input event is routed through the
 * same extension-status update pipeline. The wrapper suppresses the documented
 * stale-extension-context error because pi can continue delivering late
 * lifecycle callbacks against contexts invalidated by session replacement after
 * prompt orchestration has already completed successfully. Runtime is O(h) in
 * registered hook count. Side effects include hook registration.
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
      try {
        await handleExtensionStatusEvent(pi, statusController, hookName, event, ctx);
      } catch (error) {
        if (!isStaleExtensionContextError(error)) {
          throw error;
        }
      }
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
 * @brief Returns the canonical debug-tool toggle order.
 * @details Reuses the documented configurable-tool ordering so debug toggles list extension-owned tools before embedded tools and remain deterministic across sessions. Runtime is O(t log t). No external state is mutated.
 * @return {PiUsereqStartupToolName[]} Ordered debug-tool toggle names.
 * @satisfies REQ-242
 */
function getDebugToolToggleNames(): PiUsereqStartupToolName[] {
  return [...PI_USEREQ_CUSTOM_TOOL_NAMES, ...PI_USEREQ_EMBEDDED_TOOL_NAMES].sort(comparePiUsereqStartupToolNames);
}

/**
 * @brief Restores the debug configuration subtree to its documented defaults.
 * @details Resets global debug enablement, log path, workflow-state filter, dedicated workflow-event logging, and selected tool plus prompt debug toggles without mutating unrelated settings. Runtime is O(1). Side effect: mutates `config`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {void} No return value.
 * @satisfies REQ-236, REQ-237, REQ-238, REQ-239, REQ-195, REQ-277
 */
function resetDebugConfigToDefaults(config: UseReqConfig): void {
  config.DEBUG_ENABLED = "disable";
  config.DEBUG_LOG_FILE = DEFAULT_DEBUG_LOG_FILE;
  config.DEBUG_STATUS_CHANGES = DEFAULT_DEBUG_STATUS_CHANGES;
  config.DEBUG_WORKFLOW_EVENTS = DEFAULT_DEBUG_WORKFLOW_EVENTS;
  config.DEBUG_LOG_ON_STATUS = DEFAULT_DEBUG_LOG_ON_STATUS;
  config.DEBUG_ENABLED_TOOLS = [];
  config.DEBUG_ENABLED_PROMPTS = [];
}

/**
 * @brief Formats the top-level Debug summary value.
 * @details Emits the current global debug mode plus compact selected-tool and selected-prompt counts for right-aligned menu display. Runtime is O(n) in configured selector count. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Compact debug summary string.
 */
function formatDebugMenuSummary(config: UseReqConfig): string {
  const toolCount = normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS).length;
  const promptCount = normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS).length;
  return config.DEBUG_ENABLED === "enable"
    ? `enable • ${toolCount} tools • ${promptCount} prompts`
    : "disable";
}

/**
 * @brief Builds one debug-menu row with optional disabled styling.
 * @details Applies dim styling and disables selection whenever global debug is off for all rows except the global `Debug` toggle row. Runtime is O(1). No external state is mutated.
 * @param[in] choice {PiUsereqSettingsMenuChoice} Base debug-menu row.
 * @param[in] debugEnabled {boolean} Whether global debug is enabled.
 * @return {PiUsereqSettingsMenuChoice} Styled debug-menu row.
 * @satisfies REQ-241
 */
function buildDebugMenuChoice(
  choice: PiUsereqSettingsMenuChoice,
  debugEnabled: boolean,
): PiUsereqSettingsMenuChoice {
  if (debugEnabled || choice.id === "debug-enabled") {
    return choice;
  }
  return {
    ...choice,
    disabled: true,
    labelTone: "dim",
    valueTone: "dim",
  };
}

/**
 * @brief Opens the workflow-state filter selector used by the Debug submenu.
 * @details Exposes `any` plus each canonical workflow state through the shared settings-menu renderer and returns the selected normalized filter or `undefined` when the user cancels the submenu. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] currentValue {DebugLogOnStatus} Current persisted workflow-state filter.
 * @return {Promise<DebugLogOnStatus | undefined>} Selected workflow-state filter or `undefined` when cancelled.
 */
async function selectDebugLogOnStatus(
  ctx: ExtensionCommandContext,
  currentValue: DebugLogOnStatus,
): Promise<DebugLogOnStatus | undefined> {
  const choice = await showPiUsereqSettingsMenu(ctx, "Log on status", [
    {
      id: "any",
      label: "any",
      value: currentValue === "any" ? "selected" : "",
      description: "Write matching debug entries regardless of the current workflow state.",
    },
    ...DEBUG_WORKFLOW_STATES.map((workflowState) => ({
      id: workflowState,
      label: workflowState,
      value: currentValue === workflowState ? "selected" : "",
      description: `Write matching debug entries only while workflow state is ${workflowState}.`,
    })),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default workflow-state filter.",
    }),
  ], { initialSelectedId: currentValue });
  if (!choice) {
    return undefined;
  }
  if (choice === "reset-defaults") {
    return DEFAULT_DEBUG_LOG_ON_STATUS;
  }
  return normalizeDebugLogOnStatus(choice);
}

/**
 * @brief Builds the shared settings-menu choices for debug logging configuration.
 * @details Serializes global debug controls plus workflow-state, dedicated workflow-event, per-tool, and per-prompt toggles into one submenu, deriving inventories from the canonical tool and prompt lists and dimming locked rows while debug is disabled. Runtime is O(t + p). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered debug-menu choices.
 * @satisfies REQ-240, REQ-241, REQ-242, REQ-243, REQ-193, REQ-277
 */
function buildDebugMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const debugEnabled = config.DEBUG_ENABLED === "enable";
  const enabledTools = new Set(normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS));
  const enabledPrompts = new Set(normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS));
  return [
    {
      id: "debug-enabled",
      label: "Debug",
      value: config.DEBUG_ENABLED,
      values: ["enable", "disable"],
      description: "Enable or disable all debug logging behavior and unlock the remaining Debug rows.",
    },
    buildDebugMenuChoice(
      {
        id: "debug-log-file",
        label: "Log file",
        value: config.DEBUG_LOG_FILE,
        description: "Edit the JSON debug log file path. Relative paths resolve against the original project base.",
      },
      debugEnabled,
    ),
    buildDebugMenuChoice(
      {
        id: "debug-log-on-status",
        label: "Log on status",
        value: config.DEBUG_LOG_ON_STATUS,
        description: "Select whether matching debug entries are written for one explicit workflow state or for any workflow state.",
      },
      debugEnabled,
    ),
    buildDebugMenuChoice(
      {
        id: "debug-status-changes",
        label: "Status changes",
        value: normalizeDebugStatusChanges(config.DEBUG_STATUS_CHANGES),
        values: ["enable", "disable"],
        description: "Enable or disable `workflow_state` debug entries for prompt-orchestration transitions.",
      },
      debugEnabled,
    ),
    buildDebugMenuChoice(
      {
        id: "debug-workflow-events",
        label: "Workflow events",
        value: normalizeDebugWorkflowEvents(config.DEBUG_WORKFLOW_EVENTS),
        values: ["enable", "disable"],
        description: "Enable or disable dedicated workflow debug entries for activation, restoration, closure, and session-shutdown diagnostics.",
      },
      debugEnabled,
    ),
    ...getDebugToolToggleNames().map((toolName) => buildDebugMenuChoice(
      {
        id: `debug-tool:${toolName}`,
        label: toolName,
        value: enabledTools.has(toolName) ? "enable" : "disable",
        values: ["enable", "disable"],
        description: PI_USEREQ_CUSTOM_TOOL_NAMES.includes(toolName as never)
          ? `Toggle debug logging for custom tool ${toolName}.`
          : `Toggle debug logging for embedded tool ${toolName}.`,
      },
      debugEnabled,
    )),
    ...DEBUG_PROMPT_NAMES.map((promptName) => buildDebugMenuChoice(
      {
        id: `debug-prompt:${promptName}`,
        label: promptName,
        value: enabledPrompts.has(promptName) ? "enable" : "disable",
        values: ["enable", "disable"],
        description: `Toggle prompt-orchestration debug logging for /${promptName}.`,
      },
      debugEnabled,
    )),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default Debug configuration.",
    }),
  ];
}

/**
 * @brief Runs the interactive Debug submenu.
 * @details Lets the user toggle global debug enablement, edit debug file and workflow filters, toggle dedicated workflow-event logging, mutate per-tool and per-prompt debug selectors, and restore subtree defaults while preserving row focus across re-renders. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<void>} Promise resolved when the submenu closes.
 * @satisfies REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243, REQ-192, REQ-193, REQ-195, REQ-277
 */
async function configureDebugMenu(
  ctx: ExtensionCommandContext,
  config: UseReqConfig,
  onConfigChange: () => void,
): Promise<void> {
  let focusedChoiceId: string | undefined;
  while (true) {
    const choice = await showPiUsereqSettingsMenu(ctx, "Debug", buildDebugMenuChoices(config), {
      initialSelectedId: focusedChoiceId,
      getChoices: () => buildDebugMenuChoices(config),
      onChange: (choiceId, newValue) => {
        if (choiceId === "debug-enabled") {
          config.DEBUG_ENABLED = newValue === "enable" ? "enable" : "disable";
          onConfigChange();
          ctx.ui.notify(`Debug ${config.DEBUG_ENABLED}`, "info");
          return;
        }
        if (choiceId === "debug-status-changes") {
          config.DEBUG_STATUS_CHANGES = normalizeDebugStatusChanges(newValue);
          onConfigChange();
          ctx.ui.notify(`Debug status-change logging ${config.DEBUG_STATUS_CHANGES}`, "info");
          return;
        }
        if (choiceId === "debug-workflow-events") {
          config.DEBUG_WORKFLOW_EVENTS = normalizeDebugWorkflowEvents(newValue);
          onConfigChange();
          ctx.ui.notify(`Debug workflow-event logging ${config.DEBUG_WORKFLOW_EVENTS}`, "info");
          return;
        }
        if (choiceId.startsWith("debug-tool:")) {
          const toolName = choiceId.slice("debug-tool:".length) as PiUsereqStartupToolName;
          const enabledTools = new Set(normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS));
          if (newValue === "enable") {
            enabledTools.add(toolName);
          } else {
            enabledTools.delete(toolName);
          }
          config.DEBUG_ENABLED_TOOLS = getDebugToolToggleNames().filter((name) => enabledTools.has(name));
          onConfigChange();
          ctx.ui.notify(
            `${newValue === "enable" ? "Enabled" : "Disabled"} debug logging for ${toolName}`,
            "info",
          );
          return;
        }
        if (choiceId.startsWith("debug-prompt:")) {
          const promptName = choiceId.slice("debug-prompt:".length) as (typeof DEBUG_PROMPT_NAMES)[number];
          const enabledPrompts = new Set(normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS));
          if (newValue === "enable") {
            enabledPrompts.add(promptName);
          } else {
            enabledPrompts.delete(promptName);
          }
          config.DEBUG_ENABLED_PROMPTS = DEBUG_PROMPT_NAMES.filter((name) => enabledPrompts.has(name));
          onConfigChange();
          ctx.ui.notify(
            `${newValue === "enable" ? "Enabled" : "Disabled"} debug logging for ${promptName}`,
            "info",
          );
        }
      },
    });
    if (!choice) {
      return;
    }
    focusedChoiceId = choice;

    if (choice === "debug-enabled") {
      config.DEBUG_ENABLED = config.DEBUG_ENABLED === "enable" ? "disable" : "enable";
      onConfigChange();
      ctx.ui.notify(`Debug ${config.DEBUG_ENABLED}`, "info");
      continue;
    }
    if (choice === "reset-defaults") {
      const resetPreview: ResetConfirmationChange[] = [
        { label: "Debug", previousValue: config.DEBUG_ENABLED, nextValue: "disable" },
        { label: "Log file", previousValue: config.DEBUG_LOG_FILE, nextValue: DEFAULT_DEBUG_LOG_FILE },
        { label: "Status changes", previousValue: normalizeDebugStatusChanges(config.DEBUG_STATUS_CHANGES), nextValue: DEFAULT_DEBUG_STATUS_CHANGES },
        { label: "Workflow events", previousValue: normalizeDebugWorkflowEvents(config.DEBUG_WORKFLOW_EVENTS), nextValue: DEFAULT_DEBUG_WORKFLOW_EVENTS },
        { label: "Log on status", previousValue: config.DEBUG_LOG_ON_STATUS, nextValue: DEFAULT_DEBUG_LOG_ON_STATUS },
        { label: "Enabled debug tools", previousValue: String(normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS).length), nextValue: "0" },
        { label: "Enabled debug prompts", previousValue: String(normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS).length), nextValue: "0" },
      ].filter((change) => change.previousValue !== change.nextValue);
      const approved = await confirmResetChanges(
        ctx,
        "Confirm Debug reset",
        resetPreview,
        "Approve restoring the documented default Debug configuration.",
        "Abort the Debug reset and keep the current values.",
      );
      if (!approved) {
        ctx.ui.notify("Aborted Debug reset", "info");
        continue;
      }
      resetDebugConfigToDefaults(config);
      onConfigChange();
      ctx.ui.notify("Restored default Debug configuration", "info");
      continue;
    }
    if (config.DEBUG_ENABLED !== "enable") {
      ctx.ui.notify("Debug rows are locked while Debug is disabled", "info");
      continue;
    }
    if (choice === "debug-log-file") {
      const value = await ctx.ui.input("Log file", config.DEBUG_LOG_FILE);
      if (value !== undefined) {
        config.DEBUG_LOG_FILE = normalizeDebugLogFile(value);
        onConfigChange();
        ctx.ui.notify(`Debug log file set to ${config.DEBUG_LOG_FILE}`, "info");
      }
      continue;
    }
    if (choice === "debug-status-changes") {
      config.DEBUG_STATUS_CHANGES = normalizeDebugStatusChanges(
        config.DEBUG_STATUS_CHANGES === "enable" ? "disable" : "enable",
      );
      onConfigChange();
      ctx.ui.notify(`Debug status-change logging ${config.DEBUG_STATUS_CHANGES}`, "info");
      continue;
    }
    if (choice === "debug-workflow-events") {
      config.DEBUG_WORKFLOW_EVENTS = normalizeDebugWorkflowEvents(
        config.DEBUG_WORKFLOW_EVENTS === "enable" ? "disable" : "enable",
      );
      onConfigChange();
      ctx.ui.notify(`Debug workflow-event logging ${config.DEBUG_WORKFLOW_EVENTS}`, "info");
      continue;
    }
    if (choice === "debug-log-on-status") {
      const selectedStatus = await selectDebugLogOnStatus(ctx, config.DEBUG_LOG_ON_STATUS);
      if (selectedStatus !== undefined) {
        config.DEBUG_LOG_ON_STATUS = selectedStatus;
        onConfigChange();
        ctx.ui.notify(`Debug workflow filter set to ${config.DEBUG_LOG_ON_STATUS}`, "info");
      }
      continue;
    }
    if (choice.startsWith("debug-tool:")) {
      const toolName = choice.slice("debug-tool:".length);
      const enabledTools = new Set(normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS));
      if (enabledTools.has(toolName as PiUsereqStartupToolName)) {
        enabledTools.delete(toolName as PiUsereqStartupToolName);
      } else {
        enabledTools.add(toolName as PiUsereqStartupToolName);
      }
      config.DEBUG_ENABLED_TOOLS = getDebugToolToggleNames().filter((name) => enabledTools.has(name));
      onConfigChange();
      ctx.ui.notify(
        `${enabledTools.has(toolName as PiUsereqStartupToolName) ? "Enabled" : "Disabled"} debug logging for ${toolName}`,
        "info",
      );
      continue;
    }
    if (choice.startsWith("debug-prompt:")) {
      const promptName = choice.slice("debug-prompt:".length);
      const enabledPrompts = new Set(normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS));
      if (enabledPrompts.has(promptName as (typeof DEBUG_PROMPT_NAMES)[number])) {
        enabledPrompts.delete(promptName as (typeof DEBUG_PROMPT_NAMES)[number]);
      } else {
        enabledPrompts.add(promptName as (typeof DEBUG_PROMPT_NAMES)[number]);
      }
      config.DEBUG_ENABLED_PROMPTS = DEBUG_PROMPT_NAMES.filter((name) => enabledPrompts.has(name));
      onConfigChange();
      ctx.ui.notify(
        `${enabledPrompts.has(promptName as (typeof DEBUG_PROMPT_NAMES)[number]) ? "Enabled" : "Disabled"} debug logging for ${promptName}`,
        "info",
      );
    }
  }
}

/**
 * @brief Represents one persisted boolean notification-setting key.
 * @details Restricts menu toggles to the global enable flags and completed/interrupted/failed event toggles used by command-notify, sound, and Pushover configuration. Compile-time only and introduces no runtime cost.
 */
type PiNotifyBooleanConfigKey =
  | "notify-enabled"
  | "notify-on-completed"
  | "notify-on-interrupted"
  | "notify-on-failed"
  | "notify-sound-on-completed"
  | "notify-sound-on-interrupted"
  | "notify-sound-on-failed"
  | "notify-pushover-enabled"
  | "notify-pushover-on-completed"
  | "notify-pushover-on-interrupted"
  | "notify-pushover-on-failed";

/**
 * @brief Represents one persisted boolean notification event-toggle key.
 * @details Restricts shared event-submenu mutation helpers to completed/interrupted/failed toggles and excludes global enable flags. Compile-time only and introduces no runtime cost.
 */
type PiNotifyEventBooleanConfigKey = Exclude<
  PiNotifyBooleanConfigKey,
  "notify-enabled" | "notify-pushover-enabled"
>;

/**
 * @brief Represents one shared prompt-end event identifier used by notification menus.
 * @details Restricts event-submenu rendering to the canonical completed/interrupted/failed domain shared by command-notify, sound, and Pushover routing. Compile-time only and introduces no runtime cost.
 */
type PiNotifyEventId = "completed" | "interrupted" | "failed";

/**
 * @brief Describes one shared prompt-end event row rendered inside notification event submenus.
 * @details Binds one canonical event identifier to the human-readable label and terminal-outcome description reused across command-notify, sound, and Pushover event menus. The interface is compile-time only and introduces no runtime cost.
 */
interface PiNotifyEventRowDefinition {
  eventId: PiNotifyEventId;
  label: string;
  description: string;
}

/**
 * @brief Describes one notification-system event submenu contract.
 * @details Binds the top-level launcher row, submenu title, toast prefix, and completed/interrupted/failed config keys for one notification transport. The interface is compile-time only and introduces no runtime cost.
 */
interface PiNotifyEventMenuDefinition {
  topLevelId: string;
  topLevelLabel: string;
  submenuTitle: string;
  systemLabel: string;
  keys: Record<PiNotifyEventId, PiNotifyEventBooleanConfigKey>;
}

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
 * @details Copies the command-notify, sound, and Pushover configuration subtree from a fresh default config into the supplied mutable project config. Runtime is O(1). Side effect: mutates `config`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {void} No return value.
 * @satisfies REQ-174, REQ-178, REQ-184, REQ-195, REQ-196
 */
function resetPiNotifyConfigToDefaults(config: UseReqConfig): void {
  const defaults = getDefaultConfig("");
  config["notify-enabled"] = defaults["notify-enabled"];
  config["notify-on-completed"] = defaults["notify-on-completed"];
  config["notify-on-interrupted"] = defaults["notify-on-interrupted"];
  config["notify-on-failed"] = defaults["notify-on-failed"];
  config["notify-sound"] = defaults["notify-sound"];
  config["notify-sound-on-completed"] = defaults["notify-sound-on-completed"];
  config["notify-sound-on-interrupted"] = defaults["notify-sound-on-interrupted"];
  config["notify-sound-on-failed"] = defaults["notify-sound-on-failed"];
  config["notify-sound-toggle-shortcut"] = defaults["notify-sound-toggle-shortcut"];
  config["notify-pushover-enabled"] = defaults["notify-pushover-enabled"];
  config["notify-pushover-on-completed"] = defaults["notify-pushover-on-completed"];
  config["notify-pushover-on-interrupted"] = defaults["notify-pushover-on-interrupted"];
  config["notify-pushover-on-failed"] = defaults["notify-pushover-on-failed"];
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
 * @brief Defines the shared prompt-end event rows reused across notification submenus.
 * @details Encodes the human-readable completed/interrupted/failed labels and terminal-state descriptions required by the command-notify, sound, and Pushover event menus. Access complexity is O(1).
 * @satisfies REQ-188, REQ-198
 */
const PI_NOTIFY_EVENT_ROW_DEFINITIONS: PiNotifyEventRowDefinition[] = [
  {
    eventId: "completed",
    label: "Prompt completed",
    description: "Toggle delivery when the prompt finishes without interruption or failure.",
  },
  {
    eventId: "interrupted",
    label: "Prompt interrupted",
    description: "Toggle delivery when the prompt finishes with assistant stopReason `aborted`.",
  },
  {
    eventId: "failed",
    label: "Prompt failed",
    description: "Toggle delivery when the prompt finishes with assistant stopReason `error`.",
  },
];

/**
 * @brief Defines the shared event-submenu contracts for command-notify, sound, and Pushover.
 * @details Binds each notification transport to its top-level launcher row, submenu title, toast prefix, and completed/interrupted/failed config-key set. Access complexity is O(1).
 * @satisfies REQ-174, REQ-178, REQ-184, REQ-198
 */
const PI_NOTIFY_EVENT_MENU_DEFINITIONS: Record<
  "notification" | "sound" | "pushover",
  PiNotifyEventMenuDefinition
> = {
  notification: {
    topLevelId: "notification-events",
    topLevelLabel: "Notification events",
    submenuTitle: "Notification events",
    systemLabel: "Notification",
    keys: {
      completed: "notify-on-completed",
      interrupted: "notify-on-interrupted",
      failed: "notify-on-failed",
    },
  },
  sound: {
    topLevelId: "sound-events",
    topLevelLabel: "Sound events",
    submenuTitle: "Sound events",
    systemLabel: "Sound",
    keys: {
      completed: "notify-sound-on-completed",
      interrupted: "notify-sound-on-interrupted",
      failed: "notify-sound-on-failed",
    },
  },
  pushover: {
    topLevelId: "pushover-events",
    topLevelLabel: "Pushover events",
    submenuTitle: "Pushover events",
    systemLabel: "Pushover",
    keys: {
      completed: "notify-pushover-on-completed",
      interrupted: "notify-pushover-on-interrupted",
      failed: "notify-pushover-on-failed",
    },
  },
};

/**
 * @brief Defines the canonical label used for persisted boot-sound menu rows.
 * @details Reuses one shared string literal across notification menu rows, selectors, reset previews, and tests so the persisted boot-sound terminology remains stable. Access complexity is O(1).
 * @satisfies REQ-149, REQ-179
 */
const PI_NOTIFY_BOOT_SOUND_LABEL = "Enable sound (boot value)";

/**
 * @brief Formats the top-level summary value for one notification event submenu.
 * @details Counts enabled completed/interrupted/failed toggles for the selected transport and renders the result as `n/3 on` for right-aligned menu display. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
 * @return {string} Compact enabled-toggle summary.
 * @satisfies REQ-198
 */
function formatPiNotifyEventMenuSummary(
  config: UseReqConfig,
  eventMenu: PiNotifyEventMenuDefinition,
): string {
  const enabledCount = PI_NOTIFY_EVENT_ROW_DEFINITIONS.filter(
    (row) => config[eventMenu.keys[row.eventId]] === true,
  ).length;
  return `${enabledCount}/3 on`;
}

/**
 * @brief Builds the top-level launcher row for one notification event submenu.
 * @details Reuses the shared completed/interrupted/failed summary renderer so the `Notifications` menu can expose dedicated event editors for command-notify, sound, and Pushover in a uniform shape. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
 * @return {PiUsereqSettingsMenuChoice} Launcher row for the selected event submenu.
 * @satisfies REQ-181, REQ-183, REQ-165, REQ-198
 */
function buildPiNotifyEventLauncherChoice(
  config: UseReqConfig,
  eventMenu: PiNotifyEventMenuDefinition,
): PiUsereqSettingsMenuChoice {
  return {
    id: eventMenu.topLevelId,
    label: eventMenu.topLevelLabel,
    value: formatPiNotifyEventMenuSummary(config, eventMenu),
    description: `Open the ${eventMenu.submenuTitle} submenu for shared prompt-end delivery events.`,
  };
}

/**
 * @brief Builds the shared settings-menu choices for one notification event submenu.
 * @details Serializes completed/interrupted/failed rows with right-aligned `on|off` values, then appends a value-less `Reset defaults` row for submenu-scoped mutation control. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered event-submenu choice vector.
 * @satisfies REQ-188, REQ-193, REQ-198
 */
function buildPiNotifyEventMenuChoices(
  config: UseReqConfig,
  eventMenu: PiNotifyEventMenuDefinition,
): PiUsereqSettingsMenuChoice[] {
  return [
    ...PI_NOTIFY_EVENT_ROW_DEFINITIONS.map((row) => ({
      id: eventMenu.keys[row.eventId],
      label: row.label,
      value: config[eventMenu.keys[row.eventId]] ? "on" : "off",
      values: ["on", "off"],
      description: `${eventMenu.systemLabel}: ${row.description}`,
    })),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: `Restore the documented default ${eventMenu.systemLabel.toLowerCase()} event toggles.`,
    }),
  ];
}

/**
 * @brief Restores one notification event submenu to its documented defaults.
 * @details Copies only the completed/interrupted/failed toggles referenced by the supplied submenu contract from a fresh default config into the mutable project config. Runtime is O(1). Side effect: mutates `config`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
 * @return {void} No return value.
 * @satisfies REQ-174, REQ-178, REQ-184, REQ-195
 */
function resetPiNotifyEventMenuToDefaults(
  config: UseReqConfig,
  eventMenu: PiNotifyEventMenuDefinition,
): void {
  const defaults = getDefaultConfig("");
  for (const key of Object.values(eventMenu.keys) as PiNotifyEventBooleanConfigKey[]) {
    config[key] = defaults[key];
  }
}

/**
 * @brief Resolves the human-readable event label for one event-toggle config key.
 * @details Matches the supplied config key against the submenu contract and returns the corresponding completed/interrupted/failed menu label for deterministic notification toasts. Runtime is O(1). No external state is mutated.
 * @param[in] key {PiNotifyEventBooleanConfigKey} Event-toggle configuration key.
 * @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
 * @return {string} Human-readable event label.
 * @satisfies REQ-188, REQ-198
 */
function resolvePiNotifyEventLabel(
  key: PiNotifyEventBooleanConfigKey,
  eventMenu: PiNotifyEventMenuDefinition,
): string {
  return PI_NOTIFY_EVENT_ROW_DEFINITIONS.find(
    (row) => eventMenu.keys[row.eventId] === key,
  )?.label ?? key;
}

/**
 * @brief Runs one dedicated notification event submenu.
 * @details Reuses the shared settings-menu renderer to toggle completed/interrupted/failed delivery flags, preserve row focus, and apply submenu-scoped reset semantics for command-notify, sound, or Pushover events. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
 * @return {Promise<void>} Promise resolved when the submenu closes.
 * @satisfies REQ-188, REQ-192, REQ-193, REQ-195, REQ-198
 */
async function configurePiNotifyEventMenu(
  ctx: ExtensionCommandContext,
  config: UseReqConfig,
  eventMenu: PiNotifyEventMenuDefinition,
  onConfigChange: () => void,
): Promise<void> {
  let focusedChoiceId: string | undefined;
  while (true) {
    const choice = await showPiUsereqSettingsMenu(
      ctx,
      eventMenu.submenuTitle,
      buildPiNotifyEventMenuChoices(config, eventMenu),
      {
        initialSelectedId: focusedChoiceId,
        getChoices: () => buildPiNotifyEventMenuChoices(config, eventMenu),
        onChange: (choiceId, newValue) => {
          const enabled = newValue === "on";
          config[choiceId as PiNotifyEventBooleanConfigKey] = enabled;
          onConfigChange();
          const eventLabel = resolvePiNotifyEventLabel(
            choiceId as PiNotifyEventBooleanConfigKey,
            eventMenu,
          );
          ctx.ui.notify(
            `${eventMenu.systemLabel} ${eventLabel} ${enabled ? "enabled" : "disabled"}`,
            "info",
          );
        },
      },
    );
    if (!choice) {
      return;
    }
    focusedChoiceId = choice;
    if (choice === "reset-defaults") {
      const defaults = getDefaultConfig("");
      const resetPreview = PI_NOTIFY_EVENT_ROW_DEFINITIONS
        .map((row) => ({
          label: row.label,
          previousValue: config[eventMenu.keys[row.eventId]] ? "on" : "off",
          nextValue: defaults[eventMenu.keys[row.eventId]] ? "on" : "off",
        }))
        .filter((change) => change.previousValue !== change.nextValue);
      const approved = await confirmResetChanges(
        ctx,
        `Confirm ${eventMenu.systemLabel} event reset`,
        resetPreview,
        `Approve restoring default ${eventMenu.systemLabel.toLowerCase()} event toggles.`,
        `Abort the ${eventMenu.systemLabel.toLowerCase()} event reset and keep the current values.`,
      );
      if (!approved) {
        ctx.ui.notify(`Aborted ${eventMenu.systemLabel.toLowerCase()} event reset`, "info");
        continue;
      }
      resetPiNotifyEventMenuToDefaults(config, eventMenu);
      onConfigChange();
      ctx.ui.notify(
        `Restored default ${eventMenu.systemLabel.toLowerCase()} events`,
        "info",
      );
      continue;
    }
    const enabled = togglePiNotifyFlag(
      config,
      choice as PiNotifyEventBooleanConfigKey,
    );
    onConfigChange();
    const eventLabel = resolvePiNotifyEventLabel(
      choice as PiNotifyEventBooleanConfigKey,
      eventMenu,
    );
    ctx.ui.notify(
      `${eventMenu.systemLabel} ${eventLabel} ${enabled ? "enabled" : "disabled"}`,
      "info",
    );
  }
}

/**
 * @brief Builds the direct Pushover rows rendered inside `Notifications`.
 * @details Serializes the global enable flag, shared-event submenu launcher, priority, title, text, and credential rows into right-valued menu items appended after the sound-command rows, dims and disables the enable row until both credentials are populated, renders the locked value as `configure user/token keys first`, and escapes control characters for the single-line `Pushover text` value. Runtime is O(n) in the rendered text-template length. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered direct Pushover rows.
 * @satisfies REQ-163, REQ-165, REQ-172, REQ-184, REQ-185, REQ-198, REQ-234, REQ-235
 */
function buildPiNotifyPushoverRows(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const pushoverCredentialsReady = hasPiNotifyPushoverCredentials(config);
  return [
    {
      id: "notify-pushover-enabled",
      label: "Enable pushover",
      labelTone: pushoverCredentialsReady ? undefined : "dim",
      value: pushoverCredentialsReady ? formatPiNotifyPushoverStatus(config) : "configure user/token keys first",
      valueTone: pushoverCredentialsReady ? undefined : "dim",
      values: ["on", "off"],
      disabled: !pushoverCredentialsReady,
      description: pushoverCredentialsReady
        ? "Enable or disable all Pushover delivery globally."
        : "Populate both Pushover credential fields to unlock global Pushover enablement.",
    },
    buildPiNotifyEventLauncherChoice(
      config,
      PI_NOTIFY_EVENT_MENU_DEFINITIONS.pushover,
    ),
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
      value: formatPiNotifyControlSequenceText(config["notify-pushover-text"]),
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
 * @details Reuses the pi-usereq settings-menu renderer so Pushover priority selection remains stylistically aligned with the notification menus and appends a value-less subtree-local `Reset defaults` row. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] currentPriority {PiNotifyPushoverPriority} Persisted priority value.
 * @return {Promise<PiNotifyPushoverPriority | "reset-defaults" | undefined>} Selected priority, reset action, or `undefined` when cancelled.
 * @satisfies REQ-172, REQ-192
 */
async function selectPiNotifyPushoverPriority(
  ctx: ExtensionCommandContext,
  currentPriority: PiNotifyPushoverPriority,
): Promise<PiNotifyPushoverPriority | "reset-defaults" | undefined> {
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
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default Pushover priority.",
    }),
  ], { initialSelectedId: String(currentPriority) });
  if (!choice) {
    return undefined;
  }
  if (choice === "reset-defaults") {
    return "reset-defaults";
  }
  return normalizePiNotifyPushoverPriority(choice);
}

/**
 * @brief Builds the shared settings-menu choices for notification configuration.
 * @details Serializes command-notify, sound, and Pushover blocks with dedicated shared-event submenu launchers so the settings-menu renderer can expose one unified but modular configuration surface, including locked Pushover enablement, persisted boot-sound rows that stay decoupled from the active runtime sound level, and escaped single-line rendering for `Pushover text`. Runtime is O(n) in the longest rendered command or text field. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered notification-menu choice vector.
 * @satisfies REQ-137, REQ-149, REQ-150, REQ-151, REQ-152, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-183, REQ-188, REQ-193, REQ-198, REQ-234, REQ-235, REQ-289
 */
function buildPiNotifyMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    {
      id: "notify-enabled",
      label: "Enable notification",
      value: formatPiNotifyStatus(config),
      values: ["on", "off"],
      description: "Enable or disable command-notify delivery globally.",
    },
    buildPiNotifyEventLauncherChoice(
      config,
      PI_NOTIFY_EVENT_MENU_DEFINITIONS.notification,
    ),
    {
      id: "notify-command",
      label: "Notify command",
      value: config.PI_NOTIFY_CMD,
      description: "Edit the shell command used for command-notify delivery.",
    },
    {
      id: "selected-sound-command",
      label: PI_NOTIFY_BOOT_SOUND_LABEL,
      value: config["notify-sound"],
      description: "Edit the persisted boot sound level without changing the active runtime sound level.",
    },
    buildPiNotifyEventLauncherChoice(
      config,
      PI_NOTIFY_EVENT_MENU_DEFINITIONS.sound,
    ),
    {
      id: "sound-toggle-hotkey-bind",
      label: "Sound toggle hotkey bind",
      value: config["notify-sound-toggle-shortcut"],
      description: "Edit the keyboard shortcut that cycles the active runtime sound level.",
    },
    {
      id: "sound-command-low",
      label: "Sound command (low vol.)",
      value: config.PI_NOTIFY_SOUND_LOW_CMD,
      description: "Edit the shell command used when the active runtime sound level is `low`.",
    },
    {
      id: "sound-command-mid",
      label: "Sound command (mid vol.)",
      value: config.PI_NOTIFY_SOUND_MID_CMD,
      description: "Edit the shell command used when the active runtime sound level is `mid`.",
    },
    {
      id: "sound-command-high",
      label: "Sound command (high vol.)",
      value: config.PI_NOTIFY_SOUND_HIGH_CMD,
      description: "Edit the shell command used when the active runtime sound level is `high`.",
    },
    ...buildPiNotifyPushoverRows(config),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented notification defaults for command-notify, sound, and Pushover settings.",
    }),
  ];
}

/**
 * @brief Opens the shared settings-menu selector for the persisted boot sound level.
 * @details Reuses the pi-usereq settings-menu renderer so boot-sound selection remains stylistically aligned with the notification menu, keeps the active runtime sound level unchanged, and appends a value-less subtree-local `Reset defaults` row. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] currentLevel {PiNotifySoundLevel} Persisted boot sound level.
 * @return {Promise<PiNotifySoundLevel | "reset-defaults" | undefined>} Selected boot sound level, reset action, or `undefined` when cancelled.
 * @satisfies REQ-131, REQ-179, REQ-192, REQ-289
 */
async function selectPiNotifySoundLevel(
  ctx: ExtensionCommandContext,
  currentLevel: PiNotifySoundLevel,
): Promise<PiNotifySoundLevel | "reset-defaults" | undefined> {
  const choice = await showPiUsereqSettingsMenu(ctx, PI_NOTIFY_BOOT_SOUND_LABEL, [
    {
      id: "none",
      label: "none",
      value: currentLevel === "none" ? "selected" : "",
      description: "Persist `none` as the boot sound level loaded during the next session start.",
    },
    {
      id: "low",
      label: "low",
      value: currentLevel === "low" ? "selected" : "",
      description: "Persist `low` as the boot sound level loaded during the next session start.",
    },
    {
      id: "mid",
      label: "mid",
      value: currentLevel === "mid" ? "selected" : "",
      description: "Persist `mid` as the boot sound level loaded during the next session start.",
    },
    {
      id: "high",
      label: "high",
      value: currentLevel === "high" ? "selected" : "",
      description: "Persist `high` as the boot sound level loaded during the next session start.",
    },
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default boot sound level.",
    }),
  ], { initialSelectedId: currentLevel });
  if (!choice) {
    return undefined;
  }
  if (choice === "reset-defaults") {
    return "reset-defaults";
  }
  return choice as PiNotifySoundLevel;
}

/**
 * @brief Runs the interactive notification-configuration menu.
 * @details Exposes command-notify, sound, and Pushover controls through the shared settings-menu renderer, delegates completed/interrupted/failed toggles to dedicated event submenus, persists boot-sound changes without altering the active runtime sound level, keeps `Enable pushover` locked until both credentials are populated, decodes escaped control-sequence input for `Pushover text`, and preserves row focus across menu re-renders. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<boolean>} `true` when the sound-toggle shortcut changed.
 * @satisfies REQ-131, REQ-133, REQ-134, REQ-137, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-183, REQ-184, REQ-188, REQ-192, REQ-193, REQ-195, REQ-196, REQ-198, REQ-234, REQ-235, REQ-288, REQ-289
 */
async function configurePiNotifyMenu(
  ctx: ExtensionCommandContext,
  config: UseReqConfig,
  onConfigChange: () => void,
): Promise<boolean> {
  const originalShortcut = config["notify-sound-toggle-shortcut"];
  let focusedChoiceId: string | undefined;
  while (true) {
    const choice = await showPiUsereqSettingsMenu(
      ctx,
      "Notifications",
      buildPiNotifyMenuChoices(config),
      {
        initialSelectedId: focusedChoiceId,
        getChoices: () => buildPiNotifyMenuChoices(config),
        onChange: (choiceId, newValue) => {
          if (choiceId === "notify-enabled" || choiceId === "notify-pushover-enabled") {
            if (choiceId === "notify-pushover-enabled" && !hasPiNotifyPushoverCredentials(config)) {
              config["notify-pushover-enabled"] = false;
              ctx.ui.notify("Populate both Pushover credential fields before enabling Pushover", "info");
              return;
            }
            const enabled = newValue === "on";
            config[choiceId as PiNotifyBooleanConfigKey] = enabled;
            onConfigChange();
            const labelMap: Record<string, string> = {
              "notify-enabled": "Notification",
              "notify-pushover-enabled": "Pushover",
            };
            ctx.ui.notify(`${labelMap[choiceId]} ${enabled ? "enabled" : "disabled"}`, "info");
          }
        },
      },
    );
    if (!choice) {
      return config["notify-sound-toggle-shortcut"] !== originalShortcut;
    }
    focusedChoiceId = choice;
    if (choice === "notify-enabled" || choice === "notify-pushover-enabled") {
      if (choice === "notify-pushover-enabled" && !hasPiNotifyPushoverCredentials(config)) {
        config["notify-pushover-enabled"] = false;
        ctx.ui.notify("Populate both Pushover credential fields before enabling Pushover", "info");
        continue;
      }
      const enabled = togglePiNotifyFlag(config, choice as PiNotifyBooleanConfigKey);
      onConfigChange();
      const labelMap: Record<string, string> = {
        "notify-enabled": "Notification",
        "notify-pushover-enabled": "Pushover",
      };
      ctx.ui.notify(`${labelMap[choice]} ${enabled ? "enabled" : "disabled"}`, "info");
      continue;
    }
    if (choice === PI_NOTIFY_EVENT_MENU_DEFINITIONS.notification.topLevelId) {
      await configurePiNotifyEventMenu(
        ctx,
        config,
        PI_NOTIFY_EVENT_MENU_DEFINITIONS.notification,
        onConfigChange,
      );
      continue;
    }
    if (choice === PI_NOTIFY_EVENT_MENU_DEFINITIONS.sound.topLevelId) {
      await configurePiNotifyEventMenu(
        ctx,
        config,
        PI_NOTIFY_EVENT_MENU_DEFINITIONS.sound,
        onConfigChange,
      );
      continue;
    }
    if (choice === PI_NOTIFY_EVENT_MENU_DEFINITIONS.pushover.topLevelId) {
      await configurePiNotifyEventMenu(
        ctx,
        config,
        PI_NOTIFY_EVENT_MENU_DEFINITIONS.pushover,
        onConfigChange,
      );
      continue;
    }
    if (choice === "notify-command") {
      const value = await ctx.ui.input("Notify command", config.PI_NOTIFY_CMD);
      if (value !== undefined) {
        config.PI_NOTIFY_CMD = normalizePiNotifyCommand(value, DEFAULT_PI_NOTIFY_CMD);
        onConfigChange();
        ctx.ui.notify("Updated notify command", "info");
      }
      continue;
    }
    if (choice === "selected-sound-command") {
      const nextLevel = await selectPiNotifySoundLevel(ctx, config["notify-sound"]);
      if (nextLevel === "reset-defaults") {
        const defaultSoundLevel = getDefaultConfig("")["notify-sound"];
        const approved = await confirmResetChanges(
          ctx,
          "Confirm sound reset",
          [{ label: PI_NOTIFY_BOOT_SOUND_LABEL, previousValue: config["notify-sound"], nextValue: defaultSoundLevel }]
            .filter((change) => change.previousValue !== change.nextValue),
          "Approve restoring the documented default boot sound level.",
          "Abort the boot sound reset and keep the current value.",
        );
        if (!approved) {
          ctx.ui.notify("Aborted boot sound reset", "info");
        } else {
          config["notify-sound"] = defaultSoundLevel;
          onConfigChange();
          ctx.ui.notify("Restored default boot sound level; active runtime sound is unchanged", "info");
        }
      } else if (nextLevel !== undefined) {
        config["notify-sound"] = nextLevel;
        onConfigChange();
        ctx.ui.notify(`Stored ${PI_NOTIFY_BOOT_SOUND_LABEL.toLowerCase()} as ${nextLevel}; active runtime sound is unchanged`, "info");
      }
      continue;
    }
    if (choice === "sound-toggle-hotkey-bind") {
      const value = await ctx.ui.input(
        "Sound toggle hotkey bind",
        config["notify-sound-toggle-shortcut"],
      );
      if (value?.trim()) {
        config["notify-sound-toggle-shortcut"] = value.trim();
        onConfigChange();
        ctx.ui.notify(
          `Sound toggle hotkey bind set to ${config["notify-sound-toggle-shortcut"]}`,
          "info",
        );
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
        onConfigChange();
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
        onConfigChange();
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
        onConfigChange();
        ctx.ui.notify("Updated sound command (high vol.)", "info");
      }
      continue;
    }
    if (choice === "notify-pushover-priority") {
      const nextPriority = await selectPiNotifyPushoverPriority(ctx, config["notify-pushover-priority"]);
      if (nextPriority === "reset-defaults") {
        const defaultPriority = getDefaultConfig("")["notify-pushover-priority"];
        const approved = await confirmResetChanges(
          ctx,
          "Confirm Pushover priority reset",
          [{
            label: "Pushover priority",
            previousValue: formatPiNotifyPushoverPriority(config["notify-pushover-priority"]),
            nextValue: formatPiNotifyPushoverPriority(defaultPriority),
          }].filter((change) => change.previousValue !== change.nextValue),
          "Approve restoring the documented default Pushover priority.",
          "Abort the Pushover priority reset and keep the current value.",
        );
        if (!approved) {
          ctx.ui.notify("Aborted Pushover priority reset", "info");
        } else {
          config["notify-pushover-priority"] = defaultPriority;
          onConfigChange();
          ctx.ui.notify("Restored default Pushover priority", "info");
        }
      } else if (nextPriority !== undefined) {
        config["notify-pushover-priority"] = nextPriority;
        onConfigChange();
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
        onConfigChange();
        ctx.ui.notify("Updated Pushover title", "info");
      }
      continue;
    }
    if (choice === "notify-pushover-text") {
      const value = await ctx.ui.input(
        "Pushover text",
        formatPiNotifyControlSequenceText(config["notify-pushover-text"]),
      );
      if (value !== undefined) {
        config["notify-pushover-text"] = normalizePiNotifyTemplateValue(
          parsePiNotifyControlSequenceText(value),
          DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
        );
        onConfigChange();
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
        if (!hasPiNotifyPushoverCredentials(config)) {
          config["notify-pushover-enabled"] = false;
        }
        onConfigChange();
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
        if (!hasPiNotifyPushoverCredentials(config)) {
          config["notify-pushover-enabled"] = false;
        }
        onConfigChange();
        ctx.ui.notify("Updated Pushover API token", "info");
      }
      continue;
    }
    if (choice === "reset-defaults") {
      const defaults = getDefaultConfig("");
      const resetPreview: ResetConfirmationChange[] = [
        { label: "Enable notification", previousValue: formatPiNotifyStatus(config), nextValue: formatPiNotifyStatus(defaults) },
        { label: PI_NOTIFY_BOOT_SOUND_LABEL, previousValue: config["notify-sound"], nextValue: defaults["notify-sound"] },
        { label: "Sound toggle hotkey bind", previousValue: config["notify-sound-toggle-shortcut"], nextValue: defaults["notify-sound-toggle-shortcut"] },
        { label: "Notify command", previousValue: config.PI_NOTIFY_CMD, nextValue: defaults.PI_NOTIFY_CMD },
        { label: "Sound command (low vol.)", previousValue: config.PI_NOTIFY_SOUND_LOW_CMD, nextValue: defaults.PI_NOTIFY_SOUND_LOW_CMD },
        { label: "Sound command (mid vol.)", previousValue: config.PI_NOTIFY_SOUND_MID_CMD, nextValue: defaults.PI_NOTIFY_SOUND_MID_CMD },
        { label: "Sound command (high vol.)", previousValue: config.PI_NOTIFY_SOUND_HIGH_CMD, nextValue: defaults.PI_NOTIFY_SOUND_HIGH_CMD },
        { label: "Enable pushover", previousValue: formatPiNotifyPushoverStatus(config), nextValue: formatPiNotifyPushoverStatus(defaults) },
        { label: "Pushover priority", previousValue: formatPiNotifyPushoverPriority(config["notify-pushover-priority"]), nextValue: formatPiNotifyPushoverPriority(defaults["notify-pushover-priority"]) },
        { label: "Pushover title", previousValue: config["notify-pushover-title"], nextValue: defaults["notify-pushover-title"] },
        { label: "Pushover text", previousValue: formatPiNotifyControlSequenceText(config["notify-pushover-text"]), nextValue: formatPiNotifyControlSequenceText(defaults["notify-pushover-text"]) },
        { label: "Pushover User Key/Delivery Group Key", previousValue: config["notify-pushover-user-key"] || "(empty)", nextValue: defaults["notify-pushover-user-key"] || "(empty)" },
        { label: "Pushover Token/API Token Key", previousValue: config["notify-pushover-api-token"] || "(empty)", nextValue: defaults["notify-pushover-api-token"] || "(empty)" },
      ].filter((change) => change.previousValue !== change.nextValue);
      const approved = await confirmResetChanges(
        ctx,
        "Confirm Notifications reset",
        resetPreview,
        "Approve restoring the documented notification defaults.",
        "Abort the notification reset and keep the current values.",
      );
      if (!approved) {
        ctx.ui.notify("Aborted notification reset", "info");
        continue;
      }
      resetPiNotifyConfigToDefaults(config);
      onConfigChange();
      ctx.ui.notify("Restored notification defaults", "info");
      continue;
    }
  }
}

/**
 * @brief Registers the configurable notification-sound shortcut when supported.
 * @details Loads the current project config, registers one raw pi shortcut when
 * the runtime exposes `registerShortcut(...)`, cycles only the active runtime
 * sound level on invocation, leaves `.pi-usereq.json` unchanged, refreshes the
 * status bar, and emits one info notification. Runtime is O(1) for registration
 * plus one status update per shortcut use. Side effects include shortcut
 * registration and status updates.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-134, REQ-180, REQ-286, REQ-287
 */
function registerPiNotifyShortcut(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
): void {
  const shortcutRegistrar = pi as ExtensionAPI & PiShortcutRegistrar;
  if (typeof shortcutRegistrar.registerShortcut !== "function") {
    return;
  }
  const config = loadProjectConfig(getProcessCwdSafe());
  shortcutRegistrar.registerShortcut(config["notify-sound-toggle-shortcut"], {
    description: "Cycle pi-usereq notification sound level",
    handler: async (ctx) => {
      const nextRuntimeSoundLevel = cyclePiNotifySoundLevel(
        getPiUsereqRuntimeSoundLevel(statusController),
      );
      setPiUsereqRuntimeSoundLevel(
        statusController,
        nextRuntimeSoundLevel,
        ctx,
      );
      ctx.ui.notify(`pi-usereq sound:${nextRuntimeSoundLevel}`, "info");
    },
  });
}

/**
 * @brief Registers bundled prompt commands with the extension.
 * @details Creates one `req-<prompt>` command per bundled prompt name. Each handler rejects non-`idle` workflow state, transitions the shared workflow state through `checking`, `error`, and `running`, runs dedicated prompt-command git and required-doc preflight checks, optionally prepares a dedicated worktree execution plan using the active session directory, persists the prompt metadata needed for switch-triggered rebinding, switches the active session to the verified execution cwd before prompt handoff, logs dedicated workflow-activation diagnostics, renders the prompt, starts prompt delivery into the forked active session, records `running` immediately after delivery handoff begins, and then awaits the wrapped prompt-delivery promise whose stale post-restore rejections are suppressed. Runtime is O(p) for registration; handler cost depends on prompt preflight, worktree preparation, session switching, prompt rendering, prompt dispatch, and optional debug logging. Side effects include command registration, status-controller mutation, worktree creation, active-session replacement, optional worktree rollback, user-message delivery during execution, and optional debug-log writes.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-004, REQ-067, REQ-068, REQ-169, REQ-200, REQ-201, REQ-202, REQ-203, REQ-206, REQ-207, REQ-219, REQ-220, REQ-221, REQ-224, REQ-225, REQ-226, REQ-227, REQ-245, REQ-246, REQ-247, REQ-277, REQ-281
 */
function registerPromptCommands(
  pi: ExtensionAPI,
  statusController: PiUsereqStatusController,
): void {
  PROMPT_COMMAND_NAMES.forEach((promptName) => {
    pi.registerCommand(`req-${promptName}`, {
      description: resolvePromptCommandDescription(promptName),
      handler: async (args, ctx) => {
        if (statusController.state.workflowState !== "idle") {
          const message = `ERROR: Prompt workflow state is ${statusController.state.workflowState}, expected idle.`;
          ctx.ui.notify(message, "error");
          throw new ReqError(message, 1);
        }
        const commandCwd = resolveLiveBootstrapCwd(ctx.cwd);
        syncContextCwdMirror(ctx, commandCwd);
        bootstrapRuntimePathState(commandCwd, {
          gitPath: resolveRuntimeGitPath(commandCwd),
        });
        const projectBase = getProjectBase(commandCwd);
        const config = loadProjectConfig(commandCwd);
        transitionPromptWorkflowState(
          statusController,
          ctx,
          projectBase,
          config,
          promptName,
          "checking",
        );
        ensureBundledResourcesAccessible();
        let executionPlan: PromptCommandExecutionPlan | undefined;
        let promptContext = ctx;
        try {
          executionPlan = preparePromptCommandExecution(
            promptName,
            args,
            projectBase,
            config,
            ctx.sessionManager.getSessionFile(),
            ctx.sessionManager.getSessionDir?.(),
            ctx.sessionManager.getBranch?.(),
            {
              config,
              workflowState: statusController.state.workflowState,
            },
          );
          const content = renderPrompt(
            promptName,
            args,
            projectBase,
            config,
            executionPlan,
          );
          statusController.state.pendingPromptRequest = executionPlan;
          writePersistedPromptCommandRuntimeState({
            workflowState: statusController.state.workflowState,
            pendingPromptRequest: statusController.state.pendingPromptRequest,
            activePromptRequest: statusController.state.activePromptRequest,
          });
          promptContext = (await activatePromptCommandExecution(executionPlan, ctx) ?? ctx) as typeof ctx;
          logPromptWorkflowEvent(
            projectBase,
            config,
            statusController.state.workflowState,
            promptName,
            "workflow_activation",
            {
              execution_session_file: executionPlan.executionSessionFile,
              context_path: executionPlan.contextPath,
            },
            {
              success: true,
              context_path: promptContext.cwd ?? executionPlan.contextPath,
              prompt_context_has_switch_session: typeof promptContext.switchSession === "function",
            },
          );
          renderPiUsereqStatus(statusController, promptContext);
          const promptDelivery = deliverPromptCommand(pi, content, promptContext);
          transitionPromptWorkflowState(
            statusController,
            promptContext,
            projectBase,
            config,
            promptName,
            "running",
          );
          await promptDelivery;
        } catch (error) {
          if (shouldIgnoreLatePromptDeliveryFailure(error, statusController.state.workflowState, executionPlan)) {
            return;
          }
          promptContext = (getPromptCommandErrorContext(error) ?? promptContext) as typeof ctx;
          statusController.state.pendingPromptRequest = undefined;
          statusController.state.activePromptRequest = undefined;
          transitionPromptWorkflowState(
            statusController,
            promptContext,
            projectBase,
            config,
            promptName,
            "error",
          );
          if (executionPlan !== undefined) {
            const abortResult = await abortPromptCommandExecution(executionPlan, promptContext, {
              config,
              workflowState: statusController.state.workflowState,
            });
            promptContext = (abortResult.activeContext ?? promptContext) as typeof ctx;
            if (!abortResult.cleanupSucceeded && abortResult.errorMessage) {
              notifyContextSafely(promptContext, abortResult.errorMessage, "error");
            }
          }
          const message = error instanceof Error ? error.message : String(error);
          notifyContextSafely(promptContext, message, "error");
          throw error;
        }
      },
    });
  });
}


/**
 * @brief Registers pi-usereq agent tools exposed to the model.
 * @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-100, REQ-101, REQ-102
 */
function registerAgentTools(pi: ExtensionAPI): void {
  const filesSummarizeSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
    },
    {
      description: "Input contract: files[]. Output contract: monolithic markdown in content[0].text plus details.execution diagnostics. Missing or unsupported inputs surface through execution diagnostics. The tool fails when no source file can be analyzed.",
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
      description: "Input contract: files[]. Output contract: monolithic text in content[0].text plus details.execution diagnostics.",
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
      description: "Input contract: files[]. Output contract: monolithic pack-summary text in content[0].text plus details.execution diagnostics. The tool fails when no processable files remain.",
    },
  );

  pi.registerTool({
    name: "files-tokens",
    label: "files-tokens",
    description: "Scope: explicit files. Return the monolithic token pack summary in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic token summary for caller-selected files.",
    promptGuidelines: [
      "Scope: explicit files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: monolithic pack-summary text in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Behavior contract: missing or non-file inputs surface through details.execution diagnostics; the tool fails when no processable files remain.",
    ],
    renderResult: buildStructuredToolRenderResult("files-tokens"),
    parameters: filesTokensSchema,
    async execute(_toolCallId, params) {
      return executeMonolithicTool(() => runFilesTokens(params.files));
    },
  });

  pi.registerTool({
    name: "files-summarize",
    label: "files-summarize",
    description: "Scope: explicit source files. Return the monolithic summary markdown report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic summary markdown report for caller-selected source files.",
    promptGuidelines: [
      "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: monolithic markdown in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Formatting contract: content matches the Python summary renderer used by `generate_markdown.py`.",
      "Behavior contract: missing inputs, non-file inputs, unsupported extensions, and analysis failures surface through details.execution diagnostics.",
    ],
    renderResult: buildStructuredToolRenderResult("files-summarize"),
    parameters: filesSummarizeSchema,
    async execute(_toolCallId, params) {
      const contextPath = getRuntimeContextPath(process.cwd());
      return executeMonolithicTool(() => runFilesSummarize(params.files, contextPath));
    },
  });

  const filesCompressSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, fenced code block lines include original source line-number prefixes" })),
    },
    {
      description: "Input contract: files[] plus optional enableLineNumbers. Output contract: monolithic markdown in content[0].text plus details.execution diagnostics. The tool fails when no file is compressed.",
    },
  );

  pi.registerTool({
    name: "files-compress",
    label: "files-compress",
    description: "Scope: explicit files. Return the monolithic compression markdown report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic compression markdown report for caller-selected source files.",
    promptGuidelines: [
      "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: monolithic markdown in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Formatting contract: output uses `@@@ <path> | <language>` headers, `> Lines:` metadata, and fenced code blocks matching `compress_files.py`.",
      "Line-number behavior: enableLineNumbers toggles original source line prefixes inside fenced code blocks.",
    ],
    renderResult: buildStructuredToolRenderResult("files-compress"),
    parameters: filesCompressSchema,
    async execute(_toolCallId, params) {
      const contextPath = getRuntimeContextPath(process.cwd());
      return executeMonolithicTool(() => runFilesCompress(
        params.files,
        contextPath,
        params.enableLineNumbers ?? false,
      ));
    },
  });

  const filesSearchSchema = Type.Object(
    {
      tag: Type.String({ description: "Pipe-separated construct-tag filter applied case-insensitively; unsupported tags are ignored" }),
      pattern: Type.String({ description: "JavaScript RegExp applied to construct names only; use ^...$ for exact-name matching" }),
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, fenced code block lines include original source line-number prefixes" })),
    },
    {
      description: buildSearchToolSchemaDescription("explicit-files"),
    },
  );

  pi.registerTool({
    name: "files-search",
    label: "files-search",
    description: "Scope: explicit source files. Return the monolithic construct-search markdown report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic construct-search markdown report for caller-selected source files.",
    promptGuidelines: buildSearchToolPromptGuidelines("explicit-files"),
    renderResult: buildStructuredToolRenderResult("files-search"),
    parameters: filesSearchSchema,
    async execute(_toolCallId, params) {
      return executeMonolithicTool(() => runFilesSearch(
        [params.tag, params.pattern, ...params.files],
        params.enableLineNumbers ?? false,
      ));
    },
  });

  const summarizeSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured src-dir list resolved from the current project configuration. Output contract: monolithic markdown in content[0].text plus details.execution diagnostics.",
    },
  );
  const tokensSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured docs-dir plus canonical docs REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md. Output contract: monolithic pack-summary text in content[0].text plus details.execution diagnostics.",
    },
  );

  pi.registerTool({
    name: "summarize",
    label: "summarize",
    description: "Scope: configured project source directories. Return the monolithic summary markdown report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic project summary markdown report from the configured source directories.",
    promptGuidelines: [
      "Scope: no params; resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.",
      "Output contract: monolithic markdown in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Formatting contract: content prepends the file-structure markdown block before the per-file markdown produced by `generate_markdown.py`.",
      "Configuration contract: output changes with cwd-derived project config and src-dir values; the tool does not accept explicit file overrides.",
    ],
    renderResult: buildStructuredToolRenderResult("summarize"),
    parameters: summarizeSchema,
    async execute() {
      const contextPath = getRuntimeContextPath(process.cwd());
      const projectBase = getProjectBase(contextPath);
      const config = loadProjectConfig(projectBase);
      return executeMonolithicTool(() => runSummarize(contextPath, config));
    },
  });

  const compressSchema = Type.Object(
    {
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, fenced code block lines include original source line-number prefixes" })),
    },
    {
      description: "Input contract: optional enableLineNumbers boolean. Scope is the configured src-dir list resolved from the current project configuration. Output contract: monolithic markdown in content[0].text plus details.execution diagnostics.",
    },
  );

  pi.registerTool({
    name: "compress",
    label: "compress",
    description: "Scope: configured project source directories. Return the monolithic compression markdown report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic project compression markdown report from the configured source directories.",
    promptGuidelines: [
      "Scope: resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.",
      "Output contract: monolithic markdown in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Formatting contract: output uses `@@@ <path> | <language>` headers, `> Lines:` metadata, and fenced code blocks matching `compress_files.py`.",
      "Line-number behavior: enableLineNumbers toggles original source line prefixes inside fenced code blocks.",
    ],
    renderResult: buildStructuredToolRenderResult("compress"),
    parameters: compressSchema,
    async execute(_toolCallId, params) {
      const contextPath = getRuntimeContextPath(process.cwd());
      const projectBase = getProjectBase(contextPath);
      const config = loadProjectConfig(projectBase);
      return executeMonolithicTool(() => runCompress(
        contextPath,
        config,
        params.enableLineNumbers ?? false,
      ));
    },
  });

  const searchSchema = Type.Object(
    {
      tag: Type.String({ description: "Pipe-separated construct-tag filter applied case-insensitively; unsupported tags are ignored" }),
      pattern: Type.String({ description: "JavaScript RegExp applied to construct names only; use ^...$ for exact-name matching" }),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, fenced code block lines include original source line-number prefixes" })),
    },
    {
      description: buildSearchToolSchemaDescription("configured-source-directories"),
    },
  );

  pi.registerTool({
    name: "search",
    label: "search",
    description: "Scope: configured project source directories. Return the monolithic construct-search markdown report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic construct-search markdown report from the configured source directories.",
    promptGuidelines: buildSearchToolPromptGuidelines("configured-source-directories"),
    renderResult: buildStructuredToolRenderResult("search"),
    parameters: searchSchema,
    async execute(_toolCallId, params) {
      const contextPath = getRuntimeContextPath(process.cwd());
      const projectBase = getProjectBase(contextPath);
      const config = loadProjectConfig(projectBase);
      return executeMonolithicTool(() => runSearch(
        contextPath,
        params.tag,
        params.pattern,
        config,
        params.enableLineNumbers ?? false,
      ));
    },
  });

  pi.registerTool({
    name: "tokens",
    label: "tokens",
    description: "Scope: canonical docs from the configured docs-dir. Return the monolithic token pack summary in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic token summary for canonical documentation files.",
    promptGuidelines: [
      "Scope: no params; resolve docs-dir from project config; target canonical docs REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md.",
      "Output contract: monolithic pack-summary text in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Behavior contract: missing canonical docs surface through details.execution diagnostics; the tool fails when no processable canonical docs remain.",
    ],
    renderResult: buildStructuredToolRenderResult("tokens"),
    parameters: tokensSchema,
    async execute() {
      const contextPath = getRuntimeContextPath(process.cwd());
      const projectBase = getProjectBase(contextPath);
      const config = loadProjectConfig(projectBase);
      return executeMonolithicTool(() => runTokens(contextPath, config));
    },
  });

  pi.registerTool({
    name: "files-static-check",
    label: "files-static-check",
    description: "Scope: explicit files. Return the monolithic static-check report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic explicit-file static-check report for the current project configuration.",
    promptGuidelines: [
      "Input contract: files[]. Scope is explicit caller-selected files resolved from the current working directory.",
      "Output contract: monolithic text in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Configuration contract: checker selection is derived from the cwd-resolved static-check configuration and file extensions only.",
      "Failure contract: execution diagnostics preserve failing checker output and skipped-input warnings.",
    ],
    renderResult: buildStructuredToolRenderResult("files-static-check"),
    parameters: multiFileSchema,
    async execute(_toolCallId, params) {
      const contextPath = getRuntimeContextPath(process.cwd());
      const projectBase = getProjectBase(contextPath);
      const config = loadProjectConfig(projectBase);
      return executeMonolithicTool(() => runFilesStaticCheck(params.files, projectBase, config));
    },
  });

  const staticCheckSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured src-dir plus tests-dir selection after fixture exclusion. Output contract: monolithic text in content[0].text plus details.execution diagnostics.",
    },
  );
  pi.registerTool({
    name: "static-check",
    label: "static-check",
    description: "Scope: configured source and test directories. Return the monolithic static-check report in content[0].text and keep only execution metadata in details.execution.",
    promptSnippet: "Return the monolithic project static-check report for the current configuration.",
    promptGuidelines: [
      "Input contract: no params. Scope is src-dir plus tests-dir from the cwd-derived project configuration.",
      "Output contract: monolithic text in content[0].text; details.execution preserves only exit code and residual diagnostics.",
      "Selection contract: tests/fixtures and <tests-dir>/fixtures are excluded before checker dispatch.",
      "Failure contract: execution diagnostics preserve failing checker output and skipped-selection warnings.",
    ],
    renderResult: buildStructuredToolRenderResult("static-check"),
    parameters: staticCheckSchema,
    async execute() {
      const contextPath = getRuntimeContextPath(process.cwd());
      const projectBase = getProjectBase(contextPath);
      const config = loadProjectConfig(projectBase);
      return executeMonolithicTool(() => runProjectStaticCheck(contextPath, config));
    },
  });

}

/**
 * @brief Builds the shared settings-menu choices for startup-tool management.
 * @details Serializes startup-tool actions into right-valued menu rows consumed by the shared settings-menu renderer while omitting the removed status-reference action. Runtime is O(t) in configurable-tool count. No external state is mutated.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered startup-tool menu choices.
 * @satisfies REQ-007, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193
 */
function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const tools = getPiUsereqStartupTools(pi);
  return [
    {
      id: "enable-tools",
      label: "Enable tools",
      value: `${getConfiguredEnabledPiUsereqTools(config).length} enabled`,
      description: "Open the per-tool enablement menu for configurable startup tools.",
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
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default startup-tool selection.",
    }),
  ];
}

/**
 * @brief Builds the shared settings-menu choices for per-tool startup toggles.
 * @details Exposes every configurable startup tool as one row whose right-side value reports the current enabled state, preserves the documented custom/files/embedded/default-disabled ordering, and appends a value-less subtree-local `Reset defaults` row. Runtime is O(t) in configurable-tool count. No external state is mutated.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered per-tool toggle choices.
 * @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154, REQ-231, REQ-232
 */
function buildPiUsereqToolToggleChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  return [
    ...getPiUsereqStartupTools(pi).map((tool) => ({
      id: tool.name,
      label: tool.name,
      value: enabledTools.has(tool.name) ? "on" : "off",
      values: ["on", "off"],
      description: tool.description ?? `Toggle startup activation for ${tool.name}.`,
    })),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default startup-tool selection.",
    }),
  ];
}

/**
 * @brief Runs the interactive active-tool configuration menu.
 * @details Synchronizes runtime active tools with persisted config, renders startup-tool actions through the shared settings-menu UI, preserves the documented per-tool ordering, and updates configuration state in response to selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<void>} Promise resolved when the menu closes.
 * @satisfies REQ-007, REQ-063, REQ-064, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193, REQ-231, REQ-232
 */
async function configurePiUsereqToolsMenu(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  config: UseReqConfig,
  onConfigChange: () => void,
): Promise<void> {
  applyConfiguredPiUsereqTools(pi, config);
  let focusedChoiceId: string | undefined;
  while (true) {
    const tools = getPiUsereqStartupTools(pi);
    const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
    const choice = await showPiUsereqSettingsMenu(ctx, "Enable tools", buildPiUsereqToolsMenuChoices(pi, config), {
      initialSelectedId: focusedChoiceId,
    });

    if (!choice) {
      return;
    }
    focusedChoiceId = choice;

    if (choice === "enable-all-tools") {
      setConfiguredPiUsereqTools(pi, config, tools.map((tool) => tool.name));
      onConfigChange();
      ctx.ui.notify("Enabled all configurable active tools", "info");
      continue;
    }

    if (choice === "disable-all-tools") {
      setConfiguredPiUsereqTools(pi, config, []);
      onConfigChange();
      ctx.ui.notify("Disabled all configurable active tools", "info");
      continue;
    }

    if (choice === "reset-defaults") {
      const approved = await confirmResetChanges(
        ctx,
        "Confirm Enable tools reset",
        [{
          label: "Enable tools",
          previousValue: String(getConfiguredEnabledPiUsereqTools(config).length),
          nextValue: String(normalizeEnabledPiUsereqTools(undefined).length),
        }].filter((change) => change.previousValue !== change.nextValue),
        "Approve restoring the documented default startup-tool selection.",
        "Abort the startup-tool reset and keep the current values.",
      );
      if (!approved) {
        ctx.ui.notify("Aborted startup-tool reset", "info");
        continue;
      }
      setConfiguredPiUsereqTools(pi, config, normalizeEnabledPiUsereqTools(undefined));
      onConfigChange();
      ctx.ui.notify("Restored default configurable active tools", "info");
      continue;
    }

    if (choice === "enable-tools") {
      const selectedToolName = await showPiUsereqSettingsMenu(ctx, "Enable tools", buildPiUsereqToolToggleChoices(pi, config), {
        getChoices: () => buildPiUsereqToolToggleChoices(pi, config),
        onChange: (toolName, newValue) => {
          const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
          if (newValue === "on") {
            enabledTools.add(toolName as PiUsereqStartupToolName);
          } else {
            enabledTools.delete(toolName as PiUsereqStartupToolName);
          }
          setConfiguredPiUsereqTools(
            pi,
            config,
            getPiUsereqStartupTools(pi)
              .map((tool) => tool.name)
              .filter((currentToolName) => enabledTools.has(currentToolName)),
          );
          onConfigChange();
          ctx.ui.notify(
            `${newValue === "on" ? "Enabled" : "Disabled"} ${toolName}`,
            "info",
          );
        },
      });
      if (!selectedToolName) {
        continue;
      }
      if (selectedToolName === "reset-defaults") {
        const approved = await confirmResetChanges(
          ctx,
          "Confirm Enable tools reset",
          [{
            label: "Enable tools",
            previousValue: String(getConfiguredEnabledPiUsereqTools(config).length),
            nextValue: String(normalizeEnabledPiUsereqTools(undefined).length),
          }].filter((change) => change.previousValue !== change.nextValue),
          "Approve restoring the documented default startup-tool selection.",
          "Abort the startup-tool reset and keep the current values.",
        );
        if (!approved) {
          ctx.ui.notify("Aborted startup-tool reset", "info");
          continue;
        }
        setConfiguredPiUsereqTools(pi, config, normalizeEnabledPiUsereqTools(undefined));
        onConfigChange();
        ctx.ui.notify("Restored default configurable active tools", "info");
        continue;
      }
      if (enabledTools.has(selectedToolName)) {
        enabledTools.delete(selectedToolName);
      } else {
        enabledTools.add(selectedToolName);
      }
      setConfiguredPiUsereqTools(pi, config, tools.map((tool) => tool.name).filter((toolName) => enabledTools.has(toolName)));
      onConfigChange();
      ctx.ui.notify(
        `${enabledTools.has(selectedToolName) ? "Enabled" : "Disabled"} ${selectedToolName}`,
        "info",
      );
    }
  }
}

/**
 * @brief Resolves one static-check language config for menu rendering.
 * @details Returns the configured per-language static-check object when present and otherwise synthesizes a disabled empty-language object so menu code can render all supported languages deterministically. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] language {string} Canonical language name.
 * @return {StaticCheckLanguageConfig} Resolved per-language config object.
 */
function getStaticCheckLanguageConfigForMenu(
  config: UseReqConfig,
  language: string,
): StaticCheckLanguageConfig {
  return config["static-check"][language] ?? createStaticCheckLanguageConfig([]);
}

/**
 * @brief Counts languages that currently expose at least one configured checker.
 * @details Treats configured-but-disabled languages as configured when their checker list is non-empty so removal actions remain deterministic. Runtime is O(l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {number} Number of languages with at least one configured checker.
 */
function countConfiguredStaticCheckLanguages(config: UseReqConfig): number {
  return Object.values(config["static-check"]).filter((languageConfig) => languageConfig.checkers.length > 0).length;
}

/**
 * @brief Counts languages whose static-check enable flag is on.
 * @details Counts only languages whose persisted per-language config explicitly sets `enabled=enable`, regardless of checker count. Runtime is O(l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {number} Number of enabled languages.
 */
function countEnabledStaticCheckLanguages(config: UseReqConfig): number {
  return Object.values(config["static-check"]).filter((languageConfig) => languageConfig.enabled === "enable").length;
}

/**
 * @brief Restores the documented static-check default configuration.
 * @details Replaces the mutable config subtree with a fresh clone of the documented per-language defaults so menu reset actions restore both enable flags and checker lists in one step. Runtime is O(l + c). Side effect: mutates `config`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {void} No return value.
 * @satisfies REQ-250, REQ-251, REQ-252
 */
function resetStaticCheckConfig(config: UseReqConfig): void {
  config["static-check"] = getDefaultStaticCheckConfig();
}

/**
 * @brief Summarizes enabled and configured static-check languages.
 * @details Counts enabled languages and languages with at least one checker, then emits one compact summary string suitable for the top-level configuration menu. Runtime is O(l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Compact summary string.
 */
function formatStaticCheckLanguagesSummary(config: UseReqConfig): string {
  return `${countEnabledStaticCheckLanguages(config)} enabled • ${countConfiguredStaticCheckLanguages(config)} configured`;
}

/**
 * @brief Builds the shared settings-menu choices for static-check management.
 * @details Serializes guided Command-oriented add and remove actions, renders one direct on/off toggle row for every supported language, and appends canonical terminal rows while omitting raw-spec and reference-only actions. Runtime is O(l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered static-check menu choices.
 * @satisfies REQ-008, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-160, REQ-161, REQ-193, REQ-248
 */
function buildStaticCheckMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  const supportedLanguages = getSupportedStaticCheckLanguageSupport();
  const configuredLanguageCount = countConfiguredStaticCheckLanguages(config);
  return [
    {
      id: "add-static-check-entry",
      label: "Add static code checker",
      value: `${supportedLanguages.length} languages`,
      description: "Select a supported language, then configure one Command static-check executable.",
    },
    {
      id: "remove-static-check-entry",
      label: "Remove static code checker",
      value: configuredLanguageCount > 0 ? `${configuredLanguageCount} configured` : "(none)",
      description: "Remove every configured static-check entry for one language.",
    },
    ...supportedLanguages.map(({ language, extensions }) => {
      const languageConfig = getStaticCheckLanguageConfigForMenu(config, language);
      const configuredCount = languageConfig.checkers.length;
      const suffix = configuredCount === 1 ? "checker" : "checkers";
      return {
        id: `toggle-static-check-language:${language}`,
        label: language,
        value: languageConfig.enabled === "enable" ? "on" : "off",
        values: ["on", "off"],
        description: `Toggle static-check execution for ${language}. Configured ${configuredCount} ${suffix}. Supported extensions: ${extensions.join(", ")}.`,
      };
    }),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented per-language static-check defaults.",
    }),
  ];
}

/**
 * @brief Builds the shared settings-menu choices for supported static-check languages.
 * @details Exposes every supported language as one row whose right-side value reports extensions, enablement, and configured checker count for guided Command configuration flows, then appends subtree-local terminal rows. Runtime is O(l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered language-choice vector.
 */
function buildSupportedStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    ...getSupportedStaticCheckLanguageSupport().map(({ language, extensions }) => {
      const languageConfig = getStaticCheckLanguageConfigForMenu(config, language);
      const configuredCount = languageConfig.checkers.length;
      const suffix = configuredCount === 1 ? "checker" : "checkers";
      return {
        id: language,
        label: language,
        value: `${extensions.join(", ")} • ${languageConfig.enabled === "enable" ? "on" : "off"} • ${configuredCount} ${suffix}`,
        description: `Configure the Command static-check entries for ${language}. Supported extensions: ${extensions.join(", ")}.`,
      };
    }),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented per-language static-check defaults.",
    }),
  ];
}

/**
 * @brief Builds the shared settings-menu choices for configured static-check languages.
 * @details Exposes only languages whose checker lists are non-empty so removal remains deterministic, then appends subtree-local terminal rows. Runtime is O(l). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered configured-language vector.
 */
function buildConfiguredStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[] {
  return [
    ...getSupportedStaticCheckLanguageSupport()
      .filter(({ language }) => getStaticCheckLanguageConfigForMenu(config, language).checkers.length > 0)
      .map(({ language, extensions }) => {
        const languageConfig = getStaticCheckLanguageConfigForMenu(config, language);
        return {
          id: language,
          label: language,
          value: `${extensions.join(", ")} • ${languageConfig.checkers.length} configured`,
          description: `Remove every configured static-check entry for ${language}.`,
        };
      }),
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented per-language static-check defaults.",
    }),
  ];
}

/**
 * @brief Runs the interactive static-check configuration menu.
 * @details Lets the user add Command entries by guided prompts, remove configured language entries, toggle direct per-language enable flags, and reset the subtree to documented defaults through the shared settings-menu renderer until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<void>} Promise resolved when the menu closes.
 * @satisfies REQ-008, REQ-151, REQ-152, REQ-153, REQ-154, REQ-160, REQ-161, REQ-193, REQ-195, REQ-248, REQ-253
 */
async function configureStaticCheckMenu(
  ctx: ExtensionCommandContext,
  config: UseReqConfig,
  onConfigChange: () => void,
): Promise<void> {
  let focusedChoiceId: string | undefined;
  while (true) {
    const staticChoice = await showPiUsereqSettingsMenu(ctx, "Language static code checkers", buildStaticCheckMenuChoices(config), {
      initialSelectedId: focusedChoiceId,
      getChoices: () => buildStaticCheckMenuChoices(config),
      onChange: (choiceId, newValue) => {
        if (choiceId.startsWith("toggle-static-check-language:")) {
          const language = choiceId.slice("toggle-static-check-language:".length);
          config["static-check"][language] ??= createStaticCheckLanguageConfig([]);
          config["static-check"][language]!.enabled = newValue === "on" ? "enable" : "disable";
          onConfigChange();
          ctx.ui.notify(
            `${newValue === "on" ? "Enabled" : "Disabled"} static-check for ${language}`,
            "info",
          );
        }
      },
    });

    if (!staticChoice) {
      return;
    }
    focusedChoiceId = staticChoice;

    if (staticChoice.startsWith("toggle-static-check-language:")) {
      const language = staticChoice.slice("toggle-static-check-language:".length);
      config["static-check"][language] ??= createStaticCheckLanguageConfig([]);
      const languageConfig = config["static-check"][language]!;
      languageConfig.enabled = languageConfig.enabled === "enable" ? "disable" : "enable";
      onConfigChange();
      ctx.ui.notify(
        `${languageConfig.enabled === "enable" ? "Enabled" : "Disabled"} static-check for ${language}`,
        "info",
      );
      continue;
    }

    if (staticChoice === "add-static-check-entry") {
      const selectedLanguage = await showPiUsereqSettingsMenu(ctx, "static-check language", buildSupportedStaticCheckLanguageChoices(config));
      if (!selectedLanguage) {
        continue;
      }
      if (selectedLanguage === "reset-defaults") {
        const approved = await confirmResetChanges(
          ctx,
          "Confirm static-check reset",
          [{
            label: "Language static code checkers",
            previousValue: formatStaticCheckLanguagesSummary(config),
            nextValue: formatStaticCheckLanguagesSummary({ ...config, "static-check": getDefaultStaticCheckConfig() }),
          }].filter((change) => change.previousValue !== change.nextValue),
          "Approve restoring the documented per-language static-check defaults.",
          "Abort the static-check reset and keep the current values.",
        );
        if (!approved) {
          ctx.ui.notify("Aborted static-check reset", "info");
          continue;
        }
        resetStaticCheckConfig(config);
        onConfigChange();
        ctx.ui.notify("Restored default static code checker configuration", "info");
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

      config["static-check"][selectedLanguage] ??= createStaticCheckLanguageConfig([]);
      config["static-check"][selectedLanguage]!.enabled = "enable";
      config["static-check"][selectedLanguage]!.checkers.push(entry);
      onConfigChange();
      ctx.ui.notify(`Added ${entry.module} checker for ${selectedLanguage}`, "info");
      continue;
    }

    if (staticChoice === "remove-static-check-entry") {
      const configuredLanguage = await showPiUsereqSettingsMenu(ctx, "Remove static code checker", buildConfiguredStaticCheckLanguageChoices(config));
      if (!configuredLanguage) {
        continue;
      }
      if (configuredLanguage === "reset-defaults") {
        const approved = await confirmResetChanges(
          ctx,
          "Confirm static-check reset",
          [{
            label: "Language static code checkers",
            previousValue: formatStaticCheckLanguagesSummary(config),
            nextValue: formatStaticCheckLanguagesSummary({ ...config, "static-check": getDefaultStaticCheckConfig() }),
          }].filter((change) => change.previousValue !== change.nextValue),
          "Approve restoring the documented per-language static-check defaults.",
          "Abort the static-check reset and keep the current values.",
        );
        if (!approved) {
          ctx.ui.notify("Aborted static-check reset", "info");
          continue;
        }
        resetStaticCheckConfig(config);
        onConfigChange();
        ctx.ui.notify("Restored default static code checker configuration", "info");
        continue;
      }
      config["static-check"][configuredLanguage] = createStaticCheckLanguageConfig([]);
      onConfigChange();
      ctx.ui.notify(`Removed static-check entries for ${configuredLanguage}`, "info");
      continue;
    }

    if (staticChoice === "reset-defaults") {
      const approved = await confirmResetChanges(
        ctx,
        "Confirm static-check reset",
        [{
          label: "Language static code checkers",
          previousValue: formatStaticCheckLanguagesSummary(config),
          nextValue: formatStaticCheckLanguagesSummary({ ...config, "static-check": getDefaultStaticCheckConfig() }),
        }].filter((change) => change.previousValue !== change.nextValue),
        "Approve restoring the documented per-language static-check defaults.",
        "Abort the static-check reset and keep the current values.",
      );
      if (!approved) {
        ctx.ui.notify("Aborted static-check reset", "info");
        continue;
      }
      resetStaticCheckConfig(config);
      onConfigChange();
      ctx.ui.notify("Restored default static code checker configuration", "info");
    }
  }
}

/**
 * @brief Builds the shared settings-menu choices for the top-level pi-usereq configuration UI.
 * @details Serializes primary configuration actions into right-valued menu rows consumed by the shared settings-menu renderer, including automatic git-commit mode, effective prompt-command worktree state, notification summary, debug summary, locked worktree rows when automatic git commit is disabled, and the display-only config path beside `show-config`. Runtime is O(s) in source-directory count. No external state is mutated.
 * @param[in] cwd {string} Current working directory.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {PiUsereqSettingsMenuChoice[]} Ordered top-level menu choices.
 * @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-162, REQ-190, REQ-191, REQ-197, REQ-204, REQ-205, REQ-212, REQ-215, REQ-216, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240
 */
function buildPiUsereqMenuChoices(
  cwd: string,
  config: UseReqConfig,
): PiUsereqSettingsMenuChoice[] {
  const autoGitCommitDisabled = config.AUTO_GIT_COMMIT === "disable";
  const effectiveGitWorktreeEnabled = resolveEffectiveGitWorktreeEnabled(
    config.AUTO_GIT_COMMIT,
    config.GIT_WORKTREE_ENABLED,
  );
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
      id: "auto-git-commit",
      label: "Auto git commit",
      value: config.AUTO_GIT_COMMIT,
      values: ["enable", "disable"],
      description: "Select bundled `git_commit.md` or `git_read-only.md` for `%%COMMIT%%`; disabling also forces prompt-command worktrees off.",
    },
    {
      id: "git-worktree-enabled",
      label: "Git worktree",
      labelTone: autoGitCommitDisabled ? "dim" : undefined,
      value: effectiveGitWorktreeEnabled,
      valueTone: autoGitCommitDisabled ? "dim" : undefined,
      values: ["enable", "disable"],
      disabled: autoGitCommitDisabled,
      description: autoGitCommitDisabled
        ? "Forced to `disable` while `Auto git commit` is disabled."
        : "Enable or disable prompt-command worktree orchestration.",
    },
    {
      id: "git-worktree-prefix",
      label: "Worktree prefix",
      labelTone: autoGitCommitDisabled ? "dim" : undefined,
      value: config.GIT_WORKTREE_PREFIX,
      valueTone: autoGitCommitDisabled ? "dim" : undefined,
      description: autoGitCommitDisabled
        ? "Stored prefix is locked while `Auto git commit` is disabled."
        : "Edit the static prefix used by generated worktree names.",
    },
    {
      id: "static-check",
      label: "Language static code checkers",
      value: formatStaticCheckLanguagesSummary(config),
      description: "Manage guided Command static-check entries and per-language enable flags.",
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
      value: `notification:${formatPiNotifyStatus(config)} • sound:${config["notify-sound"]} • pushover:${formatPiNotifyPushoverStatus(config)}`,
      description: "Manage command-notify, sound, and Pushover settings with dedicated event submenus.",
    },
    {
      id: "debug",
      label: "Debug",
      value: formatDebugMenuSummary(config),
      description: "Manage debug logging for tools and `req-*` prompt orchestration.",
    },
    {
      id: "show-config",
      label: "Show configuration",
      value: formatProjectConfigPathForMenu(cwd),
      valueTone: "dim",
      description: "Persist the current project configuration file and write its exact text into the editor.",
    },
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the default pi-usereq configuration for the current project base.",
    }),
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
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default source-directory configuration.",
    }),
  ];
}

/**
 * @brief Builds the shared settings-menu choices for removing one source-directory entry.
 * @details Exposes every configured `src-dir` entry as one removable row and appends a value-less subtree-local `Reset defaults` row. Runtime is O(s) in source-directory count. No external state is mutated.
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
    ...buildTerminalSettingsMenuChoices({
      resetDefaultsDescription: "Restore the documented default source-directory configuration.",
    }),
  ];
}

/**
 * @brief Runs the top-level pi-usereq configuration menu.
 * @details Loads project config, exposes docs/test/source/automatic-commit/worktree/static-check/startup-tool/notification/debug actions through the shared settings-menu renderer, forces worktree disablement when automatic git commit is disabled, prevents locked row edits, persists changes on exit, closes immediately after `Show configuration`, and refreshes the single-line status bar. Runtime depends on user interaction count. Side effects include UI updates, config writes, active-tool changes, and editor text updates.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
 * @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
 * @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-162, REQ-190, REQ-191, REQ-192, REQ-194, REQ-195, REQ-204, REQ-205, REQ-212, REQ-215, REQ-216, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243
 */
async function configurePiUsereq(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  statusController: PiUsereqStatusController,
): Promise<void> {
  bootstrapRuntimePathState(ctx.cwd, {
    gitPath: resolveRuntimeGitPath(ctx.cwd),
  });
  let config = loadProjectConfig(ctx.cwd);
  const projectBase = getProjectBase(ctx.cwd);
  const initialShortcut = config["notify-sound-toggle-shortcut"];
  const persistConfigChange = () => {
    Object.assign(config, normalizeConfigPaths(projectBase, config));
    saveProjectConfig(ctx.cwd, config);
    setPiUsereqStatusConfig(statusController, config);
    renderPiUsereqStatus(statusController, ctx);
  };

  let focusedChoiceId: string | undefined;
  while (true) {
    const choice = await showPiUsereqSettingsMenu(
      ctx,
      "pi-usereq",
      buildPiUsereqMenuChoices(ctx.cwd, config),
      {
        initialSelectedId: focusedChoiceId,
        getChoices: () => buildPiUsereqMenuChoices(ctx.cwd, config),
        onChange: (choiceId, newValue) => {
          if (choiceId === "auto-git-commit") {
            config.AUTO_GIT_COMMIT = newValue === "enable" ? "enable" : "disable";
            if (config.AUTO_GIT_COMMIT === "disable") {
              config.GIT_WORKTREE_ENABLED = "disable";
              persistConfigChange();
              ctx.ui.notify("Auto git commit disabled; Git worktree forced off", "info");
            } else {
              persistConfigChange();
              ctx.ui.notify("Auto git commit enabled", "info");
            }
            return;
          }
          if (choiceId === "git-worktree-enabled") {
            if (config.AUTO_GIT_COMMIT === "disable") {
              ctx.ui.notify("Git worktree is locked while Auto git commit is disabled", "info");
              return;
            }
            config.GIT_WORKTREE_ENABLED = newValue === "enable" ? "enable" : "disable";
            persistConfigChange();
            ctx.ui.notify(
              `Git worktree ${resolveEffectiveGitWorktreeEnabled(config.AUTO_GIT_COMMIT, config.GIT_WORKTREE_ENABLED) === "enable" ? "enabled" : "disabled"}`,
              "info",
            );
          }
        },
      },
    );
    if (!choice) {
      if (config["notify-sound-toggle-shortcut"] !== initialShortcut) {
        ctx.ui.notify("Sound toggle hotkey bind updated; run /reload to apply the new binding", "info");
      }
      return;
    }
    focusedChoiceId = choice;
    if (choice === "docs-dir") {
      const value = await ctx.ui.input("Document directory", config["docs-dir"]);
      if (value?.trim()) {
        config["docs-dir"] = value.trim();
        persistConfigChange();
      }
      continue;
    }
    if (choice === "tests-dir") {
      const value = await ctx.ui.input("Unit tests directory", config["tests-dir"]);
      if (value?.trim()) {
        config["tests-dir"] = value.trim();
        persistConfigChange();
      }
      continue;
    }
    if (choice === "auto-git-commit") {
      const nextAutoGitCommit = config.AUTO_GIT_COMMIT === "enable"
        ? "disable"
        : "enable";
      config.AUTO_GIT_COMMIT = nextAutoGitCommit;
      if (nextAutoGitCommit === "disable") {
        config.GIT_WORKTREE_ENABLED = "disable";
        persistConfigChange();
        ctx.ui.notify("Auto git commit disabled; Git worktree forced off", "info");
      } else {
        persistConfigChange();
        ctx.ui.notify("Auto git commit enabled", "info");
      }
      continue;
    }
    if (choice === "git-worktree-enabled") {
      if (config.AUTO_GIT_COMMIT === "disable") {
        ctx.ui.notify("Git worktree is locked while Auto git commit is disabled", "info");
        continue;
      }
      config.GIT_WORKTREE_ENABLED = config.GIT_WORKTREE_ENABLED === "enable"
        ? "disable"
        : "enable";
      persistConfigChange();
      ctx.ui.notify(
        `Git worktree ${resolveEffectiveGitWorktreeEnabled(config.AUTO_GIT_COMMIT, config.GIT_WORKTREE_ENABLED) === "enable" ? "enabled" : "disabled"}`,
        "info",
      );
      continue;
    }
    if (choice === "git-worktree-prefix") {
      if (config.AUTO_GIT_COMMIT === "disable") {
        ctx.ui.notify("Worktree prefix is locked while Auto git commit is disabled", "info");
        continue;
      }
      const value = await ctx.ui.input("Worktree prefix", config.GIT_WORKTREE_PREFIX);
      if (value !== undefined) {
        config.GIT_WORKTREE_PREFIX = value.trim() || DEFAULT_GIT_WORKTREE_PREFIX;
        persistConfigChange();
        ctx.ui.notify(`Worktree prefix set to ${config.GIT_WORKTREE_PREFIX}`, "info");
      }
      continue;
    }
    if (choice === "src-dir") {
      let srcFocusedChoiceId: string | undefined;
      while (true) {
        const srcAction = await showPiUsereqSettingsMenu(ctx, "Source-code directories", buildSrcDirMenuChoices(config), {
          initialSelectedId: srcFocusedChoiceId,
        });
        if (!srcAction) {
          break;
        }
        srcFocusedChoiceId = srcAction;
        if (srcAction === "add-src-dir-entry") {
          const value = await ctx.ui.input("New source-code directory", "src");
          if (value?.trim()) {
            config["src-dir"] = [...config["src-dir"], value.trim()];
            persistConfigChange();
          }
          continue;
        }
        if (srcAction === "remove-src-dir-entry") {
          const toRemove = await showPiUsereqSettingsMenu(ctx, "Remove source-code directory", buildSrcDirRemovalChoices(config));
          if (!toRemove) {
            continue;
          }
          if (toRemove === "reset-defaults") {
            const approved = await confirmResetChanges(
              ctx,
              "Confirm source-directory reset",
              [{
                label: "Source-code directories",
                previousValue: config["src-dir"].join(", "),
                nextValue: DEFAULT_SRC_DIRS.join(", "),
              }].filter((change) => change.previousValue !== change.nextValue),
              "Approve restoring the documented default source-directory configuration.",
              "Abort the source-directory reset and keep the current values.",
            );
            if (!approved) {
              ctx.ui.notify("Aborted source-directory reset", "info");
              continue;
            }
            config["src-dir"] = [...DEFAULT_SRC_DIRS];
            persistConfigChange();
            ctx.ui.notify("Restored default source-code directories", "info");
            continue;
          }
          config["src-dir"] = config["src-dir"].filter((entry) => entry !== toRemove);
          if (config["src-dir"].length === 0) {
            config["src-dir"] = ["src"];
          }
          persistConfigChange();
          continue;
        }
        if (srcAction === "reset-defaults") {
          const approved = await confirmResetChanges(
            ctx,
            "Confirm source-directory reset",
            [{
              label: "Source-code directories",
              previousValue: config["src-dir"].join(", "),
              nextValue: DEFAULT_SRC_DIRS.join(", "),
            }].filter((change) => change.previousValue !== change.nextValue),
            "Approve restoring the documented default source-directory configuration.",
            "Abort the source-directory reset and keep the current values.",
          );
          if (!approved) {
            ctx.ui.notify("Aborted source-directory reset", "info");
            continue;
          }
          config["src-dir"] = [...DEFAULT_SRC_DIRS];
          persistConfigChange();
          ctx.ui.notify("Restored default source-code directories", "info");
        }
      }
      continue;
    }
    if (choice === "static-check") {
      await configureStaticCheckMenu(ctx, config, persistConfigChange);
      continue;
    }
    if (choice === "startup-tools") {
      await configurePiUsereqToolsMenu(pi, ctx, config, persistConfigChange);
      continue;
    }
    if (choice === "notifications") {
      await configurePiNotifyMenu(ctx, config, persistConfigChange);
      continue;
    }
    if (choice === "debug") {
      await configureDebugMenu(ctx, config, persistConfigChange);
      continue;
    }
    if (choice === "reset-defaults") {
      const defaultConfig = getDefaultConfig(projectBase);
      const approved = await confirmResetChanges(
        ctx,
        "Confirm pi-usereq reset",
        [
          { label: "Document directory", previousValue: config["docs-dir"], nextValue: defaultConfig["docs-dir"] },
          { label: "Source-code directories", previousValue: config["src-dir"].join(", "), nextValue: defaultConfig["src-dir"].join(", ") },
          { label: "Unit tests directory", previousValue: config["tests-dir"], nextValue: defaultConfig["tests-dir"] },
          { label: "Auto git commit", previousValue: config.AUTO_GIT_COMMIT, nextValue: defaultConfig.AUTO_GIT_COMMIT },
          { label: "Git worktree", previousValue: config.GIT_WORKTREE_ENABLED, nextValue: defaultConfig.GIT_WORKTREE_ENABLED },
          { label: "Worktree prefix", previousValue: config.GIT_WORKTREE_PREFIX, nextValue: defaultConfig.GIT_WORKTREE_PREFIX },
          { label: "Enable tools", previousValue: String(getConfiguredEnabledPiUsereqTools(config).length), nextValue: String(getConfiguredEnabledPiUsereqTools(defaultConfig).length) },
          { label: "Notifications", previousValue: buildPiNotifyMenuChoices(config).length.toString(), nextValue: buildPiNotifyMenuChoices(defaultConfig).length.toString() },
          { label: "Debug", previousValue: formatDebugMenuSummary(config), nextValue: formatDebugMenuSummary(defaultConfig) },
        ].filter((change) => change.previousValue !== change.nextValue),
        "Approve restoring the default pi-usereq configuration.",
        "Abort the pi-usereq reset and keep the current values.",
      );
      if (!approved) {
        ctx.ui.notify("Aborted pi-usereq reset", "info");
        continue;
      }
      config = defaultConfig;
      applyConfiguredPiUsereqTools(pi, config);
      persistConfigChange();
      ctx.ui.notify("Restored all default configuration values", "info");
      continue;
    }
    if (choice === "show-config") {
      persistConfigChange();
      if (config["notify-sound-toggle-shortcut"] !== initialShortcut) {
        ctx.ui.notify("Sound toggle hotkey bind updated; run /reload to apply the new binding", "info");
      }
      writePersistedProjectConfigToEditor(ctx, ctx.cwd, config);
      return;
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
 * notification-sound shortcut when the runtime supports shortcuts, and
 * installs shared wrappers for all supported pi lifecycle hooks so status
 * telemetry, context usage, prompt timing, cumulative runtime, prompt-specific
 * Pushover metadata, tool-result debug logging, and prompt-orchestration debug
 * effects remain synchronized with runtime events. Runtime is O(h) in hook
 * count during registration. Side effects include filesystem reads,
 * command/tool/shortcut registration, UI updates, active-tool changes,
 * optional debug-log writes, and timer scheduling.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-067, REQ-068, REQ-109, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118, REQ-119, REQ-120, REQ-121, REQ-122, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-131, REQ-132, REQ-133, REQ-134, REQ-137, REQ-159, REQ-163, REQ-164, REQ-165, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-174, REQ-179, REQ-180, REQ-184, REQ-188, REQ-190, REQ-191, REQ-192, REQ-193, REQ-194, REQ-195, REQ-196, REQ-197, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243, REQ-244, REQ-245, REQ-246, REQ-247
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
