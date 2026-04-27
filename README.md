# PI-useReq/pi-usereq (0.13.0)

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/license-GPL--3.0-491?style=flat-square" alt="License: GPL-3.0">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6A7EC2?style=flat-square&logo=terminal&logoColor=white" alt="Platforms">
  <img src="https://img.shields.io/badge/docs-live-b31b1b" alt="Docs">
<img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json" alt="uv">
</p>

<p align="center">
<strong>TODO: complete with one line project descrition.</strong><br>
TODO: complete with complete molti-line project descrition.<br>
This allows them to be run both as a Python package (installed as <b>req</b>, <b>usereq</b>, or <b>use-req</b>) and directly using <b>uvx</b>.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#feature-highlights">Feature Highlights</a> |
  <a href="#prompts-and-agents">Prompts and Agents</a> |
  <a href="#default-workflow">Default Workflow</a> |
  <a href="#supported-clis-agents-and-extensions">Supported CLIs, Agents, and Extensions</a> |
  <a href="#known-issues">Known Issues</a> |
  <a href="#legacy-mode">Legacy Mode</a>
</p>
<p align="center">
<br>
🚧 <strong>DRAFT</strong>: 👾 Alpha Development 👾 - Work in Progress 🏗️ 🚧<br>
⚠️ <strong>IMPORTANT NOTICE</strong>: Created itself with <a href="https://github.com/Ogekuri/useReq"><strong>useReq/req</strong></a> 🤖✨ ⚠️<br>
<br>
<p>



## Requirements

- TODO: complete the bulle list with requiremets


## Feature Highlights
- TODO: complete the bulle list with feature highlights


## Extension Custom Commands

TODO: complete table with the extension custom commands

  | Prompt | Description |
  | --- | --- |
  | `write` | Produce a *SRS* draft based on the User Request description |
  | `create` | Write a *Software Requirements Specification* using the project's source code |
  | `recreate` | Reorganize and update the *Software Requirements Specification* based on source code analysis (preserve requirement IDs) |
  | `renumber` | Deterministically renumber requirement IDs in the *Software Requirements Specification* without changing requirement text or order |
  | `analyze` | Produce an analysis report |
  | `change` | Update the requirements and implement the corresponding changes |
  | `check` | Run the requirements check |
  | `cover` | Implement minimal changes to cover uncovered existing requirements |
  | `fix` | Fix a defect without changing the requirements |
  | `implement` | Implement source code from requirements (from scratch) |
  | `new` | Implement a new requirement and the corresponding source code changes |
  | `refactor` | Perform a refactor without changing the requirements |
  | `readme` | Write `README.md` from user-visible implementation evidence |
  | `req-references` | Write a `REFERENCES.md` using the project's source code |
  | `workflow` | Write a `WORKFLOW.md` using the project's source code |
  | `flowchart` | Write a `FLOWCHART.md` using the project's source code |


## Default Workflow

Click to zoom flowchart image.

