/**
 * @brief Deploys and removes the PATH-accessible `pi-usereq` launcher link for pi-package installations.
 * @details Provides the installation-scoped helpers that expose the `pi-usereq` CLI as a direct shell command when the package is installed as a pi CLI extension. pi installs npm package sources locally under `<agent-dir>/npm` without global bin linking, so the extension itself materializes one `pi-usereq` symlink inside the pi-managed agent bin directory (`~/.pi/agent/bin` by default, honoring the pi `PI_CODING_AGENT_DIR` override) targeting the installation-owned shebang launcher `scripts/pi-usereq.js`. Deployment is best-effort and idempotent: existing links resolving to the current target are skipped, divergent symlinks are replaced, and non-symlink entries are never overwritten. Removal during `--uninstall` deletes only links that resolve inside the executing installation path, leaving foreign entries untouched. Every operation is total: filesystem failures degrade to `false` or a skipped outcome instead of throwing so extension activation never aborts. Runtime is O(1) per operation plus bounded filesystem metadata calls. Side effects include directory creation, symlink creation and deletion inside the resolved agent bin directory.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getInstallationPath, isSameOrAncestorPath } from "./path-context.js";

/** Executable name of the deployed launcher link inside the pi agent bin directory. */
export const PI_USEREQ_LAUNCHER_NAME = "pi-usereq";

/** Launcher target path relative to the installation root, matching the npm `bin` contract. */
const PI_USEREQ_LAUNCHER_RELATIVE_PATH = path.join("scripts", "pi-usereq.js");

/** pi agent directory environment override consumed by the pi CLI host for its user config root. */
const PI_CODING_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

/** Deployment outcome discriminator returned by `deployPiUsereqLauncher`. */
export type PiUsereqLauncherDeployOutcome =
  | "created"
  | "current"
  | "replaced"
  | "skipped";

/** Deterministic outcome facts of one launcher deployment attempt. */
export interface PiUsereqLauncherDeployResult {
  /** `true` when this attempt created or replaced the launcher link. */
  deployed: boolean;
  /** Canonical deployment outcome consumed by tests and diagnostics. */
  outcome: PiUsereqLauncherDeployOutcome;
  /** Stable skip-reason identifier when `outcome` is `skipped`. */
  reason?: string;
}

/** Dependency overrides consumed by the launcher deployment and removal helpers. */
export interface PiUsereqLauncherDeployOptions {
  /** Absolute installation root owning `scripts/pi-usereq.js`. Default: runtime installation path. */
  installationPath?: string;
  /** Absolute pi agent bin directory receiving the launcher link. Default: resolved pi agent bin dir. */
  agentBinDir?: string;
}

/**
 * @brief Expands one leading user-home tilde inside a path candidate.
 * @details Replaces a leading `~` or `~/` (and the Windows `~\` spelling) with the supplied user-home prefix while preserving every other path segment unchanged, mirroring the pi agent-directory expansion contract. Runtime is O(n) in path length. Pure; no side effects.
 * @param[in] value {string} Path candidate that may begin with a tilde.
 * @param[in] homeDir {string} Absolute user-home directory used for the expansion.
 * @return {string} Expanded path, or the input unchanged when no leading tilde is present.
 * @note Complexity: O(n) in path length. Pure; no side effects.
 */
function expandLeadingTilde(value: string, homeDir: string): string {
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/") || value.startsWith(`~${path.sep}`)) {
    return path.join(homeDir, value.slice(2));
  }
  return value;
}

/**
 * @brief Resolves the pi-managed agent bin directory receiving the launcher link.
 * @details Honors the pi `PI_CODING_AGENT_DIR` environment override (tilde-expanded) exactly like the pi CLI host resolves its agent directory, then appends `bin`; without the override the directory resolves to `<user-home>/.pi/agent/bin`, the pi-managed binaries directory documented by the pi CLI client sources. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
 * @return {string} Absolute pi agent bin directory path.
 * @note Complexity: O(p) in path length.
 * @satisfies REQ-504
 */
