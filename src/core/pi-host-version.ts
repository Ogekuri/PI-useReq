/**
 * @file
 * @brief Probes the installed pi CLI host version for extension compatibility reporting.
 * @details Resolves the pi CLI host version at extension bootstrap through the `VERSION` export of `@earendil-works/pi-coding-agent`, stores the resolved fact in a process-scoped store so session rebinds reuse one probe per host process, compares the resolved version against the minimum supported pi CLI release, and yields a once-per-process warning payload consumed by `session_start` handling. The probe is best-effort: an unresolvable module or `VERSION` export records `resolved=false` and never warns, so the extension remains fully functional on pi CLI releases older than the supported minimum. Runtime is O(1) per operation plus one deferred module resolution. Side effects include one dynamic module import and process-scoped store mutation.
 */

/**
 * @brief Declares the minimum pi CLI host version supported by the extension.
 * @details Versions below this value keep the extension enabled while `session_start` surfaces one compatibility warning; versions at or above this value are fully supported without warning. Compare with `comparePiHostVersions(...)` using numeric triple semantics.
 */
export const MINIMUM_SUPPORTED_PI_HOST_VERSION = "1.4.0";

/**
 * @brief Describes the process-scoped pi CLI host version probe state.
 * @details Tracks probe scheduling, the in-flight probe promise, the resolved version fact, and whether the compatibility warning was already delivered so the warning fires at most once per host process. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiHostVersionProbeState {
  /** Whether `schedulePiHostVersionProbe()` already scheduled the probe in this process. */
  probeScheduled: boolean;
  /** In-flight probe promise resolving to the detected version, or `undefined` when unresolvable. */
  probePromise: Promise<string | undefined> | undefined;
  /** Whether the probe settled with a resolvable version string. */
  resolved: boolean;
  /** Detected pi CLI host version when `resolved` is `true`; otherwise `undefined`. */
  version: string | undefined;
  /** Whether the below-minimum compatibility warning was already delivered in this process. */
  warningDelivered: boolean;
}

/**
 * @brief Describes the process-scoped pi host version store persisted across extension rebinds.
 * @details Lives on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists, so the probe executes once per process and the warning cannot repeat across session rebinds. The interface is compile-time only and introduces no runtime cost.
 */
interface ProcessScopedPiHostVersionStore {
  state: PiHostVersionProbeState;
}

/**
 * @brief Returns the process-scoped pi host version probe store.
 * @details Lazily initializes one `globalThis` record so session rebinds reuse the already scheduled probe and never re-deliver the warning. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedPiHostVersionStore} Mutable process-scoped probe store.
 */
function getProcessScopedPiHostVersionStore(): ProcessScopedPiHostVersionStore {
  const storeKey = "__piUsereqPiHostVersionStore__";
    const existingStore = (globalThis as Record<string, unknown>)[storeKey] as
      | ProcessScopedPiHostVersionStore
      | undefined;
  if (existingStore) {
    return existingStore;
  }
  const freshStore: ProcessScopedPiHostVersionStore = {
    state: {
      probeScheduled: false,
      probePromise: undefined,
      resolved: false,
      version: undefined,
      warningDelivered: false,
    },
  };
  (globalThis as Record<string, unknown>)[storeKey] = freshStore;
  return freshStore;
}

/**
 * @brief Parses one version string into its leading numeric semantic triple.
 * @details Splits the input on dot separators, parses at most three leading integer components while ignoring pre-release suffixes and build metadata, and returns `undefined` when the first component is not a non-negative integer. Missing trailing components default to `0`. Runtime is O(n) in version length. No external state is mutated.
 * @param[in] value {string} Candidate version string such as `1.4.0` or `1.4.0-beta.1`.
 * @return {[number, number, number] | undefined} `[major, minor, patch]` triple, or `undefined` when the version carries no numeric leading component.
 */
function parsePiHostSemanticVersion(value: string): [number, number, number] | undefined {
  const segments = value.trim().split(".");
  const components: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const segment = segments[index] ?? "0";
    const numeric = Number.parseInt(segment, 10);
    if (!Number.isFinite(numeric) || numeric < 0 || String(numeric) !== segment) {
      if (index === 0) {
        return undefined;
      }
      components.push(0);
      continue;
    }
    components.push(numeric);
  }
  return [components[0], components[1], components[2]];
}

/**
 * @brief Compares two version strings using numeric semantic-triple ordering.
 * @details Parses both inputs with `parsePiHostSemanticVersion(...)` and compares major, minor, and patch components numerically; unparseable inputs compare as `-1` so callers can treat them as unresolvable. Runtime is O(n) in combined version length. No external state is mutated.
 * @param[in] left {string} Left-hand version string.
 * @param[in] right {string} Right-hand version string.
 * @return {number} `-1` when `left` sorts before `right`, `1` when it sorts after, `0` when equal or both unparseable.
 */
