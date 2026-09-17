---
name: attribute-selector-dodges-substring-ban
description: an over-broad "zero occurrences" literal ban that collides with a class name the same spec requires is an AC-boundary defect — amend the AC's literal, never contort the selector to dodge the grep
metadata:
  type: feedback
  reviewed: 2026-09-17
---

A test's "zero occurrences of `<literal>`" ban over a whole file is usually a bare substring
`RegExp` with no word boundary, so it also matches an unrelated class that merely starts the same
way (`.rv-scopeband` collides with a banned `.rv-scope`). The tempting fix — selecting the same
elements by `[class="exact-value"]` or a `[data-rv="…"]` hook so the banned substring never appears
in the file's text — was proposed in specs/20260912/06 and **rejected by the orchestrator**. An
exact-attribute selector stops matching the moment the element gains a second class, so a grep
pin's own spelling silently becomes a live rendering constraint: the page's styling now depends on
a test's regex, which is a worse coupling than the one being avoided.

**Why:** the collision is a defect in the AC's literal, not in the code. AC-20260912-06-10 banned
`.rv-scope` as a substring while D4 of the same spec ADDED `.rv-scopeband` and
`.rv-scopeband-label`; the two Decisions were self-contradictory as written. The build amended the
AC (D10a) to ban `.rv-scope` as a complete class name — `/\.rv-scope(?![\w-])/` — which is exactly
the retirement the AC existed to assert, stated at the right boundary. Nothing was weakened: the
ban got more precise, not looser, and the CSS kept plain class selectors.

**How to apply:** run a literal ban's real regex against the pre-image before writing code, as
this memory already said. When it collides with something the same spec or a different AC requires
kept, stop and return that collision to the orchestrator as a `blocked` or a named deviation —
tightening the AC's boundary is an orchestrator amendment (it edits the spec), never a worker's
selector trick. Distinguish the two cases: a ban that fires on your NEW code is yours to fix; a ban
that fires on code the spec itself mandates is a spec defect.
