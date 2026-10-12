/**
 * @file
 * @brief Declares debug inventories, normalizers, and JSON log persistence helpers.
 * @details Centralizes debug-menu selector inventories, config-field normalization, the process-scoped runtime debug-enable state, workflow-status gating, append-only JSON log writing for tool, prompt, and dedicated workflow debug events, process-scoped capture of the exact `before_provider_request` provider payload for active prompt runs, and error-stage provider payload dumps gated by `after_provider_response` error statuses. Runtime is dominated by JSON serialization plus filesystem I/O during log writes. Side effects include directory creation and file overwrite when debug entries are appended.
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
 * @brief Describes the process-scoped runtime debug-enable state persisted across session rebinds.
 * @details Stores the user-toggled runtime `Debug` flag on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists across those operations; the flag therefore survives ctrl+N session forks and `req-reset` but resets to `disable` when a fresh pi CLI process starts. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-236, REQ-426
 */
interface ProcessScopedDebugEnabledStore {
  runtimeDebugEnabled: "enable" | "disable" | undefined;
}

/**
 * @brief Returns the process-scoped runtime debug-enable store.
 * @details Lazily initializes one `globalThis` record so session rebinds reuse the toggled runtime debug mode instead of resetting it to the persisted default. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedDebugEnabledStore} Mutable process-scoped runtime debug store.
 */
function getProcessScopedDebugEnabledStore(): ProcessScopedDebugEnabledStore {
  const globalScope = globalThis as typeof globalThis & { __piUsereqDebugEnabledStore?: ProcessScopedDebugEnabledStore };
  if (!globalScope.__piUsereqDebugEnabledStore) {
    globalScope.__piUsereqDebugEnabledStore = { runtimeDebugEnabled: undefined };
  }
  return globalScope.__piUsereqDebugEnabledStore;
}

/**
 * @brief Resolves the runtime debug-enable mode for the current pi host process.
 * @details Returns the process-scoped toggled value when present and the documented `disable` default otherwise, so every fresh pi CLI process starts with debug logging disabled regardless of any stale persisted payload. Runtime is O(1). No external state is mutated.
 * @return {"enable" | "disable"} Effective runtime debug-enable mode.
 * @satisfies REQ-236
 */
export function getRuntimeDebugEnabled(): "enable" | "disable" {
  return getProcessScopedDebugEnabledStore().runtimeDebugEnabled ?? DEFAULT_DEBUG_ENABLED;
}

/**
 * @brief Stores one user-toggled runtime debug-enable mode for the current pi host process.
 * @details Mutates only the process-scoped runtime store so `Debug` menu toggles survive session rebinds without reaching persisted local or global configuration files. Runtime is O(1). Side effect: mutates process-scoped runtime state.
 * @param[in] runtimeDebugEnabled {"enable" | "disable"} Next runtime debug-enable mode.
 * @return {void} No return value.
 * @satisfies REQ-236, REQ-426
 */
export function setRuntimeDebugEnabled(runtimeDebugEnabled: "enable" | "disable"): void {
  getProcessScopedDebugEnabledStore().runtimeDebugEnabled = runtimeDebugEnabled;
}

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
 * @brief Defines the default debug-tool command-wrapper mode.
 * @details New configs suppress debug slash-command wrappers for selected built-in tools until the user explicitly enables them from the `Debug` submenu. Access complexity is O(1).
 * @satisfies CTN-019, REQ-322
 */
export const DEFAULT_DEBUG_TOOL_COMMANDS_ENABLED = "disable" as const;

/**
 * @brief Defines the default debug-prompt content logging mode.
 * @details New configs do not save dispatched prompt content until the user explicitly enables prompt debug logging from the `Debug` submenu. Access complexity is O(1).
 * @satisfies CTN-013, REQ-413
 */
export const DEFAULT_DEBUG_PROMPTS_ENABLED = "disable" as const;

/**
 * @brief Defines the default debug prompt log path.
 * @details New configurations write dispatched prompt content files under `/tmp/PI-useReq` unless the user overrides the path; trailing separators are stripped per CTN-014. Access complexity is O(1).
 * @satisfies CTN-013, CTN-014, REQ-414
 */
export const DEFAULT_DEBUG_PROMPTS_LOG_PATH = "/tmp/PI-useReq";

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
 * @brief Represents one persisted debug-tool command-wrapper flag.
 * @details Restricts debug slash-command wrapper registration to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
 */
export type DebugToolCommandsEnabled = "enable" | "disable";

/**
 * @brief Represents one persisted debug-prompt content logging flag.
 * @details Restricts prompt-content debug file emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
 */
export type DebugPromptsEnabled = "enable" | "disable";

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
 * @brief Normalizes one persisted debug-tool command-wrapper flag.
 * @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_TOOL_COMMANDS_ENABLED` for all other payloads. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted debug-tool command-wrapper payload.
 * @return {DebugToolCommandsEnabled} Canonical debug-tool command-wrapper flag.
 * @satisfies CTN-019, REQ-322
 */
export function normalizeDebugToolCommandsEnabled(value: unknown): DebugToolCommandsEnabled {
  return value === "enable" ? "enable" : DEFAULT_DEBUG_TOOL_COMMANDS_ENABLED;
}

/**
 * @brief Normalizes one persisted debug-prompt content logging flag.
 * @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_PROMPTS_ENABLED` for all other payloads. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted prompt-debug enable payload.
 * @return {DebugPromptsEnabled} Canonical prompt-debug enable value.
 * @satisfies REQ-413
 */
