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

- Open the dashboard.
- Point out that metrics, traces, logs, and alerts are all visible together
  in one place.
- Immediately note that an alert is already firing.
- Dive into the alert:
  - Show the alert's own tab (rule detail view).
  - Show the Slack notification.

**Talking points:** _(to add)_

