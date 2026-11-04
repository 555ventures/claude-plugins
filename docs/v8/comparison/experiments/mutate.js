#!/usr/bin/env node
// Dependency-free mutation tester. Never touches git.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const root = path.resolve(opt('root', '.'));
const testCmd = opt('test', 'npm test');
const timeout = Number(opt('timeout', 20000));
const asJson = a.includes('--json');
const CAP = 40;
const files = opt('files')
  ? opt('files').split(',').map((s) => s.trim()).filter(Boolean)
  : fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js')).sort().map((f) => 'src/' + f);

// Seeded PRNG (mulberry32) so sampling is reproducible.
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

// Blank out comments and string/template literals (length-preserving).
function mask(s) {
  let o = '', i = 0;
  const blank = (t) => t.replace(/[^\n]/g, ' ');
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    let j = -1;
    if (c === '/' && n === '/') { j = s.indexOf('\n', i); if (j < 0) j = s.length; }
    else if (c === '/' && n === '*') { j = s.indexOf('*/', i + 2); j = j < 0 ? s.length : j + 2; }
    else if (c === '"' || c === "'" || c === '`') {
      j = i + 1;
      while (j < s.length && s[j] !== c && (c === '`' || s[j] !== '\n')) j += s[j] === '\\' ? 2 : 1;
      j++;
    }
    if (j < 0) { o += c; i++; } else { o += blank(s.slice(i, j)); i = j; }
  }
  return o;
}
const matchClose = (m, i, open, close) => { let d = 0; for (; i < m.length; i++) { if (m[i] === open) d++; else if (m[i] === close && --d === 0) return i; } return -1; };
const matchOpenBack = (m, i) => { let d = 0; for (; i >= 0; i--) { if (m[i] === ')') d++; else if (m[i] === '(' && --d === 0) return i; } return -1; };

// Id of the innermost enclosing function body for position p ('' for top level).
function funcOf(m, p) {
  const stack = [];
  for (let i = 0; i < p; i++) {
    if (m[i] === '{') {
      const before = m.slice(0, i);
      let fn = /=>\s*$/.test(before);
      if (!fn && /\)\s*$/.test(before)) {
        const o = matchOpenBack(m, before.trimEnd().length - 1);
        fn = o >= 0 && !/\b(if|for|while|switch|catch|with)\s*$/.test(m.slice(0, o));
      }
      if (!fn && /\bfunction\b[^{;]*$/.test(before)) fn = true;
      stack.push(fn ? i : -1);
    } else if (m[i] === '}') stack.pop();
  }
  for (let k = stack.length - 1; k >= 0; k--) if (stack[k] >= 0) return stack[k];
  return -1;
}

const SIMPLE = [
  ['===→!==', /===/g, '!=='], ['!==→===', /!==/g, '==='],
  ['==→!=', /(?<![=!<>])==(?!=)/g, '!='], ['!=→==', /!=(?!=)/g, '=='],
  ['<→<=', /(?<![<=])<(?![<=])/g, '<='], ['<=→<', /(?<![<])<=(?!=)/g, '<'],
  ['>→>=', /(?<![=>-])>(?![>=])/g, '>='], ['>=→>', /(?<!>)>=(?!=)/g, '>'],
  ['&&→||', /&&/g, '||'], ['||→&&', /\|\|/g, '&&'],
  ['+→-', /(?<=[\w$]\s*)\+(?![+=])(?=\s*[\w$])/g, '-'], ['-→+', /(?<=[\w$]\s*)-(?![-=>])(?=\s*[\w$])/g, '+'],
  ['true→false', /\btrue\b/g, 'false'], ['false→true', /\bfalse\b/g, 'true'],
];

