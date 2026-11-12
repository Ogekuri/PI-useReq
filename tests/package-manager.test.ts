import assert from "node:assert/strict";
import fs from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import {
  PACKAGE_DEVELOP_UPGRADE_COMMAND,
  PACKAGE_FORCED_DEVELOP_UPGRADE_COMMAND,
  PACKAGE_FORCED_UPGRADE_COMMAND,
  PACKAGE_MANAGER_GITHUB_RELEASES_API_URL,
  PACKAGE_MANAGER_GITHUB_REPOSITORY,
  PACKAGE_MANAGER_GIT_SOURCE,
  PACKAGE_MANAGER_NPM_SOURCE,
  PACKAGE_MANAGER_REGISTRY_BASE_URL,
  PACKAGE_UNINSTALL_COMMAND,
  PACKAGE_UPGRADE_COMMAND,
  comparePackageManagerVersionOrder,
  isNewerPackageManagerVersion,
  parsePackageManagerCommand,
  parsePackageManagerForceFlag,
  parsePackageManagerUpgradeChannel,
  probeLatestGitHubRelease,
  probeLatestRegistryVersion,
  resolveHighestPackageManagerVersion,
  resolveInstalledPackageManagerSource,
  resolvePackageManagerInstalledVersion,
  resolvePackageManagerManifestLatest,
  resolvePackageManagerUpgradeSource,
  runPackageManagerManagementCommand,
  runPackageManagerUninstallCommand,
  runPackageManagerUpgradeCommand,
  runPackageManagerVersionCommand,
  type PackageManagerLogger,
  type PackageManagerSpawn,
  type PackageManagerSpawnOptions,
  type PackageManagerStdout,
} from "../src/core/package-manager.js";

/**
 * @brief Describes one recorded package-manager child-process invocation.
 * @details Captures the executable, argument vector, and spawn options forwarded by the handler under test so assertions can verify command identity and execution semantics without touching real child processes. Compile-time only.
 */
interface RecordedSpawnCall {
  file: string;
  args: string[];
  options: PackageManagerSpawnOptions;
}

/**
 * @brief Builds a deterministic spawn double recording every invocation.
 * @details Returns the configured status or error payload for each call and appends the invocation into a captured list, so handlers are exercised without spawning real package-manager processes. Runtime is O(1) per call. No external state is mutated.
 * @param[in] result {{ status?: number | null; error?: { message: string } }} Fixed child outcome; defaults to successful exit code `0`.
 * @return {{ calls: RecordedSpawnCall[]; spawn: PackageManagerSpawn }} Recording spawn double.
 */
function createSpawnDouble(
  result: { status?: number | null; error?: { message: string } } = {},
): { calls: RecordedSpawnCall[]; spawn: PackageManagerSpawn } {
  const calls: RecordedSpawnCall[] = [];
  const spawn: PackageManagerSpawn = (file, args, options) => {
    calls.push({ file, args: [...args], options: { ...options } });
    return {
      status: result.status ?? 0,
      ...(result.error ? { error: result.error } : {}),
    };
  };
  return { calls, spawn };
}

/**
 * @brief Builds a deterministic stdout sink capturing every write.
 * @details Collects written fragments in order so version reports and upgrade summaries can be asserted verbatim without touching the process stdout stream. Runtime is O(1) per write. No external state is mutated.
 * @return {{ chunks: string[]; stdout: PackageManagerStdout }} Capturing stdout sink.
 */
function createStdoutSink(): { chunks: string[]; stdout: PackageManagerStdout } {
  const chunks: string[] = [];
  return { chunks, stdout: { write: (data: string) => { chunks.push(data); } } };
}

/**
 * @brief Builds a deterministic stderr logger capturing log and error diagnostics.
 * @details Collects diagnostic fragments into separated lists so stderr-only behavior can be asserted without writing to the process stderr stream. Runtime is O(1) per call. No external state is mutated.
 * @return {{ logs: string[]; errors: string[]; logger: PackageManagerLogger }} Capturing logger double.
 */
function createLoggerDouble(): {
  logs: string[];
  errors: string[];
  logger: PackageManagerLogger;
} {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    logger: {
      log: (...args: unknown[]) => { logs.push(args.join(" ")); },
      error: (...args: unknown[]) => { errors.push(args.join(" ")); },
    },
  };
}

/**
 * @brief Builds a deterministic JSON fetch double for one probe response.
 * @details Returns a minimal response object exposing only `ok`, `status`, and `json()`, recording every requested URL so probe endpoints can be asserted without any real network traffic. Runtime is O(1) per call. No external state is mutated.
 * @param[in] payload {unknown} JSON document returned by `response.json()`.
 * @param[in] ok {boolean} Response success flag.
 * @param[in] status {number} Response HTTP status code.
 * @return {{ urls: string[]; fetchImpl: typeof fetch }} Recording fetch double.
 */
