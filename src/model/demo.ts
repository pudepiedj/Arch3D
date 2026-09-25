import { addWall, createPlan, findWallInterior } from './plan';
import { placeOpening } from './openings';
import { DEFAULTS, type OpeningKind, type Plan } from './types';

/** A small single-storey house: four rooms, T-junctions, doors and windows. */
export function demoPlan(): Plan {
  const p = createPlan();
  const ext = { thickness: DEFAULTS.exteriorThickness, height: DEFAULTS.wallHeight };
  const int = { thickness: DEFAULTS.interiorThickness, height: DEFAULTS.wallHeight };

  const outline: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ];
  outline.forEach(([x, y], i) => {
    const [x2, y2] = outline[(i + 1) % outline.length];
    addWall(p, { x, y }, { x: x2, y: y2 }, ext);
  });
  addWall(p, { x: 6, y: 0 }, { x: 6, y: 8 }, int);
  addWall(p, { x: 0, y: 4.2 }, { x: 6, y: 4.2 }, int);
  addWall(p, { x: 6, y: 5 }, { x: 10, y: 5 }, int);

  const at = (x: number, y: number, kind: OpeningKind) => {
    const hit = findWallInterior(p, { x, y }, 0.01);
    if (hit) placeOpening(p, hit.wallId, hit.u, kind);
  };
  at(4.6, 0, 'door');
  at(2, 0, 'window');
  at(8, 0, 'window');
  at(10, 2.5, 'window');
  at(10, 6.5, 'window');
  at(0, 2, 'window');
  at(0, 6, 'window');
  at(3, 8, 'window');
  at(6, 2.5, 'door');
  at(2.5, 4.2, 'door');
  at(8, 5, 'door');
  return p;
}
