/**
 * @file
 * @brief Declares the canonical bundled `req-*` prompt-command inventory.
 * @details Centralizes prompt-command names shared by extension registration, configuration normalization, debug-menu rendering, and prompt-runtime orchestration. The module is side-effect free. Lookup cost is O(1) per exported constant access.
 */

/**
 * @brief Lists bundled prompt-command names handled by the extension.
 * @details Provides the single source of truth for `req-*` prompt registration, required-document routing, debug-prompt inventory derivation, and prompt-command worktree orchestration. Access complexity is O(1).
 */
export const PROMPT_COMMAND_NAMES = [
  "analyze",
  "change",
  "check",
  "cover",
  "create",
  "fix",
  "flowchart",
  "implement",
  "new",
  "readme",
  "recreate",
  "refactor",
  "references",
  "renumber",
  "workflow",
  "write",
] as const;

/**
 * @brief Narrows prompt-command identifiers to the bundled command set.
 * @details Compile-time alias reused by orchestration helpers, debug inventory normalization, and command registration. The alias introduces no runtime cost.
 */
export type PromptCommandName = (typeof PROMPT_COMMAND_NAMES)[number];

/**
 * @brief Formats one bundled prompt-command identifier as its slash-command name.
 * @details Prefixes the canonical prompt name with `req-` so debug menus and log filters can use the invokable slash-command form without duplicating the underlying inventory. Runtime is O(n) in prompt-name length. No external state is mutated.
 * @param[in] promptName {PromptCommandName} Canonical bundled prompt name.
 * @return {`req-${PromptCommandName}`} Invokable slash-command name.
 */
export function formatPromptCommandName(
  promptName: PromptCommandName,
): `req-${PromptCommandName}` {
  return `req-${promptName}`;
}
