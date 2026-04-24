/**
 * @file
 * @brief Declares debug inventories, normalizers, and JSON log persistence helpers.
 * @details Centralizes debug-menu selector inventories, config-field normalization, workflow-status gating, and append-only JSON log writing for tool, prompt, and dedicated workflow debug events. Runtime is dominated by JSON serialization plus filesystem I/O during log writes. Side effects include directory creation and file overwrite when debug entries are appended.
 */

import fs from "node:fs";
import path from "node:path";
import type { UseReqConfig } from "./config.js";
import {
  PI_USEREQ_CUSTOM_TOOL_NAMES,
  PI_USEREQ_EMBEDDED_TOOL_NAMES,
} from "./pi-usereq-tools.js";
import {
  PROMPT_COMMAND_NAMES,
  formatPromptCommandName,
  type PromptCommandName,
} from "./prompt-command-catalog.js";

/**
 * @brief Defines the default global debug mode.
 * @details New configs disable debug logging until the user explicitly enables the `Debug` submenu root flag. Access complexity is O(1).
 * @satisfies CTN-013, REQ-236
 */
export const DEFAULT_DEBUG_ENABLED = "disable" as const;

/**
 * @brief Defines the default debug log file value.
 * @details New configurations write debug JSON entries to `/tmp/PI-useReq.json` unless the user overrides the path. Access complexity is O(1).
 * @satisfies CTN-013, REQ-237
 */
export const DEFAULT_DEBUG_LOG_FILE = "/tmp/PI-useReq.json";

/**
 * @brief Defines the default workflow-transition logging mode.
 * @details New configs suppress `workflow_state` entries until the user explicitly enables status-change logging. Access complexity is O(1).
 * @satisfies CTN-013, REQ-254
 */
export const DEFAULT_DEBUG_STATUS_CHANGES = "disable" as const;

/**
 * @brief Defines the default dedicated workflow-event logging mode.
 * @details New configs suppress session-activation, restoration, closure, and shutdown workflow debug entries until the user explicitly enables workflow-event logging. Access complexity is O(1).
 * @satisfies CTN-013, REQ-277
 */
export const DEFAULT_DEBUG_WORKFLOW_EVENTS = "disable" as const;

/**
 * @brief Defines the default workflow-status filter used by debug logging.
 * @details New configs log only entries whose workflow state equals `running` until the user selects a broader or different workflow-state filter. Access complexity is O(1).
 * @satisfies CTN-013, REQ-238
 */
export const DEFAULT_DEBUG_LOG_ON_STATUS = "running" as const;

/**
 * @brief Represents one valid debug-enabled tool selector.
 * @details Combines extension-owned tool names and supported embedded builtin tool names into one compile-time selector domain. The alias introduces no runtime cost.
 */
export type DebugToolName =
  | (typeof PI_USEREQ_CUSTOM_TOOL_NAMES)[number]
  | (typeof PI_USEREQ_EMBEDDED_TOOL_NAMES)[number];

/**
 * @brief Represents one valid debug-enabled prompt selector.
 * @details Restricts prompt debug toggles to invokable bundled `req-*` slash-command names derived from `PROMPT_COMMAND_NAMES`. The alias introduces no runtime cost.
 */
export type DebugPromptName = `req-${PromptCommandName}`;

/**
 * @brief Lists the canonical prompt workflow states accepted by debug filters.
 * @details Keeps menu rendering, config normalization, and workflow-state gating aligned to the documented prompt-orchestration states. Access complexity is O(1).
 */
export const DEBUG_WORKFLOW_STATES = [
  "idle",
  "checking",
  "running",
  "merging",
  "error",
] as const;

/**
 * @brief Represents one workflow-state value used by debug gating and payloads.
 * @details Extends the documented prompt workflow states with `unknown` for callers that cannot recover a concrete state. The alias is compile-time only and introduces no runtime cost.
 */
export type DebugWorkflowState =
  | (typeof DEBUG_WORKFLOW_STATES)[number]
  | "unknown";

/**
 * @brief Represents one persisted workflow-transition logging flag.
 * @details Restricts `workflow_state` emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
 */
export type DebugStatusChanges = "enable" | "disable";

