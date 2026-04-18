import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { LANGUAGE_TAGS } from "../src/core/find-constructs.js";
import { detectLanguage } from "../src/core/generate-markdown.js";
import { getFixtureFiles, runNodeCli, runPythonCli } from "./helpers.js";

function compareCli(args: string[]) {
  const python = runPythonCli(args);
  const node = runNodeCli(args);
  assert.equal(node.status, python.status, `exit code mismatch for ${args.join(" ")}`);
  assert.equal(node.stdout, python.stdout, `stdout mismatch for ${args.join(" ")}`);
  assert.equal(node.stderr, python.stderr, `stderr mismatch for ${args.join(" ")}`);
}

test("standalone command outputs match the Python oracle for every fixture", async (t) => {
  const fixtures = getFixtureFiles();
  for (const fixture of fixtures) {
    const fileName = path.basename(fixture);
    await t.test(`files-tokens ${fileName}`, () => {
      compareCli(["--files-tokens", fixture]);
    });
    await t.test(`files-compress ${fileName}`, () => {
      compareCli(["--files-compress", fixture]);
    });
    await t.test(`files-compress --enable-line-numbers ${fileName}`, () => {
      compareCli(["--files-compress", fixture, "--enable-line-numbers"]);
    });
    await t.test(`files-find ${fileName}`, () => {
      const language = detectLanguage(fixture);
      assert.ok(language);
      const tagFilter = [...LANGUAGE_TAGS[language!]!].sort().join("|");
      compareCli(["--files-find", tagFilter, ".*", fixture]);
    });
    await t.test(`test-static-check dummy ${fileName}`, () => {
      compareCli(["--test-static-check", "dummy", fixture]);
    });
    await t.test(`test-static-check pylance ${fileName}`, () => {
      compareCli(["--test-static-check", "pylance", fixture]);
    });
    await t.test(`test-static-check ruff ${fileName}`, () => {
      compareCli(["--test-static-check", "ruff", fixture]);
    });
    await t.test(`test-static-check command ${fileName}`, () => {
      compareCli(["--test-static-check", "command", "false", fixture]);
    });
  }
});