[![Flowchart](https://raw.githubusercontent.com/Ogekuri/PI-useReq/refs/heads/master/images/flowchart-bw.svg)](https://raw.githubusercontent.com/Ogekuri/PI-useReq/refs/heads/master/images/flowchart-bw.svg)


## Project's Documentation


### Project's Tree

TODO: update/rewrite the project tree

```text
.
├── .req/
│   └── useReq/req files
├── docs/
│   ├── FLOWCHART.md
│   ├── REQUIREMENTS.md
│   ├── REFERENCES.md
│   └── WORKFLOW.md
├── guidelines/
│   └── User's guidelines
├── src/
│   └── Source code
└── tests/
    └── Unit tests suite
```

## Install/Uninstall

### Install

TODO: complete installation istructions

Install:
```bash
pi install npm:pi-usereq
```

Or via git:
```bash
pi install git:github.com/Ogekuri/PI-useReq
```

Reload Pi.


### Uninstall

TODO: complete uninstall istructions

```bash

```

## Quick Start

TODO: complete/reeview with a quick start guide with a complete quick start guide

1. Install extension, tun pi-dev CLI
2. Use `/req-write` or `/req-create` to create requirements
3. Use `/req-implement` to implement source-code from requirements, or `/req-cover` to cover new requirements (documentation).
4. Use `/req-workflow`, `/req-flowchart`, and/or `/req-references` to update project's documentation.
5. Start to use `/req-change`, `/req-new`, and `/req-fix`.

## Extension Usage

TODO: document all extension features in details

### Extension Custom Commands

TODO: complete with the extension custom commands full documentation

### Extension Custom Tools

TODO: complete with the extension custom tools full documentasions

- Count tokens and chars for the given files
  `files-tokens FILE [FILE ...]`

- Generate LLM summary markdown for the given files
  `files-summarize FILE [FILE ...]`

- Generate compressed output for the given files
  `files-compress FILE [FILE ...]`

- Find and extract specific constructs from the given files
  `files-find TAG PATTERN FILE [FILE ...]`

- Run static analysis on the given files using tools configured in `.req/config.json`
  `files-static-check FILE [FILE ...]`

- Count tokens and chars for canonical docs files in configured `docs-dir` (`REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md`).
  `tokens`

- Generate LLM summary markdown for source files selected by `git ls-files cached others exclude-standard` under configured `src-dir` directories.
  `summarize`

- Generate compressed output for source files selected by `git ls-files cached others exclude-standard` under configured `src-dir` directories.  
  `compress`

- Find and extract specific constructs from source files selected by `git ls-files cached others exclude-standard` under configured `src-dir` directories.
  `find TAG PATTERN`

- Run static analysis on source files selected by `git ls-files cached others exclude-standard` under configured `src-dir` directories (plus configured `tests-dir`, excluding `fixtures/`).
  `static-check`

- Check repository integrity for the configured git path: clean working tree and valid HEAD.
  `git-check`

- Check canonical docs presence in configured `docs-dir`: `REQUIREMENTS.md`, `WORKFLOW.md`, `REFERENCES.md`.
  `docs-check`

- Create an isolated git worktree and branch with the provided name; also copies `.req/`, active provider directories, and `.venv` (when present) into the new worktree context.
  `git-wt-create WT_NAME`

- Remove the git worktree and branch identified by name.
  `git-wt-delete WT_NAME`

- Print the configured `git-path` value from `.req/config.json`; if `.req/config.json` is missing, the command fails with `Error: .req/config.json not found in the project root`.
  `git-path`

- Print the configured `base-path` value from `.req/config.json`; if `.req/config.json` is missing, the command fails with `Error: .req/config.json not found in the project root`.
  `get-base-path`


- Add `enable-line-numbers` to include `<n>:` prefixes in `files-compress`, `compress`, `files-find`, and `find` output.

- Test static check configuration and execution (standalone).
  `test-static-check {dummy,pylance,ruff,command} [FILES...]`

#### Supported <TAG> in `find` commands

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

### Extension Side Features

TODO: complete with extension side defatures

#### Sound 

TODO: complete with sound extension feature description

## Note on Git usage

TODO: review and rewrite git section according extension features.

This section describes the Git behavior when executing the commands provided by the scripts.

- Required state before execution:
  - Execute commands from a working branch (not in detached HEAD).
  - Preferably, the working tree should be clean: avoid unintended changes in the repository before starting the scripts.
  - Save all files and verify that you are in the correct project directory.
  - **IMPORTANT:** in clude on repository the directory configured in the extension.

- What the scripts do to the repository:
  - The scripts may modify, create, or remove files in the working tree (files on disk).
  - They do not modify Git history (HEAD), branches, or tags automatically.
  - The index (staging area) and history remain unchanged until the user manually performs staging/commit operations.

- How to commit (recommended practice):
  - Review changes generated by the scripts before including them in a commit.
  - Manually add files to commit using `git add <file...>`.
  - Execute the commit with a structured message, for example:
    `git commit -m "change(<COMPONENT>): <SHORT-DESCRIPTION> [<DATE>]"`.
  - Staging and commit operations are under the user's control; the scripts do not perform automatic commits or update Git references.

- Practical warnings:
  - Do not use destructive commands (e.g., `git reset --hard`, `git clean -fd`) to "clean" the repository without verifying the impact.
  - If you prefer to isolate changes, execute commands in a branch or a copy of the repository.

