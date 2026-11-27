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
