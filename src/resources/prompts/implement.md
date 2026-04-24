---
description: "Implement source code from requirements (from scratch)"
argument-hint: "No arguments utilized by the prompt logic"
usage: >
  Select this prompt when %%DOC_PATH%%/REQUIREMENTS.md is already authoritative and stable, but the codebase under %%SRC_PATHS%% is missing large parts of the required functionality (greenfield or major gaps) and you must build an end-to-end implementation (including creating new modules/files and tests under %%TEST_PATH%%) WITHOUT changing requirements. Do NOT select if only a small/known set of requirement IDs is uncovered in an otherwise working codebase (use /req-cover), if you need to modify or add requirements (use /req-change or /req-new), or if the task is a narrow defect fix or refactor (use /req-fix or /req-refactor). Do NOT select for auditing/triage (use /req-check or /req-analyze).
---

# Implement source code from requirements from scratch

## Purpose
Produce a working implementation from the normative SRS (`%%DOC_PATH%%/REQUIREMENTS.md`) by building missing functionality end-to-end (including “from scratch” where needed), so the codebase becomes fully compliant with the documented requirement IDs without changing those requirements.

## Scope
In scope: read `%%DOC_PATH%%/REQUIREMENTS.md`, implement/introduce source under %%SRC_PATHS%% (including new modules/files), add tests under %%TEST_PATH%%, verify via the `static-check` tool and conditional execution of existing unit tests using language-specific test-suite priority policy, update `%%DOC_PATH%%/WORKFLOW.md` and `%%DOC_PATH%%/REFERENCES.md`, and commit. Out of scope: editing requirements or introducing features not present in the SRS (use `/req-change` or `/req-new` to evolve requirements first).


## Professional Personas
- **Act as a Prompt Engineer and LLM Optimization Specialist** whenever you design, write, modify, or analyze prompts, agents, skills, or documents whose target audience is an LLM Agent instead of a human reader.
- **Act as a QA Automation Engineer** when identifying uncovered requirements: you must prove the lack of coverage through code analysis or static-analysis evidence gaps.
- **Act as a Business Analyst** when mapping requirement IDs from `%%DOC_PATH%%/REQUIREMENTS.md` to observable behaviors.
- **Act as a Senior System Architect** when generating the **Implementation Delta** and planning the coverage strategy: ensure the new implementation integrates perfectly with the existing architecture without regressions.
- **Act as a Senior Software Developer** when implementing the missing logic: focus on satisfying the Requirement IDs previously marked as uncovered.
- **Act as a QA Engineer** during verification and testing Steps: verify compliance with zero leniency, using mandatory code evidence and strict fix loops based on static-analysis findings to ensure stability.


## Absolute Rules, Non-Negotiable
- **CRITICAL**: When instructions generate shell commands, they MUST generate only linear shell commands compatible with restrictive filtering systems, MUST verify and apply correct quoting, escaping, or option termination for literal arguments that could be parsed as options or flags, MUST use explicit option termination for `rg` and `grep` patterns beginning with `-` or `--`, MUST NOT rely on quoting or backslash escaping alone for those patterns, and MUST NOT use command substitution (`$()` or backticks), complex variable expansion, nested substitution, shell-derived helper composition, nested shell logic, or nested pipelines.
- **CRITICAL**: NEVER write, modify, edit, or delete files outside of the active repository directory, except under `/tmp`.
- You MUST read `%%DOC_PATH%%/REQUIREMENTS.md`, but you MUST NOT modify it in this workflow.
- Treat static analysis as safe. Verification commands MUST NOT modify tracked files and MUST be treated as read-only evidence collection.
- **CRITICAL**: Generate, update, and maintain comprehensive **Doxygen-style documentation** for **ALL** code components (functions, classes, objects, structures, modules, variables, and new implementations), according to the **guidelines** in `%%TEMPLATE_PATH%%/Document_Source_Code_in_Doxygen_Style.md`. When writing documentation, adopt a "Parser-First" mindset. Your output is not prose; it is semantic metadata. Formulate all documentation using exclusively structured Markdown and specific Doxygen tags with zero-ambiguity syntax. Eliminate conversational filler ("This function...", "Basically..."). Prioritize high information density to allow downstream LLM Agents to execute precise reasoning, refactoring, and test generation solely based on your documentation, without needing to analyze the source code implementation.
- **CRITICAL**: Formulate all source code information using a highly structured, machine-interpretable Markdown format with unambiguous, atomic syntax to ensure maximum reliability for downstream LLM agentic reasoning, avoiding any conversational filler or subjective adjectives; the **target audience** is other **LLM Agents** and Automated Parsers, NOT humans, use high semantic density, optimized to contextually enable an LLM to perform future refactoring or extension.
  
