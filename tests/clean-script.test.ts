import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @brief Describes one sandboxed `scripts/clean.sh` invocation context.
 * @details Stores the sandbox root acting as the synthetic repository root, the copied script path, and the external working directory used to prove repository-root resolution is independent from the caller cwd. The interface is compile-time only and introduces no runtime cost.
 */
interface CleanScriptSandbox {
  readonly sandboxRoot: string;
  readonly scriptPath: string;
  readonly callerCwd: string;
}

/**
 * @brief Describes one captured `scripts/clean.sh` process outcome.
 * @details Exposes the exit status plus decoded stdout and stderr so assertions stay behavioral. The interface is compile-time only and introduces no runtime cost.
 */
interface CleanScriptRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * @brief Creates one isolated sandbox hosting a copy of the cleanup script.
 * @details Copies the repository-owned `scripts/clean.sh` into `<sandbox>/scripts/clean.sh` so the script under test resolves the sandbox root as its repository root through its own location, and resolves a pre-existing external caller cwd outside the sandbox. Each call produces an independent temporary tree so no test relies on state left behind by another test. Runtime is O(n) in script size. Side effects include temporary directory and file creation.
 * @param[in] testContext {node:test.TestContext} Active node test context receiving the sandbox cleanup callback.
 * @return {CleanScriptSandbox} Sandbox paths for the script invocation.
 * @satisfies TST-191, TST-192
 */
function createCleanScriptSandbox(testContext: test.TestContext): CleanScriptSandbox {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-clean-script-"));
  testContext.after(() => {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  });
  const scriptsDir = path.join(sandboxRoot, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, "clean.sh");
  fs.copyFileSync(path.join(process.cwd(), "scripts", "clean.sh"), scriptPath);
  return { sandboxRoot, scriptPath, callerCwd: os.tmpdir() };
}

/**
 * @brief Runs the sandboxed cleanup script from an external working directory.
 * @details Invokes `bash <sandbox>/scripts/clean.sh` with the supplied options while anchoring the child cwd outside the sandbox so repository-root resolution from the script location is exercised on every run. Runtime is dominated by one bash subprocess. Side effects include process spawning and the filesystem mutations performed by the script under test inside the sandbox.
 * @param[in] sandbox {CleanScriptSandbox} Sandbox paths produced by `createCleanScriptSandbox`.
 * @param[in] options {string[]} Option tokens forwarded to the script.
 * @return {CleanScriptRunResult} Captured exit status plus decoded output streams.
 * @satisfies TST-191, TST-192
 */
function runCleanScript(sandbox: CleanScriptSandbox, options: string[]): CleanScriptRunResult {
  const result = spawnSync("bash", [sandbox.scriptPath, ...options], {
    cwd: sandbox.callerCwd,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * @brief Creates one non-empty file inside the sandbox, creating parent directories on demand.
 * @details Writes deterministic placeholder content so artifact assertions depend only on path existence, never on file bytes. Runtime is O(1). Side effects include file creation.
 * @param[in] absolutePath {string} Absolute file path inside the sandbox.
 * @return {void} No return value.
 */
function writeSandboxFile(absolutePath: string): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, "pi-usereq clean-script fixture\n", "utf8");
}

/**
 * @brief Verifies the cleanup script passes the bash syntax check.
 * @details Runs `bash -n` against the repository-owned `scripts/clean.sh` and expects exit status `0`, so syntactically invalid script revisions fail before any sandboxed behavior executes. Runtime is dominated by one bash subprocess. Side effects include process spawning.
 * @return {void} No return value.
 * @satisfies TST-191
 */
test("clean script passes bash syntax check", () => {
  // Arrange
  const scriptRelativePath = path.join("scripts", "clean.sh");

  // Act
  const syntax = spawnSync("bash", ["-n", scriptRelativePath], { cwd: process.cwd(), encoding: "utf8" });

  // Assert
  assert.equal(syntax.status, 0, syntax.stderr);
});

/**
 * @brief Verifies the default cleanup removes only generated release tarballs.
 * @details Arranges a sandbox with two root-level `dist/*.tgz` tarballs, one non-tarball `dist/` entry, and one `node_modules/` dependency tree, then runs the script without options from an external cwd. Asserts exit status `0`, one removal line per removed tarball, tarball deletion, non-tarball `dist/` entry preservation, `dist/` directory preservation while non-artifact entries remain, and `node_modules/` preservation. Runtime is dominated by one bash subprocess. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-191, REQ-591, REQ-592, REQ-593, REQ-594, REQ-596
 */
test("clean script default run removes only dist tarballs and preserves other entries", (testContext) => {
  // Arrange
  const sandbox = createCleanScriptSandbox(testContext);
  const firstTarball = path.join(sandbox.sandboxRoot, "dist", "pi-usereq-0.95.0.tgz");
  const secondTarball = path.join(sandbox.sandboxRoot, "dist", "pi-usereq-0.94.0.tgz");
  const preservedEntry = path.join(sandbox.sandboxRoot, "dist", "release-notes.txt");
  const dependencyTree = path.join(sandbox.sandboxRoot, "node_modules", "fixture-package", "index.js");
  writeSandboxFile(firstTarball);
  writeSandboxFile(secondTarball);
  writeSandboxFile(preservedEntry);
  writeSandboxFile(dependencyTree);

  // Act
  const result = runCleanScript(sandbox, []);

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(firstTarball), "first tarball must be removed");
  assert.ok(!fs.existsSync(secondTarball), "second tarball must be removed");
  assert.ok(fs.existsSync(preservedEntry), "non-tarball dist entry must be preserved");
  assert.ok(fs.existsSync(path.dirname(preservedEntry)), "dist directory must be preserved while entries remain");
  assert.ok(fs.existsSync(dependencyTree), "node_modules tree must be preserved by default");
  assert.ok(
    result.stdout.includes(`clean: removed artifact: ${firstTarball}`),
    "stdout must report the first tarball removal line",
  );
  assert.ok(
    result.stdout.includes(`clean: removed artifact: ${secondTarball}`),
    "stdout must report the second tarball removal line",
  );
});

