/**
 * @file
 * @brief Declares the configurable pi-usereq active-tool inventory.
 * @details Provides canonical custom-tool names, supported embedded-tool names, default enablement subsets, and normalization helpers shared by configuration loading, extension startup, and test doubles. The module is side-effect free. Lookup and normalization costs are linear in configured tool count.
 */

/**
 * @brief Enumerates extension-owned tools configurable through `enabled-tools`.
 * @details The tuple is the single source of truth for custom tool-name validation, default enablement, and active-tool filtering. Membership checks become O(1) when projected through `PI_USEREQ_CUSTOM_TOOL_SET`.
 */
export const PI_USEREQ_CUSTOM_TOOL_NAMES = [
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

/**
 * @brief Enumerates supported embedded pi CLI tools configurable through `enabled-tools`.
 * @details The tuple is constrained to embedded tools that remain independently addressable alongside the extension-owned tool inventory. Membership checks become O(1) when projected through `PI_USEREQ_EMBEDDED_TOOL_SET`.
 * @satisfies REQ-063
 */
export const PI_USEREQ_EMBEDDED_TOOL_NAMES = ["read", "bash", "edit", "write", "grep", "ls"] as const;

/**
 * @brief Enumerates embedded pi CLI tools enabled by default.
 * @details Restricts default embedded-tool activation to the read/write shell quartet required by the updated project configuration behavior. Access complexity is O(1).
 * @satisfies REQ-064
 */
export const PI_USEREQ_DEFAULT_EMBEDDED_TOOL_NAMES = ["read", "bash", "edit", "write"] as const;

/**
 * @brief Enumerates every configurable active-tool name.
 * @details Concatenates extension-owned and supported embedded-tool names into one ordered tuple consumed by configuration normalization and runtime filtering. Access complexity is O(1).
 */
export const PI_USEREQ_STARTUP_TOOL_NAMES = [
  ...PI_USEREQ_CUSTOM_TOOL_NAMES,
  ...PI_USEREQ_EMBEDDED_TOOL_NAMES,
] as const;

/**
 * @brief Enumerates the default enabled-tool configuration.
 * @details Enables every extension-owned tool except `find` plus the supported embedded read/write shell quartet while leaving discovery helpers `find`, `grep`, and `ls` disabled until explicitly configured. Access complexity is O(1).
 * @satisfies REQ-064
 */
export const PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES = [
  "git-path",
  "get-base-path",
  "files-tokens",
  "files-references",
  "files-compress",
  "files-find",
  "references",
  "compress",
  "tokens",
  "files-static-check",
  "static-check",
  "git-check",
  "docs-check",
  "git-wt-name",
  "git-wt-create",
  "git-wt-delete",
  ...PI_USEREQ_DEFAULT_EMBEDDED_TOOL_NAMES,
] as const;

/**
 * @brief Represents one valid extension-owned configurable tool identifier.
 * @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_CUSTOM_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
 */
export type PiUsereqCustomToolName = (typeof PI_USEREQ_CUSTOM_TOOL_NAMES)[number];

/**
 * @brief Represents one valid embedded configurable tool identifier.
 * @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_EMBEDDED_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
 */
export type PiUsereqEmbeddedToolName = (typeof PI_USEREQ_EMBEDDED_TOOL_NAMES)[number];

/**
 * @brief Represents one valid configurable active-tool identifier.
 * @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_STARTUP_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
 */
export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];

/**
 * @brief Provides O(1) membership checks for extension-owned configurable tools.
 * @details Materializes the canonical custom-tool tuple as a `Set<string>` so runtime filters can discard non-extension names without repeated linear scans. Construction occurs once at module load.
 */
export const PI_USEREQ_CUSTOM_TOOL_SET = new Set<string>(PI_USEREQ_CUSTOM_TOOL_NAMES);

/**
 * @brief Provides O(1) membership checks for embedded configurable tools.
 * @details Materializes the supported embedded-tool tuple as a `Set<string>` so runtime filters can discard unsupported builtin names without repeated linear scans. Construction occurs once at module load.
 */
export const PI_USEREQ_EMBEDDED_TOOL_SET = new Set<string>(PI_USEREQ_EMBEDDED_TOOL_NAMES);

/**
 * @brief Provides O(1) membership checks for all configurable active tools.
 * @details Materializes the canonical configurable tuple as a `Set<string>` so config sanitizers can discard unknown tool names without repeated linear scans. Construction occurs once at module load.
 */
export const PI_USEREQ_STARTUP_TOOL_SET = new Set<string>(PI_USEREQ_STARTUP_TOOL_NAMES);

/**
 * @brief Tests whether one tool name belongs to the supported embedded-tool subset.
 * @details Performs one set-membership probe against `PI_USEREQ_EMBEDDED_TOOL_SET`. Runtime is O(1). No external state is mutated.
 * @param[in] name {string} Candidate tool name.
 * @return {boolean} `true` when the name belongs to the embedded configurable-tool subset.
 */
export function isPiUsereqEmbeddedToolName(name: string): name is PiUsereqEmbeddedToolName {
  return PI_USEREQ_EMBEDDED_TOOL_SET.has(name);
}

/**
 * @brief Normalizes a user-configured active-tool list.
 * @details Returns the default enabled-tool tuple when the input is not an array. Otherwise filters to string entries, removes names outside the configurable tool set, and deduplicates while preserving first-seen order. Time complexity is O(n). No external state is mutated.
 * @param[in] value {unknown} Raw configuration payload for `enabled-tools`.
 * @return {PiUsereqStartupToolName[]} Deduplicated canonical tool names.
 * @post Returned values are members of `PI_USEREQ_STARTUP_TOOL_NAMES` only.
 * @satisfies REQ-064
 */
export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[] {
  if (!Array.isArray(value)) {
    return [...PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES];
  }
  const configured = value.filter((item): item is string => typeof item === "string");
  const enabled = configured.filter((name): name is PiUsereqStartupToolName => PI_USEREQ_STARTUP_TOOL_SET.has(name));
  return [...new Set(enabled)];
}
