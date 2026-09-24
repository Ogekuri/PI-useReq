import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  executeReqResetCommandExecution,
  prepareReqResetCommandExecution,
} from "../src/core/req-reset-command.js";
import { getDefaultConfig } from "../src/core/config.js";
import { initFixtureRepo } from "./helpers.js";

/**
 * @brief Verifies `req-reset` switches the main worktree off generated branches before forced branch deletion.
 * @details Prepares one fixture repository whose main worktree HEAD is left checked out on a generated prompt-command branch while a second generated branch remains pending, prepares and executes the `req-reset` plan without any session context, and verifies the main worktree switches back to the repository main branch before both generated branches are force-removed without git's checked-out-worktree rejection. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation and process cwd changes.
 * @return {Promise<void>} Promise resolved after main-branch recovery assertions complete.
 * @throws {AssertionError} Throws when the plan leaves generated branch cleanup blocked, fails to restore the main branch, or reports a failed reset.
 * @satisfies REQ-309, REQ-310, TST-106
 */
test("req-reset execution switches the main worktree back to the main branch before cleanup", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const projectName = path.basename(projectBase);
  const headBranchName = `PI-useReq-${projectName}-master-20260923165510`;
  const pendingBranchName = `PI-useReq-${projectName}-master-20260923165520`;
  try {
    process.chdir(projectBase);
    const headBranchCreate = spawnSync("git", ["branch", headBranchName], { cwd: projectBase, encoding: "utf8" });
    assert.equal(headBranchCreate.status, 0, headBranchCreate.stderr);
    const headSwitch = spawnSync("git", ["switch", headBranchName], { cwd: projectBase, encoding: "utf8" });
    assert.equal(headSwitch.status, 0, headSwitch.stderr);
    const pendingBranchCreate = spawnSync("git", ["branch", pendingBranchName], { cwd: projectBase, encoding: "utf8" });
    assert.equal(pendingBranchCreate.status, 0, pendingBranchCreate.stderr);

    const plan = prepareReqResetCommandExecution(projectBase, getDefaultConfig(projectBase));
    const result = await executeReqResetCommandExecution(plan);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual([...result.removedBranchNames].sort(), [headBranchName, pendingBranchName].sort());
    assert.equal(
      spawnSync("git", ["branch", "--show-current"], { cwd: projectBase, encoding: "utf8" }).stdout.trim(),
      "master",
    );
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${headBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${pendingBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies `req-reset` plan normalization cleans leftover worktrees when invoked from inside one.
 * @details Prepares one fixture repository with one generated worktree plus branch, changes the host process cwd into that worktree, prepares and executes the `req-reset` plan from the worktree base without any session context, and verifies the plan normalizes to the main repository so the generated worktree and branch are force-removed and the deleted live cwd is restored to the main base path. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation and process cwd changes.
 * @return {Promise<void>} Promise resolved after main-repository normalization assertions complete.
 * @throws {AssertionError} Throws when the plan leaves generated worktree artifacts behind or fails to restore the live cwd.
 * @satisfies REQ-309, REQ-310, TST-106
 */
test("req-reset execution removes leftover worktrees when prepared from inside one", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const parentPath = path.resolve(projectBase, "..");
  const projectName = path.basename(projectBase);
  const generatedBranchName = `PI-useReq-${projectName}-master-20260923165519`;
  const worktreeRoot = path.join(parentPath, generatedBranchName);
  try {
    const worktreeAdd = spawnSync(
      "git",
      ["worktree", "add", worktreeRoot, "-b", generatedBranchName],
      { cwd: projectBase, encoding: "utf8" },
    );
    assert.equal(worktreeAdd.status, 0, worktreeAdd.stderr);
    process.chdir(worktreeRoot);

    const plan = prepareReqResetCommandExecution(worktreeRoot, getDefaultConfig(projectBase));
    const result = await executeReqResetCommandExecution(plan);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual(result.removedWorktreeDirs, [generatedBranchName]);
    assert.equal(fs.existsSync(worktreeRoot), false);
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${generatedBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: projectBase, encoding: "utf8" }).stdout
        .includes(path.resolve(worktreeRoot)),
      false,
    );
    assert.equal(path.resolve(process.cwd()), path.resolve(projectBase));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});
/**
 * @brief Reads the `cwd` header from one fake session file.
 * @details Parses the first JSONL line and returns its `cwd` field when available so the fake `switchSession(...)` can mirror pi session-path semantics without a live runtime. Runtime is O(n) in header size. No external state is mutated.
 * @param[in] sessionFile {string} Session-file path.
 * @param[in] fallbackCwd {string} Fallback cwd when the file cannot be parsed.
 * @return {string} Parsed session cwd or the fallback value.
 */
function readFakeReqResetSessionCwd(sessionFile: string, fallbackCwd: string): string {
  try {
    const headerLine = fs.readFileSync(sessionFile, "utf8").split(/\r?\n/)[0] ?? "";
    const header = JSON.parse(headerLine) as { cwd?: unknown };
    return typeof header.cwd === "string" && header.cwd !== "" ? header.cwd : fallbackCwd;
  } catch {
    return fallbackCwd;
  }
}

/**
 * @brief Verifies `req-reset` returns the pi CLI to the main branch path before removing a generated worktree without persisted prompt state.
 * @details Prepares one fixture repository with one generated worktree plus branch whose session file links the original base-path session as `parentSession`, anchors the host process cwd and a pi-like command context inside that worktree without any persisted prompt execution plan, and executes the `req-reset` plan, verifying the command switches the active session back to the base-path session and re-anchors process plus context cwd surfaces onto the main base path BEFORE the worktree directory is removed. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation, session-file reads, process cwd changes, and fake session switching.
 * @return {Promise<void>} Promise resolved after pre-removal main-branch redirect assertions complete.
 * @throws {AssertionError} Throws when `req-reset` removes the worktree while the pi CLI is still anchored inside it, fails to switch back to the base-path session, or reports a failed reset.
 * @satisfies REQ-257, REQ-307, REQ-309, TST-106
 */
test("req-reset returns the pi CLI to the main branch path before removing a generated worktree without persisted prompt state", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const parentPath = path.resolve(projectBase, "..");
  const projectName = path.basename(projectBase);
  const generatedBranchName = `PI-useReq-${projectName}-master-20260923165522`;
  const worktreeRoot = path.join(parentPath, generatedBranchName);
  const sessionDir = path.join(os.tmpdir(), "pi-usereq-req-reset-sessions");
  let baseSessionFile = "";
  let executionSessionFile = "";
  let switchSessionTarget: string | undefined;
  let worktreeExistedAtSwitchTime: boolean | undefined;
  try {
    const worktreeAdd = spawnSync(
      "git",
      ["worktree", "add", worktreeRoot, "-b", generatedBranchName],
      { cwd: projectBase, encoding: "utf8" },
    );
    assert.equal(worktreeAdd.status, 0, worktreeAdd.stderr);

    fs.mkdirSync(sessionDir, { recursive: true });
    baseSessionFile = path.join(sessionDir, `base-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
    fs.writeFileSync(
      baseSessionFile,
      `${JSON.stringify({
        type: "session",
        version: 3,
        id: path.basename(baseSessionFile, ".jsonl"),
        timestamp: new Date(0).toISOString(),
        cwd: projectBase,
      })}\n`,
      "utf8",
    );
    executionSessionFile = path.join(sessionDir, `exec-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
    fs.writeFileSync(
      executionSessionFile,
      `${JSON.stringify({
        type: "session",
        version: 3,
        id: path.basename(executionSessionFile, ".jsonl"),
        timestamp: new Date(0).toISOString(),
        cwd: worktreeRoot,
        parentSession: baseSessionFile,
      })}\n`,
      "utf8",
    );

    let contextCwd = worktreeRoot;
    const ctx = {
      cwd: worktreeRoot,
      sessionManager: {
        getBranch: () => [],
        getCwd: () => contextCwd,
        getSessionDir: () => sessionDir,
        getSessionFile: () => executionSessionFile,
      },
      switchSession: async (sessionPath: string) => {
        switchSessionTarget = sessionPath;
        worktreeExistedAtSwitchTime = fs.existsSync(worktreeRoot);
        contextCwd = readFakeReqResetSessionCwd(sessionPath, contextCwd);
        process.chdir(contextCwd);
        return { cancelled: false };
      },
    };

    process.chdir(worktreeRoot);
    const plan = prepareReqResetCommandExecution(worktreeRoot, getDefaultConfig(projectBase));
    const result = await executeReqResetCommandExecution(plan, ctx);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual(result.removedWorktreeDirs, [generatedBranchName]);
    assert.equal(fs.existsSync(worktreeRoot), false);
    assert.equal(switchSessionTarget, path.resolve(baseSessionFile));
    assert.equal(worktreeExistedAtSwitchTime, true);
    assert.equal(path.resolve(process.cwd()), path.resolve(projectBase));
    assert.equal(path.resolve(ctx.cwd), path.resolve(projectBase));
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${generatedBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: projectBase, encoding: "utf8" }).stdout
        .includes(path.resolve(worktreeRoot)),
      false,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});