function createFetchJsonDouble(
  payload: unknown,
  ok = true,
  status = 200,
): { urls: string[]; fetchImpl: typeof fetch } {
  const urls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    urls.push(String(input));
    return {
      ok,
      status,
      json: async () => payload,
    };
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
}

/**
 * @brief Builds a deterministic fetch double that always rejects.
 * @details Simulates network failures so probe error paths execute without any real HTTP traffic. Runtime is O(1). No external state is mutated.
 * @param[in] message {string} Rejection message surfaced as the probe diagnostic.
 * @return {{ fetchImpl: typeof fetch }} Rejecting fetch double.
 */
function createFetchRejectDouble(message: string): { fetchImpl: typeof fetch } {
  const fetchImpl = (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
  return { fetchImpl };
}

test("management command parsing accepts every documented exact single-token shape", () => {
  assert.equal(parsePackageManagerCommand(["--ver"]), "--ver");
  assert.equal(parsePackageManagerCommand(["--version"]), "--version");
  assert.equal(parsePackageManagerCommand(["--upgrade"]), "--upgrade");
  assert.equal(parsePackageManagerCommand(["--uninstall"]), "--uninstall");
});

test("management command parsing accepts the develop option in either order with --upgrade", () => {
  assert.equal(parsePackageManagerCommand(["--upgrade", "--develop"]), "--upgrade");
  assert.equal(parsePackageManagerCommand(["--develop", "--upgrade"]), "--upgrade");
  assert.equal(parsePackageManagerCommand(["--upgrade", "--dev"]), "--upgrade");
  assert.equal(parsePackageManagerCommand(["--dev", "--upgrade"]), "--upgrade");
});

test("management command parsing rejects every other argv shape", () => {
  assert.equal(parsePackageManagerCommand([]), undefined);
  assert.equal(parsePackageManagerCommand(["--summarize"]), undefined);
  assert.equal(parsePackageManagerCommand(["--ver", "--version"]), undefined);
  assert.equal(parsePackageManagerCommand(["--upgrade", "--develop", "--version"]), undefined);
  assert.equal(parsePackageManagerCommand(["--develop", "--dev"]), undefined);
  assert.equal(parsePackageManagerCommand(["--uninstall", "--dev"]), undefined);
});

test("management command parsing accepts the force option in either order with --upgrade", () => {
  assert.equal(parsePackageManagerCommand(["--upgrade", "--force"]), "--upgrade");
  assert.equal(parsePackageManagerCommand(["--force", "--upgrade"]), "--upgrade");
});

/**
 * @brief Verifies the documented three-token `--upgrade` force shapes in every token order.
 * @details Exercises `--upgrade`, `--force`, and the `--dev` plus `--develop` aliases in all permutations, asserting each resolves to the `--upgrade` management command. Deterministic: pure function, no I/O. Arrange builds the permutations; Act parses them; Assert compares against `--upgrade`.
 */
test("management command parsing accepts force with develop in any three-token order", () => {
  for (const develop of ["--dev", "--develop"] as const) {
    assert.equal(parsePackageManagerCommand(["--upgrade", develop, "--force"]), "--upgrade");
    assert.equal(parsePackageManagerCommand(["--upgrade", "--force", develop]), "--upgrade");
    assert.equal(parsePackageManagerCommand([develop, "--upgrade", "--force"]), "--upgrade");
    assert.equal(parsePackageManagerCommand([develop, "--force", "--upgrade"]), "--upgrade");
    assert.equal(parsePackageManagerCommand(["--force", "--upgrade", develop]), "--upgrade");
    assert.equal(parsePackageManagerCommand(["--force", develop, "--upgrade"]), "--upgrade");
  }
});

test("management command parsing rejects force shapes on other management commands", () => {
  assert.equal(parsePackageManagerCommand(["--force"]), undefined);
  assert.equal(parsePackageManagerCommand(["--ver", "--force"]), undefined);
  assert.equal(parsePackageManagerCommand(["--upgrade", "--dev", "--develop"]), undefined);
  assert.equal(parsePackageManagerCommand(["--upgrade", "--force", "--force"]), undefined);
  assert.equal(parsePackageManagerCommand(["--upgrade", "--force", "--version"]), undefined);
  assert.equal(parsePackageManagerCommand(["--upgrade", "--dev", "--force", "--develop"]), undefined);
});

test("upgrade channel parsing selects develop only for the documented aliases", () => {
  assert.equal(parsePackageManagerUpgradeChannel(["--upgrade"]), "npm");
  assert.equal(parsePackageManagerUpgradeChannel(["--upgrade", "--develop"]), "develop");
  assert.equal(parsePackageManagerUpgradeChannel(["--dev", "--upgrade"]), "develop");
  assert.equal(parsePackageManagerUpgradeChannel(["--uninstall"]), "npm");
  assert.equal(parsePackageManagerUpgradeChannel(["--upgrade", "--force"]), "npm");
  assert.equal(parsePackageManagerUpgradeChannel(["--upgrade", "--force", "--dev"]), "develop");
});

test("force flag parsing reports presence only for the force token", () => {
  assert.equal(parsePackageManagerForceFlag(["--upgrade", "--force"]), true);
  assert.equal(parsePackageManagerForceFlag(["--force", "--upgrade"]), true);
  assert.equal(parsePackageManagerForceFlag(["--upgrade"]), false);
  assert.equal(parsePackageManagerForceFlag(["--upgrade", "--develop"]), false);
  assert.equal(parsePackageManagerForceFlag([]), false);
});

test("dotted numeric version comparison admits only strictly newer candidates", () => {
  assert.equal(isNewerPackageManagerVersion("1.2.3", "1.2.2"), true);
  assert.equal(isNewerPackageManagerVersion("1.10.0", "1.9.9"), true);
  assert.equal(isNewerPackageManagerVersion("1.2.1", "1.2"), true);
  assert.equal(isNewerPackageManagerVersion("1.2.3", "1.2.3"), false);
  assert.equal(isNewerPackageManagerVersion("1.2.2", "1.2.3"), false);
  assert.equal(isNewerPackageManagerVersion("1.2", "1.2.0"), false);
  assert.equal(isNewerPackageManagerVersion("1.2.3-beta.1", "1.2.2"), false);
  assert.equal(isNewerPackageManagerVersion("2.0.0", "1.2.3-beta.1"), false);
  assert.equal(isNewerPackageManagerVersion("not-a-version", "1.0.0"), false);
});

test("non-forced upgrade commands match the documented pi update forms", () => {
  assert.deepEqual(PACKAGE_UPGRADE_COMMAND, ["pi", "update", "npm:pi-usereq"]);
  assert.deepEqual(PACKAGE_DEVELOP_UPGRADE_COMMAND, [
    "pi",
    "update",
    `git:github.com/${PACKAGE_MANAGER_GITHUB_REPOSITORY}`,
  ]);
});

test("forced upgrade commands match the documented pi update force-reinstall forms", () => {
  assert.deepEqual(PACKAGE_FORCED_UPGRADE_COMMAND, ["pi", "update", "npm:pi-usereq", "--force"]);
  assert.deepEqual(PACKAGE_FORCED_DEVELOP_UPGRADE_COMMAND, [
    "pi",
    "update",
    `git:github.com/${PACKAGE_MANAGER_GITHUB_REPOSITORY}`,
    "--force",
  ]);
});

test("registry probe resolves the documented npmjs package manifest endpoint", async () => {
  const { urls, fetchImpl } = createFetchJsonDouble({ "dist-tags": { latest: "1.0.0" } });
  await probeLatestRegistryVersion({ currentVersion: "1.0.0", fetchImpl });
  assert.deepEqual(urls, [`${PACKAGE_MANAGER_REGISTRY_BASE_URL}/pi-usereq`]);
});

test("registry probe classifies newer, current, and older manifest payloads", async () => {
  const newer = await probeLatestRegistryVersion({
    currentVersion: "1.0.0",
    fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl,
  });
  assert.deepEqual(newer, { status: "newer", currentVersion: "1.0.0", latestVersion: "2.0.0" });
  const current = await probeLatestRegistryVersion({
    currentVersion: "2.0.0",
    fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl,
  });
  assert.deepEqual(current, { status: "current", currentVersion: "2.0.0", latestVersion: "2.0.0" });
  const older = await probeLatestRegistryVersion({
    currentVersion: "3.0.0",
    fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl,
  });
  assert.deepEqual(older, { status: "current", currentVersion: "3.0.0", latestVersion: "2.0.0" });
  const prerelease = await probeLatestRegistryVersion({
    currentVersion: "2.0.0",
    fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.1.0-beta.1" } }).fetchImpl,
  });
  assert.deepEqual(prerelease, { status: "current", currentVersion: "2.0.0", latestVersion: "2.1.0-beta.1" });
});

test("manifest resolution prefers dist-tags.latest and falls back to the highest versions entry", async () => {
  assert.equal(
    resolvePackageManagerManifestLatest({
      "dist-tags": { latest: "1.9.0" },
      versions: { "2.0.0": {}, "1.0.0": {} },
    }),
    "1.9.0",
  );
  assert.equal(
    resolvePackageManagerManifestLatest({ versions: { "1.0.0": {}, "2.1.0": {}, "2.0.0-beta.1": {} } }),
    "2.1.0",
  );
  assert.equal(resolvePackageManagerManifestLatest({ versions: { "2.1.0": {}, "2.1.0-beta.1": {} } }), "2.1.0");
  assert.equal(resolvePackageManagerManifestLatest({}), undefined);
  assert.equal(resolvePackageManagerManifestLatest("not-an-object"), undefined);
});

test("version order comparator ranks releases above equal-numeric prereleases", () => {
  assert.ok(comparePackageManagerVersionOrder("2.1.0", "2.1.0-beta.1") > 0);
  assert.ok(comparePackageManagerVersionOrder("1.10.0", "1.9.9") > 0);
  assert.ok(comparePackageManagerVersionOrder("1.2", "1.2.0") === 0);
  assert.equal(resolveHighestPackageManagerVersion(["bad-version", "2.0.0", ""]), "2.0.0");
  assert.equal(resolveHighestPackageManagerVersion([]), undefined);
});

test("registry probe maps failures and missing inputs to deterministic outcomes", async () => {
  const missingVersion = await probeLatestRegistryVersion({
    fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl,
  });
  assert.deepEqual(missingVersion, { status: "unknown-version" });
  const httpError = await probeLatestRegistryVersion({
    currentVersion: "1.0.0",
    fetchImpl: createFetchJsonDouble({}, false, 503).fetchImpl,
  });
  assert.equal(httpError.status, "error");
  assert.match(httpError.status === "error" ? httpError.message : "", /HTTP 503/);
  const malformed = await probeLatestRegistryVersion({
    currentVersion: "1.0.0",
    fetchImpl: createFetchJsonDouble({}).fetchImpl,
  });
  assert.equal(malformed.status, "error");
  const rejected = await probeLatestRegistryVersion({
    currentVersion: "1.0.0",
    fetchImpl: createFetchRejectDouble("network unreachable").fetchImpl,
  });
  assert.equal(rejected.status, "error");
  assert.match(rejected.status === "error" ? rejected.message : "", /network unreachable/);
});

test("GitHub probe resolves the documented releases endpoint and strips the tag prefix", async () => {
  const { urls, fetchImpl } = createFetchJsonDouble({ tag_name: "v1.5.0" });
  const probe = await probeLatestGitHubRelease({ fetchImpl });
  assert.deepEqual(urls, [PACKAGE_MANAGER_GITHUB_RELEASES_API_URL]);
  assert.deepEqual(probe, { status: "ok", version: "1.5.0", tag: "v1.5.0" });
});

test("GitHub probe maps failures and malformed tags to deterministic errors", async () => {
  const httpError = await probeLatestGitHubRelease({
    fetchImpl: createFetchJsonDouble({}, false, 404).fetchImpl,
  });
  assert.equal(httpError.status, "error");
  assert.match(httpError.status === "error" ? httpError.message : "", /HTTP 404/);
  const missingTag = await probeLatestGitHubRelease({
    fetchImpl: createFetchJsonDouble({}).fetchImpl,
  });
  assert.equal(missingTag.status, "error");
  const emptyTag = await probeLatestGitHubRelease({
    fetchImpl: createFetchJsonDouble({ tag_name: "v" }).fetchImpl,
  });
  assert.equal(emptyTag.status, "error");
  const rejected = await probeLatestGitHubRelease({
    fetchImpl: createFetchRejectDouble("rate limited").fetchImpl,
  });
  assert.equal(rejected.status, "error");
  assert.match(rejected.status === "error" ? rejected.message : "", /rate limited/);
});

test("installed version resolves from the installation-owned package manifest", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { version: string };
  assert.equal(resolvePackageManagerInstalledVersion(), manifest.version);
});

