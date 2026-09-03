---
date: 2026-09-02
status: done
build_base: main
tier: critical
area: bootstrap
design: false
breaking: false
depends_on: ["specs/20260902/03-plugin-prose-sweep.md"]
depended_on_by: []
brief: 21
open_markers: 0
diff_base: e1b8a86fdf3fa5ba451829100715faf6c86c4e66
---

# Host generators stop planting narration; contract re-hashed; baseline deleted

## Goal

The plugin's host generators — `/spec:init`'s rules-file Gotchas header and authoring bar,
`/spec:review`'s CLOSE fold, and `/spec:escape`'s Gotchas draft — write rule notes as tag +
rule + one owner citation and never narrate dates, people, hosts, versions, or prior
behavior. The grounding contract states that grammar once (its single edit this series,
which also removes its own two narrated lines) and is re-hashed; `/spec:enforce` needs no
change (its manifest schema carries no `notes`; legacy notes are doctor check 16's job).
Done means: init-gen renders the new Gotchas header, the three command surfaces carry the
grammar, the contract hash is re-stamped in this repo's config, the narration baseline file
is deleted, and the standing scan is green at zero with no baseline.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **`spec/scripts/init-gen.js` `renderRulesFile`** emits the Gotchas header comment as: `<!-- One line per entry: a provenance tag — [host] (this repo/stack) or [plugin] (traces to a spec-plugin template/command/generated artifact) — the rule with its mechanism, and one owner citation (spec path, AC-ID, D-number, ADR, run id). Never dates, people, hosts, versions, or prior behavior (/spec:doctor check 16 scans this layer). Writers: /spec:review close and /spec:escape only. /spec:doctor prunes dead citations and rolls [plugin] entries up as an upstream bug list. -->` (wrapped at ~90 columns; the literal words `one owner citation` and `Never dates, people, hosts, versions, or prior behavior` appear; `dated` does not). (AC-20260902-04-1) | Brief § Scope 3: init's Gotchas grammar; the header is what every host's rules file teaches. |
| D2 | **`spec/commands/init.md`** authoring bar: the `rules.sections` bullet's sentence "same content bar the pipeline rules file has always carried" becomes "same content bar the pipeline rules file has always carried — rules state the current invariant plus one owner citation, never dates, people, hosts, versions, or prior behavior"; the `conventionRules` bullet's "each `body` ≤15 lines citing the matching agent and one exemplar file" gains "and one owner citation per rule that needs one, never a dated story". Net line growth ≤ +1 (read load 969 of 970). (AC-20260902-04-2) | Brief § Scope 3: init's conventionRules bar; the brief's root cause is an init-generated convention. |
| D3 | **`spec/commands/review.md`** CLOSE step: "recurring-shaped deviations become one-line entries in the host rules' Gotchas section (tagged `[host]`/`[plugin]` by provenance)" becomes "… (tagged `[host]`/`[plugin]` by provenance; written as tag + rule + one owner citation — the spec path — never dates, people, hosts, versions, or prior behavior)". No other sentence changes; read load ≤ 500 (399 today). (AC-20260902-04-2) | Review close is one of the two writers the header names. |
| D4 | **`spec/commands/escape.md`** step 6 `doctrine` branch: "draft the one-line Gotchas entry verbatim from session context (pipeline rules § Gotchas; cite this escape row; tag …)" becomes "draft the one-line Gotchas entry as tag + rule + one owner citation (this escape row's id) — never dates, people, hosts, versions, or prior behavior (pipeline rules § Gotchas; tag …)". The `review-check` branch's "same Gotchas discipline" already inherits it. Read load ≤ 500 (381 today). (AC-20260902-04-2) | Escape is the other writer. |
| D5 | **`spec/templates/grounding-contract.md`** — one edit, three changes: (a) § Session grounding's path-scoped-rules bullet gains the sentence "Rule notes — Gotchas entries, convention bullets, agent constraints, `enforcement.json` notes — state the current invariant plus one owner citation (spec path, AC-ID, D-number, ADR, run id) and never narrate dates, people, hosts, versions, or prior behavior; `/spec:doctor` check 16 scans the layer."; (b) the § Runtime-verification example "(UpWell, 2026-07: 8/8 gate tasks green while `GET /` returned 500 on every commit)" becomes "(a host once had every gate task green while its root route returned 500 on every commit)"; (c) "Several commands and scripts used to hardcode a stack shape" becomes "Without this block, commands and scripts would hardcode a stack shape". Headings byte-identical. The contract hash changes — a genuine contract change (hosts' rules layers gain a duty), sanctioned here. (AC-20260902-04-3, AC-20260902-04-4) | Brief § Scope 3: the contract picks up the wording change and is re-hashed; host § Risk Tiers names this file. |
| D6 | **`.claude/spec.config.json`** (this repo): `contractHash` re-stamped to `$(spec-paths contract-hash)` after D5 and `generatedBy` to `spec@<new version>`; no other key changes. (AC-20260902-04-4) | The state-gate hook compares the stamp on every prompt; a stale stamp warns every session in this repo. |
| D7 | **`/spec:enforce` is unchanged.** `enforce.md` Phase 6's manifest schema has no `notes` field and the report's ⚠️ fallback line is transient; legacy hosts' persisted notes (upwell: 21 of 22 entries) are doctor check 16 findings (sibling 01 D2), patched under `--fix` as tag + rule + one citation. `[no-ac: no change — recorded so the brief's open question 2 has its answer]` | Brief open question 2 answered by measurement (01 A8). |
| D8 | **`.claude/comment-narration.baseline.json` is deleted**; the standing test runs the scan with no baseline and expects zero findings repo-wide, and a third assertion requires the baseline file to be absent. (AC-20260902-04-5) | Brief § Result: swept to zero with the baseline file deleted. |
| D9 | `spec/.claude-plugin/plugin.json`: version bump target 7.58.0 (next free if taken); changelog paragraph names the generator grammar, the contract re-hash (hosts: run `/spec:doctor`, approve the re-stamp, then apply check 16 patches), and the baseline deletion (last-3 form). `[no-ac: manifest — pinned by tests/consistency/plugin-version.test.js]` | Host § Planning; minor bump because hosts' grounding is re-stamped. |
| D10 | **Tests.** `tests/init-gen/generate.test.js` gains AC-20260902-04-1 (rendered rules file's Gotchas header grammar); `tests/comment-narration/comment-narration.test.js` gains AC-20260902-04-2 (the three command files contain the grammar literal) and AC-20260902-04-3 (the contract contains the grammar sentence and neither narrated phrase); `tests/init-gen/generate.test.js`'s existing contract-hash assertion is tagged AC-20260902-04-4 in place; `tests/consistency/comment-narration-live.test.js` is retagged AC-20260902-04-5 with the absent-baseline assertion added. (AC-20260902-04-1, AC-20260902-04-2, AC-20260902-04-3, AC-20260902-04-4, AC-20260902-04-5) | Host § Test Rules; AC-2/3 are prose-content pins on generator surfaces, the same standing as the plugin-version and citations pins. |
| D11 | **`spec/templates/grounding-contract.md`** § Session grounding, same single edit as D5: the parenthetical "(adopted 2026-07 from the mid-2026 Claude Code baseline: …)" becomes "(the Claude Code baseline: …)" — the baseline held three contract findings, D5 named two; AC-20260902-04-5 (scan at zero, no baseline) observes it. Session ruling against Rationale during build, 2026-09-02. | The Goal requires the standing scan at zero; a third narrated line in the contract was unlisted, not out of scope. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/init-gen.js | MODIFY | scripts | D1: Gotchas header comment text in `renderRulesFile` |
| spec/commands/init.md | MODIFY | doctrine | D2: authoring bar sentences; net ≤ +1 line |
| spec/commands/review.md | MODIFY | doctrine | D3: CLOSE fold grammar |
| spec/commands/escape.md | MODIFY | doctrine | D4: Gotchas draft grammar |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D5: grammar sentence + two narrated lines reworded (single edit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: 7.58.0 + changelog paragraph |
| .claude/spec.config.json | MODIFY | other | D6: `contractHash` + `generatedBy` re-stamp |
| .claude/comment-narration.baseline.json | DELETE | other | D8: the sweep is complete |
| tests/init-gen/generate.test.js | MODIFY | tests | AC-20260902-04-1 (new test case appended), AC-20260902-04-4 (tag in place) |
| tests/comment-narration/comment-narration.test.js | MODIFY | tests | AC-20260902-04-2, AC-20260902-04-3 |
| tests/consistency/comment-narration-live.test.js | MODIFY | tests | AC-20260902-04-5 retag + absent-baseline assertion |

## Contracts

```text
Gotchas header (init-gen renderRulesFile), literal substrings pinned by AC-20260902-04-1:
  "one owner citation (spec path, AC-ID, D-number, ADR, run id)"
  "Never dates, people, hosts, versions, or prior behavior"
  absent: "dated"

