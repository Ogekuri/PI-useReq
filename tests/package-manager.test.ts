import assert from "node:assert/strict";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import {
  PACKAGE_MANAGER_GITHUB_RELEASES_API_URL,
  PACKAGE_MANAGER_GITHUB_REPOSITORY,
  PACKAGE_MANAGER_REGISTRY_BASE_URL,
  PACKAGE_UNINSTALL_COMMAND,
  PACKAGE_UPGRADE_COMMAND,
  buildDevelopUpgradeCommand,
  isNewerPackageManagerVersion,
  parsePackageManagerCommand,
  parsePackageManagerUpgradeChannel,
  probeLatestGitHubRelease,
  probeLatestRegistryVersion,
  resolvePackageManagerInstalledVersion,
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

test("upgrade channel parsing selects develop only for the documented aliases", () => {
  assert.equal(parsePackageManagerUpgradeChannel(["--upgrade"]), "npm");
  assert.equal(parsePackageManagerUpgradeChannel(["--upgrade", "--develop"]), "develop");
  assert.equal(parsePackageManagerUpgradeChannel(["--dev", "--upgrade"]), "develop");
  assert.equal(parsePackageManagerUpgradeChannel(["--uninstall"]), "npm");
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

test("develop upgrade command embeds the raw GitHub release tag", () => {
  assert.deepEqual(
    buildDevelopUpgradeCommand("v1.2.3"),
    ["npm", "install", "-g", `github:${PACKAGE_MANAGER_GITHUB_REPOSITORY}#v1.2.3`],
  );
});

test("registry probe resolves the documented registry endpoint", async () => {
  const { urls, fetchImpl } = createFetchJsonDouble({ version: "1.0.0" });
  await probeLatestRegistryVersion({ currentVersion: "1.0.0", fetchImpl });
  assert.deepEqual(urls, [`${PACKAGE_MANAGER_REGISTRY_BASE_URL}/pi-usereq/latest`]);
});

test("registry probe classifies newer, current, and older payloads", async () => {
  const newer = await probeLatestRegistryVersion({
    currentVersion: "1.0.0",
    fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl,
  });
  assert.deepEqual(newer, { status: "newer", currentVersion: "1.0.0", latestVersion: "2.0.0" });
  const current = await probeLatestRegistryVersion({
    currentVersion: "2.0.0",
    fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl,
  });
  assert.deepEqual(current, { status: "current", currentVersion: "2.0.0" });
  const older = await probeLatestRegistryVersion({
    currentVersion: "3.0.0",
    fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl,
  });
  assert.deepEqual(older, { status: "current", currentVersion: "3.0.0" });
  const prerelease = await probeLatestRegistryVersion({
    currentVersion: "2.0.0",
    fetchImpl: createFetchJsonDouble({ version: "2.1.0-beta.1" }).fetchImpl,
  });
  assert.deepEqual(prerelease, { status: "current", currentVersion: "2.0.0" });
});

test("registry probe maps failures and missing inputs to deterministic outcomes", async () => {
  const missingVersion = await probeLatestRegistryVersion({
    fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl,
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

test("version command prints the exact three-line report and returns zero", async () => {
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerVersionCommand(
    { installedVersion: "1.0.0" },
    {
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl },
      githubCheck: { fetchImpl: createFetchJsonDouble({ tag_name: "v1.5.0" }).fetchImpl },
    },
  );
  assert.equal(exitCode, 0);
  assert.deepEqual(sink.chunks, ["1.0.0\nnpmjs latest: 2.0.0\nGitHub latest: 1.5.0\n"]);
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
  assert.deepEqual(sink.chunks, ["unknown\nnpmjs latest: unknown\nGitHub latest: unknown\n"]);
});

test("default-channel upgrade skips spawning and reports already-latest when current", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "2.0.0", channel: "npm" },
    {
      spawn,
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl },
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(sink.chunks, ["pi-usereq 2.0.0 is already the latest available version.\n"]);
});

test("default-channel upgrade installs the latest package and prints the completion summary", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "npm" },
    {
      spawn,
      stdout: sink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl },
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
      registryCheck: { fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl },
    },
  );
  assert.equal(exitCode, 3);
  assert.equal(calls.length, 1);
  assert.deepEqual(sink.chunks, []);
});

test("develop-channel upgrade fails without spawning when the GitHub probe fails", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const { errors, logger } = createLoggerDouble();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "develop" },
    {
      spawn,
      logger,
      stdout: sink.stdout,
      githubCheck: { fetchImpl: createFetchJsonDouble({}, false, 403).fetchImpl },
    },
  );
  assert.equal(exitCode, 1);
  assert.equal(calls.length, 0);
  assert.deepEqual(sink.chunks, []);
  assert.equal(errors.length, 1);
});

test("develop-channel upgrade installs the probed release tag and prints the summary", async () => {
  const { calls, spawn } = createSpawnDouble();
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "develop" },
    {
      spawn,
      stdout: sink.stdout,
      githubCheck: { fetchImpl: createFetchJsonDouble({ tag_name: "v1.2.3" }).fetchImpl },
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [...buildDevelopUpgradeCommand("v1.2.3").slice(1)]);
  assert.deepEqual(sink.chunks, ["pi-usereq upgrade completed: 1.0.0 -> 1.2.3\n"]);
});

test("develop-channel upgrade propagates child failure without printing a summary", async () => {
  const { calls, spawn } = createSpawnDouble({ status: 2 });
  const sink = createStdoutSink();
  const exitCode = await runPackageManagerUpgradeCommand(
    { installedVersion: "1.0.0", channel: "develop" },
    {
      spawn,
      stdout: sink.stdout,
      githubCheck: { fetchImpl: createFetchJsonDouble({ tag_name: "v1.2.3" }).fetchImpl },
    },
  );
  assert.equal(exitCode, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(sink.chunks, []);
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
      registryCheck: { fetchImpl: createFetchJsonDouble({ version: "1.0.0" }).fetchImpl },
      githubCheck: { fetchImpl: createFetchJsonDouble({ tag_name: "v1.0.0" }).fetchImpl },
    },
  );
  assert.equal(versionExit, 0);
  assert.deepEqual(versionSink.chunks, ["1.0.0\nnpmjs latest: 1.0.0\nGitHub latest: 1.0.0\n"]);

  const currentSpawn = createSpawnDouble();
  const currentSink = createStdoutSink();
  const upgradeExit = await runPackageManagerManagementCommand(
    "--upgrade",
    { installedVersion: "2.0.0" },
    {
      spawn: currentSpawn.spawn,
      stdout: currentSink.stdout,
      registryCheck: { fetchImpl: createFetchJsonDouble({ version: "2.0.0" }).fetchImpl },
    },
  );
  assert.equal(upgradeExit, 0);
  assert.equal(currentSpawn.calls.length, 0);
  assert.deepEqual(currentSink.chunks, ["pi-usereq 2.0.0 is already the latest available version.\n"]);
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
