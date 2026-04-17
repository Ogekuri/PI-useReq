import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import piUsereqExtension from "../src/index.ts";
import {
  PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES,
  PI_USEREQ_EMBEDDED_TOOL_NAMES,
  PI_USEREQ_STARTUP_TOOL_NAMES,
} from "../src/core/pi-usereq-tools.js";
import { getSupportedStaticCheckLanguageSupport } from "../src/core/static-check.js";
import { createTempDir, initFixtureRepo } from "./helpers.js";

/**
 * @brief Describes one fake extension command registration captured during tests.
 * @details Mirrors the minimal command shape consumed by this suite so assertions can inspect descriptions and invoke handlers deterministically. The alias is compile-time only and introduces no runtime side effects.
 */
type RegisteredCommand = { description?: string; handler: (args: string, ctx: any) => Promise<void> | void };

/**
 * @brief Describes one fake extension tool registration captured during tests.
 * @details Mirrors the minimal custom-tool definition surface used by the suite, including the optional execute callback required for direct tool invocation assertions. The alias is compile-time only and introduces no runtime side effects.
 */
type RegisteredTool = {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
  sourceInfo?: Record<string, unknown>;
  execute?: (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: unknown, ctx?: any) => Promise<any> | any;
};

/**
 * @brief Represents the fake pi runtime returned by `createFakePi`.
 * @details Captures registered commands, tools, event handlers, and active-tool state for deterministic extension-registration assertions. The alias is compile-time only and introduces no runtime side effects.
 */
type FakePi = ReturnType<typeof createFakePi>;

/**
 * @brief Describes the scripted UI responses consumed by `createFakeCtx`.
 * @details Supplies queued select and input values so interactive command tests remain deterministic and free from real TUI dependencies. The alias is compile-time only and introduces no runtime side effects.
 */
type FakeCtxPlan = { selects: string[]; inputs?: string[] };

/**
 * @brief Creates a fake pi runtime that records command and tool registrations.
 * @details Provides deterministic in-memory implementations for the subset of `ExtensionAPI` methods exercised by this suite, including command registration, tool registration, builtin-tool discovery, event dispatch, and active-tool mutation. Runtime is O(1) per registration plus delegated handler cost. Side effects are limited to in-memory state mutation.
 * @return {FakePi} Fake extension runtime.
 */
function createFakePi() {
  const commands = new Map<string, RegisteredCommand>();
  const tools: RegisteredTool[] = [];
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<void> | void>>();
  const embeddedToolNames = new Set<string>(PI_USEREQ_EMBEDDED_TOOL_NAMES);
  const builtinTools: RegisteredTool[] = PI_USEREQ_EMBEDDED_TOOL_NAMES.map((name) => ({
    name,
    label: name,
    description: `Built-in pi CLI tool ${name}.`,
    sourceInfo: {
      path: `<builtin:${name}>`,
      source: "builtin",
      scope: "temporary",
      origin: "top-level",
    },
  }));
  let activeTools = PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES.filter((name) => embeddedToolNames.has(name));
  const getVisibleTools = () => {
    const overridden = new Set(tools.map((tool) => tool.name));
    return [
      ...builtinTools.filter((tool) => !overridden.has(tool.name)),
      ...tools,
    ].map((tool) => ({
      ...tool,
      sourceInfo: tool.sourceInfo ?? {
        path: "<extension:pi-usereq>",
        source: "extension",
        scope: "project",
        origin: "top-level",
      },
    }));
  };
  return {
    commands,
    tools,
    eventHandlers,
    getActiveTools() {
      return [...activeTools];
    },
    getAllTools() {
      return getVisibleTools();
    },
    setActiveTools(names: string[]) {
      const available = new Set(getVisibleTools().map((tool) => tool.name));
      activeTools = names.filter((name, index) => available.has(name) && names.indexOf(name) === index);
    },
    on(name: string, handler: (event: any, ctx: any) => Promise<void> | void) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    async emit(name: string, event: any, ctx: any) {
      for (const handler of eventHandlers.get(name) ?? []) {
        await handler(event, ctx);
      }
    },
    registerCommand(name: string, options: RegisteredCommand) {
      commands.set(name, options);
    },
    registerTool(definition: RegisteredTool) {
      const existingIndex = tools.findIndex((tool) => tool.name === definition.name);
      if (existingIndex >= 0) {
        tools[existingIndex] = definition;
      } else {
        tools.push(definition);
      }
      if (!activeTools.includes(definition.name)) {
        activeTools = [...activeTools, definition.name];
      }
    },
    sendUserMessage() {},
  } as any;
}

