# Files Structure
```
.
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

# cli.ts | TypeScript | 240L | 7 symbols | 5 imports | 0 comments
> Path: `src/cli.ts`

## Imports
```
import process from "node:process";
import { ReqError } from "./core/errors.js";
import { loadConfig } from "./core/config.js";
import {
import { runStaticCheck } from "./core/static-check.js";
```

## Definitions

### iface `interface ParsedArgs` (L27-49)

### fn `function parseArgs(argv: string[]): ParsedArgs` (L51-167)

### fn `const takeUntilOption = (start: number): [string[], number] =>` (L53-61)

### fn `function writeStdout(text: string): void` (L169-171)

### fn `function writeStderr(text: string): void` (L173-176)

### fn `function writeResult(result: { stdout: string; stderr: string; code: number }): number` (L178-182)

### fn `export function main(argv = process.argv.slice(2)): number` (L184-236)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ParsedArgs`|iface||27-49|interface ParsedArgs|
|`parseArgs`|fn||51-167|function parseArgs(argv: string[]): ParsedArgs|
|`takeUntilOption`|fn||53-61|const takeUntilOption = (start: number): [string[], numbe...|
|`writeStdout`|fn||169-171|function writeStdout(text: string): void|
|`writeStderr`|fn||173-176|function writeStderr(text: string): void|
|`writeResult`|fn||178-182|function writeResult(result: { stdout: string; stderr: st...|
|`main`|fn||184-236|export function main(argv = process.argv.slice(2)): number|


---

# compress-files.ts | TypeScript | 61L | 3 symbols | 3 imports | 0 comments
> Path: `src/core/compress-files.ts`

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { compressFile, detectLanguage } from "./compress.js";
```

## Definitions

### fn `function extractLineRange(compressedWithLineNumbers: string): [number, number]` (L5-13)

### fn `function formatOutputPath(filePath: string, outputBase?: string): string` (L15-18)

### fn `export function compressFiles(` (L20-61)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`extractLineRange`|fn||5-13|function extractLineRange(compressedWithLineNumbers: stri...|
|`formatOutputPath`|fn||15-18|function formatOutputPath(filePath: string, outputBase?: ...|
|`compressFiles`|fn||20-61|export function compressFiles(|


---

# compress.ts | TypeScript | 287L | 7 symbols | 3 imports | 0 comments
> Path: `src/core/compress.ts`

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { buildLanguageSpecs } from "./source-analyzer.js";
```

## Definitions

### fn `function getSpecs()` (L34-37)

### fn `export function detectLanguage(filePath: string): string | undefined` (L39-41)

### fn `function isInString(line: string, pos: number, stringDelimiters: string[]): boolean` (L43-78)

### fn `function removeInlineComment(line: string, singleComment: string | undefined, stringDelimiters: string[]): string` (L80-120)

### fn `function formatResult(entries: Array<[number, string]>, includeLineNumbers: boolean): string` (L122-126)

### fn `export function compressSource(source: string, language: string, includeLineNumbers = true): string` (L128-278)

### fn `export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string` (L280-287)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getSpecs`|fn||34-37|function getSpecs()|
|`detectLanguage`|fn||39-41|export function detectLanguage(filePath: string): string ...|
|`isInString`|fn||43-78|function isInString(line: string, pos: number, stringDeli...|
|`removeInlineComment`|fn||80-120|function removeInlineComment(line: string, singleComment:...|
|`formatResult`|fn||122-126|function formatResult(entries: Array<[number, string]>, i...|
|`compressSource`|fn||128-278|export function compressSource(source: string, language: ...|
|`compressFile`|fn||280-287|export function compressFile(filePath: string, language?:...|


---

# config.ts | TypeScript | 130L | 9 symbols | 6 imports | 0 comments
> Path: `src/core/config.ts`

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

### iface `export interface StaticCheckEntry` (L8-12)

### iface `export interface UseReqConfig` (L14-22)

### fn `export function getProjectConfigPath(projectBase: string): string` (L29-31)

### fn `export function getHomeResourceRoot(): string` (L33-35)

### fn `export function getDefaultConfig(projectBase: string): UseReqConfig` (L37-46)

### fn `export function loadConfig(projectBase: string): UseReqConfig` (L48-86)

### fn `export function saveConfig(projectBase: string, config: UseReqConfig): void` (L88-92)

### fn `export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig` (L94-104)

### fn `export function buildPromptReplacementPaths(projectBase: string, config: UseReqConfig): Record<string, string>` (L106-130)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckEntry`|iface||8-12|export interface StaticCheckEntry|
|`UseReqConfig`|iface||14-22|export interface UseReqConfig|
|`getProjectConfigPath`|fn||29-31|export function getProjectConfigPath(projectBase: string)...|
|`getHomeResourceRoot`|fn||33-35|export function getHomeResourceRoot(): string|
|`getDefaultConfig`|fn||37-46|export function getDefaultConfig(projectBase: string): Us...|
|`loadConfig`|fn||48-86|export function loadConfig(projectBase: string): UseReqCo...|
|`saveConfig`|fn||88-92|export function saveConfig(projectBase: string, config: U...|
|`normalizeConfigPaths`|fn||94-104|export function normalizeConfigPaths(projectBase: string,...|
|`buildPromptReplacementPaths`|fn||106-130|export function buildPromptReplacementPaths(projectBase: ...|


---

# doxygen-parser.ts | TypeScript | 118L | 5 symbols | 0 imports | 1 comments
> Path: `src/core/doxygen-parser.ts`

## Definitions

- type `export type DoxygenFieldMap = Record<string, string[]>;` (L36)
### fn `export function parseDoxygenComment(commentText: string): DoxygenFieldMap` (L38-71)

### fn `export function stripCommentDelimiters(text: string): string` (L73-89)

### fn `export function normalizeWhitespace(text: string): string` (L91-107)

### fn `export function formatDoxygenFieldsAsMarkdown(doxygenFields: DoxygenFieldMap): string[]` (L109-118)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`DoxygenFieldMap`|type||36||
|`parseDoxygenComment`|fn||38-71|export function parseDoxygenComment(commentText: string):...|
|`stripCommentDelimiters`|fn||73-89|export function stripCommentDelimiters(text: string): string|
|`normalizeWhitespace`|fn||91-107|export function normalizeWhitespace(text: string): string|
|`formatDoxygenFieldsAsMarkdown`|fn||109-118|export function formatDoxygenFieldsAsMarkdown(doxygenFiel...|


---

# errors.ts | TypeScript | 9L | 1 symbols | 0 imports | 0 comments
> Path: `src/core/errors.ts`

## Definitions

### class `export class ReqError extends Error` : Error (L1-9)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ReqError`|class||1-9|export class ReqError extends Error|


---

# find-constructs.ts | TypeScript | 196L | 10 symbols | 4 imports | 0 comments
> Path: `src/core/find-constructs.ts`

## Imports
```
import fs from "node:fs";
import { compressSource, detectLanguage } from "./compress.js";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
import { SourceAnalyzer, SourceElement, ElementType } from "./source-analyzer.js";
```

## Definitions

### fn `export function formatAvailableTags(): string` (L29-34)

### fn `export function parseTagFilter(tagString: string): Set<string>` (L36-43)

### fn `export function languageSupportsTags(language: string, tagSet: Set<string>): boolean` (L45-48)

### fn `export function constructMatches(element: SourceElement, tagSet: Set<string>, pattern: string): boolean` (L50-58)

### fn `function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]>` (L60-66)

### fn `function extractConstructDoxygenFields(element: SourceElement): Record<string, string[]>` (L68-78)

### fn `function extractFileLevelDoxygenFields(elements: SourceElement[]): Record<string, string[]>` (L80-91)

### fn `function stripConstructComments(codeLines: string[], language: string, lineStart: number, includeLineNumbers: boolean): string` (L93-111)

### fn `export function formatConstruct(element: SourceElement, sourceLines: string[], includeLineNumbers: boolean, language = "python"): string` (L113-128)

### fn `export function findConstructsInFiles(` (L130-196)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatAvailableTags`|fn||29-34|export function formatAvailableTags(): string|
|`parseTagFilter`|fn||36-43|export function parseTagFilter(tagString: string): Set<st...|
|`languageSupportsTags`|fn||45-48|export function languageSupportsTags(language: string, ta...|
|`constructMatches`|fn||50-58|export function constructMatches(element: SourceElement, ...|
|`mergeDoxygenFields`|fn||60-66|function mergeDoxygenFields(baseFields: Record<string, st...|
|`extractConstructDoxygenFields`|fn||68-78|function extractConstructDoxygenFields(element: SourceEle...|
|`extractFileLevelDoxygenFields`|fn||80-91|function extractFileLevelDoxygenFields(elements: SourceEl...|
|`stripConstructComments`|fn||93-111|function stripConstructComments(codeLines: string[], lang...|
|`formatConstruct`|fn||113-128|export function formatConstruct(element: SourceElement, s...|
|`findConstructsInFiles`|fn||130-196|export function findConstructsInFiles(|


---

# generate-markdown.ts | TypeScript | 88L | 3 symbols | 3 imports | 0 comments
> Path: `src/core/generate-markdown.ts`

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { SourceAnalyzer, formatMarkdown } from "./source-analyzer.js";
```

## Definitions

### fn `export function detectLanguage(filePath: string): string | undefined` (L31-33)

### fn `function formatOutputPath(filePath: string, outputBase?: string): string` (L35-38)

### fn `export function generateMarkdown(filePaths: string[], verbose = false, outputBase?: string): string` (L40-88)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`detectLanguage`|fn||31-33|export function detectLanguage(filePath: string): string ...|
|`formatOutputPath`|fn||35-38|function formatOutputPath(filePath: string, outputBase?: ...|
|`generateMarkdown`|fn||40-88|export function generateMarkdown(filePaths: string[], ver...|


---

# pi-usereq-tools.ts | TypeScript | 32L | 2 symbols | 0 imports | 0 comments
> Path: `src/core/pi-usereq-tools.ts`

## Definitions

- type `export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];` (L21)
### fn `export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[]` (L25-32)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqStartupToolName`|type||21||
|`normalizeEnabledPiUsereqTools`|fn||25-32|export function normalizeEnabledPiUsereqTools(value: unkn...|


---

# prompts.ts | TypeScript | 154L | 5 symbols | 4 imports | 5 comments
> Path: `src/core/prompts.ts`

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { buildPromptReplacementPaths, type UseReqConfig } from "./config.js";
import { readBundledPrompt } from "./resources.js";
```

## Definitions

### fn `function buildPiDevConformanceBlock(promptName: string, projectBase: string): string` (L66-75)
- @brief Builds the conditional pi.dev conformance block for one rendered prompt.
- @details Emits the manifest-driven rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the pi.dev manifest. Time complexity O(1). No filesystem writes.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Markdown bullet block or the empty string when injection is not applicable.
- @satisfies REQ-032, REQ-033, REQ-034

### fn `function injectPiDevConformanceBlock(text: string, promptName: string, projectBase: string): string` (L86-93)
- @brief Injects the pi.dev conformance block into the prompt behavior section.
- @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Prompt markdown with zero or one injected conformance block.
- @satisfies REQ-032, REQ-033, REQ-034

### fn `export function adaptPromptForInternalTools(text: string): string` (L102-108)
- @brief Rewrites bundled prompt tool references from legacy `req --...` syntax to internal tool names.
- @details Applies deterministic global regex replacements so prompt text matches the extension-registered tool surface instead of the standalone CLI spelling. Time complexity O(p*r) where p is pattern count and r is prompt length.
- @param[in] text {string} Prompt markdown before tool-reference normalization.
- @return {string} Prompt markdown with internal tool names.
- @satisfies REQ-003

### fn `export function applyReplacements(text: string, replacements: Record<string, string>): string` (L118-124)
- @brief Applies literal placeholder replacements to bundled prompt markdown.
- @details Replaces every placeholder token using split/join semantics so all occurrences are updated without regex escaping. Time complexity O(t*n) where t is replacement count and n is prompt length.
- @param[in] text {string} Prompt markdown containing placeholder tokens.
- @param[in] replacements {Record<string, string>} Token-to-value map.
- @return {string} Prompt markdown with all placeholder tokens expanded.
- @satisfies REQ-002

### fn `export function renderPrompt(` (L136-154)
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
|`buildPiDevConformanceBlock`|fn||66-75|function buildPiDevConformanceBlock(promptName: string, p...|
|`injectPiDevConformanceBlock`|fn||86-93|function injectPiDevConformanceBlock(text: string, prompt...|
|`adaptPromptForInternalTools`|fn||102-108|export function adaptPromptForInternalTools(text: string)...|
|`applyReplacements`|fn||118-124|export function applyReplacements(text: string, replaceme...|
|`renderPrompt`|fn||136-154|export function renderPrompt(|


---

# resources.ts | TypeScript | 51L | 6 symbols | 4 imports | 0 comments
> Path: `src/core/resources.ts`

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getHomeResourceRoot } from "./config.js";
```

## Definitions

### fn `export function getPackageRoot(): string` (L6-8)

### fn `export function getBundledResourceRoot(): string` (L10-12)

### fn `export function ensureHomeResources(): string` (L14-23)

### fn `function copyDirectoryContents(sourceDir: string, destinationDir: string): void` (L25-38)

### fn `export function readBundledPrompt(promptName: string): string` (L40-43)

### fn `export function listBundledPromptNames(): string[]` (L45-51)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getPackageRoot`|fn||6-8|export function getPackageRoot(): string|
|`getBundledResourceRoot`|fn||10-12|export function getBundledResourceRoot(): string|
|`ensureHomeResources`|fn||14-23|export function ensureHomeResources(): string|
|`copyDirectoryContents`|fn||25-38|function copyDirectoryContents(sourceDir: string, destina...|
|`readBundledPrompt`|fn||40-43|export function readBundledPrompt(promptName: string): st...|
|`listBundledPromptNames`|fn||45-51|export function listBundledPromptNames(): string[]|


---

# source-analyzer.ts | TypeScript | 1481L | 8 symbols | 4 imports | 0 comments
> Path: `src/core/source-analyzer.ts`

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
```

## Definitions

### enum `export enum ElementType` (L6-32)

### class `export class SourceElement` (L34-71)

### iface `export interface LanguageSpec` (L73-80)

### fn `function re(pattern: string): RegExp` (L82-84)

### fn `export function buildLanguageSpecs(): Record<string, LanguageSpec>` (L86-385)

### class `export class SourceAnalyzer` (L448-747)

### fn `const isFileLevelComment = (comment: SourceElement): boolean =>` (L850-853)

### fn `const hasBlockingElement = (comment: SourceElement): boolean =>` (L874-894)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ElementType`|enum||6-32|export enum ElementType|
|`SourceElement`|class||34-71|export class SourceElement|
|`LanguageSpec`|iface||73-80|export interface LanguageSpec|
|`re`|fn||82-84|function re(pattern: string): RegExp|
|`buildLanguageSpecs`|fn||86-385|export function buildLanguageSpecs(): Record<string, Lang...|
|`SourceAnalyzer`|class||448-747|export class SourceAnalyzer|
|`isFileLevelComment`|fn||850-853|const isFileLevelComment = (comment: SourceElement): bool...|
|`hasBlockingElement`|fn||874-894|const hasBlockingElement = (comment: SourceElement): bool...|


---

# static-check.ts | TypeScript | 440L | 15 symbols | 7 imports | 0 comments
> Path: `src/core/static-check.ts`

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

### iface `export interface StaticCheckLanguageSupport` (L63-66)

### fn `export function getSupportedStaticCheckLanguages(): string[]` (L75-77)

### fn `export function getSupportedStaticCheckLanguageSupport(): StaticCheckLanguageSupport[]` (L79-90)

### fn `function formatStaticCheckModules(): string` (L92-94)

### fn `function splitCsvLikeTokens(specRhs: string): string[]` (L96-118)

### fn `export function parseEnableStaticCheck(spec: string): [string, StaticCheckEntry]` (L120-168)

### fn `function resolveFiles(inputs: string[]): string[]` (L170-194)

### class `export class StaticCheckBase` (L196-240)

### fn `function detectPythonExecutable(projectBase?: string): string` (L242-262)

### class `export class StaticCheckPylance extends StaticCheckBase` : StaticCheckBase (L264-301)

### class `export class StaticCheckRuff extends StaticCheckBase` : StaticCheckBase (L303-337)

### class `export class StaticCheckCommand extends StaticCheckBase` : StaticCheckBase (L339-373)

### fn `function findExecutable(cmd: string): string | undefined` (L375-383)

### fn `export function dispatchStaticCheckForFile(` (L385-388)

### fn `export function runStaticCheck(argv: string[]): number` (L415-440)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckLanguageSupport`|iface||63-66|export interface StaticCheckLanguageSupport|
|`getSupportedStaticCheckLanguages`|fn||75-77|export function getSupportedStaticCheckLanguages(): string[]|
|`getSupportedStaticCheckLanguageSupport`|fn||79-90|export function getSupportedStaticCheckLanguageSupport():...|
|`formatStaticCheckModules`|fn||92-94|function formatStaticCheckModules(): string|
|`splitCsvLikeTokens`|fn||96-118|function splitCsvLikeTokens(specRhs: string): string[]|
|`parseEnableStaticCheck`|fn||120-168|export function parseEnableStaticCheck(spec: string): [st...|
|`resolveFiles`|fn||170-194|function resolveFiles(inputs: string[]): string[]|
|`StaticCheckBase`|class||196-240|export class StaticCheckBase|
|`detectPythonExecutable`|fn||242-262|function detectPythonExecutable(projectBase?: string): st...|
|`StaticCheckPylance`|class||264-301|export class StaticCheckPylance extends StaticCheckBase|
|`StaticCheckRuff`|class||303-337|export class StaticCheckRuff extends StaticCheckBase|
|`StaticCheckCommand`|class||339-373|export class StaticCheckCommand extends StaticCheckBase|
|`findExecutable`|fn||375-383|function findExecutable(cmd: string): string | undefined|
|`dispatchStaticCheckForFile`|fn||385-388|export function dispatchStaticCheckForFile(|
|`runStaticCheck`|fn||415-440|export function runStaticCheck(argv: string[]): number|


---

# token-counter.ts | TypeScript | 78L | 4 symbols | 3 imports | 0 comments
> Path: `src/core/token-counter.ts`

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
```

## Definitions

### class `export class TokenCounter` (L5-23)

### fn `export function countFileMetrics(content: string, encodingName = "cl100k_base"): { tokens: number; chars: number }` (L25-31)

### fn `export function countFilesMetrics(filePaths: string[], encodingName = "cl100k_base")` (L33-52)

### fn `export function formatPackSummary(results: Array<{ file: string; tokens: number; chars: number; error?: string }>): string` (L54-78)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`TokenCounter`|class||5-23|export class TokenCounter|
|`countFileMetrics`|fn||25-31|export function countFileMetrics(content: string, encodin...|
|`countFilesMetrics`|fn||33-52|export function countFilesMetrics(filePaths: string[], en...|
|`formatPackSummary`|fn||54-78|export function formatPackSummary(results: Array<{ file: ...|


---

# tool-runner.ts | TypeScript | 425L | 36 symbols | 11 imports | 0 comments
> Path: `src/core/tool-runner.ts`

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

### iface `export interface ToolResult` (L13-17)

### fn `function ok(stdout = "", stderr = ""): ToolResult` (L22-24)

### fn `function fail(message: string, code = 1, stdout = "", stderr = ""): never` (L26-31)

### fn `function runCapture(command: string[], options: { cwd?: string } = {})` (L33-38)

### fn `export function isInsideGitRepo(targetPath: string): boolean` (L40-43)

### fn `export function resolveGitRoot(targetPath: string): string` (L45-51)

### fn `export function sanitizeBranchName(branch: string): string` (L53-55)

### fn `export function validateWtName(wtName: string): boolean` (L57-60)

### fn `export function collectSourceFiles(srcDirs: string[], projectBase: string): string[]` (L62-89)

### fn `function buildAsciiTree(paths: string[]): string` (L91-119)

### fn `const emit = (branch: Record<string, Record<string, unknown> | null>, prefix = "") =>` (L107-116)

### fn `function formatFilesStructureMarkdown(files: string[], projectBase: string): string` (L121-124)

### fn `export function resolveProjectBase(projectBase?: string): string` (L126-132)

### fn `export function resolveProjectSrcDirs(projectBase: string, config?: UseReqConfig): [string, string[]]` (L134-142)

### fn `export function loadAndRepairConfig(projectBase: string): UseReqConfig` (L144-153)

### fn `export function runFilesTokens(files: string[]): ToolResult` (L155-167)

### fn `export function runFilesReferences(files: string[], cwd = process.cwd(), verbose = false): ToolResult` (L169-171)

### fn `export function runFilesCompress(files: string[], cwd = process.cwd(), enableLineNumbers = false, verbose = false): ToolResult` (L173-175)

### fn `export function runFilesFind(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult` (L177-183)

### fn `export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult` (L185-191)

### fn `export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L193-198)

### fn `export function runFind(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L200-209)

### fn `export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult` (L211-220)

### fn `export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult` (L222-258)

### fn `export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L260-273)

### fn `export function runGitCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L275-286)

### fn `export function runDocsCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L288-306)

### fn `export function runGitWtName(projectBase: string, config?: UseReqConfig): ToolResult` (L308-322)

### fn `function worktreePathExistsExact(gitPath: string, targetPath: string): boolean` (L324-329)

### fn `function rollbackWorktreeCreate(gitPath: string, wtPath: string, wtName: string): void` (L331-337)

### fn `export function runGitWtCreate(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L339-376)

### fn `const baseDir = (() =>` (L354-357)

### fn `export function runGitWtDelete(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L378-413)

### fn `const branchExists = (() =>` (L389-392)

### fn `export function runGitPath(projectBase: string, config?: UseReqConfig): ToolResult` (L415-419)

### fn `export function runGetBasePath(projectBase: string, config?: UseReqConfig): ToolResult` (L421-425)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolResult`|iface||13-17|export interface ToolResult|
|`ok`|fn||22-24|function ok(stdout = "", stderr = ""): ToolResult|
|`fail`|fn||26-31|function fail(message: string, code = 1, stdout = "", std...|
|`runCapture`|fn||33-38|function runCapture(command: string[], options: { cwd?: s...|
|`isInsideGitRepo`|fn||40-43|export function isInsideGitRepo(targetPath: string): boolean|
|`resolveGitRoot`|fn||45-51|export function resolveGitRoot(targetPath: string): string|
|`sanitizeBranchName`|fn||53-55|export function sanitizeBranchName(branch: string): string|
|`validateWtName`|fn||57-60|export function validateWtName(wtName: string): boolean|
|`collectSourceFiles`|fn||62-89|export function collectSourceFiles(srcDirs: string[], pro...|
|`buildAsciiTree`|fn||91-119|function buildAsciiTree(paths: string[]): string|
|`emit`|fn||107-116|const emit = (branch: Record<string, Record<string, unkno...|
|`formatFilesStructureMarkdown`|fn||121-124|function formatFilesStructureMarkdown(files: string[], pr...|
|`resolveProjectBase`|fn||126-132|export function resolveProjectBase(projectBase?: string):...|
|`resolveProjectSrcDirs`|fn||134-142|export function resolveProjectSrcDirs(projectBase: string...|
|`loadAndRepairConfig`|fn||144-153|export function loadAndRepairConfig(projectBase: string):...|
|`runFilesTokens`|fn||155-167|export function runFilesTokens(files: string[]): ToolResult|
|`runFilesReferences`|fn||169-171|export function runFilesReferences(files: string[], cwd =...|
|`runFilesCompress`|fn||173-175|export function runFilesCompress(files: string[], cwd = p...|
|`runFilesFind`|fn||177-183|export function runFilesFind(argsList: string[], enableLi...|
|`runReferences`|fn||185-191|export function runReferences(projectBase: string, config...|
|`runCompress`|fn||193-198|export function runCompress(projectBase: string, config?:...|
|`runFind`|fn||200-209|export function runFind(projectBase: string, tagFilter: s...|
|`runTokens`|fn||211-220|export function runTokens(projectBase: string, config?: U...|
|`runFilesStaticCheck`|fn||222-258|export function runFilesStaticCheck(files: string[], proj...|
|`runProjectStaticCheck`|fn||260-273|export function runProjectStaticCheck(projectBase: string...|
|`runGitCheck`|fn||275-286|export function runGitCheck(projectBase: string, config?:...|
|`runDocsCheck`|fn||288-306|export function runDocsCheck(projectBase: string, config?...|
|`runGitWtName`|fn||308-322|export function runGitWtName(projectBase: string, config?...|
|`worktreePathExistsExact`|fn||324-329|function worktreePathExistsExact(gitPath: string, targetP...|
|`rollbackWorktreeCreate`|fn||331-337|function rollbackWorktreeCreate(gitPath: string, wtPath: ...|
|`runGitWtCreate`|fn||339-376|export function runGitWtCreate(projectBase: string, wtNam...|
|`baseDir`|fn||354-357|const baseDir = (() =>|
|`runGitWtDelete`|fn||378-413|export function runGitWtDelete(projectBase: string, wtNam...|
|`branchExists`|fn||389-392|const branchExists = (() =>|
|`runGitPath`|fn||415-419|export function runGitPath(projectBase: string, config?: ...|
|`runGetBasePath`|fn||421-425|export function runGetBasePath(projectBase: string, confi...|


---

# utils.ts | TypeScript | 126L | 8 symbols | 3 imports | 0 comments
> Path: `src/core/utils.ts`

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
```

## Definitions

### fn `export function formatSubstitutedPath(value: string): string` (L5-7)

### fn `export function makeRelativeIfContainsProject(pathValue: string, projectBase: string): string` (L9-49)

### fn `export function resolveAbsolute(normalized: string, projectBase: string): string | undefined` (L51-54)

### fn `export function computeSubPath(normalized: string, absolute: string | undefined, projectBase: string): string` (L56-65)

### fn `export function makeRelativeToken(raw: string, keepTrailing = false): string` (L67-73)

### fn `export function shellSplit(value: string): string[]` (L75-113)

### fn `export function homeRelative(absolutePath: string): string` (L115-122)

### fn `export function escapeRegExp(value: string): string` (L124-126)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatSubstitutedPath`|fn||5-7|export function formatSubstitutedPath(value: string): string|
|`makeRelativeIfContainsProject`|fn||9-49|export function makeRelativeIfContainsProject(pathValue: ...|
|`resolveAbsolute`|fn||51-54|export function resolveAbsolute(normalized: string, proje...|
|`computeSubPath`|fn||56-65|export function computeSubPath(normalized: string, absolu...|
|`makeRelativeToken`|fn||67-73|export function makeRelativeToken(raw: string, keepTraili...|
|`shellSplit`|fn||75-113|export function shellSplit(value: string): string[]|
|`homeRelative`|fn||115-122|export function homeRelative(absolutePath: string): string|
|`escapeRegExp`|fn||124-126|export function escapeRegExp(value: string): string|


---

# index.ts | TypeScript | 858L | 27 symbols | 10 imports | 0 comments
> Path: `src/index.ts`

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

- type `type CommandRunner = (projectBase: string, config: UseReqConfig, args: string[]) => ToolResult;` (L49)
### fn `function getProjectBase(cwd: string): string` (L90-92)

### fn `function loadProjectConfig(cwd: string): UseReqConfig` (L94-104)

### fn `function saveProjectConfig(cwd: string, config: UseReqConfig): void` (L106-110)

### fn `function formatResultForEditor(result: ToolResult): string` (L112-117)

### fn `function showToolResult(ctx: ExtensionCommandContext, result: ToolResult, label: string): void` (L119-129)

### fn `function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[]` (L131-135)

### fn `function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[]` (L137-141)

### fn `function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void` (L143-159)

### fn `function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void` (L161-164)

### fn `function formatPiUsereqToolLabel(tool: ToolInfo, enabled: boolean): string` (L166-169)

### fn `function renderPiUsereqToolsReference(pi: ExtensionAPI, config: UseReqConfig): string` (L171-198)

### fn `async function runToolCommand(name: string, rawArgs: string, ctx: ExtensionCommandContext): Promise<void>` (L200-211)

### fn `function registerPromptCommands(pi: ExtensionAPI): void` (L213-226)

### fn `function registerToolWrapperCommands(pi: ExtensionAPI): void` (L228-263)

### fn `function registerAgentTools(pi: ExtensionAPI): void` (L265-531)

### fn `async function configurePiUsereqToolsMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L533-597)

### fn `function formatStaticCheckEntry(entry: StaticCheckEntry): string` (L599-605)

### fn `function formatStaticCheckLanguagesSummary(config: UseReqConfig): string` (L607-613)

### fn `function buildStaticCheckLanguageLabel(language: string, extensions: string[], configuredCount: number): string` (L615-618)

### fn `function renderStaticCheckReference(config: UseReqConfig): string` (L620-641)

### fn `async function configureStaticCheckMenu(ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L643-750)

### fn `async function configurePiUsereq(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void>` (L752-824)

### fn `const ensureSaved = () => saveProjectConfig(ctx.cwd, config)` (L755-762)

### fn `const refreshStatus = () =>` (L756-762)

### fn `function registerConfigCommands(pi: ExtensionAPI): void` (L826-841)

### fn `export default function piUsereqExtension(pi: ExtensionAPI): void` (L843-858)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`CommandRunner`|type||49||
|`getProjectBase`|fn||90-92|function getProjectBase(cwd: string): string|
|`loadProjectConfig`|fn||94-104|function loadProjectConfig(cwd: string): UseReqConfig|
|`saveProjectConfig`|fn||106-110|function saveProjectConfig(cwd: string, config: UseReqCon...|
|`formatResultForEditor`|fn||112-117|function formatResultForEditor(result: ToolResult): string|
|`showToolResult`|fn||119-129|function showToolResult(ctx: ExtensionCommandContext, res...|
|`getPiUsereqStartupTools`|fn||131-135|function getPiUsereqStartupTools(pi: ExtensionAPI): ToolI...|
|`getConfiguredEnabledPiUsereqTools`|fn||137-141|function getConfiguredEnabledPiUsereqTools(config: UseReq...|
|`applyConfiguredPiUsereqTools`|fn||143-159|function applyConfiguredPiUsereqTools(pi: ExtensionAPI, c...|
|`setConfiguredPiUsereqTools`|fn||161-164|function setConfiguredPiUsereqTools(pi: ExtensionAPI, con...|
|`formatPiUsereqToolLabel`|fn||166-169|function formatPiUsereqToolLabel(tool: ToolInfo, enabled:...|
|`renderPiUsereqToolsReference`|fn||171-198|function renderPiUsereqToolsReference(pi: ExtensionAPI, c...|
|`runToolCommand`|fn||200-211|async function runToolCommand(name: string, rawArgs: stri...|
|`registerPromptCommands`|fn||213-226|function registerPromptCommands(pi: ExtensionAPI): void|
|`registerToolWrapperCommands`|fn||228-263|function registerToolWrapperCommands(pi: ExtensionAPI): void|
|`registerAgentTools`|fn||265-531|function registerAgentTools(pi: ExtensionAPI): void|
|`configurePiUsereqToolsMenu`|fn||533-597|async function configurePiUsereqToolsMenu(pi: ExtensionAP...|
|`formatStaticCheckEntry`|fn||599-605|function formatStaticCheckEntry(entry: StaticCheckEntry):...|
|`formatStaticCheckLanguagesSummary`|fn||607-613|function formatStaticCheckLanguagesSummary(config: UseReq...|
|`buildStaticCheckLanguageLabel`|fn||615-618|function buildStaticCheckLanguageLabel(language: string, ...|
|`renderStaticCheckReference`|fn||620-641|function renderStaticCheckReference(config: UseReqConfig)...|
|`configureStaticCheckMenu`|fn||643-750|async function configureStaticCheckMenu(ctx: ExtensionCom...|
|`configurePiUsereq`|fn||752-824|async function configurePiUsereq(pi: ExtensionAPI, ctx: E...|
|`ensureSaved`|fn||755-762|const ensureSaved = () => saveProjectConfig(ctx.cwd, config)|
|`refreshStatus`|fn||756-762|const refreshStatus = () =>|
|`registerConfigCommands`|fn||826-841|function registerConfigCommands(pi: ExtensionAPI): void|
|`piUsereqExtension`|fn||843-858|export default function piUsereqExtension(pi: ExtensionAP...|

