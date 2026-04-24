---
title: "PI-useReq Requirements"
description: Software requirements specification
version: "0.0.59"
date: "2026-04-24"
author: "OpenAI Codex"
scope:
  paths:
    - "src/**/*.ts"
    - "scripts/**"
    - ".github/workflows/**"
    - "tests/**/*.ts"
    - "tests/python_oracle_stubs/**/*.py"
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
PI-useReq is a TypeScript pi extension plus companion Node CLI and standalone extension-debug surface for requirements-oriented prompt delivery, source summarization, static-check orchestration, prompt-command-owned repository/worktree orchestration, offline extension contract validation, and npm release automation. Implemented UI is the pi selection/input/editor/status/notification surface. No standalone GUI code is present. `scripts/` contains the standalone harness, bash wrapper, and support modules. `.github/workflows/` contains the npm release workflow in this revision.

## 2. Project Requirements

### 2.1 Project Functions
- **PRJ-001**: MUST expose prompt commands that render bundled prompt templates with configuration-derived path substitutions and internal tool-reference adaptation.
- **PRJ-002**: MUST expose CLI and agent-tool interfaces for token counting, references generation, compression, construct search, and static-check execution on explicit files or configured project sources.
- **PRJ-003**: MUST provide an interactive pi configuration surface for project paths, git automation, static-check entries, active-tool enablement, notifications, and debug logging controls.
- **PRJ-004**: MUST provide slash-command-owned git validation plus configurable-prefix prompt-command worktree naming, creation, deletion, merge, and cleanup using runtime project and git paths.
- **PRJ-005**: MUST install bundled prompts, git execution instructions, documentation templates, and guidelines under the extension installation path and expose them through shared runtime path context.
- **PRJ-006**: MUST expose a standalone debug surface that inventories extension commands and tools, replays handlers offline, captures registration and UI metadata, provides a bash wrapper, and optionally compares the contract against the official pi SDK runtime.
- **PRJ-007**: MUST intercept pi CLI lifecycle hooks to maintain context telemetry, prompt workflow state, session timing, and selected debug logging for prompt orchestration and tool execution.

### 2.2 Project Constraints
- **CTN-001**: MUST persist project configuration only at `<base-path>/.pi-usereq.json` with default `docs-dir=pi-usereq/docs`, `tests-dir=tests`, `src-dir=["src"]`, `AUTO_GIT_COMMIT=enable`, `GIT_WORKTREE_ENABLED=enable`, and `GIT_WORKTREE_PREFIX=PI-useReq-`.
- **CTN-002**: MUST collect project-wide source files through `git ls-files --cached --others --exclude-standard`; non-git project scans therefore fail instead of falling back to directory walking.
- **CTN-003**: MUST limit project-wide source discovery to extensions listed in `STATIC_CHECK_EXT_TO_LANG`; analyzer-only aliases such as `.cc`, `.cxx`, `.hpp`, and `.exs` remain undiscoverable.
- **CTN-004**: MUST exclude `tests/fixtures` and `<tests-dir>/fixtures` from project-wide static-check execution.
- **CTN-005**: MUST declare an ECMAScript module package and TypeScript `NodeNext` module semantics for runtime and import resolution.
- **CTN-006**: MUST type-check in strict `noEmit` mode and include both `src/**/*.ts` and `tests/**/*.ts` in the TypeScript program.
- **CTN-007**: MUST declare `./src/index.ts` as the only pi extension entry in package metadata.
- **CTN-008**: MUST expose package scripts for test, watch-mode test, and CLI execution through `node --import tsx`.
- **CTN-009**: MUST implement extension debugging outside `src/index.ts` business logic and drive extension behavior only through the default extension export, registered commands, registered tools, and registered events.
- **CTN-010**: MUST execute offline harness flows without requiring pi.dev services or `docs/pi.dev/agent-document-manifest.json`.
- **CTN-011**: MUST store bundled prompt, instruction, template, and guideline resources under `src/resources/{prompts,instructions,templates,guidelines}` and install them under `<installation-path>/resources/{prompts,instructions,templates,guidelines}`.
- **CTN-012**: MUST NOT persist derived `base-path`, `git-path`, `parent-path`, `base-dir`, `context-path`, `worktree-dir`, or `worktree-path` in `.pi-usereq.json`.
- **CTN-013**: MUST default `DEBUG_ENABLED=disable`, `DEBUG_LOG_FILE=/tmp/PI-useReq.json`, `DEBUG_STATUS_CHANGES=disable`, `DEBUG_WORKFLOW_EVENTS=disable`, `DEBUG_LOG_ON_STATUS=running`, `DEBUG_ENABLED_TOOLS=[]`, and `DEBUG_ENABLED_PROMPTS=[]` in persisted project configuration.
- **CTN-014**: MUST serialize every configured or derived path without a trailing `/`.
- **CTN-015**: MUST reserve `*-path` names for absolute paths and `*-dir` names for relative paths.
- **CTN-016**: MUST NOT modify any path under `docs/` during analysis, implementation, verification, or bug fixing.
- **CTN-017**: MUST NOT modify any path under `pi.dev-src/` during analysis, implementation, verification, or bug fixing.

## 3. Requirements

### 3.1 Design and Implementation
- **DES-001**: MUST implement the standalone executable in `src/cli.ts` as flag parsing plus dispatch to `tool-runner.ts` or `runStaticCheck`.
- **DES-002**: MUST implement extension activation in `src/index.ts` by registering prompt commands with dedicated prompt-runtime orchestration, agent tools, configuration commands, and shared wrappers for supported pi CLI lifecycle hooks.
- **DES-003**: MUST represent parsed source constructs as `SourceElement` instances produced by `SourceAnalyzer` and enriched with signatures, hierarchy, visibility, inheritance, body annotations, and Doxygen fields.
- **DES-012**: MUST implement prompt-command git validation and worktree lifecycle logic in `src/core/prompt-command-runtime.ts` without invoking extension custom-tool executors from `src/core/tool-runner.ts`.
- **DES-004**: MUST implement modular static-check execution through debug-capable `StaticCheckBase` and user-facing `StaticCheckCommand`, selected by `dispatchStaticCheckForFile`.
- **DES-005**: MUST centralize project file collection, token/reference/compress/search operations, and static-check execution in `src/core/tool-runner.ts`.
- **DES-006**: MUST reuse shared markdown and text renderers for CLI and agent-tool compression plus construct-search outputs, preserving source-leading tabs in emitted excerpts instead of dedicated agent-tool JSON payload builders.
- **DES-007**: MUST implement the standalone debug surface in `scripts/debug-extension.ts`, `scripts/pi-usereq-debug.sh`, and `scripts/lib/` recording and SDK-probe modules without altering extension runtime control flow.
- **DES-008**: MUST wrap affected agent-tool executions as one monolithic content text block plus minimal execution-only details instead of mirrored structured JSON payloads.
- **DES-009**: MUST treat `docs/pi.dev/coding-agent-docs/` and documents referenced by `docs/pi.dev/agent-document-manifest.json` as the authoritative read-only contract for new or modified software that interfaces with the pi.dev CLI.
- **DES-010**: MUST centralize event-driven context snapshots, run-timing state, prompt-orchestration workflow state, and status-bar rendering through shared extension-status helpers.
- **DES-011**: MUST implement `.github/workflows/release-npm.yml` as a two-job GitHub Actions pipeline where `check-branch` gates `build-release`, preserving changelog-driven GitHub Release creation while adding npm publication.

