# Changelog

## 1.2.0

- **People**: pedestrians, robots and gang members share a new smooth-limbed, jointed body (capsule limbs,
  shaped torsos, rounded heads, hands and feet). Pedestrians are now full figures in coats with skin tones,
  optic visors and domed umbrellas they actually hold, instead of pegs.
- **Movement**: a real walk cycle (knees lift, hips sway, shoulders counter-rotate, elbows bend, the body
  bobs), running leans forward, idle figures breathe, shift their weight and look around, and pedestrians
  ease into a sprint when they panic.
- **Drones**: rounded hulls (teardrop air taxis with tail booms and skids, airship-like ferries with
  wrap-around window decks and a belly ad screen, saucer-bodied enforcers with a gimballed eye), ducted fans
  with visibly spinning blades.
- **Flight**: drones bank into turns, dip their noses with speed, slow into corners and power out, and
  hover with a slight drift; stunned drones wobble with stalled rotors.
- Fix: patrol drones no longer all appear right on top of you.

## 1.1.0

- **Combat**: five weapons: Mono-Katana (melee sweep), SP-9 Smart Pistol (auto-aim), HX-7 Plasma Rifle
  (automatic, splash), Tachyon Railgun (pierces everything in a line) and EMP Grenades (area damage,
  wreck and stun drones, auto-fabricated). LMB fire, RMB aim, 1-5 / wheel to switch, R reload.
- Health with a regenerating shield, damage flashes, hit markers. Flatline and you wake up at the nearest
  Chrome Clinic with a 10% medical bill.
- **Gangs fight back**: attack them, fire near them, or linger on their turf and the crew turns hostile,
  strafes and shoots. Random street **ambushes** while on foot. Downed members drop credits. A wiped-out
  crew's alley stays quiet for a few minutes.
- **Wanted level (0-5 stars)**: unprovoked attacks on pedestrians, robots, calm gang members or enforcer
  drones (and running people over) raise heat; seen by a patrol counts double. Pursuit drones hunt you,
  heavy drones from 3 stars. Lose them by breaking contact (3x faster hiding in a dark alley), paying at a
  Data Spire or Chrome Clinic to wipe your record, or flatlining. Pedestrians panic at gunfire; robots flee.
- **City layout**: dense districts now alternate with open districts of parkland and empty lots, and
  **elevated highways** on two levels (14 m and 24 m) cross over each other on pylons. Their on-ramps dip to
  street level, so you can drive and walk up onto the decks.

## 1.0.0 (first stable release)

- **Windows desktop app**: `Neon Sprawl.exe` (Electron 44) with its own window and icon, F11
  fullscreen, a native Save As dialog for exports, a crash-restart prompt and Quit to desktop.
  Saves go to `%APPDATA%\Neon Sprawl`.
- **Portable download**: unzip and double-click `Play Neon Sprawl.html`. Runs offline from disk in any
  modern browser, with fonts bundled.
- **Title screen**: Continue, New World (name, seed, sandbox), Load World (slots with export/delete),
  Import save file, Settings.
- **Settings**: graphics quality presets (Low / Medium / High), mouse sensitivity, FPS counter. The game
  suggests a lower preset if it detects sustained low frame rates.
- In-game naming/confirm dialogs replace browser `prompt()`/`confirm()`.
- **Stability**: a crash screen instead of a frozen black screen, recovery from one-off frame errors,
  and a clear message when WebGL is unavailable or the GPU driver resets.
- **Endless procedural city**, streamed in chunks around you; edited chunks are saved.
- **Build**: roads, Hab Stacks, Corp Towers, Arcologies, Fusion Cores (power grid), Data Spires,
  Drone Hubs, Chrome Clinics, Uplink Arrays, Neon Plazas, Holo-Ads, deployable drones, Grow and Demolish.
- **Walk**: first person with cyberware (dash, double jump, optic scan, optic overlay vision).
- **Drive**: arcade hover-car with drift, boost and three cameras.
- **Street life**: talkable bipedal robots (day stories, map markers, questions), alley gangs with
  territories and courier jobs, air taxis, transport ferries, enforcer scanner drones, traffic,
  pedestrians, blimps, rain and steam.
