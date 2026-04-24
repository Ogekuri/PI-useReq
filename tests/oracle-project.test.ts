import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createStaticCheckLanguageConfig } from "../src/core/config.js";
import { LANGUAGE_TAGS } from "../src/core/find-constructs.js";
import { getFixtureFiles, initFixtureRepo, runNodeCli, runPythonCli } from "./helpers.js";

const TAB_SENSITIVE_FIXTURE_NAME = "fixture_go.go";

/**
 * @brief Compares one project-scoped Node CLI execution against the Python oracle.
 * @details Executes the same repository command through both implementations and asserts exact equality for exit status, stdout, and stderr. Runtime is dominated by subprocess execution. Side effects are limited to child processes.
 * @param[in] args {string[]} CLI argument vector forwarded to both implementations.
 * @param[in] cwd {string} Project root used as the working directory.
 * @return {void} No return value.
 */
function compareCli(args: string[], cwd: string): void {
  const python = runPythonCli(args, cwd);
  const node = runNodeCli(args, cwd);
  assert.equal(node.status, python.status, `exit code mismatch for ${args.join(" ")}`);
  assert.equal(node.stdout, python.stdout, `stdout mismatch for ${args.join(" ")}`);
  assert.equal(node.stderr, python.stderr, `stderr mismatch for ${args.join(" ")}`);
}

test("project-scan commands match the Python oracle on a git-backed repository without preserved leading tabs", async (t) => {
  const fixtures = getFixtureFiles().filter((fixture) => path.basename(fixture) !== TAB_SENSITIVE_FIXTURE_NAME);
  const { projectBase } = initFixtureRepo({
    fixtures,
    staticCheck: {
      Python: createStaticCheckLanguageConfig([{ module: "Command", cmd: "false" }], "enable"),
    },
  });
  t.after(() => {
    fs.rmSync(projectBase, { recursive: true, force: true });
  });

  await t.test("references", () => compareCli(["--references"], projectBase));
  await t.test("compress", () => compareCli(["--compress"], projectBase));
  await t.test("compress with line numbers", () => compareCli(["--compress", "--enable-line-numbers"], projectBase));
  await t.test("find", () => {
    const tagFilter = [...LANGUAGE_TAGS.python].sort().join("|");
    compareCli(["--find", tagFilter, ".*"], projectBase);
  });
  await t.test("tokens", () => compareCli(["--tokens"], projectBase));
});

test("project-scan source extraction preserves leading tabs for Go sources", (t) => {
  const goFixture = getFixtureFiles().find((fixture) => path.basename(fixture) === TAB_SENSITIVE_FIXTURE_NAME);
  assert.ok(goFixture, `missing ${TAB_SENSITIVE_FIXTURE_NAME}`);
  const { projectBase } = initFixtureRepo({ fixtures: [goFixture] });
  t.after(() => {
    fs.rmSync(projectBase, { recursive: true, force: true });
  });

  const references = runNodeCli(["--references"], projectBase);
  assert.equal(references.status, 0, references.stderr);
  assert.match(references.stdout, /\tvar wg sync\.WaitGroup/);

  const compress = runNodeCli(["--compress", "--enable-line-numbers"], projectBase);
  assert.equal(compress.status, 0, compress.stderr);
  assert.match(compress.stdout, /\d+: \t"context"/);

  const find = runNodeCli(["--find", "METHOD|FUNCTION", "^Start$", "--enable-line-numbers"], projectBase);
  assert.equal(find.status, 0, find.stderr);
  assert.match(find.stdout, /\d+: \ts\.Lock\(\)/);
});
