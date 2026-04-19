/**
 * @file
 * @brief Tracks pi-usereq extension status state and renders status-bar telemetry.
 * @details Centralizes hook interception, context-usage snapshots, run timing,
 * and deterministic status-bar formatting for the pi-usereq extension. Runtime
 * is O(1) per event plus O(s) in configured source-path count during status
 * rendering. Side effects are limited to in-memory state mutation and interval
 * scheduling through exported controller helpers.
 */

import type {
  AgentEndEvent,
  ContextUsage,
  ExtensionContext,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import type { UseReqConfig } from "./config.js";
import { formatPiNotifyBeepStatus } from "./pi-notify.js";
import { formatAbsoluteGitPath, formatBasePathRelativeToGitPath, resolveRuntimeGitPath } from "./runtime-project-paths.js";

/**
 * @brief Enumerates the CLI-supported theme tokens consumed by status rendering.
 * @details Restricts the status formatter to documented pi theme tokens so the
 * status bar remains compatible with the active CLI theme schema. Compile-time
 * only and introduces no runtime cost.
 */
type StatusForegroundColor = Extract<
  ThemeColor,
  "accent" | "warning" | "dim" | "error"
>;

/**
 * @brief Describes the raw theme capabilities required for status rendering.
 * @details Accepts the `ctx.ui.theme` foreground renderer plus optional helpers
 * that can convert a foreground color into a background-styled fragment for the
 * context-usage bar. Compile-time only and introduces no runtime cost.
 */
interface RawStatusTheme {
  fg: (color: StatusForegroundColor, text: string) => string;
  bgFromFg?: (color: StatusForegroundColor, text: string) => string;
  getFgAnsi?: (color: StatusForegroundColor) => string;
}

/**
 * @brief Describes the normalized theme adapter used by status formatters.
 * @details Exposes deterministic label, value, foreground, background, and
 * context-cell renderers so status text generation stays independent from the
 * raw theme API. Compile-time only and introduces no runtime cost.
 */
interface StatusThemeAdapter {
  label: (fieldName: string) => string;
  value: (text: string) => string;
  colorize: (color: StatusForegroundColor, text: string) => string;
  backgroundize: (color: StatusForegroundColor, text: string) => string;
  separator: string;
  filledContextCell: string;
  emptyContextCell: string;
}

/**
 * @brief Describes one fixed-width context-bar overlay.
 * @details Stores the literal text plus foreground and background color roles
 * used when the context bar must render threshold-specific labels instead of
 * block glyphs. Compile-time only and introduces no runtime cost.
 */
interface ContextUsageOverlaySpec {
  backgroundColor: StatusForegroundColor;
  foregroundColor: StatusForegroundColor;
  text: "CLEAR" | "FULL!";
}

/**
 * @brief Lists every pi lifecycle hook intercepted by pi-usereq status logic.
 * @details Preserves the canonical user-requested registration order so the
 * extension can install wrappers for all supported resource, session, agent,
 * model, tool, bash, and input hooks. Access complexity is O(1).
 */
export const PI_USEREQ_STATUS_HOOK_NAMES = [
  "resources_discover",
  "session_start",
  "session_before_switch",
  "session_before_fork",
  "session_before_compact",
  "session_compact",
  "session_shutdown",
  "session_before_tree",
  "session_tree",
  "context",
  "before_provider_request",
  "before_agent_start",
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "model_select",
  "tool_call",
  "tool_result",
  "user_bash",
  "input",
] as const;

/**
 * @brief Represents one hook name handled by the pi-usereq status controller.
 * @details Narrows hook registration and event-update calls to the canonical
 * intercepted-hook set. Compile-time only and introduces no runtime cost.
 */
export type PiUsereqStatusHookName = (typeof PI_USEREQ_STATUS_HOOK_NAMES)[number];

/**
 * @brief Stores the mutable runtime facts displayed by the status bar.
 * @details Persists the latest context-usage snapshot, the active run start
 * timestamp, and the most recent normally completed run duration. Runtime state
 * is mutated in-place by controller helpers. Compile-time only and introduces
 * no runtime cost.
 */
export interface PiUsereqStatusState {
  contextUsage: ContextUsage | undefined;
  runStartTimeMs: number | undefined;
  lastRunDurationMs: number | undefined;
}

/**
 * @brief Stores the controller state required for event-driven status updates.
 * @details Keeps the mutable status snapshot, the current configuration, the
 * latest extension context used for rendering, the active-tools provider, and
 * the interval handle used for live elapsed-time refreshes. Compile-time only
 * and introduces no runtime cost.
 */
export interface PiUsereqStatusController {
  readonly getActiveTools: () => readonly string[];
  config: UseReqConfig | undefined;
  latestContext: ExtensionContext | undefined;
  state: PiUsereqStatusState;
  tickHandle: ReturnType<typeof setInterval> | undefined;
}

/**
 * @brief Converts a foreground ANSI sequence into the equivalent background ANSI.
 * @details Supports the standard `38;` foreground prefix emitted by pi themes.
 * Returns `undefined` when the input cannot be transformed deterministically.
 * Runtime is O(n) in ANSI sequence length. No external state is mutated.
 * @param[in] foregroundAnsi {string} Foreground ANSI sequence.
 * @return {string | undefined} Background ANSI sequence when derivable.
 */
function convertForegroundAnsiToBackgroundAnsi(
  foregroundAnsi: string,
): string | undefined {
  if (!foregroundAnsi.includes("\u001b[")) {
    return undefined;
  }
  const backgroundAnsi = foregroundAnsi.replace("[38;", "[48;");
  return backgroundAnsi === foregroundAnsi ? undefined : backgroundAnsi;
}

/**
 * @brief Applies a foreground-derived background style to one text fragment.
 * @details Prefers a theme-provided `bgFromFg` encoder for deterministic test
 * rendering and falls back to ANSI conversion when the runtime theme exposes
 * `getFgAnsi`. Runtime is O(n) in fragment length. No external state is
 * mutated.
 * @param[in] theme {RawStatusTheme} Raw theme adapter.
 * @param[in] color {StatusForegroundColor} Foreground color reused as background.
 * @param[in] text {string} Already-colored foreground fragment.
 * @return {string} Background-decorated text fragment.
 */
function applyForegroundAsBackground(
  theme: RawStatusTheme,
  color: StatusForegroundColor,
  text: string,
): string {
  if (typeof theme.bgFromFg === "function") {
    return theme.bgFromFg(color, text);
  }
  if (typeof theme.getFgAnsi === "function") {
    const backgroundAnsi = convertForegroundAnsiToBackgroundAnsi(
      theme.getFgAnsi(color),
    );
    if (backgroundAnsi) {
      return `${backgroundAnsi}${text}\u001b[39m\u001b[49m`;
    }
  }
  return text;
}

/**
 * @brief Builds the normalized theme adapter used by pi-usereq status formatters.
 * @details Precomputes label, value, foreground, background, separator, and
 * context-cell renderers so status formatting remains stable across real TUI
 * themes and deterministic test doubles. Runtime is O(1). No external state
 * is mutated.
 * @param[in] theme {RawStatusTheme} Raw theme implementation from `ctx.ui.theme`.
 * @return {StatusThemeAdapter} Normalized status-theme adapter.
 */
function createStatusThemeAdapter(theme: RawStatusTheme): StatusThemeAdapter {
  const colorize = (color: StatusForegroundColor, text: string): string =>
    theme.fg(color, text);
  const backgroundize = (color: StatusForegroundColor, text: string): string =>
    applyForegroundAsBackground(theme, color, text);
  return {
    label: (fieldName: string): string => colorize("accent", `${fieldName}:`),
    value: (text: string): string => colorize("warning", text),
    colorize,
    backgroundize,
    separator: colorize("dim", " • "),
    filledContextCell: backgroundize(
      "accent",
      colorize("warning", "▓"),
    ),
    emptyContextCell: backgroundize(
      "accent",
      colorize("dim", "▓"),
    ),
  };
}

/**
 * @brief Normalizes one raw context-usage snapshot.
 * @details Preserves the runtime token and context-window counts, derives a
 * percentage when the runtime omits it, and clamps percentages into `[0, 100]`.
 * Runtime is O(1). No external state is mutated.
 * @param[in] contextUsage {ContextUsage | undefined} Raw runtime snapshot.
 * @return {ContextUsage | undefined} Normalized snapshot.
 */
function normalizeContextUsage(
  contextUsage: ContextUsage | undefined,
): ContextUsage | undefined {
  if (!contextUsage) {
    return undefined;
  }
  const derivedPercent = contextUsage.percent ?? (
    contextUsage.tokens === null || contextUsage.contextWindow <= 0
      ? null
      : (contextUsage.tokens / contextUsage.contextWindow) * 100
  );
  return {
    ...contextUsage,
    percent: derivedPercent === null
      ? null
      : Math.max(0, Math.min(100, derivedPercent)),
  };
}

/**
 * @brief Refreshes the stored context-usage snapshot from the active extension context.
 * @details Calls `ctx.getContextUsage()` on every intercepted event so the
 * controller retains the newest context-usage facts available from the pi
 * runtime. Runtime is O(1). Side effect: mutates `state.contextUsage`.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-118, REQ-119
 */
function refreshContextUsage(
  state: PiUsereqStatusState,
  ctx: ExtensionContext,
): void {
  state.contextUsage = normalizeContextUsage(ctx.getContextUsage());
}

/**
 * @brief Counts the filled cells rendered by the 5-cell context bar.
 * @details Uses ceiling semantics for positive percentages so any non-zero
 * usage occupies at least one cell and zero usage occupies none. Runtime is
 * O(1). No external state is mutated.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
 * @return {number} Filled-cell count in the inclusive range `[0, 5]`.
 * @satisfies REQ-122
 */
function countFilledContextCells(
  contextUsage: ContextUsage | undefined,
): number {
  const percent = contextUsage?.percent;
  if (percent === null || percent === undefined || percent <= 0) {
    return 0;
  }
  return Math.min(5, Math.ceil((percent * 5) / 100));
}

/**
 * @brief Resolves the threshold-specific context-bar overlay when required.
 * @details Returns the empty-state `CLEAR` overlay when normalized context
 * usage is unavailable or non-positive and returns the high-water `FULL!`
 * overlay with the active theme `error` token when usage exceeds 90 percent.
 * Runtime is O(1). No external state is mutated.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
 * @return {ContextUsageOverlaySpec | undefined} Overlay spec when a replacement label is required.
 * @satisfies REQ-127, REQ-128
 */
function resolveContextUsageOverlay(
  contextUsage: ContextUsage | undefined,
): ContextUsageOverlaySpec | undefined {
  const percent = contextUsage?.percent;
  if (percent === undefined || percent === null || percent <= 0) {
    return {
      backgroundColor: "accent",
      foregroundColor: "warning",
      text: "CLEAR",
    };
  }
  if (percent > 90) {
    return {
      backgroundColor: "warning",
      foregroundColor: "error",
      text: "FULL!",
    };
  }
  return undefined;
}

/**
 * @brief Formats one threshold-specific context-bar overlay.
 * @details Renders the fixed-width overlay text with the requested foreground
 * color and reuses the selected bar color as the background so the bar width
 * and state-specific backdrop remain preserved. Runtime is O(n) in overlay
 * width. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] overlay {ContextUsageOverlaySpec} Overlay specification.
 * @return {string} Rendered overlay text.
 * @satisfies REQ-127, REQ-128
 */
function formatContextUsageOverlay(
  theme: StatusThemeAdapter,
  overlay: ContextUsageOverlaySpec,
): string {
  return theme.backgroundize(
    overlay.backgroundColor,
    theme.colorize(overlay.foregroundColor, overlay.text),
  );
}

/**
 * @brief Formats one 5-cell context-usage bar.
 * @details Renders threshold-specific overlays for empty and high-water states;
 * otherwise renders filled cells with the theme `warning` token on an
 * accent-derived background and unfilled cells in `dim` on the same background
 * to preserve constant bar width. Runtime is O(1). No external state is
 * mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
 * @return {string} Rendered 5-cell bar or overlay.
 * @satisfies REQ-121, REQ-122, REQ-126, REQ-127, REQ-128
 */
function formatContextUsageBar(
  theme: StatusThemeAdapter,
  contextUsage: ContextUsage | undefined,
): string {
  const overlay = resolveContextUsageOverlay(contextUsage);
  if (overlay) {
    return formatContextUsageOverlay(theme, overlay);
  }
  const filledCells = countFilledContextCells(contextUsage);
  return Array.from({ length: 5 }, (_value, index) =>
    index < filledCells ? theme.filledContextCell : theme.emptyContextCell,
  ).join("");
}

/**
 * @brief Formats one elapsed-duration value as `M:SS`.
 * @details Floors the input to whole seconds, keeps minutes unbounded above 59,
 * and zero-pads seconds to two digits. Runtime is O(1). No external state is
 * mutated.
 * @param[in] durationMs {number} Duration in milliseconds.
 * @return {string} Duration rendered as `M:SS`.
 * @satisfies REQ-125
 */
function formatStatusDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * @brief Formats one standard status-bar field.
 * @details Renders the field label in accent color and the value in warning
 * color. Runtime is O(n) in combined text length. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] fieldName {string} Field label emitted before the colon.
 * @param[in] value {string} Unstyled field value.
 * @return {string} Rendered status-field fragment.
 */
