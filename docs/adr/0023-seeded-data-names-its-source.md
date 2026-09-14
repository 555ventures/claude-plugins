# 0023. Seeded data names its source

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/10-seeded-data-names-its-source.md)
- Applies to: docs/adr/0013-client-rehearses-the-journey.md — the **Derived records, not
  placeholders** paragraph is narrowed in place: a screen now names the record it shows, never
  a value typed without a traceable source. Nothing else in that record changes.
- Amended by: —

## Context

`recordValues`/`recordHits` ask the weakest possible question a placeholder check can ask: does
this screen contain any seeded string at all. It was written to catch lorem ipsum and it does
that well, which is why specs/20260912/10 D5 keeps it untouched. It cannot catch the thing that
actually breaks a journey's consistency: a customer's name typed on nine screens, the ninth
spelled differently, with nothing to notice because a drifted copy is simply not a seed value
any more and the check has nothing left to match it against.

ADR-0013's records paragraph says the seed's records are "drawing material, not evidence" and
stops there — it rules on where a record's *values* come from (derived, never the client's real
data) but says nothing about how a screen relates to the record once drawn. specs/20260912/10 is
the record that closes that gap: a bound element carries `data-record="<entity>[i].<field>"`,
the reference must resolve, and the element's visible text must equal the resolved value exactly.
A distinctive seed value shown anywhere outside a bound element is refused; every other stray
value is warned. The rules bind on the same labelled, non-canon, wire-register-linked mock
predicate specs/20260912/09 (ADR-0022) establishes, warning at `journey-drawn` and refusing at
`journey-approved`.

## Options considered

- **A. Leave ADR-0013's records paragraph as written and record the binding rule only in
  specs/20260912/10 and spec/doctrine/mocks.md.** Rejected: ADR-0013 is the durable account of
  what a seed's records are for; a reader who wants to know what "drawing material" means today
  would find a paragraph that stops exactly at the gap this spec closes, with no pointer forward.
- **B. Rewrite ADR-0013's records paragraph in place with no `Amended by` backlink.** Rejected:
  ADR-0013 is itself the accepted record of a design ruling; silently rewriting it erases the
  fact that the ruling changed, the failure the amendment convention exists to prevent.
- **C. A new amendment ADR narrows ADR-0013's records paragraph in place, with the matching
  `Amended by` backlink, while the paragraph's original derivation ruling (records are derived,
  never the client's real data) stands untouched.** Adopted.

## Decision

**Option C.** ADR-0013's **Derived records, not placeholders** paragraph is amended in place: a
screen names the record it shows. An element displaying a seeded value carries
`data-record="<entity>[i].<field>"` pointing into `design/mocks/records/<entity>.json`; the
reference must resolve to a string or number, and the element's visible text — inner HTML with
tags stripped, whitespace collapsed, trimmed — must equal the resolved value exactly. A
distinctive seed value — one containing a space or at least eight characters long, occurring in
exactly one record across every record file — shown outside every bound element is refused; any
other stray seed value is warned. The rules warn at `journey-drawn` and refuse at
`journey-approved`, on the same bound-mock predicate the invention checks (ADR-0022) use. The
paragraph's original ruling — the seed's records are derived by the session, never supplied by
the client, and are drawing material rather than evidence — is untouched by this record.

The journey-level placeholder checks specs/20260912/10 D5 keeps unchanged — a screen with zero
seed hits still warns, a journey whose every screen has zero hits still refuses — are not
touched by this amendment; they are a separate, coarser check that continues to run alongside
the binding rules this record adds.

The behavioural half of this amendment is carried entirely by specs/20260912/10's own Decisions
D1–D5: `resolveRecordRef`, the equality check, the distinctiveness test, and the binding
predicate. This ADR records only that ADR-0013's records paragraph is narrowed, per the
convention that a locked record is amended by backlink, never rewritten as if the later version
had always been true.

## Consequences

- A reader of ADR-0013's records paragraph who wants to know what "drawing material" means today
  finds the `Amended by` line and follows it here, rather than a paragraph silent on how a screen
  relates to the record it draws from.
- A retyped, misspelled record can no longer reach `journey-approved`: the ninth copy of a name
  that used to pass because it merely wasn't lorem ipsum now fails the equality check the binding
  requires.
- Binding cost is real and deliberate: a value that legitimately appears twice on one screen — a
  name in a header and again in a list row — needs both occurrences bound. That cost is the
  mechanism by which the two copies can never diverge, not a tax to be optimised away.
- specs/20260912/10's own Contracts and Behavior sections remain the executable source of the
  binding grammar, the distinctiveness test, and the message text; this ADR is the durable
  account of why ADR-0013's records paragraph changed, not a second copy of the mechanism.

## Dissents

None recorded — the amendment narrows one paragraph's account of what a seed's records are for
and adds a check on top of the existing placeholder rule, rather than reopening a design ruling;
no dissent was raised against specs/20260912/10's Decisions at lock.
