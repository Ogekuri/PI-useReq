---
title: "PI-useReq Requirements"
description: Software requirements specification
version: "0.0.25"
date: "2026-04-19"
author: "OpenAI Codex"
scope:
  paths:
    - "src/**/*.ts"
    - "scripts/**"
    - ".github/workflows/**"
    - "tests/**/*.ts"
    - "tests/fixtures_attended_results/**/*.json"
  excludes:
    - "node_modules/**"
    - "dist/**"
    - "build/**"
    - "target/**"
    - ".venv/**"
visibility: "draft"
tags: ["markdown", "requirements", "typescript", "cli", "pi-extension"]
---

# PI-useReq Requirements

## 1. Introduction

### 1.1 Document Rules
- This document MUST be written and maintained in English.
- Requirement statements MUST use RFC 2119 keywords exclusively and MUST NOT use "shall".
- Requirement bullets MUST use unique, stable IDs with prefixes limited to PRJ, CTN, DES, REQ, and TST.
- Requirement IDs MUST NOT be renumbered, reused, or repurposed outside the dedicated renumbering workflow.
- Each requirement MUST be atomic, single-sentence, and testable, with a target length of 35 words or fewer.
- This document MUST describe observed implementation state, including limitations and partial behavior.
- Future edits MUST update only `date` and `version` in the YAML front matter and MUST NOT add in-document revision history.

### 1.2 Project Scope
PI-useReq is a TypeScript pi extension plus companion Node CLI and standalone extension-debug surface for requirements-oriented prompt delivery, source summarization, static-check orchestration, git validation, worktree lifecycle helpers, and offline extension contract validation. Implemented UI is the pi selection/input/editor/status/notification surface. No standalone GUI code is present. `scripts/` contains the standalone harness, bash wrapper, and support modules. `.github/workflows/` is empty in this revision.

## 2. Project Requirements

### 2.1 Project Functions
- **PRJ-001**: MUST expose prompt commands that render bundled prompt templates with configuration-derived path substitutions and internal tool-reference adaptation.
- **PRJ-002**: MUST expose CLI and agent-tool interfaces for token counting, references generation, compression, construct search, and static-check execution on explicit files or configured project sources.
- **PRJ-003**: MUST provide an interactive pi configuration surface for docs path, tests path, source directories, static-check entries, and active-tool enablement for custom and supported embedded pi CLI tools.
- **PRJ-004**: MUST provide git repository validation plus standardized worktree naming, creation, and deletion utilities using configured project and git paths.
- **PRJ-005**: MUST install bundled prompts, documentation templates, and guidelines under the extension installation path and expose them through shared runtime path context.
- **PRJ-006**: MUST expose a standalone debug surface that inventories extension commands and tools, replays handlers offline, captures registration and UI metadata, provides a bash wrapper, and optionally compares the contract against the official pi SDK runtime.
- **PRJ-007**: MUST intercept pi CLI lifecycle hooks to maintain extension-owned context telemetry and status-bar session timing.

### 2.2 Project Constraints
- **CTN-001**: MUST persist project configuration at `<base-path>/.pi-usereq/config.json` with default `docs-dir=pi-usereq/docs`, `tests-dir=tests`, and `src-dir=["src"]`.
- **CTN-002**: MUST collect project-wide source files through `git ls-files --cached --others --exclude-standard`; non-git project scans therefore fail instead of falling back to directory walking.
- **CTN-003**: MUST limit project-wide source discovery to extensions listed in `STATIC_CHECK_EXT_TO_LANG`; analyzer-only aliases such as `.cc`, `.cxx`, `.hpp`, and `.exs` remain undiscoverable.
- **CTN-004**: MUST exclude `tests/fixtures` and `<tests-dir>/fixtures` from project-wide static-check execution.
- **CTN-005**: MUST declare an ECMAScript module package and TypeScript `NodeNext` module semantics for runtime and import resolution.
- **CTN-006**: MUST type-check in strict `noEmit` mode and include both `src/**/*.ts` and `tests/**/*.ts` in the TypeScript program.
- **CTN-007**: MUST declare `./src/index.ts` as the only pi extension entry in package metadata.
- **CTN-008**: MUST expose package scripts for test, watch-mode test, and CLI execution through `node --import tsx`.
- **CTN-009**: MUST implement extension debugging outside `src/index.ts` business logic and drive extension behavior only through the default extension export, registered commands, registered tools, and registered events.
- **CTN-010**: MUST execute offline harness flows without requiring pi.dev services or `docs/pi.dev/agent-document-manifest.json`.
- **CTN-011**: MUST store bundled prompt, template, and guideline resources under `src/resources/{prompts,templates,guidelines}` and install them under `<installation-path>/resources/{prompts,templates,guidelines}`.

## 3. Requirements

### 3.1 Design and Implementation
- **DES-001**: MUST implement the standalone executable in `src/cli.ts` as flag parsing plus dispatch to `tool-runner.ts` or `runStaticCheck`.
- **DES-002**: MUST implement extension activation in `src/index.ts` by registering prompt commands, agent tools, configuration commands, and shared wrappers for supported pi CLI lifecycle hooks.
- **DES-003**: MUST represent parsed source constructs as `SourceElement` instances produced by `SourceAnalyzer` and enriched with signatures, hierarchy, visibility, inheritance, body annotations, and Doxygen fields.
- **DES-004**: MUST implement static-check execution through `StaticCheckBase`, `StaticCheckPylance`, `StaticCheckRuff`, and `StaticCheckCommand`, selected by `dispatchStaticCheckForFile`.
- **DES-005**: MUST centralize project file collection, token/reference/compress/find operations, git checks, docs checks, and worktree helpers in `src/core/tool-runner.ts`.
- **DES-006**: MUST keep CLI compression and construct-search renderers as markdown blocks headed by `@@@ <path> | <language>`, while agent-tool compression and construct-search responses use dedicated JSON payload builders.
- **DES-007**: MUST implement the standalone debug surface in `scripts/debug-extension.ts`, `scripts/pi-usereq-debug.sh`, and `scripts/lib/` recording and SDK-probe modules without altering extension runtime control flow.
- **DES-008**: MUST format `files-references`, `references`, `files-compress`, and `compress` agent-tool outputs as deterministic agent-oriented JSON with dedicated metadata fields for source structure, symbols, and Doxygen tags.
- **DES-009**: MUST treat `docs/pi.dev/agent-document-manifest.json` as the authoritative API contract for new or modified software that interfaces with the pi.dev CLI.
- **DES-010**: MUST centralize event-driven context snapshots, run-timing state, and status-bar rendering through shared extension-status helpers.

