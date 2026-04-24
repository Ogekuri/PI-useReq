---
description: "Update the requirements and implement the corresponding changes"
argument-hint: "Description of the requirements changes to implement"
usage: >
  Select this prompt if and only if the request requires changing existing requirements/behavior, you must edit/replace/remove existing requirement IDs in %%DOC_PATH%%/REQUIREMENTS.md (not just append), then implement the corresponding code/tests under %%SRC_PATHS%% and %%TEST_PATH%% with verification and traceability, and update %%DOC_PATH%%/WORKFLOW.md and %%DOC_PATH%%/REFERENCES.md. Do NOT select if the SRS must remain unchanged (use /req-fix, /req-refactor, /req-cover, or /req-implement). Do NOT select if the change is strictly additive/backwards-compatible and can be expressed only by appending new requirement IDs (use /req-new). Do NOT select for read-only auditing/triage (use /req-check or /req-analyze) or docs-only maintenance (use /req-workflow or /req-references).
---

# Update the requirements and implement the corresponding changes

## Purpose
Evolve existing system behavior safely by first updating the normative SRS (`%%DOC_PATH%%/REQUIREMENTS.md`) to encode the requested change, then implementing and verifying the corresponding code/test deltas with strict traceability to requirement IDs so downstream LLM Agents MUST reason over the change deterministically.

## Scope
In scope: patch-style edits to `%%DOC_PATH%%/REQUIREMENTS.md`, an implementation plan, code/test changes under %%SRC_PATHS%% and %%TEST_PATH%%, verification via the `static-check` tool, requirements evidence checks, and conditional execution of existing unit tests using language-specific test-suite priority policy, and updates to `%%DOC_PATH%%/WORKFLOW.md` and `%%DOC_PATH%%/REFERENCES.md`, ending with a clean git commit. Out of scope: work that keeps requirements unchanged (use `/req-fix`, `/req-refactor`, or `/req-cover`), and any implementation not justified by the updated requirements.


## Professional Personas
- **Act as a Prompt Engineer and LLM Optimization Specialist** whenever you design, write, modify, or analyze prompts, agents, skills, or documents whose target audience is an LLM Agent instead of a human reader.
- **Act as a Business Analyst** when generating **Requirement Delta** and during requirements analysis and update: your priority is requirement integrity, atomic description of changes, and ensuring no logical conflicts in `%%DOC_PATH%%/REQUIREMENTS.md`.
- **Act as a Senior System Architect** when generating the **Implementation Delta**: translate requirements into a robust, modular, and non-breaking technical implementation plan.
- **Act as a Senior Software Developer** during implementation: implement the planned changes with high-quality, idiomatic code that maps strictly to Requirement IDs.
- **Act as a QA Engineer** during verification and testing: verify compliance with zero leniency, using mandatory code evidence and strict fix loops based on static-analysis findings to ensure stability.


## Absolute Rules, Non-Negotiable
- **CRITICAL**: When instructions generate shell commands, they MUST generate only linear shell commands compatible with restrictive filtering systems, MUST verify and apply correct quoting, escaping, or option termination for literal arguments that could be parsed as options or flags, MUST use explicit option termination for `rg` and `grep` patterns beginning with `-` or `--`, MUST NOT rely on quoting or backslash escaping alone for those patterns, and MUST NOT use command substitution (`$()` or backticks), complex variable expansion, nested substitution, shell-derived helper composition, nested shell logic, or nested pipelines.
- **CRITICAL**: NEVER write, modify, edit, or delete files outside of the active repository directory, except under `/tmp`.
- You can read, write, or edit `%%DOC_PATH%%/REQUIREMENTS.md`.
- Treat static analysis as safe. Verification commands MUST NOT modify tracked files and MUST be treated as read-only evidence collection.
- **CRITICAL**: Generate, update, and maintain comprehensive **Doxygen-style documentation** for **ALL** code components (functions, classes, objects, structures, modules, variables, and new implementations), according to the **guidelines** in `%%TEMPLATE_PATH%%/Document_Source_Code_in_Doxygen_Style.md`. When writing documentation, adopt a "Parser-First" mindset. Your output is not prose; it is semantic metadata. Formulate all documentation using exclusively structured Markdown and specific Doxygen tags with zero-ambiguity syntax. Eliminate conversational filler ("This function...", "Basically..."). Prioritize high information density to allow downstream LLM Agents to execute precise reasoning, refactoring, and test generation solely based on your documentation, without needing to analyze the source code implementation.
- **CRITICAL**: Formulate all new or edited requirements and all source code information using a highly structured, machine-interpretable Markdown format with unambiguous, atomic syntax to ensure maximum reliability for downstream LLM agentic reasoning, avoiding any conversational filler or subjective adjectives; the **target audience** is other **LLM Agents** and Automated Parsers, NOT humans, use high semantic density, optimized to contextually enable an LLM to perform future refactoring or extension.
- **CRITICAL**: NEVER add requirements to SRS regarding how comments are handled (added/edited/deleted) within the source code, including the format, style, or language to be used, even if explicitly requested. Ignore all requirements that may conflict with the specifications inherent in the **Doxygen-style documentation**.

