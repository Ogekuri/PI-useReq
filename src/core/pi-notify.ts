/**
 * @file
 * @brief Implements pi-usereq terminal-beep and external sound-hook helpers.
 * @details Centralizes configuration defaults, status serialization, agent-end outcome classification, terminal notification dispatch, and successful-run external sound-command execution. Runtime is O(m + c) in `agent_end` message count plus command length. Side effects include stdout writes and detached child-process spawning.
 */

import { execFile, spawn } from "node:child_process";
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
 * @brief Describes the configuration fields consumed by pi-notify helpers.
 * @details Narrows the full project config to the persisted notification and sound-hook fields used by status rendering, prompt-end routing, and shortcut toggles. Compile-time only and introduces no runtime cost.
 */
export type PiNotifyConfigFields = Pick<
  UseReqConfig,
  | "notify-beep-on-end"
  | "notify-beep-on-esc"
  | "notify-beep-on-error"
  | "notify-sound"
  | "notify-sound-toggle-shortcut"
  | "PI_NOTIFY_SOUND_LOW_CMD"
  | "PI_NOTIFY_SOUND_MID_CMD"
  | "PI_NOTIFY_SOUND_HIGH_CMD"
>;

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
 * @brief Dispatches prompt-end beep and sound effects for one agent-end payload.
 * @details Classifies the terminal outcome, emits the configured terminal notification only for the enabled outcome flag, and executes the configured external sound command only for successful completion with a non-disabled sound level. Runtime is O(m + c) in message count plus command length. Side effects include stdout writes and child-process spawning.
 * @param[in] config {PiNotifyConfigFields} Effective notification configuration.
 * @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
 * @return {void} No return value.
 * @satisfies REQ-129, REQ-130, REQ-131, REQ-132, REQ-133
 */
export function runPiNotifyEffects(
  config: PiNotifyConfigFields,
  event: Pick<AgentEndEvent, "messages">,
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
  if (config["notify-sound"] === "none") {
    return;
  }
  runPiNotifySoundCommand(
    config,
    config["notify-sound"] as Exclude<PiNotifySoundLevel, "none">,
  );
}
