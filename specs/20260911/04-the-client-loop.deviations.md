# Deviations — 20260911/04-the-client-loop

- D10 (viewer.css, session-authored): the register adds one rule outside the literal list in the
  decision — `.wk-msg`, the client's receipt line. The class was already emitted by
  `lib/walk-page.js` but had no rule in the stylesheet, so the receipt rendered as an unstyled
  paragraph on a client-facing surface. Styled as a quiet muted line, no new token. Forced but
  unblocking: D11's look stop would have caught it and D10's own scope is "the client-facing
  chrome register".
- D10 (viewer.css, session-authored): the `Coming soon` row is styled through
  `.wk-j[data-ready="false"]` rather than a new `.wk-ask-*` class. D10 lists the row as part of
  the register's coverage, not as a class-name requirement; the existing `.wk-j` row already
  carries the attribute the state is derived from, so a parallel class would be a second source
  of truth for the same fact.
- D10 (viewer.css, session-authored): the composer's selected reason chip is marked with
  `aria-pressed="true"` rather than the `.nl-chip-on` modifier-class convention the notes-layer
  chips use. The client player is a keyboard- and screen-reader-facing surface (unlike the
  session-only notes layer), so the selected state is carried by the accessible attribute and the
  CSS keys off it. Recorded because it departs from the sibling register's idiom.
- D4 (lib/walk-page.js): a not-ready ("Coming soon") journey row renders its title as plain text
  followed by an em dash, not wrapped in its own `<span class="wk-j-name">` the way a ready row's
  name is. AC-20260911-04-5's regex captures the not-ready `<span data-ready="false">`'s content up
  to its own first `</span>`; a sibling name span closing before the meta span ever opens would end
  that capture on "billing" alone, never reaching "Coming soon". Forced by the oracle's own
  structural assumption, not a taste choice — the ready-row markup (two sibling spans) is
  unchanged, since the AC-6 oracle never scans a ready `<a>` row the same way.
- D7 (mocks-driver.js `notes address`): addressing a client-origin project-scope note with
  `--screen`/`--journey` additionally validates the value against disk (`design/mocks/<label>.html`
  exists / the journey is declared in seed.md) before writing, refusing otherwise. Neither the
  Decision nor any AC pins this — added for symmetry with every other flag this driver validates
  against disk (e.g. `ledger add --screen`, `notes add --kind walk --screen`) and to avoid writing
  a dead link the client index's "See ⟨journey⟩" control would 404 on. No test exercises the
  refusal; kept minimal (two `fs.existsSync`/`Set.has` checks) so it cannot itself become a
  collision surface.
