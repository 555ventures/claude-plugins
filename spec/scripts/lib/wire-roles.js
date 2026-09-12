// Usage: const { RETIRED_TO_CURRENT, CURRENT_ROLES, renameRoles } = require('./lib/wire-roles')
//
// The one table naming the wireframe register's retired-to-current role rename, and the one
// function that applies it. Owner: specs/20260912/08-the-register-is-the-whole-shadcn-set.md
// D6, AC-20260912-08-6. mocks-driver.js's `--refresh-register` arm and this file's own pinning
// test (tests/mocks/register-refresh.test.js) both read RETIRED_TO_CURRENT from here rather than
// spelling the map twice.
//
// `muted` and `muted-bg` trade places (the retired register used `--muted` for a text colour and
// `--muted-bg` for a surface; the current register's `--muted` is the surface and
// `--muted-foreground` is the text). renameRoles(text) MUST apply the whole map as one
// simultaneous substitution — String.replace with a single global regex walks the source once
// and decides each match's replacement from the ORIGINAL text, so a match already consumed as
// `muted-bg` is never re-visited as `muted`. Two sequential String.replace passes (rename
// `muted` first, then `muted-bg`) would instead collapse both roles onto `--muted-foreground`
// and silently grey out every body of text a host repo draws.
//
// What this deliberately does NOT do: read or write a file (callers pass text; mocks-driver.js's
// `--refresh-register` arm owns every read/write and the rewritten-file count), decide whether a
// register is retired/current/neither (that classification is CURRENT_ROLES vs. a candidate's own
// declared names, read by the caller), or touch a bare word outside `var(--<role>)`/`--<role>:`
// syntax — the retired short name "bg" appearing in prose or a class name is untouched.
//
// Exit codes: N/A — this is a library module, not an entry point.

'use strict'

// RETIRED_TO_CURRENT — the five roles the retired eleven-role register spelled differently from
// shadcn Neutral. `border`, `primary`, `ring`, `radius`, `font` and `shadow` keep their names and
// are not listed — a name absent from this map is left untouched by renameRoles.
const RETIRED_TO_CURRENT = {
  'bg': 'background',
  'fg': 'foreground',
  'muted': 'muted-foreground',
  'muted-bg': 'muted',
  'primary-fg': 'primary-foreground',
}

// CURRENT_ROLES — the twenty-two names Contracts § The register declares, in file order:
// eighteen shadcn Neutral colour roles, --radius, and the three pipeline-local roles.
const CURRENT_ROLES = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted',
  'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring',
  'radius', 'font', 'shadow', 'shadow-lg',
]

// Longest names first: without this, the alternation would match the "muted" prefix of
// "muted-bg" before ever trying the five-character alternative, leaving a dangling "-bg" the
// lookahead below then has to reject on a technicality instead of matching the whole name.
const RETIRED_NAMES = Object.keys(RETIRED_TO_CURRENT).sort((a, b) => b.length - a.length)
// Matches the bare role name after `--` (in `var(--<role>)` or a `--<role>:` declaration) as
// long as it is not immediately followed by another word/hyphen character — the same guard
// distinguishes `--muted` from `--muted-foreground` and `--bg` from any longer role that happens
// to start with "bg".
const RENAME_RE = new RegExp('--(' + RETIRED_NAMES.join('|') + ')(?![\\w-])', 'g')

function renameRoles(text) {
  return String(text).replace(RENAME_RE, (_, name) => '--' + RETIRED_TO_CURRENT[name])
}

module.exports = { RETIRED_TO_CURRENT, CURRENT_ROLES, renameRoles }