/**
 * @brief Creates a fake extension command context with scripted UI interactions.
 * @details Materializes deterministic `select`, `input`, `notify`, `setStatus`, and `setEditorText` behaviors backed by in-memory state so menu-oriented tests can assert side effects without a real UI. Runtime is O(1) plus queued interaction count. Side effects are limited to in-memory state mutation.
 * @param[in] cwd {string} Working directory exposed to command handlers.
 * @param[in] plan {FakeCtxPlan} Scripted select and input responses.
 * @return {any} Fake command context compatible with the tested handlers.
 */
function createFakeCtx(cwd: string, plan: FakeCtxPlan = { selects: [] }) {
  const selects = [...plan.selects];
  const inputs = [...(plan.inputs ?? [])];
  const state = {
    editorText: "",
    statuses: new Map<string, string>(),
    notifications: [] as Array<{ message: string; level: string }>,
  };
  return {
    cwd,
    __state: state,
    ui: {
      async select(_title: string, _items: string[]) {
        return selects.shift();
      },
      async input(_title: string, _placeholder?: string) {
        return inputs.shift();
      },
      notify(message: string, level: string = "info") {
        state.notifications.push({ message, level });
      },
      setStatus(key: string, value?: string) {
        if (value === undefined) {
          state.statuses.delete(key);
        } else {
          state.statuses.set(key, value);
        }
      },
      setEditorText(value: string) {
        state.editorText = value;
      },
    },
  };
}

/**
 * @brief Executes one registered fake tool while temporarily overriding `process.cwd()`.
 * @details Locates the named tool, validates the presence of its execute callback, switches the process working directory for the duration of the call, invokes the tool, and restores the previous cwd in a `finally` block. Runtime is dominated by the delegated tool logic. Side effects transiently mutate process cwd.
 * @param[in] pi {FakePi} Fake extension runtime containing registered tools.
 * @param[in] toolName {string} Registered tool name.
 * @param[in] cwd {string} Working directory to expose to tool code through `process.cwd()`.
 * @param[in] params {Record<string, unknown>} Tool parameter object.
 * @return {Promise<any>} Tool execution result payload.
 */
async function executeRegisteredTool(
  pi: FakePi,
  toolName: string,
  cwd: string,
  params: Record<string, unknown> = {},
): Promise<any> {
  const tool = pi.tools.find((candidate) => candidate.name === toolName);
  assert.ok(tool, `missing tool ${toolName}`);
  assert.ok(tool.execute, `missing execute handler for tool ${toolName}`);
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return await tool.execute!("tool-call-id", params, undefined, undefined, { cwd });
  } finally {
    process.chdir(previousCwd);
  }
}

test("extension registers prompt and config commands while exposing tool capabilities only as tools", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const commandNames = [...pi.commands.keys()].sort();
  for (const name of [
    "pi-usereq",
    "pi-usereq-show-config",
    "req-analyze",
    "req-change",
    "req-check",
    "req-cover",
    "req-create",
    "req-fix",
    "req-flowchart",
    "req-implement",
    "req-new",
    "req-readme",
    "req-recreate",
    "req-refactor",
    "req-references",
    "req-renumber",
    "req-workflow",
    "req-write",
  ]) {
    assert.ok(commandNames.includes(name), `missing command ${name}`);
  }

  for (const name of [
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
    "test-static-check",
  ]) {
    assert.ok(!commandNames.includes(name), `unexpected command ${name}`);
  }

  const toolNames = pi.tools.map((tool: RegisteredTool) => tool.name).sort();
  for (const name of [
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
  ]) {
    assert.ok(toolNames.includes(name), `missing tool ${name}`);
  }
});

