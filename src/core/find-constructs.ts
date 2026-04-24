/**
 * @file
 * @brief Searches named language constructs in explicit source-file lists and renders compact excerpts.
 * @details Combines source analysis, tag filtering, regex name matching, optional Doxygen extraction, and comment-stripped code rendering. Runtime is O(F + S + M) where F is file count, S is analyzed source size, and M is candidate element count. Side effects are limited to filesystem reads and optional stderr logging.
 */

import fs from "node:fs";
import { compressSource, detectLanguage } from "./compress.js";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
import { SourceAnalyzer, SourceElement, ElementType } from "./source-analyzer.js";

/**
 * @brief Maps each supported language to the construct tags that can be queried.
 * @details The table bounds user tag filters to constructs the analyzer can detect for each language. Membership checks are O(1) because each language entry stores a `Set<string>`.
 */
export const LANGUAGE_TAGS: Record<string, Set<string>> = {
  python: new Set(["CLASS", "FUNCTION", "DECORATOR", "IMPORT", "VARIABLE"]),
  c: new Set(["STRUCT", "UNION", "ENUM", "TYPEDEF", "MACRO", "FUNCTION", "IMPORT", "VARIABLE"]),
  cpp: new Set(["CLASS", "STRUCT", "ENUM", "NAMESPACE", "FUNCTION", "MACRO", "IMPORT", "TYPE_ALIAS"]),
  rust: new Set(["FUNCTION", "STRUCT", "ENUM", "TRAIT", "IMPL", "MODULE", "MACRO", "CONSTANT", "TYPE_ALIAS", "IMPORT", "DECORATOR"]),
  javascript: new Set(["CLASS", "FUNCTION", "COMPONENT", "CONSTANT", "IMPORT", "MODULE"]),
  typescript: new Set(["INTERFACE", "TYPE_ALIAS", "ENUM", "CLASS", "FUNCTION", "NAMESPACE", "MODULE", "IMPORT", "DECORATOR"]),
  java: new Set(["CLASS", "INTERFACE", "ENUM", "FUNCTION", "IMPORT", "MODULE", "DECORATOR", "CONSTANT"]),
  go: new Set(["FUNCTION", "METHOD", "STRUCT", "INTERFACE", "TYPE_ALIAS", "CONSTANT", "IMPORT", "MODULE"]),
  ruby: new Set(["CLASS", "MODULE", "FUNCTION", "CONSTANT", "IMPORT", "DECORATOR"]),
  php: new Set(["CLASS", "INTERFACE", "TRAIT", "FUNCTION", "NAMESPACE", "IMPORT", "CONSTANT"]),
  swift: new Set(["CLASS", "STRUCT", "ENUM", "PROTOCOL", "EXTENSION", "FUNCTION", "IMPORT", "CONSTANT", "VARIABLE"]),
  kotlin: new Set(["CLASS", "INTERFACE", "ENUM", "FUNCTION", "CONSTANT", "VARIABLE", "MODULE", "IMPORT", "DECORATOR"]),
  scala: new Set(["CLASS", "TRAIT", "MODULE", "FUNCTION", "CONSTANT", "VARIABLE", "TYPE_ALIAS", "IMPORT"]),
  lua: new Set(["FUNCTION", "VARIABLE"]),
  shell: new Set(["FUNCTION", "VARIABLE", "IMPORT"]),
  perl: new Set(["FUNCTION", "MODULE", "IMPORT", "CONSTANT"]),
  haskell: new Set(["MODULE", "TYPE_ALIAS", "STRUCT", "CLASS", "FUNCTION", "IMPORT"]),
  zig: new Set(["FUNCTION", "STRUCT", "ENUM", "UNION", "CONSTANT", "VARIABLE", "IMPORT"]),
  elixir: new Set(["MODULE", "FUNCTION", "PROTOCOL", "IMPL", "STRUCT", "IMPORT"]),
  csharp: new Set(["CLASS", "INTERFACE", "STRUCT", "ENUM", "NAMESPACE", "FUNCTION", "PROPERTY", "IMPORT", "DECORATOR", "CONSTANT"]),
};

/**
 * @brief Formats the supported tag matrix for user-facing error messages.
 * @details Sorts languages alphabetically and emits one bullet per language containing its sorted construct tags. Runtime is O(l * t log t). No side effects occur.
 * @return {string} Multiline markdown-like tag summary.
 */
