import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultConfig } from "../src/core/config.js";
import { buildRuntimePathContext, buildRuntimePathFacts } from "../src/core/path-context.js";
import { renderPrompt } from "../src/core/prompts.js";
import { ensureBundledResourcesAccessible } from "../src/core/resources.js";

/**
 * @brief Escapes regular-expression metacharacters for literal-path assertions.
 * @details Replaces every regex-significant character with an escaped fragment so tests can assert exact rendered path strings without interpreting path punctuation as pattern syntax. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] value {string} Literal string to escape.
 * @return {string} Regex-safe literal fragment.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("installed bundled resources remain readable from the installation path", () => {
  const resourceRoot = ensureBundledResourcesAccessible();
  assert.ok(fs.existsSync(path.join(resourceRoot, "prompts", "analyze.md")));
  assert.ok(fs.existsSync(path.join(resourceRoot, "templates", "Requirements_Template.md")));
  assert.ok(fs.existsSync(path.join(resourceRoot, "guidelines", "Google_Python_Style_Guide.md")));
});

test("prompt rendering replaces all dynamic placeholders and adapts req tool references", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  config["src-dir"] = ["src", "scripts", ".github/workflows"];
  config["tests-dir"] = "tests";
  const runtimePathFacts = buildRuntimePathFacts(buildRuntimePathContext(projectBase, config, { gitPath: config["git-path"] }));
  const rendered = renderPrompt("write", "Build a CLI parser", projectBase, config);
  assert.match(rendered, /Build a CLI parser/);
  assert.match(rendered, /req\/docs/);
  assert.match(rendered, new RegExp(escapeRegExp(runtimePathFacts.templates_path)));
  assert.match(rendered, /`src\/`, `scripts\/`, `\.github\/workflows\/`/);
  assert.doesNotMatch(rendered, /%%ARGS%%|%%DOC_PATH%%|%%GUIDELINES_FILES%%|%%TEMPLATE_PATH%%|%%SRC_PATHS%%|%%TEST_PATH%%|%%EXECUTION_PATH%%|%%INSTALLATION_PATH%%|%%CONFIG_PATH%%/);
});

test("pi.dev-aware prompts inject manifest conformance rules when the manifest exists", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
  assert.match(rendered, /docs\/pi\.dev\/agent-document-manifest\.json/);
  assert.match(rendered, /Treat manifest document paths as relative to `docs\/pi\.dev\/`/);
});

test("pi.dev-aware prompts stay unchanged when the manifest is absent", () => {
  ensureBundledResourcesAccessible();
  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-prompts-"));
  try {
    const config = getDefaultConfig(projectBase);
    const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
    assert.doesNotMatch(rendered, /docs\/pi\.dev\/agent-document-manifest\.json/);
    assert.doesNotMatch(rendered, /Treat manifest document paths as relative to `docs\/pi\.dev\/`/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});
