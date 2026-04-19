import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { LANGUAGE_TAGS } from "../src/core/find-constructs.js";
import { detectLanguage } from "../src/core/generate-markdown.js";
import { getFixtureFiles, runNodeCli, runPythonCli } from "./helpers.js";

/**
 * @brief Compares one standalone Node CLI execution against the Python oracle.
 * @details Executes the same explicit-file command through both implementations and asserts exact equality for exit status, stdout, and stderr. Runtime is dominated by subprocess execution. Side effects are limited to child processes.
 * @param[in] args {string[]} CLI argument vector forwarded to both implementations.
 * @return {void} No return value.
 */
function compareCli(args: string[]): void {
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
  }
});