export function formatAvailableTags(): string {
  return Object.keys(LANGUAGE_TAGS)
    .sort()
    .map((language) => `- ${language.charAt(0).toUpperCase()}${language.slice(1)}: ${[...LANGUAGE_TAGS[language]!].sort().join(", ")}`)
    .join("\n");
}

/**
 * @brief Parses a pipe-delimited construct tag filter.
 * @details Splits the raw filter on `|`, trims whitespace, uppercases entries, and removes empty tokens. Runtime is O(n) in input length. No side effects occur.
 * @param[in] tagString {string} Raw pipe-delimited tag expression.
 * @return {Set<string>} Normalized tag set.
 */
export function parseTagFilter(tagString: string): Set<string> {
  return new Set(
    tagString
      .split("|")
      .map((tag) => tag.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * @brief Tests whether a language supports at least one requested tag.
 * @details Performs O(k) membership checks across the requested tag set against the language-specific supported-tag set. No external state is mutated.
 * @param[in] language {string} Canonical analyzer language identifier.
 * @param[in] tagSet {Set<string>} Requested construct tags.
 * @return {boolean} `true` when at least one requested tag is supported for the language.
 */
export function languageSupportsTags(language: string, tagSet: Set<string>): boolean {
  const supported = LANGUAGE_TAGS[language] ?? new Set<string>();
  return [...tagSet].some((tag) => supported.has(tag));
}

/**
 * @brief Tests whether one analyzed element satisfies tag and name filters.
 * @details Rejects elements whose type label is outside the requested tag set or that do not expose a name, then applies the user regex to the name. Invalid regex patterns are treated as non-matches. Runtime is O(p) for regex evaluation plus constant filtering work.
 * @param[in] element {SourceElement} Candidate source element.
 * @param[in] tagSet {Set<string>} Requested construct tags.
 * @param[in] pattern {string} User-provided regular expression applied to element names.
 * @return {boolean} `true` when the element matches both tag and name criteria.
 */
export function constructMatches(element: SourceElement, tagSet: Set<string>, pattern: string): boolean {
  if (!tagSet.has(element.typeLabel)) return false;
  if (!element.name) return false;
  try {
    return new RegExp(pattern).test(element.name);
  } catch {
    return false;
  }
}

/**
 * @brief Merges parsed Doxygen field arrays into one accumulator.
 * @details Appends values for matching tags without deduplication so comment order is preserved. Runtime is O(v) in merged value count. The function mutates `baseFields` in place.
 * @param[in,out] baseFields {Record<string, string[]>} Mutable destination map.
 * @param[in] extraFields {Record<string, string[]>} Source map to append.
 * @return {Record<string, string[]>} The mutated destination map.
 */
function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]> {
  Object.entries(extraFields).forEach(([tag, values]) => {
    baseFields[tag] ??= [];
    baseFields[tag].push(...values);
  });
  return baseFields;
}

/**
 * @brief Collects Doxygen fields associated with one construct.
 * @details Starts with fields already attached to the element and extends them with nearby body comments from the first three lines of the body. Runtime is O(c) in inspected comment count. No external state is mutated.
 * @param[in] element {SourceElement} Source element whose documentation should be aggregated.
 * @return {Record<string, string[]>} Aggregated Doxygen field map.
 */
function extractConstructDoxygenFields(element: SourceElement): Record<string, string[]> {
  const aggregate: Record<string, string[]> = {};
  if (element.doxygenFields) mergeDoxygenFields(aggregate, element.doxygenFields);
  element.bodyComments.forEach((bodyComment) => {
    const [commentLineStart, , commentText] = bodyComment;
    if (commentLineStart > element.lineStart + 3) return;
    const parsed = parseDoxygenComment(commentText);
    if (Object.keys(parsed).length > 0) mergeDoxygenFields(aggregate, parsed);
  });
  return aggregate;
}

/**
 * @brief Extracts file-level Doxygen fields from analyzed elements.
 * @details Scans non-inline comment elements for an `@file` tag and returns the first parsed Doxygen map encountered in source order. Runtime is O(n). No side effects occur.
 * @param[in] elements {SourceElement[]} Analyzed source elements.
 * @return {Record<string, string[]>} Parsed file-level Doxygen field map, or an empty map when absent.
 */
function extractFileLevelDoxygenFields(elements: SourceElement[]): Record<string, string[]> {
  const fileTagPattern = /(?<!\w)(?:@|\\)file\b/;
  const commentElements = elements
    .filter((element) => element.typeLabel === "COMMENT" && element.name !== "inline")
    .sort((a, b) => (a.lineStart - b.lineStart) || (a.lineEnd - b.lineEnd));
  for (const comment of commentElements) {
    const text = comment.commentSource || comment.extract;
    if (!text || !fileTagPattern.test(text)) continue;
    return parseDoxygenComment(text);
  }
  return {};
}

/**
 * @brief Describes one stripped-code line extracted from a matched construct.
 * @details Preserves output order, original source coordinates, normalized stripped text, and rendered display text so markdown and JSON renderers can share one canonical intermediate format. The interface is compile-time only and introduces no runtime cost.
 */
export interface StrippedConstructLineEntry {
  output_line_number: number;
  source_line_number: number;
  text: string;
  display_text: string;
}

/**
 * @brief Removes comments from a construct excerpt and returns structured stripped-code lines.
 * @details Reuses `compressSource` for comment stripping, translates local compressed line numbers back into absolute file coordinates, and emits both direct-access text fields and rendered display strings. Runtime is O(n) in excerpt length. No external state is mutated.
 * @param[in] codeLines {string[]} Raw code lines belonging to the construct.
 * @param[in] language {string} Canonical analyzer language identifier.
 * @param[in] lineStart {number} Absolute starting line number of the construct.
 * @param[in] includeLineNumbers {boolean} When `true`, `display_text` includes absolute source line prefixes.
 * @return {StrippedConstructLineEntry[]} Structured stripped-code line entries.
 */
export function buildStrippedConstructLineEntries(
  codeLines: string[],
  language: string,
  lineStart: number,
  includeLineNumbers: boolean,
): StrippedConstructLineEntry[] {
  const rawSource = codeLines.join("");
  const strippedWithLocalNumbers = compressSource(rawSource, language, true);
  return strippedWithLocalNumbers
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line, outputIndex) => {
      const match = /^(\d+):\s(.*)$/.exec(line);
      if (!match) {
        return {
          output_line_number: outputIndex + 1,
          source_line_number: lineStart + outputIndex,
          text: line,
          display_text: line,
        } satisfies StrippedConstructLineEntry;
      }
      const localLine = Number.parseInt(match[1]!, 10);
      const absoluteLine = lineStart + localLine - 1;
      const strippedText = match[2]!;
      return {
        output_line_number: outputIndex + 1,
        source_line_number: absoluteLine,
        text: strippedText,
        display_text: includeLineNumbers ? `${absoluteLine}: ${strippedText}` : strippedText,
      } satisfies StrippedConstructLineEntry;
    });
}

