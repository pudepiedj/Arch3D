# Arch3D

Draw a floor plan in 2D and walk through it in 3D, in the browser (desktop or iPad).
Built with TypeScript, [three.js](https://threejs.org) and Vite.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # model unit tests
npm run build    # static site in dist/
```

After a `git pull`, run `npm install` again before `npm run dev`. If Vite says it can't resolve an import from one of the `src` files, a new package has been added that isn't installed yet.

## Using it

| Tool | What it does |
| --- | --- |
| **Select** (V) | Drag a **joint** to reshape every wall attached to it; drop it on another joint or wall to connect. Drag a **wall** to move it sideways (connected walls stretch). Drag a **door/window** along its wall, or onto another wall. Delete/Backspace removes the selection. |
| **Wall** (W) | Click to start, click for each corner. Snaps to joints, onto existing walls (making a T-junction), to 45° directions and to alignment with other joints. Type a length (e.g. `3.5`) and press Enter for an exact wall. Click the start point, double-click, or press Esc to finish. **Ortho** locks to 45° steps. |
| **Door** (D) / **Window** (N) | Click on a wall to place one. It fits itself between corners and other openings. |
| **Stair** (S) | Choose Straight, L-shape or U-shape, click where the bottom step goes, then click in the direction it climbs (snaps to right angles; Ortho forces them). The stair always rises to the next floor. |
| **Garage** (G) | Click on a wall to place a garage roller door (2.5 m wide; set any width in the panel). |
| **Pillar** (P) | Click to place a pillar (post). It rises to the underside of the roof above it, or to the wall height if there is none. Drag to move. |
| **Chimney** (C) | Click on the roof to place a chimney stack (on the floor whose roof it goes through). |
| **Solar** | Click on a roof slope to lay a solar panel array on it. |
| **Split** (X) | Click on a wall to add a joint, which is then selected so you can drag it (to make a bay, a nib or a step in the wall). |

**Copying doors and windows exactly:** select one and press **Copy** in the panel (Ctrl/⌘+C).
- **Paste** (toolbar button, or Ctrl/⌘+V) then click on walls to place identical copies: same type, width, height, sill, hinge and swing. A paste that would not fit at full size is refused, never shrunk. Press Esc when done.
- **Duplicate** (Ctrl/⌘+D) puts a copy right beside the selected one.
- **Match copied** resizes an existing door or window to the copied one.

**Garage roller doors:** drawn with horizontal slats running in guides, and a roller casing above the opening on the inside. In the panel:
- **Show open** shows the door rolled up (and lets you walk or drive through in walk mode). **Show shut** puts it back down.
- **Casing to other side** puts the guides and casing on the other face of the wall.

**Roofs on pillars (verandas, terraces, carports):** draw the roof with the Roof tool's **Add section** over the open area. It snaps to the house wall, and its edge there rests on the wall. Set its type and **Eaves height**, then press **Add pillars**. Pillars go at every corner not resting on a wall, and along open edges so that no span is longer than 3.5 m. Their outer faces line up with the roof edge. Pillars are square or round, can be resized, and are solid in walk mode.

**Chimneys:** a brick stack with a projecting cap and 1, 2 or 3 terracotta pots.
- It rises from just under the roof to a set height (60 cm by default) above the highest point of the roof it passes through, so it clears the ridge when it straddles it.
- Set the pots, width, depth and height above the roof in the panel, and rotate it by 90°. Drag it to move it; it re-fits to the roof wherever it goes.

**Solar panels:** click a roof slope with the **Solar** tool to lay a grid of panels on it.
- Panels are 1.72 × 1.13 m, sit 8 cm above the covering, and line up with the eaves.
- Set the rows (up the slope), columns (across) and portrait or landscape. The panel shows the panel count and a rough output at 400 W per panel.
- It warns you if any panels hang off the slope. On a flat roof the panels lie flat.
- Drag the array to move it, even onto another slope; it re-aligns to whichever slope it's on.

**Stairs:**
- The number of steps and their height come from the floor-to-floor height: the fewest steps that keep each one under 19 cm, e.g. 16 steps of 18.1 cm for 2.9 m.
- Select a stair to change its shape, which way an L or U turns, its width and tread depth, or to rotate it. Drag it to move it.
- The floor above automatically gets a matching stairwell. It is shown dashed on that floor's plan and cut out of its floor and the ceiling below.
- Handrails run up both sides at 90 cm, with balusters where a side is open (just the rail where it runs along a wall). Stairwells get a guard rail on their open edges, leaving the side where the stair arrives clear.
- In walk mode, walk onto a stair to climb it. You arrive on the next floor, and the plan follows you up and down.

**Roofs:** every floor is roofed wherever nothing is built above it, so a house can have several roofs:
- **Defaults:** the top floor gets a gable roof, and single-storey parts of lower floors (extensions) get flat roofs. Change a floor's default with **Floor & roof…**: Gable, Hipped, Flat or None, plus pitch and overhang.
- **Different roofs for different parts:** choose the **Roof** tool (R) and click a roof area to give it its own type, pitch and overhang. For example, one extension gabled and the others flat.
- **Gable ends where you want them:** with a roof selected, click any of its edges to switch it between a sloping eave and a vertical gable end. By default a roof is gabled at both ends of its main ridge. A roof against a taller wall runs its ridge into the wall, with its gable at the far end.
- **Cross gables:** for a window bay or projection that is part of the house, click the bay's front edge of the main roof to make it a gable. The bay gets its own ridge, meeting the main roof in valleys.
- **Extra roof sections:** Roof tool → **Add section**, then click the corners (they snap to walls). Use it for a porch canopy or a separate roof over part of the house. Sections can overlap other roofs, have their own gable ends, and can start lower (**Eaves height**).
- **On the plan:** eaves are dashed, gable ends solid, and ridges, hips and valleys dotted.
- **Seeing it in 3D:** in orbit view with **Cutaway** on, the roofs of the floor you are editing are lifted off with its ceiling. Turn Cutaway off to see the whole house.

**Floors:** the floor list at the top right of the plan switches between storeys (Page Up/Page Down also work).
- **+ Floor** adds a storey on top, starting with a copy of the outside walls of the floor below.
- The floor below shows faintly under the plan, and new walls snap to its joints, so walls line up from floor to floor.
- Click the current floor's name for its settings: name, floor-to-floor height and floor depth (the resulting ceiling height is shown), plus add or delete floors.
- In 3D, **Cutaway** hides the floors above the one you are editing and lifts off its ceiling, doll's-house style. Walk mode puts you on the floor you are editing, with ceilings overhead.
- Walls run the full floor-to-floor height by default. Changing a floor's height takes those walls with it.

The panel edits exact sizes: wall thickness, height and length; opening width, height, sill and distance from the corner; door hinge side and swing direction.

**3D:** *Orbit* to look around the model; *Walk* to explore at eye height. On desktop, click the view to capture the mouse and use W A S D (Shift to hurry). On touch screens, use your left thumb to move and your right thumb to look. You can walk through open doorways, but not through walls.

Plans save automatically in the browser. Use **File → Export/Import** to keep them as JSON files. Undo/redo: Ctrl/⌘+Z, Ctrl/⌘+Shift+Z.

## How it works (and why joints don't break)

A building (`building.ts`) is a stack of **levels**. Each level is an independent floor plan plus its floor-to-floor height and floor (slab) thickness. So everything below works per floor, and each floor is lifted to its elevation in 3D. Drawings saved before storeys existed load as a one-storey building.

Each floor plan is a **graph** (`src/model`):

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
- **Stairs** (`stairs.ts`) are stored as a start point, direction, width, tread depth and shape. Steps, landing, walking line and stairwell are computed from these and the storey height. Floors and ceilings have the stairwells cut out with a polygon-clipping library, since a stairwell may cross room boundaries.
- **Walking** (`walk.ts`, no rendering code, unit-tested) treats every floor (minus its stairwells) and every stair tread as a surface. The walker stands on the highest surface that is at most one step above their feet. Climbing a stair is just walking onto it, and walking off the top lands you on the next floor. Walls of the storey you are on, and steps too tall to step onto, block movement.
- **Roofs** (`roof.ts`): each floor's roof areas are its outline minus the outline of the floor above.
  - Each area, and each hand-drawn section, is roofed separately using the straight skeleton of its outline: every eave rises at the same pitch, and the slopes meet along hips, valleys and ridges. This uses the MIT-licensed `straight-skeleton` 1.1.0, pinned; newer versions wrap GPL code.
  - A gable end is an edge that doesn't slope. It is pushed far away before the skeleton is computed, so it has no influence. The roof is then trimmed back to the wall line, and the vertical profile left there becomes the gable wall. Edges against a taller wall work the same way, without a gable wall.
  - That library occasionally leaves part of a slope out, where two lined-up edges merge (the walls either side of a bay). The gap is filled with the slope whose plane matches the heights already known around it. Tests check that every roof covers its whole outline, with no tears.
- **Rooms** (`rooms.ts`)- **Rooms** (`rooms.ts`) are the enclosed faces of the wall graph. They give the floors and the net floor area labels.

## Not done yet

- Dormers and roof windows.
- Furniture.
- Textures and materials per room.
- Curved walls.
- Snapping openings to exact positions from a room's inside corner on either side.
