#!/usr/bin/env bash
##
# @file scripts/pre-release-check.sh
# @brief Executes the official pi-usereq pre-release verification gate.
# @details Resolves the repository root from this script's own location and runs the mandatory pre-release stages in fixed order: environment preflight (`git`, `node`, `npm` presence plus the Node.js major-version `>= 24` engine gate), clean dependency install (`npm ci`), optional build (`npm run build --if-present`), strict TypeScript type-check (`node_modules/.bin/tsc --noEmit`), and the full test suite (`npm test`). The gate stops at the first failing stage, prints one status banner per stage, exits `0` only after every stage succeeds, and exits non-zero otherwise. Supports `--skip-install` to reuse the existing `node_modules` tree and `--help` for usage; rejects unknown options with exit code `2`. After the stages finish, the gate removes every repository entry its stages created — build outputs and intermediate files included — by diffing the pre-run and post-run `git status --porcelain --untracked-files=normal --ignored` inventories, keeping `node_modules` and every pre-existing or tracked-status entry untouched. Cleanup runs on success, failure, and signal-induced exits while preserving the first failing stage exit code. Runtime is dominated by `npm ci` plus `npm test`. Side effects include `node_modules` replacement, npm lifecycle scripts, child process spawning, and deletion of run-created repository entries.
# @satisfies DES-029, REQ-491, REQ-492, REQ-493, REQ-494, REQ-495, REQ-496, REQ-497, REQ-498
##

set -euo pipefail

##
# @brief Resolves the absolute repository root owning this script.
# @details Normalizes the parent directory of `scripts/pre-release-check.sh` once at startup so every stage executes from the repository root regardless of the caller working directory. Runtime is O(1) in path length. No external state is mutated.
# @return {void} Assigns the module-scoped `REPO_ROOT` variable; prints nothing.
# @satisfies REQ-494
##
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

##
# @brief Holds the `--skip-install` selection state.
# @details Defaults to `0`; the argument parser sets `1` when `--skip-install` is supplied so the install stage reuses the existing `node_modules` tree instead of running `npm ci`.
##
SKIP_INSTALL=0

##
# Holds the absolute path of the pre-run repository inventory snapshot file.
# @details Written by `capture_pre_run_inventory(...)` and consumed by `cleanup_generated_artifacts(...)` as the `comm` diff baseline, then removed at exit.
##
PRC_PRE_INVENTORY_FILE=""

##
# Holds the guard flag arming run-created artifact removal.
# @details Stays `0` until the pre-run inventory snapshot succeeds so help, unknown-option, and pre-snapshot failures exit without running any removal pass.
##
PRC_INVENTORY_READY=0

##
# @brief Captures one sorted repository artifact inventory snapshot.
# @details Emits one line per visible untracked (`??`) or ignored (`!!`) entry reported by `git status --porcelain --untracked-files=normal --ignored`, with directories collapsed to their root path, then sorts the lines with the C locale so later `comm` differencing stays deterministic. Runtime is O(n) in inventory size. Side effects are limited to read-only git probing.
# @return {string} Sorted inventory lines emitted on stdout.
# @satisfies REQ-495
##
capture_repo_inventory() {
  git status --porcelain --untracked-files=normal --ignored 2>/dev/null | LC_ALL=C sort
}

##
# @brief Captures the pre-run repository artifact inventory snapshot.
# @details Writes the `capture_repo_inventory(...)` output into one temporary file and arms `PRC_INVENTORY_READY` so the `EXIT` trap may remove only entries created after this point. Runtime is O(n) in inventory size. Side effects include one temporary file creation.
# @return {void} No return value; assigns `PRC_PRE_INVENTORY_FILE` and sets `PRC_INVENTORY_READY=1`.
# @satisfies REQ-495
##
capture_pre_run_inventory() {
  PRC_PRE_INVENTORY_FILE="$(mktemp "${TMPDIR:-/tmp}/pi-usereq-pre-release-check.XXXXXX")"
  capture_repo_inventory > "${PRC_PRE_INVENTORY_FILE}"
  PRC_INVENTORY_READY=1
}