function formatStatusField(
  theme: StatusThemeAdapter,
  fieldName: string,
  value: string,
): string {
  return `${theme.label(fieldName)}${theme.value(value)}`;
}

/**
 * @brief Formats one pre-rendered status-bar field value.
 * @details Preserves the accent-colored field label while allowing callers to
 * provide a custom styled value such as the context-usage bar. Runtime is O(n)
 * in combined text length. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] fieldName {string} Field label emitted before the colon.
 * @param[in] renderedValue {string} Pre-rendered field value.
 * @return {string} Rendered status-field fragment.
 */
function formatRenderedStatusField(
  theme: StatusThemeAdapter,
  fieldName: string,
  renderedValue: string,
): string {
  return `${theme.label(fieldName)}${renderedValue}`;
}

/**
 * @brief Detects whether an agent run ended through abort semantics.
 * @details Treats any assistant message whose `stopReason` equals `aborted` as
 * an escape-triggered termination that must not overwrite the `last` timer.
 * Runtime is O(n) in message count. No external state is mutated.
 * @param[in] messages {AgentEndEvent["messages"]} Messages emitted by `agent_end`.
 * @return {boolean} `true` when the run ended in aborted state.
 * @satisfies REQ-125
 */
function didAgentEndAbort(messages: AgentEndEvent["messages"]): boolean {
  return messages.some((message) =>
    typeof message === "object"
      && message !== null
      && (message as { role?: unknown }).role === "assistant"
      && (message as { stopReason?: unknown }).stopReason === "aborted",
  );
}

