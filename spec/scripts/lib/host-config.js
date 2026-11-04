'use strict'
// lib/host-config.js — the sole reader of the host's `.claude/spec.config.json` for scripts that
// need one fact out of it.
// Owner: specs/20260813/10-host-capabilities.md.
//
// `readConfig(root)` is the file read; `declaredForge(root)` is the one derivation of the declared forge.
//
// What `readConfig` deliberately does NOT do: validate the config's shape, apply defaults for
// any key, or surface read/parse errors. An absent, unreadable, or unparsable config reads as
// `{}` — every caller degrades to its own documented default (glob-match: baseline globs only;
// the CI scripts: legacy dynamic `gh` probing), which is the contract each of them already had.
//
// `readConfigStrict(root)` is the fail-loud sibling: it throws on absent/unreadable/unparsable and
// otherwise returns the parsed value VERBATIM (object, array, scalar or null) — callers own shape handling.
//
// tests/host-config/config-read.test.js bans the literal config filename in executable text under
// spec/scripts/ except here, smoke.sh and spec-state-gate.sh. `configPath(root)`, `configExists(root)` and
// `CONFIG_RELPATH` (display only) are the sanctioned routes.
//
// `POLICY_DEFAULTS`, `policy(root)` and `validatePolicy(block)` are the one declaration, accessor and
// validator of the optional `policy` block (deep-merged over defaults, unknown keys dropped). `agentCall(root,
// seat, subagentType[, {isolation, background}])` is the one writer of a printed `Agent {…}` dispatch.
//
// `readPipelineRules(root, cfg)` resolves and reads the file `pipelineRules` names: `{ok: true, rel, abs,
// text}` or `{ok: false, kind: 'no-key'|'unreadable', rel, abs, error}` — never a throw, never a default
// path. Callers map the kind to their own policy; section parsing stays with them.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

const CONFIG_RELPATH = '.claude/spec.config.json'

function configPath(root) { return path.join(root, '.claude', 'spec.config.json') }

// Presence only — never opens, reads, or parses the file. A directory occupying the path
// returns true (existsSync semantics); callers that need readability call readConfigStrict.
function configExists(root) { return fs.existsSync(configPath(root)) }

// Absent / unreadable / unparsable / non-object config → {} (never a throw).
function readConfig(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(root), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Absent / unreadable / unparsable config → throws. A successful parse returns verbatim, no
// shape coercion, no non-object throw — callers own shape handling.
function readConfigStrict(root) {
  const p = configPath(root)
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    throw new Error('cannot read/parse ' + p + ' (' + e.message + ')')
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error('cannot read/parse ' + p + ' (' + e.message + ')')
  }
}

// `cfg` defaults to the lenient read; a caller holding a strictly-read config passes it in.
function readPipelineRules(root, cfg = readConfig(root)) {
  const rel = cfg && typeof cfg.pipelineRules === 'string' && cfg.pipelineRules ? cfg.pipelineRules : null
  if (rel === null) return { ok: false, kind: 'no-key', rel: null, abs: null, error: null }
  const abs = path.resolve(root, rel)
  try {
    return { ok: true, rel, abs, text: fs.readFileSync(abs, 'utf8') }
  } catch (error) {
    return { ok: false, kind: 'unreadable', rel, abs, error }
  }
}

// The declared forge capability, or undefined when the block/key is absent — undefined is the
// legacy-mode signal (probe `gh` at use time), never the same thing as a declared "none".
function declaredForge(root) {
  const capabilities = readConfig(root).capabilities
  return capabilities && capabilities.forge
}

const POLICY_ENUMS = Object.freeze({
  mergeStrategy: Object.freeze(['derived', 'merge-commit', 'ff-only', 'squash', 'rebase-ff']),
  testExpiry: Object.freeze(['classify', 'off']),
  reviewService: Object.freeze(['terminal', 'hosted']),
})
const STOP_ENUMS = Object.freeze({
  repairRound: Object.freeze(['repair', 'ask']),
  buildEscalate: Object.freeze(['derived', 'ask']),
  reviewEscalate: Object.freeze(['queue', 'ask']),
  redFindings: Object.freeze(['remove-mention', 'ask']),
  prototypeClose: Object.freeze(['ask', 'keep', 'delete']),
  rejectWithEvidence: Object.freeze(['accept', 'ask']),
})
const POLICY_BOOLEANS = Object.freeze(['worktreePerSpec', 'directLaneToMain', 'ledgerCommitted'])
const POLICY_SEATS = Object.freeze(['workers', 'reviewer', 'disposer', 'lanes'])
const POLICY_MODELS = Object.freeze(['fable', 'opus', 'sonnet', 'haiku'])
const POLICY_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max'])

