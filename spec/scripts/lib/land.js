'use strict'
// lib/land.js — the one landing path, for a solo run and a fanout lane alike. In the worktree: the bookkeeping
// commit (`status: done`), the rebase onto trunk and the gate; then the merge into the main checkout with the
// configured strategy. The branch is a descendant of trunk when it merges, so it cannot conflict, and trunk
// gets exactly the tree the gate passed; any merge failure is backed out (`reset --merge`). A merge that leaves its
// spec's brief done (or superseded) with no open step outside specs ticks the brief's item too. No CLI.
//
// land(main, {wt, branch, spec?, id, config, message, inPlace?, tick?}) →
//   {landed: sha, kept?: reason, brief?}  merged, worktree removed (kept names why it stayed), queue ticked;
//                                 `brief` ({num, name, file, open, closed}) when the spec's brief is done or superseded
//                                 after the merge
//   {conflicts: [files]}          the rebase is left in progress in the worktree for its run to resolve
//   {red: tail, base}             the rebased tree is red: the run goes back to GATE on the new base

const st = require('./state')
const git = require('./git')
const host = require('./host')
const Q = require('./queue')
const pending = require('./pending')
const work = require('./work')

const refusal = (message, exit = 2) => Object.assign(new Error(message), { exit })

function land(main, o) {
  const trunk = o.config.trunk
  let landed = null
  let kept = null
  let num = null
  if (!o.inPlace) {
    if (o.spec) num = work.briefOf(st.readSpec(o.spec).frontmatter) // read before the merge removes the worktree
    const on = git.currentBranch(main)
    if (on !== trunk) throw refusal(`${main} is on ${on}, not ${trunk} — check out ${trunk} there, then re-run`)
    if (o.spec && st.readSpec(o.spec).frontmatter.status !== 'done') {
      st.writeStatus(o.spec, 'done')
      git.commitAll(o.wt, `chore(spec): ${o.id} done`, { noVerify: true })
    }
    // A trunk that moves while the gate runs is rebased onto again: what merges was gated. A third move refuses.
    for (let round = 0; !landed; round++) {
      const head = git.sh(['rev-parse', trunk], main)
      const r = git.rebaseOnto(o.wt, trunk)
      if (!r.ok) return { conflicts: r.conflicts }
      const g = host.gate(o.wt, o.config)
      if (g.status !== 0) return { red: g.tail, base: git.sh(['merge-base', trunk, 'HEAD'], o.wt) }
      const moved = git.sh(['rev-parse', trunk], main) !== head
      if (moved && round < 2) continue
      if (moved) throw refusal('trunk moved three times while landing — re-run')
      const m = git.mergeBack(main, o.branch, o.config.mergeStrategy, { message: o.message })
      if (!m.merged) throw refusal(`${o.branch} was not merged into ${trunk} (backed out, ${main} is clean): ${m.reason}`, 1)
      landed = m.sha
    }
    pending.unmarkLane(o.wt)
    const rm = git.worktreeRemove(main, o.wt, { deleteBranch: o.branch })
    if (!rm.removed) kept = rm.reason
  }
  if (o.tick) Q.tick(main, o.tick)
  return { landed: landed || git.headSha(main), kept, ...(num ? finishBrief(main, num) : {}) }
}

// The brief after its spec merged: a finished brief with no open step leaves the queue (its item ticked, or the fill
// drops it at this moment); one with open steps stays for the user. An unfinished brief returns nothing.
function finishBrief(main, num) {
  const b = work.readBriefs(main).find((x) => x.num === num)
  if (!b || !['done', 'superseded'].includes(b.status)) return {}
  const hit = b.open.length ? 0 : Q.tick(main, (i) => i.kind === 'brief' && work.normBrief(i.payload) === num)
  const closed = hit > 0 || (b.status === 'done' && !b.open.length)
  return { brief: { num, name: b.name, file: b.file, open: b.open, closed } }
}

// The words a run's 📌 line and warn, and fanout's batch pin and warn, say about that brief.
const briefClosed = (b) => `auto-closed brief ${b.num} (${b.name}) — its last spec merged and ${b.file}` +
  ' lists no open step (veto anytime)'
const briefOpen = (b) => `brief ${b.num} (${b.name}) has every spec done; ${b.open.length} step(s) outside specs` +
  ` still open in ${b.file} — tick them there, then /spec:queue done ${b.num}`

module.exports = { land, briefClosed, briefOpen }
