# Arch3D

Draw a floor plan in 2D and walk through it in 3D, in the browser (desktop or iPad).
Built with TypeScript, [three.js](https://threejs.org) and Vite.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # model unit tests
npm run build    # static site in dist/
```

**On an iPad (or phone):** keep `npm run dev` running on your computer. As well as the Local address, it prints a **Network:** address such as `http://192.168.1.23:5173/`. With the iPad on the same Wi-Fi, type that address into Safari. Tip: Share → **Add to Home Screen** gives it an app icon.
- Each browser keeps its own working copy. To move a drawing between computer and iPad, use **File → Save to computer…** on one and **File → Open from computer…** on the other.
  - Saves go into the `drawings` folder of this project on the computer running `npm run dev`. That folder is not committed to git.
  - Every save is a new, dated file: nothing is ever overwritten. The list shows which device each one came from.
  - Opening a drawing replaces what is on screen, but **Undo** brings it back.
  - Anyone on your home Wi-Fi who opens the app could also see the saved drawings.
- **Export/Import JSON** still work for keeping or sending a copy elsewhere.
- If the iPad can't connect, the computer's firewall may be asking whether to allow incoming connections to `node`. Allow it.

After a `git pull`, run `npm install` again before `npm run dev`. If Vite says it can't resolve an import from one of the `src` files, a new package has been added that isn't installed yet.

## Using it

| Tool | What it does |
| --- | --- |
| **Select** (V) | Drag a **joint** to reshape every wall attached to it; drop it on another joint or wall to connect. Drag a **wall** to move it sideways (connected walls stretch). Drag a **door/window** along its wall, or onto another wall. Delete/Backspace removes the selection. What stands on the floor is picked before what is on the roof above it (solar panels, chimneys, rooflights); **click again** in the same place to pick the next thing underneath. |
| **Wall** (W) | Click to start, click for each corner. Snaps to joints, onto existing walls (making a T-junction), to 45° directions and to alignment with other joints. Type a length (e.g. `3.5`) and press Enter for an exact wall. Click the start point, double-click, or press Esc to finish. **Ortho** locks to 45° steps. |
| **Door** (D) / **Window** (N) | Click on a wall to place one. It fits itself between corners and other openings. |
| **Stair** (S) | Choose Straight, L-shape or U-shape, click where the bottom step goes, then click in the direction it climbs (snaps to right angles; Ortho forces them). The stair always rises to the next floor. |
| **Glass door** (K) | Click on a wall to place floor-to-ceiling glass doors: French doors, sliding doors or bi-folds (choose in the panel). |
| **Garage** (G) | Click on a wall to place a garage roller door (2.5 m wide; set any width in the panel). |
| **Pillar** (P) | Click to place a pillar (post). It rises to the underside of the roof above it, or to the wall height if there is none. Drag to move. |
| **Chimney** (C) | Click on the roof to place a chimney stack (on the floor whose roof it goes through). |
| **Solar** | Click on a roof slope to lay a solar panel array on it. |
| **Rooflight** | Click on a roof. A flat roof gets a rooflight box; a sloping roof gets a window lying in the slope. |
| **Patio** (T) | Choose Paving, Decking or Gravel, then click the corners of the area. Click the first corner, double-click or press Enter to finish. |
| **Tree** (E) | Choose Broadleaf or Conifer, then click to plant one. Drag the trunk to move it; set the height and crown spread in the panel. |
| **Furniture** (F) | Opens the catalogue. Pick a piece, then click to place it: near a wall it turns its back to the wall and sits tight against it. [ and ] turn it in 15° steps. Esc when done. |
| **Split** (X) | Click on a wall to add a joint, which is then selected so you can drag it (to make a bay, a nib or a step in the wall). |

**Furniture:** about 50 pieces in nine groups:
- **Music:** grand piano, upright piano, music stand.
- **Living:** sofas, armchair, coffee table, TV, bookcase, lamp, rug.
- **Heating:** fireplace with mantelpiece and a lit fire (stone, white, marble or oak surround), wood-burning stove on a slate hearth with its flue to the ceiling, and panel or column radiators. Like everything else, they back onto the nearest wall; radiators are fixed 15 cm above the floor.
- **Dining:** table with 6 chairs, round table with 4 chairs, chair, sideboard.
- **Office:** desk with computer and chair, desk with two monitors, corner desk with computer, office desk, swivel office chair, filing cabinet. The computer sets have a monitor (or two, turned in), keyboard and mouse on the desk and a PC tower under it.
- **Bedroom:** beds, bedside table, wardrobe, chest of drawers, desk.
- **Kitchen:** base, sink, hob and oven, tall units, fridge, island.
- **Bathroom:** bath, shower, WC, basin.
- **Garden:** table and chairs, lounger, bench, parasol, barbecue, planter, and a 2 m timber pergola (four posts, beams, cross-rafters, battens for climbers, knee braces), with or without a climber growing over it. You can walk under a pergola in walk mode.

Select a piece to change its finish, width, depth and height, or to turn, duplicate or delete it. **Ctrl/⌘+D** puts a copy alongside, which is handy for a run of kitchen units. Pieces stand on patios and decks at the right height, and in walk mode you walk round them (except rugs).

**The grand piano** is modelled properly: the curved case with its straight bass side and bentside, rim, soundboard, gilt iron frame and strings, 88 keys, music desk, lyre and pedals, and the stool. The **Size** list has Blüthner's models (11, 10, 6, 4, 2 and 1, from 154 to 280 cm long). The widths are approximate, so check yours with a tape. The lid can be shown open on its stick or closed, the stool on or off, and the finish black, walnut, mahogany or white.

**Room dimensions:** the **Dimensions** button (or M) writes every room's inside measurements along its walls, face to face of the plaster line. The setting is remembered on each device.

**Doors shown shut:** select a door and press **Show shut**, or **Shut all doors** for the whole floor. Shut doors stay shut in the orbit view. In walk mode each one swings open as you reach it and closes behind you.

**Copying doors and windows exactly:** select one and press **Copy** in the panel (Ctrl/⌘+C).
- **Paste** (toolbar button, or Ctrl/⌘+V) then click on walls to place identical copies: same type, width, height, sill, hinge and swing. A paste that would not fit at full size is refused, never shrunk. Press Esc when done.
- **Duplicate** (Ctrl/⌘+D) puts a copy right beside the selected one.
- **Match copied** resizes an existing door or window to the copied one.

**Glass doors:** full-height glazing in slim anthracite frames, 2.4 m wide and 2.4 m high to start with.
- **Style:** **French doors** (two leaves swinging from the jambs), **Sliding doors** (two panels on two tracks) or **Bi-fold doors** (leaves of about 80 cm).
- **Show open** swings the leaves out, slides the moving panel behind the fixed one, or folds the bi-folds into a stack at one end. You can walk through when they are shown open.
- **Full height** takes them up to the ceiling. **Open to other side**, **Slide other way** and **Fold to other end** change the direction.

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

**Rooflights:**
- **On a flat roof:** a raised box (kerb) with a sloping top holding a row of opening roof windows. The ceiling and roof below are opened up into a lined light well, so from the room you look up into the box and out through the glass.
- **On a sloping roof:** the windows lie in the slope.
- **Panel settings:** the number of windows, window width and length, box slope and kerb height, and rotating the box by 90°.
- **Show open** tilts the windows out at the bottom, **Blinds down** draws the blinds, and **Solar motor** adds or removes the little solar strip on each frame.

**Sun and shadows (the Sun button):** puts the sun where it really is for a date, a time and the house's location, with shadows.
- **Date** slider covering the whole year, with buttons for the equinoxes and solstices and **Now**. **Time** slider in 5-minute steps, in this device's clock time (so summer time is included). **Play the day** runs from sunrise to sunset.
- The panel shows the sun's height and compass direction, and sunrise and sunset.
- **Location and orientation:** latitude and longitude (from any online map, or **Use this device's location**, which works only over https or on the computer itself), and the compass direction the top of the plan faces. The plan shows a north arrow. These are saved with the drawing.
- Floors hidden by Cutaway still cast their shadows during a sun study. Broad-leaved trees are in leaf from May to October, turn in autumn and are bare in winter.
- With the Sun button off, a fixed light is used that shows the model well at any hour.

**Patios, decks and gravel:**
- Draw them right up to the house; they are cut back to the outside face of the walls.
- **Paving:** 600 mm slabs in slightly varied sandstone shades, 4 cm above the ground.
- **Decking:** grooved timber boards with staggered joints on a frame, 15 cm up (one step) with a timber fascia round the edge.
- **Gravel:** a gravel scatter.
- **Panel settings:** the surface, the height, the slab size or board width, and which way the courses or boards run (**Turn 90°**). It also shows the area.
- Drag a patio to move it. In walk mode you step up onto it. A deck higher than a step (over 35 cm) is solid, so it needs steps to get onto it.

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
  - A corner less than 4 cm off the straight line between its neighbours is ignored for the roof (the overhang hides the difference). Otherwise a joint slightly out of line, e.g. where rooms were added later, would put a kink in the ridge.
  - A gable end is an edge that doesn't slope. It is pushed far away before the skeleton is computed, so it has no influence. The roof is then trimmed back to the wall line, and the vertical profile left there becomes the gable wall. Edges against a taller wall work the same way, without a gable wall.
  - That library occasionally leaves part of a slope out, where two lined-up edges merge (the walls either side of a bay). The gap is filled with the slope whose plane matches the heights already known around it. Tests check that every roof covers its whole outline, with no tears.
- **Rooms** (`rooms.ts`) are the enclosed faces of the wall graph. They give the floors and the net floor area labels.

## Not done yet

- Dormers.
- A sun-hours map: how many hours of direct sun each part of a patio gets on a given day.
- Textures and materials per room.
- Curved walls.
- Snapping openings to exact positions from a room's inside corner on either side.
