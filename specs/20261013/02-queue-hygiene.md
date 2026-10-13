---
date: 2026-10-13
status: hardened
tier: standard
area: session-queue
breaking: false
depends_on: []
brief: n/a
open_markers: 0
---

# Queue hygiene: refuse duplicates, show age, archive the done, groom the rest

## Goal

The session queue stops accumulating what it cannot clean itself. `add` refuses a free-text
prompt that near-duplicates a pending one. `list` shows each item's age and flags the three
shapes of rot a reader otherwise discovers by hand: a prompt citing a spec that already shipped,
a gate that is met but idle, a prompt older than two weeks. Ticked rows leave the queue file for
a sibling archive so the file holds only live work. A read-only `groom` subcommand prints every
flagged item in buckets with the two fate commands, and the command doctrine says the session
proposes one fate per item and asks per item — never ticks without a yes. Done means: the
duplicate pair this repo holds today (q321/q322) is refused at add time, every list row carries
an age, the queue file here shrinks from 316 rows to the pending ones, and `groom` prints
nothing to groom on a clean queue. Sibling of specs/20261013/01 (the upstream fix); this spec
handles only what that one cannot prevent.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `add` of a `prompt` computes Jaccard similarity between the new payload's token set and every PENDING prompt's (`lowercase`, tokens `[a-z0-9]+`, length ≥ 4) and refuses at exit 2 when any score ≥ `0.35`, naming the matching id, the score, `spec-queue show <id>` and `--distinct`; `add … --distinct` skips the check; brief/spec payloads are unaffected (AC-20261013-02-1, AC-20261013-02-2) | Measured on the two live queues: the one real pending duplicate (q321/q322, the merge-back bug added from two sessions) scores 0.44, the highest innocent pending pair 0.20; 0.35 sits between with margin both ways. Rejected: comparing against ticked prompts too (a re-opened idea is legitimate) |
| D2 | `list` rows gain an age column after the id (`NNd` days since `added`, `?` when absent) and, after the gate marker, up to three flags: `📎 cites done <spec basename>` when a prompt payload names a `specs/YYYYMMDD/NN…md` path whose status is done or superseded; `⏳ gate met` when a gated item's gate is met (today `list` shows only unmet gates); `⌛ stale` when an ungated prompt is ≥ 14 days old. Row numbering and the cut-to-one-line rule are unchanged; the three existing exact-row pins are rewritten to the new form, never weakened (AC-20261013-02-3, AC-20261013-02-9, AC-20261013-02-12, AC-20261013-02-13) | Rot is visible every time the list is read, no separate command needed; the three flags are the three shapes both hand consolidations found. The numbering is what `move`/`--at` count, so it cannot move |
| D3 | Every write subcommand's persist moves items with `ticked` set, or derived done (brief done, spec done/superseded/absent, `when` true), out of `spec-queue.json` into `spec-queue-done.json` beside it (`{version:1, items:[…]}`, appended, each item stamped `archived: <ISO>`), written temp-file + rename like the queue file; `seq` is kept in the queue file so ids never repeat. `list`'s footer `— N done` counts archive rows plus in-file done rows. `show <ref>` resolves an archived id and prints it with `· done (archived)`; `move`/`done` on an archived id exit 2 `is archived (done) — nothing to do` (AC-20261013-02-4, AC-20261013-02-5) | 297 of this repo's 316 rows are ticked; every read parses them. spec-status.js reads only pending items from the queue file (A2), so the archive is invisible to it and that critical file is untouched. Rejected: deleting ticked rows (the ticked history is what tells a re-add from a reopen) |
| D4 | `groom` is a read-only subcommand: it prints, in this order, the buckets `duplicates` (pending prompt pairs with score ≥ 0.35, one row per pair `q<a> ~ q<b>  <score>`), `cites done`, `gate met`, `stale` (D2's predicates), each item row as `q<id>  <age>d  <one-line payload>`; an item prints in every bucket it qualifies for; an empty bucket is omitted; the footer reads `fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes`; nothing flagged prints `✨ nothing to groom · N pending`; exit 0 always; the queue file is never written (AC-20261013-02-6, AC-20261013-02-7) | One script run derives the whole cut list; the judgment (which fate) stays with the session and the user. Rejected: `groom --apply` (both past consolidations found "old" items that were alive, so no auto-tick, ever) |
| D5 | `spec/commands/queue.md` adds `groom` to the frontmatter `argument-hint` and the subcommand list and extends the Render sentence: for `groom`, propose one fate per flagged item from the printed buckets and ask per item (`AskUserQuestion`, ≤ 4 per call), never ticking without a yes — file stays ≤ 55 lines (AC-20261013-02-8) | The command doctrine is where the session learns the ask-per-item rule (memory: explicit yes per decision); the read-load ceiling forbids growth, so the sentence replaces words |
| D6 | `spec-queue.js`'s header comment lists `groom`, `--distinct`, the archive file and the new exit-2 causes (near-duplicate prompt, archived ref) [no-ac: header prose; the behaviours are AC-1, AC-5, AC-6] | Worker Rules: every script header is its own contract |
| D7 | Regression pins: `add` of an already-queued brief still refuses naming its position; N concurrent writers still never corrupt the queue file (AC-20261013-02-10, AC-20261013-02-11). The three tests asserting the exact `list` row string (list form, virtual reconcile, move numbering) are rewritten to carry the age column, their numbering assertions intact (AC-20261013-02-9, AC-20261013-02-12, AC-20261013-02-13) | The archive adds a second write per persist; the atomic-write pin must still hold on the primary file |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline (.claude/rules/spec-pipeline.md § Planning) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-queue.js | MODIFY | scripts | D1 near-duplicate refusal + `--distinct`; D2 age column + three flags; D3 archive on persist, footer count, `show`/`move`/`done` on archived ids; D4 `groom`; D6 header |
| spec/scripts/lib/queue.js | MODIFY | scripts | D1/D4 `promptTokens(payload)` + `jaccard(a, b)`; D2 `citesDoneSpec(item, ctx)` — pure helpers beside `isItemDone`, so `groom` and `list` share one derivation |
| spec/commands/queue.md | MODIFY | doctrine | D5 `groom` in argument-hint + list; Render sentence; ≤ 55 lines |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 bump via plugin-bump.js |
| tests/queue/queue-hygiene.test.js | CREATE | tests | AC-20261013-02-1, AC-20261013-02-2, AC-20261013-02-3, AC-20261013-02-4, AC-20261013-02-5, AC-20261013-02-6, AC-20261013-02-7, AC-20261013-02-8 |
| tests/queue/spec-queue.test.js | MODIFY | tests | AC-20261013-02-9, AC-20261013-02-12, AC-20261013-02-13 rewrite the three exact-row `list` pins to the age-column form; AC-20261013-02-10, AC-20261013-02-11 retags on the brief-dup-refusal and concurrent-writer tests |

## Contracts

```jsonc
// <git-common-dir>/spec-queue-done.json — written by spec-queue.js only, read by list (count) and show
{ "version": 1, "items": [ { "id": "q12", "kind": "prompt", "payload": "…", "added": "…", "ticked": "…", "archived": "2026-10-13T03:00:00.000Z" } ] }

// spec-queue.json keeps { version, seq, items } — items now hold only not-done rows after any write
```

```
// list row (D2): <n>  <id>  <age>  <payload one line>[  ⏳ after <gate> (<state>)|  ⏳ gate met][  📎 cites done <basename>][  ⌛ stale]
1  q321  8d   merge-back.sh create fails with 'host config cannot be read as JSON' when invoked by…
2  q316  6d   Prototype close refuses on its own planted overlay files: prototype-driver writes src/…  ⏳ gate met
3  q132  7d   Read-only production check after specs/20261006/07 deploys: SELECT count(*) FROM coun…  📎 cites done 07-face-check-copy-and-design-artifacts
— 297 done · move: spec-queue move <ref> <n> · full text: spec-queue show <ref>

// add refusal (D1)
spec-queue: near-duplicate of q321 (score 0.44) — spec-queue show q321; add it anyway with --distinct

// groom (D4)
duplicates (1):
  q321 ~ q322  0.44
cites done (1):
  q132  7d   Read-only production check after specs/20261006/07 deploys: …
gate met (1):
  q316  6d   Prototype close refuses on its own planted overlay files: …
stale (2):
  q302  30d  When the walkthrough service's production environment is deployed: …
  q310  30d  kaigai (its own repo, new session there): write kaigai's own picture command …
fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes
```

```js
// lib/queue.js additions (pure)
promptTokens(payload)       // Set of lowercase [a-z0-9]+ tokens with length >= 4
jaccard(setA, setB)         // |A∩B| / |A∪B|, 0 when both empty
citesDoneSpec(item, ctx)    // first specs/YYYYMMDD/NN…md path in a prompt payload whose ctx.specStatus is done|superseded, else null
```

## Behavior

**Duplicate check order in `add`.** After payload classification and `--after-*` validation,
before any write; only `kind === 'prompt'`; compared against pending prompts of the reconciled
item list (archived and derived-done rows are never candidates). Score ties at 0.35 refuse.
`--distinct` is a bare flag; it is accepted with no duplicate present too.

**Age.** `Math.floor((now − added) / 86 400 000)` days; `added` absent → `?`, and an item with
`?` age is never `⌛ stale`. `now` is the wall clock at run time; tests pass fixture `added`
stamps in the past.

**Archive timing.** The move happens inside `persist` on every write verb (`next`, `add`,
`move`, `done`), never on `list`/`show`/`groom`. `done <ref>` therefore ticks and archives in
one write; the output line is unchanged (`ticked q12`). A corrupt archive file is reported like
a corrupt queue file (exit 2, names the file and the remedy: remove or repair it).

**`groom` and the virtual reconcile.** `groom` reconciles exactly as `list` does (append
missing on-disk briefs virtually) so a brief that `list` shows is visible to `groom` — but
briefs and specs can only appear in `gate met`; the other buckets are prompt-only.

**Not changed.** `spec-status.js` (critical, untouched: it reads the queue file's pending rows
and never the archive); `move`/`--at` numbering; the `--when` grammar; the `next` pick.

## Acceptance Criteria

- **AC-20261013-02-1**: WHEN `add` receives the prompt `merge-back.sh create fails with 'host config cannot be read as JSON' when the script is invoked by a relative path (it requires spec/scripts/lib/host-config.js as a bare module name); resolve its own dir absolutely` while the pending prompt q1 reads `merge-back.sh create fails with 'host config cannot be read as JSON' when invoked by a relative path: its config reader require()s a path built from $0, which Node resolves as a package name. Fix: resolve the lib path absolutely before require; add a test invoking create by relative path.` THE SYSTEM SHALL exit 2 with stderr containing `near-duplicate of q1`, a score ≥ `0.35` printed to two decimals, `spec-queue show q1` and `--distinct`, and SHALL write nothing to the queue file → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-2**: WHEN `add` receives that same prompt with `--distinct`, or a prompt whose best score against every pending prompt is `< 0.35` (e.g. `Decide whether the walkthrough export keeps its PNG step` against q1 above), or a brief number / spec path THE SYSTEM SHALL exit 0 and append the item as today → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-3**: WHEN `list` renders (a) an ungated prompt added 20 days ago, (b) a prompt added 3 days ago whose payload names `specs/20260101/01-done.md` with `status: done` on disk, (c) a prompt gated `--after-spec specs/20260101/01-done.md`, (d) a brief item with no `added` THE SYSTEM SHALL print rows `1  q1  20d  …  ⌛ stale`, `2  q2  3d  …  📎 cites done 01-done`, `3  q3  <n>d  …  ⏳ gate met`, `4  —   ?  brief 05 …` (age column `?`, no flag), each on one line, numbered 1–4 → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-4**: WHEN a queue file holds `[q1 ticked, q2 pending prompt, q3 spec item whose spec is status: done]` and `done q2` runs THE SYSTEM SHALL leave `spec-queue.json` with `items: []`, `seq: 3`, and `spec-queue-done.json` with items q1, q2, q3 in that order each carrying an ISO `archived` stamp (q2 and q1 also `ticked`), and `list` SHALL print `✨ nothing pending · 3 done` → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-5**: WHEN q1 is archived THE SYSTEM SHALL have `show q1` exit 0 printing `q1  prompt · done (archived)` as its first line and the full payload, and `move q1 1` / `done q1` exit 2 with stderr `q1 is archived (done) — nothing to do` → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-6**: WHEN `groom` runs on the AC-3 queue plus a second pending prompt scoring ≥ 0.35 against q1 THE SYSTEM SHALL exit 0 and print, in order, `duplicates (1):` with the row `q1 ~ q5  0.NN`, `cites done (1):` with q2, `gate met (1):` with q3, `stale (1):` with q1, then the footer `fates: spec-queue done <ref> · spec-queue move <ref> <n> · keep — never tick without a yes`, and SHALL leave `spec-queue.json` byte-identical → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-7**: WHEN `groom` runs on a queue of one ungated prompt added today citing no spec THE SYSTEM SHALL exit 0 and print exactly `✨ nothing to groom · 1 pending` → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-8**: WHEN `spec/commands/queue.md` is read THE SYSTEM SHALL contain `groom` in the frontmatter `argument-hint`, a `- \`groom\`` subcommand line, the phrase `never tick` in § Render, and SHALL be ≤ 55 lines (`wc -l`) → writes tests/queue/queue-hygiene.test.js
- **AC-20261013-02-9**: WHEN `list` renders a queue of [q1 brief 24 added 2026-09-03, q2 gated prompt added 2026-09-03, q3 spec item] THE SYSTEM SHALL print rows `1  q1  <age>d  brief 24 (…)`, `2  q2  <age>d  /spec:plan …  ⏳ after 04-reports-write-the-queue (hardened)`, `3  q3  <age>d  spec specs/…` — the age column between id and description, numbering 1–3 unchanged → rewrites tests/queue/spec-queue.test.js :: AC-20260903-03-8: spec-queue list renders
- **AC-20261013-02-12**: WHEN `list` virtually reconciles an unqueued on-disk brief THE SYSTEM SHALL print it as `2  —   ?  brief 08 (b)` after the queued `1  q1  <age>d  brief 05 (a)` — id `—`, age `?` → rewrites tests/queue/spec-queue.test.js :: AC-20260903-03-8: spec-queue list virtually
- **AC-20261013-02-13**: WHEN `move C 1` then `move C 9` run over pending prompts [A, B, C] THE SYSTEM SHALL have `list` print `1  q4  <age>d  task C` first, then after the second move last — numbering follows the move with the age column present → rewrites tests/queue/spec-queue.test.js :: AC-20260903-03-7
- **AC-20261013-02-10**: WHEN `add` receives a brief already queued THE SYSTEM SHALL CONTINUE TO refuse naming its pending position and the move remedy, writing nothing → reuses tests/queue/spec-queue.test.js :: AC-20260903-03-6
- **AC-20261013-02-11**: WHEN N concurrent `spec-queue` invocations write THE SYSTEM SHALL CONTINUE TO leave `spec-queue.json` valid JSON of the `{version,seq,items}` shape → reuses tests/queue/spec-queue.test.js :: AC-20260823-08-review-concurrent-writer-safety

## Assumptions (escalation triggers)

- A1: the 0.35 threshold separates the live queues' only real duplicate (0.44) from every innocent pending pair (max 0.20) — measured at lock over 12 + 24 pending prompts. **if false** (a legitimate add is refused in a host): `--distinct` is the path through; tune the constant in a direct commit with the new pair's score recorded.
- A2: `spec-status.js`'s queue overlay reads `spec-queue.json` items and discards done ones via `isItemDone`; nothing in it or any other script reads ticked rows (grepped at lock: the only other reader of `spec-queue.json` is spec-status.js; its single `ticked` use skips ticked orphans). **if false:** the archive move is gated off until that reader is updated in its own spec — never edit spec-status.js here.
- A3: `tests/queue/spec-queue.test.js`'s `host({queue})` fixture writes the queue file at `.git/spec-queue.json` with controlled `added` stamps. **if false:** extend the fixture with an `added` default; never a second fixture family.
- A4: the `queue` command ceiling is 55 lines and the file is 54 today (`tests/consistency/read-load.test.js`). **if false:** the lower number binds; replace words, never add lines.
- A5: two concurrent writers racing the archive file can each rename their own temp copy, losing the other's archived rows (never the queue file's). **accepted:** the archive is a count and a `show` surface, not pipeline state; the primary file keeps its atomic-write pin (AC-11).

