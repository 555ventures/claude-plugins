# 0043. The contract is sentences the build proves

- Status: accepted
- Amended by: specs/20261107/02-run-and-fanout-match-the-v8-design.md (D2) — the pin tests run in GATE,
  before REVIEW, against the app the driver boots; the separate pin-test step is gone.
- Date: 2026-11-05
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261105/14-the-prototype-is-pinned-in-chat-and-proved-at-look.md)
- Amends: ADR-0035 — "Approve writes a contract" (pictures per route × state, one end-to-end test
  per behaviour pin made on the prototype), "The build replays the contract" (REPLAY state, review
  `contract` leg) and "The worktree lives until the specs are done" (closed by the review driver).
  "Carry behaviour across, never code", "Entry is plan's three shapes" and "Design is judged by
  eye" stand.

## Context

v8 rebuilt the prototype as a light driver and lost ADR-0035's guarantees without recording why:
no script read the contract after `contracted`, a spec citing no pin locked cleanly, and the build
brief never named it. It also failed on first contact with both real hosts (an entry-file check
no Next.js or `apps/web` layout passes) and crashed on every real v7 record. The v7 evidence
(four real prototypes, 54 pins) showed where the value was: 0 pins came through the overlay —
every one was a chat ruling the session wrote down at approve, unreviewed; the derived tests
were the only artifact later specs bound to, but they were authored against the prototype,
adapted for production by hand and never re-verified; replay caught real gaps (a missing tab
count, p14, p16) and so did the look stop (input height, print sidebar, a rejected tab strip);
pictures helped once; the look stop's loopback url was its one complaint.

## Options considered

- **Restore v7's prototype whole** — states.json, overlay, prototype-side tests, REPLAY, contract
  leg, DB hooks. 1,082 driver lines plus four libs for mechanisms that mostly did not earn
  their keep in real use.
- **Keep v8 as is and fix the crashes** — leaves the contract unread downstream, which is the
  gap the user named.
- **Sentences, proved on the production tree** (chosen) — the session records each ruling as a
  sentence the user confirms; the plan cannot lock without an AC per behaviour pin; the builder
  writes the pin tests on the production tree; the build runs them with the host's e2e command (a
  step of their own as first chosen; GATE since the 2026-11-07 amendment); LOOK stops with the app running.

## Decision

- **A pin is a sentence the user confirmed.** `prototype.js <stem> pin --kind --route [--given]
  --note` records a ruling as `On <route>[, given <given>]: <note>`; APPROVED prints every active
  sentence grouped by route and `contracted --confirmed` needs the user's yes. `drop pN --why`
  retires one and is the amendment path. The contract carries `{id, kind, route, given?, note,
  sentence, round, status}` and nothing of the prototype's DOM; `?proto=` never appears.
- **The lock enforces coverage.** A spec citing a stem (`prototype:` frontmatter) locks only when
  every active behaviour pin has an AC `(pin pN)` here or in an earlier locked citing spec; the
  queued plan item closes when all are covered. Look pins are Decisions listed for LOOK.
- **The build proves the sentences.** The builder writes one browser test per behaviour pin in
  the host's e2e file, by role and visible text, seeding the given precondition; the reviewer
  checks each asserts its sentence. They run in GATE, after the test command and before REVIEW,
  with the host's `prototype.e2eCommand` against the app the driver boots from the spec worktree
  (amended 2026-11-07: they first ran in a step of their own after REVIEW). Red is a repair.
- **The user looks before the commit.** LOOK starts the app from the spec worktree and prints
  `prototype.publicUrl` or the url; only a literal `close enough` advances; any other reply is a
  FIX round with the reply as the symptom.
- **Pictures are a reference.** Optional, on when `prototype.picture` is set, pinned routes only,
  listed for the reviewer and at LOOK, never a gate.
- **Close is the user's mark.** `closed` refuses while a citing spec is mid-run and refuses
  unmerged work without `--force`; it commits its own status and reports a failed removal.
- **One migration, strict readers.** v7 records are rewritten by `/spec:migrate`; `readProto`
  refuses a v7 file naming it. No tolerant reads.

## Consequences

- A host needs `prototype.url` and `bootCommand` to open, and `e2eFile` + `e2eCommand` to run a
  prototype spec; `overlay`, `e2eList`, `dbCreate`, `dbDestroy` are gone from config.
- The experiment ADR-0035 could not run gets a number: pins rejected at LOOK despite green pin
  tests, recorded per run, decides whether prototype-side checking must come back.
- The prototype branch is a reference the builder reads; nothing copies from it, and a selector
  from it is a blocking review finding.
- ADR-0036's note that the build's prototype REPLAY step is unchanged is overtaken: REPLAY is
  gone; the pin tests and LOOK replace it.

## Applies to

- ADR-0035 — the three bullets named under Amends.
- specs/20261105/14-the-prototype-is-pinned-in-chat-and-proved-at-look.md — the spec this ADR records.
