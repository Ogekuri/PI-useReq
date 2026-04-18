/**
 * @file
 * @brief Builds agent-oriented JSON payloads for `files-references` and `references`.
 * @details Converts analyzed source files into deterministic JSON sections ordered for LLM traversal, including repository structure, per-file metrics, imports, symbols, structured Doxygen fields, and structured comment evidence. Runtime is O(F log F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.
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
import { detectLanguage } from "./compress.js";
import {
  countDoxygenFieldValues,
  structureDoxygenFields,
  type StructuredDoxygenFields,
} from "./doxygen-parser.js";

/**
 * @brief Enumerates supported references-payload scopes.
 * @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
 */
export type ReferenceToolScope = "explicit-files" | "configured-source-directories";

/**
 * @brief Enumerates supported per-file references entry statuses.
 * @details Separates analyzed files, analysis failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
 */
export type ReferenceFileStatus = "analyzed" | "error" | "skipped";

/**
 * @brief Describes one numeric source line range.
 * @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceLineRange {
  start_line_number: number;
  end_line_number: number;
  line_range: [number, number];
}

/**
 * @brief Describes one structured import record.
 * @details Stores the normalized import identity, raw import statement, and declaration line range without requiring agents to parse markdown blocks. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceImportEntry extends ReferenceLineRange {
  import_name: string;
  statement_text: string;
}

/**
 * @brief Describes one structured standalone or attached comment record.
 * @details Preserves normalized comment text plus per-line comment fragments so agents can consume comment evidence without reparsing source delimiters. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceCommentEntry extends ReferenceLineRange {
  text: string;
  text_lines: string[];
}

/**
 * @brief Describes one structured exit-point annotation.
 * @details Preserves the normalized exit expression text together with its source line number for downstream reasoning about control flow hints. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceExitPointEntry {
  line_number: number;
  text: string;
}

/**
 * @brief Describes one structured symbol record.
 * @details Orders direct-access identity fields before hierarchy, locations, Doxygen metadata, and comment evidence so agents can branch without reparsing monolithic summaries. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceSymbolEntry extends ReferenceLineRange {
  declaration_order_index: number;
  symbol_name: string;
  qualified_name: string;
  symbol_kind: string;
  type_label: string;
  signature_text?: string;
  visibility?: string;
  parent_symbol_name?: string;
  parent_qualified_name?: string;
  child_symbol_names: string[];
  child_qualified_names: string[];
  depth: number;
  inherits_text?: string;
  decorator_text?: string;
  attached_comment_summary_text?: string;
  attached_comment_lines?: string[];
  doxygen?: StructuredDoxygenFields;
  body_comment_entries: ReferenceCommentEntry[];
  exit_point_entries: ReferenceExitPointEntry[];
}

/**
 * @brief Describes one per-file references payload entry.
 * @details Stores canonical path identity, filesystem status, line metrics, structured imports, structured symbols, structured comment evidence, and optional file-level Doxygen metadata. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceToolFileEntry extends ReferenceLineRange {
  request_index: number;
  input_path: string;
  canonical_path: string;
  absolute_path: string;
  file_name: string;
  file_extension: string;
  language_id?: string;
  language_name?: string;
  status: ReferenceFileStatus;
  exists: boolean;
  is_file: boolean;
  import_count: number;
  symbol_count: number;
  comment_count: number;
  standalone_comment_count: number;
  doxygen_field_count: number;
  file_description_text?: string;
  file_doxygen?: StructuredDoxygenFields;
  imports: ReferenceImportEntry[];
  symbols: ReferenceSymbolEntry[];
  standalone_comments: ReferenceCommentEntry[];
  error_message?: string;
}

/**
 * @brief Describes the request section of the references payload.
 * @details Captures tool identity, scope, base directory, requested path inventory, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceToolRequestSection {
  tool_name: string;
  scope: ReferenceToolScope;
  base_dir_path: string;
  source_directory_count: number;
  source_directory_paths: string[];
  requested_file_count: number;
  requested_input_paths: string[];
  requested_canonical_paths: string[];
}

/**
 * @brief Describes the summary section of the references payload.
 * @details Exposes aggregate file, symbol, import, comment, and Doxygen counts as numeric fields plus deterministic symbol-kind totals. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceToolSummarySection {
  processable_file_count: number;
  analyzed_file_count: number;
  error_file_count: number;
  skipped_file_count: number;
  total_symbol_count: number;
  total_import_count: number;
  total_comment_count: number;
  total_standalone_comment_count: number;
  total_doxygen_field_count: number;
  symbol_kind_counts: Record<string, number>;
}

/**
 * @brief Describes one repository tree node in the references payload.
 * @details Encodes directory and file hierarchy without ASCII-art decoration so agents can traverse repository structure as structured JSON. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceRepositoryTreeNode {
  node_name: string;
  relative_path: string;
  node_kind: "directory" | "file";
  child_count: number;
  children: ReferenceRepositoryTreeNode[];
}

/**
 * @brief Describes the repository section of the references payload.
 * @details Stores the base path, configured source-directory scope, canonical file list, and structured directory tree used during analysis. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceToolRepositorySection {
  root_directory_path: string;
  source_directory_paths: string[];
  file_count: number;
  file_canonical_paths: string[];
  directory_tree: ReferenceRepositoryTreeNode;
}

/**
 * @brief Describes the full agent-oriented references payload.
 * @details Orders the top-level sections as request, summary, repository, and files for deterministic downstream traversal. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReferenceToolPayload {
  request: ReferenceToolRequestSection;
  summary: ReferenceToolSummarySection;
  repository: ReferenceToolRepositorySection;
  files: ReferenceToolFileEntry[];
}

/**
 * @brief Describes the options required to build one references payload.
 * @details Supplies tool identity, scope, base directory, requested paths, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.
 */
