---
date: 2026-09-07
build_base: main
status: done
tier: standard
area: genesis
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 22a
spiked: 2026-09-07
open_markers: 0
diff_base: a607cf6a543ad20c94f953b4d32cf8588c2588e8
---

# Genesis stops requiring a theme: BRIEF ratifies the design canon without `tokens.css` or direction dissents

## Goal

`/spec:genesis`'s `BRIEF` state refuses `--mark brief-written` for a visual archetype unless
`design/tokens.css` exists and unless `docs/design/doctrine.md ## Dissents` names every
composed-but-unpicked direction from `design/mocks/status.json.directions`. Both preconditions
assume the theme is picked inside `/spec:mocks`. Brief 22a as amended (ADR-0010) moves the theme
pick into `/spec:sketch`, which runs **after** genesis — so under the new chain neither artifact
exists when BRIEF runs and genesis could never ratify a visual host again. This spec removes
exactly those two preconditions, re-points the prose and step text that name them, and leaves
every other BRIEF check byte-identical. Done means a visual run with no `design/tokens.css`,
whose `## Dissents` names no theme direction, ratifies and checkpoints `BRIEF → MENUS`, while
the doctrine cap, the empty-Dissents refusal, the design-rules schema, the mocks-APPROVED
precondition, the ledger gate and the `## Journeys`/`## Non-UI Coverage` checks all still
refuse exactly as they do today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Delete the `brief-written` tokens precondition outright — the block `if (isVisualArchetype(archetype) && !fs.existsSync(tokensCssPath())) { die('design/tokens.css does not exist — ratify THEME\'s tokens.css, then re-mark brief-written') }` and the now-unreferenced `tokensCssPath()` helper. No replacement check, no warning line: BRIEF stops having an opinion about the theme (AC-20260907-05-1, AC-20260907-05-6) | The artifact it guards is now produced two stages later. Executed 2026-09-07: `tokensCssPath()` has exactly one caller, so the helper dies with it and no other genesis state reads the file. Rejected: downgrading to a `⚠️` line — a warning about an artifact that is *correctly* absent trains the session to ignore warnings. |
| D2 | Delete the composed-direction Dissents check — the whole `if (!legacy && isVisualArchetype(archetype)) { … }` block that reads `mocksStatus.directions`/`mocksStatus.theme` and dies naming an unnamed key. `## Dissents` keeps its two surviving requirements unchanged: the heading exists and is followed by ≥1 non-blank line (AC-20260907-05-2, AC-20260907-05-6) | With THEME out of `/spec:mocks`, `status.json.directions` is empty at BRIEF and the loop is vacuous; leaving it in place would be a check that can only ever pass, which reads as coverage and is not. The rejected-direction record moves to the theme pick's own look stop, in the spec that moves the pick. |
| D3 | The two refusal literals that instruct the session to name rejected directions are reworded to name what BRIEF can still see. Missing doctrine: `docs/design/doctrine.md does not exist — draft the one-page doctrine with a ## Dissents section recording the minority positions it rejects, then re-mark brief-written`. Empty Dissents: `docs/design/doctrine.md ## Dissents has no non-blank line — record the minority positions this doctrine rejects, then re-mark brief-written` (AC-20260907-05-3) | A refusal that tells the session to do something impossible is worse than no refusal — it sends a correct run looking for directions that do not exist yet. |
| D4 | BRIEF's step text stops naming theme artifacts, in all three branches: the legacy-resume branch's `Read only:` line drops its `isVisualArchetype(archetype) ? ', design/tokens.css' : ''` clause; the ratification branch's `readFiles` array drops `'design/tokens.css'`; the visual progress line becomes `mocks: APPROVED · journeys: <n> · open product rows: <n>` with the `· directions composed: … (picked: …)` segment and the `directions`/`theme`/`dissentsClause` locals deleted (AC-20260907-05-4) | Step text is a read-only contract with the session; naming a file it must not need is how a correct run gets talked into a wrong one. |
| D5 | The not-yet-approved branch's `next:` line stops enumerating the mocks chain: `next: run /spec:mocks in this repo (seed → shapes → wireframes → theme → skin → review → approved), then --mark brief-written` becomes `next: run /spec:mocks in this repo until it reports APPROVED, then --mark brief-written` (AC-20260907-05-5) | That parenthetical is a second home for a sequence whose one home is `spec/doctrine/mocks.md § Mocks: State Machine`, and it is already wrong — it names SKIN and REVIEW, retired 2026-09-06. Deleting the enumeration fixes it once instead of re-editing it on every chain change. |
| D6 | Doctrine, one home each: `spec/doctrine/genesis.md` § Genesis: Brief State's visual-archetype ratification bullet drops both `a ## Dissents naming every composed-but-unpicked direction from design/mocks/status.json.directions` and `and design/tokens.css present (THEME already wrote it — BRIEF checks presence only, never re-authors it)`, keeping the bullet's doctrine + design-rules requirements; the Doctrine paragraph's `## Dissents` sentence keeps "required, non-empty" and drops the rejected-direction reading; § On-disk Handoff's `design/mocks/` bullet drops the trailing `and checks tokens.css for presence (§ Genesis: Brief State)` clause while keeping the file roster; the header comment blocks at the BRIEF function and in the file preamble drop `and design/tokens.css (written by THEME)`; and the one prose twin of D5's string — `next: run /spec:mocks in this repo (seed → shapes → wireframes → theme → skin → review → approved), then --mark brief-written` — becomes `next: run /spec:mocks in this repo until it reports APPROVED, then --mark brief-written`, matching the driver byte for byte (AC-20260907-05-8) | § Doctrine Authoring: the driver is the mechanism, prose points at it — a precondition deleted in code and left standing in doctrine is the two-homes defect this repo audits for. |
| D7 | Bump `spec/.claude-plugin/plugin.json` to the next free minor — target **7.104.0** (7.99.0 and 7.100.0 shipped on 2026-09-08 in sibling work; 7.101.0/7.102.0/7.103.0 are claimed by `07`/`08`/`09`), resolved to whatever is actually free at build time — with a changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline; hardened-but-unbuilt siblings hold the numbers they claim, and a shipped sibling spends them. |
| D8 | The write line that consumed `dissentsClause` converges on the legacy-resume branch's existing literal: `Write docs/design/doctrine.md (one page, ## Dissents) and .claude/genesis/design-rules.json, then:` — byte-identical in both ratification branches (AC-20260907-05-4) | Orchestrator ruling, build 2026-09-08: D4 deletes the `dissentsClause` local but the spec named no fate for its one consumer, which would have been a `ReferenceError` on every BRIEF step. The legacy branch's string is the only candidate that names no theme artifact and introduces no new copy, so the two branches converge instead of diverging. |
| D9 | AC-20260907-05-8's two promises are split into separate bullets: AC-20260907-05-8 keeps the new requirement (§ Genesis: Brief State names no `design/tokens.css` and no `composed-but-unpicked`; `skin` nowhere in the file) and a new AC-20260907-05-9 carries the regression pin (§ On-disk Handoff still lists `design/mocks/`). Both cite `tests/consistency/genesis-doctrine.test.js` | Orchestrator ruling, build 2026-09-08: `red-check.js` sanctions a file green-expected only when EVERY carried AC is a `SHALL CONTINUE TO` pin, and the merged bullet's trailing pin clause sanctioned the whole file — the genuinely-red new requirement reported as a `broken-pin` HARD finding. Split, the file carries one unsanctioned AC and classifies red-expected, which is what it is. |

