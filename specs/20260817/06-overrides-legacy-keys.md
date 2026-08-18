---
date: 2026-08-17
status: implementing
tier: standard
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 4a40b4ff88a827dc755cb2fb433d0883c20097c6
---

# Overrides file: legacy and annotation keys must not parse as project names

## Goal

A user config written for the pre-0.9.0 direct-Telegram daemon (`botToken`,
`supergroupId`, `allowedUserIds`, `lanes` at top level), or any config using the
JSON-comment convention (`_comment` — the plugin's own `config.example.json` ships one),
currently crashes `autopilotd` at boot with `unknown project "botToken"` and the wrong
remedy (`re-run autopilot discover`). After this spec, retired host keys are ignored with
one warning naming the migration, `_`-prefixed keys are ignored silently, and a genuine
typo still refuses boot exactly as today. Observed live 2026-08-17 on this machine's own
`~/.config/autopilot/config.json`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `loadHubConfig` recognizes a closed `LEGACY_HOST_FIELDS` set — `botToken`, `supergroupId`, `allowedUserIds`, `lanes` — skips them (values never consumed), and prints ONE stderr warning per invocation naming the retired keys found and the remedy: `retired direct-Telegram key(s) in <path>: <keys> — the hub-era daemon ignores them; delete them (autopilot enroll owns credentials now)`. Never fatal, never treated as project names. | These are exactly the host fields the 0.9.0 hub rewire deleted; a legacy config predates the rewrite and must degrade with a migration pointer, not a misleading typo error. |
| D2 | Top-level keys starting with `_` are ignored silently in `loadHubConfig` (no warning) — the annotation convention the plugin's own `config.example.json` uses (`_comment`). | The shipped example, copied verbatim as its own comment instructs, must not crash the daemon it documents. |
| D3 | `doctor.js`'s overrides check applies the same two rules: `_`-keys silent; legacy keys produce an `ok: false` line `retired direct-Telegram key(s): <keys>` with remedy `delete them from <path> — the hub-era daemon ignores them`, distinct from the unknown-project line; genuinely unknown keys keep today's line verbatim. | Doctor and boot must tell the same story or the doctor's green contradicts a boot crash (and vice versa). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/daemon/config.js | edit | scripts | D1 LEGACY_HOST_FIELDS skip+warn, D2 `_`-prefix silent skip, in the loadHubConfig key walk |
| autopilot/daemon/doctor.js | edit | scripts | D3 mirror in the overrides-file check |
| tests/autopilot/config.test.js | edit | tests | AC-20260817-06-1, AC-20260817-06-2, AC-20260817-06-3 |
| tests/autopilot/doctor.test.js | edit | tests | AC-20260817-06-4, AC-20260817-06-5 |

## Contracts

`LEGACY_HOST_FIELDS = ['botToken', 'supergroupId', 'allowedUserIds', 'lanes']` — module
const in `autopilot/daemon/config.js`, exported alongside `HOST_OVERRIDE_FIELDS` (newly
exported too). `doctor.js` imports BOTH from `./config` and retires its private
`HOST_OVERRIDE_FIELDS` copy (doctor.js:37 today duplicates the list — this spec removes
that pre-existing drift seam rather than adding a second one; no require cycle: config.js
requires only `./discover`). The D1 warning goes to **stderr** via `console.error` (boot
narration channel), exactly once per `loadHubConfig` call, listing every legacy key
present in one line.

## Behavior

- Overrides key walk order per key: `HOST_OVERRIDE_FIELDS` → host override (unchanged);
  `_`-prefix → skip silently (D2); `LEGACY_HOST_FIELDS` → collect for the single warning,
  skip (D1); else → lane-override candidate (unchanged, incl. the unknown-project refusal).
- No behavior change when the overrides file is absent or contains only valid keys.

## Acceptance Criteria

- **AC-20260817-06-1**: WHEN the overrides file contains `botToken`, `supergroupId`,
  `allowedUserIds`, and `lanes` beside a valid per-project entry THE SYSTEM SHALL boot
  (`loadHubConfig` returns lanes with the project override applied) and print one stderr
  warning naming all four retired keys (e.g. input keys `["botToken","lanes","prax"]` →
  return has `prax` lane override applied; warning line contains `botToken` and `lanes`)
  → tests/autopilot/config.test.js
- **AC-20260817-06-2**: WHEN the overrides file contains a `_comment` key THE SYSTEM SHALL
  ignore it silently — no warning, no error, return identical to the no-`_comment` config
  → tests/autopilot/config.test.js
- **AC-20260817-06-3**: WHEN the overrides file names a key that is neither a host
  override, a `_`-key, a legacy key, nor a discovered project THE SYSTEM SHALL CONTINUE TO
  refuse boot with the `unknown project` error naming the discover remedy
  → tests/autopilot/config.test.js
- **AC-20260817-06-4**: WHEN doctor reads an overrides file carrying `botToken` THE SYSTEM
  SHALL report an `ok: false` overrides line reading `retired direct-Telegram key(s):
  botToken` with the delete-them remedy, never the `unknown project key(s)` line
  → tests/autopilot/doctor.test.js
- **AC-20260817-06-5**: WHEN doctor reads an overrides file carrying a genuinely unknown
  key THE SYSTEM SHALL CONTINUE TO report the `unknown project key(s)` line with the
  discover remedy → tests/autopilot/doctor.test.js

## Assumptions (escalation triggers)

- A1: `doctor.js` can import from `./config` without a require cycle. **Executed at plan
  time (2026-08-17):** `node -e "require('./autopilot/daemon/doctor.js')"` loads clean;
  `grep require autopilot/daemon/config.js` shows config requires only `fs/os/path` +
  `./discover` — no path back to doctor, so the new import cannot cycle. (Plan-time
  correction: doctor does NOT already import config machinery — it duplicates
  `HOST_OVERRIDE_FIELDS` at doctor.js:37; Contracts now retires that copy.) — **if false:**
  duplicate the four-string list in doctor.js with a comment naming config.js as the home,
  and note the deviation.
- A2: No production caller depends on the crash-on-legacy behavior. Grep evidence: the only
  `names unknown project` consumers are the daemon boot path and its tests. — **if false:**
  STOP, ask the user.

## Rationale

The 0.9.0 hub rewire (specs/20260810/04) deleted direct-Telegram mode and repurposed the
same default config path (`~/.config/autopilot/config.json`) for a differently-shaped
overrides file, with a strict unknown-key refusal (D7 there) to catch typos. That refusal
is right for typos and wrong for the file's own previous schema: every machine enrolled
before 0.9.0 has a legacy-shaped file at exactly that path, so the daemon's first post-
upgrade boot crashes blaming a "project" named `botToken` and prescribing a re-discover
that fixes nothing. The fix keeps the strictness (AC-3 pins it) and carves out only the
two classes whose meaning is knowable: the schema's own retired keys and the annotation
convention the plugin itself ships. Rejected: silently ignoring ALL unknown non-project
keys (defeats D7's typo net); auto-migrating the legacy file (writes to user config the
user didn't ask for).

**Build ruling (2026-08-17):** AC-20260817-06-2's authored baseline built a second
tmpdir/reposRoot, making the compared lane roots structurally different absolute paths —
unsatisfiable for any implementation. The implementation worker blocked rather than edit
the test; the orchestrator repaired the fixture to a same-fixture comparison (one repo
root, only the overrides file differs), assertions unweakened.

## Canonical Delta

docs/canonical/autopilot.md § "Config & overrides" (or nearest section): note that the
overrides parser skips `_`-prefixed annotation keys silently and retired direct-Telegram
keys with a one-line warning; the unknown-project refusal stands for everything else.
