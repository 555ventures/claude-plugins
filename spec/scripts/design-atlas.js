#!/usr/bin/env node
// design-atlas: deterministic design-artifact tooling (no model, no deps) — shared § Design Atlas.
//
//   design-atlas.js check <file|dir> [...more] [--matrix]
//                                                  harness gate: labels, tokens link, no off-token
//                                                  colors; with design/targets.json: viewport meta
//                                                  + dark tokens block, enforced on approved mocks
//                                                  (drafts iterate one framing; --matrix forces)
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

// ---- targets -------------------------------------------------------------------------------------
// design/targets.json declares the theme × viewport matrix the product owes (archetype-derived;
// written by genesis-explore, or the /spec:design preamble on non-genesis repos). Found by walking
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
      // declared matrix (design/targets.json): mocks are RESPONSIVE SINGLE FILES — one file per
      // surface across every declared viewport; dark/light lives in tokens.css, never in per-theme
      // mock variants. Matrix-at-approval: drafts iterate on one framing, so these checks bind
      // only at data-status="approved" (or under --matrix, for post-approval expansion passes).
      // Absent targets = no matrix checks (legacy repos keep passing).
      const targets = loadTargets(f)
      if (targets && (forceMatrix || statusOf(html) === 'approved')) {
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
  if (!count) die('check: no .html files under ' + targets.join(', '))
  if (violations.length) {
    process.stdout.write('CHECK FAIL (' + violations.length + ' violation(s) across ' + count + ' file(s)):\n')
    for (const v of violations) process.stdout.write('  - ' + v + '\n')
    process.exit(1)
  }
  process.stdout.write('CHECK PASS (' + count + ' file(s))\n')
}

// ---- shared page chrome ----------------------------------------------------------------------------
function page(title, bodyHtml, extraHead = '') {
  return '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<style>\n' +
    'body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:1.5rem;background:#111;color:#ddd}\n' +
    'h1,h2{font-weight:600} a{color:#8fa8ff}\n' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}\n' +
    '.card{border:1px solid #333;border-radius:8px;padding:.75rem;background:#181818}\n' +
    '.card h3{margin:.1rem 0 .4rem;font-size:14px}\n' +
    '.badge{display:inline-block;border:1px solid #444;border-radius:99px;padding:0 .5em;font-size:11px;' +
    'margin-right:.3em;text-transform:uppercase;letter-spacing:.04em}\n' +
    '.badge.gap{border-color:#a55;color:#e99}.badge.sketch{border-color:#996;color:#dc6}\n' +
    '.badge.approved{border-color:#595;color:#8d8}.badge.bound{border-color:#568;color:#9bd}\n' +
    '.badge.built{border-color:#66a;color:#aae}.badge.orphan{border-color:#a5a;color:#d9d}\n' +
    '.frame{width:100%;aspect-ratio:390/700;border:0;border-radius:4px;background:#fff}\n' +
    '.gapcard{border-style:dashed;color:#999;display:flex;align-items:center;justify-content:center;' +
    'aspect-ratio:390/700;border:1px dashed #555;border-radius:4px}\n' +
    '.meta{color:#888;font-size:12px;margin-top:.35rem}\n' +
    '.matrix{margin:0 0 1rem}.matrix button{background:#222;color:#ccc;border:1px solid #444;' +
    'border-radius:6px;padding:.2em .7em;margin-right:.35em;cursor:pointer;font:inherit;font-size:12px}\n' +
    '.matrix button.on{border-color:#8fa8ff;color:#cfd9ff}\n' +
    '#journey{height:420px;border:1px solid #333;border-radius:8px;margin-bottom:1.5rem}\n' +
    '</style>' + extraHead + '</head><body>\n' + bodyHtml + '\n</body></html>\n'
}

