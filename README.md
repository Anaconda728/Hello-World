# Neon Sprawl

A dark-neon cyberpunk city builder that runs in the browser. Raise towers, fusion cores and data spires from
above, then drop to street level and **walk** or **drive** through an endless rain-soaked megacity. The sprawl
keeps generating dense city in every direction as you move.

## Run it

It's plain ES modules with no build step. Three.js is vendored in `vendor/`, so it works offline.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` straight from disk won't work, because browsers block ES modules over `file://`.)

## Landing page and saves

- **New World**: pick a name and a seed (same seed, same city), and optionally Sandbox for unlimited credits.
  You start in a cleared district with one fusion core, surrounded by endless generated sprawl.
- **Continue / Load World**: every city is a save slot in this browser. Each slot can be loaded, exported to a
  `.json` file, or deleted.
- **Import Save File**: load an exported `.json`.
- In game, **Esc** (or ☰) opens the menu: Save, Save as new slot, Export save file, Save & quit to title.
  Cities also autosave every 20 seconds while something has changed.

## Controls

| Mode | Controls |
|------|----------|
| **Build** | LMB place / drag · RMB-drag orbit · WASD pan (Shift = fast) · Q/E rotate · wheel zoom · `1`–`9`, `0`, `-` build tools · `G` grow · `X` demolish |
| **Walk** (`F`) | WASD move · Shift run · Space jump, Space again in mid-air for a kinetic double jump · `Q` reflex dash · `X` optic overlay · mouse look · `V` summon car |
| **Drive** (`V`) | W/S throttle/brake · A/D steer · Space drift · Shift boost · `C` camera · `X` optic overlay · `F` step out |
| Anywhere | `B` builder · `Esc` menu · `H` hide HUD · `P` quick save |

On foot your **optic implant** scans whatever you look at: owner corp, height, occupants, network security.
**Optic overlay** (`X`) switches to an edge-detected cyber-vision with a scan pulse.

## Building

| Tool | What it does |
|------|--------------|
| Road | Drag an L-shaped road. Most buildings need road access to count. |
| Hab Stack / Corp Tower / Arcology | Homes, jobs, or both (Arcology is 2×2). |
| Fusion Core | Plasma reactor supplying power. Power shortages cut income and stop growth. |
| Data Spire | Server tower with glyph streams pouring down it. Jobs and bonus income. |
| Drone Hub | Landing pad with a circling delivery-drone swarm. |
| Chrome Clinic | Cybernetics clinic with augmentation vats, a giant robotic arm and a holographic cyber-head. |
| Uplink Array | Lattice tower that fires a laser up through the smog. Big bonus income. |
| Neon Plaza / Holo-Ad | Glowing park that boosts growth / towering billboard. |
| Grow | Adds height. Growing a sprawl building claims it as yours. |
| Demolish | Drag a box. Refunds 50% of your own buildings. |

Only buildings **you** own count toward population, jobs, power and income. The generated sprawl is
scenery until you claim it.

## Code layout

```
index.html, css/style.css   landing page, HUD, menus, import map
src/main.js                 renderer, post FX (bloom, grade, glitch, optic overlay), title/loading/game states
src/city.js                 infinite chunked city: seeded street layout, streaming, editing, economy, save format
src/buildings.js            procedural generators for every structure + holograms
src/materials.js            canvas-generated windows, server LEDs, signs, ads, data streams; shared materials
src/world.js                smog sky, skyline that follows you, rain, searchlights
src/traffic.js              hover-cars, cyber-augmented pedestrians, patrol drones, sky traffic, blimps, steam
src/saves.js                localStorage save slots, file export/import
src/modes/                  build (orbit camera + tools), walk (augmented first person), drive (hover-car)
```