export function resolvePiAgentBinDir(homeDirImpl: () => string = os.homedir): string {
  const homeDir = homeDirImpl();
  const agentDirEnv = process.env[PI_CODING_AGENT_DIR_ENV];
  if (agentDirEnv) {
    return path.join(expandLeadingTilde(agentDirEnv, homeDir), "bin");
  }
  return path.join(homeDir, ".pi", "agent", "bin");
}

/**
 * @brief Resolves the npm package root anchoring launcher target composition plus ownership containment.
 * @details Returns an explicit caller override resolved to an absolute path verbatim so deterministic test and CLI overrides keep their documented package-root meaning, and derives the production default as the parent directory of the source-root installation path exposed by `getInstallationPath()` because the executing module lives under `<packageRoot>/src/core` while the npm `bin` launcher declared by DES-028 lives at `<packageRoot>/scripts/pi-usereq.js`. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] explicitInstallationPath {string | undefined} Caller-supplied package-root override; `undefined` selects the derived default.
 * @return {string} Absolute package root directory anchoring launcher target composition plus ownership containment.
 * @note Complexity: O(p) in path length. Pure; no side effects.
 * @satisfies REQ-504, REQ-508, REQ-509
 */
function resolveLauncherPackageRoot(explicitInstallationPath: string | undefined): string {
  if (explicitInstallationPath !== undefined) {
    return path.resolve(explicitInstallationPath);
  }
  return path.resolve(getInstallationPath(), "..");
}

/**
 * @brief Resolves the installation-owned launcher target backing the deployed link.
 * @details Anchors on the npm package root resolved through `resolveLauncherPackageRoot` and joins `scripts/pi-usereq.js`, the shebang launcher declared by the npm `bin` metadata, so the deployed symlink executes the same entry as global npm installations. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] installationPath {string} Absolute package root override. Defaults to the package root derived from the runtime source-root installation path.
 * @return {string} Absolute launcher target path.
 * @note Complexity: O(p) in path length.
 * @satisfies REQ-504
 */
export function resolvePiUsereqLauncherTarget(installationPath?: string): string {
  return path.join(resolveLauncherPackageRoot(installationPath), PI_USEREQ_LAUNCHER_RELATIVE_PATH);
}

/**
 * @brief Tests whether the executing installation resides inside the pi package installation tree.
 * @details Resolves the pi agent directory using the same `PI_CODING_AGENT_DIR` plus `<user-home>/.pi/agent` contract as the pi CLI host, then applies the repository-ancestry containment rule against `<agent-dir>/npm/node_modules`, the local npm prefix install root the pi package manager uses for npm sources. Source checkouts, global npm installs, and offline harnesses fail the containment test so activation-side launcher deployment stays scoped to real pi-package installations. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] installationPath {string} Candidate installation root. Defaults to the runtime installation path.
 * @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
 * @return {boolean} `true` when the installation path is inside the pi package npm install tree.
 * @note Complexity: O(p) in path length.
 * @satisfies REQ-504
 */
export function isPiPackageInstallation(
  installationPath: string = getInstallationPath(),
  homeDirImpl: () => string = os.homedir,
): boolean {
  const homeDir = homeDirImpl();
  const agentDirEnv = process.env[PI_CODING_AGENT_DIR_ENV];
  const agentDir = agentDirEnv
    ? expandLeadingTilde(agentDirEnv, homeDir)
    : path.join(homeDir, ".pi", "agent");
  return isSameOrAncestorPath(path.join(agentDir, "npm", "node_modules"), path.resolve(installationPath));
}

