import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @brief Describes one sandboxed `scripts/build.sh` invocation context.
 * @details Stores the sandbox root acting as the synthetic repository root, the copied build script path, the fake toolchain bin directory, and the external working directory used to prove repository-root resolution is independent from the caller cwd. The interface is compile-time only and introduces no runtime cost.
 */
interface BuildScriptSandbox {
  readonly sandboxRoot: string;
  readonly scriptPath: string;
  readonly fakeBinDir: string;
  readonly callerCwd: string;
}

/**
 * @brief Describes one captured `scripts/build.sh` process outcome.
 * @details Exposes the exit status plus decoded stdout and stderr so assertions stay behavioral. The interface is compile-time only and introduces no runtime cost.
 */
interface BuildScriptRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * @brief Writes one UTF-8 file inside the sandbox, creating parent directories on demand.
 * @details Stores deterministic placeholder content so artifact assertions depend only on path existence, never on file bytes. Runtime is O(1). Side effects include directory and file creation.
 * @param[in] absolutePath {string} Absolute file path inside the sandbox.
 * @param[in] content {string} File content to persist.
 * @return {void} No return value.
 */
function writeSandboxFile(absolutePath: string, content = "pi-usereq build-script fixture\n"): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

/**
 * @brief Writes one executable shell script inside the sandbox.
 * @details Creates parent directories, writes the supplied body, and marks the file owner-executable so the sandboxed build can invoke fake toolchain commands through `PATH`. Runtime is O(n) in script size. Side effects include directory creation, file creation, and permission changes.
 * @param[in] absolutePath {string} Absolute script path inside the sandbox.
 * @param[in] content {string} Complete bash script body.
 * @return {void} No return value.
 */
function writeExecutable(absolutePath: string, content: string): void {
  writeSandboxFile(absolutePath, content);
  fs.chmodSync(absolutePath, 0o755);
}

/**
 * @brief Creates one isolated sandbox hosting a copy of the build script plus a fake toolchain.
 * @details Copies the repository-owned `scripts/build.sh` into `<sandbox>/scripts/build.sh` so the script under test resolves the sandbox root as its repository root through its own location, writes fake `git`, `node`, and `npm` executables into `<sandbox>/fake-bin`, and resolves a pre-existing external caller cwd outside the sandbox. The fake `git status` reports every untracked sandbox file so the script's inventory-based cleanup can be exercised without a real repository. Each call produces an independent temporary tree so no test relies on state left behind by another test. Runtime is O(n) in script size. Side effects include temporary directory and file creation.
 * @param[in] testContext {node:test.TestContext} Active node test context receiving the sandbox cleanup callback.
 * @return {BuildScriptSandbox} Sandbox paths for the script invocation.
 * @satisfies TST-193, TST-194
 */
