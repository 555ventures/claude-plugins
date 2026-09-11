#!/usr/bin/env node
// design-atlas: deterministic design-artifact tooling (no model, no deps) — shared § Design Atlas.
//
//   design-atlas.js check <file|dir> [...more] [--matrix] [--states]
//                                                  harness gate: labels, tokens link, no off-token
//                                                  colors; at data-status ratified|approved (or
//                                                  --matrix, which also forces the static matrix
//                                                  PRECONDITION checks below onto drafts):
//                                                  border-box reset, declared line-heights, no
//                                                  root device frame, state controls outside the
//                                                  contract — plus, with design/targets.json:
//                                                  viewport meta + dark tokens block. These are
//                                                  static regex reads over markup, cheap
//                                                  preconditions for the matrix, never a
//                                                  measurement that a mock actually adapts at any
//                                                  declared viewport cell — that verification is
//                                                  `render-gate --mocks`'s job (render-rules.js's
//                                                  `no-overflow`/`line-length` kinds) at
//                                                  /spec:sketch's exit (specs/20260831/02 D9).
//                                                  ratified and approved are equivalent for every
//                                                  check (specs/20260824/03 D2); sketch mocks are
//                                                  free of all of the above.
//                                                  specs/20260906/05-gray-states-on-every-wireframe.md
//                                                  D1: --states requires every labeled non-canon
//                                                  mock to declare empty/loading/error via
//                                                  data-state-btn="<name>" (anywhere in the file) or
//                                                  opt a name out via data-no-state="<name>[,<name>]"
//                                                  on the [data-screen-label] root; a shell canon
//                                                  file and an unlabeled mock are exempt; without
//                                                  --states this rule never runs (byte-identical
//                                                  legacy output).
//                                                  specs/20260906/06-sketch-high-fidelity-and-critique.md
//                                                  D1: once design/tokens.css resolves above a
//                                                  labeled non-canon mock (walk-up from the file),
//                                                  a lingering wire/ stylesheet link is a violation
//                                                  at data-status="ratified", a ⚠️ warn at "sketch";
//                                                  data-status="approved" is exempt outright and
//                                                  --matrix never binds this rule; no tokens.css
//                                                  anywhere above the mock = the rule never runs.
//                                                  D3: same ratified/sketch/approved split for a
//                                                  labeled mock with an unresolved (non-"resolved")
//                                                  scope:"mock" note on its own label in
//                                                  design/mocks/notes.json (walk-up resolved); no
//                                                  notes.json anywhere above the mock = no check.
//                                                  specs/20260907/04-kit-canon-family.md D2/D5/D6/
//                                                  D13/D15: once a design/kit/ family resolves
//                                                  above a labeled non-canon mock, each top-level
//                                                  content region must carry data-kit="<key>" or
//                                                  data-bespoke="<key>: <diff>" (violation at
//                                                  ratified/approved/--matrix, ⚠️ warn at sketch);
//                                                  a data-kit-canon file gets D13's family-wide
//                                                  duplicate-primitive sweep instead; two ⓘ lines
//                                                  (per-screen kit/bespoke counts, a final
//                                                  unabsorbed total) print AFTER the CHECK block,
//                                                  informational only; no design/kit/ anywhere
//                                                  above the mock = the rule never runs.
//   design-atlas.js gallery <dir> [--out <file>]   comparison gallery over candidate subdirs (explore rounds)
//   design-atlas.js build [--root <repo>] [--out <file>]
//                                                  the atlas: mocks × roadmap `surfaces` blocks ×
//                                                  design/mocks/seed.md journeys (owner
//                                                  `seed:<journey>`, specs/20260902/07 D15) ×
//                                                  coverage ledger × spec stamps → one browsable
//                                                  page; one frame per data-state-btn state, a
//                                                  `shapes` section for design/shapes/*.html,
//                                                  design/mocks/references/ never walked
//   design-atlas.js serve [--root <r>] [--port <n>]
//                                                  specs/20260902/07 D12: static, no-cache,
//                                                  read-only server over <root>/design/ — first
//                                                  stdout line is the SSH port-forward
//                                                  instruction; exits on SIGINT/SIGTERM.
//                                                  specs/20260909/06 D1: --port 0 binds an
//                                                  ephemeral port; the first stdout line's URL
//                                                  and ssh -L hint name the bound port
//                                                  (server.address().port), not 0.
//                                                  specs/20260902/10 D2: every served text/html
//                                                  response gets the page-notes layer script
//                                                  injected before </body> unless the request
//                                                  carries ?clean; /__notes/* exposes
//                                                  notes.js, viewer.css, list, add, resolve, answer
//                                                  (address/reply are driver-only, never HTTP).
//                                                  specs/20260906/03 D3: /__notes/list joins
//                                                  claim/rejected/tag/status from the ledger row
//                                                  onto every question note it returns; POST
//                                                  /__notes/answer is the one path that both
//                                                  rewrites the ledger row's status (confirmed/
//                                                  overridden <today>) and resolves the question;
//                                                  /__notes/resolve 400s a question, naming
//                                                  /__notes/answer; /__notes/add 400s a body
//                                                  carrying kind/ledgerId (questions are
//                                                  session-authored).
//                                                  specs/20260907/10-client-review.md D4: every
//                                                  /__notes/* route above is also mounted at
//                                                  /client/__notes/* — the client route strips the
//                                                  leading /client segment and re-dispatches
//                                                  identically, except origin stamping ("client"
//                                                  instead of "session") and /client/__notes/list's
//                                                  question-plus-client-origin-only filter.
//                                                  specs/20260905/01 D2: every served page also
//                                                  carries a <meta name="notes-scope"> tag (mock
//                                                  for a static file, project for the derived
//                                                  index) so the notes layer never guesses its
//                                                  scope; /__picks/list and /__picks/decide
//                                                  expose design/mocks/picks.json's look stops
//                                                  through lib/mocks-picks.js.
//                                                  specs/20260906/04 D1: GET /review/<j>.html
//                                                  derives the journey review page on every
//                                                  request (lib/review-page.js), 404 for an
//                                                  undeclared journey naming the declared ones,
//                                                  ?clean strips the chrome to the artboard grid;
//                                                  GET /__review/review.js serves
//                                                  lib/review.browser.js verbatim, no-store.
//                                                  D2: GET /mocks/<label>.html accepts ?state=<s>,
//                                                  injecting the same DOMContentLoaded click
//                                                  script `look --state` injects, before the
//                                                  notes-layer tag (?clean&state=<s> injects only
//                                                  the click script).
//                                                  specs/20260910/02-click-to-advance-and-real-records.md
//                                                  D3: GET /mocks/<label>.html?walk injects
//                                                  <script src="<prefix>/__walk/walk.js"></script>
//                                                  before the last </body> (after the state click
//                                                  script when both are present); ?walk composes
//                                                  with ?clean (which never strips it) and
//                                                  ?state=; GET /__walk/walk.js serves
//                                                  lib/walk-mode.browser.js verbatim, no-store.
//   design-atlas.js shell sync  [--root <r>] [<mock|dir>…]
//                                                  specs/20260901/04-shell-composed-mocks.md D5:
//                                                  rewrite every declaring mock's chrome region
//                                                  from its shell canon (byte-identical by
//                                                  mechanism, never by an author hand-copying);
//                                                  default walk is <root>/design/mocks and skips
//                                                  `built` mocks unless named explicitly
//   design-atlas.js shell adopt [--root <r>] [--shell <name>] [--apply]
//                                                  D6: migrate a pre-shell mock into the canon —
//                                                  a plan table with no writes, or --apply to
//                                                  strip detected chrome and wrap the rest as the
//                                                  content slot
//   design-atlas.js stop open  --root <r> --kind pick|approve --key <k> --title <t>
//                              --candidates <[group/]label=path>[,…] [--port <n>] [--page <path>]
//                                                  specs/20260905/04-per-project-look-server.md D2:
//                                                  writes the stop (lib/mocks-picks.js) with url
//                                                  http://localhost:<port><page>#stop-<id> (port
//                                                  defaults to 4173, serve's own default; --page
//                                                  defaults to /atlas/index.html), then probes that
//                                                  served page for the stop's own block; prints
//                                                  exactly one stdout line, the url.
//                                                  specs/20260906/04 D6: mocks-driver.js's own
//                                                  `stop open journey:<j>` passes
//                                                  --page /review/<j>.html — every other caller
//                                                  (shapes, theme, signoff) leaves
//                                                  --page unset and keeps the atlas URL.
//   design-atlas.js stop decide --root <r> --id <P…> --verdict pick|approve|change
//                                [--pick <g>] [--note <n>] --by <who>
//   design-atlas.js stop list  --root <r>          one line per non-superseded stop
//
// specs/20260902/09-one-hand-wireframes-one-token-set.md D5: every chrome page (build, gallery,
// serve's index) is emitted by the one `page()` — it inlines spec/templates/mocks/viewer.css (the
// one token set's `--v-*` register, read once per process) ahead of its own rules, and every chrome
// rule below consumes only `var(--v-*)` roles, never a literal color.
//
// check/build/gallery are a file walk + string emit: zero tokens, reproducible output (no
// timestamps), and never edit their inputs. `shell` is the one writer here, and it writes only
// the region it derives (plus a missing css link, plus the data-shell stamp on adopt) — never a
// mock's own content. The shell-region mechanics (the depth-counting tag walk, the D3 splice, the
// D1 canon rule set) live in spec/scripts/lib/shell-region.js, kept outside this file's own
// entrypoint-conformance surface deliberately (specs/20260901/04 D12 — no new spec-paths key).
// Exit 0 = pass/written, 1 = check violations or a `shell sync` refusal, 2 = usage/IO error or an
// ambiguous `shell adopt --apply` with no --shell (`stop decide`'s own refusals — already
// consumed/superseded, bad verdict, … — also exit 2). `serve` runs until SIGINT/SIGTERM (exit 0).
// `stop open` exits 3 when nothing answers its probe of the served atlas within the timeout — the
// stop is written regardless; the exit-3 message names the `serve --root` remedy verbatim.
//
// specs/20260905/01-picks-on-the-atlas-page.md D2: CLI dispatch at the bottom of this file runs
// only under `require.main === module` — the script also exports { buildAtlas, page, frameTag,
// createRequestHandler } so a plain module load (this file's own tests) exposes them without also
// running a CLI command.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { readConfig } = require('./lib/host-config')
const shellLib = require('./lib/shell-region')
const notesLib = require('./lib/mocks-notes')
const { parseLedger, setStatus, appendAssumption } = require('./lib/mocks-ledger')
const picksLib = require('./lib/mocks-picks.js')
const { stylesheetTargets, linksWireRegister } = require('./lib/wire-register')
const surfacesLib = require('./lib/surfaces')
// specs/20260906/04-journey-review-page.md D1: the pure journey-review builder — the served
// GET /review/<j>.html route below adapts parseSeedJourneys()/loadTargets() into its input shape
// and calls it fresh on every request (never cached, never storing derived state).
const reviewPageLib = require('./lib/review-page')
// specs/20260907/10-client-review.md D5/D6: the client route's mock-scope note capture — always
// async spawn (client-capture.js's own contract), never spawnSync, since the capture runs INSIDE
// this same serving process while it is still answering the client's own POST.
const clientCaptureLib = require('./lib/client-capture')
// specs/20260910/03-client-journey-player.md D5/D6: the client player's own pure page builder
// and the one writer of design/mocks/walk.json.
const walkPageLib = require('./lib/walk-page')
const walkLib = require('./lib/mocks-walk')

const die = (msg, code = 2) => { process.stderr.write('[design-atlas] ' + msg + '\n'); process.exit(code) }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const flagArg = (argv, name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null }

function htmlFilesUnder(p, out = []) {
  const st = fs.statSync(p)
  if (st.isFile()) { if (p.endsWith('.html')) out.push(p); return out }
  for (const e of fs.readdirSync(p).sort()) {
    // specs/20260902/07-mocks-command-driver.md D15: design/mocks/references/ holds inspiration
    // material the seed's ## References section may cite by path — it is never a screen and must
    // never surface as a rendered label in check/build/gallery's walk.
    if (e === 'atlas' || e === 'gallery.html' || e === 'references' || e.startsWith('.')) continue
    htmlFilesUnder(path.join(p, e), out)
  }
  return out
}

const labelOf = (html) => (html.match(/data-screen-label\s*=\s*"([^"]+)"/) || [])[1] || null
const statusOf = (html) => (html.match(/data-status\s*=\s*"([^"]+)"/) || [])[1] || 'sketch'
// Optional per-mock framing hint (data-viewport="1440x900") for surfaces that exist to show one
// specific device framing; everything else renders at the primary declared viewport.
const viewportOf = (html) => {
  const m = html.match(/data-viewport\s*=\s*"(\d+)\s*x\s*(\d+)"/)
  return m ? { width: +m[1], height: +m[2] } : null
}
// scrolling="no" + data-w/h: the page script sizes each frame to full content height and scales it
// to the card, so the frame itself never scrolls.
const frameTag = (src, w, h) =>
  '<iframe class="frame" loading="lazy" scrolling="no" data-w="' + (w | 0) + '" data-h="' + (h | 0) +
  '" src="' + esc(src) + (src.includes('?') ? '&' : '?') + 'clean"></iframe>'

// ---- targets -------------------------------------------------------------------------------------
// design/targets.json declares the theme × viewport matrix the product owes (archetype-derived;
// written by the genesis explore state, or the /spec:design preamble on non-genesis repos). Found by walking
// up from the given path; absent = legacy single-frame behavior, no extra checks, no controls.
function loadTargets(fromPath) {
  let dir = path.resolve(fromPath)
  try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir) } catch { dir = path.dirname(dir) }
  for (;;) {
    for (const c of [path.join(dir, 'targets.json'), path.join(dir, 'design', 'targets.json')]) {
      if (fs.existsSync(c)) {
        try { return JSON.parse(fs.readFileSync(c, 'utf8')) } catch { die('unparsable targets file: ' + c) }
      }
    }
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

// ---- hygiene checks (specs/20260824/03 D1/D5) -----------------------------------------------------
// Four measured false-positive classes the render gate can't see for itself, each a regex read over
// the mock's own <style> blocks — same discipline as the color-literal check above (no CSS parser,
// no dependency). A <style> whose braces don't balance is fail-closed (D5): named as a violation and
// excluded from rule parsing, never silently skipped. Bound at ratified|approved|--matrix by the
// caller. Check (a) binds on EVERY bound file, including one with no <style> block of its own:
// D1(a) owes the reset in the file's own <style>, and a mock that externalizes its CSS is invisible
// to (b) and (c) as well, so (a)'s violation is the only signal an author gets that the stylesheet
// the gate reads is not the stylesheet they wrote. Exempting style-less files was the fail-open
// D5's unbalanced-braces rule exists to forbid one case over.
const styleBlocksOf = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1])
// Flat `selector { declarations }` pairs — @media and nested rules are out of scope by design (D5).
const cssRulesOf = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].trim(), decls: m[2] }))

function hygieneViolations(f, html) {
  const out = []
  const styleBlocks = styleBlocksOf(html)
  let rules = []
  for (const css of styleBlocks) {
    const open = (css.match(/\{/g) || []).length
    const close = (css.match(/\}/g) || []).length
    if (open !== close) { out.push(f + ': unbalanced braces in <style> — fix the stylesheet before ratifying'); continue }
    rules = rules.concat(cssRulesOf(css))
  }

  // (a) a universal box-sizing: border-box rule, owed by every bound file (see the note above).
  const hasReset = rules.some(r =>
    r.selector.split(',').some(s => /^\*(\b|::?|\s|$)/.test(s.trim())) &&
    /box-sizing\s*:\s*border-box/.test(r.decls))
  if (!hasReset) {
    out.push(f + ": no universal box-sizing: border-box rule — bordered elements measure 2px larger than the component's border-box")
  }

  // (b) every block declaring font-size also declares line-height, in the same block.
  let fsCount = 0
  let firstSel = null
  for (const r of rules) {
    if (/font-size\s*:/.test(r.decls) && !/line-height\s*:/.test(r.decls)) {
      fsCount++
      if (firstSel === null) firstSel = r.selector
    }
  }
  if (fsCount) {
    out.push(f + ': ' + fsCount + ' CSS block(s) declare font-size without line-height (first: ' +
      firstSel + ') — undeclared leading is up to 13% height error the gate cannot see')
  }

  // (c)/(d) both key off the [data-screen-label] root's opening tag.
  const rootTag = html.match(/<[a-zA-Z][\w-]*\b[^>]*\bdata-screen-label="[^"]*"[^>]*>/)
  if (rootTag) {
    // (c) the rule(s) matching the root's own class(es) declare neither border nor border-radius.
    const classAttr = rootTag[0].match(/\bclass="([^"]+)"/)
    const classes = classAttr ? classAttr[1].split(/\s+/).filter(Boolean) : []
    for (const cls of classes) {
      for (const r of rules) {
        const tokens = r.selector.split(',').map(s => s.trim())
        if (tokens.includes('.' + cls) && /\bborder\s*:|\bborder-radius\s*:/.test(r.decls)) {
          out.push(f + ': root rule .' + cls + ' declares border/border-radius — a device frame shifts every measured box by the frame width')
        }
      }
    }

    // (d) every data-state-btn sits before the root's opening tag, or inside a data-contract="none"
    // ancestor — state switchers are tooling, never contract.
    const rootStart = rootTag.index
    const contractNoneRanges = [...html.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*\bdata-contract="none"[^>]*>[\s\S]*?<\/\1>/g)]
      .map(m => [m.index, m.index + m[0].length])
    for (const m of html.matchAll(/<[a-zA-Z][\w-]*\b[^>]*\bdata-state-btn="[^"]*"[^>]*>/g)) {
      if (m.index < rootStart) continue
      const shielded = contractNoneRanges.some(([s, e]) => m.index >= s && m.index < e)
      if (!shielded) {
        out.push(f + ': data-state-btn control inside the [data-screen-label] root without a data-contract="none" ancestor — state switchers are tooling, never contract')
      }
    }
  }

  return out
}

