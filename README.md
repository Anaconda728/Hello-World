# Driftland

A first-person sandbox in the browser. The land is made of smooth rolling hills instead of blocks. You dig into it and build onto it like clay.

## Play

The game is plain HTML and JavaScript, with [three.js](https://threejs.org) loaded from a CDN. You don't need to build anything, but you do need to serve the folder over HTTP:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

You can also turn on **GitHub Pages** for this repository (Settings → Pages → deploy from branch).

## Controls

| Key | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Space | Jump, or swim up in water |
| Shift | Sprint |
| Left click (hold) | Dig terrain / chop a tree |
| Right click (hold) | Build with the selected material |
| 1–6 / mouse wheel | Choose material |
| Q / E | Shrink / grow the brush |
| C | Switch between survival and creative mode |
| F | Fly (creative only) |
| Esc | Pause |

## Features

- **Smooth, endless terrain.** Meadows, beaches, lakes, snowy mountains and hidden caves, built from layered noise. The world loads in chunks as you explore.
- **Sculpting.** Digging and building carve or add round shapes to a density field. The surface is rebuilt with *surface nets*, so it stays smooth.
- **Survival inventory.** Whatever you dig ends up in your inventory (turf, soil, stone, sand, snow). Chopped trees give timber. Building uses up materials. Creative mode makes them unlimited.
- **Day and night.** The sun and moon move across the sky, with stars at night, drifting clouds and warm colours at dusk.
- **Water.** You can swim, and the view tints when you're underwater.
- **Saves automatically** in your browser's localStorage. *New world* in the pause menu starts over with a fresh seed.

## Code layout

| File | Purpose |
| --- | --- |
| `js/constants.js` | World size, materials, hotbar |
| `js/noise.js` | Seeded Perlin noise and hashes |
| `js/world.js` | Terrain generation, chunk streaming, edits, trees |
| `js/mesher.js` | Surface-nets mesher (density field → mesh) |
| `js/player.js` | Movement and collision against the density field |
| `js/main.js` | Rendering, sky, input, HUD, saving |