/**
 * @brief Best-effort deploys one idempotent `pi-usereq` launcher symlink into the pi agent bin directory.
 * @details Anchors the launcher target on the npm package root derived from the caller override or the source-root installation path parent, skips deployment with `launcher-missing` when the installation-owned launcher target does not exist, creates the agent bin directory when required, skips links already resolving to the current target for idempotence, replaces divergent symlinks so relocated installations stay reachable, skips non-symlink `pi-usereq` entries with `foreign-entry` instead of overwriting user-owned files, and converts every filesystem failure into a skipped outcome carrying the diagnostic reason so extension activation never aborts. Runtime is O(1) plus bounded filesystem metadata calls. Side effects include directory creation, symlink creation, and symlink deletion inside the resolved agent bin directory only.
 * @param[in] options {PiUsereqLauncherDeployOptions} Optional installation and agent-bin directory overrides consumed by deterministic tests.
 * @return {PiUsereqLauncherDeployResult} Deployment outcome facts; never throws.
 * @note Complexity: O(1) plus bounded filesystem metadata calls.
 * @satisfies REQ-504, REQ-505, REQ-506, REQ-507
 */
export function deployPiUsereqLauncher(
  options: PiUsereqLauncherDeployOptions = {},
): PiUsereqLauncherDeployResult {
  try {
    const target = resolvePiUsereqLauncherTarget(options.installationPath);
    const binDir = path.resolve(options.agentBinDir ?? resolvePiAgentBinDir());
    const linkPath = path.join(binDir, PI_USEREQ_LAUNCHER_NAME);
    if (!fs.existsSync(target)) {
      return { deployed: false, outcome: "skipped", reason: "launcher-missing" };
    }
    fs.mkdirSync(binDir, { recursive: true });
    let existing: fs.Stats | undefined;
    try {
      existing = fs.lstatSync(linkPath);
    } catch {
      existing = undefined;
    }
    if (existing?.isSymbolicLink()) {
      const currentTarget = path.resolve(binDir, fs.readlinkSync(linkPath));
      if (currentTarget === path.resolve(target)) {
        return { deployed: false, outcome: "current" };
      }
      fs.unlinkSync(linkPath);
      fs.symlinkSync(target, linkPath, "file");
      return { deployed: true, outcome: "replaced" };
    }
    if (existing) {
      return { deployed: false, outcome: "skipped", reason: "foreign-entry" };
    }
    fs.symlinkSync(target, linkPath, "file");
    return { deployed: true, outcome: "created" };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return { deployed: false, outcome: "skipped", reason };
  }
}

/**
 * @brief Best-effort removes the deployed `pi-usereq` launcher link owned by the executing installation.
 * @details Removes the agent-bin `pi-usereq` entry only when it is a symlink resolving inside the executing npm package root derived from the caller override or the source-root installation path parent so relocated or upgraded installations are cleaned up, leaves foreign symlinks and non-symlink entries untouched, and converts every filesystem failure into `false` so the uninstall exit-code contract stays intact. Runtime is O(1) plus bounded filesystem metadata calls. Side effects include one symlink deletion inside the resolved agent bin directory only.
 * @param[in] options {PiUsereqLauncherDeployOptions} Optional installation and agent-bin directory overrides consumed by deterministic tests.
 * @return {boolean} `true` when the installation-owned launcher link was removed; `false` when absent, foreign, or the removal failed.
 * @note Complexity: O(1) plus bounded filesystem metadata calls.
 * @satisfies REQ-508, REQ-509
 */
export function removeDeployedPiUsereqLauncher(
  options: PiUsereqLauncherDeployOptions = {},
): boolean {
  try {
    const installationPath = resolveLauncherPackageRoot(options.installationPath);
    const binDir = path.resolve(options.agentBinDir ?? resolvePiAgentBinDir());
    const linkPath = path.join(binDir, PI_USEREQ_LAUNCHER_NAME);
    let existing: fs.Stats;
    try {
      existing = fs.lstatSync(linkPath);
    } catch {
      return false;
    }
    if (!existing.isSymbolicLink()) {
      return false;
    }
    const linkTarget = path.resolve(binDir, fs.readlinkSync(linkPath));
    if (!isSameOrAncestorPath(installationPath, linkTarget)) {
      return false;
    }
    fs.unlinkSync(linkPath);
    return true;
  } catch {
    return false;
  }
}
