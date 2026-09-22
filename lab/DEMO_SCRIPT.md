# Demo run flow — Grafana for Ensemble

Running script for the live demo. Steps are captured as we dictate them;
talking points get filled in per step afterward.

## Logistics

- **Time budget:** ~20 minutes of demo inside a 30-minute block (the other
  ~10 minutes is the "Our Understanding" slide + next steps, handled
  separately from this script).
- **Audience (role-played):**
  - Senior web dev — played by a Grafana SE
  - SRE — played by the SE's first-line leader
  - Cloud Infra — played by the SE's second-line leader
  - VP Eng (not technical) — played by the regional sales director
- **Pre-staging:** turn the fault on with `fault-on.sh` at least ~10 minutes
  before starting, so the alert has already fired, Slack has already
  delivered, and the knowledge graph's findings have had time to generate
  (that one takes 5+ minutes). Nothing should need to be triggered live at
  the start.
- **Fault scripts:** `lab/k8s/fault-on.sh`, `lab/k8s/fault-off.sh`,
  `lab/k8s/demo-fault.sh <seconds>` (self-timing on/off).

## Steps

### Step 1 — Dashboard overview, alert already going off

**Tell (open):**

> Every one of our customers struggles with the same thing when something
> breaks: how fast can your team actually get to the data they need? ASOS
> ran into exactly this after migrating to Azure — before Grafana, it
> could take 10 to 15 minutes just to access the metrics they needed to
> troubleshoot an issue. After moving to Grafana Cloud, powered by Mimir,
> they set a one-minute target for that same end-to-end latency. That's
> the gap between minutes of hunting and seconds of looking.

*(Optional: briefly pull up the case study — https://grafana.com/success/asos/
— as a citation before switching to our own dashboard.)*

**Open questions to ask the room:**
- How long does it typically take your team to even realize something's
  wrong today, before anyone starts looking?
- When an alert like this fires today, how many different tools does your
  team have to open just to start investigating?

**Show:**

- Open the dashboard.
- Point out that metrics, traces, logs, and alerts are all visible together
  in one place.
- Immediately note that an alert is already firing.
- Dive into the alert:
  - Show the alert's own tab (rule detail view) — this is a good moment to
    note: *this is PromQL running against Mimir, Grafana's Prometheus-native
    metrics store.*
  - Show the Slack notification.

**Tell (close):**

> That's what you're looking at right now — one dashboard, every signal,
> no tool-switching. This is the same shift ASOS made, and it's what turns
> a 10-15 minute scramble into something you can see in the time it takes
> to open a browser tab. We'll dive into how we solve the retention issue
> that caused your outage later — for now, let's go from alert to quickly
> finding where the outage is coming from.

**Segue — ask Grafana Assistant (confirmed working live):**

