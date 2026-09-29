'use strict'
// lib/json-shape.js — the one validator for the walkthrough contract and the wireframe catalog.
//
// Usage: const { validate, lintShapes, KEYWORDS } = require('./json-shape')
//        validate(shapes, 'shapeName', value) -> [{ at, code, detail }]   ([] = the value passes)
//
// Owner: specs/20260929/01-the-walkthrough-contract-and-the-client.md D2 (AC-20260929-01-1).
// The contract and the catalog are plain JSON in a fixed subset of JSON Schema so the hosted
// service can read them with a standard library and the plugin can read them with none. This
// file is the plugin's reader. `at` is a value path: '' is the root, '.key' a property,
// '[2]' an item (so `.notes[2].anchor.index`). Codes: type, enum, const, missing, unknown-field,
// one-of, pattern, min-length, max-length, minimum, maximum, min-items, max-items,
// property-name, min-properties.
//
// Fails closed: a schema carrying a keyword outside KEYWORDS is itself a finding
// (`unknown-keyword`, `at` a schema location such as `#/shapes/x`), reported for every shape the
// validated one reaches through `$ref`, so the contract can never promise a check this file
// silently skips. `lintShapes(shapes)` is the same lint over a whole file.
//
// Deliberately NOT here: `format`, `allOf`, `anyOf`, `not`, `if`, remote `$ref`, `default`,
// schema composition of any kind beyond `oneOf`; no coercion of values; no network; no
// dependency.
//
// Exit codes: n/a (library, not an entrypoint).

const KEYWORDS = Object.freeze([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', '$ref',
  'oneOf', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'minItems', 'maxItems',
  'propertyNames', 'minProperties', 'description',
])
const KEYSET = new Set(KEYWORDS)
const TYPES = new Set(['string', 'integer', 'number', 'boolean', 'object', 'array', 'null'])
const REF_RE = /^#\/shapes\/(.+)$/
const MAX_DEPTH = 64

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const cpLength = (s) => Array.from(s).length

function isType(v, name) {
  switch (name) {
    case 'string': return typeof v === 'string'
    case 'integer': return typeof v === 'number' && Number.isInteger(v)
    case 'number': return typeof v === 'number' && Number.isFinite(v)
    case 'boolean': return typeof v === 'boolean'
    case 'object': return isObj(v)
    case 'array': return Array.isArray(v)
    case 'null': return v === null
    default: return false
  }
}

function deepEqual(a, b) {
  if (a === b) return true
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => has(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

function show(v) {
  const s = JSON.stringify(v)
  return s === undefined ? String(v) : s.length > 60 ? s.slice(0, 57) + '...' : s
}

// ---- schema lint --------------------------------------------------------------------------

function lint(schema, at, out, refs) {
  if (!isObj(schema)) {
    out.push({ at, code: 'bad-schema', detail: 'a schema must be a JSON object' })
    return
  }
  for (const k of Object.keys(schema)) {
    if (!KEYSET.has(k)) out.push({ at, code: 'unknown-keyword', detail: `keyword "${k}" is outside the supported subset (${KEYWORDS.join(', ')})` })
  }
  if (has(schema, 'type')) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type]
    for (const n of names) if (!TYPES.has(n)) out.push({ at, code: 'bad-schema', detail: `type "${n}" is not one of ${[...TYPES].join(', ')}` })
  }
  if (has(schema, 'additionalProperties') && typeof schema.additionalProperties !== 'boolean') {
    out.push({ at, code: 'bad-schema', detail: 'additionalProperties must be a boolean' })
  }
  if (has(schema, 'pattern')) {
    try { new RegExp(schema.pattern) } catch { out.push({ at, code: 'bad-schema', detail: 'pattern is not a valid regular expression' }) }
  }
  if (has(schema, '$ref')) {
    const m = typeof schema.$ref === 'string' ? REF_RE.exec(schema.$ref) : null
    if (!m) out.push({ at, code: 'bad-ref', detail: `$ref ${show(schema.$ref)} must look like #/shapes/<name>` })
    else refs.push(m[1])
  }
  if (has(schema, 'propertyNames')) {
    const pn = schema.propertyNames
    if (!isObj(pn)) out.push({ at, code: 'bad-schema', detail: 'propertyNames must be { "pattern": ... }' })
    else for (const k of Object.keys(pn)) if (k !== 'pattern') out.push({ at: at + '/propertyNames', code: 'unknown-keyword', detail: `keyword "${k}" is outside propertyNames' only supported keyword, "pattern"` })
  }
  if (has(schema, 'properties')) {
    if (!isObj(schema.properties)) out.push({ at, code: 'bad-schema', detail: 'properties must be an object of schemas' })
    else for (const [k, s] of Object.entries(schema.properties)) lint(s, at + '/properties/' + k, out, refs)
  }
  if (has(schema, 'items')) lint(schema.items, at + '/items', out, refs)
  if (has(schema, 'oneOf')) {
    if (!Array.isArray(schema.oneOf) || !schema.oneOf.length) out.push({ at, code: 'bad-schema', detail: 'oneOf must be a non-empty array of schemas' })
    else schema.oneOf.forEach((s, i) => lint(s, at + '/oneOf/' + i, out, refs))
  }
}

// Every shape in a `shapes` map, whether or not anything reaches it; `$ref`s must resolve.
function lintShapes(shapes) {
  const out = []
  if (!isObj(shapes)) return [{ at: '#/shapes', code: 'bad-schema', detail: 'shapes must be an object of schemas' }]
  for (const [name, schema] of Object.entries(shapes)) {
    const refs = []
    lint(schema, '#/shapes/' + name, out, refs)
    for (const r of refs) if (!has(shapes, r)) out.push({ at: '#/shapes/' + name, code: 'bad-ref', detail: `$ref #/shapes/${r} names no shape` })
  }
  return out
}

