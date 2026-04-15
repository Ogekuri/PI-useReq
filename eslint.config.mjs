import { fileURLToPath } from "node:url";
import path from "node:path";
import tseslint from "typescript-eslint";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".venv/**",
      ".venv-oracle/**",
      "temp/**",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: ROOT_DIR,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {},
  },
);
