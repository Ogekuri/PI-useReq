import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REQ_AUDIT_NO_CHECKERS_LINE,
  executeReqAuditCommand,
  parseReqAuditProjectBase,
} from "../src/core/req-audit-command.js";
import { measureDisplayWidth } from "../src/core/config-cli-render.js";
import {
  createStaticCheckLanguageConfig,
  getDefaultConfig,
} from "../src/core/config.js";
import { ReqError } from "../src/core/errors.js";

/**
 * @brief Creates one disposable temporary project base directory.
 * @details Materializes one unique directory under the OS temporary root so audit executions resolve configuration without touching tracked repository content. Runtime is O(1) plus one directory creation. Side effects include temporary filesystem mutation removed by the caller.
 * @return {string} Absolute temporary project base path.
 */
function createTemporaryProjectBase(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-audit-"));
}

/**
 * @brief Verifies the audit renders every configured checker grouped by language with the documented columns.
 * @details Configures `Command` entries with a resolvable `node` executable, an unresolvable command, and a non-`Command` `Dummy` entry across `C`, disabled `Python`, and `TypeScript`, executes the audit, and verifies the row order stays grouped by canonical language while preserving configured entry order per language, the `installed` column reports `yes`, `no`, and `n/a` per entry kind, disabled-language checkers stay audited, and the report renders the `language`, `static-check`, and `installed` table. Runtime is dominated by executable resolution probing. Side effects are limited to temporary filesystem mutation.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when grouping, column values, or counts diverge from the documented contract.
 * @satisfies REQ-845, REQ-846, TST-274
 */
