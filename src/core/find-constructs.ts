import fs from "node:fs";
import { compressSource, detectLanguage } from "./compress.js";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
import { SourceAnalyzer, SourceElement, ElementType } from "./source-analyzer.js";

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

export function formatAvailableTags(): string {
  return Object.keys(LANGUAGE_TAGS)
    .sort()
    .map((language) => `- ${language.charAt(0).toUpperCase()}${language.slice(1)}: ${[...LANGUAGE_TAGS[language]!].sort().join(", ")}`)
    .join("\n");
}

export function parseTagFilter(tagString: string): Set<string> {
  return new Set(
    tagString
      .split("|")
      .map((tag) => tag.trim().toUpperCase())
      .filter(Boolean),
  );
}

export function languageSupportsTags(language: string, tagSet: Set<string>): boolean {
  const supported = LANGUAGE_TAGS[language] ?? new Set<string>();
  return [...tagSet].some((tag) => supported.has(tag));
}

export function constructMatches(element: SourceElement, tagSet: Set<string>, pattern: string): boolean {
  if (!tagSet.has(element.typeLabel)) return false;
  if (!element.name) return false;
  try {
    return new RegExp(pattern).test(element.name);
  } catch {
    return false;
  }
}

function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]> {
  Object.entries(extraFields).forEach(([tag, values]) => {
    baseFields[tag] ??= [];
    baseFields[tag].push(...values);
  });
  return baseFields;
}

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

function stripConstructComments(codeLines: string[], language: string, lineStart: number, includeLineNumbers: boolean): string {
  const rawSource = codeLines.join("");
  const strippedWithLocalNumbers = compressSource(rawSource, language, true);
  const strippedLines = strippedWithLocalNumbers.split(/\r?\n/);
  if (!includeLineNumbers) {
    return strippedLines
      .map((line) => line.replace(/^\d+:\s/, ""))
      .join("\n");
  }
  return strippedLines
    .map((line) => {
      const match = /^(\d+):\s(.*)$/.exec(line);
      if (!match) return line;
      const localLine = Number.parseInt(match[1]!, 10);
      const absoluteLine = lineStart + localLine - 1;
      return `${absoluteLine}: ${match[2]}`;
    })
    .join("\n");
}

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

export function findConstructsInFiles(
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
