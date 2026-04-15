/**
 * @file
 * @brief Provides token and character counting utilities for documentation packs.
 * @details Wraps `js-tiktoken` encoding lookup and applies it to in-memory content or file lists. Runtime is linear in processed text size. Side effects are limited to filesystem reads in multi-file helpers.
 */

import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";

/**
 * @brief Encapsulates one tokenizer instance for repeated token counting.
 * @details Caches a `js-tiktoken` encoding object so multiple documents can be counted without repeated encoding lookup. Counting cost is O(n) in content length. The class mutates only instance state during construction.
 */
export class TokenCounter {
  /**
   * @brief Stores the tokenizer implementation used for subsequent counts.
   * @details The field holds the encoder returned by `getEncoding`. Access complexity is O(1). The value is initialized once per instance.
   */
  private encoding;

  /**
   * @brief Initializes a token counter for one encoding family.
   * @details Resolves the named tokenizer once and reuses it across `countTokens` calls. Construction complexity is O(1) relative to caller-controlled input size. Side effects are limited to instance initialization.
   * @param[in] encodingName {string} `js-tiktoken` encoding identifier. Defaults to `cl100k_base`.
   */
  constructor(encodingName = "cl100k_base") {
    this.encoding = getEncoding(encodingName);
  }

  /**
   * @brief Counts tokenizer tokens for one content string.
   * @details Encodes the provided text with the cached tokenizer and returns the token sequence length. Returns `0` when encoding throws, which prevents counting failures from aborting higher-level workflows. Time complexity is O(n). No external state is mutated.
   * @param[in] content {string} Text to tokenize.
   * @return {number} Token count, or `0` when encoding fails.
   */
  countTokens(content: string): number {
    try {
      return this.encoding.encode(content).length;
    } catch {
      return 0;
    }
  }

  /**
   * @brief Counts UTF-16 code-unit characters for one string.
   * @details Returns JavaScript string length directly without normalization. Time complexity is O(1) under engine-maintained length metadata. No side effects occur.
   * @param[in] content {string} Text to measure.
   * @return {number} Raw character count.
   */
  static countChars(content: string): number {
    return content.length;
  }
}

/**
 * @brief Counts tokens and characters for one in-memory content string.
 * @details Instantiates a `TokenCounter`, tokenizes the supplied text, and pairs the result with raw character length. Runtime is O(n). No filesystem I/O occurs.
 * @param[in] content {string} Text payload to measure.
 * @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
 * @return {{ tokens: number; chars: number }} Aggregate metrics for the supplied content.
 */
export function countFileMetrics(content: string, encodingName = "cl100k_base"): { tokens: number; chars: number } {
  const counter = new TokenCounter(encodingName);
  return {
    tokens: counter.countTokens(content),
    chars: TokenCounter.countChars(content),
  };
}

/**
 * @brief Counts tokens and characters for multiple files.
 * @details Reuses a single `TokenCounter`, reads each file as UTF-8, and returns per-file metrics. Read failures are captured as error strings instead of aborting the entire batch. Runtime is O(F + S). Side effects are limited to filesystem reads.
 * @param[in] filePaths {string[]} File paths to measure.
 * @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
 * @return {Array<{ file: string; tokens: number; chars: number; error?: string }>} Per-file metrics and optional read errors.
 */
export function countFilesMetrics(filePaths: string[], encodingName = "cl100k_base") {
  const counter = new TokenCounter(encodingName);
  return filePaths.map((filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return {
        file: filePath,
        tokens: counter.countTokens(content),
        chars: TokenCounter.countChars(content),
      };
    } catch (error) {
      return {
        file: filePath,
        tokens: 0,
        chars: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/**
 * @brief Formats per-file token metrics as a human-readable summary block.
 * @details Aggregates totals, emits one status line per file, and appends a summary footer containing file, token, and character counts. Runtime is O(n). No external state is mutated.
 * @param[in] results {Array<{ file: string; tokens: number; chars: number; error?: string }>} Per-file metric records.
 * @return {string} Multiline summary suitable for CLI or editor output.
 */
export function formatPackSummary(results: Array<{ file: string; tokens: number; chars: number; error?: string }>): string {
  const lines: string[] = [];
  let totalTokens = 0;
  let totalChars = 0;
  const totalFiles = results.length;

  for (const result of results) {
    const fileName = path.basename(result.file);
    totalTokens += result.tokens;
    totalChars += result.chars;
    if (result.error) {
      lines.push(`  ❌ ${fileName}: ERROR - ${result.error}`);
    } else {
      lines.push(`  📄 ${fileName}: ${result.tokens.toLocaleString()} tokens, ${result.chars.toLocaleString()} chars`);
    }
  }

  lines.push("");
  lines.push("📊 Pack Summary:");
  lines.push("────────────────");
  lines.push(`  Total Files: ${totalFiles} files`);
  lines.push(` Total Tokens: ${totalTokens.toLocaleString()} tokens`);
  lines.push(`  Total Chars: ${totalChars.toLocaleString()} chars`);
  return lines.join("\n");
}
