# cli.ts | TypeScript | 349L | 9 symbols | 5 imports | 9 comments
> Path: `src/cli.ts`
- @brief Implements the standalone pi-usereq command-line entry point.
- @details Parses CLI flags, resolves project configuration, dispatches tool-runner operations, and converts thrown `ReqError` instances into process-style stdout, stderr, and exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and any filesystem or git operations performed by delegated commands.

## Imports
```
import process from "node:process";
import { ReqError } from "./core/errors.js";
import { loadConfig, normalizeConfigPaths, saveConfig, type UseReqConfig } from "./core/config.js";
import {
import {
```

## Definitions

### iface `interface ParsedArgs` (L43-67)
- @brief Represents the parsed CLI flag state for one invocation.
- @details The interface captures every supported command and option in a normalized shape consumed by `main`. It is compile-time only and introduces no runtime cost.

### fn `function parseArgs(argv: string[]): ParsedArgs` (L75-199)
- @brief Parses raw CLI tokens into a normalized argument object.
- @details Performs a single left-to-right scan, supports options with variable-length value tails, and records only the last occurrence of scalar flags. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding the executable and script path.
- @return {ParsedArgs} Parsed flag object.

### fn `const takeUntilOption = (start: number): [string[], number] =>` (L77-85)

### fn `function writeStdout(text: string): void` (L207-209)
- @brief Writes text to stdout when non-empty.
- @details Avoids emitting zero-length writes so callers can compose result output safely. Runtime is O(n) in text length. Side effect: writes to `process.stdout`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L217-220)
- @brief Writes text to stderr and ensures a trailing newline.
- @details Skips empty input, appends a newline when necessary, and emits the final text to `process.stderr`. Runtime is O(n) in text length. Side effect: writes to `process.stderr`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeResult(result: { stdout: string; stderr: string; code: number }): number` (L228-232)
- @brief Emits a tool result object to process streams.
- @details Writes stdout first, then stderr, and returns the embedded exit code without modification. Runtime is O(n) in total emitted text size. Side effects are stdout/stderr writes.
- @param[in] result {{ stdout: string; stderr: string; code: number }} Command result payload.
- @return {number} Exit code to propagate from the invoked command.

### fn `function loadMutableProjectConfig(projectBase: string): { base: string; config: UseReqConfig }` (L241-245)
- @brief Loads mutable project config state without persisting runtime path metadata.
- @details Resolves the project base, loads existing config or defaults, normalizes persisted directory fields into project-relative form, and returns the in-memory pair used by CLI mutations. Runtime is dominated by config I/O. Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root path.
- @return {{ base: string; config: UseReqConfig }} Validated project base and normalized in-memory config.
- @satisfies REQ-035, REQ-146

### fn `function applyEnableStaticCheckSpecs(projectBase: string, specs: string[]): UseReqConfig` (L256-278)
- @brief Applies repeatable `--enable-static-check` specifications to project config.
- @details Parses each specification, validates command-backed entries before persistence, appends only non-duplicate identities in argument order, preserves existing entries, and writes the merged config once after all validations succeed. Runtime is O(s + e) plus PATH probing where s is spec count and e is existing entry count. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root path.
- @param[in] specs {string[]} Raw `--enable-static-check` specifications in CLI order.
- @return {UseReqConfig} Persisted merged project configuration.
- @throws {ReqError} Throws when parsing or validation fails.
- @satisfies REQ-035, REQ-036, REQ-037

### fn `export function main(argv = process.argv.slice(2)): number` (L287-345)
- @brief Executes one pi-usereq CLI invocation.
- @details Parses arguments, enforces mutually exclusive project-selection rules, normalizes persisted config when needed, dispatches the first matching command handler, and converts thrown `ReqError` instances into stream output plus numeric exit codes. Runtime is O(n) in argument count plus delegated command cost. Side effects include config normalization writes and stdout/stderr output.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {number} Process exit code for the invocation.
- @throws {ReqError} Internally catches `ReqError` and returns its code; other errors are coerced into exit code `1` with stderr output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ParsedArgs`|iface||43-67|interface ParsedArgs|
|`parseArgs`|fn||75-199|function parseArgs(argv: string[]): ParsedArgs|
|`takeUntilOption`|fn||77-85|const takeUntilOption = (start: number): [string[], numbe...|
|`writeStdout`|fn||207-209|function writeStdout(text: string): void|
|`writeStderr`|fn||217-220|function writeStderr(text: string): void|
|`writeResult`|fn||228-232|function writeResult(result: { stdout: string; stderr: st...|
|`loadMutableProjectConfig`|fn||241-245|function loadMutableProjectConfig(projectBase: string): {...|
|`applyEnableStaticCheckSpecs`|fn||256-278|function applyEnableStaticCheckSpecs(projectBase: string,...|
|`main`|fn||287-345|export function main(argv = process.argv.slice(2)): number|


---

# agent-tool-json.ts | TypeScript | 470L | 23 symbols | 6 imports | 24 comments
> Path: `src/core/agent-tool-json.ts`
- @brief Builds structured agent-tool JSON payloads for path, git, docs, worktree, and static-check tools.
- @details Converts extension-tool execution state into deterministic JSON-first payloads optimized for direct LLM traversal. The module normalizes execution metadata, path facts, required-doc status, worktree mutation facts, and static-check file-selection facts without depending on presentation-oriented text. Runtime is O(F) in the number of described files plus path normalization cost. Side effects are limited to filesystem reads.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import type { StaticCheckEntry } from "./config.js";
import { ReqError } from "./errors.js";
import { STATIC_CHECK_EXT_TO_LANG } from "./static-check.js";
import type { ToolResult } from "./tool-runner.js";
```

## Definitions

### iface `export interface ToolExecutionSection` (L18-22)
- @brief Describes normalized execution metadata shared by structured tool payloads.
- @details Stores only the exit code and residual stdout or stderr line arrays needed after response payload construction, omitting duplicate text and count fields to reduce token cost. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StructuredToolExecuteResult<T>` (L28-31)
- @brief Describes the standard execute return wrapper used by structured agent tools.
- @details Mirrors the same JSON payload into both the text content channel and the machine-readable details channel so agents can consume stable fields without reparsing ad-hoc prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PathQueryToolPayload` (L37-43)
- @brief Describes the structured payload returned by path-query tools.
- @details Exposes only the resolved path facts that can differ at runtime plus residual execution diagnostics, omitting caller-known request echoes and duplicated runtime-path inventories. The interface is compile-time only and introduces no runtime cost.

### iface `export interface GitCheckToolPayload` (L49-56)
- @brief Describes the structured payload returned by `git-check`.
- @details Exposes only the runtime git-path presence fact plus aggregate repository validation status, omitting intermediate request metadata whose semantics already live in the tool registration. The interface is compile-time only and introduces no runtime cost.

### iface `export interface DocsCheckFileRecord` (L62-67)
- @brief Describes one canonical-doc status record returned by `docs-check`.
- @details Stores the canonical path, remediation prompt command, and presence status while omitting redundant filesystem probe fields already summarized by the status value. The interface is compile-time only and introduces no runtime cost.

### iface `export interface DocsCheckToolPayload` (L73-80)
- @brief Describes the structured payload returned by `docs-check`.
- @details Exposes per-document presence facts and remediation commands plus residual execution diagnostics, omitting static request metadata that can be inferred from the tool registration and caller context. The interface is compile-time only and introduces no runtime cost.

### iface `export interface WorktreeNameToolPayload` (L86-92)
- @brief Describes the structured payload returned by `git-wt-name`.
- @details Exposes only the generated worktree name plus residual execution diagnostics, omitting the static normative format string because it already belongs in registration metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface WorktreeMutationToolPayload` (L98-105)
- @brief Describes the structured payload returned by worktree mutation tools.
- @details Exposes only the exact worktree name and derived path that can vary per invocation plus residual execution diagnostics, omitting static operation descriptors and duplicated branch-name fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StaticCheckFileRecord` (L111-117)
- @brief Describes one file-selection record inside a static-check payload.
- @details Exposes canonical path, detected language, configured checker modules, and stable selection status without echoing caller inputs or redundant filesystem probe fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StaticCheckToolPayload` (L123-133)
- @brief Describes the structured payload returned by static-check agent tools.
- @details Exposes aggregate checker coverage, per-file selection facts, and normalized execution diagnostics while omitting request echoes whose semantics are already available in the tool registration and input parameters. The interface is compile-time only and introduces no runtime cost.

### fn `function formatJsonToolPayload(payload: unknown): string` (L141-143)
- @brief Serializes one structured payload as pretty-printed JSON.
- @details Uses two-space indentation and omits a trailing newline so the mirrored text payload remains deterministic and compact. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] payload {unknown} Structured JSON-compatible payload.
- @return {string} Pretty-printed JSON text.

### fn `function splitToolOutputLines(text: string): string[]` (L151-154)
- @brief Splits one stdout or stderr text block into normalized non-empty lines.
- @details Trims trailing newlines, preserves internal line order, and omits empty records so downstream agents can branch on stable arrays without reparsing blank output. Runtime is O(n) in text length. No external state is mutated.
- @param[in] text {string} Raw output text.
- @return {string[]} Normalized non-empty output lines.

### fn `function canonicalizeToolPath(baseDir: string, candidatePath: string): string` (L163-170)
- @brief Normalizes one path into a canonical slash-separated form relative to the project base when possible.
- @details Resolves the candidate against the provided base, emits a relative path for in-project targets, and falls back to an absolute slash-normalized path for external targets. Runtime is O(p) in path length. No external state is mutated.
- @param[in] baseDir {string} Absolute project base path.
- @param[in] candidatePath {string} Relative or absolute path candidate.
- @return {string} Canonical slash-normalized path.

- fn `export function buildStructuredToolExecuteResult<T extends { execution: ToolExecutionSection }>(` (L178)
- @brief Converts one structured tool payload into the standard execute wrapper.
- @details Mirrors the same payload into `content[0].text` and `details` so agents can use direct JSON fields or raw JSON text interchangeably without divergence. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] payload {T} Structured payload containing an `execution` section.
- @return {StructuredToolExecuteResult<T>} Standard execute wrapper with mirrored payload.
### fn `export function buildToolExecutionSection(result: ToolResult): ToolExecutionSection` (L193-203)
- @brief Converts one raw `ToolResult` into a normalized execution section.
- @details Preserves only the exit code plus non-empty stdout or stderr line arrays so downstream payloads carry residual diagnostics without duplicating the primary structured response body. Runtime is O(n) in output size. No external state is mutated.
- @param[in] result {ToolResult} Raw tool result.
- @return {ToolExecutionSection} Normalized residual execution metadata.

### fn `export function normalizeToolFailure(error: unknown): ToolResult` (L212-221)
- @brief Converts one `ReqError` into a synthetic `ToolResult` for structured payload emission.
- @details Preserves the numeric exit code and message in stderr so agent tools can return deterministic JSON even when the underlying runner fails. Non-`ReqError` values are rethrown. Runtime is O(1). No external state is mutated.
- @param[in] error {unknown} Thrown value captured from a runner.
- @return {ToolResult} Synthetic tool result with empty stdout.
- @throws {unknown} Rethrows non-`ReqError` failures unchanged.

### fn `export function buildPathQueryToolPayload(` (L233-250)
- @brief Builds the structured payload returned by `git-path` or `get-base-path`.
- @details Exposes only the resolved runtime path value plus residual execution metadata, omitting request echoes and duplicated runtime-path inventories from the runtime payload. Runtime is O(p) in path length. No external state is mutated.
- @param[in] toolName {"git-path" | "get-base-path"} Target tool name.
- @param[in] workingDirectoryPath {string} Caller working directory.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] resolvedPath {string} Resolved config path value.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {PathQueryToolPayload} Structured path-query payload.

### fn `export function buildGitCheckToolPayload(` (L260-275)
- @brief Builds the structured payload returned by `git-check`.
- @details Encodes runtime git-path presence plus aggregate clean-versus-error status while preserving raw diagnostics under execution. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] configuredGitPath {string | undefined} Runtime git root path.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {GitCheckToolPayload} Structured git-check payload.

### fn `export function buildDocsCheckToolPayload(` (L284-321)
- @brief Builds the structured payload returned by `docs-check`.
- @details Enumerates required canonical documents, binds each missing file to its remediation prompt command, and emits summary counts plus residual execution diagnostics while omitting static request metadata. Runtime is O(k) in required file count plus filesystem reads. Side effects are limited to filesystem reads.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] docsDirPath {string} Configured docs directory relative to the project base.
- @return {DocsCheckToolPayload} Structured docs-check payload.

### fn `export function buildWorktreeNameToolPayload(` (L331-346)
- @brief Builds the structured payload returned by `git-wt-name`.
- @details Preserves only the generated worktree name and error diagnostics, leaving the static naming format in registration metadata instead of the runtime payload. Runtime is O(n) in output size. No external state is mutated.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] configuredGitPath {string | undefined} Runtime git root path.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {WorktreeNameToolPayload} Structured worktree-name payload.

### fn `export function buildWorktreeMutationToolPayload(` (L358-379)
- @brief Builds the structured payload returned by `git-wt-create` or `git-wt-delete`.
- @details Exposes only the exact worktree name, derived worktree path, and error diagnostics, omitting static operation and branch-name echoes from the runtime payload. Runtime is O(p) in path length. No external state is mutated.
- @param[in] toolName {"git-wt-create" | "git-wt-delete"} Target tool name.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] configuredGitPath {string | undefined} Runtime git root path.
- @param[in] worktreeName {string} Exact requested worktree name.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {WorktreeMutationToolPayload} Structured worktree mutation payload.

### fn `function buildStaticCheckFileRecord(` (L390-424)
- @brief Builds one static-check file-selection record.
- @details Resolves filesystem status, detects the configured language by file extension, and emits the configured checker modules plus a stable selection status without echoing caller inputs or redundant filesystem facts. Runtime is O(p + c) in path length plus configured checker count. Side effects are limited to filesystem reads.
- @param[in] inputPath {string} Caller-supplied file path.
- @param[in] requestIndex {number} Zero-based request position.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] staticCheckConfig {Record<string, StaticCheckEntry[]>} Effective static-check configuration.
- @return {StaticCheckFileRecord} Structured file-selection record.

### fn `export function buildStaticCheckToolPayload(` (L439-470)
- @brief Builds the structured payload returned by `files-static-check` or `static-check`.
- @details Exposes configured checker coverage, per-file selection facts, and normalized execution diagnostics while omitting request echoes whose semantics already live in registration metadata. Runtime is O(F + C). Side effects are limited to filesystem reads.
- @param[in] toolName {"files-static-check" | "static-check"} Target tool name.
- @param[in] scope {"explicit-files" | "configured-source-and-test-directories"} Selection scope label.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] requestedPaths {string[]} Explicit or discovered file paths.
- @param[in] selectionDirectoryPaths {string[]} Directories that produced the selection.
- @param[in] excludedDirectoryPaths {string[]} Directory roots excluded from project selection.
- @param[in] staticCheckConfig {Record<string, StaticCheckEntry[]>} Effective static-check configuration.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {StaticCheckToolPayload} Structured static-check payload.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolExecutionSection`|iface||18-22|export interface ToolExecutionSection|
|`StructuredToolExecuteResult`|iface||28-31|export interface StructuredToolExecuteResult<T>|
|`PathQueryToolPayload`|iface||37-43|export interface PathQueryToolPayload|
|`GitCheckToolPayload`|iface||49-56|export interface GitCheckToolPayload|
|`DocsCheckFileRecord`|iface||62-67|export interface DocsCheckFileRecord|
|`DocsCheckToolPayload`|iface||73-80|export interface DocsCheckToolPayload|
|`WorktreeNameToolPayload`|iface||86-92|export interface WorktreeNameToolPayload|
|`WorktreeMutationToolPayload`|iface||98-105|export interface WorktreeMutationToolPayload|
|`StaticCheckFileRecord`|iface||111-117|export interface StaticCheckFileRecord|
|`StaticCheckToolPayload`|iface||123-133|export interface StaticCheckToolPayload|
|`formatJsonToolPayload`|fn||141-143|function formatJsonToolPayload(payload: unknown): string|
|`splitToolOutputLines`|fn||151-154|function splitToolOutputLines(text: string): string[]|
|`canonicalizeToolPath`|fn||163-170|function canonicalizeToolPath(baseDir: string, candidateP...|
|`buildStructuredToolExecuteResult`|fn||178|export function buildStructuredToolExecuteResult<T extend...|
|`buildToolExecutionSection`|fn||193-203|export function buildToolExecutionSection(result: ToolRes...|
|`normalizeToolFailure`|fn||212-221|export function normalizeToolFailure(error: unknown): Too...|
|`buildPathQueryToolPayload`|fn||233-250|export function buildPathQueryToolPayload(|
|`buildGitCheckToolPayload`|fn||260-275|export function buildGitCheckToolPayload(|
|`buildDocsCheckToolPayload`|fn||284-321|export function buildDocsCheckToolPayload(|
|`buildWorktreeNameToolPayload`|fn||331-346|export function buildWorktreeNameToolPayload(|
|`buildWorktreeMutationToolPayload`|fn||358-379|export function buildWorktreeMutationToolPayload(|
|`buildStaticCheckFileRecord`|fn||390-424|function buildStaticCheckFileRecord(|
|`buildStaticCheckToolPayload`|fn||439-470|export function buildStaticCheckToolPayload(|


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

# compress-payload.ts | TypeScript | 640L | 22 symbols | 5 imports | 23 comments
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

### iface `export interface CompressToolFileEntry extends CompressLineRange` : CompressLineRange (L93-120)
- @brief Describes one per-file compression payload entry.
- @details Stores path identity, compression metrics, rendered line-number mode, optional file-level and symbol-level metadata, structured compressed lines, and stable failure facts. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolRequestSection` (L126-136)
- @brief Describes the request section of the compression payload.
- @details Captures tool identity, scope, base directory, line-number mode, requested inputs, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolSummarySection` (L142-153)
- @brief Describes the summary section of the compression payload.
- @details Exposes aggregate file, line, symbol, and Doxygen counts as numeric fields with explicit unit names so agents can branch on totals without reparsing display strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolRepositorySection` (L159-164)
- @brief Describes the repository section of the compression payload.
- @details Stores the base path, configured source-directory scope, and canonical file list used during compression. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolPayload` (L170-174)
- @brief Describes the full agent-oriented compression payload.
- @details Exposes only aggregate compression totals, repository scope, and per-file compression records, omitting request echoes that are already known to the caller or encoded in tool registration metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildCompressToolPayloadOptions` (L180-188)
- @brief Describes the options required to build one compression payload.
- @details Supplies tool identity, scope, base directory, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeCompressionPath(targetPath: string, baseDir: string): string` (L197-205)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): CompressLineRange` (L214-220)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {CompressLineRange} Structured line-range record.

