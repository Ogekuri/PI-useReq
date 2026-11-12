import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @brief Describes one sandboxed `scripts/pre-release-check.sh` invocation context.
 * @details Stores the sandbox root acting as the synthetic repository root, the copied gate script path, the fake toolchain bin directory, the sandbox-local temporary directory, and the external working directory proving repository-root resolution is caller-cwd independent. The interface is compile-time only and introduces no runtime cost.
 */
interface PreReleaseCheckSandbox {
  readonly sandboxRoot: string;
  readonly scriptPath: string;
  readonly fakeBinDir: string;
  readonly tempDir: string;
  readonly callerCwd: string;
}

/**
 * @brief Describes one captured `scripts/pre-release-check.sh` process outcome.
 * @details Exposes the exit status plus decoded stdout and stderr so assertions stay behavioral. The interface is compile-time only and introduces no runtime cost.
 */
interface PreReleaseCheckRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * @brief Writes one UTF-8 file inside the sandbox, creating parent directories on demand.
 * @details Stores deterministic placeholder content so artifact assertions depend only on path existence. Runtime is O(1). Side effects include directory and file creation.
 * @param[in] absolutePath {string} Absolute file path inside the sandbox.
 * @param[in] content {string} File content to persist.
 * @return {void} No return value.
 */
function writeSandboxFile(absolutePath: string, content = "pi-usereq pre-release fixture\n"): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

/**
 * @brief Writes one executable shell script inside the sandbox.
 * @details Creates parent directories, writes the supplied body, and marks the file owner-executable so the sandboxed gate can invoke fake toolchain commands through `PATH`. Runtime is O(n) in script size. Side effects include directory creation, file creation, and permission changes.
 * @param[in] absolutePath {string} Absolute script path inside the sandbox.
 * @param[in] content {string} Complete bash script body.
 * @return {void} No return value.
 */
function writeExecutable(absolutePath: string, content: string): void {
  writeSandboxFile(absolutePath, content);
  fs.chmodSync(absolutePath, 0o755);
}

/**
 * @brief Creates one isolated sandbox hosting a copy of the gate script plus a fake toolchain.
 * @details Copies the repository-owned `scripts/pre-release-check.sh` into `<sandbox>/scripts/pre-release-check.sh`, writes a fake `scripts/build.sh` that produces a structurally valid release tarball, and writes fake `git`, `node`, and `npm` executables into `<sandbox>/fake-bin` whose behavior satisfies every gate stage without touching the real repository. The sandbox also owns a local `TMPDIR` so gate telemetry files never escape the temporary tree. Runtime is O(n) in script size. Side effects include temporary directory and file creation.
 * @param[in] testContext {node:test.TestContext} Active node test context receiving the sandbox cleanup callback.
 * @return {PreReleaseCheckSandbox} Sandbox paths for the gate invocation.
 * @satisfies TST-198
 */
