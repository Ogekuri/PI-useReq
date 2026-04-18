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
 * @brief Enumerates supported structured parameter directions.
 * @details Normalizes `@param` direction modifiers into one small closed set so agents can branch on parameter flow without reparsing raw tag names. The alias is compile-time only and introduces no runtime cost.
 */
export type StructuredDoxygenParamDirection = "in" | "out" | "in,out" | "unspecified";

/**
 * @brief Describes one structured Doxygen parameter field.
 * @details Separates parameter direction, optional parameter name, optional declared type, and residual text so agents can access argument contracts without reparsing monolithic tag strings. The interface is compile-time only and introduces no runtime cost.
 */
export interface StructuredDoxygenParameterEntry {
  direction: StructuredDoxygenParamDirection;
  parameter_name?: string;
  value_type?: string;
  description?: string;
  text?: string;
}

/**
 * @brief Describes the structured Doxygen field contract used by LLM-oriented JSON payloads.
 * @details Converts repeated raw tag strings into tag-specific arrays and specialized parameter records while keeping unsplittable residual text local to the affected field. The interface is compile-time only and introduces no runtime cost.
 */
export interface StructuredDoxygenFields {
  brief?: string[];
  details?: string[];
  params?: StructuredDoxygenParameterEntry[];
  returns?: string[];
  retvals?: string[];
  exceptions?: string[];
  throws?: string[];
  warnings?: string[];
  deprecated?: string[];
  notes?: string[];
  see_also?: string[];
  satisfies_requirement_ids?: string[];
  preconditions?: string[];
  postconditions?: string[];
}

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

/**
 * @brief Counts the total number of parsed Doxygen field values.
 * @details Sums the value-array lengths across all tags so payload builders can expose aggregate Doxygen density as a numeric fact. Runtime is O(t) in tag count. No side effects occur.
 * @param[in] doxygenFields {DoxygenFieldMap} Parsed Doxygen fields.
 * @return {number} Total stored Doxygen value count.
 */
export function countDoxygenFieldValues(doxygenFields: DoxygenFieldMap): number {
  return Object.values(doxygenFields).reduce((sum, values) => sum + values.length, 0);
}

/**
 * @brief Parses one raw Doxygen parameter value into structured fields.
 * @details Supports the repository-preferred `name {type} description` form, the alternate `{type} name description` form, and a residual-text fallback when no safe split is possible. Runtime is O(n) in value length. No side effects occur.
 * @param[in] value {string} Raw Doxygen parameter value.
 * @param[in] direction {StructuredDoxygenParamDirection} Normalized parameter direction.
 * @return {StructuredDoxygenParameterEntry} Structured parameter record.
 */
function structureDoxygenParameterValue(value: string, direction: StructuredDoxygenParamDirection): StructuredDoxygenParameterEntry {
  const trimmed = value.trim();
  const preferredMatch = trimmed.match(/^([^\s{}]+)(?:\s+\{([^}]+)\})?(?:\s+(.+))?$/);
  if (preferredMatch) {
    const [, parameterName, valueType, description] = preferredMatch;
    if (parameterName) {
      return {
        direction,
        parameter_name: parameterName,
        value_type: valueType,
        description: description?.trim() || undefined,
      };
    }
  }

  const alternateMatch = trimmed.match(/^\{([^}]+)\}\s+([^\s{}]+)(?:\s+(.+))?$/);
  if (alternateMatch) {
    const [, valueType, parameterName, description] = alternateMatch;
    return {
      direction,
      parameter_name: parameterName,
      value_type: valueType,
      description: description?.trim() || undefined,
    };
  }

  return {
    direction,
    text: trimmed,
  };
}

/**
 * @brief Splits comma-delimited Doxygen value strings into normalized items.
 * @details Trims surrounding whitespace, drops empty segments, and preserves original declaration order. Runtime is O(n) in aggregate text length. No side effects occur.
 * @param[in] values {string[] | undefined} Raw Doxygen value strings.
 * @return {string[]} Normalized item list.
 */
function splitCommaSeparatedDoxygenValues(values: string[] | undefined): string[] {
  return (values ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * @brief Extracts normalized requirement IDs from raw `@satisfies` values.
 * @details Matches repository requirement ID prefixes directly from the raw value text so agents receive requirement links as a dedicated string array. Runtime is O(n) in aggregate text length. No side effects occur.
 * @param[in] values {string[] | undefined} Raw `@satisfies` values.
 * @return {string[]} Normalized requirement IDs in declaration order.
 */
function extractSatisfiedRequirementIds(values: string[] | undefined): string[] {
  const matches = (values ?? []).flatMap((value) => value.match(/\b(?:PRJ|CTN|DES|REQ|TST)-\d+\b/g) ?? []);
  return [...new Set(matches)];
}

/**
 * @brief Converts raw parsed Doxygen fields into the structured JSON contract.
 * @details Reorders raw tags into tag-specific arrays, structures parameter fields, normalizes `@see` aliases, and extracts requirement IDs from `@satisfies`. Runtime is O(t + v) where t is tag count and v is total value count. No side effects occur.
 * @param[in] doxygenFields {DoxygenFieldMap} Raw parsed Doxygen field map.
 * @return {StructuredDoxygenFields} Structured Doxygen fields.
 * @satisfies REQ-078
 */
export function structureDoxygenFields(doxygenFields: DoxygenFieldMap): StructuredDoxygenFields {
  const params = [
    ...(doxygenFields["param"] ?? []).map((value) => structureDoxygenParameterValue(value, "unspecified")),
    ...(doxygenFields["param[in]"] ?? []).map((value) => structureDoxygenParameterValue(value, "in")),
    ...(doxygenFields["param[out]"] ?? []).map((value) => structureDoxygenParameterValue(value, "out")),
    ...(doxygenFields["param[in,out]"] ?? []).map((value) => structureDoxygenParameterValue(value, "in,out")),
  ];
  const seeAlso = [
    ...splitCommaSeparatedDoxygenValues(doxygenFields["see"]),
    ...splitCommaSeparatedDoxygenValues(doxygenFields["sa"]),
  ];
  const satisfiesRequirementIds = extractSatisfiedRequirementIds(doxygenFields["satisfies"]);
  const structured: StructuredDoxygenFields = {};

  if (doxygenFields["brief"]?.length) structured.brief = [...doxygenFields["brief"]];
  if (doxygenFields["details"]?.length) structured.details = [...doxygenFields["details"]];
  if (params.length) structured.params = params;
  if (doxygenFields["return"]?.length) structured.returns = [...doxygenFields["return"]];
  if (doxygenFields["retval"]?.length) structured.retvals = [...doxygenFields["retval"]];
  if (doxygenFields["exception"]?.length) structured.exceptions = [...doxygenFields["exception"]];
  if (doxygenFields["throws"]?.length) structured.throws = [...doxygenFields["throws"]];
  if (doxygenFields["warning"]?.length) structured.warnings = [...doxygenFields["warning"]];
  if (doxygenFields["deprecated"]?.length) structured.deprecated = [...doxygenFields["deprecated"]];
  if (doxygenFields["note"]?.length) structured.notes = [...doxygenFields["note"]];
  if (seeAlso.length) structured.see_also = seeAlso;
  if (satisfiesRequirementIds.length) structured.satisfies_requirement_ids = satisfiesRequirementIds;
  if (doxygenFields["pre"]?.length) structured.preconditions = [...doxygenFields["pre"]];
  if (doxygenFields["post"]?.length) structured.postconditions = [...doxygenFields["post"]];
  return structured;
}