/**
 * @brief Represents one persisted dedicated workflow-event logging flag.
 * @details Restricts session-activation, restoration, closure, and shutdown workflow-event emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
 */
export type DebugWorkflowEvents = "enable" | "disable";

/**
 * @brief Represents one persisted workflow-status filter value.
 * @details Restricts debug log filtering to `any` or one explicit documented workflow state. The alias is compile-time only and introduces no runtime cost.
 */
export type DebugLogOnStatus = "any" | (typeof DEBUG_WORKFLOW_STATES)[number];

/**
 * @brief Describes one append-only JSON debug log entry.
 * @details Stores a timestamped tool or prompt event with workflow-state context plus optional input, result, and error metadata. The interface is compile-time only and introduces no runtime cost.
 */
export interface DebugLogEntry {
  timestamp: string;
  category: "tool" | "prompt";
  name: string;
  action: string;
  workflow_state: DebugWorkflowState;
  input?: unknown;
  result?: unknown;
  is_error?: boolean;
}

/**
 * @brief Lists every debuggable prompt selector as its invokable `req-*` name.
 * @details Derives the prompt debug inventory directly from `PROMPT_COMMAND_NAMES` so menu rows and config normalization update automatically when bundled prompts change. Access complexity is O(p) at module load and O(1) per later access.
 * @satisfies REQ-243
 */
export const DEBUG_PROMPT_NAMES: DebugPromptName[] = PROMPT_COMMAND_NAMES.map((promptName) =>
  formatPromptCommandName(promptName),
);

/**
 * @brief Provides O(1) membership checks for valid debug tool selectors.
 * @details Materializes the canonical custom plus embedded tool inventories as one set so config normalization can discard unknown tool names without repeated linear scans. Construction occurs once at module load.
 */
const DEBUG_TOOL_NAME_SET = new Set<string>([
  ...PI_USEREQ_CUSTOM_TOOL_NAMES,
  ...PI_USEREQ_EMBEDDED_TOOL_NAMES,
]);

/**
 * @brief Provides O(1) membership checks for valid debug prompt selectors.
 * @details Materializes the canonical `req-*` prompt inventory as one set so config normalization can discard removed or unknown prompt names without repeated linear scans. Construction occurs once at module load.
 */
const DEBUG_PROMPT_NAME_SET = new Set<string>(DEBUG_PROMPT_NAMES);

/**
 * @brief Normalizes one persisted debug enable flag.
 * @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_ENABLED` for all other payloads. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted debug-enable payload.
 * @return {"enable" | "disable"} Canonical debug-enable value.
 * @satisfies REQ-236
 */
export function normalizeDebugEnabled(value: unknown): "enable" | "disable" {
  return value === "enable" ? "enable" : DEFAULT_DEBUG_ENABLED;
}

/**
 * @brief Normalizes one persisted debug log file value.
 * @details Accepts only non-empty strings, trims surrounding whitespace, and falls back to `DEFAULT_DEBUG_LOG_FILE` when the candidate is absent or blank. Runtime is O(n) in path length. No external state is mutated.
 * @param[in] value {unknown} Candidate persisted debug-log file payload.
 * @return {string} Canonical debug-log file value.
 * @satisfies REQ-237
 */
export function normalizeDebugLogFile(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_DEBUG_LOG_FILE;
  }
  const trimmedValue = value.trim();
  return trimmedValue === "" ? DEFAULT_DEBUG_LOG_FILE : trimmedValue;
}

/**
 * @brief Normalizes one persisted workflow-transition logging flag.
 * @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_STATUS_CHANGES` for all other payloads. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted workflow-transition logging payload.
 * @return {DebugStatusChanges} Canonical workflow-transition logging flag.
 * @satisfies REQ-254
 */
export function normalizeDebugStatusChanges(value: unknown): DebugStatusChanges {
  return value === "enable" ? "enable" : DEFAULT_DEBUG_STATUS_CHANGES;
}

/**
 * @brief Normalizes one persisted dedicated workflow-event logging flag.
 * @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_WORKFLOW_EVENTS` for all other payloads. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted workflow-event logging payload.
 * @return {DebugWorkflowEvents} Canonical workflow-event logging flag.
 * @satisfies REQ-277
 */
