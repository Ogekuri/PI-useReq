import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getHomeResourceRoot } from "./config.js";

export function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function getBundledResourceRoot(): string {
  return path.join(getPackageRoot(), "resources");
}

export function ensureHomeResources(): string {
  const sourceRoot = getBundledResourceRoot();
  const destinationRoot = getHomeResourceRoot();
  if (!fs.existsSync(sourceRoot)) {
    return destinationRoot;
  }
  fs.mkdirSync(destinationRoot, { recursive: true });
  copyDirectoryContents(sourceRoot, destinationRoot);
  return destinationRoot;
}

function copyDirectoryContents(sourceDir: string, destinationDir: string): void {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destinationPath, { recursive: true });
      copyDirectoryContents(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

export function readBundledPrompt(promptName: string): string {
  const filePath = path.join(getBundledResourceRoot(), "prompts", `${promptName}.md`);
  return fs.readFileSync(filePath, "utf8");
}

export function listBundledPromptNames(): string[] {
  return fs
    .readdirSync(path.join(getBundledResourceRoot(), "prompts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("."))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}
