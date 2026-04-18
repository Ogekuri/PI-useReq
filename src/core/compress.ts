/**
 * @file
 * @brief Removes comments and redundant whitespace from source code while preserving semantic structure.
 * @details Provides extension-based language detection and language-aware source compression backed by analyzer language specs. Runtime is linear in processed source size. Side effects are limited to filesystem reads in file-based helpers.
 */

import fs from "node:fs";
import path from "node:path";
import { buildLanguageSpecs } from "./source-analyzer.js";

/**
 * @brief Maps filename extensions to compression language identifiers.
 * @details Used by `detectLanguage`, `compressFile`, and `compressFileDetailed` to route files into the correct comment-stripping rules. Lookup complexity is O(1).
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
 * @brief Identifies languages whose indentation must be preserved during compression.
 * @details These languages encode block structure via indentation, so whitespace normalization keeps leading indentation intact. Membership checks are O(1).
 */
const INDENT_SIGNIFICANT = new Set(["python", "haskell", "elixir"]);

/**
 * @brief Caches analyzer language specifications for reuse.
 * @details Lazy initialization avoids rebuilding the large language-spec table on every compression request. Access complexity is O(1) after first load.
 */
let specsCache: ReturnType<typeof buildLanguageSpecs> | undefined;

/**
 * @brief Describes one structured compressed output line.
 * @details Separates source coordinates, output order, raw compressed text, and rendered display text so downstream JSON payloads can expose line facts without reparsing prefixed strings. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressedLineEntry {
  compressed_line_number: number;
  source_line_number: number;
  text: string;
  display_text: string;
}

/**
 * @brief Describes one structured compression result.
 * @details Exposes language identity, source line metrics, removed-line totals, structured compressed lines, and the final rendered excerpt text so CLI and agent-tool layers can share one canonical compression model. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressedSourceResult {
  language_id: string;
  include_line_numbers: boolean;
  source_line_count: number;
  source_start_line_number: number;
  source_end_line_number: number;
  source_line_range: [number, number];
  compressed_line_count: number;
  removed_line_count: number;
  compressed_lines: CompressedLineEntry[];
  compressed_source_text: string;
}

/**
 * @brief Returns the cached language specification table.
 * @details Initializes the cache on first access by calling `buildLanguageSpecs`, then reuses the result for all subsequent calls. Time complexity is O(1) after cold start. Mutates module-local cache state only.
 * @return {ReturnType<typeof buildLanguageSpecs>} Cached language specification map.
 */
function getSpecs() {
  specsCache ??= buildLanguageSpecs();
  return specsCache;
}

/**
 * @brief Infers a compression language from a file path extension.
 * @details Lowercases the file extension and looks it up in `EXT_LANG_MAP`. Time complexity is O(1). No I/O side effects occur.
 * @param[in] filePath {string} Source file path.
 * @return {string | undefined} Canonical compression language identifier, or `undefined` when unsupported.
 */
export function detectLanguage(filePath: string): string | undefined {
  return EXT_LANG_MAP[path.extname(filePath).toLowerCase()];
}

/**
 * @brief Counts logical lines in one text payload.
 * @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
 * @param[in] content {string} Source text.
 * @return {number} Logical line count; `0` for empty content.
 */
function countLogicalLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  const newlineCount = content.match(/\r\n|\r|\n/g)?.length ?? 0;
  return /(?:\r\n|\r|\n)$/.test(content) ? newlineCount : newlineCount + 1;
}

/**
 * @brief Tests whether a character position falls inside a string literal.
 * @details Scans the line left-to-right while tracking active string delimiters and escaped quote characters. Runtime is O(n) in inspected prefix length. No side effects occur.
 * @param[in] line {string} Source line to inspect.
 * @param[in] pos {number} Zero-based character position.
 * @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
 * @return {boolean} `true` when the position is inside a string literal.
 */
