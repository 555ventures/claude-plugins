'use strict'
// lib/land.js — the one landing path, for a solo run and a fanout lane alike. In the worktree: the bookkeeping
// commit (`status: done`), the rebase onto trunk and the gate; then the merge into the main checkout with the
// configured strategy. The branch is a descendant of trunk when it merges, so it cannot conflict, and trunk
// gets exactly the tree the gate passed; any merge failure is backed out (`reset --merge`). No CLI.
//
// land(main, {wt, branch, spec?, id, config, message, inPlace?, tick?}) →
//   {landed: sha, kept?: reason}  merged, worktree removed (kept names why it stayed), queue ticked
//   {conflicts: [files]}          the rebase is left in progress in the worktree for its run to resolve
//   {red: tail, base}             the rebased tree is red: the run goes back to GATE on the new base

const st = require('./state')
const git = require('./git')
const host = require('./host')
const Q = require('./queue')
const pending = require('./pending')

const refusal = (message, exit = 2) => Object.assign(new Error(message), { exit })

function land(main, o) {
  const trunk = o.config.trunk
  let landed = null
  let kept = null
  if (!o.inPlace) {
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
  return { landed: landed || git.headSha(main), kept }
}

module.exports = { land }
