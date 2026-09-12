# 0016. The wireframe register is the whole shadcn set

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/08-the-register-is-the-whole-shadcn-set.md)
- Applies to: docs/adr/0013-client-rehearses-the-journey.md — the § Context bullet "The
  register is shadcn's Neutral theme" and the § Decision "The client walks themed screens"
  paragraph, both of which said the wireframe register carries eleven roles. Both are amended
  in place to say eighteen colour roles under shadcn's own names; nothing else in ADR-0013
  changes.
- Amended by: —

## Context

ADR-0013 fixed the client's surface as a rehearsal player and, in passing, fixed the wireframe
register as "shadcn's Neutral theme" on eleven roles: `wire-tokens.css` named `--bg`, `--fg`,
`--muted`, `--muted-bg`, `--border`, `--primary`, `--primary-fg`, `--ring`, `--radius`, `--font`,
`--shadow` — a plugin-local spelling, not shadcn's own. `--muted` carried the opposite meaning
shadcn gives it (a text colour here, a surface there in shadcn), and eight of shadcn's eighteen
colour roles had no name in the register at all. A theme candidate built from any shadcn
generator — or copied from shadcn's own registry — does not declare these eleven names; it
declares shadcn's eighteen, so the role-completeness leg either refuses a wholly compliant
theme or, if the leg is loosened to let it through, ten roles get invented at build time with no
error and `--muted` silently swaps text and background.

specs/20260912/08-the-register-is-the-whole-shadcn-set.md closes that gap by making the register
shadcn's Neutral register verbatim — shadcn's own eighteen colour-role names and shadcn's own
`oklch()` values, fetched from `https://ui.shadcn.com/r/colors/neutral.json` — plus `--radius`
and three pipeline-local roles (`--font`, `--shadow`, `--shadow-lg`) that are not shadcn's own
but are re-valued by a theme the same way. That is a wider register than ADR-0013 described, so
ADR-0013's own words about it must be narrowed by an accepted record rather than a silent edit —
the precedent set by ADR-0011, ADR-0014 and ADR-0015 for a locked record a later spec needs to
change.

## Options considered

- **A. Leave ADR-0013's "eleven roles" wording standing and let the spec's own Decisions table
  be the current truth.** Rejected: a reader who opens ADR-0013 for "what does the register
  cover" would be told a number the register no longer has, with no pointer to what superseded
  it — exactly the silent-drift failure the roadmap-amendment convention exists to prevent.
- **B. Rewrite ADR-0013's Context and Decision text in place, with no `Applies to`/`Amended by`
  backlink.** Rejected: ADR-0013 is an accepted record of a ruling; rewriting its prose without a
  trace erases the fact that a ruling changed, which is what every other amendment in this repo
  (ADR-0011, ADR-0014, ADR-0015) refuses to do.
- **C. A new amendment ADR narrows the two passages by backlink; ADR-0013's own words are edited
  only to the extent of swapping "eleven" for "eighteen colour roles under shadcn's own names,"
  with an `Amended by` line added to its header.** Adopted.

## Decision

**Option C.** ADR-0013's § Context bullet beginning "The register is shadcn's **Neutral**
theme" and its § Decision paragraph beginning "**The client walks themed screens.**" are amended
in place: each occurrence of "the eleven roles" (or "the same roles") becomes "the eighteen
[colour] roles [under shadcn's own names]". ADR-0013's header gains `- Amended by: ADR-0016`.
No other passage of ADR-0013 changes — the player mechanics, the mark/override flow, the
approve-sentence rule and every other ruling in that record stand untouched.

The behavioural half of this ruling is carried entirely by specs/20260912/08's own Decisions
D1–D6: the eighteen-role register, the radius scale, the five re-drawn primitives, the sheet
shadow fix, the `--refresh-register` migration path and the retired→successor rename map. This
ADR records only that ADR-0013's description of the register is superseded, per the roadmap-
amendment convention that a locked record is narrowed by backlink, never rewritten as if the
narrower version had always been true.

## Consequences

- A reader of ADR-0013 who wants to know what the register covers now finds the `Amended by`
  line and follows it here rather than trusting a stale "eleven roles."
- No other decision in ADR-0013 is reopened by this record: the player, the mark/override flow,
  the approve sentence, and the retirement list all stand exactly as ADR-0013 left them.
- specs/20260912/08's own Contracts § The register remains the executable source of the
  register's shape; this ADR is the durable account of why ADR-0013's wording changed, not a
  second copy of the role list.

## Dissents

None recorded — the amendment narrows a factual description (a role count) rather than
reopening a design ruling, and no dissent was raised against specs/20260912/08's Decisions at
lock.
