/**
 * @file
 * @brief Implements pi-usereq command-notify, sound, and Pushover prompt-end helpers.
 * @details Centralizes configuration defaults, status serialization, prompt-end outcome classification, placeholder substitution, detached shell-command execution, and native Pushover delivery. Runtime is O(m + c + b) in `agent_end` message count plus command length and Pushover payload size. Side effects include detached child-process spawning and outbound HTTPS requests.
 */

import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as https from "node:https";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import { getInstallationPath, normalizePathSlashes } from "./path-context.js";
import type { UseReqConfig } from "./config.js";

/**
 * @brief Enumerates supported sound levels.
 * @details Defines the canonical persisted order used by config normalization, shortcut cycling, status rendering, and sound-command selection. Access complexity is O(1).
 */
export const PI_NOTIFY_SOUND_LEVELS = ["none", "low", "mid", "high"] as const;

/**
 * @brief Represents one supported sound level.
 * @details Narrows configuration parsing and runtime sound-command dispatch to the canonical four-state domain. Compile-time only and introduces no runtime cost.
 */
export type PiNotifySoundLevel = (typeof PI_NOTIFY_SOUND_LEVELS)[number];

/**
 * @brief Enumerates supported prompt-end outcomes.
 * @details Distinguishes successful completion, escape-triggered abortion, and error termination for per-feature event routing. Access complexity is O(1).
 */
export const PI_NOTIFY_OUTCOMES = ["end", "esc", "err"] as const;

/**
 * @brief Represents one supported prompt-end outcome.
 * @details Narrows prompt-end event classification and per-feature toggle routing to the canonical three-outcome domain. Compile-time only and introduces no runtime cost.
 */
export type PiNotifyOutcome = (typeof PI_NOTIFY_OUTCOMES)[number];

/**
 * @brief Defines the default sound toggle shortcut.
 * @details Seeds persisted configuration when no project-specific shortcut exists. Access complexity is O(1).
 * @satisfies REQ-134
 */
export const DEFAULT_PI_NOTIFY_SOUND_TOGGLE_SHORTCUT = "alt+s";

/**
 * @brief Defines the default command-notify shell command.
 * @details Uses `notify-send`, the bundled icon, and runtime placeholder substitution for prompt name, base path, elapsed time, and raw prompt arguments. Access complexity is O(1).
 * @satisfies REQ-175
 */
export const DEFAULT_PI_NOTIFY_CMD = "notify-send -i %%INSTALLATION_PATH%%/resources/images/pi.dev.png \"%%PROMT%% @ %%BASE%% [%%TIME%%]\" \"%%ARGS%%\"";

/**
 * @brief Defines the default low-volume sound command.
 * @details Uses the bundled notification asset with a low playback volume and defers `%%INSTALLATION_PATH%%` substitution until runtime execution. Access complexity is O(1).
 * @satisfies REQ-133
 */
export const DEFAULT_PI_NOTIFY_SOUND_LOW_CMD = "paplay --volume=21845 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3";

/**
 * @brief Defines the default mid-volume sound command.
 * @details Uses the bundled notification asset with a mid playback volume and defers `%%INSTALLATION_PATH%%` substitution until runtime execution. Access complexity is O(1).
 * @satisfies REQ-133
 */
export const DEFAULT_PI_NOTIFY_SOUND_MID_CMD = "paplay --volume=43690 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3";

/**
 * @brief Defines the default high-volume sound command.
 * @details Uses the bundled notification asset with a high playback volume and defers `%%INSTALLATION_PATH%%` substitution until runtime execution. Access complexity is O(1).
 * @satisfies REQ-133
 */
export const DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD = "paplay --volume=65535 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3";

/**
 * @brief Defines the default Pushover title template.
 * @details Reuses the same runtime placeholder contract required by `PI_NOTIFY_CMD` except for `%%INSTALLATION_PATH%%`. Access complexity is O(1).
 * @satisfies REQ-185
 */