### 3.2 Functions
- **REQ-001**: MUST access bundled prompts, templates, and guidelines from `<installation-path>/resources` without requiring user-home resource copies before prompt or tool execution.
- **REQ-002**: MUST replace `%%DOC_PATH%%`, `%%GUIDELINES_*%%`, `%%TEMPLATE_PATH%%`, `%%SRC_PATHS%%`, `%%TEST_PATH%%`, `%%PROJECT_BASE%%`, `%%EXECUTION_PATH%%`, `%%INSTALLATION_PATH%%`, `%%CONFIG_PATH%%`, and `%%ARGS%%` tokens when rendering prompts.
- **REQ-003**: MUST rewrite legacy `req --...` prompt text references to internal tool names such as `find tool` and `git-check tool`.
- **REQ-004**: MUST register `req-<prompt>` commands for every bundled prompt name and send rendered prompt content as a user message.
- **REQ-005**: MUST expose `git-path`, `get-base-path`, `files-tokens`, `files-references`, `files-compress`, and `files-find` only through agent-tool registration.
- **REQ-044**: MUST expose `references`, `compress`, `find`, `tokens`, `files-static-check`, and `static-check` only through agent-tool registration.
- **REQ-045**: MUST expose `git-check`, `docs-check`, `git-wt-name`, `git-wt-create`, and `git-wt-delete` only through agent-tool registration.
- **REQ-046**: MUST implement a recording extension API supporting `registerCommand`, `registerTool`, `on`, `getAllTools`, `getActiveTools`, `setActiveTools`, and `sendUserMessage`, and preserve stable registration order in serialized snapshots.
- **REQ-047**: MUST implement a recording command context UI supporting `select`, `input`, `notify`, `setStatus`, and `setEditorText`, and serialize queued inputs plus emitted UI side effects.
- **REQ-048**: MUST load the target extension via its default export, invoke it as a black box, and execute offline replays only through registered `session_start`, command, and tool handlers.
- **REQ-049**: MUST set both `ctx.cwd` and `process.cwd()` from the requested debug cwd during offline replay and report both effective values in the result payload.
- **REQ-050**: MUST expose harness subcommands `inspect`, `session-start`, `command`, `tool`, and `sdk-smoke`.
- **REQ-051**: MUST support `json` and `pretty` output modes for every harness subcommand and default to the human-readable mode when none is specified.
- **REQ-052**: MUST make `inspect` emit commands, tools, event-handler names, active tools, sent user messages, and a manual containing concrete usage examples for every registered `req-*` command and agent tool.
- **REQ-053**: MUST make `session-start` invoke all registered `session_start` handlers and capture final active tools, statuses, notifications, editor text, and sent user messages.
- **REQ-054**: MUST make `command` invoke the named registered command handler with supplied args and capture sent user messages plus UI side effects in the result payload.
- **REQ-055**: MUST make `tool` invoke the named registered tool `execute` handler with supplied params and capture returned `content`, returned `details`, and UI side effects.
- **REQ-056**: MUST make `sdk-smoke` use `DefaultResourceLoader` and `createAgentSession(...)` to load an explicit extension path and inventory extension-owned commands and tools from the official runtime.
- **REQ-057**: MUST compare offline and SDK inventories for command names, command descriptions, tool names, tool descriptions, parameter-schema presence, normalized provenance/sourceInfo, and active tools after `session_start`.
- **REQ-058**: MUST exit with non-zero status when a requested harness command or tool is not registered or when SDK parity loading fails.
- **REQ-059**: MUST expose package scripts `debug:ext`, `debug:ext:inspect`, `debug:ext:session`, `debug:ext:command`, `debug:ext:tool`, and `debug:ext:sdk`.
- **REQ-060**: MUST provide `scripts/pi-usereq-debug.sh` as a bash wrapper for `scripts/debug-extension.ts`.
- **REQ-061**: MUST make `scripts/pi-usereq-debug.sh` expose `inspect`, `session`, `command`, `prompt`, `tool`, `sdk`, `raw`, and `help` subcommands.
- **REQ-062**: MUST make `scripts/pi-usereq-debug.sh` default to `src/index.ts` plus caller cwd, permit later `--cwd` and `--extension` overrides, auto-prefix bare prompt names with `req-`, and map `session`/`sdk` to `session-start`/`sdk-smoke`.
- **REQ-065**: MUST make `scripts/pi-usereq-debug.sh tool` accept `--args <text>` by forwarding a JSON object through `--params`, while preserving direct `--params <json>` passthrough.
- **REQ-006**: MUST provide a `pi-usereq` menu that edits `docs-dir`, `tests-dir`, and `src-dir`, manages static-check and startup-tool submenus, resets defaults, and saves configuration on exit.
- **REQ-007**: MUST provide a startup-tools submenu with overview, status display, per-tool toggle, enable-all, disable-all, and reset-defaults actions for configurable custom and embedded pi CLI active tools.
- **REQ-063**: MUST derive configurable embedded pi CLI tools from runtime builtin tools named `read`, `bash`, `edit`, `write`, `grep`, and `ls`.
- **REQ-064**: MUST default all custom tools except `find` and embedded `read`, `bash`, `edit`, and `write` to enabled, and custom `find` plus embedded `grep` and `ls` to disabled.
- **REQ-066**: MUST omit `reset-context` and `context-reset` fields from persisted project configuration.
- **REQ-067**: MUST send every rendered `req-<prompt>` payload into the current active session.
- **REQ-068**: MUST use one prompt-delivery path that never creates replacement sessions or pre-reset flows.
- **REQ-008**: MUST provide a static-check submenu that adds entries by guided language/module selection or raw spec, removes language entries, and shows supported languages and modules.
- **REQ-009**: MUST refresh shared runtime path context, apply configured startup tools, and publish single-line `pi-usereq` status text during `session_start`.
- **REQ-109**: MUST make the single-line status bar render `docs`, `tests`, and `src` fields with explicit configured path values, keeping every field name separate from its value.
- **REQ-110**: MUST make the single-line status bar render `tools` as the count of active tools.
- **REQ-111**: MUST omit prompt-delivery mode fields from the single-line status bar.
- **REQ-112**: MUST render status-bar field names in violet and field values in yellow.
- **REQ-113**: MUST register shared event wrappers for `resources_discover`, `session_start`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, and `session_shutdown`.
- **REQ-114**: MUST register shared event wrappers for `session_before_tree`, `session_tree`, `context`, `before_provider_request`, `before_agent_start`, `agent_start`, and `agent_end`.
- **REQ-115**: MUST register shared event wrappers for `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, and `tool_execution_update`.
- **REQ-116**: MUST register shared event wrappers for `tool_execution_end`, `model_select`, `tool_call`, `tool_result`, `user_bash`, and `input`.
- **REQ-117**: MUST route every intercepted hook through `updateExtensionStatus` with the originating hook name and event payload, even when no hook-specific side effect exists.
- **REQ-118**: MUST obtain latest context-usage facts from `ctx.getContextUsage()` or an equivalent runtime API and store them in extension session state.
- **REQ-119**: MUST refresh stored context-usage facts during `session_start` and after intercepted events before rebuilding the status bar when newer data is available.
- **REQ-120**: MUST render single-line status fields in this order: `docs`, `tests`, `src`, `tools`, `context`, `elapsed`, `last`.
- **REQ-121**: MUST render `context` immediately after `tools` with separator ` • ` and a 5-cell bar using `▓` for filled cells.
- **REQ-122**: MUST compute filled `context` cells by ceiling `usagePercent * 5 / 100`, except 0 percent MUST produce 0 filled cells.
- **REQ-123**: MUST render `elapsed` immediately after `context`, showing `idle` when no prompt is running and `M:SS` for the active prompt duration.
- **REQ-124**: MUST render `last` immediately after `elapsed`, showing `N/A` before any normally completed prompt run and otherwise the final `elapsed` value of the latest normally completed run.
- **REQ-125**: MUST keep `elapsed` and `last` minutes unbounded above 59, zero-pad seconds to two digits, and preserve `last` when escape-triggered cancellation ends the active run.
- **REQ-126**: MUST render `context` bar cells as yellow `▓` characters on a violet background consistent with the field-label color.
- **REQ-127**: MUST overlay the literal `claer` in yellow on the `context` bar while preserving the empty bar background when normalized context usage is unavailable or equals 0 percent.
- **REQ-128**: MUST overlay the literal `full!` in bright red on the `context` bar while preserving the filled yellow bar background when normalized context usage exceeds 90 percent.
- **REQ-010**: MUST count tokens with `js-tiktoken` `cl100k_base`, count characters and lines, and make `files-tokens` emit agent-oriented JSON containing structured per-file metrics, extracted facts, and aggregate metrics.
- **REQ-011**: MUST generate explicit-file references by analyzing supported source files and emitting agent-oriented JSON with per-file metadata, imports, symbol records, and optional residual text.
- **REQ-012**: MUST compress supported source files by removing comments and blank lines, preserving indentation for Python, Haskell, and Elixir, and optionally preserving original line numbers.
- **REQ-013**: MUST search explicit files by tag filter and name regex, then emit matching constructs with signature, line range, Doxygen fields, and comment-stripped code excerpts.
- **REQ-014**: MUST make `references` scan configured `src-dir` files and emit agent-oriented JSON containing repository structure plus the structured per-file reference records used by `files-references`.
- **REQ-015**: MUST make CLI project-scope compression scan configured `src-dir` files and emit one compressed markdown block per supported file.
- **REQ-016**: MUST make `find` scan configured `src-dir` files using the requested tag filter and regular expression.
- **REQ-017**: MUST make `tokens` count only existing canonical docs `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md`, reuse the structured `files-tokens` JSON contract, and fail when none exist.
- **REQ-069**: MUST order `files-tokens` and `tokens` JSON sections as `request`, `summary`, `files`, and `guidance`, and order fields inside each section from canonical identifiers to source facts, metrics, and derived guidance.
- **REQ-070**: MUST emit counts, sizes, line counts, line ranges, and derived totals as JSON numbers with explicit unit-specific field names, keeping display strings optional and never as the sole carrier of numeric facts.
- **REQ-071**: MUST normalize `files-tokens` and `tokens` text fields by removing decorative formatting, isolating canonical paths, separating source-derived facts from guidance, and stripping non-semantic presentation artifacts.
- **REQ-072**: MUST register `files-tokens` and `tokens` with agent-oriented descriptions covering purpose, inputs, output schema, output format, specialized behaviors, configuration options, invocation modes, and failure conditions.
- **REQ-073**: MUST expose file-derived facts needed for direct access, including canonical path, language, existence, line counts, line ranges, and Doxygen-derived metadata, as dedicated JSON fields when available.
- **REQ-074**: MUST keep monolithic text summaries optional, place them after structured fields, and omit any fact from text-only representation when the same fact can be emitted as dedicated JSON.
- **REQ-075**: MUST make `files-tokens` and `tokens` guidance fields explicitly distinguish source observations, derived recommendations, and actionable next-step hints.
- **REQ-076**: MUST order `files-references` and `references` JSON sections from request metadata to repository summary, file records, and optional residual text.
- **REQ-077**: MUST expose symbol kind, path, declaration lines, counts, and line ranges as dedicated numeric or array fields, never only inside free-form strings.
- **REQ-078**: MUST expose parsed Doxygen fields as tag-specific JSON objects or arrays, keeping monolithic `text` only for unsplittable residual content.
- **REQ-079**: MUST normalize `files-references` and `references` text fields by removing decorative markdown artifacts and preserving only parser-relevant residual content.
- **REQ-080**: MUST register `files-references` and `references` with agent-oriented descriptions covering purpose, inputs, configuration, output schema, specialized behaviors, and failure conditions.
- **REQ-081**: MUST make agent-tool `files-compress` and `compress` return structured JSON sections ordered as `request`, `summary`, `repository`, `files`, and `execution`.
- **REQ-082**: MUST expose canonical paths, absolute paths, language IDs, source line counts, source line ranges, compressed line counts, and removed line counts as dedicated typed compression fields.
- **REQ-083**: MUST expose compressed excerpts through structured `compressed_lines` arrays and a separate `compressed_source_text` field, never only inside markdown headers, fences, or prefixed display strings.
- **REQ-084**: MUST expose file-level and symbol-level Doxygen fields as structured tag-specific JSON objects, and emit symbol records with declaration kind, canonical path, signatures, and numeric declaration line ranges.
- **REQ-085**: MUST keep residual monolithic text optional, place it after structured fields, and omit decorative markdown artifacts from compression JSON field values.
- **REQ-086**: MUST register `files-compress` and `compress` with agent-oriented descriptions covering scope, parameters, line-number behavior, output schema, project-scope selection rules, output format, and failure conditions.
- **REQ-087**: MUST expose skipped inputs, unsupported extensions, compression failures, and zero-processable requests as structured statuses and stable error reasons, while keeping stderr diagnostics optional.
- **REQ-088**: MUST mirror the structured compression payload into tool `content[0].text` and tool `details`, with execution metadata nested under the mirrored JSON object.
- **REQ-089**: MUST make agent-tool `files-find` and `find` return structured JSON sections ordered as `request`, `summary`, `repository`, `files`, and `execution`.
- **REQ-090**: MUST expose find request scope facts as dedicated fields, including tag filter, regex pattern, line-number mode, requested paths, configured source directories, and supported tags by language.
- **REQ-091**: MUST expose per-file and per-match find facts as dedicated fields, including canonical path, language, construct kind, symbol name, signature, declaration order, numeric line ranges, and stripped code lines.
- **REQ-092**: MUST expose parsed find Doxygen fields as tag-specific JSON objects or arrays for file-level and construct-level metadata, keeping monolithic residual text only when safe splitting is impossible.
- **REQ-093**: MUST emit find counts, file totals, match totals, line numbers, and line ranges as JSON numbers with explicit unit-specific field names, never only inside display strings.
- **REQ-094**: MUST normalize `files-find` and `find` text fields by removing markdown headers, fences, bullets, and other presentation-only artifacts from structured JSON values.
- **REQ-095**: MUST register `files-find` and `find` with agent-oriented descriptions covering purpose, scope, input schema, output schema, `enableLineNumbers`, regex semantics, supported tags by language, and failure conditions.
- **REQ-096**: MUST expose structured statuses for skipped files, unsupported languages, invalid tag filters, invalid regex patterns, no-match outcomes, and analysis failures, while keeping stderr diagnostics optional.
- **REQ-097**: MUST mirror the structured find payload into tool `content[0].text` and tool `details`, with execution metadata nested under the mirrored JSON object.
- **REQ-098**: MUST keep monolithic find `text` fields optional, place them after structured fields, and omit any fact from text-only representation when a dedicated JSON field can carry it.
- **REQ-099**: MUST make every agent-tool response expose a JSON-first tree whose specialized fields are directly accessible, while monolithic text remains optional and subordinate to the structured payload.
- **REQ-100**: MUST encode quantitative facts as JSON numbers in unit-specific fields, keep textual fields free of decorative formatting and textual units, and avoid duplicating facts already exposed by specialized fields.
- **REQ-101**: MUST register every agent tool with machine-oriented metadata describing purpose, required and optional parameters, configuration and invocation variants, output schema and format, specialized behaviors, and stable error conditions.
- **REQ-102**: MUST make every structured agent-tool execute result mirror the same JSON object into `content[0].text` and `details`, nesting execution metadata under dedicated `execution` fields.
- **REQ-018**: MUST expose the `test-static-check` driver only through standalone CLI `--test-static-check`, dispatching `dummy`, `pylance`, `ruff`, or `command` checker subcommands directly.
- **REQ-019**: MUST resolve each explicit static-check file by extension and run every configured checker for that language while capturing only failing checker output.
- **REQ-020**: MUST parse static-check enable specs in `LANG=MODULE[,CMD[,PARAM...]]` format and normalize supported language and module names case-insensitively.
- **REQ-021**: MUST reject static-check enable specs with missing `=`, missing module, unknown language, unknown module, or `Command` entries without `cmd`.
- **REQ-022**: MUST resolve Python checker executables in this preference order: `<project>/.venv/bin/python`, `PI_USEREQ_PYTHON`, `python3`, `python`.
- **REQ-023**: MUST require `Command`-module executables to exist on `PATH` before static-check execution.
- **REQ-024**: MUST make `git-check` fail unless configured `git-path` exists, resolves inside a work tree, has no porcelain changes, and has a valid `HEAD`.
- **REQ-025**: MUST make `docs-check` fail when `REQUIREMENTS.md`, `WORKFLOW.md`, or `REFERENCES.md` is missing and name the prompt command that should generate the missing file.
- **REQ-026**: MUST make `git-wt-name` emit `useReq-<project>-<sanitized-branch>-<YYYYMMDDHHMMSS>`.
- **REQ-027**: MUST make `git-wt-create` reject invalid names, create `../<wtName>` from the configured git root, and copy `.pi-usereq` into the matching worktree base when present.
- **REQ-028**: MUST make `git-wt-delete` remove the exact named worktree and/or branch when either exists and fail when neither exists.
- **REQ-029**: MUST make `get-base-path` print `base-path`, where `base-path` equals the current `execution-path`.
- **REQ-030**: MUST make extension project-config loading set `execution-path` to current cwd and set `config-path` to `<base-path>/.pi-usereq/config.json`.
- **REQ-103**: MUST resolve `installation-path` from the executing extension entry module and expose it with runtime path context to prompts, tools, and `session_start` handlers.
- **REQ-104**: MUST keep `docs-dir`, `tests-dir`, and every `src-dir` entry relative to `base-path` and resolve them against `base-path` during execution.
- **REQ-105**: MUST make `git-path` print the derived repository root only when it equals `base-path` or is an ancestor of `base-path`.
- **REQ-106**: MUST make prompt `%%GUIDELINES_FILES%%`, `%%GUIDELINES_PATH%%`, and `%%TEMPLATE_PATH%%` resolve under `<installation-path>/resources`.
- **REQ-107**: MUST express prompt-visible `installation-path`, `execution-path`, `base-path`, `config-path`, template paths, and guideline paths relative to user home using platform-native home environment variables.
- **REQ-031**: MUST make `pi-usereq-show-config` write the current project configuration JSON to the editor.
- **REQ-032**: MUST inject a pi.dev conformance block into rendered prompts when `docs/pi.dev/agent-document-manifest.json` exists under the project base.
- **REQ-033**: MUST make that conformance block require manifest-guided document review before implementing or changing extension code that interfaces with pi CLI.
- **REQ-034**: MUST make that conformance block require manifest-guided document review before validating, analyzing, or fixing extension code that interfaces with pi CLI.
- **REQ-108**: MUST make that conformance block require API-level compliance with `docs/pi.dev/agent-document-manifest.json` for new or modified software that interfaces with the pi.dev CLI.
- **REQ-035**: MUST parse repeatable `--enable-static-check LANG=MODULE[,CMD[,PARAM...]]` CLI options before command dispatch and merge resulting entries into persisted project configuration for the current project base.
- **REQ-036**: MUST preserve existing `static-check` entries, append non-duplicate `--enable-static-check` entries in argument order, and treat canonical language, module, cmd, and params as the duplicate identity.
- **REQ-037**: MUST reject `--enable-static-check` `Command` entries whose executable is unavailable on `PATH` and MUST NOT modify persisted project configuration when validation fails.
- **REQ-038**: MUST honor `--verbose` only for `files-references`, `files-compress`, `files-find`, `references`, `compress`, and `find`, emitting command progress to stderr while leaving stdout payload format unchanged.
- **REQ-039**: MUST support `--enable-line-numbers` only for `files-compress`, `compress`, `files-find`, and `find`, and MUST leave corresponding outputs unnumbered when the flag is absent.
- **REQ-040**: MUST store canonical expected CLI result fixtures as UTF-8 text files under `tests/fixtures_attended_results/`, preserving normalized exit code, stdout, and stderr for each archived scenario.
- **REQ-041**: MUST canonicalize environment-dependent path and timestamp segments in archived and observed CLI results with stable placeholder tokens before exact comparison.
- **REQ-042**: MUST archive explicit-file scenarios for `files-tokens`, `files-references`, `files-compress`, `files-find`, and `test-static-check` across every file under `tests/fixtures/`.
- **REQ-043**: MUST archive repository scenarios for `references`, `compress`, `find`, `tokens`, `enable-static-check`, `files-static-check`, `static-check`, `git-check`, `git-wt-*`, `git-path`, and `get-base-path`.

## 4. Test Requirements
- **TST-001**: MUST verify extension activation registers every documented prompt command, agent tool, and configuration command while omitting custom slash commands for tool names and `test-static-check`.
- **TST-002**: MUST verify installed bundled prompt, template, and guideline resources remain readable from `installation-path` and prompt rendering replaces all dynamic placeholders with runtime path context.
- **TST-003**: MUST verify standalone CLI outputs for `files-tokens`, `files-compress`, `files-find`, and `--test-static-check` match the Python oracle for every fixture file.
- **TST-004**: MUST verify project-scan CLI outputs for `compress`, `find`, `tokens`, `files-static-check`, `static-check`, `git-check`, `docs-check`, `git-path`, and `get-base-path` match the Python oracle.
- **TST-005**: MUST verify the configuration menu persists `docs-dir`, disables startup tools, adds static-check entries, and omits prompt-delivery mode controls.
- **TST-006**: MUST verify `session_start` activates configured startup tools and updates the single-line `pi-usereq` status bar.
- **TST-031**: MUST verify the status bar renders explicit docs/tests/src paths, active-tool count, and violet/yellow field-value color separation.
- **TST-032**: MUST verify extension registration installs wrappers for all documented lifecycle hooks and routes replayed hook payloads through `updateExtensionStatus`.
- **TST-033**: MUST verify the status bar renders ordered `tools`, `context`, `elapsed`, and `last` fields plus the ceiling-based 5-cell context bar.
- **TST-034**: MUST verify `ctx.getContextUsage()` snapshots refresh status updates and prompt timing preserves `last` across normal completion but not escape-triggered cancellation.
- **TST-035**: MUST verify unavailable or 0-percent context usage renders the literal `claer` in yellow on the preserved empty context-bar background.
- **TST-036**: MUST verify context usage above 90 percent renders the literal `full!` in bright red on the preserved filled context-bar background.
- **TST-007**: MUST verify `git-path` output ignores stale stored values and resolves only a current repository root that is identical to or an ancestor of `base-path`.
- **TST-008**: MUST verify `git-wt-create` and `git-wt-delete` create, configure, copy `.pi-usereq`, and remove the named worktree as observable filesystem side effects.
- **TST-009**: MUST verify `package.json` declares ESM packaging, the single pi extension entry, and the standard `test`, `test:watch`, and `cli` scripts.
- **TST-010**: MUST verify `tsconfig.json` declares `NodeNext`, `strict`, `noEmit`, and includes both `src/**/*.ts` and `tests/**/*.ts`.
- **TST-011**: MUST verify pi.dev-aware prompt rendering injects manifest-driven conformance rules only when the pi.dev manifest exists under the project base.
- **TST-030**: MUST verify pi.dev-aware prompt rendering injects an explicit API-compliance mandate tied to `docs/pi.dev/agent-document-manifest.json` when the manifest exists.
- **TST-012**: MUST verify TypeScript CLI parity for standalone command-option regressions covering `--files-tokens`, `--files-references`, `--files-compress`, `--files-find`, `--test-static-check`, `--enable-line-numbers`, `--enable-static-check`, and `--verbose`.
- **TST-013**: MUST verify TypeScript CLI parity for project-scoped command-option regressions covering `--references`, `--compress`, `--find`, `--tokens`, `--files-static-check`, `--static-check`, `--git-check`, `--git-wt-*`, `--git-path`, and `--get-base-path`.
- **TST-014**: MUST maintain an executable mapping from each imported command-option regression case to one TypeScript test case identifier and fail verification when any mapped case is missing.
- **TST-015**: MUST verify archive-backed standalone CLI scenarios load expected results from `tests/fixtures_attended_results/standalone` and compare exact normalized exit code, stdout, and stderr for every file under `tests/fixtures/`.
- **TST-016**: MUST verify archive-backed repository CLI scenarios load expected results from `tests/fixtures_attended_results/project` and compare exact normalized exit code, stdout, and stderr for the archived command set.
- **TST-017**: MUST verify every archive-backed scenario required by `REQ-042` and `REQ-043` has a committed expected-result fixture file before executing TypeScript output comparisons.
- **TST-018**: MUST verify offline harness inspection and session-start replay capture registered commands, registered tools, event handlers, active tools, statuses, notifications, editor text, and sent user messages.
- **TST-019**: MUST verify offline harness command and tool replay invoke registered handlers, preserve requested cwd semantics, and capture prompt payloads, tool results, and UI side effects.
- **TST-020**: MUST verify SDK parity comparison reports aligned inventories as clean, reports requested mismatch categories, and `package.json` declares the `debug:ext*` harness scripts.
- **TST-021**: MUST verify `scripts/pi-usereq-debug.sh tool` forwards `--params` unchanged and converts `--args` text into the JSON object forwarded through `--params`.
- **TST-022**: MUST verify `files-references` and `references` JSON outputs expose repository, file, symbol, location, and Doxygen facts through dedicated structured fields.
- **TST-023**: MUST verify harness inspection surfaces agent-oriented `files-references` and `references` tool descriptions with output schema, configuration, specialized behaviors, and failure details.
- **TST-024**: MUST verify `files-find` and `find` JSON outputs expose request, repository, file, match, location, and Doxygen facts through dedicated structured fields.
- **TST-025**: MUST verify harness inspection surfaces agent-oriented `files-find` and `find` tool descriptions with input schema, output schema, line-number behavior, regex semantics, supported tags by language, and failure details.
- **TST-026**: MUST verify `files-compress` and `compress` JSON outputs expose structured request, repository, line, symbol, status, and Doxygen facts through dedicated fields.
- **TST-027**: MUST verify harness inspection surfaces agent-oriented `files-compress` and `compress` tool descriptions with parameters, line-number behavior, output schema, specialization triggers, and failure conditions.
- **TST-028**: MUST verify path, static-check, git, docs, and worktree agent-tool outputs expose structured JSON request, result, status, execution, and derived runtime path facts through dedicated fields.
- **TST-029**: MUST verify harness inspection surfaces machine-oriented descriptions for path, static-check, git, docs, and worktree tools, including parameters, output schema, specialization triggers, and failure conditions.

## 5. Observed Component Model

### 5.1 Runtime Surfaces
- `src/cli.ts` parses CLI flags, repairs config for project-scoped commands, and dispatches to `tool-runner.ts` or `runStaticCheck`.
- `src/index.ts` activates the pi extension, registers commands and agent tools, and manages interactive menu/status behavior through `ctx.ui`.
- `src/core/tool-runner.ts` orchestrates project file collection, markdown generation, compression, construct search, docs checks, git checks, and worktree lifecycle actions.
- `src/core/source-analyzer.ts` defines `SourceElement`, language specs, extraction heuristics, Doxygen attachment, and Markdown rendering support.
- `src/core/generate-markdown.ts`, `src/core/compress.ts`, and `src/core/find-constructs.ts` share analyzer and compressor logic to produce reusable Markdown outputs.
- `src/core/static-check.ts` maps languages/extensions, parses enable specs, resolves inputs, and dispatches checker classes.
- `src/core/config.ts`, `src/core/resources.ts`, and `src/core/prompts.ts` provide config persistence, home-resource synchronization, and prompt rendering.
- `src/core/doxygen-parser.ts` normalizes Doxygen tags reused by source references and construct search output.
- `scripts/debug-extension.ts`, `scripts/pi-usereq-debug.sh`, and `scripts/lib/*.ts` provide the standalone extension debug harness, bash wrapper, recording adapters, offline replay, SDK parity probing, and usage-manual rendering.

### 5.2 Libraries and Runtime Dependencies
- `@mariozechner/pi-coding-agent` provides extension APIs, command registration, tool registration, and UI integration evidence in `src/index.ts` and `package.json`.
- `@mariozechner/pi-ai` is a manifest-declared peer dependency evidenced by `package.json` and `package-lock.json`.
- `@mariozechner/pi-tui` is a manifest-declared peer dependency evidenced by `package.json` and `package-lock.json`.
- `@sinclair/typebox` provides runtime tool parameter schemas and is declared as a peer dependency evidenced by `src/index.ts`, `package.json`, and `package-lock.json`.
- `js-tiktoken` provides token counting evidence in `src/core/token-counter.ts`, `package.json`, and `package-lock.json`.
- `fast-glob` provides wildcard expansion for static-check inputs evidence in `src/core/static-check.ts`, `package.json`, and `package-lock.json`.
- `tsx` is the manifest-declared TypeScript execution runner for tests and CLI scripts evidenced by `package.json` and `package-lock.json`.
- `typescript` is the manifest-declared compiler and type-checker evidenced by `package.json`, `package-lock.json`, and `tsconfig.json`.
- `git` CLI is a runtime dependency for repository checks, file discovery, and worktree lifecycle evidence in `src/core/tool-runner.ts`.
- `bash` is a runtime dependency for `git-check` cleanliness validation evidence in `src/core/tool-runner.ts`.

### 5.3 Packaging and Tooling Surface
- `package.json` declares `type: "module"`, `pi.extensions: ["./src/index.ts"]`, and the scripts `test`, `test:watch`, `cli`, `debug:ext`, `debug:ext:inspect`, `debug:ext:session`, `debug:ext:command`, `debug:ext:tool`, and `debug:ext:sdk`.
- `tsconfig.json` declares `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noEmit: true`, `skipLibCheck: true`, `resolveJsonModule: true`, and `types: ["node"]`.
- `package.json` declares version `0.0.0` while `package-lock.json` resolves the top-level package as version `0.1.0`; this manifest metadata is inconsistent in the current revision.

## 6. Repository Structure

### 6.1 Tree View
```text
.
├── README.md
├── LICENSE
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── cli.ts
│   ├── index.ts
│   ├── core/
│   │   ├── compress-files.ts
│   │   ├── compress.ts
│   │   ├── config.ts
│   │   ├── doxygen-parser.ts
│   │   ├── errors.ts
│   │   ├── find-constructs.ts
│   │   ├── generate-markdown.ts
│   │   ├── pi-usereq-tools.ts
│   │   ├── prompts.ts
│   │   ├── resources.ts
│   │   ├── source-analyzer.ts
│   │   ├── static-check.ts
│   │   ├── token-counter.ts
│   │   ├── tool-runner.ts
│   │   └── utils.ts
│   └── resources/
│       ├── templates/{Requirements_Template.md,HDT_Test_Authoring_Guide.md,Document_Source_Code_in_Doxygen_Style.md}
│       ├── guidelines/{Google_Python_Style_Guide.md,Google_C++_Style_Guide.md}
│       └── prompts/{analyze.md,change.md,check.md,cover.md,create.md,fix.md,flowchart.md,implement.md,new.md,readme.md,recreate.md,refactor.md,references.md,renumber.md,workflow.md,write.md}
├── tests/
│   ├── extension-registration.test.ts
│   ├── helpers.ts
│   ├── oracle-project.test.ts
│   ├── oracle-standalone.test.ts
│   ├── prompt-rendering.test.ts
│   └── fixtures/{fixture_c.c,fixture_cpp.cpp,fixture_csharp.cs,fixture_elixir.ex,fixture_go.go,fixture_haskell.hs,fixture_java.java,fixture_javascript.js,fixture_kotlin.kt,fixture_lua.lua,fixture_perl.pl,fixture_php.php,fixture_python.py,fixture_rust.rs,fixture_scala.scala,fixture_shell.sh,fixture_swift.swift,fixture_typescript.ts,fixture_zig.zig}
├── req/docs/
├── scripts/
│   ├── debug-extension.ts
│   ├── pi-usereq-debug.sh
│   └── lib/{extension-debug-harness.ts,recording-extension-api.ts,sdk-smoke.ts}
├── .github/
│   ├── workflows/
│   └── skills/{req-analyze,req-change,req-check,req-cover,req-create,req-fix,req-flowchart,req-implement,req-new,req-readme,req-recreate,req-references,req-refactor,req-renumber,req-workflow,req-write}/SKILL.md
├── .pi/prompts/{req-analyze.prompt.md,req-change.prompt.md,req-check.prompt.md,req-cover.prompt.md,req-create.prompt.md,req-fix.prompt.md,req-flowchart.prompt.md,req-implement.prompt.md,req-new.prompt.md,req-readme.prompt.md,req-recreate.prompt.md,req-references.prompt.md,req-refactor.prompt.md,req-renumber.prompt.md,req-workflow.prompt.md,req-write.prompt.md}
├── .req/docs/{Requirements_Template.md,HDT_Test_Authoring_Guide.md,Document_Source_Code_in_Doxygen_Style.md}
├── .claude/commands/req/*.md
├── .codex/skills/req-*/SKILL.md
├── .gemini/commands/req/*.toml
├── .kiro/agents/*.json
├── .opencode/command/*.md
└── .vscode/settings.json
```

## 7. Test Evidence Summary

### 7.1 Covered Behaviors
- `tests/extension-registration.test.ts` covers extension registration, config-menu persistence, startup-tool enablement, runtime `git-path` derivation, and static-check menu mutation flows.
- `tests/prompt-rendering.test.ts` covers home-resource synchronization and placeholder replacement in rendered prompts.
- `tests/oracle-standalone.test.ts` compares standalone `files-*` and `--test-static-check` outputs against the Python `usereq.cli` oracle across all fixture languages.
- `tests/oracle-project.test.ts` compares project-scoped commands against the Python oracle on a temporary git repository and separately verifies worktree create/delete side effects.
- Test business logic focuses on parity with the Python oracle, persistent config mutation, startup-tool activation, and worktree lifecycle correctness.

## 8. Evidence Matrix

### 8.1 PRJ and CTN Evidence
| ID | Evidence |
| --- | --- |
| PRJ-001 | `src/index.ts` :: `registerPromptCommands` :: `pi.registerCommand(\`req-${promptName}\`, ...)`; `src/core/prompts.ts` :: `renderPrompt` :: `return adaptPromptForInternalTools(applyReplacements(prompt, replacements));` |
| PRJ-002 | `src/index.ts` :: `TOOL_RUNNERS` and `registerAgentTools` :: tool names include `files-tokens`, `references`, `compress`, `find`, `static-check`, `git-check`, `docs-check`, `git-wt-*`. |
| PRJ-003 | `src/index.ts` :: `configurePiUsereq` :: menu options include `Set docs-dir`, `Set tests-dir`, `Manage src-dir`, `Manage static-check`, `Manage startup tools`, `Reset defaults`, `Save and close`. |
| PRJ-004 | `src/core/tool-runner.ts` :: `runGitCheck`, `runGitWtName`, `runGitWtCreate`, `runGitWtDelete` :: git validation and worktree helpers are exported and invoked by CLI/extension wrappers. |
| PRJ-005 | `src/core/resources.ts` :: `ensureHomeResources` :: copies bundled resources; bundled tree exists under `src/resources/{prompts,templates,guidelines}`. |
| CTN-001 | `src/core/config.ts` :: `getProjectConfigPath` and `getDefaultConfig` :: returns `.pi/pi-usereq/config.json`, `pi-usereq/docs`, `tests`, and `["src"]`. |
| CTN-002 | `src/core/tool-runner.ts` :: `collectSourceFiles` :: executes `git -C <projectBase> ls-files --cached --others --exclude-standard` and fails on non-zero status. |
| CTN-003 | `src/core/tool-runner.ts` :: `SUPPORTED_EXTENSIONS = new Set(Object.keys(STATIC_CHECK_EXT_TO_LANG))`; `src/core/source-analyzer.ts` :: alias assignments `specs.cc = specs.cpp`, `specs.cxx = specs.cpp`, `specs.hpp = specs.cpp`, `specs.exs = specs.elixir`. |
| CTN-004 | `src/core/tool-runner.ts` :: `runProjectStaticCheck` :: defines `fixtureRoots` with `tests/fixtures` and `${testsDirRel}/fixtures`, then filters matching files out before execution. |
| CTN-005 | `package.json` :: `"type": "module"`; `tsconfig.json` :: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`. |
| CTN-006 | `tsconfig.json` :: `"strict": true`, `"noEmit": true`, `"include": ["src/**/*.ts", "tests/**/*.ts"]`. |
| CTN-007 | `package.json` :: `"pi": { "extensions": ["./src/index.ts"] }`. |
| CTN-008 | `package.json` :: `"scripts"` :: `"test": "node --import tsx --test tests/**/*.test.ts"`, `"test:watch": ...`, `"cli": "node --import tsx ./src/cli.ts"`. |
| CTN-011 | `src/core/config.ts` :: `buildPromptReplacementPaths` :: emits `%%TEMPLATE_PATH%%` from `~/.pi/pi-usereq/resources/templates`; bundled template files exist under `src/resources/templates/`. |

