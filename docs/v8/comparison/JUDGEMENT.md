# Blind judgement: specs 04, 05, 06

Scores 1-10. Evidence cites file and diff content.

## 04 rate-limiting

| Criterion | A | B | Evidence |
|---|---|---|---|
| Architecture | 9 | 8 | Both create `src/rate-limit.js` per D2-D4/D8/D9 and gate before routing in `server.js` per D6/D7. B additionally threads a per-request `headers` object into the final `writeHead` (`res.writeHead(out.status, headers)`), a reasonable refactor but beyond what D6 needs. |
| Consistency | 9 | 5 | A matches the File Plan exactly (3 files). B omits `tests/rate-limit.test.js` (File Plan: CREATE). |
| Clean code | 7 | 8 | A's `take` is dense one-liners with `r`, `b`, `k` names (`for (const [k, b] of buckets) if (...) buckets.delete(k)`). B uses blocks, `taken`, and skips the no-op refill on a fresh bucket via `else`. Both validate with the exact D9 messages. |
| Test quality | 9 | 1 | A: one test per AC-1..9, injected `now: () => t`, `listen(0)`, no sleeps; AC-5 covers both the unit per-IP case and the `X-Forwarded-For` app case. B ships no tests. |
| Spec adherence | 9 | 6 | A meets every AC. B's runtime behaviour would satisfy the ACs, but the Goal says "Done means all of that is proven with an injected clock" — nothing is proven. |
| Overall | 9 | 5 | |

**Verdict 04: A.**

## 05 todo-persistence

| Criterion | A | B | Evidence |
|---|---|---|---|
| Architecture | 8 | 8 | Both: `createStore({file, logger})` with `{file, read, write}` (D3), tmp+rename through the `fs` object (D4), `todos.attach`/`persist`/`reset` detaching (D7/D8), `headers` merged in `server.js` (D10). A copies the doc on write (`doc = {...doc, [section]: value}`); B mutates in place. A treats a non-ENOENT read error as corrupt (`raw = ''`), B rethrows it — spec D5 lists neither; A is closer to the "never take the API down" intent, B is louder. |
| Consistency | 4 | 9 | A ships no `tests/store.test.js` (File Plan: CREATE) and its only change to `tests/todos.test.js` is an unused `seedThree` helper. B creates `store.test.js` and extends `todos.test.js` as planned. |
| Clean code | 6 | 8 | A: dead `seedThree`; speculative `req.url || '/'`; the `raw = null` / `raw = ''` sentinel is a small puzzle. B: `bad()` helper, straight-line `list`; nit — `read:` is an arrow while `write` is a method. |
| Test quality | 1 | 9 | A: none. B: AC-1,2,3,4,5,9 all present; `mkdtempSync` + `listen(0)`; D4's call order observed with `mock.method(fs, 'writeFileSync'/'renameSync')` and `readdirSync` proving no `.tmp` remains; extra D7 test proves 404/400 write nothing (`spy.mock.callCount() === 0`); AC-5 loops the three corrupt contents and asserts the file is left untouched. |
| Spec adherence | 6 | 9 | A's behaviour meets the ACs but nothing is proven; AC-6/AC-7 queries have no test. B meets all nine. |
| Overall | 4 | 9 | |

**Verdict 05: B.**

## 06 api-keys

| Criterion | A | B | Evidence |
|---|---|---|---|
| Architecture | 8 | 8 | Both add the optional `guard` to `router.add`/`match` (D6), guard every `/todos` route plus `GET`/`DELETE /keys` with `requireKey` and `POST /keys` with `bootstrapGuard` (D5), and attach the one store to both `todos` and `keys` (D8). A keeps hashing inside `keys.findByKey`; B exports `hashOf`+`findByHash` so `auth.js` hashes as D4 literally says. Either is defensible. |
| Consistency | 4 | 9 | A ships no `tests/keys.test.js` (File Plan: CREATE) and no AC-6 test. B ships `keys.test.js`, AC-6 in `todos.test.js`, and propagates the breaking 401 into `rate-limit.test.js` and `store.test.js` via a header-injecting `fetch` wrapper — not in the File Plan but required for the suite to stay green. |
| Clean code | 5 | 8 | A's `tests/todos.test.js`: `loadKeys()` try/catch "so this file still loads before it exists" is speculative on main; `anon` is defined and never used; `seedThree` is still dead; a stray blank line; `beforeEach` boots a throwaway HTTP server per test just to mint a key. B mints with `keys.create({body:{name:'test'}})` directly. B nit: `bootstrapGuard` re-inlines `requireKey`'s ternary; the `keys.attach({read, write(){}})` stub in `store.test.js` is a documented hack to keep the file todos-only for AC-1's deep-equal. |
| Test quality | 2 | 9 | A: only the existing todos tests gain a header; AC-10 is retitled; AC-1,2,3,4,5,6,7,9 have no test. B: all of them, including the 204 empty body (`await del.text() === ''`), four 401 header variants with the header as the assertion message, and AC-9 proving the sha256 is on disk and the raw key is not (`!text.includes(key)`) before a restart succeeds with it. |
| Spec adherence | 6 | 9 | A's runtime meets the ACs and the breaking rule; the proof is absent. B meets all ten. |
| Overall | 4 | 9 | |

**Verdict 06: B.**

## Cross-pair pattern

The `src/` diffs converge almost line for line: same module names, same exports, same guard shape, same `persist()` idiom — the locked Decisions did their job on both sides, and neither side over-engineered. The entire gap is the test leg. The diff bases chain (`server.js` index hashes), so one side is internally consistent across all three specs: it shipped the implementation and nothing else — no `rate-limit.test.js`, no `store.test.js`, no `keys.test.js` — while leaving test scaffolding behind (`seedThree`, `anon`, `loadKeys`) that nothing calls. The other side shipped one deterministic test per AC every time (injected clock, `listen(0)`, `mkdtempSync`, `mock.method` on the `fs` object as D4 asked), added the extra D7 "400/404 write nothing" proof unprompted, and when spec 06 broke every `/todos` call it went back and fixed the two sibling test files the File Plan had not listed. As the next maintainer I would take the tested side without hesitation: the implementations are interchangeable, but only one of them tells me when I break it.
