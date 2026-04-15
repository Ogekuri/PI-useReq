import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  inspectExtension,
  replayCommand,
  replaySessionStart,
  replayTool,
  type OfflineContractSnapshot,
} from "../scripts/lib/extension-debug-harness.js";
import { buildParityReport, type SdkContractSnapshot } from "../scripts/lib/sdk-smoke.js";
import { initFixtureRepo } from "./helpers.js";

/**
 * @brief Persists a targeted enabled-tool list into a fixture project config.
 * @details Loads `.pi/pi-usereq/config.json`, replaces the `enabled-tools` array with the supplied values, and writes the updated JSON back to disk with a trailing newline. Runtime is O(n) in config size. Side effects include filesystem reads and file overwrite.
 * @param[in] projectBase {string} Fixture project root.
 * @param[in] enabledTools {string[]} Enabled-tool names to persist.
 * @return {void} No return value.
 */
function writeEnabledTools(projectBase: string, enabledTools: string[]): void {
  const configPath = path.join(projectBase, ".pi", "pi-usereq", "config.json");
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
        description: "Run pi-usereq prompt analyze",
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
        name: "git-path",
        description: "Print the configured git root path from .pi/pi-usereq/config.json.",
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
    activeTools: ["git-path"],
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
        description: "Run pi-usereq prompt analyze",
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
        name: "git-path",
        description: "Print the configured git root path from .pi/pi-usereq/config.json.",
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
    activeTools: ["git-path"],
    runtimeShape: "extensionsResult.runtime.pi",
    ...overrides,
  };
}

test("inspectExtension records commands, tools, events, and manual examples", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const report = await inspectExtension(projectBase);

    assert.ok(report.commands.some((command) => command.name === "req-analyze"));
    assert.ok(report.tools.some((tool) => tool.name === "git-path"));
    assert.deepEqual(report.eventHandlers, ["session_start"]);

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

test("replaySessionStart captures active tools, statuses, and cwd semantics", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    writeEnabledTools(projectBase, ["git-path", "static-check"]);
    const report = await replaySessionStart(projectBase);

    assert.deepEqual([...report.activeTools].sort(), ["git-path", "static-check"]);
    assert.equal(report.effectiveCtxCwd, projectBase);
    assert.equal(report.effectiveProcessCwd, projectBase);
    assert.match(report.ui.statuses["pi-usereq"] ?? "", /tools:2/);
    assert.equal(report.ui.notifications.length, 0);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("replayCommand captures prompt command payloads", async () => {
  const { projectBase } = initFixtureRepo();
  try {
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
        selects: ["Manage startup tools", "Disable all pi-usereq tools", "Back", "Save and close"],
        inputs: [],
      },
    );

    assert.deepEqual(report.activeTools, []);
    assert.ok(report.ui.notifications.some((entry) => entry.message === "Disabled all pi-usereq startup tools"));
    assert.match(report.ui.statuses["pi-usereq"] ?? "", /tools:0/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("replayTool captures tool results and cwd semantics", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const report = await replayTool("git-path", {}, projectBase);
    const toolResult = report.toolResult as {
      content?: Array<{ type: string; text?: string }>;
      details?: { stdout?: string };
    };

    assert.equal(report.effectiveCtxCwd, projectBase);
    assert.equal(report.effectiveProcessCwd, projectBase);
    assert.equal(toolResult.content?.[0]?.text, projectBase);
    assert.equal(toolResult.details?.stdout?.trim(), projectBase);
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
          name: "git-path",
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
