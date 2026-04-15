# Files Structure
```
.
├── scripts
│   └── debug-extension.ts
└── src
    ├── cli.ts
    ├── core
    │   ├── compress-files.ts
    │   ├── compress.ts
    │   ├── config.ts
    │   ├── doxygen-parser.ts
    │   ├── errors.ts
    │   ├── find-constructs.ts
    │   ├── generate-markdown.ts
    │   ├── pi-usereq-tools.ts
    │   ├── prompts.ts
    │   ├── resources.ts
    │   ├── source-analyzer.ts
    │   ├── static-check.ts
    │   ├── token-counter.ts
    │   ├── tool-runner.ts
    │   └── utils.ts
    └── index.ts
```

# debug-extension.ts | TypeScript | 497L | 17 symbols | 4 imports | 19 comments
> Path: `scripts/debug-extension.ts`
- @brief Implements the standalone extension debug harness CLI.
- @details Parses debug-harness subcommands, dispatches offline inspection and replay operations, formats reports as JSON or human-readable markdown, and converts `ReqError` instances into process-style stderr plus exit codes. Runtime is dominated by the selected harness subcommand. Side effects include stdout/stderr writes and any extension-owned behavior triggered by delegated replay operations.

## Imports
```
import process from "node:process";
import { ReqError } from "../src/core/errors.js";
import {
import { runSdkSmoke, type ParityMismatch, type SdkSmokeReport } from "./lib/sdk-smoke.js";
```

## Definitions

- type `type OutputFormat = "json" | "pretty";` (L26)
- @brief Enumerates the supported harness output formats.
- @details Keeps the CLI formatter selection constrained to deterministic JSON output or human-readable markdown output. The alias is compile-time only and introduces no runtime cost.
### iface `interface ParsedHarnessArgs` (L32-44)
- @brief Describes the parsed debug-harness CLI arguments.
- @details Captures the selected subcommand plus all recognized option values in the normalized shape consumed by `main`. The interface is compile-time only and introduces no runtime cost.

### fn `function parseArgs(argv: string[]): ParsedHarnessArgs` (L78-141)
- @brief Parses raw CLI arguments into a normalized harness command object.
- @details Performs a single left-to-right scan, records the first positional token as the subcommand, supports repeatable `--select` and `--input` options, and defaults the output format to `pretty`. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding executable and script path.
- @return {ParsedHarnessArgs} Parsed harness arguments.

### fn `function parseJsonObject(text: string | undefined, label: string, fallback: Record<string, unknown>): Record<string, unknown>` (L152-168)
- @brief Parses a JSON object option from the CLI.
- @details Accepts an omitted value as the supplied fallback, requires object payloads for present values, and wraps parse failures in `ReqError` for deterministic CLI error reporting. Runtime is O(n) in input size. No external state is mutated.
- @param[in] text {string | undefined} Raw JSON option value.
- @param[in] label {string} Human-readable option label.
- @param[in] fallback {Record<string, unknown>} Fallback object when the option is omitted.
- @return {Record<string, unknown>} Parsed JSON object.
- @throws {ReqError} Throws when the option is present but not valid JSON object syntax.

### fn `function writeStdout(text: string): void` (L176-180)
- @brief Writes non-empty text to stdout.
- @details Skips zero-length writes so callers can compose output safely. Runtime is O(n) in text length. Side effects are limited to stdout writes.
- @param[in] text {string} Text payload.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L188-193)
- @brief Writes non-empty text to stderr with a trailing newline.
- @details Appends a newline when needed and skips empty payloads. Runtime is O(n) in text length. Side effects are limited to stderr writes.
- @param[in] text {string} Text payload.
- @return {void} No return value.

### fn `function formatJson(value: unknown): string` (L201-203)
- @brief Serializes one arbitrary report as pretty-printed JSON.
- @details Uses two-space indentation and appends a trailing newline for stable automation-friendly output. Runtime is O(n) in report size. No external state is mutated.
- @param[in] value {unknown} Report payload.
- @return {string} JSON document.

### fn `function formatSnapshotHeader(snapshot: OfflineContractSnapshot): string[]` (L211-222)
- @brief Formats the common snapshot header for human-readable output.
- @details Renders normalized path metadata, registration counts, and event names shared by all offline reports. Runtime is O(n) in inventory size. No external state is mutated.
- @param[in] snapshot {OfflineContractSnapshot} Snapshot payload.
- @return {string[]} Markdown lines.

### fn `function formatInspectReport(report: InspectReport): string` (L230-249)
- @brief Formats one offline inspection report for human-readable output.
- @details Emits sections for inventory counts, commands, tools, sent user messages, and the generated usage manual. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {InspectReport} Inspection report.
- @return {string} Markdown document.

### fn `function formatUiState(ui: SessionStartReport["ui"]): string[]` (L257-281)
- @brief Formats one recorded UI state snapshot for human-readable output.
- @details Emits statuses, notifications, editor text, and scripted interaction traces used by session-start and command/tool replay reports. Runtime is O(n) in interaction count. No external state is mutated.
- @param[in] ui {SessionStartReport["ui"]} UI-state snapshot.
- @return {string[]} Markdown lines.

### fn `function formatSessionStartReport(report: SessionStartReport): string` (L289-300)
- @brief Formats one session-start replay report for human-readable output.
- @details Emits common snapshot metadata plus the recorded event payload and UI side effects. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {SessionStartReport} Session-start replay report.
- @return {string} Markdown document.

### fn `function formatCommandReplayReport(report: CommandReplayReport): string` (L308-325)
- @brief Formats one command replay report for human-readable output.
- @details Emits common snapshot metadata, command identity, sent user messages, and UI side effects. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {CommandReplayReport} Command replay report.
- @return {string} Markdown document.

### fn `function formatToolReplayReport(report: ToolReplayReport): string` (L333-352)
- @brief Formats one tool replay report for human-readable output.
- @details Emits common snapshot metadata, tool identity, input parameters, streamed updates, final result payload, and UI side effects. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {ToolReplayReport} Tool replay report.
- @return {string} Markdown document.

### fn `function formatMismatch(mismatch: ParityMismatch): string[]` (L360-367)
- @brief Formats one parity mismatch for human-readable output.
- @details Emits the category, subject, detail, and normalized offline versus SDK payloads for deterministic troubleshooting. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] mismatch {ParityMismatch} Mismatch payload.
- @return {string[]} Markdown lines.

### fn `function formatSdkSmokeReport(report: SdkSmokeReport): string` (L375-395)
- @brief Formats one SDK smoke report for human-readable output.
- @details Emits parity status, offline versus SDK inventory counts, runtime-shape metadata, and detailed mismatch entries when parity fails. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {SdkSmokeReport} SDK smoke report.
- @return {string} Markdown document.

### fn `function formatReport(` (L405-427)
- @brief Formats the selected report according to the requested output mode.
- @details Uses JSON for automation-friendly output and markdown for human review. Runtime is O(n) in report size. No external state is mutated.
- @param[in] format {OutputFormat} Requested output format.
- @param[in] subcommand {string} Executed harness subcommand.
- @param[in] report {InspectReport | SessionStartReport | CommandReplayReport | ToolReplayReport | SdkSmokeReport} Report payload.
- @return {string} Final stdout payload.

