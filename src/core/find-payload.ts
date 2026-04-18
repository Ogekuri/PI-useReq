/**
 * @file
 * @brief Builds agent-oriented JSON payloads for `files-find` and `find`.
 * @details Converts construct-search results into deterministic JSON sections ordered for LLM traversal, including request metadata, repository scope, file statuses, structured matches, structured Doxygen fields, typed line ranges, and normalized stripped code lines. Runtime is O(F log F + S + M) where F is file count, S is analyzed source size, and M is matched construct count. Side effects are limited to filesystem reads and optional stderr logging.
 */

import fs from "node:fs";
import path from "node:path";
import {
  LANGUAGE_TAGS,
  parseTagFilter,
  buildStrippedConstructLineEntries,
  type StrippedConstructLineEntry,
} from "./find-constructs.js";
import { detectLanguage } from "./compress.js";
import {
  SourceAnalyzer,
  ElementType,
  SourceElement,
  collectElementDoxygenFields,
  collectFileLevelDoxygenFields,
} from "./source-analyzer.js";
import {
  countDoxygenFieldValues,
  structureDoxygenFields,
  type StructuredDoxygenFields,
} from "./doxygen-parser.js";

/**
 * @brief Enumerates supported find-payload scopes.
 * @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
 */
export type FindToolScope = "explicit-files" | "configured-source-directories";

/**
 * @brief Enumerates supported per-file find-entry statuses.
 * @details Separates matched files, analyzed no-match files, analysis failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
 */
export type FindFileStatus = "matched" | "no_match" | "error" | "skipped";

/**
 * @brief Enumerates request-validation statuses for tag-filter and regex fields.
 * @details Distinguishes validated search inputs from invalid request parameters without requiring stderr parsing. The alias is compile-time only and introduces no runtime cost.
 */
export type FindRequestStatus = "valid" | "invalid";

/**
 * @brief Enumerates rendered line-number modes for find output.
 * @details Distinguishes payloads whose display strings include original source line prefixes from payloads whose display strings contain plain stripped code only. The alias is compile-time only and introduces no runtime cost.
 */
export type FindLineNumberMode = "enabled" | "disabled";

/**
 * @brief Enumerates top-level find execution outcomes.
 * @details Separates successful match delivery from invalid request states and valid no-match searches so agents can branch on one canonical field. The alias is compile-time only and introduces no runtime cost.
 */
export type FindSearchStatus = "matched" | "no_matches" | "invalid_tag_filter" | "invalid_regex";

