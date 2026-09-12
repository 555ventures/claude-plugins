---
date: 2026-09-12
status: hardened
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260912/09-a-mock-may-not-invent.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
---

# Seeded data names its source

## Goal

The seed's records are the one set of facts every screen in a journey shares, and today each
screen retypes them. A customer's name is typed on nine screens; the ninth is spelled
differently and nothing notices, because the only check asks whether a screen contains *some*
seed value, never whether the value it shows is the one the record holds. This spec makes a
screen name the record it is showing: a bound element carries `data-record="<entity>[i].<field>"`,
the reference must resolve, the element's text must equal the resolved value, and a
distinctive seed value shown anywhere outside a bound element is refused. Done means a
retyped, misspelled record cannot reach `journey-approved`, and the existing "this journey is
drawn on placeholders" refusal still fires exactly as it does today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A screen binds a record value with `data-record="<entity>[<i>].<field>"` on the element that displays it — `<entity>` the basename of a `design/mocks/records/<entity>.json` file, `<i>` a zero-based index into that array, `<field>` a dot-and-bracket path into the record object (`address.city`, `tags[1]`). The reference must resolve to a string or number; an unresolvable reference is a refusal naming the reference and the first segment that failed (AC-20260912-10-1) | The reference is the only thing that ties nine screens to one fact; a typo in the reference must fail loudly rather than silently bind nothing |
| D2 | A bound element's text — its inner HTML with tags stripped, whitespace collapsed, trimmed — must equal the resolved value exactly. A mismatch is a refusal printing both strings (AC-20260912-10-2) | This is the misspelled-ninth-copy defect; equality on the visible text is the only check that sees it |
| D3 | A **distinctive** seed value occurring in a bound mock's text outside every bound element is a refusal naming the value and the screen. A value is distinctive when it contains a space or is at least eight characters long **and** occurs in exactly one record across all record files; every other seed value is a `⚠️` warn in the same place (AC-20260912-10-3, AC-20260912-10-4) | "Ada Lovelace" and "2026-09-12" are records; "open", "paid" and "active" are words a product's own chrome legitimately uses, and refusing them would make the rule unusable |
| D4 | The three rules bind on the same predicate spec 09 D2 establishes — a labelled, non-canon mock that links the wire register — as warns at `journey-drawn` and refusals at `journey-approved` `[no-ac: the predicate is spec 09's and carries its own criterion there; each rule it binds carries its own criterion here]` | One binding predicate across the mock gates, never a second one that drifts from the first |
| D5 | The existing `recordValues`/`recordHits` journey-level checks are unchanged: a screen with zero hits still prints `⚠️ <label>: carries none of the seed's records`, and a journey whose every screen has zero hits still refuses. `recordHits` continues to read the mock's source (AC-20260912-10-5) | Binding does not replace the placeholder check — a journey drawn entirely on lorem ipsum binds nothing and would otherwise pass every new rule vacuously |
| D6 | The ruling is recorded as an amendment ADR carrying an `Applies to` entry for `docs/adr/0013-client-rehearses-the-journey.md`, whose records paragraph is amended in place to say a screen names the record it shows; ADR-0013 gains the matching `Amended by` backlink `[no-ac: an ADR records a ruling; every behavioural half of it is carried by D1–D5]` | ADR-0013 currently says the check "is about drawing with the seeded data instead of lorem ipsum, never about where that data came from" — this spec overturns the second half |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mock-seed-checks.js | MODIFY | scripts | D1–D3 `resolveRecordRef(records, ref)`, `boundBindings(html)`, `distinctiveValues(recordsByEntity)` and `recordBindingViolations(html, label, recordsByEntity)`; pure, no `fs`, joining the existing `edgeGaps`/`recordValues`/`recordHits` exports |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D4 the per-screen binding pass at `journey-drawn` (warns) and `journey-approved` (refusals), run after the edge-gap check and before the record-hit check so a screen is named for its worst problem first |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1–D5 § Mocks: Authoring Rules' "Screens carry the seed's records" bullet gains the binding grammar and the three rules; § Mocks: Seed's `## Records` paragraph names the binding convention |
| spec/templates/mocks-canon.md | MODIFY | doctrine | D1 one line in the rules section: a screen names the record it shows |
| docs/adr/0013-client-rehearses-the-journey.md | MODIFY | other | D6 the records paragraph amended; an `Amended by` backlink added |
| docs/adr/0018-seeded-data-names-its-source.md | CREATE | other | D6 the amendment ADR. Take the next free number if 0018 is claimed by a sibling and amend every mention in this spec in the same build |
| tests/mocks/record-binding.test.js | CREATE | tests | AC-20260912-10-1, AC-20260912-10-2, AC-20260912-10-3, AC-20260912-10-4 |
| tests/mocks/mocks-driver-seed-records.test.js | MODIFY | tests | AC-20260912-10-5 — the journey-level placeholder refusal, currently unpinned |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | `writeWireframe` and every fixture writing a screen that shows a record value bind it with `data-record`, so downstream callers stay green under D2/D3 |
| spec/.claude-plugin/plugin.json | MODIFY | other | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` — never a hand-edited version literal |

## Contracts

### The binding

```html
<span data-record="customers[0].name">Ada Lovelace</span>
<td data-record="customers[2].address.city">Reykjavík</td>
<span data-record="orders[1].tags[0]">rush</span>
```

Grammar: `<entity>` matches `[a-z0-9][a-z0-9-]*` and names `design/mocks/records/<entity>.json`;
the path that follows is a run of `.<key>` and `[<n>]` segments. The first segment is always a
bracketed index into the entity's top-level array.

The attribute is matched as `data-record\s*=` exactly, never as a prefix: the client walk page
already stamps `data-recorded="<date>"` on a signed-off exclusion card
(`spec/scripts/lib/walk-page.js`), and a prefix match would read every one of those as a
malformed binding.

### `spec/scripts/lib/mock-seed-checks.js` — added exports

```js
resolveRecordRef(recordsByEntity, ref)
//   -> { value: <string> } when the reference resolves to a string or number
//   -> { error: '<reason>' } naming the first failing segment otherwise
boundBindings(html)
//   -> [{ ref, text, start, end }] one per element carrying data-record, `text` being the
//      element's inner HTML with tags stripped, whitespace collapsed and trimmed, and
//      [start,end) the element's span in the source
distinctiveValues(recordsByEntity)
//   -> Set of the values a stray occurrence of is refused rather than warned (D3)
recordBindingViolations(html, label, recordsByEntity)
//   -> { violations: [<message>], warns: [<message>] }
```

### Messages

```
<label>: data-record="customers[9].name" does not resolve — records/customers.json holds 3
  records