// ---- states (specs/20260906/05-gray-states-on-every-wireframe.md D1) -------------------------
// Presence only, never judgment (Rationale "Why presence, not judgment"): the declared-state set
// is data-state-btn values found ANYWHERE in the file, unioned with the comma-separated names in
// the [data-screen-label] root's own data-no-state attribute (the product's explicit opt-out,
// visible in source). A data-no-state name outside the three required states is its own violation
// — a typo'd opt-out must never silently pass a state that was never actually declared.
const REQUIRED_STATES = ['empty', 'loading', 'error']
function statesViolations(f, html) {
  const out = []
  const declared = new Set()
  for (const m of html.matchAll(/data-state-btn\s*=\s*"([^"]+)"/g)) declared.add(m[1])
  const rootTag = html.match(/<[a-zA-Z][\w-]*\b[^>]*\bdata-screen-label="[^"]*"[^>]*>/)
  const noStateMatch = rootTag ? rootTag[0].match(/data-no-state\s*=\s*"([^"]*)"/) : null
  const noStateNames = noStateMatch ? noStateMatch[1].split(',').map(s => s.trim()).filter(Boolean) : []
  for (const n of noStateNames) {
    if (REQUIRED_STATES.includes(n)) declared.add(n)
    else out.push(f + ': data-no-state names unknown state "' + n + '" — one of empty, loading, error')
  }
  const missing = REQUIRED_STATES.filter(s => !declared.has(s))
  if (missing.length) {
    out.push(f + ': missing state(s) ' + missing.join(', ') +
      ' — every wireframe carries its empty, loading and error states as gray boxes (data-state-btn), ' +
      'or declares data-no-state="<name>" on the root for a state the product truly lacks')
  }
  return out
}

// ---- register-after-theme / unresolved critique notes (specs/20260906/06-sketch-high-fidelity-
// and-critique.md D1/D3) --------------------------------------------------------------------------
// D1: once design/tokens.css resolves above a labeled non-canon mock (same walk-up shape as
// resolveShellDir, A2), a lingering wire/ stylesheet link is "the full theme, never a half-styled
// middle" made mechanical — violation at data-status="ratified" (sketch's own stamp), a ⚠️ warn at
// "sketch", and data-status="approved" (mocks sign-off's own stamp) is exempt outright; --matrix
// never binds this rule (Rationale "Why ratified only, never approved"). No tokens.css anywhere
// above the mock = the rule never runs (AC-20260906-06-2's byte-identical-to-today pin).
// specs/20260908/07-one-wire-register-predicate.md D1/D4: "a lingering wire/ stylesheet link" is
// read via lib/wire-register.js's linksWireRegister(html) — every quoting form and attribute
// order, plus CSS @import, gated on a stylesheet rel — never a private regex here.
function resolveTokensCss(fromPath) {
  let dir = path.resolve(fromPath)
  try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir) } catch { dir = path.dirname(dir) }
  for (;;) {
    for (const c of [path.join(dir, 'tokens.css'), path.join(dir, 'design', 'tokens.css')]) {
      if (fs.existsSync(c)) return c
    }
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}
// D3: same walk-up, but for design/mocks/notes.json — resolved from a mock at design/mocks/<f>,
// or from the notes.json itself sitting alongside a mock in a flatter fixture tree. No notes.json
// anywhere above the mock = "no notes store → no check" (D3), same absence-invariant as D1.
function resolveNotesFile(fromPath) {
  let dir = path.resolve(fromPath)
  try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir) } catch { dir = path.dirname(dir) }
  for (;;) {
    for (const c of [path.join(dir, 'notes.json'), path.join(dir, 'mocks', 'notes.json'), path.join(dir, 'design', 'mocks', 'notes.json')]) {
      if (fs.existsSync(c)) return c
    }
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

// Both D1 and D3 bind on the same stamp split (ratified violation / sketch warn / approved
// exempt) for a labeled non-canon mock — computed once per file and pushed into `violations` or
// `warnLines` by the caller, which already owns those arrays.
function themeAndNotesViolations(f, html, label) {
  const hard = []
  const warn = []
  if (label) {
    const status = statusOf(html)
    if (status !== 'approved') {
      const tokensCss = resolveTokensCss(f)
      if (tokensCss && linksWireRegister(html)) {
        const msg = f + ': links the wireframe register (wire/) after the theme pick — skin it in the picked theme (design/tokens.css)'
        if (status === 'ratified') hard.push(msg); else warn.push(msg)
      }
      const notesFile = resolveNotesFile(f)
      if (notesFile) {
        let notes = []
        try { notes = JSON.parse(fs.readFileSync(notesFile, 'utf8')) } catch { notes = [] }
        const unresolved = (Array.isArray(notes) ? notes : [])
          .filter((n) => n && n.scope === 'mock' && n.screen === label && n.status !== 'resolved')
        if (unresolved.length) {
          const ids = unresolved.map((n) => n.id).join(', ')
          const msg = f + ': ' + unresolved.length + ' unresolved note(s) on ' + label + ' (' + ids +
            ') — address them (notes address) or resolve them on the page before ratifying'
          if (status === 'ratified') hard.push(msg); else warn.push(msg)
        }
      }
    }
  }
  return { hard, warn }
}

// ---- check ---------------------------------------------------------------------------------------
// The deterministic half of the design harness: every mock/tile/prototype passes this before a
// human (or a critique round) sees it. Colors live in tokens.css and are consumed as var(--role);
// a color literal in markup is the drift this gate exists to catch. px is deliberately NOT flagged
// (layout in mocks legitimately uses px); color is the load-bearing token family.
function cmdCheck(argv) {
  const forceMatrix = argv.includes('--matrix')
  const statesMode = argv.includes('--states')
  const paths = argv.filter(a => a !== '--matrix' && a !== '--states')
  if (!paths.length) die('check: need at least one file or directory')
  const violations = []
  const warnLines = []
  const darkChecked = new Set()
  // specs/20260907/04-kit-canon-family.md D6/D13/D15: kit-family bookkeeping across the whole
  // walk — kitInfoLines/kitUnabsorbedTotal/kitScreensWithBespoke feed the two ⓘ lines printed
  // AFTER the CHECK block (D15), never before; checkedKitFamilies dedupes D13's family-wide
  // duplicate-primitive sweep to once per resolved design/kit/ directory, however many of its own
  // canon files the walk visits.
  const kitInfoLines = []
  let kitUnabsorbedTotal = 0
  let kitScreensWithBespoke = 0
  const checkedKitFamilies = new Set()
  // D13: family-wide duplicate-primitive sweep, hoisted so both the isKitCanon branch (a walk
  // that visits design/kit/ files directly) and the mock-binding branch (a walk over
  // design/mocks/ alone, e.g. `check --matrix design/mocks`, which never visits design/kit/
  // itself) can trigger it — a key repeated across two SIBLING files is the same violation as
  // two declarations in one file, naming every file that carries it. checkedKitFamilies still
  // dedupes to once per resolved design/kit/ directory.
  function sweepKitFamily(kitDir) {
    if (checkedKitFamilies.has(kitDir)) return
    checkedKitFamilies.add(kitDir)
    for (const [key, filesArr] of shellLib.kitPrimitivesInDir(kitDir)) {
      const uniqueFiles = [...new Set(filesArr)]
      if (uniqueFiles.length > 1) {
        violations.push(uniqueFiles.join(', ') + ': duplicate data-kit-primitive="' + key +
          '" — a primitive is named once per family')
      }
    }
  }
  let count = 0
  for (const t of paths) {
    if (!fs.existsSync(t)) die('check: no such path: ' + t)
    for (const f of htmlFilesUnder(t)) {
      count++
      const html = fs.readFileSync(f, 'utf8')
      // specs/20260901/04 D1: a shell canon file (first labeled root is data-shell-canon) is
      // never asked for a data-screen-label and is validated under its own rule set below,
      // instead of D4's mock shell family. specs/20260907/04 D2/D3: a kit canon file (first
      // labeled root is data-kit-canon) gets the same exemption — it is chrome-adjacent register,
      // never a screen.
      const isCanon = shellLib.isCanonFile(html)
      const isKitCanon = shellLib.isKitCanonFile(html)
      if (!isCanon && !isKitCanon && !labelOf(html)) violations.push(f + ': no data-screen-label on any element')
      // D1: a shell canon is chrome, never a screen — exempt entirely; an unlabeled mock is
      // already flagged above and has no [data-screen-label] root to read data-no-state from.
      if (statesMode && !isCanon && !isKitCanon && labelOf(html)) violations.push(...statesViolations(f, html))
      // specs/20260908/07-one-wire-register-predicate.md D7: a target whose final path segment is
      // tokens.css — read via lib/wire-register.js's stylesheetTargets(html), which admits an
      // @import-applied tokens.css and excludes a non-stylesheet <link> (e.g. rel="icon").
      if (!stylesheetTargets(html).some((t) => /(^|\/)tokens\.css$/.test(t))) violations.push(f + ': does not link a tokens.css')
      // strip the tokens link line itself, then flag color literals anywhere in markup/styles
      const body = html.replace(/<link[^>]*>/g, '')
      for (const re of [/#[0-9a-fA-F]{3,8}\b/g, /\brgba?\(/g, /\bhsla?\(/g, /\boklch\(/g]) {
        const m = body.match(re)
        if (m) violations.push(f + ': ' + m.length + ' off-token color literal(s) (' + m[0] + '…) — consume var(--role) from tokens.css')
      }
      // Hygiene (a)-(d) and the matrix checks below bind at the same stamp: ratified or approved
      // (equivalent, D2), or under --matrix (forces both onto drafts, e.g. a post-ratify expansion
      // pass). sketch mocks iterate on one framing and skip both families for free. D1: a shell
      // canon binds hygiene "as if approved" — it never carries a data-status attribute at all.
      const status = statusOf(html)
      const boundApproved = forceMatrix || status === 'ratified' || status === 'approved'
      const boundNow = boundApproved || isCanon
      if (boundNow) violations.push(...hygieneViolations(f, html))

      // specs/20260901/04: canon files get D1's own rule set (name match, own css link, content
      // slot, non-content slots' data-contract="none", off-token colors + hygiene(b) read over
      // the LINKED css file — invisible to the generic checks above, which only read inline
      // <style> blocks). Page mocks get D4's shell family instead, bound only when a
      // design/shell/ dir resolves by walk-up (D4's absence-invariant, AC-20260901-04-6).
      if (isCanon) {
        violations.push(...shellLib.checkCanon(f, html))
      } else if (isKitCanon) {
        violations.push(...shellLib.checkKitCanon(f, html))
        sweepKitFamily(path.dirname(f))
      } else {
        const shellDir = shellLib.resolveShellDir(f)
        if (shellDir) {
          const diag = shellLib.diagnoseMock(html, shellDir)
          for (const fnd of diag.findings) {
            if (boundApproved) violations.push(f + ': ' + fnd.text)
            else warnLines.push('  ⚠️ ' + f + ': ' + fnd.text)
          }
        }
        // specs/20260907/04 D5/D6: the kit family's content-region binding — off entirely when no
        // design/kit/ resolves above this mock (AC-20260907-04-6's byte-identical invariant), and
        // scoped to a LABELED mock (D5/D6 both say "labeled non-canon mock") — an unlabeled file
        // already carries its own "no data-screen-label" violation above and has no [label] to
        // print, so it gets no ⓘ line and no kit finding either.
        const kitDir = shellLib.resolveCanonDir(f, 'kit')
        const kitLabel = labelOf(html)
        if (kitDir && kitLabel) {
          sweepKitFamily(kitDir)
          const kitDiag = shellLib.diagnoseKitRegions(html, kitDir)
          kitInfoLines.push('  ⓘ ' + kitLabel + ': ' + kitDiag.kit + ' kit, ' + kitDiag.bespoke + ' bespoke')
          kitUnabsorbedTotal += kitDiag.bespoke
          if (kitDiag.bespoke > 0) kitScreensWithBespoke++
          for (const fnd of kitDiag.findings) {
            if (boundApproved) violations.push(f + ': ' + fnd.text)
            else warnLines.push('  ⚠️ ' + f + ': ' + fnd.text)
          }
        }
        // specs/20260906/06 D1/D3: register-after-theme and unresolved-critique-note rules —
        // ratified|sketch|approved split of their own (never --matrix-bound), so kept out of the
        // boundApproved/boundNow gates above.
        const themeNotes = themeAndNotesViolations(f, html, labelOf(html))
        violations.push(...themeNotes.hard)
        for (const w of themeNotes.warn) warnLines.push('  ⚠️ ' + w)
      }

      // declared matrix (design/targets.json): mocks are RESPONSIVE SINGLE FILES — one file per
      // surface across every declared viewport; dark/light lives in tokens.css, never in per-theme
      // mock variants. Absent targets = no matrix precondition checks (legacy repos keep passing).
      // specs/20260831/02 D9: these two regex reads (a viewport meta tag, a dark tokens block) are
      // static matrix PRECONDITIONS, not adaptation verification — neither one measures whether a
      // mock's content actually fits or reflows at any declared viewport cell. That measurement is
      // `render-rules.js`'s `no-overflow`/`line-length` renderCheck kinds, run per cell by
      // `render-gate --mocks` at /spec:sketch's exit; a mock can pass both checks below and still
      // fail rendered adaptation there.
      const targets = loadTargets(f)
      if (targets && boundNow) {
        if ((targets.viewports || []).length > 1 && !/<meta[^>]+name="viewport"/.test(html)) {
          violations.push(f + ': no <meta name="viewport"> — targets.json declares ' +
            targets.viewports.length + ' viewports; each mock is one responsive file')
        }
        if ((targets.themes || []).includes('dark')) {
          const href = (html.match(/<link[^>]+href\s*=\s*"([^"]*tokens\.css)"/) || [])[1]
          const tokensPath = href ? path.resolve(path.dirname(f), href) : null
          let tokens = null
          if (tokensPath) { try { tokens = fs.readFileSync(tokensPath, 'utf8') } catch {} }
          if (tokens === null) {
            violations.push(f + ': dark theme declared in targets.json but the linked tokens.css is unreadable')
          } else if (!darkChecked.has(tokensPath)) {
            darkChecked.add(tokensPath)
            if (!/prefers-color-scheme:\s*dark|\[data-theme="dark"\]/.test(tokens)) {
              violations.push(tokensPath + ': no dark theme block ([data-theme="dark"] or prefers-color-scheme: dark) — targets.json declares dark')
            }
          }
        }
      }
    }
  }
  if (!count) die('check: no .html files under ' + paths.join(', '))
  for (const w of warnLines) process.stdout.write(w + '\n')
  const failed = violations.length > 0
  if (failed) {
    process.stdout.write('CHECK FAIL (' + violations.length + ' violation(s) across ' + count + ' file(s)):\n')
    for (const v of violations) process.stdout.write('  - ' + v + '\n')
  } else {
    process.stdout.write('CHECK PASS (' + count + ' file(s))\n')
  }
  // specs/20260907/04-kit-canon-family.md D15: "the reason leads; the statistic follows" — the
  // informational kit/bespoke lines print AFTER the CHECK FAIL/PASS block, never before, so every
  // consumer reads the refusal reason first and the count second.
  for (const line of kitInfoLines) process.stdout.write(line + '\n')
  if (kitUnabsorbedTotal > 0) {
    process.stdout.write('  ⓘ unabsorbed total: ' + kitUnabsorbedTotal + ' across ' + kitScreensWithBespoke + ' screen(s)\n')
  }
  if (failed) process.exit(1)
}

// ---- shell sync/adopt (specs/20260901/04 D5/D6) ---------------------------------------------------
// Insert `<link rel="stylesheet" href="<rel>/<name>.css">` right after the tokens.css link when the
// mock does not already link its shell's stylesheet. Shared by sync (which never touches an
// already-linked mock) and adopt --apply (which always needs the link on newly stamped mocks).
function ensureShellCssLink(html, mockFile, shellDir, name) {
  const cssRe = new RegExp('shell/' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.css')
  if (cssRe.test(html)) return { html, changed: false }
  const rel = path.relative(path.dirname(mockFile), path.join(shellDir, name + '.css')).split(path.sep).join('/')
  const inserted = html.replace(/(<link[^>]+tokens\.css[^>]*>\n?)/,
    '$1<link rel="stylesheet" href="' + rel + '">\n')
  return { html: inserted, changed: inserted !== html }
}

function relOf(root, f) { return path.relative(root, f) || f }

// design-atlas.js shell sync [--root <r>] [<mock|dir>…]
function cmdShellSync(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const root = path.resolve(arg('--root', '.'))
  const positional = argv.filter((a, i) => a !== '--root' && argv[i - 1] !== '--root')
  const explicit = positional.length > 0
  const targets = explicit ? positional : [path.join(root, 'design/mocks')]
  const built = shellLib.builtLabels(root)

  const files = []
  for (const t of targets) {
    if (!fs.existsSync(t)) die('shell sync: no such path: ' + t)
    for (const f of htmlFilesUnder(t)) files.push(f)
  }

  let refused = false
  for (const f of files) {
    const rel = relOf(root, f)
    const html = fs.readFileSync(f, 'utf8')
    const root0 = shellLib.findElement(html, (t) => /data-screen-label\s*=\s*"[^"]*"/.test(t.raw))
    if (!root0) { process.stdout.write('skipped (undeclared) ' + rel + '\n'); continue }
    const shellMatch = root0.openRaw.match(/data-shell\s*=\s*"([^"]*)"/)
    if (!shellMatch) { process.stdout.write('skipped (undeclared) ' + rel + '\n'); continue }
    const name = shellMatch[1]
    if (name === 'none') { process.stdout.write('skipped (no shell) ' + rel + '\n'); continue }

    const labelMatch = root0.openRaw.match(/data-screen-label\s*=\s*"([^"]*)"/)
    const label = labelMatch ? labelMatch[1] : ''
    if (!explicit && built.has(label)) { process.stdout.write('skipped (built) ' + rel + '\n'); continue }

    const shellDir = shellLib.resolveShellDir(f)
    const canonPath = shellDir ? path.join(shellDir, name + '.html') : null
    if (!canonPath || !fs.existsSync(canonPath)) { process.stdout.write('skipped (no shell) ' + rel + '\n'); continue }

    const actualRegion = html.slice(root0.innerStart, root0.innerEnd)
    const contentSlot = shellLib.findElement(actualRegion, (t) => /data-slot\s*=\s*"content"/.test(t.raw))
    if (!contentSlot) {
      process.stdout.write('cannot sync ' + rel + ': no data-slot="content" inside the root — ' +
        'run design-atlas.js shell adopt (or wrap the content in data-slot="content")\n')
      refused = true
      continue
    }
    const contentInner = actualRegion.slice(contentSlot.innerStart, contentSlot.innerEnd)
    const activeMatch = root0.openRaw.match(/data-active\s*=\s*"([^"]*)"/)
    const active = activeMatch ? activeMatch[1] : label

    const canonHtml = fs.readFileSync(canonPath, 'utf8')
    const expected = shellLib.expectedRegion(canonHtml, name, contentInner, active)

    let newHtml = html
    let changed = false
    if (expected !== null && actualRegion !== expected) {
      newHtml = html.slice(0, root0.innerStart) + expected + html.slice(root0.innerEnd)
      changed = true
    }
    const linked = ensureShellCssLink(newHtml, f, shellDir, name)
    newHtml = linked.html
    changed = changed || linked.changed

    if (changed) {
      fs.writeFileSync(f, newHtml)
      process.stdout.write('synced ' + rel + '\n')
    } else {
      process.stdout.write('unchanged ' + rel + '\n')
    }
  }
  if (refused) process.exit(1)
}

