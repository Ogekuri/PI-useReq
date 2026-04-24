/**
 * @file
 * @brief Renders bundled pi-usereq prompts for the current project context.
 * @details Applies placeholder substitution, legacy tool-name rewrites, and conditional pi.dev governance guidance before prompt text is sent to the agent. Runtime is linear in prompt size plus replacement count. Side effects are limited to filesystem reads used for manifest checks and bundled prompt loading.
 */

import fs from "node:fs";
import path from "node:path";
import { buildPromptReplacementPaths, type UseReqConfig } from "./config.js";
import { formatRuntimePathForDisplay } from "./path-context.js";
import type {
  PromptCommandExecutionPlan,
  PromptCommandName,
} from "./prompt-command-runtime.js";
import { getPromptRequiredDocs } from "./prompt-command-runtime.js";
import { readBundledInstruction, readBundledPrompt } from "./resources.js";

/**
 * @brief Defines regex rewrites from legacy CLI spellings to internal tool names.
 * @details The ordered replacement table converts historical `req --...` references into names exposed by the extension runtime. Application cost is O(p*r) where p is pattern count and r is prompt length.
 */
const TOOL_REFERENCE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/`req --find`/g, "`search` tool"],
  [/`req --files-find`/g, "`files-search` tool"],
  [/`req --compress`/g, "`compress` tool"],
  [/`req --tokens`/g, "`tokens` tool"],
  [/`req --static-check`/g, "`static-check` tool"],
  [/`req --files-static-check`/g, "`files-static-check` tool"],
  [/\breq --find\b/g, "search tool"],
  [/\breq --files-find\b/g, "files-search tool"],
  [/\breq --compress\b/g, "compress tool"],
  [/\breq --tokens\b/g, "tokens tool"],
  [/\breq --static-check\b/g, "static-check tool"],
  [/\breq --files-static-check\b/g, "files-static-check tool"],
];

/**
 * @brief Lists prompt names that may require pi.dev manifest governance rules.
 * @details Only prompts that inspect or mutate source code receive the conditional governance block. Membership checks are O(1) through the set representation.
 */
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
/**
 * @brief Stores the repository-relative pi.dev manifest path used in prompt guidance.
 * @details The constant lets rendered prompts cite the authoritative documentation manifest with a deterministic path. Lookup complexity is O(1).
 */
const PI_DEV_MANIFEST_PROMPT_PATH = "docs/pi.dev/agent-document-manifest.json";
/**
 * @brief Stores the repository-relative base directory for pi.dev documentation.
 * @details Prompt guidance uses this path when instructing agents how to resolve manifest references. Lookup complexity is O(1).
 */
const PI_DEV_DOCS_PROMPT_PATH = "docs/pi.dev";
/**
 * @brief Stores the repository-relative base directory for pi.dev coding-agent documentation.
 * @details Prompt guidance cites this directory when defining the authoritative extension-to-client interface contract. Lookup complexity is O(1).
 */
const PI_DEV_CODING_AGENT_DOCS_PROMPT_PATH = `${PI_DEV_DOCS_PROMPT_PATH}/coding-agent-docs`;
/**
 * @brief Stores the repository-relative pi client source path used for interface validation guidance.
 * @details Prompt guidance cites this directory when requiring read-only validation against the pi client implementation. Lookup complexity is O(1).
 */
const PI_DEV_SOURCE_PROMPT_PATH = "pi.dev-src/pi-mono";
/**
 * @brief Defines the injected pi.dev governance guidance block.
 * @details The block requires read-only handling for documentation and pi client sources, manifest-first review, coding-agent-document compliance, and pi client source validation for ambiguous or bug-fix interface work. Construction happens once at module load. Access complexity is O(1).
 * @satisfies REQ-033, REQ-034, REQ-108, REQ-273, REQ-274, REQ-275
 */
