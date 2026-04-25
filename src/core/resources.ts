/**
 * @file
 * @brief Resolves installation-owned bundled resource locations.
 * @details Encapsulates installation-path discovery, bundled-resource validation, prompt enumeration, prompt loading, and bundled instruction loading directly from the installed extension payload. Runtime is proportional to directory-entry enumeration and resource file size. Side effects are limited to filesystem reads.
 */

import fs from "node:fs";
import path from "node:path";
import { getInstallationPath, RESOURCE_ROOT_DIRNAME } from "./path-context.js";

/**
 * @brief Resolves the bundled resource directory inside the installed extension payload.
 * @details Joins the installation path with `resources`, producing the immutable source tree used for prompt, template, and guideline access during runtime. Time complexity is O(1). No I/O side effects occur.
 * @return {string} Absolute bundled resource root path.
 */
export function getBundledResourceRoot(): string {
  return path.join(getInstallationPath(), RESOURCE_ROOT_DIRNAME);
}

/**
 * @brief Validates that installed bundled resources are accessible.
 * @details Verifies that the installation-owned resource root plus `prompts`, `instructions`, `templates`, and `guidelines` directories exist before prompt or tool execution. Runtime is O(1) plus bounded filesystem metadata checks. Side effects are limited to filesystem reads.
 * @return {string} Absolute bundled resource root path.
 * @throws {Error} Propagates a deterministic error when required installed resource directories are missing.
 */
export function ensureBundledResourcesAccessible(): string {
  const resourceRoot = getBundledResourceRoot();
  if (!fs.existsSync(resourceRoot) || !fs.statSync(resourceRoot).isDirectory()) {
    throw new Error(`Missing bundled resources at ${resourceRoot}`);
  }
  for (const requiredDirectoryName of ["prompts", "instructions", "templates", "guidelines"]) {
    const requiredDirectoryPath = path.join(resourceRoot, requiredDirectoryName);
    if (!fs.existsSync(requiredDirectoryPath) || !fs.statSync(requiredDirectoryPath).isDirectory()) {
      throw new Error(`Missing bundled resource directory at ${requiredDirectoryPath}`);
    }
  }
  return resourceRoot;
}

/**
 * @brief Reads one bundled markdown resource by logical name and directory.
 * @details Resolves the installed markdown file under the requested bundled resource directory, validates resource accessibility, and loads the file as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] directoryName {"prompts" | "instructions"} Installation-owned markdown resource directory.
 * @param[in] resourceName {string} Resource identifier without the `.md` suffix.
 * @return {string} Raw bundled markdown content.
 * @throws {Error} Propagates `fs.readFileSync` errors when the resource file is missing or unreadable.
 */
function readBundledMarkdownResource(
  directoryName: "prompts" | "instructions",
  resourceName: string,
): string {
  const filePath = path.join(ensureBundledResourcesAccessible(), directoryName, `${resourceName}.md`);
  return fs.readFileSync(filePath, "utf8");
}

/**
 * @brief Reads one bundled markdown prompt by logical prompt name.
 * @details Resolves the prompt file under the installation-owned `resources/prompts` directory, validates resource accessibility, and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] promptName {string} Prompt identifier without the `.md` suffix.
 * @return {string} Raw prompt markdown content.
 * @throws {Error} Propagates `fs.readFileSync` errors when the prompt file is missing or unreadable.
 */
export function readBundledPrompt(promptName: string): string {
  return readBundledMarkdownResource("prompts", promptName);
}

/**
 * @brief Extracts the first Markdown level-one heading from one bundled prompt.
 * @details Removes one optional leading YAML front-matter block, scans the remaining markdown body for the first line that begins with `# `, and returns the heading payload without the marker or surrounding whitespace. Runtime is O(n) in prompt length. Side effects are limited to filesystem reads delegated through `readBundledPrompt(...)`.
 * @param[in] promptName {string} Prompt identifier without the `.md` suffix.
 * @return {string} First `# ` heading payload, or the empty string when no level-one heading exists.
 */
export function readBundledPromptDescription(promptName: string): string {
  const promptText = readBundledPrompt(promptName);
  const promptBody = promptText.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  const headingMatch = promptBody.match(/^# (.+?)\s*$/m);
  return headingMatch?.[1]?.trim() ?? "";
}

/**
 * @brief Reads one bundled markdown instruction by logical instruction name.
 * @details Resolves the instruction file under the installation-owned `resources/instructions` directory, validates resource accessibility, and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] instructionName {string} Instruction identifier without the `.md` suffix.
 * @return {string} Raw instruction markdown content.
 * @throws {Error} Propagates `fs.readFileSync` errors when the instruction file is missing or unreadable.
 */
export function readBundledInstruction(instructionName: string): string {
  return readBundledMarkdownResource("instructions", instructionName);
}

/**
 * @brief Lists bundled prompt identifiers available in the installed extension payload.
 * @details Scans the installation-owned prompt directory, keeps visible markdown files only, strips the `.md` suffix, and returns a lexicographically sorted list. Time complexity is O(n log n). Side effects are limited to filesystem reads.
 * @return {string[]} Sorted prompt names without file extensions.
 */
export function listBundledPromptNames(): string[] {
  return fs
    .readdirSync(path.join(ensureBundledResourcesAccessible(), "prompts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("."))
    .map((entry) => entry.name.slice(0, -3))
    .sort((left, right) => left.localeCompare(right));
}