// design-atlas.js shell adopt [--root <r>] [--shell <name>] [--apply]
function cmdShellAdopt(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const root = path.resolve(arg('--root', '.'))
  const apply = argv.includes('--apply')
  const shellArg = arg('--shell', null)
  const mocksDir = path.join(root, 'design/mocks')
  const shellDir = path.join(root, 'design/shell')

  let canonNames = []
  try { canonNames = fs.readdirSync(shellDir).filter(e => e.endsWith('.html')).map(e => path.basename(e, '.html')).sort() } catch {}
  const soleCanon = canonNames.length === 1 ? canonNames[0] : null
  const chosenName = shellArg || soleCanon

  if (!fs.existsSync(mocksDir)) die('shell adopt: no such directory: ' + mocksDir)
  const candidates = []
  for (const f of htmlFilesUnder(mocksDir)) {
    const html = fs.readFileSync(f, 'utf8')
    const root0 = shellLib.findElement(html, (t) => /data-screen-label\s*=\s*"[^"]*"/.test(t.raw))
    if (!root0) continue
    if (/data-shell\s*=\s*"/.test(root0.openRaw)) continue // already declared — not adopt's concern
    const labelMatch = root0.openRaw.match(/data-screen-label\s*=\s*"([^"]*)"/)
    const label = labelMatch ? labelMatch[1] : ''
    const inner = html.slice(root0.innerStart, root0.innerEnd)
    const children = shellLib.topLevelChildren(inner)
    const chrome = children.filter(shellLib.isChromeChild)
    candidates.push({ f, html, root0, label, chrome })
  }

  if (apply) {
    const needsName = candidates.some(c => c.chrome.length)
    if (needsName && !chosenName) {
      die('shell adopt --apply: more than one shell canon exists (' + canonNames.join(', ') +
        ') — pass --shell <name> to say which one adopts these mocks')
    }
    process.stdout.write('SHELL ADOPT (applied)\n')
    for (const c of candidates) {
      if (!c.chrome.length) continue // zero-chrome mocks are never touched, never stamped none
      const rel = relOf(root, c.f)
      const canonPath = path.join(shellDir, chosenName + '.html')
      if (!fs.existsSync(canonPath)) die('shell adopt --apply: design/shell/' + chosenName + '.html does not exist')
      const canonHtml = fs.readFileSync(canonPath, 'utf8')
      const inner = c.html.slice(c.root0.innerStart, c.root0.innerEnd)
      let rest = inner
      for (const child of [...c.chrome].sort((a, b) => b.start - a.start)) {
        rest = rest.slice(0, child.start) + rest.slice(child.end)
      }
      const expected = shellLib.expectedRegion(canonHtml, chosenName, rest, c.label)
      const stampedOpen = c.root0.openRaw.replace(/(\/?)>\s*$/, ' data-shell="' + chosenName + '"$1>')
      let newHtml = c.html.slice(0, c.root0.openStart) + stampedOpen + expected + c.html.slice(c.root0.innerEnd)
      newHtml = ensureShellCssLink(newHtml, c.f, shellDir, chosenName).html
      fs.writeFileSync(c.f, newHtml)
      process.stdout.write(rel + ' adopted into ' + chosenName + '\n')
    }
    return
  }

  process.stdout.write('SHELL ADOPT (plan)\n')
  for (const c of candidates) {
    const rel = relOf(root, c.f)
    const chromeText = c.chrome.length ? c.chrome.map(ch => ch.name).join(', ') : 'none'
    const proposal = c.chrome.length ? (chosenName || 'ambiguous — pass --shell') : 'undeclared — decide'
    const drift = c.chrome.length ? 'yes' : '—'
    process.stdout.write(rel + ' | chrome: ' + chromeText + ' | proposal: ' + proposal +
      ' | active: ' + c.label + ' | drift: ' + drift + '\n')
  }
}

// ---- shared page chrome ----------------------------------------------------------------------------
// specs/20260902/09-one-hand-wireframes-one-token-set.md D5/A3: every chrome page (build, gallery,
// the serve index) is a light page on the ONE token set — read from the plugin template once per
// process and inlined verbatim ahead of the atlas's own rules, so every `--v-*` role (plus the
// full register's `.v-*` classes) is available before the chrome rules below reference it. The
// chrome rules consume ONLY `var(--v-*)` roles — no `#hex`/`rgb(`/`hsl(` literal survives here; the
// one derived value (the lightbox backdrop, 85% of `--v-fg`) is composed with `color-mix()` over a
// role, never a literal, so it still reads as "no literal" under the AC's own regex.
let __viewerCss = null
function viewerCss() {
  if (__viewerCss === null) {
    const p = path.join(__dirname, '..', 'templates', 'mocks', 'viewer.css')
    try { __viewerCss = fs.readFileSync(p, 'utf8') } catch { die('page: cannot read ' + p + ' — the one token set (specs/20260902/09 D4) must exist before any chrome page can render') }
  }
  return __viewerCss
}

// Review posture: every mock is shown WHOLE — full content height, scaled to the card width — so
// the reviewer never pans inside a card (card iframes are pointer-inert; clicking opens the
// lightbox at natural size). The page itself scrolls vertically only, at every width.
function page(title, bodyHtml, extraHead = '') {
  return '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<style>\n' +
    viewerCss() + '\n' +
    'body{font:14px/1.5 var(--v-font);margin:0;padding:1.25rem 1.5rem 3rem;background:var(--v-muted-bg);color:var(--v-fg);overflow-x:hidden}\n' +
    'h1,h2{font-weight:600} a{color:var(--v-primary)}\n' +
    'h1{margin:0;font-size:22px;letter-spacing:-.01em}\n' +
    '.hdr{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem 1rem;margin:0 0 .35rem}\n' +
    '.hdr .proj{color:var(--v-muted);font-size:14px}\n' +
    '.lede{color:var(--v-muted);font-size:13px;margin:0 0 .9rem;max-width:70ch}\n' +
    '.legend{display:flex;flex-wrap:wrap;gap:.4rem .9rem;font-size:12px;color:var(--v-muted);margin:0 0 1rem}\n' +
    '.legend .badge{margin-right:.15em}\n' +
    '.pick{border:1px solid var(--v-border);border-left:4px solid var(--v-warn);background:var(--v-bg);border-radius:var(--v-radius);' +
    'padding:.75rem 1rem;margin:0 0 1rem;box-shadow:var(--v-shadow)}\n' +
    '.pick h2{margin:0 0 .2rem;font-size:16px}\n' +
    '.pick p{margin:0;color:var(--v-muted);font-size:13px}\n' +
    '.card .num{display:inline-flex;align-items:center;justify-content:center;width:1.6em;height:1.6em;border-radius:99px;' +
    'background:var(--v-primary);color:var(--v-primary-fg);font-size:12px;font-weight:600;margin-right:.5em}\n' +
    '.empty{border:1px dashed var(--v-border);border-radius:var(--v-radius);color:var(--v-muted);padding:2rem;text-align:center;background:var(--v-bg)}\n' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;align-items:start}\n' +
    '.card{border:1px solid var(--v-border);border-radius:var(--v-radius);padding:.75rem;background:var(--v-bg);box-shadow:var(--v-shadow);min-width:0;' +
    'transition:box-shadow .15s,transform .15s}\n' +
    '.card:hover{box-shadow:0 2px 6px color-mix(in srgb, var(--v-fg) 8%, transparent),0 12px 28px color-mix(in srgb, var(--v-fg) 12%, transparent);transform:translateY(-1px)}\n' +
    '.card.wide{grid-column:1/-1}\n' +
    '.card h3{margin:.1rem 0 .4rem;font-size:15px;display:flex;align-items:center;flex-wrap:wrap;gap:.15em}\n' +
    '.card h3 .open{margin-left:auto}\n' +
    '.statelabel{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--v-muted);margin:.6rem 0 .1rem}\n' +
    '.vp{color:var(--v-muted);font-size:11px;font-weight:400;margin-left:.4em}\n' +
    '.open{float:right;font-size:12px;font-weight:400}\n' +
    '.badge{display:inline-block;border:1px solid var(--v-border);border-radius:99px;padding:.05em .6em;font-size:11px;font-weight:600;' +
    'margin-right:.3em;text-transform:uppercase;letter-spacing:.04em;background:var(--v-muted-bg);color:var(--v-muted)}\n' +
    '.badge.gap{border-color:color-mix(in srgb, var(--v-danger) 40%, transparent);color:var(--v-danger);background:color-mix(in srgb, var(--v-danger) 10%, var(--v-bg))}\n' +
    '.badge.sketch{border-color:color-mix(in srgb, var(--v-warn) 40%, transparent);color:var(--v-warn);background:color-mix(in srgb, var(--v-warn) 12%, var(--v-bg))}\n' +
    '.badge.ratified,.badge.approved{border-color:color-mix(in srgb, var(--v-ok) 40%, transparent);color:var(--v-ok);background:color-mix(in srgb, var(--v-ok) 12%, var(--v-bg))}\n' +
    '.badge.bound{border-color:var(--v-ring);color:var(--v-fg);background:var(--v-bg)}\n' +
    '.badge.built{border-color:var(--v-primary);color:var(--v-primary-fg);background:var(--v-primary)}\n' +
    '.badge.orphan{border-color:var(--v-danger);color:var(--v-primary-fg);background:var(--v-danger)}\n' +
    '.badge.candidate{border-color:color-mix(in srgb, var(--v-warn) 40%, transparent);color:var(--v-warn);background:color-mix(in srgb, var(--v-warn) 12%, var(--v-bg))}\n' +
    '.shot{overflow:hidden;border-radius:var(--v-radius);background:var(--v-muted-bg);cursor:zoom-in;margin-top:.5rem;' +
    'border:1px solid var(--v-border);box-shadow:inset 0 1px 3px color-mix(in srgb, var(--v-fg) 6%, transparent)}\n' +
    '.frame{border:0;display:block;transform-origin:0 0;pointer-events:none;background:var(--v-muted-bg);width:100%}\n' +
    // Cards clamp to one fixed preview height (a tall mock must never make a tall card — the card is
    // a thumbnail); the clipped remainder fades out and the click-to-inspect lightbox shows the full mock.
    '.shot{position:relative;max-height:var(--v-shot-max,260px)}\n' +
    '.shot.clip::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4rem;pointer-events:none;' +
    'background:linear-gradient(to bottom,transparent,var(--v-bg))}\n' +
    '.sect{margin:2rem 0 0}\n' +
    '.sect>h2{font-size:17px;margin:0 0 .75rem;padding:.1rem 0 .1rem .7rem;border-left:4px solid var(--v-primary);display:flex;align-items:baseline;flex-wrap:wrap;gap:.5em}\n' +
    '.sect>h2 .count{color:var(--v-muted);font-size:12px;font-weight:500;border:1px solid var(--v-border);border-radius:99px;padding:0 .6em;background:var(--v-bg)}\n' +
    '.sect>h2 .rv-review{margin-left:auto;font-size:13px;font-weight:500;color:var(--v-primary);text-decoration:none}\n' +
    '.sect>p.meta{margin:-.4rem 0 .75rem .95rem;font-size:13px;max-width:100ch}\n' +
    '.gaps{display:flex;flex-wrap:wrap;gap:.4rem;margin:.75rem 0 0}\n' +
    '.gapchip{border:1px dashed var(--v-danger);color:var(--v-danger);border-radius:99px;padding:.05rem .65rem;font-size:12px}\n' +
    '.gapcard{border:1px dashed var(--v-border);border-radius:var(--v-radius);color:var(--v-muted);display:flex;align-items:center;' +
    'justify-content:center;min-height:6rem;margin-top:.35rem}\n' +
    '.meta{color:var(--v-muted);font-size:12px;margin-top:.35rem}\n' +
    '.bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;' +
    'background:color-mix(in srgb, var(--v-muted-bg) 88%, transparent);backdrop-filter:blur(6px);padding:.5rem 0;margin:0 0 .5rem;border-bottom:1px solid var(--v-border)}\n' +
    '.bar button{background:var(--v-bg);color:var(--v-fg);border:1px solid var(--v-border);border-radius:99px;padding:.25em .8em;' +
    'cursor:pointer;font:inherit;font-size:12px;display:inline-flex;align-items:center;gap:.4em}\n' +
    '.bar button.on{border-color:var(--v-primary);background:var(--v-primary);color:var(--v-primary-fg)}\n' +
    '.bar button .dot{width:.55em;height:.55em;border-radius:99px;background:var(--v-muted);display:inline-block}\n' +
    '.bar button .dot.gap{background:var(--v-danger)}.bar button .dot.sketch{background:var(--v-warn)}\n' +
    '.bar button .dot.approved,.bar button .dot.ratified,.bar button .dot.built{background:var(--v-ok)}\n' +
    '.bar .sep{width:1px;height:1.2em;background:var(--v-border);margin:0 .35em}\n' +
    // specs/20260907/09-atlas-index-and-note-navigation.md D1/D2/D10: the persistent screen
    // index — shipped in this shared stylesheet on every page (AC-14), emitted for pages that
    // never use it (AC-5: cmdGallery renders none of the #shell/#toc/.tocrow markup below). D1:
    // #toc is a sticky grid column at min-width:1200px and a fixed off-canvas overlay below it;
    // the breakpoint lives ONLY here — the script reads #tocbtn's computed display instead of
    // repeating it (A4: a duplicated breakpoint left the overlay open after a jump).
    '#shell{display:flex;align-items:flex-start}\n' +
    '#toc{--toc-w:264px;width:var(--toc-w);flex:none;box-sizing:border-box;background:var(--v-bg);' +
    'border-right:1px solid var(--v-border);padding:1rem .75rem;overflow:auto}\n' +
    '#main{flex:1;min-width:0}\n' +
    '.tochdr{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--v-muted);margin:0 0 .5rem}\n' +
    '#tocsearch{width:100%;box-sizing:border-box;font:inherit;padding:.35em .6em;border:1px solid var(--v-border);' +
    'border-radius:var(--v-radius);background:var(--v-bg);color:var(--v-fg);margin:0 0 .75rem}\n' +
    '.tocgroup{margin:0 0 1rem}\n' +
    // D2: the heading is a jump target too, so it reads as clickable like a .tocrow does.
    '.tochead{display:flex;align-items:baseline;gap:.4em;font-size:11px;text-transform:uppercase;letter-spacing:.06em;' +
    'color:var(--v-muted);border-left:4px solid transparent;padding:.1rem 0 .1rem .5rem;margin:0 0 .3rem;cursor:pointer}\n' +
    '.tochead.here{border-left-color:var(--v-primary);color:var(--v-fg)}\n' +
    '.tochead .count{margin-left:auto;color:var(--v-muted);font-size:11px;border:1px solid var(--v-border);' +
    'border-radius:99px;padding:0 .5em;background:var(--v-bg)}\n' +
    '.tocrow{display:flex;align-items:center;gap:.5em;width:100%;box-sizing:border-box;background:none;border:0;' +
    'border-radius:var(--v-radius);padding:.3em .5em;color:var(--v-fg);cursor:pointer;font:inherit;font-size:13px;text-align:left}\n' +
    '.tocrow:hover{background:var(--v-muted-bg)}\n' +
    '.tocrow .dot{width:.55em;height:.55em;border-radius:99px;background:var(--v-muted);display:inline-block;flex:none}\n' +
    // UI section's dot register, verbatim: danger gap, warn sketch, ok approved/built, ring
    // bound, muted otherwise (ratified rides the same ok tint the .bar chips already give it).
    '.tocrow .dot.gap{background:var(--v-danger)}.tocrow .dot.sketch{background:var(--v-warn)}\n' +
    '.tocrow .dot.approved,.tocrow .dot.ratified,.tocrow .dot.built{background:var(--v-ok)}\n' +
    '.tocrow .dot.bound{background:var(--v-ring)}\n' +
    '.tocrow .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n' +
    '.tocempty{color:var(--v-muted);font-size:12px;margin:.5rem 0}\n' +
    '#tocbtn{display:none}\n' +
    // UI section, verbatim: "overlay open" is #toc at translateX(0), the scrim painted, and
    // #tocbtn.on — the same pressed treatment the .bar status chips already give `.on`, pinned
    // explicitly here (higher specificity than the shared `.bar button.on` rule) so the pressed
    // state never depends on rule order.
    '#tocbtn.on{border-color:var(--v-primary);background:var(--v-primary);color:var(--v-primary-fg)}\n' +
    '#tocscrim{display:none;position:fixed;inset:0;z-index:8;background:color-mix(in srgb, var(--v-fg) 40%, transparent)}\n' +
    '#tocscrim.on{display:block}\n' +
    '.flash{outline:2px solid var(--v-primary);outline-offset:2px}\n' +
    '@media(max-width:1199px){#toc{position:fixed;top:0;left:0;height:100vh;z-index:9;' +
    'transform:translateX(-100%);transition:transform .18s ease;box-shadow:var(--v-shadow)}' +
    '#toc.open{transform:translateX(0)}#tocbtn{display:inline-flex}}\n' +
    '@media(min-width:1200px){#toc{position:sticky;top:0;height:100vh}}\n' +
    // UI section: the transition is suppressed under prefers-reduced-motion — the page already
    // honours that media feature elsewhere.
    '@media(prefers-reduced-motion:reduce){#toc{transition:none}}\n' +
    '#journey{height:280px;border:1px solid var(--v-border);border-radius:var(--v-radius);margin-bottom:1rem;background:var(--v-bg);box-shadow:var(--v-shadow)}\n' +
    '#lb{position:fixed;inset:0;z-index:10;background:color-mix(in srgb, var(--v-fg) 85%, transparent);display:none;overflow:auto;padding:3.2rem 1rem 1rem}\n' +
    '#lb.on{display:block}\n' +
    '#lb iframe{border:0;display:block;margin:0 auto;background:var(--v-bg);box-shadow:var(--v-shadow)}\n' +
    '#lbbar{position:fixed;top:.6rem;right:1rem;z-index:11;display:flex;gap:.4rem;align-items:center}\n' +
    '#lbbar span{color:var(--v-bg);font-size:13px;margin-right:.4em}\n' +
    '#lbbar button,#lbbar a{background:var(--v-muted-bg);color:var(--v-fg);border:1px solid var(--v-border);border-radius:var(--v-radius);' +
    'padding:.2em .7em;cursor:pointer;font:inherit;font-size:13px;text-decoration:none}\n' +
    // specs/20260905/01-picks-on-the-atlas-page.md D3(c): the compare table — #stops is links
    // only (D3a), .cmp is a CSS grid with one column per group (--cols, set inline per stop),
    // .chead stays visible while its steps scroll, .step spans every column as a row label, and
    // .card.empty renders as a dashed placeholder instead of a blank cell.
    '#stops{margin:0 0 1.25rem;padding:.75rem 1rem;border:1px solid var(--v-border);border-left:4px solid var(--v-warn);' +
    'border-radius:var(--v-radius);background:var(--v-bg);box-shadow:var(--v-shadow)}\n' +
    '#stops h2{margin:0 0 .3rem;font-size:14px}#stops h2~h2{margin-top:.6rem}\n' +
    '#stops ol{margin:0;padding-left:1.2rem;font-size:13px}\n' +
    '.cmp{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:.75rem;align-items:start;' +
    'margin:0 0 1.25rem;padding:.75rem;border:1px solid var(--v-border);border-radius:var(--v-radius);background:var(--v-bg)}\n' +
    '.chead{position:sticky;top:2.6rem;z-index:3;display:flex;align-items:center;flex-wrap:wrap;gap:.4em;' +
    'padding:.4rem .1rem;background:var(--v-bg);font-size:13px;font-weight:600}\n' +
    '.chead button{background:var(--v-bg);color:var(--v-fg);border:1px solid var(--v-border);border-radius:99px;' +
    'padding:.15em .8em;cursor:pointer;font:inherit;font-size:12px;margin-left:auto}\n' +
    '.chead.picked button{border-color:var(--v-ok);color:var(--v-ok)}\n' +
    '.chead.rejected button{color:var(--v-muted)}\n' +
    '.step{grid-column:1/-1;font-size:12px;font-weight:600;color:var(--v-muted);text-transform:uppercase;' +
    'letter-spacing:.04em;padding:.5rem 0 0;border-top:1px solid var(--v-border);margin-top:.25rem}\n' +
    '.chead + .step{border-top:0;margin-top:0;padding-top:0}\n' +
    '.card.empty{border:1px dashed var(--v-border);border-radius:var(--v-radius);background:transparent;' +
    'min-height:6rem;box-shadow:none}\n' +
    '.badge.picked{border-color:var(--v-ok);color:var(--v-ok);background:color-mix(in srgb, var(--v-ok) 12%, var(--v-bg))}\n' +
    '.badge.rejected{border-color:var(--v-border);color:var(--v-muted);background:var(--v-muted-bg)}\n' +
    '.stop{display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-start;margin:0 0 1rem;padding:.75rem;' +
    'border:1px solid var(--v-border);border-radius:var(--v-radius);background:var(--v-bg)}\n' +
    '.stop textarea{flex:1 1 16rem;min-height:2.6rem;font:14px/1.4 var(--v-font);color:var(--v-fg);' +
    'border:1px solid var(--v-border);border-radius:var(--v-radius);padding:.4em .6em;resize:vertical}\n' +
    '.stop button,.cmp input,.cmp button[data-decide]{background:var(--v-bg);color:var(--v-fg);' +
    'border:1px solid var(--v-border);border-radius:99px;padding:.25em .9em;cursor:pointer;font:inherit;font-size:13px}\n' +
    '.decide-msg{grid-column:1/-1;font-size:12px;color:var(--v-danger);margin-top:.25rem}\n' +
    '@media(max-width:640px){body{padding:.75rem}.grid{grid-template-columns:1fr}#journey{height:200px}' +
    '.cmp{grid-template-columns:1fr}.chead{position:static}}\n' +
    '</style>' + extraHead + '</head><body>\n' + bodyHtml + '\n</body></html>\n'
}

