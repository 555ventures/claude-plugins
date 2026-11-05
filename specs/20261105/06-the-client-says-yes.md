---
date: 2026-11-05
status: implementing
area: doctrine
depends_on: [specs/20261105/02-lanes-that-wait-for-each-other.md]
brief: 35
architecture: false
---

# The client says yes

## Intent
- You asked: plan roadmap 35 — a run asks me exactly when a developer would ask the client (architecture, behaviour, design, direction) and never otherwise; far fewer questions than v7, not zero like v8.
- I will build:
  - One test for every stop, written into doctrine and the commands: would the client need to sign this off. A "real fork" list replaces the undefined phrase in plan.md; anything on it is asked once, batched, before lock; product facts are asked, never derived.
  - The lock sees the yes: an Intent line `Client sign-off: …`, a `breaking` frontmatter key, and a `plan.js lock` refusal when a Decisions row restricts users or the spec is breaking and the line says `none`.
  - Assumptions can stop a build: the builder brief prints them, an `if false: ask` arm becomes a pending question of kind `assumption` via `run.js --mark unmet --assumption <id>`, and the answer is written into the Decisions table by the driver.
  - A reviewer finding of severity `needs-decision` becomes a question (keep / fix / amend) before any FIX round is spent; only the user waives a Decision (the `amend` path from spec 02).
  - Out-of-plan edits under a host-named `askPaths` glob stop with a question of kind `scope` (widen / separate / park); every other out-of-plan file widens and is reported, as today.
  - Fix keeps one stop in prose: after green, the strings it authored and the display or policy choices it made, one AskUserQuestion, veto reverts; empty list, no stop.
  - A present `## Canonical Delta` is applied by the builder to the named `docs/canonical/<area>.md`; those edits are not "outside the File Plan".
  - Every pending question carries a `kind`; fanout's RELAY prints questions grouped by kind with the recommended option first and never answers for the user; interface-contract lists every kind and its writer.
- I will not touch:
  - v7's `stops.*` policy knobs, tiers, the deviations sidecar, the promise sweep, AC lint, mandatory spikes, genesis discovery keys, init policy rounds, the genesis direction round (brief 35 § Not in this brief).
  - Mocks, prototype and release stops; `block-worker-git.sh`; spec 02's `unmet --decision`, spec-edit check and `waiting` verb (reused as they are).
  - A `/spec:fix` driver (brief 33 / q148): fix stays prose here; its structural-cause stop stays a sentence.
  - The plugin version (ADR-0039 D4: bumped at release).
- Architecture or behaviour change: no — new question kinds, one lock check and prose; no driver step is removed and no ADR is added or overturned.
- Client sign-off: none — JJ wrote brief 35 after the three-way audit; every choice below follows its bullets.

## Goal