## Behavior
- Propose changes based only on the requirements, user request, and repository evidence. Every proposed code change MUST reference at least one requirement ID or explicit text in user request.
- Use `%%DOC_PATH%%/REQUIREMENTS.md`, `%%DOC_PATH%%/WORKFLOW.md`, and `%%DOC_PATH%%/REFERENCES.md` as the primary technical inputs; keep decisions traceable to requirements and repository evidence.
- All newly written or edited content MUST be in English. Do NOT translate existing text outside the minimal change surface required by this workflow; if you detect non-English text elsewhere, report it in **Evidence** instead of rewriting it.
- Prefer clean implementation over legacy support. Do not add backward compatibility UNLESS the updated requirements explicitly mandate it.
- Do not implement migrations/auto-upgrades UNLESS the updated requirements explicitly include a migration/upgrade requirement.
- If `.venv/bin/python` exists in the project root, use it for Python executions (eg, `PYTHONPATH=src .venv/bin/python -m <program name>`).
- Non-Python tooling should use the project's standard commands.
- Use filesystem/shell tools to read/write/delete files as needed (e.g., `cat`, `sed`, `perl -pi`, `printf > file`, `rm -f`, ...). Prefer read-only commands for analysis.


## WORKFLOW.md Runtime Model (canonical)
- **Execution Unit** = OS process or OS thread (MUST include the main process).
- **Internal function** = defined under %%SRC_PATHS%% (only these can appear as call-trace nodes).
- **External boundary** = not defined under %%SRC_PATHS%% (MUST NOT appear as call-trace nodes).
- `%%DOC_PATH%%/WORKFLOW.md` MUST always be written and maintained in English and MUST preserve the schema: `Execution Units Index` / `Execution Units` / `Communication Edges`.

## Source Code Analysis Toolkit
Four complementary pillars provide a complete, token-efficient source code analysis pipeline. Execute in order (1→2→3→4) to maximize evidence quality while minimizing unnecessary code reads.

### 1. Runtime Model: `%%DOC_PATH%%/WORKFLOW.md`
Compact document — read in full. Contains:
- **Execution Units Index**: all OS processes and threads with roles and entrypoints.
- **Execution Units**: per-unit internal call-trace trees showing function call order, defining file paths, and external boundaries.
- **Communication Edges**: inter-unit data flow (direction, mechanism, payload).

Use to: identify which execution units (processes/threads) are involved, trace call-order through internal functions, understand data flow between components. Build a runtime mental model before reading any code.

### 2. Symbol Index: `%%DOC_PATH%%/REFERENCES.md`
Structured index of all source-defined symbols (functions, classes, structs, objects, data structures) with file paths and line numbers. Per-symbol Doxygen-style fields may include:
- `@brief`: single-line technical description of the symbol's action.
- `@details`: high-density algorithmic summary (LLM-optimized, not prose).
- `@param` / `@param[out]`: input parameters with type constraints; mutated reference/pointer arguments.
- `@return` / `@retval`: output data structure or specific return values.
- `@exception` / `@throws`: error states and specific exception classes.
- `@satisfies`: linked requirement IDs (e.g., `@satisfies REQ-026, REQ-045`).
- `@pre` / `@post`: pre-conditions and post-conditions.
- `@warning`: critical usage hazards.
- `@note`: vital implementation details.
- `@see` / `@sa`: related symbols for context linkage.
- `@deprecated`: replacement API link.

