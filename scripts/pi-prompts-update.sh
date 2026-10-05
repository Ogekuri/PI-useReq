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
#     access and modification timestamps are preserved through `cp -p`. Before
#     any modification, the updater prints the resolved latest PI-Prompts
#     release version and the stored version read from
#     `src/resources/pi-prompts-version.txt` (missing or empty files report
#     `unknown`), then requires an explicit `Y` confirmation; any other input
#     aborts without modifications. On success, the resolved version is written
#     into `src/resources/pi-prompts-version.txt`. Runtime is dominated by one
#     git clone plus one ref checkout and per-file copies. Side effects include
#     temporary-directory creation, git subprocesses, one optional GitHub
#     Releases API request, replacement of the three target resource
#     directories, and overwrite of the one version marker file. No other
#     repository content is modified.
# @satisfies DES-022, REQ-379, REQ-380, REQ-381, REQ-382, REQ-383, REQ-384, REQ-396, REQ-397, REQ-398, REQ-399

set -euo pipefail

PROMPTS_REPO_URL_PRIMARY="https://github.com/Ogekuri/PI-Prompts.git"
PROMPTS_REPO_URL_FALLBACK="https://github.com/Ogekuri/PI-Prompts"
PROMPTS_RELEASE_API_URL="https://api.github.com/repos/Ogekuri/PI-Prompts/releases/latest"
PROMPTS_BRANCH="master"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_ROOT="${REPO_ROOT}/src/resources"

## @brief Stores the PI-Prompts version marker path relative to the repository root.
## @details Read before the update and overwritten with the resolved version after
##     successful synchronization. The constant is immutable at runtime.
## @satisfies REQ-396, REQ-399
PROMPTS_VERSION_REL="src/resources/pi-prompts-version.txt"

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

## @brief Reads one stored PI-Prompts version marker file.
## @details Returns the first line of the marker file with all surrounding
##     whitespace removed when the file exists and is non-empty; otherwise
##     returns the literal `unknown` so missing or empty version markers are
##     handled deterministically. Runtime is O(n) in file size. Side effects are
##     limited to filesystem reads.
## @param[in] marker_path {string} Absolute version marker file path.
## @return {string} Trimmed stored version or `unknown` on `stdout`.
## @satisfies REQ-396
read_version_file() {
  local marker_path="$1"
  local version=""
  if [ -f "${marker_path}" ] && [ -s "${marker_path}" ]; then
    version="$(head -n 1 "${marker_path}" | tr -d '[:space:]' || true)"
  fi
  if [ -z "${version}" ]; then
    version="unknown"
  fi
  printf '%s\n' "${version}"
}

## @brief Derives the release version from one resolved upstream synchronization ref.
## @details Strips the `refs/tags/` prefix from a release-tag ref and the
##     `refs/heads/` prefix from a branch-head ref so the printed version and
##     the stored version marker share one deterministic release identity.
##     Runtime is O(n) in ref length. No external state is mutated.
## @param[in] release_ref {string} Resolved `refs/tags/<tag>` or `refs/heads/<branch>` ref.
## @return {string} Release version on `stdout`.
resolve_release_version() {
  local release_ref="$1"
  case "${release_ref}" in
    refs/tags/*)
      printf '%s\n' "${release_ref#refs/tags/}"
      ;;
    refs/heads/*)
      printf '%s\n' "${release_ref#refs/heads/}"
      ;;
    *)
      printf '%s\n' "${release_ref}"
      ;;
  esac
}

## @brief Requests explicit user confirmation before any modification.
## @details Prints the resolved latest PI-Prompts release version plus the stored
##     version and one English confirmation sentence, reads one line from
##     `stdin`, and returns success only when the confirmation input is exactly
##     `Y`; any other input, including end-of-stream input, returns failure so
##     callers abort without modifications. Runtime is O(1) plus one user
##     interaction. Side effects include `stdout` and `stderr` writes.
## @param[in] latest_version {string} Resolved upstream release version.
## @param[in] stored_version {string} Stored version of `${PROMPTS_VERSION_REL}`.
## @return {integer} `0` when the user confirmed with exactly `Y`; `1` otherwise.
## @satisfies REQ-397, REQ-398
confirm_update() {
  local latest_version="$1"
  local stored_version="$2"
  local answer=""

  log "Latest PI-Prompts release : ${latest_version}"
  log "Stored version (${PROMPTS_VERSION_REL}): ${stored_version}"
  log "This update replaces the bundled prompt resources in src/resources/instructions, src/resources/prompts, and src/resources/templates with the content of the latest PI-Prompts release."
  printf 'Proceed with the update? [Y/n] '
  read -r answer || answer=""
  [ "${answer}" = "Y" ]
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
## @details Validates required tools, reads the stored PI-Prompts version marker,
##     allocates the temporary upstream working tree, clones the PI-Prompts
##     master branch, resolves the newest release ref plus its release version,
##     prints the resolved plus stored versions and requires an explicit `Y`
##     confirmation, checks out the resolved release ref, synchronizes every
##     ordered pair declared in `SYNC_SPECS`, and writes the resolved version
##     into the version marker file. Runtime is dominated by the upstream clone
##     plus the three directory synchronizations. Side effects include
##     temporary-directory creation and removal, git subprocesses, one optional
##     GitHub Releases API request, replacement of the three bundled target
##     directories, and overwrite of the version marker file.
## @return {void} No return value.
## @throws Exits through `fail(...)` when any required tool, clone, checkout, or
##     synchronization step fails.
## @satisfies REQ-396, REQ-397, REQ-398, REQ-399
main() {
  require_tool git
  require_tool find
  require_tool mkdir
  require_tool cp

  local prompts_version
  prompts_version="$(read_version_file "${REPO_ROOT}/${PROMPTS_VERSION_REL}")"

  mkdir -p "${TARGET_ROOT}"

  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pi-prompts-update.XXXXXX")" \
    || fail "Unable to create the temporary working directory."
  local repository="${WORK_DIR}/PI-Prompts"

  local upstream_url
  upstream_url="$(clone_upstream "${repository}")"
  log "Upstream repository: ${upstream_url}"

  local release_ref
  release_ref="$(resolve_release_ref "${repository}")"

  local release_version
  release_version="$(resolve_release_version "${release_ref}")"

  if ! confirm_update "${release_version}" "${prompts_version}"; then
    log "Update aborted; no repository content was modified."
    return 0
  fi

  git -C "${repository}" checkout --quiet --detach "${release_ref}" \
    || fail "Unable to check out ${release_ref}."
  log "Synchronizing from ref: ${release_ref}"

  local spec source_rel target_rel
  for spec in "${SYNC_SPECS[@]}"; do
    source_rel="${spec%%:*}"
    target_rel="${spec#*:}"
    sync_directory "${repository}/${source_rel}" "${REPO_ROOT}/${target_rel}"
  done

  printf '%s\n' "${release_version}" > "${REPO_ROOT}/${PROMPTS_VERSION_REL}"

  log "Bundled prompt resources updated to ${release_version}."
}

trap cleanup EXIT
main "$@"