/**
 * @brief Removes comments from a construct excerpt while preserving optional absolute line numbers.
 * @details Delegates to `buildStrippedConstructLineEntries(...)` and joins the rendered display strings into one newline-delimited excerpt. Runtime is O(n) in excerpt length. No external state is mutated.
 * @param[in] codeLines {string[]} Raw code lines belonging to the construct.
 * @param[in] language {string} Canonical analyzer language identifier.
 * @param[in] lineStart {number} Absolute starting line number of the construct.
 * @param[in] includeLineNumbers {boolean} When `true`, emit absolute source line prefixes.
 * @return {string} Comment-stripped construct excerpt.
 */
function stripConstructComments(codeLines: string[], language: string, lineStart: number, includeLineNumbers: boolean): string {
  return buildStrippedConstructLineEntries(codeLines, language, lineStart, includeLineNumbers)
    .map((line) => line.display_text)
    .join("\n");
}

/**
 * @brief Formats one matched construct as markdown.
 * @details Emits construct metadata, attached Doxygen fields, and a fenced code block stripped of comments. Runtime is O(n) in construct span length plus attached documentation size. No side effects occur.
 * @param[in] element {SourceElement} Matched source element.
 * @param[in] sourceLines {string[]} Full source file split into line-preserving entries.
 * @param[in] includeLineNumbers {boolean} When `true`, include absolute source line prefixes.
 * @param[in] language {string} Canonical analyzer language identifier. Defaults to `python`.
 * @return {string} Markdown section for the matched construct.
 */
