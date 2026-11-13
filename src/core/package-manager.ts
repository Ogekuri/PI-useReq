/**
 * @file
 * @brief Implements pi-usereq package-management commands (`--help`, `--ver|--version`, `--upgrade [--dev|--develop] [--force]`, `--uninstall`).
 * @details Provides the dependency-injected handlers dispatched by `src/cli.ts` before standard flag parsing: offline help-screen rendering for `--help`, concurrent npm-registry plus GitHub-releases version probing for `--ver`/`--version`, pi-CLI package update through the documented `pi update npm:pi-usereq` form on the default `--upgrade` channel, tag-pinned `pi install git:github.com/Ogekuri/PI-useReq@<tag>` reconciliation on the develop channel after the GitHub latest-release probe, forced runs that only skip the default-channel already-latest registry gate because the pi CLI `--force` option affects the self-update path only, source-aware reconciliation that identifies the installed npm-managed or git-managed package and runs `pi remove <identified-source>` plus `pi install <target-source>` when the channel target differs from the installed source, and global package removal for `--uninstall`. Every network probe is bounded by a hard timeout deadline, every package-manager child process runs with inherited stdio from the user home, and every diagnostic is stderr-only. Upgrade completion summaries resolve the updated version through the pi-managed-first installed-version rule and warn when a non-forced child leaves it unchanged. Runtime is dominated by one or two HTTP round-trips or child-process executions per invocation. Side effects include outbound HTTPS requests and package-manager child processes.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import {
  deployPiUsereqLauncher,
  isPiPackageInstallation,
  removeDeployedPiUsereqLauncher,
  removeUserBinPiUsereqLauncher,
} from "./bin-deploy.js";
import {
  getInstallationPackageMetadata,
  getInstallationPath,
  isSameOrAncestorPath,
  refreshInstallationPackageMetadata,
} from "./path-context.js";

/** npm package name probed and mutated by every management command. */
export const PACKAGE_MANAGER_PACKAGE_NAME = "pi-usereq";

/** pi package source token of the npm-managed installation. */
export const PACKAGE_MANAGER_NPM_SOURCE = `npm:${PACKAGE_MANAGER_PACKAGE_NAME}`;

/** pi agent directory environment override consumed by the pi CLI host for its user config root. */
const PI_CODING_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

/** npm registry origin without trailing slash. */
export const PACKAGE_MANAGER_REGISTRY_BASE_URL = "https://registry.npmjs.org";

/** GitHub repository owner/name probed by the version report and installed from by the develop upgrade channel. */
export const PACKAGE_MANAGER_GITHUB_REPOSITORY = "Ogekuri/PI-useReq";

/** Unpinned pi package source token of the git-managed installation; develop-channel releases append `@<tag>` through `buildPackageManagerDevelopSource(...)`. */
export const PACKAGE_MANAGER_GIT_SOURCE = `git:github.com/${PACKAGE_MANAGER_GITHUB_REPOSITORY}`;

/** Default GitHub releases API URL resolving the latest published release of the distribution repository. */
export const PACKAGE_MANAGER_GITHUB_RELEASES_API_URL =
  `https://api.github.com/repos/${PACKAGE_MANAGER_GITHUB_REPOSITORY}/releases/latest`;

/** Default hard deadline in milliseconds for registry and GitHub GET requests before abandonment. */
export const PACKAGE_MANAGER_PROBE_TIMEOUT_MS = 2000;

/** Placeholder rendered whenever an installed or probed version is undeterminable. */
export const PACKAGE_MANAGER_UNKNOWN_VERSION = "unknown";

/** Package-manager command executed by the default-channel `--upgrade`, matching the pi CLI update form that advances an already-installed managed package beyond its saved dependency range; forced runs reuse the same command because the pi CLI `--force` option affects only the self-update path. */
export const PACKAGE_UPGRADE_COMMAND: readonly string[] = [
  "pi",
  "update",
  `npm:${PACKAGE_MANAGER_PACKAGE_NAME}`,
];

/**
 * @brief Builds the ref-pinned pi package source of one GitHub release tag for the develop channel.
 * @details Composes `git:github.com/Ogekuri/PI-useReq@<tag>` from the documented distribution repository identity plus the raw `tag_name` resolved by the GitHub latest-release probe, so the develop channel installs the exact published release instead of the repository default branch. Runtime is O(n) in tag length. Pure; no side effects.
 * @param[in] tag {string} Raw GitHub release `tag_name`, such as `v1.2.3`.
 * @return {string} Ref-pinned develop-channel pi package source token.
 * @note Complexity: O(n) in tag length. Pure; no side effects.
 * @satisfies REQ-613, REQ-639, REQ-644
 */
export function buildPackageManagerDevelopSource(tag: string): string {
  return `${PACKAGE_MANAGER_GIT_SOURCE}@${tag.trim()}`;
}

/** Package-manager command executed by `--uninstall`. */
export const PACKAGE_UNINSTALL_COMMAND: readonly string[] = [
  "npm",
  "uninstall",
  "-g",
  PACKAGE_MANAGER_PACKAGE_NAME,
];

/** Canonical names of the top-level management commands. */
export type PackageManagerCommandName =
  | "--ver"
  | "--version"
  | "--upgrade"
  | "--uninstall"
  | "--help";

/** Install source selected for the `--upgrade` command. */
export type PackageManagerUpgradeChannel = "npm" | "develop";

/**
 * Identified package source of the executing installation.
 * - `kind`: pi package source family; `unknown` when the installation is not pi-managed.
 * - `source`: pi package source token consumed by `pi remove`; absent for `unknown`.
 */
export interface PackageManagerInstalledPackage {
  kind: "npm" | "git" | "unknown";
  source?: string;
}

/** Management topic tokens accepted as the operand of the two-token `--help <topic>` argv shape. */
export type PackageManagerHelpTopic =
  | "--upgrade"
  | "--dev"
  | "--develop"
  | "--uninstall"
  | "--ver"
  | "--version";

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
  /** Windows shell resolution so `npm.cmd` and `pi.cmd` resolve via `PATHEXT`. */
  shell: boolean;
}

/** Injectable synchronous child-process spawner with `spawnSync` semantics. */
export type PackageManagerSpawn = (
  file: string,
  args: readonly string[],
  options: PackageManagerSpawnOptions,
) => PackageManagerSpawnResult;

/** Discriminated outcome of one npmjs package-manifest latest-version probe; `current` carries the resolved manifest latest even when it is not strictly newer than the installed version. */
export type PackageManagerRegistryProbe =
  | { status: "unknown-version" }
  | { status: "error"; message: string }
  | { status: "current"; currentVersion: string; latestVersion: string }
  | { status: "newer"; currentVersion: string; latestVersion: string };

/**
 * Discriminated outcome of one GitHub latest-release probe.
 * - `message`: deterministic probe diagnostic such as the HTTP-status text or the transport error message.
 * - `reason`: upstream failure reason captured from the GitHub error response `message` field when the failing response exposes one; omitted when the response body carries no usable message.
 */
