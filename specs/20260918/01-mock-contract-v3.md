---
date: 2026-09-18
status: implementing
tier: standard
area: mocks
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
build_base: main
diff_base: ae0336ba8118233bdbbd93335005f970a032dade
---

# Mock contract v3

## Goal

`@555-ventures/mock-review` is going to contract 3 (`mock-review` repo,
`specs/20260918/01-04`): it retires `design/decisions.json` and `approval.theme`, removes the
screen-approve and theme controls from the served page in favour of a `mock-review approve --screen`
verb, and adds a `waive` verb so the package becomes the only program that writes a design document.
This spec is the plugin's half. It moves `spec/templates/mock/contract.json` to 3, replaces the
driver's own `approval.json` write with a call to the new verb, and corrects every doctrine sentence
that still tells a session to approve "on the served page" or to pick a theme there. Done means a
host on the v3 package runs the mocks and design stages with no contract-skew refusal, and no
JavaScript in this repo writes a design document.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/mock/contract.json`: `contractVersion` → `3`; `verbs` gains `approve` and `waive`; the `host` block loses `decisions`; the `shapes` block loses `decisions` (AC-20260918-01-1) | `lib/mock-cli.js`'s `contractOrDie` compares this number against `contract --json` and refuses on any difference, so this file IS the handshake. The verbs and host paths are read by humans and sessions, not by code, but a contract that lists a retired document is how the next planning session re-derives the wrong surface |
| D2 | `spec/scripts/mocks-driver.js`: `writeApprovalRaw` (`:335`) is deleted and the `client waive` path calls `run(appDir(), 'waive', ['--journey', j, '--reason', reason, '--beats', hash])` — `run` is exported from `lib/mock-cli.js:178` and joins the `{ contractOrDie, checkJson, loadContract }` destructure at `mocks-driver.js:93`, which does not bind it today. `cmdClientWaive` (`:710-725`) calls `contractOrDie(appDir())` FIRST — today only `cmdClientOpen` (`:700`) does, so without it a skewed package could receive a `waive` it does not implement. The failure path handles both `r.error` (the spawn never ran — `dieEnoent()`, as the other call sites do) and `r.status !== 0` (it ran and refused — surface its stderr). The driver keeps computing the beats hash from the seed exactly as today; only the write moves (AC-20260918-01-2, AC-20260918-01-3) | It is a plain `writeFileSync` — not even atomic — against a file the package now serialises behind a cross-process lock, so it is the one writer that can still tear a document. Moving the write rather than reimplementing the lock protocol here keeps one protocol in one repo |
| D4 | Doctrine and commands stop saying approval is set on the page. `spec/doctrine/stages/stage-design.md:85-89` and `spec/commands/sketch.md:104-116` and `:139` name `mock-review approve --screen <name>`, run by the session on the user's literal `approve` reply; `spec/doctrine/design.md:31-37` names the same writer; `spec/doctrine/mocks.md:209` drops `[--decision <d>]`, `:231-239` lists exactly what is gone from the page (screen approve and theme pick). The same edit must DEFINE the surviving role: ADR-0029 says the page has two actors, client and session, while the package keeps owner-only conversation closers and a Components page — the doctrine names that role explicitly (the loopback human at the machine running `serve`) or the contradiction outlives this series, and `:245-251` describes the waive verb; `spec/scripts/mocks-driver.js:146` and `:149` stop saying "recorded on the served page" and "pick on the page" `[no-ac: prose with no runtime surface; AC-20260918-01-5 pins that the two repos' texts agree]` | The contradiction this whole series resolves lives in prose: one stage abolished the operator's page controls while two others still instruct the session to use them. Leaving the sentences would re-create the ambiguity for the next reader of the doctrine |
| D5 | `spec/templates/mock/mock.config.ts:2-3` and `spec/scripts/lib/mock-cli.js:19-23` comments follow the new contract, and the fixtures in `tests/mocks/mock-app-fixtures.js` — the stub binary's `contract` answer and the `defaultApproval`/`defaultNotes` documents — move to 3, with `defaultApproval` losing `theme` (AC-20260918-01-1, AC-20260918-01-6) | `mock-app-fixtures.js` and `mock-driver-states.test.js` live at this repo's ROOT under `tests/mocks/`, not under `spec/` like everything else listed here — worth stating, because every other path in this spec is `spec/`-relative |
| D6 | This spec lands **after** the package's `specs/20260918/04-contract-v3.md` is merged and before the 3.0.0 publish. Between the two landings, the package's own `[env: SPEC_PLUGIN_ROOT]` live-template tests are red and its end-to-end driver leg skips on skew — expected, and closed by this spec `[no-ac: cross-repo sequencing]` | `contractOrDie` makes any skew a hard refusal, so there is no ordering in which both repos are green throughout. Naming which window is red, and why, is what stops someone "fixing" it in the middle |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/mock/contract.json | MODIFY | doctrine | D1: version 3, `verbs` + `approve`/`waive`, `host` and `shapes` lose `decisions` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2 `writeApprovalRaw` deleted and `client waive` routed through the verb; D4 the two stale remedy sentences at `:146`, `:149` |
| spec/scripts/lib/mock-cli.js | MODIFY | scripts | D5: the contract comment at `:19-23` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D4: `:209` drops `--decision`; `:231-239` lists what is gone; `:245-251` describes the waive verb |
| spec/doctrine/design.md | MODIFY | doctrine | D4: names the approve verb as the writer |
| spec/doctrine/stages/stage-design.md | MODIFY | doctrine | D4: `:85-89` replaces "re-approve on the served page" with the verb |
| spec/commands/sketch.md | MODIFY | doctrine | D4: `:104-116` exit condition and `:139` Rules line name the verb |
| spec/templates/mock/mock.config.ts | MODIFY | doctrine | D5: the header comment's contract reference |
| spec/.claude-plugin/plugin.json | MODIFY | other | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` — never hand-edited; `plugin-bump.js --check` is the gate oracle |
| tests/mocks/mock-app-fixtures.js | MODIFY | tests | D5: stub contract answer and default documents move to 3; `defaultApproval` loses `theme`; the stub binary gains a `waive` branch recording its argv and honouring a controllable exit code, plus the helpers AC-2 and AC-3 read it through — without it AC-2 is red for the wrong reason (`unknown verb`) and can never go green |
| tests/mocks/mock-driver-states.test.js | MODIFY | tests | AC-20260918-01-2, AC-20260918-01-3; also the retired-verb text table (`:676-682`) whose `stop` row expects `approvals are recorded on the served page` and whose `theme` row expects `pick on the page` — both texts change with D4 |
| tests/mocks/mock-contract.test.js | MODIFY | tests | AC-20260918-01-1, AC-20260918-01-6 |
| tests/mocks/mock-cli.test.js | MODIFY | tests | D1: `:13-36` pins a 3-stub-vs-2-template refusal and a 2-stub match; both invert — the stub numbers become 4-vs-3 and 3 matches, the pinned-remedy regex becoming `@3` |
| tests/consistency/design-stage-doctrine.test.js | MODIFY | tests | AC-20260918-01-5 |

## Contracts

```jsonc
// spec/templates/mock/contract.json
{
  "contractVersion": 3,
  "package": "@555-ventures/mock-review",
  "bin": "mock-review",
  "verbs": ["contract", "sweep", "answer", "approve", "waive", "check", "serve"],
  "host": {
    // ... unchanged, MINUS: "decisions": "design/decisions.json"
  },
  "shapes": {
    // ... unchanged, MINUS the "decisions" entry
  }
}
```

```js
// spec/scripts/mocks-driver.js — the client waive path, replacing writeApprovalRaw
run(appDir(), 'waive', ['--journey', j, '--reason', reason, '--beats', beatsHash])
```

## Behavior

**A host on the wrong pair.** `contractOrDie` runs before anything trusts the CLI and dies naming
both numbers with the pinned-major install remedy. That is the intended experience for the window
between the package landing and this spec landing, and for any host that upgrades only one side.

**A host with pre-v3 documents.** The package reports them unreadable and refuses every write. This
driver's own raw readers are unaffected: they `JSON.parse` and never check `contractVersion`, so
they will happily read a v2 document the package will no longer write to. That asymmetry is
harmless here — the driver reads for counts, and every write goes through the package — but it is
why this spec does not touch them.

**Waiving a journey.** Unchanged from the session's point of view: the same command, the same
reason, the same beats hash. The bytes now arrive through the package, under its lock, stamped at
the current contract version.

## Acceptance Criteria

- **AC-20260918-01-1**: WHEN `mock-cli`'s `contractOrDie` runs against a stub reporting
  `contractVersion: 3` THE SYSTEM SHALL proceed, and against one reporting `2` it SHALL die naming
  both numbers (`contract 2 ≠ 3`) → rewrites tests/mocks/mock-contract.test.js :: AC-20260917-01-15:
- **AC-20260918-01-2**: WHEN the driver's `client waive --journey <j> --reason <r>` path runs THE
  SYSTEM SHALL invoke the package's `waive` verb with `--journey`, `--reason` and `--beats`, and
  SHALL NOT itself write `design/approval.json`
  → rewrites tests/mocks/mock-driver-states.test.js :: AC-20260917-01-11:
- **AC-20260918-01-3**: WHEN the `waive` verb exits non-zero THE SYSTEM SHALL surface its stderr as
  the driver's refusal rather than reporting the journey waived
  → writes tests/mocks/mock-driver-states.test.js
- **AC-20260918-01-5**: WHEN the consistency suite compares command text against doctrine THE SYSTEM
  SHALL find `mock-review approve --screen` in both, and SHALL NOT find the retired phrases
  `approvals are recorded on the served page`, `pick on the page` or `--decision`
  → rewrites tests/consistency/design-stage-doctrine.test.js :: AC-20260914-02-8:
- **AC-20260918-01-6**: WHEN the stub host's `defaultApproval` and `defaultNotes` fixtures are
  written THE SYSTEM SHALL emit `contractVersion: 3` and no `theme` key, so the package's own
  `plugin-shapes` guard keeps parsing them → writes tests/mocks/mock-contract.test.js

## Assumptions (escalation triggers)

- **A1** — The package's `specs/20260918/04-contract-v3.md` lands first and ships the `waive` verb
  with the flags D2 uses. — **if false:** this spec's driver change has nothing to call; STOP and
  sequence the two repos.
- **A2** — `mockCli.run` returns the child's status and stderr, so D2's failure path is available
  without new plumbing. Verified by reading `spec/scripts/lib/mock-cli.js:77-83`. — **if false:**
  AC-20260918-01-3 needs a small addition to `mock-cli.js` and that becomes a File Plan row.
- **A3** — `tests/mocks/mock-app-fixtures.js`'s stub binary answers `contract` from a literal that
  the fixtures control, so moving it to 3 does not require the real package to be installed.
  Verified by reading. — **if false:** the mocks suite needs the published 3.0.0 and this spec waits
  for the release rather than preceding it.
- **A4** — No consumer outside this repo reads `spec/templates/mock/contract.json`. — **if false:**
  that consumer joins the landing.

## Rationale

The package cannot land its half honestly without this one: four of its acceptance criteria are
environment-gated on a plugin checkout, and its end-to-end leg skips while the two numbers differ.
Putting the plugin's edits in the package's spec — as the first draft did, under "the orchestrator's
duty" — would have given ten files no worker, no wave and no diff in the review stage's evidence,
in a worktree that does not even contain them.

An earlier draft also made `genesis-driver.js`'s two silent design-document readers refuse loudly,
on the reasoning that the version flip would make every pre-v3 host hit that path. That reasoning
was wrong — a pre-v3 document is still valid JSON, and those readers only `JSON.parse` — so the
defect is real but unrelated to this contract change. It is queued as its own spec rather than
carried here.

What to watch: D2's failure path. The driver currently cannot fail at this step — a `writeFileSync`
either works or throws — whereas a child process can exit 2 with a sentence. AC-20260918-01-3 exists
because the obvious implementation ignores the status and reports the journey waived.

## Canonical Delta

`docs/canonical/design.md` and `docs/canonical/genesis.md` — the design stage's approval sentence
becomes: per-screen approval is recorded by `mock-review approve --screen <name>`, run by the
session on the user's explicit `approve`, never by a control on the served page; the page carries no
operator-only control. The mocks stage's waive sentence becomes: `client waive` calls the package's
`waive` verb, and no script in this repo writes a design document. Contract version 3 retires
`design/decisions.json` and `approval.theme`; the theme a host renders is the one its
`mock.config.ts` declares.