export function normalizeDebugWorkflowEvents(value: unknown): DebugWorkflowEvents {
  return value === "enable" ? "enable" : DEFAULT_DEBUG_WORKFLOW_EVENTS;
}

/**
 * @brief Normalizes one persisted debug workflow-status filter.
 * @details Accepts only the documented `any` token or one explicit workflow state and falls back to `DEFAULT_DEBUG_LOG_ON_STATUS` for all other payloads. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted debug workflow-status filter.
 * @return {DebugLogOnStatus} Canonical debug workflow-status filter.
 * @satisfies REQ-238
 */
export function normalizeDebugLogOnStatus(value: unknown): DebugLogOnStatus {
  if (value === "any") {
    return "any";
  }
  return typeof value === "string" && DEBUG_WORKFLOW_STATES.includes(value as (typeof DEBUG_WORKFLOW_STATES)[number])
    ? value as DebugLogOnStatus
    : DEFAULT_DEBUG_LOG_ON_STATUS;
}

/**
 * @brief Normalizes one persisted debug-tool selector array.
 * @details Filters to string entries, discards unknown tool names, deduplicates while preserving first-seen order, and returns an empty array for non-array payloads. Runtime is O(n). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted debug-tool selector payload.
 * @return {DebugToolName[]} Deduplicated canonical debug-tool selectors.
 * @satisfies REQ-239, REQ-242
 */
export function normalizeDebugEnabledTools(value: unknown): DebugToolName[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const selectors = value
    .filter((item): item is string => typeof item === "string")
    .filter((item): item is DebugToolName => DEBUG_TOOL_NAME_SET.has(item));
  return [...new Set(selectors)];
}

/**
 * @brief Normalizes one persisted debug-prompt selector array.
 * @details Filters to string entries, discards unknown `req-*` names, deduplicates while preserving first-seen order, and returns an empty array for non-array payloads. Runtime is O(n). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted debug-prompt selector payload.
 * @return {DebugPromptName[]} Deduplicated canonical debug-prompt selectors.
 * @satisfies REQ-239, REQ-243
 */
export function normalizeDebugEnabledPrompts(value: unknown): DebugPromptName[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const selectors = value
    .filter((item): item is string => typeof item === "string")
    .filter((item): item is DebugPromptName => DEBUG_PROMPT_NAME_SET.has(item));
  return [...new Set(selectors)];
}

/**
 * @brief Resolves the canonical debug prompt selector for one bundled prompt.
 * @details Reuses the shared prompt-command formatter so prompt-runtime and extension hook logging can target the same `DEBUG_ENABLED_PROMPTS` domain as the configuration menu. Runtime is O(n) in prompt-name length. No external state is mutated.
 * @param[in] promptName {PromptCommandName} Canonical bundled prompt name.
 * @return {DebugPromptName} Canonical debug prompt selector.
 */
export function getDebugPromptName(promptName: PromptCommandName): DebugPromptName {
  return formatPromptCommandName(promptName);
}

/**
 * @brief Tests whether one debug workflow-state filter matches the current state.
 * @details Treats `any` as an unconditional pass-through and otherwise requires `workflowState` to equal the configured explicit workflow state. Runtime is O(1). No external state is mutated.
 * @param[in] logOnStatus {DebugLogOnStatus} Persisted debug workflow-state filter.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @return {boolean} `true` when the entry should be emitted for the supplied state.
 * @satisfies REQ-247
 */
export function matchesDebugWorkflowState(
  logOnStatus: DebugLogOnStatus,
  workflowState: DebugWorkflowState,
): boolean {
  return logOnStatus === "any" || workflowState === logOnStatus;
}

/**
 * @brief Resolves the absolute debug log file path for one project base.
 * @details Preserves absolute configured paths and otherwise resolves relative values against the original project base so prompt-worktree cleanup cannot discard accumulated debug evidence. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Absolute debug log path.
 * @satisfies REQ-237
 */
export function resolveDebugLogPath(projectBase: string, config: UseReqConfig): string {
  const configuredPath = normalizeDebugLogFile(config.DEBUG_LOG_FILE);
  return path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(projectBase, configuredPath);
}

