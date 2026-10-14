---
description: Root-cause repair in the Direct lane — this session owns the diagnosis, the structural change and the judgement; a root-cause statement before the first edit, a regression test, one decisions stop over every authored string and policy choice, one different-family reviewer, then the host gate and /git:commit (which records the fix row)
argument-hint: "[symptom in plain words] — optional; bare mid-session derives the defect from the conversation"
---

# Spec Fix

The Direct lane's playbook (core § Pipeline Entry) for a defect repair spanning more than two of
the host's `layerGroups` or touching text a user sees in the product. A repair inside one or two
layers is a plain commit. Behaviour counts as new — not a repair — only when no existing doc,
test, type or mock states the intended behaviour; new behaviour, a new screen, or a product
decision nobody has made STOPs here naming `/spec:plan` (or `/spec:prototype`). No driver, no
gate of its own, no File Plan; its one ledger row is the `stage:"fix"` row `/git:commit` step 3
writes.

**Setup:** run `spec-paths shared-for fix` and read its output. Read the host's
`.claude/spec.config.json` (`gateCommand`, `testCommand`, `layerGroups`, `pipelineRules`).
Either missing → STOP: run `/spec:init` first.

## Input

`$ARGUMENTS` — the symptom as the user observed it. Bare → derive it from the session's current
defect work, print `📌 Auto-picked symptom: <one line> — <where it came from> (veto anytime)`
and continue. Nothing identifiable in the session → ask for the symptom; it is the only
unrecoverable input.

## Steps

1. **Root-cause statement, before the first edit.** This session reads the failing path end to
   end (parallel Explore agents locate it where the surface is wide; they return paths, never
   file contents). Print ONE paragraph: the defect, why it can recur, and the structural change
   that makes recurrence impossible. A fix that only patches the symptom is not accepted; a root
   cause that cannot be stated is reported and STOPs. A statement naming a schema or API change
   is the Structural lane: STOP and name `/spec:plan`.
2. **Fix, with its test.** This session writes the contract change itself — types, signatures,
   the module that ties writer and reader together — plus one test that fails on the old
   behaviour (core § Incident Policy). Mechanical repairs that copy an existing pattern may go to
   Sonnet workers, one file each, the host's `gateCommand` (or the one named test file) green
   before any reports success; a blocked environment is reported as blocked with the error
   text, never worked around (core § Model Placement, § Worker Git Ban). A spike runs in
   `Agent {isolation: 'worktree'}` and returns evidence only — no migrations, no fixture writes,
   no commits. A worker's green is a claim: run the `gateCommand` yourself before relying on it.
3. **Decisions stop.** List every user-facing string this session or a worker authored and
   every display or policy choice made (what is hidden, reformatted, reordered, defaulted). ONE
   `AskUserQuestion`, items grouped into at most four questions, each answerable cold (core
   § Question Style); a vetoed item reverts to the pre-fix behaviour and is not re-asked. Empty
   list → skip without output. Dismissed → STOP, edits left in the tree, nothing committed.
4. **Fresh review.** Dispatch ONE `Agent {subagent_type: 'spec:reviewer'}` — read-only, blind to
   this conversation — with `model: 'opus'` when this session runs Fable, else the agent's own
   `fable` (a different family from the author, core § Model Placement). Hand it: the
   root-cause statement and step 3's approved list in place of a spec, with the line "no File
   Plan or ACs exist — judge the diff against the statement"; the range `git rev-parse HEAD`
   plus the dirty working tree, untracked files included; the root; the config's `pipelineRules`
   path. Dispose every finding inline — fix it, or state why not; a `hard` finding never ships
   undisposed. A `REVIEWER_FAILED` return is re-dispatched once, then reported as unreviewed.
5. **Gate and commit.** Run the host's `gateCommand`; red → fix, never commit around it. Commit
   through `/git:commit` in this same session with the root-cause statement as the commit body,
   stating in the invocation that the invoker is `/spec:fix` and whether step 4 completed — its
   step 3 offers the fix row.
6. **Report** (core § Console Output Style, rendered via `spec-paths report-render`): `outcome`
   ✅ `fixed — {symptom}`; `bullets`: the root-cause line, the test added, `{N} reviewer findings
   disposed` (or `unreviewed`), and `fix row appended — lands with the next commit` when one
   was; `next`: `node "$(spec-paths spec-status)" --root . --next` verbatim as
   `{kind: 'status-verbatim'}`.

## Rules

- Names no tool: gate and test commands come from the host config only.
- Never edits outside the host repo; a blocking defect elsewhere is reported, not fixed.
- At most TWO `AskUserQuestion` calls: the step-3 decisions stop and the Input fallback.
