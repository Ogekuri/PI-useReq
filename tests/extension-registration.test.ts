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
 * @details Mirrors the minimal custom-tool definition surface used by the suite, including prompt metadata, parameter schemas, and the optional execute callback required for direct tool invocation assertions. The alias is compile-time only and introduces no runtime side effects.
 */
type RegisteredTool = {
  name: string;
  label?: string;
  description?: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters?: unknown;
  sourceInfo?: Record<string, unknown>;
  execute?: (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: unknown, ctx?: any) => Promise<any> | any;
};

/**
 * @brief Represents the fake pi runtime returned by `createFakePi`.
 * @details Captures registered commands, tools, event handlers, active-tool state, and prompt-delivery payloads for deterministic extension-registration assertions. The alias is compile-time only and introduces no runtime side effects.
 */
type FakePi = ReturnType<typeof createFakePi>;

/**
 * @brief Describes the scripted UI responses consumed by `createFakeCtx`.
 * @details Supplies queued select and input values so interactive command tests remain deterministic and free from real TUI dependencies. The alias is compile-time only and introduces no runtime side effects.
 */
type FakeCtxPlan = { selects: string[]; inputs?: string[] };

/**
 * @brief Extracts text content from a recorded session-manager user message.
 * @details Collapses text-part arrays appended during fake `ctx.newSession(...setup)` execution into one comparable string. Non-text payloads yield an empty string. Runtime is O(n) in part count. No external state is mutated.
 * @param[in] message {unknown} Session-manager message payload.
 * @return {string} Collapsed text content.
 */
function extractSessionMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
      ? (item as { text: string }).text
      : ""))
    .join("");
}

/**
 * @brief Creates a fake pi runtime that records command and tool registrations.
 * @details Provides deterministic in-memory implementations for the subset of `ExtensionAPI` methods exercised by this suite, including command registration, tool registration, builtin-tool discovery, event dispatch, active-tool mutation, and prompt delivery. Runtime is O(1) per registration plus delegated handler cost. Side effects are limited to in-memory state mutation.
 * @return {FakePi} Fake extension runtime.
 */
function createFakePi() {
  const commands = new Map<string, RegisteredCommand>();
  const tools: RegisteredTool[] = [];
  const sentUserMessages: Array<{ content: unknown; options?: unknown }> = [];
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
    sentUserMessages,
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
    sendUserMessage(content: unknown, options?: unknown) {
      sentUserMessages.push({ content, options });
    },
  } as any;
}