test("version command prints the manifest latest even when it is not newer than installed", async () => {
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerVersionCommand(
    { installedVersion: "0.99.0" },
    {
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "0.95.0" } }).fetchImpl },
      githubCheck: { fetchImpl: createFetchJsonDouble({ tag_name: "v1.5.0" }).fetchImpl },
    },
  );
  assert.equal(exitCode, 0);
  assert.deepEqual(sink.chunks, ["Current Installed : 0.99.0\nLatest @ NPMjs    : 0.95.0\nLatest @ GitHub   : 1.5.0\n"]);
});

test("version command prints the exact three-line report and returns zero", async () => {
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerVersionCommand(
    { installedVersion: "1.0.0" },
    {
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
      githubCheck: { fetchImpl: createFetchJsonDouble({ tag_name: "v1.5.0" }).fetchImpl },
    },
  );
  assert.equal(exitCode, 0);
  assert.deepEqual(sink.chunks, ["Current Installed : 1.0.0\nLatest @ NPMjs    : 2.0.0\nLatest @ GitHub   : 1.5.0\n"]);
});

test("version command renders unknown for missing and failed versions", async () => {
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerVersionCommand(
    { installedVersion: "" },
    {
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchRejectDouble("offline").fetchImpl },
      githubCheck: { fetchImpl: createFetchJsonDouble({}, false, 500).fetchImpl },
    },
  );
  assert.equal(exitCode, 0);
  assert.deepEqual(sink.chunks, ["Current Installed : unknown\nLatest @ NPMjs    : unknown\nLatest @ GitHub   : unknown\n"]);
});