// Viewport/theme toolbar from targets.json: viewport buttons reshape every iframe to the device's
// aspect; theme buttons stamp data-theme on each iframe's root (same-origin only — serve the page,
// don't file:// it; failures are swallowed so the toolbar degrades to viewport-only).
function matrixBar(targets) {
  if (!targets) return ''
  const vps = (targets.viewports || []).map(v =>
    '<button data-vp onclick="__vp(' + (v.width | 0) + ',' + (v.height | 0) + ',this)">' +
    esc(v.name) + ' ' + (v.width | 0) + '</button>').join('')
  const themes = (targets.themes || []).map(t =>
    '<button data-th onclick="__theme(\'' + esc(t) + '\',this)">' + esc(t) + '</button>').join('')
  if (!vps && !themes) return ''
  return '<div class="matrix">' + vps + themes + '</div>\n<script>\n' +
    'function __sel(btn,attr){document.querySelectorAll("button["+attr+"]").forEach(function(b){b.classList.toggle("on",b===btn)})}\n' +
    'function __vp(w,h,btn){__sel(btn,"data-vp");document.querySelectorAll("iframe.frame").forEach(function(f){f.style.aspectRatio=w+"/"+h;f.style.maxWidth=w+"px"})}\n' +
    'function __theme(t,btn){__sel(btn,"data-th");document.querySelectorAll("iframe.frame").forEach(function(f){try{f.contentDocument.documentElement.setAttribute("data-theme",t)}catch(e){}})}\n' +
    '</script>'
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
  const cards = candidates.map(c => {
    const files = htmlFilesUnder(path.join(dir, c))
    const frames = files.map(f => {
      const rel = path.relative(outDir, path.resolve(f))
      return '<h3>' + esc(labelOf(fs.readFileSync(f, 'utf8')) || path.basename(f, '.html')) + '</h3>\n' +
        '<iframe class="frame" loading="lazy" src="' + esc(rel) + '"></iframe>'
    }).join('\n')
    return '<div class="card"><h2>' + esc(c) + '</h2>\n' + frames + '</div>'
  }).join('\n')
  const html = page('Design candidates — ' + path.basename(dir),
    '<h1>Candidates (' + candidates.length + ')</h1>\n' + matrixBar(loadTargets(dir)) +
    '<div class="grid">\n' + cards + '\n</div>')
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

  // mocks: label -> {file, status}
  const mocks = new Map()
  if (fs.existsSync(mocksDir)) {
    for (const f of htmlFilesUnder(mocksDir)) {
      const html = fs.readFileSync(f, 'utf8')
      mocks.set(labelOf(html) || path.basename(f, '.html'), { file: f, status: statusOf(html) })
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
  let routes = {}
  try {
    routes = JSON.parse(fs.readFileSync(path.join(root, '.claude/spec.config.json'), 'utf8')).design.atlasRoutes || {}
  } catch {}

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
    const badgeHtml = badges.map(b => '<span class="badge ' + b + '">' + b + '</span>').join('')
    const body = mock
      ? '<iframe class="frame" loading="lazy" src="' + esc(path.relative(outDir, mock.file)) + '"></iframe>'
      : '<div class="gapcard">declared, no mock yet</div>'
    const builtFrame = routes[label]
      ? '\n<h3>built</h3><iframe class="frame" loading="lazy" src="' + esc(routes[label]) + '"></iframe>'
      : ''
    const meta = [
      declared ? 'brief: ' + esc(path.basename(nodes.get(label).brief)) : 'no declaring brief',
      claim ? 'spec: ' + esc(claim.spec) : null,
    ].filter(Boolean).join(' · ')
    return { label, primary, html: '<div class="card" id="s-' + esc(label) + '"><h3>' + esc(label) + '</h3>' + badgeHtml + body + builtFrame + '<div class="meta">' + meta + '</div></div>' }
  })

  const counts = {}
  for (const r of rows) counts[r.primary] = (counts[r.primary] || 0) + 1
  const summary = Object.keys(counts).sort().map(k => counts[k] + ' ' + k).join(' · ') || 'no surfaces'

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
    '  var colors={gap:"#a55",sketch:"#996",approved:"#595",bound:"#568",built:"#66a"};\n' +
    '  var cy=cytoscape({container:document.getElementById("journey"),elements:__atlas,\n' +
    '    layout:{name:window.cytoscapeDagre?"dagre":"breadthfirst",rankDir:"LR"},\n' +
    '    style:[{selector:"node",style:{label:"data(id)",color:"#ddd","font-size":"11px",\n' +
    '      "background-color":function(e){return colors[e.data("status")]||"#555"}}},\n' +
    '      {selector:"edge",style:{"curve-style":"bezier","target-arrow-shape":"triangle",\n' +
    '      width:1.5,"line-color":"#555","target-arrow-color":"#555"}}]});\n' +
    '  cy.on("tap","node",function(e){var el=document.getElementById("s-"+e.target.id());if(el)el.scrollIntoView({behavior:"smooth"})});\n' +
    '}\n</script>'

  const html = page('Design atlas',
    '<h1>Design atlas</h1><p class="meta">' + esc(summary) + '</p>\n' + graph +
    '\n' + matrixBar(loadTargets(root)) +
    '\n<div class="grid">\n' + rows.map(r => r.html).join('\n') + '\n</div>')
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
