# Discovery brief — { project }

## What I think you're building
{ one page, in the user's words where given: the job · who it is for · the core screen ·
  success in six months (an outcome, not a feature) · what it must never do }

## Coverage
- payer: dark
- tenancy: dark
- data-sensitivity: dark
- residency: dark
- ai-use: dark
- unattended: dark
- integrations: dark
- scale-outage: dark
- vendor-budget: dark
- offline-mobile: dark

## Non-goals
{ adjacent features ruled out, one line each as they surface — In / Later / Won't-this-time }

## Open Dimensions
{ hard-to-reverse dimension keys — the archetype registry floor (genesis.md § Genesis:
  Archetype Registry) plus any key a coverage answer derives (genesis.md § Genesis:
  Hard-to-Reverse Dimensions — Derived dimensions) — each marked `constrained` (already
  decided) or `open`. One line per key, machine-read by genesis-driver.js:
  `- <key>: open|constrained [— note]` }

## Research Angles
{ research-angle keys the archetype + audience scope open, one focus paragraph each }

## Picks
{ each research-backed pick, its `sources`, its `because`/`priced`, and `fetchedAt`, once
  decided. The pick line itself is machine-read by genesis-driver.js and must be
  `- <key>: <label>`, the key matching its `## Open Dimensions` entry; provenance follows
  on indented continuation lines. `--mark menus-done` additionally requires one
  `- archetype: <key>` line, `<key>` one of the eight registry keys: `web-app` `mobile-app`
  `conversational-bot` `backend-api` `realtime-trading` `cli-devtool` `data-ml`
  `desktop-app` (genesis.md § Genesis: Archetype Registry) }