### 8.2 DES Evidence
| ID | Evidence |
| --- | --- |
| DES-001 | `src/cli.ts` :: `parseArgs` and `main` :: parses flags then dispatches with branches such as `runReferences`, `runCompress`, `runFind`, `runProjectStaticCheck`, and `runStaticCheck`. |
| DES-002 | `src/index.ts` :: `piUsereqExtension` :: calls `registerPromptCommands`, `registerToolWrapperCommands`, `registerAgentTools`, `registerConfigCommands`, then installs `pi.on("session_start", ...)`. |
| DES-003 | `src/core/source-analyzer.ts` :: `class SourceElement`; `SourceAnalyzer.enrich` :: invokes `extractSignatures`, `detectHierarchy`, `extractVisibility`, `extractInheritance`, `extractBodyAnnotations`, and `extractDoxygenFields`. |
| DES-004 | `src/core/static-check.ts` :: classes `StaticCheckBase`, `StaticCheckPylance`, `StaticCheckRuff`, `StaticCheckCommand`; `dispatchStaticCheckForFile` switch selects the implementation by module name. |
| DES-005 | `src/core/tool-runner.ts` :: exports `runFilesTokens`, `runReferences`, `runCompress`, `runFind`, `runProjectStaticCheck`, `runGitCheck`, `runDocsCheck`, `runGitWt*`, `runGitPath`, `runGetBasePath`. |
| DES-006 | `src/core/compress-files.ts` :: `parts.push(\`@@@ ${outputPath} | ${language}\n> Lines: ...\`)`; `src/core/find-constructs.ts` :: `const header = \`@@@ ${filePath} | ${language}\``. |

