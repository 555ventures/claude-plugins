// generated from fragments/validate-groups.js.frag — edit the fragment, then `npm run build:workflows`
// (there is still no require() in the Workflow sandbox; codegen replaces manual copying, not the
// need for one shared source). WHY this exists: guard depth must equal iteration depth. `groups` has
// the contract [[{id,agentType,files}]] — an array of WAVES, each wave an array of BATCHES — and a
// *model* hand-builds it from prose in the command .md, so it is an UNTRUSTED request body with NO
// StructuredOutput schema behind it. A top-level Array.isArray check creates false confidence about
// the nested iteration: the model sometimes emits an array-of-batch-objects ([{…}]) or a stray {},
// and the inner `for (const b of group)` then throws a cryptic "{} is not iterable" at ~6ms with 0
// work done. So ASSERT the full nested structure here, ONCE, before first use, with an indexed,
// actionable message — and never COERCE: auto-wrapping would silently mask the producer bug and
// can't safely infer serial(more waves)-vs-parallel(fatter wave) intent. Failing loud at the trust
// boundary IS the feedback loop that fixes the fallible producer; a re-invoke is near-free. Any
// future [[…]]-or-deeper model-authored arg needs its own validateGroups-style sibling.
function isBatch(b) {
  return b !== null && typeof b === 'object' && !Array.isArray(b) &&
    typeof b.id === 'string' && Array.isArray(b.files)
}
function typeOfArg(v) {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
}
function validateGroups(groups, wfName) {
  if (!Array.isArray(groups)) {
    throw new Error(wfName + ': `groups` is not an array (got ' + typeOfArg(groups) + ') — shape ' +
      'is [[{id,agentType,files}]]: an array of waves, each wave an array of batches')
  }
  groups.forEach((wave, i) => {
    if (!Array.isArray(wave)) {
      throw new Error(wfName + ': groups[' + i + '] is not a wave (got ' + typeOfArg(wave) + '); ' +
        'shape is [[{id,agentType,files}]] — even one batch is [[{…}]], never [{…}], never {id,…}')
    }
    wave.forEach((b, j) => {
      if (!isBatch(b)) {
        const p = JSON.stringify(b)
        throw new Error(wfName + ': groups[' + i + '][' + j + '] is not a batch (need an object ' +
          'with a string `id` and an array `files`, got ' +
          (p && p.length > 160 ? p.slice(0, 160) + '…' : p) + ') — shape is [[{id,agentType,files}]]')
      }
    })
  })
  return groups
}