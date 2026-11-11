/**
 * @file
 * @brief Renders deterministic configuration trees and tables for the configuration CLI.
 * @details Implements the single data-driven tree renderer shared by `--print` and `--info`, plus one display-width-aware table formatter used for selection, array, and item-schema details. Tree topology depends only on real node ancestry, never on label width or detail count. Runtime is O(n) in emitted lines plus column count. The module is pure and performs no I/O.
 */

/**
 * @brief Defines the branch edge emitted for a non-terminal real node.
 * @details Exactly four UTF-8 characters; paired with the ancestor continuation segments defined below. Access complexity is O(1).
 * @satisfies REQ-541, REQ-542
 */
export const CONFIG_TREE_BRANCH = "├── ";

/**
 * @brief Defines the terminal edge emitted for the final real sibling at one depth.
 * @details Exactly four UTF-8 characters; never emitted for attached detail lines. Access complexity is O(1).
 * @satisfies REQ-541, REQ-542
 */
export const CONFIG_TREE_LAST = "└── ";

/**
 * @brief Defines one horizontal ancestor indent segment.
 * @details Exactly four ASCII spaces, matching the width of every tree edge and continuation segment. Access complexity is O(1).
 * @satisfies REQ-541
 */
export const CONFIG_TREE_INDENT = "    ";

/**
 * @brief Defines one vertical ancestor continuation segment.
 * @details Vertical bar plus three ASCII spaces; one segment exists per actual ancestor with a later real sibling. Access complexity is O(1).
 * @satisfies REQ-541
 */
export const CONFIG_TREE_CONTINUE = "│   ";

/**
 * @brief Describes one real configuration node prepared for rendering.
 * @details Carries the fully materialized heading, the ordered attached detail lines that belong to the node, and its ordered real children. Detail lines are logical single lines without any structural prefix. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-541, REQ-542
 */
export interface ConfigRenderTreeNode {
  heading: string;
  details: string[];
  children: ConfigRenderTreeNode[];
}

/**
 * @brief Describes the display root of one configuration tree render.
 * @details The root heading is emitted without a tree marker and its optional details use a four-space indent; real children are rendered one level below it. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-541, REQ-544
 */
export interface ConfigRenderRoot {
  heading: string;
  details?: string[];
  children: ConfigRenderTreeNode[];
}

/**
 * @brief Emits one real node and its descendants into the output line buffer.
 * @details Computes the ancestor prefix strictly from the real-sibling flags, emits exactly one structural marker, then prefixes every attached detail line with the ancestor prefix plus one own continuation segment derived from whether this node has a later sibling. Runtime is O(n) in subtree line count. Side effect: appends to `lines`.
 * @param[in] node {ConfigRenderTreeNode} Node to render.
 * @param[in] ancestorHasNext {boolean[]} Real-ancestor later-sibling flags from the root down.
 * @param[in] isLast {boolean} Whether this node is the final real sibling at its depth.
 * @param[in,out] lines {string[]} Output line buffer.
 * @return {void} No return value.
 * @satisfies REQ-541, REQ-542
 */
function emitConfigTreeNode(
  node: ConfigRenderTreeNode,
  ancestorHasNext: boolean[],
  isLast: boolean,
  lines: string[],
): void {
  const prefix = ancestorHasNext
    .map((hasNext) => (hasNext ? CONFIG_TREE_CONTINUE : CONFIG_TREE_INDENT))
    .join("");
  lines.push(`${prefix}${isLast ? CONFIG_TREE_LAST : CONFIG_TREE_BRANCH}${node.heading}`);
  const detailPrefix = `${prefix}${isLast ? CONFIG_TREE_INDENT : CONFIG_TREE_CONTINUE}`;
  for (const detailLine of node.details) {
    lines.push(`${detailPrefix}${detailLine}`);
  }
  for (let index = 0; index < node.children.length; index += 1) {
    emitConfigTreeNode(
      node.children[index]!,
      [...ancestorHasNext, !isLast],
      index === node.children.length - 1,
      lines,
    );
  }
}

/**
 * @brief Renders one configuration tree through the shared deterministic algorithm.
 * @details Emits the root heading without a tree marker, prefixes root details with a four-space indent, then renders every real child through `emitConfigTreeNode(...)` with no synthetic ancestors. The returned text ends with exactly one newline. Runtime is O(n) in emitted line count. No external state is mutated.
 * @param[in] root {ConfigRenderRoot} Display root prepared by `--print` or `--info`.
 * @return {string} Complete rendered tree text.
 * @satisfies REQ-541, REQ-542, REQ-544
 */
