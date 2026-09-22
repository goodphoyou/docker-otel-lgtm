#!/usr/bin/env bash
# Turn the rolls-store fault back off — see fault-on.sh.
set -euo pipefail

NAMESPACE="otel-lab"
POD=$(kubectl get pod -n "$NAMESPACE" -l app=dice-roller -o jsonpath='{.items[0].metadata.name}')

kubectl exec -n "$NAMESPACE" "$POD" -- curl -s -X DELETE http://rolls-store:8085/fault
echo
echo "Fault OFF — rolls-store back to normal."