### 3.2 Functions
- **REQ-001**: MUST access bundled prompts, git execution instructions, templates, and guidelines from `<installation-path>/resources` without requiring user-home resource copies before prompt or tool execution.
- **REQ-002**: MUST replace `%%DOC_PATH%%`, `%%GUIDELINES_*%%`, `%%TEMPLATE_PATH%%`, `%%SRC_PATHS%%`, and `%%TEST_PATH%%` when rendering prompts.
- **REQ-266**: MUST replace `%%PROJECT_BASE%%`, `%%CONTEXT_PATH%%`, `%%INSTALLATION_PATH%%`, `%%CONFIG_PATH%%`, and `%%ARGS%%` when rendering prompts.
- **REQ-003**: MUST rewrite legacy `req --...` prompt text references to surviving internal tool names and slash-command-owned runtime behaviors.
- **REQ-004**: MUST register `req-<prompt>` commands for every bundled prompt name using the bundled YAML `description` field as the runtime command description, run prompt preflight/worktree orchestration, and send rendered prompt content as a user message.
- **REQ-211**: MUST replace `%%PROMPT%%` with the current prompt name without the `req-` prefix when rendering bundled prompts and bundled commit instructions.
- **REQ-213**: MUST replace prompt token `%%COMMIT%%` with rendered `<installation-path>/resources/instructions/git_commit.md` when `AUTO_GIT_COMMIT=enable`, and with rendered `<installation-path>/resources/instructions/git_read-only.md` when `AUTO_GIT_COMMIT=disable`.
- **REQ-214**: MUST preprocess bundled `git_commit.md` and `git_read-only.md` with the same runtime token-replacement rules used for prompts before injecting them through `%%COMMIT%%`.
- **REQ-005**: MUST expose `files-tokens`, `files-references`, `files-compress`, and `files-search` only through agent-tool registration.
- **REQ-044**: MUST expose `references`, `compress`, `search`, `tokens`, `files-static-check`, and `static-check` only through agent-tool registration.
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
- **REQ-006**: MUST provide a `pi-usereq` menu that edits project directories, git automation, static-check settings, tools, notifications, and debug settings, exposes `Show configuration`, confirms reset actions, saves every change immediately, and never renders `Save and close`.
- **REQ-236**: MUST persist `DEBUG_ENABLED` with allowed values `enable` and `disable`, defaulting to `disable`.
- **REQ-237**: MUST persist `DEBUG_LOG_FILE` as a non-empty string defaulting to `/tmp/PI-useReq.json`, and resolve relative paths against the original project base when writing logs.
- **REQ-238**: MUST persist `DEBUG_LOG_ON_STATUS` with allowed values `any`, `idle`, `checking`, `running`, `merging`, and `error`, defaulting to `running`.
- **REQ-239**: MUST persist enabled debug-tool names and enabled debug-prompt names as normalized arrays defaulting to empty.
- **REQ-254**: MUST persist `DEBUG_STATUS_CHANGES` with allowed values `enable` and `disable`, defaulting to `disable`.
- **REQ-277**: MUST persist `DEBUG_WORKFLOW_EVENTS` with allowed values `enable` and `disable`, defaulting to `disable`.
- **REQ-240**: MUST provide a `Debug` submenu with rows `Debug`, `Log file`, `Log on status`, `Status changes`, `Workflow events`, and per-item toggles for custom tools, embedded tools, and `req-*` prompts.
- **REQ-241**: MUST dim and disable every `Debug` submenu row except `Debug` whenever `DEBUG_ENABLED=disable`.
- **REQ-242**: MUST derive per-tool debug rows from `PI_USEREQ_CUSTOM_TOOL_NAMES` and `PI_USEREQ_EMBEDDED_TOOL_NAMES`.
- **REQ-243**: MUST derive per-prompt debug rows from `PROMPT_COMMAND_NAMES` as `req-*` names.
- **REQ-244**: MUST append one JSON entry to `DEBUG_LOG_FILE` for each selected custom or embedded tool execution, including tool name, workflow state, input, result, and error flag.
- **REQ-245**: MUST append JSON debug entries from selected `req-*` commands for required-doc checks, worktree creation, merge finalization, worktree deletion, and workflow events when `DEBUG_WORKFLOW_EVENTS=enable`.
- **REQ-255**: MUST append `workflow_state` debug entries for every actual prompt-orchestration state transition only when `DEBUG_STATUS_CHANGES=enable`.
- **REQ-276**: MUST complete orchestrated session closure when pi lifecycle events expose non-command contexts without `switchSession()`, while keeping the client attached to the original `base-path` session.
- **REQ-278**: MUST preserve the in-memory prompt workflow state plus pending or active prompt request across switch-triggered `session_shutdown` events until the initiating handler or replacement-session lifecycle hooks complete prompt orchestration.
- **REQ-279**: MUST resynchronize replacement-session lifecycle handlers from persisted prompt-command runtime state when the active session file matches the forked execution session, so post-switch workflow transitions performed by the initiating handler remain visible to later `before_agent_start`, `agent_start`, `agent_end`, and `session_shutdown` handling.
- **REQ-280**: MUST ignore stale extension-context render or prompt-closure notification attempts raised after session replacement or reload and continue prompt-orchestration closure without surfacing stale-instance exceptions to pi CLI.
- **REQ-281**: MUST record and persist the `running` workflow transition immediately after prompt-session handoff begins, and MUST NOT delay that transition until an async replacement-session `sendUserMessage(...)` helper resolves after the full prompt run completes.
- **REQ-282**: MUST finalize successful worktree-backed closure from restored `base-path` using persisted execution-session header metadata and verified worktree artifacts even when pi CLI end-of-session processing has already moved the live runtime away from `worktree-path` before prompt-end handling.
- **REQ-246**: MUST suppress all debug logging whenever `DEBUG_ENABLED=disable`.
- **REQ-247**: MUST log selected debug entries only when `DEBUG_LOG_ON_STATUS` equals the current workflow state, or when `DEBUG_LOG_ON_STATUS=any`.
- **REQ-007**: MUST provide an `Enable tools` submenu with `Enable tools`, enable-all, disable-all, reset-defaults, and a per-tool toggle list grouped as custom tools first and embedded pi CLI tools second.
- **REQ-231**: MUST order non-`files-*` custom-tool toggles alphabetically, append `files-*` custom-tool toggles alphabetically, and place default-disabled custom-tool toggles after default-enabled custom-tool toggles inside each custom subgroup.
- **REQ-232**: MUST order embedded-tool toggles alphabetically and place default-disabled embedded-tool toggles after default-enabled embedded-tool toggles.
- **REQ-063**: MUST derive configurable embedded pi CLI tools from runtime builtin tools named `read`, `bash`, `edit`, `write`, `find`, `grep`, and `ls`.
- **REQ-064**: MUST default `files-tokens`, `files-references`, `files-compress`, `files-search`, `references`, `compress`, `search`, `tokens`, `files-static-check`, `static-check`, plus embedded `read`, `bash`, `edit`, and `write` to enabled.
- **REQ-066**: MUST omit `reset-context` and `context-reset` fields from persisted project configuration.
- **REQ-067**: MUST send every rendered `req-<prompt>` payload into the current active session.
- **REQ-068**: MUST use one prompt-delivery path that sends the rendered prompt through the forked execution session after the worktree switch by using only the replacement-session context for post-switch session-bound operations.
- **REQ-008**: MUST provide a `Language static code checkers` submenu that adds Command entries by guided language flow, removes configured language entries, toggles per-language enablement, and resets the static-check configuration.
- **REQ-160**: MUST hardcode `Command` as the only user-configurable static-check module and omit module-selection UI from static-check configuration menus.
- **REQ-161**: MUST hide `Dummy` from user-configurable static-check menus while preserving existing-config parsing and debug-driver support for `Dummy` entries.
- **REQ-248**: MUST render 20 per-language static-check toggle rows between `Remove static code checker` and `Reset defaults`, with right-aligned `on|off` values derived from persisted enablement.
- **REQ-249**: MUST persist each `static-check.<language>` entry as an object ordered `enabled`, `checkers`, with `enabled` values limited to `enable|disable`.
- **REQ-250**: MUST default `static-check.C` and `static-check.C++` to `enabled=enable` with documented `cppcheck` and `clang-format` Command checker entries.
- **REQ-251**: MUST default `static-check.Python`, `JavaScript`, and `TypeScript` to `enabled=enable` with their documented Command checker entries.
- **REQ-252**: MUST default every other supported `static-check.<language>` entry to `enabled=disable` with `checkers=[]`.
- **REQ-009**: MUST refresh shared runtime path context, apply configured startup tools, reset workflow state to `idle` for `session_start` reasons `startup|new|reload`, and publish single-line `pi-usereq` status text.
- **REQ-109**: MUST omit `current-path`, `base`, `docs`, `src`, and `tests` path fields from the single-line status bar.
- **REQ-111**: MUST omit prompt-delivery mode fields from the single-line status bar.
- **REQ-112**: MUST render status-bar field names with the active theme `accent` token and non-error field values with the active theme `warning` token unless a field-specific requirement overrides the value token.
- **REQ-113**: MUST register shared event wrappers for `resources_discover`, `session_start`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, and `session_shutdown`.
- **REQ-114**: MUST register shared event wrappers for `session_before_tree`, `session_tree`, `context`, `before_provider_request`, `before_agent_start`, `agent_start`, and `agent_end`.
- **REQ-115**: MUST register shared event wrappers for `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, and `tool_execution_update`.
- **REQ-116**: MUST register shared event wrappers for `tool_execution_end`, `model_select`, `tool_call`, `tool_result`, `user_bash`, and `input`.
- **REQ-117**: MUST route every intercepted hook through `updateExtensionStatus` with the originating hook name and event payload, even when no hook-specific side effect exists.
- **REQ-118**: MUST obtain latest context-usage facts from `ctx.getContextUsage()` or an equivalent runtime API and store them in extension session state.
- **REQ-119**: MUST refresh stored context-usage facts during `session_start` and after intercepted events before rebuilding the status bar when newer data is available.
- **REQ-120**: MUST render single-line status fields in this order: `status`, `branch`, `context`, `elapsed`, `sound`.
- **REQ-121**: MUST render `branch` immediately after `status` with separator ` • ` and the active git branch name.
- **REQ-283**: MUST resolve `branch` from the current `context-path` git HEAD during every status-bar rebuild so worktree switches and base-path restoration update immediately.
- **REQ-284**: MUST render `context` immediately after `branch` with separator ` • ` and one fixed-width gauge icon.
- **REQ-122**: MUST map `context` usage to `▕_▏`, `▕▂▏`, `▕▄▏`, `▕▆▏`, and `▕█▏` for `0`, `>0-<25`, `>=25-<50`, `>=50-<75`, and `>=75` percent bands.
- **REQ-123**: MUST render `elapsed` immediately after `context` as `⏱︎ <active> ⚑ <last> ⌛︎<total>`.
- **REQ-124**: MUST render `⏱︎ --:--` when no prompt is active, and `⚑ --:--` plus `⌛︎--:--` until the corresponding timers receive a normally completed prompt duration.
- **REQ-125**: MUST render timed `elapsed` segments as `M:SS`, keep minutes unbounded above 59, zero-pad seconds to two digits, and preserve `⚑` plus `⌛︎` when escape-triggered cancellation ends the active run.
- **REQ-126**: MUST render `context` gauge icons below 90 percent with the same non-error theme token used by `status`, and theme `error` at 90 percent or above.
- **REQ-127**: MUST render `context` as non-blinking theme `error` `▕█▏` when normalized usage is `>=90-<100` percent.
- **REQ-233**: MUST render `context` as blinking theme `error` `▕█▏` when normalized usage is `>=100` percent and terminal blink control is supported.
- **REQ-128**: MUST render `context` as theme `error` `▕█▏` when normalized usage is `>=100` percent and terminal blink control is unavailable.
- **REQ-131**: MUST persist a boot sound level with allowed values `none`, `low`, `mid`, and `high`, defaulting to `none`.
- **REQ-132**: MUST execute the configured sound command when the corresponding prompt-end sound event toggle is enabled and the active runtime sound level is not `none`.
- **REQ-133**: MUST persist configurable shell-command strings for sound levels `low`, `mid`, and `high`, and MUST substitute `%%INSTALLATION_PATH%%` with the runtime extension installation path before execution.
- **REQ-134**: MUST persist a configurable sound-level toggle shortcut, defaulting to `alt+s`.
- **REQ-285**: MUST load the active runtime sound level from persisted `notify-sound` during `session_start`.
- **REQ-286**: MUST cycle only the active runtime sound level when the configured shortcut fires.
- **REQ-287**: MUST NOT update `.pi-usereq.json` when the configured shortcut fires.
- **REQ-137**: MUST make the `Notifications` menu render contiguous command-notify, sound, and Pushover configuration blocks in that order.
- **REQ-163**: MUST persist a global Pushover enable flag defaulting to disabled.
- **REQ-164**: MUST expose a `Pushover events` submenu and MUST keep non-event Pushover settings directly in `Notifications`.
- **REQ-165**: MUST order Pushover rows as `Enable pushover`, `Pushover events`, `Pushover priority`, `Pushover title`, `Pushover text`, `Pushover User Key/Delivery Group Key`, and `Pushover Token/API Token Key`.
- **REQ-234**: MUST keep `Enable pushover` dimmed, fixed at `off`, and non-selectable until both Pushover credential fields contain non-empty strings.
- **REQ-235**: MUST render the `Pushover text` menu value with escaped `\n`, `\r`, `\t`, `\\`, `\0`, `\b`, `\f`, and `\v` sequences and decode the same sequences from user input before persistence.
- **REQ-166**: MUST deliver Pushover notifications only when global Pushover is enabled and the corresponding prompt-end Pushover event toggle is enabled.
- **REQ-167**: MUST deliver Pushover notifications through native Node HTTP or HTTPS requests to `https://api.pushover.net/1/messages.json` and MUST NOT invoke shell commands for Pushover delivery.
- **REQ-168**: MUST send a Pushover message only when persisted `user` plus `token` values are non-empty for the triggered prompt-end outcome.
- **REQ-169**: MUST substitute `%%INSTALLATION_PATH%%`, `%%PROMT%%`, `%%BASE%%`, `%%TIME%%`, `%%ARGS%%`, and `%%RESULT%%` at runtime inside `PI_NOTIFY_CMD`.
- **REQ-172**: MUST persist Pushover priority values `Normal=0` and `High=1`, defaulting to `Normal`.
- **REQ-174**: MUST persist command-notify event toggles in keys `notify-on-completed`, `notify-on-interrupted`, and `notify-on-failed`, defaulting to completed enabled and interrupted plus failed disabled.
- **REQ-175**: MUST persist `PI_NOTIFY_CMD` defaulting to `notify-send -i %%INSTALLATION_PATH%%/resources/images/pi.dev.png -a "PI-useReq" "%%PROMT%% @ %%BASE%% [%%TIME%%]" "%%RESULT%%"`.
- **REQ-176**: MUST implement command-notify exclusively by executing `PI_NOTIFY_CMD` when command-notify is globally enabled and the corresponding prompt-end notify event toggle is enabled.
- **REQ-178**: MUST persist sound event toggles in keys `notify-sound-on-completed`, `notify-sound-on-interrupted`, and `notify-sound-on-failed`, defaulting to completed enabled and interrupted plus failed disabled.
- **REQ-179**: MUST label sound rows as `Enable sound (boot value)` and `Sound command (low vol.)`, `Sound command (mid vol.)`, and `Sound command (high vol.)`.
- **REQ-180**: MUST render `sound` immediately after `elapsed`, showing the active runtime sound level as `none`, `low`, `mid`, or `high`.
- **REQ-181**: MUST make the `Notifications` menu expose `Enable notification`, `Notification events`, and `Notify command` before sound rows.
- **REQ-183**: MUST make the `Notifications` menu expose `Sound events` immediately after `Enable sound (boot value)` and before sound hotkey plus command rows.
- **REQ-288**: MUST persist menu-selected `notify-sound` changes to `.pi-usereq.json` without changing the active runtime sound level.
- **REQ-289**: MUST render configuration-menu sound values from persisted `notify-sound`, even when the active runtime sound level differs.
- **REQ-184**: MUST persist Pushover event toggles in keys `notify-pushover-on-completed`, `notify-pushover-on-interrupted`, and `notify-pushover-on-failed`, defaulting to completed enabled and interrupted plus failed disabled.
- **REQ-185**: MUST persist `Pushover title` defaulting to `%%PROMT%% @ %%BASE%% [%%TIME%%]` and `Pushover text` defaulting to `%%RESULT%%\n%%ARGS%%`.
- **REQ-186**: MUST substitute `%%PROMT%%`, `%%BASE%%`, `%%TIME%%`, `%%ARGS%%`, and `%%RESULT%%` at runtime inside `Pushover title` and `Pushover text`.
- **REQ-187**: MUST render `%%BASE%%` as static `base-path` relative to user home using `~/...` form and `%%TIME%%` as final elapsed `M:SS`.
- **REQ-188**: MUST label notification-event rows as `Prompt completed`, `Prompt interrupted`, and `Prompt failed`.
- **REQ-190**: MUST label top-level rows as `Document directory`, `Source-code directories`, `Unit tests directory`, `Auto git commit`, `Git worktree`, `Worktree prefix`, `Language static code checkers`, `Enable tools`, `Notifications`, `Debug`, and `Show configuration`.
- **REQ-191**: MUST order top-level rows as `Document directory`, `Source-code directories`, `Unit tests directory`, `Auto git commit`, `Git worktree`, `Worktree prefix`, `Language static code checkers`, `Enable tools`, `Notifications`, `Debug`, `Show configuration`, and `Reset defaults`.
- **REQ-192**: MUST preserve the selected settings-menu row after toggling or editing a setting value.
- **REQ-193**: MUST append `Reset defaults` as a final row without right-aligned value text in every configuration menu and descendant selector menu, and MUST NOT render `Save and close`.
- **REQ-194**: MUST make top-level `Reset defaults` show changed values with previous and next values, require explicit confirmation, restore full-tree defaults, and save immediately.
- **REQ-195**: MUST make non-top-level `Reset defaults` show changed values with previous and next values, require explicit confirmation, restore subtree defaults, and save immediately.
- **REQ-196**: MUST persist a global command-notify enable flag defaulting to disabled.
- **REQ-197**: MUST summarize top-level `Notifications` as `notification:<state> • sound:<level> • pushover:<state>`.
- **REQ-198**: MUST render `Notification events`, `Sound events`, and `Pushover events` as identical submenu lists with right-aligned `on|off` values for `Prompt completed`, `Prompt interrupted`, and `Prompt failed`.
- **REQ-199**: MUST render `%%RESULT%%` as `successed`, `aborted`, or `failed` for completed, interrupted, and failed prompt-end outcomes.
- **REQ-200**: MUST run slash-command-owned git validation immediately after the `idle` gate at the start of every `req-<prompt>` command and abort before prompt dispatch on failure.
- **REQ-201**: MUST require `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` before `analyze`, `change`, `check`, `cover`, `fix`, `flowchart`, `new`, `readme`, `recreate`, `refactor`, and `renumber`.
- **REQ-202**: MUST require `REQUIREMENTS.md` before `implement` and `references`, and MUST skip required-doc prechecks for `create`, `workflow`, and `write`.
- **REQ-203**: MUST abort a `req-<prompt>` command before worktree creation and prompt dispatch when any prompt-required doc is missing and surface the missing canonical path plus remediation prompt command.
- **REQ-212**: MUST persist `AUTO_GIT_COMMIT` with allowed values `enable` and `disable`, defaulting to `enable`.
- **REQ-204**: MUST persist `GIT_WORKTREE_ENABLED` with allowed values `enable` and `disable`, defaulting to `enable`.
- **REQ-205**: MUST persist `GIT_WORKTREE_PREFIX` as the configurable prefix used by `worktree-dir` generation, defaulting to `PI-useReq-`.
- **REQ-215**: MUST force the effective `GIT_WORKTREE_ENABLED` value to `disable` whenever `AUTO_GIT_COMMIT=disable`.
- **REQ-216**: MUST render `Git worktree` and `Worktree prefix` as dimmed non-editable rows whenever `AUTO_GIT_COMMIT=disable`.
- **REQ-206**: MUST derive `worktree-dir` as `<prefix><project>-<sanitized-branch>-<YYYYMMDDHHMMSS>` and `worktree-path` as `<parent-path>/<worktree-dir>/<base-dir>` when worktrees are enabled.
- **REQ-271**: MUST create one dedicated worktree under `parent-path`, fork the current active session into an execution session file whose header cwd equals `worktree-path`, and switch the active pi CLI session to that file before agent start.
- **REQ-207**: MUST keep `context-path`, `ctx.cwd`, and `process.cwd()` at `base-path` when worktree creation is disabled.
- **REQ-208**: MUST restore the original session-backed `base-path`, merge the successful worktree branch from `base-path`, and delete the worktree plus branch after successful closure.
- **REQ-290**: MUST preserve the successful worktree execution transcript in the restored client-visible session after successful closure.
- **REQ-291**: MUST detect staged or unstaged `base-path` changes before successful closure merge and execute `git stash`, merge, and `git stash pop` in that order when changes exist.
- **REQ-292**: MUST complete successful stash-assisted closure without surfacing an error and MUST emit a warning that the restored `base-path` is not clean after merge.
- **REQ-209**: MUST restore the original session-backed `base-path`, notify the pi CLI of closure failure, and retain the worktree plus branch when orchestrated session closure is interrupted, failed, aborted, or incomplete.
- **REQ-221**: MUST maintain one prompt-orchestration state machine with states `idle`, `checking`, `running`, `merging`, and `error`.
- **REQ-222**: MUST render `status` as the first single-line status field and refresh it on every internal or pi CLI state transition.
- **REQ-223**: MUST render `status:error` with theme `error` plus terminal blink when supported, and other `status` values with the existing non-error status-bar convention.
- **REQ-224**: MUST reject a `req-<prompt>` command before any operation when workflow state is not `idle`, surfacing the error to pi CLI.
- **REQ-225**: MUST transition workflow state to `checking` after the `idle` gate and keep it there through required-doc checks, worktree generation, worktree verification, and prompt handoff preparation.
- **REQ-226**: MUST transition workflow state to `error` when required-doc checks or worktree creation fails during `req-<prompt>` preflight.
- **REQ-227**: MUST transition workflow state to `running` only after required-doc checks, worktree generation, worktree verification, and prompt-session handoff succeed, and MUST make that transition the last slash-command action except logging.
- **REQ-228**: MUST transition workflow state to `merging` immediately before merge and worktree/branch deletion begin during successful orchestrated session closure.
- **REQ-229**: MUST transition workflow state to `error` and notify the pi CLI when base-path restoration, merge, or worktree/branch deletion verification fails during orchestrated session closure.
- **REQ-230**: MUST transition workflow state to `idle` before the orchestrated session-closure handler returns.
- **REQ-219**: MUST verify created worktree registration via `git worktree list`, branch presence via `git branch` list, and filesystem path existence before changing the prompt execution path or dispatching a prompt message.
- **REQ-256**: MUST store `base-path`, `context-path`, `git-path`, `parent-path`, `base-dir`, `worktree-dir`, `worktree-path`, branch name, original session file, and execution session file inside prompt-orchestration runtime state.
- **REQ-272**: MUST verify post-switch execution targets before agent start using replacement-session context when available, the persisted execution-session header cwd, and `process.cwd()`, and MUST NOT rely on stale pre-switch session-bound objects.
- **REQ-257**: MUST keep active-session cwd, `ctx.cwd`, and `process.cwd()` aligned to the current `context-path` before agent start and after authoritative `base-path` restoration during orchestrated session closure.
- **REQ-258**: MUST verify worktree deletion by confirming absence from `git worktree list`, absence from `git branch` list, and absence of the worktree filesystem path.
- **REQ-220**: MUST keep `req-<prompt>` implementations independent from extension custom-tool executors so prompt-command source remains unchanged when custom tools are removed.
- **REQ-210**: MUST define custom `renderResult` for every agent-tool registration, keep collapsed tool rows compact with essential invocation parameters plus result status, and reveal full monolithic tool text only when the tool row is expanded.
- **REQ-159**: MUST increase `Σ` by each normally completed prompt duration and MUST NOT change `Σ` on escape-triggered cancellation.
- **REQ-217**: MUST reset `⚑` plus `⌛︎` only during `session_start` with reason `startup` or `reload`.
- **REQ-173**: MUST optimize every affected agent-tool response by reusing Python-compatible monolithic renderer structure, preserving source-leading tabs in source-derived text, and omitting mirrored JSON bodies, duplicate facts, and caller-known request echoes.
- **REQ-010**: MUST count tokens with `js-tiktoken` `cl100k_base`, count characters and lines, and make `files-tokens` return the Python-compatible pack-summary text through `content[0].text`.
- **REQ-011**: MUST make `files-references` analyze supported source files and return the Python-compatible references markdown through `content[0].text`.
- **REQ-012**: MUST compress supported source files by removing comments and blank lines, preserving full indentation for Python, Haskell, and Elixir, preserving leading-tab indentation for other languages, and optionally preserving original line numbers.
- **REQ-013**: MUST search explicit files by tag filter and name regex, then return Python-compatible markdown matches with signatures, line ranges, Doxygen bullets, and stripped code excerpts.
- **REQ-014**: MUST make `references` scan configured `src-dir` files and return the Python-compatible file-structure-plus-references markdown through `content[0].text`.
- **REQ-015**: MUST make CLI project-scope compression scan configured `src-dir` files and emit Python-compatible compressed markdown blocks for every supported file.
- **REQ-016**: MUST make `find` scan configured `src-dir` files using the requested tag filter and regular expression, then emit Python-compatible markdown matches.
- **REQ-017**: MUST make `tokens` count only existing canonical docs `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md`, reuse the `files-tokens` pack-summary text contract, and fail when none exist.
- **REQ-069**: MUST make `files-tokens` and `tokens` pass exactly one monolithic pack-summary text block to the LLM through `content[0].text`.
- **REQ-070**: MUST keep affected tool `details` limited to `execution` metadata with numeric `code` and optional `stdout_lines` plus `stderr_lines`.
- **REQ-071**: MUST keep `files-tokens` and `tokens` content text identical in ordering and headings to the Python pack-summary formatter.
- **REQ-072**: MUST register `files-tokens` and `tokens` with machine-oriented descriptions describing scope, monolithic text contract, and stable failure conditions.
- **REQ-073**: MUST omit caller-known request echoes, mirrored file tables, and duplicate metrics from `files-tokens` and `tokens` runtime payloads.
- **REQ-074**: MUST reserve `files-tokens` and `tokens` `details` for execution metadata and MUST NOT mirror content text or derived guidance there.
- **REQ-075**: MUST surface `files-tokens` and `tokens` skip or read-error observations through `details.execution` diagnostics instead of structured runtime file entries.
- **REQ-076**: MUST make `files-references` and `references` pass exactly one monolithic markdown document to the LLM through `content[0].text`.
- **REQ-077**: MUST keep `files-references` markdown aligned to the Python references renderer in section ordering and non-source formatting while preserving leading tabs in source-derived lines.
- **REQ-078**: MUST prepend project-scope `references` output with the file-structure markdown block before the per-file references markdown.
- **REQ-079**: MUST omit mirrored JSON structures and request echoes from `files-references` and `references` runtime payloads.
- **REQ-080**: MUST register `files-references` and `references` with machine-oriented descriptions describing scope, monolithic markdown contract, and stable failure conditions.
- **REQ-081**: MUST make `files-compress` and `compress` pass exactly one monolithic markdown document to the LLM through `content[0].text`.
- **REQ-082**: MUST keep `files-compress` and `compress` content aligned to the Python compression renderer in headers, line-range metadata, code fences, and file ordering while preserving leading tabs in retained source lines.
- **REQ-083**: MUST make `enableLineNumbers` for `files-compress` and `compress` toggle original source line prefixes inside emitted fenced code blocks without changing header or line-range formatting.
- **REQ-084**: MUST omit mirrored JSON structures, symbol tables, and duplicate excerpt copies from `files-compress` and `compress` runtime payloads.
- **REQ-085**: MUST register `files-compress` and `compress` with machine-oriented descriptions describing scope, line-number behavior, monolithic markdown contract, and stable failure conditions.
- **REQ-086**: MUST preserve `files-compress` and `compress` execution diagnostics only when the underlying compression runner emits residual stderr output.
- **REQ-087**: MUST keep `files-compress` and `compress` runtime payloads free of structured file-entry mirrors for skips, unsupported extensions, and failures.
- **REQ-088**: MUST NOT mirror compression markdown or diagnostics into additional JSON payload fields beyond `content[0].text` and `details.execution`.
- **REQ-089**: MUST make `files-search` and `search` pass exactly one monolithic markdown document to the LLM through `content[0].text`.
- **REQ-090**: MUST keep `files-search` and `search` content aligned to the Python search renderer in construct headings, line-range lines, Doxygen bullets, and fenced stripped-code excerpts while preserving leading tabs in source-derived lines.
- **REQ-091**: MUST keep `files-search` and `search` request-scope, regex, tag, and supported-tag facts in registration metadata instead of runtime payload fields.
- **REQ-092**: MUST make `enableLineNumbers` for `files-search` and `search` toggle original source line prefixes inside emitted fenced code blocks.
- **REQ-093**: MUST omit mirrored JSON structures, duplicate source excerpts, and request echoes from `files-search` and `search` runtime payloads.
- **REQ-094**: MUST register `files-search` and `search` with machine-oriented descriptions describing scope, regex semantics, supported tags, monolithic markdown contract, and stable failure conditions.
- **REQ-095**: MUST preserve search execution diagnostics only when the underlying search runner emits residual stderr output.
- **REQ-096**: MUST deliver search failure diagnostics through `details.execution` when no markdown match block is available.
- **REQ-097**: MUST make `files-static-check` and `static-check` pass the monolithic static-check report through `content[0].text`.
- **REQ-098**: MUST keep `files-static-check` and `static-check` `details` limited to `execution` metadata and MUST NOT mirror selection tables or request echoes there.
- **REQ-099**: MUST make every affected agent-tool response use `content[0].text` as the sole LLM-facing payload channel.
- **REQ-100**: MUST keep every affected agent-tool runtime payload free of mirrored JSON conversion logic and free of duplicate content copies across `content` and `details`.
- **REQ-101**: MUST register every affected agent tool with machine-oriented metadata describing parameters, monolithic text output, minimal `details.execution` metadata, and stable failure conditions.
- **REQ-102**: MUST keep every affected agent-tool `details.execution` record deterministic across identical inputs by preserving only exit code and normalized residual diagnostics.
- **REQ-018**: MUST expose the `test-static-check` driver only through standalone CLI `--test-static-check`, dispatching `dummy` or `command` checker subcommands directly.
- **REQ-019**: MUST resolve each explicit static-check file by extension and run every configured checker only when that language `enabled=enable`, while capturing only failing checker output.
- **REQ-020**: MUST parse user `--enable-static-check` specs in `LANG=Command,CMD[,PARAM...]` format and normalize supported language names plus `Command` case-insensitively.
- **REQ-021**: MUST reject user `--enable-static-check` specs with missing `=`, missing `Command`, missing `cmd`, unknown language, or any module other than `Command`.
- **REQ-022**: MUST preserve persisted `Dummy` static-check entries during config loading and execute them only when present in configuration or `--test-static-check dummy` input.
- **REQ-023**: MUST require `Command`-module executables to exist on `PATH` before static-check execution.
- **REQ-030**: MUST set static `base-path` from the bootstrap cwd and static `config-path` to `<base-path>/.pi-usereq.json`.
- **REQ-259**: MUST set dynamic `context-path` from the bootstrap cwd and keep it aligned with `ctx.cwd`.
- **REQ-103**: MUST resolve static `install-path` from the executing extension entry module.
- **REQ-269**: MUST derive static `template-path` and `guidelines-path` as `<install-path>/resources/{templates,guidelines}`.
- **REQ-104**: MUST persist `docs-dir`, `tests-dir`, and every `src-dir` entry as trailing-slash-free relative paths.
- **REQ-105**: MUST derive static `git-path` from `base-path` only when it equals `base-path` or ancestors it.
- **REQ-270**: MUST derive static `parent-path` as the parent of `git-path` and static `base-dir` as `base-path` relative to `git-path`.
- **REQ-106**: MUST make prompt `%%GUIDELINES_FILES%%`, `%%GUIDELINES_PATH%%`, and `%%TEMPLATE_PATH%%` resolve from static installation resources.
- **REQ-107**: MUST express prompt-visible absolute paths under user home with `~` and without trailing `/`.
- **REQ-031**: MUST make the `pi-usereq` menu expose a `Show configuration` action after `Notifications` and before `Reset defaults`, save pending config, close the active menu tree, and then write the persisted `.pi-usereq.json` file text to the editor.
- **REQ-162**: MUST render the `show-config` current value as the `~`-relative extension config path using the settings-list `dim` value style.
- **REQ-032**: MUST inject a pi.dev governance block into rendered prompts when `docs/pi.dev/agent-document-manifest.json` exists under the project base.
- **REQ-033**: MUST make that block require manifest-guided document review before implementing or changing extension code that interfaces with the pi.dev CLI.
- **REQ-034**: MUST make that block require manifest-guided document review before analyzing, verifying, or fixing extension code that interfaces with the pi.dev CLI.
- **REQ-108**: MUST make that block require interface-contract compliance with `docs/pi.dev/coding-agent-docs/` and documents referenced by `docs/pi.dev/agent-document-manifest.json` for new or modified pi.dev CLI integrations.
- **REQ-273**: MUST make that block declare every path under `docs/` and `pi.dev-src/` read-only for analysis, implementation, verification, and bug fixing.
- **REQ-274**: MUST make that block require validation against `pi.dev-src/pi-mono` when manifest or `docs/pi.dev/coding-agent-docs/` guidance is ambiguous for extension-to-pi-client interface behavior.
- **REQ-275**: MUST make that block require validation against `pi.dev-src/pi-mono` for bug fixes or problem resolution influenced by extension-to-pi-client interface implementations.
- **REQ-035**: MUST parse repeatable `--enable-static-check LANG=Command,CMD[,PARAM...]` CLI options before command dispatch and merge resulting entries into persisted per-language checker lists for the current project base.
- **REQ-253**: MUST set `static-check.<language>.enabled=enable` whenever guided or CLI `--enable-static-check` entry creation targets that language.
- **REQ-036**: MUST preserve existing `static-check` entries, append non-duplicate `--enable-static-check` entries in argument order, and treat canonical language, module, cmd, and params as the duplicate identity.
- **REQ-037**: MUST reject `--enable-static-check` `Command` entries whose executable is unavailable on `PATH` and MUST NOT modify persisted project configuration when validation fails.
- **REQ-038**: MUST honor `--verbose` only for `files-references`, `files-compress`, `files-find`, `references`, `compress`, and `find`, emitting command progress to stderr while leaving stdout payload format unchanged.
- **REQ-039**: MUST support `--enable-line-numbers` only for `files-compress`, `compress`, `files-find`, and `find`, and MUST leave corresponding outputs unnumbered when the flag is absent.
- **REQ-040**: MUST store canonical expected CLI result fixtures as UTF-8 text files under `tests/fixtures_attended_results/`, preserving normalized exit code, stdout, and stderr for each archived scenario.
- **REQ-041**: MUST canonicalize environment-dependent path and timestamp segments in archived and observed CLI results with stable placeholder tokens before exact comparison.
- **REQ-042**: MUST archive explicit-file scenarios for `files-tokens`, `files-references`, `files-compress`, `files-find`, and `test-static-check` across every file under `tests/fixtures/`.
- **REQ-043**: MUST archive repository scenarios for `references`, `compress`, `find`, `tokens`, `enable-static-check`, `files-static-check`, and `static-check`.
- **REQ-138**: MUST make `.github/workflows/release-npm.yml` trigger release automation from pushed tags matched by the existing workflow filter `v[0-9]+.[0-9]+.[0-9]+`.
- **REQ-139**: MUST skip downstream release work unless `check-branch` confirms the tagged commit is contained in `origin/master`.
- **REQ-140**: MUST configure Node.js plus npm registry authentication, run `npm ci`, remove manifest `private`, and publish with provenance and public access using `secrets.NPM_TOKEN`.
- **REQ-141**: MUST preserve the existing changelog-builder step and use its output as the non-draft non-prerelease GitHub Release body.
- **REQ-155**: MUST keep `package.json` `name` equal to `pi-usereq` so npm publication resolves to `https://www.npmjs.com/package/pi-usereq`.
- **REQ-157**: MUST declare `package.json` `repository.type` as `git` and `repository.url` as `git+https://github.com/Ogekuri/PI-useReq.git`.
- **REQ-158**: MUST declare `package.json` `bugs.url` as `https://github.com/Ogekuri/PI-useReq/issues` and `homepage` as `https://github.com/Ogekuri/PI-useReq#readme`.
- **REQ-142**: MUST default `PI_NOTIFY_SOUND_LOW_CMD` to `paplay --volume=21845 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3`.
- **REQ-143**: MUST default `PI_NOTIFY_SOUND_MID_CMD` to `paplay --volume=43690 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3`.
- **REQ-144**: MUST default `PI_NOTIFY_SOUND_HIGH_CMD` to `paplay --volume=65535 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3`.
- **REQ-145**: MUST derive static `git-path` during bootstrap from `base-path` and repository ancestry rules, ignoring project-configuration JSON values.
- **REQ-146**: MUST NOT read or persist `base-path` or `git-path` in project-configuration JSON.
- **REQ-149**: MUST label notification settings actions as `Notify command`, `Enable sound (boot value)`, `Sound toggle hotkey bind`, `Sound command (low|mid|high vol.)`, `Pushover User Key/Delivery Group Key`, and `Pushover Token/API Token Key`.
- **REQ-150**: MUST omit overview rows and reference-only actions from the main, notification, startup-tool, and static-check configuration menus.
- **REQ-151**: MUST render `pi-usereq`, notification, static-check, and startup-tool menus with left-aligned labels and right-aligned current values using the active CLI settings-list theme semantics.
- **REQ-156**: MUST restrict extension-owned status and settings rendering to CLI-supported theme APIs and documented theme tokens.
- **REQ-152**: MUST render a persistent bottom-line description for the currently selected configuration entry.
- **REQ-153**: MUST use scrollable configuration menus when entry count exceeds the visible row budget.
- **REQ-154**: MUST wrap configuration-menu selection from last-to-first and first-to-last entries.

