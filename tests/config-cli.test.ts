/**
 * @file
 * @brief Verifies the additive configuration CLI tree, table, and command contracts.
 * @details Covers the shared renderer against complete golden strings, the display-width table formatter, structural and table validators over real CLI output, and CLI command behavior for typed reads, mutations, resets, bounds, atomic failure, and raw-byte preservation. Runtime is dominated by subprocess CLI invocations. Side effects are limited to temporary project, home, and configuration files.
 * @satisfies TST-178, TST-179, TST-180, TST-181, TST-182, TST-183, TST-184
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getDefaultConfig, getGlobalConfigPath, getPersistedGlobalConfigPayload } from "../src/core/config.js";
import {
  formatConfigTable,
  measureDisplayWidth,
  renderConfigTree,
  type ConfigRenderRoot,
} from "../src/core/config-cli-render.js";
import { createTempDir, runNodeCli } from "./helpers.js";

/**
 * @brief Represents one parsed rendered output line.
 * @details Separates real node lines from attached detail lines while retaining the exact four-character ancestor prefix segments. The interface is compile-time only and introduces no runtime cost.
 */
interface ParsedRenderLine {
  kind: "node" | "detail";
  prefixSegments: string[];
  isLast: boolean;
  text: string;
}

/**
 * @brief Parses one rendered line into prefix segments plus node marker or detail text.
 * @details Consumes exact four-character continuation or indent segments, then classifies the next segment as a real-node marker or detail payload start. Runtime is O(n) in line length. No external state is mutated.
 * @param[in] line {string} Rendered output line.
 * @return {ParsedRenderLine} Parsed line facts.
 */
function parseRenderLine(line: string): ParsedRenderLine {
  const prefixSegments: string[] = [];
  let index = 0;
  while (line.startsWith("│   ", index) || line.startsWith("    ", index)) {
    prefixSegments.push(line.slice(index, index + 4));
    index += 4;
  }
  const marker = line.slice(index, index + 4);
  if (marker === "├── " || marker === "└── ") {
    return {
      kind: "node",
      prefixSegments,
      isLast: marker === "└── ",
      text: line.slice(index + 4),
    };
  }
  return {
    kind: "detail",
    prefixSegments,
    isLast: false,
    text: line.slice(index),
  };
}

/**
 * @brief Validates structural tree invariants over one complete rendered output.
 * @details Asserts one root heading without a marker, one marker per real node, ancestor continuation segments that match actual later-sibling state, no real sibling after a terminal sibling at the same depth, detail prefixes derived only from the owning node, no detail line carrying a structural marker, and a canonical path badge on every section heading. Runtime is O(n) in line count. No external state is mutated.
 * @param[in] rendered {string} Complete rendered output.
 * @return {void} No return value.
 * @throws {assert.AssertionError} Throws on the first structural violation.
 */
function validateRenderedTree(rendered: string): void {
  const lines = rendered.replace(/\n$/, "").split("\n");
  assert.ok(lines.length > 0);
  assert.ok(!lines[0]!.startsWith("├── ") && !lines[0]!.startsWith("└── "));
  const lastAtDepth: boolean[] = [];
  const nodeStack: Array<{ isLast: boolean; detailPrefix: string[] }> = [];
  let lastNode: { depth: number; detailPrefix: string[] } | undefined;
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    const parsed = parseRenderLine(line);
    if (parsed.kind === "node") {
      const depth = parsed.prefixSegments.length;
      for (let ancestorDepth = 0; ancestorDepth < depth; ancestorDepth += 1) {
        const ancestor = nodeStack[ancestorDepth];
        assert.ok(ancestor, `line ${lineIndex + 1}: missing real ancestor at depth ${ancestorDepth}`);
        assert.equal(
          parsed.prefixSegments[ancestorDepth],
          ancestor.isLast ? "    " : "│   ",
          `line ${lineIndex + 1}: ancestor segment ${ancestorDepth} mismatches sibling state`,
        );
      }
      assert.notEqual(lastAtDepth[depth], true, `line ${lineIndex + 1}: real sibling after a terminal sibling at depth ${depth}`);
      lastAtDepth.length = depth;
      lastAtDepth[depth] = parsed.isLast;
      nodeStack.length = depth + 1;
      const detailPrefix = [...parsed.prefixSegments, parsed.isLast ? "    " : "│   "];
      nodeStack[depth] = { isLast: parsed.isLast, detailPrefix };
      lastNode = { depth, detailPrefix };
      if (parsed.text.includes("[Path: ")) {
        assert.match(parsed.text, / - \[Path: .+\]$/, `line ${lineIndex + 1}: malformed section path badge`);
      }
      continue;
    }
    if (lastNode === undefined) {
      assert.equal(parsed.prefixSegments.length, 1, `line ${lineIndex + 1}: display-root detail indentation`);
      assert.equal(parsed.prefixSegments[0], "    ", `line ${lineIndex + 1}: display-root detail prefix`);
    } else {
      assert.equal(
        parsed.prefixSegments.length,
        lastNode.depth + 1,
        `line ${lineIndex + 1}: detail prefix must hold exactly one owner continuation segment`,
      );
      assert.deepEqual(
        parsed.prefixSegments,
        lastNode.detailPrefix,
        `line ${lineIndex + 1}: detail prefix mismatches owner`,
      );
    }
    assert.ok(
      !parsed.text.startsWith("├── ") && !parsed.text.startsWith("└── "),
      `line ${lineIndex + 1}: detail line carries a structural marker`,
    );
  }
}