test("default-channel upgrade skips spawning and reports already-latest when current", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "2.0.0", channel: "npm" },
    {
      spawn,
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(sink.chunks, ["pi-usereq 2.0.0 is already the latest available version (npmjs latest: 2.0.0).\n"]);
});

test("default-channel upgrade runs the pi update command and prints the metadata-resolved completion summary", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const { logs, logger } = createLoggerDouble();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "npm" },
    {
      spawn,
      stdout: sink.stdout,
      logger,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [...PACKAGE_UPGRADE_COMMAND.slice(1)]);
  assert.equal(calls[0].file, PACKAGE_UPGRADE_COMMAND[0]);
  assert.equal(calls[0].options.cwd, homedir());
  assert.equal(calls[0].options.stdio, "inherit");
  assert.equal(calls[0].options.shell, process.platform === "win32");
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 2.0.0\n"]);
  assert.deepEqual(logs, []);
});

test("default-channel upgrade proceeds when upgrade necessity is undeterminable", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0" },
    {
      spawn,
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchRejectDouble("timeout").fetchImpl },
      resolveUpgradedVersion: () => "unknown",
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> unknown\n"]);
});

test("default-channel upgrade propagates child failure without printing a summary", async () => {
  const { calls, spawn } = createSpawnDouble({ status: 3 });
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0" },
    {
      spawn,
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
    },
  );
  assert.equal(exitCode, 3);
  assert.equal(calls.length, 1);
  assert.deepEqual(sink.chunks, []);
});