**Orchestrator duty (outside the File Plan table):** `tests/genesis/brief-state.test.js` carries
the change's whole weight and must be edited first — `AC-20260902-08-5` is a five-arm compound
test whose "an unnamed composed direction in `## Dissents` is refused naming it" and "a missing
`tokens.css` is refused naming it" arms are **superseded** by D1/D2 and must be deleted from that
test rather than inverted in place (its remaining three arms — the 121-line doctrine, the bad
`targetCategory`, the acceptance path — stay, and the test's name is rewritten to match what it
still pins). `AC-20260902-11-10`'s assertion message names "spec 08's doctrine-length/Dissents/
design-rules/tokens checks (D3/D4)" and must narrow to drop `tokens`. Run
`node --test tests/genesis/` before touching the consistency test. Per-file 45 s budget
(specs/20260903/07) applies.

**Sequencing (not in this spec):** this is series 2 of 5 under brief 22a's 2026-09-07 amendment
and is deliberately the *smallest* of them — it is a pure loosening that is green against the
chain as it stands today, so it can land before or after `specs/20260907/04` with no
interaction. The theme pick's arrival in `/spec:sketch`, the mocks driver losing `THEME`, and
the `--reopen theme` retirement are the **next** spec's landing unit and touch none of the files
below except the plugin version.

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1: tokens precondition + `tokensCssPath()` deleted; D2: composed-direction Dissents block deleted; D3: the two Dissents refusal literals; D4: BRIEF step text read-only lists and progress line; D5: the `next:` line; D6: the two header comment blocks |
| spec/doctrine/genesis.md | MODIFY | doctrine | D6: § Genesis: Brief State's visual bullet, the Doctrine paragraph's Dissents sentence, § On-disk Handoff's `design/mocks/` bullet |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version bump + changelog entry |
| tests/genesis/brief-state.test.js | MODIFY | tests | AC-20260907-05-1, AC-20260907-05-2, AC-20260907-05-3, AC-20260907-05-4, AC-20260907-05-5, AC-20260907-05-6, AC-20260907-05-7; plus the orchestrator duty's two supersessions |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260907-05-8, AC-20260907-05-9 |

