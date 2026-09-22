#!/usr/bin/env bash
# Turn on the rolls-store fault: dice-server starts returning 500s and
# slowing down, without anything being wrong with dice-server itself.
# Runs the curl from inside the dice-roller pod, so no port-forward is
# needed — this is the command to run live during the demo.
set -euo pipefail

NAMESPACE="otel-lab"
POD=$(kubectl get pod -n "$NAMESPACE" -l app=dice-roller -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n "$NAMESPACE" "$POD" -- curl -s -X POST http://rolls-store:8085/fault
echo
echo "Fault ON — rolls-store is now slow (~2s) and fails ~30% of requests."