export type PackageManagerGitHubProbe =
  | { status: "ok"; version: string; tag: string }
  | { status: "error"; message: string; reason?: string };

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
  /** `--upgrade` install source; `develop` selects the latest tagged GitHub release pinned as `git:github.com/Ogekuri/PI-useReq@<tag>`. Default: `npm`. */
  channel?: PackageManagerUpgradeChannel;
  /** `--upgrade` forced mode; `true` skips the default-channel already-latest registry gate. Extension reconciliation children never receive a pi CLI `--force` token because that option affects only the pi CLI self-update path. Default: `false`. */
  force?: boolean;
  /** `--help` topic selecting single-command help; `undefined` selects the full help screen. */
  helpTopic?: PackageManagerHelpTopic;
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
  /** Post-upgrade installed-version resolver invoked after a successful upgrade child. Default: fresh installation-owned package metadata read. */
  resolveUpgradedVersion?: () => string;
  /** Installed package source resolver invoked before any upgrade child. Default: `resolveInstalledPackageManagerSource` over the runtime installation path. */
  resolveInstalledSource?: () => PackageManagerInstalledPackage;
  /** Launcher-link remover invoked by `--uninstall` before the uninstall child. Default: `removeDeployedPiUsereqLauncher`. */
  removeLauncher?: () => boolean;
  /** User-home bin launcher-link remover invoked before `removeLauncher`. Default: `removeUserBinPiUsereqLauncher`. */
  removeUserBinLauncher?: () => boolean;
  /** Agent-bin launcher repair invoked after every successful upgrade child so a completed upgrade never leaves the `pi-usereq` command dangling. Default: gated runtime-installation launcher deployment. */
  repairLauncher?: () => void;
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
 * @brief Tests whether one dotted version string parses into numeric release segments.
 * @details Splits the release part on `.`, accepting only integer segments; a trailing `-prerelease` suffix is stripped before segment validation so both release and prerelease candidates are parseable. Runtime is O(k) in segment count. Pure; no side effects.
 * @param[in] version {string} Candidate dotted version string.
 * @return {boolean} `true` when the release segments are all non-negative integers.
 * @note Complexity: O(k) in segment count. Pure; no side effects.
 */
function isParseablePackageManagerVersion(version: string): boolean {
  const releasePart = version.trim().split("-")[0] ?? "";
  return releasePart.split(".").every((segment) => /^\d+$/.test(segment));
}

/**
 * @brief Orders two dotted version strings with release-over-prerelease semantics.
 * @details Parses each input into integer release segments plus an optional prerelease suffix, compares numeric segments segment-by-segment with zero padding, then breaks ties by placing releases above prereleases and finally by lexicographic prerelease ordering; unparseable inputs sort below every parseable input. Runtime is O(k) in segment count. Pure; no side effects.
 * @param[in] left {string} Left dotted version string.
 * @param[in] right {string} Right dotted version string.
 * @return {number} Negative when `left` sorts before `right`, positive when after, `0` when equivalent.
 * @note Complexity: O(k) in segment count. Pure; no side effects.
 */