/**
 * @brief Creates a fake extension command context with scripted UI interactions.
 * @details Materializes deterministic `select`, `input`, `notify`, `setStatus`, `setEditorText`, `waitForIdle`, and `newSession` behaviors backed by in-memory state so menu-oriented and prompt-command tests can assert side effects without a real UI. Runtime is O(1) plus queued interaction count and delegated new-session setup cost. Side effects are limited to in-memory state mutation.
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
    waitForIdleCalls: 0,
    newSessions: [] as Array<{ messages: string[] }>,
  };
  return {
    cwd,
    __state: state,
    async waitForIdle() {
      state.waitForIdleCalls += 1;
    },
    async newSession(options?: {
      parentSession?: string;
      setup?: (sessionManager: { appendMessage: (message: unknown) => string }) => Promise<void>;
    }) {
      void options?.parentSession;
      const session = { messages: [] as string[] };
      if (options?.setup) {
        await options.setup({
          appendMessage(message: unknown) {
            if ((message as { role?: unknown })?.role === "user") {
              session.messages.push(extractSessionMessageText(message));
            }
            return "recorded-entry";
          },
        });
      }
      state.newSessions.push(session);
      return { cancelled: false };
    },
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

test("token tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesTokens = pi.tools.find((tool: RegisteredTool) => tool.name === "files-tokens");
  const tokens = pi.tools.find((tool: RegisteredTool) => tool.name === "tokens");
  assert.ok(filesTokens, "missing files-tokens tool");
  assert.ok(tokens, "missing tokens tool");

  assert.match(filesTokens.description ?? "", /LLM-oriented JSON payload/);
  assert.ok(filesTokens.promptGuidelines?.some((line) => line.includes("Output contract:")));
  assert.match(String((filesTokens.parameters as { description?: string } | undefined)?.description ?? ""), /line ranges/);

  assert.match(tokens.description ?? "", /canonical docs/);
  assert.ok(tokens.promptGuidelines?.some((line) => line.includes("docs_dir_path")));
  assert.match(String((tokens.parameters as { description?: string } | undefined)?.description ?? ""), /canonical_doc_names/);
});

test("reference tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesReferences = pi.tools.find((tool: RegisteredTool) => tool.name === "files-references");
  const references = pi.tools.find((tool: RegisteredTool) => tool.name === "references");
  assert.ok(filesReferences, "missing files-references tool");
  assert.ok(references, "missing references tool");

  assert.match(filesReferences.description ?? "", /request, summary, repository, files, and execution sections/);
  assert.ok(filesReferences.promptGuidelines?.some((line) => line.includes("Numeric contract:")));
  assert.ok(filesReferences.promptGuidelines?.some((line) => line.includes("Behavior contract:")));
  assert.match(String((filesReferences.parameters as { description?: string } | undefined)?.description ?? ""), /structured Doxygen fields/);

  assert.match(references.description ?? "", /configured project source directories/);
  assert.ok(references.promptGuidelines?.some((line) => line.includes("source_directory_paths")));
  assert.ok(references.promptGuidelines?.some((line) => line.includes("Configuration contract:")));
  assert.match(String((references.parameters as { description?: string } | undefined)?.description ?? ""), /directory tree/);
});

test("find tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesFind = pi.tools.find((tool: RegisteredTool) => tool.name === "files-find");
  const find = pi.tools.find((tool: RegisteredTool) => tool.name === "find");
  assert.ok(filesFind, "missing files-find tool");
  assert.ok(find, "missing find tool");

  assert.match(filesFind.description ?? "", /LLM-oriented JSON payload/);
  assert.ok(filesFind.promptGuidelines?.some((line) => line.includes("Regex rule:")));
  assert.ok(filesFind.promptGuidelines?.some((line) => line.includes("Supported tags [Typescript]:")));
  assert.ok(filesFind.promptGuidelines?.some((line) => line.includes("Supported tags [Python]:")));
  assert.match(String((filesFind.parameters as { description?: string } | undefined)?.description ?? ""), /supported_tags_by_language/);

  assert.match(find.description ?? "", /configured project source directories/);
  assert.ok(find.promptGuidelines?.some((line) => line.includes("source_directory_paths")));
  assert.ok(find.promptGuidelines?.some((line) => line.includes("Tag rule:")));
  assert.match(String((find.parameters as { description?: string } | undefined)?.description ?? ""), /Regex matches construct names only/);
});

test("files-tokens returns structured source facts and separated guidance", async () => {
  const { projectBase } = initFixtureRepo({
    fixtures: [],
    docs: {
      "REQUIREMENTS.md": "---\ntitle: Requirements\n---\n# Requirements\nAlpha\nBeta\n",
      "WORKFLOW.md": "# Workflow\nStep one\n",
      "REFERENCES.md": "# References\nEntry one\n",
    },
  });
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "files-tokens", projectBase, {
      files: ["req/docs/REQUIREMENTS.md", "req/docs/MISSING.md"],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        request: {
          base_dir_path: string;
          requested_input_paths: string[];
        };
        summary: {
          counted_file_count: number;
          skipped_file_count: number;
        };
        files: Array<{
          canonical_path: string;
          status: string;
          start_line_number: number;
          end_line_number: number;
          line_count: number;
          byte_count: number;
          primary_heading_text?: string;
        }>;
        guidance: {
          source_observations: {
            skipped_inputs: Array<{ input_path: string; canonical_path: string; reason: string }>;
          };
          derived_recommendations: Array<{ kind: string; ordered_paths: string[] }>;
          actionable_next_steps: Array<{ kind: string; ordered_paths: string[] }>;
        };
        execution: {
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.request.base_dir_path, projectBase);
    assert.deepEqual(payload.request.requested_input_paths, ["req/docs/REQUIREMENTS.md", "req/docs/MISSING.md"]);
    assert.equal(payload.summary.counted_file_count, 1);
    assert.equal(payload.summary.skipped_file_count, 1);
    assert.equal(payload.files[0]?.canonical_path, "req/docs/REQUIREMENTS.md");
    assert.equal(payload.files[0]?.start_line_number, 1);
    assert.equal(payload.files[0]?.end_line_number, payload.files[0]?.line_count);
    assert.ok((payload.files[0]?.byte_count ?? 0) > 0);
    assert.equal(payload.files[0]?.primary_heading_text, "Requirements");
    assert.deepEqual(payload.guidance.source_observations.skipped_inputs, [
      { input_path: "req/docs/MISSING.md", canonical_path: "req/docs/MISSING.md", reason: "not found" },
    ]);
    assert.equal(payload.guidance.derived_recommendations[0]?.kind, "prioritize_high_token_paths");
    assert.equal(payload.guidance.actionable_next_steps[0]?.kind, "read_top_token_paths_first");
    assert.match(payload.execution.stderr, /skipped: req\/docs\/MISSING\.md: not found/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-references returns structured repository, symbol, and Doxygen facts", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const samplePath = path.join(projectBase, "src", "sample.ts");
  fs.writeFileSync(samplePath, `/**
 * @file
 * @brief Sample source file.
 */