export const DEFAULT_PI_NOTIFY_PUSHOVER_TITLE = "%%PROMT%% @ %%BASE%% [%%TIME%%]";

/**
 * @brief Defines the default Pushover text template.
 * @details Reuses the raw prompt-argument placeholder so outbound Pushover messages remain traceable to the invoked prompt command. Access complexity is O(1).
 * @satisfies REQ-185
 */
export const DEFAULT_PI_NOTIFY_PUSHOVER_TEXT = "%%ARGS%%";

/**
 * @brief Enumerates supported Pushover priorities.
 * @details Restricts persisted Pushover delivery to the canonical normal and high-priority values accepted by the configuration menu. Access complexity is O(1).
 */
export const PI_NOTIFY_PUSHOVER_PRIORITIES = [0, 1] as const;

/**
 * @brief Represents one supported Pushover priority value.
 * @details Narrows Pushover configuration parsing and request serialization to the canonical `0|1` priority domain. Compile-time only and introduces no runtime cost.
 */
export type PiNotifyPushoverPriority = (typeof PI_NOTIFY_PUSHOVER_PRIORITIES)[number];

/**
 * @brief Describes one prompt-end request used for command-notify and Pushover substitution.
 * @details Stores the prompt command name, raw prompt arguments, runtime base path, and final prompt duration required to resolve runtime placeholders. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiNotifyEventRequest {
  promptName: string;
  promptArgs: string;
  basePath: string;
  completionTimeMs: number;
}

/**
 * @brief Describes the configuration fields consumed by pi-notify helpers.
 * @details Narrows the full project config to the persisted notify, sound, and Pushover fields used by status rendering, prompt-end routing, and shortcut toggles. Compile-time only and introduces no runtime cost.
 */
export type PiNotifyConfigFields = Pick<
  UseReqConfig,
  | "notify-enabled"
  | "notify-on-end"
  | "notify-on-esc"
  | "notify-on-error"
  | "notify-sound"
  | "notify-sound-on-end"
  | "notify-sound-on-esc"
  | "notify-sound-on-error"
  | "notify-sound-toggle-shortcut"
  | "notify-pushover-enabled"
  | "notify-pushover-on-end"
  | "notify-pushover-on-esc"
  | "notify-pushover-on-error"
  | "notify-pushover-user-key"
  | "notify-pushover-api-token"
  | "notify-pushover-priority"
  | "notify-pushover-title"
  | "notify-pushover-text"
  | "PI_NOTIFY_CMD"
  | "PI_NOTIFY_SOUND_LOW_CMD"
  | "PI_NOTIFY_SOUND_MID_CMD"
  | "PI_NOTIFY_SOUND_HIGH_CMD"
>;

/**
 * @brief Describes the shell-spawn callback used by prompt-end command dispatch.
 * @details Narrows the injected spawn surface so deterministic tests can capture detached shell invocations without patching global module state externally. Compile-time only and introduces no runtime cost.
 */
type PiNotifySpawn = typeof spawn;

/**
 * @brief Stores the currently configured native HTTPS request function used for Pushover delivery.
 * @details Defaults to `node:https.request` and can be replaced by deterministic tests so Pushover dispatch remains observable without real network I/O. Access complexity is O(1). Side effect: mutated only through the dedicated test hook.
 */
let piNotifyHttpsRequest: typeof https.request = https.request;

/**
 * @brief Stores the currently configured shell-spawn function used for notify and sound commands.
 * @details Defaults to `node:child_process.spawn` and can be replaced by deterministic tests so detached shell-command execution remains observable without launching real child processes. Access complexity is O(1). Side effect: mutated only through the dedicated test hook.
 */
let piNotifySpawn: PiNotifySpawn = spawn;

