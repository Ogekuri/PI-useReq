# Files Structure
```
.
└── src
    ├── cli.ts
    ├── core
    │   ├── agent-tool-json.ts
    │   ├── bin-deploy.ts
    │   ├── command-report-entry.ts
    │   ├── compress-files.ts
    │   ├── compress.ts
    │   ├── config-cli-render.ts
    │   ├── config-cli-schema.ts
    │   ├── config-cli.ts
    │   ├── config.ts
    │   ├── context-file-size.ts
    │   ├── debug-runtime.ts
    │   ├── doxygen-parser.ts
    │   ├── errors.ts
    │   ├── extension-instance-guard.ts
    │   ├── extension-status.ts
    │   ├── find-constructs.ts
    │   ├── generate-markdown.ts
    │   ├── notification-replay.ts
    │   ├── package-manager.ts
    │   ├── path-context.ts
    │   ├── pi-host-version.ts
    │   ├── pi-notify.ts
    │   ├── pi-usereq-tools.ts
    │   ├── prompt-command-catalog.ts
    │   ├── prompt-command-runtime.ts
    │   ├── prompt-command-state.ts
    │   ├── prompts.ts
    │   ├── req-references-command.ts
    │   ├── req-reset-command.ts
    │   ├── resources.ts
    │   ├── runtime-project-paths.ts
    │   ├── settings-menu.ts
    │   ├── source-analyzer.ts
    │   ├── source-presence.ts
    │   ├── static-check.ts
    │   ├── token-counter.ts
    │   ├── tool-runner.ts
    │   └── utils.ts
    └── index.ts
```

# cli.ts | TypeScript | 338L | 9 symbols | 7 imports | 9 comments
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
import {
import {
```

## Definitions

### iface `interface ParsedArgs` (L54-71)
- @brief Represents the parsed CLI flag state for one invocation.
- @details The interface captures every supported command and option in a normalized shape consumed by `main`. It is compile-time only and introduces no runtime cost.

### fn `function parseArgs(argv: string[]): ParsedArgs` (L79-175)
- @brief Parses raw CLI tokens into a normalized argument object.
- @details Performs a single left-to-right scan, supports options with variable-length value tails, and records only the last occurrence of scalar flags. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding the executable and script path.
- @return {ParsedArgs} Parsed flag object.

### fn `const takeUntilOption = (start: number): [string[], number] =>` (L81-89)

### fn `function writeStdout(text: string): void` (L183-185)
- @brief Writes text to stdout when non-empty.
- @details Avoids emitting zero-length writes so callers can compose result output safely. Runtime is O(n) in text length. Side effect: writes to `process.stdout`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L193-196)
- @brief Writes text to stderr and ensures a trailing newline.
- @details Skips empty input, appends a newline when necessary, and emits the final text to `process.stderr`. Runtime is O(n) in text length. Side effect: writes to `process.stderr`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeResult(result: { stdout: string; stderr: string; code: number }): number` (L204-208)
- @brief Emits a tool result object to process streams.
- @details Writes stdout first, then stderr, and returns the embedded exit code without modification. Runtime is O(n) in total emitted text size. Side effects are stdout/stderr writes.
- @param[in] result {{ stdout: string; stderr: string; code: number }} Command result payload.
- @return {number} Exit code to propagate from the invoked command.

### fn `function loadMutableProjectConfig(projectBase: string): { base: string; config: UseReqConfig }` (L217-221)
- @brief Loads mutable project config state without persisting runtime path metadata.
- @details Resolves the project base, loads existing config or defaults, normalizes persisted directory fields into project-relative form, and returns the in-memory pair used by CLI mutations. Runtime is dominated by config I/O. Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root path.
- @return {{ base: string; config: UseReqConfig }} Validated project base and normalized in-memory config.
- @satisfies REQ-035, REQ-146

### fn `function applyEnableStaticCheckSpecs(projectBase: string, specs: string[]): UseReqConfig` (L232-255)
- @brief Applies repeatable `--enable-static-check` specifications to project config.
- @details Parses each specification, validates command-backed entries before persistence, appends only non-duplicate identities in argument order, preserves existing per-language checker lists, forces each targeted language enable flag to `enable`, and writes the merged config once after all validations succeed. Runtime is O(s + e) plus PATH probing where s is spec count and e is existing entry count. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root path.
- @param[in] specs {string[]} Raw `--enable-static-check` specifications in CLI order.
- @return {UseReqConfig} Persisted merged project configuration.
- @throws {ReqError} Throws when parsing or validation fails.
- @satisfies REQ-035, REQ-036, REQ-037, REQ-253

### fn `export function main(argv = process.argv.slice(2)): number` (L265-334)
- @brief Executes one pi-usereq CLI invocation.
- @details Dispatches package-management commands (`--help`, `--ver|--version`, `--upgrade [--dev|--develop] [--force]`, `--uninstall`) before standard flag parsing by scheduling the async management handler and assigning its exit code to `process.exitCode` on completion, mapping an empty argv to the `--help` command so a no-argument invocation prints the full help screen, then parses arguments, enforces mutually exclusive project-selection rules, normalizes persisted config when needed, dispatches the first matching command handler, and converts thrown `ReqError` instances into stream output plus numeric exit codes. Runtime is O(n) in argument count plus delegated command cost. Side effects include config normalization writes, stdout/stderr output, and management-command HTTP probes or package-manager child processes.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {number} Process exit code for the invocation; `0` for dispatched management commands whose async completion assigns the final `process.exitCode`.
- @throws {ReqError} Internally catches `ReqError` and returns its code; other errors are coerced into exit code `1` with stderr output.
- @satisfies PRJ-009, DES-026, DES-027, DES-034, REQ-473, REQ-474, REQ-487, REQ-511, REQ-515, REQ-558

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ParsedArgs`|iface||54-71|interface ParsedArgs|
|`parseArgs`|fn||79-175|function parseArgs(argv: string[]): ParsedArgs|
|`takeUntilOption`|fn||81-89|const takeUntilOption = (start: number): [string[], numbe...|
|`writeStdout`|fn||183-185|function writeStdout(text: string): void|
|`writeStderr`|fn||193-196|function writeStderr(text: string): void|
|`writeResult`|fn||204-208|function writeResult(result: { stdout: string; stderr: st...|
|`loadMutableProjectConfig`|fn||217-221|function loadMutableProjectConfig(projectBase: string): {...|
|`applyEnableStaticCheckSpecs`|fn||232-255|function applyEnableStaticCheckSpecs(projectBase: string,...|
|`main`|fn||265-334|export function main(argv = process.argv.slice(2)): number|


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

# bin-deploy.ts | TypeScript | 339L | 14 symbols | 4 imports | 24 comments
> Path: `src/core/bin-deploy.ts`

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getInstallationPath, isSameOrAncestorPath } from "./path-context.js";
```

## Definitions

- type `export type PiUsereqLauncherDeployOutcome =` (L21)
### iface `export interface PiUsereqLauncherDeployResult` (L28-35)

### iface `export interface PiUsereqLauncherDeployOptions` (L38-45)

### fn `function expandLeadingTilde(value: string, homeDir: string): string` (L55-63)
- @brief Expands one leading user-home tilde inside a path candidate.
- @details Replaces a leading `~` or `~/` (and the Windows `~\` spelling) with the supplied user-home prefix while preserving every other path segment unchanged, mirroring the pi agent-directory expansion contract. Runtime is O(n) in path length. Pure; no side effects.
- @param[in] value {string} Path candidate that may begin with a tilde.
- @param[in] homeDir {string} Absolute user-home directory used for the expansion.
- @return {string} Expanded path, or the input unchanged when no leading tilde is present.
- @note Complexity: O(n) in path length. Pure; no side effects.

### fn `export function resolvePiAgentBinDir(homeDirImpl: () => string = os.homedir): string` (L73-80)
- @brief Resolves the pi-managed agent bin directory receiving the launcher link.
- @details Honors the pi `PI_CODING_AGENT_DIR` environment override (tilde-expanded) exactly like the pi CLI host resolves its agent directory, then appends `bin`; without the override the directory resolves to `<user-home>/.pi/agent/bin`, the pi-managed binaries directory documented by the pi CLI client sources. Runtime is O(p) in path length. No external state is mutated.
- @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
- @return {string} Absolute pi agent bin directory path.
- @note Complexity: O(p) in path length.
- @satisfies REQ-504

### fn `function resolveLauncherPackageRoot(explicitInstallationPath: string | undefined): string` (L90-95)
- @brief Resolves the npm package root anchoring launcher target composition plus ownership containment.
- @details Returns an explicit caller override resolved to an absolute path verbatim so deterministic test and CLI overrides keep their documented package-root meaning, and derives the production default as the parent directory of the source-root installation path exposed by `getInstallationPath()` because the executing module lives under `<packageRoot>/src/core` while the npm `bin` launcher declared by DES-028 lives at `<packageRoot>/scripts/pi-usereq.js`. Runtime is O(p) in path length. No external state is mutated.
- @param[in] explicitInstallationPath {string | undefined} Caller-supplied package-root override; `undefined` selects the derived default.
- @return {string} Absolute package root directory anchoring launcher target composition plus ownership containment.
- @note Complexity: O(p) in path length. Pure; no side effects.
- @satisfies REQ-504, REQ-508, REQ-509

### fn `export function resolvePiUsereqLauncherTarget(installationPath?: string): string` (L105-107)
- @brief Resolves the installation-owned launcher target backing the deployed link.
- @details Anchors on the npm package root resolved through `resolveLauncherPackageRoot` and joins `scripts/pi-usereq.js`, the shebang launcher declared by the npm `bin` metadata, so the deployed symlink executes the same entry as global npm installations. Runtime is O(p) in path length. No external state is mutated.
- @param[in] installationPath {string} Absolute package root override. Defaults to the package root derived from the runtime source-root installation path.
- @return {string} Absolute launcher target path.
- @note Complexity: O(p) in path length.
- @satisfies REQ-504

### fn `function isProjectPiPackageInstallationPath(resolvedPath: string): boolean` (L117-132)
- @brief Tests whether one resolved installation path belongs to a project-scope pi package tree.
- @details Scans the resolved path segments for the pi project configuration directory `.pi` immediately preceding either `git` or `npm/node_modules`, the managed roots the pi package manager uses for project-scope installs. Runtime is O(s) in segment count. Pure; no side effects.
- @param[in] resolvedPath {string} Absolute installation path.
- @return {boolean} `true` when the path resides inside a project-scope pi package tree.
- @note Complexity: O(s) in segment count. Pure; no side effects.
- @satisfies REQ-619

### fn `export function isPiPackageInstallation(` (L143-158)
- @brief Tests whether the executing installation resides inside a pi package installation tree.
- @details Resolves the pi agent directory using the same `PI_CODING_AGENT_DIR` plus `<user-home>/.pi/agent` contract as the pi CLI host, then applies the repository-ancestry containment rule against the npm and git managed roots `<agent-dir>/npm/node_modules` and `<agent-dir>/git` so installations from both documented package sources are recognized, and additionally detects project-scope `.pi/git` plus `.pi/npm/node_modules` trees. Source checkouts, global npm installs, and offline harnesses fail the containment test so activation-side launcher deployment stays scoped to real pi-package installations. Runtime is O(p) in path length. No external state is mutated.
- @param[in] installationPath {string} Candidate installation root. Defaults to the runtime installation path.
- @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
- @return {boolean} `true` when the installation path is inside a pi-managed npm or git install tree.
- @note Complexity: O(p) in path length.
- @satisfies REQ-504, REQ-619, DES-038

### fn `export function deployPiUsereqLauncher(` (L168-169)
- @brief Best-effort deploys one idempotent `pi-usereq` launcher symlink into the pi agent bin directory.
- @details Anchors the launcher target on the npm package root derived from the caller override or the source-root installation path parent, skips deployment with `launcher-missing` when the installation-owned launcher target does not exist, creates the agent bin directory when required, skips links already resolving to the current target for idempotence, replaces divergent symlinks so relocated installations stay reachable, skips non-symlink `pi-usereq` entries with `foreign-entry` instead of overwriting user-owned files, and converts every filesystem failure into a skipped outcome carrying the diagnostic reason so extension activation never aborts. Runtime is O(1) plus bounded filesystem metadata calls. Side effects include directory creation, symlink creation, and symlink deletion inside the resolved agent bin directory only.
- @param[in] options {PiUsereqLauncherDeployOptions} Optional installation and agent-bin directory overrides consumed by deterministic tests.
- @return {PiUsereqLauncherDeployResult} Deployment outcome facts; never throws.
- @note Complexity: O(1) plus bounded filesystem metadata calls.
- @satisfies REQ-504, REQ-505, REQ-506, REQ-507

### fn `export function removeDeployedPiUsereqLauncher(` (L213-214)
- @brief Best-effort removes the deployed `pi-usereq` launcher link owned by the executing installation.
- @details Removes the agent-bin `pi-usereq` entry only when it is a symlink resolving inside the executing npm package root derived from the caller override or the source-root installation path parent so relocated or upgraded installations are cleaned up, leaves foreign symlinks and non-symlink entries untouched, and converts every filesystem failure into `false` so the uninstall exit-code contract stays intact. Runtime is O(1) plus bounded filesystem metadata calls. Side effects include one symlink deletion inside the resolved agent bin directory only.
- @param[in] options {PiUsereqLauncherDeployOptions} Optional installation and agent-bin directory overrides consumed by deterministic tests.
- @return {boolean} `true` when the installation-owned launcher link was removed; `false` when absent, foreign, or the removal failed.
- @note Complexity: O(1) plus bounded filesystem metadata calls.
- @satisfies REQ-508, REQ-509

### fn `export function resolveUserBinDir(homeDirImpl: () => string = os.homedir): string` (L248-250)
- @brief Resolves the user-home `bin` directory receiving the secondary launcher link.
- @details Joins the supplied user-home resolver result with `bin`, mirroring the conventional per-user PATH directory the launcher layer chains into; callers only probe the directory and never create it. Runtime is O(p) in path length. Pure; no side effects.
- @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
- @return {string} Absolute user-home bin directory path.
- @note Complexity: O(p) in path length. Pure; no side effects.
- @satisfies REQ-516, REQ-517

### fn `export function deployUserBinPiUsereqLauncher(` (L260-261)
- @brief Best-effort deploys one conditional `pi-usereq` launcher symlink inside the user-home `bin` directory targeting the deployed pi agent bin launcher.
- @details Resolves the pi agent bin launcher entry through the same `PI_CODING_AGENT_DIR` plus `<user-home>/.pi/agent/bin` contract as `deployPiUsereqLauncher`, skips with `launcher-missing` when that entry is absent and `launcher-foreign` when it is not a symlink so only genuinely deployed launchers are chained, resolves the user-home `bin` directory, skips with `user-bin-missing` when that directory does not exist without ever creating it, skips links already resolving to the agent-bin launcher for idempotence, replaces divergent symlinks, skips non-symlink `pi-usereq` entries with `foreign-entry` instead of overwriting user-owned files, and converts every filesystem failure into a skipped outcome carrying the diagnostic reason so extension activation never aborts. Runtime is O(1) plus bounded filesystem metadata calls. Side effects include symlink creation and symlink deletion inside the resolved user-home bin directory only; no directory creation occurs.
- @param[in] options {PiUsereqLauncherDeployOptions} Optional installation, agent-bin, and user-bin directory overrides consumed by deterministic tests.
- @return {PiUsereqLauncherDeployResult} Deployment outcome facts; never throws.
- @note Complexity: O(1) plus bounded filesystem metadata calls.
- @satisfies REQ-516, REQ-517, REQ-518, REQ-519, REQ-520

### fn `export function removeUserBinPiUsereqLauncher(` (L314-315)
- @brief Best-effort removes the user-home `bin` `pi-usereq` launcher link owned by the pi agent bin launcher.
- @details Removes `~/bin/pi-usereq` only when it is a symlink resolving exactly to the pi agent bin `pi-usereq` entry resolved through the same agent-bin contract, leaves absent links, foreign symlinks, and non-symlink entries untouched, and converts every filesystem failure into `false` so the uninstall exit-code contract stays intact. Runtime is O(1) plus bounded filesystem metadata calls. Side effects include one symlink deletion inside the resolved user-home bin directory only.
- @param[in] options {PiUsereqLauncherDeployOptions} Optional agent-bin and user-bin directory overrides consumed by deterministic tests.
- @return {boolean} `true` when the owned user-home launcher link was removed; `false` when absent, foreign, or the removal failed.
- @note Complexity: O(1) plus bounded filesystem metadata calls.
- @satisfies REQ-521, REQ-522, REQ-523

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqLauncherDeployOutcome`|type||21||
|`PiUsereqLauncherDeployResult`|iface||28-35|export interface PiUsereqLauncherDeployResult|
|`PiUsereqLauncherDeployOptions`|iface||38-45|export interface PiUsereqLauncherDeployOptions|
|`expandLeadingTilde`|fn||55-63|function expandLeadingTilde(value: string, homeDir: strin...|
|`resolvePiAgentBinDir`|fn||73-80|export function resolvePiAgentBinDir(homeDirImpl: () => s...|
|`resolveLauncherPackageRoot`|fn||90-95|function resolveLauncherPackageRoot(explicitInstallationP...|
|`resolvePiUsereqLauncherTarget`|fn||105-107|export function resolvePiUsereqLauncherTarget(installatio...|
|`isProjectPiPackageInstallationPath`|fn||117-132|function isProjectPiPackageInstallationPath(resolvedPath:...|
|`isPiPackageInstallation`|fn||143-158|export function isPiPackageInstallation(|
|`deployPiUsereqLauncher`|fn||168-169|export function deployPiUsereqLauncher(|
|`removeDeployedPiUsereqLauncher`|fn||213-214|export function removeDeployedPiUsereqLauncher(|
|`resolveUserBinDir`|fn||248-250|export function resolveUserBinDir(homeDirImpl: () => stri...|
|`deployUserBinPiUsereqLauncher`|fn||260-261|export function deployUserBinPiUsereqLauncher(|
|`removeUserBinPiUsereqLauncher`|fn||314-315|export function removeUserBinPiUsereqLauncher(|


---

# command-report-entry.ts | TypeScript | 182L | 9 symbols | 5 imports | 11 comments
> Path: `src/core/command-report-entry.ts`
- @brief Persists durable non-agentic command execution reports as custom session entries.
- @details Defines the stable custom-entry type, machine-readable report payload, builders for `req-references` outcome lines, and the pi guarded helpers that append the report entry and register its transcript renderer. Custom entries are stored in the session file, excluded from LLM context, rendered live through `entry_appended`, and re-rendered after any session restore, so transient UI-notification collapsing or chat rebuilds never lose the executed-commands outcome report. Runtime is O(n) in report-line count. Side effects are limited to session-entry persistence and renderer registration through the pi extension API.

## Imports
```
import type {
import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { formatRuntimePathForDisplay } from "./path-context.js";
import type { ReqReferencesCommandExecutionResult } from "./req-references-command.js";
```

## Definitions

### iface `export interface CommandReportEntryData` (L29-34)
- @brief Describes one durable command execution report entry payload.
- @details Stores the originating slash-command name, the report severity, the terminal outcome, and the ordered per-operation outcome lines rendered in the transcript. The interface is compile-time only and introduces no runtime cost.

### iface `interface CommandReportEntryRegistrar` (L40-46)
- @brief Describes the loosely-typed pi runtime surface required for durable report entries.
- @details Narrows the extension API to the optional `registerEntryRenderer(...)` and `appendEntry(...)` methods consumed by the guarded report helpers so legacy hosts and offline harnesses without custom-entry support degrade silently instead of throwing. The interface is compile-time only and introduces no runtime cost.

### fn `function isCommandReportEntryData(value: unknown): value is CommandReportEntryData` (L54-65)
- @brief Validates one loosely-typed payload as a command report entry payload.
- @details Accepts only payloads with a non-empty command string, the documented `info|error` level, the documented `success|error` outcome, and a string-only lines array so malformed session data never reaches the transcript renderer. Runtime is O(n) in line count. No external state is mutated.
- @param[in] value {unknown} Candidate persisted payload.
- @return {boolean} `true` when the payload satisfies the report entry contract.

### fn `export function buildReqReferencesCommandReportLines(` (L74-90)
- @brief Builds the ordered per-operation outcome lines for one completed `req-references` run.
- @details Emits one machine-readable line per executed operation — terminal outcome, references-file regeneration result, guarded git-commit result, and post-run repository cleanliness — so the durable report states exactly which commands ran and with which outcome. Runtime is O(n) in path length. No external state is mutated.
- @param[in] executionResult {ReqReferencesCommandExecutionResult} Per-operation outcome facts of the completed run.
- @return {string[]} Ordered report lines starting with the terminal outcome.
- @satisfies REQ-436, REQ-437, REQ-438

### fn `export function buildReqReferencesCommandReportEntryData(` (L99-108)
- @brief Builds the durable report entry payload for one completed `req-references` run.
- @details Pairs the invokable command name with the per-operation outcome lines and the `success` outcome. Runtime is O(n) in report-line count. No external state is mutated.
- @param[in] executionResult {ReqReferencesCommandExecutionResult} Per-operation outcome facts of the completed run.
- @return {CommandReportEntryData} Report entry payload for session persistence.
- @satisfies REQ-436, REQ-437, REQ-438

### fn `export function buildCommandReportErrorEntryData(` (L117-127)
- @brief Builds the durable report entry payload for one failed non-agentic command run.
- @details Records the invokable command name, the `error` outcome, and the surfaced failure diagnostic so failed runs keep their outcome evidence in the transcript. Runtime is O(n) in message length. No external state is mutated.
- @param[in] command {string} Invokable slash-command name that failed.
- @param[in] errorMessage {string} Surfaced failure diagnostic.
- @return {CommandReportEntryData} Report entry payload for session persistence.

### fn `export function appendCommandReportEntry(pi: ExtensionAPI, data: CommandReportEntryData): boolean` (L136-143)
- @brief Appends one durable command report entry to the active session when the host supports custom entries.
- @details Probes the optional `pi.appendEntry(...)` surface before use so legacy hosts and offline harnesses without custom-entry support skip persistence silently; supported hosts persist the payload as a `custom` session entry that survives session restore while remaining excluded from LLM context. Runtime is O(1) plus delegated session-entry persistence. Side effects include session-file entry persistence on supported hosts.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] data {CommandReportEntryData} Report entry payload to persist.
- @return {boolean} `true` when the entry was appended; `false` when the host lacks the custom-entry surface.

### fn `function renderCommandReportEntry(` (L153-168)
- @brief Renders one durable command report entry as a transcript component.
- @details Maps the report payload into a themed multi-line `Text` — header colored `error` for failed runs and `accent` otherwise, body lines colored `error` for failed runs and `muted` otherwise — and returns `undefined` for malformed payloads so the host transcript skips undisplayable entries. Runtime is O(n) in aggregate report-line length. No external state is mutated.
- @param[in] entry {CustomEntry<CommandReportEntryData>} Persisted custom report entry.
- @param[in] _options {EntryRenderOptions} Host render options; retained for renderer-signature compatibility.
- @param[in] theme {Theme} Active pi theme used for color tokens.
- @return {Component | undefined} Transcript component, or `undefined` when the payload is malformed.

### fn `export function registerCommandReportEntryRenderer(pi: ExtensionAPI): void` (L176-182)
- @brief Registers the durable command report transcript renderer when the host supports entry rendering.
- @details Probes the optional `pi.registerEntryRenderer(...)` surface before use so legacy hosts and offline harnesses without custom-entry rendering skip registration silently; supported hosts bind the renderer for `pi-usereq.command-report` entries so appended reports render in the live transcript and re-render after every session restore. Runtime is O(1). Side effects include entry-renderer registration on supported hosts.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`CommandReportEntryData`|iface||29-34|export interface CommandReportEntryData|
|`CommandReportEntryRegistrar`|iface||40-46|interface CommandReportEntryRegistrar|
|`isCommandReportEntryData`|fn||54-65|function isCommandReportEntryData(value: unknown): value ...|
|`buildReqReferencesCommandReportLines`|fn||74-90|export function buildReqReferencesCommandReportLines(|
|`buildReqReferencesCommandReportEntryData`|fn||99-108|export function buildReqReferencesCommandReportEntryData(|
|`buildCommandReportErrorEntryData`|fn||117-127|export function buildCommandReportErrorEntryData(|
|`appendCommandReportEntry`|fn||136-143|export function appendCommandReportEntry(pi: ExtensionAPI...|
|`renderCommandReportEntry`|fn||153-168|function renderCommandReportEntry(|
|`registerCommandReportEntryRenderer`|fn||176-182|export function registerCommandReportEntryRenderer(pi: Ex...|


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

# config-cli-render.ts | TypeScript | 234L | 12 symbols | 0 imports | 15 comments
> Path: `src/core/config-cli-render.ts`
- @brief Renders deterministic configuration trees and tables for the configuration CLI.
- @details Implements the single data-driven tree renderer shared by `--print` and `--info`, plus one display-width-aware table formatter used for selection, array, and item-schema details. Tree topology depends only on real node ancestry, never on label width or detail count. Runtime is O(n) in emitted lines plus column count. The module is pure and performs no I/O.

## Definitions

### iface `export interface ConfigRenderTreeNode` (L40-44)
- @brief Describes one real configuration node prepared for rendering.
- @details Carries the fully materialized heading, the ordered attached detail lines that belong to the node, and its ordered real children. Detail lines are logical single lines without any structural prefix. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-541, REQ-542

### iface `export interface ConfigRenderRoot` (L51-55)
- @brief Describes the display root of one configuration tree render.
- @details The root heading is emitted without a tree marker and its optional details use a four-space indent; real children are rendered one level below it. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-541, REQ-544

### fn `function emitConfigTreeNode(` (L67-89)
- @brief Emits one real node and its descendants into the output line buffer.
- @details Computes the ancestor prefix strictly from the real-sibling flags, emits exactly one structural marker, then prefixes every attached detail line with the ancestor prefix plus one own continuation segment derived from whether this node has a later sibling. Runtime is O(n) in subtree line count. Side effect: appends to `lines`.
- @param[in] node {ConfigRenderTreeNode} Node to render.
- @param[in] ancestorHasNext {boolean[]} Real-ancestor later-sibling flags from the root down.
- @param[in] isLast {boolean} Whether this node is the final real sibling at its depth.
- @param[in,out] lines {string[]} Output line buffer.
- @return {void} No return value.
- @satisfies REQ-541, REQ-542

### fn `export function renderConfigTree(root: ConfigRenderRoot): string` (L98-107)
- @brief Renders one configuration tree through the shared deterministic algorithm.
- @details Emits the root heading without a tree marker, prefixes root details with a four-space indent, then renders every real child through `emitConfigTreeNode(...)` with no synthetic ancestors. The returned text ends with exactly one newline. Runtime is O(n) in emitted line count. No external state is mutated.
- @param[in] root {ConfigRenderRoot} Display root prepared by `--print` or `--info`.
- @return {string} Complete rendered tree text.
- @satisfies REQ-541, REQ-542, REQ-544

### fn `function isWideCodePoint(codePoint: number): boolean` (L116-133)
- @brief Tests whether one code point occupies two terminal cells.
- @details Covers the common East Asian wide, fullwidth, and emoji ranges used by configuration values so column widths stay aligned for Unicode data. Runtime is O(1). No external state is mutated.
- @param[in] codePoint {number} Unicode code point.
- @return {boolean} `true` when the code point occupies two display cells.
- @satisfies REQ-547

### fn `function isZeroWidthCodePoint(codePoint: number): boolean` (L142-152)
- @brief Tests whether one code point occupies zero terminal cells.
- @details Covers combining marks, zero-width controls, and variation selectors so table widths are not overcounted. Runtime is O(1). No external state is mutated.
- @param[in] codePoint {number} Unicode code point.
- @return {boolean} `true` when the code point occupies no display cell.
- @satisfies REQ-547

### fn `export function measureDisplayWidth(text: string): number` (L161-171)
- @brief Measures the terminal display width of one text fragment.
- @details Iterates Unicode code points so wide and zero-width characters are counted by display cells instead of JavaScript code units; assumes no ANSI escape sequences are present. Runtime is O(n) in fragment length. No external state is mutated.
- @param[in] text {string} Text fragment to measure.
- @return {number} Terminal display width in cells.
- @satisfies REQ-547

### fn `function padTableCell(text: string, width: number): string` (L181-183)
- @brief Pads one table cell to a measured display width.
- @details Appends spaces until the rendered cell reaches the requested width so every physical row shares the column boundaries computed from the widest header or cell. Runtime is O(n) in padding length. No external state is mutated.
- @param[in] text {string} Cell text.
- @param[in] width {number} Target display width.
- @return {string} Right-padded cell text.
- @satisfies REQ-547

### fn `function escapeTableCellText(text: string): string` (L192-198)
- @brief Escapes control characters inside one table cell before measurement.
- @details Rewrites carriage returns, newlines, tabs, and remaining C0 control codes into visible escape sequences so one physical table row always represents one logical cell line and widths stay measurable. Runtime is O(n) in cell length. No external state is mutated.
- @param[in] text {string} Raw cell text.
- @return {string} Single-line escaped cell text.
- @satisfies REQ-547

### fn `export function formatConfigTable(headers: string[], rows: string[][]): string[]` (L208-234)
- @brief Renders one configuration table from headers plus row cells.
- @details Escapes control characters in every header and cell, computes every column width from the maximum display width, then emits aligned top, header, separator, data, and bottom borders with exactly one space of horizontal padding per cell. Missing cells render empty. Runtime is O(r * c) plus width measurement. No external state is mutated.
- @param[in] headers {string[]} Ordered column headers.
- @param[in] rows {string[][]} Ordered physical row cells.
- @return {string[]} Rendered table lines without structural prefixes.
- @satisfies REQ-547, REQ-551

### fn `const borderLine = (left: string, middle: string, right: string): string =>` (L218-219)

### fn `const contentLine = (cells: string[]): string =>` (L220-223)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ConfigRenderTreeNode`|iface||40-44|export interface ConfigRenderTreeNode|
|`ConfigRenderRoot`|iface||51-55|export interface ConfigRenderRoot|
|`emitConfigTreeNode`|fn||67-89|function emitConfigTreeNode(|
|`renderConfigTree`|fn||98-107|export function renderConfigTree(root: ConfigRenderRoot):...|
|`isWideCodePoint`|fn||116-133|function isWideCodePoint(codePoint: number): boolean|
|`isZeroWidthCodePoint`|fn||142-152|function isZeroWidthCodePoint(codePoint: number): boolean|
|`measureDisplayWidth`|fn||161-171|export function measureDisplayWidth(text: string): number|
|`padTableCell`|fn||181-183|function padTableCell(text: string, width: number): string|
|`escapeTableCellText`|fn||192-198|function escapeTableCellText(text: string): string|
|`formatConfigTable`|fn||208-234|export function formatConfigTable(headers: string[], rows...|
|`borderLine`|fn||218-219|const borderLine = (left: string, middle: string, right: ...|
|`contentLine`|fn||220-223|const contentLine = (cells: string[]): string =>|


---

# config-cli-schema.ts | TypeScript | 1699L | 44 symbols | 5 imports | 54 comments
> Path: `src/core/config-cli-schema.ts`
- @brief Defines the canonical configuration CLI schema plus typed path operations.
- @details Supplies one strict schema for the additive `--get`, `--set`, `--unset`, `--print`, and `--info` commands over the existing local and global configuration scopes. Defaults derive from `getDefaultConfig(...)` and enum domains derive from the existing configuration inventories, so the CLI never keeps a diverging parameter list. The module resolves case-sensitive colon paths, parses typed input, validates whole payloads, projects payloads onto the schema, and applies mutations to in-memory scope payloads. Runtime is O(n) in schema node count plus payload size. No filesystem writes occur here.
- @satisfies REQ-533, REQ-535, REQ-536, REQ-541, REQ-545, REQ-546, REQ-551, REQ-556, REQ-561, REQ-562

## Imports
```
import {
import { DEBUG_PROMPT_NAMES, DEBUG_WORKFLOW_STATES } from "./debug-runtime.js";
import { ReqError } from "./errors.js";
import { PI_USEREQ_CUSTOM_TOOL_NAMES, PI_USEREQ_EMBEDDED_TOOL_NAMES, PI_USEREQ_STARTUP_TOOL_NAMES } from "./pi-usereq-tools.js";
import { PI_NOTIFY_SOUND_LEVELS } from "./pi-notify.js";
```

## Definitions

- type `export type ConfigScope = "local" | "global";` (L24)
- @brief Enumerates the supported configuration scopes.
- @details Distinguishes the project-local `.pi-usereq.json` scope from the cross-project global scope used by `~/.config/pi-usereq/config.json`. The alias is compile-time only and introduces no runtime cost.
- @satisfies REQ-533
- type `export type ConfigValueKind =` (L31)
- @brief Enumerates supported parameter value kinds.
- @details Restricts typed parsing, validation, display, and mutation to the documented scalar, selection, array, and object-array kinds present in the application schema. The alias is compile-time only and introduces no runtime cost.
- @satisfies REQ-536
### iface `export interface ConfigSchemaField` (L45-55)
- @brief Describes one fixed field inside an object-array item schema.
- @details Carries the exact persisted field token, its scalar or array type, English documentation, constraint text, requirement flag, optional default, and a schema-valid example used by generated commands. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-555

### iface `export interface ConfigSchemaSection` (L62-70)
- @brief Describes one fixed-schema configuration section.
- @details Stores the exact schema token, its full canonical path, owning scope, access key chain, English description, and ordered real children. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-541, REQ-543

### iface `export interface ConfigSchemaParameter` (L77-95)
- @brief Describes one configurable parameter leaf.
- @details Stores the exact persisted token, full canonical path, owning scope, access key chain, English documentation, value kind, constraint text, default value, enum domain, optional item domain, object fields, and a schema-valid example. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-552, REQ-554, REQ-555

- type `export type ConfigSchemaNode = ConfigSchemaSection | ConfigSchemaParameter;` (L102)
- @brief Represents one schema section or parameter.
- @details Discriminated union consumed by path resolution, validation, projection, and rendering. The alias is compile-time only and introduces no runtime cost.
- @satisfies REQ-541
- type `export type ConfigTarget =` (L109)
- @brief Describes one resolved display or mutation target.
- @details Narrows a canonical path onto a section, a parameter, one array element, one object-array field, or one append/insert operation while retaining the parsed index. The alias is compile-time only and introduces no runtime cost.
- @satisfies REQ-545, REQ-546
### iface `export interface ConfigScopeState` (L122-125)
- @brief Stores one mutable configuration scope state pair.
- @details Keys the projected local and global payloads used by read and mutation commands so a single invocation can resolve any schema path. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-533

### fn `function getSchemaDefaults(): ConfigScopeState` (L239-248)
- @brief Resolves the projected default payloads for both scopes.
- @details Derives defaults from the canonical `getDefaultConfig(...)` composition rather than duplicating literals. Runtime is O(n) on the first call in config size and O(1) afterwards. Side effect: initializes the module-local cache.
- @return {ConfigScopeState} Projected default payloads keyed by scope.
- @satisfies REQ-562

### fn `function isPlainObject(value: unknown): value is Record<string, unknown>` (L264-266)
- @brief Tests whether one value is a plain JSON object.
- @details Rejects null, arrays, and non-objects so payload handling never misclassifies containers. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate value.
- @return {boolean} `true` when the value is a plain object.
- @satisfies REQ-535

### fn `export function cloneConfigSchemaValue(value: unknown): unknown` (L275-277)
- @brief Clones one JSON-compatible schema value.
- @details Uses `structuredClone` so populated defaults never leak mutations back into the cached schema. Runtime is O(n) in value size. No external state is mutated.
- @param[in] value {unknown} Value to clone.
- @return {unknown} Detached clone.
- @satisfies REQ-561

### fn `function getAtPath(source: unknown, keys: readonly string[]): unknown` (L287-296)
- @brief Reads one nested value from a payload.
- @details Walks the supplied key chain, returning `undefined` when any intermediate value is not a plain object. Runtime is O(k) in key count. No external state is mutated.
- @param[in] source {unknown} Payload root.
- @param[in] keys {readonly string[]} Key chain.
- @return {unknown} Nested value or `undefined`.
- @satisfies REQ-545

### fn `function setAtPath(target: Record<string, unknown>, keys: readonly string[], value: unknown): void` (L307-321)
- @brief Writes one nested value into a payload, creating intermediate objects.
- @details Mutates the supplied payload so mutation commands can share one scope state. Runtime is O(k) in key count. Side effect: mutates `target`.
- @param[in] keys {readonly string[]} Key chain.
- @param[in] value {unknown} Value to store.
- @param[in,out] target {Record<string, unknown>} Payload root to mutate.
- @return {void} No return value.
- @satisfies REQ-545

### fn `function getScopeToken(scope: ConfigScope): string` (L330-332)
- @brief Resolves the scope token rendered as the top-level section identifier.
- @details Maps each persisted scope onto the documented capitalised section token. Runtime is O(1). No external state is mutated.
- @param[in] scope {ConfigScope} Configuration scope.
- @return {string} Top-level section token.
- @satisfies REQ-533

### fn `function createParameter(input:` (L341-379)
- @brief Builds one parameter schema node with defaults resolved from the shared default payloads.
- @details Computes the full canonical path, resolves the default value by access chain, and copies every supplied domain or field descriptor. Runtime is O(1) plus clone cost of the default. No external state is mutated.
- @param[in] input {object} Parameter descriptor without path and default.
- @return {ConfigSchemaParameter} Completed parameter node.
- @satisfies REQ-552, REQ-562

### fn `function createStaticCheckLanguageSections(scope: ConfigScope): ConfigSchemaSection[]` (L388-425)
- @brief Builds the per-language static-check sections for one scope.
- @details Emits one fixed-schema branch per documented language, exposing only the persisted `enabled` leaf for the local scope and only the persisted `checkers` array for the global scope. Runtime is O(l). No external state is mutated.
- @param[in] scope {ConfigScope} Configuration scope.
- @return {ConfigSchemaSection[]} Ordered language sections.
- @satisfies REQ-541, REQ-562

### fn `export function getConfigSchema(): ConfigSchemaSection[]` (L433-732)
- @brief Builds the complete canonical configuration schema tree.
- @details Composes the `Local` and `Global` scopes in persisted-key order, including the fixed-schema `static-check` dictionary branches, and memoizes the result. Runtime is O(n) on the first call in schema size and O(1) afterwards. No external state is mutated beyond the module-local cache.
- @return {ConfigSchemaSection[]} Top-level schema sections.
- @satisfies REQ-533, REQ-541, REQ-562

### fn `export function getScopeSection(scope: ConfigScope): ConfigSchemaSection` (L933-935)
- @brief Resolves one top-level schema section by scope.
- @details Looks up the `Local` or `Global` section from the cached schema. Runtime is O(1). No external state is mutated.
- @param[in] scope {ConfigScope} Configuration scope.
- @return {ConfigSchemaSection} Matching top-level section.
- @satisfies REQ-533

### fn `function parseIndexToken(token: string, configPath: string): number` (L946-951)
- @brief Parses one array index token into a non-negative integer.
- @details Accepts only canonical decimal text without signs or leading zeroes so ambiguous indices are rejected deterministically. Runtime is O(n) in token length. No external state is mutated.
- @param[in] token {string} Raw index token.
- @param[in] configPath {string} Full path used in diagnostics.
- @return {number} Parsed zero-based index.
- @throws {ReqError} Throws when the token is not a canonical non-negative decimal index.
- @satisfies REQ-545, REQ-546

### fn `function resolveParameterTail(` (L963-1002)
- @brief Resolves the array-operation tail of one parameter path.
- @details Recognises `:append`, `:+`, `:insert:<Idx>`, `:<Idx>`, and `:<Idx>:<Field>` tails for array parameters and rejects every other extension deterministically. Runtime is O(t) in tail token count. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Array parameter being extended.
- @param[in] tail {string[]} Remaining path tokens after the parameter.
- @param[in] configPath {string} Full path used in diagnostics.
- @return {ConfigTarget} Resolved array target.
- @throws {ReqError} Throws when the tail cannot address the parameter.
- @satisfies REQ-545, REQ-546

### fn `export function resolveConfigTarget(configPath: string): ConfigTarget` (L1012-1041)
- @brief Resolves one canonical configuration path against the schema.
- @details Performs a case-sensitive token walk from the top-level scope section and delegates array tails to `resolveParameterTail(...)`. Runtime is O(p) in path token count. No external state is mutated.
- @param[in] configPath {string} Canonical colon-separated path.
- @return {ConfigTarget} Resolved target descriptor.
- @throws {ReqError} Throws for empty, malformed, or unknown paths.
- @satisfies REQ-545, REQ-546

### fn `export function readParameterValue(` (L1051-1057)
- @brief Reads one parameter value from a scope payload with default fallback.
- @details Returns the persisted value when present and a detached default clone otherwise. Runtime is O(k) in key count. No external state is mutated.
- @param[in] scopePayload {Record<string, unknown>} Scope payload.
- @param[in] parameter {ConfigSchemaParameter} Parameter to read.
- @return {unknown} Parameter value.
- @satisfies REQ-539

### fn `function projectObjectRow(` (L1067-1085)
- @brief Projects one object-array row onto the fixed field schema.
- @details Copies only known field tokens, preserves string-array fields as string arrays, and drops unknown keys so payloads stay schema-strict. Runtime is O(f) in field count. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Object-array parameter.
- @param[in] row {unknown} Candidate persisted row.
- @return {Record<string, unknown>} Projected row.
- @satisfies REQ-561

### fn `export function projectParameterValue(` (L1095-1109)
- @brief Projects one parameter value onto the schema.
- @details Normalizes object-array rows and string arrays so `--print` and `--get` always expose schema-shaped values. Runtime is O(n) in array size. No external state is mutated.
- @param[in] scopePayload {Record<string, unknown>} Scope payload.
- @param[in] parameter {ConfigSchemaParameter} Parameter to project.
- @return {unknown} Projected value.
- @satisfies REQ-561

### fn `export function projectSectionValue(` (L1119-1130)
- @brief Projects one section subtree onto the schema.
- @details Emits the exact persisted key order for every schema child, reading values through the absolute access chain so nested `static-check` branches resolve correctly. Runtime is O(n) in subtree node count. No external state is mutated.
- @param[in] section {ConfigSchemaSection} Section to project.
- @param[in] scopePayload {Record<string, unknown>} Scope payload.
- @return {Record<string, unknown>} Projected subtree.
- @satisfies REQ-561

### fn `export function projectScopePayload(` (L1140-1145)
- @brief Projects one complete scope payload onto the schema.
- @details Drops every key absent from the canonical schema before a write so the persisted file always validates against the strict schema. Runtime is O(n) in schema node count. No external state is mutated.
- @param[in] scope {ConfigScope} Configuration scope.
- @param[in] payload {Record<string, unknown>} Candidate payload.
- @return {Record<string, unknown>} Schema-projected payload.
- @satisfies REQ-561

### fn `export function getSectionDefaultValue(section: ConfigSchemaSection): Record<string, unknown>` (L1154-1156)
- @brief Resolves the projected default subtree of one section.
- @details Projects the section against the cached default payload so `--unset` and branch completion restore documented defaults. Runtime is O(n) in subtree node count. No external state is mutated.
- @param[in] section {ConfigSchemaSection} Section to resolve.
- @return {Record<string, unknown>} Default subtree.
- @satisfies REQ-556, REQ-562

### fn `function parseJsonInput(rawValue: string, pathLabel: string): unknown` (L1167-1174)
- @brief Parses one raw JSON value for a configuration input.
- @details Wraps `JSON.parse(...)` with a deterministic English diagnostic naming the target path. Runtime is O(n) in input length. No external state is mutated.
- @param[in] rawValue {string} Raw JSON text.
- @param[in] pathLabel {string} Target path used in diagnostics.
- @return {unknown} Parsed JSON value.
- @throws {ReqError} Throws when the text is not valid JSON.
- @satisfies REQ-536

### fn `function validateStringArray(` (L1187-1207)
- @brief Validates one string-array field or parameter item list.
- @details Requires string items, enforces non-empty items when configured, and checks the optional enum domain before reporting the first failure. Runtime is O(n) in item count. No external state is mutated.
- @param[in] value {unknown} Candidate array.
- @param[in] itemLabel {string} Path label used in diagnostics.
- @param[in] itemNonEmpty {boolean} Whether items must be non-empty.
- @param[in] itemEnum {readonly string[] | undefined} Optional allowed item domain.
- @return {void} No return value.
- @throws {ReqError} Throws when the array or one item is invalid.
- @satisfies REQ-535, REQ-536

### fn `function validateFieldValue(field: ConfigSchemaField, value: unknown, pathLabel: string): void` (L1219-1230)
- @brief Validates one fixed object-array field value.
- @details Branches between scalar strings and string arrays so field updates share one validation contract. Runtime is O(n) in array size. No external state is mutated.
- @param[in] field {ConfigSchemaField} Field schema.
- @param[in] value {unknown} Candidate value.
- @param[in] pathLabel {string} Path label used in diagnostics.
- @return {void} No return value.
- @throws {ReqError} Throws when the value violates the field schema.
- @satisfies REQ-535

### fn `function validateObjectRow(` (L1242-1266)
- @brief Validates one object-array row against its fixed field schema.
- @details Rejects non-objects, unknown field tokens, missing required fields, and invalid field values so rows stay strict. Runtime is O(f) in field count. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Object-array parameter.
- @param[in] row {unknown} Candidate row.
- @param[in] pathLabel {string} Path label used in diagnostics.
- @return {void} No return value.
- @throws {ReqError} Throws when the row violates the schema.
- @satisfies REQ-535, REQ-555

### fn `export function validateParameterValue(` (L1278-1322)
- @brief Validates one parameter value against the strict schema.
- @details Enforces scalar type, non-empty constraints, selection domains, integer domains, and array item or row schemas. Runtime is O(n) in array size. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Parameter schema.
- @param[in] value {unknown} Candidate value.
- @param[in] pathLabel {string} Path label used in diagnostics.
- @return {void} No return value.
- @throws {ReqError} Throws when the value violates the schema.
- @satisfies REQ-535

### fn `function validateSectionPayload(` (L1333-1351)
- @brief Recursively validates one section subtree against the schema.
- @details Requires section values to be objects, every schema leaf to be present, and every leaf value to validate; unknown keys are ignored here because projection already removed them. Runtime is O(n) in subtree node count. No external state is mutated.
- @param[in] section {ConfigSchemaSection} Section schema.
- @param[in] scopePayload {Record<string, unknown>} Scope payload.
- @return {void} No return value.
- @throws {ReqError} Throws when a section or leaf violates the schema.
- @satisfies REQ-535

### fn `export function validateScopePayload(scope: ConfigScope, payload: Record<string, unknown>): void` (L1362-1364)
- @brief Validates one complete schema-projected scope payload.
- @details Enforces every leaf constraint of the supplied scope before a write so invalid payloads never reach disk. Runtime is O(n) in schema node count. No external state is mutated.
- @param[in] scope {ConfigScope} Configuration scope.
- @param[in] payload {Record<string, unknown>} Schema-projected payload.
- @return {void} No return value.
- @throws {ReqError} Throws when the payload violates the schema.
- @satisfies REQ-535

### fn `export function parseWholeParameterInput(` (L1375-1391)
- @brief Parses one whole-parameter `--set` input into the schema type.
- @details Keeps strings verbatim, parses JSON for typed scalars and arrays, and delegates value-shape errors to the caller validation. Runtime is O(n) in input length. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Target parameter.
- @param[in] rawValue {string} Raw CLI value.
- @param[in] pathLabel {string} Target path used in diagnostics.
- @return {unknown} Parsed candidate value.
- @satisfies REQ-536

### fn `export function parseArrayItemInput(` (L1403-1416)
- @brief Parses one array-item `--set` input into the item type.
- @details Keeps primitive string items verbatim and requires exactly one JSON object for object-array items. Runtime is O(n) in input length. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Array parameter.
- @param[in] rawValue {string} Raw CLI value.
- @param[in] pathLabel {string} Target path used in diagnostics.
- @return {unknown} Parsed item.
- @throws {ReqError} Throws when an object-array item is not one JSON object.
- @satisfies REQ-536, REQ-555

### fn `export function parseFieldInput(` (L1427-1433)
- @brief Parses one object-array field `--set` input into the field type.
- @details Keeps string fields verbatim and parses JSON for string-array fields. Runtime is O(n) in input length. No external state is mutated.
- @param[in] field {ConfigSchemaField} Target field.
- @param[in] rawValue {string} Raw CLI value.
- @param[in] pathLabel {string} Target path used in diagnostics.
- @return {unknown} Parsed field value.
- @satisfies REQ-536

### fn `function parseSectionInput(rawValue: string, pathLabel: string): Record<string, unknown>` (L1444-1450)
- @brief Parses one section `--set` input into a JSON object.
- @details Requires exactly one JSON object for branch replacement so arrays and scalars are rejected deterministically. Runtime is O(n) in input length. No external state is mutated.
- @param[in] rawValue {string} Raw CLI value.
- @param[in] pathLabel {string} Target path used in diagnostics.
- @return {Record<string, unknown>} Parsed object.
- @throws {ReqError} Throws when the input is not one JSON object.
- @satisfies REQ-536

### fn `function completeSectionValue(` (L1462-1492)
- @brief Completes one section replacement value from supplied keys plus schema defaults.
- @details Rejects unknown keys, fills omitted children with documented defaults, and validates every supplied leaf so branch replacement always yields a complete schema-compatible subtree. Runtime is O(n) in subtree node count. No external state is mutated.
- @param[in] section {ConfigSchemaSection} Target section.
- @param[in] provided {Record<string, unknown>} Supplied branch object.
- @param[in] pathLabel {string} Target path used in diagnostics.
- @return {Record<string, unknown>} Completed subtree.
- @throws {ReqError} Throws when the supplied object violates the schema.
- @satisfies REQ-535, REQ-561

### fn `function getMutableArray(` (L1502-1514)
- @brief Resolves the mutable array value of one array parameter.
- @details Returns the persisted array or installs a detached default array when the payload omits one. Runtime is O(k) in access chain length. Side effect: may mutate the supplied payload.
- @param[in] parameter {ConfigSchemaParameter} Array parameter.
- @param[in,out] payload {Record<string, unknown>} Scope payload.
- @return {unknown[]} Mutable array value.
- @satisfies REQ-546

### fn `function throwIndexRangeError(` (L1527-1539)
- @brief Rejects one out-of-range array index with a deterministic diagnostic.
- @details Reports the target path, rejected index, valid range, and append affordance so index failures stay actionable. Runtime is O(1). No external state is mutated.
- @param[in] index {number} Rejected index.
- @param[in] length {number} Current array length.
- @param[in] parameter {ConfigSchemaParameter} Target array parameter.
- @param[in] allowEnd {boolean} Whether the index may equal the length (insertion).
- @return {void} No return value.
- @throws {ReqError} Always throws.
- @satisfies REQ-546

### fn `export function applyConfigSet(` (L1551-1615)
- @brief Applies one `--set` mutation to a mutable scope state.
- @details Parses and validates the supplied input for the resolved target kind, then mutates the owning scope payload: whole branches, whole parameters, single array rows, single fields, appends, and inserts. Runtime is O(n) in affected array or subtree size. Side effect: mutates `state`.
- @param[in] target {ConfigTarget} Resolved target.
- @param[in] rawValue {string} Raw CLI value.
- @param[in,out] state {ConfigScopeState} Mutable scope state.
- @return {void} No return value.
- @throws {ReqError} Throws on invalid input or out-of-range indices without mutating state.
- @satisfies REQ-535, REQ-536, REQ-546, REQ-556

### fn `export function applyConfigUnset(state: ConfigScopeState, target: ConfigTarget): void` (L1626-1667)
- @brief Applies one `--unset` mutation to a mutable scope state.
- @details Restores documented defaults for parameters and branches, removes one array row with index compaction, and resets or removes one object-array field under the required-field rule. Runtime is O(n) in affected array or subtree size. Side effect: mutates `state`.
- @param[in] target {ConfigTarget} Resolved reset target.
- @param[in,out] state {ConfigScopeState} Mutable scope state.
- @return {void} No return value.
- @throws {ReqError} Throws for append/insert targets, out-of-range indices, or required field resets.
- @satisfies REQ-546, REQ-556

### fn `export function readArrayTargetValue(` (L1678-1680)
- @brief Reads one array row or field value for `--get`.
- @details Resolves the array, enforces the read index range, and projects object rows onto the schema. Runtime is O(1) plus row projection. No external state is mutated.
- @param[in] scopePayload {Record<string, unknown>} Scope payload.
- @param[in] target {ConfigTarget} Resolved array target.
- @return {unknown} Requested row or field value.
- @throws {ReqError} Throws for append/insert targets or out-of-range indices.
- @satisfies REQ-546

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ConfigScope`|type||24||
|`ConfigValueKind`|type||31||
|`ConfigSchemaField`|iface||45-55|export interface ConfigSchemaField|
|`ConfigSchemaSection`|iface||62-70|export interface ConfigSchemaSection|
|`ConfigSchemaParameter`|iface||77-95|export interface ConfigSchemaParameter|
|`ConfigSchemaNode`|type||102||
|`ConfigTarget`|type||109||
|`ConfigScopeState`|iface||122-125|export interface ConfigScopeState|
|`getSchemaDefaults`|fn||239-248|function getSchemaDefaults(): ConfigScopeState|
|`isPlainObject`|fn||264-266|function isPlainObject(value: unknown): value is Record<s...|
|`cloneConfigSchemaValue`|fn||275-277|export function cloneConfigSchemaValue(value: unknown): u...|
|`getAtPath`|fn||287-296|function getAtPath(source: unknown, keys: readonly string...|
|`setAtPath`|fn||307-321|function setAtPath(target: Record<string, unknown>, keys:...|
|`getScopeToken`|fn||330-332|function getScopeToken(scope: ConfigScope): string|
|`createParameter`|fn||341-379|function createParameter(input:|
|`createStaticCheckLanguageSections`|fn||388-425|function createStaticCheckLanguageSections(scope: ConfigS...|
|`getConfigSchema`|fn||433-732|export function getConfigSchema(): ConfigSchemaSection[]|
|`getScopeSection`|fn||933-935|export function getScopeSection(scope: ConfigScope): Conf...|
|`parseIndexToken`|fn||946-951|function parseIndexToken(token: string, configPath: strin...|
|`resolveParameterTail`|fn||963-1002|function resolveParameterTail(|
|`resolveConfigTarget`|fn||1012-1041|export function resolveConfigTarget(configPath: string): ...|
|`readParameterValue`|fn||1051-1057|export function readParameterValue(|
|`projectObjectRow`|fn||1067-1085|function projectObjectRow(|
|`projectParameterValue`|fn||1095-1109|export function projectParameterValue(|
|`projectSectionValue`|fn||1119-1130|export function projectSectionValue(|
|`projectScopePayload`|fn||1140-1145|export function projectScopePayload(|
|`getSectionDefaultValue`|fn||1154-1156|export function getSectionDefaultValue(section: ConfigSch...|
|`parseJsonInput`|fn||1167-1174|function parseJsonInput(rawValue: string, pathLabel: stri...|
|`validateStringArray`|fn||1187-1207|function validateStringArray(|
|`validateFieldValue`|fn||1219-1230|function validateFieldValue(field: ConfigSchemaField, val...|
|`validateObjectRow`|fn||1242-1266|function validateObjectRow(|
|`validateParameterValue`|fn||1278-1322|export function validateParameterValue(|
|`validateSectionPayload`|fn||1333-1351|function validateSectionPayload(|
|`validateScopePayload`|fn||1362-1364|export function validateScopePayload(scope: ConfigScope, ...|
|`parseWholeParameterInput`|fn||1375-1391|export function parseWholeParameterInput(|
|`parseArrayItemInput`|fn||1403-1416|export function parseArrayItemInput(|
|`parseFieldInput`|fn||1427-1433|export function parseFieldInput(|
|`parseSectionInput`|fn||1444-1450|function parseSectionInput(rawValue: string, pathLabel: s...|
|`completeSectionValue`|fn||1462-1492|function completeSectionValue(|
|`getMutableArray`|fn||1502-1514|function getMutableArray(|
|`throwIndexRangeError`|fn||1527-1539|function throwIndexRangeError(|
|`applyConfigSet`|fn||1551-1615|export function applyConfigSet(|
|`applyConfigUnset`|fn||1626-1667|export function applyConfigUnset(state: ConfigScopeState,...|
|`readArrayTargetValue`|fn||1678-1680|export function readArrayTargetValue(|


---

# config-cli.ts | TypeScript | 819L | 36 symbols | 7 imports | 41 comments
> Path: `src/core/config-cli.ts`
- @brief Implements the additive pi-usereq configuration CLI.
- @details Dispatches the leading `--print`, `--info`, `--print-raw`, `--get`, `--set`, and `--unset` commands over the canonical configuration schema. Loads the existing local and global scopes through the shared configuration loaders, bootstraps a missing global JSON file from schema defaults, renders `--print` and `--info` through one deterministic tree renderer, and persists mutations through an atomic same-directory temporary-file replace. Existing menu, prompt-command, and agent-tool behavior is untouched. Runtime is dominated by configuration I/O plus O(n) rendering in node count. Side effects include global-config bootstrapping and atomic configuration writes.
- @satisfies PRJ-010, DES-032, DES-034, REQ-532, REQ-533, REQ-534, REQ-537, REQ-538, REQ-540, REQ-541, REQ-544, REQ-548, REQ-549, REQ-550, REQ-551, REQ-552, REQ-553, REQ-554, REQ-555, REQ-557, REQ-558, REQ-559, REQ-560, REQ-563

## Imports
```
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
import {
import {
import { ReqError } from "./errors.js";
```

## Definitions

### fn `export function isConfigCliInvocation(argv: readonly string[]): boolean` (L60-62)
- @brief Tests whether one argv belongs to the configuration CLI surface.
- @details Requires the configuration flag to be the leading token so the additive commands never capture existing option values. Runtime is O(1). No external state is mutated.
- @param[in] argv {readonly string[]} Raw CLI arguments excluding the executable and script path.
- @return {boolean} `true` when the invocation targets the configuration CLI.
- @satisfies REQ-558

### fn `function renderJsonValue(value: unknown): string` (L71-74)
- @brief Renders one value as compact JSON text.
- @details Serializes strings with JSON quoting while keeping numbers and booleans literal, and maps an unserializable value to `null`. Runtime is O(n) in value size. No external state is mutated.
- @param[in] value {unknown} Value to render.
- @return {string} JSON text.
- @satisfies REQ-539, REQ-548

### fn `function formatShellArgument(value: unknown): string` (L83-92)
- @brief Formats one shell-safe argument for a generated command example.
- @details Leaves simple tokens bare, single-quotes every string containing spaces or shell metacharacters while escaping embedded single quotes, and renders numbers plus booleans as JSON literals. Runtime is O(n) in value length. No external state is mutated.
- @param[in] value {unknown} Example value.
- @return {string} Shell-ready argument text.
- @satisfies REQ-553

### fn `function formatSetCommand(commandPath: string, value: unknown): string` (L102-104)
- @brief Formats one `--set` command example.
- @details Combines the canonical target path with a shell-safe example argument. Runtime is O(n) in argument length. No external state is mutated.
- @param[in] commandPath {string} Canonical target path.
- @param[in] value {unknown} Example value.
- @return {string} Complete `--set` command text.
- @satisfies REQ-553

### fn `function formatValueStatus(currentValue: unknown, defaultValue: unknown): string` (L114-119)
- @brief Formats the default-or-custom status suffix of one `--print` value.
- @details Compares the rendered value with the rendered schema default so typed values stay comparable without ad-hoc equality logic. Runtime is O(n) in value size. No external state is mutated.
- @param[in] currentValue {unknown} Current typed value.
- @param[in] defaultValue {unknown} Schema default value.
- @return {string} `(default)` or `(custom | default: <JSON>)`.
- @satisfies REQ-548

### fn `function renderTableCell(value: unknown): string` (L128-130)
- @brief Renders one table cell from a typed configuration value.
- @details Uses JSON text for present values and `-` for absent optional keys so multi-line strings stay escaped on one physical line. Runtime is O(n) in value size. No external state is mutated.
- @param[in] value {unknown} Cell value.
- @return {string} Rendered cell text.
- @satisfies REQ-547

### fn `function getArrayItemExample(parameter: ConfigSchemaParameter): unknown` (L139-141)
- @brief Resolves the example item used by append, insert, and replace commands.
- @details Returns the schema example verbatim so generated commands stay schema-valid. Runtime is O(1). No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Array parameter.
- @return {unknown} Example item value.
- @satisfies REQ-551

### fn `function buildPrintParameterHeading(parameter: ConfigSchemaParameter, value: unknown): string` (L151-163)
- @brief Builds the complete `--print` heading of one parameter.
- @details Emits primitive values as JSON with default status, selection values as JSON with default status, and array collections with the documented count, target, and append summaries; empty collections receive a complete-path add hint instead of a table. Runtime is O(n) in collection size. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Parameter schema.
- @param[in] value {unknown} Current parameter value.
- @return {string} Parameter heading.
- @satisfies REQ-548, REQ-550, REQ-551

### fn `function buildPrintParameterDetails(parameter: ConfigSchemaParameter, value: unknown): string[]` (L173-202)
- @brief Builds the attached `--print` details of one parameter.
- @details Emits the `Sel | Value` selection table with exactly one active row and the `Idx`-prefixed primitive or object-array tables for non-empty collections. Runtime is O(r * c) in table size. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Parameter schema.
- @param[in] value {unknown} Current parameter value.
- @return {string[]} Attached detail lines.
- @satisfies REQ-549, REQ-550, REQ-551

### fn `function buildInfoParameterHeading(parameter: ConfigSchemaParameter): string` (L211-213)
- @brief Builds the complete `--info` heading of one parameter.
- @details Emits the exact token, typed constraint text, and one concise English description. Runtime is O(n) in text length. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Parameter schema.
- @return {string} Parameter heading.
- @satisfies REQ-552

### fn `function resolveInfoExampleValue(parameter: ConfigSchemaParameter): unknown` (L222-233)
- @brief Resolves one schema-valid example value distinct from the default when possible.
- @details Selects an example that exercises the set command without restating the default for booleans, selections, and integer domains, and reuses the schema example otherwise. Runtime is O(e) in enum size. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Parameter schema.
- @return {unknown} Example value.
- @satisfies REQ-553

### fn `function buildInfoAllowedValuesTable(parameter: ConfigSchemaParameter): string[]` (L242-253)
- @brief Builds the provided `Value`, `Default`, `Meaning`, and `Set cmd` table.
- @details Renders one row per enum or integer value with a complete valid set command so `--info` documents the whole selection domain. Runtime is O(v * c) in value count. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Selection or integer-enum parameter.
- @return {string[]} Rendered table lines.
- @satisfies REQ-554

### fn `function formatItemSchemaDescription(field: ConfigSchemaField): string` (L262-264)
- @brief Builds the field-description cell of one item-schema row.
- @details Appends the schema-valid example to the English field description so downstream agents can construct valid rows without extra lookups. Runtime is O(n) in text length. No external state is mutated.
- @param[in] field {ConfigSchemaField} Field schema.
- @return {string} Description and example cell text.
- @satisfies REQ-555

### fn `function buildInfoItemSchemaTable(parameter: ConfigSchemaParameter): string[]` (L273-285)
- @brief Builds the `Item Schema` table of one object-array parameter.
- @details Emits the exact field tokens, type constraints, default-or-requirement status, and description with example for every fixed field. Runtime is O(f * c) in field count. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Object-array parameter.
- @return {string[]} Rendered table lines.
- @satisfies REQ-555

### fn `function buildInfoArrayDetails(parameter: ConfigSchemaParameter): string[]` (L294-318)
- @brief Builds the array command details of one primitive or object array.
- @details Emits complete overwrite, append, insert, replace, delete, and reset commands with canonical paths; single-row operations receive exactly one item, whole-array overwrite receives one JSON array, and object arrays additionally emit the item-schema table plus update and reset cell commands. Runtime is O(f * c) in field count. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Array parameter.
- @return {string[]} Attached detail lines.
- @satisfies REQ-553, REQ-555, REQ-556

### fn `function buildInfoParameterDetails(parameter: ConfigSchemaParameter): string[]` (L327-342)
- @brief Builds the attached `--info` details of one parameter.
- @details Emits the default line with its reset command, the set or array command family with complete canonical paths and schema-valid examples, the selection allowed-values table, and the object-array item-schema commands. Runtime is O(f + v) in field and value count. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Parameter schema.
- @return {string[]} Attached detail lines.
- @satisfies REQ-553, REQ-554, REQ-555, REQ-556

### fn `function buildSectionRenderNode(` (L353-365)
- @brief Builds one rendered section node.
- @details Emits the canonical `[Path: ...]` badge, an optional `--info` reset block, and every real child in schema order. Runtime is O(n) in subtree node count. No external state is mutated.
- @param[in] section {ConfigSchemaSection} Section schema.
- @param[in] scopePayload {Record<string, unknown>} Owning scope payload.
- @param[in] info {boolean} When `true`, build `--info` content instead of `--print` content.
- @return {ConfigRenderTreeNode} Rendered section node.
- @satisfies REQ-541, REQ-543

### fn `function buildParameterRenderNode(` (L376-387)
- @brief Builds one rendered parameter node.
- @details Chooses the `--print` or `--info` heading and detail formatters over the same real node so both commands share one tree topology. Runtime is O(n) in value and table size. No external state is mutated.
- @param[in] parameter {ConfigSchemaParameter} Parameter schema.
- @param[in] scopePayload {Record<string, unknown>} Owning scope payload.
- @param[in] info {boolean} When `true`, build `--info` content instead of `--print` content.
- @return {ConfigRenderTreeNode} Rendered parameter node.
- @satisfies REQ-541, REQ-548, REQ-549, REQ-550, REQ-552, REQ-553

### fn `function buildFullRenderRoot(state: ConfigScopeState, info: boolean): ConfigRenderRoot` (L397-404)
- @brief Builds the complete rendered root for one display command.
- @details Emits the virtual `Application_Configuration` root with the documented heading and both real scope sections. Runtime is O(n) in schema node count. No external state is mutated.
- @param[in] state {ConfigScopeState} Mutable scope state.
- @param[in] info {boolean} When `true`, build `--info` content.
- @return {ConfigRenderRoot} Rendered display root.
- @satisfies REQ-541, REQ-543

### fn `function buildRequestedRenderRoot(` (L416-431)
- @brief Builds the rendered root for one requested subtree or parameter.
- @details Emits the requested section or parameter as the unconnected display root with a four-space detail indent and renders only its own descendants, never invented ancestors. Runtime is O(n) in subtree size. No external state is mutated.
- @param[in] state {ConfigScopeState} Mutable scope state.
- @param[in] configPath {string} Requested canonical path.
- @param[in] info {boolean} When `true`, build `--info` content.
- @return {ConfigRenderRoot} Rendered display root.
- @throws {ReqError} Throws when the path does not address a section or parameter.
- @satisfies REQ-544, REQ-545

### fn `function loadConfigCliState(base: string): ConfigScopeState` (L440-446)
- @brief Loads mutable scope state from the existing configuration loaders.
- @details Reuses `loadConfig(...)` plus the persisted scope projections so reads and writes observe the same state as the existing menu and prompt-command interfaces. Runtime is dominated by configuration I/O. Side effects are limited to filesystem reads.
- @param[in] base {string} Absolute project base path.
- @return {ConfigScopeState} Mutable scope state pair.
- @satisfies REQ-532, REQ-533

### fn `function resolveScopeWritePath(scope: ConfigScope, base: string): string` (L456-458)
- @brief Resolves the persisted file path owned by one scope.
- @details Uses the shared project-local and global configuration path helpers so writes target the same files as the existing interfaces. Runtime is O(p) in path length. No external state is mutated.
- @param[in] scope {ConfigScope} Configuration scope.
- @param[in] base {string} Absolute project base path.
- @return {string} Absolute configuration file path.
- @satisfies REQ-533

### fn `function atomicWriteJsonPayload(filePath: string, payload: Record<string, unknown>): void` (L469-520)
- @brief Atomically replaces one JSON configuration file.
- @details Writes the complete payload into a same-directory temporary file with exclusive creation, flushes and fsyncs it, preserves the existing permission bits when the target already exists, atomically renames it over the target, and best-effort fsyncs the directory. Failures remove the temporary file and surface one English diagnostic without touching the target. Runtime is O(n) in serialized size plus filesystem I/O. Side effects include directory creation, temporary-file creation, rename, and conditional fsync.
- @param[in] filePath {string} Absolute target path.
- @param[in] payload {Record<string, unknown>} Complete schema-projected payload.
- @return {void} No return value.
- @throws {ReqError} Throws when the write fails.
- @satisfies REQ-537

### fn `function ensureGlobalConfigFile(base: string): void` (L530-546)
- @brief Initializes the global configuration file from schema defaults when missing.
- @details Creates the parent directory and writes the documented default payload atomically when the global JSON file is absent, and leaves any existing valid file untouched while rejecting malformed JSON. Runtime is dominated by configuration I/O. Side effects include directory creation and conditional global-file creation.
- @param[in] base {string} Absolute project base path.
- @return {void} No return value.
- @throws {ReqError} Throws when the existing global file is malformed or not a JSON object.
- @satisfies REQ-534

### fn `function assertCommandArgumentCount(` (L560-570)
- @brief Enforces the exact argument count of one configuration command.
- @details Emits one English diagnostic naming the command and its required operands. Runtime is O(1). No external state is mutated.
- @param[in] command {string} Configuration command token.
- @param[in] args {readonly string[]} Command operands.
- @param[in] minimum {number} Minimum operand count.
- @param[in] maximum {number} Maximum operand count.
- @param[in] usage {string} Documented operand shape.
- @return {void} No return value.
- @throws {ReqError} Throws when the operand count is outside the requested range.
- @satisfies REQ-557

### fn `function assertPathArgument(candidate: string): void` (L580-584)
- @brief Rejects one path operand that is actually another option token.
- @details Keeps the configuration CLI grammar unambiguous by refusing option-like path values. Runtime is O(1). No external state is mutated.
- @param[in] candidate {string} Path operand.
- @return {void} No return value.
- @throws {ReqError} Throws when the operand starts with `--`.
- @satisfies REQ-545

### fn `function reconcileScopePolicy(target: ConfigTarget, payload: Record<string, unknown>): void` (L595-608)
- @brief Reconciles scope-level policy after one mutation.
- @details Forces persisted worktree disablement whenever automatic git commit is disabled and rejects an explicit attempt to enable worktrees under that policy. Runtime is O(1). Side effect: may mutate the supplied payload.
- @param[in] target {ConfigTarget} Resolved mutation target.
- @param[in,out] payload {Record<string, unknown>} Owning scope payload.
- @return {void} No return value.
- @throws {ReqError} Throws when the mutation contradicts the automatic-commit policy.
- @satisfies REQ-560

### fn `function validateCrossFieldConstraints(scope: ConfigScope, payload: Record<string, unknown>): void` (L619-641)
- @brief Validates cross-field scope constraints before a write.
- @details Enforces the Pushover credential prerequisite and the automatic-commit worktree policy so schema-valid payloads cannot encode unusable cross-field states. Runtime is O(1). No external state is mutated.
- @param[in] scope {ConfigScope} Configuration scope.
- @param[in] payload {Record<string, unknown>} Candidate scope payload.
- @return {void} No return value.
- @throws {ReqError} Throws when a cross-field constraint fails.
- @satisfies REQ-559, REQ-560

### fn `function persistScopeMutation(` (L653-663)
- @brief Validates, projects, and atomically persists one mutated scope.
- @details Applies scope policy, checks cross-field constraints, projects the payload onto the canonical schema, validates every leaf, and writes only the owning file. Runtime is dominated by configuration I/O. Side effects include conditional directory creation and atomic file replacement.
- @param[in] base {string} Absolute project base path.
- @param[in] target {ConfigTarget} Resolved mutation target.
- @param[in] payload {Record<string, unknown>} Mutated scope payload.
- @return {void} No return value.
- @throws {ReqError} Throws without writing when validation fails.
- @satisfies REQ-535, REQ-537, REQ-559, REQ-560, REQ-561

### fn `function runDisplayCommand(base: string, configPath: string | undefined, info: boolean): void` (L674-680)
- @brief Executes one `--print` or `--info` display command.
- @details Loads scope state, builds the full or requested render root, and writes the rendered tree to stdout. Runtime is O(n) in rendered node and table size. Side effect: writes to stdout.
- @param[in] base {string} Absolute project base path.
- @param[in] configPath {string | undefined} Optional requested path.
- @param[in] info {boolean} When `true`, render schema documentation instead of values.
- @return {void} No return value.
- @satisfies REQ-541, REQ-543, REQ-544, REQ-557

### fn `function runGetCommand(base: string, configPath: string): void` (L690-706)
- @brief Executes one `--get` command.
- @details Resolves the canonical target, reads the typed value from the owning scope, and writes valid JSON to stdout without decoration. Runtime is O(n) in value size. Side effect: writes to stdout.
- @param[in] base {string} Absolute project base path.
- @param[in] configPath {string} Requested canonical path.
- @return {void} No return value.
- @satisfies REQ-539, REQ-545

### fn `function runSetCommand(base: string, configPath: string, rawValue: string): void` (L717-722)
- @brief Executes one `--set` command.
- @details Resolves the canonical target, applies the typed mutation to in-memory scope state, validates and persists the owning scope atomically, and writes nothing to stdout on success. Runtime is dominated by configuration I/O. Side effects include atomic configuration writes.
- @param[in] base {string} Absolute project base path.
- @param[in] configPath {string} Target canonical path.
- @param[in] rawValue {string} Raw CLI value.
- @return {void} No return value.
- @satisfies REQ-535, REQ-536, REQ-537, REQ-546, REQ-556, REQ-563

### fn `function runUnsetCommand(base: string, configPath: string): void` (L732-737)
- @brief Executes one `--unset` command.
- @details Resolves the canonical target, restores the documented default or removes the addressed row or optional field, validates and persists the owning scope atomically, and writes nothing to stdout on success. Runtime is dominated by configuration I/O. Side effects include atomic configuration writes.
- @param[in] base {string} Absolute project base path.
- @param[in] configPath {string} Target canonical path.
- @return {void} No return value.
- @satisfies REQ-535, REQ-546, REQ-556, REQ-563

### fn `function runPrintRawCommand(base: string): void` (L746-749)
- @brief Executes one `--print-raw` command.
- @details Bootstraps a missing global file, then writes the selected global configuration file bytes to stdout without parsing, reformatting, or tree decoration. Runtime is O(n) in file size. Side effect: writes raw bytes to stdout.
- @param[in] base {string} Absolute project base path used for bootstrapping.
- @return {void} No return value.
- @satisfies REQ-540

### fn `function executeConfigCli(argv: readonly string[]): void` (L759-801)
- @brief Executes one parsed configuration CLI invocation.
- @details Validates the operand shape, bootstraps the global JSON file, and dispatches the selected display, read, or mutation command. Runtime is dominated by the delegated command. Side effects include global-config bootstrapping, stdout writes, and atomic configuration writes.
- @param[in] argv {readonly string[]} Raw configuration CLI arguments.
- @return {void} No return value.
- @throws {ReqError} Throws on malformed invocations or failing commands.
- @satisfies REQ-534, REQ-538, REQ-558

### fn `export function runConfigCli(argv: readonly string[]): number` (L810-819)
- @brief Runs one configuration CLI invocation and normalizes its exit contract.
- @details Executes the selected command, returns `0` on success, and converts every failure into one English stderr diagnostic with exit code `1` without partial stdout success output. Runtime is dominated by the delegated command. Side effects are stdout or stderr writes plus delegated configuration changes.
- @param[in] argv {readonly string[]} Raw configuration CLI arguments.
- @return {number} Process exit code.
- @satisfies REQ-538, REQ-557, REQ-563

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`isConfigCliInvocation`|fn||60-62|export function isConfigCliInvocation(argv: readonly stri...|
|`renderJsonValue`|fn||71-74|function renderJsonValue(value: unknown): string|
|`formatShellArgument`|fn||83-92|function formatShellArgument(value: unknown): string|
|`formatSetCommand`|fn||102-104|function formatSetCommand(commandPath: string, value: unk...|
|`formatValueStatus`|fn||114-119|function formatValueStatus(currentValue: unknown, default...|
|`renderTableCell`|fn||128-130|function renderTableCell(value: unknown): string|
|`getArrayItemExample`|fn||139-141|function getArrayItemExample(parameter: ConfigSchemaParam...|
|`buildPrintParameterHeading`|fn||151-163|function buildPrintParameterHeading(parameter: ConfigSche...|
|`buildPrintParameterDetails`|fn||173-202|function buildPrintParameterDetails(parameter: ConfigSche...|
|`buildInfoParameterHeading`|fn||211-213|function buildInfoParameterHeading(parameter: ConfigSchem...|
|`resolveInfoExampleValue`|fn||222-233|function resolveInfoExampleValue(parameter: ConfigSchemaP...|
|`buildInfoAllowedValuesTable`|fn||242-253|function buildInfoAllowedValuesTable(parameter: ConfigSch...|
|`formatItemSchemaDescription`|fn||262-264|function formatItemSchemaDescription(field: ConfigSchemaF...|
|`buildInfoItemSchemaTable`|fn||273-285|function buildInfoItemSchemaTable(parameter: ConfigSchema...|
|`buildInfoArrayDetails`|fn||294-318|function buildInfoArrayDetails(parameter: ConfigSchemaPar...|
|`buildInfoParameterDetails`|fn||327-342|function buildInfoParameterDetails(parameter: ConfigSchem...|
|`buildSectionRenderNode`|fn||353-365|function buildSectionRenderNode(|
|`buildParameterRenderNode`|fn||376-387|function buildParameterRenderNode(|
|`buildFullRenderRoot`|fn||397-404|function buildFullRenderRoot(state: ConfigScopeState, inf...|
|`buildRequestedRenderRoot`|fn||416-431|function buildRequestedRenderRoot(|
|`loadConfigCliState`|fn||440-446|function loadConfigCliState(base: string): ConfigScopeState|
|`resolveScopeWritePath`|fn||456-458|function resolveScopeWritePath(scope: ConfigScope, base: ...|
|`atomicWriteJsonPayload`|fn||469-520|function atomicWriteJsonPayload(filePath: string, payload...|
|`ensureGlobalConfigFile`|fn||530-546|function ensureGlobalConfigFile(base: string): void|
|`assertCommandArgumentCount`|fn||560-570|function assertCommandArgumentCount(|
|`assertPathArgument`|fn||580-584|function assertPathArgument(candidate: string): void|
|`reconcileScopePolicy`|fn||595-608|function reconcileScopePolicy(target: ConfigTarget, paylo...|
|`validateCrossFieldConstraints`|fn||619-641|function validateCrossFieldConstraints(scope: ConfigScope...|
|`persistScopeMutation`|fn||653-663|function persistScopeMutation(|
|`runDisplayCommand`|fn||674-680|function runDisplayCommand(base: string, configPath: stri...|
|`runGetCommand`|fn||690-706|function runGetCommand(base: string, configPath: string):...|
|`runSetCommand`|fn||717-722|function runSetCommand(base: string, configPath: string, ...|
|`runUnsetCommand`|fn||732-737|function runUnsetCommand(base: string, configPath: string...|
|`runPrintRawCommand`|fn||746-749|function runPrintRawCommand(base: string): void|
|`executeConfigCli`|fn||759-801|function executeConfigCli(argv: readonly string[]): void|
|`runConfigCli`|fn||810-819|export function runConfigCli(argv: readonly string[]): nu...|


---

# config.ts | TypeScript | 1229L | 46 symbols | 8 imports | 56 comments
> Path: `src/core/config.ts`
- @brief Loads, normalizes, merges, and persists pi-usereq configuration.
- @details Defines the effective configuration schema, split local/global persistence contracts, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi-usereq.json` and `~/.config/pi-usereq/config.json`.

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

### iface `export interface StaticCheckEntry` (L63-67)
- @brief Describes one static-check module configuration entry.
- @details Each record identifies the checker module and optional command or parameter list used during per-language static analysis dispatch. The interface is type-only and has no runtime cost.

- type `export type StaticCheckEnabled = "enable" | "disable";` (L73)
- @brief Represents the persisted per-language static-check enable flag.
- @details Narrows persisted per-language enablement to the documented `enable|disable` domain reused by configuration loading, menu toggles, and static-check dispatch. The alias is compile-time only and introduces no runtime cost.
### iface `export interface StaticCheckLanguageConfig` (L79-82)
- @brief Describes one persisted per-language static-check configuration object.
- @details Couples the per-language enable flag with the ordered checker-entry list so menu toggles, config serialization, and execution dispatch can distinguish configured-but-disabled languages from enabled active checker lists. The interface is compile-time only and introduces no runtime cost.

### iface `export interface UseReqConfig` (L88-132)
- @brief Defines the effective pi-usereq configuration schema.
- @details Captures the merged runtime view produced from project-local and cross-project persisted scopes, including documentation paths, source/test directory selection, per-language static-check enablement plus checker configuration, prompt-command worktree settings, enabled startup tools, and notification settings while excluding runtime-derived path metadata. The interface is compile-time only and introduces no runtime side effects.

### iface `interface LocalStaticCheckLanguageConfig` (L138-140)
- @brief Defines one persisted local static-check language configuration.
- @details Stores only the project-local enable flag so checker command definitions can live exclusively in global configuration. The interface is compile-time only and introduces no runtime cost.

### iface `interface GlobalStaticCheckLanguageConfig` (L146-148)
- @brief Defines one persisted global static-check language configuration.
- @details Stores only the cross-project checker-entry array so project-local files do not duplicate command definitions. The interface is compile-time only and introduces no runtime cost.

### iface `interface UseReqLocalConfig` (L155-172)
- @brief Defines the persisted local pi-usereq configuration schema.
- @details Captures project-scoped directory, debug, and static-check enablement fields written to `<base-path>/.pi-usereq.json` while excluding the runtime-only `DEBUG_ENABLED` flag and global notification, tool, git, and checker-command settings. The interface is compile-time only and introduces no runtime side effects.
- @satisfies REQ-426

### iface `interface UseReqGlobalConfig` (L178-206)
- @brief Defines the persisted global pi-usereq configuration schema.
- @details Captures cross-project static-check checker commands, enabled tool names, git automation fields, and notification settings written to `~/.config/pi-usereq/config.json` while excluding project-local directory and debug fields. The interface is compile-time only and introduces no runtime side effects.

### fn `export function normalizeContextFilesFlag(value: unknown): boolean` (L238-240)
- @brief Normalizes one persisted context-file injection flag.
- @details Returns the documented default (`true`) for missing or non-boolean values and preserves only explicit boolean input, so any malformed persisted entry keeps context-file injection enabled. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted context-file flag.
- @return {boolean} Normalized context-file injection flag.
- @satisfies REQ-328

### fn `function cloneStaticCheckEntry(entry: StaticCheckEntry): StaticCheckEntry` (L340-349)
- @brief Clones one static-check entry into its persisted shape.
- @details Copies only the stable module, cmd, and params fields so runtime-only or unknown metadata never leaks into persisted configuration payloads. Runtime is O(p) in parameter count. No external state is mutated.
- @param[in] entry {StaticCheckEntry} Source static-check entry.
- @return {StaticCheckEntry} Persistable static-check entry clone.

### fn `export function createStaticCheckLanguageConfig(` (L358-367)
- @brief Builds one per-language static-check configuration object.
- @details Clones the supplied checker entries, derives `enabled` from the explicit argument or checker-list emptiness, and preserves checker order for menu and dispatch determinism. Runtime is O(c + p). No external state is mutated.
- @param[in] checkers {StaticCheckEntry[]} Ordered checker entries.
- @param[in] enabled {StaticCheckEnabled | undefined} Optional explicit enable flag.
- @return {StaticCheckLanguageConfig} Normalized per-language config object.

### fn `function createLocalStaticCheckLanguageConfig(` (L375-379)
- @brief Builds one persisted local static-check language configuration object.
- @details Stores only the normalized enable flag so local project files do not duplicate checker command definitions. Runtime is O(1). No external state is mutated.
- @param[in] enabled {StaticCheckEnabled} Canonical per-language enable flag.
- @return {LocalStaticCheckLanguageConfig} Persistable local static-check language config.

### fn `function createGlobalStaticCheckLanguageConfig(` (L387-393)
- @brief Builds one persisted global static-check language configuration object.
- @details Clones the supplied checker entries so global configuration retains only stable module, command, and parameter fields. Runtime is O(c + p). No external state is mutated.
- @param[in] checkers {StaticCheckEntry[]} Ordered checker entries.
- @return {GlobalStaticCheckLanguageConfig} Persistable global static-check language config.

### fn `function getDefaultGlobalStaticCheckConfig(): Record<string, GlobalStaticCheckLanguageConfig>` (L400-405)
- @brief Returns the documented default global static-check checker map.
- @details Emits one checker-array object for every supported language, preserving documented Command entries for default-enabled languages and `[]` for every other language. Runtime is O(l + c). No external state is mutated.
- @return {Record<string, GlobalStaticCheckLanguageConfig>} Fresh default global checker map.

### fn `function getDefaultLocalStaticCheckConfig(` (L413-422)
- @brief Returns the documented default local static-check enable map.
- @details Derives each per-language enable flag from the supplied global checker definitions using the rule `enable` when `checkers` is non-empty and `disable` otherwise. Runtime is O(l). No external state is mutated.
- @param[in] globalStaticCheckConfig {Record<string, GlobalStaticCheckLanguageConfig>} Global checker map used to derive default enablement.
- @return {Record<string, LocalStaticCheckLanguageConfig>} Fresh default local enable map.

### fn `function mergeStaticCheckConfig(` (L431-450)
- @brief Merges local enable flags with global checker definitions into the effective static-check map.
- @details Unifies all language keys present in either persisted scope, applies the default-enable rule when the local scope omits a language, and clones checker entries into the effective runtime config. Runtime is O(l + c + p). No external state is mutated.
- @param[in] localStaticCheckConfig {Record<string, LocalStaticCheckLanguageConfig>} Persisted local enable map.
- @param[in] globalStaticCheckConfig {Record<string, GlobalStaticCheckLanguageConfig>} Persisted global checker map.
- @return {Record<string, StaticCheckLanguageConfig>} Effective per-language static-check config.

### fn `export function getDefaultStaticCheckConfig(): Record<string, StaticCheckLanguageConfig>` (L458-464)
- @brief Returns the documented default static-check configuration.
- @details Emits one effective per-language config object for every supported language by merging documented global checker defaults with derived local enable defaults. Runtime is O(l + c). No external state is mutated.
- @return {Record<string, StaticCheckLanguageConfig>} Fresh default effective static-check config.
- @satisfies REQ-249, REQ-250, REQ-251, REQ-252, REQ-316

### fn `export function normalizeStaticCheckEnabled(` (L474-479)
- @brief Normalizes one persisted per-language static-check enable flag.
- @details Accepts only the documented `enable|disable` values and falls back to the supplied default when the candidate is absent or invalid. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted enable flag.
- @param[in] defaultValue {StaticCheckEnabled} Fallback enable flag.
- @return {StaticCheckEnabled} Canonical per-language enable flag.
- @satisfies REQ-249

### fn `export function getActiveStaticCheckEntries(` (L489-498)
- @brief Resolves the active checker list for one language.
- @details Returns the persisted checker list only when the language is enabled; disabled or missing languages yield an empty list without mutating the source config. Runtime is O(c). No external state is mutated.
- @param[in] staticCheckConfig {Record<string, StaticCheckLanguageConfig>} Effective static-check config.
- @param[in] language {string} Canonical language name.
- @return {StaticCheckEntry[]} Active checker list for the language.
- @satisfies REQ-019

### fn `export function normalizeAutoGitCommit(value: unknown): "enable" | "disable"` (L513-515)
- @brief Normalizes one persisted automatic git-commit mode value.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_AUTO_GIT_COMMIT` for all other payloads. Runtime is O(1). No side effects occur.
- @param[in] value {unknown} Candidate persisted automatic git-commit payload.
- @return {"enable" | "disable"} Canonical automatic git-commit mode.
- @satisfies REQ-212

### fn `export function normalizeGitWorktreeEnabled(value: unknown): "enable" | "disable"` (L529-531)
- @brief Normalizes one persisted worktree-enable flag value.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_GIT_WORKTREE_ENABLED` for all other payloads. Runtime is O(1). No side effects occur.
- @param[in] value {unknown} Candidate persisted worktree-enable payload.
- @return {"enable" | "disable"} Canonical persisted worktree-enable mode.
- @satisfies REQ-204

### fn `export function resolveEffectiveGitWorktreeEnabled(` (L540-545)
- @brief Resolves the effective worktree mode after automatic-commit policy is applied.
- @details Forces `disable` whenever `AUTO_GIT_COMMIT` is disabled; otherwise preserves the normalized persisted worktree flag. Runtime is O(1). No side effects occur.
- @param[in] autoGitCommit {"enable" | "disable"} Effective automatic git-commit mode.
- @param[in] gitWorktreeEnabled {"enable" | "disable"} Normalized persisted worktree-enable mode.
- @return {"enable" | "disable"} Effective worktree mode used by menus, persistence, and prompt execution.
- @satisfies REQ-204, REQ-215

### fn `export function normalizeGitWorktreePrefix(value: unknown): string` (L559-565)
- @brief Normalizes one persisted worktree-name prefix value.
- @details Accepts only non-empty strings, trims surrounding whitespace, and falls back to `DEFAULT_GIT_WORKTREE_PREFIX` when the candidate is absent or blank. Runtime is O(n) in prefix length. No side effects occur.
- @param[in] value {unknown} Candidate persisted prefix payload.
- @return {string} Canonical worktree-name prefix.
- @satisfies REQ-205

### fn `export function getProjectConfigPath(projectBase: string): string` (L572-574)
- @brief Computes the per-project local config file path.
- @details Joins the project base with `.pi-usereq.json`, producing the canonical local persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {string} Absolute local config file path.

### fn `export function getGlobalConfigPath(): string` (L581-583)
- @brief Computes the cross-project global config file path.
- @details Resolves `~/.config/pi-usereq/config.json` through the shared runtime path helper so CLI and extension code use one canonical global persistence location. Time complexity is O(1). No I/O side effects occur.
- @return {string} Absolute global config file path.

### fn `function getDefaultLocalConfig(` (L592-613)
- @brief Builds the default persisted local configuration.
- @details Populates canonical docs/test/source directories, derives local static-check enable defaults from the supplied global checker definitions, and seeds documented debug defaults including tool-wrapper command registration without any cross-project fields. Runtime is O(l). No filesystem side effects occur.
- @param[in] globalStaticCheckConfig {Record<string, GlobalStaticCheckLanguageConfig>} Global checker definitions used to derive local enable defaults.
- @return {UseReqLocalConfig} Fresh default local configuration object.
- @satisfies CTN-013, CTN-019, REQ-328, REQ-413, REQ-414, REQ-426

### fn `function getDefaultGlobalConfig(): UseReqGlobalConfig` (L620-650)
- @brief Builds the default persisted global configuration.
- @details Populates documented cross-project static-check checker commands, enabled tools, git automation fields, and notification defaults without any project-local directory or debug fields. Runtime is O(l + c). No filesystem side effects occur.
- @return {UseReqGlobalConfig} Fresh default global configuration object.

### fn `function mergeConfigScopes(` (L660-732)
- @brief Merges persisted local and global configuration scopes into the effective runtime config.
- @details Normalizes local directories, combines local static-check enable flags with global checker arrays, resolves effective worktree disablement when automatic git commit is off, normalizes debug and notification fields including tool-wrapper command registration, sources the runtime-only `DEBUG_ENABLED` flag from the process-scoped debug store, and disables Pushover until both credentials are populated. Runtime is O(l + c + p). No external state is mutated.
- @param[in] localConfig {UseReqLocalConfig} Persisted local configuration.
- @param[in] globalConfig {UseReqGlobalConfig} Persisted global configuration.
- @return {UseReqConfig} Effective merged configuration.
- @satisfies REQ-236, REQ-328, REQ-413, REQ-414, REQ-426

### fn `export function getDefaultConfig(_projectBase: string): UseReqConfig` (L741-747)
- @brief Builds the default effective configuration.
- @details Composes documented local and global defaults, then merges them into the effective runtime config consumed by CLI and extension code. Time complexity is O(l + c). No filesystem side effects occur.
- @param[in] _projectBase {string} Absolute project root path retained for stable call sites.
- @return {UseReqConfig} Fresh default effective configuration object.
- @satisfies CTN-001, CTN-012, CTN-013, CTN-018, CTN-019, REQ-066, REQ-137, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-250, REQ-251, REQ-252, REQ-277, REQ-315, REQ-316, REQ-413, REQ-414

### fn `function normalizeStaticCheckEntries(value: unknown): StaticCheckEntry[]` (L755-775)
- @brief Normalizes one raw checker-entry array from persisted config.
- @details Accepts only object entries with a non-empty module string, trims optional command text, filters blank params, and drops malformed records without applying any legacy schema migrations. Runtime is O(c + p). No external state is mutated.
- @param[in] value {unknown} Candidate persisted checker array.
- @return {StaticCheckEntry[]} Normalized checker-entry vector.

### fn `function readConfigPayload(configPath: string): Record<string, unknown> | undefined` (L784-800)
- @brief Reads and validates one persisted config payload.
- @details Returns `undefined` when the target file does not exist. Otherwise parses UTF-8 JSON, rejects array or primitive payloads, and surfaces deterministic `ReqError` diagnostics keyed by the exact path. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] configPath {string} Absolute config file path.
- @return {Record<string, unknown> | undefined} Parsed object payload or `undefined` when the file is absent.
- @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.

### fn `function normalizeLocalStaticCheckConfig(` (L810-834)
- @brief Normalizes the persisted local static-check enable map.
- @details Starts from the supplied default enable map, accepts only object-valued language entries, reads only `enabled`, and ignores misplaced checker arrays or legacy non-object payloads without migration. Runtime is O(l). No external state is mutated.
- @param[in] value {unknown} Candidate persisted local static-check payload.
- @param[in] defaultConfig {Record<string, LocalStaticCheckLanguageConfig>} Default enable map derived from global checker definitions.
- @return {Record<string, LocalStaticCheckLanguageConfig>} Normalized local static-check enable map.
- @satisfies REQ-249, REQ-316

### fn `function normalizeGlobalStaticCheckConfig(` (L843-860)
- @brief Normalizes the persisted global static-check checker map.
- @details Starts from documented global checker defaults, accepts only object-valued language entries, reads only `checkers`, and ignores misplaced local enable flags or legacy non-object payloads without migration. Runtime is O(l + c + p). No external state is mutated.
- @param[in] value {unknown} Candidate persisted global static-check payload.
- @return {Record<string, GlobalStaticCheckLanguageConfig>} Normalized global static-check checker map.
- @satisfies REQ-249, REQ-250, REQ-251, REQ-252

### fn `function loadLocalConfig(` (L870-926)
- @brief Loads and sanitizes the persisted local configuration.
- @details Returns defaults when `<base-path>/.pi-usereq.json` is absent. Otherwise parses the local JSON payload, normalizes project-scoped directory, debug, tool-wrapper command registration, and static-check enable fields, ignores any persisted `DEBUG_ENABLED` payload, and ignores misplaced global keys without migration. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] defaultStaticCheckConfig {Record<string, LocalStaticCheckLanguageConfig>} Local static-check enable defaults derived from the current global checker map.
- @return {UseReqLocalConfig} Sanitized local configuration.
- @satisfies CTN-019, REQ-328, REQ-413, REQ-414, REQ-426

### fn `function loadGlobalConfig(): UseReqGlobalConfig` (L933-974)
- @brief Loads and sanitizes the persisted global configuration.
- @details Returns defaults when `~/.config/pi-usereq/config.json` is absent. Otherwise parses the global JSON payload, normalizes cross-project checker, tool, git, and notification fields, and ignores misplaced local keys without migration. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @return {UseReqGlobalConfig} Sanitized global configuration.

### fn `export function loadConfig(projectBase: string): UseReqConfig` (L984-991)
- @brief Loads and sanitizes the effective merged configuration.
- @details Loads global configuration first so local static-check enable defaults can be derived from the active global checker map, then merges both scopes into the effective runtime config without applying legacy single-file migrations. Runtime is O(n) in combined local and global config size. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Sanitized effective configuration.
- @throws {ReqError} Throws with exit code `11` when either persisted config file contains invalid JSON or a non-object payload.
- @satisfies CTN-012, CTN-013, CTN-018, CTN-019, REQ-066, REQ-137, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-215, REQ-234, REQ-235, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-277, REQ-315, REQ-316, REQ-413, REQ-414

### fn `function buildPersistedLocalConfig(config: UseReqConfig): UseReqLocalConfig` (L1000-1032)
- @brief Builds the persisted local configuration payload.
- @details Copies only project-scoped keys into a fresh object so runtime-derived metadata, the runtime-only `DEBUG_ENABLED` flag, and global checker, tool, git, and notification fields never reach `.pi-usereq.json`, while preserving the debug tool-wrapper command flag beside other persisted local debug settings. Runtime is O(n) in config size. No external state is mutated.
- @param[in] config {UseReqConfig} Effective configuration object.
- @return {UseReqLocalConfig} Persistable local configuration payload.
- @satisfies CTN-012, CTN-013, CTN-019, REQ-104, REQ-146, REQ-249, REQ-316, REQ-277, REQ-328, REQ-413, REQ-414, REQ-426

### fn `function buildPersistedGlobalConfig(config: UseReqConfig): UseReqGlobalConfig` (L1041-1080)
- @brief Builds the persisted global configuration payload.
- @details Copies only cross-project keys into a fresh object so local directory and debug fields never reach `~/.config/pi-usereq/config.json`, while forcing persisted worktree disablement when automatic git commit is disabled and forcing persisted Pushover disablement until both credentials are populated. Runtime is O(n) in config size. No external state is mutated.
- @param[in] config {UseReqConfig} Effective configuration object.
- @return {UseReqGlobalConfig} Persistable global configuration payload.
- @satisfies REQ-137, REQ-163, REQ-174, REQ-178, REQ-184, REQ-196, REQ-204, REQ-205, REQ-212, REQ-234, REQ-249, REQ-315

### fn `function writeConfigFile(configPath: string, payload: object): void` (L1089-1092)
- @brief Writes one normalized config payload to disk.
- @details Creates the parent directory when required, formats JSON with two-space indentation, and terminates the file with a newline. Runtime is O(n) in serialized payload size. Side effects include directory creation and file overwrite.
- @param[in] configPath {string} Absolute destination config path.
- @param[in] payload {object} Persistable config payload.
- @return {void} No return value.

### fn `export function getPersistedLocalConfigPayload(config: UseReqConfig): Record<string, unknown>` (L1101-1103)
- @brief Builds the persisted local configuration payload for external writers.
- @details Exposes the same project-scoped projection used by `saveLocalConfig(...)` so additive CLI persistence layers can write an identical local JSON payload through their own atomic-write path without duplicating the schema mapping. Runtime is O(n) in config size. No external state is mutated.
- @param[in] config {UseReqConfig} Effective configuration object.
- @return {Record<string, unknown>} Persistable local configuration payload.
- @satisfies REQ-533, REQ-561

### fn `export function getPersistedGlobalConfigPayload(config: UseReqConfig): Record<string, unknown>` (L1112-1114)
- @brief Builds the persisted global configuration payload for external writers.
- @details Exposes the same cross-project projection used by `saveGlobalConfig(...)` so additive CLI persistence layers can write an identical global JSON payload through their own atomic-write path without duplicating the schema mapping. Runtime is O(n) in config size. No external state is mutated.
- @param[in] config {UseReqConfig} Effective configuration object.
- @return {Record<string, unknown>} Persistable global configuration payload.
- @satisfies REQ-533, REQ-561

### fn `export function saveLocalConfig(projectBase: string, config: UseReqConfig): void` (L1124-1126)
- @brief Persists the local configuration scope to disk.
- @details Serializes only project-scoped fields into `<base-path>/.pi-usereq.json`, excluding runtime-derived metadata and every global-scope configuration key. Runtime is O(n) in serialized local config size. Side effects include directory creation and file overwrite.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective configuration object to persist.
- @return {void} No return value.
- @satisfies CTN-012, REQ-104, REQ-146

### fn `export function saveGlobalConfig(config: UseReqConfig): void` (L1135-1137)
- @brief Persists the global configuration scope to disk.
- @details Serializes only cross-project fields into `~/.config/pi-usereq/config.json`, excluding every project-local directory and debug setting. Runtime is O(n) in serialized global config size. Side effects include directory creation and file overwrite.
- @param[in] config {UseReqConfig} Effective configuration object to persist.
- @return {void} No return value.
- @satisfies CTN-012, CTN-018, REQ-137, REQ-146, REQ-315

### fn `export function saveConfig(projectBase: string, config: UseReqConfig): void` (L1147-1150)
- @brief Persists the effective configuration to local and global config files.
- @details Splits the effective runtime config into project-scoped and cross-project payloads, then writes both files with normalized JSON formatting. Runtime is O(n) in combined serialized config size. Side effects include directory creation and file overwrite in both persistence locations.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective configuration object to persist.
- @return {void} No return value.
- @satisfies CTN-012, CTN-018, REQ-137, REQ-146, REQ-315

### fn `export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig` (L1159-1177)
- @brief Normalizes persisted directory fields to project-relative forms.
- @details Rewrites docs, tests, and source directories using project containment heuristics, strips trailing separators, and restores defaults for empty results. Runtime is O(n) in configured path count plus path-length processing. No filesystem writes occur.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to normalize.
- @return {UseReqConfig} Normalized configuration copy.

### fn `export function buildPromptReplacementPaths(` (L1187-1229)
- @brief Builds placeholder replacements for bundled prompt rendering.
- @details Computes runtime path context from the execution path, derives installation-owned template and guideline paths, enumerates visible guideline files from the installed resource tree, and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {Record<string, string>} Placeholder-to-string replacement map including runtime path tokens.
- @satisfies REQ-002, REQ-103, REQ-106, REQ-107, CTN-011

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckEntry`|iface||63-67|export interface StaticCheckEntry|
|`StaticCheckEnabled`|type||73||
|`StaticCheckLanguageConfig`|iface||79-82|export interface StaticCheckLanguageConfig|
|`UseReqConfig`|iface||88-132|export interface UseReqConfig|
|`LocalStaticCheckLanguageConfig`|iface||138-140|interface LocalStaticCheckLanguageConfig|
|`GlobalStaticCheckLanguageConfig`|iface||146-148|interface GlobalStaticCheckLanguageConfig|
|`UseReqLocalConfig`|iface||155-172|interface UseReqLocalConfig|
|`UseReqGlobalConfig`|iface||178-206|interface UseReqGlobalConfig|
|`normalizeContextFilesFlag`|fn||238-240|export function normalizeContextFilesFlag(value: unknown)...|
|`cloneStaticCheckEntry`|fn||340-349|function cloneStaticCheckEntry(entry: StaticCheckEntry): ...|
|`createStaticCheckLanguageConfig`|fn||358-367|export function createStaticCheckLanguageConfig(|
|`createLocalStaticCheckLanguageConfig`|fn||375-379|function createLocalStaticCheckLanguageConfig(|
|`createGlobalStaticCheckLanguageConfig`|fn||387-393|function createGlobalStaticCheckLanguageConfig(|
|`getDefaultGlobalStaticCheckConfig`|fn||400-405|function getDefaultGlobalStaticCheckConfig(): Record<stri...|
|`getDefaultLocalStaticCheckConfig`|fn||413-422|function getDefaultLocalStaticCheckConfig(|
|`mergeStaticCheckConfig`|fn||431-450|function mergeStaticCheckConfig(|
|`getDefaultStaticCheckConfig`|fn||458-464|export function getDefaultStaticCheckConfig(): Record<str...|
|`normalizeStaticCheckEnabled`|fn||474-479|export function normalizeStaticCheckEnabled(|
|`getActiveStaticCheckEntries`|fn||489-498|export function getActiveStaticCheckEntries(|
|`normalizeAutoGitCommit`|fn||513-515|export function normalizeAutoGitCommit(value: unknown): "...|
|`normalizeGitWorktreeEnabled`|fn||529-531|export function normalizeGitWorktreeEnabled(value: unknow...|
|`resolveEffectiveGitWorktreeEnabled`|fn||540-545|export function resolveEffectiveGitWorktreeEnabled(|
|`normalizeGitWorktreePrefix`|fn||559-565|export function normalizeGitWorktreePrefix(value: unknown...|
|`getProjectConfigPath`|fn||572-574|export function getProjectConfigPath(projectBase: string)...|
|`getGlobalConfigPath`|fn||581-583|export function getGlobalConfigPath(): string|
|`getDefaultLocalConfig`|fn||592-613|function getDefaultLocalConfig(|
|`getDefaultGlobalConfig`|fn||620-650|function getDefaultGlobalConfig(): UseReqGlobalConfig|
|`mergeConfigScopes`|fn||660-732|function mergeConfigScopes(|
|`getDefaultConfig`|fn||741-747|export function getDefaultConfig(_projectBase: string): U...|
|`normalizeStaticCheckEntries`|fn||755-775|function normalizeStaticCheckEntries(value: unknown): Sta...|
|`readConfigPayload`|fn||784-800|function readConfigPayload(configPath: string): Record<st...|
|`normalizeLocalStaticCheckConfig`|fn||810-834|function normalizeLocalStaticCheckConfig(|
|`normalizeGlobalStaticCheckConfig`|fn||843-860|function normalizeGlobalStaticCheckConfig(|
|`loadLocalConfig`|fn||870-926|function loadLocalConfig(|
|`loadGlobalConfig`|fn||933-974|function loadGlobalConfig(): UseReqGlobalConfig|
|`loadConfig`|fn||984-991|export function loadConfig(projectBase: string): UseReqCo...|
|`buildPersistedLocalConfig`|fn||1000-1032|function buildPersistedLocalConfig(config: UseReqConfig):...|
|`buildPersistedGlobalConfig`|fn||1041-1080|function buildPersistedGlobalConfig(config: UseReqConfig)...|
|`writeConfigFile`|fn||1089-1092|function writeConfigFile(configPath: string, payload: obj...|
|`getPersistedLocalConfigPayload`|fn||1101-1103|export function getPersistedLocalConfigPayload(config: Us...|
|`getPersistedGlobalConfigPayload`|fn||1112-1114|export function getPersistedGlobalConfigPayload(config: U...|
|`saveLocalConfig`|fn||1124-1126|export function saveLocalConfig(projectBase: string, conf...|
|`saveGlobalConfig`|fn||1135-1137|export function saveGlobalConfig(config: UseReqConfig): void|
|`saveConfig`|fn||1147-1150|export function saveConfig(projectBase: string, config: U...|
|`normalizeConfigPaths`|fn||1159-1177|export function normalizeConfigPaths(projectBase: string,...|
|`buildPromptReplacementPaths`|fn||1187-1229|export function buildPromptReplacementPaths(|


---

# context-file-size.ts | TypeScript | 427L | 22 symbols | 6 imports | 27 comments
> Path: `src/core/context-file-size.ts`
- @brief Measures runtime character and token sizes of the canonical context files.
- @details Provides reusable helpers that compute character and `cl100k_base` token estimates for `REQUIREMENTS.md`, `REFERENCES.md`, and `WORKFLOW.md` under `<base-path>/<docs-dir>` so configuration menus and command summaries share one measurement contract. Measurements are memoized per resolved path against the file `mtimeMs` plus `size` signature inside a process-scoped cache that survives extension rebinds, reuse the lean process-cached shared tokenizer counter, and expose idle-time pre-warm scheduling plus a yielding async measurement variant so the one-time tokenizer module load and per-revision content encodes never execute inside a synchronous menu critical path. Runtime is O(n) on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and process-scoped cache mutation.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_DOCS_DIR, type UseReqConfig } from "./config.js";
import { normalizeRelativeDirContract } from "./path-context.js";
import { countTextTokensAndChars, prewarmTokenCounterEncoder } from "./token-counter.js";
import { ReqError } from "./errors.js";
```

## Definitions

- type `export type ContextFileName = (typeof CONTEXT_FILE_NAMES)[number];` (L25)
- @brief Narrows context-file identifiers to the canonical measured document set.
- @details Compile-time alias derived from `CONTEXT_FILE_NAMES` and reused by the measured-facts record keys. The alias introduces no runtime cost.
### iface `export interface ContextFileSizeFacts` (L32-36)
- @brief Describes the measured size facts of one canonical context file.
- @details Stores the filesystem existence flag plus the exact character count and the `cl100k_base` token estimate computed from the file content. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-374

### iface `interface CachedContextFileSizeEntry` (L49-52)
- @brief Stores one memoized context-file measurement with its staleness signature.
- @details Pairs the measured facts with the `mtimeMs` plus `size` filesystem signature observed at measurement time so later probes can decide, through one stat call, whether the cached facts still describe the current file content. The interface is compile-time only and introduces no runtime cost.

### iface `interface ProcessScopedContextFileSizeStore` (L64-67)
- @brief Describes the process-scoped context-file measurement state persisted across extension rebinds.
- @details Stores the stat-signed measurement cache plus the pending pre-warm schedule guards on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, while the hosting process persists across those operations, so session rebinds never re-trigger the heavy first-measurement path for unchanged context files. The interface is compile-time only and introduces no runtime cost.

### fn `function getProcessScopedContextFileSizeStore(): ProcessScopedContextFileSizeStore` (L74-83)
- @brief Returns the process-scoped context-file measurement store.
- @details Lazily initializes one `globalThis` record so session rebinds reuse already measured facts and never double-schedule the idle-time pre-warm for one project base. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedContextFileSizeStore} Mutable process-scoped measurement store.

### fn `export function resolveContextFilePath(` (L94-101)
- @brief Resolves one canonical context-file absolute path for one project base.
- @details Joins the project base with the trailing-slash-free configured `docs-dir` (falling back to `DEFAULT_DOCS_DIR`) and the supplied canonical file name so menus, summaries, and the `%%CONTEXT_FILES%%` renderer address identical targets. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
- @param[in] fileName {ContextFileName} Canonical context-file name.
- @return {string} Absolute context-file path.
- @satisfies REQ-373

### fn `export function measureContextFileSize(filePath: string): ContextFileSizeFacts` (L110-137)
- @brief Measures one context file into deterministic size facts.
- @details Probes the target with one `stat` call, returns the memoized facts when the observed `mtimeMs` plus `size` signature matches the cached entry, and otherwise reads UTF-8 content and reuses the lean process-cached shared tokenizer counter behind `countTextTokensAndChars` for the `cl100k_base` token estimate before storing the fresh facts in the bounded process-scoped cache. Missing, non-file, and unreadable targets return `MISSING_CONTEXT_FILE_SIZE` facts without throwing and without caching. Runtime is O(1) for unchanged remeasures and O(n) in file size on first measurement per content revision. Side effects are limited to filesystem reads and process-scoped cache mutation.
- @param[in] filePath {string} Absolute context-file path to measure.
- @return {ContextFileSizeFacts} Measured size facts for the target.
- @satisfies REQ-373, REQ-374

### fn `export function measureContextFileSizes(` (L147-156)
- @brief Measures every canonical context file for one project base.
- @details Iterates `CONTEXT_FILE_NAMES` in documented order, resolves each configured `<base-path>/<docs-dir>` target through `resolveContextFilePath`, and returns the keyed facts record consumed by configuration menus and command summaries. Repeated invocations with unchanged files resolve through the process-scoped stat-signed measurement cache. Runtime is O(n) in aggregate context-file size on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and process-scoped cache mutation.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
- @return {Record<ContextFileName, ContextFileSizeFacts>} Measured size facts keyed by canonical file name.
- @satisfies REQ-373, REQ-374

### fn `function yieldToEventLoop(): Promise<void>` (L163-165)
- @brief Yields one macrotask turn to the host event loop.
- @details Resolves after `setImmediate`, letting pending UI renders, lifecycle callbacks, and input events process between CPU-bound measurement slices. Runtime is O(1). Side effect: schedules one process task.
- @return {Promise<void>} Promise resolved on the next macrotask turn.

### fn `export async function measureContextFileSizeAsync(filePath: string): Promise<ContextFileSizeFacts>` (L174-202)
- @brief Measures one context file into deterministic size facts with an event-loop yield before re-encoding.
- @details Applies the identical stat-signature freshness contract as `measureContextFileSize`, but awaits one macrotask yield between the stat probe and the read-plus-encode slice when the signature misses, so the TUI can process pending events instead of blocking for the full CPU-bound encode. Cache hits resolve synchronously without yielding. Missing, non-file, and unreadable targets return `MISSING_CONTEXT_FILE_SIZE` facts without throwing and without caching. Runtime is O(1) for unchanged remeasures and O(n) in file size on first measurement per content revision, plus one deferred macrotask per re-encode. Side effects are limited to filesystem reads and process-scoped cache mutation.
- @param[in] filePath {string} Absolute context-file path to measure.
- @return {Promise<ContextFileSizeFacts>} Measured size facts for the target.
- @satisfies REQ-373, REQ-374

### fn `export async function measureContextFileSizesAsync(` (L212-221)
- @brief Measures every canonical context file for one project base with event-loop yields between files.
- @details Iterates `CONTEXT_FILE_NAMES` in documented order, resolves each configured `<base-path>/<docs-dir>` target through `resolveContextFilePath`, and awaits `measureContextFileSizeAsync` per file so CPU-bound re-encode slices are separated by macrotask turns consumed by configuration-menu and command-summary rendering. Returned facts are bit-identical to `measureContextFileSizes`. Runtime is O(n) in aggregate context-file size on first measurement per content revision and O(1) per unchanged remeasure. Side effects are limited to filesystem reads and process-scoped cache mutation.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
- @return {Promise<Record<ContextFileName, ContextFileSizeFacts>>} Measured size facts keyed by canonical file name.
- @satisfies REQ-373, REQ-374

### fn `export function prewarmContextFileMeasurements(projectBase: string, config: UseReqConfig): void` (L230-257)
- @brief Schedules idle-time pre-warm measurement of the canonical context files for one project base.
- @details Chains one `setImmediate` task per canonical context file plus one encoder pre-warm task, so the one-time `js-tiktoken` module load, bundled BPE-rank parse, and first per-file content encodes execute outside any synchronous menu or preflight critical path and later menu renders resolve through stat-signed cache hits. Duplicate scheduling for one resolved project base is suppressed through a process-scoped pending set until the chain completes. The operation is best-effort: every measurement failure is swallowed because measurement already degrades to `MISSING_CONTEXT_FILE_SIZE` facts and later renders re-measure through the identical stat-signature contract. Runtime is O(1) for scheduling; deferred cost is the standard first-measurement cost per file. Side effects include scheduled process tasks, filesystem reads, encoder construction, and process-scoped cache mutation.
- @param[in] projectBase {string} Absolute project root path whose canonical context files should pre-warm.
- @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory.
- @return {void} No return value.

### fn `const releaseSchedule = (): void =>` (L237-239)

### fn `const measureRemaining = (index: number): void =>` (L242-255)

### fn `export function formatContextFileSize(facts: ContextFileSizeFacts): string` (L266-268)
- @brief Formats one measured context-file size as a compact character and token estimate.
- @details Emits the deterministic `<chars>c/<tokens>t` shape reused by menu rows, the top-level summary, and the command invocation summary so every surface exposes identical size facts. Runtime is O(n) in rendered length. No external state is mutated.
- @param[in] facts {ContextFileSizeFacts} Measured context-file size facts.
- @return {string} Compact `<chars>c/<tokens>t` size string.
- @satisfies REQ-375, REQ-376, REQ-377

### iface `export interface ContextOccupancyFacts` (L292-299)
- @brief Describes the computed context-occupancy facts of one enabled context-file set.
- @details Stores the aggregate token total, the resolved selected-model max input context (undefined when unknown), the effective basis tokens used for the percentage, the rendered percentage label, the rendered max-context label, and the final bracketed occupancy suffix. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-400

### fn `export function sumEnabledContextFileTokens(` (L309-322)
- @brief Sums the `cl100k_base` token estimates of every enabled existing context file.
- @details Iterates `CONTEXT_FILE_NAMES` in documented order, skips disabled flags and missing or unreadable files, and accumulates the measured token estimates so occupancy surfaces and the prompt-dispatch early check share one total. Runtime is O(1) in file count. No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">} Effective configuration supplying the three context-file flags.
- @param[in] sizes {Record<string, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
- @return {number} Aggregate token estimate of enabled existing context files.
- @satisfies REQ-400

### fn `export function formatContextWindowTokensLabel(tokens: number): string` (L331-339)
- @brief Formats one context-window token count as a compact human-readable label.
- @details Renders token counts of one million or more as `<x.x>M`, counts of one thousand or more as `<x.x>K`, and smaller counts as rounded integers so the documented `1.0M` fallback shape stays deterministic. Runtime is O(1). No external state is mutated.
- @param[in] tokens {number} Context-window token count to label.
- @return {string} Compact context-window label such as `1.0M`, `200.0K`, or `512`.
- @satisfies REQ-403

### fn `export function formatContextOccupancyPercentLabel(percent: number): string` (L348-351)
- @brief Formats one occupancy percentage as a compact label with one decimal place.
- @details Rounds the percentage to one decimal place and removes a trailing `.0` so whole percentages render as `36%` and fractional values keep their decimal digit. Runtime is O(1). No external state is mutated.
- @param[in] percent {number} Occupancy percentage value.
- @return {string} Percentage label such as `36%`, `0.4%`, or `0%`.
- @satisfies REQ-402

### fn `export function computeContextOccupancyFacts(` (L361-377)
- @brief Computes the context-occupancy facts of one enabled context-file token total.
- @details Resolves the effective basis from the supplied max input context or the documented 1,000,000-token fallback, derives the percentage label, derives the max label with the `*` marker only for the unknown fallback, and renders `[<percent>% context]` for a known max or `[<percent>%/1.0M* context]` for the fallback basis. Runtime is O(1). No external state is mutated.
- @param[in] totalTokens {number} Aggregate enabled existing context-file token estimate.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens; undefined selects the fallback basis.
- @return {ContextOccupancyFacts} Computed occupancy facts including the rendered suffix.
- @satisfies REQ-400, REQ-402, REQ-403

### fn `export function formatEnabledContextFileSegments(` (L387-400)
- @brief Renders every enabled existing context file as a `name(<chars>c/<tokens>t)` segment list.
- @details Iterates `CONTEXT_FILE_NAMES` in documented order, skips disabled flags and missing or unreadable files, and joins the remaining segments with the documented ` • ` separator so early-check diagnostics reuse the same segment shape as the configuration summary. Runtime is O(1) in file count. No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">} Effective configuration supplying the three context-file flags.
- @param[in] sizes {Record<string, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
- @return {string} Joined segment list, or the empty string when no enabled existing context file contributes.
- @satisfies REQ-410

### fn `export function enforceContextOccupancyLimit(` (L412-427)
- @brief Enforces the context-occupancy early check for one prepared prompt command.
- @details Sums the enabled existing context-file tokens, computes the occupancy facts against the supplied max input context or the documented fallback, and throws one deterministic ReqError diagnostic listing every enabled existing file segment, the aggregate token total, and the occupancy suffix whenever the total strictly exceeds the basis. Runtime is O(1) in file count. No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "context-files-requirements" | "context-files-references" | "context-files-workflow">} Effective configuration supplying the three context-file flags.
- @param[in] sizes {Record<string, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens; undefined selects the fallback basis.
- @return {ContextOccupancyFacts} Computed occupancy facts when the check passes.
- @throws {ReqError} Throws when the enabled token total strictly exceeds the effective basis.
- @satisfies REQ-408, REQ-409, REQ-410

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ContextFileName`|type||25||
|`ContextFileSizeFacts`|iface||32-36|export interface ContextFileSizeFacts|
|`CachedContextFileSizeEntry`|iface||49-52|interface CachedContextFileSizeEntry|
|`ProcessScopedContextFileSizeStore`|iface||64-67|interface ProcessScopedContextFileSizeStore|
|`getProcessScopedContextFileSizeStore`|fn||74-83|function getProcessScopedContextFileSizeStore(): ProcessS...|
|`resolveContextFilePath`|fn||94-101|export function resolveContextFilePath(|
|`measureContextFileSize`|fn||110-137|export function measureContextFileSize(filePath: string):...|
|`measureContextFileSizes`|fn||147-156|export function measureContextFileSizes(|
|`yieldToEventLoop`|fn||163-165|function yieldToEventLoop(): Promise<void>|
|`measureContextFileSizeAsync`|fn||174-202|export async function measureContextFileSizeAsync(filePat...|
|`measureContextFileSizesAsync`|fn||212-221|export async function measureContextFileSizesAsync(|
|`prewarmContextFileMeasurements`|fn||230-257|export function prewarmContextFileMeasurements(projectBas...|
|`releaseSchedule`|fn||237-239|const releaseSchedule = (): void =>|
|`measureRemaining`|fn||242-255|const measureRemaining = (index: number): void =>|
|`formatContextFileSize`|fn||266-268|export function formatContextFileSize(facts: ContextFileS...|
|`ContextOccupancyFacts`|iface||292-299|export interface ContextOccupancyFacts|
|`sumEnabledContextFileTokens`|fn||309-322|export function sumEnabledContextFileTokens(|
|`formatContextWindowTokensLabel`|fn||331-339|export function formatContextWindowTokensLabel(tokens: nu...|
|`formatContextOccupancyPercentLabel`|fn||348-351|export function formatContextOccupancyPercentLabel(percen...|
|`computeContextOccupancyFacts`|fn||361-377|export function computeContextOccupancyFacts(|
|`formatEnabledContextFileSegments`|fn||387-400|export function formatEnabledContextFileSegments(|
|`enforceContextOccupancyLimit`|fn||412-427|export function enforceContextOccupancyLimit(|


---

# debug-runtime.ts | TypeScript | 1334L | 67 symbols | 5 imports | 79 comments
> Path: `src/core/debug-runtime.ts`
- @brief Declares debug inventories, normalizers, and JSON log persistence helpers.
- @details Centralizes debug-menu selector inventories, config-field normalization, the process-scoped runtime debug-enable state, workflow-status gating, append-only JSON log writing for tool, prompt, and dedicated workflow debug events, process-scoped capture of the exact `before_provider_request` provider payload for active prompt runs, and error-stage provider payload dumps gated by `after_provider_response` error statuses. Runtime is dominated by JSON serialization plus filesystem I/O during log writes. Side effects include directory creation and file overwrite when debug entries are appended.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import type { UseReqConfig } from "./config.js";
import {
import {
```

## Definitions

### iface `interface ProcessScopedDebugEnabledStore` (L32-34)
- @brief Describes the process-scoped runtime debug-enable state persisted across session rebinds.
- @details Stores the user-toggled runtime `Debug` flag on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists across those operations; the flag therefore survives ctrl+N session forks and `req-reset` but resets to `disable` when a fresh pi CLI process starts. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-236, REQ-426

### fn `function getProcessScopedDebugEnabledStore(): ProcessScopedDebugEnabledStore` (L41-47)
- @brief Returns the process-scoped runtime debug-enable store.
- @details Lazily initializes one `globalThis` record so session rebinds reuse the toggled runtime debug mode instead of resetting it to the persisted default. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedDebugEnabledStore} Mutable process-scoped runtime debug store.

### fn `export function getRuntimeDebugEnabled(): "enable" | "disable"` (L55-57)
- @brief Resolves the runtime debug-enable mode for the current pi host process.
- @details Returns the process-scoped toggled value when present and the documented `disable` default otherwise, so every fresh pi CLI process starts with debug logging disabled regardless of any stale persisted payload. Runtime is O(1). No external state is mutated.
- @return {"enable" | "disable"} Effective runtime debug-enable mode.
- @satisfies REQ-236

### fn `export function setRuntimeDebugEnabled(runtimeDebugEnabled: "enable" | "disable"): void` (L66-68)
- @brief Stores one user-toggled runtime debug-enable mode for the current pi host process.
- @details Mutates only the process-scoped runtime store so `Debug` menu toggles survive session rebinds without reaching persisted local or global configuration files. Runtime is O(1). Side effect: mutates process-scoped runtime state.
- @param[in] runtimeDebugEnabled {"enable" | "disable"} Next runtime debug-enable mode.
- @return {void} No return value.
- @satisfies REQ-236, REQ-426

- type `export type DebugToolName =` (L123)
- @brief Represents one valid debug-enabled tool selector.
- @details Combines extension-owned tool names and supported embedded builtin tool names into one compile-time selector domain. The alias introduces no runtime cost.
- type `export type DebugPromptName = `req-${PromptCommandName}`;` (L131)
- @brief Represents one valid debug-enabled prompt selector.
- @details Restricts prompt debug toggles to invokable bundled `req-*` slash-command names derived from `PROMPT_COMMAND_NAMES`. The alias introduces no runtime cost.
- type `export type DebugWorkflowState =` (L151)
- @brief Represents one workflow-state value used by debug gating and payloads.
- @details Extends the documented prompt workflow states with `unknown` for callers that cannot recover a concrete state. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugStatusChanges = "enable" | "disable";` (L159)
- @brief Represents one persisted workflow-transition logging flag.
- @details Restricts `workflow_state` emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugWorkflowEvents = "enable" | "disable";` (L165)
- @brief Represents one persisted dedicated workflow-event logging flag.
- @details Restricts session-activation, restoration, closure, and shutdown workflow-event emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugToolCommandsEnabled = "enable" | "disable";` (L171)
- @brief Represents one persisted debug-tool command-wrapper flag.
- @details Restricts debug slash-command wrapper registration to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugPromptsEnabled = "enable" | "disable";` (L177)
- @brief Represents one persisted debug-prompt content logging flag.
- @details Restricts prompt-content debug file emission to the documented `enable|disable` domain. The alias is compile-time only and introduces no runtime cost.
- type `export type DebugLogOnStatus = "any" | (typeof DEBUG_WORKFLOW_STATES)[number];` (L183)
- @brief Represents one persisted workflow-status filter value.
- @details Restricts debug log filtering to `any` or one explicit documented workflow state. The alias is compile-time only and introduces no runtime cost.
### iface `export interface DebugLogEntry` (L189-198)
- @brief Describes one append-only JSON debug log entry.
- @details Stores a timestamped tool or prompt event with workflow-state context plus optional input, result, and error metadata. The interface is compile-time only and introduces no runtime cost.

### fn `export function normalizeDebugEnabled(value: unknown): "enable" | "disable"` (L231-233)
- @brief Normalizes one persisted debug enable flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_ENABLED` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-enable payload.
- @return {"enable" | "disable"} Canonical debug-enable value.
- @satisfies REQ-236

### fn `export function normalizeDebugLogFile(value: unknown): string` (L242-248)
- @brief Normalizes one persisted debug log file value.
- @details Accepts only non-empty strings, trims surrounding whitespace, and falls back to `DEFAULT_DEBUG_LOG_FILE` when the candidate is absent or blank. Runtime is O(n) in path length. No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-log file payload.
- @return {string} Canonical debug-log file value.
- @satisfies REQ-237

### fn `export function normalizeDebugStatusChanges(value: unknown): DebugStatusChanges` (L257-259)
- @brief Normalizes one persisted workflow-transition logging flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_STATUS_CHANGES` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted workflow-transition logging payload.
- @return {DebugStatusChanges} Canonical workflow-transition logging flag.
- @satisfies REQ-254

### fn `export function normalizeDebugWorkflowEvents(value: unknown): DebugWorkflowEvents` (L268-270)
- @brief Normalizes one persisted dedicated workflow-event logging flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_WORKFLOW_EVENTS` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted workflow-event logging payload.
- @return {DebugWorkflowEvents} Canonical workflow-event logging flag.
- @satisfies REQ-277

### fn `export function normalizeDebugToolCommandsEnabled(value: unknown): DebugToolCommandsEnabled` (L279-281)
- @brief Normalizes one persisted debug-tool command-wrapper flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_TOOL_COMMANDS_ENABLED` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-tool command-wrapper payload.
- @return {DebugToolCommandsEnabled} Canonical debug-tool command-wrapper flag.
- @satisfies CTN-019, REQ-322

### fn `export function normalizeDebugPromptsEnabled(value: unknown): DebugPromptsEnabled` (L290-292)
- @brief Normalizes one persisted debug-prompt content logging flag.
- @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_DEBUG_PROMPTS_ENABLED` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted prompt-debug enable payload.
- @return {DebugPromptsEnabled} Canonical prompt-debug enable value.
- @satisfies REQ-413

### fn `export function normalizeDebugPromptsLogPath(value: unknown): string` (L301-307)
- @brief Normalizes one persisted debug prompt log path value.
- @details Accepts only non-empty strings, trims surrounding whitespace, strips every trailing separator so persisted paths stay trailing-slash-free per CTN-014, and falls back to `DEFAULT_DEBUG_PROMPTS_LOG_PATH` when the candidate is absent or blank. Runtime is O(n) in path length. No external state is mutated.
- @param[in] value {unknown} Candidate persisted prompt-log path payload.
- @return {string} Canonical trailing-slash-free prompt-log path value.
- @satisfies CTN-014, REQ-414

### fn `export function normalizeDebugLogOnStatus(value: unknown): DebugLogOnStatus` (L316-323)
- @brief Normalizes one persisted debug workflow-status filter.
- @details Accepts only the documented `any` token or one explicit workflow state and falls back to `DEFAULT_DEBUG_LOG_ON_STATUS` for all other payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug workflow-status filter.
- @return {DebugLogOnStatus} Canonical debug workflow-status filter.
- @satisfies REQ-238

### fn `export function normalizeDebugEnabledTools(value: unknown): DebugToolName[]` (L332-340)
- @brief Normalizes one persisted debug-tool selector array.
- @details Filters to string entries, discards unknown tool names, deduplicates while preserving first-seen order, and returns an empty array for non-array payloads. Runtime is O(n). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-tool selector payload.
- @return {DebugToolName[]} Deduplicated canonical debug-tool selectors.
- @satisfies REQ-239, REQ-242

### fn `export function normalizeDebugEnabledPrompts(value: unknown): DebugPromptName[]` (L349-357)
- @brief Normalizes one persisted debug-prompt selector array.
- @details Filters to string entries, discards unknown `req-*` names, deduplicates while preserving first-seen order, and returns an empty array for non-array payloads. Runtime is O(n). No external state is mutated.
- @param[in] value {unknown} Candidate persisted debug-prompt selector payload.
- @return {DebugPromptName[]} Deduplicated canonical debug-prompt selectors.
- @satisfies REQ-239, REQ-243

### fn `export function getDebugPromptName(promptName: PromptCommandName): DebugPromptName` (L365-367)
- @brief Resolves the canonical debug prompt selector for one bundled prompt.
- @details Reuses the shared prompt-command formatter so prompt-runtime and extension hook logging can target the same `DEBUG_ENABLED_PROMPTS` domain as the configuration menu. Runtime is O(n) in prompt-name length. No external state is mutated.
- @param[in] promptName {PromptCommandName} Canonical bundled prompt name.
- @return {DebugPromptName} Canonical debug prompt selector.

### fn `export function matchesDebugWorkflowState(` (L377-382)
- @brief Tests whether one debug workflow-state filter matches the current state.
- @details Treats `any` as an unconditional pass-through and otherwise requires `workflowState` to equal the configured explicit workflow state. Runtime is O(1). No external state is mutated.
- @param[in] logOnStatus {DebugLogOnStatus} Persisted debug workflow-state filter.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @return {boolean} `true` when the entry should be emitted for the supplied state.
- @satisfies REQ-247

### fn `export function resolveDebugLogPath(projectBase: string, config: UseReqConfig): string` (L392-397)
- @brief Resolves the absolute debug log file path for one project base.
- @details Preserves absolute configured paths and otherwise resolves relative values against the original project base so prompt-worktree cleanup cannot discard accumulated debug evidence. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Absolute debug log path.
- @satisfies REQ-237

### fn `export function resolveDebugPromptsLogPath(projectBase: string, config: UseReqConfig): string` (L407-412)
- @brief Resolves the absolute debug prompt log directory for one project base.
- @details Preserves absolute configured paths and otherwise resolves relative values against the original project base so prompt-worktree cleanup cannot discard accumulated prompt debug evidence. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Absolute debug prompt log directory path.
- @satisfies REQ-414

### fn `export function shouldLogDebugTool(` (L423-431)
- @brief Tests whether one tool execution should be appended to the debug log.
- @details Requires global debug enablement, membership in `DEBUG_ENABLED_TOOLS`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] toolName {string} Executed tool name.
- @return {boolean} `true` when the tool execution should be logged.
- @satisfies REQ-242, REQ-246, REQ-247

### fn `export function shouldLogDebugPrompt(` (L442-450)
- @brief Tests whether one prompt event should be appended to the debug log.
- @details Requires global debug enablement, membership in `DEBUG_ENABLED_PROMPTS`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @return {boolean} `true` when the prompt event should be logged.
- @satisfies REQ-243, REQ-246, REQ-247

### fn `export function shouldLogDebugPromptWorkflowState(` (L461-468)
- @brief Tests whether one prompt workflow-state transition should be appended to the debug log.
- @details Requires global debug enablement, prompt-selector membership, explicit `DEBUG_STATUS_CHANGES=enable`, and a matching post-transition workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Post-transition workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @return {boolean} `true` when the prompt workflow-state entry should be logged.
- @satisfies REQ-246, REQ-247, REQ-255

### fn `export function shouldLogDebugPromptWorkflowEvent(` (L479-486)
- @brief Tests whether one dedicated prompt workflow event should be appended to the debug log.
- @details Requires global debug enablement, prompt-selector membership, explicit `DEBUG_WORKFLOW_EVENTS=enable`, and a matching workflow-state filter before any filesystem work occurs. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @return {boolean} `true` when the dedicated workflow event should be logged.
- @satisfies REQ-245, REQ-246, REQ-247, REQ-277

### fn `export function shouldLogDebugPromptContent(` (L497-504)
- @brief Tests whether one dispatched prompt content file should be written.
- @details Requires global debug enablement plus explicit prompt-content debug enablement before any filesystem work occurs; prompt-content logging is fully subordinate to the global `Debug` flag and exempt from the `DEBUG_LOG_ON_STATUS` workflow-state filter so enabled runs always save their debug files. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state; retained for signature compatibility and excluded from gating per REQ-416.
- @param[in] promptName {PromptCommandName} Bundled prompt name; retained for signature compatibility.
- @return {boolean} `true` when the prompt content file should be written.
- @satisfies REQ-413, REQ-416

### fn `function normalizeDebugValue(value: unknown): unknown` (L512-540)
- @brief Serializes arbitrary debug payloads into deterministic JSON-compatible values.
- @details Converts `Error` instances into structured records, elides functions, stringifies bigint values, and falls back to a best-effort string when JSON serialization fails. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] value {unknown} Arbitrary debug payload.
- @return {unknown} JSON-compatible debug payload.

### fn `function appendDebugLogEntry(` (L550-575)
- @brief Appends one normalized debug log entry to the configured JSON log file.
- @details Loads the existing JSON array when present, falls back to an empty array for missing or invalid files, appends the normalized entry, and rewrites the full file with a trailing newline. Runtime is dominated by JSON parse plus serialization and filesystem I/O. Side effects include directory creation and file overwrite.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] entry {DebugLogEntry} Candidate debug log entry.
- @return {boolean} `true` when the entry is written successfully; `false` when filesystem writing fails.

### fn `export function logDebugToolExecution(` (L590-612)
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

### fn `export function logDebugPromptEvent(` (L628-651)
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

### fn `export function logDebugPromptWorkflowEvent(` (L667-690)
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

### fn `export function formatPromptDebugTimestamp(date: Date): string` (L699-710)
- @brief Formats one write-time timestamp as the `YYYYMMDDHHMMSSmmm` prompt debug prefix.
- @details Zero-pads calendar fields to their canonical widths, appends three millisecond digits, and joins every segment without separators so generated prompt debug filenames stay lexicographically sortable and collision-resistant within one second. Runtime is O(1). No external state is mutated.
- @param[in] date {Date} Write-time timestamp to encode.
- @return {string} `YYYYMMDDHHMMSSmmm` timestamp prefix.
- @satisfies REQ-417

### fn `const pad = (value: number, length = 2): string => String(value).padStart(length, "0")` (L700-715)

### fn `export function formatPromptDebugFileName(` (L720-725)
- @brief Builds one prompt debug filename for one bundled prompt.
- @details Combines the write-time `YYYYMMDDHHMMSSmmm` timestamp with the invokable `req-*` command name so every saved file can be replayed from the pi CLI and attributed to the originating `/req-*` prompt. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
- @return {string} Prompt debug filename in the `<timestamp>-<req-command>` shape.
- @satisfies REQ-417

### fn `export function formatPromptDebugRequestFileName(` (L735-740)
- @brief Builds one command-invocation summary debug filename for one bundled prompt.
- @details Appends the `-request.md` suffix to the shared `<timestamp>-<req-command>` base so every saved command invocation summary stays attributable to the originating `/req-*` prompt, with the `.md` extension coherent with the persisted markdown summary content per REQ-435. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
- @return {string} Prompt debug filename in the `<timestamp>-<req-command>-request.md` shape.
- @satisfies REQ-417, REQ-427, REQ-435

### fn `export function formatPromptDebugPromptFileName(` (L750-755)
- @brief Builds one dispatched-prompt content debug filename for one bundled prompt.
- @details Appends the `-prompt.md` suffix to the shared `<timestamp>-<req-command>` base so every saved initial LLM prompt stays attributable to the originating `/req-*` prompt, with the `.md` extension coherent with the persisted markdown prompt content per REQ-435. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
- @return {string} Prompt debug filename in the `<timestamp>-<req-command>-prompt.md` shape.
- @satisfies REQ-417, REQ-418, REQ-435

### fn `function writePromptDebugFile(` (L769-788)
- @brief Writes one gated prompt debug file under the configured prompt log directory.
- @details Applies the global-debug plus prompt-debug gating, creates the configured prompt log directory, and writes the supplied text into the requested filename so dispatched-prompt artifacts can be replayed from the pi CLI without pi-usereq installed. Runtime is dominated by one directory creation plus one file write when enabled and O(1) otherwise. Side effects include directory creation and file creation only for enabled matching entries.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state; excluded from gating per REQ-416.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] fileName {string} Target filename under the resolved prompt log directory.
- @param[in] content {string} Exact text to persist.
- @return {boolean} `true` when the file is written; otherwise `false`.
- @satisfies REQ-416

### fn `export function logDebugPromptRequest(` (L801-816)
- @brief Writes one command invocation summary debug file when prompt debug logging is enabled.
- @details Persists the exact summary text displayed on screen into one `<timestamp>-<req-command>-request.md` file so the `/req-*` invocation headers survive beside the dispatched prompt. Runtime is dominated by one directory creation plus one file write when enabled and O(1) otherwise. Side effects include directory creation and file creation only for enabled matching entries.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state; excluded from gating per REQ-416.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] requestText {string} Exact command invocation summary text displayed on screen.
- @return {boolean} `true` when the request file is written; otherwise `false`.
- @satisfies REQ-416, REQ-417, REQ-427, REQ-428, REQ-435

### fn `export function logDebugPromptContent(` (L829-849)
- @brief Writes one dispatched prompt content file when prompt debug logging is enabled.
- @details Persists the exact rendered prompt content delivered through `sendMessage` or `sendUserMessage` into one `<timestamp>-<req-command>-prompt.md` file so the send can be replayed from the pi CLI without pi-usereq installed. Runtime is dominated by one directory creation plus one file write when enabled and O(1) otherwise. Side effects include directory creation and file creation only for enabled matching entries.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] workflowState {DebugWorkflowState} Current workflow state; excluded from gating per REQ-416.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] content {string} Exact rendered prompt content delivered through `sendMessage` or `sendUserMessage`.
- @return {boolean} `true` when the prompt content file is written; otherwise `false`.
- @satisfies REQ-416, REQ-417, REQ-418, REQ-428, REQ-435

### iface `export interface PromptErrorReplayFacts` (L856-865)
- @brief Describes replay facts captured beside one provider request payload for reproduction.
- @details Stores the provider, API, base URL, model identifier, thinking level, context-window, max-output-token, and execution-session-file facts resolved from the live pi runtime model plus prompt execution plan so the error-stage replay sidecar can emit ready-to-use replay command lines without live runtime state. Every field stays optional so degraded runtimes and offline replays never abort the capture. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-430

### iface `interface CapturedPromptErrorPayload` (L872-879)
- @brief Describes one process-scoped captured provider request payload bound to an active prompt run.
- @details Pairs the bundled prompt name, the serialization of the exact `before_provider_request` payload, the original project base, the resolved prompt log directory, the dispatched prompt debug filename of the same run, and the captured replay facts so a later `after_provider_response` or `message_end` error status can dump the failing request verbatim, its provider error text, and one replay sidecar without live controller state, cached configuration, or live provider objects. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-421, REQ-429, REQ-430

### iface `interface FlushedPromptErrorRecord` (L886-891)
- @brief Describes the location of one already flushed provider error payload file set.
- @details Stores the prompt name, failing status, resolved log directory, and shared extensionless error base filename of the most recent error-stage flush so a later finalized `message_end` error message can still append the `-response.txt` file beside the already written payload when the provider fired `after_provider_response` before surfacing its error text. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-429

### iface `interface ProcessScopedPromptErrorCaptureStore` (L897-901)
- @brief Describes the process-scoped provider error payload capture state persisted across extension rebinds.
- @details Stores the latest captured prompt error payload, the latest flushed error record, and the latest dispatched prompt debug filenames on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` between prompt dispatch and provider execution, while the hosting process persists across those operations, so the capture, the late response write, and the dispatched-prompt correlation survive the forked execution-session switch. The interface is compile-time only and introduces no runtime cost.

### fn `function getProcessScopedPromptErrorCaptureStore(): ProcessScopedPromptErrorCaptureStore` (L908-918)
- @brief Returns the process-scoped provider error payload capture store.
- @details Lazily initializes one `globalThis` record so session rebinds never discard an already captured failing provider request, its flushed error record, or its dispatched prompt debug filename correlation. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedPromptErrorCaptureStore} Mutable process-scoped capture store.

### fn `export function formatPromptDebugErrorFileName(` (L929-935)
- @brief Builds the shared extensionless provider error base filename for one bundled prompt.
- @details Combines the write-time `YYYYMMDDHHMMSSmmm` timestamp, the invokable `req-*` command name, and the failing provider response status into the `<timestamp>-<req-command>-error-<status>` base shape so every saved error-stage prompt artifact stays attributable to the originating `/req-*` prompt and its session error code. This extensionless base is the suffix-attachment anchor for the `-response.txt`, `-replay.json`, and `-session.jsonl` variants; the flushed raw provider-request JSON payload appends its content-coherent `.json` extension through `formatPromptDebugErrorPayloadFileName(...)`. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] errorCode {number} Failing provider response status, such as `400`.
- @param[in] date {Date} Write-time timestamp. Defaults to the current wall-clock time.
- @return {string} Extensionless provider error base filename in the `<timestamp>-<req-command>-error-<status>` shape.
- @satisfies REQ-423

### fn `export function formatPromptDebugErrorPayloadFileName(` (L946-952)
- @brief Builds one provider error payload debug filename for one bundled prompt.
- @details Appends the `.json` extension to the shared extensionless `<timestamp>-<req-command>-error-<status>` base so the flushed raw provider-request JSON payload keeps a filename extension coherent with its JSON content per REQ-435 while staying attributable to the exact failing request. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] errorCode {number} Failing provider response status, such as `400`.
- @param[in] date {Date} Write-time timestamp shared with the sibling error artifacts. Defaults to the current wall-clock time.
- @return {string} Provider error payload filename in the `<timestamp>-<req-command>-error-<status>.json` shape.
- @satisfies REQ-423, REQ-431, REQ-435

### fn `export function formatPromptDebugErrorResponseFileName(` (L963-969)
- @brief Builds one provider error response debug filename for one bundled prompt.
- @details Appends the `-response.txt` suffix to the shared extensionless `<timestamp>-<req-command>-error-<status>` shape so the persisted plain-text provider error message keeps a filename extension coherent with its text content per REQ-435 and stays attributable to the exact failing request payload file written with the identical write-time timestamp. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] errorCode {number} Failing provider response status, such as `400`.
- @param[in] date {Date} Write-time timestamp shared with the payload file. Defaults to the current wall-clock time.
- @return {string} Provider error response filename in the `<timestamp>-<req-command>-error-<status>-response.txt` shape.
- @satisfies REQ-423, REQ-429, REQ-435

### fn `export function formatPromptDebugErrorReplayFileName(` (L980-986)
- @brief Builds one provider error replay sidecar debug filename for one bundled prompt.
- @details Appends the `-replay.json` suffix to the shared `<timestamp>-<req-command>-error-<status>` shape so the persisted replay metadata sidecar stays attributable to the exact failing request payload file written with the identical write-time timestamp. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] errorCode {number} Failing provider response status, such as `400`.
- @param[in] date {Date} Write-time timestamp shared with the payload file. Defaults to the current wall-clock time.
- @return {string} Provider error replay sidecar filename in the `<timestamp>-<req-command>-error-<status>-replay.json` shape.
- @satisfies REQ-423, REQ-430

### fn `export function formatPromptDebugErrorSessionFileName(` (L997-1003)
- @brief Builds one provider error session-snapshot debug filename for one bundled prompt.
- @details Appends the `-session.jsonl` suffix to the shared `<timestamp>-<req-command>-error-<status>` shape so the byte-for-byte execution-session copy stays attributable to the exact failing request payload file written with the identical write-time timestamp and remains directly consumable by `pi --fork` without files outside the prompt log directory. Runtime is O(1). No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt name.
- @param[in] errorCode {number} Failing provider response status, such as `400`.
- @param[in] date {Date} Write-time timestamp shared with the payload file. Defaults to the current wall-clock time.
- @return {string} Provider error session-snapshot filename in the `<timestamp>-<req-command>-error-<status>-session.jsonl` shape.
- @satisfies REQ-423, REQ-432

### fn `export function resolveProviderErrorFlushStatusFromMessage(message: unknown): number | undefined` (L1012-1032)
- @brief Resolves the failing HTTP status carried by one finalized agent message.
- @details Extracts the leading provider error status from one `message_end` assistant message whose `stopReason` equals `error`, accepting the pi `formatProviderError` display shapes (`"<status>: <body>"` and `"<prefix> (<status>): <body>"`) plus the raw SDK `error.message` shape (`"<status> <body>"`) surfaced unchanged by the agent run-failure path, so provider APIs whose SDK clients throw before emitting `after_provider_response` for non-2xx statuses (the OpenAI-compatible family, including `zai`) still flush the captured provider request payload through the message lifecycle channel. Runtime is O(n) in the inspected error-message prefix length. No external state is mutated.
- @param[in] message {unknown} Finalized agent message forwarded by one `message_end` lifecycle event.
- @return {number | undefined} Failing HTTP status greater than or equal to `400`, or `undefined` when the message carries no provider error status.
- @satisfies REQ-422, REQ-423, REQ-425

### fn `function serializePromptProviderPayload(payload: unknown): string` (L1040-1058)
- @brief Serializes one provider request payload into deterministic text.
- @details Pretty-prints the payload as JSON while degrading circular references into one `[Circular]` token and bigint values into decimal strings so serialization failures never discard the capture. Runtime is O(n) in serialized payload size. No external state is mutated.
- @param[in] payload {unknown} Exact `before_provider_request` provider request payload.
- @return {string} Serialized payload text; the empty string when the payload serializes to nothing.

### fn `function resolveProviderPayloadModelId(payload: unknown): string | undefined` (L1066-1072)
- @brief Resolves the model identifier embedded in one provider request payload.
- @details Reads the string `model` field of the serialized request payload so the replay sidecar can still name the failing model when the live runtime model object was unavailable at capture time. Runtime is O(1). No external state is mutated.
- @param[in] payload {unknown} Exact `before_provider_request` provider request payload.
- @return {string | undefined} Payload model identifier when present as a string; otherwise `undefined`.

### fn `export function capturePromptProviderRequestForDebug(` (L1085-1099)
- @brief Captures one exact provider request payload for the active prompt run when prompt debug logging is enabled.
- @details Applies the global-debug plus prompt-debug gating, serializes the exact `before_provider_request` payload through the cycle-safe serializer, resolves the dispatched prompt debug filename of the same run from the process-scoped correlation map, and stores the prompt name, payload text, original project base, resolved prompt log directory, replay facts, and prompt debug filename in the process-scoped capture store so the payload, its error text, and its replay sidecar survive session replacement and later error-stage writes require no live workflow state or cached configuration. Falls back to the payload `model` field when the supplied replay facts omit the model identifier. Runtime is O(n) in serialized payload size when enabled and O(1) otherwise. Side effect: mutates the process-scoped capture store for enabled matching requests.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] promptName {PromptCommandName} Active bundled prompt name.
- @param[in] projectBase {string} Absolute original project base path used to resolve the prompt log directory.
- @param[in] payload {unknown} Exact `before_provider_request` provider request payload.
- @param[in] replayFacts {PromptErrorReplayFacts} Live runtime replay facts consumed by the error-stage sidecar. Defaults to empty facts.
- @return {void} No return value.
- @satisfies REQ-416, REQ-421, REQ-430

### fn `function normalizeProviderEnvToken(provider: string): string` (L1125-1128)
- @brief Normalizes one provider name into an uppercase environment-variable token.
- @details Uppercases the provider name and replaces every non-alphanumeric character with `_` so the generated replay command can reference a deterministic `<PROVIDER>_API_KEY` environment variable. Runtime is O(n) in provider-name length. No external state is mutated.
- @param[in] provider {string} Provider identifier, such as `openrouter`.
- @return {string} Uppercase alphanumeric environment-variable token.

### fn `function resolveProviderReplayEndpoint(facts: PromptErrorReplayFacts): string | undefined` (L1136-1147)
- @brief Resolves the provider HTTP endpoint targeted by one captured provider request payload.
- @details Appends the canonical chat-completions path for `openai-completions` APIs and the canonical messages path for `anthropic-messages` APIs, and preserves the raw base URL for every other API so the generated provider replay command never fabricates an endpoint it cannot derive. Runtime is O(p) in URL length. No external state is mutated.
- @param[in] facts {PromptErrorReplayFacts} Captured replay facts supplying the API and base URL.
- @return {string | undefined} Replay endpoint URL when a base URL exists; otherwise `undefined`.

### fn `function buildPromptErrorReplaySidecarText(` (L1158-1196)
- @brief Builds the replay sidecar JSON text for one flushed provider error payload.
- @details Serializes the captured provider, base URL, API, model identifier, thinking level, context-window and max-output-token facts, the execution-session file, the dispatched prompt debug file, the flushed request payload file, and ready-to-use replay command lines: one `curl --data @` provider replay of the exact failing request, one pi one-shot replay of the dispatched prompt file, and one `pi --fork` replay that targets the log-local `-session.jsonl` snapshot when supplied and falls back to the retained execution session otherwise. Command lines are emitted only when their supporting facts exist so every emitted command is directly executable. Runtime is O(n) in serialized sidecar size. No external state is mutated.
- @param[in] captured {CapturedPromptErrorPayload} Consumed capture supplying replay facts and artifact paths.
- @param[in] requestFileName {string} Payload filename written with the same write-time timestamp.
- @param[in] sessionSnapshotFileName {string | undefined} Log-local `-session.jsonl` snapshot filename written with the same write-time timestamp; `undefined` falls back to the retained execution-session path.
- @return {string} Newline-terminated replay sidecar JSON text.
- @satisfies REQ-430, REQ-433

### fn `export function flushCapturedPromptErrorPayload(errorCode: number, errorResponseText?: string): boolean` (L1206-1248)
- @brief Writes the captured provider request payload plus its response text and replay sidecar as error-stage prompt debug files.
- @details Consumes the process-scoped capture, discards it after every write attempt so stale payloads never reach later runs, rejects failing statuses below 400, and writes the exact captured payload into one `<timestamp>-<req-command>-error-<status>.json` file that stays raw provider-request JSON usable with `curl --data @`, the provider error text into one identically timestamped `-response.txt` file when supplied, one identically timestamped byte-for-byte `-session.jsonl` copy of the retained execution session so `pi --fork` can resume the exact failing state from the prompt log directory alone, and the replay sidecar into one identically timestamped `-replay.json` file inside the captured log directory beside the initial dispatched prompt artifacts. Records the flushed location so a later finalized `message_end` error message can still append the `-response.txt` file when `after_provider_response` fired first without error text. All write inputs come from the capture itself, so the flush requires no live workflow state, cached configuration, or active controller prompt request. Runtime is dominated by one directory creation plus at most four file writes when a capture exists and O(1) otherwise. Side effects include directory creation and file creation only when a capture exists and the status is an error status.
- @param[in] errorCode {number} Failing provider response status, such as `400`.
- @param[in] errorResponseText {string | undefined} Finalized provider error message text when already available; the `-response` file is written later when omitted.
- @return {boolean} `true` when the provider error payload file set is written; otherwise `false`.
- @satisfies REQ-422, REQ-423, REQ-424, REQ-425, REQ-429, REQ-430, REQ-431, REQ-432, REQ-433, REQ-435

### fn `function writePromptProviderErrorResponseFile(` (L1259-1266)
- @brief Writes one provider error response text file under a resolved log directory.
- @details Creates the parent directory and writes the finalized provider error text with one trailing newline into the requested response filename so both the flush-time and the late `message_end` response writes share one deterministic serialization. Runtime is dominated by one directory creation plus one file write. Side effects include directory creation and file creation.
- @param[in] logDirectory {string} Absolute prompt log directory owning the response file.
- @param[in] fileName {string} Target response filename under the log directory.
- @param[in] errorResponseText {string} Finalized provider error message text.
- @return {void} No return value.
- @satisfies REQ-429

### fn `function copyPromptErrorSessionSnapshotFile(` (L1276-1291)
- @brief Copies the retained execution-session file beside one flushed provider error payload.
- @details Duplicates the captured execution-session file byte-for-byte into the captured log directory under the requested `-session.jsonl` filename synchronously during the error-stage flush, so the snapshot freezes the transcript exactly at the state that produced the failing provider request before pi's `context_edit` or compaction appends further entries and stays directly consumable by `pi --fork` without any file outside the prompt log directory. Degrades to `undefined` on any copy failure so the replay sidecar falls back to the retained execution-session path. Runtime is dominated by one directory creation plus one file copy. Side effects include directory creation and file creation.
- @param[in] captured {CapturedPromptErrorPayload} Consumed capture supplying the log directory and execution-session replay facts.
- @param[in] snapshotFileName {string} Session-snapshot filename sharing the payload write-time timestamp.
- @return {string | undefined} Written snapshot filename when the copy succeeds; otherwise `undefined`.
- @satisfies REQ-432

### fn `export function writeFlushedPromptProviderErrorResponse(` (L1301-1322)
- @brief Appends the provider error response text beside one already flushed error payload file.
- @details Providers that fire `after_provider_response` before surfacing their error text flush the payload without a `-response.txt` file, so this helper writes the finalized `message_end` error message beside the recorded flush location when the failing status matches. Runtime is dominated by one directory creation plus one file write when a matching record exists and O(1) otherwise. Side effects include directory creation and file creation only for a matching record.
- @param[in] errorCode {number} Failing provider response status carried by the finalized error message.
- @param[in] errorResponseText {string} Finalized provider error message text.
- @return {boolean} `true` when the response file is written; otherwise `false`.
- @satisfies REQ-429

### fn `export function discardCapturedPromptErrorPayload(): void` (L1330-1334)
- @brief Discards any captured provider request payload and flushed error record for the ended prompt run.
- @details Clears the process-scoped capture and the latest flushed error record unconditionally so leftover payloads and flush locations from a finished `req-*` prompt run never flush into later provider errors raised outside extension-owned prompt orchestration. Runtime is O(1). Side effect: mutates the process-scoped capture store.
- @return {void} No return value.
- @satisfies REQ-421, REQ-425, REQ-429

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ProcessScopedDebugEnabledStore`|iface||32-34|interface ProcessScopedDebugEnabledStore|
|`getProcessScopedDebugEnabledStore`|fn||41-47|function getProcessScopedDebugEnabledStore(): ProcessScop...|
|`getRuntimeDebugEnabled`|fn||55-57|export function getRuntimeDebugEnabled(): "enable" | "dis...|
|`setRuntimeDebugEnabled`|fn||66-68|export function setRuntimeDebugEnabled(runtimeDebugEnable...|
|`DebugToolName`|type||123||
|`DebugPromptName`|type||131||
|`DebugWorkflowState`|type||151||
|`DebugStatusChanges`|type||159||
|`DebugWorkflowEvents`|type||165||
|`DebugToolCommandsEnabled`|type||171||
|`DebugPromptsEnabled`|type||177||
|`DebugLogOnStatus`|type||183||
|`DebugLogEntry`|iface||189-198|export interface DebugLogEntry|
|`normalizeDebugEnabled`|fn||231-233|export function normalizeDebugEnabled(value: unknown): "e...|
|`normalizeDebugLogFile`|fn||242-248|export function normalizeDebugLogFile(value: unknown): st...|
|`normalizeDebugStatusChanges`|fn||257-259|export function normalizeDebugStatusChanges(value: unknow...|
|`normalizeDebugWorkflowEvents`|fn||268-270|export function normalizeDebugWorkflowEvents(value: unkno...|
|`normalizeDebugToolCommandsEnabled`|fn||279-281|export function normalizeDebugToolCommandsEnabled(value: ...|
|`normalizeDebugPromptsEnabled`|fn||290-292|export function normalizeDebugPromptsEnabled(value: unkno...|
|`normalizeDebugPromptsLogPath`|fn||301-307|export function normalizeDebugPromptsLogPath(value: unkno...|
|`normalizeDebugLogOnStatus`|fn||316-323|export function normalizeDebugLogOnStatus(value: unknown)...|
|`normalizeDebugEnabledTools`|fn||332-340|export function normalizeDebugEnabledTools(value: unknown...|
|`normalizeDebugEnabledPrompts`|fn||349-357|export function normalizeDebugEnabledPrompts(value: unkno...|
|`getDebugPromptName`|fn||365-367|export function getDebugPromptName(promptName: PromptComm...|
|`matchesDebugWorkflowState`|fn||377-382|export function matchesDebugWorkflowState(|
|`resolveDebugLogPath`|fn||392-397|export function resolveDebugLogPath(projectBase: string, ...|
|`resolveDebugPromptsLogPath`|fn||407-412|export function resolveDebugPromptsLogPath(projectBase: s...|
|`shouldLogDebugTool`|fn||423-431|export function shouldLogDebugTool(|
|`shouldLogDebugPrompt`|fn||442-450|export function shouldLogDebugPrompt(|
|`shouldLogDebugPromptWorkflowState`|fn||461-468|export function shouldLogDebugPromptWorkflowState(|
|`shouldLogDebugPromptWorkflowEvent`|fn||479-486|export function shouldLogDebugPromptWorkflowEvent(|
|`shouldLogDebugPromptContent`|fn||497-504|export function shouldLogDebugPromptContent(|
|`normalizeDebugValue`|fn||512-540|function normalizeDebugValue(value: unknown): unknown|
|`appendDebugLogEntry`|fn||550-575|function appendDebugLogEntry(|
|`logDebugToolExecution`|fn||590-612|export function logDebugToolExecution(|
|`logDebugPromptEvent`|fn||628-651|export function logDebugPromptEvent(|
|`logDebugPromptWorkflowEvent`|fn||667-690|export function logDebugPromptWorkflowEvent(|
|`formatPromptDebugTimestamp`|fn||699-710|export function formatPromptDebugTimestamp(date: Date): s...|
|`pad`|fn||700-715|const pad = (value: number, length = 2): string => String...|
|`formatPromptDebugFileName`|fn||720-725|export function formatPromptDebugFileName(|
|`formatPromptDebugRequestFileName`|fn||735-740|export function formatPromptDebugRequestFileName(|
|`formatPromptDebugPromptFileName`|fn||750-755|export function formatPromptDebugPromptFileName(|
|`writePromptDebugFile`|fn||769-788|function writePromptDebugFile(|
|`logDebugPromptRequest`|fn||801-816|export function logDebugPromptRequest(|
|`logDebugPromptContent`|fn||829-849|export function logDebugPromptContent(|
|`PromptErrorReplayFacts`|iface||856-865|export interface PromptErrorReplayFacts|
|`CapturedPromptErrorPayload`|iface||872-879|interface CapturedPromptErrorPayload|
|`FlushedPromptErrorRecord`|iface||886-891|interface FlushedPromptErrorRecord|
|`ProcessScopedPromptErrorCaptureStore`|iface||897-901|interface ProcessScopedPromptErrorCaptureStore|
|`getProcessScopedPromptErrorCaptureStore`|fn||908-918|function getProcessScopedPromptErrorCaptureStore(): Proce...|
|`formatPromptDebugErrorFileName`|fn||929-935|export function formatPromptDebugErrorFileName(|
|`formatPromptDebugErrorPayloadFileName`|fn||946-952|export function formatPromptDebugErrorPayloadFileName(|
|`formatPromptDebugErrorResponseFileName`|fn||963-969|export function formatPromptDebugErrorResponseFileName(|
|`formatPromptDebugErrorReplayFileName`|fn||980-986|export function formatPromptDebugErrorReplayFileName(|
|`formatPromptDebugErrorSessionFileName`|fn||997-1003|export function formatPromptDebugErrorSessionFileName(|
|`resolveProviderErrorFlushStatusFromMessage`|fn||1012-1032|export function resolveProviderErrorFlushStatusFromMessag...|
|`serializePromptProviderPayload`|fn||1040-1058|function serializePromptProviderPayload(payload: unknown)...|
|`resolveProviderPayloadModelId`|fn||1066-1072|function resolveProviderPayloadModelId(payload: unknown):...|
|`capturePromptProviderRequestForDebug`|fn||1085-1099|export function capturePromptProviderRequestForDebug(|
|`normalizeProviderEnvToken`|fn||1125-1128|function normalizeProviderEnvToken(provider: string): string|
|`resolveProviderReplayEndpoint`|fn||1136-1147|function resolveProviderReplayEndpoint(facts: PromptError...|
|`buildPromptErrorReplaySidecarText`|fn||1158-1196|function buildPromptErrorReplaySidecarText(|
|`flushCapturedPromptErrorPayload`|fn||1206-1248|export function flushCapturedPromptErrorPayload(errorCode...|
|`writePromptProviderErrorResponseFile`|fn||1259-1266|function writePromptProviderErrorResponseFile(|
|`copyPromptErrorSessionSnapshotFile`|fn||1276-1291|function copyPromptErrorSessionSnapshotFile(|
|`writeFlushedPromptProviderErrorResponse`|fn||1301-1322|export function writeFlushedPromptProviderErrorResponse(|
|`discardCapturedPromptErrorPayload`|fn||1330-1334|export function discardCapturedPromptErrorPayload(): void|


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

# extension-instance-guard.ts | TypeScript | 108L | 8 symbols | 2 imports | 12 comments
> Path: `src/core/extension-instance-guard.ts`
- @brief Guards one pi host process against duplicate pi-usereq extension activation.
- @details Keeps the activated pi-usereq installation path in a process-scoped registry so a duplicated installation (for example the same package present under `<agent-dir>/npm/node_modules/pi-usereq` and under `<agent-dir>/git/<host>/<owner>/<repository>`) cannot register the documented commands, agent tools, shortcuts, and lifecycle hooks twice. pi keeps every loaded extension active and reports duplicated tool names as extension load errors, so without this guard a duplicated installation makes pi CLI print one conflict diagnostic per registered tool while the effective registered inventory is unchanged because pi resolves precedence by load order. The registry lives on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, while the hosting process persists across those operations; repeated activation of the same installation path is therefore always allowed so session-rebind registration stays intact. Runtime is O(1). Side effects are limited to process-scoped state mutation.

## Imports
```
import path from "node:path";
import { getInstallationPath } from "./path-context.js";
```

## Definitions

### iface `export interface PiUsereqExtensionActivationClaim` (L14-19)
- @brief Describes one extension activation claim attempt.
- @details Reports whether the calling installation owns the activation plus the installation path that currently owns it, so the caller can skip duplicate registration deterministically. The interface is compile-time only and introduces no runtime cost.

### iface `interface ProcessScopedExtensionInstanceStore` (L25-28)
- @brief Stores the process-scoped activated-installation fact.
- @details Holds at most one installation path because pi loads every discovered extension in the same host process and only one pi-usereq copy may own registration. The interface is compile-time only and introduces no runtime cost.

- type `type GlobalExtensionInstanceStore = typeof globalThis & {` (L34)
- @brief Describes the `globalThis` extension carrying the process-scoped activation store.
- @details Narrows the global object to the single private property consumed by this module so session rebinds reuse the same store without leaking a documented public surface. The alias is compile-time only and introduces no runtime cost.
### fn `function getProcessScopedExtensionInstanceStore(): ProcessScopedExtensionInstanceStore` (L43-47)
- @brief Returns the process-scoped extension activation store.
- @details Lazily initializes one `globalThis` record so extension rebinds for `/new`, `/resume`, `/fork`, and `/reload` reuse the already recorded installation path instead of forgetting it. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedExtensionInstanceStore} Mutable process-scoped activation store.

### fn `function normalizeInstallationPath(installationPath: string): string` (L56-59)
- @brief Normalizes one installation path for activation ownership comparison.
- @details Resolves the candidate to an absolute path and lowercases it on Windows so path-case differences between managed install roots never look like a duplicate installation. Runtime is O(p) in path length. Pure; no side effects.
- @param[in] installationPath {string} Absolute or relative installation package root.
- @return {string} Normalized installation path used for ownership comparison.
- @note Complexity: O(p) in path length. Pure; no side effects.

### fn `export function claimPiUsereqExtensionActivation(` (L69-82)
- @brief Claims the extension activation for one installation path.
- @details Claims ownership when no installation claimed the activation yet, and re-confirms ownership when the requesting path is the recorded one so session-rebind activation keeps registering. A different installation path receives `claimed: false` plus the owning path so the caller skips duplicate registration instead of emitting pi tool-conflict diagnostics. Runtime is O(p) in path length. Side effect: records the claiming installation path in process-scoped state.
- @param[in] installationPath {string} Installation package root requesting activation. Defaults to the runtime installation path.
- @return {PiUsereqExtensionActivationClaim} Claim outcome plus the owning installation path.
- @note Complexity: O(p) in path length.
- @satisfies REQ-004, REQ-009, REQ-044, DES-002

### fn `export function releasePiUsereqExtensionActivation(` (L92-99)
- @brief Releases the extension activation claim owned by one installation path.
- @details Clears the recorded owner only when the requesting installation owns it, so a failed partial activation can hand the activation to another installed copy while a non-owning installation can never clear foreign ownership. Runtime is O(p) in path length. Side effect: mutates process-scoped state.
- @param[in] installationPath {string} Installation package root releasing activation. Defaults to the runtime installation path.
- @return {void} No return value.
- @note Complexity: O(p) in path length.
- @satisfies REQ-009, DES-002

### fn `export function resetPiUsereqExtensionActivationForTests(): void` (L106-108)
- @brief Clears the process-scoped extension activation store for deterministic tests.
- @details Removes the whole `globalThis` record so one test can simulate independent pi host processes without leaking ownership into later cases. Runtime is O(1). Side effect: mutates process-scoped state.
- @return {void} No return value.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqExtensionActivationClaim`|iface||14-19|export interface PiUsereqExtensionActivationClaim|
|`ProcessScopedExtensionInstanceStore`|iface||25-28|interface ProcessScopedExtensionInstanceStore|
|`GlobalExtensionInstanceStore`|type||34||
|`getProcessScopedExtensionInstanceStore`|fn||43-47|function getProcessScopedExtensionInstanceStore(): Proces...|
|`normalizeInstallationPath`|fn||56-59|function normalizeInstallationPath(installationPath: stri...|
|`claimPiUsereqExtensionActivation`|fn||69-82|export function claimPiUsereqExtensionActivation(|
|`releasePiUsereqExtensionActivation`|fn||92-99|export function releasePiUsereqExtensionActivation(|
|`resetPiUsereqExtensionActivationForTests`|fn||106-108|export function resetPiUsereqExtensionActivationForTests(...|


---

# extension-status.ts | TypeScript | 1095L | 53 symbols | 7 imports | 81 comments
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
import type { PiNotifyOutcome, PiNotifySoundLevel } from "./pi-notify.js";
import type { PromptCommandExecutionPlan, PromptCommandStatusMarker } from "./prompt-command-runtime.js";
import {
import { getInstallationPackageMetadata } from "./path-context.js";
import { resolveRuntimeGitBranchName } from "./runtime-project-paths.js";
```

## Definitions

- type `type StatusForegroundColor = Extract<` (L33)
- @brief Enumerates the CLI-supported theme tokens consumed by status rendering.
- @details Restricts the status formatter to documented pi theme tokens so the
status bar remains compatible with the active CLI theme schema. Compile-time
only and introduces no runtime cost.
### iface `interface RawStatusTheme` (L43-45)
- @brief Describes the raw theme capabilities required for status rendering.
- @details Accepts the `ctx.ui.theme` foreground renderer used by the
single-line footer. Compile-time only and introduces no runtime cost.

### iface `interface StatusThemeAdapter` (L53-58)
- @brief Describes the normalized theme adapter used by status formatters.
- @details Exposes deterministic label, value, foreground, and separator
renderers so status text generation stays independent from the raw theme API.
Compile-time only and introduces no runtime cost.

- type `export type PiUsereqStatusHookName = (typeof PI_USEREQ_STATUS_HOOK_NAMES)[number];` (L103)
- @brief Represents one hook name handled by the pi-usereq status controller.
- @details Narrows hook registration and event-update calls to the canonical
intercepted-hook set. Compile-time only and introduces no runtime cost.
- type `export type PiUsereqPromptRequest = PromptCommandExecutionPlan;` (L109)
- @brief Describes one prompt request tracked across extension command delivery and runtime execution.
- @details Reuses the prepared prompt-command execution plan so status rendering and prompt-end side effects can recover the original project base, active execution base, and optional worktree metadata for the current prompt run. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqWorkflowState = "idle" | "checking" | "running" | "merging" | "done" | "warning" | "error";` (L115)
- @brief Represents one prompt-orchestration workflow state displayed in the status bar.
- @details Narrows workflow tracking to the documented `idle`, `checking`, `running`, `merging`, `done`, `warning`, and `error` states reused by prompt-command gating, prompt-end orchestration, and status rendering. Compile-time only and introduces no runtime cost.
### iface `export interface PiUsereqStatusState` (L121-136)
- @brief Stores the mutable runtime facts displayed by the status bar.
- @details Persists the prompt-orchestration workflow state, the active orchestration request token, the latest context-usage snapshot, the active run start timestamp, the flag marking that the in-flight or most recently ended agent run belongs to the active prompt request, the duration of the most recently ended run recorded even when aborted, the most recent normally completed run duration, the accumulated duration of all normally completed runs, the in-memory runtime sound level, prompt-request metadata carried from command dispatch into the next runtime execution, and the deferred terminal finalization outcome plus inspected status marker recorded at intermediate `agent_end` events and consumed at orchestration termination. Runtime state is mutated in-place by controller helpers. Compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqStatusController` (L145-150)
- @brief Stores the controller state required for event-driven status updates.
- @details Keeps the mutable status snapshot, the current configuration, the
latest extension context used for rendering, and the interval handle used
for live elapsed-time refreshes. Compile-time only and introduces no runtime
cost.

### iface `interface PiUsereqStatusPersistenceStore` (L156-161)
- @brief Stores the process-scoped elapsed-timer snapshot reused across session replacement.
- @details Preserves the latest completed duration, accumulated completed runtime, and the in-flight run record (start timestamp plus prompt-ownership flag) so `/new`, `/resume`, and `/fork` can restore elapsed counters after the extension runtime is rebound, and so a terminal hook on a replacement runtime can recover the ended run's own duration and prompt association when the in-memory run timer was cleared mid-run. Compile-time only and introduces no runtime cost.

### fn `function getPiUsereqStatusPersistenceStore(): PiUsereqStatusPersistenceStore` (L175-186)
- @brief Returns the process-scoped elapsed-timer persistence store.
- @details Lazily initializes one internal `globalThis` record because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, but the hosting process persists across those operations. Runtime is O(1). Side effect: initializes internal process-scoped state on first access.
- @return {PiUsereqStatusPersistenceStore} Mutable persistence record.
- @note Design rationale: required to preserve elapsed counters across session replacement without writing session-global menu state into project configuration.

### fn `function restorePersistedElapsedState(state: PiUsereqStatusState): void` (L194-198)
- @brief Restores persisted elapsed counters into one mutable status snapshot.
- @details Copies the process-scoped last-run and accumulated completed durations into the supplied controller state so rebinding events can continue showing prior counters. Runtime is O(1). Side effect: mutates `state`.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.

### fn `function persistElapsedState(state: PiUsereqStatusState): void` (L206-210)
- @brief Persists elapsed counters from one mutable status snapshot.
- @details Copies the current last-run and accumulated completed durations into the process-scoped store so later extension instances can restore them after session replacement. Runtime is O(1). Side effect: mutates internal process-scoped state.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @return {void} No return value.

### fn `function persistActiveRunState(state: PiUsereqStatusState): void` (L219-223)
- @brief Persists the in-flight run record into the process-scoped elapsed store.
- @details Mirrors the active run start timestamp plus its prompt-ownership flag onto `globalThis` so a terminal hook on a replacement extension instance can recover the exact run identity and time reference after the in-memory timer was cleared mid-run by session replacement or fault-injected state loss. The record is written only at `agent_start` and cleared at the run's terminal hook or an elapsed-state reset, so it is never inherited by a different run. Runtime is O(1). Side effect: mutates process-scoped state.
- @param[in] state {PiUsereqStatusState} Controller state carrying the in-flight run facts.
- @return {void} No return value.
- @satisfies REQ-123, REQ-187

### fn `function readPersistedActiveRunState(): { startMs: number; belongsToPrompt: boolean } | undefined` (L231-236)
- @brief Reads the process-scoped in-flight run record.
- @details Returns the persisted run start timestamp plus prompt-ownership flag only while a run is genuinely in flight, and `undefined` once the run's terminal hook cleared the record, so a late or duplicate terminal event can never borrow another run's timing or association. Runtime is O(1). No external state is mutated.
- @return {{ startMs: number; belongsToPrompt: boolean } | undefined} Persisted in-flight run record when available.
- @satisfies REQ-187

### fn `function clearPersistedActiveRunState(): void` (L244-248)
- @brief Clears the process-scoped in-flight run record.
- @details Removes the persisted run start timestamp and prompt-ownership flag after a terminal hook or an elapsed-state reset so later terminal events without their own `agent_start` can never recover stale timing. Runtime is O(1). Side effect: mutates process-scoped state.
- @return {void} No return value.
- @satisfies REQ-187

### fn `function persistPromptCommandState(state: PiUsereqStatusState): void` (L256-263)
- @brief Mirrors one controller prompt state into the process-scoped persistence store.
- @details Persists the current workflow state, the active orchestration request token, plus the pending and active prompt execution plans so prompt orchestration can survive session replacement. Runtime is O(1). Side effect: mutates process-scoped prompt-command persistence state.
- @param[in] state {PiUsereqStatusState} Current controller state snapshot.
- @return {void} No return value.

### fn `export function shouldPreservePromptCommandStateOnShutdown(state: PiUsereqStatusState): boolean` (L272-275)
- @brief Detects whether `session_shutdown` must preserve prompt-command state.
- @details Keeps both the in-memory controller prompt state and the process-scoped prompt execution plan intact while pi switches from the original session into the forked execution session, because the old extension instance can keep running the initiating command handler after `session_shutdown` fires and before the replacement session fully takes over. Runtime is O(1). No external state is mutated.
- @param[in] state {PiUsereqStatusState} Controller state before shutdown mutation.
- @return {boolean} `true` when prompt-command state must survive the shutdown event.
- @satisfies REQ-278

### fn `function restorePersistedPromptCommandState(` (L284-296)
- @brief Restores prompt-command persistence into one fresh controller when the active session matches.
- @details Rehydrates workflow state, the active request token, and pending or active prompt execution plans only when the current session file targets the persisted execution session created for prompt orchestration. Runtime is O(1). Side effect: mutates `state` when persisted prompt state is available.
- @param[in] sessionFile {string | undefined} Current active session file.
- @param[in,out] state {PiUsereqStatusState} Mutable controller state.
- @return {void} No return value.

### fn `function getContextSessionFile(ctx: ExtensionContext): string | undefined` (L304-308)
- @brief Resolves the active session file exposed by one extension context.
- @details Reads the session-manager session-file getter when available so prompt-command persistence can be resynchronized on every lifecycle hook after session replacement. Runtime is O(1). No external state is mutated.
- @param[in] ctx {ExtensionContext} Active extension context.
- @return {string | undefined} Current session file when available.

### fn `export function isStaleExtensionContextError(error: unknown): boolean` (L317-320)
- @brief Detects stale extension-context access after session replacement.
- @details Matches the guarded pi runtime error emitted when one invalidated extension context, command context, or replacement-session context is accessed after session replacement or reload. Runtime is O(n) in message length only when an error is supplied. No external state is mutated.
- @param[in] error {unknown} Candidate thrown value.
- @return {boolean} `true` when the value matches the stale-extension-context runtime error.
- @satisfies REQ-280

### fn `function resetElapsedState(state: PiUsereqStatusState): void` (L329-337)
- @brief Resets the in-memory and persisted elapsed counters.
- @details Clears both completed-duration fields plus the in-flight run timer, run-ownership flag, and ended-run duration in the supplied state, mirrors the cleared counters into the process-scoped store, and clears the persisted in-flight run record. Runtime is O(1). Side effects include mutable state reset and process-scoped persistence update.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.
- @satisfies REQ-217

### fn `function shouldResetElapsedStateOnSessionStart(event: unknown): boolean` (L346-349)
- @brief Detects whether a `session_start` event must reset elapsed counters.
- @details Treats `startup` and `reload` as hard-reset boundaries while preserving counters for `new`, `resume`, and `fork`. Runtime is O(1). No external state is mutated.
- @param[in] event {unknown} Session-start payload.
- @return {boolean} `true` when elapsed counters must reset.
- @satisfies REQ-217

### fn `function shouldResetWorkflowStateOnSessionStart(event: unknown): boolean` (L358-361)
- @brief Detects whether a `session_start` event must reset the workflow state to `idle`.
- @details Treats `startup` and `reload` as workflow-reset boundaries so prompt-orchestration state never leaks across boot or extension reload, while non-reset session-start reasons preserve the persisted terminal orchestration outcome. Runtime is O(1). No external state is mutated.
- @param[in] event {unknown} Session-start payload.
- @return {boolean} `true` when workflow state must reset to `idle`.
- @satisfies REQ-009, REQ-221, REQ-633

### fn `export function isPiUsereqWorkflowStartable(workflowState: PiUsereqWorkflowState): boolean` (L370-372)
- @brief Tests whether one workflow state admits a new orchestration.
- @details Accepts the request-less bootstrap `idle` state and the successful terminal `done` state, so a subsequent orchestration can transition `done` into `running` without an intervening reset while `warning` and `error` keep requiring an explicit `/req-reset`. Runtime is O(1). No external state is mutated.
- @param[in] workflowState {PiUsereqWorkflowState} Candidate workflow state.
- @return {boolean} `true` when a new orchestration may start from the supplied state.
- @satisfies REQ-635

### fn `function createStatusThemeAdapter(theme: RawStatusTheme): StatusThemeAdapter` (L382-391)
- @brief Builds the normalized theme adapter used by pi-usereq status formatters.
- @details Precomputes label, value, foreground, and separator renderers so
status formatting remains stable across real TUI themes and deterministic
test doubles. Runtime is O(1). No external state is mutated.
- @param[in] theme {RawStatusTheme} Raw theme implementation from `ctx.ui.theme`.
- @return {StatusThemeAdapter} Normalized status-theme adapter.

### fn `const colorize = (color: StatusForegroundColor, text: string): string =>` (L383-390)

### fn `function resolveStatusBranchValue(ctx: ExtensionContext): string` (L407-409)
- @brief Resolves the active git branch value rendered in the status bar.
- @details Reads the current branch from the active context working directory on every status render so worktree switches and restored base-session renders expose the latest branch immediately. The returned token stays prefix-free because the documented `⎇ ` display prefix is applied by `buildPiUsereqStatusText(...)`. Runtime is dominated by git execution when the working directory belongs to a repository. Side effects include subprocess creation.
- @param[in] ctx {ExtensionContext} Active extension context.
- @return {string} Active branch name or `unknown` when unavailable.
- @satisfies REQ-121, REQ-283

### fn `function normalizeContextUsage(` (L420-437)
- @brief Normalizes one raw context-usage snapshot.
- @details Preserves the runtime token and context-window counts, derives a
percentage when the runtime omits it, clamps negative percentages to `0`,
and preserves overflow above `100` for footer rendering. Runtime is O(1). No
external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Raw runtime snapshot.
- @return {ContextUsage | undefined} Normalized snapshot.

### fn `export function resolveModelContextWindowTokens(` (L446-453)
- @brief Resolves the selected model max input context tokens from one normalized context-usage snapshot.
- @details Accepts only finite positive `contextWindow` numbers so missing, non-numeric, and non-positive runtime values degrade to `undefined`, which every context-occupancy consumer treats as the documented unknown basis. Runtime is O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context-usage snapshot from the status controller state.
- @return {number | undefined} Selected model max input context tokens, or undefined when unknown.
- @satisfies REQ-401

### fn `function refreshContextUsage(` (L465-470)
- @brief Refreshes the stored context-usage snapshot from the active extension context.
- @details Calls `ctx.getContextUsage()` on every intercepted event so the
controller retains the newest context-usage facts available from the pi
runtime. Runtime is O(1). Side effect: mutates `state.contextUsage`.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.
- @satisfies REQ-118, REQ-119

### fn `function resolveContextUsageIconText(` (L479-496)
- @brief Resolves the icon text for one normalized context-usage snapshot.
- @details Maps context usage to one fixed-width icon band so footer rendering remains compact and deterministic across the documented `0`, `>0-<25`, `>=25-<50`, `>=50-<75`, and `>=75` percent bands. Unavailable usage degrades to the `0%` icon. Runtime is O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {string} Fixed-width gauge icon text.
- @satisfies REQ-122, REQ-284

### fn `function formatContextUsageBar(` (L506-518)
- @brief Formats one icon-based context-usage gauge.
- @details Renders the documented gauge icon with the same non-error status-value theme token used by `status` below `90%`, switches to theme `error` for `>=90%`, and enables terminal blink only for `>=100%`. Runtime is O(1). No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {string} Rendered fixed-width gauge icon.
- @satisfies REQ-122, REQ-126, REQ-127, REQ-128, REQ-233, REQ-284

### fn `function formatStatusDuration(durationMs: number): string` (L529-534)
- @brief Formats one elapsed-duration value as `M:SS`.
- @details Floors the input to whole seconds, keeps minutes unbounded above 59,
and zero-pads seconds to two digits. Runtime is O(1). No external state is
mutated.
- @param[in] durationMs {number} Duration in milliseconds.
- @return {string} Duration rendered as `M:SS`.
- @satisfies REQ-125

### fn `function formatCompletedStatusDuration(` (L545-549)
- @brief Formats one optional completed-duration value.
- @details Returns the canonical unset placeholder `--:--` until the supplied
timer receives a normally completed prompt duration, then delegates to
`formatStatusDuration(...)`. Runtime is O(1). No external state is mutated.
- @param[in] durationMs {number | undefined} Optional completed-duration value.
- @return {string} Rendered duration or unset placeholder.
- @satisfies REQ-124

### fn `function formatElapsedStatusValue(` (L562-572)
- @brief Formats the consolidated `elapsed` status-bar value.
- @details Emits the active prompt segment `⏱︎ <active>`, the latest normally
completed segment `⚑ <last>`, and the accumulated successful-runtime segment
`⌛︎<total>` with fixed spacing. Runtime is O(1). No external state is
mutated.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] nowMs {number} Current wall-clock time in milliseconds.
- @return {string} Consolidated `elapsed` field value.
- @satisfies REQ-123, REQ-124, REQ-125, REQ-159

### fn `function formatStatusField(` (L583-589)
- @brief Formats one standard status-bar field.
- @details Renders the field label in accent color and the value in warning
color. Runtime is O(n) in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] value {string} Unstyled field value.
- @return {string} Rendered status-field fragment.

### fn `function formatRenderedStatusField(` (L601-607)
- @brief Formats one pre-rendered status-bar field value.
- @details Preserves the accent-colored field label while allowing callers to
provide a custom styled value such as the context-usage bar. Runtime is O(n)
in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] renderedValue {string} Pre-rendered field value.
- @return {string} Rendered status-field fragment.

### fn `function formatWorkflowStateValue(` (L625-637)
- @brief Formats the rendered workflow-state value for the `status` field.
- @details Uses the standard warning-colored value renderer for neutral states, emits a blinking `error`-colored value for `status:error`, and emits the identical blinking `error`-colored value for `status:warning` so orchestration warnings match the documented error styling. When an active orchestration request token exists, the value renders as `<request>➔<state>` joined by `PI_USEREQ_STATUS_REQUEST_STATE_SEPARATOR`; otherwise it renders the bare `<state>`, so the bootstrap `idle` state stays request-less while `done` renders through the non-error value convention. Runtime is O(n) in text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] workflowState {PiUsereqWorkflowState} Current workflow state.
- @param[in] workflowRequest {string | undefined} Active orchestration request token without the `req-` prefix.
- @return {string} Rendered workflow-state value.
- @satisfies REQ-112, REQ-223, REQ-590, REQ-632, REQ-633, REQ-638

### fn `function didAgentEndAbort(messages: AgentEndEvent["messages"]): boolean` (L648-655)
- @brief Detects whether an agent run ended through abort semantics.
- @details Treats any assistant message whose `stopReason` equals `aborted` as
an escape-triggered termination that must not overwrite the `last` timer.
Runtime is O(n) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Messages emitted by `agent_end`.
- @return {boolean} `true` when the run ended in aborted state.
- @satisfies REQ-125

### fn `function resolvePiUsereqRuntimeSoundLevel(` (L665-670)
- @brief Resolves the active runtime sound level used by status and notify flows.
- @details Prefers the mutable runtime sound state, then falls back to the cached persisted boot value, and finally defaults to `none` before `session_start` loads configuration. Runtime is O(1). No external state is mutated.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] config {UseReqConfig | undefined} Cached project configuration.
- @return {PiNotifySoundLevel} Active runtime sound level.
- @satisfies REQ-180, REQ-285

### fn `function formatExtensionIdentityStatusField(` (L679-684)
- @brief Formats the runtime extension identity prefix for the status bar.
- @details Reads cached installation package metadata and renders the package name plus `v<version>` using the same accent-label and warning-value token split used by standard non-error status fields. Runtime is O(n) in rendered text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @return {string} Rendered extension identity prefix.
- @satisfies REQ-112, REQ-120

### fn `function buildPiUsereqStatusText(` (L697-722)
- @brief Builds the full single-line pi-usereq status-bar payload.
- @details Renders the runtime extension identity prefix before status, then renders status, branch, context, elapsed, and sound fields with dim bullet separators, workflow-state highlighting, the `⎇ `-prefixed branch value, the documented icon-based context gauge, and the active runtime sound level instead of the persisted boot value. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] branchName {string} Active git branch name shown in the footer.
- @param[in] nowMs {number} Current wall-clock time in milliseconds.
- @return {string} Single-line status-bar text.
- @satisfies REQ-109, REQ-112, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-156, REQ-159, REQ-180, REQ-222, REQ-223, REQ-233, REQ-283, REQ-284

### fn `function stopStatusTicker(controller: PiUsereqStatusController): void` (L732-737)
- @brief Stops the live elapsed-time ticker when it is active.
- @details Clears the interval handle and resets the stored timer reference so
subsequent runs can reinitialize live status refreshes deterministically.
Runtime is O(1). Side effect: mutates `controller.tickHandle`.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `function syncPiUsereqStatusTicker(` (L749-765)
- @brief Synchronizes the live elapsed-time ticker with the current run state.
- @details Starts a 1-second render ticker while a run is active and stops the
ticker when the run returns to idle. Runtime is O(1). Side effects include
interval creation, interval disposal, and footer-status mutation on timer
ticks.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-123

### fn `export function createPiUsereqStatusController(): PiUsereqStatusController` (L773-795)
- @brief Creates an empty pi-usereq status controller.
- @details Initializes the mutable status snapshot, including empty prompt-request tracking, an undefined active orchestration request token for the request-less bootstrap `idle` state, and an unset runtime sound level that later loads from persisted config during `session_start`, and starts with no config, no context, and no live ticker. Runtime is O(1). No external state is mutated.
- @return {PiUsereqStatusController} New status controller.
- @satisfies DES-010

### fn `export function setPiUsereqStatusConfig(` (L808-813)
- @brief Stores the effective project configuration used by status rendering.
- @details Replaces the controller's cached configuration so later status
renders reuse the latest docs, tests, source-path, and persisted pi-notify
values without reading from disk on every event, while leaving the active
runtime sound level in `controller.state`. Runtime is O(1). Side effect:
mutates `controller.config`.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `export function getPiUsereqRuntimeSoundLevel(` (L822-826)
- @brief Returns the active runtime sound level tracked by the status controller.
- @details Exposes the in-memory runtime sound state so shortcut handlers and prompt-end notification dispatch can stay decoupled from the persisted boot value stored in global configuration. Runtime is O(1). No external state is mutated.
- @param[in] controller {PiUsereqStatusController} Mutable status controller.
- @return {PiNotifySoundLevel} Active runtime sound level.
- @satisfies REQ-180, REQ-285

### fn `export function setPiUsereqRuntimeSoundLevel(` (L837-847)
- @brief Stores one new runtime sound level and refreshes the status bar.
- @details Mutates only the in-memory runtime sound state so shortcut-driven sound changes do not update persisted local or global configuration, then re-renders the footer when an active extension context is available. Runtime is O(1). Side effect: mutates `controller.state.runtimeSoundLevel` and may update `ctx.ui` status.
- @param[in] runtimeSoundLevel {PiNotifySoundLevel} Next active runtime sound level.
- @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-180, REQ-286, REQ-287

### fn `export function renderPiUsereqStatus(` (L857-888)
- @brief Renders the current pi-usereq status bar into the active UI context.
- @details Updates the controller's latest context pointer, refreshes the live `getContextUsage()` snapshot for direct render call sites that do not pass through `updateExtensionStatus(...)`, and writes the single-line status text only when configuration is available, including the runtime extension identity prefix, active branch field, documented icon-based context gauge, and active runtime sound level. When pi has already invalidated the supplied context after session replacement or reload, the helper clears the stale cached context and returns without surfacing the stale-instance exception. Runtime is O(1) plus git execution for branch refresh. Side effect: mutates `controller.state.contextUsage` and `ctx.ui` status when the context is still active.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-118, REQ-119, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-159, REQ-180, REQ-233, REQ-280, REQ-283, REQ-284

### fn `export function setPiUsereqWorkflowState(` (L899-910)
- @brief Transitions the prompt-orchestration workflow state and refreshes the status bar.
- @details Mutates the tracked workflow state, preserves the latest extension context when available, and re-renders the single-line footer immediately so internal command transitions and pi lifecycle transitions stay visible to the user. Runtime is O(1). Side effect: mutates workflow state and may update `ctx.ui` status.
- @param[in] workflowState {PiUsereqWorkflowState} Next workflow state.
- @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-221, REQ-222, REQ-223

### fn `export function setPiUsereqWorkflowRequest(` (L921-932)
- @brief Stores the active orchestration request token and refreshes the status bar.
- @details Records the processed slash-command name without the `req-` prefix in the process-scoped runtime state before the orchestration enters `checking` or `running`, then re-renders the single-line footer so the `<request>➔<state>` status value becomes visible immediately. Runtime is O(1). Side effect: mutates workflow request state and may update `ctx.ui` status.
- @param[in] workflowRequest {string} Active request token without the `req-` prefix.
- @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-630, REQ-631, REQ-637

### fn `export function updateExtensionStatus(` (L944-1079)
- @brief Updates mutable status state for one intercepted lifecycle hook.
- @details Refreshes stored context usage on every hook, resets or restores persisted elapsed counters during `session_start`, loads the active runtime sound level from persisted config during `session_start`, restores persisted prompt-command metadata when the active session matches a forked execution session, restores the persisted terminal workflow state plus active request for non-reset `session_start` reasons and resets workflow state to `idle` only for `startup|reload`, resynchronizes metadata on later lifecycle hooks so post-switch workflow transitions performed by the initiating command handler become visible to the replacement-session runtime, clears the deferred terminal finalization outcome whenever session resets clear prompt-request metadata, starts run timing, records whether the in-flight run belongs to the active prompt request, and promotes the pending prompt-request metadata into the active run on `agent_start` while preserving an already-promoted active request across pi-host agent-run restarts such as overflow compact-and-retry recovery, persists the in-flight run record into the process-scoped store, captures each ended run's own duration on `agent_end` or `agent_settled` (recovering the run start and prompt association from the process-scoped record when the in-memory timer was cleared mid-run), accumulates successful runtime into `Σ` while keeping the ended-run duration separate from the completed counters, preserves in-memory prompt-command state plus process-scoped persistence across switch-triggered `session_shutdown`, keeps terminal `done|warning|error` states across shutdown while resetting only in-flight states, tolerates stale post-replacement render contexts, synchronizes the live ticker, and re-renders the status bar with the runtime extension identity prefix when configuration is available. Runtime is O(n) in `agent_end` message count and otherwise O(1). Side effects include in-memory state mutation, interval scheduling, process-scoped persistence mutation, and footer-status updates.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded from the wrapper.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-009, REQ-117, REQ-118, REQ-119, REQ-123, REQ-124, REQ-125, REQ-159, REQ-169, REQ-187, REQ-217, REQ-221, REQ-278, REQ-279, REQ-280, REQ-285, REQ-421, REQ-461

### fn `export function disposePiUsereqStatusController(` (L1090-1095)
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
|`StatusForegroundColor`|type||33||
|`RawStatusTheme`|iface||43-45|interface RawStatusTheme|
|`StatusThemeAdapter`|iface||53-58|interface StatusThemeAdapter|
|`PiUsereqStatusHookName`|type||103||
|`PiUsereqPromptRequest`|type||109||
|`PiUsereqWorkflowState`|type||115||
|`PiUsereqStatusState`|iface||121-136|export interface PiUsereqStatusState|
|`PiUsereqStatusController`|iface||145-150|export interface PiUsereqStatusController|
|`PiUsereqStatusPersistenceStore`|iface||156-161|interface PiUsereqStatusPersistenceStore|
|`getPiUsereqStatusPersistenceStore`|fn||175-186|function getPiUsereqStatusPersistenceStore(): PiUsereqSta...|
|`restorePersistedElapsedState`|fn||194-198|function restorePersistedElapsedState(state: PiUsereqStat...|
|`persistElapsedState`|fn||206-210|function persistElapsedState(state: PiUsereqStatusState):...|
|`persistActiveRunState`|fn||219-223|function persistActiveRunState(state: PiUsereqStatusState...|
|`readPersistedActiveRunState`|fn||231-236|function readPersistedActiveRunState(): { startMs: number...|
|`clearPersistedActiveRunState`|fn||244-248|function clearPersistedActiveRunState(): void|
|`persistPromptCommandState`|fn||256-263|function persistPromptCommandState(state: PiUsereqStatusS...|
|`shouldPreservePromptCommandStateOnShutdown`|fn||272-275|export function shouldPreservePromptCommandStateOnShutdow...|
|`restorePersistedPromptCommandState`|fn||284-296|function restorePersistedPromptCommandState(|
|`getContextSessionFile`|fn||304-308|function getContextSessionFile(ctx: ExtensionContext): st...|
|`isStaleExtensionContextError`|fn||317-320|export function isStaleExtensionContextError(error: unkno...|
|`resetElapsedState`|fn||329-337|function resetElapsedState(state: PiUsereqStatusState): void|
|`shouldResetElapsedStateOnSessionStart`|fn||346-349|function shouldResetElapsedStateOnSessionStart(event: unk...|
|`shouldResetWorkflowStateOnSessionStart`|fn||358-361|function shouldResetWorkflowStateOnSessionStart(event: un...|
|`isPiUsereqWorkflowStartable`|fn||370-372|export function isPiUsereqWorkflowStartable(workflowState...|
|`createStatusThemeAdapter`|fn||382-391|function createStatusThemeAdapter(theme: RawStatusTheme):...|
|`colorize`|fn||383-390|const colorize = (color: StatusForegroundColor, text: str...|
|`resolveStatusBranchValue`|fn||407-409|function resolveStatusBranchValue(ctx: ExtensionContext):...|
|`normalizeContextUsage`|fn||420-437|function normalizeContextUsage(|
|`resolveModelContextWindowTokens`|fn||446-453|export function resolveModelContextWindowTokens(|
|`refreshContextUsage`|fn||465-470|function refreshContextUsage(|
|`resolveContextUsageIconText`|fn||479-496|function resolveContextUsageIconText(|
|`formatContextUsageBar`|fn||506-518|function formatContextUsageBar(|
|`formatStatusDuration`|fn||529-534|function formatStatusDuration(durationMs: number): string|
|`formatCompletedStatusDuration`|fn||545-549|function formatCompletedStatusDuration(|
|`formatElapsedStatusValue`|fn||562-572|function formatElapsedStatusValue(|
|`formatStatusField`|fn||583-589|function formatStatusField(|
|`formatRenderedStatusField`|fn||601-607|function formatRenderedStatusField(|
|`formatWorkflowStateValue`|fn||625-637|function formatWorkflowStateValue(|
|`didAgentEndAbort`|fn||648-655|function didAgentEndAbort(messages: AgentEndEvent["messag...|
|`resolvePiUsereqRuntimeSoundLevel`|fn||665-670|function resolvePiUsereqRuntimeSoundLevel(|
|`formatExtensionIdentityStatusField`|fn||679-684|function formatExtensionIdentityStatusField(|
|`buildPiUsereqStatusText`|fn||697-722|function buildPiUsereqStatusText(|
|`stopStatusTicker`|fn||732-737|function stopStatusTicker(controller: PiUsereqStatusContr...|
|`syncPiUsereqStatusTicker`|fn||749-765|function syncPiUsereqStatusTicker(|
|`createPiUsereqStatusController`|fn||773-795|export function createPiUsereqStatusController(): PiUsere...|
|`setPiUsereqStatusConfig`|fn||808-813|export function setPiUsereqStatusConfig(|
|`getPiUsereqRuntimeSoundLevel`|fn||822-826|export function getPiUsereqRuntimeSoundLevel(|
|`setPiUsereqRuntimeSoundLevel`|fn||837-847|export function setPiUsereqRuntimeSoundLevel(|
|`renderPiUsereqStatus`|fn||857-888|export function renderPiUsereqStatus(|
|`setPiUsereqWorkflowState`|fn||899-910|export function setPiUsereqWorkflowState(|
|`setPiUsereqWorkflowRequest`|fn||921-932|export function setPiUsereqWorkflowRequest(|
|`updateExtensionStatus`|fn||944-1079|export function updateExtensionStatus(|
|`disposePiUsereqStatusController`|fn||1090-1095|export function disposePiUsereqStatusController(|


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

# notification-replay.ts | TypeScript | 112L | 8 symbols | 0 imports | 11 comments
> Path: `src/core/notification-replay.ts`
- @brief Persists deferred UI notifications across session rebinding for later replay.
- @details Stores non-agentic command-output notifications whose stale-context-safe delivery failed on one `globalThis` queue because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists across those operations, so undeliverable payloads survive until a later `session_start` restores a live UI context. Runtime is O(1) per operation. Side effects are limited to process-scoped state mutation; no local or global configuration file is ever written.

## Definitions

### iface `export interface DeferredNotificationRecord` (L22-25)
- @brief Describes one deferred notification queued for later replay.
- @details Pairs the exact notification message text with its original severity so the replayed delivery preserves the deferred payload without reparsing or reconstruction. The interface is compile-time only and introduces no runtime cost.

### iface `interface ProcessScopedNotificationReplayStore` (L38-40)
- @brief Describes the process-scoped deferred-notification replay state persisted across extension rebinds.
- @details Stores the ordered queue of undelivered notification payloads so a later `session_start` on one restored UI context can redeliver exactly the evidence that stale contexts dropped. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-439

### fn `function getProcessScopedNotificationReplayStore(): ProcessScopedNotificationReplayStore` (L48-54)
- @brief Returns the process-scoped deferred-notification replay store.
- @details Lazily initializes one `globalThis` record holding an empty queue so session rebinds reuse the accumulated deferred payloads instead of resetting them. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedNotificationReplayStore} Mutable process-scoped replay store.
- @satisfies REQ-439

### fn `export function enqueueDeferredNotification(message: string, level: "info" | "warning" | "error"): void` (L64-66)
- @brief Queues one undeliverable notification for later replay.
- @details Appends the exact message plus severity to the tail of the process-scoped replay queue so the payload survives extension rebinding and can be redelivered on the next eligible `session_start`. Already-delivered notifications are never enqueued by contract, so replay can never duplicate them. Runtime is O(1). Side effect: mutates process-scoped state.
- @param[in] message {string} Exact notification message text whose stale-context delivery failed.
- @param[in] level {"info" | "warning" | "error"} Original notification severity preserved for the replayed delivery.
- @return {void} No return value.
- @satisfies REQ-439, REQ-442

### fn `export function readDeferredNotifications(): DeferredNotificationRecord[]` (L74-76)
- @brief Returns a snapshot of the queued deferred notifications.
- @details Copies the queued records into one detached array so callers can inspect pending replay payloads without mutating the store. Runtime is O(n) in queued-record count. No external state is mutated.
- @return {DeferredNotificationRecord[]} Detached copy of the queued records in enqueue order.
- @satisfies REQ-439

### fn `export function drainDeferredNotifications(): DeferredNotificationRecord[]` (L84-89)
- @brief Atomically removes and returns every queued deferred notification.
- @details Empties the process-scoped queue and returns the removed records in enqueue order so replay delivery owns each payload exactly once; payloads whose replay delivery fails stale again are re-enqueued by the deferred-delivery helper instead of remaining in this drain result. Runtime is O(n) in queued-record count. Side effect: clears process-scoped state.
- @return {DeferredNotificationRecord[]} Removed records in enqueue order.
- @satisfies REQ-440

### fn `export function clearDeferredNotifications(): void` (L97-99)
- @brief Clears every queued deferred notification.
- @details Resets the process-scoped queue to empty so stale deferred payloads never reach later sessions after explicit cleanup. Runtime is O(1). Side effect: mutates process-scoped state.
- @return {void} No return value.
- @satisfies REQ-439

### fn `export function shouldReplayDeferredNotificationsOnSessionStart(event: unknown): boolean` (L108-112)
- @brief Tests whether one `session_start` event must trigger deferred-notification replay.
- @details Reads the loosely-typed `reason` field from the session-start payload and accepts exactly the documented restoration reasons `new`, `resume`, `reload`, and `fork`, excluding `startup` because one fresh host process starts with an empty process-scoped queue. Missing or unknown reasons degrade to `false`. Runtime is O(1). No external state is mutated.
- @param[in] event {unknown} Session-start payload forwarded by the pi lifecycle wrapper.
- @return {boolean} `true` when deferred notifications must be replayed for this session-start reason.
- @satisfies REQ-440

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`DeferredNotificationRecord`|iface||22-25|export interface DeferredNotificationRecord|
|`ProcessScopedNotificationReplayStore`|iface||38-40|interface ProcessScopedNotificationReplayStore|
|`getProcessScopedNotificationReplayStore`|fn||48-54|function getProcessScopedNotificationReplayStore(): Proce...|
|`enqueueDeferredNotification`|fn||64-66|export function enqueueDeferredNotification(message: stri...|
|`readDeferredNotifications`|fn||74-76|export function readDeferredNotifications(): DeferredNoti...|
|`drainDeferredNotifications`|fn||84-89|export function drainDeferredNotifications(): DeferredNot...|
|`clearDeferredNotifications`|fn||97-99|export function clearDeferredNotifications(): void|
|`shouldReplayDeferredNotificationsOnSessionStart`|fn||108-112|export function shouldReplayDeferredNotificationsOnSessio...|


---

# package-manager.ts | TypeScript | 1291L | 64 symbols | 7 imports | 111 comments
> Path: `src/core/package-manager.ts`
- @brief Implements pi-usereq package-management commands (`--help`, `--ver|--version`, `--upgrade [--dev|--develop] [--force]`, `--uninstall`).
- @details Provides the dependency-injected handlers dispatched by `src/cli.ts` before standard flag parsing: offline help-screen rendering for `--help`, concurrent npm-registry plus GitHub-releases version probing for `--ver`/`--version`, pi-CLI package update through the documented `pi update npm:pi-usereq` form on the default `--upgrade` channel, tag-pinned `pi install git:github.com/Ogekuri/PI-useReq@<tag>` reconciliation on the develop channel after the GitHub latest-release probe, forced runs that only skip the default-channel already-latest registry gate because the pi CLI `--force` option affects the self-update path only, source-aware reconciliation that identifies the installed npm-managed or git-managed package and runs `pi remove <identified-source>` plus `pi install <target-source>` when the channel target differs from the installed source, and global package removal for `--uninstall`. Every network probe is bounded by a hard timeout deadline, every package-manager child process runs with inherited stdio from the user home, and every diagnostic is stderr-only. Upgrade completion summaries resolve the updated version through the pi-managed-first installed-version rule and warn when a non-forced child leaves it unchanged. Runtime is dominated by one or two HTTP round-trips or child-process executions per invocation. Side effects include outbound HTTPS requests and package-manager child processes.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import {
import {
```

## Definitions

### fn `export function buildPackageManagerDevelopSource(tag: string): string` (L68-70)
- @brief Builds the ref-pinned pi package source of one GitHub release tag for the develop channel.
- @details Composes `git:github.com/Ogekuri/PI-useReq@<tag>` from the documented distribution repository identity plus the raw `tag_name` resolved by the GitHub latest-release probe, so the develop channel installs the exact published release instead of the repository default branch. Runtime is O(n) in tag length. Pure; no side effects.
- @param[in] tag {string} Raw GitHub release `tag_name`, such as `v1.2.3`.
- @return {string} Ref-pinned develop-channel pi package source token.
- @note Complexity: O(n) in tag length. Pure; no side effects.
- @satisfies REQ-613, REQ-639, REQ-644

- type `export type PackageManagerCommandName =` (L81)
- type `export type PackageManagerUpgradeChannel = "npm" | "develop";` (L89)
### iface `export interface PackageManagerInstalledPackage` (L96-99)

- type `export type PackageManagerHelpTopic =` (L102)
### iface `export interface PackageManagerLogger` (L111-116)
- @param args {unknown[]} Diagnostic fragments joined for stderr output.
- @param args {unknown[]} Error diagnostic fragments for stderr output.

### iface `export interface PackageManagerStdout` (L119-122)
- @param data {string} Report or summary text fragment to emit verbatim.

### iface `export interface PackageManagerSpawnResult` (L125-130)

### iface `export interface PackageManagerSpawnOptions` (L133-140)

- type `export type PackageManagerSpawn = (` (L143)
- type `export type PackageManagerRegistryProbe =` (L150)
- type `export type PackageManagerGitHubProbe =` (L161)
### iface `export interface PackageManagerRegistryProbeDeps` (L166-177)

### iface `export interface PackageManagerGitHubProbeDeps` (L180-187)

### iface `export interface PackageManagerCommandOptions` (L190-199)

### iface `export interface PackageManagerCommandDeps` (L202-223)

### fn `const defaultPackageManagerSpawn: PackageManagerSpawn = (file, args, options) =>` (L243-249)

### fn `export function isNewerPackageManagerVersion(candidate: string, current: string): boolean` (L254-277)
- @brief Compares two dotted numeric version strings for strict-newness.
- @details Splits both inputs on `.` into integer segments, right-pads the shorter sequence with zeroes, and returns on the first differing segment. Any non-integer segment (including prerelease suffixes such as `3-beta.1`) forces `false`, so unparseable or prerelease candidates never trigger an upgrade.
- @param[in] candidate {string} Version reported as available (latest).
- @param[in] current {string} Version currently installed.
- @return {boolean} `true` only when `candidate` is strictly newer than `current`.
- @note Complexity: O(k) in the number of dotted segments. Pure; no side effects.

### fn `const toSegments = (version: string): number[] =>` (L255-267)

### fn `function isParseablePackageManagerVersion(version: string): boolean` (L286-289)
- @brief Tests whether one dotted version string parses into numeric release segments.
- @details Splits the release part on `.`, accepting only integer segments; a trailing `-prerelease` suffix is stripped before segment validation so both release and prerelease candidates are parseable. Runtime is O(k) in segment count. Pure; no side effects.
- @param[in] version {string} Candidate dotted version string.
- @return {boolean} `true` when the release segments are all non-negative integers.
- @note Complexity: O(k) in segment count. Pure; no side effects.

### fn `export function comparePackageManagerVersionOrder(left: string, right: string): number` (L299-330)
- @brief Orders two dotted version strings with release-over-prerelease semantics.
- @details Parses each input into integer release segments plus an optional prerelease suffix, compares numeric segments segment-by-segment with zero padding, then breaks ties by placing releases above prereleases and finally by lexicographic prerelease ordering; unparseable inputs sort below every parseable input. Runtime is O(k) in segment count. Pure; no side effects.
- @param[in] left {string} Left dotted version string.
- @param[in] right {string} Right dotted version string.
- @return {number} Negative when `left` sorts before `right`, positive when after, `0` when equivalent.
- @note Complexity: O(k) in segment count. Pure; no side effects.

### fn `const parse = (version: string): { segments: number[]; prerelease: string | null } | undefined =>` (L300-311)

### fn `export function resolveHighestPackageManagerVersion(` (L340-354)
- @brief Resolves the highest semver-ordered version from one candidate list.
- @details Filters out empty and unparseable candidates, then selects the maximum through `comparePackageManagerVersionOrder(...)` so releases outrank equal-numeric prereleases. Runtime is O(n * k) in candidate count and segment count. Pure; no side effects.
- @param[in] versions {readonly string[]} Candidate dotted version strings.
- @return {string | undefined} Highest parseable candidate, or `undefined` when none is parseable.
- @note Complexity: O(n * k). Pure; no side effects.
- @see comparePackageManagerVersionOrder

### fn `export function resolvePackageManagerManifestLatest(payload: unknown): string | undefined` (L365-382)
- @brief Resolves the npmjs latest version from one registry package manifest document.
- @details Follows the npm best-practice resolution order: a non-empty `dist-tags.latest` string defines the canonical npmjs latest version; otherwise the highest semver-ordered entry of the manifest `versions` map is selected so releases outrank equal-numeric prereleases; every other payload shape resolves to `undefined`. Runtime is O(v * k) over manifest version keys. Pure; no side effects.
- @param[in] payload {unknown} Parsed npmjs package manifest document (packument).
- @return {string | undefined} Resolved latest version text, or `undefined` when the manifest exposes neither field.
- @note Complexity: O(v * k) in manifest version count and segment count. Pure; no side effects.
- @see resolveHighestPackageManagerVersion
- @satisfies REQ-489

### fn `function stripPackageManagerReleaseTagPrefix(tag: string): string` (L391-393)
- @brief Strips the release-tag prefix from a GitHub release tag.
- @details Trims surrounding whitespace and removes one leading `v`/`V` character, returning the remaining text.
- @param[in] tag {string} Raw `tag_name` value from the GitHub releases API.
- @return {string} Version text without the leading `v`; possibly empty.
- @note Complexity: O(n) in tag length. Pure; no side effects.

### fn `export async function probeLatestRegistryVersion(` (L404-405)
- @brief Probes the npmjs package manifest document for the latest published package version.
- @details Logging-free resolution order: installed-version guard (missing `currentVersion` returns `unknown-version` with zero network calls) -> single `GET {registry}/{package}` fetching the npmjs package manifest document (packument) backing `https://www.npmjs.com/package/{package}` with the timeout deadline -> `response.ok` validation -> `resolvePackageManagerManifestLatest(...)` dist-tags/versions resolution -> `isNewerPackageManagerVersion` gate; both `newer` and `current` outcomes carry the resolved manifest latest version so reporting never substitutes the installed version. Every failure is returned as a discriminated outcome; never throws.
- @param[in] deps {PackageManagerRegistryProbeDeps} Optional dependency overrides; production defaults when omitted.
- @return {Promise<PackageManagerRegistryProbe>} Discriminated probe outcome carrying the manifest latest version; `message` carries the final diagnostic text without logging.
- @note Complexity: one HTTP round-trip bounded by the timeout deadline.
- @see resolvePackageManagerManifestLatest
- @satisfies REQ-477, REQ-489

### fn `async function resolveGitHubProbeFailureReason(response: Response): Promise<string | undefined>` (L446-456)
- @brief Extracts the upstream failure reason from one GitHub error response body.
- @details Parses the failing response body as JSON and accepts only a non-empty string `message` field as the upstream reason, returning `undefined` for non-JSON bodies, malformed payloads, or missing messages so the probe outcome stays deterministic without exposing the response-read failure itself. Runtime is O(n) in body size. Never throws.
- @param[in] response {Response} Failing HTTP response whose body should be inspected.
- @return {Promise<string | undefined>} Upstream failure reason when extractable; otherwise `undefined`.
- @note Complexity: O(n) in body size.
- @satisfies REQ-503

### fn `export async function probeLatestGitHubRelease(` (L466-467)
- @brief Probes the GitHub releases API for the latest published release version.
- @details Logging-free resolution order: single `GET {releasesUrl}` with the timeout deadline and the GitHub-mandatory `user-agent` header -> `response.ok` validation -> upstream failure-reason capture from the error-response `message` field -> `payload.tag_name` validation -> leading `v` prefix strip. Never consults any persisted cache; callers own the manual-command context. Every failure is returned as a discriminated outcome carrying the deterministic HTTP-status diagnostic plus the optional upstream `reason`; never throws.
- @param[in] deps {PackageManagerGitHubProbeDeps} Optional dependency overrides; production defaults when omitted.
- @return {Promise<PackageManagerGitHubProbe>} `ok` with the stripped version text plus the raw `tag_name`, or `error` with the diagnostic message plus the optional captured upstream failure reason.
- @note Complexity: O(n) in tag length plus one HTTP round-trip bounded by the timeout deadline.
- @satisfies REQ-477, REQ-478, REQ-503

### fn `function resolveRegistryProbeLatestVersionText(probe: PackageManagerRegistryProbe): string` (L511-516)
- @brief Maps one registry probe outcome to its manifest latest-version text.
- @details `newer` and `current` both map to the resolved npmjs manifest latest version carried by the probe, so an installed version newer than the published latest still reports the published latest verbatim; every other outcome maps to the `unknown` placeholder. Pure; never throws.
- @param[in] probe {PackageManagerRegistryProbe} Logging-free registry probe outcome.
- @return {string} Latest npmjs-manifest version text, or `unknown`.
- @note Complexity: O(1). Pure; no side effects.
- @satisfies REQ-475, REQ-489

### fn `function resolveGitHubProbeLatestVersionText(probe: PackageManagerGitHubProbe): string` (L526-534)
- @brief Maps one GitHub probe outcome to its version-report text.
- @details `ok` maps to the stripped release version; failed outcomes map to `unknown (<reason>)` when the probe captured an upstream failure reason and to the plain `unknown` placeholder when it did not, so rate-limited or otherwise rejected GitHub requests surface the actual upstream error verbatim. Pure; never throws.
- @param[in] probe {PackageManagerGitHubProbe} Logging-free GitHub probe outcome.
- @return {string} GitHub-latest report text.
- @note Complexity: O(1) plus reason length. Pure; no side effects.
- @satisfies REQ-475, REQ-476, REQ-502

### fn `function formatPackageManagerVersionReportLine(label: string, versionText: string): string` (L551-553)
- @brief Formats one aligned `--ver`/`--version` report line.
- @details Right-pads the supplied report label with spaces to the fixed 18-character `Current Installed ` column width so every `:` separator and version number aligns vertically across the three report lines, then appends `: ` plus the version text verbatim. Labels longer than the column keep their full text without truncation. Pure; no side effects.
- @param[in] label {string} Report label such as `Current Installed`, `Latest @ NPMjs`, or `Latest @ GitHub`.
- @param[in] versionText {string} Resolved version text, including `unknown (<reason>)` GitHub failure renderings.
- @return {string} One aligned report line without a trailing newline; the caller joins the three lines with `\n`.
- @note Complexity: O(n) in label length. Pure; no side effects.
- @satisfies REQ-475, REQ-529

### fn `export function parsePackageManagerCommand(` (L563-598)
- @brief Detects an exact management-command argv shape in a raw argv array.
- @details Single-token shape: exactly one of `--ver`, `--version`, `--upgrade`, `--uninstall`, and `--help`. Two-token shapes: `--upgrade` paired with the `--develop` option, its equivalent `--dev` alias, or the `--force` auxiliary option, or `--help` paired with one documented help topic, in either order. Three-token shapes: `--upgrade`, `--force`, and the `--develop` option or its `--dev` alias in any order. Any other shape yields `undefined` so standard flag dispatch stays untouched.
- @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
- @return {PackageManagerCommandName | undefined} Canonical command name, or `undefined` when no management shape matches.
- @note Complexity: O(1). Pure; no side effects.
- @satisfies REQ-473, REQ-511, REQ-524, REQ-525

### fn `export function parsePackageManagerUpgradeChannel(args: readonly string[]): PackageManagerUpgradeChannel` (L607-609)
- @brief Resolves the `--upgrade` install channel from a raw argv array.
- @details Returns `develop` when the argv contains the `--develop` option or its equivalent `--dev` alias, and `npm` (default channel) otherwise. Pure; no side effects.
- @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
- @return {PackageManagerUpgradeChannel} `develop` or `npm`.
- @note Complexity: O(n) in argv length. Pure; no side effects.

### fn `export function parsePackageManagerForceFlag(args: readonly string[]): boolean` (L619-621)
- @brief Resolves the `--force` auxiliary option from a raw argv array.
- @details Returns `true` only when the argv contains the `--force` auxiliary token accepted by the `--upgrade` management shapes; every other management command ignores the token because non-upgrade `--force` shapes never match a management command and fall through to standard flag parsing. Pure; no side effects.
- @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
- @return {boolean} `true` when the `--force` auxiliary option is present.
- @note Complexity: O(n) in argv length. Pure; no side effects.
- @satisfies REQ-524, REQ-525

### fn `export function parsePackageManagerHelpTopic(` (L631-649)
- @brief Resolves the `--help` topic operand from a raw argv array.
- @details Accepts exactly two tokens where one is `--help` and the other is one of `--upgrade`, `--dev`, `--develop`, `--uninstall`, `--ver`, or `--version`, in either order, returning the topic token; every other shape, including a doubled `--help`, yields `undefined` so the full help screen stays selected.
- @param[in] args {readonly string[]} Raw CLI arguments excluding the executable and script path.
- @return {PackageManagerHelpTopic | undefined} Requested help topic, or `undefined` when absent.
- @note Complexity: O(1). Pure; no side effects.
- @satisfies REQ-511

### fn `function normalizePackageManagerVersionText(value: string): string` (L659-662)
- @brief Normalizes one resolved package-version text value.
- @details Trims surrounding whitespace and maps every empty value to `PACKAGE_MANAGER_UNKNOWN_VERSION` so reports never emit a blank version field. Runtime is O(n) in value length. Pure; no side effects.
- @param[in] value {string} Candidate version text.
- @return {string} Trimmed version text, or `unknown` when empty.
- @note Complexity: O(n) in value length. Pure; no side effects.
- @satisfies REQ-476, REQ-647

### fn `export function resolvePiManagedPackageManagerVersion(` (L672-686)
- @brief Resolves the pi-usereq version exposed by the pi-managed installations.
- @details Probes the pi-managed git installation root `<agent-dir>/git/github.com/Ogekuri/PI-useReq` first and the pi-managed npm installation root `<agent-dir>/npm/node_modules/pi-usereq` second, returning the first readable `<packageRoot>/package.json` version so a source-checkout invocation can report the pi-managed installation instead of the checkout image. Every read is uncached so a preceding pi CLI child is observed immediately. Runtime is O(n) in aggregate manifest size. Side effects are limited to filesystem reads.
- @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
- @return {string | undefined} Trimmed pi-managed package version, or `undefined` when neither root exposes a readable version.
- @note Complexity: O(n) in aggregate manifest size.
- @satisfies REQ-487, REQ-647

### fn `function resolveReportedPackageManagerVersion(executingVersionReader: () => string): string` (L696-704)
- @brief Resolves one reported installed version through the pi-managed-first rule.
- @details Uses the supplied executing-installation reader verbatim when the executing installation is pi-managed, because that installation owns the authoritative manifest; otherwise prefers the pi-managed installation version and falls back to the executing-installation reader, so a source checkout reports the pi-managed installation while a genuine managed installation reports itself. Runtime is O(n) in manifest size. Side effects are limited to filesystem reads delegated to the readers.
- @param[in] executingVersionReader {() => string} Uncached reader for the executing installation version.
- @return {string} Normalized reported version text.
- @note Complexity: O(n) in manifest size.
- @satisfies REQ-487, REQ-647, REQ-648

### fn `export function resolvePackageManagerInstalledVersion(): string` (L712-714)
- @brief Resolves the installed package version backing the management commands.
- @details Applies the pi-managed-first rule: a pi-managed executing installation reports its own installation-owned `version` field, while a non-pi-managed executing installation (source checkout, global npm install, offline harness) reports the pi-managed git root, then the pi-managed npm root, and only then its own manifest. Every undeterminable value degrades to `unknown` so the version report never emits a blank field. Runtime is O(n) in manifest size. Side effects are limited to filesystem reads.
- @return {string} Installed package version, or `unknown`.
- @satisfies REQ-475, REQ-487, REQ-647, REQ-648

### fn `function resolvePiAgentDir(homeDirImpl: () => string = homedir): string` (L723-736)
- @brief Resolves the pi agent directory backing the managed package install roots.
- @details Honors the pi `PI_CODING_AGENT_DIR` environment override with leading-tilde expansion and falls back to `<user-home>/.pi/agent`, mirroring the pi CLI package-manager install-root contract used for npm and git sources. Runtime is O(p) in path length. Pure; no side effects.
- @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
- @return {string} Absolute pi agent directory path.
- @note Complexity: O(p) in path length. Pure; no side effects.

### fn `export function resolvePackageManagerChannelInstallRoot(` (L747-760)
- @brief Resolves the installation package root owned by one `--upgrade` channel target source.
- @details Derives the post-switch installation root from the pi-managed agent directory plus the channel target source contract: `npm:pi-usereq` resolves to `<agent-dir>/npm/node_modules/pi-usereq` and `git:github.com/Ogekuri/PI-useReq` resolves to `<agent-dir>/git/github.com/Ogekuri/PI-useReq`. The executing `pi remove` child deletes the source installation that owns the running process, so post-switch launcher repair and post-switch version reporting MUST address the target root instead of the runtime installation path. Runtime is O(p) in path length. Pure; no side effects.
- @param[in] channel {PackageManagerUpgradeChannel} Selected upgrade channel.
- @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
- @return {string} Absolute package root of the channel target installation.
- @note Complexity: O(p) in path length. Pure; no side effects.
- @satisfies REQ-484, REQ-504, REQ-613

### fn `function defaultRepairPackageManagerLauncher(): void` (L769-775)
- @brief Repairs the deployed agent-bin `pi-usereq` launcher after one successful upgrade child.
- @details Repairs the launcher only for genuine pi-package installations so source checkouts, offline harnesses, and deterministic tests never touch the developer home, then re-deploys the `pi-usereq` symlink against the executing installation. A `pi update` child rewrites the managed dependency tree, so re-verifying the launcher after a successful child keeps the management CLI resolvable instead of leaving a dangling link that forces the user onto a stale foreign shim. Runtime is O(p) in path length plus bounded filesystem metadata calls. Side effects include conditional symlink creation or replacement inside the pi agent bin directory.
- @return {void} No return value.
- @note Complexity: O(p) in path length plus bounded filesystem metadata calls.
- @satisfies REQ-504, REQ-505, REQ-506, REQ-507

### fn `function readPackageManagerPackageRootVersion(packageRoot: string): string | undefined` (L785-797)
- @brief Reads the version field of one installation-owned package manifest.
- @details Parses `<packageRoot>/package.json` and accepts only a non-empty string `version` field so undeterminable manifests degrade to `undefined`. Runtime is O(n) in manifest size. Side effects are limited to one filesystem read.
- @param[in] packageRoot {string} Absolute installation package root.
- @return {string | undefined} Trimmed package version, or `undefined` when the manifest is missing, malformed, or exposes no usable version.
- @note Complexity: O(n) in manifest size.
- @satisfies REQ-484

### fn `export function resolveInstalledPackageManagerSource(` (L808-830)
- @brief Identifies the package source of the executing pi-usereq installation.
- @details Classifies the runtime installation path against the pi-managed user-scope install roots: `<agent-dir>/npm/node_modules/pi-usereq` resolves to the npm source token, `<agent-dir>/git` resolves to a git source token derived as `git:<host>/<owner>/<repository>` from the path relative to `<agent-dir>/git`, and every other location reports `unknown` so source checkouts, global npm installs, and project-scope installs never trigger a package removal. Runtime is O(p) in path length. Pure; no side effects.
- @param[in] installationPath {string} Candidate installation root. Defaults to the runtime installation path.
- @param[in] homeDirImpl {() => string} User-home resolver. Defaults to `node:os` `homedir`.
- @return {PackageManagerInstalledPackage} Identified npm-managed, git-managed, or unknown source facts.
- @note Complexity: O(p) in path length. Pure; no side effects.
- @satisfies REQ-609, REQ-610, REQ-611, REQ-612

### fn `export function buildPackageManagerRemoveCommand(source: string): readonly string[]` (L840-842)
- @brief Builds the pi CLI package-removal command for one identified source.
- @details Emits `pi remove <source>` because the documented pi CLI package command removes a package together with its settings entry. Runtime is O(1). Pure; no side effects.
- @param[in] source {string} Identified pi package source token.
- @return {readonly string[]} Package-removal command vector.
- @note Complexity: O(1). Pure; no side effects.
- @satisfies REQ-614

### fn `export function buildPackageManagerInstallCommand(source: string): readonly string[]` (L852-854)
- @brief Builds the pi CLI package-installation command for one target source.
- @details Emits `pi install <source>`; the handler uses it both after a channel-switch removal and as the develop-channel reconciliation child, whose install rewrites the same-identity `packages` settings entry and resets the existing pi-managed checkout to the resolved tag commit. Runtime is O(1). Pure; no side effects.
- @param[in] source {string} Target pi package source token.
- @return {readonly string[]} Package-installation command vector.
- @note Complexity: O(1). Pure; no side effects.
- @satisfies REQ-482, REQ-617, REQ-641, REQ-644, REQ-645

### fn `export function resolvePackageManagerUpgradeSource(` (L865-875)
- @brief Resolves the pi package source targeted by one `--upgrade` channel.
- @details Maps the default channel onto the npm-managed source `npm:pi-usereq` and the develop channel onto the ref-pinned git source `git:github.com/Ogekuri/PI-useReq@<tag>` when a resolved release tag is supplied, falling back to the unpinned base git source only for callers that resolve no tag. Runtime is O(1). Pure; no side effects.
- @param[in] channel {PackageManagerUpgradeChannel} Selected upgrade channel.
- @param[in] developTag {string | undefined} Raw GitHub release `tag_name` resolved for the develop channel.
- @return {string} Target pi package source token.
- @note Complexity: O(1). Pure; no side effects.
- @satisfies REQ-613

### fn `export function requiresPackageManagerSourceSwitch(` (L886-892)
- @brief Tests whether one upgrade run must remove the installed package before installing the target source.
- @details Requires a resolvable installed source whose kind differs from the channel target kind, so equal sources keep the documented update process and `unknown` installations never trigger a removal. Runtime is O(1). Pure; no side effects.
- @param[in] installed {PackageManagerInstalledPackage} Identified installed package source.
- @param[in] channel {PackageManagerUpgradeChannel} Selected upgrade channel.
- @return {boolean} `true` when the installed package must be removed before installation.
- @note Complexity: O(1). Pure; no side effects.
- @satisfies REQ-614, REQ-615

### fn `function switchPackageManagerSource(` (L904-920)
- @brief Removes the identified installed package and installs the target source.
- @details Runs `pi remove <identified-source>` first and returns its non-zero exit code without running the installation child, otherwise runs `pi install <target-source>` and returns its exit code so a channel switch leaves exactly one configured package source. Runtime is dominated by up to two child-process executions. Side effects include package removal, package installation, and inherited child stdio.
- @param[in] installed {PackageManagerInstalledPackage} Identified installed package source.
- @param[in] targetSource {string} Target pi package source token.
- @param[in] deps {PackageManagerCommandDeps} Optional spawner and logger overrides.
- @return {number} Removal or installation child exit code; `0` on success.
- @note Complexity: dominated by up to two child-process executions.
- @satisfies REQ-614, REQ-616, REQ-617

### fn `function runPackageManagerChildCommand(` (L930-932)
- @brief Runs one package-manager command as a child process with inherited stdio.
- @details Spawns `command[0]` with the remaining tokens, inheriting stdio so npm and pi output streams through unchanged; Windows spawns run through a shell so `npm.cmd` and `pi.cmd` resolve via `PATHEXT`. The child runs with an explicit neutral working directory (the user home), never the caller's cwd, because management installs are routinely invoked from inside a source checkout of the same package being replaced. Spawn failures print the error plus the exact manual command hint on stderr and map to exit code `1`; otherwise the child exit code propagates (`null` status maps to `1`).
- @param[in] command {readonly string[]} Executable plus argument vector.
- @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger overrides.
- @return {number} Child exit code, or `1` when spawning failed.
- @note Complexity: dominated by the child process execution.

### fn `const reportSpawnFailure = (message: string): number =>` (L936-940)

### fn `export async function runPackageManagerVersionCommand(` (L966-968)
- @brief Handles `--ver`/`--version`: dual online probe plus three-line aligned version report.
- @details Runs the npm-registry probe and the GitHub-releases probe concurrently, bypassing every persisted cache, then writes exactly three stdout lines — `Current Installed : <installed>`, `Latest @ NPMjs : <npmjs>`, `Latest @ GitHub : <github>` — with labels right-padded to the fixed 18-character column so `:` separators and version numbers align, and returns `0`. Undeterminable versions print as `unknown`, and a failed GitHub probe carrying a captured upstream failure reason prints `Latest @ GitHub : unknown (<reason>)` reflecting the actual error such as an API rate-limit response.
- @param[in] options {PackageManagerCommandOptions} Options carrying the installed version.
- @param[in] deps {PackageManagerCommandDeps} Optional registry/GitHub/stdout overrides.
- @return {Promise<number>} Exit code `0`.
- @note Complexity: two concurrent HTTP round-trips bounded by the probe timeout.
- @satisfies REQ-473, REQ-475, REQ-476, REQ-502, REQ-529

### fn `function defaultResolveUpgradedPackageManagerVersion(): string` (L994-998)
- @brief Reads the post-upgrade installed version through the pi-managed-first rule.
- @details Re-reads the pi-managed git root, then the pi-managed npm root, and only then the executing installation package manifest bypassing the process cache, so the version written on disk by the pi CLI child is observed instead of the cached pre-upgrade value even when the command runs from a source checkout. Runtime is dominated by one filesystem read. Side effects are limited to the shared executing-installation metadata-cache refresh.
- @return {string} Freshly read reported version; `unknown` when no manifest is readable.
- @satisfies REQ-484, REQ-487, REQ-647

### fn `function resolveUpdatedPackageManagerVersion(` (L1009-1022)
- @brief Resolves the updated package version reported by the upgrade summary.
- @details Prefers the injected post-upgrade resolver for deterministic callers; otherwise reads the version from the supplied post-switch target installation root when one is provided, because the source-switch removal child deletes the installation that owns the running process; otherwise re-reads the pi-managed-first reported version. Trims the result and maps every empty or undeterminable value to `unknown` so the summary never reports a blank version. Never throws.
- @param[in] deps {PackageManagerCommandDeps} Optional resolver override.
- @param[in] installationRoot {string | undefined} Absolute post-switch target installation root. Defaults to the runtime installation path when omitted.
- @return {string} Updated version string; `unknown` when undeterminable.
- @note Complexity: one filesystem read through the default or target-root resolver.
- @satisfies REQ-484

### fn `function reportPackageManagerUpgradeCompletion(` (L1033-1050)
- @brief Reports one successful upgrade child through the completion summary and unchanged-version warning.
- @details Resolves the post-child installed version through the injected resolver, the supplied post-switch target installation root, or the pi-managed-first reported-version reader; writes the `pi-usereq upgrade completed: <starting> -> <updated>` stdout line; and emits one stderr warning for non-forced runs whose resolved version stays resolvable and equal to the starting version, signaling that the reconciliation child completed without changing the managed installation. Post-switch runs pass the target installation root because the removal child already deleted the installation that owned the running process. Runtime is dominated by the selected resolver's filesystem read.
- @param[in] options {PackageManagerCommandOptions} Options carrying the installed starting version and force mode.
- @param[in] deps {PackageManagerCommandDeps} Optional resolver, logger, and stdout overrides.
- @param[in] installationRoot {string | undefined} Absolute post-switch target installation root supplying `<updated>` when no resolver is injected.
- @return {void} No return value.
- @satisfies REQ-484, REQ-531

### fn `function isPackageManagerUpgradeNecessary(status: PackageManagerRegistryProbe["status"]): boolean` (L1059-1061)
- @brief Decides whether the default-channel `--upgrade` flow must proceed after the pre-upgrade probe.
- @details Decision table over `PackageManagerRegistryProbe.status`: `newer` -> `true`; `current` -> `false` because the installed version is already the latest available; `unknown-version` and `error` -> `true` because upgrade necessity is undeterminable and the update path is preserved.
- @param[in] status {PackageManagerRegistryProbe["status"]} Status of the pre-upgrade registry probe.
- @return {boolean} `true` when the package-update child process must run.
- @note Complexity: O(1). Pure; no side effects.

### fn `export async function runPackageManagerUpgradeCommand(` (L1072-1074)
- @brief Handles `--upgrade`: installed-source identification, optional source-switch removal plus installation, force mode, pi-CLI package reinstall, then stdout summary.
- @details Identifies the installed package source before any child process. When the identified source resolves to a different kind than the channel target source, the handler runs `pi remove <identified-source>` followed by `pi install <target-source>`, propagating a non-zero removal or installation exit code without printing a summary; after a successful switch it re-deploys the agent-bin `pi-usereq` launcher onto the channel target installation root and resolves the completion `<updated>` version from that target root, because the removal child already deleted the installation that owned the running process. The develop channel (`--dev`/`--develop`) first resolves `<tag>` through `probeLatestGitHubRelease(...)` and aborts with exit code `1` plus one stderr diagnostic without spawning any child when that probe fails; a successful probe then runs the tag-pinned `buildPackageManagerInstallCommand(buildPackageManagerDevelopSource(<tag>))` (`pi install git:github.com/Ogekuri/PI-useReq@<tag>`) with inherited stdio, because `pi install` rewrites the same-identity `packages` settings entry and resets the existing pi-managed checkout to the resolved tag commit, so the tag is reconciled even when the configured entry is unpinned and `pi update` would only follow the configured upstream. The default npm channel keeps one forced npmjs package-manifest probe bypassing every cache unless `--force` was supplied, where `current` writes the already-latest stdout line carrying the manifest latest version and returns `0` without spawning any child, and every other outcome runs `PACKAGE_UPGRADE_COMMAND` (`pi update npm:pi-usereq`) with inherited stdio so the already-installed managed package advances beyond its saved dependency range. `--force` therefore only skips the default-channel already-latest gate and never appends a pi CLI `--force` token, because that option affects only the pi CLI self-update path and provides no forced-reinstall semantics for extensions. Every same-source successful child repairs the deployed agent-bin `pi-usereq` launcher against the executing installation before reporting completion, because package children rewrite the managed dependency tree and a completed upgrade MUST NOT leave the management CLI dangling behind a stale foreign shim. Every successful child reports completion through `reportPackageManagerUpgradeCompletion(...)`, which resolves `<updated>` through the pi-managed-first installed-version rule, or from the post-switch target installation root after a source switch, and warns when a non-forced run leaves the installed version unchanged.
- @param[in] options {PackageManagerCommandOptions} Options carrying the installed version, channel, and force mode.
- @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger/registry/GitHub/stdout/source-resolver overrides.
- @return {Promise<number>} `0` when the non-forced same-source installed version is already the latest available or after a successful source switch; `1` when the develop-channel release probe fails; otherwise the propagated child exit code.
- @note Complexity: zero to two HTTP round-trips plus at most two child process executions.
- @satisfies REQ-480, REQ-481, REQ-482, REQ-484, REQ-485, REQ-504, REQ-526, REQ-527, REQ-528, REQ-531, REQ-613, REQ-614, REQ-615, REQ-616, REQ-617, REQ-618, REQ-639, REQ-640, REQ-641, REQ-644, REQ-645, REQ-646, DES-026, DES-037

### fn `export function runPackageManagerUninstallCommand(deps: PackageManagerCommandDeps = {}): number` (L1148-1154)
- @brief Handles `--uninstall`: removes the globally installed package plus the deployed agent-bin and user-home bin launcher links.
- @details Best-effort removes the `~/bin/pi-usereq` launcher link first when it resolves to the pi agent bin `pi-usereq` entry (leaving foreign entries untouched), then best-effort removes the `pi-usereq` agent-bin launcher symlink deployed by extension activation when it resolves inside the executing installation, then runs `npm uninstall -g pi-usereq` with inherited stdio and returns the child exit code; every removal failure and spawn failure map deterministically without changing the uninstall exit-code contract, and spawn failures map to exit code `1` with the manual command hint on stderr.
- @param[in] deps {PackageManagerCommandDeps} Optional spawner/logger overrides plus the injectable agent-bin and user-home bin launcher removers.
- @return {number} Child exit code, or `1` when spawning failed.
- @note Complexity: dominated by the child process execution.
- @satisfies REQ-486, REQ-508, REQ-509, REQ-521, REQ-522, REQ-523, DES-031

### iface `interface PackageManagerHelpRow` (L1157-1162)

### fn `function formatPackageManagerHelpRow(row: PackageManagerHelpRow): string` (L1206-1208)
- @brief Formats one management help row as an indented `<token> - <description>` line.
- @details Left-pads the row token to the longest management token width so every description aligns in one column. Runtime is O(n) in description length. Pure; no side effects.
- @param[in] row {PackageManagerHelpRow} Management help row to format.
- @return {string} Formatted help row line prefixed with two leading spaces.

### fn `export function buildPackageManagerHelpScreen(installedVersion: string): string` (L1218-1229)
- @brief Builds the full `--help` screen for one installed version.
- @details Emits the usage header `Usage: pi-usereq [command] [options] (<version>)`, one blank line, the `Management Commands:` heading, and the fixed-order management help rows, each formatted `<token> - <description>`, terminated by one trailing newline. An empty installed version degrades to the `unknown` placeholder.
- @param[in] installedVersion {string} Installed package version rendered inside the usage header parentheses.
- @return {string} Complete multi-line help screen text.
- @note Complexity: O(n) in aggregate row length. Pure; no side effects.
- @satisfies REQ-512, REQ-513

### fn `export function buildPackageManagerHelpTopicText(topic: PackageManagerHelpTopic): string` (L1239-1243)
- @brief Builds the single-row help text for one management topic token.
- @details Maps the `--develop` alias onto the primary `--dev` row and returns only that management help row line with one trailing newline, so `--help <topic>` output stays limited to the requested command.
- @param[in] topic {PackageManagerHelpTopic} Requested management help topic token.
- @return {string} Formatted single help row line, or the empty string when no row matches.
- @note Complexity: O(1) in row count. Pure; no side effects.
- @satisfies REQ-514

### fn `export async function runPackageManagerHelpCommand(` (L1254-1256)
- @brief Handles `--help`: full help screen or single management topic row.
- @details Writes the full help screen to stdout when no topic option is supplied, or only the management help row of the requested topic token when one is supplied, and returns `0`. Executes no network probe and no package-manager child process.
- @param[in] options {PackageManagerCommandOptions} Options carrying the installed version and optional help topic.
- @param[in] deps {PackageManagerCommandDeps} Optional stdout overrides.
- @return {Promise<number>} Exit code `0`.
- @note Complexity: O(1). Pure aside from the delegated stdout write.
- @satisfies REQ-512, REQ-513, REQ-514

### fn `export async function runPackageManagerManagementCommand(` (L1275-1278)
- @brief Dispatches one management command to its handler.
- @details Single dispatch surface for the CLI entry intercept: `--ver`/`--version` routes to `runPackageManagerVersionCommand`, `--upgrade` routes to `runPackageManagerUpgradeCommand` honoring the forwarded channel and force options, `--uninstall` routes to `runPackageManagerUninstallCommand`, and `--help` routes to `runPackageManagerHelpCommand` honoring the forwarded topic option.
- @param[in] command {PackageManagerCommandName} Canonical management command name.
- @param[in] options {PackageManagerCommandOptions} Options carrying the installed version, upgrade channel, and force mode.
- @param[in] deps {PackageManagerCommandDeps} Optional dependency overrides.
- @return {Promise<number>} Handler exit code suitable for `process.exitCode`.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`buildPackageManagerDevelopSource`|fn||68-70|export function buildPackageManagerDevelopSource(tag: str...|
|`PackageManagerCommandName`|type||81||
|`PackageManagerUpgradeChannel`|type||89||
|`PackageManagerInstalledPackage`|iface||96-99|export interface PackageManagerInstalledPackage|
|`PackageManagerHelpTopic`|type||102||
|`PackageManagerLogger`|iface||111-116|export interface PackageManagerLogger|
|`PackageManagerStdout`|iface||119-122|export interface PackageManagerStdout|
|`PackageManagerSpawnResult`|iface||125-130|export interface PackageManagerSpawnResult|
|`PackageManagerSpawnOptions`|iface||133-140|export interface PackageManagerSpawnOptions|
|`PackageManagerSpawn`|type||143||
|`PackageManagerRegistryProbe`|type||150||
|`PackageManagerGitHubProbe`|type||161||
|`PackageManagerRegistryProbeDeps`|iface||166-177|export interface PackageManagerRegistryProbeDeps|
|`PackageManagerGitHubProbeDeps`|iface||180-187|export interface PackageManagerGitHubProbeDeps|
|`PackageManagerCommandOptions`|iface||190-199|export interface PackageManagerCommandOptions|
|`PackageManagerCommandDeps`|iface||202-223|export interface PackageManagerCommandDeps|
|`defaultPackageManagerSpawn`|fn||243-249|const defaultPackageManagerSpawn: PackageManagerSpawn = (...|
|`isNewerPackageManagerVersion`|fn||254-277|export function isNewerPackageManagerVersion(candidate: s...|
|`toSegments`|fn||255-267|const toSegments = (version: string): number[] =>|
|`isParseablePackageManagerVersion`|fn||286-289|function isParseablePackageManagerVersion(version: string...|
|`comparePackageManagerVersionOrder`|fn||299-330|export function comparePackageManagerVersionOrder(left: s...|
|`parse`|fn||300-311|const parse = (version: string): { segments: number[]; pr...|
|`resolveHighestPackageManagerVersion`|fn||340-354|export function resolveHighestPackageManagerVersion(|
|`resolvePackageManagerManifestLatest`|fn||365-382|export function resolvePackageManagerManifestLatest(paylo...|
|`stripPackageManagerReleaseTagPrefix`|fn||391-393|function stripPackageManagerReleaseTagPrefix(tag: string)...|
|`probeLatestRegistryVersion`|fn||404-405|export async function probeLatestRegistryVersion(|
|`resolveGitHubProbeFailureReason`|fn||446-456|async function resolveGitHubProbeFailureReason(response: ...|
|`probeLatestGitHubRelease`|fn||466-467|export async function probeLatestGitHubRelease(|
|`resolveRegistryProbeLatestVersionText`|fn||511-516|function resolveRegistryProbeLatestVersionText(probe: Pac...|
|`resolveGitHubProbeLatestVersionText`|fn||526-534|function resolveGitHubProbeLatestVersionText(probe: Packa...|
|`formatPackageManagerVersionReportLine`|fn||551-553|function formatPackageManagerVersionReportLine(label: str...|
|`parsePackageManagerCommand`|fn||563-598|export function parsePackageManagerCommand(|
|`parsePackageManagerUpgradeChannel`|fn||607-609|export function parsePackageManagerUpgradeChannel(args: r...|
|`parsePackageManagerForceFlag`|fn||619-621|export function parsePackageManagerForceFlag(args: readon...|
|`parsePackageManagerHelpTopic`|fn||631-649|export function parsePackageManagerHelpTopic(|
|`normalizePackageManagerVersionText`|fn||659-662|function normalizePackageManagerVersionText(value: string...|
|`resolvePiManagedPackageManagerVersion`|fn||672-686|export function resolvePiManagedPackageManagerVersion(|
|`resolveReportedPackageManagerVersion`|fn||696-704|function resolveReportedPackageManagerVersion(executingVe...|
|`resolvePackageManagerInstalledVersion`|fn||712-714|export function resolvePackageManagerInstalledVersion(): ...|
|`resolvePiAgentDir`|fn||723-736|function resolvePiAgentDir(homeDirImpl: () => string = ho...|
|`resolvePackageManagerChannelInstallRoot`|fn||747-760|export function resolvePackageManagerChannelInstallRoot(|
|`defaultRepairPackageManagerLauncher`|fn||769-775|function defaultRepairPackageManagerLauncher(): void|
|`readPackageManagerPackageRootVersion`|fn||785-797|function readPackageManagerPackageRootVersion(packageRoot...|
|`resolveInstalledPackageManagerSource`|fn||808-830|export function resolveInstalledPackageManagerSource(|
|`buildPackageManagerRemoveCommand`|fn||840-842|export function buildPackageManagerRemoveCommand(source: ...|
|`buildPackageManagerInstallCommand`|fn||852-854|export function buildPackageManagerInstallCommand(source:...|
|`resolvePackageManagerUpgradeSource`|fn||865-875|export function resolvePackageManagerUpgradeSource(|
|`requiresPackageManagerSourceSwitch`|fn||886-892|export function requiresPackageManagerSourceSwitch(|
|`switchPackageManagerSource`|fn||904-920|function switchPackageManagerSource(|
|`runPackageManagerChildCommand`|fn||930-932|function runPackageManagerChildCommand(|
|`reportSpawnFailure`|fn||936-940|const reportSpawnFailure = (message: string): number =>|
|`runPackageManagerVersionCommand`|fn||966-968|export async function runPackageManagerVersionCommand(|
|`defaultResolveUpgradedPackageManagerVersion`|fn||994-998|function defaultResolveUpgradedPackageManagerVersion(): s...|
|`resolveUpdatedPackageManagerVersion`|fn||1009-1022|function resolveUpdatedPackageManagerVersion(|
|`reportPackageManagerUpgradeCompletion`|fn||1033-1050|function reportPackageManagerUpgradeCompletion(|
|`isPackageManagerUpgradeNecessary`|fn||1059-1061|function isPackageManagerUpgradeNecessary(status: Package...|
|`runPackageManagerUpgradeCommand`|fn||1072-1074|export async function runPackageManagerUpgradeCommand(|
|`runPackageManagerUninstallCommand`|fn||1148-1154|export function runPackageManagerUninstallCommand(deps: P...|
|`PackageManagerHelpRow`|iface||1157-1162|interface PackageManagerHelpRow|
|`formatPackageManagerHelpRow`|fn||1206-1208|function formatPackageManagerHelpRow(row: PackageManagerH...|
|`buildPackageManagerHelpScreen`|fn||1218-1229|export function buildPackageManagerHelpScreen(installedVe...|
|`buildPackageManagerHelpTopicText`|fn||1239-1243|export function buildPackageManagerHelpTopicText(topic: P...|
|`runPackageManagerHelpCommand`|fn||1254-1256|export async function runPackageManagerHelpCommand(|
|`runPackageManagerManagementCommand`|fn||1275-1278|export async function runPackageManagerManagementCommand(|


---

# path-context.ts | TypeScript | 554L | 27 symbols | 5 imports | 35 comments
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

### iface `export interface InstallationPackageMetadata` (L35-38)
- @brief Describes the installation package metadata used by runtime status rendering.
- @details Stores the resolved extension package name and semantic version read from the installation-owned `package.json`. The interface is compile-time only and introduces no runtime side effects.

### iface `export interface RuntimePathState` (L59-67)
- @brief Stores the mutable runtime path state shared across extension callbacks.
- @details Persists the static bootstrap `base-path`, the dynamic `context-path`, the optional repository-derived `git-path`, the derived `parent-path` and `base-dir`, and the optional active worktree facts. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RuntimePathContext extends RuntimePathState` : RuntimePathState (L73-86)
- @brief Describes the absolute runtime path context shared across extension components.
- @details Aggregates the static installation, base, git, parent, and config paths with the dynamic context and optional worktree paths plus execution-resolved docs/tests/source absolute paths. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RuntimePathFacts` (L92-113)
- @brief Describes the prompt/tool-facing runtime paths rendered for display.
- @details Mirrors `RuntimePathContext` in a serialization-oriented shape so downstream agents can consume stable `~`-relative absolute paths and trailing-slash-free relative directories without reparsing platform-specific separators. The interface is compile-time only and introduces no runtime cost.

### fn `export function getInstallationPath(): string` (L128-130)
- @brief Resolves the installed extension root that owns `index.ts` and bundled resources.
- @details Uses the current module location under `src/core` or its installed equivalent, then moves one directory upward so the returned path is the runtime installation root containing `resources/`. Runtime is O(1). No external state is mutated.
- @return {string} Absolute installation path.

### fn `export function getInstallationPackageMetadata(): InstallationPackageMetadata` (L137-142)
- @brief Resolves the installation-owned extension package metadata.
- @details Reads `<installation-path>/../package.json` once per process, caches the parsed `name` and `version`, trims surrounding whitespace, and falls back to deterministic defaults when the manifest is missing, malformed, or incomplete. Runtime is O(n) on the first call in manifest size and O(1) on later calls. Side effects are limited to one filesystem read and module-local cache mutation.
- @return {InstallationPackageMetadata} Cached package name and version used by runtime status rendering.

### fn `function readInstallationPackageMetadataFromDisk(): InstallationPackageMetadata` (L149-172)
- @brief Reads the installation-owned package manifest from disk.
- @details Resolves `<installation-path>/../package.json`, parses the `name` plus `version` fields with surrounding-whitespace trimming, and falls back to `DEFAULT_INSTALLATION_PACKAGE_METADATA` when the manifest is missing, malformed, or incomplete. Runtime is O(n) in manifest size. Side effects are limited to one filesystem read.
- @return {InstallationPackageMetadata} Freshly read package name and version.

### fn `export function refreshInstallationPackageMetadata(): InstallationPackageMetadata` (L180-183)
- @brief Re-reads the installation-owned extension package metadata bypassing the process cache.
- @details Reads `<installation-path>/../package.json` from disk again, replaces the shared module-local cache with the fresh facts, and returns them so callers executing a pre-upgrade module image can observe the version written on disk by an external package-manager child. Runtime is O(n) in manifest size per call. Side effects are limited to one filesystem read and module-local cache mutation.
- @return {InstallationPackageMetadata} Freshly read package name and version.
- @satisfies REQ-484

### fn `export function normalizePathSlashes(value: string): string` (L191-193)
- @brief Formats one path with slash separators.
- @details Rewrites backslashes to `/` without changing semantic path identity so serialized payloads remain stable across operating systems. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Absolute or relative filesystem path.
- @return {string} Slash-normalized path string.

### fn `function trimTrailingSeparatorsPreserveRoot(value: string): string` (L201-215)
- @brief Removes trailing separators while preserving a filesystem root.
- @details Keeps `/`, drive roots, and UNC roots intact while trimming redundant trailing separators from every other absolute or relative path string. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Raw path string.
- @return {string} Trailing-slash-free path string.

### fn `export function normalizeAbsolutePathContract(value: string): string` (L223-225)
- @brief Normalizes one absolute path contract value.
- @details Resolves the supplied value to an absolute path, removes trailing separators except for the filesystem root, and rewrites separators to `/`. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Absolute or relative path candidate.
- @return {string} Canonical trailing-slash-free absolute path.

### fn `export function normalizeRelativeDirContract(value: string): string` (L233-238)
- @brief Normalizes one relative-directory contract value.
- @details Trims whitespace, rewrites separators to `/`, removes a leading `./`, and removes trailing separators so persisted `*-dir` values stay relative and trailing-slash-free. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Relative-directory candidate.
- @return {string} Canonical trailing-slash-free relative-directory string.

### fn `export function getConfigPath(basePath: string): string` (L246-248)
- @brief Computes the absolute local project config path for one base path.
- @details Appends `.pi-usereq.json` to the supplied base path using the canonical repository-local configuration layout. Runtime is O(1). No external state is mutated.
- @param[in] basePath {string} Absolute or relative base path.
- @return {string} Absolute local config-file path.

### fn `export function getGlobalConfigPath(): string` (L255-257)
- @brief Computes the absolute global config path for the current user.
- @details Resolves `~/.config/pi-usereq/config.json` from the current user home directory without consulting project state. Runtime is O(1). No external state is mutated.
- @return {string} Absolute global config-file path.

### fn `export function isSameOrAncestorPath(` (L266-280)
- @brief Tests whether one path is identical to or an ancestor of another path.
- @details Resolves both inputs, computes a relative traversal from the candidate ancestor to the candidate child, and accepts only exact matches or descendant traversals that stay within the ancestor subtree. Runtime is O(p) in path length. No external state is mutated.
- @param[in] ancestorPath {string} Candidate ancestor or identical path.
- @param[in] childPath {string} Candidate child or identical path.
- @return {boolean} `true` when `ancestorPath` equals `childPath` or strictly contains it.

### fn `function deriveStaticRuntimePathState(` (L289-314)
- @brief Derives repository-relative runtime state from one base path and optional git path.
- @details Normalizes `base-path`, keeps `git-path` only when it is identical to or an ancestor of `base-path`, derives `parent-path` from `git-path`, and derives `base-dir` as `base-path` relative to `git-path`. Runtime is O(p) in path length. No external state is mutated.
- @param[in] basePath {string} Static base path candidate.
- @param[in] gitPath {string | undefined} Optional repository-root candidate.
- @return {{ basePath: string; gitPath?: string; parentPath?: string; baseDir: string }} Derived static path facts.

### fn `export function bootstrapRuntimePathState(` (L323-325)
- @brief Bootstraps the shared runtime path state for one extension session or command preflight.
- @details Sets static `base-path`, initializes dynamic `context-path` to the same value, stores derived `git-path`, `parent-path`, and `base-dir`, and clears any prior worktree facts. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
- @param[in] basePath {string} Bootstrap cwd that becomes the static base path.
- @param[in] options {{ gitPath?: string | undefined } | undefined} Optional repository-root override.
- @return {void} No return value.

### fn `export function ensureRuntimePathState(cwd: string): void` (L343-349)
- @brief Ensures the shared runtime path state has at least fallback base and context values.
- @details Lazily bootstraps the module-local state from the supplied cwd only when no prior bootstrap has occurred, preserving any already-established static or dynamic path state. Runtime is O(1). Side effect: may initialize module-local runtime-path state.
- @param[in] cwd {string} Fallback cwd.
- @return {void} No return value.

### fn `export function getRuntimeBasePath(fallbackPath: string): string` (L357-362)
- @brief Returns the current static base path.
- @details Falls back to the supplied path only when the runtime path state has not been bootstrapped yet. Runtime is O(1). No external state is mutated.
- @param[in] fallbackPath {string} Fallback cwd.
- @return {string} Static base path.

### fn `export function getRuntimeContextPath(fallbackPath: string): string` (L370-375)
- @brief Returns the current dynamic context path.
- @details Falls back to the supplied path only when the runtime path state has not been bootstrapped yet. Runtime is O(1). No external state is mutated.
- @param[in] fallbackPath {string} Fallback cwd.
- @return {string} Dynamic context path.

### fn `export function setRuntimeGitPath(gitPath?: string): void` (L383-390)
- @brief Stores the derived git-root facts in the shared runtime path state.
- @details Re-derives `parent-path` and `base-dir` from the stored static `base-path` plus the supplied `git-path`, preserving the existing dynamic context path. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
- @param[in] gitPath {string | undefined} Optional repository-root path.
- @return {void} No return value.

### fn `export function setRuntimeContextPath(contextPath: string): void` (L398-400)
- @brief Stores the current dynamic context path.
- @details Replaces the module-local `context-path` with the supplied trailing-slash-free absolute path. Runtime is O(1). Side effect: mutates module-local runtime-path state.
- @param[in] contextPath {string} Next context path.
- @return {void} No return value.

### fn `export function setRuntimeWorktreePathState(options:` (L408-418)
- @brief Stores the current worktree directory and path facts.
- @details Normalizes the supplied relative `worktree-dir` and absolute `worktree-path` so later prompt rendering and tool execution can reuse the derived values across modules. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
- @param[in] options {{ worktreeDir?: string | undefined; worktreePath?: string | undefined }} Optional active worktree facts.
- @return {void} No return value.

### fn `export function getRuntimePathState(): RuntimePathState` (L425-436)
- @brief Returns a snapshot of the shared runtime path state.
- @details Materializes the current static and dynamic path facts into a read-only copy suitable for prompt rendering, tool execution, and tests. Runtime is O(1). No external state is mutated.
- @return {RuntimePathState} Snapshot of the current runtime path state.

### fn `export function formatRuntimePathForDisplay(absolutePath: string): string` (L444-457)
- @brief Formats one absolute path relative to the user home using `~` when possible.
- @details Returns `~` when the path equals the current home directory and returns `~/...` when the path descends from it; otherwise returns the normalized absolute path unchanged. Runtime is O(p) in path length. No external state is mutated.
- @param[in] absolutePath {string} Absolute or relative path candidate.
- @return {string} Home-relative or trailing-slash-free absolute path.

### fn `export function buildRuntimePathContext(` (L469-478)
- @brief Builds the absolute runtime path context for one base path, context path, and configuration.
- @details Derives static `install-path`, `git-path`, `parent-path`, and `base-dir`, resolves the static `config-path`, preserves the dynamic `context-path`, and resolves docs/tests/source absolute paths against `context-path` so worktree-backed execution uses the active checkout. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] basePath {string} Static base path.
- @param[in] contextPath {string} Dynamic context path.
- @param[in] config {Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">} Effective relative directory configuration.
- @param[in] options {{ installationPath?: string; gitPath?: string | undefined; worktreeDir?: string | undefined; worktreePath?: string | undefined } | undefined} Optional installation, repository, and worktree overrides.
- @return {RuntimePathContext} Absolute runtime path context.
- @satisfies CTN-001

### fn `export function buildRuntimePathFacts(` (L529-554)
- @brief Converts the absolute runtime path context into prompt/tool-facing path facts.
- @details Re-encodes every absolute path with the home-relative formatter while preserving trailing-slash-free relative directories for `base-dir` and `worktree-dir`. Runtime is O(s + p) where s is source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] context {RuntimePathContext} Absolute runtime path context.
- @return {RuntimePathFacts} Display-oriented runtime path facts.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`InstallationPackageMetadata`|iface||35-38|export interface InstallationPackageMetadata|
|`RuntimePathState`|iface||59-67|export interface RuntimePathState|
|`RuntimePathContext`|iface||73-86|export interface RuntimePathContext extends RuntimePathState|
|`RuntimePathFacts`|iface||92-113|export interface RuntimePathFacts|
|`getInstallationPath`|fn||128-130|export function getInstallationPath(): string|
|`getInstallationPackageMetadata`|fn||137-142|export function getInstallationPackageMetadata(): Install...|
|`readInstallationPackageMetadataFromDisk`|fn||149-172|function readInstallationPackageMetadataFromDisk(): Insta...|
|`refreshInstallationPackageMetadata`|fn||180-183|export function refreshInstallationPackageMetadata(): Ins...|
|`normalizePathSlashes`|fn||191-193|export function normalizePathSlashes(value: string): string|
|`trimTrailingSeparatorsPreserveRoot`|fn||201-215|function trimTrailingSeparatorsPreserveRoot(value: string...|
|`normalizeAbsolutePathContract`|fn||223-225|export function normalizeAbsolutePathContract(value: stri...|
|`normalizeRelativeDirContract`|fn||233-238|export function normalizeRelativeDirContract(value: strin...|
|`getConfigPath`|fn||246-248|export function getConfigPath(basePath: string): string|
|`getGlobalConfigPath`|fn||255-257|export function getGlobalConfigPath(): string|
|`isSameOrAncestorPath`|fn||266-280|export function isSameOrAncestorPath(|
|`deriveStaticRuntimePathState`|fn||289-314|function deriveStaticRuntimePathState(|
|`bootstrapRuntimePathState`|fn||323-325|export function bootstrapRuntimePathState(|
|`ensureRuntimePathState`|fn||343-349|export function ensureRuntimePathState(cwd: string): void|
|`getRuntimeBasePath`|fn||357-362|export function getRuntimeBasePath(fallbackPath: string):...|
|`getRuntimeContextPath`|fn||370-375|export function getRuntimeContextPath(fallbackPath: strin...|
|`setRuntimeGitPath`|fn||383-390|export function setRuntimeGitPath(gitPath?: string): void|
|`setRuntimeContextPath`|fn||398-400|export function setRuntimeContextPath(contextPath: string...|
|`setRuntimeWorktreePathState`|fn||408-418|export function setRuntimeWorktreePathState(options:|
|`getRuntimePathState`|fn||425-436|export function getRuntimePathState(): RuntimePathState|
|`formatRuntimePathForDisplay`|fn||444-457|export function formatRuntimePathForDisplay(absolutePath:...|
|`buildRuntimePathContext`|fn||469-478|export function buildRuntimePathContext(|
|`buildRuntimePathFacts`|fn||529-554|export function buildRuntimePathFacts(|


---

# pi-host-version.ts | TypeScript | 203L | 11 symbols | 0 imports | 18 comments
> Path: `src/core/pi-host-version.ts`
- @brief Probes the installed pi CLI host version for extension compatibility reporting.
- @details Resolves the pi CLI host version at extension bootstrap through the `VERSION` export of `@earendil-works/pi-coding-agent`, stores the resolved fact in a process-scoped store so session rebinds reuse one probe per host process, compares the resolved version against the minimum supported pi CLI release, and yields a once-per-process warning payload consumed by `session_start` handling. The probe is best-effort: an unresolvable module or `VERSION` export records `resolved=false` and never warns, so the extension remains fully functional on pi CLI releases older than the supported minimum. Runtime is O(1) per operation plus one deferred module resolution. Side effects include one dynamic module import and process-scoped store mutation.

## Definitions

### iface `export interface PiHostVersionProbeState` (L17-28)
- @brief Describes the process-scoped pi CLI host version probe state.
- @details Tracks probe scheduling, the in-flight probe promise, the resolved version fact, and whether the compatibility warning was already delivered so the warning fires at most once per host process. The interface is compile-time only and introduces no runtime cost.

### iface `interface ProcessScopedPiHostVersionStore` (L34-36)
- @brief Describes the process-scoped pi host version store persisted across extension rebinds.
- @details Lives on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists, so the probe executes once per process and the warning cannot repeat across session rebinds. The interface is compile-time only and introduces no runtime cost.

### fn `function getProcessScopedPiHostVersionStore(): ProcessScopedPiHostVersionStore` (L43-62)
- @brief Returns the process-scoped pi host version probe store.
- @details Lazily initializes one `globalThis` record so session rebinds reuse the already scheduled probe and never re-deliver the warning. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedPiHostVersionStore} Mutable process-scoped probe store.

### fn `function parsePiHostSemanticVersion(value: string): [number, number, number] | undefined` (L70-86)
- @brief Parses one version string into its leading numeric semantic triple.
- @details Splits the input on dot separators, parses at most three leading integer components while ignoring pre-release suffixes and build metadata, and returns `undefined` when the first component is not a non-negative integer. Missing trailing components default to `0`. Runtime is O(n) in version length. No external state is mutated.
- @param[in] value {string} Candidate version string such as `1.5.2` or `1.5.2-beta.1`.
- @return {[number, number, number] | undefined} `[major, minor, patch]` triple, or `undefined` when the version carries no numeric leading component.

### fn `export function comparePiHostVersions(left: string, right: string): number` (L95-107)
- @brief Compares two version strings using numeric semantic-triple ordering.
- @details Parses both inputs with `parsePiHostSemanticVersion(...)` and compares major, minor, and patch components numerically; unparseable inputs compare as `-1` so callers can treat them as unresolvable. Runtime is O(n) in combined version length. No external state is mutated.
- @param[in] left {string} Left-hand version string.
- @param[in] right {string} Right-hand version string.
- @return {number} `-1` when `left` sorts before `right`, `1` when it sorts after, `0` when equal or both unparseable.

### fn `export function resolvePiHostVersionFromModule(piHostModule: unknown): string | undefined` (L115-121)
- @brief Extracts the pi CLI host version from one resolved pi-coding-agent module namespace.
- @details Accepts the dynamically imported module namespace or virtual-module binding, validates that `VERSION` is a non-empty string, and returns `undefined` for every other shape so degraded hosts record an unresolvable probe instead of throwing. Runtime is O(1). No external state is mutated.
- @param[in] piHostModule {unknown} Module namespace produced by importing `@earendil-works/pi-coding-agent`.
- @return {string | undefined} Detected pi CLI host version string, or `undefined` when the module exposes no usable `VERSION` export.

### fn `async function loadPiHostVersionModule(): Promise<unknown>` (L128-130)
- @brief Loads the pi CLI host module namespace for version probing.
- @details Dynamically imports `@earendil-works/pi-coding-agent` so the import resolves through the pi extension-loader alias in interactive hosts and through normal Node resolution in offline harnesses, keeping the probe decoupled from static import-time failures on hosts without the export. Runtime is dominated by module resolution. Side effects include one module load.
- @return {Promise<unknown>} Resolved module namespace promise.

### fn `export function getPiHostVersionProbeState(): PiHostVersionProbeState` (L137-140)
- @brief Returns a snapshot of the current pi host version probe state.
- @details Copies the process-scoped probe facts into one detached object so callers can inspect scheduling, resolution, and warning-delivery state without mutating the store. Runtime is O(1). No external state is mutated.
- @return {PiHostVersionProbeState} Detached snapshot of the current probe state.

### fn `export function schedulePiHostVersionProbe(): void` (L148-165)
- @brief Schedules the once-per-process pi CLI host version probe.
- @details Records the in-flight probe promise in the process-scoped store, extracts the `VERSION` export on settle, and records the resolved fact without throwing so bootstrap never fails because of the probe. Repeated invocations reuse the already scheduled probe. Runtime is O(1) for scheduling plus one deferred module resolution. Side effects include one dynamic module import and process-scoped store mutation.
- @return {void} No return value.
- @satisfies REQ-456

### fn `export function buildPiHostVersionWarningMessage(detectedVersion: string): string` (L173-178)
- @brief Builds the deterministic pi CLI host compatibility warning message.
- @details Names the detected version, the minimum supported version, and the non-blocking behavior of the extension so the warning is actionable without terminating the session. Runtime is O(n) in version length. No external state is mutated.
- @param[in] detectedVersion {string} Resolved pi CLI host version below the supported minimum.
- @return {string} Single warning message delivered through the UI notification channel.

### fn `export async function consumePiHostVersionWarningForSessionStart(): Promise<string | undefined>` (L186-203)
- @brief Consumes the below-minimum pi CLI host version warning for one `session_start`.
- @details Awaits the scheduled probe when still in flight while degrading probe failures to an unresolvable result, returns the deterministic warning message at most once per host process when the resolved version sorts below `MINIMUM_SUPPORTED_PI_HOST_VERSION`, and returns `undefined` for supported versions, unresolvable probes, and repeat deliveries. Runtime is O(1) after probe settlement. Side effect: marks the warning as delivered in the process-scoped store when a warning is returned.
- @return {Promise<string | undefined>} Warning message when the resolved pi CLI host version is below the supported minimum and not yet reported; otherwise `undefined`.
- @satisfies REQ-457, REQ-458

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiHostVersionProbeState`|iface||17-28|export interface PiHostVersionProbeState|
|`ProcessScopedPiHostVersionStore`|iface||34-36|interface ProcessScopedPiHostVersionStore|
|`getProcessScopedPiHostVersionStore`|fn||43-62|function getProcessScopedPiHostVersionStore(): ProcessSco...|
|`parsePiHostSemanticVersion`|fn||70-86|function parsePiHostSemanticVersion(value: string): [numb...|
|`comparePiHostVersions`|fn||95-107|export function comparePiHostVersions(left: string, right...|
|`resolvePiHostVersionFromModule`|fn||115-121|export function resolvePiHostVersionFromModule(piHostModu...|
|`loadPiHostVersionModule`|fn||128-130|async function loadPiHostVersionModule(): Promise<unknown>|
|`getPiHostVersionProbeState`|fn||137-140|export function getPiHostVersionProbeState(): PiHostVersi...|
|`schedulePiHostVersionProbe`|fn||148-165|export function schedulePiHostVersionProbe(): void|
|`buildPiHostVersionWarningMessage`|fn||173-178|export function buildPiHostVersionWarningMessage(detected...|
|`consumePiHostVersionWarningForSessionStart`|fn||186-203|export async function consumePiHostVersionWarningForSessi...|


---

# pi-notify.ts | TypeScript | 1026L | 48 symbols | 7 imports | 68 comments
> Path: `src/core/pi-notify.ts`
- @brief Implements pi-usereq command-notify, sound, and Pushover prompt-end helpers.
- @details Centralizes configuration defaults, status serialization, prompt-end outcome classification, placeholder substitution, detached shell-command execution, and native Pushover delivery. Runtime is O(m + c + b) in `agent_end` message count plus command length and Pushover payload size. Side effects include detached child-process spawning and outbound HTTPS requests.

## Imports
```
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as https from "node:https";
import type { AgentEndEvent } from "@earendil-works/pi-coding-agent";
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
### fn `export function upgradeLegacyPiNotifyPushoverText(value: string): string` (L117-119)
- @brief Upgrades one Pushover text template away from every superseded legacy default.
- @details Returns the current result-plus-output default when the supplied persisted template exactly equals one of the superseded legacy defaults, and returns every distinct user-configured template unchanged so REQ-186 template honoring stays intact. Runtime is O(n) in template length for the membership probe. No external state is mutated.
- @param[in] value {string} Normalized persisted `notify-pushover-text` payload.
- @return {string} Upgraded template when a superseded legacy default is detected; otherwise the input unchanged.
- @satisfies REQ-451, REQ-452

- type `export type PiNotifyPushoverPriority = (typeof PI_NOTIFY_PUSHOVER_PRIORITIES)[number];` (L152)
- @brief Represents one supported Pushover priority value.
- @details Narrows Pushover configuration parsing and request serialization to the canonical `0|1` priority domain. Compile-time only and introduces no runtime cost.
### iface `export interface PiNotifyEventRequest` (L158-165)
- @brief Describes one prompt-end request used for command-notify and Pushover substitution.
- @details Stores the prompt command name, raw prompt arguments, runtime base path, final prompt duration, and optional final agent output required to resolve runtime placeholders. `agentOutput` stays optional so non-agentic command callers and offline replays omit it and `%%OUTPUT%%` degrades to the empty string per REQ-444. The interface is compile-time only and introduces no runtime cost.

- type `export type PiNotifyConfigFields = Pick<` (L171)
- @brief Describes the configuration fields consumed by pi-notify helpers.
- @details Narrows the full project config to the notify, sound, and Pushover fields used by status rendering and prompt-end routing. Callers may override `notify-sound` with the active runtime sound level before dispatch. Compile-time only and introduces no runtime cost.
- type `type PiNotifySpawn = typeof spawn;` (L201)
- @brief Describes the shell-spawn callback used by prompt-end command dispatch.
- @details Narrows the injected spawn surface so deterministic tests can capture detached shell invocations without patching global module state externally. Compile-time only and introduces no runtime cost.
### fn `export function normalizePiNotifySoundLevel(value: unknown): PiNotifySoundLevel` (L222-226)
- @brief Normalizes one persisted sound level.
- @details Accepts only canonical `none|low|mid|high` values and falls back to `none` for missing or invalid payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Raw persisted sound-level payload.
- @return {PiNotifySoundLevel} Canonical sound level.
- @satisfies REQ-131

### fn `export function normalizePiNotifyShortcut(value: unknown): string` (L235-239)
- @brief Normalizes one persisted sound toggle shortcut.
- @details Accepts any non-empty string so project config can carry raw pi shortcut syntax and falls back to the canonical default when the payload is empty or invalid. Runtime is O(n) in shortcut length. No external state is mutated.
- @param[in] value {unknown} Raw persisted shortcut payload.
- @return {string} Canonical non-empty shortcut string.
- @satisfies REQ-134

### fn `export function normalizePiNotifyCommand(value: unknown, fallback: string): string` (L249-251)
- @brief Normalizes one persisted shell-command string.
- @details Accepts any non-empty string so project config can override bundled command templates verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in command length. No external state is mutated.
- @param[in] value {unknown} Raw persisted command payload.
- @param[in] fallback {string} Canonical fallback command.
- @return {string} Canonical non-empty command string.
- @satisfies REQ-133, REQ-175

### fn `export function normalizePiNotifyTemplateValue(value: unknown, fallback: string): string` (L261-263)
- @brief Normalizes one persisted template string.
- @details Accepts any non-empty string so Pushover title and text templates can be user-configured verbatim, preserves internal and edge control characters, and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in template length. No external state is mutated.
- @param[in] value {unknown} Raw persisted template payload.
- @param[in] fallback {string} Canonical fallback template.
- @return {string} Canonical non-empty template string.
- @satisfies REQ-185, REQ-235

### fn `export function formatPiNotifyControlSequenceText(value: string): string` (L272-306)
- @brief Formats control characters for single-line menu rendering.
- @details Rewrites supported control bytes into escaped display sequences so configuration rows can render `Pushover text` inside a one-line settings list without executing the embedded control effects. Runtime is O(n) in text length. No external state is mutated.
- @param[in] value {string} Raw template text.
- @return {string} Escaped single-line display text.
- @satisfies REQ-235

### fn `export function parsePiNotifyControlSequenceText(value: string): string` (L315-360)
- @brief Decodes supported escaped control sequences from one menu input string.
- @details Converts the documented `\n`, `\r`, `\t`, `\\`, `\0`, `\b`, `\f`, and `\v` escape sequences into their raw byte forms while preserving unknown escapes verbatim so user-entered text is not lossy. Runtime is O(n) in text length. No external state is mutated.
- @param[in] value {string} Escaped menu input text.
- @return {string} Decoded raw template text.
- @satisfies REQ-235

### fn `export function hasPiNotifyPushoverCredentials(` (L369-374)
- @brief Tests whether both persisted Pushover credentials are non-empty.
- @details Performs exact empty-string checks against the normalized user and token fields so UI locking, config persistence, and prompt-end delivery can share one readiness rule. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-pushover-user-key" | "notify-pushover-api-token">} Effective Pushover credential subset.
- @return {boolean} `true` when both Pushover credential fields are non-empty.
- @satisfies REQ-168, REQ-234

### fn `export function normalizePiNotifyPushoverCredential(value: unknown): string` (L383-385)
- @brief Normalizes one persisted Pushover credential string.
- @details Accepts any trimmed string so the project config can store raw Pushover user and token values verbatim and falls back to the empty string for missing or invalid payloads. Runtime is O(n) in credential length. No external state is mutated.
- @param[in] value {unknown} Raw persisted credential payload.
- @return {string} Canonical credential string.
- @satisfies REQ-163

### fn `export function normalizePiNotifyPushoverPriority(value: unknown): PiNotifyPushoverPriority` (L394-396)
- @brief Normalizes one persisted Pushover priority value.
- @details Accepts only canonical `0` and `1` values, treating numeric-string `"1"` as high priority and every other payload as normal priority. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Raw persisted priority payload.
- @return {PiNotifyPushoverPriority} Canonical priority value.
- @satisfies REQ-172

### fn `export function formatPiNotifyStatus(config: Pick<UseReqConfig, "notify-enabled">): string` (L405-407)
- @brief Formats the global command-notify flag for UI value rendering.
- @details Serializes only the persisted global command-notify enable state so configuration menus and summaries can report `on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-enabled">} Effective command-notify configuration subset.
- @return {string} `on` when command-notify is globally enabled; otherwise `off`.
- @satisfies REQ-196

### fn `export function formatPiNotifyPushoverStatus(config: Pick<UseReqConfig, "notify-pushover-enabled">): string` (L416-418)
- @brief Formats the global Pushover flag for UI value rendering.
- @details Serializes only the persisted global Pushover enable state so configuration menus and summaries can report `on|off` independently from per-event toggles. Runtime is O(1). No external state is mutated.
- @param[in] config {Pick<UseReqConfig, "notify-pushover-enabled">} Effective Pushover configuration subset.
- @return {string} `on` when Pushover is globally enabled; otherwise `off`.
- @satisfies REQ-163

### fn `export function cyclePiNotifySoundLevel(currentLevel: PiNotifySoundLevel): PiNotifySoundLevel` (L427-433)
- @brief Cycles one sound level through the canonical shortcut order.
- @details Advances the active runtime sound state in the exact order `none -> low -> mid -> high -> none`, enabling deterministic shortcut toggling without mutating persisted boot configuration. Runtime is O(1). No external state is mutated.
- @param[in] currentLevel {PiNotifySoundLevel} Current active runtime sound level.
- @return {PiNotifySoundLevel} Next runtime sound level in the cycle.
- @satisfies REQ-286

### fn `function isPiNotifyOutcomeEnabled(` (L444-458)
- @brief Tests whether one outcome-specific toggle is enabled.
- @details Reuses the canonical completed/interrupted/failed routing order shared by notify, sound, and Pushover event toggles. Runtime is O(1). No external state is mutated.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] completedEnabled {boolean} Enabled state for completed prompt termination.
- @param[in] interruptedEnabled {boolean} Enabled state for interrupted prompt termination.
- @param[in] failedEnabled {boolean} Enabled state for failed prompt termination.
- @return {boolean} `true` when the selected outcome flag is enabled.

### fn `function hasAgentEndStopReason(` (L467-477)
- @brief Detects whether one agent-end payload contains the requested stop reason.
- @details Scans assistant messages only so prompt-end classification remains stable even when user or tool-result messages also appear in the payload. Runtime is O(m) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Agent-end message list.
- @param[in] stopReason {"aborted" | "error"} Stop reason to detect.
- @return {boolean} `true` when an assistant message carries the requested stop reason.

### fn `export function classifyPiNotifyOutcome(event: Pick<AgentEndEvent, "messages">): PiNotifyOutcome` (L485-493)
- @brief Classifies one agent-end payload into the canonical pi-notify outcome.
- @details Treats assistant `stopReason=error` as `failed`, `stopReason=aborted` as `interrupted`, and every remaining terminal state as `completed`. Runtime is O(m) in message count. No external state is mutated.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @return {PiNotifyOutcome} Canonical prompt-end outcome.

### fn `function formatPiNotifyDuration(durationMs: number): string` (L502-507)
- @brief Formats one prompt-end duration for runtime placeholders.
- @details Floors the supplied duration to whole seconds, keeps minutes unbounded above 59, and zero-pads seconds to two digits so `%%TIME%%` aligns with status-bar elapsed formatting. Runtime is O(1). No external state is mutated.
- @param[in] durationMs {number} Prompt-end duration in milliseconds.
- @return {string} Duration rendered as `M:SS`.
- @satisfies REQ-187

### fn `function formatPiNotifyBasePath(basePath: string): string` (L516-527)
- @brief Formats one runtime base path for placeholder substitution.
- @details Emits `~` or `~/...` when the supplied path equals or descends from the current user home directory; otherwise emits the slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
- @param[in] basePath {string} Runtime base path.
- @return {string} Placeholder-ready base path string.
- @satisfies REQ-187

### fn `function formatPiNotifyResult(outcome: PiNotifyOutcome): string` (L536-545)
- @brief Formats one prompt-end outcome for `%%RESULT%%` substitution.
- @details Maps canonical prompt-end outcomes to the persisted human-readable result tokens reused by default notify-command and Pushover templates. Runtime is O(1). No external state is mutated.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {string} `successed`, `aborted`, or `failed`.
- @satisfies REQ-169, REQ-186, REQ-199

### fn `function resolvePiNotifyPushoverAgentOutput(` (L555-571)
- @brief Resolves the Pushover-channel agent-output value for one prompt-end request.
- @details Returns the raw agent output unchanged for interrupted and failed outcomes, for empty outputs, and for completed outputs without the summary heading; for completed prompt-end outcomes containing `## **Summary**`, returns the trimmed text after that heading through the first subsequent `## **Outcome**` heading, or through the output end when no subsequent outcome heading exists, so no text outside the summary section is substituted into Pushover title or message fields. The `PI_NOTIFY_CMD` shell path never consumes this resolver and keeps the full raw output. Runtime is O(n) in output length for the marker scans. No external state is mutated.
- @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata; `undefined` yields the empty string.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {string} Pushover-channel `%%OUTPUT%%` value within the documented extraction contract.
- @satisfies REQ-469, REQ-470, REQ-471, REQ-472, REQ-510

### fn `function buildPiNotifyRuntimeTemplateValues(` (L581-593)
- @brief Builds the raw runtime placeholder map for one prompt-end request.
- @details Resolves every placeholder value exactly once so notify-command and Pushover template substitution reuse the same prompt name, base path, elapsed time, argument string, final agent output, and terminal outcome token. Runtime is O(p) in path length. No external state is mutated.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {{ "%%PROMT%%": string; "%%BASE%%": string; "%%TIME%%": string; "%%ARGS%%": string; "%%OUTPUT%%": string; "%%RESULT%%": string }} Raw placeholder-value map.
- @satisfies REQ-169, REQ-186, REQ-443, REQ-444

### fn `function quotePiNotifyInstallPath(installationPath: string): string` (L601-606)
- @brief Quotes one installation path for shell substitution.
- @details Emits POSIX single-quoted literals for `sh -lc` execution and CMD double-quoted literals for `cmd.exe /c` execution so `%%INSTALLATION_PATH%%` substitutions preserve whitespace safely. Runtime is O(n) in path length. No external state is mutated.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Shell-quoted installation path fragment.

### fn `function escapePiNotifyShellTemplateValue(value: string): string` (L614-623)
- @brief Escapes one placeholder value for double-quoted shell insertion.
- @details Escapes the characters interpreted specially by POSIX or CMD double-quoted strings so default notify-command templates remain safe when placeholders are embedded inside double quotes. Runtime is O(n) in value length. No external state is mutated.
- @param[in] value {string} Raw placeholder value.
- @return {string} Shell-escaped placeholder fragment without surrounding quotes.

### fn `export function substitutePiNotifyInstallPath(command: string, installationPath: string): string` (L633-638)
- @brief Substitutes `%%INSTALLATION_PATH%%` inside one shell command.
- @details Replaces every `%%INSTALLATION_PATH%%` token with a shell-quoted runtime installation path so bundled assets can be addressed safely from external commands. Runtime is O(n) in command length. No external state is mutated.
- @param[in] command {string} Raw configured shell command.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Runtime-ready command string.
- @satisfies REQ-169

### fn `function substitutePiNotifyShellTemplate(` (L650-662)
- @brief Substitutes runtime placeholders inside one shell-command template.
- @details Applies shell-quoted installation-path substitution plus shell-escaped prompt, base-path, elapsed-time, raw-argument, final-output, and outcome-result substitution expected by `PI_NOTIFY_CMD`. Runtime is O(n) in template length. No external state is mutated.
- @param[in] template {string} Raw shell-command template.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Runtime-ready shell command.
- @satisfies REQ-169, REQ-199, REQ-443, REQ-444

### fn `function substitutePiNotifyTextTemplate(` (L674-689)
- @brief Substitutes runtime placeholders inside one text template.
- @details Applies raw prompt name, home-relative base path, elapsed time, raw prompt arguments, terminal outcome text, and the effective `%%OUTPUT%%` value without shell escaping so Pushover payloads preserve literal text; the optional `outputText` override replaces the raw agent output so the Pushover channel can substitute the summary-section slice while `PI_NOTIFY_CMD` keeps the full output. Runtime is O(n) in template length. No external state is mutated.
- @param[in] template {string} Raw text template.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] outputText {string | undefined} Optional Pushover-channel `%%OUTPUT%%` override resolved by `resolvePiNotifyPushoverAgentOutput`; `undefined` substitutes the raw agent output.
- @return {string} Placeholder-resolved text string.
- @satisfies REQ-186, REQ-187, REQ-199, REQ-443, REQ-444, REQ-471

### fn `function runPiNotifyShellCommand(command: string): void` (L697-708)
- @brief Executes one detached shell command without waiting for completion.
- @details Uses the platform-default shell contract already employed by sound-command execution and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] command {string} Runtime-ready shell command.
- @return {void} No return value.

### fn `function shouldRunPiNotifyCommand(` (L719-732)
- @brief Determines whether one prompt-end outcome should trigger command-notify.
- @details Requires a prompt-end request, the global command-notify enable flag, and the corresponding per-event notify toggle. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
- @return {boolean} `true` when command-notify prerequisites are satisfied.
- @satisfies REQ-174, REQ-176

### fn `function runPiNotifyCommand(` (L743-756)
- @brief Executes the configured command-notify shell command.
- @details Resolves the runtime installation path, substitutes runtime placeholders into `PI_NOTIFY_CMD`, and spawns the resulting command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {void} No return value.
- @satisfies REQ-169, REQ-175, REQ-176, REQ-199

### fn `function resolvePiNotifySoundCommand(` (L765-777)
- @brief Resolves the configured command for one non-`none` sound level.
- @details Selects the matching persisted command string from config without performing runtime substitution or shell execution. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Non-disabled sound level.
- @return {string} Configured command string for the requested level.

### fn `function shouldRunPiNotifySound(` (L787-798)
- @brief Determines whether one prompt-end outcome should trigger sound-command execution.
- @details Requires a non-`none` sound level and the corresponding per-event sound toggle. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @return {boolean} `true` when sound-command prerequisites are satisfied.
- @satisfies REQ-178

### fn `export function runPiNotifySoundCommand(` (L808-815)
- @brief Executes the configured sound command on an external shell.
- @details Resolves the runtime installation path, substitutes `%%INSTALLATION_PATH%%`, and spawns the configured command without waiting for completion. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Requested non-disabled sound level.
- @return {void} No return value.
- @satisfies REQ-132, REQ-133

### fn `function shouldRunPiNotifyPushover(` (L826-840)
- @brief Determines whether one prompt-end outcome should trigger Pushover delivery.
- @details Requires a prompt-end request, the global Pushover enable flag, the corresponding per-event Pushover toggle, and non-empty user plus token credentials. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest | undefined} Prompt-end request metadata.
- @return {boolean} `true` when Pushover delivery prerequisites are satisfied.
- @satisfies REQ-166, REQ-168, REQ-184

### fn `function buildPiNotifyPushoverTitle(` (L851-865)
- @brief Builds the Pushover notification title for one prompt-end request.
- @details Resolves the configured `notify-pushover-title` template with raw runtime placeholder substitution so the pushed title remains configurable and deterministic, overrides `%%OUTPUT%%` with the summary-section slice resolved by `resolvePiNotifyPushoverAgentOutput` so completed prompt-end outcomes never push out-of-section agent output, then head-truncates over-limit titles to the Pushover Message API `title` limit. Runtime is O(n) in template length. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {string} Pushover title string within the 250-character API limit.
- @satisfies REQ-185, REQ-186, REQ-187, REQ-199, REQ-453, REQ-469, REQ-470, REQ-471, REQ-472, REQ-510

### fn `function truncatePiNotifyPushoverText(text: string, limit: number): string` (L875-881)
- @brief Head-truncates one substituted Pushover field value to one Pushover Message API limit.
- @details Returns the text unchanged when it fits the supplied limit and otherwise keeps the head characters that leave room for `PI_NOTIFY_PUSHOVER_TRUNCATION_MARKER` so over-limit field values stay deterministic and provider-acceptable. Runtime is O(1). No external state is mutated.
- @param[in] text {string} Fully substituted Pushover field text.
- @param[in] limit {number} Pushover Message API character limit for the targeted field.
- @return {string} Text within the supplied Pushover field character limit.
- @satisfies REQ-445, REQ-453

### fn `function buildPiNotifyPushoverBody(` (L892-907)
- @brief Builds the Pushover message body for one prompt-end request.
- @details Resolves the configured `notify-pushover-text` template with raw runtime placeholder substitution, overrides `%%OUTPUT%%` with the summary-section slice resolved by `resolvePiNotifyPushoverAgentOutput` so completed prompt-end outcomes never push out-of-section agent output, falls back to the terminal outcome token when the fully substituted body resolves empty so Pushover delivery never targets an empty `message` field, then head-truncates over-limit bodies to the Pushover Message API `message` limit. Runtime is O(n) in template length. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {string} Pushover message body within the 1024-character API limit.
- @satisfies REQ-185, REQ-186, REQ-187, REQ-199, REQ-443, REQ-444, REQ-445, REQ-450, REQ-469, REQ-470, REQ-471, REQ-472, REQ-510

### fn `function buildPiNotifyPushoverPayload(` (L918-930)
- @brief Builds the Pushover API payload for one prompt-end request.
- @details Encodes exactly the configured token, user key, substituted title, priority, and substituted text as `application/x-www-form-urlencoded` fields accepted by the Pushover Message API; no `url` or `url_title` request field is ever emitted, so the 512-character `url` and 100-character `url_title` API limits cannot be violated. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {URLSearchParams} Encoded Pushover request payload.
- @satisfies REQ-167, REQ-172, REQ-185, REQ-186, REQ-199, REQ-443, REQ-444, REQ-445, REQ-453, REQ-454, REQ-455, REQ-469, REQ-471

### fn `function runPiNotifyPushoverRequest(` (L941-960)
- @brief Dispatches one native HTTPS request to the Pushover Message API.
- @details Serializes the request body as URL-encoded form data, posts it to `https://api.pushover.net/1/messages.json`, drains the response, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by outbound I/O. Side effects include one HTTPS request.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Classified prompt-end outcome.
- @param[in] request {PiNotifyEventRequest} Prompt-end request metadata.
- @return {void} No return value.
- @satisfies REQ-167, REQ-199

### fn `export function setPiNotifyHttpsRequestForTests(requestImpl: typeof https.request | undefined): void` (L968-970)
- @brief Replaces the native HTTPS request function used for Pushover delivery in deterministic tests.
- @details Accepts a drop-in `node:https.request` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local Pushover transport hook.
- @param[in] requestImpl {typeof https.request | undefined} Replacement HTTPS request function.
- @return {void} No return value.

### fn `export function setPiNotifySpawnForTests(spawnImpl: PiNotifySpawn | undefined): void` (L978-980)
- @brief Replaces the shell-spawn function used for notify and sound commands in deterministic tests.
- @details Accepts a drop-in `node:child_process.spawn` replacement and restores the native implementation when `undefined` is supplied. Runtime is O(1). Side effect: mutates the module-local shell transport hook.
- @param[in] spawnImpl {PiNotifySpawn | undefined} Replacement shell-spawn function.
- @return {void} No return value.

### fn `export function runPiNotifyEffects(` (L991-997)
- @brief Dispatches prompt-end notify, sound, and Pushover effects for one agent-end payload.
- @details Classifies the terminal outcome from the `agent_end` payload and delegates to `runPiNotifyEffectsForOutcome(...)`; `%%OUTPUT%%` resolves from the caller-supplied final agent output with Pushover title and body channels overriding it through the completed-outcome `## **Summary**` section extraction while `PI_NOTIFY_CMD` keeps the full output, and Pushover bodies and titles are head-truncated to the provider message and title limits. Runtime is O(m + c + b) in message count, command length, and Pushover payload size. Side effects include child-process spawning and outbound HTTPS requests.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @param[in] request {PiNotifyEventRequest | undefined} Optional prompt-end request metadata used for command-notify and Pushover substitution.
- @return {void} No return value.
- @satisfies REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187, REQ-199, REQ-443, REQ-444, REQ-445, REQ-453, REQ-469, REQ-470, REQ-471, REQ-510

### fn `export function runPiNotifyEffectsForOutcome(` (L1008-1026)
- @brief Dispatches prompt-end notify, sound, and Pushover effects for one explicit prompt-end outcome.
- @details Executes `PI_NOTIFY_CMD` when command-notify prerequisites are satisfied, executes the configured sound command when sound prerequisites are satisfied, and dispatches the native Pushover request when Pushover prerequisites are satisfied; `%%OUTPUT%%` resolves from the caller-supplied final agent output, completed prompt-end outcomes override the Pushover title and body `%%OUTPUT%%` with the `## **Summary**` section slice while `PI_NOTIFY_CMD` and interrupted or failed outcomes keep the full output, and Pushover bodies and titles head-truncate to the provider message and title limits with an outcome-token fallback for empty bodies. Agentic callers classify the outcome from the `agent_end` payload through `runPiNotifyEffects(...)`; non-agentic `req-references` and `req-reset` runs never invoke this helper per REQ-447. Runtime is O(c + b) in command length and Pushover payload size. Side effects include child-process spawning and outbound HTTPS requests.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] outcome {PiNotifyOutcome} Explicit prompt-end outcome.
- @param[in] request {PiNotifyEventRequest | undefined} Optional prompt-end request metadata used for command-notify and Pushover substitution.
- @return {void} No return value.
- @satisfies REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187, REQ-199, REQ-443, REQ-444, REQ-445, REQ-450, REQ-453, REQ-469, REQ-470, REQ-471, REQ-472, REQ-510

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiNotifySoundLevel`|type||25||
|`PiNotifyOutcome`|type||37||
|`upgradeLegacyPiNotifyPushoverText`|fn||117-119|export function upgradeLegacyPiNotifyPushoverText(value: ...|
|`PiNotifyPushoverPriority`|type||152||
|`PiNotifyEventRequest`|iface||158-165|export interface PiNotifyEventRequest|
|`PiNotifyConfigFields`|type||171||
|`PiNotifySpawn`|type||201||
|`normalizePiNotifySoundLevel`|fn||222-226|export function normalizePiNotifySoundLevel(value: unknow...|
|`normalizePiNotifyShortcut`|fn||235-239|export function normalizePiNotifyShortcut(value: unknown)...|
|`normalizePiNotifyCommand`|fn||249-251|export function normalizePiNotifyCommand(value: unknown, ...|
|`normalizePiNotifyTemplateValue`|fn||261-263|export function normalizePiNotifyTemplateValue(value: unk...|
|`formatPiNotifyControlSequenceText`|fn||272-306|export function formatPiNotifyControlSequenceText(value: ...|
|`parsePiNotifyControlSequenceText`|fn||315-360|export function parsePiNotifyControlSequenceText(value: s...|
|`hasPiNotifyPushoverCredentials`|fn||369-374|export function hasPiNotifyPushoverCredentials(|
|`normalizePiNotifyPushoverCredential`|fn||383-385|export function normalizePiNotifyPushoverCredential(value...|
|`normalizePiNotifyPushoverPriority`|fn||394-396|export function normalizePiNotifyPushoverPriority(value: ...|
|`formatPiNotifyStatus`|fn||405-407|export function formatPiNotifyStatus(config: Pick<UseReqC...|
|`formatPiNotifyPushoverStatus`|fn||416-418|export function formatPiNotifyPushoverStatus(config: Pick...|
|`cyclePiNotifySoundLevel`|fn||427-433|export function cyclePiNotifySoundLevel(currentLevel: PiN...|
|`isPiNotifyOutcomeEnabled`|fn||444-458|function isPiNotifyOutcomeEnabled(|
|`hasAgentEndStopReason`|fn||467-477|function hasAgentEndStopReason(|
|`classifyPiNotifyOutcome`|fn||485-493|export function classifyPiNotifyOutcome(event: Pick<Agent...|
|`formatPiNotifyDuration`|fn||502-507|function formatPiNotifyDuration(durationMs: number): string|
|`formatPiNotifyBasePath`|fn||516-527|function formatPiNotifyBasePath(basePath: string): string|
|`formatPiNotifyResult`|fn||536-545|function formatPiNotifyResult(outcome: PiNotifyOutcome): ...|
|`resolvePiNotifyPushoverAgentOutput`|fn||555-571|function resolvePiNotifyPushoverAgentOutput(|
|`buildPiNotifyRuntimeTemplateValues`|fn||581-593|function buildPiNotifyRuntimeTemplateValues(|
|`quotePiNotifyInstallPath`|fn||601-606|function quotePiNotifyInstallPath(installationPath: strin...|
|`escapePiNotifyShellTemplateValue`|fn||614-623|function escapePiNotifyShellTemplateValue(value: string):...|
|`substitutePiNotifyInstallPath`|fn||633-638|export function substitutePiNotifyInstallPath(command: st...|
|`substitutePiNotifyShellTemplate`|fn||650-662|function substitutePiNotifyShellTemplate(|
|`substitutePiNotifyTextTemplate`|fn||674-689|function substitutePiNotifyTextTemplate(|
|`runPiNotifyShellCommand`|fn||697-708|function runPiNotifyShellCommand(command: string): void|
|`shouldRunPiNotifyCommand`|fn||719-732|function shouldRunPiNotifyCommand(|
|`runPiNotifyCommand`|fn||743-756|function runPiNotifyCommand(|
|`resolvePiNotifySoundCommand`|fn||765-777|function resolvePiNotifySoundCommand(|
|`shouldRunPiNotifySound`|fn||787-798|function shouldRunPiNotifySound(|
|`runPiNotifySoundCommand`|fn||808-815|export function runPiNotifySoundCommand(|
|`shouldRunPiNotifyPushover`|fn||826-840|function shouldRunPiNotifyPushover(|
|`buildPiNotifyPushoverTitle`|fn||851-865|function buildPiNotifyPushoverTitle(|
|`truncatePiNotifyPushoverText`|fn||875-881|function truncatePiNotifyPushoverText(text: string, limit...|
|`buildPiNotifyPushoverBody`|fn||892-907|function buildPiNotifyPushoverBody(|
|`buildPiNotifyPushoverPayload`|fn||918-930|function buildPiNotifyPushoverPayload(|
|`runPiNotifyPushoverRequest`|fn||941-960|function runPiNotifyPushoverRequest(|
|`setPiNotifyHttpsRequestForTests`|fn||968-970|export function setPiNotifyHttpsRequestForTests(requestIm...|
|`setPiNotifySpawnForTests`|fn||978-980|export function setPiNotifySpawnForTests(spawnImpl: PiNot...|
|`runPiNotifyEffects`|fn||991-997|export function runPiNotifyEffects(|
|`runPiNotifyEffectsForOutcome`|fn||1008-1026|export function runPiNotifyEffectsForOutcome(|


---

# pi-usereq-tools.ts | TypeScript | 180L | 7 symbols | 0 imports | 17 comments
> Path: `src/core/pi-usereq-tools.ts`
- @brief Declares the configurable pi-usereq active-tool inventory.
- @details Provides canonical custom-tool names, supported embedded-tool names, default enablement subsets, and normalization helpers shared by configuration loading, extension startup, and test doubles. The module is side-effect free. Lookup and normalization costs are linear in configured tool count.

## Definitions

- type `export type PiUsereqCustomToolName = (typeof PI_USEREQ_CUSTOM_TOOL_NAMES)[number];` (L81)
- @brief Represents one valid extension-owned configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_CUSTOM_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqEmbeddedToolName = (typeof PI_USEREQ_EMBEDDED_TOOL_NAMES)[number];` (L87)
- @brief Represents one valid embedded configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_EMBEDDED_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];` (L93)
- @brief Represents one valid configurable active-tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_STARTUP_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
### fn `export function isPiUsereqEmbeddedToolName(name: string): name is PiUsereqEmbeddedToolName` (L119-121)
- @brief Tests whether one tool name belongs to the supported embedded-tool subset.
- @details Performs one set-membership probe against `PI_USEREQ_EMBEDDED_TOOL_SET`. Runtime is O(1). No external state is mutated.
- @param[in] name {string} Candidate tool name.
- @return {boolean} `true` when the name belongs to the embedded configurable-tool subset.

### fn `export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[]` (L131-138)
- @brief Normalizes a user-configured active-tool list.
- @details Returns the default enabled-tool tuple when the input is not an array. Otherwise filters to string entries, removes names outside the configurable tool set, and deduplicates while preserving first-seen order. Time complexity is O(n). No external state is mutated.
- @param[in] value {unknown} Raw configuration payload for `enabled-tools`.
- @return {PiUsereqStartupToolName[]} Deduplicated canonical tool names.
- @satisfies REQ-064
- @post Returned values are members of `PI_USEREQ_STARTUP_TOOL_NAMES` only.

### fn `function buildPiUsereqStartupToolSortKey(` (L147-155)
- @brief Builds the menu-order partition key for one configurable tool name.
- @details Encodes the documented `Enable tools` ordering by grouping custom tools before embedded tools, placing non-`files-*` custom tools before `files-*` custom tools, and moving default-disabled names to the tail of each resolved partition. Runtime is O(1). No external state is mutated.
- @param[in] name {PiUsereqStartupToolName} Canonical configurable tool name.
- @return {[number, number, number, string]} Stable tuple `{group, subgroup, default_state, name}` used for lexicographic ordering.
- @satisfies REQ-007, REQ-231, REQ-232

### fn `export function comparePiUsereqStartupToolNames(` (L165-180)
- @brief Compares two configurable tool names using the documented menu order.
- @details Applies the partition key emitted by `buildPiUsereqStartupToolSortKey(...)` and falls back to lexical comparison inside the final key slot so the `Enable tools` submenu stays deterministic across runtimes. Runtime is O(1). No external state is mutated.
- @param[in] left {PiUsereqStartupToolName} Left configurable tool name.
- @param[in] right {PiUsereqStartupToolName} Right configurable tool name.
- @return {number} Negative when `left` sorts before `right`; positive when after; `0` when equal.
- @satisfies REQ-007, REQ-231, REQ-232

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqCustomToolName`|type||81||
|`PiUsereqEmbeddedToolName`|type||87||
|`PiUsereqStartupToolName`|type||93||
|`isPiUsereqEmbeddedToolName`|fn||119-121|export function isPiUsereqEmbeddedToolName(name: string):...|
|`normalizeEnabledPiUsereqTools`|fn||131-138|export function normalizeEnabledPiUsereqTools(value: unkn...|
|`buildPiUsereqStartupToolSortKey`|fn||147-155|function buildPiUsereqStartupToolSortKey(|
|`comparePiUsereqStartupToolNames`|fn||165-180|export function comparePiUsereqStartupToolNames(|


---

# prompt-command-catalog.ts | TypeScript | 45L | 2 symbols | 0 imports | 4 comments
> Path: `src/core/prompt-command-catalog.ts`
- @brief Declares the canonical bundled prompt-backed `req-*` command inventory.
- @details Centralizes only prompt-template-backed command names shared by extension registration, configuration normalization, debug-menu rendering, and prompt-runtime orchestration. Specialized slash commands such as `req-references` and `req-reset` are registered outside this inventory. The module is side-effect free. Lookup cost is O(1) per exported constant access.

## Definitions

- type `export type PromptCommandName = (typeof PROMPT_COMMAND_NAMES)[number];` (L33)
- @brief Narrows prompt-command identifiers to the bundled command set.
- @details Compile-time alias reused by orchestration helpers, debug inventory normalization, and command registration. The alias introduces no runtime cost.
### fn `export function formatPromptCommandName(` (L41-45)
- @brief Formats one bundled prompt-command identifier as its slash-command name.
- @details Prefixes the canonical prompt name with `req-` so debug menus and log filters can use the invokable slash-command form without duplicating the underlying inventory. Runtime is O(n) in prompt-name length. No external state is mutated.
- @param[in] promptName {PromptCommandName} Canonical bundled prompt name.
- @return {`req-${PromptCommandName}`} Invokable slash-command name.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PromptCommandName`|type||33||
|`formatPromptCommandName`|fn||41-45|export function formatPromptCommandName(|


---

# prompt-command-runtime.ts | TypeScript | 2124L | 64 symbols | 13 imports | 69 comments
> Path: `src/core/prompt-command-runtime.ts`
- @brief Implements bundled prompt-command preflight and worktree orchestration.
- @details Centralizes prompt-template-backed `req-<prompt>` repository validation, prompt-specific required-document checks, slash-command-owned worktree naming and lifecycle handling, reusable transcript-preservation plus session-restoration helpers, persisted replacement-session context reuse for non-command lifecycle handlers, matched-success stash-assisted fast-forward merge finalization, and command-side abort cleanup. Runtime is dominated by git subprocess execution plus bounded filesystem and session-file metadata checks. Side effects include active-session replacement, worktree creation and deletion, branch merges, stash-stack mutation, and filesystem reads and writes.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { ReqError } from "./errors.js";
import { enforceContextOccupancyLimit, measureContextFileSizes } from "./context-file-size.js";
import { classifyPiNotifyOutcome, type PiNotifyOutcome } from "./pi-notify.js";
import {
import {
import { type PromptCommandName } from "./prompt-command-catalog.js";
import {
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveRuntimeGitPath } from "./runtime-project-paths.js";
import {
```

## Definitions

### iface `export interface PromptRequiredDocSpec` (L44-47)
- @brief Describes one canonical required-document probe.
- @details Binds a canonical doc filename to the remediation prompt command surfaced on failure so prompt-specific doc validation can stay deterministic. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PromptCommandExecutionPlan` (L53-69)
- @brief Describes one prompt-command execution plan tracked across lifecycle hooks.
- @details Stores the prompt identity, runtime git root, associated branch name, original project base, execution context path, persisted origin and execution session files, and optional worktree metadata so the extension can switch all cwd surfaces before prompt dispatch and finalize worktree lifecycle after agent end. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PromptCommandModelSelection` (L76-79)
- @brief Describes one serializable model-selection fact captured at prompt-command preflight.
- @details Stores the active model provider and identifier as plain strings so the selection can travel inside the prompt execution plan and process-scoped persistence across session replacement without retaining live SDK model objects, and MUST NOT be persisted into pi-usereq configuration files per CTN-022. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-366, CTN-022

### iface `export interface PromptCommandModelSelectionSurface` (L86-92)
- @brief Describes the loosely-typed runtime surface required to re-apply one captured selection.
- @details Narrows the pi runtime to the model registry lookup, the active model plus thinking-level probes used by the duplicate-skip guard, and the session-scoped `setModel`/`setThinkingLevel` appliers that leave the configured default model untouched. All members stay optional so legacy hosts and offline replays degrade to a documented warning instead of aborting orchestration. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-367, REQ-370, REQ-371

### iface `export interface PromptCommandModelSelectionReapplyOptions` (L98-103)
- @brief Describes the re-apply request consumed by `reapplyPromptCommandSessionSelection`.
- @details Carries the captured selection plus thinking level, the runtime surface, and the optional stale-context-safe warning callback so callers keep notification ownership inside `src/index.ts` while the helper stays independent from extension UI types per DES-012. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PromptCommandModelSelectionReapplyResult` (L110-115)
- @brief Describes the deterministic outcome facts of one guarded selection re-application.
- @details Distinguishes not-attempted skips (missing selection, missing surface, or post-switch state already matching the captured selection) from attempted applications, and carries the normalized warning message emitted when resolution, authentication, or the runtime applier fails. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-370, REQ-372

### fn `export async function reapplyPromptCommandSessionSelection(` (L124-187)
- @brief Re-applies one captured model selection onto the active post-switch session.
- @details Resolves the captured provider plus identifier through the surface model registry, skips the whole operation when the selection or surface is unavailable and when the active model and thinking level already match the captured selection so no duplicate `model_change` session entry is emitted, otherwise awaits the session-scoped `setModel` applier, then re-applies the captured thinking level when the active level differs. Every resolution, authentication, and applier failure degrades into one warning notification through the supplied callback without throwing, so prompt orchestration and worktree closure continue unchanged. Runtime is O(1) plus one awaited model mutation. No external state is mutated beyond the applied session selection.
- @param[in] options {PromptCommandModelSelectionReapplyOptions} Captured selection, runtime surface, and warning callback.
- @return {Promise<PromptCommandModelSelectionReapplyResult>} Attempted, applied, skipped, and warning facts for the re-application.
- @satisfies REQ-366, REQ-367, REQ-368, REQ-369, REQ-370, REQ-371, REQ-372, DES-021

### iface `interface PromptCommandPostCreateHookContext` (L193-198)
- @brief Describes one post-create test hook payload for prompt-command worktrees.
- @details Exposes the git root, generated worktree name, sibling worktree path, and effective execution base so tests can simulate post-create verification failures deterministically. The interface is compile-time only and introduces no runtime cost.

- type `type PromptCommandPostCreateHook = (context: PromptCommandPostCreateHookContext) => void;` (L204)
- @brief Represents one synchronous test hook invoked after prompt worktree creation.
- @details Allows tests to mutate or remove newly created worktree artifacts before verification executes. The alias is compile-time only and introduces no runtime cost.
### iface `interface PromptCommandDebugOptions` (L210-213)
- @brief Describes optional debug logging context for prompt orchestration helpers.
- @details Carries the effective project configuration and current workflow state so prompt-runtime helpers can append selected debug entries without depending on extension UI types. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionMessageOptions` (L219-221)
- @brief Describes prompt-delivery options supported by replacement-session callbacks.
- @details Mirrors the documented pi 1.5.2 `sendUserMessage(...)` delivery modes needed when prompt orchestration targets a replacement session after a slash-command-owned session switch; pi 1.5.2 sessions count as busy while a run starts and reject `sendUserMessage(...)` without `deliverAs` while streaming. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionSwitchOptions` (L227-229)
- @brief Describes the replacement-session callback options accepted by session switching.
- @details Mirrors the documented pi runtime `withSession(...)` hook so prompt-command orchestration can continue work against the replacement session after the old command context becomes stale. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandActiveContext extends PromptCommandSessionContext` : PromptCommandSessionContext (L235-240)
- @brief Describes the minimal session-bound surface available after session replacement.
- @details Extends the shared prompt-command context with a string-only `sendUserMessage(...)` probe so prompt dispatch can target the replacement session without reusing stale pre-switch runtime objects. The string content parameter mirrors the prompt-delivery contract consumed by `deliverPromptCommand(...)` while remaining structurally compatible with the pi 1.5.2 replacement-session delivery signatures. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionEntry` (L246-251)
- @brief Describes one serializable session entry copied into a materialized execution-session file.
- @details Captures the stable tree-entry fields needed to write a JSONL session snapshot for cross-cwd session replacement when the origin session file has not been flushed yet. Mirrors the SDK `SessionEntryBase` shape without an index signature so the SDK `SessionEntry` union remains structurally assignable for passthrough serialization. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandSessionContext` (L257-269)
- @brief Describes the minimal command-context session surface used by prompt orchestration.
- @details Narrows extension command contexts to the `switchSession(...)` hook, the mutable `cwd` mirror, and the session metadata probes required for cwd verification and session snapshot materialization. The interface is compile-time only and introduces no runtime cost.

### iface `interface PromptCommandContextError extends Error` : Error (L275-277)
- @brief Describes one error object enriched with a replacement-session context.
- @details Allows prompt orchestration helpers to preserve the last valid session-bound context across replacement boundaries so callers can continue notifications and status updates after switch-triggered failures. The interface is compile-time only and introduces no runtime cost.

### fn `function isUsablePromptSessionFile(` (L292-310)
- @brief Tests whether the current session file remains reusable for prompt-command bootstrap.
- @details Accepts only persisted session files whose header cwd is readable, still exists on disk, and remains inside the active project base. This rejects stale execution-session files that still point at deleted or sibling worktrees from earlier prompt runs. Runtime is O(p) plus one session-header read. No external state is mutated.
- @param[in] sessionFile {string | undefined} Candidate current session file.
- @param[in] projectBase {string} Active project base path.
- @return {sessionFile is string} `true` when the session file remains reusable for prompt bootstrap.

### fn `function resolvePromptSessionFile(sessionFile: string | undefined, cwd: string): string` (L320-330)
- @brief Resolves the session file path used as the origin for prompt-command session switching.
- @details Reuses the current session file only when its persisted header cwd is still readable, exists on disk, and remains inside the active project base. Otherwise allocates a fresh session file path rooted at the supplied cwd so later worktree switching and restoration never inherit stale deleted-worktree session metadata. Runtime is dominated by one optional session-header read plus optional session-file allocation. Side effects include session-file path allocation when the active session metadata is stale or ephemeral.
- @param[in] sessionFile {string | undefined} Current active session file when available.
- @param[in] cwd {string} Working directory that should own the resolved session file.
- @return {string} Session file path reserved for prompt orchestration.
- @throws {ReqError} Throws when a session file path cannot be resolved.

### fn `function writePromptExecutionSessionSnapshot(` (L344-370)
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

### fn `function createPromptExecutionSessionFile(` (L383-406)
- @brief Creates the persisted session file used for worktree-backed prompt execution.
- @details Forks the resolved origin session into the target cwd when the origin session file is already persisted. Otherwise allocates a new execution-session path, materializes a JSONL header whose `cwd` equals the target worktree path, and copies the current in-memory session branch so pi can switch into the worktree session with the correct runtime cwd. Runtime is dominated by session-file copy or snapshot-write cost. Side effects include session-file creation under the target cwd session directory.
- @param[in] sourceSessionFile {string} Origin session file path.
- @param[in] targetCwd {string} Target working directory stored in the execution-session header.
- @param[in] sessionDir {string | undefined} Active session directory reused for the forked execution session when available.
- @param[in] sourceSessionBranch {PromptCommandSessionEntry[] | undefined} Current in-memory session branch copied when the origin session file has not been flushed yet.
- @return {string} Persisted execution-session file path.
- @throws {ReqError} Throws when the execution-session file cannot be created.
- @satisfies REQ-271

### fn `function getPromptSessionCwd(ctx?: PromptCommandSessionContext): string | undefined` (L414-422)
- @brief Reads the current active session cwd from a prompt-command context.
- @details Returns the session-manager cwd only when the supplied context exposes the documented `getCwd()` probe and the probe remains valid after any prior session replacement. Stale or missing probes degrade to `undefined` so verification paths never reuse invalidated pre-switch session objects. Runtime is O(1). No external state is mutated.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {string | undefined} Active session cwd when available.

### fn `function getPromptSessionFile(ctx?: PromptCommandSessionContext): string | undefined` (L430-438)
- @brief Reads the current active session file from a prompt-command context.
- @details Returns the session-manager file path only when the supplied context exposes the documented `getSessionFile()` probe and the probe remains valid after any prior session replacement. Stale or missing probes degrade to `undefined` so verification paths never reuse invalidated pre-switch session objects. Runtime is O(1). No external state is mutated.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {string | undefined} Active session file when available.

### fn `function getPromptContextCwd(ctx?: PromptCommandSessionContext): string | undefined` (L446-452)
- @brief Reads the current context cwd from a prompt-command context.
- @details Returns the context `cwd` only when the supplied getter remains valid after any prior session replacement. Stale getters degrade to `undefined` so verification paths never depend on invalidated pre-switch command objects. Runtime is O(1). No external state is mutated.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {string | undefined} Context cwd when available.

### fn `function resolvePromptCommandSwitchContext(` (L462-477)
- @brief Resolves the best available command-capable context for prompt session switching.
- @details Prefers the caller-supplied context when it still exposes `switchSession(...)`, otherwise falls back to the persisted replacement-session context associated with the execution-session file so lifecycle handlers can complete closure when pi emits non-command event contexts. Runtime is O(1). No external state is mutated.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose execution-session file keys the persisted context.
- @param[in] ctx {PromptCommandSessionContext | undefined} Caller-supplied prompt-command context.
- @return {{ context: PromptCommandSessionContext | undefined; source: "provided" | "persisted" | "missing" }} Preferred switch context plus its provenance.
- @satisfies REQ-272, REQ-276

### fn `function syncPromptCommandProcessCwd(expectedPath: string, stageLabel: string): void` (L488-508)
- @brief Aligns the host process cwd to one expected prompt-orchestration path.
- @details Applies `process.chdir(...)` only when the host process is still anchored to a different directory than the active prompt session, then re-reads `process.cwd()` and throws a deterministic error when the mutation fails or does not take effect. Runtime is O(p) in path length plus one optional cwd mutation. Side effect: mutates the host process cwd.
- @param[in] expectedPath {string} Path that `process.cwd()` must match.
- @param[in] stageLabel {string} Human-readable verification stage label.
- @return {void} No return value.
- @throws {ReqError} Throws when `process.chdir(...)` fails or leaves `process.cwd()` misaligned.
- @satisfies REQ-257, REQ-272

### fn `function readPromptSessionFileCwd(sessionFile: string): string | undefined` (L516-540)
- @brief Reads the persisted working directory recorded in one prompt-command session file header.
- @details Opens the JSONL session file, parses the first non-empty line as JSON, and returns the `cwd` field when present as a string so session-target verification can rely on live on-disk session state instead of stale handler-scoped `ctx` references. Runtime is O(n) in header size. No external state is mutated.
- @param[in] sessionFile {string} Absolute session-file path.
- @return {string | undefined} Persisted session cwd when readable; otherwise undefined.

### fn `function readPromptSessionJsonLines(` (L549-596)
- @brief Reads one persisted session file as ordered parsed JSONL records.
- @details Loads the raw session file, preserves every non-empty serialized line verbatim, parses each line as one JSON object, and rejects unreadable or structurally invalid files so prompt-closure helpers can replay exact execution-session transcript records into the restored base session without reserialization drift. Runtime is O(n) in session-file size. No external state is mutated.
- @param[in] sessionFile {string} Absolute session-file path.
- @return {Array<{ rawLine: string; parsed: Record<string, unknown> }>} Parsed non-empty JSONL lines in file order.
- @throws {ReqError} Throws when the file cannot be read, when it contains no JSONL records, when any record is not a JSON object, or when the header record is missing.

### fn `export function preservePromptCommandExecutionTranscript(plan: PromptCommandExecutionPlan): void` (L606-703)
- @brief Copies successful execution-session transcript records into the restored base session file.
- @details Reads the execution session JSONL file, preserves the original base-session header when it already exists, materializes a restored base-session header when the reserved original session file is still pending persistence, appends any execution-session records missing from the original session in original execution order, and re-reads the restored file to verify both `base-path` cwd and copied entry identifiers. Runtime is O(n) in combined session-file size. Side effects include session-file creation or append operations for the restored base session.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose original and execution session files must be synchronized.
- @return {void} No return value.
- @throws {ReqError} Throws when either session file is unreadable or when appended execution records are not persisted to the original session file.
- @satisfies REQ-208, REQ-307

### fn `function verifyPromptCommandSessionTarget(` (L716-760)
- @brief Verifies that the active session file and cwd surfaces match one expected prompt-orchestration target.
- @details Re-reads the persisted session-file header when present plus the host `process.cwd()` and throws on the first mismatch so prompt commands abort before prompt dispatch or prompt-end handling whenever session switching leaves execution attached to the wrong cwd. A missing persisted session file is treated as a non-fatal lazy-persistence state because pi's `SessionManager` writes session files on first assistant flush rather than eagerly during `ctx.switchSession(sessionPath)`; when the file is absent, pi aligns its internal session cwd to the live `process.cwd()`, so verifying `process.cwd()` alone is authoritative in that state. Reads of `ctx.cwd`, `ctx.sessionManager.getCwd()`, and `ctx.sessionManager.getSessionFile()` are advisory only because the pi `ctx.switchSession(sessionPath)` SDK contract does not mutate the handler-scoped `ctx` object, so those probes stay bound to the pre-switch session and a divergent value alone never triggers abort; they only surface a mismatch when they disagree with both the persisted header cwd and the live `process.cwd()`. Runtime is O(p) in aggregate path length plus one session-file header read. No external state is mutated.
- @param[in] expectedSessionFile {string} Session file that must remain active.
- @param[in] expectedPath {string} Path that every live cwd surface must match.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context retained for advisory reads.
- @param[in] stageLabel {string} Human-readable verification stage label.
- @return {void} No return value.
- @throws {ReqError} Throws when the persisted session-file header cwd diverges from the expected target or when `process.cwd()` diverges from the expected target.
- @satisfies REQ-257, REQ-272

### fn `function verifyPromptCommandClosureArtifacts(` (L770-805)
- @brief Verifies persisted prompt execution artifacts before successful closure merge.
- @details Re-reads the persisted execution-session header, verifies the worktree path still exists, confirms the sibling worktree remains registered, and confirms the linked branch is still present before prompt-end closure attempts to restore `base-path` and merge from the original repository. Unlike prompt-start activation checks, this helper intentionally does not require the live process cwd or current session-bound context to remain on `worktree-path`, because pi CLI may already have started end-of-session session replacement or other post-run housekeeping before the extension finishes closure handling. Runtime is dominated by one session-file read, two git subprocess checks, and bounded filesystem probes. No external state is mutated.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan.
- @return {void} No return value.
- @throws {ReqError} Throws when persisted execution-session metadata or worktree artifacts no longer match the expected worktree target.
- @satisfies REQ-208, REQ-219, REQ-258, REQ-282

### fn `export async function switchPromptCommandSession(` (L816-845)
- @brief Switches the active prompt session to one persisted session file when required.
- @details Calls `ctx.switchSession(sessionPath, { withSession })` so current pi runtimes can expose a fresh replacement-session context for every post-switch session-bound operation. When a runtime ignores the callback, the helper falls back to the caller-supplied context and downstream verification continues to rely on the persisted session-file header plus `process.cwd()`. If pi surfaces only the documented stale-extension-context error while invalidating the old execution-session closure, the helper treats that side effect as non-fatal and lets downstream verification confirm whether the target session actually became active. Runtime is dominated by the session switch. Side effects include active-session replacement and cwd mutation by the host runtime.
- @param[in] sessionFile {string} Target persisted session file.
- @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
- @return {Promise<PromptCommandSessionContext | undefined>} Replacement-session context when the runtime provides one; otherwise the caller-supplied context.
- @throws {ReqError} Throws when the context cannot switch sessions, when the host cancels the switch, or when later verification proves the target session never became active.
- @satisfies REQ-068, REQ-271, REQ-272

### fn `function isPromptCommandStaleContextError(error: unknown): boolean` (L854-857)
- @brief Detects the documented stale-extension-context runtime error during prompt-command session switching.
- @details Matches the guarded pi runtime error emitted when the old execution-session closure is invalidated during a session replacement or reload. Prompt-command session-switch helpers use this detector to distinguish a late stale-context side effect from genuine switch failures, then rely on post-switch verification to confirm whether the target session actually became active. Runtime is O(n) in message length only when an error is supplied. No external state is mutated.
- @param[in] error {unknown} Candidate thrown value.
- @return {boolean} `true` when the value matches the stale-extension-context runtime error.
- @satisfies REQ-280

### fn `function attachPromptCommandErrorContext(` (L866-874)
- @brief Attaches the last valid prompt-command context to one thrown error.
- @details Preserves the replacement-session context discovered after `ctx.switchSession(...)` so outer callers can continue UI notifications and cleanup without reusing stale pre-switch command objects. Runtime is O(1). Side effect: mutates the error object when it is an `Error` instance.
- @param[in] error {unknown} Thrown value.
- @param[in] ctx {PromptCommandSessionContext | undefined} Last valid prompt-command context.
- @return {unknown} Original thrown value with optional attached prompt context.

### fn `export function getPromptCommandErrorContext(` (L882-888)
- @brief Reads an attached prompt-command context from one thrown error.
- @details Returns the replacement-session context captured by prompt orchestration helpers when a switch-triggered failure occurs after the original command context became stale. Runtime is O(1). No external state is mutated.
- @param[in] error {unknown} Thrown value.
- @return {PromptCommandSessionContext | undefined} Attached prompt-command context when available.

### fn `function runCapture(command: string[], cwd: string): SpawnSyncReturns<string>` (L966-971)
- @brief Executes one git subprocess synchronously and captures UTF-8 output.
- @details Delegates to `spawnSync`, preserves the supplied working directory, and returns the raw subprocess result used by prompt-command orchestration. Runtime is dominated by external process execution. Side effects include process spawning.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] cwd {string} Working directory for the subprocess.
- @return {SpawnSyncReturns<string>} Captured subprocess result with UTF-8 decoded stdout and stderr.

### fn `function listPromptTrackedBasePathChanges(basePath: string): string[]` (L981-999)
- @brief Lists tracked `base-path` status rows that require stash-assisted merge handling.
- @details Executes `git status --porcelain`, retains only tracked rows whose index or worktree slot reports a change, and excludes untracked or ignored rows because the required `git stash` command does not preserve them. Runtime is dominated by one git subprocess plus O(n) parsing in status-line count. Side effects include process spawning.
- @param[in] basePath {string} Restored project base path.
- @return {string[]} Tracked status rows requiring stash-assisted merge handling.
- @throws {ReqError} Throws when git status cannot be read from `basePath`.
- @satisfies REQ-291

### fn `function finalizePromptCommandMerge(` (L1009-1131)
- @brief Executes the successful-closure merge sequence from restored `base-path`.
- @details Detects tracked staged or unstaged `base-path` changes, wraps the existing fast-forward merge in `git stash` and `git stash pop` when required, preserves the direct merge path when no tracked changes exist, emits a warning-only result after successful local-change restoration, and writes one merge-finalization debug entry when enabled. Runtime is dominated by up to four git subprocesses plus O(n) status parsing. Side effects include stash-stack mutation, branch merge attempts, and optional debug-log writes.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose branch should be merged.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {{ mergeAttempted: boolean; mergeSucceeded: boolean; errorMessage?: string; warningMessage?: string }} Merge-attempt facts plus optional warning text.
- @satisfies REQ-208, REQ-245, REQ-291, REQ-292

### fn `export function setPromptCommandPostCreateHookForTests(` (L1139-1143)
- @brief Stores or clears the prompt-command post-create test hook.
- @details Enables deterministic simulation of post-create worktree verification failures without altering production control flow. Runtime is O(1). Side effect: mutates module-local test state.
- @param[in] hook {PromptCommandPostCreateHook | undefined} Optional replacement hook.
- @return {void} No return value.

### fn `function resolvePromptDocsRoot(projectBase: string, config: UseReqConfig): string` (L1152-1155)
- @brief Resolves the configured docs root for one project base.
- @details Joins the project base with the normalized `docs-dir` value while stripping trailing separators from the persisted config field. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Absolute project root.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Absolute canonical docs root path.

### fn `function resolveWorktreePaths(` (L1165-1192)
- @brief Resolves the effective worktree project base relative to the git root.
- @details Reuses the original project-base location relative to the git root so nested repository subdirectories remain aligned inside the sibling worktree. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Original absolute project base path.
- @param[in] gitPath {string} Absolute runtime git root path.
- @param[in] worktreeName {string} Created worktree name.
- @return {{ worktreePath: string; worktreeBasePath: string }} Derived worktree paths.

### fn `function sanitizePromptWorktreeBranchName(branch: string): string` (L1200-1202)
- @brief Rewrites a branch name into a filesystem-safe token for prompt worktrees.
- @details Replaces characters invalid for worktree directory and branch-name generation with `-`. Runtime is O(n). No external state is mutated.
- @param[in] branch {string} Raw branch name.
- @return {string} Sanitized token.

### fn `function validatePromptWorktreeName(wtName: string): boolean` (L1210-1215)
- @brief Validates a prompt-command-generated worktree or branch name.
- @details Rejects empty names, dot-path markers, whitespace, and filesystem-invalid characters. Runtime is O(n). No external state is mutated.
- @param[in] wtName {string} Candidate worktree name.
- @return {boolean} `true` when the name is acceptable for worktree creation.

### fn `function throwPromptGitStatusError(): never` (L1223-1225)
- @brief Throws the canonical prompt-command git-preflight failure.
- @details Normalizes all repository-validation failures to the contractually stable prompt-command error string consumed by tests and downstream prompt workflows. Runtime is O(1). No external state is mutated.
- @return {never} Always throws.
- @throws {ReqError} Always throws with exit code `1`.

### fn `export function validatePromptGitState(projectBase: string, config?: UseReqConfig): string` (L1236-1280)
- @brief Runs slash-command-owned git validation and returns the runtime git root.
- @details Validates work-tree membership, porcelain cleanliness, and symbolic or detached `HEAD` presence for bundled prompt commands and `req-references` without invoking extension custom-tool executors. Runtime is dominated by git subprocess execution. Side effects include process spawning.
- @param[in] projectBase {string} Absolute current project base.
- @param[in] config {UseReqConfig | undefined} Optional effective project configuration used to ignore extension-owned debug-log artifacts.
- @return {string} Absolute runtime git root.
- @throws {ReqError} Throws the canonical prompt-command git-preflight error on any validation failure.
- @satisfies REQ-200, REQ-220

### fn `function resolveCurrentPromptBranchName(gitRoot: string): string` (L1288-1293)
- @brief Resolves the current local branch name used by prompt-command orchestration.
- @details Reads `git branch --show-current`, falls back to `unknown` when git cannot provide a branch name, and preserves the raw branch token for later worktree-name generation and state tracking. Runtime is dominated by one git subprocess. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @return {string} Current branch name or `unknown` when unavailable.

### fn `function formatPromptWorktreeExecutionId(timestamp: Date): string` (L1307-1309)
- @brief Formats one prompt-worktree execution identifier.
- @details Serializes the supplied timestamp as `YYYYMMDDHHMMSS` with zero-padded calendar and clock fields so generated worktree names remain stable, lexicographically sortable, and requirement-compatible. Runtime is O(1). No external state is mutated.
- @param[in] timestamp {Date} Timestamp to encode.
- @return {string} Formatted execution identifier.

### fn `function getNextPromptWorktreeExecutionId(): string` (L1316-1329)
- @brief Resolves the next unique prompt-worktree execution identifier.
- @details Formats the current wall-clock second as `YYYYMMDDHHMMSS`, then monotonically advances by one-second steps until the identifier is strictly greater than the last value emitted in the current host process. This preserves the documented timestamp-only name shape while preventing immediate same-process worktree-name reuse after fast back-to-back prompt starts. Runtime is O(1) in the common case and O(k) in repeated same-second collisions. Side effect: mutates process-scoped execution-id persistence.
- @return {string} Unique execution identifier for worktree naming.

### fn `function buildPromptWorktreeName(gitRoot: string, config: UseReqConfig): string` (L1340-1351)
- @brief Builds the prompt-command worktree name without invoking agent-tool executors.
- @details Combines the normalized persisted worktree prefix, repository basename, sanitized current branch, and timestamp execution identifier into the dedicated prompt-command worktree name. Runtime is O(1) plus git execution cost. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Generated worktree and branch name.
- @throws {ReqError} Throws when the generated name is invalid.
- @satisfies REQ-206, REQ-220

### fn `function promptWorktreeBranchExists(gitRoot: string, branchName: string): boolean` (L1360-1369)
- @brief Tests whether the exact prompt-command branch is present in the local branch list.
- @details Queries `git branch --list --format=%(refname:short)` and returns a boolean without mutating repository state. Runtime is dominated by one git subprocess plus O(n) parsing in listed branch count. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] branchName {string} Candidate local branch name.
- @return {boolean} `true` when the exact local branch is listed.

### fn `function promptWorktreeRegistered(gitRoot: string, worktreePath: string): boolean` (L1378-1389)
- @brief Tests whether the exact prompt-command worktree is registered.
- @details Scans `git worktree list --porcelain` for the resolved target path so cleanup and verification can distinguish registered worktrees from unrelated sibling directories. Runtime is dominated by one git subprocess plus O(n) parsing in listed worktree count. Side effects include process spawning.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] worktreePath {string} Absolute sibling worktree path.
- @return {boolean} `true` when the exact path is registered as a git worktree.

### fn `function cleanupPromptWorktreeCreation(` (L1399-1413)
- @brief Removes partially created prompt-command worktree resources.
- @details Force-removes the registered sibling worktree when present, deletes the matching local branch, and falls back to filesystem removal for leftover directories so failed prompt preflight leaves no reusable worktree residue. Runtime is dominated by git subprocess execution. Side effects include branch deletion and directory removal.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] worktreePath {string} Absolute sibling worktree path.
- @param[in] worktreeName {string} Exact worktree and branch name.
- @return {void} No return value.

### fn `function createPromptWorktree(` (L1427-1547)
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

### fn `export function deletePromptWorktree(` (L1560-1620)
- @brief Deletes prompt-command worktree resources without invoking custom-tool executors.
- @details Force-removes the sibling worktree and matching branch, verifies both are absent so prompt finalization remains independent from agent-tool implementations, and appends selected debug entries for worktree deletion. Runtime is dominated by git subprocess execution plus filesystem probes. Side effects include worktree deletion, branch deletion, and optional debug-log writes.
- @param[in] projectBase {string} Absolute original project base.
- @param[in] worktreeName {string} Exact worktree and branch name.
- @param[in] promptName {PromptCommandName | undefined} Optional bundled prompt identifier for debug logging.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {void} No return value.
- @throws {ReqError} Throws when cleanup cannot remove the worktree and branch fully.
- @satisfies REQ-208, REQ-220, REQ-245, REQ-309

### fn `export function getPromptRequiredDocs(promptName: PromptCommandName): readonly PromptRequiredDocSpec[]` (L1629-1631)
- @brief Returns the canonical required-document probes for one prompt command.
- @details Performs a constant-time lookup in the prompt-doc matrix used by command preflight validation. No filesystem access occurs.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @return {readonly PromptRequiredDocSpec[]} Required-doc definitions in probe order.
- @satisfies REQ-201, REQ-202

### fn `export function validatePromptRequiredDocs(` (L1644-1695)
- @brief Runs prompt-specific required-document validation.
- @details Resolves the configured docs root, verifies the prompt-mapped canonical docs exist as files, throws a deterministic remediation error for the first missing document, and appends selected debug entries for required-doc checks. Runtime is O(d) in required-doc count plus filesystem metadata cost. Side effects are limited to filesystem reads and optional debug-log writes.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {void} No return value.
- @throws {ReqError} Throws when a required canonical doc is missing.
- @satisfies REQ-201, REQ-202, REQ-203, REQ-245

### fn `export function preparePromptCommandExecution(` (L1715-1799)
- @brief Prepares prompt-command execution for one bundled prompt.
- @details Runs slash-command-owned git validation, enforces the context-occupancy early check against the selected model max input context, enforces the prompt-specific required-doc matrix, resolves persisted origin and execution session files, applies the effective worktree policy, generates and verifies a dedicated worktree when enabled, and returns the execution plan consumed by prompt rendering plus lifecycle hooks. Worktree-backed execution reuses the active session directory for the forked session file. Runtime is dominated by git subprocesses, worktree creation, and optional session-file cloning. Side effects include worktree creation, session-file creation, filesystem reads, and optional prompt debug-log writes.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] promptArgs {string} Raw prompt argument string.
- @param[in] projectBase {string} Absolute current project base.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] currentSessionFile {string | undefined} Active session file used as the switch origin when available.
- @param[in] currentSessionDir {string | undefined} Active session directory reused when the execution session is forked.
- @param[in] currentSessionBranch {PromptCommandSessionEntry[] | undefined} Active in-memory session branch copied when the origin session file is not flushed yet.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @param[in] originalModel {PromptCommandModelSelection | undefined} Active model provider plus identifier captured by the command handler for later re-application.
- @param[in] originalThinkingLevel {string | undefined} Active thinking level captured by the command handler for later re-application.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens consumed by the early occupancy check; undefined selects the documented 1,000,000-token fallback.
- @return {PromptCommandExecutionPlan} Prepared execution plan.
- @throws {ReqError} Throws when repository validation, the context-occupancy early check, required-doc validation, worktree creation, or session preparation fails.
- @satisfies REQ-200, REQ-203, REQ-206, REQ-207, REQ-215, REQ-219, REQ-220, REQ-245, REQ-256, REQ-271, REQ-366, REQ-408, REQ-409, REQ-410, REQ-411

### fn `export async function activatePromptCommandExecution(` (L1810-1843)
- @brief Activates the prepared prompt execution path before prompt dispatch or agent start.
- @details Switches the active session to the execution-session file when worktree routing changed the cwd, re-aligns `process.cwd()` to the execution path, verifies active-session cwd plus cwd mirrors after the switch completes, and stores the verified command-capable replacement-session context for later closure handling. Runtime is dominated by the optional session switch and one optional cwd mutation. Side effects include active-session replacement, host-process cwd mutation, runtime-path state mutation, and process-scoped command-context persistence.
- @param[in] plan {PromptCommandExecutionPlan} Prepared prompt execution plan.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @return {Promise<PromptCommandSessionContext | undefined>} Active prompt-command context after any required session switch.
- @throws {ReqError} Throws when the session switch or cwd verification fails.
- @satisfies REQ-206, REQ-207, REQ-257, REQ-272, REQ-276

### fn `export async function restorePromptCommandExecution(` (L1855-1919)
- @brief Restores the original project base path before merge or session-closure return.
- @details Switches the active session back to the original session file when worktree routing changed the cwd, re-aligns `process.cwd()` to `base-path`, verifies the restored session target, reuses the persisted replacement-session context when lifecycle handlers receive non-command contexts, tolerates the documented stale-extension-context error when the old replacement-session closure becomes invalid immediately after a successful restore, emits optional workflow restoration debug entries, and clears active worktree path facts before session closure continues. Runtime is dominated by the optional session switch and one optional cwd mutation. Side effects include active-session replacement, host-process cwd mutation, runtime-path state mutation, and optional workflow-debug writes.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose original base should be restored.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {Promise<PromptCommandSessionContext | undefined>} Active prompt-command context after any required restoration switch.
- @throws {ReqError} Throws when the session switch or cwd verification fails.
- @satisfies REQ-208, REQ-209, REQ-245, REQ-257, REQ-272, REQ-276

### fn `export async function abortPromptCommandExecution(` (L1930-1976)
- @brief Aborts one prepared prompt-command execution before pi CLI takes ownership.
- @details Restores the original session-backed cwd and deletes any created worktree plus branch when command-side preflight, prompt rendering, or prompt handoff fails before agent completion. Restoration failures are returned as structured cleanup errors so the original preflight failure is not masked. Runtime is dominated by the optional session switch plus git subprocess execution. Side effects include active-session replacement, optional worktree deletion, and optional debug-log writes.
- @param[in] plan {PromptCommandExecutionPlan} Prepared prompt execution plan.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {Promise<{ cleanupSucceeded: boolean; errorMessage?: string; activeContext?: PromptCommandSessionContext }>} Abort-cleanup facts plus the last valid active prompt-command context.
- @satisfies REQ-226, REQ-220, REQ-245

### fn `export async function finalizePromptCommandExecution(` (L1987-2075)
- @brief Finalizes one matched successful worktree-backed prompt execution.
- @details Re-verifies persisted execution-session metadata plus worktree artifacts, copies any execution-session transcript records missing from the original session file, restores the original session-backed `base-path`, executes the stash-assisted fast-forward merge sequence from `base-path`, deletes the worktree after merge success, and preserves the restored base session across closure failures. Closure intentionally treats `base-path` restoration as authoritative even when pi CLI has already started end-of-session session replacement or other housekeeping that moved the live runtime away from `worktree-path`. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file appends, active-session replacement, branch merges, stash-stack mutation, worktree deletion, and optional debug-log writes.
- @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan.
- @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
- @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
- @return {Promise<{ mergeAttempted: boolean; mergeSucceeded: boolean; cleanupSucceeded: boolean; errorMessage?: string; warningMessage?: string; activeContext?: PromptCommandSessionContext }>} Finalization facts plus the last valid active prompt-command context.
- @satisfies REQ-208, REQ-209, REQ-220, REQ-245, REQ-282, REQ-291, REQ-292

### fn `export function classifyPromptCommandOutcome(` (L2083-2087)
- @brief Maps one `agent_end` payload into the canonical prompt-worktree finalization outcome.
- @details Delegates to the shared notification outcome classifier so worktree merge and fork-session retention decisions stay aligned with prompt-end notification routing. Runtime is O(m) in assistant message count. No external state is mutated.
- @param[in] event {Pick<import("@earendil-works/pi-coding-agent").AgentEndEvent, "messages">} Agent-end payload subset.
- @return {PiNotifyOutcome} Canonical prompt-end outcome.

- type `export type PromptCommandStatusMarker = "ok" | "error" | "missing";` (L2094)
- @brief Represents one inspected prompt-orchestration status marker.
- @details Discriminates the merge-gating facts recovered from the final agent output: `ok` for `STATUS: OK`, `error` for `STATUS: ERROR`, and `missing` when neither marker is present. The alias is compile-time only and introduces no runtime cost.
- @satisfies REQ-584, REQ-585, REQ-586, REQ-587, REQ-588
### fn `export function resolvePromptCommandStatusMarker(agentOutputText: string): PromptCommandStatusMarker` (L2103-2110)
- @brief Inspects the final agent output for the prompt-orchestration status marker.
- @details Scans the concatenated assistant text blocks for the last occurrence of `STATUS: OK` and `STATUS: ERROR` so the terminal marker wins when earlier attempts reported a different status, and returns `missing` when neither marker occurs. Runtime is O(n) in output length. No external state is mutated.
- @param[in] agentOutputText {string} Concatenated text content blocks of the final assistant message.
- @return {PromptCommandStatusMarker} Inspected status marker.
- @satisfies REQ-584, REQ-585, REQ-587, REQ-588

### fn `export function resolvePromptCommandMergeGate(agentOutputText: string): PromptCommandStatusMarker` (L2119-2124)
- @brief Resolves the merge gate for one terminal prompt-orchestration run.
- @details Treats a terminal run that exposes no assistant text content block as merge-eligible because no report text was delivered for inspection, and otherwise delegates to `resolvePromptCommandStatusMarker(...)`. Runtime is O(n) in output length. No external state is mutated.
- @param[in] agentOutputText {string} Concatenated text content blocks of the final assistant message.
- @return {PromptCommandStatusMarker} Merge gate marker; only `ok` permits merge and worktree deletion.
- @satisfies REQ-584, REQ-585, REQ-586, REQ-589

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PromptRequiredDocSpec`|iface||44-47|export interface PromptRequiredDocSpec|
|`PromptCommandExecutionPlan`|iface||53-69|export interface PromptCommandExecutionPlan|
|`PromptCommandModelSelection`|iface||76-79|export interface PromptCommandModelSelection|
|`PromptCommandModelSelectionSurface`|iface||86-92|export interface PromptCommandModelSelectionSurface|
|`PromptCommandModelSelectionReapplyOptions`|iface||98-103|export interface PromptCommandModelSelectionReapplyOptions|
|`PromptCommandModelSelectionReapplyResult`|iface||110-115|export interface PromptCommandModelSelectionReapplyResult|
|`reapplyPromptCommandSessionSelection`|fn||124-187|export async function reapplyPromptCommandSessionSelection(|
|`PromptCommandPostCreateHookContext`|iface||193-198|interface PromptCommandPostCreateHookContext|
|`PromptCommandPostCreateHook`|type||204||
|`PromptCommandDebugOptions`|iface||210-213|interface PromptCommandDebugOptions|
|`PromptCommandSessionMessageOptions`|iface||219-221|interface PromptCommandSessionMessageOptions|
|`PromptCommandSessionSwitchOptions`|iface||227-229|interface PromptCommandSessionSwitchOptions|
|`PromptCommandActiveContext`|iface||235-240|interface PromptCommandActiveContext extends PromptComman...|
|`PromptCommandSessionEntry`|iface||246-251|interface PromptCommandSessionEntry|
|`PromptCommandSessionContext`|iface||257-269|interface PromptCommandSessionContext|
|`PromptCommandContextError`|iface||275-277|interface PromptCommandContextError extends Error|
|`isUsablePromptSessionFile`|fn||292-310|function isUsablePromptSessionFile(|
|`resolvePromptSessionFile`|fn||320-330|function resolvePromptSessionFile(sessionFile: string | u...|
|`writePromptExecutionSessionSnapshot`|fn||344-370|function writePromptExecutionSessionSnapshot(|
|`createPromptExecutionSessionFile`|fn||383-406|function createPromptExecutionSessionFile(|
|`getPromptSessionCwd`|fn||414-422|function getPromptSessionCwd(ctx?: PromptCommandSessionCo...|
|`getPromptSessionFile`|fn||430-438|function getPromptSessionFile(ctx?: PromptCommandSessionC...|
|`getPromptContextCwd`|fn||446-452|function getPromptContextCwd(ctx?: PromptCommandSessionCo...|
|`resolvePromptCommandSwitchContext`|fn||462-477|function resolvePromptCommandSwitchContext(|
|`syncPromptCommandProcessCwd`|fn||488-508|function syncPromptCommandProcessCwd(expectedPath: string...|
|`readPromptSessionFileCwd`|fn||516-540|function readPromptSessionFileCwd(sessionFile: string): s...|
|`readPromptSessionJsonLines`|fn||549-596|function readPromptSessionJsonLines(|
|`preservePromptCommandExecutionTranscript`|fn||606-703|export function preservePromptCommandExecutionTranscript(...|
|`verifyPromptCommandSessionTarget`|fn||716-760|function verifyPromptCommandSessionTarget(|
|`verifyPromptCommandClosureArtifacts`|fn||770-805|function verifyPromptCommandClosureArtifacts(|
|`switchPromptCommandSession`|fn||816-845|export async function switchPromptCommandSession(|
|`isPromptCommandStaleContextError`|fn||854-857|function isPromptCommandStaleContextError(error: unknown)...|
|`attachPromptCommandErrorContext`|fn||866-874|function attachPromptCommandErrorContext(|
|`getPromptCommandErrorContext`|fn||882-888|export function getPromptCommandErrorContext(|
|`runCapture`|fn||966-971|function runCapture(command: string[], cwd: string): Spaw...|
|`listPromptTrackedBasePathChanges`|fn||981-999|function listPromptTrackedBasePathChanges(basePath: strin...|
|`finalizePromptCommandMerge`|fn||1009-1131|function finalizePromptCommandMerge(|
|`setPromptCommandPostCreateHookForTests`|fn||1139-1143|export function setPromptCommandPostCreateHookForTests(|
|`resolvePromptDocsRoot`|fn||1152-1155|function resolvePromptDocsRoot(projectBase: string, confi...|
|`resolveWorktreePaths`|fn||1165-1192|function resolveWorktreePaths(|
|`sanitizePromptWorktreeBranchName`|fn||1200-1202|function sanitizePromptWorktreeBranchName(branch: string)...|
|`validatePromptWorktreeName`|fn||1210-1215|function validatePromptWorktreeName(wtName: string): boolean|
|`throwPromptGitStatusError`|fn||1223-1225|function throwPromptGitStatusError(): never|
|`validatePromptGitState`|fn||1236-1280|export function validatePromptGitState(projectBase: strin...|
|`resolveCurrentPromptBranchName`|fn||1288-1293|function resolveCurrentPromptBranchName(gitRoot: string):...|
|`formatPromptWorktreeExecutionId`|fn||1307-1309|function formatPromptWorktreeExecutionId(timestamp: Date)...|
|`getNextPromptWorktreeExecutionId`|fn||1316-1329|function getNextPromptWorktreeExecutionId(): string|
|`buildPromptWorktreeName`|fn||1340-1351|function buildPromptWorktreeName(gitRoot: string, config:...|
|`promptWorktreeBranchExists`|fn||1360-1369|function promptWorktreeBranchExists(gitRoot: string, bran...|
|`promptWorktreeRegistered`|fn||1378-1389|function promptWorktreeRegistered(gitRoot: string, worktr...|
|`cleanupPromptWorktreeCreation`|fn||1399-1413|function cleanupPromptWorktreeCreation(|
|`createPromptWorktree`|fn||1427-1547|function createPromptWorktree(|
|`deletePromptWorktree`|fn||1560-1620|export function deletePromptWorktree(|
|`getPromptRequiredDocs`|fn||1629-1631|export function getPromptRequiredDocs(promptName: PromptC...|
|`validatePromptRequiredDocs`|fn||1644-1695|export function validatePromptRequiredDocs(|
|`preparePromptCommandExecution`|fn||1715-1799|export function preparePromptCommandExecution(|
|`activatePromptCommandExecution`|fn||1810-1843|export async function activatePromptCommandExecution(|
|`restorePromptCommandExecution`|fn||1855-1919|export async function restorePromptCommandExecution(|
|`abortPromptCommandExecution`|fn||1930-1976|export async function abortPromptCommandExecution(|
|`finalizePromptCommandExecution`|fn||1987-2075|export async function finalizePromptCommandExecution(|
|`classifyPromptCommandOutcome`|fn||2083-2087|export function classifyPromptCommandOutcome(|
|`PromptCommandStatusMarker`|type||2094||
|`resolvePromptCommandStatusMarker`|fn||2103-2110|export function resolvePromptCommandStatusMarker(agentOut...|
|`resolvePromptCommandMergeGate`|fn||2119-2124|export function resolvePromptCommandMergeGate(agentOutput...|


---

# prompt-command-state.ts | TypeScript | 285L | 16 symbols | 2 imports | 20 comments
> Path: `src/core/prompt-command-state.ts`
- @brief Persists prompt-command runtime state across session rebinding.
- @details Stores the current prompt-orchestration workflow state, the pending or active execution plan, and the latest reusable command-capable replacement-session context on `globalThis` so slash-command worktree handoff survives pi session replacement in the same host process. Runtime is O(1). Side effects are limited to process-scoped state mutation.

## Imports
```
import path from "node:path";
import type { PromptCommandExecutionPlan } from "./prompt-command-runtime.js";
```

## Definitions

- type `export type PromptCommandRuntimeWorkflowState = "idle" | "checking" | "running" | "merging" | "done" | "warning" | "error";` (L14)
- @brief Represents the workflow-state domain persisted across session rebinding.
- @details Mirrors the prompt-orchestration states used by the status controller, including the `done` and `warning` terminal states, so the process-scoped store can remain independent from module-local controller instances. The alias is compile-time only and introduces no runtime cost.
### iface `export interface PersistedPromptCommandRuntimeState` (L20-25)
- @brief Stores the prompt-command facts persisted across extension rebinding.
- @details Tracks the current workflow state, the active orchestration request token, plus the pending or active execution plan keyed implicitly by the surviving pi host process. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PersistedPromptCommandSessionContext` (L31-47)
- @brief Describes the reusable command-capable session context persisted for prompt closure.
- @details Mirrors the minimal `ExtensionCommandContext` surface needed after prompt activation so lifecycle handlers can continue switching sessions, reading session facts, and delivering messages even when later pi lifecycle event contexts are non-command instances. The interface is compile-time only and introduces no runtime cost.

### fn `function getPersistedPromptCommandRuntimeStateStore(): PersistedPromptCommandRuntimeState` (L66-77)
- @brief Returns the process-scoped prompt-command persistence store.
- @details Lazily initializes one mutable record that survives extension rebinds in the same pi host process. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {PersistedPromptCommandRuntimeState} Mutable persistence record.

### fn `function getPersistedPromptCommandSessionContextStore():` (L84-99)
- @brief Returns the process-scoped reusable prompt command-context store.
- @details Lazily initializes one mutable record that survives extension rebinds in the same pi host process and tracks which execution-session file owns the stored command-capable context. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {{ executionSessionFile: string | undefined; sessionContext: PersistedPromptCommandSessionContext | undefined }} Mutable reusable-context record.

### fn `export function readPersistedPromptCommandRuntimeState(): PersistedPromptCommandRuntimeState` (L106-114)
- @brief Returns a snapshot of the persisted prompt-command runtime state.
- @details Copies the process-scoped workflow state, active request token, and request references into one detached object so callers can reason about the current persistence payload without mutating it accidentally. Runtime is O(1). No external state is mutated.
- @return {PersistedPromptCommandRuntimeState} Current persisted snapshot.

### fn `export function writePersistedPromptCommandRuntimeState(` (L122-130)
- @brief Replaces the persisted prompt-command runtime state.
- @details Writes the supplied workflow state, active request token, and execution-plan references into the process-scoped store so later extension instances can recover prompt orchestration after a session switch. Runtime is O(1). Side effect: mutates process-scoped state.
- @param[in] state {PersistedPromptCommandRuntimeState} Replacement persisted state.
- @return {void} No return value.

### fn `export function clearPersistedPromptCommandRuntimeState(): void` (L137-145)
- @brief Clears the persisted prompt-command runtime state.
- @details Resets the process-scoped workflow state to `idle`, clears the active request token, and removes both request references so future extension instances do not inherit stale prompt orchestration. Runtime is O(1). Side effect: mutates process-scoped state.
- @return {void} No return value.

### fn `export function writePersistedPromptCommandSessionContext(` (L154-161)
- @brief Replaces the reusable prompt command-capable session context.
- @details Associates the supplied command-capable context with one execution-session file so later lifecycle handlers can recover it after pi rebinds the active extension runtime. Runtime is O(1). Side effect: mutates process-scoped state.
- @param[in] executionSessionFile {string} Execution-session file that owns the context.
- @param[in] sessionContext {PersistedPromptCommandSessionContext | undefined} Replacement command-capable context.
- @return {void} No return value.

### fn `export function clearPersistedPromptCommandSessionContext(): void` (L168-172)
- @brief Clears the reusable prompt command-capable session context.
- @details Removes the stored execution-session file and context reference so future closure handling cannot reuse stale command objects after prompt orchestration finishes. Runtime is O(1). Side effect: mutates process-scoped state.
- @return {void} No return value.

### fn `export function readPersistedPromptCommandSessionContext(` (L180-191)
- @brief Restores the reusable prompt command-capable session context for one execution-session file.
- @details Returns the stored command-capable context only when the supplied execution-session file matches the latest stored execution-session file. Runtime is O(1). No external state is mutated.
- @param[in] executionSessionFile {string | undefined} Candidate execution-session file.
- @return {PersistedPromptCommandSessionContext | undefined} Matching stored context or `undefined` when unavailable.

### fn `export function restorePersistedPromptCommandRuntimeStateForSession(` (L199-216)
- @brief Restores persisted prompt-command runtime state for one active session file.
- @details Returns the persisted workflow state plus execution-plan references only when the supplied session file matches the persisted execution-session file of the pending or active plan. Runtime is O(1). No external state is mutated.
- @param[in] sessionFile {string | undefined} Current active session file.
- @return {PersistedPromptCommandRuntimeState | undefined} Matching persisted state or `undefined` when no persisted plan targets the supplied session.

### fn `export function readPersistedPromptCommandTerminalState()` (L224-225)
- @brief Reads the persisted terminal workflow state plus active request token across extension rebinding.
- @details Returns the persisted workflow state and request token only when the state is one of the terminal `done`, `warning`, or `error` states, so `session_start` reasons that are not `idle` reset boundaries can keep the last orchestration outcome visible without reviving stale in-flight state. Runtime is O(1). No external state is mutated.
- @return {{ workflowState: PromptCommandRuntimeWorkflowState; workflowRequest: string | undefined } | undefined} Terminal persisted facts, or `undefined` when the persisted state is not terminal.
- @satisfies REQ-629, REQ-637

### iface `export interface PersistedPromptCommandRuntimeApi` (L246-250)
- @brief Describes the loosely-typed extension-api surface persisted for model re-application.
- @details Stores only the session-scoped model appliers plus thinking-level probe needed to re-apply one captured selection after session replacement. The structural shape avoids importing concrete pi SDK types into this process-scoped module. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-367, REQ-368, REQ-369

### fn `export function writePersistedPromptCommandRuntimeApi(` (L265-272)
- @brief Writes the latest live extension api into process-scoped persistence.
- @details Replaces the stored loosely-typed model-api surface so model re-application helpers always bind to the extension instance of the currently active session runner and never to an api invalidated by session replacement. Runtime is O(1). Side effect: mutates process-scoped state.
- @param[in] runtimeApi {PersistedPromptCommandRuntimeApi | undefined} Latest extension-api surface written at extension bind time, or undefined to clear the stored surface.
- @return {void} No return value.
- @satisfies REQ-367, REQ-368, REQ-369

### fn `export function readPersistedPromptCommandRuntimeApi(): PersistedPromptCommandRuntimeApi | undefined` (L280-285)
- @brief Reads the latest live extension api from process-scoped persistence.
- @details Returns the extension-api surface written by the most recent extension bind so post-switch model re-application uses a session-scoped api that remains valid after session replacement, returning undefined so callers degrade to their own captured api. Runtime is O(1). No external state is mutated.
- @return {PersistedPromptCommandRuntimeApi | undefined} Latest stored extension-api surface, or undefined when no extension has bound in this process.
- @satisfies REQ-367, REQ-368, REQ-369

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PromptCommandRuntimeWorkflowState`|type||14||
|`PersistedPromptCommandRuntimeState`|iface||20-25|export interface PersistedPromptCommandRuntimeState|
|`PersistedPromptCommandSessionContext`|iface||31-47|export interface PersistedPromptCommandSessionContext|
|`getPersistedPromptCommandRuntimeStateStore`|fn||66-77|function getPersistedPromptCommandRuntimeStateStore(): Pe...|
|`getPersistedPromptCommandSessionContextStore`|fn||84-99|function getPersistedPromptCommandSessionContextStore():|
|`readPersistedPromptCommandRuntimeState`|fn||106-114|export function readPersistedPromptCommandRuntimeState():...|
|`writePersistedPromptCommandRuntimeState`|fn||122-130|export function writePersistedPromptCommandRuntimeState(|
|`clearPersistedPromptCommandRuntimeState`|fn||137-145|export function clearPersistedPromptCommandRuntimeState()...|
|`writePersistedPromptCommandSessionContext`|fn||154-161|export function writePersistedPromptCommandSessionContext(|
|`clearPersistedPromptCommandSessionContext`|fn||168-172|export function clearPersistedPromptCommandSessionContext...|
|`readPersistedPromptCommandSessionContext`|fn||180-191|export function readPersistedPromptCommandSessionContext(|
|`restorePersistedPromptCommandRuntimeStateForSession`|fn||199-216|export function restorePersistedPromptCommandRuntimeState...|
|`readPersistedPromptCommandTerminalState`|fn||224-225|export function readPersistedPromptCommandTerminalState()|
|`PersistedPromptCommandRuntimeApi`|iface||246-250|export interface PersistedPromptCommandRuntimeApi|
|`writePersistedPromptCommandRuntimeApi`|fn||265-272|export function writePersistedPromptCommandRuntimeApi(|
|`readPersistedPromptCommandRuntimeApi`|fn||280-285|export function readPersistedPromptCommandRuntimeApi(): P...|


---

# prompts.ts | TypeScript | 450L | 11 symbols | 9 imports | 22 comments
> Path: `src/core/prompts.ts`
- @brief Renders bundled pi-usereq prompts for the current project context.
- @details Applies placeholder substitution, legacy tool-name rewrites, and conditional pi.dev governance guidance before prompt text is sent to the agent. Runtime is linear in prompt size plus replacement count. Side effects are limited to filesystem reads used for the coding-agent-docs directory check and bundled prompt loading.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import {
import { computeContextOccupancyFacts, formatContextFileSize, sumEnabledContextFileTokens, type ContextFileSizeFacts } from "./context-file-size.js";
import { formatRuntimePathForDisplay, normalizeRelativeDirContract } from "./path-context.js";
import type {
import { getPromptRequiredDocs } from "./prompt-command-runtime.js";
import { readBundledInstruction, readBundledPrompt } from "./resources.js";
```

## Definitions

### fn `function buildPiDevConformanceBlock(promptName: string, projectBase: string): string` (L131-140)
- @brief Builds the conditional pi.dev governance block for one rendered prompt.
- @details Emits the coding-agent-document-driven governance rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the `docs/pi.dev/coding-agent-docs/` directory; the manifest file is optional and its absence does not suppress the block. The emitted rules declare `pi.dev-src/` the permanently read-only pi CLI client reference and source-of-truth for new implementations, source-code modifications, and bug fixes. Time complexity O(1). No filesystem writes.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for coding-agent-docs directory existence checks.
- @return {string} Markdown bullet block or the empty string when injection is not applicable.
- @satisfies CTN-023, CTN-024, REQ-032, REQ-033, REQ-034, REQ-108, REQ-273, REQ-274, REQ-275, REQ-378

### fn `function injectPiDevConformanceBlock(text: string, promptName: string, projectBase: string): string` (L151-158)
- @brief Injects the pi.dev governance block into the prompt behavior section.
- @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for coding-agent-docs directory existence checks.
- @return {string} Prompt markdown with zero or one injected conformance block.
- @satisfies REQ-032, REQ-033, REQ-034, REQ-108, REQ-273, REQ-274, REQ-275, REQ-378

### fn `function buildContextFilesBlock(projectBase: string, config: UseReqConfig): string` (L179-196)
- @brief Builds the markdown block that replaces the `%%CONTEXT_FILES%%` prompt token.
- @details Iterates the documented `REQUIREMENTS.md`, `REFERENCES.md`, `WORKFLOW.md` order, skips disabled flags and missing files without error, and renders each remaining file as a file-name heading, an HTML `<file name="<docs-dir>/<filename>">` reference with `%%DOC_PATH%%` pre-substituted, and the raw file content inside four-backtick `markdown` fences. Runtime is O(n) in aggregate context-file size. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root used to resolve the configured docs directory.
- @param[in] config {UseReqConfig} Effective project configuration supplying the docs directory and context-file flags.
- @return {string} Rendered markdown block, or the empty string when no enabled context file exists.
- @satisfies REQ-329, REQ-330, REQ-331, REQ-332

### fn `export function adaptPromptForInternalTools(text: string): string` (L205-211)
- @brief Rewrites bundled prompt tool references from legacy `req --...` syntax to internal tool names.
- @details Applies deterministic global regex replacements so prompt text matches the extension-registered tool surface instead of the standalone CLI spelling. Time complexity O(p*r) where p is pattern count and r is prompt length.
- @param[in] text {string} Prompt markdown before tool-reference normalization.
- @return {string} Prompt markdown with internal tool names.
- @satisfies REQ-003

### fn `export function applyReplacements(text: string, replacements: Record<string, string>): string` (L221-227)
- @brief Applies literal placeholder replacements to bundled prompt markdown.
- @details Replaces every placeholder token using split/join semantics so all occurrences are updated without regex escaping. Time complexity O(t*n) where t is replacement count and n is prompt length.
- @param[in] text {string} Prompt markdown containing placeholder tokens.
- @param[in] replacements {Record<string, string>} Token-to-value map.
- @return {string} Prompt markdown with all placeholder tokens expanded.
- @satisfies REQ-002

### fn `function buildPromptExecutionBlock(` (L237-259)
- @brief Builds the prompt-command execution block injected at prompt start.
- @details Serializes the already-completed repository validation, prompt-specific required-doc validation, worktree routing decision, and extension-owned lifecycle responsibilities so downstream agents do not repeat command-side orchestration. Time complexity is O(d) in required-doc count. No external state is mutated.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] executionPlan {PromptCommandExecutionPlan} Prepared command execution plan.
- @return {string} Markdown block or the empty string when runtime execution metadata is unavailable.
- @satisfies REQ-200, REQ-201, REQ-202, REQ-206, REQ-207, REQ-208, REQ-209

### fn `function injectPromptExecutionBlock(` (L269-280)
- @brief Injects the prompt-command execution block near the start of the rendered prompt.
- @details Inserts the execution block immediately after the first level-1 heading so downstream agents evaluate extension-owned orchestration before workflow steps. Leaves prompts unchanged when no execution block is provided or when the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {PromptCommandName} Bundled prompt identifier.
- @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Prepared execution plan.
- @return {string} Prompt markdown with zero or one injected execution block.

### fn `function buildPromptReplacements(` (L292-304)
- @brief Builds prompt-specific runtime placeholder replacements.
- @details Merges shared path substitutions with prompt-scoped runtime values for `%%ARGS%%` and `%%PROMPT%%`. Time complexity is O(g log g + s) due to delegated path replacement building, where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads delegated to shared path-context helpers.
- @param[in] promptName {string} Bundled prompt identifier without the `req-` prefix.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @return {Record<string, string>} Prompt-specific placeholder-to-value map.
- @satisfies REQ-002, REQ-211

### fn `function renderBundledCommitInstruction(` (L316-330)
- @brief Renders the bundled git instruction injected through `%%COMMIT%%`.
- @details Selects `resources/instructions/git_commit.md` when automatic git commit is enabled and `resources/instructions/git_read-only.md` otherwise, then applies the same runtime placeholder substitutions used by bundled prompts before returning the rendered markdown. Time complexity is O(n + g log g + s) where n is instruction size, g is guideline count, and s is source-directory count. Side effects are limited to filesystem reads.
- @param[in] promptName {string} Bundled prompt identifier without the `req-` prefix.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @return {string} Rendered bundled git instruction selected for the current automatic-commit mode.
- @satisfies REQ-211, REQ-213, REQ-214

### fn `export function renderPrompt(` (L343-379)
- @brief Renders a bundled prompt for the current project context.
- @details Loads the bundled markdown template, expands configuration-derived placeholders, injects extension-owned execution guidance plus conditional pi.dev governance guidance, expands the optional bundled commit instruction, and rewrites legacy tool references to internal names. Time complexity O(n) relative to prompt size plus delegated commit-instruction rendering. No tracked files are modified.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder and manifest resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Optional prompt-command execution plan used for injected runtime guidance.
- @return {string} Fully rendered prompt markdown ready for `pi.sendUserMessage(...)`.
- @satisfies REQ-002, REQ-003, REQ-032, REQ-033, REQ-034, REQ-108, REQ-200, REQ-201, REQ-202, REQ-206, REQ-207, REQ-208, REQ-209, REQ-211, REQ-213, REQ-214, REQ-273, REQ-274, REQ-275, REQ-378, REQ-329, REQ-330, REQ-331, REQ-332

### fn `export function renderPromptCommandSummary(` (L399-450)
- @brief Builds the on-screen command invocation summary for one bundled prompt-backed `req-<prompt>` command.
- @details Renders the command name without the `req-` prefix in uppercase, the user request arguments, and the active configuration fields (`docs-dir`, `src-dir`, `tests-dir`, enabled context files, `AUTO_GIT_COMMIT`, effective `GIT_WORKTREE_ENABLED`, `GIT_WORKTREE_PREFIX`, enabled static-check languages, and `enabled-tools`) so the TUI shows only a compact summary while the full rendered prompt is delivered hidden to the LLM agent. When measured context-file size facts are supplied, every enabled existing context file in the `context files` field is rendered as `name(<chars>c/<tokens>t)`; when the enabled existing token total contributes tokens, the field additionally appends the `[<percent>% context]` occupancy suffix against the selected model max input context (or `[<percent>%/1.0M* context]` with the documented fallback); without facts, or for enabled missing files, the plain `name` form is rendered. Static-check languages are emitted in canonical `DEFAULT_STATIC_CHECK_LANGUAGES` order; enabled tools are emitted in documented menu order via `comparePiUsereqStartupToolNames`. The `context files`, `static code checks`, and `enabled tools` fields render the literal `none` placeholder whenever their respective enabled-item list is empty so the summary never shows a blank value. Sections are emitted in the order `Command:`, `Configuration:` with its bullet list, then `User's Request:`, each separated by one blank line. Runtime is O(l + t log t) where l is language count and t is enabled-tool count. No external state is mutated.
- @param[in] promptName {string} Bundled prompt name without the `req-` prefix.
- @param[in] args {string} User request arguments passed to the slash command.
- @param[in] config {UseReqConfig} Effective project configuration supplying directory, git, static-check, and tool fields.
- @param[in] contextFileSizes {Record<string, ContextFileSizeFacts> | undefined} Optional measured context-file size facts keyed by canonical file name, consumed for `context files` size suffixes.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens consumed by the occupancy suffix; undefined selects the documented 1,000,000-token fallback.
- @return {string} Multi-line command invocation summary text.
- @satisfies REQ-335, REQ-336, REQ-337, REQ-338, REQ-353, REQ-377, REQ-402, REQ-403, REQ-404, REQ-407

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`buildPiDevConformanceBlock`|fn||131-140|function buildPiDevConformanceBlock(promptName: string, p...|
|`injectPiDevConformanceBlock`|fn||151-158|function injectPiDevConformanceBlock(text: string, prompt...|
|`buildContextFilesBlock`|fn||179-196|function buildContextFilesBlock(projectBase: string, conf...|
|`adaptPromptForInternalTools`|fn||205-211|export function adaptPromptForInternalTools(text: string)...|
|`applyReplacements`|fn||221-227|export function applyReplacements(text: string, replaceme...|
|`buildPromptExecutionBlock`|fn||237-259|function buildPromptExecutionBlock(|
|`injectPromptExecutionBlock`|fn||269-280|function injectPromptExecutionBlock(|
|`buildPromptReplacements`|fn||292-304|function buildPromptReplacements(|
|`renderBundledCommitInstruction`|fn||316-330|function renderBundledCommitInstruction(|
|`renderPrompt`|fn||343-379|export function renderPrompt(|
|`renderPromptCommandSummary`|fn||399-450|export function renderPromptCommandSummary(|


---

# req-references-command.ts | TypeScript | 254L | 10 symbols | 8 imports | 17 comments
> Path: `src/core/req-references-command.ts`
- @brief Implements the specialized `req-references` slash-command workflow.
- @details Performs slash-command-owned git validation reuse, reference-file generation, targeted staging, fixed-message commit creation, and post-commit cleanliness verification without creating a worktree or starting an LLM session. Runtime is dominated by git subprocess execution plus source-summary generation and one documentation write. Side effects include filesystem writes and git index/history mutation.

## Imports
```
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { UseReqConfig } from "./config.js";
import { ReqError } from "./errors.js";
import { validatePromptGitState } from "./prompt-command-runtime.js";
import { hasAnalyzableSourceFiles, writeNoSourcePlaceholderDocument } from "./source-presence.js";
import { runReferences } from "./tool-runner.js";
```

## Definitions

### iface `export interface ReqReferencesCommandPlan` (L32-37)
- @brief Describes the prepared execution facts for one `req-references` run.
- @details Stores the validated project base, resolved git root, target references path, and fixed commit message needed by the specialized direct-write workflow. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReqReferencesCommandExecutionResult` (L44-53)
- @brief Describes the per-operation outcome facts of one completed `req-references` run.
- @details Reports whether the regenerated `REFERENCES.md` content differs from the pre-run file and whether the guarded commit created a commit or was skipped, so the extension command handler can emit notifications that conform to the operations actually performed regardless of the update and commit outcomes. The interface is compile-time only and introduces no runtime cost.
- @satisfies REQ-436

### fn `function runCapture(command: string[], cwd: string): SpawnSyncReturns<string>` (L62-67)
- @brief Executes one synchronous subprocess and captures UTF-8 output.
- @details Delegates to `spawnSync(...)`, preserves the supplied working directory, and returns the raw result so callers can interpret git exit status plus diagnostics deterministically. Runtime is dominated by external process execution. Side effects include subprocess creation.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] cwd {string} Working directory for the subprocess.
- @return {SpawnSyncReturns<string>} Captured subprocess result with UTF-8 stdout and stderr.

### fn `function buildIgnoredGitStatusPaths(` (L77-91)
- @brief Builds the set of git-status paths ignored for cleanliness checks.
- @details Reuses the configured debug-log path exception already honored by prompt-command git validation so extension-owned debug artifacts do not block `req-references` execution or post-commit cleanliness verification. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBase {string} Absolute project base path.
- @param[in] gitRoot {string} Absolute git root path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {Set<string>} Slash-normalized relative paths ignored during git-status evaluation.

### fn `function listResidualGitStatusLines(` (L102-120)
- @brief Lists residual git-status rows after ignored extension-owned paths are filtered out.
- @details Executes `git status --porcelain`, drops the configured debug-log path when present inside the active repository, and returns all remaining staged or unstaged rows used for post-commit cleanliness verification. Runtime is dominated by one git subprocess plus O(n) parsing in status-line count. Side effects include subprocess creation.
- @param[in] projectBase {string} Absolute project base path.
- @param[in] gitRoot {string} Absolute git root path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string[]} Residual status rows after ignored paths are removed.
- @throws {ReqError} Throws when git status cannot be inspected.

### fn `function getGitAddTargetPath(gitRoot: string, absolutePath: string): string` (L129-135)
- @brief Converts one absolute repository path into the preferred git-add target syntax.
- @details Emits a slash-normalized relative path when the target is inside the git root and falls back to the absolute path otherwise, preserving deterministic add semantics across nested project-base layouts. Runtime is O(p) in path length. No external state is mutated.
- @param[in] gitRoot {string} Absolute git root path.
- @param[in] absolutePath {string} Absolute path to stage.
- @return {string} Relative or absolute git-add target path.

### fn `function hasStagedChangesForPaths(gitRoot: string, targetPaths: string[]): boolean` (L146-152)
- @brief Detects whether the git index holds staged differences for the given target paths.
- @details Executes `git diff --cached --quiet -- <paths>`; exit code `1` signals at least one staged difference, exit code `0` signals no staged difference for the target paths, and any other status or spawn failure is converted into a deterministic `ReqError`. Runtime is dominated by one git subprocess. Side effects include subprocess creation. No index or worktree mutation occurs.
- @param[in] gitRoot {string} Absolute git root path.
- @param[in] targetPaths {string[]} Git-add target paths inspected in the cached index.
- @return {boolean} `true` when at least one staged difference exists for the target paths.
- @throws {ReqError} Throws when staged-difference inspection fails.
- @satisfies REQ-357

### fn `function runGuardedGitCommit(gitRoot: string, targetPaths: string[], commitMessage: string): boolean` (L164-177)
- @brief Executes one guarded `git commit` invocation for the staged target paths.
- @details Runs a staged-changes precheck against the cached index and returns `false` without creating a commit when no staged difference exists for the target paths, preventing empty-commit failures such as `nothing to commit, working tree clean`. When a staged difference exists, delegates to `git commit -m <commitMessage>`, converts any non-zero result into a deterministic `ReqError`, and returns `true`. Runtime is dominated by up to two git subprocesses. Side effects include subprocess creation and conditional commit creation.
- @param[in] gitRoot {string} Absolute git root path.
- @param[in] targetPaths {string[]} Git-add target paths inspected by the staged-changes precheck.
- @param[in] commitMessage {string} Commit message used when a staged difference exists.
- @return {boolean} `true` when the commit was created; `false` when it was skipped because the cached index held no staged difference for the target paths.
- @throws {ReqError} Throws when staged-difference inspection or commit creation fails.
- @satisfies REQ-357, REQ-358

### fn `export function prepareReqReferencesCommandExecution(` (L188-201)
- @brief Prepares the specialized `req-references` execution plan.
- @details Reuses slash-command-owned git validation, resolves the configured references document path, and returns the fixed commit metadata consumed by the direct-write workflow. Runtime is dominated by git validation subprocesses. Side effects include subprocess creation delegated through `validatePromptGitState(...)`.
- @param[in] projectBase {string} Absolute project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {ReqReferencesCommandPlan} Prepared execution plan for direct references regeneration.
- @throws {ReqError} Throws when git validation fails.
- @satisfies REQ-200, REQ-299

### fn `export function executeReqReferencesCommandExecution(` (L212-254)
- @brief Executes the specialized `req-references` direct-write workflow and reports per-operation outcome facts.
- @details Snapshots the pre-run `REFERENCES.md` content, inspects the configured `src-dir` git file inventory, then either regenerates the document through the same source-summary path used by the `references` tool or writes the documented no-source placeholder payload when no supported source file exists, compares the produced content against the pre-run snapshot, stages only the target file, creates the fixed-message commit through the guarded commit helper whenever a staged difference exists, verifies that no residual git-status rows remain after ignored extension-owned debug artifacts are filtered out, and returns whether the references content changed and whether the commit was created or skipped so callers can emit outcome-conformant notifications. Runtime is dominated by source-inventory probing plus summary generation and two to four git subprocesses. Side effects include documentation writes, index mutation, conditional commit creation, and subprocess creation.
- @param[in] plan {ReqReferencesCommandPlan} Prepared direct-write execution plan.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {ReqReferencesCommandExecutionResult} Per-operation outcome facts including `referencesChanged` and `commitCreated`.
- @throws {ReqError} Throws when source-inventory probing, reference generation, placeholder writing, post-run content readback, staging, guarded commit creation, or cleanliness verification fails.
- @satisfies REQ-300, REQ-301, REQ-302, REQ-303, REQ-357, REQ-358, REQ-436, REQ-620

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ReqReferencesCommandPlan`|iface||32-37|export interface ReqReferencesCommandPlan|
|`ReqReferencesCommandExecutionResult`|iface||44-53|export interface ReqReferencesCommandExecutionResult|
|`runCapture`|fn||62-67|function runCapture(command: string[], cwd: string): Spaw...|
|`buildIgnoredGitStatusPaths`|fn||77-91|function buildIgnoredGitStatusPaths(|
|`listResidualGitStatusLines`|fn||102-120|function listResidualGitStatusLines(|
|`getGitAddTargetPath`|fn||129-135|function getGitAddTargetPath(gitRoot: string, absolutePat...|
|`hasStagedChangesForPaths`|fn||146-152|function hasStagedChangesForPaths(gitRoot: string, target...|
|`runGuardedGitCommit`|fn||164-177|function runGuardedGitCommit(gitRoot: string, targetPaths...|
|`prepareReqReferencesCommandExecution`|fn||188-201|export function prepareReqReferencesCommandExecution(|
|`executeReqReferencesCommandExecution`|fn||212-254|export function executeReqReferencesCommandExecution(|


---

# req-reset-command.ts | TypeScript | 846L | 26 symbols | 9 imports | 33 comments
> Path: `src/core/req-reset-command.ts`
- @brief Implements the specialized `req-reset` slash-command workflow.
- @details Performs non-agentic prompt-orchestration recovery by preserving the current execution-session transcript when available, restoring the original session-backed `base-path`, force-removing every generated sibling worktree and matching branch, and returning deterministic cleanup facts to the extension command handler. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file reads and writes, active-session replacement, host-process cwd mutation, worktree deletion, branch deletion, and filesystem removal.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
import { ReqError } from "./errors.js";
import {
import {
import { resolveRuntimeGitPath } from "./runtime-project-paths.js";
```

## Definitions

### iface `export interface ReqResetCommandPlan` (L41-47)
- @brief Describes the prepared execution facts for one `req-reset` run.
- @details Stores the validated project base, resolved git root, sibling-worktree parent directory, generated-name matcher, and optional persisted prompt execution plan used for transcript preservation plus base-path restoration. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReqResetCommandExecutionResult` (L53-60)
- @brief Describes the outcome of one `req-reset` execution attempt.
- @details Captures the last valid session-bound context, transcript-preservation and base-path-restoration facts, removed generated worktree and branch names, and one aggregated failure string when any recovery step fails. The interface is compile-time only and introduces no runtime cost.

- type `type ReqResetCommandContext = Parameters<typeof restorePromptCommandExecution>[1];` (L66)
- @brief Describes the session-bound context surface reused during `req-reset` recovery.
- @details Reuses the session-switching contract already accepted by `restorePromptCommandExecution(...)` so the dedicated reset command can restore the original session without depending on concrete pi runtime classes. The alias is compile-time only and introduces no runtime cost.
### fn `function runCapture(command: string[], cwd: string): SpawnSyncReturns<string>` (L75-80)
- @brief Executes one synchronous subprocess and captures UTF-8 output.
- @details Delegates to `spawnSync(...)`, preserves the supplied working directory, and returns the raw result so callers can interpret git exit status plus diagnostics deterministically. Runtime is dominated by external process execution. Side effects include subprocess creation.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] cwd {string} Working directory for the subprocess.
- @return {SpawnSyncReturns<string>} Captured subprocess result with UTF-8 stdout and stderr.

### fn `function escapeReqResetRegExpLiteral(text: string): string` (L88-90)
- @brief Escapes one literal string for safe JavaScript regular-expression reuse.
- @details Prefixes every regular-expression metacharacter with `\\` so generated worktree-name patterns can embed persisted prefixes and repository basenames without introducing unintended matcher semantics. Runtime is O(n) in string length. No external state is mutated.
- @param[in] text {string} Literal text fragment.
- @return {string} Regular-expression-safe literal fragment.

### fn `function buildReqResetWorktreeNamePattern(gitRoot: string, config: UseReqConfig): RegExp` (L100-107)
- @brief Builds the generated-worktree name matcher used by `req-reset` cleanup.
- @details Reuses the configured worktree prefix plus repository basename, accepts any sanitized branch token between those fixed segments and the final execution identifier, and constrains the timestamp suffix to the documented `YYYYMMDDHHMMSS` shape. Runtime is O(p) in combined prefix and project-name length. No external state is mutated.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {RegExp} Matcher for generated prompt-command worktree and branch names.
- @satisfies REQ-309, REQ-310, REQ-311

### fn `function listReqResetRegisteredWorktreeRoots(gitRoot: string): string[]` (L116-125)
- @brief Lists every registered git worktree root for one repository.
- @details Executes `git worktree list --porcelain`, extracts each `worktree <path>` record, resolves every listed path to an absolute form, and returns the ordered list used by generated-worktree cleanup. Runtime is dominated by one git subprocess plus O(n) parsing in listed worktree count. Side effects include subprocess creation.
- @param[in] gitRoot {string} Absolute runtime git root.
- @return {string[]} Absolute registered worktree-root paths.
- @throws {ReqError} Throws when git worktree enumeration fails.

### fn `function listReqResetSiblingWorktreeRoots(` (L135-153)
- @brief Lists sibling directories whose names match the generated-worktree contract.
- @details Reads the repository parent directory, keeps only direct child directories whose basenames match the supplied generated-name pattern, and resolves each candidate to an absolute path so `req-reset` can remove unregistered leftover directories as well as registered git worktrees. Runtime is dominated by directory enumeration plus O(n) matcher cost. Side effects are limited to filesystem reads.
- @param[in] parentPath {string} Absolute directory containing sibling worktree roots.
- @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
- @return {string[]} Absolute sibling directory paths whose basenames match the generated-name contract.
- @throws {ReqError} Throws when directory enumeration fails.

### fn `function listReqResetMatchingWorktreeRoots(` (L164-179)
- @brief Lists every generated sibling worktree candidate targeted by `req-reset`.
- @details Unions registered git-worktree roots with matching sibling directories so cleanup covers both registered worktrees and unregistered leftover directories, then sorts the canonical absolute paths for deterministic deletion order. Runtime is dominated by git worktree enumeration plus sibling-directory scanning. Side effects are limited to subprocess creation and filesystem reads.
- @param[in] parentPath {string} Absolute directory containing sibling worktree roots.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
- @return {string[]} Sorted absolute worktree-root paths targeted for deletion.
- @throws {ReqError} Throws when git worktree or sibling-directory enumeration fails.

### fn `function listReqResetMatchingBranchNames(` (L189-202)
- @brief Lists every matching generated branch targeted by `req-reset`.
- @details Executes `git branch --list --format=%(refname:short)`, filters the local branch inventory through the generated-name matcher, and returns a sorted list so later forced branch deletion remains deterministic. Runtime is dominated by one git subprocess plus O(n) parsing in listed branch count. Side effects include subprocess creation.
- @param[in] gitRoot {string} Absolute runtime git root.
- @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
- @return {string[]} Sorted local branch names targeted for deletion.
- @throws {ReqError} Throws when local branch enumeration fails.

### fn `function resolveReqResetMainWorktreeRoot(gitRoot: string): string` (L210-223)
- @brief Resolves the main repository worktree root for one git path.
- @details Runs `git rev-parse --path-format=absolute --git-common-dir` from the supplied path, treats a common-directory result whose basename is `.git` as proof that its parent is the main repository worktree root, and falls back to the supplied root when git probing fails or the repository layout is non-standard. This keeps all `req-reset` cleanup probes anchored to the main repository even when the live pi session cwd is inside a linked worktree. Runtime is dominated by one git subprocess plus O(1) path math. Side effects include subprocess creation.
- @param[in] gitRoot {string} Absolute git worktree root used as probing cwd.
- @return {string} Absolute main repository worktree root.

### fn `function resolveReqResetMainBranchName(gitRoot: string): string | undefined` (L231-258)
- @brief Resolves the repository main branch name used by `req-reset` cleanup.
- @details Prefers the local branch referenced by `refs/remotes/origin/HEAD` with the leading remote `origin/` prefix stripped, then conventional local `main`, then local `master`, and returns `undefined` when no candidate exists locally so callers skip branch switching without losing cleanup facts. Runtime is dominated by up to three git subprocesses. Side effects include subprocess creation.
- @param[in] gitRoot {string} Absolute main repository worktree root.
- @return {string | undefined} Local main branch name or `undefined` when unresolvable.

### fn `function ensureReqResetMainBranch(gitRoot: string, worktreeNamePattern: RegExp): void` (L269-290)
- @brief Ensures the main repository HEAD stays on the main branch before cleanup.
- @details Reads the current local branch of the main repository; when HEAD is checked out on a generated prompt-command branch that matches the cleanup matcher, resolves the repository main branch and switches to it so later forced branch deletion cannot fail with git's checked-out-worktree guard. Normal branches, detached HEAD, unresolvable main branches, and probing failures skip the switch defensively. Runtime is dominated by up to two git subprocesses. Side effects include main-worktree branch switching.
- @param[in] gitRoot {string} Absolute main repository worktree root.
- @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
- @return {void} No return value.
- @throws {ReqError} Throws when the main worktree cannot switch off one generated branch.
- @satisfies REQ-309, REQ-310

### fn `function readReqResetSessionHeader(sessionFile: string): { cwd?: string; parentSession?: string } | undefined` (L298-324)
- @brief Reads the persisted header record from one session file.
- @details Parses the first non-empty JSONL line and returns its `cwd` plus `parentSession` fields when the file is readable and the header is a JSON object. Runtime is O(n) in header size. No external state is mutated.
- @param[in] sessionFile {string} Absolute session-file path.
- @return {{ cwd?: string; parentSession?: string } | undefined} Parsed header fields or `undefined` when unreadable.

### fn `function resolveReqResetParentSessionFile(` (L341-373)
- @brief Resolves the original base-path session file from the active session header.
- @details Reads the current session file exposed by the supplied command context and accepts one
persisted `parentSession` link as the reserved original base-path session under two conditions:
when the linked file already exists on disk its own header `cwd` must remain inside the main base
path, and when the linked file was never flushed to disk (pi persists session files lazily on the
first entry append) the link itself proves the reserved original-session identity so the caller
can materialize the base session before switching. Unpersisted links are accepted only when their
parent directory already exists so recovery never writes session files into arbitrary locations.
Runtime is O(n) in session-header size plus bounded filesystem probes. No external state is
mutated.
- @param[in] activeContext {ReqResetCommandContext | undefined} Session-bound command context whose current session file links the base-path session.
- @param[in] basePath {string} Absolute main repository base path that must contain the parent session cwd.
- @return {string | undefined} Original base-path session file or `undefined` when unavailable.

### fn `function ensureReqResetBaseSessionFile(sessionFile: string, basePath: string): boolean` (L390-411)
- @brief Guarantees one switchable persisted base-path session file for `req-reset` re-anchoring.
- @details Leaves existing session files untouched and, when the resolved base session file was
never flushed to disk (pi persists session files lazily on the first entry append), materializes
one minimal pi JSONL session header whose `cwd` equals the main base path using the same header
contract as pi `SessionManager.newSession(...)`/`forkFrom(...)` and the extension-owned execution
session snapshots. Materialization is restricted to existing session directories so recovery
never writes into arbitrary locations, and any write failure degrades to `false` so the caller
surfaces the re-anchor failure instead of silently deleting the anchoring worktree.
Runtime is O(p) in path length plus one bounded filesystem probe and at most one file write.
Side effects include one conditional session-file creation.
- @param[in] sessionFile {string} Resolved base-path session file path.
- @param[in] basePath {string} Absolute main repository base path recorded in the materialized header.
- @return {boolean} `true` when a persisted session file exists or was materialized; `false` when the session directory is missing or the write fails.

### fn `function readReqResetContextSessionDir(activeContext: ReqResetCommandContext | undefined): string | undefined` (L422-431)
- @brief Reads one live session-bound context session directory while tolerating stale contexts.
- @details Real pi command contexts resolve `sessionManager` through getter-only accessors whose
reads throw the documented stale-extension-context error after session replacement, so the
session-directory probe must degrade stale reads to `undefined`. Runtime is O(1). No external
state is mutated.
- @param[in] activeContext {ReqResetCommandContext | undefined} Candidate session-bound context.
- @return {string | undefined} Live session directory when readable; `undefined` when absent or stale.

### fn `function allocateReqResetBaseSessionFile(` (L446-460)
- @brief Allocates one fresh persisted base-path session file for `req-reset` re-anchoring.
- @details Mirrors pi `/new` semantics for recovery situations without any resolvable original or
recent base session: reserves one new session file path inside the live session directory
through `SessionManager.create(...)` so the caller can materialize its header with the main base
path and switch the pi CLI onto it before generated worktrees are removed. Allocation is
restricted to existing session directories and any failure degrades to `undefined`. Runtime is
O(p) in path length plus one bounded filesystem probe. No external state is mutated beyond the
pi session-manager reservation.
- @param[in] basePath {string} Absolute main repository base path for the reserved session.
- @param[in] sessionDir {string | undefined} Live session directory reused for the reserved file.
- @return {string | undefined} Reserved session file path or `undefined` when allocation is impossible.

### fn `function resolveReqResetMainSessionFile(basePath: string): string | undefined` (L468-478)
- @brief Resolves the most recent persisted session file rooted at the main base path.
- @details Uses the pi SDK default session discovery for the supplied cwd and returns the persisted session file only when it already exists on disk, so the pi CLI can resume the recent base-path session instead of being created a fresh one. Runtime is O(s) in session-directory listing cost. No external state is mutated.
- @param[in] basePath {string} Absolute main repository base path.
- @return {string | undefined} Most recent persisted base-path session file or `undefined` when none exists.

### fn `function reqResetExecutionPathNeedsRedirect(` (L488-509)
- @brief Tests whether one execution path must be re-anchored to the main base path before cleanup.
- @details Returns `true` when the path does not exist anymore, or when it is anchored inside any generated worktree root targeted by `req-reset` and the base path is not an ancestor of it. Existing paths already inside the main base path never need a redirect. Runtime is O(r) in matched-worktree count plus bounded filesystem probes. No external state is mutated.
- @param[in] executionPath {string | undefined} Live process or context execution path.
- @param[in] basePath {string} Absolute main repository base path.
- @param[in] matchingWorktreeRoots {string[]} Absolute generated worktree roots targeted for deletion.
- @return {boolean} `true` when the execution path must be switched to the main base path first.

### fn `function readReqResetContextCwd(activeContext: ReqResetCommandContext | undefined): string | undefined` (L520-528)
- @brief Reads one live session-bound context cwd while tolerating stale contexts.
- @details Real pi command contexts expose `cwd` as a getter-only accessor whose read throws the
documented stale-extension-context error after session replacement, so every `req-reset` probe
must degrade stale reads to `undefined` instead of aborting the whole recovery. Runtime is O(1).
No external state is mutated.
- @param[in] activeContext {ReqResetCommandContext | undefined} Candidate session-bound context.
- @return {string | undefined} Live context cwd when readable; `undefined` when absent or stale.

### fn `async function redirectReqResetExecutionToMainBranch(` (L551-614)
- @brief Returns the pi CLI to the main base path before generated worktrees are removed.
- @details When the host process cwd or the supplied context cwd is still anchored inside a
generated worktree targeted for deletion or points at a deleted path, best-effort switches the
active pi session back to the original or recent base-path session, guaranteeing the resolved
base session file is persisted through `ensureReqResetBaseSessionFile(...)` before switching so
lazily-flushed reserved sessions still re-anchor the pi CLI onto the main base path. Re-anchors
`process.cwd()`, clears the runtime worktree path state so no post-cleanup surface keeps probing
the removed worktree directory, and reports any session-switch failure through the returned
re-anchor diagnostic so the caller can surface it and retain anchoring worktrees instead of
silently orphaning the live session at a deleted directory. Context `cwd` mirrors are probed
stale-safely because pi contexts expose getter-only accessors that `Reflect.set(...)` cannot
mutate. Runtime is dominated by one optional session switch plus bounded filesystem probes.
Side effects include active-session replacement, host-process cwd mutation, and one conditional
base-session file materialization.
- @param[in] basePath {string} Absolute main repository base path.
- @param[in] matchingWorktreeRoots {string[]} Absolute generated worktree roots targeted for deletion.
- @param[in,out] activeContext {ReqResetCommandContext | undefined} Mutated session context mirror and potential replacement-session context.
- @return {Promise<{ context: ReqResetCommandContext | undefined; reanchorErrorMessage?: string }>} Re-anchored context plus one optional re-anchor failure diagnostic.
- @satisfies REQ-257, REQ-307, REQ-308, REQ-313

### fn `function resolveReqResetAnchoredWorktreeRoots(` (L628-645)
- @brief Lists matching worktree roots that still anchor the live session cwd.
- @details Used only after a failed session re-anchor so `req-reset` retains the worktree directory
the live pi session is still checked out in, preventing the session cwd from being orphaned at a
deleted directory (which renders `branch:unknown`). Stale or unreadable context cwds and paths
that no longer exist yield an empty list because the session cannot be probed reliably. Runtime
is O(r) in matched-worktree count plus one bounded filesystem probe. No external state is
mutated.
- @param[in] activeContext {ReqResetCommandContext | undefined} Session-bound context whose live cwd may still anchor one matching worktree.
- @param[in] matchingWorktreeRoots {string[]} Absolute generated worktree roots targeted for deletion.
- @return {string[]} Absolute matching worktree roots that still contain the live session cwd.

### fn `function restoreReqResetExecutionCwd(basePath: string, activeContext: ReqResetCommandContext | undefined): void` (L654-680)
- @brief Restores live process and context cwd surfaces after worktree removal.
- @details Best-effort re-points `process.cwd()` and the supplied context `cwd` mirror to the main repository base path when the previously live cwd was removed by `req-reset` cleanup, so subsequent status rendering and notifications never probe deleted worktree paths. Runtime is O(1) plus bounded filesystem probes. Side effects include process cwd mutation and optional context mirror mutation.
- @param[in] basePath {string} Absolute main repository base path.
- @param[in,out] activeContext {ReqResetCommandContext | undefined} Mutated session context mirror.
- @return {void} No return value.

### fn `export function prepareReqResetCommandExecution(` (L692-717)
- @brief Prepares the specialized `req-reset` execution plan.
- @details Resolves the active project base into a runtime git root, normalizes that root to the main repository worktree so cleanup and branch checks never run from inside a linked worktree, derives the sibling-worktree parent directory and generated-name matcher from the same prefix plus repository-basename contract used by prompt-command worktree generation, and keeps only worktree-backed persisted prompt execution plans for transcript-preserving base-path restoration. Runtime is O(p) in path length plus one git subprocess. No external state is mutated.
- @param[in] projectBase {string} Absolute project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] promptRequest {PromptCommandExecutionPlan | undefined} Pending or active prompt execution plan when available.
- @return {ReqResetCommandPlan} Prepared recovery and cleanup plan.
- @throws {ReqError} Throws when the repository root cannot be resolved.
- @satisfies REQ-306, REQ-309, REQ-310, REQ-311

### fn `export async function executeReqResetCommandExecution(` (L727-846)
- @brief Executes the specialized `req-reset` recovery and cleanup workflow.
- @details Preserves the execution-session transcript into the original session file when a worktree-backed prompt execution plan is still available, restores the original session-backed `base-path` through the shared prompt-command restoration helper, ensures the main repository HEAD is on the main branch so generated branch deletion cannot hit git's checked-out-worktree guard, enumerates every matching sibling worktree, returns the pi CLI execution surfaces to the main base path (materializing the reserved base session when pi never flushed it) before any matching worktree directory is removed, force-removes every matching sibling worktree directory, force-removes every remaining matching local branch, retains the worktree plus branch that still anchor the live pi session whenever the session re-anchor fails so the session cwd is never orphaned at a deleted directory, restores deleted live cwd surfaces, and aggregates any failure diagnostics without rolling back successful cleanup steps. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file reads and writes, active-session replacement, host-process cwd mutation, branch switching, worktree deletion, branch deletion, and filesystem reads.
- @param[in] plan {ReqResetCommandPlan} Prepared recovery and cleanup plan.
- @param[in] ctx {ReqResetCommandContext | undefined} Optional session-bound command context.
- @return {Promise<ReqResetCommandExecutionResult>} Recovery and cleanup outcome facts.
- @satisfies REQ-305, REQ-307, REQ-308, REQ-309, REQ-310, REQ-313

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ReqResetCommandPlan`|iface||41-47|export interface ReqResetCommandPlan|
|`ReqResetCommandExecutionResult`|iface||53-60|export interface ReqResetCommandExecutionResult|
|`ReqResetCommandContext`|type||66||
|`runCapture`|fn||75-80|function runCapture(command: string[], cwd: string): Spaw...|
|`escapeReqResetRegExpLiteral`|fn||88-90|function escapeReqResetRegExpLiteral(text: string): string|
|`buildReqResetWorktreeNamePattern`|fn||100-107|function buildReqResetWorktreeNamePattern(gitRoot: string...|
|`listReqResetRegisteredWorktreeRoots`|fn||116-125|function listReqResetRegisteredWorktreeRoots(gitRoot: str...|
|`listReqResetSiblingWorktreeRoots`|fn||135-153|function listReqResetSiblingWorktreeRoots(|
|`listReqResetMatchingWorktreeRoots`|fn||164-179|function listReqResetMatchingWorktreeRoots(|
|`listReqResetMatchingBranchNames`|fn||189-202|function listReqResetMatchingBranchNames(|
|`resolveReqResetMainWorktreeRoot`|fn||210-223|function resolveReqResetMainWorktreeRoot(gitRoot: string)...|
|`resolveReqResetMainBranchName`|fn||231-258|function resolveReqResetMainBranchName(gitRoot: string): ...|
|`ensureReqResetMainBranch`|fn||269-290|function ensureReqResetMainBranch(gitRoot: string, worktr...|
|`readReqResetSessionHeader`|fn||298-324|function readReqResetSessionHeader(sessionFile: string): ...|
|`resolveReqResetParentSessionFile`|fn||341-373|function resolveReqResetParentSessionFile(|
|`ensureReqResetBaseSessionFile`|fn||390-411|function ensureReqResetBaseSessionFile(sessionFile: strin...|
|`readReqResetContextSessionDir`|fn||422-431|function readReqResetContextSessionDir(activeContext: Req...|
|`allocateReqResetBaseSessionFile`|fn||446-460|function allocateReqResetBaseSessionFile(|
|`resolveReqResetMainSessionFile`|fn||468-478|function resolveReqResetMainSessionFile(basePath: string)...|
|`reqResetExecutionPathNeedsRedirect`|fn||488-509|function reqResetExecutionPathNeedsRedirect(|
|`readReqResetContextCwd`|fn||520-528|function readReqResetContextCwd(activeContext: ReqResetCo...|
|`redirectReqResetExecutionToMainBranch`|fn||551-614|async function redirectReqResetExecutionToMainBranch(|
|`resolveReqResetAnchoredWorktreeRoots`|fn||628-645|function resolveReqResetAnchoredWorktreeRoots(|
|`restoreReqResetExecutionCwd`|fn||654-680|function restoreReqResetExecutionCwd(basePath: string, ac...|
|`prepareReqResetCommandExecution`|fn||692-717|export function prepareReqResetCommandExecution(|
|`executeReqResetCommandExecution`|fn||727-846|export async function executeReqResetCommandExecution(|


---

# resources.ts | TypeScript | 102L | 7 symbols | 3 imports | 8 comments
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

### fn `export function readBundledPromptDescription(promptName: string): string` (L73-78)
- @brief Extracts the first Markdown level-one heading from one bundled prompt.
- @details Removes one optional leading YAML front-matter block, scans the remaining markdown body for the first line that begins with `# `, and returns the heading payload without the marker or surrounding whitespace. Runtime is O(n) in prompt length. Side effects are limited to filesystem reads delegated through `readBundledPrompt(...)`.
- @param[in] promptName {string} Prompt identifier without the `.md` suffix.
- @return {string} First `# ` heading payload, or the empty string when no level-one heading exists.

### fn `export function readBundledInstruction(instructionName: string): string` (L87-89)
- @brief Reads one bundled markdown instruction by logical instruction name.
- @details Resolves the instruction file under the installation-owned `resources/instructions` directory, validates resource accessibility, and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] instructionName {string} Instruction identifier without the `.md` suffix.
- @return {string} Raw instruction markdown content.
- @throws {Error} Propagates `fs.readFileSync` errors when the instruction file is missing or unreadable.

### fn `export function listBundledPromptNames(): string[]` (L96-102)
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
|`readBundledPromptDescription`|fn||73-78|export function readBundledPromptDescription(promptName: ...|
|`readBundledInstruction`|fn||87-89|export function readBundledInstruction(instructionName: s...|
|`listBundledPromptNames`|fn||96-102|export function listBundledPromptNames(): string[]|


---

# runtime-project-paths.ts | TypeScript | 90L | 5 symbols | 4 imports | 6 comments
> Path: `src/core/runtime-project-paths.ts`
- @brief Derives runtime-only repository facts.
- @details Centralizes git-repository probing, repository-root resolution, and active-branch lookup for extension status, tool execution, and CLI flows. Runtime is dominated by git subprocess execution plus path normalization. Side effects are limited to subprocess spawning.

## Imports
```
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { ReqError } from "./errors.js";
import { isSameOrAncestorPath } from "./path-context.js";
```

## Definitions

### fn `function runGitCapture(command: string[], cwd?: string): SpawnSyncReturns<string>` (L19-24)
- @brief Executes one git subprocess and captures UTF-8 output.
- @details Delegates to `spawnSync`, keeps execution synchronous for deterministic command flows, and supports an optional working directory. Runtime is dominated by the spawned git process. Side effects include subprocess creation.
- @param[in] command {string[]} Git executable plus argument vector.
- @param[in] cwd {string | undefined} Optional working directory.
- @return {SpawnSyncReturns<string>} Captured subprocess result with UTF-8 stdout and stderr.

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

# settings-menu.ts | TypeScript | 321L | 15 symbols | 2 imports | 15 comments
> Path: `src/core/settings-menu.ts`
- @brief Renders pi-usereq configuration menus with the shared pi.dev settings style.
- @details Wraps `SettingsList` in one extension-command helper that exposes right-aligned current values, built-in circular scrolling, bottom-line descriptions, and a deterministic bridge for offline test harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.

## Imports
```
import { getSettingsListTheme, type ThemeColor, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, SettingsList, Text, type Component, type SettingItem, type SettingsListTheme } from "@earendil-works/pi-tui";
```

## Definitions

### iface `export interface PiUsereqSettingsMenuChoice` (L14-23)
- @brief Describes one selectable pi-usereq settings-menu choice.
- @details Stores the stable action identifier, left-column label, optional label and value tone overrides, optional disabled state, right-column current value, optional inline-cycle values, and bottom-line description consumed by the shared settings-menu renderer. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqSettingsMenuBridge` (L29-35)
- @brief Describes the offline bridge exposed by shared settings-menu components.
- @details Lets deterministic harnesses and unit tests drive the same settings-menu choices by label without simulating raw terminal key streams. The interface is runtime-facing but carries no side effects by itself.

### iface `export interface PiUsereqSettingsMenuOptions` (L41-45)
- @brief Describes optional behavior overrides for one settings-menu render.
- @details Carries the caller-selected initial focus row, the optional dynamic choice supplier used to rebuild dependent rows after inline toggles, and the optional inline-change callback used to persist `SettingsList` value cycles without closing the menu. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqSettingsMenuComponent extends Component` : Component (L51-53)
- @brief Represents a custom menu component augmented with the offline bridge.
- @details Extends the generic TUI `Component` contract with one optional bridge field consumed only by deterministic test and debug harness adapters. The interface is compile-time only and introduces no runtime cost.

- type `type PiUsereqSettingsThemeColor = Extract<ThemeColor, "accent" | "muted" | "dim">;` (L61)
- @brief Enumerates the CLI-supported theme tokens consumed by settings menus.
- @details Narrows callback-local theme calls to the documented settings-list
semantics used by the pi CLI. Compile-time only and introduces no runtime
cost.
### iface `interface PiUsereqSettingsTheme` (L70-73)
- @brief Describes the callback-local theme surface required by settings menus.
- @details Captures the subset of the custom-UI theme API needed to rebuild
title and fallback settings-list styling when the shared global theme is not
available in tests or offline replay. Compile-time only and introduces no
runtime cost.

### fn `function buildFallbackPiUsereqSettingsListTheme(` (L85-97)
- @brief Builds the fallback settings-list theme matching CLI settings semantics.
- @details Mirrors the shared CLI settings theme token mapping for labels,
values, descriptions, cursor, and hints while avoiding the global theme
singleton used by the live pi runtime. Runtime is O(1). No external state is
mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Fallback settings-list theme.
- @satisfies REQ-151, REQ-156

### fn `function buildPiUsereqSettingsListTheme(` (L110-124)
- @brief Resolves the settings-list theme used by pi-usereq configuration menus.
- @details Prefers the shared CLI `getSettingsListTheme()` API so extension
menus inherit active-theme behavior from pi itself, then falls back to an
equivalent callback-local mapping when the shared theme singleton is
unavailable in deterministic tests or offline replay. Runtime is O(1). No
external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Settings-list theme used by pi-usereq menus.
- @satisfies REQ-151, REQ-156

### fn `function formatPiUsereqSettingsMenuTitle(` (L136-141)
- @brief Formats the settings-menu title with active-theme semantics.
- @details Applies the callback-local `accent` token and bold styling on every
rebuild so custom-menu titles stay synchronized with live theme changes.
Runtime is O(n) in title length. No external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @param[in] title {string} Menu title.
- @return {string} Styled title text.
- @satisfies REQ-151, REQ-156

### fn `function createImmediateSelectionComponent(choiceId: string, done: (value?: string) => void): Component` (L150-162)
- @brief Closes a settings menu immediately with one selected action identifier.
- @details Provides the submenu callback used by `SettingsList` so pressing Enter on any menu row resolves the outer custom UI promise with the row identifier. Runtime is O(1). Side effects are limited to one custom-UI completion callback.
- @param[in] choiceId {string} Stable choice identifier to emit.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {Component} Immediate-completion submenu component.

### fn `function buildSettingItems(` (L172-193)
- @brief Builds `SettingsList` items from one menu-choice vector.
- @details Copies labels, current values, label-tone overrides, value-tone overrides, disabled-state semantics, inline-cycle values, and descriptions into `SettingItem` records. Non-disabled rows with `values` cycle inline on `Enter` or `Space`, while other non-disabled rows resolve the outer custom UI through the immediate submenu bridge. Runtime is O(n) in choice count. No external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {SettingItem[]} `SettingsList` item vector.

### fn `function setSettingsListSelectedIndex(` (L202-207)
- @brief Writes one best-effort selected row index into a `SettingsList` instance.
- @details Uses reflective access so pi-usereq can preserve focus across menu re-renders without depending on the private field at compile time. Runtime is O(1). Side effect: mutates the underlying `SettingsList` selection state when the field exists.
- @param[in] selectedIndex {number} Zero-based row index to restore.
- @param[in,out] settingsList {SettingsList} Mutable settings-list instance.
- @return {void} No return value.

### fn `function getSettingsListSelectedIndex(` (L215-220)
- @brief Reads the current selected row index from a `SettingsList` instance.
- @details Uses reflective access so pi-usereq can report the current focused row through the offline bridge without referencing the private field in the static type system. Runtime is O(1). No external state is mutated.
- @param[in] settingsList {SettingsList} Settings-list instance.
- @return {number | undefined} Zero-based selected row index when available.

### fn `export async function showPiUsereqSettingsMenu(` (L232-236)
- @brief Renders one shared pi-usereq settings menu and resolves the selected action.
- @details Uses `ctx.ui.custom(...)` plus `SettingsList` so every configuration menu shares pi.dev styling, right-aligned current values, circular scrolling, bottom-line descriptions, optional disabled rows, and inline toggle cycles that do not close the menu. When callers provide `getChoices(...)`, dependent rows are rebuilt after inline changes while preserving focus on the changed row. The returned custom component also exposes an offline bridge for deterministic tests and debug harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering and caller-owned inline-change callbacks.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] title {string} Menu title displayed in the heading and offline bridge.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @param[in] options {PiUsereqSettingsMenuOptions | undefined} Optional initial-focus override plus inline-change behavior.
- @return {Promise<string | undefined>} Selected choice identifier or `undefined` when cancelled.
- @satisfies REQ-151, REQ-152, REQ-153, REQ-154, REQ-156, REQ-192

### fn `const rebuildMenu = (selectedChoiceId?: string): void =>` (L272-279)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqSettingsMenuChoice`|iface||14-23|export interface PiUsereqSettingsMenuChoice|
|`PiUsereqSettingsMenuBridge`|iface||29-35|export interface PiUsereqSettingsMenuBridge|
|`PiUsereqSettingsMenuOptions`|iface||41-45|export interface PiUsereqSettingsMenuOptions|
|`PiUsereqSettingsMenuComponent`|iface||51-53|export interface PiUsereqSettingsMenuComponent extends Co...|
|`PiUsereqSettingsThemeColor`|type||61||
|`PiUsereqSettingsTheme`|iface||70-73|interface PiUsereqSettingsTheme|
|`buildFallbackPiUsereqSettingsListTheme`|fn||85-97|function buildFallbackPiUsereqSettingsListTheme(|
|`buildPiUsereqSettingsListTheme`|fn||110-124|function buildPiUsereqSettingsListTheme(|
|`formatPiUsereqSettingsMenuTitle`|fn||136-141|function formatPiUsereqSettingsMenuTitle(|
|`createImmediateSelectionComponent`|fn||150-162|function createImmediateSelectionComponent(choiceId: stri...|
|`buildSettingItems`|fn||172-193|function buildSettingItems(|
|`setSettingsListSelectedIndex`|fn||202-207|function setSettingsListSelectedIndex(|
|`getSettingsListSelectedIndex`|fn||215-220|function getSettingsListSelectedIndex(|
|`showPiUsereqSettingsMenu`|fn||232-236|export async function showPiUsereqSettingsMenu(|
|`rebuildMenu`|fn||272-279|const rebuildMenu = (selectedChoiceId?: string): void =>|


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

# source-presence.ts | TypeScript | 101L | 4 symbols | 4 imports | 7 comments
> Path: `src/core/source-presence.ts`
- @brief Detects analyzable source presence and writes no-source placeholder documents.
- @details Exposes the git-file-inventory probe that decides whether the configured source directories hold at least one supported source file, plus the documented placeholder payloads and the writer that materializes them under `<base-path>/<docs-dir>`. Consumed by the non-agentic `req-references` workflow and by the `req-workflow` preflight so documentation-only repositories receive the documented `NO_SOURCE_CODE_DETECTED` system directive instead of failing source extraction or dispatching an agentic workflow. Runtime is dominated by one `git ls-files` subprocess for the presence probe plus one file write. Side effects include subprocess creation and filesystem writes.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import type { UseReqConfig } from "./config.js";
import { collectSourceFiles } from "./tool-runner.js";
```

## Definitions

- type `export type NoSourcePlaceholderFileName = "REFERENCES.md" | "WORKFLOW.md";` (L16)
- @brief Enumerates the document filenames receiving no-source placeholder payloads.
- @details Restricts placeholder rendering to the two documents whose generation depends on analyzable source code. Access complexity is O(1).
### fn `export function resolveNoSourcePlaceholderContent(fileName: NoSourcePlaceholderFileName): string` (L63-67)
- @brief Resolves the placeholder payload for one targeted document.
- @details Maps the two supported document filenames onto their declared payloads so callers never duplicate the `NO_SOURCE_CODE_DETECTED` directive text. Runtime is O(1). No external state is mutated.
- @param[in] fileName {NoSourcePlaceholderFileName} Targeted document filename.
- @return {string} Exact placeholder payload for the document.
- @satisfies REQ-622

### fn `export function hasAnalyzableSourceFiles(projectBase: string, config: UseReqConfig): boolean` (L78-80)
- @brief Tests whether the configured source directories hold at least one supported source file.
- @details Enumerates the repository git file inventory through `collectSourceFiles(...)`, which applies the configured `src-dir` roots, excluded directories, and the supported-extension filter, so documentation-only repositories report `false` while repositories holding any analyzable language file report `true`. Runtime is dominated by one `git ls-files` subprocess. Side effects include subprocess creation.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration supplying `src-dir`.
- @return {boolean} `true` when at least one supported source file exists in the configured source inventory.
- @throws {ReqError} Throws when the git file inventory cannot be collected.
- @satisfies REQ-620, REQ-621

### fn `export function writeNoSourcePlaceholderDocument(` (L92-101)
- @brief Writes one no-source placeholder document under the configured docs directory.
- @details Resolves `<base-path>/<docs-dir>/<fileName>` from the trailing-slash-free persisted `docs-dir` and overwrites it with the exact declared placeholder payload so the resulting document is byte-stable for downstream parsers and tests. Runtime is O(n) in payload length plus one file write. Side effects include one file overwrite.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration supplying `docs-dir`.
- @param[in] fileName {NoSourcePlaceholderFileName} Targeted document filename.
- @return {string} Absolute path of the written placeholder document.
- @throws {Error} Propagates filesystem write failures.
- @satisfies REQ-620, REQ-621, REQ-622

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`NoSourcePlaceholderFileName`|type||16||
|`resolveNoSourcePlaceholderContent`|fn||63-67|export function resolveNoSourcePlaceholderContent(fileNam...|
|`hasAnalyzableSourceFiles`|fn||78-80|export function hasAnalyzableSourceFiles(projectBase: str...|
|`writeNoSourcePlaceholderDocument`|fn||92-101|export function writeNoSourcePlaceholderDocument(|


---

# static-check.ts | TypeScript | 601L | 18 symbols | 8 imports | 31 comments
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
import type { StaticCheckEntry, UseReqConfig } from "./config.js";
import { ReqError } from "./errors.js";
import { getInstallationPath } from "./path-context.js";
```

## Definitions

### iface `export interface StaticCheckLanguageSupport` (L92-95)
- @brief Describes supported extensions for one canonical static-check language.
- @details The interface is used for UI rendering and capability reporting only. It is compile-time only and adds no runtime cost.

### fn `export function getSupportedStaticCheckLanguages(): string[]` (L110-112)
- @brief Returns the sorted list of canonical languages with extension support.
- @details Deduplicates the extension map values and sorts them alphabetically for stable UI and error messages. Runtime is O(n log n). No side effects occur.
- @return {string[]} Sorted canonical language names.

### fn `export function getSupportedStaticCheckLanguageSupport(): StaticCheckLanguageSupport[]` (L119-130)
- @brief Returns supported languages paired with their known file extensions.
- @details Groups extensions by canonical language and emits alphabetically sorted extension lists. Runtime is O(n log n). No external state is mutated.
- @return {StaticCheckLanguageSupport[]} Sorted language-support descriptors.

### fn `function formatStaticCheckModules(): string` (L137-139)
- @brief Formats the user-configurable module list for diagnostics.
- @details Joins `STATIC_CHECK_MODULES` with commas for direct insertion into user-facing error strings. Time complexity is O(n). No side effects occur.
- @return {string} Comma-delimited user-configurable module names.

### fn `function formatDispatchStaticCheckModules(): string` (L146-148)
- @brief Formats the persisted or debug-capable module list for dispatch diagnostics.
- @details Joins `STATIC_CHECK_PERSISTED_MODULES` with commas for error strings emitted while executing existing config entries or debug-driver requests. Time complexity is O(n). No side effects occur.
- @return {string} Comma-delimited persisted module names.

### fn `function splitCsvLikeTokens(specRhs: string): string[]` (L156-178)
- @brief Splits a comma-delimited static-check specification while honoring quotes.
- @details Performs a single pass over the right-hand side of `LANG=...`, preserving commas inside quoted segments. Runtime is O(n). No side effects occur.
- @param[in] specRhs {string} Right-hand side of the enable-static-check specification.
- @return {string[]} Parsed tokens with surrounding whitespace trimmed.

### fn `export function parseEnableStaticCheck(spec: string): [string, StaticCheckEntry]` (L187-235)
- @brief Parses one `LANG=Command,CMD[,PARAM...]` static-check specification.
- @details Validates the language alias, canonicalizes the Command module name, enforces the required executable argument, and returns a config entry ready for persistence. Runtime is O(n) in specification length. No external state is mutated.
- @param[in] spec {string} Raw static-check specification string.
- @return {[string, StaticCheckEntry]} Tuple of canonical language name and normalized checker configuration.
- @throws {ReqError} Throws for missing separators, unknown languages, non-Command modules, or missing required command arguments.

### fn `export function buildStaticCheckEntryIdentity(language: string, entry: StaticCheckEntry): string` (L245-250)
- @brief Builds the duplicate-identity token for one static-check entry.
- @details Canonicalizes the language key, module name, command name, and parameter list into a stable JSON tuple used for merge deduplication. Runtime is O(p) in parameter count. No side effects occur.
- @param[in] language {string} Canonical or alias language name associated with the entry.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to normalize.
- @return {string} Stable identity token suitable for equality comparison.
- @satisfies REQ-036

### fn `export function validateStaticCheckEntry(entry: StaticCheckEntry): void` (L260-271)
- @brief Validates pre-persistence invariants for one static-check entry.
- @details Rejects `Command` entries whose executable cannot be resolved before config writes while leaving non-command modules untouched. Runtime is O(p) in PATH entry count. Side effects are limited to filesystem reads.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to validate.
- @return {void} No return value.
- @throws {ReqError} Throws when a `Command` entry omits `cmd` or resolves to a non-executable program.
- @satisfies REQ-037

### fn `function resolveFiles(inputs: string[]): string[]` (L279-303)
- @brief Resolves explicit files, directories, and glob patterns into absolute file paths.
- @details Expands glob inputs with `fast-glob`, enumerates direct children for directory inputs, accepts regular files, and warns for invalid entries. Runtime is O(n + m) where m is the total matched path count. Side effects are filesystem reads and warning output to stderr.
- @param[in] inputs {string[]} Raw file, directory, or glob inputs.
- @return {string[]} Unique absolute file paths.

### class `export class StaticCheckBase` (L309-383)
- @brief Provides the shared and debug-capable base implementation for file-oriented static checks.
- @details Resolves input files once, emits standardized headers, implements the debug `Dummy` checker behavior, and defines overridable `checkFile` plus `emitLine` hooks used by concrete analyzers. Runtime is O(f) plus subclass checker cost. Side effects include console output.

### class `export class StaticCheckCommand extends StaticCheckBase` : StaticCheckBase (L389-439)
- @brief Runs the user-facing external-command static checker.
- @brief Initializes a command-backed checker instance.
- @details Validates command availability on PATH during construction, then invokes the command with configured extra arguments plus one target file at a time. Runtime is dominated by external command execution. Side effects include PATH probing, process spawning, and console output.
- @details Validates that the executable exists on PATH before delegating file resolution to the base class and recording the command label. Runtime is O(p + f) where p is PATH entry count and f is resolved input count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name.
- @param[in] inputs {string[]} Raw file inputs.
- @param[in] extraArgs {string[] | undefined} Extra command arguments.
- @param[in] failOnly {boolean} When `true`, suppress successful-file output.
- @throws {ReqError} Throws when the executable cannot be found on PATH.

### fn `function isExecutableFile(candidate: string): boolean` (L447-457)
- @brief Tests whether one filesystem path is executable.
- @details Requires the candidate to exist, be a regular file, and pass `X_OK` access checks. Runtime is O(1). Side effects are limited to filesystem reads.
- @param[in] candidate {string} Absolute or relative path to inspect.
- @return {boolean} `true` when the candidate is executable by the current process.

### fn `export function findExecutable(cmd: string): string | undefined` (L465-476)
- @brief Locates an executable by scanning the current PATH.
- @details Checks each PATH directory for an executable file named exactly as the requested command. Runtime is O(p) in PATH entry count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name to locate.
- @return {string | undefined} Absolute executable path, or `undefined` when not found.

### fn `export function resolveCheckerExecutable(cmd: string): string | undefined` (L485-505)
- @brief Resolves one checker executable across installation-keyword, bundled `node_modules/.bin`, and PATH locations.
- @details Substitutes the `%%INSTALLATION_PATH%%` keyword with the runtime installation path and verifies the resulting explicit path when present, then probes the installation-owned `node_modules/.bin` directory, the project-scope parent `node_modules/.bin` directory used by `--prefix` layouts, and finally the system PATH scan, returning the first executable match so default configuration requires no target-project module installation. Runtime is O(p) in PATH entry count plus bounded filesystem metadata checks. Side effects are limited to filesystem reads.
- @param[in] cmd {string} Executable name, explicit path, or `%%INSTALLATION_PATH%%`-anchored path to resolve.
- @return {string | undefined} Absolute executable path, or `undefined` when not found in any probed location.
- @satisfies REQ-023, REQ-037, DES-018, DES-019, REQ-350, REQ-351

### fn `export function checkDefaultCheckersAvailability(config: UseReqConfig): string[]` (L514-534)
- @brief Determines which enabled static-check executables are missing from the runtime environment.
- @details Iterates every enabled language checker entry in the effective config, resolves each `Command` entry executable through `resolveCheckerExecutable`, and collects the missing command names so the caller can surface one consolidated warning. Runtime is O(l * c * p) where l is language count, c is checker count, and p is PATH entry count. Side effects are limited to filesystem reads.
- @param[in] config {UseReqConfig} Effective merged configuration.
- @return {string[]} Unique command names that are enabled but unresolvable.
- @satisfies REQ-341, REQ-343, REQ-344

### fn `export function dispatchStaticCheckForFile(` (L545-548)
- @brief Dispatches one configured static checker for a single file.
- @details Selects the debug `Dummy` or user-facing `Command` implementation by module name, normalizes parameter arrays, and runs exactly one checker instance against the target file. Runtime is dominated by the selected checker. Side effects include console output and possible process spawning.
- @param[in] filePath {string} Absolute or relative file path to check.
- @param[in] langConfig {StaticCheckEntry} Normalized static-check configuration entry.
- @param[in] options {{ failOnly?: boolean; projectBase?: string }} Optional execution controls.
- @return {number} Checker exit status where `0` means success and non-zero means failure.
- @throws {ReqError} Throws when configuration is incomplete or names an unknown module.

### fn `export function runStaticCheck(argv: string[]): number` (L577-601)
- @brief Runs the standalone static-check test driver.
- @details Dispatches debug `dummy` or user-facing `command` subcommands without consulting project configuration. Runtime is O(n) in argument count plus checker cost. Side effects include console output and external process spawning.
- @param[in] argv {string[]} Raw static-check subcommand arguments.
- @return {number} Checker exit status where `0` means success.
- @throws {ReqError} Throws when no subcommand is provided, the subcommand is unknown, or required arguments are missing.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckLanguageSupport`|iface||92-95|export interface StaticCheckLanguageSupport|
|`getSupportedStaticCheckLanguages`|fn||110-112|export function getSupportedStaticCheckLanguages(): string[]|
|`getSupportedStaticCheckLanguageSupport`|fn||119-130|export function getSupportedStaticCheckLanguageSupport():...|
|`formatStaticCheckModules`|fn||137-139|function formatStaticCheckModules(): string|
|`formatDispatchStaticCheckModules`|fn||146-148|function formatDispatchStaticCheckModules(): string|
|`splitCsvLikeTokens`|fn||156-178|function splitCsvLikeTokens(specRhs: string): string[]|
|`parseEnableStaticCheck`|fn||187-235|export function parseEnableStaticCheck(spec: string): [st...|
|`buildStaticCheckEntryIdentity`|fn||245-250|export function buildStaticCheckEntryIdentity(language: s...|
|`validateStaticCheckEntry`|fn||260-271|export function validateStaticCheckEntry(entry: StaticChe...|
|`resolveFiles`|fn||279-303|function resolveFiles(inputs: string[]): string[]|
|`StaticCheckBase`|class||309-383|export class StaticCheckBase|
|`StaticCheckCommand`|class||389-439|export class StaticCheckCommand extends StaticCheckBase|
|`isExecutableFile`|fn||447-457|function isExecutableFile(candidate: string): boolean|
|`findExecutable`|fn||465-476|export function findExecutable(cmd: string): string | und...|
|`resolveCheckerExecutable`|fn||485-505|export function resolveCheckerExecutable(cmd: string): st...|
|`checkDefaultCheckersAvailability`|fn||514-534|export function checkDefaultCheckersAvailability(config: ...|
|`dispatchStaticCheckForFile`|fn||545-548|export function dispatchStaticCheckForFile(|
|`runStaticCheck`|fn||577-601|export function runStaticCheck(argv: string[]): number|


---

# token-counter.ts | TypeScript | 702L | 39 symbols | 6 imports | 44 comments
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

### iface `interface ProcessScopedTokenCounterStore` (L203-205)
- @brief Describes the process-scoped tokenizer state persisted across extension rebinds.
- @details Stores the per-encoding shared encoders on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, while the hosting process persists across those operations, so session rebinds reuse already parsed encoders instead of re-parsing the bundled BPE ranks. The interface is compile-time only and introduces no runtime cost.

### fn `function getProcessScopedTokenCounterStore(): ProcessScopedTokenCounterStore` (L212-218)
- @brief Returns the process-scoped tokenizer encoding cache.
- @details Lazily initializes one `globalThis` record so session rebinds never re-trigger the heavy encoder construction. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedTokenCounterStore} Mutable process-scoped tokenizer store.

### fn `function resolveTokenCounterEncoding(encodingName: string): TokenCounterEncoding` (L227-236)
- @brief Resolves one shared tokenizer encoding for a `TokenCounter` construction.
- @details Checks the process-scoped per-encoding cache first and constructs the `js-tiktoken` encoding only on the first request per encoding name, so repeated `TokenCounter` construction across the `files-tokens` runner, canonical-doc counting, and context-file measurement reuses one parsed encoder instead of re-parsing the bundled BPE ranks each time. Runtime is O(1) after the first construction for the encoding and dominated by the single deferred `getEncoding` construction otherwise. Side effect: mutates the process-scoped encoding cache on first resolution per encoding name.
- @param[in] encodingName {string} `js-tiktoken` encoding identifier.
- @return {TokenCounterEncoding} Cached or newly constructed tokenizer encoding.
- @throws {ReqError} Propagates the deterministic unavailable-dependency failure when `js-tiktoken` cannot be loaded.

### fn `export function setJsTiktokenModuleLoaderForTests(loader?: () => JsTiktokenModule): void` (L244-247)
- @brief Overrides the `js-tiktoken` loader for tests.
- @details Enables deterministic dependency-failure tests without mutating repository dependencies on disk. Clears the process-scoped encoding cache so every loader swap observes fresh module behavior instead of encoders constructed by the previous loader. Runtime is O(e) in cached encoding count. Side effects are limited to module-local test state and cache reset.
- @param[in] loader {(() => JsTiktokenModule) | undefined} Replacement loader, or `undefined` to restore the default loader.
- @return {void} No return value.

### fn `export function prewarmTokenCounterEncoder(encodingName = TOKEN_COUNTER_ENCODING): void` (L255-263)
- @brief Pre-warms the shared tokenizer encoder during idle time.
- @details Schedules one `setImmediate` task that resolves the shared encoding through the process-scoped cache, so the one-time `require("js-tiktoken")` plus bundled BPE-rank parse never executes inside a synchronous menu or preflight critical path. The task is best-effort: loader and encoding failures are swallowed because real failures still surface deterministically at measurement time. Runtime is O(1) for scheduling plus the deferred one-time construction cost. Side effect: schedules one process task and mutates the process-scoped encoding cache when the construction succeeds.
- @param[in] encodingName {string} `js-tiktoken` encoding identifier. Defaults to `cl100k_base`.
- @return {void} No return value.

### fn `function loadJsTiktokenModule(): JsTiktokenModule` (L271-288)
- @brief Loads the `js-tiktoken` module on demand.
- @details Defers dependency resolution until token counting is requested so extension registration can succeed even when the optional runtime dependency has not yet been installed. Runtime is O(1) plus module resolution cost. Side effects are limited to Node module loading.
- @return {JsTiktokenModule} Loaded tokenizer module.
- @throws {ReqError} Throws when `js-tiktoken` is unavailable.

### class `export class TokenCounter` (L294-334)
- @brief Encapsulates one tokenizer instance for repeated token counting.
- @brief Stores the tokenizer implementation used for subsequent counts.
- @details Resolves the process-scoped shared encoder for the requested encoding so multiple documents and multiple counter instances are counted without repeated encoding construction; the first construction per encoding name parses the BPE ranks once and every later `TokenCounter` reuses it through the module-local cache. Counting cost is O(n) in content length. The class mutates only instance state during construction.
- @details Holds the cached encoder resolved through the per-encoding process cache. Access complexity is O(1); construction is O(1) after the first resolution for the encoding name.

### fn `function canonicalizeTokenPath(filePath: string, baseDir: string): string` (L343-351)
- @brief Converts one filesystem path into the canonical token-payload path form.
- @details Emits a slash-normalized relative path when the target is under the supplied base directory; otherwise emits a slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
- @param[in] filePath {string} Candidate absolute or relative filesystem path.
- @param[in] baseDir {string} Reference directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function countLines(content: string): number` (L359-365)
- @brief Counts logical lines in one text payload.
- @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
- @param[in] content {string} Text payload.
- @return {number} Logical line count; `0` for empty content.

### fn `function stripMarkdownFrontMatter(content: string): string` (L373-376)
- @brief Strips YAML front matter from markdown content before heading extraction.
- @details Removes the first `--- ... ---` block only when it appears at the file start so heading detection can operate on semantic markdown content instead of metadata. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} Markdown payload.
- @return {string} Markdown body without the leading front matter block.

### fn `function extractPrimaryHeadingText(content: string, filePath: string): string | undefined` (L385-392)
- @brief Extracts the first level-one markdown heading when present.
- @details Restricts extraction to markdown-like files, skips YAML front matter, and returns the first `# ` heading payload without surrounding whitespace. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} File content.
- @param[in] filePath {string} Source path used for extension-based markdown detection.
- @return {string | undefined} First heading text, or `undefined` when absent or the file is not markdown-like.

### fn `function inferLanguageName(filePath: string): string | undefined` (L400-409)
- @brief Infers a file language label optimized for agent payloads.
- @details Reuses source-language detection when available, normalizes markdown extensions explicitly, and falls back to the lowercase extension name without the leading dot. Runtime is O(1). No side effects occur.
- @param[in] filePath {string} File path whose extension should be classified.
- @return {string | undefined} Normalized language label, or `undefined` when the path has no usable extension.

### fn `function extractLeadingDoxygenFields(content: string): DoxygenFieldMap | undefined` (L417-435)
- @brief Extracts leading Doxygen file fields when present.
- @details Tests common leading-comment syntaxes, normalizes an optional shebang away before matching, and returns the first non-empty parsed Doxygen map. Runtime is O(n) in comment length. No side effects occur.
- @param[in] content {string} File content.
- @return {DoxygenFieldMap | undefined} Parsed Doxygen field map, or `undefined` when no supported file-level fields are present.

### fn `function probeRequestedPath(absolutePath: string): { exists: boolean; isFile: boolean; reason?: string }` (L443-457)
- @brief Probes one requested path before token counting.
- @details Resolves whether the target exists and is a regular file while capturing a stable skip reason for missing or non-file inputs. Runtime is dominated by one filesystem stat. Side effects are limited to filesystem reads.
- @param[in] absolutePath {string} Absolute path to inspect.
- @return {{ exists: boolean; isFile: boolean; reason?: string }} Path probe result.

### fn `function buildCountFileMetricsResult(filePath: string, content: string, counter: TokenCounter): CountFileMetricsResult` (L467-482)
- @brief Builds one rich per-file metrics record from readable content.
- @details Combines token, character, byte, and line counts with file-extension, inferred-language, heading, and Doxygen metadata extraction so agents can consume direct-access facts without reparsing the raw file. Runtime is O(n) in content length. No external state is mutated.
- @param[in] filePath {string} Absolute or project-local file path.
- @param[in] content {string} UTF-8 file content.
- @param[in] counter {TokenCounter} Reused token counter instance.
- @return {CountFileMetricsResult} Structured per-file metrics record.

### fn `export function countTextTokensAndChars(content: string, encodingName = TOKEN_COUNTER_ENCODING):` (L491-500)
- @brief Counts only tokenizer tokens and characters for one in-memory content string.
- @details Lean variant of the former full-metrics counter used by context-file sizing: resolves the process-cached shared `TokenCounter` encoder, tokenizes the supplied text once, and pairs the result with the raw character length while skipping UTF-8 byte sizing and the logical-line regex allocation. Token and character semantics are bit-identical to the full metrics contract. Runtime is O(n) after the one-time per-encoding encoder construction. No filesystem I/O occurs.
- @param[in] content {string} Text payload to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {{ tokens: number; chars: number }} Token estimate and character count for the supplied content.

### iface `interface FileMetricsCacheEntry` (L506-509)
- @brief Describes one stat-signed full-metrics cache entry.
- @details Pairs one computed `CountFileMetricsResult` with the `mtimeMs` plus `size` filesystem signature observed at computation time so later invocations can reuse the record through one stat call. The interface is compile-time only and introduces no runtime cost.

### iface `interface ProcessScopedFileMetricsStore` (L521-523)
- @brief Describes the process-scoped per-file metrics state persisted across extension rebinds.
- @details Stores the stat-signed full-metric records on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, while the hosting process persists across those operations, so repeated `files-tokens` and canonical-doc `tokens` invocations reuse already encoded documents instead of re-encoding unchanged content. The interface is compile-time only and introduces no runtime cost.

### fn `function getProcessScopedFileMetricsStore(): ProcessScopedFileMetricsStore` (L530-536)
- @brief Returns the process-scoped per-file metrics cache.
- @details Lazily initializes one `globalThis` record so session rebinds never re-trigger the heavy per-file encode path. Runtime is O(1). Side effect: initializes process-scoped state on first access.
- @return {ProcessScopedFileMetricsStore} Mutable process-scoped metrics store.

### fn `export function countFilesMetrics(filePaths: string[], encodingName = TOKEN_COUNTER_ENCODING): CountFileMetricsResult[]` (L546-588)
- @brief Counts tokens, characters, bytes, and lines for multiple files.
- @details Reuses a single `TokenCounter`, reuses stat-signed cached metric records for unchanged files through one stat call per path, reads changed files as UTF-8, and returns per-file metrics plus direct-access metadata such as heading and Doxygen file fields. Read failures are captured as error strings instead of aborting the entire batch, and failed targets are never cached. Runtime is O(F + S) on first measurement per content revision and O(F) in stat calls per unchanged remeasure. Side effects are limited to filesystem reads and process-scoped cache mutation.
- @param[in] filePaths {string[]} File paths to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {CountFileMetricsResult[]} Per-file metrics and optional read errors.
- @satisfies REQ-010, REQ-070, REQ-073

### fn `export function buildTokenToolPayload(options: BuildTokenToolPayloadOptions): TokenToolPayload` (L597-670)
- @brief Builds the agent-oriented JSON payload for token-centric tools.
- @details Validates requested paths against the filesystem, counts token metrics for processable files, preserves caller order in the file table, and emits direct-access file facts such as sizes, headings, and optional Doxygen file fields while omitting request echoes and derived guidance. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] options {BuildTokenToolPayloadOptions} Payload-construction options.
- @return {TokenToolPayload} Structured token payload ordered as summary then files.
- @satisfies REQ-010, REQ-017, REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075

### fn `export function formatPackSummary(results: CountFileMetricsResult[]): string` (L678-702)
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
|`ProcessScopedTokenCounterStore`|iface||203-205|interface ProcessScopedTokenCounterStore|
|`getProcessScopedTokenCounterStore`|fn||212-218|function getProcessScopedTokenCounterStore(): ProcessScop...|
|`resolveTokenCounterEncoding`|fn||227-236|function resolveTokenCounterEncoding(encodingName: string...|
|`setJsTiktokenModuleLoaderForTests`|fn||244-247|export function setJsTiktokenModuleLoaderForTests(loader?...|
|`prewarmTokenCounterEncoder`|fn||255-263|export function prewarmTokenCounterEncoder(encodingName =...|
|`loadJsTiktokenModule`|fn||271-288|function loadJsTiktokenModule(): JsTiktokenModule|
|`TokenCounter`|class||294-334|export class TokenCounter|
|`canonicalizeTokenPath`|fn||343-351|function canonicalizeTokenPath(filePath: string, baseDir:...|
|`countLines`|fn||359-365|function countLines(content: string): number|
|`stripMarkdownFrontMatter`|fn||373-376|function stripMarkdownFrontMatter(content: string): string|
|`extractPrimaryHeadingText`|fn||385-392|function extractPrimaryHeadingText(content: string, fileP...|
|`inferLanguageName`|fn||400-409|function inferLanguageName(filePath: string): string | un...|
|`extractLeadingDoxygenFields`|fn||417-435|function extractLeadingDoxygenFields(content: string): Do...|
|`probeRequestedPath`|fn||443-457|function probeRequestedPath(absolutePath: string): { exis...|
|`buildCountFileMetricsResult`|fn||467-482|function buildCountFileMetricsResult(filePath: string, co...|
|`countTextTokensAndChars`|fn||491-500|export function countTextTokensAndChars(content: string, ...|
|`FileMetricsCacheEntry`|iface||506-509|interface FileMetricsCacheEntry|
|`ProcessScopedFileMetricsStore`|iface||521-523|interface ProcessScopedFileMetricsStore|
|`getProcessScopedFileMetricsStore`|fn||530-536|function getProcessScopedFileMetricsStore(): ProcessScope...|
|`countFilesMetrics`|fn||546-588|export function countFilesMetrics(filePaths: string[], en...|
|`buildTokenToolPayload`|fn||597-670|export function buildTokenToolPayload(options: BuildToken...|
|`formatPackSummary`|fn||678-702|export function formatPackSummary(results: CountFileMetri...|


---

# tool-runner.ts | TypeScript | 458L | 22 symbols | 11 imports | 24 comments
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

### fn `export function runFilesSummarize(files: string[], cwd = process.cwd(), verbose = false): ToolResult` (L250-256)
- @brief Generates the monolithic summary markdown for explicit files.
- @details Delegates to `generateMarkdown(...)`, keeps output paths relative to the caller cwd, and returns the Python-compatible summary markdown document through stdout. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
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

### fn `export function runSummarize(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult` (L298-309)
- @brief Generates the monolithic summary markdown for configured source directories.
- @details Resolves the project base, collects configured source files, prepends the repository file-structure markdown block, and returns the Python-compatible summary document through stdout. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing monolithic markdown.
- @throws {ReqError} Throws when no source files are found or no file can be analyzed.
- @satisfies REQ-014, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult` (L321-329)
- @brief Writes configured project references markdown to the canonical docs file.
- @details Reuses `runSummarize(...)` to generate the same file-structure-plus-summary markdown, resolves `<docs-dir>/REFERENCES.md` from the effective project configuration, overwrites the target file, and returns the status-only stdout `success`. Runtime is O(F log F + S) plus one file write. Side effects include filesystem writes.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr during summary generation.
- @return {ToolResult} Successful tool result containing the status-only stdout payload.
- @throws {ReqError} Throws when source discovery, summary generation, or file writing fails.
- @satisfies REQ-293

### fn `export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L341-346)
- @brief Compresses all source files from configured source directories.
- @details Resolves the project base, collects source files, and delegates to `compressFiles`. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runSearch(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L360-369)
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

### fn `export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult` (L379-388)
- @brief Counts tokens for canonical documentation files.
- @details Loads the configured docs directory, selects `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` when present, and delegates to `runFilesTokens`. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Tool result containing documentation token metrics.
- @throws {ReqError} Throws when no canonical docs files exist.

### fn `export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult` (L398-434)
- @brief Runs configured static checks for explicit files.
- @details Loads the effective static-check config, resolves the active checker list per file-extension language through the per-language enable flag, captures checker stdout for each dispatched entry, and aggregates stderr warnings for invalid paths. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] files {string[]} Explicit file paths.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.

### fn `export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L444-457)
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
|`runFilesSummarize`|fn||250-256|export function runFilesSummarize(files: string[], cwd = ...|
|`runFilesCompress`|fn||267-269|export function runFilesCompress(files: string[], cwd = p...|
|`runFilesSearch`|fn||280-286|export function runFilesSearch(argsList: string[], enable...|
|`runSummarize`|fn||298-309|export function runSummarize(projectBase: string, config?...|
|`runReferences`|fn||321-329|export function runReferences(projectBase: string, config...|
|`runCompress`|fn||341-346|export function runCompress(projectBase: string, config?:...|
|`runSearch`|fn||360-369|export function runSearch(projectBase: string, tagFilter:...|
|`runTokens`|fn||379-388|export function runTokens(projectBase: string, config?: U...|
|`runFilesStaticCheck`|fn||398-434|export function runFilesStaticCheck(files: string[], proj...|
|`runProjectStaticCheck`|fn||444-457|export function runProjectStaticCheck(projectBase: string...|


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

# index.ts | TypeScript | 5642L | 125 symbols | 33 imports | 212 comments
> Path: `src/index.ts`
- @brief Registers the pi-usereq extension commands, tools, and configuration UI.
- @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import type {
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import {
import {
import {
import {
import { showPiUsereqSettingsMenu, type PiUsereqSettingsMenuChoice } from "./core/settings-menu.js";
import {
import {
import {
import {
import {
import {
import {
import { PROMPT_COMMAND_NAMES } from "./core/prompt-command-catalog.js";
import { hasAnalyzableSourceFiles, writeNoSourcePlaceholderDocument } from "./core/source-presence.js";
import { resolveRuntimeGitPath } from "./core/runtime-project-paths.js";
import {
import {
import {
import { ensureBundledResourcesAccessible, readBundledPromptDescription } from "./core/resources.js";
import {
import { ReqError } from "./core/errors.js";
import { deployPiUsereqLauncher, deployUserBinPiUsereqLauncher, isPiPackageInstallation } from "./core/bin-deploy.js";
import {
import {
import {
import { LANGUAGE_TAGS } from "./core/find-constructs.js";
import {
import { makeRelativeIfContainsProject, shellSplit } from "./core/utils.js";
```

## Definitions

- type `type FindToolScope = "explicit-files" | "configured-source-directories";` (L32)
- @brief Enumerates the search-tool scopes accepted by the search agent-tool registrations.
- @details Restricts parameter-schema and prompt-guideline builders to the explicit-file and configured-source-directory selection modes. The alias is compile-time only and introduces no runtime cost.
### iface `interface PiShortcutRegistrar` (L246-254)
- @brief Describes the optional shortcut-registration surface used by pi-usereq.
- @details Narrows the runtime API to the documented `registerShortcut(...)`
method so the extension can remain compatible with offline harnesses that do
not implement shortcut capture. Compile-time only and introduces no runtime
cost.

### fn `function getProjectBase(cwd: string): string` (L262-271)
- @brief Resolves the effective project base from a working directory.
- @details Normalizes the provided cwd into an absolute path without consulting configuration. Time complexity is O(1). No I/O side effects occur.
- @param[in] cwd {string} Current working directory.
- @return {string} Absolute project base path.

### fn `function getProcessCwdSafe(): string` (L278-287)
- @brief Resolves a safe process working directory for extension-load paths.
- @details Returns `process.cwd()` when available and falls back to absolute `PWD`, `HOME`, or `/` when the current shell directory has been deleted. Runtime is O(1). No external state is mutated.
- @return {string} Absolute fallback-safe process working directory.

### fn `function resolveLiveBootstrapCwd(cwd: string): string` (L295-307)
- @brief Resolves the live working directory used for bootstrap-sensitive flows.
- @details Prefers the supplied cwd when it still exists. Otherwise reuses the tracked runtime context path when it remains live, then the tracked runtime base path, and finally a process-safe cwd so deleted worktree paths retained by stale contexts cannot poison later prompt preflight or lifecycle bootstrap. Runtime is O(1) plus bounded filesystem probes. No external state is mutated.
- @param[in] cwd {string} Candidate context cwd.
- @return {string} Existing absolute cwd used for bootstrap work.

### fn `function syncContextCwdMirror(ctx: { cwd?: string }, cwd: string): void` (L316-325)
- @brief Best-effort synchronizes one context `cwd` mirror with bootstrap reality.
- @details Applies the resolved live cwd to the supplied context when writable and ignores stale or read-only mirrors so command bootstrap can continue using authoritative filesystem probes. Runtime is O(1). Side effects are limited to optional `ctx.cwd` mutation.
- @param[in] cwd {string} Resolved live cwd.
- @param[in,out] ctx {{ cwd?: string }} Mutable context-like object.
- @return {void} No return value.

### fn `function loadPromptRunBaseConfig(projectBase: string): UseReqConfig` (L334-336)
- @brief Loads the effective configuration anchored at one exact prompt-run project base.
- @details Reads the split local and global configuration scoped to the supplied absolute `projectBase` without consulting the shared runtime path state, because during worktree-backed prompt runs the runtime `base-path` resolves to the execution checkout whose untracked `.pi-usereq.json` is absent while the prompt debug gating configuration lives at the original project base that also produced the `-request` and `-prompt` debug files. Runtime is dominated by config I/O. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute original project base path recorded in the prompt execution plan.
- @return {UseReqConfig} Effective configuration anchored at the exact supplied project base.
- @satisfies REQ-416, REQ-421

### fn `function buildPromptProviderReplayFacts(` (L346-361)
- @brief Builds the replay facts captured beside one provider request payload.
- @details Reads the provider, API, base URL, model identifier, thinking level, context-window, and max-output-token facts from the live extension-context model plus the execution-session file from the live prompt execution plan so the error-stage replay sidecar can emit ready-to-use `curl` and `pi` replay command lines without live runtime state at flush time. Degrades every fact to `undefined` when the runtime model is unavailable so the capture never aborts. Runtime is O(1). No external state is mutated.
- @param[in] ctx {ExtensionContext} Active extension context supplying the live model and thinking level.
- @param[in] executionSessionFile {string | undefined} Persisted execution-session file of the active prompt run retained per REQ-209.
- @return {PromptErrorReplayFacts} Replay facts consumed by the error-stage sidecar writer.
- @satisfies REQ-430

### fn `function loadProjectConfig(cwd: string): UseReqConfig` (L370-373)
- @brief Loads project configuration for the extension runtime.
- @details Resolves the project base, loads persisted config, and normalizes configured directory paths without reading or persisting runtime-derived `base-path` or `git-path` metadata. Runtime is dominated by config I/O. Side effects are limited to filesystem reads.
- @param[in] cwd {string} Current working directory.
- @return {UseReqConfig} Effective project configuration.
- @satisfies REQ-030, REQ-145, REQ-146

- type `type DebugToolCommandExecuteResult = ReturnType<typeof buildMonolithicToolExecuteResult>;` (L379)
- @brief Describes the execute-result surface reused by debug tool wrapper commands.
- @details Narrows debug slash-command handlers to the same monolithic content-plus-execution wrapper returned by agent tools so editor output and notifications can reuse shared extraction helpers. The alias is compile-time only and introduces no runtime cost.
### fn `function shouldRegisterDebugToolCommands(cwd: string): boolean` (L388-394)
- @brief Tests whether debug tool wrapper commands should be registered for one runtime cwd.
- @details Loads the effective project configuration for the supplied cwd and returns `true` only when `DEBUG_TOOL_COMMANDS_ENABLED` resolves to `enable`. Malformed or unreadable config payloads degrade to `false` so extension activation never aborts while deciding whether to register optional debug commands. Runtime is dominated by config I/O. Side effects are limited to filesystem reads.
- @param[in] cwd {string} Candidate runtime working directory.
- @return {boolean} `true` when debug tool wrapper commands should be registered.
- @satisfies REQ-323

### fn `function writeDebugToolCommandResultToEditor(` (L405-419)
- @brief Writes one debug tool-wrapper result into the editor and emits a status notification.
- @details Extracts the primary monolithic content text from the wrapped tool result, forwards that exact text to the editor, and emits an informational or error notification keyed by the tool exit code. Runtime is O(n) in output length. Side effects include editor-text mutation and UI notifications.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] commandName {string} Invoked debug slash-command name without the leading `/`.
- @param[in] result {DebugToolCommandExecuteResult} Wrapped tool execution result.
- @return {void} No return value.
- @satisfies REQ-324

### fn `function executeDebugToolCommand(` (L431-449)
- @brief Executes one config-gated debug tool wrapper slash command.
- @details Resolves a live cwd for the invoking command context, refreshes runtime path state, loads the effective project configuration, rejects execution when debug tool wrapper commands are disabled, and otherwise writes the selected wrapped tool output into the editor. Runtime is dominated by the delegated tool runner. Side effects include runtime-path bootstrap, filesystem reads, optional tool side effects, editor-text mutation, and UI notifications.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] commandName {string} Invoked debug slash-command name without the leading `/`.
- @param[in] operation {(projectBase: string, config: UseReqConfig) => DebugToolCommandExecuteResult} Wrapped tool executor.
- @return {void} No return value.
- @throws {ReqError} Throws when debug tool wrapper commands are disabled for the active project.
- @satisfies REQ-324, REQ-325

### fn `function registerDebugToolCommands(pi: ExtensionAPI): void` (L458-497)
- @brief Registers config-gated debug slash-command wrappers for selected project analysis tools.
- @details Registers `debug-compress`, `debug-references`, `debug-static-check`, `debug-summarize`, and `debug-tokens` as extension commands that reuse the same runner paths as the corresponding agent tools and write the resulting monolithic text into the editor instead of the LLM content channel. Re-registering the same commands is idempotent because pi keeps the latest same-extension command definition per name. Runtime is O(1) for registration; handler cost depends on the selected runner. Side effects include command registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies DES-015, REQ-323, REQ-324, REQ-325

### fn `function saveProjectConfig(cwd: string, config: UseReqConfig): void` (L507-510)
- @brief Persists effective project configuration from the extension runtime.
- @details Resolves the project base, normalizes configured local directory paths into project-relative form, and delegates split local/global persistence to `saveConfig` without serializing runtime-derived path metadata. Runtime is O(n) in config size. Side effects include config-file writes.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Effective configuration to persist.
- @return {void} No return value.
- @satisfies REQ-146, REQ-315

### fn `function formatLocalConfigPathForMenu(cwd: string): string` (L519-523)
- @brief Formats the current local config path for top-level menu display.
- @details Resolves `<base-path>/.pi-usereq.json` from the cwd-derived project base and reuses the shared runtime-path formatter so the `Show local configuration` row uses the documented `~`-relative display contract. Runtime is O(p) in path length. No external state is mutated.
- @param[in] cwd {string} Current working directory.
- @return {string} `~`-relative or absolute local config-path display value.
- @satisfies REQ-162

### fn `function formatGlobalConfigPathForMenu(): string` (L531-533)
- @brief Formats the current global config path for top-level menu display.
- @details Resolves `~/.config/pi-usereq/config.json` through the shared runtime-path formatter so the `Show global configuration` row uses the documented `~`-relative display contract. Runtime is O(p) in path length. No external state is mutated.
- @return {string} `~`-relative or absolute global config-path display value.
- @satisfies REQ-319

### fn `function buildTerminalSettingsMenuChoices(options:` (L542-553)
- @brief Builds the standardized terminal rows appended to every configuration menu.
- @details Returns the canonical value-less `Reset defaults` row so all configuration menus and descendant selector menus share the same terminal ordering contract without rendering `Save and close`. Runtime is O(1). No external state is mutated.
- @param[in] options {{ resetDefaultsDescription: string }} Menu-specific terminal-row metadata.
- @return {PiUsereqSettingsMenuChoice[]} Ordered terminal menu rows.
- @satisfies REQ-193

### iface `interface ResetConfirmationChange` (L559-563)
- @brief Describes one pending reset value change shown in confirmation menus.
- @details Stores the row label plus its previous and next values so reset-confirmation submenus can expose machine-readable and human-verifiable change previews. The interface is compile-time only and introduces no runtime cost.

### fn `function formatResetConfirmationValue(previousValue: string, nextValue: string): string` (L572-574)
- @brief Formats one reset-confirmation value pair for menu display.
- @details Serializes the previous and next values into a deterministic `previous -> next` preview string used by confirmation submenus. Runtime is O(n) in combined value length. No external state is mutated.
- @param[in] previousValue {string} Current persisted value.
- @param[in] nextValue {string} Candidate default value.
- @return {string} Rendered preview string.

### fn `function buildResetConfirmationChoices(` (L584-623)
- @brief Builds the shared settings-menu choices for one reset-confirmation submenu.
- @details Renders each pending changed value as a disabled preview row, appends explicit approve and abort actions, and falls back to one disabled no-op row when no values would change. Runtime is O(n) in changed-value count. No external state is mutated.
- @param[in] changes {ResetConfirmationChange[]} Changed-value preview rows.
- @param[in] approveDescription {string} Description for the approve action.
- @param[in] abortDescription {string} Description for the abort action.
- @return {PiUsereqSettingsMenuChoice[]} Reset-confirmation submenu choices.

### fn `async function confirmResetChanges(` (L635-648)
- @brief Opens one explicit reset-confirmation submenu.
- @details Uses the shared settings-menu renderer to show every changed value before reset application and returns `true` only when the user selects the explicit approval action. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] title {string} Confirmation submenu title.
- @param[in] changes {ResetConfirmationChange[]} Changed-value preview rows.
- @param[in] approveDescription {string} Description for the approve action.
- @param[in] abortDescription {string} Description for the abort action.
- @return {Promise<boolean>} `true` when the reset is explicitly approved.

### fn `function writePersistedConfigToEditor(` (L657-662)
- @brief Writes one already-persisted config file text into the editor.
- @details Reads the target config file from disk after the caller has saved any pending changes and forwards the exact persisted text into the editor. Runtime is O(n) in serialized config size. Side effects include filesystem reads and editor-text mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] configPath {string} Absolute persisted config path.
- @return {void} No return value.

### fn `function writePersistedLocalConfigToEditor(` (L672-678)
- @brief Writes the already-persisted local configuration file text into the editor.
- @details Reads `<base-path>/.pi-usereq.json` from disk after the caller has saved any pending local and global configuration changes, then forwards that exact persisted text into the editor. Runtime is O(n) in serialized config size. Side effects include filesystem reads and editor-text mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] cwd {string} Current working directory.
- @return {void} No return value.
- @satisfies REQ-031

### fn `function writePersistedGlobalConfigToEditor(` (L687-691)
- @brief Writes the already-persisted global configuration file text into the editor.
- @details Reads `~/.config/pi-usereq/config.json` from disk after the caller has saved any pending local and global configuration changes, then forwards that exact persisted text into the editor. Runtime is O(n) in serialized config size. Side effects include filesystem reads and editor-text mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @return {void} No return value.
- @satisfies REQ-318

### fn `function buildSearchToolSupportedTagGuidelines(): string[]` (L752-756)
- @brief Builds the supported-tag guidance lines embedded in search-tool registrations.
- @details Emits one deterministic line per supported language containing its canonical registration label and sorted tag list so downstream agents can specialize requests without invoking the tool first. Runtime is O(l * t log t). No side effects occur.
- @return {string[]} Supported-tag guidance lines.

### fn `function buildSearchToolSchemaDescription(scope: FindToolScope): string` (L764-769)
- @brief Builds the schema description for one search-tool registration.
- @details Specializes the explicit-file and configured-directory input contracts while documenting the monolithic markdown output channel and minimal execution details shape. Runtime is O(1). No side effects occur.
- @param[in] scope {FindToolScope} Search-tool scope.
- @return {string} Parameter-schema description.

### fn `function buildSearchToolPromptGuidelines(scope: FindToolScope): string[]` (L777-790)
- @brief Builds the prompt-guideline set for one search-tool registration.
- @details Encodes scope selection, monolithic markdown output semantics, regex semantics, line-number behavior, tag-filter rules, and the full language-to-tag matrix as stable agent-oriented strings. Runtime is O(l * t log t). No side effects occur.
- @param[in] scope {FindToolScope} Search-tool scope.
- @return {string[]} Prompt-guideline strings.

- type `type MonolithicToolRenderResult = {` (L796)
- @brief Describes the monolithic tool-result surface consumed by tool-row renderers.
- @details Narrows execute-result data to the primary text content block plus the minimal `details.execution` metadata returned by monolithic tool wrappers. The alias is compile-time only and introduces no runtime cost.
### fn `function getMonolithicToolText(result: MonolithicToolRenderResult): string` (L813-816)
- @brief Extracts the primary monolithic text block from one tool result.
- @details Returns the first text content block when present and falls back to an empty string when the tool emitted no LLM-facing content. Runtime is O(1). No external state is mutated.
- @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
- @return {string} Primary monolithic content text.

### fn `function getMonolithicToolErrorText(result: MonolithicToolRenderResult): string | undefined` (L824-834)
- @brief Reads the first residual execution error string from one monolithic tool result.
- @details Prefers the first `stderr_lines` entry when present and otherwise falls back to the first line of `stderr`. Runtime is O(1) plus first-line split cost. No external state is mutated.
- @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
- @return {string | undefined} First residual execution error string.

### fn `function formatCompactToolArgumentValue(value: unknown): string | undefined` (L842-881)
- @brief Formats one scalar or structural tool argument for compact render summaries.
- @details Truncates long strings, compresses arrays into short previews, and renders plain object arguments as key indexes so collapsed tool rows stay compact while still exposing the essential invocation shape. Runtime is O(n) in preview size. No external state is mutated.
- @param[in] value {unknown} Candidate tool argument value.
- @return {string | undefined} Compact preview string or `undefined` when the value carries no useful summary.

### fn `function buildCompactToolInvocationText(args: Record<string, unknown> | undefined): string` (L889-900)
- @brief Builds the compact invocation summary appended to collapsed tool rows.
- @details Renders only caller-supplied parameters that have stable, non-empty compact previews and joins them in insertion order so agents can infer how the tool was used without expanding the full result. Runtime is O(n) in argument count and preview size. No external state is mutated.
- @param[in] args {Record<string, unknown> | undefined} Current tool call arguments.
- @return {string} Compact invocation summary prefixed with one separating space, or the empty string when no useful preview exists.

### fn `function summarizeStructuredToolResult(` (L910-925)
- @brief Builds the compact default text for one monolithic tool result row.
- @details Prefers the tool name, compact invocation preview, and success marker for collapsed rows, and falls back to residual execution diagnostics when the tool failed before completing successfully. Runtime is O(n) in compact argument-preview size. No external state is mutated.
- @param[in] toolName {string} Registered tool name.
- @param[in] result {MonolithicToolRenderResult} Tool result wrapper.
- @param[in] args {Record<string, unknown> | undefined} Current tool call arguments.
- @return {string} Compact single-line summary.

### fn `function buildStructuredToolRenderResult(toolName: string)` (L934-957)
- @brief Builds a custom `renderResult` implementation for one monolithic tool.
- @details Reuses a mutable `Text` component when possible, keeps the default collapsed row compact with essential invocation parameters plus result status, and reveals the full monolithic content only when the tool row is expanded. Runtime is O(n) in expanded content length and compact argument-preview size. No external state is mutated.
- @param[in] toolName {string} Registered tool name.
- @return {(result: MonolithicToolRenderResult, options: { expanded?: boolean; isPartial?: boolean }, _theme: unknown, context: { args?: unknown; lastComponent?: unknown }) => Text} Custom result renderer.
- @satisfies REQ-210

### fn `function executeMonolithicTool(operation: () => ToolResult): ReturnType<typeof buildMonolithicToolExecuteResult>` (L965-971)
- @brief Executes one CLI-style runner for a monolithic agent tool.
- @details Reuses the standalone tool-runner contract, normalizes thrown failures into `ToolResult`, and wraps the selected stdout or stderr text into the monolithic content channel. Runtime is dominated by the delegated runner. Side effects depend on the selected tool.
- @param[in] operation {() => ToolResult} Runner callback.
- @return {ReturnType<typeof buildMonolithicToolExecuteResult>} Monolithic tool execute result.

### fn `function executeStatusTool(operation: () => ToolResult): ReturnType<typeof buildMonolithicToolExecuteResult>` (L980-1009)
- @brief Executes one CLI-style runner for a status-only agent tool.
- @details Reuses the standalone tool-runner contract, preserves `content[0].text` as the status-only `success` or `error: <diagnostic>` payload, and strips success-path `stdout_lines` so `details.execution` stays limited to the numeric code plus optional residual stderr diagnostics. Runtime is dominated by the delegated runner. Side effects depend on the selected tool.
- @param[in] operation {() => ToolResult} Runner callback.
- @return {ReturnType<typeof buildMonolithicToolExecuteResult>} Status-only tool execute result.
- @satisfies REQ-294, REQ-295, REQ-296

### fn `function deliverPromptCommand(` (L1021-1093)
- @brief Starts delivery of one rendered prompt into the current active session.
- @details Prefers the replacement-session `sendMessage(...)` helper exposed by `withSession(...)` callbacks after session replacement so post-switch prompt delivery never reuses stale pre-switch session-bound extension objects. Delivers the rendered prompt as a `display:false` custom message with `triggerTurn:true` so the full content reaches the LLM agent without appearing on screen, and emits a `display:true` command invocation summary so the TUI shows only the compact summary. Awaits the non-critical summary delivery and suppresses its failures before dispatching the authoritative hidden prompt turn so a rejecting summary never surfaces as an unhandled rejection that could terminate the process before prompt-end closure runs the worktree merge. Returns the underlying hidden-delivery promise without awaiting the full agent turn so callers can record the `running` workflow transition as soon as prompt handoff is accepted; the returned promise resolves after the hidden prompt message is accepted, which on runtimes whose async replacement-session helpers resolve only after `agent_end` lets prompt-end closure finalize the worktree merge during the awaited delivery. When pi later invalidates that replacement-session context during successful prompt-end restoration, the helper suppresses the documented stale-extension-context rejection because the prompt was already accepted and late rethrow would surface a false orchestration failure. Falls back to `sendUserMessage(...)` only for non-replacement flows or runtimes that do not expose `sendMessage`, always passing `deliverAs: "followUp"` so pi sessions busy during run start queue the dispatched prompt for the next turn instead of failing the delivery. Runtime is O(n) in prompt length. Side effects are limited to hidden prompt delivery plus on-screen summary display.
- @param[in] pi {ExtensionAPI} Handler-scoped extension API instance retained as the fallback dispatcher.
- @param[in] content {string} Rendered prompt markdown.
- @param[in] summary {string} Command invocation summary text displayed on screen.
- @param[in] context {unknown} Optional replacement-session helper context.
- @return {Promise<void>} Promise representing eventual prompt-delivery completion.
- @satisfies REQ-004, REQ-067, REQ-068, REQ-227, REQ-281, REQ-334, REQ-335, REQ-459, DES-016

### fn `function shouldIgnoreLatePromptDeliveryFailure(` (L1104-1120)
- @brief Detects prompt-delivery failures that can be ignored after prompt ownership has moved past the command handler.
- @details Matches the documented stale-extension-context runtime error once prompt ownership has already moved beyond command-side preflight. The helper treats the failure as ignorable when the persisted prompt runtime state shows the same execution session as the active prompt run or when the persisted workflow state has already advanced beyond `checking|running`, because rethrowing at that point would incorrectly re-enter command-side abort logic after the prompt was already accepted. Runtime is O(n) in error-message length plus path length. No external state is mutated.
- @param[in] error {unknown} Candidate prompt-delivery failure.
- @param[in] workflowState {import("./core/extension-status.js").PiUsereqWorkflowState} Current shared prompt workflow state.
- @param[in] executionPlan {PromptCommandExecutionPlan | undefined} Prepared execution plan for the current prompt command.
- @return {boolean} `true` when the failure is a late stale-context delivery rejection that MUST be ignored.
- @satisfies REQ-208, REQ-280, REQ-281, REQ-282

### fn `function logPromptWorkflowStateChange(` (L1133-1152)
- @brief Appends one workflow-state debug entry for a bundled prompt when selected.
- @details Reuses the shared debug logger so `req-*` command handlers and prompt-end orchestration can record deterministic workflow transitions without duplicating JSON payload shaping. Runtime is O(n) in serialized payload size only when logging is enabled and O(1) otherwise. Side effects include debug-log file writes for matching enabled prompts.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
- @param[in] previousState {string} Prior workflow state.
- @param[in] nextState {import("./core/debug-runtime.js").DebugWorkflowState} Next workflow state.
- @return {void} No return value.
- @satisfies REQ-245, REQ-246, REQ-247

### fn `function logPromptWorkflowEvent(` (L1168-1188)
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

### fn `function transitionPromptWorkflowState(` (L1201-1214)
- @brief Transitions one prompt workflow state and logs the transition immediately after the state update.
- @details Captures the previous workflow state, applies the new state through the shared status helper, and appends the gated `workflow_state` debug entry only after the transition has completed. Runtime is O(1). Side effects include status mutation, status-bar rendering, and optional debug-log writes.
- @param[in] ctx {ExtensionContext | ExtensionCommandContext} Active extension context.
- @param[in] projectBase {string} Absolute original project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
- @param[in] nextState {import("./core/extension-status.js").PiUsereqWorkflowState} Next workflow state.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `function resolvePromptCommandDescription(` (L1222-1226)
- @brief Resolves the runtime slash-command description for one bundled prompt.
- @details Reads the bundled prompt markdown, extracts the first `# ` heading payload, and falls back to the historical generated label when the prompt omits a level-one heading. Runtime is O(n) in prompt length. Side effects are limited to filesystem reads.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName} Bundled prompt name.
- @return {string} Runtime command description.

### fn `function resolveDebugProjectBase(cwd: string, statusController: PiUsereqStatusController): string` (L1235-1239)
- @brief Resolves the original project base used for debug-log file writes.
- @details Prefers the active or pending prompt execution plan so tool-result logging during worktree-backed prompt runs persists into the original repository path instead of transient worktree directories. Runtime is O(1). No external state is mutated.
- @param[in] cwd {string} Current extension working directory.
- @param[in] statusController {PiUsereqStatusController} Mutable status controller.
- @return {string} Absolute original project base path for debug logging.

### fn `function notifyContextSafely(` (L1250-1269)
- @brief Delivers one best-effort UI notification, deferring the payload when the context is stale.
- @details Attempts to use the supplied extension context for UI notification delivery; when no context is available or pi raises the documented stale-extension-context error because the context was invalidated by session replacement or reload, the exact message plus severity is enqueued into the process-scoped deferred-notification replay store so one later eligible `session_start` can redeliver it on the restored context instead of losing the evidence. The payload is enqueued only on failed delivery, so already-delivered notifications are never replayed. Runtime is O(1). Side effects are limited to user notification delivery when the context is still active and process-scoped queue mutation when delivery fails.
- @param[in] ctx {ExtensionContext | ExtensionCommandContext | undefined} Candidate UI context.
- @param[in] message {string} Notification message.
- @param[in] level {"info" | "warning" | "error"} Notification severity.
- @return {boolean} `true` when the notification was delivered and `false` when delivery failed and the payload was deferred for replay.
- @satisfies REQ-280, REQ-439, REQ-442

### fn `function notifyContextRetentionReminder(` (L1279-1292)
- @brief Emits the final context-retention reminder info notification for a successfully completed `/req-*` orchestration.
- @details Builds one message stating that the session context content was retained, recommending a clean-context session start before the next `/req-*` command, and appending the current context-usage percentage when the controller holds a normalized snapshot. Delivers exclusively through `notifyContextSafely(...)`, so stale replacement-session contexts are suppressed, and performs no session message send and no session switch. Runtime is O(1). Side effect is user notification delivery only when the supplied context is still active.
- @param[in] statusController {PiUsereqStatusController} Mutable status controller supplying the latest normalized context-usage snapshot.
- @param[in] ctx {(ExtensionContext | ExtensionCommandContext) | undefined} Candidate UI context for notification delivery.
- @return {void} No return value.
- @satisfies REQ-360, REQ-361, REQ-362, REQ-363, REQ-364, REQ-365, REQ-439, REQ-441

### fn `function rejectNonIdleReqCommand(` (L1304-1324)
- @brief Rejects one non-startable req-command invocation and records the workflow error state.
- @details Builds a deterministic busy-state diagnostic from the current workflow state, transitions the shared workflow state to `error`, preserves any pending or active prompt execution metadata for later closure handling, emits an error notification, and throws `ReqError`. Only `idle` and `done` are startable, so `checking`, `running`, `merging`, `warning`, and `error` are rejected. Bundled prompt commands reuse `transitionPromptWorkflowState(...)` when cached configuration is available so prompt debug logging captures the actual state transition; specialized non-prompt commands fall back to direct status mutation. Runtime is O(1). Side effects include workflow-state mutation, status-bar rendering, optional debug-log writes, and user notification delivery.
- @param[in] ctx {ExtensionContext | ExtensionCommandContext} Active extension context.
- @param[in] promptName {import("./core/prompt-command-catalog.js").PromptCommandName | undefined} Optional bundled prompt name used for prompt debug logging.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {never} This helper always throws a deterministic `ReqError`.
- @throws {ReqError} Always throws because non-startable req commands are rejected.
- @satisfies REQ-224, REQ-635

### fn `function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[]` (L1333-1341)
- @brief Returns the configurable active-tool inventory visible to the extension.
- @details Filters runtime tools against the canonical configurable-tool set, keeps only builtin-backed embedded tools, and orders the result by the documented custom/files/embedded/default-disabled grouping. Runtime is O(t log t). No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {ToolInfo[]} Sorted configurable tool descriptors.
- @satisfies REQ-007, REQ-063, REQ-231, REQ-232

### fn `function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[]` (L1349-1353)
- @brief Normalizes and returns the configured enabled active tools.
- @details Reuses repository normalization rules, updates the config object in place, and returns the normalized array. Runtime is O(n) in configured tool count. Side effect: mutates `config["enabled-tools"]`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {string[]} Normalized enabled tool names.

### fn `function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void` (L1363-1380)
- @brief Applies the configured active-tool enablement to the current session.
- @details Preserves non-configurable active tools, removes every configurable tool from the active set, then re-adds only configured tools that exist in the current runtime inventory. Runtime is O(t). Side effects include `pi.setActiveTools(...)`.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {void} No return value.
- @satisfies REQ-009, REQ-064

### fn `function isPiAgentSettledEventSupported(` (L1390-1407)
- @brief Probes whether the running pi host emits the `agent_settled` event and caches the result on the status controller state.
- @details The 0.80.4+ `ExtensionAPI.on(...)` contract returns an unsubscribe function, and `agent_settled` is introduced in that same release; therefore a registration that returns a callable proves the host supports the event, while a `void` registration means a legacy host that never emits it. The probe registers a no-op handler once per status controller, unsubscribes it when the new contract returns a function, and caches the boolean so all later lookups are O(1). No external state is retained beyond the controller-scoped cached boolean.
- @param[in] pi {ExtensionAPI} Active extension API instance used to probe event registration.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller that caches the probed capability.
- @return {boolean} `true` when the host emits `agent_settled`, `false` on legacy hosts.
- @satisfies REQ-354, REQ-355

### fn `async function finalizeMatchedPromptSuccess(` (L1419-1521)
- @brief Finalizes a matched successful worktree-backed prompt at the current lifecycle point.
- @details Executes the deferred stash-assisted merge, transcript preservation, base-path restore, and worktree plus branch deletion through `finalizePromptCommandExecution(...)`, surfaces `error` or warning-only notifications, clears the pending finalization outcome plus prompt state, and transitions workflow state to `done` or `error`; the caller owns the preceding `merging` transition. Reused by the `agent_settled` handler on 0.80.4+ hosts (after the settle-time `merging` transition) and directly by the `agent_end` fallback on legacy hosts that never emit `agent_settled`. Runtime is dominated by git finalization. Side effects include branch merges, worktree deletion, notifications, and workflow-state transitions.
- @param[in] pi {ExtensionAPI} Active extension API instance supplying the model re-apply appliers.
- @param[in] promptRequest {PiUsereqPromptRequest} Matched successful worktree-backed prompt execution plan.
- @param[in] ctx {ExtensionContext} Active extension context used for finalization and notifications.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller whose pending and active prompt state is cleared.
- @return {Promise<void>} Promise resolved when finalization and state transitions complete.
- @satisfies REQ-208, REQ-228, REQ-229, REQ-230, REQ-282, REQ-291, REQ-292, REQ-354, REQ-355, REQ-368, REQ-370, REQ-371, REQ-372

### fn `function buildAgentEndOutputText(event: unknown): string` (L1530-1555)
- @brief Extracts the final agent output text for prompt-end `%%OUTPUT%%` substitution.
- @details Scans the `agent_end` payload messages backwards for the last assistant message and concatenates its `type === "text"` content blocks while skipping `thinking` and tool-call blocks, returning the empty string for non-agent payloads and for last assistant messages without text blocks so non-agentic command notifications never substitute stale output. Runtime is O(m + n) in message and text-block count. No external state is mutated.
- @param[in] event {unknown} Raw `agent_end` lifecycle event payload.
- @return {string} Concatenated final assistant text blocks, or the empty string when unavailable.
- @satisfies REQ-443, REQ-444

### fn `async function handleExtensionStatusEvent(` (L1568-1867)
- @brief Handles one intercepted pi lifecycle hook for pi-usereq status updates.
- @details Applies session-start-specific resource validation, project-config refresh, idle-time shared-tokenizer and context-file measurement pre-warm, startup-tool enablement, and selected debug-tool logging before forwarding the originating hook name and payload into the shared `updateExtensionStatus(...)` pipeline. After the status update, captures the exact `before_provider_request` provider payload for the live active or pending prompt run by reloading the prompt debug gating configuration from the prompt run's original `base-path` (worktree-backed checkouts do not contain the untracked `.pi-usereq.json`, so the cwd-derived cached config would silently disable capture), flushes the process-scoped captured payload as one `<timestamp>-<req-command>-error-<status>` file whenever `after_provider_response` reports a status >= 400 or whenever one finalized `message_end` assistant error message carries a leading HTTP status >= 400 (the provider-independent fallback for provider APIs whose SDK clients throw before emitting `after_provider_response` for non-2xx statuses) without requiring live workflow state, and discards the capture at prompt-run end so stale payloads never reach later runs. Before `agent_start`, re-verifies any prepared prompt execution session switch. On `agent_end`, dispatches configured command-notify, sound, and prompt-specific Pushover effects with the final assistant output text feeding `%%OUTPUT%%` placeholder substitution; the prompt request is gated on post-update run association so only an `agent_end` that provably belongs to the live active prompt request notifies, the completion time comes from the ended run's own resolved duration (recovered from the process-scoped run record when the in-memory run timer was cleared mid-run between `agent_start` and `agent_end` on a long-lived host) instead of a previous run's completed counter or a fabricated zero, and unassociated terminal events (never-started pending requests, duplicate deliveries, error-retained worktree requests) stay silent for command-notify and Pushover while their outcome-gated sound effects still run, logs dedicated workflow-closure diagnostics, classifies the prompt outcome, and defers every terminal workflow-state determination for worktree-backed runs to `agent_settled` when the running pi host supports that 0.80.4+ event (because `agent_end` is not a final-idle signal — retries, overflow compaction recovery, and queued work start further agent runs after it, so an intermediate error the host recovers must keep the workflow `running`, and its `switchSession` awaits the active agent run to become idle and would deadlock inside `agent_end`), recording the run outcome as the terminal candidate while intermediate `agent_end` events keep the workflow `running` without parking `error`, emitting the worktree-retention error, or clearing prompt-run ownership, or determines the terminal outcome directly at `agent_end` when the host does not emit `agent_settled`; notification and closure consume one coherent post-update completion snapshot of the live active prompt request taken before any destructive reset, so a resynchronized completion can never split into two identities. On `agent_settled`, reuses persisted replacement-session command contexts when event contexts omit `switchSession()`, determines the terminal outcome of the settled orchestration, transitions matched-success runs through `merging` into the deferred stash-assisted merge-and-delete finalization path, parks interrupted or failed runs in `error` with the worktree-retention error notification and cleared prompt-run ownership, emits a warning-only notification when restored `base-path` changes are reapplied after merge, tolerates stale replacement-session notification contexts after session replacement, retains the worktree plus notifies closure failure for interrupted or failed outcomes, logs selected prompt workflow transitions, and transitions workflow state through `merging`, `error`, and `done` as required. On `session_shutdown`, captures pre-update prompt snapshots so workflow-shutdown diagnostics and same-runtime command continuation preserve the active prompt workflow state across switch-triggered rebinding, then disposes the shared controller. Runtime is dominated by configuration loading during `session_start` and git finalization during matched successful closure handling; all other hooks are O(1). Side effects include resource checks, active-tool mutation, active-session replacement, status updates, live-ticker disposal on shutdown, optional child-process spawning, outbound HTTPS requests, branch merges, worktree deletion, and optional debug-log writes.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded by pi.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when hook processing completes.
- @satisfies REQ-117, REQ-118, REQ-119, REQ-131, REQ-132, REQ-133, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-176, REQ-178, REQ-184, REQ-185, REQ-186, REQ-187, REQ-208, REQ-209, REQ-221, REQ-228, REQ-229, REQ-230, REQ-244, REQ-245, REQ-246, REQ-247, REQ-276, REQ-277, REQ-278, REQ-279, REQ-280, REQ-291, REQ-292, REQ-421, REQ-422, REQ-425, REQ-440, REQ-443, REQ-444, REQ-461, REQ-462, REQ-463, REQ-464, REQ-465

### fn `function registerExtensionStatusHooks(` (L2048-2067)
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

### fn `function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void` (L2077-2080)
- @brief Replaces the configured active-tool selection and applies it immediately.
- @details Normalizes the requested tool names, stores them in config, and synchronizes the active tool set with runtime registration state. Runtime is O(n + t). Side effect: mutates config and active tools.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] enabledTools {string[]} Requested enabled tool names.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.

### fn `function getDebugToolToggleNames(): PiUsereqStartupToolName[]` (L2088-2090)
- @brief Returns the canonical debug-tool toggle order.
- @details Reuses the documented configurable-tool ordering so debug toggles list extension-owned tools before embedded tools and remain deterministic across sessions. Runtime is O(t log t). No external state is mutated.
- @return {PiUsereqStartupToolName[]} Ordered debug-tool toggle names.
- @satisfies REQ-242

### fn `function resetDebugConfigToDefaults(config: UseReqConfig): void` (L2099-2111)
- @brief Restores the debug configuration subtree to its documented defaults.
- @details Resets runtime debug enablement in both the effective config object and the process-scoped runtime debug store, then resets log path, prompt-content debug enablement plus prompt log path, tool-wrapper command registration, workflow-state filter, dedicated workflow-event logging, and selected tool plus prompt debug toggles without mutating unrelated settings. Runtime is O(1). Side effect: mutates `config` and process-scoped runtime debug state.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-236, REQ-237, REQ-238, REQ-239, REQ-195, REQ-277, REQ-322, REQ-413, REQ-414, REQ-420, REQ-426

### fn `function formatDebugMenuSummary(config: UseReqConfig): string` (L2119-2125)
- @brief Formats the top-level Debug summary value.
- @details Emits the current global debug mode plus compact selected-tool and selected-prompt counts for right-aligned menu display. Runtime is O(n) in configured selector count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Compact debug summary string.

### fn `function buildDebugMenuChoice(` (L2135-2148)
- @brief Builds one debug-menu row with optional disabled styling.
- @details Applies dim styling and disables selection whenever global debug is off for all rows except the global `Debug` toggle row. Runtime is O(1). No external state is mutated.
- @param[in] choice {PiUsereqSettingsMenuChoice} Base debug-menu row.
- @param[in] debugEnabled {boolean} Whether global debug is enabled.
- @return {PiUsereqSettingsMenuChoice} Styled debug-menu row.
- @satisfies REQ-241

### fn `async function selectDebugLogOnStatus(` (L2157-2185)
- @brief Opens the workflow-state filter selector used by the Debug submenu.
- @details Exposes `any` plus each canonical workflow state through the shared settings-menu renderer and returns the selected normalized filter or `undefined` when the user cancels the submenu. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentValue {DebugLogOnStatus} Current persisted workflow-state filter.
- @return {Promise<DebugLogOnStatus | undefined>} Selected workflow-state filter or `undefined` when cancelled.

### fn `function buildDebugMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2194-2299)
- @brief Builds the shared settings-menu choices for debug logging configuration.
- @details Serializes global debug controls plus prompt-content debug controls, tool-wrapper command registration, workflow-state, dedicated workflow-event, per-tool, and per-prompt toggles into one submenu, deriving inventories from the canonical tool and prompt lists and dimming locked rows while debug is disabled. Runtime is O(t + p). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered debug-menu choices.
- @satisfies REQ-240, REQ-241, REQ-242, REQ-243, REQ-193, REQ-277, REQ-321, REQ-322, REQ-415

### fn `async function configureDebugMenu(` (L2310-2527)
- @brief Runs the interactive Debug submenu.
- @details Lets the user toggle runtime global debug enablement (stored only in the process-scoped runtime debug store and never persisted), prompt-content debug enablement plus prompt log path, tool-wrapper command registration, debug file and workflow filters, dedicated workflow-event logging, per-tool selectors, and per-prompt selectors while preserving row focus across re-renders. Runtime depends on user interaction count. Side effects include UI updates, config mutation, process-scoped runtime debug state mutation, and optional debug command registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the submenu closes.
- @satisfies REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243, REQ-192, REQ-193, REQ-195, REQ-277, REQ-321, REQ-322, REQ-323, REQ-413, REQ-414, REQ-415, REQ-420, REQ-426

### fn `const updateDebugToolCommandsEnabled = (nextValue: unknown): void =>` (L2316-2323)

- type `type PiNotifyBooleanConfigKey =` (L2533)
- @brief Represents one persisted boolean notification-setting key.
- @details Restricts menu toggles to the global enable flags and completed/interrupted/failed event toggles used by command-notify, sound, and Pushover configuration. Compile-time only and introduces no runtime cost.
- type `type PiNotifyEventBooleanConfigKey = Exclude<` (L2550)
- @brief Represents one persisted boolean notification event-toggle key.
- @details Restricts shared event-submenu mutation helpers to completed/interrupted/failed toggles and excludes global enable flags. Compile-time only and introduces no runtime cost.
- type `type PiNotifyEventId = "completed" | "interrupted" | "failed";` (L2559)
- @brief Represents one shared prompt-end event identifier used by notification menus.
- @details Restricts event-submenu rendering to the canonical completed/interrupted/failed domain shared by command-notify, sound, and Pushover routing. Compile-time only and introduces no runtime cost.
### iface `interface PiNotifyEventRowDefinition` (L2565-2569)
- @brief Describes one shared prompt-end event row rendered inside notification event submenus.
- @details Binds one canonical event identifier to the human-readable label and terminal-outcome description reused across command-notify, sound, and Pushover event menus. The interface is compile-time only and introduces no runtime cost.

### iface `interface PiNotifyEventMenuDefinition` (L2575-2581)
- @brief Describes one notification-system event submenu contract.
- @details Binds the top-level launcher row, submenu title, toast prefix, and completed/interrupted/failed config keys for one notification transport. The interface is compile-time only and introduces no runtime cost.

### fn `function togglePiNotifyFlag(config: UseReqConfig, key: PiNotifyBooleanConfigKey): boolean` (L2590-2593)
- @brief Flips one persisted boolean notification setting.
- @details Negates the selected configuration flag in place and returns the resulting boolean value so callers can emit deterministic UI feedback. Runtime is O(1). Side effect: mutates `config`.
- @param[in] key {PiNotifyBooleanConfigKey} Boolean configuration key to toggle.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {boolean} Next enabled state.

### fn `function resetPiNotifyConfigToDefaults(config: UseReqConfig): void` (L2602-2626)
- @brief Restores notification-related settings to their documented defaults.
- @details Copies the command-notify, sound, and Pushover configuration subtree from a fresh default config into the supplied mutable project config. Runtime is O(1). Side effect: mutates `config`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-174, REQ-178, REQ-184, REQ-195, REQ-196

### fn `function formatPiNotifyPushoverPriority(priority: PiNotifyPushoverPriority): string` (L2635-2637)
- @brief Formats one persisted Pushover priority for menu display.
- @details Maps the canonical `0|1` priority domain to deterministic `Normal|High` labels reused by the Pushover configuration UI. Runtime is O(1). No external state is mutated.
- @param[in] priority {PiNotifyPushoverPriority} Persisted Pushover priority.
- @return {string} Menu-display label.
- @satisfies REQ-172

### fn `function formatPiNotifyEventMenuSummary(` (L2721-2729)
- @brief Formats the top-level summary value for one notification event submenu.
- @details Counts enabled completed/interrupted/failed toggles for the selected transport and renders the result as `n/3 on` for right-aligned menu display. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {string} Compact enabled-toggle summary.
- @satisfies REQ-198

### fn `function buildPiNotifyEventLauncherChoice(` (L2739-2749)
- @brief Builds the top-level launcher row for one notification event submenu.
- @details Reuses the shared completed/interrupted/failed summary renderer so the `Notifications` menu can expose dedicated event editors for command-notify, sound, and Pushover in a uniform shape. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {PiUsereqSettingsMenuChoice} Launcher row for the selected event submenu.
- @satisfies REQ-181, REQ-183, REQ-165, REQ-198

### fn `function buildPiNotifyEventMenuChoices(` (L2759-2775)
- @brief Builds the shared settings-menu choices for one notification event submenu.
- @details Serializes completed/interrupted/failed rows with right-aligned `on|off` values, then appends a value-less `Reset defaults` row for submenu-scoped mutation control. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {PiUsereqSettingsMenuChoice[]} Ordered event-submenu choice vector.
- @satisfies REQ-188, REQ-193, REQ-198

### fn `function resetPiNotifyEventMenuToDefaults(` (L2785-2793)
- @brief Restores one notification event submenu to its documented defaults.
- @details Copies only the completed/interrupted/failed toggles referenced by the supplied submenu contract from a fresh default config into the mutable project config. Runtime is O(1). Side effect: mutates `config`.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-174, REQ-178, REQ-184, REQ-195

### fn `function resolvePiNotifyEventLabel(` (L2803-2810)
- @brief Resolves the human-readable event label for one event-toggle config key.
- @details Matches the supplied config key against the submenu contract and returns the corresponding completed/interrupted/failed menu label for deterministic notification toasts. Runtime is O(1). No external state is mutated.
- @param[in] key {PiNotifyEventBooleanConfigKey} Event-toggle configuration key.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @return {string} Human-readable event label.
- @satisfies REQ-188, REQ-198

### fn `async function configurePiNotifyEventMenu(` (L2821-2897)
- @brief Runs one dedicated notification event submenu.
- @details Reuses the shared settings-menu renderer to toggle completed/interrupted/failed delivery flags, preserve row focus, and apply submenu-scoped reset semantics for command-notify, sound, or Pushover events. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] eventMenu {PiNotifyEventMenuDefinition} Notification-system event submenu contract.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the submenu closes.
- @satisfies REQ-188, REQ-192, REQ-193, REQ-195, REQ-198

### fn `function buildPiNotifyPushoverRows(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2906-2956)
- @brief Builds the direct Pushover rows rendered inside `Notifications`.
- @details Serializes the global enable flag, shared-event submenu launcher, priority, title, text, and credential rows into right-valued menu items appended after the sound-command rows, dims and disables the enable row until both credentials are populated, renders the locked value as `configure user/token keys first`, and escapes control characters for the single-line `Pushover text` value. Runtime is O(n) in the rendered text-template length. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered direct Pushover rows.
- @satisfies REQ-163, REQ-165, REQ-172, REQ-184, REQ-185, REQ-198, REQ-234, REQ-235, REQ-443, REQ-444, REQ-446

### fn `async function selectPiNotifyPushoverPriority(` (L2966-2994)
- @brief Opens the shared settings-menu selector for Pushover priority.
- @details Reuses the pi-usereq settings-menu renderer so Pushover priority selection remains stylistically aligned with the notification menus and appends a value-less subtree-local `Reset defaults` row. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentPriority {PiNotifyPushoverPriority} Persisted priority value.
- @return {Promise<PiNotifyPushoverPriority | "reset-defaults" | undefined>} Selected priority, reset action, or `undefined` when cancelled.
- @satisfies REQ-172, REQ-192

### fn `function buildPiNotifyMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L3003-3061)
- @brief Builds the shared settings-menu choices for notification configuration.
- @details Serializes command-notify, sound, and Pushover blocks with dedicated shared-event submenu launchers so the settings-menu renderer can expose one unified but modular configuration surface, including locked Pushover enablement, persisted boot-sound rows that stay decoupled from the active runtime sound level, and escaped single-line rendering for `Pushover text`. Runtime is O(n) in the longest rendered command or text field. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered notification-menu choice vector.
- @satisfies REQ-137, REQ-149, REQ-150, REQ-151, REQ-152, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-183, REQ-188, REQ-193, REQ-198, REQ-234, REQ-235, REQ-289

### fn `async function selectPiNotifySoundLevel(` (L3071-3111)
- @brief Opens the shared settings-menu selector for the persisted boot sound level.
- @details Reuses the pi-usereq settings-menu renderer so boot-sound selection remains stylistically aligned with the notification menu, keeps the active runtime sound level unchanged, and appends a value-less subtree-local `Reset defaults` row. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentLevel {PiNotifySoundLevel} Persisted boot sound level.
- @return {Promise<PiNotifySoundLevel | "reset-defaults" | undefined>} Selected boot sound level, reset action, or `undefined` when cancelled.
- @satisfies REQ-131, REQ-179, REQ-192, REQ-289

### fn `async function configurePiNotifyMenu(` (L3121-3407)
- @brief Runs the interactive notification-configuration menu.
- @details Exposes command-notify, sound, and Pushover controls through the shared settings-menu renderer, persists every notification subtree mutation into global configuration, delegates completed/interrupted/failed toggles to dedicated event submenus, preserves boot-sound edits without altering the active runtime sound level, keeps `Enable pushover` locked until both credentials are populated, decodes escaped control-sequence input for `Pushover text`, and preserves row focus across menu re-renders. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<boolean>} `true` when the sound-toggle shortcut changed.
- @satisfies REQ-131, REQ-133, REQ-134, REQ-137, REQ-163, REQ-164, REQ-165, REQ-172, REQ-179, REQ-181, REQ-183, REQ-184, REQ-188, REQ-192, REQ-193, REQ-195, REQ-196, REQ-198, REQ-234, REQ-235, REQ-288, REQ-289

### fn `function registerPiNotifyShortcut(` (L3422-3445)
- @brief Registers the configurable notification-sound shortcut when supported.
- @details Loads the current effective config, registers one raw pi shortcut when
the runtime exposes `registerShortcut(...)`, cycles only the active runtime
sound level on invocation, leaves persisted local and global configuration
unchanged, refreshes the status bar, and emits one info notification. Runtime is O(1) for registration
plus one status update per shortcut use. Side effects include shortcut
registration and status updates.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-134, REQ-180, REQ-286, REQ-287

- type `type PromptModelSelectionApiSurface = {` (L3451)
- @brief Describes the loosely-typed pi extension API surface required by model re-application.
- @details Narrows the runtime API to the model appliers and thinking-level probe accessed defensively so legacy hosts and offline harnesses without `setModel`, `setThinkingLevel`, or `getThinkingLevel` degrade to a documented warning instead of a runtime exception. The alias is compile-time only and introduces no runtime cost.
- type `type PromptModelSelectionContextSurface = {` (L3461)
- @brief Describes the loosely-typed context surface required by model re-application.
- @details Narrows extension contexts to the active model, thinking level, and model registry probe used to capture the pre-switch selection and to evaluate the duplicate-skip guard after session replacement. The alias is compile-time only and introduces no runtime cost.
### fn `function resolveCurrentModelSelection(` (L3474-3490)
- @brief Captures the active model provider and identifier from one loosely-typed context model.
- @details Validates that the runtime model object exposes non-empty string provider and identifier fields and emits the serializable selection fact stored inside the prompt execution plan, returning undefined when the runtime exposes no usable model so preflight capture never throws. Runtime is O(1). No external state is mutated.
- @param[in] model {unknown} Active runtime model object from `ctx.model`.
- @return {PromptCommandModelSelection | undefined} Serializable provider plus identifier fact, or undefined when unavailable.
- @satisfies REQ-366

### fn `function resolveCurrentThinkingLevel(pi: ExtensionAPI, ctx: unknown): string | undefined` (L3500-3518)
- @brief Captures the active thinking level from the runtime API or fallback context.
- @details Prefers `pi.getThinkingLevel()` when the host exposes it and falls back to the context `thinkingLevel` probe, returning undefined for legacy hosts or offline harnesses that provide neither so capture stays advisory. Runtime is O(1). No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {unknown} Active extension or command context used as fallback probe.
- @return {string | undefined} Active thinking level, or undefined when unavailable.
- @satisfies REQ-366, REQ-371

### fn `function resolvePromptCommandModelSurface(` (L3528-3552)
- @brief Builds the loosely-typed model-selection surface from the runtime API plus context.
- @details Wraps `setModel` and `setThinkingLevel` with defensive function probes so the surface only exposes appliers the running host actually implements, and copies the context model, thinking level, and model registry used by the guarded re-apply comparison. The supplied api MUST be the latest live extension api bound to the active session runner because pi invalidates captured extension apis after session replacement. Returns undefined when no context is available so re-application degrades to a not-attempted skip. Runtime is O(1). No external state is mutated.
- @param[in] pi {ExtensionAPI} Latest live extension api instance supplying the session-scoped model appliers; after session replacement callers pass the rebound api rather than a captured pre-switch api.
- @param[in] ctx {unknown} Active extension or command context supplying model probes.
- @return {PromptCommandModelSelectionSurface | undefined} Re-apply surface, or undefined when no context exists.
- @satisfies REQ-367, REQ-370, REQ-371

### fn `async function reapplyCapturedPromptModelSelection(` (L3564-3580)
- @brief Re-applies one captured model selection onto the active post-switch session.
- @details Builds the guarded re-apply surface from the latest process-scoped extension api plus context, preferring the api written by the most recent extension bind because pi invalidates the api captured before session replacement, and falls back to the caller-supplied api for hosts that do not rebind. Forwards the captured selection plus thinking level into `reapplyPromptCommandSessionSelection(...)` and routes every warning through `notifyContextSafely(...)` so stale replacement contexts after session replacement never abort orchestration. Runtime is O(1) plus one awaited model mutation. Side effects include session-scoped model and thinking-level mutation plus stale-safe warning notifications.
- @param[in] selection {PromptCommandModelSelection | undefined} Captured model provider plus identifier.
- @param[in] thinkingLevel {string | undefined} Captured thinking level.
- @param[in] pi {ExtensionAPI} Extension api captured by the running handler, used only as fallback when no rebound api is stored.
- @param[in] ctx {unknown} Active extension or command context used for probes and warning delivery.
- @return {Promise<void>} Promise resolved once the guarded re-application completed.
- @satisfies REQ-367, REQ-368, REQ-369, REQ-370, REQ-371, REQ-372

### fn `function resolveReqResetPromptRequest(` (L3588-3614)
- @brief Resolves the prompt execution plan targeted by `req-reset` recovery.
- @details Prefers the current in-memory active request, then the current in-memory pending request, then the process-scoped persisted prompt runtime state so the dedicated reset command can recover from same-host unclean prompt termination after session replacement. Runtime is O(1). No external state is mutated.
- @param[in] statusController {PiUsereqStatusController} Mutable status controller.
- @return {PromptCommandExecutionPlan | undefined} Recoverable prompt execution plan when one remains available.

### fn `const isWorktreeBacked = (request: PromptCommandExecutionPlan | undefined): request is PromptCommandExecutionPlan =>` (L3591-3598)

### fn `function registerReqResetCommand(` (L3624-3691)
- @brief Registers the specialized `req-reset` slash command.
- @details Registers the non-agentic prompt-recovery command that accepts any current workflow state, reuses persisted prompt runtime state when available, restores the original session-backed `base-path`, force-removes matching generated worktrees plus branches, clears recoverable prompt state when restoration succeeds, notifies pi without starting an LLM session or creating a worktree, and dispatches no command-notify, sound, or Pushover prompt-end effect. Runtime is dominated by session restoration plus git cleanup. Side effects include command registration, status-controller mutation, active-session replacement, worktree deletion, branch deletion, and UI notifications.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-304, REQ-305, REQ-306, REQ-307, REQ-308, REQ-309, REQ-310, REQ-311, REQ-312, REQ-313, REQ-447, REQ-441

### fn `function registerReqReferencesCommand(` (L3701-3763)
- @brief Registers the specialized `req-references` slash command.
- @details Registers the non-agentic references-maintenance command that rejects non-startable invocations by transitioning workflow state to `error` before direct execution, otherwise reuses slash-command-owned git validation, records request `references`, transitions workflow state through `checking|running|done`, regenerates `REFERENCES.md` directly from configured source directories, stages only the generated file, creates the fixed-message git commit, verifies repository cleanliness, appends one durable `pi-usereq.command-report` session entry recording the executed operations with their outcomes so the report renders in the transcript and survives session restore, emits execution notifications that conform to the operations actually performed — one stating whether the references file was updated or already matched the generated content and one stating whether the fixed-message commit was created or skipped — regardless of the update and commit outcomes, and dispatches no command-notify, sound, or Pushover prompt-end effect for completed or failed runs, all without starting an LLM session or creating a worktree. Runtime is dominated by git subprocess execution plus source-summary generation. Side effects include command registration, status-controller mutation, filesystem writes, git index/history mutation, session-entry persistence, and UI notifications.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-200, REQ-221, REQ-224, REQ-298, REQ-299, REQ-300, REQ-301, REQ-302, REQ-303, REQ-436, REQ-437, REQ-438, REQ-441, REQ-447

### fn `function registerPromptCommands(` (L3773-3951)
- @brief Registers bundled prompt-backed commands with the extension.
- @details Creates one prompt-template-backed `req-<prompt>` command per bundled prompt name. Each handler rejects non-startable workflow state by transitioning the shared workflow state to `error` before command-side preflight, otherwise records the prompt name as the active request and transitions the shared workflow state through `checking`, `error`, `running`, and `done`, inspects the configured `src-dir` git file inventory for `req-workflow` and writes the no-source `WORKFLOW.md` placeholder plus `done` terminal state when no supported source file exists, runs dedicated prompt-command git and required-doc preflight checks, optionally prepares a dedicated worktree execution plan using the active session directory, persists the prompt metadata needed for switch-triggered rebinding, switches the active session to the verified execution cwd before prompt handoff, logs dedicated workflow-activation diagnostics, renders the prompt, starts prompt delivery into the forked active session, records `running` immediately after delivery handoff begins, saves the exact command invocation summary plus the delivered prompt content into the debug prompt log path as separate `-request` and `-prompt` files when prompt debug logging is enabled, and then awaits the wrapped prompt-delivery promise whose stale post-restore rejections are suppressed. Runtime is O(p) for registration; handler cost depends on prompt preflight, worktree preparation, session switching, prompt rendering, prompt dispatch, and optional debug logging. Side effects include command registration, status-controller mutation, worktree creation, active-session replacement, optional worktree rollback, optional prompt-debug file creation, user-message delivery during execution, and optional debug-log writes.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-004, REQ-067, REQ-068, REQ-169, REQ-200, REQ-201, REQ-202, REQ-203, REQ-206, REQ-207, REQ-219, REQ-220, REQ-221, REQ-224, REQ-225, REQ-226, REQ-227, REQ-245, REQ-246, REQ-247, REQ-277, REQ-281, REQ-377, REQ-416, REQ-417, REQ-418, REQ-427, REQ-428, REQ-621, REQ-622, REQ-623

### fn `function registerAgentTools(pi: ExtensionAPI): void` (L3961-4260)
- @brief Registers pi-usereq agent tools exposed to the model.
- @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-100, REQ-101, REQ-102, REQ-293, REQ-294, REQ-295, REQ-296, REQ-297

### fn `function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L4305-4330)
- @brief Builds the shared settings-menu choices for startup-tool management.
- @details Serializes startup-tool actions into right-valued menu rows consumed by the shared settings-menu renderer while omitting the removed status-reference action. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered startup-tool menu choices.
- @satisfies REQ-007, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193

### fn `function buildPiUsereqToolToggleChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L4340-4354)
- @brief Builds the shared settings-menu choices for per-tool startup toggles.
- @details Exposes every configurable startup tool as one row whose right-side value reports the current enabled state, preserves the documented custom/files/embedded/default-disabled ordering, and appends a value-less subtree-local `Reset defaults` row. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered per-tool toggle choices.
- @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154, REQ-231, REQ-232

### fn `async function configurePiUsereqToolsMenu(` (L4365-4482)
- @brief Runs the interactive active-tool configuration menu.
- @details Synchronizes runtime active tools with the effective config, renders startup-tool actions through the shared settings-menu UI, persists enablement changes into global configuration, preserves the documented per-tool ordering, and updates configuration state in response to selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-007, REQ-063, REQ-064, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193, REQ-231, REQ-232

### fn `function getStaticCheckLanguageConfigForMenu(` (L4491-4496)
- @brief Resolves one static-check language config for menu rendering.
- @details Returns the configured per-language static-check object when present and otherwise synthesizes a disabled empty-language object so menu code can render all supported languages deterministically. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] language {string} Canonical language name.
- @return {StaticCheckLanguageConfig} Resolved per-language config object.

### fn `function countConfiguredStaticCheckLanguages(config: UseReqConfig): number` (L4504-4506)
- @brief Counts languages that currently expose at least one configured checker.
- @details Treats configured-but-disabled languages as configured when their checker list is non-empty so removal actions remain deterministic. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {number} Number of languages with at least one configured checker.

### fn `function countEnabledStaticCheckLanguages(config: UseReqConfig): number` (L4514-4516)
- @brief Counts languages whose static-check enable flag is on.
- @details Counts only languages whose persisted per-language config explicitly sets `enabled=enable`, regardless of checker count. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {number} Number of enabled languages.

### fn `function resetStaticCheckConfig(config: UseReqConfig): void` (L4525-4527)
- @brief Restores the documented static-check default configuration.
- @details Replaces the mutable config subtree with a fresh clone of the documented per-language defaults so menu reset actions restore both enable flags and checker lists in one step. Runtime is O(l + c). Side effect: mutates `config`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.
- @satisfies REQ-250, REQ-251, REQ-252

### fn `function formatStaticCheckLanguagesSummary(config: UseReqConfig): string` (L4535-4537)
- @brief Summarizes enabled and configured static-check languages.
- @details Counts enabled languages and languages with at least one checker, then emits one compact summary string suitable for the top-level configuration menu. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Compact summary string.

### fn `function buildStaticCheckMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L4546-4590)
- @brief Builds the shared settings-menu choices for static-check management.
- @details Serializes guided Command-oriented add and remove actions, renders one direct on/off toggle row for every supported language, and appends canonical terminal rows while omitting raw-spec and reference-only actions. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered static-check menu choices.
- @satisfies REQ-008, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-160, REQ-161, REQ-193, REQ-248, REQ-345, REQ-347

### fn `function buildSupportedStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L4598-4615)
- @brief Builds the shared settings-menu choices for supported static-check languages.
- @details Exposes every supported language as one row whose right-side value reports extensions, enablement, and configured checker count for guided Command configuration flows, then appends subtree-local terminal rows. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered language-choice vector.

### fn `function buildConfiguredStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L4623-4640)
- @brief Builds the shared settings-menu choices for configured static-check languages.
- @details Exposes only languages whose checker lists are non-empty so removal remains deterministic, then appends subtree-local terminal rows. Runtime is O(l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered configured-language vector.

### fn `function formatStaticCheckCheckerEntry(entry: StaticCheckEntry): string` (L4648-4652)
- @brief Formats one static-check checker entry as a compact command summary.
- @details Joins the module command plus its parameter list into a single shell-like token sequence so inspection and confirmation menus can render checker identity deterministically. Runtime is O(p) in parameter count. No external state is mutated.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry.
- @return {string} Compact command summary string.

### fn `function formatStaticCheckLanguageCheckerSummary(config: UseReqConfig, language: string): string` (L4661-4667)
- @brief Summarizes every configured checker for one language as a delimited command list.
- @details Joins each checker entry summary with `; ` so the value column exposes the full language configuration in one row. Runtime is O(c * p). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] language {string} Canonical language name.
- @return {string} Delimited checker summary string, or `(none)` when no checkers are configured.

### fn `function buildStaticCheckViewChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L4676-4721)
- @brief Builds the shared settings-menu choices for the read-only static-check inspection submenu.
- @details Exposes only configured languages as disabled rows whose value column renders the full checker command list, appends one selectable `Close` row, and emits a disabled placeholder when no language is configured so the submenu never mutates configuration. Runtime is O(l * c * p). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered read-only inspection choices.
- @satisfies REQ-346

### fn `function buildStaticCheckRemovalConfirmationChoices(` (L4731-4769)
- @brief Builds the confirmation submenu choices for removing one configured static-check language.
- @details Renders each configured checker as a disabled preview row, appends explicit approve and abort actions, and falls back to one disabled no-op row when the language has no checkers. Runtime is O(c * p). No external state is mutated.
- @param[in] language {string} Canonical language name targeted for removal.
- @param[in] checkers {StaticCheckEntry[]} Configured checker entries that removal would clear.
- @return {PiUsereqSettingsMenuChoice[]} Ordered removal-confirmation choices.
- @satisfies REQ-349

### fn `async function confirmStaticCheckRemoval(` (L4780-4791)
- @brief Opens one explicit removal-confirmation submenu for a configured static-check language.
- @details Renders the targeted checker entries before removal and returns `true` only when the user selects the explicit approval action. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] language {string} Canonical language name targeted for removal.
- @param[in] checkers {StaticCheckEntry[]} Configured checker entries that removal would clear.
- @return {Promise<boolean>} `true` when the removal is explicitly approved.
- @satisfies REQ-349

### fn `async function configureStaticCheckMenu(` (L4801-4980)
- @brief Runs the interactive static-check configuration menu.
- @details Lets the user add, inspect, confirm-before-remove, and reset global Command entries, toggle direct local per-language enable flags, and reset the subtree to documented defaults through the shared settings-menu renderer until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-008, REQ-151, REQ-152, REQ-153, REQ-154, REQ-160, REQ-161, REQ-193, REQ-195, REQ-248, REQ-253, REQ-345, REQ-346, REQ-347, REQ-348, REQ-349

### fn `function formatContextFilesSummary(` (L4991-5006)
- @brief Summarizes the `Context Files` flag state with measured sizes and context occupancy for the top-level menu value column.
- @details Renders the three context-file flags as compact `name:on|off` segments in the documented order, appending `(<chars>c/<tokens>t)` measured size facts to every enabled segment, then appends the occupancy suffix computed from the enabled existing token total against the selected model max input context (`[<percent>% context]`, or `[<percent>%/1.0M* context]` with the documented fallback) whenever that total contributes tokens, while disabled segments stay plain `name:off`. Runtime is O(1) in segment count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] sizes {Record<ContextFileName, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens; undefined selects the documented 1,000,000-token fallback.
- @return {string} Compact `Context Files` summary string with the occupancy suffix.
- @satisfies REQ-327, REQ-376, REQ-402, REQ-403, REQ-404, REQ-405

### fn `function buildContextFilesMenuChoices(` (L5017-5060)
- @brief Builds the shared settings-menu choices for the `Context Files` submenu.
- @details Exposes one inline toggle row per context file in the documented `REQUIREMENTS.md`, `REFERENCES.md`, `WORKFLOW.md` order whose value renders `on|off • <chars>c/<tokens>t` measured size facts plus a per-file context-occupancy suffix computed from that row's measured token count against the selected model max input context (or the documented 1,000,000-token fallback), omitted for rows whose measured token count is zero, followed by a value-less subtree-local `Reset defaults` row. Cycle values embed the same measured facts and per-file occupancy suffix so inline toggling keeps the size estimate visible while persisting the on|off state. Runtime is O(1) in row count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] sizes {Record<ContextFileName, ContextFileSizeFacts>} Measured context-file size facts keyed by canonical file name.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens; undefined selects the documented 1,000,000-token fallback.
- @return {PiUsereqSettingsMenuChoice[]} Ordered `Context Files` submenu choices.
- @satisfies REQ-327, REQ-328, REQ-333, REQ-375, REQ-403, REQ-404, REQ-406, REQ-412

### fn `async function configureContextFilesMenu(` (L5072-5132)
- @brief Runs the `Context Files` configuration submenu.
- @details Measures the context files through the yielding async measurement helper, then loads the shared settings menu with the three context-file toggle rows, persists each inline toggle immediately through the shared change callback, restores all three flags to enabled on approved subtree reset, preserves focus on the toggled row, and returns to the top-level menu on cancel. Runtime depends on user interaction count. Side effects include config writes and UI notifications.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] onConfigChange {() => void} Shared persistence-plus-status callback.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens used by the submenu occupancy suffix; undefined selects the documented 1,000,000-token fallback.
- @param[in,out] config {UseReqConfig} Mutable effective project configuration.
- @return {Promise<void>} Promise resolved when the submenu closes.
- @satisfies REQ-327, REQ-328, REQ-333, REQ-406

### fn `const setFlag = (flagKey: "context-files-requirements" | "context-files-references" | "context-files-workflow", enabled: boolean): void =>` (L5079-5083)

### fn `function buildPiUsereqMenuChoices(` (L5143-5249)
- @brief Builds the shared settings-menu choices for the top-level pi-usereq configuration UI.
- @details Serializes primary configuration actions into right-valued menu rows consumed by the shared settings-menu renderer, including the `Context Files` injection toggles, automatic git-commit mode, effective prompt-command worktree state, notification summary, debug summary, locked worktree rows when automatic git commit is disabled, and display-only local plus global config paths. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] maxContextTokens {number | undefined} Selected model max input context tokens used by the `Context Files` occupancy suffix; undefined selects the documented 1,000,000-token fallback.
- @return {PiUsereqSettingsMenuChoice[]} Ordered top-level menu choices.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-162, REQ-190, REQ-191, REQ-197, REQ-204, REQ-205, REQ-212, REQ-215, REQ-216, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-314, REQ-318, REQ-319, REQ-320, REQ-326, REQ-376, REQ-405

### fn `function buildSrcDirMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L5258-5276)
- @brief Builds the shared settings-menu choices for source-directory management.
- @details Exposes add and remove actions for `src-dir` entries through right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered source-directory management choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154, REQ-193

### fn `function buildSrcDirRemovalChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L5285-5297)
- @brief Builds the shared settings-menu choices for removing one source-directory entry.
- @details Exposes every configured `src-dir` entry as one removable row and appends a value-less subtree-local `Reset defaults` row. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered removable source-directory choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154

### fn `async function configurePiUsereq(` (L5308-5569)
- @brief Runs the top-level pi-usereq configuration menu.
- @details Loads the effective merged config, performs one yielding async context-file measurement warm pass so menu renders resolve through stat-signed cache hits instead of first-measurement encodes, exposes docs/test/source/automatic-commit/worktree/static-check/startup-tool/notification/debug actions through the shared settings-menu renderer, forces worktree disablement when automatic git commit is disabled, prevents locked row edits, persists changes on exit, closes immediately after `Show local configuration` or `Show global configuration`, and refreshes the single-line status bar. Runtime depends on user interaction count. Side effects include UI updates, config writes, active-tool changes, and editor text updates.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-162, REQ-190, REQ-191, REQ-192, REQ-194, REQ-195, REQ-204, REQ-205, REQ-212, REQ-215, REQ-216, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243, REQ-314, REQ-318, REQ-319, REQ-320, REQ-326, REQ-327, REQ-328, REQ-333

### fn `const persistConfigChange = () =>` (L5321-5326)

### fn `function registerConfigCommands(` (L5579-5589)
- @brief Registers configuration-management commands.
- @details Adds the interactive `pi-usereq` configuration command only; the config-viewer action is now exposed exclusively inside that menu. Runtime is O(1) for registration. Side effects include command registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-006, REQ-031

### fn `function activatePiUsereqExtension(pi: ExtensionAPI): void` (L5598-5623)
- @brief Activates the complete pi-usereq extension surface.
- @details Deploys the PATH-accessible `pi-usereq` launcher symlink best-effort for pi-package installations so pi-package installations expose the management CLI as a direct command without global npm bin linking, plus the best-effort conditional `~/bin/pi-usereq` symlink layer targeting the deployed agent-bin launcher whenever the user-home bin directory already exists and both never aborting activation, persists the live extension api into process-scoped storage on every bind so model re-application after session replacement binds to the api of the currently active session runner instead of an invalidated captured api, registers the durable `pi-usereq.command-report` transcript entry renderer, schedules the once-per-process pi CLI host version probe whose below-minimum result surfaces as one `session_start` warning notification, then validates installation-owned bundled resources, schedules a best-effort idle-time shared-tokenizer plus canonical-context-file measurement pre-warm so the first configuration-menu render never pays the one-time `js-tiktoken` module load or first content encodes synchronously, registers the specialized `req-reset` and `req-references` commands plus bundled prompt-backed commands and agent tools, conditionally registers config-gated debug tool wrapper commands when the current project enables them, registers configuration commands, registers the configurable notification-sound shortcut when the runtime supports shortcuts, and installs shared wrappers for all supported pi lifecycle hooks so status telemetry, context usage, prompt timing, cumulative runtime, prompt-specific Pushover metadata, tool-result debug logging, and prompt-orchestration effects remain synchronized with runtime events. Runtime is O(h) in hook count during registration. Side effects include filesystem reads, best-effort launcher symlink deployment, command/tool/shortcut registration, UI updates, active-tool changes, process-scoped extension-api persistence, optional debug-log writes, and timer scheduling.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies DES-002, DES-015, DES-030, REQ-004, REQ-005, REQ-009, REQ-044, REQ-067, REQ-068, REQ-109, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118, REQ-119, REQ-120, REQ-121, REQ-122, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-131, REQ-132, REQ-133, REQ-134, REQ-137, REQ-159, REQ-163, REQ-164, REQ-165, REQ-166, REQ-167, REQ-168, REQ-169, REQ-172, REQ-174, REQ-179, REQ-180, REQ-184, REQ-188, REQ-190, REQ-191, REQ-192, REQ-193, REQ-194, REQ-195, REQ-196, REQ-197, REQ-236, REQ-237, REQ-238, REQ-239, REQ-240, REQ-241, REQ-242, REQ-243, REQ-244, REQ-245, REQ-246, REQ-247, REQ-298, REQ-299, REQ-300, REQ-301, REQ-302, REQ-303, REQ-304, REQ-305, REQ-306, REQ-312, REQ-313, REQ-323, REQ-324, REQ-325, REQ-326, REQ-327, REQ-456, REQ-504, REQ-505, REQ-506, REQ-507, REQ-516, REQ-517, REQ-518, REQ-519, REQ-520

### fn `export default function piUsereqExtension(pi: ExtensionAPI): void` (L5632-5642)
- @brief Registers the complete pi-usereq extension at most once per installation in one pi host process.
- @details Claims activation ownership for the executing installation path before any launcher deployment, registration, persistence, or probe scheduling, so a duplicated installation of the same package from another pi-managed source cannot register the documented commands, agent tools, shortcuts, and lifecycle hooks a second time; pi keeps every loaded extension active and reports duplicated tool names as extension load errors, so skipping the duplicate keeps the effective registered inventory identical (pi already resolves precedence by load order) while removing the conflict diagnostics. Repeated activation of the same installation path stays allowed because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` and the extension must re-register on every rebind. Claim release on activation failure preserves the documented behavior where a partially initialized installation surfaces its failure while another installed copy can still activate. Runtime is O(1) plus the delegated activation cost. Side effects are limited to process-scoped activation state mutation plus the delegated activation side effects only for the owning installation.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`FindToolScope`|type||32||
|`PiShortcutRegistrar`|iface||246-254|interface PiShortcutRegistrar|
|`getProjectBase`|fn||262-271|function getProjectBase(cwd: string): string|
|`getProcessCwdSafe`|fn||278-287|function getProcessCwdSafe(): string|
|`resolveLiveBootstrapCwd`|fn||295-307|function resolveLiveBootstrapCwd(cwd: string): string|
|`syncContextCwdMirror`|fn||316-325|function syncContextCwdMirror(ctx: { cwd?: string }, cwd:...|
|`loadPromptRunBaseConfig`|fn||334-336|function loadPromptRunBaseConfig(projectBase: string): Us...|
|`buildPromptProviderReplayFacts`|fn||346-361|function buildPromptProviderReplayFacts(|
|`loadProjectConfig`|fn||370-373|function loadProjectConfig(cwd: string): UseReqConfig|
|`DebugToolCommandExecuteResult`|type||379||
|`shouldRegisterDebugToolCommands`|fn||388-394|function shouldRegisterDebugToolCommands(cwd: string): bo...|
|`writeDebugToolCommandResultToEditor`|fn||405-419|function writeDebugToolCommandResultToEditor(|
|`executeDebugToolCommand`|fn||431-449|function executeDebugToolCommand(|
|`registerDebugToolCommands`|fn||458-497|function registerDebugToolCommands(pi: ExtensionAPI): void|
|`saveProjectConfig`|fn||507-510|function saveProjectConfig(cwd: string, config: UseReqCon...|
|`formatLocalConfigPathForMenu`|fn||519-523|function formatLocalConfigPathForMenu(cwd: string): string|
|`formatGlobalConfigPathForMenu`|fn||531-533|function formatGlobalConfigPathForMenu(): string|
|`buildTerminalSettingsMenuChoices`|fn||542-553|function buildTerminalSettingsMenuChoices(options:|
|`ResetConfirmationChange`|iface||559-563|interface ResetConfirmationChange|
|`formatResetConfirmationValue`|fn||572-574|function formatResetConfirmationValue(previousValue: stri...|
|`buildResetConfirmationChoices`|fn||584-623|function buildResetConfirmationChoices(|
|`confirmResetChanges`|fn||635-648|async function confirmResetChanges(|
|`writePersistedConfigToEditor`|fn||657-662|function writePersistedConfigToEditor(|
|`writePersistedLocalConfigToEditor`|fn||672-678|function writePersistedLocalConfigToEditor(|
|`writePersistedGlobalConfigToEditor`|fn||687-691|function writePersistedGlobalConfigToEditor(|
|`buildSearchToolSupportedTagGuidelines`|fn||752-756|function buildSearchToolSupportedTagGuidelines(): string[]|
|`buildSearchToolSchemaDescription`|fn||764-769|function buildSearchToolSchemaDescription(scope: FindTool...|
|`buildSearchToolPromptGuidelines`|fn||777-790|function buildSearchToolPromptGuidelines(scope: FindToolS...|
|`MonolithicToolRenderResult`|type||796||
|`getMonolithicToolText`|fn||813-816|function getMonolithicToolText(result: MonolithicToolRend...|
|`getMonolithicToolErrorText`|fn||824-834|function getMonolithicToolErrorText(result: MonolithicToo...|
|`formatCompactToolArgumentValue`|fn||842-881|function formatCompactToolArgumentValue(value: unknown): ...|
|`buildCompactToolInvocationText`|fn||889-900|function buildCompactToolInvocationText(args: Record<stri...|
|`summarizeStructuredToolResult`|fn||910-925|function summarizeStructuredToolResult(|
|`buildStructuredToolRenderResult`|fn||934-957|function buildStructuredToolRenderResult(toolName: string)|
|`executeMonolithicTool`|fn||965-971|function executeMonolithicTool(operation: () => ToolResul...|
|`executeStatusTool`|fn||980-1009|function executeStatusTool(operation: () => ToolResult): ...|
|`deliverPromptCommand`|fn||1021-1093|function deliverPromptCommand(|
|`shouldIgnoreLatePromptDeliveryFailure`|fn||1104-1120|function shouldIgnoreLatePromptDeliveryFailure(|
|`logPromptWorkflowStateChange`|fn||1133-1152|function logPromptWorkflowStateChange(|
|`logPromptWorkflowEvent`|fn||1168-1188|function logPromptWorkflowEvent(|
|`transitionPromptWorkflowState`|fn||1201-1214|function transitionPromptWorkflowState(|
|`resolvePromptCommandDescription`|fn||1222-1226|function resolvePromptCommandDescription(|
|`resolveDebugProjectBase`|fn||1235-1239|function resolveDebugProjectBase(cwd: string, statusContr...|
|`notifyContextSafely`|fn||1250-1269|function notifyContextSafely(|
|`notifyContextRetentionReminder`|fn||1279-1292|function notifyContextRetentionReminder(|
|`rejectNonIdleReqCommand`|fn||1304-1324|function rejectNonIdleReqCommand(|
|`getPiUsereqStartupTools`|fn||1333-1341|function getPiUsereqStartupTools(pi: ExtensionAPI): ToolI...|
|`getConfiguredEnabledPiUsereqTools`|fn||1349-1353|function getConfiguredEnabledPiUsereqTools(config: UseReq...|
|`applyConfiguredPiUsereqTools`|fn||1363-1380|function applyConfiguredPiUsereqTools(pi: ExtensionAPI, c...|
|`isPiAgentSettledEventSupported`|fn||1390-1407|function isPiAgentSettledEventSupported(|
|`finalizeMatchedPromptSuccess`|fn||1419-1521|async function finalizeMatchedPromptSuccess(|
|`buildAgentEndOutputText`|fn||1530-1555|function buildAgentEndOutputText(event: unknown): string|
|`handleExtensionStatusEvent`|fn||1568-1867|async function handleExtensionStatusEvent(|
|`registerExtensionStatusHooks`|fn||2048-2067|function registerExtensionStatusHooks(|
|`setConfiguredPiUsereqTools`|fn||2077-2080|function setConfiguredPiUsereqTools(pi: ExtensionAPI, con...|
|`getDebugToolToggleNames`|fn||2088-2090|function getDebugToolToggleNames(): PiUsereqStartupToolNa...|
|`resetDebugConfigToDefaults`|fn||2099-2111|function resetDebugConfigToDefaults(config: UseReqConfig)...|
|`formatDebugMenuSummary`|fn||2119-2125|function formatDebugMenuSummary(config: UseReqConfig): st...|
|`buildDebugMenuChoice`|fn||2135-2148|function buildDebugMenuChoice(|
|`selectDebugLogOnStatus`|fn||2157-2185|async function selectDebugLogOnStatus(|
|`buildDebugMenuChoices`|fn||2194-2299|function buildDebugMenuChoices(config: UseReqConfig): PiU...|
|`configureDebugMenu`|fn||2310-2527|async function configureDebugMenu(|
|`updateDebugToolCommandsEnabled`|fn||2316-2323|const updateDebugToolCommandsEnabled = (nextValue: unknow...|
|`PiNotifyBooleanConfigKey`|type||2533||
|`PiNotifyEventBooleanConfigKey`|type||2550||
|`PiNotifyEventId`|type||2559||
|`PiNotifyEventRowDefinition`|iface||2565-2569|interface PiNotifyEventRowDefinition|
|`PiNotifyEventMenuDefinition`|iface||2575-2581|interface PiNotifyEventMenuDefinition|
|`togglePiNotifyFlag`|fn||2590-2593|function togglePiNotifyFlag(config: UseReqConfig, key: Pi...|
|`resetPiNotifyConfigToDefaults`|fn||2602-2626|function resetPiNotifyConfigToDefaults(config: UseReqConf...|
|`formatPiNotifyPushoverPriority`|fn||2635-2637|function formatPiNotifyPushoverPriority(priority: PiNotif...|
|`formatPiNotifyEventMenuSummary`|fn||2721-2729|function formatPiNotifyEventMenuSummary(|
|`buildPiNotifyEventLauncherChoice`|fn||2739-2749|function buildPiNotifyEventLauncherChoice(|
|`buildPiNotifyEventMenuChoices`|fn||2759-2775|function buildPiNotifyEventMenuChoices(|
|`resetPiNotifyEventMenuToDefaults`|fn||2785-2793|function resetPiNotifyEventMenuToDefaults(|
|`resolvePiNotifyEventLabel`|fn||2803-2810|function resolvePiNotifyEventLabel(|
|`configurePiNotifyEventMenu`|fn||2821-2897|async function configurePiNotifyEventMenu(|
|`buildPiNotifyPushoverRows`|fn||2906-2956|function buildPiNotifyPushoverRows(config: UseReqConfig):...|
|`selectPiNotifyPushoverPriority`|fn||2966-2994|async function selectPiNotifyPushoverPriority(|
|`buildPiNotifyMenuChoices`|fn||3003-3061|function buildPiNotifyMenuChoices(config: UseReqConfig): ...|
|`selectPiNotifySoundLevel`|fn||3071-3111|async function selectPiNotifySoundLevel(|
|`configurePiNotifyMenu`|fn||3121-3407|async function configurePiNotifyMenu(|
|`registerPiNotifyShortcut`|fn||3422-3445|function registerPiNotifyShortcut(|
|`PromptModelSelectionApiSurface`|type||3451||
|`PromptModelSelectionContextSurface`|type||3461||
|`resolveCurrentModelSelection`|fn||3474-3490|function resolveCurrentModelSelection(|
|`resolveCurrentThinkingLevel`|fn||3500-3518|function resolveCurrentThinkingLevel(pi: ExtensionAPI, ct...|
|`resolvePromptCommandModelSurface`|fn||3528-3552|function resolvePromptCommandModelSurface(|
|`reapplyCapturedPromptModelSelection`|fn||3564-3580|async function reapplyCapturedPromptModelSelection(|
|`resolveReqResetPromptRequest`|fn||3588-3614|function resolveReqResetPromptRequest(|
|`isWorktreeBacked`|fn||3591-3598|const isWorktreeBacked = (request: PromptCommandExecution...|
|`registerReqResetCommand`|fn||3624-3691|function registerReqResetCommand(|
|`registerReqReferencesCommand`|fn||3701-3763|function registerReqReferencesCommand(|
|`registerPromptCommands`|fn||3773-3951|function registerPromptCommands(|
|`registerAgentTools`|fn||3961-4260|function registerAgentTools(pi: ExtensionAPI): void|
|`buildPiUsereqToolsMenuChoices`|fn||4305-4330|function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, ...|
|`buildPiUsereqToolToggleChoices`|fn||4340-4354|function buildPiUsereqToolToggleChoices(pi: ExtensionAPI,...|
|`configurePiUsereqToolsMenu`|fn||4365-4482|async function configurePiUsereqToolsMenu(|
|`getStaticCheckLanguageConfigForMenu`|fn||4491-4496|function getStaticCheckLanguageConfigForMenu(|
|`countConfiguredStaticCheckLanguages`|fn||4504-4506|function countConfiguredStaticCheckLanguages(config: UseR...|
|`countEnabledStaticCheckLanguages`|fn||4514-4516|function countEnabledStaticCheckLanguages(config: UseReqC...|
|`resetStaticCheckConfig`|fn||4525-4527|function resetStaticCheckConfig(config: UseReqConfig): void|
|`formatStaticCheckLanguagesSummary`|fn||4535-4537|function formatStaticCheckLanguagesSummary(config: UseReq...|
|`buildStaticCheckMenuChoices`|fn||4546-4590|function buildStaticCheckMenuChoices(config: UseReqConfig...|
|`buildSupportedStaticCheckLanguageChoices`|fn||4598-4615|function buildSupportedStaticCheckLanguageChoices(config:...|
|`buildConfiguredStaticCheckLanguageChoices`|fn||4623-4640|function buildConfiguredStaticCheckLanguageChoices(config...|
|`formatStaticCheckCheckerEntry`|fn||4648-4652|function formatStaticCheckCheckerEntry(entry: StaticCheck...|
|`formatStaticCheckLanguageCheckerSummary`|fn||4661-4667|function formatStaticCheckLanguageCheckerSummary(config: ...|
|`buildStaticCheckViewChoices`|fn||4676-4721|function buildStaticCheckViewChoices(config: UseReqConfig...|
|`buildStaticCheckRemovalConfirmationChoices`|fn||4731-4769|function buildStaticCheckRemovalConfirmationChoices(|
|`confirmStaticCheckRemoval`|fn||4780-4791|async function confirmStaticCheckRemoval(|
|`configureStaticCheckMenu`|fn||4801-4980|async function configureStaticCheckMenu(|
|`formatContextFilesSummary`|fn||4991-5006|function formatContextFilesSummary(|
|`buildContextFilesMenuChoices`|fn||5017-5060|function buildContextFilesMenuChoices(|
|`configureContextFilesMenu`|fn||5072-5132|async function configureContextFilesMenu(|
|`setFlag`|fn||5079-5083|const setFlag = (flagKey: "context-files-requirements" | ...|
|`buildPiUsereqMenuChoices`|fn||5143-5249|function buildPiUsereqMenuChoices(|
|`buildSrcDirMenuChoices`|fn||5258-5276|function buildSrcDirMenuChoices(config: UseReqConfig): Pi...|
|`buildSrcDirRemovalChoices`|fn||5285-5297|function buildSrcDirRemovalChoices(config: UseReqConfig):...|
|`configurePiUsereq`|fn||5308-5569|async function configurePiUsereq(|
|`persistConfigChange`|fn||5321-5326|const persistConfigChange = () =>|
|`registerConfigCommands`|fn||5579-5589|function registerConfigCommands(|
|`activatePiUsereqExtension`|fn||5598-5623|function activatePiUsereqExtension(pi: ExtensionAPI): void|
|`piUsereqExtension`|fn||5632-5642|export default function piUsereqExtension(pi: ExtensionAP...|

