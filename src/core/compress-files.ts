/**
 * @file
 * @brief Compresses explicit source-file lists into compact fenced-markdown excerpts.
 * @details Bridges file validation, language detection, per-file source compression, and final markdown packaging for prompt consumption. Runtime is O(F + S) where F is file count and S is total source size processed. Side effects are limited to filesystem reads and optional stderr logging.
 */

import fs from "node:fs";
import path from "node:path";
import { compressFileDetailed, detectLanguage } from "./compress.js";

/**
 * @brief Formats one source path for markdown output.
 * @details Returns the original file path when no base is provided. Otherwise computes a normalized POSIX-style relative path against the resolved output base. Time complexity is O(p) in path length. No I/O side effects occur.
 * @param[in] filePath {string} Source file path.
 * @param[in] outputBase {string | undefined} Optional base directory for relative formatting.
 * @return {string} Display path used in the markdown header.
 */
function formatOutputPath(filePath: string, outputBase?: string): string {
  if (!outputBase) return filePath;
  return path.posix.normalize(path.relative(outputBase, path.resolve(filePath)).split(path.sep).join("/"));
}

/**
 * @brief Compresses a list of explicit source files into concatenated markdown sections.
 * @details Validates file existence, infers each supported language, invokes per-file compression, preserves optional line numbers, and emits one fenced block per successful file. Runtime is O(F + S) where F is file count and S is total processed source size. Side effects are limited to filesystem reads and optional stderr progress logging.
 * @param[in] filePaths {string[]} Explicit file paths to process.
 * @param[in] includeLineNumbers {boolean} When `true`, preserve original source line numbers in the emitted code block.
 * @param[in] verbose {boolean} When `true`, write progress and skip diagnostics to stderr.
 * @param[in] outputBase {string | undefined} Optional base directory used to shorten output paths.
 * @return {string} Markdown document containing one section per successfully compressed file.
 * @throws {Error} Throws when no valid source files can be processed.
 */
export function compressFiles(
  filePaths: string[],
  includeLineNumbers = true,
  verbose = false,
  outputBase?: string,
): string {
  const parts: string[] = [];
  let okCount = 0;
  let failCount = 0;
  const resolvedOutputBase = outputBase ? path.resolve(outputBase) : undefined;

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      if (verbose) console.error(`  SKIP  ${filePath} (not found)`);
      continue;
    }
    const language = detectLanguage(filePath);
    if (!language) {
      if (verbose) console.error(`  SKIP  ${filePath} (unsupported extension)`);
      continue;
    }
    try {
      const compressed = compressFileDetailed(filePath, language, includeLineNumbers);
      const outputPath = formatOutputPath(filePath, resolvedOutputBase);
      parts.push(`@@@ ${outputPath} | ${language}\n> Lines: ${compressed.source_start_line_number}-${compressed.source_end_line_number}\n\
\`\`\`\n${compressed.compressed_source_text}\n\`\`\``);
      okCount += 1;
      if (verbose) console.error(`  OK    ${filePath}`);
    } catch (error) {
      failCount += 1;
      if (verbose) console.error(`  FAIL  ${filePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (parts.length === 0) {
    throw new Error("No valid source files processed");
  }
  if (verbose) console.error(`\n  Compressed: ${okCount} ok, ${failCount} failed`);
  return parts.join("\n\n");
}
