#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

failed=0

scan_pattern() {
  local label="$1"
  local pattern="$2"
  if rg -n -U --hidden \
    -g '!scripts/security-scan.sh' \
    -g '!.git/**' \
    -g '!LICENSE' \
    -- "$pattern" .; then
    printf 'FAIL: %s\n' "$label" >&2
    failed=1
  fi
}

scan_pattern "provider token or API key pattern" \
  '\b(AKIA|ASIA)[A-Z0-9]{16}\b|\bghp_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAIza[0-9A-Za-z_-]{30,}\b'

scan_pattern "JWT-like value" \
  '\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b'

scan_pattern "private-key material" \
  '-----BEGIN [A-Z ]*PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{32,}'

scan_pattern "email address" \
  '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'

scan_pattern "long production identifier" \
  '\b[0-9]{9,20}\b'

if [[ -f .clasp.json || -f .clasprc.json ]]; then
  printf 'FAIL: private clasp binding/authentication file is present.\n' >&2
  failed=1
fi

if find . -type f \( \
  -name '*.csv' -o -name '*.tsv' -o -name '*.xlsx' -o -name '*.xls' \
  -o -name '*.ods' -o -name '*.pem' -o -name '*.key' -o -name '*.p8' \
  -o -name '*.log' \
\) -print -quit | grep -q .; then
  printf 'FAIL: data export, key, or log file is present.\n' >&2
  find . -type f \( \
    -name '*.csv' -o -name '*.tsv' -o -name '*.xlsx' -o -name '*.xls' \
    -o -name '*.ods' -o -name '*.pem' -o -name '*.key' -o -name '*.p8' \
    -o -name '*.log' \
  \) -print >&2
  failed=1
fi

if [[ -d archive || -d exports || -d backups || -d data ]]; then
  printf 'FAIL: private/legacy artifact directory is present.\n' >&2
  failed=1
fi

if (( failed )); then
  printf 'Security scan FAILED. Do not push or release.\n' >&2
  exit 1
fi

printf 'Security scan PASSED: no known secrets or production-data artifacts found.\n'