/**
 * @brief Validates rectangular table invariants over one complete rendered output.
 * @details Groups contiguous table lines, asserts every line shares the owning detail prefix, every physical line has the same width, and every junction aligned with the corresponding separator column. Runtime is O(n) in line count. No external state is mutated.
 * @param[in] rendered {string} Complete rendered output.
 * @return {void} No return value.
 * @throws {assert.AssertionError} Throws on the first table violation.
 */
function validateRenderedTables(rendered: string): void {
  const lines = rendered.replace(/\n$/, "").split("\n");
  const groups: Array<Array<{ prefix: string; body: string }>> = [];
  let group: Array<{ prefix: string; body: string }> = [];
  for (const line of lines) {
    const topIndex = line.indexOf("┌");
    if (topIndex >= 0 && line.slice(topIndex).startsWith("┌") && line.slice(topIndex).endsWith("┐")) {
      if (group.length > 0) {
        groups.push(group);
      }
      group = [{ prefix: line.slice(0, topIndex), body: line.slice(topIndex) }];
      continue;
    }
    if (group.length > 0) {
      const bodyIndex = group[0]!.prefix.length;
      const body = line.slice(bodyIndex);
      if (body.startsWith("│") || body.startsWith("├") || body.startsWith("└")) {
        group.push({ prefix: line.slice(0, bodyIndex), body });
        continue;
      }
      groups.push(group);
      group = [];
    }
  }
  if (group.length > 0) {
    groups.push(group);
  }
  for (const table of groups) {
    assert.ok(table.length >= 4, "table must include top border, header, separator, and bottom border");
    assert.equal(new Set(table.map((entry) => entry.prefix)).size, 1, "table lines must share one owner prefix");
    const top = table[0]!.body;
    const bottom = table[table.length - 1]!.body;
    assert.ok(top.startsWith("┌") && top.endsWith("┐"));
    assert.ok(bottom.startsWith("└") && bottom.endsWith("┘"));
    assert.equal(measureDisplayWidth(top), measureDisplayWidth(bottom), "table width must stay rectangular");
    const positionsOf = (body: string, character: string): number[] => {
      const positions: number[] = [];
      let displayColumn = 0;
      for (const value of body) {
        if (value === character) {
          positions.push(displayColumn);
        }
        displayColumn += measureDisplayWidth(value);
      }
      return positions;
    };
    const topJunctions = positionsOf(top, "┬");
    const separator = table.find((entry) => entry.body.startsWith("├"));
    assert.ok(separator);
    assert.deepEqual(positionsOf(separator.body, "┼"), topJunctions);
    assert.deepEqual(positionsOf(bottom, "┴"), topJunctions);
    for (const entry of table) {
      if (!entry.body.startsWith("│")) {
        continue;
      }
      assert.equal(measureDisplayWidth(entry.body), measureDisplayWidth(top), "row width must match borders");
      const rowJunctions = positionsOf(entry.body, "│").slice(1, -1);
      assert.deepEqual(rowJunctions, topJunctions, "row separators must align with border junctions");
    }
  }
}

/**
 * @brief Builds one display root with a single child plus attached details.
 * @details Provides the smallest golden fixture exercising a terminal marker and the four-space detail prefix. Runtime is O(1). No external state is mutated.
 * @return {ConfigRenderRoot} Render root.
 */
function buildSingleChildRoot(): ConfigRenderRoot {
  return {
    heading: "Root",
    children: [
      { heading: "Child", details: ["first detail", "second detail"], children: [] },
    ],
  };
}

/**
 * @brief Builds one display root with two sibling children.
 * @details Exercises the non-terminal and terminal marker pair plus their distinct detail prefixes. Runtime is O(1). No external state is mutated.
 * @return {ConfigRenderRoot} Render root.
 */
