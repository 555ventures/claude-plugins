#!/usr/bin/env node
// design-atlas: deterministic design-artifact tooling (no model, no deps) — shared § Design Atlas.
//
//   design-atlas.js check <file|dir> [...more] [--matrix]
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
//                                                  instruction; exits on SIGINT/SIGTERM
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
// ambiguous `shell adopt --apply` with no --shell. `serve` runs until SIGINT/SIGTERM (exit 0).
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { readConfig } = require('./lib/host-config')
const shellLib = require('./lib/shell-region')

const die = (msg) => { process.stderr.write('[design-atlas] ' + msg + '\n'); process.exit(2) }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
  '" src="' + esc(src) + '"></iframe>'

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

// ---- check ---------------------------------------------------------------------------------------
// The deterministic half of the design harness: every mock/tile/prototype passes this before a
// human (or a critique round) sees it. Colors live in tokens.css and are consumed as var(--role);
// a color literal in markup is the drift this gate exists to catch. px is deliberately NOT flagged
// (layout in mocks legitimately uses px); color is the load-bearing token family.
function cmdCheck(argv) {
  const forceMatrix = argv.includes('--matrix')
  const paths = argv.filter(a => a !== '--matrix')
  if (!paths.length) die('check: need at least one file or directory')
  const violations = []
  const warnLines = []
  const darkChecked = new Set()
  let count = 0
  for (const t of paths) {
    if (!fs.existsSync(t)) die('check: no such path: ' + t)
    for (const f of htmlFilesUnder(t)) {
      count++
      const html = fs.readFileSync(f, 'utf8')
      // specs/20260901/04 D1: a shell canon file (first labeled root is data-shell-canon) is
      // never asked for a data-screen-label and is validated under its own rule set below,
      // instead of D4's mock shell family.
      const isCanon = shellLib.isCanonFile(html)
      if (!isCanon && !labelOf(html)) violations.push(f + ': no data-screen-label on any element')
      if (!/<link[^>]+tokens\.css/.test(html)) violations.push(f + ': does not link a tokens.css')
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
      } else {
        const shellDir = shellLib.resolveShellDir(f)
        if (shellDir) {
          const diag = shellLib.diagnoseMock(html, shellDir)
          for (const fnd of diag.findings) {
            if (boundApproved) violations.push(f + ': ' + fnd.text)
            else warnLines.push('  ⚠️ ' + f + ': ' + fnd.text)
          }
        }
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
  if (violations.length) {
    process.stdout.write('CHECK FAIL (' + violations.length + ' violation(s) across ' + count + ' file(s)):\n')
    for (const v of violations) process.stdout.write('  - ' + v + '\n')
    process.exit(1)
  }
  process.stdout.write('CHECK PASS (' + count + ' file(s))\n')
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
    'body{font:14px/1.5 var(--v-font);margin:0;padding:1.25rem;background:var(--v-bg);color:var(--v-fg);overflow-x:hidden}\n' +
    'h1,h2{font-weight:600} a{color:var(--v-primary)}\n' +
    'h1{margin:.2rem 0 .1rem}\n' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;align-items:start}\n' +
    '.card{border:1px solid var(--v-border);border-radius:var(--v-radius);padding:.75rem;background:var(--v-bg);box-shadow:var(--v-shadow);min-width:0}\n' +
    '.card.wide{grid-column:1/-1}\n' +
    '.card h3{margin:.1rem 0 .4rem;font-size:14px}\n' +
    '.vp{color:var(--v-muted);font-size:11px;font-weight:400;margin-left:.4em}\n' +
    '.open{float:right;font-size:12px;font-weight:400}\n' +
    '.badge{display:inline-block;border:1px solid var(--v-border);border-radius:99px;padding:0 .5em;font-size:11px;' +
    'margin-right:.3em;text-transform:uppercase;letter-spacing:.04em}\n' +
    '.badge.gap{border-color:var(--v-danger);color:var(--v-danger)}.badge.sketch{border-color:var(--v-warn);color:var(--v-warn)}\n' +
    '.badge.ratified{border-color:var(--v-ok);color:var(--v-ok)}\n' +
    '.badge.approved{border-color:var(--v-ok);color:var(--v-ok)}.badge.bound{border-color:var(--v-ring);color:var(--v-fg)}\n' +
    '.badge.built{border-color:var(--v-primary);color:var(--v-primary)}.badge.orphan{border-color:var(--v-danger);color:var(--v-danger)}\n' +
    '.shot{overflow:hidden;border-radius:var(--v-radius);background:var(--v-muted-bg);cursor:zoom-in;margin-top:.35rem}\n' +
    '.frame{border:0;display:block;transform-origin:0 0;pointer-events:none;background:var(--v-muted-bg);width:100%}\n' +
    '.sect{margin:1.75rem 0 0}\n' +
    '.sect>h2{font-size:15px;margin:0 0 .75rem;padding-bottom:.35rem;border-bottom:1px solid var(--v-border)}\n' +
    '.sect>h2 .count{color:var(--v-muted);font-size:12px;font-weight:400;margin-left:.5em}\n' +
    '.gaps{display:flex;flex-wrap:wrap;gap:.4rem;margin:.75rem 0 0}\n' +
    '.gapchip{border:1px dashed var(--v-danger);color:var(--v-danger);border-radius:99px;padding:.05rem .65rem;font-size:12px}\n' +
    '.gapcard{border:1px dashed var(--v-border);border-radius:var(--v-radius);color:var(--v-muted);display:flex;align-items:center;' +
    'justify-content:center;min-height:6rem;margin-top:.35rem}\n' +
    '.meta{color:var(--v-muted);font-size:12px;margin-top:.35rem}\n' +
    '.bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;' +
    'background:var(--v-bg);backdrop-filter:blur(4px);padding:.5rem 0;margin:0 0 .5rem;border-bottom:1px solid var(--v-border)}\n' +
    '.bar button{background:var(--v-muted-bg);color:var(--v-fg);border:1px solid var(--v-border);border-radius:var(--v-radius);padding:.2em .7em;' +
    'cursor:pointer;font:inherit;font-size:12px}\n' +
    '.bar button.on{border-color:var(--v-ring);color:var(--v-primary)}\n' +
    '.bar .sep{width:1px;height:1.2em;background:var(--v-border);margin:0 .35em}\n' +
    '#journey{height:420px;border:1px solid var(--v-border);border-radius:var(--v-radius);margin-bottom:1rem}\n' +
    '#lb{position:fixed;inset:0;z-index:10;background:color-mix(in srgb, var(--v-fg) 85%, transparent);display:none;overflow:auto;padding:3.2rem 1rem 1rem}\n' +
    '#lb.on{display:block}\n' +
    '#lb iframe{border:0;display:block;margin:0 auto;background:var(--v-bg);box-shadow:var(--v-shadow)}\n' +
    '#lbbar{position:fixed;top:.6rem;right:1rem;z-index:11;display:flex;gap:.4rem;align-items:center}\n' +
    '#lbbar span{color:var(--v-bg);font-size:13px;margin-right:.4em}\n' +
    '#lbbar button,#lbbar a{background:var(--v-muted-bg);color:var(--v-fg);border:1px solid var(--v-border);border-radius:var(--v-radius);' +
    'padding:.2em .7em;cursor:pointer;font:inherit;font-size:13px;text-decoration:none}\n' +
    '@media(max-width:640px){body{padding:.75rem}.grid{grid-template-columns:1fr}#journey{height:260px}}\n' +
    '</style>' + extraHead + '</head><body>\n' + bodyHtml + '\n</body></html>\n'
}

// Always-on page behavior: wrap each frame in a .shot, size it to the mock's FULL content height
// (same-origin measurement when served; falls back to the declared device height on file://),
// scale to the card width, and open the click-to-inspect lightbox. No scrollbars in cards, ever.
const UI_SCRIPT = '<script>\n' +
  'function __sel(btn,attr){document.querySelectorAll("button["+attr+"]").forEach(function(b){b.classList.toggle("on",b===btn)})}\n' +
  'function __measure(f){try{var d=f.contentDocument;if(!d||!d.documentElement)return 0;' +
  'var h=d.documentElement.scrollHeight||0;if(d.body&&d.body.scrollHeight>h)h=d.body.scrollHeight;return h}catch(e){return 0}}\n' +
  'function __fit(f){var s=f.parentNode;if(!s||!s.classList||!s.classList.contains("shot"))return;' +
  'var w=+f.dataset.w||390,cw=s.clientWidth||w;f.style.width=w+"px";' +
  'var h=__measure(f)||+f.dataset.h||844;f.style.height=h+"px";' +
  'var sc=Math.min(1,cw/w);f.style.transform="scale("+sc+")";f.style.margin=sc<1?"0":"0 auto";' +
  's.style.height=Math.round(h*sc)+"px"}\n' +
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
  'fr.style.height=(parseInt(f.style.height)||+f.dataset.h||844)+"px";fr.src=f.getAttribute("src");' +
  'var card=f.closest(".card"),h3=card&&card.querySelector("h3");' +
  'document.getElementById("lbtitle").textContent=h3?h3.childNodes[0].textContent:"";' +
  'document.getElementById("lbopen").href=f.getAttribute("src");' +
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
  '<a class=\\"open\\" href=\\""+f.getAttribute("src")+"\\" target=\\"_blank\\">open \\u2197</a>");\n' +
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
  if (!targets) return { buttons: '', script: '' }
  const vps = (targets.viewports || []).map(v =>
    '<button data-vp onclick="__vp(' + (v.width | 0) + ',' + (v.height | 0) + ',this)">' +
    esc(v.name) + ' ' + (v.width | 0) + '</button>').join('')
  const themes = (targets.themes || []).map(t =>
    '<button data-th onclick="__theme(\'' + esc(t) + '\',this)">' + esc(t) + '</button>').join('')
  if (!vps && !themes) return { buttons: '', script: '' }
  const script = '<script>\n' +
    'function __vp(w,h,btn){__sel(btn,"data-vp");document.querySelectorAll("iframe.frame").forEach(function(f){' +
    'f.dataset.w=w;f.dataset.h=h});__fitAll();setTimeout(__fitAll,200)}\n' +
    'function __theme(t,btn){__sel(btn,"data-th");document.querySelectorAll("iframe.frame").forEach(function(f){' +
    'try{f.contentDocument.documentElement.setAttribute("data-theme",t)}catch(e){}})}\n' +
    '</script>'
  return { buttons: vps + (vps && themes ? '<span class="sep"></span>' : '') + themes, script }
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
// Fenced ```surfaces blocks in docs/roadmap/**.md. Line grammar (deliberately tiny):
//   label            declare a surface
//   a -> b           journey edge (declares both ends)
//   # comment        ignored
function parseSurfaces(roadmapDir) {
  const nodes = new Map()   // label -> {brief}
  const edges = []          // [from, to]
  if (!fs.existsSync(roadmapDir)) return { nodes, edges }
  const mds = fs.readdirSync(roadmapDir).sort().filter(f => f.endsWith('.md')).map(f => path.join(roadmapDir, f))
  for (const md of mds) {
    const text = fs.readFileSync(md, 'utf8')
    for (const m of text.matchAll(/```surfaces\n([\s\S]*?)```/g)) {
      for (const raw of m[1].split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const edge = line.split('->').map(s => s.trim())
        if (edge.length === 2 && edge[0] && edge[1]) {
          for (const l of edge) if (!nodes.has(l)) nodes.set(l, { brief: md })
          edges.push(edge)
        } else if (/^[\w][\w-]*$/.test(line)) {
          if (!nodes.has(line)) nodes.set(line, { brief: md })
        }
      }
    }
  }
  return { nodes, edges }
}

// specs/20260902/07-mocks-command-driver.md D15: design/mocks/seed.md's `### <journey-kebab>`
// blocks (D4's grammar) are a second surfaces source — journeys exist before any roadmap does.
// Owner = `seed:<journey>` (never a roadmap file path) so cmdBuild can section and title these
// labels by journey instead of by declaring brief; the persona line rides along for the section
// subtitle. Comments are stripped once so the template's own instructional `<!-- -->` blocks
// never get misread as journey content.
function parseSeedJourneys(root) {
  const journeys = new Map() // kebab -> {persona, labels, edges}
  let text
  try { text = fs.readFileSync(path.join(root, 'design/mocks/seed.md'), 'utf8') } catch { return journeys }
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  const starts = []
  const re = /^### ([a-z0-9-]+)\s*$/gm
  let m
  while ((m = re.exec(text))) starts.push({ name: m[1], index: m.index, headerEnd: m.index + m[0].length })
  for (let i = 0; i < starts.length; i++) {
    const body = text.slice(starts[i].headerEnd, i + 1 < starts.length ? starts[i + 1].index : text.length)
    let persona = ''
    for (const l of body.split('\n')) { if (l.trim()) { persona = l.trim(); break } }
    const surf = body.match(/```surfaces\n([\s\S]*?)```/)
    const labels = []
    const edges = []
    if (surf) {
      for (const raw of surf[1].split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const edge = line.split('->').map(s => s.trim())
        if (edge.length === 2 && edge[0] && edge[1]) {
          for (const l of edge) if (!labels.includes(l)) labels.push(l)
          edges.push(edge)
        } else if (/^[\w][\w-]*$/.test(line) && !labels.includes(line)) {
          labels.push(line)
        }
      }
    }
    journeys.set(starts[i].name, { persona, labels, edges })
  }
  return journeys
}

// ---- build ---------------------------------------------------------------------------------------
function cmdBuild(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const root = path.resolve(arg('--root', '.'))
  const out = path.resolve(root, arg('--out', 'design/atlas/index.html'))
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
    return '<section class="sect"><h2>' + esc(title) + '<span class="count">' + count + '</span></h2>\n' +
      (subtitle ? '<p class="meta">' + esc(subtitle) + '</p>\n' : '') +
      (cards.length ? '<div class="grid">\n' + cards.map(r => r.html).join('\n') + '\n</div>' : '') +
      (chips.length ? '\n<div class="gaps">' + chips.map(r => r.html).join('') + '</div>' : '') +
      '</section>'
  }).join('\n')

  // D15: design/shapes/*.html render under their own "shapes" section keyed by shape file (a
  // candidate register, not a screen — never merged into the labels/journeys sections above).
  const shapesDir = path.join(root, 'design/shapes')
  let shapesSectionHtml = ''
  if (fs.existsSync(shapesDir)) {
    const shapeFiles = fs.readdirSync(shapesDir).filter(f => f.endsWith('.html')).sort()
    if (shapeFiles.length) {
      const shapeCards = shapeFiles.map(f => {
        const kebab = path.basename(f, '.html')
        const filePath = path.join(shapesDir, f)
        const vp = viewportOf(fs.readFileSync(filePath, 'utf8')) || vp0
        return '<div class="card"><h3>' + esc(kebab) + '</h3>' +
          frameTag(path.relative(outDir, filePath), vp.width, vp.height) + '</div>'
      }).join('\n')
      shapesSectionHtml = '<section class="sect"><h2>shapes<span class="count">' + shapeFiles.length +
        '</span></h2>\n<div class="grid">\n' + shapeCards + '\n</div></section>'
    }
  }

  // status filter chips: hide everything not matching, collapse sections that go empty
  const filterBar =
    '<button data-f class="on" onclick="__filter(\'all\',this)">all ' + rows.length + '</button>' +
    Object.keys(counts).sort().map(k =>
      '<button data-f onclick="__filter(\'' + k + '\',this)">' + k + ' ' + counts[k] + '</button>').join('')
  const filterScript = '<script>\n' +
    'function __filter(st,btn){__sel(btn,"data-f");' +
    'document.querySelectorAll("[data-st]").forEach(function(el){el.hidden=st!=="all"&&el.dataset.st!==st});' +
    'document.querySelectorAll(".sect").forEach(function(s){s.hidden=!s.querySelector("[data-st]:not([hidden])")});' +
    '__fitAll()}\n</script>'

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
  const html = page('Design atlas',
    '<h1>Design atlas</h1><p class="meta">' + esc(summary) + '</p>\n' + graph +
    '\n<div class="bar">' + filterBar + (bar.buttons ? '<span class="sep"></span>' + bar.buttons : '') + '</div>' +
    '\n' + sectionHtml + '\n' + shapesSectionHtml + '\n' + LIGHTBOX + '\n' + UI_SCRIPT + bar.script + filterScript)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(out, html)
  process.stdout.write('atlas: ' + labels.length + ' surface(s) (' + summary + ') → ' + out + '\n')
}

