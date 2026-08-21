# Deviations — specs/20260820/08-config-name-ban.md

- (tests worker, 2026-08-20) AC-20260820-08-9 / `review-legs.js`: the AC's own worked example
  ("stderr contains `cannot read .claude/spec.config.json under --root`") names review-legs.js:77's
  message, but that message sits behind `readConfig(root)` throwing — and `readConfig` never
  throws (it swallows every read/parse failure to `{}` internally, unchanged by AC-12). That
  branch is dead code under every `--root` value, so `tests/host-config/host-config-api.test.js`
  instead executes the reachable remedy: an absent/unreadable config degrades to `{}`, `gateCommand`
  is then reported missing (line 81's message), which is one of the same seven D9 remedy strings
  and does render `.claude/spec.config.json`. Not treated as blocked — AC-9's normative text ("any
  of the seven remedy strings … render the path") is satisfied by the reachable one; only the
  AC's illustrative example was unreachable.
- (tests worker, 2026-08-20) AC-20260820-08-9 / `review-legs.js`: the test above is vacuous as a
  red pre-implementation pin — the current source already hardcodes the literal
  `.claude/spec.config.json` in that message, so the assertion passes both before and after D9's
  CONFIG_RELPATH interpolation lands (the string value is unchanged; only its construction
  mechanism changes). Per this repo's rules § Gotchas (the generalized vacuous-rejection/output
  entry, 4th/5th occurrence), the test is kept as the correct post-implementation assertion rather
  than reddened artificially — the source-level proof that the literal is gone in favor of
  `CONFIG_RELPATH` is `tests/host-config/config-read.test.js`'s production pin
  (`scanConfigReadOffenders(spec/scripts/)`), which is genuinely red pre-migration on this exact
  line (`review-legs.js:81`).
- (orchestrator, 2026-08-20) **A1 was stale on `fleet-reader.js`.** The spec's migration table lists
  eight lines in five files, including `fleet-reader.js:82` as
  `fs.existsSync(claudeDir + '/spec.config.json')` with a five-line "Do not tidy" comment above it.
  At `diff_base` 5628834 that site had already been migrated to `configPathFor(dir)` with a
  two-line comment — the 2026-08-20 review of specs/20260820/05 landed it as "review fix 6".
  Executed at Phase 0: the D2/D4/D5 predicate over `spec/scripts/` reported seven offenders in four
  files (`env-preflight.js:64,70`, `fidelity-check.js:121,570`, `review-legs.js:77,81`,
  `spec-design-driver.js:336`), not eight in five. Per A1's own escalation clause the actual set was
  migrated; D8's substance still applied in full (probe → `configExists`, comment block replaced).
- (orchestrator, 2026-08-20) **D14 — retired-literal collision, ruled and recorded in Decisions.**
  `tests/fleet-reader/review-fixes.test.js` ("review finding 6") pinned both `/configPathFor\(/` in
  the reader's source and `typeof hostConfig.configPathFor === 'function'`. D7 retires that name at
  the export boundary and D8 retires that call site, so the pin was a live assertion of a retired
  literal sitting outside the File Plan — the exact class this repo's rules § Gotchas prescribes
  updating in place and retagging. Retagged to AC-20260820-08-8; the anti-concatenation assertion in
  the same test was kept verbatim. The lock-time collision-closure literals leg missed it because it
  swept the literals this spec *inherits* (`d10-predicate-v1`, `DISPLAY_JOIN_EXEMPT`,
  `display-join`), not the one it *retires* (`configPathFor`).
- (orchestrator, 2026-08-20) **D15 — AC-20260820-08-14 had no carrier.** The AC cites "the existing
  version-bump consistency test"; executed at Phase 0, no test under `tests/` reads
  `spec/.claude-plugin/plugin.json`'s `version`, so the AC would have been reported uncovered by
  `ac-matrix.js` at review. Closed with `tests/consistency/plugin-version.test.js`, pinning the
  durable invariant (semver shape, numerically greater than 7.11.0, exactly three changelog
  versions, leading changelog version equals the declared version) rather than the literal `7.12.0`
  — § Gotchas records that a spec's literal version number is a target, not a pin.
- (orchestrator, 2026-08-20) **Red-check note: most of this spec's ACs are green-by-construction.**
  The guard IS the test — `offendingLine` and `scanConfigReadOffenders` live inside
  `tests/host-config/config-read.test.js`, so AC-1/-2/-3/-4/-7/-10/-11/-13/-15/-16 pass the moment
  the test author writes them; there is no separate implementation for them to redden against. The
  file-level red that the red-check actually observed came from the production pin
  (`scanConfigReadOffenders(spec/scripts/)` reporting the seven live migration sites), plus AC-5/-6
  (missing exports) and AC-9's `fidelity-check.js` leg (missing `.claude/` prefix): six failing
  assertions across the four test files, every one attributable to the spec's contract. Recorded
  because "13 of 14 tests green at red-check" reads as a weak TDD phase and is not — it is the
  shape of a spec whose deliverable is a predicate that lives in a test file.
- (orchestrator, 2026-08-20) **The Contracts block's NUL-byte claim is stale.** It states that
  `fidelity-check.js` carries a stray NUL byte that makes `grep` classify it as binary, and both the
  Contracts block and the Rationale's out-of-scope note rest on that. Executed at Phase 4: the file
  contains zero NUL bytes at `diff_base` and after the migration (`file` reports "Unicode text,
  UTF-8 text"). Nothing changes — the pure `fs` walk is the right mechanism on the independent
  grounds D4 gives (extension- and type-blind inspection) — but the Rationale's "standing landmine
  for every future grep-shaped tool" and its implied one-line follow-up fix are describing a
  condition that is not in the tree.
