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
if [[ "${RUNNER_OS:-}" == Linux ]]; then
  # A timed-out npx parent can leave its sudo apt child finishing a download.
  # Let the bounded second provisioning attempt acquire that real lock after
  # the first installer exits, instead of failing immediately on contention.
  # This stays inside infrastructure.cjs's existing per-attempt deadline.
  printf 'DPkg::Lock::Timeout "120";\n' | sudo tee /etc/apt/apt.conf.d/99soundtools-ci-lock-wait >/dev/null
  for sources in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources; do
    if [[ -f "$sources" ]]; then
      # Current runner images use mirror+file rather than a direct archive URL.
      sudo sed -i -E \
        -e 's@mirror\+file:/etc/apt/apt-mirrors\.txt@https://archive.ubuntu.com/ubuntu/@g' \
        -e 's@https?://([[:alnum:].-]+\.)?archive\.ubuntu\.com/ubuntu/?@https://archive.ubuntu.com/ubuntu/@g' \
        "$sources"
    fi
  done
fi

node scripts/ci/infrastructure.cjs npx playwright install --with-deps "$browser"