// The lint restricted to the shape being validated and the shapes it reaches.
function lintReachable(shapes, name, out) {
  const seen = new Set()
  const queue = [name]
  while (queue.length) {
    const n = queue.shift()
    if (seen.has(n) || !has(shapes, n)) continue
    seen.add(n)
    const refs = []
    lint(shapes[n], '#/shapes/' + n, out, refs)
    queue.push(...refs)
  }
}

// ---- value check --------------------------------------------------------------------------

function check(shapes, schema, value, at, out, depth) {
  if (!isObj(schema)) return
  if (depth > MAX_DEPTH) {
    out.push({ at, code: 'bad-schema', detail: 'shapes nest deeper than ' + MAX_DEPTH + ' (a $ref cycle)' })
    return
  }
  if (has(schema, '$ref')) {
    const m = typeof schema.$ref === 'string' ? REF_RE.exec(schema.$ref) : null
    if (m && has(shapes, m[1])) check(shapes, shapes[m[1]], value, at, out, depth + 1)
  }
  if (has(schema, 'type')) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!names.some((n) => isType(value, n))) {
      out.push({ at, code: 'type', detail: `expected ${names.join(' or ')}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}` })
      return
    }
  }
  if (has(schema, 'const') && !deepEqual(value, schema.const)) {
    out.push({ at, code: 'const', detail: `must be ${show(schema.const)}, got ${show(value)}` })
  }
  if (has(schema, 'enum') && !(Array.isArray(schema.enum) && schema.enum.some((e) => deepEqual(e, value)))) {
    out.push({ at, code: 'enum', detail: `${show(value)} is not one of ${show(schema.enum)}` })
  }
  if (has(schema, 'oneOf') && Array.isArray(schema.oneOf)) {
    const results = schema.oneOf.map((branch) => {
      const f = []
      check(shapes, branch, value, at, f, depth + 1)
      return f
    })
    const matched = results.filter((f) => !f.length).length
    if (matched !== 1) {
      const why = results.map((f) => (f.length ? f[0].code + (f[0].at ? ' at ' + f[0].at : '') : 'ok')).join('; ')
      out.push({ at, code: 'one-of', detail: matched === 0 ? `matches none of ${results.length} shapes (${why})` : `matches ${matched} shapes, exactly one is required` })
    }
  }
  if (typeof value === 'string') {
    if (has(schema, 'minLength') && cpLength(value) < schema.minLength) out.push({ at, code: 'min-length', detail: `shorter than ${schema.minLength}` })
    if (has(schema, 'maxLength') && cpLength(value) > schema.maxLength) out.push({ at, code: 'max-length', detail: `longer than ${schema.maxLength}` })
    if (has(schema, 'pattern')) {
      let re = null
      try { re = new RegExp(schema.pattern) } catch { re = null }
      if (re && !re.test(value)) out.push({ at, code: 'pattern', detail: `${show(value)} does not match ${schema.pattern}` })
    }
  }
  if (typeof value === 'number') {
    if (has(schema, 'minimum') && value < schema.minimum) out.push({ at, code: 'minimum', detail: `${value} is below ${schema.minimum}` })
    if (has(schema, 'maximum') && value > schema.maximum) out.push({ at, code: 'maximum', detail: `${value} is above ${schema.maximum}` })
  }
  if (Array.isArray(value)) {
    if (has(schema, 'minItems') && value.length < schema.minItems) out.push({ at, code: 'min-items', detail: `fewer than ${schema.minItems} items` })
    if (has(schema, 'maxItems') && value.length > schema.maxItems) out.push({ at, code: 'max-items', detail: `more than ${schema.maxItems} items` })
    if (has(schema, 'items')) value.forEach((v, i) => check(shapes, schema.items, v, at + '[' + i + ']', out, depth + 1))
  }
  if (isObj(value)) {
    const props = isObj(schema.properties) ? schema.properties : {}
    if (Array.isArray(schema.required)) {
      for (const k of schema.required) if (!has(value, k)) out.push({ at: at + '.' + k, code: 'missing', detail: `required field "${k}" is absent` })
    }
    if (has(schema, 'minProperties') && Object.keys(value).length < schema.minProperties) {
      out.push({ at, code: 'min-properties', detail: `fewer than ${schema.minProperties} properties` })
    }
    if (isObj(schema.propertyNames) && has(schema.propertyNames, 'pattern')) {
      let re = null
      try { re = new RegExp(schema.propertyNames.pattern) } catch { re = null }
      if (re) for (const k of Object.keys(value)) if (!re.test(k)) out.push({ at: at + '.' + k, code: 'property-name', detail: `key "${k}" does not match ${schema.propertyNames.pattern}` })
    }
    for (const [k, v] of Object.entries(value)) {
      if (has(props, k)) check(shapes, props[k], v, at + '.' + k, out, depth + 1)
      else if (schema.additionalProperties === false) out.push({ at: at + '.' + k, code: 'unknown-field', detail: `"${k}" is not a field of this shape` })
    }
  }
}

function validate(shapes, shapeName, value) {
  if (!isObj(shapes) || !has(shapes, shapeName)) {
    return [{ at: '', code: 'unknown-shape', detail: `no shape named "${shapeName}"` }]
  }
  const out = []
  lintReachable(shapes, shapeName, out)
  check(shapes, shapes[shapeName], value, '', out, 0)
  return out
}

module.exports = { validate, lintShapes, KEYWORDS }