export function normalizeDebugPromptsEnabled(value: unknown): DebugPromptsEnabled {
  return value === "enable" ? "enable" : DEFAULT_DEBUG_PROMPTS_ENABLED;
}

/**
 * @brief Normalizes one persisted debug prompt log path value.
 * @details Accepts only non-empty strings, trims surrounding whitespace, strips every trailing separator so persisted paths stay trailing-slash-free per CTN-014, and falls back to `DEFAULT_DEBUG_PROMPTS_LOG_PATH` when the candidate is absent or blank. Runtime is O(n) in path length. No external state is mutated.
 * @param[in] value {unknown} Candidate persisted prompt-log path payload.
 * @return {string} Canonical trailing-slash-free prompt-log path value.
 * @satisfies CTN-014, REQ-414
 */
export function normalizeDebugPromptsLogPath(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_DEBUG_PROMPTS_LOG_PATH;
  }
  const trimmedValue = value.trim().replace(/[\\/]+$/g, "");
  return trimmedValue === "" ? DEFAULT_DEBUG_PROMPTS_LOG_PATH : trimmedValue;
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
 * @brief Resolves the absolute debug prompt log directory for one project base.
 * @details Preserves absolute configured paths and otherwise resolves relative values against the original project base so prompt-worktree cleanup cannot discard accumulated prompt debug evidence. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Absolute debug prompt log directory path.
 * @satisfies REQ-414
 */
export function resolveDebugPromptsLogPath(projectBase: string, config: UseReqConfig): string {
  const configuredPath = normalizeDebugPromptsLogPath(config.DEBUG_PROMPTS_LOG_PATH);
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
 * @brief Tests whether one dispatched prompt content file should be written.
 * @details Requires global debug enablement plus explicit prompt-content debug enablement before any filesystem work occurs; prompt-content logging is fully subordinate to the global `Debug` flag and exempt from the `DEBUG_LOG_ON_STATUS` workflow-state filter so enabled runs always save their debug files. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state; retained for signature compatibility and excluded from gating per REQ-416.
 * @param[in] promptName {PromptCommandName} Bundled prompt name; retained for signature compatibility.
 * @return {boolean} `true` when the prompt content file should be written.
 * @satisfies REQ-413, REQ-416
 */
export function shouldLogDebugPromptContent(
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
): boolean {
  return normalizeDebugEnabled(config.DEBUG_ENABLED) === "enable"
    && normalizeDebugPromptsEnabled(config.DEBUG_PROMPTS_ENABLED) === "enable";
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

/**
 * @brief Formats one write-time timestamp as the `YYYYMMDDHHMMSSmmm` prompt debug prefix.
 * @details Zero-pads calendar fields to their canonical widths, appends three millisecond digits, and joins every segment without separators so generated prompt debug filenames stay lexicographically sortable and collision-resistant within one second. Runtime is O(1). No external state is mutated.
 * @param[in] date {Date} Write-time timestamp to encode.
 * @return {string} `YYYYMMDDHHMMSSmmm` timestamp prefix.
 * @satisfies REQ-417
 */
export function formatPromptDebugTimestamp(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, "0");
  return [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3),
  ].join("");
}

/**
 * @brief Builds one prompt debug filename for one bundled prompt.
 * @details Combines the write-time `YYYYMMDDHHMMSSmmm` timestamp with the invokable `req-*` command name so every saved file can be replayed from the pi CLI and attributed to the originating `/req-*` prompt. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
 * @return {string} Prompt debug filename in the `<timestamp>-<req-command>` shape.
 * @satisfies REQ-417
 */
export function formatPromptDebugFileName(
  promptName: PromptCommandName,
  date = new Date(),
): string {
  return `${formatPromptDebugTimestamp(date)}-${getDebugPromptName(promptName)}`;
}

/**
 * @brief Builds one command-invocation summary debug filename for one bundled prompt.
 * @details Appends the `-request.md` suffix to the shared `<timestamp>-<req-command>` base so every saved command invocation summary stays attributable to the originating `/req-*` prompt, with the `.md` extension coherent with the persisted markdown summary content per REQ-435. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
 * @return {string} Prompt debug filename in the `<timestamp>-<req-command>-request.md` shape.
 * @satisfies REQ-417, REQ-427, REQ-435
 */
export function formatPromptDebugRequestFileName(
  promptName: PromptCommandName,
  date = new Date(),
): string {
  return `${formatPromptDebugFileName(promptName, date)}-request.md`;
}

/**
 * @brief Builds one dispatched-prompt content debug filename for one bundled prompt.
 * @details Appends the `-prompt.md` suffix to the shared `<timestamp>-<req-command>` base so every saved initial LLM prompt stays attributable to the originating `/req-*` prompt, with the `.md` extension coherent with the persisted markdown prompt content per REQ-435. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
 * @return {string} Prompt debug filename in the `<timestamp>-<req-command>-prompt.md` shape.
 * @satisfies REQ-417, REQ-418, REQ-435
 */
