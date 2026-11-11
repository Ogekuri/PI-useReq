#!/usr/bin/env bash
##
# @file scripts/clean.sh
# @brief Removes every artifact created by the scripts/build.sh release packaging process.
# @details Resolves the repository root from this script's own location and runs the cleanup stages in fixed order: root-level `dist/*.tgz` release-tarball removal (every other `dist/` entry is preserved), `dist/` directory removal only when the directory is empty after tarball removal, and opt-in `node_modules/` dependency-tree removal gated by the `--node-modules` or `--all` option. The script stops at the first failing stage, prints one removal line per removed artifact, exits `0` after successful cleanup including artifact-free runs, and rejects unknown options with the usage document on stderr plus exit code `2`. Runtime is O(n) in removed entry count. Side effects include deletion of generated release tarballs, conditional `dist/` directory removal, and conditional `node_modules/` tree removal.
# @satisfies DES-036, REQ-591, REQ-592, REQ-593, REQ-594, REQ-595, REQ-596
##

set -Eeuo pipefail

##
# @brief Resolves the absolute repository root owning this script.
# @details Normalizes the parent directory of `scripts/clean.sh` once at startup so every stage executes from the repository root regardless of the caller working directory. Runtime is O(1) in path length. No external state is mutated.
# @return {void} Assigns the module-scoped `REPO_ROOT` variable; prints nothing.
# @satisfies REQ-591
##
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

##
# @brief Holds the canonical release artifact destination directory.
# @details Anchored at `<repo-root>/dist`, the directory whose root-level `*.tgz` tarballs are the generated outputs of `scripts/build.sh`.
##
DIST_DIR="${REPO_ROOT}/dist"

##
# @brief Holds the canonical dependency tree directory.
# @details Anchored at `<repo-root>/node_modules`, the dependency tree created by the `scripts/build.sh` dependency-preparation stage when the tree is absent.
##
NODE_MODULES_DIR="${REPO_ROOT}/node_modules"

##
# @brief Holds the opt-in dependency-tree removal flag.
# @details Defaults to `0`; the argument parser sets `1` when `--node-modules` or `--all` is supplied so the final stage removes the `node_modules/` tree instead of preserving it.
##
CLEAN_NODE_MODULES=0