/**
 * @brief Builds the sample value.
 * @param[in] input {string} Caller-supplied value.
 * @return {string} Upper-cased result.
 * @satisfies REQ-011
 */
export function buildSample(input: string): string {
  return input.toUpperCase();
}
`, "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "files-references", projectBase, {
      files: ["src/sample.ts", "src/missing.ts"],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        request: {
          requested_input_paths: string[];
        };
        summary: {
          analyzed_file_count: number;
          skipped_file_count: number;
        };
        repository: {
          file_canonical_paths: string[];
        };
        files: Array<{
          canonical_path: string;
          status: string;
          symbol_count: number;
          doxygen_field_count: number;
          file_doxygen?: { brief?: string[] };
          symbols: Array<{
            symbol_name: string;
            qualified_name: string;
            symbol_kind: string;
            line_range: [number, number];
            doxygen?: {
              brief?: string[];
              params?: Array<{ direction: string; parameter_name?: string; value_type?: string; description?: string }>;
              returns?: string[];
              satisfies_requirement_ids?: string[];
            };
          }>;
        }>;
        execution: {
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.deepEqual(payload.request.requested_input_paths, ["src/sample.ts", "src/missing.ts"]);
    assert.equal(payload.summary.analyzed_file_count, 1);
    assert.equal(payload.summary.skipped_file_count, 1);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/sample.ts"]);
    assert.deepEqual(payload.files.map((file) => file.status), ["analyzed", "skipped"]);
    assert.equal(payload.files[0]?.canonical_path, "src/sample.ts");
    assert.equal(payload.files[0]?.symbol_count, 1);
    assert.ok((payload.files[0]?.doxygen_field_count ?? 0) >= 2);
    assert.deepEqual(payload.files[0]?.file_doxygen?.brief, ["Sample source file."]);
    assert.equal(payload.files[0]?.symbols[0]?.symbol_name, "buildSample");
    assert.equal(payload.files[0]?.symbols[0]?.qualified_name, "buildSample");
    assert.equal(payload.files[0]?.symbols[0]?.symbol_kind, "FUNCTION");
    assert.deepEqual(payload.files[0]?.symbols[0]?.line_range, [12, 14]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.brief, ["Builds the sample value."]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.params, [
      { direction: "in", parameter_name: "input", value_type: "string", description: "Caller-supplied value." },
    ]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.returns, ["{string} Upper-cased result."]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.satisfies_requirement_ids, ["REQ-011"]);
    assert.match(payload.execution.stderr, /skipped: src\/missing\.ts: not found/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("references returns a structured repository tree for configured source directories", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  fs.writeFileSync(path.join(projectBase, "src", "alpha.ts"), "export const ALPHA = 1;\n", "utf8");
  fs.mkdirSync(path.join(projectBase, "src", "nested"), { recursive: true });
  fs.writeFileSync(path.join(projectBase, "src", "nested", "beta.ts"), "export function beta(): number {\n  return 2;\n}\n", "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "references", projectBase, {}) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        summary: {
          analyzed_file_count: number;
          total_symbol_count: number;
        };
        repository: {
          source_directory_paths: string[];
          file_canonical_paths: string[];
          directory_tree: {
            node_name: string;
            children: Array<{ node_name: string; node_kind: string; children: Array<{ relative_path: string; node_kind: string }> }>;
          };
        };
        files: Array<{
          canonical_path: string;
          line_range: [number, number];
          symbols: Array<{ symbol_name: string; line_range: [number, number] }>;
        }>;
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.analyzed_file_count, 2);
    assert.equal(payload.summary.total_symbol_count, 1);
    assert.deepEqual(payload.repository.source_directory_paths, ["src"]);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/alpha.ts", "src/nested/beta.ts"]);
    assert.equal(payload.repository.directory_tree.node_name, ".");
    assert.equal(payload.repository.directory_tree.children[0]?.node_name, "src");
    assert.equal(payload.repository.directory_tree.children[0]?.node_kind, "directory");
    assert.ok(payload.repository.directory_tree.children[0]?.children.some((child) => child.relative_path === "src/alpha.ts"));
    assert.ok(payload.repository.directory_tree.children[0]?.children.some((child) => child.relative_path === "src/nested"));
    assert.deepEqual(payload.files.map((file) => file.canonical_path), ["src/alpha.ts", "src/nested/beta.ts"]);
    assert.deepEqual(payload.files[0]?.line_range, [1, 1]);
    assert.equal(payload.files[0]?.symbols.length, 0);
    assert.equal(payload.files[1]?.symbols[0]?.symbol_name, "beta");
    assert.deepEqual(payload.files[1]?.symbols[0]?.line_range, [1, 3]);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-find returns structured match, code-line, and Doxygen facts", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const samplePath = path.join(projectBase, "src", "sample.ts");
  fs.writeFileSync(samplePath, `/**
 * @file
 * @brief Sample source file.
 */