function createBuildScriptSandbox(testContext: test.TestContext): BuildScriptSandbox {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-build-script-"));
  testContext.after(() => {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  });
  const scriptsDir = path.join(sandboxRoot, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, "build.sh");
  fs.copyFileSync(path.join(process.cwd(), "scripts", "build.sh"), scriptPath);

  const fakeBinDir = path.join(sandboxRoot, "fake-bin");
  writeExecutable(
    path.join(fakeBinDir, "git"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [[ "${1:-}" == "status" ]]; then',
      "  find . -type f ! -path './.git/*' ! -path './node_modules/*' | sed 's|^\\./||' | sort | while IFS= read -r entry; do printf '?? %s\\n' \"${entry}\"; done",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  writeExecutable(
    path.join(fakeBinDir, "node"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [[ "${1:-}" == "--version" ]]; then',
      '  echo "v24.0.0"',
      "  exit 0",
      "fi",
      'if [[ "${1:-}" == "-p" ]]; then',
      '  case "${2:-}" in',
      "    *process.versions.node*) echo 24 ;;",
      "    *package.json*) echo 9.9.9 ;;",
      '    *) echo "" ;;',
      "  esac",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  writeExecutable(
    path.join(fakeBinDir, "npm"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [[ "${1:-}" == "ci" ]]; then',
      "  mkdir -p node_modules/.bin node_modules/fixture-package",
      "  printf '#!/usr/bin/env bash\\nexit 0\\n' > node_modules/.bin/tsc",
      "  chmod +x node_modules/.bin/tsc",
      "  printf 'fixture\\n' > node_modules/fixture-package/index.js",
      "  exit 0",
      "fi",
      'if [[ "${1:-}" == "pack" ]]; then',
      "  mkdir -p dist",
      "  printf 'fixture\\n' > dist/pi-usereq-9.9.9.tgz",
      "  printf 'fixture\\n' > intermediate.tmp",
      '  if [[ "${PI_USEREQ_FAKE_PACK_FAIL:-0}" == "1" ]]; then',
      "    exit 1",
      "  fi",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );

  return { sandboxRoot, scriptPath, fakeBinDir, callerCwd: os.tmpdir() };
}

/**
 * @brief Runs the sandboxed build script from an external working directory.
 * @details Invokes `bash <sandbox>/scripts/build.sh` with the sandbox fake toolchain prepended to `PATH` while anchoring the child cwd outside the sandbox so repository-root resolution from the script location is exercised on every run. Runtime is dominated by the delegated fake build stages. Side effects include process spawning and the filesystem mutations performed by the script under test inside the sandbox.
 * @param[in] sandbox {BuildScriptSandbox} Sandbox paths produced by `createBuildScriptSandbox`.
 * @param[in] envOverrides {NodeJS.ProcessEnv | undefined} Optional environment additions or overrides.
 * @return {BuildScriptRunResult} Captured exit status plus decoded output streams.
 * @satisfies TST-193, TST-194
 */
function runBuildScript(sandbox: BuildScriptSandbox, envOverrides?: NodeJS.ProcessEnv): BuildScriptRunResult {
  const result = spawnSync("bash", [sandbox.scriptPath], {
    cwd: sandbox.callerCwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${sandbox.fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
      ...envOverrides,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * @brief Creates one pre-existing dependency tree with an executable fake compiler.
 * @details Writes a `node_modules/.bin/tsc` executable plus one dependency file so the sandboxed build reuses the existing tree instead of running the fake `npm ci` stage. Runtime is O(1). Side effects include directory and file creation.
 * @param[in] sandboxRoot {string} Absolute sandbox root.
 * @return {void} No return value.
 */
function writeExistingDependencyTree(sandboxRoot: string): void {
  writeExecutable(path.join(sandboxRoot, "node_modules", ".bin", "tsc"), "#!/usr/bin/env bash\nexit 0\n");
  writeSandboxFile(path.join(sandboxRoot, "node_modules", "fixture-package", "index.js"));
}

/**
 * @brief Verifies the cleanup script is gone and the build script parses.
 * @details Asserts `scripts/clean.sh` no longer exists and runs `bash -n` against the repository-owned `scripts/build.sh` expecting exit status `0`, so a regression that restores the removed script or breaks the integrated build script fails immediately. Runtime is dominated by one bash subprocess. Side effects include process spawning.
 * @return {void} No return value.
 * @satisfies TST-193
 */
test("build script replaces clean script and passes bash syntax check", () => {
  // Arrange
  const cleanScriptPath = path.join(process.cwd(), "scripts", "clean.sh");
  const buildScriptRelativePath = path.join("scripts", "build.sh");

  // Act
  const syntax = spawnSync("bash", ["-n", buildScriptRelativePath], { cwd: process.cwd(), encoding: "utf8" });

  // Assert
  assert.equal(fs.existsSync(cleanScriptPath), false, "scripts/clean.sh must be removed");
  assert.equal(syntax.status, 0, syntax.stderr);
});

/**
 * @brief Verifies the previous-build cleanup removes every versioned tarball and preserves other entries.
 * @details Arranges a sandbox with two previous-build `dist/pi-usereq-<version>.tgz` tarballs, one non-tarball `dist/` entry, and an existing `node_modules` tree, then runs the build from an external cwd. Asserts exit status `0`, removal of every previous-build tarball across versions, preservation of the non-tarball entry, generation of the verified artifact, removal of the run-created intermediate file, and preservation of the dependency tree. Runtime is dominated by the sandboxed fake build stages. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-193, TST-194, REQ-568, REQ-597, REQ-598, REQ-599, REQ-600
 */
test("build script cleans previous versioned tarballs and leaves only the verified artifact", (testContext) => {
  // Arrange
  const sandbox = createBuildScriptSandbox(testContext);
  const distDir = path.join(sandbox.sandboxRoot, "dist");
  const oldTarball = path.join(distDir, "pi-usereq-0.0.1.tgz");
  const olderTarball = path.join(distDir, "pi-usereq-9.8.7.tgz");
  const preservedEntry = path.join(distDir, "release-notes.txt");
  const verifiedArtifact = path.join(distDir, "pi-usereq-9.9.9.tgz");
  writeSandboxFile(oldTarball);
  writeSandboxFile(olderTarball);
  writeSandboxFile(preservedEntry);
  writeExistingDependencyTree(sandbox.sandboxRoot);

  // Act
  const result = runBuildScript(sandbox);

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(oldTarball), "first previous-build tarball must be removed");
  assert.ok(!fs.existsSync(olderTarball), "second previous-build tarball must be removed");
  assert.ok(fs.existsSync(preservedEntry), "non-tarball dist entry must be preserved");
  assert.ok(fs.existsSync(verifiedArtifact), "verified release artifact must be retained");
  assert.ok(!fs.existsSync(path.join(sandbox.sandboxRoot, "intermediate.tmp")), "run-created intermediate file must be removed");
  assert.ok(
    fs.existsSync(path.join(sandbox.sandboxRoot, "node_modules", "fixture-package", "index.js")),
    "existing dependency tree must be preserved",
  );
  assert.ok(
    result.stdout.includes(`build: removed previous-build artifact: ${oldTarball}`),
    "stdout must report the previous-build tarball removal",
  );
  assert.ok(
    result.stdout.includes("build: removed intermediate artifact: intermediate.tmp"),
    "stdout must report the run-created intermediate artifact removal",
  );
});

/**
 * @brief Verifies failed builds remove run-created artifacts while preserving pre-existing entries.
 * @details Arranges a sandbox with one pre-existing non-tarball `dist/` entry and no dependency tree, forces the fake packaging stage to fail after creating a tarball plus one temporary file, and runs the build from an external cwd. Asserts a non-zero exit status, preservation of the pre-existing entry, removal of the generated tarball and temporary file, preservation of the newly installed dependency tree, and the run-created artifact cleanup line. Runtime is dominated by the sandboxed fake build stages. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-194, REQ-599, REQ-600, REQ-601
 */
test("build script failure cleans run-created artifacts and preserves pre-existing entries", (testContext) => {
  // Arrange
  const sandbox = createBuildScriptSandbox(testContext);
  const preservedEntry = path.join(sandbox.sandboxRoot, "dist", "release-notes.txt");
  writeSandboxFile(preservedEntry);

  // Act
  const result = runBuildScript(sandbox, { PI_USEREQ_FAKE_PACK_FAIL: "1" });

  // Assert
  assert.notEqual(result.status, 0, "failed packaging stage must exit non-zero");
  assert.ok(fs.existsSync(preservedEntry), "pre-existing dist entry must be preserved");
  assert.ok(!fs.existsSync(path.join(sandbox.sandboxRoot, "dist", "pi-usereq-9.9.9.tgz")), "generated tarball must be removed");
  assert.ok(!fs.existsSync(path.join(sandbox.sandboxRoot, "intermediate.tmp")), "run-created intermediate file must be removed");
  assert.ok(
    fs.existsSync(path.join(sandbox.sandboxRoot, "node_modules", "fixture-package", "index.js")),
    "newly installed dependency tree must be preserved",
  );
  assert.ok(
    result.stdout.includes("build: removed intermediate artifact: intermediate.tmp"),
    "stdout must report the run-created intermediate artifact removal on failure",
  );
});

/**
 * @brief Verifies the build aborts when a previous-build tarball survives removal.
 * @details Arranges a sandbox with a pre-existing `dist/*.tgz` tarball plus a no-op `rm` shim that defeats deletion, then runs the build from an external cwd. Asserts a non-zero exit status, the removal-verification failure diagnostic, and absence of the generated artifact because packaging never ran. Runtime is dominated by the sandboxed fake build stages. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-199, REQ-607
 */
test("build script aborts when a previous-build tarball survives removal", (testContext) => {
  // Arrange
  const sandbox = createBuildScriptSandbox(testContext);
  const survivingTarball = path.join(sandbox.sandboxRoot, "dist", "pi-usereq-0.0.1.tgz");
  const generatedArtifact = path.join(sandbox.sandboxRoot, "dist", "pi-usereq-9.9.9.tgz");
  const tempDir = path.join(sandbox.sandboxRoot, "tmp");
  writeSandboxFile(survivingTarball);
  writeExistingDependencyTree(sandbox.sandboxRoot);
  fs.mkdirSync(tempDir, { recursive: true });
  writeExecutable(path.join(sandbox.fakeBinDir, "rm"), "#!/usr/bin/env bash\nexit 0\n");

  // Act
  const result = runBuildScript(sandbox, { TMPDIR: tempDir });

  // Assert
  assert.notEqual(result.status, 0, "surviving previous-build tarball must fail the build");
  assert.ok(fs.existsSync(survivingTarball), "the shim defeats removal, so the tarball must survive");
  assert.ok(
    `${result.stdout}${result.stderr}`.includes("previous-build artifact removal verification failed"),
    "output must report the removal-verification failure",
  );
  assert.ok(!fs.existsSync(generatedArtifact), "packaging must not run after a failed removal verification");
});
