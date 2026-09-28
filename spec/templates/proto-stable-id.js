// spec/templates/proto-stable-id.js
//
// Copied beside spec/templates/proto-overlay.js into the prototype worktree at `--mark opened`
// (never imported by the plugin itself) and, separately, injected standalone by spec 02's
// capture through `page.addScriptTag`. specs/20260928/01-the-prototype-command-and-the-pin-
// overlay.md D6, AC-20260928-01-9.
//
// Computes a stable id for a DOM element from React's dev-only fiber fields — the nearest named
// function-component owners (up to three, innermost first, keyed when the owner fiber carries a
// key), joined by `<`, plus a `#<ordinal>` among document elements sharing that same chain.
// Owners named `hookified`, `unboundStoryFn`, `ErrorBoundary`, and any name starting with
// `Storybook`, are skipped without counting toward the three-owner cap. `locFor` is a second,
// independent field — the first stack frame outside `node_modules`, `/@vite/`, `/@fs/`, `/@id/`
// and `sb-vite/deps` — carried on a pin as metadata only, never part of the id: a rebuilt UI has
// different line numbers, and the id must keep naming the same composite instance on both sides.
//
// Deliberately does NOT fall back to tree position (or any other geometric/DOM-only scheme) when
// no fiber is present — that would silently produce ids that drift across a rebuild, exactly what
// this module exists to avoid; `stableIdFor` returns `null` instead, and the overlay records a
// screen note. ESM, zero imports (browser module — `page.addScriptTag` cannot resolve a bare
// specifier), so the fiber-key and stack-frame scanning below is hand-rolled rather than reused
// from anywhere else in this plugin.
//
// Exit codes: n/a — this is a browser module, never invoked as a CLI.

const SKIP_OWNER_NAMES = new Set(['hookified', 'unboundStoryFn', 'ErrorBoundary'])
const EXCLUDED_LOC_SUBSTRINGS = ['node_modules', '/@vite/', '/@fs/', '/@id/', 'sb-vite/deps']

function findFiber(el) {
  if (!el) return null
  for (const key in el) {
    if (Object.prototype.hasOwnProperty.call(el, key) && key.indexOf('__reactFiber$') === 0) {
      return el[key]
    }
  }
  return null
}

function ownerChain(ownerFiber) {
  const names = []
  let cur = ownerFiber || null
  while (cur && names.length < 3) {
    const name = cur.type && cur.type.name
    if (name && !SKIP_OWNER_NAMES.has(name) && name.indexOf('Storybook') !== 0) {
      names.push(cur.key != null ? name + '[' + cur.key + ']' : name)
    }
    cur = cur._debugOwner || null
  }
  return names.join('<')
}

export function stableIdFor(el) {
  const fiber = findFiber(el)
  if (!fiber) return null
  const chain = ownerChain(fiber._debugOwner)
  const doc = globalThis.document
  const all = doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('*') : []
  let ordinal = 0
  let matched = false
  let count = 0
  for (const candidate of all) {
    const cFiber = findFiber(candidate)
    if (!cFiber) continue
    if (ownerChain(cFiber._debugOwner) !== chain) continue
    if (candidate === el) { ordinal = count; matched = true }
    count += 1
  }
  return chain + '#' + (matched ? ordinal : 0)
}

function extractLocUrl(line) {
  const inParens = line.match(/\(([^)]+)\)\s*$/)
  if (inParens) return inParens[1]
  const bare = line.match(/at\s+(\S+)\s*$/)
  return bare ? bare[1] : null
}

function isExcludedLoc(url) {
  for (const sub of EXCLUDED_LOC_SUBSTRINGS) {
    if (url.indexOf(sub) !== -1) return true
  }
  return false
}

function toPathLine(url) {
  const withoutOrigin = url.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\//, '')
  const parts = withoutOrigin.split(':')
  if (parts.length < 2) return null
  if (parts.length >= 3) parts.pop() // drop the trailing column
  const lineNo = parts.pop()
  const filePath = parts.join(':')
  if (!filePath || !lineNo) return null
  return filePath + ':' + lineNo
}

function candidateStacks(fiber) {
  const stacks = []
  if (fiber._debugStack && fiber._debugStack.stack) stacks.push(fiber._debugStack.stack)
  let owner = fiber._debugOwner || null
  while (owner) {
    if (owner._debugStack && owner._debugStack.stack) stacks.push(owner._debugStack.stack)
    owner = owner._debugOwner || null
  }
  return stacks
}

export function locFor(el) {
  const fiber = findFiber(el)
  if (!fiber) return null
  for (const stack of candidateStacks(fiber)) {
    for (const line of stack.split('\n')) {
      const url = extractLocUrl(line)
      if (!url || isExcludedLoc(url)) continue
      const loc = toPathLine(url)
      if (loc) return loc
    }
  }
  return null
}

// Reachable from an injected copy via page.evaluate (spec 02's capture) without an import.
globalThis.__protoStableId = { stableIdFor, locFor }