## 4. Test Requirements
- **TST-001**: MUST verify extension activation registers every documented prompt command, agent tool, and configuration command while omitting tool-name slash commands, `test-static-check`, and the removed standalone config-viewer command.
- **TST-002**: MUST verify installed bundled prompt, commit-instruction, template, and guideline resources remain readable from `installation-path`.
- **TST-060**: MUST verify prompt rendering replaces `%%PROMPT%%` and expands `%%COMMIT%%` from rendered `git_commit.md` or `git_read-only.md` according to `AUTO_GIT_COMMIT`.
- **TST-003**: MUST verify standalone `files-tokens` outputs match the Python oracle, `--test-static-check` dummy or command outputs match archived fixtures, and `files-references`, `files-compress`, plus `files-find` preserve leading source tabs.
- **TST-004**: MUST verify project `tokens` outputs match the Python oracle, verify `files-static-check` plus `static-check` against archived fixtures, and verify `references`, `compress`, plus `find` preserve leading source tabs.
- **TST-005**: MUST verify the configuration menu saves `docs-dir`, `AUTO_GIT_COMMIT`, `GIT_WORKTREE_ENABLED`, and `GIT_WORKTREE_PREFIX` immediately after each change, preserves toggle ordering, and omits prompt-delivery controls plus `Save and close`.
- **TST-084**: MUST verify configuration persistence trims trailing `/` and keeps `docs-dir`, `tests-dir`, and `src-dir` relative.
- **TST-046**: MUST verify `Language static code checkers` omits module selection, raw-spec actions, supported-language reference actions, and hides `Dummy`, `Pylance`, and `Ruff` from user-configurable actions.
- **TST-077**: MUST verify `Language static code checkers` renders 20 per-language `on|off` toggle rows between `Remove static code checker` and `Reset defaults`, and persists toggle changes.
- **TST-078**: MUST verify default configuration persists documented per-language `enabled` flags and checker lists for `C`, `C++`, `Python`, `JavaScript`, and `TypeScript`.
- **TST-079**: MUST verify `files-static-check` and `static-check` execute zero checkers and expose empty configured-checker lists when the target language `enabled=disable`.
- **TST-006**: MUST verify `session_start` activates configured startup tools, resets workflow state to `idle` for `startup|new|reload`, and updates the single-line `pi-usereq` status bar.
- **TST-031**: MUST verify the status bar renders `status` before `branch`, omits `current-path`, `base`, `docs`, `src`, `tests`, `git`, and `tools`, and preserves documented field-value theme separation.
- **TST-032**: MUST verify extension registration installs wrappers for all documented lifecycle hooks and routes replayed hook payloads through `updateExtensionStatus`.
- **TST-033**: MUST verify the status bar renders ordered `status`, `branch`, `context`, `elapsed`, and `sound` fields plus the documented icon-based `context` gauge thresholds.
- **TST-037**: MUST verify the `Notifications` menu persists notification and boot-sound settings through `Notification events` and `Sound events` submenus using the documented labels, order, reset-confirmation flows, immediate-save behavior, and no `Save and close` rows.
- **TST-038**: MUST verify the sound-toggle shortcut cycles only the active runtime sound level, leaves `.pi-usereq.json` unchanged, and refreshes the status bar with the updated `sound` field.
- **TST-097**: MUST verify `session_start` loads the active runtime sound level from persisted `notify-sound`.
- **TST-098**: MUST verify menu-selected boot sound changes persist to `.pi-usereq.json` without changing the active runtime sound level.
- **TST-047**: MUST verify the `Notifications` menu exposes `Pushover events` before direct Pushover settings, keeps `Enable pushover` dimmed and locked until both credential fields are non-empty, and persists Pushover event and credential values.
- **TST-072**: MUST verify `Pushover text` displays escaped control sequences in menus and decodes the documented escape sequences from input before persistence.
- **TST-048**: MUST verify native Pushover requests honor global enable, completed/interrupted/failed Pushover toggles, credentials, priority, title, and text placeholder substitution including `%%RESULT%%` for enabled prompt-end outcomes.
- **TST-049**: MUST verify the status bar renders ordered `status`, `branch`, `context`, `elapsed`, and `sound` fields and appends `sound:<level>`.
- **TST-050**: MUST verify `PI_NOTIFY_CMD` placeholder substitution including `%%RESULT%%` and routing honor global notify enable plus completed/interrupted/failed notify toggles.
- **TST-034**: MUST verify `ctx.getContextUsage()` snapshots refresh status updates and `elapsed` preserves `⚑` plus `⌛︎` across escape-triggered cancellation.
- **TST-062**: MUST verify `Show configuration` saves pending config, closes the active configuration menu tree, and writes the persisted `.pi-usereq.json` file text into the editor.
- **TST-063**: MUST verify `⚑` plus `⌛︎` survive `session_start` reason `new` and reset on `session_start` reason `reload`.
- **TST-045**: MUST verify default configuration enables auto git commit, disables debug, notify, and Pushover globally, initializes sound to `none`, sets `DEBUG_LOG_FILE=/tmp/PI-useReq.json`, and persists the documented notify and Pushover templates.
- **TST-051**: MUST verify sound routing honors the active runtime sound state and completed/interrupted/failed sound toggles.
- **TST-035**: MUST verify unavailable or 0-percent context usage renders `▕_▏` with the same non-error theme token used by `status`.
- **TST-096**: MUST verify context usage `>0-<25`, `>=25-<50`, `>=50-<75`, and `>=75-<90` render `▕▂▏`, `▕▄▏`, `▕▆▏`, and `▕█▏` with the same non-error theme token used by `status`.
- **TST-036**: MUST verify context usage `>=90-<100` renders non-blinking error `▕█▏`, and `>=100` renders blinking error `▕█▏` or non-blinking error `▕█▏` when blink control is unavailable.
- **TST-095**: MUST verify status-bar `branch` resolves from current `context-path` git HEAD and refreshes across worktree switches plus base-path restoration.
- **TST-043**: MUST verify configuration menus reuse the active CLI settings-list theme semantics for labels, values, descriptions, cursor, and hints.
- **TST-009**: MUST verify `package.json` declares ESM packaging, the single pi extension entry, and the standard `test`, `test:watch`, and `cli` scripts.
- **TST-010**: MUST verify `tsconfig.json` declares `NodeNext`, `strict`, `noEmit`, and includes both `src/**/*.ts` and `tests/**/*.ts`.
- **TST-011**: MUST verify pi.dev-aware prompt rendering injects a governance block only when the manifest exists and that the block marks `docs/` plus `pi.dev-src/` as read-only.
- **TST-030**: MUST verify pi.dev-aware prompt rendering injects an explicit interface-contract mandate covering `docs/pi.dev/coding-agent-docs/` and documents referenced by `docs/pi.dev/agent-document-manifest.json`.
- **TST-087**: MUST verify pi.dev-aware prompt rendering requires `pi.dev-src/pi-mono` validation when manifest or `docs/pi.dev/coding-agent-docs/` guidance is ambiguous for extension-to-pi-client behavior.
- **TST-088**: MUST verify pi.dev-aware prompt rendering requires `pi.dev-src/pi-mono` validation for bug fixes or problem resolution influenced by extension-to-pi-client interface implementations.
- **TST-012**: MUST verify TypeScript CLI parity for standalone command-option regressions covering `--files-tokens`, `--files-references`, `--files-compress`, `--files-find`, `--test-static-check`, `--enable-line-numbers`, `--enable-static-check`, and `--verbose`.
- **TST-013**: MUST verify TypeScript CLI parity for project-scoped command-option regressions covering `--references`, `--compress`, `--find`, `--tokens`, `--files-static-check`, and `--static-check`.
- **TST-014**: MUST maintain an executable mapping from each imported command-option regression case to one TypeScript test case identifier and fail verification when any mapped case is missing.
- **TST-015**: MUST verify archive-backed standalone CLI scenarios load expected results from `tests/fixtures_attended_results/standalone` and compare exact normalized exit code, stdout, and stderr for every file under `tests/fixtures/`.
- **TST-016**: MUST verify archive-backed repository CLI scenarios load expected results from `tests/fixtures_attended_results/project` and compare exact normalized exit code, stdout, and stderr for the archived command set.
- **TST-017**: MUST verify every archive-backed scenario required by `REQ-042` and `REQ-043` has a committed expected-result fixture file before executing TypeScript output comparisons.
- **TST-018**: MUST verify offline harness inspection and session-start replay capture registered commands, registered tools, event handlers, active tools, statuses, notifications, editor text, and sent user messages.
- **TST-019**: MUST verify offline harness command and tool replay invoke registered handlers, preserve requested cwd semantics, and capture prompt payloads, tool results, and UI side effects.
- **TST-020**: MUST verify SDK parity comparison reports aligned inventories as clean, reports requested mismatch categories, and `package.json` declares the `debug:ext*` harness scripts.
- **TST-021**: MUST verify `scripts/pi-usereq-debug.sh tool` forwards `--params` unchanged and converts `--args` text into the JSON object forwarded through `--params`.
- **TST-022**: MUST verify `files-references` and `references` agent-tool outputs place monolithic references markdown with preserved leading tabs in `content[0].text` and restrict `details` to execution metadata.
- **TST-023**: MUST verify harness inspection surfaces `files-references` and `references` descriptions covering scope, monolithic markdown output, and failure details.
- **TST-024**: MUST verify `files-search` and `search` agent-tool outputs place monolithic search markdown with preserved leading tabs in `content[0].text` and restrict `details` to execution metadata.
- **TST-025**: MUST verify harness inspection surfaces `files-search` and `search` descriptions covering parameters, regex semantics, supported tags, monolithic markdown output, and failure details.
- **TST-026**: MUST verify `files-compress` and `compress` agent-tool outputs place monolithic compression markdown with preserved leading tabs in `content[0].text` and restrict `details` to execution metadata.
- **TST-027**: MUST verify harness inspection surfaces `files-compress` and `compress` descriptions covering parameters, line-number behavior, monolithic markdown output, and failure details.
- **TST-028**: MUST verify `files-static-check` and `static-check` agent-tool outputs place the monolithic static-check report in `content[0].text` and restrict `details` to execution metadata.
- **TST-029**: MUST verify harness inspection surfaces `files-static-check` and `static-check` descriptions covering parameters, monolithic output, selection rules, and failure details.
- **TST-039**: MUST verify `.github/workflows/release-npm.yml` keeps the existing tag filter, gates downstream release work on `origin/master`, runs npm publication, and creates the GitHub Release from generated changelog text.
- **TST-042**: MUST verify `package.json` keeps `name` equal to `pi-usereq` so npm publication resolves to `https://www.npmjs.com/package/pi-usereq`.
- **TST-044**: MUST verify `package.json` keeps npm provenance metadata aligned to the canonical GitHub repository, issues URL, and README homepage.
- **TST-040**: MUST verify `.pi-usereq.json` omits derived static and dynamic path fields while runtime path context and status rendering still derive them correctly.
- **TST-041**: MUST verify the `pi-usereq` menu uses the documented labels and order, every configuration menu ends with `Reset defaults` without right-aligned value text, dims locked git or debug rows, and preserves the documented summary rows.
- **TST-073**: MUST verify the `Debug` submenu persists `DEBUG_ENABLED`, `DEBUG_STATUS_CHANGES`, `DEBUG_WORKFLOW_EVENTS`, `DEBUG_LOG_FILE`, `DEBUG_LOG_ON_STATUS`, and per-item debug toggles through immediate-save, reset-confirmation, and focus-preserving re-render flows.
- **TST-074**: MUST verify selected custom and embedded tool debug toggles append JSON entries with tool name, workflow state, input, result, and error flag, honoring `DEBUG_ENABLED` plus `DEBUG_LOG_ON_STATUS`.
- **TST-075**: MUST verify selected `req-*` debug toggles append JSON entries for required-doc checks, worktree creation, fast-forward merge, worktree deletion, `workflow_state`, and `DEBUG_WORKFLOW_EVENTS`-gated workflow events across successful and failing prompt runs.
- **TST-076**: MUST verify Debug submenu tool and prompt rows derive from `PI_USEREQ_CUSTOM_TOOL_NAMES`, `PI_USEREQ_EMBEDDED_TOOL_NAMES`, and `PROMPT_COMMAND_NAMES`.
- **TST-085**: MUST verify the `Debug` submenu orders `Log on status` before `Status changes` and preserves the documented immediate-save plus focus-preserving re-render behavior.
- **TST-080**: MUST verify each `req-*` command description is loaded at runtime from the bundled prompt YAML `description` field.
- **TST-081**: MUST verify worktree-backed prompt execution verifies worktree registration and branch presence, switches active-session cwd, `ctx.cwd`, and `process.cwd()` to `worktree-path` before agent start, and restores them to `base-path` before session-closure handling returns.
- **TST-082**: MUST verify worktree-backed successful runs enter `running` only after prompt handoff succeeds, merge with `--ff-only` from `base-path`, and delete the worktree only after deletion verification passes.
- **TST-083**: MUST verify worktree merge failures notify the pi CLI, transition through `error`, retain the worktree checkout for manual recovery, and keep `base-path` active after session-closure handling.
- **TST-089**: MUST verify orchestrated closure succeeds when pi lifecycle event contexts omit `switchSession()`, restoring the original `base-path` session, merging successful worktree changes, and deleting the worktree plus branch.
- **TST-090**: MUST verify switch-triggered `session_shutdown` preserves the in-memory `checking|running` prompt state plus pending prompt request so the initiating runtime can still complete successful worktree closure.
- **TST-091**: MUST verify a replacement-session runtime that starts before the initiating command handler finishes the post-switch `running` transition resynchronizes persisted prompt state before prompt closure and still merges plus deletes successful worktrees.
- **TST-092**: MUST verify stale replacement-session render contexts do not throw during workflow-state updates after session replacement.
- **TST-093**: MUST verify worktree-backed prompt delivery persists `running` before an async replacement-session `sendUserMessage(...)` helper resolves, so rebound prompt closure still performs merge plus cleanup.
- **TST-094**: MUST verify successful closure restores `base-path` and merges from `base-path` even when end-of-session timing has already moved the persisted replacement-session context away from `worktree-path`.
- **TST-052**: MUST verify toggling or editing a settings entry preserves focus on the affected row when the menu re-renders.
- **TST-053**: MUST verify top-level reset restores the full menu tree and submenu reset restores only the targeted recursive subtree.
- **TST-054**: MUST verify every `req-<prompt>` command aborts when slash-command-owned git validation fails and dispatches no prompt message.
- **TST-055**: MUST verify `req-<prompt>` commands enforce the documented required-doc matrix, create no worktree, and dispatch no prompt when a required doc is missing.
- **TST-056**: MUST verify worktree-backed `req-<prompt>` commands derive `worktree-dir` from persisted `GIT_WORKTREE_PREFIX` for both default and override values.
- **TST-057**: MUST verify `req-<prompt>` commands create `worktree-path`, dispatch prompts through the replacement-session context of the switched execution session, and run tool executions against prepared `context-path`.
- **TST-058**: MUST verify worktree-backed `req-<prompt>` commands skip merge plus worktree/branch deletion, restore `base-path`, and notify pi CLI of closure failure when the matched run ends interrupted, failed, or aborted.
- **TST-061**: MUST verify `req-<prompt>` commands skip worktree creation when `AUTO_GIT_COMMIT=disable`, even if persisted `GIT_WORKTREE_ENABLED=enable`.
- **TST-064**: MUST verify worktree-backed `req-<prompt>` commands confirm created worktree directory plus branch existence before prompt dispatch and abort without dispatch when verification fails.
- **TST-067**: MUST verify `status:error` renders with blinking error styling and non-error `status` values follow the documented status-bar theme convention.
- **TST-068**: MUST verify every `req-<prompt>` command rejects non-`idle` workflow state before performing checks, worktree operations, or prompt dispatch.
- **TST-069**: MUST verify `req-<prompt>` commands transition workflow state through `checking`, `error`, and `running` for documented preflight and prompt-handoff paths.
- **TST-070**: MUST verify prompt-end handling ignores unrelated or non-success completions and performs cleanup only for the matched successful prompt.
- **TST-071**: MUST verify matched successful cleanup transitions workflow state through `merging` to `idle` and transitions to `error` on merge or deletion failure.
- **TST-065**: MUST verify default startup-tool enablement matches the documented enabled and disabled tool matrix.
- **TST-066**: MUST verify `req-<prompt>` commands keep working when extension custom-tool registrations are removed from the runtime inventory.
- **TST-059**: MUST verify every agent-tool registration defines custom `renderResult` and that compact rendering shows essential invocation parameters while expanded rendering avoids fallback raw-content display.
- **TST-086**: MUST verify `req-<prompt>` commands abort before prompt dispatch when the persisted execution-session header cwd or `process.cwd()` differs from the expected execution path, and abort before merge when persisted execution-session header metadata or verified worktree artifacts diverge, while stale pre-switch context probes alone do not abort.

