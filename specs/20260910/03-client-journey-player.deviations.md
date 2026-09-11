# Deviations — 20260910/03-client-journey-player

- File Plan filename collision (tests row): the File Plan names
  `tests/mocks/mocks-driver-client-2.test.js` for AC-20260910-03-7/-8, but that path already
  exists — it is specs/20260910/01-contention-proof-budget-and-uncapped-suite.md's D3
  file-budget split, holding AC-20260907-10-11/-22/-14/-15/-16. Per this repo's spec-pipeline
  Gotcha for a literal target that races a concurrent sibling, this batch takes the next free
  name instead of overwriting an unrelated sibling's file:
  `tests/mocks/mocks-driver-client-3.test.js`. The spec's own File Plan row and Rationale
  ("... this spec's AC-7 fixture writing walk.json confirmed") should be amended to the corrected
  filename at build/close.

- AC-20260910-03-5's own worked example is internally inconsistent with D5: the AC bullet writes
  the cold-root `GET /client/__walk/state?journey=onboarding` response literally as
  `{reached:['signin'],misses:[],confirmedAt:null,sentence:null,waived:null}`, but D5's own
  parenthetical defines the no-record default as `{reached:[], misses:[], confirmedAt:null,
  sentence:null}` (empty `reached`, and it omits `waived` entirely, though the Contracts block's
  `GET ... → 200 {reached, misses, confirmedAt, sentence, waived}` line implies `waived` is
  always a field of the response shape). `tests/mocks/client-walk-route.test.js`'s AC-5 test
  pins the Decision's stated default — `{reached: [], misses: [], confirmedAt: null, sentence:
  null, waived: null}` — over the AC bullet's literal `reached:['signin']`, since the Decisions
  table is the authoritative surface a worker applies verbatim and the AC's own worked example
  reads as a copy/paste slip (there is no stated mechanism anywhere in D1-D11 by which the first
  screen becomes "reached" without a client event). Flagging per this repo's "AC example vs
  Decision" class of stale-assumption risk rather than guessing which side is intended;
  reconcile the AC bullet's literal to match D5 at build or review.

- A2 confirmed false, per its own stated remedy: `lib/mocks-ledger.js`'s `appendAssumption` does
  not derive an id itself — the caller always supplies one (verified against the current source:
  `validateAssumptionInput`/`appendAssumption` take `row.id` as given, never generate it). D6's
  client-promoted row therefore derives its own next free id with a dedicated prefix, `C<n>`
  (`design-atlas.js`'s `nextClientLedgerId`), the same way `mocks-driver.js`'s own `nextLedgerId`
  derives `P<n>` for its picks-originated rows — never the bare "P"/plain-numeric scheme, so a
  client-promoted row's id can never collide with one `ledger add` or a stop assigns.

- D7's own precondition growth on `--mark approved` (documented in the spec's Rationale as an
  accepted, additive collision "covered by spec 04's fixture row") reddens every existing test
  that reaches `approved` through `tests/mocks/mocks-driver-fixtures.js`'s shared
  `advanceToApproved` helper — that helper is not in this spec's File Plan (owned by the
  plugin-tests layer) and was not updated in this build pass to also write a confirmed
  `walk.json` record before marking approved. Observed casualties at build time:
  `tests/mocks/mocks-driver-walk.test.js`, `tests/mocks/mocks-driver.test.js`, and
  `tests/mocks/mocks-notes.test.js` (each via `advanceToApproved`/`advanceToJourneyApproved`
  callers that continue on to `approved`). Left unfixed here per the spec's own Rationale
  ("the series lands in order"); the fixture fix belongs with
  specs/20260910/04-theme-before-the-client-walk.md or an explicit fixture-repair pass, not a
  script-layer workaround.

- D7 collision, resolved in this build rather than deferred. The spec's Rationale closes the
  `advanceToApproved` collision by citing "spec 04's fixture row", but that row
  (specs/20260910/04's `advanceToThemePicked`) is about theme composition and writes no
  `walk.json` — it would not have repaired this, and spec 04 is still `hardened`. D7's new
  refusal is the pipeline rules' seventh collision trigger verbatim (a Decision that ADDS A
  REFUSAL where the old behavior was permissive; shared setups that legally did nothing now trip
  it): 16 tests across eight files reddened, none in the File Plan. Per that gotcha's own remedy
  every stale setup entered the File Plan as a fix row — one shared helper
  (`confirmEveryJourney`, going through lib/mocks-walk.js rather than hand-writing walk.json) plus
  seven call sites that build their own chains. No assertion was weakened: each repaired setup
  now satisfies every precondition EXCEPT the one its test pins, which is what those tests always
  intended to isolate.

- D7 ordering, corrected in this build. D7 says the new refusal runs "before the ledger gate".
  It was first placed ahead of the notes gate as well, which displaced four pre-existing refusal
  pins (an unresolved-note refusal, a walk-finding refusal, a render-gate prefix, and the
  `stop open signoff` message). Moved to sit between `requireNotesResolved` and
  `requireGateOpen` — literally before the ledger gate, as D7 states, with every prior refusal
  keeping its precedence.