### fn `function resolveSymbolName(element: SourceElement): string` (L228-230)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every symbol retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], child: SourceElement): SourceElement | undefined` (L239-248)
- @brief Resolves the direct parent element for one child symbol.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] child {SourceElement} Candidate child symbol.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function mapCompressedLines(compressedLines: CompressedLineEntry[]): CompressToolLineEntry[]` (L256-263)
- @brief Maps structured compression lines into the payload line-entry contract.
- @details Performs a shallow field copy so the payload remains decoupled from the core compression result type. Runtime is O(n) in compressed line count. No side effects occur.
- @param[in] compressedLines {CompressedLineEntry[]} Structured compression lines.
- @return {CompressToolLineEntry[]} Payload line entries.

### fn `function analyzeCompressedFileSymbols(` (L275-359)
- @brief Builds structured symbol entries for one successfully analyzed file.
- @details Extracts definition elements, computes parent-child relationships, attaches structured Doxygen metadata, and repeats the canonical file path inside each symbol record for direct-access agent indexing. Runtime is O(n log n) in definition count. No side effects occur.
- @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
- @param[in] absolutePath {string} Absolute file path.
- @param[in] canonicalPath {string} Canonical path emitted in the payload.
- @param[in] languageId {string} Canonical language identifier.
- @return {{ languageName: string | undefined; symbols: CompressToolSymbolEntry[]; fileDoxygen: StructuredDoxygenFields | undefined; fileDescriptionText: string | undefined; doxygenFieldCount: number }} Structured symbol-analysis result.
- @throws {Error} Throws when source analysis or enrichment fails.

### fn `function analyzeCompressFile(` (L373-504)
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

### fn `export function buildCompressToolPayload(options: BuildCompressToolPayloadOptions): CompressToolPayload` (L513-620)
- @brief Builds the full agent-oriented compression payload.
- @details Validates requested paths against the filesystem, compresses processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits repository scope metadata without echoing request facts already known to the caller. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildCompressToolPayloadOptions} Payload-construction options.
- @return {CompressToolPayload} Structured compression payload ordered as summary, repository, and files.
- @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087

### fn `export function buildCompressToolExecutionStderr(payload: CompressToolPayload): string` (L629-640)
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
|`CompressToolFileEntry`|iface||93-120|export interface CompressToolFileEntry extends CompressLi...|
|`CompressToolRequestSection`|iface||126-136|export interface CompressToolRequestSection|
|`CompressToolSummarySection`|iface||142-153|export interface CompressToolSummarySection|
|`CompressToolRepositorySection`|iface||159-164|export interface CompressToolRepositorySection|
|`CompressToolPayload`|iface||170-174|export interface CompressToolPayload|
|`BuildCompressToolPayloadOptions`|iface||180-188|export interface BuildCompressToolPayloadOptions|
|`canonicalizeCompressionPath`|fn||197-205|function canonicalizeCompressionPath(targetPath: string, ...|
|`buildLineRange`|fn||214-220|function buildLineRange(startLineNumber: number, endLineN...|
|`resolveSymbolName`|fn||228-230|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||239-248|function resolveParentElement(definitions: SourceElement[...|
|`mapCompressedLines`|fn||256-263|function mapCompressedLines(compressedLines: CompressedLi...|
|`analyzeCompressedFileSymbols`|fn||275-359|function analyzeCompressedFileSymbols(|
|`analyzeCompressFile`|fn||373-504|function analyzeCompressFile(|
|`buildCompressToolPayload`|fn||513-620|export function buildCompressToolPayload(options: BuildCo...|
|`buildCompressToolExecutionStderr`|fn||629-640|export function buildCompressToolExecutionStderr(payload:...|


---

# compress.ts | TypeScript | 464L | 13 symbols | 3 imports | 17 comments
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

### fn `export function compressSourceDetailed(source: string, language: string, includeLineNumbers = true): CompressedSourceResult` (L252-420)
- @brief Compresses in-memory source text into the structured compression model.
- @details Removes blank lines and comments, preserves shebangs, respects string-literal boundaries, retains leading indentation for indentation-significant languages, and emits both structured line entries and a rendered text excerpt. Runtime is O(n) in source length. No external state is mutated.
- @param[in] source {string} Raw source text.
- @param[in] language {string} Canonical compression language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
- @return {CompressedSourceResult} Structured compression result.
- @throws {Error} Throws when the language is unsupported.

### fn `export function compressSource(source: string, language: string, includeLineNumbers = true): string` (L431-433)
- @brief Compresses in-memory source text for one language.
- @details Delegates to `compressSourceDetailed(...)` and returns only the rendered compressed source text so legacy CLI and markdown-oriented paths keep their existing behavior. Runtime is O(n) in source length. No external state is mutated.
- @param[in] source {string} Raw source text.
- @param[in] language {string} Canonical compression language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
- @return {string} Compressed source text.
- @throws {Error} Throws when the language is unsupported.

### fn `export function compressFileDetailed(filePath: string, language?: string, includeLineNumbers = true): CompressedSourceResult` (L444-451)
- @brief Compresses one source file from disk into the structured compression model.
- @details Detects the language when not supplied, reads the file as UTF-8, and delegates to `compressSourceDetailed(...)`. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] filePath {string} Source file path.
- @param[in] language {string | undefined} Optional explicit language override.
- @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
- @return {CompressedSourceResult} Structured compression result.
- @throws {Error} Throws when the language cannot be detected or the file cannot be read.

### fn `export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string` (L462-464)
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
|`compressSourceDetailed`|fn||252-420|export function compressSourceDetailed(source: string, la...|
|`compressSource`|fn||431-433|export function compressSource(source: string, language: ...|
|`compressFileDetailed`|fn||444-451|export function compressFileDetailed(filePath: string, la...|
|`compressFile`|fn||462-464|export function compressFile(filePath: string, language?:...|


---

# config.ts | TypeScript | 374L | 9 symbols | 7 imports | 13 comments
> Path: `src/core/config.ts`
- @brief Loads, normalizes, and persists pi-usereq project configuration.
- @details Defines the configuration schema, default directory conventions, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi-usereq`.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { ReqError } from "./errors.js";
import {
import {
import { normalizeEnabledPiUsereqTools } from "./pi-usereq-tools.js";
import { makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface StaticCheckEntry` (L38-42)
- @brief Describes one static-check module configuration entry.
- @details Each record identifies the checker module and optional command or parameter list used during per-language static analysis dispatch. The interface is type-only and has no runtime cost.

### iface `export interface UseReqConfig` (L48-80)
- @brief Defines the persisted pi-usereq project configuration schema.
- @details Captures documentation paths, source/test directory selection, static-check configuration, enabled startup tools, and notification settings while excluding runtime-derived path metadata. The interface is compile-time only and introduces no runtime side effects.

### fn `export function getProjectConfigPath(projectBase: string): string` (L104-106)
- @brief Computes the per-project config file path.
- @details Joins the project base with `.pi-usereq/config.json`, producing the canonical persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {string} Absolute config file path.

### fn `export function getDefaultConfig(_projectBase: string): UseReqConfig` (L115-149)
- @brief Builds the default project configuration.
- @details Populates canonical docs/test/source directories, the default startup tool set, default command-notify, terminal-beep, sound, and Pushover fields, and excludes runtime-derived path metadata. Time complexity is O(n) in default tool count. No filesystem side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Fresh default configuration object.
- @satisfies CTN-001, CTN-012, REQ-066, REQ-129, REQ-146, REQ-163, REQ-174, REQ-177, REQ-178, REQ-184, REQ-185

### fn `export function loadConfig(projectBase: string): UseReqConfig` (L159-251)
- @brief Loads and sanitizes the persisted project configuration.
- @details Returns defaults when the config file does not exist. Otherwise parses JSON, validates directory and static-check field shapes, normalizes enabled tool names plus notify, beep, sound, and Pushover fields, applies documented per-flag defaults for missing payloads, and ignores removed or runtime-derived path metadata. Runtime is O(n) in config size. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Sanitized effective configuration.
- @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.
- @satisfies CTN-012, REQ-066, REQ-129, REQ-146, REQ-163, REQ-174, REQ-177, REQ-178, REQ-184, REQ-185

### fn `function buildPersistedConfig(config: UseReqConfig): UseReqConfig` (L260-303)
- @brief Builds the persisted configuration payload that excludes runtime-derived fields.
- @details Copies only the canonical persisted configuration keys into a fresh object so runtime-derived metadata such as `base-path` and `git-path` can never be written to disk while preserving notification and Pushover settings verbatim. Runtime is O(n) in config size. No external state is mutated.
- @param[in] config {UseReqConfig} Effective configuration object.
- @return {UseReqConfig} Persistable configuration payload.
- @satisfies CTN-012, REQ-146, REQ-163

### fn `export function saveConfig(projectBase: string, config: UseReqConfig): void` (L313-317)
- @brief Persists the project configuration to disk.
- @details Creates the parent `.pi-usereq` directory when necessary, strips runtime-derived fields from the serialized payload, and writes formatted JSON terminated by a newline. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to persist.
- @return {void} No return value.
- @satisfies CTN-012, REQ-146

### fn `export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig` (L326-336)
- @brief Normalizes persisted directory fields to project-relative forms.
- @details Rewrites docs, tests, and source directories using project containment heuristics, strips trailing separators, and restores defaults for empty results. Runtime is O(n) in configured path count plus path-length processing. No filesystem writes occur.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to normalize.
- @return {UseReqConfig} Normalized configuration copy.

### fn `export function buildPromptReplacementPaths(projectBase: string, config: UseReqConfig): Record<string, string>` (L346-374)
- @brief Builds placeholder replacements for bundled prompt rendering.
- @details Computes runtime path context from the execution path, derives installation-owned template and guideline paths, enumerates visible guideline files from the installed resource tree, and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {Record<string, string>} Placeholder-to-string replacement map including runtime path tokens.
- @satisfies REQ-002, REQ-103, REQ-106, REQ-107, CTN-011

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckEntry`|iface||38-42|export interface StaticCheckEntry|
|`UseReqConfig`|iface||48-80|export interface UseReqConfig|
|`getProjectConfigPath`|fn||104-106|export function getProjectConfigPath(projectBase: string)...|
|`getDefaultConfig`|fn||115-149|export function getDefaultConfig(_projectBase: string): U...|
|`loadConfig`|fn||159-251|export function loadConfig(projectBase: string): UseReqCo...|
|`buildPersistedConfig`|fn||260-303|function buildPersistedConfig(config: UseReqConfig): UseR...|
|`saveConfig`|fn||313-317|export function saveConfig(projectBase: string, config: U...|
|`normalizeConfigPaths`|fn||326-336|export function normalizeConfigPaths(projectBase: string,...|
|`buildPromptReplacementPaths`|fn||346-374|export function buildPromptReplacementPaths(projectBase: ...|


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

# extension-status.ts | TypeScript | 702L | 33 symbols | 5 imports | 33 comments
> Path: `src/core/extension-status.ts`
- @brief Tracks pi-usereq extension status state and renders status-bar telemetry.
- @details Centralizes hook interception, context-usage snapshots, run timing,
and deterministic status-bar formatting for the pi-usereq extension. Runtime
is O(1) per event plus O(s) in configured source-path count during status
rendering. Side effects are limited to in-memory state mutation and interval
scheduling through exported controller helpers.

## Imports
```
import path from "node:path";
import type {
import type { UseReqConfig } from "./config.js";
import { normalizePathSlashes } from "./path-context.js";
import {
```

## Definitions

- type `type StatusForegroundColor = Extract<` (L32)
- @brief Enumerates the CLI-supported theme tokens consumed by status rendering.
- @details Restricts the status formatter to documented pi theme tokens so the
status bar remains compatible with the active CLI theme schema. Compile-time
only and introduces no runtime cost.
### iface `interface RawStatusTheme` (L43-47)
- @brief Describes the raw theme capabilities required for status rendering.
- @details Accepts the `ctx.ui.theme` foreground renderer plus optional helpers
that can convert a foreground color into a background-styled fragment for the
context-usage bar. Compile-time only and introduces no runtime cost.

### iface `interface StatusThemeAdapter` (L55-63)
- @brief Describes the normalized theme adapter used by status formatters.
- @details Exposes deterministic label, value, foreground, background, and
context-cell renderers so status text generation stays independent from the
raw theme API. Compile-time only and introduces no runtime cost.

### iface `interface ContextUsageOverlaySpec` (L71-75)
- @brief Describes one fixed-width context-bar overlay.
- @details Stores the literal text plus foreground and background color roles
used when the context bar must render threshold-specific labels instead of
block glyphs. Compile-time only and introduces no runtime cost.

- type `export type PiUsereqStatusHookName = (typeof PI_USEREQ_STATUS_HOOK_NAMES)[number];` (L118)
- @brief Represents one hook name handled by the pi-usereq status controller.
- @details Narrows hook registration and event-update calls to the canonical
intercepted-hook set. Compile-time only and introduces no runtime cost.
### iface `export interface PiUsereqPromptRequest` (L124-127)
- @brief Describes one prompt request tracked across extension command delivery and runtime execution.
- @details Stores the bundled prompt command name plus the raw argument string substituted into `%%ARGS%%` so later successful-run side effects can reconstruct prompt-specific completion notifications. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqStatusState` (L133-140)
- @brief Stores the mutable runtime facts displayed by the status bar.
- @details Persists the latest context-usage snapshot, the active run start timestamp, the most recent normally completed run duration, the accumulated duration of all normally completed runs, and prompt-request metadata carried from command dispatch into the next runtime execution. Runtime state is mutated in-place by controller helpers. Compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqStatusController` (L149-154)
- @brief Stores the controller state required for event-driven status updates.
- @details Keeps the mutable status snapshot, the current configuration, the
latest extension context used for rendering, and the interval handle used
for live elapsed-time refreshes. Compile-time only and introduces no runtime
cost.

### fn `function convertForegroundAnsiToBackgroundAnsi(` (L164-172)
- @brief Converts a foreground ANSI sequence into the equivalent background ANSI.
- @details Supports the standard `38;` foreground prefix emitted by pi themes.
Returns `undefined` when the input cannot be transformed deterministically.
Runtime is O(n) in ANSI sequence length. No external state is mutated.
- @param[in] foregroundAnsi {string} Foreground ANSI sequence.
- @return {string | undefined} Background ANSI sequence when derivable.

### fn `function applyForegroundAsBackground(` (L185-202)
- @brief Applies a foreground-derived background style to one text fragment.
- @details Prefers a theme-provided `bgFromFg` encoder for deterministic test
rendering and falls back to ANSI conversion when the runtime theme exposes
`getFgAnsi`. Runtime is O(n) in fragment length. No external state is
mutated.
- @param[in] theme {RawStatusTheme} Raw theme adapter.
- @param[in] color {StatusForegroundColor} Foreground color reused as background.
- @param[in] text {string} Already-colored foreground fragment.
- @return {string} Background-decorated text fragment.

### fn `function createStatusThemeAdapter(theme: RawStatusTheme): StatusThemeAdapter` (L213-233)
- @brief Builds the normalized theme adapter used by pi-usereq status formatters.
- @details Precomputes label, value, foreground, background, separator, and
context-cell renderers so status formatting remains stable across real TUI
themes and deterministic test doubles. Runtime is O(1). No external state
is mutated.
- @param[in] theme {RawStatusTheme} Raw theme implementation from `ctx.ui.theme`.
- @return {StatusThemeAdapter} Normalized status-theme adapter.

### fn `const colorize = (color: StatusForegroundColor, text: string): string =>` (L214-232)

### fn `const backgroundize = (color: StatusForegroundColor, text: string): string =>` (L216-232)

### fn `function normalizeContextUsage(` (L243-260)
- @brief Normalizes one raw context-usage snapshot.
- @details Preserves the runtime token and context-window counts, derives a
percentage when the runtime omits it, and clamps percentages into `[0, 100]`.
Runtime is O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Raw runtime snapshot.
- @return {ContextUsage | undefined} Normalized snapshot.

### fn `function refreshContextUsage(` (L272-277)
- @brief Refreshes the stored context-usage snapshot from the active extension context.
- @details Calls `ctx.getContextUsage()` on every intercepted event so the
controller retains the newest context-usage facts available from the pi
runtime. Runtime is O(1). Side effect: mutates `state.contextUsage`.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.
- @satisfies REQ-118, REQ-119

### fn `function countFilledContextCells(` (L288-296)
- @brief Counts the filled cells rendered by the 10-cell context bar.
- @details Uses ceiling semantics for positive percentages so any non-zero
usage occupies at least one cell and zero usage occupies none. Runtime is
O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {number} Filled-cell count in the inclusive range `[0, 10]`.
- @satisfies REQ-122

### fn `function resolveContextUsageOverlay(` (L308-327)
- @brief Resolves the threshold-specific context-bar overlay when required.
- @details Returns the empty-state `◀ CLEAR ▶ ` overlay when normalized context
usage is unavailable or non-positive and returns the centered ` ◀ FULL ▶ `
overlay with the active theme `error` token when usage exceeds 90 percent.
Runtime is O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {ContextUsageOverlaySpec | undefined} Overlay spec when a replacement label is required.
- @satisfies REQ-127, REQ-128

### fn `function formatContextUsageOverlay(` (L340-348)
- @brief Formats one threshold-specific context-bar overlay.
- @details Renders the fixed-width overlay text with the requested foreground
color and reuses the selected bar color as the background so the bar width
and state-specific backdrop remain preserved. Runtime is O(n) in overlay
width. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] overlay {ContextUsageOverlaySpec} Overlay specification.
- @return {string} Rendered overlay text.
- @satisfies REQ-127, REQ-128

### fn `function formatContextUsageBar(` (L362-374)
- @brief Formats one 10-cell context-usage bar.
- @details Renders threshold-specific overlays for empty and high-water states;
otherwise renders filled cells with the theme `warning` token on an
accent-derived background and unfilled cells in `dim` on the same background
to preserve constant bar width. Runtime is O(1). No external state is
mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {string} Rendered 10-cell bar or overlay.
- @satisfies REQ-121, REQ-122, REQ-126, REQ-127, REQ-128

### fn `function formatStatusDuration(durationMs: number): string` (L385-390)
- @brief Formats one elapsed-duration value as `M:SS`.
- @details Floors the input to whole seconds, keeps minutes unbounded above 59,
and zero-pads seconds to two digits. Runtime is O(1). No external state is
mutated.
- @param[in] durationMs {number} Duration in milliseconds.
- @return {string} Duration rendered as `M:SS`.
- @satisfies REQ-125

### fn `function formatCompletedStatusDuration(` (L401-405)
- @brief Formats one optional completed-duration value.
- @details Returns the canonical unset placeholder `--:--` until the supplied
timer receives a normally completed prompt duration, then delegates to
`formatStatusDuration(...)`. Runtime is O(1). No external state is mutated.
- @param[in] durationMs {number | undefined} Optional completed-duration value.
- @return {string} Rendered duration or unset placeholder.
- @satisfies REQ-124

### fn `function formatElapsedStatusValue(` (L418-428)
- @brief Formats the consolidated `elapsed` status-bar value.
- @details Emits the active prompt segment `⏱︎ <active>`, the latest normally
completed segment `⚑ <last>`, and the accumulated successful-runtime segment
`⌛︎ <total>` with fixed spacing. Runtime is O(1). No external state is
mutated.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] nowMs {number} Current wall-clock time in milliseconds.
- @return {string} Consolidated `elapsed` field value.
- @satisfies REQ-123, REQ-124, REQ-125, REQ-159

### fn `function formatStatusField(` (L439-445)
- @brief Formats one standard status-bar field.
- @details Renders the field label in accent color and the value in warning
color. Runtime is O(n) in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] value {string} Unstyled field value.
- @return {string} Rendered status-field fragment.

### fn `function formatRenderedStatusField(` (L457-463)
- @brief Formats one pre-rendered status-bar field value.
- @details Preserves the accent-colored field label while allowing callers to
provide a custom styled value such as the context-usage bar. Runtime is O(n)
in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] renderedValue {string} Pre-rendered field value.
- @return {string} Rendered status-field fragment.

### fn `function didAgentEndAbort(messages: AgentEndEvent["messages"]): boolean` (L474-481)
- @brief Detects whether an agent run ended through abort semantics.
- @details Treats any assistant message whose `stopReason` equals `aborted` as
an escape-triggered termination that must not overwrite the `last` timer.
Runtime is O(n) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Messages emitted by `agent_end`.
- @return {boolean} `true` when the run ended in aborted state.
- @satisfies REQ-125

### fn `function buildPiUsereqStatusText(` (L494-520)
- @brief Builds the full single-line pi-usereq status-bar payload.
- @details Renders base, context, elapsed, notify, beep, sound, and pushover fields in the canonical order with dim bullet separators and threshold-specific context-bar overlays. Runtime is O(1). No external state is mutated.
- @param[in] cwd {string} Runtime working directory used for base-path derivation.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] nowMs {number} Current wall-clock time in milliseconds.
- @return {string} Single-line status-bar text.
- @satisfies REQ-109, REQ-112, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-135, REQ-136, REQ-148, REQ-156, REQ-159, REQ-170, REQ-171, REQ-180

### fn `function stopStatusTicker(controller: PiUsereqStatusController): void` (L530-535)
- @brief Stops the live elapsed-time ticker when it is active.
- @details Clears the interval handle and resets the stored timer reference so
subsequent runs can reinitialize live status refreshes deterministically.
Runtime is O(1). Side effect: mutates `controller.tickHandle`.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `function syncPiUsereqStatusTicker(` (L547-563)
- @brief Synchronizes the live elapsed-time ticker with the current run state.
- @details Starts a 1-second render ticker while a run is active and stops the
ticker when the run returns to idle. Runtime is O(1). Side effects include
interval creation, interval disposal, and footer-status mutation on timer
ticks.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-123

### fn `export function createPiUsereqStatusController(): PiUsereqStatusController` (L571-585)
- @brief Creates an empty pi-usereq status controller.
- @details Initializes the mutable status snapshot, including empty prompt-request tracking, and starts with no config, no context, and no live ticker. Runtime is O(1). No external state is mutated.
- @return {PiUsereqStatusController} New status controller.
- @satisfies DES-010

### fn `export function setPiUsereqStatusConfig(` (L597-602)
- @brief Stores the effective project configuration used by status rendering.
- @details Replaces the controller's cached configuration so later status
renders reuse the latest docs, tests, source-path, and pi-notify values
without reading from disk on every event. Runtime is O(1). Side effect:
mutates `controller.config`.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `export function renderPiUsereqStatus(` (L615-634)
- @brief Renders the current pi-usereq status bar into the active UI context.
- @details Updates the controller's latest context pointer and writes the
single-line status text only when configuration is available, including any
threshold-specific context-bar overlays. Runtime is O(s) in configured
source-path count. Side effect: mutates `ctx.ui` status.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-135, REQ-136, REQ-148, REQ-159, REQ-170, REQ-171, REQ-180

### fn `export function updateExtensionStatus(` (L651-686)
- @brief Updates mutable status state for one intercepted lifecycle hook.
- @details Refreshes stored context usage on every hook, starts run timing on
`agent_start`, promotes pending prompt-request metadata into the active run, captures non-aborted run duration on `agent_end`, accumulates successful runtime into `Σ`, clears live timing on shutdown, synchronizes
the live ticker, and re-renders the status bar when configuration is
available. Runtime is O(n) in `agent_end` message count and otherwise O(1).
Side effects include in-memory state mutation, interval scheduling, and
footer-status updates.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded from the wrapper.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-117, REQ-118, REQ-119, REQ-123, REQ-124, REQ-125, REQ-159, REQ-169

### fn `export function disposePiUsereqStatusController(` (L697-702)
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
|`StatusForegroundColor`|type||32||
|`RawStatusTheme`|iface||43-47|interface RawStatusTheme|
|`StatusThemeAdapter`|iface||55-63|interface StatusThemeAdapter|
|`ContextUsageOverlaySpec`|iface||71-75|interface ContextUsageOverlaySpec|
|`PiUsereqStatusHookName`|type||118||
|`PiUsereqPromptRequest`|iface||124-127|export interface PiUsereqPromptRequest|
|`PiUsereqStatusState`|iface||133-140|export interface PiUsereqStatusState|
|`PiUsereqStatusController`|iface||149-154|export interface PiUsereqStatusController|
|`convertForegroundAnsiToBackgroundAnsi`|fn||164-172|function convertForegroundAnsiToBackgroundAnsi(|
|`applyForegroundAsBackground`|fn||185-202|function applyForegroundAsBackground(|
|`createStatusThemeAdapter`|fn||213-233|function createStatusThemeAdapter(theme: RawStatusTheme):...|
|`colorize`|fn||214-232|const colorize = (color: StatusForegroundColor, text: str...|
|`backgroundize`|fn||216-232|const backgroundize = (color: StatusForegroundColor, text...|
|`normalizeContextUsage`|fn||243-260|function normalizeContextUsage(|
|`refreshContextUsage`|fn||272-277|function refreshContextUsage(|
|`countFilledContextCells`|fn||288-296|function countFilledContextCells(|
|`resolveContextUsageOverlay`|fn||308-327|function resolveContextUsageOverlay(|
|`formatContextUsageOverlay`|fn||340-348|function formatContextUsageOverlay(|
|`formatContextUsageBar`|fn||362-374|function formatContextUsageBar(|
|`formatStatusDuration`|fn||385-390|function formatStatusDuration(durationMs: number): string|
|`formatCompletedStatusDuration`|fn||401-405|function formatCompletedStatusDuration(|
|`formatElapsedStatusValue`|fn||418-428|function formatElapsedStatusValue(|
|`formatStatusField`|fn||439-445|function formatStatusField(|
|`formatRenderedStatusField`|fn||457-463|function formatRenderedStatusField(|
|`didAgentEndAbort`|fn||474-481|function didAgentEndAbort(messages: AgentEndEvent["messag...|
|`buildPiUsereqStatusText`|fn||494-520|function buildPiUsereqStatusText(|
|`stopStatusTicker`|fn||530-535|function stopStatusTicker(controller: PiUsereqStatusContr...|
|`syncPiUsereqStatusTicker`|fn||547-563|function syncPiUsereqStatusTicker(|
|`createPiUsereqStatusController`|fn||571-585|export function createPiUsereqStatusController(): PiUsere...|
|`setPiUsereqStatusConfig`|fn||597-602|export function setPiUsereqStatusConfig(|
|`renderPiUsereqStatus`|fn||615-634|export function renderPiUsereqStatus(|
|`updateExtensionStatus`|fn||651-686|export function updateExtensionStatus(|
|`disposePiUsereqStatusController`|fn||697-702|export function disposePiUsereqStatusController(|


---

# find-constructs.ts | TypeScript | 319L | 12 symbols | 4 imports | 14 comments
> Path: `src/core/find-constructs.ts`
- @brief Finds named language constructs in explicit source-file lists and renders compact excerpts.
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

### fn `export function findConstructsInFiles(` (L253-319)
- @brief Finds named constructs across explicit files and renders markdown excerpts.
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
|`findConstructsInFiles`|fn||253-319|export function findConstructsInFiles(|


---

# find-payload.ts | TypeScript | 892L | 31 symbols | 6 imports | 32 comments
> Path: `src/core/find-payload.ts`
- @brief Builds agent-oriented JSON payloads for `files-find` and `find`.
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
- @brief Enumerates supported find-payload scopes.
- @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type FindFileStatus = "matched" | "no_match" | "error" | "skipped";` (L39)
- @brief Enumerates supported per-file find-entry statuses.
- @details Separates matched files, analyzed no-match files, analysis failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
- type `export type FindRequestStatus = "valid" | "invalid";` (L45)
- @brief Enumerates request-validation statuses for tag-filter and regex fields.
- @details Distinguishes validated search inputs from invalid request parameters without requiring stderr parsing. The alias is compile-time only and introduces no runtime cost.
- type `export type FindLineNumberMode = "enabled" | "disabled";` (L51)
- @brief Enumerates rendered line-number modes for find output.
- @details Distinguishes payloads whose display strings include original source line prefixes from payloads whose display strings contain plain stripped code only. The alias is compile-time only and introduces no runtime cost.
- type `export type FindSearchStatus = "matched" | "no_matches" | "invalid_tag_filter" | "invalid_regex";` (L57)
- @brief Enumerates top-level find execution outcomes.
- @details Separates successful match delivery from invalid request states and valid no-match searches so agents can branch on one canonical field. The alias is compile-time only and introduces no runtime cost.
### iface `export interface FindLineRange` (L63-67)
- @brief Describes one numeric source line range.
- @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolCodeLineEntry` (L73-78)
- @brief Describes one structured stripped-code line.
- @details Preserves output order, original source coordinates, normalized stripped text, and rendered display text so agents can choose between direct-access facts and human-visible rendering without reparsing strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolMatchEntry extends FindLineRange` : FindLineRange (L84-103)
- @brief Describes one structured matched construct.
- @details Orders direct-access identity fields before hierarchy, locations, Doxygen metadata, and stripped code so agents can branch without reparsing monolithic markdown. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolFileEntry extends FindLineRange` : FindLineRange (L109-131)
- @brief Describes one per-file find payload entry.
- @details Stores path identity, file status, supported-tag metadata, line metrics, file-level Doxygen metadata, and matched-construct records while keeping failure facts structured. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolRequestSection` (L137-155)
- @brief Describes the request section of the find payload.
- @details Captures tool identity, scope, base directory, line-number mode, tag filter, regex, validation statuses, and requested path inventory so agents can reason about how the search was executed. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolSummarySection` (L161-172)
- @brief Describes the summary section of the find payload.
- @details Exposes aggregate file, match, line, and Doxygen counts as numeric fields plus one stable search-status discriminator and the normalized validation error when request parsing fails. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolRepositorySection` (L178-183)
- @brief Describes the repository section of the find payload.
- @details Stores the base path, configured source-directory scope, and canonical file list used during search while omitting the static supported-tag matrix because that data belongs in tool registration metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolPayload` (L189-193)
- @brief Describes the full agent-oriented find payload.
- @details Exposes only aggregate search totals, repository scope, and per-file match records, omitting request echoes and static supported-tag matrices that already belong in registration metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildFindToolPayloadOptions` (L199-209)
- @brief Describes the options required to build one find payload.
- @details Supplies tool identity, scope, base directory, tag filter, regex, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### iface `interface ValidatedRegex` (L215-219)
- @brief Describes the result of validating one regex pattern.
- @details Separates valid compiled regex instances from invalid user input while preserving a stable machine-readable status and error message. The interface is compile-time only and introduces no runtime cost.

### iface `interface ValidatedTagFilter` (L225-230)
- @brief Describes the result of validating one tag filter.
- @details Separates normalized tag values from invalid or empty filters while preserving a stable status and error message. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeFindPath(targetPath: string, baseDir: string): string` (L239-247)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): FindLineRange` (L256-262)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {FindLineRange} Structured line-range record.

### fn `function resolveSymbolName(element: SourceElement): string` (L270-272)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every matched construct retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], element: SourceElement): SourceElement | undefined` (L281-290)
- @brief Resolves the direct parent definition for one source element.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] element {SourceElement} Candidate child element.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function mapCodeLines(lineEntries: StrippedConstructLineEntry[]): FindToolCodeLineEntry[]` (L298-305)
- @brief Converts stripped-code line entries into the payload line-entry contract.
- @details Performs a shallow field copy so the payload remains decoupled from the lower-level strip helper type. Runtime is O(n) in stripped line count. No side effects occur.
- @param[in] lineEntries {StrippedConstructLineEntry[]} Normalized stripped-code line entries.
- @return {FindToolCodeLineEntry[]} Payload line entries.

### fn `function buildStrippedSourceText(lineEntries: FindToolCodeLineEntry[]): string | undefined` (L313-318)
- @brief Joins stripped-code line entries into one optional monolithic text field.
- @details Preserves rendered display strings in line order so agents that need a contiguous excerpt can read one field without losing access to the structured line array. Runtime is O(n) in stripped line count. No side effects occur.
- @param[in] lineEntries {FindToolCodeLineEntry[]} Structured stripped-code line entries.
- @return {string | undefined} Joined stripped-source text, or `undefined` when no lines remain.

### fn `function validateTagFilter(tagFilter: string): ValidatedTagFilter` (L326-342)
- @brief Validates and normalizes one tag filter.
- @details Parses the raw pipe-delimited filter, sorts the resulting unique tag values, and marks the filter invalid when no recognized tag remains after normalization. Runtime is O(n log n) in requested tag count. No side effects occur.
- @param[in] tagFilter {string} Raw pipe-delimited tag filter.
- @return {ValidatedTagFilter} Validation result containing the normalized tag set and status.

### fn `function validateRegexPattern(pattern: string): ValidatedRegex` (L350-362)
- @brief Validates and compiles one construct-name regex pattern.
- @details Uses the JavaScript `RegExp` engine with search-style `.test(...)` evaluation and records a stable error message when compilation fails. Runtime is O(n) in pattern length. No side effects occur.
- @param[in] pattern {string} Raw user pattern.
- @return {ValidatedRegex} Validation result containing the compiled regex when valid.

### fn `function elementMatches(element: SourceElement, tagSet: Set<string>, regex: RegExp): boolean` (L372-380)
- @brief Tests whether one element matches a validated tag filter and regex.
- @details Rejects unnamed elements and elements outside the requested tag set before applying the precompiled regex to the construct name. Runtime is O(1) plus regex evaluation. No side effects occur.
- @param[in] element {SourceElement} Candidate source element.
- @param[in] tagSet {Set<string>} Normalized requested tag set.
- @param[in] regex {RegExp} Precompiled construct-name regex.
- @return {boolean} `true` when the element matches both filters.

### fn `function countLogicalLines(fileContent: string): number` (L388-393)
- @brief Counts logical source lines from one file content string.
- @details Preserves the repository's line-count convention that excludes the terminal empty split produced by trailing newlines. Runtime is O(n) in content length. No side effects occur.
- @param[in] fileContent {string} Raw file content.
- @return {number} Logical source-line count.

### fn `function buildSkippedFileEntry(` (L408-443)
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

### fn `function buildMatchEntry(` (L457-500)
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

### fn `function analyzeFindFile(` (L516-702)
- @brief Analyzes one path into a structured find file entry.
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

### fn `export function buildFindToolPayload(options: BuildFindToolPayloadOptions): FindToolPayload` (L711-858)
- @brief Builds the full agent-oriented find payload.
- @details Validates request parameters, analyzes requested files in caller order when the request is valid, preserves skipped and no-match outcomes in structured file entries, computes aggregate numeric totals, and omits request echoes plus the static supported-tag matrix already encoded in registration metadata. Runtime is O(F log F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildFindToolPayloadOptions} Payload-construction options.
- @return {FindToolPayload} Structured find payload ordered as summary, repository, and files.
- @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-096, REQ-098

### fn `export function buildFindToolExecutionStderr(payload: FindToolPayload): string` (L867-892)
- @brief Builds deterministic stderr diagnostics from a find payload.
- @details Serializes invalid request states, skipped inputs, no-match files, and analysis failures into stable newline-delimited diagnostics while leaving successful matched files silent. Runtime is O(n) in file-entry count. No side effects occur.
- @param[in] payload {FindToolPayload} Structured find payload.
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
|`FindToolMatchEntry`|iface||84-103|export interface FindToolMatchEntry extends FindLineRange|
|`FindToolFileEntry`|iface||109-131|export interface FindToolFileEntry extends FindLineRange|
|`FindToolRequestSection`|iface||137-155|export interface FindToolRequestSection|
|`FindToolSummarySection`|iface||161-172|export interface FindToolSummarySection|
|`FindToolRepositorySection`|iface||178-183|export interface FindToolRepositorySection|
|`FindToolPayload`|iface||189-193|export interface FindToolPayload|
|`BuildFindToolPayloadOptions`|iface||199-209|export interface BuildFindToolPayloadOptions|
|`ValidatedRegex`|iface||215-219|interface ValidatedRegex|
|`ValidatedTagFilter`|iface||225-230|interface ValidatedTagFilter|
|`canonicalizeFindPath`|fn||239-247|function canonicalizeFindPath(targetPath: string, baseDir...|
|`buildLineRange`|fn||256-262|function buildLineRange(startLineNumber: number, endLineN...|
|`resolveSymbolName`|fn||270-272|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||281-290|function resolveParentElement(definitions: SourceElement[...|
|`mapCodeLines`|fn||298-305|function mapCodeLines(lineEntries: StrippedConstructLineE...|
|`buildStrippedSourceText`|fn||313-318|function buildStrippedSourceText(lineEntries: FindToolCod...|
|`validateTagFilter`|fn||326-342|function validateTagFilter(tagFilter: string): ValidatedT...|
|`validateRegexPattern`|fn||350-362|function validateRegexPattern(pattern: string): Validated...|
|`elementMatches`|fn||372-380|function elementMatches(element: SourceElement, tagSet: S...|
|`countLogicalLines`|fn||388-393|function countLogicalLines(fileContent: string): number|
|`buildSkippedFileEntry`|fn||408-443|function buildSkippedFileEntry(|
|`buildMatchEntry`|fn||457-500|function buildMatchEntry(|
|`analyzeFindFile`|fn||516-702|function analyzeFindFile(|
|`buildFindToolPayload`|fn||711-858|export function buildFindToolPayload(options: BuildFindTo...|
|`buildFindToolExecutionStderr`|fn||867-892|export function buildFindToolExecutionStderr(payload: Fin...|


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

# path-context.ts | TypeScript | 196L | 9 symbols | 4 imports | 12 comments
> Path: `src/core/path-context.ts`
- @brief Derives shared runtime path context for prompts, tools, and configuration flows.
- @details Resolves installation, execution, base, config, resource, docs, test, source, and optional git paths from the active runtime context, validates ancestor constraints for repository roots, and formats prompt-visible paths relative to the user home via platform-native environment variables. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. Side effects are limited to filesystem-path normalization.

## Imports
```
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UseReqConfig } from "./config.js";
```

## Definitions

### iface `export interface RuntimePathContext` (L28-44)
- @brief Describes the absolute runtime path context shared across extension components.
- @details Aggregates the derived installation, execution, base, config, resource, documentation, tests, source, template, guideline, and optional git paths needed by prompt rendering and tool payload generation. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RuntimePathFacts` (L50-64)
- @brief Describes the prompt/tool-facing runtime paths rendered with a home-environment-variable prefix when possible.
- @details Mirrors `RuntimePathContext` in a serialization-oriented shape so downstream agents can consume stable, user-home-relative path strings without reparsing absolute local paths. The interface is compile-time only and introduces no runtime cost.

### fn `export function getInstallationPath(): string` (L71-73)
- @brief Resolves the installed extension root that owns `index.ts` and bundled resources.
- @details Uses the current module location under `src/core` or its installed equivalent, then moves one directory upward so the returned path is the runtime installation root containing `resources/`. Runtime is O(1). No external state is mutated.
- @return {string} Absolute installation path.

### fn `export function getConfigPath(basePath: string): string` (L81-83)
- @brief Computes the absolute project config path for one base path.
- @details Appends `.pi-usereq/config.json` to the supplied base path using the canonical repository-local configuration layout. Runtime is O(1). No external state is mutated.
- @param[in] basePath {string} Absolute or relative base path.
- @return {string} Absolute config-file path.

### fn `export function normalizePathSlashes(value: string): string` (L91-93)
- @brief Formats one path with slash separators.
- @details Normalizes the supplied path and converts platform separators to `/` so serialized payloads remain stable across operating systems. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Absolute or relative filesystem path.
- @return {string} Slash-normalized path string.

### fn `export function isSameOrAncestorPath(ancestorPath: string, childPath: string): boolean` (L102-107)
- @brief Tests whether one path is identical to or an ancestor of another path.
- @details Resolves both inputs, computes a relative traversal from the candidate ancestor to the candidate child, and accepts only exact matches or descendant traversals that stay within the ancestor subtree. Runtime is O(p) in path length. No external state is mutated.
- @param[in] ancestorPath {string} Candidate ancestor or identical path.
- @param[in] childPath {string} Candidate child or identical path.
- @return {boolean} `true` when `ancestorPath` equals `childPath` or strictly contains it.

### fn `export function formatRuntimePathForDisplay(absolutePath: string): string` (L115-127)
- @brief Formats one absolute path relative to the user home using platform-native home environment variables when possible.
- @details Returns `$HOME` for POSIX platforms and `%USERPROFILE%` for Windows when the path equals or descends from the current home directory; otherwise returns the normalized absolute path unchanged. Runtime is O(p) in path length. No external state is mutated.
- @param[in] absolutePath {string} Absolute or relative path candidate.
- @return {string} Home-environment-relative or slash-normalized absolute path.

### fn `export function buildRuntimePathContext(` (L137-140)
- @brief Builds the absolute runtime path context for one execution directory and configuration.
- @details Derives `base-path` from the supplied execution path, derives `config-path` under `.pi-usereq`, resolves docs/tests/source directories against the base path, derives installation-owned resource directories, and keeps `git-path` only when it satisfies the base-path ancestor constraint. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] executionPath {string} Current execution directory.
- @param[in] config {Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">} Effective configuration fields required for path derivation.
- @param[in] options {{ installationPath?: string; gitPath?: string | undefined } | undefined} Optional installation and git-root overrides.
- @return {RuntimePathContext} Absolute runtime path context.

### fn `export function buildRuntimePathFacts(context: RuntimePathContext): RuntimePathFacts` (L180-196)
- @brief Converts the absolute runtime path context into prompt/tool-facing path facts.
- @details Re-encodes every absolute path with the user-home environment-variable formatter while preserving path presence for the optional git root. Runtime is O(s + p) where s is source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] context {RuntimePathContext} Absolute runtime path context.
- @return {RuntimePathFacts} Display-oriented runtime path facts.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`RuntimePathContext`|iface||28-44|export interface RuntimePathContext|
|`RuntimePathFacts`|iface||50-64|export interface RuntimePathFacts|
|`getInstallationPath`|fn||71-73|export function getInstallationPath(): string|
|`getConfigPath`|fn||81-83|export function getConfigPath(basePath: string): string|
|`normalizePathSlashes`|fn||91-93|export function normalizePathSlashes(value: string): string|
|`isSameOrAncestorPath`|fn||102-107|export function isSameOrAncestorPath(ancestorPath: string...|
|`formatRuntimePathForDisplay`|fn||115-127|export function formatRuntimePathForDisplay(absolutePath:...|
|`buildRuntimePathContext`|fn||137-140|export function buildRuntimePathContext(|
|`buildRuntimePathFacts`|fn||180-196|export function buildRuntimePathFacts(context: RuntimePat...|


---

# pi-notify.ts | TypeScript | 812L | 46 symbols | 7 imports | 59 comments
> Path: `src/core/pi-notify.ts`
- @brief Implements pi-usereq command-notify, terminal-beep, sound, and Pushover prompt-end helpers.
- @details Centralizes configuration defaults, status serialization, prompt-end outcome classification, placeholder substitution, detached shell-command execution, terminal bell emission, and native Pushover delivery. Runtime is O(m + c + b) in `agent_end` message count plus command length and Pushover payload size. Side effects include stdout writes, detached child-process spawning, and outbound HTTPS requests.

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
- @details Narrows prompt-end event classification and per-feature toggle routing to the canonical three-outcome domain. Compile-time only and introduces no runtime cost.
- type `export type PiNotifyPushoverPriority = (typeof PI_NOTIFY_PUSHOVER_PRIORITIES)[number];` (L98)
- @brief Represents one supported Pushover priority value.
- @details Narrows Pushover configuration parsing and request serialization to the canonical `0|1` priority domain. Compile-time only and introduces no runtime cost.
### iface `export interface PiNotifyEventRequest` (L104-109)
- @brief Describes one prompt-end request used for command-notify and Pushover substitution.
- @details Stores the prompt command name, raw prompt arguments, runtime base path, and final prompt duration required to resolve runtime placeholders. The interface is compile-time only and introduces no runtime cost.

- type `export type PiNotifyConfigFields = Pick<` (L115)
- @brief Describes the configuration fields consumed by pi-notify helpers.
- @details Narrows the full project config to the persisted notify, beep, sound, and Pushover fields used by status rendering, prompt-end routing, and shortcut toggles. Compile-time only and introduces no runtime cost.
- type `type PiNotifySpawn = typeof spawn;` (L149)
- @brief Describes the shell-spawn callback used by prompt-end command dispatch.
- @details Narrows the injected spawn surface so deterministic tests can capture detached shell invocations without patching global module state externally. Compile-time only and introduces no runtime cost.
- type `type PiNotifyStdoutWrite = (chunk: string) => boolean;` (L155)
- @brief Describes the stdout-write callback used by terminal-beep dispatch.
- @details Narrows the injected stdout surface so deterministic tests can capture bell emissions without relying on a real terminal device. Compile-time only and introduces no runtime cost.
### fn `let piNotifyStdoutWrite: PiNotifyStdoutWrite = (chunk) => process.stdout.write(chunk)` (L173-178)
- @brief Stores the currently configured stdout-write function used for terminal beeps.
- @details Defaults to `process.stdout.write` and can be replaced by deterministic tests so terminal bell emissions remain observable without writing to the live terminal. Access complexity is O(1). Side effect: mutated only through the dedicated test hook.

### fn `export function normalizePiNotifySoundLevel(value: unknown): PiNotifySoundLevel` (L182-186)
- @brief Normalizes one persisted sound level.
- @details Accepts only canonical `none|low|mid|high` values and falls back to `none` for missing or invalid payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Raw persisted sound-level payload.
- @return {PiNotifySoundLevel} Canonical sound level.
- @satisfies REQ-131

### fn `export function normalizePiNotifyShortcut(value: unknown): string` (L195-199)
- @brief Normalizes one persisted sound toggle shortcut.
- @details Accepts any non-empty string so project config can carry raw pi shortcut syntax and falls back to the canonical default when the payload is empty or invalid. Runtime is O(n) in shortcut length. No external state is mutated.
- @param[in] value {unknown} Raw persisted shortcut payload.
- @return {string} Canonical non-empty shortcut string.
- @satisfies REQ-134

### fn `export function normalizePiNotifyCommand(value: unknown, fallback: string): string` (L209-211)
- @brief Normalizes one persisted shell-command string.
- @details Accepts any non-empty string so project config can override bundled command templates verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in command length. No external state is mutated.
- @param[in] value {unknown} Raw persisted command payload.
- @param[in] fallback {string} Canonical fallback command.
- @return {string} Canonical non-empty command string.
- @satisfies REQ-133, REQ-175

### fn `export function normalizePiNotifyTemplateValue(value: unknown, fallback: string): string` (L221-223)
- @brief Normalizes one persisted template string.
- @details Accepts any non-empty string so Pushover title and text templates can be user-configured verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in template length. No external state is mutated.
- @param[in] value {unknown} Raw persisted template payload.
- @param[in] fallback {string} Canonical fallback template.
- @return {string} Canonical non-empty template string.
- @satisfies REQ-185

### fn `export function normalizePiNotifyPushoverCredential(value: unknown): string` (L232-234)
- @brief Normalizes one persisted Pushover credential string.
- @details Accepts any trimmed string so the project config can store raw Pushover user and token values verbatim and falls back to the empty string for missing or invalid payloads. Runtime is O(n) in credential length. No external state is mutated.
- @param[in] value {unknown} Raw persisted credential payload.
- @return {string} Canonical credential string.
- @satisfies REQ-163

### fn `export function normalizePiNotifyPushoverPriority(value: unknown): PiNotifyPushoverPriority` (L243-245)
- @brief Normalizes one persisted Pushover priority value.
- @details Accepts only canonical `0` and `1` values, treating numeric-string `"1"` as high priority and every other payload as normal priority. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Raw persisted priority payload.
- @return {PiNotifyPushoverPriority} Canonical priority value.
- @satisfies REQ-172

### fn `export function formatPiNotifyStatus(config: Pick<UseReqConfig, "notify-enabled">): string` (L254-256)
- @brief Formats the global command-notify flag for status rendering.
- @details Serializes only the persisted global command-notify enable state so the status bar reports `notify:on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-enabled">} Effective command-notify configuration subset.
- @return {string} `on` when command-notify is globally enabled; otherwise `off`.
- @satisfies REQ-135

### fn `export function formatPiNotifyBeepStatus(config: Pick<UseReqConfig, "notify-beep-enabled">): string` (L265-267)
- @brief Formats the global terminal-beep flag for status rendering.
- @details Serializes only the persisted global terminal-beep enable state so the status bar reports `beep:on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-beep-enabled">} Effective terminal-beep configuration subset.
- @return {string} `on` when terminal beep is globally enabled; otherwise `off`.
- @satisfies REQ-136

### fn `export function formatPiNotifyPushoverStatus(config: Pick<UseReqConfig, "notify-pushover-enabled">): string` (L276-278)
- @brief Formats the global Pushover flag for status rendering.
- @details Serializes only the persisted global Pushover enable state so the status bar reports `pushover:on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-pushover-enabled">} Effective Pushover configuration subset.
- @return {string} `on` when Pushover is globally enabled; otherwise `off`.
- @satisfies REQ-171

### fn `export function cyclePiNotifySoundLevel(currentLevel: PiNotifySoundLevel): PiNotifySoundLevel` (L287-293)
- @brief Cycles one sound level through the canonical shortcut order.
- @details Advances persisted sound state in the exact order `none -> low -> mid -> high -> none`, enabling deterministic shortcut toggling and menu reuse. Runtime is O(1). No external state is mutated.
- @param[in] currentLevel {PiNotifySoundLevel} Current persisted sound level.
- @return {PiNotifySoundLevel} Next sound level in the cycle.
- @satisfies REQ-134

### fn `function isPiNotifyOutcomeEnabled(` (L304-318)
- @brief Tests whether one outcome-specific toggle is enabled.
- @details Reuses the canonical `end|esc|err` routing order shared by notify, beep, sound, and Pushover event toggles. Runtime is O(1). No external state is mutated.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] endEnabled {boolean} Enabled state for successful completion.
- @param[in] escEnabled {boolean} Enabled state for escape-triggered abortion.
- @param[in] errEnabled {boolean} Enabled state for error termination.
- @return {boolean} `true` when the selected outcome flag is enabled.

### fn `function hasAgentEndStopReason(` (L327-337)
- @brief Detects whether one agent-end payload contains the requested stop reason.
- @details Scans assistant messages only so prompt-end classification remains stable even when user or tool-result messages also appear in the payload. Runtime is O(m) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Agent-end message list.
- @param[in] stopReason {"aborted" | "error"} Stop reason to detect.
- @return {boolean} `true` when an assistant message carries the requested stop reason.

### fn `export function classifyPiNotifyOutcome(event: Pick<AgentEndEvent, "messages">): PiNotifyOutcome` (L345-353)
- @brief Classifies one agent-end payload into the canonical pi-notify outcome.
- @details Treats assistant `stopReason=error` as `err`, `stopReason=aborted` as `esc`, and every remaining terminal state as successful `end`. Runtime is O(m) in message count. No external state is mutated.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @return {PiNotifyOutcome} Canonical prompt-end outcome.

### fn `function formatPiNotifyDuration(durationMs: number): string` (L362-367)
- @brief Formats one prompt-end duration for runtime placeholders.
- @details Floors the supplied duration to whole seconds, keeps minutes unbounded above 59, and zero-pads seconds to two digits so `%%TIME%%` aligns with status-bar elapsed formatting. Runtime is O(1). No external state is mutated.
- @param[in] durationMs {number} Prompt-end duration in milliseconds.
- @return {string} Duration rendered as `M:SS`.
- @satisfies REQ-187

### fn `function formatPiNotifyBasePath(basePath: string): string` (L376-387)
- @brief Formats one runtime base path for placeholder substitution.
- @details Emits `~` or `~/...` when the supplied path equals or descends from the current user home directory; otherwise emits the slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
- @param[in] basePath {string} Runtime base path.
- @return {string} Placeholder-ready base path string.
- @satisfies REQ-187

### fn `function buildPiNotifyRuntimeTemplateValues(` (L395-404)
- @brief Builds the raw runtime placeholder map for one prompt-end request.
- @details Resolves every placeholder value exactly once so notify-command and Pushover template substitution reuse the same prompt name, base path, elapsed time, and argument string. Runtime is O(p) in path length. No external state is mutated.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {{ "%%PROMT%%": string; "%%BASE%%": string; "%%TIME%%": string; "%%ARGS%%": string }} Raw placeholder-value map.

### fn `function quotePiNotifyInstallPath(installationPath: string): string` (L412-417)
- @brief Quotes one installation path for shell substitution.
- @details Emits POSIX single-quoted literals for `sh -lc` execution and CMD double-quoted literals for `cmd.exe /c` execution so `%%INSTALLATION_PATH%%` substitutions preserve whitespace safely. Runtime is O(n) in path length. No external state is mutated.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Shell-quoted installation path fragment.

### fn `function escapePiNotifyShellTemplateValue(value: string): string` (L425-434)
- @brief Escapes one placeholder value for double-quoted shell insertion.
- @details Escapes the characters interpreted specially by POSIX or CMD double-quoted strings so default notify-command templates remain safe when placeholders are embedded inside double quotes. Runtime is O(n) in value length. No external state is mutated.
- @param[in] value {string} Raw placeholder value.
- @return {string} Shell-escaped placeholder fragment without surrounding quotes.

### fn `export function substitutePiNotifyInstallPath(command: string, installationPath: string): string` (L444-449)
- @brief Substitutes `%%INSTALLATION_PATH%%` inside one shell command.
- @details Replaces every `%%INSTALLATION_PATH%%` token with a shell-quoted runtime installation path so bundled assets can be addressed safely from external commands. Runtime is O(n) in command length. No external state is mutated.
- @param[in] command {string} Raw configured shell command.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Runtime-ready command string.
- @satisfies REQ-169

### fn `function substitutePiNotifyShellTemplate(` (L460-471)
- @brief Substitutes runtime placeholders inside one shell-command template.
- @details Applies shell-quoted installation-path substitution plus shell-escaped prompt, base-path, elapsed-time, and raw-argument substitution expected by `PI_NOTIFY_CMD`. Runtime is O(n) in template length. No external state is mutated.
- @param[in] template {string} Raw shell-command template.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Runtime-ready shell command.
- @satisfies REQ-169

### fn `function substitutePiNotifyTextTemplate(` (L481-490)
- @brief Substitutes runtime placeholders inside one text template.
- @details Applies raw prompt name, home-relative base path, elapsed time, and raw prompt-argument substitution without shell escaping so Pushover payloads preserve literal text. Runtime is O(n) in template length. No external state is mutated.
- @param[in] template {string} Raw text template.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {string} Placeholder-resolved text string.
- @satisfies REQ-186, REQ-187

### fn `function runPiNotifyShellCommand(command: string): void` (L498-509)
- @brief Executes one detached shell command without waiting for completion.
- @details Uses the platform-default shell contract already employed by sound-command execution and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] command {string} Runtime-ready shell command.
- @return {void} No return value.

### fn `function runPiNotifyBeep(): void` (L517-519)
- @brief Emits one terminal bell control byte.
- @details Writes `\a` directly to stdout so terminal-beep delivery stays shell-free and deterministic across prompt-end outcomes. Runtime is O(1). Side effect: writes to stdout.
- @return {void} No return value.
- @satisfies REQ-130

### fn `function shouldRunPiNotifyCommand(` (L530-543)
- @brief Determines whether one prompt-end outcome should trigger command-notify.
- @details Requires a prompt-end request, the global command-notify enable flag, and the corresponding per-event notify toggle. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
- @return {boolean} `true` when command-notify prerequisites are satisfied.
- @satisfies REQ-174, REQ-176

### fn `function runPiNotifyCommand(` (L553-564)
- @brief Executes the configured command-notify shell command.
- @details Resolves the runtime installation path, substitutes runtime placeholders into `PI_NOTIFY_CMD`, and spawns the resulting command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {void} No return value.
- @satisfies REQ-169, REQ-175, REQ-176

### fn `function shouldRunPiNotifyBeep(` (L574-585)
- @brief Determines whether one prompt-end outcome should trigger terminal-beep.
- @details Requires the global terminal-beep enable flag and the corresponding per-event beep toggle. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {boolean} `true` when terminal-beep prerequisites are satisfied.
- @satisfies REQ-129, REQ-177

### fn `function resolvePiNotifySoundCommand(` (L594-606)
- @brief Resolves the configured command for one non-`none` sound level.
- @details Selects the matching persisted command string from config without performing runtime substitution or shell execution. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Non-disabled sound level.
- @return {string} Configured command string for the requested level.

### fn `function shouldRunPiNotifySound(` (L616-627)
- @brief Determines whether one prompt-end outcome should trigger sound-command execution.
- @details Requires a non-`none` sound level and the corresponding per-event sound toggle. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {boolean} `true` when sound-command prerequisites are satisfied.
- @satisfies REQ-178

### fn `export function runPiNotifySoundCommand(` (L637-644)
- @brief Executes the configured sound command on an external shell.
- @details Resolves the runtime installation path, substitutes `%%INSTALLATION_PATH%%`, and spawns the configured command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Requested non-disabled sound level.
- @return {void} No return value.
- @satisfies REQ-132, REQ-133

### fn `function shouldRunPiNotifyPushover(` (L655-670)
- @brief Determines whether one prompt-end outcome should trigger Pushover delivery.
- @details Requires a prompt-end request, the global Pushover enable flag, the corresponding per-event Pushover toggle, and non-empty user plus token credentials. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
- @return {boolean} `true` when Pushover delivery prerequisites are satisfied.
- @satisfies REQ-166, REQ-168, REQ-184

### fn `function buildPiNotifyPushoverTitle(` (L680-685)
- @brief Builds the Pushover notification title for one prompt-end request.
- @details Resolves the configured `notify-pushover-title` template with raw runtime placeholder substitution so the pushed title remains configurable and deterministic. Runtime is O(n) in template length. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {string} Pushover title string.
- @satisfies REQ-185, REQ-186, REQ-187

### fn `function buildPiNotifyPushoverBody(` (L695-700)
- @brief Builds the Pushover message body for one prompt-end request.
- @details Resolves the configured `notify-pushover-text` template with raw runtime placeholder substitution so the pushed text remains configurable and deterministic. Runtime is O(n) in template length. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {string} Pushover message body.
- @satisfies REQ-185, REQ-186, REQ-187

### fn `function buildPiNotifyPushoverPayload(` (L710-721)
- @brief Builds the Pushover API payload for one prompt-end request.
- @details Encodes the configured token, user key, substituted title, priority, and substituted text as `application/x-www-form-urlencoded` fields accepted by the Pushover Message API. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {URLSearchParams} Encoded Pushover request payload.
- @satisfies REQ-167, REQ-172, REQ-185, REQ-186

### fn `function runPiNotifyPushoverRequest(` (L731-749)
- @brief Dispatches one native HTTPS request to the Pushover Message API.
- @details Serializes the request body as URL-encoded form data, posts it to `https://api.pushover.net/1/messages.json`, drains the response, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by outbound I/O. Side effects include one HTTPS request.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {void} No return value.
- @satisfies REQ-167

### fn `export function setPiNotifyHttpsRequestForTests(requestImpl: typeof https.request | undefined): void` (L757-759)
- @brief Replaces the native HTTPS request function used for Pushover delivery in deterministic tests.
- @details Accepts a drop-in `node:https.request` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local Pushover transport hook.
- @param[in] requestImpl {typeof https.request | undefined} Replacement HTTPS request function.
- @return {void} No return value.

### fn `export function setPiNotifySpawnForTests(spawnImpl: PiNotifySpawn | undefined): void` (L767-769)
- @brief Replaces the shell-spawn function used for notify and sound commands in deterministic tests.
- @details Accepts a drop-in `node:child_process.spawn` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local shell transport hook.
- @param[in] spawnImpl {PiNotifySpawn | undefined} Replacement shell-spawn function.
- @return {void} No return value.

### fn `export function setPiNotifyStdoutWriteForTests(writeImpl: PiNotifyStdoutWrite | undefined): void` (L777-779)
- @brief Replaces the stdout-write function used for terminal-beep delivery in deterministic tests.
- @details Accepts a drop-in bell-writer replacement and restores the native stdout writer when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local stdout transport hook.
- @param[in] writeImpl {PiNotifyStdoutWrite | undefined} Replacement stdout-write function.
- @return {void} No return value.

### fn `export function runPiNotifyEffects(` (L790-812)
- @brief Dispatches prompt-end notify, beep, sound, and Pushover effects for one agent-end payload.
- @details Classifies the terminal outcome, emits a terminal bell when the global beep flag and the matching event toggle are enabled, executes `PI_NOTIFY_CMD` when command-notify prerequisites are satisfied, executes the configured sound command when sound prerequisites are satisfied, and dispatches the native Pushover request when Pushover prerequisites are satisfied. Runtime is O(m + c + b) in message count, command length, and Pushover payload size. Side effects include stdout writes, child-process spawning, and outbound HTTPS requests.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @param[in] request {PiNotifyEventRequest | undefined} Optional prompt-end request metadata used for command-notify and Pushover substitution.
- @return {void} No return value.
- @satisfies REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-177, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiNotifySoundLevel`|type||25||
|`PiNotifyOutcome`|type||37||
|`PiNotifyPushoverPriority`|type||98||
|`PiNotifyEventRequest`|iface||104-109|export interface PiNotifyEventRequest|
|`PiNotifyConfigFields`|type||115||
|`PiNotifySpawn`|type||149||
|`PiNotifyStdoutWrite`|type||155||
|`piNotifyStdoutWrite`|fn||173-178|let piNotifyStdoutWrite: PiNotifyStdoutWrite = (chunk) =>...|
|`normalizePiNotifySoundLevel`|fn||182-186|export function normalizePiNotifySoundLevel(value: unknow...|
|`normalizePiNotifyShortcut`|fn||195-199|export function normalizePiNotifyShortcut(value: unknown)...|
|`normalizePiNotifyCommand`|fn||209-211|export function normalizePiNotifyCommand(value: unknown, ...|
|`normalizePiNotifyTemplateValue`|fn||221-223|export function normalizePiNotifyTemplateValue(value: unk...|
|`normalizePiNotifyPushoverCredential`|fn||232-234|export function normalizePiNotifyPushoverCredential(value...|
|`normalizePiNotifyPushoverPriority`|fn||243-245|export function normalizePiNotifyPushoverPriority(value: ...|
|`formatPiNotifyStatus`|fn||254-256|export function formatPiNotifyStatus(config: Pick<UseReqC...|
|`formatPiNotifyBeepStatus`|fn||265-267|export function formatPiNotifyBeepStatus(config: Pick<Use...|
|`formatPiNotifyPushoverStatus`|fn||276-278|export function formatPiNotifyPushoverStatus(config: Pick...|
|`cyclePiNotifySoundLevel`|fn||287-293|export function cyclePiNotifySoundLevel(currentLevel: PiN...|
|`isPiNotifyOutcomeEnabled`|fn||304-318|function isPiNotifyOutcomeEnabled(|
|`hasAgentEndStopReason`|fn||327-337|function hasAgentEndStopReason(|
|`classifyPiNotifyOutcome`|fn||345-353|export function classifyPiNotifyOutcome(event: Pick<Agent...|
|`formatPiNotifyDuration`|fn||362-367|function formatPiNotifyDuration(durationMs: number): string|
|`formatPiNotifyBasePath`|fn||376-387|function formatPiNotifyBasePath(basePath: string): string|
|`buildPiNotifyRuntimeTemplateValues`|fn||395-404|function buildPiNotifyRuntimeTemplateValues(|
|`quotePiNotifyInstallPath`|fn||412-417|function quotePiNotifyInstallPath(installationPath: strin...|
|`escapePiNotifyShellTemplateValue`|fn||425-434|function escapePiNotifyShellTemplateValue(value: string):...|
|`substitutePiNotifyInstallPath`|fn||444-449|export function substitutePiNotifyInstallPath(command: st...|
|`substitutePiNotifyShellTemplate`|fn||460-471|function substitutePiNotifyShellTemplate(|
|`substitutePiNotifyTextTemplate`|fn||481-490|function substitutePiNotifyTextTemplate(|
|`runPiNotifyShellCommand`|fn||498-509|function runPiNotifyShellCommand(command: string): void|
|`runPiNotifyBeep`|fn||517-519|function runPiNotifyBeep(): void|
|`shouldRunPiNotifyCommand`|fn||530-543|function shouldRunPiNotifyCommand(|
|`runPiNotifyCommand`|fn||553-564|function runPiNotifyCommand(|
|`shouldRunPiNotifyBeep`|fn||574-585|function shouldRunPiNotifyBeep(|
|`resolvePiNotifySoundCommand`|fn||594-606|function resolvePiNotifySoundCommand(|
|`shouldRunPiNotifySound`|fn||616-627|function shouldRunPiNotifySound(|
|`runPiNotifySoundCommand`|fn||637-644|export function runPiNotifySoundCommand(|
|`shouldRunPiNotifyPushover`|fn||655-670|function shouldRunPiNotifyPushover(|
|`buildPiNotifyPushoverTitle`|fn||680-685|function buildPiNotifyPushoverTitle(|
|`buildPiNotifyPushoverBody`|fn||695-700|function buildPiNotifyPushoverBody(|
|`buildPiNotifyPushoverPayload`|fn||710-721|function buildPiNotifyPushoverPayload(|
|`runPiNotifyPushoverRequest`|fn||731-749|function runPiNotifyPushoverRequest(|
|`setPiNotifyHttpsRequestForTests`|fn||757-759|export function setPiNotifyHttpsRequestForTests(requestIm...|
|`setPiNotifySpawnForTests`|fn||767-769|export function setPiNotifySpawnForTests(spawnImpl: PiNot...|
|`setPiNotifyStdoutWriteForTests`|fn||777-779|export function setPiNotifyStdoutWriteForTests(writeImpl:...|
|`runPiNotifyEffects`|fn||790-812|export function runPiNotifyEffects(|


---

# pi-usereq-tools.ts | TypeScript | 140L | 5 symbols | 0 imports | 14 comments
> Path: `src/core/pi-usereq-tools.ts`
- @brief Declares the configurable pi-usereq active-tool inventory.
- @details Provides canonical custom-tool names, supported embedded-tool names, default enablement subsets, and normalization helpers shared by configuration loading, extension startup, and test doubles. The module is side-effect free. Lookup and normalization costs are linear in configured tool count.

## Definitions

- type `export type PiUsereqCustomToolName = (typeof PI_USEREQ_CUSTOM_TOOL_NAMES)[number];` (L83)
- @brief Represents one valid extension-owned configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_CUSTOM_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqEmbeddedToolName = (typeof PI_USEREQ_EMBEDDED_TOOL_NAMES)[number];` (L89)
- @brief Represents one valid embedded configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_EMBEDDED_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];` (L95)
- @brief Represents one valid configurable active-tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_STARTUP_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
### fn `export function isPiUsereqEmbeddedToolName(name: string): name is PiUsereqEmbeddedToolName` (L121-123)
- @brief Tests whether one tool name belongs to the supported embedded-tool subset.
- @details Performs one set-membership probe against `PI_USEREQ_EMBEDDED_TOOL_SET`. Runtime is O(1). No external state is mutated.
- @param[in] name {string} Candidate tool name.
- @return {boolean} `true` when the name belongs to the embedded configurable-tool subset.

### fn `export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[]` (L133-140)
- @brief Normalizes a user-configured active-tool list.
- @details Returns the default enabled-tool tuple when the input is not an array. Otherwise filters to string entries, removes names outside the configurable tool set, and deduplicates while preserving first-seen order. Time complexity is O(n). No external state is mutated.
- @param[in] value {unknown} Raw configuration payload for `enabled-tools`.
- @return {PiUsereqStartupToolName[]} Deduplicated canonical tool names.
- @satisfies REQ-064
- @post Returned values are members of `PI_USEREQ_STARTUP_TOOL_NAMES` only.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqCustomToolName`|type||83||
|`PiUsereqEmbeddedToolName`|type||89||
|`PiUsereqStartupToolName`|type||95||
|`isPiUsereqEmbeddedToolName`|fn||121-123|export function isPiUsereqEmbeddedToolName(name: string):...|
|`normalizeEnabledPiUsereqTools`|fn||133-140|export function normalizeEnabledPiUsereqTools(value: unkn...|


---

# prompts.ts | TypeScript | 184L | 5 symbols | 4 imports | 11 comments
> Path: `src/core/prompts.ts`
- @brief Renders bundled pi-usereq prompts for the current project context.
- @details Applies placeholder substitution, legacy tool-name rewrites, and conditional pi.dev conformance guidance before prompt text is sent to the agent. Runtime is linear in prompt size plus replacement count. Side effects are limited to filesystem reads used for manifest checks and bundled prompt loading.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { buildPromptReplacementPaths, type UseReqConfig } from "./config.js";
import { readBundledPrompt } from "./resources.js";
```

## Definitions

### fn `function buildPiDevConformanceBlock(promptName: string, projectBase: string): string` (L96-105)
- @brief Builds the conditional pi.dev conformance block for one rendered prompt.
- @details Emits the manifest-driven rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the pi.dev manifest. Time complexity O(1). No filesystem writes.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Markdown bullet block or the empty string when injection is not applicable.
- @satisfies REQ-032, REQ-033, REQ-034, REQ-108

### fn `function injectPiDevConformanceBlock(text: string, promptName: string, projectBase: string): string` (L116-123)
- @brief Injects the pi.dev conformance block into the prompt behavior section.
- @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Prompt markdown with zero or one injected conformance block.
- @satisfies REQ-032, REQ-033, REQ-034, REQ-108

### fn `export function adaptPromptForInternalTools(text: string): string` (L132-138)
- @brief Rewrites bundled prompt tool references from legacy `req --...` syntax to internal tool names.
- @details Applies deterministic global regex replacements so prompt text matches the extension-registered tool surface instead of the standalone CLI spelling. Time complexity O(p*r) where p is pattern count and r is prompt length.
- @param[in] text {string} Prompt markdown before tool-reference normalization.
- @return {string} Prompt markdown with internal tool names.
- @satisfies REQ-003

### fn `export function applyReplacements(text: string, replacements: Record<string, string>): string` (L148-154)
- @brief Applies literal placeholder replacements to bundled prompt markdown.
- @details Replaces every placeholder token using split/join semantics so all occurrences are updated without regex escaping. Time complexity O(t*n) where t is replacement count and n is prompt length.
- @param[in] text {string} Prompt markdown containing placeholder tokens.
- @param[in] replacements {Record<string, string>} Token-to-value map.
- @return {string} Prompt markdown with all placeholder tokens expanded.
- @satisfies REQ-002

### fn `export function renderPrompt(` (L166-184)
- @brief Renders a bundled prompt for the current project context.
- @details Loads the bundled markdown template, expands configuration-derived placeholders, injects conditional pi.dev conformance guidance, and rewrites legacy tool references to internal names. Time complexity O(n) relative to prompt size. No tracked files are modified.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder and manifest resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @return {string} Fully rendered prompt markdown ready for `pi.sendUserMessage(...)`.
- @satisfies REQ-002, REQ-003, REQ-032, REQ-033, REQ-034, REQ-108

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`buildPiDevConformanceBlock`|fn||96-105|function buildPiDevConformanceBlock(promptName: string, p...|
|`injectPiDevConformanceBlock`|fn||116-123|function injectPiDevConformanceBlock(text: string, prompt...|
|`adaptPromptForInternalTools`|fn||132-138|export function adaptPromptForInternalTools(text: string)...|
|`applyReplacements`|fn||148-154|export function applyReplacements(text: string, replaceme...|
|`renderPrompt`|fn||166-184|export function renderPrompt(|


---

# reference-payload.ts | TypeScript | 810L | 28 symbols | 5 imports | 27 comments
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

### iface `export interface ReferenceToolFileEntry extends ReferenceLineRange` : ReferenceLineRange (L102-125)
- @brief Describes one per-file references payload entry.
- @details Stores canonical path identity, filesystem status, line metrics, structured imports, structured symbols, structured comment evidence, and optional file-level Doxygen metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolRequestSection` (L131-140)
- @brief Describes the request section of the references payload.
- @details Captures tool identity, scope, base directory, requested path inventory, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolSummarySection` (L146-157)
- @brief Describes the summary section of the references payload.
- @details Exposes aggregate file, symbol, import, comment, and Doxygen counts as numeric fields plus deterministic symbol-kind totals. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceRepositoryTreeNode` (L163-169)
- @brief Describes one repository tree node in the references payload.
- @details Encodes directory and file hierarchy without ASCII-art decoration so agents can traverse repository structure as structured JSON. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolRepositorySection` (L175-181)
- @brief Describes the repository section of the references payload.
- @details Stores the base path, configured source-directory scope, canonical file list, and structured directory tree used during analysis. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolPayload` (L187-191)
- @brief Describes the full agent-oriented references payload.
- @details Exposes only aggregate analysis totals, repository structure, and per-file reference records, omitting request echoes that are already known to the caller or encoded in the tool registration. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildReferenceToolPayloadOptions` (L197-204)
- @brief Describes the options required to build one references payload.
- @details Supplies tool identity, scope, base directory, requested paths, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeReferencePath(targetPath: string, baseDir: string): string` (L213-221)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): ReferenceLineRange` (L230-236)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {ReferenceLineRange} Structured line-range record.

### fn `function extractCommentText(commentElement: SourceElement, maxLength = 0): string` (L245-265)
- @brief Extracts normalized plain text from one comment element.
- @details Removes language comment markers, drops delimiter-only lines, joins content with spaces, and optionally truncates the result. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @param[in] maxLength {number} Optional maximum output length; `0` disables truncation.
- @return {string} Cleaned comment text.

### fn `function extractCommentLines(commentElement: SourceElement): string[]` (L273-287)
- @brief Extracts cleaned individual lines from one comment element.
- @details Removes language comment markers while preserving line granularity for structured comment payloads. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @return {string[]} Cleaned comment lines.

### fn `function buildCommentMaps(elements: SourceElement[]): [Record<number, SourceElement[]>, SourceElement[], string]` (L295-345)
- @brief Associates nearby comment blocks with definitions and standalone comment groups.
- @details Reuses the repository comment-attachment heuristic that binds comments within three lines of a definition while preserving early file-description text. Runtime is O(n log n). No side effects occur.
- @param[in] elements {SourceElement[]} Analyzed source elements.
- @return {[Record<number, SourceElement[]>, SourceElement[], string]} Attached-comment map, standalone comments, and compact file description.

### fn `function resolveSymbolName(element: SourceElement): string` (L353-355)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every symbol retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], child: SourceElement): SourceElement | undefined` (L364-373)
- @brief Resolves the direct parent element for one child symbol.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] child {SourceElement} Candidate child symbol.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function buildCommentEntry(commentElement: SourceElement): ReferenceCommentEntry` (L381-388)
- @brief Builds one structured comment record from a comment element.
- @details Preserves numeric line-range metadata plus normalized text and per-line fragments. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Source comment element.
- @return {ReferenceCommentEntry} Structured comment record.

### fn `function buildRepositoryTree(canonicalPaths: string[]): ReferenceRepositoryTreeNode` (L396-455)
- @brief Builds one structured repository tree from canonical file paths.
- @details Materializes a nested directory map and converts it into recursively ordered JSON nodes without decorative ASCII formatting. Runtime is O(n log n) in path count. No side effects occur.
- @param[in] canonicalPaths {string[]} Canonical file paths.
- @return {ReferenceRepositoryTreeNode} Structured repository tree rooted at `.`.

### fn `const ensureDirectory = (parent: ReferenceRepositoryTreeNode, nodeName: string, relativePath: string): ReferenceRepositoryTreeNode =>` (L405-419)

### fn `const finalizeNode = (node: ReferenceRepositoryTreeNode): ReferenceRepositoryTreeNode =>` (L441-452)

### fn `function analyzeReferenceFile(` (L468-661)
- @brief Builds one analyzed file entry for the references payload.
- @details Parses the file with `SourceAnalyzer`, extracts structured imports and symbols, attaches structured Doxygen fields, and preserves standalone comment evidence. Runtime is O(S log S) in file size and symbol count. Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] analyzer {SourceAnalyzer} Shared source analyzer instance.
- @param[in] inputPath {string} Caller-provided input path.
- @param[in] absolutePath {string} Absolute file path.
- @param[in] requestIndex {number} Zero-based request index.
- @param[in] baseDir {string} Base directory used for canonical paths.
- @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
- @return {ReferenceToolFileEntry} Structured file entry.

### fn `export function buildReferenceToolPayload(options: BuildReferenceToolPayloadOptions): ReferenceToolPayload` (L670-788)
- @brief Builds the full agent-oriented references payload.
- @details Validates requested paths against the filesystem, analyzes processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits structured repository data without echoing request metadata already known to the caller. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildReferenceToolPayloadOptions} Payload-construction options.
- @return {ReferenceToolPayload} Structured references payload ordered as summary, repository, and files.
- @satisfies REQ-011, REQ-014, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function buildReferenceToolExecutionStderr(payload: ReferenceToolPayload): string` (L796-810)
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
|`ReferenceToolFileEntry`|iface||102-125|export interface ReferenceToolFileEntry extends Reference...|
|`ReferenceToolRequestSection`|iface||131-140|export interface ReferenceToolRequestSection|
|`ReferenceToolSummarySection`|iface||146-157|export interface ReferenceToolSummarySection|
|`ReferenceRepositoryTreeNode`|iface||163-169|export interface ReferenceRepositoryTreeNode|
|`ReferenceToolRepositorySection`|iface||175-181|export interface ReferenceToolRepositorySection|
|`ReferenceToolPayload`|iface||187-191|export interface ReferenceToolPayload|
|`BuildReferenceToolPayloadOptions`|iface||197-204|export interface BuildReferenceToolPayloadOptions|
|`canonicalizeReferencePath`|fn||213-221|function canonicalizeReferencePath(targetPath: string, ba...|
|`buildLineRange`|fn||230-236|function buildLineRange(startLineNumber: number, endLineN...|
|`extractCommentText`|fn||245-265|function extractCommentText(commentElement: SourceElement...|
|`extractCommentLines`|fn||273-287|function extractCommentLines(commentElement: SourceElemen...|
|`buildCommentMaps`|fn||295-345|function buildCommentMaps(elements: SourceElement[]): [Re...|
|`resolveSymbolName`|fn||353-355|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||364-373|function resolveParentElement(definitions: SourceElement[...|
|`buildCommentEntry`|fn||381-388|function buildCommentEntry(commentElement: SourceElement)...|
|`buildRepositoryTree`|fn||396-455|function buildRepositoryTree(canonicalPaths: string[]): R...|
|`ensureDirectory`|fn||405-419|const ensureDirectory = (parent: ReferenceRepositoryTreeN...|
|`finalizeNode`|fn||441-452|const finalizeNode = (node: ReferenceRepositoryTreeNode):...|
|`analyzeReferenceFile`|fn||468-661|function analyzeReferenceFile(|
|`buildReferenceToolPayload`|fn||670-788|export function buildReferenceToolPayload(options: BuildR...|
|`buildReferenceToolExecutionStderr`|fn||796-810|export function buildReferenceToolExecutionStderr(payload...|


---

# resources.ts | TypeScript | 63L | 4 symbols | 3 imports | 5 comments
> Path: `src/core/resources.ts`
- @brief Resolves installation-owned bundled resource locations.
- @details Encapsulates installation-path discovery, bundled-resource validation, prompt enumeration, and prompt loading directly from the installed extension payload. Runtime is proportional to directory-entry enumeration and prompt file size. Side effects are limited to filesystem reads.

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
- @details Verifies that the installation-owned resource root plus `prompts`, `templates`, and `guidelines` directories exist before prompt or tool execution. Runtime is O(1) plus bounded filesystem metadata checks. Side effects are limited to filesystem reads.
- @return {string} Absolute bundled resource root path.
- @throws {Error} Propagates a deterministic error when required installed resource directories are missing.

### fn `export function readBundledPrompt(promptName: string): string` (L47-50)
- @brief Reads one bundled markdown prompt by logical prompt name.
- @details Resolves the prompt file under the installation-owned `resources/prompts` directory, validates resource accessibility, and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] promptName {string} Prompt identifier without the `.md` suffix.
- @return {string} Raw prompt markdown content.
- @throws {Error} Propagates `fs.readFileSync` errors when the prompt file is missing or unreadable.

### fn `export function listBundledPromptNames(): string[]` (L57-63)
- @brief Lists bundled prompt identifiers available in the installed extension payload.
- @details Scans the installation-owned prompt directory, keeps visible markdown files only, strips the `.md` suffix, and returns a lexicographically sorted list. Time complexity is O(n log n). Side effects are limited to filesystem reads.
- @return {string[]} Sorted prompt names without file extensions.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getBundledResourceRoot`|fn||16-18|export function getBundledResourceRoot(): string|
|`ensureBundledResourcesAccessible`|fn||26-38|export function ensureBundledResourcesAccessible(): string|
|`readBundledPrompt`|fn||47-50|export function readBundledPrompt(promptName: string): st...|
|`listBundledPromptNames`|fn||57-63|export function listBundledPromptNames(): string[]|


---

# runtime-project-paths.ts | TypeScript | 70L | 4 symbols | 4 imports | 5 comments
> Path: `src/core/runtime-project-paths.ts`
- @brief Derives runtime-only repository facts.
- @details Centralizes git-repository probing and repository-root resolution for extension status, tool execution, and CLI flows. Runtime is dominated by git subprocess execution plus path normalization. Side effects are limited to subprocess spawning.

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

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`runGitCapture`|fn||19-24|function runGitCapture(command: string[], cwd?: string): ...|
|`isInsideGitRepo`|fn||33-36|export function isInsideGitRepo(targetPath: string): boolean|
|`resolveGitRoot`|fn||46-52|export function resolveGitRoot(targetPath: string): string|
|`resolveRuntimeGitPath`|fn||61-68|export function resolveRuntimeGitPath(executionPath: stri...|


---

# settings-menu.ts | TypeScript | 238L | 11 symbols | 2 imports | 12 comments
> Path: `src/core/settings-menu.ts`
- @brief Renders pi-usereq configuration menus with the shared pi.dev settings style.
- @details Wraps `SettingsList` in one extension-command helper that exposes right-aligned current values, built-in circular scrolling, bottom-line descriptions, and a deterministic bridge for offline test harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.

## Imports
```
import { getSettingsListTheme, type ThemeColor, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type Component, type SettingItem, type SettingsListTheme } from "@mariozechner/pi-tui";
```

## Definitions

### iface `export interface PiUsereqSettingsMenuChoice` (L14-20)
- @brief Describes one selectable pi-usereq settings-menu choice.
- @details Stores the stable action identifier, left-column label, right-column current value, optional value-tone override, and bottom-line description consumed by the shared settings-menu renderer. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqSettingsMenuBridge` (L26-31)
- @brief Describes the offline bridge exposed by shared settings-menu components.
- @details Lets deterministic harnesses and unit tests drive the same settings-menu choices by label without simulating raw terminal key streams. The interface is runtime-facing but carries no side effects by itself.

### iface `export interface PiUsereqSettingsMenuComponent extends Component` : Component (L37-39)
- @brief Represents a custom menu component augmented with the offline bridge.
- @details Extends the generic TUI `Component` contract with one optional bridge field consumed only by deterministic test and debug harness adapters. The interface is compile-time only and introduces no runtime cost.

- type `type PiUsereqSettingsThemeColor = Extract<ThemeColor, "accent" | "muted" | "dim">;` (L47)
- @brief Enumerates the CLI-supported theme tokens consumed by settings menus.
- @details Narrows callback-local theme calls to the documented settings-list
semantics used by the pi CLI. Compile-time only and introduces no runtime
cost.
### iface `interface PiUsereqSettingsTheme` (L56-59)
- @brief Describes the callback-local theme surface required by settings menus.
- @details Captures the subset of the custom-UI theme API needed to rebuild
title and fallback settings-list styling when the shared global theme is not
available in tests or offline replay. Compile-time only and introduces no
runtime cost.

### fn `function buildFallbackPiUsereqSettingsListTheme(` (L71-83)
- @brief Builds the fallback settings-list theme matching CLI settings semantics.
- @details Mirrors the shared CLI settings theme token mapping for labels,
values, descriptions, cursor, and hints while avoiding the global theme
singleton used by the live pi runtime. Runtime is O(1). No external state is
mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Fallback settings-list theme.
- @satisfies REQ-151, REQ-156

### fn `function buildPiUsereqSettingsListTheme(` (L96-110)
- @brief Resolves the settings-list theme used by pi-usereq configuration menus.
- @details Prefers the shared CLI `getSettingsListTheme()` API so extension
menus inherit active-theme behavior from pi itself, then falls back to an
equivalent callback-local mapping when the shared theme singleton is
unavailable in deterministic tests or offline replay. Runtime is O(1). No
external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Settings-list theme used by pi-usereq menus.
- @satisfies REQ-151, REQ-156

### fn `function formatPiUsereqSettingsMenuTitle(` (L122-127)
- @brief Formats the settings-menu title with active-theme semantics.
- @details Applies the callback-local `accent` token and bold styling on every
rebuild so custom-menu titles stay synchronized with live theme changes.
Runtime is O(n) in title length. No external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @param[in] title {string} Menu title.
- @return {string} Styled title text.
- @satisfies REQ-151, REQ-156

### fn `function createImmediateSelectionComponent(choiceId: string, done: (value?: string) => void): Component` (L136-148)
- @brief Closes a settings menu immediately with one selected action identifier.
- @details Provides the submenu callback used by `SettingsList` so pressing Enter on any menu row resolves the outer custom UI promise with the row identifier. Runtime is O(1). Side effects are limited to one custom-UI completion callback.
- @param[in] choiceId {string} Stable choice identifier to emit.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {Component} Immediate-completion submenu component.

### fn `function buildSettingItems(` (L158-172)
- @brief Builds `SettingsList` items from one menu-choice vector.
- @details Copies labels, current values, value-tone overrides, and descriptions into `SettingItem` records and attaches a submenu that resolves the outer custom UI with the selected choice identifier. Runtime is O(n) in choice count. No external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {SettingItem[]} `SettingsList` item vector.

### fn `export async function showPiUsereqSettingsMenu(` (L183-238)
- @brief Renders one shared pi-usereq settings menu and resolves the selected action.
- @details Uses `ctx.ui.custom(...)` plus `SettingsList` so every configuration menu shares pi.dev styling, right-aligned current values, circular scrolling, and bottom-line descriptions. The returned custom component also exposes an offline bridge for deterministic tests and debug harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] title {string} Menu title displayed in the heading and offline bridge.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @return {Promise<string | undefined>} Selected choice identifier or `undefined` when cancelled.
- @satisfies REQ-151, REQ-152, REQ-153, REQ-154, REQ-156

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqSettingsMenuChoice`|iface||14-20|export interface PiUsereqSettingsMenuChoice|
|`PiUsereqSettingsMenuBridge`|iface||26-31|export interface PiUsereqSettingsMenuBridge|
|`PiUsereqSettingsMenuComponent`|iface||37-39|export interface PiUsereqSettingsMenuComponent extends Co...|
|`PiUsereqSettingsThemeColor`|type||47||
|`PiUsereqSettingsTheme`|iface||56-59|interface PiUsereqSettingsTheme|
|`buildFallbackPiUsereqSettingsListTheme`|fn||71-83|function buildFallbackPiUsereqSettingsListTheme(|
|`buildPiUsereqSettingsListTheme`|fn||96-110|function buildPiUsereqSettingsListTheme(|
|`formatPiUsereqSettingsMenuTitle`|fn||122-127|function formatPiUsereqSettingsMenuTitle(|
|`createImmediateSelectionComponent`|fn||136-148|function createImmediateSelectionComponent(choiceId: stri...|
|`buildSettingItems`|fn||158-172|function buildSettingItems(|
|`showPiUsereqSettingsMenu`|fn||183-238|export async function showPiUsereqSettingsMenu(|


---

# source-analyzer.ts | TypeScript | 1721L | 18 symbols | 4 imports | 38 comments
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

### fn `export function formatMarkdown(` (L1469-1722)
- @brief Renders analyzed source elements as the repository reference-markdown format.
- @details Builds file metadata, imports, top-level definitions, child elements, comments, and a symbol index while incorporating Doxygen fields and optional legacy annotations. Runtime is O(n log n) in element count. No side effects occur.
- @param[in] elements {SourceElement[]} Enriched source elements.
- @param[in] filePath {string} Display file path.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] specName {string} Human-readable language name.
- @param[in] totalLines {number} Total source-line count.
- @param[in] includeLegacyAnnotations {boolean} When `true`, include non-Doxygen comment annotations.
- @return {string} Rendered markdown document for the file.

### fn `function renderBodyAnnotations(` (L1695-1721)
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
|`formatMarkdown`|fn||1469-1722|export function formatMarkdown(|
|`renderBodyAnnotations`|fn||1695-1721|function renderBodyAnnotations(|


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

# token-counter.ts | TypeScript | 611L | 28 symbols | 5 imports | 34 comments
> Path: `src/core/token-counter.ts`
- @brief Provides token, size, and structure counting utilities for agent-oriented file payloads.
- @details Wraps `js-tiktoken` encoding lookup, extracts per-file structural facts, and builds machine-oriented JSON payloads for token-centric tools. Runtime is linear in processed text size plus sort cost for derived ordering hints. Side effects are limited to filesystem reads in file-based helpers.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
import { detectLanguage as detectSourceLanguage } from "./compress.js";
import { parseDoxygenComment, type DoxygenFieldMap } from "./doxygen-parser.js";
```

## Definitions

- type `export type TokenToolScope = "explicit-files" | "canonical-docs";` (L23)
- @brief Enumerates supported token-payload scopes.
- @details Distinguishes explicit-file requests from canonical-document requests while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type TokenFileStatus = "counted" | "error" | "skipped";` (L29)
- @brief Enumerates supported per-file token-entry statuses.
- @details Separates counted files, read-time failures, and skipped inputs so downstream agents can branch without reparsing text diagnostics. The alias is compile-time only and introduces no runtime cost.
### iface `export interface CountFileMetricsResult` (L35-48)
- @brief Describes one per-file token metric record.
- @details Stores canonical file identity plus numeric token, character, byte, and line metrics extracted from one readable file. Optional metadata remains isolated in dedicated fields so agents can access headings and Doxygen fields without reparsing monolithic text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolFileEntry` (L54-77)
- @brief Describes one file entry in the agent-oriented token payload.
- @details Orders direct-access path identifiers before source facts and numeric metrics so agents can branch without reparsing formatted strings. Optional metadata captures markdown headings or Doxygen file fields when they can be derived from the source content. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolRequestSection` (L83-93)
- @brief Describes the request section of the agent-oriented token payload.
- @details Captures tool identity, scope, path-resolution base, encoding, and requested path inventories so agents can reason about how metrics were selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolSummarySection` (L99-112)
- @brief Describes the summary section of the agent-oriented token payload.
- @details Exposes aggregate counts, sizes, totals, and per-file averages as numeric fields with explicit units so agents can branch on totals without reparsing formatted strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolPathIssue` (L118-122)
- @brief Describes one skipped-input or read-error observation.
- @details Preserves both the caller-provided path and the canonicalized path plus a stable machine-readable reason string. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolDominantFileObservation` (L128-132)
- @brief Describes the dominant counted file for one metric ordering.
- @details Exposes the canonical path plus the numeric token metrics that justify why the file dominates the current context budget. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolSourceObservationsSection` (L138-144)
- @brief Describes the source-observation subsection of the guidance payload.
- @details Separates measured ordering facts and path issues from derived recommendations so agents can reason about raw observations independently. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolRecommendation` (L150-154)
- @brief Describes one derived recommendation in the guidance payload.
- @details Provides a stable recommendation kind, the basis metric used to derive it, and the ordered path list the agent can follow directly. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolNextStepHint` (L160-164)
- @brief Describes one actionable next-step hint in the guidance payload.
- @details Supplies a stable hint kind, a focused ordered path subset, and the goal the agent can apply without reparsing surrounding prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolGuidanceSection` (L170-174)
- @brief Describes the guidance section of the agent-oriented token payload.
- @details Separates source observations, derived recommendations, and actionable next-step hints so downstream agents can choose between raw evidence and planning heuristics without reparsing mixed prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolPayload` (L180-183)
- @brief Describes the full agent-oriented token payload.
- @details Exposes only aggregate numeric totals plus per-file metrics, omitting request echoes and derived guidance that can be inferred from tool registration or recomputed by the caller. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildTokenToolPayloadOptions` (L189-197)
- @brief Describes the options required to build one agent-oriented token payload.
- @details Supplies tool identity, scope, path base, requested paths, and optional canonical-doc metadata while keeping counting behavior configurable through a stable object contract. The interface is compile-time only and introduces no runtime cost.

### class `export class TokenCounter` (L203-243)
- @brief Encapsulates one tokenizer instance for repeated token counting.
- @brief Stores the tokenizer implementation used for subsequent counts.
- @details Caches a `js-tiktoken` encoding object so multiple documents can be counted without repeated encoding lookup. Counting cost is O(n) in content length. The class mutates only instance state during construction.
- @details The field holds the encoder returned by `getEncoding`. Access complexity is O(1). The value is initialized once per instance.

### fn `function canonicalizeTokenPath(filePath: string, baseDir: string): string` (L252-260)
- @brief Converts one filesystem path into the canonical token-payload path form.
- @details Emits a slash-normalized relative path when the target is under the supplied base directory; otherwise emits a slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
- @param[in] filePath {string} Candidate absolute or relative filesystem path.
- @param[in] baseDir {string} Reference directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function countLines(content: string): number` (L268-274)
- @brief Counts logical lines in one text payload.
- @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
- @param[in] content {string} Text payload.
- @return {number} Logical line count; `0` for empty content.

### fn `function stripMarkdownFrontMatter(content: string): string` (L282-285)
- @brief Strips YAML front matter from markdown content before heading extraction.
- @details Removes the first `--- ... ---` block only when it appears at the file start so heading detection can operate on semantic markdown content instead of metadata. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} Markdown payload.
- @return {string} Markdown body without the leading front matter block.

### fn `function extractPrimaryHeadingText(content: string, filePath: string): string | undefined` (L294-301)
- @brief Extracts the first level-one markdown heading when present.
- @details Restricts extraction to markdown-like files, skips YAML front matter, and returns the first `# ` heading payload without surrounding whitespace. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} File content.
- @param[in] filePath {string} Source path used for extension-based markdown detection.
- @return {string | undefined} First heading text, or `undefined` when absent or the file is not markdown-like.

### fn `function inferLanguageName(filePath: string): string | undefined` (L309-318)
- @brief Infers a file language label optimized for agent payloads.
- @details Reuses source-language detection when available, normalizes markdown extensions explicitly, and falls back to the lowercase extension name without the leading dot. Runtime is O(1). No side effects occur.
- @param[in] filePath {string} File path whose extension should be classified.
- @return {string | undefined} Normalized language label, or `undefined` when the path has no usable extension.

### fn `function extractLeadingDoxygenFields(content: string): DoxygenFieldMap | undefined` (L326-344)
- @brief Extracts leading Doxygen file fields when present.
- @details Tests common leading-comment syntaxes, normalizes an optional shebang away before matching, and returns the first non-empty parsed Doxygen map. Runtime is O(n) in comment length. No side effects occur.
- @param[in] content {string} File content.
- @return {DoxygenFieldMap | undefined} Parsed Doxygen field map, or `undefined` when no supported file-level fields are present.

### fn `function roundRatio(numerator: number, denominator: number): number` (L353-358)
- @brief Rounds one ratio to six decimal places.
- @details Preserves zero exactly and otherwise limits floating-point noise so share fields remain stable across executions. Runtime is O(1). No side effects occur.
- @param[in] numerator {number} Partial numeric value.
- @param[in] denominator {number} Total numeric value.
- @return {number} Rounded ratio in range `[0, 1]` when the denominator is positive; `0` otherwise.

### fn `function probeRequestedPath(absolutePath: string): { exists: boolean; isFile: boolean; reason?: string }` (L366-380)
- @brief Probes one requested path before token counting.
- @details Resolves whether the target exists and is a regular file while capturing a stable skip reason for missing or non-file inputs. Runtime is dominated by one filesystem stat. Side effects are limited to filesystem reads.
- @param[in] absolutePath {string} Absolute path to inspect.
- @return {{ exists: boolean; isFile: boolean; reason?: string }} Path probe result.

### fn `function buildCountFileMetricsResult(filePath: string, content: string, counter: TokenCounter): CountFileMetricsResult` (L390-405)
- @brief Builds one rich per-file metrics record from readable content.
- @details Combines token, character, byte, and line counts with file-extension, inferred-language, heading, and Doxygen metadata extraction so agents can consume direct-access facts without reparsing the raw file. Runtime is O(n) in content length. No external state is mutated.
- @param[in] filePath {string} Absolute or project-local file path.
- @param[in] content {string} UTF-8 file content.
- @param[in] counter {TokenCounter} Reused token counter instance.
- @return {CountFileMetricsResult} Structured per-file metrics record.

### fn `export function countFileMetrics(content: string, encodingName = TOKEN_COUNTER_ENCODING):` (L414-427)
- @brief Counts tokens, characters, bytes, and lines for one in-memory content string.
- @details Instantiates a `TokenCounter`, tokenizes the supplied text, and pairs the result with raw character length, UTF-8 byte size, and logical line count. Runtime is O(n). No filesystem I/O occurs.
- @param[in] content {string} Text payload to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {{ tokens: number; chars: number; bytes: number; lines: number }} Aggregate metrics for the supplied content.

### fn `export function countFilesMetrics(filePaths: string[], encodingName = TOKEN_COUNTER_ENCODING): CountFileMetricsResult[]` (L437-458)
- @brief Counts tokens, characters, bytes, and lines for multiple files.
- @details Reuses a single `TokenCounter`, reads each file as UTF-8, and returns per-file metrics plus direct-access metadata such as heading and Doxygen file fields. Read failures are captured as error strings instead of aborting the entire batch. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] filePaths {string[]} File paths to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {CountFileMetricsResult[]} Per-file metrics and optional read errors.
- @satisfies REQ-010, REQ-070, REQ-073

### fn `export function buildTokenToolPayload(options: BuildTokenToolPayloadOptions): TokenToolPayload` (L467-579)
- @brief Builds the agent-oriented JSON payload for token-centric tools.
- @details Validates requested paths against the filesystem, counts token metrics for processable files, preserves caller order in the file table, and emits direct-access file facts such as sizes, headings, and optional Doxygen file fields while omitting request echoes and derived guidance. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] options {BuildTokenToolPayloadOptions} Payload-construction options.
- @return {TokenToolPayload} Structured token payload ordered as summary then files.
- @satisfies REQ-010, REQ-017, REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075

### fn `export function formatPackSummary(results: CountFileMetricsResult[]): string` (L587-611)
- @brief Formats per-file token metrics as a human-readable summary block.
- @details Aggregates totals, emits one status line per file, and appends a summary footer containing file, token, and character counts. Runtime is O(n). No external state is mutated.
- @param[in] results {CountFileMetricsResult[]} Per-file metric records.
- @return {string} Multiline summary suitable for CLI or editor output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`TokenToolScope`|type||23||
|`TokenFileStatus`|type||29||
|`CountFileMetricsResult`|iface||35-48|export interface CountFileMetricsResult|
|`TokenToolFileEntry`|iface||54-77|export interface TokenToolFileEntry|
|`TokenToolRequestSection`|iface||83-93|export interface TokenToolRequestSection|
|`TokenToolSummarySection`|iface||99-112|export interface TokenToolSummarySection|
|`TokenToolPathIssue`|iface||118-122|export interface TokenToolPathIssue|
|`TokenToolDominantFileObservation`|iface||128-132|export interface TokenToolDominantFileObservation|
|`TokenToolSourceObservationsSection`|iface||138-144|export interface TokenToolSourceObservationsSection|
|`TokenToolRecommendation`|iface||150-154|export interface TokenToolRecommendation|
|`TokenToolNextStepHint`|iface||160-164|export interface TokenToolNextStepHint|
|`TokenToolGuidanceSection`|iface||170-174|export interface TokenToolGuidanceSection|
|`TokenToolPayload`|iface||180-183|export interface TokenToolPayload|
|`BuildTokenToolPayloadOptions`|iface||189-197|export interface BuildTokenToolPayloadOptions|
|`TokenCounter`|class||203-243|export class TokenCounter|
|`canonicalizeTokenPath`|fn||252-260|function canonicalizeTokenPath(filePath: string, baseDir:...|
|`countLines`|fn||268-274|function countLines(content: string): number|
|`stripMarkdownFrontMatter`|fn||282-285|function stripMarkdownFrontMatter(content: string): string|
|`extractPrimaryHeadingText`|fn||294-301|function extractPrimaryHeadingText(content: string, fileP...|
|`inferLanguageName`|fn||309-318|function inferLanguageName(filePath: string): string | un...|
|`extractLeadingDoxygenFields`|fn||326-344|function extractLeadingDoxygenFields(content: string): Do...|
|`roundRatio`|fn||353-358|function roundRatio(numerator: number, denominator: numbe...|
|`probeRequestedPath`|fn||366-380|function probeRequestedPath(absolutePath: string): { exis...|
|`buildCountFileMetricsResult`|fn||390-405|function buildCountFileMetricsResult(filePath: string, co...|
|`countFileMetrics`|fn||414-427|export function countFileMetrics(content: string, encodin...|
|`countFilesMetrics`|fn||437-458|export function countFilesMetrics(filePaths: string[], en...|
|`buildTokenToolPayload`|fn||467-579|export function buildTokenToolPayload(options: BuildToken...|
|`formatPackSummary`|fn||587-611|export function formatPackSummary(results: CountFileMetri...|


---

# tool-runner.ts | TypeScript | 717L | 34 symbols | 13 imports | 35 comments
> Path: `src/core/tool-runner.ts`
- @brief Implements the executable back-end for all pi-usereq CLI and extension tools.
- @details Centralizes project discovery, git helpers, source-file collection, documentation generation, compression, construct lookup, static-check dispatch, and worktree lifecycle operations. Runtime depends on the selected command and may include filesystem reads, config writes, process spawning, and git mutations.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { loadConfig, normalizeConfigPaths, saveConfig, type UseReqConfig } from "./config.js";
import { formatRuntimePathForDisplay } from "./path-context.js";
import { resolveRuntimeGitPath } from "./runtime-project-paths.js";
import { countFilesMetrics, formatPackSummary } from "./token-counter.js";
import {
import { compressFiles } from "./compress-files.js";
import { findConstructsInFiles } from "./find-constructs.js";
import { STATIC_CHECK_EXT_TO_LANG, dispatchStaticCheckForFile } from "./static-check.js";
import { makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface ToolResult` (L28-32)
- @brief Represents the normalized output contract for a tool invocation.
- @details Every tool emits stdout, stderr, and a numeric exit code so CLI and extension front-ends can handle results uniformly. The interface is compile-time only and adds no runtime cost.

### fn `function ok(stdout = "", stderr = ""): ToolResult` (L52-54)
- @brief Creates a successful tool result payload.
- @details Wraps stdout and stderr text with exit code `0`. Runtime is O(1). No side effects occur.
- @param[in] stdout {string} Standard-output text.
- @param[in] stderr {string} Standard-error text.
- @return {ToolResult} Successful result object.

### fn `function fail(message: string, code = 1, stdout = "", stderr = ""): never` (L66-71)
- @brief Throws a `ReqError` populated with tool-result stream content.
- @details Creates a structured failure object, attaches optional stdout and stderr payloads, and throws immediately. Runtime is O(1). Side effect: throws an exception.
- @param[in] message {string} Primary failure message.
- @param[in] code {number} Exit code to attach. Defaults to `1`.
- @param[in] stdout {string} Optional stdout payload.
- @param[in] stderr {string} Optional stderr payload. Defaults to `message` when omitted.
- @return {never} This function never returns.
- @throws {ReqError} Always throws.

### fn `function runCapture(command: string[], options: { cwd?: string } = {})` (L80-85)
- @brief Executes a subprocess synchronously and captures its output.
- @details Delegates to `spawnSync`, passes through an optional working directory, and forces UTF-8 decoding. Runtime is dominated by external process execution. Side effects include process spawning.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] options {{ cwd?: string }} Optional process-spawn settings.
- @return {ReturnType<typeof spawnSync>} Captured subprocess result.

### fn `function resolveEffectiveGitPath(projectBase: string): string | undefined` (L94-96)
- @brief Resolves the effective runtime git root for the current base path.
- @details Delegates to the shared runtime-only repository resolver so git helpers never consult persisted `git-path` metadata. Runtime is dominated by git probing. Side effects include subprocess execution.
- @param[in] projectBase {string} Resolved base path.
- @return {string | undefined} Effective git root path or `undefined` when unavailable.
- @satisfies REQ-145, REQ-146

### fn `export function sanitizeBranchName(branch: string): string` (L104-106)
- @brief Rewrites a branch name into a filesystem-safe token.
- @details Replaces characters invalid for worktree directory and branch-name generation with `-`. Runtime is O(n). No side effects occur.
- @param[in] branch {string} Raw branch name.
- @return {string} Sanitized token.

### fn `export function validateWtName(wtName: string): boolean` (L114-117)
- @brief Validates a requested worktree or branch name.
- @details Rejects empty names, dot-path markers, whitespace, and filesystem-invalid characters. Runtime is O(n). No side effects occur.
- @param[in] wtName {string} Candidate worktree name.
- @return {boolean} `true` when the name is acceptable for worktree creation.

### fn `export function collectSourceFiles(srcDirs: string[], projectBase: string): string[]` (L127-154)
- @brief Collects tracked and untracked source files from configured source directories.
- @details Uses `git ls-files` to enumerate candidate files, filters them by configured source roots, excluded directories, and supported extensions, and returns sorted absolute paths. Runtime is O(n log n) in collected file count plus git execution cost. Side effects include process spawning.
- @param[in] srcDirs {string[]} Configured source-directory roots.
- @param[in] projectBase {string} Absolute project root.
- @return {string[]} Sorted absolute source-file paths.
- @throws {ReqError} Throws when `git ls-files` fails.

### fn `function buildAsciiTree(paths: string[]): string` (L162-190)
- @brief Builds an ASCII tree from relative file paths.
- @details Materializes a nested object tree and renders it using box-drawing characters for markdown display. Runtime is O(n log n) in path count due to sorting. No side effects occur.
- @param[in] paths {string[]} Relative POSIX-style file paths.
- @return {string} Rendered ASCII tree.

### fn `const emit = (branch: Record<string, Record<string, unknown> | null>, prefix = "") =>` (L178-187)

### fn `function formatFilesStructureMarkdown(files: string[], projectBase: string): string` (L199-202)
- @brief Formats the collected file structure as markdown.
- @details Converts absolute file paths to project-relative POSIX paths, renders an ASCII tree, and wraps the result in a fenced markdown block. Runtime is O(n log n) in file count. No side effects occur.
- @param[in] files {string[]} Absolute file paths.
- @param[in] projectBase {string} Absolute project root.
- @return {string} Markdown section describing the file structure.

### fn `export function resolveProjectBase(projectBase?: string): string` (L211-217)
- @brief Resolves and validates the project base directory.
- @details Uses the supplied path or the current working directory, normalizes it to an absolute path, and verifies that it exists. Runtime is O(1) plus one filesystem existence check. Side effects are limited to filesystem reads.
- @param[in] projectBase {string | undefined} Optional project-root override.
- @return {string} Absolute validated project root.
- @throws {ReqError} Throws when the resolved path does not exist.

### fn `export function resolveProjectSrcDirs(projectBase: string, config?: UseReqConfig): [string, string[]]` (L227-235)
- @brief Resolves the project base and effective source-directory list.
- @details Loads configuration when not supplied, validates that at least one source directory exists in config, and returns both the absolute base path and source-directory array. Runtime is O(s). Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {[string, string[]]} Tuple of absolute project base and configured source directories.
- @throws {ReqError} Throws when no source directories are configured.

### fn `export function loadAndRepairConfig(projectBase: string): UseReqConfig` (L244-249)
- @brief Loads project configuration and persists normalized path fields.
- @details Resolves the base path, normalizes persisted docs/tests/source directories into project-relative form, writes the normalized config back to disk, and returns the in-memory result without persisting runtime-derived path metadata. Runtime is dominated by config I/O. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root.
- @return {UseReqConfig} Normalized effective configuration.
- @satisfies CTN-012, REQ-146

### fn `export function runFilesTokens(files: string[]): ToolResult` (L258-270)
- @brief Counts tokens and characters for explicit files.
- @details Filters missing files into stderr warnings, counts metrics for valid files, and returns a formatted summary. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] files {string[]} Explicit file paths.
- @return {ToolResult} Tool result containing the formatted summary and warnings.
- @throws {ReqError} Throws when no valid files are provided.

### fn `export function runFilesReferences(files: string[], cwd = process.cwd(), verbose = false): ToolResult` (L281-297)
- @brief Generates the structured references JSON payload for explicit files.
- @details Builds the agent-oriented references payload in caller order, preserves skipped and failed inputs as structured file records, emits deterministic JSON to stdout, and mirrors structured diagnostics to stderr. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory used for canonical path resolution. Defaults to `process.cwd()`.
- @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
- @return {ToolResult} Successful tool result containing structured JSON.
- @satisfies REQ-011, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function runFilesCompress(files: string[], cwd = process.cwd(), enableLineNumbers = false, verbose = false): ToolResult` (L308-310)
- @brief Compresses explicit files into compact source excerpts.
- @details Delegates to `compressFiles` using the caller working directory as the relative-output base by default. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory for relative output formatting. Defaults to `process.cwd()`.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.

### fn `export function runFilesFind(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult` (L321-327)
- @brief Finds named constructs in explicit files.
- @details Expects `[TAG, PATTERN, ...FILES]`, validates minimum arity, and delegates to `findConstructsInFiles`. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] argsList {string[]} Positional argument list containing tag filter, regex pattern, and files.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
- @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
- @return {ToolResult} Successful tool result containing construct markdown.
- @throws {ReqError} Throws when required arguments are missing.

### fn `export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult` (L339-356)
- @brief Generates the structured references JSON payload for configured source directories.
- @details Resolves the project base, collects configured source files, builds the agent-oriented references payload, emits deterministic JSON to stdout, and mirrors structured diagnostics to stderr. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing structured JSON.
- @throws {ReqError} Throws when no source files are found or no file can be analyzed.
- @satisfies REQ-014, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L368-373)
- @brief Compresses all source files from configured source directories.
- @details Resolves the project base, collects source files, and delegates to `compressFiles`. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runFind(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L387-396)
- @brief Finds named constructs across configured project source files.
- @details Resolves the project base, collects source files, delegates to `findConstructsInFiles`, and converts thrown search errors into structured `ReqError` failures. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] tagFilter {string} Pipe-delimited tag filter.
- @param[in] pattern {string} Regular expression applied to construct names.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
- @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
- @return {ToolResult} Successful tool result containing construct markdown.
- @throws {ReqError} Throws when no source files are found or the search fails.

### fn `export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult` (L406-415)
- @brief Counts tokens for canonical documentation files.
- @details Loads the configured docs directory, selects `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` when present, and delegates to `runFilesTokens`. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Tool result containing documentation token metrics.
- @throws {ReqError} Throws when no canonical docs files exist.

### fn `export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult` (L425-461)
- @brief Runs configured static checks for explicit files.
- @details Loads the effective static-check config, groups checks by file extension language, captures checker stdout for each configured entry, and aggregates stderr warnings for invalid paths. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] files {string[]} Explicit file paths.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.

### fn `export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L471-484)
- @brief Runs configured static checks for project source and test directories.
- @details Collects source and test files, excludes fixture roots, and delegates to `runFilesStaticCheck`. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runGitCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L495-518)
- @brief Verifies that the effective repository root is clean and has a valid HEAD.
- @details Resolves the runtime git root for the current execution path, checks work-tree status, rejects uncommitted changes, and verifies either a symbolic ref or detached HEAD hash exists. Runtime is dominated by git execution. Side effects include process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when the repository state is valid.
- @throws {ReqError} Throws when the runtime git root is unavailable or repository status is unclear.
- @satisfies REQ-145, REQ-146

### fn `export function runDocsCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L528-545)
- @brief Verifies that canonical documentation files exist.
- @details Checks the configured docs directory for `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md`, and throws a guided error for the first missing file. Runtime is O(1) plus filesystem existence checks. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when all canonical docs exist.
- @throws {ReqError} Throws when a required doc file is missing.

### fn `export function runGitWtName(projectBase: string, config?: UseReqConfig): ToolResult` (L556-570)
- @brief Generates the standardized worktree name for the effective repository root.
- @details Resolves the runtime git root constrained by the current base path, combines the repository basename, sanitized current branch, and a timestamp-based execution identifier into a deterministic `useReq-...` name. Runtime is O(1) plus git execution cost. Side effects include process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the generated worktree name and trailing newline.
- @throws {ReqError} Throws when the runtime git root is unavailable.
- @satisfies REQ-145, REQ-146

### fn `function worktreePathExistsExact(gitPath: string, targetPath: string): boolean` (L580-585)
- @brief Tests whether a git worktree exists at an exact filesystem path.
- @details Parses `git worktree list --porcelain` output and compares normalized paths for exact equality. Runtime is O(n) in reported worktree count plus git execution cost. Side effects include process spawning.
- @param[in] gitPath {string} Git root used to query worktrees.
- @param[in] targetPath {string} Candidate worktree path.
- @return {boolean} `true` when a worktree exists at the exact target path.
- @throws {ReqError} Throws when the worktree list cannot be queried.

### fn `function rollbackWorktreeCreate(gitPath: string, wtPath: string, wtName: string): void` (L596-602)
- @brief Rolls back a partially created worktree and branch.
- @details Forces worktree removal and branch deletion, then throws if either rollback action fails. Runtime is dominated by git execution. Side effects include destructive git mutations.
- @param[in] gitPath {string} Git root path.
- @param[in] wtPath {string} Worktree path to remove.
- @param[in] wtName {string} Branch name to delete.
- @return {void} No return value.
- @throws {ReqError} Throws when rollback cannot be completed.

### fn `export function runGitWtCreate(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L613-646)
- @brief Creates a dedicated git worktree and copies pi-usereq metadata into it.
- @details Validates the requested name, resolves base and git roots under the ancestor constraint, creates the worktree and branch, then mirrors the `.pi-usereq` directory into the corresponding path inside the new worktree. Runtime is dominated by git and filesystem operations. Side effects include worktree creation, branch creation, directory creation, and file copying.
- @param[in] projectBase {string} Candidate project root.
- @param[in] wtName {string} Requested worktree and branch name.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when creation completes.
- @throws {ReqError} Throws for invalid names, missing git metadata, git failures, or copy finalization failures.

### fn `export function runGitWtDelete(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L657-690)
- @brief Deletes a dedicated git worktree and its branch.
- @details Verifies that either the worktree path or branch exists, removes the worktree when present, deletes the branch when present, and fails atomically when either delete step reports an error. Runtime is dominated by git execution. Side effects include destructive git mutations.
- @param[in] projectBase {string} Candidate project root.
- @param[in] wtName {string} Exact worktree and branch name.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when deletion completes.
- @throws {ReqError} Throws when git metadata is missing, the target does not exist, or removal fails.

### fn `const branchExists = (() =>` (L667-670)

### fn `export function runGitPath(projectBase: string, config?: UseReqConfig): ToolResult` (L699-704)
- @brief Returns the effective git root path for the current execution context.
- @details Resolves the git root constrained by the current base path, formats it with the runtime path display serializer, and writes the resulting path followed by a newline. Runtime is O(p) plus config-load and optional git-probing cost. Side effects are limited to filesystem reads and git subprocess execution.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the derived git path or an empty line.

### fn `export function runGetBasePath(projectBase: string, config?: UseReqConfig): ToolResult` (L713-717)
- @brief Returns the current base path for the execution context.
- @details Resolves the current execution path, formats it with the runtime path display serializer, and writes the resulting base path followed by a newline. Runtime is O(p). Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the base path and trailing newline.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolResult`|iface||28-32|export interface ToolResult|
|`ok`|fn||52-54|function ok(stdout = "", stderr = ""): ToolResult|
|`fail`|fn||66-71|function fail(message: string, code = 1, stdout = "", std...|
|`runCapture`|fn||80-85|function runCapture(command: string[], options: { cwd?: s...|
|`resolveEffectiveGitPath`|fn||94-96|function resolveEffectiveGitPath(projectBase: string): st...|
|`sanitizeBranchName`|fn||104-106|export function sanitizeBranchName(branch: string): string|
|`validateWtName`|fn||114-117|export function validateWtName(wtName: string): boolean|
|`collectSourceFiles`|fn||127-154|export function collectSourceFiles(srcDirs: string[], pro...|
|`buildAsciiTree`|fn||162-190|function buildAsciiTree(paths: string[]): string|
|`emit`|fn||178-187|const emit = (branch: Record<string, Record<string, unkno...|
|`formatFilesStructureMarkdown`|fn||199-202|function formatFilesStructureMarkdown(files: string[], pr...|
|`resolveProjectBase`|fn||211-217|export function resolveProjectBase(projectBase?: string):...|
|`resolveProjectSrcDirs`|fn||227-235|export function resolveProjectSrcDirs(projectBase: string...|
|`loadAndRepairConfig`|fn||244-249|export function loadAndRepairConfig(projectBase: string):...|
|`runFilesTokens`|fn||258-270|export function runFilesTokens(files: string[]): ToolResult|
|`runFilesReferences`|fn||281-297|export function runFilesReferences(files: string[], cwd =...|
|`runFilesCompress`|fn||308-310|export function runFilesCompress(files: string[], cwd = p...|
|`runFilesFind`|fn||321-327|export function runFilesFind(argsList: string[], enableLi...|
|`runReferences`|fn||339-356|export function runReferences(projectBase: string, config...|
|`runCompress`|fn||368-373|export function runCompress(projectBase: string, config?:...|
|`runFind`|fn||387-396|export function runFind(projectBase: string, tagFilter: s...|
|`runTokens`|fn||406-415|export function runTokens(projectBase: string, config?: U...|
|`runFilesStaticCheck`|fn||425-461|export function runFilesStaticCheck(files: string[], proj...|
|`runProjectStaticCheck`|fn||471-484|export function runProjectStaticCheck(projectBase: string...|
|`runGitCheck`|fn||495-518|export function runGitCheck(projectBase: string, config?:...|
|`runDocsCheck`|fn||528-545|export function runDocsCheck(projectBase: string, config?...|
|`runGitWtName`|fn||556-570|export function runGitWtName(projectBase: string, config?...|
|`worktreePathExistsExact`|fn||580-585|function worktreePathExistsExact(gitPath: string, targetP...|
|`rollbackWorktreeCreate`|fn||596-602|function rollbackWorktreeCreate(gitPath: string, wtPath: ...|
|`runGitWtCreate`|fn||613-646|export function runGitWtCreate(projectBase: string, wtNam...|
|`runGitWtDelete`|fn||657-690|export function runGitWtDelete(projectBase: string, wtNam...|
|`branchExists`|fn||667-670|const branchExists = (() =>|
|`runGitPath`|fn||699-704|export function runGitPath(projectBase: string, config?: ...|
|`runGetBasePath`|fn||713-717|export function runGetBasePath(projectBase: string, confi...|


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

# index.ts | TypeScript | 2534L | 53 symbols | 21 imports | 56 comments
> Path: `src/index.ts`
- @brief Registers the pi-usereq extension commands, tools, and configuration UI.
- @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.

## Imports
```
import path from "node:path";
import type {
import { Type } from "@sinclair/typebox";
import {
import {
import {
import {
import {
import {
import {
import { formatRuntimePathForDisplay } from "./core/path-context.js";
import { resolveRuntimeGitPath } from "./core/runtime-project-paths.js";
import { showPiUsereqSettingsMenu, type PiUsereqSettingsMenuChoice } from "./core/settings-menu.js";
import {
import { renderPrompt } from "./core/prompts.js";
import { ensureBundledResourcesAccessible } from "./core/resources.js";
import {
import {
import { LANGUAGE_TAGS } from "./core/find-constructs.js";
import {
import { makeRelativeIfContainsProject, shellSplit } from "./core/utils.js";
```

## Definitions

### iface `interface PiShortcutRegistrar` (L152-160)
- @brief Describes the optional shortcut-registration surface used by pi-usereq.
- @details Narrows the runtime API to the documented `registerShortcut(...)`
method so the extension can remain compatible with offline harnesses that do
not implement shortcut capture. Compile-time only and introduces no runtime
cost.

### fn `function getProjectBase(cwd: string): string` (L168-170)
- @brief Resolves the effective project base from a working directory.
- @details Normalizes the provided cwd into an absolute path without consulting configuration. Time complexity is O(1). No I/O side effects occur.
- @param[in] cwd {string} Current working directory.
- @return {string} Absolute project base path.

### fn `function loadProjectConfig(cwd: string): UseReqConfig` (L179-182)
- @brief Loads project configuration for the extension runtime.
- @details Resolves the project base, loads persisted config, and normalizes configured directory paths without reading or persisting runtime-derived `base-path` or `git-path` metadata. Runtime is dominated by config I/O. Side effects are limited to filesystem reads.
- @param[in] cwd {string} Current working directory.
- @return {UseReqConfig} Effective project configuration.
- @satisfies REQ-030, REQ-145, REQ-146

### fn `function saveProjectConfig(cwd: string, config: UseReqConfig): void` (L192-195)
- @brief Persists project configuration from the extension runtime.
- @details Resolves the project base, normalizes configured directory paths into project-relative form, and delegates persistence to `saveConfig` without serializing runtime-derived path metadata. Runtime is O(n) in config size. Side effects include config-file writes.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Configuration to persist.
- @return {void} No return value.
- @satisfies REQ-146

### fn `function formatProjectConfigPathForMenu(cwd: string): string` (L206-208)
- @brief Formats the current project config path for top-level menu display.
- @details Resolves `<base-path>/.pi-usereq/config.json` from the cwd-derived
project base and formats it relative to the user home when possible. Runtime
is O(p) in path length. No external state is mutated.
- @param[in] cwd {string} Current working directory.
- @return {string} User-home-relative or absolute config path display value.
- @satisfies REQ-162

### fn `function collectProjectStaticCheckSelection(` (L217-248)
- @brief Collects the project-scoped static-check selection used by the agent tool.
- @details Resolves configured source plus test directories, reuses the same fixture-root exclusions as `runProjectStaticCheck`, and returns canonical relative file paths for structured payload emission. Runtime is O(F) plus project file-discovery cost. Side effects are limited to filesystem reads and git subprocesses delegated through `collectSourceFiles`.
- @param[in] projectBase {string} Resolved project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {{ selectionDirectoryPaths: string[]; excludedDirectoryPaths: string[]; selectedPaths: string[] }} Structured static-check selection facts.

### fn `function buildTokenToolExecutionStderr(payload: TokenToolPayload): string` (L256-264)
- @brief Builds execution diagnostics for one token-tool payload.
- @details Serializes skipped-input and read-error observations into stable stderr lines while leaving successful counted files silent. Runtime is O(n) in issue count. No side effects occur.
- @param[in] payload {TokenToolPayload} Structured token payload.
- @return {string} Newline-delimited execution diagnostics.

### fn `function buildTokenToolExecuteResult(` (L273-288)
- @brief Builds the agent-oriented execute result returned by token-count tools.
- @details Mirrors the structured token payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {TokenToolPayload} Structured token payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: TokenToolPayload & { execution: { code: number; stderr: string } } }} Token-tool execute result.
- @satisfies REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075, REQ-099, REQ-102

### fn `function buildReferenceToolExecuteResult(` (L297-313)
- @brief Builds the agent-oriented execute result returned by references tools.
- @details Mirrors the structured references payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {ReferenceToolPayload} Structured references payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: ReferenceToolPayload & { execution: { code: number; stderr: string } } }} References-tool execute result.
- @satisfies REQ-076, REQ-077, REQ-078, REQ-079, REQ-099, REQ-102

### fn `function buildCompressionToolExecuteResult(` (L322-338)
- @brief Builds the agent-oriented execute result returned by compression tools.
- @details Mirrors the structured compression payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {CompressToolPayload} Structured compression payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: CompressToolPayload & { execution: { code: number; stderr: string } } }} Compression-tool execute result.
- @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087, REQ-088, REQ-099, REQ-102

### fn `function buildFindToolSupportedTagGuidelines(): string[]` (L399-403)
- @brief Builds the supported-tag guidance lines embedded in find-tool registrations.
- @details Emits one deterministic line per supported language containing its canonical registration label and sorted tag list so downstream agents can specialize requests without invoking the tool first. Runtime is O(l * t log t). No side effects occur.
- @return {string[]} Supported-tag guidance lines.

### fn `function buildFindToolSchemaDescription(scope: FindToolScope): string` (L411-416)
- @brief Builds the schema description for one find-tool registration.
- @details Specializes the input-scope sentence for explicit-file or configured-directory searches while keeping the JSON output contract stable and fully machine-readable. Runtime is O(1). No side effects occur.
- @param[in] scope {FindToolScope} Find-tool scope.
- @return {string} Parameter-schema description.

### fn `function buildFindToolPromptGuidelines(scope: FindToolScope): string[]` (L424-440)
- @brief Builds the prompt-guideline set for one find-tool registration.
- @details Encodes scope selection, output schema, regex semantics, line-number behavior, tag-filter rules, and the full language-to-tag matrix as stable agent-oriented strings. Runtime is O(l * t log t). No side effects occur.
- @param[in] scope {FindToolScope} Find-tool scope.
- @return {string[]} Prompt-guideline strings.

### fn `function buildFindToolExecuteResult(` (L449-466)
- @brief Builds the agent-oriented execute result returned by find tools.
- @details Mirrors the structured find payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {FindToolPayload} Structured find payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: FindToolPayload & { execution: { code: number; stderr: string } } }} Find-tool execute result.
- @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-097, REQ-098, REQ-099, REQ-102

### fn `async function deliverPromptCommand(pi: ExtensionAPI, content: string): Promise<void>` (L476-478)
- @brief Delivers one rendered prompt into the active session.
- @details Writes the rendered prompt directly through `pi.sendUserMessage(...)` without creating replacement sessions or pre-reset flows. Runtime is O(n) in prompt length. Side effects are limited to user-message delivery.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] content {string} Rendered prompt markdown.
- @return {Promise<void>} Promise resolved after the prompt is queued for delivery.
- @satisfies REQ-004, REQ-067, REQ-068

### fn `function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[]` (L487-492)
- @brief Returns the configurable active-tool inventory visible to the extension.
- @details Filters runtime tools against the canonical configurable-tool set, thereby combining extension-owned tools with supported embedded pi CLI tools. Output order is sorted by tool name. Runtime is O(t log t). No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {ToolInfo[]} Sorted configurable tool descriptors.
- @satisfies REQ-007, REQ-063

### fn `function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[]` (L500-504)
- @brief Normalizes and returns the configured enabled active tools.
- @details Reuses repository normalization rules, updates the config object in place, and returns the normalized array. Runtime is O(n) in configured tool count. Side effect: mutates `config["enabled-tools"]`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {string[]} Normalized enabled tool names.

### fn `function getPiUsereqToolKind(tool: ToolInfo): "builtin" | "extension"` (L512-517)
- @brief Classifies one configurable tool as embedded or extension-owned.
- @details Uses the runtime `sourceInfo.source` field plus the supported embedded-name subset to produce one stable UI label. Runtime is O(1). No external state is mutated.
- @param[in] tool {ToolInfo} Runtime tool descriptor.
- @return {"builtin" | "extension"} Stable tool-kind label.

### fn `function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void` (L527-544)
- @brief Applies the configured active-tool enablement to the current session.
- @details Preserves non-configurable active tools, removes every configurable tool from the active set, then re-adds only configured tools that exist in the current runtime inventory. Runtime is O(t). Side effects include `pi.setActiveTools(...)`.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {void} No return value.
- @satisfies REQ-009, REQ-064

### fn `async function handleExtensionStatusEvent(` (L566-603)
- @brief Handles one intercepted pi lifecycle hook for pi-usereq status updates.
- @details Applies session-start-specific resource validation, project-config
refresh, and startup-tool enablement before forwarding the originating hook
name and payload into the shared `updateExtensionStatus(...)` pipeline.
On `agent_end`, also dispatches configured command-notify, terminal-beep,
sound, and prompt-specific Pushover effects when the current run originates
from a bundled prompt command. Runtime is dominated by configuration loading during
`session_start`; all other hooks are O(1). Side effects include resource
checks, active-tool mutation, status updates, live-ticker disposal on
shutdown, stdout writes, optional child-process spawning, and outbound
HTTPS requests.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded by pi.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when hook processing completes.
- @satisfies REQ-117, REQ-118, REQ-119, REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-177, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187

### fn `function registerExtensionStatusHooks(` (L616-629)
- @brief Registers shared wrappers for every supported pi lifecycle hook.
- @details Installs one generic wrapper per intercepted hook so every resource,
session, agent, model, tool, bash, and input event is routed through the
same extension-status update pipeline. Runtime is O(h) in registered hook
count. Side effects include hook registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies DES-002, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117

### fn `function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void` (L639-642)
- @brief Replaces the configured active-tool selection and applies it immediately.
- @details Normalizes the requested tool names, stores them in config, and synchronizes the active tool set with runtime registration state. Runtime is O(n + t). Side effect: mutates config and active tools.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] enabledTools {string[]} Requested enabled tool names.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.

### fn `function renderPiUsereqToolsReference(pi: ExtensionAPI, config: UseReqConfig): string` (L651-679)
- @brief Renders a textual reference for configurable-tool configuration and runtime state.
- @details Lists every configurable tool with configured enablement, runtime activation, builtin-versus-extension classification, source metadata, and optional descriptions. Runtime is O(t). No side effects occur.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Multiline tool-status report.

- type `type PiNotifyBooleanConfigKey =` (L685)
- @brief Represents one persisted boolean notification-setting key.
- @details Restricts menu toggles to the global enable flags and outcome-specific toggles used by command-notify, terminal-beep, sound, and Pushover configuration. Compile-time only and introduces no runtime cost.
### fn `function togglePiNotifyFlag(config: UseReqConfig, key: PiNotifyBooleanConfigKey): boolean` (L709-712)
- @brief Flips one persisted boolean notification setting.
- @details Negates the selected configuration flag in place and returns the resulting boolean value so callers can emit deterministic UI feedback. Runtime is O(1). Side effect: mutates `config`.
- @param[in] key {PiNotifyBooleanConfigKey} Boolean configuration key to toggle.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {boolean} Next enabled state.

### fn `function formatPiNotifyPushoverPriority(priority: PiNotifyPushoverPriority): string` (L721-723)
- @brief Formats one persisted Pushover priority for menu display.
- @details Maps the canonical `0|1` priority domain to deterministic `Normal|High` labels reused by the Pushover configuration UI. Runtime is O(1). No external state is mutated.
- @param[in] priority {PiNotifyPushoverPriority} Persisted Pushover priority.
- @return {string} Menu-display label.
- @satisfies REQ-172

### fn `function buildPiNotifyPushoverMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L732-795)
- @brief Builds the shared settings-menu choices for Pushover configuration.
- @details Serializes the global enable flag, per-event toggles, priority, title, text, and credential rows into right-valued menu items consumed by the shared settings-menu renderer. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered Pushover-menu choice vector.
- @satisfies REQ-163, REQ-165, REQ-172, REQ-184, REQ-185

### fn `async function selectPiNotifyPushoverPriority(` (L805-827)
- @brief Opens the shared settings-menu selector for Pushover priority.
- @details Reuses the pi-usereq settings-menu renderer so Pushover priority selection remains stylistically aligned with the notification menus and returns the chosen priority or `undefined` on cancel. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentPriority {PiNotifyPushoverPriority} Persisted priority value.
- @return {Promise<PiNotifyPushoverPriority | undefined>} Selected priority or `undefined` when cancelled.
- @satisfies REQ-172

### fn `async function configurePiNotifyPushoverMenu(` (L837-918)
- @brief Runs the interactive Pushover-configuration menu.
- @details Exposes the global enable flag, per-event toggles, priority selector, title and text templates, and credentials through the shared settings-menu renderer. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-163, REQ-165, REQ-172, REQ-184, REQ-185

### fn `function buildPiNotifyMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L927-1044)
- @brief Builds the shared settings-menu choices for notification configuration.
- @details Serializes command-notify, terminal-beep, sound, and nested Pushover rows in the documented order so the shared settings-menu renderer can expose a uniform configuration surface. Runtime is O(1) plus command-length formatting. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered notification-menu choice vector.
- @satisfies REQ-137, REQ-149, REQ-150, REQ-151, REQ-152, REQ-163, REQ-164, REQ-172, REQ-179, REQ-181, REQ-182, REQ-183

### fn `async function selectPiNotifySoundLevel(` (L1054-1085)
- @brief Opens the shared settings-menu selector for the selected sound command.
- @details Reuses the pi-usereq settings-menu renderer so sound-level selection remains stylistically aligned with the main configuration UI and returns the chosen sound level or `undefined` on cancel. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentLevel {PiNotifySoundLevel} Currently selected sound level.
- @return {Promise<PiNotifySoundLevel | undefined>} Selected sound level or `undefined` when cancelled.
- @satisfies REQ-131, REQ-179

### fn `async function configurePiNotifyMenu(` (L1095-1200)
- @brief Runs the interactive notification-configuration menu.
- @details Exposes command-notify, terminal-beep, sound, and nested Pushover controls through the shared settings-menu renderer while preserving the documented row ordering. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<boolean>} `true` when the sound-toggle shortcut changed.
- @satisfies REQ-129, REQ-131, REQ-133, REQ-134, REQ-137, REQ-163, REQ-164, REQ-172, REQ-179, REQ-181, REQ-182, REQ-183

### fn `function registerPiNotifyShortcut(` (L1215-1235)
- @brief Registers the configurable successful-run sound shortcut when supported.
- @details Loads the current project config, registers one raw pi shortcut when
the runtime exposes `registerShortcut(...)`, cycles persisted sound state on
invocation, saves the config, refreshes the status bar, and emits one info
notification. Runtime is O(1) for registration plus config I/O per shortcut
use. Side effects include shortcut registration, config writes, and status
updates.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-131, REQ-134, REQ-136

### fn `function registerPromptCommands(` (L1245-1265)
- @brief Registers bundled prompt commands with the extension.
- @details Creates one `req-<prompt>` command per bundled prompt name. Each handler ensures resources exist, records the prompt metadata needed for successful completion notifications, renders the prompt, and sends it into the current active session. Runtime is O(p) for registration; handler cost depends on prompt rendering plus prompt dispatch. Side effects include command registration, status-controller mutation, and user-message delivery during execution.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-004, REQ-067, REQ-068, REQ-169

### fn `function registerAgentTools(pi: ExtensionAPI): void` (L1275-1574)
- @brief Registers pi-usereq agent tools exposed to the model.
- @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-045, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-100, REQ-101, REQ-102

### fn `function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1903-1943)
- @brief Builds the shared settings-menu choices for startup-tool management.
- @details Serializes startup-tool actions into right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered startup-tool menu choices.
- @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildPiUsereqToolToggleChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1953-1969)
- @brief Builds the shared settings-menu choices for per-tool startup toggles.
- @details Exposes every configurable startup tool as one row whose right-side value reports the current enabled state. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered per-tool toggle choices.
- @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154

### fn `async function configurePiUsereqToolsMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L1980-2031)
- @brief Runs the interactive active-tool configuration menu.
- @details Synchronizes runtime active tools with persisted config, renders startup-tool actions through the shared settings-menu UI, and updates configuration state in response to selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-007, REQ-063, REQ-064, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function formatStaticCheckEntry(entry: StaticCheckEntry): string` (L2039-2045)
- @brief Formats one static-check configuration entry for UI display.
- @details Renders command-backed entries as `Command(cmd args...)` and all other modules as `Module(args...)`. Runtime is O(n) in parameter count. No side effects occur.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry.
- @return {string} Human-readable entry summary.

### fn `function formatStaticCheckLanguagesSummary(config: UseReqConfig): string` (L2053-2059)
- @brief Summarizes configured static-check languages.
- @details Keeps only languages with at least one configured checker, sorts them, and emits a compact `Language (count)` list. Runtime is O(l log l). No side effects occur.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Compact summary string or `(none)`.

### fn `function renderStaticCheckReference(config: UseReqConfig): string` (L2067-2095)
- @brief Renders the static-check configuration reference view.
- @details Produces a markdown-like summary containing configured entries, supported languages, the Command-only user module surface, and canonical example specifications. Runtime is O(l log l). No side effects occur.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Reference text for the editor view.

### fn `function buildStaticCheckMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2104-2139)
- @brief Builds the shared settings-menu choices for static-check management.
- @details Serializes Command-oriented static-check actions into right-valued menu rows consumed by the shared settings-menu renderer while omitting user-facing module selection. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered static-check menu choices.
- @satisfies REQ-008, REQ-160, REQ-161, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildSupportedStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2147-2166)
- @brief Builds the shared settings-menu choices for supported static-check languages.
- @details Exposes every supported language as one row whose right-side value reports extensions plus the current configured checker count for Command-oriented configuration flows. Runtime is O(l log l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered language-choice vector.

### fn `function buildConfiguredStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2174-2191)
- @brief Builds the shared settings-menu choices for configured static-check languages.
- @details Exposes only languages that currently have at least one configured checker so removal remains deterministic. Runtime is O(l log l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered configured-language vector.

### fn `async function configureStaticCheckMenu(ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L2201-2267)
- @brief Runs the interactive static-check configuration menu.
- @details Lets the user inspect support, add Command entries by guided prompts or raw spec strings, and remove configured language entries through the shared settings-menu renderer until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-008, REQ-160, REQ-161, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildPiUsereqMenuChoices(` (L2277-2338)
- @brief Builds the shared settings-menu choices for the top-level pi-usereq configuration UI.
- @details Serializes primary configuration actions into right-valued menu rows consumed by the shared settings-menu renderer, including the display-only config path beside `show-config`. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered top-level menu choices.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-162

### fn `function buildSrcDirMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2347-2368)
- @brief Builds the shared settings-menu choices for source-directory management.
- @details Exposes add and remove actions for `src-dir` entries through right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered source-directory management choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildSrcDirRemovalChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2377-2392)
- @brief Builds the shared settings-menu choices for removing one source-directory entry.
- @details Exposes every configured `src-dir` entry as one removable row and appends a `Back` action for cancellation. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered removable source-directory choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154

### fn `async function configurePiUsereq(` (L2403-2488)
- @brief Runs the top-level pi-usereq configuration menu.
- @details Loads project config, exposes docs/test/source/static-check/startup-tool/notification actions through the shared settings-menu renderer, persists changes on exit, and refreshes the single-line status bar. Runtime depends on user interaction count. Side effects include UI updates, config writes, active-tool changes, and editor text updates.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-162

### fn `const ensureSaved = () => saveProjectConfig(ctx.cwd, config)` (L2411-2415)

### fn `const refreshStatus = () =>` (L2412-2415)

### fn `function registerConfigCommands(` (L2498-2508)
- @brief Registers configuration-management commands.
- @details Adds the interactive `pi-usereq` configuration command only; the config-viewer action is now exposed exclusively inside that menu. Runtime is O(1) for registration. Side effects include command registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-006, REQ-031

### fn `export default function piUsereqExtension(pi: ExtensionAPI): void` (L2526-2534)
- @brief Registers the complete pi-usereq extension.
- @details Validates installation-owned bundled resources, registers prompt and
configuration commands plus agent tools, registers the configurable
successful-run sound shortcut when the runtime supports shortcuts, and
installs shared wrappers for all supported pi lifecycle hooks so status
telemetry, context usage, prompt timing, cumulative runtime, prompt-specific
Pushover metadata, and pi-notify effects remain synchronized with runtime
events. Runtime is O(h) in hook
count during registration. Side effects include filesystem reads,
command/tool/shortcut registration, UI updates, active-tool changes, and
timer scheduling.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-045, REQ-067, REQ-068, REQ-109, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118, REQ-119, REQ-120, REQ-121, REQ-122, REQ-123, REQ-124, REQ-125, REQ-126, REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-134, REQ-135, REQ-136, REQ-137, REQ-148, REQ-159, REQ-163, REQ-164, REQ-165, REQ-166, REQ-167, REQ-168, REQ-169, REQ-170, REQ-171, REQ-172

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiShortcutRegistrar`|iface||152-160|interface PiShortcutRegistrar|
|`getProjectBase`|fn||168-170|function getProjectBase(cwd: string): string|
|`loadProjectConfig`|fn||179-182|function loadProjectConfig(cwd: string): UseReqConfig|
|`saveProjectConfig`|fn||192-195|function saveProjectConfig(cwd: string, config: UseReqCon...|
|`formatProjectConfigPathForMenu`|fn||206-208|function formatProjectConfigPathForMenu(cwd: string): string|
|`collectProjectStaticCheckSelection`|fn||217-248|function collectProjectStaticCheckSelection(|
|`buildTokenToolExecutionStderr`|fn||256-264|function buildTokenToolExecutionStderr(payload: TokenTool...|
|`buildTokenToolExecuteResult`|fn||273-288|function buildTokenToolExecuteResult(|
|`buildReferenceToolExecuteResult`|fn||297-313|function buildReferenceToolExecuteResult(|
|`buildCompressionToolExecuteResult`|fn||322-338|function buildCompressionToolExecuteResult(|
|`buildFindToolSupportedTagGuidelines`|fn||399-403|function buildFindToolSupportedTagGuidelines(): string[]|
|`buildFindToolSchemaDescription`|fn||411-416|function buildFindToolSchemaDescription(scope: FindToolSc...|
|`buildFindToolPromptGuidelines`|fn||424-440|function buildFindToolPromptGuidelines(scope: FindToolSco...|
|`buildFindToolExecuteResult`|fn||449-466|function buildFindToolExecuteResult(|
|`deliverPromptCommand`|fn||476-478|async function deliverPromptCommand(pi: ExtensionAPI, con...|
|`getPiUsereqStartupTools`|fn||487-492|function getPiUsereqStartupTools(pi: ExtensionAPI): ToolI...|
|`getConfiguredEnabledPiUsereqTools`|fn||500-504|function getConfiguredEnabledPiUsereqTools(config: UseReq...|
|`getPiUsereqToolKind`|fn||512-517|function getPiUsereqToolKind(tool: ToolInfo): "builtin" |...|
|`applyConfiguredPiUsereqTools`|fn||527-544|function applyConfiguredPiUsereqTools(pi: ExtensionAPI, c...|
|`handleExtensionStatusEvent`|fn||566-603|async function handleExtensionStatusEvent(|
|`registerExtensionStatusHooks`|fn||616-629|function registerExtensionStatusHooks(|
|`setConfiguredPiUsereqTools`|fn||639-642|function setConfiguredPiUsereqTools(pi: ExtensionAPI, con...|
|`renderPiUsereqToolsReference`|fn||651-679|function renderPiUsereqToolsReference(pi: ExtensionAPI, c...|
|`PiNotifyBooleanConfigKey`|type||685||
|`togglePiNotifyFlag`|fn||709-712|function togglePiNotifyFlag(config: UseReqConfig, key: Pi...|
|`formatPiNotifyPushoverPriority`|fn||721-723|function formatPiNotifyPushoverPriority(priority: PiNotif...|
|`buildPiNotifyPushoverMenuChoices`|fn||732-795|function buildPiNotifyPushoverMenuChoices(config: UseReqC...|
|`selectPiNotifyPushoverPriority`|fn||805-827|async function selectPiNotifyPushoverPriority(|
|`configurePiNotifyPushoverMenu`|fn||837-918|async function configurePiNotifyPushoverMenu(|
|`buildPiNotifyMenuChoices`|fn||927-1044|function buildPiNotifyMenuChoices(config: UseReqConfig): ...|
|`selectPiNotifySoundLevel`|fn||1054-1085|async function selectPiNotifySoundLevel(|
|`configurePiNotifyMenu`|fn||1095-1200|async function configurePiNotifyMenu(|
|`registerPiNotifyShortcut`|fn||1215-1235|function registerPiNotifyShortcut(|
|`registerPromptCommands`|fn||1245-1265|function registerPromptCommands(|
|`registerAgentTools`|fn||1275-1574|function registerAgentTools(pi: ExtensionAPI): void|
|`buildPiUsereqToolsMenuChoices`|fn||1903-1943|function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, ...|
|`buildPiUsereqToolToggleChoices`|fn||1953-1969|function buildPiUsereqToolToggleChoices(pi: ExtensionAPI,...|
|`configurePiUsereqToolsMenu`|fn||1980-2031|async function configurePiUsereqToolsMenu(pi: ExtensionAP...|
|`formatStaticCheckEntry`|fn||2039-2045|function formatStaticCheckEntry(entry: StaticCheckEntry):...|
|`formatStaticCheckLanguagesSummary`|fn||2053-2059|function formatStaticCheckLanguagesSummary(config: UseReq...|
|`renderStaticCheckReference`|fn||2067-2095|function renderStaticCheckReference(config: UseReqConfig)...|
|`buildStaticCheckMenuChoices`|fn||2104-2139|function buildStaticCheckMenuChoices(config: UseReqConfig...|
|`buildSupportedStaticCheckLanguageChoices`|fn||2147-2166|function buildSupportedStaticCheckLanguageChoices(config:...|
|`buildConfiguredStaticCheckLanguageChoices`|fn||2174-2191|function buildConfiguredStaticCheckLanguageChoices(config...|
|`configureStaticCheckMenu`|fn||2201-2267|async function configureStaticCheckMenu(ctx: ExtensionCom...|
|`buildPiUsereqMenuChoices`|fn||2277-2338|function buildPiUsereqMenuChoices(|
|`buildSrcDirMenuChoices`|fn||2347-2368|function buildSrcDirMenuChoices(config: UseReqConfig): Pi...|
|`buildSrcDirRemovalChoices`|fn||2377-2392|function buildSrcDirRemovalChoices(config: UseReqConfig):...|
|`configurePiUsereq`|fn||2403-2488|async function configurePiUsereq(|
|`ensureSaved`|fn||2411-2415|const ensureSaved = () => saveProjectConfig(ctx.cwd, config)|
|`refreshStatus`|fn||2412-2415|const refreshStatus = () =>|
|`registerConfigCommands`|fn||2498-2508|function registerConfigCommands(|
|`piUsereqExtension`|fn||2526-2534|export default function piUsereqExtension(pi: ExtensionAP...|