Grammar literal pinned in review.md, escape.md, init.md by AC-20260902-04-2:
  "never dates, people, hosts, versions, or prior behavior"

Contract sentence pinned by AC-20260902-04-3 (grounding-contract.md § Session grounding):
  "state the current invariant plus one owner citation"
  absent: "UpWell, 2026-07", "used to hardcode"
```

## Behavior

- Build order inside the wave: D5 lands, then `spec-paths contract-hash` is run and D6 writes
  the value; the `other` wave trails the `doctrine` wave so the stamp always follows the
  edit.
- `tests/fixtures/minimal-host/.claude/spec.config.json` carries its own `contractHash`; no
  test compares it to the live hash (A3), so it is untouched.
- Hosts: after this ships, each host's `/spec:doctor` reports check 2 stale (hash) and check
  16 findings; JJ approves the re-stamp and the line-item patches per host (brief § Scope 3:
  host refresh is JJ-run).

## Acceptance Criteria

- **AC-20260902-04-1**: WHEN `init-gen.js generate` renders a rules file THE SYSTEM SHALL emit a Gotchas header comment containing `one owner citation (spec path, AC-ID, D-number, ADR, run id)` and `Never dates, people, hosts, versions, or prior behavior` and not containing `dated` (render for the minimal-host fixture profile → both substrings present, `dated` absent) → new test in tests/init-gen/generate.test.js
- **AC-20260902-04-2**: WHEN `spec/commands/review.md`, `spec/commands/escape.md`, and `spec/commands/init.md` are read THE SYSTEM SHALL contain the literal `never dates, people, hosts, versions, or prior behavior` in each (three files → three matches; today zero) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-04-3**: WHEN `spec/templates/grounding-contract.md` is read THE SYSTEM SHALL contain `state the current invariant plus one owner citation` and SHALL NOT contain `UpWell, 2026-07` or `used to hardcode` → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-04-4**: WHEN `init-gen.js generate` stamps a host config THE SYSTEM SHALL CONTINUE TO write `contractHash` equal to `spec-paths contract-hash` (the existing assertion, tagged; it re-derives the hash so D5's change passes through) → tests/init-gen/generate.test.js
- **AC-20260902-04-5**: WHEN the suite runs THE SYSTEM SHALL observe the plugin scan exit 0 with no `--baseline` flag and `.claude/comment-narration.baseline.json` absent from disk (`fs.existsSync` → false; scan `--json` → `"total":0`) → tests/consistency/comment-narration-live.test.js

## Assumptions (escalation triggers)

- A1: Sibling 03 is `done`; the baseline holds exactly the contract entry. — **if false:** STOP; run 03 first.
- A2: `enforce.md`'s Phase 6 manifest schema has no `notes` field and nothing in `spec/` reads `enforcement.json` notes — **executed 2026-09-02**: `grep -n notes spec/commands/enforce.md` hits only the citations' `note` key; `wf-enforce.js`'s `notes` is a research-return field consumed by the Phase 7 report only. — **if false:** D7 flips to pointer-only in the writer; STOP and ask before locking that.
- A3: No test compares `tests/fixtures/minimal-host/.claude/spec.config.json`'s `contractHash` to the live hash — **executed 2026-09-02**: `contractHash` appears in `tests/spec-paths.test.js` (shape only), `tests/init-gen/generate.test.js` (re-derived), `tests/genesis/conventions-handoff.test.js` (non-empty). — **if false:** update the fixture's stamp in the same build and record the deviation.
- A4: `init.md` + `shared-for init` = 969 lines against a ratchet of 970 — **executed 2026-09-02**. — **if false** (D2 needs more than one net line): shorten another init.md sentence in the same edit; never raise the ratchet.
- A5: The contract hash change is the only host-visible effect; the state-gate hook's stale-stamp warning is advisory, never blocking. — **if false:** STOP, ask the user.

## Rationale

The generators are the root: a host's rules layer narrates because init taught it to and
review/escape kept appending in the same voice. Changing three sentences and one header
string stops the habit everywhere at once; doctor check 16 (sibling 01) trims what already
exists, so no host needs a regeneration. The contract edit is the expensive part — every host
goes stale on the next prompt — and it is worth it because the duty is real: hosts' rules
layers now carry a scanned invariant, and a contract that does not say so cannot be enforced
by doctor. It is also the moment to fix the contract's own two narrated lines, since the
file admits one edit per spec. `/spec:enforce` needs nothing: the persisted manifest never
had a `notes` field in its current schema, and the upwell notes are a legacy artifact the
rules scan already reports. Critical tier because the contract is a host § Risk Tiers
surface; every AC carries a literal.

Rejected: a `--fix` grammar specific to enforcement notes (the generic line-item patch
covers it); dropping `notes` from legacy manifests (they hold carve-out rationale a host
still needs — patched to rule + citation instead); moving the baseline deletion earlier
(the contract's two lines are the last findings and belong to this edit).

Build deviations folded at close (2026-09-02, one-offs): the live scan test's two
baseline-content pins (AC-20260902-02-1, AC-20260902-03-1) were retired with the baseline
itself — sibling 03 D9 anticipated this — and the retagged AC-20260902-04-5 asserts a strictly
stronger promise; the contract's third narrated line (§ Session grounding's dated
"adopted" parenthetical) was reworded under D11 because the sweep-to-zero Goal, not D5's
literal list, is the contract; init.md's D2 edit first landed at net +2 and was brought to
+1 by shortening the `config` bullet, per A4's fallback.

## Canonical Delta

`docs/canonical/bootstrap.md` § Invariants gains: **Rule notes cite owners, never
history** — the generated Gotchas header, the init authoring bar, and the review/escape
writers all produce tag + rule + one owner citation; the grounding contract states the duty
and `/spec:doctor` check 16 enforces it in every host's rules layer. The narration baseline
that ratcheted the plugin's own sweep is gone; the standing scan runs at zero.
