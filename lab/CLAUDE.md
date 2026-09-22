# Grafana SE lab — project context

This `lab/` folder is a Grafana Solutions Engineer practical: a demo built
around a small dice-rolling app (`apps/dice-server`, `apps/rolls-store`)
instrumented with OpenTelemetry, shipped through Grafana Alloy to a real
Grafana Cloud stack. See `SUBMISSION.md` for the build log and
`DEMO_SCRIPT.md` for the live demo flow.

## gcx is installed and authenticated

**gcx** ("Grafana Cloud CLI", https://github.com/grafana/gcx) is installed
on this machine (via Homebrew) and already logged in via OAuth to the
Grafana Cloud stack this lab uses (context name: `pluckyhorse2809`, stack
`pluckyhorse2809.grafana.net`). It does not need to be installed or
re-authenticated — just run `gcx <command>` directly.

When asking a *fresh* Claude Code session (one without this file's context
already loaded, e.g. outside `lab/`) to use it, spell it out on first
mention: **"Grafana Cloud CLI, gcx"** — the bare acronym alone isn't
something a model recognizes without context.

Useful commands for this lab:

```bash
# What's currently firing
gcx alert rules list --state firing -o table

# Knowledge graph investigation for a service (dice-server / rolls-store),
# in this lab's env/namespace. Output is JSON/agent-shaped by default —
# always filter with --jq for anything meant to be read on screen or by a
# human, the raw output is a wall of text otherwise.
gcx kg entities inspect Service--dice-server --env colima-otel-lab --namespace otel-lab --from now-1h --to now --jq '.suggestions[] | {name, reason}'
gcx kg entities inspect Service--rolls-store --env colima-otel-lab --namespace otel-lab --from now-1h --to now --jq '.summaries[0].timeLines[] | select(.category=="error") | {alertName, severity: .healthStates[0].severity}'
```

`gcx assistant prompt` (the CLI path to Grafana Assistant) has failed with
a timeout twice in testing — don't rely on it live. The Grafana Assistant
UI panel works fine; that's a separate, more reliable path.

Cloud product commands (`gcx metrics adaptive`, etc.) need a separate
Cloud Access Policy token beyond the OAuth login and will 401 without one —
not set up for this lab, use the Grafana UI for those instead.
