# PI-useReq/pi-usereq (0.36.0)

<p align="center">
  <img src="https://img.shields.io/badge/node-24.15%2B-5FA04E?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 24.15+">
  <img src="https://img.shields.io/badge/runtime-pi%20extension-6A7EC2?style=flat-square" alt="pi extension">
  <img src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-GPL--3.0-491?style=flat-square" alt="License: GPL-3.0">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6A7EC2?style=flat-square&logo=terminal&logoColor=white" alt="Platforms">
</p>

<p align="center">
<strong>pi-usereq is a pi extension for requirements-driven repository work.</strong><br>
It adds bundled <code>/req-*</code> workflows, repository analysis tools, a configuration menu, status telemetry, notifications, worktree-aware prompt orchestration, and standalone debug utilities for maintaining <code>REQUIREMENTS.md</code>, <code>WORKFLOW.md</code>, <code>REFERENCES.md</code>, <code>README.md</code>, and source-code changes from one consistent extension surface.<br>
The repository also ships a standalone CLI and offline debug harness for local inspection, replay, and automation-friendly analysis.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#feature-highlights">Feature Highlights</a> |
  <a href="#extension-custom-commands">Extension Custom Commands</a> |
  <a href="#default-workflow">Default Workflow</a> |
  <a href="#projects-documentation">Project's Documentation</a> |
  <a href="#installuninstall">Install/Uninstall</a> |
  <a href="#extension-usage">Extension Usage</a> |
  <a href="#extension-side-features">Extension Side Features</a> |
  <a href="#note-on-git-usage">Note on Git usage</a>
</p>
<p align="center">
<br>
🚧 <strong>DRAFT</strong>: 👾 Alpha Development 👾 - Work in Progress 🏗️ 🚧<br>
⚠️ <strong>IMPORTANT NOTICE</strong>: Created itself with <a href="https://github.com/Ogekuri/useReq"><strong>useReq/req</strong></a> 🤖✨ ⚠️<br>
<br>
<p>

## Requirements

- A working <strong>pi</strong> installation able to load extensions from this repository (`package.json` exposes `./src/index.ts` as the extension entry).
- A <strong>Git repository</strong> for prompt-backed `/req-*` workflows and for `/req-references` / `/req-reset` behavior.
- <strong>Node.js 24.15+</strong> for local repository-driven commands and debug scripts (`release-npm.yml` and local scripts target Node 24.15.0).
- For project-scope defaults, pi-usereq expects:
  - docs in `pi-usereq/docs`
  - source in `src`
  - tests in `tests`
- Optional external static-check executables if you enable or keep the documented defaults:
  - `pyright`, `ruff`
  - `cppcheck`, `clang-format`
  - `node` (`--check`)
  - `npx eslint`
- Optional desktop notification tooling if you enable it:
  - `notify-send` for command notifications
  - `paplay` for sound notifications
  - Pushover credentials if you enable Pushover delivery

## Feature Highlights

- Registers bundled slash commands for requirements authoring, implementation, analysis, refactoring, workflow-doc generation, and README maintenance.
- Exposes agent tools for file tokens, summaries, compression, construct search, references generation, and static checks.
- Provides a top-level `/pi-usereq` configuration UI for docs/source/test paths, git automation, active tools, notifications, static checks, and debug settings.
- Tracks extension state in the pi status footer with extension version, workflow state, branch, context usage, elapsed time, and active sound level.
- Supports prompt-command worktree orchestration with configurable automatic git commit and generated worktree naming.
- Includes direct non-agentic commands:
  - `/req-references` regenerates and commits `REFERENCES.md`
  - `/req-reset` restores base-path state and removes generated worktrees/branches
- Includes repository-local debug utilities:
  - `scripts/pi-usereq-debug.sh`
  - `scripts/debug-extension.ts`
  - optional `/debug-*` wrapper commands when enabled in Debug settings

## Extension Custom Commands