test("develop-channel upgrade runs the git pi update command and prints the metadata-resolved summary", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "develop" },
    {
      spawn,
      stdout: sink.stdout,
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, PACKAGE_DEVELOP_UPGRADE_COMMAND[0]);
  assert.deepEqual(calls[0].args, [...PACKAGE_DEVELOP_UPGRADE_COMMAND.slice(1)]);
  assert.equal(calls[0].options.cwd, homedir());
  assert.equal(calls[0].options.stdio, "inherit");
  assert.equal(calls[0].options.shell, process.platform === "win32");
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 2.0.0\n"]);
});

test("develop-channel upgrade propagates child failure without printing a summary", async () => {
  const { calls, spawn } = createSpawnDouble({ status: 2 });
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "develop" },
    { spawn, stdout: sink.stdout },
  );
  assert.equal(exitCode, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(sink.chunks, []);
});

/**
 * @brief Verifies installed-source identification across managed and unmanaged installation trees.
 * @details Materializes no real installation because classification is path-based; asserts the npm-managed tree, the git-managed tree with its derived source token, and an unmanaged checkout. Deterministic: pure path checks with a temporary home directory, no child processes or network.
 * @satisfies REQ-609, REQ-610, REQ-611, REQ-612, TST-198
 */
test("installed-source identification classifies npm, git, and unknown installation trees", () => {
  const home = fs.mkdtempSync(path.join(tmpdir(), "pi-usereq-source-home-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    delete process.env.PI_CODING_AGENT_DIR;
    const agentDir = path.join(home, ".pi", "agent");
    assert.deepEqual(
      resolveInstalledPackageManagerSource(
        path.join(agentDir, "npm", "node_modules", "pi-usereq", "src"),
        () => home,
      ),
      { kind: "npm", source: PACKAGE_MANAGER_NPM_SOURCE },
    );
    assert.deepEqual(
      resolveInstalledPackageManagerSource(
        path.join(agentDir, "git", "github.com", "Ogekuri", "PI-useReq", "src"),
        () => home,
      ),
      { kind: "git", source: PACKAGE_MANAGER_GIT_SOURCE },
    );
    assert.deepEqual(
      resolveInstalledPackageManagerSource(path.join(home, "checkout", "src"), () => home),
      { kind: "unknown" },
    );
    assert.equal(resolvePackageManagerUpgradeSource("npm"), PACKAGE_MANAGER_NPM_SOURCE);
    assert.equal(resolvePackageManagerUpgradeSource("develop"), PACKAGE_MANAGER_GIT_SOURCE);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previous;
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies the default-channel source switch from one git-managed installation.
 * @details Injects a git-managed installed source and a newer npmjs latest version so the run must skip the registry gate, remove the git package, then install the npm source before printing the completion summary. Deterministic: spawn, fetch, stdout, and resolver doubles; no network or child processes.
 * @satisfies REQ-614, REQ-616, REQ-617, REQ-618, TST-199
 */
test("default-channel upgrade from a git-managed installation removes it and installs the npm source", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const registry = createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } });
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "npm" },
    {
      spawn,
      stdout: sink.stdout,
      resolveInstalledSource: () => ({ kind: "git", source: PACKAGE_MANAGER_GIT_SOURCE }),
      registryCheck: { fetchImpl: registry.fetchImpl },
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(exitCode, 0);
  assert.deepEqual(registry.urls, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].file, "pi");
  assert.deepEqual(calls[0].args, ["remove", PACKAGE_MANAGER_GIT_SOURCE]);
  assert.deepEqual(calls[1].args, ["install", PACKAGE_MANAGER_NPM_SOURCE]);
  assert.equal(calls[0].options.cwd, homedir());
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 2.0.0\n"]);
});

