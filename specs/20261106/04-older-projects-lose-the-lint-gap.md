---
date: 2026-11-06
status: done
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
  - How checks are detected or how `covered()` decides a check already runs. A gate that runs no check at all is not this spec's gap: a re-run of `/spec:init` already adds the missing check in front.
  - The gate's runner (`lib/host.js` `run`, `/bin/bash -c`) and the config format: the repaired value is the same string key, now holding a newline when the command carries a comment.
- Users will notice: a project set up before the lint fix gets a `/spec:doctor` finding, and re-running `/spec:init` rewrites its test command so a failed check fails the gate. A second run changes nothing.
- Architecture or behaviour change: no — setup repairs a value it wrote itself, to the shape the lint fix already promised (`a failed lint always fails the gate`); the gate's contract, the config keys and every other command are unchanged
- Client sign-off: may `/spec:init` rewrite the unsafe test command it wrote earlier, on its own, when the front of the command is a check setup itself would add — [asked: yes, automatically]

## Preparation

Best practice: POSIX shell gives `&&` and `||` equal precedence, left to right, and `;` and `&` end the list, so `lint && a || b` still runs `b` after lint fails. A subshell group `lint && (a || b)` is the standard repair. A comment runs to the end of its line, so a closing parenthesis needs its own line after one.

Ran on this box (`sh -c`): `false && (true; true # note)` exits 2, a syntax error; `false && (true; true # note<newline>)` exits 1; `false && ((true) || (true))` and `false && (true || true)` both exit 1; `true && (true; true # note<newline>)` exits 0. The gate runs through `/bin/bash -c`, which reads the same forms.

User flow: a project set up last month has `npm run lint && a || b`. Its owner updates the plugin and runs `/spec:doctor`, which names the unsafe command and says to run `/spec:init`. Setup rewrites it to `npm run lint && (a || b)`, and a second run changes nothing. A project with a hand-written command sees no finding and no rewrite.

## Goal