##
# @brief Prints the English usage document for the release-artifact cleanup script.
# @details Emits the fixed stage sequence, the supported options, and the exit-code contract to stdout. Runtime is O(1). No external state is mutated.
# @return {void} No return value; usage text goes to stdout.
# @satisfies REQ-595
##
usage() {
  cat <<'USAGE'
Usage: scripts/clean.sh [--node-modules | --all]

Removes every artifact created by scripts/build.sh from the repository root:
  1. Release tarball removal: removes root-level dist/*.tgz only
  2. Artifact directory removal: removes dist/ itself only when emptied
  3. Dependency tree removal: removes node_modules/ (opt-in only)

Options:
  --node-modules  Also remove the node_modules/ dependency tree
  --all           Alias of --node-modules
  -h, --help      Print this usage and exit 0

Exits 0 after successful cleanup, including runs that find no artifact;
exits non-zero on the first failing stage. Files inside dist/ other than
*.tgz are preserved, and node_modules/ is preserved without the opt-in flag.
USAGE
}

##
# @brief Reports one fatal cleanup failure and terminates the process.
# @details Prints the supplied diagnostic to stderr prefixed with the canonical cleanup label and exits with code `1`. Runtime is O(n) in message length. Side effect: terminates the shell process.
# @param[in] message {string} Failure diagnostic emitted to stderr.
# @return {never} Never returns; always exits `1`.
##
die() {
  printf 'clean: FAIL: %s\n' "$1" >&2
  exit 1
}

##
# @brief Executes one named cleanup stage with stop-at-first-failure semantics.
# @details Prints a start banner, invokes the stage command, prints an `OK` banner on success, and on failure prints a `FAILED` banner to stderr before exiting `1`. Failure detection uses an `ERR` trap installed for the stage duration instead of an `if` condition, because Bash suspends `set -e` for every function body invoked inside an `if` condition, which would let non-final failing commands continue; the trap is inherited by stage functions through `set -E`, so cleanup stops at the first failing command of any stage. The banner is printed only by the main shell process (`BASHPID` equals `$$`), so command-substitution subshells do not duplicate it. Runtime is dominated by the delegated stage command. Side effects are those of the delegated command plus process termination on failure.
# @param[in] stage_name {string} Human-readable stage label used in the status banners.
# @param[in] stage_command {string...} Executable plus arguments invoked as the stage body.
# @return {void} No return value on success; exits `1` on stage failure.
##
run_clean_stage() {
  local stage_name="$1"
  shift
  printf '\n==> %s\n' "${stage_name}"
  trap 'if [[ "${BASHPID}" == "$$" ]]; then printf "==> %s: FAILED\n" "${stage_name}" >&2; fi; exit 1' ERR
  "$@"
  trap - ERR
  printf '==> %s: OK\n' "${stage_name}"
}

##
# @brief Removes every root-level release tarball generated by the packaging process.
# @details Deletes only root-level `dist/*.tgz` files — the generated outputs of `scripts/build.sh` — printing one removal line per removed tarball, so every other `dist/` entry, including versioned or user-owned files, is preserved. Skips silently with one notice when the `dist/` directory is absent. Runtime is O(n) in tarball count. Side effects include deletion of generated tarballs.
# @return {void} No return value.
# @satisfies REQ-592, REQ-596
##
clean_dist_tarballs() {
  if [[ ! -d "${DIST_DIR}" ]]; then
    printf 'clean: no dist directory present; skipping tarball removal\n'
    return 0
  fi
  find "${DIST_DIR}" -maxdepth 1 -type f -name '*.tgz' -print0 | while IFS= read -r -d '' tarball; do
    rm -f -- "${tarball}"
    printf 'clean: removed artifact: %s\n' "${tarball}"
  done
}

##
# @brief Removes the artifact directory itself only when emptied by tarball removal.
# @details Removes `dist/` through `rmdir` only when the directory exists and contains no remaining entry, so non-tarball entries preserved by the tarball stage keep the directory in place. Prints one removal line when the directory is removed. Runtime is O(n) in remaining entry count. Side effects include conditional directory removal.
# @return {void} No return value.
# @satisfies REQ-593, REQ-596
##
clean_dist_directory() {
  if [[ ! -d "${DIST_DIR}" ]]; then
    return 0
  fi
  if [[ -n "$(find "${DIST_DIR}" -mindepth 1 -print -quit)" ]]; then
    printf 'clean: dist directory preserved: non-artifact entries remain\n'
    return 0
  fi
  rmdir -- "${DIST_DIR}"
  printf 'clean: removed artifact: %s\n' "${DIST_DIR}"
}

##
# @brief Removes the dependency tree only under the explicit opt-in flag.
# @details Removes `node_modules/` recursively and prints one removal line when `CLEAN_NODE_MODULES` is `1` and the directory exists; otherwise preserves the tree with one notice, because `scripts/build.sh` reuses a pre-existing dependency tree and only creates it when absent. Runtime is O(n) in dependency-tree entry count when removal runs. Side effects include conditional recursive directory removal.
# @return {void} No return value.
# @satisfies REQ-594, REQ-596
##
clean_node_modules() {
  if [[ "${CLEAN_NODE_MODULES}" -ne 1 ]]; then
    printf 'clean: node_modules preserved (use --node-modules or --all to remove)\n'
    return 0
  fi
  if [[ ! -d "${NODE_MODULES_DIR}" ]]; then
    printf 'clean: no node_modules directory present; skipping dependency tree removal\n'
    return 0
  fi
  rm -rf -- "${NODE_MODULES_DIR}"
  printf 'clean: removed artifact: %s\n' "${NODE_MODULES_DIR}"
}

##
# @brief Parses cleanup options and executes every stage in the documented order.
# @details Accepts exactly `--node-modules`, `--all`, `-h`, and `--help`; rejects every other option with the usage document on stderr and exit code `2`; changes the working directory to the resolved repository root, dispatches the three stages in order, and prints the final success summary so artifact-free runs still exit `0`. Runtime is the aggregate of all stages. Side effects are those of the dispatched stages.
# @param[in] arguments {string...} Raw command-line arguments passed to the script.
# @return {void} No return value on success; exits non-zero on any failure.
# @satisfies REQ-591, REQ-594, REQ-595, REQ-596
##
main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --node-modules|--all)
        CLEAN_NODE_MODULES=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf 'clean: unknown option: %s\n' "$1" >&2
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
  cd "${REPO_ROOT}"
  printf 'pi-usereq release-artifact cleanup\nrepository root: %s\nartifact destination: %s\n' "${REPO_ROOT}" "${DIST_DIR}"
  run_clean_stage 'stage 1/3: release tarball removal (dist/*.tgz only)' clean_dist_tarballs
  run_clean_stage 'stage 2/3: artifact directory removal (dist/ only when emptied)' clean_dist_directory
  run_clean_stage 'stage 3/3: dependency tree removal (node_modules/, opt-in)' clean_node_modules
  printf '\nclean: all stages passed.\n'
}

main "$@"