/**
 * @brief Verifies the develop-channel source switch from one npm-managed installation.
 * @details Injects an npm-managed installed source so the run must remove `npm:pi-usereq` and install the git target source without any registry probe. Deterministic: spawn, stdout, and resolver doubles; no network or child processes.
 * @satisfies REQ-613, REQ-614, REQ-617, TST-200
 */
test("develop-channel upgrade from an npm-managed installation removes it and installs the git source", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "develop" },
    {
      spawn,
      stdout: sink.stdout,
      resolveInstalledSource: () => ({ kind: "npm", source: PACKAGE_MANAGER_NPM_SOURCE }),
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ["remove", PACKAGE_MANAGER_NPM_SOURCE]);
  assert.deepEqual(calls[1].args, ["install", PACKAGE_MANAGER_GIT_SOURCE]);
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 2.0.0\n"]);
});

/**
 * @brief Verifies that a source-switch upgrade keeps the deployed launcher and completion summary aligned with the target installation.
 * @details Materializes a temporary pi agent directory carrying a git-managed installation with a deployed agent-bin launcher symlink, plus a spawn double that deletes that git installation on `pi remove` and writes the npm-managed target package root on `pi install`. Arrange sets `PI_CODING_AGENT_DIR` and both package manifests; Act runs the default-channel source switch without an injected version resolver; Assert verifies the launcher symlink now resolves to the freshly installed npm launcher and the completion summary reports the target version instead of the deleted installation. Deterministic: temporary filesystem roots plus spawn and stdout doubles; no network or child processes.
 * @satisfies REQ-484, REQ-504, REQ-617, TST-199
 */
test("source-switch upgrade re-points the deployed launcher and reports the target installation version", async () => {
  const agentDir = fs.mkdtempSync(path.join(tmpdir(), "pi-usereq-switch-agent-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const writePackageRoot = (root: string, version: string): void => {
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(root, "scripts", "pi-usereq.js"), "#!/usr/bin/env node\n", "utf8");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "pi-usereq", version }), "utf8");
  };
  try {
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const gitRoot = path.join(agentDir, "git", "github.com", "Ogekuri", "PI-useReq");
    writePackageRoot(gitRoot, "1.0.0");
    const binDir = path.join(agentDir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const launcherLinkPath = path.join(binDir, "pi-usereq");
    fs.symlinkSync(path.join(gitRoot, "scripts", "pi-usereq.js"), launcherLinkPath, "file");
    const npmRoot = path.join(agentDir, "npm", "node_modules", "pi-usereq");
    const calls: string[][] = [];
    const spawn: PackageManagerSpawn = (_file, args) => {
      calls.push([...args]);
      if (args[0] === "remove") {
        fs.rmSync(gitRoot, { recursive: true, force: true });
      } else if (args[0] === "install") {
        writePackageRoot(npmRoot, "2.0.0");
      }
      return { status: 0 };
    };
    const sink = createStdoutSink();
    const exitCode = await runPackageManagerUpgradeCommand(
      { installedVersion: "1.0.0", channel: "npm" },
      {
        spawn,
        stdout: sink.stdout,
        resolveInstalledSource: () => ({ kind: "git", source: PACKAGE_MANAGER_GIT_SOURCE }),
      },
    );
    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [["remove", PACKAGE_MANAGER_GIT_SOURCE], ["install", PACKAGE_MANAGER_NPM_SOURCE]]);
    assert.equal(
      fs.realpathSync(launcherLinkPath),
      fs.realpathSync(path.join(npmRoot, "scripts", "pi-usereq.js")),
    );
    assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 2.0.0\n"]);
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies that a failing removal aborts the source switch before installation.
 * @details Injects a failing removal child and asserts the run returns that exit code after exactly one removal spawn without installation or summary output. Deterministic: spawn and resolver doubles; no network or child processes.
 * @satisfies REQ-615, REQ-616, TST-201
 */
test("failing package removal aborts the upgrade before installing the target source", async () => {
  const { calls, spawn } = createSpawnDouble({ status: 5 });
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "npm", force: true },
    {
      spawn,
      stdout: sink.stdout,
      resolveInstalledSource: () => ({ kind: "git", source: PACKAGE_MANAGER_GIT_SOURCE }),
    },
  );
  assert.equal(exitCode, 5);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["remove", PACKAGE_MANAGER_GIT_SOURCE]);
  assert.deepEqual(sink.chunks, []);
});

