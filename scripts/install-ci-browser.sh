#!/usr/bin/env bash
set -euo pipefail

browser="${1:?Choose chromium, firefox or webkit}"
case "$browser" in
  chromium|firefox|webkit) ;;
  *) echo "Unknown browser: $browser" >&2; exit 2 ;;
esac

# The hosted runners' regional EC2 mirror has repeatedly exhausted job timeouts
# while downloading browser dependencies. Keep Ubuntu's suites and signing keys,
# but use its main archive over HTTPS instead of that regional mirror.
sources=/etc/apt/sources.list.d/ubuntu.sources
if [[ "${RUNNER_OS:-}" == Linux && -f "$sources" ]]; then
  sudo sed -i -E \
    's@https?://[[:alnum:].-]+\.ec2\.archive\.ubuntu\.com/ubuntu/?@https://archive.ubuntu.com/ubuntu/@g' \
    "$sources"
fi

npx playwright install --with-deps "$browser"
