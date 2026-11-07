/**
 * @file
 * @brief Implements pi-usereq package-management commands (`--ver|--version`, `--upgrade [--dev|--develop]`, `--uninstall`).
 * @details Provides the dependency-injected handlers dispatched by `src/cli.ts` before standard flag parsing: concurrent npm-registry plus GitHub-releases version probing for `--ver`/`--version`, npm-registry-gated or GitHub-release-tagged global reinstall for `--upgrade`, and global package removal for `--uninstall`. Every network probe is bounded by a hard timeout deadline, every package-manager child process runs with inherited stdio from the user home, and every diagnostic is stderr-only. Runtime is dominated by one or two HTTP round-trips or child-process executions per invocation. Side effects include outbound HTTPS requests and package-manager child processes.
 */

import process from "node:process";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { getInstallationPackageMetadata } from "./path-context.js";

/** npm package name probed and mutated by every management command. */
export const PACKAGE_MANAGER_PACKAGE_NAME = "pi-usereq";

/** npm registry origin without trailing slash. */
export const PACKAGE_MANAGER_REGISTRY_BASE_URL = "https://registry.npmjs.org";

/** GitHub repository owner/name resolved by the develop upgrade channel. */
export const PACKAGE_MANAGER_GITHUB_REPOSITORY = "Ogekuri/PI-useReq";

/** Default GitHub releases API URL resolving the latest published release of the distribution repository. */
export const PACKAGE_MANAGER_GITHUB_RELEASES_API_URL =
  `https://api.github.com/repos/${PACKAGE_MANAGER_GITHUB_REPOSITORY}/releases/latest`;

/** Default hard deadline in milliseconds for registry and GitHub GET requests before abandonment. */
export const PACKAGE_MANAGER_PROBE_TIMEOUT_MS = 2000;

/** Placeholder rendered whenever an installed or probed version is undeterminable. */
export const PACKAGE_MANAGER_UNKNOWN_VERSION = "unknown";

/** Package-manager command executed by the default-channel `--upgrade`. */
export const PACKAGE_UPGRADE_COMMAND: readonly string[] = [
  "npm",
  "install",
  "-g",
  `${PACKAGE_MANAGER_PACKAGE_NAME}@latest`,
];

/** Package-manager command executed by `--uninstall`. */
export const PACKAGE_UNINSTALL_COMMAND: readonly string[] = [
  "npm",
  "uninstall",
  "-g",
  PACKAGE_MANAGER_PACKAGE_NAME,
];

/** Canonical names of the top-level management commands. */
export type PackageManagerCommandName = "--ver" | "--version" | "--upgrade" | "--uninstall";

/** Install source selected for the `--upgrade` command. */
export type PackageManagerUpgradeChannel = "npm" | "develop";

/** Diagnostic sink consumed by the management handlers; both channels are stderr-only in production. */
export interface PackageManagerLogger {
  /** @param args {unknown[]} Diagnostic fragments joined for stderr output. */
  log: (...args: unknown[]) => void;
  /** @param args {unknown[]} Error diagnostic fragments for stderr output. */
  error: (...args: unknown[]) => void;
}

/** stdout sink receiving report and summary text; production default is `process.stdout`. */
export interface PackageManagerStdout {
  /** @param data {string} Report or summary text fragment to emit verbatim. */
  write: (data: string) => void;
}

/** Structural child-process result consumed by the command handlers. */
export interface PackageManagerSpawnResult {
  /** Child exit status; `null` when the child was killed by a signal or never started. */
  status: number | null;
  /** Spawn failure descriptor when the executable could not be launched. */
  error?: { message: string };
}

/** Spawn options passed to the injected spawner for every package-manager child process. */
export interface PackageManagerSpawnOptions {
  /** Neutral working directory; production resolves the user home. */
  cwd: string;
  /** Inherited stdio so npm output streams through unchanged. */
  stdio: "inherit";
  /** Windows shell resolution so `npm.cmd` resolves via `PATHEXT`. */
  shell: boolean;
}

/** Injectable synchronous child-process spawner with `spawnSync` semantics. */
export type PackageManagerSpawn = (
  file: string,
  args: readonly string[],
  options: PackageManagerSpawnOptions,
) => PackageManagerSpawnResult;

/** Discriminated outcome of one npm-registry latest-version probe. */
export type PackageManagerRegistryProbe =
  | { status: "unknown-version" }
  | { status: "error"; message: string }
  | { status: "current"; currentVersion: string }
  | { status: "newer"; currentVersion: string; latestVersion: string };

