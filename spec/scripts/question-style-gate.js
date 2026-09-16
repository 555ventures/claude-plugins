#!/usr/bin/env node
'use strict'
// PreToolUse guard on AskUserQuestion: enforce the Question Style floor mechanically
// (shared doctrine § Question Style), in two tiers.
//
// Tier 1 (deterministic, free): every option must tell the user what picking it costs
// or buys, a "(Recommended)" label must come with a stated reason, and question text
// may not lean on code identifiers.
//
// Tier 2 (judge, ADVISORY): questions that pass tier 1 are reviewed by a fast model against
// the ten-second cold test — could a non-technical product owner who has never seen this
// repo answer correctly from the question text alone? The judge also screens for
// questions the codebase/session/ledger could answer without the user (verdict
// "derive"). Concept load is a judgment property no regex measures.
// The judge fails open on every error path (no CLI, timeout, unparseable output) and
// is disabled with SPEC_QUESTION_JUDGE=off.
//
// Why tier 2 never blocks (field incident 2026-09-15): the judge is NON-DETERMINISTIC — one
// byte-identical question submitted eight times returned "rewrite" once, "pass" six times, and
// once produced no output at all. A hard `exit 2` on that coin flip is unescapable by design:
// the block text says "rewrite and resubmit", so every retry is DIFFERENT text drawing a fresh
// independent flip. The field failure was three rejected rewrites, then abandoning the tool for
// prose — which core § Decisions counts as a dismissed question that STOPS the run. A false
// "derive" block was worse: its text told the model to auto-pick, i.e. to invent the answer the
// user never gave. So tier 2 allows the call and returns its verdict as `additionalContext`.
// Tier 1 keeps `exit 2`: deterministic, so an authoring fix always clears it.
//
// Shipped by the spec plugin (wired in hooks/hooks.json), so it fires for every
// AskUserQuestion in any repo where the plugin is enabled — plugin commands and
// plain sessions alike.
//
// Contract: reads PreToolUse JSON on stdin. exit 2 = block with the corrective rewrite
// instruction on stderr (tier 1 only; stderr on exit 2 is fed back to the model, which
// re-authors). exit 0 = allow — silently when there is nothing to say, or printing a
// PreToolUse `permissionDecision: "allow"` + `additionalContext` object when tier 2 has advice.
// The JSON object is the only channel available on an allow: stderr from a hook that exits 0
// goes to the debug log and the model never sees it.
// Fail-open: any parse failure or unexpected shape allows the call (never wedge).
//
// specs/20260902/06-mocks-provenance-ledger.md D5/D6: while a mocks run (design/mocks/
// status.json, state !== APPROVED) or a genesis run (.claude/genesis/status.json, handoff
// null) is live under the resolved root, a "derive" judge verdict is treated as pass — every
// question inside those runs is a user decision by construction, so the session is not even
// handed the advisory (an unrebutted "you could derive this" is what pushes a model to
// auto-pick). "rewrite" and every tier-1 check are unchanged. The judge prompt also carries one added rule sentence: a document that
// cites a subject is never the user deciding it. Root resolution and stage reads fail open on
// any error (missing/unparsable file => not in a product stage, never a block).

const MIN_DESC = 25 // chars — below this a description cannot carry a consequence
const MIN_RECOMMENDED_DESC = 40 // a recommendation must also say WHY

const JUDGE_MODEL = 'claude-haiku-4-5-20251001'
const JUDGE_TIMEOUT_MS = 30000 // hook budget is 60s; leave headroom to fail open

// D5: product-stage exemption. `root` resolution mirrors spec-state-gate.sh
// (${CLAUDE_PROJECT_DIR:-.}) and spec-session-stamp.sh (.cwd): env var first, then the hook
// input's own `cwd`, then process.cwd(). Fail-open throughout — any read/parse error means
// "not in a product stage", never "block".
function productStageRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd()
}

