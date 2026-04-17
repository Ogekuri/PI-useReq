#!/usr/bin/env bash
# @file
# @brief Provides a bash wrapper for the standalone extension debug harness.
# @details Resolves repository-local execution paths, preserves the caller working directory as the default debug target, exposes convenience subcommands for registration inspection plus prompt and tool replay, resolves a repository-visible `tsx` runner, materializes a shared `node_modules` symlink for worktrees when required, and delegates execution to `scripts/debug-extension.ts`. Runtime is O(n) in CLI argument count plus delegated harness cost. Side effects include spawning one Node process and temporarily changing the wrapper subshell cwd to the repository root.

set -euo pipefail

# @brief Resolves the absolute directory containing `req-debug.sh`.
# @details Uses `BASH_SOURCE[0]` so invocation through relative paths or symlinks still anchors repository-relative lookups. Runtime is O(p) in path length. No filesystem mutation occurs.
readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# @brief Resolves the repository root that owns the debug wrapper.
# @details Moves one level above `SCRIPT_DIR` so delegated Node execution can load the repository-local `tsx` dependency and extension entry. Runtime is O(p) in path length. No filesystem mutation occurs.
readonly REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"

# @brief Stores the default extension entry path used by the wrapper.
# @details Binds all convenience subcommands to the repository's `src/index.ts` entry unless the caller provides a later `--extension` override. Runtime is O(1). No filesystem mutation occurs.
readonly DEFAULT_EXTENSION="${REPO_ROOT}/src/index.ts"

# @brief Stores the caller working directory used as the default debug cwd.
# @details Captures the shell cwd before the wrapper enters the repository root so replayed commands and tools observe the caller-selected project context. Runtime is O(1). No filesystem mutation occurs.
readonly CALLER_CWD="${PWD}"

# @brief Resolves the `tsx` executable visible to the wrapper.
# @details Searches the active repository install first, then the shared git-common checkout used by worktrees, and finally the process `PATH`. When a shared checkout provides `node_modules`, the function links that directory into the worktree before returning the executable path. Runtime is O(1) plus one git subprocess. Side effects may include creating `REPO_ROOT/node_modules` as a symlink.
# @return {string} Absolute or PATH-resolved `tsx` executable path.
# @throws {shell-error} Returns non-zero when no usable `tsx` executable is available.
resolve_tsx_binary() {
  local local_tsx="${REPO_ROOT}/node_modules/.bin/tsx"
  if [[ -x "${local_tsx}" ]]; then
    printf '%s\n' "${local_tsx}"
    return 0
  fi

  local git_common_dir=""
  git_common_dir="$(git -C "${REPO_ROOT}" rev-parse --git-common-dir 2>/dev/null || true)"
  if [[ -n "${git_common_dir}" ]]; then
    local shared_root
    local shared_tsx
    shared_root="$(CDPATH= cd -- "${git_common_dir}/.." && pwd)"
    shared_tsx="${shared_root}/node_modules/.bin/tsx"
    if [[ -x "${shared_tsx}" ]]; then
      if [[ ! -e "${REPO_ROOT}/node_modules" && ! -L "${REPO_ROOT}/node_modules" ]]; then
        ln -s "${shared_root}/node_modules" "${REPO_ROOT}/node_modules"
      fi
      printf '%s\n' "${shared_tsx}"
      return 0
    fi
  fi

  if command -v tsx >/dev/null 2>&1; then
    command -v tsx
    return 0
  fi

  printf 'Error: tsx executable not found in repository or PATH.\n' >&2
  return 1
}

# @brief Stores the resolved `tsx` executable path.
# @details Captures the executable once during wrapper startup so later dispatch paths do not repeat repository lookup logic. Runtime is dominated by `resolve_tsx_binary()`. Side effects may include creating a worktree-local `node_modules` symlink.
readonly TSX_BIN="$(resolve_tsx_binary)"