test("configuration menu saves updated docs-dir in project config", async () => {
  const cwd = createTempDir("pi-usereq-menu-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler("", createFakeCtx(cwd, { selects: ["Set docs-dir", "Save and close"], inputs: ["docs/custom"] }));
  const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "pi-usereq", "config.json"), "utf8"));
  assert.equal(config["docs-dir"], "docs/custom");
});

test("session_start applies configured pi-usereq startup tools", async () => {
  const cwd = createTempDir("pi-usereq-tools-startup-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".pi", "pi-usereq", "config.json"),
    `${JSON.stringify({
      "docs-dir": "req/docs",
      "tests-dir": "tests",
      "src-dir": ["src"],
      "static-check": {},
      "enabled-tools": ["git-path", "static-check"],
    }, null, 2)}\n`,
    "utf8",
  );

  const pi = createFakePi();
  piUsereqExtension(pi);
  await pi.emit("session_start", { reason: "startup" }, createFakeCtx(cwd));

  const activeTools = new Set(pi.getActiveTools());
  assert.deepEqual([...activeTools].sort(), ["git-path", "static-check"]);
});

test("session_start enables default custom tools and default embedded tools only", async () => {
  const cwd = createTempDir("pi-usereq-default-tools-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);

  await pi.emit("session_start", { reason: "startup" }, createFakeCtx(cwd));

  const activeTools = new Set(pi.getActiveTools());
  for (const toolName of PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES) {
    assert.ok(activeTools.has(toolName), `missing default active tool ${toolName}`);
  }
  assert.equal(activeTools.has("grep"), false);
  assert.equal(activeTools.has("ls"), false);
});

test("configuration menu can enable embedded builtin tools", async () => {
  const cwd = createTempDir("pi-usereq-menu-embedded-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["Manage active tools", "Toggle tool", "✗ grep [builtin]", "Back", "Save and close"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "pi-usereq", "config.json"), "utf8"));
  assert.ok(config["enabled-tools"].includes("grep"));
  assert.ok(pi.getActiveTools().includes("grep"));
});

test("configuration menu can disable configurable active tools", async () => {
  const cwd = createTempDir("pi-usereq-menu-tools-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["Manage active tools", "Disable all configurable tools", "Back", "Save and close"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "pi-usereq", "config.json"), "utf8"));
  assert.deepEqual(config["enabled-tools"], []);
  assert.deepEqual(pi.getActiveTools().filter((toolName: string) => PI_USEREQ_STARTUP_TOOL_NAMES.includes(toolName as never)), []);
});

test("git-path tool derives the repository root at runtime", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const configPath = path.join(projectBase, ".pi", "pi-usereq", "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config["git-path"] = "/tmp/wrong-git-root";
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "git-path", projectBase);

    assert.equal(result.content?.[0]?.text, projectBase);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("static-check exposes the supported programming languages", () => {
  const supported = getSupportedStaticCheckLanguageSupport();
  assert.equal(supported.length, 20);
  assert.deepEqual(supported.find((entry) => entry.language === "Python"), { language: "Python", extensions: [".py"] });
  assert.deepEqual(supported.find((entry) => entry.language === "JavaScript"), {
    language: "JavaScript",
    extensions: [".js", ".mjs"],
  });
});

test("configuration menu can add static-check entries from raw specs", async () => {
  const cwd = createTempDir("pi-usereq-menu-sc-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["Manage static-check", "Add entry from LANG=MODULE[,CMD[,PARAM...]]", "Back", "Save and close"],
      inputs: ["Python=Command,true"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "pi-usereq", "config.json"), "utf8"));
  assert.deepEqual(config["static-check"].Python, [{ module: "Command", cmd: "true" }]);
});

test("configuration menu can add guided static-check entries for explicit supported languages", async () => {
  const cwd = createTempDir("pi-usereq-menu-sc-guided-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: [
        "Manage static-check",
        "Add entry for supported language",
        "Python [.py] (0 checkers)",
        "Ruff",
        "Back",
        "Save and close",
      ],
    }),
  );

  const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "pi-usereq", "config.json"), "utf8"));
  assert.deepEqual(config["static-check"].Python, [{ module: "Ruff" }]);
});
