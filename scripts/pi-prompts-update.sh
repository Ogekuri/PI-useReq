#!/usr/bin/env bash
# @file scripts/pi-prompts-update.sh
# @brief Updates bundled PI-useReq prompt resources from the latest PI-Prompts release.
# @details Clones the PI-Prompts repository (master branch), resolves the newest
#     release ref, and performs a full one-way synchronization of the upstream
#     `src/instructions`, `src/prompts`, and `src/templates` directories into the
#     local `src/resources/instructions`, `src/resources/prompts`, and
#     `src/resources/templates` targets. Full synchronization overwrites every
#     present file and removes every file that no longer exists upstream by
#     replacing each target directory with a freshly staged copy. Upstream file
#     access and modification timestamps are preserved through `cp -p`.
#     Runtime is dominated by one git clone plus one ref checkout and per-file
#     copies. Side effects include temporary-directory creation, git
#     subprocesses, one optional GitHub Releases API request, and replacement of
#     the three target resource directories. No other repository content is
#     modified.
# @satisfies DES-022, REQ-379, REQ-380, REQ-381, REQ-382, REQ-383, REQ-384

set -euo pipefail

PROMPTS_REPO_URL_PRIMARY="https://github.com/Ogekuri/PI-Prompts.git"
PROMPTS_REPO_URL_FALLBACK="https://github.com/Ogekuri/PI-Prompts"
PROMPTS_RELEASE_API_URL="https://api.github.com/repos/Ogekuri/PI-Prompts/releases/latest"
PROMPTS_BRANCH="master"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_ROOT="${REPO_ROOT}/src/resources"

## @brief Stores the ordered `upstream-relative:target-relative` synchronization pairs.
## @details Each entry maps one upstream repository directory to one bundled
##     `src/resources` target directory synchronized in declaration order. The
##     constant is immutable at runtime and costs O(1) per element access.
SYNC_SPECS=(
  "src/instructions:src/resources/instructions"
  "src/prompts:src/resources/prompts"
  "src/templates:src/resources/templates"
)

WORK_DIR=""
STAGING_DIR=""

## @brief Writes one progress message to stdout.
## @details Emits the supplied message fragments joined by single spaces followed
##     by one newline. Runtime is O(n) in message length. Side effect: writes to
##     `stdout`.
## @param[in] ... {string} Progress message fragments.
## @return {void} No return value.
log() {
  printf '%s\n' "$*"
}

## @brief Aborts the updater with one deterministic diagnostic.
## @details Writes the supplied diagnostic prefixed with `ERROR: ` to `stderr`
##     and terminates the process with exit code `1`. Runtime is O(n) in message
##     length. Side effects include `stderr` output and process exit; the `EXIT`
##     trap still removes updater temporary directories.
## @param[in] message {string} Failure diagnostic.
## @return {never} Never returns.
fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

## @brief Removes updater temporary directories.
## @details Deletes the cloned upstream working tree and any pending staging
##     directory registered in `WORK_DIR` plus `STAGING_DIR`. Invoked through the
##     `EXIT` trap on every exit path. Runtime is O(1) plus filesystem removal
##     cost. Side effects include directory removal.
## @return {void} No return value.
cleanup() {
  if [ -n "${STAGING_DIR}" ]; then
    rm -rf "${STAGING_DIR}"
  fi
  if [ -n "${WORK_DIR}" ]; then
    rm -rf "${WORK_DIR}"
  fi
}

## @brief Verifies that one required external tool is available.
## @details Probes the executable search path for the requested tool name and
##     aborts through `fail(...)` when the probe fails. Runtime is O(1) plus one
##     `PATH` lookup. No external state is mutated.
## @param[in] tool {string} Executable name to probe.
## @return {void} No return value.
require_tool() {
  command -v "$1" >/dev/null 2>&1 || fail "Required tool not found: $1"
}

## @brief Clones the upstream PI-Prompts master branch into one target directory.
## @details Attempts a quiet, no-checkout clone of `${PROMPTS_BRANCH}` from
##     `${PROMPTS_REPO_URL_PRIMARY}`, removes the partial destination on failure,
##     and retries once with `${PROMPTS_REPO_URL_FALLBACK}`. Prints the resolved
##     upstream URL on `stdout` so callers can capture provenance. Runtime is
##     dominated by git subprocess execution. Side effects include
##     destination-directory creation and removal.
## @param[in] destination {string} Target directory path for the clone.
## @return {string} Resolved upstream repository URL on stdout.
## @throws Exits through `fail(...)` when both upstream URLs are unreachable.
clone_upstream() {
  local destination="$1"
  rm -rf "${destination}"
  if git clone --quiet --no-checkout --branch "${PROMPTS_BRANCH}" "${PROMPTS_REPO_URL_PRIMARY}" "${destination}" 2>/dev/null; then
    printf '%s\n' "${PROMPTS_REPO_URL_PRIMARY}"
    return 0
  fi
  log "Primary clone failed, retrying with the fallback repository URL ..."
  rm -rf "${destination}"
  if git clone --quiet --no-checkout --branch "${PROMPTS_BRANCH}" "${PROMPTS_REPO_URL_FALLBACK}" "${destination}" 2>/dev/null; then
    printf '%s\n' "${PROMPTS_REPO_URL_FALLBACK}"
    return 0
  fi
  fail "Unable to clone PI-Prompts from ${PROMPTS_REPO_URL_PRIMARY} or ${PROMPTS_REPO_URL_FALLBACK}."
}