## 5. Observed Component Model

### 5.1 Runtime Surfaces
- `src/cli.ts` parses CLI flags, repairs config for project-scoped commands, and dispatches to `tool-runner.ts` or `runStaticCheck`.
- `src/index.ts` activates the pi extension, registers commands and agent tools, and manages interactive menu/status behavior through `ctx.ui`.
- `src/core/tool-runner.ts` orchestrates project file collection, markdown generation, compression, construct search, and static-check execution.
- `src/core/source-analyzer.ts` defines `SourceElement`, language specs, extraction heuristics, Doxygen attachment, and Markdown rendering support.
- `src/core/generate-markdown.ts`, `src/core/compress.ts`, and `src/core/find-constructs.ts` share analyzer and compressor logic to produce reusable Markdown outputs.
- `src/core/static-check.ts` maps languages/extensions, parses Command-only enable specs, preserves debug `Dummy` handling, resolves inputs, and dispatches modular checker classes.
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
- `git` CLI is a runtime dependency for repository discovery, source-file collection, and prompt-command worktree orchestration evidence in `src/core/tool-runner.ts` plus `src/core/prompt-command-runtime.ts`.

### 5.3 Packaging and Tooling Surface
- `package.json` declares `type: "module"`, `pi.extensions: ["./src/index.ts"]`, and the scripts `test`, `test:watch`, `cli`, `debug:ext`, `debug:ext:inspect`, `debug:ext:session`, `debug:ext:command`, `debug:ext:tool`, and `debug:ext:sdk`.
- `tsconfig.json` declares `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noEmit: true`, `skipLibCheck: true`, `resolveJsonModule: true`, and `types: ["node"]`.
- `.github/workflows/release-npm.yml` validates canonical release tags, publishes the package to npm, and creates the matching GitHub Release.
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
│   ├── release-workflow.test.ts
│   └── fixtures/{fixture_c.c,fixture_cpp.cpp,fixture_csharp.cs,fixture_elixir.ex,fixture_go.go,fixture_haskell.hs,fixture_java.java,fixture_javascript.js,fixture_kotlin.kt,fixture_lua.lua,fixture_perl.pl,fixture_php.php,fixture_python.py,fixture_rust.rs,fixture_scala.scala,fixture_shell.sh,fixture_swift.swift,fixture_typescript.ts,fixture_zig.zig}
├── req/docs/
├── scripts/
│   ├── debug-extension.ts
│   ├── pi-usereq-debug.sh
│   └── lib/{extension-debug-harness.ts,recording-extension-api.ts,sdk-smoke.ts}
├── .github/
│   ├── workflows/
│   │   └── release-npm.yml
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
- `tests/extension-registration.test.ts` covers extension registration, config-menu persistence, startup-tool enablement, static-check menu mutation flows, and prompt-command worktree orchestration.
- `tests/prompt-rendering.test.ts` covers home-resource synchronization and placeholder replacement in rendered prompts.
- `tests/oracle-standalone.test.ts` compares non-tab-sensitive standalone `files-*` outputs against the Python `usereq.cli` oracle, asserts Go-fixture tab preservation, and compares `--test-static-check` dummy/command outputs against archived fixtures.
- `tests/oracle-project.test.ts` compares non-tab-sensitive project commands against the Python oracle, asserts Go-source tab preservation for project extraction commands, and verifies archived `files-static-check` plus `static-check` outputs.
- `tests/release-workflow.test.ts` verifies semver-tag gating, npm publication steps, and GitHub release creation directives in `.github/workflows/release-npm.yml`.
- Test business logic focuses on parity with the Python oracle, persistent config mutation, startup-tool activation, prompt-command worktree lifecycle correctness, and npm release workflow structure.