const PI_DEV_CONFORMANCE_BLOCK = [
  "- Treat every path under `docs/` as read-only; do NOT modify "
    + `\`${PI_DEV_MANIFEST_PROMPT_PATH}\` or any other documentation file.`,
  "- Treat every path under `pi.dev-src/` as read-only; do NOT modify "
    + `\`${PI_DEV_SOURCE_PROMPT_PATH}\` or any other pi client source.`,
  "- If the task creates or modifies software that interfaces with the "
    + `pi.dev CLI, read \`${PI_DEV_MANIFEST_PROMPT_PATH}\` and every `
    + "document path it references before analysis, implementation, "
    + "verification, or bug fixing.",
  `- Treat \`${PI_DEV_CODING_AGENT_DOCS_PROMPT_PATH}/\` and documents `
    + `referenced by \`${PI_DEV_MANIFEST_PROMPT_PATH}\` as the `
    + "authoritative read-only interface contract; new or modified "
    + "pi.dev CLI integrations MUST comply with the APIs they describe.",
  `- Treat manifest document paths as relative to \`${PI_DEV_DOCS_PROMPT_PATH}/\`.`,
  "- If manifest or "
    + `\`${PI_DEV_CODING_AGENT_DOCS_PROMPT_PATH}/\` guidance is `
    + "ambiguous for extension-to-pi-client interface behavior, validate "
    + `the produced source code by analyzing \`${PI_DEV_SOURCE_PROMPT_PATH}\`.`,
  "- For bug fixes or problem resolution influenced by extension-to-pi-client "
    + "interface implementations, validate the produced source code by "
    + `analyzing \`${PI_DEV_SOURCE_PROMPT_PATH}\`.`,
].join("\n");

/**
 * @brief Builds the conditional pi.dev governance block for one rendered prompt.
 * @details Emits the manifest-driven governance rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the pi.dev manifest. Time complexity O(1). No filesystem writes.
 * @param[in] promptName {string} Bundled prompt identifier.
 * @param[in] projectBase {string} Absolute project root used for manifest existence checks.
 * @return {string} Markdown bullet block or the empty string when injection is not applicable.
 * @satisfies REQ-032, REQ-033, REQ-034, REQ-108, REQ-273, REQ-274, REQ-275
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
 * @brief Injects the pi.dev governance block into the prompt behavior section.
 * @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
 * @param[in] text {string} Prompt markdown after placeholder replacement.
 * @param[in] promptName {string} Bundled prompt identifier.
 * @param[in] projectBase {string} Absolute project root used for manifest existence checks.
 * @return {string} Prompt markdown with zero or one injected conformance block.
 * @satisfies REQ-032, REQ-033, REQ-034, REQ-108, REQ-273, REQ-274, REQ-275
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
 * @brief Builds the prompt-command execution block injected at prompt start.
 * @details Serializes the already-completed repository validation, prompt-specific required-doc validation, worktree routing decision, and extension-owned lifecycle responsibilities so downstream agents do not repeat command-side orchestration. Time complexity is O(d) in required-doc count. No external state is mutated.
 * @param[in] promptName {PromptCommandName} Bundled prompt identifier.
 * @param[in] executionPlan {PromptCommandExecutionPlan} Prepared command execution plan.
 * @return {string} Markdown block or the empty string when runtime execution metadata is unavailable.
 * @satisfies REQ-200, REQ-201, REQ-202, REQ-206, REQ-207, REQ-208, REQ-209
 */
function buildPromptExecutionBlock(
  promptName: PromptCommandName,
  executionPlan: PromptCommandExecutionPlan | undefined,
): string {
  if (!executionPlan) {
    return "";
  }
  const requiredDocs = getPromptRequiredDocs(promptName);
  const requiredDocText = requiredDocs.length === 0
    ? "No canonical-doc precheck is required for this prompt."
    : requiredDocs.map((requirement) => requirement.fileName).join(", ");
  const preparedContextPath = formatRuntimePathForDisplay(executionPlan.contextPath);
  const worktreeLine = executionPlan.worktreeDir
    ? `3. Worktree routing already passed: created worktree-dir \`${executionPlan.worktreeDir}\` and prepared context-path \`${preparedContextPath}\`.`
    : `3. Worktree routing already passed: worktree orchestration is disabled and context-path remains \`${preparedContextPath}\`.`;
  return [
    "## Extension-Orchestrated Runtime",
    "1. Slash-command-owned git repository validation already passed before prompt dispatch.",
    `2. Prompt-specific required-doc validation already passed: ${requiredDocText}`,
    worktreeLine,
    "4. The extension owns prompt-end worktree merge and fork-session retention. Do NOT repeat repository validation, canonical-doc validation, worktree creation, or merge inside this workflow.",
  ].join("\n");
}

/**
 * @brief Injects the prompt-command execution block near the start of the rendered prompt.
 * @details Inserts the execution block immediately after the first level-1 heading so downstream agents evaluate extension-owned orchestration before workflow steps. Leaves prompts unchanged when no execution block is provided or when the block is already present. Time complexity O(n).
 * @param[in] text {string} Prompt markdown after placeholder replacement.
 * @param[in] promptName {PromptCommandName} Bundled prompt identifier.
 * @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Prepared execution plan.
 * @return {string} Prompt markdown with zero or one injected execution block.
 */
