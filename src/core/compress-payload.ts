/**
 * @file
 * @brief Builds agent-oriented JSON payloads for `files-compress` and `compress`.
 * @details Converts compression results into deterministic JSON sections ordered for LLM traversal, including request metadata, repository scope, structured file metrics, structured compressed lines, symbols, and Doxygen fields. Runtime is O(F log F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ElementType,
  SourceAnalyzer,
  type SourceElement,
  collectElementDoxygenFields,
  collectFileLevelDoxygenFields,
} from "./source-analyzer.js";
import { compressFileDetailed, detectLanguage, type CompressedLineEntry } from "./compress.js";
import {
  countDoxygenFieldValues,
  structureDoxygenFields,
  type StructuredDoxygenFields,
} from "./doxygen-parser.js";

/**
 * @brief Enumerates supported compression-payload scopes.
 * @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
 */
export type CompressToolScope = "explicit-files" | "configured-source-directories";

/**
 * @brief Enumerates supported per-file compression statuses.
 * @details Separates compressed files, hard failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
 */
export type CompressFileStatus = "compressed" | "error" | "skipped";

/**
 * @brief Enumerates the rendered line-number mode for compression output.
 * @details Distinguishes payloads whose display strings include original source line numbers from payloads whose display strings contain plain compressed text only. The alias is compile-time only and introduces no runtime cost.
 */
export type CompressLineNumberMode = "enabled" | "disabled";

/**
 * @brief Enumerates structured symbol-analysis statuses for compressed files.
 * @details Separates successful symbol extraction from supplementary analysis failures so compression can still succeed when analyzer enrichment is unavailable. The alias is compile-time only and introduces no runtime cost.
 */
export type CompressSymbolAnalysisStatus = "analyzed" | "error" | "not_attempted";

/**
 * @brief Describes one numeric line range.
 * @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressLineRange {
  start_line_number: number;
  end_line_number: number;
  line_range: [number, number];
}

/**
 * @brief Describes one structured compressed line entry in the tool payload.
 * @details Preserves output order, original source coordinates, raw compressed text, and rendered display text so agents can choose between normalized data and user-facing rendering without reparsing strings. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressToolLineEntry {
  compressed_line_number: number;
  source_line_number: number;
  text: string;
  display_text: string;
}

/**
 * @brief Describes one structured symbol record inside the compression payload.
 * @details Orders direct-access identity fields before hierarchy, locations, and Doxygen metadata so agents can branch without reparsing compressed source text. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressToolSymbolEntry extends CompressLineRange {
  declaration_order_index: number;
  canonical_path: string;
  symbol_name: string;
  qualified_name: string;
  symbol_kind: string;
  type_label: string;
  signature_text?: string;
  parent_symbol_name?: string;
  parent_qualified_name?: string;
  child_symbol_names: string[];
  child_qualified_names: string[];
  depth: number;
  brief_text?: string;
  doxygen?: StructuredDoxygenFields;
}

/**
 * @brief Describes one per-file compression payload entry.
 * @details Stores canonical identity, compression metrics, optional file-level and symbol-level metadata, structured compressed lines, and stable failure facts. Derivable identity fields and duplicate monolithic compressed text are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressToolFileEntry extends CompressLineRange {
  canonical_path: string;
  status: CompressFileStatus;
  source_line_count: number;
  compressed_line_count: number;
  removed_line_count: number;
  symbol_analysis_status: CompressSymbolAnalysisStatus;
  symbol_count: number;
  doxygen_field_count: number;
  file_doxygen?: StructuredDoxygenFields;
  symbols: CompressToolSymbolEntry[];
  compressed_lines: CompressToolLineEntry[];
  error_reason?: string;
  error_message?: string;
  symbol_analysis_error_message?: string;
}

/**
 * @brief Describes the request section of the compression payload.
 * @details Captures tool identity, scope, base directory, line-number mode, requested inputs, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressToolRequestSection {
  tool_name: string;
  scope: CompressToolScope;
  base_dir_path: string;
  line_number_mode: CompressLineNumberMode;
  source_directory_count: number;
  source_directory_paths: string[];
  requested_file_count: number;
  requested_input_paths: string[];
  requested_canonical_paths: string[];
}

/**
 * @brief Describes the summary section of the compression payload.
 * @details Exposes aggregate file, line, symbol, and Doxygen counts as numeric fields with explicit unit names so agents can branch on totals without reparsing display strings. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressToolSummarySection {
  processable_file_count: number;
  compressed_file_count: number;
  error_file_count: number;
  skipped_file_count: number;
  symbol_analysis_error_count: number;
  total_source_line_count: number;
  total_compressed_line_count: number;
  total_removed_line_count: number;
  total_symbol_count: number;
  total_doxygen_field_count: number;
}

/**
 * @brief Describes the repository section of the compression payload.
 * @details Stores configured source-directory scope and the canonical file list used during compression. Static root-path echoes are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressToolRepositorySection {
  source_directory_paths: string[];
  file_canonical_paths: string[];
}

/**
 * @brief Describes the full agent-oriented compression payload.
 * @details Exposes only aggregate compression totals, repository scope, and per-file compression records, omitting request echoes that are already known to the caller or encoded in tool registration metadata. The interface is compile-time only and introduces no runtime cost.
 */
