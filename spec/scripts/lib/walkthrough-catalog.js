'use strict'
// lib/walkthrough-catalog.js — checks a wireframe round against the gray vocabulary, offline.
//
// Usage: const { checkScreen, checkRound, screenLabel, selfCheck } = require('./walkthrough-catalog')
//        checkRound(catalog, round, { shapes, limits }) -> [{ screen, state, element, code, detail }]
//
// Owner: specs/20260929/01-the-walkthrough-contract-and-the-client.md D5 (AC-20260929-01-3).
// `catalog` is the parsed spec/templates/walkthrough/catalog.json; `shapes` the contract's shapes
// (for the `name` shape); `limits` the contract's limits. The library the service renders with
// checks component names only, so the prop check is ours: a typo costs no request, and the
// service runs the same rules from the same file.
//
// Codes per screen: missing-root, root-not-found, missing-type, missing-props, missing-children,
// unknown-component, unknown-prop, missing-prop, bad-prop, missing-child, children-not-allowed,
// unknown-action, bad-action, bad-repeat, unknown-screen, bad-spec. Per round: bad-name,
// duplicate-screen, unknown-step-screen, unknown-variant-of, chained-variant, too-many.
// A finding about a journey or the round has `screen: null`.
//
// `selfCheck(contract, catalog)` is D6's no-network proof that the two shipped JSON files agree
// with themselves (subset keywords only, calls name real shapes, examples pass their shapes,
// listed error codes exist, exactly the 19 components): -> { findings: [{ part, code, at, detail }],
// calls, components }.
//
// Deliberately NOT here: reading files, the network, the story hash, any check of the round file's
// envelope (`kind`, arrays) — the caller refuses a malformed envelope before calling.
//
// Exit codes: n/a (library, not an entrypoint).

const { validate, lintShapes } = require('./json-shape')

const DEFAULT_NAME = /^(?!.*--)[A-Za-z0-9_.-]{1,80}$/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

function screenLabel(name, state) { return state ? `${name}@${state}` : String(name) }

function nameFindings(ctx, value) {
  if (ctx.shapes && has(ctx.shapes, 'name')) return validate(ctx.shapes, 'name', value)
  return typeof value === 'string' && DEFAULT_NAME.test(value) ? [] : [{ at: '', code: 'pattern', detail: 'not a valid name' }]
}

