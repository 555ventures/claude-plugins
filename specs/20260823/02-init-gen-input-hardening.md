---
date: 2026-08-23
status: implementing
open_markers: 0
tier: standard
area: bootstrap
design: false
breaking: false
depends_on: ["specs/20260822/02-init-generation-script.md"]
depended_on_by: []
brief: n/a
build_base: main
---

# Init-gen input hardening — the four defect sites waived at review rv_e83659d49386

## Goal

Review rv_e83659d49386 (2026-08-23) closed specs/20260822/02 CLEAN with four executed defect
sites in `spec/scripts/init-gen.js` waived under the two-iteration fix cap, owned by this
spec: a string in the profile's `settings.extraAllow`/`extraDeny` spreads per character into
the host's permission allow list at exit 0; a non-iterable there, or a primitive at either of
`validateProfile`'s two `in`-operator sites, dies as a bare TypeError at Node's implicit
exit 1 (colliding with the documented "manifest-check red"); the hoisted `mergeSettings` call
sits one line above the exit-4 error boundary that round added; and the unreadable-settings
remedy tells a directory-shaped `settings.json` operator to `chmod` a file. Done = every
malformed input lands on the documented exit 2 with a matched remedy, the merge computation
sits inside the boundary, and the three behaviors the parent review pinned still hold. No
exit-code alphabet change.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `validateProfile` gains an optional-array arm for `settings.extraAllow` and `settings.extraDeny`: absent is fine (the code's `\|\| []` default stands), but a present non-array value exits 2 with the same "must be an array" message shape the required-array loop uses (AC-20260823-02-1, AC-20260823-02-2) | A string is iterable — it spreads per character into the host allow list at exit 0 (spiked: 12 one-char entries), so no error boundary can ever catch it; only a shape check can. Fable ruling rv_e83659d49386 round 3 |
| D2 | `config.agentMap` and `rules.sections` are guarded as plain objects (`typeof === 'object'`, non-null, non-array) before their `in`-operator key loops; a failing shape exits 2 naming the field "must be an object" with the standard profile-schema remedy (AC-20260823-02-3, AC-20260823-02-4) | `'tests' in 42` throws a bare TypeError (spiked) at implicit exit 1, outside every boundary; arrays already fail closed via the key loop but with a misleading "missing field" message, so one guard fixes both |
| D3 | The `mergeSettings(...)` call moves INSIDE the try boundary as its first statement — still ahead of `buildFileTargets` and every write, preserving round 2's no-settings-throw-after-a-write ordering, now also covered by the exit-4 boundary `[no-ac: after D1/D2 close the enumerated triggers, no JSON-representable profile reaches a throw inside mergeSettings (String() throws only on symbols, unreachable via JSON — A1); the move guards the unenumerable residue, and a behavioral trigger would have to be fault-injected, which the host's exec-real-scripts test rule forbids. AC-20260823-02-7 pins that the boundary's one executed trigger still exits 4]` | Fable ruling round 3: the round-2 hoist was correct and its composition with the boundary an ordering error of one line; the achievable invariant is everything post-pre-flight inside one boundary, not complete validation |
| D4 | The unreadable-settings arm branches on `e.code`: `EISDIR` gets its own message — the path is a directory, not a file; remedy = remove or replace the directory with a JSON file — and every other code keeps the existing permissions message with the `chmod u+r` remedy verbatim (AC-20260823-02-5, AC-20260823-02-6) | The one message told a directory-shaped-settings operator to chmod a file; spiked: `readFileSync` on a directory yields code `EISDIR` on this platform |
| D5 | The exit-code alphabet is unchanged: D1/D2's refusals and D4's branch land on the documented exit 2 (invalid profile / settings merge impossible, nothing written); D3's residue lands on the documented exit 4. The script's `Exit codes:` header needs no new entries (AC-20260823-02-1, AC-20260823-02-3, AC-20260823-02-7) | The review's ruling was explicit: no new codes needed — widening 2 and 4's populations, never their meanings, keeps every documented consumer contract intact |
| D6 | `spec/.claude-plugin/plugin.json` bumps to the next free version (target 7.22.0 — a target, not a pin, per the recorded semver-race class; 7.21.0 was taken by specs/20260823/01, and specs/20260823/03 holds the 7.23.0 lane) with the changelog-form description updated for the hardening `[no-ac: version-bump-without-behavior is review's own hard check; no behavioral test surface]` | Host rule: every behavior change bumps the owning plugin's semver |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/init-gen.js | MODIFY | scripts | D1 optional-array arm; D2 object guards at the two `in` sites; D3 merge call moved inside the try (first statement); D4 EISDIR branch; comment at the old call site updated to say the merge is computed inside the boundary, still pre-write |
| tests/init-gen/generate.test.js | MODIFY | tests | AC-20260823-02-1, AC-20260823-02-2, AC-20260823-02-3, AC-20260823-02-4, AC-20260823-02-5 (new behavioral tests); AC-20260823-02-6, AC-20260823-02-7, AC-20260823-02-8 (regression pins — tag the existing covering tests, never duplicate) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6 version bump + description changelog paragraph |

## Contracts

Profile schema delta against specs/20260822/02 Contracts (that spec is `done` and is not
edited; this is the authoritative widening):

```
settings.extraAllow   optional; WHEN PRESENT must be an array (of permission strings)
settings.extraDeny    optional; WHEN PRESENT must be an array (of permission strings)
config.agentMap       must be a plain object (non-null, non-array) — was only presence-checked
rules.sections        must be a plain object (non-null, non-array) — was only presence-checked
```

Exit codes: unchanged alphabet. Exit 2 additionally covers the four shapes above and the
settings-path-is-a-directory case; exit 4 additionally covers any residual throw from the
merge computation. Stderr contract for D4: the EISDIR arm names the path, states it is a
directory, and does NOT contain `chmod`; all other read errors keep the current message.

## Behavior

All four paths are reachable only from a malformed session-authored profile or a degenerate
host `.claude/settings.json` shape — zero well-formed host data is at risk (the parent
review's round-2 ordering fix already guarantees no settings-derived throw follows a write).
The change is purely which exit code and message greet the operator: silent corruption and
bare TypeErrors become the same refuse-with-remedy exit 2 the script already documents.
Validation stays deliberately enumerative only where a non-throw makes a boundary useless
(D1); everything else leans on the exit-4 boundary per the review's taxonomy ruling — this
spec adds no element-type validation inside the arrays (a junk string entry lands visibly in
the settings diff and throws nothing; see Rationale).

## Acceptance Criteria

- **AC-20260823-02-1**: WHEN `generate` runs with a profile whose `settings.extraAllow` is the
  string `"Bash(bun x *)"` THE SYSTEM SHALL exit 2 naming `settings.extraAllow` as
  must-be-an-array and write nothing — and specifically SHALL NOT exit 0 having spread it into
  twelve one-character allow entries (the parent review's executed corruption repro) → new
  test in tests/init-gen/generate.test.js
- **AC-20260823-02-2**: WHEN `settings.extraDeny` is the number `42` THE SYSTEM SHALL exit 2
  naming the field, not die with Node's bare `is not iterable` TypeError at exit 1 → new test
- **AC-20260823-02-3**: WHEN `config.agentMap` is the number `42` THE SYSTEM SHALL exit 2
  naming `config.agentMap` as must-be-an-object with the profile-schema remedy, not throw
  `Cannot use 'in' operator` at exit 1 → new test
- **AC-20260823-02-4**: WHEN `rules.sections` is the string `"x"` THE SYSTEM SHALL exit 2
  naming `rules.sections` as must-be-an-object, not throw at exit 1 → new test
- **AC-20260823-02-5**: WHEN the existing `.claude/settings.json` path is a directory THE
  SYSTEM SHALL exit 2 with stderr that names the path as a directory and does NOT contain
  `chmod`, writing nothing (the current message embeds Node's "illegal operation on a
  directory" but still prescribes `chmod u+r` — the NOT-`chmod` assert is the red edge) → new
  test
- **AC-20260823-02-6**: WHEN the existing `.claude/settings.json` is unreadable for
  permissions (chmod 000) THE SYSTEM SHALL CONTINUE TO exit 2 with the permissions remedy
  distinct from the invalid-JSON message → tag the existing unreadable-settings test
  (currently AC-20260822-02-18, tests/init-gen/generate.test.js ~466)
- **AC-20260823-02-7**: WHEN the host's `.gitignore` is a directory THE SYSTEM SHALL CONTINUE
  TO exit 4 with a stack and re-run remedy → tag the existing boundary test (currently
  AC-20260822-02-19, ~493)
- **AC-20260823-02-8**: WHEN `generate` runs with a valid profile against a host whose
  settings carry an existing allow entry and a deny entry shadowing a config-derived allow
  THE SYSTEM SHALL CONTINUE TO preserve both and exit 0 with the conflict line printed → tag
  the existing merge-preserve test (currently AC-20260822-02-6, ~237)

## Assumptions (escalation triggers)

- A1: After D1/D2, no JSON-representable profile value can make the merge computation throw —
  `String(c)` in `deriveAllowEntries` throws only on symbols, which JSON cannot carry; every
  other access in `mergeSettings` short-circuits on falsy/non-object shapes. **if false:**
  D3's boundary turns it into exit 4 with a stack; record the counterexample in the
  deviations sidecar, do not add enumeration mid-build.
- A2: `fs.readFileSync` on a directory raises `e.code === 'EISDIR'` on this platform —
  spiked 2026-08-23: observed `EISDIR` on darwin. **if false** on some host platform: the
  default arm keeps the generic cannot-read message, still exit 2 — degraded remedy, correct
  refusal.
- A3: 7.22.0 is free at build time (re-derived 2026-08-23: main is at 7.21.0). **if false:** bump to the next free version and record
  the deviation (recorded semver-race class; the literal is a target, not a pin).
- Micro-spikes executed 2026-08-23 (one Node process, scratchpad, deleted): (1)
  `[...new Set([...("Bash(bun x *)" || [])])]` → 12 unique one-char entries — the exit-0
  corruption; (2) `[...(42 || [])]` → TypeError `is not iterable`; (3) `"tests" in 42` →
  TypeError `Cannot use 'in' operator`; (4) `readFileSync(<dir>)` → `e.code === 'EISDIR'`;
  (5) `node -e 'throw new Error("x")'` → exit code 1, confirming the documented-code
  collision the bare throws cause today.

## Rationale

This is the follow-up the parent review's waiver promised: the fix loop was capped at two
iterations and both were spent, so JJ waived round 3's findings into their own spec
(rv_e83659d49386, recorded in specs/20260822/02 Rationale) rather than take an uncovered
escalation. The design was settled there by the third Fable consult and is applied verbatim,
not re-litigated: shape-check what cannot throw (a string spread corrupts silently at exit 0 —
the one class no boundary placement can see), boundary-wrap what cannot be enumerated, and
never widen the exit-code alphabet. D3 deliberately carries no new AC: once D1/D2 land, no
JSON-representable input reaches a throw inside the merge, and manufacturing one would mean
fault injection, which the host's behavioral-test rule (exec real scripts against synthetic
hosts) rejects; the boundary's reachable trigger stays pinned by AC-7. Rejected alternatives,
per the same ruling: an all-or-nothing staged writer (rejected in round 2 — `manifest-check.sh`
executes against real files and D3 of the parent sanctions written-but-unstamped as the
recovery state) and element-type validation inside `extraAllow`/`extraDeny` (more enumeration
for a non-silent failure: a junk entry lands visibly in the settings.json diff and breaks
nothing structurally — live with it; revisit only if a real host trips it). `brief: n/a`
because this is review-debt, not roadmap scope — brief 11 closed with the parent spec and its
derived status must not reopen. Fragile to watch: AC-5's red edge is the NOT-`chmod` assert,
since the current wrong message already happens to contain the word "directory" inside Node's
error text.

## Canonical Delta

docs/canonical/bootstrap.md, "The settings merge-preserving invariant" and exit-code notes:
add that pre-flight profile validation also enforces `settings.extraAllow`/`extraDeny` as
arrays when present and `config.agentMap`/`rules.sections` as plain objects (all exit 2,
nothing written); the unreadable-settings refusal names a directory as a directory (remove or
replace it) and reserves the `chmod` remedy for permission errors; the settings merge is
computed inside the exit-4 boundary, still ahead of every write, so any residual
settings-derived throw is an exit 4, never a bare Node exit 1.