export function formatPromptDebugPromptFileName(
  promptName: PromptCommandName,
  date = new Date(),
): string {
  return `${formatPromptDebugFileName(promptName, date)}-prompt.md`;
}

/**
 * @brief Writes one gated prompt debug file under the configured prompt log directory.
 * @details Applies the global-debug plus prompt-debug gating, creates the configured prompt log directory, and writes the supplied text into the requested filename so dispatched-prompt artifacts can be replayed from the pi CLI without pi-usereq installed. Runtime is dominated by one directory creation plus one file write when enabled and O(1) otherwise. Side effects include directory creation and file creation only for enabled matching entries.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state; excluded from gating per REQ-416.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] fileName {string} Target filename under the resolved prompt log directory.
 * @param[in] content {string} Exact text to persist.
 * @return {boolean} `true` when the file is written; otherwise `false`.
 * @satisfies REQ-416
 */
function writePromptDebugFile(
  projectBase: string,
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
  fileName: string,
  content: string,
): boolean {
  if (!shouldLogDebugPromptContent(config, workflowState, promptName)) {
    return false;
  }
  const logDirectory = resolveDebugPromptsLogPath(projectBase, config);
  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.writeFileSync(path.join(logDirectory, fileName), content, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * @brief Writes one command invocation summary debug file when prompt debug logging is enabled.
 * @details Persists the exact summary text displayed on screen into one `<timestamp>-<req-command>-request.md` file so the `/req-*` invocation headers survive beside the dispatched prompt. Runtime is dominated by one directory creation plus one file write when enabled and O(1) otherwise. Side effects include directory creation and file creation only for enabled matching entries.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state; excluded from gating per REQ-416.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] requestText {string} Exact command invocation summary text displayed on screen.
 * @return {boolean} `true` when the request file is written; otherwise `false`.
 * @satisfies REQ-416, REQ-417, REQ-427, REQ-428, REQ-435
 */
export function logDebugPromptRequest(
  projectBase: string,
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
  requestText: string,
): boolean {
  return writePromptDebugFile(
    projectBase,
    config,
    workflowState,
    promptName,
    formatPromptDebugRequestFileName(promptName),
    requestText,
  );
}

/**
 * @brief Writes one dispatched prompt content file when prompt debug logging is enabled.
 * @details Persists the exact rendered prompt content delivered through `sendMessage` or `sendUserMessage` into one `<timestamp>-<req-command>-prompt.md` file so the send can be replayed from the pi CLI without pi-usereq installed. Runtime is dominated by one directory creation plus one file write when enabled and O(1) otherwise. Side effects include directory creation and file creation only for enabled matching entries.
 * @param[in] projectBase {string} Absolute original project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] workflowState {DebugWorkflowState} Current workflow state; excluded from gating per REQ-416.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] content {string} Exact rendered prompt content delivered through `sendMessage` or `sendUserMessage`.
 * @return {boolean} `true` when the prompt content file is written; otherwise `false`.
 * @satisfies REQ-416, REQ-417, REQ-418, REQ-428, REQ-435
 */
export function logDebugPromptContent(
  projectBase: string,
  config: UseReqConfig,
  workflowState: DebugWorkflowState,
  promptName: PromptCommandName,
  content: string,
): boolean {
  const fileName = formatPromptDebugPromptFileName(promptName);
  const written = writePromptDebugFile(
    projectBase,
    config,
    workflowState,
    promptName,
    fileName,
    content,
  );
  if (written) {
    getProcessScopedPromptErrorCaptureStore().dispatchedPromptDebugFiles.set(promptName, fileName);
  }
  return written;
}

/**
 * @brief Describes replay facts captured beside one provider request payload for reproduction.
 * @details Stores the provider, API, base URL, model identifier, thinking level, context-window, max-output-token, and execution-session-file facts resolved from the live pi runtime model plus prompt execution plan so the error-stage replay sidecar can emit ready-to-use replay command lines without live runtime state. Every field stays optional so degraded runtimes and offline replays never abort the capture. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-430
 */
export interface PromptErrorReplayFacts {
  modelId: string | undefined;
  provider: string | undefined;
  api: string | undefined;
  baseUrl: string | undefined;
  thinkingLevel: string | undefined;
  contextWindow: number | undefined;
  maxTokens: number | undefined;
  executionSessionFile: string | undefined;
}

/**
 * @brief Describes one process-scoped captured provider request payload bound to an active prompt run.
 * @details Pairs the bundled prompt name, the serialization of the exact `before_provider_request` payload, the original project base, the resolved prompt log directory, the dispatched prompt debug filename of the same run, and the captured replay facts so a later `after_provider_response` or `message_end` error status can dump the failing request verbatim, its provider error text, and one replay sidecar without live controller state, cached configuration, or live provider objects. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-421, REQ-429, REQ-430
 */
interface CapturedPromptErrorPayload {
  promptName: PromptCommandName;
  payloadText: string;
  projectBase: string;
  logDirectory: string;
  promptDebugFile: string | undefined;
  replayFacts: PromptErrorReplayFacts;
}

/**
 * @brief Describes the location of one already flushed provider error payload file set.
 * @details Stores the prompt name, failing status, resolved log directory, and shared extensionless error base filename of the most recent error-stage flush so a later finalized `message_end` error message can still append the `-response.txt` file beside the already written payload when the provider fired `after_provider_response` before surfacing its error text. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-429
 */
interface FlushedPromptErrorRecord {
  promptName: PromptCommandName;
  errorCode: number;
  logDirectory: string;
  baseFileName: string;
}

/**
 * @brief Describes the process-scoped provider error payload capture state persisted across extension rebinds.
 * @details Stores the latest captured prompt error payload, the latest flushed error record, and the latest dispatched prompt debug filenames on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` between prompt dispatch and provider execution, while the hosting process persists across those operations, so the capture, the late response write, and the dispatched-prompt correlation survive the forked execution-session switch. The interface is compile-time only and introduces no runtime cost.
 */
interface ProcessScopedPromptErrorCaptureStore {
  capturedPromptErrorPayload: CapturedPromptErrorPayload | undefined;
  lastFlushedPromptError: FlushedPromptErrorRecord | undefined;
  dispatchedPromptDebugFiles: Map<PromptCommandName, string>;
}

/**
 * @brief Returns the process-scoped provider error payload capture store.
 * @details Lazily initializes one `globalThis` record so session rebinds never discard an already captured failing provider request, its flushed error record, or its dispatched prompt debug filename correlation. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedPromptErrorCaptureStore} Mutable process-scoped capture store.
 */
function getProcessScopedPromptErrorCaptureStore(): ProcessScopedPromptErrorCaptureStore {
  const globalScope = globalThis as typeof globalThis & { __piUsereqPromptErrorCaptureStore?: ProcessScopedPromptErrorCaptureStore };
  if (!globalScope.__piUsereqPromptErrorCaptureStore) {
    globalScope.__piUsereqPromptErrorCaptureStore = {
      capturedPromptErrorPayload: undefined,
      lastFlushedPromptError: undefined,
      dispatchedPromptDebugFiles: new Map(),
    };
  }
  return globalScope.__piUsereqPromptErrorCaptureStore;
}

/**
 * @brief Builds the shared extensionless provider error base filename for one bundled prompt.
 * @details Combines the write-time `YYYYMMDDHHMMSSmmm` timestamp, the invokable `req-*` command name, and the failing provider response status into the `<timestamp>-<req-command>-error-<status>` base shape so every saved error-stage prompt artifact stays attributable to the originating `/req-*` prompt and its session error code. This extensionless base is the suffix-attachment anchor for the `-response.txt`, `-replay.json`, and `-session.jsonl` variants; the flushed raw provider-request JSON payload appends its content-coherent `.json` extension through `formatPromptDebugErrorPayloadFileName(...)`. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] errorCode {number} Failing provider response status, such as `400`.
 * @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
 * @return {string} Extensionless provider error base filename in the `<timestamp>-<req-command>-error-<status>` shape.
 * @satisfies REQ-423
 */
export function formatPromptDebugErrorFileName(
  promptName: PromptCommandName,
  errorCode: number,
  date = new Date(),
): string {
  return `${formatPromptDebugTimestamp(date)}-${getDebugPromptName(promptName)}-error-${errorCode}`;
}

/**
 * @brief Builds one provider error payload debug filename for one bundled prompt.
 * @details Appends the `.json` extension to the shared extensionless `<timestamp>-<req-command>-error-<status>` base so the flushed raw provider-request JSON payload keeps a filename extension coherent with its JSON content per REQ-435 while staying attributable to the exact failing request. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] errorCode {number} Failing provider response status, such as `400`.
 * @param[in] date {Date} Write-time timestamp shared with the sibling error artifacts. Defaults to the current wall-clock time.
 * @return {string} Provider error payload filename in the `<timestamp>-<req-command>-error-<status>.json` shape.
 * @satisfies REQ-423, REQ-431, REQ-435
 */
export function formatPromptDebugErrorPayloadFileName(
  promptName: PromptCommandName,
  errorCode: number,
  date = new Date(),
): string {
  return `${formatPromptDebugErrorFileName(promptName, errorCode, date)}.json`;
}

/**
 * @brief Builds one provider error response debug filename for one bundled prompt.
 * @details Appends the `-response.txt` suffix to the shared extensionless `<timestamp>-<req-command>-error-<status>` shape so the persisted plain-text provider error message keeps a filename extension coherent with its text content per REQ-435 and stays attributable to the exact failing request payload file written with the identical write-time timestamp. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] errorCode {number} Failing provider response status, such as `400`.
 * @param[in] date {Date} Write-time timestamp shared with the payload file. Defaults to the current wall-clock time.
 * @return {string} Provider error response filename in the `<timestamp>-<req-command>-error-<status>-response.txt` shape.
 * @satisfies REQ-423, REQ-429, REQ-435
 */
export function formatPromptDebugErrorResponseFileName(
  promptName: PromptCommandName,
  errorCode: number,
  date = new Date(),
): string {
  return `${formatPromptDebugErrorFileName(promptName, errorCode, date)}-response.txt`;
}

/**
 * @brief Builds one provider error replay sidecar debug filename for one bundled prompt.
 * @details Appends the `-replay.json` suffix to the shared `<timestamp>-<req-command>-error-<status>` shape so the persisted replay metadata sidecar stays attributable to the exact failing request payload file written with the identical write-time timestamp. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] errorCode {number} Failing provider response status, such as `400`.
 * @param[in] date {Date} Write-time timestamp shared with the payload file. Defaults to the current wall-clock time.
 * @return {string} Provider error replay sidecar filename in the `<timestamp>-<req-command>-error-<status>-replay.json` shape.
 * @satisfies REQ-423, REQ-430
 */
export function formatPromptDebugErrorReplayFileName(
  promptName: PromptCommandName,
  errorCode: number,
  date = new Date(),
): string {
  return `${formatPromptDebugErrorFileName(promptName, errorCode, date)}-replay.json`;
}

/**
 * @brief Builds one provider error session-snapshot debug filename for one bundled prompt.
 * @details Appends the `-session.jsonl` suffix to the shared `<timestamp>-<req-command>-error-<status>` shape so the byte-for-byte execution-session copy stays attributable to the exact failing request payload file written with the identical write-time timestamp and remains directly consumable by `pi --fork` without files outside the prompt log directory. Runtime is O(1). No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt name.
 * @param[in] errorCode {number} Failing provider response status, such as `400`.
 * @param[in] date {Date} Write-time timestamp shared with the payload file. Defaults to the current wall-clock time.
 * @return {string} Provider error session-snapshot filename in the `<timestamp>-<req-command>-error-<status>-session.jsonl` shape.
 * @satisfies REQ-423, REQ-432
 */
export function formatPromptDebugErrorSessionFileName(
  promptName: PromptCommandName,
  errorCode: number,
  date = new Date(),
): string {
  return `${formatPromptDebugErrorFileName(promptName, errorCode, date)}-session.jsonl`;
}

/**
 * @brief Resolves the failing HTTP status carried by one finalized agent message.
 * @details Extracts the leading provider error status from one `message_end` assistant message whose `stopReason` equals `error`, accepting the pi `formatProviderError` display shapes (`"<status>: <body>"` and `"<prefix> (<status>): <body>"`) plus the raw SDK `error.message` shape (`"<status> <body>"`) surfaced unchanged by the agent run-failure path, so provider APIs whose SDK clients throw before emitting `after_provider_response` for non-2xx statuses (the OpenAI-compatible family, including `zai`) still flush the captured provider request payload through the message lifecycle channel. Runtime is O(n) in the inspected error-message prefix length. No external state is mutated.
 * @param[in] message {unknown} Finalized agent message forwarded by one `message_end` lifecycle event.
 * @return {number | undefined} Failing HTTP status greater than or equal to `400`, or `undefined` when the message carries no provider error status.
 * @satisfies REQ-422, REQ-423, REQ-425
 */
export function resolveProviderErrorFlushStatusFromMessage(message: unknown): number | undefined {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const candidateMessage = message as { role?: unknown; stopReason?: unknown; errorMessage?: unknown };
  if (candidateMessage.role !== "assistant" || candidateMessage.stopReason !== "error") {
    return undefined;
  }
  if (typeof candidateMessage.errorMessage !== "string") {
    return undefined;
  }
  const unprefixedStatus = /^(\d{3}):/.exec(candidateMessage.errorMessage)?.[1];
  const prefixedStatus = /^[^(]+\((\d{3})\): /.exec(candidateMessage.errorMessage)?.[1];
  const rawSdkStatus = /^(\d{3})\s/.exec(candidateMessage.errorMessage)?.[1];
  const statusText = unprefixedStatus ?? prefixedStatus ?? rawSdkStatus;
  if (statusText === undefined) {
    return undefined;
  }
  const status = Number.parseInt(statusText, 10);
  return Number.isFinite(status) && status >= 400 ? status : undefined;
}

/**
 * @brief Serializes one provider request payload into deterministic text.
 * @details Pretty-prints the payload as JSON while degrading circular references into one `[Circular]` token and bigint values into decimal strings so serialization failures never discard the capture. Runtime is O(n) in serialized payload size. No external state is mutated.
 * @param[in] payload {unknown} Exact `before_provider_request` provider request payload.
 * @return {string} Serialized payload text; the empty string when the payload serializes to nothing.
 */
function serializePromptProviderPayload(payload: unknown): string {
  const seenObjects = new WeakSet<object>();
  return JSON.stringify(
    payload,
    (_key: string, value: unknown) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (typeof value === "object" && value !== null) {
        if (seenObjects.has(value)) {
          return "[Circular]";
        }
        seenObjects.add(value);
      }
      return value;
    },
    2,
  ) ?? "";
}

/**
 * @brief Resolves the model identifier embedded in one provider request payload.
 * @details Reads the string `model` field of the serialized request payload so the replay sidecar can still name the failing model when the live runtime model object was unavailable at capture time. Runtime is O(1). No external state is mutated.
 * @param[in] payload {unknown} Exact `before_provider_request` provider request payload.
 * @return {string | undefined} Payload model identifier when present as a string; otherwise `undefined`.
 */
function resolveProviderPayloadModelId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const modelId = (payload as { model?: unknown }).model;
  return typeof modelId === "string" && modelId.length > 0 ? modelId : undefined;
}