// props findings from json-shape -> D5 codes. A top-level prop is `.prop`; anything deeper is bad-prop.
function propFindings(catalog, type, props) {
  const out = []
  for (const f of validate(catalog.shapes, type, props)) {
    const top = /^\.([^.[]+)$/.exec(f.at)
    if (f.code === 'unknown-field' && top) out.push({ code: 'unknown-prop', detail: `${top[1]} is not a prop of ${type}` })
    else if (f.code === 'missing' && top) out.push({ code: 'missing-prop', detail: `${top[1]} is required by ${type}` })
    else out.push({ code: 'bad-prop', detail: `${f.at ? f.at.replace(/^\./, '') : 'props'}: ${f.code} — ${f.detail}` })
  }
  return out
}

function checkOn(catalog, on, ctx, add) {
  if (!isObj(on)) { add('bad-action', 'on must be an object holding only press'); return }
  for (const [event, act] of Object.entries(on)) {
    if (event !== 'press') { add('unknown-action', `event "${event}" is not supported (only press)`); continue }
    if (!isObj(act) || typeof act.action !== 'string') { add('bad-action', 'press needs an action name'); continue }
    if (!isObj(catalog.actions) || !has(catalog.actions, act.action)) { add('unknown-action', `action "${act.action}" is not in the catalog`); continue }
    const shape = catalog.actions[act.action].params
    const found = validate(catalog.shapes, shape, act.params === undefined ? {} : act.params)
    for (const f of found) add('bad-action', `${act.action} params${f.at}: ${f.code} — ${f.detail}`)
    if (!found.length && act.action === 'navigate' && ctx.screenNames && !ctx.screenNames.has(act.params.to)) {
      add('unknown-screen', `navigate targets "${act.params.to}", which is not a screen of this round`)
    }
  }
}

// One screen's spec. `ctx.screenNames` (a Set) enables the navigate-target check.
function checkScreen(catalog, screen, ctx = {}) {
  const out = []
  const name = screen && screen.name
  const state = (screen && screen.state) || null
  const push = (element, code, detail) => out.push({ screen: name, state, element, code, detail })
  const spec = screen && screen.spec
  if (!isObj(spec)) { push(null, 'bad-spec', 'spec must be an object with root and elements'); return out }
  if (typeof spec.root !== 'string' || !spec.root) push(null, 'missing-root', 'spec has no root')
  if (!isObj(spec.elements)) { push(null, 'bad-spec', 'spec.elements must be an object'); return out }
  const elements = spec.elements
  if (typeof spec.root === 'string' && spec.root && !has(elements, spec.root)) {
    push(null, 'root-not-found', `root "${spec.root}" names no element`)
  }
  const containers = new Set(Array.isArray(catalog.containers) ? catalog.containers : [])
  for (const [key, el] of Object.entries(elements)) {
    const add = (code, detail) => push(key, code, detail)
    if (!isObj(el)) { add('missing-type', 'element must be an object'); continue }
    if (typeof el.type !== 'string') add('missing-type', 'element has no type')
    if (!has(el, 'props')) add('missing-props', 'element has no props (use {} for none)')
    if (!Array.isArray(el.children)) add('missing-children', 'element has no children list (use [] for none)')
    if (typeof el.type === 'string') {
      if (!has(catalog.shapes, el.type) || !/^[A-Z]/.test(el.type)) add('unknown-component', `${el.type} is not one of the ${[...Object.keys(catalog.shapes)].filter((k) => /^[A-Z]/.test(k)).length} catalog components`)
      else if (has(el, 'props')) for (const f of propFindings(catalog, el.type, el.props)) add(f.code, f.detail)
    }
    if (Array.isArray(el.children)) {
      for (const c of el.children) if (typeof c !== 'string' || !has(elements, c)) add('missing-child', `child ${JSON.stringify(c)} names no element`)
      if (el.children.length && typeof el.type === 'string' && has(catalog.shapes, el.type) && !containers.has(el.type)) {
        add('children-not-allowed', `${el.type} cannot hold children`)
      }
    }
    if (has(el, 'on')) checkOn(catalog, el.on, ctx, add)
    if (has(el, 'repeat')) {
      const r = el.repeat
      if (!isObj(r) || Object.keys(r).length !== 1 || typeof r.statePath !== 'string') add('bad-repeat', 'repeat must be { "statePath": "<string>" }')
    }
  }
  return out
}

// A whole round: envelope-independent checks plus every screen.
function checkRound(catalog, round, ctx = {}) {
  const out = []
  const limits = ctx.limits || {}
  const screens = Array.isArray(round.screens) ? round.screens : []
  const journeys = Array.isArray(round.journeys) ? round.journeys : []
  const pictures = round.kind === 'screenshots'
  const roundFinding = (code, detail) => out.push({ screen: null, state: null, element: null, code, detail })

  if (limits.screens !== undefined && screens.length > limits.screens) roundFinding('too-many', `${screens.length} screens exceed the limit of ${limits.screens}`)
  if (limits.journeys !== undefined && journeys.length > limits.journeys) roundFinding('too-many', `${journeys.length} journeys exceed the limit of ${limits.journeys}`)

  const present = new Set()
  const names = new Set()
  const seen = new Set()
  for (const s of screens) {
    const state = s && s.state ? s.state : null
    const label = screenLabel(s && s.name, state)
    const bad = (code, detail) => out.push({ screen: s && s.name, state, element: null, code, detail })
    for (const f of nameFindings(ctx, s && s.name)) bad('bad-name', `screen name ${JSON.stringify(s && s.name)}: ${f.code} — ${f.detail}`)
    if (state !== null) for (const f of nameFindings(ctx, state)) bad('bad-name', `state ${JSON.stringify(state)}: ${f.code} — ${f.detail}`)
    const key = label + (pictures ? '#' + (s && s.width) : '')
    if (seen.has(key)) bad('duplicate-screen', `${label}${pictures ? ' at width ' + (s && s.width) : ''} appears twice`)
    seen.add(key)
    present.add(label)
    if (s && typeof s.name === 'string') names.add(s.name)
  }

  if (!pictures) {
    const shared = { ...ctx, screenNames: names }
    for (const s of screens) out.push(...checkScreen(catalog, s, shared))
  }

  const ids = new Map(journeys.map((j) => [j && j.id, j]))
  for (const j of journeys) {
    const id = j && j.id
    const steps = Array.isArray(j && j.steps) ? j.steps : []
    if (limits.steps !== undefined && steps.length > limits.steps) roundFinding('too-many', `journey ${id} has ${steps.length} steps, over the limit of ${limits.steps}`)
    steps.forEach((st, i) => {
      const label = screenLabel(st && st.screen, st && st.state)
      if (!present.has(label)) roundFinding('unknown-step-screen', `journey ${id} step ${i + 1} names ${label}, which is not a screen of this round`)
    })
    if (j && j.variantOf !== undefined && j.variantOf !== null) {
      const target = ids.get(j.variantOf)
      if (!target || target === j) roundFinding('unknown-variant-of', `journey ${id} is a variant of "${j.variantOf}", which is not another journey of this round`)
      else if (target.variantOf !== undefined && target.variantOf !== null) roundFinding('chained-variant', `journey ${id} is a variant of ${j.variantOf}, which is itself a variant`)
    }
  }
  return out
}

const COMPONENTS = ['Stack', 'Row', 'Grid', 'Card', 'Divider', 'Heading', 'Text', 'Badge', 'Alert', 'Button', 'Field', 'Select', 'Checkbox', 'Tabs', 'Nav', 'List', 'Table', 'Image', 'Avatar']
const CONTAINERS = ['Stack', 'Row', 'Grid', 'Card', 'List', 'Nav', 'Tabs']
const CALLS = ['hello', 'pushRound', 'putImage', 'pullNotes', 'replyNote', 'pullApprovals', 'markRound']
const VALUE_SHAPES = ['expression', 'text', 'number', 'boolean', 'texts', 'rows']

function selfCheck(contract, catalog) {
  const findings = []
  let part = 'contract'
  const add = (code, at, detail) => findings.push({ part, code, at, detail })
  let calls = 0
  let components = 0

  if (!isObj(contract)) add('bad-contract', 'contract', 'the contract must be a JSON object')
  else {
    for (const k of ['apiVersion', 'revision']) if (!Number.isInteger(contract[k]) || contract[k] < 1) add('bad-contract', k, `${k} must be a whole number of 1 or more`)
    if (typeof contract.prefix !== 'string') add('bad-contract', 'prefix', 'prefix must be a string such as "/v1"')
    for (const k of ['limits', 'errors', 'calls', 'shapes', 'examples']) if (!isObj(contract[k])) add('bad-contract', k, `${k} must be an object`)
    const shapes = isObj(contract.shapes) ? contract.shapes : {}
    const errors = isObj(contract.errors) ? contract.errors : {}
    for (const f of lintShapes(contract.shapes)) add(f.code, 'contract ' + f.at, f.detail)
    for (const [code, status] of Object.entries(errors)) if (!Number.isInteger(status) || status < 400 || status > 599) add('bad-contract', `errors.${code}`, 'must map to an HTTP status from 400 to 599')
    for (const code of Array.isArray(contract.commonErrors) ? contract.commonErrors : []) if (!has(errors, code)) add('unknown-error', 'commonErrors', `${code} is not in errors`)
    const callMap = isObj(contract.calls) ? contract.calls : {}
    calls = Object.keys(callMap).length
    for (const name of CALLS) if (!has(callMap, name)) add('missing-call', `calls.${name}`, `the contract has no ${name} call`)
    const examples = isObj(contract.examples) ? contract.examples : {}
    for (const name of Object.keys(examples)) if (!has(callMap, name)) add('unknown-example', `examples.${name}`, `${name} is not a call`)
    for (const [name, call] of Object.entries(callMap)) {
      if (!isObj(call)) { add('bad-contract', `calls.${name}`, 'a call must be an object'); continue }
      for (const k of ['method', 'path']) if (typeof call[k] !== 'string') add('bad-contract', `calls.${name}.${k}`, `${k} must be a string`)
      for (const part of ['request', 'response']) {
        if (call[part] === undefined) continue
        if (typeof call[part] !== 'string' || !has(shapes, call[part])) { add('unknown-shape', `calls.${name}.${part}`, `names shape "${call[part]}", which the contract does not hold`); continue }
        const ex = examples[name] && examples[name][part]
        if (ex === undefined) { add('missing-example', `examples.${name}.${part}`, `no example for ${name}'s ${part}`); continue }
        for (const f of validate(shapes, call[part], ex)) add(f.code, `examples.${name}.${part}${f.at}`, f.detail)
      }
      if (call.response === undefined) add('bad-contract', `calls.${name}.response`, 'a call needs a response shape')
      for (const code of Array.isArray(call.errors) ? call.errors : []) if (!has(errors, code)) add('unknown-error', `calls.${name}.errors`, `${code} is not in errors`)
    }
  }

  part = 'catalog'
  if (!isObj(catalog)) add('bad-catalog', 'catalog', 'the catalog must be a JSON object')
  else {
    if (!Number.isInteger(catalog.catalogVersion)) add('bad-catalog', 'catalogVersion', 'catalogVersion must be a whole number')
    const shapes = isObj(catalog.shapes) ? catalog.shapes : null
    if (!shapes) add('bad-catalog', 'shapes', 'shapes must be an object')
    else {
      for (const f of lintShapes(shapes)) add(f.code, 'catalog ' + f.at, f.detail)
      for (const name of COMPONENTS) {
        if (!has(shapes, name)) { add('missing-component', `shapes.${name}`, `the catalog holds no shape for component ${name}`); continue }
        components++
        if (isObj(shapes[name]) && shapes[name].additionalProperties !== false) add('open-props', `shapes.${name}`, `${name}'s props shape must set additionalProperties false`)
      }
      for (const name of Object.keys(shapes)) if (/^[A-Z]/.test(name) && !COMPONENTS.includes(name)) add('unknown-component', `shapes.${name}`, `${name} is not one of the 19 components`)
      for (const name of VALUE_SHAPES) if (!has(shapes, name)) add('missing-shape', `shapes.${name}`, `the catalog holds no value shape ${name}`)
    }
    const cont = Array.isArray(catalog.containers) ? catalog.containers : null
    if (!cont) add('bad-catalog', 'containers', 'containers must be a list')
    else if (cont.length !== CONTAINERS.length || !CONTAINERS.every((n) => cont.includes(n))) add('bad-catalog', 'containers', `containers must be exactly ${CONTAINERS.join(', ')}`)
    const nav = isObj(catalog.actions) && isObj(catalog.actions.navigate) ? catalog.actions.navigate : null
    if (!nav) add('bad-catalog', 'actions.navigate', 'the catalog must define the navigate action')
    else if (!shapes || typeof nav.params !== 'string' || !has(shapes, nav.params)) add('unknown-shape', 'actions.navigate.params', `names shape "${nav.params}", which the catalog does not hold`)
  }
  return { findings, calls, components }
}

module.exports = { checkScreen, checkRound, screenLabel, selfCheck }
