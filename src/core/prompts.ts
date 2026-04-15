import fs from "node:fs";
import path from "node:path";
import { buildPromptReplacementPaths, type UseReqConfig } from "./config.js";
import { readBundledPrompt } from "./resources.js";

const TOOL_REFERENCE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/`req --find`/g, "`find` tool"],
  [/`req --files-find`/g, "`files-find` tool"],
  [/`req --references`/g, "`references` tool"],
  [/`req --compress`/g, "`compress` tool"],
  [/`req --tokens`/g, "`tokens` tool"],
  [/`req --static-check`/g, "`static-check` tool"],
  [/`req --files-static-check`/g, "`files-static-check` tool"],
  [/`req --git-check`/g, "`git-check` tool"],
  [/`req --docs-check`/g, "`docs-check` tool"],
  [/`req --git-wt-name`/g, "`git-wt-name` tool"],
  [/`req --git-wt-create`/g, "`git-wt-create` tool"],
  [/`req --git-wt-delete`/g, "`git-wt-delete` tool"],
  [/`req --git-path`/g, "`git-path` tool"],
  [/`req --get-base-path`/g, "`get-base-path` tool"],
  [/\breq --find\b/g, "find tool"],
  [/\breq --files-find\b/g, "files-find tool"],
  [/\breq --references\b/g, "references tool"],
  [/\breq --compress\b/g, "compress tool"],
  [/\breq --tokens\b/g, "tokens tool"],
  [/\breq --static-check\b/g, "static-check tool"],
  [/\breq --files-static-check\b/g, "files-static-check tool"],
  [/\breq --git-check\b/g, "git-check tool"],
  [/\breq --docs-check\b/g, "docs-check tool"],
  [/\breq --git-wt-name\b/g, "git-wt-name tool"],
  [/\breq --git-wt-create\b/g, "git-wt-create tool"],
  [/\breq --git-wt-delete\b/g, "git-wt-delete tool"],
  [/\breq --git-path\b/g, "git-path tool"],
  [/\breq --get-base-path\b/g, "get-base-path tool"],
];

const PI_DEV_AWARE_PROMPT_NAMES = new Set<string>([
  "analyze",
  "change",
  "check",
  "cover",
  "create",
  "fix",
  "implement",
  "new",
  "recreate",
  "refactor",
]);
const PI_DEV_MANIFEST_PROMPT_PATH = "docs/pi.dev/agent-document-manifest.json";
const PI_DEV_DOCS_PROMPT_PATH = "docs/pi.dev";
const PI_DEV_CONFORMANCE_BLOCK = [
  "- If the task touches extension code that interfaces with pi CLI or pi.dev APIs, "
    + `read \`${PI_DEV_MANIFEST_PROMPT_PATH}\` and every document path it `
    + "references before analysis, implementation, verification, or bug fixing.",
  `- Treat manifest document paths as relative to \`${PI_DEV_DOCS_PROMPT_PATH}/\`.`,
].join("\n");

/**
 * @brief Builds the conditional pi.dev conformance block for one rendered prompt.
 * @details Emits the manifest-driven rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the pi.dev manifest. Time complexity O(1). No filesystem writes.
 * @param[in] promptName {string} Bundled prompt identifier.
 * @param[in] projectBase {string} Absolute project root used for manifest existence checks.
 * @return {string} Markdown bullet block or the empty string when injection is not applicable.
 * @satisfies REQ-032, REQ-033, REQ-034
 */
function buildPiDevConformanceBlock(promptName: string, projectBase: string): string {
  if (!PI_DEV_AWARE_PROMPT_NAMES.has(promptName)) {
    return "";
  }
  const manifestPath = path.join(projectBase, PI_DEV_MANIFEST_PROMPT_PATH);
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    return "";
  }
  return PI_DEV_CONFORMANCE_BLOCK;
}

/**
 * @brief Injects the pi.dev conformance block into the prompt behavior section.
 * @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
 * @param[in] text {string} Prompt markdown after placeholder replacement.
 * @param[in] promptName {string} Bundled prompt identifier.
 * @param[in] projectBase {string} Absolute project root used for manifest existence checks.
 * @return {string} Prompt markdown with zero or one injected conformance block.
 * @satisfies REQ-032, REQ-033, REQ-034
 */
function injectPiDevConformanceBlock(text: string, promptName: string, projectBase: string): string {
  const block = buildPiDevConformanceBlock(promptName, projectBase);
  const behaviorHeading = "## Behavior\n";
  if (!block || !text.includes(behaviorHeading) || text.includes(block)) {
    return text;
  }
  return text.replace(behaviorHeading, `${behaviorHeading}${block}\n`);
}

/**
 * @brief Rewrites bundled prompt tool references from legacy `req --...` syntax to internal tool names.
 * @details Applies deterministic global regex replacements so prompt text matches the extension-registered tool surface instead of the standalone CLI spelling. Time complexity O(p*r) where p is pattern count and r is prompt length.
 * @param[in] text {string} Prompt markdown before tool-reference normalization.
 * @return {string} Prompt markdown with internal tool names.
 * @satisfies REQ-003
 */
export function adaptPromptForInternalTools(text: string): string {
  let updated = text;
  for (const [pattern, replacement] of TOOL_REFERENCE_REPLACEMENTS) {
    updated = updated.replace(pattern, replacement);
  }
  return updated;
}

/**
 * @brief Applies literal placeholder replacements to bundled prompt markdown.
 * @details Replaces every placeholder token using split/join semantics so all occurrences are updated without regex escaping. Time complexity O(t*n) where t is replacement count and n is prompt length.
 * @param[in] text {string} Prompt markdown containing placeholder tokens.
 * @param[in] replacements {Record<string, string>} Token-to-value map.
 * @return {string} Prompt markdown with all placeholder tokens expanded.
 * @satisfies REQ-002
 */
export function applyReplacements(text: string, replacements: Record<string, string>): string {
  let updated = text;
  for (const [token, replacement] of Object.entries(replacements)) {
    updated = updated.split(token).join(replacement);
  }
  return updated;
}

/**
 * @brief Renders a bundled prompt for the current project context.
 * @details Loads the bundled markdown template, expands configuration-derived placeholders, injects conditional pi.dev conformance guidance, and rewrites legacy tool references to internal names. Time complexity O(n) relative to prompt size. No tracked files are modified.
 * @param[in] promptName {string} Bundled prompt identifier.
 * @param[in] args {string} Raw user-supplied prompt arguments.
 * @param[in] projectBase {string} Absolute project root used for placeholder and manifest resolution.
 * @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
 * @return {string} Fully rendered prompt markdown ready for `pi.sendUserMessage(...)`.
 * @satisfies REQ-002, REQ-003, REQ-032, REQ-033, REQ-034
 */
export function renderPrompt(
  promptName: string,
  args: string,
  projectBase: string,
  config: UseReqConfig,
): string {
  const prompt = readBundledPrompt(promptName);
  const replacements = {
    ...buildPromptReplacementPaths(projectBase, config),
    "%%ARGS%%": args,
  };
  const rendered = applyReplacements(prompt, replacements);
  const withPiDevConformance = injectPiDevConformanceBlock(
    rendered,
    promptName,
    projectBase,
  );
  return adaptPromptForInternalTools(withPiDevConformance);
}