// Always-on page behavior: wrap each frame in a .shot, measure the mock's FULL content height
// (same-origin when served; falls back to the declared device height on file://), scale to the
// card width, clamp the card to one fixed preview height (the rest fades; the lightbox shows all),
// and open the click-to-inspect lightbox. No scrollbars in cards, ever.
const UI_SCRIPT = '<script>\n' +
  'function __full(src){return String(src||"").replace(/[?&]clean$/,"")}\n' +
  'function __sel(btn,attr){document.querySelectorAll("button["+attr+"]").forEach(function(b){b.classList.toggle("on",b===btn)})}\n' +
  'function __measure(f){try{var d=f.contentDocument;if(!d||!d.documentElement)return 0;' +
  'var h=d.documentElement.scrollHeight||0;if(d.body&&d.body.scrollHeight>h)h=d.body.scrollHeight;return h}catch(e){return 0}}\n' +
  'function __fit(f){var s=f.parentNode;if(!s||!s.classList||!s.classList.contains("shot"))return;' +
  'var w=+f.dataset.w||390,cw=s.clientWidth||w;f.style.width=w+"px";' +
  // specs/20260906/04-journey-review-page.md A6: the declared device height is set BEFORE measuring
  // (a 100vh mock measured inside a 150px-default iframe reports 150 and collapses to a strip);
  // the measured content height only ever raises that floor.
  'var vh=+f.dataset.h||844;if(!f.style.height||parseInt(f.style.height)<vh)f.style.height=vh+"px";' +
  'var h=Math.max(__measure(f)||0,vh);f.style.height=h+"px";' +
  'var sc=Math.min(1,cw/w);f.style.transform="scale("+sc+")";f.style.margin=sc<1?"0":"0 auto";' +
  'var full=Math.round(h*sc),cap=parseInt(getComputedStyle(s).maxHeight)||full;' +
  's.style.height=Math.min(full,cap)+"px";s.classList.toggle("clip",full>cap)}\n' +
  'function __fitAll(){document.querySelectorAll("iframe.frame").forEach(function(f){__still(f);__fit(f)})}\n' +
  // Grid mocks pause every CSS animation (infinite pulse/shimmer loops across ~20 iframes burn
  // 25%+ renderer CPU at idle); the lightbox iframe is separate and stays live.
  'function __still(f){try{var d=f.contentDocument;if(!d||!d.head||d.__stilled)return;d.__stilled=1;' +
  'var st=d.createElement("style");st.textContent="*,*::before,*::after{animation-play-state:paused!important}";' +
  'd.head.appendChild(st)}catch(e){}}\n' +
  'var __lbList=[],__lbIx=0;\n' +
  'function __lbShow(i){var fr=document.getElementById("lbframe");if(!fr||!__lbList.length)return;' +
  'if(i<0)i=__lbList.length-1;if(i>=__lbList.length)i=0;__lbIx=i;var f=__lbList[i];' +
  'var w=+f.dataset.w||390;fr.style.width=Math.min(w,window.innerWidth-32)+"px";' +
  'fr.style.height=(parseInt(f.style.height)||+f.dataset.h||844)+"px";fr.src=__full(f.getAttribute("src"));' +
  'var card=f.closest(".card"),h3=card&&card.querySelector("h3");' +
  'document.getElementById("lbtitle").textContent=h3?h3.childNodes[0].textContent:"";' +
  'document.getElementById("lbopen").href=__full(f.getAttribute("src"));' +
  'document.getElementById("lb").classList.add("on")}\n' +
  'function __lbOpen(f){__lbList=[].slice.call(document.querySelectorAll("iframe.frame")).filter(function(x){' +
  'var c=x.closest(".card");return !c||!c.hidden});__lbShow(__lbList.indexOf(f))}\n' +
  'function __lbClose(){var lb=document.getElementById("lb");if(lb)lb.classList.remove("on");' +
  'var fr=document.getElementById("lbframe");if(fr)fr.src="about:blank"}\n' +
  'document.addEventListener("keydown",function(e){var lb=document.getElementById("lb");' +
  'if(!lb||!lb.classList.contains("on"))return;if(e.key==="Escape")__lbClose();' +
  'if(e.key==="ArrowRight")__lbShow(__lbIx+1);if(e.key==="ArrowLeft")__lbShow(__lbIx-1)});\n' +
  'var __rzT;window.addEventListener("resize",function(){clearTimeout(__rzT);__rzT=setTimeout(__fitAll,150)});\n' +
  'window.addEventListener("DOMContentLoaded",function(){\n' +
  '  document.querySelectorAll("iframe.frame").forEach(function(f){\n' +
  '    var s=document.createElement("div");s.className="shot";f.parentNode.insertBefore(s,f);s.appendChild(f);\n' +
  '    var card=s.closest(".card"),h3=card&&card.querySelector("h3");\n' +
  '    if(h3&&!h3.querySelector(".vp"))h3.insertAdjacentHTML("beforeend",' +
  '"<span class=\\"vp\\">"+(+f.dataset.w||390)+"\\u00d7"+(+f.dataset.h||844)+"</span> ' +
  '<a class=\\"open\\" href=\\""+__full(f.getAttribute("src"))+"\\" target=\\"_blank\\">open \\u2197</a>");\n' +
  '    f.addEventListener("load",function(){__still(f);__fit(f);setTimeout(function(){__fit(f)},250)});\n' +
  '    s.addEventListener("click",function(){__lbOpen(f)});\n' +
  '  });\n' +
  '  var lb=document.getElementById("lb");if(lb)lb.addEventListener("click",function(e){if(e.target===lb)__lbClose()});\n' +
  '  var lf=document.getElementById("lbframe");if(lf)lf.addEventListener("load",function(){' +
  'var h=__measure(lf);if(h)lf.style.height=h+"px";' +
  'try{var sw=lf.contentDocument.documentElement.scrollWidth;' +
  'if(sw>parseInt(lf.style.width))lf.style.width=Math.min(sw,window.innerWidth-32)+"px"}catch(e){}});\n' +
  '  __fitAll();\n' +
  '});\n' +
  '</script>'

const LIGHTBOX = '<div id="lb"><div id="lbbar"><span id="lbtitle"></span>' +
  '<button onclick="__lbShow(__lbIx-1)" title="previous">‹</button>' +
  '<button onclick="__lbShow(__lbIx+1)" title="next">›</button>' +
  '<a id="lbopen" href="#" target="_blank">open ↗</a>' +
  '<button onclick="__lbClose()" title="close">✕</button></div>' +
  '<iframe id="lbframe" scrolling="no" src="about:blank"></iframe></div>'

// Viewport/theme toolbar from targets.json: viewport buttons re-frame every mock at that device
// width (mocks are responsive single files) and re-measure; theme buttons stamp data-theme on each
// iframe's root (same-origin only — serve the page, don't file:// it; failures are swallowed so
// the toolbar degrades to viewport-only). Returns {buttons, script} so pages that skip targets
// emit neither.
function matrixBar(targets) {
  if (!targets) return { buttons: '', style: '', script: '' }
  const vps = (targets.viewports || []).map(v =>
    '<button data-vp onclick="__vp(' + (v.width | 0) + ',' + (v.height | 0) + ',this)">' +
    esc(v.name) + ' ' + (v.width | 0) + '</button>').join('')
  const themes = (targets.themes || []).map(t =>
    '<button data-th onclick="__theme(\'' + esc(t) + '\',this)">' + esc(t) + '</button>').join('')
  if (!vps && !themes) return { buttons: '', style: '', script: '' }
  // D3(c): a .cmp's columns stack to one per row when the widest declared viewport is selected
  // (a compare table at desktop width has room to read every candidate full-width, not squeezed
  // into a grid column) — __vp stamps body[data-vp-max] so this rule can key off it; kept out of
  // page()'s always-on <style> so a targets-less atlas never emits a data-vp* attribute at all.
  const widest = (targets.viewports || []).reduce((m, v) => Math.max(m, v.width | 0), 0)
  const style = vps
    ? '<style>body[data-vp-max="1"] .cmp{grid-template-columns:1fr}body[data-vp-max="1"] .chead{position:static}</style>'
    : ''
  const script = '<script>\n' +
    'function __vp(w,h,btn){__sel(btn,"data-vp");document.querySelectorAll("iframe.frame").forEach(function(f){' +
    'f.dataset.w=w;f.dataset.h=h;var c=f.closest(".card"),v=c&&c.querySelector(".vp");' +
    'if(v)v.textContent=w+"\\u00d7"+h});document.body.dataset.vpMax=(w===' + widest + ')?"1":"";' +
    '__fitAll();setTimeout(__fitAll,200)}\n' +
    'function __theme(t,btn){__sel(btn,"data-th");document.querySelectorAll("iframe.frame").forEach(function(f){' +
    'try{f.contentDocument.documentElement.setAttribute("data-theme",t)}catch(e){}})}\n' +
    '</script>'
  return { buttons: vps + (vps && themes ? '<span class="sep"></span>' : '') + themes, style, script }
}

// ---- gallery -------------------------------------------------------------------------------------
// Candidates = immediate subdirs holding .html files (design/explore r0-*/r1-*). One column per
// candidate, one lazy iframe per screen; the user culls with their eyes, this page just lines
// candidates up honestly (same size, sorted order, no favorites).
function cmdGallery(argv) {
  const dir = argv[0]
  if (!dir || !fs.existsSync(dir)) die('gallery: need an existing directory of candidate subdirs')
  const outIx = argv.indexOf('--out')
  const out = outIx >= 0 ? argv[outIx + 1] : path.join(dir, 'gallery.html')
  const candidates = fs.readdirSync(dir).sort().filter(e => {
    try { return fs.statSync(path.join(dir, e)).isDirectory() && htmlFilesUnder(path.join(dir, e)).length } catch { return false }
  })
  if (!candidates.length) die('gallery: no candidate subdirs with .html files under ' + dir)
  const outDir = path.dirname(path.resolve(out))
  const targets = loadTargets(dir)
  const vp0 = (targets && (targets.viewports || [])[0]) || { width: 390, height: 844 }
  const cards = candidates.map(c => {
    const files = htmlFilesUnder(path.join(dir, c))
    const frames = files.map(f => {
      const rel = path.relative(outDir, path.resolve(f))
      return '<h3>' + esc(labelOf(fs.readFileSync(f, 'utf8')) || path.basename(f, '.html')) + '</h3>\n' +
        frameTag(rel, vp0.width | 0, vp0.height | 0)
    }).join('\n')
    return '<div class="card"><h2>' + esc(c) + '</h2>\n' + frames + '</div>'
  }).join('\n')
  const bar = matrixBar(targets)
  const html = page('Design candidates — ' + path.basename(dir),
    '<h1>Candidates (' + candidates.length + ')</h1>\n' +
    (bar.buttons ? '<div class="bar">' + bar.buttons + '</div>\n' : '') +
    '<div class="grid">\n' + cards + '\n</div>\n' + LIGHTBOX + '\n' + UI_SCRIPT + bar.script)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(out, html)
  process.stdout.write('gallery: ' + candidates.length + ' candidate(s) → ' + out + '\n')
}

// ---- roadmap `surfaces` blocks --------------------------------------------------------------------
// Fenced ```surfaces blocks in docs/roadmap/**.md, parsed by lib/surfaces.js (the one grammar
// shared with genesis-driver.js's own fold — specs/20260908/02-driver-dedupe-onto-lib.md D1, D5).
const parseSurfaces = surfacesLib.parseSurfaces

// specs/20260902/07-mocks-command-driver.md D15: design/mocks/seed.md's `### <journey-kebab>`
// blocks are a second surfaces source — journeys exist before any roadmap does. Owner =
// `seed:<journey>` (never a roadmap file path) so cmdBuild can section and title these labels by
// journey instead of by declaring brief; the persona line rides along for the section subtitle.
// lib/surfaces.js's parseSeedJourneys takes the seed text directly (specs/20260908/02 D2); this
// wrapper owns the read.
function parseSeedJourneys(root) {
  let text
  try { text = fs.readFileSync(path.join(root, 'design/mocks/seed.md'), 'utf8') } catch { text = null }
  return surfacesLib.parseSeedJourneys(text)
}

// specs/20260906/04-journey-review-page.md D1: adapts parseSeedJourneys()/loadTargets() into
// buildReviewPage's `seed` shape on every request — product = the seed's own `# Seed — <name>` H1
// (root dir's basename with none), title = the journey's kebab name (D1: no other source exists),
// screens = the journey's labels with `states` derived from each mock's own markup
// (reviewPageLib.statesOf), viewport = the first design/targets.json viewport (1280x800 default,
// reviewPageLib.viewportOf). Pure over the given root; never caches, never writes.
function seedForReview(root) {
  const seedJourneys = parseSeedJourneys(root)
  let product = path.basename(root)
  try {
    const seedText = fs.readFileSync(path.join(root, 'design/mocks/seed.md'), 'utf8')
    const m = /^# Seed — (.+)$/m.exec(seedText)
    if (m) product = m[1].trim()
  } catch { /* no seed.md yet — fall back to the root dir's basename */ }
  const vp = reviewPageLib.viewportOf(loadTargets(root))
  const journeys = [...seedJourneys.entries()].map(([name, j]) => ({
    name,
    title: name,
    screens: j.labels.map((label) => {
      let html = ''
      try { html = fs.readFileSync(path.join(root, 'design/mocks', label + '.html'), 'utf8') } catch { /* undrawn */ }
      return { label, states: reviewPageLib.statesOf(html) }
    }),
  }))
  return { product, viewportWidth: vp.width, viewportHeight: vp.height, journeys }
}