## @brief Resolves the upstream synchronization ref for the cloned repository.
## @details Prefers the newest tag reported by the GitHub Releases API when
##     `curl` is available and that tag exists in the local clone; otherwise
##     selects the newest version-sorted tag reachable from `${PROMPTS_BRANCH}`;
##     otherwise falls back to the `${PROMPTS_BRANCH}` head. Prints the resolved
##     ref name on `stdout`. Runtime is dominated by one optional HTTPS request
##     plus git ref enumeration. No external state is mutated.
## @param[in] repository {string} Cloned upstream repository path.
## @return {string} Resolved `refs/tags/<tag>` or `refs/heads/master` ref on stdout.
resolve_release_ref() {
  local repository="$1"
  local release_tag=""

  if command -v curl >/dev/null 2>&1; then
    release_tag="$(curl -fsSL --max-time 20 "${PROMPTS_RELEASE_API_URL}" 2>/dev/null \
      | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
      | head -n 1 || true)"
  fi

  if [ -n "${release_tag}" ] \
    && git -C "${repository}" rev-parse --verify --quiet "refs/tags/${release_tag}" >/dev/null 2>&1; then
    printf 'refs/tags/%s\n' "${release_tag}"
    return 0
  fi

  release_tag="$(git -C "${repository}" tag --sort=-v:refname --merged "${PROMPTS_BRANCH}" 2>/dev/null | head -n 1 || true)"
  if [ -n "${release_tag}" ]; then
    printf 'refs/tags/%s\n' "${release_tag}"
    return 0
  fi

  log "No PI-Prompts release resolvable, falling back to the ${PROMPTS_BRANCH} head."
  printf 'refs/heads/%s\n' "${PROMPTS_BRANCH}"
}

## @brief Fully synchronizes one upstream directory into one target directory.
## @details Stages every upstream file below `source_dir` into a fresh sibling
##     staging directory using timestamp-preserving copies, then replaces
##     `target_dir` with the staged tree through a backup-and-swap sequence so
##     files removed upstream disappear and existing files are overwritten.
##     Runtime is dominated by per-file copy cost. Side effects include staging
##     plus backup directory creation and removal, target-directory replacement,
##     and one progress line on `stdout`.
## @param[in] source_dir {string} Absolute upstream source directory path.
## @param[in] target_dir {string} Absolute bundled target directory path.
## @return {void} No return value.
## @throws Exits through `fail(...)` when `source_dir` is not a directory.
sync_directory() {
  local source_dir="$1"
  local target_dir="$2"

  [ -d "${source_dir}" ] || fail "Upstream directory not found: ${source_dir}"

  STAGING_DIR="${target_dir}.staging.$$"
  rm -rf "${STAGING_DIR}"
  mkdir -p "${STAGING_DIR}"

  local relative_path destination parent_dir copied=0
  while IFS= read -r -d '' relative_path; do
    relative_path="${relative_path#./}"
    [ -n "${relative_path}" ] || continue
    destination="${STAGING_DIR}/${relative_path}"
    parent_dir="$(dirname "${destination}")"
    mkdir -p "${parent_dir}"
    cp -p "${source_dir}/${relative_path}" "${destination}"
    copied=$((copied + 1))
  done < <(cd "${source_dir}" && find . -type f -print0)

  local backup_dir="${target_dir}.backup.$$"
  rm -rf "${backup_dir}"
  if [ -d "${target_dir}" ]; then
    mv "${target_dir}" "${backup_dir}"
  fi
  mv "${STAGING_DIR}" "${target_dir}"
  STAGING_DIR=""
  rm -rf "${backup_dir}"

  log "Synchronized ${copied} file(s) into ${target_dir#"${REPO_ROOT}"/}"
}

## @brief Executes one full bundled-resource update run.
## @details Validates required tools, allocates the temporary upstream working
##     tree, clones the PI-Prompts master branch, resolves and checks out the
##     newest release ref, then synchronizes every ordered pair declared in
##     `SYNC_SPECS`. Runtime is dominated by the upstream clone plus the three
##     directory synchronizations. Side effects include temporary-directory
##     creation and removal, git subprocesses, one optional GitHub Releases API
##     request, and replacement of the three bundled target directories.
## @return {void} No return value.
## @throws Exits through `fail(...)` when any required tool, clone, checkout, or
##     synchronization step fails.
main() {
  require_tool git
  require_tool find
  require_tool mkdir
  require_tool cp

  mkdir -p "${TARGET_ROOT}"

  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pi-prompts-update.XXXXXX")" \
    || fail "Unable to create the temporary working directory."
  local repository="${WORK_DIR}/PI-Prompts"

  local upstream_url
  upstream_url="$(clone_upstream "${repository}")"
  log "Upstream repository: ${upstream_url}"

  local release_ref
  release_ref="$(resolve_release_ref "${repository}")"
  git -C "${repository}" checkout --quiet --detach "${release_ref}" \
    || fail "Unable to check out ${release_ref}."
  log "Synchronizing from ref: ${release_ref}"

  local spec source_rel target_rel
  for spec in "${SYNC_SPECS[@]}"; do
    source_rel="${spec%%:*}"
    target_rel="${spec#*:}"
    sync_directory "${repository}/${source_rel}" "${REPO_ROOT}/${target_rel}"
  done

  log "Bundled prompt resources updated."
}

trap cleanup EXIT
main "$@"