/**
 * @brief Builds the full single-line pi-usereq status-bar payload.
 * @details Renders git, base, docs, tests, src, tools, context, elapsed, last, beep, and sound fields in the canonical order with dim bullet separators and threshold-specific context-bar overlays. Runtime is O(s) in configured source-path count plus runtime git probing. No external state is mutated.
 * @param[in] cwd {string} Runtime working directory used for git/base path derivation.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] activeTools {readonly string[]} Active runtime tool names.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @param[in] nowMs {number} Current wall-clock time in milliseconds.
 * @return {string} Single-line status-bar text.
 * @satisfies REQ-109, REQ-112, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-135, REQ-136, REQ-147, REQ-148, REQ-156
 */
function buildPiUsereqStatusText(
  cwd: string,
  config: UseReqConfig,
  activeTools: readonly string[],
  theme: StatusThemeAdapter,
  state: PiUsereqStatusState,
  nowMs: number,
): string {
  const gitPath = resolveRuntimeGitPath(cwd);
  const gitText = formatAbsoluteGitPath(gitPath);
  const baseText = formatBasePathRelativeToGitPath(cwd, gitPath);
  const sourcePaths = config["src-dir"].join(",");
  const elapsedText = state.runStartTimeMs === undefined
    ? "idle"
    : formatStatusDuration(nowMs - state.runStartTimeMs);
  const lastText = state.lastRunDurationMs === undefined
    ? "N/A"
    : formatStatusDuration(state.lastRunDurationMs);
  const beepText = formatPiNotifyBeepStatus(config);
  const soundText = config["notify-sound"];
  return [
    formatStatusField(theme, "git", gitText),
    formatStatusField(theme, "base", baseText),
    formatStatusField(theme, "docs", config["docs-dir"]),
    formatStatusField(theme, "tests", config["tests-dir"]),
    formatStatusField(theme, "src", sourcePaths),
    formatStatusField(theme, "tools", String(activeTools.length)),
    formatRenderedStatusField(
      theme,
      "context",
      formatContextUsageBar(theme, state.contextUsage),
    ),
    formatStatusField(theme, "elapsed", elapsedText),
    formatStatusField(theme, "last", lastText),
    formatStatusField(theme, "beep", beepText),
    formatStatusField(theme, "sound", soundText),
  ].join(theme.separator);
}