/**
 * @brief Normalizes one persisted sound level.
 * @details Accepts only canonical `none|low|mid|high` values and falls back to `none` for missing or invalid payloads. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Raw persisted sound-level payload.
 * @return {PiNotifySoundLevel} Canonical sound level.
 * @satisfies REQ-131
 */
export function normalizePiNotifySoundLevel(value: unknown): PiNotifySoundLevel {
  return PI_NOTIFY_SOUND_LEVELS.includes(value as PiNotifySoundLevel)
    ? (value as PiNotifySoundLevel)
    : "none";
}

/**
 * @brief Normalizes one persisted sound toggle shortcut.
 * @details Accepts any non-empty string so project config can carry raw pi shortcut syntax and falls back to the canonical default when the payload is empty or invalid. Runtime is O(n) in shortcut length. No external state is mutated.
 * @param[in] value {unknown} Raw persisted shortcut payload.
 * @return {string} Canonical non-empty shortcut string.
 * @satisfies REQ-134
 */
export function normalizePiNotifyShortcut(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_PI_NOTIFY_SOUND_TOGGLE_SHORTCUT;
}

/**
 * @brief Normalizes one persisted shell-command string.
 * @details Accepts any non-empty string so project config can override bundled command templates verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in command length. No external state is mutated.
 * @param[in] value {unknown} Raw persisted command payload.
 * @param[in] fallback {string} Canonical fallback command.
 * @return {string} Canonical non-empty command string.
 * @satisfies REQ-133, REQ-175
 */
