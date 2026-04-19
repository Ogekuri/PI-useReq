/**
 * @file
 * @brief Implements pi-usereq terminal-beep, external sound-hook, and Pushover notification helpers.
 * @details Centralizes configuration defaults, status serialization, agent-end outcome classification, terminal notification dispatch, successful-run external sound-command execution, and successful-run Pushover delivery. Runtime is O(m + c + b) in `agent_end` message count plus command length and Pushover payload size. Side effects include stdout writes, detached child-process spawning, and outbound HTTPS requests.
 */

import { execFile, spawn } from "node:child_process";
import * as https from "node:https";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import { getInstallationPath } from "./path-context.js";
import type { UseReqConfig } from "./config.js";

/**
 * @brief Enumerates supported successful-run sound levels.
 * @details Defines the canonical persisted order used by config normalization, shortcut cycling, status rendering, and external command selection. Access complexity is O(1).
 */
export const PI_NOTIFY_SOUND_LEVELS = ["none", "low", "mid", "high"] as const;

/**
 * @brief Represents one supported successful-run sound level.
 * @details Narrows configuration parsing and runtime command dispatch to the canonical four-state sound-hook domain. Compile-time only and introduces no runtime cost.
 */
export type PiNotifySoundLevel = (typeof PI_NOTIFY_SOUND_LEVELS)[number];

/**
 * @brief Enumerates supported prompt-end notification outcomes.
 * @details Distinguishes successful completion, escape-triggered abortion, and error termination for independent beep routing. Access complexity is O(1).
 */
export const PI_NOTIFY_OUTCOMES = ["end", "esc", "err"] as const;

/**
 * @brief Represents one supported prompt-end notification outcome.
 * @details Narrows prompt-end event classification and status serialization to the canonical three-outcome domain. Compile-time only and introduces no runtime cost.
 */
export type PiNotifyOutcome = (typeof PI_NOTIFY_OUTCOMES)[number];

/**
 * @brief Defines the default successful-run sound toggle shortcut.
 * @details Seeds persisted configuration when no project-specific shortcut exists. Access complexity is O(1).
 * @satisfies REQ-134
 */
export const DEFAULT_PI_NOTIFY_SOUND_TOGGLE_SHORTCUT = "alt+s";

/**
 * @brief Defines the default low-level successful-run sound command.
 * @details Uses the bundled soft notification asset with a low playback volume and defers `%%INSTALLATION_PATH%%` substitution until runtime execution. Access complexity is O(1).
 * @satisfies REQ-133, REQ-142
 */
export const DEFAULT_PI_NOTIFY_SOUND_LOW_CMD = "paplay --volume=21845 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3";

/**
 * @brief Defines the default mid-level successful-run sound command.
 * @details Uses the bundled soft notification asset with a mid playback volume and defers `%%INSTALLATION_PATH%%` substitution until runtime execution. Access complexity is O(1).
 * @satisfies REQ-133, REQ-143
 */
export const DEFAULT_PI_NOTIFY_SOUND_MID_CMD = "paplay --volume=43690 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3";

/**
 * @brief Defines the default high-level successful-run sound command.
 * @details Uses the bundled soft notification asset with a high playback volume and defers `%%INSTALLATION_PATH%%` substitution until runtime execution. Access complexity is O(1).
 * @satisfies REQ-133, REQ-144
 */
export const DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD = "paplay --volume=65535 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3";

/**
 * @brief Enumerates supported Pushover priorities.
 * @details Restricts persisted Pushover delivery to the canonical normal and high-priority values accepted by the user-facing configuration menu. Access complexity is O(1).
 */
export const PI_NOTIFY_PUSHOVER_PRIORITIES = [0, 1] as const;

/**
 * @brief Represents one supported Pushover priority value.
 * @details Narrows Pushover configuration parsing and request serialization to the canonical `0|1` priority domain. Compile-time only and introduces no runtime cost.
 */
export type PiNotifyPushoverPriority = (typeof PI_NOTIFY_PUSHOVER_PRIORITIES)[number];