## 8. Evidence Matrix

### 8.1 PRJ and CTN Evidence
| ID | Evidence |
| --- | --- |
| PRJ-001 | `src/index.ts` :: `registerPromptCommands` :: `pi.registerCommand(\`req-${promptName}\`, ...)`; `src/core/prompts.ts` :: `renderPrompt` :: `return adaptPromptForInternalTools(applyReplacements(prompt, replacements));` |
| PRJ-002 | `src/index.ts` :: `registerAgentTools` :: tool names include `files-tokens`, `references`, `compress`, `search`, `files-static-check`, and `static-check`. |
| PRJ-003 | `src/index.ts` :: `buildPiUsereqMenuChoices`, `configurePiUsereq`, and `configureDebugMenu` :: expose project paths, git automation, static-check, startup tools, notifications, and debug logging controls. |
| PRJ-004 | `src/core/prompt-command-runtime.ts` :: `validatePromptGitState`, `buildPromptWorktreeName`, `createPromptWorktree`, and `finalizePromptCommandExecution` :: slash-command-owned git validation plus worktree orchestration remain internal to prompt execution. |
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
| CTN-013 | `src/core/config.ts` :: `getDefaultConfig` and `loadConfig`; `src/core/debug-runtime.ts` :: `DEFAULT_DEBUG_WORKFLOW_EVENTS` and `normalizeDebugWorkflowEvents` :: default and normalize the persisted debug configuration including `DEBUG_WORKFLOW_EVENTS`. |

