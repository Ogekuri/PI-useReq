> [!CAUTION]
> ### 🚨 STRICTLY EXPERIMENTAL — PROOF OF CONCEPT (PRE-ALPHA)
> 
> ![Status: Proof of Concept](https://img.shields.io/badge/Status-Proof_of_Concept-red?style=flat-square) ![Stage: Pre-Alpha](https://img.shields.io/badge/Stage-Pre--Alpha-critical?style=flat-square) ![Maintenance: Personal Use Only](https://img.shields.io/badge/Scope-Personal_Use_Only-important?style=flat-square) ![Issues: Closed](https://img.shields.io/badge/Issues_%26_PRs-Not_Accepted-inactive?style=flat-square)
>
> **PLEASE READ CAREFULLY BEFORE USING THIS SOFTWARE:**
> 
> * **Very Early Stage:** This project is currently a raw **Proof of Concept (PoC)** in a **pre-alpha** state. It is nowhere near production-ready and may contain severe bugs, breaking changes, or incomplete logic.
> * **Personal Use Only:** This repository is developed, maintained, and shared strictly for **personal use**. 
> * **No Support or Feature Requests:** Please **do not** open issues, bug reports, or feature requests. They will not be addressed or accepted at this stage of development.
> * **No Warranty:** This software is provided **"AS IS"**, without warranty of any kind, express or implied. You may use it strictly for **testing and evaluation purposes** at your own sole risk.

# PI-useReq/pi-usereq (0.109.10)

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js >= 24">
  <img src="https://img.shields.io/badge/typescript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <img src="https://img.shields.io/badge/license-GPL--3.0--only-491?style=flat-square" alt="License: GPL-3.0-only">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6A7EC2?style=flat-square&logo=terminal&logoColor=white" alt="Platforms">
  <img src="https://img.shields.io/badge/docs-live-b31b1b" alt="Docs">
</p>

<p align="center">
<strong>pi-usereq is a pi extension that runs a requirements-first development workflow.</strong><br>
It turns a User Request into a living <em>Software Requirements Specification</em> (SRS), implements the corresponding
source code, and keeps the project documentation (<code>WORKFLOW.md</code>, <code>REFERENCES.md</code>, <code>FLOWCHART.md</code>, <code>README.md</code>)
in sync with the repository. All capabilities are exposed as slash commands and agent tools inside
<a href="https://pi.dev"><strong>pi</strong></a> (<code>pi-coding-agent</code> 1.5.2+).
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#requirements">Requirements</a> |
  <a href="#feature-highlights">Feature Highlights</a> |
  <a href="#prompts-and-agents">Prompts and Agents</a> |
  <a href="#default-workflow">Default Workflow</a> |
  <a href="#install-uninstall">Install/Uninstall</a> |
  <a href="#extension-usage">Extension Usage</a> |
  <a href="#note-on-git-usage">Note on Git usage</a>
</p>
<p align="center">
<br>
🚧 <strong>DRAFT:</strong> Proof-of-Concept (PoC) Version 📝 - Work in Progress 🏗️ 🚧<br>
⚠️ <strong>IMPORTANT NOTICE</strong>: Created with <a href="https://www.npmjs.com/package/pi-usereq"><strong>PI-useReq/pi-usereq</strong></a> 🤖✨ ⚠️<br>
<br>
</p>


## Quick Start

1. **Install the extension** (see [Install](#install)) and restart pi.
2. **Configure the project** (optional): run `/pi-usereq` to set the documentation directory, unit-tests directory, source directories, static code checkers, enabled tools, git automation, and notifications.
3. **Write the requirements**: run `/req-write <User Request>` to produce a first SRS draft, or `/req-create` to derive the SRS from the existing source code.
4. **Implement the source code**: run `/req-implement` to build the source from the requirements, or `/req-cover` to make the minimal changes that cover uncovered requirements.
5. **Update the documentation**: run `/req-workflow`, `/req-flowchart`, and/or `/req-references` to regenerate the project documentation from the source; `/req-readme` keeps this file aligned with the implementation.
6. **Iterate**: use `/req-change`, `/req-new`, `/req-fix`, `/req-refactor`, and `/req-check` to evolve requirements and code together.
7. **Recover** (if a run fails or is interrupted): run `/req-reset` to restore the original base path and remove generated worktrees and branches.


## Requirements

- **Node.js** - 24.0.0 or newer, per the `engines` constraint in `package.json`.
- **pi CLI** (`pi.dev`) - the extension runs inside pi; requires `@earendil-works/pi-coding-agent` 1.5.2 or newer. A resolvable older host version surfaces one warning notification while the extension keeps working.
- **Git repository** - every `req-*` slash command except the non-agentic `/req-reset` runs slash-command-owned git validation: the project must be inside a git work tree, the tracked working tree must be clean, and `HEAD` must resolve (a detached `HEAD` is tolerated; a working branch is recommended because the branch name is embedded in generated worktree names).
- **Requirements documentation** - the configured `docs-dir` (default `usereq/docs`) must contain the canonical documents required by the executed commands (`REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md`); the command table below lists each command's requirement, and `/req-write`, `/req-create`, `/req-workflow`, and `/req-references` are the entry points that generate them.
- **Static code checkers** - the bundled checkers (`pyright`, `ruff`, `eslint`) install best-effort through the `postinstall` script; the native C/C++ checkers (`cppcheck`, `clang-format`) require a one-line system install (see [Install](#install)). Default configured languages: C, C++, JavaScript, Python, TypeScript.
- **Models** - model selection and model configuration are managed by the pi client, not by pi-usereq: the extension bundles no model files and exposes no model-related configuration or management surface (custom providers and models are configured in the pi client, e.g. `~/.pi/agent/models.json`, and selected through its model picker). The extension is model-agnostic: it captures the active provider, model id, and thinking level at command start and re-applies them after a worktree session switch and after `/req-reset`.


## Feature Highlights

- **17 slash commands** - 15 prompt-backed `req-*` commands plus the dedicated non-agentic `/req-references` and `/req-reset` commands.
- **11 built-in agent tools** - token counting, summarization, compression, construct search, and static-check tools for explicit files or for the configured project surface.
- **Interactive configuration menu** - `/pi-usereq` manages local (`<base-path>/.pi-usereq.json`) and global (`~/.config/pi-usereq/config.json`) configuration with no manual JSON editing required.
- **Standalone management and configuration CLI** - the `pi-usereq` bin exposes `--help`, `--ver`/`--version`, `--upgrade [--dev|--develop] [--force]`, `--uninstall`, plus `--get`/`--set`/`--unset`/`--print`/`--info`/`--print-raw` over the same local and global scopes (see [Standalone CLI](#standalone-cli-pi-usereq)).
- **Worktree-isolated runs** - prompt-command executions run in an isolated git worktree (created with `<prefix><project>-<branch>-<YYYYMMDDHHMMSS>` names) and are merged back with a stash-assisted fast-forward only when the final agent output carries the exact `STATUS: OK` marker; `STATUS: ERROR` and missing-marker runs retain the worktree in `error` and `warning` respectively.
- **Automatic commit guidance** - `AUTO_GIT_COMMIT=enable` (default) injects structured commit instructions (`<TYPE>(<COMPONENT>)<BREAKING>: <DESCRIPTION> [useReq]`) into every prompt; disabling it forces read-only git behavior and turns worktree orchestration off.
- **Notifications** - desktop notify command, sound effects (levels `none`/`low`/`mid`/`high`, default `alt+s` toggle) and Pushover push messages on prompt completion, interruption, or failure.
- **Runtime status bar** - the extension renders its workflow state, current branch, context usage, elapsed time, and sound level in the pi status line.
- **Context-occupancy guardrails** - the `Context Files` settings row and every command invocation summary show the measured `[<percent>% context]` occupancy of the enabled context files against the selected model's max input context (or the documented 1,000,000-token fallback); prompt dispatch is aborted before worktree creation when the enabled context files exceed that limit.
- **Debug surface** - config-gated `debug-*` slash commands and a standalone debug harness (`scripts/debug-extension.ts`, `scripts/pi-usereq-debug.sh`) for offline inspection and replay.


## Prompts and Agents

Each `/req-<name>` command is invoked inside pi as `/req-<name> [<User Request>]`. Prompt commands first run git validation and the
prompt-specific required-document checks, then (when `Auto git commit` and `Git worktree` are enabled) switch the session into an
isolated worktree, render the bundled prompt with the project context, and on success merge the changes back and leave the
repository clean. Merge and worktree deletion run only when the final agent output contains the exact `STATUS: OK` marker:
`STATUS: ERROR` parks the workflow in `error`, and a missing marker parks it in `warning`, both retaining the worktree for
`/req-reset` recovery. Every prompt-backed `req-*` command prints an on-screen invocation summary (command name, passed arguments, and active
configuration); the full rendered prompt content is delivered only to the LLM agent and is never displayed on screen.
`/req-references` and `/req-reset` are non-agentic: they execute directly without starting an LLM session or
creating a worktree.

> **Clean context between commands** — every `/req-*` orchestration keeps the session context content in place when it
> completes, so a subsequent command continues with the retained transcript. It is therefore recommended to start a new
> session with a clean context (run `/new`, pi's `Start a new session` action) before each new `/req-*` command, unless you
> actually need to keep the previous context (for example when the next command builds on the outputs of the previous one).
> At the end of every successful orchestration the extension emits an info notification stating that the context was retained,
> recommending `/new`, and appending the current context-usage percentage when available.

> **Recommended context for analysis** — for the most effective analysis it is recommended to place the requirements,
> reference, and workflow documents in the prompt context by enabling the `Context Files` toggles for `REQUIREMENTS.md`,
> `REFERENCES.md`, and `WORKFLOW.md` (the settings-menu row then reads `Context Files  requirements:on (<chars>c/<tokens>t) • references:on (<chars>c/<tokens>t) • workflow:on (<chars>c/<tokens>t) [<percent>% context]`).
> The enabled canonical documents are injected into every bundled prompt through `%%CONTEXT_FILES%%`, so the agent analyzes
> the requirements, the reference index, and the workflow documentation together with the source code. When at least one
> context file is enabled, the measured occupancy is reported as a `[<percent>% context]` suffix whenever at least one enabled
> context file exists and contributes tokens, and prompt dispatch aborts
> before worktree creation if the enabled context files exceed the selected model's max input context (or the 1,000,000-token fallback).

| Command | Description | Required docs |
| --- | --- | --- |
| `/req-write` | Produce a *SRS* draft based on the User Request description | none |
| `/req-create` | Write a *Software Requirements Specification* using the project's source code | none |
| `/req-recreate` | Reorganize and update the *Software Requirements Specification* based on source code analysis (preserve requirement IDs) | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-renumber` | Deterministically renumber requirement IDs in the *Software Requirements Specification* without changing requirement text or order | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-analyze` | Produce an analysis report | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-change` | Update the requirements and implement the corresponding changes | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-check` | Run the requirements check | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-cover` | Implement minimal changes to cover uncovered existing requirements | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-fix` | Fix a defect without changing the requirements | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-implement` | Implement source code from requirements from scratch | `REQUIREMENTS.md` |
| `/req-new` | Implement a new requirement and the corresponding source code changes | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-refactor` | Perform a refactor without changing the requirements | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-readme` | Write `README.md` from user-visible implementation evidence | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-references` | Write a `REFERENCES.md` using the project's source code (non-agentic, commits the regenerated file) | none |
| `/req-workflow` | Write a `WORKFLOW.md` using the project's source code | none |
| `/req-flowchart` | Write a `FLOWCHART.md` using the project's source code | `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md` |
| `/req-reset` | Reset the req workflow state, restore the base path, and remove generated worktrees and branches (non-agentic) | none |

Bundled prompts substitute project-derived values through `%%` placeholders, including `%%SRC_PATHS%%` (configured source directories), `%%ARGS%%` (command arguments), `%%PROMPT%%` (command name), `%%COMMIT%%` (git commit or read-only instruction), and `%%CONTEXT_FILES%%` (the canonical docs, when the corresponding context-file toggles are enabled in the settings menu).


## Default Workflow

Click to zoom flowchart image.

[![Flowchart](https://raw.githubusercontent.com/Ogekuri/PI-useReq/refs/heads/master/images/flowchart-bw.svg)](https://raw.githubusercontent.com/Ogekuri/PI-useReq/refs/heads/master/images/flowchart-bw.svg)


## Project's Documentation

### Project's Tree

```text
.
├── .pi-usereq.json              # local project configuration (auto-generated)
├── usereq/                      # configured docs-dir (default)
│   └── docs/
│       ├── REQUIREMENTS.md      # Software Requirements Specification (SRS)
│       ├── WORKFLOW.md          # runtime/execution units and call traces
│       ├── REFERENCES.md        # symbol index generated from the source
│       └── FLOWCHART.md         # workflow flowchart (generated on demand)
├── src/                         # source code
├── tests/                       # unit tests suite
├── scripts/                     # release/build gate, debug harness, launcher, checker installer
├── images/                      # project assets (flowchart, logo)
└── ~/.config/pi-usereq/         # global configuration (outside the repo)
    └── config.json              # cross-project settings (checkers, git, notifications)
```

The documentation directory, unit-tests directory, and source directories are configurable via the
[settings menu](#extension-usage) (defaults: `usereq/docs`, `tests`, `src`).


## Install/Uninstall

### Install

Install the extension package with the pi CLI:

```bash
pi install npm:pi-usereq
```

Or install it directly from the git repository:

```bash
pi install git:github.com/Ogekuri/PI-useReq
```

Reload pi (restart the session).

On pi-package installations (npm or git source, user scope or project scope) the extension also deploys a best-effort
`pi-usereq` launcher symlink in the pi agent bin directory (`~/.pi/agent/bin` by default, honoring `PI_CODING_AGENT_DIR`)
targeting the packaged `scripts/pi-usereq.js`, plus one additional `~/bin/pi-usereq` link when the `~/bin` directory already
exists. Existing links resolving to the current target are left untouched, divergent symlinks are replaced, and foreign
non-symlink entries are never overwritten. If the same package ends up installed twice from different pi-managed sources,
only one installation activates: the duplicate skips registration instead of emitting per-tool conflict diagnostics.

Bundled static checkers (`pyright`, `ruff`, `eslint`) install best-effort via the `postinstall` script. Native checkers (`cppcheck`, `clang-format`) require a one-line system install:

- Debian/Ubuntu: `sudo apt install cppcheck clang-format`
- macOS: `brew install cppcheck clang-format`
- Arch: `sudo pacman -S cppcheck clang`
- Windows: `choco install cppcheck llvm` or `scoop install cppcheck llvm`

### Uninstall

Remove the extension package with the pi CLI (use the same source you installed from):

```bash
pi remove npm:pi-usereq
```

Or, if it was installed from git:

```bash
pi remove git:github.com/Ogekuri/PI-useReq
```

Or, for a global npm installation, run the management CLI, which removes the global npm package and the deployed launcher links:

```bash
pi-usereq --uninstall
```

Then reload pi. Optionally delete the persisted configuration files: the global `~/.config/pi-usereq/config.json`
and the project-local `.pi-usereq.json` files.


## Extension Usage

> The bulk of the extension capabilities are covered by the [Prompts and Agents](#prompts-and-agents) table; this section documents the tools, the standalone CLI, the settings menu, and the side features.

### Extension Custom Tools

The extension registers the following agent tools (available to the LLM inside pi). All parameters are exposed through the pi tool-call contract; `FILE` entries may be project-relative or absolute paths. Optional `enableLineNumbers` adds `<n>:` line prefixes to compressed/search output.

- Count tokens and chars for the given files
  `files-tokens FILE [FILE ...]`

- Generate LLM summary markdown for the given files
  `files-summarize FILE [FILE ...]`

- Generate compressed output for the given files
  `files-compress FILE [FILE ...] [enableLineNumbers]`

- Find and extract specific constructs from the given files
  `files-search TAG PATTERN FILE [FILE ...] [enableLineNumbers]`

- Run static analysis on the given files using the checkers configured for their extensions
  `files-static-check FILE [FILE ...]`

- Count tokens and chars for the canonical docs in the configured `docs-dir` (`REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md`)
  `tokens`

- Generate LLM summary markdown for the configured `src-dir` directories
  `summarize`

- Generate `REFERENCES.md` from the configured `src-dir` directories and overwrite `<docs-dir>/REFERENCES.md`
  `references`

- Generate compressed output for the configured `src-dir` directories
  `compress [enableLineNumbers]`

- Find and extract specific constructs from the configured `src-dir` directories
  `search TAG PATTERN [enableLineNumbers]`

- Run static analysis on the configured `src-dir` plus `tests-dir` selections (excluding `fixtures/`)
  `static-check`

The set of startup tools active for a project is configurable through `Enable tools` in the
[settings menu](#settings-menu-pi-usereq).

#### Supported `<TAG>` in search commands

- **Python**: CLASS, FUNCTION, DECORATOR, IMPORT, VARIABLE
- **C**: STRUCT, UNION, ENUM, TYPEDEF, MACRO, FUNCTION, IMPORT, VARIABLE
- **C++**: CLASS, STRUCT, ENUM, NAMESPACE, FUNCTION, MACRO, IMPORT, TYPE_ALIAS
- **C#**: CLASS, INTERFACE, STRUCT, ENUM, NAMESPACE, FUNCTION, PROPERTY, IMPORT, DECORATOR, CONSTANT
- **Rust**: FUNCTION, STRUCT, ENUM, TRAIT, IMPL, MODULE, MACRO, CONSTANT, TYPE_ALIAS, IMPORT, DECORATOR
- **JavaScript**: CLASS, FUNCTION, COMPONENT, CONSTANT, IMPORT, MODULE
- **TypeScript**: INTERFACE, TYPE_ALIAS, ENUM, CLASS, FUNCTION, NAMESPACE, MODULE, IMPORT, DECORATOR
- **Java**: CLASS, INTERFACE, ENUM, FUNCTION, IMPORT, MODULE, DECORATOR, CONSTANT
- **Go**: FUNCTION, METHOD, STRUCT, INTERFACE, TYPE_ALIAS, CONSTANT, IMPORT, MODULE
- **Ruby**: CLASS, MODULE, FUNCTION, CONSTANT, IMPORT, DECORATOR
- **PHP**: CLASS, INTERFACE, TRAIT, FUNCTION, NAMESPACE, IMPORT, CONSTANT
- **Swift**: CLASS, STRUCT, ENUM, PROTOCOL, EXTENSION, FUNCTION, IMPORT, CONSTANT, VARIABLE
- **Kotlin**: CLASS, INTERFACE, ENUM, FUNCTION, CONSTANT, VARIABLE, MODULE, IMPORT, DECORATOR
- **Scala**: CLASS, TRAIT, MODULE, FUNCTION, CONSTANT, VARIABLE, TYPE_ALIAS, IMPORT
- **Lua**: FUNCTION, VARIABLE
- **Shell**: FUNCTION, VARIABLE, IMPORT
- **Perl**: FUNCTION, MODULE, IMPORT, CONSTANT
- **Haskell**: MODULE, TYPE_ALIAS, STRUCT, CLASS, FUNCTION, IMPORT
- **Zig**: FUNCTION, STRUCT, ENUM, UNION, CONSTANT, VARIABLE, IMPORT
- **Elixir**: MODULE, FUNCTION, PROTOCOL, IMPL, STRUCT, IMPORT

### Standalone CLI (`pi-usereq`)

The npm package ships the `pi-usereq` bin (`scripts/pi-usereq.js`), which runs the TypeScript CLI entry point `src/cli.ts`. Inside a pi-package installation the extension deploys a best-effort `pi-usereq` launcher symlink into the pi agent bin directory, so the command is available directly; from a source checkout run it with `npm run cli -- <options>`.

Analysis and static-check options mirror the agent tools for scripting and debugging:

```text
--files-tokens FILE [FILE ...]
--files-summarize FILE [FILE ...]
--files-compress FILE [FILE ...] [--enable-line-numbers] [--verbose]
--files-find TAG PATTERN FILE [FILE ...] [--enable-line-numbers] [--verbose]
--files-static-check FILE [FILE ...]
--summarize [--verbose]
--compress [--enable-line-numbers] [--verbose]
--find TAG PATTERN [--enable-line-numbers] [--verbose]
--tokens
--static-check
--test-static-check {dummy,command} [FILES...]
--enable-static-check LANG=Command,CMD[,PARAM...]   (repeatable; e.g. --enable-static-check python=command,ruff,check)
--base <path>        # project base for explicit-file and config-repair flows
--here               # use the current directory as project base
--verbose
```

Project-scoped commands (`--summarize`, `--compress`, `--tokens`, `--find`, `--static-check`) always target the current project configuration and reject `--base` (use `--here`).

Management commands are dispatched before the analysis flags; an empty invocation prints the full help screen:

```text
--help [--upgrade|--dev|--develop|--uninstall|--ver|--version]
--ver | --version    # three aligned lines: Current Installed, Latest @ NPMjs, Latest @ GitHub
--upgrade [--dev|--develop] [--force]
--uninstall
```

`--upgrade` updates through the pi CLI (`pi update npm:pi-usereq` by default, `pi update git:github.com/Ogekuri/PI-useReq` with `--dev`/`--develop`), skips the update when the npm channel is already latest, and reconciles a different installed source with `pi remove` plus `pi install`; `--force` skips the already-latest gate and forces a full re-download. `--uninstall` runs `npm uninstall -g pi-usereq` and removes the deployed launcher links.

The additive configuration CLI reads and writes the same local and global scopes as the settings menu. Paths are case-sensitive, colon-separated, and rooted at `Local` (`<base-path>/.pi-usereq.json`) or `Global` (`~/.config/pi-usereq/config.json`); array tokens support `:append`, `:+`, `:insert:<Idx>`, `:<Idx>`, and `:<Idx>:<Field>`:

```text
--print [Path]        # deterministic tree with current values and default/custom status
--info [Path]         # schema documentation, allowed values, and ready-to-use commands
--print-raw           # unmodified global configuration file bytes
--get Path            # undecorated JSON value
--set Path VALUE      # typed mutation; silent on success
--unset Path          # restore a default, remove a row, or reset an optional field
```

```bash
pi-usereq --get Local:docs-dir
pi-usereq --set Local:docs-dir documentation
pi-usereq --set Local:src-dir:+ lib
pi-usereq --print Global
pi-usereq --info Global:static-check:Python:checkers
```

### Settings Menu (`/pi-usereq`)

The interactive configuration menu exposes every user-facing setting; changes are persisted automatically:

- **Document directory** — `docs-dir` (default `usereq/docs`) used for the canonical documents.
- **Source-code directories** — `src-dir` (default `["src"]`) used by the analysis tools.
- **Unit tests directory** — `tests-dir` (default `tests`).
- **Context Files** — toggles to inject `REQUIREMENTS.md`, `REFERENCES.md`, and `WORKFLOW.md` into the prompt context through `%%CONTEXT_FILES%%`. Each toggle shows the measured file size (`<chars>c/<tokens>t`) plus its occupancy share, and the summary row appends the overall `[<percent>% context]` suffix. It is recommended to keep all three toggles enabled (`requirements:on • references:on • workflow:on`) so the analysis commands receive the canonical documents in their context.
- **Auto git commit** — `enable` (default) injects git commit instructions into every prompt; `disable` forces read-only git behavior (`git_read-only.md`) and turns worktree orchestration off.
- **Git worktree** / **Worktree prefix** — enable/disable prompt-command worktree isolation and set the name prefix (default `PI-useReq-`).
- **Language static code checkers** — per-language `enable`/`disable` flags and the global `Command`-module checker definitions (view/remove/reset with confirmation).
- **Enable tools** — the subset of configurable startup tools activated for the project: the `files-*` and project tools plus the embedded pi tools (`read`, `bash`, `edit`, `write` enabled by default; `find`, `grep`, `ls` configurable and disabled by default).
- **Notifications** — command-notify, sound, and Pushover settings with per-event routing (completed/interrupted/failed). Non-agentic `/req-references` and `/req-reset` runs never dispatch command-notify, sound, or Pushover effects.
- **Debug** — local debug logging: global enablement, prompt-content logging (`Enable debug prompts` plus `Log path for prompts`), log file, log-on-status filter, status-change/workflow-event toggles, enabled tools/prompts, and `Enable debug commands for tools`.
- **Show local/global configuration** — write the exact config file contents into the editor.
- **Reset defaults** — restore the default configuration with a confirmation preview.

### Extension Side Features

#### Sound

The extension plays a bundled sound effect when a prompt ends (completed, interrupted, or failed - each event is independently toggleable) and the active sound level is not `none`.

- Sound levels: `none` → `low` → `mid` → `high`.
- Default toggle shortcut: `alt+s` (cycles the active runtime level; configurable via `notify-sound-toggle-shortcut`).
- Each level maps to a configurable shell command; the defaults use `paplay` on the bundled `Soft-high-tech-notification-sound-effect.mp3` with the `%%INSTALLATION_PATH%%` keyword resolved to the installed extension path.

#### Notifications

- **Command notify** — a configurable desktop-notification command (`PI_NOTIFY_CMD`) run when the selected prompt-end events occur for agentic `/req-*` prompt runs.
- **Pushover** — optional Pushover push notifications (`notify-pushover-*`): user key, API token, priority, title, and text template; disabled until both credentials are set. Only agentic `/req-*` prompt runs dispatch Pushover messages.

#### Status Bar

The extension renders a status field in the pi status line showing: extension identity, workflow state (`idle`/`checking`/`running`/`merging`/`warning`/`error`), current branch, context usage, elapsed run time, and the active sound level.

#### Debug

- Config-gated slash commands that run the project tools and write the output into the editor: `debug-compress`, `debug-references`, `debug-static-check`, `debug-summarize`, `debug-tokens`.
- Standalone debug harness: `scripts/pi-usereq-debug.sh` (bash wrapper) and `scripts/debug-extension.ts` with subcommands `inspect`, `session-start`, `command`, `tool`, and `sdk-smoke`.
- Debug logging writes to the configured `DEBUG_LOG_FILE`, filtered by prompt/tool name and workflow status.
- **Prompt content logging** — when both `Debug` and `Enable debug prompts` are enabled (the `Debug > Enable debug prompts` menu entry), the exact rendered prompt delivered to the LLM agent through `sendMessage`/`sendUserMessage` is saved under `Log path for prompts` (`DEBUG_PROMPTS_LOG_PATH`, default `/tmp/PI-useReq`). Each run writes two files named `<timestamp>-<command>-request.md` and `<timestamp>-<command>-prompt.md` (a `YYYYMMDDHHMMSSmmm` write-time timestamp plus the `/req-*` command used, e.g. `20261009072235123-req-implement-request.md` and `20261009072235123-req-implement-prompt.md`). The `-prompt.md` file is byte-identical to the rendered prompt delivered to the model; the `-request.md` file contains the exact on-screen command invocation summary. Prompt logging depends only on the global `Debug` flag plus `Enable debug prompts` (it is exempt from the `Log on status` workflow filter); nothing is written while `Debug` is disabled. Relative log paths resolve against the project root, and trailing slashes are stripped from the configured path.

  Because the saved file contains exactly what pi-usereq sent, you can replicate the same send from the `pi` CLI, outside pi-usereq and without the extension installed:

  ```bash
  # Replay the exact saved prompt as a one-shot task argument
  pi -p "$(cat /tmp/PI-useReq/20261009072235123-req-implement-prompt.md)"

  # Feed extra material on stdin while replaying an analysis request
  cat errors.log | pi -p "Analyze these errors and suggest how to fix them"

  # Reuse a saved prompt as coding-style guidance through an appended system prompt
  pi -p "Rewrite this function" --append-system-prompt /tmp/PI-useReq/20261009072235123-req-implement-prompt.md
  ```

- **Provider error logging** — when a dispatched `req-*` run receives a provider response with status >= 400, pi-usereq writes the exact failing request payload into `<timestamp>-<command>-error-<status>.json` (raw provider-request JSON), the provider error message text into `<timestamp>-<command>-error-<status>-response.txt`, a byte-for-byte snapshot of the retained execution session into `<timestamp>-<command>-error-<status>-session.jsonl`, and replay metadata into `<timestamp>-<command>-error-<status>-replay.json`, all beside the run's `-request.md` and `-prompt.md` files. The `-replay.json` sidecar carries the provider, base URL, model id, thinking level, context window, max output tokens, the retained execution-session file, and ready-to-use replay commands; `replayCommands.piFork` targets the log-local `-session.jsonl` snapshot, which freezes the transcript exactly at the failing provider request (before any context edit or compaction). You can re-generate the failure for immediate pi CLI debugging:

  ```bash
  # Run the complete failing provider request recorded in the sidecar
  # (`replayCommands.provider` is a ready-to-use curl command line)
  bash -c "$(jq -r '.replayCommands.provider' /tmp/PI-useReq/20261012070707447-req-analyze-error-400-replay.json)"

  # Or replay the request body directly
  curl -sS https://openrouter.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    -H "Content-Type: application/json" \
    --data @/tmp/PI-useReq/20261012070707447-req-analyze-error-400.json

  # Replay the saved prompt through pi with the same model and thinking level
  pi --no-session --model '~deepseek/deepseek-flash-latest' --thinking high \
    -p "$(cat /tmp/PI-useReq/20261012070647580-req-analyze-prompt.md)"

  # Resume the exact failing state using only log files, then re-trigger the failing request:
  # the -session.jsonl snapshot is the execution session frozen at the 400, so any
  # continuation message re-sends the same oversized request and reproduces the error
  pi --fork /tmp/PI-useReq/20261012091841114-req-analyze-error-400-session.jsonl \
    --model '~deepseek/deepseek-flash-latest' --thinking high "continue"
  ```


## Note on Git usage

This section describes the Git behavior of the `req-*` commands. The commands own their git workflow: every command except the non-agentic `/req-reset` validates the repository before dispatch, and finalization happens at the end of each worktree-backed run.

- Required state before execution (every `req-*` command except `/req-reset`):
  - The project must be inside a git work tree with a **clean tracked working tree** (`git status --porcelain` empty; the configured debug-log file is ignored by the validation).
  - `HEAD` must resolve. A working branch is recommended: the current branch name is embedded in the generated worktree names (it falls back to `unknown` on a detached `HEAD`).
  - All files must be saved and you must be in the correct project directory.

- What the commands do to the repository:
  - Each `req-*` prompt command runs git validation and the required-document checks, then (when `Auto git commit` and `Git worktree` are enabled) creates an isolated **git worktree and branch** named `<GIT_WORKTREE_PREFIX><project>-<branch>-<YYYYMMDDHHMMSS>` (default prefix `PI-useReq-`), switches the session into it, and executes the prompt there.
  - On success with the exact `STATUS: OK` marker in the final agent output, the extension restores the original `base-path` session, applies a stash-assisted fast-forward merge of the worktree branch, and deletes the worktree and branch.
  - A completed run whose final agent output contains `STATUS: ERROR` parks the workflow in `error`; a completed run with no marker parks it in `warning`. Both **keep** the worktree and branch so the produced artifacts can be inspected or recovered: run `/req-reset` to restore the original base path and force-remove the generated worktrees and branches. Interrupted, failed, aborted, or incomplete runs also retain the worktree execution session and park the workflow in `error`.
  - `/req-references` regenerates `<docs-dir>/REFERENCES.md`, stages only that file, and commits it with the fixed message `docs(references): Update REFERENCES.md document. [useReq]` whenever the regenerated content differs from `HEAD`; when the content already matches, the commit is skipped and the run still reports success. Completed runs notify whether the references file changed and whether the commit was created or skipped.
  - With `Auto git commit = enable` (default), every prompt receives structured commit instructions and commits follow the message template `<TYPE>(<COMPONENT>)<BREAKING>: <DESCRIPTION> [useReq]`. With `Auto git commit = disable`, prompts receive a read-only git restriction and worktree orchestration is forced off.
  - The extension never rewrites git history; destructive cleanup is limited to generated worktrees and branches: successful closure and command-side rollback remove only the run's own worktree, while `/req-reset` force-removes every matching generated worktree and branch (see above).

- Recommended practice:
  - Review the changes produced by each command before pushing them.
  - Do not use destructive commands (e.g., `git reset --hard`, `git clean -fd`) to "clean" the repository without verifying the impact; prefer `/req-reset` for worktree cleanup after failed runs.