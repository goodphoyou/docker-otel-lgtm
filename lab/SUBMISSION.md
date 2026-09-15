# Grafana SE Lab — Submission Notes

Running log. Add to this as we go.

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
   - **In hindsight**: Fleet Management also supports onboarding an *existing* standalone Alloy collector directly ([docs](https://grafana.com/docs/grafana-cloud/observe-and-act/send-data/fleet-management/set-up/onboard-collectors/standalone-alloy/)) — add a `remotecfg` block (endpoint URL, instance ID + access token as basic auth, a collector ID) to the existing config and restart, no new infrastructure. This would have registered our existing hand-written `otel-lab` Alloy with Fleet Management directly, instead of running a second parallel DaemonSet collector just to explore it.
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
8. **Set up Grafana MCP with Claude Code** for easier future development against this Grafana Cloud instance: created a `claude-mcp` service account (Viewer role) and connected it via Grafana's MCP server, giving the coding assistant direct read access to dashboards, datasources, provisioning/Git Sync status, and docs search from the terminal — used throughout this session to verify dashboard state, check pod resource limits against the live cluster, and cross-reference Fleet Management collector versions without manual UI round-trips.

## Issues hit + how solved

- Fleet Management's auth-reference dropdown briefly emitted an invalid string reference instead of a proper capsule reference for the `auth` field — reproduced once, not pursued further.
- **Deprecated `env()` emitted by Fleet Management's own visual builder — minor, but worth flagging**: the auth username/password fields were auto-generated as `env("VAR")`, deprecated in favor of `sys.env("VAR")` — notable because it's code generation, not a typo. Testing the pipeline returned an explicit `validation failed (Alloy >=v1.16.0)` error, yet the summary banner still read **"Configuration test passed with warnings"** and let us save anyway. We debugged it by asking Grafana's own AI assistant to explain the failure; it identified the deprecation and rewrote the config to `sys.env()`. The part that matters isn't the deprecated function itself — it's that a real validation error was surfaced as a non-blocking warning.
- **Grafana Cloud Kubernetes Overview dashboard didn't render on first navigation** — panels stayed blank until switching to another dashboard tab and back. Looks like a panel-layout/resize-on-mount issue (dashboard panels compute their size from the viewport at mount time; if the tab isn't visible/focused yet, they can end up 0×0 and never repaint until a resize/visibility event fires). Not specific to our setup.
- **Git Sync failed to parse `alloy-values.yaml`**: Git Sync treats every file under its configured sync path as a Grafana resource to provision, and `alloy-values.yaml` is a Helm values file, not a Grafana resource — it errored with `unable to read file` / `resource validation failed`. Fixed by moving the dashboard into its own `lab/grafana/` subfolder and pointing the sync path there, so it never sees non-Grafana files.
- **Git Sync refused to adopt the existing dashboard**: `resource 'jenwfjf' already exists and is not managed; repo cannot take over without an explicit migration`. The dashboard we exported to `dashboard.json` still existed live in Grafana (same UID) from when we built it manually earlier, and Git Sync won't silently take over a UID that's still occupied by an unmanaged resource — this is a deliberate safety check, not a bug. Per Grafana's docs, the fix is to delete the original unmanaged dashboard and trigger a new sync/pull; it gets recreated from git with the same UID (so any existing links/bookmarks keep working) and is now managed going forward. **Resolved**: deleted the unmanaged dashboard and forced a pull — it was recreated under the `goodphoyou/docker-otel-lgtm` Git-Sync-managed folder, same UID (`jenwfjf`), and the Provisioning page's managed-resource count went from `1/17` to `2/17`.

## Product feedback

- Don't let your own code generator emit deprecated syntax — the visual builder writes `env()`; `sys.env()` replaced it.
- Kubernetes Overview dashboard renders blank panels on first navigation until you switch tabs and back.
- Git Sync should skip non-Grafana files under the configured sync path, or at minimum name the specific file it choked on, instead of a generic parse error.