export function formatConstruct(element: SourceElement, sourceLines: string[], includeLineNumbers: boolean, language = "python"): string {
  const lines: string[] = [];
  lines.push(`### ${element.typeLabel}: \`${element.name}\``);
  if (element.signature) lines.push(`> Signature: \`${element.signature}\``);
  lines.push(`> Lines: ${element.lineStart}-${element.lineEnd}`);
  const doxygenFields = extractConstructDoxygenFields(element);
  if (Object.keys(doxygenFields).length > 0) {
    lines.push(...formatDoxygenFieldsAsMarkdown(doxygenFields));
  }
  const codeLines = sourceLines.slice(element.lineStart - 1, element.lineEnd);
  const formatted = stripConstructComments(codeLines, language, element.lineStart, includeLineNumbers);
  lines.push("```");
  lines.push(formatted);
  lines.push("```");
  return lines.join("\n");
}

/**
 * @brief Searches named constructs across explicit files and renders markdown excerpts.
 * @details Validates files, infers languages, skips unsupported tag/language combinations, analyzes source elements, filters matches by tag and regex, and emits one markdown section per file containing matches. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] filePaths {string[]} Explicit file paths to search.
 * @param[in] tagFilter {string} Pipe-delimited requested construct tags.
 * @param[in] pattern {string} Regular expression applied to construct names.
 * @param[in] includeLineNumbers {boolean} When `true`, preserve absolute source line numbers in code excerpts.
 * @param[in] verbose {boolean} When `true`, write progress and skip diagnostics to stderr.
 * @return {string} Concatenated markdown output grouped by file.
 * @throws {Error} Throws when no valid tags are provided or when no constructs match the request.
 */
export function searchConstructsInFiles(
  filePaths: string[],
  tagFilter: string,
  pattern: string,
  includeLineNumbers = true,
  verbose = false,
): string {
  const tagSet = parseTagFilter(tagFilter);
  if (tagSet.size === 0) {
    throw new Error(`No valid tags specified in tag filter.\n\nAvailable tags by language:\n${formatAvailableTags()}`);
  }

  const parts: string[] = [];
  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let totalMatches = 0;

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      if (verbose) console.error(`  SKIP  ${filePath} (not found)`);
      skipCount += 1;
      continue;
    }
    const language = detectLanguage(filePath);
    if (!language) {
      if (verbose) console.error(`  SKIP  ${filePath} (unsupported extension)`);
      skipCount += 1;
      continue;
    }
    if (!languageSupportsTags(language, tagSet)) {
      if (verbose) console.error(`  SKIP  ${filePath} (language ${language} does not support any requested tags)`);
      skipCount += 1;
      continue;
    }

    try {
      const sourceLines = fs.readFileSync(filePath, "utf8").split(/(?<=\n)/);
      const analyzer = new SourceAnalyzer();
      const elements = analyzer.analyze(filePath, language);
      analyzer.enrich(elements, language, filePath);
      const matches = elements.filter((element) => constructMatches(element, tagSet, pattern));
      if (matches.length > 0) {
        const header = `@@@ ${filePath} | ${language}`;
        const fileLevelDoxygen = extractFileLevelDoxygenFields(elements);
        const fileLevelLines = Object.keys(fileLevelDoxygen).length > 0 ? formatDoxygenFieldsAsMarkdown(fileLevelDoxygen) : [];
        const constructsMarkdown = matches.map((element) => formatConstruct(element, sourceLines, includeLineNumbers, language)).join("\n\n");
        parts.push(fileLevelLines.length > 0 ? `${header}\n${fileLevelLines.join("\n")}\n\n${constructsMarkdown}` : `${header}\n\n${constructsMarkdown}`);
        totalMatches += matches.length;
        okCount += 1;
        if (verbose) console.error(`  OK    ${filePath} (${matches.length} matches)`);
      } else {
        if (verbose) console.error(`  SKIP  ${filePath} (no matches)`);
        skipCount += 1;
      }
    } catch (error) {
      failCount += 1;
      if (verbose) console.error(`  FAIL  ${filePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (parts.length === 0) {
    throw new Error(`No constructs found matching the specified criteria.\n\nAvailable tags by language:\n${formatAvailableTags()}`);
  }
  if (verbose) console.error(`\n  Found: ${totalMatches} constructs in ${okCount} files (${skipCount} skipped, ${failCount} failed)`);
  return parts.join("\n\n");
}
