#!/usr/bin/env node
'use strict'
// PreToolUse guard on AskUserQuestion: enforce the Question Style floor mechanically
// (shared doctrine § Question Style), in two tiers.
//
// Tier 1 (deterministic, free): every option must tell the user what picking it costs
// or buys, a "(Recommended)" label must come with a stated reason, and question text
// may not lean on code identifiers.
//
// Tier 2 (judge): questions that pass tier 1 are reviewed by a fast model against the
// ten-second cold test — could a non-technical product owner who has never seen this
// repo answer correctly from the question text alone? The judge also screens for
// questions the codebase/session/ledger could answer without the user (verdict
// "derive"). Concept load is a judgment property no regex measures — the 2026-07-21
// incident shipped an all-mechanism question round with zero backticked identifiers.
// The judge fails open on every error path (no CLI, timeout, unparseable output) and
// is disabled with SPEC_QUESTION_JUDGE=off.
//
// Shipped by the spec plugin (wired in hooks/hooks.json), so it fires for every
// AskUserQuestion in any repo where the plugin is enabled — plugin commands and
// plain sessions alike.
//
// Contract: reads PreToolUse JSON on stdin. exit 0 = allow, exit 2 = block with the
// corrective rewrite instruction on stderr (fed back to the model, which re-authors).
// Fail-open: any parse failure or unexpected shape allows the call (never wedge).

const MIN_DESC = 25 // chars — below this a description cannot carry a consequence
const MIN_RECOMMENDED_DESC = 40 // a recommendation must also say WHY

const JUDGE_MODEL = 'claude-haiku-4-5-20251001'
const JUDGE_TIMEOUT_MS = 30000 // hook budget is 60s; leave headroom to fail open

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
    '',
    'Reply with ONLY this JSON, nothing else:',
    '{"verdict":"pass"|"rewrite"|"derive","problems":["<per offending question: quote the phrase that fails, say what to state instead>"]}',
    '',
    'Questions under review:',
    JSON.stringify(questions, null, 1),
  ].join('\n')
}

// Returns null to allow, or a stderr message string to block. Fail-open throughout.
function judge(questions) {
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
      'BLOCKED — a review model judged this question unanswerable in ten seconds by a product owner with zero context on this repo.\n' +
      problems.map((p) => `- ${p}`).join('\n') +
      '\nRewrite and resubmit: one plain sentence of outcome (what the product does differently), every option phrased as what the owner gains or loses in product terms or in attention / defect-risk / rework terms. Technical terms are fine only when the decision itself is technical — never mechanism framing where an outcome framing exists, never implementation effort.\n'
    )
  }
  if (verdict.verdict === 'derive') {
    return (
      'BLOCKED — this looks answerable without the user (the codebase, session, or decision records already hold the answer).\n' +
      problems.map((p) => `- ${p}`).join('\n') +
      '\nDerive the answer yourself; if genuinely ambiguous, take the option cheapest to reverse later. Announce it in one console line — `📌 Auto-picked <choice> — <one-line reason it was derivable> (veto anytime)` — and log it. Re-ask ONLY what remains genuinely underivable, rewritten to the same plain-outcome standard.\n'
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
  let blockMessage = null
  try {
    blockMessage = judge(questions)
  } catch {
    process.exit(0) // fail-open
  }
  if (!blockMessage) process.exit(0)
  process.stderr.write(blockMessage)
  process.exit(2)
}

main()
