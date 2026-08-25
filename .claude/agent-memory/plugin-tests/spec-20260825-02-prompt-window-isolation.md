---
name: spec-20260825-02-prompt-window-isolation
description: When an AC requires a specific prompt/section to contain a literal (not just the file), isolate that substring with a regex window before asserting — checking whole-file src risks a vacuous pass when the literal exists elsewhere (e.g. a schema property key) but not in the place the AC actually cares about.
metadata:
  type: feedback
---

Spec 20260825/02 AC-5 required wf-research.js's *research prompt string* (not the file as a
whole) to mention `## Coverage`, `because`, and `priced`. After D6 lands, `because`/`priced`
will legitimately appear elsewhere in the same file as schema property keys
(`properties: { because: {...}, priced: {...} }`) — a whole-file `read('...').match(/because/)`
check would go green off the schema alone even if the prompt text an agent actually reads never
mentions either field, silently defeating the AC's real intent (agent must be *told* to fill
them, not just have the harness *require* them).

Fix: extract the exact substring the AC is scoped to before asserting.
`src.match(/'You are the option-research agent[\s\S]*?\{ label: 'menu:'/)` isolates the literal
prompt string handed to `agent()`, distinct from the schema object below it. Same technique
applies to a doctrine-command "step" scoped assertion: isolate the numbered/lettered step's text
window (`match(/Present an .AskUserQuestion. built from the menu:[\s\S]*?(?=\n\d+\.|\n\n)/)`)
rather than grepping the whole command file, so a mention anywhere else in the doc can't
vacuously satisfy an AC scoped to one specific step.

**Why:** proven empirically 2026-08-25 — ran the actual test against current wf-research.js and
confirmed the failure message showed the isolated prompt text (not schema text), and that the
assertion legitimately fails now (prompt has neither `## Coverage` nor `because`/`priced`) while
the schema's own future property keys won't falsely turn it green later.

**How to apply:** whenever an AC's wording scopes a literal check to "the prompt" / "the X step"
/ "the Y section" rather than "the file", isolate that region with a bounded regex before
asserting substring/regex matches on it — never assert against `read(file)` directly when the
same literal could legitimately appear elsewhere in that file for an unrelated reason (a schema
key, an unrelated bullet, a heading name reused in prose).

See also [[banned-literal-loop-dedup-and-blind-spot-sweep]] and
[[ac-example-unreachable-branch]] for related "trace before trusting a literal check" patterns.
