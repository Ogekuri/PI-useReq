/**
 * @file
 * @brief Persists deferred UI notifications across session rebinding for later replay.
 * @details Stores non-agentic command-output notifications whose stale-context-safe delivery failed on one `globalThis` queue because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists across those operations, so undeliverable payloads survive until a later `session_start` restores a live UI context. Runtime is O(1) per operation. Side effects are limited to process-scoped state mutation; no local or global configuration file is ever written.
 */

/**
 * @brief Enumerates the `session_start` reasons that trigger deferred-notification replay.
 * @details Covers the session-restoration boundaries where pi rebuilt the TUI and invalidated prior UI contexts: `new`, `resume`, `reload`, and `fork`. The `startup` reason starts one fresh host process whose process-scoped queue is empty by construction, so it is excluded from replay. Lookup complexity is O(1).
 */
const DEFERRED_NOTIFICATION_REPLAY_SESSION_START_REASONS = new Set([
  "new",
  "resume",
  "reload",
  "fork",
]);

/**
 * @brief Describes one deferred notification queued for later replay.
 * @details Pairs the exact notification message text with its original severity so the replayed delivery preserves the deferred payload without reparsing or reconstruction. The interface is compile-time only and introduces no runtime cost.
 */
export interface DeferredNotificationRecord {
  message: string;
  level: "info" | "error";
}

/**
 * @brief Defines the global property used for deferred-notification replay persistence.
 * @details The property lives on `globalThis` because pi tears down and reloads extension modules on session switches while the host process persists, so the queue survives `/new`, `/resume`, `/fork`, `/reload`, and `req-reset` session restoration. Access complexity is O(1).
 */
const PI_USEREQ_NOTIFICATION_REPLAY_KEY = "__piUsereqDeferredNotificationReplay";

/**
 * @brief Describes the process-scoped deferred-notification replay state persisted across extension rebinds.
 * @details Stores the ordered queue of undelivered notification payloads so a later `session_start` on one restored UI context can redeliver exactly the evidence that stale contexts dropped. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-439
 */
interface ProcessScopedNotificationReplayStore {
  queue: DeferredNotificationRecord[];
}

/**
 * @brief Returns the process-scoped deferred-notification replay store.
 * @details Lazily initializes one `globalThis` record holding an empty queue so session rebinds reuse the accumulated deferred payloads instead of resetting them. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedNotificationReplayStore} Mutable process-scoped replay store.
 * @satisfies REQ-439
 */
function getProcessScopedNotificationReplayStore(): ProcessScopedNotificationReplayStore {
  const globalState = globalThis as typeof globalThis & {
    __piUsereqDeferredNotificationReplay?: ProcessScopedNotificationReplayStore;
  };
  globalState[PI_USEREQ_NOTIFICATION_REPLAY_KEY] ??= { queue: [] };
  return globalState[PI_USEREQ_NOTIFICATION_REPLAY_KEY]!;
}

/**
 * @brief Queues one undeliverable notification for later replay.
 * @details Appends the exact message plus severity to the tail of the process-scoped replay queue so the payload survives extension rebinding and can be redelivered on the next eligible `session_start`. Already-delivered notifications are never enqueued by contract, so replay can never duplicate them. Runtime is O(1). Side effect: mutates process-scoped state.
 * @param[in] message {string} Exact notification message text whose stale-context delivery failed.
 * @param[in] level {"info" | "error"} Original notification severity preserved for the replayed delivery.
 * @return {void} No return value.
 * @satisfies REQ-439, REQ-442
 */
export function enqueueDeferredNotification(message: string, level: "info" | "error"): void {
  getProcessScopedNotificationReplayStore().queue.push({ message, level });
}

/**
 * @brief Returns a snapshot of the queued deferred notifications.
 * @details Copies the queued records into one detached array so callers can inspect pending replay payloads without mutating the store. Runtime is O(n) in queued-record count. No external state is mutated.
 * @return {DeferredNotificationRecord[]} Detached copy of the queued records in enqueue order.
 * @satisfies REQ-439
 */
export function readDeferredNotifications(): DeferredNotificationRecord[] {
  return [...getProcessScopedNotificationReplayStore().queue];
}

/**
 * @brief Atomically removes and returns every queued deferred notification.
 * @details Empties the process-scoped queue and returns the removed records in enqueue order so replay delivery owns each payload exactly once; payloads whose replay delivery fails stale again are re-enqueued by the deferred-delivery helper instead of remaining in this drain result. Runtime is O(n) in queued-record count. Side effect: clears process-scoped state.
 * @return {DeferredNotificationRecord[]} Removed records in enqueue order.
 * @satisfies REQ-440
 */
export function drainDeferredNotifications(): DeferredNotificationRecord[] {
  const store = getProcessScopedNotificationReplayStore();
  const drained = store.queue;
  store.queue = [];
  return drained;
}

/**
 * @brief Clears every queued deferred notification.
 * @details Resets the process-scoped queue to empty so stale deferred payloads never reach later sessions after explicit cleanup. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 * @satisfies REQ-439
 */
export function clearDeferredNotifications(): void {
  getProcessScopedNotificationReplayStore().queue = [];
}

/**
 * @brief Tests whether one `session_start` event must trigger deferred-notification replay.
 * @details Reads the loosely-typed `reason` field from the session-start payload and accepts exactly the documented restoration reasons `new`, `resume`, `reload`, and `fork`, excluding `startup` because one fresh host process starts with an empty process-scoped queue. Missing or unknown reasons degrade to `false`. Runtime is O(1). No external state is mutated.
 * @param[in] event {unknown} Session-start payload forwarded by the pi lifecycle wrapper.
 * @return {boolean} `true` when deferred notifications must be replayed for this session-start reason.
 * @satisfies REQ-440
 */
export function shouldReplayDeferredNotificationsOnSessionStart(event: unknown): boolean {
  const reason = (event as { reason?: unknown } | undefined)?.reason;
  return typeof reason === "string"
    && DEFERRED_NOTIFICATION_REPLAY_SESSION_START_REASONS.has(reason);
}