/**
 * @brief Describes one successful prompt-completion payload routed to Pushover.
 * @details Stores the prompt command name, substituted prompt arguments, runtime base path, and successful completion duration used to build one Pushover API request. The interface is compile-time only and introduces no runtime side effects.
 */
export interface PiNotifyPushoverRequest {
  promptName: string;
  promptArgs: string;
  basePath: string;
  completionTimeMs: number;
}

/**
 * @brief Describes the configuration fields consumed by pi-notify helpers.
 * @details Narrows the full project config to the persisted notification, sound-hook, and Pushover fields used by status rendering, prompt-end routing, and shortcut toggles. Compile-time only and introduces no runtime cost.
 */
export type PiNotifyConfigFields = Pick<
  UseReqConfig,
  | "notify-beep-on-end"
  | "notify-beep-on-esc"
  | "notify-beep-on-error"
  | "notify-sound"
  | "notify-sound-toggle-shortcut"
  | "notify-pushover-global-disable"
  | "notify-pushover-on-success"
  | "notify-pushover-user-key"
  | "notify-pushover-api-token"
  | "notify-pushover-priority"
  | "PI_NOTIFY_SOUND_LOW_CMD"
  | "PI_NOTIFY_SOUND_MID_CMD"
  | "PI_NOTIFY_SOUND_HIGH_CMD"
>;

/**
 * @brief Stores the currently configured native HTTPS request function used for Pushover delivery.
 * @details Defaults to `node:https.request` and can be replaced by deterministic tests so Pushover dispatch remains observable without real network I/O. Access complexity is O(1). Side effect: mutated only through the dedicated test hook.
 */
let piNotifyHttpsRequest: typeof https.request = https.request;

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
 * @brief Normalizes one persisted sound command string.
 * @details Accepts any non-empty string so project config can override bundled commands verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in command length. No external state is mutated.
 * @param[in] value {unknown} Raw persisted command payload.
 * @param[in] fallback {string} Canonical fallback command.
 * @return {string} Canonical non-empty command string.
 * @satisfies REQ-133
 */