### 8.2 DES Evidence
| ID | Evidence |
| --- | --- |
| DES-001 | `src/cli.ts` :: `parseArgs` and `main` :: parses flags then dispatches with branches such as `runReferences`, `runCompress`, `runSearch`, `runProjectStaticCheck`, and `runStaticCheck`. |
| DES-002 | `src/index.ts` :: `piUsereqExtension` :: calls `registerPromptCommands`, `registerToolWrapperCommands`, `registerAgentTools`, `registerConfigCommands`, then installs `pi.on("session_start", ...)`. |
| DES-003 | `src/core/source-analyzer.ts` :: `class SourceElement`; `SourceAnalyzer.enrich` :: invokes `extractSignatures`, `detectHierarchy`, `extractVisibility`, `extractInheritance`, `extractBodyAnnotations`, and `extractDoxygenFields`. |
| DES-004 | `src/core/static-check.ts` :: `StaticCheckBase` and `StaticCheckCommand`; `dispatchStaticCheckForFile` switch selects the modular implementation by module name. |
| DES-005 | `src/core/tool-runner.ts` :: exports `runFilesTokens`, `runReferences`, `runCompress`, `runSearch`, `runFilesStaticCheck`, and `runProjectStaticCheck`. |
| DES-006 | `src/core/compress.ts` :: `normalizeRetainedLineIndentation`; `src/core/source-analyzer.ts` :: `normalizeSourceLineForExtraction`; `src/core/compress-files.ts` and `src/core/find-constructs.ts` reuse shared markdown emitters with preserved source tabs. |
| DES-011 | `.github/workflows/release-npm.yml` :: release jobs validate semver tags and `origin/master`, publish with npm authentication, and create the GitHub Release. |