function readJsonSafe(p) {
  try {
    return JSON.parse(require('node:fs').readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function inProductStage(root) {
  try {
    const path = require('node:path')
    const mocks = readJsonSafe(path.join(root, 'design/mocks/status.json'))
    if (mocks && mocks.state !== 'APPROVED') return true
    const genesis = readJsonSafe(path.join(root, '.claude/genesis/status.json'))
    if (genesis && genesis.handoff == null) return true
  } catch {
    return false
  }
  return false
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function check(input) {
  const questions = input && input.tool_input && input.tool_input.questions
  if (!Array.isArray(questions)) return []
  const problems = []
  for (const q of questions) {
    if (!q || !Array.isArray(q.options)) continue
    const qLabel = typeof q.header === 'string' && q.header ? q.header : 'question'
    // Jargon floor: >=2 backtick-quoted identifiers means the question is written
    // for a developer holding the code, not the person answering it.
    const ticks = (String(q.question || '').match(/`[^`]+`/g) || []).length
    if (ticks >= 2) {
      problems.push(`"${qLabel}": the question names ${ticks} code identifiers — rewrite it around the behavior/outcome the user would recognize, not internal names.`)
    }
    for (const opt of q.options) {
      if (!opt || typeof opt.label !== 'string') continue
      const desc = typeof opt.description === 'string' ? opt.description.trim() : ''
      const recommended = /\(recommended\)/i.test(opt.label)
      if (desc && normalize(desc) === normalize(opt.label)) {
        problems.push(`option "${opt.label}": description restates the label; state the consequence instead.`)
      } else if (desc.length < (recommended ? MIN_RECOMMENDED_DESC : MIN_DESC)) {
        problems.push(`option "${opt.label}": description must state the consequence of picking it — what it costs or buys, what failure mode it accepts${recommended ? ', and WHY it is recommended' : ''}.`)
      }
    }
  }
  return problems
}

function judgePrompt(questions) {
  return [
    'You are a strict gate reviewing questions an AI coding agent wants to ask its product owner.',
    'The owner is a product manager with an engineering background but ZERO context on this repo:',
    'they did not read the spec, do not remember past sessions, will not open a file, and have ten',
    'seconds. All code is AI-written, so implementation effort is never a real cost to them; their',
    'only real costs are attention, the risk of a defect escaping, and rework if a choice proves wrong.',
    '',
    'The bar is context load, not vocabulary: a genuinely technical decision (a protocol, a data',
    'guarantee, a public API shape) may be asked in technical terms. What fails is making the owner',
    'reconstruct THIS repo\'s internals to answer, or framing in mechanisms when an outcome framing',
    'of the same decision exists.',
    '',
    'Verdicts (pick the worst that applies across all questions):',
    '- "pass": every question is answerable cold, in ten seconds, from its own text alone, and every',
    '  option reads as something the owner gains or loses.',
    '- "rewrite": any question or option needs repo-internal context to answer, frames in mechanisms',
    '  (config/infra plumbing, loading paths, allowlists, runners) where an outcome framing exists —',
    '  even with no literal code identifiers — or asks the owner to weigh implementation effort.',
    '- "derive": any question asks something the agent\'s own codebase, session history, or decision',
    '  records almost certainly already answer (e.g. one option is the very behavior being fixed).',
    '- A document that cites, discusses, or recommends a subject is never the user deciding it; a product fact (who, what, platform, payer, tenancy, what a screen does) is never "derive" — ask it.',
    '',
    'Reply with ONLY this JSON, nothing else:',
    '{"verdict":"pass"|"rewrite"|"derive","problems":["<per offending question: quote the phrase that fails, say what to state instead>"]}',
    '',
    'Questions under review:',
    JSON.stringify(questions, null, 1),
  ].join('\n')
}

// Returns null when there is nothing to say, or an advisory string to hand back to the model
// alongside an ALLOWED call. Never blocks — see the "why tier 2 never blocks" note above.
// Fail-open throughout.
// D5: `input` is the parsed hook JSON, used only to resolve productStageRoot for the derive
// exemption; `rewrite` verdicts and tier-1 are unaffected by it.
function judge(questions, input) {
  if (process.env.SPEC_QUESTION_JUDGE === 'off') return null
  const bin = process.env.SPEC_QUESTION_JUDGE_BIN || 'claude'
  let res
  try {
    res = require('node:child_process').spawnSync(bin, ['-p', judgePrompt(questions), '--model', JUDGE_MODEL], {
      encoding: 'utf8',
      timeout: JUDGE_TIMEOUT_MS,
      env: { ...process.env, SPEC_QUESTION_JUDGE: 'off' }, // recursion guard for the child session
    })
  } catch {
    return null
  }
  if (!res || res.error || res.status !== 0 || typeof res.stdout !== 'string') return null
  const match = res.stdout.match(/\{[\s\S]*\}/)
  if (!match) return null
  let verdict
  try {
    verdict = JSON.parse(match[0])
  } catch {
    return null
  }
  const problems = Array.isArray(verdict.problems) ? verdict.problems.filter((p) => typeof p === 'string') : []
  if (verdict.verdict === 'rewrite') {
    return (
      '[question-style-gate] ADVISORY (the question was NOT blocked and is being asked now) — a fast review model judged it hard to answer in ten seconds by a product owner with zero context on this repo:\n' +
      problems.map((p) => `- ${p}`).join('\n') +
      '\nThis judge is non-deterministic and known to false-flag questions whose decision is genuinely pipeline-internal (merge strategy, waive/reject), for which no product-behavior sentence exists — weigh the complaint, do not obey it reflexively. If it is fair, the better next question states one plain outcome (what the product does differently) and phrases every option as what the owner gains or loses in product / attention / defect-risk / rework terms. If it is not, let the answer stand. Never re-ask the same decision twice to satisfy this advisory.\n'
    )
  }
  if (verdict.verdict === 'derive') {
    try {
      if (inProductStage(productStageRoot(input))) return null
    } catch {
      // fail-open toward the existing derive-block behavior below
    }
    return (
      '[question-style-gate] ADVISORY (the question was NOT blocked and is being asked now) — a fast review model thinks this may be answerable without the user, from the codebase, session, or decision records:\n' +
      problems.map((p) => `- ${p}`).join('\n') +
      '\nIf you can genuinely derive it, prefer that next time: announce the pick in one console line — `📌 Auto-picked <choice> — <one-line reason it was derivable> (veto anytime)` — and log it. But the user is being asked RIGHT NOW: take the answer they give. Never discard it and substitute your own, and never treat this advisory as permission to invent an answer the user did not give.\n'
    )
  }
  return null
}

function main() {
  let raw = ''
  try {
    raw = require('node:fs').readFileSync(0, 'utf8')
  } catch {
    process.exit(0)
  }
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    process.exit(0) // fail-open
  }
  let problems
  try {
    problems = check(input)
  } catch {
    process.exit(0) // fail-open
  }
  if (problems.length > 0) {
    process.stderr.write(
      'BLOCKED — question not answerable by a busy reader with no implementation context.\n' +
        problems.map((p) => `- ${p}`).join('\n') +
        '\nRewrite and resubmit: plain language (behaviors, not identifiers), each option description = the consequence of picking it (pros/cons in a phrase), recommended pick first with its reason.\n'
    )
    process.exit(2)
  }
  // Tier 2: only questions that pass the deterministic floor reach the judge.
  const questions = input && input.tool_input && input.tool_input.questions
  if (!Array.isArray(questions) || questions.length === 0) process.exit(0)
  let advice = null
  try {
    advice = judge(questions, input)
  } catch {
    process.exit(0) // fail-open
  }
  if (!advice) process.exit(0)
  // Allow the call and carry the judge's verdict to the model as context. `additionalContext`
  // is the only channel that reaches the model on an allow (exit-0 stderr is debug-log only),
  // and it is paired with an explicit `permissionDecision: "allow"` because that pairing is the
  // documented shape; AskUserQuestion has no permission surface for the allow to widen.
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'question-style advisory attached; the question itself is allowed',
        additionalContext: advice,
      },
    })
  )
  process.exit(0)
}

main()
