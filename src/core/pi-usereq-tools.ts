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
  "files-tokens",
  "files-references",
  "files-compress",
  "files-search",
  "references",
  "compress",
  "search",
  "tokens",
  "files-static-check",
  "static-check",
] as const;

/**
 * @brief Enumerates supported embedded pi CLI tools configurable through `enabled-tools`.
 * @details The tuple is constrained to embedded tools that remain independently addressable alongside the extension-owned tool inventory. Membership checks become O(1) when projected through `PI_USEREQ_EMBEDDED_TOOL_SET`.
 * @satisfies REQ-063
 */
export const PI_USEREQ_EMBEDDED_TOOL_NAMES = ["read", "bash", "edit", "write", "find", "grep", "ls"] as const;

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
 * @details Enables the documented analysis and static-check custom tools plus the supported embedded read/write shell quartet, while leaving embedded discovery helpers disabled until explicitly configured. Access complexity is O(1).
 * @satisfies REQ-064
 */
export const PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES = [
  "files-tokens",
  "files-references",
  "files-compress",
  "files-search",
  "references",
  "compress",
  "search",
  "tokens",
  "files-static-check",
  "static-check",
  ...PI_USEREQ_DEFAULT_EMBEDDED_TOOL_NAMES,
] as const;

/**
 * @brief Provides O(1) membership checks for default-enabled configurable tools.
 * @details Materializes the canonical default-enabled tuple as a `Set<string>` so menu-ordering and config helpers can partition default-enabled and default-disabled tool names without repeated linear scans. Construction occurs once at module load.
 * @satisfies REQ-064
 */
export const PI_USEREQ_DEFAULT_ENABLED_TOOL_SET = new Set<string>(
  PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES,
);

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

/**
 * @brief Builds the menu-order partition key for one configurable tool name.
 * @details Encodes the documented `Enable tools` ordering by grouping custom tools before embedded tools, placing non-`files-*` custom tools before `files-*` custom tools, and moving default-disabled names to the tail of each resolved partition. Runtime is O(1). No external state is mutated.
 * @param[in] name {PiUsereqStartupToolName} Canonical configurable tool name.
 * @return {[number, number, number, string]} Stable tuple `{group, subgroup, default_state, name}` used for lexicographic ordering.
 * @satisfies REQ-007, REQ-231, REQ-232
 */
function buildPiUsereqStartupToolSortKey(
  name: PiUsereqStartupToolName,
): [number, number, number, string] {
  const isCustomTool = PI_USEREQ_CUSTOM_TOOL_SET.has(name);
  const groupRank = isCustomTool ? 0 : 1;
  const subgroupRank = isCustomTool && name.startsWith("files-") ? 1 : 0;
  const defaultStateRank = PI_USEREQ_DEFAULT_ENABLED_TOOL_SET.has(name) ? 0 : 1;
  return [groupRank, subgroupRank, defaultStateRank, name];
}

/**
 * @brief Compares two configurable tool names using the documented menu order.
 * @details Applies the partition key emitted by `buildPiUsereqStartupToolSortKey(...)` and falls back to lexical comparison inside the final key slot so the `Enable tools` submenu stays deterministic across runtimes. Runtime is O(1). No external state is mutated.
 * @param[in] left {PiUsereqStartupToolName} Left configurable tool name.
 * @param[in] right {PiUsereqStartupToolName} Right configurable tool name.
 * @return {number} Negative when `left` sorts before `right`; positive when after; `0` when equal.
 * @satisfies REQ-007, REQ-231, REQ-232
 */
export function comparePiUsereqStartupToolNames(
  left: PiUsereqStartupToolName,
  right: PiUsereqStartupToolName,
): number {
  const leftKey = buildPiUsereqStartupToolSortKey(left);
  const rightKey = buildPiUsereqStartupToolSortKey(right);
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] < rightKey[index]) {
      return -1;
    }
    if (leftKey[index] > rightKey[index]) {
      return 1;
    }
  }
  return 0;
}
