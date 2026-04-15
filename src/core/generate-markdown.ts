/**
 * @file
 * @brief Generates useReq reference markdown from explicit source-file lists.
 * @details Combines file validation, language detection, source analysis, metadata enrichment, and final markdown rendering for downstream prompt workflows. Runtime is O(F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.
 */

import fs from "node:fs";
import path from "node:path";
import { SourceAnalyzer, formatMarkdown } from "./source-analyzer.js";

/**
 * @brief Maps filename extensions to analyzer language identifiers.
 * @details The record drives static language inference for explicit file inputs. Lookup complexity is O(1). The mapping is immutable after module initialization.
 */
const EXT_LANG_MAP: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".mjs": "javascript",
  ".ts": "typescript",
  ".rs": "rust",
  ".go": "go",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".lua": "lua",
  ".sh": "shell",
  ".pl": "perl",
  ".hs": "haskell",
  ".zig": "zig",
  ".ex": "elixir",
  ".cs": "csharp",
};

/**
 * @brief Infers the analyzer language from a file path extension.
 * @details Normalizes the extension to lowercase and resolves it through `EXT_LANG_MAP`. Time complexity is O(1). No I/O side effects occur.
 * @param[in] filePath {string} Source file path.
 * @return {string | undefined} Canonical analyzer language identifier, or `undefined` for unsupported extensions.
 */
export function detectLanguage(filePath: string): string | undefined {
  return EXT_LANG_MAP[path.extname(filePath).toLowerCase()];
}

/**
 * @brief Formats one analyzed file path for markdown output.
 * @details Returns the original path when no base is supplied; otherwise computes a slash-normalized relative path against the resolved output base. Time complexity is O(p) in path length. No side effects occur.
 * @param[in] filePath {string} Source file path.
 * @param[in] outputBase {string | undefined} Optional base directory used for relative formatting.
 * @return {string} Display path used in the rendered markdown header.
 */
function formatOutputPath(filePath: string, outputBase?: string): string {
  if (!outputBase) return filePath;
  return path.relative(outputBase, path.resolve(filePath)).split(path.sep).join("/");
}

/**
 * @brief Generates reference markdown for explicit source files.
 * @details Filters unsupported or missing files, analyzes each valid source file, enriches extracted symbols with signatures and Doxygen metadata, and concatenates per-file markdown sections separated by horizontal rules. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] filePaths {string[]} Explicit file paths to analyze.
 * @param[in] verbose {boolean} When `true`, write per-file progress diagnostics to stderr.
 * @param[in] outputBase {string | undefined} Optional base directory used to shorten output paths.
 * @return {string} Concatenated markdown reference document.
 * @throws {Error} Throws when no valid source files can be processed.
 */
export function generateMarkdown(filePaths: string[], verbose = false, outputBase?: string): string {
  const analyzer = new SourceAnalyzer();
  const markdownParts: string[] = [];
  let okCount = 0;
  let failCount = 0;
  const resolvedOutputBase = outputBase ? path.resolve(outputBase) : undefined;

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      if (verbose) console.error(`  SKIP  ${filePath} (file not found)`);
      continue;
    }
    const language = detectLanguage(filePath);
    if (!language) {
      if (verbose) console.error(`  SKIP  ${filePath} (unsupported extension)`);
      continue;
    }
    try {
      const elements = analyzer.analyze(filePath, language);
      const spec = analyzer.specs[language.toLowerCase().trim().replace(/^\./, "")];
      analyzer.enrich(elements, language, filePath);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const totalLines = fileContent === ""
        ? 0
        : fileContent.split(/\r?\n/).length - (fileContent.endsWith("\n") ? 1 : 0);
      markdownParts.push(
        formatMarkdown(
          elements,
          formatOutputPath(filePath, resolvedOutputBase),
          language,
          spec.name,
          totalLines,
          false,
        ),
      );
      okCount += 1;
      if (verbose) console.error(`  OK    ${filePath}`);
    } catch (error) {
      failCount += 1;
      if (verbose) console.error(`  FAIL  ${filePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (markdownParts.length === 0) {
    throw new Error("No valid source files processed");
  }
  if (verbose) console.error(`\n  Processed: ${okCount} ok, ${failCount} failed`);
  return markdownParts.join("\n\n---\n\n");
}
