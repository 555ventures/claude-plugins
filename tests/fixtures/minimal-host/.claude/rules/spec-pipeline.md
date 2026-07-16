# Spec Pipeline Rules (fixture)

Synthetic minimal host for the plugin's own tests — the smallest grounding layer that
satisfies the contract's required sections. Content is representative, not real.

## Risk Tiers

- T3: none declared (fixture).

## Planning

- No registry lookups (fixture).

## Build

- No host-declared escalation triggers.

## Worker Rules

- No generated/managed surfaces.

## Test Rules

- Tests run via `true` (fixture).

## Review Checks

- None beyond plugin defaults.

## Gotchas

- [plugin] The File Plan template omits the `package.json` dep row for a first
  cross-workspace import — rediscovered here; see specs/20260101/01-fixture.md.
- [host] Local convention: fixture rows are illustrative and never executed.