function isInString(line: string, pos: number, stringDelimiters: string[]): boolean {
  let inString: string | undefined;
  let i = 0;
  const sortedDelimiters = [...stringDelimiters].sort((a, b) => b.length - a.length);
  while (i < pos) {
    if (inString) {
      if (line.slice(i).startsWith(inString)) {
        if (inString.length === 1 && i > 0 && line[i - 1] === "\\") {
          let backslashes = 0;
          let j = i - 1;
          while (j >= 0 && line[j] === "\\") {
            backslashes += 1;
            j -= 1;
          }
          if (backslashes % 2 === 1) {
            i += 1;
            continue;
          }
        }
        i += inString.length;
        inString = undefined;
        continue;
      }
      i += 1;
    } else {
      const matched = sortedDelimiters.find((delimiter) => line.slice(i).startsWith(delimiter));
      if (matched) {
        inString = matched;
        i += matched.length;
      } else {
        i += 1;
      }
    }
  }
  return inString !== undefined;
}

/**
 * @brief Removes a trailing single-line comment from a source line.
 * @details Scans the line while respecting string literals so comment markers inside strings are preserved. Runtime is O(n) in line length. No external state is mutated.
 * @param[in] line {string} Source line to strip.
 * @param[in] singleComment {string | undefined} Language single-line comment marker.
 * @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
 * @return {string} Line content before the first real comment marker.
 */
function removeInlineComment(line: string, singleComment: string | undefined, stringDelimiters: string[]): string {
  if (!singleComment) return line;
  const sortedDelimiters = [...stringDelimiters].sort((a, b) => b.length - a.length);
  let inString: string | undefined;
  let i = 0;
  while (i < line.length) {
    if (inString) {
      if (line.slice(i).startsWith(inString)) {
        if (inString.length === 1 && i > 0 && line[i - 1] === "\\") {
          let backslashes = 0;
          let j = i - 1;
          while (j >= 0 && line[j] === "\\") {
            backslashes += 1;
            j -= 1;
          }
          if (backslashes % 2 === 1) {
            i += 1;
            continue;
          }
        }
        i += inString.length;
        inString = undefined;
      } else {
        i += 1;
      }
      continue;
    }

    if (line.slice(i, i + singleComment.length) === singleComment) {
      return line.slice(0, i);
    }
    const matched = sortedDelimiters.find((delimiter) => line.slice(i).startsWith(delimiter));
    if (matched) {
      inString = matched;
      i += matched.length;
    } else {
      i += 1;
    }
  }
  return line;
}

/**
 * @brief Builds one rendered compressed line entry.
 * @details Materializes both the raw compressed text and the display text that optionally prefixes the original source line number. Runtime is O(n) in line length. No side effects occur.
 * @param[in] text {string} Compressed source text for one retained line.
 * @param[in] sourceLineNumber {number} Original source line number.
 * @param[in] compressedLineNumber {number} One-based output line number inside the compressed excerpt.
 * @param[in] includeLineNumbers {boolean} When `true`, prefix the display text with the original source line number.
 * @return {CompressedLineEntry} Structured compressed line entry.
 */
function buildCompressedLineEntry(
  text: string,
  sourceLineNumber: number,
  compressedLineNumber: number,
  includeLineNumbers: boolean,
): CompressedLineEntry {
  return {
    compressed_line_number: compressedLineNumber,
    source_line_number: sourceLineNumber,
    text,
    display_text: includeLineNumbers ? `${sourceLineNumber}: ${text}` : text,
  };
}

/**
 * @brief Formats compressed line entries as newline-delimited text.
 * @details Joins pre-rendered display lines without adding headers, fences, or other presentation artifacts. Runtime is O(n) in entry count and aggregate content length. No side effects occur.
 * @param[in] entries {CompressedLineEntry[]} Structured compressed line entries.
 * @return {string} Final compressed source text.
 */
function formatCompressedSourceText(entries: CompressedLineEntry[]): string {
  return entries.map((entry) => entry.display_text).join("\n");
}

