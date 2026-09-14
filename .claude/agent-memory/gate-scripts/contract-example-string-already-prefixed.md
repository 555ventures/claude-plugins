---
name: contract-example-string-already-prefixed
description: a Decision's "<leg>:<reason>" print-format prose can describe a string a sibling Contracts-block derivation ALREADY returns fully formed — don't re-prepend the leg name
metadata:
  type: feedback
reviewed: 2026-09-13
---

When a Decision's line-format prose reads like a template — e.g. D3 in
specs/20260913/08-silence-is-not-a-pass.md: `UNMEASURED: <leg>:<reason>[,<leg>:<reason>…]` —
check whether the `<reason>` value, as actually produced by the Contracts block you already
implemented (here `unmeasuredReason(row)` in [[release-unmeasured-js-derivation]]), already
embeds the leg name itself (`'ci:unavailable:no-adapter'`, `'substrate:nothing-executed'`).
Concatenating `row.leg + ':' + reason` on top of that produces a doubled prefix
(`ci:ci:unavailable:no-adapter`) that only a real test run against the actual Contracts example
strings catches — reading the Decision prose in isolation looks correct.

**Why:** caught only because AC-20260913-08-5/-6's exact expected strings
(`UNMEASURED: ci:unavailable:no-adapter`) were asserted byte-for-byte; a looser assertion (regex
substring match) would have let the double-prefix bug ship silently in both `release-legs.js`'s
summary line and `verdict.js`'s UNVERIFIED stderr cause message (same bug, same fix, in two
call sites).

**How to apply:** whenever a Decision's print-format template names a field that is itself the
output of a shared `lib/*.js` derivation cited elsewhere in the same spec, print the derivation's
return value directly — never re-derive or re-prepend a piece of it that the Contracts block's
worked examples show is already inside the string.