## Rationale

This spec is the downstream half of the queue cleanup. specs/20261013/01 removes the inflow
(review advisories pasted into the queue by hand). What remains is the rot that any
free-text to-do list grows: the same finding added from two sessions, items whose cited work
shipped, gates that opened and nobody noticed, items old enough that the reason is gone.

**Duplicates at add time, not at groom time.** A refusal at the moment of adding costs one
line; a duplicate found a month later costs a reading of both. The threshold is a measured
number, not a guess, and `--distinct` is the honest override for the rare legitimate near-match.
The comparison deliberately excludes ticked prompts: the history shows many exact re-adds after
a tick, and some of those were real reopens.

**Flags on `list` before a groom command.** Both hand consolidations happened because nobody
looked at the list and saw rot; the list is read every session, a groom command is not. The
three flags are the three shapes those consolidations found. `groom` then exists for the
periodic pass, and prints only what the flags already derive, plus pair scores.

**Archive, not delete.** Ticked rows are the record of what was decided done; the exact
duplicates in the history (score 1.00 pairs) are only visible because they were kept. They
simply do not belong in the file every read parses. `seq` stays in the queue file so an
archived id is never reused.

**Why no `--apply`.** Both consolidations found items that were old but alive. The user's
standing rule is one explicit yes per decision; the command doctrine encodes it as ask-per-item.

**Collision closure (lock).** Paths leg: spec-queue.js is executed by tests/queue/*.test.js and
the status overlay tests; three existing `list` pins assert the exact row string (list form, virtual
reconcile, move numbering) — the age column is inserted after the id, so all three are planned
rewrites in `spec-queue.test.js` (AC-9, AC-12, AC-13), numbering assertions kept verbatim. No test pins the `list` footer count or the
queue file's ticked rows after a write (grepped at lock). Literals leg: none retired.

## Canonical Delta

`docs/canonical/status.md`, in the session-queue paragraph, append:

> The queue file holds only live rows: every write moves ticked and derived-done items into
> `spec-queue-done.json` beside it (`show` still resolves an archived id). `add` refuses a
> free-text prompt whose token-set Jaccard against any pending prompt is ≥ 0.35 (`--distinct`
> overrides). `list` prints an age column and flags `📎 cites done <spec>`, `⏳ gate met` and
> `⌛ stale` (≥ 14 days, ungated prompt); `groom` prints the same flags in buckets plus
> duplicate pairs and the two fate commands, read-only — the session proposes one fate per item
> and asks per item. (specs/20261013/02-queue-hygiene.md)
