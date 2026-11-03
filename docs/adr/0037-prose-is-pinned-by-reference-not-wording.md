# 0037. Prose is pinned by reference, not wording

- Status: accepted
- Date: 2026-11-01
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261101/04-the-suite-pins-references-not-wording.md)
- Applies to: core.md § Doctrine Authoring; the test-rule surfaces that restated its ban
- Amended by: specs/20261103/05-tests-that-earn-their-keep.md

## Context

The rule "never by regexes over prose" was added in the v7 consolidation (2026-08-17) with no
ADR. Its evidence is in the pipeline rules § Gotchas: one reflow split a literal and broke a
pin, one added `id` attribute broke four pins, one narrowed enum reddened 25 tests across eight
files, and a single-quote-form regex was evaded by retyping one quote. A prose pin is fragile
(breaks on edits that change no meaning), evadable (a synonym passes it), and a second copy of
the rule. Incident Policy wants guards to be scripts.

The ban was too broad. Doctrine is the program an LLM executes and cannot run in CI, so the
blanket ban left it no mechanical guard. The suite ignored the ban (about 180 prose pins across
30 files) and the test agent prescribed the opposite. Three pin kinds survive because an
executor cannot paraphrase them: a reference (path, flag, heading), a retired phrase, and a
protocol token printed verbatim. Wording-of-intent pins are the class the ban was right about;
intent is guarded by `/doctrine-review`, which reads every doctrine diff.

## Decision

Prose is pinned for three things only: references it must keep, phrases it must no longer
contain, and protocol tokens an executor prints verbatim. A pin on the wording of a rule is not
a test. Pins are sliced by heading with `section` and spelled with `phrase` from
`tests/helpers.js` so a reflow never reds them. The 51 wording pins found at plan time are
deleted, not kept as golden snapshots; existing keeper pins stay in place. Every other surface
that stated the ban shrinks to a pointer at core § Doctrine Authoring.

Amendment (specs/20261103/05-tests-that-earn-their-keep.md): the kinds narrow to two — references and
protocol tokens. A retired phrase is checked once at review through `[oracle: literals]` and leaves no test.

## Consequences

- Wording changes no longer red the suite; intent is read by `/doctrine-review`.
- A rule that matters enough to guard mechanically gets a script, not a wording pin.
- The pipeline rules § Gotchas keep their "dense regex pins" history untouched.