/**
 * @brief Builds the sample value.
 * @param[in] input {string} Caller-supplied value.
 * @return {string} Upper-cased result.
 * @satisfies REQ-089
 */
export function buildSample(input: string): string {
  return input.toUpperCase();
}
`, "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "files-find", projectBase, {
      tag: "FUNCTION",
      pattern: "^buildSample$",
      files: ["src/sample.ts", "src/missing.ts"],
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        request: {
          tag_filter_values: string[];
          tag_filter_status: string;
          line_number_mode: string;
          requested_input_paths: string[];
        };
        summary: {
          search_status: string;
          matched_file_count: number;
          skipped_file_count: number;
          total_match_count: number;
        };
        repository: {
          supported_tags_by_language: Record<string, string[]>;
        };
        files: Array<{
          canonical_path: string;
          status: string;
          match_count: number;
          supported_tags: string[];
          file_doxygen?: { brief?: string[] };
          matches: Array<{
            symbol_name: string;
            qualified_name: string;
            symbol_kind: string;
            line_range: [number, number];
            code_line_count: number;
            code_lines: Array<{ source_line_number: number; display_text: string; text: string }>;
            stripped_source_text?: string;
            doxygen?: {
              brief?: string[];
              params?: Array<{ direction: string; parameter_name?: string; value_type?: string; description?: string }>;
              returns?: string[];
              satisfies_requirement_ids?: string[];
            };
          }>;
        }>;
        execution: {
          code: number;
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.deepEqual(payload.request.tag_filter_values, ["FUNCTION"]);
    assert.equal(payload.request.tag_filter_status, "valid");
    assert.equal(payload.request.line_number_mode, "enabled");
    assert.deepEqual(payload.request.requested_input_paths, ["src/sample.ts", "src/missing.ts"]);
    assert.equal(payload.summary.search_status, "matched");
    assert.equal(payload.summary.matched_file_count, 1);
    assert.equal(payload.summary.skipped_file_count, 1);
    assert.equal(payload.summary.total_match_count, 1);
    assert.ok(payload.repository.supported_tags_by_language.typescript?.includes("FUNCTION"));
    assert.deepEqual(payload.files.map((file) => file.status), ["matched", "skipped"]);
    assert.equal(payload.files[0]?.canonical_path, "src/sample.ts");
    assert.equal(payload.files[0]?.match_count, 1);
    assert.ok(payload.files[0]?.supported_tags.includes("FUNCTION"));
    assert.deepEqual(payload.files[0]?.file_doxygen?.brief, ["Sample source file."]);
    assert.equal(payload.files[0]?.matches[0]?.symbol_name, "buildSample");
    assert.equal(payload.files[0]?.matches[0]?.qualified_name, "buildSample");
    assert.equal(payload.files[0]?.matches[0]?.symbol_kind, "FUNCTION");
    assert.deepEqual(payload.files[0]?.matches[0]?.line_range, [12, 14]);
    assert.ok((payload.files[0]?.matches[0]?.code_line_count ?? 0) > 0);
    assert.equal(payload.files[0]?.matches[0]?.code_lines[0]?.source_line_number, 12);
    assert.match(payload.files[0]?.matches[0]?.code_lines[0]?.display_text ?? "", /^12: export function buildSample/);
    assert.match(payload.files[0]?.matches[0]?.stripped_source_text ?? "", /^12: export function buildSample/m);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.brief, ["Builds the sample value."]);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.params, [
      { direction: "in", parameter_name: "input", value_type: "string", description: "Caller-supplied value." },
    ]);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.returns, ["{string} Upper-cased result."]);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.satisfies_requirement_ids, ["REQ-089"]);
    assert.equal(payload.execution.code, 0);
    assert.match(payload.execution.stderr, /skipped: src\/missing\.ts: not_found/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("find returns a structured repository-scoped construct-search payload", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  fs.writeFileSync(
    path.join(projectBase, "src", "alpha.ts"),
    `/**
 * @brief Builds alpha.
 * @return {number} Constant one.
 */