| Command | Kind | Description |
| --- | --- | --- |
| `/req-write` | Prompt-backed | Produce a Software Requirements Specification draft from a user request. |
| `/req-create` | Prompt-backed | Write a Software Requirements Specification using the project's source code. |
| `/req-recreate` | Prompt-backed | Reorganize and update the Software Requirements Specification from source-code evidence while preserving requirement IDs. |
| `/req-renumber` | Prompt-backed | Deterministically renumber requirement IDs without changing requirement text or order. |
| `/req-analyze` | Prompt-backed | Produce an evidence-backed analysis report. |
| `/req-check` | Prompt-backed | Run a requirements coverage/compliance check. |
| `/req-change` | Prompt-backed | Update the requirements and implement the corresponding changes. |
| `/req-new` | Prompt-backed | Implement a new requirement and make the corresponding source-code changes. |
| `/req-fix` | Prompt-backed | Fix a defect without changing the requirements. |
| `/req-cover` | Prompt-backed | Implement minimal changes to cover uncovered existing requirements. |
| `/req-implement` | Prompt-backed | Implement source code from requirements (from scratch). |
| `/req-refactor` | Prompt-backed | Perform a refactor without changing the requirements. |
| `/req-workflow` | Prompt-backed | Write `WORKFLOW.md` from source-code evidence. |
| `/req-flowchart` | Prompt-backed | Write `FLOWCHART.md` from source-code evidence. |
| `/req-readme` | Prompt-backed | Write `README.md` from user-visible implementation evidence. |
| `/req-references` | Direct command | Regenerate `REFERENCES.md`, stage only that file, commit it, and verify repository cleanliness. |
| `/req-reset` | Direct command | Reset req workflow state, restore base-path, and remove generated worktrees/branches. |
| `/pi-usereq` | Direct command | Open the interactive pi-usereq configuration menu. |

## Default Workflow

Click to zoom flowchart image.

