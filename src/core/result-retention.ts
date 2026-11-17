/**
 * @file
 * @brief Persists the exact final context-retention notification message across session rebinding for identical reprinting by `/req-print-result`.
 * @details Stores the last composed final context-retention notification message on one `globalThis` store because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists, so the message emitted at the end of the last completed orchestration stays printable after the pi TUI clears delivered notifications — for example after a model selection redraw. The store is cleared together with the captured Next-Workflow array at the idle-reset bootstrap boundaries and immediately before prompt dispatch of a `new` agentic flow, so the retention lifetime exactly matches the Next-Workflow array lifetime. Runtime is O(n) in message length per capture and O(1) per store access. Side effects are limited to process-scoped state mutation; no local or global configuration file is ever written.
 * @satisfies REQ-771, REQ-772, REQ-773, REQ-774, REQ-775, REQ-776
 */

/**
 * @brief Stores the dedicated `/req-print-result` slash-command description.
 * @details Rendered verbatim by the extension command registration so `/req-print-result` never depends on a bundled prompt Markdown heading. Access complexity is O(1).
 * @satisfies REQ-776
 */
export const REQ_PRINT_RESULT_COMMAND_DESCRIPTION =
  "Print the final-output report notification of the last completed agentic workflow";

/**
 * @brief Describes the process-scoped retained final-output notification state persisted across extension rebinds.
 * @details Stores the exact composed notification message so a later `/req-print-result` invocation redelivers byte-identical content through the same UI-notification channel instead of recomposing the message from mutable captured report and context-usage state. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-771, REQ-772
 */
interface ProcessScopedResultRetentionStore {
  /** Exact final context-retention notification message of the last retention emission; `undefined` after a retention wipe. */
  retainedMessage: string | undefined;
}

type GlobalResultRetentionStore = typeof globalThis & {
  __piUsereqResultRetentionStore?: ProcessScopedResultRetentionStore;
};

/**
 * @brief Returns the process-scoped retained final-output notification store.
 * @details Lazily initializes one `globalThis` record holding no retained message so session rebinds reuse the retained message instead of resetting it. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedResultRetentionStore} Mutable process-scoped result-retention store.
 * @satisfies REQ-772
 * @note Complexity: O(1). Side effect limited to first-access initialization.
 */
function getResultRetentionStore(): ProcessScopedResultRetentionStore {
  const store = globalThis as GlobalResultRetentionStore;
  if (store.__piUsereqResultRetentionStore === undefined) {
    store.__piUsereqResultRetentionStore = { retainedMessage: undefined };
  }
  return store.__piUsereqResultRetentionStore;
}

/**
 * @brief Captures the exact final context-retention notification message at emission time.
 * @details Stores the composed message verbatim so every later reprint reproduces the notification exactly as delivered, independent of later context-usage snapshots or Next-Workflow mutations. Runtime is O(n) in message length. Side effect: mutates process-scoped state.
 * @param[in] message {string} Composed final context-retention notification message text.
 * @return {void} No return value.
 * @satisfies REQ-771
 * @note Complexity: O(n) in message length.
 */
export function captureRetainedResultMessage(message: string): void {
  getResultRetentionStore().retainedMessage = message;
}

/**
 * @brief Returns the retained final-output notification message.
 * @details Returns the exact captured message without copying cost beyond the string reference; `undefined` means no message is retained, either because no retention notification was emitted yet in this process lifetime or because a retention wipe cleared it. Runtime is O(1). No external state is mutated.
 * @return {string | undefined} Retained message text, or `undefined` when nothing is retained.
 * @satisfies REQ-772
 * @note Complexity: O(1). Pure; no side effects.
 */
export function getRetainedResultMessage(): string | undefined {
  return getResultRetentionStore().retainedMessage;
}

/**
 * @brief Clears the retained final-output notification message.
 * @details Resets the process-scoped store to no retained message. The wipe runs only at the idle-reset bootstrap boundaries (`startup|reload` `session_start`) and immediately before prompt dispatch of a `new` agentic flow after every slash-command pre-check has succeeded, mirroring the captured Next-Workflow array lifetime so failed pre-checks and `/req-reset` recovery preserve the retained message. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 * @satisfies REQ-773, REQ-774, REQ-775
 * @note Complexity: O(1).
 */
export function clearRetainedResultMessage(): void {
  getResultRetentionStore().retainedMessage = undefined;
}

/**
 * @brief Resets the process-scoped result-retention state for deterministic tests.
 * @details Clears the retained message so one test can simulate independent pi host processes without leaking a previous flow's notification into later assertions. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 * @note Complexity: O(1).
 */
export function resetResultRetentionStateForTests(): void {
  getResultRetentionStore().retainedMessage = undefined;
}