export interface BuildReferenceToolPayloadOptions {
  toolName: string;
  scope: ReferenceToolScope;
  baseDir: string;
  requestedPaths: string[];
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
function canonicalizeReferencePath(targetPath: string, baseDir: string): string {
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
 * @return {ReferenceLineRange} Structured line-range record.
 */
function buildLineRange(startLineNumber: number, endLineNumber: number): ReferenceLineRange {
  return {
    start_line_number: startLineNumber,
    end_line_number: endLineNumber,
    line_range: [startLineNumber, endLineNumber],
  };
}

/**
 * @brief Extracts normalized plain text from one comment element.
 * @details Removes language comment markers, drops delimiter-only lines, joins content with spaces, and optionally truncates the result. Runtime is O(n) in comment length. No side effects occur.
 * @param[in] commentElement {SourceElement} Comment element.
 * @param[in] maxLength {number} Optional maximum output length; `0` disables truncation.
 * @return {string} Cleaned comment text.
 */
function extractCommentText(commentElement: SourceElement, maxLength = 0): string {
  const cleaned: string[] = [];
  for (const line of commentElement.extract.split("\n")) {
    let value = line.trim();
    for (const prefix of ["///", "//!", "//", "#!", "##", "#", "--", ";;"]) {
      if (value.startsWith(prefix)) {
        value = value.slice(prefix.length).trim();
        break;
      }
    }
    value = value.replace(/^[/*"']+|[/*"']+$/g, "").trim();
    if (value && !value.startsWith("=begin") && !value.startsWith("=end")) {
      cleaned.push(value);
    }
  }
  let text = cleaned.join(" ");
  if (maxLength > 0 && text.length > maxLength) {
    text = `${text.slice(0, maxLength - 3)}...`;
  }
  return text;
}

/**
 * @brief Extracts cleaned individual lines from one comment element.
 * @details Removes language comment markers while preserving line granularity for structured comment payloads. Runtime is O(n) in comment length. No side effects occur.
 * @param[in] commentElement {SourceElement} Comment element.
 * @return {string[]} Cleaned comment lines.
 */
function extractCommentLines(commentElement: SourceElement): string[] {
  return commentElement.extract
    .split("\n")
    .map((line) => {
      let value = line.trim();
      for (const prefix of ["///", "//!", "//", "#!", "##", "#", "--", ";;"]) {
        if (value.startsWith(prefix)) {
          value = value.slice(prefix.length).trim();
          break;
        }
      }
      return value.replace(/^[/*"']+|[/*"']+$/g, "").trim();
    })
    .filter((line) => !!line && !line.startsWith("=begin") && !line.startsWith("=end"));
}

/**
 * @brief Associates nearby comment blocks with definitions and standalone comment groups.
 * @details Reuses the repository comment-attachment heuristic that binds comments within three lines of a definition while preserving early file-description text. Runtime is O(n log n). No side effects occur.
 * @param[in] elements {SourceElement[]} Analyzed source elements.
 * @return {[Record<number, SourceElement[]>, SourceElement[], string]} Attached-comment map, standalone comments, and compact file description.
 */
function buildCommentMaps(elements: SourceElement[]): [Record<number, SourceElement[]>, SourceElement[], string] {
  const sorted = [...elements].sort((left, right) => left.lineStart - right.lineStart);
  const definitionTypes = new Set(
    Object.values(ElementType).filter(
      (value) => ![ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR].includes(value as ElementType),
    ) as ElementType[],
  );
  const definitionStarts = new Set(elements.filter((element) => definitionTypes.has(element.elementType)).map((element) => element.lineStart));
  const importStarts = new Set(elements.filter((element) => element.elementType === ElementType.IMPORT).map((element) => element.lineStart));
  const comments = sorted.filter((element) => [ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType));
  const docForDef: Record<number, SourceElement[]> = {};
  const standaloneComments: SourceElement[] = [];
  let fileDescription = "";

  for (const comment of comments) {
    if (comment.lineStart > 10) {
      break;
    }
    const text = extractCommentText(comment);
    if (text && !text.startsWith("/usr/") && !text.startsWith("usr/")) {
      fileDescription = text.length > 200 ? `${text.slice(0, 197)}...` : text;
      break;
    }
  }

  comments.forEach((comment) => {
    if (comment.name === "inline") {
      return;
    }
    let attached = false;
    for (let gap = 1; gap < 4; gap += 1) {
      const targetLine = comment.lineEnd + gap;
      if (definitionStarts.has(targetLine)) {
        docForDef[targetLine] ??= [];
        docForDef[targetLine].push(comment);
        attached = true;
        break;
      }
      if (importStarts.has(targetLine)) {
        break;
      }
    }
    if (!attached && comment !== comments[0]) {
      standaloneComments.push(comment);
    } else if (!attached && comment === comments[0] && !fileDescription) {
      standaloneComments.push(comment);
    }
  });

  return [docForDef, standaloneComments, fileDescription];
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
 * @brief Builds one structured comment record from a comment element.
 * @details Preserves numeric line-range metadata plus normalized text and per-line fragments. Runtime is O(n) in comment length. No side effects occur.
 * @param[in] commentElement {SourceElement} Source comment element.
 * @return {ReferenceCommentEntry} Structured comment record.
 */
function buildCommentEntry(commentElement: SourceElement): ReferenceCommentEntry {
  const textLines = extractCommentLines(commentElement);
  return {
    ...buildLineRange(commentElement.lineStart, commentElement.lineEnd),
    text: extractCommentText(commentElement),
    text_lines: textLines,
  };
}

/**
 * @brief Builds one structured repository tree from canonical file paths.
 * @details Materializes a nested directory map and converts it into recursively ordered JSON nodes without decorative ASCII formatting. Runtime is O(n log n) in path count. No side effects occur.
 * @param[in] canonicalPaths {string[]} Canonical file paths.
 * @return {ReferenceRepositoryTreeNode} Structured repository tree rooted at `.`.
 */
function buildRepositoryTree(canonicalPaths: string[]): ReferenceRepositoryTreeNode {
  const root: ReferenceRepositoryTreeNode = {
    node_name: ".",
    relative_path: ".",
    node_kind: "directory",
    child_count: 0,
    children: [],
  };

  const ensureDirectory = (parent: ReferenceRepositoryTreeNode, nodeName: string, relativePath: string): ReferenceRepositoryTreeNode => {
    const existing = parent.children.find((child) => child.node_kind === "directory" && child.node_name === nodeName);
    if (existing) {
      return existing;
    }
    const created: ReferenceRepositoryTreeNode = {
      node_name: nodeName,
      relative_path: relativePath,
      node_kind: "directory",
      child_count: 0,
      children: [],
    };
    parent.children.push(created);
    return created;
  };

  [...canonicalPaths].sort((left, right) => left.localeCompare(right)).forEach((canonicalPath) => {
    const parts = canonicalPath.split("/").filter(Boolean);
    let cursor = root;
    parts.forEach((part, index) => {
      const relativePath = index === 0 ? part : `${cursor.relative_path === "." ? "" : `${cursor.relative_path}/`}${part}`;
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        cursor.children.push({
          node_name: part,
          relative_path: relativePath,
          node_kind: "file",
          child_count: 0,
          children: [],
        });
      } else {
        cursor = ensureDirectory(cursor, part, relativePath);
      }
    });
  });

  const finalizeNode = (node: ReferenceRepositoryTreeNode): ReferenceRepositoryTreeNode => {
    node.children = node.children
      .map((child) => finalizeNode(child))
      .sort((left, right) => {
        if (left.node_kind !== right.node_kind) {
          return left.node_kind === "directory" ? -1 : 1;
        }
        return left.node_name.localeCompare(right.node_name);
      });
    node.child_count = node.children.length;
    return node;
  };

  return finalizeNode(root);
}

/**
 * @brief Builds one analyzed file entry for the references payload.
 * @details Parses the file with `SourceAnalyzer`, extracts structured imports and symbols, attaches structured Doxygen fields, and preserves standalone comment evidence. Runtime is O(S log S) in file size and symbol count. Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] analyzer {SourceAnalyzer} Shared source analyzer instance.
 * @param[in] inputPath {string} Caller-provided input path.
 * @param[in] absolutePath {string} Absolute file path.
 * @param[in] requestIndex {number} Zero-based request index.
 * @param[in] baseDir {string} Base directory used for canonical paths.
 * @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
 * @return {ReferenceToolFileEntry} Structured file entry.
 */
function analyzeReferenceFile(
  analyzer: SourceAnalyzer,
  inputPath: string,
  absolutePath: string,
  requestIndex: number,
  baseDir: string,
  verbose: boolean,
): ReferenceToolFileEntry {
  const canonicalPath = canonicalizeReferencePath(absolutePath, baseDir);
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
      import_count: 0,
      symbol_count: 0,
      comment_count: 0,
      standalone_comment_count: 0,
      doxygen_field_count: 0,
      imports: [],
      symbols: [],
      standalone_comments: [],
      error_message: "unsupported extension",
    };
  }

  try {
    const elements = analyzer.analyze(absolutePath, languageId);
    analyzer.enrich(elements, languageId, absolutePath);
    const languageSpec = analyzer.specs[languageId.toLowerCase().trim().replace(/^\./, "")];
    const fileContent = fs.readFileSync(absolutePath, "utf8");
    const lineCount = fileContent === "" ? 0 : fileContent.split(/\r?\n/).length - (fileContent.endsWith("\n") ? 1 : 0);
    const [docForDef, standaloneCommentsRaw, fileDescriptionRaw] = buildCommentMaps(elements);
    const fileLevelDoxygen = collectFileLevelDoxygenFields(elements);
    const structuredFileDoxygen = structureDoxygenFields(fileLevelDoxygen);
    const imports = elements
      .filter((element) => element.elementType === ElementType.IMPORT)
      .sort((left, right) => left.lineStart - right.lineStart)
      .map((element) => ({
        ...buildLineRange(element.lineStart, element.lineEnd),
        import_name: resolveSymbolName(element),
        statement_text: (element.extract.split("\n")[0] ?? "").trim(),
      } satisfies ReferenceImportEntry));
    const standaloneComments = standaloneCommentsRaw.map((comment) => buildCommentEntry(comment));
    const definitions = elements
      .filter((element) => ![ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI, ElementType.IMPORT, ElementType.DECORATOR].includes(element.elementType))
      .sort((left, right) => left.lineStart - right.lineStart);
    const decoratorByTargetLine = new Map<number, string>();
    elements
      .filter((element) => element.elementType === ElementType.DECORATOR)
      .forEach((element) => decoratorByTargetLine.set(element.lineStart + 1, (element.extract.split("\n")[0] ?? "").trim()));
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
      const attachedComments = docForDef[element.lineStart] ?? [];
      const attachedCommentSummaryText = structuredDoxygen.brief?.[0] ?? attachedComments.map((comment) => extractCommentText(comment, 150)).find(Boolean);
      const attachedCommentLines = Object.keys(structuredDoxygen).length > 0
        ? undefined
        : attachedComments.flatMap((comment) => extractCommentLines(comment));

      return {
        ...buildLineRange(element.lineStart, element.lineEnd),
        declaration_order_index: index,
        symbol_name: symbolName,
        qualified_name: qualifiedName,
        symbol_kind: element.elementType,
        type_label: element.typeLabel,
        signature_text: element.signature,
        visibility: element.visibility,
        parent_symbol_name: parentSymbolName,
        parent_qualified_name: parentQualifiedName,
        child_symbol_names: [],
        child_qualified_names: [],
        depth: element.depth,
        inherits_text: element.inherits,
        decorator_text: decoratorByTargetLine.get(element.lineStart),
        attached_comment_summary_text: attachedCommentSummaryText,
        attached_comment_lines: attachedCommentLines && attachedCommentLines.length > 0 ? attachedCommentLines : undefined,
        doxygen: Object.keys(structuredDoxygen).length > 0 ? structuredDoxygen : undefined,
        body_comment_entries: element.bodyComments.map(([startLineNumber, endLineNumber, text]) => ({
          ...buildLineRange(startLineNumber, endLineNumber),
          text,
          text_lines: text.split("\n").map((line) => line.trim()).filter(Boolean),
        })),
        exit_point_entries: element.exitPoints.map(([lineNumber, text]) => ({
          line_number: lineNumber,
          text,
        })),
      } satisfies ReferenceSymbolEntry;
    });

    const childrenByParentQualifiedName = new Map<string, ReferenceSymbolEntry[]>();
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

    const commentCount = elements.filter(
      (element) => [ElementType.COMMENT_SINGLE, ElementType.COMMENT_MULTI].includes(element.elementType) && element.name !== "inline",
    ).length;
    const doxygenFieldCount = countDoxygenFieldValues(fileLevelDoxygen)
      + symbols.reduce((sum, symbol) => sum + countDoxygenFieldValues(collectElementDoxygenFields(definitions[symbol.declaration_order_index]!)), 0);

    if (verbose) {
      console.error(`  OK    ${absolutePath}`);
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
      language_name: languageSpec?.name,
      status: "analyzed",
      exists: true,
      is_file: true,
      import_count: imports.length,
      symbol_count: symbols.length,
      comment_count: commentCount,
      standalone_comment_count: standaloneComments.length,
      doxygen_field_count: doxygenFieldCount,
      file_description_text: structuredFileDoxygen.brief?.[0] ? undefined : fileDescriptionRaw || undefined,
      file_doxygen: Object.keys(structuredFileDoxygen).length > 0 ? structuredFileDoxygen : undefined,
      imports,
      symbols,
      standalone_comments: standaloneComments,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (verbose) {
      console.error(`  FAIL  ${absolutePath} (${message})`);
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
      status: "error",
      exists: true,
      is_file: true,
      import_count: 0,
      symbol_count: 0,
      comment_count: 0,
      standalone_comment_count: 0,
      doxygen_field_count: 0,
      imports: [],
      symbols: [],
      standalone_comments: [],
      error_message: message,
    };
  }
}

/**
 * @brief Builds the full agent-oriented references payload.
 * @details Validates requested paths against the filesystem, analyzes processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits a structured repository tree. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] options {BuildReferenceToolPayloadOptions} Payload-construction options.
 * @return {ReferenceToolPayload} Structured references payload ordered as request, summary, repository, and files.
 * @satisfies REQ-011, REQ-014, REQ-076, REQ-077, REQ-078, REQ-079
 */
export function buildReferenceToolPayload(options: BuildReferenceToolPayloadOptions): ReferenceToolPayload {
  const {
    toolName,
    scope,
    baseDir,
    requestedPaths,
    sourceDirectoryPaths = [],
    verbose = false,
  } = options;
  const absoluteBaseDir = path.resolve(baseDir);
  const analyzer = new SourceAnalyzer();
  const canonicalRequestedPaths = requestedPaths.map((requestedPath) => canonicalizeReferencePath(requestedPath, absoluteBaseDir));
  const files: ReferenceToolFileEntry[] = requestedPaths.map((requestedPath, requestIndex) => {
    const absolutePath = path.resolve(absoluteBaseDir, requestedPath);
    const canonicalPath = canonicalizeReferencePath(absolutePath, absoluteBaseDir);
    const fileName = path.basename(absolutePath);
    const fileExtension = path.extname(absolutePath).toLowerCase();
    if (!fs.existsSync(absolutePath)) {
      if (verbose) {
        console.error(`  SKIP  ${requestedPath} (file not found)`);
      }
      return {
        ...buildLineRange(0, 0),
        request_index: requestIndex,
        input_path: requestedPath,
        canonical_path: canonicalPath,
        absolute_path: absolutePath,
        file_name: fileName,
        file_extension: fileExtension,
        status: "skipped",
        exists: false,
        is_file: false,
        import_count: 0,
        symbol_count: 0,
        comment_count: 0,
        standalone_comment_count: 0,
        doxygen_field_count: 0,
        imports: [],
        symbols: [],
        standalone_comments: [],
        error_message: "not found",
      };
    }
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      if (verbose) {
        console.error(`  SKIP  ${requestedPath} (not a file)`);
      }
      return {
        ...buildLineRange(0, 0),
        request_index: requestIndex,
        input_path: requestedPath,
        canonical_path: canonicalPath,
        absolute_path: absolutePath,
        file_name: fileName,
        file_extension: fileExtension,
        status: "skipped",
        exists: true,
        is_file: false,
        import_count: 0,
        symbol_count: 0,
        comment_count: 0,
        standalone_comment_count: 0,
        doxygen_field_count: 0,
        imports: [],
        symbols: [],
        standalone_comments: [],
        error_message: "not a file",
      };
    }
    return analyzeReferenceFile(analyzer, requestedPath, absolutePath, requestIndex, absoluteBaseDir, verbose);
  });

  if (verbose) {
    const analyzedCount = files.filter((file) => file.status === "analyzed").length;
    const errorCount = files.filter((file) => file.status === "error").length;
    console.error(`\n  Processed: ${analyzedCount} ok, ${errorCount} failed`);
  }

  const analyzedFiles = files.filter((file) => file.status === "analyzed");
  const processableFiles = files.filter((file) => file.status !== "skipped");
  const symbolKindCounts = new Map<string, number>();
  analyzedFiles.forEach((file) => {
    file.symbols.forEach((symbol) => {
      symbolKindCounts.set(symbol.symbol_kind, (symbolKindCounts.get(symbol.symbol_kind) ?? 0) + 1);
    });
  });
  const orderedSymbolKindCounts = Object.fromEntries(
    [...symbolKindCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const repositoryFileCanonicalPaths = [...new Set(analyzedFiles.map((file) => file.canonical_path))]
    .sort((left, right) => left.localeCompare(right));

  return {
    request: {
      tool_name: toolName,
      scope,
      base_dir_path: absoluteBaseDir,
      source_directory_count: sourceDirectoryPaths.length,
      source_directory_paths: sourceDirectoryPaths.map((sourceDirectoryPath) => canonicalizeReferencePath(sourceDirectoryPath, absoluteBaseDir)),
      requested_file_count: requestedPaths.length,
      requested_input_paths: [...requestedPaths],
      requested_canonical_paths: canonicalRequestedPaths,
    },
    summary: {
      processable_file_count: processableFiles.length,
      analyzed_file_count: analyzedFiles.length,
      error_file_count: files.filter((file) => file.status === "error").length,
      skipped_file_count: files.filter((file) => file.status === "skipped").length,
      total_symbol_count: analyzedFiles.reduce((sum, file) => sum + file.symbol_count, 0),
      total_import_count: analyzedFiles.reduce((sum, file) => sum + file.import_count, 0),
      total_comment_count: analyzedFiles.reduce((sum, file) => sum + file.comment_count, 0),
      total_standalone_comment_count: analyzedFiles.reduce((sum, file) => sum + file.standalone_comment_count, 0),
      total_doxygen_field_count: analyzedFiles.reduce((sum, file) => sum + file.doxygen_field_count, 0),
      symbol_kind_counts: orderedSymbolKindCounts,
    },
    repository: {
      root_directory_path: absoluteBaseDir,
      source_directory_paths: sourceDirectoryPaths.map((sourceDirectoryPath) => canonicalizeReferencePath(sourceDirectoryPath, absoluteBaseDir)),
      file_count: repositoryFileCanonicalPaths.length,
      file_canonical_paths: repositoryFileCanonicalPaths,
      directory_tree: buildRepositoryTree(repositoryFileCanonicalPaths),
    },
    files,
  };
}

/**
 * @brief Builds deterministic stderr diagnostics from a references payload.
 * @details Serializes skipped-input and analysis-error entries into stable newline-delimited diagnostics while leaving fully analyzed payloads silent. Runtime is O(n) in file-entry count. No side effects occur.
 * @param[in] payload {ReferenceToolPayload} Structured references payload.
 * @return {string} Newline-delimited diagnostics.
 */
export function buildReferenceToolExecutionStderr(payload: ReferenceToolPayload): string {
  const diagnostics = payload.files.flatMap((file) => {
    if (!file.error_message) {
      return [];
    }
    if (file.status === "skipped") {
      return [`  Warning: skipped: ${file.canonical_path}: ${file.error_message}`];
    }
    if (file.status === "error") {
      return [`  Error: failed: ${file.canonical_path}: ${file.error_message}`];
    }
    return [];
  });
  return diagnostics.join("\n");
}
