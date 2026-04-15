/**
 * @file
 * @brief Parses repository-approved Doxygen tags and renders them as markdown bullets.
 * @details Implements a constrained Doxygen grammar used by the source analyzer and construct finder. Parsing cost is linear in comment length. The module is pure and performs no I/O.
 */

/**
 * @brief Defines the ordered repository Doxygen tag taxonomy.
 * @details The array is reused for validation, parsing precedence, and markdown serialization order. Lookup by index is O(1); scans are O(n) in tag count. The list is immutable after module load.
 */
export const DOXYGEN_TAGS = [
  "brief",
  "details",
  "param",
  "param[in]",
  "param[out]",
  "param[in,out]",
  "return",
  "retval",
  "exception",
  "throws",
  "warning",
  "deprecated",
  "note",
  "see",
  "sa",
  "satisfies",
  "pre",
  "post",
] as const;

/**
 * @brief Lists supported tags that are not parameter variants.
 * @details Derived once from `DOXYGEN_TAGS` to simplify regex construction for parsers that need to discriminate `@param` forms from all other tags. Construction complexity is O(n).
 */
const NON_PARAM_TAGS = DOXYGEN_TAGS.filter(
  (tag) => !["param", "param[in]", "param[in,out]", "param[out]"].includes(tag),
);

/**
 * @brief Builds the escaped alternation fragment for non-parameter tags.
 * @details Sorts longer tags first to preserve greedy matching semantics in the main parser regex. Construction complexity is O(n log n) due to sorting. The resulting string is immutable.
 */
const NON_PARAM_TAG_ALTERNATION = [...NON_PARAM_TAGS]
  .sort((a, b) => b.length - a.length)
  .map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/**
 * @brief Matches repository-supported Doxygen tags inside comment text.
 * @details Captures `@param` plus optional direction modifiers separately from all other approved tags so downstream parsing can normalize them into deterministic keys. Regex evaluation is linear in comment size under expected inputs.
 */
const DOXYGEN_TAG_PATTERN = new RegExp(
  String.raw`[@\\](?:(param)(\[[^\]]+\])?|(${NON_PARAM_TAG_ALTERNATION}))`,
  "g",
);

/**
 * @brief Represents parsed Doxygen fields grouped by normalized tag name.
 * @details Each key maps to one or more textual payloads because the same tag may appear multiple times in a single comment. The alias is compile-time only and adds no runtime cost.
 */
export type DoxygenFieldMap = Record<string, string[]>;

/**
 * @brief Parses repository-approved Doxygen fields from one comment block.
 * @details Normalizes line endings, strips comment delimiters, locates supported tags, and accumulates tag payloads in declaration order. Unsupported content is ignored. Runtime is O(n) in comment length. No side effects occur.
 * @param[in] commentText {string} Raw comment text including delimiters.
 * @return {DoxygenFieldMap} Parsed tag payloads keyed by normalized tag name.
 */
export function parseDoxygenComment(commentText: string): DoxygenFieldMap {
  if (!commentText?.trim()) {
    return {};
  }

  const result: DoxygenFieldMap = {};
  const text = stripCommentDelimiters(commentText.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  const matches = [...text.matchAll(DOXYGEN_TAG_PATTERN)];
  if (matches.length === 0) {
    return {};
  }

  matches.forEach((match, index) => {
    const paramTag = match[1];
    const direction = match[2] ?? "";
    const nonParamTag = match[3];
    const normalizedTag = paramTag ? `param${direction}` : nonParamTag;
    if (!normalizedTag) {
      return;
    }

    const startPos = match.index! + match[0].length;
    const endPos = index + 1 < matches.length ? matches[index + 1]!.index! : text.length;
    const content = normalizeWhitespace(text.slice(startPos, endPos).trim());
    if (!content) {
      return;
    }

    result[normalizedTag] ??= [];
    result[normalizedTag].push(content);
  });

  return result;
}

/**
 * @brief Removes language comment delimiters from raw comment text.
 * @details Drops standalone opening and closing markers, strips leading comment prefixes on each line, and preserves semantic payload lines only. Runtime is O(n) in line count. No external state is mutated.
 * @param[in] text {string} Raw comment text.
 * @return {string} Cleaned multi-line payload without delimiter syntax.
 */
export function stripCommentDelimiters(text: string): string {
  const cleanedLines: string[] = [];
  for (const line of text.split("\n")) {
    let stripped = line.trim();
    if (["/**", "/*", "*/", '"""', "'''", "/*!", "///", "//!"].includes(stripped)) {
      continue;
    }
    stripped = stripped.replace(/^[/*#]+\s*/, "");
    stripped = stripped.replace(/^\*\s*/, "");
    stripped = stripped.replace(/^\/\/\/?!?\s*/, "");
    stripped = stripped.replace(/^#+\s*/, "");
    if (stripped) {
      cleanedLines.push(stripped);
    }
  }
  return cleanedLines.join("\n");
}

/**
 * @brief Collapses redundant whitespace while preserving paragraph boundaries.
 * @details Converts repeated spaces to single spaces, trims each line, and reduces multiple blank lines to one blank separator. Runtime is O(n) in text length. No side effects occur.
 * @param[in] text {string} Input text to normalize.
 * @return {string} Canonically spaced text.
 */
export function normalizeWhitespace(text: string): string {
  const lines = text.replace(/ +/g, " ").split("\n").map((line) => line.trim());
  const normalized: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    if (!line) {
      if (!prevBlank) {
        normalized.push(line);
      }
      prevBlank = true;
    } else {
      normalized.push(line);
      prevBlank = false;
    }
  }
  return normalized.join("\n").trim();
}

/**
 * @brief Serializes parsed Doxygen fields into markdown bullet lines.
 * @details Iterates over `DOXYGEN_TAGS` in canonical order and emits one `- @tag value` line for every stored payload. Runtime is O(t + v) where t is tag count and v is total values. No side effects occur.
 * @param[in] doxygenFields {DoxygenFieldMap} Parsed Doxygen field map.
 * @return {string[]} Ordered markdown bullet lines.
 */
export function formatDoxygenFieldsAsMarkdown(doxygenFields: DoxygenFieldMap): string[] {
  const lines: string[] = [];
  for (const tag of DOXYGEN_TAGS) {
    const values = doxygenFields[tag] ?? [];
    for (const value of values) {
      lines.push(`- @${tag} ${value}`);
    }
  }
  return lines;
}
