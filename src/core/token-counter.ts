/**
 * @file
 * @brief Provides token, size, and structure counting utilities for agent-oriented file payloads.
 * @details Wraps `js-tiktoken` encoding lookup, extracts per-file structural facts, and builds machine-oriented JSON payloads for token-centric tools. Runtime is linear in processed text size plus sort cost for derived ordering hints. Side effects are limited to filesystem reads in file-based helpers.
 */

import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
import { detectLanguage as detectSourceLanguage } from "./compress.js";
import { parseDoxygenComment, type DoxygenFieldMap } from "./doxygen-parser.js";

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
 * @details Separates counted files, read-time failures, and skipped inputs so downstream agents can branch without reparsing text diagnostics. The alias is compile-time only and introduces no runtime cost.
 */
export type TokenFileStatus = "counted" | "error" | "skipped";

/**
 * @brief Describes one per-file token metric record.
 * @details Stores canonical file identity plus numeric token, character, byte, and line metrics extracted from one readable file. Optional metadata remains isolated in dedicated fields so agents can access headings and Doxygen fields without reparsing monolithic text. The interface is compile-time only and introduces no runtime cost.
 */
export interface CountFileMetricsResult {
  file: string;
  tokens: number;
  chars: number;
  bytes: number;
  lines: number;
  startLineNumber: number;
  endLineNumber: number;
  fileExtension: string;
  languageName?: string;
  primaryHeadingText?: string;
  doxygenFileFields?: DoxygenFieldMap;
  error?: string;
}

/**
 * @brief Describes one file entry in the agent-oriented token payload.
 * @details Orders direct-access path identifiers before source facts and numeric metrics so agents can branch without reparsing formatted strings. Optional metadata captures markdown headings or Doxygen file fields when they can be derived from the source content. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolFileEntry {
  request_index: number;
  input_path: string;
  canonical_path: string;
  absolute_path: string;
  file_name: string;
  file_extension: string;
  language_name?: string;
  status: TokenFileStatus;
  exists: boolean;
  is_file: boolean;
  start_line_number: number;
  end_line_number: number;
  line_count: number;
  primary_heading_text?: string;
  doxygen_file_fields?: DoxygenFieldMap;
  token_count: number;
  character_count: number;
  byte_count: number;
  token_share: number;
  character_share: number;
  byte_share: number;
  error_message?: string;
}

/**
 * @brief Describes the request section of the agent-oriented token payload.
 * @details Captures tool identity, scope, path-resolution base, encoding, and requested path inventories so agents can reason about how metrics were selected. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolRequestSection {
  tool_name: string;
  scope: TokenToolScope;
  encoding_name: string;
  base_dir_path: string;
  requested_file_count: number;
  requested_input_paths: string[];
  requested_canonical_paths: string[];
  docs_dir_path?: string;
  canonical_doc_names?: string[];
}

/**
 * @brief Describes the summary section of the agent-oriented token payload.
 * @details Exposes aggregate counts, sizes, totals, and per-file averages as numeric fields with explicit units so agents can branch on totals without reparsing formatted strings. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolSummarySection {
  processable_file_count: number;
  counted_file_count: number;
  error_file_count: number;
  skipped_file_count: number;
  total_token_count: number;
  total_character_count: number;
  total_byte_count: number;
  total_line_count: number;
  average_token_count_per_counted_file: number;
  average_character_count_per_counted_file: number;
  average_byte_count_per_counted_file: number;
  average_line_count_per_counted_file: number;
}

/**
 * @brief Describes one skipped-input or read-error observation.
 * @details Preserves both the caller-provided path and the canonicalized path plus a stable machine-readable reason string. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolPathIssue {
  input_path: string;
  canonical_path: string;
  reason: string;
}

/**
 * @brief Describes the dominant counted file for one metric ordering.
 * @details Exposes the canonical path plus the numeric token metrics that justify why the file dominates the current context budget. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolDominantFileObservation {
  canonical_path: string;
  token_count: number;
  token_share: number;
}

/**
 * @brief Describes the source-observation subsection of the guidance payload.
 * @details Separates measured ordering facts and path issues from derived recommendations so agents can reason about raw observations independently. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolSourceObservationsSection {
  counted_paths_by_token_count_desc: string[];
  counted_paths_by_line_count_desc: string[];
  skipped_inputs: TokenToolPathIssue[];
  error_inputs: TokenToolPathIssue[];
  dominant_token_file?: TokenToolDominantFileObservation;
}

/**
 * @brief Describes one derived recommendation in the guidance payload.
 * @details Provides a stable recommendation kind, the basis metric used to derive it, and the ordered path list the agent can follow directly. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolRecommendation {
  kind: string;
  basis_metric_name: "token_count" | "line_count";
  ordered_paths: string[];
}

/**
 * @brief Describes one actionable next-step hint in the guidance payload.
 * @details Supplies a stable hint kind, a focused ordered path subset, and the goal the agent can apply without reparsing surrounding prose. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolNextStepHint {
  kind: string;
  ordered_paths: string[];
  goal: string;
}

/**
 * @brief Describes the guidance section of the agent-oriented token payload.
 * @details Separates source observations, derived recommendations, and actionable next-step hints so downstream agents can choose between raw evidence and planning heuristics without reparsing mixed prose. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolGuidanceSection {
  source_observations: TokenToolSourceObservationsSection;
  derived_recommendations: TokenToolRecommendation[];
  actionable_next_steps: TokenToolNextStepHint[];
}

/**
 * @brief Describes the full agent-oriented token payload.
 * @details Exposes only aggregate numeric totals plus per-file metrics, omitting request echoes and derived guidance that can be inferred from tool registration or recomputed by the caller. The interface is compile-time only and introduces no runtime cost.
 */