// ---- serve -----------------------------------------------------------------------------------------
// specs/20260902/07-mocks-command-driver.md D12: static, read-only, no-store server over
// `<root>/design/` — the SSH rule (client access is the forwarded port only, never an export or a
// hosted copy). The port-forward line is the very first stdout write, before anything else, so a
// caller reading stdout line-by-line never blocks waiting on a second line that never comes.
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2',
}
function cmdServe(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const root = path.resolve(arg('--root', '.'))
  const port = parseInt(arg('--port', '4173'), 10)
  const designRoot = path.join(root, 'design') + path.sep
  const http = require('node:http')
  const server = http.createServer((req, res) => {
    let reqPath
    try { reqPath = decodeURIComponent((req.url || '/').split('?')[0]) } catch { reqPath = '/' }
    const resolved = path.normalize(path.join(designRoot, reqPath))
    if (resolved !== designRoot.slice(0, -1) && !resolved.startsWith(designRoot)) {
      res.writeHead(404, { 'cache-control': 'no-store' })
      res.end('not found')
      return
    }
    fs.readFile(resolved, (err, data) => {
      if (err) { res.writeHead(404, { 'cache-control': 'no-store' }); res.end('not found'); return }
      res.writeHead(200, { 'content-type': MIME[path.extname(resolved)] || 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(data)
    })
  })
  server.listen(port, () => {
    process.stdout.write('serving http://localhost:' + port + '/atlas/index.html — remote: ssh -L ' + port + ':localhost:' + port + ' <host>\n')
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// ---- main ----------------------------------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'check') cmdCheck(rest)
else if (cmd === 'gallery') cmdGallery(rest)
else if (cmd === 'build') cmdBuild(rest)
else if (cmd === 'serve') cmdServe(rest)
else if (cmd === 'shell' && rest[0] === 'sync') cmdShellSync(rest.slice(1))
else if (cmd === 'shell' && rest[0] === 'adopt') cmdShellAdopt(rest.slice(1))
else if (cmd === 'shell') die('usage: design-atlas.js shell <sync|adopt> …')
else die('usage: design-atlas.js <check|gallery|build|shell|serve> …')