/**
 * @brief Captures one exact provider request payload for the active prompt run when prompt debug logging is enabled.
 * @details Applies the global-debug plus prompt-debug gating, serializes the exact `before_provider_request` payload through the cycle-safe serializer, resolves the dispatched prompt debug filename of the same run from the process-scoped correlation map, and stores the prompt name, payload text, original project base, resolved prompt log directory, replay facts, and prompt debug filename in the process-scoped capture store so the payload, its error text, and its replay sidecar survive session replacement and later error-stage writes require no live workflow state or cached configuration. Falls back to the payload `model` field when the supplied replay facts omit the model identifier. Runtime is O(n) in serialized payload size when enabled and O(1) otherwise. Side effect: mutates the process-scoped capture store for enabled matching requests.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] promptName {PromptCommandName} Active bundled prompt name.
 * @param[in] projectBase {string} Absolute original project base path used to resolve the prompt log directory.
 * @param[in] payload {unknown} Exact `before_provider_request` provider request payload.
 * @param[in] replayFacts {PromptErrorReplayFacts} Live runtime replay facts consumed by the error-stage sidecar. Defaults to empty facts.
 * @return {void} No return value.
 * @satisfies REQ-416, REQ-421, REQ-430
 */
export function capturePromptProviderRequestForDebug(
  config: UseReqConfig,
  promptName: PromptCommandName,
  projectBase: string,
  payload: unknown,
  replayFacts: PromptErrorReplayFacts = {
    modelId: undefined,
    provider: undefined,
    api: undefined,
    baseUrl: undefined,
    thinkingLevel: undefined,
    contextWindow: undefined,
    maxTokens: undefined,
    executionSessionFile: undefined,
  },
): void {
  if (!shouldLogDebugPromptContent(config, "unknown", promptName)) {
    return;
  }
  const logDirectory = resolveDebugPromptsLogPath(projectBase, config);
  const dispatchedPromptFile = getProcessScopedPromptErrorCaptureStore().dispatchedPromptDebugFiles.get(promptName);
  getProcessScopedPromptErrorCaptureStore().capturedPromptErrorPayload = {
    promptName,
    payloadText: serializePromptProviderPayload(payload),
    projectBase,
    logDirectory,
    promptDebugFile: dispatchedPromptFile === undefined ? undefined : path.join(logDirectory, dispatchedPromptFile),
    replayFacts: {
      ...replayFacts,
      modelId: replayFacts.modelId ?? resolveProviderPayloadModelId(payload),
    },
  };
}

