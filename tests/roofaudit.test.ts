// An audit of roofs over many outlines: every kind of roof over every shape, alone and
// with a floor added over part of it, must cover its whole outline with slopes at the
// pitch set, never dip below the eaves, and close every gable end.

import { expect, it } from 'vitest';
import { addLevelOnTop, createBuilding } from '../src/model/building';
import { addWall } from '../src/model/plan';
import { levelRoofs, planeOf } from '../src/model/roof';
import { polygonArea } from '../src/model/geom';
import { unionAll } from '../src/model/clip';
import type { Level, Roof } from '../src/model/types';

type P = [number, number];
function loop(l: Level, pts: P[]) {
  pts.forEach(([x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; addWall(l, { x, y }, { x: x2, y: y2 }, { thickness: 0.3, height: l.height }); });
}
function line(l: Level, a: P, b: P) { addWall(l, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, { thickness: 0.3, height: l.height }); }

// Ground-floor shapes, with the box of the main house (where the first floor goes).
const shapes: Record<string, { draw: (l: Level) => void; main: { x0: number; y0: number; x1: number; y1: number } }> = {
  'side ext': { draw: (l) => { loop(l, [[0, 0], [14, 0], [14, 6], [0, 6]]); line(l, [10, 0], [10, 6]); }, main: { x0: -1, y0: -1, x1: 10.4, y1: 7 } },
  'rear ext full width': { draw: (l) => { loop(l, [[0, 0], [10, 0], [10, 10], [0, 10]]); line(l, [0, 6], [10, 6]); }, main: { x0: -1, y0: -1, x1: 11, y1: 6.4 } },
  'rear ext narrow': { draw: (l) => { loop(l, [[0, 0], [10, 0], [10, 6], [7, 6], [7, 10], [3, 10], [3, 6], [0, 6]]); line(l, [3, 6], [7, 6]); }, main: { x0: -1, y0: -1, x1: 11, y1: 6.4 } },
  'L wing': { draw: (l) => { loop(l, [[0, 0], [10, 0], [10, 10], [6, 10], [6, 6], [0, 6]]); line(l, [6, 6], [10, 6]); }, main: { x0: -1, y0: -1, x1: 11, y1: 6.4 } },
  'wrap-around': { draw: (l) => { loop(l, [[0, 0], [14, 0], [14, 10], [0, 10]]); line(l, [10, 0], [10, 6]); line(l, [0, 6], [10, 6]); }, main: { x0: -1, y0: -1, x1: 10.4, y1: 6.4 } },
  'T stem': { draw: (l) => { loop(l, [[0, 0], [12, 0], [12, 5], [8, 5], [8, 11], [4, 11], [4, 5], [0, 5]]); line(l, [4, 5], [8, 5]); }, main: { x0: -1, y0: -1, x1: 13, y1: 5.4 } },
  'U back': { draw: (l) => { loop(l, [[0, 0], [12, 0], [12, 10], [8, 10], [8, 5], [4, 5], [4, 10], [0, 10]]); line(l, [0, 5], [4, 5]); line(l, [8, 5], [12, 5]); }, main: { x0: -1, y0: -1, x1: 13, y1: 5.4 } },
  'both sides': { draw: (l) => { loop(l, [[0, 0], [18, 0], [18, 6], [0, 6]]); line(l, [4, 0], [4, 6]); line(l, [14, 0], [14, 6]); }, main: { x0: 3.6, y0: -1, x1: 14.4, y1: 7 } },
  'three sides': { draw: (l) => { loop(l, [[0, 0], [16, 0], [16, 10], [0, 10]]); line(l, [3, 0], [3, 6]); line(l, [13, 0], [13, 6]); line(l, [3, 6], [13, 6]); }, main: { x0: 2.6, y0: -1, x1: 13.4, y1: 6.4 } },
  'skewed ext': { draw: (l) => { loop(l, [[0, 0], [10, 0], [14, 3], [14, 8], [10, 6], [0, 6]]); line(l, [10, 0], [10, 6]); }, main: { x0: -1, y0: -1, x1: 10.4, y1: 7 } },
  'front porch': { draw: (l) => { loop(l, [[0, 0], [10, 0], [10, 8], [0, 8]]); line(l, [0, 2], [10, 2]); }, main: { x0: -1, y0: 1.6, x1: 11, y1: 9 } },
};
const roofs: Record<string, Roof> = {
  gable: { kind: 'gable', pitch: 35, overhang: 0.3 },
  'gable 20 flush': { kind: 'gable', pitch: 20, overhang: 0 },
  'hip 45 wide': { kind: 'hip', pitch: 45, overhang: 0.6 },
  hip: { kind: 'hip', pitch: 35, overhang: 0.3 },
  lean: { kind: 'lean', pitch: 20, overhang: 0.3 },
};

it('roofs come out whole over all these outlines', () => {
  const out: string[] = [];
  for (const [sname, sh] of Object.entries(shapes)) {
    for (const [rname, roof] of Object.entries(roofs)) {
      for (const upper of ['none', 'part']) {
        const b = createBuilding();
        const g = b.levels[0];
        sh.draw(g);
        g.roof = { ...roof };
        if (upper === 'part') addLevelOnTop(b, true, g, sh.main);
        const key = `${sname} | ${rname} | first floor: ${upper}`;
        const rs = levelRoofs(b, g);
        const problems: string[] = [];
        if (!rs.length) problems.push('NO ROOF');
        const tan = Math.tan((roof.pitch * Math.PI) / 180);
        for (const r of rs) {
          const geo = r.geometry;
          if (!geo) { problems.push(`${r.id}: geometry null`); continue; }
          const slopes = geo.faces.filter((f) => f.kind === 'slope');
          const covered = unionAll(slopes.map((f) => f.pts.map((p) => ({ x: p.x, y: p.y })))).reduce((s, sh2) => s + Math.abs(polygonArea(sh2[0])) - sh2.slice(1).reduce((t, h) => t + Math.abs(polygonArea(h)), 0), 0);
          const want = Math.abs(polygonArea(geo.outline));
          if (Math.abs(covered - want) > want * 0.002) problems.push(`${r.id}: covers ${covered.toFixed(1)} of ${want.toFixed(1)} m²`);
          for (const f of slopes) {
            const pl = planeOf(f.pts);
            if (!pl) continue;
            const c = f.pts[0];
            const gx = pl({ x: c.x + 1, y: c.y }) - pl(c);
            const gy = pl({ x: c.x, y: c.y + 1 }) - pl(c);
            const grad = Math.hypot(gx, gy);
            if (Math.abs(grad - tan) > 0.02 * tan) problems.push(`${r.id}: a slope at ${((Math.atan(grad) * 180) / Math.PI).toFixed(1)}°`);
          }
          const zs = slopes.flatMap((f) => f.pts.map((p) => p.z));
          const zEave = g.height - roof.overhang * tan;
          if (Math.min(...zs) < zEave - 0.01) problems.push(`${r.id}: below the eaves (${Math.min(...zs).toFixed(2)})`);
          const gables = r.roles.filter((x) => x === 'gable').length;
          const gfaces = geo.faces.filter((f) => f.kind === 'gable').length;
          if (gfaces < gables) problems.push(`${r.id}: ${gables} gable ends but ${gfaces} gable walls`);
        }
        out.push(`${problems.length ? 'FAIL' : 'ok  '} ${key}  [${rs.map((r) => r.roles.join(',')).join(' / ')}]${problems.length ? '\n      ' + problems.join('\n      ') : ''}`);
      }
    }
  }
  expect(out.filter((l) => l.startsWith('FAIL'))).toEqual([]);
});
