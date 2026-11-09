# Neon Sprawl

A dark-neon cyberpunk city builder that runs in the browser. Lay roads and raise towers from above, then
drop down to street level and **walk** or **drive** through the rain-soaked megacity you built.

## Run it

It's plain ES modules with no build step. Three.js is vendored in `vendor/`, so it works offline.
Serve the folder with any static server and open it in a browser:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly from disk won't work, because browsers block ES modules over `file://`.)

## Controls

| Mode | Controls |
|------|----------|
| **Build** | LMB place / drag · RMB-drag orbit · WASD pan · Q/E rotate · wheel zoom · 1–8 pick tool |
| **Walk** (`F`) | WASD move · Shift run · Space jump · mouse look · `V` summon your car |
| **Drive** (`V`) | W/S throttle/brake · A/D steer · Space drift · Shift boost · `C` cycle camera · `F` step out |
| Anywhere | `B` back to builder · `H` hide HUD · `P` save now |

## Building

- **Road**: drag to lay an L-shaped road. Buildings only count toward population, jobs and income when a road touches them.
  Anything without one shows a red `NO ROAD` marker.
- **Hab Stack**: residential towers. **Corp Tower**: jobs. **Arcology**: a 2×2 megastructure with both.
- **Neon Plaza**: a glowing park. It speeds up growth for buildings nearby.
- **Holo-Ad**: a towering billboard.
- **Grow**: click a building to add height. With **Auto-growth** on, connected buildings also climb by themselves over time.
- **Demolish**: drag a box. You get part of the cost back.

The city autosaves to `localStorage`. Use **Generate city** for a fresh procedural district, or turn on
**Sandbox** for unlimited credits.

## Code layout

```
index.html, css/style.css   HUD + import map
src/main.js                 renderer, post-processing (bloom + grade), mode switching, loop
src/city.js                 tile grid, roads mesh, chunked building meshes, economy, save/load, generator
src/buildings.js            procedural tower / arcology / plaza / billboard generators
src/materials.js            canvas-generated window, sign, ad textures; neon materials; env map
src/world.js                smog sky, skyline, rain shader, searchlights
src/traffic.js              instanced hover-cars, umbrella pedestrians, sky traffic
src/modes/                  build (orbit camera + tools), walk (first person), drive (hover-car)
```
