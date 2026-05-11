#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
env_file="${repo_root}/.env"

if [ -f "${env_file}" ]; then
  while IFS= read -r line || [ -n "${line}" ]; do
  line="${line%%#*}"
  line="$(printf '%s' "${line}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -z "${line}" ] && continue
  case "${line}" in
    ARTICLE_SUBMIT_*|WIGTAIL_ARTICLE_SUBMIT_URL=*)
      key="${line%%=*}"
      value="${line#*=}"
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      export "${key}=${value}"
      ;;
  esac
  done < "${env_file}"
fi

cd "${repo_root}"
exec python3 "${script_dir}/rewriteNews.py" "$@"