export function renderConfigTree(root: ConfigRenderRoot): string {
  const lines: string[] = [root.heading];
  for (const detailLine of root.details ?? []) {
    lines.push(`${CONFIG_TREE_INDENT}${detailLine}`);
  }
  for (let index = 0; index < root.children.length; index += 1) {
    emitConfigTreeNode(root.children[index]!, [], index === root.children.length - 1, lines);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Tests whether one code point occupies two terminal cells.
 * @details Covers the common East Asian wide, fullwidth, and emoji ranges used by configuration values so column widths stay aligned for Unicode data. Runtime is O(1). No external state is mutated.
 * @param[in] codePoint {number} Unicode code point.
 * @return {boolean} `true` when the code point occupies two display cells.
 * @satisfies REQ-547
 */
function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

/**
 * @brief Tests whether one code point occupies zero terminal cells.
 * @details Covers combining marks, zero-width controls, and variation selectors so table widths are not overcounted. Runtime is O(1). No external state is mutated.
 * @param[in] codePoint {number} Unicode code point.
 * @return {boolean} `true` when the code point occupies no display cell.
 * @satisfies REQ-547
 */
function isZeroWidthCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x0483 && codePoint <= 0x0489) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    codePoint === 0xfeff
  );
}

/**
 * @brief Measures the terminal display width of one text fragment.
 * @details Iterates Unicode code points so wide and zero-width characters are counted by display cells instead of JavaScript code units; assumes no ANSI escape sequences are present. Runtime is O(n) in fragment length. No external state is mutated.
 * @param[in] text {string} Text fragment to measure.
 * @return {number} Terminal display width in cells.
 * @satisfies REQ-547
 */
export function measureDisplayWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isZeroWidthCodePoint(codePoint)) {
      continue;
    }
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

/**
 * @brief Pads one table cell to a measured display width.
 * @details Appends spaces until the rendered cell reaches the requested width so every physical row shares the column boundaries computed from the widest header or cell. Runtime is O(n) in padding length. No external state is mutated.
 * @param[in] text {string} Cell text.
 * @param[in] width {number} Target display width.
 * @return {string} Right-padded cell text.
 * @satisfies REQ-547
 */
function padTableCell(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - measureDisplayWidth(text)))}`;
}

/**
 * @brief Escapes control characters inside one table cell before measurement.
 * @details Rewrites carriage returns, newlines, tabs, and remaining C0 control codes into visible escape sequences so one physical table row always represents one logical cell line and widths stay measurable. Runtime is O(n) in cell length. No external state is mutated.
 * @param[in] text {string} Raw cell text.
 * @return {string} Single-line escaped cell text.
 * @satisfies REQ-547
 */
function escapeTableCellText(text: string): string {
  return text
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\u0000-\u001f\u007f]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * @brief Renders one configuration table from headers plus row cells.
 * @details Escapes control characters in every header and cell, computes every column width from the maximum display width, then emits aligned top, header, separator, data, and bottom borders with exactly one space of horizontal padding per cell. Missing cells render empty. Runtime is O(r * c) plus width measurement. No external state is mutated.
 * @param[in] headers {string[]} Ordered column headers.
 * @param[in] rows {string[][]} Ordered physical row cells.
 * @return {string[]} Rendered table lines without structural prefixes.
 * @satisfies REQ-547, REQ-551
 */
export function formatConfigTable(headers: string[], rows: string[][]): string[] {
  const safeHeaders = headers.map((header) => escapeTableCellText(header));
  const safeRows = rows.map((row) => row.map((cell) => escapeTableCellText(cell)));
  const columnCount = safeHeaders.length;
  const widths = safeHeaders.map((header) => measureDisplayWidth(header));
  for (const row of safeRows) {
    for (let column = 0; column < columnCount; column += 1) {
      widths[column] = Math.max(widths[column] ?? 0, measureDisplayWidth(row[column] ?? ""));
    }
  }
  const borderLine = (left: string, middle: string, right: string): string =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;
  const contentLine = (cells: string[]): string =>
    `│${widths
      .map((width, column) => ` ${padTableCell(cells[column] ?? "", width)} `)
      .join("│")}│`;
  const lines: string[] = [
    borderLine("┌", "┬", "┐"),
    contentLine(safeHeaders),
    borderLine("├", "┼", "┤"),
  ];
  for (const row of safeRows) {
    lines.push(contentLine(row));
  }
  lines.push(borderLine("└", "┴", "┘"));
  return lines;
}