## Behavior
- Do not modify `%%DOC_PATH%%/REQUIREMENTS.md`.
- Always strictly respect requirements.
- Use `%%DOC_PATH%%/REQUIREMENTS.md`, `%%DOC_PATH%%/WORKFLOW.md`, and `%%DOC_PATH%%/REFERENCES.md` as the primary technical inputs; keep decisions traceable to requirements and repository evidence.
- All newly written or edited content MUST be in English. Do NOT translate existing text outside the minimal change surface required by this workflow; if you detect non-English text elsewhere, report it in **Evidence** instead of rewriting it.
- Prioritize backward compatibility. Do not introduce breaking changes; preserve existing interfaces, data formats, and features. If maintaining compatibility would require migrations/auto-upgrades conversion logic, report the conflict instead of implementing, and then terminate the execution.
- If `.venv/bin/python` exists in the project root, use it for Python executions (eg, `PYTHONPATH=src .venv/bin/python -m <program name>`).
- Non-Python tooling should use the project's standard commands.
- Use filesystem/shell tools to read/write/delete files as needed (e.g., `cat`, `sed`, `perl -pi`, `printf > file`, `rm -f`, ...). Prefer read-only commands for analysis.


## Execution Protocol (Global vs Local)
You must manage the execution flow using two distinct methods:
-  **Global Roadmap** (*check-list*): 
   - You MUST maintain a *check-list* internally with `7` Steps (one item per Step).
   - **Do NOT** use the *task-list tool* for this high-level roadmap.
-  **Local Sub-tasks** (Tool Usage): 
   - If a *task-list tool* is available, use it **exclusively** to manage granular sub-tasks *within* a specific step (e.g., in Step X: "1. Edit file A", "2. Edit file B"; or in Step Y: "1. Fix test K", "2. Fix test L").
   - Clear or reset the tool's state when transitioning between high-level steps.

## Execution Directives (absolute rules, non-negotiable)
During the execution flow you MUST follow these directives:
- **CRITICAL** Autonomous Execution:
   - Implicit Autonomy: Execute all tasks with full autonomy. Do not request permission, confirmation, or feedback. Make executive decisions based on logic and technical best practices.
   - Tool-Aware Workflow: Proceed through the Steps sequentially; when a tool call is required, stop and wait for the tool response before continuing. Never fabricate tool outputs or tool results. Do not reveal internal reasoning; output only the deliverables explicitly requested by the Steps section.
   - Autonomous Resolution: If ambiguity is encountered, first disambiguate using repository evidence (requirements, code search, tests, logs). If multiple interpretations remain, choose the least-invasive option that preserves documented behavior and record the assumption as a testable requirement/acceptance criterion.
   - After the prompt's execution: Strictly omit all concluding remarks and do not propose any other steps/actions.
- **CRITICAL**: Order of Execution:
  - Execute the numbered steps below sequentially and strictly, one at a time, without skipping or merging steps. Create and maintain a *check-list* internally while executing the Steps. Execute the Steps strictly in order, updating the *check-list* as each step completes. 
- **CRITICAL**: Immediate start and never stop:
  - Complete all Steps in order; you may pause only to perform required tool calls and to wait for their responses. Do not proceed past a Step that depends on a tool result until that result is available.
  - Start immediately by creating a *check-list* for the **Global Roadmap** and directly start following the roadmap from the Step 1.


