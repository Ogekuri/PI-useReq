# PI-useReq/pi-usereq (0.57.0)

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/license-GPL--3.0-491?style=flat-square" alt="License: GPL-3.0">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6A7EC2?style=flat-square&logo=terminal&logoColor=white" alt="Platforms">
  <img src="https://img.shields.io/badge/docs-live-b31b1b" alt="Docs">
<img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json" alt="uv">
</p>

<p align="center">
<strong>pi-usereq is a pi extension that runs a requirements-first development workflow.</strong><br>
It turns a User Request into a living <em>Software Requirements Specification</em> (SRS), implements the corresponding
source code, and keeps the project documentation (<code>WORKFLOW.md</code>, <code>REFERENCES.md</code>, <code>FLOWCHART.md</code>, <code>README.md</code>)
in sync with the repository. All capabilities are exposed as slash commands and agent tools inside
<a href="https://pi.dev"><strong>pi</strong></a> (<code>pi-coding-agent</code> 0.80.4+).
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
🚧 <strong>DRAFT</strong>: 👾 Alpha Development 👾 - Work in Progress 🏗️ 🚧<br>
⚠️ <strong>IMPORTANT NOTICE</strong>: Created itself with <a href="https://github.com/Ogekuri/PI-useReq"><strong>PI-useReq/pi-usereq</strong></a> 🤖✨ ⚠️<br>
<br>
<p>


## Quick Start

