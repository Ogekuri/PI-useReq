/**
 * @file
 * @brief Guards one pi host process against duplicate pi-usereq extension activation.
 * @details Keeps the activated pi-usereq installation path in a process-scoped registry so a duplicated installation (for example the same package present under `<agent-dir>/npm/node_modules/pi-usereq` and under `<agent-dir>/git/<host>/<owner>/<repository>`) cannot register the documented commands, agent tools, shortcuts, and lifecycle hooks twice. pi keeps every loaded extension active and reports duplicated tool names as extension load errors, so without this guard a duplicated installation makes pi CLI print one conflict diagnostic per registered tool while the effective registered inventory is unchanged because pi resolves precedence by load order. The registry lives on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, while the hosting process persists across those operations; repeated activation of the same installation path is therefore always allowed so session-rebind registration stays intact. Runtime is O(1). Side effects are limited to process-scoped state mutation.
 */

import path from "node:path";
import { getInstallationPath } from "./path-context.js";

/**
 * @brief Describes one extension activation claim attempt.
 * @details Reports whether the calling installation owns the activation plus the installation path that currently owns it, so the caller can skip duplicate registration deterministically. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiUsereqExtensionActivationClaim {
  /** `true` when the calling installation may register the extension surfaces. */
  claimed: boolean;
  /** Normalized installation path that owns the extension activation in this host process. */
  activeInstallationPath: string;
}

/**
 * @brief Stores the process-scoped activated-installation fact.
 * @details Holds at most one installation path because pi loads every discovered extension in the same host process and only one pi-usereq copy may own registration. The interface is compile-time only and introduces no runtime cost.
 */
interface ProcessScopedExtensionInstanceStore {
  /** Normalized installation path that already registered the extension surfaces. */
  activeInstallationPath?: string;
}

/**
 * @brief Describes the `globalThis` extension carrying the process-scoped activation store.
 * @details Narrows the global object to the single private property consumed by this module so session rebinds reuse the same store without leaking a documented public surface. The alias is compile-time only and introduces no runtime cost.
 */
type GlobalExtensionInstanceStore = typeof globalThis & {
  __piUsereqExtensionInstanceStore?: ProcessScopedExtensionInstanceStore;
};

/**
 * @brief Returns the process-scoped extension activation store.
 * @details Lazily initializes one `globalThis` record so extension rebinds for `/new`, `/resume`, `/fork`, and `/reload` reuse the already recorded installation path instead of forgetting it. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedExtensionInstanceStore} Mutable process-scoped activation store.
 */
function getProcessScopedExtensionInstanceStore(): ProcessScopedExtensionInstanceStore {
  const globalStore = globalThis as GlobalExtensionInstanceStore;
  globalStore.__piUsereqExtensionInstanceStore ??= {};
  return globalStore.__piUsereqExtensionInstanceStore;
}

/**
 * @brief Normalizes one installation path for activation ownership comparison.
 * @details Resolves the candidate to an absolute path and lowercases it on Windows so path-case differences between managed install roots never look like a duplicate installation. Runtime is O(p) in path length. Pure; no side effects.
 * @param[in] installationPath {string} Absolute or relative installation package root.
 * @return {string} Normalized installation path used for ownership comparison.
 * @note Complexity: O(p) in path length. Pure; no side effects.
 */
function normalizeInstallationPath(installationPath: string): string {
  const resolvedPath = path.resolve(installationPath);
  return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
}

/**
 * @brief Claims the extension activation for one installation path.
 * @details Claims ownership when no installation claimed the activation yet, and re-confirms ownership when the requesting path is the recorded one so session-rebind activation keeps registering. A different installation path receives `claimed: false` plus the owning path so the caller skips duplicate registration instead of emitting pi tool-conflict diagnostics. Runtime is O(p) in path length. Side effect: records the claiming installation path in process-scoped state.
 * @param[in] installationPath {string} Installation package root requesting activation. Defaults to the runtime installation path.
 * @return {PiUsereqExtensionActivationClaim} Claim outcome plus the owning installation path.
 * @note Complexity: O(p) in path length.
 * @satisfies REQ-004, REQ-009, REQ-044, DES-002
 */
export function claimPiUsereqExtensionActivation(
  installationPath: string = getInstallationPath(),
): PiUsereqExtensionActivationClaim {
  const store = getProcessScopedExtensionInstanceStore();
  const candidatePath = normalizeInstallationPath(installationPath);
  if (store.activeInstallationPath === undefined) {
    store.activeInstallationPath = candidatePath;
    return { claimed: true, activeInstallationPath: candidatePath };
  }
  return {
    claimed: store.activeInstallationPath === candidatePath,
    activeInstallationPath: store.activeInstallationPath,
  };
}

/**
 * @brief Releases the extension activation claim owned by one installation path.
 * @details Clears the recorded owner only when the requesting installation owns it, so a failed partial activation can hand the activation to another installed copy while a non-owning installation can never clear foreign ownership. Runtime is O(p) in path length. Side effect: mutates process-scoped state.
 * @param[in] installationPath {string} Installation package root releasing activation. Defaults to the runtime installation path.
 * @return {void} No return value.
 * @note Complexity: O(p) in path length.
 * @satisfies REQ-009, DES-002
 */
export function releasePiUsereqExtensionActivation(
  installationPath: string = getInstallationPath(),
): void {
  const store = getProcessScopedExtensionInstanceStore();
  if (store.activeInstallationPath === normalizeInstallationPath(installationPath)) {
    delete store.activeInstallationPath;
  }
}

/**
 * @brief Clears the process-scoped extension activation store for deterministic tests.
 * @details Removes the whole `globalThis` record so one test can simulate independent pi host processes without leaking ownership into later cases. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 */
export function resetPiUsereqExtensionActivationForTests(): void {
  delete (globalThis as GlobalExtensionInstanceStore).__piUsereqExtensionInstanceStore;
}