function generate(src) {
  const m = mask(src), out = [];
  for (const [op, re, rep] of SIMPLE) for (const x of m.matchAll(re)) out.push({ op, start: x.index, end: x.index + x[0].length, rep });
  for (const x of m.matchAll(/(?<![\w.$])\d+(\.\d+)?(?![\w.])/g))
    out.push({ op: 'num→n+1', start: x.index, end: x.index + x[0].length, rep: String(Number(x[0]) + 1) });
  for (const x of m.matchAll(/\bthrow\b[^;]*;/g)) out.push({ op: 'delete-throw', start: x.index, end: x.index + x[0].length, rep: ';' });
  for (const x of m.matchAll(/\bif\s*\(/g)) {
    const o = x.index + x[0].length - 1, c = matchClose(m, o, '(', ')');
    if (c > 0) out.push({ op: 'negate-if', start: o, end: c + 1, rep: '(!(' + src.slice(o + 1, c) + '))' });
  }
  // return <expr> → return undefined; at most one per function body (picked by seeded RNG).
  const byFn = new Map(), r = rng(7);
  for (const x of m.matchAll(/\breturn\b(?=[ \t]+[^\s;}])/g)) {
    let d = 0, e = x.index;
    for (; e < m.length; e++) { if ('([{'.includes(m[e])) d++; else if (')]}'.includes(m[e])) { if (--d < 0) break; } else if (m[e] === ';' && d === 0) break; }
    const k = funcOf(m, x.index);
    if (!byFn.has(k)) byFn.set(k, []);
    byFn.get(k).push({ op: 'return→undefined', start: x.index, end: e, rep: 'return undefined' });
  }
  for (const list of byFn.values()) out.push(list[Math.floor(r() * list.length)]);
  return out;
}

const run = (cmd) => spawnSync('sh', ['-c', cmd], { cwd: root, env: process.env, timeout, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
const bakDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-'));
const restores = new Map();
const restoreAll = () => { for (const [f, s] of restores) fs.writeFileSync(f, s); };
process.on('exit', restoreAll);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

const report = { root, files: {}, survivors: [] };
const t0 = Date.now();
try {
  for (const rel of files) {
    const abs = path.join(root, rel), orig = fs.readFileSync(abs, 'utf8');
    fs.writeFileSync(path.join(bakDir, rel.replace(/\//g, '_')), orig);
    restores.set(abs, orig);
    const all = generate(orig).filter((x) => x.rep !== orig.slice(x.start, x.end));
    const picked = (all.length > CAP ? shuffle(all.slice().sort((p, q) => p.start - q.start || p.op.localeCompare(q.op)), rng(42)).slice(0, CAP) : all).sort((p, q) => p.start - q.start);
    let killed = 0, total = 0;
    for (const mu of picked) {
      const mutated = orig.slice(0, mu.start) + mu.rep + orig.slice(mu.end);
      try {
        fs.writeFileSync(abs, mutated);
        if (spawnSync(process.execPath, ['--check', abs], { stdio: 'ignore' }).status !== 0) continue; // invalid syntax: not a real mutant
        total++;
        const res = run(testCmd);
        if (res.status !== 0 || res.error) killed++;
        else {
          const line = orig.slice(0, mu.start).split('\n').length;
          report.survivors.push({ file: rel, line, op: mu.op, mutated: mutated.split('\n')[line - 1].trim() });
        }
      } finally { fs.writeFileSync(abs, orig); }
    }
    report.files[rel] = { killed, total, score: total ? killed / total : null };
  }
} finally { restoreAll(); fs.rmSync(bakDir, { recursive: true, force: true }); }

const K = Object.values(report.files).reduce((s, f) => s + f.killed, 0), T = Object.values(report.files).reduce((s, f) => s + f.total, 0);
report.overall = { killed: K, total: T, score: T ? K / T : null };
report.seconds = Math.round((Date.now() - t0) / 100) / 10;
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  const pct = (x) => (x == null ? 'n/a' : (x * 100).toFixed(1) + '%');
  for (const [f, v] of Object.entries(report.files)) console.log(`${f}: ${v.killed}/${v.total} killed, score ${pct(v.score)}`);
  console.log(`overall: ${K}/${T}, score ${pct(report.overall.score)} (${report.seconds}s)`);
  if (report.survivors.length) console.log('\nsurvivors:');
  for (const s of report.survivors) console.log(`  ${s.file}:${s.line} [${s.op}] ${s.mutated}`);
}
