// Look inside saved drawings and report what is in them, and anything odd: numbers that
// aren't numbers, things far from the house, very long hedges or fences.
//
//   npm run check-drawing                         every drawing in ./drawings, newest first
//   npm run check-drawing -- drawings/x.json      just that one

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync('drawings')
      .filter((f) => f.endsWith('.json'))
      .map((f) => join('drawings', f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

for (const file of files) {
  console.log(`\n== ${file}  (${(statSync(file).size / 1024).toFixed(0)} KB, changed ${statSync(file).mtime.toLocaleString()})`);
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`   CAN'T READ IT: ${e.message}`);
    continue;
  }
  const b = data.building ?? data;
  if (!Array.isArray(b.levels)) {
    console.log('   Not an Arch3D drawing (no floors in it).');
    continue;
  }
  if (data.device || data.savedAt) console.log(`   from ${data.device ?? '?'} at ${data.savedAt ?? '?'}`);
  const problems = [];
  // Every number in it that isn't a proper number, or is enormous.
  const walk = (v, path) => {
    if (v === null) problems.push(`${path} is empty (null)`);
    else if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 10000)) problems.push(`${path} = ${v}`);
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(b, 'drawing');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  };
  for (const l of b.levels) {
    const n = (o) => Object.keys(o ?? {}).length;
    console.log(`   ${l.name}: ${n(l.walls)} walls, ${n(l.openings)} doors/windows, ${n(l.furniture)} furniture, ${n(l.patios)} patios, ${n(l.trees)} trees, ${n(l.hedges)} hedges/fences, ${n(l.roofSections)} roof sections`);
    Object.values(l.nodes ?? {}).forEach(take);
    for (const h of Object.values(l.hedges ?? {})) {
      h.points.forEach(take);
      const L = len(h.points);
      console.log(`      ${h.kind} ${h.id}: ${h.points.length} points, ${L.toFixed(1)} m long, ${h.height} m high, ${h.width} m thick`);
      if (L > 300) problems.push(`${h.kind} ${h.id} is ${L.toFixed(0)} m long`);
    }
    for (const f of Object.values(l.furniture ?? {})) {
      take(f);
      if (/gate/.test(f.kind)) console.log(`      ${f.kind} ${f.id}: ${f.width} m wide at ${f.x?.toFixed?.(2)}, ${f.y?.toFixed?.(2)}${f.open ? ', open' : ''}`);
    }
    for (const p of Object.values(l.patios ?? {})) p.points.forEach(take);
    for (const t of Object.values(l.trees ?? {})) take(t);
  }
  for (const d of Object.values(b.drains?.nodes ?? {})) take(d);
  if (Number.isFinite(x0)) {
    console.log(`   Everything lies within ${(x1 - x0).toFixed(1)} m x ${(y1 - y0).toFixed(1)} m`);
    if (x1 - x0 > 500 || y1 - y0 > 500) problems.push(`the drawing spreads over ${(x1 - x0).toFixed(0)} x ${(y1 - y0).toFixed(0)} m: something is far from the house`);
  }
  console.log(problems.length ? `   PROBLEMS:\n     - ${problems.slice(0, 30).join('\n     - ')}` : '   Nothing odd found.');
}