/** Discriminated outcome of one GitHub latest-release probe. */
export type PackageManagerGitHubProbe =
  | { status: "ok"; version: string; tag: string }
  | { status: "error"; message: string };

/** Dependency surface of the npm-registry probe. */
export interface PackageManagerRegistryProbeDeps {
  /** Installed package version compared against the registry payload. */
  currentVersion?: string;
  /** Package name resolved on the registry. Default: `PACKAGE_MANAGER_PACKAGE_NAME`. */
  packageName?: string;
  /** Registry origin without trailing slash. Default: `PACKAGE_MANAGER_REGISTRY_BASE_URL`. */
  registryBaseUrl?: string;
  /** Fetch implementation used for the registry GET. Default: global `fetch`. */
  fetchImpl?: typeof fetch;
  /** GET deadline in milliseconds. Default: `PACKAGE_MANAGER_PROBE_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** Dependency surface of the GitHub latest-release probe. */
export interface PackageManagerGitHubProbeDeps {
  /** Releases API URL returning the latest-release JSON document. Default: `PACKAGE_MANAGER_GITHUB_RELEASES_API_URL`. */
  releasesUrl?: string;
  /** Fetch implementation used for the releases GET. Default: global `fetch`. */
  fetchImpl?: typeof fetch;
  /** GET deadline in milliseconds. Default: `PACKAGE_MANAGER_PROBE_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** Options consumed by the management command handlers. */
export interface PackageManagerCommandOptions {
  /** Installed package version backing the version report and upgrade comparisons; `unknown` when undeterminable. */
  installedVersion: string;
  /** `--upgrade` install source; `develop` selects the latest tagged GitHub release. Default: `npm`. */
  channel?: PackageManagerUpgradeChannel;
}

/** Aggregate dependency surface of the management dispatch. */
export interface PackageManagerCommandDeps {
  /** Synchronous spawner used by all package-manager child commands. Default: `node:child_process` `spawnSync`. */
  spawn?: PackageManagerSpawn;
  /** Diagnostics sink for spawn errors and probe failures. Default: stderr-only logger. */
  logger?: PackageManagerLogger;
  /** stdout sink receiving report and summary text. Default: `process.stdout`. */
  stdout?: PackageManagerStdout;
  /** Overrides forwarded to `probeLatestRegistryVersion` by the version report and upgrade pre-check. */
  registryCheck?: PackageManagerRegistryProbeDeps;
  /** Overrides forwarded to `probeLatestGitHubRelease` by the version report and develop channel. */
  githubCheck?: PackageManagerGitHubProbeDeps;
}

/** Default stderr-only diagnostic sink used when no logger is injected. */
const defaultPackageManagerLogger: PackageManagerLogger = {
  log: (...args: unknown[]) => {
    process.stderr.write(`${args.join(" ")}\n`);
  },
  error: (...args: unknown[]) => {
    process.stderr.write(`${args.join(" ")}\n`);
  },
};

/** Default stdout sink used when no stdout sink is injected. */
const defaultPackageManagerStdout: PackageManagerStdout = {
  write: (data: string) => {
    process.stdout.write(data);
  },
};

/** Default spawner delegating to the native `spawnSync` implementation. */
const defaultPackageManagerSpawn: PackageManagerSpawn = (file, args, options) =>
  spawnSync(file, [...args], options);

/**
 * @brief Compares two dotted numeric version strings for strict-newness.
 * @details Splits both inputs on `.` into integer segments, right-pads the shorter sequence with zeroes, and returns on the first differing segment. Any non-integer segment (including prerelease suffixes such as `3-beta.1`) forces `false`, so unparseable or prerelease candidates never trigger an upgrade.
 * @param[in] candidate {string} Version reported as available (latest).
 * @param[in] current {string} Version currently installed.
 * @return {boolean} `true` only when `candidate` is strictly newer than `current`.
 * @note Complexity: O(k) in the number of dotted segments. Pure; no side effects.
 */
export function isNewerPackageManagerVersion(candidate: string, current: string): boolean {
  const toSegments = (version: string): number[] =>
    version
      .trim()
      .split(".")
      .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : Number.NaN));
  const candidateSegments = toSegments(candidate);
  const currentSegments = toSegments(current);
  if (
    candidateSegments.some((segment) => !Number.isInteger(segment)) ||
    currentSegments.some((segment) => !Number.isInteger(segment))
  ) {
    return false;
  }
  const length = Math.max(candidateSegments.length, currentSegments.length);
  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateSegments[index] ?? 0;
    const currentPart = currentSegments[index] ?? 0;
    if (candidatePart !== currentPart) {
      return candidatePart > currentPart;
    }
  }
  return false;
}