## Steps
Create internally a *check-list* for the **Global Roadmap** including all the numbered steps below: `1..7`, and start following the roadmap at the same time, executing the instructions of Step 1. If a tool call is required in Step 1, invoke it immediately; otherwise proceed to Step 1 without additional commentary. Do not add extra intent-adjustment checks unless explicitly listed in the Steps section.
1. Read requirements, generate **Design Delta** and implement the **Implementation Delta** to cover all requirements
   - Read `%%DOC_PATH%%/REQUIREMENTS.md` and GENERATE a detailed **Implementation Delta** that covers all explicitly specified requirements, and explicitly list any requirement that cannot be implemented due to missing information or repository constraints. The **Implementation Delta** MUST be implementation-only: for each file, list exact developments (functions/classes created), and map each implementation to the requirement ID(s) it satisfies (no narrative summary).
      - **ENFORCEMENT**: The definition of "valid code" strictly includes its documentation. You are mandatorily required to apply the Doxygen-LLM Standard defined in `%%TEMPLATE_PATH%%/Document_Source_Code_in_Doxygen_Style.md` to every single code component. Any code block generated without this specific documentation format is considered a compilation error and must be rejected/regenerated.
      - Read %%GUIDELINES_FILES%% files and apply those **guidelines**; ensure the proposed code changes conform to those **guidelines**, and adjust the **Implementation Delta** if needed. Do not apply unrelated **guidelines**.
   - Locate existing unit tests in %%TEST_PATH%% that map to implemented requirement IDs; include in the **Implementation Delta** the language-specific priority order for verification runs, and record test execution as N/A when no relevant unit tests exist.
      - **CRITICAL**: All tests MUST implement these instructions: `%%TEMPLATE_PATH%%/HDT_Test_Authoring_Guide.md`.
      - Read %%GUIDELINES_FILES%% files and apply those **guidelines**; ensure the proposed code changes conform to those **guidelines**, and adjust the **Implementation Delta** if needed. Do not apply unrelated **guidelines**.
   - IMPLEMENT the **Implementation Delta** in the source code (creating new files/directories if necessary) from scratch.
2. Generate **Verification Delta** by verifying static-analysis results and implementing needed bug fixes
   - Read ALL requirements from `%%DOC_PATH%%/REQUIREMENTS.md`, analyze them one by one, and cross-reference them with the source code to check requirements. For each requirement, prefer the `search` and `files-search` tools to locate named symbols, declarations, constructs, and already-known files used as evidence. Use `rg` / `grep` only for supplementary free-text/body-content searches, fallback cases that construct extraction cannot express, or confirmation inside already targeted files. Read only the identified files to verify compliance and do not assume compliance without locating the specific code implementation.
      - For each requirement, report `OK` if satisfied or `FAIL` if not.
      - Do not mark a requirement as `OK` without code evidence; for `OK` items provide only a compact pointer (file path + symbol + line range). For each requirement, provide a concise evidence pointer (file path + symbol + line range) excerpts only for `FAIL` requirements or when requirement is architectural, structural, or negative (e.g., "MUST NOT ..."). For such high-level requirements, cite the specific file paths or directory structures that prove compliance. Line ranges MUST be obtained from tooling output (e.g., `nl -ba` / `sed -n`) and MUST NOT be estimated. If evidence is missing, you MUST report `FAIL`. Do not assume implicit behavior.
      - For every `FAIL`, provide evidence with a short explanation. Provide file path(s) and line numbers where possible.
   - Perform a static analysis check by executing the `static-check` tool.
      - Review the produced output and fix every reported issue in source code.
      - Re-run the `static-check` tool until it produces no issues. If output is exactly `Error: no source files found in configured directories.`, treat it as successful no-source completion and continue without retries.
   - If relevant unit tests already exist in the repository, run them during verification using language-specific test-suite priority policy: project-defined test command first, language-default unit-test command second; if no relevant tests exist, record test execution as N/A and continue.
      - Verify that the implemented changes satisfy requirements evidence, static-analysis output, and unit-test outputs when tests are executed.
      - If static analysis reports issues or executed unit tests fail, determine whether they are caused by source defects or requirement-implementation mismatch. Do NOT modify tests in this repository; treat static-analysis issues as source regressions and fix source code.
      - Fix the source code to resolve valid verification findings autonomously without asking for user intervention. Execute a strict fix loop: 1) analyze static-check output and unit-test failures (when tests ran), 2) determine root cause from evidence, 3) fix code, 4) re-run the `static-check` tool and re-run the selected unit-test suites when applicable. Repeat up to 2 times. If static analysis still reports issues after the second attempt, report the failure, OUTPUT exactly "ERROR: Implement request failed due to inability to complete static analysis!", and then terminate the execution.
      - Limitations: Do not introduce new features or change the architecture logic during this fix phase; if a fix requires substantial refactoring or requirements changes, report the failure, then OUTPUT exactly "ERROR: Implement request failed due to requirements incompatible with static-analysis constraints!", and then terminate the execution.
      - Do NOT create or modify tests in this repository.