A project set up before the lint fix, where a failed check still passes the gate, learns it from `/spec:doctor` and is repaired by re-running `/spec:init`; setup leaves every hand-written command alone, runs idempotently, and a command ending in a shell comment still groups into a command the shell runs.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | One pure function, `repairChain(testCommand, commands)`, in `spec/scripts/init.js` and exported; `commands` is the list of check commands `detect` found (`checks.map((c) => c.command)`). It strips leading `<command> && ` prefixes, repeating while the front of the remaining string is one of `commands`, in any order. If no prefix was stripped, or the rest is empty, it returns the command unchanged. Otherwise it returns `[...prefixes, group(rest)].join(' && ')`, which is the input itself when `group` leaves the rest alone (D2). | Only a prefix setup itself could have written proves the chain is ours, so a hand-written command is never rewritten. Passing the commands in keeps the function free of the filesystem, so doctor and the tests call it directly. |
| D2 | One `group(cmd)` helper in `init.js`, shared by `chain()` and `repairChain`. It returns `cmd` unchanged when `cmd` needs no grouping (today's test: no `\|\|`, `;`, newline or single `&`) or when `cmd` is already one balanced group; otherwise it wraps it (D3). "One balanced group": the first non-blank character is `(` and the `)` that closes it is the last non-blank character, found by a scan that skips a backslash-escaped character, `'…'` and `"…"` spans, and a comment (a `#` at the start or after whitespace, to the end of its line). So `(a) \|\| (b)` is grouped and `(a \|\| b)` and `(a; b # note<newline>)` stay as they are. `chain()` becomes: repair with D1 first, then `covered()` on the repaired command as today, then `[...front, group(repaired)].join(' && ')`, returning the repaired command when nothing is in front. `covered()` is unchanged. | A second run must change nothing, and a quick starts-and-ends-with-parenthesis test would wrongly skip `(a) \|\| (b)`. A scan that ignores quotes and comments would miscount a `)` inside them and wrap the group once more on every run; skipping them costs a dozen lines and makes the test honest. One helper keeps the first-run and repair paths from drifting apart. |
| D3 | `group()` wraps as `(${cmd})`, except that when `cmd` contains a `#` at its start or after whitespace it wraps as `(${cmd}\n)`, closing parenthesis on its own line. A `#` inside quotes gets the same harmless newline. The newline is stored in the config value as is (`"\n"` in the JSON). | Ran: `(a; b # note)` is a syntax error and `(a; b # note<newline>)` runs (Preparation). Parsing shell quoting for the `#` alone is more code than the case deserves, and an extra newline before `)` never changes what runs. |
| D4 | `doctor.js` imports `detect` and `repairChain` from `./init` beside `IGNORE`. Right after the config findings, when the config parsed and `testCommand` is set, it computes `repairChain(cfg.testCommand, detect(root).checks.map((c) => c.command))` and, when the result differs, pushes `config: testCommand lets a failed check pass the gate — run /spec:init`. It runs with or without the probe. The `/spec:init` rewrite happens only through `/spec:init`; doctor never writes. [asked: yes, automatically] | Silent gaps need a visible signal; a project should not have to guess that setup needs re-running. The prefix is `config:`, not `testCommand:`, because the existing `probe: false` pin partitions probe findings by the `^testCommand:` prefix (tests/doctor.test.js "check(root, { probe: false }) returns the same findings") and this finding is a config fact, not a probe result. |
| D5 | No change to `spec/commands/init.md` or `doctor.md`. | init.md already says the checks are chained "also … on a re-run"; the repair is that sentence kept. doctor.md promises a remedy per problem, which D4 keeps. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/init.js | MODIFY | `repairChain`, `group`, `chain()` repairs first, comment-safe wrapping (D1–D3) |
| spec/scripts/doctor.js | MODIFY | The unsafe-command finding (D4) |
| tests/init.test.js | MODIFY | Repair, hand-written, second-run, balanced-group and comment cases (AC-1 to AC-5) |
| tests/doctor.test.js | MODIFY | The finding with and without the probe, and its absence (AC-3, AC-6) |

## Acceptance Criteria

- **AC-20261106-04-1**: WHEN `/spec:init` runs on a project whose `.claude/spec.config.json` holds `testCommand: "npm run lint && a || b"` and package.json has a `lint` script THE SYSTEM SHALL write `npm run lint && (a || b)`; and WHEN it holds `npm run lint && npm run typecheck && a; b` with `lint` and `typecheck` scripts THE SYSTEM SHALL write `npm run lint && npm run typecheck && (a; b)`.
- **AC-20261106-04-2**: WHEN `/spec:init` runs a second time on either project of AC-1 THE SYSTEM SHALL leave `testCommand` byte-identical.
- **AC-20261106-04-3**: WHEN `testCommand` is `a || b` and no check is detected, or `custom-lint && a || b` with a `lint` script detected as `npm run lint` THE SYSTEM SHALL leave it unchanged after `/spec:init`, and `/spec:doctor` SHALL report no `config: testCommand lets a failed check pass the gate` finding for either.
- **AC-20261106-04-4**: WHEN `repairChain('npm run lint && (a) || (b)', ['npm run lint'])` is called THE SYSTEM SHALL return `npm run lint && ((a) || (b))`; and WHEN called with `npm run lint && (a || b)`, `npm run lint && (echo ")" ; b)` or `npm run lint && (a; b # x)\n)` THE SYSTEM SHALL return the input unchanged.
- **AC-20261106-04-5**: WHEN `/spec:init` runs with `--set testCommand=a; b # note` on a project with a `lint` script THE SYSTEM SHALL write a command that `sh -c` runs without a syntax error (exit 0 when `a` and `b` are `true`), and the same command with `npm run lint` replaced by `false` SHALL exit non-zero; and a second run SHALL leave it byte-identical.
- **AC-20261106-04-6**: WHEN `/spec:doctor` runs on a project whose config holds `npm run lint && true || true` and package.json has a `lint` script THE SYSTEM SHALL print `config: testCommand lets a failed check pass the gate — run /spec:init`, both from `check(root)` and from `check(root, { probe: false })`, and exit 1 from the command line.

## Assumptions

- A1: The check commands `detect` finds today match the ones setup wrote before the fix (`npm run lint`, `make lint`, `ruff check .` and the typecheck forms) — if false: an older chain is treated as hand-written, gets no repair and no finding, and stays as it is today.
- A2: Hand-written groups use only quotes, backslash escapes and comments to hide a `)` — if false (a heredoc or `$(…)` holding an unmatched `)`): the group is wrapped once more per `/spec:init` run; it still runs, and doctor reports it until the owner hand-edits it.
- A3: Spec 01 lands first; it appends cases to `tests/doctor.test.js`, which this spec also appends to — if false: the two builds touch the same file and the later merge resolves one append conflict in a test file.