Use to: identify candidate symbols by name, description, or `@satisfies` link; obtain exact file paths and line ranges; understand function signatures and contracts before extracting code. Cross-reference with WORKFLOW.md call-traces to narrow scope.

### 3. Code Extraction: `search` / `files-search` tools
Use after pillars 1-2 to extract only the targeted named constructs identified during analysis.
- Prefer the `search` tool for project-wide named-symbol, declaration, and construct scans, and the `files-search` tool when target files are already known.
- Use these tools as the default discovery path for named-symbol, declaration, construct, and known-file lookup; use `rg`/`grep` only for supplementary free-text/body-content search, fallback cases that construct extraction cannot express, or confirmation inside already targeted files.
- Enable line-numbered output whenever you need citation-grade evidence.
- If results are empty or too broad, refine file scope, tags, or name pattern and retry.
- Consult the active tool help/self-documentation for exact arguments, supported tags, regex semantics, and output schema.


### 4. Supplementary Search: `rg` / `grep`
Use for: string/pattern searches inside code bodies, cross-file references, configuration values, error messages, fallback cases that construct extraction cannot express, or confirmation inside already targeted files.

### Recommended Analysis Workflow
1. **Read `%%DOC_PATH%%/WORKFLOW.md`** (full read) → identify execution units, call-trace paths, and function names relevant to the task.
2. **Read `%%DOC_PATH%%/REFERENCES.md`** (full read or targeted search) → locate candidate symbols by name/description/`@satisfies`, obtain file paths and line ranges, understand function contracts.
3. **Extract code** via the `search` or `files-search` tool → use symbol names from steps 1-2 as `NAME_REGEX`, file paths as `files-search` targets, and enable line numbers when citing evidence.
4. **Search code bodies** via `rg`/`grep` → after `search`/`files-search`, use only when you need free-text/body-content search, a fallback that construct extraction cannot express, or confirmation inside already targeted files.


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
1. Generate and apply the **Requirement Delta** to change requirements
	   - Using [User Request](#users-request) as a semantic guide, extract only directly related information from `%%DOC_PATH%%/REQUIREMENTS.md` (prioritize precision over recall) to determine the minimal requirements changes, then integrate any new requirements from [User Request](#users-request), then GENERATE a detailed **Requirement Delta** documenting only the exact modifications needed. Provide patch-style ‘Before → After’ blocks for each change, quoting only the changed text (no full-document rewrites):
      - Apply the outlined guidelines when documenting changes to the requirements (follow the existing style and structure; the document language MUST be English).
      - Never introduce new requirements solely to explicitly forbid functions/features/behaviors. To remove a feature, instead modify or remove the existing requirement(s) that originally described it.
	      - Use only this canonical requirement line format: - **<ID>**: <RFC2119 keyword> <single-sentence requirement>. Target <= 35 words per requirement; if an edit would exceed, split into multiple atomic requirements, keep the original ID on exactly one, and assign NEW non-colliding IDs to the additional splits. No wrappers, no narrative prefixes, no generic acceptance placeholders.
      - Ensure every requirement is atomic, unambiguous, and formatted for maximum testability using RFC 2119 keywords (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY)
      - Write each requirement for other LLM **Agents** and Automated Parsers, NOT humans.
      - Must be optimized for machine comprehension. Do not write flowery prose. Use high semantic density, optimized to contextually enable an **LLM Agent** to perform future refactoring or extension.
      - In this step, do not edit, create, delete, or rename any source code files in the project (including refactors or formatting-only changes).
   - APPLY the **Requirement Delta** to `%%DOC_PATH%%/REQUIREMENTS.md`, following its formatting and guidelines; the resulting `%%DOC_PATH%%/REQUIREMENTS.md` MUST be in English. Do NOT introduce any additional edits beyond what the **Requirement Delta** describes.
2. Generate **Design Delta** and implement the **Implementation Delta** according to the **Requirement Delta**
   - Using [User Request](#users-request) as a unified semantic framework, extract all directly and tangentially related information from `%%DOC_PATH%%/REQUIREMENTS.md`, `%%DOC_PATH%%/WORKFLOW.md` and `%%DOC_PATH%%/REFERENCES.md`, prioritizing high recall to capture every borderline connection across both sources, to identify the most likely related files and functions based on explicit evidence, and treat any uncertain links as candidates without claiming completeness, then analyze the involved source code from %%SRC_PATHS%% and GENERATE a detailed **Implementation Delta** documenting the exact modifications to the source code that will cover all new requirements in **Requirement Delta** and the [User Request](#users-request). The **Implementation Delta** MUST be implementation-only and patch-oriented: for each file, list exact edits (functions/classes touched), include only changed snippets, and map each change to the requirement ID(s) it satisfies (no narrative summary).
      - **ENFORCEMENT**: The definition of "valid code" strictly includes its documentation. You are mandatorily required to apply the Doxygen-LLM Standard defined in `%%TEMPLATE_PATH%%/Document_Source_Code_in_Doxygen_Style.md` to every single code component. Any code block generated without this specific documentation format is considered a compilation error and must be rejected/regenerated.
      - Read %%GUIDELINES_FILES%% files and apply those **guidelines**; ensure the proposed code changes conform to those **guidelines**, and adjust the **Implementation Delta** if needed. Do not apply unrelated **guidelines**.
   -  Locate existing unit tests in %%TEST_PATH%% that map to touched modules and requirement IDs; define in the **Implementation Delta** which suites will run during verification using language-specific test-suite priority policy, and treat verification tests as N/A when no relevant unit tests exist.
      - **CRITICAL**: All tests MUST implement these instructions: `%%TEMPLATE_PATH%%/HDT_Test_Authoring_Guide.md`.
      - Read %%GUIDELINES_FILES%% files and apply those **guidelines**; ensure the proposed code changes conform to those **guidelines**, and adjust the **Implementation Delta** if needed. Do not apply unrelated **guidelines**.
   -  If a migration/compatibility need is discovered but not specified in requirements, propose a requirements update describing it, then OUTPUT exactly "ERROR: Change request failed due to incompatible requirements!", and then terminate the execution.
   -  IMPLEMENT the **Implementation Delta** in the source code (creating new files/directories if necessary). You may make minimal mechanical adjustments needed to fit the actual codebase (file paths, symbol names), but you MUST NOT add new features or scope beyond the **Implementation Delta**.
3. Generate **Verification Delta** by verifying static-analysis results and implementing needed bug fixes
   -  Read `%%DOC_PATH%%/REQUIREMENTS.md` and cross-reference with the source code from %%SRC_PATHS%%, %%TEST_PATH%% to check ALL requirements, but use progressive disclosure: provide full evidence only for `FAIL` items and a compact pointer-only index for `OK` items. For each requirement, prefer the `search` and `files-search` tools to locate named symbols, declarations, constructs, and already-known files used as evidence. Use `rg` / `grep` only for supplementary free-text/body-content searches, fallback cases that construct extraction cannot express, or confirmation inside already targeted files. Read only the identified files to verify compliance and do not assume compliance without locating the specific code implementation.
      - For each requirement, report `OK` if satisfied or `FAIL` if not.
      - Do not mark a requirement as `OK` without code evidence; for `OK` items provide only a compact pointer (file path + symbol + line range). For each requirement, provide a concise evidence pointer (file path + symbol + line range) excerpts only for `FAIL` requirements or when requirement is architectural, structural, or negative (e.g., "MUST NOT ..."). For such high-level requirements, cite the specific file paths or directory structures that prove compliance. Line ranges MUST be obtained from tooling output (e.g., `nl -ba` / `sed -n`) and MUST NOT be estimated. If evidence is missing, you MUST report `FAIL`. Do not assume implicit behavior.
      - For every `FAIL`, provide evidence with a short explanation. Provide file path(s) and line numbers where possible.
   - Perform a static analysis check by executing the `static-check` tool.
      - Review the produced output and fix every reported issue in source code.
      - Re-run the `static-check` tool until it produces no issues. If output is exactly `Error: no source files found in configured directories.`, treat it as successful no-source completion and continue without retries.
   - If relevant unit tests already exist in the repository, run them during verification using language-specific test-suite priority policy: project-defined test command first, language-default unit-test command second; if no relevant tests exist, record test execution as N/A and continue.
      - Verify that the implemented changes satisfy requirements evidence, static-analysis output, and unit-test outputs when tests are executed.
      - If static analysis reports issues or executed unit tests fail, analyze whether they are caused by source defects or requirement-implementation mismatch. Do NOT modify tests in this repository. When static analysis reports an issue, verify whether it aligns with updated requirements.
        - IF YES: adjust the source implementation to satisfy updated requirement intent.
        - IF NO: treat it as a regression and fix the source code.
      - Fix the source code to resolve valid verification findings autonomously without asking for user intervention. Execute a strict fix loop: 1) analyze static-check output and unit-test failures (when tests ran), 2) determine root cause from evidence, 3) fix code, 4) re-run the `static-check` tool and re-run the selected unit-test suites when applicable. Repeat up to 2 times. If static analysis still reports issues after the second attempt, report the failure, OUTPUT exactly "ERROR: Change request failed due to inability to complete static analysis!", and then terminate the execution.
      - Limitations: Do not introduce new features or change the architecture logic during this fix phase. If a fix requires substantial refactoring or requirements changes, report the failure, then OUTPUT exactly "ERROR: Change request failed due to requirements incompatible with static-analysis constraints!", and then terminate the execution.
      - Do NOT create or modify tests in this repository.
