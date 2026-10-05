# 0033. Connect is the one writer

- Status: accepted
- Date: 2026-10-05
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261005/01-connect-wires-a-project-to-the-review-service.md)
- Applies to: ADR-0031 — the clause "read from the named environment variable at call time and
  never printed or written" amended: a stored token is read first, and one script writes it.
- Amended by: —

## Context

ADR-0031 had the client read the token from the environment variable the config names, at call
time, and never print or write it. Wiring a project therefore meant hand-copying a token into a
shell and hand-writing the config block. A session started before the variable existed never
sees it, so the session that set up the link could not send screens without a restart.

## Decision

- **One writer (D1).** A new script, `walkthrough-connect.js`, is the only writer of the host's
  `walkthrough` block and of the stored token. `walkthrough.js` gains no verb: it still never
  edits the host's config and never writes or prints the token.
- **Where the token lives (D6).** `env.<tokenEnv>` in the host's `.claude/settings.local.json`,
  other keys kept, written atomically, a new file created `0600`. The run is refused unless git
  reports that file ignored, and the token is printed nowhere and written to no other file.
- **How the client reads it (D7).** The non-empty string at that settings key, else the
  environment variable. `check`, every service verb and the connect probe share this one rule.
  The stored value comes first because connect has just proved it; an exported one may be stale.

## Consequences

- The clause in ADR-0031 now reads: read the stored token first, then the environment variable
  at call time; the client never prints or writes it, and only connect writes it.
- The grounding contract's `tokenEnv` clause changed, so hosts owe a `/spec:doctor` re-stamp.
- The `no-token` remedy names `/spec:connect` before the manual export.

## Applies to

- ADR-0031 — the token rule in the client's contract.
