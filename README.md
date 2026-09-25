# Arch3D

Draw a floor plan in 2D and walk through it in 3D, in the browser (desktop or iPad).
Built with TypeScript, [three.js](https://threejs.org) and Vite.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # model unit tests
npm run build    # static site in dist/
```

## Using it

| Tool | What it does |
| --- | --- |
| **Select** (V) | Drag a **joint** to reshape every wall attached to it; drop it on another joint or wall to connect. Drag a **wall** to move it sideways (connected walls stretch). Drag a **door/window** along its wall, or onto another wall. Delete/Backspace removes the selection. |
| **Wall** (W) | Click to start, click for each corner. Snaps to joints, onto existing walls (making a T-junction), to 45° directions and to alignment with other joints. Type a length (e.g. `3.5`) and press Enter for an exact wall. Click the start point, double-click, or press Esc to finish. **Ortho** locks to 45° steps. |
| **Door** (D) / **Window** (N) | Click on a wall to place one. It fits itself between corners and other openings. |
| **Split** (X) | Click on a wall to add a joint, which is then selected so you can drag it (to make a bay, a nib or a step in the wall). |

**Copying doors and windows exactly:** select one and press **Copy** in the panel (Ctrl/⌘+C).
- **Paste** (toolbar button, or Ctrl/⌘+V) then click on walls to place identical copies: same type, width, height, sill, hinge and swing. A paste that would not fit at full size is refused, never shrunk. Press Esc when done.
- **Duplicate** (Ctrl/⌘+D) puts a copy right beside the selected one.
- **Match copied** resizes an existing door or window to the copied one.

The panel edits exact sizes: wall thickness, height and length; opening width, height, sill and distance from the corner; door hinge side and swing direction.

**3D:** *Orbit* to look around the model; *Walk* to explore at eye height. On desktop, click the view to capture the mouse and use W A S D (Shift to hurry). On touch screens, use your left thumb to move and your right thumb to look. You can walk through open doorways, but not through walls.

Plans save automatically in the browser. Use **File → Export/Import** to keep them as JSON files. Undo/redo: Ctrl/⌘+Z, Ctrl/⌘+Shift+Z.

## How it works (and why joints don't break)

The plan is a **graph** (`src/model`):

- **Nodes** are wall junctions. **Walls** are edges between two nodes, each with its own thickness and height.
- **Doors and windows are not holes.** Each is stored as a position along its wall (`offset`, `width`, `height`, `sill`).

Everything visible is *derived* from that data on every change, so there is no stored geometry to get out of sync.

- **Joints** (`joints.ts`): at every node the walls are sorted by angle, and the facing edges of each neighbouring pair are intersected. That gives:
  - exact mitres at L-corners,
  - clean T and X junctions,
  - correct joins between walls of different thicknesses at any angle.

  Very acute angles fall back to square ends.
- **Keeping the graph clean** (`plan.ts`): after every edit the plan is *planarised*.
  - Crossing walls are split where they cross.
  - A wall ending on another wall splits it, making a T-junction.
  - Overlapping walls are merged.
  - Deleting a T's stem *heals* the remaining straight wall back into one piece, carrying its openings across.
- **Openings** (`openings.ts`): an opening may only occupy the straight part of its wall between the mitred corners, and may never overlap another opening.
  - Every edit re-fits them: moving, shortening, splitting or merging walls slides, shrinks or (as a last resort) removes openings.
  - When a wall is split, each opening follows the half that holds its centre.
- **3D** (`src/three/build.ts`): no CSG boolean cuts.
  - Each wall's two faces are tiled around its openings.
  - Each opening gets reveals across the wall's thickness (jambs, head and sill).
  - The top is the mitred footprint.
  - Exposed ends are capped, including the part of a taller wall above a lower neighbour.
  - Result: geometry that is watertight at every joint, whatever you do to the plan.
- **Rooms** (`rooms.ts`) are the enclosed faces of the wall graph. They give the floors and the net floor area labels.

## Not done yet

- Multiple storeys and stairs.
- Roofs.
- Furniture.
- Ceilings.
- Textures and materials per room.
- Curved walls.
- Snapping openings to exact positions from a room's inside corner on either side.
