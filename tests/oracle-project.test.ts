import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LANGUAGE_TAGS } from "../src/core/find-constructs.js";
import { initFixtureRepo, runNodeCli, runPythonCli } from "./helpers.js";

function compareCli(args: string[], cwd: string) {
  const python = runPythonCli(args, cwd);
  const node = runNodeCli(args, cwd);
  assert.equal(node.status, python.status, `exit code mismatch for ${args.join(" ")}`);
  assert.equal(node.stdout, python.stdout, `stdout mismatch for ${args.join(" ")}`);
  assert.equal(node.stderr, python.stderr, `stderr mismatch for ${args.join(" ")}`);
}

test("project-scan commands match the Python oracle on a git-backed fixture repository", async (t) => {
  const { projectBase } = initFixtureRepo({
    staticCheck: {
      Python: [{ module: "Command", cmd: "false" }],
    },
  });

  await t.test("references", () => compareCli(["--references"], projectBase));
  await t.test("compress", () => compareCli(["--compress"], projectBase));
  await t.test("compress with line numbers", () => compareCli(["--compress", "--enable-line-numbers"], projectBase));
  await t.test("find", () => {
    const tagFilter = [...LANGUAGE_TAGS.python].sort().join("|");
    compareCli(["--find", tagFilter, ".*"], projectBase);
  });
  await t.test("tokens", () => compareCli(["--tokens"], projectBase));
  await t.test("files-static-check", () => compareCli(["--files-static-check", path.join(projectBase, "src", "fixture_python.py")], projectBase));
  await t.test("static-check", () => compareCli(["--static-check"], projectBase));
  await t.test("git-check", () => compareCli(["--git-check"], projectBase));
  await t.test("docs-check", () => compareCli(["--docs-check"], projectBase));
  await t.test("git-path", () => compareCli(["--git-path"], projectBase));
  await t.test("get-base-path", () => compareCli(["--get-base-path"], projectBase));
  await t.test("git-wt-name", () => {
    let matched = false;
    for (let attempt = 0; attempt < 3 && !matched; attempt += 1) {
      const python = runPythonCli(["--git-wt-name"], projectBase);
      const node = runNodeCli(["--git-wt-name"], projectBase);
      if (python.stdout === node.stdout && python.status === node.status && python.stderr === node.stderr) {
        matched = true;
      }
    }
    assert.ok(matched, "git-wt-name did not match Python oracle within 3 attempts");
  });
});

test("git worktree create/delete wrappers produce expected worktree side effects", () => {
  const { projectBase } = initFixtureRepo();
  const wtName = "pi-usereq-test-wt";

  const createResult = runNodeCli(["--git-wt-create", wtName], projectBase);
  assert.equal(createResult.status, 0, createResult.stderr);
  const worktreePath = path.join(path.dirname(projectBase), wtName);
  assert.ok(fs.existsSync(worktreePath), "worktree path was not created");
  assert.ok(fs.existsSync(path.join(worktreePath, ".pi", "pi-usereq", "config.json")), "project config was not copied into worktree");

  const deleteResult = runNodeCli(["--git-wt-delete", wtName], projectBase);
  assert.equal(deleteResult.status, 0, deleteResult.stderr);
  assert.ok(!fs.existsSync(worktreePath), "worktree path was not removed");
});
