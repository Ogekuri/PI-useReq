export const PI_USEREQ_STARTUP_TOOL_NAMES = [
  "git-path",
  "get-base-path",
  "files-tokens",
  "files-references",
  "files-compress",
  "files-find",
  "references",
  "compress",
  "find",
  "tokens",
  "files-static-check",
  "static-check",
  "git-check",
  "docs-check",
  "git-wt-name",
  "git-wt-create",
  "git-wt-delete",
] as const;

export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];

export const PI_USEREQ_STARTUP_TOOL_SET = new Set<string>(PI_USEREQ_STARTUP_TOOL_NAMES);

export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[] {
  if (!Array.isArray(value)) {
    return [...PI_USEREQ_STARTUP_TOOL_NAMES];
  }
  const configured = value.filter((item): item is string => typeof item === "string");
  const enabled = configured.filter((name): name is PiUsereqStartupToolName => PI_USEREQ_STARTUP_TOOL_SET.has(name));
  return [...new Set(enabled)];
}