export function normalizePiNotifyCommand(value: unknown, fallback: string): string {
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
 * @satisfies REQ-163
 */
export function normalizePiNotifyPushoverPriority(value: unknown): PiNotifyPushoverPriority {
  return value === 1 || value === "1" ? 1 : 0;
}

/**
 * @brief Formats enabled terminal-beep flags for status rendering.
 * @details Emits the canonical comma-ordered enabled outcome tokens `end`, `esc`, and `err`, or `none` when all prompt-end beep flags are disabled. Runtime is O(1). No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @return {string} Status-bar beep payload.
 * @satisfies REQ-135
 */
export function formatPiNotifyBeepStatus(config: PiNotifyConfigFields): string {
  const enabledOutcomes: PiNotifyOutcome[] = [];
  if (config["notify-beep-on-end"]) {
    enabledOutcomes.push("end");
  }
  if (config["notify-beep-on-esc"]) {
    enabledOutcomes.push("esc");
  }
  if (config["notify-beep-on-error"]) {
    enabledOutcomes.push("err");
  }
  return enabledOutcomes.length > 0 ? enabledOutcomes.join(",") : "none";
}

/**
 * @brief Formats the Pushover enable flag for status rendering.
 * @details Serializes only the persisted successful-prompt enable setting so the status bar reports the dedicated Pushover toggle independently from any global-disable override. Runtime is O(1). No external state is mutated.
 * @param[in] config {Pick<UseReqConfig, "notify-pushover-on-success">} Effective Pushover configuration subset.
 * @return {string} `on` when successful-prompt Pushover delivery is enabled; otherwise `off`.
 * @satisfies REQ-171
 */
export function formatPiNotifyPushoverStatus(config: Pick<UseReqConfig, "notify-pushover-on-success">): string {
  return config["notify-pushover-on-success"] ? "on" : "off";
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
 * @brief Escapes one string for single-quoted PowerShell embedding.
 * @details Doubles embedded apostrophes so the generated Windows toast script preserves literal title and body text. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] value {string} Raw literal text.
 * @return {string} PowerShell-safe single-quoted literal content.
 */
function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * @brief Builds the PowerShell script used for Windows toast notifications.
 * @details Reuses the pi notify example contract, escapes title and body literals, and emits a one-shot script that shows a toast notification through the Windows Runtime API. Runtime is O(n) in payload length. No external state is mutated.
 * @param[in] title {string} Notification title.
 * @param[in] body {string} Notification body.
 * @return {string} PowerShell script passed to `powershell.exe`.
 */
function windowsToastScript(title: string, body: string): string {
  const type = "Windows.UI.Notifications";
  const manager = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
  const template = `[${type}.ToastTemplateType]::ToastText02`;
  const escapedTitle = escapePowerShellLiteral(title);
  const escapedBody = escapePowerShellLiteral(body);
  return [
    `${manager} > $null`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
    `$texts = $xml.GetElementsByTagName('text')`,
    `$texts[0].AppendChild($xml.CreateTextNode('${escapedTitle}')) > $null`,
    `$texts[1].AppendChild($xml.CreateTextNode('${escapedBody}')) > $null`,
    `$toast = [${type}.ToastNotification]::new($xml)`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier('pi-usereq').Show($toast)`,
  ].join("; ");
}

/**
 * @brief Emits one OSC 777 terminal notification.
 * @details Writes the Ghostty/iTerm2/WezTerm-compatible OSC 777 escape sequence directly to stdout using the supplied title and body payloads. Runtime is O(n) in payload length. Side effect: writes to stdout.
 * @param[in] title {string} Notification title.
 * @param[in] body {string} Notification body.
 * @return {void} No return value.
 * @satisfies REQ-130
 */
export function notifyOSC777(title: string, body: string): void {
  process.stdout.write(`\u001b]777;notify;${title};${body}\u0007`);
}

/**
 * @brief Emits one Kitty OSC 99 terminal notification.
 * @details Writes the two-part Kitty OSC 99 sequence that carries the title and body payloads under one notification identifier. Runtime is O(n) in payload length. Side effect: writes to stdout.
 * @param[in] title {string} Notification title.
 * @param[in] body {string} Notification body.
 * @return {void} No return value.
 * @satisfies REQ-130
 */
export function notifyOSC99(title: string, body: string): void {
  process.stdout.write(`\u001b]99;i=1:d=0;${title}\u001b\\`);
  process.stdout.write(`\u001b]99;i=1:p=body;${body}\u001b\\`);
}

/**
 * @brief Emits one OSC 9 terminal notification.
 * @details Writes the single-part OSC 9 sequence commonly used by terminals that accept message-only desktop notifications. Runtime is O(n) in payload length. Side effect: writes to stdout.
 * @param[in] title {string} Notification title.
 * @param[in] body {string} Notification body.
 * @return {void} No return value.
 * @satisfies REQ-130
 */
export function notifyOSC9(title: string, body: string): void {
  process.stdout.write(`\u001b]9;${title}: ${body}\u0007`);
}

/**
 * @brief Emits one Windows toast notification.
 * @details Spawns `powershell.exe` without waiting, delegates payload rendering to `windowsToastScript(...)`, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include child-process execution.
 * @param[in] title {string} Notification title.
 * @param[in] body {string} Notification body.
 * @return {void} No return value.
 * @satisfies REQ-130
 */
export function notifyWindows(title: string, body: string): void {
  void execFile(
    "powershell.exe",
    ["-NoProfile", "-Command", windowsToastScript(title, body)],
    () => undefined,
  );
}

/**
 * @brief Routes one prompt-end terminal notification through the detected terminal protocol.
 * @details Prefers Windows toast delivery inside Windows Terminal, Kitty OSC 99 inside Kitty, OSC 9 inside iTerm-like terminals, and OSC 777 as the fallback path. Runtime is O(n) in payload length plus optional process spawn cost. Side effects include stdout writes or child-process execution.
 * @param[in] title {string} Notification title.
 * @param[in] body {string} Notification body.
 * @return {void} No return value.
 * @satisfies REQ-130
 */
export function notifyPiTerminal(title: string, body: string): void {
  if (process.env.WT_SESSION) {
    notifyWindows(title, body);
    return;
  }
  if (process.env.KITTY_WINDOW_ID) {
    notifyOSC99(title, body);
    return;
  }
  if (process.env.TERM_PROGRAM === "iTerm.app" || process.env.TERM_PROGRAM === "Apple_Terminal") {
    notifyOSC9(title, body);
    return;
  }
  notifyOSC777(title, body);
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
 * @satisfies REQ-129
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
 * @brief Builds the user-visible prompt-end notification title.
 * @details Keeps a stable `pi-usereq` title across outcomes so terminal notification stacks remain easy to correlate with this extension. Runtime is O(1). No external state is mutated.
 * @return {string} Notification title.
 */
function buildPiNotifyTitle(): string {
  return "pi-usereq";
}

/**
 * @brief Builds the user-visible prompt-end notification body.
 * @details Maps each canonical outcome to one deterministic English phrase so downstream tests and users can distinguish success, abort, and error notifications. Runtime is O(1). No external state is mutated.
 * @param[in] outcome {PiNotifyOutcome} Canonical prompt-end outcome.
 * @return {string} Notification body.
 */
function buildPiNotifyBody(outcome: PiNotifyOutcome): string {
  switch (outcome) {
    case "err":
      return "Prompt ended with error";
    case "esc":
      return "Prompt aborted by escape";
    default:
      return "Prompt completed";
  }
}

/**
 * @brief Formats one successful prompt duration for Pushover titles.
 * @details Floors the supplied completion duration to whole seconds, keeps minutes unbounded above 59, and zero-pads seconds to two digits so Pushover titles align with status-bar elapsed formatting. Runtime is O(1). No external state is mutated.
 * @param[in] durationMs {number} Successful prompt duration in milliseconds.
 * @return {string} Duration rendered as `M:SS`.
 * @satisfies REQ-169
 */
function formatPiNotifyPushoverDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * @brief Builds the Pushover notification title for one successful prompt.
 * @details Serializes the prompt name, absolute runtime base path, and successful completion duration into the canonical `<prompt> @ <base-path> [<time>]` title required by the repository feature contract. Runtime is O(n) in path length. No external state is mutated.
 * @param[in] request {PiNotifyPushoverRequest} Successful prompt metadata.
 * @return {string} Pushover title string.
 * @satisfies REQ-169
 */
function buildPiNotifyPushoverTitle(request: PiNotifyPushoverRequest): string {
  return `${request.promptName} @ ${request.basePath} [${formatPiNotifyPushoverDuration(request.completionTimeMs)}]`;
}

/**
 * @brief Builds the Pushover message body for one successful prompt.
 * @details Reuses the raw prompt argument string substituted into `%%ARGS%%` so the pushed body remains traceable to the executed prompt invocation. Runtime is O(1). No external state is mutated.
 * @param[in] request {PiNotifyPushoverRequest} Successful prompt metadata.
 * @return {string} Pushover message body.
 * @satisfies REQ-169
 */
function buildPiNotifyPushoverBody(request: PiNotifyPushoverRequest): string {
  return request.promptArgs;
}

/**
 * @brief Determines whether one successful prompt should trigger Pushover delivery.
 * @details Requires a captured prompt request, the successful-prompt enable flag, the Pushover global-disable flag to remain false, and non-empty user plus token credentials. Runtime is O(1). No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyPushoverRequest | undefined} Successful prompt metadata.
 * @return {boolean} `true` when Pushover delivery prerequisites are satisfied.
 * @satisfies REQ-166, REQ-168, REQ-172
 */
function shouldRunPiNotifyPushover(
  config: PiNotifyConfigFields,
  request: PiNotifyPushoverRequest | undefined,
): boolean {
  return request !== undefined
    && config["notify-pushover-on-success"]
    && !config["notify-pushover-global-disable"]
    && config["notify-pushover-user-key"] !== ""
    && config["notify-pushover-api-token"] !== "";
}

/**
 * @brief Builds the Pushover API payload for one successful prompt.
 * @details Encodes the configured token, user key, canonical title, priority, and substituted prompt-argument body as `application/x-www-form-urlencoded` fields accepted by the Pushover Message API. Runtime is O(n) in payload size. No external state is mutated.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyPushoverRequest} Successful prompt metadata.
 * @return {URLSearchParams} Encoded Pushover request payload.
 * @satisfies REQ-167, REQ-169
 */
function buildPiNotifyPushoverPayload(
  config: PiNotifyConfigFields,
  request: PiNotifyPushoverRequest,
): URLSearchParams {
  return new URLSearchParams({
    token: config["notify-pushover-api-token"],
    user: config["notify-pushover-user-key"],
    title: buildPiNotifyPushoverTitle(request),
    priority: String(config["notify-pushover-priority"]),
    message: buildPiNotifyPushoverBody(request),
  });
}

/**
 * @brief Dispatches one native HTTPS request to the Pushover Message API.
 * @details Serializes the request body as URL-encoded form data, posts it to `https://api.pushover.net/1/messages.json`, drains the response, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by outbound I/O. Side effects include one HTTPS request.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] request {PiNotifyPushoverRequest} Successful prompt metadata.
 * @return {void} No return value.
 * @satisfies REQ-167, REQ-169
 */