function createPreReleaseCheckSandbox(testContext: test.TestContext): PreReleaseCheckSandbox {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-pre-release-check-"));
  testContext.after(() => {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  });
  const scriptsDir = path.join(sandboxRoot, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, "pre-release-check.sh");
  fs.copyFileSync(path.join(process.cwd(), "scripts", "pre-release-check.sh"), scriptPath);
  writeSandboxFile(path.join(sandboxRoot, "package.json"), '{"name":"pi-usereq","version":"9.9.9"}\n');
  writeExecutable(
    path.join(scriptsDir, "build.sh"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "mkdir -p dist .fake-package/package/src .fake-package/package/scripts",
      "printf '{}\\n' > .fake-package/package/package.json",
      "printf 'license\\n' > .fake-package/package/LICENSE",
      "printf 'readme\\n' > .fake-package/package/README.md",
      "printf 'extension\\n' > .fake-package/package/src/index.ts",
      "printf 'launcher\\n' > .fake-package/package/scripts/pi-usereq.js",
      "tar -czf dist/pi-usereq-9.9.9.tgz -C .fake-package package",
      "rm -rf .fake-package",
      "exit 0",
      "",
    ].join("\n"),
  );

  const tempDir = path.join(sandboxRoot, "tmp");
  fs.mkdirSync(tempDir, { recursive: true });

  const fakeBinDir = path.join(sandboxRoot, "fake-bin");
  writeExecutable(
    path.join(fakeBinDir, "git"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [[ "${1:-}" == "status" ]]; then',
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
      "  mkdir -p node_modules/.bin",
      "  printf '#!/usr/bin/env bash\\nexit 0\\n' > node_modules/.bin/tsc",
      "  chmod +x node_modules/.bin/tsc",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );

  return { sandboxRoot, scriptPath, fakeBinDir, tempDir, callerCwd: os.tmpdir() };
}

/**
 * @brief Runs the sandboxed gate script from an external working directory.
 * @details Invokes `bash <sandbox>/scripts/pre-release-check.sh` with the sandbox fake toolchain prepended to `PATH` and the sandbox-local `TMPDIR` so gate telemetry stays inside the temporary tree. Runtime is dominated by the delegated fake gate stages. Side effects include process spawning and the filesystem mutations performed by the script under test inside the sandbox.
 * @param[in] sandbox {PreReleaseCheckSandbox} Sandbox paths produced by `createPreReleaseCheckSandbox`.
 * @param[in] envOverrides {NodeJS.ProcessEnv | undefined} Optional environment additions or overrides.
 * @return {PreReleaseCheckRunResult} Captured exit status plus decoded output streams.
 * @satisfies TST-198
 */
function runPreReleaseCheck(sandbox: PreReleaseCheckSandbox, envOverrides?: NodeJS.ProcessEnv): PreReleaseCheckRunResult {
  const result = spawnSync("bash", [sandbox.scriptPath], {
    cwd: sandbox.callerCwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TMPDIR: sandbox.tempDir,
      PATH: `${sandbox.fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
      ...envOverrides,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * @brief Writes a no-op `rm` shim that defeats artifact removal inside the sandbox.
 * @details Makes every removal call succeed without deleting anything so the gate removal-verification stage can be exercised deterministically. Runtime is O(1). Side effects include executable file creation.
 * @param[in] sandbox {PreReleaseCheckSandbox} Sandbox whose fake toolchain receives the shim.
 * @return {void} No return value.
 * @satisfies TST-198
 */
function writeNoOpRemoveShim(sandbox: PreReleaseCheckSandbox): void {
  writeExecutable(path.join(sandbox.fakeBinDir, "rm"), "#!/usr/bin/env bash\nexit 0\n");
}

/**
 * @brief Verifies bootstrap removal of pre-existing release artifacts plus successful artifact retention.
 * @details Arranges a sandbox with one previous-release `dist/pi-usereq-0.0.1.tgz` tarball and one non-tarball `dist/` entry, then runs the gate from an external cwd. Asserts exit status `0`, removal of the pre-existing tarball, preservation of the non-tarball entry, retention of the newly generated artifact, and the removal plus verification status lines. Runtime is dominated by the sandboxed fake gate stages. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-198, REQ-604, REQ-605, REQ-606, REQ-608
 */
test("pre-release gate removes pre-existing release artifacts and verifies the removal", (testContext) => {
  // Arrange
  const sandbox = createPreReleaseCheckSandbox(testContext);
  const distDir = path.join(sandbox.sandboxRoot, "dist");
  const previousTarball = path.join(distDir, "pi-usereq-0.0.1.tgz");
  const preservedEntry = path.join(distDir, "release-notes.txt");
  const generatedArtifact = path.join(distDir, "pi-usereq-9.9.9.tgz");
  writeSandboxFile(previousTarball);
  writeSandboxFile(preservedEntry);

  // Act
  const result = runPreReleaseCheck(sandbox);

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(previousTarball), "pre-existing release tarball must be removed at bootstrap");
  assert.ok(fs.existsSync(preservedEntry), "non-tarball dist entry must be preserved");
  assert.ok(fs.existsSync(generatedArtifact), "generated release artifact must be retained on success");
  assert.ok(
    result.stdout.includes(`pre-release-check: removed previous-release artifact: ${previousTarball}`),
    "stdout must report the pre-existing tarball removal",
  );
  assert.ok(
    result.stdout.includes("pre-release-check: verified absence of previous-release tarballs"),
    "stdout must report the removal verification",
  );
});

/**
 * @brief Verifies the gate aborts when a previous-release artifact survives removal.
 * @details Arranges a sandbox with one pre-existing `dist/*.tgz` tarball and a no-op `rm` shim, then runs the gate from an external cwd. Asserts a non-zero exit status, the removal-verification failure diagnostic, and absence of the generated artifact because packaging never ran. Runtime is dominated by the sandboxed fake gate stages. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-198, REQ-605
 */
test("pre-release gate aborts when a previous-release artifact survives removal", (testContext) => {
  // Arrange
  const sandbox = createPreReleaseCheckSandbox(testContext);
  const distDir = path.join(sandbox.sandboxRoot, "dist");
  const survivingTarball = path.join(distDir, "pi-usereq-0.0.1.tgz");
  const generatedArtifact = path.join(distDir, "pi-usereq-9.9.9.tgz");
  writeSandboxFile(survivingTarball);
  writeNoOpRemoveShim(sandbox);

  // Act
  const result = runPreReleaseCheck(sandbox);

  // Assert
  assert.notEqual(result.status, 0, "surviving release artifact must fail the gate");
  assert.ok(fs.existsSync(survivingTarball), "the shim defeats removal, so the tarball must survive");
  assert.ok(
    result.stderr.includes("previous-release artifact removal verification failed"),
    "stderr must report the removal-verification failure",
  );
  assert.ok(
    result.stderr.includes(`pre-release-check: FAIL: previous-release artifact still present: ${survivingTarball}`),
    "stderr must report the surviving tarball path",
  );
  assert.ok(!fs.existsSync(generatedArtifact), "packaging must not run after a failed removal verification");
});