export function normalizePiNotifyCommand(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * @brief Normalizes one persisted template string.
 * @details Accepts any non-empty string so Pushover title and text templates can be user-configured verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in template length. No external state is mutated.
 * @param[in] value {unknown} Raw persisted template payload.
 * @param[in] fallback {string} Canonical fallback template.
 * @return {string} Canonical non-empty template string.
 * @satisfies REQ-185
 */
export function normalizePiNotifyTemplateValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * @brief Normalizes one persisted Pushover credential string.
 * @details Accepts any trimmed string so the project config can store raw Pushover user and token values verbatim and falls back to the empty string for missing or invalid payloads. Runtime is O(n) in credential length. No external state is mutated.
 * @param[in] value {unknown} Raw persisted credential payload.
 * @return {string} Canonical credential string.
 * @satisfies REQ-163
 */
export function normalizePiNotifyPushoverCredential(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @brief Normalizes one persisted Pushover priority value.
 * @details Accepts only canonical `0` and `1` values, treating numeric-string `"1"` as high priority and every other payload as normal priority. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Raw persisted priority payload.
 * @return {PiNotifyPushoverPriority} Canonical priority value.
 * @satisfies REQ-172
 */
export function normalizePiNotifyPushoverPriority(value: unknown): PiNotifyPushoverPriority {
  return value === 1 || value === "1" ? 1 : 0;
}

/**
 * @brief Formats the global command-notify flag for UI value rendering.
 * @details Serializes only the persisted global command-notify enable state so configuration menus and summaries can report `on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
 * @param[in] config {Pick<UseReqConfig, "notify-enabled">} Effective command-notify configuration subset.
 * @return {string} `on` when command-notify is globally enabled; otherwise `off`.
 * @satisfies REQ-196
 */
export function formatPiNotifyStatus(config: Pick<UseReqConfig, "notify-enabled">): string {
  return config["notify-enabled"] ? "on" : "off";
}

/**
 * @brief Formats the global Pushover flag for UI value rendering.
 * @details Serializes only the persisted global Pushover enable state so configuration menus and summaries can report `on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
 * @param[in] config {Pick<UseReqConfig, "notify-pushover-enabled">} Effective Pushover configuration subset.
 * @return {string} `on` when Pushover is globally enabled; otherwise `off`.
 * @satisfies REQ-163
 */
export function formatPiNotifyPushoverStatus(config: Pick<UseReqConfig, "notify-pushover-enabled">): string {
  return config["notify-pushover-enabled"] ? "on" : "off";
}

/**
 * @brief Cycles one sound level through the canonical shortcut order.
 * @details Advances persisted sound state in the exact order `none -> low -> mid -> high -> none`, enabling deterministic shortcut toggling and menu reuse. Runtime is O(1). No external state is mutated.
 * @param[in] currentLevel {PiNotifySoundLevel} Current persisted sound level.
 * @return {PiNotifySoundLevel} Next sound level in the cycle.
 * @satisfies REQ-134
 */
export function cyclePiNotifySoundLevel(currentLevel: PiNotifySoundLevel): PiNotifySoundLevel {
  const currentIndex = PI_NOTIFY_SOUND_LEVELS.indexOf(currentLevel);
  const nextIndex = currentIndex >= 0
    ? (currentIndex + 1) % PI_NOTIFY_SOUND_LEVELS.length
    : 0;
  return PI_NOTIFY_SOUND_LEVELS[nextIndex];
}

/**
 * @brief Tests whether one outcome-specific toggle is enabled.
 * @details Reuses the canonical `end|esc|err` routing order shared by notify, sound, and Pushover event toggles. Runtime is O(1). No external state is mutated.
 * @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
 * @param[in] endEnabled {boolean} Enabled state for successful completion.
 * @param[in] escEnabled {boolean} Enabled state for escape-triggered abortion.
 * @param[in] errEnabled {boolean} Enabled state for error termination.
 * @return {boolean} `true` when the selected outcome flag is enabled.
 */
function isPiNotifyOutcomeEnabled(
  outcome: PiNotifyOutcome,
  endEnabled: boolean,
  escEnabled: boolean,
  errEnabled: boolean,
): boolean {
  switch (outcome) {
    case "esc":
      return escEnabled;
    case "err":
      return errEnabled;
    default:
      return endEnabled;
  }
}

/**
 * @brief Detects whether one agent-end payload contains the requested stop reason.
 * @details Scans assistant messages only so prompt-end classification remains stable even when user or tool-result messages also appear in the payload. Runtime is O(m) in message count. No external state is mutated.
 * @param[in] messages {AgentEndEvent["messages"]} Agent-end message list.
 * @param[in] stopReason {"aborted" | "error"} Stop reason to detect.
 * @return {boolean} `true` when an assistant message carries the requested stop reason.
 */
function hasAgentEndStopReason(
  messages: AgentEndEvent["messages"],
  stopReason: "aborted" | "error",
): boolean {
  return messages.some((message) =>
    typeof message === "object"
    && message !== null
    && (message as { role?: unknown }).role === "assistant"
    && (message as { stopReason?: unknown }).stopReason === stopReason,
  );
}

/**
 * @brief Classifies one agent-end payload into the canonical pi-notify outcome.
 * @details Treats assistant `stopReason=error` as `err`, `stopReason=aborted` as `esc`, and every remaining terminal state as successful `end`. Runtime is O(m) in message count. No external state is mutated.
 * @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
 * @return {PiNotifyOutcome} Canonical prompt-end outcome.
 */
export function classifyPiNotifyOutcome(event: Pick<AgentEndEvent, "messages">): PiNotifyOutcome {
  if (hasAgentEndStopReason(event.messages, "error")) {
    return "err";
  }
  if (hasAgentEndStopReason(event.messages, "aborted")) {
    return "esc";
  }
  return "end";
}

/**
 * @brief Formats one prompt-end duration for runtime placeholders.
 * @details Floors the supplied duration to whole seconds, keeps minutes unbounded above 59, and zero-pads seconds to two digits so `%%TIME%%` aligns with status-bar elapsed formatting. Runtime is O(1). No external state is mutated.
 * @param[in] durationMs {number} Prompt-end duration in milliseconds.
 * @return {string} Duration rendered as `M:SS`.
 * @satisfies REQ-187
 */
function formatPiNotifyDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * @brief Formats one runtime base path for placeholder substitution.
 * @details Emits `~` or `~/...` when the supplied path equals or descends from the current user home directory; otherwise emits the slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] basePath {string} Runtime base path.
 * @return {string} Placeholder-ready base path string.
 * @satisfies REQ-187
 */
function formatPiNotifyBasePath(basePath: string): string {
  const normalizedBasePath = path.resolve(basePath);
  const homePath = path.resolve(os.homedir());
  if (normalizedBasePath === homePath) {
    return "~";
  }
  const relativePath = path.relative(homePath, normalizedBasePath);
  if (relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return `~/${normalizePathSlashes(relativePath)}`;
  }
  return normalizePathSlashes(normalizedBasePath);
}

/**
 * @brief Builds the raw runtime placeholder map for one prompt-end request.
 * @details Resolves every placeholder value exactly once so notify-command and Pushover template substitution reuse the same prompt name, base path, elapsed time, and argument string. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @return {{ "%%PROMT%%": string; "%%BASE%%": string; "%%TIME%%": string; "%%ARGS%%": string }} Raw placeholder-value map.
 */
function buildPiNotifyRuntimeTemplateValues(
  request: PiNotifyEventRequest,
): Record<string, string> {
  return {
    "%%PROMT%%": request.promptName,
    "%%BASE%%": formatPiNotifyBasePath(request.basePath),
    "%%TIME%%": formatPiNotifyDuration(request.completionTimeMs),
    "%%ARGS%%": request.promptArgs,
  };
}

/**
 * @brief Quotes one installation path for shell substitution.
 * @details Emits POSIX single-quoted literals for `sh -lc` execution and CMD double-quoted literals for `cmd.exe /c` execution so `%%INSTALLATION_PATH%%` substitutions preserve whitespace safely. Runtime is O(n) in path length. No external state is mutated.
 * @param[in] installationPath {string} Absolute extension installation path.
 * @return {string} Shell-quoted installation path fragment.
 */
function quotePiNotifyInstallPath(installationPath: string): string {
  if (process.platform === "win32") {
    return `"${installationPath.replace(/"/g, '""')}"`;
  }
  return `'${installationPath.replace(/'/g, `'\\''`)}'`;
}

/**
 * @brief Escapes one placeholder value for double-quoted shell insertion.
 * @details Escapes the characters interpreted specially by POSIX or CMD double-quoted strings so default notify-command templates remain safe when placeholders are embedded inside double quotes. Runtime is O(n) in value length. No external state is mutated.
 * @param[in] value {string} Raw placeholder value.
 * @return {string} Shell-escaped placeholder fragment without surrounding quotes.
 */
function escapePiNotifyShellTemplateValue(value: string): string {
  if (process.platform === "win32") {
    return value.replace(/%/g, "%%").replace(/"/g, '""');
  }
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"');
}

/**
 * @brief Substitutes `%%INSTALLATION_PATH%%` inside one shell command.
 * @details Replaces every `%%INSTALLATION_PATH%%` token with a shell-quoted runtime installation path so bundled assets can be addressed safely from external commands. Runtime is O(n) in command length. No external state is mutated.
 * @param[in] command {string} Raw configured shell command.
 * @param[in] installationPath {string} Absolute extension installation path.
 * @return {string} Runtime-ready command string.
 * @satisfies REQ-169
 */
export function substitutePiNotifyInstallPath(command: string, installationPath: string): string {
  return command.replaceAll(
    "%%INSTALLATION_PATH%%",
    quotePiNotifyInstallPath(installationPath),
  );
}

/**
 * @brief Substitutes runtime placeholders inside one shell-command template.
 * @details Applies shell-quoted installation-path substitution plus shell-escaped prompt, base-path, elapsed-time, and raw-argument substitution expected by `PI_NOTIFY_CMD`. Runtime is O(n) in template length. No external state is mutated.
 * @param[in] template {string} Raw shell-command template.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @param[in] installationPath {string} Absolute extension installation path.
 * @return {string} Runtime-ready shell command.
 * @satisfies REQ-169
 */
function substitutePiNotifyShellTemplate(
  template: string,
  request: PiNotifyEventRequest,
  installationPath: string,
): string {
  const runtimeValues = buildPiNotifyRuntimeTemplateValues(request);
  let result = substitutePiNotifyInstallPath(template, installationPath);
  for (const [token, value] of Object.entries(runtimeValues)) {
    result = result.replaceAll(token, escapePiNotifyShellTemplateValue(value));
  }
  return result;
}

/**
 * @brief Substitutes runtime placeholders inside one text template.
 * @details Applies raw prompt name, home-relative base path, elapsed time, and raw prompt-argument substitution without shell escaping so Pushover payloads preserve literal text. Runtime is O(n) in template length. No external state is mutated.
 * @param[in] template {string} Raw text template.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @return {string} Placeholder-resolved text string.
 * @satisfies REQ-186, REQ-187
 */
function substitutePiNotifyTextTemplate(
  template: string,
  request: PiNotifyEventRequest,
): string {
  let result = template;
  for (const [token, value] of Object.entries(buildPiNotifyRuntimeTemplateValues(request))) {
    result = result.replaceAll(token, value);
  }
  return result;
}

/**
 * @brief Executes one detached shell command without waiting for completion.
 * @details Uses the platform-default shell contract already employed by sound-command execution and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include detached child-process execution.
 * @param[in] command {string} Runtime-ready shell command.
 * @return {void} No return value.
 */
function runPiNotifyShellCommand(command: string): void {
  const shell = process.platform === "win32" ? "cmd.exe" : (process.env.SHELL ?? "sh");
  const shellArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", command]
    : ["-lc", command];
  const child = piNotifySpawn(shell, shellArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", () => undefined);
  child.unref();
}

/**
 * @brief Determines whether one prompt-end outcome should trigger command-notify.
 * @details Requires a prompt-end request, the global command-notify enable flag, and the corresponding per-event notify toggle. Runtime is O(1). No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
 * @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
 * @return {boolean} `true` when command-notify prerequisites are satisfied.
 * @satisfies REQ-174, REQ-176
 */
function shouldRunPiNotifyCommand(
  config: PiNotifyConfigFields,
  outcome: PiNotifyOutcome,
  request: PiNotifyEventRequest | undefined,
): boolean {
  return request !== undefined
    && config["notify-enabled"]
    && isPiNotifyOutcomeEnabled(
      outcome,
      config["notify-on-end"],
      config["notify-on-esc"],
      config["notify-on-error"],
    );
}

/**
 * @brief Executes the configured command-notify shell command.
 * @details Resolves the runtime installation path, substitutes runtime placeholders into `PI_NOTIFY_CMD`, and spawns the resulting command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @return {void} No return value.
 * @satisfies REQ-169, REQ-175, REQ-176
 */
function runPiNotifyCommand(
  config: PiNotifyConfigFields,
  request: PiNotifyEventRequest,
): void {
  const installationPath = getInstallationPath();
  const command = substitutePiNotifyShellTemplate(
    config.PI_NOTIFY_CMD,
    request,
    installationPath,
  );
  runPiNotifyShellCommand(command);
}

/**
 * @brief Resolves the configured command for one non-`none` sound level.
 * @details Selects the matching persisted command string from config without performing runtime substitution or shell execution. Runtime is O(1). No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Non-disabled sound level.
 * @return {string} Configured command string for the requested level.
 */
function resolvePiNotifySoundCommand(
  config: PiNotifyConfigFields,
  soundLevel: Exclude<PiNotifySoundLevel, "none">,
): string {
  switch (soundLevel) {
    case "low":
      return config.PI_NOTIFY_SOUND_LOW_CMD;
    case "mid":
      return config.PI_NOTIFY_SOUND_MID_CMD;
    case "high":
      return config.PI_NOTIFY_SOUND_HIGH_CMD;
  }
}

/**
 * @brief Determines whether one prompt-end outcome should trigger sound-command execution.
 * @details Requires a non-`none` sound level and the corresponding per-event sound toggle. Runtime is O(1). No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
 * @return {boolean} `true` when sound-command prerequisites are satisfied.
 * @satisfies REQ-178
 */
function shouldRunPiNotifySound(
  config: PiNotifyConfigFields,
  outcome: PiNotifyOutcome,
): boolean {
  return config["notify-sound"] !== "none"
    && isPiNotifyOutcomeEnabled(
      outcome,
      config["notify-sound-on-end"],
      config["notify-sound-on-esc"],
      config["notify-sound-on-error"],
    );
}

/**
 * @brief Executes the configured sound command on an external shell.
 * @details Resolves the runtime installation path, substitutes `%%INSTALLATION_PATH%%`, and spawns the configured command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Requested non-disabled sound level.
 * @return {void} No return value.
 * @satisfies REQ-132, REQ-133
 */
export function runPiNotifySoundCommand(
  config: PiNotifyConfigFields,
  soundLevel: Exclude<PiNotifySoundLevel, "none">,
): void {
  const rawCommand = resolvePiNotifySoundCommand(config, soundLevel);
  const command = substitutePiNotifyInstallPath(rawCommand, getInstallationPath());
  runPiNotifyShellCommand(command);
}

/**
 * @brief Determines whether one prompt-end outcome should trigger Pushover delivery.
 * @details Requires a prompt-end request, the global Pushover enable flag, the corresponding per-event Pushover toggle, and non-empty user plus token credentials. Runtime is O(1). No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
 * @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
 * @return {boolean} `true` when Pushover delivery prerequisites are satisfied.
 * @satisfies REQ-166, REQ-168, REQ-184
 */
function shouldRunPiNotifyPushover(
  config: PiNotifyConfigFields,
  outcome: PiNotifyOutcome,
  request: PiNotifyEventRequest | undefined,
): boolean {
  return request !== undefined
    && config["notify-pushover-enabled"]
    && isPiNotifyOutcomeEnabled(
      outcome,
      config["notify-pushover-on-end"],
      config["notify-pushover-on-esc"],
      config["notify-pushover-on-error"],
    )
    && config["notify-pushover-user-key"] !== ""
    && config["notify-pushover-api-token"] !== "";
}

/**
 * @brief Builds the Pushover notification title for one prompt-end request.
 * @details Resolves the configured `notify-pushover-title` template with raw runtime placeholder substitution so the pushed title remains configurable and deterministic. Runtime is O(n) in template length. No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @return {string} Pushover title string.
 * @satisfies REQ-185, REQ-186, REQ-187
 */
function buildPiNotifyPushoverTitle(
  config: PiNotifyConfigFields,
  request: PiNotifyEventRequest,
): string {
  return substitutePiNotifyTextTemplate(config["notify-pushover-title"], request);
}

/**
 * @brief Builds the Pushover message body for one prompt-end request.
 * @details Resolves the configured `notify-pushover-text` template with raw runtime placeholder substitution so the pushed text remains configurable and deterministic. Runtime is O(n) in template length. No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @return {string} Pushover message body.
 * @satisfies REQ-185, REQ-186, REQ-187
 */
function buildPiNotifyPushoverBody(
  config: PiNotifyConfigFields,
  request: PiNotifyEventRequest,
): string {
  return substitutePiNotifyTextTemplate(config["notify-pushover-text"], request);
}

/**
 * @brief Builds the Pushover API payload for one prompt-end request.
 * @details Encodes the configured token, user key, substituted title, priority, and substituted text as `application/x-www-form-urlencoded` fields accepted by the Pushover Message API. Runtime is O(n) in payload size. No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @return {URLSearchParams} Encoded Pushover request payload.
 * @satisfies REQ-167, REQ-172, REQ-185, REQ-186
 */
function buildPiNotifyPushoverPayload(
  config: PiNotifyConfigFields,
  request: PiNotifyEventRequest,
): URLSearchParams {
  return new URLSearchParams({
    token: config["notify-pushover-api-token"],
    user: config["notify-pushover-user-key"],
    title: buildPiNotifyPushoverTitle(config, request),
    priority: String(config["notify-pushover-priority"]),
    message: buildPiNotifyPushoverBody(config, request),
  });
}

/**
 * @brief Dispatches one native HTTPS request to the Pushover Message API.
 * @details Serializes the request body as URL-encoded form data, posts it to `https://api.pushover.net/1/messages.json`, drains the response, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by outbound I/O. Side effects include one HTTPS request.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
 * @return {void} No return value.
 * @satisfies REQ-167
 */
function runPiNotifyPushoverRequest(
  config: PiNotifyConfigFields,
  request: PiNotifyEventRequest,
): void {
  const url = new URL("https://api.pushover.net/1/messages.json");
  const body = buildPiNotifyPushoverPayload(config, request).toString();
  const httpRequest = piNotifyHttpsRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(body)),
    },
  }, (response) => {
    response.on?.("error", () => undefined);
    response.resume?.();
  });
  httpRequest.on("error", () => undefined);
  httpRequest.end(body);
}