export function comparePackageManagerVersionOrder(left: string, right: string): number {
  const parse = (version: string): { segments: number[]; prerelease: string | null } | undefined => {
    const trimmed = version.trim();
    const separatorIndex = trimmed.indexOf("-");
    const releasePart = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;
    const segments = releasePart.split(".").map((segment) =>
      /^\d+$/.test(segment) ? Number(segment) : Number.NaN,
    );
    if (segments.some((segment) => !Number.isInteger(segment))) {
      return undefined;
    }
    return { segments, prerelease: separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : null };
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (leftParts === undefined || rightParts === undefined) {
    if (leftParts === rightParts) return 0;
    return leftParts === undefined ? -1 : 1;
  }
  const length = Math.max(leftParts.segments.length, rightParts.segments.length);
  for (let index = 0; index < length; index += 1) {
    const leftSegment = leftParts.segments[index] ?? 0;
    const rightSegment = rightParts.segments[index] ?? 0;
    if (leftSegment !== rightSegment) {
      return leftSegment < rightSegment ? -1 : 1;
    }
  }
  if (leftParts.prerelease === rightParts.prerelease) {
    return (leftParts.prerelease ?? "").localeCompare(rightParts.prerelease ?? "");
  }
  return leftParts.prerelease === null ? 1 : -1;
}

/**
 * @brief Resolves the highest semver-ordered version from one candidate list.
 * @details Filters out empty and unparseable candidates, then selects the maximum through `comparePackageManagerVersionOrder(...)` so releases outrank equal-numeric prereleases. Runtime is O(n * k) in candidate count and segment count. Pure; no side effects.
 * @param[in] versions {readonly string[]} Candidate dotted version strings.
 * @return {string | undefined} Highest parseable candidate, or `undefined` when none is parseable.
 * @note Complexity: O(n * k). Pure; no side effects.
 * @see comparePackageManagerVersionOrder
 */
export function resolveHighestPackageManagerVersion(
  versions: readonly string[],
): string | undefined {
  let highest: string | undefined;
  for (const version of versions) {
    const candidate = version.trim();
    if (!candidate || !isParseablePackageManagerVersion(candidate)) {
      continue;
    }
    if (highest === undefined || comparePackageManagerVersionOrder(candidate, highest) > 0) {
      highest = candidate;
    }
  }
  return highest;
}

/**
 * @brief Resolves the npmjs latest version from one registry package manifest document.
 * @details Follows the npm best-practice resolution order: a non-empty `dist-tags.latest` string defines the canonical npmjs latest version; otherwise the highest semver-ordered entry of the manifest `versions` map is selected so releases outrank equal-numeric prereleases; every other payload shape resolves to `undefined`. Runtime is O(v * k) over manifest version keys. Pure; no side effects.
 * @param[in] payload {unknown} Parsed npmjs package manifest document (packument).
 * @return {string | undefined} Resolved latest version text, or `undefined` when the manifest exposes neither field.
 * @note Complexity: O(v * k) in manifest version count and segment count. Pure; no side effects.
 * @see resolveHighestPackageManagerVersion
 * @satisfies REQ-489
 */
export function resolvePackageManagerManifestLatest(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const distTags = record["dist-tags"];
  if (typeof distTags === "object" && distTags !== null) {
    const latest = (distTags as Record<string, unknown>).latest;
    if (typeof latest === "string" && latest.trim() !== "") {
      return latest.trim();
    }
  }
  const versions = record.versions;
  if (typeof versions === "object" && versions !== null) {
    return resolveHighestPackageManagerVersion(Object.keys(versions));
  }
  return undefined;
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
 * @brief Probes the npmjs package manifest document for the latest published package version.
 * @details Logging-free resolution order: installed-version guard (missing `currentVersion` returns `unknown-version` with zero network calls) -> single `GET {registry}/{package}` fetching the npmjs package manifest document (packument) backing `https://www.npmjs.com/package/{package}` with the timeout deadline -> `response.ok` validation -> `resolvePackageManagerManifestLatest(...)` dist-tags/versions resolution -> `isNewerPackageManagerVersion` gate; both `newer` and `current` outcomes carry the resolved manifest latest version so reporting never substitutes the installed version. Every failure is returned as a discriminated outcome; never throws.
 * @param[in] deps {PackageManagerRegistryProbeDeps} Optional dependency overrides; production defaults when omitted.
 * @return {Promise<PackageManagerRegistryProbe>} Discriminated probe outcome carrying the manifest latest version; `message` carries the final diagnostic text without logging.
 * @note Complexity: one HTTP round-trip bounded by the timeout deadline.
 * @satisfies REQ-477, REQ-489
 * @see resolvePackageManagerManifestLatest
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
    const response = await fetchImpl(`${registryBaseUrl}/${packageName}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { status: "error", message: `registry responded with HTTP ${response.status}.` };
    }
    const payload = (await response.json()) as unknown;
    const latestVersion = resolvePackageManagerManifestLatest(payload);
    if (latestVersion === undefined) {
      return { status: "error", message: "registry manifest exposes no latest version." };
    }
    if (!isNewerPackageManagerVersion(latestVersion, currentVersion)) {
      return { status: "current", currentVersion, latestVersion };
    }
    return { status: "newer", currentVersion, latestVersion };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message };
  }
}

/**
 * @brief Extracts the upstream failure reason from one GitHub error response body.
 * @details Parses the failing response body as JSON and accepts only a non-empty string `message` field as the upstream reason, returning `undefined` for non-JSON bodies, malformed payloads, or missing messages so the probe outcome stays deterministic without exposing the response-read failure itself. Runtime is O(n) in body size. Never throws.
 * @param[in] response {Response} Failing HTTP response whose body should be inspected.
 * @return {Promise<string | undefined>} Upstream failure reason when extractable; otherwise `undefined`.
 * @note Complexity: O(n) in body size.
 * @satisfies REQ-503
 */
async function resolveGitHubProbeFailureReason(response: Response): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * @brief Probes the GitHub releases API for the latest published release version.
 * @details Logging-free resolution order: single `GET {releasesUrl}` with the timeout deadline and the GitHub-mandatory `user-agent` header -> `response.ok` validation -> upstream failure-reason capture from the error-response `message` field -> `payload.tag_name` validation -> leading `v` prefix strip. Never consults any persisted cache; callers own the manual-command context. Every failure is returned as a discriminated outcome carrying the deterministic HTTP-status diagnostic plus the optional upstream `reason`; never throws.
 * @param[in] deps {PackageManagerGitHubProbeDeps} Optional dependency overrides; production defaults when omitted.
 * @return {Promise<PackageManagerGitHubProbe>} `ok` with the stripped version text plus the raw `tag_name`, or `error` with the diagnostic message plus the optional captured upstream failure reason.
 * @note Complexity: O(n) in tag length plus one HTTP round-trip bounded by the timeout deadline.
 * @satisfies REQ-477, REQ-478, REQ-503
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
      const reason = await resolveGitHubProbeFailureReason(response);
      return {
        status: "error",
        message: `GitHub releases API responded with HTTP ${response.status}.`,
        ...(reason ? { reason } : {}),
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
 * @brief Maps one registry probe outcome to its manifest latest-version text.
 * @details `newer` and `current` both map to the resolved npmjs manifest latest version carried by the probe, so an installed version newer than the published latest still reports the published latest verbatim; every other outcome maps to the `unknown` placeholder. Pure; never throws.
 * @param[in] probe {PackageManagerRegistryProbe} Logging-free registry probe outcome.
 * @return {string} Latest npmjs-manifest version text, or `unknown`.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-475, REQ-489
 */
function resolveRegistryProbeLatestVersionText(probe: PackageManagerRegistryProbe): string {
  if (probe.status === "newer" || probe.status === "current") {
    return probe.latestVersion;
  }
  return PACKAGE_MANAGER_UNKNOWN_VERSION;
}

/**
 * @brief Maps one GitHub probe outcome to its version-report text.
 * @details `ok` maps to the stripped release version; failed outcomes map to `unknown (<reason>)` when the probe captured an upstream failure reason and to the plain `unknown` placeholder when it did not, so rate-limited or otherwise rejected GitHub requests surface the actual upstream error verbatim. Pure; never throws.
 * @param[in] probe {PackageManagerGitHubProbe} Logging-free GitHub probe outcome.
 * @return {string} GitHub-latest report text.
 * @note Complexity: O(1) plus reason length. Pure; no side effects.
 * @satisfies REQ-475, REQ-476, REQ-502
 */
function resolveGitHubProbeLatestVersionText(probe: PackageManagerGitHubProbe): string {
  if (probe.status === "ok") {
    return probe.version;
  }
  if (probe.reason) {
    return `${PACKAGE_MANAGER_UNKNOWN_VERSION} (${probe.reason})`;
  }
  return PACKAGE_MANAGER_UNKNOWN_VERSION;
}

/**
 * @brief Fixed right-padded label column width of the `--ver`/`--version` version report.
 * @details Equals the longest report label `Current Installed` plus one trailing space (18 characters), so the three report labels fill the same column width and every `:` separator starts at the same column per REQ-529.
 */
const PACKAGE_MANAGER_VERSION_REPORT_LABEL_WIDTH = "Current Installed ".length;

/**
 * @brief Formats one aligned `--ver`/`--version` report line.
 * @details Right-pads the supplied report label with spaces to the fixed 18-character `Current Installed ` column width so every `:` separator and version number aligns vertically across the three report lines, then appends `: ` plus the version text verbatim. Labels longer than the column keep their full text without truncation. Pure; no side effects.
 * @param[in] label {string} Report label such as `Current Installed`, `Latest @ NPMjs`, or `Latest @ GitHub`.
 * @param[in] versionText {string} Resolved version text, including `unknown (<reason>)` GitHub failure renderings.
 * @return {string} One aligned report line without a trailing newline; the caller joins the three lines with `\n`.
 * @note Complexity: O(n) in label length. Pure; no side effects.
 * @satisfies REQ-475, REQ-529
 */
function formatPackageManagerVersionReportLine(label: string, versionText: string): string {
  return `${label.padEnd(PACKAGE_MANAGER_VERSION_REPORT_LABEL_WIDTH)}: ${versionText}`;
}

/**
 * @brief Detects an exact management-command argv shape in a raw argv array.
 * @details Single-token shape: exactly one of `--ver`, `--version`, `--upgrade`, `--uninstall`, and `--help`. Two-token shapes: `--upgrade` paired with the `--develop` option, its equivalent `--dev` alias, or the `--force` auxiliary option, or `--help` paired with one documented help topic, in either order. Three-token shapes: `--upgrade`, `--force`, and the `--develop` option or its `--dev` alias in any order. Any other shape yields `undefined` so standard flag dispatch stays untouched.
 * @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
 * @return {PackageManagerCommandName | undefined} Canonical command name, or `undefined` when no management shape matches.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-473, REQ-511, REQ-524, REQ-525
 */
export function parsePackageManagerCommand(
  args: readonly string[],
): PackageManagerCommandName | undefined {
  if (args.length === 1) {
    const arg = args[0];
    if (arg === "--ver" || arg === "--version" || arg === "--upgrade") {
      return arg;
    }
    if (arg === "--uninstall" || arg === "--help") {
      return arg;
    }
    return undefined;
  }
  if (args.length === 2) {
    const hasUpgrade = args.includes("--upgrade");
    const hasDevelop = args.includes("--develop") || args.includes("--dev");
    if (hasUpgrade && (hasDevelop || args.includes("--force"))) {
      return "--upgrade";
    }
    if (parsePackageManagerHelpTopic(args) !== undefined) {
      return "--help";
    }
  }
  if (
    args.length === 3 &&
    args.includes("--upgrade") &&
    args.includes("--force") &&
    (args.includes("--develop") || args.includes("--dev")) &&
    args.every((token) =>
      token === "--upgrade" || token === "--dev" || token === "--develop" || token === "--force"
    )
  ) {
    return "--upgrade";
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
 * @brief Resolves the `--force` auxiliary option from a raw argv array.
 * @details Returns `true` only when the argv contains the `--force` auxiliary token accepted by the `--upgrade` management shapes; every other management command ignores the token because non-upgrade `--force` shapes never match a management command and fall through to standard flag parsing. Pure; no side effects.
 * @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
 * @return {boolean} `true` when the `--force` auxiliary option is present.
 * @note Complexity: O(n) in argv length. Pure; no side effects.
 * @satisfies REQ-524, REQ-525
 */
export function parsePackageManagerForceFlag(args: readonly string[]): boolean {
  return args.includes("--force");
}

/**
 * @brief Resolves the `--help` topic operand from a raw argv array.
 * @details Accepts exactly two tokens where one is `--help` and the other is one of `--upgrade`, `--dev`, `--develop`, `--uninstall`, `--ver`, or `--version`, in either order, returning the topic token; every other shape, including a doubled `--help`, yields `undefined` so the full help screen stays selected.
 * @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
 * @return {PackageManagerHelpTopic | undefined} Requested help topic, or `undefined` when absent.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-511
 */
export function parsePackageManagerHelpTopic(
  args: readonly string[],
): PackageManagerHelpTopic | undefined {
  if (args.length !== 2 || !args.includes("--help")) {
    return undefined;
  }
  const candidate = args.find((token) => token !== "--help");
  if (
    candidate === "--upgrade" ||
    candidate === "--dev" ||
    candidate === "--develop" ||
    candidate === "--uninstall" ||
    candidate === "--ver" ||
    candidate === "--version"
  ) {
    return candidate;
  }
  return undefined;
}

/**
 * @brief Normalizes one resolved package-version text value.
 * @details Trims surrounding whitespace and maps every empty value to `PACKAGE_MANAGER_UNKNOWN_VERSION` so reports never emit a blank version field. Runtime is O(n) in value length. Pure; no side effects.
 * @param[in] value {string} Candidate version text.
 * @return {string} Trimmed version text, or `unknown` when empty.
 * @note Complexity: O(n) in value length. Pure; no side effects.
 * @satisfies REQ-476, REQ-647
 */
function normalizePackageManagerVersionText(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : PACKAGE_MANAGER_UNKNOWN_VERSION;
}

/**
 * @brief Resolves the pi-usereq version exposed by the pi-managed installations.
 * @details Probes the pi-managed git installation root `<agent-dir>/git/github.com/Ogekuri/PI-useReq` first and the pi-managed npm installation root `<agent-dir>/npm/node_modules/pi-usereq` second, returning the first readable `<packageRoot>/package.json` version so a source-checkout invocation can report the pi-managed installation instead of the checkout image. Every read is uncached so a preceding pi CLI child is observed immediately. Runtime is O(n) in aggregate manifest size. Side effects are limited to filesystem reads.
 * @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
 * @return {string | undefined} Trimmed pi-managed package version, or `undefined` when neither root exposes a readable version.
 * @note Complexity: O(n) in aggregate manifest size.
 * @satisfies REQ-487, REQ-647
 */
export function resolvePiManagedPackageManagerVersion(
  homeDirImpl: () => string = homedir,
): string | undefined {
  const candidates = [
    resolvePackageManagerChannelInstallRoot("develop", homeDirImpl),
    resolvePackageManagerChannelInstallRoot("npm", homeDirImpl),
  ];
  for (const candidate of candidates) {
    const version = readPackageManagerPackageRootVersion(candidate);
    if (version !== undefined) {
      return version;
    }
  }
  return undefined;
}

/**
 * @brief Resolves one reported installed version through the pi-managed-first rule.
 * @details Uses the supplied executing-installation reader verbatim when the executing installation is pi-managed, because that installation owns the authoritative manifest; otherwise prefers the pi-managed installation version and falls back to the executing-installation reader, so a source checkout reports the pi-managed installation while a genuine managed installation reports itself. Runtime is O(n) in manifest size. Side effects are limited to filesystem reads delegated to the readers.
 * @param[in] executingVersionReader {() => string} Uncached reader for the executing installation version.
 * @return {string} Normalized reported version text.
 * @note Complexity: O(n) in manifest size.
 * @satisfies REQ-487, REQ-647, REQ-648
 */
function resolveReportedPackageManagerVersion(executingVersionReader: () => string): string {
  if (resolveInstalledPackageManagerSource().kind === "unknown") {
    const piManagedVersion = resolvePiManagedPackageManagerVersion();
    if (piManagedVersion !== undefined) {
      return normalizePackageManagerVersionText(piManagedVersion);
    }
  }
  return normalizePackageManagerVersionText(executingVersionReader());
}

/**
 * @brief Resolves the installed package version backing the management commands.
 * @details Applies the pi-managed-first rule: a pi-managed executing installation reports its own installation-owned `version` field, while a non-pi-managed executing installation (source checkout, global npm install, offline harness) reports the pi-managed git root, then the pi-managed npm root, and only then its own manifest. Every undeterminable value degrades to `unknown` so the version report never emits a blank field. Runtime is O(n) in manifest size. Side effects are limited to filesystem reads.
 * @return {string} Installed package version, or `unknown`.
 * @satisfies REQ-475, REQ-487, REQ-647, REQ-648
 */
export function resolvePackageManagerInstalledVersion(): string {
  return resolveReportedPackageManagerVersion(() => getInstallationPackageMetadata().version);
}

/**
 * @brief Resolves the pi agent directory backing the managed package install roots.
 * @details Honors the pi `PI_CODING_AGENT_DIR` environment override with leading-tilde expansion and falls back to `<user-home>/.pi/agent`, mirroring the pi CLI package-manager install-root contract used for npm and git sources. Runtime is O(p) in path length. Pure; no side effects.
 * @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
 * @return {string} Absolute pi agent directory path.
 * @note Complexity: O(p) in path length. Pure; no side effects.
 */
function resolvePiAgentDir(homeDirImpl: () => string = homedir): string {
  const homeDir = homeDirImpl();
  const agentDirEnv = process.env[PI_CODING_AGENT_DIR_ENV];
  if (agentDirEnv === undefined || agentDirEnv.trim() === "") {
    return path.join(homeDir, ".pi", "agent");
  }
  const trimmed = agentDirEnv.trim();
  const expanded = trimmed === "~"
    ? homeDir
    : trimmed.startsWith("~/") || trimmed.startsWith(`~${path.sep}`)
      ? path.join(homeDir, trimmed.slice(2))
      : trimmed;
  return path.resolve(expanded);
}

/**
 * @brief Resolves the installation package root owned by one `--upgrade` channel target source.
 * @details Derives the post-switch installation root from the pi-managed agent directory plus the channel target source contract: `npm:pi-usereq` resolves to `<agent-dir>/npm/node_modules/pi-usereq` and `git:github.com/Ogekuri/PI-useReq` resolves to `<agent-dir>/git/github.com/Ogekuri/PI-useReq`. The executing `pi remove` child deletes the source installation that owns the running process, so post-switch launcher repair and post-switch version reporting MUST address the target root instead of the runtime installation path. Runtime is O(p) in path length. Pure; no side effects.
 * @param[in] channel {PackageManagerUpgradeChannel} Selected upgrade channel.
 * @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
 * @return {string} Absolute package root of the channel target installation.
 * @note Complexity: O(p) in path length. Pure; no side effects.
 * @satisfies REQ-484, REQ-504, REQ-613
 */
export function resolvePackageManagerChannelInstallRoot(
  channel: PackageManagerUpgradeChannel,
  homeDirImpl: () => string = homedir,
): string {
  const agentDir = resolvePiAgentDir(homeDirImpl);
  if (channel === "develop") {
    const gitSegments = PACKAGE_MANAGER_GIT_SOURCE
      .replace(/^git:/, "")
      .split("/")
      .filter((segment) => segment.length > 0);
    return path.join(agentDir, "git", ...gitSegments);
  }
  return path.join(agentDir, "npm", "node_modules", PACKAGE_MANAGER_PACKAGE_NAME);
}

/**
 * @brief Repairs the deployed agent-bin `pi-usereq` launcher after one successful upgrade child.
 * @details Repairs the launcher only for genuine pi-package installations so source checkouts, offline harnesses, and deterministic tests never touch the developer home, then re-deploys the `pi-usereq` symlink against the executing installation. A `pi update` child rewrites the managed dependency tree, so re-verifying the launcher after a successful child keeps the management CLI resolvable instead of leaving a dangling link that forces the user onto a stale foreign shim. Runtime is O(p) in path length plus bounded filesystem metadata calls. Side effects include conditional symlink creation or replacement inside the pi agent bin directory.
 * @return {void} No return value.
 * @note Complexity: O(p) in path length plus bounded filesystem metadata calls.
 * @satisfies REQ-504, REQ-505, REQ-506, REQ-507
 */
function defaultRepairPackageManagerLauncher(): void {
  const installationRoot = path.resolve(getInstallationPath(), "..");
  if (!isPiPackageInstallation(installationRoot)) {
    return;
  }
  deployPiUsereqLauncher({ installationPath: installationRoot });
}

/**
 * @brief Reads the version field of one installation-owned package manifest.
 * @details Parses `<packageRoot>/package.json` and accepts only a non-empty string `version` field so undeterminable manifests degrade to `undefined`. Runtime is O(n) in manifest size. Side effects are limited to one filesystem read.
 * @param[in] packageRoot {string} Absolute installation package root.
 * @return {string | undefined} Trimmed package version, or `undefined` when the manifest is missing, malformed, or exposes no usable version.
 * @note Complexity: O(n) in manifest size.
 * @satisfies REQ-484
 */
function readPackageManagerPackageRootVersion(packageRoot: string): string | undefined {
  try {
    const payload = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    ) as { version?: unknown };
    if (typeof payload.version === "string" && payload.version.trim() !== "") {
      return payload.version.trim();
    }
  } catch {
    // Degrade to an undeterminable version.
  }
  return undefined;
}

/**
 * @brief Identifies the package source of the executing pi-usereq installation.
 * @details Classifies the runtime installation path against the pi-managed user-scope install roots: `<agent-dir>/npm/node_modules/pi-usereq` resolves to the npm source token, `<agent-dir>/git` resolves to a git source token derived as `git:<host>/<owner>/<repository>` from the path relative to `<agent-dir>/git`, and every other location reports `unknown` so source checkouts, global npm installs, and project-scope installs never trigger a package removal. Runtime is O(p) in path length. Pure; no side effects.
 * @param[in] installationPath {string} Candidate installation root. Defaults to the runtime installation path.
 * @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
 * @return {PackageManagerInstalledPackage} Identified npm-managed, git-managed, or unknown source facts.
 * @note Complexity: O(p) in path length. Pure; no side effects.
 * @satisfies REQ-609, REQ-610, REQ-611, REQ-612
 */
export function resolveInstalledPackageManagerSource(
  installationPath: string = getInstallationPath(),
  homeDirImpl: () => string = homedir,
): PackageManagerInstalledPackage {
  const resolved = path.resolve(installationPath);
  const agentDir = resolvePiAgentDir(homeDirImpl);
  const npmRoot = path.join(agentDir, "npm", "node_modules", PACKAGE_MANAGER_PACKAGE_NAME);
  if (isSameOrAncestorPath(npmRoot, resolved)) {
    return { kind: "npm", source: PACKAGE_MANAGER_NPM_SOURCE };
  }
  const gitRoot = path.join(agentDir, "git");
  if (isSameOrAncestorPath(gitRoot, resolved)) {
    const segments = path
      .relative(gitRoot, resolved)
      .split(path.sep)
      .filter((segment) => segment.length > 0);
    const source = segments.length >= 3
      ? `git:${segments[0]}/${segments[1]}/${segments[2]}`
      : PACKAGE_MANAGER_GIT_SOURCE;
    return { kind: "git", source };
  }
  return { kind: "unknown" };
}

/**
 * @brief Builds the pi CLI package-removal command for one identified source.
 * @details Emits `pi remove <source>` because the documented pi CLI package command removes a package together with its settings entry. Runtime is O(1). Pure; no side effects.
 * @param[in] source {string} Identified pi package source token.
 * @return {readonly string[]} Package-removal command vector.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-614
 */
export function buildPackageManagerRemoveCommand(source: string): readonly string[] {
  return ["pi", "remove", source];
}

/**
 * @brief Builds the pi CLI package-installation command for one target source.
 * @details Emits `pi install <source>`; the handler uses it both after a channel-switch removal and as the develop-channel reconciliation child, whose install rewrites the same-identity `packages` settings entry and resets the existing pi-managed checkout to the resolved tag commit. Runtime is O(1). Pure; no side effects.
 * @param[in] source {string} Target pi package source token.
 * @return {readonly string[]} Package-installation command vector.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-482, REQ-617, REQ-641, REQ-644, REQ-645
 */
export function buildPackageManagerInstallCommand(source: string): readonly string[] {
  return ["pi", "install", source];
}

/**
 * @brief Resolves the pi package source targeted by one `--upgrade` channel.
 * @details Maps the default channel onto the npm-managed source `npm:pi-usereq` and the develop channel onto the ref-pinned git source `git:github.com/Ogekuri/PI-useReq@<tag>` when a resolved release tag is supplied, falling back to the unpinned base git source only for callers that resolve no tag. Runtime is O(1). Pure; no side effects.
 * @param[in] channel {PackageManagerUpgradeChannel} Selected upgrade channel.
 * @param[in] developTag {string | undefined} Raw GitHub release `tag_name` resolved for the develop channel.
 * @return {string} Target pi package source token.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-613
 */
export function resolvePackageManagerUpgradeSource(
  channel: PackageManagerUpgradeChannel,
  developTag?: string,
): string {
  if (channel !== "develop") {
    return PACKAGE_MANAGER_NPM_SOURCE;
  }
  return developTag === undefined
    ? PACKAGE_MANAGER_GIT_SOURCE
    : buildPackageManagerDevelopSource(developTag);
}

/**
 * @brief Tests whether one upgrade run must remove the installed package before installing the target source.
 * @details Requires a resolvable installed source whose kind differs from the channel target kind, so equal sources keep the documented update process and `unknown` installations never trigger a removal. Runtime is O(1). Pure; no side effects.
 * @param[in] installed {PackageManagerInstalledPackage} Identified installed package source.
 * @param[in] channel {PackageManagerUpgradeChannel} Selected upgrade channel.
 * @return {boolean} `true` when the installed package must be removed before installation.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-614, REQ-615
 */
export function requiresPackageManagerSourceSwitch(
  installed: PackageManagerInstalledPackage,
  channel: PackageManagerUpgradeChannel,
): boolean {
  const targetKind = channel === "develop" ? "git" : "npm";
  return installed.kind !== "unknown" && installed.kind !== targetKind;
}

/**
 * @brief Removes the identified installed package and installs the target source.
 * @details Runs `pi remove <identified-source>` first and returns its non-zero exit code without running the installation child, otherwise runs `pi install <target-source>` and returns its exit code so a channel switch leaves exactly one configured package source. Runtime is dominated by up to two child-process executions. Side effects include package removal, package installation, and inherited child stdio.
 * @param[in] installed {PackageManagerInstalledPackage} Identified installed package source.
 * @param[in] targetSource {string} Target pi package source token.
 * @param[in] deps {PackageManagerCommandDeps} Optional spawner and logger overrides.
 * @return {number} Removal or installation child exit code; `0` on success.
 * @note Complexity: dominated by up to two child-process executions.
 * @satisfies REQ-614, REQ-616, REQ-617
 */
function switchPackageManagerSource(
  installed: PackageManagerInstalledPackage,
  targetSource: string,
  deps: PackageManagerCommandDeps,
): number {
  if (installed.source === undefined) {
    return 0;
  }
  const removed = runPackageManagerChildCommand(
    buildPackageManagerRemoveCommand(installed.source),
    deps,
  );
  if (removed !== 0) {
    return removed;
  }
  return runPackageManagerChildCommand(buildPackageManagerInstallCommand(targetSource), deps);
}

/**
 * @brief Runs one package-manager command as a child process with inherited stdio.
 * @details Spawns `command[0]` with the remaining tokens, inheriting stdio so npm and pi output streams through unchanged; Windows spawns run through a shell so `npm.cmd` and `pi.cmd` resolve via `PATHEXT`. The child runs with an explicit neutral working directory (the user home), never the caller's cwd, because management installs are routinely invoked from inside a source checkout of the same package being replaced. Spawn failures print the error plus the exact manual command hint on stderr and map to exit code `1`; otherwise the child exit code propagates (`null` status maps to `1`).
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
 * @brief Handles `--ver`/`--version`: dual online probe plus three-line aligned version report.
 * @details Runs the npm-registry probe and the GitHub-releases probe concurrently, bypassing every persisted cache, then writes exactly three stdout lines — `Current Installed : <installed>`, `Latest @ NPMjs    : <npmjs>`, `Latest @ GitHub   : <github>` — with labels right-padded to the fixed 18-character column so `:` separators and version numbers align, and returns `0`. Undeterminable versions print as `unknown`, and a failed GitHub probe carrying a captured upstream failure reason prints `Latest @ GitHub   : unknown (<reason>)` reflecting the actual error such as an API rate-limit response.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version.
 * @param[in] deps {PackageManagerCommandDeps} Optional registry/GitHub/stdout overrides.
 * @return {Promise<number>} Exit code `0`.
 * @note Complexity: two concurrent HTTP round-trips bounded by the probe timeout.
 * @satisfies REQ-473, REQ-475, REQ-476, REQ-502, REQ-529
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
  const githubLatest = resolveGitHubProbeLatestVersionText(githubProbe);
  const stdout = deps.stdout ?? defaultPackageManagerStdout;
  stdout.write(
    [
      formatPackageManagerVersionReportLine("Current Installed", installedVersion),
      formatPackageManagerVersionReportLine("Latest @ NPMjs", registryLatest),
      formatPackageManagerVersionReportLine("Latest @ GitHub", githubLatest),
    ].join("\n") + "\n",
  );
  return 0;
}

/**
 * @brief Reads the post-upgrade installed version through the pi-managed-first rule.
 * @details Re-reads the pi-managed git root, then the pi-managed npm root, and only then the executing installation package manifest bypassing the process cache, so the version written on disk by the pi CLI child is observed instead of the cached pre-upgrade value even when the command runs from a source checkout. Runtime is dominated by one filesystem read. Side effects are limited to the shared executing-installation metadata-cache refresh.
 * @return {string} Freshly read reported version; `unknown` when no manifest is readable.
 * @satisfies REQ-484, REQ-487, REQ-647
 */
function defaultResolveUpgradedPackageManagerVersion(): string {
  return resolveReportedPackageManagerVersion(
    () => refreshInstallationPackageMetadata().version,
  );
}

/**
 * @brief Resolves the updated package version reported by the upgrade summary.
 * @details Prefers the injected post-upgrade resolver for deterministic callers; otherwise reads the version from the supplied post-switch target installation root when one is provided, because the source-switch removal child deletes the installation that owns the running process; otherwise re-reads the pi-managed-first reported version. Trims the result and maps every empty or undeterminable value to `unknown` so the summary never reports a blank version. Never throws.
 * @param[in] deps {PackageManagerCommandDeps} Optional resolver override.
 * @param[in] installationRoot {string | undefined} Absolute post-switch target installation root. Defaults to the runtime installation path when omitted.
 * @return {string} Updated version string; `unknown` when undeterminable.
 * @note Complexity: one filesystem read through the default or target-root resolver.
 * @satisfies REQ-484
 */
function resolveUpdatedPackageManagerVersion(
  deps: PackageManagerCommandDeps,
  installationRoot?: string,
): string {
  if (deps.resolveUpgradedVersion !== undefined) {
    const injected = deps.resolveUpgradedVersion().trim();
    return injected.length > 0 ? injected : PACKAGE_MANAGER_UNKNOWN_VERSION;
  }
  if (installationRoot !== undefined) {
    return readPackageManagerPackageRootVersion(installationRoot) ?? PACKAGE_MANAGER_UNKNOWN_VERSION;
  }
  const resolved = defaultResolveUpgradedPackageManagerVersion().trim();
  return resolved.length > 0 ? resolved : PACKAGE_MANAGER_UNKNOWN_VERSION;
}

/**
 * @brief Reports one successful upgrade child through the completion summary and unchanged-version warning.
 * @details Resolves the post-child installed version through the injected resolver, the supplied post-switch target installation root, or the pi-managed-first reported-version reader; writes the `pi-usereq upgrade completed: <starting> -> <updated>` stdout line; and emits one stderr warning for non-forced runs whose resolved version stays resolvable and equal to the starting version, signaling that the reconciliation child completed without changing the managed installation. Post-switch runs pass the target installation root because the removal child already deleted the installation that owned the running process. Runtime is dominated by the selected resolver's filesystem read.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed starting version and force mode.
 * @param[in] deps {PackageManagerCommandDeps} Optional resolver, logger, and stdout overrides.
 * @param[in] installationRoot {string | undefined} Absolute post-switch target installation root supplying `<updated>` when no resolver is injected.
 * @return {void} No return value.
 * @satisfies REQ-484, REQ-531
 */
function reportPackageManagerUpgradeCompletion(
  options: PackageManagerCommandOptions,
  deps: PackageManagerCommandDeps,
  installationRoot?: string,
): void {
  const stdout = deps.stdout ?? defaultPackageManagerStdout;
  const updatedVersion = resolveUpdatedPackageManagerVersion(deps, installationRoot);
  stdout.write(`pi-usereq upgrade completed: ${options.installedVersion} -> ${updatedVersion}\n`);
  if (
    options.force !== true &&
    updatedVersion !== PACKAGE_MANAGER_UNKNOWN_VERSION &&
    updatedVersion === options.installedVersion
  ) {
    (deps.logger ?? defaultPackageManagerLogger).log(
      `warning: pi-usereq installed version remained ${updatedVersion} after the pi update child; run 'pi-usereq --upgrade --force' to force reinstallation`,
    );
  }
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
 * @brief Handles `--upgrade`: installed-source identification, optional source-switch removal plus installation, force mode, pi-CLI package reinstall, then stdout summary.
 * @details Identifies the installed package source before any child process. When the identified source resolves to a different kind than the channel target source, the handler runs `pi remove <identified-source>` followed by `pi install <target-source>`, propagating a non-zero removal or installation exit code without printing a summary; after a successful switch it re-deploys the agent-bin `pi-usereq` launcher onto the channel target installation root and resolves the completion `<updated>` version from that target root, because the removal child already deleted the installation that owned the running process. The develop channel (`--dev`/`--develop`) first resolves `<tag>` through `probeLatestGitHubRelease(...)` and aborts with exit code `1` plus one stderr diagnostic without spawning any child when that probe fails; a successful probe then runs the tag-pinned `buildPackageManagerInstallCommand(buildPackageManagerDevelopSource(<tag>))` (`pi install git:github.com/Ogekuri/PI-useReq@<tag>`) with inherited stdio, because `pi install` rewrites the same-identity `packages` settings entry and resets the existing pi-managed checkout to the resolved tag commit, so the tag is reconciled even when the configured entry is unpinned and `pi update` would only follow the configured upstream. The default npm channel keeps one forced npmjs package-manifest probe bypassing every cache unless `--force` was supplied, where `current` writes the already-latest stdout line carrying the manifest latest version and returns `0` without spawning any child, and every other outcome runs `PACKAGE_UPGRADE_COMMAND` (`pi update npm:pi-usereq`) with inherited stdio so the already-installed managed package advances beyond its saved dependency range. `--force` therefore only skips the default-channel already-latest gate and never appends a pi CLI `--force` token, because that option affects only the pi CLI self-update path and provides no forced-reinstall semantics for extensions. Every same-source successful child repairs the deployed agent-bin `pi-usereq` launcher against the executing installation before reporting completion, because package children rewrite the managed dependency tree and a completed upgrade MUST NOT leave the management CLI dangling behind a stale foreign shim. Every successful child reports completion through `reportPackageManagerUpgradeCompletion(...)`, which resolves `<updated>` through the pi-managed-first installed-version rule, or from the post-switch target installation root after a source switch, and warns when a non-forced run leaves the installed version unchanged.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version, channel, and force mode.
 * @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger/registry/GitHub/stdout/source-resolver overrides.
 * @return {Promise<number>} `0` when the non-forced same-source installed version is already the latest available or after a successful source switch; `1` when the develop-channel release probe fails; otherwise the propagated child exit code.
 * @note Complexity: zero to two HTTP round-trips plus at most two child process executions.
 * @satisfies REQ-480, REQ-481, REQ-482, REQ-484, REQ-485, REQ-504, REQ-526, REQ-527, REQ-528, REQ-531, REQ-613, REQ-614, REQ-615, REQ-616, REQ-617, REQ-618, REQ-639, REQ-640, REQ-641, REQ-644, REQ-645, REQ-646, DES-026, DES-037
 */
export async function runPackageManagerUpgradeCommand(
  options: PackageManagerCommandOptions,
  deps: PackageManagerCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? defaultPackageManagerStdout;
  const logger = deps.logger ?? defaultPackageManagerLogger;
  const force = options.force === true;
  const channel = options.channel ?? "npm";
  const installed = (deps.resolveInstalledSource ?? resolveInstalledPackageManagerSource)();
  const developProbe =
    channel === "develop" ? await probeLatestGitHubRelease(deps.githubCheck) : undefined;
  if (developProbe !== undefined && developProbe.status !== "ok") {
    logger.error(
      `GitHub latest release probe failed: ${developProbe.message}${
        developProbe.reason === undefined ? "" : ` (${developProbe.reason})`
      }`,
    );
    return 1;
  }
  const developTag =
    developProbe !== undefined && developProbe.status === "ok" ? developProbe.tag : undefined;
  if (requiresPackageManagerSourceSwitch(installed, channel)) {
    const switched = switchPackageManagerSource(
      installed,
      resolvePackageManagerUpgradeSource(channel, developTag),
      deps,
    );
    if (switched !== 0) {
      return switched;
    }
    const targetInstallationRoot = resolvePackageManagerChannelInstallRoot(channel);
    deployPiUsereqLauncher({ installationPath: targetInstallationRoot });
    reportPackageManagerUpgradeCompletion(options, deps, targetInstallationRoot);
    return 0;
  }
  if (channel === "develop" && developTag !== undefined) {
    const upgraded = runPackageManagerChildCommand(
      buildPackageManagerInstallCommand(buildPackageManagerDevelopSource(developTag)),
      deps,
    );
    if (upgraded !== 0) {
      return upgraded;
    }
    (deps.repairLauncher ?? defaultRepairPackageManagerLauncher)();
    reportPackageManagerUpgradeCompletion(options, deps);
    return 0;
  }
  if (!force) {
    const precheck = await probeLatestRegistryVersion({
      ...deps.registryCheck,
      currentVersion: options.installedVersion,
    });
    if (!isPackageManagerUpgradeNecessary(precheck.status)) {
      stdout.write(
        `${PACKAGE_MANAGER_PACKAGE_NAME} ${options.installedVersion} is already the latest available version (npmjs latest: ${resolveRegistryProbeLatestVersionText(precheck)}).\n`,
      );
      return 0;
    }
  }
  const upgraded = runPackageManagerChildCommand(PACKAGE_UPGRADE_COMMAND, deps);
  if (upgraded !== 0) {
    return upgraded;
  }
  (deps.repairLauncher ?? defaultRepairPackageManagerLauncher)();
  reportPackageManagerUpgradeCompletion(options, deps);
  return 0;
}

/**
 * @brief Handles `--uninstall`: removes the globally installed package plus the deployed agent-bin and user-home bin launcher links.
 * @details Best-effort removes the `~/bin/pi-usereq` launcher link first when it resolves to the pi agent bin `pi-usereq` entry (leaving foreign entries untouched), then best-effort removes the `pi-usereq` agent-bin launcher symlink deployed by extension activation when it resolves inside the executing installation, then runs `npm uninstall -g pi-usereq` with inherited stdio and returns the child exit code; every removal failure and spawn failure map deterministically without changing the uninstall exit-code contract, and spawn failures map to exit code `1` with the manual command hint on stderr.
 * @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger overrides plus the injectable agent-bin and user-home bin launcher removers.
 * @return {number} Child exit code, or `1` when spawning failed.
 * @note Complexity: dominated by the child process execution.
 * @satisfies REQ-486, REQ-508, REQ-509, REQ-521, REQ-522, REQ-523, DES-031
 */
export function runPackageManagerUninstallCommand(deps: PackageManagerCommandDeps = {}): number {
  const removeUserBinLauncher = deps.removeUserBinLauncher ?? removeUserBinPiUsereqLauncher;
  removeUserBinLauncher();
  const removeLauncher = deps.removeLauncher ?? removeDeployedPiUsereqLauncher;
  removeLauncher();
  return runPackageManagerChildCommand(PACKAGE_UNINSTALL_COMMAND, deps);
}

/** Management help row rendered by the `--help` screen and topic help. */
interface PackageManagerHelpRow {
  /** Primary management token shown as the row label. */
  readonly token: "--upgrade" | "--dev" | "--uninstall" | "--ver" | "--version" | "--help";
  /** Single-line command description rendered after the token label. */
  readonly description: string;
}

/** Fixed-order management help rows backing the full `--help` screen and topic help. */
const PACKAGE_MANAGER_HELP_ROWS: readonly PackageManagerHelpRow[] = [
  {
    token: "--upgrade",
    description:
      "Update the installed pi-usereq through the pi CLI package manager; --force forces full re-download and reinstallation; print the manual command when spawning fails.",
  },
  {
    token: "--dev",
    description:
      "With --upgrade: update directly from the pi-usereq git repository instead of the npm registry (alias: --develop); combine with --force.",
  },
  {
    token: "--uninstall",
    description:
      "Uninstall the global pi-usereq npm package; print the manual command when spawning fails.",
  },
  {
    token: "--ver",
    description: "Print the pi-usereq version plus latest npmjs and GitHub versions.",
  },
  {
    token: "--version",
    description: "Print the pi-usereq version plus latest npmjs and GitHub versions.",
  },
  {
    token: "--help",
    description: "Print the full help screen or the help text of a specific command.",
  },
];

/** Rendered width of the longest management help token, aligning every help row description. */
const PACKAGE_MANAGER_HELP_TOKEN_WIDTH = Math.max(
  ...PACKAGE_MANAGER_HELP_ROWS.map((row) => row.token.length),
);

/**
 * @brief Formats one management help row as an indented `<token> - <description>` line.
 * @details Left-pads the row token to the longest management token width so every description aligns in one column. Runtime is O(n) in description length. Pure; no side effects.
 * @param[in] row {PackageManagerHelpRow} Management help row to format.
 * @return {string} Formatted help row line prefixed with two leading spaces.
 */
function formatPackageManagerHelpRow(row: PackageManagerHelpRow): string {
  return `  ${row.token.padEnd(PACKAGE_MANAGER_HELP_TOKEN_WIDTH)} - ${row.description}`;
}

/**
 * @brief Builds the full `--help` screen for one installed version.
 * @details Emits the usage header `Usage: pi-usereq [command] [options] (<version>)`, one blank line, the `Management Commands:` heading, and the fixed-order management help rows, each formatted `<token> - <description>`, terminated by one trailing newline. An empty installed version degrades to the `unknown` placeholder.
 * @param[in] installedVersion {string} Installed package version rendered inside the usage header parentheses.
 * @return {string} Complete multi-line help screen text.
 * @note Complexity: O(n) in aggregate row length. Pure; no side effects.
 * @satisfies REQ-512, REQ-513
 */
export function buildPackageManagerHelpScreen(installedVersion: string): string {
  const usageLine = `Usage: ${PACKAGE_MANAGER_PACKAGE_NAME} [command] [options] (${
    installedVersion || PACKAGE_MANAGER_UNKNOWN_VERSION
  })`;
  const lines = [
    usageLine,
    "",
    "Management Commands:",
    ...PACKAGE_MANAGER_HELP_ROWS.map((row) => formatPackageManagerHelpRow(row)),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Builds the single-row help text for one management topic token.
 * @details Maps the `--develop` alias onto the primary `--dev` row and returns only that management help row line with one trailing newline, so `--help <topic>` output stays limited to the requested command.
 * @param[in] topic {PackageManagerHelpTopic} Requested management help topic token.
 * @return {string} Formatted single help row line, or the empty string when no row matches.
 * @note Complexity: O(1) in row count. Pure; no side effects.
 * @satisfies REQ-514
 */
export function buildPackageManagerHelpTopicText(topic: PackageManagerHelpTopic): string {
  const rowToken: PackageManagerHelpRow["token"] = topic === "--develop" ? "--dev" : topic;
  const row = PACKAGE_MANAGER_HELP_ROWS.find((entry) => entry.token === rowToken);
  return row === undefined ? "" : `${formatPackageManagerHelpRow(row)}\n`;
}

/**
 * @brief Handles `--help`: full help screen or single management topic row.
 * @details Writes the full help screen to stdout when no topic option is supplied, or only the management help row of the requested topic token when one is supplied, and returns `0`. Executes no network probe and no package-manager child process.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version and optional help topic.
 * @param[in] deps {PackageManagerCommandDeps} Optional stdout overrides.
 * @return {Promise<number>} Exit code `0`.
 * @note Complexity: O(1). Pure aside from the delegated stdout write.
 * @satisfies REQ-512, REQ-513, REQ-514
 */
export async function runPackageManagerHelpCommand(
  options: PackageManagerCommandOptions,
  deps: PackageManagerCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? defaultPackageManagerStdout;
  if (options.helpTopic !== undefined) {
    stdout.write(buildPackageManagerHelpTopicText(options.helpTopic));
    return 0;
  }
  stdout.write(buildPackageManagerHelpScreen(options.installedVersion));
  return 0;
}

/**
 * @brief Dispatches one management command to its handler.
 * @details Single dispatch surface for the CLI entry intercept: `--ver`/`--version` routes to `runPackageManagerVersionCommand`, `--upgrade` routes to `runPackageManagerUpgradeCommand` honoring the forwarded channel and force options, `--uninstall` routes to `runPackageManagerUninstallCommand`, and `--help` routes to `runPackageManagerHelpCommand` honoring the forwarded topic option.
 * @param[in] command {PackageManagerCommandName} Canonical management command name.
 * @param[in] options {PackageManagerCommandOptions} Options carrying the installed version, upgrade channel, and force mode.
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
    case "--help":
      return runPackageManagerHelpCommand(options, deps);
  }
}
