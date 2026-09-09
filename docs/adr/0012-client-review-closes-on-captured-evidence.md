# 0012. Client review closes on captured evidence: the screen is captured when a client note is raised, the session cannot resolve a client note, and a dated waiver is the only release for a silent client

- Status: accepted
- Date: 2026-09-09
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (two read-only code and spec sweeps, 2026-09-09)
- Applies to: ADR-0010 § Decision, the **CLIENT** paragraph, and brief 22a's CLIENT paragraph
  (`docs/roadmap/22a-mocks-is-wireframes.md`), both of which define the closure signal as "the
  diff of the wireframe frame between the note's timestamp and the resolution commit". Queue
  entry q116 (`specs/20260907/10-client-review.md`, not yet planned) inherits that wording and is
  re-pointed here. `spec/doctrine/mocks.md` § Mocks: Page Notes line "Client review is the
  same page and the same notes — there is no review state" is superseded.

## Context

ADR-0010 made the client pass load-bearing: `APPROVED` means every client note closed, and a
closure typed by the session is refused because it drifts to "fixed, thanks". The only
sanctioned closure is a derived before/after of the wireframe frame. Two sweeps on 2026-09-09
found that the pass as written cannot be built without either a large detour or a silent hole.

**The before-frame does not exist anywhere.** No screenshot, DOM snapshot or content hash is
taken at any point in the pipeline; `render-capture.js` states in its header that it
deliberately does not screenshot or diff. Deriving the "frame at the note's timestamp" at
resolution time therefore means rendering a historical git tree through the screenshot path —
a spec of its own, and the reason the client spec was deferred twice.

**A file-based "has this screen changed" check is unsound.** A screen's render walks up into
`design/kit/`, `design/shell/` and `design/tokens.css`. A fix for a note about one screen
routinely lands in the kit; a modified-time check on the mock file misses it and refuses a real
fix. It also refuses every note that closes without any change — "discussed on the call",
"not a defect" — which pushes those into a fake edit or a waiver.

**Anyone can close anyone's note.** Identity is a name typed into a browser prompt. The
resolve handler never compares the resolver to the author. So "approval refuses while a client
note is open" is void the moment the session resolves the client's note itself — precisely the
act ADR-0010 forbids, with nothing enforcing it.

**Silence has no rule.** ADR-0010 blocks approval on an open client note and says nothing
about a client who never returns. A gate with no exit is a gate that gets bypassed off the
record.

**The stage's output is ledger rows, not notes.** The design stage closes when every product
row is `said-by-user`, `ratified-doc`, `confirmed` or `overridden`. The only action that moves a
row is answering a pinned question on the served page. Free-form notes are secondary. Any
client pass whose close condition counts notes and not questions can be satisfied by a client
who reads nothing.

## Options

**A. Keep ADR-0010 verbatim: derive the before-frame from git at resolution time.** Rejected.
It is the historical-render spec in disguise, and it is the reason the pass has slipped behind
two other specs.

**B. Replace the derived signal with a file-changed check and a typed fix note.** Rejected.
The check misses kit fixes and refuses no-change closures (above), and it hands closure back
to the session, which is the drift ADR-0010 exists to prevent.

**C. Capture the screen when the client note is raised, derive closure from that capture
against the live render, refuse session resolve on client notes, and release a silent client
only by a dated waiver that prints at approval.** Accepted.

## Decision

**Origin is decided by the write path, never by the typed name.** Every note carries
`origin: walk | client | session`, set by the server from the route the request arrived on. A
client-supplied `origin` is refused, the same way a client-supplied `kind` is refused today.
Notes written before this record default to `session`.

**A client note captures its screen when it is raised.** A mock-scope note arriving on the
client route captures the anchored screen at its anchored state, at the client viewport (the
first `design/targets.json` viewport, per q94), through the screenshot path the look command
already uses. The image is stored beside the notes file and its content hash is recorded on the
note. Project-scope notes capture nothing; they close by client acceptance or waiver only.

**Closure is derived from the capture, and the session cannot complete it.** A client-origin
note moves to `addressed` only when the driver records a fix: it captures the screen again,
refuses when the new hash equals the stored one, stores the after image, and the served page
renders before and after side by side under the note. It moves to `resolved` only by the client
accepting on the client route, or by waiver. Resolve requests for a client-origin note from any
other route are refused. A typed closure line remains refused, as in ADR-0010.

**A note that needs no change is withdrawn by the client, never declined by the session.** The
session may reply to a client note; the reply is shown to the client; the note stays open until
the client withdraws it, accepts a fix, or a waiver lands.

**A dated waiver is the only release for a silent client.** The session may waive a
client-origin note with a reason, and only once seven days have passed since the note's last
client action. The waiver is stored on the note with date, reason and who waived. Approval
prints the waived count and every waived note's reason, the way the bespoke count prints at
sign-off — the approver decides against a number, never a checkbox. There is no blanket waiver.

**CLIENT is a driver state, and its close condition is the ledger.** `CLIENT` opens only when
the walk scope is at zero and the exposed address answers. It closes toward `APPROVED` only
when every product-kind question visible to the client is answered or waived **and** every
client-origin note is resolved or waived. The client route serves product-kind rows only and
never shows walk-origin notes. The doctrine line "there is no review state" is rewritten.

## Consequences

- The deferred "before/after render" item stops being a third spec: it is the stored capture
  and the live render, already required by closure. The client pass is two specs — the driver
  half (state, origin, capture, closure, waiver) and the served client view (whole-project
  entry, product-only filtering, address check) — planned in one brief, the second not
  deferrable, since the first is unobservable without it.
- q116 is re-pointed at this record. Its inherited closure wording is replaced by the capture
  rule above; the viewport rule it folded in from q94 survives unchanged.
- ADR-0010 and brief 22a gain an `Amended by: ADR-0012` line on their CLIENT paragraphs.
  `spec/doctrine/mocks.md` § Mocks: Page Notes drops the no-review-state sentence.
- The notes file is a whole-file overwrite with no lock. Two writers — the client and the
  session — now write it concurrently by design, so the driver spec owes an atomic write.
- Nobody has watched a real client on these pages. The first client run on a real host is
  observed before the second spec is locked, and the seven-day waiver window and the
  withdraw-not-decline rule are the first things to revisit from that observation. If clients
  never leave notes and only answer questions, the note machinery above shrinks and the
  question close condition is the whole gate.