1. **Install the extension** (see [Install](#install)) and restart pi.
2. **Configure the project** (optional): run `/pi-usereq` to set the documentation directory, unit-tests directory, source directories, static code checkers, enabled tools, git automation, and notifications.
3. **Write the requirements**: run `/req-write <User Request>` to produce a first SRS draft, or `/req-create` to derive the SRS from the existing source code.
4. **Implement the source code**: run `/req-implement` to build the source from the requirements, or `/req-cover` to make the minimal changes that cover uncovered requirements.
5. **Update the documentation**: run `/req-workflow`, `/req-flowchart`, and/or `/req-references` to regenerate the project documentation from the source; `/req-readme` keeps this file aligned with the implementation.
6. **Iterate**: use `/req-change`, `/req-new`, `/req-fix`, `/req-refactor`, and `/req-check` to evolve requirements and code together.
7. **Recover** (if a run fails or is interrupted): run `/req-reset` to restore the original base path and remove generated worktrees and branches.


## Requirements

- **pi CLI** (`pi.dev`) - the extension runs inside pi; requires `@earendil-works/pi-coding-agent` 0.80.4 or newer (Node.js 22.19+, per the pi CLI requirement).
- **Git repository** - every `req-*` command runs slash-command-owned git validation: the project must be inside a git work tree, the tracked working tree must be clean, and `HEAD` must resolve (a detached `HEAD` is tolerated; a working branch is recommended because the branch name is embedded in generated worktree names).
- **Requirements documentation** - the configured `docs-dir` (default `pi-usereq/docs`) must contain the canonical documents required by each command (`REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md`); commands such as `/req-write`, `/req-create`, and `/req-workflow` are the entry points that generate them.
- **Static code checkers** - the bundled checkers (`pyright`, `ruff`, `eslint`) install automatically through the `postinstall` script; the native C/C++ checkers (`cppcheck`, `clang-format`) require a one-line system install (see [Install](#install)). Default configured languages: C, C++, JavaScript, Python, TypeScript.


## Feature Highlights

- **17 slash commands** - 15 prompt-backed `req-*` commands plus the dedicated non-agentic `/req-references` and `/req-reset` commands.
- **11 built-in agent tools** - token counting, summarization, compression, construct search, and static-check tools for explicit files or for the configured project surface.
- **Interactive configuration menu** - `/pi-usereq` manages local (`<base-path>/.pi-usereq.json`) and global (`~/.config/pi-usereq/config.json`) configuration with no manual JSON editing required.
- **Worktree-isolated runs** - prompt-command executions run in an isolated git worktree (created with `<prefix><project>-<branch>-<YYYYMMDDHHMMSS>` names) and are merged back with a stash-assisted fast-forward on success.
- **Automatic commit guidance** - `AUTO_GIT_COMMIT=enable` (default) injects structured commit instructions (`<TYPE>(<COMPONENT>): <DESCRIPTION> [useReq]`) into every prompt; disabling it forces read-only git behavior and turns worktree orchestration off.
- **Notifications** - desktop notify command, sound effects (levels `none`/`low`/`mid`/`high`, default `alt+s` toggle) and Pushover push messages on prompt completion, interruption, or failure.
- **Runtime status bar** - the extension renders its workflow state, current branch, context usage, elapsed time, and sound level in the pi status line.
- **Debug surface** - config-gated `debug-*` slash commands and a standalone debug harness (`scripts/debug-extension.ts`, `scripts/pi-usereq-debug.sh`) for offline inspection and replay.


## Prompts and Agents

Each `req-*` command is invoked as `/req-<name> <User Request>` inside pi. Prompt commands first run git validation and the
prompt-specific required-document checks, then (when `Auto git commit` and `Git worktree` are enabled) switch the session into an
isolated worktree, render the bundled prompt with the project context, and on success merge the changes back and leave the
repository clean. `/req-references` and `/req-reset` are non-agentic: they execute directly without starting an LLM session or
creating a worktree.

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
| `/req-implement` | Implement source code from requirements | `REQUIREMENTS.md` |
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
├── pi-usereq/                   # configured docs-dir (default)
│   └── docs/
│       ├── REQUIREMENTS.md      # Software Requirements Specification (SRS)
│       ├── WORKFLOW.md          # runtime/execution units and call traces
│       ├── REFERENCES.md        # symbol index generated from the source
│       └── FLOWCHART.md         # workflow flowchart (generated on demand)
├── src/                         # source code
├── tests/                       # unit tests suite
├── scripts/                     # debug harness and checker installer
├── images/                      # project assets (flowchart, logo)
└── ~/.config/pi-usereq/         # global configuration (outside the repo)
    └── config.json              # cross-project settings (checkers, git, notifications)
```

The documentation directory, unit-tests directory, and source directories are configurable via the
[settings menu](#extension-usage) (defaults: `pi-usereq/docs`, `tests`, `src`).


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

Bundled static checkers (`pyright`, `ruff`, `eslint`) install automatically via the `postinstall` script. Native checkers (`cppcheck`, `clang-format`) require a one-line system install:

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

### Standalone CLI

The extension ships a standalone CLI entry point (`src/cli.ts`, runnable with `npm run cli -- <options>`) that mirrors the agent tools for scripting and debugging:

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
--enable-static-check LANG=MODULE[,CMD[,PARAM...]]   (repeatable; e.g. --enable-static-check python=command,ruff,check)
--base <path>        # project base for project-scoped commands
--here               # use the current directory as project base
--verbose
```

Project-scoped commands (`--summarize`, `--compress`, `--tokens`, `--find`, `--static-check`) always target the current project configuration and reject `--base` (use `--here`).

### Settings Menu (`/pi-usereq`)

The interactive configuration menu exposes every user-facing setting; changes are persisted automatically:

- **Documentation directory** — `docs-dir` (default `pi-usereq/docs`) used for the canonical documents.
- **Unit tests directory** — `tests-dir` (default `tests`).
- **Source directories** — `src-dir` (default `["src"]`) used by the analysis tools.
- **Context Files** — toggles to inject `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` into the prompt context through `%%CONTEXT_FILES%%`.
- **Auto git commit** — `enable` (default) injects git commit instructions into every prompt; `disable` forces read-only git behavior (`git_read-only.md`) and turns worktree orchestration off.
- **Git worktree** / **Worktree prefix** — enable/disable prompt-command worktree isolation and set the name prefix (default `PI-useReq-`).
- **Language static code checkers** — per-language `enable`/`disable` flags and the global `Command`-module checker definitions (view/remove/reset with confirmation).
- **Enable tools** — the subset of configurable startup tools activated for the project (`files-*` and project tools plus the embedded `read`, `bash`, `edit`, `write` quartet).
- **Notifications** — command-notify, sound, and Pushover settings with per-event routing (completed/interrupted/failed).
- **Debug** — local debug logging: log file, log-on-status filter, status-change/workflow-event toggles, enabled tools/prompts, and `Enable debug commands for tools`.
- **Show local/global configuration** — write the exact config file contents into the editor.
- **Reset defaults** — restore the default configuration with a confirmation preview.

### Extension Side Features

#### Sound

The extension plays a bundled sound effect when a prompt ends (completed, interrupted, or failed - each event is independently toggleable).

- Sound levels: `none` → `low` → `mid` → `high`.
- Default toggle shortcut: `alt+s` (cycles the active runtime level; configurable via `notify-sound-toggle-shortcut`).
- Each level maps to a configurable shell command; the defaults use `paplay` on the bundled `Soft-high-tech-notification-sound-effect.mp3` with the `%%INSTALLATION_PATH%%` keyword resolved to the installed extension path.

#### Notifications

- **Command notify** — a configurable desktop-notification command (`PI_NOTIFY_CMD`) run when the selected prompt-end events occur.
- **Pushover** — optional Pushover push notifications (`notify-pushover-*`): user key, API token, priority, title, and text template; disabled until both credentials are set.

#### Status Bar

The extension renders a status field in the pi status line showing: extension identity, workflow state (`idle`/`checking`/`running`/`merging`/`error`), current branch, context usage, elapsed run time, and the active sound level.

#### Debug

- Config-gated slash commands that run the project tools and write the output into the editor: `debug-compress`, `debug-references`, `debug-static-check`, `debug-summarize`, `debug-tokens`.
- Standalone debug harness: `scripts/pi-usereq-debug.sh` (bash wrapper) and `scripts/debug-extension.ts` with subcommands `inspect`, `session-start`, `command`, `tool`, and `sdk-smoke`.
- Debug logging writes to the configured `DEBUG_LOG_FILE`, filtered by prompt/tool name and workflow status.


## Note on Git usage

This section describes the Git behavior of the `req-*` commands. The commands own their git workflow: validation happens before dispatch and finalization happens at the end of each run.

- Required state before execution:
  - The project must be inside a git work tree with a **clean tracked working tree** (`git status --porcelain` empty; the configured debug-log file is ignored by the validation).
  - `HEAD` must resolve. A working branch is recommended: the current branch name is embedded in the generated worktree names (it falls back to `unknown` on a detached `HEAD`).
  - All files must be saved and you must be in the correct project directory.

- What the commands do to the repository:
  - Each `req-*` prompt command runs git validation and the required-document checks, then (when `Auto git commit` and `Git worktree` are enabled) creates an isolated **git worktree and branch** named `<GIT_WORKTREE_PREFIX><project>-<branch>-<YYYYMMDDHHMMSS>` (default prefix `PI-useReq-`), switches the session into it, and executes the prompt there.
  - On success the extension restores the original `base-path` session, applies a stash-assisted fast-forward merge of the worktree branch, and deletes the worktree and branch.
  - On failure or interruption the worktree and branch are **kept** and the workflow is parked in the `error` state so the produced artifacts can be inspected or recovered: run `/req-reset` to restore the original base path and force-remove the generated worktrees and branches.
  - With `Auto git commit = enable` (default), every prompt receives structured commit instructions and commits follow the message template `<TYPE>(<COMPONENT>)<BREAKING>: <DESCRIPTION> [useReq]`. With `Auto git commit = disable`, prompts receive a read-only git restriction and worktree orchestration is forced off.
  - The extension never rewrites history and never runs destructive cleanup on your behalf.

- Recommended practice:
  - Review the changes produced by each command before pushing them.
  - Do not use destructive commands (e.g., `git reset --hard`, `git clean -fd`) to "clean" the repository without verifying the impact; prefer `/req-reset` for worktree cleanup after failed runs.