function runPiNotifyPushoverRequest(
  config: PiNotifyConfigFields,
  request: PiNotifyPushoverRequest,
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
 * @brief Substitutes `%%INSTALLATION_PATH%%` inside one sound command.
 * @details Replaces every `%%INSTALLATION_PATH%%` token with a shell-quoted runtime installation path so bundled sound assets can be addressed safely from external commands. Runtime is O(n) in command length. No external state is mutated.
 * @param[in] command {string} Raw configured sound command.
 * @param[in] installationPath {string} Absolute extension installation path.
 * @return {string} Runtime-ready command string.
 * @satisfies REQ-133
 */
export function substitutePiNotifyInstallPath(command: string, installationPath: string): string {
  return command.replaceAll("%%INSTALLATION_PATH%%", quotePiNotifyInstallPath(installationPath));
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
 * @brief Executes the configured successful-run sound command on an external shell.
 * @details Resolves the runtime installation path, substitutes `%%INSTALLATION_PATH%%`, spawns the configured shell command without waiting, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include detached child-process execution.
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
  const shell = process.platform === "win32" ? "cmd.exe" : (process.env.SHELL ?? "sh");
  const shellArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", command]
    : ["-lc", command];
  const child = spawn(shell, shellArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", () => undefined);
  child.unref();
}

/**
 * @brief Dispatches prompt-end beep, sound, and optional Pushover effects for one agent-end payload.
 * @details Classifies the terminal outcome, emits the configured terminal notification only for the enabled outcome flag, executes the configured external sound command only for successful completion with a non-disabled sound level, and dispatches the native Pushover request when successful-run Pushover prerequisites are satisfied. Runtime is O(m + c + b) in message count, command length, and Pushover payload size. Side effects include stdout writes, child-process spawning, and outbound HTTPS requests.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
 * @param[in] pushoverRequest {PiNotifyPushoverRequest | undefined} Optional successful prompt metadata used for Pushover delivery.
 * @return {void} No return value.
 * @satisfies REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172
 */
export function runPiNotifyEffects(
  config: PiNotifyConfigFields,
  event: Pick<AgentEndEvent, "messages">,
  pushoverRequest?: PiNotifyPushoverRequest,
): void {
  const outcome = classifyPiNotifyOutcome(event);
  const shouldNotify = (
    (outcome === "end" && config["notify-beep-on-end"])
    || (outcome === "esc" && config["notify-beep-on-esc"])
    || (outcome === "err" && config["notify-beep-on-error"])
  );
  if (shouldNotify) {
    notifyPiTerminal(buildPiNotifyTitle(), buildPiNotifyBody(outcome));
  }
  if (outcome !== "end") {
    return;
  }
  if (config["notify-sound"] !== "none") {
    runPiNotifySoundCommand(
      config,
      config["notify-sound"] as Exclude<PiNotifySoundLevel, "none">,
    );
  }
  if (!shouldRunPiNotifyPushover(config, pushoverRequest)) {
    return;
  }
  runPiNotifyPushoverRequest(config, pushoverRequest as PiNotifyPushoverRequest);
}