### 8.3 REQ Evidence
| ID | Evidence |
| --- | --- |
| REQ-001 | `src/core/resources.ts` :: `copyDirectoryContents` :: skips dotfiles, recurses into directories, and uses `fs.copyFileSync(sourcePath, destinationPath)`. |
| REQ-002 | `src/core/config.ts` :: `buildPromptReplacementPaths` :: emits `%%TEMPLATE_PATH%%` plus docs/guideline/source/test tokens; `src/core/prompts.ts` :: `renderPrompt` merges them with `"%%ARGS%%": args`. |
| REQ-003 | `src/core/prompts.ts` :: `TOOL_REFERENCE_REPLACEMENTS` and `adaptPromptForInternalTools` :: replaces ``req --find`` style text with `find tool` style text. |
| REQ-004 | `src/index.ts` :: `registerPromptCommands` :: each handler runs `ensureHomeResources()`, renders the prompt, then executes `pi.sendUserMessage(content)`. |
| REQ-005 | `src/index.ts` :: `runToolCommand`, `formatResultForEditor`, `showToolResult` :: writes combined output into the editor and notifies `completed` or `failed`. |
| REQ-006 | `src/index.ts` :: `configurePiUsereq` :: edits docs/tests/src settings, invokes submenus, resets defaults, and persists with `saveProjectConfig`. |
| REQ-007 | `src/index.ts` :: `configurePiUsereqToolsMenu` :: choices include `Show tool status`, `Toggle tool`, `Enable all`, `Disable all`, `Reset ... defaults`. |
| REQ-008 | `src/index.ts` :: `configureStaticCheckMenu` :: supports guided language addition, raw-spec addition, language removal, and supported-language display. |
| REQ-009 | `src/index.ts` :: `pi.on("session_start", ...)` :: calls `ensureHomeResources()`, `applyConfiguredPiUsereqTools`, and `ctx.ui.setStatus(...)`. |
| REQ-010 | `src/core/token-counter.ts` :: `new TokenCounter("cl100k_base")`; `formatPackSummary`; `src/core/tool-runner.ts` :: `runFilesTokens` validates files and returns summary plus warnings. |
| REQ-011 | `src/core/reference-payload.ts` :: `buildReferenceToolPayload` :: emits explicit-file JSON with per-file metadata, imports, symbol records, and structured comments/Doxygen fields. |
| REQ-012 | `src/core/compress.ts` :: `INDENT_SIGNIFICANT = new Set(["python", "haskell", "elixir"])`; `compressSource` drops comments, blank lines, and optionally prefixes line numbers. |
| REQ-013 | `src/core/find-constructs.ts` :: `findConstructsInFiles` and `formatConstruct` :: filters by tags/regex and emits signature, lines, Doxygen bullets, and stripped code. |
| REQ-014 | `src/core/tool-runner.ts` :: `runReferences`; `src/core/reference-payload.ts` :: `buildRepositoryTree` :: emit repository structure plus structured per-file reference records as JSON. |
| REQ-015 | `src/core/tool-runner.ts` :: `runCompress` :: collects configured project files then returns `compressFiles(files, enableLineNumbers, verbose, base)`. |
| REQ-016 | `src/core/tool-runner.ts` :: `runFind` :: collects configured project files and executes `findConstructsInFiles(files, tagFilter, pattern, ...)`. |
| REQ-017 | `src/core/tool-runner.ts` :: `runTokens` :: `canonicalNames = ["REQUIREMENTS.md", "WORKFLOW.md", "REFERENCES.md"]` and fails if no canonical docs exist. |
| REQ-018 | `src/cli.ts` :: `if (args.testStaticCheck) return runStaticCheck(args.testStaticCheck)`; `src/index.ts` :: registers `test-static-check`; `src/core/static-check.ts` :: `runStaticCheck` supports `dummy`, `pylance`, `ruff`, `command`. |
| REQ-019 | `src/core/tool-runner.ts` :: `runFilesStaticCheck` :: resolves extension via `STATIC_CHECK_EXT_TO_LANG`, iterates configured checkers, and calls `dispatchStaticCheckForFile(..., { failOnly: true })`. |
| REQ-020 | `src/core/static-check.ts` :: `parseEnableStaticCheck` :: parses `LANG=MODULE[,CMD[,PARAM...]]`, canonicalizes language/module names, and builds `StaticCheckEntry`. |
| REQ-021 | `src/core/static-check.ts` :: `parseEnableStaticCheck` :: explicit `ReqError` branches for missing `=`, unknown language, missing module, unknown module, and missing `Command` cmd. |
| REQ-022 | `src/core/static-check.ts` :: `detectPythonExecutable` :: candidate order is project `.venv/bin/python`, `PI_USEREQ_PYTHON`, `python3`, then `python`. |
| REQ-023 | `src/core/static-check.ts` :: `StaticCheckCommand` constructor :: `if (!findExecutable(cmd)) throw new ReqError(...)`. |
| REQ-024 | `src/core/tool-runner.ts` :: `runGitCheck` :: bash command requires worktree membership, empty `git status --porcelain`, and symbolic or detached `HEAD`. |
| REQ-025 | `src/core/tool-runner.ts` :: `runDocsCheck` :: maps missing docs files to `/req-write`, `/req-workflow`, and `/req-references` prompt guidance. |
| REQ-026 | `src/core/tool-runner.ts` :: `runGitWtName` :: emits `useReq-${projectName}-${sanitizedBranch}-${executionId}` using timestamp components. |
| REQ-027 | `src/core/tool-runner.ts` :: `runGitWtCreate` :: validates name, runs `git worktree add`, then copies `.pi/pi-usereq` into the worktree base directory. |
| REQ-028 | `src/core/tool-runner.ts` :: `runGitWtDelete` :: checks branch/worktree existence, removes exact worktree path, deletes branch, and fails if neither exists. |
| REQ-029 | `src/core/tool-runner.ts` :: `runGitPath` and `runGetBasePath` :: print configured path values with trailing newline. |
| REQ-030 | `src/index.ts` :: `loadProjectConfig` :: sets `config["base-path"] = projectBase`; if inside git, sets resolved root, else deletes `git-path`. |
| REQ-031 | `src/index.ts` :: `registerConfigCommands` :: `pi-usereq-show-config` writes `JSON.stringify(config, null, 2)` into the editor. |

