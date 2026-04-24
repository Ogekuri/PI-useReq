# Files Structure
```
.
└── src
    ├── cli.ts
    ├── core
    │   ├── agent-tool-json.ts
    │   ├── compress-files.ts
    │   ├── compress-payload.ts
    │   ├── compress.ts
    │   ├── config.ts
    │   ├── debug-runtime.ts
    │   ├── doxygen-parser.ts
    │   ├── errors.ts
    │   ├── extension-status.ts
    │   ├── find-constructs.ts
    │   ├── find-payload.ts
    │   ├── generate-markdown.ts
    │   ├── path-context.ts
    │   ├── pi-notify.ts
    │   ├── pi-usereq-tools.ts
    │   ├── prompt-command-catalog.ts
    │   ├── prompt-command-runtime.ts
    │   ├── prompt-command-state.ts
    │   ├── prompts.ts
    │   ├── reference-payload.ts
    │   ├── resources.ts
    │   ├── runtime-project-paths.ts
    │   ├── settings-menu.ts
    │   ├── source-analyzer.ts
    │   ├── static-check.ts
    │   ├── token-counter.ts
    │   ├── tool-runner.ts
    │   └── utils.ts
    └── index.ts
```

# cli.ts | TypeScript | 305L | 9 symbols | 5 imports | 9 comments
> Path: `src/cli.ts`
- @brief Implements the standalone pi-usereq command-line entry point.
- @details Parses CLI flags, resolves project configuration, dispatches tool-runner operations, and converts thrown `ReqError` instances into process-style stdout, stderr, and exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and any filesystem or git operations performed by delegated commands.

## Imports
```
import process from "node:process";
import { ReqError } from "./core/errors.js";
import {
import {
import {
```

## Definitions

### iface `interface ParsedArgs` (L42-59)
- @brief Represents the parsed CLI flag state for one invocation.
- @details The interface captures every supported command and option in a normalized shape consumed by `main`. It is compile-time only and introduces no runtime cost.

### fn `function parseArgs(argv: string[]): ParsedArgs` (L67-163)
- @brief Parses raw CLI tokens into a normalized argument object.
- @details Performs a single left-to-right scan, supports options with variable-length value tails, and records only the last occurrence of scalar flags. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding the executable and script path.
- @return {ParsedArgs} Parsed flag object.

### fn `const takeUntilOption = (start: number): [string[], number] =>` (L69-77)

### fn `function writeStdout(text: string): void` (L171-173)
- @brief Writes text to stdout when non-empty.
- @details Avoids emitting zero-length writes so callers can compose result output safely. Runtime is O(n) in text length. Side effect: writes to `process.stdout`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L181-184)
- @brief Writes text to stderr and ensures a trailing newline.
- @details Skips empty input, appends a newline when necessary, and emits the final text to `process.stderr`. Runtime is O(n) in text length. Side effect: writes to `process.stderr`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeResult(result: { stdout: string; stderr: string; code: number }): number` (L192-196)
- @brief Emits a tool result object to process streams.
- @details Writes stdout first, then stderr, and returns the embedded exit code without modification. Runtime is O(n) in total emitted text size. Side effects are stdout/stderr writes.
- @param[in] result {{ stdout: string; stderr: string; code: number }} Command result payload.
- @return {number} Exit code to propagate from the invoked command.

### fn `function loadMutableProjectConfig(projectBase: string): { base: string; config: UseReqConfig }` (L205-209)
- @brief Loads mutable project config state without persisting runtime path metadata.
- @details Resolves the project base, loads existing config or defaults, normalizes persisted directory fields into project-relative form, and returns the in-memory pair used by CLI mutations. Runtime is dominated by config I/O. Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root path.
- @return {{ base: string; config: UseReqConfig }} Validated project base and normalized in-memory config.
- @satisfies REQ-035, REQ-146

### fn `function applyEnableStaticCheckSpecs(projectBase: string, specs: string[]): UseReqConfig` (L220-243)
- @brief Applies repeatable `--enable-static-check` specifications to project config.
- @details Parses each specification, validates command-backed entries before persistence, appends only non-duplicate identities in argument order, preserves existing per-language checker lists, forces each targeted language enable flag to `enable`, and writes the merged config once after all validations succeed. Runtime is O(s + e) plus PATH probing where s is spec count and e is existing entry count. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root path.
- @param[in] specs {string[]} Raw `--enable-static-check` specifications in CLI order.
- @return {UseReqConfig} Persisted merged project configuration.
- @throws {ReqError} Throws when parsing or validation fails.
- @satisfies REQ-035, REQ-036, REQ-037, REQ-253

### fn `export function main(argv = process.argv.slice(2)): number` (L252-301)
- @brief Executes one pi-usereq CLI invocation.
- @details Parses arguments, enforces mutually exclusive project-selection rules, normalizes persisted config when needed, dispatches the first matching command handler, and converts thrown `ReqError` instances into stream output plus numeric exit codes. Runtime is O(n) in argument count plus delegated command cost. Side effects include config normalization writes and stdout/stderr output.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {number} Process exit code for the invocation.
- @throws {ReqError} Internally catches `ReqError` and returns its code; other errors are coerced into exit code `1` with stderr output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ParsedArgs`|iface||42-59|interface ParsedArgs|
|`parseArgs`|fn||67-163|function parseArgs(argv: string[]): ParsedArgs|
|`takeUntilOption`|fn||69-77|const takeUntilOption = (start: number): [string[], numbe...|
|`writeStdout`|fn||171-173|function writeStdout(text: string): void|
|`writeStderr`|fn||181-184|function writeStderr(text: string): void|
|`writeResult`|fn||192-196|function writeResult(result: { stdout: string; stderr: st...|
|`loadMutableProjectConfig`|fn||205-209|function loadMutableProjectConfig(projectBase: string): {...|
|`applyEnableStaticCheckSpecs`|fn||220-243|function applyEnableStaticCheckSpecs(projectBase: string,...|
|`main`|fn||252-301|export function main(argv = process.argv.slice(2)): number|


---

# agent-tool-json.ts | TypeScript | 284L | 14 symbols | 6 imports | 15 comments
> Path: `src/core/agent-tool-json.ts`
- @brief Builds shared agent-tool result helpers plus static-check payloads.
- @details Converts extension-tool execution state into deterministic monolithic content blocks, minimal execution metadata, and static-check file-selection facts. Runtime is O(F) in the number of described files plus path normalization cost. Side effects are limited to filesystem reads.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import { ReqError } from "./errors.js";
import { STATIC_CHECK_EXT_TO_LANG } from "./static-check.js";
import type { ToolResult } from "./tool-runner.js";
```

## Definitions

### iface `export interface ToolExecutionSection` (L21-25)
- @brief Describes normalized execution metadata shared by structured tool payloads.
- @details Stores only the exit code and residual stdout or stderr line arrays needed after response payload construction, omitting duplicate text and count fields to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StructuredToolExecuteResult<T>` (L31-34)
- @brief Describes the standard execute return wrapper used by structured agent tools.
- @details Mirrors the same JSON payload into both the text content channel and the machine-readable details channel so agents can consume stable fields without reparsing ad-hoc prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StaticCheckFileRecord` (L40-46)
- @brief Describes one file-selection record inside a static-check payload.
- @details Exposes canonical path, detected language, configured checker modules, and stable selection status without echoing caller inputs or redundant filesystem probe fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StaticCheckToolPayload` (L52-62)
- @brief Describes the structured payload returned by static-check agent tools.
- @details Exposes aggregate checker coverage, per-file selection facts, and normalized execution diagnostics while omitting request echoes whose semantics are already available in the tool registration and input parameters. The interface is compile-time only and introduces no runtime cost.

### fn `function formatJsonToolPayload(payload: unknown): string` (L70-72)
- @brief Serializes one structured payload as pretty-printed JSON.
- @details Uses two-space indentation and omits a trailing newline so the mirrored text payload remains deterministic and compact. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] payload {unknown} Structured JSON-compatible payload.
- @return {string} Pretty-printed JSON text.

### fn `function splitToolOutputLines(text: string): string[]` (L80-83)
- @brief Splits one stdout or stderr text block into normalized non-empty lines.
- @details Trims trailing newlines, preserves internal line order, and omits empty records so downstream agents can branch on stable arrays without reparsing blank output. Runtime is O(n) in text length. No external state is mutated.
- @param[in] text {string} Raw output text.
- @return {string[]} Normalized non-empty output lines.

### fn `function canonicalizeToolPath(baseDir: string, candidatePath: string): string` (L92-99)
- @brief Normalizes one path into a canonical slash-separated form relative to the project base when possible.
- @details Resolves the candidate against the provided base, emits a relative path for in-project targets, and falls back to an absolute slash-normalized path for external targets. Runtime is O(p) in path length. No external state is mutated.
- @param[in] baseDir {string} Absolute project base path.
- @param[in] candidatePath {string} Relative or absolute path candidate.
- @return {string} Canonical slash-normalized path.

- fn `export function buildStructuredToolExecuteResult<T extends { execution: ToolExecutionSection }>(` (L107)
- @brief Converts one structured tool payload into the standard execute wrapper.
- @details Mirrors the same payload into `content[0].text` and `details` so agents can use direct JSON fields or raw JSON text interchangeably without divergence. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] payload {T} Structured payload containing an `execution` section.
- @return {StructuredToolExecuteResult<T>} Standard execute wrapper with mirrored payload.
### fn `export function buildToolExecutionSection(result: ToolResult): ToolExecutionSection` (L122-132)
- @brief Converts one raw `ToolResult` into a normalized execution section.
- @details Preserves only the exit code plus non-empty stdout or stderr line arrays so downstream payloads carry residual diagnostics without duplicating the primary structured response body. Runtime is O(n) in output size. No external state is mutated.
- @param[in] result {ToolResult} Raw tool result.
- @return {ToolExecutionSection} Normalized residual execution metadata.

### fn `function selectMonolithicToolText(result: ToolResult): string` (L140-146)
- @brief Selects the monolithic tool text exposed to the LLM-facing content channel.
- @details Prefers stdout so successful tool payloads preserve the primary formatter output verbatim, and falls back to stderr when the command failed before producing stdout. Runtime is O(n) in output length. No external state is mutated.
- @param[in] result {ToolResult} Raw tool result.
- @return {string} Monolithic text payload written to `content[0].text`.

### fn `export function buildMonolithicToolExecuteResult(` (L154-163)
- @brief Builds the minimal execute wrapper used by monolithic agent-tool outputs.
- @details Writes exactly one LLM-facing text block to `content[0].text` and preserves only normalized execution metadata in `details.execution`. Runtime is O(n) in output length. No external state is mutated.
- @param[in] result {ToolResult} Raw tool result.
- @return {StructuredToolExecuteResult<{ execution: ToolExecutionSection }>} Monolithic execute wrapper.

### fn `export function normalizeToolFailure(error: unknown): ToolResult` (L171-191)
- @brief Converts one runner failure into a synthetic `ToolResult`.
- @details Preserves numeric exit codes for `ReqError`, converts generic `Error` instances into exit code `1` with stderr text, and falls back to string coercion for other thrown values so agent tools can return deterministic execution metadata. Runtime is O(1). No external state is mutated.
- @param[in] error {unknown} Thrown value captured from a runner.
- @return {ToolResult} Synthetic tool result with empty stdout.

### fn `function buildStaticCheckFileRecord(` (L202-238)
- @brief Builds one static-check file-selection record.
- @details Resolves filesystem status, detects the configured language by file extension, derives the active checker modules after per-language enable gating, and emits a stable selection status without echoing caller inputs or redundant filesystem facts. Runtime is O(p + c) in path length plus configured checker count. Side effects are limited to filesystem reads.
- @param[in] inputPath {string} Caller-supplied file path.
- @param[in] requestIndex {number} Zero-based request position.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] staticCheckConfig {Record<string, StaticCheckLanguageConfig>} Effective static-check configuration.
- @return {StaticCheckFileRecord} Structured file-selection record.

### fn `export function buildStaticCheckToolPayload(` (L253-284)
- @brief Builds the structured payload returned by `files-static-check` or `static-check`.
- @details Exposes configured checker coverage, per-file selection facts, and normalized execution diagnostics while omitting request echoes whose semantics already live in registration metadata. Runtime is O(F + C). Side effects are limited to filesystem reads.
- @param[in] toolName {"files-static-check" | "static-check"} Target tool name.
- @param[in] scope {"explicit-files" | "configured-source-and-test-directories"} Selection scope label.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] requestedPaths {string[]} Explicit or discovered file paths.
- @param[in] selectionDirectoryPaths {string[]} Directories that produced the selection.
- @param[in] excludedDirectoryPaths {string[]} Directory roots excluded from project selection.
- @param[in] staticCheckConfig {Record<string, StaticCheckLanguageConfig>} Effective static-check configuration.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {StaticCheckToolPayload} Structured static-check payload.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolExecutionSection`|iface||21-25|export interface ToolExecutionSection|
|`StructuredToolExecuteResult`|iface||31-34|export interface StructuredToolExecuteResult<T>|
|`StaticCheckFileRecord`|iface||40-46|export interface StaticCheckFileRecord|
|`StaticCheckToolPayload`|iface||52-62|export interface StaticCheckToolPayload|
|`formatJsonToolPayload`|fn||70-72|function formatJsonToolPayload(payload: unknown): string|
|`splitToolOutputLines`|fn||80-83|function splitToolOutputLines(text: string): string[]|
|`canonicalizeToolPath`|fn||92-99|function canonicalizeToolPath(baseDir: string, candidateP...|
|`buildStructuredToolExecuteResult`|fn||107|export function buildStructuredToolExecuteResult<T extend...|
|`buildToolExecutionSection`|fn||122-132|export function buildToolExecutionSection(result: ToolRes...|
|`selectMonolithicToolText`|fn||140-146|function selectMonolithicToolText(result: ToolResult): st...|
|`buildMonolithicToolExecuteResult`|fn||154-163|export function buildMonolithicToolExecuteResult(|
|`normalizeToolFailure`|fn||171-191|export function normalizeToolFailure(error: unknown): Too...|
|`buildStaticCheckFileRecord`|fn||202-238|function buildStaticCheckFileRecord(|
|`buildStaticCheckToolPayload`|fn||253-284|export function buildStaticCheckToolPayload(|


---

# compress-files.ts | TypeScript | 72L | 2 symbols | 3 imports | 3 comments
> Path: `src/core/compress-files.ts`
- @brief Compresses explicit source-file lists into compact fenced-markdown excerpts.
- @details Bridges file validation, language detection, per-file source compression, and final markdown packaging for prompt consumption. Runtime is O(F + S) where F is file count and S is total source size processed. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { compressFileDetailed, detectLanguage } from "./compress.js";
```

## Definitions

### fn `function formatOutputPath(filePath: string, outputBase?: string): string` (L18-21)
- @brief Formats one source path for markdown output.
- @details Returns the original file path when no base is provided. Otherwise computes a normalized POSIX-style relative path against the resolved output base. Time complexity is O(p) in path length. No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @param[in] outputBase {string | undefined} Optional base directory for relative formatting.
- @return {string} Display path used in the markdown header.

### fn `export function compressFiles(` (L33-72)
- @brief Compresses a list of explicit source files into concatenated markdown sections.
- @details Validates file existence, infers each supported language, invokes per-file compression, preserves optional line numbers, and emits one fenced block per successful file. Runtime is O(F + S) where F is file count and S is total processed source size. Side effects are limited to filesystem reads and optional stderr progress logging.
- @param[in] filePaths {string[]} Explicit file paths to process.
- @param[in] includeLineNumbers {boolean} When `true`, preserve original source line numbers in the emitted code block.
- @param[in] verbose {boolean} When `true`, write progress and skip diagnostics to stderr.
- @param[in] outputBase {string | undefined} Optional base directory used to shorten output paths.
- @return {string} Markdown document containing one section per successfully compressed file.
- @throws {Error} Throws when no valid source files can be processed.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatOutputPath`|fn||18-21|function formatOutputPath(filePath: string, outputBase?: ...|
|`compressFiles`|fn||33-72|export function compressFiles(|


---

# compress-payload.ts | TypeScript | 570L | 22 symbols | 5 imports | 23 comments
> Path: `src/core/compress-payload.ts`
- @brief Builds agent-oriented JSON payloads for `files-compress` and `compress`.
- @details Converts compression results into deterministic JSON sections ordered for LLM traversal, including request metadata, repository scope, structured file metrics, structured compressed lines, symbols, and Doxygen fields. Runtime is O(F log F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import { compressFileDetailed, detectLanguage, type CompressedLineEntry } from "./compress.js";
import {
```

## Definitions

- type `export type CompressToolScope = "explicit-files" | "configured-source-directories";` (L27)
- @brief Enumerates supported compression-payload scopes.
- @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type CompressFileStatus = "compressed" | "error" | "skipped";` (L33)
- @brief Enumerates supported per-file compression statuses.
- @details Separates compressed files, hard failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
- type `export type CompressLineNumberMode = "enabled" | "disabled";` (L39)
- @brief Enumerates the rendered line-number mode for compression output.
- @details Distinguishes payloads whose display strings include original source line numbers from payloads whose display strings contain plain compressed text only. The alias is compile-time only and introduces no runtime cost.
- type `export type CompressSymbolAnalysisStatus = "analyzed" | "error" | "not_attempted";` (L45)
- @brief Enumerates structured symbol-analysis statuses for compressed files.
- @details Separates successful symbol extraction from supplementary analysis failures so compression can still succeed when analyzer enrichment is unavailable. The alias is compile-time only and introduces no runtime cost.
### iface `export interface CompressLineRange` (L51-55)
- @brief Describes one numeric line range.
- @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolLineEntry` (L61-66)
- @brief Describes one structured compressed line entry in the tool payload.
- @details Preserves output order, original source coordinates, raw compressed text, and rendered display text so agents can choose between normalized data and user-facing rendering without reparsing strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolSymbolEntry extends CompressLineRange` : CompressLineRange (L72-87)
- @brief Describes one structured symbol record inside the compression payload.
- @details Orders direct-access identity fields before hierarchy, locations, and Doxygen metadata so agents can branch without reparsing compressed source text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolFileEntry extends CompressLineRange` : CompressLineRange (L93-108)
- @brief Describes one per-file compression payload entry.
- @details Stores canonical identity, compression metrics, optional file-level and symbol-level metadata, structured compressed lines, and stable failure facts. Derivable identity fields and duplicate monolithic compressed text are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolRequestSection` (L114-124)
- @brief Describes the request section of the compression payload.
- @details Captures tool identity, scope, base directory, line-number mode, requested inputs, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolSummarySection` (L130-141)
- @brief Describes the summary section of the compression payload.
- @details Exposes aggregate file, line, symbol, and Doxygen counts as numeric fields with explicit unit names so agents can branch on totals without reparsing display strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolRepositorySection` (L147-150)
- @brief Describes the repository section of the compression payload.
- @details Stores configured source-directory scope and the canonical file list used during compression. Static root-path echoes are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolPayload` (L156-160)
- @brief Describes the full agent-oriented compression payload.
- @details Exposes only aggregate compression totals, repository scope, and per-file compression records, omitting request echoes that are already known to the caller or encoded in tool registration metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildCompressToolPayloadOptions` (L166-174)
- @brief Describes the options required to build one compression payload.
- @details Supplies tool identity, scope, base directory, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeCompressionPath(targetPath: string, baseDir: string): string` (L183-191)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): CompressLineRange` (L200-206)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {CompressLineRange} Structured line-range record.

### fn `function resolveSymbolName(element: SourceElement): string` (L214-216)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every symbol retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], child: SourceElement): SourceElement | undefined` (L225-234)
- @brief Resolves the direct parent element for one child symbol.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] child {SourceElement} Candidate child symbol.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function mapCompressedLines(compressedLines: CompressedLineEntry[]): CompressToolLineEntry[]` (L242-249)
- @brief Maps structured compression lines into the payload line-entry contract.
- @details Performs a shallow field copy so the payload remains decoupled from the core compression result type. Runtime is O(n) in compressed line count. No side effects occur.
- @param[in] compressedLines {CompressedLineEntry[]} Structured compression lines.
- @return {CompressToolLineEntry[]} Payload line entries.

### fn `function analyzeCompressedFileSymbols(` (L261-345)
- @brief Builds structured symbol entries for one successfully analyzed file.
- @details Extracts definition elements, computes parent-child relationships, attaches structured Doxygen metadata, and repeats the canonical file path inside each symbol record for direct-access agent indexing. Runtime is O(n log n) in definition count. No side effects occur.
- @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
- @param[in] absolutePath {string} Absolute file path.
- @param[in] canonicalPath {string} Canonical path emitted in the payload.
- @param[in] languageId {string} Canonical language identifier.
- @return {{ languageName: string | undefined; symbols: CompressToolSymbolEntry[]; fileDoxygen: StructuredDoxygenFields | undefined; fileDescriptionText: string | undefined; doxygenFieldCount: number }} Structured symbol-analysis result.
- @throws {Error} Throws when source analysis or enrichment fails.

### fn `function analyzeCompressFile(` (L359-454)
- @brief Analyzes one path into a structured compression file entry.
- @details Resolves path identity, performs compression, attempts supplementary symbol and Doxygen extraction, preserves stable skip or error reasons, and keeps compression success independent from symbol-analysis success. Runtime is dominated by file I/O and analyzer cost. Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
- @param[in] inputPath {string} Caller-supplied path.
- @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
- @param[in] requestIndex {number} Caller-order index.
- @param[in] baseDir {string} Base directory used for canonical path derivation.
- @param[in] includeLineNumbers {boolean} When `true`, rendered compressed text includes original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {CompressToolFileEntry} Structured file entry.

### fn `export function buildCompressToolPayload(options: BuildCompressToolPayloadOptions): CompressToolPayload` (L463-550)
- @brief Builds the full agent-oriented compression payload.
- @details Validates requested paths against the filesystem, compresses processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits repository scope metadata without echoing request facts already known to the caller. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildCompressToolPayloadOptions} Payload-construction options.
- @return {CompressToolPayload} Structured compression payload ordered as summary, repository, and files.
- @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087

### fn `export function buildCompressToolExecutionStderr(payload: CompressToolPayload): string` (L559-570)
- @brief Builds execution diagnostics for one compression payload.
- @details Serializes skipped inputs, hard compression failures, and supplementary symbol-analysis warnings into stable stderr lines while keeping successful compressed files silent. Runtime is O(n) in issue count. No side effects occur.
- @param[in] payload {CompressToolPayload} Structured compression payload.
- @return {string} Newline-delimited execution diagnostics.
- @satisfies REQ-087

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`CompressToolScope`|type||27||
|`CompressFileStatus`|type||33||
|`CompressLineNumberMode`|type||39||
|`CompressSymbolAnalysisStatus`|type||45||
|`CompressLineRange`|iface||51-55|export interface CompressLineRange|
|`CompressToolLineEntry`|iface||61-66|export interface CompressToolLineEntry|
|`CompressToolSymbolEntry`|iface||72-87|export interface CompressToolSymbolEntry extends Compress...|
|`CompressToolFileEntry`|iface||93-108|export interface CompressToolFileEntry extends CompressLi...|
|`CompressToolRequestSection`|iface||114-124|export interface CompressToolRequestSection|
|`CompressToolSummarySection`|iface||130-141|export interface CompressToolSummarySection|
|`CompressToolRepositorySection`|iface||147-150|export interface CompressToolRepositorySection|
|`CompressToolPayload`|iface||156-160|export interface CompressToolPayload|
|`BuildCompressToolPayloadOptions`|iface||166-174|export interface BuildCompressToolPayloadOptions|
|`canonicalizeCompressionPath`|fn||183-191|function canonicalizeCompressionPath(targetPath: string, ...|
|`buildLineRange`|fn||200-206|function buildLineRange(startLineNumber: number, endLineN...|
|`resolveSymbolName`|fn||214-216|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||225-234|function resolveParentElement(definitions: SourceElement[...|
|`mapCompressedLines`|fn||242-249|function mapCompressedLines(compressedLines: CompressedLi...|
|`analyzeCompressedFileSymbols`|fn||261-345|function analyzeCompressedFileSymbols(|
|`analyzeCompressFile`|fn||359-454|function analyzeCompressFile(|
|`buildCompressToolPayload`|fn||463-550|export function buildCompressToolPayload(options: BuildCo...|
|`buildCompressToolExecutionStderr`|fn||559-570|export function buildCompressToolExecutionStderr(payload:...|


---

# compress.ts | TypeScript | 475L | 14 symbols | 3 imports | 18 comments
> Path: `src/core/compress.ts`
- @brief Removes comments and redundant whitespace from source code while preserving semantic structure.
- @details Provides extension-based language detection and language-aware source compression backed by analyzer language specs. Runtime is linear in processed source size. Side effects are limited to filesystem reads in file-based helpers.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { buildLanguageSpecs } from "./source-analyzer.js";
```

## Definitions

### iface `export interface CompressedLineEntry` (L57-62)
- @brief Describes one structured compressed output line.
- @details Separates source coordinates, output order, raw compressed text, and rendered display text so downstream JSON payloads can expose line facts without reparsing prefixed strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressedSourceResult` (L68-79)
- @brief Describes one structured compression result.
- @details Exposes language identity, source line metrics, removed-line totals, structured compressed lines, and the final rendered excerpt text so CLI and agent-tool layers can share one canonical compression model. The interface is compile-time only and introduces no runtime cost.

### fn `function getSpecs()` (L86-89)
- @brief Returns the cached language specification table.
- @details Initializes the cache on first access by calling `buildLanguageSpecs`, then reuses the result for all subsequent calls. Time complexity is O(1) after cold start. Mutates module-local cache state only.
- @return {ReturnType<typeof buildLanguageSpecs>} Cached language specification map.

### fn `export function detectLanguage(filePath: string): string | undefined` (L97-99)
- @brief Infers a compression language from a file path extension.
- @details Lowercases the file extension and looks it up in `EXT_LANG_MAP`. Time complexity is O(1). No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @return {string | undefined} Canonical compression language identifier, or `undefined` when unsupported.

### fn `function countLogicalLines(content: string): number` (L107-113)
- @brief Counts logical lines in one text payload.
- @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
- @param[in] content {string} Source text.
- @return {number} Logical line count; `0` for empty content.

### fn `function isInString(line: string, pos: number, stringDelimiters: string[]): boolean` (L123-158)
- @brief Tests whether a character position falls inside a string literal.
- @details Scans the line left-to-right while tracking active string delimiters and escaped quote characters. Runtime is O(n) in inspected prefix length. No side effects occur.
- @param[in] line {string} Source line to inspect.
- @param[in] pos {number} Zero-based character position.
- @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
- @return {boolean} `true` when the position is inside a string literal.

### fn `function removeInlineComment(line: string, singleComment: string | undefined, stringDelimiters: string[]): string` (L168-208)
- @brief Removes a trailing single-line comment from a source line.
- @details Scans the line while respecting string literals so comment markers inside strings are preserved. Runtime is O(n) in line length. No external state is mutated.
- @param[in] line {string} Source line to strip.
- @param[in] singleComment {string | undefined} Language single-line comment marker.
- @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
- @return {string} Line content before the first real comment marker.

### fn `function buildCompressedLineEntry(` (L219-231)
- @brief Builds one rendered compressed line entry.
- @details Materializes both the raw compressed text and the display text that optionally prefixes the original source line number. Runtime is O(n) in line length. No side effects occur.
- @param[in] text {string} Compressed source text for one retained line.
- @param[in] sourceLineNumber {number} Original source line number.
- @param[in] compressedLineNumber {number} One-based output line number inside the compressed excerpt.
- @param[in] includeLineNumbers {boolean} When `true`, prefix the display text with the original source line number.
- @return {CompressedLineEntry} Structured compressed line entry.

### fn `function formatCompressedSourceText(entries: CompressedLineEntry[]): string` (L239-241)
- @brief Formats compressed line entries as newline-delimited text.
- @details Joins pre-rendered display lines without adding headers, fences, or other presentation artifacts. Runtime is O(n) in entry count and aggregate content length. No side effects occur.
- @param[in] entries {CompressedLineEntry[]} Structured compressed line entries.
- @return {string} Final compressed source text.

### fn `function normalizeRetainedLineIndentation(line: string, preserveIndent: boolean): string` (L250-262)
- @brief Normalizes one retained source line while preserving requested indentation semantics.
- @details Preserves the full leading whitespace prefix for indentation-significant languages and for any other line whose leading indentation contains at least one tab, while trimming leading whitespace for space-only indentation in other languages. Runtime is O(n) in line length. No external state is mutated.
- @param[in] line {string} Candidate source line after comment removal.
- @param[in] preserveIndent {boolean} Whether the language requires full indentation preservation.
- @return {string} Normalized retained line, or an empty string when no content remains.

### fn `export function compressSourceDetailed(source: string, language: string, includeLineNumbers = true): CompressedSourceResult` (L273-431)
- @brief Compresses in-memory source text into the structured compression model.
- @details Removes blank lines and comments, preserves shebangs, respects string-literal boundaries, retains full leading indentation for indentation-significant languages, preserves leading-tab indentation for other languages, and emits both structured line entries and a rendered text excerpt. Runtime is O(n) in source length. No external state is mutated.
- @param[in] source {string} Raw source text.
- @param[in] language {string} Canonical compression language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
- @return {CompressedSourceResult} Structured compression result.
- @throws {Error} Throws when the language is unsupported.

### fn `export function compressSource(source: string, language: string, includeLineNumbers = true): string` (L442-444)
- @brief Compresses in-memory source text for one language.
- @details Delegates to `compressSourceDetailed(...)` and returns only the rendered compressed source text so legacy CLI and markdown-oriented paths keep their existing behavior. Runtime is O(n) in source length. No external state is mutated.
- @param[in] source {string} Raw source text.
- @param[in] language {string} Canonical compression language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
- @return {string} Compressed source text.
- @throws {Error} Throws when the language is unsupported.

### fn `export function compressFileDetailed(filePath: string, language?: string, includeLineNumbers = true): CompressedSourceResult` (L455-462)
- @brief Compresses one source file from disk into the structured compression model.
- @details Detects the language when not supplied, reads the file as UTF-8, and delegates to `compressSourceDetailed(...)`. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] filePath {string} Source file path.
- @param[in] language {string | undefined} Optional explicit language override.
- @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
- @return {CompressedSourceResult} Structured compression result.
- @throws {Error} Throws when the language cannot be detected or the file cannot be read.

### fn `export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string` (L473-475)
- @brief Compresses one source file from disk.
- @details Delegates to `compressFileDetailed(...)` and returns only the rendered compressed source text so CLI and markdown emitters can retain their established text contract. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] filePath {string} Source file path.
- @param[in] language {string | undefined} Optional explicit language override.
- @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
- @return {string} Compressed source text.
- @throws {Error} Throws when the language cannot be detected or the file cannot be read.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`CompressedLineEntry`|iface||57-62|export interface CompressedLineEntry|
|`CompressedSourceResult`|iface||68-79|export interface CompressedSourceResult|
|`getSpecs`|fn||86-89|function getSpecs()|
|`detectLanguage`|fn||97-99|export function detectLanguage(filePath: string): string ...|
|`countLogicalLines`|fn||107-113|function countLogicalLines(content: string): number|
|`isInString`|fn||123-158|function isInString(line: string, pos: number, stringDeli...|
|`removeInlineComment`|fn||168-208|function removeInlineComment(line: string, singleComment:...|
|`buildCompressedLineEntry`|fn||219-231|function buildCompressedLineEntry(|
|`formatCompressedSourceText`|fn||239-241|function formatCompressedSourceText(entries: CompressedLi...|
|`normalizeRetainedLineIndentation`|fn||250-262|function normalizeRetainedLineIndentation(line: string, p...|
|`compressSourceDetailed`|fn||273-431|export function compressSourceDetailed(source: string, la...|
|`compressSource`|fn||442-444|export function compressSource(source: string, language: ...|
|`compressFileDetailed`|fn||455-462|export function compressFileDetailed(filePath: string, la...|
|`compressFile`|fn||473-475|export function compressFile(filePath: string, language?:...|


---

# config.ts | TypeScript | 780L | 22 symbols | 8 imports | 31 comments
> Path: `src/core/config.ts`
- @brief Loads, normalizes, and persists pi-usereq project configuration.
- @details Defines the configuration schema, default directory conventions, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi-usereq.json`.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { ReqError } from "./errors.js";
import {
import {
import {
import { normalizeEnabledPiUsereqTools } from "./pi-usereq-tools.js";
import { makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface StaticCheckEntry` (L54-58)
- @brief Describes one static-check module configuration entry.
- @details Each record identifies the checker module and optional command or parameter list used during per-language static analysis dispatch. The interface is type-only and has no runtime cost.

- type `export type StaticCheckEnabled = "enable" | "disable";` (L64)
- @brief Represents the persisted per-language static-check enable flag.
- @details Narrows persisted per-language enablement to the documented `enable|disable` domain reused by configuration loading, menu toggles, and static-check dispatch. The alias is compile-time only and introduces no runtime cost.
### iface `export interface StaticCheckLanguageConfig` (L70-73)
- @brief Describes one persisted per-language static-check configuration object.
- @details Couples the per-language enable flag with the ordered checker-entry list so menu toggles, config serialization, and execution dispatch can distinguish configured-but-disabled languages from enabled active checker lists. The interface is compile-time only and introduces no runtime cost.

### iface `export interface UseReqConfig` (L79-117)
- @brief Defines the persisted pi-usereq project configuration schema.
- @details Captures documentation paths, source/test directory selection, per-language static-check enablement and checker configuration, prompt-command worktree settings, enabled startup tools, and notification settings while excluding runtime-derived path metadata. The interface is compile-time only and introduces no runtime side effects.

### fn `function cloneStaticCheckEntry(entry: StaticCheckEntry): StaticCheckEntry` (L234-243)
- @brief Clones one static-check entry into its persisted shape.
- @details Copies only the stable module, cmd, and params fields so runtime-only or unknown metadata never leaks into persisted configuration payloads. Runtime is O(p) in parameter count. No external state is mutated.
- @param[in] entry {StaticCheckEntry} Source static-check entry.
- @return {StaticCheckEntry} Persistable static-check entry clone.

### fn `export function createStaticCheckLanguageConfig(` (L252-261)
- @brief Builds one per-language static-check configuration object.
- @details Clones the supplied checker entries, derives `enabled` from the explicit argument or checker-list emptiness, and preserves checker order for menu and dispatch determinism. Runtime is O(c + p). No external state is mutated.
- @param[in] checkers {StaticCheckEntry[]} Ordered checker entries.
- @param[in] enabled {StaticCheckEnabled | undefined} Optional explicit enable flag.
- @return {StaticCheckLanguageConfig} Normalized per-language config object.

### fn `export function getDefaultStaticCheckConfig(): Record<string, StaticCheckLanguageConfig>` (L269-274)
- @brief Returns the documented default static-check configuration.
- @details Emits one per-language config object for every supported language, enabling only languages with documented default checker entries and leaving all remaining languages disabled with empty checker lists. Runtime is O(l + c). No external state is mutated.
- @return {Record<string, StaticCheckLanguageConfig>} Fresh default static-check config.
- @satisfies REQ-249, REQ-250, REQ-251, REQ-252

### fn `export function normalizeStaticCheckEnabled(` (L284-289)
- @brief Normalizes one persisted per-language static-check enable flag.
- @details Accepts only the documented `enable|disable` values and falls back to the supplied default when the candidate is absent or invalid. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted enable flag.
- @param[in] defaultValue {StaticCheckEnabled} Fallback enable flag.
- @return {StaticCheckEnabled} Canonical per-language enable flag.
- @satisfies REQ-249

### fn `export function getActiveStaticCheckEntries(` (L299-308)
- @brief Resolves the active checker list for one language.
- @details Returns the persisted checker list only when the language is enabled; disabled or missing languages yield an empty list without mutating the source config. Runtime is O(c). No external state is mutated.
- @param[in] staticCheckConfig {Record<string, StaticCheckLanguageConfig>} Effective static-check config.
- @param[in] language {string} Canonical language name.
- @return {StaticCheckEntry[]} Active checker list for the language.
- @satisfies REQ-019

### fn `export function normalizeAutoGitCommit(value: unknown): "enable" | "disable"` (L323-325)
- @brief Normalizes one persisted automatic git-commit mode value.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_AUTO_GIT_COMMIT` for all other payloads. Runtime is O(1). No side effects occur.
- @param[in] value {unknown} Candidate persisted automatic git-commit payload.
- @return {"enable" | "disable"} Canonical automatic git-commit mode.
- @satisfies REQ-212

### fn `export function normalizeGitWorktreeEnabled(value: unknown): "enable" | "disable"` (L339-341)
- @brief Normalizes one persisted worktree-enable flag value.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_GIT_WORKTREE_ENABLED` for all other payloads. Runtime is O(1). No side effects occur.
- @param[in] value {unknown} Candidate persisted worktree-enable payload.
- @return {"enable" | "disable"} Canonical persisted worktree-enable mode.
- @satisfies REQ-204

### fn `export function resolveEffectiveGitWorktreeEnabled(` (L350-355)
- @brief Resolves the effective worktree mode after automatic-commit policy is applied.
- @details Forces `disable` whenever `AUTO_GIT_COMMIT` is disabled; otherwise preserves the normalized persisted worktree flag. Runtime is O(1). No side effects occur.
- @param[in] autoGitCommit {"enable" | "disable"} Effective automatic git-commit mode.
- @param[in] gitWorktreeEnabled {"enable" | "disable"} Normalized persisted worktree-enable mode.
- @return {"enable" | "disable"} Effective worktree mode used by menus, persistence, and prompt execution.
- @satisfies REQ-204, REQ-215

### fn `export function normalizeGitWorktreePrefix(value: unknown): string` (L369-375)
- @brief Normalizes one persisted worktree-name prefix value.
- @details Accepts only non-empty strings, trims surrounding whitespace, and falls back to `DEFAULT_GIT_WORKTREE_PREFIX` when the candidate is absent or blank. Runtime is O(n) in prefix length. No side effects occur.
- @param[in] value {unknown} Candidate persisted prefix payload.
- @return {string} Canonical worktree-name prefix.
- @satisfies REQ-205

### fn `export function getProjectConfigPath(projectBase: string): string` (L382-384)
- @brief Computes the per-project config file path.
- @details Joins the project base with `.pi-usereq.json`, producing the canonical persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {string} Absolute config file path.

### fn `export function getDefaultConfig(_projectBase: string): UseReqConfig` (L393-433)
- @brief Builds the default project configuration.
- @details Populates canonical docs/test/source directories, documented per-language static-check defaults, default prompt-command worktree settings, default debug fields including dedicated workflow-event logging, the default startup tool set, default command-notify, sound, and Pushover fields, and excludes runtime-derived path metadata. Time complexity is O(n) in default selector count plus default static-check entry count. No filesystem side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Fresh default configuration object.
- @satisfies CTN-001, CTN-012, CTN-013, REQ-066, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-250, REQ-251, REQ-252, REQ-277

### fn `function normalizeStaticCheckEntries(value: unknown): StaticCheckEntry[]` (L441-461)
- @brief Normalizes one raw checker-entry array from persisted config.
- @details Accepts only object entries with a non-empty module string, trims optional command text, filters blank params, and drops malformed records without applying any legacy schema migrations. Runtime is O(c + p). No external state is mutated.
- @param[in] value {unknown} Candidate persisted checker array.
- @return {StaticCheckEntry[]} Normalized checker-entry vector.

### fn `function normalizeStaticCheckConfig(` (L470-489)
- @brief Normalizes the persisted per-language static-check configuration map.
- @details Accepts only object-valued language entries using the new `{ enabled, checkers }` schema, normalizes missing or invalid `enabled` values from checker-list presence, and drops malformed or legacy non-object language payloads without migration. Runtime is O(l + c + p). No external state is mutated.
- @param[in] value {unknown} Candidate persisted static-check payload.
- @return {Record<string, StaticCheckLanguageConfig>} Normalized per-language static-check map.
- @satisfies REQ-249

### fn `export function loadConfig(projectBase: string): UseReqConfig` (L499-618)
- @brief Loads and sanitizes the persisted project configuration.
- @details Returns defaults when the config file does not exist. Otherwise parses JSON, validates directory and per-language static-check object shapes, normalizes enabled tool names plus prompt-command worktree, debug, notify, sound, and Pushover fields including dedicated workflow-event logging, preserves non-empty template text verbatim, forces the effective worktree mode off when automatic git commit is disabled, forces effective Pushover disablement until both credentials are populated, applies documented per-flag defaults for missing payloads, and ignores removed, malformed, or runtime-derived path metadata without legacy schema migration. Runtime is O(n) in config size. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Sanitized effective configuration.
- @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.
- @satisfies CTN-012, CTN-013, REQ-066, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-215, REQ-234, REQ-235, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-277

### fn `function buildPersistedConfig(config: UseReqConfig): UseReqConfig` (L627-687)
- @brief Builds the persisted configuration payload that excludes runtime-derived fields.
- @details Copies only the canonical persisted configuration keys into a fresh object so runtime-derived metadata such as `base-path` and `git-path` can never be written to disk, serializes per-language static-check objects with key order `enabled` then `checkers`, normalizes `GIT_WORKTREE_PREFIX` plus debug fields including dedicated workflow-event logging, forces persisted worktree disablement when automatic git commit is disabled, forces persisted Pushover disablement until both credentials are populated, and preserves the remaining notification and Pushover settings. Runtime is O(n) in config size. No external state is mutated.
- @param[in] config {UseReqConfig} Effective configuration object.
- @return {UseReqConfig} Persistable configuration payload.
- @satisfies CTN-012, CTN-013, REQ-146, REQ-163, REQ-204, REQ-205, REQ-212, REQ-215, REQ-234, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-277

### fn `export function saveConfig(projectBase: string, config: UseReqConfig): void` (L697-701)
- @brief Persists the project configuration to disk.
- @details Creates the base directory path when necessary, strips runtime-derived fields from the serialized payload, and writes formatted JSON terminated by a newline to `.pi-usereq.json`. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to persist.
- @return {void} No return value.
- @satisfies CTN-012, REQ-146

### fn `export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig` (L710-728)
- @brief Normalizes persisted directory fields to project-relative forms.
- @details Rewrites docs, tests, and source directories using project containment heuristics, strips trailing separators, and restores defaults for empty results. Runtime is O(n) in configured path count plus path-length processing. No filesystem writes occur.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to normalize.
- @return {UseReqConfig} Normalized configuration copy.

### fn `export function buildPromptReplacementPaths(` (L738-780)
- @brief Builds placeholder replacements for bundled prompt rendering.
- @details Computes runtime path context from the execution path, derives installation-owned template and guideline paths, enumerates visible guideline files from the installed resource tree, and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {Record<string, string>} Placeholder-to-string replacement map including runtime path tokens.
- @satisfies REQ-002, REQ-103, REQ-106, REQ-107, CTN-011

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckEntry`|iface||54-58|export interface StaticCheckEntry|
|`StaticCheckEnabled`|type||64||
|`StaticCheckLanguageConfig`|iface||70-73|export interface StaticCheckLanguageConfig|
|`UseReqConfig`|iface||79-117|export interface UseReqConfig|
|`cloneStaticCheckEntry`|fn||234-243|function cloneStaticCheckEntry(entry: StaticCheckEntry): ...|
|`createStaticCheckLanguageConfig`|fn||252-261|export function createStaticCheckLanguageConfig(|
|`getDefaultStaticCheckConfig`|fn||269-274|export function getDefaultStaticCheckConfig(): Record<str...|
|`normalizeStaticCheckEnabled`|fn||284-289|export function normalizeStaticCheckEnabled(|
|`getActiveStaticCheckEntries`|fn||299-308|export function getActiveStaticCheckEntries(|
|`normalizeAutoGitCommit`|fn||323-325|export function normalizeAutoGitCommit(value: unknown): "...|
|`normalizeGitWorktreeEnabled`|fn||339-341|export function normalizeGitWorktreeEnabled(value: unknow...|
|`resolveEffectiveGitWorktreeEnabled`|fn||350-355|export function resolveEffectiveGitWorktreeEnabled(|
|`normalizeGitWorktreePrefix`|fn||369-375|export function normalizeGitWorktreePrefix(value: unknown...|
|`getProjectConfigPath`|fn||382-384|export function getProjectConfigPath(projectBase: string)...|
|`getDefaultConfig`|fn||393-433|export function getDefaultConfig(_projectBase: string): U...|
|`normalizeStaticCheckEntries`|fn||441-461|function normalizeStaticCheckEntries(value: unknown): Sta...|
|`normalizeStaticCheckConfig`|fn||470-489|function normalizeStaticCheckConfig(|
|`loadConfig`|fn||499-618|export function loadConfig(projectBase: string): UseReqCo...|
|`buildPersistedConfig`|fn||627-687|function buildPersistedConfig(config: UseReqConfig): UseR...|
|`saveConfig`|fn||697-701|export function saveConfig(projectBase: string, config: U...|
|`normalizeConfigPaths`|fn||710-728|export function normalizeConfigPaths(projectBase: string,...|
|`buildPromptReplacementPaths`|fn||738-780|export function buildPromptReplacementPaths(|


---

# debug-runtime.ts | TypeScript | 542L | 26 symbols | 5 imports | 36 comments
> Path: `src/core/debug-runtime.ts`
- @brief Declares debug inventories, normalizers, and JSON log persistence helpers.
- @details Centralizes debug-menu selector inventories, config-field normalization, workflow-status gating, and append-only JSON log writing for tool, prompt, and dedicated workflow debug events. Runtime is dominated by JSON serialization plus filesystem I/O during log writes. Side effects include directory creation and file overwrite when debug entries are appended.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import type { UseReqConfig } from "./config.js";
import {
import {
```

## Definitions

- type `export type DebugToolName =` (L59)
- @brief Represents one valid debug-enabled tool selector.
- @details Combines extension-owned tool names and supported embedded builtin tool names into one compile-time selector domain. The alias introduces no runtime cost.
- type `export type DebugPromptName = `req-${PromptCommandName}`;` (L67)
- @brief Represents one valid debug-enabled prompt selector.
- @details Restricts prompt debug toggles to invokable bundled `req-*` slash-command names derived from `PROMPT_COMMAND_NAMES`. The alias introduces no runtime cost.
- type `export type DebugWorkflowState =` (L85)
- @brief Represents one workflow-state value used by debug gating and payloads.
- @details Extends the documented prompt workflow states with `unknown` for callers that cannot recover a concrete state. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugStatusChanges = "enable" | "disable";` (L93)
- @brief Represents one persisted workflow-transition logging flag.
- @details Restricts `workflow_state` emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugWorkflowEvents = "enable" | "disable";` (L99)
- @brief Represents one persisted dedicated workflow-event logging flag.
- @details Restricts session-activation, restoration, closure, and shutdown workflow-event emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugLogOnStatus = "any" | (typeof DEBUG_WORKFLOW_STATES)[number];` (L105)
- @brief Represents one persisted workflow-status filter value.
- @details Restricts debug log filtering to `any` or one explicit documented workflow state. The alias is compile-time only and introduces no runtime cost.
### iface `export interface DebugLogEntry` (L111-120)
- @brief Describes one append-only JSON debug log entry.
- @details Stores a timestamped tool or prompt event with workflow-state context plus optional input, result, and error metadata. The interface is compile-time only and introduces no runtime cost.

### fn `export function normalizeDebugEnabled(value: unknown): "enable" | "disable"` (L153-155)
- @brief Normalizes one persisted debug enable flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_ENABLED` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-enable payload.
- @return {"enable" | "disable"} Canonical debug-enable value.
- @satisfies REQ-236

### fn `export function normalizeDebugLogFile(value: unknown): string` (L164-170)
- @brief Normalizes one persisted debug log file value.
- @details Accepts only non-empty strings, trims surrounding whitespace, and falls back to `DEFAULT_DEBUG_LOG_FILE` when the candidate is absent or blank. Runtime is O(n) in path length. No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-log file payload.
- @return {string} Canonical debug-log file value.
- @satisfies REQ-237

### fn `export function normalizeDebugStatusChanges(value: unknown): DebugStatusChanges` (L179-181)
- @brief Normalizes one persisted workflow-transition logging flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_STATUS_CHANGES` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted workflow-transition logging payload.
- @return {DebugStatusChanges} Canonical workflow-transition logging flag.
- @satisfies REQ-254

### fn `export function normalizeDebugWorkflowEvents(value: unknown): DebugWorkflowEvents` (L190-192)
- @brief Normalizes one persisted dedicated workflow-event logging flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_WORKFLOW_EVENTS` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted workflow-event logging payload.
- @return {DebugWorkflowEvents} Canonical workflow-event logging flag.
- @satisfies REQ-277

### fn `export function normalizeDebugLogOnStatus(value: unknown): DebugLogOnStatus` (L201-208)
- @brief Normalizes one persisted debug workflow-status filter.
- @details Accepts only the documented `any` token or one explicit workflow state and falls back to `DEFAULT_DEBUG_LOG_ON_STATUS` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug workflow-status filter.
- @return {DebugLogOnStatus} Canonical debug workflow-status filter.
- @satisfies REQ-238

### fn `export function normalizeDebugEnabledTools(value: unknown): DebugToolName[]` (L217-225)
- @brief Normalizes one persisted debug-tool selector array.
- @details Filters to string entries, discards unknown tool names, deduplicates while preserving first-seen order, and returns an empty array for non-array payloads. Runtime is O(n). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-tool selector payload.
- @return {DebugToolName[]} Deduplicated canonical debug-tool selectors.
- @satisfies REQ-239, REQ-242

### fn `export function normalizeDebugEnabledPrompts(value: unknown): DebugPromptName[]` (L234-242)
- @brief Normalizes one persisted debug-prompt selector array.
- @details Filters to string entries, discards unknown `req-*` names, deduplicates while preserving first-seen order, and returns an empty array for non-array payloads. Runtime is O(n). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-prompt selector payload.
- @return {DebugPromptName[]} Deduplicated canonical debug-prompt selectors.
- @satisfies REQ-239, REQ-243

### fn `export function getDebugPromptName(promptName: PromptCommandName): DebugPromptName` (L250-252)
- @brief Resolves the canonical debug prompt selector for one bundled prompt.
- @details Reuses the shared prompt-command formatter so prompt-runtime and extension hook logging can target the same `DEBUG_ENABLED_PROMPTS` domain as the configuration menu. Runtime is O(n) in prompt-name length. No external state is mutated.
- @param[in] promptName {PromptCommandName} Canonical bundled prompt name.
- @return {DebugPromptName} Canonical debug prompt selector.

### fn `export function matchesDebugWorkflowState(` (L262-267)
- @brief Tests whether one debug workflow-state filter matches the current state.
- @details Treats `any` as an unconditional pass-through and otherwise requires `workflowState` to equal the configured explicit workflow state. Runtime is O(1). No external state is mutated.
- @param[in] logOnStatus {DebugLogOnStatus} Persisted debug workflow-state filter.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @return {boolean} `true` when the entry should be emitted for the supplied state.
- @satisfies REQ-247

### fn `export function resolveDebugLogPath(projectBase: string, config: UseReqConfig): string` (L277-282)
- @brief Resolves the absolute debug log file path for one project base.
- @details Preserves absolute configured paths and otherwise resolves relative values against the original project base so prompt-worktree cleanup cannot discard accumulated debug evidence. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Absolute debug log path.
- @satisfies REQ-237

### fn `export function shouldLogDebugTool(` (L293-301)
- @brief Tests whether one tool execution should be appended to the debug log.
- @details Requires global debug enablement, membership in `DEBUG_ENABLED_TOOLS`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] toolName {string} Executed tool name.
- @return {boolean} `true` when the tool execution should be logged.
- @satisfies REQ-242, REQ-246, REQ-247

### fn `export function shouldLogDebugPrompt(` (L312-320)
- @brief Tests whether one prompt event should be appended to the debug log.
- @details Requires global debug enablement, membership in `DEBUG_ENABLED_PROMPTS`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @return {boolean} `true` when the prompt event should be logged.
- @satisfies REQ-243, REQ-246, REQ-247

### fn `export function shouldLogDebugPromptWorkflowState(` (L331-338)
- @brief Tests whether one prompt workflow-state transition should be appended to the debug log.
- @details Requires global debug enablement, prompt-selector membership, explicit `DEBUG_STATUS_CHANGES=enable`, and a matching post-transition workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Post-transition workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @return {boolean} `true` when the prompt workflow-state entry should be logged.
- @satisfies REQ-246, REQ-247, REQ-255

### fn `export function shouldLogDebugPromptWorkflowEvent(` (L349-356)
- @brief Tests whether one dedicated prompt workflow event should be appended to the debug log.
- @details Requires global debug enablement, prompt-selector membership, explicit `DEBUG_WORKFLOW_EVENTS=enable`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @return {boolean} `true` when the dedicated workflow event should be logged.
- @satisfies REQ-245, REQ-246, REQ-247, REQ-277

### fn `function normalizeDebugValue(value: unknown): unknown` (L364-392)
- @brief Serializes arbitrary debug payloads into deterministic JSON-compatible values.
- @details Converts `Error` instances into structured records, elides functions, stringifies bigint values, and falls back to a best-effort string when JSON serialization fails. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] value {unknown} Arbitrary debug payload.
- @return {unknown} JSON-compatible debug payload.

### fn `function appendDebugLogEntry(` (L402-427)
- @brief Appends one normalized debug log entry to the configured JSON log file.
- @details Loads the existing JSON array when present, falls back to an empty array for missing or invalid files, appends the normalized entry, and rewrites the full file with a trailing newline. Runtime is dominated by JSON parse plus serialization and filesystem I/O. Side effects include directory creation and file overwrite.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] entry {DebugLogEntry} Candidate debug log entry.
- @return {boolean} `true` when the entry is written successfully; `false` when filesystem writing fails.

### fn `export function logDebugToolExecution(` (L442-464)
- @brief Appends one tool-execution debug entry when the current config enables it.
- @details Applies tool-selector and workflow-state gating before serializing the executed tool input, final result payload, and error flag into the configured JSON log file. Runtime is dominated by JSON serialization plus filesystem I/O when enabled and O(n) in selector count otherwise. Side effects include directory creation and file overwrite only for enabled matching entries.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] toolName {string} Executed tool name.
- @param[in] input {unknown} Final executed tool input.
- @param[in] result {unknown} Final tool result payload.
- @param[in] isError {boolean} Final tool error flag.
- @return {boolean} `true` when the tool entry is written; otherwise `false`.
- @satisfies REQ-244, REQ-246, REQ-247

### fn `export function logDebugPromptEvent(` (L480-503)
- @brief Appends one prompt debug entry when the current config enables it.
- @details Applies prompt-selector and workflow-state gating before serializing the supplied action payload into the configured JSON log file. Runtime is dominated by JSON serialization plus filesystem I/O when enabled and O(n) in selector count otherwise. Side effects include directory creation and file overwrite only for enabled matching entries.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] action {string} Prompt debug action identifier.
- @param[in] input {unknown} Optional prompt debug input payload.
- @param[in] result {unknown} Optional prompt debug result payload.
- @param[in] isError {boolean} Optional prompt debug error flag.
- @return {boolean} `true` when the prompt entry is written; otherwise `false`.
- @satisfies REQ-245, REQ-246, REQ-247

### fn `export function logDebugPromptWorkflowEvent(` (L519-542)
- @brief Appends one dedicated prompt workflow debug entry when the current config enables it.
- @details Applies prompt-selector, workflow-event-flag, and workflow-state gating before serializing session-activation, restoration, closure, or shutdown workflow payloads into the configured JSON log file. Runtime is dominated by JSON serialization plus filesystem I/O when enabled and O(n) in selector count otherwise. Side effects include directory creation and file overwrite only for enabled matching entries.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] action {string} Dedicated prompt workflow action identifier.
- @param[in] input {unknown} Optional workflow debug input payload.
- @param[in] result {unknown} Optional workflow debug result payload.
- @param[in] isError {boolean} Optional workflow debug error flag.
- @return {boolean} `true` when the workflow entry is written; otherwise `false`.
- @satisfies REQ-245, REQ-246, REQ-247, REQ-277

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`DebugToolName`|type||59||
|`DebugPromptName`|type||67||
|`DebugWorkflowState`|type||85||
|`DebugStatusChanges`|type||93||
|`DebugWorkflowEvents`|type||99||
|`DebugLogOnStatus`|type||105||
|`DebugLogEntry`|iface||111-120|export interface DebugLogEntry|
|`normalizeDebugEnabled`|fn||153-155|export function normalizeDebugEnabled(value: unknown): "e...|
|`normalizeDebugLogFile`|fn||164-170|export function normalizeDebugLogFile(value: unknown): st...|
|`normalizeDebugStatusChanges`|fn||179-181|export function normalizeDebugStatusChanges(value: unknow...|
|`normalizeDebugWorkflowEvents`|fn||190-192|export function normalizeDebugWorkflowEvents(value: unkno...|
|`normalizeDebugLogOnStatus`|fn||201-208|export function normalizeDebugLogOnStatus(value: unknown)...|
|`normalizeDebugEnabledTools`|fn||217-225|export function normalizeDebugEnabledTools(value: unknown...|
|`normalizeDebugEnabledPrompts`|fn||234-242|export function normalizeDebugEnabledPrompts(value: unkno...|
|`getDebugPromptName`|fn||250-252|export function getDebugPromptName(promptName: PromptComm...|
|`matchesDebugWorkflowState`|fn||262-267|export function matchesDebugWorkflowState(|
|`resolveDebugLogPath`|fn||277-282|export function resolveDebugLogPath(projectBase: string, ...|
|`shouldLogDebugTool`|fn||293-301|export function shouldLogDebugTool(|
|`shouldLogDebugPrompt`|fn||312-320|export function shouldLogDebugPrompt(|
|`shouldLogDebugPromptWorkflowState`|fn||331-338|export function shouldLogDebugPromptWorkflowState(|
|`shouldLogDebugPromptWorkflowEvent`|fn||349-356|export function shouldLogDebugPromptWorkflowEvent(|
|`normalizeDebugValue`|fn||364-392|function normalizeDebugValue(value: unknown): unknown|
|`appendDebugLogEntry`|fn||402-427|function appendDebugLogEntry(|
|`logDebugToolExecution`|fn||442-464|export function logDebugToolExecution(|
|`logDebugPromptEvent`|fn||480-503|export function logDebugPromptEvent(|
|`logDebugPromptWorkflowEvent`|fn||519-542|export function logDebugPromptWorkflowEvent(|


---

# doxygen-parser.ts | TypeScript | 318L | 13 symbols | 0 imports | 19 comments
> Path: `src/core/doxygen-parser.ts`
- @brief Parses repository-approved Doxygen tags and renders them as markdown bullets.
- @details Implements a constrained Doxygen grammar used by the source analyzer and construct finder. Parsing cost is linear in comment length. The module is pure and performs no I/O.

## Definitions

- type `export type DoxygenFieldMap = Record<string, string[]>;` (L62)
- @brief Represents parsed Doxygen fields grouped by normalized tag name.
- @details Each key maps to one or more textual payloads because the same tag may appear multiple times in a single comment. The alias is compile-time only and adds no runtime cost.
- type `export type StructuredDoxygenParamDirection = "in" | "out" | "in,out" | "unspecified";` (L68)
- @brief Enumerates supported structured parameter directions.
- @details Normalizes `
- @param ` direction modifiers into one small closed set so agents can branch on parameter flow without reparsing raw tag names. The alias is compile-time only and introduces no runtime cost.
### iface `export interface StructuredDoxygenParameterEntry` (L74-80)
- @brief Describes one structured Doxygen parameter field.
- @details Separates parameter direction, optional parameter name, optional declared type, and residual text so agents can access argument contracts without reparsing monolithic tag strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StructuredDoxygenFields` (L86-101)
- @brief Describes the structured Doxygen field contract used by LLM-oriented JSON payloads.
- @details Converts repeated raw tag strings into tag-specific arrays and specialized parameter records while keeping unsplittable residual text local to the affected field. The interface is compile-time only and introduces no runtime cost.

### fn `export function parseDoxygenComment(commentText: string): DoxygenFieldMap` (L109-142)
- @brief Parses repository-approved Doxygen fields from one comment block.
- @details Normalizes line endings, strips comment delimiters, locates supported tags, and accumulates tag payloads in declaration order. Unsupported content is ignored. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentText {string} Raw comment text including delimiters.
- @return {DoxygenFieldMap} Parsed tag payloads keyed by normalized tag name.

### fn `export function stripCommentDelimiters(text: string): string` (L150-166)
- @brief Removes language comment delimiters from raw comment text.
- @details Drops standalone opening and closing markers, strips leading comment prefixes on each line, and preserves semantic payload lines only. Runtime is O(n) in line count. No external state is mutated.
- @param[in] text {string} Raw comment text.
- @return {string} Cleaned multi-line payload without delimiter syntax.

### fn `export function normalizeWhitespace(text: string): string` (L174-190)
- @brief Collapses redundant whitespace while preserving paragraph boundaries.
- @details Converts repeated spaces to single spaces, trims each line, and reduces multiple blank lines to one blank separator. Runtime is O(n) in text length. No side effects occur.
- @param[in] text {string} Input text to normalize.
- @return {string} Canonically spaced text.

### fn `export function formatDoxygenFieldsAsMarkdown(doxygenFields: DoxygenFieldMap): string[]` (L198-207)
- @brief Serializes parsed Doxygen fields into markdown bullet lines.
- @details Iterates over `DOXYGEN_TAGS` in canonical order and emits one `- @tag value` line for every stored payload. Runtime is O(t + v) where t is tag count and v is total values. No side effects occur.
- @param[in] doxygenFields {DoxygenFieldMap} Parsed Doxygen field map.
- @return {string[]} Ordered markdown bullet lines.

### fn `export function countDoxygenFieldValues(doxygenFields: DoxygenFieldMap): number` (L215-217)
- @brief Counts the total number of parsed Doxygen field values.
- @details Sums the value-array lengths across all tags so payload builders can expose aggregate Doxygen density as a numeric fact. Runtime is O(t) in tag count. No side effects occur.
- @param[in] doxygenFields {DoxygenFieldMap} Parsed Doxygen fields.
- @return {number} Total stored Doxygen value count.

### fn `function structureDoxygenParameterValue(value: string, direction: StructuredDoxygenParamDirection): StructuredDoxygenParameterEntry` (L226-228)
- @brief Parses one raw Doxygen parameter value into structured fields.
- @details Supports the repository-preferred `name {type} description` form, the alternate `{type} name description` form, and a residual-text fallback when no safe split is possible. Runtime is O(n) in value length. No side effects occur.
- @param[in] value {string} Raw Doxygen parameter value.
- @param[in] direction {StructuredDoxygenParamDirection} Normalized parameter direction.
- @return {StructuredDoxygenParameterEntry} Structured parameter record.

### fn `function splitCommaSeparatedDoxygenValues(values: string[] | undefined): string[]` (L264-269)
- @brief Splits comma-delimited Doxygen value strings into normalized items.
- @details Trims surrounding whitespace, drops empty segments, and preserves original declaration order. Runtime is O(n) in aggregate text length. No side effects occur.
- @param[in] values {string[] | undefined} Raw Doxygen value strings.
- @return {string[]} Normalized item list.

### fn `function extractSatisfiedRequirementIds(values: string[] | undefined): string[]` (L277-280)
- @brief Extracts normalized requirement IDs from raw `
- @details Matches repository requirement ID prefixes directly from the raw value text so agents receive requirement links as a dedicated string array. Runtime is O(n) in aggregate text length. No side effects occur.
- @param[in] values {string[] | undefined} Raw `
- @return {string[]} Normalized requirement IDs in declaration order.
- @satisfies ` values.
- @satisfies ` values.

### fn `export function structureDoxygenFields(doxygenFields: DoxygenFieldMap): StructuredDoxygenFields` (L289-318)
- @brief Converts raw parsed Doxygen fields into the structured JSON contract.
- @details Reorders raw tags into tag-specific arrays, structures parameter fields, normalizes `
- @param[in] doxygenFields {DoxygenFieldMap} Raw parsed Doxygen field map.
- @return {StructuredDoxygenFields} Structured Doxygen fields.
- @see ` aliases, and extracts requirement IDs from `
- @satisfies `. Runtime is O(t + v) where t is tag count and v is total value count. No side effects occur.
- @satisfies REQ-078

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`DoxygenFieldMap`|type||62||
|`StructuredDoxygenParamDirection`|type||68||
|`StructuredDoxygenParameterEntry`|iface||74-80|export interface StructuredDoxygenParameterEntry|
|`StructuredDoxygenFields`|iface||86-101|export interface StructuredDoxygenFields|
|`parseDoxygenComment`|fn||109-142|export function parseDoxygenComment(commentText: string):...|
|`stripCommentDelimiters`|fn||150-166|export function stripCommentDelimiters(text: string): string|
|`normalizeWhitespace`|fn||174-190|export function normalizeWhitespace(text: string): string|
|`formatDoxygenFieldsAsMarkdown`|fn||198-207|export function formatDoxygenFieldsAsMarkdown(doxygenFiel...|
|`countDoxygenFieldValues`|fn||215-217|export function countDoxygenFieldValues(doxygenFields: Do...|
|`structureDoxygenParameterValue`|fn||226-228|function structureDoxygenParameterValue(value: string, di...|
|`splitCommaSeparatedDoxygenValues`|fn||264-269|function splitCommaSeparatedDoxygenValues(values: string[...|
|`extractSatisfiedRequirementIds`|fn||277-280|function extractSatisfiedRequirementIds(values: string[] ...|
|`structureDoxygenFields`|fn||289-318|export function structureDoxygenFields(doxygenFields: Dox...|


---

# errors.ts | TypeScript | 31L | 1 symbols | 0 imports | 4 comments
> Path: `src/core/errors.ts`
- @brief Defines the repository-specific error class used by CLI and extension workflows.
- @details Centralizes deterministic failure signaling by pairing an error message with a numeric exit code. The module is pure and performs no I/O. Access complexity is O(1).

## Definitions

### class `export class ReqError extends Error` : Error (L11-31)
- @brief Represents a useReq failure with a stable numeric exit code.
- @brief Stores the process-style exit code associated with the failure.
- @details Extends `Error` so callers can propagate human-readable diagnostics together with process-style status codes. Construction and property access are O(1). State mutation is limited to the created instance.
- @details Downstream CLI and extension handlers read this field to decide the final command status. Access complexity is O(1). The field is assigned during construction.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ReqError`|class||11-31|export class ReqError extends Error|


---

# extension-status.ts | TypeScript | 823L | 43 symbols | 5 imports | 45 comments
> Path: `src/core/extension-status.ts`
- @brief Tracks pi-usereq extension status state and renders status-bar telemetry.
- @details Centralizes hook interception, context-usage snapshots, active-branch lookup, run timing, and deterministic status-bar formatting for the pi-usereq extension. Runtime
is O(1) per event plus interval-driven re-renders while a prompt remains
active. Side effects are limited to in-memory state mutation and interval
scheduling through exported controller helpers.

## Imports
```
import type {
import type { UseReqConfig } from "./config.js";
import type { PromptCommandExecutionPlan } from "./prompt-command-runtime.js";
import {
import { resolveRuntimeGitBranchName } from "./runtime-project-paths.js";
```

## Definitions

- type `type StatusForegroundColor = Extract<` (L30)
- @brief Enumerates the CLI-supported theme tokens consumed by status rendering.
- @details Restricts the status formatter to documented pi theme tokens so the
status bar remains compatible with the active CLI theme schema. Compile-time
only and introduces no runtime cost.
### iface `interface RawStatusTheme` (L40-42)
- @brief Describes the raw theme capabilities required for status rendering.
- @details Accepts the `ctx.ui.theme` foreground renderer used by the
single-line footer. Compile-time only and introduces no runtime cost.

### iface `interface StatusThemeAdapter` (L50-55)
- @brief Describes the normalized theme adapter used by status formatters.
- @details Exposes deterministic label, value, foreground, and separator
renderers so status text generation stays independent from the raw theme API.
Compile-time only and introduces no runtime cost.

- type `export type PiUsereqStatusHookName = (typeof PI_USEREQ_STATUS_HOOK_NAMES)[number];` (L98)
- @brief Represents one hook name handled by the pi-usereq status controller.
- @details Narrows hook registration and event-update calls to the canonical
intercepted-hook set. Compile-time only and introduces no runtime cost.
- type `export type PiUsereqPromptRequest = PromptCommandExecutionPlan;` (L104)
- @brief Describes one prompt request tracked across extension command delivery and runtime execution.
- @details Reuses the prepared prompt-command execution plan so status rendering and prompt-end side effects can recover the original project base, active execution base, and optional worktree metadata for the current prompt run. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqWorkflowState = "idle" | "checking" | "running" | "merging" | "error";` (L110)
- @brief Represents one prompt-orchestration workflow state displayed in the status bar.
- @details Narrows workflow tracking to the documented `idle`, `checking`, `running`, `merging`, and `error` states reused by prompt-command gating, prompt-end orchestration, and status rendering. Compile-time only and introduces no runtime cost.
### iface `export interface PiUsereqStatusState` (L116-124)
- @brief Stores the mutable runtime facts displayed by the status bar.
- @details Persists the prompt-orchestration workflow state, the latest context-usage snapshot, the active run start timestamp, the most recent normally completed run duration, the accumulated duration of all normally completed runs, and prompt-request metadata carried from command dispatch into the next runtime execution. Runtime state is mutated in-place by controller helpers. Compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqStatusController` (L133-138)
- @brief Stores the controller state required for event-driven status updates.
- @details Keeps the mutable status snapshot, the current configuration, the
latest extension context used for rendering, and the interval handle used
for live elapsed-time refreshes. Compile-time only and introduces no runtime
cost.

### iface `interface PiUsereqStatusPersistenceStore` (L144-147)
- @brief Stores the process-scoped elapsed-timer snapshot reused across session replacement.
- @details Preserves only the latest completed duration and accumulated completed runtime so `/new`, `/resume`, and `/fork` can restore elapsed counters after the extension runtime is rebound. Compile-time only and introduces no runtime cost.

### fn `function getPiUsereqStatusPersistenceStore(): PiUsereqStatusPersistenceStore` (L161-170)
- @brief Returns the process-scoped elapsed-timer persistence store.
- @details Lazily initializes one internal `globalThis` record because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, but the hosting process persists across those operations. Runtime is O(1). Side effect: initializes internal process-scoped state on first access.
- @return {PiUsereqStatusPersistenceStore} Mutable persistence record.
- @note Design rationale: required to preserve elapsed counters across session replacement without writing session-global menu state into project configuration.

### fn `function restorePersistedElapsedState(state: PiUsereqStatusState): void` (L178-182)
- @brief Restores persisted elapsed counters into one mutable status snapshot.
- @details Copies the process-scoped last-run and accumulated completed durations into the supplied controller state so rebinding events can continue showing prior counters. Runtime is O(1). Side effect: mutates `state`.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.

### fn `function persistElapsedState(state: PiUsereqStatusState): void` (L190-194)
- @brief Persists elapsed counters from one mutable status snapshot.
- @details Copies the current last-run and accumulated completed durations into the process-scoped store so later extension instances can restore them after session replacement. Runtime is O(1). Side effect: mutates internal process-scoped state.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @return {void} No return value.

### fn `function persistPromptCommandState(state: PiUsereqStatusState): void` (L202-208)
- @brief Mirrors one controller prompt state into the process-scoped persistence store.
- @details Persists the current workflow state plus the pending and active prompt execution plans so prompt orchestration can survive session replacement. Runtime is O(1). Side effect: mutates process-scoped prompt-command persistence state.
- @param[in] state {PiUsereqStatusState} Current controller state snapshot.
- @return {void} No return value.

### fn `export function shouldPreservePromptCommandStateOnShutdown(state: PiUsereqStatusState): boolean` (L217-220)
- @brief Detects whether `session_shutdown` must preserve prompt-command state.
- @details Keeps both the in-memory controller prompt state and the process-scoped prompt execution plan intact while pi switches from the original session into the forked execution session, because the old extension instance can keep running the initiating command handler after `session_shutdown` fires and before the replacement session fully takes over. Runtime is O(1). No external state is mutated.
- @param[in] state {PiUsereqStatusState} Controller state before shutdown mutation.
- @return {boolean} `true` when prompt-command state must survive the shutdown event.
- @satisfies REQ-278

### fn `function restorePersistedPromptCommandState(` (L229-240)
- @brief Restores prompt-command persistence into one fresh controller when the active session matches.
- @details Rehydrates workflow state plus pending or active prompt execution plans only when the current session file targets the persisted execution session created for prompt orchestration. Runtime is O(1). Side effect: mutates `state` when persisted prompt state is available.
- @param[in] sessionFile {string | undefined} Current active session file.
- @param[in,out] state {PiUsereqStatusState} Mutable controller state.
- @return {void} No return value.

### fn `function getContextSessionFile(ctx: ExtensionContext): string | undefined` (L248-252)
- @brief Resolves the active session file exposed by one extension context.
- @details Reads the session-manager session-file getter when available so prompt-command persistence can be resynchronized on every lifecycle hook after session replacement. Runtime is O(1). No external state is mutated.
- @param[in] ctx {ExtensionContext} Active extension context.
- @return {string | undefined} Current session file when available.

### fn `export function isStaleExtensionContextError(error: unknown): boolean` (L261-264)
- @brief Detects stale extension-context access after session replacement.
- @details Matches the guarded pi runtime error emitted when one invalidated extension context, command context, or replacement-session context is accessed after session replacement or reload. Runtime is O(n) in message length only when an error is supplied. No external state is mutated.
- @param[in] error {unknown} Candidate thrown value.
- @return {boolean} `true` when the value matches the stale-extension-context runtime error.
- @satisfies REQ-280

### fn `function resetElapsedState(state: PiUsereqStatusState): void` (L273-277)
- @brief Resets the in-memory and persisted elapsed counters.
- @details Clears both completed-duration fields in the supplied state and mirrors that cleared snapshot into the process-scoped store. Runtime is O(1). Side effects include mutable state reset and process-scoped persistence update.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.
- @satisfies REQ-217

### fn `function shouldResetElapsedStateOnSessionStart(event: unknown): boolean` (L286-289)
- @brief Detects whether a `session_start` event must reset elapsed counters.
- @details Treats `startup` and `reload` as hard-reset boundaries while preserving counters for `new`, `resume`, and `fork`. Runtime is O(1). No external state is mutated.
- @param[in] event {unknown} Session-start payload.
- @return {boolean} `true` when elapsed counters must reset.
- @satisfies REQ-217

### fn `function shouldResetWorkflowStateOnSessionStart(event: unknown): boolean` (L298-301)
- @brief Detects whether a `session_start` event must reset the workflow state to `idle`.
- @details Treats `startup`, `new`, and `reload` as workflow-reset boundaries so prompt-orchestration state never leaks across boot, explicit session replacement, or extension reload. Runtime is O(1). No external state is mutated.
- @param[in] event {unknown} Session-start payload.
- @return {boolean} `true` when workflow state must reset to `idle`.
- @satisfies REQ-009, REQ-221

### fn `function createStatusThemeAdapter(theme: RawStatusTheme): StatusThemeAdapter` (L311-320)
- @brief Builds the normalized theme adapter used by pi-usereq status formatters.
- @details Precomputes label, value, foreground, and separator renderers so
status formatting remains stable across real TUI themes and deterministic
test doubles. Runtime is O(1). No external state is mutated.
- @param[in] theme {RawStatusTheme} Raw theme implementation from `ctx.ui.theme`.
- @return {StatusThemeAdapter} Normalized status-theme adapter.

### fn `const colorize = (color: StatusForegroundColor, text: string): string =>` (L312-319)

### fn `function resolveStatusBranchValue(ctx: ExtensionContext): string` (L329-331)
- @brief Resolves the active git branch value rendered in the status bar.
- @details Reads the current branch from the active context working directory on every status render so worktree switches and restored base-session renders expose the latest branch immediately. Runtime is dominated by git execution when the working directory belongs to a repository. Side effects include subprocess creation.
- @param[in] ctx {ExtensionContext} Active extension context.
- @return {string} Active branch name or `unknown` when unavailable.
- @satisfies REQ-121, REQ-283

### fn `function normalizeContextUsage(` (L342-359)
- @brief Normalizes one raw context-usage snapshot.
- @details Preserves the runtime token and context-window counts, derives a
percentage when the runtime omits it, clamps negative percentages to `0`,
and preserves overflow above `100` for footer rendering. Runtime is O(1). No
external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Raw runtime snapshot.
- @return {ContextUsage | undefined} Normalized snapshot.

### fn `function refreshContextUsage(` (L371-376)
- @brief Refreshes the stored context-usage snapshot from the active extension context.
- @details Calls `ctx.getContextUsage()` on every intercepted event so the
controller retains the newest context-usage facts available from the pi
runtime. Runtime is O(1). Side effect: mutates `state.contextUsage`.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.
- @satisfies REQ-118, REQ-119

### fn `function resolveContextUsageIconText(` (L385-402)
- @brief Resolves the icon text for one normalized context-usage snapshot.
- @details Maps context usage to one fixed-width icon band so footer rendering remains compact and deterministic across the documented `0`, `>0-<25`, `>=25-<50`, `>=50-<75`, and `>=75` percent bands. Unavailable usage degrades to the `0%` icon. Runtime is O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {string} Fixed-width gauge icon text.
- @satisfies REQ-122, REQ-284

### fn `function formatContextUsageBar(` (L412-424)
- @brief Formats one icon-based context-usage gauge.
- @details Renders the documented gauge icon with theme `error` for `>=90%`, enables terminal blink only for `>=100%`, and otherwise leaves the gauge in the default terminal color. Runtime is O(1). No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {string} Rendered fixed-width gauge icon.
- @satisfies REQ-122, REQ-126, REQ-127, REQ-128, REQ-233, REQ-284

### fn `function formatStatusDuration(durationMs: number): string` (L435-440)
- @brief Formats one elapsed-duration value as `M:SS`.
- @details Floors the input to whole seconds, keeps minutes unbounded above 59,
and zero-pads seconds to two digits. Runtime is O(1). No external state is
mutated.
- @param[in] durationMs {number} Duration in milliseconds.
- @return {string} Duration rendered as `M:SS`.
- @satisfies REQ-125

### fn `function formatCompletedStatusDuration(` (L451-455)
- @brief Formats one optional completed-duration value.
- @details Returns the canonical unset placeholder `--:--` until the supplied
timer receives a normally completed prompt duration, then delegates to
`formatStatusDuration(...)`. Runtime is O(1). No external state is mutated.
- @param[in] durationMs {number | undefined} Optional completed-duration value.
- @return {string} Rendered duration or unset placeholder.
- @satisfies REQ-124

### fn `function formatElapsedStatusValue(` (L468-478)
- @brief Formats the consolidated `elapsed` status-bar value.
- @details Emits the active prompt segment `⏱︎ <active>`, the latest normally
completed segment `⚑ <last>`, and the accumulated successful-runtime segment
`⌛︎<total>` with fixed spacing. Runtime is O(1). No external state is
mutated.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] nowMs {number} Current wall-clock time in milliseconds.
- @return {string} Consolidated `elapsed` field value.
- @satisfies REQ-123, REQ-124, REQ-125, REQ-159

### fn `function formatStatusField(` (L489-495)
- @brief Formats one standard status-bar field.
- @details Renders the field label in accent color and the value in warning
color. Runtime is O(n) in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] value {string} Unstyled field value.
- @return {string} Rendered status-field fragment.

### fn `function formatRenderedStatusField(` (L507-513)
- @brief Formats one pre-rendered status-bar field value.
- @details Preserves the accent-colored field label while allowing callers to
provide a custom styled value such as the context-usage bar. Runtime is O(n)
in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] renderedValue {string} Pre-rendered field value.
- @return {string} Rendered status-field fragment.

### fn `function formatWorkflowStateValue(` (L523-531)
- @brief Formats the rendered workflow-state value for the `status` field.
- @details Uses the standard warning-colored value renderer for non-error states and emits a blinking `error`-colored value for `status:error` so the footer highlights orchestration failures immediately. Runtime is O(n) in text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] workflowState {PiUsereqWorkflowState} Current workflow state.
- @return {string} Rendered workflow-state value.
- @satisfies REQ-112, REQ-223

### fn `function didAgentEndAbort(messages: AgentEndEvent["messages"]): boolean` (L542-549)
- @brief Detects whether an agent run ended through abort semantics.
- @details Treats any assistant message whose `stopReason` equals `aborted` as
an escape-triggered termination that must not overwrite the `last` timer.
Runtime is O(n) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Messages emitted by `agent_end`.
- @return {boolean} `true` when the run ended in aborted state.
- @satisfies REQ-125

### fn `function buildPiUsereqStatusText(` (L562-586)
- @brief Builds the full single-line pi-usereq status-bar payload.
- @details Renders status, branch, context, elapsed, and sound fields in the canonical order with dim bullet separators, workflow-state highlighting, and the documented icon-based context gauge. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] branchName {string} Active git branch name shown in the footer.
- @param[in] nowMs {number} Current wall-clock time in milliseconds.
- @return {string} Single-line status-bar text.
- @satisfies REQ-109, REQ-112, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-156, REQ-159, REQ-180, REQ-222, REQ-223, REQ-233, REQ-283, REQ-284

### fn `function stopStatusTicker(controller: PiUsereqStatusController): void` (L596-601)
- @brief Stops the live elapsed-time ticker when it is active.
- @details Clears the interval handle and resets the stored timer reference so
subsequent runs can reinitialize live status refreshes deterministically.
Runtime is O(1). Side effect: mutates `controller.tickHandle`.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `function syncPiUsereqStatusTicker(` (L613-629)
- @brief Synchronizes the live elapsed-time ticker with the current run state.
- @details Starts a 1-second render ticker while a run is active and stops the
ticker when the run returns to idle. Runtime is O(1). Side effects include
interval creation, interval disposal, and footer-status mutation on timer
ticks.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-123

### fn `export function createPiUsereqStatusController(): PiUsereqStatusController` (L637-652)
- @brief Creates an empty pi-usereq status controller.
- @details Initializes the mutable status snapshot, including empty prompt-request tracking, and starts with no config, no context, and no live ticker. Runtime is O(1). No external state is mutated.
- @return {PiUsereqStatusController} New status controller.
- @satisfies DES-010

### fn `export function setPiUsereqStatusConfig(` (L664-669)
- @brief Stores the effective project configuration used by status rendering.
- @details Replaces the controller's cached configuration so later status
renders reuse the latest docs, tests, source-path, and pi-notify values
without reading from disk on every event. Runtime is O(1). Side effect:
mutates `controller.config`.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `export function renderPiUsereqStatus(` (L679-709)
- @brief Renders the current pi-usereq status bar into the active UI context.
- @details Updates the controller's latest context pointer and writes the single-line status text only when configuration is available, including the active branch field and documented icon-based context gauge. When pi has already invalidated the supplied context after session replacement or reload, the helper clears the stale cached context and returns without surfacing the stale-instance exception. Runtime is O(1) plus git execution for branch refresh. Side effect: mutates `ctx.ui` status when the context is still active.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-159, REQ-180, REQ-233, REQ-280, REQ-283, REQ-284

### fn `export function setPiUsereqWorkflowState(` (L720-731)
- @brief Transitions the prompt-orchestration workflow state and refreshes the status bar.
- @details Mutates the tracked workflow state, preserves the latest extension context when available, and re-renders the single-line footer immediately so internal command transitions and pi lifecycle transitions stay visible to the user. Runtime is O(1). Side effect: mutates workflow state and may update `ctx.ui` status.
- @param[in] workflowState {PiUsereqWorkflowState} Next workflow state.
- @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-221, REQ-222, REQ-223

### fn `export function updateExtensionStatus(` (L743-807)
- @brief Updates mutable status state for one intercepted lifecycle hook.
- @details Refreshes stored context usage on every hook, resets or restores persisted elapsed counters during `session_start`, restores persisted prompt-command metadata when the active session matches a forked execution session, resynchronizes that metadata on later lifecycle hooks so post-switch workflow transitions performed by the initiating command handler become visible to the replacement-session runtime, resets workflow state to `idle` for documented session-start reasons, starts run timing on `agent_start`, promotes pending prompt-request metadata into the active run, captures non-aborted run duration on `agent_end`, accumulates successful runtime into `Σ`, preserves in-memory prompt-command state plus process-scoped persistence across switch-triggered `session_shutdown`, tolerates stale post-replacement render contexts, synchronizes the live ticker, and re-renders the status bar when configuration is available. Runtime is O(n) in `agent_end` message count and otherwise O(1). Side effects include in-memory state mutation, interval scheduling, process-scoped persistence mutation, and footer-status updates.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded from the wrapper.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-009, REQ-117, REQ-118, REQ-119, REQ-123, REQ-124, REQ-125, REQ-159, REQ-169, REQ-217, REQ-221, REQ-278, REQ-279, REQ-280

### fn `export function disposePiUsereqStatusController(` (L818-823)
- @brief Disposes the pi-usereq status controller.
- @details Stops the live ticker, clears the cached context pointer, and leaves
the last captured status snapshot available for inspection until the
controller object itself is discarded. Runtime is O(1). Side effects are
limited to interval disposal and in-memory state mutation.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StatusForegroundColor`|type||30||
|`RawStatusTheme`|iface||40-42|interface RawStatusTheme|
|`StatusThemeAdapter`|iface||50-55|interface StatusThemeAdapter|
|`PiUsereqStatusHookName`|type||98||
|`PiUsereqPromptRequest`|type||104||
|`PiUsereqWorkflowState`|type||110||
|`PiUsereqStatusState`|iface||116-124|export interface PiUsereqStatusState|
|`PiUsereqStatusController`|iface||133-138|export interface PiUsereqStatusController|
|`PiUsereqStatusPersistenceStore`|iface||144-147|interface PiUsereqStatusPersistenceStore|
|`getPiUsereqStatusPersistenceStore`|fn||161-170|function getPiUsereqStatusPersistenceStore(): PiUsereqSta...|
|`restorePersistedElapsedState`|fn||178-182|function restorePersistedElapsedState(state: PiUsereqStat...|
|`persistElapsedState`|fn||190-194|function persistElapsedState(state: PiUsereqStatusState):...|
|`persistPromptCommandState`|fn||202-208|function persistPromptCommandState(state: PiUsereqStatusS...|
|`shouldPreservePromptCommandStateOnShutdown`|fn||217-220|export function shouldPreservePromptCommandStateOnShutdow...|
|`restorePersistedPromptCommandState`|fn||229-240|function restorePersistedPromptCommandState(|
|`getContextSessionFile`|fn||248-252|function getContextSessionFile(ctx: ExtensionContext): st...|
|`isStaleExtensionContextError`|fn||261-264|export function isStaleExtensionContextError(error: unkno...|
|`resetElapsedState`|fn||273-277|function resetElapsedState(state: PiUsereqStatusState): void|
|`shouldResetElapsedStateOnSessionStart`|fn||286-289|function shouldResetElapsedStateOnSessionStart(event: unk...|
|`shouldResetWorkflowStateOnSessionStart`|fn||298-301|function shouldResetWorkflowStateOnSessionStart(event: un...|
|`createStatusThemeAdapter`|fn||311-320|function createStatusThemeAdapter(theme: RawStatusTheme):...|
|`colorize`|fn||312-319|const colorize = (color: StatusForegroundColor, text: str...|
|`resolveStatusBranchValue`|fn||329-331|function resolveStatusBranchValue(ctx: ExtensionContext):...|
|`normalizeContextUsage`|fn||342-359|function normalizeContextUsage(|
|`refreshContextUsage`|fn||371-376|function refreshContextUsage(|
|`resolveContextUsageIconText`|fn||385-402|function resolveContextUsageIconText(|
|`formatContextUsageBar`|fn||412-424|function formatContextUsageBar(|
|`formatStatusDuration`|fn||435-440|function formatStatusDuration(durationMs: number): string|
|`formatCompletedStatusDuration`|fn||451-455|function formatCompletedStatusDuration(|
|`formatElapsedStatusValue`|fn||468-478|function formatElapsedStatusValue(|
|`formatStatusField`|fn||489-495|function formatStatusField(|
|`formatRenderedStatusField`|fn||507-513|function formatRenderedStatusField(|
|`formatWorkflowStateValue`|fn||523-531|function formatWorkflowStateValue(|
|`didAgentEndAbort`|fn||542-549|function didAgentEndAbort(messages: AgentEndEvent["messag...|
|`buildPiUsereqStatusText`|fn||562-586|function buildPiUsereqStatusText(|
|`stopStatusTicker`|fn||596-601|function stopStatusTicker(controller: PiUsereqStatusContr...|
|`syncPiUsereqStatusTicker`|fn||613-629|function syncPiUsereqStatusTicker(|
|`createPiUsereqStatusController`|fn||637-652|export function createPiUsereqStatusController(): PiUsere...|
|`setPiUsereqStatusConfig`|fn||664-669|export function setPiUsereqStatusConfig(|
|`renderPiUsereqStatus`|fn||679-709|export function renderPiUsereqStatus(|
|`setPiUsereqWorkflowState`|fn||720-731|export function setPiUsereqWorkflowState(|
|`updateExtensionStatus`|fn||743-807|export function updateExtensionStatus(|
|`disposePiUsereqStatusController`|fn||818-823|export function disposePiUsereqStatusController(|


---

# find-constructs.ts | TypeScript | 319L | 12 symbols | 4 imports | 14 comments
> Path: `src/core/find-constructs.ts`
- @brief Searches named language constructs in explicit source-file lists and renders compact excerpts.
- @details Combines source analysis, tag filtering, regex name matching, optional Doxygen extraction, and comment-stripped code rendering. Runtime is O(F + S + M) where F is file count, S is analyzed source size, and M is candidate element count. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import { compressSource, detectLanguage } from "./compress.js";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
import { SourceAnalyzer, SourceElement, ElementType } from "./source-analyzer.js";
```

## Definitions

### fn `export function formatAvailableTags(): string` (L44-49)
- @brief Formats the supported tag matrix for user-facing error messages.
- @details Sorts languages alphabetically and emits one bullet per language containing its sorted construct tags. Runtime is O(l * t log t). No side effects occur.
- @return {string} Multiline markdown-like tag summary.

### fn `export function parseTagFilter(tagString: string): Set<string>` (L57-64)
- @brief Parses a pipe-delimited construct tag filter.
- @details Splits the raw filter on `|`, trims whitespace, uppercases entries, and removes empty tokens. Runtime is O(n) in input length. No side effects occur.
- @param[in] tagString {string} Raw pipe-delimited tag expression.
- @return {Set<string>} Normalized tag set.

### fn `export function languageSupportsTags(language: string, tagSet: Set<string>): boolean` (L73-76)
- @brief Tests whether a language supports at least one requested tag.
- @details Performs O(k) membership checks across the requested tag set against the language-specific supported-tag set. No external state is mutated.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] tagSet {Set<string>} Requested construct tags.
- @return {boolean} `true` when at least one requested tag is supported for the language.

### fn `export function constructMatches(element: SourceElement, tagSet: Set<string>, pattern: string): boolean` (L86-94)
- @brief Tests whether one analyzed element satisfies tag and name filters.
- @details Rejects elements whose type label is outside the requested tag set or that do not expose a name, then applies the user regex to the name. Invalid regex patterns are treated as non-matches. Runtime is O(p) for regex evaluation plus constant filtering work.
- @param[in] element {SourceElement} Candidate source element.
- @param[in] tagSet {Set<string>} Requested construct tags.
- @param[in] pattern {string} User-provided regular expression applied to element names.
- @return {boolean} `true` when the element matches both tag and name criteria.

### fn `function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]>` (L103-109)
- @brief Merges parsed Doxygen field arrays into one accumulator.
- @details Appends values for matching tags without deduplication so comment order is preserved. Runtime is O(v) in merged value count. The function mutates `baseFields` in place.
- @param[in] extraFields {Record<string, string[]>} Source map to append.
- @param[in,out] baseFields {Record<string, string[]>} Mutable destination map.
- @return {Record<string, string[]>} The mutated destination map.

### fn `function extractConstructDoxygenFields(element: SourceElement): Record<string, string[]>` (L117-127)
- @brief Collects Doxygen fields associated with one construct.
- @details Starts with fields already attached to the element and extends them with nearby body comments from the first three lines of the body. Runtime is O(c) in inspected comment count. No external state is mutated.
- @param[in] element {SourceElement} Source element whose documentation should be aggregated.
- @return {Record<string, string[]>} Aggregated Doxygen field map.

### fn `function extractFileLevelDoxygenFields(elements: SourceElement[]): Record<string, string[]>` (L135-146)

### iface `export interface StrippedConstructLineEntry` (L152-157)
- @brief Describes one stripped-code line extracted from a matched construct.
- @details Preserves output order, original source coordinates, normalized stripped text, and rendered display text so markdown and JSON renderers can share one canonical intermediate format. The interface is compile-time only and introduces no runtime cost.

### fn `export function buildStrippedConstructLineEntries(` (L168-199)
- @brief Removes comments from a construct excerpt and returns structured stripped-code lines.
- @details Reuses `compressSource` for comment stripping, translates local compressed line numbers back into absolute file coordinates, and emits both direct-access text fields and rendered display strings. Runtime is O(n) in excerpt length. No external state is mutated.
- @param[in] codeLines {string[]} Raw code lines belonging to the construct.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] lineStart {number} Absolute starting line number of the construct.
- @param[in] includeLineNumbers {boolean} When `true`, `display_text` includes absolute source line prefixes.
- @return {StrippedConstructLineEntry[]} Structured stripped-code line entries.

### fn `function stripConstructComments(codeLines: string[], language: string, lineStart: number, includeLineNumbers: boolean): string` (L210-214)
- @brief Removes comments from a construct excerpt while preserving optional absolute line numbers.
- @details Delegates to `buildStrippedConstructLineEntries(...)` and joins the rendered display strings into one newline-delimited excerpt. Runtime is O(n) in excerpt length. No external state is mutated.
- @param[in] codeLines {string[]} Raw code lines belonging to the construct.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] lineStart {number} Absolute starting line number of the construct.
- @param[in] includeLineNumbers {boolean} When `true`, emit absolute source line prefixes.
- @return {string} Comment-stripped construct excerpt.

### fn `export function formatConstruct(element: SourceElement, sourceLines: string[], includeLineNumbers: boolean, language = "python"): string` (L225-240)
- @brief Formats one matched construct as markdown.
- @details Emits construct metadata, attached Doxygen fields, and a fenced code block stripped of comments. Runtime is O(n) in construct span length plus attached documentation size. No side effects occur.
- @param[in] element {SourceElement} Matched source element.
- @param[in] sourceLines {string[]} Full source file split into line-preserving entries.
- @param[in] includeLineNumbers {boolean} When `true`, include absolute source line prefixes.
- @param[in] language {string} Canonical analyzer language identifier. Defaults to `python`.
- @return {string} Markdown section for the matched construct.

### fn `export function searchConstructsInFiles(` (L253-319)
- @brief Searches named constructs across explicit files and renders markdown excerpts.
- @details Validates files, infers languages, skips unsupported tag/language combinations, analyzes source elements, filters matches by tag and regex, and emits one markdown section per file containing matches. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] filePaths {string[]} Explicit file paths to search.
- @param[in] tagFilter {string} Pipe-delimited requested construct tags.
- @param[in] pattern {string} Regular expression applied to construct names.
- @param[in] includeLineNumbers {boolean} When `true`, preserve absolute source line numbers in code excerpts.
- @param[in] verbose {boolean} When `true`, write progress and skip diagnostics to stderr.
- @return {string} Concatenated markdown output grouped by file.
- @throws {Error} Throws when no valid tags are provided or when no constructs match the request.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatAvailableTags`|fn||44-49|export function formatAvailableTags(): string|
|`parseTagFilter`|fn||57-64|export function parseTagFilter(tagString: string): Set<st...|
|`languageSupportsTags`|fn||73-76|export function languageSupportsTags(language: string, ta...|
|`constructMatches`|fn||86-94|export function constructMatches(element: SourceElement, ...|
|`mergeDoxygenFields`|fn||103-109|function mergeDoxygenFields(baseFields: Record<string, st...|
|`extractConstructDoxygenFields`|fn||117-127|function extractConstructDoxygenFields(element: SourceEle...|
|`extractFileLevelDoxygenFields`|fn||135-146|function extractFileLevelDoxygenFields(elements: SourceEl...|
|`StrippedConstructLineEntry`|iface||152-157|export interface StrippedConstructLineEntry|
|`buildStrippedConstructLineEntries`|fn||168-199|export function buildStrippedConstructLineEntries(|
|`stripConstructComments`|fn||210-214|function stripConstructComments(codeLines: string[], lang...|
|`formatConstruct`|fn||225-240|export function formatConstruct(element: SourceElement, s...|
|`searchConstructsInFiles`|fn||253-319|export function searchConstructsInFiles(|


---

# find-payload.ts | TypeScript | 786L | 30 symbols | 6 imports | 31 comments
> Path: `src/core/find-payload.ts`
- @brief Builds agent-oriented JSON payloads for `files-search` and `search`.
- @details Converts construct-search results into deterministic JSON sections ordered for LLM traversal, including request metadata, repository scope, file statuses, structured matches, structured Doxygen fields, typed line ranges, and normalized stripped code lines. Runtime is O(F log F + S + M) where F is file count, S is analyzed source size, and M is matched construct count. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import { detectLanguage } from "./compress.js";
import {
import {
```

## Definitions

- type `export type FindToolScope = "explicit-files" | "configured-source-directories";` (L33)
- @brief Enumerates supported search-payload scopes.
- @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type FindFileStatus = "matched" | "no_match" | "error" | "skipped";` (L39)
- @brief Enumerates supported per-file search-entry statuses.
- @details Separates matched files, analyzed no-match files, analysis failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
- type `export type FindRequestStatus = "valid" | "invalid";` (L45)
- @brief Enumerates request-validation statuses for tag-filter and regex fields.
- @details Distinguishes validated search inputs from invalid request parameters without requiring stderr parsing. The alias is compile-time only and introduces no runtime cost.
- type `export type FindLineNumberMode = "enabled" | "disabled";` (L51)
- @brief Enumerates rendered line-number modes for search output.
- @details Distinguishes payloads whose display strings include original source line prefixes from payloads whose display strings contain plain stripped code only. The alias is compile-time only and introduces no runtime cost.
- type `export type FindSearchStatus = "matched" | "no_matches" | "invalid_tag_filter" | "invalid_regex";` (L57)
- @brief Enumerates top-level search execution outcomes.
- @details Separates successful match delivery from invalid request states and valid no-match searches so agents can branch on one canonical field. The alias is compile-time only and introduces no runtime cost.
### iface `export interface FindLineRange` (L63-67)
- @brief Describes one numeric source line range.
- @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolCodeLineEntry` (L73-78)
- @brief Describes one structured stripped-code line.
- @details Preserves output order, original source coordinates, normalized stripped text, and rendered display text so agents can choose between direct-access facts and human-visible rendering without reparsing strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolMatchEntry extends FindLineRange` : FindLineRange (L84-101)
- @brief Describes one structured matched construct.
- @details Orders direct-access identity fields before hierarchy, locations, Doxygen metadata, and stripped code-line arrays so agents can branch without reparsing duplicate monolithic source text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolFileEntry extends FindLineRange` : FindLineRange (L107-116)
- @brief Describes one per-file search payload entry.
- @details Stores canonical identity, file status, line metrics, file-level Doxygen metadata, and matched-construct records while keeping failure facts structured. Derivable identity fields and static supported-tag metadata are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolRequestSection` (L122-140)
- @brief Describes the request section of the search payload.
- @details Captures tool identity, scope, base directory, line-number mode, tag filter, regex, validation statuses, and requested path inventory so agents can reason about how the search was executed. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolSummarySection` (L146-157)
- @brief Describes the summary section of the search payload.
- @details Exposes aggregate file, match, line, and Doxygen counts as numeric fields plus one stable search-status discriminator and the normalized validation error when request parsing fails. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolRepositorySection` (L163-166)
- @brief Describes the repository section of the search payload.
- @details Stores configured source-directory scope and the canonical file list used during search while omitting static root-path echoes and supported-tag metadata that belong in tool registration. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolPayload` (L172-176)
- @brief Describes the full agent-oriented search payload.
- @details Exposes only aggregate search totals, repository scope, and per-file match records, omitting request echoes and static supported-tag matrices that already belong in registration metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildFindToolPayloadOptions` (L182-192)
- @brief Describes the options required to build one search payload.
- @details Supplies tool identity, scope, base directory, tag filter, regex, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### iface `interface ValidatedRegex` (L198-202)
- @brief Describes the result of validating one regex pattern.
- @details Separates valid compiled regex instances from invalid user input while preserving a stable machine-readable status and error message. The interface is compile-time only and introduces no runtime cost.

### iface `interface ValidatedTagFilter` (L208-213)
- @brief Describes the result of validating one tag filter.
- @details Separates normalized tag values from invalid or empty filters while preserving a stable status and error message. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeFindPath(targetPath: string, baseDir: string): string` (L222-230)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): FindLineRange` (L239-245)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {FindLineRange} Structured line-range record.

### fn `function resolveSymbolName(element: SourceElement): string` (L253-255)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every matched construct retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], element: SourceElement): SourceElement | undefined` (L264-273)
- @brief Resolves the direct parent definition for one source element.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] element {SourceElement} Candidate child element.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function mapCodeLines(lineEntries: StrippedConstructLineEntry[]): FindToolCodeLineEntry[]` (L281-288)
- @brief Converts stripped-code line entries into the payload line-entry contract.
- @details Performs a shallow field copy so the payload remains decoupled from the lower-level strip helper type. Runtime is O(n) in stripped line count. No side effects occur.
- @param[in] lineEntries {StrippedConstructLineEntry[]} Normalized stripped-code line entries.
- @return {FindToolCodeLineEntry[]} Payload line entries.

### fn `function validateTagFilter(tagFilter: string): ValidatedTagFilter` (L296-312)
- @brief Validates and normalizes one tag filter.
- @details Parses the raw pipe-delimited filter, sorts the resulting unique tag values, and marks the filter invalid when no recognized tag remains after normalization. Runtime is O(n log n) in requested tag count. No side effects occur.
- @param[in] tagFilter {string} Raw pipe-delimited tag filter.
- @return {ValidatedTagFilter} Validation result containing the normalized tag set and status.

### fn `function validateRegexPattern(pattern: string): ValidatedRegex` (L320-332)
- @brief Validates and compiles one construct-name regex pattern.
- @details Uses the JavaScript `RegExp` engine with search-style `.test(...)` evaluation and records a stable error message when compilation fails. Runtime is O(n) in pattern length. No side effects occur.
- @param[in] pattern {string} Raw user pattern.
- @return {ValidatedRegex} Validation result containing the compiled regex when valid.

### fn `function elementMatches(element: SourceElement, tagSet: Set<string>, regex: RegExp): boolean` (L342-350)
- @brief Tests whether one element matches a validated tag filter and regex.
- @details Rejects unnamed elements and elements outside the requested tag set before applying the precompiled regex to the construct name. Runtime is O(1) plus regex evaluation. No side effects occur.
- @param[in] element {SourceElement} Candidate source element.
- @param[in] tagSet {Set<string>} Normalized requested tag set.
- @param[in] regex {RegExp} Precompiled construct-name regex.
- @return {boolean} `true` when the element matches both filters.

### fn `function countLogicalLines(fileContent: string): number` (L358-363)
- @brief Counts logical source lines from one file content string.
- @details Preserves the repository's line-count convention that excludes the terminal empty split produced by trailing newlines. Runtime is O(n) in content length. No side effects occur.
- @param[in] fileContent {string} Raw file content.
- @return {number} Logical source-line count.

### fn `function buildSkippedFileEntry(` (L378-403)
- @brief Builds one skipped file entry for a request path.
- @details Preserves path identity, filesystem status, language metadata when detectable, supported tags for the language, and a stable skip reason without attempting search analysis. Runtime is O(t) in supported-tag count. No side effects occur.
- @param[in] inputPath {string} Caller-supplied path.
- @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
- @param[in] requestIndex {number} Caller-order index.
- @param[in] baseDir {string} Base directory used for canonical path derivation.
- @param[in] errorReason {string} Stable skip reason identifier.
- @param[in] errorMessage {string} Human-readable skip reason.
- @param[in] exists {boolean} Filesystem existence flag.
- @param[in] isFile {boolean} Filesystem file-kind flag.
- @return {FindToolFileEntry} Structured skipped file entry.

### fn `function buildMatchEntry(` (L417-458)
- @brief Builds one matched construct entry from an analyzed element.
- @details Resolves symbol identity, hierarchy hints, structured Doxygen fields, numeric declaration lines, and stripped code excerpts while keeping monolithic source text optional. Runtime is O(n) in construct span length plus Doxygen size. No side effects occur.
- @param[in] element {SourceElement} Matched element.
- @param[in] matchIndex {number} Match index within the file.
- @param[in] definitions {SourceElement[]} Sorted definition elements used for parent resolution.
- @param[in] qualifiedNameByLineStart {Map<number, string>} Precomputed qualified-name map for definitions.
- @param[in] sourceLines {string[]} Full file content split into line-preserving entries.
- @param[in] languageId {string} Canonical language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, rendered display strings include absolute source line prefixes.
- @return {FindToolMatchEntry} Structured match entry.

### fn `function analyzeFindFile(` (L474-598)
- @brief Analyzes one path into a structured search file entry.
- @details Resolves path identity, validates language and tag support, parses the file with `SourceAnalyzer`, builds structured match entries, and preserves stable status facts for no-match or failure outcomes. Runtime is dominated by file I/O and analyzer cost. Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
- @param[in] inputPath {string} Caller-supplied path.
- @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
- @param[in] requestIndex {number} Caller-order index.
- @param[in] baseDir {string} Base directory used for canonical path derivation.
- @param[in] tagSet {Set<string>} Validated requested tag set.
- @param[in] regex {RegExp} Validated construct-name regex.
- @param[in] includeLineNumbers {boolean} When `true`, rendered stripped-source text includes original line prefixes.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {FindToolFileEntry} Structured file entry.

### fn `export function buildSearchToolPayload(options: BuildFindToolPayloadOptions): FindToolPayload` (L607-752)
- @brief Builds the full agent-oriented search payload.
- @details Validates request parameters, analyzes requested files in caller order when the request is valid, preserves skipped and no-match outcomes in structured file entries, computes aggregate numeric totals, and omits request echoes plus the static supported-tag matrix already encoded in registration metadata. Runtime is O(F log F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildFindToolPayloadOptions} Payload-construction options.
- @return {FindToolPayload} Structured search payload ordered as summary, repository, and files.
- @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-096, REQ-098

### fn `export function buildSearchToolExecutionStderr(payload: FindToolPayload): string` (L761-786)
- @brief Builds deterministic stderr diagnostics from a search payload.
- @details Serializes invalid request states, skipped inputs, no-match files, and analysis failures into stable newline-delimited diagnostics while leaving successful matched files silent. Runtime is O(n) in file-entry count. No side effects occur.
- @param[in] payload {FindToolPayload} Structured search payload.
- @return {string} Newline-delimited diagnostics.
- @satisfies REQ-096

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`FindToolScope`|type||33||
|`FindFileStatus`|type||39||
|`FindRequestStatus`|type||45||
|`FindLineNumberMode`|type||51||
|`FindSearchStatus`|type||57||
|`FindLineRange`|iface||63-67|export interface FindLineRange|
|`FindToolCodeLineEntry`|iface||73-78|export interface FindToolCodeLineEntry|
|`FindToolMatchEntry`|iface||84-101|export interface FindToolMatchEntry extends FindLineRange|
|`FindToolFileEntry`|iface||107-116|export interface FindToolFileEntry extends FindLineRange|
|`FindToolRequestSection`|iface||122-140|export interface FindToolRequestSection|
|`FindToolSummarySection`|iface||146-157|export interface FindToolSummarySection|
|`FindToolRepositorySection`|iface||163-166|export interface FindToolRepositorySection|
|`FindToolPayload`|iface||172-176|export interface FindToolPayload|
|`BuildFindToolPayloadOptions`|iface||182-192|export interface BuildFindToolPayloadOptions|
|`ValidatedRegex`|iface||198-202|interface ValidatedRegex|
|`ValidatedTagFilter`|iface||208-213|interface ValidatedTagFilter|
|`canonicalizeFindPath`|fn||222-230|function canonicalizeFindPath(targetPath: string, baseDir...|
|`buildLineRange`|fn||239-245|function buildLineRange(startLineNumber: number, endLineN...|
|`resolveSymbolName`|fn||253-255|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||264-273|function resolveParentElement(definitions: SourceElement[...|
|`mapCodeLines`|fn||281-288|function mapCodeLines(lineEntries: StrippedConstructLineE...|
|`validateTagFilter`|fn||296-312|function validateTagFilter(tagFilter: string): ValidatedT...|
|`validateRegexPattern`|fn||320-332|function validateRegexPattern(pattern: string): Validated...|
|`elementMatches`|fn||342-350|function elementMatches(element: SourceElement, tagSet: S...|
|`countLogicalLines`|fn||358-363|function countLogicalLines(fileContent: string): number|
|`buildSkippedFileEntry`|fn||378-403|function buildSkippedFileEntry(|
|`buildMatchEntry`|fn||417-458|function buildMatchEntry(|
|`analyzeFindFile`|fn||474-598|function analyzeFindFile(|
|`buildSearchToolPayload`|fn||607-752|export function buildSearchToolPayload(options: BuildFind...|
|`buildSearchToolExecutionStderr`|fn||761-786|export function buildSearchToolExecutionStderr(payload: F...|


---

# generate-markdown.ts | TypeScript | 120L | 3 symbols | 3 imports | 5 comments
> Path: `src/core/generate-markdown.ts`
- @brief Generates useReq reference markdown from explicit source-file lists.
- @details Combines file validation, language detection, source analysis, metadata enrichment, and final markdown rendering for downstream prompt workflows. Runtime is O(F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { SourceAnalyzer, formatMarkdown } from "./source-analyzer.js";
```

## Definitions

### fn `export function detectLanguage(filePath: string): string | undefined` (L47-49)
- @brief Infers the analyzer language from a file path extension.
- @details Normalizes the extension to lowercase and resolves it through `EXT_LANG_MAP`. Time complexity is O(1). No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @return {string | undefined} Canonical analyzer language identifier, or `undefined` for unsupported extensions.

### fn `function formatOutputPath(filePath: string, outputBase?: string): string` (L58-61)
- @brief Formats one analyzed file path for markdown output.
- @details Returns the original path when no base is supplied; otherwise computes a slash-normalized relative path against the resolved output base. Time complexity is O(p) in path length. No side effects occur.
- @param[in] filePath {string} Source file path.
- @param[in] outputBase {string | undefined} Optional base directory used for relative formatting.
- @return {string} Display path used in the rendered markdown header.

### fn `export function generateMarkdown(filePaths: string[], verbose = false, outputBase?: string): string` (L72-120)
- @brief Generates reference markdown for explicit source files.
- @details Filters unsupported or missing files, analyzes each valid source file, enriches extracted symbols with signatures and Doxygen metadata, and concatenates per-file markdown sections separated by horizontal rules. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] filePaths {string[]} Explicit file paths to analyze.
- @param[in] verbose {boolean} When `true`, write per-file progress diagnostics to stderr.
- @param[in] outputBase {string | undefined} Optional base directory used to shorten output paths.
- @return {string} Concatenated markdown reference document.
- @throws {Error} Throws when no valid source files can be processed.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`detectLanguage`|fn||47-49|export function detectLanguage(filePath: string): string ...|
|`formatOutputPath`|fn||58-61|function formatOutputPath(filePath: string, outputBase?: ...|
|`generateMarkdown`|fn||72-120|export function generateMarkdown(filePaths: string[], ver...|


---

# path-context.ts | TypeScript | 461L | 22 symbols | 5 imports | 26 comments
> Path: `src/core/path-context.ts`
- @brief Derives shared runtime path contracts for prompts, tools, and configuration flows.
- @details Centralizes the static bootstrap paths and dynamic cwd-aligned paths used across the extension runtime. The module also exposes home-relative display formatting, trailing-slash-free normalization, and prompt-facing path facts. Runtime is O(s + p) where s is the configured source-directory count and p is aggregate path length. Side effects are limited to module-local runtime-path state mutation.

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UseReqConfig } from "./config.js";
```

## Definitions

### iface `export interface RuntimePathState` (L29-37)
- @brief Stores the mutable runtime path state shared across extension callbacks.
- @details Persists the static bootstrap `base-path`, the dynamic `context-path`, the optional repository-derived `git-path`, the derived `parent-path` and `base-dir`, and the optional active worktree facts. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RuntimePathContext extends RuntimePathState` : RuntimePathState (L43-56)
- @brief Describes the absolute runtime path context shared across extension components.
- @details Aggregates the static installation, base, git, parent, and config paths with the dynamic context and optional worktree paths plus execution-resolved docs/tests/source absolute paths. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RuntimePathFacts` (L62-83)
- @brief Describes the prompt/tool-facing runtime paths rendered for display.
- @details Mirrors `RuntimePathContext` in a serialization-oriented shape so downstream agents can consume stable `~`-relative absolute paths and trailing-slash-free relative directories without reparsing platform-specific separators. The interface is compile-time only and introduces no runtime cost.

### fn `export function getInstallationPath(): string` (L98-100)
- @brief Resolves the installed extension root that owns `index.ts` and bundled resources.
- @details Uses the current module location under `src/core` or its installed equivalent, then moves one directory upward so the returned path is the runtime installation root containing `resources/`. Runtime is O(1). No external state is mutated.
- @return {string} Absolute installation path.

### fn `export function normalizePathSlashes(value: string): string` (L108-110)
- @brief Formats one path with slash separators.
- @details Rewrites backslashes to `/` without changing semantic path identity so serialized payloads remain stable across operating systems. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Absolute or relative filesystem path.
- @return {string} Slash-normalized path string.

### fn `function trimTrailingSeparatorsPreserveRoot(value: string): string` (L118-132)
- @brief Removes trailing separators while preserving a filesystem root.
- @details Keeps `/`, drive roots, and UNC roots intact while trimming redundant trailing separators from every other absolute or relative path string. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Raw path string.
- @return {string} Trailing-slash-free path string.

### fn `export function normalizeAbsolutePathContract(value: string): string` (L140-142)
- @brief Normalizes one absolute path contract value.
- @details Resolves the supplied value to an absolute path, removes trailing separators except for the filesystem root, and rewrites separators to `/`. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Absolute or relative path candidate.
- @return {string} Canonical trailing-slash-free absolute path.

### fn `export function normalizeRelativeDirContract(value: string): string` (L150-155)
- @brief Normalizes one relative-directory contract value.
- @details Trims whitespace, rewrites separators to `/`, removes a leading `./`, and removes trailing separators so persisted `*-dir` values stay relative and trailing-slash-free. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Relative-directory candidate.
- @return {string} Canonical trailing-slash-free relative-directory string.

### fn `export function getConfigPath(basePath: string): string` (L163-165)
- @brief Computes the absolute project config path for one base path.
- @details Appends `.pi-usereq.json` to the supplied base path using the canonical repository-local configuration layout. Runtime is O(1). No external state is mutated.
- @param[in] basePath {string} Absolute or relative base path.
- @return {string} Absolute config-file path.

### fn `export function isSameOrAncestorPath(` (L174-188)
- @brief Tests whether one path is identical to or an ancestor of another path.
- @details Resolves both inputs, computes a relative traversal from the candidate ancestor to the candidate child, and accepts only exact matches or descendant traversals that stay within the ancestor subtree. Runtime is O(p) in path length. No external state is mutated.
- @param[in] ancestorPath {string} Candidate ancestor or identical path.
- @param[in] childPath {string} Candidate child or identical path.
- @return {boolean} `true` when `ancestorPath` equals `childPath` or strictly contains it.

### fn `function deriveStaticRuntimePathState(` (L197-222)
- @brief Derives repository-relative runtime state from one base path and optional git path.
- @details Normalizes `base-path`, keeps `git-path` only when it is identical to or an ancestor of `base-path`, derives `parent-path` from `git-path`, and derives `base-dir` as `base-path` relative to `git-path`. Runtime is O(p) in path length. No external state is mutated.
- @param[in] basePath {string} Static base path candidate.
- @param[in] gitPath {string | undefined} Optional repository-root candidate.
- @return {{ basePath: string; gitPath?: string; parentPath?: string; baseDir: string }} Derived static path facts.

### fn `export function bootstrapRuntimePathState(` (L231-233)
- @brief Bootstraps the shared runtime path state for one extension session or command preflight.
- @details Sets static `base-path`, initializes dynamic `context-path` to the same value, stores derived `git-path`, `parent-path`, and `base-dir`, and clears any prior worktree facts. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
- @param[in] basePath {string} Bootstrap cwd that becomes the static base path.
- @param[in] options {{ gitPath?: string | undefined } | undefined} Optional repository-root override.
- @return {void} No return value.

### fn `export function ensureRuntimePathState(cwd: string): void` (L251-257)
- @brief Ensures the shared runtime path state has at least fallback base and context values.
- @details Lazily bootstraps the module-local state from the supplied cwd only when no prior bootstrap has occurred, preserving any already-established static or dynamic path state. Runtime is O(1). Side effect: may initialize module-local runtime-path state.
- @param[in] cwd {string} Fallback cwd.
- @return {void} No return value.

### fn `export function getRuntimeBasePath(fallbackPath: string): string` (L265-270)
- @brief Returns the current static base path.
- @details Falls back to the supplied path only when the runtime path state has not been bootstrapped yet. Runtime is O(1). No external state is mutated.
- @param[in] fallbackPath {string} Fallback cwd.
- @return {string} Static base path.

### fn `export function getRuntimeContextPath(fallbackPath: string): string` (L278-283)
- @brief Returns the current dynamic context path.
- @details Falls back to the supplied path only when the runtime path state has not been bootstrapped yet. Runtime is O(1). No external state is mutated.
- @param[in] fallbackPath {string} Fallback cwd.
- @return {string} Dynamic context path.

### fn `export function setRuntimeGitPath(gitPath?: string): void` (L291-298)
- @brief Stores the derived git-root facts in the shared runtime path state.
- @details Re-derives `parent-path` and `base-dir` from the stored static `base-path` plus the supplied `git-path`, preserving the existing dynamic context path. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
- @param[in] gitPath {string | undefined} Optional repository-root path.
- @return {void} No return value.

### fn `export function setRuntimeContextPath(contextPath: string): void` (L306-308)
- @brief Stores the current dynamic context path.
- @details Replaces the module-local `context-path` with the supplied trailing-slash-free absolute path. Runtime is O(1). Side effect: mutates module-local runtime-path state.
- @param[in] contextPath {string} Next context path.
- @return {void} No return value.

### fn `export function setRuntimeWorktreePathState(options:` (L316-326)
- @brief Stores the current worktree directory and path facts.
- @details Normalizes the supplied relative `worktree-dir` and absolute `worktree-path` so later prompt rendering and tool execution can reuse the derived values across modules. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
- @param[in] options {{ worktreeDir?: string | undefined; worktreePath?: string | undefined }} Optional active worktree facts.
- @return {void} No return value.

### fn `export function getRuntimePathState(): RuntimePathState` (L333-344)
- @brief Returns a snapshot of the shared runtime path state.
- @details Materializes the current static and dynamic path facts into a read-only copy suitable for prompt rendering, tool execution, and tests. Runtime is O(1). No external state is mutated.
- @return {RuntimePathState} Snapshot of the current runtime path state.

### fn `export function formatRuntimePathForDisplay(absolutePath: string): string` (L352-365)
- @brief Formats one absolute path relative to the user home using `~` when possible.
- @details Returns `~` when the path equals the current home directory and returns `~/...` when the path descends from it; otherwise returns the normalized absolute path unchanged. Runtime is O(p) in path length. No external state is mutated.
- @param[in] absolutePath {string} Absolute or relative path candidate.
- @return {string} Home-relative or trailing-slash-free absolute path.

### fn `export function buildRuntimePathContext(` (L376-385)
- @brief Builds the absolute runtime path context for one base path, context path, and configuration.
- @details Derives static `install-path`, `git-path`, `parent-path`, and `base-dir`, resolves the static `config-path`, preserves the dynamic `context-path`, and resolves docs/tests/source absolute paths against `context-path` so worktree-backed execution uses the active checkout. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] basePath {string} Static base path.
- @param[in] contextPath {string} Dynamic context path.
- @param[in] config {Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">} Effective relative directory configuration.
- @param[in] options {{ installationPath?: string; gitPath?: string | undefined; worktreeDir?: string | undefined; worktreePath?: string | undefined } | undefined} Optional installation, repository, and worktree overrides.
- @return {RuntimePathContext} Absolute runtime path context.

### fn `export function buildRuntimePathFacts(` (L436-461)
- @brief Converts the absolute runtime path context into prompt/tool-facing path facts.
- @details Re-encodes every absolute path with the home-relative formatter while preserving trailing-slash-free relative directories for `base-dir` and `worktree-dir`. Runtime is O(s + p) where s is source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] context {RuntimePathContext} Absolute runtime path context.
- @return {RuntimePathFacts} Display-oriented runtime path facts.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`RuntimePathState`|iface||29-37|export interface RuntimePathState|
|`RuntimePathContext`|iface||43-56|export interface RuntimePathContext extends RuntimePathState|
|`RuntimePathFacts`|iface||62-83|export interface RuntimePathFacts|
|`getInstallationPath`|fn||98-100|export function getInstallationPath(): string|
|`normalizePathSlashes`|fn||108-110|export function normalizePathSlashes(value: string): string|
|`trimTrailingSeparatorsPreserveRoot`|fn||118-132|function trimTrailingSeparatorsPreserveRoot(value: string...|
|`normalizeAbsolutePathContract`|fn||140-142|export function normalizeAbsolutePathContract(value: stri...|
|`normalizeRelativeDirContract`|fn||150-155|export function normalizeRelativeDirContract(value: strin...|
|`getConfigPath`|fn||163-165|export function getConfigPath(basePath: string): string|
|`isSameOrAncestorPath`|fn||174-188|export function isSameOrAncestorPath(|
|`deriveStaticRuntimePathState`|fn||197-222|function deriveStaticRuntimePathState(|
|`bootstrapRuntimePathState`|fn||231-233|export function bootstrapRuntimePathState(|
|`ensureRuntimePathState`|fn||251-257|export function ensureRuntimePathState(cwd: string): void|
|`getRuntimeBasePath`|fn||265-270|export function getRuntimeBasePath(fallbackPath: string):...|
|`getRuntimeContextPath`|fn||278-283|export function getRuntimeContextPath(fallbackPath: strin...|
|`setRuntimeGitPath`|fn||291-298|export function setRuntimeGitPath(gitPath?: string): void|
|`setRuntimeContextPath`|fn||306-308|export function setRuntimeContextPath(contextPath: string...|
|`setRuntimeWorktreePathState`|fn||316-326|export function setRuntimeWorktreePathState(options:|
|`getRuntimePathState`|fn||333-344|export function getRuntimePathState(): RuntimePathState|
|`formatRuntimePathForDisplay`|fn||352-365|export function formatRuntimePathForDisplay(absolutePath:...|
|`buildRuntimePathContext`|fn||376-385|export function buildRuntimePathContext(|
|`buildRuntimePathFacts`|fn||436-461|export function buildRuntimePathFacts(|


---

# pi-notify.ts | TypeScript | 887L | 44 symbols | 7 imports | 57 comments
> Path: `src/core/pi-notify.ts`
- @brief Implements pi-usereq command-notify, sound, and Pushover prompt-end helpers.
- @details Centralizes configuration defaults, status serialization, prompt-end outcome classification, placeholder substitution, detached shell-command execution, and native Pushover delivery. Runtime is O(m + c + b) in `agent_end` message count plus command length and Pushover payload size. Side effects include detached child-process spawning and outbound HTTPS requests.

## Imports
```
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as https from "node:https";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import { getInstallationPath, normalizePathSlashes } from "./path-context.js";
import type { UseReqConfig } from "./config.js";
```

## Definitions

- type `export type PiNotifySoundLevel = (typeof PI_NOTIFY_SOUND_LEVELS)[number];` (L25)
- @brief Represents one supported sound level.
- @details Narrows configuration parsing and runtime sound-command dispatch to the canonical four-state domain. Compile-time only and introduces no runtime cost.
- type `export type PiNotifyOutcome = (typeof PI_NOTIFY_OUTCOMES)[number];` (L37)
- @brief Represents one supported prompt-end outcome.
- @details Narrows prompt-end event classification and per-feature toggle routing to the canonical completed/interrupted/failed domain. Compile-time only and introduces no runtime cost.
- type `export type PiNotifyPushoverPriority = (typeof PI_NOTIFY_PUSHOVER_PRIORITIES)[number];` (L98)
- @brief Represents one supported Pushover priority value.
- @details Narrows Pushover configuration parsing and request serialization to the canonical `0|1` priority domain. Compile-time only and introduces no runtime cost.
### iface `export interface PiNotifyEventRequest` (L104-109)
- @brief Describes one prompt-end request used for command-notify and Pushover substitution.
- @details Stores the prompt command name, raw prompt arguments, runtime base path, and final prompt duration required to resolve runtime placeholders. The interface is compile-time only and introduces no runtime cost.

- type `export type PiNotifyConfigFields = Pick<` (L115)
- @brief Describes the configuration fields consumed by pi-notify helpers.
- @details Narrows the full project config to the persisted notify, sound, and Pushover fields used by status rendering, prompt-end routing, and shortcut toggles. Compile-time only and introduces no runtime cost.
- type `type PiNotifySpawn = typeof spawn;` (L145)
- @brief Describes the shell-spawn callback used by prompt-end command dispatch.
- @details Narrows the injected spawn surface so deterministic tests can capture detached shell invocations without patching global module state externally. Compile-time only and introduces no runtime cost.
### fn `export function normalizePiNotifySoundLevel(value: unknown): PiNotifySoundLevel` (L166-170)
- @brief Normalizes one persisted sound level.
- @details Accepts only canonical `none|low|mid|high` values and falls back to `none` for missing or invalid payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Raw persisted sound-level payload.
- @return {PiNotifySoundLevel} Canonical sound level.
- @satisfies REQ-131

### fn `export function normalizePiNotifyShortcut(value: unknown): string` (L179-183)
- @brief Normalizes one persisted sound toggle shortcut.
- @details Accepts any non-empty string so project config can carry raw pi shortcut syntax and falls back to the canonical default when the payload is empty or invalid. Runtime is O(n) in shortcut length. No external state is mutated.
- @param[in] value {unknown} Raw persisted shortcut payload.
- @return {string} Canonical non-empty shortcut string.
- @satisfies REQ-134

### fn `export function normalizePiNotifyCommand(value: unknown, fallback: string): string` (L193-195)
- @brief Normalizes one persisted shell-command string.
- @details Accepts any non-empty string so project config can override bundled command templates verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in command length. No external state is mutated.
- @param[in] value {unknown} Raw persisted command payload.
- @param[in] fallback {string} Canonical fallback command.
- @return {string} Canonical non-empty command string.
- @satisfies REQ-133, REQ-175

### fn `export function normalizePiNotifyTemplateValue(value: unknown, fallback: string): string` (L205-207)
- @brief Normalizes one persisted template string.
- @details Accepts any non-empty string so Pushover title and text templates can be user-configured verbatim, preserves internal and edge control characters, and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in template length. No external state is mutated.
- @param[in] value {unknown} Raw persisted template payload.
- @param[in] fallback {string} Canonical fallback template.
- @return {string} Canonical non-empty template string.
- @satisfies REQ-185, REQ-235

### fn `export function formatPiNotifyControlSequenceText(value: string): string` (L216-250)
- @brief Formats control characters for single-line menu rendering.
- @details Rewrites supported control bytes into escaped display sequences so configuration rows can render `Pushover text` inside a one-line settings list without executing the embedded control effects. Runtime is O(n) in text length. No external state is mutated.
- @param[in] value {string} Raw template text.
- @return {string} Escaped single-line display text.
- @satisfies REQ-235

### fn `export function parsePiNotifyControlSequenceText(value: string): string` (L259-304)
- @brief Decodes supported escaped control sequences from one menu input string.
- @details Converts the documented `\n`, `\r`, `\t`, `\\`, `\0`, `\b`, `\f`, and `\v` escape sequences into their raw byte forms while preserving unknown escapes verbatim so user-entered text is not lossy. Runtime is O(n) in text length. No external state is mutated.
- @param[in] value {string} Escaped menu input text.
- @return {string} Decoded raw template text.
- @satisfies REQ-235

### fn `export function hasPiNotifyPushoverCredentials(` (L313-318)
- @brief Tests whether both persisted Pushover credentials are non-empty.
- @details Performs exact empty-string checks against the normalized user and token fields so UI locking, config persistence, and prompt-end delivery can share one readiness rule. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-pushover-user-key" | "notify-pushover-api-token">} Effective Pushover credential subset.
- @return {boolean} `true` when both Pushover credential fields are non-empty.
- @satisfies REQ-168, REQ-234

### fn `export function normalizePiNotifyPushoverCredential(value: unknown): string` (L327-329)
- @brief Normalizes one persisted Pushover credential string.
- @details Accepts any trimmed string so the project config can store raw Pushover user and token values verbatim and falls back to the empty string for missing or invalid payloads. Runtime is O(n) in credential length. No external state is mutated.
- @param[in] value {unknown} Raw persisted credential payload.
- @return {string} Canonical credential string.
- @satisfies REQ-163

### fn `export function normalizePiNotifyPushoverPriority(value: unknown): PiNotifyPushoverPriority` (L338-340)
- @brief Normalizes one persisted Pushover priority value.
- @details Accepts only canonical `0` and `1` values, treating numeric-string `"1"` as high priority and every other payload as normal priority. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Raw persisted priority payload.
- @return {PiNotifyPushoverPriority} Canonical priority value.
- @satisfies REQ-172

### fn `export function formatPiNotifyStatus(config: Pick<UseReqConfig, "notify-enabled">): string` (L349-351)
- @brief Formats the global command-notify flag for UI value rendering.
- @details Serializes only the persisted global command-notify enable state so configuration menus and summaries can report `on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-enabled">} Effective command-notify configuration subset.
- @return {string} `on` when command-notify is globally enabled; otherwise `off`.
- @satisfies REQ-196

### fn `export function formatPiNotifyPushoverStatus(config: Pick<UseReqConfig, "notify-pushover-enabled">): string` (L360-362)
- @brief Formats the global Pushover flag for UI value rendering.
- @details Serializes only the persisted global Pushover enable state so configuration menus and summaries can report `on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-pushover-enabled">} Effective Pushover configuration subset.
- @return {string} `on` when Pushover is globally enabled; otherwise `off`.
- @satisfies REQ-163

### fn `export function cyclePiNotifySoundLevel(currentLevel: PiNotifySoundLevel): PiNotifySoundLevel` (L371-377)
- @brief Cycles one sound level through the canonical shortcut order.
- @details Advances persisted sound state in the exact order `none -> low -> mid -> high -> none`, enabling deterministic shortcut toggling and menu reuse. Runtime is O(1). No external state is mutated.
- @param[in] currentLevel {PiNotifySoundLevel} Current persisted sound level.
- @return {PiNotifySoundLevel} Next sound level in the cycle.
- @satisfies REQ-134

### fn `function isPiNotifyOutcomeEnabled(` (L388-402)
- @brief Tests whether one outcome-specific toggle is enabled.
- @details Reuses the canonical completed/interrupted/failed routing order shared by notify, sound, and Pushover event toggles. Runtime is O(1). No external state is mutated.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] completedEnabled {boolean} Enabled state for completed prompt termination.
- @param[in] interruptedEnabled {boolean} Enabled state for interrupted prompt termination.
- @param[in] failedEnabled {boolean} Enabled state for failed prompt termination.
- @return {boolean} `true` when the selected outcome flag is enabled.

### fn `function hasAgentEndStopReason(` (L411-421)
- @brief Detects whether one agent-end payload contains the requested stop reason.
- @details Scans assistant messages only so prompt-end classification remains stable even when user or tool-result messages also appear in the payload. Runtime is O(m) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Agent-end message list.
- @param[in] stopReason {"aborted" | "error"} Stop reason to detect.
- @return {boolean} `true` when an assistant message carries the requested stop reason.

### fn `export function classifyPiNotifyOutcome(event: Pick<AgentEndEvent, "messages">): PiNotifyOutcome` (L429-437)
- @brief Classifies one agent-end payload into the canonical pi-notify outcome.
- @details Treats assistant `stopReason=error` as `failed`, `stopReason=aborted` as `interrupted`, and every remaining terminal state as `completed`. Runtime is O(m) in message count. No external state is mutated.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @return {PiNotifyOutcome} Canonical prompt-end outcome.

### fn `function formatPiNotifyDuration(durationMs: number): string` (L446-451)
- @brief Formats one prompt-end duration for runtime placeholders.
- @details Floors the supplied duration to whole seconds, keeps minutes unbounded above 59, and zero-pads seconds to two digits so `%%TIME%%` aligns with status-bar elapsed formatting. Runtime is O(1). No external state is mutated.
- @param[in] durationMs {number} Prompt-end duration in milliseconds.
- @return {string} Duration rendered as `M:SS`.
- @satisfies REQ-187

### fn `function formatPiNotifyBasePath(basePath: string): string` (L460-471)
- @brief Formats one runtime base path for placeholder substitution.
- @details Emits `~` or `~/...` when the supplied path equals or descends from the current user home directory; otherwise emits the slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
- @param[in] basePath {string} Runtime base path.
- @return {string} Placeholder-ready base path string.
- @satisfies REQ-187

### fn `function formatPiNotifyResult(outcome: PiNotifyOutcome): string` (L480-489)
- @brief Formats one prompt-end outcome for `%%RESULT%%` substitution.
- @details Maps canonical prompt-end outcomes to the persisted human-readable result tokens reused by default notify-command and Pushover templates. Runtime is O(1). No external state is mutated.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {string} `successed`, `aborted`, or `failed`.
- @satisfies REQ-169, REQ-186, REQ-199

### fn `function buildPiNotifyRuntimeTemplateValues(` (L498-509)
- @brief Builds the raw runtime placeholder map for one prompt-end request.
- @details Resolves every placeholder value exactly once so notify-command and Pushover template substitution reuse the same prompt name, base path, elapsed time, argument string, and terminal outcome token. Runtime is O(p) in path length. No external state is mutated.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {{ "%%PROMT%%": string; "%%BASE%%": string; "%%TIME%%": string; "%%ARGS%%": string; "%%RESULT%%": string }} Raw placeholder-value map.

### fn `function quotePiNotifyInstallPath(installationPath: string): string` (L517-522)
- @brief Quotes one installation path for shell substitution.
- @details Emits POSIX single-quoted literals for `sh -lc` execution and CMD double-quoted literals for `cmd.exe /c` execution so `%%INSTALLATION_PATH%%` substitutions preserve whitespace safely. Runtime is O(n) in path length. No external state is mutated.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Shell-quoted installation path fragment.

### fn `function escapePiNotifyShellTemplateValue(value: string): string` (L530-539)
- @brief Escapes one placeholder value for double-quoted shell insertion.
- @details Escapes the characters interpreted specially by POSIX or CMD double-quoted strings so default notify-command templates remain safe when placeholders are embedded inside double quotes. Runtime is O(n) in value length. No external state is mutated.
- @param[in] value {string} Raw placeholder value.
- @return {string} Shell-escaped placeholder fragment without surrounding quotes.

### fn `export function substitutePiNotifyInstallPath(command: string, installationPath: string): string` (L549-554)
- @brief Substitutes `%%INSTALLATION_PATH%%` inside one shell command.
- @details Replaces every `%%INSTALLATION_PATH%%` token with a shell-quoted runtime installation path so bundled assets can be addressed safely from external commands. Runtime is O(n) in command length. No external state is mutated.
- @param[in] command {string} Raw configured shell command.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Runtime-ready command string.
- @satisfies REQ-169

### fn `function substitutePiNotifyShellTemplate(` (L566-578)
- @brief Substitutes runtime placeholders inside one shell-command template.
- @details Applies shell-quoted installation-path substitution plus shell-escaped prompt, base-path, elapsed-time, raw-argument, and outcome-result substitution expected by `PI_NOTIFY_CMD`. Runtime is O(n) in template length. No external state is mutated.
- @param[in] template {string} Raw shell-command template.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Runtime-ready shell command.
- @satisfies REQ-169, REQ-199

### fn `function substitutePiNotifyTextTemplate(` (L589-599)
- @brief Substitutes runtime placeholders inside one text template.
- @details Applies raw prompt name, home-relative base path, elapsed time, raw prompt arguments, and terminal outcome text without shell escaping so Pushover payloads preserve literal text. Runtime is O(n) in template length. No external state is mutated.
- @param[in] template {string} Raw text template.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {string} Placeholder-resolved text string.
- @satisfies REQ-186, REQ-187, REQ-199

### fn `function runPiNotifyShellCommand(command: string): void` (L607-618)
- @brief Executes one detached shell command without waiting for completion.
- @details Uses the platform-default shell contract already employed by sound-command execution and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] command {string} Runtime-ready shell command.
- @return {void} No return value.

### fn `function shouldRunPiNotifyCommand(` (L629-642)
- @brief Determines whether one prompt-end outcome should trigger command-notify.
- @details Requires a prompt-end request, the global command-notify enable flag, and the corresponding per-event notify toggle. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
- @return {boolean} `true` when command-notify prerequisites are satisfied.
- @satisfies REQ-174, REQ-176

### fn `function runPiNotifyCommand(` (L653-666)
- @brief Executes the configured command-notify shell command.
- @details Resolves the runtime installation path, substitutes runtime placeholders into `PI_NOTIFY_CMD`, and spawns the resulting command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {void} No return value.
- @satisfies REQ-169, REQ-175, REQ-176, REQ-199

### fn `function resolvePiNotifySoundCommand(` (L675-687)
- @brief Resolves the configured command for one non-`none` sound level.
- @details Selects the matching persisted command string from config without performing runtime substitution or shell execution. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Non-disabled sound level.
- @return {string} Configured command string for the requested level.

### fn `function shouldRunPiNotifySound(` (L697-708)
- @brief Determines whether one prompt-end outcome should trigger sound-command execution.
- @details Requires a non-`none` sound level and the corresponding per-event sound toggle. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {boolean} `true` when sound-command prerequisites are satisfied.
- @satisfies REQ-178

### fn `export function runPiNotifySoundCommand(` (L718-725)
- @brief Executes the configured sound command on an external shell.
- @details Resolves the runtime installation path, substitutes `%%INSTALLATION_PATH%%`, and spawns the configured command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Requested non-disabled sound level.
- @return {void} No return value.
- @satisfies REQ-132, REQ-133

### fn `function shouldRunPiNotifyPushover(` (L736-750)
- @brief Determines whether one prompt-end outcome should trigger Pushover delivery.
- @details Requires a prompt-end request, the global Pushover enable flag, the corresponding per-event Pushover toggle, and non-empty user plus token credentials. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
- @return {boolean} `true` when Pushover delivery prerequisites are satisfied.
- @satisfies REQ-166, REQ-168, REQ-184

### fn `function buildPiNotifyPushoverTitle(` (L761-767)
- @brief Builds the Pushover notification title for one prompt-end request.
- @details Resolves the configured `notify-pushover-title` template with raw runtime placeholder substitution so the pushed title remains configurable and deterministic. Runtime is O(n) in template length. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {string} Pushover title string.
- @satisfies REQ-185, REQ-186, REQ-187, REQ-199

### fn `function buildPiNotifyPushoverBody(` (L778-784)
- @brief Builds the Pushover message body for one prompt-end request.
- @details Resolves the configured `notify-pushover-text` template with raw runtime placeholder substitution so the pushed text remains configurable and deterministic. Runtime is O(n) in template length. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {string} Pushover message body.
- @satisfies REQ-185, REQ-186, REQ-187, REQ-199

### fn `function buildPiNotifyPushoverPayload(` (L795-807)
- @brief Builds the Pushover API payload for one prompt-end request.
- @details Encodes the configured token, user key, substituted title, priority, and substituted text as `application/x-www-form-urlencoded` fields accepted by the Pushover Message API. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {URLSearchParams} Encoded Pushover request payload.
- @satisfies REQ-167, REQ-172, REQ-185, REQ-186, REQ-199

### fn `function runPiNotifyPushoverRequest(` (L818-837)
- @brief Dispatches one native HTTPS request to the Pushover Message API.
- @details Serializes the request body as URL-encoded form data, posts it to `https://api.pushover.net/1/messages.json`, drains the response, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by outbound I/O. Side effects include one HTTPS request.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {void} No return value.
- @satisfies REQ-167, REQ-199

### fn `export function setPiNotifyHttpsRequestForTests(requestImpl: typeof https.request | undefined): void` (L845-847)
- @brief Replaces the native HTTPS request function used for Pushover delivery in deterministic tests.
- @details Accepts a drop-in `node:https.request` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local Pushover transport hook.
- @param[in] requestImpl {typeof https.request | undefined} Replacement HTTPS request function.
- @return {void} No return value.

### fn `export function setPiNotifySpawnForTests(spawnImpl: PiNotifySpawn | undefined): void` (L855-857)
- @brief Replaces the shell-spawn function used for notify and sound commands in deterministic tests.
- @details Accepts a drop-in `node:child_process.spawn` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local shell transport hook.
- @param[in] spawnImpl {PiNotifySpawn | undefined} Replacement shell-spawn function.
- @return {void} No return value.

### fn `export function runPiNotifyEffects(` (L868-887)
- @brief Dispatches prompt-end notify, sound, and Pushover effects for one agent-end payload.
- @details Classifies the terminal outcome, executes `PI_NOTIFY_CMD` when command-notify prerequisites are satisfied, executes the configured sound command when sound prerequisites are satisfied, and dispatches the native Pushover request when Pushover prerequisites are satisfied. Runtime is O(m + c + b) in message count, command length, and Pushover payload size. Side effects include child-process spawning and outbound HTTPS requests.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @param[in] request {PiNotifyEventRequest | undefined} Optional prompt-end request metadata used for command-notify and Pushover substitution.
- @return {void} No return value.
- @satisfies REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187, REQ-199

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiNotifySoundLevel`|type||25||
|`PiNotifyOutcome`|type||37||
|`PiNotifyPushoverPriority`|type||98||
|`PiNotifyEventRequest`|iface||104-109|export interface PiNotifyEventRequest|
|`PiNotifyConfigFields`|type||115||
|`PiNotifySpawn`|type||145||
|`normalizePiNotifySoundLevel`|fn||166-170|export function normalizePiNotifySoundLevel(value: unknow...|
|`normalizePiNotifyShortcut`|fn||179-183|export function normalizePiNotifyShortcut(value: unknown)...|
|`normalizePiNotifyCommand`|fn||193-195|export function normalizePiNotifyCommand(value: unknown, ...|
|`normalizePiNotifyTemplateValue`|fn||205-207|export function normalizePiNotifyTemplateValue(value: unk...|
|`formatPiNotifyControlSequenceText`|fn||216-250|export function formatPiNotifyControlSequenceText(value: ...|
|`parsePiNotifyControlSequenceText`|fn||259-304|export function parsePiNotifyControlSequenceText(value: s...|
|`hasPiNotifyPushoverCredentials`|fn||313-318|export function hasPiNotifyPushoverCredentials(|
|`normalizePiNotifyPushoverCredential`|fn||327-329|export function normalizePiNotifyPushoverCredential(value...|
|`normalizePiNotifyPushoverPriority`|fn||338-340|export function normalizePiNotifyPushoverPriority(value: ...|
|`formatPiNotifyStatus`|fn||349-351|export function formatPiNotifyStatus(config: Pick<UseReqC...|
|`formatPiNotifyPushoverStatus`|fn||360-362|export function formatPiNotifyPushoverStatus(config: Pick...|
|`cyclePiNotifySoundLevel`|fn||371-377|export function cyclePiNotifySoundLevel(currentLevel: PiN...|
|`isPiNotifyOutcomeEnabled`|fn||388-402|function isPiNotifyOutcomeEnabled(|
|`hasAgentEndStopReason`|fn||411-421|function hasAgentEndStopReason(|
|`classifyPiNotifyOutcome`|fn||429-437|export function classifyPiNotifyOutcome(event: Pick<Agent...|
|`formatPiNotifyDuration`|fn||446-451|function formatPiNotifyDuration(durationMs: number): string|
|`formatPiNotifyBasePath`|fn||460-471|function formatPiNotifyBasePath(basePath: string): string|
|`formatPiNotifyResult`|fn||480-489|function formatPiNotifyResult(outcome: PiNotifyOutcome): ...|
|`buildPiNotifyRuntimeTemplateValues`|fn||498-509|function buildPiNotifyRuntimeTemplateValues(|
|`quotePiNotifyInstallPath`|fn||517-522|function quotePiNotifyInstallPath(installationPath: strin...|
|`escapePiNotifyShellTemplateValue`|fn||530-539|function escapePiNotifyShellTemplateValue(value: string):...|
|`substitutePiNotifyInstallPath`|fn||549-554|export function substitutePiNotifyInstallPath(command: st...|
|`substitutePiNotifyShellTemplate`|fn||566-578|function substitutePiNotifyShellTemplate(|
|`substitutePiNotifyTextTemplate`|fn||589-599|function substitutePiNotifyTextTemplate(|
|`runPiNotifyShellCommand`|fn||607-618|function runPiNotifyShellCommand(command: string): void|
|`shouldRunPiNotifyCommand`|fn||629-642|function shouldRunPiNotifyCommand(|
|`runPiNotifyCommand`|fn||653-666|function runPiNotifyCommand(|
|`resolvePiNotifySoundCommand`|fn||675-687|function resolvePiNotifySoundCommand(|
|`shouldRunPiNotifySound`|fn||697-708|function shouldRunPiNotifySound(|
|`runPiNotifySoundCommand`|fn||718-725|export function runPiNotifySoundCommand(|
|`shouldRunPiNotifyPushover`|fn||736-750|function shouldRunPiNotifyPushover(|
|`buildPiNotifyPushoverTitle`|fn||761-767|function buildPiNotifyPushoverTitle(|
|`buildPiNotifyPushoverBody`|fn||778-784|function buildPiNotifyPushoverBody(|
|`buildPiNotifyPushoverPayload`|fn||795-807|function buildPiNotifyPushoverPayload(|
|`runPiNotifyPushoverRequest`|fn||818-837|function runPiNotifyPushoverRequest(|
|`setPiNotifyHttpsRequestForTests`|fn||845-847|export function setPiNotifyHttpsRequestForTests(requestIm...|
|`setPiNotifySpawnForTests`|fn||855-857|export function setPiNotifySpawnForTests(spawnImpl: PiNot...|
|`runPiNotifyEffects`|fn||868-887|export function runPiNotifyEffects(|


---

# pi-usereq-tools.ts | TypeScript | 178L | 7 symbols | 0 imports | 17 comments
> Path: `src/core/pi-usereq-tools.ts`
- @brief Declares the configurable pi-usereq active-tool inventory.
- @details Provides canonical custom-tool names, supported embedded-tool names, default enablement subsets, and normalization helpers shared by configuration loading, extension startup, and test doubles. The module is side-effect free. Lookup and normalization costs are linear in configured tool count.

## Definitions

- type `export type PiUsereqCustomToolName = (typeof PI_USEREQ_CUSTOM_TOOL_NAMES)[number];` (L79)
- @brief Represents one valid extension-owned configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_CUSTOM_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqEmbeddedToolName = (typeof PI_USEREQ_EMBEDDED_TOOL_NAMES)[number];` (L85)
- @brief Represents one valid embedded configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_EMBEDDED_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];` (L91)
- @brief Represents one valid configurable active-tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_STARTUP_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
### fn `export function isPiUsereqEmbeddedToolName(name: string): name is PiUsereqEmbeddedToolName` (L117-119)
- @brief Tests whether one tool name belongs to the supported embedded-tool subset.
- @details Performs one set-membership probe against `PI_USEREQ_EMBEDDED_TOOL_SET`. Runtime is O(1). No external state is mutated.
- @param[in] name {string} Candidate tool name.
- @return {boolean} `true` when the name belongs to the embedded configurable-tool subset.

### fn `export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[]` (L129-136)
- @brief Normalizes a user-configured active-tool list.
- @details Returns the default enabled-tool tuple when the input is not an array. Otherwise filters to string entries, removes names outside the configurable tool set, and deduplicates while preserving first-seen order. Time complexity is O(n). No external state is mutated.
- @param[in] value {unknown} Raw configuration payload for `enabled-tools`.
- @return {PiUsereqStartupToolName[]} Deduplicated canonical tool names.
- @satisfies REQ-064
- @post Returned values are members of `PI_USEREQ_STARTUP_TOOL_NAMES` only.

### fn `function buildPiUsereqStartupToolSortKey(` (L145-153)
- @brief Builds the menu-order partition key for one configurable tool name.
- @details Encodes the documented `Enable tools` ordering by grouping custom tools before embedded tools, placing non-`files-*` custom tools before `files-*` custom tools, and moving default-disabled names to the tail of each resolved partition. Runtime is O(1). No external state is mutated.
- @param[in] name {PiUsereqStartupToolName} Canonical configurable tool name.
- @return {[number, number, number, string]} Stable tuple `{group, subgroup, default_state, name}` used for lexicographic ordering.
- @satisfies REQ-007, REQ-231, REQ-232

### fn `export function comparePiUsereqStartupToolNames(` (L163-178)
- @brief Compares two configurable tool names using the documented menu order.
- @details Applies the partition key emitted by `buildPiUsereqStartupToolSortKey(...)` and falls back to lexical comparison inside the final key slot so the `Enable tools` submenu stays deterministic across runtimes. Runtime is O(1). No external state is mutated.
- @param[in] left {PiUsereqStartupToolName} Left configurable tool name.
- @param[in] right {PiUsereqStartupToolName} Right configurable tool name.
- @return {number} Negative when `left` sorts before `right`; positive when after; `0` when equal.
- @satisfies REQ-007, REQ-231, REQ-232

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqCustomToolName`|type||79||
|`PiUsereqEmbeddedToolName`|type||85||
|`PiUsereqStartupToolName`|type||91||
|`isPiUsereqEmbeddedToolName`|fn||117-119|export function isPiUsereqEmbeddedToolName(name: string):...|
|`normalizeEnabledPiUsereqTools`|fn||129-136|export function normalizeEnabledPiUsereqTools(value: unkn...|
|`buildPiUsereqStartupToolSortKey`|fn||145-153|function buildPiUsereqStartupToolSortKey(|
|`comparePiUsereqStartupToolNames`|fn||163-178|export function comparePiUsereqStartupToolNames(|


---

# prompt-command-catalog.ts | TypeScript | 46L | 2 symbols | 0 imports | 4 comments
> Path: `src/core/prompt-command-catalog.ts`
- @brief Declares the canonical bundled `req-*` prompt-command inventory.
- @details Centralizes prompt-command names shared by extension registration, configuration normalization, debug-menu rendering, and prompt-runtime orchestration. The module is side-effect free. Lookup cost is O(1) per exported constant access.

## Definitions

- type `export type PromptCommandName = (typeof PROMPT_COMMAND_NAMES)[number];` (L34)
- @brief Narrows prompt-command identifiers to the bundled command set.
- @details Compile-time alias reused by orchestration helpers, debug inventory normalization, and command registration. The alias introduces no runtime cost.
### fn `export function formatPromptCommandName(` (L42-46)
- @brief Formats one bundled prompt-command identifier as its slash-command name.
- @details Prefixes the canonical prompt name with `req-` so debug menus and log filters can use the invokable slash-command form without duplicating the underlying inventory. Runtime is O(n) in prompt-name length. No external state is mutated.
- @param[in] promptName {PromptCommandName} Canonical bundled prompt name.
- @return {`req-${PromptCommandName}`} Invokable slash-command name.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PromptCommandName`|type||34||
|`formatPromptCommandName`|fn||42-46|export function formatPromptCommandName(|


---

# prompt-command-runtime.ts | TypeScript | 1816L | 54 symbols | 12 imports | 58 comments
> Path: `src/core/prompt-command-runtime.ts`
- @brief Implements prompt-command preflight and worktree orchestration.
- @details Centralizes `req-<prompt>` repository validation, prompt-specific required-document checks, slash-command-owned worktree naming and lifecycle handling, session-backed cwd switching plus verification, persisted replacement-session context reuse for non-command lifecycle handlers, matched-success fast-forward merge finalization with restored-session transcript preservation, and command-side abort cleanup. Runtime is dominated by git subprocess execution plus bounded filesystem and session-file metadata checks. Side effects include active-session replacement, worktree creation and deletion, branch merges, and filesystem reads and writes.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { classifyPiNotifyOutcome, type PiNotifyOutcome } from "./pi-notify.js";
import {
import {
import {
import {
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { resolveRuntimeGitPath } from "./runtime-project-paths.js";
import {
```

## Definitions

### iface `export interface PromptRequiredDocSpec` (L45-48)
- @brief Describes one canonical required-document probe.
- @details Binds a canonical doc filename to the remediation prompt command surfaced on failure so prompt-specific doc validation can stay deterministic. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PromptCommandExecutionPlan` (L54-68)
- @brief Describes one prompt-command execution plan tracked across lifecycle hooks.
- @details Stores the prompt identity, runtime git root, associated branch name, original project base, execution context path, persisted origin and execution session files, and optional worktree metadata so the extension can switch all cwd surfaces before prompt dispatch and finalize worktree lifecycle after agent end. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandPostCreateHookContext` (L74-79)
- @brief Describes one post-create test hook payload for prompt-command worktrees.
- @details Exposes the git root, generated worktree name, sibling worktree path, and effective execution base so tests can simulate post-create verification failures deterministically. The interface is compile-time only and introduces no runtime cost.

- type `type PromptCommandPostCreateHook = (context: PromptCommandPostCreateHookContext) => void;` (L85)
- @brief Represents one synchronous test hook invoked after prompt worktree creation.
- @details Allows tests to mutate or remove newly created worktree artifacts before verification executes. The alias is compile-time only and introduces no runtime cost.
### iface `interface PromptCommandDebugOptions` (L91-94)
- @brief Describes optional debug logging context for prompt orchestration helpers.
- @details Carries the effective project configuration and current workflow state so prompt-runtime helpers can append selected debug entries without depending on extension UI types. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionMessageOptions` (L100-102)
- @brief Describes prompt-delivery options supported by replacement-session callbacks.
- @details Mirrors the documented `sendUserMessage(...)` delivery modes needed when prompt orchestration targets a replacement session after a slash-command-owned session switch. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionSwitchOptions` (L108-110)
- @brief Describes the replacement-session callback options accepted by session switching.
- @details Mirrors the documented pi runtime `withSession(...)` hook so prompt-command orchestration can continue work against the replacement session after the old command context becomes stale. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandActiveContext extends PromptCommandSessionContext` : PromptCommandSessionContext (L116-121)
- @brief Describes the minimal session-bound surface available after session replacement.
- @details Extends the shared prompt-command context with `sendUserMessage(...)` so prompt dispatch can target the replacement session without reusing stale pre-switch runtime objects. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionEntry` (L127-133)
- @brief Describes one serializable session entry copied into a materialized execution-session file.
- @details Captures the stable tree-entry fields needed to write a JSONL session snapshot for cross-cwd session replacement when the origin session file has not been flushed yet. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionContext` (L139-151)
- @brief Describes the minimal command-context session surface used by prompt orchestration.
- @details Narrows extension command contexts to the `switchSession(...)` hook, the mutable `cwd` mirror, and the session metadata probes required for cwd verification and session snapshot materialization. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandContextError extends Error` : Error (L157-159)
- @brief Describes one error object enriched with a replacement-session context.
- @details Allows prompt orchestration helpers to preserve the last valid session-bound context across replacement boundaries so callers can continue notifications and status updates after switch-triggered failures. The interface is compile-time only and introduces no runtime cost.

### fn `function isUsablePromptSessionFile(` (L174-192)
- @brief Tests whether the current session file remains reusable for prompt-command bootstrap.
- @details Accepts only persisted session files whose header cwd is readable, still exists on disk, and remains inside the active project base. This rejects stale execution-session files that still point at deleted or sibling worktrees from earlier prompt runs. Runtime is O(p) plus one session-header read. No external state is mutated.
- @param[in] sessionFile {string | undefined} Candidate current session file.
- @param[in] projectBase {string} Active project base path.
- @return {sessionFile is string} `true` when the session file remains reusable for prompt bootstrap.

### fn `function resolvePromptSessionFile(sessionFile: string | undefined, cwd: string): string` (L202-212)
- @brief Resolves the session file path used as the origin for prompt-command session switching.
- @details Reuses the current session file only when its persisted header cwd is still readable, exists on disk, and remains inside the active project base. Otherwise allocates a fresh session file path rooted at the supplied cwd so later worktree switching and restoration never inherit stale deleted-worktree session metadata. Runtime is dominated by one optional session-header read plus optional session-file allocation. Side effects include session-file path allocation when the active session metadata is stale or ephemeral.
- @param[in] sessionFile {string | undefined} Current active session file when available.
- @param[in] cwd {string} Working directory that should own the resolved session file.
- @return {string} Session file path reserved for prompt orchestration.
- @throws {ReqError} Throws when a session file path cannot be resolved.

### fn `function writePromptExecutionSessionSnapshot(` (L226-252)
- @brief Writes one execution-session snapshot file with the target worktree cwd.
- @details Persists a version-3 JSONL session header whose `cwd` equals the supplied target worktree path, then appends the supplied current-session branch entries unchanged so pi can reopen the replacement session in the correct cwd even when the origin session file has not been flushed yet. Runtime is O(n) in branch-entry count plus serialized byte size. Side effects include directory creation and file overwrite.
- @param[in] sessionFile {string} Target execution-session file path.
- @param[in] sessionId {string} Generated execution-session identifier.
- @param[in] targetCwd {string} Worktree path stored in the session header.
- @param[in] parentSessionFile {string | undefined} Optional origin session path recorded as `parentSession`.
- @param[in] branchEntries {PromptCommandSessionEntry[]} Current session branch entries copied into the new session file.
- @return {void} No return value.
- @throws {ReqError} Throws when the execution-session snapshot cannot be written.
- @satisfies REQ-271

### fn `function createPromptExecutionSessionFile(` (L265-288)
- @brief Creates the persisted session file used for worktree-backed prompt execution.
- @details Forks the resolved origin session into the target cwd when the origin session file is already persisted. Otherwise allocates a new execution-session path, materializes a JSONL header whose `cwd` equals the target worktree path, and copies the current in-memory session branch so pi can switch into the worktree session with the correct runtime cwd. Runtime is dominated by session-file copy or snapshot-write cost. Side effects include session-file creation under the target cwd session directory.
- @param[in] sourceSessionFile {string} Origin session file path.
- @param[in] targetCwd {string} Target working directory stored in the execution-session header.
- @param[in] sessionDir {string | undefined} Active session directory reused for the forked execution session when available.
- @param[in] sourceSessionBranch {PromptCommandSessionEntry[] | undefined} Current in-memory session branch copied when the origin session file has not been flushed yet.
- @return {string} Persisted execution-session file path.
- @throws {ReqError} Throws when the execution-session file cannot be created.
- @satisfies REQ-271

### fn `function getPromptSessionCwd(ctx?: PromptCommandSessionContext): string | undefined` (L296-304)
- @brief Reads the current active session cwd from a prompt-command context.
- @details Returns the session-manager cwd only when the supplied context exposes the documented `getCwd()` probe and the probe remains valid after any prior session replacement. Stale or missing probes degrade to `undefined` so verification paths never reuse invalidated pre-switch session objects. Runtime is O(1). No external state is mutated.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {string | undefined} Active session cwd when available.

### fn `function getPromptSessionFile(ctx?: PromptCommandSessionContext): string | undefined` (L312-320)
- @brief Reads the current active session file from a prompt-command context.
- @details Returns the session-manager file path only when the supplied context exposes the documented `getSessionFile()` probe and the probe remains valid after any prior session replacement. Stale or missing probes degrade to `undefined` so verification paths never reuse invalidated pre-switch session objects. Runtime is O(1). No external state is mutated.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {string | undefined} Active session file when available.

### fn `function getPromptContextCwd(ctx?: PromptCommandSessionContext): string | undefined` (L328-334)
- @brief Reads the current context cwd from a prompt-command context.
- @details Returns the context `cwd` only when the supplied getter remains valid after any prior session replacement. Stale getters degrade to `undefined` so verification paths never depend on invalidated pre-switch command objects. Runtime is O(1). No external state is mutated.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {string | undefined} Context cwd when available.

### fn `function resolvePromptCommandSwitchContext(` (L344-359)
- @brief Resolves the best available command-capable context for prompt session switching.
- @details Prefers the caller-supplied context when it still exposes `switchSession(...)`, otherwise falls back to the persisted replacement-session context associated with the execution-session file so lifecycle handlers can complete closure when pi emits non-command event contexts. Runtime is O(1). No external state is mutated.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose execution-session file keys the persisted context.
- @param[in] ctx {PromptCommandSessionContext | undefined} Caller-supplied prompt-command context.
- @return {{ context: PromptCommandSessionContext | undefined; source: "provided" | "persisted" | "missing" }} Preferred switch context plus its provenance.
- @satisfies REQ-272, REQ-276

### fn `function syncPromptCommandProcessCwd(expectedPath: string, stageLabel: string): void` (L370-390)
- @brief Aligns the host process cwd to one expected prompt-orchestration path.
- @details Applies `process.chdir(...)` only when the host process is still anchored to a different directory than the active prompt session, then re-reads `process.cwd()` and throws a deterministic error when the mutation fails or does not take effect. Runtime is O(p) in path length plus one optional cwd mutation. Side effect: mutates the host process cwd.
- @param[in] expectedPath {string} Path that `process.cwd()` must match.
- @param[in] stageLabel {string} Human-readable verification stage label.
- @return {void} No return value.
- @throws {ReqError} Throws when `process.chdir(...)` fails or leaves `process.cwd()` misaligned.
- @satisfies REQ-257, REQ-272

### fn `function readPromptSessionFileCwd(sessionFile: string): string | undefined` (L398-422)
- @brief Reads the persisted working directory recorded in one prompt-command session file header.
- @details Opens the JSONL session file, parses the first non-empty line as JSON, and returns the `cwd` field when present as a string so session-target verification can rely on live on-disk session state instead of stale handler-scoped `ctx` references. Runtime is O(n) in header size. No external state is mutated.
- @param[in] sessionFile {string} Absolute session-file path.
- @return {string | undefined} Persisted session cwd when readable; otherwise undefined.

### fn `function readPromptSessionJsonLines(` (L431-478)
- @brief Reads one persisted session file as ordered parsed JSONL records.
- @details Loads the raw session file, preserves every non-empty serialized line verbatim, parses each line as one JSON object, and rejects unreadable or structurally invalid files so prompt-closure helpers can replay exact execution-session transcript records into the restored base session without reserialization drift. Runtime is O(n) in session-file size. No external state is mutated.
- @param[in] sessionFile {string} Absolute session-file path.
- @return {Array<{ rawLine: string; parsed: Record<string, unknown> }>} Parsed non-empty JSONL lines in file order.
- @throws {ReqError} Throws when the file cannot be read, when it contains no JSONL records, when any record is not a JSON object, or when the header record is missing.

### fn `function preservePromptCommandExecutionTranscript(plan: PromptCommandExecutionPlan): void` (L488-585)
- @brief Copies successful execution-session transcript records into the restored base session file.
- @details Reads the execution session JSONL file, preserves the original base-session header when it already exists, materializes a restored base-session header when the reserved original session file is still pending persistence, appends any execution-session records missing from the original session in original execution order, and re-reads the restored file to verify both `base-path` cwd and copied entry identifiers. Runtime is O(n) in combined session-file size. Side effects include session-file creation or append operations for the restored base session.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose original and execution session files must be synchronized.
- @return {void} No return value.
- @throws {ReqError} Throws when either session file is unreadable or when appended execution records are not persisted to the original session file.
- @satisfies REQ-208

### fn `function verifyPromptCommandSessionTarget(` (L598-642)
- @brief Verifies that the active session file and cwd surfaces match one expected prompt-orchestration target.
- @details Re-reads the persisted session-file header when present plus the host `process.cwd()` and throws on the first mismatch so prompt commands abort before prompt dispatch or prompt-end handling whenever session switching leaves execution attached to the wrong cwd. A missing persisted session file is treated as a non-fatal lazy-persistence state because pi's `SessionManager` writes session files on first assistant flush rather than eagerly during `ctx.switchSession(sessionPath)`; when the file is absent, pi aligns its internal session cwd to the live `process.cwd()`, so verifying `process.cwd()` alone is authoritative in that state. Reads of `ctx.cwd`, `ctx.sessionManager.getCwd()`, and `ctx.sessionManager.getSessionFile()` are advisory only because the pi `ctx.switchSession(sessionPath)` SDK contract does not mutate the handler-scoped `ctx` object, so those probes stay bound to the pre-switch session and a divergent value alone never triggers abort; they only surface a mismatch when they disagree with both the persisted header cwd and the live `process.cwd()`. Runtime is O(p) in aggregate path length plus one session-file header read. No external state is mutated.
- @param[in] expectedSessionFile {string} Session file that must remain active.
- @param[in] expectedPath {string} Path that every live cwd surface must match.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context retained for advisory reads.
- @param[in] stageLabel {string} Human-readable verification stage label.
- @return {void} No return value.
- @throws {ReqError} Throws when the persisted session-file header cwd diverges from the expected target or when `process.cwd()` diverges from the expected target.
- @satisfies REQ-257, REQ-272

### fn `function verifyPromptCommandClosureArtifacts(` (L652-687)
- @brief Verifies persisted prompt execution artifacts before successful closure merge.
- @details Re-reads the persisted execution-session header, verifies the worktree path still exists, confirms the sibling worktree remains registered, and confirms the linked branch is still present before prompt-end closure attempts to restore `base-path` and merge from the original repository. Unlike prompt-start activation checks, this helper intentionally does not require the live process cwd or current session-bound context to remain on `worktree-path`, because pi CLI may already have started end-of-session session replacement or other post-run housekeeping before the extension finishes closure handling. Runtime is dominated by one session-file read, two git subprocess checks, and bounded filesystem probes. No external state is mutated.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan.
- @return {void} No return value.
- @throws {ReqError} Throws when persisted execution-session metadata or worktree artifacts no longer match the expected worktree target.
- @satisfies REQ-208, REQ-219, REQ-258, REQ-282

### fn `async function switchPromptCommandSession(` (L698-727)
- @brief Switches the active prompt session to one persisted session file when required.
- @details Calls `ctx.switchSession(sessionPath, { withSession })` so current pi runtimes can expose a fresh replacement-session context for every post-switch session-bound operation. When a runtime ignores the callback, the helper falls back to the caller-supplied context and downstream verification continues to rely on the persisted session-file header plus `process.cwd()`. If pi surfaces only the documented stale-extension-context error while invalidating the old execution-session closure, the helper treats that side effect as non-fatal and lets downstream verification confirm whether the target session actually became active. Runtime is dominated by the session switch. Side effects include active-session replacement and cwd mutation by the host runtime.
- @param[in] sessionFile {string} Target persisted session file.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {Promise<PromptCommandSessionContext | undefined>} Replacement-session context when the runtime provides one; otherwise the caller-supplied context.
- @throws {ReqError} Throws when the context cannot switch sessions, when the host cancels the switch, or when later verification proves the target session never became active.
- @satisfies REQ-068, REQ-271, REQ-272

### fn `function isPromptCommandStaleContextError(error: unknown): boolean` (L736-739)
- @brief Detects the documented stale-extension-context runtime error during prompt-command session switching.
- @details Matches the guarded pi runtime error emitted when the old execution-session closure is invalidated during a session replacement or reload. Prompt-command session-switch helpers use this detector to distinguish a late stale-context side effect from genuine switch failures, then rely on post-switch verification to confirm whether the target session actually became active. Runtime is O(n) in message length only when an error is supplied. No external state is mutated.
- @param[in] error {unknown} Candidate thrown value.
- @return {boolean} `true` when the value matches the stale-extension-context runtime error.
- @satisfies REQ-280

### fn `function attachPromptCommandErrorContext(` (L748-756)
- @brief Attaches the last valid prompt-command context to one thrown error.
- @details Preserves the replacement-session context discovered after `ctx.switchSession(...)` so outer callers can continue UI notifications and cleanup without reusing stale pre-switch command objects. Runtime is O(1). Side effect: mutates the error object when it is an `Error` instance.
- @param[in] error {unknown} Thrown value.
- @param[in] ctx {PromptCommandSessionContext | undefined} Last valid prompt-command context.
- @return {unknown} Original thrown value with optional attached prompt context.

### fn `export function getPromptCommandErrorContext(` (L764-770)
- @brief Reads an attached prompt-command context from one thrown error.
- @details Returns the replacement-session context captured by prompt orchestration helpers when a switch-triggered failure occurs after the original command context became stale. Runtime is O(1). No external state is mutated.
- @param[in] error {unknown} Thrown value.
- @return {PromptCommandSessionContext | undefined} Attached prompt-command context when available.

### fn `function runCapture(command: string[], cwd: string): ReturnType<typeof spawnSync>` (L851-856)
- @brief Executes one git subprocess synchronously and captures UTF-8 output.
- @details Delegates to `spawnSync`, preserves the supplied working directory, and returns the raw subprocess result used by prompt-command orchestration. Runtime is dominated by external process execution. Side effects include process spawning.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] cwd {string} Working directory for the subprocess.
- @return {ReturnType<typeof spawnSync>} Captured subprocess result.

### fn `export function setPromptCommandPostCreateHookForTests(` (L864-868)
- @brief Stores or clears the prompt-command post-create test hook.
- @details Enables deterministic simulation of post-create worktree verification failures without altering production control flow. Runtime is O(1). Side effect: mutates module-local test state.
- @param[in] hook {PromptCommandPostCreateHook | undefined} Optional replacement hook.
- @return {void} No return value.

### fn `function resolvePromptDocsRoot(projectBase: string, config: UseReqConfig): string` (L877-880)
- @brief Resolves the configured docs root for one project base.
- @details Joins the project base with the normalized `docs-dir` value while stripping trailing separators from the persisted config field. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Absolute project root.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Absolute canonical docs root path.

### fn `function resolveWorktreePaths(` (L890-917)
- @brief Resolves the effective worktree project base relative to the git root.
- @details Reuses the original project-base location relative to the git root so nested repository subdirectories remain aligned inside the sibling worktree. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Original absolute project base path.
- @param[in] gitPath {string} Absolute runtime git root path.
- @param[in] worktreeName {string} Created worktree name.
- @return {{ worktreePath: string; worktreeBasePath: string }} Derived worktree paths.

### fn `function sanitizePromptWorktreeBranchName(branch: string): string` (L925-927)
- @brief Rewrites a branch name into a filesystem-safe token for prompt worktrees.
- @details Replaces characters invalid for worktree directory and branch-name generation with `-`. Runtime is O(n). No external state is mutated.
- @param[in] branch {string} Raw branch name.
- @return {string} Sanitized token.

### fn `function validatePromptWorktreeName(wtName: string): boolean` (L935-940)
- @brief Validates a prompt-command-generated worktree or branch name.
- @details Rejects empty names, dot-path markers, whitespace, and filesystem-invalid characters. Runtime is O(n). No external state is mutated.
- @param[in] wtName {string} Candidate worktree name.
- @return {boolean} `true` when the name is acceptable for worktree creation.

### fn `function throwPromptGitStatusError(): never` (L948-950)
- @brief Throws the canonical prompt-command git-preflight failure.
- @details Normalizes all repository-validation failures to the contractually stable prompt-command error string consumed by tests and downstream prompt workflows. Runtime is O(1). No external state is mutated.
- @return {never} Always throws.
- @throws {ReqError} Always throws with exit code `1`.

### fn `function validatePromptGitState(projectBase: string, config?: UseReqConfig): string` (L961-1005)
- @brief Runs prompt-command-owned git validation and returns the runtime git root.
- @details Validates work-tree membership, porcelain cleanliness, and symbolic or detached `HEAD` presence without invoking extension custom-tool executors. Runtime is dominated by git subprocess execution. Side effects include process spawning.
- @param[in] projectBase {string} Absolute current project base.
- @param[in] config {UseReqConfig | undefined} Optional effective project configuration used to ignore extension-owned debug-log artifacts.
- @return {string} Absolute runtime git root.
- @throws {ReqError} Throws the canonical prompt-command git-preflight error on any validation failure.
- @satisfies REQ-200, REQ-220

### fn `function resolveCurrentPromptBranchName(gitRoot: string): string` (L1013-1018)
- @brief Resolves the current local branch name used by prompt-command orchestration.
- @details Reads `git branch --show-current`, falls back to `unknown` when git cannot provide a branch name, and preserves the raw branch token for later worktree-name generation and state tracking. Runtime is dominated by one git subprocess. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @return {string} Current branch name or `unknown` when unavailable.

### fn `function formatPromptWorktreeExecutionId(timestamp: Date): string` (L1032-1034)
- @brief Formats one prompt-worktree execution identifier.
- @details Serializes the supplied timestamp as `YYYYMMDDHHMMSS` with zero-padded calendar and clock fields so generated worktree names remain stable, lexicographically sortable, and requirement-compatible. Runtime is O(1). No external state is mutated.
- @param[in] timestamp {Date} Timestamp to encode.
- @return {string} Formatted execution identifier.

### fn `function getNextPromptWorktreeExecutionId(): string` (L1041-1054)
- @brief Resolves the next unique prompt-worktree execution identifier.
- @details Formats the current wall-clock second as `YYYYMMDDHHMMSS`, then monotonically advances by one-second steps until the identifier is strictly greater than the last value emitted in the current host process. This preserves the documented timestamp-only name shape while preventing immediate same-process worktree-name reuse after fast back-to-back prompt starts. Runtime is O(1) in the common case and O(k) in repeated same-second collisions. Side effect: mutates process-scoped execution-id persistence.
- @return {string} Unique execution identifier for worktree naming.

### fn `function buildPromptWorktreeName(gitRoot: string, config: UseReqConfig): string` (L1065-1076)
- @brief Builds the prompt-command worktree name without invoking agent-tool executors.
- @details Combines the normalized persisted worktree prefix, repository basename, sanitized current branch, and timestamp execution identifier into the dedicated prompt-command worktree name. Runtime is O(1) plus git execution cost. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Generated worktree and branch name.
- @throws {ReqError} Throws when the generated name is invalid.
- @satisfies REQ-206, REQ-220

### fn `function promptWorktreeBranchExists(gitRoot: string, branchName: string): boolean` (L1085-1094)
- @brief Tests whether the exact prompt-command branch is present in the local branch list.
- @details Queries `git branch --list --format=%(refname:short)` and returns a boolean without mutating repository state. Runtime is dominated by one git subprocess plus O(n) parsing in listed branch count. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] branchName {string} Candidate local branch name.
- @return {boolean} `true` when the exact local branch is listed.

### fn `function promptWorktreeRegistered(gitRoot: string, worktreePath: string): boolean` (L1103-1114)
- @brief Tests whether the exact prompt-command worktree is registered.
- @details Scans `git worktree list --porcelain` for the resolved target path so cleanup and verification can distinguish registered worktrees from unrelated sibling directories. Runtime is dominated by one git subprocess plus O(n) parsing in listed worktree count. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] worktreePath {string} Absolute sibling worktree path.
- @return {boolean} `true` when the exact path is registered as a git worktree.

### fn `function cleanupPromptWorktreeCreation(` (L1124-1138)
- @brief Removes partially created prompt-command worktree resources.
- @details Force-removes the registered sibling worktree when present, deletes the matching local branch, and falls back to filesystem removal for leftover directories so failed prompt preflight leaves no reusable worktree residue. Runtime is dominated by git subprocess execution. Side effects include branch deletion and directory removal.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] worktreePath {string} Absolute sibling worktree path.
- @param[in] worktreeName {string} Exact worktree and branch name.
- @return {void} No return value.

### fn `function createPromptWorktree(` (L1152-1272)
- @brief Creates and verifies the prompt-command worktree and branch.
- @details Creates the sibling worktree, mirrors project config when present, runs the optional post-create test hook, verifies git worktree registration, verifies git branch listing, verifies filesystem paths before prompt dispatch, and appends selected debug entries for worktree creation. Failed verification triggers immediate rollback. Runtime is dominated by git subprocess execution and filesystem metadata checks. Side effects include worktree creation, branch creation, directory creation, file copying, optional debug-log writes, and rollback on failure.
- @param[in] projectBase {string} Absolute original project base.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] worktreeName {string} Exact worktree and branch name.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {{ worktreePath: string; worktreeBasePath: string }} Verified worktree paths.
- @throws {ReqError} Throws when worktree creation, verification, or rollback finalization fails.
- @satisfies REQ-206, REQ-219, REQ-220, REQ-245

### fn `function deletePromptWorktree(` (L1285-1345)
- @brief Deletes prompt-command worktree resources without invoking custom-tool executors.
- @details Force-removes the sibling worktree and matching branch, verifies both are absent so prompt finalization remains independent from agent-tool implementations, and appends selected debug entries for worktree deletion. Runtime is dominated by git subprocess execution plus filesystem probes. Side effects include worktree deletion, branch deletion, and optional debug-log writes.
- @param[in] projectBase {string} Absolute original project base.
- @param[in] worktreeName {string} Exact worktree and branch name.
- @param[in] promptName {PromptCommandName | undefined} Optional bundled prompt identifier for debug logging.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {void} No return value.
- @throws {ReqError} Throws when cleanup cannot remove the worktree and branch fully.
- @satisfies REQ-208, REQ-220, REQ-245

### fn `export function getPromptRequiredDocs(promptName: PromptCommandName): readonly PromptRequiredDocSpec[]` (L1354-1356)
- @brief Returns the canonical required-document probes for one prompt command.
- @details Performs a constant-time lookup in the prompt-doc matrix used by command preflight validation. No filesystem access occurs.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @return {readonly PromptRequiredDocSpec[]} Required-doc definitions in probe order.
- @satisfies REQ-201, REQ-202

### fn `export function validatePromptRequiredDocs(` (L1369-1420)
- @brief Runs prompt-specific required-document validation.
- @details Resolves the configured docs root, verifies the prompt-mapped canonical docs exist as files, throws a deterministic remediation error for the first missing document, and appends selected debug entries for required-doc checks. Runtime is O(d) in required-doc count plus filesystem metadata cost. Side effects are limited to filesystem reads and optional debug-log writes.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {void} No return value.
- @throws {ReqError} Throws when a required canonical doc is missing.
- @satisfies REQ-201, REQ-202, REQ-203, REQ-245

### fn `export function preparePromptCommandExecution(` (L1437-1513)
- @brief Prepares prompt-command execution for one bundled prompt.
- @details Runs slash-command-owned git validation, enforces the prompt-specific required-doc matrix, resolves persisted origin and execution session files, applies the effective worktree policy, generates and verifies a dedicated worktree when enabled, and returns the execution plan consumed by prompt rendering plus lifecycle hooks. Worktree-backed execution reuses the active session directory for the forked session file. Runtime is dominated by git subprocesses, worktree creation, and optional session-file cloning. Side effects include worktree creation, session-file creation, filesystem reads, and optional prompt debug-log writes.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] promptArgs {string} Raw prompt argument string.
- @param[in] projectBase {string} Absolute current project base.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] currentSessionFile {string | undefined} Active session file used as the switch origin when available.
- @param[in] currentSessionDir {string | undefined} Active session directory reused when the execution session is forked.
- @param[in] currentSessionBranch {PromptCommandSessionEntry[] | undefined} Active in-memory session branch copied when the origin session file is not flushed yet.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {PromptCommandExecutionPlan} Prepared execution plan.
- @throws {ReqError} Throws when repository validation, required-doc validation, worktree creation, or session preparation fails.
- @satisfies REQ-200, REQ-203, REQ-206, REQ-207, REQ-215, REQ-219, REQ-220, REQ-245, REQ-256, REQ-271

### fn `export async function activatePromptCommandExecution(` (L1524-1557)
- @brief Activates the prepared prompt execution path before prompt dispatch or agent start.
- @details Switches the active session to the execution-session file when worktree routing changed the cwd, re-aligns `process.cwd()` to the execution path, verifies active-session cwd plus cwd mirrors after the switch completes, and stores the verified command-capable replacement-session context for later closure handling. Runtime is dominated by the optional session switch and one optional cwd mutation. Side effects include active-session replacement, host-process cwd mutation, runtime-path state mutation, and process-scoped command-context persistence.
- @param[in] plan {PromptCommandExecutionPlan} Prepared prompt execution plan.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @return {Promise<PromptCommandSessionContext | undefined>} Active prompt-command context after any required session switch.
- @throws {ReqError} Throws when the session switch or cwd verification fails.
- @satisfies REQ-206, REQ-207, REQ-257, REQ-272, REQ-276

### fn `export async function restorePromptCommandExecution(` (L1569-1633)
- @brief Restores the original project base path before merge or session-closure return.
- @details Switches the active session back to the original session file when worktree routing changed the cwd, re-aligns `process.cwd()` to `base-path`, verifies the restored session target, reuses the persisted replacement-session context when lifecycle handlers receive non-command contexts, tolerates the documented stale-extension-context error when the old replacement-session closure becomes invalid immediately after a successful restore, emits optional workflow restoration debug entries, and clears active worktree path facts before session closure continues. Runtime is dominated by the optional session switch and one optional cwd mutation. Side effects include active-session replacement, host-process cwd mutation, runtime-path state mutation, and optional workflow-debug writes.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose original base should be restored.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {Promise<PromptCommandSessionContext | undefined>} Active prompt-command context after any required restoration switch.
- @throws {ReqError} Throws when the session switch or cwd verification fails.
- @satisfies REQ-208, REQ-209, REQ-245, REQ-257, REQ-272, REQ-276

### fn `export async function abortPromptCommandExecution(` (L1644-1690)
- @brief Aborts one prepared prompt-command execution before pi CLI takes ownership.
- @details Restores the original session-backed cwd and deletes any created worktree plus branch when command-side preflight, prompt rendering, or prompt handoff fails before agent completion. Restoration failures are returned as structured cleanup errors so the original preflight failure is not masked. Runtime is dominated by the optional session switch plus git subprocess execution. Side effects include active-session replacement, optional worktree deletion, and optional debug-log writes.
- @param[in] plan {PromptCommandExecutionPlan} Prepared prompt execution plan.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {Promise<{ cleanupSucceeded: boolean; errorMessage?: string; activeContext?: PromptCommandSessionContext }>} Abort-cleanup facts plus the last valid active prompt-command context.
- @satisfies REQ-226, REQ-220, REQ-245

### fn `export async function finalizePromptCommandExecution(` (L1701-1804)
- @brief Finalizes one matched successful worktree-backed prompt execution.
- @details Re-verifies persisted execution-session metadata plus worktree artifacts, copies any execution-session transcript records missing from the original session file, restores the original session-backed `base-path`, fast-forward merges the successful worktree branch from `base-path`, deletes the worktree after merge success, and preserves the restored base session across closure failures. Closure intentionally treats `base-path` restoration as authoritative even when pi CLI has already started end-of-session session replacement or other housekeeping that moved the live runtime away from `worktree-path`. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file appends, active-session replacement, branch merges, worktree deletion, and optional debug-log writes.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {Promise<{ mergeAttempted: boolean; mergeSucceeded: boolean; cleanupSucceeded: boolean; errorMessage?: string; activeContext?: PromptCommandSessionContext }>} Finalization facts plus the last valid active prompt-command context.
- @satisfies REQ-208, REQ-209, REQ-220, REQ-245, REQ-282

### fn `export function classifyPromptCommandOutcome(` (L1812-1816)
- @brief Maps one `agent_end` payload into the canonical prompt-worktree finalization outcome.
- @details Delegates to the shared notification outcome classifier so worktree merge and fork-session retention decisions stay aligned with prompt-end notification routing. Runtime is O(m) in assistant message count. No external state is mutated.
- @param[in] event {Pick<import("@mariozechner/pi-coding-agent").AgentEndEvent, "messages">} Agent-end payload subset.
- @return {PiNotifyOutcome} Canonical prompt-end outcome.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PromptRequiredDocSpec`|iface||45-48|export interface PromptRequiredDocSpec|
|`PromptCommandExecutionPlan`|iface||54-68|export interface PromptCommandExecutionPlan|
|`PromptCommandPostCreateHookContext`|iface||74-79|interface PromptCommandPostCreateHookContext|
|`PromptCommandPostCreateHook`|type||85||
|`PromptCommandDebugOptions`|iface||91-94|interface PromptCommandDebugOptions|
|`PromptCommandSessionMessageOptions`|iface||100-102|interface PromptCommandSessionMessageOptions|
|`PromptCommandSessionSwitchOptions`|iface||108-110|interface PromptCommandSessionSwitchOptions|
|`PromptCommandActiveContext`|iface||116-121|interface PromptCommandActiveContext extends PromptComman...|
|`PromptCommandSessionEntry`|iface||127-133|interface PromptCommandSessionEntry|
|`PromptCommandSessionContext`|iface||139-151|interface PromptCommandSessionContext|
|`PromptCommandContextError`|iface||157-159|interface PromptCommandContextError extends Error|
|`isUsablePromptSessionFile`|fn||174-192|function isUsablePromptSessionFile(|
|`resolvePromptSessionFile`|fn||202-212|function resolvePromptSessionFile(sessionFile: string | u...|
|`writePromptExecutionSessionSnapshot`|fn||226-252|function writePromptExecutionSessionSnapshot(|
|`createPromptExecutionSessionFile`|fn||265-288|function createPromptExecutionSessionFile(|
|`getPromptSessionCwd`|fn||296-304|function getPromptSessionCwd(ctx?: PromptCommandSessionCo...|
|`getPromptSessionFile`|fn||312-320|function getPromptSessionFile(ctx?: PromptCommandSessionC...|
|`getPromptContextCwd`|fn||328-334|function getPromptContextCwd(ctx?: PromptCommandSessionCo...|
|`resolvePromptCommandSwitchContext`|fn||344-359|function resolvePromptCommandSwitchContext(|
|`syncPromptCommandProcessCwd`|fn||370-390|function syncPromptCommandProcessCwd(expectedPath: string...|
|`readPromptSessionFileCwd`|fn||398-422|function readPromptSessionFileCwd(sessionFile: string): s...|
|`readPromptSessionJsonLines`|fn||431-478|function readPromptSessionJsonLines(|
|`preservePromptCommandExecutionTranscript`|fn||488-585|function preservePromptCommandExecutionTranscript(plan: P...|
|`verifyPromptCommandSessionTarget`|fn||598-642|function verifyPromptCommandSessionTarget(|
|`verifyPromptCommandClosureArtifacts`|fn||652-687|function verifyPromptCommandClosureArtifacts(|
|`switchPromptCommandSession`|fn||698-727|async function switchPromptCommandSession(|
|`isPromptCommandStaleContextError`|fn||736-739|function isPromptCommandStaleContextError(error: unknown)...|
|`attachPromptCommandErrorContext`|fn||748-756|function attachPromptCommandErrorContext(|
|`getPromptCommandErrorContext`|fn||764-770|export function getPromptCommandErrorContext(|
|`runCapture`|fn||851-856|function runCapture(command: string[], cwd: string): Retu...|
|`setPromptCommandPostCreateHookForTests`|fn||864-868|export function setPromptCommandPostCreateHookForTests(|
|`resolvePromptDocsRoot`|fn||877-880|function resolvePromptDocsRoot(projectBase: string, confi...|
|`resolveWorktreePaths`|fn||890-917|function resolveWorktreePaths(|
|`sanitizePromptWorktreeBranchName`|fn||925-927|function sanitizePromptWorktreeBranchName(branch: string)...|
|`validatePromptWorktreeName`|fn||935-940|function validatePromptWorktreeName(wtName: string): boolean|
|`throwPromptGitStatusError`|fn||948-950|function throwPromptGitStatusError(): never|
|`validatePromptGitState`|fn||961-1005|function validatePromptGitState(projectBase: string, conf...|
|`resolveCurrentPromptBranchName`|fn||1013-1018|function resolveCurrentPromptBranchName(gitRoot: string):...|
|`formatPromptWorktreeExecutionId`|fn||1032-1034|function formatPromptWorktreeExecutionId(timestamp: Date)...|
|`getNextPromptWorktreeExecutionId`|fn||1041-1054|function getNextPromptWorktreeExecutionId(): string|
|`buildPromptWorktreeName`|fn||1065-1076|function buildPromptWorktreeName(gitRoot: string, config:...|
|`promptWorktreeBranchExists`|fn||1085-1094|function promptWorktreeBranchExists(gitRoot: string, bran...|
|`promptWorktreeRegistered`|fn||1103-1114|function promptWorktreeRegistered(gitRoot: string, worktr...|
|`cleanupPromptWorktreeCreation`|fn||1124-1138|function cleanupPromptWorktreeCreation(|
|`createPromptWorktree`|fn||1152-1272|function createPromptWorktree(|
|`deletePromptWorktree`|fn||1285-1345|function deletePromptWorktree(|
|`getPromptRequiredDocs`|fn||1354-1356|export function getPromptRequiredDocs(promptName: PromptC...|
|`validatePromptRequiredDocs`|fn||1369-1420|export function validatePromptRequiredDocs(|
|`preparePromptCommandExecution`|fn||1437-1513|export function preparePromptCommandExecution(|
|`activatePromptCommandExecution`|fn||1524-1557|export async function activatePromptCommandExecution(|
|`restorePromptCommandExecution`|fn||1569-1633|export async function restorePromptCommandExecution(|
|`abortPromptCommandExecution`|fn||1644-1690|export async function abortPromptCommandExecution(|
|`finalizePromptCommandExecution`|fn||1701-1804|export async function finalizePromptCommandExecution(|
|`classifyPromptCommandOutcome`|fn||1812-1816|export function classifyPromptCommandOutcome(|


---

# prompt-command-state.ts | TypeScript | 211L | 12 symbols | 2 imports | 15 comments
> Path: `src/core/prompt-command-state.ts`
- @brief Persists prompt-command runtime state across session rebinding.
- @details Stores the current prompt-orchestration workflow state, the pending or active execution plan, and the latest reusable command-capable replacement-session context on `globalThis` so slash-command worktree handoff survives pi session replacement in the same host process. Runtime is O(1). Side effects are limited to process-scoped state mutation.

## Imports
```
import path from "node:path";
import type { PromptCommandExecutionPlan } from "./prompt-command-runtime.js";
```

## Definitions

- type `export type PromptCommandRuntimeWorkflowState = "idle" | "checking" | "running" | "merging" | "error";` (L14)
- @brief Represents the workflow-state domain persisted across session rebinding.
- @details Mirrors the prompt-orchestration states used by the status controller so the process-scoped store can remain independent from module-local controller instances. The alias is compile-time only and introduces no runtime cost.
### iface `export interface PersistedPromptCommandRuntimeState` (L20-24)
- @brief Stores the prompt-command facts persisted across extension rebinding.
- @details Tracks the current workflow state plus the pending or active execution plan keyed implicitly by the surviving pi host process. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PersistedPromptCommandSessionContext` (L30-46)
- @brief Describes the reusable command-capable session context persisted for prompt closure.
- @details Mirrors the minimal `ExtensionCommandContext` surface needed after prompt activation so lifecycle handlers can continue switching sessions, reading session facts, and delivering messages even when later pi lifecycle event contexts are non-command instances. The interface is compile-time only and introduces no runtime cost.

### fn `function getPersistedPromptCommandRuntimeStateStore(): PersistedPromptCommandRuntimeState` (L65-75)
- @brief Returns the process-scoped prompt-command persistence store.
- @details Lazily initializes one mutable record that survives extension rebinds in the same pi host process. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {PersistedPromptCommandRuntimeState} Mutable persistence record.

### fn `function getPersistedPromptCommandSessionContextStore():` (L82-97)
- @brief Returns the process-scoped reusable prompt command-context store.
- @details Lazily initializes one mutable record that survives extension rebinds in the same pi host process and tracks which execution-session file owns the stored command-capable context. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {{ executionSessionFile: string | undefined; sessionContext: PersistedPromptCommandSessionContext | undefined }} Mutable reusable-context record.

### fn `export function readPersistedPromptCommandRuntimeState(): PersistedPromptCommandRuntimeState` (L104-111)
- @brief Returns a snapshot of the persisted prompt-command runtime state.
- @details Copies the process-scoped workflow state and request references into one detached object so callers can reason about the current persistence payload without mutating it accidentally. Runtime is O(1). No external state is mutated.
- @return {PersistedPromptCommandRuntimeState} Current persisted snapshot.

### fn `export function writePersistedPromptCommandRuntimeState(` (L119-126)
- @brief Replaces the persisted prompt-command runtime state.
- @details Writes the supplied workflow state and execution-plan references into the process-scoped store so later extension instances can recover prompt orchestration after a session switch. Runtime is O(1). Side effect: mutates process-scoped state.
- @param[in] state {PersistedPromptCommandRuntimeState} Replacement persisted state.
- @return {void} No return value.

### fn `export function clearPersistedPromptCommandRuntimeState(): void` (L133-140)
- @brief Clears the persisted prompt-command runtime state.
- @details Resets the process-scoped workflow state to `idle` and removes both request references so future extension instances do not inherit stale prompt orchestration. Runtime is O(1). Side effect: mutates process-scoped state.
- @return {void} No return value.

### fn `export function writePersistedPromptCommandSessionContext(` (L149-156)
- @brief Replaces the reusable prompt command-capable session context.
- @details Associates the supplied command-capable context with one execution-session file so later lifecycle handlers can recover it after pi rebinds the active extension runtime. Runtime is O(1). Side effect: mutates process-scoped state.
- @param[in] executionSessionFile {string} Execution-session file that owns the context.
- @param[in] sessionContext {PersistedPromptCommandSessionContext | undefined} Replacement command-capable context.
- @return {void} No return value.

### fn `export function clearPersistedPromptCommandSessionContext(): void` (L163-167)
- @brief Clears the reusable prompt command-capable session context.
- @details Removes the stored execution-session file and context reference so future closure handling cannot reuse stale command objects after prompt orchestration finishes. Runtime is O(1). Side effect: mutates process-scoped state.
- @return {void} No return value.

### fn `export function readPersistedPromptCommandSessionContext(` (L175-186)
- @brief Restores the reusable prompt command-capable session context for one execution-session file.
- @details Returns the stored command-capable context only when the supplied execution-session file matches the latest stored execution-session file. Runtime is O(1). No external state is mutated.
- @param[in] executionSessionFile {string | undefined} Candidate execution-session file.
- @return {PersistedPromptCommandSessionContext | undefined} Matching stored context or `undefined` when unavailable.

### fn `export function restorePersistedPromptCommandRuntimeStateForSession(` (L194-211)
- @brief Restores persisted prompt-command runtime state for one active session file.
- @details Returns the persisted workflow state plus execution-plan references only when the supplied session file matches the persisted execution-session file of the pending or active plan. Runtime is O(1). No external state is mutated.
- @param[in] sessionFile {string | undefined} Current active session file.
- @return {PersistedPromptCommandRuntimeState | undefined} Matching persisted state or `undefined` when no persisted plan targets the supplied session.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PromptCommandRuntimeWorkflowState`|type||14||
|`PersistedPromptCommandRuntimeState`|iface||20-24|export interface PersistedPromptCommandRuntimeState|
|`PersistedPromptCommandSessionContext`|iface||30-46|export interface PersistedPromptCommandSessionContext|
|`getPersistedPromptCommandRuntimeStateStore`|fn||65-75|function getPersistedPromptCommandRuntimeStateStore(): Pe...|
|`getPersistedPromptCommandSessionContextStore`|fn||82-97|function getPersistedPromptCommandSessionContextStore():|
|`readPersistedPromptCommandRuntimeState`|fn||104-111|export function readPersistedPromptCommandRuntimeState():...|
|`writePersistedPromptCommandRuntimeState`|fn||119-126|export function writePersistedPromptCommandRuntimeState(|
|`clearPersistedPromptCommandRuntimeState`|fn||133-140|export function clearPersistedPromptCommandRuntimeState()...|
|`writePersistedPromptCommandSessionContext`|fn||149-156|export function writePersistedPromptCommandSessionContext(|
|`clearPersistedPromptCommandSessionContext`|fn||163-167|export function clearPersistedPromptCommandSessionContext...|
|`readPersistedPromptCommandSessionContext`|fn||175-186|export function readPersistedPromptCommandSessionContext(|
|`restorePersistedPromptCommandRuntimeStateForSession`|fn||194-211|export function restorePersistedPromptCommandRuntimeState...|


---

# prompts.ts | TypeScript | 316L | 9 symbols | 7 imports | 17 comments
> Path: `src/core/prompts.ts`
- @brief Renders bundled pi-usereq prompts for the current project context.
- @details Applies placeholder substitution, legacy tool-name rewrites, and conditional pi.dev governance guidance before prompt text is sent to the agent. Runtime is linear in prompt size plus replacement count. Side effects are limited to filesystem reads used for manifest checks and bundled prompt loading.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { buildPromptReplacementPaths, type UseReqConfig } from "./config.js";
import { formatRuntimePathForDisplay } from "./path-context.js";
import type {
import { getPromptRequiredDocs } from "./prompt-command-runtime.js";
import { readBundledInstruction, readBundledPrompt } from "./resources.js";
```

## Definitions

### fn `function buildPiDevConformanceBlock(promptName: string, projectBase: string): string` (L111-120)
- @brief Builds the conditional pi.dev governance block for one rendered prompt.
- @details Emits the manifest-driven governance rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the pi.dev manifest. Time complexity O(1). No filesystem writes.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Markdown bullet block or the empty string when injection is not applicable.
- @satisfies REQ-032, REQ-033, REQ-034, REQ-108, REQ-273, REQ-274, REQ-275

### fn `function injectPiDevConformanceBlock(text: string, promptName: string, projectBase: string): string` (L131-138)
- @brief Injects the pi.dev governance block into the prompt behavior section.
- @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Prompt markdown with zero or one injected conformance block.
- @satisfies REQ-032, REQ-033, REQ-034, REQ-108, REQ-273, REQ-274, REQ-275

### fn `export function adaptPromptForInternalTools(text: string): string` (L147-153)
- @brief Rewrites bundled prompt tool references from legacy `req --...` syntax to internal tool names.
- @details Applies deterministic global regex replacements so prompt text matches the extension-registered tool surface instead of the standalone CLI spelling. Time complexity O(p*r) where p is pattern count and r is prompt length.
- @param[in] text {string} Prompt markdown before tool-reference normalization.
- @return {string} Prompt markdown with internal tool names.
- @satisfies REQ-003

### fn `export function applyReplacements(text: string, replacements: Record<string, string>): string` (L163-169)
- @brief Applies literal placeholder replacements to bundled prompt markdown.
- @details Replaces every placeholder token using split/join semantics so all occurrences are updated without regex escaping. Time complexity O(t*n) where t is replacement count and n is prompt length.
- @param[in] text {string} Prompt markdown containing placeholder tokens.
- @param[in] replacements {Record<string, string>} Token-to-value map.
- @return {string} Prompt markdown with all placeholder tokens expanded.
- @satisfies REQ-002

### fn `function buildPromptExecutionBlock(` (L179-201)
- @brief Builds the prompt-command execution block injected at prompt start.
- @details Serializes the already-completed repository validation, prompt-specific required-doc validation, worktree routing decision, and extension-owned lifecycle responsibilities so downstream agents do not repeat command-side orchestration. Time complexity is O(d) in required-doc count. No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] executionPlan {PromptCommandExecutionPlan} Prepared command execution plan.
- @return {string} Markdown block or the empty string when runtime execution metadata is unavailable.
- @satisfies REQ-200, REQ-201, REQ-202, REQ-206, REQ-207, REQ-208, REQ-209

### fn `function injectPromptExecutionBlock(` (L211-222)
- @brief Injects the prompt-command execution block near the start of the rendered prompt.
- @details Inserts the execution block immediately after the first level-1 heading so downstream agents evaluate extension-owned orchestration before workflow steps. Leaves prompts unchanged when no execution block is provided or when the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Prepared execution plan.
- @return {string} Prompt markdown with zero or one injected execution block.

### fn `function buildPromptReplacements(` (L234-246)
- @brief Builds prompt-specific runtime placeholder replacements.
- @details Merges shared path substitutions with prompt-scoped runtime values for `%%ARGS%%` and `%%PROMPT%%`. Time complexity is O(g log g + s) due to delegated path replacement building, where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads delegated to shared path-context helpers.
- @param[in] promptName {string} Bundled prompt identifier without the `req-` prefix.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @return {Record<string, string>} Prompt-specific placeholder-to-value map.
- @satisfies REQ-002, REQ-211

### fn `function renderBundledCommitInstruction(` (L258-272)
- @brief Renders the bundled git instruction injected through `%%COMMIT%%`.
- @details Selects `resources/instructions/git_commit.md` when automatic git commit is enabled and `resources/instructions/git_read-only.md` otherwise, then applies the same runtime placeholder substitutions used by bundled prompts before returning the rendered markdown. Time complexity is O(n + g log g + s) where n is instruction size, g is guideline count, and s is source-directory count. Side effects are limited to filesystem reads.
- @param[in] promptName {string} Bundled prompt identifier without the `req-` prefix.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @return {string} Rendered bundled git instruction selected for the current automatic-commit mode.
- @satisfies REQ-211, REQ-213, REQ-214

### fn `export function renderPrompt(` (L285-316)
- @brief Renders a bundled prompt for the current project context.
- @details Loads the bundled markdown template, expands configuration-derived placeholders, injects extension-owned execution guidance plus conditional pi.dev governance guidance, expands the optional bundled commit instruction, and rewrites legacy tool references to internal names. Time complexity O(n) relative to prompt size plus delegated commit-instruction rendering. No tracked files are modified.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder and manifest resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Optional prompt-command execution plan used for injected runtime guidance.
- @return {string} Fully rendered prompt markdown ready for `pi.sendUserMessage(...)`.
- @satisfies REQ-002, REQ-003, REQ-032, REQ-033, REQ-034, REQ-108, REQ-200, REQ-201, REQ-202, REQ-206, REQ-207, REQ-208, REQ-209, REQ-211, REQ-213, REQ-214, REQ-273, REQ-274, REQ-275

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`buildPiDevConformanceBlock`|fn||111-120|function buildPiDevConformanceBlock(promptName: string, p...|
|`injectPiDevConformanceBlock`|fn||131-138|function injectPiDevConformanceBlock(text: string, prompt...|
|`adaptPromptForInternalTools`|fn||147-153|export function adaptPromptForInternalTools(text: string)...|
|`applyReplacements`|fn||163-169|export function applyReplacements(text: string, replaceme...|
|`buildPromptExecutionBlock`|fn||179-201|function buildPromptExecutionBlock(|
|`injectPromptExecutionBlock`|fn||211-222|function injectPromptExecutionBlock(|
|`buildPromptReplacements`|fn||234-246|function buildPromptReplacements(|
|`renderBundledCommitInstruction`|fn||258-272|function renderBundledCommitInstruction(|
|`renderPrompt`|fn||285-316|export function renderPrompt(|


---

# reference-payload.ts | TypeScript | 752L | 28 symbols | 5 imports | 27 comments
> Path: `src/core/reference-payload.ts`
- @brief Builds agent-oriented JSON payloads for `files-references` and `references`.
- @details Converts analyzed source files into deterministic JSON sections ordered for LLM traversal, including repository structure, per-file metrics, imports, symbols, structured Doxygen fields, and structured comment evidence. Runtime is O(F log F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import { detectLanguage } from "./compress.js";
import {
```

## Definitions

- type `export type ReferenceToolScope = "explicit-files" | "configured-source-directories";` (L27)
- @brief Enumerates supported references-payload scopes.
- @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type ReferenceFileStatus = "analyzed" | "error" | "skipped";` (L33)
- @brief Enumerates supported per-file references entry statuses.
- @details Separates analyzed files, analysis failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
### iface `export interface ReferenceLineRange` (L39-43)
- @brief Describes one numeric source line range.
- @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceImportEntry extends ReferenceLineRange` : ReferenceLineRange (L49-52)
- @brief Describes one structured import record.
- @details Stores the normalized import identity, raw import statement, and declaration line range without requiring agents to parse markdown blocks. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceCommentEntry extends ReferenceLineRange` : ReferenceLineRange (L58-61)
- @brief Describes one structured standalone or attached comment record.
- @details Preserves normalized comment text plus per-line comment fragments so agents can consume comment evidence without reparsing source delimiters. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceExitPointEntry` (L67-70)
- @brief Describes one structured exit-point annotation.
- @details Preserves the normalized exit expression text together with its source line number for downstream reasoning about control flow hints. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceSymbolEntry extends ReferenceLineRange` : ReferenceLineRange (L76-96)
- @brief Describes one structured symbol record.
- @details Orders direct-access identity fields before hierarchy, locations, Doxygen metadata, and comment evidence so agents can branch without reparsing monolithic summaries. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolFileEntry extends ReferenceLineRange` : ReferenceLineRange (L102-115)
- @brief Describes one per-file references payload entry.
- @details Stores canonical identity, line metrics, structured imports, structured symbols, structured comment evidence, and optional file-level Doxygen metadata. Derivable identity and filesystem-probe fields are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolRequestSection` (L121-130)
- @brief Describes the request section of the references payload.
- @details Captures tool identity, scope, base directory, requested path inventory, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolSummarySection` (L136-147)
- @brief Describes the summary section of the references payload.
- @details Exposes aggregate file, symbol, import, comment, and Doxygen counts as numeric fields plus deterministic symbol-kind totals. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceRepositoryTreeNode` (L153-159)
- @brief Describes one repository tree node in the references payload.
- @details Encodes directory and file hierarchy without ASCII-art decoration so agents can traverse repository structure as structured JSON. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolRepositorySection` (L165-169)
- @brief Describes the repository section of the references payload.
- @details Stores configured source-directory scope, the canonical analyzed file list, and the structured directory tree used during analysis. Static root-path echoes are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolPayload` (L175-179)
- @brief Describes the full agent-oriented references payload.
- @details Exposes only aggregate analysis totals, repository structure, and per-file reference records, omitting request echoes that are already known to the caller or encoded in the tool registration. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildReferenceToolPayloadOptions` (L185-192)
- @brief Describes the options required to build one references payload.
- @details Supplies tool identity, scope, base directory, requested paths, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeReferencePath(targetPath: string, baseDir: string): string` (L201-209)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): ReferenceLineRange` (L218-224)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {ReferenceLineRange} Structured line-range record.

### fn `function extractCommentText(commentElement: SourceElement, maxLength = 0): string` (L233-253)
- @brief Extracts normalized plain text from one comment element.
- @details Removes language comment markers, drops delimiter-only lines, joins content with spaces, and optionally truncates the result. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @param[in] maxLength {number} Optional maximum output length; `0` disables truncation.
- @return {string} Cleaned comment text.

### fn `function extractCommentLines(commentElement: SourceElement): string[]` (L261-275)
- @brief Extracts cleaned individual lines from one comment element.
- @details Removes language comment markers while preserving line granularity for structured comment payloads. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @return {string[]} Cleaned comment lines.

### fn `function buildCommentMaps(elements: SourceElement[]): [Record<number, SourceElement[]>, SourceElement[], string]` (L283-333)
- @brief Associates nearby comment blocks with definitions and standalone comment groups.
- @details Reuses the repository comment-attachment heuristic that binds comments within three lines of a definition while preserving early file-description text. Runtime is O(n log n). No side effects occur.
- @param[in] elements {SourceElement[]} Analyzed source elements.
- @return {[Record<number, SourceElement[]>, SourceElement[], string]} Attached-comment map, standalone comments, and compact file description.

### fn `function resolveSymbolName(element: SourceElement): string` (L341-343)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every symbol retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], child: SourceElement): SourceElement | undefined` (L352-361)
- @brief Resolves the direct parent element for one child symbol.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] child {SourceElement} Candidate child symbol.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function buildCommentEntry(commentElement: SourceElement): ReferenceCommentEntry` (L369-376)
- @brief Builds one structured comment record from a comment element.
- @details Preserves numeric line-range metadata plus normalized text and per-line fragments. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Source comment element.
- @return {ReferenceCommentEntry} Structured comment record.

### fn `function buildRepositoryTree(canonicalPaths: string[]): ReferenceRepositoryTreeNode` (L384-443)
- @brief Builds one structured repository tree from canonical file paths.
- @details Materializes a nested directory map and converts it into recursively ordered JSON nodes without decorative ASCII formatting. Runtime is O(n log n) in path count. No side effects occur.
- @param[in] canonicalPaths {string[]} Canonical file paths.
- @return {ReferenceRepositoryTreeNode} Structured repository tree rooted at `.`.

### fn `const ensureDirectory = (parent: ReferenceRepositoryTreeNode, nodeName: string, relativePath: string): ReferenceRepositoryTreeNode =>` (L393-407)

### fn `const finalizeNode = (node: ReferenceRepositoryTreeNode): ReferenceRepositoryTreeNode =>` (L429-440)

### fn `function analyzeReferenceFile(` (L456-621)
- @brief Builds one analyzed file entry for the references payload.
- @details Parses the file with `SourceAnalyzer`, extracts structured imports and symbols, attaches structured Doxygen fields, and preserves standalone comment evidence. Runtime is O(S log S) in file size and symbol count. Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] analyzer {SourceAnalyzer} Shared source analyzer instance.
- @param[in] inputPath {string} Caller-provided input path.
- @param[in] absolutePath {string} Absolute file path.
- @param[in] requestIndex {number} Zero-based request index.
- @param[in] baseDir {string} Base directory used for canonical paths.
- @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
- @return {ReferenceToolFileEntry} Structured file entry.

### fn `export function buildReferenceToolPayload(options: BuildReferenceToolPayloadOptions): ReferenceToolPayload` (L630-730)
- @brief Builds the full agent-oriented references payload.
- @details Validates requested paths against the filesystem, analyzes processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits structured repository data without echoing request metadata already known to the caller. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildReferenceToolPayloadOptions} Payload-construction options.
- @return {ReferenceToolPayload} Structured references payload ordered as summary, repository, and files.
- @satisfies REQ-011, REQ-014, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function buildReferenceToolExecutionStderr(payload: ReferenceToolPayload): string` (L738-752)
- @brief Builds deterministic stderr diagnostics from a references payload.
- @details Serializes skipped-input and analysis-error entries into stable newline-delimited diagnostics while leaving fully analyzed payloads silent. Runtime is O(n) in file-entry count. No side effects occur.
- @param[in] payload {ReferenceToolPayload} Structured references payload.
- @return {string} Newline-delimited diagnostics.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ReferenceToolScope`|type||27||
|`ReferenceFileStatus`|type||33||
|`ReferenceLineRange`|iface||39-43|export interface ReferenceLineRange|
|`ReferenceImportEntry`|iface||49-52|export interface ReferenceImportEntry extends ReferenceLi...|
|`ReferenceCommentEntry`|iface||58-61|export interface ReferenceCommentEntry extends ReferenceL...|
|`ReferenceExitPointEntry`|iface||67-70|export interface ReferenceExitPointEntry|
|`ReferenceSymbolEntry`|iface||76-96|export interface ReferenceSymbolEntry extends ReferenceLi...|
|`ReferenceToolFileEntry`|iface||102-115|export interface ReferenceToolFileEntry extends Reference...|
|`ReferenceToolRequestSection`|iface||121-130|export interface ReferenceToolRequestSection|
|`ReferenceToolSummarySection`|iface||136-147|export interface ReferenceToolSummarySection|
|`ReferenceRepositoryTreeNode`|iface||153-159|export interface ReferenceRepositoryTreeNode|
|`ReferenceToolRepositorySection`|iface||165-169|export interface ReferenceToolRepositorySection|
|`ReferenceToolPayload`|iface||175-179|export interface ReferenceToolPayload|
|`BuildReferenceToolPayloadOptions`|iface||185-192|export interface BuildReferenceToolPayloadOptions|
|`canonicalizeReferencePath`|fn||201-209|function canonicalizeReferencePath(targetPath: string, ba...|
|`buildLineRange`|fn||218-224|function buildLineRange(startLineNumber: number, endLineN...|
|`extractCommentText`|fn||233-253|function extractCommentText(commentElement: SourceElement...|
|`extractCommentLines`|fn||261-275|function extractCommentLines(commentElement: SourceElemen...|
|`buildCommentMaps`|fn||283-333|function buildCommentMaps(elements: SourceElement[]): [Re...|
|`resolveSymbolName`|fn||341-343|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||352-361|function resolveParentElement(definitions: SourceElement[...|
|`buildCommentEntry`|fn||369-376|function buildCommentEntry(commentElement: SourceElement)...|
|`buildRepositoryTree`|fn||384-443|function buildRepositoryTree(canonicalPaths: string[]): R...|
|`ensureDirectory`|fn||393-407|const ensureDirectory = (parent: ReferenceRepositoryTreeN...|
|`finalizeNode`|fn||429-440|const finalizeNode = (node: ReferenceRepositoryTreeNode):...|
|`analyzeReferenceFile`|fn||456-621|function analyzeReferenceFile(|
|`buildReferenceToolPayload`|fn||630-730|export function buildReferenceToolPayload(options: BuildR...|
|`buildReferenceToolExecutionStderr`|fn||738-752|export function buildReferenceToolExecutionStderr(payload...|


---

# resources.ts | TypeScript | 119L | 7 symbols | 3 imports | 8 comments
> Path: `src/core/resources.ts`
- @brief Resolves installation-owned bundled resource locations.
- @details Encapsulates installation-path discovery, bundled-resource validation, prompt enumeration, prompt loading, and bundled instruction loading directly from the installed extension payload. Runtime is proportional to directory-entry enumeration and resource file size. Side effects are limited to filesystem reads.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { getInstallationPath, RESOURCE_ROOT_DIRNAME } from "./path-context.js";
```

## Definitions

### fn `export function getBundledResourceRoot(): string` (L16-18)
- @brief Resolves the bundled resource directory inside the installed extension payload.
- @details Joins the installation path with `resources`, producing the immutable source tree used for prompt, template, and guideline access during runtime. Time complexity is O(1). No I/O side effects occur.
- @return {string} Absolute bundled resource root path.

### fn `export function ensureBundledResourcesAccessible(): string` (L26-38)
- @brief Validates that installed bundled resources are accessible.
- @details Verifies that the installation-owned resource root plus `prompts`, `instructions`, `templates`, and `guidelines` directories exist before prompt or tool execution. Runtime is O(1) plus bounded filesystem metadata checks. Side effects are limited to filesystem reads.
- @return {string} Absolute bundled resource root path.
- @throws {Error} Propagates a deterministic error when required installed resource directories are missing.

### fn `function readBundledMarkdownResource(` (L48-54)
- @brief Reads one bundled markdown resource by logical name and directory.
- @details Resolves the installed markdown file under the requested bundled resource directory, validates resource accessibility, and loads the file as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] directoryName {"prompts" | "instructions"} Installation-owned markdown resource directory.
- @param[in] resourceName {string} Resource identifier without the `.md` suffix.
- @return {string} Raw bundled markdown content.
- @throws {Error} Propagates `fs.readFileSync` errors when the resource file is missing or unreadable.

### fn `export function readBundledPrompt(promptName: string): string` (L63-65)
- @brief Reads one bundled markdown prompt by logical prompt name.
- @details Resolves the prompt file under the installation-owned `resources/prompts` directory, validates resource accessibility, and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] promptName {string} Prompt identifier without the `.md` suffix.
- @return {string} Raw prompt markdown content.
- @throws {Error} Propagates `fs.readFileSync` errors when the prompt file is missing or unreadable.

### fn `export function readBundledPromptDescription(promptName: string): string` (L73-95)
- @brief Extracts the YAML-front-matter `description` field from one bundled prompt.
- @details Parses only the leading front-matter block, resolves the first scalar `description` entry, strips one matching pair of wrapping quotes, and unescapes quoted apostrophe or quote characters used in prompt metadata. Runtime is O(n) in prompt length. Side effects are limited to filesystem reads delegated through `readBundledPrompt(...)`.
- @param[in] promptName {string} Prompt identifier without the `.md` suffix.
- @return {string} Normalized prompt description or the empty string when the front matter does not declare one.

### fn `export function readBundledInstruction(instructionName: string): string` (L104-106)
- @brief Reads one bundled markdown instruction by logical instruction name.
- @details Resolves the instruction file under the installation-owned `resources/instructions` directory, validates resource accessibility, and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] instructionName {string} Instruction identifier without the `.md` suffix.
- @return {string} Raw instruction markdown content.
- @throws {Error} Propagates `fs.readFileSync` errors when the instruction file is missing or unreadable.

### fn `export function listBundledPromptNames(): string[]` (L113-119)
- @brief Lists bundled prompt identifiers available in the installed extension payload.
- @details Scans the installation-owned prompt directory, keeps visible markdown files only, strips the `.md` suffix, and returns a lexicographically sorted list. Time complexity is O(n log n). Side effects are limited to filesystem reads.
- @return {string[]} Sorted prompt names without file extensions.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getBundledResourceRoot`|fn||16-18|export function getBundledResourceRoot(): string|
|`ensureBundledResourcesAccessible`|fn||26-38|export function ensureBundledResourcesAccessible(): string|
|`readBundledMarkdownResource`|fn||48-54|function readBundledMarkdownResource(|
|`readBundledPrompt`|fn||63-65|export function readBundledPrompt(promptName: string): st...|
|`readBundledPromptDescription`|fn||73-95|export function readBundledPromptDescription(promptName: ...|
|`readBundledInstruction`|fn||104-106|export function readBundledInstruction(instructionName: s...|
|`listBundledPromptNames`|fn||113-119|export function listBundledPromptNames(): string[]|


---

# runtime-project-paths.ts | TypeScript | 90L | 5 symbols | 4 imports | 6 comments
> Path: `src/core/runtime-project-paths.ts`
- @brief Derives runtime-only repository facts.
- @details Centralizes git-repository probing, repository-root resolution, and active-branch lookup for extension status, tool execution, and CLI flows. Runtime is dominated by git subprocess execution plus path normalization. Side effects are limited to subprocess spawning.

## Imports
```
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { isSameOrAncestorPath } from "./path-context.js";
```

## Definitions

### fn `function runGitCapture(command: string[], cwd?: string): ReturnType<typeof spawnSync>` (L19-24)
- @brief Executes one git subprocess and captures UTF-8 output.
- @details Delegates to `spawnSync`, keeps execution synchronous for deterministic command flows, and supports an optional working directory. Runtime is dominated by the spawned git process. Side effects include subprocess creation.
- @param[in] command {string[]} Git executable plus argument vector.
- @param[in] cwd {string | undefined} Optional working directory.
- @return {ReturnType<typeof spawnSync>} Captured subprocess result.

### fn `export function isInsideGitRepo(targetPath: string): boolean` (L33-36)
- @brief Tests whether one path is inside a git work tree.
- @details Executes `git rev-parse --is-inside-work-tree` in the supplied directory and returns `true` only for a successful literal `true` response. Runtime is dominated by git execution. Side effects include subprocess creation.
- @param[in] targetPath {string} Directory to probe.
- @return {boolean} `true` when the directory belongs to a git work tree.
- @satisfies REQ-145

### fn `export function resolveGitRoot(targetPath: string): string` (L46-52)
- @brief Resolves the repository root for one path inside a git work tree.
- @details Executes `git rev-parse --show-toplevel`, normalizes the result to an absolute path, and rejects non-repository paths with `ReqError`. Runtime is dominated by git execution. Side effects include subprocess creation.
- @param[in] targetPath {string} Directory inside the target repository.
- @return {string} Absolute repository-root path.
- @throws {ReqError} Throws when the path is not inside a git repository.
- @satisfies REQ-145

### fn `export function resolveRuntimeGitPath(executionPath: string): string | undefined` (L61-68)
- @brief Resolves the runtime git root for one execution path.
- @details Returns `undefined` when the path is outside a git repository. Otherwise resolves the repository root and rejects roots that are not identical to or ancestors of the execution path. Runtime is dominated by git execution. Side effects include subprocess creation.
- @param[in] executionPath {string} Runtime execution path.
- @return {string | undefined} Absolute repository-root path or `undefined` when unavailable.
- @satisfies REQ-105, REQ-145

### fn `export function resolveRuntimeGitBranchName(executionPath: string): string` (L77-88)
- @brief Resolves the active branch name for one runtime execution path.
- @details Resolves the enclosing git work tree from the supplied execution path, reads `git branch --show-current`, and falls back to `unknown` when the path is outside git or HEAD has no branch name. Runtime is dominated by git execution. Side effects include subprocess creation.
- @param[in] executionPath {string} Runtime execution path.
- @return {string} Active branch name or `unknown` when unavailable.
- @satisfies REQ-121, REQ-283

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`runGitCapture`|fn||19-24|function runGitCapture(command: string[], cwd?: string): ...|
|`isInsideGitRepo`|fn||33-36|export function isInsideGitRepo(targetPath: string): boolean|
|`resolveGitRoot`|fn||46-52|export function resolveGitRoot(targetPath: string): string|
|`resolveRuntimeGitPath`|fn||61-68|export function resolveRuntimeGitPath(executionPath: stri...|
|`resolveRuntimeGitBranchName`|fn||77-88|export function resolveRuntimeGitBranchName(executionPath...|


---

# settings-menu.ts | TypeScript | 264L | 12 symbols | 2 imports | 13 comments
> Path: `src/core/settings-menu.ts`
- @brief Renders pi-usereq configuration menus with the shared pi.dev settings style.
- @details Wraps `SettingsList` in one extension-command helper that exposes right-aligned current values, built-in circular scrolling, bottom-line descriptions, and a deterministic bridge for offline test harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.

## Imports
```
import { getSettingsListTheme, type ThemeColor, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type Component, type SettingItem, type SettingsListTheme } from "@mariozechner/pi-tui";
```

## Definitions

### iface `export interface PiUsereqSettingsMenuChoice` (L14-22)
- @brief Describes one selectable pi-usereq settings-menu choice.
- @details Stores the stable action identifier, left-column label, optional label and value tone overrides, optional disabled state, right-column current value, and bottom-line description consumed by the shared settings-menu renderer. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqSettingsMenuBridge` (L28-34)
- @brief Describes the offline bridge exposed by shared settings-menu components.
- @details Lets deterministic harnesses and unit tests drive the same settings-menu choices by label without simulating raw terminal key streams. The interface is runtime-facing but carries no side effects by itself.

### iface `export interface PiUsereqSettingsMenuOptions` (L42-44)
- @brief Describes optional behavior overrides for one settings-menu render.
- @details Carries the caller-selected initial focus row so menu re-renders can
preserve selection after an in-place toggle or value edit. The interface is
compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqSettingsMenuComponent extends Component` : Component (L50-52)
- @brief Represents a custom menu component augmented with the offline bridge.
- @details Extends the generic TUI `Component` contract with one optional bridge field consumed only by deterministic test and debug harness adapters. The interface is compile-time only and introduces no runtime cost.

- type `type PiUsereqSettingsThemeColor = Extract<ThemeColor, "accent" | "muted" | "dim">;` (L60)
- @brief Enumerates the CLI-supported theme tokens consumed by settings menus.
- @details Narrows callback-local theme calls to the documented settings-list
semantics used by the pi CLI. Compile-time only and introduces no runtime
cost.
### iface `interface PiUsereqSettingsTheme` (L69-72)
- @brief Describes the callback-local theme surface required by settings menus.
- @details Captures the subset of the custom-UI theme API needed to rebuild
title and fallback settings-list styling when the shared global theme is not
available in tests or offline replay. Compile-time only and introduces no
runtime cost.

### fn `function buildFallbackPiUsereqSettingsListTheme(` (L84-96)
- @brief Builds the fallback settings-list theme matching CLI settings semantics.
- @details Mirrors the shared CLI settings theme token mapping for labels,
values, descriptions, cursor, and hints while avoiding the global theme
singleton used by the live pi runtime. Runtime is O(1). No external state is
mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Fallback settings-list theme.
- @satisfies REQ-151, REQ-156

### fn `function buildPiUsereqSettingsListTheme(` (L109-123)
- @brief Resolves the settings-list theme used by pi-usereq configuration menus.
- @details Prefers the shared CLI `getSettingsListTheme()` API so extension
menus inherit active-theme behavior from pi itself, then falls back to an
equivalent callback-local mapping when the shared theme singleton is
unavailable in deterministic tests or offline replay. Runtime is O(1). No
external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Settings-list theme used by pi-usereq menus.
- @satisfies REQ-151, REQ-156

### fn `function formatPiUsereqSettingsMenuTitle(` (L135-140)
- @brief Formats the settings-menu title with active-theme semantics.
- @details Applies the callback-local `accent` token and bold styling on every
rebuild so custom-menu titles stay synchronized with live theme changes.
Runtime is O(n) in title length. No external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @param[in] title {string} Menu title.
- @return {string} Styled title text.
- @satisfies REQ-151, REQ-156

### fn `function createImmediateSelectionComponent(choiceId: string, done: (value?: string) => void): Component` (L149-161)
- @brief Closes a settings menu immediately with one selected action identifier.
- @details Provides the submenu callback used by `SettingsList` so pressing Enter on any menu row resolves the outer custom UI promise with the row identifier. Runtime is O(1). Side effects are limited to one custom-UI completion callback.
- @param[in] choiceId {string} Stable choice identifier to emit.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {Component} Immediate-completion submenu component.

### fn `function buildSettingItems(` (L171-189)
- @brief Builds `SettingsList` items from one menu-choice vector.
- @details Copies labels, current values, label-tone overrides, value-tone overrides, disabled-state semantics, and descriptions into `SettingItem` records and attaches a submenu that resolves the outer custom UI with the selected choice identifier only for enabled rows. Runtime is O(n) in choice count. No external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {SettingItem[]} `SettingsList` item vector.

### fn `export async function showPiUsereqSettingsMenu(` (L201-205)
- @brief Renders one shared pi-usereq settings menu and resolves the selected action.
- @details Uses `ctx.ui.custom(...)` plus `SettingsList` so every configuration menu shares pi.dev styling, right-aligned current values, circular scrolling, bottom-line descriptions, and optional disabled rows. The returned custom component also exposes an offline bridge for deterministic tests and debug harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] title {string} Menu title displayed in the heading and offline bridge.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @param[in] options {PiUsereqSettingsMenuOptions | undefined} Optional initial-focus override.
- @return {Promise<string | undefined>} Selected choice identifier or `undefined` when cancelled.
- @satisfies REQ-151, REQ-152, REQ-153, REQ-154, REQ-156, REQ-192

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqSettingsMenuChoice`|iface||14-22|export interface PiUsereqSettingsMenuChoice|
|`PiUsereqSettingsMenuBridge`|iface||28-34|export interface PiUsereqSettingsMenuBridge|
|`PiUsereqSettingsMenuOptions`|iface||42-44|export interface PiUsereqSettingsMenuOptions|
|`PiUsereqSettingsMenuComponent`|iface||50-52|export interface PiUsereqSettingsMenuComponent extends Co...|
|`PiUsereqSettingsThemeColor`|type||60||
|`PiUsereqSettingsTheme`|iface||69-72|interface PiUsereqSettingsTheme|
|`buildFallbackPiUsereqSettingsListTheme`|fn||84-96|function buildFallbackPiUsereqSettingsListTheme(|
|`buildPiUsereqSettingsListTheme`|fn||109-123|function buildPiUsereqSettingsListTheme(|
|`formatPiUsereqSettingsMenuTitle`|fn||135-140|function formatPiUsereqSettingsMenuTitle(|
|`createImmediateSelectionComponent`|fn||149-161|function createImmediateSelectionComponent(choiceId: stri...|
|`buildSettingItems`|fn||171-189|function buildSettingItems(|
|`showPiUsereqSettingsMenu`|fn||201-205|export async function showPiUsereqSettingsMenu(|


---

# source-analyzer.ts | TypeScript | 1741L | 19 symbols | 4 imports | 39 comments
> Path: `src/core/source-analyzer.ts`
- @brief Analyzes source files into language-agnostic structural elements and markdown references.
- @details Defines the language-spec registry, source-element model, structural analyzer, Doxygen association logic, and markdown rendering helpers used by compression, reference generation, and construct search tools. Runtime is generally linear in source size plus language-pattern count. Side effects are limited to filesystem reads.

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
```

## Definitions

### enum `export enum ElementType` (L16-42)
- @brief Enumerates the normalized source-element kinds emitted by the analyzer.
- @details The enum lets language-specific regex matches collapse into a shared symbol taxonomy for downstream markdown generation and construct filtering. Access complexity is O(1).

### class `export class SourceElement` (L48-95)
- @brief Represents one analyzed source element or comment block.
- @details Stores location metadata, extracted source text, normalized naming/signature data, hierarchy information, attached Doxygen fields, and body annotations used by downstream renderers. Instance initialization is O(1) aside from object assignment.

### iface `export interface LanguageSpec` (L101-108)
- @brief Describes language-specific parsing behavior for the source analyzer.
- @details Each spec defines comment syntax, string delimiters, and ordered regex patterns mapping source lines to `ElementType` values. The interface is compile-time only and introduces no runtime cost.

### fn `function re(pattern: string): RegExp` (L116-118)
- @brief Creates a regular expression from a raw pattern string.
- @details Wraps `new RegExp(...)` to keep the language-spec table compact and visually uniform. Runtime is O(1) relative to call-site complexity. No side effects occur.
- @param[in] pattern {string} Raw regular-expression pattern.
- @return {RegExp} Constructed regular expression.

### fn `export function buildLanguageSpecs(): Record<string, LanguageSpec>` (L125-424)
- @brief Builds the analyzer language-spec registry.
- @details Materializes comment syntax, string delimiters, and ordered construct-detection regexes for all supported languages and aliases. Runtime is O(l) in the number of language definitions. No side effects occur.
- @return {Record<string, LanguageSpec>} Language-spec map keyed by canonical names and aliases.

### class `export class SourceAnalyzer` (L491-790)
- @brief Performs language-aware structural analysis and metadata enrichment on source files.
- @brief Matches explicit early-exit statements inside analyzed bodies.
- @details Parses files into `SourceElement` records, derives signatures, hierarchy, visibility, inheritance, body annotations, and Doxygen fields, then exposes the enriched element list to higher-level renderers. Runtime is generally O(n * p) where n is line count and p is pattern count for the selected language. Side effects are limited to filesystem reads.
- @details The regex captures return-like constructs that downstream markdown renderers should surface as exit annotations. Evaluation cost is linear in line length.

### fn `const isFileLevelComment = (comment: SourceElement): boolean =>` (L983-986)
- @brief Associates parsed Doxygen comments with analyzed elements.
- @details Searches inline postfix comments, nearby preceding comments, and selected following postfix comments while excluding file-level comments, then stores the parsed Doxygen field map on each element. Runtime is O(n^2) in the worst case due to proximity scans across comments and elements. Side effect: mutates `element.doxygenFields`.
- @param[in,out] elements {SourceElement[]} Elements to enrich.
- @return {void} No return value.

### fn `const hasBlockingElement = (comment: SourceElement): boolean =>` (L1007-1027)

### fn `function mdLoc(element: SourceElement): string` (L1260-1262)
- @brief Formats one element location for markdown output.
- @details Returns either a single-line `Lx` token or an inclusive line-range token `Lx-y`. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Markdown location token.

### fn `function mdKind(element: SourceElement): string` (L1270-1299)
- @brief Maps an element type to its compact markdown kind code.
- @details Converts `ElementType` values into the abbreviated tokens used by reference markdown and symbol indexes. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Compact kind code.

### fn `function extractCommentText(commentElement: SourceElement, maxLength = 0): string` (L1308-1329)
- @brief Extracts normalized plain text from a comment element.
- @details Removes comment markers, drops language-specific block delimiters, joins lines with spaces, and optionally truncates the result. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @param[in] maxLength {number} Optional maximum output length, where `0` disables truncation.
- @return {string} Cleaned comment text.

### fn `function extractCommentLines(commentElement: SourceElement): string[]` (L1337-1352)
- @brief Extracts cleaned individual lines from a comment element.
- @details Removes comment markers and delimiter-only lines while preserving line granularity for markdown rendering. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @return {string[]} Cleaned comment lines.

### fn `function buildCommentMaps(elements: SourceElement[]): [Record<number, SourceElement[]>, SourceElement[], string]` (L1360-1400)
- @brief Builds lookup structures linking comments to definitions and file descriptions.
- @details Sorts elements, associates nearby non-inline comments with following definitions, collects standalone comments, and derives a compact file description from early comment text. Runtime is O(n log n). No side effects occur.
- @param[in] elements {SourceElement[]} Analyzed source elements.
- @return {[Record<number, SourceElement[]>, SourceElement[], string]} Attached-comment map, standalone comments, and file description.

### fn `function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]>` (L1409-1415)
- @brief Merges Doxygen field values into one accumulator map.
- @details Appends values for matching tags without deduplication so relative source order is preserved. Runtime is O(v) in appended value count. Side effect: mutates `baseFields`.
- @param[in] extraFields {Record<string, string[]>} Source field map.
- @param[in,out] baseFields {Record<string, string[]>} Mutable destination field map.
- @return {Record<string, string[]>} The mutated destination map.

### fn `export function collectElementDoxygenFields(element: SourceElement): Record<string, string[]>` (L1423-1437)
- @brief Aggregates all Doxygen fields associated with one element.
- @details Starts with directly attached fields and then merges early body comments from the first three body lines when they parse as Doxygen. Runtime is O(c) in considered comment count. No external state is mutated.
- @param[in] element {SourceElement} Source element.
- @return {Record<string, string[]>} Aggregated Doxygen field map.

### fn `export function collectFileLevelDoxygenFields(elements: SourceElement[]): Record<string, string[]>` (L1445-1456)

### fn `function normalizeSourceLineForExtraction(line: string): string` (L1464-1476)
- @brief Normalizes one source-derived line for markdown extraction output.
- @details Preserves the full leading whitespace prefix when the line indentation contains at least one tab and otherwise trims leading whitespace while always trimming trailing whitespace. Runtime is O(n) in line length. No external state is mutated.
- @param[in] line {string} Source-derived line candidate.
- @return {string} Normalized line for markdown output.

### fn `export function formatMarkdown(` (L1489-1742)
- @brief Renders analyzed source elements as the repository reference-markdown format.
- @details Builds file metadata, imports, top-level definitions, child elements, comments, and a symbol index while incorporating Doxygen fields, optional legacy annotations, and preserved leading tabs in source-derived lines. Runtime is O(n log n) in element count. No side effects occur.
- @param[in] elements {SourceElement[]} Enriched source elements.
- @param[in] filePath {string} Display file path.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] specName {string} Human-readable language name.
- @param[in] totalLines {number} Total source-line count.
- @param[in] includeLegacyAnnotations {boolean} When `true`, include non-Doxygen comment annotations.
- @return {string} Rendered markdown document for the file.

### fn `function renderBodyAnnotations(` (L1715-1741)
- @brief Renders body comments and exit-point annotations for one element.
- @details Merges comment and exit maps, skips excluded line ranges, and emits normalized markdown lines that summarize body-level annotations. Runtime is O(a log a) in annotation count. No side effects occur.
- @param[in] element {SourceElement} Source element whose body annotations should be rendered.
- @param[in] indent {string} Prefix applied to each rendered annotation line.
- @param[in] excludeRanges {ReadonlyArray<readonly [number, number]> | undefined} Optional line ranges to suppress.
- @param[in,out] out {string[]} Markdown output buffer.
- @return {void} No return value.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ElementType`|enum||16-42|export enum ElementType|
|`SourceElement`|class||48-95|export class SourceElement|
|`LanguageSpec`|iface||101-108|export interface LanguageSpec|
|`re`|fn||116-118|function re(pattern: string): RegExp|
|`buildLanguageSpecs`|fn||125-424|export function buildLanguageSpecs(): Record<string, Lang...|
|`SourceAnalyzer`|class||491-790|export class SourceAnalyzer|
|`isFileLevelComment`|fn||983-986|const isFileLevelComment = (comment: SourceElement): bool...|
|`hasBlockingElement`|fn||1007-1027|const hasBlockingElement = (comment: SourceElement): bool...|
|`mdLoc`|fn||1260-1262|function mdLoc(element: SourceElement): string|
|`mdKind`|fn||1270-1299|function mdKind(element: SourceElement): string|
|`extractCommentText`|fn||1308-1329|function extractCommentText(commentElement: SourceElement...|
|`extractCommentLines`|fn||1337-1352|function extractCommentLines(commentElement: SourceElemen...|
|`buildCommentMaps`|fn||1360-1400|function buildCommentMaps(elements: SourceElement[]): [Re...|
|`mergeDoxygenFields`|fn||1409-1415|function mergeDoxygenFields(baseFields: Record<string, st...|
|`collectElementDoxygenFields`|fn||1423-1437|export function collectElementDoxygenFields(element: Sour...|
|`collectFileLevelDoxygenFields`|fn||1445-1456|export function collectFileLevelDoxygenFields(elements: S...|
|`normalizeSourceLineForExtraction`|fn||1464-1476|function normalizeSourceLineForExtraction(line: string): ...|
|`formatMarkdown`|fn||1489-1742|export function formatMarkdown(|
|`renderBodyAnnotations`|fn||1715-1741|function renderBodyAnnotations(|


---

# static-check.ts | TypeScript | 538L | 16 symbols | 7 imports | 29 comments
> Path: `src/core/static-check.ts`
- @brief Defines static-check language mappings and checker dispatch implementations.
- @details Parses Command-only user static-check specifications, preserves debug `Dummy` config handling, resolves file targets, and runs modular dummy or command-based analyzers. Runtime is linear in file count plus external tool cost. Side effects include filesystem reads, PATH probing, process spawning, and console output.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import fg from "fast-glob";
import type { StaticCheckEntry } from "./config.js";
import { ReqError } from "./errors.js";
```

## Definitions

### iface `export interface StaticCheckLanguageSupport` (L91-94)
- @brief Describes supported extensions for one canonical static-check language.
- @details The interface is used for UI rendering and capability reporting only. It is compile-time only and adds no runtime cost.

### fn `export function getSupportedStaticCheckLanguages(): string[]` (L109-111)
- @brief Returns the sorted list of canonical languages with extension support.
- @details Deduplicates the extension map values and sorts them alphabetically for stable UI and error messages. Runtime is O(n log n). No side effects occur.
- @return {string[]} Sorted canonical language names.

### fn `export function getSupportedStaticCheckLanguageSupport(): StaticCheckLanguageSupport[]` (L118-129)
- @brief Returns supported languages paired with their known file extensions.
- @details Groups extensions by canonical language and emits alphabetically sorted extension lists. Runtime is O(n log n). No external state is mutated.
- @return {StaticCheckLanguageSupport[]} Sorted language-support descriptors.

### fn `function formatStaticCheckModules(): string` (L136-138)
- @brief Formats the user-configurable module list for diagnostics.
- @details Joins `STATIC_CHECK_MODULES` with commas for direct insertion into user-facing error strings. Time complexity is O(n). No side effects occur.
- @return {string} Comma-delimited user-configurable module names.

### fn `function formatDispatchStaticCheckModules(): string` (L145-147)
- @brief Formats the persisted or debug-capable module list for dispatch diagnostics.
- @details Joins `STATIC_CHECK_PERSISTED_MODULES` with commas for error strings emitted while executing existing config entries or debug-driver requests. Time complexity is O(n). No side effects occur.
- @return {string} Comma-delimited persisted module names.

### fn `function splitCsvLikeTokens(specRhs: string): string[]` (L155-177)
- @brief Splits a comma-delimited static-check specification while honoring quotes.
- @details Performs a single pass over the right-hand side of `LANG=...`, preserving commas inside quoted segments. Runtime is O(n). No side effects occur.
- @param[in] specRhs {string} Right-hand side of the enable-static-check specification.
- @return {string[]} Parsed tokens with surrounding whitespace trimmed.

### fn `export function parseEnableStaticCheck(spec: string): [string, StaticCheckEntry]` (L186-234)
- @brief Parses one `LANG=Command,CMD[,PARAM...]` static-check specification.
- @details Validates the language alias, canonicalizes the Command module name, enforces the required executable argument, and returns a config entry ready for persistence. Runtime is O(n) in specification length. No external state is mutated.
- @param[in] spec {string} Raw static-check specification string.
- @return {[string, StaticCheckEntry]} Tuple of canonical language name and normalized checker configuration.
- @throws {ReqError} Throws for missing separators, unknown languages, non-Command modules, or missing required command arguments.

### fn `export function buildStaticCheckEntryIdentity(language: string, entry: StaticCheckEntry): string` (L244-249)
- @brief Builds the duplicate-identity token for one static-check entry.
- @details Canonicalizes the language key, module name, command name, and parameter list into a stable JSON tuple used for merge deduplication. Runtime is O(p) in parameter count. No side effects occur.
- @param[in] language {string} Canonical or alias language name associated with the entry.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to normalize.
- @return {string} Stable identity token suitable for equality comparison.
- @satisfies REQ-036

### fn `export function validateStaticCheckEntry(entry: StaticCheckEntry): void` (L259-270)
- @brief Validates pre-persistence invariants for one static-check entry.
- @details Rejects `Command` entries whose executable cannot be resolved before config writes while leaving non-command modules untouched. Runtime is O(p) in PATH entry count. Side effects are limited to filesystem reads.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to validate.
- @return {void} No return value.
- @throws {ReqError} Throws when a `Command` entry omits `cmd` or resolves to a non-executable program.
- @satisfies REQ-037

### fn `function resolveFiles(inputs: string[]): string[]` (L278-302)
- @brief Resolves explicit files, directories, and glob patterns into absolute file paths.
- @details Expands glob inputs with `fast-glob`, enumerates direct children for directory inputs, accepts regular files, and warns for invalid entries. Runtime is O(n + m) where m is the total matched path count. Side effects are filesystem reads and warning output to stderr.
- @param[in] inputs {string[]} Raw file, directory, or glob inputs.
- @return {string[]} Unique absolute file paths.

### class `export class StaticCheckBase` (L308-382)
- @brief Provides the shared and debug-capable base implementation for file-oriented static checks.
- @details Resolves input files once, emits standardized headers, implements the debug `Dummy` checker behavior, and defines overridable `checkFile` plus `emitLine` hooks used by concrete analyzers. Runtime is O(f) plus subclass checker cost. Side effects include console output.

### class `export class StaticCheckCommand extends StaticCheckBase` : StaticCheckBase (L388-437)
- @brief Runs the user-facing external-command static checker.
- @brief Initializes a command-backed checker instance.
- @details Validates command availability on PATH during construction, then invokes the command with configured extra arguments plus one target file at a time. Runtime is dominated by external command execution. Side effects include PATH probing, process spawning, and console output.
- @details Validates that the executable exists on PATH before delegating file resolution to the base class and recording the command label. Runtime is O(p + f) where p is PATH entry count and f is resolved input count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name.
- @param[in] inputs {string[]} Raw file inputs.
- @param[in] extraArgs {string[] | undefined} Extra command arguments.
- @param[in] failOnly {boolean} When `true`, suppress successful-file output.
- @throws {ReqError} Throws when the executable cannot be found on PATH.

### fn `function isExecutableFile(candidate: string): boolean` (L445-455)
- @brief Tests whether one filesystem path is executable.
- @details Requires the candidate to exist, be a regular file, and pass `X_OK` access checks. Runtime is O(1). Side effects are limited to filesystem reads.
- @param[in] candidate {string} Absolute or relative path to inspect.
- @return {boolean} `true` when the candidate is executable by the current process.

### fn `function findExecutable(cmd: string): string | undefined` (L463-474)
- @brief Locates an executable by scanning the current PATH.
- @details Checks each PATH directory for an executable file named exactly as the requested command. Runtime is O(p) in PATH entry count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name to locate.
- @return {string | undefined} Absolute executable path, or `undefined` when not found.

### fn `export function dispatchStaticCheckForFile(` (L485-488)
- @brief Dispatches one configured static checker for a single file.
- @details Selects the debug `Dummy` or user-facing `Command` implementation by module name, normalizes parameter arrays, and runs exactly one checker instance against the target file. Runtime is dominated by the selected checker. Side effects include console output and possible process spawning.
- @param[in] filePath {string} Absolute or relative file path to check.
- @param[in] langConfig {StaticCheckEntry} Normalized static-check configuration entry.
- @param[in] options {{ failOnly?: boolean; projectBase?: string }} Optional execution controls.
- @return {number} Checker exit status where `0` means success and non-zero means failure.
- @throws {ReqError} Throws when configuration is incomplete or names an unknown module.

### fn `export function runStaticCheck(argv: string[]): number` (L517-538)
- @brief Runs the standalone static-check test driver.
- @details Dispatches debug `dummy` or user-facing `command` subcommands without consulting project configuration. Runtime is O(n) in argument count plus checker cost. Side effects include console output and external process spawning.
- @param[in] argv {string[]} Raw static-check subcommand arguments.
- @return {number} Checker exit status where `0` means success.
- @throws {ReqError} Throws when no subcommand is provided, the subcommand is unknown, or required arguments are missing.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckLanguageSupport`|iface||91-94|export interface StaticCheckLanguageSupport|
|`getSupportedStaticCheckLanguages`|fn||109-111|export function getSupportedStaticCheckLanguages(): string[]|
|`getSupportedStaticCheckLanguageSupport`|fn||118-129|export function getSupportedStaticCheckLanguageSupport():...|
|`formatStaticCheckModules`|fn||136-138|function formatStaticCheckModules(): string|
|`formatDispatchStaticCheckModules`|fn||145-147|function formatDispatchStaticCheckModules(): string|
|`splitCsvLikeTokens`|fn||155-177|function splitCsvLikeTokens(specRhs: string): string[]|
|`parseEnableStaticCheck`|fn||186-234|export function parseEnableStaticCheck(spec: string): [st...|
|`buildStaticCheckEntryIdentity`|fn||244-249|export function buildStaticCheckEntryIdentity(language: s...|
|`validateStaticCheckEntry`|fn||259-270|export function validateStaticCheckEntry(entry: StaticChe...|
|`resolveFiles`|fn||278-302|function resolveFiles(inputs: string[]): string[]|
|`StaticCheckBase`|class||308-382|export class StaticCheckBase|
|`StaticCheckCommand`|class||388-437|export class StaticCheckCommand extends StaticCheckBase|
|`isExecutableFile`|fn||445-455|function isExecutableFile(candidate: string): boolean|
|`findExecutable`|fn||463-474|function findExecutable(cmd: string): string | undefined|
|`dispatchStaticCheckForFile`|fn||485-488|export function dispatchStaticCheckForFile(|
|`runStaticCheck`|fn||517-538|export function runStaticCheck(argv: string[]): number|


---

# token-counter.ts | TypeScript | 593L | 32 symbols | 6 imports | 35 comments
> Path: `src/core/token-counter.ts`
- @brief Provides token, size, and structure counting utilities for agent-oriented file payloads.
- @details Wraps `js-tiktoken` encoding lookup, extracts per-file structural facts, and builds machine-oriented JSON payloads for token-centric tools. Runtime is linear in processed text size plus sort cost for derived ordering hints. Side effects are limited to filesystem reads in file-based helpers.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { detectLanguage as detectSourceLanguage } from "./compress.js";
import { parseDoxygenComment, type DoxygenFieldMap } from "./doxygen-parser.js";
import { ReqError } from "./errors.js";
```

## Definitions

- type `export type TokenToolScope = "explicit-files" | "canonical-docs";` (L24)
- @brief Enumerates supported token-payload scopes.
- @details Distinguishes explicit-file requests from canonical-document requests while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type TokenFileStatus = "counted" | "error" | "skipped";` (L30)
- @brief Enumerates supported per-file token-entry statuses.
- @details Separates counted files, read-time failures, and skipped inputs so downstream agents can branch without reparsing text diagnostics. The alias is compile-time only and introduces no runtime cost.
### iface `export interface CountFileMetricsResult` (L36-49)
- @brief Describes one per-file token metric record.
- @details Stores canonical file identity plus numeric token, character, byte, and line metrics extracted from one readable file. Optional metadata remains isolated in dedicated fields so agents can access headings and Doxygen fields without reparsing monolithic text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolFileEntry` (L55-65)
- @brief Describes one file entry in the agent-oriented token payload.
- @details Stores only the canonical identity, stable status, essential numeric metrics, and optional heading or Doxygen metadata needed for downstream reasoning. Derivable identity and filesystem-probe fields are intentionally omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolRequestSection` (L71-81)
- @brief Describes the request section of the agent-oriented token payload.
- @details Captures tool identity, scope, path-resolution base, encoding, and requested path inventories so agents can reason about how metrics were selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolSummarySection` (L87-96)
- @brief Describes the summary section of the agent-oriented token payload.
- @details Exposes only aggregate counts and totals that cannot be reconstructed cheaply from caller-known inputs. Derivable per-file averages are omitted to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolPathIssue` (L102-106)
- @brief Describes one skipped-input or read-error observation.
- @details Preserves both the caller-provided path and the canonicalized path plus a stable machine-readable reason string. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolDominantFileObservation` (L112-116)
- @brief Describes the dominant counted file for one metric ordering.
- @details Exposes the canonical path plus the numeric token metrics that justify why the file dominates the current context budget. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolSourceObservationsSection` (L122-128)
- @brief Describes the source-observation subsection of the guidance payload.
- @details Separates measured ordering facts and path issues from derived recommendations so agents can reason about raw observations independently. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolRecommendation` (L134-138)
- @brief Describes one derived recommendation in the guidance payload.
- @details Provides a stable recommendation kind, the basis metric used to derive it, and the ordered path list the agent can follow directly. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolNextStepHint` (L144-148)
- @brief Describes one actionable next-step hint in the guidance payload.
- @details Supplies a stable hint kind, a focused ordered path subset, and the goal the agent can apply without reparsing surrounding prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolGuidanceSection` (L154-158)
- @brief Describes the guidance section of the agent-oriented token payload.
- @details Separates source observations, derived recommendations, and actionable next-step hints so downstream agents can choose between raw evidence and planning heuristics without reparsing mixed prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolPayload` (L164-167)
- @brief Describes the full agent-oriented token payload.
- @details Exposes only aggregate numeric totals plus per-file metrics, omitting request echoes and derived guidance that can be inferred from tool registration or recomputed by the caller. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildTokenToolPayloadOptions` (L173-181)
- @brief Describes the options required to build one agent-oriented token payload.
- @details Supplies tool identity, scope, path base, requested paths, and optional canonical-doc metadata while keeping counting behavior configurable through a stable object contract. The interface is compile-time only and introduces no runtime cost.

- type `type TokenCounterEncoding = {` (L183)
- type `type JsTiktokenModule = {` (L187)
### fn `function defaultJsTiktokenModuleLoader(): JsTiktokenModule` (L193-195)

### fn `export function setJsTiktokenModuleLoaderForTests(loader?: () => JsTiktokenModule): void` (L205-207)
- @brief Overrides the `js-tiktoken` loader for tests.
- @details Enables deterministic dependency-failure tests without mutating repository dependencies on disk. Runtime is O(1). Side effects are limited to module-local test state.
- @param[in] loader {(() => JsTiktokenModule) | undefined} Replacement loader, or `undefined` to restore the default loader.
- @return {void} No return value.

### fn `function loadJsTiktokenModule(): JsTiktokenModule` (L215-232)
- @brief Loads the `js-tiktoken` module on demand.
- @details Defers dependency resolution until token counting is requested so extension registration can succeed even when the optional runtime dependency has not yet been installed. Runtime is O(1) plus module resolution cost. Side effects are limited to Node module loading.
- @return {JsTiktokenModule} Loaded tokenizer module.
- @throws {ReqError} Throws when `js-tiktoken` is unavailable.

### class `export class TokenCounter` (L238-278)
- @brief Encapsulates one tokenizer instance for repeated token counting.
- @brief Stores the tokenizer implementation used for subsequent counts.
- @details Caches a `js-tiktoken` encoding object so multiple documents can be counted without repeated encoding lookup. Counting cost is O(n) in content length. The class mutates only instance state during construction.
- @details The field holds the encoder returned by `getEncoding`. Access complexity is O(1). The value is initialized once per instance.

### fn `function canonicalizeTokenPath(filePath: string, baseDir: string): string` (L287-295)
- @brief Converts one filesystem path into the canonical token-payload path form.
- @details Emits a slash-normalized relative path when the target is under the supplied base directory; otherwise emits a slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
- @param[in] filePath {string} Candidate absolute or relative filesystem path.
- @param[in] baseDir {string} Reference directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function countLines(content: string): number` (L303-309)
- @brief Counts logical lines in one text payload.
- @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
- @param[in] content {string} Text payload.
- @return {number} Logical line count; `0` for empty content.

### fn `function stripMarkdownFrontMatter(content: string): string` (L317-320)
- @brief Strips YAML front matter from markdown content before heading extraction.
- @details Removes the first `--- ... ---` block only when it appears at the file start so heading detection can operate on semantic markdown content instead of metadata. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} Markdown payload.
- @return {string} Markdown body without the leading front matter block.

### fn `function extractPrimaryHeadingText(content: string, filePath: string): string | undefined` (L329-336)
- @brief Extracts the first level-one markdown heading when present.
- @details Restricts extraction to markdown-like files, skips YAML front matter, and returns the first `# ` heading payload without surrounding whitespace. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} File content.
- @param[in] filePath {string} Source path used for extension-based markdown detection.
- @return {string | undefined} First heading text, or `undefined` when absent or the file is not markdown-like.

### fn `function inferLanguageName(filePath: string): string | undefined` (L344-353)
- @brief Infers a file language label optimized for agent payloads.
- @details Reuses source-language detection when available, normalizes markdown extensions explicitly, and falls back to the lowercase extension name without the leading dot. Runtime is O(1). No side effects occur.
- @param[in] filePath {string} File path whose extension should be classified.
- @return {string | undefined} Normalized language label, or `undefined` when the path has no usable extension.

### fn `function extractLeadingDoxygenFields(content: string): DoxygenFieldMap | undefined` (L361-379)
- @brief Extracts leading Doxygen file fields when present.
- @details Tests common leading-comment syntaxes, normalizes an optional shebang away before matching, and returns the first non-empty parsed Doxygen map. Runtime is O(n) in comment length. No side effects occur.
- @param[in] content {string} File content.
- @return {DoxygenFieldMap | undefined} Parsed Doxygen field map, or `undefined` when no supported file-level fields are present.

### fn `function probeRequestedPath(absolutePath: string): { exists: boolean; isFile: boolean; reason?: string }` (L387-401)
- @brief Probes one requested path before token counting.
- @details Resolves whether the target exists and is a regular file while capturing a stable skip reason for missing or non-file inputs. Runtime is dominated by one filesystem stat. Side effects are limited to filesystem reads.
- @param[in] absolutePath {string} Absolute path to inspect.
- @return {{ exists: boolean; isFile: boolean; reason?: string }} Path probe result.

### fn `function buildCountFileMetricsResult(filePath: string, content: string, counter: TokenCounter): CountFileMetricsResult` (L411-426)
- @brief Builds one rich per-file metrics record from readable content.
- @details Combines token, character, byte, and line counts with file-extension, inferred-language, heading, and Doxygen metadata extraction so agents can consume direct-access facts without reparsing the raw file. Runtime is O(n) in content length. No external state is mutated.
- @param[in] filePath {string} Absolute or project-local file path.
- @param[in] content {string} UTF-8 file content.
- @param[in] counter {TokenCounter} Reused token counter instance.
- @return {CountFileMetricsResult} Structured per-file metrics record.

### fn `export function countFileMetrics(content: string, encodingName = TOKEN_COUNTER_ENCODING):` (L435-448)
- @brief Counts tokens, characters, bytes, and lines for one in-memory content string.
- @details Instantiates a `TokenCounter`, tokenizes the supplied text, and pairs the result with raw character length, UTF-8 byte size, and logical line count. Runtime is O(n). No filesystem I/O occurs.
- @param[in] content {string} Text payload to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {{ tokens: number; chars: number; bytes: number; lines: number }} Aggregate metrics for the supplied content.

### fn `export function countFilesMetrics(filePaths: string[], encodingName = TOKEN_COUNTER_ENCODING): CountFileMetricsResult[]` (L458-479)
- @brief Counts tokens, characters, bytes, and lines for multiple files.
- @details Reuses a single `TokenCounter`, reads each file as UTF-8, and returns per-file metrics plus direct-access metadata such as heading and Doxygen file fields. Read failures are captured as error strings instead of aborting the entire batch. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] filePaths {string[]} File paths to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {CountFileMetricsResult[]} Per-file metrics and optional read errors.
- @satisfies REQ-010, REQ-070, REQ-073

### fn `export function buildTokenToolPayload(options: BuildTokenToolPayloadOptions): TokenToolPayload` (L488-561)
- @brief Builds the agent-oriented JSON payload for token-centric tools.
- @details Validates requested paths against the filesystem, counts token metrics for processable files, preserves caller order in the file table, and emits direct-access file facts such as sizes, headings, and optional Doxygen file fields while omitting request echoes and derived guidance. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] options {BuildTokenToolPayloadOptions} Payload-construction options.
- @return {TokenToolPayload} Structured token payload ordered as summary then files.
- @satisfies REQ-010, REQ-017, REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075

### fn `export function formatPackSummary(results: CountFileMetricsResult[]): string` (L569-593)
- @brief Formats per-file token metrics as a human-readable summary block.
- @details Aggregates totals, emits one status line per file, and appends a summary footer containing file, token, and character counts. Runtime is O(n). No external state is mutated.
- @param[in] results {CountFileMetricsResult[]} Per-file metric records.
- @return {string} Multiline summary suitable for CLI or editor output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`TokenToolScope`|type||24||
|`TokenFileStatus`|type||30||
|`CountFileMetricsResult`|iface||36-49|export interface CountFileMetricsResult|
|`TokenToolFileEntry`|iface||55-65|export interface TokenToolFileEntry|
|`TokenToolRequestSection`|iface||71-81|export interface TokenToolRequestSection|
|`TokenToolSummarySection`|iface||87-96|export interface TokenToolSummarySection|
|`TokenToolPathIssue`|iface||102-106|export interface TokenToolPathIssue|
|`TokenToolDominantFileObservation`|iface||112-116|export interface TokenToolDominantFileObservation|
|`TokenToolSourceObservationsSection`|iface||122-128|export interface TokenToolSourceObservationsSection|
|`TokenToolRecommendation`|iface||134-138|export interface TokenToolRecommendation|
|`TokenToolNextStepHint`|iface||144-148|export interface TokenToolNextStepHint|
|`TokenToolGuidanceSection`|iface||154-158|export interface TokenToolGuidanceSection|
|`TokenToolPayload`|iface||164-167|export interface TokenToolPayload|
|`BuildTokenToolPayloadOptions`|iface||173-181|export interface BuildTokenToolPayloadOptions|
|`TokenCounterEncoding`|type||183||
|`JsTiktokenModule`|type||187||
|`defaultJsTiktokenModuleLoader`|fn||193-195|function defaultJsTiktokenModuleLoader(): JsTiktokenModule|
|`setJsTiktokenModuleLoaderForTests`|fn||205-207|export function setJsTiktokenModuleLoaderForTests(loader?...|
|`loadJsTiktokenModule`|fn||215-232|function loadJsTiktokenModule(): JsTiktokenModule|
|`TokenCounter`|class||238-278|export class TokenCounter|
|`canonicalizeTokenPath`|fn||287-295|function canonicalizeTokenPath(filePath: string, baseDir:...|
|`countLines`|fn||303-309|function countLines(content: string): number|
|`stripMarkdownFrontMatter`|fn||317-320|function stripMarkdownFrontMatter(content: string): string|
|`extractPrimaryHeadingText`|fn||329-336|function extractPrimaryHeadingText(content: string, fileP...|
|`inferLanguageName`|fn||344-353|function inferLanguageName(filePath: string): string | un...|
|`extractLeadingDoxygenFields`|fn||361-379|function extractLeadingDoxygenFields(content: string): Do...|
|`probeRequestedPath`|fn||387-401|function probeRequestedPath(absolutePath: string): { exis...|
|`buildCountFileMetricsResult`|fn||411-426|function buildCountFileMetricsResult(filePath: string, co...|
|`countFileMetrics`|fn||435-448|export function countFileMetrics(content: string, encodin...|
|`countFilesMetrics`|fn||458-479|export function countFilesMetrics(filePaths: string[], en...|
|`buildTokenToolPayload`|fn||488-561|export function buildTokenToolPayload(options: BuildToken...|
|`formatPackSummary`|fn||569-593|export function formatPackSummary(results: CountFileMetri...|


---

# tool-runner.ts | TypeScript | 438L | 21 symbols | 11 imports | 23 comments
> Path: `src/core/tool-runner.ts`
- @brief Implements the executable back-end for pi-usereq CLI analysis and static-check commands.
- @details Centralizes project discovery, git-backed source-file collection, documentation token generation, compression, construct lookup, and static-check dispatch. Runtime depends on the selected command and may include filesystem reads, config writes, and process spawning.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import {
import { countFilesMetrics, formatPackSummary } from "./token-counter.js";
import { compressFiles } from "./compress-files.js";
import { searchConstructsInFiles } from "./find-constructs.js";
import { generateMarkdown } from "./generate-markdown.js";
import { STATIC_CHECK_EXT_TO_LANG, dispatchStaticCheckForFile } from "./static-check.js";
import { makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface ToolResult` (L29-33)
- @brief Represents the normalized output contract for a tool invocation.
- @details Every tool emits stdout, stderr, and a numeric exit code so CLI and extension front-ends can handle results uniformly. The interface is compile-time only and adds no runtime cost.

### fn `function ok(stdout = "", stderr = ""): ToolResult` (L53-55)
- @brief Creates a successful tool result payload.
- @details Wraps stdout and stderr text with exit code `0`. Runtime is O(1). No side effects occur.
- @param[in] stdout {string} Standard-output text.
- @param[in] stderr {string} Standard-error text.
- @return {ToolResult} Successful result object.

### fn `function fail(message: string, code = 1, stdout = "", stderr = ""): never` (L67-72)
- @brief Throws a `ReqError` populated with tool-result stream content.
- @details Creates a structured failure object, attaches optional stdout and stderr payloads, and throws immediately. Runtime is O(1). Side effect: throws an exception.
- @param[in] message {string} Primary failure message.
- @param[in] code {number} Exit code to attach. Defaults to `1`.
- @param[in] stdout {string} Optional stdout payload.
- @param[in] stderr {string} Optional stderr payload. Defaults to `message` when omitted.
- @return {never} This function never returns.
- @throws {ReqError} Always throws.

### fn `function runCapture(command: string[], options: { cwd?: string } = {})` (L81-86)
- @brief Executes a subprocess synchronously and captures its output.
- @details Delegates to `spawnSync`, passes through an optional working directory, and forces UTF-8 decoding. Runtime is dominated by external process execution. Side effects include process spawning.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] options {{ cwd?: string }} Optional process-spawn settings.
- @return {ReturnType<typeof spawnSync>} Captured subprocess result.

### fn `export function collectSourceFiles(srcDirs: string[], projectBase: string): string[]` (L96-123)
- @brief Collects tracked and untracked source files from configured source directories.
- @details Uses `git ls-files` to enumerate candidate files, filters them by configured source roots, excluded directories, and supported extensions, and returns sorted absolute paths. Runtime is O(n log n) in collected file count plus git execution cost. Side effects include process spawning.
- @param[in] srcDirs {string[]} Configured source-directory roots.
- @param[in] projectBase {string} Absolute project root.
- @return {string[]} Sorted absolute source-file paths.
- @throws {ReqError} Throws when `git ls-files` fails.

### fn `function buildAsciiTree(paths: string[]): string` (L131-159)
- @brief Builds an ASCII tree from relative file paths.
- @details Materializes a nested object tree and renders it using box-drawing characters for markdown display. Runtime is O(n log n) in path count due to sorting. No side effects occur.
- @param[in] paths {string[]} Relative POSIX-style file paths.
- @return {string} Rendered ASCII tree.

### fn `const emit = (branch: Record<string, Record<string, unknown> | null>, prefix = "") =>` (L147-156)

### fn `function formatFilesStructureMarkdown(files: string[], projectBase: string): string` (L168-171)
- @brief Formats the collected file structure as markdown.
- @details Converts absolute file paths to project-relative POSIX paths, renders an ASCII tree, and wraps the result in a fenced markdown block. Runtime is O(n log n) in file count. No side effects occur.
- @param[in] files {string[]} Absolute file paths.
- @param[in] projectBase {string} Absolute project root.
- @return {string} Markdown section describing the file structure.

### fn `export function resolveProjectBase(projectBase?: string): string` (L180-186)
- @brief Resolves and validates the project base directory.
- @details Uses the supplied path or the current working directory, normalizes it to an absolute path, and verifies that it exists. Runtime is O(1) plus one filesystem existence check. Side effects are limited to filesystem reads.
- @param[in] projectBase {string | undefined} Optional project-root override.
- @return {string} Absolute validated project root.
- @throws {ReqError} Throws when the resolved path does not exist.

### fn `export function resolveProjectSrcDirs(projectBase: string, config?: UseReqConfig): [string, string[]]` (L196-204)
- @brief Resolves the project base and effective source-directory list.
- @details Loads configuration when not supplied, validates that at least one source directory exists in config, and returns both the absolute base path and source-directory array. Runtime is O(s). Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {[string, string[]]} Tuple of absolute project base and configured source directories.
- @throws {ReqError} Throws when no source directories are configured.

### fn `export function loadAndRepairConfig(projectBase: string): UseReqConfig` (L213-218)
- @brief Loads project configuration and persists normalized path fields.
- @details Resolves the base path, normalizes persisted docs/tests/source directories into project-relative form, writes the normalized config back to disk, and returns the in-memory result without persisting runtime-derived path metadata. Runtime is dominated by config I/O. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root.
- @return {UseReqConfig} Normalized effective configuration.
- @satisfies CTN-012, REQ-146

### fn `export function runFilesTokens(files: string[]): ToolResult` (L227-239)
- @brief Counts tokens and characters for explicit files.
- @details Filters missing files into stderr warnings, counts metrics for valid files, and returns a formatted summary. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] files {string[]} Explicit file paths.
- @return {ToolResult} Tool result containing the formatted summary and warnings.
- @throws {ReqError} Throws when no valid files are provided.

### fn `export function runFilesReferences(files: string[], cwd = process.cwd(), verbose = false): ToolResult` (L250-256)
- @brief Generates the monolithic references markdown for explicit files.
- @details Delegates to `generateMarkdown(...)`, keeps output paths relative to the caller cwd, and returns the Python-compatible markdown document through stdout. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory used for relative output paths. Defaults to `process.cwd()`.
- @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
- @return {ToolResult} Successful tool result containing monolithic markdown.
- @satisfies REQ-011, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function runFilesCompress(files: string[], cwd = process.cwd(), enableLineNumbers = false, verbose = false): ToolResult` (L267-269)
- @brief Compresses explicit files into compact source excerpts.
- @details Delegates to `compressFiles` using the caller working directory as the relative-output base by default. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory for relative output formatting. Defaults to `process.cwd()`.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.

### fn `export function runFilesSearch(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult` (L280-286)
- @brief Searches named constructs in explicit files.
- @details Expects `[TAG, PATTERN, ...FILES]`, validates minimum arity, and delegates to `searchConstructsInFiles`. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] argsList {string[]} Positional argument list containing tag filter, regex pattern, and files.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
- @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
- @return {ToolResult} Successful tool result containing construct markdown.
- @throws {ReqError} Throws when required arguments are missing.

### fn `export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult` (L298-309)
- @brief Generates the monolithic references markdown for configured source directories.
- @details Resolves the project base, collects configured source files, prepends the repository file-structure markdown block, and returns the Python-compatible references document through stdout. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing monolithic markdown.
- @throws {ReqError} Throws when no source files are found or no file can be analyzed.
- @satisfies REQ-014, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L321-326)
- @brief Compresses all source files from configured source directories.
- @details Resolves the project base, collects source files, and delegates to `compressFiles`. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runSearch(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L340-349)
- @brief Searches named constructs across configured project source files.
- @details Resolves the project base, collects source files, delegates to `searchConstructsInFiles`, and converts thrown search errors into structured `ReqError` failures. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] tagFilter {string} Pipe-delimited tag filter.
- @param[in] pattern {string} Regular expression applied to construct names.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
- @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
- @return {ToolResult} Successful tool result containing construct markdown.
- @throws {ReqError} Throws when no source files are found or the search fails.

### fn `export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult` (L359-368)
- @brief Counts tokens for canonical documentation files.
- @details Loads the configured docs directory, selects `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` when present, and delegates to `runFilesTokens`. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Tool result containing documentation token metrics.
- @throws {ReqError} Throws when no canonical docs files exist.

### fn `export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult` (L378-414)
- @brief Runs configured static checks for explicit files.
- @details Loads the effective static-check config, resolves the active checker list per file-extension language through the per-language enable flag, captures checker stdout for each dispatched entry, and aggregates stderr warnings for invalid paths. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] files {string[]} Explicit file paths.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.

### fn `export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L424-437)
- @brief Runs configured static checks for project source and test directories.
- @details Collects source and test files, excludes fixture roots, and delegates to `runFilesStaticCheck`. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.
- @throws {ReqError} Throws when no source files are found.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolResult`|iface||29-33|export interface ToolResult|
|`ok`|fn||53-55|function ok(stdout = "", stderr = ""): ToolResult|
|`fail`|fn||67-72|function fail(message: string, code = 1, stdout = "", std...|
|`runCapture`|fn||81-86|function runCapture(command: string[], options: { cwd?: s...|
|`collectSourceFiles`|fn||96-123|export function collectSourceFiles(srcDirs: string[], pro...|
|`buildAsciiTree`|fn||131-159|function buildAsciiTree(paths: string[]): string|
|`emit`|fn||147-156|const emit = (branch: Record<string, Record<string, unkno...|
|`formatFilesStructureMarkdown`|fn||168-171|function formatFilesStructureMarkdown(files: string[], pr...|
|`resolveProjectBase`|fn||180-186|export function resolveProjectBase(projectBase?: string):...|
|`resolveProjectSrcDirs`|fn||196-204|export function resolveProjectSrcDirs(projectBase: string...|
|`loadAndRepairConfig`|fn||213-218|export function loadAndRepairConfig(projectBase: string):...|
|`runFilesTokens`|fn||227-239|export function runFilesTokens(files: string[]): ToolResult|
|`runFilesReferences`|fn||250-256|export function runFilesReferences(files: string[], cwd =...|
|`runFilesCompress`|fn||267-269|export function runFilesCompress(files: string[], cwd = p...|
|`runFilesSearch`|fn||280-286|export function runFilesSearch(argsList: string[], enable...|
|`runReferences`|fn||298-309|export function runReferences(projectBase: string, config...|
|`runCompress`|fn||321-326|export function runCompress(projectBase: string, config?:...|
|`runSearch`|fn||340-349|export function runSearch(projectBase: string, tagFilter:...|
|`runTokens`|fn||359-368|export function runTokens(projectBase: string, config?: U...|
|`runFilesStaticCheck`|fn||378-414|export function runFilesStaticCheck(files: string[], proj...|
|`runProjectStaticCheck`|fn||424-437|export function runProjectStaticCheck(projectBase: string...|


---

# utils.ts | TypeScript | 185L | 8 symbols | 3 imports | 9 comments
> Path: `src/core/utils.ts`
- @brief Provides path-normalization, shell-tokenization, and regex-escaping helpers.
- @details Concentrates small pure utilities used by configuration loading, prompt rendering, and command dispatch. Most operations are linear in string length. Side effects are limited to filesystem existence checks in path normalization helpers.

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
```

## Definitions

### fn `export function formatSubstitutedPath(value: string): string` (L17-19)
- @brief Normalizes path separators to forward slashes.
- @details Leaves empty input as an empty string and converts platform-specific separators to POSIX form for prompt-safe display. Time complexity is O(n) in path length. No side effects occur.
- @param[in] value {string} Path-like string.
- @return {string} Slash-normalized path string.

### fn `export function makeRelativeIfContainsProject(pathValue: string, projectBase: string): string` (L28-68)
- @brief Rewrites a path to be project-relative when it resolves inside the project root.
- @details Handles absolute paths, repeated project-name prefixes, and embedded project-name segments, then falls back to the original value when safe relativization is not possible. Runtime is O(p) plus filesystem checks for candidate suffixes. Side effects are limited to existence checks.
- @param[in] pathValue {string} User-supplied path value.
- @param[in] projectBase {string} Absolute project root used as the relativization anchor.
- @return {string} Project-relative path when derivable; otherwise the original or best-effort normalized input.

### fn `export function resolveAbsolute(normalized: string, projectBase: string): string | undefined` (L77-80)
- @brief Resolves a normalized path against the project root.
- @details Returns `undefined` for empty input, preserves absolute paths, and resolves relative paths from `projectBase`. Time complexity is O(p). No side effects occur.
- @param[in] normalized {string} Normalized path token.
- @param[in] projectBase {string} Absolute project root.
- @return {string | undefined} Absolute path or `undefined` for empty input.

### fn `export function computeSubPath(normalized: string, absolute: string | undefined, projectBase: string): string` (L90-99)
- @brief Computes a slash-normalized project subpath for display or config storage.
- @details Prefers a relative path derived from the provided absolute path when it stays inside the project root; otherwise formats the normalized input directly. Runtime is O(p). No side effects occur.
- @param[in] normalized {string} Original normalized path token.
- @param[in] absolute {string | undefined} Absolute candidate path.
- @param[in] projectBase {string} Absolute project root.
- @return {string} Slash-normalized subpath.

### fn `export function makeRelativeToken(raw: string, keepTrailing = false): string` (L108-114)
- @brief Normalizes a raw path token into a relative slash-separated fragment.
- @details Removes leading and trailing separators, converts backslashes to slashes, and optionally preserves a trailing slash marker. Runtime is O(n). No side effects occur.
- @param[in] raw {string} Raw token to normalize.
- @param[in] keepTrailing {boolean} When `true`, preserve a trailing slash if the input contained one.
- @return {string} Normalized relative token.

### fn `export function shellSplit(value: string): string[]` (L122-160)
- @brief Splits a shell-style argument string into tokens.
- @details Supports single quotes, double quotes, backslash escaping, and whitespace token boundaries without invoking an external shell. Runtime is O(n). No side effects occur.
- @param[in] value {string} Raw argument string.
- @return {string[]} Parsed token list.

### fn `export function homeRelative(absolutePath: string): string` (L168-175)
- @brief Rewrites an absolute path relative to the user's home directory when possible.
- @details Returns `~` for the home directory itself, `~/...` for descendants, and a slash-normalized original path otherwise. Runtime is O(p). No side effects occur.
- @param[in] absolutePath {string} Absolute path candidate.
- @return {string} Home-relative or slash-normalized path string.

### fn `export function escapeRegExp(value: string): string` (L183-185)
- @brief Escapes regular-expression metacharacters in a literal string.
- @details Replaces every regex-significant character with its escaped form so the result can be embedded safely into a dynamic pattern. Runtime is O(n). No side effects occur.
- @param[in] value {string} Literal string to escape.
- @return {string} Regex-safe literal fragment.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatSubstitutedPath`|fn||17-19|export function formatSubstitutedPath(value: string): string|
|`makeRelativeIfContainsProject`|fn||28-68|export function makeRelativeIfContainsProject(pathValue: ...|
|`resolveAbsolute`|fn||77-80|export function resolveAbsolute(normalized: string, proje...|
|`computeSubPath`|fn||90-99|export function computeSubPath(normalized: string, absolu...|
|`makeRelativeToken`|fn||108-114|export function makeRelativeToken(raw: string, keepTraili...|
|`shellSplit`|fn||122-160|export function shellSplit(value: string): string[]|
|`homeRelative`|fn||168-175|export function homeRelative(absolutePath: string): string|
|`escapeRegExp`|fn||183-185|export function escapeRegExp(value: string): string|


---

# index.ts | TypeScript | 3765L | 87 symbols | 25 imports | 93 comments
> Path: `src/index.ts`
- @brief Registers the pi-usereq extension commands, tools, and configuration UI.
- @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import type {
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
import type { FindToolScope } from "./core/find-payload.js";
import {
import {
import {
import { showPiUsereqSettingsMenu, type PiUsereqSettingsMenuChoice } from "./core/settings-menu.js";
import {
import { renderPrompt } from "./core/prompts.js";
import {
import {
import { PROMPT_COMMAND_NAMES } from "./core/prompt-command-catalog.js";
import { resolveRuntimeGitPath } from "./core/runtime-project-paths.js";
import {
import { ensureBundledResourcesAccessible, readBundledPromptDescription } from "./core/resources.js";
import { ReqError } from "./core/errors.js";
import {
import {
import { LANGUAGE_TAGS } from "./core/find-constructs.js";
import {
import { makeRelativeIfContainsProject, shellSplit } from "./core/utils.js";
```

## Definitions

### iface `interface PiShortcutRegistrar` (L161-169)
- @brief Describes the optional shortcut-registration surface used by pi-usereq.
- @details Narrows the runtime API to the documented `registerShortcut(...)`
method so the extension can remain compatible with offline harnesses that do
not implement shortcut capture. Compile-time only and introduces no runtime
cost.

### fn `function getProjectBase(cwd: string): string` (L177-186)
- @brief Resolves the effective project base from a working directory.
- @details Normalizes the provided cwd into an absolute path without consulting configuration. Time complexity is O(1). No I/O side effects occur.
- @param[in] cwd {string} Current working directory.
- @return {string} Absolute project base path.

### fn `function getProcessCwdSafe(): string` (L193-202)
- @brief Resolves a safe process working directory for extension-load paths.
- @details Returns `process.cwd()` when available and falls back to absolute `PWD`, `HOME`, or `/` when the current shell directory has been deleted. Runtime is O(1). No external state is mutated.
- @return {string} Absolute fallback-safe process working directory.

### fn `function resolveLiveBootstrapCwd(cwd: string): string` (L210-222)
- @brief Resolves the live working directory used for bootstrap-sensitive flows.
- @details Prefers the supplied cwd when it still exists. Otherwise reuses the tracked runtime context path when it remains live, then the tracked runtime base path, and finally a process-safe cwd so deleted worktree paths retained by stale contexts cannot poison later prompt preflight or lifecycle bootstrap. Runtime is O(1) plus bounded filesystem probes. No external state is mutated.
- @param[in] cwd {string} Candidate context cwd.
- @return {string} Existing absolute cwd used for bootstrap work.

### fn `function syncContextCwdMirror(ctx: { cwd?: string }, cwd: string): void` (L231-240)
- @brief Best-effort synchronizes one context `cwd` mirror with bootstrap reality.
- @details Applies the resolved live cwd to the supplied context when writable and ignores stale or read-only mirrors so command bootstrap can continue using authoritative filesystem probes. Runtime is O(1). Side effects are limited to optional `ctx.cwd` mutation.
- @param[in] cwd {string} Resolved live cwd.
- @param[in,out] ctx {{ cwd?: string }} Mutable context-like object.
- @return {void} No return value.

### fn `function loadProjectConfig(cwd: string): UseReqConfig` (L249-252)
- @brief Loads project configuration for the extension runtime.
- @details Resolves the project base, loads persisted config, and normalizes configured directory paths without reading or persisting runtime-derived `base-path` or `git-path` metadata. Runtime is dominated by config I/O. Side effects are limited to filesystem reads.
- @param[in] cwd {string} Current working directory.
- @return {UseReqConfig} Effective project configuration.
- @satisfies REQ-030, REQ-145, REQ-146

### fn `function saveProjectConfig(cwd: string, config: UseReqConfig): void` (L262-265)
- @brief Persists project configuration from the extension runtime.
- @details Resolves the project base, normalizes configured directory paths into project-relative form, and delegates persistence to `saveConfig` without serializing runtime-derived path metadata. Runtime is O(n) in config size. Side effects include config-file writes.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Configuration to persist.
- @return {void} No return value.
- @satisfies REQ-146

### fn `function formatProjectConfigPathForMenu(cwd: string): string` (L274-278)
- @brief Formats the current project config path for top-level menu display.
- @details Resolves `<base-path>/.pi-usereq.json` from the cwd-derived project base, reuses the shared runtime-path formatter, and rewrites a leading POSIX `$HOME` token to `~` for the `Show configuration` row only. Runtime is O(p) in path length. No external state is mutated.
- @param[in] cwd {string} Current working directory.
- @return {string} `~`-relative or absolute config path display value.
- @satisfies REQ-162

### fn `function buildTerminalSettingsMenuChoices(options:` (L287-298)
- @brief Builds the standardized terminal rows appended to every configuration menu.
- @details Returns the canonical value-less `Reset defaults` row so all configuration menus and descendant selector menus share the same terminal ordering contract without rendering `Save and close`. Runtime is O(1). No external state is mutated.
- @param[in] options {{ resetDefaultsDescription: string }} Menu-specific terminal-row metadata.
- @return {PiUsereqSettingsMenuChoice[]} Ordered terminal menu rows.
- @satisfies REQ-193

### iface `interface ResetConfirmationChange` (L304-308)
- @brief Describes one pending reset value change shown in confirmation menus.
- @details Stores the row label plus its previous and next values so reset-confirmation submenus can expose machine-readable and human-verifiable change previews. The interface is compile-time only and introduces no runtime cost.

### fn `function formatResetConfirmationValue(previousValue: string, nextValue: string): string` (L317-319)
- @brief Formats one reset-confirmation value pair for menu display.
- @details Serializes the previous and next values into a deterministic `previous -> next` preview string used by confirmation submenus. Runtime is O(n) in combined value length. No external state is mutated.
- @param[in] previousValue {string} Current persisted value.
- @param[in] nextValue {string} Candidate default value.
- @return {string} Rendered preview string.

### fn `function buildResetConfirmationChoices(` (L329-368)
- @brief Builds the shared settings-menu choices for one reset-confirmation submenu.
- @details Renders each pending changed value as a disabled preview row, appends explicit approve and abort actions, and falls back to one disabled no-op row when no values would change. Runtime is O(n) in changed-value count. No external state is mutated.
- @param[in] changes {ResetConfirmationChange[]} Changed-value preview rows.
- @param[in] approveDescription {string} Description for the approve action.
- @param[in] abortDescription {string} Description for the abort action.
- @return {PiUsereqSettingsMenuChoice[]} Reset-confirmation submenu choices.

### fn `async function confirmResetChanges(` (L380-393)
- @brief Opens one explicit reset-confirmation submenu.
- @details Uses the shared settings-menu renderer to show every changed value before reset application and returns `true` only when the user selects the explicit approval action. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] title {string} Confirmation submenu title.
- @param[in] changes {ResetConfirmationChange[]} Changed-value preview rows.
- @param[in] approveDescription {string} Description for the approve action.
- @param[in] abortDescription {string} Description for the abort action.
- @return {Promise<boolean>} `true` when the reset is explicitly approved.

### fn `function writePersistedProjectConfigToEditor(` (L404-411)
- @brief Writes the already-persisted project configuration file text into the editor.
- @details Reads the current `.pi-usereq.json` file content from disk after the caller has saved any pending configuration changes and forwards that exact persisted text into the editor. Runtime is O(n) in serialized config size. Side effects include filesystem reads and editor-text mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] cwd {string} Current working directory.
- @param[in] _config {UseReqConfig} Unused effective project configuration retained for stable call-site shape.
- @return {void} No return value.
- @satisfies REQ-031

### fn `function buildSearchToolSupportedTagGuidelines(): string[]` (L472-476)
- @brief Builds the supported-tag guidance lines embedded in search-tool registrations.
- @details Emits one deterministic line per supported language containing its canonical registration label and sorted tag list so downstream agents can specialize requests without invoking the tool first. Runtime is O(l * t log t). No side effects occur.
- @return {string[]} Supported-tag guidance lines.

### fn `function buildSearchToolSchemaDescription(scope: FindToolScope): string` (L484-489)
- @brief Builds the schema description for one search-tool registration.
- @details Specializes the explicit-file and configured-directory input contracts while documenting the monolithic markdown output channel and minimal execution details shape. Runtime is O(1). No side effects occur.
- @param[in] scope {FindToolScope} Search-tool scope.
- @return {string} Parameter-schema description.

### fn `function buildSearchToolPromptGuidelines(scope: FindToolScope): string[]` (L497-510)
- @brief Builds the prompt-guideline set for one search-tool registration.
- @details Encodes scope selection, monolithic markdown output semantics, regex semantics, line-number behavior, tag-filter rules, and the full language-to-tag matrix as stable agent-oriented strings. Runtime is O(l * t log t). No side effects occur.
- @param[in] scope {FindToolScope} Search-tool scope.
- @return {string[]} Prompt-guideline strings.

- type `type MonolithicToolRenderResult = {` (L516)
- @brief Describes the monolithic tool-result surface consumed by tool-row renderers.
- @details Narrows execute-result data to the primary text content block plus the minimal `details.execution` metadata returned by monolithic tool wrappers. The alias is compile-time only and introduces no runtime cost.
### fn `function getMonolithicToolText(result: MonolithicToolRenderResult): string` (L533-536)
- @brief Extracts the primary monolithic text block from one tool result.
- @details Returns the first text content block when present and falls back to an empty string when the tool emitted no LLM-facing content. Runtime is O(1). No external state is mutated.
- @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
- @return {string} Primary monolithic content text.

### fn `function getMonolithicToolErrorText(result: MonolithicToolRenderResult): string | undefined` (L544-554)
- @brief Reads the first residual execution error string from one monolithic tool result.
- @details Prefers the first `stderr_lines` entry when present and otherwise falls back to the first line of `stderr`. Runtime is O(1) plus first-line split cost. No external state is mutated.
- @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
- @return {string | undefined} First residual execution error string.

### fn `function formatCompactToolArgumentValue(value: unknown): string | undefined` (L562-601)
- @brief Formats one scalar or structural tool argument for compact render summaries.
- @details Truncates long strings, compresses arrays into short previews, and renders plain object arguments as key indexes so collapsed tool rows stay compact while still exposing the essential invocation shape. Runtime is O(n) in preview size. No external state is mutated.
- @param[in] value {unknown} Candidate tool argument value.
- @return {string | undefined} Compact preview string or `undefined` when the value carries no useful summary.

### fn `function buildCompactToolInvocationText(args: Record<string, unknown> | undefined): string` (L609-620)
- @brief Builds the compact invocation summary appended to collapsed tool rows.
- @details Renders only caller-supplied parameters that have stable, non-empty compact previews and joins them in insertion order so agents can infer how the tool was used without expanding the full result. Runtime is O(n) in argument count and preview size. No external state is mutated.
- @param[in] args {Record<string, unknown> | undefined} Current tool call arguments.
- @return {string} Compact invocation summary prefixed with one separating space, or the empty string when no useful preview exists.

### fn `function summarizeStructuredToolResult(` (L630-645)
- @brief Builds the compact default text for one monolithic tool result row.
- @details Prefers the tool name, compact invocation preview, and success marker for collapsed rows, and falls back to residual execution diagnostics when the tool failed before completing successfully. Runtime is O(n) in compact argument-preview size. No external state is mutated.
- @param[in] toolName {string} Registered tool name.
- @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
- @param[in] args {Record<string, unknown> | undefined} Current tool call arguments.
- @return {string} Compact single-line summary.

### fn `function buildStructuredToolRenderResult(toolName: string)` (L654-673)
- @brief Builds a custom `renderResult` implementation for one monolithic tool.
- @details Reuses a mutable `Text` component when possible, keeps the default collapsed row compact with essential invocation parameters plus result status, and reveals the full monolithic content only when the tool row is expanded. Runtime is O(n) in expanded content length and compact argument-preview size. No external state is mutated.
- @param[in] toolName {string} Registered tool name.
- @return {(result: MonolithicToolRenderResult, options: { expanded?: boolean; isPartial?: boolean }, _theme: unknown, context: { args?: Record<string, unknown>; lastComponent?: unknown }) => Text} Custom result renderer.
- @satisfies REQ-210

### fn `function executeMonolithicTool(operation: () => ToolResult): ReturnType<typeof buildMonolithicToolExecuteResult>` (L681-687)
- @brief Executes one CLI-style runner for a monolithic agent tool.
- @details Reuses the standalone tool-runner contract, normalizes thrown failures into `ToolResult`, and wraps the selected stdout or stderr text into the monolithic content channel. Runtime is dominated by the delegated runner. Side effects depend on the selected tool.
- @param[in] operation {() => ToolResult} Runner callback.
- @return {ReturnType<typeof buildMonolithicToolExecuteResult>} Monolithic tool execute result.

### fn `function deliverPromptCommand(` (L698-716)
- @brief Starts delivery of one rendered prompt into the current active session.
- @details Prefers the replacement-session `sendUserMessage(...)` helper exposed by `withSession(...)` callbacks after session replacement so post-switch prompt delivery never reuses stale pre-switch session-bound extension objects. Returns the underlying delivery promise without awaiting it so callers can record the `running` workflow transition as soon as prompt handoff is accepted instead of waiting for the full agent turn to complete on runtimes whose async replacement-session helpers resolve only after `agent_end`. When pi later invalidates that replacement-session context during successful prompt-end restoration, the helper suppresses the documented stale-extension-context rejection because the prompt was already accepted and late rethrow would surface a false orchestration failure. Falls back to `pi.sendUserMessage(...)` only for non-replacement flows or runtimes that do not expose replacement-session helpers. Runtime is O(n) in prompt length. Side effects are limited to user-message delivery.
- @param[in] pi {ExtensionAPI} Handler-scoped extension API instance retained as the fallback dispatcher.
- @param[in] content {string} Rendered prompt markdown.
- @param[in] context {unknown} Optional replacement-session helper context.
- @return {Promise<void>} Promise representing eventual prompt-delivery completion.
- @satisfies REQ-004, REQ-067, REQ-068, REQ-227, REQ-281

### fn `function shouldIgnoreLatePromptDeliveryFailure(` (L727-743)
- @brief Detects prompt-delivery failures that can be ignored after prompt ownership has moved past the command handler.
- @details Matches the documented stale-extension-context runtime error once prompt ownership has already moved beyond command-side preflight. The helper treats the failure as ignorable when the persisted prompt runtime state shows the same execution session as the active prompt run or when the persisted workflow state has already advanced beyond `checking|running`, because rethrowing at that point would incorrectly re-enter command-side abort logic after the prompt was already accepted. Runtime is O(n) in error-message length plus path length. No external state is mutated.
- @param[in] error {unknown} Candidate prompt-delivery failure.
- @param[in] workflowState {import("./core/extension-status.js").PiUsereqWorkflowState} Current shared prompt workflow state.
- @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Prepared execution plan for the current prompt command.
- @return {boolean} `true` when the failure is a late stale-context delivery rejection that MUST be ignored.
- @satisfies REQ-208, REQ-280, REQ-281, REQ-282

### fn `function logPromptWorkflowStateChange(` (L756-775)
- @brief Appends one workflow-state debug entry for a bundled prompt when selected.
- @details Reuses the shared debug logger so `req-*` command handlers and prompt-end orchestration can record deterministic workflow transitions without duplicating JSON payload shaping. Runtime is O(n) in serialized payload size only when logging is enabled and O(1) otherwise. Side effects include debug-log file writes for matching enabled prompts.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
- @param[in] previousState {string} Prior workflow state.
- @param[in] nextState {import("./core/debug-runtime.js").DebugWorkflowState} Next workflow state.
- @return {void} No return value.
- @satisfies REQ-245, REQ-246, REQ-247

### fn `function logPromptWorkflowEvent(` (L791-811)
- @brief Appends one dedicated prompt workflow debug entry when selected.
- @details Reuses the shared workflow-event logger so prompt activation, restoration, closure, and session-shutdown paths can emit higher-granularity orchestration diagnostics without duplicating JSON payload shaping. Runtime is O(n) in serialized payload size only when logging is enabled and O(1) otherwise. Side effects include debug-log file writes for matching enabled prompts.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
- @param[in] action {string} Workflow debug action identifier.
- @param[in] input {unknown} Optional workflow debug input payload.
- @param[in] result {unknown} Optional workflow debug result payload.
- @param[in] isError {boolean} Workflow debug error flag.
- @return {void} No return value.
- @satisfies REQ-245, REQ-246, REQ-247, REQ-277

### fn `function transitionPromptWorkflowState(` (L824-837)
- @brief Transitions one prompt workflow state and logs the transition immediately after the state update.
- @details Captures the previous workflow state, applies the new state through the shared status helper, and appends the gated `workflow_state` debug entry only after the transition has completed. Runtime is O(1). Side effects include status mutation, status-bar rendering, and optional debug-log writes.
- @param[in] ctx {ExtensionContext | ExtensionCommandContext} Active extension context.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
- @param[in] nextState {DebugWorkflowState} Next workflow state.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `function resolvePromptCommandDescription(` (L845-849)
- @brief Resolves the runtime slash-command description for one bundled prompt.
- @details Reads the bundled prompt front matter, extracts its normalized `description` field, and falls back to the historical generated label when the prompt metadata omits a description. Runtime is O(n) in prompt length. Side effects are limited to filesystem reads.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
- @return {string} Runtime command description.

### fn `function resolveDebugProjectBase(cwd: string, statusController: PiUsereqStatusController): string` (L858-862)
- @brief Resolves the original project base used for debug-log file writes.
- @details Prefers the active or pending prompt execution plan so tool-result logging during worktree-backed prompt runs persists into the original repository path instead of transient worktree directories. Runtime is O(1). No external state is mutated.
- @param[in] cwd {string} Current extension working directory.
- @param[in] statusController {PiUsereqStatusController} Mutable status controller.
- @return {string} Absolute original project base path for debug logging.

### fn `function notifyContextSafely(` (L873-890)
- @brief Delivers one best-effort UI notification without failing on stale replacement contexts.
- @details Attempts to use the supplied extension context for UI notification delivery and suppresses the documented stale-extension-context runtime error raised after session replacement, because prompt-orchestration closure can outlive the context that initiated the switch. Runtime is O(n) in message length. Side effects are limited to user notification delivery when the context is still active.
- @param[in] ctx {ExtensionContext | ExtensionCommandContext | undefined} Candidate UI context.
- @param[in] message {string} Notification message.
- @param[in] level {"info" | "error"} Notification severity.
- @return {boolean} `true` when the notification was delivered and `false` when the context was already stale.
- @satisfies REQ-280

### fn `function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[]` (L899-907)
- @brief Returns the configurable active-tool inventory visible to the extension.
- @details Filters runtime tools against the canonical configurable-tool set, keeps only builtin-backed embedded tools, and orders the result by the documented custom/files/embedded/default-disabled grouping. Runtime is O(t log t). No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {ToolInfo[]} Sorted configurable tool descriptors.
- @satisfies REQ-007, REQ-063, REQ-231, REQ-232

### fn `function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[]` (L915-919)
- @brief Normalizes and returns the configured enabled active tools.
- @details Reuses repository normalization rules, updates the config object in place, and returns the normalized array. Runtime is O(n) in configured tool count. Side effect: mutates `config["enabled-tools"]`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {string[]} Normalized enabled tool names.

### fn `function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void` (L929-946)
- @brief Applies the configured active-tool enablement to the current session.
- @details Preserves non-configurable active tools, removes every configurable tool from the active set, then re-adds only configured tools that exist in the current runtime inventory. Runtime is O(t). Side effects include `pi.setActiveTools(...)`.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {void} No return value.
- @satisfies REQ-009, REQ-064

### fn `async function handleExtensionStatusEvent(` (L959-1219)
- @brief Handles one intercepted pi lifecycle hook for pi-usereq status updates.
- @details Applies session-start-specific resource validation, project-config refresh, startup-tool enablement, and selected debug-tool logging before forwarding the originating hook name and payload into the shared `updateExtensionStatus(...)` pipeline. Before `agent_start`, re-verifies any prepared prompt execution session switch. On `agent_end`, dispatches configured command-notify, sound, and prompt-specific Pushover effects, logs dedicated workflow-closure diagnostics, restores the original session-backed `base-path` for every matched worktree-backed completion by reusing persisted replacement-session command contexts when event contexts omit `switchSession()`, merges and deletes the worktree only for matched successful completions, tolerates stale replacement-session notification contexts after session replacement, retains the worktree plus notifies closure failure for interrupted or failed outcomes, logs selected prompt workflow transitions, and transitions workflow state through `merging`, `error`, and `idle` as required. On `session_shutdown`, captures pre-update prompt snapshots so workflow-shutdown diagnostics and same-runtime command continuation preserve the active prompt workflow state across switch-triggered rebinding, then disposes the shared controller. Runtime is dominated by configuration loading during `session_start` and git finalization during matched successful `agent_end` handling; all other hooks are O(1). Side effects include resource checks, active-tool mutation, active-session replacement, status updates, live-ticker disposal on shutdown, optional child-process spawning, outbound HTTPS requests, branch merges, worktree deletion, and optional debug-log writes.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded by pi.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when hook processing completes.
- @satisfies REQ-117, REQ-118, REQ-119, REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187, REQ-208, REQ-209, REQ-221, REQ-228, REQ-229, REQ-230, REQ-244, REQ-245, REQ-246, REQ-247, REQ-276, REQ-277, REQ-278, REQ-279, REQ-280

### fn `function registerExtensionStatusHooks(` (L1235-1254)
- @brief Registers shared wrappers for every supported pi lifecycle hook.
- @details Installs one generic wrapper per intercepted hook so every resource,
session, agent, model, tool, bash, and input event is routed through the
same extension-status update pipeline. The wrapper suppresses the documented
stale-extension-context error because pi can continue delivering late
lifecycle callbacks against contexts invalidated by session replacement after
prompt orchestration has already completed successfully. Runtime is O(h) in
registered hook count. Side effects include hook registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies DES-002, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117

### fn `function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void` (L1264-1267)
- @brief Replaces the configured active-tool selection and applies it immediately.
- @details Normalizes the requested tool names, stores them in config, and synchronizes the active tool set with runtime registration state. Runtime is O(n + t). Side effect: mutates config and active tools.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] enabledTools {string[]} Requested enabled tool names.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.

### fn `function getDebugToolToggleNames(): PiUsereqStartupToolName[]` (L1275-1277)
- @brief Returns the canonical debug-tool toggle order.
- @details Reuses the documented configurable-tool ordering so debug toggles list extension-owned tools before embedded tools and remain deterministic across sessions. Runtime is O(t log t). No external state is mutated.
- @return {PiUsereqStartupToolName[]} Ordered debug-tool toggle names.
- @satisfies REQ-242

### fn `function resetDebugConfigToDefaults(config: UseReqConfig): void` (L1286-1294)
- @brief Restores the debug configuration subtree to its documented defaults.
- @details Resets global debug enablement, log path, workflow-state filter, dedicated workflow-event logging, and selected tool plus prompt debug toggles without mutating unrelated settings. Runtime is O(1). Side effect: mutates `config`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-236, REQ-237, REQ-238, REQ-239, REQ-195, REQ-277

### fn `function formatDebugMenuSummary(config: UseReqConfig): string` (L1302-1308)
- @brief Formats the top-level Debug summary value.
- @details Emits the current global debug mode plus compact selected-tool and selected-prompt counts for right-aligned menu display. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Compact debug summary string.

### fn `function buildDebugMenuChoice(` (L1318-1331)
- @brief Builds one debug-menu row with optional disabled styling.
- @details Applies dim styling and disables selection whenever global debug is off for all rows except the global `Debug` toggle row. Runtime is O(1). No external state is mutated.
- @param[in] choice {PiUsereqSettingsMenuChoice} Base debug-menu row.
- @param[in] debugEnabled {boolean} Whether global debug is enabled.
- @return {PiUsereqSettingsMenuChoice} Styled debug-menu row.
- @satisfies REQ-241

### fn `async function selectDebugLogOnStatus(` (L1340-1368)
- @brief Opens the workflow-state filter selector used by the Debug submenu.
- @details Exposes `any` plus each canonical workflow state through the shared settings-menu renderer and returns the selected normalized filter or `undefined` when the user cancels the submenu. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentValue {DebugLogOnStatus} Current persisted workflow-state filter.
- @return {Promise<DebugLogOnStatus | undefined>} Selected workflow-state filter or `undefined` when cancelled.

### fn `function buildDebugMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1377-1448)
- @brief Builds the shared settings-menu choices for debug logging configuration.
- @details Serializes global debug controls plus workflow-state, dedicated workflow-event, per-tool, and per-prompt toggles into one submenu, deriving inventories from the canonical tool and prompt lists and dimming locked rows while debug is disabled. Runtime is O(t + p). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered debug-menu choices.
- @satisfies REQ-240, REQ-241, REQ-242, REQ-243, REQ-193, REQ-277

### fn `async function configureDebugMenu(` (L1458-1575)
- @brief Runs the interactive Debug submenu.
- @details Lets the user toggle global debug enablement, edit debug file and workflow filters, toggle dedicated workflow-event logging, mutate per-tool and per-prompt debug selectors, and restore subtree defaults while preserving row focus across re-renders. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the submenu closes.
- @satisfies REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243, REQ-192, REQ-193, REQ-195, REQ-277

- type `type PiNotifyBooleanConfigKey =` (L1581)
- @brief Represents one persisted boolean notification-setting key.
- @details Restricts menu toggles to the global enable flags and completed/interrupted/failed event toggles used by command-notify, sound, and Pushover configuration. Compile-time only and introduces no runtime cost.
- type `type PiNotifyEventBooleanConfigKey = Exclude<` (L1598)
- @brief Represents one persisted boolean notification event-toggle key.
- @details Restricts shared event-submenu mutation helpers to completed/interrupted/failed toggles and excludes global enable flags. Compile-time only and introduces no runtime cost.
- type `type PiNotifyEventId = "completed" | "interrupted" | "failed";` (L1607)
- @brief Represents one shared prompt-end event identifier used by notification menus.
- @details Restricts event-submenu rendering to the canonical completed/interrupted/failed domain shared by command-notify, sound, and Pushover routing. Compile-time only and introduces no runtime cost.
### iface `interface PiNotifyEventRowDefinition` (L1613-1617)
- @brief Describes one shared prompt-end event row rendered inside notification event submenus.
- @details Binds one canonical event identifier to the human-readable label and terminal-outcome description reused across command-notify, sound, and Pushover event menus. The interface is compile-time only and introduces no runtime cost.

### iface `interface PiNotifyEventMenuDefinition` (L1623-1629)
- @brief Describes one notification-system event submenu contract.
- @details Binds the top-level launcher row, submenu title, toast prefix, and completed/interrupted/failed config keys for one notification transport. The interface is compile-time only and introduces no runtime cost.

### fn `function togglePiNotifyFlag(config: UseReqConfig, key: PiNotifyBooleanConfigKey): boolean` (L1638-1641)
- @brief Flips one persisted boolean notification setting.
- @details Negates the selected configuration flag in place and returns the resulting boolean value so callers can emit deterministic UI feedback. Runtime is O(1). Side effect: mutates `config`.
- @param[in] key {PiNotifyBooleanConfigKey} Boolean configuration key to toggle.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {boolean} Next enabled state.

### fn `function resetPiNotifyConfigToDefaults(config: UseReqConfig): void` (L1650-1674)
- @brief Restores notification-related settings to their documented defaults.
- @details Copies the command-notify, sound, and Pushover configuration subtree from a fresh default config into the supplied mutable project config. Runtime is O(1). Side effect: mutates `config`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-174, REQ-178, REQ-184, REQ-195, REQ-196

### fn `function formatPiNotifyPushoverPriority(priority: PiNotifyPushoverPriority): string` (L1683-1685)
- @brief Formats one persisted Pushover priority for menu display.
- @details Maps the canonical `0|1` priority domain to deterministic `Normal|High` labels reused by the Pushover configuration UI. Runtime is O(1). No external state is mutated.
- @param[in] priority {PiNotifyPushoverPriority} Persisted Pushover priority.
- @return {string} Menu-display label.
- @satisfies REQ-172

### fn `function formatPiNotifyEventMenuSummary(` (L1762-1770)
- @brief Formats the top-level summary value for one notification event submenu.
- @details Counts enabled completed/interrupted/failed toggles for the selected transport and renders the result as `n/3 on` for right-aligned menu display. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {string} Compact enabled-toggle summary.
- @satisfies REQ-198

### fn `function buildPiNotifyEventLauncherChoice(` (L1780-1790)
- @brief Builds the top-level launcher row for one notification event submenu.
- @details Reuses the shared completed/interrupted/failed summary renderer so the `Notifications` menu can expose dedicated event editors for command-notify, sound, and Pushover in a uniform shape. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {PiUsereqSettingsMenuChoice} Launcher row for the selected event submenu.
- @satisfies REQ-181, REQ-183, REQ-165, REQ-198

### fn `function buildPiNotifyEventMenuChoices(` (L1800-1815)
- @brief Builds the shared settings-menu choices for one notification event submenu.
- @details Serializes completed/interrupted/failed rows with right-aligned `on|off` values, then appends a value-less `Reset defaults` row for submenu-scoped mutation control. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {PiUsereqSettingsMenuChoice[]} Ordered event-submenu choice vector.
- @satisfies REQ-188, REQ-193, REQ-198

### fn `function resetPiNotifyEventMenuToDefaults(` (L1825-1833)
- @brief Restores one notification event submenu to its documented defaults.
- @details Copies only the completed/interrupted/failed toggles referenced by the supplied submenu contract from a fresh default config into the mutable project config. Runtime is O(1). Side effect: mutates `config`.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-174, REQ-178, REQ-184, REQ-195

### fn `function resolvePiNotifyEventLabel(` (L1843-1850)
- @brief Resolves the human-readable event label for one event-toggle config key.
- @details Matches the supplied config key against the submenu contract and returns the corresponding completed/interrupted/failed menu label for deterministic notification toasts. Runtime is O(1). No external state is mutated.
- @param[in] key {PiNotifyEventBooleanConfigKey} Event-toggle configuration key.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {string} Human-readable event label.
- @satisfies REQ-188, REQ-198

### fn `async function configurePiNotifyEventMenu(` (L1861-1921)
- @brief Runs one dedicated notification event submenu.
- @details Reuses the shared settings-menu renderer to toggle completed/interrupted/failed delivery flags, preserve row focus, and apply submenu-scoped reset semantics for command-notify, sound, or Pushover events. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the submenu closes.
- @satisfies REQ-188, REQ-192, REQ-193, REQ-195, REQ-198

### fn `function buildPiNotifyPushoverRows(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1930-1979)
- @brief Builds the direct Pushover rows rendered inside `Notifications`.
- @details Serializes the global enable flag, shared-event submenu launcher, priority, title, text, and credential rows into right-valued menu items appended after the sound-command rows, dims and disables the enable row until both credentials are populated, and escapes control characters for the single-line `Pushover text` value. Runtime is O(n) in the rendered text-template length. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered direct Pushover rows.
- @satisfies REQ-163, REQ-165, REQ-172, REQ-184, REQ-185, REQ-198, REQ-234, REQ-235

### fn `async function selectPiNotifyPushoverPriority(` (L1989-2017)
- @brief Opens the shared settings-menu selector for Pushover priority.
- @details Reuses the pi-usereq settings-menu renderer so Pushover priority selection remains stylistically aligned with the notification menus and appends a value-less subtree-local `Reset defaults` row. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentPriority {PiNotifyPushoverPriority} Persisted priority value.
- @return {Promise<PiNotifyPushoverPriority | "reset-defaults" | undefined>} Selected priority, reset action, or `undefined` when cancelled.
- @satisfies REQ-172, REQ-192

### fn `function buildPiNotifyMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2026-2083)
- @brief Builds the shared settings-menu choices for notification configuration.
- @details Serializes command-notify, sound, and Pushover blocks with dedicated shared-event submenu launchers so the settings-menu renderer can expose one unified but modular configuration surface, including locked Pushover enablement and escaped single-line rendering for `Pushover text`. Runtime is O(n) in the longest rendered command or text field. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered notification-menu choice vector.
- @satisfies REQ-137, REQ-149, REQ-150, REQ-151, REQ-152, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-183, REQ-188, REQ-193, REQ-198, REQ-234, REQ-235

### fn `async function selectPiNotifySoundLevel(` (L2093-2133)
- @brief Opens the shared settings-menu selector for the active sound level.
- @details Reuses the pi-usereq settings-menu renderer so sound-level selection remains stylistically aligned with the notification menu and appends a value-less subtree-local `Reset defaults` row. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentLevel {PiNotifySoundLevel} Currently selected sound level.
- @return {Promise<PiNotifySoundLevel | "reset-defaults" | undefined>} Selected sound level, reset action, or `undefined` when cancelled.
- @satisfies REQ-131, REQ-179, REQ-192

### fn `async function configurePiNotifyMenu(` (L2143-2409)
- @brief Runs the interactive notification-configuration menu.
- @details Exposes command-notify, sound, and Pushover controls through the shared settings-menu renderer, delegates completed/interrupted/failed toggles to dedicated event submenus, keeps `Enable pushover` locked until both credentials are populated, decodes escaped control-sequence input for `Pushover text`, and preserves row focus across menu re-renders. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<boolean>} `true` when the sound-toggle shortcut changed.
- @satisfies REQ-131, REQ-133, REQ-134, REQ-137, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-183, REQ-184, REQ-188, REQ-192, REQ-193, REQ-195, REQ-196, REQ-198, REQ-234, REQ-235

### fn `function registerPiNotifyShortcut(` (L2424-2444)
- @brief Registers the configurable notification-sound shortcut when supported.
- @details Loads the current project config, registers one raw pi shortcut when
the runtime exposes `registerShortcut(...)`, cycles persisted sound state on
invocation, saves the config, refreshes the status bar, and emits one info
notification. Runtime is O(1) for registration plus config I/O per shortcut
use. Side effects include shortcut registration, config writes, and status
updates.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-131, REQ-134, REQ-180

### fn `function registerPromptCommands(` (L2454-2572)
- @brief Registers bundled prompt commands with the extension.
- @details Creates one `req-<prompt>` command per bundled prompt name. Each handler rejects non-`idle` workflow state, transitions the shared workflow state through `checking`, `error`, and `running`, runs dedicated prompt-command git and required-doc preflight checks, optionally prepares a dedicated worktree execution plan using the active session directory, persists the prompt metadata needed for switch-triggered rebinding, switches the active session to the verified execution cwd before prompt handoff, logs dedicated workflow-activation diagnostics, renders the prompt, starts prompt delivery into the forked active session, records `running` immediately after delivery handoff begins, and then awaits the wrapped prompt-delivery promise whose stale post-restore rejections are suppressed. Runtime is O(p) for registration; handler cost depends on prompt preflight, worktree preparation, session switching, prompt rendering, prompt dispatch, and optional debug logging. Side effects include command registration, status-controller mutation, worktree creation, active-session replacement, optional worktree rollback, user-message delivery during execution, and optional debug-log writes.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-004, REQ-067, REQ-068, REQ-169, REQ-200, REQ-201, REQ-202, REQ-203, REQ-206, REQ-207, REQ-219, REQ-220, REQ-221, REQ-224, REQ-225, REQ-226, REQ-227, REQ-245, REQ-246, REQ-247, REQ-277, REQ-281

### fn `function registerAgentTools(pi: ExtensionAPI): void` (L2582-2881)
- @brief Registers pi-usereq agent tools exposed to the model.
- @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-100, REQ-101, REQ-102

### fn `function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2899-2924)
- @brief Builds the shared settings-menu choices for startup-tool management.
- @details Serializes startup-tool actions into right-valued menu rows consumed by the shared settings-menu renderer while omitting the removed status-reference action. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered startup-tool menu choices.
- @satisfies REQ-007, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193

### fn `function buildPiUsereqToolToggleChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2934-2947)
- @brief Builds the shared settings-menu choices for per-tool startup toggles.
- @details Exposes every configurable startup tool as one row whose right-side value reports the current enabled state, preserves the documented custom/files/embedded/default-disabled ordering, and appends a value-less subtree-local `Reset defaults` row. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered per-tool toggle choices.
- @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154, REQ-231, REQ-232

### fn `async function configurePiUsereqToolsMenu(` (L2958-3053)
- @brief Runs the interactive active-tool configuration menu.
- @details Synchronizes runtime active tools with persisted config, renders startup-tool actions through the shared settings-menu UI, preserves the documented per-tool ordering, and updates configuration state in response to selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-007, REQ-063, REQ-064, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193, REQ-231, REQ-232

### fn `function getStaticCheckLanguageConfigForMenu(` (L3062-3067)
- @brief Resolves one static-check language config for menu rendering.
- @details Returns the configured per-language static-check object when present and otherwise synthesizes a disabled empty-language object so menu code can render all supported languages deterministically. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] language {string} Canonical language name.
- @return {StaticCheckLanguageConfig} Resolved per-language config object.

### fn `function countConfiguredStaticCheckLanguages(config: UseReqConfig): number` (L3075-3077)
- @brief Counts languages that currently expose at least one configured checker.
- @details Treats configured-but-disabled languages as configured when their checker list is non-empty so removal actions remain deterministic. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {number} Number of languages with at least one configured checker.

### fn `function countEnabledStaticCheckLanguages(config: UseReqConfig): number` (L3085-3087)
- @brief Counts languages whose static-check enable flag is on.
- @details Counts only languages whose persisted per-language config explicitly sets `enabled=enable`, regardless of checker count. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {number} Number of enabled languages.

### fn `function resetStaticCheckConfig(config: UseReqConfig): void` (L3096-3098)
- @brief Restores the documented static-check default configuration.
- @details Replaces the mutable config subtree with a fresh clone of the documented per-language defaults so menu reset actions restore both enable flags and checker lists in one step. Runtime is O(l + c). Side effect: mutates `config`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-250, REQ-251, REQ-252

### fn `function formatStaticCheckLanguagesSummary(config: UseReqConfig): string` (L3106-3108)
- @brief Summarizes enabled and configured static-check languages.
- @details Counts enabled languages and languages with at least one checker, then emits one compact summary string suitable for the top-level configuration menu. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Compact summary string.

### fn `function buildStaticCheckMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L3117-3148)
- @brief Builds the shared settings-menu choices for static-check management.
- @details Serializes guided Command-oriented add and remove actions, renders one direct on/off toggle row for every supported language, and appends canonical terminal rows while omitting raw-spec and reference-only actions. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered static-check menu choices.
- @satisfies REQ-008, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-160, REQ-161, REQ-193, REQ-248

### fn `function buildSupportedStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L3156-3173)
- @brief Builds the shared settings-menu choices for supported static-check languages.
- @details Exposes every supported language as one row whose right-side value reports extensions, enablement, and configured checker count for guided Command configuration flows, then appends subtree-local terminal rows. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered language-choice vector.

### fn `function buildConfiguredStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L3181-3198)
- @brief Builds the shared settings-menu choices for configured static-check languages.
- @details Exposes only languages whose checker lists are non-empty so removal remains deterministic, then appends subtree-local terminal rows. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered configured-language vector.

### fn `async function configureStaticCheckMenu(` (L3208-3341)
- @brief Runs the interactive static-check configuration menu.
- @details Lets the user add Command entries by guided prompts, remove configured language entries, toggle direct per-language enable flags, and reset the subtree to documented defaults through the shared settings-menu renderer until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-008, REQ-151, REQ-152, REQ-153, REQ-154, REQ-160, REQ-161, REQ-193, REQ-195, REQ-248, REQ-253

### fn `function buildPiUsereqMenuChoices(` (L3351-3440)
- @brief Builds the shared settings-menu choices for the top-level pi-usereq configuration UI.
- @details Serializes primary configuration actions into right-valued menu rows consumed by the shared settings-menu renderer, including automatic git-commit mode, effective prompt-command worktree state, notification summary, debug summary, locked worktree rows when automatic git commit is disabled, and the display-only config path beside `show-config`. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered top-level menu choices.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-162, REQ-190, REQ-191, REQ-197, REQ-204, REQ-205, REQ-212, REQ-215, REQ-216, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240

### fn `function buildSrcDirMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L3449-3467)
- @brief Builds the shared settings-menu choices for source-directory management.
- @details Exposes add and remove actions for `src-dir` entries through right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered source-directory management choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193

### fn `function buildSrcDirRemovalChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L3476-3488)
- @brief Builds the shared settings-menu choices for removing one source-directory entry.
- @details Exposes every configured `src-dir` entry as one removable row and appends a value-less subtree-local `Reset defaults` row. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered removable source-directory choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154

### fn `async function configurePiUsereq(` (L3499-3719)
- @brief Runs the top-level pi-usereq configuration menu.
- @details Loads project config, exposes docs/test/source/automatic-commit/worktree/static-check/startup-tool/notification/debug actions through the shared settings-menu renderer, forces worktree disablement when automatic git commit is disabled, prevents locked row edits, persists changes on exit, closes immediately after `Show configuration`, and refreshes the single-line status bar. Runtime depends on user interaction count. Side effects include UI updates, config writes, active-tool changes, and editor text updates.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-162, REQ-190, REQ-191, REQ-192, REQ-194, REQ-195, REQ-204, REQ-205, REQ-212, REQ-215, REQ-216, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243

### fn `const persistConfigChange = () =>` (L3510-3515)

### fn `function registerConfigCommands(` (L3729-3739)
- @brief Registers configuration-management commands.
- @details Adds the interactive `pi-usereq` configuration command only; the config-viewer action is now exposed exclusively inside that menu. Runtime is O(1) for registration. Side effects include command registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-006, REQ-031

### fn `export default function piUsereqExtension(pi: ExtensionAPI): void` (L3757-3765)
- @brief Registers the complete pi-usereq extension.
- @details Validates installation-owned bundled resources, registers prompt and
configuration commands plus agent tools, registers the configurable
notification-sound shortcut when the runtime supports shortcuts, and
installs shared wrappers for all supported pi lifecycle hooks so status
telemetry, context usage, prompt timing, cumulative runtime, prompt-specific
Pushover metadata, tool-result debug logging, and prompt-orchestration debug
effects remain synchronized with runtime events. Runtime is O(h) in hook
count during registration. Side effects include filesystem reads,
command/tool/shortcut registration, UI updates, active-tool changes,
optional debug-log writes, and timer scheduling.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-067, REQ-068, REQ-109, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118, REQ-119, REQ-120, REQ-121, REQ-122, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-131, REQ-132, REQ-133, REQ-134, REQ-137, REQ-159, REQ-163, REQ-164, REQ-165, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-174, REQ-179, REQ-180, REQ-184, REQ-188, REQ-190, REQ-191, REQ-192, REQ-193, REQ-194, REQ-195, REQ-196, REQ-197, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243, REQ-244, REQ-245, REQ-246, REQ-247

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiShortcutRegistrar`|iface||161-169|interface PiShortcutRegistrar|
|`getProjectBase`|fn||177-186|function getProjectBase(cwd: string): string|
|`getProcessCwdSafe`|fn||193-202|function getProcessCwdSafe(): string|
|`resolveLiveBootstrapCwd`|fn||210-222|function resolveLiveBootstrapCwd(cwd: string): string|
|`syncContextCwdMirror`|fn||231-240|function syncContextCwdMirror(ctx: { cwd?: string }, cwd:...|
|`loadProjectConfig`|fn||249-252|function loadProjectConfig(cwd: string): UseReqConfig|
|`saveProjectConfig`|fn||262-265|function saveProjectConfig(cwd: string, config: UseReqCon...|
|`formatProjectConfigPathForMenu`|fn||274-278|function formatProjectConfigPathForMenu(cwd: string): string|
|`buildTerminalSettingsMenuChoices`|fn||287-298|function buildTerminalSettingsMenuChoices(options:|
|`ResetConfirmationChange`|iface||304-308|interface ResetConfirmationChange|
|`formatResetConfirmationValue`|fn||317-319|function formatResetConfirmationValue(previousValue: stri...|
|`buildResetConfirmationChoices`|fn||329-368|function buildResetConfirmationChoices(|
|`confirmResetChanges`|fn||380-393|async function confirmResetChanges(|
|`writePersistedProjectConfigToEditor`|fn||404-411|function writePersistedProjectConfigToEditor(|
|`buildSearchToolSupportedTagGuidelines`|fn||472-476|function buildSearchToolSupportedTagGuidelines(): string[]|
|`buildSearchToolSchemaDescription`|fn||484-489|function buildSearchToolSchemaDescription(scope: FindTool...|
|`buildSearchToolPromptGuidelines`|fn||497-510|function buildSearchToolPromptGuidelines(scope: FindToolS...|
|`MonolithicToolRenderResult`|type||516||
|`getMonolithicToolText`|fn||533-536|function getMonolithicToolText(result: MonolithicToolRend...|
|`getMonolithicToolErrorText`|fn||544-554|function getMonolithicToolErrorText(result: MonolithicToo...|
|`formatCompactToolArgumentValue`|fn||562-601|function formatCompactToolArgumentValue(value: unknown): ...|
|`buildCompactToolInvocationText`|fn||609-620|function buildCompactToolInvocationText(args: Record<stri...|
|`summarizeStructuredToolResult`|fn||630-645|function summarizeStructuredToolResult(|
|`buildStructuredToolRenderResult`|fn||654-673|function buildStructuredToolRenderResult(toolName: string)|
|`executeMonolithicTool`|fn||681-687|function executeMonolithicTool(operation: () => ToolResul...|
|`deliverPromptCommand`|fn||698-716|function deliverPromptCommand(|
|`shouldIgnoreLatePromptDeliveryFailure`|fn||727-743|function shouldIgnoreLatePromptDeliveryFailure(|
|`logPromptWorkflowStateChange`|fn||756-775|function logPromptWorkflowStateChange(|
|`logPromptWorkflowEvent`|fn||791-811|function logPromptWorkflowEvent(|
|`transitionPromptWorkflowState`|fn||824-837|function transitionPromptWorkflowState(|
|`resolvePromptCommandDescription`|fn||845-849|function resolvePromptCommandDescription(|
|`resolveDebugProjectBase`|fn||858-862|function resolveDebugProjectBase(cwd: string, statusContr...|
|`notifyContextSafely`|fn||873-890|function notifyContextSafely(|
|`getPiUsereqStartupTools`|fn||899-907|function getPiUsereqStartupTools(pi: ExtensionAPI): ToolI...|
|`getConfiguredEnabledPiUsereqTools`|fn||915-919|function getConfiguredEnabledPiUsereqTools(config: UseReq...|
|`applyConfiguredPiUsereqTools`|fn||929-946|function applyConfiguredPiUsereqTools(pi: ExtensionAPI, c...|
|`handleExtensionStatusEvent`|fn||959-1219|async function handleExtensionStatusEvent(|
|`registerExtensionStatusHooks`|fn||1235-1254|function registerExtensionStatusHooks(|
|`setConfiguredPiUsereqTools`|fn||1264-1267|function setConfiguredPiUsereqTools(pi: ExtensionAPI, con...|
|`getDebugToolToggleNames`|fn||1275-1277|function getDebugToolToggleNames(): PiUsereqStartupToolNa...|
|`resetDebugConfigToDefaults`|fn||1286-1294|function resetDebugConfigToDefaults(config: UseReqConfig)...|
|`formatDebugMenuSummary`|fn||1302-1308|function formatDebugMenuSummary(config: UseReqConfig): st...|
|`buildDebugMenuChoice`|fn||1318-1331|function buildDebugMenuChoice(|
|`selectDebugLogOnStatus`|fn||1340-1368|async function selectDebugLogOnStatus(|
|`buildDebugMenuChoices`|fn||1377-1448|function buildDebugMenuChoices(config: UseReqConfig): PiU...|
|`configureDebugMenu`|fn||1458-1575|async function configureDebugMenu(|
|`PiNotifyBooleanConfigKey`|type||1581||
|`PiNotifyEventBooleanConfigKey`|type||1598||
|`PiNotifyEventId`|type||1607||
|`PiNotifyEventRowDefinition`|iface||1613-1617|interface PiNotifyEventRowDefinition|
|`PiNotifyEventMenuDefinition`|iface||1623-1629|interface PiNotifyEventMenuDefinition|
|`togglePiNotifyFlag`|fn||1638-1641|function togglePiNotifyFlag(config: UseReqConfig, key: Pi...|
|`resetPiNotifyConfigToDefaults`|fn||1650-1674|function resetPiNotifyConfigToDefaults(config: UseReqConf...|
|`formatPiNotifyPushoverPriority`|fn||1683-1685|function formatPiNotifyPushoverPriority(priority: PiNotif...|
|`formatPiNotifyEventMenuSummary`|fn||1762-1770|function formatPiNotifyEventMenuSummary(|
|`buildPiNotifyEventLauncherChoice`|fn||1780-1790|function buildPiNotifyEventLauncherChoice(|
|`buildPiNotifyEventMenuChoices`|fn||1800-1815|function buildPiNotifyEventMenuChoices(|
|`resetPiNotifyEventMenuToDefaults`|fn||1825-1833|function resetPiNotifyEventMenuToDefaults(|
|`resolvePiNotifyEventLabel`|fn||1843-1850|function resolvePiNotifyEventLabel(|
|`configurePiNotifyEventMenu`|fn||1861-1921|async function configurePiNotifyEventMenu(|
|`buildPiNotifyPushoverRows`|fn||1930-1979|function buildPiNotifyPushoverRows(config: UseReqConfig):...|
|`selectPiNotifyPushoverPriority`|fn||1989-2017|async function selectPiNotifyPushoverPriority(|
|`buildPiNotifyMenuChoices`|fn||2026-2083|function buildPiNotifyMenuChoices(config: UseReqConfig): ...|
|`selectPiNotifySoundLevel`|fn||2093-2133|async function selectPiNotifySoundLevel(|
|`configurePiNotifyMenu`|fn||2143-2409|async function configurePiNotifyMenu(|
|`registerPiNotifyShortcut`|fn||2424-2444|function registerPiNotifyShortcut(|
|`registerPromptCommands`|fn||2454-2572|function registerPromptCommands(|
|`registerAgentTools`|fn||2582-2881|function registerAgentTools(pi: ExtensionAPI): void|
|`buildPiUsereqToolsMenuChoices`|fn||2899-2924|function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, ...|
|`buildPiUsereqToolToggleChoices`|fn||2934-2947|function buildPiUsereqToolToggleChoices(pi: ExtensionAPI,...|
|`configurePiUsereqToolsMenu`|fn||2958-3053|async function configurePiUsereqToolsMenu(|
|`getStaticCheckLanguageConfigForMenu`|fn||3062-3067|function getStaticCheckLanguageConfigForMenu(|
|`countConfiguredStaticCheckLanguages`|fn||3075-3077|function countConfiguredStaticCheckLanguages(config: UseR...|
|`countEnabledStaticCheckLanguages`|fn||3085-3087|function countEnabledStaticCheckLanguages(config: UseReqC...|
|`resetStaticCheckConfig`|fn||3096-3098|function resetStaticCheckConfig(config: UseReqConfig): void|
|`formatStaticCheckLanguagesSummary`|fn||3106-3108|function formatStaticCheckLanguagesSummary(config: UseReq...|
|`buildStaticCheckMenuChoices`|fn||3117-3148|function buildStaticCheckMenuChoices(config: UseReqConfig...|
|`buildSupportedStaticCheckLanguageChoices`|fn||3156-3173|function buildSupportedStaticCheckLanguageChoices(config:...|
|`buildConfiguredStaticCheckLanguageChoices`|fn||3181-3198|function buildConfiguredStaticCheckLanguageChoices(config...|
|`configureStaticCheckMenu`|fn||3208-3341|async function configureStaticCheckMenu(|
|`buildPiUsereqMenuChoices`|fn||3351-3440|function buildPiUsereqMenuChoices(|
|`buildSrcDirMenuChoices`|fn||3449-3467|function buildSrcDirMenuChoices(config: UseReqConfig): Pi...|
|`buildSrcDirRemovalChoices`|fn||3476-3488|function buildSrcDirRemovalChoices(config: UseReqConfig):...|
|`configurePiUsereq`|fn||3499-3719|async function configurePiUsereq(|
|`persistConfigChange`|fn||3510-3515|const persistConfigChange = () =>|
|`registerConfigCommands`|fn||3729-3739|function registerConfigCommands(|
|`piUsereqExtension`|fn||3757-3765|export default function piUsereqExtension(pi: ExtensionAP...|

