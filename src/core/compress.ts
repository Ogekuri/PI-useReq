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
 * @details Used by `detectLanguage` and `compressFile` to route files into the correct comment-stripping rules. Lookup complexity is O(1).
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
 * @brief Formats compressed source entries as newline-delimited text.
 * @details Emits either `line: text` pairs or plain text lines depending on the caller flag. Runtime is O(n) in entry count and content length. No side effects occur.
 * @param[in] entries {Array<[number, string]>} Compressed source lines paired with original line numbers.
 * @param[in] includeLineNumbers {boolean} When `true`, prefix each line with its original line number.
 * @return {string} Final compressed source text.
 */
function formatResult(entries: Array<[number, string]>, includeLineNumbers: boolean): string {
  return entries
    .map(([lineNumber, text]) => (includeLineNumbers ? `${lineNumber}: ${text}` : text))
    .join("\n");
}

/**
 * @brief Compresses in-memory source text for one language.
 * @details Removes blank lines and comments, preserves shebangs, respects string-literal boundaries, and retains leading indentation for indentation-significant languages. Runtime is O(n) in source length. No external state is mutated.
 * @param[in] source {string} Raw source text.
 * @param[in] language {string} Canonical compression language identifier.
 * @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
 * @return {string} Compressed source text.
 * @throws {Error} Throws when the language is unsupported.
 */
export function compressSource(source: string, language: string, includeLineNumbers = true): string {
  const specs = getSpecs();
  const langKey = language.toLowerCase().trim().replace(/^\./, "");
  const spec = specs[langKey];
  if (!spec) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const preserveIndent = INDENT_SIGNIFICANT.has(langKey);
  const lines = source.split("\n");
  const result: Array<[number, string]> = [];

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
        result.push([index + 1, stripped]);
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
      result.push([index + 1, line]);
    }
    index += 1;
  }

  return formatResult(result, includeLineNumbers);
}

/**
 * @brief Compresses one source file from disk.
 * @details Detects the language when not supplied, reads the file as UTF-8, and delegates to `compressSource`. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] filePath {string} Source file path.
 * @param[in] language {string | undefined} Optional explicit language override.
 * @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
 * @return {string} Compressed source text.
 * @throws {Error} Throws when the language cannot be detected or the file cannot be read.
 */
export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string {
  const detectedLanguage = language ?? detectLanguage(filePath);
  if (!detectedLanguage) {
    throw new Error(`Cannot detect language for '${filePath}'. Use --lang to specify explicitly.`);
  }
  const source = fs.readFileSync(filePath, "utf8");
  return compressSource(source, detectedLanguage, includeLineNumbers);
}
