import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getFixtureFiles, initFixtureRepo, runNodeCli } from "./helpers.js";

const TAB_SENSITIVE_FIXTURE_NAME = "fixture_go.go";

/**
 * @brief Verifies tab preservation in project-scoped source extraction.
 * @details Uses a repository-owned Go fixture and checks significant source bytes in three CLI modes; temporary repository cleanup is registered on the test context.
 * @satisfies TST-172
 */
test("project-scan source extraction preserves leading tabs for Go sources", (t) => {
  const goFixture = getFixtureFiles().find((fixture) => path.basename(fixture) === TAB_SENSITIVE_FIXTURE_NAME);
  assert.ok(goFixture, `missing ${TAB_SENSITIVE_FIXTURE_NAME}`);
  const { projectBase } = initFixtureRepo({ fixtures: [goFixture] });
  t.after(() => {
    fs.rmSync(projectBase, { recursive: true, force: true });
  });

  const summarize = runNodeCli(["--summarize"], projectBase);
  assert.equal(summarize.status, 0, summarize.stderr);
  assert.match(summarize.stdout, /\tvar wg sync\.WaitGroup/);

  const compress = runNodeCli(["--compress", "--enable-line-numbers"], projectBase);
  assert.equal(compress.status, 0, compress.stderr);
  assert.match(compress.stdout, /\d+: \t"context"/);

  const find = runNodeCli(["--find", "METHOD|FUNCTION", "^Start$", "--enable-line-numbers"], projectBase);
  assert.equal(find.status, 0, find.stderr);
  assert.match(find.stdout, /\d+: \ts\.Lock\(\)/);
});