### fn `export async function main(argv = process.argv.slice(2)): Promise<number>` (L436-491)
- @brief Executes one standalone debug-harness invocation.
- @details Parses CLI arguments, validates subcommand-specific requirements, dispatches the selected harness workflow, and formats the result for stdout while converting `ReqError` failures into stderr plus exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and delegated extension replay behavior.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {Promise<number>} Process exit code.
- @throws {ReqError} Internally catches `ReqError` and returns its exit code.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`OutputFormat`|type||26||
|`ParsedHarnessArgs`|iface||32-44|interface ParsedHarnessArgs|
|`parseArgs`|fn||78-141|function parseArgs(argv: string[]): ParsedHarnessArgs|
|`parseJsonObject`|fn||152-168|function parseJsonObject(text: string | undefined, label:...|
|`writeStdout`|fn||176-180|function writeStdout(text: string): void|
|`writeStderr`|fn||188-193|function writeStderr(text: string): void|
|`formatJson`|fn||201-203|function formatJson(value: unknown): string|
|`formatSnapshotHeader`|fn||211-222|function formatSnapshotHeader(snapshot: OfflineContractSn...|
|`formatInspectReport`|fn||230-249|function formatInspectReport(report: InspectReport): string|
|`formatUiState`|fn||257-281|function formatUiState(ui: SessionStartReport["ui"]): str...|
|`formatSessionStartReport`|fn||289-300|function formatSessionStartReport(report: SessionStartRep...|
|`formatCommandReplayReport`|fn||308-325|function formatCommandReplayReport(report: CommandReplayR...|
|`formatToolReplayReport`|fn||333-352|function formatToolReplayReport(report: ToolReplayReport)...|
|`formatMismatch`|fn||360-367|function formatMismatch(mismatch: ParityMismatch): string[]|
|`formatSdkSmokeReport`|fn||375-395|function formatSdkSmokeReport(report: SdkSmokeReport): st...|
|`formatReport`|fn||405-427|function formatReport(|
|`main`|fn||436-491|export async function main(argv = process.argv.slice(2)):...|


---

# cli.ts | TypeScript | 356L | 9 symbols | 5 imports | 9 comments
> Path: `src/cli.ts`
- @brief Implements the standalone pi-usereq command-line entry point.
- @details Parses CLI flags, resolves project configuration, dispatches tool-runner operations, and converts thrown `ReqError` instances into process-style stdout, stderr, and exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and any filesystem or git operations performed by delegated commands.

## Imports
```
import process from "node:process";
import { ReqError } from "./core/errors.js";
import { loadConfig, saveConfig, type UseReqConfig } from "./core/config.js";
import {
import {
```

## Definitions

### iface `interface ParsedArgs` (L45-69)
- @brief Represents the parsed CLI flag state for one invocation.
- @details The interface captures every supported command and option in a normalized shape consumed by `main`. It is compile-time only and introduces no runtime cost.

### fn `function parseArgs(argv: string[]): ParsedArgs` (L77-201)
- @brief Parses raw CLI tokens into a normalized argument object.
- @details Performs a single left-to-right scan, supports options with variable-length value tails, and records only the last occurrence of scalar flags. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding the executable and script path.
- @return {ParsedArgs} Parsed flag object.

### fn `const takeUntilOption = (start: number): [string[], number] =>` (L79-87)

### fn `function writeStdout(text: string): void` (L209-211)
- @brief Writes text to stdout when non-empty.
- @details Avoids emitting zero-length writes so callers can compose result output safely. Runtime is O(n) in text length. Side effect: writes to `process.stdout`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L219-222)
- @brief Writes text to stderr and ensures a trailing newline.
- @details Skips empty input, appends a newline when necessary, and emits the final text to `process.stderr`. Runtime is O(n) in text length. Side effect: writes to `process.stderr`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeResult(result: { stdout: string; stderr: string; code: number }): number` (L230-234)
- @brief Emits a tool result object to process streams.
- @details Writes stdout first, then stderr, and returns the embedded exit code without modification. Runtime is O(n) in total emitted text size. Side effects are stdout/stderr writes.
- @param[in] result {{ stdout: string; stderr: string; code: number }} Command result payload.
- @return {number} Exit code to propagate from the invoked command.

### fn `function loadMutableProjectConfig(projectBase: string): { base: string; config: UseReqConfig }` (L243-253)
- @brief Loads mutable project config state without persisting intermediate repairs.
- @details Resolves the project base, loads existing config or defaults, refreshes `base-path`, recomputes `git-path` when the base resides inside a repository, and returns the in-memory pair used by CLI mutations. Runtime is dominated by config I/O plus optional git probing. Side effects are limited to config reads and git subprocess execution.
- @param[in] projectBase {string} Candidate project root path.
- @return {{ base: string; config: UseReqConfig }} Validated project base and repaired in-memory config.
- @satisfies REQ-035

### fn `function applyEnableStaticCheckSpecs(projectBase: string, specs: string[]): UseReqConfig` (L264-286)
- @brief Applies repeatable `--enable-static-check` specifications to project config.
- @details Parses each specification, validates command-backed entries before persistence, appends only non-duplicate identities in argument order, preserves existing entries, and writes the merged config once after all validations succeed. Runtime is O(s + e) plus PATH probing where s is spec count and e is existing entry count. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root path.
- @param[in] specs {string[]} Raw `--enable-static-check` specifications in CLI order.
- @return {UseReqConfig} Persisted merged project configuration.
- @throws {ReqError} Throws when parsing or validation fails.
- @satisfies REQ-035, REQ-036, REQ-037

### fn `export function main(argv = process.argv.slice(2)): number` (L295-352)
- @brief Executes one pi-usereq CLI invocation.
- @details Parses arguments, enforces mutually exclusive project-selection rules, repairs config when needed, dispatches the first matching command handler, and converts thrown `ReqError` instances into stream output plus numeric exit codes. Runtime is O(n) in argument count plus delegated command cost. Side effects include config repair writes and stdout/stderr output.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {number} Process exit code for the invocation.
- @throws {ReqError} Internally catches `ReqError` and returns its code; other errors are coerced into exit code `1` with stderr output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ParsedArgs`|iface||45-69|interface ParsedArgs|
|`parseArgs`|fn||77-201|function parseArgs(argv: string[]): ParsedArgs|
|`takeUntilOption`|fn||79-87|const takeUntilOption = (start: number): [string[], numbe...|
|`writeStdout`|fn||209-211|function writeStdout(text: string): void|
|`writeStderr`|fn||219-222|function writeStderr(text: string): void|
|`writeResult`|fn||230-234|function writeResult(result: { stdout: string; stderr: st...|
|`loadMutableProjectConfig`|fn||243-253|function loadMutableProjectConfig(projectBase: string): {...|
|`applyEnableStaticCheckSpecs`|fn||264-286|function applyEnableStaticCheckSpecs(projectBase: string,...|
|`main`|fn||295-352|export function main(argv = process.argv.slice(2)): number|


---

# compress-files.ts | TypeScript | 90L | 3 symbols | 3 imports | 4 comments
> Path: `src/core/compress-files.ts`
- @brief Compresses explicit source-file lists into compact fenced-markdown excerpts.
- @details Bridges file validation, language detection, per-file source compression, and final markdown packaging for prompt consumption. Runtime is O(F + S) where F is file count and S is total source size processed. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { compressFile, detectLanguage } from "./compress.js";
```

## Definitions

### fn `function extractLineRange(compressedWithLineNumbers: string): [number, number]` (L17-25)
- @brief Extracts the first and last original source line numbers from compressed output.
- @details Parses the line-number prefixes emitted by `compressFile(..., true)` and returns the inclusive range spanned by the compressed excerpt. Time complexity is O(n) in compressed line count. No external state is mutated.
- @param[in] compressedWithLineNumbers {string} Compressed source text containing `N:` prefixes.
- @return {[number, number]} Inclusive `[start, end]` source-line range, or `[0, 0]` when no numbered lines exist.

### fn `function formatOutputPath(filePath: string, outputBase?: string): string` (L34-37)
- @brief Formats one source path for markdown output.
- @details Returns the original file path when no base is provided. Otherwise computes a normalized POSIX-style relative path against the resolved output base. Time complexity is O(p) in path length. No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @param[in] outputBase {string | undefined} Optional base directory for relative formatting.
- @return {string} Display path used in the markdown header.

### fn `export function compressFiles(` (L49-90)
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
|`extractLineRange`|fn||17-25|function extractLineRange(compressedWithLineNumbers: stri...|
|`formatOutputPath`|fn||34-37|function formatOutputPath(filePath: string, outputBase?: ...|
|`compressFiles`|fn||49-90|export function compressFiles(|


---

# compress.ts | TypeScript | 357L | 7 symbols | 3 imports | 11 comments
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

### fn `function getSpecs()` (L57-60)
- @brief Returns the cached language specification table.
- @details Initializes the cache on first access by calling `buildLanguageSpecs`, then reuses the result for all subsequent calls. Time complexity is O(1) after cold start. Mutates module-local cache state only.
- @return {ReturnType<typeof buildLanguageSpecs>} Cached language specification map.

### fn `export function detectLanguage(filePath: string): string | undefined` (L68-70)
- @brief Infers a compression language from a file path extension.
- @details Lowercases the file extension and looks it up in `EXT_LANG_MAP`. Time complexity is O(1). No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @return {string | undefined} Canonical compression language identifier, or `undefined` when unsupported.

### fn `function isInString(line: string, pos: number, stringDelimiters: string[]): boolean` (L80-115)
- @brief Tests whether a character position falls inside a string literal.
- @details Scans the line left-to-right while tracking active string delimiters and escaped quote characters. Runtime is O(n) in inspected prefix length. No side effects occur.
- @param[in] line {string} Source line to inspect.
- @param[in] pos {number} Zero-based character position.
- @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
- @return {boolean} `true` when the position is inside a string literal.

### fn `function removeInlineComment(line: string, singleComment: string | undefined, stringDelimiters: string[]): string` (L125-165)
- @brief Removes a trailing single-line comment from a source line.
- @details Scans the line while respecting string literals so comment markers inside strings are preserved. Runtime is O(n) in line length. No external state is mutated.
- @param[in] line {string} Source line to strip.
- @param[in] singleComment {string | undefined} Language single-line comment marker.
- @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
- @return {string} Line content before the first real comment marker.

### fn `function formatResult(entries: Array<[number, string]>, includeLineNumbers: boolean): string` (L174-178)
- @brief Formats compressed source entries as newline-delimited text.
- @details Emits either `line: text` pairs or plain text lines depending on the caller flag. Runtime is O(n) in entry count and content length. No side effects occur.
- @param[in] entries {Array<[number, string]>} Compressed source lines paired with original line numbers.
- @param[in] includeLineNumbers {boolean} When `true`, prefix each line with its original line number.
- @return {string} Final compressed source text.

### fn `export function compressSource(source: string, language: string, includeLineNumbers = true): string` (L189-339)
- @brief Compresses in-memory source text for one language.
- @details Removes blank lines and comments, preserves shebangs, respects string-literal boundaries, and retains leading indentation for indentation-significant languages. Runtime is O(n) in source length. No external state is mutated.
- @param[in] source {string} Raw source text.
- @param[in] language {string} Canonical compression language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
- @return {string} Compressed source text.
- @throws {Error} Throws when the language is unsupported.

### fn `export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string` (L350-357)
- @brief Compresses one source file from disk.
- @details Detects the language when not supplied, reads the file as UTF-8, and delegates to `compressSource`. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] filePath {string} Source file path.
- @param[in] language {string | undefined} Optional explicit language override.
- @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
- @return {string} Compressed source text.
- @throws {Error} Throws when the language cannot be detected or the file cannot be read.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getSpecs`|fn||57-60|function getSpecs()|
|`detectLanguage`|fn||68-70|export function detectLanguage(filePath: string): string ...|
|`isInString`|fn||80-115|function isInString(line: string, pos: number, stringDeli...|
|`removeInlineComment`|fn||125-165|function removeInlineComment(line: string, singleComment:...|
|`formatResult`|fn||174-178|function formatResult(entries: Array<[number, string]>, i...|
|`compressSource`|fn||189-339|export function compressSource(source: string, language: ...|
|`compressFile`|fn||350-357|export function compressFile(filePath: string, language?:...|


---

# config.ts | TypeScript | 205L | 9 symbols | 6 imports | 14 comments
> Path: `src/core/config.ts`
- @brief Loads, normalizes, and persists pi-usereq project configuration.
- @details Defines the configuration schema, default directory conventions, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi/pi-usereq`.

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReqError } from "./errors.js";
import { normalizeEnabledPiUsereqTools } from "./pi-usereq-tools.js";
import { homeRelative, makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface StaticCheckEntry` (L18-22)
- @brief Describes one static-check module configuration entry.
- @details Each record identifies the checker module and optional command or parameter list used during per-language static analysis dispatch. The interface is type-only and has no runtime cost.

### iface `export interface UseReqConfig` (L28-36)
- @brief Defines the persisted pi-usereq project configuration schema.
- @details Captures documentation paths, source/test directory selection, static-check configuration, enabled startup tools, and git/base-path metadata. The interface is compile-time only and introduces no runtime side effects.

### fn `export function getProjectConfigPath(projectBase: string): string` (L65-67)
- @brief Computes the per-project config file path.
- @details Joins the project root with `.pi/pi-usereq/config.json`, producing the canonical persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {string} Absolute config file path.

### fn `export function getHomeResourceRoot(): string` (L74-76)
- @brief Computes the user-scoped resource directory for pi-usereq assets.
- @details Resolves the home directory and appends `.pi/pi-usereq/resources`. Time complexity is O(1). No filesystem writes occur.
- @return {string} Absolute home resource root path.

### fn `export function getDefaultConfig(projectBase: string): UseReqConfig` (L84-93)
- @brief Builds the default project configuration.
- @details Populates canonical docs/test/source directories, enables the default startup tool set, and records the provided project base path. Time complexity is O(n) in default tool count. No filesystem side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Fresh default configuration object.

### fn `export function loadConfig(projectBase: string): UseReqConfig` (L102-140)
- @brief Loads and sanitizes the persisted project configuration.
- @details Returns defaults when the config file does not exist. Otherwise parses JSON, validates core field shapes, applies fallbacks, and normalizes enabled tool names. Runtime is O(n) in config size. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Sanitized effective configuration.
- @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.

### fn `export function saveConfig(projectBase: string, config: UseReqConfig): void` (L149-153)
- @brief Persists the project configuration to disk.
- @details Creates the parent `.pi/pi-usereq` directory when necessary and writes formatted JSON terminated by a newline. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to persist.
- @return {void} No return value.

### fn `export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig` (L162-172)
- @brief Normalizes persisted directory fields to project-relative forms.
- @details Rewrites docs, tests, and source directories using project containment heuristics, strips trailing separators, and restores defaults for empty results. Runtime is O(n) in configured path count plus path-length processing. No filesystem writes occur.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to normalize.
- @return {UseReqConfig} Normalized configuration copy.

### fn `export function buildPromptReplacementPaths(projectBase: string, config: UseReqConfig): Record<string, string>` (L181-205)
- @brief Builds placeholder replacements for bundled prompt rendering.
- @details Computes project-relative docs, source, test, and guideline paths; enumerates visible guideline files from the home resource tree; and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {Record<string, string>} Placeholder-to-string replacement map.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckEntry`|iface||18-22|export interface StaticCheckEntry|
|`UseReqConfig`|iface||28-36|export interface UseReqConfig|
|`getProjectConfigPath`|fn||65-67|export function getProjectConfigPath(projectBase: string)...|
|`getHomeResourceRoot`|fn||74-76|export function getHomeResourceRoot(): string|
|`getDefaultConfig`|fn||84-93|export function getDefaultConfig(projectBase: string): Us...|
|`loadConfig`|fn||102-140|export function loadConfig(projectBase: string): UseReqCo...|
|`saveConfig`|fn||149-153|export function saveConfig(projectBase: string, config: U...|
|`normalizeConfigPaths`|fn||162-172|export function normalizeConfigPaths(projectBase: string,...|
|`buildPromptReplacementPaths`|fn||181-205|export function buildPromptReplacementPaths(projectBase: ...|


---

# doxygen-parser.ts | TypeScript | 168L | 5 symbols | 0 imports | 11 comments
> Path: `src/core/doxygen-parser.ts`
- @brief Parses repository-approved Doxygen tags and renders them as markdown bullets.
- @details Implements a constrained Doxygen grammar used by the source analyzer and construct finder. Parsing cost is linear in comment length. The module is pure and performs no I/O.

## Definitions

- type `export type DoxygenFieldMap = Record<string, string[]>;` (L62)
- @brief Represents parsed Doxygen fields grouped by normalized tag name.
- @details Each key maps to one or more textual payloads because the same tag may appear multiple times in a single comment. The alias is compile-time only and adds no runtime cost.
### fn `export function parseDoxygenComment(commentText: string): DoxygenFieldMap` (L70-103)
- @brief Parses repository-approved Doxygen fields from one comment block.
- @details Normalizes line endings, strips comment delimiters, locates supported tags, and accumulates tag payloads in declaration order. Unsupported content is ignored. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentText {string} Raw comment text including delimiters.
- @return {DoxygenFieldMap} Parsed tag payloads keyed by normalized tag name.

### fn `export function stripCommentDelimiters(text: string): string` (L111-127)
- @brief Removes language comment delimiters from raw comment text.
- @details Drops standalone opening and closing markers, strips leading comment prefixes on each line, and preserves semantic payload lines only. Runtime is O(n) in line count. No external state is mutated.
- @param[in] text {string} Raw comment text.
- @return {string} Cleaned multi-line payload without delimiter syntax.

### fn `export function normalizeWhitespace(text: string): string` (L135-151)
- @brief Collapses redundant whitespace while preserving paragraph boundaries.
- @details Converts repeated spaces to single spaces, trims each line, and reduces multiple blank lines to one blank separator. Runtime is O(n) in text length. No side effects occur.
- @param[in] text {string} Input text to normalize.
- @return {string} Canonically spaced text.

### fn `export function formatDoxygenFieldsAsMarkdown(doxygenFields: DoxygenFieldMap): string[]` (L159-168)
- @brief Serializes parsed Doxygen fields into markdown bullet lines.
- @details Iterates over `DOXYGEN_TAGS` in canonical order and emits one `- @tag value` line for every stored payload. Runtime is O(t + v) where t is tag count and v is total values. No side effects occur.
- @param[in] doxygenFields {DoxygenFieldMap} Parsed Doxygen field map.
- @return {string[]} Ordered markdown bullet lines.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`DoxygenFieldMap`|type||62||
|`parseDoxygenComment`|fn||70-103|export function parseDoxygenComment(commentText: string):...|
|`stripCommentDelimiters`|fn||111-127|export function stripCommentDelimiters(text: string): string|
|`normalizeWhitespace`|fn||135-151|export function normalizeWhitespace(text: string): string|
|`formatDoxygenFieldsAsMarkdown`|fn||159-168|export function formatDoxygenFieldsAsMarkdown(doxygenFiel...|


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

# find-constructs.ts | TypeScript | 280L | 10 symbols | 4 imports | 12 comments
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

### fn `function stripConstructComments(codeLines: string[], language: string, lineStart: number, includeLineNumbers: boolean): string` (L157-175)
- @brief Removes comments from a construct excerpt while preserving optional absolute line numbers.
- @details Reuses `compressSource` for comment stripping, then either drops local line numbers or translates them back into absolute file coordinates. Runtime is O(n) in excerpt length. No external state is mutated.
- @param[in] codeLines {string[]} Raw code lines belonging to the construct.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] lineStart {number} Absolute starting line number of the construct.
- @param[in] includeLineNumbers {boolean} When `true`, emit absolute source line prefixes.
- @return {string} Comment-stripped construct excerpt.

### fn `export function formatConstruct(element: SourceElement, sourceLines: string[], includeLineNumbers: boolean, language = "python"): string` (L186-201)
- @brief Formats one matched construct as markdown.
- @details Emits construct metadata, attached Doxygen fields, and a fenced code block stripped of comments. Runtime is O(n) in construct span length plus attached documentation size. No side effects occur.
- @param[in] element {SourceElement} Matched source element.
- @param[in] sourceLines {string[]} Full source file split into line-preserving entries.
- @param[in] includeLineNumbers {boolean} When `true`, include absolute source line prefixes.
- @param[in] language {string} Canonical analyzer language identifier. Defaults to `python`.
- @return {string} Markdown section for the matched construct.

### fn `export function findConstructsInFiles(` (L214-280)
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
|`stripConstructComments`|fn||157-175|function stripConstructComments(codeLines: string[], lang...|
|`formatConstruct`|fn||186-201|export function formatConstruct(element: SourceElement, s...|
|`findConstructsInFiles`|fn||214-280|export function findConstructsInFiles(|


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

# pi-usereq-tools.ts | TypeScript | 57L | 2 symbols | 0 imports | 5 comments
> Path: `src/core/pi-usereq-tools.ts`
- @brief Declares the built-in pi-usereq startup tool inventory.
- @details Provides the canonical tool-name list and normalization helpers used by configuration loading and extension startup. The module is side-effect free. Lookup and normalization costs are linear in the configured tool count.

## Definitions

- type `export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];` (L35)
- @brief Represents one valid startup-tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_STARTUP_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
### fn `export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[]` (L50-57)
- @brief Normalizes a user-configured startup-tool list.
- @details Returns the default full tool list when the input is not an array. Otherwise filters to string entries, removes names outside the canonical startup set, and deduplicates while preserving first-seen order. Time complexity is O(n). No external state is mutated.
- @param[in] value {unknown} Raw configuration payload for `enabled-tools`.
- @return {PiUsereqStartupToolName[]} Deduplicated canonical tool names.
- @post Returned values are members of `PI_USEREQ_STARTUP_TOOL_NAMES` only.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqStartupToolName`|type||35||
|`normalizeEnabledPiUsereqTools`|fn||50-57|export function normalizeEnabledPiUsereqTools(value: unkn...|


---

# prompts.ts | TypeScript | 180L | 5 symbols | 4 imports | 11 comments
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

### fn `function buildPiDevConformanceBlock(promptName: string, projectBase: string): string` (L92-101)
- @brief Builds the conditional pi.dev conformance block for one rendered prompt.
- @details Emits the manifest-driven rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the pi.dev manifest. Time complexity O(1). No filesystem writes.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Markdown bullet block or the empty string when injection is not applicable.
- @satisfies REQ-032, REQ-033, REQ-034

### fn `function injectPiDevConformanceBlock(text: string, promptName: string, projectBase: string): string` (L112-119)
- @brief Injects the pi.dev conformance block into the prompt behavior section.
- @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Prompt markdown with zero or one injected conformance block.
- @satisfies REQ-032, REQ-033, REQ-034

### fn `export function adaptPromptForInternalTools(text: string): string` (L128-134)
- @brief Rewrites bundled prompt tool references from legacy `req --...` syntax to internal tool names.
- @details Applies deterministic global regex replacements so prompt text matches the extension-registered tool surface instead of the standalone CLI spelling. Time complexity O(p*r) where p is pattern count and r is prompt length.
- @param[in] text {string} Prompt markdown before tool-reference normalization.
- @return {string} Prompt markdown with internal tool names.
- @satisfies REQ-003

### fn `export function applyReplacements(text: string, replacements: Record<string, string>): string` (L144-150)
- @brief Applies literal placeholder replacements to bundled prompt markdown.
- @details Replaces every placeholder token using split/join semantics so all occurrences are updated without regex escaping. Time complexity O(t*n) where t is replacement count and n is prompt length.
- @param[in] text {string} Prompt markdown containing placeholder tokens.
- @param[in] replacements {Record<string, string>} Token-to-value map.
- @return {string} Prompt markdown with all placeholder tokens expanded.
- @satisfies REQ-002

### fn `export function renderPrompt(` (L162-180)
- @brief Renders a bundled prompt for the current project context.
- @details Loads the bundled markdown template, expands configuration-derived placeholders, injects conditional pi.dev conformance guidance, and rewrites legacy tool references to internal names. Time complexity O(n) relative to prompt size. No tracked files are modified.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder and manifest resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @return {string} Fully rendered prompt markdown ready for `pi.sendUserMessage(...)`.
- @satisfies REQ-002, REQ-003, REQ-032, REQ-033, REQ-034

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`buildPiDevConformanceBlock`|fn||92-101|function buildPiDevConformanceBlock(promptName: string, p...|
|`injectPiDevConformanceBlock`|fn||112-119|function injectPiDevConformanceBlock(text: string, prompt...|
|`adaptPromptForInternalTools`|fn||128-134|export function adaptPromptForInternalTools(text: string)...|
|`applyReplacements`|fn||144-150|export function applyReplacements(text: string, replaceme...|
|`renderPrompt`|fn||162-180|export function renderPrompt(|


---

# resources.ts | TypeScript | 92L | 6 symbols | 4 imports | 7 comments
> Path: `src/core/resources.ts`
- @brief Resolves bundled resource locations and mirrors them into the user resource directory.
- @details Encapsulates package-root discovery, prompt enumeration, and one-way copying from bundled assets into `~/.pi/pi-usereq/resources`. File-system work is proportional to the number of copied entries. The module performs directory creation and file-copy side effects.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getHomeResourceRoot } from "./config.js";
```

## Definitions

### fn `export function getPackageRoot(): string` (L17-19)
- @brief Resolves the installed package root directory.
- @details Computes the parent directory of the current module file so bundled resources can be located without relying on process working directory. Time complexity is O(1). No filesystem writes occur.
- @return {string} Absolute package root path.

### fn `export function getBundledResourceRoot(): string` (L26-28)
- @brief Resolves the bundled resource directory inside the package.
- @details Joins the package root with `resources`, producing the immutable source tree used for prompt and guideline seeding. Time complexity is O(1). No I/O side effects occur.
- @return {string} Absolute bundled resource root path.

### fn `export function ensureHomeResources(): string` (L36-45)
- @brief Ensures bundled resources are available under the user's pi-usereq home directory.
- @details Creates the destination root when necessary and recursively copies non-hidden bundled files into it. Copy complexity is O(n) in the number of directory entries. Side effects include directory creation and file overwrites in the home resource tree.
- @return {string} Absolute destination resource root path.
- @post Destination directory exists when bundled resources are present.

### fn `function copyDirectoryContents(sourceDir: string, destinationDir: string): void` (L54-67)
- @brief Recursively copies visible files from one directory tree into another.
- @details Skips hidden entries, creates intermediate directories lazily, and mirrors regular files using `fs.copyFileSync`. Time complexity is O(n) in traversed entries. Side effects mutate the destination filesystem tree.
- @param[in] sourceDir {string} Absolute or relative source directory path.
- @param[in] destinationDir {string} Absolute or relative destination directory path.
- @return {void} No return value.

### fn `export function readBundledPrompt(promptName: string): string` (L76-79)
- @brief Reads one bundled markdown prompt by logical prompt name.
- @details Resolves the prompt file under the bundled `resources/prompts` directory and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] promptName {string} Prompt identifier without the `.md` suffix.
- @return {string} Raw prompt markdown content.
- @throws {Error} Propagates `fs.readFileSync` errors when the prompt file is missing or unreadable.

### fn `export function listBundledPromptNames(): string[]` (L86-92)
- @brief Lists bundled prompt identifiers available in the package resources.
- @details Scans the prompt directory, keeps visible markdown files only, strips the `.md` suffix, and returns a lexicographically sorted list. Time complexity is O(n log n). Side effects are limited to filesystem reads.
- @return {string[]} Sorted prompt names without file extensions.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getPackageRoot`|fn||17-19|export function getPackageRoot(): string|
|`getBundledResourceRoot`|fn||26-28|export function getBundledResourceRoot(): string|
|`ensureHomeResources`|fn||36-45|export function ensureHomeResources(): string|
|`copyDirectoryContents`|fn||54-67|function copyDirectoryContents(sourceDir: string, destina...|
|`readBundledPrompt`|fn||76-79|export function readBundledPrompt(promptName: string): st...|
|`listBundledPromptNames`|fn||86-92|export function listBundledPromptNames(): string[]|


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

### fn `export function formatMarkdown(` (L1469-1721)
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
|`formatMarkdown`|fn||1469-1721|export function formatMarkdown(|
|`renderBodyAnnotations`|fn||1695-1721|function renderBodyAnnotations(|


---

# static-check.ts | TypeScript | 674L | 18 symbols | 7 imports | 34 comments
> Path: `src/core/static-check.ts`
- @brief Defines static-check language mappings and checker dispatch implementations.
- @details Parses static-check configuration syntax, resolves file targets, and runs built-in or command-based analyzers such as Pylance and Ruff. Runtime is linear in file count plus external tool cost. Side effects include filesystem reads, PATH probing, process spawning, and console output.

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

### iface `export interface StaticCheckLanguageSupport` (L85-88)
- @brief Describes supported extensions for one canonical static-check language.
- @details The interface is used for UI rendering and capability reporting only. It is compile-time only and adds no runtime cost.

### fn `export function getSupportedStaticCheckLanguages(): string[]` (L106-108)
- @brief Returns the sorted list of canonical languages with extension support.
- @details Deduplicates the extension map values and sorts them alphabetically for stable UI and error messages. Runtime is O(n log n). No side effects occur.
- @return {string[]} Sorted canonical language names.

### fn `export function getSupportedStaticCheckLanguageSupport(): StaticCheckLanguageSupport[]` (L115-126)
- @brief Returns supported languages paired with their known file extensions.
- @details Groups extensions by canonical language and emits alphabetically sorted extension lists. Runtime is O(n log n). No external state is mutated.
- @return {StaticCheckLanguageSupport[]} Sorted language-support descriptors.

### fn `function formatStaticCheckModules(): string` (L133-135)
- @brief Formats the supported module list for diagnostics.
- @details Joins `STATIC_CHECK_MODULES` with commas for direct insertion into error strings. Time complexity is O(n). No side effects occur.
- @return {string} Comma-delimited module names.

### fn `function splitCsvLikeTokens(specRhs: string): string[]` (L143-165)
- @brief Splits a comma-delimited static-check specification while honoring quotes.
- @details Performs a single pass over the right-hand side of `LANG=...`, preserving commas inside quoted segments. Runtime is O(n). No side effects occur.
- @param[in] specRhs {string} Right-hand side of the enable-static-check specification.
- @return {string[]} Parsed tokens with surrounding whitespace trimmed.

### fn `export function parseEnableStaticCheck(spec: string): [string, StaticCheckEntry]` (L174-222)
- @brief Parses one `LANG=MODULE[,CMD[,PARAM...]]` static-check specification.
- @details Validates the language alias, canonicalizes the module name, enforces module-specific argument requirements, and returns a config entry ready for persistence. Runtime is O(n) in specification length. No external state is mutated.
- @param[in] spec {string} Raw static-check specification string.
- @return {[string, StaticCheckEntry]} Tuple of canonical language name and normalized checker configuration.
- @throws {ReqError} Throws for missing separators, unknown languages, unknown modules, or missing required command arguments.

### fn `export function buildStaticCheckEntryIdentity(language: string, entry: StaticCheckEntry): string` (L232-237)
- @brief Builds the duplicate-identity token for one static-check entry.
- @details Canonicalizes the language key, module name, command name, and parameter list into a stable JSON tuple used for merge deduplication. Runtime is O(p) in parameter count. No side effects occur.
- @param[in] language {string} Canonical or alias language name associated with the entry.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to normalize.
- @return {string} Stable identity token suitable for equality comparison.
- @satisfies REQ-036

### fn `export function validateStaticCheckEntry(entry: StaticCheckEntry): void` (L247-258)
- @brief Validates pre-persistence invariants for one static-check entry.
- @details Rejects `Command` entries whose executable cannot be resolved before config writes while leaving non-command modules untouched. Runtime is O(p) in PATH entry count. Side effects are limited to filesystem reads.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to validate.
- @return {void} No return value.
- @throws {ReqError} Throws when a `Command` entry omits `cmd` or resolves to a non-executable program.
- @satisfies REQ-037

### fn `function resolveFiles(inputs: string[]): string[]` (L266-290)
- @brief Resolves explicit files, directories, and glob patterns into absolute file paths.
- @details Expands glob inputs with `fast-glob`, enumerates direct children for directory inputs, accepts regular files, and warns for invalid entries. Runtime is O(n + m) where m is the total matched path count. Side effects are filesystem reads and warning output to stderr.
- @param[in] inputs {string[]} Raw file, directory, or glob inputs.
- @return {string[]} Unique absolute file paths.

### class `export class StaticCheckBase` (L296-370)
- @brief Provides the base implementation for file-oriented static checks.
- @details Resolves input files once, emits standardized headers, and defines overridable `checkFile` and `emitLine` hooks used by concrete analyzers. Runtime is O(f) plus subclass checker cost. Side effects include console output.

### fn `function detectPythonExecutable(projectBase?: string): string` (L378-398)
- @brief Resolves the preferred Python executable for Python-based checkers.
- @details Checks the project virtual environment first, then `PI_USEREQ_PYTHON`, then `python3`, then `python`, and finally falls back to the literal `python3` string. Runtime is O(c) in candidate count. Side effects are filesystem reads and PATH probing.
- @param[in] projectBase {string | undefined} Optional project root used to probe `.venv/bin/python`.
- @return {string} Executable path or command name.

### class `export class StaticCheckPylance extends StaticCheckBase` : StaticCheckBase (L404-455)
- @brief Runs Pyright/Pylance checks through the selected Python interpreter.
- @details Invokes `python -m pyright` for each resolved file and emits standardized OK/FAIL records. Runtime is dominated by external checker execution. Side effects include process spawning and console output.

### class `export class StaticCheckRuff extends StaticCheckBase` : StaticCheckBase (L461-509)
- @brief Runs Ruff checks through the selected Python interpreter.
- @details Invokes `python -m ruff check` for each resolved file and emits standardized OK/FAIL records. Runtime is dominated by external checker execution. Side effects include process spawning and console output.

### class `export class StaticCheckCommand extends StaticCheckBase` : StaticCheckBase (L515-564)
- @brief Runs an arbitrary external command as a static checker.
- @brief Initializes a command-backed checker instance.
- @details Validates command availability on PATH during construction, then invokes the command with configured extra arguments plus one target file at a time. Runtime is dominated by external command execution. Side effects include PATH probing, process spawning, and console output.
- @details Validates that the executable exists on PATH before delegating file resolution to the base class and recording the command label. Runtime is O(p + f) where p is PATH entry count and f is resolved input count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name.
- @param[in] inputs {string[]} Raw file inputs.
- @param[in] extraArgs {string[] | undefined} Extra command arguments.
- @param[in] failOnly {boolean} When `true`, suppress successful-file output.
- @throws {ReqError} Throws when the executable cannot be found on PATH.

### fn `function isExecutableFile(candidate: string): boolean` (L572-582)
- @brief Tests whether one filesystem path is executable.
- @details Requires the candidate to exist, be a regular file, and pass `X_OK` access checks. Runtime is O(1). Side effects are limited to filesystem reads.
- @param[in] candidate {string} Absolute or relative path to inspect.
- @return {boolean} `true` when the candidate is executable by the current process.

### fn `function findExecutable(cmd: string): string | undefined` (L590-601)
- @brief Locates an executable by scanning the current PATH.
- @details Checks each PATH directory for an executable file named exactly as the requested command. Runtime is O(p) in PATH entry count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name to locate.
- @return {string | undefined} Absolute executable path, or `undefined` when not found.

### fn `export function dispatchStaticCheckForFile(` (L612-615)
- @brief Dispatches one configured static checker for a single file.
- @details Selects the checker implementation by module name, normalizes parameter arrays, and runs exactly one checker instance against the target file. Runtime is dominated by the selected checker. Side effects include console output and possible process spawning.
- @param[in] filePath {string} Absolute or relative file path to check.
- @param[in] langConfig {StaticCheckEntry} Normalized static-check configuration entry.
- @param[in] options {{ failOnly?: boolean; projectBase?: string }} Optional execution controls.
- @return {number} Checker exit status where `0` means success and non-zero means failure.
- @throws {ReqError} Throws when configuration is incomplete or names an unknown module.

### fn `export function runStaticCheck(argv: string[]): number` (L649-674)
- @brief Runs the standalone static-check test driver.
- @details Dispatches subcommands to the built-in checker implementations without consulting project configuration. Runtime is O(n) in argument count plus checker cost. Side effects include console output and external process spawning.
- @param[in] argv {string[]} Raw static-check subcommand arguments.
- @return {number} Checker exit status where `0` means success.
- @throws {ReqError} Throws when no subcommand is provided, the subcommand is unknown, or required arguments are missing.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckLanguageSupport`|iface||85-88|export interface StaticCheckLanguageSupport|
|`getSupportedStaticCheckLanguages`|fn||106-108|export function getSupportedStaticCheckLanguages(): string[]|
|`getSupportedStaticCheckLanguageSupport`|fn||115-126|export function getSupportedStaticCheckLanguageSupport():...|
|`formatStaticCheckModules`|fn||133-135|function formatStaticCheckModules(): string|
|`splitCsvLikeTokens`|fn||143-165|function splitCsvLikeTokens(specRhs: string): string[]|
|`parseEnableStaticCheck`|fn||174-222|export function parseEnableStaticCheck(spec: string): [st...|
|`buildStaticCheckEntryIdentity`|fn||232-237|export function buildStaticCheckEntryIdentity(language: s...|
|`validateStaticCheckEntry`|fn||247-258|export function validateStaticCheckEntry(entry: StaticChe...|
|`resolveFiles`|fn||266-290|function resolveFiles(inputs: string[]): string[]|
|`StaticCheckBase`|class||296-370|export class StaticCheckBase|
|`detectPythonExecutable`|fn||378-398|function detectPythonExecutable(projectBase?: string): st...|
|`StaticCheckPylance`|class||404-455|export class StaticCheckPylance extends StaticCheckBase|
|`StaticCheckRuff`|class||461-509|export class StaticCheckRuff extends StaticCheckBase|
|`StaticCheckCommand`|class||515-564|export class StaticCheckCommand extends StaticCheckBase|
|`isExecutableFile`|fn||572-582|function isExecutableFile(candidate: string): boolean|
|`findExecutable`|fn||590-601|function findExecutable(cmd: string): string | undefined|
|`dispatchStaticCheckForFile`|fn||612-615|export function dispatchStaticCheckForFile(|
|`runStaticCheck`|fn||649-674|export function runStaticCheck(argv: string[]): number|


---

# token-counter.ts | TypeScript | 129L | 4 symbols | 3 imports | 9 comments
> Path: `src/core/token-counter.ts`
- @brief Provides token and character counting utilities for documentation packs.
- @details Wraps `js-tiktoken` encoding lookup and applies it to in-memory content or file lists. Runtime is linear in processed text size. Side effects are limited to filesystem reads in multi-file helpers.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
```

## Definitions

### class `export class TokenCounter` (L15-54)
- @brief Encapsulates one tokenizer instance for repeated token counting.
- @brief Stores the tokenizer implementation used for subsequent counts.
- @details Caches a `js-tiktoken` encoding object so multiple documents can be counted without repeated encoding lookup. Counting cost is O(n) in content length. The class mutates only instance state during construction.
- @details The field holds the encoder returned by `getEncoding`. Access complexity is O(1). The value is initialized once per instance.

### fn `export function countFileMetrics(content: string, encodingName = "cl100k_base"): { tokens: number; chars: number }` (L63-69)
- @brief Counts tokens and characters for one in-memory content string.
- @details Instantiates a `TokenCounter`, tokenizes the supplied text, and pairs the result with raw character length. Runtime is O(n). No filesystem I/O occurs.
- @param[in] content {string} Text payload to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {{ tokens: number; chars: number }} Aggregate metrics for the supplied content.

### fn `export function countFilesMetrics(filePaths: string[], encodingName = "cl100k_base")` (L78-97)
- @brief Counts tokens and characters for multiple files.
- @details Reuses a single `TokenCounter`, reads each file as UTF-8, and returns per-file metrics. Read failures are captured as error strings instead of aborting the entire batch. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] filePaths {string[]} File paths to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {Array<{ file: string; tokens: number; chars: number; error?: string }>} Per-file metrics and optional read errors.

### fn `export function formatPackSummary(results: Array<{ file: string; tokens: number; chars: number; error?: string }>): string` (L105-129)
- @brief Formats per-file token metrics as a human-readable summary block.
- @details Aggregates totals, emits one status line per file, and appends a summary footer containing file, token, and character counts. Runtime is O(n). No external state is mutated.
- @param[in] results {Array<{ file: string; tokens: number; chars: number; error?: string }>} Per-file metric records.
- @return {string} Multiline summary suitable for CLI or editor output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`TokenCounter`|class||15-54|export class TokenCounter|
|`countFileMetrics`|fn||63-69|export function countFileMetrics(content: string, encodin...|
|`countFilesMetrics`|fn||78-97|export function countFilesMetrics(filePaths: string[], en...|
|`formatPackSummary`|fn||105-129|export function formatPackSummary(results: Array<{ file: ...|


---

# tool-runner.ts | TypeScript | 707L | 36 symbols | 11 imports | 36 comments
> Path: `src/core/tool-runner.ts`
- @brief Implements the executable back-end for all pi-usereq CLI and extension tools.
- @details Centralizes project discovery, git helpers, source-file collection, documentation generation, compression, construct lookup, static-check dispatch, and worktree lifecycle operations. Runtime depends on the selected command and may include filesystem reads, config writes, process spawning, and git mutations.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { loadConfig, saveConfig, type UseReqConfig } from "./config.js";
import { countFilesMetrics, formatPackSummary } from "./token-counter.js";
import { generateMarkdown } from "./generate-markdown.js";
import { compressFiles } from "./compress-files.js";
import { findConstructsInFiles } from "./find-constructs.js";
import { STATIC_CHECK_EXT_TO_LANG, dispatchStaticCheckForFile } from "./static-check.js";
import { makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface ToolResult` (L23-27)
- @brief Represents the normalized output contract for a tool invocation.
- @details Every tool emits stdout, stderr, and a numeric exit code so CLI and extension front-ends can handle results uniformly. The interface is compile-time only and adds no runtime cost.

### fn `function ok(stdout = "", stderr = ""): ToolResult` (L47-49)
- @brief Creates a successful tool result payload.
- @details Wraps stdout and stderr text with exit code `0`. Runtime is O(1). No side effects occur.
- @param[in] stdout {string} Standard-output text.
- @param[in] stderr {string} Standard-error text.
- @return {ToolResult} Successful result object.

### fn `function fail(message: string, code = 1, stdout = "", stderr = ""): never` (L61-66)
- @brief Throws a `ReqError` populated with tool-result stream content.
- @details Creates a structured failure object, attaches optional stdout and stderr payloads, and throws immediately. Runtime is O(1). Side effect: throws an exception.
- @param[in] message {string} Primary failure message.
- @param[in] code {number} Exit code to attach. Defaults to `1`.
- @param[in] stdout {string} Optional stdout payload.
- @param[in] stderr {string} Optional stderr payload. Defaults to `message` when omitted.
- @return {never} This function never returns.
- @throws {ReqError} Always throws.

### fn `function runCapture(command: string[], options: { cwd?: string } = {})` (L75-80)
- @brief Executes a subprocess synchronously and captures its output.
- @details Delegates to `spawnSync`, passes through an optional working directory, and forces UTF-8 decoding. Runtime is dominated by external process execution. Side effects include process spawning.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] options {{ cwd?: string }} Optional process-spawn settings.
- @return {ReturnType<typeof spawnSync>} Captured subprocess result.

### fn `export function isInsideGitRepo(targetPath: string): boolean` (L88-91)
- @brief Tests whether a path is inside a git work tree.
- @details Runs `git rev-parse --is-inside-work-tree` in the target directory and returns `true` only for a successful `true` response. Runtime is dominated by git invocation. Side effects include process spawning.
- @param[in] targetPath {string} Directory to test.
- @return {boolean} `true` when the path is inside a git repository.

### fn `export function resolveGitRoot(targetPath: string): string` (L100-106)
- @brief Resolves the git repository root for a target path.
- @details Runs `git rev-parse --show-toplevel` and normalizes the result to an absolute path. Runtime is dominated by git invocation. Side effects include process spawning.
- @param[in] targetPath {string} Directory inside the repository.
- @return {string} Absolute git root path.
- @throws {ReqError} Throws when the path is not inside a git repository.

### fn `export function sanitizeBranchName(branch: string): string` (L114-116)
- @brief Rewrites a branch name into a filesystem-safe token.
- @details Replaces characters invalid for worktree directory and branch-name generation with `-`. Runtime is O(n). No side effects occur.
- @param[in] branch {string} Raw branch name.
- @return {string} Sanitized token.

### fn `export function validateWtName(wtName: string): boolean` (L124-127)
- @brief Validates a requested worktree or branch name.
- @details Rejects empty names, dot-path markers, whitespace, and filesystem-invalid characters. Runtime is O(n). No side effects occur.
- @param[in] wtName {string} Candidate worktree name.
- @return {boolean} `true` when the name is acceptable for worktree creation.

### fn `export function collectSourceFiles(srcDirs: string[], projectBase: string): string[]` (L137-164)
- @brief Collects tracked and untracked source files from configured source directories.
- @details Uses `git ls-files` to enumerate candidate files, filters them by configured source roots, excluded directories, and supported extensions, and returns sorted absolute paths. Runtime is O(n log n) in collected file count plus git execution cost. Side effects include process spawning.
- @param[in] srcDirs {string[]} Configured source-directory roots.
- @param[in] projectBase {string} Absolute project root.
- @return {string[]} Sorted absolute source-file paths.
- @throws {ReqError} Throws when `git ls-files` fails.

### fn `function buildAsciiTree(paths: string[]): string` (L172-200)
- @brief Builds an ASCII tree from relative file paths.
- @details Materializes a nested object tree and renders it using box-drawing characters for markdown display. Runtime is O(n log n) in path count due to sorting. No side effects occur.
- @param[in] paths {string[]} Relative POSIX-style file paths.
- @return {string} Rendered ASCII tree.

### fn `const emit = (branch: Record<string, Record<string, unknown> | null>, prefix = "") =>` (L188-197)

### fn `function formatFilesStructureMarkdown(files: string[], projectBase: string): string` (L209-212)
- @brief Formats the collected file structure as markdown.
- @details Converts absolute file paths to project-relative POSIX paths, renders an ASCII tree, and wraps the result in a fenced markdown block. Runtime is O(n log n) in file count. No side effects occur.
- @param[in] files {string[]} Absolute file paths.
- @param[in] projectBase {string} Absolute project root.
- @return {string} Markdown section describing the file structure.

### fn `export function resolveProjectBase(projectBase?: string): string` (L221-227)
- @brief Resolves and validates the project base directory.
- @details Uses the supplied path or the current working directory, normalizes it to an absolute path, and verifies that it exists. Runtime is O(1) plus one filesystem existence check. Side effects are limited to filesystem reads.
- @param[in] projectBase {string | undefined} Optional project-root override.
- @return {string} Absolute validated project root.
- @throws {ReqError} Throws when the resolved path does not exist.

### fn `export function resolveProjectSrcDirs(projectBase: string, config?: UseReqConfig): [string, string[]]` (L237-245)
- @brief Resolves the project base and effective source-directory list.
- @details Loads configuration when not supplied, validates that at least one source directory exists in config, and returns both the absolute base path and source-directory array. Runtime is O(s). Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {[string, string[]]} Tuple of absolute project base and configured source directories.
- @throws {ReqError} Throws when no source directories are configured.

### fn `export function loadAndRepairConfig(projectBase: string): UseReqConfig` (L253-262)
- @brief Loads project configuration and refreshes derived path metadata.
- @details Resolves the base path, loads config, updates `base-path`, refreshes `git-path` when inside a repository, saves the repaired config, and returns it. Runtime is dominated by config I/O and git detection. Side effects include config writes and git subprocess execution.
- @param[in] projectBase {string} Candidate project root.
- @return {UseReqConfig} Repaired effective configuration.

### fn `export function runFilesTokens(files: string[]): ToolResult` (L271-283)
- @brief Counts tokens and characters for explicit files.
- @details Filters missing files into stderr warnings, counts metrics for valid files, and returns a formatted summary. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] files {string[]} Explicit file paths.
- @return {ToolResult} Tool result containing the formatted summary and warnings.
- @throws {ReqError} Throws when no valid files are provided.

### fn `export function runFilesReferences(files: string[], cwd = process.cwd(), verbose = false): ToolResult` (L293-295)
- @brief Generates reference markdown for explicit files.
- @details Delegates to `generateMarkdown` using the caller working directory as the relative-output base by default. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory for relative output formatting. Defaults to `process.cwd()`.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing rendered markdown.

### fn `export function runFilesCompress(files: string[], cwd = process.cwd(), enableLineNumbers = false, verbose = false): ToolResult` (L306-308)
- @brief Compresses explicit files into compact source excerpts.
- @details Delegates to `compressFiles` using the caller working directory as the relative-output base by default. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory for relative output formatting. Defaults to `process.cwd()`.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.

### fn `export function runFilesFind(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult` (L319-325)
- @brief Finds named constructs in explicit files.
- @details Expects `[TAG, PATTERN, ...FILES]`, validates minimum arity, and delegates to `findConstructsInFiles`. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] argsList {string[]} Positional argument list containing tag filter, regex pattern, and files.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
- @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
- @return {ToolResult} Successful tool result containing construct markdown.
- @throws {ReqError} Throws when required arguments are missing.

### fn `export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult` (L336-342)
- @brief Generates project-wide reference markdown for configured source directories.
- @details Resolves the project base, collects source files, renders the file tree, and appends analyzer-generated markdown for all collected files. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing file-tree and reference markdown.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L354-359)
- @brief Compresses all source files from configured source directories.
- @details Resolves the project base, collects source files, and delegates to `compressFiles`. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runFind(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L373-382)
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

### fn `export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult` (L392-401)
- @brief Counts tokens for canonical documentation files.
- @details Loads the configured docs directory, selects `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` when present, and delegates to `runFilesTokens`. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Tool result containing documentation token metrics.
- @throws {ReqError} Throws when no canonical docs files exist.

### fn `export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult` (L411-447)
- @brief Runs configured static checks for explicit files.
- @details Loads the effective static-check config, groups checks by file extension language, captures checker stdout for each configured entry, and aggregates stderr warnings for invalid paths. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] files {string[]} Explicit file paths.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.

### fn `export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L457-470)
- @brief Runs configured static checks for project source and test directories.
- @details Collects source and test files, excludes fixture roots, and delegates to `runFilesStaticCheck`. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runGitCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L480-503)
- @brief Verifies that the configured repository is clean and has a valid HEAD.
- @details Executes a shell pipeline that checks work-tree status, rejects uncommitted changes, and verifies either a symbolic ref or detached HEAD hash exists. Runtime is dominated by git execution. Side effects include process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when the repository state is valid.
- @throws {ReqError} Throws when `git-path` is missing or repository status is unclear.

### fn `export function runDocsCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L513-531)
- @brief Verifies that canonical documentation files exist.
- @details Checks the configured docs directory for `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md`, and throws a guided error for the first missing file. Runtime is O(1) plus filesystem existence checks. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when all canonical docs exist.
- @throws {ReqError} Throws when `git-path` metadata is invalid or a required doc file is missing.

### fn `export function runGitWtName(projectBase: string, config?: UseReqConfig): ToolResult` (L541-555)
- @brief Generates the standardized worktree name for the configured repository.
- @details Combines the repository basename, sanitized current branch, and a timestamp-based execution identifier into a deterministic `useReq-...` name. Runtime is O(1) plus git execution cost. Side effects include process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the generated worktree name and trailing newline.
- @throws {ReqError} Throws when `git-path` is missing or invalid.

### fn `function worktreePathExistsExact(gitPath: string, targetPath: string): boolean` (L565-570)
- @brief Tests whether a git worktree exists at an exact filesystem path.
- @details Parses `git worktree list --porcelain` output and compares normalized paths for exact equality. Runtime is O(n) in reported worktree count plus git execution cost. Side effects include process spawning.
- @param[in] gitPath {string} Git root used to query worktrees.
- @param[in] targetPath {string} Candidate worktree path.
- @return {boolean} `true` when a worktree exists at the exact target path.
- @throws {ReqError} Throws when the worktree list cannot be queried.

### fn `function rollbackWorktreeCreate(gitPath: string, wtPath: string, wtName: string): void` (L581-587)
- @brief Rolls back a partially created worktree and branch.
- @details Forces worktree removal and branch deletion, then throws if either rollback action fails. Runtime is dominated by git execution. Side effects include destructive git mutations.
- @param[in] gitPath {string} Git root path.
- @param[in] wtPath {string} Worktree path to remove.
- @param[in] wtName {string} Branch name to delete.
- @return {void} No return value.
- @throws {ReqError} Throws when rollback cannot be completed.

### fn `export function runGitWtCreate(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L598-635)
- @brief Creates a dedicated git worktree and copies pi-usereq metadata into it.
- @details Validates the requested name, resolves base and git roots, creates the worktree and branch, then mirrors the `.pi/pi-usereq` directory into the corresponding path inside the new worktree. Runtime is dominated by git and filesystem operations. Side effects include worktree creation, branch creation, directory creation, and file copying.
- @param[in] projectBase {string} Candidate project root.
- @param[in] wtName {string} Requested worktree and branch name.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when creation completes.
- @throws {ReqError} Throws for invalid names, missing git metadata, git failures, or copy finalization failures.

### fn `const baseDir = (() =>` (L613-616)

### fn `export function runGitWtDelete(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L646-681)
- @brief Deletes a dedicated git worktree and its branch.
- @details Verifies that either the worktree path or branch exists, removes the worktree when present, deletes the branch when present, and fails atomically when either delete step reports an error. Runtime is dominated by git execution. Side effects include destructive git mutations.
- @param[in] projectBase {string} Candidate project root.
- @param[in] wtName {string} Exact worktree and branch name.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when deletion completes.
- @throws {ReqError} Throws when git metadata is missing, the target does not exist, or removal fails.

### fn `const branchExists = (() =>` (L657-660)

### fn `export function runGitPath(projectBase: string, config?: UseReqConfig): ToolResult` (L690-694)
- @brief Returns the configured git root path.
- @details Resolves the effective configuration and writes the stored `git-path` followed by a newline. Runtime is O(1) plus config-load cost. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the configured git path or an empty line.

### fn `export function runGetBasePath(projectBase: string, config?: UseReqConfig): ToolResult` (L703-707)
- @brief Returns the configured project base path.
- @details Resolves the effective configuration and writes the stored `base-path`, falling back to the resolved base when absent. Runtime is O(1) plus config-load cost. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the base path and trailing newline.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolResult`|iface||23-27|export interface ToolResult|
|`ok`|fn||47-49|function ok(stdout = "", stderr = ""): ToolResult|
|`fail`|fn||61-66|function fail(message: string, code = 1, stdout = "", std...|
|`runCapture`|fn||75-80|function runCapture(command: string[], options: { cwd?: s...|
|`isInsideGitRepo`|fn||88-91|export function isInsideGitRepo(targetPath: string): boolean|
|`resolveGitRoot`|fn||100-106|export function resolveGitRoot(targetPath: string): string|
|`sanitizeBranchName`|fn||114-116|export function sanitizeBranchName(branch: string): string|
|`validateWtName`|fn||124-127|export function validateWtName(wtName: string): boolean|
|`collectSourceFiles`|fn||137-164|export function collectSourceFiles(srcDirs: string[], pro...|
|`buildAsciiTree`|fn||172-200|function buildAsciiTree(paths: string[]): string|
|`emit`|fn||188-197|const emit = (branch: Record<string, Record<string, unkno...|
|`formatFilesStructureMarkdown`|fn||209-212|function formatFilesStructureMarkdown(files: string[], pr...|
|`resolveProjectBase`|fn||221-227|export function resolveProjectBase(projectBase?: string):...|
|`resolveProjectSrcDirs`|fn||237-245|export function resolveProjectSrcDirs(projectBase: string...|
|`loadAndRepairConfig`|fn||253-262|export function loadAndRepairConfig(projectBase: string):...|
|`runFilesTokens`|fn||271-283|export function runFilesTokens(files: string[]): ToolResult|
|`runFilesReferences`|fn||293-295|export function runFilesReferences(files: string[], cwd =...|
|`runFilesCompress`|fn||306-308|export function runFilesCompress(files: string[], cwd = p...|
|`runFilesFind`|fn||319-325|export function runFilesFind(argsList: string[], enableLi...|
|`runReferences`|fn||336-342|export function runReferences(projectBase: string, config...|
|`runCompress`|fn||354-359|export function runCompress(projectBase: string, config?:...|
|`runFind`|fn||373-382|export function runFind(projectBase: string, tagFilter: s...|
|`runTokens`|fn||392-401|export function runTokens(projectBase: string, config?: U...|
|`runFilesStaticCheck`|fn||411-447|export function runFilesStaticCheck(files: string[], proj...|
|`runProjectStaticCheck`|fn||457-470|export function runProjectStaticCheck(projectBase: string...|
|`runGitCheck`|fn||480-503|export function runGitCheck(projectBase: string, config?:...|
|`runDocsCheck`|fn||513-531|export function runDocsCheck(projectBase: string, config?...|
|`runGitWtName`|fn||541-555|export function runGitWtName(projectBase: string, config?...|
|`worktreePathExistsExact`|fn||565-570|function worktreePathExistsExact(gitPath: string, targetP...|
|`rollbackWorktreeCreate`|fn||581-587|function rollbackWorktreeCreate(gitPath: string, wtPath: ...|
|`runGitWtCreate`|fn||598-635|export function runGitWtCreate(projectBase: string, wtNam...|
|`baseDir`|fn||613-616|const baseDir = (() =>|
|`runGitWtDelete`|fn||646-681|export function runGitWtDelete(projectBase: string, wtNam...|
|`branchExists`|fn||657-660|const branchExists = (() =>|
|`runGitPath`|fn||690-694|export function runGitPath(projectBase: string, config?: ...|
|`runGetBasePath`|fn||703-707|export function runGetBasePath(projectBase: string, confi...|


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

# index.ts | TypeScript | 930L | 23 symbols | 10 imports | 24 comments
> Path: `src/index.ts`
- @brief Registers the pi-usereq extension commands, tools, and configuration UI.
- @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.

## Imports
```
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ToolInfo } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
import {
import { renderPrompt } from "./core/prompts.js";
import { ensureHomeResources } from "./core/resources.js";
import {
import {
import { shellSplit } from "./core/utils.js";
```

## Definitions

### fn `function getProjectBase(cwd: string): string` (L88-90)
- @brief Resolves the effective project base from a working directory.
- @details Normalizes the provided cwd into an absolute path without consulting configuration. Time complexity is O(1). No I/O side effects occur.
- @param[in] cwd {string} Current working directory.
- @return {string} Absolute project base path.

### fn `function loadProjectConfig(cwd: string): UseReqConfig` (L98-108)
- @brief Loads project configuration and refreshes derived path metadata for the extension runtime.
- @details Resolves the project base, loads persisted config, updates `base-path`, refreshes `git-path` when the project is inside a repository, and removes stale git metadata otherwise. Runtime is dominated by config I/O and git detection. Side effects are limited to filesystem reads and git subprocess execution.
- @param[in] cwd {string} Current working directory.
- @return {UseReqConfig} Effective project configuration.

### fn `function saveProjectConfig(cwd: string, config: UseReqConfig): void` (L117-121)
- @brief Persists project configuration from the extension runtime.
- @details Recomputes `base-path` from the current working directory and delegates persistence to `saveConfig`. Runtime is O(n) in config size. Side effects include config-file writes.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Configuration to persist.
- @return {void} No return value.

### fn `function formatResultForEditor(result: ToolResult): string` (L129-134)
- @brief Formats a tool result for editor display.
- @details Trims trailing whitespace on stdout and stderr independently, then joins non-empty sections with a blank line. Runtime is O(n) in emitted text size. No side effects occur.
- @param[in] result {ToolResult} Tool result payload.
- @return {string} Editor-ready textual representation.

### fn `function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[]` (L143-147)
- @brief Returns the registered pi-usereq startup tools.
- @details Filters all known extension tools against the canonical startup-tool set and sorts them by name. Runtime is O(t log t) in registered tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {ToolInfo[]} Sorted startup-tool descriptors.

### fn `function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[]` (L155-159)
- @brief Normalizes and returns the configured enabled startup tools.
- @details Reuses repository normalization rules, updates the config object in place, and returns the normalized array. Runtime is O(n) in configured tool count. Side effect: mutates `config["enabled-tools"]`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {string[]} Normalized enabled tool names.

### fn `function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void` (L168-184)
- @brief Applies the configured startup-tool enablement to the active session.
- @details Preserves non-pi-usereq active tools, removes all pi-usereq startup tools, then re-adds only those configured and currently registered. Runtime is O(t). Side effects include `pi.setActiveTools(...)`.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {void} No return value.

### fn `function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void` (L194-197)
- @brief Replaces the configured startup-tool selection and applies it immediately.
- @details Normalizes the requested tool names, stores them in config, and synchronizes the active tool set with runtime registration state. Runtime is O(n + t). Side effect: mutates config and active tools.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] enabledTools {string[]} Requested enabled tool names.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.

### fn `function formatPiUsereqToolLabel(tool: ToolInfo, enabled: boolean): string` (L206-209)
- @brief Formats one startup-tool label for selection menus.
- @details Prefixes the tool name with a checkmark or cross depending on whether the tool is configured as enabled. Runtime is O(1). No side effects occur.
- @param[in] tool {ToolInfo} Tool descriptor.
- @param[in] enabled {boolean} Enablement state.
- @return {string} Menu label.

### fn `function renderPiUsereqToolsReference(pi: ExtensionAPI, config: UseReqConfig): string` (L218-245)
- @brief Renders a textual reference for startup-tool configuration and runtime state.
- @details Lists every startup tool with configured enablement, runtime activation, source metadata, and optional descriptions. Runtime is O(t). No side effects occur.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Multiline tool-status report.

### fn `function registerPromptCommands(pi: ExtensionAPI): void` (L254-267)
- @brief Registers bundled prompt commands with the extension.
- @details Creates one `req-<prompt>` command per bundled prompt name. Each handler ensures resources exist, renders the prompt, and sends it as a user message. Runtime is O(p) for registration; handler cost depends on prompt rendering. Side effects include command registration and message dispatch during execution.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.

### fn `function registerAgentTools(pi: ExtensionAPI): void` (L277-543)
- @brief Registers pi-usereq agent tools exposed to the model.
- @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies REQ-005, REQ-044, REQ-045

### fn `async function configurePiUsereqToolsMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L553-617)
- @brief Runs the interactive startup-tool configuration menu.
- @details Synchronizes active tools with persisted config, renders overview/toggle actions, and updates configuration state in response to UI selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.

### fn `function formatStaticCheckEntry(entry: StaticCheckEntry): string` (L625-631)
- @brief Formats one static-check configuration entry for UI display.
- @details Renders command-backed entries as `Command(cmd args...)` and all other modules as `Module(args...)`. Runtime is O(n) in parameter count. No side effects occur.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry.
- @return {string} Human-readable entry summary.

### fn `function formatStaticCheckLanguagesSummary(config: UseReqConfig): string` (L639-645)
- @brief Summarizes configured static-check languages.
- @details Keeps only languages with at least one configured checker, sorts them, and emits a compact `Language (count)` list. Runtime is O(l log l). No side effects occur.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Compact summary string or `(none)`.

### fn `function buildStaticCheckLanguageLabel(language: string, extensions: string[], configuredCount: number): string` (L655-658)
- @brief Builds one static-check language selection label.
- @details Includes the language name, supported extensions, and the number of configured checkers with singular/plural handling. Runtime is O(n) in extension count. No side effects occur.
- @param[in] language {string} Canonical language name.
- @param[in] extensions {string[]} Supported file extensions.
- @param[in] configuredCount {number} Number of configured checkers for the language.
- @return {string} Menu label.

### fn `function renderStaticCheckReference(config: UseReqConfig): string` (L666-687)
- @brief Renders the static-check configuration reference view.
- @details Produces a markdown-like summary containing configured entries, supported languages, supported modules, and example specifications. Runtime is O(l log l). No side effects occur.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Reference text for the editor view.

### fn `async function configureStaticCheckMenu(ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L696-803)
- @brief Runs the interactive static-check configuration menu.
- @details Lets the user inspect support, add entries by guided prompts or raw spec strings, and remove configured language entries until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.

### fn `async function configurePiUsereq(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void>` (L812-884)
- @brief Runs the top-level pi-usereq configuration menu.
- @details Loads project config, exposes docs/test/source/tool/static-check configuration actions, persists changes on exit, and refreshes the status line. Runtime depends on user interaction count. Side effects include UI updates, config writes, and active-tool changes.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.

### fn `const ensureSaved = () => saveProjectConfig(ctx.cwd, config)` (L815-822)

### fn `const refreshStatus = () =>` (L816-822)

### fn `function registerConfigCommands(pi: ExtensionAPI): void` (L892-907)
- @brief Registers configuration-management commands.
- @details Adds commands for opening the interactive configuration menu and showing the current config JSON in the editor. Runtime is O(1) for registration. Side effects include command registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.

### fn `export default function piUsereqExtension(pi: ExtensionAPI): void` (L916-930)
- @brief Registers the complete pi-usereq extension.
- @details Ensures bundled resources exist, registers prompt and configuration commands plus agent tools, and installs a `session_start` hook that applies configured startup tools and updates the status line. Runtime is O(1) for registration; session-start behavior depends on config loading. Side effects include resource copying, command/tool registration, UI updates, and active-tool changes.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-045

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getProjectBase`|fn||88-90|function getProjectBase(cwd: string): string|
|`loadProjectConfig`|fn||98-108|function loadProjectConfig(cwd: string): UseReqConfig|
|`saveProjectConfig`|fn||117-121|function saveProjectConfig(cwd: string, config: UseReqCon...|
|`formatResultForEditor`|fn||129-134|function formatResultForEditor(result: ToolResult): string|
|`getPiUsereqStartupTools`|fn||143-147|function getPiUsereqStartupTools(pi: ExtensionAPI): ToolI...|
|`getConfiguredEnabledPiUsereqTools`|fn||155-159|function getConfiguredEnabledPiUsereqTools(config: UseReq...|
|`applyConfiguredPiUsereqTools`|fn||168-184|function applyConfiguredPiUsereqTools(pi: ExtensionAPI, c...|
|`setConfiguredPiUsereqTools`|fn||194-197|function setConfiguredPiUsereqTools(pi: ExtensionAPI, con...|
|`formatPiUsereqToolLabel`|fn||206-209|function formatPiUsereqToolLabel(tool: ToolInfo, enabled:...|
|`renderPiUsereqToolsReference`|fn||218-245|function renderPiUsereqToolsReference(pi: ExtensionAPI, c...|
|`registerPromptCommands`|fn||254-267|function registerPromptCommands(pi: ExtensionAPI): void|
|`registerAgentTools`|fn||277-543|function registerAgentTools(pi: ExtensionAPI): void|
|`configurePiUsereqToolsMenu`|fn||553-617|async function configurePiUsereqToolsMenu(pi: ExtensionAP...|
|`formatStaticCheckEntry`|fn||625-631|function formatStaticCheckEntry(entry: StaticCheckEntry):...|
|`formatStaticCheckLanguagesSummary`|fn||639-645|function formatStaticCheckLanguagesSummary(config: UseReq...|
|`buildStaticCheckLanguageLabel`|fn||655-658|function buildStaticCheckLanguageLabel(language: string, ...|
|`renderStaticCheckReference`|fn||666-687|function renderStaticCheckReference(config: UseReqConfig)...|
|`configureStaticCheckMenu`|fn||696-803|async function configureStaticCheckMenu(ctx: ExtensionCom...|
|`configurePiUsereq`|fn||812-884|async function configurePiUsereq(pi: ExtensionAPI, ctx: E...|
|`ensureSaved`|fn||815-822|const ensureSaved = () => saveProjectConfig(ctx.cwd, config)|
|`refreshStatus`|fn||816-822|const refreshStatus = () =>|
|`registerConfigCommands`|fn||892-907|function registerConfigCommands(pi: ExtensionAPI): void|
|`piUsereqExtension`|fn||916-930|export default function piUsereqExtension(pi: ExtensionAP...|