/**
 * @brief Describes one numeric source line range.
 * @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindLineRange {
  start_line_number: number;
  end_line_number: number;
  line_range: [number, number];
}

/**
 * @brief Describes one structured stripped-code line.
 * @details Preserves output order, original source coordinates, normalized stripped text, and rendered display text so agents can choose between direct-access facts and human-visible rendering without reparsing strings. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindToolCodeLineEntry {
  output_line_number: number;
  source_line_number: number;
  text: string;
  display_text: string;
}

/**
 * @brief Describes one structured matched construct.
 * @details Orders direct-access identity fields before hierarchy, locations, Doxygen metadata, and stripped code so agents can branch without reparsing monolithic markdown. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindToolMatchEntry extends FindLineRange {
  match_index: number;
  declaration_order_index: number;
  symbol_name: string;
  qualified_name: string;
  symbol_kind: string;
  type_label: string;
  signature_text?: string;
  visibility?: string;
  parent_symbol_name?: string;
  parent_qualified_name?: string;
  depth: number;
  inherits_text?: string;
  brief_text?: string;
  doxygen_field_count: number;
  doxygen?: StructuredDoxygenFields;
  code_line_count: number;
  code_lines: FindToolCodeLineEntry[];
  stripped_source_text?: string;
}

/**
 * @brief Describes one per-file find payload entry.
 * @details Stores path identity, file status, supported-tag metadata, line metrics, file-level Doxygen metadata, and matched-construct records while keeping failure facts structured. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindToolFileEntry extends FindLineRange {
  request_index: number;
  input_path: string;
  canonical_path: string;
  absolute_path: string;
  file_name: string;
  file_extension: string;
  language_id?: string;
  language_name?: string;
  status: FindFileStatus;
  exists: boolean;
  is_file: boolean;
  supported_tag_count: number;
  supported_tags: string[];
  line_count: number;
  match_count: number;
  doxygen_field_count: number;
  file_description_text?: string;
  file_doxygen?: StructuredDoxygenFields;
  matches: FindToolMatchEntry[];
  error_reason?: string;
  error_message?: string;
}

/**
 * @brief Describes the request section of the find payload.
 * @details Captures tool identity, scope, base directory, line-number mode, tag filter, regex, validation statuses, and requested path inventory so agents can reason about how the search was executed. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindToolRequestSection {
  tool_name: string;
  scope: FindToolScope;
  base_dir_path: string;
  line_number_mode: FindLineNumberMode;
  tag_filter_text: string;
  tag_filter_values: string[];
  tag_filter_status: FindRequestStatus;
  tag_filter_error_message?: string;
  name_regex_text: string;
  regex_engine: string;
  regex_status: FindRequestStatus;
  regex_error_message?: string;
  source_directory_count: number;
  source_directory_paths: string[];
  requested_file_count: number;
  requested_input_paths: string[];
  requested_canonical_paths: string[];
}

/**
 * @brief Describes the summary section of the find payload.
 * @details Exposes aggregate file, match, line, and Doxygen counts as numeric fields plus one stable search-status discriminator. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindToolSummarySection {
  search_status: FindSearchStatus;
  processable_file_count: number;
  matched_file_count: number;
  no_match_file_count: number;
  error_file_count: number;
  skipped_file_count: number;
  total_match_count: number;
  total_code_line_count: number;
  total_doxygen_field_count: number;
}

/**
 * @brief Describes the repository section of the find payload.
 * @details Stores the base path, configured source-directory scope, canonical file list, and supported-tag matrix needed to specialize later searches without rereading tool descriptions. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindToolRepositorySection {
  root_directory_path: string;
  source_directory_paths: string[];
  file_count: number;
  file_canonical_paths: string[];
  supported_tags_by_language: Record<string, string[]>;
}

/**
 * @brief Describes the full agent-oriented find payload.
 * @details Orders the top-level sections as request, summary, repository, and files so execution metadata can be appended deterministically by the tool wrapper. The interface is compile-time only and introduces no runtime cost.
 */
export interface FindToolPayload {
  request: FindToolRequestSection;
  summary: FindToolSummarySection;
  repository: FindToolRepositorySection;
  files: FindToolFileEntry[];
}

/**
 * @brief Describes the options required to build one find payload.
 * @details Supplies tool identity, scope, base directory, tag filter, regex, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.
 */
export interface BuildFindToolPayloadOptions {
  toolName: string;
  scope: FindToolScope;
  baseDir: string;
  tagFilter: string;
  pattern: string;
  requestedPaths: string[];
  includeLineNumbers: boolean;
  sourceDirectoryPaths?: string[];
  verbose?: boolean;
}

/**
 * @brief Describes the result of validating one regex pattern.
 * @details Separates valid compiled regex instances from invalid user input while preserving a stable machine-readable status and error message. The interface is compile-time only and introduces no runtime cost.
 */
interface ValidatedRegex {
  status: FindRequestStatus;
  regex?: RegExp;
  errorMessage?: string;
}

/**
 * @brief Describes the result of validating one tag filter.
 * @details Separates normalized tag values from invalid or empty filters while preserving a stable status and error message. The interface is compile-time only and introduces no runtime cost.
 */
interface ValidatedTagFilter {
  status: FindRequestStatus;
  tagValues: string[];
  tagSet: Set<string>;
  errorMessage?: string;
}

/**
 * @brief Canonicalizes one filesystem path relative to the payload base directory.
 * @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
 * @param[in] targetPath {string} Absolute or relative filesystem path.
 * @param[in] baseDir {string} Base directory used for relative canonicalization.
 * @return {string} Canonicalized path string.
 */
function canonicalizeFindPath(targetPath: string, baseDir: string): string {
  const absolutePath = path.resolve(targetPath);
  const absoluteBaseDir = path.resolve(baseDir);
  const relativePath = path.relative(absoluteBaseDir, absolutePath).split(path.sep).join("/");
  if (relativePath !== "" && relativePath !== "." && !relativePath.startsWith("../") && relativePath !== "..") {
    return relativePath;
  }
  return absolutePath.split(path.sep).join("/");
}

/**
 * @brief Builds one structured line-range record.
 * @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
 * @param[in] startLineNumber {number} Inclusive start line number.
 * @param[in] endLineNumber {number} Inclusive end line number.
 * @return {FindLineRange} Structured line-range record.
 */