/**
 * @brief Stops the live elapsed-time ticker when it is active.
 * @details Clears the interval handle and resets the stored timer reference so
 * subsequent runs can reinitialize live status refreshes deterministically.
 * Runtime is O(1). Side effect: mutates `controller.tickHandle`.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 */
function stopStatusTicker(controller: PiUsereqStatusController): void {
  if (controller.tickHandle !== undefined) {
    clearInterval(controller.tickHandle);
    controller.tickHandle = undefined;
  }
}

/**
 * @brief Synchronizes the live elapsed-time ticker with the current run state.
 * @details Starts a 1-second render ticker while a run is active and stops the
 * ticker when the run returns to idle. Runtime is O(1). Side effects include
 * interval creation, interval disposal, and footer-status mutation on timer
 * ticks.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-123
 */
function syncPiUsereqStatusTicker(
  controller: PiUsereqStatusController,
): void {
  if (controller.state.runStartTimeMs === undefined) {
    stopStatusTicker(controller);
    return;
  }
  if (controller.tickHandle !== undefined) {
    return;
  }
  controller.tickHandle = setInterval(() => {
    if (!controller.latestContext || !controller.config) {
      return;
    }
    renderPiUsereqStatus(controller, controller.latestContext);
  }, 1000);
}

/**
 * @brief Creates an empty pi-usereq status controller.
 * @details Initializes the mutable status snapshot, stores the active-tools
 * provider used by render-time tool counting, and starts with no config, no
 * context, and no live ticker. Runtime is O(1). No external state is mutated.
 * @param[in] getActiveTools {() => readonly string[]} Provider for active tools.
 * @return {PiUsereqStatusController} New status controller.
 * @satisfies DES-010
 */