/**
 * @brief Tests whether one tool execution should be appended to the debug log.
 * @details Requires global debug enablement, membership in `DEBUG_ENABLED_TOOLS`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @param[in] toolName {string} Executed tool name.
 * @return {boolean} `true` when the tool execution should be logged.
 * @satisfies REQ-242, REQ-246, REQ-247
 */
export function shouldLogDebugTool(
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  toolName: string,
): boolean {
  return normalizeDebugEnabled(config.DEBUG_ENABLED) === "enable"
    && normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS).includes(toolName as DebugToolName)
    && matchesDebugWorkflowState(normalizeDebugLogOnStatus(config.DEBUG_LOG_ON_STATUS), workflowState);
}

/**
 * @brief Tests whether one prompt event should be appended to the debug log.
 * @details Requires global debug enablement, membership in `DEBUG_ENABLED_PROMPTS`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @return {boolean} `true` when the prompt event should be logged.
 * @satisfies REQ-243, REQ-246, REQ-247
 */
export function shouldLogDebugPrompt(
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
): boolean {
  return normalizeDebugEnabled(config.DEBUG_ENABLED) === "enable"
    && normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS).includes(getDebugPromptName(promptName))
    && matchesDebugWorkflowState(normalizeDebugLogOnStatus(config.DEBUG_LOG_ON_STATUS), workflowState);
}

/**
 * @brief Tests whether one prompt workflow-state transition should be appended to the debug log.
 * @details Requires global debug enablement, prompt-selector membership, explicit `DEBUG_STATUS_CHANGES=enable`, and a matching post-transition workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Post-transition workflow state.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @return {boolean} `true` when the prompt workflow-state entry should be logged.
 * @satisfies REQ-246, REQ-247, REQ-255
 */
export function shouldLogDebugPromptWorkflowState(
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
): boolean {
  return shouldLogDebugPrompt(config, workflowState, promptName)
    && normalizeDebugStatusChanges(config.DEBUG_STATUS_CHANGES) === "enable";
}

/**
 * @brief Tests whether one dedicated prompt workflow event should be appended to the debug log.
 * @details Requires global debug enablement, prompt-selector membership, explicit `DEBUG_WORKFLOW_EVENTS=enable`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @return {boolean} `true` when the dedicated workflow event should be logged.
 * @satisfies REQ-245, REQ-246, REQ-247, REQ-277
 */
export function shouldLogDebugPromptWorkflowEvent(
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
): boolean {
  return shouldLogDebugPrompt(config, workflowState, promptName)
    && normalizeDebugWorkflowEvents(config.DEBUG_WORKFLOW_EVENTS) === "enable";
}

/**
 * @brief Serializes arbitrary debug payloads into deterministic JSON-compatible values.
 * @details Converts `Error` instances into structured records, elides functions, stringifies bigint values, and falls back to a best-effort string when JSON serialization fails. Runtime is O(n) in payload size. No external state is mutated.
 * @param[in] value {unknown} Arbitrary debug payload.
 * @return {unknown} JSON-compatible debug payload.
 */
function normalizeDebugValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  try {
    return JSON.parse(JSON.stringify(value, (_key, currentValue) => {
      if (typeof currentValue === "function") {
        return undefined;
      }
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }
      if (currentValue instanceof Error) {
        return {
          name: currentValue.name,
          message: currentValue.message,
          stack: currentValue.stack,
        };
      }
      return currentValue;
    })) as unknown;
  } catch {
    return String(value);
  }
}

/**
 * @brief Appends one normalized debug log entry to the configured JSON log file.
 * @details Loads the existing JSON array when present, falls back to an empty array for missing or invalid files, appends the normalized entry, and rewrites the full file with a trailing newline. Runtime is dominated by JSON parse plus serialization and filesystem I/O. Side effects include directory creation and file overwrite.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] entry {DebugLogEntry} Candidate debug log entry.
 * @return {boolean} `true` when the entry is written successfully; `false` when filesystem writing fails.
 */