function buildSiblingRoot(): ConfigRenderRoot {
  return {
    heading: "Root",
    children: [
      { heading: "Alpha", details: ["alpha detail"], children: [] },
      { heading: "Beta", details: ["beta detail"], children: [] },
    ],
  };
}

/**
 * @brief Builds one display root with first, middle, and last nested siblings.
 * @details Exercises ancestor continuation segments across nested depths and terminal siblings. Runtime is O(1). No external state is mutated.
 * @return {ConfigRenderRoot} Render root.
 */
function buildNestedSiblingRoot(): ConfigRenderRoot {
  return {
    heading: "Root",
    children: [
      {
        heading: "Parent",
        details: ["parent detail"],
        children: [
          { heading: "First", details: ["first nested detail"], children: [] },
          { heading: "Middle", details: ["middle nested detail"], children: [] },
          { heading: "Last", details: ["last nested detail"], children: [] },
        ],
      },
    ],
  };
}

/**
 * @brief Verifies the complete single-child golden output.
 * @details Compares the whole string including spaces and the trailing newline. Runtime is O(n) in output size. No external state is mutated.
 * @return {void} No return value.
 * @satisfies TST-178
 */
test("renderer emits one terminal child with detail prefixes", () => {
  assert.equal(
    renderConfigTree(buildSingleChildRoot()),
    "Root\n└── Child\n    first detail\n    second detail\n",
  );
});

/**
 * @brief Verifies the complete two-sibling golden output.
 * @details Compares the whole string including the terminal marker on the final sibling. Runtime is O(n) in output size. No external state is mutated.
 * @return {void} No return value.
 * @satisfies TST-178
 */
test("renderer emits two root siblings with matching markers and detail prefixes", () => {
  assert.equal(
    renderConfigTree(buildSiblingRoot()),
    "Root\n├── Alpha\n│   alpha detail\n└── Beta\n    beta detail\n",
  );
});

/**
 * @brief Verifies the complete nested first, middle, and last sibling golden output.
 * @details Compares the whole string and asserts the continuation segments grow only for real ancestors with later siblings. Runtime is O(n) in output size. No external state is mutated.
 * @return {void} No return value.
 * @satisfies TST-178
 */
test("renderer emits nested first, middle, and last siblings", () => {
  assert.equal(
    renderConfigTree(buildNestedSiblingRoot()),
    [
      "Root",
      "└── Parent",
      "    parent detail",
      "    ├── First",
      "    │   first nested detail",
      "    ├── Middle",
      "    │   middle nested detail",
      "    └── Last",
      "        last nested detail",
      "",
    ].join("\n"),
  );
});

/**
 * @brief Verifies the complete subtree golden output with root details.
 * @details Asserts the requested subtree starts without a marker or invented ancestors and indents its details by four spaces. Runtime is O(n) in output size. No external state is mutated.
 * @return {void} No return value.
 * @satisfies TST-178
 */
test("renderer renders a requested subtree as the unconnected root", () => {
  const root: ConfigRenderRoot = {
    heading: "Requested - [Path: Requested]",
    details: ["Reset block : --unset Requested"],
    children: [
      { heading: "leaf = \"value\"", details: ["Default : \"value\""], children: [] },
    ],
  };
  assert.equal(
    renderConfigTree(root),
    "Requested - [Path: Requested]\n    Reset block : --unset Requested\n└── leaf = \"value\"\n    Default : \"value\"\n",
  );
});

/**
 * @brief Verifies table formatting for Unicode and escaped newline cells.
 * @details Asserts rectangular borders, aligned junctions, and display-width measurement for wide characters and JSON-escaped newlines. Runtime is O(n) in table size. No external state is mutated.
 * @return {void} No return value.
 * @satisfies TST-181
 */
test("table formatter aligns wide and escaped-newline cells", () => {
  const lines = formatConfigTable(["Name", "Value"], [["漢字", "line\nbreak"], ["plain", "[]"]]);
  assert.equal(lines[0]!.length, lines[lines.length - 1]!.length);
  assert.deepEqual(
    [...lines[0]!].flatMap((value, index) => (value === "┬" ? [index] : [])),
    [...lines[2]!].flatMap((value, index) => (value === "┼" ? [index] : [])),
  );
  const rendered = `${lines.join("\n")}\n`;
  assert.match(rendered, /漢字/);
  assert.match(rendered, /line\\nbreak/);
  validateRenderedTree(`Root\n└── table\n${lines.map((line) => `    ${line}`).join("\n")}\n`);
  validateRenderedTables(`Root\n└── table\n${lines.map((line) => `    ${line}`).join("\n")}\n`);
});