# @brief Prints the wrapper usage contract.
# @details Emits subcommand semantics, override rules, and concrete examples covering registrations, session replay, prompt replay, tool replay, and raw pass-through. Runtime is O(1). Side effect: writes to stdout.
# @return {void} No return value.
# @satisfies REQ-061, REQ-062
print_usage() {
  cat <<EOF
Usage: ./scripts/req-debug.sh <subcommand> [options]

Subcommands:
  inspect [debug-extension options...]
      Inspect command, tool, and event registrations.
  session [debug-extension options...]
      Replay session_start handlers via session-start.
  command <name> [--args <text> | debug-extension options...]
      Replay one registered command.
  prompt <name> [--args <text> | debug-extension options...]
      Replay one req-* prompt command; bare names are auto-prefixed.
  tool <name> [--params <json> | debug-extension options...]
      Replay one registered tool; defaults params to {}.
  sdk [debug-extension options...]
      Run sdk-smoke parity inspection.
  raw <debug-extension arguments...>
      Forward arguments directly to scripts/debug-extension.ts.
  help
      Show this usage text.

Default forwarding:
  - Adds --cwd "${CALLER_CWD}" before forwarded arguments.
  - Adds --extension "${DEFAULT_EXTENSION}" before forwarded arguments.
  - Later --cwd or --extension arguments override the defaults.

Examples:
  ./scripts/req-debug.sh inspect --format pretty
  ./scripts/req-debug.sh session --format json
  ./scripts/req-debug.sh prompt analyze --args "Inspect prompt rendering"
  ./scripts/req-debug.sh tool git-check --format pretty
  ./scripts/req-debug.sh raw command --name req-analyze --args "Review REQ-004"
EOF
}

# @brief Tests whether one exact option token is present in an argument list.
# @details Performs a linear scan over forwarded tokens and returns success when any token equals the requested option string. Runtime is O(n) in argument count. No external state is mutated.
# @param[in] needle {string} Exact option token to match.
# @param[in] ... {string[]} Forwarded CLI tokens.
# @return {int} Shell status `0` when the option exists; `1` otherwise.
contains_exact_option() {
  local needle="$1"
  shift
  local token
  for token in "$@"; do
    if [[ "${token}" == "${needle}" ]]; then
      return 0
    fi
  done
  return 1
}

# @brief Tests whether an argument list already contains any long option token.
# @details Detects tokens beginning with `--` so the wrapper can avoid inferring positional payloads when the caller is already using the underlying debug-harness option grammar. Runtime is O(n) in argument count. No external state is mutated.
# @param[in] ... {string[]} Forwarded CLI tokens.
# @return {int} Shell status `0` when a long option exists; `1` otherwise.
contains_long_option() {
  local token
  for token in "$@"; do
    if [[ "${token}" == --* ]]; then
      return 0
    fi
  done
  return 1
}

# @brief Normalizes prompt aliases to registered `req-*` command names.
# @details Returns the input unchanged when it already begins with `req-`; otherwise prepends the prefix required by extension registration. Runtime is O(p) in prompt-name length. No external state is mutated.
# @param[in] prompt_name {string} Prompt command alias supplied by the caller.
# @return {string} Registered prompt command name.
# @satisfies REQ-062
normalize_prompt_name() {
  local prompt_name="$1"
  if [[ "${prompt_name}" == req-* ]]; then
    printf '%s\n' "${prompt_name}"
    return 0
  fi
  printf 'req-%s\n' "${prompt_name}"
}

# @brief Executes `scripts/debug-extension.ts` with wrapper defaults.
# @details Enters the repository root so the resolved `tsx` dependency and shared `node_modules` tree remain visible, prepends default `--cwd` and `--extension` values, and forwards all remaining arguments unchanged so later overrides win. Runtime is dominated by the delegated Node process. Side effects include spawning one subprocess.
# @param[in] ... {string[]} Debug-harness CLI tokens beginning with the target subcommand.
# @return {int} Exit status produced by the delegated Node process.
# @satisfies REQ-060, REQ-062
run_debug_extension() {
  (
    cd -- "${REPO_ROOT}"
    "${TSX_BIN}" ./scripts/debug-extension.ts --cwd "${CALLER_CWD}" --extension "${DEFAULT_EXTENSION}" "$@"
  )
}