## Contracts

```
genesis-driver.js --root <dir> --mark brief-written        (archetype: web-app | mobile-app |
                                                            realtime-trading | desktop-app)
  still refuses: design/mocks/status.json missing or not APPROVED
  still refuses: the mocks provenance ledger's gate blocked
  still refuses: brief.md ## Journeys missing a seed journey or label
  still refuses: brief.md ## Non-UI Coverage key missing or dark
  still refuses: docs/design/doctrine.md missing
                 -> "docs/design/doctrine.md does not exist — draft the one-page doctrine with a
                     ## Dissents section recording the minority positions it rejects, then
                     re-mark brief-written"
  still refuses: docs/design/doctrine.md over the 120-line cap
  still refuses: ## Dissents heading with no non-blank line
                 -> "docs/design/doctrine.md ## Dissents has no non-blank line — record the
                     minority positions this doctrine rejects, then re-mark brief-written"
  still refuses: .claude/genesis/design-rules.json unreadable / no rules array / bad id /
                 bad targetCategory / bad grounding / bad severity / no appliesTo
  NO LONGER refuses: design/tokens.css absent
  NO LONGER refuses: ## Dissents not naming a composed-but-unpicked direction
  on accept: marks.briefWritten = true, status.brief = {mocks, legacy, ratifiedAt},
             status.design = "ratified", prints "(BRIEF → MENUS)"        [unchanged]

BRIEF step text — visual archetype, mocks APPROVED
  Read only: design/mocks/seed.md, design/mocks/ledger.md, design/mocks/status.json,
             .claude/genesis/brief.md                       (design/tokens.css removed)
  progress:  mocks: APPROVED · journeys: <n> · open product rows: <n>
                                                            (directions/picked segment removed)

BRIEF step text — visual archetype, mocks not APPROVED
  next: run /spec:mocks in this repo until it reports APPROVED, then --mark brief-written

BRIEF step text — legacy resume
  Read only: docs/design/doctrine.md, .claude/genesis/design-rules.json
                                                            (design/tokens.css removed)
```

## Behavior

The two deleted blocks sit inside `handleBriefWritten`'s ratification arm, which runs only for
archetypes that owe a design canon. Their removal changes nothing for `backend-api`/`data-ml`
(pass-through) and nothing for `--legacy` (which already skipped the direction check via its own
`!legacy` guard and is unaffected by the tokens deletion beyond no longer needing the file).