A clean run asks nothing. A run that meets a client-level choice asks once, in one batched question, and the answer is recorded in the spec by the driver, never by a builder. On the v8 trial this would have asked JJ twice (niko-hub 04's D11/D13 self-amend; shop-bltr 08's dropped D8/D12) and blocked the lock of specs whose Decisions took something away from users without a recorded yes, while leaving the 20 clean lanes exactly as quiet as they were.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | plan.md step 3 names the real forks: a UI flow or screen the user will see change; a permission, restriction or something taken away from a user; what happens to existing data (migration, deletion, visibility, retention); pricing, limits or a paid service; a breaking change for existing users or integrations; a hard-to-reverse architecture choice (persistence, framework, auth, deploy target). On the list: ONE batched AskUserQuestion of at most four questions before lock, recommended option first, each option carrying its consequence, the answer written into Decisions as `[asked: <what JJ chose>]` at the end of the row. Off the list: decide, write the Decision with its reason. A business rule the brief and code do not state is a clarification marker (the bracketed form the lock refuses), never a guess ("product facts are asked, never derived"); the lock refuses open markers as today. | v8's "ask the user only about real forks" was undefined and the planner self-resolved everything; v7's product questions came from exactly these rules (audit, brief 35). |
| D2 | `spec/templates/spec.md` Intent gains the line `- Client sign-off: none \| <what was asked> — <what JJ chose>`; `parseIntent` reads it into `intent.signoff` (`null` for `none`, else the text). Frontmatter gains `breaking: false`, read as a boolean. `plan.js lock` refuses with `client sign-off needed: <reason> — ask, then fill the Intent line` when `intent.signoff` is null and either (a) `frontmatter.breaking === true`, or (b) any Decisions row's decision cell matches `RESTRICT_RE` = `/\b(cannot|can't|no longer|only (?:an? )?\w+ (?:can|may)|immutable|read-only|requires? (?:a )?reason|hidden from|removed from|locked out)\b/i` and does not carry `[asked:` or `[guards:`. `architecture: true` keeps `--confirmed`. A spec with no Intent section (v7-era) is unaffected. | The one mechanical check from v7's decision-lint worth keeping: taking an affordance away or breaking users needs the client's word. One regex, no lint. |
| D3 | Assumptions are printed in both briefs (`## Assumptions` after the ACs; `OTHER_SECTIONS` drops the word). `state.parseAssumptions(text)` parses `- A<n>: <text> — if false: <arm>`; `arm` is `ask`, `ask: <option> \| <option>…`, or free text (a written fallback). `run.js --mark unmet --assumption <id> [--why <text>]` (BUILD, REPAIR, FIX, REVIEW; `--assumption` must match a parsed id) goes to ESCALATE with `why: 'assumption'`, `from: <step>`, question `<spec id> found <A-id> false: <assumption text>[ — <why>]. How should it continue?`, options: the arm's options when it has them, else `retry` / `park` / `amend`; `amend` is always last. A free-text fallback arm is the builder's to apply; marking it `unmet` is refused with `A<n> has a written fallback: <arm> — apply it`. The template's `if false:` text says `<what changes, or ask>`. | v7's "escalation triggers" were pre-decided at plan time and stopped the build; v8 printed Assumptions nowhere. The planner writes the options, so the question is answerable cold. |
| D4 | A ruling is recorded by the driver, never by a builder. `escalate <label>` on `why: 'assumption'` with an arm option (not retry/park/amend) appends a Decisions row `\| D<next> \| <A-id> ruled: <label> \| asked at <step> \|` to the worktree copy of the spec, records `state.rulings = [...ids]`, and returns to `from` with fresh attempts on opus. `specEdits` strips rows whose id is in `state.rulings` before comparing Decisions to base, so the ruling is not a spec edit. The AC is not rewritten by the driver; when the ruling changes an observable promise the planner's option text names the AC and `amend` is the path. | "Only the session adds rows" (v7 stage-build) without a session: the driver is the session. Keeps spec 02's spec-edit check honest. |
| D5 | reviewer.md and `SEVERITIES` gain `needs-decision`: a diff that silently made a choice from D1's list, or departed from a Decision with a reason the reviewer finds plausible; the summary states what the spec implied and what the diff did. `reviewed`: blocking findings win as today (FIX / ESCALATE); with none blocking and ≥1 `needs-decision`, go to ESCALATE with `why: 'review-decision'`, question `<spec id> made a choice you did not: <summary>[; +N more]. Keep it?`, options `keep` (record each finding as a D4 ruling row `reviewer: <summary>`, then COMMIT), `fix` (a FIX round whose brief lists the findings as "undo this choice; follow the spec", not counted against FIX_CAP), `amend`. `needs-decision` findings with blocking ones present ride along in `state.review` and are re-raised by the next `reviewed`. | Today a justified departure had no route but FIX → ESCALATE after the builder failed again; the client decides before a fix round is spent. |
| D6 | `.claude/spec.config.json` gains optional `askPaths: []` (globs; `**`, `*`, `?` via `lib/state.globToRe`, root-relative). `gateStep`, after the green gate and spec-edit check: `scope` = out-of-plan files (as `outsidePlan`, minus the spec-text entry) matching any glob; non-empty → ESCALATE `why: 'scope'`, `specEdits`-style list in `state.scope`, question `<spec id> changed files outside its File Plan on paths you watch: <list>. How should it continue?`, options `widen` (record a D4 row `scope widened: <files>`, continue to REVIEW), `separate` (queue a prompt `follow-up: <spec> changed <files> outside its File Plan — plan it`, revert those files from base, back to GATE), `park`. The reviewer brief marks matching files with `(askPaths)`. Doctor prints nothing about `askPaths`. | v7 asked on Risk Tiers surfaces and auto-widened elsewhere; the host names the surfaces, the plugin does not guess them. |
| D7 | fix.md gains step 5: after green, list every user-facing string you authored and every display or policy choice you made (hidden, reordered, defaulted, reformatted); when the list is not empty, ask ONE AskUserQuestion of at most four items, recommended answer first; a vetoed item reverts to the pre-fix behaviour before the commit; an empty list skips the stop silently. Step "If the cause needs an architecture or behaviour change" stays prose and gains "stop before the first edit". No driver. | v7's one fix stop worth keeping; brief 33 owns the fix driver. |
| D8 | builder.md says: when the spec has a `## Canonical Delta` section, apply it verbatim to the `docs/canonical/<area>.md` it names, in the build; `OTHER_SECTIONS` names Canonical Delta as applied; `outsidePlan` excludes `docs/canonical/**` when the spec has that section. migrate.js is untouched (it promises nothing about deltas). | Brief 35 and q156: v7-era specs promise the delta lands; v8 stopped applying it silently. |
| D9 | builder.md says: when the spec leaves a choice on D1's list open, or a Decision cannot be honoured as written, or an Assumption with an `ask` arm proves false, stop and say which in your reply, do not pick; run.md tells the orchestrator the mark for each (`unmet --decision`, `unmet --assumption`, `waiting --on`). reviewer.md carries D1's list and D5's severity. | A builder never improvises on a fork (v7 worker contract), restated for v8's one builder. |
| D10 | `pending.writePending` takes `kind` (one of `escalate`, `unmet`, `assumption`, `decision`, `scope`, `spec-edit`, `conflict`) and stores it; `run.js ask()` passes the kind from `state.why` (`gate`/`review` → `escalate`, `decision` → `unmet`, `assumption`, `review-decision` → `decision`, `scope`, `spec-edit`; CONFLICTS → `conflict`). fanout's RELAY body groups stopped lanes by kind in that order, prints `[kind] lane N — stem`, the question, options with the first marked `(recommended)`, and the `answered` line; fanout.md and doctrine say the orchestrator relays every lane question verbatim in one AskUserQuestion per RELAY and never answers for the user; only `📌 Auto-picked` lines are unrelayed. | The trial's orchestrators answered lane questions themselves; the relay is the only path to the client. |
| D11 | doctrine.md § When to ask is rewritten: the sign-off test; D1's list by reference ("the real forks plan.md names"); "product facts are asked, never derived"; "a builder never improvises on a fork; a lane's driver writes the question"; "only the user waives a Decision (`amend`)"; "otherwise decide and print `📌 Auto-picked …`"; question style: plain words, every option carries its consequence, recommended first, readable cold in ten seconds by someone with no repo context. "Never at run" is deleted. | The audit's four doctrine lines; v8 kept only "recommended first". |
| D12 | docs/v8/interface-contract.md § 4 gains a table of pending-question kinds (kind, writer step, options) and the `needs-decision` severity; § 6 gains the `Client sign-off` Intent line and `breaking`; § 3 gains `askPaths`. Tests by execution in tests/plan.test.js, run.test.js, fanout.test.js, pending.test.js, state.test.js; a contract grep that every kind named in run.js appears in the contract. | The contract matches the code (spec 02 D13 rule). |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/doctrine.md | MODIFY | § When to ask rewritten per D11 |
| spec/commands/plan.md | MODIFY | D1 real-fork list, batched question, `[asked:]`, product facts, Client sign-off line, `breaking` |
| spec/commands/run.md | MODIFY | marks for `unmet --assumption`, `escalate keep\|fix\|widen\|separate`; builder stop rule (D9) |
| spec/commands/fix.md | MODIFY | D7 step 5 and the stop-before-edit sentence |
| spec/commands/fanout.md | MODIFY | RELAY relays verbatim, never answers; kinds (D10) |
| spec/agents/builder.md | MODIFY | D8 Canonical Delta, D9 stop-and-say rules |
| spec/agents/reviewer.md | MODIFY | `needs-decision` severity and D1's list (D5, D9) |
| spec/templates/spec.md | MODIFY | `breaking: false`, Client sign-off line, Assumptions arm text (D2, D3) |
| spec/scripts/plan.js | MODIFY | D2 lock refusal (`RESTRICT_RE`, breaking, signoff) |
| spec/scripts/lib/state.js | MODIFY | `intent.signoff`, `breaking` boolean, `parseAssumptions`, `globToRe`, `askPaths` default (D2, D3, D6) |
| spec/scripts/lib/pending.js | MODIFY | `kind` on the pending doc (D10) |
| spec/scripts/run.js | MODIFY | Assumptions in briefs; `unmet --assumption`; `review-decision` and `scope` escalations; rulings (D3–D6, D8, D10) |
| spec/scripts/fanout.js | MODIFY | RELAY grouped by kind, recommended marker (D10) |
| docs/v8/interface-contract.md | MODIFY | kinds table, severity, sign-off line, breaking, askPaths (D12) |
| tests/plan.test.js | MODIFY | D2 refusals and passes |
| tests/state.test.js | MODIFY | signoff, breaking, parseAssumptions, globToRe |
| tests/run.test.js | MODIFY | assumption question and ruling row; needs-decision; scope widen/separate; Canonical Delta not outside plan |
| tests/fanout.test.js | MODIFY | RELAY kinds and recommended marker |
| tests/pending.test.js | MODIFY | kind stored and read back |

## Acceptance Criteria

- **AC-20261105-06-1**: WHEN a spec's Decisions row reads `customers cannot cancel after the cut-off` with no `[asked:` and the Intent line is `Client sign-off: none` THE SYSTEM SHALL refuse `plan.js lock` (exit 2) naming the row; with `[asked: JJ chose cut-off at 18:00]` on the row, or the Intent line filled, it locks.
- **AC-20261105-06-2**: WHEN frontmatter says `breaking: true` and the sign-off line says `none` THE SYSTEM SHALL refuse the lock; with the line filled it locks; a spec with no Intent section locks as before.
- **AC-20261105-06-3**: WHEN the builder brief is printed THE SYSTEM SHALL include an `## Assumptions` block with every `A<n>` line of the spec, and `OTHER_SECTIONS` SHALL not name Assumptions.
- **AC-20261105-06-4**: WHEN a lane marks `unmet --assumption A2` and A2's arm is `ask: keep the old rows | delete them` THE SYSTEM SHALL write a pending question of kind `assumption` whose options are `keep the old rows`, `delete them`, `amend`; `--assumption A9` (unknown) and an id whose arm is free text SHALL be refused with the remedy.
- **AC-20261105-06-5**: WHEN `escalate "keep the old rows"` answers that question THE SYSTEM SHALL append a Decisions row `A2 ruled: keep the old rows` to the worktree spec, return to the step it came from on opus, and the next green gate SHALL not escalate `spec-edit` for that row.
- **AC-20261105-06-6**: WHEN findings JSON holds one `needs-decision` finding and no blocking one THE SYSTEM SHALL go to ESCALATE with a question offering `keep`, `fix`, `amend`; `keep` SHALL record a ruling row and continue to COMMIT; `fix` SHALL print a FIX brief listing the finding and SHALL not increment `attempts.fix`.
- **AC-20261105-06-7**: WHEN findings hold a blocking and a `needs-decision` finding THE SYSTEM SHALL go to FIX as today and keep the `needs-decision` finding in `state.review`.
- **AC-20261105-06-8**: WHEN config `askPaths` is `["apps/server/src/db/**"]` and the build changed `apps/server/src/db/schema.ts` outside the File Plan THE SYSTEM SHALL stop after the green gate with a question of kind `scope` naming the file; a changed `apps/web/x.ts` outside the plan SHALL not stop.
- **AC-20261105-06-9**: WHEN that question is answered `widen` THE SYSTEM SHALL continue to REVIEW with a ruling row `scope widened: apps/server/src/db/schema.ts`; answered `separate` THE SYSTEM SHALL restore the file from base, queue a prompt item naming the spec and the file, and gate again.
- **AC-20261105-06-10**: WHEN a spec has a `## Canonical Delta` section and the build edited `docs/canonical/admin.md` THE SYSTEM SHALL not list that file as outside the File Plan in the reviewer brief; without the section it SHALL.
- **AC-20261105-06-11**: WHEN a lane writes any pending question THE SYSTEM SHALL store `kind` in the pending doc, one of the seven kinds, and `readPending` SHALL return it.
- **AC-20261105-06-12**: WHEN fanout reaches RELAY with a lane stopped on an `assumption` question and another on an `escalate` question THE SYSTEM SHALL print them grouped under `[assumption]` then `[escalate]`, mark the first option of each `(recommended)`, and the body SHALL contain the sentence that the orchestrator never answers for the user.
- **AC-20261105-06-13**: WHEN the doctrine, plan.md, run.md, fix.md, fanout.md, builder.md and reviewer.md are read THE SYSTEM SHALL contain, respectively: the sign-off test and no "never at run"; the six-item real-fork list and "product facts are asked, never derived"; the `unmet --assumption` mark; the fix stop with "empty list" wording; "never answers for the user"; "Canonical Delta" and "do not pick"; `needs-decision`.
- **AC-20261105-06-14**: WHEN interface-contract.md is read THE SYSTEM SHALL list every kind string that run.js passes to `writePending` (a test greps both) and the `needs-decision` severity.
- **AC-20261105-06-15**: WHEN a clean run (green gate, clean review, no askPaths hit, no Assumption marked) goes through THE SYSTEM SHALL ask nothing, as today (the existing whole-loop test stays green).

## Assumptions

- A1: `architecture: false` — new question kinds and a lock check inside the existing driver shape, no ADR — if false: re-lock with `--confirmed`.
- A2: The driver, not the builder, appends ruling rows; the AC is not rewritten by the driver (D4) — if false: `amend` is the path, and a later spec can let the arm name an AC rewrite.
- A3: A `needs-decision` finding is raised only when nothing blocks; blocking findings keep today's FIX path (D5) — if false: raise it alongside, two questions per relay.
- A4: `askPaths` is host-declared with no default and no doctor hint (D6) — if false: brief 37's doctor work adds the hint.
- A5: fix stays prose with one AskUserQuestion (D7); brief 33's fix driver carries it later — if false: fold D7 into that driver when it exists.
- A6: Canonical Delta is applied by the builder and migrate.js is untouched (D8) — if false: "note only": drop D8, have migrate stamp the canonical docs.
- A7: `RESTRICT_RE` is one fixed regex in plan.js, not configurable (D2) — if false: a config list of words.
- A8: Pending `kind` is informational for the relay; `answerPending` keys on labels as today (D10) — if false: kinds gate which marks fanout accepts.
- A9: The real-fork list lives in plan.md prose and reviewer.md, not in code (D1, D9) — if false: a lint over Decisions text, which brief 35 declined.
