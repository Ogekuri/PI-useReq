import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectExtension,
  replayCommand,
  replaySessionStart,
  replayTool,
  type OfflineContractSnapshot,
} from "../scripts/lib/extension-debug-harness.js";
import { buildParityReport, type SdkContractSnapshot } from "../scripts/lib/sdk-smoke.js";
import { getProjectConfigPath } from "../src/core/config.js";
import { PI_USEREQ_STATUS_HOOK_NAMES } from "../src/core/extension-status.js";
import { initFixtureRepo } from "./helpers.js";

/**
 * @brief Persists a targeted enabled-tool list into a fixture project config.
 * @details Loads `.pi-usereq.json`, replaces the `enabled-tools` array with the supplied values, and writes the updated JSON back to disk with a trailing newline. Runtime is O(n) in config size. Side effects include filesystem reads and file overwrite.
 * @param[in] projectBase {string} Fixture project root.
 * @param[in] enabledTools {string[]} Enabled-tool names to persist.
 * @return {void} No return value.
 */
function writeEnabledTools(projectBase: string, enabledTools: string[]): void {
  const configPath = getProjectConfigPath(projectBase);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
  config["enabled-tools"] = enabledTools;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * @brief Builds a minimal offline snapshot fixture for parity-comparator tests.
 * @details Returns a deterministic inventory snapshot containing one command, one tool, and one active tool so mismatch categories can be unit-tested without invoking the real SDK. Runtime is O(1). No side effects occur.
 * @return {OfflineContractSnapshot} Synthetic offline snapshot.
 */
function buildOfflineFixture(): OfflineContractSnapshot {
  return {
    extensionPath: "/repo/src/index.ts",
    requestedCwd: "/repo",
    effectiveCtxCwd: "/repo",
    effectiveProcessCwd: "/repo",
    commands: [
      {
        name: "req-analyze",
        description: "Produce an analysis report",
        source: "extension",
        sourceInfo: {
          path: "/repo/src/index.ts",
          source: "extension",
          scope: "project",
          origin: "top-level",
          baseDir: "/repo/src",
        },
      },
    ],
    tools: [
      {
        name: "tokens",
        description: "Return the structured canonical-document token payload.",
        promptGuidelines: [],
        hasParameters: false,
        sourceInfo: {
          path: "/repo/src/index.ts",
          source: "extension",
          scope: "project",
          origin: "top-level",
          baseDir: "/repo/src",
        },
      },
    ],
    eventHandlers: ["session_start"],
    activeTools: ["tokens"],
    sentUserMessages: [],
  };
}

/**
 * @brief Builds a minimal SDK snapshot fixture for parity-comparator tests.
 * @details Returns a deterministic SDK inventory snapshot aligned with `buildOfflineFixture()` unless overridden by the caller. Runtime is O(1). No side effects occur.
 * @param[in] overrides {Partial<SdkContractSnapshot> | undefined} Optional field overrides.
 * @return {SdkContractSnapshot} Synthetic SDK snapshot.
 */
function buildSdkFixture(overrides?: Partial<SdkContractSnapshot>): SdkContractSnapshot {
  return {
    extensionPath: "/repo/src/index.ts",
    requestedCwd: "/repo",
    commands: [
      {
        name: "req-analyze",
        description: "Produce an analysis report",
        sourceInfo: {
          path: "src/index.ts",
          source: "extension",
          scope: "project",
          origin: "top-level",
          baseDir: "src",
        },
      },
    ],
    tools: [
      {
        name: "tokens",
        description: "Return the structured canonical-document token payload.",
        hasParameters: false,
        sourceInfo: {
          path: "src/index.ts",
          source: "extension",
          scope: "project",
          origin: "top-level",
          baseDir: "src",
        },
      },
    ],
    activeTools: ["tokens"],
    runtimeShape: "extensionsResult.runtime.pi",
    ...overrides,
  };
}

/**
 * @brief Executes `scripts/pi-usereq-debug.sh` in a subprocess.
 * @details Resolves the repository-local wrapper path from the current test module, runs it through `bash` so shell semantics remain stable, and captures the resulting stdout, stderr, and exit status for wrapper-focused assertions. Runtime is dominated by subprocess execution. Side effects are limited to child-process creation.
 * @param[in] args {string[]} Wrapper CLI arguments excluding the script path.
 * @param[in] cwd {string} Working directory exposed to the wrapper as the caller cwd.
 * @return {import("node:child_process").SpawnSyncReturns<string>} Captured subprocess result.
 */
function runPiUsereqDebug(args: string[], cwd: string) {
  const scriptPath = fileURLToPath(new URL("../scripts/pi-usereq-debug.sh", import.meta.url));
  return spawnSync("bash", [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("inspectExtension records commands, tools, events, and manual examples", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const report = await inspectExtension(projectBase);

    assert.ok(report.commands.some((command) => command.name === "req-analyze"));
    assert.ok(report.tools.some((tool) => tool.name === "tokens"));
    assert.deepEqual(report.eventHandlers, [...PI_USEREQ_STATUS_HOOK_NAMES]);

    for (const command of report.commands.filter((entry) => entry.name.startsWith("req-"))) {
      assert.match(report.manual, new RegExp(`prompt /${command.name}`));
      assert.match(report.manual, new RegExp(`--name ${command.name}`));
    }
    for (const tool of report.tools) {
      assert.match(report.manual, new RegExp(`tool ${tool.name}`));
      assert.match(report.manual, new RegExp(`--name ${tool.name}`));
    }
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("inspectExtension surfaces agent-oriented search tool descriptions and schema details", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    const report = await inspectExtension(projectBase);
    const filesSearch = report.tools.find((tool) => tool.name === "files-search");
    const search = report.tools.find((tool) => tool.name === "search");

    assert.ok(filesSearch, "missing files-search tool");
    assert.ok(search, "missing search tool");
    assert.match(filesSearch.description ?? "", /monolithic construct-search markdown report/);
    assert.ok(filesSearch.promptGuidelines?.some((line) => line.includes("Supported tags [Typescript]:")));
    assert.match(String((filesSearch.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);
    assert.match(search.description ?? "", /configured project source directories/);
    assert.ok(search.promptGuidelines?.some((line) => line.includes("Regex rule:")));
    assert.match(String((search.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("inspectExtension surfaces agent-oriented compression tool descriptions and schema details", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    const report = await inspectExtension(projectBase);
    const filesCompress = report.tools.find((tool) => tool.name === "files-compress");
    const compress = report.tools.find((tool) => tool.name === "compress");

    assert.ok(filesCompress, "missing files-compress tool");
    assert.ok(compress, "missing compress tool");
    assert.match(filesCompress.description ?? "", /monolithic compression markdown report/);
    assert.ok(filesCompress.promptGuidelines?.some((line) => line.includes("Line-number behavior:")));
    assert.match(String((filesCompress.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);
    assert.match(compress.description ?? "", /configured project source directories/);
    assert.ok(compress.promptGuidelines?.some((line) => line.includes("Formatting contract:")));
    assert.match(String((compress.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("inspectExtension surfaces static-check tool descriptions and schema details", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    const report = await inspectExtension(projectBase);
    const filesStaticCheck = report.tools.find((tool) => tool.name === "files-static-check");
    const staticCheck = report.tools.find((tool) => tool.name === "static-check");

    assert.ok(filesStaticCheck, "missing files-static-check tool");
    assert.ok(staticCheck, "missing static-check tool");

    assert.match(filesStaticCheck.description ?? "", /monolithic static-check report/);
    assert.ok(filesStaticCheck.promptGuidelines?.some((line) => line.includes("Failure contract:")));
    assert.match(String((filesStaticCheck.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic text/);

    assert.match(staticCheck.description ?? "", /configured source and test directories/);
    assert.ok(staticCheck.promptGuidelines?.some((line) => line.includes("Selection contract:")));
    assert.match(String((staticCheck.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic text/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("replaySessionStart captures active tools, statuses, and cwd semantics", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    writeEnabledTools(projectBase, ["files-tokens", "static-check"]);
    const report = await replaySessionStart(projectBase);
    const status = report.ui.statuses["pi-usereq"] ?? "";

    const expectedBranch = spawnSync("git", ["branch", "--show-current"], {
      cwd: projectBase,
      encoding: "utf8",
    }).stdout.trim() || "unknown";
    const escapedBranch = expectedBranch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    assert.deepEqual([...report.activeTools].sort(), ["files-tokens", "static-check"]);
    assert.equal(report.effectiveCtxCwd, projectBase);
    assert.equal(report.effectiveProcessCwd, projectBase);
    assert.match(status, /<accent>status:<\/accent><warning>idle<\/warning>/);
    assert.match(status, new RegExp(`<accent>branch:<\\/accent><warning>${escapedBranch}<\\/warning>`));
    assert.doesNotMatch(status, /<accent>current-path:<\/accent>/);
    assert.match(status, /<accent>context:<\/accent>▕_▏/);
    assert.match(status, /<accent>elapsed:<\/accent><warning>⏱︎ --:-- ⚑ --:-- ⌛︎--:--<\/warning>/);
    assert.match(status, /<accent>sound:<\/accent><warning>none<\/warning>/);
    assert.doesNotMatch(status, /<accent>beep:<\/accent>/);
    assert.doesNotMatch(status, /<accent>pushover:<\/accent>/);
    assert.doesNotMatch(status, /<accent>base:<\/accent>/);
    assert.doesNotMatch(status, /<accent>docs:<\/accent>/);
    assert.doesNotMatch(status, /<accent>src:<\/accent>/);
    assert.doesNotMatch(status, /<accent>tests:<\/accent>/);
    assert.doesNotMatch(status, /<accent>git:<\/accent>/);
    assert.doesNotMatch(status, /<accent>tools:<\/accent>/);
    assert.equal(report.ui.notifications.length, 0);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("replayCommand captures prompt command payloads", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const configPath = getProjectConfigPath(projectBase);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    config.GIT_WORKTREE_ENABLED = "disable";
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    assert.equal(spawnSync("git", ["add", ".pi-usereq.json", ".req/config.json"], {
      cwd: projectBase,
      encoding: "utf8",
    }).status, 0);
    const commit = spawnSync("git", ["commit", "-m", "config override"], {
      cwd: projectBase,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "pi-usereq",
        GIT_AUTHOR_EMAIL: "pi-usereq@example.com",
        GIT_COMMITTER_NAME: "pi-usereq",
        GIT_COMMITTER_EMAIL: "pi-usereq@example.com",
      },
    });
    assert.equal(commit.status, 0, commit.stderr);
    const report = await replayCommand("req-analyze", "Inspect src/index.ts for prompt coverage", projectBase);

    assert.equal(report.effectiveCtxCwd, projectBase);
    assert.equal(report.effectiveProcessCwd, projectBase);
    assert.equal(report.sentUserMessages.length, 1);
    assert.match(String(report.sentUserMessages[0]?.content), /Inspect src\/index\.ts for prompt coverage/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("replayCommand captures interactive UI side effects", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const report = await replayCommand(
      "pi-usereq",
      "",
      projectBase,
      undefined,
      {
        selects: ["Enable tools", "Disable all configurable tools"],
        inputs: [],
      },
    );

    assert.deepEqual(report.activeTools, []);
    assert.ok(report.ui.notifications.some((entry) => entry.message === "Disabled all configurable active tools"));
    assert.doesNotMatch(report.ui.statuses["pi-usereq"] ?? "", /<accent>tools:<\/accent>/);
    assert.match(report.ui.statuses["pi-usereq"] ?? "", /<accent>elapsed:<\/accent><warning>⏱︎ --:-- ⚑ --:-- ⌛︎--:--<\/warning>/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("replayTool captures tool results and cwd semantics", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const report = await replayTool("tokens", {}, projectBase);
    const toolResult = report.toolResult as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    assert.equal(report.effectiveCtxCwd, projectBase);
    assert.equal(report.effectiveProcessCwd, projectBase);
    assert.match(toolResult.content?.[0]?.text ?? "", /Pack Summary/);
    assert.match(toolResult.content?.[0]?.text ?? "", /REQUIREMENTS\.md/);
    assert.equal(toolResult.details?.execution.code, 0);
    assert.deepEqual(toolResult.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("pi-usereq-debug tool forwards --params unchanged for files-search", () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    fs.writeFileSync(path.join(projectBase, "src", "find_target.py"), "def foo():\n    return 1\n", "utf8");
    const expectedParams = {
      tag: "FUNCTION",
      pattern: "^foo$",
      files: ["src/find_target.py"],
      enableLineNumbers: true,
    };
    const result = runPiUsereqDebug(
      ["tool", "files-search", "--params", JSON.stringify(expectedParams), "--format", "json"],
      projectBase,
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as { toolParams: Record<string, unknown> };
    assert.deepEqual(report.toolParams, expectedParams);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("pi-usereq-debug tool converts --args text into forwarded params JSON", () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    fs.writeFileSync(path.join(projectBase, "src", "find_target.py"), "def foo():\n    return 1\n", "utf8");
    const expectedParams = {
      tag: "FUNCTION",
      pattern: "^foo$",
      files: ["src/find_target.py"],
      enableLineNumbers: true,
    };
    const result = runPiUsereqDebug(
      [
        "tool",
        "files-search",
        "--args",
        "FUNCTION ^foo$ src/find_target.py --enable-line-numbers",
        "--format",
        "json",
      ],
      projectBase,
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as { toolParams: Record<string, unknown> };
    assert.deepEqual(report.toolParams, expectedParams);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("buildParityReport returns ok for aligned inventories and reports mismatch categories", async () => {
  const offline = buildOfflineFixture();
  const alignedReport = buildParityReport(offline, buildSdkFixture());
  assert.equal(alignedReport.ok, true);
  assert.equal(alignedReport.mismatches.length, 0);

  const mismatchReport = buildParityReport(
    offline,
    buildSdkFixture({
      commands: [
        {
          name: "req-analyze",
          description: "Different command",
          sourceInfo: {
            path: "src/other.ts",
            source: "extension",
            scope: "project",
            origin: "top-level",
            baseDir: "src",
          },
        },
        {
          name: "req-change",
          description: "Extra command",
          sourceInfo: {
            path: "src/index.ts",
            source: "extension",
            scope: "project",
            origin: "top-level",
            baseDir: "src",
          },
        },
      ],
      tools: [
        {
          name: "tokens",
          description: "Different tool",
          hasParameters: true,
          sourceInfo: {
            path: "src/other.ts",
            source: "extension",
            scope: "project",
            origin: "top-level",
            baseDir: "src",
          },
        },
        {
          name: "static-check",
          description: "Extra tool",
          hasParameters: false,
          sourceInfo: {
            path: "src/index.ts",
            source: "extension",
            scope: "project",
            origin: "top-level",
            baseDir: "src",
          },
        },
      ],
      activeTools: ["static-check"],
    }),
  );

  const categories = new Set(mismatchReport.mismatches.map((mismatch) => mismatch.category));
  assert.equal(mismatchReport.ok, false);
  assert.ok(categories.has("command-name"));
  assert.ok(categories.has("command-description"));
  assert.ok(categories.has("command-source-info"));
  assert.ok(categories.has("tool-name"));
  assert.ok(categories.has("tool-description"));
  assert.ok(categories.has("tool-parameter-schema"));
  assert.ok(categories.has("tool-source-info"));
  assert.ok(categories.has("active-tools"));

  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { scripts?: Record<string, string> };
  assert.ok(packageJson.scripts?.["debug:ext"]);
  assert.ok(packageJson.scripts?.["debug:ext:inspect"]);
  assert.ok(packageJson.scripts?.["debug:ext:session"]);
  assert.ok(packageJson.scripts?.["debug:ext:command"]);
  assert.ok(packageJson.scripts?.["debug:ext:tool"]);
  assert.ok(packageJson.scripts?.["debug:ext:sdk"]);
});