export function comparePiHostVersions(left: string, right: string): number {
  const leftTriple = parsePiHostSemanticVersion(left);
  const rightTriple = parsePiHostSemanticVersion(right);
  if (leftTriple === undefined || rightTriple === undefined) {
    return leftTriple === rightTriple ? 0 : -1;
  }
  for (let index = 0; index < 3; index += 1) {
    if (leftTriple[index] !== rightTriple[index]) {
      return leftTriple[index] < rightTriple[index] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * @brief Extracts the pi CLI host version from one resolved pi-coding-agent module namespace.
 * @details Accepts the dynamically imported module namespace or virtual-module binding, validates that `VERSION` is a non-empty string, and returns `undefined` for every other shape so degraded hosts record an unresolvable probe instead of throwing. Runtime is O(1). No external state is mutated.
 * @param[in] piHostModule {unknown} Module namespace produced by importing `@earendil-works/pi-coding-agent`.
 * @return {string | undefined} Detected pi CLI host version string, or `undefined` when the module exposes no usable `VERSION` export.
 */
export function resolvePiHostVersionFromModule(piHostModule: unknown): string | undefined {
  if (!piHostModule || typeof piHostModule !== "object") {
    return undefined;
  }
  const candidate = (piHostModule as Record<string, unknown>).VERSION;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

/**
 * @brief Loads the pi CLI host module namespace for version probing.
 * @details Dynamically imports `@earendil-works/pi-coding-agent` so the import resolves through the pi extension-loader alias in interactive hosts and through normal Node resolution in offline harnesses, keeping the probe decoupled from static import-time failures on hosts without the export. Runtime is dominated by module resolution. Side effects include one module load.
 * @return {Promise<unknown>} Resolved module namespace promise.
 */
async function loadPiHostVersionModule(): Promise<unknown> {
  return import("@earendil-works/pi-coding-agent");
}

/**
 * @brief Returns a snapshot of the current pi host version probe state.
 * @details Copies the process-scoped probe facts into one detached object so callers can inspect scheduling, resolution, and warning-delivery state without mutating the store. Runtime is O(1). No external state is mutated.
 * @return {PiHostVersionProbeState} Detached snapshot of the current probe state.
 */
export function getPiHostVersionProbeState(): PiHostVersionProbeState {
  const store = getProcessScopedPiHostVersionStore();
  return { ...store.state };
}

/**
 * @brief Schedules the once-per-process pi CLI host version probe.
 * @details Records the in-flight probe promise in the process-scoped store, extracts the `VERSION` export on settle, and records the resolved fact without throwing so bootstrap never fails because of the probe. Repeated invocations reuse the already scheduled probe. Runtime is O(1) for scheduling plus one deferred module resolution. Side effects include one dynamic module import and process-scoped store mutation.
 * @return {void} No return value.
 * @satisfies REQ-456
 */
export function schedulePiHostVersionProbe(): void {
  const store = getProcessScopedPiHostVersionStore();
  if (store.state.probeScheduled) {
    return;
  }
  store.state.probeScheduled = true;
  const probePromise = loadPiHostVersionModule()
    .then((piHostModule) => resolvePiHostVersionFromModule(piHostModule))
    .catch(() => undefined)
    .then((version) => {
      if (version !== undefined) {
        store.state.resolved = true;
        store.state.version = version;
      }
      return version;
    });
  store.state.probePromise = probePromise;
}

/**
 * @brief Builds the deterministic pi CLI host compatibility warning message.
 * @details Names the detected version, the minimum supported version, and the non-blocking behavior of the extension so the warning is actionable without terminating the session. Runtime is O(n) in version length. No external state is mutated.
 * @param[in] detectedVersion {string} Resolved pi CLI host version below the supported minimum.
 * @return {string} Single warning message delivered through the UI notification channel.
 */
export function buildPiHostVersionWarningMessage(detectedVersion: string): string {
  return [
    `pi-usereq requires pi CLI v${MINIMUM_SUPPORTED_PI_HOST_VERSION} or later, but detected v${detectedVersion}.`,
    "The extension stays enabled, but some behaviors may be incompatible until pi CLI is updated.",
  ].join(" ");
}

/**
 * @brief Consumes the below-minimum pi CLI host version warning for one `session_start`.
 * @details Awaits the scheduled probe when still in flight while degrading probe failures to an unresolvable result, returns the deterministic warning message at most once per host process when the resolved version sorts below `MINIMUM_SUPPORTED_PI_HOST_VERSION`, and returns `undefined` for supported versions, unresolvable probes, and repeat deliveries. Runtime is O(1) after probe settlement. Side effect: marks the warning as delivered in the process-scoped store when a warning is returned.
 * @return {Promise<string | undefined>} Warning message when the resolved pi CLI host version is below the supported minimum and not yet reported; otherwise `undefined`.
 * @satisfies REQ-457, REQ-458
 */
export async function consumePiHostVersionWarningForSessionStart(): Promise<string | undefined> {
  const store = getProcessScopedPiHostVersionStore();
  if (!store.state.probeScheduled) {
    schedulePiHostVersionProbe();
  }
  const probe = store.state.probePromise;
  if (probe) {
    await probe.catch(() => undefined);
  }
  if (store.state.warningDelivered || !store.state.resolved || store.state.version === undefined) {
    return undefined;
  }
  if (comparePiHostVersions(store.state.version, MINIMUM_SUPPORTED_PI_HOST_VERSION) >= 0) {
    return undefined;
  }
  store.state.warningDelivered = true;
  return buildPiHostVersionWarningMessage(store.state.version);
}
