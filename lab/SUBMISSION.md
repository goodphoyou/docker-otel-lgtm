# Grafana SE Lab — Submission Notes

Running log. Add to this as we go instead of reconstructing it at the end.

## Goal

- Create a Grafana Cloud account
- Set up Grafana Alloy (or Prometheus) locally/in the cloud, connect to Grafana Cloud
- Deploy a sample app (docker-otel-lgtm's dice-server) shipping data to Grafana Cloud
- Optional: custom OTEL config + dashboard
- Deliverables: steps taken, issues hit + how solved, screenshots, product feedback

## Environment

- Local machine, Colima (`docker+k3s` runtime) standing in for a cloud Kubernetes cluster (GKE etc.)
- Colima profile `default`, currently 4 CPU / **12GiB** memory / 60GB disk

## Files in this folder

- `alloy-values.yaml` — the actual Helm values running for the `otel-lab` Alloy release, pulled live via `helm get values alloy -n otel-lab -o yaml` (not a draft — this is what's deployed). No secrets in it; it only references the `grafana-cloud-creds` Secret by name via `envFrom`.
- `grafana-cloud.env.example` — template for the credentials file. Copy to `grafana-cloud.env` and fill in real values from Grafana Cloud. `lab/*.env` is gitignored so the real file with the actual API token never gets committed.
- `grafana/dashboard.json` — the custom "dice-server (OTel Lab)" dashboard, exported live from Grafana Cloud (Dashboard settings > JSON Model), not a draft. Kept in its own subfolder, separate from non-Grafana-resource files like `alloy-values.yaml`, because Grafana Cloud Git Sync (see below) treats every file under its configured sync path as a Grafana resource to provision and fails to parse anything that isn't one.

## Steps taken

1. **Cloned the sample app repo** — `github.com/grafana/docker-otel-lgtm`.
2. **Grafana Cloud OTLP credentials** — from the Cloud portal: Connections → Add new connection → OpenTelemetry (OTLP), grabbed the OTLP endpoint URL, Instance ID, and generated an API token. Saved into an env file (not committed — secrets).
3. **Set up Grafana Alloy on the local k3s cluster (namespace `otel-lab`)**:
   - Added the Helm repo: `helm repo add grafana https://grafana.github.io/helm-charts && helm repo update`
   - Created namespace: `kubectl create namespace otel-lab`
   - Created a Secret from the credentials env file (rather than inlining them in a manifest): `kubectl create secret generic grafana-cloud-creds -n otel-lab --from-env-file=grafana-cloud.env`
   - Hand-wrote `alloy-values.yaml` (Alloy config language, formerly "River") wiring:
     `otelcol.receiver.otlp` (listens on 4317 grpc / 4318 http) → `otelcol.processor.batch` → `otelcol.auth.basic` + `otelcol.exporter.otlphttp` → Grafana Cloud
   - Installed: `helm upgrade --install alloy grafana/alloy -n otel-lab -f alloy-values.yaml`
4. **Deployed the dice-server app** — built `dice-server:lab` locally (Colima's k3s shares the same Docker daemon, so no registry push needed), applied a Deployment + Service pointing its OTLP env vars at `alloy.otel-lab.svc.cluster.local:4317/4318`. Verified traces/metrics/logs flowing via Alloy's own `/metrics` endpoint (`otelcol_receiver_accepted_*`, `otelcol_exporter_queue_*` counters).
5. **Explored Grafana Cloud Fleet Management** as a second path for building the same pipeline, instead of hand-writing config:
   - Its "Kubernetes" onboarding flow installs a *second*, separate Alloy — a DaemonSet, via the `k8s-monitoring` Helm chart, in its own namespace (`k8s-monitoring`) — not a merge with the hand-written one in `otel-lab`. The two run in parallel.
   - Built the same pipeline (auth → exporter → processor → receiver, in that dependency order since the UI's reference dropdowns only let you pick components that already exist) using the visual component editor instead of hand-typing config.
6. **Built a custom dashboard** (`dashboard.json`), "dice-server (OTel Lab)", covering all three signal types from `dice-server`'s own instrumentation:
   - Request rate by route, p95 latency, and requests by status code — all from the auto-instrumented `http_server_request_duration_seconds_*` histogram (Prometheus/Mimir).
   - Dice rolls/sec — from the app's custom `dice_lib_rolls_counter_total` counter.
   - Node.js event loop utilization — from the bundled Node runtime instrumentation; metric name required checking the label browser since the OTLP-to-Prometheus unit normalization appends `_ratio` to unitless gauges (`nodejs_eventloop_utilization_ratio`, not the semconv name `nodejs.eventloop.utilization`).
   - Live log stream (Loki) for `dice-server`.
   - Recent `rollDice` traces (Tempo, TraceQL search `{resource.service.name="dice-server" && name="rollDice"}`), rendered as a Table so each row expands into the full span tree; had to raise the query's default spans-per-trace limit from 3 to 50 so the whole `rollDice → rollTheDice → rollOnce:N` tree renders.
7. **Set up Grafana Cloud Git Sync** to put the dashboard under real GitOps instead of a static exported snapshot:
   - Forked `grafana/docker-otel-lgtm` to a personal GitHub account (can't push to the upstream repo directly) and pushed a `jesse/otel-lab-submission` branch containing this `lab/` folder.
   - Connected it via Administration → Provisioning, GitHub auth with a fine-grained PAT scoped to just this repo (Contents, Metadata, Pull requests, Administration, Webhooks — the exact permission set Grafana's setup screen lists), pointed at that branch.
   - Enabled "push to synchronized branch" (not just PR-per-save) since this is a solo repo — dashboard edits made in the Grafana UI now commit straight to `jesse/otel-lab-submission`.
   - **Status: in progress**, see issues below — resolving a resource-adoption conflict before the sync is fully clean.

## Issues hit + how solved

- **Fleet Management UI bug**: the `auth` field on `otelcol.exporter.otlphttp` serialized the picked `otelcol.auth.basic` reference as a *quoted string* instead of an unquoted capsule reference. `Test configuration pipeline` didn't hard-fail on this — it only surfaced as a **warning**, `expected capsule, got string (Alloy >= v1.16.0)`, and still let us save. But a capsule/string type mismatch on `auth` would very likely error for real once an actual Alloy collector (v1.16.0+) tried to load the pipeline — "passes the builder's check" and "runs on the collector" aren't the same guarantee here. Worth reporting either way: reproducible, exact error text.
- **Deprecated `env()` stdlib function**: Fleet Management's own **auto-generator** (the visual component builder) emitted `env("VAR")` for the auth username/password/endpoint fields — notable specifically because it's automated code-gen that should already know `env()` is deprecated in favor of `sys.env("VAR")`, not something a human typo'd. When we later asked Grafana Cloud's AI assistant to fix the capsule/string bug above, it proactively caught and fixed this too, swapping in `sys.env()` unprompted. Our own hand-written `alloy-values.yaml` also still uses `env()` and hasn't been patched yet.
- **Grafana Cloud Kubernetes Overview dashboard didn't render on first navigation** — panels stayed blank until switching to another dashboard tab and back. Looks like a panel-layout/resize-on-mount issue (dashboard panels compute their size from the viewport at mount time; if the tab isn't visible/focused yet, they can end up 0×0 and never repaint until a resize/visibility event fires). Not specific to our setup.
- **Git Sync failed to parse `alloy-values.yaml`**: Git Sync treats every file under its configured sync path as a Grafana resource to provision, and `alloy-values.yaml` is a Helm values file, not a Grafana resource — it errored with `unable to read file` / `resource validation failed`. Fixed by moving the dashboard into its own `lab/grafana/` subfolder and pointing the sync path there, so it never sees non-Grafana files.
- **Git Sync refused to adopt the existing dashboard**: `resource 'jenwfjf' already exists and is not managed; repo cannot take over without an explicit migration`. The dashboard we exported to `dashboard.json` still existed live in Grafana (same UID) from when we built it manually earlier, and Git Sync won't silently take over a UID that's still occupied by an unmanaged resource — this is a deliberate safety check, not a bug. Per Grafana's docs, the fix is to delete the original unmanaged dashboard and trigger a new sync/pull; it gets recreated from git with the same UID (so any existing links/bookmarks keep working) and is now managed going forward. **Not yet executed** — picking this up next session.

## Alloy Helm chart values.yaml review

Read the chart's actual default `values.yaml` (`github.com/grafana/alloy/operations/helm/charts/alloy/values.yaml`) for the first time today — the original hand-written config was never checked against it. Findings:

- `extraPorts` schema (name/port/targetPort/protocol) matches the chart's documented example exactly — no drift.
- Chart's default RBAC `clusterRules` already grants `get/list/watch` on `nodes`, which is exactly what our `discovery.kubernetes "nodes"` component needs — no RBAC gap.
- `controller.type: deployment` (ours) vs. the chart default `daemonset` is the correct choice here — this Alloy receives OTLP pushed *to* it from `dice-server`, it doesn't need to run per-node like the Fleet Management DaemonSet does.
- **Gap found**: `alloy.resources` and `alloy.securityContext` were both unset (chart default `{}` — no requests/limits/hardening), unlike `configReloader`, which the chart hardens by default. Added explicit `resources` (50m/128Mi request, 256Mi memory limit, based on observed usage of ~4m CPU / 65Mi memory) to `lab/alloy-values.yaml` — **not yet applied to the live release**, still needs `helm upgrade`.

## Product feedback (draft — expand before submitting)

- Fleet Management's auth-reference dropdown generates invalid (string, not capsule) syntax for reference fields — real correctness bug, not just confusing UX.
- Fleet Management's remote-config onboarding flow defaults to presenting a standalone VM/Debian install path; the Kubernetes-specific path (DaemonSet + operator via the `k8s-monitoring` Helm chart) isn't obviously surfaced first for someone already running a Helm-deployed Alloy.
- Kubernetes Overview dashboard: blank-panel-on-first-load bug (see above).

## Screenshots

- [ ] Grafana Cloud OTLP connection page
- [ ] Alloy pod running / metrics endpoint showing exporter counters
- [ ] dice-server traces/logs/metrics visible in Grafana Cloud
- [ ] Fleet Management Inventory tab showing the collector checked in
- [ ] Fleet Management auth-field bug (`expected capsule, got string`)
- [ ] Kubernetes Overview dashboard blank-panel bug
- [ ] Custom "dice-server (OTel Lab)" dashboard, all panels populated
- [ ] Git Sync repository connection showing synced/managed status