export function createPiUsereqStatusController(
  getActiveTools: () => readonly string[],
): PiUsereqStatusController {
  return {
    getActiveTools,
    config: undefined,
    latestContext: undefined,
    state: {
      contextUsage: undefined,
      runStartTimeMs: undefined,
      lastRunDurationMs: undefined,
    },
    tickHandle: undefined,
  };
}

/**
 * @brief Stores the effective project configuration used by status rendering.
 * @details Replaces the controller's cached configuration so later status
 * renders reuse the latest docs, tests, source-path, and pi-notify values
 * without reading from disk on every event. Runtime is O(1). Side effect:
 * mutates `controller.config`.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {void} No return value.
 */
export function setPiUsereqStatusConfig(
  controller: PiUsereqStatusController,
  config: UseReqConfig,
): void {
  controller.config = config;
}

/**
 * @brief Renders the current pi-usereq status bar into the active UI context.
 * @details Updates the controller's latest context pointer and writes the
 * single-line status text only when configuration is available, including any
 * threshold-specific context-bar overlays. Runtime is O(s) in configured
 * source-path count. Side effect: mutates `ctx.ui` status.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-135, REQ-136
 */
export function renderPiUsereqStatus(
  controller: PiUsereqStatusController,
  ctx: ExtensionContext,
): void {
  controller.latestContext = ctx;
  if (!controller.config) {
    return;
  }
  const theme = createStatusThemeAdapter(ctx.ui.theme as RawStatusTheme);
  ctx.ui.setStatus(
    "pi-usereq",
    buildPiUsereqStatusText(
      ctx.cwd,
      controller.config,
      controller.getActiveTools(),
      theme,
      controller.state,
      Date.now(),
    ),
  );
}

/**
 * @brief Updates mutable status state for one intercepted lifecycle hook.
 * @details Refreshes stored context usage on every hook, starts run timing on
 * `agent_start`, captures non-aborted run duration on `agent_end`, clears live
 * timing on shutdown, synchronizes the live ticker, and re-renders the status
 * bar when configuration is available. Runtime is O(n) in `agent_end` message
 * count and otherwise O(1). Side effects include in-memory state mutation,
 * interval scheduling, and footer-status updates.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
 * @param[in] event {unknown} Hook payload forwarded from the wrapper.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-117, REQ-118, REQ-119, REQ-123, REQ-124, REQ-125
 */
export function updateExtensionStatus(
  controller: PiUsereqStatusController,
  hookName: PiUsereqStatusHookName,
  event: unknown,
  ctx: ExtensionContext,
): void {
  controller.latestContext = ctx;
  refreshContextUsage(controller.state, ctx);
  const nowMs = Date.now();

  if (hookName === "agent_start") {
    controller.state.runStartTimeMs = nowMs;
  }

  if (hookName === "agent_end" && controller.state.runStartTimeMs !== undefined) {
    const durationMs = nowMs - controller.state.runStartTimeMs;
    if (!didAgentEndAbort((event as AgentEndEvent).messages ?? [])) {
      controller.state.lastRunDurationMs = durationMs;
    }
    controller.state.runStartTimeMs = undefined;
  }

  if (hookName === "session_shutdown") {
    controller.state.runStartTimeMs = undefined;
  }

  syncPiUsereqStatusTicker(controller);
  renderPiUsereqStatus(controller, ctx);
}

/**
 * @brief Disposes the pi-usereq status controller.
 * @details Stops the live ticker, clears the cached context pointer, and leaves
 * the last captured status snapshot available for inspection until the
 * controller object itself is discarded. Runtime is O(1). Side effects are
 * limited to interval disposal and in-memory state mutation.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 */
export function disposePiUsereqStatusController(
  controller: PiUsereqStatusController,
): void {
  stopStatusTicker(controller);
  controller.latestContext = undefined;
}
