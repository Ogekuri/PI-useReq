#!/usr/bin/env bash
# pi-usereq.sh — run the local repository copy exactly like the installed
# pi-usereq distribution bin: every argument is forwarded unchanged to the
# TypeScript CLI entry through the tsx loader (management commands: --ver,
# --version, --upgrade [--dev|--develop], --uninstall; analysis commands:
# --summarize, --compress, --tokens, --find, --static-check, ...).
# No implicit installs; install dependencies first with: npm install.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules/tsx ]; then
  echo "node_modules/tsx missing — install dependencies first: npm install (see README)" >&2
  exit 1
fi

exec node --import tsx ./src/cli.ts "$@"