Order inside the arm is otherwise preserved exactly: doctrine existence → line cap → non-empty
Dissents → design-rules schema → record. The tokens check was the last thing before recording,
so deleting it cannot re-order any surviving refusal; the direction check sat between the
non-empty Dissents check and the design-rules check, and deleting it makes design-rules the next
check after Dissents. Both properties are pinned by AC-20260907-05-6's ordering arms.

A host that already ran genesis to `MENUS` or beyond is untouched — `brief-written` is a
one-shot mark and nothing re-reads `design/tokens.css` later in the chain.

## Acceptance Criteria

- **AC-20260907-05-1**: WHEN `--mark brief-written` runs on a visual (`web-app`) run whose BRIEF
  preconditions all hold except that `design/tokens.css` does not exist THE SYSTEM SHALL accept —
  exit 0, `status.json` recording `marks.briefWritten: true` and `design: "ratified"`, stdout
  carrying `(BRIEF → MENUS)` → `tests/genesis/brief-state.test.js`
- **AC-20260907-05-2**: WHEN that same run's `design/mocks/status.json` declares
  `directions: {quiet, warm}` with `theme: "quiet"` and its `docs/design/doctrine.md ## Dissents`
  body is exactly `Nothing else was considered.` (naming neither `quiet` nor `warm`) THE SYSTEM
  SHALL accept — exit 0 → `tests/genesis/brief-state.test.js`
- **AC-20260907-05-3**: WHEN `docs/design/doctrine.md` is absent, and separately WHEN its
  `## Dissents` heading is followed by no non-blank line, THE SYSTEM SHALL refuse with exit 2 and
  a message containing the literal `minority positions` and containing neither `rejected
  direction` nor `composed direction` → `tests/genesis/brief-state.test.js`
- **AC-20260907-05-4**: WHEN the bare driver prints the BRIEF step for a visual run whose mocks
  set is APPROVED THE SYSTEM SHALL print a progress line matching
  `mocks: APPROVED · journeys: 1 · open product rows: 0` exactly, and a `Read only:` line that
  does not contain `design/tokens.css`; and WHEN it prints the legacy-resume BRIEF step THE
  SYSTEM SHALL print a `Read only:` line that does not contain `design/tokens.css`; and in BOTH the
  visual-ratification and the legacy-resume BRIEF steps THE SYSTEM SHALL print the literal
  `Write docs/design/doctrine.md (one page, ## Dissents) and .claude/genesis/design-rules.json,`
  and SHALL print no line containing `## Dissents naming:` →
  `tests/genesis/brief-state.test.js`
- **AC-20260907-05-5**: WHEN the bare driver prints the BRIEF step for a visual run whose
  `design/mocks/status.json` is present but not `APPROVED` THE SYSTEM SHALL print the literal
  `next: run /spec:mocks in this repo until it reports APPROVED, then --mark brief-written`, and
  the printed step block SHALL contain neither `skin` nor `review` →
  `tests/genesis/brief-state.test.js`
- **AC-20260907-05-6**: WHEN `--mark brief-written` runs on a visual run with no
  `design/tokens.css` and a direction-naming-free `## Dissents`, but whose
  `docs/design/doctrine.md` is 121 lines, THE SYSTEM SHALL CONTINUE TO refuse naming the count;
  and with a valid-length doctrine whose `## Dissents` is empty THE SYSTEM SHALL CONTINUE TO
  refuse naming `## Dissents`; and with a valid doctrine but a
  `.claude/genesis/design-rules.json` rule carrying an invalid `targetCategory` THE SYSTEM SHALL
  CONTINUE TO refuse naming the enum; and with a `design/mocks/status.json` whose `state` is not
  `APPROVED` THE SYSTEM SHALL CONTINUE TO refuse → `tests/genesis/brief-state.test.js`
