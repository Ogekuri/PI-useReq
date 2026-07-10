import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STATIC_CHECK_LANGUAGES,
  getDefaultConfig,
} from "../src/core/config.js";
import { renderPromptCommandSummary } from "../src/core/prompts.js";

/**
 * @brief Builds a configuration with no enabled context files, no enabled static-check languages, and no enabled tools.
 * @details Clones the documented default configuration, disables every context-file flag, forces every canonical static-check language to `disable`, and empties the enabled-tool list so the command invocation summary is forced to render the `none` placeholder for all three empty-category fields. Runtime is O(l) in supported language count. No external state is mutated.
 * @param[in] projectBase {string} Absolute project root path used to seed the default configuration.
 * @return {ReturnType<typeof getDefaultConfig>} Configuration object with all three summary categories empty.
 */
function buildEmptySummaryConfig(projectBase: string): ReturnType<typeof getDefaultConfig> {
  const config = getDefaultConfig(projectBase);
  config["context-files-requirements"] = false;
  config["context-files-references"] = false;
  config["context-files-workflow"] = false;
  for (const language of DEFAULT_STATIC_CHECK_LANGUAGES) {
    config["static-check"][language] = { ...config["static-check"][language], enabled: "disable" };
  }
  config["enabled-tools"] = [];
  return config;
}

test("renderPromptCommandSummary renders none for empty context files, static code checks, and enabled tools", () => {
  const projectBase = process.cwd();
  const config = buildEmptySummaryConfig(projectBase);
  const summary = renderPromptCommandSummary("analyze", "Inspect runtime behavior", config);
  assert.match(summary, /Command: ANALYZE/);
  assert.match(summary, /User's Request: Inspect runtime behavior/);
  assert.match(summary, /- context files:       none/);
  assert.match(summary, /- static code checks:  none/);
  assert.match(summary, /- enabled tools:       none/);
});