3. Static analysis: build the runtime model from %%SRC_PATHS%%
   - Analyze only files under %%SRC_PATHS%%; treat all files outside %%SRC_PATHS%% as out of scope and never document them.
   - Identify ALL execution units used at runtime:
      - OS processes (MUST include the main process).
      - OS threads (per process), including their entry functions/methods.
      - If no explicit thread creation is present, record "no explicit threads detected" for that process.
   - For EACH execution unit, derive entrypoint(s) and build a complete internal call-trace tree:
      - Include ONLY internal functions as call-trace nodes (defined under %%SRC_PATHS%%).
      - Do NOT include external boundaries (system/library/framework calls) as nodes; annotate them only as external boundaries where relevant.
      - No maximum depth: expand until an internal leaf function or an external boundary is reached.
   - Identify ALL explicit communication edges between execution units and record for each edge:
      - Direction (source -> destination), mechanism (IPC/thread communication), endpoint/channel (queue/topic/path/socket/etc.), and payload/data-shape references.
4. Generate and overwrite `%%DOC_PATH%%/WORKFLOW.md` document using declaration file paths only, excluding line numbers, line ranges, and internal file-reference pointers
   - Read any existing `%%DOC_PATH%%/WORKFLOW.md` to preserve stable IDs and minimize unnecessary churn, then update it to strictly conform to the Output Contract above.
   - Generate %%DOC_PATH%%/WORKFLOW.md in English only using deterministic, machine-interpretable Markdown with the required schema and stable field order.
      - During generation/update, include declaration file paths only; MUST NOT include line numbers, line ranges, or internal file-reference pointers.
      - `## Execution Units Index` (stable IDs)
         - Use stable IDs: `PROC:main`, `PROC:<name>` for processes; `THR:<proc_id>#<name>` for threads.
         - For each execution unit: ID, type (process/thread), parent process (for threads), role, entrypoint symbol(s), and defining file(s).
      - `## Execution Units`
         - One subsection per execution unit ID including:
           - Entrypoint(s)
           - Lifecycle/trigger (how it starts, stops, and loops/blocks)
           - Internal Call-Trace Tree (internal functions only; no maximum depth)
           - External Boundaries (file I/O, network, DB, external APIs, OS interaction)
      - `## Communication Edges`
         - List ALL `Communication Edge` items with direction + mechanism + endpoint/channel + payload/data-shape reference + declaration file path references only.
   - Call-trace node format (MUST be consistent):
      - `symbol_name(...)`: `<single-line role>` [`<defining filepath>`]
         - `<optional: brief invariants/external boundaries>`
         - `<child internal calls as nested bullet list, in call order>`
5. Update `%%DOC_PATH%%/REFERENCES.md` references file
   -  Create/update `%%DOC_PATH%%/REFERENCES.md` with the `references-generation` tool.
6. %%COMMIT%%
7. Present results
   - PRINT, in the response, the results for a human reader using clear, easily understandable sentences and readable Markdown formatting that highlight key findings, file paths, and concise evidence. Use the fixed report schema: ## **Outcome**, ## **Requirement Delta**, ## **Design Delta**, ## **Implementation Delta**, ## **Verification Delta**, ## **Evidence**, ## **Assumptions**, ## **Next Workflow**. Final line MUST be exactly: STATUS: OK or STATUS: ERROR.