function buildLineRange(startLineNumber: number, endLineNumber: number): FindLineRange {
  return {
    start_line_number: startLineNumber,
    end_line_number: endLineNumber,
    line_range: [startLineNumber, endLineNumber],
  };
}

/**
 * @brief Returns the supported-tag matrix ordered for deterministic JSON emission.
 * @details Sorts languages alphabetically and tag arrays lexicographically so downstream agents can reuse the matrix without reparsing human prose. Runtime is O(l * t log t). No side effects occur.
 * @return {Record<string, string[]>} Supported tags keyed by canonical language identifier.
 */
function buildSupportedTagsByLanguage(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(LANGUAGE_TAGS)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([language, tagSet]) => [language, [...tagSet].sort()]),
  );
}

/**
 * @brief Resolves one stable symbol name from an analyzed element.
 * @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every matched construct retains a direct-access identifier. Runtime is O(1). No side effects occur.
 * @param[in] element {SourceElement} Source element.
 * @return {string} Stable symbol name.
 */
function resolveSymbolName(element: SourceElement): string {
  return element.name ?? element.signature ?? ((element.extract.split("\n")[0] ?? "").trim() || "?");
}

/**
 * @brief Resolves the direct parent definition for one source element.
 * @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
 * @param[in] definitions {SourceElement[]} Sorted definition elements.
 * @param[in] element {SourceElement} Candidate child element.
 * @return {SourceElement | undefined} Matched parent definition when available.
 */
function resolveParentElement(definitions: SourceElement[], element: SourceElement): SourceElement | undefined {
  if (!element.parentName) {
    return undefined;
  }
  return definitions
    .filter(
      (candidate) => candidate.name === element.parentName && candidate.lineStart <= element.lineStart && candidate.lineEnd >= element.lineEnd,
    )
    .sort((left, right) => right.depth - left.depth || right.lineStart - left.lineStart)[0];
}

/**
 * @brief Converts stripped-code line entries into the payload line-entry contract.
 * @details Performs a shallow field copy so the payload remains decoupled from the lower-level strip helper type. Runtime is O(n) in stripped line count. No side effects occur.
 * @param[in] lineEntries {StrippedConstructLineEntry[]} Normalized stripped-code line entries.
 * @return {FindToolCodeLineEntry[]} Payload line entries.
 */
function mapCodeLines(lineEntries: StrippedConstructLineEntry[]): FindToolCodeLineEntry[] {
  return lineEntries.map((entry) => ({
    output_line_number: entry.output_line_number,
    source_line_number: entry.source_line_number,
    text: entry.text,
    display_text: entry.display_text,
  } satisfies FindToolCodeLineEntry));
}

/**
 * @brief Joins stripped-code line entries into one optional monolithic text field.
 * @details Preserves rendered display strings in line order so agents that need a contiguous excerpt can read one field without losing access to the structured line array. Runtime is O(n) in stripped line count. No side effects occur.
 * @param[in] lineEntries {FindToolCodeLineEntry[]} Structured stripped-code line entries.
 * @return {string | undefined} Joined stripped-source text, or `undefined` when no lines remain.
 */
function buildStrippedSourceText(lineEntries: FindToolCodeLineEntry[]): string | undefined {
  if (lineEntries.length === 0) {
    return undefined;
  }
  return lineEntries.map((entry) => entry.display_text).join("\n");
}

/**
 * @brief Validates and normalizes one tag filter.
 * @details Parses the raw pipe-delimited filter, sorts the resulting unique tag values, and marks the filter invalid when no recognized tag remains after normalization. Runtime is O(n log n) in requested tag count. No side effects occur.
 * @param[in] tagFilter {string} Raw pipe-delimited tag filter.
 * @return {ValidatedTagFilter} Validation result containing the normalized tag set and status.
 */
function validateTagFilter(tagFilter: string): ValidatedTagFilter {
  const tagSet = parseTagFilter(tagFilter);
  const tagValues = [...tagSet].sort();
  if (tagValues.length === 0) {
    return {
      status: "invalid",
      tagValues,
      tagSet,
      errorMessage: "no valid tags specified",
    };
  }
  return {
    status: "valid",
    tagValues,
    tagSet,
  };
}

