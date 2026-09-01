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
//                                                  coverage ledger × spec stamps → one browsable page
//
// Everything here is a file walk + string emit: zero tokens, reproducible output (no timestamps),
// never edits its inputs. Exit 0 = pass/written, 1 = check violations, 2 = usage/IO error.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { readConfig } = require('./lib/host-config')

const die = (msg) => { process.stderr.write('[design-atlas] ' + msg + '\n'); process.exit(2) }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function htmlFilesUnder(p, out = []) {
  const st = fs.statSync(p)
  if (st.isFile()) { if (p.endsWith('.html')) out.push(p); return out }
  for (const e of fs.readdirSync(p).sort()) {
    if (e === 'atlas' || e === 'gallery.html' || e.startsWith('.')) continue
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
  const darkChecked = new Set()
  let count = 0
  for (const t of paths) {
    if (!fs.existsSync(t)) die('check: no such path: ' + t)
    for (const f of htmlFilesUnder(t)) {
      count++
      const html = fs.readFileSync(f, 'utf8')
      if (!labelOf(html)) violations.push(f + ': no data-screen-label on any element')
      if (!/<link[^>]+tokens\.css/.test(html)) violations.push(f + ': does not link a tokens.css')
      // strip the tokens link line itself, then flag color literals anywhere in markup/styles
      const body = html.replace(/<link[^>]*>/g, '')
      for (const re of [/#[0-9a-fA-F]{3,8}\b/g, /\brgba?\(/g, /\bhsla?\(/g, /\boklch\(/g]) {
        const m = body.match(re)
        if (m) violations.push(f + ': ' + m.length + ' off-token color literal(s) (' + m[0] + '…) — consume var(--role) from tokens.css')
      }
      // Hygiene (a)-(d) and the matrix checks below bind at the same stamp: ratified or approved
      // (equivalent, D2), or under --matrix (forces both onto drafts, e.g. a post-ratify expansion
      // pass). sketch mocks iterate on one framing and skip both families for free.
      const status = statusOf(html)
      const boundNow = forceMatrix || status === 'ratified' || status === 'approved'
      if (boundNow) violations.push(...hygieneViolations(f, html))

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
  if (violations.length) {
    process.stdout.write('CHECK FAIL (' + violations.length + ' violation(s) across ' + count + ' file(s)):\n')
    for (const v of violations) process.stdout.write('  - ' + v + '\n')
    process.exit(1)
  }
  process.stdout.write('CHECK PASS (' + count + ' file(s))\n')
}

// ---- shared page chrome ----------------------------------------------------------------------------
// Review posture: every mock is shown WHOLE — full content height, scaled to the card width — so
// the reviewer never pans inside a card (card iframes are pointer-inert; clicking opens the
// lightbox at natural size). The page itself scrolls vertically only, at every width.
function page(title, bodyHtml, extraHead = '') {
  return '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<style>\n' +
    'body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:1.25rem;background:#111;color:#ddd;overflow-x:hidden}\n' +
    'h1,h2{font-weight:600} a{color:#8fa8ff}\n' +
    'h1{margin:.2rem 0 .1rem}\n' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;align-items:start}\n' +
    '.card{border:1px solid #333;border-radius:8px;padding:.75rem;background:#181818;min-width:0}\n' +
    '.card.wide{grid-column:1/-1}\n' +
    '.card h3{margin:.1rem 0 .4rem;font-size:14px}\n' +
    '.vp{color:#777;font-size:11px;font-weight:400;margin-left:.4em}\n' +
    '.open{float:right;font-size:12px;font-weight:400}\n' +
    '.badge{display:inline-block;border:1px solid #444;border-radius:99px;padding:0 .5em;font-size:11px;' +
    'margin-right:.3em;text-transform:uppercase;letter-spacing:.04em}\n' +
    '.badge.gap{border-color:#a55;color:#e99}.badge.sketch{border-color:#996;color:#dc6}\n' +
    '.badge.ratified{border-color:#7a5;color:#bd8}\n' +
    '.badge.approved{border-color:#595;color:#8d8}.badge.bound{border-color:#568;color:#9bd}\n' +
    '.badge.built{border-color:#66a;color:#aae}.badge.orphan{border-color:#a5a;color:#d9d}\n' +
    '.shot{overflow:hidden;border-radius:4px;background:#0d0d0d;cursor:zoom-in;margin-top:.35rem}\n' +
    '.frame{border:0;display:block;transform-origin:0 0;pointer-events:none;background:#0d0d0d;width:100%}\n' +
    '.sect{margin:1.75rem 0 0}\n' +
    '.sect>h2{font-size:15px;margin:0 0 .75rem;padding-bottom:.35rem;border-bottom:1px solid #2a2a2a}\n' +
    '.sect>h2 .count{color:#777;font-size:12px;font-weight:400;margin-left:.5em}\n' +
    '.gaps{display:flex;flex-wrap:wrap;gap:.4rem;margin:.75rem 0 0}\n' +
    '.gapchip{border:1px dashed #544;color:#c99;border-radius:99px;padding:.05rem .65rem;font-size:12px}\n' +
    '.gapcard{border:1px dashed #555;border-radius:4px;color:#999;display:flex;align-items:center;' +
    'justify-content:center;min-height:6rem;margin-top:.35rem}\n' +
    '.meta{color:#888;font-size:12px;margin-top:.35rem}\n' +
    '.bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;' +
    'background:rgba(17,17,17,.94);backdrop-filter:blur(4px);padding:.5rem 0;margin:0 0 .5rem}\n' +
    '.bar button{background:#222;color:#ccc;border:1px solid #444;border-radius:6px;padding:.2em .7em;' +
    'cursor:pointer;font:inherit;font-size:12px}\n' +
    '.bar button.on{border-color:#8fa8ff;color:#cfd9ff}\n' +
    '.bar .sep{width:1px;height:1.2em;background:#333;margin:0 .35em}\n' +
    '#journey{height:420px;border:1px solid #333;border-radius:8px;margin-bottom:1rem}\n' +
    '#lb{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.85);display:none;overflow:auto;padding:3.2rem 1rem 1rem}\n' +
    '#lb.on{display:block}\n' +
    '#lb iframe{border:0;display:block;margin:0 auto;background:#111;box-shadow:0 8px 40px rgba(0,0,0,.8)}\n' +
    '#lbbar{position:fixed;top:.6rem;right:1rem;z-index:11;display:flex;gap:.4rem;align-items:center}\n' +
    '#lbbar span{color:#ccc;font-size:13px;margin-right:.4em}\n' +
    '#lbbar button,#lbbar a{background:#222;color:#ccc;border:1px solid #444;border-radius:6px;' +
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

// ---- build ---------------------------------------------------------------------------------------
function cmdBuild(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const root = path.resolve(arg('--root', '.'))
  const out = path.resolve(root, arg('--out', 'design/atlas/index.html'))
  const mocksDir = path.join(root, 'design/mocks')
  const { nodes, edges } = parseSurfaces(path.join(root, 'docs/roadmap'))

  const targets = loadTargets(root)
  const vp0 = (targets && (targets.viewports || [])[0]) || { width: 390, height: 844 }

  // mocks: label -> {file, status, vp}
  const mocks = new Map()
  if (fs.existsSync(mocksDir)) {
    for (const f of htmlFilesUnder(mocksDir)) {
      const html = fs.readFileSync(f, 'utf8')
      mocks.set(labelOf(html) || path.basename(f, '.html'),
        { file: f, status: statusOf(html), vp: viewportOf(html) || vp0 })
    }
  }

  // coverage ledger: label -> {spec, built}
  const claims = new Map()
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(root, '.claude/design-coverage.json'), 'utf8'))
    for (const src of Object.values(ledger.sources || {})) {
      for (const [ref, v] of Object.entries(src.regions || {})) {
        const label = ref.split('#')[0]
        const spec = v && v.spec
        let built = false
        if (spec) {
          try { built = /^status:\s*done\b/m.test(fs.readFileSync(path.join(root, spec), 'utf8')) } catch {}
        }
        const prev = claims.get(label)
        claims.set(label, { spec, built: built || (prev && prev.built) || false })
      }
    }
  } catch {}

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
    const brief = declared ? path.basename(nodes.get(label).brief) : null
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
    const body = frameTag(path.relative(outDir, mock.file), mock.vp.width, mock.vp.height)
    const builtFrame = routes[label]
      ? '\n<h3>built</h3>' + frameTag(routes[label], mock.vp.width, mock.vp.height)
      : ''
    const meta = [
      brief ? 'brief: ' + esc(brief) : 'no declaring brief',
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
    const title = key === '~no declaring brief' ? 'no declaring brief' : key.replace(/\.md$/, '')
    const count = [cards.length ? cards.length + ' mocked' : null, chips.length ? chips.length + ' gap' : null]
      .filter(Boolean).join(' · ')
    return '<section class="sect"><h2>' + esc(title) + '<span class="count">' + count + '</span></h2>\n' +
      (cards.length ? '<div class="grid">\n' + cards.map(r => r.html).join('\n') + '\n</div>' : '') +
      (chips.length ? '\n<div class="gaps">' + chips.map(r => r.html).join('') + '</div>' : '') +
      '</section>'
  }).join('\n')

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
    '  var colors={gap:"#a55",sketch:"#996",ratified:"#7a5",approved:"#595",bound:"#568",built:"#66a"};\n' +
    '  var cy=cytoscape({container:document.getElementById("journey"),elements:__atlas,\n' +
    '    minZoom:.15,maxZoom:3,wheelSensitivity:.2,\n' +
    '    layout:{name:window.cytoscapeDagre?"dagre":"breadthfirst",rankDir:"LR",padding:16},\n' +
    '    style:[{selector:"node",style:{label:"data(id)",color:"#ddd","font-size":"11px",\n' +
    '      "text-valign":"bottom","text-margin-y":4,\n' +
    '      "background-color":function(e){return colors[e.data("status")]||"#555"}}},\n' +
    '      {selector:"edge",style:{"curve-style":"bezier","target-arrow-shape":"triangle",\n' +
    '      width:1.5,"line-color":"#555","target-arrow-color":"#555"}}]});\n' +
    '  cy.on("tap","node",function(e){var el=document.getElementById("s-"+e.target.id());if(el)el.scrollIntoView({behavior:"smooth"})});\n' +
    '}\n</script>'

  const bar = matrixBar(targets)
  const html = page('Design atlas',
    '<h1>Design atlas</h1><p class="meta">' + esc(summary) + '</p>\n' + graph +
    '\n<div class="bar">' + filterBar + (bar.buttons ? '<span class="sep"></span>' + bar.buttons : '') + '</div>' +
    '\n' + sectionHtml + '\n' + LIGHTBOX + '\n' + UI_SCRIPT + bar.script + filterScript)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(out, html)
  process.stdout.write('atlas: ' + labels.length + ' surface(s) (' + summary + ') → ' + out + '\n')
}

// ---- main ----------------------------------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'check') cmdCheck(rest)
else if (cmd === 'gallery') cmdGallery(rest)
else if (cmd === 'build') cmdBuild(rest)
else die('usage: design-atlas.js <check|gallery|build> …')
