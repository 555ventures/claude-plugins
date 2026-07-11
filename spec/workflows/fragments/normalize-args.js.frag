function normalizeArgs(raw) {
  let v = raw
  // Unwrap up to 2 layers of JSON-string encoding (single = older harness; double = caller bug).
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    const s = v.trim()
    if (s === '[object Object]') {
      throw new Error('__WF_NAME__: args arrived String()-coerced to "[object Object]" — the ' +
        'caller stringified the object with String()/template interpolation instead of passing a ' +
        'real JSON object (or JSON.stringify). Pass `args` as a plain object in the Workflow call.')
    }
    try {
      v = JSON.parse(s)
    } catch (e) {
      throw new Error('__WF_NAME__: args was a string but not valid JSON (' + s.length +
        ' chars). This is structural corruption — free text / a non-scalar reached `args`, which ' +
        'must carry only paths, ids, enums, booleans, and command strings; prose lives on disk in ' +
        'the artifact the agents Read (spec / brief / rule docs). First 160 chars: ' +
        JSON.stringify(s.slice(0, 160)) + ' — parse error: ' + e.message)
    }
  }
  return v
}