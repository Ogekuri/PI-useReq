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
  config["context-files-requirements"] = false;
  config["context-files-references"] = false;
  config["context-files-workflow"] = false;
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
  config["context-files-requirements"] = false;
  config["context-files-references"] = false;
  config["context-files-workflow"] = false;
  const rendered = renderPrompt("write", "Build a CLI parser", projectBase, config);
  assert.match(rendered, /Git Read-Only Restriction/);
  assert.doesNotMatch(rendered, /git commit -m/);
  assert.doesNotMatch(rendered, /%%COMMIT%%/);
});

test("pi.dev-aware prompts inject read-only governance and interface-contract mandates when the coding-agent-docs tree exists", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
  assert.match(rendered, /Treat every path under `docs\/` as read-only/);
  assert.match(rendered, /do NOT modify any documentation file, including those under `docs\/pi\.dev\/`\./);
  assert.match(rendered, /Treat every path under `pi\.dev-src\/` as read-only/);
  assert.match(rendered, /do NOT modify `pi\.dev-src\/pi-mono` or any other pi client source\./);
  assert.match(rendered, /review `docs\/pi\.dev\/coding-agent-docs\/` before analysis, implementation, verification, or bug fixing\./);
  assert.match(rendered, /`docs\/pi\.dev\/coding-agent-docs\/` as the authoritative read-only interface contract/);
  assert.match(rendered, /new or modified pi\.dev CLI integrations MUST comply with the APIs they describe\./);
});

test("pi.dev-aware prompts treat the optional manifest as part of the read-only interface contract when present", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
  assert.match(rendered, /If `docs\/pi\.dev\/agent-document-manifest\.json` exists under `docs\/pi\.dev\/`, treat every document path it references as part of the read-only interface contract\./);
});

test("pi.dev-aware prompts require pi client source validation for ambiguous or bug-fix interface work", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
  assert.match(rendered, /If `docs\/pi\.dev\/coding-agent-docs\/` guidance is ambiguous for extension-to-pi-client interface behavior, validate the produced source code by analyzing `pi\.dev-src\/pi-mono`\./);
  assert.match(rendered, /For bug fixes or problem resolution influenced by extension-to-pi-client interface implementations, validate the produced source code by analyzing `pi\.dev-src\/pi-mono`\./);
});

test("pi.dev-aware prompts stay unchanged when the coding-agent-docs tree is absent", () => {
  ensureBundledResourcesAccessible();
  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-prompts-"));
  try {
    const config = getDefaultConfig(projectBase);
    const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
    assert.doesNotMatch(rendered, /docs\/pi\.dev\/coding-agent-docs/);
    assert.doesNotMatch(rendered, /authoritative read-only interface contract/);
    assert.doesNotMatch(rendered, /Treat every path under `docs\/` as read-only/);
    assert.doesNotMatch(rendered, /pi\.dev-src\/pi-mono/);
    assert.doesNotMatch(rendered, /agent-document-manifest\.json/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies the context-files block replaces only the dedicated trailing `%%CONTEXT_FILES%%` placeholder.
 * @details Renders `req-analyze`, whose bundled template contains one inline backticked reference to the token inside the Iteration and Context Economy rules plus the dedicated placeholder terminating the `## Context Files` section, and asserts that the inline prose reference stays verbatim while each context-file section appears exactly once in the documented `REQUIREMENTS.md`, `REFERENCES.md`, `WORKFLOW.md` order after the Context Files preamble. Runtime is dominated by bundled prompt and context-file reads. No external state is mutated.
 * @pre The installation-owned bundled resources are accessible and the canonical context files exist under the configured docs directory.
 * @param[in] none {void} No parameters; the test arranges default configuration with all three context-file flags enabled.
 * @return {void} Passes when the inline token reference survives and the injected sections are unique, ordered, and positioned after `## Context Files`; fails otherwise.
 * @satisfies REQ-329, REQ-332
 */
test("context files injection replaces only the dedicated trailing placeholder and preserves inline prose references", () => {
  ensureBundledResourcesAccessible();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("analyze", "Inspect context-file injection", projectBase, config);
  assert.match(
    rendered,
    /provided as injected `%%CONTEXT_FILES%%` context or already read in the current session; reuse prior tool-output evidence instead\./,
  );
  const contextFilesHeadingIndex = rendered.indexOf("## Context Files");
  const requirementsIndex = rendered.indexOf("### REQUIREMENTS.md");
  const referencesIndex = rendered.indexOf("### REFERENCES.md");
  const workflowIndex = rendered.indexOf("### WORKFLOW.md");
  assert.ok(contextFilesHeadingIndex !== -1);
  assert.ok(requirementsIndex !== -1);
  assert.ok(referencesIndex !== -1);
  assert.ok(workflowIndex !== -1);
  assert.ok(contextFilesHeadingIndex < requirementsIndex);
  assert.ok(requirementsIndex < referencesIndex);
  assert.ok(referencesIndex < workflowIndex);
  assert.equal(rendered.indexOf("### REQUIREMENTS.md", requirementsIndex + 1), -1);
  assert.equal(rendered.indexOf("### REFERENCES.md", referencesIndex + 1), -1);
  assert.equal(rendered.indexOf("### WORKFLOW.md", workflowIndex + 1), -1);
});