##
# @brief Removes repository artifacts created by the gate stages.
# @details Diffs the post-run `capture_repo_inventory(...)` output against the pre-run snapshot and removes with `rm -rf` every `??` or `!!` entry absent from the snapshot so build outputs and intermediate files created by `npm ci`, the optional build, `tsc --noEmit`, or `npm test` never survive the gate. Skips `node_modules` entries so the dependency tree installed by the gate stays reusable, skips every pre-existing or tracked-status entry, and removes its temporary inventory files. Runtime is O(n) in inventory diff size. Side effects include deletion of run-created repository entries and temporary-file removal.
# @return {void} No return value; always returns `0` so the `EXIT` trap re-exits with the preserved gate exit code.
# @satisfies REQ-496, REQ-497, REQ-498
##
cleanup_generated_artifacts() {
  if [[ "${PRC_INVENTORY_READY}" -ne 1 ]]; then
    return 0
  fi
  local post_inventory_file
  post_inventory_file="$(mktemp "${TMPDIR:-/tmp}/pi-usereq-pre-release-check.XXXXXX")" || post_inventory_file=""
  if [[ -n "${post_inventory_file}" ]]; then
    capture_repo_inventory > "${post_inventory_file}" || :
    local entry entry_path
    while IFS= read -r entry || [[ -n "${entry}" ]]; do
      [[ -n "${entry}" ]] || continue
      case "${entry}" in
        '?? '*|'!! '*) entry_path="${entry#?? }" ;;
        *) continue ;;
      esac
      case "${entry_path}" in
        node_modules|node_modules/*) continue ;;
      esac
      if [[ "${entry_path}" == '"'* ]]; then
        entry_path="${entry_path#\"}"
        entry_path="${entry_path%\"}"
      fi
      if [[ -e "${entry_path}" || -L "${entry_path}" ]]; then
        rm -rf -- "${entry_path}"
        printf 'pre-release-check: removed generated artifact: %s\n' "${entry_path}"
      fi
    done < <(comm -13 "${PRC_PRE_INVENTORY_FILE}" "${post_inventory_file}")
    rm -f -- "${post_inventory_file}"
  fi
  rm -f -- "${PRC_PRE_INVENTORY_FILE}"
  PRC_PRE_INVENTORY_FILE=""
  PRC_INVENTORY_READY=0
  return 0
}

##
# @brief Routes every gate exit path through artifact cleanup.
# @details Installs the `EXIT` trap that forwards the observed exit code into `cleanup_generated_artifacts(...)` and re-exits with the same code, plus `INT` and `TERM` traps that convert signal termination into trap-routed exits so interrupted runs still remove their created artifacts. Runtime is O(1). Side effects are limited to trap registration.
# @satisfies REQ-497
##
trap 'prc_gate_exit_code=$?; cleanup_generated_artifacts || :; exit "${prc_gate_exit_code}"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

##
# @brief Prints the English usage document for the pre-release gate.
# @details Emits the fixed stage sequence, the supported options, and the exit-code contract to stdout. Runtime is O(1). No external state is mutated.
# @return {void} No return value; usage text goes to stdout.
# @satisfies REQ-493
##
usage() {
  cat <<'USAGE'
Usage: scripts/pre-release-check.sh [--skip-install]

Runs the official pre-release verification gate from the repository root:
  1. Environment preflight: git, node (major >= 24), npm availability
  2. Clean dependency install: npm ci (skipped by --skip-install)
  3. Optional build: npm run build --if-present
  4. Strict type-check: node_modules/.bin/tsc --noEmit
  5. Full test suite: npm test

Options:
  --skip-install  Reuse the existing node_modules tree instead of npm ci
  -h, --help      Print this usage and exit 0

Exits 0 only when every stage succeeds; exits non-zero on the first failure.

Removes repository entries created by this run (build outputs, intermediate
files) before exiting; node_modules and pre-existing entries are kept.
USAGE
}

##
# @brief Reports one fatal gate failure and terminates the process.
# @details Prints the supplied diagnostic to stderr prefixed with the canonical gate label and exits with code `1`. Runtime is O(n) in message length. Side effect: terminates the shell process.
# @param[in] message {string} Failure diagnostic emitted to stderr.
# @return {never} Never returns; always exits `1`.
# @satisfies REQ-492
##
die() {
  printf 'pre-release-check: FAIL: %s\n' "$1" >&2
  exit 1
}

##
# @brief Executes one named gate stage with stop-at-first-failure semantics.
# @details Prints a start banner, invokes the stage command, prints an `OK` banner on success, and on failure prints a `FAILED` banner to stderr before exiting `1`, so the gate stops at the first failing stage. Runtime is dominated by the delegated stage command. Side effects are those of the delegated command plus process termination on failure.
# @param[in] stage_name {string} Human-readable stage label used in the status banners.
# @param[in] stage_command {string...} Executable plus arguments invoked as the stage body.
# @return {void} No return value on success; exits `1` on stage failure.
# @satisfies REQ-492
##
run_stage() {
  local stage_name="$1"
  shift
  printf '\n==> %s\n' "${stage_name}"
  if "$@"; then
    printf '==> %s: OK\n' "${stage_name}"
    return 0
  fi
  printf '==> %s: FAILED\n' "${stage_name}" >&2
  exit 1
}

##
# @brief Verifies gate prerequisites and the Node.js engine contract.
# @details Probes `git`, `node`, and `npm` on `PATH`, reads the runtime Node major version, and fails when it is lower than `24`, enforcing the documented `engines.node >= 24.0.0` minimum before any mutation stage runs. Runtime is dominated by one `node` probe. Side effects are limited to child process probing.
# @return {void} No return value on success.
# @retval {never} Exits `1` through `die(...)` when a command is missing or the engine gate fails.
# @satisfies REQ-491, CTN-027
##
check_environment() {
  local command_name
  for command_name in git node npm; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      die "required command not found on PATH: ${command_name}"
    fi
  done
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "${node_major}" -lt 24 ]]; then
    die "Node.js major >= 24 required (engines.node >=24.0.0), detected major: ${node_major}"
  fi
  printf 'node %s detected; Node major %s satisfies engines.node >=24.0.0\n' "$(node --version)" "${node_major}"
}

##
# @brief Installs deterministic release dependencies through `npm ci`.
# @details Runs `npm ci` from the repository root so the gate verifies against the lockfile-exact dependency tree used by the official release workflow. Honors `--skip-install` by printing a reuse notice and keeping the existing `node_modules` tree. Runtime is dominated by `npm ci`. Side effects include `node_modules` replacement and npm lifecycle scripts.
# @return {void} No return value on success.
# @retval {never} Exits through `run_stage(...)` with `1` when `npm ci` fails.
# @satisfies REQ-491, REQ-493
##
install_dependencies() {
  if [[ "${SKIP_INSTALL}" -eq 1 ]]; then
    printf 'skipping npm ci (--skip-install): reusing existing node_modules tree\n'
    return 0
  fi
  npm ci
}

##
# @brief Runs the optional project build stage.
# @details Delegates to `npm run build --if-present`, which succeeds as a no-op when the manifest declares no `build` script, so the gate stays valid on build-less revisions. Runtime is dominated by the build script when present. Side effects are those of the build script.
# @return {void} No return value on success.
# @retval {never} Exits through `run_stage(...)` with `1` when the build fails.
# @satisfies REQ-491
##
run_optional_build() {
  npm run build --if-present
}

##
# @brief Runs the strict TypeScript type-check stage.
# @details Executes the repository-owned `node_modules/.bin/tsc` binary with `--noEmit`, honoring the documented strict `noEmit` program contract, and fails with a remediation hint when the binary is absent so `--skip-install` misuse is self-explanatory. Runtime is dominated by the TypeScript compiler. Side effects are limited to filesystem reads.
# @return {void} No return value on success.
# @retval {never} Exits `1` when the compiler is missing or reports diagnostics.
# @satisfies REQ-491, CTN-006
##
run_type_check() {
  local tsc_bin="${REPO_ROOT}/node_modules/.bin/tsc"
  if [[ ! -x "${tsc_bin}" ]]; then
    die "tsc not executable at ${tsc_bin}; run without --skip-install so npm ci installs devDependencies"
  fi
  "${tsc_bin}" --noEmit
}

##
# @brief Runs the full test-suite stage.
# @details Delegates to `npm test`, the same suite gated by `prepublishOnly`, so the pre-release gate enforces the exact publication test contract. Runtime is dominated by the Node test runner. Side effects are those of the test suite.
# @return {void} No return value on success.
# @retval {never} Exits through `run_stage(...)` with `1` when any test fails.
# @satisfies REQ-491, CTN-029
##
run_test_suite() {
  npm test
}

##
# @brief Parses gate options and executes every stage in the documented order.
# @details Accepts exactly `--skip-install`, `-h`, and `--help`; rejects every other option with the usage document on stderr and exit code `2`; changes the working directory to the resolved repository root, captures the pre-run repository inventory snapshot, dispatches the five stages in order, prints the final success summary, and lets the exit trap remove repository entries created by the stages before the process returns the gate exit code. Runtime is the aggregate of all stages. Side effects are those of the dispatched stages plus run-created artifact removal at exit.
# @param[in] arguments {string...} Raw command-line arguments passed to the script.
# @return {void} No return value on success; exits non-zero on any failure.
# @satisfies REQ-491, REQ-492, REQ-493, REQ-494, REQ-495, REQ-496, REQ-497, REQ-498
##
main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-install)
        SKIP_INSTALL=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf 'pre-release-check: unknown option: %s\n' "$1" >&2
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
  cd "${REPO_ROOT}"
  capture_pre_run_inventory
  printf 'pi-usereq pre-release check\nrepository root: %s\nartifact cleanup: enabled (removes entries created by this run; keeps node_modules)\n' "${REPO_ROOT}"
  run_stage 'stage 1/5: environment preflight (git, node >=24, npm)' check_environment
  run_stage 'stage 2/5: clean dependency install (npm ci)' install_dependencies
  run_stage 'stage 3/5: optional build (npm run build --if-present)' run_optional_build
  run_stage 'stage 4/5: strict type-check (tsc --noEmit)' run_type_check
  run_stage 'stage 5/5: full test suite (npm test)' run_test_suite
  printf '\npre-release check: all stages passed.\n'
}

main "$@"
