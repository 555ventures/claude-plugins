---
name: queue-overlay-shared-lib-scope
description: What belongs in a lib/*.js shared between a write-path CLI and a read-only overlay inside another script — doneness AND placement algorithms, not path/roadmap parsing
metadata:
  type: feedback
  reviewed: 2026-09-02
---

When a spec requires the SAME derivation to run twice — once for real with writes (a
write-path CLI) and once virtually/read-only (an overlay inside another script, e.g.
spec-status.js's deriveNext()) — put BOTH the doneness/predicate evaluator AND the
placement/reconcile algorithm in the shared `lib/*.js`, even if the File Plan's one-line
summary for that lib file only names "the doneness evaluator." Two call sites hand-rolling
the same insertion-position rule (specs/20260823/08 D6: real reconcile in spec-queue.js,
virtual reconcile in spec-status.js) is exactly the duplicate-algorithm class the repo
flags as a hard finding, even though only "item doneness" was called out by name.

What does NOT need to move into the shared lib: roadmap/frontmatter PARSING that an
existing, untouched script (spec-status.js) already does internally for its own unrelated
purposes (phase, dep_rejects, hand-tracked-status detection, etc.) — re-deriving a subset
of that in the new write-path CLI via its own small local parse is fine and lower-risk than
touching the existing script's established internal loop. The discriminator: is it the
SAME decision being computed twice (doneness, placement) — shared; or is it reading the
same *source files* for a narrower, script-specific purpose — a small independent read is
acceptable.

**Why:** specs/20260823/08-derived-session-queue.md's File Plan literally scoped
`lib/queue.js` to "the ONE item-doneness/predicate evaluator," but D6's Behavior text
requires spec-status.js to run a virtual "reconcile" (the same missing-brief insertion
rule spec-queue.js runs for real) purely for sort-key/anomaly purposes. Reading the File
Plan row too literally would have produced two hand-written copies of the insertion
algorithm — exactly the drift the repo's rules exist to prevent.

**How to apply:** when a spec's Behavior section describes a "virtual" version of an
otherwise-write-path algorithm inside a read-only consumer, treat that as an unstated but
real shared-lib requirement, and widen the lib file's exports accordingly — cite the
Behavior bullet (not just the File Plan summary line) as the reason in the module header
comment so a reviewer can see it wasn't scope creep.

Also: when a spec names a domain concept (here, "superseded briefs") that has NO existing
machine-readable field anywhere in the repo (roadmap files only carry it as prose —
"*(superseded by v7)*" in an overview table's Name column), don't skip implementing the
exclusion — find the closest real, greppable signal the affected files already share (here:
every currently-superseded roadmap file opens its "Why" section with a `> **Superseded
by**` blockquote) and log the interpretation as a deviation bullet rather than silently
omitting the behavior or guessing at a field name that doesn't exist. Omitting it silently
would have produced a real, observable defect on THIS repo's own dogfood status output
(three dead roadmap briefs auto-placed into every fresh queue, forever).