test("req-audit renders configured checkers grouped by language with language, static-check, and installed columns", () => {
  const projectBase = createTemporaryProjectBase();
  try {
    const config = getDefaultConfig(projectBase);
    const missingCommand = "pi-usereq-audit-missing-checker";
    config["static-check"] = {
      C: createStaticCheckLanguageConfig([
        { module: "Command", cmd: missingCommand },
        { module: "Dummy", cmd: "dummy-driver" },
      ]),
      Python: createStaticCheckLanguageConfig(
        [{ module: "Command", cmd: "node", params: ["--version"] }],
        "disable",
      ),
      TypeScript: createStaticCheckLanguageConfig([{ module: "Command", cmd: "node" }]),
    };

    const result = executeReqAuditCommand(projectBase, config);

    assert.equal(result.configuredCount, 4);
    assert.equal(result.missingCount, 1);
    assert.deepEqual(
      result.rows.map((row) => [row.language, row.checker, row.installed]),
      [
        ["C", missingCommand, "no"],
        ["C", "dummy-driver", "n/a"],
        ["Python", "node --version", "yes"],
        ["TypeScript", "node", "yes"],
      ],
    );
    const reportLines = result.report.split("\n");
    assert.ok(reportLines.some((line) => line.includes("language")), "report renders the language column");
    assert.ok(reportLines.some((line) => line.includes("static-check")), "report renders the static-check column");
    assert.ok(reportLines.some((line) => line.includes("installed")), "report renders the installed column");
    const lineIndexOf = (needle: string): number => {
      const index = reportLines.findIndex((line) => line.includes(needle));
      assert.notEqual(index, -1, `missing report line for ${needle}`);
      return index;
    };
    const missingIndex = lineIndexOf(missingCommand);
    const dummyIndex = lineIndexOf("dummy-driver");
    const pythonIndex = lineIndexOf("node --version");
    const typescriptIndex = reportLines.findIndex(
      (line, index) => index > pythonIndex && line.includes(" node "),
    );
    assert.notEqual(typescriptIndex, -1, "missing report line for the bare TypeScript node entry");
    assert.ok(missingIndex < dummyIndex, "C rows stay grouped consecutively");
    assert.ok(dummyIndex < pythonIndex, "Python rows follow the grouped C rows");
    assert.ok(pythonIndex < typescriptIndex, "TypeScript rows follow the grouped Python rows");
    assert.ok(result.report.includes(projectBase), "report names the audited project base");
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies the audit table frame uses the documented rounded corners and double-line header separator.
 * @details Configures one `C` language with two checker entries, executes the audit, and verifies the rendered frame opens with `╭` joined by `┬`, closes with `╰` joined by `┴`, separates the header row from every data row with the double-line `╞═╪═╡` separator, keeps all frame lines on one shared display width, and emits no legacy square corner or row-separator glyph. Runtime is dominated by executable resolution probing. Side effects are limited to temporary filesystem mutation.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when the frame glyphs, header separator, or frame alignment diverge from the documented rounded table framing.
 * @satisfies REQ-846, TST-274
 */
test("req-audit frames the table with rounded corners and the double-line header separator", () => {
  const projectBase = createTemporaryProjectBase();
  try {
    const config = getDefaultConfig(projectBase);
    config["static-check"] = {
      C: createStaticCheckLanguageConfig([
        { module: "Command", cmd: "pi-usereq-audit-missing-checker" },
        { module: "Dummy", cmd: "dummy-driver" },
      ]),
    };

    const lines = executeReqAuditCommand(projectBase, config).report.split("\n");
    const topBorder = lines.find((line) => line.startsWith("╭"));
    assert.ok(topBorder !== undefined, "the table opens with a rounded top-left corner");
    assert.ok(topBorder.endsWith("╮"), "the top border closes with a rounded top-right corner");
    assert.ok(topBorder.includes("┬"), "the top border joins the columns with the documented junction");
    const headerSeparator = lines.find((line) => /^╞═+╪═+╪═+╡$/.test(line));
    assert.ok(
      headerSeparator !== undefined,
      "the header row is separated from the data rows by the double-line separator",
    );
    const headerIndex = lines.findIndex((line) => line.includes("static-check"));
    const separatorIndex = lines.indexOf(headerSeparator);
    assert.equal(separatorIndex, headerIndex + 1, "the double-line separator directly follows the header row");
    const bottomBorder = lines.find((line) => line.startsWith("╰"));
    assert.ok(bottomBorder !== undefined, "the table closes with a rounded bottom-left corner");
    assert.ok(bottomBorder.endsWith("╯"), "the bottom border closes with a rounded bottom-right corner");
    assert.ok(bottomBorder.includes("┴"), "the bottom border joins the columns with the documented junction");
    const frameLines = lines.filter((line) => /^[╭╞╰]/.test(line));
    assert.equal(frameLines.length, 3, "the frame renders exactly one top, header-separator, and bottom line");
    assert.equal(
      new Set(frameLines.map((line) => measureDisplayWidth(line))).size,
      1,
      "every frame line shares one identical display width",
    );
    for (const legacyGlyph of ["┌", "┐", "├", "┤", "└", "┘"]) {
      assert.ok(!lines.some((line) => line.includes(legacyGlyph)), `the frame emits no legacy ${legacyGlyph} glyph`);
    }
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies the audit table wraps within the requested terminal width keeping every border aligned.
 * @details Configures one `C` language with a long resolvable command and one unresolvable command, executes the audit with a 100-column terminal budget, and verifies every rendered line stays within the terminal width, every border line shares one identical width, every table content line carries exactly four cells so the borders align on every physical row, the wrapped checker content stays complete across its continuation lines, continuation rows keep the language and installed cells empty, the per-row verification verdicts stay on the first physical row of each logical row, and the unknown-terminal rendering keeps the natural single-line layout. Runtime is dominated by executable resolution probing. Side effects are limited to temporary filesystem mutation.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when the table exceeds the terminal width, borders diverge across physical rows, wrapped content is lost, or the unknown-terminal layout wraps.
 * @satisfies REQ-846, REQ-847
 */
test("req-audit wraps the static-check column within the requested terminal width keeping the table borders aligned", () => {
  const projectBase = createTemporaryProjectBase();
  try {
    const config = getDefaultConfig(projectBase);
    const longCommand =
      "cppcheck --error-exitcode=1 --enable=warning,style,performance,portability --std=c11";
    const missingCommand = "pi-usereq-audit-missing-checker";
    config["static-check"] = {
      C: createStaticCheckLanguageConfig([
        { module: "Command", cmd: "cppcheck", params: [
          "--error-exitcode=1",
          "--enable=warning,style,performance,portability",
          "--std=c11",
        ] },
        { module: "Command", cmd: missingCommand },
      ]),
    };

    const result = executeReqAuditCommand(projectBase, config, { terminalColumns: 100 });
    const lines = result.report.split("\n");
    const borderLines = lines.filter((line) => /^[╭╞╰]/.test(line));
    assert.ok(borderLines.length >= 3, "report renders the bordered table");
    const borderWidths = new Set(borderLines.map((line) => line.length));
    assert.equal(borderWidths.size, 1, "all border lines share one identical width");
    const tableWidth = [...borderWidths][0]!;
    assert.ok(tableWidth <= 100, `table width ${tableWidth} exceeds the 100-column terminal`);
    const contentLines = lines.filter((line) => line.startsWith("│"));
    assert.ok(contentLines.length > 2, "the long checker row wraps into continuation rows");
    for (const line of contentLines) {
      assert.equal(line.length, tableWidth, `content line diverges from the border width: ${line}`);
      assert.equal(line.split("│").length, 5, `content line does not carry four aligned cells: ${line}`);
    }
    const verdictRows = contentLines.filter((line) => {
      const cells = line.split("│");
      return ["yes", "no", "n/a"].includes(cells[3]!.trim());
    });
    assert.equal(verdictRows.length, 2, "each logical row renders exactly one physical row carrying the verdict");
    for (const row of verdictRows) {
      const cells = row.split("│");
      assert.ok(cells[1]!.trim().length > 0, "the first physical row carries the language cell");
    }
    const wrappedChunks = contentLines
      .filter((line) => line.split("│")[2]!.includes("cppcheck") || line.split("│")[2]!.includes("--"))
      .map((line) => line.split("│")[2]!.trim())
      .filter((cell) => cell !== "static-check");
    const rebuilt = wrappedChunks.join(" ");
    for (const token of longCommand.split(" ")) {
      assert.ok(rebuilt.includes(token), `wrapped checker content lost the token '${token}'`);
    }
    assert.ok(
      result.report.includes(missingCommand),
      "the unresolvable checker row stays present with its no verdict",
    );

    const naturalResult = executeReqAuditCommand(projectBase, config);
    const naturalLines = naturalResult.report.split("\n");
    const naturalTableLines = naturalLines.filter((line) => /^[│╭╞╰]/.test(line));
    const naturalContentLines = naturalTableLines.filter((line) => line.startsWith("│"));
    assert.equal(
      naturalContentLines.length,
      3,
      "the unknown-terminal rendering keeps one physical row per logical row",
    );
    assert.ok(
      naturalTableLines.every((line) => measureDisplayWidth(line) > 100),
      "the natural rendering keeps the unwrapped single-line table",
    );
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies the audit renders the documented no-configured-checker line instead of a table.
 * @details Executes the audit against a default configuration whose static-check subtree holds no checker entry and verifies the report carries the documented no-configured-checker line, zero configured rows, and no table column header. Runtime is O(1) plus executable-free configuration reads. Side effects are limited to temporary filesystem mutation.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when the empty configuration still renders a table or wrong counts.
 * @satisfies REQ-848, TST-274
 */
test("req-audit renders the no-configured-checker line instead of a table", () => {
  const projectBase = createTemporaryProjectBase();
  try {
    const config = getDefaultConfig(projectBase);
    config["static-check"] = {};

    const result = executeReqAuditCommand(projectBase, config);

    assert.equal(result.configuredCount, 0);
    assert.equal(result.missingCount, 0);
    assert.equal(result.rows.length, 0);
    assert.ok(result.report.includes(REQ_AUDIT_NO_CHECKERS_LINE));
    assert.ok(!result.report.includes("installed"), "no table renders for an empty configuration");
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies `--prj-base` resolution spellings, the live-cwd fallback, and unknown-argument rejection.
 * @details Asserts the empty and whitespace-only arguments resolve the fallback cwd, both `--prj-base <path>` and `--prj-base=<path>` spellings resolve the supplied absolute path, and unknown tokens plus a value-less `--prj-base` throw deterministic `ReqError` diagnostics. Runtime is O(1). No side effects occur.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when argument resolution or rejection diverges from the documented grammar.
 * @satisfies REQ-843, TST-275
 */
test("req-audit resolves --prj-base and falls back to the live cwd", () => {
  const fallbackCwd = path.join(os.tmpdir(), "pi-usereq-audit-fallback");
  assert.equal(parseReqAuditProjectBase("", fallbackCwd), path.resolve(fallbackCwd));
  assert.equal(parseReqAuditProjectBase("   ", fallbackCwd), path.resolve(fallbackCwd));
  assert.equal(
    parseReqAuditProjectBase("--prj-base /tmp/pi-usereq-audit-target", fallbackCwd),
    path.resolve("/tmp/pi-usereq-audit-target"),
  );
  assert.equal(
    parseReqAuditProjectBase("--prj-base=/tmp/pi-usereq-audit-attached", fallbackCwd),
    path.resolve("/tmp/pi-usereq-audit-attached"),
  );
  assert.throws(() => parseReqAuditProjectBase("--unknown", fallbackCwd), ReqError);
  assert.throws(() => parseReqAuditProjectBase("--prj-base", fallbackCwd), ReqError);
});
