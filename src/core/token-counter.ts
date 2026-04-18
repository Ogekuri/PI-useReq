/**
 * @file
 * @brief Provides token and character counting utilities for documentation packs.
 * @details Wraps `js-tiktoken` encoding lookup, applies it to in-memory content or file lists, and builds agent-oriented JSON payloads for token-centric tools. Runtime is linear in processed text size. Side effects are limited to filesystem reads in multi-file helpers.
 */

import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";

/**
 * @brief Declares the tokenizer encoding used by token-count workflows.
 * @details Stores the canonical `js-tiktoken` encoding identifier reused by CLI and agent-tool token metrics. Access complexity is O(1). No side effects occur.
 */
export const TOKEN_COUNTER_ENCODING = "cl100k_base";

/**
 * @brief Enumerates supported token-payload scopes.
 * @details Distinguishes explicit-file requests from canonical-document requests while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
 */
export type TokenToolScope = "explicit-files" | "canonical-docs";

/**
 * @brief Enumerates supported per-file token-entry statuses.
 * @details Separates counted files, read-time failures, and skipped inputs so downstream agents can branch without reparsing text warnings. The alias is compile-time only and introduces no runtime cost.
 */
export type TokenFileStatus = "counted" | "error" | "skipped";

/**
 * @brief Describes one per-file token metric record.
 * @details Stores the source path, numeric token count, numeric character count, and optional read-error payload returned by low-level counting helpers. The interface is compile-time only and introduces no runtime cost.
 */
export interface CountFileMetricsResult {
  file: string;
  tokens: number;
  chars: number;
  error?: string;
}

/**
 * @brief Describes one file entry in the agent-oriented token payload.
 * @details Preserves caller order, exposes canonicalized path fields, and keeps numeric counts separate from status/error metadata for deterministic downstream parsing. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolFileEntry {
  request_index: number;
  input_path: string;
  canonical_path: string;
  file_name: string;
  status: TokenFileStatus;
  token_count: number;
  character_count: number;
  token_share: number;
  character_share: number;
  error_message?: string;
}

/**
 * @brief Describes the request section of the agent-oriented token payload.
 * @details Captures tool identity, scope, path-resolution base, encoding, and requested path inventory so agents can reason about how metrics were selected. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolRequestSection {
  tool_name: string;
  scope: TokenToolScope;
  encoding_name: string;
  path_base: string;
  requested_file_count: number;
  requested_paths: string[];
  docs_dir?: string;
  canonical_doc_names?: string[];
}

/**
 * @brief Describes the summary section of the agent-oriented token payload.
 * @details Exposes aggregate counts and averages as numeric fields with explicit units so agents can branch on totals without reparsing formatted strings. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolSummarySection {
  processable_file_count: number;
  counted_file_count: number;
  error_file_count: number;
  skipped_file_count: number;
  total_token_count: number;
  total_character_count: number;
  average_token_count_per_counted_file: number;
  average_character_count_per_counted_file: number;
}

/**
 * @brief Describes the guidance section of the agent-oriented token payload.
 * @details Separates derived ordering hints and warning strings from source-derived facts so agents can choose planning heuristics without reparsing the factual file table. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolGuidanceSection {
  warnings: string[];
  token_heavy_paths_desc: string[];
  token_light_paths_asc: string[];
}

/**
 * @brief Describes the full agent-oriented token payload.
 * @details Orders the top-level sections as request, summary, files, and guidance for deterministic downstream traversal. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolPayload {
  request: TokenToolRequestSection;
  summary: TokenToolSummarySection;
  files: TokenToolFileEntry[];
  guidance: TokenToolGuidanceSection;
}

/**
 * @brief Describes the options required to build one agent-oriented token payload.
 * @details Supplies tool identity, scope, path base, requested paths, and optional canonical-doc metadata while keeping counting behavior configurable through a stable object contract. The interface is compile-time only and introduces no runtime cost.
 */
export interface BuildTokenToolPayloadOptions {
  toolName: string;
  scope: TokenToolScope;
  baseDir: string;
  requestedPaths: string[];
  docsDir?: string;
  canonicalDocNames?: string[];
  encodingName?: string;
}

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
   * @return {TokenCounter} New token counter instance.
   */
  constructor(encodingName = TOKEN_COUNTER_ENCODING) {
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
 * @brief Converts one filesystem path into the canonical token-payload path form.
 * @details Emits a slash-normalized relative path when the target is under the supplied base directory; otherwise emits a slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] filePath {string} Candidate absolute or relative filesystem path.
 * @param[in] baseDir {string} Reference directory used for relative canonicalization.
 * @return {string} Canonicalized path string.
 */