export interface TokenToolPayload {
  summary: TokenToolSummarySection;
  files: TokenToolFileEntry[];
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
 * @brief Counts logical lines in one text payload.
 * @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
 * @param[in] content {string} Text payload.
 * @return {number} Logical line count; `0` for empty content.
 */
function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  const newlineCount = content.match(/\r\n|\r|\n/g)?.length ?? 0;
  return /(?:\r\n|\r|\n)$/.test(content) ? newlineCount : newlineCount + 1;
}

/**
 * @brief Strips YAML front matter from markdown content before heading extraction.
 * @details Removes the first `--- ... ---` block only when it appears at the file start so heading detection can operate on semantic markdown content instead of metadata. Runtime is O(n) in content length. No side effects occur.
 * @param[in] content {string} Markdown payload.
 * @return {string} Markdown body without the leading front matter block.
 */
function stripMarkdownFrontMatter(content: string): string {
  const frontMatterMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?(?:\n|$)/);
  return frontMatterMatch ? content.slice(frontMatterMatch[0].length) : content;
}

/**
 * @brief Extracts the first level-one markdown heading when present.
 * @details Restricts extraction to markdown-like files, skips YAML front matter, and returns the first `# ` heading payload without surrounding whitespace. Runtime is O(n) in content length. No side effects occur.
 * @param[in] content {string} File content.
 * @param[in] filePath {string} Source path used for extension-based markdown detection.
 * @return {string | undefined} First heading text, or `undefined` when absent or the file is not markdown-like.
 */
