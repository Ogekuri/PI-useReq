/**
 * @file
 * @brief Guards analysis commands against undeclared interpreter and checkout dependencies.
 * @details Runs CLI subprocesses with an allowlisted PATH containing only Git, the documented repository dependency. Node and tsx resolve from the current installation. Fixtures and configuration are repository-owned; all writes remain inside a disposable project.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getFixtureFiles, initFixtureRepo, runNodeCli } from "./helpers.js";

/**
 * @brief Executes file and project analysis without Python, req, or an upstream checkout on PATH.
 * @details Resolves Git before isolation, exposes only that executable in the child PATH, poisons legacy interpreter/module overrides, and asserts successful nonempty outputs. Also rejects legacy fixture configuration and virtualenv artifacts. Runtime is dominated by CLI subprocesses; cleanup removes the temporary repository.
 * @satisfies REQ-490, TST-172
 */
test("analysis commands need only declared Node dependencies and Git", async (t) => {
  const fixture = getFixtureFiles().find((file) => file.endsWith("fixture_python.py"));
  assert.ok(fixture);
  const { projectBase } = initFixtureRepo({ fixtures: [fixture] });
  t.after(() => fs.rmSync(projectBase, { recursive: true, force: true }));

  const gitProbe = spawnSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" });
  assert.equal(gitProbe.status, 0, gitProbe.stderr);
  const binDir = path.join(projectBase, "only-git");
  fs.mkdirSync(binDir);
  fs.symlinkSync(gitProbe.stdout.trim(), path.join(binDir, "git"));
  const unavailable = path.join(projectBase, "unavailable");
  const env = {
    PATH: binDir,
    PYTHONPATH: unavailable,
    PI_USEREQ_PYTHON: unavailable,
    PI_USEREQ_NODE_ROOT: unavailable,
  };
  const source = path.join("src", "fixture_python.py");
  const commands = [
    ["--files-tokens", source],
    ["--files-summarize", source],
    ["--files-compress", source, "--enable-line-numbers"],
    ["--files-find", "FUNCTION", "^req_cover_py_1$", source],
    ["--summarize"],
    ["--compress"],
    ["--find", "FUNCTION", "^req_cover_py_1$"],
    ["--tokens"],
  ];
  for (const args of commands) {
    await t.test(args[0]!, () => {
      const result = runNodeCli(args, projectBase, env);
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.ok(result.stdout.trim().length > 0);
    });
  }
  assert.equal(fs.existsSync(path.join(projectBase, ".req")), false);
  assert.equal(fs.existsSync(path.join(projectBase, ".venv")), false);
});