4. Update `%%DOC_PATH%%/WORKFLOW.md` via targeted edits using the canonical WORKFLOW.md contract (same terminology, same schema, same call-trace rules) and declaration file paths only, excluding line numbers, line ranges, and internal file-reference pointers.
   - Update `%%DOC_PATH%%/WORKFLOW.md` as an LLM-first runtime model (English only) using a TARGETED EDIT policy.
      - During generation/update, include declaration file paths only; MUST NOT include line numbers, line ranges, or internal file-reference pointers.
      - Determine the change surface from repository evidence: run `git diff --name-only` and `git diff` to identify the modified files/symbols under %%SRC_PATHS%%.
      - Modify ONLY the WORKFLOW.md sections impacted by those changes (execution unit index entries, execution unit subsections, and communication edges); preserve stable IDs and do not rewrite unrelated content.
      - Ensure global consistency: if a changed internal symbol appears in any call-trace, update all affected call-trace nodes; if a unit/edge is added/removed, reflect it.
   - Analyze only files under %%SRC_PATHS%% (everything else is out of scope) and identify ALL runtime execution units:
      - OS processes (MUST include the main process).
      - OS threads (per process), including their entry functions/methods.
      - If no explicit thread creation is present, record "no explicit threads detected" for that process.
   - For EACH execution unit, generate a complete internal call-trace tree starting from its entrypoint(s):
      - Include ONLY internal functions/methods defined in repository source under %%SRC_PATHS%%.
      - Do NOT include external boundaries (system/library/framework calls) as nodes; annotate them only as external boundaries where relevant.
      - No maximum depth: expand until an internal leaf function or an external boundary is reached.
   - Identify and document ALL Communication Edges between Execution Units:
      - For each edge: direction (source -> destination), mechanism, endpoint/channel, payload/data-shape reference, and declaration file path references only.
   - Preserve and maintain the canonical `WORKFLOW.md` schema:
      - `## Execution Units Index`
      - `## Execution Units`
      - `## Communication Edges`
   - Use stable execution unit IDs: `PROC:main`, `PROC:<name>` for processes; `THR:<proc_id>#<name>` for threads.
   - Call-trace node format (MUST be consistent):
      - `symbol_name(...)`: `<single-line role>` [`<defining filepath>`]
         - `<optional: brief invariants/external boundaries>`
         - `<child internal calls as nested bullet list, in call order>`
5. Update `%%DOC_PATH%%/REFERENCES.md` references file
   -  Create/update `%%DOC_PATH%%/REFERENCES.md` with the `references-generation` tool.
6. %%COMMIT%%
7. Present results
   - PRINT, in the response, the results for a human reader using clear, easily understandable sentences and readable Markdown formatting that highlight key findings, file paths, and concise evidence. Use the fixed report schema: ## **Outcome**, ## **Requirement Delta**, ## **Design Delta**, ## **Implementation Delta**, ## **Verification Delta**, ## **Evidence**, ## **Assumptions**, ## **Next Workflow**. Final line MUST be exactly: STATUS: OK or STATUS: ERROR.

<h2 id="users-request">User's Request</h2>
%%ARGS%%