function injectPromptExecutionBlock(
  text: string,
  promptName: PromptCommandName,
  executionPlan: PromptCommandExecutionPlan | undefined,
): string {
  const block = buildPromptExecutionBlock(promptName, executionPlan);
  const headingMatch = text.match(/^# .*$/m);
  if (!block || !headingMatch || text.includes(block)) {
    return text;
  }
  return text.replace(headingMatch[0], `${headingMatch[0]}\n\n${block}`);
}

/**
 * @brief Builds prompt-specific runtime placeholder replacements.
 * @details Merges shared path substitutions with prompt-scoped runtime values for `%%ARGS%%` and `%%PROMPT%%`. Time complexity is O(g log g + s) due to delegated path replacement building, where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads delegated to shared path-context helpers.
 * @param[in] promptName {string} Bundled prompt identifier without the `req-` prefix.
 * @param[in] args {string} Raw user-supplied prompt arguments.
 * @param[in] projectBase {string} Absolute project root used for placeholder resolution.
 * @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
 * @return {Record<string, string>} Prompt-specific placeholder-to-value map.
 * @satisfies REQ-002, REQ-211
 */
function buildPromptReplacements(
  promptName: string,
  args: string,
  projectBase: string,
  contextPath: string,
  config: UseReqConfig,
): Record<string, string> {
  return {
    ...buildPromptReplacementPaths(projectBase, contextPath, config),
    "%%ARGS%%": args,
    "%%PROMPT%%": promptName,
  };
}

/**
 * @brief Renders the bundled git instruction injected through `%%COMMIT%%`.
 * @details Selects `resources/instructions/git_commit.md` when automatic git commit is enabled and `resources/instructions/git_read-only.md` otherwise, then applies the same runtime placeholder substitutions used by bundled prompts before returning the rendered markdown. Time complexity is O(n + g log g + s) where n is instruction size, g is guideline count, and s is source-directory count. Side effects are limited to filesystem reads.
 * @param[in] promptName {string} Bundled prompt identifier without the `req-` prefix.
 * @param[in] args {string} Raw user-supplied prompt arguments.
 * @param[in] projectBase {string} Absolute project root used for placeholder resolution.
 * @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
 * @return {string} Rendered bundled git instruction selected for the current automatic-commit mode.
 * @satisfies REQ-211, REQ-213, REQ-214
 */
function renderBundledCommitInstruction(
  promptName: string,
  args: string,
  projectBase: string,
  contextPath: string,
  config: UseReqConfig,
): string {
  const instruction = readBundledInstruction(
    config.AUTO_GIT_COMMIT === "enable" ? "git_commit" : "git_read-only",
  );
  return applyReplacements(
    instruction,
    buildPromptReplacements(promptName, args, projectBase, contextPath, config),
  );
}

/**
 * @brief Renders a bundled prompt for the current project context.
 * @details Loads the bundled markdown template, expands configuration-derived placeholders, injects extension-owned execution guidance plus conditional pi.dev governance guidance, expands the optional bundled commit instruction, and rewrites legacy tool references to internal names. Time complexity O(n) relative to prompt size plus delegated commit-instruction rendering. No tracked files are modified.
 * @param[in] promptName {string} Bundled prompt identifier.
 * @param[in] args {string} Raw user-supplied prompt arguments.
 * @param[in] projectBase {string} Absolute project root used for placeholder and manifest resolution.
 * @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
 * @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Optional prompt-command execution plan used for injected runtime guidance.
 * @return {string} Fully rendered prompt markdown ready for `pi.sendUserMessage(...)`.
 * @satisfies REQ-002, REQ-003, REQ-032, REQ-033, REQ-034, REQ-108, REQ-200, REQ-201, REQ-202, REQ-206, REQ-207, REQ-208, REQ-209, REQ-211, REQ-213, REQ-214, REQ-273, REQ-274, REQ-275
 */
export function renderPrompt(
  promptName: string,
  args: string,
  projectBase: string,
  config: UseReqConfig,
  executionPlan?: PromptCommandExecutionPlan,
): string {
  const contextPath = executionPlan?.contextPath ?? projectBase;
  const prompt = readBundledPrompt(promptName);
  const replacements = {
    ...buildPromptReplacements(promptName, args, projectBase, contextPath, config),
    "%%COMMIT%%": renderBundledCommitInstruction(
      promptName,
      args,
      projectBase,
      contextPath,
      config,
    ),
  };
  const rendered = applyReplacements(prompt, replacements);
  const withExecutionBlock = injectPromptExecutionBlock(
    rendered,
    promptName as PromptCommandName,
    executionPlan,
  );
  const withPiDevConformance = injectPiDevConformanceBlock(
    withExecutionBlock,
    promptName,
    projectBase,
  );
  return adaptPromptForInternalTools(withPiDevConformance);
}