/**
 * @brief Verifies the cleanup removes the artifact directory itself once emptied.
 * @details Arranges a sandbox whose `dist/` directory contains exactly one tarball, then runs the script without options. Asserts exit status `0`, tarball deletion, `dist/` directory removal, and the matching removal lines. Runtime is dominated by one bash subprocess. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-191, REQ-592, REQ-593, REQ-596
 */
test("clean script removes the dist directory itself when emptied by tarball removal", (testContext) => {
  // Arrange
  const sandbox = createCleanScriptSandbox(testContext);
  const distDir = path.join(sandbox.sandboxRoot, "dist");
  const tarball = path.join(distDir, "pi-usereq-0.95.0.tgz");
  writeSandboxFile(tarball);

  // Act
  const result = runCleanScript(sandbox, []);

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(tarball), "tarball must be removed");
  assert.ok(!fs.existsSync(distDir), "emptied dist directory must be removed");
  assert.ok(
    result.stdout.includes(`clean: removed artifact: ${distDir}`),
    "stdout must report the emptied dist directory removal line",
  );
});

/**
 * @brief Verifies the opt-in flags remove the dependency tree.
 * @details Arranges one sandbox per opt-in spelling with a `node_modules/` dependency tree, then runs the script with `--node-modules` and with `--all`. Asserts exit status `0`, dependency-tree removal, and the matching removal line for both spellings. Runtime is dominated by two bash subprocesses. Side effects are confined to the sandboxes.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-192, REQ-594, REQ-596
 */
test("clean script --node-modules and --all remove the node_modules tree", (testContext) => {
  for (const option of ["--node-modules", "--all"]) {
    // Arrange
    const sandbox = createCleanScriptSandbox(testContext);
    const nodeModulesDir = path.join(sandbox.sandboxRoot, "node_modules");
    writeSandboxFile(path.join(nodeModulesDir, "fixture-package", "index.js"));

    // Act
    const result = runCleanScript(sandbox, [option]);

    // Assert
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(nodeModulesDir), `${option} must remove the node_modules tree`);
    assert.ok(
      result.stdout.includes(`clean: removed artifact: ${nodeModulesDir}`),
      `${option} must report the node_modules removal line`,
    );
  }
});

/**
 * @brief Verifies unknown options are rejected with usage on stderr and exit code `2`.
 * @details Arranges an empty sandbox, runs the script with one unknown option, and asserts exit status `2`, the unknown-option diagnostic on stderr, and the usage document on stderr. Runtime is dominated by one bash subprocess. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-192, REQ-595
 */
test("clean script rejects unknown options with usage on stderr and exit code 2", (testContext) => {
  // Arrange
  const sandbox = createCleanScriptSandbox(testContext);

  // Act
  const result = runCleanScript(sandbox, ["--bogus"]);

  // Assert
  assert.equal(result.status, 2, "unknown option must exit 2");
  assert.ok(result.stderr.includes("clean: unknown option: --bogus"), "stderr must name the rejected option");
  assert.ok(result.stderr.includes("Usage: scripts/clean.sh"), "stderr must carry the usage document");
});

/**
 * @brief Verifies artifact-free runs succeed without removing anything.
 * @details Arranges an empty sandbox without `dist/` or `node_modules/`, runs the script without options, and asserts exit status `0` plus the skip notices so runs without build artifacts still succeed. Runtime is dominated by one bash subprocess. Side effects are confined to the sandbox.
 * @param[in] testContext {node:test.TestContext} Active node test context.
 * @return {void} No return value.
 * @satisfies TST-192, REQ-596
 */
test("clean script exits 0 when no build artifact exists", (testContext) => {
  // Arrange
  const sandbox = createCleanScriptSandbox(testContext);

  // Act
  const result = runCleanScript(sandbox, []);

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.includes("clean: no dist directory present; skipping tarball removal"),
    "stdout must report the absent dist directory",
  );
  assert.ok(result.stdout.includes("clean: all stages passed."), "stdout must report successful completion");
});
