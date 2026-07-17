#!/usr/bin/env node
'use strict'
// PreToolUse guard on AskUserQuestion: enforce the Question Style floor mechanically
// (shared doctrine § Question Style). Doctrine alone under-delivers — a model mid-task
// follows local instructions over a distant style section — so the structural half of
// the rule is enforced here: every option must tell the user what picking it costs or
// buys, and a "(Recommended)" label must come with a stated reason. Taste (plain
// language, reframing) stays doctrine; this gate only rejects questions that are
// structurally unanswerable by a busy reader with no implementation context.
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
  if (problems.length === 0) process.exit(0)
  process.stderr.write(
    'BLOCKED — question not answerable by a busy reader with no implementation context.\n' +
      problems.map((p) => `- ${p}`).join('\n') +
      '\nRewrite and resubmit: plain language (behaviors, not identifiers), each option description = the consequence of picking it (pros/cons in a phrase), recommended pick first with its reason.\n'
  )
  process.exit(2)
}

main()