/**
 * @brief Runs the CLI in one temporary project and returns its captured result.
 * @details Forwards arguments to the TypeScript CLI through the shared helper with the supplied project cwd. Runtime is dominated by subprocess execution. Side effects are limited to subprocess creation.
 * @param[in] projectBase {string} Project working directory.
 * @param[in] args {string[]} CLI arguments.
 * @return {import("node:child_process").SpawnSyncReturns<string>} Captured process result.
 */
function runConfigCli(projectBase: string, args: string[]) {
  return runNodeCli(args, projectBase);
}

/**
 * @brief Asserts one successful CLI invocation and returns stdout.
 * @details Fails with captured stderr on a non-zero exit and returns stdout verbatim otherwise. Runtime is O(1). No external state is mutated.
 * @param[in] projectBase {string} Project working directory.
 * @param[in] args {string[]} CLI arguments.
 * @return {string} Captured stdout.
 */
function runSuccessful(projectBase: string, args: string[]): string {
  const result = runConfigCli(projectBase, args);
  assert.equal(result.status, 0, `CLI ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/**
 * @brief Verifies global-config bootstrapping and raw-byte preservation.
 * @details Removes the global file, reads a default through the CLI, asserts the bootstrap created the file, then rewrites distinctive bytes and asserts `--print-raw` returns them unchanged. Runtime is dominated by subprocess execution. Side effects are limited to temporary global files.
 * @return {void} No return value.
 * @satisfies TST-183
 */
test("configuration CLI bootstraps the global file and preserves raw bytes", () => {
  const projectBase = createTempDir("pi-usereq-config-cli-raw-");
  fs.rmSync(getGlobalConfigPath(), { force: true });
  assert.equal(runSuccessful(projectBase, ["--get", "Global:GIT_WORKTREE_PREFIX"]), "\"PI-useReq-\"\n");
  assert.ok(fs.existsSync(getGlobalConfigPath()));
  const customPayload = getPersistedGlobalConfigPayload(getDefaultConfig(projectBase));
  customPayload.GIT_WORKTREE_PREFIX = "CUSTOM-";
  const customBytes = `${JSON.stringify(customPayload, null, 4)}\n`;
  fs.writeFileSync(getGlobalConfigPath(), customBytes, "utf8");
  assert.equal(runSuccessful(projectBase, ["--print-raw"]), customBytes);
});

/**
 * @brief Verifies typed get, set, unset, bounds, and no-mutation rejection behavior.
 * @details Exercises strings, booleans, numbers, primitive arrays, object-array rows, field updates, required-field resets, and out-of-range errors while asserting rejected operations leave persisted state unchanged. Runtime is dominated by subprocess execution. Side effects are limited to temporary configuration files.
 * @return {void} No return value.
 * @satisfies TST-182
 */
test("configuration CLI mutates typed values and rejects invalid operations without mutation", () => {
  const projectBase = createTempDir("pi-usereq-config-cli-mutate-");
  assert.equal(runSuccessful(projectBase, ["--get", "Local:docs-dir"]), "\"usereq/docs\"\n");
  runSuccessful(projectBase, ["--set", "Local:docs-dir", "documentation"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:docs-dir"]), "\"documentation\"\n");
  runSuccessful(projectBase, ["--set", "Local:context-files-requirements", "false"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:context-files-requirements"]), "false\n");
  const rejectedType = runConfigCli(projectBase, ["--set", "Local:context-files-requirements", "nope"]);
  assert.equal(rejectedType.status, 1);
  assert.match(rejectedType.stderr, /invalid JSON value/);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:context-files-requirements"]), "false\n");
  runSuccessful(projectBase, ["--set", "Global:notify-pushover-priority", "1"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Global:notify-pushover-priority"]), "1\n");
  const rejectedPriority = runConfigCli(projectBase, ["--set", "Global:notify-pushover-priority", "2"]);
  assert.equal(rejectedPriority.status, 1);
  assert.equal(runSuccessful(projectBase, ["--get", "Global:notify-pushover-priority"]), "1\n");
  runSuccessful(projectBase, ["--set", "Local:src-dir", "[\"src\",\"lib\"]"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:src-dir"]), "[\"src\",\"lib\"]\n");
  runSuccessful(projectBase, ["--set", "Local:src-dir:+", "app"]);
  runSuccessful(projectBase, ["--set", "Local:src-dir:insert:0", "first"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:src-dir"]), "[\"first\",\"src\",\"lib\",\"app\"]\n");
  runSuccessful(projectBase, ["--unset", "Local:src-dir:0"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:src-dir"]), "[\"src\",\"lib\",\"app\"]\n");
  runSuccessful(projectBase, ["--unset", "Local:src-dir"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:src-dir"]), "[\"src\"]\n");
  runSuccessful(projectBase, ["--set", "Global:static-check:Go:checkers:+", "{\"module\":\"Command\",\"cmd\":\"gofmt\"}"]);
  assert.equal(
    runSuccessful(projectBase, ["--get", "Global:static-check:Go:checkers:0:cmd"]),
    "\"gofmt\"\n",
  );
  runSuccessful(projectBase, ["--set", "Global:static-check:Go:checkers:0:cmd", "goimports"]);
  assert.equal(
    runSuccessful(projectBase, ["--get", "Global:static-check:Go:checkers:0:cmd"]),
    "\"goimports\"\n",
  );
  runSuccessful(projectBase, ["--unset", "Global:static-check:Go:checkers:0:cmd"]);
  assert.equal(
    runSuccessful(projectBase, ["--get", "Global:static-check:Go:checkers:0:cmd"]),
    "null\n",
  );
  const rejectedRequiredReset = runConfigCli(projectBase, ["--unset", "Global:static-check:Go:checkers:0:module"]);
  assert.equal(rejectedRequiredReset.status, 1);
  assert.match(rejectedRequiredReset.stderr, /required field/);
  const rejectedIndex = runConfigCli(projectBase, ["--set", "Local:src-dir:5", "x"]);
  assert.equal(rejectedIndex.status, 1);
  assert.match(rejectedIndex.stderr, /valid range/);
  assert.match(rejectedIndex.stderr, /append/);
  const globalBytesBefore = fs.readFileSync(getGlobalConfigPath(), "utf8");
  const rejectedPushover = runConfigCli(projectBase, ["--set", "Global:notify-pushover-enabled", "true"]);
  assert.equal(rejectedPushover.status, 1);
  assert.match(rejectedPushover.stderr, /notify-pushover/);
  assert.equal(fs.readFileSync(getGlobalConfigPath(), "utf8"), globalBytesBefore);
});

/**
 * @brief Verifies exact `--print` and `--info` golden output plus structural and table invariants.
 * @details Compares complete single-parameter outputs, validates the whole rendered trees and tables, and regression-checks the Global/Local detail prefixes on `--info`. Runtime is dominated by subprocess execution. Side effects are limited to temporary configuration files.
 * @return {void} No return value.
 * @satisfies TST-178, TST-179, TST-180, TST-181, TST-184
 */
test("configuration CLI renders deterministic print and info trees", () => {
  const projectBase = createTempDir("pi-usereq-config-cli-render-");
  assert.equal(
    runSuccessful(projectBase, ["--print", "Local:docs-dir"]),
    "docs-dir = \"usereq/docs\" (default)\n",
  );
  assert.equal(
    runSuccessful(projectBase, ["--info", "Local:docs-dir"]),
    [
      "docs-dir - [String: non-empty] Documentation directory relative to the project root.",
      "    Default : \"usereq/docs\" (restored via: --unset Local:docs-dir)",
      "    Set cmd : --set Local:docs-dir documentation",
      "    Reset cmd : --unset Local:docs-dir",
      "",
    ].join("\n"),
  );
  const printTree = runSuccessful(projectBase, ["--print"]);
  validateRenderedTree(printTree);
  validateRenderedTables(printTree);
  const infoTree = runSuccessful(projectBase, ["--info"]);
  validateRenderedTree(infoTree);
  validateRenderedTables(infoTree);
  const subtrees = [
    ["--print", "Global:static-check:C"],
    ["--info", "Global:static-check:C"],
    ["--print", "Local:static-check"],
    ["--info", "Local"],
    ["--print", "Global:notify-sound"],
    ["--info", "Global:notify-sound"],
  ];
  for (const args of subtrees) {
    const rendered = runSuccessful(projectBase, args);
    validateRenderedTree(rendered);
    validateRenderedTables(rendered);
  }
  const infoLines = infoTree.split("\n");
  assert.ok(infoLines.includes("│   Reset block : --unset Global"));
  assert.ok(infoLines.some((line) => line.startsWith("│   │   Set cmd : --set Global:notify-sound ")));
  assert.ok(infoLines.some((line) => line.startsWith("│       Set cmd : --set Global:PI_NOTIFY_SOUND_HIGH_CMD ")));
  assert.ok(infoLines.some((line) => line.startsWith("        Default : [] (restored via: --unset Local:DEBUG_ENABLED_PROMPTS)")));
});
