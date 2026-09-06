# 0007. Plugin-owned browser capture is a fallback for mock-only rendering

- Status: accepted
- Date: 2026-09-05
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (executed spike on 31 Hearwell mocks, no panel)
- Applies to: ADR-0002 D1

## Context

Specs/20260824/01 D1 ruled the plugin never launches a browser itself — the host declares how
a URL becomes an inventory, and `render-gate --mocks` refuses any host with no
`design.render.capture` (ADR-0002, § Consequences: "a render path per host becomes a hard
requirement"). No mocks-first host has ever declared one — not Hearwell, not any genesis-born
product — so no rendered adaptation check has ever run on a mocks-first product: `/spec:mocks`'s
`journey-approved` and `approved` marks run only the static `design-atlas.js check --matrix`,
which cannot see a phone-width column centred on a desktop cell or a horizontal overflow, the
exact escapes the rendered `no-overflow`/`desktop-fill`/`line-length` rules exist to catch
(specs/20260831/02, specs/20260905/05).

An executed spike (2026-09-05) captured all 31 Hearwell mocks with an installed Chrome driven
over the DevTools protocol using only Node built-ins (global `WebSocket`, no dependency): ~60
lines, 2.2–3.4 s to launch a browser, ~0.4 s per additional page in the same browser via a
`--batch` call.

## Options considered

- **A. Leave `render-gate --mocks` host-declared only** — the D1 status quo; no mocks-first
  host has ever satisfied it, so the rendered gate stays permanently unreachable for the
  product this repo's own genesis flow produces.
- **B. Plugin-owned capture, warn-and-approve on no browser** — approves a mark the gate never
  actually checked; a JJ-rejected shape (fail-open where fail-closed was cheap).
- **C. Plugin-owned capture, fail-closed on no browser** — a machine with no Chrome refuses the
  mark naming the remedy (`CHROME_BIN`, install Google Chrome, or declare
  `design.render.capture`); a host that already declares its own capture command is untouched.

## Decision

**Option C.** `render-capture.js` ships in the plugin as a dependency-free fallback: Node
built-ins only, the host contract flags verbatim, plus a plugin-internal `--batch` (one Chrome
launch for every cell in a mark) and `--which` (resolve-and-print, exit 2 naming the remedy
when no browser is found). `render-gate --mocks` uses it only when the host declares no
`design.render.capture`; `--spec` mode (which needs a host component URL, not a static mock
file) is untouched entirely, and a host that already declares its own capture command sees no
change. With no `design.rulesManifest`, the same fallback mocks-first host runs the plugin's
own `spec/templates/adaptation-rules.json` (no-overflow, desktop-fill, line-length) rather than
skipping rule checks outright — a mocks-first host has no genesis manifest to declare one. The
mocks driver runs this gate at `journey-approved` and `approved`, refusing the mark on any
finding or on a machine with no browser.

The single most important reason: D1's "never launches a browser" bought two things — no
dependency, and no named tool family. This decision keeps the first (Node built-ins, no
package) and gives up the second only as a fallback whose only job is rendering a static mock
file the plugin itself owns; a host's component path is never touched.

## Consequences

- `render-gate --mocks` no longer requires `design.render.url` or a `design.render` block at
  all; `--spec` mode's preconditions are unchanged.
- A machine with no installed Chrome and no `CHROME_BIN` fails `journey-approved`/`approved`
  closed, never a silent pass — the same fail-closed posture the gate already held for a
  declared-but-broken capture command.
- `spec/templates/adaptation-rules.json` becomes a second, narrower default manifest
  (viewport-physics rules only) alongside `spec/templates/design-rules.json` (the full
  taste-inclusive template); a mocks-first host that later adopts a genesis manifest supersedes
  it the same way a declared `design.render.capture` supersedes the plugin capture.
- ADR-0002's § Consequences line "a render path per host becomes a hard requirement" now reads
  with this fallback as its stated exception for mock-only rendering; ADR-0002 gains an
  `Amended by: ADR-0007` line.

## Dissents

- **Extend the fallback to `--spec` mode** — rejected: `--spec` mode compares a mock render
  against a component render reached through the host's own catalog/story URL; the plugin has
  no way to resolve that URL without the host declaring it, so there is nothing for a
  plugin-owned capture to fall back to there.
