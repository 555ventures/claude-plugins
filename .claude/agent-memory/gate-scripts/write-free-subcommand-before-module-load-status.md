---
name: write-free-subcommand-before-module-load-status
description: how to add a zero-write CLI subcommand to a driver whose module-level `let status = loadStatus()` unconditionally creates status.json/ledger.md/seed.md on a cold root
metadata:
  type: feedback
  reviewed: 2026-09-10
---

When a driver script (e.g. `mocks-driver.js`) does `let status = loadStatus()` at module top
level, and `loadStatus()` mkdirs + copies template files (ledger.md, seed.md) plus writes a
fresh `status.json` the instant it's missing, ANY new subcommand that must guarantee zero
writes on an absent-state root (e.g. a `theme state` read-only deriver, specs/20260907/06 D1)
has to be dispatched and `process.exit()`ed BEFORE that `let status = loadStatus()` line runs —
not folded into the normal dispatch chain near the bottom of the file.

Sibling subcommands that don't carry that same "writes nothing" contract (e.g. `theme
compose`/`open`/`adopt` in the same spec) do NOT need this treatment — dispatch them normally,
after status loads. Loading status as a side effect (creating status.json on a cold root) is
harmless for them since their own Contracts never promise absence of status.json, only that
they don't corrupt specific fields (e.g. D5: adopt leaves `status.marks`/`status.theme`
untouched — that's a value-equality check, not a "the file must not be written" check, so
routing them through the module's already-loaded `status` global and reusing `saveStatus()` is
correct and much simpler than threading a lazy-load everywhere).

**Why:** avoids a much larger refactor (making `status` lazy everywhere it's referenced) for a
constraint that only actually binds ONE subcommand.

**How to apply:** before inventing a lazy-load wrapper around a module-level state loader,
check whether the "write nothing" contract applies to literally one subcommand — if so, hand-
roll that one subcommand as a self-contained function using only `fs`/`path`/`root`/
`templatesDir`-style consts already available before the loader line, and call+exit it in a
one-line `if` guard placed textually above the loader call. Every other subcommand keeps using
the shared post-load dispatch chain untouched.
