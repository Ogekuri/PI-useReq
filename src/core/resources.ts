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
 * @brief Extracts the YAML-front-matter `description` field from one bundled prompt.
 * @details Parses only the leading front-matter block, resolves the first scalar `description` entry, strips one matching pair of wrapping quotes, and unescapes quoted apostrophe or quote characters used in prompt metadata. Runtime is O(n) in prompt length. Side effects are limited to filesystem reads delegated through `readBundledPrompt(...)`.
 * @param[in] promptName {string} Prompt identifier without the `.md` suffix.
 * @return {string} Normalized prompt description or the empty string when the front matter does not declare one.
 */
export function readBundledPromptDescription(promptName: string): string {
  const promptText = readBundledPrompt(promptName);
  const frontMatterMatch = promptText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontMatterMatch) {
    return "";
  }
  const descriptionLine = frontMatterMatch[1]
    .split(/\r?\n/)
    .find((line) => line.startsWith("description:"));
  if (!descriptionLine) {
    return "";
  }
  const rawValue = descriptionLine.slice("description:".length).trim();
  const unquotedValue = rawValue.length >= 2
    && ((rawValue.startsWith('"') && rawValue.endsWith('"'))
      || (rawValue.startsWith("'") && rawValue.endsWith("'")))
    ? rawValue.slice(1, -1)
    : rawValue;
  return unquotedValue
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .trim();
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
