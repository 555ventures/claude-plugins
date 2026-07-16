---
# Feedback brief — the host→plugin half of the feedback loop.
# Written by /spec:release (Phase 4 flush) or /spec:doctor (check 12 roll-up) into
# docs/spec-feedback/<YYYYMMDD>-brief.md. Append-only: once a findings row carries an
# `intake:` stamp it is never edited; new feedback goes in a NEW dated brief.
plugin: spec@{VERSION}          # the exact installed plugin version — REQUIRED; intake's
                                # version arithmetic (already-fixed vs regression) depends on it
host: { repo name }
date: { YYYY-MM-DD }
window: { since last release row / since <date> }
findings:
  - id: { HOST-YYYYMMDD-NN }    # stable — intake keys its ledger on this
    category: { template-bug | doctrine-rot | reporting-integrity | missing-substrate | workflow-defect | model-placement | other }
    stage: { genesis | init | plan | design | build | review | release | doctor | escape }
    severity: { hard | soft }
    evidence: { file:line in THIS repo, or a reproducing command — REQUIRED, no evidence no finding }
    # intake:                   # stamped by the plugin repo's /intake — never by the host
    #   disposition: accepted | rejected | already-fixed | duplicate
    #   detail: { fixture test path | rejection reason | fixed-in version | duplicate-of id }
    #   triaged: YYYY-MM-DD
---

# Feedback brief: { host } → spec plugin

<!-- Evidence, not a work order. Every claim carries file:line or a reproducing command
     runnable in THIS repo; judgment calls are labeled as such. The plugin-side intake
     re-executes the evidence before accepting — a finding that doesn't reproduce is
     rejected with the failed repro recorded, so write evidence intake can run. -->

## Findings

<!-- One section per findings row, same id. Per finding: what happened (observed, dated),
     the evidence (verbatim command + output, or file:line), which pipeline property made it
     possible (the failure CLASS, not just the instance — what survives triage is the
     property), and any workaround this host now carries (a per-spec override Decision, a
     [plugin] Gotchas line) that a fix should let it retire. -->

## Source material

<!-- Mechanical inputs the flush swept — verbatim, so intake can verify without archaeology:
     [plugin]-tagged Gotchas entries (with citations), escape ledger rows since the window
     start (the jq output), review rows with non-zero skip counts, deviations folded at
     review that implicated plugin templates/doctrine. -->

## What works

<!-- Optional but valuable: mechanisms that demonstrably earned trust this window, so the
     plugin's scaffold ledger keeps its promote/retire conditions honest in both
     directions. -->