function appendDebugLogEntry(
  projectBase: string,
  config: UseReqConfig,
  entry: DebugLogEntry,
): boolean {
  const logPath = resolveDebugLogPath(projectBase, config);
  try {
    let entries: unknown[] = [];
    if (fs.existsSync(logPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(logPath, "utf8")) as unknown;
        if (Array.isArray(parsed)) {
          entries = parsed;
        }
      } catch {
        entries = [];
      }
    }
    const normalizedEntry = normalizeDebugValue(entry);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `${JSON.stringify([...entries, normalizedEntry], null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * @brief Appends one tool-execution debug entry when the current config enables it.
 * @details Applies tool-selector and workflow-state gating before serializing the executed tool input, final result payload, and error flag into the configured JSON log file. Runtime is dominated by JSON serialization plus filesystem I/O when enabled and O(n) in selector count otherwise. Side effects include directory creation and file overwrite only for enabled matching entries.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @param[in] toolName {string} Executed tool name.
 * @param[in] input {unknown} Final executed tool input.
 * @param[in] result {unknown} Final tool result payload.
 * @param[in] isError {boolean} Final tool error flag.
 * @return {boolean} `true` when the tool entry is written; otherwise `false`.
 * @satisfies REQ-244, REQ-246, REQ-247
 */
export function logDebugToolExecution(
  projectBase: string,
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  toolName: string,
  input: unknown,
  result: unknown,
  isError: boolean,
): boolean {
  if (!shouldLogDebugTool(config, workflowState, toolName)) {
    return false;
  }
  return appendDebugLogEntry(projectBase, config, {
    timestamp: new Date().toISOString(),
    category: "tool",
    name: toolName,
    action: "tool_execution",
    workflow_state: workflowState,
    input,
    result,
    is_error: isError,
  });
}

/**
 * @brief Appends one prompt debug entry when the current config enables it.
 * @details Applies prompt-selector and workflow-state gating before serializing the supplied action payload into the configured JSON log file. Runtime is dominated by JSON serialization plus filesystem I/O when enabled and O(n) in selector count otherwise. Side effects include directory creation and file overwrite only for enabled matching entries.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] action {string} Prompt debug action identifier.
 * @param[in] input {unknown} Optional prompt debug input payload.
 * @param[in] result {unknown} Optional prompt debug result payload.
 * @param[in] isError {boolean} Optional prompt debug error flag.
 * @return {boolean} `true` when the prompt entry is written; otherwise `false`.
 * @satisfies REQ-245, REQ-246, REQ-247
 */
export function logDebugPromptEvent(
  projectBase: string,
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
  action: string,
  input?: unknown,
  result?: unknown,
  isError = false,
): boolean {
  if (!shouldLogDebugPrompt(config, workflowState, promptName)) {
    return false;
  }
  return appendDebugLogEntry(projectBase, config, {
    timestamp: new Date().toISOString(),
    category: "prompt",
    name: getDebugPromptName(promptName),
    action,
    workflow_state: workflowState,
    ...(input === undefined ? {} : { input }),
    ...(result === undefined ? {} : { result }),
    is_error: isError,
  });
}

/**
 * @brief Appends one dedicated prompt workflow debug entry when the current config enables it.
 * @details Applies prompt-selector, workflow-event-flag, and workflow-state gating before serializing session-activation, restoration, closure, or shutdown workflow payloads into the configured JSON log file. Runtime is dominated by JSON serialization plus filesystem I/O when enabled and O(n) in selector count otherwise. Side effects include directory creation and file overwrite only for enabled matching entries.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] action {string} Dedicated prompt workflow action identifier.
 * @param[in] input {unknown} Optional workflow debug input payload.
 * @param[in] result {unknown} Optional workflow debug result payload.
 * @param[in] isError {boolean} Optional workflow debug error flag.
 * @return {boolean} `true` when the workflow entry is written; otherwise `false`.
 * @satisfies REQ-245, REQ-246, REQ-247, REQ-277
 */
export function logDebugPromptWorkflowEvent(
  projectBase: string,
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
  action: string,
  input?: unknown,
  result?: unknown,
  isError = false,
): boolean {
  if (!shouldLogDebugPromptWorkflowEvent(config, workflowState, promptName)) {
    return false;
  }
  return appendDebugLogEntry(projectBase, config, {
    timestamp: new Date().toISOString(),
    category: "prompt",
    name: getDebugPromptName(promptName),
    action,
    workflow_state: workflowState,
    ...(input === undefined ? {} : { input }),
    ...(result === undefined ? {} : { result }),
    is_error: isError,
  });
}
