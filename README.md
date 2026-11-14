# Kestrel Station — a three.js tactical FPS

One Kestrel against five Jackals in a decommissioned freight relay yard at dusk.
Plant the Charge at Relay Hall (A) or Freight Dock (B) — or clear the yard.
First to 5 round wins takes the match.

## How to run

```sh
node serve.ts
# open http://localhost:8080 in a desktop browser with WebGL 2
```

No build step, no network: static files only, three.js 0.187.0 vendored under
`game/vendor/three/`.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock the pointer) |
| Click | Fire |
| R | Reload |
| E (hold) | Plant the Charge, inside a site |
| B | Buy menu (buy phase only) |
| G | Throw Spark Grenade |
| 1–4 | Sidearm / Carbine / SMG / DMR |
| Ctrl or C | Crouch |
| Space | Jump |

## The game

- **Rounds:** 12 s buy phase, 100 s round, first to 5 wins (max 9 rounds).
  Win +$2600, loss +$1500, kill +$300, plant +$300, defuse +$300.
- **Weapons:** P-4 Sidearm ($0), VK-7 Carbine ($2700), Rook-9 SMG ($1500),
  Longbow DMR ($4750), Spark Grenade ($300). Headshots deal 3.5–4× damage.
  Spread grows while moving and while spraying; stopping to aim pays.
- **Bots:** five Jackals hold the two sites, walk the mid route, hear gunfire,
  and hunt what they see. They react after 0.35–0.8 s and miss more against a
  fast or crouched target. After a plant they converge on the site to defuse
  (5 s channel; taking a bullet resets it).
- **Bomb:** hold E for 3 s inside a site. The fuse runs 35 s; if it blows, the
  Kestrels win the round. If the round timer expires unplanted, the Jackals win.
- **Map:** Kestrel Station — a 40×32 m yard with a long north lane, a container
  cross at mid, crates to crouch behind, and a jump-on platform at south.

## Layout

```
game/index.html        HUD, overlays, buy menu, import map
game/src/main.js       boot, fixed 60 Hz sim, shooting, screenshot states
game/src/map.js        Kestrel Station geometry, sites, spawns, routes, LOS
game/src/physics.js    shared AABB mover (player and bots)
game/src/player.js     movement, crouch, jump, health
game/src/weapons.js    arsenal, view model, reload, spread, grenades
game/src/bots.js       Jackal AI: hold, patrol, hunt, engage, defuse
game/src/bomb.js       plant / fuse / defuse state machine
game/src/rounds.js     round flow, economy, score
game/src/effects.js    pooled tracers, impact dust, explosions
game/src/audio.js      synthesized WebAudio SFX (no audio files)
game/src/hud.js        DOM HUD, overlays, buy menu
game/src/input.js      keyboard, mouse, pointer lock
game/src/palette.js    the look plan
game/src/rng.js        seeded randomness
main.ts                hands game/ + screenshots/ to /output with a dossier
serve.ts               dev server on http://localhost:8080
```

## Screenshots

`?shot=menu|buy|fight|plant&seed=1` renders a deterministic state for a
capture and sets `window.__shotReady` when the frame is settled.

## Known limits

- Single-player only: the enemy is five bots, not a networked team.
- No scope zoom on the DMR; no armor, no footsteps audio.
- Bots never climb the south platform; they walk around it.