<label>: data-record="customers[0].nmae" does not resolve — the record has no field "nmae"
<label>: data-record="customers[0].name" shows "Ada Lovelance" but the record says
  "Ada Lovelace" — bind the record, never a retyped copy
<label>: "Ada Lovelace" appears outside any data-record element — a screen names the record it
  shows
  ⚠️ <label>: "open" appears outside any data-record element — bind it if it is the record's
     value rather than the product's own word
```

## Behavior

`recordsByEntity` is built once per `journey-drawn`/`journey-approved` run by reading every
`design/mocks/records/*.json` the seed's `## Records` section names — the same files
`recordValues` already walks — keyed by basename. A record file that fails to parse is already
refused at `seed-done`, so this pass may assume well-formed input and treats an unreadable file
as an empty entity rather than crashing.

The stray-value sweep (D3) works on the mock's text with tags stripped, and computes each bound
element's span first so an occurrence inside a binding is never also reported as stray. An
element that binds a value which legitimately appears twice on the screen — a name in a header
and again in a list row — needs both occurrences bound; that is the intended cost, and it is
the mechanism by which the two copies can never diverge.

Ordering relative to the existing checks: the edge-gap check runs first (a journey whose
screens do not connect is not worth reading for data), then this binding pass per screen, then
the record-hit check. A screen failing the binding pass is named for that and not also counted
as a placeholder screen.

D3's distinctiveness test is computed across every record file, not per entity: a status word
shared by two entities occurs in more than one record and is therefore never refused, which is
the behaviour that keeps the rule usable on products whose records share vocabulary.

## Acceptance Criteria

- **AC-20260912-10-1**: WHEN a bound mock carries `data-record="customers[9].name"` against a
  `records/customers.json` holding three records THE SYSTEM SHALL refuse at
  `journey-approved`, naming the reference and the record count; and WHEN it carries
  `data-record="customers[0].nmae"` against a record whose fields are `name` and `city` it
  SHALL refuse naming the missing field `nmae` → writes tests/mocks/record-binding.test.js
- **AC-20260912-10-2**: WHEN a bound mock carries
  `<span data-record="customers[0].name">Ada Lovelance</span>` against a record whose `name` is
  `Ada Lovelace` THE SYSTEM SHALL refuse at `journey-approved` printing both strings; and WHEN
  the element's inner HTML is `<b>Ada</b> Lovelace` against that same record it SHALL report
  nothing — tags are stripped and whitespace collapsed before the comparison
  → writes tests/mocks/record-binding.test.js
- **AC-20260912-10-3**: WHEN a bound mock's text contains `Ada Lovelace` outside every
  `data-record` element, against records where that value occurs in exactly one record, THE
  SYSTEM SHALL refuse at `journey-approved` naming the value and the screen's label; and WHEN
  the same value appears only inside a correctly bound element it SHALL report nothing
  → writes tests/mocks/record-binding.test.js
- **AC-20260912-10-4**: WHEN `distinctiveValues` is computed over a record set containing
  `Ada Lovelace` (one record), `open` (one record) and `Reykjavík` (two records) THE SYSTEM
  SHALL return a set containing `Ada Lovelace` alone — `open` fails the space-or-eight-character
  test and `Reykjavík` occurs in more than one record — and a stray occurrence of `open` SHALL
  produce a `⚠️` warn rather than a violation
  → writes tests/mocks/record-binding.test.js
- **AC-20260912-10-5**: WHEN `--mark journey-approved` runs over a journey whose every screen
  contains no value from any `design/mocks/records/*.json` THE SYSTEM SHALL CONTINUE TO refuse
  with `journey "<j>": no screen carries a value from design/mocks/records/*.json — draw with
  the seed's own records, then re-mark`, and WHEN exactly one screen of that journey carries a
  record value it SHALL CONTINUE TO print `⚠️ <label>: carries none of the seed's records` for
  each of the others and complete the mark
  → rewrites tests/mocks/mocks-driver-seed-records.test.js :: seed-done accepts

## Assumptions (escalation triggers)

- A1: The journey-level record checks have no live test — specs/20260910/06's coverage expired
  at that spec's close. **Executed 2026-09-12**: `grep -rn "carries none of the seed|no screen
  carries a value|recordHits|recordValues" tests/` returns zero hits. **If false:**
  AC-20260912-10-5's disposition becomes `reuses` against the surviving test and
  `tests/mocks/mocks-driver-seed-records.test.js` stays a MODIFY row for the AC tag alone.
- A2: `tests/mocks/mocks-driver-seed-records.test.js` exists and holds the titles `seed-done
  accepts` and `seed-done refuses`. **Executed 2026-09-12** via `count-tests --titles --file`.
  **If false** (an expiry sweep removed it between lock and build): recreate it fresh carrying
  only this spec's own pin, record the row's action as a deviation, and never restore expired
  pins.
- A3: `design/mocks/records/<entity>.json` is a JSON array of at least three record objects and
  `seed-done` already refuses anything else, so this pass may assume well-formed input
  (spec/doctrine/mocks.md § Mocks: Seed). **If false:** treat an unparseable file as an empty
  entity and never crash a mark on it.
- A4: Binding every occurrence of a repeated value is an acceptable authoring cost.
  **If false** (a real journey shows one record value more than a handful of times per screen):
  narrow D3 to the first occurrence per value per screen and record the narrowing in Decisions
  — never drop the refusal to a warn, which is the option JJ ruled against at plan time.
- A5: `docs/adr/0018-*` is free. **If false** (a sibling claims it first): take the next free
  number and amend the File Plan row, D6 and every backlink in the same build.
- A6: `tests/mocks/mocks-driver-fixtures.js` is edited by all three specs in this series.
  **If false** — a sibling's edit lands differently than planned — re-read the file at build
  Phase 0 rather than applying this spec's edit to the pre-image it was written against.

## Rationale

The existing check asks the weakest possible question: does this screen contain any seeded
string at all. It was written to catch lorem ipsum and it does that well, which is why D5 keeps
it untouched. It cannot catch the thing that actually breaks consistency, which is nine copies
of one fact drifting apart, because a drifted copy is simply not a seed value any more and the
check has nothing to match it against.

Binding by reference inverts that: once a screen must say which record it is showing, the
comparison becomes exact and the drifted copy is the only thing that fails. The design
deliberately keeps the visible text in the markup rather than substituting it at serve time —
the mocks are read, reviewed and captured as static files, the client walks the same bytes, and
a screen whose content only appears when a server renders it would break the review page, the
capture path and the ability to open a mock in a browser.

D3's distinctiveness test is the part that makes the rule survivable. `recordValues` collects
every string of three characters or more, which on a real seed includes status words the
product's own buttons use. Refusing every one of those would force authors to bind the word
"open" on a button that opens something. Requiring a space or eight characters, plus uniqueness
across all records, keeps names, dates, addresses and identifiers in the refusal set and leaves
vocabulary in the warn set. The alternative considered and rejected was edit-distance matching
to catch near-misses directly; it trades a clean mechanical rule for a threshold nobody can
defend, and the binding requirement reaches the same defect without it.

What to watch: this is the third spec in one series to edit the shared mock fixtures, and it is
a new refusal over permissive behaviour — the class that historically strands fixtures outside
the File Plan. Every fixture that writes a screen showing a record value must bind it, and the
repair is to make the fixture do what a real session will do, never to strip the value so the
rule cannot reach it.

Collision closure run at lock over `recordHits` and `data-record`. Every `recordHits` hit is
already a File Plan row except `docs/canonical/design.md`, which the Canonical Delta targets.
The `data-record` hits are **not collisions and are waived, verified**: both
(`spec/scripts/lib/walk-page.js`, `design/client-mocks/walk.html`) spell `data-recorded`, the
client walk's sign-off stamp, caught only because the grep is a substring match — which is
exactly why Contracts pins the attribute match to `data-record\s*=`.

## Canonical Delta

`docs/canonical/design.md` § The mocks command (2026-09-02, specs/20260902/07) gains: a screen
names the record it shows. An element displaying a seeded value carries
`data-record="<entity>[i].<field>"` pointing into `design/mocks/records/<entity>.json`; the
reference must resolve and the element's visible text must equal the resolved value exactly. A
distinctive seed value — one containing a space or at least eight characters long, occurring in
exactly one record — shown outside every bound element is refused; any other stray seed value is
warned. The rules warn at `journey-drawn` and refuse at `journey-approved`, on the same bound-mock
predicate the invention checks use. The older journey-level checks are unchanged: a screen with
no seeded value at all is warned, and a journey whose every screen has none is still refused.
