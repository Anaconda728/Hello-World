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
| G | Mount / dismount a horse |
| V | Whistle for your horse |
| M | Open / close the full map |
| B | Open your horse's saddlebags |
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
- **Roads, or none at all.** Some neighbouring towns are joined by winding dirt roads with signposts at the edge of town. Roads follow the land, are smoothed and banked across their width, and run on raised causeways over water. Other towns are cut off:
  - roughly a third are isolated, with no roads in or out;
  - some lose their links because mountains, steep ground or another town sit in the way.

  Inside a town, the HUD lists where its roads lead, or says it has none. Townsfolk mention it in conversation too.
- **Travellers.** Horse-drawn trade wagons (some covered, loaded with crates, barrels and sacks) and riders on horseback travel the roads between connected towns. They drive into the market, unload their cargo, then head off down another road. They:
  - keep to the right, so opposing traffic passes;
  - queue behind slower traffic;
  - stop and shout if you block the road, then swerve around you;
  - greet you as they pass and carry lanterns at night.

  Gunfire sends horses into a gallop, and a galloping horse will trample you. Talk to a wagon driver (T) to trade from their travelling stock, or ask riders for news of the road. Aim at a traveller and they stop with their hands up; keep aiming and they throw down their purse. Crimes on the open road go unseen, but near a town they bring the guards.
- **Graphics.**
  - Lighting uses filmic (ACES) tone mapping, with soft real-time sun shadows that follow you.
  - The sky is a gradient dome with a sun glow, and fog fades into the horizon colour.
  - The ground has fine procedural detail, and water is glossy with ripples that catch the sun.
- **Vegetation.**
  - About twice as many trees, in three kinds: broad oaks, white-barked birches, and tiered pines (snow-dusted up high). They have lumpy, softly shaded canopies that sway in the wind.
  - Wild bushes, plus berry bushes (raspberries and blueberries) you can pick by left-clicking. Picked bushes grow back.
  - Scattered rocks.
  - Grass tufts and wildflowers sway around you. Grass takes its colour from the ground, grows thicker in meadows and stays out of buildings.
- **Carry weight.** Everything you carry has weight: you can carry 50 before you slow down. Coins weigh nothing.
- **Saddlebags.** Craft them (4 hide, 6 timber) or buy them at a stable, and fit them to your horse. Press B beside your horse, or while riding, to move goods between you and the bags (they hold 100).
- **Stables.** Every town has an open-fronted stable with a stablehand. Buy a horse (60), rent one for a day (12; it goes home when time's up), or keep yours in the stable (3) and collect it at any stable in the land, saddlebags and all.
- **Lodging.** The innkeeper rents rooms (8 coins): sleep until dawn, wake fully healed, and that inn becomes where you respawn. Or rent a house for a week (45). It's marked by a green lamp at the door. Press T there to sleep or use a chest that holds 400, which is kept even after the rental runs out.
- **Horses.** Buy one at a stable, or take the horse of a bandit you've beaten. Ride with G: trot, gallop with Shift, and jump higher. You can still shoot from the saddle. Your horse stays where you leave it; whistle (V) and it runs to you from up to 220 m away. Galloping doesn't make you hungry, but falls from a horse still hurt.
- **Bandits.** Camps of 3–5 armed bandits (some on horseback) sit out in the wilds, away from towns and roads, with tents and a fire you can spot at night. They:
  - aim before they fire, keep their distance, circle you and back away if you get too close;
  - flee when badly hurt;
  - never follow you into a town;
  - also set roadside ambushes on you and on passing travellers.

  Killing bandits is not a crime. They drop coins, cartridges and sometimes gunpowder or ingots. Wiping out a camp clears it for two days. Guards also hand out bandit bounties.
- **Escort jobs.** Merchants in towns with roads hire you to protect a covered wagon to a neighbouring town. The wagon waits at the edge of town until you arrive, then sets off. One or two ambushes will hit it on the way, and the driver stops while the fight is on. Get it there and you're paid in raw materials: iron ore, coal, sulfur, clay, stone, timber, ingots, gunpowder or cartridges, more for longer roads. The job fails if the wagon is destroyed, if you leave it for too long, or if you die.
- **Minimap and full map.** A round minimap in the corner shows nearby terrain, water, towns and buildings, roads, travellers, bandits close by, your horse and your escort target. Press M for a map of about 1.4 km across, with town names (and which towns have no roads) and discovered bandit camps.
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
| `js/roads.js` | Which towns connect, road routes, height profiles, terrain shaping |
| `js/travelers.js` | Horses, wagons and riders travelling, unloading and reacting; escort wagons |
| `js/horses.js` | Rideable horses: owning, mounting, whistling, animation |
| `js/bandits.js` | Bandit camps, ambushes and combat |
| `js/minimap.js` | Terrain tile cache and map rendering |
| `js/vegetation.js` | Tree, bush, berry and rock models; grass and flowers with wind |
| `js/main.js` | Rendering, sky, input, HUD, saving |
