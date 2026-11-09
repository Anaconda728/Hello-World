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
| Left click (hold) | Dig terrain / chop a tree / attack an animal / fire the rifle / pick up a station |
| Right click (hold) | Build with the selected material / place a station / aim the rifle |
| 1–9 / mouse wheel | Choose a hotbar slot (materials, rifle, campfire, forge) |
| Tab | Open crafting |
| T | Talk to the person you're looking at |
| R / H | Eat / use a bandage |
| Q / E | Shrink / grow the brush |
| C | Switch between survival and creative mode |
| F | Fly (creative only) |
| Esc | Pause |

## Features

- **Smooth, endless terrain.** Meadows, beaches, lakes, snowy mountains and hidden caves, built from layered noise. The world loads in chunks as you explore.
- **Sculpting.** Digging and building carve or add round shapes to a density field. The surface is rebuilt with *surface nets*, so it stays smooth.
- **Survival inventory.** Whatever you dig ends up in your inventory (turf, soil, stone, sand, snow). Chopped trees give timber. Building uses up materials. Creative mode makes them unlimited.
- **Wildlife** based on real animals:
  - *Deer* graze in meadows and bolt when you come close.
  - *Capybaras* relax by the water and swim.
  - *Flamingos* wade in the shallows and stand on one leg.
  - *Hedgehogs* live in forests. They curl into a spiny ball, and touching one hurts.
- **Hostile animals:**
  - *Jackals* hunt in packs at night, fan out to surround you, and scatter at dawn.
  - *Honey badgers* are rare and tough. They charge if you get close.
  - *Vipers* hide in the grass. Watch for one rearing up just before it strikes.
- **Unstable cliffs.** Digging into a steep face or under an overhang *sometimes* makes it collapse. The ground rumbles first, then a slab breaks off and tumbles down as boulders. Boulders hurt anything they hit, then settle back into the terrain.
- **Towns.** Each world region may hold a settlement, built on flattened land with cobbled streets, a market plaza with stalls and a well, timber-framed houses, a tavern, a smithy, a stone guard tower and street lamps. Windows light up at night. The HUD shows the nearest town and its direction, and new worlds start just outside one.
- **Townsfolk with daily routines.** Merchants, a blacksmith, an innkeeper, labourers, townsfolk and guards. They:
  - sleep at home at night and step out in the morning;
  - go to work: selling at stalls, hammering at the anvil, carrying crates house to house, patrolling;
  - take lunch at the tavern or the plaza and gather there again in the evening;
  - carry lanterns after dark. Guards work day and night shifts.
- **They react to the world:**
  - They greet you as you pass and complain if you barge into them.
  - Gunfire makes people scream and run, or cower where they are.
  - Aim your rifle at someone and they put their hands up, then bolt. Aim at a guard and you get a warning first.
  - Civilians run from jackals and honey badgers. Guards shoot hostile animals that come into town.
- **Talk (T).** Chat for rumours, such as where to find ore or the direction of the next town. Trade with merchants, the smith and the innkeeper for coins. Guards hand out bounty jobs to cull jackals, badgers or vipers.
- **The law.** Assault, murder or firing a gun recklessly near a guard gives you a wanted level (1–5 stars). Guards then chase you, shoot at you from range and beat you up close. Stay out of their sight for about 20 seconds and you lose a star. Crimes damage a town's standing, which raises prices and eventually ends trade there. Dying clears your wanted level but costs half your coins.
- **Resources underground.** Coal and iron ore run through the stone, yellow sulfur lies deeper (below about height 26), and blue-grey clay sits around lakes.
- **Animal drops.** Animals drop meat, hide and feathers, which drift toward you when you get close.
- **Food and hunger.** Your food bar empties over time, and faster when sprinting or swimming. Eat with R: cooked meat fills 8 and raw meat fills 3. Health only comes back when you're well fed, and at zero food you start starving.
- **Crafting (Tab).** Two stations you can place:
  - *Campfire* (timber + stone): cook food on it. Jackals won't come near.
  - *Forge* (stone + clay + timber): smelts iron and makes metal goods.

  | Recipe | Ingredients | Station |
  | --- | --- | --- |
  | Cooked meat | raw meat + timber | campfire / forge |
  | Bandage (heals 8) | hide + 2 feathers | – |
  | Iron ingot | 8 iron ore + 3 coal | forge |
  | Gunpowder ×2 | 3 coal + 2 sulfur | – |
  | Cartridges ×6 | iron ingot + 2 gunpowder | forge |
  | Rifle | 5 iron ingots + 12 timber + 2 hide | forge |
- **Rifle.** Each shot uses one cartridge, and reloading takes 1.6 s. Shots from the hip spread a little, so hold right click to aim down the sights and zoom. A gunshot startles grazing animals and scatters jackals and vipers, but honey badgers don't care.
- **Health.** You can take falling, bite and rockslide damage. Health comes back slowly, and when you die you respawn. Creative mode makes you invulnerable.
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
| `js/creatures.js` | Animal models, AI, spawning and combat |
| `js/hazards.js` | Cliff collapses and rolling boulders |
| `js/items.js` | Items, crafting recipes, dropped pickups |
| `js/structures.js` | Campfires and forges |
| `js/gun.js` | First-person rifle model, effects and sound |
| `js/towns.js` | Town sites, street layout, building meshes, colliders, road graph |
| `js/npcs.js` | Townsfolk models, schedules, reactions, guards and the wanted system |
| `js/main.js` | Rendering, sky, input, HUD, saving |
