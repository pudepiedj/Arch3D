import { addLevelOnTop, createBuilding } from './building';
import { addPillar, pillarsForSection } from './pillars';
import { addChimney, addRooflight, addSolarArray } from './roofitems';
import { addStair } from './stairs';
import { addWall, deleteWall, findWallInterior } from './plan';
import { placeOpening } from './openings';
import { DEFAULTS, type Building, type Level, type OpeningKind, type Plan } from './types';

/**
 * A two-storey house showing the main features: a gabled main roof with a cross gable
 * over a two-storey window bay, a flat-roofed garage with a roller door at the side, a
 * gabled garden room and a terrace roof on pillars at the back, a chimney, solar panels,
 * a stair, doors and windows.
 */
export function demoBuilding(): Building {
  const b = createBuilding();
  const ground = b.levels[0];
  const H = ground.height;
  const ext = { thickness: DEFAULTS.exteriorThickness, height: H };
  const int = { thickness: DEFAULTS.interiorThickness, height: H };
  const loop = (level: Level, pts: [number, number][], closed = true) => {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      addWall(level, { x, y }, { x: x2, y: y2 }, ext);
    }
  };
  const at = (p: Plan, x: number, y: number, kind: OpeningKind) => {
    const hit = findWallInterior(p, { x, y }, 0.01);
    if (hit) placeOpening(p, hit.wallId, hit.u, kind);
  };
  /** A window bay on the front: its three walls, with the house wall across it removed. */
  const bay = (level: Level) => {
    loop(level, [
      [1.2, 0],
      [1.2, -1],
      [3.6, -1],
      [3.6, 0],
    ], false);
    const across = Object.values(level.walls).find((w) => {
      const a = level.nodes[w.a];
      const c = level.nodes[w.b];
      const near = (u: number, v: number) => Math.abs(u - v) < 1e-6;
      return near(a.y, 0) && near(c.y, 0) && near(Math.min(a.x, c.x), 1.2) && near(Math.max(a.x, c.x), 3.6);
    });
    if (across) deleteWall(level, across.id);
    at(level, 2.4, -1, 'window');
  };

  // Ground floor: four rooms, a bay, and two single-storey extensions.
  loop(ground, [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]);
  addWall(ground, { x: 6, y: 0 }, { x: 6, y: 8 }, int);
  addWall(ground, { x: 0, y: 4.2 }, { x: 6, y: 4.2 }, int);
  addWall(ground, { x: 6, y: 5 }, { x: 10, y: 5 }, int);
  bay(ground);
  // Garage off the kitchen: flat roof (the default for single-storey parts), roller door.
  loop(ground, [
    [10, 1],
    [13, 1],
    [13, 4.5],
    [10, 4.5],
  ], false);
  // Garden room behind the bathroom: gabled, its ridge running into the house wall.
  loop(ground, [
    [6.5, 8],
    [6.5, 10.5],
    [9.5, 10.5],
    [9.5, 8],
  ], false);
  ground.roofAreas = [{ x: 8, y: 9.25, roof: { kind: 'gable', pitch: 35, overhang: 0.3 } }];

  at(ground, 4.6, 0, 'door');
  at(ground, 8, 0, 'window');
  at(ground, 0, 2, 'window');
  at(ground, 0, 6, 'window');
  at(ground, 6, 2.5, 'door');
  at(ground, 2.5, 4.2, 'door');
  at(ground, 8, 5, 'door');
  at(ground, 10, 2.75, 'door');
  at(ground, 13, 2.75, 'garage');
  at(ground, 11.5, 1, 'window');
  at(ground, 10, 6.5, 'window');
  at(ground, 8, 8, 'door');
  at(ground, 8, 10.5, 'window');
  at(ground, 6.5, 9.25, 'window');

  // A covered terrace behind the bedroom: a flat roof on pillars, against the house wall.
  ground.roofSections = {
    t: {
      id: 't',
      points: [
        { x: 0, y: 8 },
        { x: 5.8, y: 8 },
        { x: 5.8, y: 10.8 },
        { x: 0, y: 10.8 },
      ],
      roof: { kind: 'flat', pitch: 35, overhang: 0.1 },
      base: 2.6,
    },
  };
  for (const p of pillarsForSection(ground, 't')) addPillar(ground, p);

  // A rooflight box on the garage's flat roof: three windows with blinds and solar motors.
  const box = addRooflight(ground, { x: 11.5, y: 2.75 });
  Object.assign(box, { count: 3, angle: Math.PI, blinds: true, width: 0.55, length: 0.98 });

  // A straight stair along the back wall of the bedroom, rising towards the left.
  addStair(ground, 4.9, 7.4, Math.PI, 'straight');

  // First floor: the main rectangle and the bay, three rooms.
  const first = addLevelOnTop(b, false);
  loop(first, [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]);
  bay(first);
  addWall(first, { x: 5, y: 0 }, { x: 5, y: 8 }, int);
  addWall(first, { x: 5, y: 5 }, { x: 10, y: 5 }, int);
  at(first, 7.5, 0, 'window');
  at(first, 10, 2.5, 'window');
  at(first, 0, 4, 'window');
  at(first, 2.5, 8, 'window');
  at(first, 8.5, 8, 'window');
  at(first, 5, 2.5, 'door');
  at(first, 5, 6.5, 'door');
  at(first, 7, 5, 'door');
  // Main roof: gabled, with a cross gable over the bay (its front edge set to a gable end).
  first.roof = { kind: 'gable', pitch: 35, overhang: 0.3, edges: [{ x: 2.4, y: -1.15, type: 'gable' }] };
  // A chimney stack astride the ridge, and solar panels on the back slope.
  const chimney = addChimney(first, { x: 8.6, y: 4 });
  chimney.pots = 2;
  addSolarArray(first, { x: 4.6, y: 6.3 });
  return b;
}
