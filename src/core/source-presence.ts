/**
 * @file
 * @brief Detects analyzable source presence and writes no-source placeholder documents.
 * @details Exposes the git-file-inventory probe that decides whether the configured source directories hold at least one supported source file, plus the documented placeholder payloads and the writer that materializes them under `<base-path>/<docs-dir>`. Consumed by the non-agentic `req-references` workflow and by the `req-workflow` preflight so documentation-only repositories receive the documented `NO_SOURCE_CODE_DETECTED` system directive instead of failing source extraction or dispatching an agentic workflow. Runtime is dominated by one `git ls-files` subprocess for the presence probe plus one file write. Side effects include subprocess creation and filesystem writes.
 */

import fs from "node:fs";
import path from "node:path";
import type { UseReqConfig } from "./config.js";
import { collectSourceFiles } from "./tool-runner.js";

/**
 * @brief Enumerates the document filenames receiving no-source placeholder payloads.
 * @details Restricts placeholder rendering to the two documents whose generation depends on analyzable source code. Access complexity is O(1).
 */
export type NoSourcePlaceholderFileName = "REFERENCES.md" | "WORKFLOW.md";

/**
 * @brief Declares the exact `REFERENCES.md` payload written when no analyzable source exists.
 * @details Carries the documented `NO_SOURCE_CODE_DETECTED` system directive with `[FILE_CONTENT]: EMPTY_REFERENCES` so downstream LLM Agents stop attempting reference extraction and treat `/req-references` as deprecated for the repository. Access complexity is O(1).
 * @satisfies REQ-620, REQ-622
 */
export const NO_SOURCE_REFERENCES_PLACEHOLDER = `<system_directive>
[STATUS]: NO_SOURCE_CODE_DETECTED
[FILE_CONTENT]: EMPTY_REFERENCES

[CONTEXT_UPDATE]
This repository is structured exclusively for documentation or otherwise lacks analyzable source code. Consequently, this \`REFERENCES.md\` file contains no source code mappings or references.

[AGENT_INSTRUCTIONS]
1. Do not attempt to search, extract, or index source code references within this project.
2. Update current context to reflect that the \`req-references\` skill and the \`/req-references\` command are **UNNECESSARY** and **DEPRECATED** for this specific repository.
3. Do not invoke or prompt the user to execute the \`/req-references\` command during any future interactions within this workspace.
</system_directive>
`;

/**
 * @brief Declares the exact `WORKFLOW.md` payload written when no analyzable source exists.
 * @details Carries the documented `NO_SOURCE_CODE_DETECTED` system directive with `[FILE_CONTENT]: EMPTY_WORKFLOW` so downstream LLM Agents stop attempting workflow extraction and treat `/req-workflow` as deprecated for the repository. Access complexity is O(1).
 * @satisfies REQ-621, REQ-622
 */
export const NO_SOURCE_WORKFLOW_PLACEHOLDER = `<system_directive>
[STATUS]: NO_SOURCE_CODE_DETECTED
[FILE_CONTENT]: EMPTY_WORKFLOW

[CONTEXT_UPDATE]
This repository is structured exclusively for documentation or otherwise lacks analyzable source code. Consequently, this \`WORKFLOW.md\` file contains no execution flows, logic mapping, or source code workflows.

[AGENT_INSTRUCTIONS]
1. Do not attempt to trace, analyze, or map source code execution workflows within this project.
2. Update the current context to reflect that the \`req-workflow\` skill and the \`/req-workflow\` command are **UNNECESSARY** and **DEPRECATED** for this specific repository.
3. Do not invoke or prompt the user to execute the \`/req-workflow\` command during any future interactions within this workspace.
</system_directive>
`;

/**
 * @brief Resolves the placeholder payload for one targeted document.
 * @details Maps the two supported document filenames onto their declared payloads so callers never duplicate the `NO_SOURCE_CODE_DETECTED` directive text. Runtime is O(1). No external state is mutated.
 * @param[in] fileName {NoSourcePlaceholderFileName} Targeted document filename.
 * @return {string} Exact placeholder payload for the document.
 * @satisfies REQ-622
 */
export function resolveNoSourcePlaceholderContent(fileName: NoSourcePlaceholderFileName): string {
  return fileName === "REFERENCES.md"
    ? NO_SOURCE_REFERENCES_PLACEHOLDER
    : NO_SOURCE_WORKFLOW_PLACEHOLDER;
}

/**
 * @brief Tests whether the configured source directories hold at least one supported source file.
 * @details Enumerates the repository git file inventory through `collectSourceFiles(...)`, which applies the configured `src-dir` roots, excluded directories, and the supported-extension filter, so documentation-only repositories report `false` while repositories holding any analyzable language file report `true`. Runtime is dominated by one `git ls-files` subprocess. Side effects include subprocess creation.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration supplying `src-dir`.
 * @return {boolean} `true` when at least one supported source file exists in the configured source inventory.
 * @throws {ReqError} Throws when the git file inventory cannot be collected.
 * @satisfies REQ-620, REQ-621
 */
export function hasAnalyzableSourceFiles(projectBase: string, config: UseReqConfig): boolean {
  return collectSourceFiles(config["src-dir"], projectBase).length > 0;
}

/**
 * @brief Writes one no-source placeholder document under the configured docs directory.
 * @details Resolves `<base-path>/<docs-dir>/<fileName>` from the trailing-slash-free persisted `docs-dir` and overwrites it with the exact declared placeholder payload so the resulting document is byte-stable for downstream parsers and tests. Runtime is O(n) in payload length plus one file write. Side effects include one file overwrite.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration supplying `docs-dir`.
 * @param[in] fileName {NoSourcePlaceholderFileName} Targeted document filename.
 * @return {string} Absolute path of the written placeholder document.
 * @throws {Error} Propagates filesystem write failures.
 * @satisfies REQ-620, REQ-621, REQ-622
 */
export function writeNoSourcePlaceholderDocument(
  projectBase: string,
  config: UseReqConfig,
  fileName: NoSourcePlaceholderFileName,
): string {
  const docsDir = config["docs-dir"].replace(/[/\\]+$/, "");
  const documentPath = path.join(projectBase, docsDir, fileName);
  fs.writeFileSync(documentPath, resolveNoSourcePlaceholderContent(fileName), "utf8");
  return documentPath;
}