/**
 * @brief Normalizes one provider name into an uppercase environment-variable token.
 * @details Uppercases the provider name and replaces every non-alphanumeric character with `_` so the generated replay command can reference a deterministic `<PROVIDER>_API_KEY` environment variable. Runtime is O(n) in provider-name length. No external state is mutated.
 * @param[in] provider {string} Provider identifier, such as `openrouter`.
 * @return {string} Uppercase alphanumeric environment-variable token.
 */
function normalizeProviderEnvToken(provider: string): string {
  const normalized = provider.toUpperCase().replace(/[^A-Z0-9]/gu, "_");
  return normalized.length > 0 ? normalized : "PROVIDER";
}

/**
 * @brief Resolves the provider HTTP endpoint targeted by one captured provider request payload.
 * @details Appends the canonical chat-completions path for `openai-completions` APIs and the canonical messages path for `anthropic-messages` APIs, and preserves the raw base URL for every other API so the generated provider replay command never fabricates an endpoint it cannot derive. Runtime is O(p) in URL length. No external state is mutated.
 * @param[in] facts {PromptErrorReplayFacts} Captured replay facts supplying the API and base URL.
 * @return {string | undefined} Replay endpoint URL when a base URL exists; otherwise `undefined`.
 */
function resolveProviderReplayEndpoint(facts: PromptErrorReplayFacts): string | undefined {
  if (facts.baseUrl === undefined) {
    return undefined;
  }
  if (facts.api === "openai-completions") {
    return `${facts.baseUrl}/chat/completions`;
  }
  if (facts.api === "anthropic-messages") {
    return `${facts.baseUrl}/v1/messages`;
  }
  return facts.baseUrl;
}

