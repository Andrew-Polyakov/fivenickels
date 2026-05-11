#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
out_file="$(mktemp "${TMPDIR:-/tmp}/stock-crawler.XXXXXX.json")"
trap 'rm -f "${out_file}"' EXIT

cd "${repo_root}"
"${script_dir}/stock-crawler" "$@" > "${out_file}"
python3 "${script_dir}/submit-article" --input-file "${out_file}"