/**
 * @brief Compresses in-memory source text into the structured compression model.
 * @details Removes blank lines and comments, preserves shebangs, respects string-literal boundaries, retains leading indentation for indentation-significant languages, and emits both structured line entries and a rendered text excerpt. Runtime is O(n) in source length. No external state is mutated.
 * @param[in] source {string} Raw source text.
 * @param[in] language {string} Canonical compression language identifier.
 * @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
 * @return {CompressedSourceResult} Structured compression result.
 * @throws {Error} Throws when the language is unsupported.
 */
export function compressSourceDetailed(source: string, language: string, includeLineNumbers = true): CompressedSourceResult {
  const specs = getSpecs();
  const langKey = language.toLowerCase().trim().replace(/^\./, "");
  const spec = specs[langKey];
  if (!spec) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const preserveIndent = INDENT_SIGNIFICANT.has(langKey);
  const lines = source.split("\n");
  const retainedEntries: Array<[number, string]> = [];

  let inMultiComment = false;
  const multiCommentStart = spec.multiCommentStart;
  const multiCommentEnd = spec.multiCommentEnd;
  const stringDelimiters = spec.stringDelimiters;

  const isPython = langKey === "python";
  let inPythonDocstring = false;
  let pythonDocstringDelimiter: string | undefined;

  let index = 0;
  while (index < lines.length) {
    let line = lines[index] ?? "";

    if (inMultiComment) {
      if (multiCommentEnd && line.includes(multiCommentEnd)) {
        const endPos = line.indexOf(multiCommentEnd) + multiCommentEnd.length;
        const remainder = line.slice(endPos);
        inMultiComment = false;
        if (remainder.trim()) {
          lines[index] = remainder;
          continue;
        }
      }
      index += 1;
      continue;
    }

    if (isPython && inPythonDocstring) {
      if (pythonDocstringDelimiter && line.includes(pythonDocstringDelimiter)) {
        const endPos = line.indexOf(pythonDocstringDelimiter) + pythonDocstringDelimiter.length;
        const remainder = line.slice(endPos);
        inPythonDocstring = false;
        pythonDocstringDelimiter = undefined;
        if (remainder.trim()) {
          lines[index] = remainder;
          continue;
        }
      }
      index += 1;
      continue;
    }

    const stripped = line.trim();
    if (!stripped) {
      index += 1;
      continue;
    }

    if (multiCommentStart) {
      if (isPython) {
        let dropped = false;
        for (const quote of ['"""', "'''"]) {
          if (!stripped.startsWith(quote)) continue;
          if (stripped.endsWith(quote) && stripped.length >= 6 && stripped.split(quote).length - 1 >= 2) {
            const codeBefore = line.slice(0, line.indexOf(quote)).trim();
            if (!codeBefore) {
              dropped = true;
              break;
            }
          } else if ((stripped.match(new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length ?? 0) === 1) {
            const codeBefore = line.slice(0, line.indexOf(quote)).trim();
            if (!codeBefore) {
              inPythonDocstring = true;
              pythonDocstringDelimiter = quote;
              dropped = true;
              break;
            }
          }
        }
        if (dropped) {
          index += 1;
          continue;
        }
      } else {
        const multiCommentPos = stripped.indexOf(multiCommentStart);
        if (multiCommentPos !== -1) {
          const fullPos = line.indexOf(multiCommentStart);
          if (!isInString(line, fullPos, stringDelimiters)) {
            const afterStart = line.slice(fullPos + multiCommentStart.length);
            const closePos = multiCommentEnd ? afterStart.indexOf(multiCommentEnd) : -1;
            if (closePos !== -1 && multiCommentStart !== multiCommentEnd) {
              line = line.slice(0, fullPos) + afterStart.slice(closePos + multiCommentEnd!.length);
              if (!line.trim()) {
                index += 1;
                continue;
              }
              lines[index] = line;
              continue;
            }
            const before = line.slice(0, fullPos);
            inMultiComment = true;
            if (before.trim()) {
              line = before;
            } else {
              index += 1;
              continue;
            }
          }
        }
      }
    }

    if (spec.singleComment && stripped.startsWith(spec.singleComment)) {
      if (stripped.startsWith("#!") && index === 0) {
        retainedEntries.push([index + 1, stripped]);
      }
      index += 1;
      continue;
    }

    if (spec.singleComment) {
      line = removeInlineComment(line, spec.singleComment, stringDelimiters);
    }

    if (preserveIndent) {
      const leading = line.slice(0, line.length - line.trimStart().length);
      const content = line.trim();
      if (!content) {
        index += 1;
        continue;
      }
      line = `${leading}${content}`;
    } else {
      line = line.trim();
      if (!line) {
        index += 1;
        continue;
      }
    }

    line = line.replace(/[ \t]+$/g, "");
    if (line) {
      retainedEntries.push([index + 1, line]);
    }
    index += 1;
  }

  const compressedLines = retainedEntries.map(([sourceLineNumber, text], outputIndex) =>
    buildCompressedLineEntry(text, sourceLineNumber, outputIndex + 1, includeLineNumbers),
  );
  const sourceLineCount = countLogicalLines(source);
  const sourceStartLineNumber = compressedLines[0]?.source_line_number ?? 0;
  const sourceEndLineNumber = compressedLines[compressedLines.length - 1]?.source_line_number ?? 0;

  return {
    language_id: langKey,
    include_line_numbers: includeLineNumbers,
    source_line_count: sourceLineCount,
    source_start_line_number: sourceStartLineNumber,
    source_end_line_number: sourceEndLineNumber,
    source_line_range: [sourceStartLineNumber, sourceEndLineNumber],
    compressed_line_count: compressedLines.length,
    removed_line_count: Math.max(sourceLineCount - compressedLines.length, 0),
    compressed_lines: compressedLines,
    compressed_source_text: formatCompressedSourceText(compressedLines),
  };
}

/**
 * @brief Compresses in-memory source text for one language.
 * @details Delegates to `compressSourceDetailed(...)` and returns only the rendered compressed source text so legacy CLI and markdown-oriented paths keep their existing behavior. Runtime is O(n) in source length. No external state is mutated.
 * @param[in] source {string} Raw source text.
 * @param[in] language {string} Canonical compression language identifier.
 * @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
 * @return {string} Compressed source text.
 * @throws {Error} Throws when the language is unsupported.
 */
export function compressSource(source: string, language: string, includeLineNumbers = true): string {
  return compressSourceDetailed(source, language, includeLineNumbers).compressed_source_text;
}

/**
 * @brief Compresses one source file from disk into the structured compression model.
 * @details Detects the language when not supplied, reads the file as UTF-8, and delegates to `compressSourceDetailed(...)`. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] filePath {string} Source file path.
 * @param[in] language {string | undefined} Optional explicit language override.
 * @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
 * @return {CompressedSourceResult} Structured compression result.
 * @throws {Error} Throws when the language cannot be detected or the file cannot be read.
 */
export function compressFileDetailed(filePath: string, language?: string, includeLineNumbers = true): CompressedSourceResult {
  const detectedLanguage = language ?? detectLanguage(filePath);
  if (!detectedLanguage) {
    throw new Error(`Cannot detect language for '${filePath}'. Use --lang to specify explicitly.`);
  }
  const source = fs.readFileSync(filePath, "utf8");
  return compressSourceDetailed(source, detectedLanguage, includeLineNumbers);
}

/**
 * @brief Compresses one source file from disk.
 * @details Delegates to `compressFileDetailed(...)` and returns only the rendered compressed source text so CLI and markdown emitters can retain their established text contract. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] filePath {string} Source file path.
 * @param[in] language {string | undefined} Optional explicit language override.
 * @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
 * @return {string} Compressed source text.
 * @throws {Error} Throws when the language cannot be detected or the file cannot be read.
 */
export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string {
  return compressFileDetailed(filePath, language, includeLineNumbers).compressed_source_text;
}