/**
 * @brief Builds the replay sidecar JSON text for one flushed provider error payload.
 * @details Serializes the captured provider, base URL, API, model identifier, thinking level, context-window and max-output-token facts, the execution-session file, the dispatched prompt debug file, the flushed request payload file, and ready-to-use replay command lines: one `curl --data @` provider replay of the exact failing request, one pi one-shot replay of the dispatched prompt file, and one `pi --fork` replay that targets the log-local `-session.jsonl` snapshot when supplied and falls back to the retained execution session otherwise. Command lines are emitted only when their supporting facts exist so every emitted command is directly executable. Runtime is O(n) in serialized sidecar size. No external state is mutated.
 * @param[in] captured {CapturedPromptErrorPayload} Consumed capture supplying replay facts and artifact paths.
 * @param[in] requestFileName {string} Payload filename written with the same write-time timestamp.
 * @param[in] sessionSnapshotFileName {string | undefined} Log-local `-session.jsonl` snapshot filename written with the same write-time timestamp; `undefined` falls back to the retained execution-session path.
 * @return {string} Newline-terminated replay sidecar JSON text.
 * @satisfies REQ-430, REQ-433
 */
function buildPromptErrorReplaySidecarText(
  captured: CapturedPromptErrorPayload,
  requestFileName: string,
  sessionSnapshotFileName?: string,
): string {
  const facts = captured.replayFacts;
  const requestFilePath = path.join(captured.logDirectory, requestFileName);
  const endpoint = resolveProviderReplayEndpoint(facts);
  const replayCommands: Record<string, string> = {};
  if (endpoint !== undefined) {
    const envToken = facts.provider === undefined ? "PROVIDER_API_KEY" : `${normalizeProviderEnvToken(facts.provider)}_API_KEY`;
    replayCommands.provider = `curl -sS '${endpoint}' -H 'Authorization: Bearer $${envToken}' -H 'Content-Type: application/json' --data @'${requestFilePath}'`;
  }
  if (captured.promptDebugFile !== undefined && facts.modelId !== undefined) {
    replayCommands.piOneShot = `pi --no-session --model '${facts.modelId}' --thinking ${facts.thinkingLevel ?? "off"} -p "$(cat '${captured.promptDebugFile}')"`;
  }
  const sessionForkFile = sessionSnapshotFileName !== undefined
    ? path.join(captured.logDirectory, sessionSnapshotFileName)
    : facts.executionSessionFile;
  if (sessionForkFile !== undefined) {
    const modelFlags = facts.modelId === undefined ? "" : ` --model '${facts.modelId}'`;
    const thinkingFlags = facts.thinkingLevel === undefined ? "" : ` --thinking ${facts.thinkingLevel}`;
    replayCommands.piFork = `pi --fork '${sessionForkFile}'${modelFlags}${thinkingFlags}`;
  }
  const sidecar = {
    provider: facts.provider ?? null,
    baseUrl: facts.baseUrl ?? null,
    api: facts.api ?? null,
    modelId: facts.modelId ?? null,
    thinkingLevel: facts.thinkingLevel ?? null,
    contextWindow: facts.contextWindow ?? null,
    maxTokens: facts.maxTokens ?? null,
    sessionFile: facts.executionSessionFile ?? null,
    promptFile: captured.promptDebugFile ?? null,
    requestFile: requestFilePath,
    replayCommands,
  };
  return `${JSON.stringify(sidecar, null, 2)}\n`;
}

