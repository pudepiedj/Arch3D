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
- **Automatic backup:** while the computer is reachable, each device's drawing is backed up to it a few seconds after every change (one file per device, `drawings/autosave-<device>.json`, listed in **Open from computer…** as *Automatic backup*). The light next to **File** shows *Backed up 14:32*, *Backing up…* or *Not connected*.
- **If the computer stops answering** (`npm run dev` stopped, Wi-Fi dropped), a red banner says so at once. Your changes are then kept only in that browser: start `npm run dev` again and the app backs up straight away (the page reloads itself), or press **Download a copy**. **Save to computer…** checks first and says plainly **NOT SAVED** rather than seeming to work, and the browser asks before you close or reload a page whose changes the computer hasn't got.
- `npm run dev` always uses port 5173. If something else has it, it stops with a message rather than moving to another port, because the browser keeps its working copy per address, and on a new port your work would seem to have vanished.
- **Export/Import JSON** save and open a file on the device you are using, for keeping or sending a copy elsewhere. Chrome and Edge ask where to put it; Safari always uses `Downloads` (a web page can't choose the folder there). **Save to computer** is the one that goes into this project's `drawings` folder, and its message shows the full path.
- If the iPad can't connect, the computer's firewall may be asking whether to allow incoming connections to `node`. Allow it.

**If a drawing won't open, or breaks the 3D view:** `npm run check-drawing` lists what is in every drawing in the `drawings` folder (newest first) and anything odd: numbers that aren't numbers, very long hedges or fences, things far from the house. `npm run check-drawing -- drawings/autosave-iPad.json` checks just one.

After a `git pull`, run `npm install` again before `npm run dev`. If Vite says it can't resolve an import from one of the `src` files, a new package has been added that isn't installed yet.

## Using it

**On an iPad (no keyboard):** while you draw something a point at a time (walls, a patio, a hedge or fence, a roof section, a drain run, a stair), a bar at the bottom of the plan has **Done** (finish it), **Back** (take back the last point) and **Cancel** (stop; walls and drain pipes already laid stay, and Undo takes them back). A **double tap** with a finger or the Pencil finishes too, like a double-click. To leave a tool, tap **Select**. In the panels, type a number and tap the keyboard's **done** key or anywhere else (the plan, the 3D view) and it is applied; or use the **−** and **+** beside each number. Every panel with fields has an **Apply** button (it says **Applied ✓** when it has), next to **Delete**.

**The toolbar:** **Select** is always there; the other tools are grouped in drop-down menus: **Build** (wall, split, stretch, stair, pillar, paint materials, move to its own floor, copy area, paste area), **Openings** (door, window, glass door, garage door), **Roof** (roofs, rooflight, solar panels, chimney) and **Garden** (patio, tree, drain), then **Furniture**. A menu shows the name of the tool in use from it, highlighted. The keyboard shortcuts are listed in the menus and work as before. **View** has the on/off settings: dimensions, Underground and Cutaway. On a narrow screen (an iPad upright) the toolbar runs onto a second row rather than off the side.

| Tool | What it does |
| --- | --- |
| **Select** (V) | Drag a **joint** to reshape every wall attached to it; drop it on another joint or wall to connect. Drag a **wall** to move it sideways (connected walls stretch). Drag a **door/window** along its wall, or onto another wall. Delete/Backspace removes the selection. What stands on the floor is picked before what is on the roof above it (solar panels, chimneys, rooflights); **click again** in the same place to pick the next thing underneath. |
| **Wall** (W) | Click to start, click for each corner. Snaps to joints, onto existing walls (making a T-junction), to 45° directions and to alignment with other joints. Type a length (e.g. `3.5`) and press Enter for an exact wall. Click the start point, double-click, or press Esc to finish. **Ortho** locks to 45° steps. |
| **Door** (D) / **Window** (N) | Click on a wall to place one. It fits itself between corners and other openings. |
| **Stair** (S) | Choose Straight, L-shape or U-shape, click where the bottom step goes, then click in the direction it climbs (snaps to right angles; Ortho forces them). **Spiral**: a metal spiral stair round a central steel column; click its centre, then the direction of the first tread (it turns 30° a tread; **Turn** sets which way). It rises to the next floor unless you set **Rises** in its panel: less for steps up to a plinth or terrace, more for an outside stair up to an upper door. **Style**: solid with timber treads, **stone steps**, or **stone treads cantilevered from a wall** (set one side against the wall; nothing underneath). **Handrail**: timber with balusters, **wrought iron** (slim black balusters, a lower rail and rings), **glass panels**, or none. Along a wall, of whichever floor, a rail is just a handrail. A stair that climbs more than one storey (Rises set high: a spiral up through two floors into a roof room) cuts its hole in every floor and ceiling it passes, with a balustrade round each and the way out at the top. A stair whose foot is on a raised patio or plinth (or down in a sunken one) starts on its top, and **Rises** is measured from there. |
| **Glass door** (K) | Click on a wall to place floor-to-ceiling glass doors: French doors, sliding doors or bi-folds (choose in the panel). |
| **Garage** (G) | Click on a wall to place a garage roller door (2.5 m wide; set any width in the panel). |
| **Opening (no door)** | Click on a wall to make an opening through it with nothing in it: a doorway (1.2 × 2.2 m to start with) you can walk through, or, with a **Sill height**, an unglazed window. **Head** in its panel makes it **square** or a **round arch** (the height is to the top of the arch; the wall fills in above the curve, and the arch's underside follows it through the wall's thickness). Its reveals take the wall's outside finish. |
| **Pillar** (P) | Click to place a pillar (post). It rises to the underside of the roof above it, or to the wall height if there is none. Drag to move. |
| **Chimney** (C) | Click on the roof to place a chimney stack (on the floor whose roof it goes through). |
| **Solar** | Click on a roof slope to lay a solar panel array on it. |
| **Rooflight** | Click on a roof. A flat roof gets a rooflight box; a sloping roof gets a window lying in the slope. |
| **Patio** (T) | Choose Paving, Decking, Gravel, **Lawn** (mown grass with stripes: set their width and direction in the panel; a lawn stops at the patios and paths laid in it) or **Rubber** (interlocking 500 mm rubber tiles, for a garage, gym or play area), then click the corners of the area. Click the first corner, double-click or press Enter to finish. Outside, it stops at the house; drawn inside a room (click the room's corners), it is a floor covering and stops at the walls round it. |
| | **Height** in a patio's panel makes it a **plinth** or terrace when it is more than a step high (its sides are then in the outside wall finish: stone for a stone house), or a **sunken area** when it is below 0: the ground is dug away, with retaining walls round it (again in the outside finish, but not along the house), e.g. an alley below a house's lower-ground windows, or a lightwell. |
| | A building on its own floor **stands on a plinth** drawn under it on the first floor (the garden's), whichever was drawn first: its floor level is the top of the plinth (a Floor level set by hand isn't added to it). If the building is drawn on the garden's floor itself, the plinth's panel offers **Stand the building on it**, which moves the building to a floor of its own on top. |
| | **Pool** (a surface for the Patio tool): a swimming pool dug into the ground, 1.5 m deep to start with (set **Depth** in its panel), lined with blue mosaic, with water a little below the edge and a stone coping round it; the panel gives the volume of water. **Railing** in any patio's panel puts glass panels, wrought iron or a timber balustrade round it: round a pool at the outside of the coping, round a raised terrace on its edge, round a balcony on its open edges only (none along the house). To decide yourself, the panel lists each side (numbered on the plan while it's selected): **Auto**, **Railing** (a full railing, even against a wall) or **None**. A railing leaves a gap where a stair arrives at its height. |
| | **Pool cover**: in a pool's panel, **Cover** puts a slatted blue cover on a roller with stainless stands across one of its short ends (**Roller** picks which): **Rolled up** (a fat drum on the coping) or **Over the pool** (slats floating on the water, a thin roll left on the drum). **Awning**: any patio's panel can add one (cream, blue-and-white stripes, terracotta, green or grey). It is fixed in a cassette to the wall along the patio's longest side against the house, slopes down from **Awning at the wall** to **Awning at the front**, with posts at the front corners, a front bar and a valance; with no side against a wall it stands on posts at every corner. Reshape the patio to change what it covers. |
| | **Landing** (a surface for the Patio tool): a boarded floor with a balustrade (wrought iron to start with; glass, timber or none in its panel) round its open edges: none along walls, and a gap wherever a stair steps on or off it, top or bottom. For a gallery over a double-height space, the head of a stair, or a half landing (set its **Height**). |
| | **Balcony** (a surface for the Patio tool): a 15 cm stone slab cantilevered from the wall on steel joists, with nothing under it and a wrought-iron railing. Draw it on an upper floor, outside the wall (it stops at the wall's outer face). To reach it from the garden, draw an outside stair against the wall and set its **Rises** to the height of that floor. While drawing a patio, balcony or landing (or dragging a selected one's corners), points snap to the corners and ends of stairs on any floor, so it meets the stair exactly. The steel joists under a balcony each run out only as far as the slab in front of them, so an L-shaped balcony has short ones under its narrow arm. |
| **Tree** (E) | Choose from the **Plant** list: oak, ash, beech, hazel, silver birch, rowan, Lombardy poplar, Scots pine, a general broad-leaved tree or conifer, or a **bush** with its leaves down to the ground. Click to plant one. Drag it to move it; set its height and spread in the panel. |
| **Hedge / fence** (H) | Choose from the **Line** list: privet, hawthorn or beech hedge, close-board fence, a **garden wall** (stone to start with, 30 cm thick, with a coping along the top; any height up to 8 m, and any wall finish in its panel), or a **drainage ditch**. Click along its line; click its start to take it all the way round, and double-click, Enter or Esc to finish. Drag to move it; drag a corner to reshape it, a small circle to add a corner, and double-click a corner to remove it. Set its height (a ditch's depth) and thickness (a ditch's width) in the panel. |
| **Furniture** (F) | Opens the catalogue. Pick a piece, then click to place it: near a wall it turns its back to the wall and sits tight against it. [ and ] turn it in 15° steps. Esc when done. |
| **Stretch** (Q) | Drag a box round the part of the house to move; the joints and furniture inside are marked and the panel lists what will move. Then drag inside it (straight across or up and down; Shift for any direction), or type how far to move in the panel. Everything inside moves together (joints, doors and windows, stairs, furniture, pillars, roof items, trees, patio and roof corners, drains) and walls crossing the box's edge stretch or shrink, on every floor at once or just this one. The box then follows what it moved, so typing −0.8 twice moves 1.6 m in all. After an Undo or another edit, draw the box again. Esc clears it. |
| **Copy area…** | Drag a box round part of the plan (the garage, say) to copy it: walls, doors and windows, stairs, pillars, patios, roof sections, trees, hedges, furniture and roof fittings on this floor. Walls crossing the box are cut off at its edge, keeping the doors and windows wholly inside; patios, hedges and roof sections come only if they lie wholly inside. The copy is kept on this device, so it can go into another drawing: **File → New empty building**, then paste. |
| **Paste area** (⌘V) | A ghost of the copy follows the pointer (at its middle); click to put it down, on this floor or another, or in another drawing. Joints landing on existing joints join up, and a wall already there isn't doubled. Pasted into an empty floor it brings the floor height and roof it was copied with. One Undo takes the whole paste back. ⌘V pastes whichever was copied last, an area or a door/window's type. |
| **Drain** (J) | On the ground floor: choose Foul or Surface water, then click to lay a pipe run. Each new point is set 1 in 60 deeper than the last, so the pipe falls; click an existing chamber or pipe to join it. Double-click, Enter or Esc finishes the run. |
| **Split** (X) | Click on a wall to add a joint, which is then selected so you can drag it (to make a bay, a nib or a step in the wall). |

**Furniture:** about 50 pieces in ten groups:
- **Music:** grand piano, upright piano, music stand.
- **Living:** sofas, armchair, coffee table, TV, bookcase, lamp, rug (in black it is a plain mat, and doubles as a rubber mat).
- **Heating:** fireplace with mantelpiece and a lit fire (stone, white, marble or oak surround), wood-burning stove on a slate hearth with its flue to the ceiling, panel or column radiators, and a floor-standing **oil-fired boiler** (90 cm high, 45 wide, 60 deep, with its flue out of the top; white, grey or green). Like everything else, they back onto the nearest wall; radiators are fixed 15 cm above the floor.
- **Dining:** table with 6 chairs, round table with 4 chairs, chair, sideboard.
- **Office:** desk with computer and chair, desk with two monitors, corner desk with computer, office desk, swivel office chair, filing cabinet. The computer sets have a monitor (or two, turned in), keyboard and mouse on the desk and a PC tower under it.
- **Bedroom:** beds, bedside table, wardrobe, chest of drawers, desk.
- **Kitchen:** base, sink, hob and oven, tall units, fridge, island.
- **Bathroom:** bath, shower, WC, basin.
- **Garage:** boltless steel **shelving** (angle uprights and plain steel shelves, 1.8 m × 90 × 45 cm to start with; grey, galvanised, black or blue).
- **Garden:** table and chairs, lounger, bench, a single garden chair (slatted, to match the bench; teak, oak, grey or white), parasol, barbecue, planter, and a 2 m timber pergola (four posts, beams, cross-rafters, battens for climbers, knee braces), with or without a climber growing over it. You can walk under a pergola in walk mode.

Select a piece to change its finish, width, depth and height, or to turn, duplicate or delete it. **Ctrl/⌘+D** puts a copy alongside, which is handy for a run of kitchen units. Pieces stand on patios and decks at the right height, and in walk mode you walk round them (except rugs).

**The grand piano** is modelled properly: the curved case with its straight bass side and bentside, rim, soundboard, gilt iron frame and strings, 88 keys, music desk, lyre and pedals, and the stool. The **Size** list has Blüthner's models (11, 10, 6, 4, 2 and 1, from 154 to 280 cm long). The widths are approximate, so check yours with a tape. The lid can be shown open on its stick or closed, the stool on or off, and the finish black, walnut, mahogany or white.

**Trees and bushes:** each species has its own shape, bark and colours through the year, following the Sun study's date: oak (a short massive trunk, broad low crown, russet in autumn), ash (pale bark, a tall airy crown that lets light through, yellow), beech (smooth grey bark, a dense dome, copper), hazel (many stems from the ground), silver birch (white trunk, narrow light crown), rowan (small and upright, red berries and red leaves in autumn), Lombardy poplar (a tall narrow column from near the ground, yellow in autumn) and Scots pine (evergreen: a tall bare trunk, orange towards the top, under a flat-topped crown). Deciduous ones are bare from late November to April. Any tree can **lean**: set how far (up to 30°) and which way it leans towards (N, NE, E…) in its panel; the whole tree tips over from its foot, the plan shows its crown hanging off to that side, and its shadow follows. A bush has leaves right down to the ground and is a thicket of twigs in winter; you can't walk through one.

**Sizes are remembered:** change the height and spread of a tree (or the size of a hedge, or of a piece of furniture) and the next one of that kind you place comes out the same size. **Reset size** (between Apply and Delete) puts it back to the usual size and stops remembering.

**Ditches:** an open drainage ditch is dug into the ground in 3D: grassy banks sloping down to a muddy bottom with water standing in it. Surface-water drains can run out into one: lay a drain run to a point in the ditch and it becomes an **Outfall into a ditch** (a headwall in the bank), set 30 cm above the ditch bottom; or choose that fitting in the panel. Soakaways are still there to choose instead.

**Oil tank and clothes dryer** (Furniture → Garden): a horizontal **oil tank** on its stand and concrete base (set its length and diameter; the panel gives its capacity), in green, black or steel. A **rotary clothes dryer**, open or folded (**Fold it up / Open it out**), with its lines empty or with washing hung out (**Washing** in its panel): with the Sun study on, you can see when the lines are in sun and where its shadow falls through the day.

**Gates** (Furniture → Garden): a **five-bar gate** (3 m to start; any width, and wider than about 4 m it becomes a pair meeting in the middle), a **picket path gate** (1 m wide, 1 m high) and a **close-board path gate** as tall as the fence. Place one on a hedge or fence and it sits square in its line and cuts its own gap; drag it along the line to move it. In the panel: **Open gate / Shut gate**, **Hang on other post**, and turn it 180° to make it open to the other side. The plan shows its posts, leaf and swing. In walk mode a shut gate stops you and an open one lets you through.

**Hedges and fences:** privet stays green all year; hawthorn is in leaf from May to October and bare and twiggy in winter; beech is green in summer, copper in autumn, and keeps its russet leaves through the winter, following the Sun study's date like the trees. The fence is close-board: posts at most 1.8 m apart, a gravel board and featheredge boards. They cast shadows in a sun study, show on printed plans with the trees, and in walk mode you can't go through them.

**Drains:** pipe runs below ground, drawn on the ground floor with flow arrows: brown for foul, blue for surface water.
- Select a point to set its **fitting** (inspection chamber, gully, rainwater downpipe, soakaway, sewer connection, **sewage treatment plant**, or just a bend or junction) and its **invert depth**: the depth of the inside bottom of the pipe below the ground.
- Select a pipe to set what it carries and its bore (100, 150 or 225 mm), and to read its length and **fall** ("1 in 60"). It warns if a pipe runs uphill (backfall), is level, or is flatter or steeper than the usual guidance for house drains. Check real work against Building Regulations Part H and your building control officer. **Reverse flow** swaps its direction.
- Inspection chambers can be **square or round** (set in the panel).
- A **sewage treatment plant** is a round or rectangular tank (about 2 m³ to start with: set its diameter or width and depth, and the panel gives the volume), with three access lids for pump-out and desludging and the blower kiosk beside it. Draw the foul drain into it and the treated outflow on to a soakaway, drainage field or ditch.
- **View → Underground (drains)** makes the ground, floors and patios see-through, shows the pipes, chambers and soakaway at their depths, and lets the 3D view go below the surface. Chamber covers, gully gratings and lids show only then, lying on top of whatever is there (a patio, a lawn, gravel) so a patio never hides them; downpipes, headwalls and a treatment plant's blower, which stand above ground, show all the time.
- The demo house has a foul run from the soil stack and kitchen gully to the sewer under the road, and rainwater from two downpipes to a soakaway in the garden.

**Dimensions:** **View → Dimensions** (or M) writes every room's inside measurements along its walls, face to face of the plaster line; the length of each straight run of hedge, fence or ditch, in green along its outside; and each tree's height, boxed in red (↕ 8.0 m) so it can't be taken for a length on the plan. The setting is remembered on each device.

**Doors shown shut:** select a door and press **Show shut**, or **Shut all doors** for the whole floor. Shut doors stay shut in the orbit view. In walk mode each one swings open as you reach it and closes behind you.

**Copying doors and windows exactly:** select one and press **Copy** in the panel (Ctrl/⌘+C).
- **Paste** (toolbar button, or Ctrl/⌘+V) then click on walls to place identical copies: same type, width, height, sill, hinge and swing. A paste that would not fit at full size is refused, never shrunk. Press Esc when done.
- **Duplicate** (Ctrl/⌘+D) puts a copy right beside the selected one.
- **Match copied** resizes an existing door or window to the copied one.

**Glass doors:** full-height glazing in slim anthracite frames, 2.4 m wide and 2.4 m high to start with. **Frame** in the panel changes the colour (white, anthracite grey, black or oak) for glass doors and windows alike, so the glass doors can match the windows beside them.
- **Style:** **French doors** (two leaves swinging from the jambs), **Sliding doors** (two panels on two tracks) or **Bi-fold doors** (leaves of about 80 cm).
- **Show open** swings the leaves out, slides the moving panel behind the fixed one, or folds the bi-folds into a stack at one end. You can walk through when they are shown open.
- **Full height** takes them up to the ceiling. **Open to other side**, **Slide other way** and **Fold to other end** change the direction.

**Garage roller doors:** drawn with horizontal slats running in guides, and a roller casing above the opening on the inside. In the panel:
- **Show open** shows the door rolled up (and lets you walk or drive through in walk mode). **Show shut** puts it back down.
- **Casing to other side** puts the guides and casing on the other face of the wall.

**Vaulted ceilings:** select a sloping roof and set **Ceiling** to **Vaulted (open to the roof)**. The rooms under it lose their flat ceiling and are open up to the plastered underside of the slopes, with the gable walls rising to the ridge. Windows lying in a slope are cut right through it, so from the room you look up through them to the sky.

**Glazed gables:** set a sloping roof's **Gable ends** to **Glazed (triangular window)**. Each of its gable triangles above the wall plate is filled with glass in a slim anthracite frame, with upright glazing bars about every 80 cm, and the gable wall behind is cut away. Combined with a vaulted ceiling, the room gets light through the top of the gable.

**Roof sections against the house:** an edge of a hand-drawn roof rests on the house (no overhang, no slope) wherever the house is beyond it. It doesn't need to be drawn exactly on a wall's centre line: on its outside face, a little inside it, or across a wall shared with an extension all work. A section drawn mostly outside the house (a canopy, lean-to or veranda) is cut back to the house's outside face wherever it was drawn over it, so a roof running past a corner overhangs only where it is clear of the house.

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
- **Lining up:** while you place or drag a rooflight (or a solar array or chimney), it snaps into line, across or up and down the plan, with the other roof items on that floor and with the centres of its doors and windows. A dashed blue guide, with a ring on the other item, shows what it has lined up with, so a row of roof windows sits at one height up the slope, or a roof window sits directly over the window below. The guides stay on while the item is selected. The panel also has its exact **X** and **Y**: give two items the same number to line them up.
- **Show open** tilts the windows out at the bottom, **Blinds down** draws the blinds, and **Solar motor** adds or removes the little solar strip on each frame.

**Sun and shadows (the Sun button):** puts the sun where it really is for a date, a time and the house's location, with shadows.
- **Date** slider covering the whole year, with buttons for the equinoxes and solstices and **Now**. **Time** slider in 5-minute steps, in this device's clock time (so summer time is included). **Play the day** runs from sunrise to sunset. **Play the year** runs through the year at the time of day set (midday if it was dark), about three weeks a second: the sun climbing and falling, the shadows shortening and lengthening, and the trees coming into leaf, turning and going bare.
- The panel shows the sun's height and compass direction, and sunrise and sunset.
- **Location and orientation:** latitude and longitude (from any online map, or **Use this device's location**, which works only over https or on the computer itself), and the compass direction the top of the plan faces. The plan shows a north arrow. These are saved with the drawing.
- Trees and bushes planted close to the house grow round it: wherever a crown or branch would pass through a wall or the roof, it is pushed back to just outside it, so it grows flat against the wall and spreads only above the roof.
- Floors hidden by Cutaway still cast their shadows during a sun study. Broad-leaved trees are in leaf from May to October, turn in autumn and are bare in winter.
- **Now** makes the sun live: it follows the clock, minute by minute, until you choose a date or time yourself (the Now button stays highlighted while it is live).
- The **Sun** button opens and closes the panel; the sun stays where you set it (date and time) until you change it, and each device remembers it across reloads. **Plain light** in the panel switches back to a fixed light that shows the model well at any hour (and **Real sun** back again).

**Patios, decks and gravel:**
- Draw them right up to the house; they are cut back to the outside face of the walls.
- **Paving:** 600 mm slabs in slightly varied sandstone shades, 4 cm above the ground.
- **Decking:** grooved timber boards with staggered joints on a frame, 15 cm up (one step) with a timber fascia round the edge.
- **Gravel:** a gravel scatter.
- **Panel settings:** the surface, the height, the slab size or board width, and which way the courses or boards run (**Turn 90°**). It also shows the area.
- **Reshape** a selected patio by its corners: drag a white square to move that corner (it snaps like a wall joint), drag a small circle in the middle of an edge to add a corner there, and double-click a corner to remove it (a patio keeps at least three). If furniture stands on the patio, click again to pick the patio underneath.
- Drag a patio anywhere else to move it. In walk mode you step up onto it. A deck higher than a step (over 35 cm) is solid, so it needs steps to get onto it.

**Stairs:**
- The number of steps and their height come from the floor-to-floor height: the fewest steps that keep each one under 19 cm, e.g. 16 steps of 18.1 cm for 2.9 m.
- Select a stair to change its shape, which way an L or U turns, its width and tread depth, or to rotate it. Drag it to move it.
- The floor above automatically gets a matching stairwell. It is shown dashed on that floor's plan and cut out of its floor and the ceiling below.
- Handrails run up both sides at 90 cm, with balusters where a side is open (just the rail where it runs along a wall). Stairwells get a guard rail on their open edges, leaving the side where the stair arrives clear.
- In walk mode, walk onto a stair to climb it. You arrive on the next floor, and the plan follows you up and down.

**Roofs:** every floor is roofed wherever nothing is built above it, so a house can have several roofs:
- **Defaults:** the top floor gets a gable roof, and single-storey parts of lower floors (extensions) get flat roofs. Change a floor's default with **Floor & roof…**: Gable, Hipped, Flat or None, plus pitch and overhang.
- **Parapets:** every flat roof has a 25 cm parapet round its open edges: the outside walls carried up past the roof, rendered like them, 20 cm thick with a coping on top, and no overhang. Edges against a taller wall don't get one, and where flat roofs meet or overlap (the house's flat roof carried on over pillars by a roof section, say) they count as one roof: the parapet goes round the outside of the lot and stops where they join. To take the parapet off any single edge, select the roof with the Roof tool and click that edge (click again to put it back); on the plan an edge with a parapet shows a second dashed line just inside it. Set its height in the roof's panel (**Parapet**); 0 removes it, and the roof overhangs its walls as before (the **Overhang** field comes back).
- **Different roofs for different parts:** choose the **Roof** tool (R) and click a roof area to give it its own type, pitch and overhang. For example, one extension gabled and the others flat.
- **Gable ends where you want them:** with a roof selected, click any of its edges to switch it between a sloping eave and a vertical gable end. By default a roof is gabled at both ends of its main ridge. A roof against a taller wall runs its ridge into the wall, with its gable at the far end.
- **Cross gables:** for a window bay or projection that is part of the house, click the bay's front edge of the main roof to make it a gable. The bay gets its own ridge, meeting the main roof in valleys.
- **Extra roof sections:** Roof tool → **Add section**, then click the corners (they snap to walls). Use it for a porch canopy or a separate roof over part of the house. Sections can overlap other roofs, have their own gable ends, and can start lower (**Eaves height**). Select a section to reshape it the same way as a patio: drag its corners, drag an edge's middle circle to add a corner, double-click a corner to remove it.
- **On the plan:** eaves are dashed, gable ends solid, and ridges, hips and valleys dotted.
- **Seeing it in 3D:** in orbit view with **Cutaway** on, the roofs of the floor you are editing are lifted off with its ceiling. With it off (the default) you see the whole house.

**Floors:** the floor list at the top right of the plan switches between storeys (Page Up/Page Down also work).
- **+ Floor** adds a storey on top of the one you are editing, starting with a copy of its outside walls. **Add floor below** (in the floor's settings) adds one underneath: a basement, or the lower floor of a house half in the ground.
- The floor below shows faintly under the plan, and new walls snap to its joints, so walls line up from floor to floor.
- Click the current floor's name for its settings: name, floor-to-floor height and floor depth (the resulting ceiling height is shown), plus add or delete floors.
- **Floor level**: a floor can sit at its own height above the ground, and the floors on top of it follow: **0.6** for a house on a plinth, **−1.5** for one half below ground. So one drawing can hold two houses at different levels (a small one on a plinth beside a large one half sunk into the ground); each is its own stack, with its own roofs, and the list shows every floor from the highest down. The ground is cut away under any floor below the ground, so a basement shows. The first floor in the list is always at the ground: keep the garden (patios, hedges, walls, trees, drains) on it. If both buildings are drawn on the same floor, **Build → Move to its own floor…** gives one of them its own: drag a box round the whole building, name it, and its walls, doors and windows, stairs, furniture and roofs move to a new floor at the same height (the garden stays). Set that floor's **Floor level**, and **+ Floor** on it adds a floor on top of just that building, named after it. It works for part of a house too (a room or two set lower or higher: a split level). While you drag the box, the walls that will move turn the accent colour and the box says how many: a wall goes if its middle is inside the box, so a loosely drawn box still takes exactly the room's walls. The wall between the part and the rest goes with the part; the rest keeps a pale, dashed **party wall** copy of it, which closes its rooms but is built and costed with the part (if the part is set higher, the party wall fills the step under it). Where the part opens into the rest through a gap in a wall (an archway), an **open side** (a dotted line) is drawn across the gap on both floors: it closes the rooms either side, so each has its floor and roof, but nothing is built there and you walk straight through. A floor that is part of a house moved to a floor of its own has **Put back into …** in its panel, which returns everything on it to the floor it came from, as one floor again: to split it differently, or to redo a split made before these improvements. Every floor within half a storey of the one you're on shows as a dashed ghost, labelled with its name and how much higher or lower it is, so the parts of a split level read together. **Changing the level** in a floor's panel says what its Floor level moves: for a part of a building, **just the floor** (its walls stretch or shrink and its top, ceiling and roof stay where they are, so nothing opens up above), for a building on its own, **all of it**. **Build → Room on top…** adds a small floor on top of part of the one you're on (a stair-head over a spiral stair, giving access to the roof): drag a box where it goes and it gets walls round the box, a flat roof, and stands on top of this floor; this floor's roof turns flat so you can walk on it (change it back in the floor's panel if not). A stair under it that rises to the next floor cuts its stairwell in the room's floor; add a door out onto the roof. When a Floor level changes, the walls follow: a floor whose walls no longer reach the floor above (part of a house sunk a further 0.3 m on a floor of its own, under a floor that spans both parts) gets its storey height and full-height walls stretched or shortened to meet it. Walls you've set to a different height are left alone.
- In 3D, **View → Cutaway** lifts off the roof and ceilings of the floor you are editing and hides the floors above it in the same building, doll's-house style, so you can see the shape of the rooms (on a one-storey drawing too). The other buildings and the garden stay in view. It is also the **Cutaway** button beside Orbit and Walk: turn it off to see everything. It starts off (the whole house is shown), and each device remembers whether you last had it on. Walk mode puts you on the floor you are editing, with ceilings overhead.
- Walls run the full floor-to-floor height by default. Changing a floor's height takes those walls with it.

The panel edits exact sizes: wall thickness, height and length; opening width, height, sill and distance from the corner; door hinge side and swing direction.

**3D:** *Orbit* to look around the model; *Walk* to explore at eye height. On desktop, click the view to capture the mouse and use W A S D (Shift to hurry). On touch screens, use your left thumb to move and your right thumb to look. You can walk through open doorways, but not through walls.

Plans save automatically in the browser. Use **File → Export/Import** to keep them as JSON files. Undo/redo: Ctrl/⌘+Z, Ctrl/⌘+Shift+Z.

**Orbit movie:** **File → Make orbit movie…** circles the whole house once, from about 30° up, in the current light (the real sun included), and saves a small 640 × 360 video of about 12 seconds (an MP4 where the browser can make one, otherwise WebM), a few hundred kilobytes to a couple of megabytes, ready to send. Keep the window in front while it records.

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

## Materials

**Build → Paint materials** sets what everything is made of, as it looks in 3D, on the elevations and in walk mode.

- **Defaults for the whole drawing** (in the panel while the tool is on): **outside walls**, **inside walls** and **floors**. Every wall face looking into a room is an inside wall; every other face (the outside of the house, both sides of a garden wall) is an outside one. For an all-stone house, set both walls to stone and you are done.
- **Painting**: choose a finish from the **Paint** list in the toolbar, then:
  - a **wall finish**: click on one side of a wall to paint that face, or click inside a room to paint every wall face round it (a long wall bordering more than one room is painted along its whole length on that side);
  - a **floor**: click inside a room.
  Each list ends with *back to the default*, to take a painting off. While the tool is on, each wall face shows its finish as a coloured stripe along it; floors other than oak show in their colour on the plan all the time. **Clear painting on this floor** in the panel takes it all off.
- **Wall finishes**: white plaster; render in white, cream, ochre or terracotta pink; sage or blue-grey paint; dressed stone (ashlar, in 30 cm courses); rubble stone; red brick. The window and door reveals and the exposed ends of a wall take its outside finish, so a stone wall is stone right through its openings.
- **Floors**: oak boards, terracotta tiles, stone flags, pale porcelain tiles, grey carpet, polished concrete.
- **Roof coverings** are in each roof's panel (Roof tool, or the floor's default roof in **Floor & roof…**): concrete tiles, terracotta Roman (barrel) tiles, clay plain tiles or slate.

Textures are drawn to their real size (stone courses, bricks and tiles come out the same size on every wall), and a copied area brings its painted floors with it.

## Printing

**File → Print plans and elevations…** (or Ctrl/⌘+P) makes to-scale drawings, one to a page, each with a frame and a title block (project, drawing, scale with a scale bar, date, drawn by, sheet number):
- **Floor plans** for any floors, with a north arrow and the overall dimensions, and optionally dimensions (rooms, hedges and tree heights), furniture, patios and trees, and drains. All the plans are framed alike, so they lie over one another.
- **Elevations** from the north, east, south and west (whichever way the plan is turned, from the site's north). They are square-on and to scale, with the ground line and each floor level marked. Trees are left out unless you ask for them, as they can hide the house.
- **The 3D view** as it is on screen (not to scale), if you want it.
- **A4 or A3**, landscape or portrait. The scale is the largest standard one (1:20, 1:25, 1:50, 1:100, 1:200…) at which every drawing fits, or choose one; if a drawing is too big at the scale chosen, the preview says so.

**Just an area, on roll paper** (for the extension, say): choose **Just an area**, then **Choose the area on the plan…** and drag a box round it, from the house wall out to the end of the extension. The plan, the elevations and (if you choose one) a **section** are then of that area only: the elevations leave out the house beyond it, and the section is cut through the middle of the area, left to right looking up the plan or top to bottom looking left, with the cut line and A–A arrows drawn on the plan. Paper **Roll, 17 in (Epson SC-P800)** puts all the drawings down one long sheet, 431.8 mm wide and as long as they need, at the largest standard scale that fits across the roll (1:20 for most extensions; or choose 1:10 to 1:200), with the title block at the end. To print it: **Save as PDF**, open the PDF in Preview (or Epson Print Layout), choose **Roll Paper 17 in** and **100%** (not "Scale to fit"), and print. Measure the scale bar to check.

You see the pages first. **Print…** then opens the browser's print dialog: choose **Actual size / 100%** (not "Fit to page") and margins **None** so the scale is exact (check it against the scale bar), or **Save as PDF** to keep or send a copy. The choices are remembered on each device.

## Estimating materials and costs

**File → Estimate materials and costs…** measures the drawing and prices it roughly: enough to judge whether it is affordable, not to order from. Cost **the whole house and garden**, or drag out **an area** on the plan (the extension, say: it shares the area with printing). What it measures:

- **Structure:** a steel beam over every wide or glazed opening, sized for the roof and wall it carries; a steel **ridge beam** for a vaulted roof (with no ceiling ties the ridge must hold the rafters up), whose end loads the beam it lands on; steel posts for the pillars, with a pad foundation under each, and a steel beam from post to post (or post to wall) along each roof edge the posts hold up, sized for the roof it carries; padstones; lintels over the rest. Beams are universal beams (UB), picked as the lightest that is strong enough (steel S275) and stiff enough (span/360) under the usual loads (tiles, rafters, lining, snow). **These are first guesses: a structural engineer must design the steel, and Building Control approve it.**
- **Glazing, doors and windows:** glazed walls and doors by the square metre, windows, doors, the glazed gable triangle, and the roof windows by Velux size (MK06, CK04…), with flashings.
- **Foundations and floor:** trench-fill foundations under the outside walls, the dig, hardcore, membrane, slab, insulation, underfloor heating and screed, floor finish.
- **Walls:** facing bricks, blocks, insulation and ties (or rendered block), plasterboard, stud partitions.
- **Roof:** tiles or slates by count, membrane, battens, rafters (C24, sized for the span), ridge and hip tiles, valley troughs, fascia and gutters, downpipes, vault insulation and lining; flat roofs and parapet coping.
- **Garden and drains:** paving, decking, gravel and their sub-base, fences, hedging plants, gates, drain pipes, chambers, soakaways.

Choose the wall build, the roof covering, the foundation depth and underfloor heating. Every price is a rough UK 2025 supply price and can be changed (it changes every line priced the same way); untick a line or a whole group to leave it out; add labour and overheads as a percentage, a **contingency** (10% to start with; 15–20% is wiser for work on an old house) on materials and labour, and VAT on the lot. The big-ticket items are marked with a red dot. **Export CSV…** saves it for a spreadsheet; **Print…** prints it (or saves a PDF). Prices, ticks and choices are remembered on each device; **Reset prices** puts them back.

## Not done yet

- Dormers.
- A sun-hours map: how many hours of direct sun each part of a patio gets on a given day.
- Curved walls.
- Snapping openings to exact positions from a room's inside corner on either side.
