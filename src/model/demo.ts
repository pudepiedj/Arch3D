import { addLevelOnTop, createBuilding } from './building';
import { addWall, findWallInterior } from './plan';
import { placeOpening } from './openings';
import { DEFAULTS, type Building, type OpeningKind, type Plan } from './types';

/** A small two-storey house: four rooms downstairs, three up, doors and windows. */
export function demoBuilding(): Building {
  const b = createBuilding();
  const ground = b.levels[0];
  const H = ground.height;
  const ext = { thickness: DEFAULTS.exteriorThickness, height: H };
  const int = { thickness: DEFAULTS.interiorThickness, height: H };

  const outline: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ];
  outline.forEach(([x, y], i) => {
    const [x2, y2] = outline[(i + 1) % outline.length];
    addWall(ground, { x, y }, { x: x2, y: y2 }, ext);
  });
  addWall(ground, { x: 6, y: 0 }, { x: 6, y: 8 }, int);
  addWall(ground, { x: 0, y: 4.2 }, { x: 6, y: 4.2 }, int);
  addWall(ground, { x: 6, y: 5 }, { x: 10, y: 5 }, int);

  const at = (p: Plan, x: number, y: number, kind: OpeningKind) => {
    const hit = findWallInterior(p, { x, y }, 0.01);
    if (hit) placeOpening(p, hit.wallId, hit.u, kind);
  };
  at(ground, 4.6, 0, 'door');
  at(ground, 2, 0, 'window');
  at(ground, 8, 0, 'window');
  at(ground, 10, 2.5, 'window');
  at(ground, 10, 6.5, 'window');
  at(ground, 0, 2, 'window');
  at(ground, 0, 6, 'window');
  at(ground, 3, 8, 'window');
  at(ground, 6, 2.5, 'door');
  at(ground, 2.5, 4.2, 'door');
  at(ground, 8, 5, 'door');

  const first = addLevelOnTop(b, true);
  addWall(first, { x: 5, y: 0 }, { x: 5, y: 8 }, int);
  addWall(first, { x: 5, y: 5 }, { x: 10, y: 5 }, int);
  at(first, 2.5, 0, 'window');
  at(first, 7.5, 0, 'window');
  at(first, 10, 2.5, 'window');
  at(first, 0, 4, 'window');
  at(first, 2.5, 8, 'window');
  at(first, 8.5, 8, 'window');
  at(first, 5, 2.5, 'door');
  at(first, 5, 6.5, 'door');
  at(first, 7, 5, 'door');
  return b;
}