/**
 * @brief Writes the captured provider request payload plus its response text and replay sidecar as error-stage prompt debug files.
 * @details Consumes the process-scoped capture, discards it after every write attempt so stale payloads never reach later runs, rejects failing statuses below 400, and writes the exact captured payload into one `<timestamp>-<req-command>-error-<status>.json` file that stays raw provider-request JSON usable with `curl --data @`, the provider error text into one identically timestamped `-response.txt` file when supplied, one identically timestamped byte-for-byte `-session.jsonl` copy of the retained execution session so `pi --fork` can resume the exact failing state from the prompt log directory alone, and the replay sidecar into one identically timestamped `-replay.json` file inside the captured log directory beside the initial dispatched prompt artifacts. Records the flushed location so a later finalized `message_end` error message can still append the `-response.txt` file when `after_provider_response` fired first without error text. All write inputs come from the capture itself, so the flush requires no live workflow state, cached configuration, or active controller prompt request. Runtime is dominated by one directory creation plus at most four file writes when a capture exists and O(1) otherwise. Side effects include directory creation and file creation only when a capture exists and the status is an error status.
 * @param[in] errorCode {number} Failing provider response status, such as `400`.
 * @param[in] errorResponseText {string | undefined} Finalized provider error message text when already available; the `-response` file is written later when omitted.
 * @return {boolean} `true` when the provider error payload file set is written; otherwise `false`.
 * @satisfies REQ-422, REQ-423, REQ-424, REQ-425, REQ-429, REQ-430, REQ-431, REQ-432, REQ-433, REQ-435
 */