/**
 * @brief Validates and compiles one construct-name regex pattern.
 * @details Uses the JavaScript `RegExp` engine with search-style `.test(...)` evaluation and records a stable error message when compilation fails. Runtime is O(n) in pattern length. No side effects occur.
 * @param[in] pattern {string} Raw user pattern.
 * @return {ValidatedRegex} Validation result containing the compiled regex when valid.
 */
function validateRegexPattern(pattern: string): ValidatedRegex {
  try {
    return {
      status: "valid",
      regex: new RegExp(pattern),
    };
  } catch (error) {
    return {
      status: "invalid",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @brief Tests whether one element matches a validated tag filter and regex.
 * @details Rejects unnamed elements and elements outside the requested tag set before applying the precompiled regex to the construct name. Runtime is O(1) plus regex evaluation. No side effects occur.
 * @param[in] element {SourceElement} Candidate source element.
 * @param[in] tagSet {Set<string>} Normalized requested tag set.
 * @param[in] regex {RegExp} Precompiled construct-name regex.
 * @return {boolean} `true` when the element matches both filters.
 */
function elementMatches(element: SourceElement, tagSet: Set<string>, regex: RegExp): boolean {
  if (!tagSet.has(element.typeLabel)) {
    return false;
  }
  if (!element.name) {
    return false;
  }
  return regex.test(element.name);
}

/**
 * @brief Counts logical source lines from one file content string.
 * @details Preserves the repository's line-count convention that excludes the terminal empty split produced by trailing newlines. Runtime is O(n) in content length. No side effects occur.
 * @param[in] fileContent {string} Raw file content.
 * @return {number} Logical source-line count.
 */
function countLogicalLines(fileContent: string): number {
  if (fileContent === "") {
    return 0;
  }
  return fileContent.split(/\r?\n/).length - (fileContent.endsWith("\n") ? 1 : 0);
}

/**
 * @brief Builds one skipped file entry for a request path.
 * @details Preserves path identity, filesystem status, language metadata when detectable, supported tags for the language, and a stable skip reason without attempting search analysis. Runtime is O(t) in supported-tag count. No side effects occur.
 * @param[in] inputPath {string} Caller-supplied path.
 * @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
 * @param[in] requestIndex {number} Caller-order index.
 * @param[in] baseDir {string} Base directory used for canonical path derivation.
 * @param[in] errorReason {string} Stable skip reason identifier.
 * @param[in] errorMessage {string} Human-readable skip reason.
 * @param[in] exists {boolean} Filesystem existence flag.
 * @param[in] isFile {boolean} Filesystem file-kind flag.
 * @return {FindToolFileEntry} Structured skipped file entry.
 */
function buildSkippedFileEntry(
  inputPath: string,
  absolutePath: string,
  requestIndex: number,
  baseDir: string,
  errorReason: string,
  errorMessage: string,
  exists: boolean,
  isFile: boolean,
): FindToolFileEntry {
  const canonicalPath = canonicalizeFindPath(absolutePath, baseDir);
  const fileExtension = path.extname(absolutePath).toLowerCase();
  const languageId = detectLanguage(absolutePath);
  const supportedTags = languageId ? [...(LANGUAGE_TAGS[languageId] ?? [])].sort() : [];
  return {
    ...buildLineRange(0, 0),
    request_index: requestIndex,
    input_path: inputPath,
    canonical_path: canonicalPath,
    absolute_path: absolutePath,
    file_name: path.basename(absolutePath),
    file_extension: fileExtension,
    language_id: languageId,
    status: "skipped",
    exists,
    is_file: isFile,
    supported_tag_count: supportedTags.length,
    supported_tags: supportedTags,
    line_count: 0,
    match_count: 0,
    doxygen_field_count: 0,
    matches: [],
    error_reason: errorReason,
    error_message: errorMessage,
  };
}

/**
 * @brief Builds one matched construct entry from an analyzed element.
 * @details Resolves symbol identity, hierarchy hints, structured Doxygen fields, numeric declaration lines, and stripped code excerpts while keeping monolithic source text optional. Runtime is O(n) in construct span length plus Doxygen size. No side effects occur.
 * @param[in] element {SourceElement} Matched element.
 * @param[in] matchIndex {number} Match index within the file.
 * @param[in] definitions {SourceElement[]} Sorted definition elements used for parent resolution.
 * @param[in] qualifiedNameByLineStart {Map<number, string>} Precomputed qualified-name map for definitions.
 * @param[in] sourceLines {string[]} Full file content split into line-preserving entries.
 * @param[in] languageId {string} Canonical language identifier.
 * @param[in] includeLineNumbers {boolean} When `true`, rendered display strings include absolute source line prefixes.
 * @return {FindToolMatchEntry} Structured match entry.
 */
function buildMatchEntry(
  element: SourceElement,
  matchIndex: number,
  definitions: SourceElement[],
  qualifiedNameByLineStart: Map<number, string>,
  sourceLines: string[],
  languageId: string,
  includeLineNumbers: boolean,
): FindToolMatchEntry {
  const symbolName = resolveSymbolName(element);
  const parentElement = resolveParentElement(definitions, element);
  const parentSymbolName = parentElement ? resolveSymbolName(parentElement) : undefined;
  const parentQualifiedName = parentElement ? qualifiedNameByLineStart.get(parentElement.lineStart) : undefined;
  const qualifiedName = qualifiedNameByLineStart.get(element.lineStart)
    ?? (parentQualifiedName ? `${parentQualifiedName}.${symbolName}` : symbolName);
  const aggregateDoxygen = collectElementDoxygenFields(element);
  const structuredDoxygen = structureDoxygenFields(aggregateDoxygen);
  const codeLines = sourceLines.slice(element.lineStart - 1, element.lineEnd);
  const strippedCodeLines = mapCodeLines(
    buildStrippedConstructLineEntries(codeLines, languageId, element.lineStart, includeLineNumbers),
  );

  return {
    ...buildLineRange(element.lineStart, element.lineEnd),
    match_index: matchIndex,
    declaration_order_index: matchIndex,
    symbol_name: symbolName,
    qualified_name: qualifiedName,
    symbol_kind: element.elementType,
    type_label: element.typeLabel,
    signature_text: element.signature,
    visibility: element.visibility,
    parent_symbol_name: parentSymbolName,
    parent_qualified_name: parentQualifiedName,
    depth: element.depth,
    inherits_text: element.inherits,
    brief_text: structuredDoxygen.brief?.[0],
    doxygen_field_count: countDoxygenFieldValues(aggregateDoxygen),
    doxygen: Object.keys(structuredDoxygen).length > 0 ? structuredDoxygen : undefined,
    code_line_count: strippedCodeLines.length,
    code_lines: strippedCodeLines,
    stripped_source_text: buildStrippedSourceText(strippedCodeLines),
  };
}

/**
 * @brief Analyzes one path into a structured find file entry.
 * @details Resolves path identity, validates language and tag support, parses the file with `SourceAnalyzer`, builds structured match entries, and preserves stable status facts for no-match or failure outcomes. Runtime is dominated by file I/O and analyzer cost. Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
 * @param[in] inputPath {string} Caller-supplied path.
 * @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
 * @param[in] requestIndex {number} Caller-order index.
 * @param[in] baseDir {string} Base directory used for canonical path derivation.
 * @param[in] tagSet {Set<string>} Validated requested tag set.
 * @param[in] regex {RegExp} Validated construct-name regex.
 * @param[in] includeLineNumbers {boolean} When `true`, rendered stripped-source text includes original line prefixes.
 * @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
 * @return {FindToolFileEntry} Structured file entry.
 */
function analyzeFindFile(
  analyzer: SourceAnalyzer,
  inputPath: string,
  absolutePath: string,
  requestIndex: number,
  baseDir: string,
  tagSet: Set<string>,
  regex: RegExp,
  includeLineNumbers: boolean,
  verbose: boolean,
): FindToolFileEntry {
  const canonicalPath = canonicalizeFindPath(absolutePath, baseDir);
  const fileName = path.basename(absolutePath);
  const fileExtension = path.extname(absolutePath).toLowerCase();
  const languageId = detectLanguage(absolutePath);
  if (!languageId) {
    if (verbose) {
      console.error(`  SKIP  ${inputPath} (unsupported extension)`);
    }
    return {
      ...buildLineRange(0, 0),
      request_index: requestIndex,
      input_path: inputPath,
      canonical_path: canonicalPath,
      absolute_path: absolutePath,
      file_name: fileName,
      file_extension: fileExtension,
      status: "skipped",
      exists: true,
      is_file: true,
      supported_tag_count: 0,
      supported_tags: [],
      line_count: 0,
      match_count: 0,
      doxygen_field_count: 0,
      matches: [],
      error_reason: "unsupported_extension",
      error_message: "unsupported extension",
    };
  }

  const supportedTags = [...(LANGUAGE_TAGS[languageId] ?? [])].sort();
  if (![...tagSet].some((tag) => supportedTags.includes(tag))) {
    if (verbose) {
      console.error(`  SKIP  ${inputPath} (language ${languageId} does not support requested tags)`);
    }
    return {
      ...buildLineRange(0, 0),
      request_index: requestIndex,
      input_path: inputPath,
      canonical_path: canonicalPath,
      absolute_path: absolutePath,
      file_name: fileName,
      file_extension: fileExtension,
      language_id: languageId,
      language_name: analyzer.specs[languageId]?.name,
      status: "skipped",
      exists: true,
      is_file: true,
      supported_tag_count: supportedTags.length,
      supported_tags: supportedTags,
      line_count: 0,
      match_count: 0,
      doxygen_field_count: 0,
      matches: [],
      error_reason: "unsupported_tags_for_language",
      error_message: "language does not support any requested tags",
    };
  }

  try {
    const fileContent = fs.readFileSync(absolutePath, "utf8");
    const lineCount = countLogicalLines(fileContent);
    const sourceLines = fileContent.split(/(?<=\n)/);
    const elements = analyzer.analyze(absolutePath, languageId);
    analyzer.enrich(elements, languageId, absolutePath);
    const fileLevelDoxygen = collectFileLevelDoxygenFields(elements);
    const structuredFileDoxygen = structureDoxygenFields(fileLevelDoxygen);
    const definitions = elements
      .filter((element) => ![ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR].includes(element.elementType))
      .sort((left, right) => left.lineStart - right.lineStart);
    const qualifiedNameByLineStart = new Map<number, string>();
    definitions.forEach((element) => {
      const symbolName = resolveSymbolName(element);
      const parentElement = resolveParentElement(definitions, element);
      const parentQualifiedName = parentElement ? qualifiedNameByLineStart.get(parentElement.lineStart) : undefined;
      const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${symbolName}` : symbolName;
      qualifiedNameByLineStart.set(element.lineStart, qualifiedName);
    });

    const matchedElements = elements
      .filter((element) => elementMatches(element, tagSet, regex))
      .sort((left, right) => left.lineStart - right.lineStart || left.lineEnd - right.lineEnd);
    const matches = matchedElements.map((element, matchIndex) => buildMatchEntry(
      element,
      matchIndex,
      definitions,
      qualifiedNameByLineStart,
      sourceLines,
      languageId,
      includeLineNumbers,
    ));
    const fileDoxygenFieldCount = countDoxygenFieldValues(fileLevelDoxygen);
    const matchDoxygenFieldCount = matches.reduce((sum, match) => sum + match.doxygen_field_count, 0);

    if (matches.length > 0) {
      if (verbose) {
        console.error(`  OK    ${absolutePath} (${matches.length} matches)`);
      }
      return {
        ...buildLineRange(lineCount > 0 ? 1 : 0, lineCount),
        request_index: requestIndex,
        input_path: inputPath,
        canonical_path: canonicalPath,
        absolute_path: absolutePath,
        file_name: fileName,
        file_extension: fileExtension,
        language_id: languageId,
        language_name: analyzer.specs[languageId]?.name,
        status: "matched",
        exists: true,
        is_file: true,
        supported_tag_count: supportedTags.length,
        supported_tags: supportedTags,
        line_count: lineCount,
        match_count: matches.length,
        doxygen_field_count: fileDoxygenFieldCount + matchDoxygenFieldCount,
        file_description_text: structuredFileDoxygen.brief?.[0] ?? structuredFileDoxygen.details?.[0],
        file_doxygen: Object.keys(structuredFileDoxygen).length > 0 ? structuredFileDoxygen : undefined,
        matches,
      };
    }

    if (verbose) {
      console.error(`  SKIP  ${absolutePath} (no matches)`);
    }
    return {
      ...buildLineRange(lineCount > 0 ? 1 : 0, lineCount),
      request_index: requestIndex,
      input_path: inputPath,
      canonical_path: canonicalPath,
      absolute_path: absolutePath,
      file_name: fileName,
      file_extension: fileExtension,
      language_id: languageId,
      language_name: analyzer.specs[languageId]?.name,
      status: "no_match",
      exists: true,
      is_file: true,
      supported_tag_count: supportedTags.length,
      supported_tags: supportedTags,
      line_count: lineCount,
      match_count: 0,
      doxygen_field_count: fileDoxygenFieldCount,
      file_description_text: structuredFileDoxygen.brief?.[0] ?? structuredFileDoxygen.details?.[0],
      file_doxygen: Object.keys(structuredFileDoxygen).length > 0 ? structuredFileDoxygen : undefined,
      matches: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (verbose) {
      console.error(`  FAIL  ${absolutePath} (${errorMessage})`);
    }
    return {
      ...buildLineRange(0, 0),
      request_index: requestIndex,
      input_path: inputPath,
      canonical_path: canonicalPath,
      absolute_path: absolutePath,
      file_name: fileName,
      file_extension: fileExtension,
      language_id: languageId,
      language_name: analyzer.specs[languageId]?.name,
      status: "error",
      exists: true,
      is_file: true,
      supported_tag_count: supportedTags.length,
      supported_tags: supportedTags,
      line_count: 0,
      match_count: 0,
      doxygen_field_count: 0,
      matches: [],
      error_reason: "analysis_failed",
      error_message: errorMessage,
    };
  }
}

/**
 * @brief Builds the full agent-oriented find payload.
 * @details Validates request parameters, analyzes requested files in caller order when the request is valid, preserves skipped and no-match outcomes in structured file entries, computes aggregate numeric totals, and emits a structured supported-tag matrix. Runtime is O(F log F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] options {BuildFindToolPayloadOptions} Payload-construction options.
 * @return {FindToolPayload} Structured find payload ordered as request, summary, repository, and files.
 * @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-096, REQ-098
 */
export function buildFindToolPayload(options: BuildFindToolPayloadOptions): FindToolPayload {
  const {
    toolName,
    scope,
    baseDir,
    tagFilter,
    pattern,
    requestedPaths,
    includeLineNumbers,
    sourceDirectoryPaths = [],
    verbose = false,
  } = options;
  const absoluteBaseDir = path.resolve(baseDir);
  const lineNumberMode: FindLineNumberMode = includeLineNumbers ? "enabled" : "disabled";
  const canonicalRequestedPaths = requestedPaths.map((requestedPath) => canonicalizeFindPath(requestedPath, absoluteBaseDir));
  const tagValidation = validateTagFilter(tagFilter);
  const regexValidation = validateRegexPattern(pattern);
  const analyzer = new SourceAnalyzer();

  let files: FindToolFileEntry[] = [];
  let searchStatus: FindSearchStatus = "matched";

  if (tagValidation.status === "invalid") {
    searchStatus = "invalid_tag_filter";
    files = requestedPaths.map((requestedPath, requestIndex) => {
      const absolutePath = path.resolve(absoluteBaseDir, requestedPath);
      const exists = fs.existsSync(absolutePath);
      const isFile = exists && fs.statSync(absolutePath).isFile();
      return buildSkippedFileEntry(
        requestedPath,
        absolutePath,
        requestIndex,
        absoluteBaseDir,
        "invalid_tag_filter",
        tagValidation.errorMessage ?? "invalid tag filter",
        exists,
        isFile,
      );
    });
  } else if (regexValidation.status === "invalid") {
    searchStatus = "invalid_regex";
    files = requestedPaths.map((requestedPath, requestIndex) => {
      const absolutePath = path.resolve(absoluteBaseDir, requestedPath);
      const exists = fs.existsSync(absolutePath);
      const isFile = exists && fs.statSync(absolutePath).isFile();
      return buildSkippedFileEntry(
        requestedPath,
        absolutePath,
        requestIndex,
        absoluteBaseDir,
        "invalid_regex",
        regexValidation.errorMessage ?? "invalid regex",
        exists,
        isFile,
      );
    });
  } else {
    files = requestedPaths.map((requestedPath, requestIndex) => {
      const absolutePath = path.resolve(absoluteBaseDir, requestedPath);
      if (!fs.existsSync(absolutePath)) {
        if (verbose) {
          console.error(`  SKIP  ${requestedPath} (file not found)`);
        }
        return buildSkippedFileEntry(
          requestedPath,
          absolutePath,
          requestIndex,
          absoluteBaseDir,
          "not_found",
          "not found",
          false,
          false,
        );
      }
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        if (verbose) {
          console.error(`  SKIP  ${requestedPath} (not a file)`);
        }
        return buildSkippedFileEntry(
          requestedPath,
          absolutePath,
          requestIndex,
          absoluteBaseDir,
          "not_file",
          "not a file",
          true,
          false,
        );
      }
      return analyzeFindFile(
        analyzer,
        requestedPath,
        absolutePath,
        requestIndex,
        absoluteBaseDir,
        tagValidation.tagSet,
        regexValidation.regex!,
        includeLineNumbers,
        verbose,
      );
    });

    const matchedFileCount = files.filter((file) => file.status === "matched").length;
    if (matchedFileCount === 0) {
      searchStatus = "no_matches";
    }
  }

  const matchedFiles = files.filter((file) => file.status === "matched");
  const processableFiles = files.filter((file) => file.status !== "skipped");
  const repositoryFileCanonicalPaths = files.map((file) => file.canonical_path);

  return {
    request: {
      tool_name: toolName,
      scope,
      base_dir_path: absoluteBaseDir,
      line_number_mode: lineNumberMode,
      tag_filter_text: tagFilter,
      tag_filter_values: tagValidation.tagValues,
      tag_filter_status: tagValidation.status,
      tag_filter_error_message: tagValidation.errorMessage,
      name_regex_text: pattern,
      regex_engine: "javascript-regexp-search",
      regex_status: regexValidation.status,
      regex_error_message: regexValidation.errorMessage,
      source_directory_count: sourceDirectoryPaths.length,
      source_directory_paths: sourceDirectoryPaths.map((sourceDirectoryPath) => canonicalizeFindPath(sourceDirectoryPath, absoluteBaseDir)),
      requested_file_count: requestedPaths.length,
      requested_input_paths: [...requestedPaths],
      requested_canonical_paths: canonicalRequestedPaths,
    },
    summary: {
      search_status: searchStatus,
      processable_file_count: processableFiles.length,
      matched_file_count: matchedFiles.length,
      no_match_file_count: files.filter((file) => file.status === "no_match").length,
      error_file_count: files.filter((file) => file.status === "error").length,
      skipped_file_count: files.filter((file) => file.status === "skipped").length,
      total_match_count: matchedFiles.reduce((sum, file) => sum + file.match_count, 0),
      total_code_line_count: matchedFiles.reduce(
        (sum, file) => sum + file.matches.reduce((fileSum, match) => fileSum + match.code_line_count, 0),
        0,
      ),
      total_doxygen_field_count: files.reduce((sum, file) => sum + file.doxygen_field_count, 0),
    },
    repository: {
      root_directory_path: absoluteBaseDir,
      source_directory_paths: sourceDirectoryPaths.map((sourceDirectoryPath) => canonicalizeFindPath(sourceDirectoryPath, absoluteBaseDir)),
      file_count: repositoryFileCanonicalPaths.length,
      file_canonical_paths: repositoryFileCanonicalPaths,
      supported_tags_by_language: buildSupportedTagsByLanguage(),
    },
    files,
  };
}

/**
 * @brief Builds deterministic stderr diagnostics from a find payload.
 * @details Serializes invalid request states, skipped inputs, no-match files, and analysis failures into stable newline-delimited diagnostics while leaving successful matched files silent. Runtime is O(n) in file-entry count. No side effects occur.
 * @param[in] payload {FindToolPayload} Structured find payload.
 * @return {string} Newline-delimited diagnostics.
 * @satisfies REQ-096
 */
export function buildFindToolExecutionStderr(payload: FindToolPayload): string {
  const diagnostics: string[] = [];
  if (payload.request.tag_filter_status === "invalid") {
    diagnostics.push(`error: tag_filter: ${payload.request.tag_filter_error_message ?? "invalid tag filter"}`);
  }
  if (payload.request.regex_status === "invalid") {
    diagnostics.push(`error: name_regex: ${payload.request.regex_error_message ?? "invalid regex"}`);
  }
  payload.files.forEach((file) => {
    if (file.status === "skipped") {
      diagnostics.push(`skipped: ${file.canonical_path}: ${file.error_reason ?? "skipped"}`);
      return;
    }
    if (file.status === "no_match") {
      diagnostics.push(`info: no_match: ${file.canonical_path}`);
      return;
    }
    if (file.status === "error") {
      diagnostics.push(`error: ${file.canonical_path}: ${file.error_reason ?? "analysis_failed"}: ${file.error_message ?? "unknown error"}`);
    }
  });
  if (payload.summary.search_status === "no_matches") {
    diagnostics.push("info: no constructs found matching the requested tag filter and regex");
  }
  return diagnostics.join("\n");
}