function extractPrimaryHeadingText(content: string, filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  if (![".md", ".markdown", ".mdx"].includes(extension)) {
    return undefined;
  }
  const headingMatch = stripMarkdownFrontMatter(content).match(/^#\s+(.+?)\s*$/m);
  return headingMatch?.[1]?.trim() || undefined;
}

/**
 * @brief Infers a file language label optimized for agent payloads.
 * @details Reuses source-language detection when available, normalizes markdown extensions explicitly, and falls back to the lowercase extension name without the leading dot. Runtime is O(1). No side effects occur.
 * @param[in] filePath {string} File path whose extension should be classified.
 * @return {string | undefined} Normalized language label, or `undefined` when the path has no usable extension.
 */
function inferLanguageName(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  if ([".md", ".markdown"].includes(extension)) {
    return "markdown";
  }
  if (extension === ".mdx") {
    return "mdx";
  }
  return detectSourceLanguage(filePath) ?? (extension ? extension.slice(1) : undefined);
}

/**
 * @brief Extracts leading Doxygen file fields when present.
 * @details Tests common leading-comment syntaxes, normalizes an optional shebang away before matching, and returns the first non-empty parsed Doxygen map. Runtime is O(n) in comment length. No side effects occur.
 * @param[in] content {string} File content.
 * @return {DoxygenFieldMap | undefined} Parsed Doxygen field map, or `undefined` when no supported file-level fields are present.
 */
function extractLeadingDoxygenFields(content: string): DoxygenFieldMap | undefined {
  const normalizedContent = content.replace(/^#![^\n]*\n/, "");
  const candidates = [
    normalizedContent.match(/^\s*(\/\*\*[\s\S]*?\*\/|\/\*![\s\S]*?\*\/)/)?.[1],
    normalizedContent.match(/^(?:\s*\/\/\/?!?[^\n]*(?:\n|$))+/)?.[0],
    normalizedContent.match(/^(?:\s*#(?:\s|$)[^\n]*(?:\n|$))+/)?.[0],
    normalizedContent.match(/^\s*(?:"""[\s\S]*?"""|'''[\s\S]*?''')/)?.[0],
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const fields = parseDoxygenComment(candidate);
    if (Object.keys(fields).length > 0) {
      return fields;
    }
  }
  return undefined;
}

/**
 * @brief Rounds one ratio to six decimal places.
 * @details Preserves zero exactly and otherwise limits floating-point noise so share fields remain stable across executions. Runtime is O(1). No side effects occur.
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
 * @brief Probes one requested path before token counting.
 * @details Resolves whether the target exists and is a regular file while capturing a stable skip reason for missing or non-file inputs. Runtime is dominated by one filesystem stat. Side effects are limited to filesystem reads.
 * @param[in] absolutePath {string} Absolute path to inspect.
 * @return {{ exists: boolean; isFile: boolean; reason?: string }} Path probe result.
 */
function probeRequestedPath(absolutePath: string): { exists: boolean; isFile: boolean; reason?: string } {
  if (!fs.existsSync(absolutePath)) {
    return { exists: false, isFile: false, reason: "not found" };
  }
  try {
    const isFile = fs.statSync(absolutePath).isFile();
    return isFile ? { exists: true, isFile: true } : { exists: true, isFile: false, reason: "not a file" };
  } catch (error) {
    return {
      exists: true,
      isFile: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @brief Builds one rich per-file metrics record from readable content.
 * @details Combines token, character, byte, and line counts with file-extension, inferred-language, heading, and Doxygen metadata extraction so agents can consume direct-access facts without reparsing the raw file. Runtime is O(n) in content length. No external state is mutated.
 * @param[in] filePath {string} Absolute or project-local file path.
 * @param[in] content {string} UTF-8 file content.
 * @param[in] counter {TokenCounter} Reused token counter instance.
 * @return {CountFileMetricsResult} Structured per-file metrics record.
 */
function buildCountFileMetricsResult(filePath: string, content: string, counter: TokenCounter): CountFileMetricsResult {
  const lineCount = countLines(content);
  return {
    file: filePath,
    tokens: counter.countTokens(content),
    chars: TokenCounter.countChars(content),
    bytes: Buffer.byteLength(content, "utf8"),
    lines: lineCount,
    startLineNumber: lineCount > 0 ? 1 : 0,
    endLineNumber: lineCount,
    fileExtension: path.extname(filePath).toLowerCase(),
    languageName: inferLanguageName(filePath),
    primaryHeadingText: extractPrimaryHeadingText(content, filePath),
    doxygenFileFields: extractLeadingDoxygenFields(content),
  };
}

/**
 * @brief Counts tokens, characters, bytes, and lines for one in-memory content string.
 * @details Instantiates a `TokenCounter`, tokenizes the supplied text, and pairs the result with raw character length, UTF-8 byte size, and logical line count. Runtime is O(n). No filesystem I/O occurs.
 * @param[in] content {string} Text payload to measure.
 * @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
 * @return {{ tokens: number; chars: number; bytes: number; lines: number }} Aggregate metrics for the supplied content.
 */
export function countFileMetrics(content: string, encodingName = TOKEN_COUNTER_ENCODING): {
  tokens: number;
  chars: number;
  bytes: number;
  lines: number;
} {
  const counter = new TokenCounter(encodingName);
  return {
    tokens: counter.countTokens(content),
    chars: TokenCounter.countChars(content),
    bytes: Buffer.byteLength(content, "utf8"),
    lines: countLines(content),
  };
}

/**
 * @brief Counts tokens, characters, bytes, and lines for multiple files.
 * @details Reuses a single `TokenCounter`, reads each file as UTF-8, and returns per-file metrics plus direct-access metadata such as heading and Doxygen file fields. Read failures are captured as error strings instead of aborting the entire batch. Runtime is O(F + S). Side effects are limited to filesystem reads.
 * @param[in] filePaths {string[]} File paths to measure.
 * @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
 * @return {CountFileMetricsResult[]} Per-file metrics and optional read errors.
 * @satisfies REQ-010, REQ-070, REQ-073
 */
export function countFilesMetrics(filePaths: string[], encodingName = TOKEN_COUNTER_ENCODING): CountFileMetricsResult[] {
  const counter = new TokenCounter(encodingName);
  return filePaths.map((filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return buildCountFileMetricsResult(filePath, content, counter);
    } catch (error) {
      return {
        file: filePath,
        tokens: 0,
        chars: 0,
        bytes: 0,
        lines: 0,
        startLineNumber: 0,
        endLineNumber: 0,
        fileExtension: path.extname(filePath).toLowerCase(),
        languageName: inferLanguageName(filePath),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/**
 * @brief Builds the agent-oriented JSON payload for token-centric tools.
 * @details Validates requested paths against the filesystem, counts token metrics for processable files, preserves caller order in the file table, and emits direct-access file facts such as sizes, headings, and optional Doxygen file fields while omitting request echoes and derived guidance. Runtime is O(F + S). Side effects are limited to filesystem reads.
 * @param[in] options {BuildTokenToolPayloadOptions} Payload-construction options.
 * @return {TokenToolPayload} Structured token payload ordered as summary then files.
 * @satisfies REQ-010, REQ-017, REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075
 */
export function buildTokenToolPayload(options: BuildTokenToolPayloadOptions): TokenToolPayload {
  const baseDir = path.resolve(options.baseDir);
  const encodingName = options.encodingName ?? TOKEN_COUNTER_ENCODING;
  const requestedEntries = options.requestedPaths.map((inputPath, index) => {
    const absolutePath = path.resolve(baseDir, inputPath);
    const pathProbe = probeRequestedPath(absolutePath);
    return {
      requestIndex: index + 1,
      inputPath,
      absolutePath,
      canonicalPath: canonicalizeTokenPath(absolutePath, baseDir),
      pathProbe,
    };
  });
  const readableEntries = requestedEntries.filter((entry) => entry.pathProbe.isFile);
  const measuredResults = countFilesMetrics(readableEntries.map((entry) => entry.absolutePath), encodingName);
  const measuredByRequestIndex = new Map<number, CountFileMetricsResult>();
  readableEntries.forEach((entry, index) => {
    measuredByRequestIndex.set(entry.requestIndex, measuredResults[index]!);
  });
  const files: TokenToolFileEntry[] = requestedEntries.map((entry) => {
    const measured = measuredByRequestIndex.get(entry.requestIndex);
    const fileExtension = measured?.fileExtension ?? path.extname(entry.absolutePath).toLowerCase();
    const languageName = measured?.languageName ?? inferLanguageName(entry.absolutePath);
    if (!entry.pathProbe.isFile) {
      return {
        request_index: entry.requestIndex,
        input_path: entry.inputPath,
        canonical_path: entry.canonicalPath,
        absolute_path: entry.absolutePath.split(path.sep).join("/"),
        file_name: path.basename(entry.canonicalPath),
        file_extension: fileExtension,
        language_name: languageName,
        status: "skipped",
        exists: entry.pathProbe.exists,
        is_file: false,
        start_line_number: 0,
        end_line_number: 0,
        line_count: 0,
        token_count: 0,
        character_count: 0,
        byte_count: 0,
        token_share: 0,
        character_share: 0,
        byte_share: 0,
        error_message: entry.pathProbe.reason ?? "not a file",
      };
    }
    const status: TokenFileStatus = measured?.error ? "error" : "counted";
    return {
      request_index: entry.requestIndex,
      input_path: entry.inputPath,
      canonical_path: entry.canonicalPath,
      absolute_path: entry.absolutePath.split(path.sep).join("/"),
      file_name: path.basename(entry.canonicalPath),
      file_extension: fileExtension,
      language_name: languageName,
      status,
      exists: true,
      is_file: true,
      start_line_number: measured?.startLineNumber ?? 0,
      end_line_number: measured?.endLineNumber ?? 0,
      line_count: measured?.lines ?? 0,
      primary_heading_text: measured?.primaryHeadingText,
      doxygen_file_fields: measured?.doxygenFileFields,
      token_count: measured?.tokens ?? 0,
      character_count: measured?.chars ?? 0,
      byte_count: measured?.bytes ?? 0,
      token_share: 0,
      character_share: 0,
      byte_share: 0,
      error_message: measured?.error,
    };
  });
  const totalTokenCount = files
    .filter((entry) => entry.status === "counted")
    .reduce((sum, entry) => sum + entry.token_count, 0);
  const totalCharacterCount = files
    .filter((entry) => entry.status === "counted")
    .reduce((sum, entry) => sum + entry.character_count, 0);
  const totalByteCount = files
    .filter((entry) => entry.status === "counted")
    .reduce((sum, entry) => sum + entry.byte_count, 0);
  const totalLineCount = files
    .filter((entry) => entry.status === "counted")
    .reduce((sum, entry) => sum + entry.line_count, 0);
  const filesWithShares = files.map((entry) => ({
    ...entry,
    token_share: roundRatio(entry.token_count, totalTokenCount),
    character_share: roundRatio(entry.character_count, totalCharacterCount),
    byte_share: roundRatio(entry.byte_count, totalByteCount),
  }));
  const countedFileCount = filesWithShares.filter((entry) => entry.status === "counted").length;
  const errorFileCount = filesWithShares.filter((entry) => entry.status === "error").length;
  const skippedFileCount = filesWithShares.filter((entry) => entry.status === "skipped").length;
  return {
    summary: {
      processable_file_count: countedFileCount + errorFileCount,
      counted_file_count: countedFileCount,
      error_file_count: errorFileCount,
      skipped_file_count: skippedFileCount,
      total_token_count: totalTokenCount,
      total_character_count: totalCharacterCount,
      total_byte_count: totalByteCount,
      total_line_count: totalLineCount,
      average_token_count_per_counted_file: countedFileCount === 0 ? 0 : Number((totalTokenCount / countedFileCount).toFixed(6)),
      average_character_count_per_counted_file: countedFileCount === 0 ? 0 : Number((totalCharacterCount / countedFileCount).toFixed(6)),
      average_byte_count_per_counted_file: countedFileCount === 0 ? 0 : Number((totalByteCount / countedFileCount).toFixed(6)),
      average_line_count_per_counted_file: countedFileCount === 0 ? 0 : Number((totalLineCount / countedFileCount).toFixed(6)),
    },
    files: filesWithShares,
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
