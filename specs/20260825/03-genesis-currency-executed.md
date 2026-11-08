---
date: 2026-08-25
status: done
diff_base: b1c140ef0b16ea1a4c554b8938780f407613ec80
tier: critical           # adds a spec-paths key (key-set edit — critical trigger, precedent specs/20260823/01, specs/20260824/05)
area: genesis
design: false
breaking: false
depends_on: [specs/20260825/02-genesis-consultant-discovery.md]
depended_on_by: [specs/20260825/04-genesis-driver.md]
brief: 10
open_markers: 0
spiked: 2026-08-25
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260825-03-1, AC-20260825-03-2, AC-20260825-03-3, AC-20260825-03-4, AC-20260825-03-5, AC-20260825-03-6, AC-20260825-03-7, AC-20260825-03-8, AC-20260825-03-9]
---

# Currency is executed: a registry check replaces the Haiku recency pass

## Goal

A version that does not exist on its registry cannot enter a genesis menu. The Haiku "still
current?" pass in `wf-research.js` — an opinion, not a check, and never told to pin to release
pages — is replaced by a deterministic script, `registry-check.js`, that resolves every
package a menu option names against the registry's own per-version JSON endpoint (npm, PyPI,
crates.io) and endoflife.date's cycle list for runtimes, drops the options that do not
resolve, and stamps the survivors. Offline is never a block: an unreachable registry stamps the
menu `unverified` and the interview continues. Done means: `wf-research.js` has one phase,
every option carries a `packages` list the script can resolve, the script is wired into the
genesis commands' menu step behind a `spec-paths` key, and the fake-major roundup traps (Bun
2.0, Deno 3.0, Storybook 11) are mechanically impossible to ship in a menu.
