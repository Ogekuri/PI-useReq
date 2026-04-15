import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import piUsereqExtension from "../src/index.ts";
import { PI_USEREQ_STARTUP_TOOL_NAMES } from "../src/core/pi-usereq-tools.js";
import { getSupportedStaticCheckLanguageSupport } from "../src/core/static-check.js";
import { createTempDir, initFixtureRepo } from "./helpers.js";

type RegisteredCommand = { description?: string; handler: (args: string, ctx: any) => Promise<void> | void };
type RegisteredTool = { name: string; description?: string; parameters?: unknown; sourceInfo?: Record<string, unknown> };

type FakePi = ReturnType<typeof createFakePi>;

type FakeCtxPlan = { selects: string[]; inputs?: string[] };

function createFakePi() {
  const commands = new Map<string, RegisteredCommand>();
  const tools: RegisteredTool[] = [];
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<void> | void>>();
  let activeTools: string[] = [];
  return {
    commands,
    tools,
    eventHandlers,
    getActiveTools() {
      return [...activeTools];
    },
    getAllTools() {
      return tools.map((tool) => ({
        ...tool,
        sourceInfo: tool.sourceInfo ?? {
          path: "<extension:pi-usereq>",
          source: "extension",
          scope: "project",
          origin: "top-level",
        },
      }));
    },
    setActiveTools(names: string[]) {
      const available = new Set(tools.map((tool) => tool.name));
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
      tools.push(definition);
      if (!activeTools.includes(definition.name)) {
        activeTools = [...activeTools, definition.name];
      }
    },
    sendUserMessage() {},
  } as any;
}

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

test("extension registers all required prompt commands, tool wrappers, and agent tools", () => {
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
    assert.ok(commandNames.includes(name), `missing command ${name}`);
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

test("configuration menu can disable pi-usereq startup tools", async () => {
  const cwd = createTempDir("pi-usereq-menu-tools-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["Manage startup tools", "Disable all pi-usereq tools", "Back", "Save and close"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "pi-usereq", "config.json"), "utf8"));
  assert.deepEqual(config["enabled-tools"], []);
  assert.deepEqual(pi.getActiveTools().filter((toolName: string) => PI_USEREQ_STARTUP_TOOL_NAMES.includes(toolName as never)), []);
});

test("git-path dependent commands derive the repository root at runtime", async () => {
  const { projectBase } = initFixtureRepo();
  const configPath = path.join(projectBase, ".pi", "pi-usereq", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config["git-path"] = "/tmp/wrong-git-root";
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("git-path");
  assert.ok(command);

  const ctx = createFakeCtx(projectBase);
  await command!.handler("", ctx);

  assert.equal(ctx.__state.editorText.trim(), projectBase);
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