/**
 * @brief Replaces the native HTTPS request function used for Pushover delivery in deterministic tests.
 * @details Accepts a drop-in `node:https.request` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local Pushover transport hook.
 * @param[in] requestImpl {typeof https.request | undefined} Replacement HTTPS request function.
 * @return {void} No return value.
 */
export function setPiNotifyHttpsRequestForTests(requestImpl: typeof https.request | undefined): void {
  piNotifyHttpsRequest = requestImpl ?? https.request;
}

/**
 * @brief Replaces the shell-spawn function used for notify and sound commands in deterministic tests.
 * @details Accepts a drop-in `node:child_process.spawn` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local shell transport hook.
 * @param[in] spawnImpl {PiNotifySpawn | undefined} Replacement shell-spawn function.
 * @return {void} No return value.
 */
export function setPiNotifySpawnForTests(spawnImpl: PiNotifySpawn | undefined): void {
  piNotifySpawn = spawnImpl ?? spawn;
}

/**
 * @brief Dispatches prompt-end notify, sound, and Pushover effects for one agent-end payload.
 * @details Classifies the terminal outcome, executes `PI_NOTIFY_CMD` when command-notify prerequisites are satisfied, executes the configured sound command when sound prerequisites are satisfied, and dispatches the native Pushover request when Pushover prerequisites are satisfied. Runtime is O(m + c + b) in message count, command length, and Pushover payload size. Side effects include child-process spawning and outbound HTTPS requests.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
 * @param[in] request {PiNotifyEventRequest | undefined} Optional prompt-end request metadata used for command-notify and Pushover substitution.
 * @return {void} No return value.
 * @satisfies REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187
 */
export function runPiNotifyEffects(
  config: PiNotifyConfigFields,
  event: Pick<AgentEndEvent, "messages">,
  request?: PiNotifyEventRequest,
): void {
  const outcome = classifyPiNotifyOutcome(event);
  if (shouldRunPiNotifyCommand(config, outcome, request)) {
    runPiNotifyCommand(config, request as PiNotifyEventRequest);
  }
  if (shouldRunPiNotifySound(config, outcome)) {
    runPiNotifySoundCommand(
      config,
      config["notify-sound"] as Exclude<PiNotifySoundLevel, "none">,
    );
  }
  if (!shouldRunPiNotifyPushover(config, outcome, request)) {
    return;
  }
  runPiNotifyPushoverRequest(config, request as PiNotifyEventRequest);
}
