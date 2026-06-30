#!/usr/bin/env bash
# Manual QA on 3 simulators after automated checks pass.
# Devices (example): iPad = p1, iPhone 13 = org, iPhone 17 = p3
set -euo pipefail

echo "=== Automated checks ==="
npm run qa:round-two-vote

echo ""
echo "=== Manual simulator checklist (3 devices) ==="
cat <<'EOF'

1. Finish round 1 with org (Василь), p1 (iPad), p3 (Василь 7).
2. org + p1: results → «Грати ще» → rematch lobby → p1 picks word → start round 2.
3. p3: stay on round-1 play/results (do NOT press «Грати ще»).
4. On org device in round 2: menu → propose end round.
   ✓ Modal lists only org + p1 (not p3).
   ✓ After p1 agrees, round ends without waiting for p3.
5. p3 screen unchanged (still round 1); no forced navigation to lobby/play R2.

EOF

BOOTED=$(xcrun simctl list devices booted 2>/dev/null | grep -c Booted || true)
echo "Booted simulators: ${BOOTED}"
if [[ "${BOOTED}" -lt 1 ]]; then
  echo "Tip: start simulators with npm run ios (multiple devices) before manual QA."
fi