export function buildAlpha(): number {
  return 1;
}
`,
    "utf8",
  );
  fs.mkdirSync(path.join(projectBase, "src", "nested"), { recursive: true });
  fs.writeFileSync(
    path.join(projectBase, "src", "nested", "beta.ts"),
    "export function helperBeta(): number {\n  return 2;\n}\n",
    "utf8",
  );
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "find", projectBase, {
      tag: "FUNCTION",
      pattern: "^build",
      enableLineNumbers: false,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        request: {
          scope: string;
          regex_status: string;
          requested_file_count: number;
        };
        summary: {
          search_status: string;
          matched_file_count: number;
          no_match_file_count: number;
          total_match_count: number;
        };
        repository: {
          source_directory_paths: string[];
          file_canonical_paths: string[];
          supported_tags_by_language: Record<string, string[]>;
        };
        files: Array<{
          canonical_path: string;
          status: string;
          matches: Array<{
            symbol_name: string;
            code_lines: Array<{ display_text: string }>;
            stripped_source_text?: string;
          }>;
        }>;
        execution: {
          code: number;
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.request.scope, "configured-source-directories");
    assert.equal(payload.request.regex_status, "valid");
    assert.equal(payload.request.requested_file_count, 2);
    assert.equal(payload.summary.search_status, "matched");
    assert.equal(payload.summary.matched_file_count, 1);
    assert.equal(payload.summary.no_match_file_count, 1);
    assert.equal(payload.summary.total_match_count, 1);
    assert.deepEqual(payload.repository.source_directory_paths, ["src"]);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/alpha.ts", "src/nested/beta.ts"]);
    assert.ok(payload.repository.supported_tags_by_language.typescript?.includes("FUNCTION"));
    assert.deepEqual(payload.files.map((file) => file.status), ["matched", "no_match"]);
    assert.equal(payload.files[0]?.matches[0]?.symbol_name, "buildAlpha");
    assert.match(payload.files[0]?.matches[0]?.code_lines[0]?.display_text ?? "", /^export function buildAlpha/);
    assert.doesNotMatch(payload.files[0]?.matches[0]?.stripped_source_text ?? "", /^\d+:/m);
    assert.equal(payload.execution.code, 0);
    assert.match(payload.execution.stderr, /info: no_match: src\/nested\/beta\.ts/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
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

test("configuration menu can toggle reset-context", async () => {
  const cwd = createTempDir("pi-usereq-menu-reset-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler("", createFakeCtx(cwd, { selects: ["Toggle reset-context (true)", "Save and close"] }));
  const config = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "pi-usereq", "config.json"), "utf8"));
  assert.equal(config["reset-context"], false);
});

test("prompt commands reset context by default before prompt delivery", async () => {
  const cwd = createTempDir("pi-usereq-prompt-reset-");
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("req-analyze");
  assert.ok(command);
  const ctx = createFakeCtx(cwd);

  await command!.handler("Inspect src/index.ts for prompt coverage", ctx);

  assert.equal(ctx.__state.waitForIdleCalls, 1);
  assert.deepEqual(ctx.__state.newSessions.map((session) => session.messages.length), [1]);
  assert.match(ctx.__state.newSessions[0]!.messages[0] ?? "", /Inspect src\/index\.ts for prompt coverage/);
  assert.equal(pi.sentUserMessages.length, 0);
});

test("prompt commands reuse the current session when reset-context is false", async () => {
  const cwd = createTempDir("pi-usereq-prompt-current-");
  fs.mkdirSync(path.join(cwd, ".pi", "pi-usereq"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".pi", "pi-usereq", "config.json"),
    `${JSON.stringify({
      "docs-dir": "req/docs",
      "tests-dir": "tests",
      "src-dir": ["src"],
      "reset-context": false,
      "static-check": {},
      "enabled-tools": [],
    }, null, 2)}\n`,
    "utf8",
  );
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("req-analyze");
  assert.ok(command);
  const ctx = createFakeCtx(cwd);

  await command!.handler("Inspect src/index.ts for prompt coverage", ctx);

  assert.equal(ctx.__state.waitForIdleCalls, 0);
  assert.equal(ctx.__state.newSessions.length, 0);
  assert.equal(pi.sentUserMessages.length, 1);
  assert.match(String(pi.sentUserMessages[0]?.content), /Inspect src\/index\.ts for prompt coverage/);
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
