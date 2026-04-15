import { buildPromptReplacementPaths, type UseReqConfig } from "./config.js";
import { readBundledPrompt } from "./resources.js";

const TOOL_REFERENCE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/`req --find`/g, "`find` tool"],
  [/`req --files-find`/g, "`files-find` tool"],
  [/`req --references`/g, "`references` tool"],
  [/`req --compress`/g, "`compress` tool"],
  [/`req --tokens`/g, "`tokens` tool"],
  [/`req --static-check`/g, "`static-check` tool"],
  [/`req --files-static-check`/g, "`files-static-check` tool"],
  [/`req --git-check`/g, "`git-check` tool"],
  [/`req --docs-check`/g, "`docs-check` tool"],
  [/`req --git-wt-name`/g, "`git-wt-name` tool"],
  [/`req --git-wt-create`/g, "`git-wt-create` tool"],
  [/`req --git-wt-delete`/g, "`git-wt-delete` tool"],
  [/`req --git-path`/g, "`git-path` tool"],
  [/`req --get-base-path`/g, "`get-base-path` tool"],
  [/\breq --find\b/g, "find tool"],
  [/\breq --files-find\b/g, "files-find tool"],
  [/\breq --references\b/g, "references tool"],
  [/\breq --compress\b/g, "compress tool"],
  [/\breq --tokens\b/g, "tokens tool"],
  [/\breq --static-check\b/g, "static-check tool"],
  [/\breq --files-static-check\b/g, "files-static-check tool"],
  [/\breq --git-check\b/g, "git-check tool"],
  [/\breq --docs-check\b/g, "docs-check tool"],
  [/\breq --git-wt-name\b/g, "git-wt-name tool"],
  [/\breq --git-wt-create\b/g, "git-wt-create tool"],
  [/\breq --git-wt-delete\b/g, "git-wt-delete tool"],
  [/\breq --git-path\b/g, "git-path tool"],
  [/\breq --get-base-path\b/g, "get-base-path tool"],
];

export function adaptPromptForInternalTools(text: string): string {
  let updated = text;
  for (const [pattern, replacement] of TOOL_REFERENCE_REPLACEMENTS) {
    updated = updated.replace(pattern, replacement);
  }
  return updated;
}

export function applyReplacements(text: string, replacements: Record<string, string>): string {
  let updated = text;
  for (const [token, replacement] of Object.entries(replacements)) {
    updated = updated.split(token).join(replacement);
  }
  return updated;
}

export function renderPrompt(promptName: string, args: string, projectBase: string, config: UseReqConfig): string {
  const prompt = readBundledPrompt(promptName);
  const replacements = {
    ...buildPromptReplacementPaths(projectBase, config),
    "%%ARGS%%": args,
  };
  return adaptPromptForInternalTools(applyReplacements(prompt, replacements));
}