export interface CompressToolPayload {
  summary: CompressToolSummarySection;
  repository: CompressToolRepositorySection;
  files: CompressToolFileEntry[];
}

/**
 * @brief Describes the options required to build one compression payload.
 * @details Supplies tool identity, scope, base directory, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.
 */
export interface BuildCompressToolPayloadOptions {
  toolName: string;
  scope: CompressToolScope;
  baseDir: string;
  requestedPaths: string[];
  includeLineNumbers: boolean;
  sourceDirectoryPaths?: string[];
  verbose?: boolean;
}

/**
 * @brief Canonicalizes one filesystem path relative to the payload base directory.
 * @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
 * @param[in] targetPath {string} Absolute or relative filesystem path.
 * @param[in] baseDir {string} Base directory used for relative canonicalization.
 * @return {string} Canonicalized path string.
 */
function canonicalizeCompressionPath(targetPath: string, baseDir: string): string {
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
 * @return {CompressLineRange} Structured line-range record.
 */
function buildLineRange(startLineNumber: number, endLineNumber: number): CompressLineRange {
  return {
    start_line_number: startLineNumber,
    end_line_number: endLineNumber,
    line_range: [startLineNumber, endLineNumber],
  };
}

/**
 * @brief Resolves one stable symbol name from an analyzed element.
 * @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every symbol retains a direct-access identifier. Runtime is O(1). No side effects occur.
 * @param[in] element {SourceElement} Source element.
 * @return {string} Stable symbol name.
 */
function resolveSymbolName(element: SourceElement): string {
  return element.name ?? element.signature ?? ((element.extract.split("\n")[0] ?? "").trim() || "?");
}

/**
 * @brief Resolves the direct parent element for one child symbol.
 * @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
 * @param[in] definitions {SourceElement[]} Sorted definition elements.
 * @param[in] child {SourceElement} Candidate child symbol.
 * @return {SourceElement | undefined} Matched parent definition when available.
 */
function resolveParentElement(definitions: SourceElement[], child: SourceElement): SourceElement | undefined {
  if (!child.parentName) {
    return undefined;
  }
  return definitions
    .filter(
      (candidate) => candidate.name === child.parentName && candidate.lineStart <= child.lineStart && candidate.lineEnd >= child.lineEnd,
    )
    .sort((left, right) => right.depth - left.depth || right.lineStart - left.lineStart)[0];
}

/**
 * @brief Maps structured compression lines into the payload line-entry contract.
 * @details Performs a shallow field copy so the payload remains decoupled from the core compression result type. Runtime is O(n) in compressed line count. No side effects occur.
 * @param[in] compressedLines {CompressedLineEntry[]} Structured compression lines.
 * @return {CompressToolLineEntry[]} Payload line entries.
 */
function mapCompressedLines(compressedLines: CompressedLineEntry[]): CompressToolLineEntry[] {
  return compressedLines.map((entry) => ({
    compressed_line_number: entry.compressed_line_number,
    source_line_number: entry.source_line_number,
    text: entry.text,
    display_text: entry.display_text,
  } satisfies CompressToolLineEntry));
}

/**
 * @brief Builds structured symbol entries for one successfully analyzed file.
 * @details Extracts definition elements, computes parent-child relationships, attaches structured Doxygen metadata, and repeats the canonical file path inside each symbol record for direct-access agent indexing. Runtime is O(n log n) in definition count. No side effects occur.
 * @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
 * @param[in] absolutePath {string} Absolute file path.
 * @param[in] canonicalPath {string} Canonical path emitted in the payload.
 * @param[in] languageId {string} Canonical language identifier.
 * @return {{ languageName: string | undefined; symbols: CompressToolSymbolEntry[]; fileDoxygen: StructuredDoxygenFields | undefined; fileDescriptionText: string | undefined; doxygenFieldCount: number }} Structured symbol-analysis result.
 * @throws {Error} Throws when source analysis or enrichment fails.
 */
function analyzeCompressedFileSymbols(
  analyzer: SourceAnalyzer,
  absolutePath: string,
  canonicalPath: string,
  languageId: string,
): {
  languageName: string | undefined;
  symbols: CompressToolSymbolEntry[];
  fileDoxygen: StructuredDoxygenFields | undefined;
  fileDescriptionText: string | undefined;
  doxygenFieldCount: number;
} {
  const elements = analyzer.analyze(absolutePath, languageId);
  analyzer.enrich(elements, languageId, absolutePath);
  const languageSpec = analyzer.specs[languageId.toLowerCase().trim().replace(/^\./, "")];
  const fileLevelDoxygen = collectFileLevelDoxygenFields(elements);
  const structuredFileDoxygen = structureDoxygenFields(fileLevelDoxygen);
  const definitions = elements
    .filter((element) => ![ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR].includes(element.elementType))
    .sort((left, right) => left.lineStart - right.lineStart);
  const parentByLineStart = new Map<number, SourceElement | undefined>();
  definitions.forEach((element) => parentByLineStart.set(element.lineStart, resolveParentElement(definitions, element)));
  const qualifiedNameByLineStart = new Map<number, string>();

  const symbols = definitions.map((element, index) => {
    const symbolName = resolveSymbolName(element);
    const parentElement = parentByLineStart.get(element.lineStart);
    const parentSymbolName = parentElement ? resolveSymbolName(parentElement) : undefined;
    const parentQualifiedName = parentElement ? qualifiedNameByLineStart.get(parentElement.lineStart) : undefined;
    const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${symbolName}` : symbolName;
    qualifiedNameByLineStart.set(element.lineStart, qualifiedName);

    const aggregateDoxygen = collectElementDoxygenFields(element);
    const structuredDoxygen = structureDoxygenFields(aggregateDoxygen);

    return {
      ...buildLineRange(element.lineStart, element.lineEnd),
      declaration_order_index: index,
      canonical_path: canonicalPath,
      symbol_name: symbolName,
      qualified_name: qualifiedName,
      symbol_kind: element.elementType,
      type_label: element.typeLabel,
      signature_text: element.signature,
      parent_symbol_name: parentSymbolName,
      parent_qualified_name: parentQualifiedName,
      child_symbol_names: [] as string[],
      child_qualified_names: [] as string[],
      depth: element.depth,
      brief_text: structuredDoxygen.brief?.[0],
      doxygen: Object.keys(structuredDoxygen).length > 0 ? structuredDoxygen : undefined,
    } satisfies CompressToolSymbolEntry;
  });

  const childrenByParentQualifiedName = new Map<string, CompressToolSymbolEntry[]>();
  symbols.forEach((symbol) => {
    if (!symbol.parent_qualified_name) {
      return;
    }
    const children = childrenByParentQualifiedName.get(symbol.parent_qualified_name) ?? [];
    children.push(symbol);
    childrenByParentQualifiedName.set(symbol.parent_qualified_name, children);
  });
  symbols.forEach((symbol) => {
    const children = (childrenByParentQualifiedName.get(symbol.qualified_name) ?? []).sort(
      (left, right) => left.declaration_order_index - right.declaration_order_index,
    );
    symbol.child_symbol_names = children.map((child) => child.symbol_name);
    symbol.child_qualified_names = children.map((child) => child.qualified_name);
  });

  const symbolDoxygenFieldCount = definitions.reduce(
    (sum, element) => sum + countDoxygenFieldValues(collectElementDoxygenFields(element)),
    0,
  );
  const fileDoxygenFieldCount = countDoxygenFieldValues(fileLevelDoxygen);

  return {
    languageName: languageSpec?.name,
    symbols,
    fileDoxygen: Object.keys(structuredFileDoxygen).length > 0 ? structuredFileDoxygen : undefined,
    fileDescriptionText: structuredFileDoxygen.brief?.[0] ?? structuredFileDoxygen.details?.[0],
    doxygenFieldCount: fileDoxygenFieldCount + symbolDoxygenFieldCount,
  };
}

/**
 * @brief Analyzes one path into a structured compression file entry.
 * @details Resolves path identity, performs compression, attempts supplementary symbol and Doxygen extraction, preserves stable skip or error reasons, and keeps compression success independent from symbol-analysis success. Runtime is dominated by file I/O and analyzer cost. Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
 * @param[in] inputPath {string} Caller-supplied path.
 * @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
 * @param[in] requestIndex {number} Caller-order index.
 * @param[in] baseDir {string} Base directory used for canonical path derivation.
 * @param[in] includeLineNumbers {boolean} When `true`, rendered compressed text includes original source line numbers.
 * @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
 * @return {CompressToolFileEntry} Structured file entry.
 */
function analyzeCompressFile(
  analyzer: SourceAnalyzer,
  inputPath: string,
  absolutePath: string,
  requestIndex: number,
  baseDir: string,
  includeLineNumbers: boolean,
  verbose: boolean,
): CompressToolFileEntry {
  const canonicalPath = canonicalizeCompressionPath(absolutePath, baseDir);
  const languageId = detectLanguage(absolutePath);

  if (!languageId) {
    if (verbose) {
      console.error(`  SKIP  ${inputPath} (unsupported extension)`);
    }
    return {
      ...buildLineRange(0, 0),
      canonical_path: canonicalPath,
      status: "skipped",
      source_line_count: 0,
      compressed_line_count: 0,
      removed_line_count: 0,
      symbol_analysis_status: "not_attempted",
      symbol_count: 0,
      doxygen_field_count: 0,
      symbols: [],
      compressed_lines: [],
      error_reason: "unsupported_extension",
      error_message: "unsupported extension",
    };
  }

  try {
    const compression = compressFileDetailed(absolutePath, languageId, includeLineNumbers);
    let symbols: CompressToolSymbolEntry[] = [];
    let fileDoxygen: StructuredDoxygenFields | undefined;
    let doxygenFieldCount = 0;
    let symbolAnalysisStatus: CompressSymbolAnalysisStatus = "not_attempted";
    let symbolAnalysisErrorMessage: string | undefined;

    try {
      const symbolAnalysis = analyzeCompressedFileSymbols(analyzer, absolutePath, canonicalPath, languageId);
      symbols = symbolAnalysis.symbols;
      fileDoxygen = symbolAnalysis.fileDoxygen;
      doxygenFieldCount = symbolAnalysis.doxygenFieldCount;
      symbolAnalysisStatus = "analyzed";
    } catch (error) {
      symbolAnalysisStatus = "error";
      symbolAnalysisErrorMessage = error instanceof Error ? error.message : String(error);
      if (verbose) {
        console.error(`  WARN  ${absolutePath} (symbol analysis failed: ${symbolAnalysisErrorMessage})`);
      }
    }

    if (verbose) {
      console.error(`  OK    ${absolutePath}`);
    }

    return {
      ...buildLineRange(compression.source_start_line_number, compression.source_end_line_number),
      canonical_path: canonicalPath,
      status: "compressed",
      source_line_count: compression.source_line_count,
      compressed_line_count: compression.compressed_line_count,
      removed_line_count: compression.removed_line_count,
      symbol_analysis_status: symbolAnalysisStatus,
      symbol_count: symbols.length,
      doxygen_field_count: doxygenFieldCount,
      file_doxygen: fileDoxygen,
      symbols,
      compressed_lines: mapCompressedLines(compression.compressed_lines),
      symbol_analysis_error_message: symbolAnalysisErrorMessage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (verbose) {
      console.error(`  FAIL  ${absolutePath} (${message})`);
    }
    return {
      ...buildLineRange(0, 0),
      canonical_path: canonicalPath,
      status: "error",
      source_line_count: 0,
      compressed_line_count: 0,
      removed_line_count: 0,
      symbol_analysis_status: "not_attempted",
      symbol_count: 0,
      doxygen_field_count: 0,
      symbols: [],
      compressed_lines: [],
      error_reason: "compression_failed",
      error_message: message,
    };
  }
}

/**
 * @brief Builds the full agent-oriented compression payload.
 * @details Validates requested paths against the filesystem, compresses processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits repository scope metadata without echoing request facts already known to the caller. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] options {BuildCompressToolPayloadOptions} Payload-construction options.
 * @return {CompressToolPayload} Structured compression payload ordered as summary, repository, and files.
 * @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087
 */
export function buildCompressToolPayload(options: BuildCompressToolPayloadOptions): CompressToolPayload {
  const {
    toolName,
    scope,
    baseDir,
    requestedPaths,
    includeLineNumbers,
    sourceDirectoryPaths = [],
    verbose = false,
  } = options;
  const absoluteBaseDir = path.resolve(baseDir);
  const analyzer = new SourceAnalyzer();
  const lineNumberMode: CompressLineNumberMode = includeLineNumbers ? "enabled" : "disabled";
  const canonicalRequestedPaths = requestedPaths.map((requestedPath) => canonicalizeCompressionPath(requestedPath, absoluteBaseDir));
  const files: CompressToolFileEntry[] = requestedPaths.map((requestedPath, requestIndex) => {
    const absolutePath = path.resolve(absoluteBaseDir, requestedPath);
    const canonicalPath = canonicalizeCompressionPath(absolutePath, absoluteBaseDir);
    if (!fs.existsSync(absolutePath)) {
      if (verbose) {
        console.error(`  SKIP  ${requestedPath} (file not found)`);
      }
      return {
        ...buildLineRange(0, 0),
        canonical_path: canonicalPath,
        status: "skipped",
        source_line_count: 0,
        compressed_line_count: 0,
        removed_line_count: 0,
        symbol_analysis_status: "not_attempted",
        symbol_count: 0,
        doxygen_field_count: 0,
        symbols: [],
        compressed_lines: [],
        error_reason: "not_found",
        error_message: "not found",
      } satisfies CompressToolFileEntry;
    }
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      if (verbose) {
        console.error(`  SKIP  ${requestedPath} (not a file)`);
      }
      return {
        ...buildLineRange(0, 0),
        canonical_path: canonicalPath,
        status: "skipped",
        source_line_count: 0,
        compressed_line_count: 0,
        removed_line_count: 0,
        symbol_analysis_status: "not_attempted",
        symbol_count: 0,
        doxygen_field_count: 0,
        symbols: [],
        compressed_lines: [],
        error_reason: "not_file",
        error_message: "not a file",
      } satisfies CompressToolFileEntry;
    }
    return analyzeCompressFile(analyzer, requestedPath, absolutePath, requestIndex, absoluteBaseDir, includeLineNumbers, verbose);
  });

  const compressedFiles = files.filter((file) => file.status === "compressed");
  const symbolAnalysisErrorCount = compressedFiles.filter((file) => file.symbol_analysis_status === "error").length;

  void toolName;
  void scope;
  void lineNumberMode;
  void canonicalRequestedPaths;
  return {
    summary: {
      processable_file_count: files.filter((file) => file.status !== "skipped").length,
      compressed_file_count: compressedFiles.length,
      error_file_count: files.filter((file) => file.status === "error").length,
      skipped_file_count: files.filter((file) => file.status === "skipped").length,
      symbol_analysis_error_count: symbolAnalysisErrorCount,
      total_source_line_count: compressedFiles.reduce((sum, file) => sum + file.source_line_count, 0),
      total_compressed_line_count: compressedFiles.reduce((sum, file) => sum + file.compressed_line_count, 0),
      total_removed_line_count: compressedFiles.reduce((sum, file) => sum + file.removed_line_count, 0),
      total_symbol_count: compressedFiles.reduce((sum, file) => sum + file.symbol_count, 0),
      total_doxygen_field_count: compressedFiles.reduce((sum, file) => sum + file.doxygen_field_count, 0),
    },
    repository: {
      source_directory_paths: [...sourceDirectoryPaths],
      file_canonical_paths: files.map((file) => file.canonical_path),
    },
    files,
  };
}

/**
 * @brief Builds execution diagnostics for one compression payload.
 * @details Serializes skipped inputs, hard compression failures, and supplementary symbol-analysis warnings into stable stderr lines while keeping successful compressed files silent. Runtime is O(n) in issue count. No side effects occur.
 * @param[in] payload {CompressToolPayload} Structured compression payload.
 * @return {string} Newline-delimited execution diagnostics.
 * @satisfies REQ-087
 */
export function buildCompressToolExecutionStderr(payload: CompressToolPayload): string {
  const skippedLines = payload.files
    .filter((file) => file.status === "skipped")
    .map((file) => `skipped: ${file.canonical_path}: ${file.error_reason ?? "skipped"}`);
  const errorLines = payload.files
    .filter((file) => file.status === "error")
    .map((file) => `error: ${file.canonical_path}: ${file.error_reason ?? "error"}: ${file.error_message ?? "unknown error"}`);
  const warningLines = payload.files
    .filter((file) => file.status === "compressed" && file.symbol_analysis_status === "error")
    .map((file) => `warning: ${file.canonical_path}: source_analysis_failed: ${file.symbol_analysis_error_message ?? "unknown error"}`);
  return [...skippedLines, ...errorLines, ...warningLines].join("\n");
}
