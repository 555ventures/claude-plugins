---
date: 2026-08-15
status: done
diff_base: 866ce9cc303429e1dab6c75e9f2449a3ea7cf0b2
open_markers: 0
risk: T3                 # edits spec/templates/grounding-contract.md (hash-stamped into every host) and spec/bin/spec-paths — both named T3 triggers in pipeline rules § Risk Tiers
area: gate-integrity
design: false
breaking: false
depends_on: ["specs/20260815/01-recurrence-carriers.md"]   # D2 requires readConfigStrict from lib/host-config.js, which spec 01 lands; spec 01's closure pin also forbids this spec's script from reading spec.config.json privately
depended_on_by: ["specs/20260815/06-redcheck-load-attribution.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260815-05-1, AC-20260815-05-2, AC-20260815-05-3, AC-20260815-05-4, AC-20260815-05-5, AC-20260815-05-6, AC-20260815-05-7, AC-20260815-05-8, AC-20260815-05-9]
---

# Env preflight: an unprovisioned environment is a provisioning STOP, never a repair round

## Goal

When a host's test suites are gated on environment variables (`DATABASE_URL`-shaped), an
unset variable currently reaches the gate as an ordinary red and is indistinguishable from
broken code — wf-build burns a full repair round it cannot possibly win (observed twice on
salon-os, runId `wf_e4778d03-81b`; INTAKE JJ-20260815-08). Done means: the gating variables a
host declares are checked deterministically **before** any gate, probe, or repair path is
reachable, a miss fails fast printing the host's own provisioning command, and the existing
prose obligation ("name each gating variable in § Test Rules") is enforced by a script
cross-check instead of model judgment. Hosts that declare nothing behave exactly as today.
