/**
 * @file
 * @brief Declares the built-in pi-usereq startup tool inventory.
 * @details Provides the canonical tool-name list and normalization helpers used by configuration loading and extension startup. The module is side-effect free. Lookup and normalization costs are linear in the configured tool count.
 */

/**
 * @brief Enumerates every pi-usereq tool that can be auto-enabled at session start.
 * @details The tuple is the single source of truth for configuration validation, default enablement, and extension registration filtering. Membership checks become O(1) when projected through `PI_USEREQ_STARTUP_TOOL_SET`.
 */
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

/**
 * @brief Represents one valid startup-tool identifier.
 * @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_STARTUP_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
 */
export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];

/**
 * @brief Provides O(1) membership checks for startup-tool validation.
 * @details Materializes the canonical tuple as a `Set<string>` so config sanitizers can discard unknown tool names without repeated linear scans. Construction occurs once at module load.
 */
export const PI_USEREQ_STARTUP_TOOL_SET = new Set<string>(PI_USEREQ_STARTUP_TOOL_NAMES);

/**
 * @brief Normalizes a user-configured startup-tool list.
 * @details Returns the default full tool list when the input is not an array. Otherwise filters to string entries, removes names outside the canonical startup set, and deduplicates while preserving first-seen order. Time complexity is O(n). No external state is mutated.
 * @param[in] value {unknown} Raw configuration payload for `enabled-tools`.
 * @return {PiUsereqStartupToolName[]} Deduplicated canonical tool names.
 * @post Returned values are members of `PI_USEREQ_STARTUP_TOOL_NAMES` only.
 */
export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[] {
  if (!Array.isArray(value)) {
    return [...PI_USEREQ_STARTUP_TOOL_NAMES];
  }
  const configured = value.filter((item): item is string => typeof item === "string");
  const enabled = configured.filter((name): name is PiUsereqStartupToolName => PI_USEREQ_STARTUP_TOOL_SET.has(name));
  return [...new Set(enabled)];
}