- **AC-20260907-05-7**: WHEN `--mark brief-written --legacy` runs on a legacy resume with a
  non-empty `## Dissents`, a valid `design-rules.json`, and no `design/tokens.css` THE SYSTEM
  SHALL CONTINUE TO ratify — exit 0, `status.brief.legacy: true` →
  `tests/genesis/brief-state.test.js`
- **AC-20260907-05-8**: WHEN `spec/doctrine/genesis.md` is read THE SYSTEM SHALL carry a
  `## Genesis: Brief State` section that names `design/tokens.css` in no `brief-written`
  precondition and requires no `## Dissents` naming of composed directions — the section
  contains neither the literal `design/tokens.css` nor the literal `composed-but-unpicked` —
  and SHALL carry the literal `skin` nowhere in the file →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260907-05-9**: WHEN `spec/doctrine/genesis.md` is read THE SYSTEM SHALL CONTINUE TO
  list the `design/mocks/` workspace under § On-disk Handoff →
  `tests/consistency/genesis-doctrine.test.js`

## Assumptions (escalation triggers)

- **A1: `design/tokens.css` is read at exactly one place in the genesis driver's gates.**
  Executed 2026-09-07: `grep -n "tokensCssPath()" spec/scripts/genesis-driver.js` returns the
  definition (one line) and one caller inside `handleBriefWritten`; the file's only other
  `design/tokens.css` occurrences are two step-text read-only lists and three narrative header
  comments. — **if false:** the second reader gets its own Decision row and its own AC before
  build; it does not ride D1 silently.
- **A2: removing both blocks leaves every other `brief-written` refusal intact.** Executed
  2026-09-07 against a patched copy of the driver in a scratch tree (the repo file was not
  modified): a compliant `web-app` fixture with no `design/tokens.css` refused today with
  `design/tokens.css does not exist — ratify THEME's tokens.css…` and, with tokens present but a
  `## Dissents` body of `Nothing else was considered.`, refused with `## Dissents does not name
  composed direction "warm"`; on the patched driver the same fixtures — and a fixture missing
  both at once — accepted with exit 0, `marks.briefWritten: true`, `design: "ratified"`, while an
  empty `## Dissents` still refused (`has no non-blank line`) and a 121-line doctrine still
  refused (`the one-page cap is 120 lines`). — **if false:** stop and re-slice; a surviving
  refusal that fires on the new chain means BRIEF has a second theme dependency this spec did
  not find.
- **A3: `/spec:sketch` runs after `/spec:genesis`, so no genesis gate may require an artifact
  sketch produces.** Grounded in the ratified chain `/spec:mocks → /spec:genesis → /spec:enforce
  → /spec:plan` with sketch as the per-brief pre-plan workbench on a roadmap genesis writes. —
  **if false:** genesis keeps the gate and the pick moves earlier instead; that is a brief-level
  reversal, not a build-time repair.
- **A4: `tests/genesis/genesis-driver.test.js` needs no edit.** Its BRIEF fixture writes
  `design/tokens.css` and a `## Dissents` body; after D1/D2 both writes are simply unread, and an
  unread file never fails a check. — **if false:** it gains a File Plan row at build with no new
  AC (fixture repair only).

## Rationale

The forcing fact is ordering. Genesis writes the roadmap; `/spec:sketch` designs one brief off
that roadmap before `/spec:plan`. Move the theme pick into sketch and every genesis gate that
names `design/tokens.css` becomes unsatisfiable — not degraded, unsatisfiable. That is why this
lands as its own spec, first and alone: it is a pure loosening, it is green against the chain
exactly as it stands today, and it removes the one thing that would otherwise make the theme
move a bricking change. The reverse order was considered and rejected — landing the theme move
first leaves genesis unable to ratify for the length of one spec, which is not a landing unit.

D2 deletes rather than adapts. The check's purpose was to force the rejected theme directions
into a durable, human-readable record; that purpose survives, but its home moves with the pick
to the look stop that records `pick` plus `others`. Re-pointing the check at that record from
inside genesis would make BRIEF read a `/spec:sketch` artifact that does not exist yet at BRIEF
time — the same ordering defect one level down. Leaving the check in place as a vacuous loop was
rejected explicitly: a loop over an always-empty collection reads as enforcement in the source
and in the doctrine, and would be counted as covered by the next reviewer.