export function flushCapturedPromptErrorPayload(errorCode: number, errorResponseText?: string): boolean {
  const captureStore = getProcessScopedPromptErrorCaptureStore();
  const captured = captureStore.capturedPromptErrorPayload;
  captureStore.capturedPromptErrorPayload = undefined;
  if (!captured || !Number.isFinite(errorCode) || errorCode < 400) {
    return false;
  }
  const writeTime = new Date();
  const payloadFileName = formatPromptDebugErrorPayloadFileName(captured.promptName, errorCode, writeTime);
  try {
    fs.mkdirSync(captured.logDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(captured.logDirectory, payloadFileName),
      captured.payloadText,
      "utf8",
    );
    if (typeof errorResponseText === "string" && errorResponseText.length > 0) {
      writePromptProviderErrorResponseFile(
        captured.logDirectory,
        formatPromptDebugErrorResponseFileName(captured.promptName, errorCode, writeTime),
        errorResponseText,
      );
    }
    const sessionSnapshotFileName = copyPromptErrorSessionSnapshotFile(
      captured,
      formatPromptDebugErrorSessionFileName(captured.promptName, errorCode, writeTime),
    );
    fs.writeFileSync(
      path.join(captured.logDirectory, formatPromptDebugErrorReplayFileName(captured.promptName, errorCode, writeTime)),
      buildPromptErrorReplaySidecarText(captured, payloadFileName, sessionSnapshotFileName),
      "utf8",
    );
    captureStore.lastFlushedPromptError = {
      promptName: captured.promptName,
      errorCode,
      logDirectory: captured.logDirectory,
      baseFileName: formatPromptDebugErrorFileName(captured.promptName, errorCode, writeTime),
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * @brief Writes one provider error response text file under a resolved log directory.
 * @details Creates the parent directory and writes the finalized provider error text with one trailing newline into the requested response filename so both the flush-time and the late `message_end` response writes share one deterministic serialization. Runtime is dominated by one directory creation plus one file write. Side effects include directory creation and file creation.
 * @param[in] logDirectory {string} Absolute prompt log directory owning the response file.
 * @param[in] fileName {string} Target response filename under the log directory.
 * @param[in] errorResponseText {string} Finalized provider error message text.
 * @return {void} No return value.
 * @satisfies REQ-429
 */
function writePromptProviderErrorResponseFile(
  logDirectory: string,
  fileName: string,
  errorResponseText: string,
): void {
  fs.mkdirSync(logDirectory, { recursive: true });
  fs.writeFileSync(path.join(logDirectory, fileName), `${errorResponseText}\n`, "utf8");
}

/**
 * @brief Copies the retained execution-session file beside one flushed provider error payload.
 * @details Duplicates the captured execution-session file byte-for-byte into the captured log directory under the requested `-session.jsonl` filename synchronously during the error-stage flush, so the snapshot freezes the transcript exactly at the state that produced the failing provider request before pi's `context_edit` or compaction appends further entries and stays directly consumable by `pi --fork` without any file outside the prompt log directory. Degrades to `undefined` on any copy failure so the replay sidecar falls back to the retained execution-session path. Runtime is dominated by one directory creation plus one file copy. Side effects include directory creation and file creation.
 * @param[in] captured {CapturedPromptErrorPayload} Consumed capture supplying the log directory and execution-session replay facts.
 * @param[in] snapshotFileName {string} Session-snapshot filename sharing the payload write-time timestamp.
 * @return {string | undefined} Written snapshot filename when the copy succeeds; otherwise `undefined`.
 * @satisfies REQ-432
 */
function copyPromptErrorSessionSnapshotFile(
  captured: CapturedPromptErrorPayload,
  snapshotFileName: string,
): string | undefined {
  const sessionFile = captured.replayFacts.executionSessionFile;
  if (sessionFile === undefined || sessionFile.length === 0) {
    return undefined;
  }
  try {
    fs.mkdirSync(captured.logDirectory, { recursive: true });
    fs.copyFileSync(sessionFile, path.join(captured.logDirectory, snapshotFileName));
    return snapshotFileName;
  } catch {
    return undefined;
  }
}

/**
 * @brief Appends the provider error response text beside one already flushed error payload file.
 * @details Providers that fire `after_provider_response` before surfacing their error text flush the payload without a `-response.txt` file, so this helper writes the finalized `message_end` error message beside the recorded flush location when the failing status matches. Runtime is dominated by one directory creation plus one file write when a matching record exists and O(1) otherwise. Side effects include directory creation and file creation only for a matching record.
 * @param[in] errorCode {number} Failing provider response status carried by the finalized error message.
 * @param[in] errorResponseText {string} Finalized provider error message text.
 * @return {boolean} `true` when the response file is written; otherwise `false`.
 * @satisfies REQ-429
 */
export function writeFlushedPromptProviderErrorResponse(
  errorCode: number,
  errorResponseText: string,
): boolean {
  if (typeof errorResponseText !== "string" || errorResponseText.length === 0) {
    return false;
  }
  const record = getProcessScopedPromptErrorCaptureStore().lastFlushedPromptError;
  if (record === undefined || record.errorCode !== errorCode) {
    return false;
  }
  try {
    writePromptProviderErrorResponseFile(
      record.logDirectory,
      `${record.baseFileName}-response.txt`,
      errorResponseText,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @brief Discards any captured provider request payload and flushed error record for the ended prompt run.
 * @details Clears the process-scoped capture and the latest flushed error record unconditionally so leftover payloads and flush locations from a finished `req-*` prompt run never flush into later provider errors raised outside extension-owned prompt orchestration. Runtime is O(1). Side effect: mutates the process-scoped capture store.
 * @return {void} No return value.
 * @satisfies REQ-421, REQ-425, REQ-429
 */
export function discardCapturedPromptErrorPayload(): void {
  const captureStore = getProcessScopedPromptErrorCaptureStore();
  captureStore.capturedPromptErrorPayload = undefined;
  captureStore.lastFlushedPromptError = undefined;
}