### 8.3 REQ Evidence
| ID | Evidence |
| --- | --- |
| REQ-001 | `src/core/resources.ts` :: `copyDirectoryContents` :: skips dotfiles, recurses into directories, and uses `fs.copyFileSync(sourcePath, destinationPath)`. |
| REQ-002 | `src/core/config.ts` :: `buildPromptReplacementPaths` :: emits `%%TEMPLATE_PATH%%` plus docs/guideline/source/test tokens; `src/core/prompts.ts` :: `renderPrompt` merges them with `"%%ARGS%%": args`. |
| REQ-003 | `src/core/prompts.ts` :: `TOOL_REFERENCE_REPLACEMENTS` and `adaptPromptForInternalTools` :: replaces ``req --find`` style text with `search tool` style text. |
| REQ-004 | `src/index.ts` :: `registerPromptCommands` :: each handler runs `ensureHomeResources()`, renders the prompt, then executes `pi.sendUserMessage(content)`. |
| REQ-005 | `src/index.ts` :: `runToolCommand`, `formatResultForEditor`, `showToolResult` :: writes combined output into the editor and notifies `completed` or `failed`. |
| REQ-006 | `src/index.ts` :: `buildPiUsereqMenuChoices` and `configurePiUsereq` :: expose directories, git automation, static-check, tools, notifications, debug settings, reset, save, and `Show configuration`. |
| REQ-236 | `src/core/config.ts` :: `getDefaultConfig`, `loadConfig`, and `buildPersistedConfig` :: persist `DEBUG_ENABLED` with default `disable`. |
| REQ-237 | `src/core/config.ts` :: `getDefaultConfig`, `loadConfig`, and `buildPersistedConfig`; `src/core/debug-runtime.ts` :: `resolveDebugLogPath` :: persist `DEBUG_LOG_FILE` and resolve relative paths against the original project base. |
| REQ-238 | `src/core/config.ts` :: `getDefaultConfig`, `loadConfig`, and `buildPersistedConfig`; `src/index.ts` :: `configureDebugMenu` :: persist and edit `DEBUG_LOG_ON_STATUS`. |
| REQ-239 | `src/core/config.ts` :: `getDefaultConfig`, `loadConfig`, and `buildPersistedConfig`; `src/core/debug-runtime.ts` :: `normalizeDebugEnabledTools`, `normalizeDebugEnabledPrompts` :: persist normalized debug selector arrays. |
| REQ-240 | `src/index.ts` :: `buildDebugMenuChoices` and `configureDebugMenu` :: render `Debug`, `Log file`, `Log on status`, `Status changes`, `Workflow events`, tool toggles, prompt toggles, and terminal rows. |
| REQ-241 | `src/index.ts` :: `buildDebugMenuChoice` :: dims and disables non-`Debug` submenu rows while global debug is off. |
| REQ-242 | `src/index.ts` :: `getDebugToolToggleNames` and `buildDebugMenuChoices`; `src/core/debug-runtime.ts` :: `normalizeDebugEnabledTools` :: derive tool debug rows from canonical tool inventories. |
| REQ-243 | `src/core/prompt-command-catalog.ts` :: `PROMPT_COMMAND_NAMES`; `src/core/debug-runtime.ts` :: `DEBUG_PROMPT_NAMES`; `src/index.ts` :: `buildDebugMenuChoices` :: derive prompt debug rows as `req-*` names. |
| REQ-244 | `src/core/debug-runtime.ts` :: `logDebugToolExecution`; `src/index.ts` :: `handleExtensionStatusEvent` :: append selected tool debug entries with workflow state, input, result, and error flag. |
| REQ-245 | `src/core/debug-runtime.ts` :: `logDebugPromptEvent` and `logDebugPromptWorkflowEvent`; `src/core/prompt-command-runtime.ts` :: required-doc, worktree, and closure helpers; `src/index.ts` :: workflow-state and closure logging :: append selected prompt debug entries. |
| REQ-246 | `src/core/debug-runtime.ts` :: `shouldLogDebugTool`, `shouldLogDebugPrompt`, and `shouldLogDebugPromptWorkflowEvent` :: suppress all debug writes when `DEBUG_ENABLED=disable`. |
| REQ-277 | `src/core/config.ts` :: `getDefaultConfig`, `loadConfig`, and `buildPersistedConfig`; `src/index.ts` :: `configureDebugMenu` :: persist and edit `DEBUG_WORKFLOW_EVENTS`. |
| REQ-276 | `src/core/prompt-command-runtime.ts` :: persisted session-context reuse plus restoration helpers; `src/index.ts` :: closure handling over lifecycle event contexts without `switchSession()` :: keep closure attached to the original base session. |
| REQ-278 | `src/core/extension-status.ts` :: `shouldPreservePromptCommandStateOnShutdown` and `updateExtensionStatus`; `src/index.ts` :: pre-shutdown preservation-aware workflow logging :: keep in-memory prompt state intact across switch-triggered shutdown. |
| REQ-279 | `src/core/extension-status.ts` :: `updateExtensionStatus` and prompt-state resynchronization helpers :: refresh the replacement-session controller from persisted prompt state on post-switch lifecycle hooks. |
| REQ-280 | `src/core/extension-status.ts` :: stale-context-safe `renderPiUsereqStatus`; `src/index.ts` :: `notifyContextSafely` :: suppress stale replacement-context errors during closure-facing renders and notifications. |
| REQ-281 | `src/index.ts` :: `deliverPromptCommand` and `registerPromptCommands` :: transition to `running` immediately after prompt handoff starts instead of waiting for async prompt completion. |
| REQ-282 | `src/core/prompt-command-runtime.ts` :: `verifyPromptCommandClosureArtifacts` and `finalizePromptCommandExecution` :: merge from restored `base-path` using persisted execution metadata plus worktree artifacts without requiring worktree-session reactivation at prompt end. |
| REQ-247 | `src/core/debug-runtime.ts` :: `matchesDebugWorkflowState`, `shouldLogDebugTool`, and `shouldLogDebugPrompt` :: gate debug writes by `DEBUG_LOG_ON_STATUS`. |
| REQ-007 | `src/index.ts` :: `configurePiUsereqToolsMenu` :: choices include `Enable tools`, `Enable all`, `Disable all`, and `Reset defaults`. |
| REQ-008 | `src/index.ts` :: `configureStaticCheckMenu` :: supports Command-only guided addition, configured-language removal, and reset-only static-check management. |
| REQ-160 | `src/index.ts` :: `buildStaticCheckMenuChoices` and `configureStaticCheckMenu` :: omit user-facing module selection and hardcode `Command` for guided additions. |
| REQ-161 | `src/core/static-check.ts` :: `dispatchStaticCheckForFile` and `runStaticCheck` :: keep `Dummy` only for existing config entries and the debug driver. |
| REQ-009 | `src/index.ts` :: `pi.on("session_start", ...)` :: calls `ensureHomeResources()`, `applyConfiguredPiUsereqTools`, and `ctx.ui.setStatus(...)`. |
| REQ-010 | `src/core/token-counter.ts` :: `new TokenCounter("cl100k_base")`; `formatPackSummary`; `src/core/tool-runner.ts` :: `runFilesTokens` validates files and returns summary plus warnings. |
| REQ-011 | `src/core/tool-runner.ts` :: `runFilesReferences` :: returns `generateMarkdown(...)`; `src/core/source-analyzer.ts` :: `formatMarkdown` renders source-derived lines with preserved leading tabs. |
| REQ-012 | `src/core/compress.ts` :: `INDENT_SIGNIFICANT`, `normalizeRetainedLineIndentation`, and `compressSourceDetailed` :: preserve full indentation for indentation-significant languages and preserve leading tabs for other languages. |
| REQ-013 | `src/core/find-constructs.ts` :: `searchConstructsInFiles` and `formatConstruct` :: filters by tags/regex and emits signature, lines, Doxygen bullets, and stripped code with preserved leading tabs. |
| REQ-014 | `src/core/tool-runner.ts` :: `runReferences` :: prepends file structure and returns `generateMarkdown(...)`; `src/core/source-analyzer.ts` :: `formatMarkdown` preserves source-derived leading tabs. |
| REQ-015 | `src/core/tool-runner.ts` :: `runCompress` :: collects configured project files then returns `compressFiles(files, enableLineNumbers, verbose, base)`. |
| REQ-016 | `src/core/tool-runner.ts` :: `runSearch` :: collects configured project files and executes `searchConstructsInFiles(files, tagFilter, pattern, ...)`. |
| REQ-017 | `src/core/tool-runner.ts` :: `runTokens` :: `canonicalNames = ["REQUIREMENTS.md", "WORKFLOW.md", "REFERENCES.md"]` and fails if no canonical docs exist. |
| REQ-018 | `src/cli.ts` :: `if (args.testStaticCheck) return runStaticCheck(args.testStaticCheck)`; `src/core/static-check.ts` :: `runStaticCheck` supports `dummy` and `command`. |
| REQ-019 | `src/core/tool-runner.ts` :: `runFilesStaticCheck` :: resolves extension via `STATIC_CHECK_EXT_TO_LANG`, iterates configured checkers, and calls `dispatchStaticCheckForFile(..., { failOnly: true })`. |
| REQ-020 | `src/core/static-check.ts` :: `parseEnableStaticCheck` :: parses `LANG=Command,CMD[,PARAM...]`, canonicalizes language names, and builds `StaticCheckEntry`. |
| REQ-021 | `src/core/static-check.ts` :: `parseEnableStaticCheck` :: explicit `ReqError` branches reject missing `=`, missing `Command`, missing `cmd`, unknown language, and non-Command modules. |
| REQ-022 | `src/core/config.ts` :: `loadConfig` preserves persisted entries; `src/core/static-check.ts` :: `dispatchStaticCheckForFile` and `runStaticCheck` keep `Dummy` available only for existing config or debug-driver use. |
| REQ-023 | `src/core/static-check.ts` :: `StaticCheckCommand` constructor :: `if (!findExecutable(cmd)) throw new ReqError(...)`. |
| REQ-030 | `src/index.ts` :: `loadProjectConfig` :: resolves the project base from cwd and normalizes the loaded config without persisting runtime-derived path metadata. |
| REQ-031 | `src/index.ts` :: `registerConfigCommands` :: `pi-usereq-show-config` writes `JSON.stringify(config, null, 2)` into the editor. |
| REQ-138 | `.github/workflows/release-npm.yml` :: `on.push.tags` plus release-tag validation restrict automation to canonical `v<major>.<minor>.<patch>` tags. |
| REQ-139 | `.github/workflows/release-npm.yml` :: branch-check job fetches `origin/master` and gates downstream jobs on containment of `github.sha`. |
| REQ-140 | `.github/workflows/release-npm.yml` :: publish job uses `actions/setup-node`, `npm ci`, `npm pkg delete private`, and `npm publish --provenance` with `NODE_AUTH_TOKEN`. |
| REQ-141 | `.github/workflows/release-npm.yml` :: release job uses changelog-builder output as `softprops/action-gh-release` body with non-draft and non-prerelease flags. |