/**
 * @brief Strips the release-tag prefix from a GitHub release tag.
 * @details Trims surrounding whitespace and removes one leading `v`/`V` character, returning the remaining text.
 * @param[in] tag {string} Raw `tag_name` value from the GitHub releases API.
 * @return {string} Version text without the leading `v`; possibly empty.
 * @note Complexity: O(n) in tag length. Pure; no side effects.
 */
function stripPackageManagerReleaseTagPrefix(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

/**
 * @brief Probes the npm registry for the latest published package version.
 * @details Logging-free resolution order: installed-version guard (missing `currentVersion` returns `unknown-version` with zero network calls) -> single `GET {registry}/{package}/latest` with the timeout deadline -> `response.ok` and `payload.version` validation -> `isNewerPackageManagerVersion` gate. Every failure is returned as a discriminated outcome; never throws.
 * @param[in] deps {PackageManagerRegistryProbeDeps} Optional dependency overrides; production defaults when omitted.
 * @return {Promise<PackageManagerRegistryProbe>} Discriminated probe outcome; `message` carries the final diagnostic text without logging.
 * @note Complexity: one HTTP round-trip bounded by the timeout deadline.
 */
export async function probeLatestRegistryVersion(
  deps: PackageManagerRegistryProbeDeps = {},
): Promise<PackageManagerRegistryProbe> {
  const currentVersion = deps.currentVersion;
  if (!currentVersion) {
    return { status: "unknown-version" };
  }
  const packageName = deps.packageName ?? PACKAGE_MANAGER_PACKAGE_NAME;
  const registryBaseUrl = deps.registryBaseUrl ?? PACKAGE_MANAGER_REGISTRY_BASE_URL;
  const timeoutMs = deps.timeoutMs ?? PACKAGE_MANAGER_PROBE_TIMEOUT_MS;
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${registryBaseUrl}/${packageName}/latest`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { status: "error", message: `registry responded with HTTP ${response.status}.` };
    }
    const payload = (await response.json()) as { version?: unknown };
    if (typeof payload?.version !== "string") {
      return { status: "error", message: "registry response has no version field." };
    }
    if (!isNewerPackageManagerVersion(payload.version, currentVersion)) {
      return { status: "current", currentVersion };
    }
    return { status: "newer", currentVersion, latestVersion: payload.version };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message };
  }
}

/**
 * @brief Probes the GitHub releases API for the latest published release version.
 * @details Logging-free resolution order: single `GET {releasesUrl}` with the timeout deadline and the GitHub-mandatory `user-agent` header -> `response.ok` validation -> `payload.tag_name` validation -> leading `v` prefix strip. Never consults any persisted cache; callers own the manual-command context. Every failure is returned as a discriminated outcome; never throws.
 * @param[in] deps {PackageManagerGitHubProbeDeps} Optional dependency overrides; production defaults when omitted.
 * @return {Promise<PackageManagerGitHubProbe>} `ok` with the stripped version text plus the raw `tag_name`, or `error` with the diagnostic message.
 * @note Complexity: O(n) in tag length plus one HTTP round-trip bounded by the timeout deadline.
 */
export async function probeLatestGitHubRelease(
  deps: PackageManagerGitHubProbeDeps = {},
): Promise<PackageManagerGitHubProbe> {
  const releasesUrl = deps.releasesUrl ?? PACKAGE_MANAGER_GITHUB_RELEASES_API_URL;
  const timeoutMs = deps.timeoutMs ?? PACKAGE_MANAGER_PROBE_TIMEOUT_MS;
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(releasesUrl, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": PACKAGE_MANAGER_PACKAGE_NAME,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        status: "error",
        message: `GitHub releases API responded with HTTP ${response.status}.`,
      };
    }
    const payload = (await response.json()) as { tag_name?: unknown };
    if (typeof payload?.tag_name !== "string") {
      return { status: "error", message: "GitHub releases response has no tag_name field." };
    }
    const version = stripPackageManagerReleaseTagPrefix(payload.tag_name);
    if (!version) {
      return { status: "error", message: "GitHub release tag carries no version." };
    }
    return { status: "ok", version, tag: payload.tag_name };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message };
  }
}

/**
 * @brief Maps one registry probe outcome to its latest-version text.
 * @details `newer` maps to `latestVersion`, `current` maps to the running version, and every other outcome maps to the `unknown` placeholder. Pure; never throws.
 * @param[in] probe {PackageManagerRegistryProbe} Logging-free registry probe outcome.
 * @return {string} Latest npm-published version text, or `unknown`.
 * @note Complexity: O(1). Pure; no side effects.
 */
function resolveRegistryProbeLatestVersionText(probe: PackageManagerRegistryProbe): string {
  if (probe.status === "newer") {
    return probe.latestVersion;
  }
  if (probe.status === "current") {
    return probe.currentVersion;
  }
  return PACKAGE_MANAGER_UNKNOWN_VERSION;
}

/**
 * @brief Builds the package-manager command installing one GitHub release tag.
 * @details Produces `npm install -g github:<repository>#<tag>` where `<tag>` is the raw `tag_name` probed from the GitHub releases API, so the develop channel installs the latest tagged release independent of the branch carrying it. Child exit-code and spawn-failure semantics are identical to `PACKAGE_UPGRADE_COMMAND`.
 * @param[in] tag {string} Raw GitHub release tag (`tag_name`, e.g. `v1.2.3`); MUST be non-empty.
 * @return {readonly string[]} Executable-plus-arguments command tuple.
 * @note Complexity: O(n) in tag length. Pure; no side effects.
 */
export function buildDevelopUpgradeCommand(tag: string): readonly string[] {
  return ["npm", "install", "-g", `github:${PACKAGE_MANAGER_GITHUB_REPOSITORY}#${tag}`];
}

/**
 * @brief Detects an exact management-command argv shape in a raw argv array.
 * @details Single-token shape: exactly one of `--ver`, `--version`, `--upgrade`, `--uninstall`. Two-token shape: `--upgrade` paired with the `--develop` option or its equivalent `--dev` alias, in either order. Any other shape yields `undefined` so standard flag dispatch stays untouched.
 * @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
 * @return {PackageManagerCommandName | undefined} Canonical command name, or `undefined` when no management shape matches.
 * @note Complexity: O(1). Pure; no side effects.
 */
export function parsePackageManagerCommand(
  args: readonly string[],
): PackageManagerCommandName | undefined {
  if (args.length === 1) {
    const arg = args[0];
    if (arg === "--ver" || arg === "--version" || arg === "--upgrade" || arg === "--uninstall") {
      return arg;
    }
    return undefined;
  }
  if (args.length === 2) {
    const hasUpgrade = args.includes("--upgrade");
    const hasDevelop = args.includes("--develop") || args.includes("--dev");
    if (hasUpgrade && hasDevelop) {
      return "--upgrade";
    }
  }
  return undefined;
}

/**
 * @brief Resolves the `--upgrade` install channel from a raw argv array.
 * @details Returns `develop` when the argv contains the `--develop` option or its equivalent `--dev` alias, and `npm` (default channel) otherwise. Pure; no side effects.
 * @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
 * @return {PackageManagerUpgradeChannel} `develop` or `npm`.
 * @note Complexity: O(n) in argv length. Pure; no side effects.
 */
export function parsePackageManagerUpgradeChannel(args: readonly string[]): PackageManagerUpgradeChannel {
  return args.includes("--develop") || args.includes("--dev") ? "develop" : "npm";
}

/**
 * @brief Resolves the installed package version backing the management commands.
 * @details Reads the installation-owned package metadata resolved from the executing module location and returns its `version` field, which degrades to `unknown` when the manifest is missing, malformed, or incomplete. Runtime is O(n) on the first call in manifest size and O(1) afterwards due to the shared process-scoped cache. Side effects are limited to one filesystem read and module-local cache mutation.
 * @return {string} Installed package version, or `unknown`.
 */
export function resolvePackageManagerInstalledVersion(): string {
  return getInstallationPackageMetadata().version;
}

/**
 * @brief Runs one package-manager command as a child process with inherited stdio.
 * @details Spawns `command[0]` with the remaining tokens, inheriting stdio so npm output streams through unchanged; Windows spawns run through a shell so `npm.cmd` resolves via `PATHEXT`. The child runs with an explicit neutral working directory (the user home), never the caller's cwd, because management installs are routinely invoked from inside a source checkout of the same package being replaced. Spawn failures print the error plus the exact manual command hint on stderr and map to exit code `1`; otherwise the child exit code propagates (`null` status maps to `1`).
 * @param[in] command {readonly string[]} Executable plus argument vector.
 * @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger overrides.
 * @return {number} Child exit code, or `1` when spawning failed.
 * @note Complexity: dominated by the child process execution.
 */
function runPackageManagerChildCommand(
  command: readonly string[],
  deps: PackageManagerCommandDeps = {},
): number {
  const logger = deps.logger ?? defaultPackageManagerLogger;
  const spawnImpl = deps.spawn ?? defaultPackageManagerSpawn;
  const reportSpawnFailure = (message: string): number => {
    logger.error(`Error executing ${command[0]}: ${message}`);
    logger.log(`Warning: run this command manually: ${command.join(" ")}`);
    return 1;
  };
  try {
    const result = spawnImpl(command[0], [...command.slice(1)], {
      cwd: homedir(),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.error) {
      return reportSpawnFailure(result.error.message);
    }
    return result.status ?? 1;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return reportSpawnFailure(message);
  }
}

/**
 * @brief Handles `--ver`/`--version`: dual online probe plus three-line version report.
 * @details Runs the npm-registry probe and the GitHub-releases probe concurrently, bypassing every persisted cache, then writes exactly three stdout lines — the installed version, `npmjs latest: <version>`, and `GitHub latest: <version>` — and returns `0`. Any undeterminable version prints as `unknown`.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version.
 * @param[in] deps {PackageManagerCommandDeps} Optional registry/GitHub/stdout overrides.
 * @return {Promise<number>} Exit code `0`.
 * @note Complexity: two concurrent HTTP round-trips bounded by the probe timeout.
 */
export async function runPackageManagerVersionCommand(
  options: PackageManagerCommandOptions,
  deps: PackageManagerCommandDeps = {},
): Promise<number> {
  const [registryProbe, githubProbe] = await Promise.all([
    probeLatestRegistryVersion({ ...deps.registryCheck, currentVersion: options.installedVersion }),
    probeLatestGitHubRelease(deps.githubCheck),
  ]);
  const installedVersion = options.installedVersion || PACKAGE_MANAGER_UNKNOWN_VERSION;
  const registryLatest = resolveRegistryProbeLatestVersionText(registryProbe);
  const githubLatest = githubProbe.status === "ok" ? githubProbe.version : PACKAGE_MANAGER_UNKNOWN_VERSION;
  const stdout = deps.stdout ?? defaultPackageManagerStdout;
  stdout.write(
    `${installedVersion}\nnpmjs latest: ${registryLatest}\nGitHub latest: ${githubLatest}\n`,
  );
  return 0;
}

/**
 * @brief Resolves the updated package version reported by the upgrade summary.
 * @details Runs one logging-free registry probe after the upgrade child succeeds, forwarding the injected registry dependencies, and delegates the outcome-to-version mapping to `resolveRegistryProbeLatestVersionText`: `newer` maps to the registry latest version, `current` to the running version, and every other outcome to `unknown`. Never throws.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version.
 * @param[in] deps {PackageManagerCommandDeps} Optional registry overrides.
 * @return {Promise<string>} Updated version string; `unknown` when undeterminable.
 * @note Complexity: one HTTP round-trip bounded by the probe timeout.
 */
async function resolveUpdatedPackageManagerVersion(
  options: PackageManagerCommandOptions,
  deps: PackageManagerCommandDeps,
): Promise<string> {
  const probe = await probeLatestRegistryVersion({
    ...deps.registryCheck,
    currentVersion: options.installedVersion,
  });
  return resolveRegistryProbeLatestVersionText(probe);
}

/**
 * @brief Decides whether the default-channel `--upgrade` flow must proceed after the pre-upgrade probe.
 * @details Decision table over `PackageManagerRegistryProbe.status`: `newer` -> `true`; `current` -> `false` because the installed version is already the latest available; `unknown-version` and `error` -> `true` because upgrade necessity is undeterminable and the update path is preserved.
 * @param[in] status {PackageManagerRegistryProbe["status"]} Status of the pre-upgrade registry probe.
 * @return {boolean} `true` when the package-update child process must run.
 * @note Complexity: O(1). Pure; no side effects.
 */
function isPackageManagerUpgradeNecessary(status: PackageManagerRegistryProbe["status"]): boolean {
  return status !== "current";
}

/**
 * @brief Handles `--upgrade`: channel selection, package reinstall, then stdout summary.
 * @details Develop channel (`--dev`/`--develop`): skips the registry comparison and the already-latest skip path entirely, always proceeding with the tagged GitHub update; a failed GitHub probe prints one stderr diagnostic and returns `1` without spawning any child process, while a successful probe installs `github:<repository>#<tag>` and summarizes with the probed release version. Default npm channel: one forced registry probe bypassing every cache; `current` writes the already-latest stdout line and returns `0` without spawning any child; any other outcome runs `npm install -g pi-usereq@latest` with inherited stdio, propagates a non-zero child exit code without printing any summary, resolves the updated version through one follow-up probe, and prints the completion summary.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version and channel.
 * @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger/registry/GitHub/stdout overrides.
 * @return {Promise<number>} `0` when the installed version is already the latest available; otherwise the upgrade exit code when non-zero, else `0` after a successful reinstall.
 * @note Complexity: one to two HTTP round-trips plus at most one child process execution.
 */
export async function runPackageManagerUpgradeCommand(
  options: PackageManagerCommandOptions,
  deps: PackageManagerCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? defaultPackageManagerStdout;
  if ((options.channel ?? "npm") === "develop") {
    const githubProbe = await probeLatestGitHubRelease(deps.githubCheck);
    if (githubProbe.status !== "ok") {
      (deps.logger ?? defaultPackageManagerLogger).error(
        `GitHub upgrade channel probe failed: ${githubProbe.message}`,
      );
      return 1;
    }
    const upgraded = runPackageManagerChildCommand(buildDevelopUpgradeCommand(githubProbe.tag), deps);
    if (upgraded !== 0) {
      return upgraded;
    }
    stdout.write(
      `pi-usereq upgrade completed: ${options.installedVersion} -> ${githubProbe.version}\n`,
    );
    return 0;
  }
  const precheck = await probeLatestRegistryVersion({
    ...deps.registryCheck,
    currentVersion: options.installedVersion,
  });
  if (!isPackageManagerUpgradeNecessary(precheck.status)) {
    stdout.write(
      `${PACKAGE_MANAGER_PACKAGE_NAME} ${options.installedVersion} is already the latest available version.\n`,
    );
    return 0;
  }
  const upgraded = runPackageManagerChildCommand(PACKAGE_UPGRADE_COMMAND, deps);
  if (upgraded !== 0) {
    return upgraded;
  }
  const updatedVersion = await resolveUpdatedPackageManagerVersion(options, deps);
  stdout.write(`pi-usereq upgrade completed: ${options.installedVersion} -> ${updatedVersion}\n`);
  return 0;
}

/**
 * @brief Handles `--uninstall`: removes the globally installed package.
 * @details Runs `npm uninstall -g pi-usereq` with inherited stdio and returns the child exit code; spawn failures map to exit code `1` with the manual command hint on stderr.
 * @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger overrides.
 * @return {number} Child exit code, or `1` when spawning failed.
 * @note Complexity: dominated by the child process execution.
 */
export function runPackageManagerUninstallCommand(deps: PackageManagerCommandDeps = {}): number {
  return runPackageManagerChildCommand(PACKAGE_UNINSTALL_COMMAND, deps);
}

/**
 * @brief Dispatches one management command to its handler.
 * @details Single dispatch surface for the CLI entry intercept: `--ver`/`--version` routes to `runPackageManagerVersionCommand`, `--upgrade` routes to `runPackageManagerUpgradeCommand` honoring the forwarded channel option, and `--uninstall` routes to `runPackageManagerUninstallCommand`.
 * @param[in] command {PackageManagerCommandName} Canonical management command name.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version and upgrade channel.
 * @param[in] deps {PackageManagerCommandDeps} Optional dependency overrides.
 * @return {Promise<number>} Handler exit code suitable for `process.exitCode`.
 */
export async function runPackageManagerManagementCommand(
  command: PackageManagerCommandName,
  options: PackageManagerCommandOptions,
  deps: PackageManagerCommandDeps = {},
): Promise<number> {
  switch (command) {
    case "--ver":
    case "--version":
      return runPackageManagerVersionCommand(options, deps);
    case "--upgrade":
      return runPackageManagerUpgradeCommand(options, deps);
    case "--uninstall":
      return runPackageManagerUninstallCommand(deps);
  }
}
