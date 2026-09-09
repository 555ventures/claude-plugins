# {NNNN}. {Title}

- Status: {proposed | accepted | superseded by ADR-{NNNN}}
- Date: {YYYY-MM-DD}
- Archetype: {archetype} · Audience: {localeScope}
- Deciders: {user} + session (one proposer over live research)

## Context

{The forces at play — project goal, archetype, audience/locale, hard constraints. Why a
decision is needed now and what is irreversible-ish about it.}

## Options considered

- **{Option A}** — {one-line characterization, with the evidence the research surfaced}
- **{Option B}** — {one-line characterization}

## Decision

{The chosen option, stated plainly, and the single most important reason it won.}

## Consequences

- {What this makes easier}
- {What this makes harder / what we explicitly accept}

## Applies to

{Post-genesis amendment ADRs only — genesis-time ADRs write the literal line "None: genesis
decision, carried by briefs' Grounding at authoring time." One row per roadmap brief this
decision amends: `NN-{name} — {one line: what changes there}`. The propagation contract:
the effects are edited into every listed brief **in the same session that writes this ADR**
— never left as a pointer for later. An unplanned brief is edited in place (Scope /
Out of scope / Open questions), gets an `Amended by ADR-{NNNN} — {one line}` line in its
Grounding, and superseded lines are ~~struck~~ `(superseded by ADR-{NNNN})`, not deleted.
Edit-in-place is the default for every brief, planned or shipped. A letter-suffixed successor
brief (`NNa-{name}.md`, `Depends on: NN`) is minted only when the brief's PREMISE changed —
a reader of the old brief's Context would now draw the wrong PRODUCT conclusion, not merely
find its mechanics out of date — and the successor is listed here. This section is the only
amendment record: an ADR carries no backward `Amended by:` line of its own, and /spec:doctor
audits the forward direction only.}

## Dissents

{REQUIRED — must be non-empty, or the literal line: "None: no minority option surfaced for
{dimension}." Record any minority position the research menu or a user rejection surfaced —
verbatim option + its core rationale — even though it was not chosen, so the ADR preserves the
option space and reasoning available at decision time, not just the winner. The genesis state
gate and /spec:doctor check that this section is present.}
