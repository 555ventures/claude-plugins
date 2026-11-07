---
date: 2026-11-06
status: draft
area: init
depends_on: []
brief: n/a
architecture: false
breaking: false
---

# Older projects lose the lint gap

## Intent
- You asked: Close the two follow-ups left by the failed-lint fix: projects set up before it keep the gap, and a test command ending in a comment now breaks.
- I will build:
  - `/spec:init` repairs a `testCommand` it chained before the fix, so a failed check fails the gate on projects already set up.
  - `/spec:doctor` reports that unsafe command and names `/spec:init` as the remedy, so a project finds out without re-running setup.
  - Grouping survives a shell comment at the end of the command.
- I will not touch:
  - A `testCommand` that does not start with a check `detect` found: it was written by hand and stays as it is.
  - How checks are detected or how `covered()` decides a check already runs.
- Users will notice: a project set up before the lint fix gets a `/spec:doctor` warning, and re-running `/spec:init` rewrites its test command so a failed check fails the gate.
- Architecture or behaviour change: yes — `/spec:init` rewrites an unsafe test command it wrote earlier, and doctor gains one finding
- Client sign-off: may setup rewrite the unsafe test command it wrote earlier — yes, automatically, and only when the front of the command is a check setup itself would add

## Preparation

Best practice: POSIX shell gives `&&` and `||` equal precedence, left to right, and `;` and `&` end the list, so `lint && a || b` still runs `b` after lint fails. A subshell group `lint && (a || b)` is the standard repair. A comment runs to the end of its line, so a closing parenthesis needs its own line after one.

User flow: a project set up last month has `npm run lint && a || b`. Its owner updates the plugin and runs `/spec:doctor`, which names the unsafe command and says to run `/spec:init`. Setup rewrites it to `npm run lint && (a || b)`, and a second run changes nothing. A project with a hand-written command sees no finding and no rewrite.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | One function, `repairChain(testCommand, checks)`, in `spec/scripts/init.js` and exported. It strips leading `<check command> && ` prefixes, using only commands `detect` found. If at least one prefix was stripped and the rest needs grouping and is not already one balanced group, it returns the prefixes plus the grouped rest; otherwise it returns the command unchanged. | Only a prefix setup itself could have written proves the chain is ours, so a hand-written command is never rewritten. |
| D2 | `chain()` runs `repairChain` before it adds missing checks, and shares one `group()` helper with it. `(a) \|\| (b)` is not one balanced group and gets grouped; `(a \|\| b)` is, and stays as it is. | A second run must change nothing, and a quick starts-and-ends-with-parenthesis test would wrongly skip the first form. |
| D3 | `group()` puts the closing parenthesis on its own line when the command has a `#` at its start or after whitespace. A `#` inside quotes gets the same harmless newline. | The fix's `a; b # note` lost its closing parenthesis to the comment. Parsing shell quoting is more code than the case deserves. |
| D4 | `doctor.js` adds the finding `testCommand: a failed check can still pass the gate — run /spec:init` when `repairChain` would change the configured command. It runs with or without the probe. | Silent gaps need a visible signal; a project should not have to guess that setup needs re-running. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/init.js | MODIFY | `repairChain`, `group`, comment-safe grouping (D1–D3) |
| spec/scripts/doctor.js | MODIFY | The unsafe-command finding (D4) |
| tests/init.test.js | MODIFY | Repair, hand-written, second-run and comment cases |
| tests/doctor.test.js | MODIFY | The finding and its absence |

## Acceptance Criteria

- **AC-20261106-04-1**: WHEN `/spec:init` runs on a project whose `testCommand` is `npm run lint && a || b` and `detect` finds `npm run lint` THE SYSTEM SHALL write `npm run lint && (a || b)`.
- **AC-20261106-04-2**: WHEN `/spec:init` runs a second time on that project THE SYSTEM SHALL leave `testCommand` unchanged.
- **AC-20261106-04-3**: WHEN `testCommand` is `a || b` or `custom-lint && a || b` and `custom-lint` is no detected check THE SYSTEM SHALL leave it unchanged, and doctor SHALL report no unsafe-command finding.
- **AC-20261106-04-4**: WHEN the rest of the command is `(a) || (b)` THE SYSTEM SHALL group it, and WHEN it is `(a || b)` THE SYSTEM SHALL leave it as it is.
- **AC-20261106-04-5**: WHEN the grouped command is `a; b # note` THE SYSTEM SHALL write a command that `sh -c` runs without a syntax error, and a failing check in front of it SHALL fail the whole command.
- **AC-20261106-04-6**: WHEN `/spec:doctor` runs on a project with the unsafe command THE SYSTEM SHALL print `testCommand: a failed check can still pass the gate — run /spec:init`, with and without the probe.

## Assumptions

- A1: The check commands `detect` finds today match the ones setup wrote before the fix — if false: an older chain is treated as hand-written, gets no repair, and stays as it is today.