# @brief Validates that one required subcommand operand is present.
# @details Emits a deterministic stderr error when the caller omits a required positional name such as a command or tool identifier. Runtime is O(1). Side effect: writes to stderr on failure.
# @param[in] label {string} Human-readable operand label.
# @param[in] value {string} Operand value.
# @return {int} Shell status `0` when the operand exists; `1` otherwise.
require_value() {
  local label="$1"
  local value="${2-}"
  if [[ -n "${value}" ]]; then
    return 0
  fi
  printf 'Error: missing %s.\n' "${label}" >&2
  return 1
}

# @brief Dispatches wrapper subcommands to the standalone TypeScript harness.
# @details Implements the convenience grammar documented by `print_usage`, including session and SDK aliases, prompt-name normalization, default tool params, and raw pass-through mode. Runtime is O(n) in wrapper argument count plus delegated harness cost. Side effects include stdout/stderr writes and subprocess execution.
# @param[in] ... {string[]} Wrapper CLI arguments excluding the script path.
# @return {int} Exit status propagated from the delegated harness or local validation.
# @satisfies REQ-060, REQ-061, REQ-062
main() {
  local subcommand="${1-}"
  if [[ $# -eq 0 ]]; then
    print_usage
    return 0
  fi
  shift

  case "${subcommand}" in
    help|-h|--help)
      print_usage
      ;;
    inspect)
      run_debug_extension inspect "$@"
      ;;
    session)
      run_debug_extension session-start "$@"
      ;;
    command)
      local command_name="${1-}"
      require_value "command name" "${command_name}" || return 1
      shift
      if [[ $# -eq 0 ]]; then
        run_debug_extension command --name "${command_name}"
      elif contains_exact_option --args "$@" || contains_long_option "$@"; then
        run_debug_extension command --name "${command_name}" "$@"
      else
        run_debug_extension command --name "${command_name}" --args "$*"
      fi
      ;;
    prompt)
      local prompt_name="${1-}"
      local normalized_prompt_name
      require_value "prompt name" "${prompt_name}" || return 1
      normalized_prompt_name="$(normalize_prompt_name "${prompt_name}")"
      shift
      if [[ $# -eq 0 ]]; then
        run_debug_extension command --name "${normalized_prompt_name}"
      elif contains_exact_option --args "$@" || contains_long_option "$@"; then
        run_debug_extension command --name "${normalized_prompt_name}" "$@"
      else
        run_debug_extension command --name "${normalized_prompt_name}" --args "$*"
      fi
      ;;
    tool)
      local tool_name="${1-}"
      require_value "tool name" "${tool_name}" || return 1
      shift
      if [[ $# -eq 0 ]]; then
        run_debug_extension tool --name "${tool_name}" --params '{}'
      elif contains_exact_option --params "$@" || contains_long_option "$@"; then
        run_debug_extension tool --name "${tool_name}" "$@"
      elif [[ $# -eq 1 ]]; then
        run_debug_extension tool --name "${tool_name}" --params "$1"
      else
        printf 'Error: tool JSON must be one shell argument or use --params.\n' >&2
        return 1
      fi
      ;;
    sdk)
      run_debug_extension sdk-smoke "$@"
      ;;
    raw)
      require_value "raw subcommand" "${1-}" || return 1
      run_debug_extension "$@"
      ;;
    *)
      printf 'Error: unknown req-debug subcommand: %s\n' "${subcommand}" >&2
      print_usage >&2
      return 1
      ;;
  esac
}

main "$@"
