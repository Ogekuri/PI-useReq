#!/usr/bin/env node
/**
 * @fileoverview pi-usereq distribution bin launcher.
 * @details Entry executable declared by the npm `bin` metadata as `pi-usereq`. Registers the bundled tsx ESM loader resolved from the installation-owned dependency tree, imports `main` from `src/cli.ts`, forwards every argv token after the launcher path unchanged, and stores the returned numeric exit code in `process.exitCode` so asynchronous management-command completions (`--ver|--version`, `--upgrade [--dev|--develop]`, `--uninstall`) can still override the final process exit code. Side effects are limited to loader registration, module loading, and delegated CLI execution.
 */

import process from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "tsx/esm/api";

const binDirectory = dirname(fileURLToPath(import.meta.url));
const cliEntryUrl = pathToFileURL(join(binDirectory, "..", "src", "cli.ts")).href;

const unregister = register();
try {
  const { main } = await import(cliEntryUrl);
  process.exitCode = main(process.argv.slice(2));
} finally {
  unregister();
}