/**
 * @brief Verifies that matching and unknown installed sources keep the documented update commands.
 * @details Runs a forced same-source upgrade and an unknown-source upgrade, asserting the force update command and the registry-gated update command without any removal spawn. Deterministic: spawn, fetch, and resolver doubles; no network or child processes.
 * @satisfies REQ-615, REQ-527, REQ-528, TST-202
 */
test("same-source and unknown-source upgrades keep the documented pi update commands", async () => {
  const sameSource = createSpawnDouble();
  const sameSink = createStdoutSink();
  const sameExit = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "npm", force: true },
    {
      spawn: sameSource.spawn,
      stdout: sameSink.stdout,
      resolveInstalledSource: () => ({ kind: "npm", source: PACKAGE_MANAGER_NPM_SOURCE }),
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(sameExit, 0);
  assert.equal(sameSource.calls.length, 1);
  assert.deepEqual(sameSource.calls[0].args, [...PACKAGE_FORCED_UPGRADE_COMMAND.slice(1)]);
  const unknown = createSpawnDouble();
  const unknownSink = createStdoutSink();
  const unknownExit = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "npm" },
    {
      spawn: unknown.spawn,
      stdout: unknownSink.stdout,
      resolveInstalledSource: () => ({ kind: "unknown" }),
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(unknownExit, 0);
  assert.equal(unknown.calls.length, 1);
  assert.deepEqual(unknown.calls[0].args, [...PACKAGE_UPGRADE_COMMAND.slice(1)]);
});

/**
 * @brief Verifies the unchanged-version stderr warning for one non-forced upgrade child.
 * @details Injects a post-upgrade installed-version resolver returning the same starting version so the completion report must surface the unchanged-version stderr warning while the stdout summary still prints and the exit code stays `0`. Deterministic: spawn, fetch, logger, stdout, and resolver doubles; no network, child processes, or filesystem metadata reads. Arrange prepares a newer registry latest plus an unchanged post-child version; Act runs the non-forced upgrade; Assert compares exit code, stdout summary, and captured stderr warning.
 * @satisfies REQ-484, REQ-531
 */
test("non-forced upgrade warns on stderr when the re-read installed version stays unchanged", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const { logs, errors, logger } = createLoggerDouble();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "npm" },
    {
      spawn,
      stdout: sink.stdout,
      logger,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
      resolveUpgradedVersion: () => "1.0.0",
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 1.0.0\n"]);
  assert.equal(errors.length, 0);
  assert.match(logs.join("\n"), /warning: pi-usereq installed version remained 1\.0\.0/);
});

/**
 * @brief Verifies that a forced default-channel run skips the already-latest gate.
 * @details Uses an installed version equal to the registry latest so the non-forced path would print the already-latest skip line, then asserts the forced run spawns exactly the documented `pi update npm:pi-usereq --force` child with inherited stdio from the user home and prints the completion summary instead. Deterministic: spawn and fetch doubles, no network or child processes. Arrange prepares equal installed and latest versions; Act runs the forced upgrade; Assert compares the recorded child invocation plus stdout against the documented force contract.
 * @satisfies REQ-526, REQ-527
 */
test("forced default-channel upgrade skips the already-latest gate and runs the pi update force command", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const { logs, logger } = createLoggerDouble();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "2.0.0", channel: "npm", force: true },
    {
      spawn,
      stdout: sink.stdout,
      logger,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, PACKAGE_FORCED_UPGRADE_COMMAND[0]);
  assert.deepEqual(calls[0].args, [...PACKAGE_FORCED_UPGRADE_COMMAND.slice(1)]);
  assert.equal(calls[0].options.cwd, homedir());
  assert.equal(calls[0].options.stdio, "inherit");
  assert.equal(calls[0].options.shell, process.platform === "win32");
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 2.0.0 -> 2.0.0\n"]);
  assert.ok(!sink.chunks.join("").includes("already the latest"));
  assert.deepEqual(logs, []);
});

test("forced default-channel upgrade propagates child failure without printing a summary", async () => {
  const { calls, spawn } = createSpawnDouble({ status: 4 });
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", force: true },
    { spawn, stdout: sink.stdout },
  );
  assert.equal(exitCode, 4);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [...PACKAGE_FORCED_UPGRADE_COMMAND.slice(1)]);
  assert.deepEqual(sink.chunks, []);
});