const seat = (model, effort) => Object.freeze({ model, effort })
const POLICY_DEFAULTS = Object.freeze({
  worktreePerSpec: true,
  directLaneToMain: true,
  mergeStrategy: 'derived',
  testExpiry: 'classify',
  ledgerCommitted: true,
  reviewService: 'terminal',
  models: Object.freeze({
    workers: seat('sonnet', 'medium'),
    reviewer: seat('fable', 'low'),
    disposer: seat('opus', 'medium'),
    lanes: seat('opus', 'medium'),
  }),
  stops: Object.freeze({
    repairRound: 'repair',
    buildEscalate: 'derived',
    reviewEscalate: 'queue',
    redFindings: 'remove-mention',
    prototypeClose: 'ask',
    rejectWithEvidence: 'accept',
  }),
  riskTiers: Object.freeze([]),
})

const { isObj } = require('./util')

// A policy block merged key by key over POLICY_DEFAULTS; unknown keys dropped, `models` merged
// per seat. Returns a fresh mutable object. A wrongly-typed value is kept as written —
// validatePolicy reports it, this does not second-guess it.
function mergePolicy(raw) {
  const block = isObj(raw) ? raw : {}
  const out = { models: {}, stops: {} }
  for (const k of Object.keys(POLICY_DEFAULTS)) {
    if (k === 'models' || k === 'stops') continue
    out[k] = k in block ? block[k] : (Array.isArray(POLICY_DEFAULTS[k]) ? [...POLICY_DEFAULTS[k]] : POLICY_DEFAULTS[k])
  }
  const m = isObj(block.models) ? block.models : {}
  for (const s of POLICY_SEATS) {
    out.models[s] = { ...POLICY_DEFAULTS.models[s], ...(isObj(m[s]) ? m[s] : {}) }
  }
  const st = isObj(block.stops) ? block.stops : {}
  for (const k of Object.keys(POLICY_DEFAULTS.stops)) out.stops[k] = k in st ? st[k] : POLICY_DEFAULTS.stops[k]
  return out
}

// The host's effective policy: its config's block merged over the defaults.
function policy(root) { return mergePolicy(readConfig(root).policy) }

// `Agent {subagent_type: "<t>", model: <m>, effort: <e>}` (subagent_type omitted when absent) for a
// policy seat, read from the host's policy at print time. The optional fourth argument
// `{isolation, background}` renders `, isolation: "<v>"` and `, run_in_background: true` after effort.
function agentCall(root, seatName, subagentType, extra) {
  const s = policy(root).models[seatName]
  const x = extra || {}
  const tail = (x.isolation ? `, isolation: "${x.isolation}"` : '') + (x.background ? ', run_in_background: true' : '')
  return `Agent {${subagentType ? `subagent_type: "${subagentType}", ` : ''}model: ${s.model}, effort: ${s.effort}${tail}}`
}

// [] or one finding string per defect. A partial block is valid (absent keys take defaults).
function validatePolicy(block) {
  if (!isObj(block)) return ['policy: expected an object']
  const found = []
  for (const k of Object.keys(block)) {
    if (!(k in POLICY_DEFAULTS)) { found.push('unknown key ' + k); continue }
    const v = block[k]
    if (POLICY_BOOLEANS.includes(k)) {
      if (typeof v !== 'boolean') found.push(k + ': expected boolean')
    } else if (POLICY_ENUMS[k]) {
      if (!POLICY_ENUMS[k].includes(v)) found.push(k + ': expected one of ' + POLICY_ENUMS[k].join('|'))
    } else if (k === 'riskTiers') {
      if (!Array.isArray(v) || !v.every((e) => typeof e === 'string' && e.trim() !== '')) found.push('riskTiers: expected an array of non-empty strings')
    } else if (k === 'stops') {
      if (!isObj(v)) { found.push('stops: expected an object'); continue }
      for (const s of Object.keys(v)) {
        if (!STOP_ENUMS[s]) { found.push('unknown key stops.' + s); continue }
        if (!STOP_ENUMS[s].includes(v[s])) found.push('stops.' + s + ': expected one of ' + STOP_ENUMS[s].join('|'))
      }
    } else if (k === 'models') {
      if (!isObj(v)) { found.push('models: expected an object'); continue }
      for (const s of Object.keys(v)) {
        if (!POLICY_SEATS.includes(s)) { found.push('unknown key models.' + s); continue }
        const e = v[s]
        if (!isObj(e)) { found.push('models.' + s + ': expected an object'); continue }
        for (const f of Object.keys(e)) if (f !== 'model' && f !== 'effort') found.push('unknown key models.' + s + '.' + f)
        if ('model' in e && !POLICY_MODELS.includes(e.model)) found.push('models.' + s + '.model: expected one of ' + POLICY_MODELS.join('|'))
        if ('effort' in e && !POLICY_EFFORTS.includes(e.effort)) found.push('models.' + s + '.effort: expected one of ' + POLICY_EFFORTS.join('|'))
      }
    }
  }
  return found
}

module.exports = {
  readConfig, readConfigStrict, readPipelineRules, declaredForge, configPath, configExists, CONFIG_RELPATH,
  POLICY_DEFAULTS, STOP_ENUMS, policy, mergePolicy, validatePolicy, agentCall,
}