D5 is the smallest decision here and the one most likely to be argued as out of scope. It is
in scope because the same edit pass rewrites that branch's neighbours, because the string is
already wrong (it names SKIN and REVIEW, retired the day before), and because every future
chain change would otherwise re-open this file. Removing the enumeration — rather than
correcting it — is what stops that recurrence.

**Collision closure (executed 2026-09-07, six literal stems).** Every hit on
`spec/scripts/genesis-driver.js`, `spec/doctrine/genesis.md` and
`tests/genesis/brief-state.test.js` is a planned File Plan row. The rest are **waived**, in two
groups. *Still-live mocks-side homes:* `spec/scripts/mocks-driver.js` and
`spec/doctrine/mocks.md` describe `THEME`, which this spec deliberately leaves standing — they
are the next spec's landing unit, and `tests/mocks/mocks-driver-3.test.js` and
`tests/mocks/mocks-driver-look-stops.test.js` pin that still-live behaviour. `docs/canonical/
design.md` describes the same still-live stage. *Dated records:* `docs/roadmap/22-mocks-first-
genesis.md`, `docs/roadmap/22a-mocks-is-wireframes.md` and `docs/adr/0008-mocks-is-wireframes.md`
are snapshots whose headers already carry their status, and `README.md`'s stale skin/review flow
is a known, separately queued correction (it must point at `docs/canonical/design.md` rather than
paraphrase it). The three `executes` hits that are not already rows —
`tests/genesis/conventions-handoff.test.js`, `tests/genesis/genesis-driver.test.js` and
`tests/genesis/tournament.fixtures.js` — reach `brief-written` only for `data-ml` or with a
`design/tokens.css` their fixtures write themselves, so no fixture repair is owed (A4).

What is fragile during execution: `AC-20260902-08-5` is a compound test and the temptation will
be to invert its two dying arms into "accepts now" assertions inside it. Do not — the arms are
superseded, the new acceptance behaviour is pinned by AC-20260907-05-1 and AC-20260907-05-2 as
their own tests, and an inverted arm inside a test named for the old contract is how a spec's
intent gets lost two specs later.

**Review ruling — rejected finding, 2026-09-08.** The second review pass raised the driver's
file-preamble history paragraph (`spec/scripts/genesis-driver.js` ~111-112) as still asserting
that BRIEF runs a `tokens.css` check. Rejected on demonstrated miscitation, twice over: the
paragraph's subject is the retired `--mark tokens-landed`, not BRIEF — the `// NOTE:` line
immediately below it says so and marks the whole paragraph as history kept only for the
shell-canon fact it recorded — and A1 is an assumption about the driver's *gates*, not a
promise to edit all three narrative comments, so D6's verbatim preamble scope (the
`and design/tokens.css (written by THEME)` clause) is closed and was fully applied. Executed:
`grep -n "tokens.css" spec/scripts/genesis-driver.js` returns only those two history lines —
every live occurrence is gone. The first review pass killed the same claim on the same grounds.
User ruled to leave the paragraph unedited rather than widen this spec past its own contract.

## Canonical Delta

`docs/canonical/genesis.md`, § the state-chain paragraph — replace the sentence fragment
"BRIEF requires `design/mocks/status.json` APPROVED with an open ledger gate and `--mark
brief-written` ratifies the one-page doctrine (Dissents non-empty) … and THEME's
`design/tokens.css`" with:

> BRIEF requires `design/mocks/status.json` APPROVED with an open ledger gate, and `--mark
> brief-written` ratifies the one-page doctrine (`## Dissents` present and non-empty, recording
> the minority positions the doctrine rejects) plus category-only design-rules
> (`design: "ratified"`; `backend-api`/`data-ml` record `design: "skipped"`). BRIEF has no
> theme precondition: the theme is picked in `/spec:sketch`, which runs after genesis, so
> `design/tokens.css` does not exist while genesis runs and is never checked here.