test("forced develop-channel upgrade runs the git pi update force command and prints the summary", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "develop", force: true },
    {
      spawn,
      stdout: sink.stdout,
      resolveUpgradedVersion: () => "2.0.0",
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, PACKAGE_FORCED_DEVELOP_UPGRADE_COMMAND[0]);
  assert.deepEqual(calls[0].args, [...PACKAGE_FORCED_DEVELOP_UPGRADE_COMMAND.slice(1)]);
  assert.equal(calls[0].options.cwd, homedir());
  assert.equal(calls[0].options.stdio, "inherit");
  assert.equal(calls[0].options.shell, process.platform === "win32");
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 2.0.0\n"]);
});

test("uninstall command runs the documented uninstall child command", () => {
  const { calls, spawn } = createSpawnDouble({ status: 0 });
  const exitCode = runPackageManagerUninstallCommand({ spawn });
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, PACKAGE_UNINSTALL_COMMAND[0]);
  assert.deepEqual(calls[0].args, [...PACKAGE_UNINSTALL_COMMAND.slice(1)]);
  assert.equal(calls[0].options.cwd, homedir());
  assert.equal(calls[0].options.stdio, "inherit");
  assert.equal(calls[0].options.shell, process.platform === "win32");
});

test("uninstall command maps spawn failures to exit code one with the manual hint", () => {
  const spawn = createSpawnDouble({ error: { message: "spawn npm ENOENT" } }).spawn;
  const { logs, errors, logger } = createLoggerDouble();
  const exitCode = runPackageManagerUninstallCommand({ spawn, logger });
  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /Error executing npm/);
  assert.match(logs.join("\n"), /run this command manually/);
});

test("management dispatch routes every canonical command to its handler", async () => {
  const uninstallSpawn = createSpawnDouble({ status: 0 });
  const uninstallExit = await runPackageManagerManagementCommand(
    "--uninstall",
    { installedVersion: "1.0.0" },
    { spawn: uninstallSpawn.spawn },
  );
  assert.equal(uninstallExit, 0);
  assert.equal(uninstallSpawn.calls.length, 1);

  const versionSink = createStdoutSink();
  const versionExit = await runPackageManagerManagementCommand(
    "--ver",
    { installedVersion: "1.0.0" },
    {
      stdout: versionSink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "1.0.0" } }).fetchImpl },
      githubCheck: { fetchImpl: createFetchJsonDouble({ tag_name: "v1.0.0" }).fetchImpl },
    },
  );
  assert.equal(versionExit, 0);
  assert.deepEqual(versionSink.chunks, ["Current Installed : 1.0.0\nLatest @ NPMjs    : 1.0.0\nLatest @ GitHub   : 1.0.0\n"]);

  const currentSpawn = createSpawnDouble();
  const currentSink = createStdoutSink();
  const upgradeExit = await runPackageManagerManagementCommand(
    "--upgrade",
    { installedVersion: "2.0.0" },
    {
      spawn: currentSpawn.spawn,
      stdout: currentSink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ "dist-tags": { latest: "2.0.0" } }).fetchImpl },
    },
  );
  assert.equal(upgradeExit, 0);
  assert.equal(currentSpawn.calls.length, 0);
  assert.deepEqual(currentSink.chunks, ["pi-usereq 2.0.0 is already the latest available version (npmjs latest: 2.0.0).\n"]);
});

test("package manifest declares the pi-usereq distribution bin launcher", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { bin?: Record<string, string> };
  assert.equal(manifest.bin?.["pi-usereq"], "scripts/pi-usereq.js");
});

test("bin launcher registers the bundled tsx loader and invokes the CLI main", () => {
  const launcher = fs.readFileSync(
    path.join(process.cwd(), "scripts", "pi-usereq.js"),
    "utf8",
  );
  assert.match(launcher, /^#!\/usr\/bin\/env node/);
  assert.match(launcher, /from "tsx\/esm\/api"/);
  assert.match(launcher, /register\(\)/);
  assert.match(launcher, /"src", "cli\.ts"/);
  assert.match(launcher, /main\(process\.argv\.slice\(2\)\)/);
});

test("bash wrapper forwards arguments through the local tsx CLI entry", () => {
  const wrapper = fs.readFileSync(
    path.join(process.cwd(), "scripts", "pi-usereq.sh"),
    "utf8",
  );
  assert.match(wrapper, /^#!\/usr\/bin\/env bash/);
  assert.match(wrapper, /exec node --import tsx \.\/src\/cli\.ts "\$@"/);
  assert.match(wrapper, /node_modules\/tsx missing/);
  assert.match(wrapper, /npm install/);
});