### 8.4 TST Evidence
| ID | Evidence |
| --- | --- |
| TST-001 | `tests/extension-registration.test.ts` :: `extension registers all required prompt commands, tool wrappers, and agent tools` validates command and tool registration sets. |
| TST-002 | `tests/prompt-rendering.test.ts` :: `embedded resources are copied ...` and `prompt rendering replaces all dynamic placeholders ...`. |
| TST-003 | `tests/oracle-standalone.test.ts` :: `standalone command outputs match the Python oracle for every fixture` across `files-tokens`, `files-compress`, `files-find`, and `--test-static-check`. |
| TST-004 | `tests/oracle-project.test.ts` :: `project-scan commands match the Python oracle on a git-backed fixture repository` for `compress`, `find`, `tokens`, `files-static-check`, `static-check`, `git-check`, `docs-check`, `git-path`, and `get-base-path`. |
| TST-005 | `tests/extension-registration.test.ts` :: `configuration menu saves updated docs-dir`, `configuration menu can disable ... tools`, and both static-check menu addition tests. |
| TST-006 | `tests/extension-registration.test.ts` :: `session_start applies configured pi-usereq startup tools`. |
| TST-007 | `tests/extension-registration.test.ts` :: `git-path dependent commands derive the repository root at runtime`. |
| TST-008 | `tests/oracle-project.test.ts` :: `git worktree create/delete wrappers produce expected worktree side effects`. |
| TST-009 | `package.json` :: `"type": "module"`, `"pi": { "extensions": ["./src/index.ts"] }`, and `"scripts"` entries for `test`, `test:watch`, and `cli`. |
| TST-010 | `tsconfig.json` :: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"strict": true`, `"noEmit": true`, and `"include": ["src/**/*.ts", "tests/**/*.ts"]`. |
| TST-022 | `tests/extension-registration.test.ts` :: `files-references returns structured repository, symbol, and Doxygen facts`; `references returns a structured repository tree for configured source directories`. |
| TST-023 | `tests/extension-registration.test.ts` :: `reference tools register agent-oriented descriptions and schema details`. |

## 9. Performance Notes
No explicit performance optimizations identified.