[![Flowchart](https://raw.githubusercontent.com/Ogekuri/PI-useReq/refs/heads/master/images/flowchart-bw.svg)](https://raw.githubusercontent.com/Ogekuri/PI-useReq/refs/heads/master/images/flowchart-bw.svg)

## Project's Documentation

### Project's Tree

```text
.
├── .github/
│   └── workflows/
│       └── release-npm.yml
├── images/
│   ├── flowchart-bw.png
│   ├── flowchart-bw.svg
│   ├── flowchart.md
│   ├── flowchart.png
│   └── flowchart.svg
├── pi-usereq/
│   └── docs/
│       ├── REFERENCES.md
│       ├── REQUIREMENTS.md
│       └── WORKFLOW.md
├── scripts/
│   ├── debug-extension.ts
│   ├── pi-usereq-debug.sh
│   └── tool-args-to-params.ts
├── src/
│   ├── cli.ts
│   ├── core/
│   └── index.ts
├── tests/
├── CHANGELOG.md
├── LICENSE
├── README.md
├── package-lock.json
├── package.json
└── TODO.md
```

## Install/Uninstall

### Install

For pi usage, install the extension from the repository source and reload pi:

```bash
pi install git:github.com/Ogekuri/PI-useReq
```

Then reload pi so the extension commands, tools, and shortcut registration become available.

For local repository development and standalone scripts:

```bash
npm ci
```

### Uninstall

This repository does not ship a separate uninstall script.

- Remove the extension from your pi installation using your normal pi extension-management flow.
- Reload pi after removal.
- If you no longer want repository-local configuration, remove `.pi-usereq.json` from the project root.

## Quick Start

1. Install the extension and open a Git-backed project.
2. Run `/pi-usereq` and confirm the key project settings:
   - `Document directory`
   - `Source-code directories`
   - `Unit tests directory`
   - `Auto git commit` / `Git worktree`
3. Bootstrap or refresh documentation:
   - `/req-write` for a request-driven SRS draft
   - `/req-create` for code-driven SRS generation
   - `/req-workflow` and `/req-references` for runtime and symbol documentation
4. Execute implementation workflows as needed:
   - `/req-change`, `/req-new`, `/req-fix`, `/req-cover`, `/req-implement`, `/req-refactor`
5. Use maintenance utilities when needed:
   - `/req-readme` to align `README.md`
   - `/req-flowchart` to refresh the flowchart artifact
   - `/req-reset` to recover from worktree/session leftovers

## Extension Usage

### Extension Custom Commands

#### Prompt-backed workflow families

- <strong>Requirements authoring</strong>: `/req-write`, `/req-create`, `/req-recreate`, `/req-renumber`
- <strong>Read-only analysis</strong>: `/req-analyze`, `/req-check`
- <strong>Implementation/change</strong>: `/req-change`, `/req-new`, `/req-fix`, `/req-cover`, `/req-implement`, `/req-refactor`
- <strong>Documentation maintenance</strong>: `/req-workflow`, `/req-flowchart`, `/req-readme`

Prompt-backed commands use prompt-specific required-document checks. For example:

- `/req-create`, `/req-workflow`, `/req-write` do not require pre-existing canonical docs.
- `/req-implement` requires `REQUIREMENTS.md`.
- Most other bundled workflows require `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md`.

#### Direct maintenance commands

- <strong>`/req-references`</strong>
  - validates repository state
  - regenerates `REFERENCES.md` from configured source directories
  - stages only `REFERENCES.md`
  - creates the fixed commit `docs(references): Update REFERENCES.md document. [useReq]`
- <strong>`/req-reset`</strong>
  - restores req workflow state
  - restores the original base-path when recoverable prompt state exists
  - removes generated worktrees and matching branches built from the configured worktree prefix
- <strong>`/pi-usereq`</strong>
  - opens the interactive settings UI
  - persists project-local and global configuration on exit

#### Optional debug wrapper commands

When <strong>Debug → Enable debug commands for tools</strong> is enabled, pi-usereq also registers:

- `/debug-compress`
- `/debug-references`
- `/debug-static-check`
- `/debug-summarize`
- `/debug-tokens`

These commands run the corresponding tool path and write the monolithic result into the editor instead of the model context.

### Extension Custom Tools

| Tool | Scope | User-visible behavior |
| --- | --- | --- |
| `files-tokens` | Explicit files | Count tokens, bytes, characters, lines, headings, and related file metrics. |
| `files-summarize` | Explicit source files | Produce monolithic summary markdown for the selected files. |
| `files-compress` | Explicit source files | Produce monolithic compressed markdown for the selected files. |
| `files-search` | Explicit source files | Extract named constructs by tag + regex from the selected files. |
| `summarize` | Configured source directories | Summarize project source under configured `src-dir` values. |
| `references` | Configured source directories + docs dir | Overwrite `<docs-dir>/REFERENCES.md` and return only `success` or `error: ...`. |
| `compress` | Configured source directories | Compress project source under configured `src-dir` values. |
| `search` | Configured source directories | Extract named constructs by tag + regex across configured source directories. |
| `tokens` | Canonical docs | Count token metrics for `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` under configured `docs-dir`. |
| `files-static-check` | Explicit files | Run configured static-check entries against selected files. |
| `static-check` | Configured source + test directories | Run configured static checks across source and tests (excluding fixtures from project-scope selection). |

Notes:

- `files-compress`, `compress`, `files-search`, and `search` support optional line numbers.
- `search`/`files-search` apply the regex to construct <strong>names</strong>, not bodies.
- `references` is also part of the default enabled-tool set.
- Default enabled tools include all extension-owned tools above plus embedded `read`, `bash`, `edit`, and `write`. Embedded `find`, `grep`, and `ls` are configurable but default-disabled.

### Standalone CLI

The repository also ships a standalone CLI entry in `src/cli.ts`.

Run it from the repository root with:

```bash
npm run cli -- --here --summarize
npm run cli -- --here --compress --enable-line-numbers
npm run cli -- --files-summarize src/index.ts src/cli.ts
npm run cli -- --files-compress src/index.ts src/cli.ts
npm run cli -- --files-find FUNCTION '^main$' src/cli.ts
npm run cli -- --files-static-check src/index.ts
npm run cli -- --static-check
npm run cli -- --enable-static-check "Python=Command,ruff,check" --here --static-check
```

Supported top-level CLI switches include:

- `--base <path>`
- `--here`
- `--verbose`
- `--enable-line-numbers`
- `--enable-static-check LANG=Command,CMD[,PARAM...]` (repeatable)
- `--files-tokens FILE...`
- `--files-summarize FILE...`
- `--files-compress FILE...`
- `--files-find TAG PATTERN FILE...`
- `--summarize`
- `--compress`
- `--find TAG PATTERN`
- `--tokens`
- `--files-static-check FILE...`
- `--static-check`
- `--test-static-check dummy ...`
- `--test-static-check command <cmd> ...`

CLI naming note: the standalone CLI uses <code>--files-find</code> / <code>--find</code>, while the extension tool surface uses <code>files-search</code> / <code>search</code>.

### Offline debug utilities

#### `scripts/pi-usereq-debug.sh`

The bash wrapper provides convenience subcommands for offline extension replay:

- `inspect`
- `session`
- `command <name>`
- `prompt <name>`
- `tool <name>`
- `sdk`
- `raw ...`

Examples:

```bash
./scripts/pi-usereq-debug.sh inspect --format pretty
./scripts/pi-usereq-debug.sh session --format json
./scripts/pi-usereq-debug.sh prompt analyze --args "Inspect prompt rendering"
./scripts/pi-usereq-debug.sh tool files-search --args 'FUNCTION ^run src/index.ts --enable-line-numbers'
```

#### `scripts/debug-extension.ts`

The lower-level TypeScript harness supports:

- `inspect`
- `session-start`
- `command`
- `tool`
- `sdk-smoke`

It accepts `--cwd`, `--extension`, `--format`, `--name`, `--args`, `--params`, `--event-payload`, `--select`, and `--input`.

## Extension Side Features

### Configuration UI

`/pi-usereq` exposes these top-level controls:

- `Document directory`
- `Source-code directories`
- `Unit tests directory`
- `Auto git commit`
- `Git worktree`
- `Worktree prefix`
- `Language static code checkers`
- `Enable tools`
- `Notifications`
- `Debug`
- `Show local configuration`
- `Show global configuration`
- `Reset defaults`

Configuration persistence is split across:

- local project file: `.pi-usereq.json`
- global file: `~/.config/pi-usereq/config.json`

### Status footer

The extension status line renders:

- extension name and version
- workflow state
- current Git branch
- context-usage gauge
- elapsed timing fields
- active runtime sound level

### Sound

Notification sound behavior is user-visible in two separate ways:

- <strong>Persisted boot sound level</strong>: configurable in `Notifications` as `none`, `low`, `mid`, or `high`
- <strong>Active runtime sound level</strong>: cycled at runtime with the configured shortcut

Default sound-toggle shortcut:

```text
alt+s
```

Cycle order:

```text
none -> low -> mid -> high -> none
```

Changing the shortcut updates configuration immediately, but the extension asks you to run `/reload` before the new binding is applied.

### Notifications

The Notifications menu manages three transport families:

- command notification (`notify-send` by default)
- sound notification (`paplay` commands by default)
- Pushover delivery

Each transport has completed/interrupted/failed event toggles.

Pushover behavior:

- stays disabled until both credential fields are populated
- exposes priority `Normal` or `High`
- exposes configurable title/text templates
- supports escaped control-sequence editing for the text field

Default templates:

```text
Pushover title: %%PROMT%% @ %%BASE%% [%%TIME%%]
Pushover text : %%RESULT%%\n%%ARGS%%
```

## Note on Git usage

pi-usereq owns visible Git behavior for prompt-backed workflows and for the dedicated direct commands.

- Prompt-backed `/req-*` workflows validate that the current project is inside a Git repository.
- Prompt-backed workflows can use generated worktrees when:
  - `Auto git commit` is `enable`
  - `Git worktree` is `enable`
- If `Auto git commit` is disabled, effective worktree usage is forced to `disable`.
- Generated worktree names use the configurable `Worktree prefix` (`PI-useReq-` by default).
- `/req-references` does <strong>not</strong> create a worktree; it writes `REFERENCES.md`, stages only that file, commits it, and verifies the repository is clean afterward.
- `/req-reset` removes generated worktrees and matching branches and restores the original base-path when prompt recovery data is available.
- The extension status footer exposes workflow-state transitions while these Git-backed flows run.

Practical guidance:

- Start from the intended repository and branch.
- Keep the working tree clean before launching mutation workflows.
- Review generated changes before relying on the resulting commit history.
- Use `/req-reset` if a worktree-backed run leaves recoverable state behind.