### 8.4 TST Evidence
| ID | Evidence |
| --- | --- |
| TST-001 | `tests/extension-registration.test.ts` :: `extension registers all required prompt commands, tool wrappers, and agent tools` validates command and tool registration sets. |
| TST-002 | `tests/prompt-rendering.test.ts` :: `embedded resources are copied ...` and `prompt rendering replaces all dynamic placeholders ...`. |
| TST-003 | `tests/oracle-standalone.test.ts` :: preserves Python-oracle coverage for non-tab-sensitive fixtures, asserts Go-fixture tab preservation for `files-references`, `files-compress`, and `files-find`, and keeps archived `test-static-check` coverage. |
| TST-004 | `tests/oracle-project.test.ts` :: preserves Python-oracle coverage for non-tab-sensitive project fixtures, asserts Go-source tab preservation for `references`, `compress`, and `find`, and keeps archived static-check coverage. |
| TST-005 | `tests/extension-registration.test.ts` :: `configuration menu saves updated docs-dir`, `configuration menu can disable ... tools`, and `configuration menu can add guided static-check entries ...`. |
| TST-046 | `tests/extension-registration.test.ts` :: `configuration menu hides removed static-check modules from user-facing actions`. |
| TST-073 | `tests/extension-registration.test.ts` :: `debug menu dims locked rows and persists debug settings with focus-preserving re-renders` validates `DEBUG_WORKFLOW_EVENTS` alongside the existing Debug fields. |
| TST-075 | `tests/extension-registration.test.ts` :: `prompt debug logging captures failing and successful prompt orchestration entries` validates `DEBUG_WORKFLOW_EVENTS`-gated workflow event actions alongside required-doc, worktree, merge, delete, and `workflow_state` entries. |
| TST-089 | `tests/extension-registration.test.ts` :: `worktree-backed closure succeeds when agent_end lifecycle contexts omit switchSession` simulates CLI event contexts without session-switch methods and verifies restore, merge, and cleanup. |
| TST-090 | `tests/extension-registration.test.ts` :: `switch-triggered session_shutdown preserves prompt state for same-runtime workflow closure` reproduces the logged shutdown ordering and verifies preserved workflow state, merge, and cleanup. |
| TST-091 | `tests/extension-registration.test.ts` :: `replacement-session runtime resynchronizes persisted running state before prompt closure` verifies rebinding before the post-switch `running` transition still leads to merge and cleanup. |
| TST-092 | `tests/extension-registration.test.ts` :: `stale replacement contexts do not break workflow-state rendering` verifies stale replacement-session render contexts are ignored without throwing. |
| TST-093 | `tests/extension-registration.test.ts` :: `replacement-session prompt delivery persists running before async sendUserMessage resolves` verifies async prompt-delivery completion does not delay merge-eligible `running` state. |
| TST-094 | `tests/extension-registration.test.ts` :: `worktree-backed closure merges from base-path when end-of-session timing already moved the persisted context` verifies closure merges successfully without worktree-session reactivation. |
| TST-006 | `tests/extension-registration.test.ts` :: `session_start applies configured pi-usereq startup tools`. |
| TST-009 | `package.json` :: `"type": "module"`, `"pi": { "extensions": ["./src/index.ts"] }`, and `"scripts"` entries for `test`, `test:watch`, and `cli`. |
| TST-010 | `tsconfig.json` :: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"strict": true`, `"noEmit": true`, and `"include": ["src/**/*.ts", "tests/**/*.ts"]`. |
| TST-022 | `tests/extension-registration.test.ts` :: `source-extraction agent tools preserve leading tabs in emitted content` plus the explicit `files-references` and `references` monolithic-output tests. |
| TST-023 | `tests/extension-registration.test.ts` :: `reference tools register agent-oriented descriptions and schema details`. |
| TST-024 | `tests/extension-registration.test.ts` :: `source-extraction agent tools preserve leading tabs in emitted content` plus the explicit `files-search` and `search` monolithic-output tests. |
| TST-026 | `tests/extension-registration.test.ts` :: `source-extraction agent tools preserve leading tabs in emitted content` plus the explicit `files-compress` and `compress` monolithic-output tests. |
| TST-039 | `tests/release-workflow.test.ts` :: workflow-content assertions cover semver gating, `origin/master` containment, npm publication, and GitHub release generation. |

## 9. Performance Notes
No explicit performance optimizations identified.
