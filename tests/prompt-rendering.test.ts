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
  assert.ok(fs.existsSync(path.join(resourceRoot, "instructions", "git_commit.md")));
  assert.ok(fs.existsSync(path.join(resourceRoot, "instructions", "git_read-only.md")));
  assert.ok(fs.existsSync(path.join(resourceRoot, "templates", "Requirements_Template.md")));
  assert.ok(fs.existsSync(path.join(resourceRoot, "guidelines", "Google_Python_Style_Guide.md")));
});

test("prompt rendering replaces dynamic placeholders, expands commit instructions, and adapts req tool references", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  config["src-dir"] = ["src", "scripts", ".github/workflows"];
  config["tests-dir"] = "tests";
  const runtimePathFacts = buildRuntimePathFacts(
    buildRuntimePathContext(projectBase, projectBase, config),
  );
  const rendered = renderPrompt("write", "Build a CLI parser", projectBase, config);
  assert.match(rendered, /Build a CLI parser/);
  assert.match(rendered, /req\/docs/);
  assert.match(rendered, new RegExp(escapeRegExp(runtimePathFacts.template_path)));
  assert.match(rendered, /`src\/`, `scripts\/`, `\.github\/workflows\/`/);
  assert.match(rendered, /runtime-substituted token `write`/);
  assert.doesNotMatch(rendered, /%%ARGS%%|%%DOC_PATH%%|%%GUIDELINES_FILES%%|%%TEMPLATE_PATH%%|%%SRC_PATHS%%|%%TEST_PATH%%|%%CONTEXT_PATH%%|%%INSTALLATION_PATH%%|%%CONFIG_PATH%%|%%PROMPT%%|%%COMMIT%%/);
});

test("prompt rendering injects the bundled read-only git instruction when auto git commit is disabled", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  config.AUTO_GIT_COMMIT = "disable";
  const rendered = renderPrompt("write", "Build a CLI parser", projectBase, config);
  assert.match(rendered, /Git Read-Only Restriction/);
  assert.doesNotMatch(rendered, /git commit -m/);
  assert.doesNotMatch(rendered, /%%COMMIT%%/);
});

test("pi.dev-aware prompts inject read-only governance and interface-contract mandates when the manifest exists", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
  assert.match(rendered, /Treat every path under `docs\/` as read-only/);
  assert.match(rendered, /do NOT modify `docs\/pi\.dev\/agent-document-manifest\.json` or any other documentation file\./);
  assert.match(rendered, /Treat every path under `pi\.dev-src\/` as read-only/);
  assert.match(rendered, /do NOT modify `pi\.dev-src\/pi-mono` or any other pi client source\./);
  assert.match(rendered, /read `docs\/pi\.dev\/agent-document-manifest\.json` and every document path it references/);
  assert.match(rendered, /`docs\/pi\.dev\/coding-agent-docs\/` and documents referenced by `docs\/pi\.dev\/agent-document-manifest\.json` as the authoritative read-only interface contract/);
  assert.match(rendered, /new or modified pi\.dev CLI integrations MUST comply with the APIs they describe\./);
  assert.match(rendered, /Treat manifest document paths as relative to `docs\/pi\.dev\/`/);
});

test("pi.dev-aware prompts require pi client source validation for ambiguous or bug-fix interface work", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
  assert.match(rendered, /If manifest or `docs\/pi\.dev\/coding-agent-docs\/` guidance is ambiguous for extension-to-pi-client interface behavior, validate the produced source code by analyzing `pi\.dev-src\/pi-mono`\./);
  assert.match(rendered, /For bug fixes or problem resolution influenced by extension-to-pi-client interface implementations, validate the produced source code by analyzing `pi\.dev-src\/pi-mono`\./);
});

test("pi.dev-aware prompts stay unchanged when the manifest is absent", () => {
  ensureBundledResourcesAccessible();
  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-prompts-"));
  try {
    const config = getDefaultConfig(projectBase);
    const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
    assert.doesNotMatch(rendered, /docs\/pi\.dev\/agent-document-manifest\.json/);
    assert.doesNotMatch(rendered, /authoritative read-only interface contract/);
    assert.doesNotMatch(rendered, /Treat every path under `docs\/` as read-only/);
    assert.doesNotMatch(rendered, /pi\.dev-src\/pi-mono/);
    assert.doesNotMatch(rendered, /Treat manifest document paths as relative to `docs\/pi\.dev\/`/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});
