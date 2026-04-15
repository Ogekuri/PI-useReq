/**
 * @file
 * @brief Resolves bundled resource locations and mirrors them into the user resource directory.
 * @details Encapsulates package-root discovery, prompt enumeration, and one-way copying from bundled assets into `~/.pi/pi-usereq/resources`. File-system work is proportional to the number of copied entries. The module performs directory creation and file-copy side effects.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getHomeResourceRoot } from "./config.js";

/**
 * @brief Resolves the installed package root directory.
 * @details Computes the parent directory of the current module file so bundled resources can be located without relying on process working directory. Time complexity is O(1). No filesystem writes occur.
 * @return {string} Absolute package root path.
 */
export function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * @brief Resolves the bundled resource directory inside the package.
 * @details Joins the package root with `resources`, producing the immutable source tree used for prompt and guideline seeding. Time complexity is O(1). No I/O side effects occur.
 * @return {string} Absolute bundled resource root path.
 */
export function getBundledResourceRoot(): string {
  return path.join(getPackageRoot(), "resources");
}

/**
 * @brief Ensures bundled resources are available under the user's pi-usereq home directory.
 * @details Creates the destination root when necessary and recursively copies non-hidden bundled files into it. Copy complexity is O(n) in the number of directory entries. Side effects include directory creation and file overwrites in the home resource tree.
 * @return {string} Absolute destination resource root path.
 * @post Destination directory exists when bundled resources are present.
 */
export function ensureHomeResources(): string {
  const sourceRoot = getBundledResourceRoot();
  const destinationRoot = getHomeResourceRoot();
  if (!fs.existsSync(sourceRoot)) {
    return destinationRoot;
  }
  fs.mkdirSync(destinationRoot, { recursive: true });
  copyDirectoryContents(sourceRoot, destinationRoot);
  return destinationRoot;
}

/**
 * @brief Recursively copies visible files from one directory tree into another.
 * @details Skips hidden entries, creates intermediate directories lazily, and mirrors regular files using `fs.copyFileSync`. Time complexity is O(n) in traversed entries. Side effects mutate the destination filesystem tree.
 * @param[in] sourceDir {string} Absolute or relative source directory path.
 * @param[in] destinationDir {string} Absolute or relative destination directory path.
 * @return {void} No return value.
 */
function copyDirectoryContents(sourceDir: string, destinationDir: string): void {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destinationPath, { recursive: true });
      copyDirectoryContents(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

/**
 * @brief Reads one bundled markdown prompt by logical prompt name.
 * @details Resolves the prompt file under the bundled `resources/prompts` directory and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] promptName {string} Prompt identifier without the `.md` suffix.
 * @return {string} Raw prompt markdown content.
 * @throws {Error} Propagates `fs.readFileSync` errors when the prompt file is missing or unreadable.
 */
export function readBundledPrompt(promptName: string): string {
  const filePath = path.join(getBundledResourceRoot(), "prompts", `${promptName}.md`);
  return fs.readFileSync(filePath, "utf8");
}

/**
 * @brief Lists bundled prompt identifiers available in the package resources.
 * @details Scans the prompt directory, keeps visible markdown files only, strips the `.md` suffix, and returns a lexicographically sorted list. Time complexity is O(n log n). Side effects are limited to filesystem reads.
 * @return {string[]} Sorted prompt names without file extensions.
 */
export function listBundledPromptNames(): string[] {
  return fs
    .readdirSync(path.join(getBundledResourceRoot(), "prompts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("."))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}