// specs/20260910/03-client-journey-player.md D6: the promoted said-by-user row's own id — A2
// (false, per the spec's own escalation): lib/mocks-ledger.js's appendAssumption does not derive
// an id itself (the caller always supplies one), so the client route derives its own next free
// "C<n>" the same way mocks-driver.js's nextLedgerId derives "P<n>" for its own picks-originated
// rows — a distinct prefix keeps a client-promoted row's id from ever colliding with one the
// session assigns through `ledger add`.
function nextClientLedgerId(parsed) {
  let max = 0
  for (const a of parsed.assumptions) {
    const m = /^C(\d+)$/.exec(a.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return 'C' + (max + 1)
}

// ---- picks (specs/20260905/01-picks-on-the-atlas-page.md D3/D4) ----------------------------------
// A look stop's key says where it renders (D3b): shape-picked -> the shapes section, theme-picked
// -> a dedicated theme section right after shapes, journey-approved:<j> -> the <j>
// journey section, approved -> the page header (specs/20260906/02-mocks-ends-at-wireframes.md:
// journey-reviewed is retired along with the REVIEW state — approved already homes to the page
// header), anything else -> a standalone block right after #stops.
function stopHome(key) {
  if (key === 'shape-picked') return { type: 'shapes' }
  if (key === 'theme-picked') return { type: 'theme' }
  if (key === 'kit-signed') return { type: 'kit' }
  if (key === 'approved') return { type: 'header' }
  const m = /^journey-approved:(.+)$/.exec(key)
  if (m) return { type: 'journey', journey: m[1] }
  return { type: 'standalone' }
}

// specs/20260907/04-kit-canon-family.md D14: "the kit is signed off on a page that shows the
// kit" — a dedicated renderer (never renderApproveStop alone) so the #kit section frames every
// candidate of the kit-signed stop, one .card per candidate carrying its name, an open ↗ link and
// a frameTag at the file's own viewport (exactly as renderCompareTable frames a pick candidate),
// BEFORE the approve/change block.
function renderKitStop(stop, root, outDir, vp0) {
  const cards = (stop.candidates || []).map((cand) => {
    const filePath = path.join(root, 'design', cand.path)
    let html = ''
    try { html = fs.readFileSync(filePath, 'utf8') } catch { html = '' }
    const vp = viewportOf(html) || vp0
    const rel = path.relative(outDir, filePath).split(path.sep).join('/')
    return '<div class="card"><h3>' + esc(cand.label) +
      '<span class="vp">' + vp.width + '×' + vp.height + '</span>' +
      '<a class="open" title="open ↗" href="' + esc(rel) + '" target="_blank">open ↗</a></h3>' +
      frameTag(rel, vp.width, vp.height) + '</div>'
  }).join('')
  return '<div class="grid">' + cards + '</div>' + renderApproveStop(stop)
}

function candidateGroupsOf(candidates) {
  const groups = []
  for (const c of candidates || []) if (!groups.includes(c.group)) groups.push(c.group)
  return groups
}

function stepLabelsOf(candidates) {
  const labels = []
  for (const c of candidates || []) if (!labels.includes(c.label)) labels.push(c.label)
  return labels
}

// D3(c)/(e): one column per candidate group (sticky chead with the Pick this control), one row
// per distinct step label in candidate order, a full `.card` (or `.card empty`) per cell — plus,
// once decided, the picked/rejected chead treatment and the why-line input.
function renderCompareTable(stop, root, outDir, vp0) {
  const groups = candidateGroupsOf(stop.candidates)
  const labels = stepLabelsOf(stop.candidates)
  const decided = stop.status === 'decided' && stop.decision
  const pickedGroup = decided ? stop.decision.pick : null
  const heads = groups.map((g, i) => {
    const cls = decided ? (g === pickedGroup ? 'chead picked' : 'chead rejected') : 'chead'
    const badge = decided ? (g === pickedGroup ? 'picked' : 'rejected') : 'candidate'
    const btnText = decided ? (g === pickedGroup ? 'Picked' : 'Pick this instead') : 'Pick this'
    return '<div class="' + cls + '" data-group="' + esc(g) + '"><span class="num">' + (i + 1) + '</span>' +
      esc(g) + ' <span class="badge ' + badge + '">' + badge + '</span>' +
      '<button data-decide="pick" data-group="' + esc(g) + '">' + esc(btnText) + '</button></div>'
  }).join('')
  const rows = labels.map((label, i) => {
    const cells = groups.map((g) => {
      const cand = (stop.candidates || []).find((c) => c.group === g && c.label === label)
      if (!cand) return '<div class="card empty"></div>'
      const filePath = path.join(root, 'design', cand.path)
      let html = ''
      try { html = fs.readFileSync(filePath, 'utf8') } catch { html = '' }
      const vp = viewportOf(html) || vp0
      const rel = path.relative(outDir, filePath).split(path.sep).join('/')
      // D4's lightbox wiring resolves "same step, other candidate" and "which group is this
      // card" purely from these two attributes — never from a page-wide frame index.
      return '<div class="card" data-group="' + esc(g) + '" data-step="' + (i + 1) + '"><h3>' + esc(label) +
        '<span class="vp">' + vp.width + '×' + vp.height + '</span>' +
        '<a class="open" title="open ↗" href="' + esc(rel) + '" target="_blank">open ↗</a></h3>' +
        frameTag(rel, vp.width, vp.height) + '</div>'
    }).join('')
    return '<div class="step">step ' + (i + 1) + ' · ' + esc(label) + '</div>' + cells
  }).join('')
  const why = decided
    ? '<input name="why-' + stop.id + '" placeholder="why this one — optional">' +
      '<button data-decide="why">Save</button>'
    : ''
  return '<div class="cmp" id="stop-' + stop.id + '" data-kind="pick" data-id="' + stop.id +
    '" style="--cols:' + groups.length + '">' + heads + rows + why + '</div>'
}

// D3(d)/(e): the approve/change block and D4's inline decide script live in lib/stop-block.js —
// one renderer and one copy of the picks script shared with the journey review page
// (specs/20260906/04-journey-review-page.md A1/D5), so a decision recorded from either page is
// byte-identical on disk. `?clean` strips the script wholesale via its comment markers.
const { renderApproveStop, PICKS_SCRIPT, stripPicksScript } = require('./lib/stop-block')

function renderStop(stop, root, outDir, vp0) {
  return stop.kind === 'pick' ? renderCompareTable(stop, root, outDir, vp0) : renderApproveStop(stop)
}

function stripCleanArtifacts(html) {
  return stripPicksScript(html)
}

// ---- build ---------------------------------------------------------------------------------------
// buildAtlas(root, out) is the one derivation both `build` (writes the file, prints one line)
// and `serve` (regenerates on every GET of the index, so the served atlas is never a stale or
// missing file) call — the atlas is a derived view, never a hand-maintained artifact.
function buildAtlas(root, out) {
  const mocksDir = path.join(root, 'design/mocks')
  const { nodes, edges } = parseSurfaces(path.join(root, 'docs/roadmap'))

  // D15: seed.md journeys are a second surfaces source, owner `seed:<journey>` — merged in
  // before section/labels are derived so a seed-only label (no roadmap yet) still gets a home.
  const seedJourneys = parseSeedJourneys(root)
  const seedPersonaByJourney = new Map()
  for (const [jn, j] of seedJourneys) {
    seedPersonaByJourney.set(jn, j.persona)
    for (const l of j.labels) if (!nodes.has(l)) nodes.set(l, { brief: 'seed:' + jn })
    for (const e of j.edges) edges.push(e)
  }

  const targets = loadTargets(root)
  const vp0 = (targets && (targets.viewports || [])[0]) || { width: 390, height: 844 }

  // mocks: label -> {file, status, vp, states}
  const mocks = new Map()
  if (fs.existsSync(mocksDir)) {
    for (const f of htmlFilesUnder(mocksDir)) {
      const html = fs.readFileSync(f, 'utf8')
      const states = [...new Set([...html.matchAll(/data-state-btn\s*=\s*"([^"]+)"/g)].map(m => m[1]))]
      mocks.set(labelOf(html) || path.basename(f, '.html'),
        { file: f, status: statusOf(html), vp: viewportOf(html) || vp0, states })
    }
  }

  // coverage ledger: label -> {spec, built}. specs/20260901/04 D5: the single derivation, shared
  // with `shell sync`'s built-mock skip so the two never drift apart.
  const claims = shellLib.loadCoverageClaims(root)

  // optional built routes: config design.atlasRoutes {label: url}
  const routes = ((readConfig(root).design || {}).atlasRoutes) || {}

  const labels = [...new Set([...nodes.keys(), ...mocks.keys()])].sort()
  const outDir = path.dirname(out)

  // specs/20260905/01-picks-on-the-atlas-page.md D3: picks.json is read on every request — a
  // consumed/superseded stop, or no file at all, renders nothing (readPicks/pending both fail
  // closed to []/empty lists, never a build error).
  let picksStops = []
  try { picksStops = picksLib.readPicks(root) } catch { picksStops = [] }
  const { open: openStops, decided: decidedStops } = picksLib.pending(picksStops)
  const liveStops = openStops.concat(decidedStops)
  const stopsByHome = { shapes: [], theme: [], kit: [], header: [], standalone: [] }
  const stopsByJourney = new Map()
  for (const stop of liveStops) {
    const home = stopHome(stop.key)
    if (home.type === 'journey') {
      if (!stopsByJourney.has(home.journey)) stopsByJourney.set(home.journey, [])
      stopsByJourney.get(home.journey).push(stop)
    } else {
      stopsByHome[home.type].push(stop)
    }
  }

  const rows = labels.map(label => {
    const mock = mocks.get(label)
    const claim = claims.get(label)
    const declared = nodes.has(label)
    const badges = []
    if (claim && claim.built) badges.push('built')
    else if (claim) badges.push('bound')
    if (mock) badges.push(mock.status)
    else badges.push('gap')
    // orphan = a mock with NO owner of either kind: no brief declares it and no spec claims it
    // in the coverage ledger. Standalone-spec mocks (claimed, undeclared) are legitimate.
    if (mock && !declared && !claim) badges.push('orphan')
    const primary = badges[0]
    // `brief` is the raw section-grouping key (a roadmap md path, or `seed:<journey>`); the
    // meta line renders a friendlier form so a journey-owned label never shows "brief: seed:j1".
    const rawBrief = declared ? nodes.get(label).brief : null
    const brief = rawBrief
    // gap surfaces render as compact chips under their section — 60 undrawn screens as full-size
    // dashed boxes would bury the mocks the reviewer came to see.
    if (!mock) {
      return {
        label, primary, brief, chip: true,
        html: '<span class="gapchip" id="s-' + esc(label) + '" data-st="' + primary +
          '" title="declared, no mock yet">' + esc(label) + '</span>',
      }
    }
    const badgeHtml = badges.map(b => '<span class="badge ' + b + '">' + b + '</span>').join('')
    // D15: one frame per declared data-state-btn state, each carrying data-screen-label/
    // data-state so the atlas surfaces every state side by side instead of only the default —
    // a mock with no state controls keeps the single default frame, byte-identical to before.
    const body = mock.states.length
      ? mock.states.map(s =>
          '<div class="framewrap" data-screen-label="' + esc(label) + '" data-state="' + esc(s) + '">' +
          '<div class="statelabel">' + esc(s) + '</div>' +
          frameTag(path.relative(outDir, mock.file), mock.vp.width, mock.vp.height) + '</div>').join('')
      : frameTag(path.relative(outDir, mock.file), mock.vp.width, mock.vp.height)
    const builtFrame = routes[label]
      ? '\n<h3>built</h3>' + frameTag(routes[label], mock.vp.width, mock.vp.height)
      : ''
    const briefDisplay = !rawBrief ? null
      : rawBrief.startsWith('seed:') ? 'journey: ' + rawBrief.slice(5)
      : 'brief: ' + esc(path.basename(rawBrief))
    const meta = [
      briefDisplay || 'no declaring brief',
      claim ? 'spec: ' + esc(claim.spec) : null,
    ].filter(Boolean).join(' · ')
    // wide framings (tablet/desktop mocks) take the full row so they stay legible when scaled
    const wide = mock.vp.width >= 700 ? ' wide' : ''
    return {
      label, primary, brief, chip: false,
      html: '<div class="card' + wide + '" id="s-' + esc(label) + '" data-st="' + primary + '"><h3>' +
        esc(label) + '</h3>' + badgeHtml + body + builtFrame + '<div class="meta">' + meta + '</div></div>',
    }
  })

  const counts = {}
  for (const r of rows) counts[r.primary] = (counts[r.primary] || 0) + 1
  const summary = Object.keys(counts).sort().map(k => counts[k] + ' ' + k).join(' · ') || 'no surfaces'

  // sections: one per declaring brief (roadmap order = filename order), undeclared mocks last
  const sections = new Map()
  for (const r of rows) {
    const key = r.brief || '~no declaring brief'
    if (!sections.has(key)) sections.set(key, { cards: [], chips: [] })
    sections.get(key)[r.chip ? 'chips' : 'cards'].push(r)
  }
  // D3(b): a journey key (journey-approved:<j>) attaches to
  // the section whose derived title equals <j> — the same title a reader sees on the section's
  // own <h2>. A journey with no matching section (nothing drawn under it yet) falls back to a
  // standalone block rather than being silently dropped.
  const journeySectionKeyByName = new Map()
  for (const key of sections.keys()) {
    const isSeedKey = key.startsWith('seed:')
    const t = key === '~no declaring brief' ? 'no declaring brief' : isSeedKey ? key.slice(5) : key.replace(/\.md$/, '')
    journeySectionKeyByName.set(t, key)
  }
  const journeyStopsHtmlByKey = new Map()
  const unhomedJourneyStops = []
  for (const [journeyName, jStops] of stopsByJourney) {
    const key = journeySectionKeyByName.get(journeyName)
    if (key) {
      journeyStopsHtmlByKey.set(key, (journeyStopsHtmlByKey.get(key) || '') + jStops.map((s) => renderStop(s, root, outDir, vp0)).join('\n'))
    } else {
      unhomedJourneyStops.push(...jStops)
    }
  }

  const sectionHtml = [...sections.keys()].sort().map(key => {
    const { cards, chips } = sections.get(key)
    // D15: a `seed:<journey>` key titles by the bare journey (not the raw "seed:j1" key) and
    // carries the seed's persona line as a subtitle — the same context a session reads before
    // drawing that journey's screens.
    const isSeed = key.startsWith('seed:')
    const title = key === '~no declaring brief' ? 'no declaring brief' : isSeed ? key.slice(5) : key.replace(/\.md$/, '')
    const subtitle = isSeed ? (seedPersonaByJourney.get(title) || '') : ''
    const count = [cards.length ? cards.length + ' mocked' : null, chips.length ? chips.length + ' gap' : null]
      .filter(Boolean).join(' · ')
    const stopsHtml = journeyStopsHtmlByKey.get(key) || ''
    // D6: every journey section's heading links to its review page — the journey look now
    // happens there, never inline on the atlas index.
    const reviewLink = isSeed ? '<a class="rv-review" href="/review/' + esc(title) + '.html">Review →</a>' : ''
    // D2: the section heading is the toc's jump target — id="j-<title>" is new, everything else
    // on this line is unchanged.
    return '<section class="sect"><h2 id="j-' + esc(title) + '">' + esc(title) + '<span class="count">' + count + '</span>' + reviewLink + '</h2>\n' +
      (subtitle ? '<p class="meta">' + esc(subtitle) + '</p>\n' : '') +
      stopsHtml +
      (cards.length ? '<div class="grid">\n' + cards.map(r => r.html).join('\n') + '\n</div>' : '') +
      (chips.length ? '\n<div class="gaps">' + chips.map(r => r.html).join('') + '</div>' : '') +
      '</section>'
  }).join('\n')

  // D2: one .tocgroup per rendered journey/brief section, in the same sorted order sectionHtml
  // itself renders — a heading jumps to the id above, a row to #s-<label> the card/gap chip
  // already carries. Mirrors the loop above exactly so the two never disagree on title or order.
  const journeyTocGroupsHtml = [...sections.keys()].sort().map(key => {
    const { cards, chips } = sections.get(key)
    const isSeed = key.startsWith('seed:')
    const title = key === '~no declaring brief' ? 'no declaring brief' : isSeed ? key.slice(5) : key.replace(/\.md$/, '')
    const allRows = cards.concat(chips)
    if (!allRows.length) return ''
    const rowsHtml = allRows.map(r =>
      '<button class="tocrow" data-label="' + esc(r.label) + '" data-st="' + esc(r.primary) + '">' +
      '<span class="dot ' + esc(r.primary) + '"></span><span class="lbl">' + esc(r.label) + '</span></button>').join('')
    return '<div class="tocgroup" data-group="' + esc(title) + '">' +
      '<div class="tochead" id="th-' + esc(title) + '">' + esc(title) + '<span class="count">' + allRows.length + '</span></div>' +
      rowsHtml + '</div>'
  }).join('')

  // D15: design/shapes/*.html render under their own "shapes" section keyed by shape file (a
  // candidate register, not a screen — never merged into the labels/journeys sections above).
  const shapesDir = path.join(root, 'design/shapes')
  let shapesSectionHtml = ''
  let shapesTocGroupHtml = ''
  if (fs.existsSync(shapesDir)) {
    const shapeFiles = fs.readdirSync(shapesDir).filter(f => f.endsWith('.html')).sort()
    if (shapeFiles.length) {
      // D3(b)/(c): an open or decided shape-picked stop replaces the plain candidate cards with
      // the compare table — the pick lives where the look already happened.
      const shapeStopsHtml = stopsByHome.shapes.map((s) => renderStop(s, root, outDir, vp0)).join('\n')
      const shapeCards = shapeFiles.map((f, i) => {
        const kebab = path.basename(f, '.html')
        const filePath = path.join(shapesDir, f)
        const vp = viewportOf(fs.readFileSync(filePath, 'utf8')) || vp0
        return '<div class="card' + (vp.width >= 700 ? ' wide' : '') + '"><h3><span class="num">' + (i + 1) + '</span>' + esc(kebab) + '</h3>' +
          '<span class="badge candidate">candidate</span>' +
          frameTag(path.relative(outDir, filePath), vp.width, vp.height) + '</div>'
      }).join('\n')
      // D2: "shapes" is first in the toc's render order. id="j-shapes" gives the heading a jump
      // target/current-section marker exactly like a journey section's <h2> does; the group
      // carries no .tocrow — a layout candidate is not a "surface" (mocked card/gap chip) in
      // D2's sense, and none carries an id="s-<label>" to jump to.
      shapesSectionHtml = '<section class="sect" id="shapes"><h2 id="j-shapes">shapes<span class="count">' + shapeFiles.length + ' candidates</span></h2>\n' +
        '<p class="meta">Each card is one way to lay out the whole product. Click a card to see it at full size, ' +
        'use the width buttons above to compare on phone and desktop, then reply <b>approve &lt;name&gt;</b> in the session.</p>\n' +
        (shapeStopsHtml || ('<div class="grid">\n' + shapeCards + '\n</div>')) + '</section>'
      shapesTocGroupHtml = '<div class="tocgroup" data-group="shapes">' +
        '<div class="tochead" id="th-shapes">shapes<span class="count">' + shapeFiles.length + '</span></div></div>'
    }
  }

  // D3(b): a theme-picked stop gets its own section right after shapes — there is no plain
  // "theme" derivation elsewhere in the atlas to replace, the compare table is the whole section.
  const themeStopsHtml = stopsByHome.theme.map((s) => renderStop(s, root, outDir, vp0)).join('\n')
  const themeSectionHtml = themeStopsHtml
    ? '<section class="sect" id="theme"><h2 id="j-theme">theme</h2>\n' + themeStopsHtml + '</section>'
    : ''
  // D2: "theme" is second in the toc's render order, right after shapes — same no-.tocrow
  // reasoning as shapes (a theme stop's compare table carries no id="s-<label>" surface either),
  // but D2 still requires the .tochead's .count pill regardless — the count here is the number
  // of live theme stops (open/decided) the section renders.
  const themeTocGroupHtml = themeStopsHtml
    ? '<div class="tocgroup" data-group="theme"><div class="tochead" id="th-theme">theme' +
      '<span class="count">' + stopsByHome.theme.length + '</span></div></div>'
    : ''

  // specs/20260907/04-kit-canon-family.md D7/D14: a kit-signed stop gets its own #kit section —
  // renderKitStop frames every candidate before the approve/change block, so the sign-off step
  // has something to look at. No open/decided kit-signed stop = no section at all.
  const kitStopsHtml = stopsByHome.kit.map((s) => renderKitStop(s, root, outDir, vp0)).join('\n')
  const kitSectionHtml = kitStopsHtml
    ? '<section class="sect" id="kit"><h2>kit</h2>\n' + kitStopsHtml + '</section>'
    : ''
  // D2's render-order parenthetical ("shapes, theme, then the sorted journey/brief sections")
  // names only those three — kit is specs/20260907/04's own concurrent, disjoint section (A6)
  // and is deliberately left out of both the toc tree and the id="j-*" heading register; see the
  // deviations sidecar.
  const tocGroupsHtml = shapesTocGroupHtml + themeTocGroupHtml + journeyTocGroupsHtml

  // D3(a): the #stops index — links and text only, before every other section.
  const openLines = openStops.map((s) =>
    '<li><a href="#stop-' + s.id + '">' + esc(s.title) + '</a> · ' + esc(s.kind) + '</li>').join('')
  const decidedLines = decidedStops.map((s) => {
    const verdictPhrase = s.decision ? s.decision.verdict + (s.decision.pick ? ' ' + s.decision.pick : '') : ''
    const by = s.decision ? s.decision.by : ''
    return '<li><a href="#stop-' + s.id + '">' + esc(s.title) + '</a> · ' + esc(verdictPhrase) + ' · ' + esc(by) + '</li>'
  }).join('')
  const stopsIndexHtml = liveStops.length
    ? '<section id="stops">' +
      (openLines ? '<h2>Waiting for your look</h2><ol>' + openLines + '</ol>' : '') +
      (decidedLines ? '<h2>Decided — waiting for the session</h2><ol>' + decidedLines + '</ol>' : '') +
      '</section>'
    : ''

  // D3(b): a key matching no known grammar (or a journey with no matching section) renders as a
  // standalone block right after #stops, before any class="sect" section.
  const standaloneHtml = stopsByHome.standalone.concat(unhomedJourneyStops)
    .map((s) => renderStop(s, root, outDir, vp0)).join('\n')

  // D3(b): key "approved" attaches to the page header.
  const headerStopsHtml = stopsByHome.header.map((s) => renderStop(s, root, outDir, vp0)).join('\n')

  // status filter chips: hide everything not matching, collapse sections that go empty
  const filterBar =
    '<button data-f class="on" onclick="__filter(\'all\',this)">all ' + rows.length + '</button>' +
    Object.keys(counts).sort().map(k =>
      '<button data-f onclick="__filter(\'' + k + '\',this)"><span class="dot ' + k + '"></span>' + k + ' ' + counts[k] + '</button>').join('')
  // D4: one filter model — the status chips narrow the index as well as the cards, so the two
  // can never disagree. __tocApply (TOC_SCRIPT) ANDs this status with the search query itself;
  // __filter only has to record the active status and ask it to recompute.
  const filterScript = '<script>\n' +
    'function __filter(st,btn){__sel(btn,"data-f");__tocStatus=st;' +
    'document.querySelectorAll("[data-st]").forEach(function(el){el.hidden=st!=="all"&&el.dataset.st!==st});' +
    'document.querySelectorAll(".sect").forEach(function(s){s.hidden=!s.querySelector("[data-st]:not([hidden])")});' +
    '__tocApply();' +
    '__fitAll()}\n</script>'

  // D1-D5: the persistent screen index's behavior. D5's current-section marker is a threshold
  // rule, not an IntersectionObserver (A3: a `rootMargin:'-10% 0px -80% 0px'` band marked NOTHING
  // at four scroll positions in the executed prototype — a heading jumped to lands above the
  // band's top edge and never intersects it). D1/A4: overlay mode is read from #tocbtn's computed
  // display, never a breakpoint literal repeated here — the executed prototype left the overlay
  // open after a jump the one time the breakpoint was duplicated.
  const TOC_SCRIPT = '<script>\n' +
    'var __tocStatus="all";\n' +
    // UI section, verbatim: "overlay open" is #toc at translateX(0), the scrim painted, AND
    // #tocbtn.on — all three toggle together.
    'function __tocOpen(){document.getElementById("toc").classList.add("open");' +
    'var s=document.getElementById("tocscrim");if(s)s.classList.add("on");' +
    'var b=document.getElementById("tocbtn");if(b)b.classList.add("on")}\n' +
    'function __tocClose(){document.getElementById("toc").classList.remove("open");' +
    'var s=document.getElementById("tocscrim");if(s)s.classList.remove("on");' +
    'var b=document.getElementById("tocbtn");if(b)b.classList.remove("on")}\n' +
    'function __tocToggle(){var toc=document.getElementById("toc");' +
    'if(toc.classList.contains("open"))__tocClose();else __tocOpen()}\n' +
    'function __tocIsOverlay(){var btn=document.getElementById("tocbtn");' +
    'return !!btn&&getComputedStyle(btn).display!=="none"}\n' +
    'function __tocApply(){\n' +
    '  var q=((document.getElementById("tocsearch")||{}).value||"").toLowerCase();\n' +
    '  var any=false;\n' +
    '  document.querySelectorAll(".tocgroup").forEach(function(g){\n' +
    '    var groupMatch=(g.dataset.group||"").toLowerCase().indexOf(q)!==-1;\n' +
    '    var visible=false;\n' +
    '    g.querySelectorAll(".tocrow").forEach(function(row){\n' +
    '      var labelMatch=(row.dataset.label||"").toLowerCase().indexOf(q)!==-1;\n' +
    '      var statusOk=__tocStatus==="all"||row.dataset.st===__tocStatus;\n' +
    '      var show=(labelMatch||groupMatch)&&statusOk;\n' +
    '      row.hidden=!show;\n' +
    '      if(show)visible=true;\n' +
    '    });\n' +
    // D2/D4: a row-less group (shapes/theme carry a heading and no surfaces at all) has no
    // per-row status to filter, so the query alone governs its own title match (D3) — but D4
    // forbids the index disagreeing with the page, and the page's own inherited .sect-hiding
    // rule (pre-dates this spec, not rewritten here) hides a section with no visible [data-st]
    // descendant, which shapes/theme always are. Track that section's OWN .hidden — data-group
    // equals the section's own id ("shapes"/"theme") — so the two sides move together instead of
    // this group ignoring status outright.
    '    if(!g.querySelector(".tocrow")){\n' +
    '      var sect=document.getElementById(g.dataset.group);\n' +
    '      visible=groupMatch&&!(sect&&sect.hidden);\n' +
    '    }\n' +
    '    g.hidden=!visible;\n' +
    '    if(visible)any=true;\n' +
    '  });\n' +
    // D3: .tocempty is a class ("<p class=\"tocempty\" hidden>"), never an id.
    '  var empty=document.querySelector(".tocempty");if(empty)empty.hidden=any;\n' +
    '}\n' +
    'function __tocActivate(row){\n' +
    '  var label=row.getAttribute("data-label");\n' +
    '  var target=label?document.getElementById("s-"+label):null;\n' +
    '  if(target){target.scrollIntoView({block:"start"});target.classList.add("flash");' +
    'setTimeout(function(){target.classList.remove("flash")},1200)}\n' +
    '  if(__tocIsOverlay())__tocClose();\n' +
    '}\n' +
    // D2: "a heading jumps to #j-<title>" — a .tochead is also an activation, and closes the
    // overlay just like a row does. No .flash here: D2 pairs .flash with the row clause only,
    // and AC-3 (the sole flash-testing AC) exercises row activation exclusively — a heading's own
    // `.here` marker (a persistent 4px border, not a transient flash) is already this element's
    // arrival feedback, and a large section heading has no "which one did I land on" ambiguity
    // the way a dense grid of small tocrows does.
    'function __tocActivateHeading(head){\n' +
    '  var title=head.id.indexOf("th-")===0?head.id.slice(3):null;\n' +
    '  var target=title?document.getElementById("j-"+title):null;\n' +
    '  if(target)target.scrollIntoView({block:"start"});\n' +
    '  if(__tocIsOverlay())__tocClose();\n' +
    '}\n' +
    'function __tocMark(){\n' +
    // D4: a hidden section's heading (e.g. status-filtered out entirely — .sect.hidden) must
    // never win "current" — a display:none element's getBoundingClientRect().top is 0, which is
    // always at-or-above the threshold, so a later hidden heading would otherwise beat a real,
    // visible one.
    '  var heads=[].slice.call(document.querySelectorAll(".sect>h2")).filter(function(h){\n' +
    '    var sect=h.closest(".sect");return !(sect&&sect.hidden)\n' +
    '  });\n' +
    '  if(!heads.length)return;\n' +
    '  var thresh=Math.max(80,window.innerHeight*0.25);\n' +
    '  var current=heads[0];\n' +
    '  for(var i=0;i<heads.length;i++){if(heads[i].getBoundingClientRect().top<=thresh)current=heads[i]}\n' +
    '  document.querySelectorAll(".tochead.here").forEach(function(h){h.classList.remove("here")});\n' +
    '  var title=current.id.indexOf("j-")===0?current.id.slice(2):null;\n' +
    '  var th=title?document.getElementById("th-"+title):null;\n' +
    '  if(th)th.classList.add("here");\n' +
    '}\n' +
    'var __tocRaf=null;\n' +
    'function __tocOnScroll(){if(__tocRaf)return;' +
    '__tocRaf=requestAnimationFrame(function(){__tocRaf=null;__tocMark()})}\n' +
    'window.addEventListener("scroll",__tocOnScroll);\n' +
    '(function(){\n' +
    // #tocbtn's own onclick="__tocToggle()" attribute already wires the toggle — a second
    // "click" listener here would fire on the same event and double the toggle (open then
    // immediately re-close on one click), so none is added.
    '  var scrim=document.getElementById("tocscrim");if(scrim)scrim.addEventListener("click",__tocClose);\n' +
    '  var tree=document.getElementById("toctree");\n' +
    '  if(tree)tree.addEventListener("click",function(e){\n' +
    '    var row=e.target.closest?e.target.closest(".tocrow"):null;\n' +
    '    if(row){__tocActivate(row);return}\n' +
    '    var head=e.target.closest?e.target.closest(".tochead"):null;\n' +
    '    if(head)__tocActivateHeading(head)\n' +
    '  });\n' +
    '  var search=document.getElementById("tocsearch");\n' +
    '  if(search){\n' +
    '    search.addEventListener("input",__tocApply);\n' +
    '    search.addEventListener("keydown",function(e){\n' +
    '      if(e.key==="Enter"){var first=document.querySelector(".tocrow:not([hidden])");if(first)first.click()}\n' +
    '    });\n' +
    '  }\n' +
    '  document.addEventListener("keydown",function(e){\n' +
    '    if(e.key==="Escape")__tocClose();\n' +
    '    var tag=(document.activeElement&&document.activeElement.tagName)||"";\n' +
    '    if(e.key==="/"&&document.activeElement!==search&&tag!=="INPUT"&&tag!=="TEXTAREA"){\n' +
    '      e.preventDefault();if(__tocIsOverlay())__tocOpen();if(search)search.focus()\n' +
    '    }\n' +
    '  });\n' +
    '  __tocApply();\n' +
    '  __tocMark();\n' +
    '})();\n' +
    '</script>'

  const graphData = {
    nodes: labels.map(l => ({ data: { id: l, status: (rows.find(r => r.label === l) || {}).primary || 'gap' } })),
    edges: edges.map(([a, b], i) => ({ data: { id: 'e' + i, source: a, target: b } })),
  }
  // Journey graph: Cytoscape+Dagre from CDN when online; the grid below is the always-works view,
  // so an offline atlas degrades to hiding the graph pane, never to a broken page.
  const graph =
    '<div id="journey"></div>\n' +
    '<script>window.__atlas = ' + JSON.stringify(graphData) + '</script>\n' +
    '<script src="https://unpkg.com/cytoscape@3/dist/cytoscape.min.js" onerror="document.getElementById(\'journey\').style.display=\'none\'"></script>\n' +
    '<script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"></script>\n' +
    '<script src="https://unpkg.com/cytoscape-dagre@2/cytoscape-dagre.js"></script>\n' +
    '<script>\n' +
    'if (window.cytoscape) { try { if (window.cytoscapeDagre) cytoscape.use(cytoscapeDagre) } catch (e) {}\n' +
    // specs/20260902/09-one-hand-wireframes-one-token-set.md D5/Behavior: the graph's status colors
    // are read at runtime via getComputedStyle from the same --v-* roles the rest of the chrome
    // consumes, never a literal hex map in this script.
    '  var __cs=getComputedStyle(document.documentElement);\n' +
    '  function __role(name,fallback){var v=__cs.getPropertyValue(name).trim();return v||fallback}\n' +
    '  var colorRoles={gap:"--v-danger",sketch:"--v-warn",ratified:"--v-ok",approved:"--v-ok",bound:"--v-ring",built:"--v-primary"};\n' +
    '  var cy=cytoscape({container:document.getElementById("journey"),elements:__atlas,\n' +
    '    minZoom:.15,maxZoom:3,wheelSensitivity:.2,\n' +
    '    layout:{name:window.cytoscapeDagre?"dagre":"breadthfirst",rankDir:"LR",padding:16},\n' +
    '    style:[{selector:"node",style:{label:"data(id)",color:__role("--v-fg","#333"),"font-size":"11px",\n' +
    '      "text-valign":"bottom","text-margin-y":4,\n' +
    '      "background-color":function(e){return __role(colorRoles[e.data("status")]||"--v-border","#999")}}},\n' +
    '      {selector:"edge",style:{"curve-style":"bezier","target-arrow-shape":"triangle",\n' +
    '      width:1.5,"line-color":__role("--v-border","#999"),"target-arrow-color":__role("--v-border","#999")}}]});\n' +
    '  cy.on("tap","node",function(e){var el=document.getElementById("s-"+e.target.id());if(el)el.scrollIntoView({behavior:"smooth"})});\n' +
    '}\n</script>'

  const bar = matrixBar(targets)
  // The header says what the page is and how to read it — a reviewer arriving cold from a link
  // gets the legend in words, not just chip colors.
  const projectName = path.basename(root)
  const legend = [
    ['gap', 'declared, not drawn yet'], ['sketch', 'drawn, waiting for your look'],
    ['approved', 'you approved it'], ['built', 'shipped in code'],
  ].filter(([k]) => counts[k]).map(([k, t]) => '<span><span class="badge ' + k + '">' + k + '</span>' + t + '</span>').join('')
  const shapesOnly = shapesSectionHtml && !rows.length
  const lede = shapesOnly
    ? 'Nothing is drawn per screen yet. The candidates below are the whole-product layout to pick first.'
    : rows.length
      ? 'One card per screen, grouped by journey. Click a card to see it at full size; the width and theme buttons re-frame every card at once.'
      : ''
  const header =
    '<div class="hdr"><h1>Design atlas</h1><span class="proj">' + esc(projectName) + ' · ' + esc(summary) + '</span></div>\n' +
    (lede ? '<p class="lede">' + lede + '</p>\n' : '') +
    (legend ? '<div class="legend">' + legend + '</div>\n' : '')
  const emptyHtml = (!rows.length && !shapesSectionHtml)
    ? '<div class="empty">Nothing drawn yet. Shapes appear here after the SHAPES step, screens after the first journey is drawn.</div>'
    : ''
  // D1: the Index toggle lives in the existing .bar, right beside the status chips it shares one
  // filter model with (D4).
  const tocBtnHtml = '<button id="tocbtn" onclick="__tocToggle()">Index</button>'
  // D1/D2/D8: buildAtlas alone wraps its composed body in #shell/#toc/#main — cmdGallery (which
  // never calls this code path) keeps emitting none of it (AC-5). #nl-notes is the LAST element
  // of #main: the one anchor both the notes layer's project-panel mount and a served mock's
  // strip link (D8) target.
  const mainBodyHtml =
    header + headerStopsHtml + stopsIndexHtml + standaloneHtml + (rows.length ? graph : '') +
    '\n<div class="bar">' + tocBtnHtml + filterBar + (bar.buttons ? '<span class="sep"></span>' + bar.buttons : '') + '</div>' +
    '\n' + shapesSectionHtml + '\n' + themeSectionHtml + '\n' + kitSectionHtml + '\n' + sectionHtml + '\n' + emptyHtml + '\n' +
    '<div id="nl-notes"></div>'
  const shellHtml =
    '<div id="shell"><aside id="toc"><p class="tochdr">Index</p>' +
    '<input id="tocsearch" type="search" placeholder="Search screens   /">' +
    '<nav id="toctree">' + tocGroupsHtml + '<p class="tocempty" hidden>No screen matches.</p></nav></aside>' +
    '<div id="tocscrim"></div>' +
    '<div id="main">' + mainBodyHtml + '</div></div>'
  const html = page('Design atlas',
    shellHtml + '\n' +
    LIGHTBOX + '\n' + UI_SCRIPT + bar.style + bar.script + filterScript + TOC_SCRIPT + PICKS_SCRIPT)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(out, html)
  return { html, out, count: labels.length, summary }
}

function cmdBuild(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const root = path.resolve(arg('--root', '.'))
  const out = path.resolve(root, arg('--out', 'design/atlas/index.html'))
  const r = buildAtlas(root, out)
  process.stdout.write('atlas: ' + r.count + ' surface(s) (' + r.summary + ') → ' + r.out + '\n')
}

// ---- serve -----------------------------------------------------------------------------------------
// specs/20260902/07-mocks-command-driver.md D12: static, read-only, no-store server over
// `<root>/design/` — the SSH rule (client access is the forwarded port only, never an export or a
// hosted copy); the listener binds loopback only — never every interface — so the forwarded port
// is the only remote path in, per specs/20260902/10-page-notes-review-loop.md's Contracts: "binds
// `localhost` only". The port-forward line is the very first stdout write, before anything else,
// so a caller reading stdout line-by-line never blocks waiting on a second line that never comes.
const ATLAS_INDEX_PATHS = new Set(['/', '/atlas', '/atlas/', '/atlas/index.html'])
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2',
}
// D2: inserts the notes-scope meta tag plus the (prefix-aware) notes-layer script tag
// immediately before the last `</body>` — appended at the end when no `</body>` is present at
// all (never blocks serving a headless fragment). specs/20260905/01 D2: the page declares its
// own scope (`mock` for a static file, `project` for the derived index) so the notes layer never
// has to guess it.
function injectNotesScript(html, scope, prefix) {
  const tag = '<meta name="notes-scope" content="' + scope + '">\n' +
    '<script src="' + prefix + '/__notes/notes.js"></script>\n'
  const idx = html.lastIndexOf('</body>')
  if (idx === -1) return html + '\n' + tag
  return html.slice(0, idx) + tag + html.slice(idx)
}

// specs/20260906/04-journey-review-page.md D2: the exact literal mocks-driver.js's `look --state`
// already injects for the file:// path — one mechanism, two entry points. Inserted before the
// last `</body>` (appended when absent — the same rule injectNotesScript uses), THEN
// injectNotesScript runs, so the order on disk is: mock body, click script, notes meta/script,
// </body> (never after — review fix round F1's ordering AC).
function stateClickScript(state) {
  return '<script>document.addEventListener(\'DOMContentLoaded\',function(){var b=document.querySelector(\'[data-state-btn="' +
    state + '"]\');if(b)b.click()})</script>'
}

// specs/20260910/02-click-to-advance-and-real-records.md D3: the tag injected before the last
// `</body>` by GET /mocks/<label>.html?walk — after stateClickScript when both are present.
function walkScriptTag(prefix) {
  return '<script src="' + prefix + '/__walk/walk.js"></script>'
}

// review fix round F1: insert before the last `</body>`, append at the end when none — shared
// with injectNotesScript's own placement rule so the two injections never straddle it.
function insertBeforeBodyEnd(html, snippet) {
  const idx = html.lastIndexOf('</body>')
  if (idx === -1) return html + snippet
  return html.slice(0, idx) + snippet + html.slice(idx)
}

// review fix round F5: a `state` value is only ever interpolated into the click script's
// double-quoted attribute-selector literal when it is exactly [A-Za-z0-9_-]+ — a state carrying a
// quote or backslash (e.g. `?state=x%27y`) would otherwise break out of the selector and produce
// a syntactically broken injected script. An invalid state serves as if the param were absent
// (never a 400 — ?state is advisory tooling, not a contract).
function validState(raw) {
  return raw && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null
}

// D2's POST body reader — a malformed (non-JSON) body rejects; an empty body reads as {}.
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function jsonRes(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

// specs/20260910/03-client-journey-player.md D5: shared by GET /review/<j>.html and GET
// /client/walk/<j>.html — both build a page from a builder that throws (naming every declared
// journey) on an unknown one, and both turn that throw into the same 404 shape.
function serveBuiltHtml(res, build) {
  let html
  try {
    html = build()
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end((e && e.message) || 'not found')
    return
  }
  res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
  res.end(html)
}

// specs/20260905/01-picks-on-the-atlas-page.md D2: the per-root request handler extracted from
// `cmdServe` — `serve` mounts it at prefix '' (the only mount this repo uses, specs/20260905/04
// D1). Every path is matched after stripping `prefix`; a request whose path does not start with
// `prefix` 404s.
function createRequestHandler(root, opts = {}) {
  const prefix = opts.prefix || ''
  const rootAbs = path.resolve(root)
  const designRoot = path.join(rootAbs, 'design') + path.sep
  const notesLibPath = path.join(__dirname, 'lib', 'notes-layer.browser.js')
  const viewerCssPath = path.join(__dirname, '..', 'templates', 'mocks', 'viewer.css')
  const reviewBrowserPath = path.join(__dirname, 'lib', 'review.browser.js')
  const walkBrowserPath = path.join(__dirname, 'lib', 'walk-mode.browser.js')
  const walkPlayerPath = path.join(__dirname, 'lib', 'walk.browser.js')

  return function handler(req, res) {
    const urlObj = new URL(req.url || '/', 'http://localhost')
    let fullPath
    try { fullPath = decodeURIComponent(urlObj.pathname) } catch { fullPath = '/' }

    let reqPath
    if (prefix) {
      if (fullPath === prefix) reqPath = '/'
      else if (fullPath.startsWith(prefix + '/')) reqPath = fullPath.slice(prefix.length)
      else { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
    } else {
      reqPath = fullPath
    }

    // specs/20260907/10-client-review.md D4: a request whose stripped path begins `/client/` (or
    // is exactly `/client`) is re-dispatched with clientRoute=true and the `/client` segment
    // removed — every route below this point matches identically for both mounts; only the
    // note-touching handlers below read `clientRoute` to change behavior (origin stamping, list
    // filtering, who may resolve what). Every other `/client/…` path (spec 11's served view)
    // still 404s below, unchanged.
    let clientRoute = false
    if (reqPath === '/client' || reqPath.startsWith('/client/')) {
      clientRoute = true
      reqPath = reqPath === '/client' ? '/' : reqPath.slice('/client'.length)
    }

    // specs/20260907/10-client-review.md: the three POST /__notes/add outcomes below (client
    // mock-scope, client project-scope, non-client) all read notes, call notesLib.addNote, then
    // write — this is the one shared shape. `decorate` runs synchronously between addNote and
    // writeNotes so callers can stamp capture/lastClientAt fields; `onAddError` runs synchronous
    // cleanup (the mock-scope path's pending-capture unlink) before the 400 is reported. The
    // whole function is synchronous end to end — no `await` anywhere in it — so a caller that
    // invokes it without awaiting anything else in between still satisfies D6's "no await between
    // the notes read and the notes write" for the mock-scope capture path.
    function addNoteAndRespond(addBody, { onAddError, decorate } = {}) {
      let notes = []
      try { notes = notesLib.readNotes(rootAbs) } catch { notes = [] }
      let result
      try {
        result = notesLib.addNote(notes, addBody)
      } catch (e) {
        if (onAddError) onAddError()
        return { error: e.message }
      }
      if (decorate) decorate(result.note)
      notesLib.writeNotes(rootAbs, result.notes)
      return { note: result.note }
    }

    // specs/20260907/10-client-review.md D5/D6: the client route's mock-scope
    // POST /__notes/add — captures the before-frame FIRST (a `.pending-<ts>.png` beside
    // notes.json, D5's captureScreen), then reads notes, adds the note, renames the pending file
    // to `captures/<id>.before.png`, and writes — no `await` between the read and the write. A
    // capture failure answers 503 and writes no note (the pending file, if any, is removed); the
    // note carries `capture: { before: { hash, file }, after: null }`.
    async function addClientMockNote(body) {
      const screenLabel = body && body.screen
      if (!screenLabel) { jsonRes(res, 400, { error: 'scope "mock" requires a screen' }); return }
      const capturesDir = path.join(rootAbs, 'design/mocks/captures')
      fs.mkdirSync(capturesDir, { recursive: true })
      const pendingPath = path.join(capturesDir, '.pending-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.png')
      const vp = reviewPageLib.viewportOf(loadTargets(rootAbs))
      let captured
      try {
        captured = await clientCaptureLib.captureScreen({
          port: opts.port, label: screenLabel, state: (body && body.state) || null, viewport: vp, out: pendingPath,
        })
      } catch (e) {
        try { fs.unlinkSync(pendingPath) } catch { /* best effort — capture may never have landed */ }
        jsonRes(res, 503, { error: e.message })
        return
      }
      // D6: the read, addNote, rename, and write below are one synchronous chain — no `await`
      // between the read and the write.
      const outcome = addNoteAndRespond(Object.assign({}, body, { origin: 'client' }), {
        onAddError: () => { try { fs.unlinkSync(pendingPath) } catch { /* best effort */ } },
        decorate: (note) => {
          const finalRel = 'captures/' + note.id + '.before.png'
          fs.renameSync(pendingPath, path.join(rootAbs, 'design/mocks', finalRel))
          note.capture = { before: { hash: captured.hash, file: finalRel }, after: null }
          note.lastClientAt = new Date().toISOString()
        },
      })
      if (outcome.error) { jsonRes(res, 400, { error: outcome.error }); return }
      jsonRes(res, 201, outcome.note)
    }

    // ---- /__notes/* (D2) ------------------------------------------------------------------
    if (reqPath === '/__notes/notes.js' && req.method === 'GET') {
      fs.readFile(notesLibPath, (err, data) => {
        if (err) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
        res.end(data)
      })
      return
    }
    if (reqPath === '/__notes/viewer.css' && req.method === 'GET') {
      fs.readFile(viewerCssPath, (err, data) => {
        if (err) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
        res.writeHead(200, { 'content-type': 'text/css', 'cache-control': 'no-store' })
        res.end(data)
      })
      return
    }
    if (reqPath === '/__notes/list' && req.method === 'GET') {
      const screen = urlObj.searchParams.get('screen')
      let notes = []
      try { notes = notesLib.readNotes(rootAbs) } catch { notes = [] }
      // D6: screen=** is a NEW token returning every note regardless of scope (the atlas
      // project panel's D7 flat listing needs to reach a mock-scope note screen=* never could);
      // screen=* and screen=<label> keep their present meaning byte-for-byte
      // (specs/20260906/03 D3's scope contract).
      let out = screen === '**'
        ? notes
        : screen === '*'
          ? notes.filter((n) => n.scope === 'project')
          : notes.filter((n) => n.scope === 'mock' && n.screen === screen)
      // specs/20260907/10-client-review.md D4: the client route's own /__notes/list returns
      // questions plus client-origin notes only — a walk or session-origin plain note never
      // appears there; the non-client route keeps returning everything, unchanged (AC-20260907-10-21).
      if (clientRoute) out = out.filter((n) => n.kind === 'question' || notesLib.originOf(n) === 'client')
      // specs/20260906/03 D3: a question note is joined against its ledger row on every request
      // (never cached) — claim/rejected/tag/status come from the row, ledgerMissing:true when the
      // row is gone. Parsed at most once per request, lazily (most lists carry no question).
      let ledgerRows = null
      const joined = out.map((n) => {
        if (n.kind !== 'question') return n
        if (ledgerRows === null) {
          try { ledgerRows = parseLedger(fs.readFileSync(path.join(rootAbs, 'design/mocks/ledger.md'), 'utf8')).assumptions } catch { ledgerRows = [] }
        }
        const row = ledgerRows.find((a) => a.id === n.ledgerId)
        if (!row) return Object.assign({}, n, { ledgerMissing: true })
        return Object.assign({}, n, { claim: row.claim, rejected: row.rejected, tag: row.tag, status: row.status })
      })
      jsonRes(res, 200, joined)
      return
    }
    if (reqPath === '/__notes/add' && req.method === 'POST') {
      readJsonBody(req).then((body) => {
        // D3: questions are session-authored only — a client body naming kind/ledgerId is
        // rejected before it ever reaches addNote (which itself accepts those fields for
        // mocks-driver.js's own direct, non-HTTP callers).
        if (body && (body.kind != null || body.ledgerId != null)) {
          jsonRes(res, 400, { error: 'questions are session-authored — kind/ledgerId are not accepted here' })
          return
        }
        // specs/20260907/10-client-review.md D4: origin is decided by the route alone, never
        // accepted from the body, on EITHER route.
        if (body && body.origin != null) {
          jsonRes(res, 400, { error: 'origin is set by the route, not the request body' })
          return
        }
        if (clientRoute) {
          // D6: a mock-scope client add captures its before-frame FIRST — no note is written, and
          // no note id (and so no captures/<id>.before.png name) exists, until the capture lands.
          if (body && body.scope === 'mock') { addClientMockNote(body); return }
          // D6: a project-scope client note carries no capture at all.
          const outcome = addNoteAndRespond(Object.assign({}, body, { origin: 'client' }), {
            decorate: (note) => { note.capture = null; note.lastClientAt = new Date().toISOString() },
          })
          if (outcome.error) { jsonRes(res, 400, { error: outcome.error }); return }
          jsonRes(res, 201, outcome.note)
          return
        }
        const outcome = addNoteAndRespond(body)
        if (outcome.error) { jsonRes(res, 400, { error: outcome.error }); return }
        jsonRes(res, 201, outcome.note)
      }).catch((e) => jsonRes(res, 400, { error: 'malformed request body: ' + e.message }))
      return
    }
    if (reqPath === '/__notes/resolve' && req.method === 'POST') {
      readJsonBody(req).then((body) => {
        let notes = []
        try { notes = notesLib.readNotes(rootAbs) } catch { notes = [] }
        // D3: a question is never resolved this way — the refusal names the one path that closes
        // it (POST /__notes/answer), checked before resolveNote's own generic "no note" 404.
        const target = notes.find((n) => n.id === (body && body.id))
        if (target && target.kind === 'question') {
          jsonRes(res, 400, { error: 'a question is answered, never resolved — answer it (/__notes/answer)' })
          return
        }
        // specs/20260907/10-client-review.md D4: only a client-origin note is ever resolved on
        // the client route (400 naming the offending origin otherwise); the non-client route
        // refuses a client-origin note outright (403, naming the client route and `notes waive`)
        // — the note is left byte-identical on disk in both refusal cases.
        if (target) {
          const origin = notesLib.originOf(target)
          if (clientRoute && origin !== 'client') {
            jsonRes(res, 400, { error: 'note "' + target.id + '" is ' + origin + '-origin — the client route resolves only client-origin notes' })
            return
          }
          if (!clientRoute && origin === 'client') {
            jsonRes(res, 403, { error: 'note "' + target.id + '" is client-origin — resolve it through the client route, or release it with `notes waive`' })
            return
          }
        }
        let result
        try { result = notesLib.resolveNote(notes, body.id, body.by, clientRoute ? { viaClient: true } : undefined) } catch (e) { jsonRes(res, 404, { error: e.message }); return }
        notesLib.writeNotes(rootAbs, result.notes)
        jsonRes(res, 200, result.note)
      }).catch((e) => jsonRes(res, 400, { error: 'malformed request body: ' + e.message }))
      return
    }
    if (reqPath === '/__notes/answer' && req.method === 'POST') {
      readJsonBody(req).then((body) => {
        const id = body && body.id
        const verdict = body && body.verdict
        const by = (body && body.by) || 'session'
        if (!id || (verdict !== 'yes' && verdict !== 'no')) {
          jsonRes(res, 400, { error: 'answer needs {id, verdict: "yes"|"no", by}' })
          return
        }
        if (verdict === 'no' && !String((body && body.text) || '').trim()) {
          jsonRes(res, 400, { error: 'a "no" answer requires non-empty text' })
          return
        }
        let notes = []
        try { notes = notesLib.readNotes(rootAbs) } catch { notes = [] }
        const target = notes.find((n) => n.id === id)
        if (!target) { jsonRes(res, 404, { error: 'no note with id "' + id + '"' }); return }
        if (target.kind !== 'question') { jsonRes(res, 400, { error: 'note "' + id + '" is not a question' }); return }
        // s0 fix: "already answered" keys on `answer != null`, never `status` — a question's
        // status can move to "addressed" later (the session's own `notes address` follow-up
        // recording a redraw after a "no") without ever being re-answerable.
        if (target.answer != null) { jsonRes(res, 409, { error: 'question "' + id + '" is already answered' }); return }

        // D3 Rationale: the ledger write happens FIRST — a crash between the two writes leaves an
        // answered row with a still-open note (a harmless re-ask), never a resolved note over an
        // open row.
        const ledgerPath = path.join(rootAbs, 'design/mocks/ledger.md')
        let ledgerText
        try { ledgerText = fs.readFileSync(ledgerPath, 'utf8') } catch (e) { jsonRes(res, 400, { error: 'design/mocks/ledger.md does not exist: ' + e.message }); return }
        const today = new Date().toISOString().slice(0, 10)
        const newStatus = (verdict === 'yes' ? 'confirmed ' : 'overridden ') + today
        let rewritten
        try { rewritten = setStatus(ledgerText, target.ledgerId, newStatus) } catch (e) { jsonRes(res, 400, { error: e.message }); return }
        fs.writeFileSync(ledgerPath, rewritten)

        // specs/20260910/03-client-journey-player.md D6: a client's "no" WITH text is a fact the
        // client said, not merely the session's own guess being corrected — it promotes to a new
        // said-by-user row, right after the row it corrects flips to overridden. The non-client
        // route (D6 CONTINUES TO) never runs this: the session correcting its own guess is not the
        // client saying something.
        let promotedId = null
        if (clientRoute) {
          const claimText = String((body && body.text) || '').trim()
          if (claimText) {
            let promotedLedger
            try {
              promotedId = nextClientLedgerId(parseLedger(rewritten))
              promotedLedger = appendAssumption(rewritten, {
                id: promotedId, step: 'CLIENT', kind: 'product', claim: claimText, tag: 'said-by-user',
                status: 'confirmed ' + today, rejected: null, dependents: null, note: 'corrects ' + target.ledgerId,
              })
            } catch (e) { jsonRes(res, 400, { error: e.message }); return }
            fs.writeFileSync(ledgerPath, promotedLedger)
          }
        }

        let result
        try { result = notesLib.answerQuestion(notes, id, { verdict, text: (body && body.text) || '', by }) } catch (e) { jsonRes(res, 400, { error: e.message }); return }
        notesLib.writeNotes(rootAbs, result.notes)
        jsonRes(res, 200, promotedId ? Object.assign({}, result.note, { promoted: promotedId }) : result.note)
      }).catch((e) => jsonRes(res, 400, { error: 'malformed request body: ' + e.message }))
      return
    }
    if (reqPath.startsWith('/__notes/')) {
      res.writeHead(404, { 'cache-control': 'no-store' })
      res.end('not found')
      return
    }

    // ---- the client player (specs/20260910/03-client-journey-player.md D5) --------------------
    // GET /client/index.html, GET /client/walk/<j>.html, GET /client/__walk/state?journey=<j>,
    // POST /client/__walk/event, POST /client/__walk/confirm — every one client-mount-only by
    // construction (guarded on `clientRoute`), so a non-client request for the same stripped path
    // (e.g. a bare POST /__walk/event) falls through, unmatched, to the 404 every other unknown
    // path already gets below.
    if (clientRoute) {
      const targetsForLang = loadTargets(rootAbs)
      const lang = (targetsForLang && targetsForLang.lang) || 'en'
      const readWalkOrEmpty = () => { try { return walkLib.readWalk(rootAbs) } catch { return { journeys: {} } } }
      const readLedgerRowsOrEmpty = () => {
        try { return parseLedger(fs.readFileSync(path.join(rootAbs, 'design/mocks/ledger.md'), 'utf8')).assumptions } catch { return [] }
      }

      if ((reqPath === '/index.html' || reqPath === '/') && req.method === 'GET') {
        let notes = []
        try { notes = notesLib.readNotes(rootAbs) } catch { notes = [] }
        const html = walkPageLib.buildClientIndex({
          seed: seedForReview(rootAbs), notes, ledger: readLedgerRowsOrEmpty(), walk: readWalkOrEmpty(), prefix, lang,
        })
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
        res.end(html)
        return
      }

      const walkPageMatch = /^\/walk\/([^/]+)\.html$/.exec(reqPath)
      if (walkPageMatch && req.method === 'GET') {
        let notes = []
        try { notes = notesLib.readNotes(rootAbs) } catch { notes = [] }
        serveBuiltHtml(res, () => walkPageLib.buildWalkPage({
          seed: seedForReview(rootAbs), journey: walkPageMatch[1], notes, ledger: readLedgerRowsOrEmpty(),
          walk: readWalkOrEmpty(), prefix, lang,
        }))
        return
      }

      if (reqPath === '/__walk/state' && req.method === 'GET') {
        const journey = urlObj.searchParams.get('journey')
        const rec = (readWalkOrEmpty().journeys || {})[journey] ||
          { reached: [], misses: [], confirmedAt: null, sentence: null, waived: null }
        jsonRes(res, 200, { reached: rec.reached, misses: rec.misses, confirmedAt: rec.confirmedAt, sentence: rec.sentence, waived: rec.waived })
        return
      }

      if (reqPath === '/__walk/event' && req.method === 'POST') {
        readJsonBody(req).then((body) => {
          const journey = body && body.journey
          const kind = body && body.walk
          const declared = parseSeedJourneys(rootAbs)
          if (!journey || !declared.has(journey) || (kind !== 'to' && kind !== 'miss')) {
            jsonRes(res, 400, { error: 'event needs {journey, walk:"to"|"miss", from, to|target} naming a declared journey' })
            return
          }
          if (kind === 'to' && (!body.from || !body.to ||
              !declared.get(journey).labels.includes(body.from) || !declared.get(journey).labels.includes(body.to))) {
            jsonRes(res, 400, { error: 'a "to" event needs {from, to} naming labels declared on journey "' + journey + '"' })
            return
          }
          if (kind === 'miss' && (!body.from || !body.target || !declared.get(journey).labels.includes(body.from))) {
            jsonRes(res, 400, { error: 'a "miss" event needs {from, target} naming a label declared on journey "' + journey + '"' })
            return
          }
          const next = walkLib.recordEvent(readWalkOrEmpty(), {
            journey, walk: kind, from: body.from, to: body.to, target: body.target, at: new Date().toISOString(),
          })
          walkLib.writeWalk(rootAbs, next)
          jsonRes(res, 200, next.journeys[journey])
        }).catch((e) => jsonRes(res, 400, { error: 'malformed request body: ' + e.message }))
        return
      }

      if (reqPath === '/__walk/confirm' && req.method === 'POST') {
        readJsonBody(req).then((body) => {
          const journey = body && body.journey
          const declared = parseSeedJourneys(rootAbs)
          if (!journey || !declared.has(journey)) {
            jsonRes(res, 400, { error: 'confirm needs {journey, sentence} naming a declared journey' })
            return
          }
          let next
          try {
            next = walkLib.confirmJourney(readWalkOrEmpty(), { journey, sentence: body && body.sentence, at: new Date().toISOString() })
          } catch (e) {
            jsonRes(res, /already confirmed/.test(e.message) ? 409 : 400, { error: e.message })
            return
          }
          walkLib.writeWalk(rootAbs, next)
          jsonRes(res, 200, next.journeys[journey])
        }).catch((e) => jsonRes(res, 400, { error: 'malformed request body: ' + e.message }))
        return
      }
    }
    // D4: every other `/client/…` path 404s until specs/20260907/11-client-view.md serves it —
    // the client mount answers only its own `/__notes/*` and `/__walk/*` verbs above, never the
    // atlas index or the static design/ tree the non-client route falls through to below.
    if (clientRoute) {
      res.writeHead(404, { 'cache-control': 'no-store' })
      res.end('not found')
      return
    }

    // ---- /__picks/* (specs/20260905/01 D1/D2) ----------------------------------------------
    if (reqPath === '/__picks/list' && req.method === 'GET') {
      let stops = []
      try { stops = picksLib.readPicks(rootAbs) } catch { stops = [] }
      const { open, decided } = picksLib.pending(stops)
      jsonRes(res, 200, open.concat(decided))
      return
    }
    if (reqPath === '/__picks/decide' && req.method === 'POST') {
      readJsonBody(req).then((body) => {
        let stops = []
        try { stops = picksLib.readPicks(rootAbs) } catch { stops = [] }
        let result
        try {
          result = picksLib.decideStop(stops, body && body.id, body || {})
        } catch (e) {
          // mocks-picks.js's decideStop tags its refusals with a code (consumed|superseded|
          // bad-request); findStop's not-found throw carries none, which is exactly the 404 case.
          if (!e.code) { jsonRes(res, 404, { error: e.message }); return }
          if (e.code === 'consumed' || e.code === 'superseded') {
            jsonRes(res, 409, { error: e.message, stop: stops.find((s) => s.id === (body && body.id)) })
            return
          }
          jsonRes(res, 400, { error: e.message })
          return
        }
        picksLib.writePicks(rootAbs, result.stops)
        jsonRes(res, 200, result.stop)
      }).catch((e) => jsonRes(res, 400, { error: 'malformed request body: ' + e.message }))
      return
    }
    if (reqPath.startsWith('/__picks/')) {
      res.writeHead(404, { 'cache-control': 'no-store' })
      res.end('not found')
      return
    }

    // ---- /review/<journey>.html and /__review/review.js (specs/20260906/04-journey-review-page.md
    // D1) ------------------------------------------------------------------------------------
    if (reqPath === '/__walk/walk.js' && req.method === 'GET') {
      fs.readFile(walkBrowserPath, (err, data) => {
        if (err) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
        res.end(data)
      })
      return
    }
    // specs/20260910/03-client-journey-player.md D5: the player itself, loaded by every page
    // lib/walk-page.js builds — served byte-verbatim, never mounted under `/client` (the player
    // is what talks to the client mount, not part of it).
    if (reqPath === '/__walk/player.js' && req.method === 'GET') {
      fs.readFile(walkPlayerPath, (err, data) => {
        if (err) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
        res.end(data)
      })
      return
    }
    if (reqPath === '/__review/review.js' && req.method === 'GET') {
      fs.readFile(reviewBrowserPath, (err, data) => {
        if (err) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
        res.end(data)
      })
      return
    }
    const reviewMatch = /^\/review\/([^/]+)\.html$/.exec(reqPath)
    if (reviewMatch && req.method === 'GET') {
      // review fix round F7: reqPath is already decoded once (the try/catch above) — a second
      // decodeURIComponent here throws URIError uncaught on a malformed escape (e.g. /review/%25.html),
      // which would exit the whole serve process and drop every open look for the host.
      const journey = reviewMatch[1]
      let notes = []
      try { notes = notesLib.readNotes(rootAbs) } catch { notes = [] }
      let ledgerRows = []
      try { ledgerRows = parseLedger(fs.readFileSync(path.join(rootAbs, 'design/mocks/ledger.md'), 'utf8')).assumptions } catch { ledgerRows = [] }
      let stops = []
      try { stops = picksLib.readPicks(rootAbs) } catch { stops = [] }
      serveBuiltHtml(res, () => reviewPageLib.buildReviewPage({
        root: rootAbs, journey, prefix, seed: seedForReview(rootAbs), notes, ledger: ledgerRows, stops,
        clean: urlObj.searchParams.has('clean'),
      }))
      return
    }

    // ---- the atlas index is derived on every request (never a stale/missing file) -------------
    if (req.method === 'GET' && ATLAS_INDEX_PATHS.has(reqPath)) {
      let built
      try { built = buildAtlas(rootAbs, path.join(rootAbs, 'design/atlas/index.html')) } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end('atlas build failed under ' + rootAbs + ': ' + (e && e.message || e) + '\n')
        return
      }
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
      res.end(urlObj.searchParams.has('clean')
        ? stripCleanArtifacts(built.html)
        : injectNotesScript(built.html, 'project', prefix))
      return
    }

    // ---- static <root>/design/ (D12, spec 07) ----------------------------------------------
    const resolved = path.normalize(path.join(designRoot, reqPath))
    if (resolved !== designRoot.slice(0, -1) && !resolved.startsWith(designRoot)) {
      res.writeHead(404, { 'cache-control': 'no-store' })
      res.end('not found')
      return
    }
    fs.readFile(resolved, (err, data) => {
      if (err) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
      const ext = path.extname(resolved)
      const contentType = MIME[ext] || 'application/octet-stream'
      if (ext === '.html') {
        const state = validState(urlObj.searchParams.get('state'))
        let body = data.toString('utf8')
        if (state) body = insertBeforeBodyEnd(body, stateClickScript(state))
        if (urlObj.searchParams.has('walk')) body = insertBeforeBodyEnd(body, walkScriptTag(prefix))
        if (!urlObj.searchParams.has('clean')) body = injectNotesScript(body, 'mock', prefix)
        res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
        res.end(body)
        return
      }
      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
      res.end(data)
    })
  }
}

function cmdServe(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const root = path.resolve(arg('--root', '.'))
  const port = parseInt(arg('--port', '4173'), 10)
  const http = require('node:http')
  // The client capture builds a URL back to this same server, so the handler needs the port that
  // was actually bound — which `--port 0` only settles at listen time. handler reads opts.port per
  // request, so the listen callback fills it in and both the banner and the capture see one truth.
  const serveOpts = { prefix: '', port }
  const server = http.createServer(createRequestHandler(root, serveOpts))
  const banner = (verb, p) => verb + ' http://localhost:' + p + '/atlas/index.html — remote: ssh -L ' + p + ':localhost:' + p + ' <host>\n'
  // A busy port is the common case, not an error: the previous session left its server up. Probe
  // it for the notes layer (the one route only this server answers); an atlas answers → print the
  // same URL line with "already serving" and exit 0, so a caller reading the first line still
  // gets the URL. Anything else on the port is a real conflict and dies with the port named.
  server.on('error', (err) => {
    if (!err || err.code !== 'EADDRINUSE') die('serve: ' + (err && err.message || err))
    const probe = http.get({ host: '127.0.0.1', port, path: '/__notes/notes.js', timeout: 1500 }, (r) => {
      r.resume()
      if (r.statusCode === 200) { process.stdout.write(banner('already serving', port)); process.exit(0) }
      die('serve: port ' + port + ' is taken by something that is not a design atlas — pass --port <n>')
    })
    probe.on('timeout', () => probe.destroy(new Error('timeout')))
    probe.on('error', () => die('serve: port ' + port + ' is taken by something that is not a design atlas — pass --port <n>'))
  })
  server.listen(port, '127.0.0.1', () => {
    serveOpts.port = server.address().port
    process.stdout.write(banner('serving', serveOpts.port))
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// ---- stop open/decide/list (specs/20260905/04-per-project-look-server.md D2) ----------------------
// Moved here from the now-deleted per-machine hub script verbatim (its registry/ensure lines
// removed, D1): this script
// already serves the page a stop renders on and owns the /__picks/* routes, and — unlike
// mocks-driver.js's module-top loadStatus() — creates no status.json/ledger.md/seed.md on a cold
// root, which /spec:sketch's roadmap-first hosts must never grow.
// `[group/]label=path` per candidate, comma-separated. A pick stop requires a group on every
// candidate; an approve stop forbids one on any.
function parseCandidates(spec, kind) {
  const out = []
  for (const raw of spec.split(',')) {
    const eq = raw.indexOf('=')
    if (eq === -1) die('stop open: malformed --candidates entry "' + raw + '" — expected label=path or group/label=path')
    const left = raw.slice(0, eq)
    const p = raw.slice(eq + 1)
    if (!left || !p) die('stop open: malformed --candidates entry "' + raw + '" — expected label=path or group/label=path')
    const slash = left.indexOf('/')
    const group = slash === -1 ? null : left.slice(0, slash)
    const label = slash === -1 ? left : left.slice(slash + 1)
    out.push({ group, label, path: p })
  }
  if (kind === 'pick') {
    const missing = out.filter((c) => c.group == null)
    if (missing.length) die('stop open: every candidate needs a group on a "pick" stop (missing on ' +
      missing.map((c) => '"' + c.label + '"').join(', ') + ') — pass group/label=path')
  } else {
    const withGroup = out.filter((c) => c.group != null)
    if (withGroup.length) die('stop open: an "approve" stop\'s candidates must carry no group (found on ' +
      withGroup.map((c) => '"' + c.label + '"').join(', ') + ')')
  }
  return out
}

// One-shot GET, resolved (never rejected) — timeout/error both come back as {ok:false} so the
// probe below reads as a plain failed-probe branch, not a caught exception.
function getUrl(url, timeoutMs = 1500) {
  const http = require('node:http')
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ ok: true, status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }) })
    req.on('error', () => resolve({ ok: false }))
  })
}

async function cmdStopOpen(args) {
  const rootArg = flagArg(args, '--root')
  const kind = flagArg(args, '--kind')
  const key = flagArg(args, '--key')
  const title = flagArg(args, '--title')
  const candidatesArg = flagArg(args, '--candidates')
  const port = flagArg(args, '--port') || '4173'
  // specs/20260906/04-journey-review-page.md D6: mocks-driver.js's own `stop open journey:<j>`
  // is the caller that stamps the review-page url — this CLI defaults to the atlas index for
  // every other caller (AC-20260905-04-2/-3's own --key literals keep passing unmodified) and
  // only ever renders a caller-supplied page path verbatim.
  const urlPath = flagArg(args, '--page') || '/atlas/index.html'
  if (!rootArg) die('stop open: --root <r> is required')
  if (!kind || !['pick', 'approve'].includes(kind)) die('stop open: --kind must be "pick" or "approve"')
  if (!key) die('stop open: --key <k> is required')
  if (!title) die('stop open: --title <t> is required')
  if (!candidatesArg) die('stop open: --candidates <[group/]label=path>[,…] is required')
  const candidates = parseCandidates(candidatesArg, kind)

  if (!fs.existsSync(rootArg)) die('stop open: --root ' + rootArg + ' does not exist')
  const realRoot = fs.realpathSync(rootArg)

  let stops
  try { stops = picksLib.readPicks(realRoot) } catch (e) { die('stop open: cannot read design/mocks/picks.json under ' + realRoot + ': ' + e.message) }
  let opened
  try {
    // D8 (specs/20260906/01-ac-drift-doctor-check.md): --question is deleted from the CLI —
    // lib/mocks-picks.js's openStop() keeps accepting an optional question so picks.json's shape
    // and its existing pins are untouched; the field is simply always null from this command.
    opened = picksLib.openStop(stops, { kind, key, title, question: null, candidates, url: null })
  } catch (e) { die('stop open: ' + e.message) }

  // D2: the stop is written before it is probed — a failed probe (the common first-look case)
  // still leaves the stop on disk; the remedy's re-run supersedes it with a fresh id.
  const url = 'http://localhost:' + port + urlPath + '#stop-' + opened.stop.id
  const finalStops = opened.stops.map((s) => (s.id === opened.stop.id ? Object.assign({}, s, { url }) : s))
  picksLib.writePicks(realRoot, finalStops)

  const probeUrl = 'http://127.0.0.1:' + port + urlPath
  const probe = await getUrl(probeUrl)
  if (!probe.ok || probe.status !== 200 || !probe.body || !probe.body.includes('id="stop-' + opened.stop.id + '"')) {
    die('stop open: nothing answered ' + probeUrl + ' with stop ' + opened.stop.id + ' — start `node "$(spec-paths ' +
      'design-atlas)" serve --root ' + rootArg + ' [--port <n>]` as a tracked background task, then re-run stop ' +
      'open (the stop is already written; the re-run supersedes it and prints the fresh link)', 3)
  }
  process.stdout.write(url + '\n')
}

function cmdStopDecide(args) {
  const rootArg = flagArg(args, '--root')
  const id = flagArg(args, '--id')
  const verdict = flagArg(args, '--verdict')
  const pick = flagArg(args, '--pick')
  const note = flagArg(args, '--note')
  const by = flagArg(args, '--by')
  if (!rootArg) die('stop decide: --root <r> is required')
  if (!id) die('stop decide: --id <P…> is required')
  if (!verdict) die('stop decide: --verdict pick|approve|change is required')
  if (!by) die('stop decide: --by <who> is required')
  if (!fs.existsSync(rootArg)) die('stop decide: --root ' + rootArg + ' does not exist')
  const realRoot = fs.realpathSync(rootArg)
  let stops
  try { stops = picksLib.readPicks(realRoot) } catch (e) { die('stop decide: cannot read design/mocks/picks.json under ' + realRoot + ': ' + e.message) }
  let result
  try {
    result = picksLib.decideStop(stops, id, { verdict, pick, note, by })
  } catch (e) { die('stop decide: ' + e.message) }
  picksLib.writePicks(realRoot, result.stops)
  process.stdout.write('decided ' + id + ' ' + verdict + '\n')
}

function cmdStopList(args) {
  const rootArg = flagArg(args, '--root')
  if (!rootArg) die('stop list: --root <r> is required')
  if (!fs.existsSync(rootArg)) die('stop list: --root ' + rootArg + ' does not exist')
  const realRoot = fs.realpathSync(rootArg)
  let stops
  try { stops = picksLib.readPicks(realRoot) } catch (e) { die('stop list: cannot read design/mocks/picks.json under ' + realRoot + ': ' + e.message) }
  const lines = stops.filter((s) => s.status !== 'superseded')
    .map((s) => s.id + ' ' + s.status + ' ' + s.kind + ' ' + s.key + ' — ' + s.title)
  process.stdout.write(lines.length ? lines.join('\n') + '\n' : '')
}

// ---- main ----------------------------------------------------------------------------------------
// specs/20260905/01-picks-on-the-atlas-page.md D2: CLI dispatch runs only when this file is the
// process entry point — a plain module load of this file (this file's own tests) must expose its
// exports without also running a CLI command.
if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'check') cmdCheck(rest)
  else if (cmd === 'gallery') cmdGallery(rest)
  else if (cmd === 'build') cmdBuild(rest)
  else if (cmd === 'serve') cmdServe(rest)
  else if (cmd === 'shell' && rest[0] === 'sync') cmdShellSync(rest.slice(1))
  else if (cmd === 'shell' && rest[0] === 'adopt') cmdShellAdopt(rest.slice(1))
  else if (cmd === 'shell') die('usage: design-atlas.js shell <sync|adopt> …')
  else if (cmd === 'stop' && rest[0] === 'open') cmdStopOpen(rest.slice(1)).catch((e) => die('stop open: unexpected error: ' + (e && e.message || e)))
  else if (cmd === 'stop' && rest[0] === 'decide') cmdStopDecide(rest.slice(1))
  else if (cmd === 'stop' && rest[0] === 'list') cmdStopList(rest.slice(1))
  else if (cmd === 'stop') die('stop: unknown subcommand "' + rest[0] + '" — one of: open, decide, list')
  else die('usage: design-atlas.js <check|gallery|build|shell|serve|stop> …')
}

module.exports = { buildAtlas, page, frameTag, createRequestHandler }
