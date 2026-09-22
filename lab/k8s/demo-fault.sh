#!/usr/bin/env bash
# One-shot demo trigger: turns the rolls-store fault on, holds it long
# enough to (a) generate several real failed traces for dice-roller's
# steady ~1 req/2s traffic and (b) comfortably clear the alert rule's 1m
# pending period, then turns it off automatically.
#
# Because the alert query uses a 2-minute rate() window, the error ratio
# stays elevated for a couple of minutes after the fault goes off — the
# alert resolving on its own near the end of the walkthrough is expected,
# not something you need to trigger separately.
#
# This blocks for DURATION_SECONDS (default 90) while it waits to turn the
# fault back off, so kick it off and switch focus to Grafana — you don't
# need this terminal again until it prints "done".
#
# For manual, untimed control instead, use fault-on.sh / fault-off.sh directly.
set -euo pipefail

NAMESPACE="otel-lab"
DURATION_SECONDS="${1:-90}"

POD=$(kubectl get pod -n "$NAMESPACE" -l app=dice-roller -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n "$NAMESPACE" "$POD" -- curl -s -X POST http://rolls-store:8085/fault
echo
echo "Fault ON — switch to Grafana now. Auto-disabling in ${DURATION_SECONDS}s."

sleep "$DURATION_SECONDS"

kubectl exec -n "$NAMESPACE" "$POD" -- curl -s -X DELETE http://rolls-store:8085/fault
echo
echo "Fault OFF (auto, after ${DURATION_SECONDS}s) — done. Alert should clear over the next ~2 minutes."