function canonicalizeTokenPath(filePath: string, baseDir: string): string {
  const absolutePath = path.resolve(filePath);
  const absoluteBaseDir = path.resolve(baseDir);
  const relativePath = path.relative(absoluteBaseDir, absolutePath).split(path.sep).join("/");
  if (relativePath !== "" && !relativePath.startsWith("../") && relativePath !== "..") {
    return relativePath;
  }
  return absolutePath.split(path.sep).join("/");
}

/**
 * @brief Rounds one ratio to six decimal places.
 * @details Preserves zero exactly and otherwise limits floating-point noise so token-share fields remain stable across executions. Runtime is O(1). No side effects occur.
 * @param[in] numerator {number} Partial numeric value.
 * @param[in] denominator {number} Total numeric value.
 * @return {number} Rounded ratio in range `[0, 1]` when the denominator is positive; `0` otherwise.
 */
function roundRatio(numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

/**
 * @brief Orders canonical file paths by one numeric metric while removing duplicates.
 * @details Filters to counted file entries, sorts by the supplied metric direction, breaks ties by canonical path, and preserves only the first occurrence of each path. Runtime is O(n log n). No external state is mutated.
 * @param[in] files {TokenToolFileEntry[]} Token payload file entries.
 * @param[in] metric {(entry: TokenToolFileEntry) => number} Numeric metric selector.
 * @param[in] direction {"asc" | "desc"} Sort direction.
 * @return {string[]} Unique canonical paths ordered by the requested metric.
 */
function orderPathsByMetric(
  files: TokenToolFileEntry[],
  metric: (entry: TokenToolFileEntry) => number,
  direction: "asc" | "desc",
): string[] {
  const sorted = files
    .filter((entry) => entry.status === "counted")
    .sort((left, right) => {
      const leftMetric = metric(left);
      const rightMetric = metric(right);
      if (leftMetric === rightMetric) {
        return left.canonical_path.localeCompare(right.canonical_path);
      }
      return direction === "desc" ? rightMetric - leftMetric : leftMetric - rightMetric;
    });
  const seen = new Set<string>();
  const orderedPaths: string[] = [];
  for (const entry of sorted) {
    if (seen.has(entry.canonical_path)) {
      continue;
    }
    seen.add(entry.canonical_path);
    orderedPaths.push(entry.canonical_path);
  }
  return orderedPaths;
}

/**
 * @brief Counts tokens and characters for one in-memory content string.
 * @details Instantiates a `TokenCounter`, tokenizes the supplied text, and pairs the result with raw character length. Runtime is O(n). No filesystem I/O occurs.
 * @param[in] content {string} Text payload to measure.
 * @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
 * @return {{ tokens: number; chars: number }} Aggregate metrics for the supplied content.
 */
export function countFileMetrics(content: string, encodingName = TOKEN_COUNTER_ENCODING): { tokens: number; chars: number } {
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
 * @return {CountFileMetricsResult[]} Per-file metrics and optional read errors.
 */
export function countFilesMetrics(filePaths: string[], encodingName = TOKEN_COUNTER_ENCODING): CountFileMetricsResult[] {
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
 * @brief Builds the agent-oriented JSON payload for token-centric tools.
 * @details Validates requested paths against the filesystem, counts token metrics for processable files, preserves caller order in the file table, and emits derived ordering hints in a separate guidance section. Runtime is O(F log F + S). Side effects are limited to filesystem reads.
 * @param[in] options {BuildTokenToolPayloadOptions} Payload-construction options.
 * @return {TokenToolPayload} Structured token payload ordered as request, summary, files, guidance.
 * @satisfies REQ-010, REQ-017, REQ-069, REQ-070, REQ-071
 */
export function buildTokenToolPayload(options: BuildTokenToolPayloadOptions): TokenToolPayload {
  const baseDir = path.resolve(options.baseDir);
  const encodingName = options.encodingName ?? TOKEN_COUNTER_ENCODING;
  const requestedEntries = options.requestedPaths.map((inputPath, index) => {
    const absolutePath = path.resolve(baseDir, inputPath);
    return {
      requestIndex: index + 1,
      inputPath,
      absolutePath,
      canonicalPath: canonicalizeTokenPath(absolutePath, baseDir),
    };
  });
  const readableEntries: Array<typeof requestedEntries[number]> = [];
  const skippedWarnings: string[] = [];
  for (const entry of requestedEntries) {
    if (!fs.existsSync(entry.absolutePath) || !fs.statSync(entry.absolutePath).isFile()) {
      skippedWarnings.push(`skipped: ${entry.canonicalPath}: not found or not a file`);
      continue;
    }
    readableEntries.push(entry);
  }
  const measuredResults = countFilesMetrics(readableEntries.map((entry) => entry.absolutePath), encodingName);
  const measuredQueue = [...measuredResults];
  const files: TokenToolFileEntry[] = requestedEntries.map((entry) => {
    const nextMeasured = measuredQueue[0];
    if (!readableEntries.find((readableEntry) => readableEntry.requestIndex === entry.requestIndex)) {
      return {
        request_index: entry.requestIndex,
        input_path: entry.inputPath,
        canonical_path: entry.canonicalPath,
        file_name: path.basename(entry.canonicalPath),
        status: "skipped",
        token_count: 0,
        character_count: 0,
        token_share: 0,
        character_share: 0,
        error_message: "not found or not a file",
      };
    }
    measuredQueue.shift();
    const status: TokenFileStatus = nextMeasured?.error ? "error" : "counted";
    return {
      request_index: entry.requestIndex,
      input_path: entry.inputPath,
      canonical_path: entry.canonicalPath,
      file_name: path.basename(entry.canonicalPath),
      status,
      token_count: nextMeasured?.tokens ?? 0,
      character_count: nextMeasured?.chars ?? 0,
      token_share: 0,
      character_share: 0,
      error_message: nextMeasured?.error,
    };
  });
  const totalTokenCount = files
    .filter((entry) => entry.status === "counted")
    .reduce((sum, entry) => sum + entry.token_count, 0);
  const totalCharacterCount = files
    .filter((entry) => entry.status === "counted")
    .reduce((sum, entry) => sum + entry.character_count, 0);
  const filesWithShares = files.map((entry) => ({
    ...entry,
    token_share: roundRatio(entry.token_count, totalTokenCount),
    character_share: roundRatio(entry.character_count, totalCharacterCount),
  }));
  const countedFileCount = filesWithShares.filter((entry) => entry.status === "counted").length;
  const errorFileCount = filesWithShares.filter((entry) => entry.status === "error").length;
  const skippedFileCount = filesWithShares.filter((entry) => entry.status === "skipped").length;
  const warningLines = [
    ...skippedWarnings,
    ...filesWithShares
      .filter((entry) => entry.status === "error" && entry.error_message)
      .map((entry) => `error: ${entry.canonical_path}: ${entry.error_message}`),
  ];
  return {
    request: {
      tool_name: options.toolName,
      scope: options.scope,
      encoding_name: encodingName,
      path_base: baseDir.split(path.sep).join("/"),
      requested_file_count: options.requestedPaths.length,
      requested_paths: requestedEntries.map((entry) => entry.canonicalPath),
      docs_dir: options.docsDir,
      canonical_doc_names: options.canonicalDocNames,
    },
    summary: {
      processable_file_count: countedFileCount + errorFileCount,
      counted_file_count: countedFileCount,
      error_file_count: errorFileCount,
      skipped_file_count: skippedFileCount,
      total_token_count: totalTokenCount,
      total_character_count: totalCharacterCount,
      average_token_count_per_counted_file: countedFileCount === 0 ? 0 : Number((totalTokenCount / countedFileCount).toFixed(6)),
      average_character_count_per_counted_file: countedFileCount === 0 ? 0 : Number((totalCharacterCount / countedFileCount).toFixed(6)),
    },
    files: filesWithShares,
    guidance: {
      warnings: warningLines,
      token_heavy_paths_desc: orderPathsByMetric(filesWithShares, (entry) => entry.token_count, "desc"),
      token_light_paths_asc: orderPathsByMetric(filesWithShares, (entry) => entry.token_count, "asc"),
    },
  };
}

/**
 * @brief Formats per-file token metrics as a human-readable summary block.
 * @details Aggregates totals, emits one status line per file, and appends a summary footer containing file, token, and character counts. Runtime is O(n). No external state is mutated.
 * @param[in] results {CountFileMetricsResult[]} Per-file metric records.
 * @return {string} Multiline summary suitable for CLI or editor output.
 */
export function formatPackSummary(results: CountFileMetricsResult[]): string {
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
