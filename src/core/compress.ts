import fs from "node:fs";
import path from "node:path";
import { buildLanguageSpecs } from "./source-analyzer.js";

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

const INDENT_SIGNIFICANT = new Set(["python", "haskell", "elixir"]);
let specsCache: ReturnType<typeof buildLanguageSpecs> | undefined;

function getSpecs() {
  specsCache ??= buildLanguageSpecs();
  return specsCache;
}

export function detectLanguage(filePath: string): string | undefined {
  return EXT_LANG_MAP[path.extname(filePath).toLowerCase()];
}

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

function formatResult(entries: Array<[number, string]>, includeLineNumbers: boolean): string {
  return entries
    .map(([lineNumber, text]) => (includeLineNumbers ? `${lineNumber}: ${text}` : text))
    .join("\n");
}

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

export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string {
  const detectedLanguage = language ?? detectLanguage(filePath);
  if (!detectedLanguage) {
    throw new Error(`Cannot detect language for '${filePath}'. Use --lang to specify explicitly.`);
  }
  const source = fs.readFileSync(filePath, "utf8");
  return compressSource(source, detectedLanguage, includeLineNumbers);
}
