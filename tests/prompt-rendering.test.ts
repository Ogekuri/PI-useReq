import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureHomeResources } from "../src/core/resources.js";
import { getDefaultConfig } from "../src/core/config.js";
import { renderPrompt } from "../src/core/prompts.js";

test("embedded resources are copied under the user home pi-usereq resource root", () => {
  const resourceRoot = ensureHomeResources();
  assert.ok(fs.existsSync(path.join(resourceRoot, "prompts", "analyze.md")));
  assert.ok(fs.existsSync(path.join(resourceRoot, "templates", "Requirements_Template.md")));
  assert.ok(fs.existsSync(path.join(resourceRoot, "guidelines", "Google_Python_Style_Guide.md")));
});

test("prompt rendering replaces all dynamic placeholders and adapts req tool references", () => {
  ensureHomeResources();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  config["src-dir"] = ["src", "scripts", ".github/workflows"];
  config["tests-dir"] = "tests";
  const rendered = renderPrompt("write", "Build a CLI parser", projectBase, config);
  assert.match(rendered, /Build a CLI parser/);
  assert.match(rendered, /req\/docs/);
  assert.match(rendered, /~\/\.pi\/pi-usereq\/resources\/templates/);
  assert.match(rendered, /`src\/`, `scripts\/`, `\.github\/workflows\/`/);
  assert.match(rendered, /Build a CLI parser/);
  assert.match(rendered, /`src\/`, `scripts\/`, `\.github\/workflows\/`/);
  assert.doesNotMatch(rendered, /%%ARGS%%|%%DOC_PATH%%|%%GUIDELINES_FILES%%|%%TEMPLATE_PATH%%|%%SRC_PATHS%%|%%TEST_PATH%%/);
});

test("pi.dev-aware prompts inject manifest conformance rules when the manifest exists", () => {
  ensureHomeResources();
  const projectBase = process.cwd();
  const config = getDefaultConfig(projectBase);
  const rendered = renderPrompt("new", "Add pi integration guidance", projectBase, config);
  assert.match(rendered, /docs\/pi\.dev\/agent-document-manifest\.json/);
  assert.match(rendered, /Treat manifest document paths as relative to `docs\/pi\.dev\/`/);
});

test("pi.dev-aware prompts stay unchanged when the manifest is absent", () => {
  ensureHomeResources();
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
