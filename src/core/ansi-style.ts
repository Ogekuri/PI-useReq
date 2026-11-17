/**
 * @file
 * @brief Centralizes the ANSI SGR styling constants and wrap helpers shared by colored terminal printouts.
 * @details Provides one canonical source of ANSI Select Graphic Rendition parameters plus two composition helpers: `wrapAnsiStyle(...)` styles one fragment with a leading escape and a trailing reset, and `openAnsiStyle(...)` emits only the leading escape for diagnostics whose exact text tail is pinned by downstream contracts. Runtime is O(n) in styled text length. The module is pure and performs no I/O.
 * @satisfies REQ-713, REQ-714, REQ-715, REQ-716, REQ-717, REQ-718
 */

/**
 * @brief ANSI SGR reset sequence terminating every wrapped colored fragment.
 * @details Appended by `wrapAnsiStyle(...)` so styled fragments never leak styling into surrounding text; prefix-only callers emit it themselves when their contract allows. Access complexity is O(1).
 */
export const ANSI_STYLE_RESET = "\u001b[0m";

/**
 * @brief ANSI SGR parameter selecting the intense-yellow foreground color.
 * @details `93` is the ANSI high-intensity yellow foreground used for report section headings and the context-usage percentage segment. Access complexity is O(1).
 * @satisfies REQ-714, REQ-717
 */
export const ANSI_INTENSE_YELLOW = "93";

/**
 * @brief ANSI SGR parameter selecting the intense-white foreground color.
 * @details `97` is the ANSI high-intensity white foreground used for the `Context retained.` retention sentence. Access complexity is O(1).
 * @satisfies REQ-716
 */
export const ANSI_INTENSE_WHITE = "97";

/**
 * @brief ANSI SGR parameter selecting the intense-red foreground color.
 * @details `91` is the ANSI high-intensity red foreground used by terminal orchestration error and warning diagnostics. Access complexity is O(1).
 * @satisfies REQ-718
 */
export const ANSI_INTENSE_RED = "91";

/**
 * @brief ANSI SGR parameter selecting bold emphasis for markdown bold elements.
 * @details `1` is the ANSI bold attribute applied to `**bold**` and `__bold__` markdown spans. Access complexity is O(1).
 * @satisfies REQ-715
 */
export const ANSI_BOLD = "1";

/**
 * @brief ANSI SGR parameter selecting italic emphasis for markdown italic elements.
 * @details `3` is the ANSI italic attribute applied to `*italic*` and `_italic_` markdown spans and to single-quote-span text, composed with `ANSI_CODE` as `3;36` for inline code spans inside single-quote spans. Access complexity is O(1).
 * @satisfies REQ-715, REQ-763, REQ-764
 */
export const ANSI_ITALIC = "3";

/**
 * @brief ANSI SGR parameter selecting underline emphasis for markdown underlined elements.
 * @details `4` is the ANSI underline attribute applied to `<u>...</u>` markdown spans. Access complexity is O(1).
 * @satisfies REQ-715
 */
export const ANSI_UNDERLINE = "4";

/**
 * @brief ANSI SGR parameters selecting colored link text.
 * @details `4;96` combines the ANSI underline attribute with the bright-cyan foreground for `[text](url)` markdown links. Access complexity is O(1).
 * @satisfies REQ-715
 */
export const ANSI_LINK = "4;96";

/**
 * @brief ANSI SGR parameters selecting colored code text for fences and inline code quotes.
 * @details `36` is the ANSI cyan foreground applied to fenced code blocks and backtick inline code spans. Access complexity is O(1).
 * @satisfies REQ-715
 */
export const ANSI_CODE = "36";

/**
 * @brief Wraps one text fragment into the ANSI escape sequence selected by the supplied SGR parameters.
 * @details Emits `ESC[<codes>m` before the fragment and the ANSI reset after it, leaving empty fragments unstyled so colored output never contains empty escape pairs. Runtime is O(n) in fragment length. No external state is mutated.
 * @param[in] text {string} Text fragment to style.
 * @param[in] codes {string} Semicolon-separated ANSI SGR parameter list.
 * @return {string} ANSI-styled fragment, or the input unchanged when empty.
 */
export function wrapAnsiStyle(text: string, codes: string): string {
  if (text.length === 0) {
    return text;
  }
  return `\u001b[${codes}m${text}${ANSI_STYLE_RESET}`;
}

/**
 * @brief Opens one ANSI styling scope with the escape sequence selected by the supplied SGR parameters.
 * @details Emits only the leading `ESC[<codes>m` escape without any trailing reset so callers whose message tail is pinned byte-for-byte by downstream contracts keep the exact text suffix; callers own the styling scope from that point onward. Runtime is O(1). No external state is mutated.
 * @param[in] codes {string} Semicolon-separated ANSI SGR parameter list.
 * @return {string} Leading ANSI escape sequence for the requested styling.
 */
export function openAnsiStyle(codes: string): string {
  return `\u001b[${codes}m`;
}