- In the Grafana Assistant panel (UI, not the `gcx` CLI — that timed out
  twice in testing and isn't reliable enough to use live), ask something
  close to: *"This alert is firing on dice-server, how do I find where the
  outage is coming from on this dashboard?"*
- Confirmed: it correctly points to the exemplar panel. Let its answer be
  the actual transition into Step 2, instead of manually clicking over
  yourself, the assistant tells you where to go.
- This is the AI beat for the demo — Assistant's reasoning draws on the
  knowledge graph under the hood, so this one moment covers both without
  needing a separate terminal/knowledge-graph step.

**Talking point (say this while the Assistant answer is on screen):**

> Our AI Assistant isn't a chatbot bolted onto your dashboards, it's
> powered by a knowledge graph already built from the telemetry you've
> connected to Grafana. That's a very different, more accurate experience
> than pasting your data into a general-purpose model like Claude and
> hoping it can piece together relationships it's never seen before. And
> if your team prefers working from their own AI coding tools instead of
> our UI, we also ship a CLI, `gcx`, so your agents can query that same
> knowledge graph directly.

**Note:** keep this to the one line above, brief mention only. A live,
unscripted `gcx`-powered investigation was tested and works, but its exact
output isn't fully controllable run to run — not worth the risk of
running live in front of the room. Don't demo it, just say it exists.

### Step 2 — Metric to trace (exemplars), confirmed working

**Tell (open):**

> Your team spent 8 hours manually hunting through traces in New Relic,
> with no link from metrics to traces. Let's see how fast that actually is
> when the two are connected.

**Open questions to ask the room:**
- Walk me through what those 8 hours in New Relic actually looked like —
  what was the team doing, minute by minute?
- How many engineers typically get pulled into an incident like this
  today, and does that number change if it takes 8 hours instead of a few
  minutes?

**Show:**

- On the "p95 latency (with exemplars)" panel, click the exemplar marker
  from the fault window (small diamond under the line, distinct from the
  regular data points).
- It jumps directly into the trace: `otel-lab/dice-server GET /rolldice`,
  with Tempo's own auto-highlighted root-cause banner right at the top —
  `otel-lab/rolls-store saveRoll — 2s, ~99.8% of trace`.
- Expand the full span tree. Point out the error markers on `rollDice`,
  the outbound `POST`, and `saveRoll` specifically — everything upstream
  of the call to `rolls-store` is clean.
- Click into the `saveRoll` span itself and show its status message:
  `connection pool exhausted under load — failed to persist roll`. The
  trace alone answers both where (which span, which service) and why
  (the status message), no separate log lookup required.

**Tell (close):**

> This is the piece that took your team 8 hours in New Relic. One click,
> straight from the metric that told us something was wrong to the exact
> trace and the exact span responsible. No manual correlation across
> tools, no separate login, no guessing which trace lines up with which
> time window.

Then click **"Logs for this trace"** in the trace view (it won't resolve —
the default Tempo/Loki datasources are read-only, so this isn't wired up)
and say plainly: *"For this demo I haven't enabled it, but we can
absolutely revisit this and talk about logs at the end if we have time."*

### Step 3 — Why InfluxDB couldn't retain metrics, then Mimir + Adaptive Metrics

**Tell (open):**

> Let's talk about why InfluxDB couldn't retain enough of your metrics in
> the first place. InfluxDB indexes every unique combination of tags as
> its own series, and Kubernetes constantly mints new ones — new pod
> names, new instance IDs — every time something restarts, redeploys, or
> scales. That index only grows. Memory pressure and compaction cost both
> scale with that cardinality, not just with how much data you're storing.
>
> The inability to retain metrics means bad forecasting, and bad
> forecasting means outages happen on your big days, the ones you can
> least afford, like your busiest sales day of the year.

**Open questions to ask the room:**
- Was cost also a factor in that retention decision for you?
- When you've had to make capacity or forecasting decisions without
  enough historical data, how did that usually go — best guess, or did
  you tend to over-provision just to be safe?

*(Pause for the room to respond after each.)*

**Show — Mimir, then Adaptive Metrics:**

- **Mimir first.** Open the time range picker (on the dashboard or in
  Explore) and show that long ranges — 6 months, 1 year, custom — are
  real, selectable options. **Caveat, say this out loud:** our lab
  environment is only about 9 days old, so we can't show actual
  13-month-old data, this demonstrates the system's capability, not a
  real historical graph. Reiterate PromQL-native (callback to Step 1) and
  state the retention figure directly: **13 months on the Pro plan**
  (confirmed on Grafana's own pricing page, Free is 14 days, Enterprise
  is custom).
- **Then Adaptive Metrics.** Navigate to Adaptive Telemetry → Adaptive
  Metrics → Overview. Point out the live numbers on our own stack (not a
  canned example): real recommendations, a real series-count reduction.
  Click into the specific safe recommendation
  (`http_server_request_duration_seconds_sum`, confirmed 0 dashboards, 0
  alerts, 0 queries touch it) to show the drill-down: exact usage stats,
  exact labels being dropped, exact series reduction (7 → 1). Click
  **Apply recommendation** on that one, live.

**Tell (close):**

> You can now have retained metrics without chopping an arm off, and
> properly forecast for your next Black Friday.

