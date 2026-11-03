---
description: Root-cause repair in the Direct lane — this session owns the diagnosis, the structural change and the judgement; a root-cause statement before the first edit, a regression test, one decisions stop over every authored string and policy choice, one fresh-context reviewer on the host's reviewer seat, then the host gate and /git:commit (which records the fix row)
argument-hint: "[symptom in plain words] — optional; bare mid-session derives the defect from the conversation"
---

# Spec Fix

The Direct lane's playbook (core § Pipeline Entry) for a defect repair spanning more than two of
the host's `layerGroups` or touching text a user sees in the product; inside one or two layers it
is a plain commit. Behaviour is new — not a repair — only when no existing doc, test, type or mock
states it; new behaviour, a new screen or an unmade product decision STOPs here naming `/spec:plan`
(or `/spec:prototype`). No driver, no gate, no File Plan; its one ledger row is the `stage:"fix"`
row, or the escape row when the commit touches lines a reviewed spec landed — `/git:commit` step 3 writes it.

**Setup:** run `spec-paths shared-for fix` and read its output. Read the host's
`.claude/spec.config.json` (`gateCommand`, `testCommand`, `layerGroups`, `pipelineRules`, `policy`).
Either missing → STOP: run `/spec:init` first.

## Input

`$ARGUMENTS` — the symptom as the user observed it. Bare → derive it from the session's current
defect work, print `📌 Auto-picked symptom: <one line> — <where it came from> (veto anytime)` and
continue; nothing identifiable → ask for the symptom, the only unrecoverable input.

## Steps

1. **Root-cause statement, before the first edit.** First `git status --porcelain`: any output
   means another fix or stray edits are in flight — ask ONE `AskUserQuestion` naming the files
   (one fix per checkout, so the gate, the reviewer and the fix row judge one root cause):
   "commit the unrelated changes first via `/git:commit` (Recommended)" / "stash them with a
   tagged entry (`git stash push -u -m "fix: <symptom>"`)" / "abort" — each description states
   its consequence; abort STOPs. Delegated (core § Delegated Stops): write the question document
   to a scratch file and run `node "$(spec-paths pending-question)" write --root . --file <doc.json>`
   with kind `fix-dirty-tree`, then stop; on resume read `show`, apply, `consume`. Then
   this session reads the failing path end to end (parallel Explore agents locate it where the
   surface is wide; they return paths, never file contents). Print ONE paragraph: the defect, why
   it can recur, and the structural change that makes recurrence impossible. A symptom-only patch
   is not accepted; a root cause that cannot be stated is reported and STOPs. A statement naming
   a schema or API change is the Structural lane: STOP and name `/spec:plan`.
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
   list → skip without output. Dismissed → STOP, edits left in the tree, nothing committed. Delegated: write the document
   as above with kind `fix-decisions`, then stop; on resume read `show`, apply, `consume`.
4. **Fresh review.** Dispatch ONE `Agent {subagent_type: 'spec:reviewer'}` — read-only, blind to
   this conversation — with `model` and `effort` from the config's `policy.models.reviewer` (a field it
   omits takes the reviewer row of core § Model Placement). Hand it: the
   root-cause statement and step 3's approved list in place of a spec, with the line "no File
   Plan or ACs exist — judge the diff against the statement"; the range `git rev-parse HEAD`
   plus the dirty working tree, untracked files included; the root; the config's `pipelineRules`
   path. A `fix` disposition is applied without a question; `waive`/`reject` go to the user in
   ONE `AskUserQuestion` (≤4 per call, the reviewer's claim quoted, the recommended fate first) —
   only the user waives (delegated: write the document as above with kind `fix-dispositions`, then
   stop; on resume read `show`, apply, `consume`); a `hard` finding never ships undisposed. A `REVIEWER_FAILED` return is re-dispatched once, then reported as unreviewed.
5. **Gate and commit.** Run the host's `gateCommand`; red → fix, never commit around it. Commit
   through `/git:commit` in this same session, root-cause statement as the body, stating that the
   invoker is `/spec:fix` and whether step 4 completed — its step 3 writes the escape row or the fix row.
6. **Report** (core § Console Output Style, rendered via `spec-paths report-render`): `outcome`
   ✅ `fixed — {symptom}`; `bullets`: the root-cause line, the test added, `{N} reviewer findings
   disposed` (or `unreviewed`), and `fix row appended` or `escape row appended` (either lands with the next commit) when one
   was; `next`: `node "$(spec-paths spec-status)" --root . --next` verbatim as
   `{kind: 'status-verbatim'}`.

## Rules

- Names no tool (gate and test commands come from the host config only); never edits outside the
  host repo — a blocking defect elsewhere is reported, not fixed; at most FOUR `AskUserQuestion`
  calls: the step-1 dirty tree, the step-3 decisions stop, the step-4 waive/reject and the Input fallback.
