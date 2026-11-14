// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. This module owns the raycast shooting, the round wiring and the screenshot
// states; every system (movement, bots, bomb, economy) lives in its own module and
// is driven from here. ?shot=menu|buy|fight|plant with &seed=N sets up a
// deterministic frame, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createRounds } from './rounds.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const fx = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(map.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();

let score = 0;
let killLabel = 'VK-7 Carbine';
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let dryTimer = 0;
let wasPlanted = false;

const weapons = createWeapons(camera, {
  fx,
  audio,
  scene,
  colliders: map.colliders,
  onGrenade,
});
const bomb = createBomb(scene, map, {
  onExploded: () => endRound('kestrel', 'The Charge detonated at the site'),
  onDefused: () => endRound('jackal', 'The Charge was defused'),
});
const bots = createBots(scene, map, {
  random,
  player,
  audio,
  fx,
  onBotKilled,
  onDefused: () => bomb.defuseCalled(),
  onPlayerDamage,
});
const rounds = createRounds({
  onPhase,
  onMatchEnd: (winner) => {
    audio[winner === 'kestrel' ? 'roundWin' : 'roundLoss']();
  },
});

const shootables = map.shootables.concat(bots.hitMeshes);

hud.buildBuy(WEAPONS, GRENADE, (id) => buyItem(id));
hud.setAmmo(weapons.state().mag, weapons.state().reserve);
hud.setHealth(player.state.health, 100);
hud.setMoney(rounds.state.money);
hud.setScore(0, 0, 1);
hud.setTimer(0);
hud.setBomb('Charge on you');
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'menu' || rounds.state.phase === 'matchEnd') {
    rounds.startMatch();
    input.requestLock();
  } else if (rounds.state.phase === 'roundEnd') {
    input.requestLock();
  } else {
    input.requestLock();
  }
});

function buyItem(id) {
  if (rounds.state.phase !== 'buy') return;
  if (id === 'grenade') {
    if (!rounds.buyGrenade()) return;
    weapons.buyGrenade();
  } else {
    if (weapons.owned.has(id)) {
      weapons.select(id);
      return;
    }
    if (!rounds.buyWeapon(id)) return;
    weapons.buy(id);
    weapons.select(id);
  }
  audio.buy();
  hud.setMoney(rounds.state.money);
  hud.setBuyAffordability(rounds.state.money, weapons.owned);
  hud.setAmmo(weapons.state().mag, weapons.state().reserve);
}

function setupRound() {
  player.reset(map.playerSpawn);
  weapons.refill();
  bomb.reset();
  bots.reset(map.botSpawns);
  wasPlanted = false;
  hud.setHealth(player.state.health, 100);
  hud.setAmmo(weapons.state().mag, weapons.state().reserve);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.wins.kestrel, rounds.state.wins.jackal, rounds.state.round);
  hud.setBomb('Charge on you');
  hud.setPlant(0, '');
  hud.showBuy(false);
  syncCamera();
}

function onPhase(phase) {
  if (phase === 'buy') {
    setupRound();
    hud.toast(`Round ${rounds.state.round} — buy phase, press B`, 2600);
    hud.setBuyAffordability(rounds.state.money, weapons.owned);
  } else if (phase === 'live') {
    hud.showBuy(false);
    hud.toast(`Round ${rounds.state.round} — plant the Charge or clear the yard`);
  } else if (phase === 'roundEnd') {
    hud.showBuy(false);
    hud.setPlant(0, '');
    hud.showOverlay('round', rounds.state.endReason);
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (phase === 'matchEnd') {
    const w = rounds.state.matchWinner;
    const detail = w === 'draw'
      ? `A draw, ${rounds.state.wins.kestrel}–${rounds.state.wins.jackal}.`
      : w === 'kestrel'
        ? `Kestrels take the match ${rounds.state.wins.kestrel}–${rounds.state.wins.jackal}.`
        : `Jackals take the match ${rounds.state.wins.jackal}–${rounds.state.wins.kestrel}.`;
    hud.showOverlay('match', detail);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function onBotKilled(bot) {
  score += 100;
  rounds.earnKill();
  hud.setScore(rounds.state.wins.kestrel, rounds.state.wins.jackal, rounds.state.round);
  hud.killfeed(`You ▸ Jackal-${bot.id + 1} — ${killLabel}`);
  hud.setMoney(rounds.state.money);
  if (bots.aliveCount() === 0 && !bomb.state.planted) {
    endRound('kestrel', 'Yard cleared — every Jackal is down');
  }
}

function onPlayerDamage(amount, fromYaw) {
  const dealt = player.damage(amount, fromYaw);
  if (dealt <= 0) return;
  hud.setHealth(player.state.health, 100);
  hud.damageFlash();
  audio.hurt();
  if (!player.state.alive) {
    if (bomb.state.planted) {
      hud.toast('You are down — the Charge still ticks');
    } else {
      endRound('jackal', 'You were eliminated');
    }
  }
}

function endRound(winner, reason) {
  if (rounds.state.phase !== 'live') return;
  rounds.endRound(winner, reason);
  if (winner === 'kestrel') audio.roundWin();
  else audio.roundLoss();
}

function onGrenade(position) {
  // Blast damage falls off with distance; the carrier can hurt themself.
  // bots.damage() fires onBotKilled, which owns the score and the bonus — this
  // function only names the weapon for the feed.
  killLabel = 'Spark Grenade';
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const distance = bot.body.position.distanceTo(position);
    if (distance > GRENADE.radius) continue;
    const amount = Math.round(GRENADE.maxDamage * (1 - distance / GRENADE.radius));
    bots.damage(bot.torso, amount);
  }
  if (player.state.alive) {
    const distance = player.position().distanceTo(position);
    if (distance < GRENADE.radius) {
      const amount = Math.round(GRENADE.maxDamage * (1 - distance / GRENADE.radius) * 0.5);
      onPlayerDamage(amount, player.state.yaw);
    }
  }
  if (bots.aliveCount() === 0 && !bomb.state.planted && rounds.state.phase === 'live') {
    endRound('kestrel', 'Yard cleared — every Jackal is down');
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (rounds.state.phase === 'live' || rounds.state.phase === 'buy') {
    hud.showOverlay(started ? 'paused' : 'menu');
  }
}

function syncCamera() {
  const body = player.body;
  camera.position.set(body.position.x, body.position.y + player.eyeHeight(), body.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + player.eyeHeight());
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const result = weapons.tryFire(true);
  if (!result.fired) {
    if (weapons.state().mag === 0 && performance.now() - dryTimer > 400) {
      dryTimer = performance.now();
      audio.dryFire();
    }
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.set(0.24, -0.18, -0.95);
  camera.localToWorld(muzzle);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hits = raycaster.intersectObjects(shootables, false);
  let end = null;
  for (const hit of hits) {
    const bot = hit.object.userData.bot;
    if (bot && !bot.alive) continue;
    end = hit;
    break;
  }
  if (end) {
    const bot = end.object.userData.bot;
    if (bot) {
      // bots.damage() fires onBotKilled, which owns the kill score and bonus;
      // a non-killing hit is worth 10 here and nowhere else.
      const def = weapons.def();
      killLabel = def.name;
      const amount = Math.round(def.damage * (end.object.userData.part === 'head' ? def.headMult : 1));
      const killed = bots.damage(end.object, amount);
      if (killed) {
        hud.hitMarker(true, shot ? 4000 : 110);
        audio.kill();
      } else {
        score += 10;
        hud.hitMarker(false, shot ? 4000 : 110);
        audio.hit();
      }
    } else {
      fx.impact(end.point);
    }
    fx.tracer(muzzle, end.point, Boolean(bot));
  } else {
    tmpTarget.copy(camera.position).addScaledVector(direction, 60);
    fx.tracer(muzzle, tmpTarget, false);
  }
  bots.hearShot(player.position());
  player.recoil(weapons.def().recoil * (0.85 + random() * 0.3), (random() * 2 - 1) * weapons.def().recoil * 0.3);
  hud.setAmmo(weapons.state().mag, weapons.state().reserve);
  return true;
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  if (phase === 'buy' || phase === 'live') {
    player.step(dt, input.state.keys);
    weapons.step(dt);
    if (phase === 'live') {
      bots.step(dt, elapsed);
      bomb.step(dt);
      if (input.state.keys.has('KeyE')) {
        const progress = bomb.tryPlant(player.position(), dt);
        hud.setPlant(progress, progress > 0 ? 'Planting the Charge…' : '');
        if (progress >= 1 && !wasPlanted) {
          wasPlanted = true;
          rounds.earnPlant();
          hud.toast('Charge planted — defend the site');
          hud.setMoney(rounds.state.money);
          audio.plantBeep();
          bots.sendToDefuse(bomb.state.position);
        }
      } else {
        hud.setPlant(0, '');
      }
    }
    // The clock runs in buy and in live alike: buy ends into live, live ends
    // on timeout (unless the Charge is planted — then only the fuse decides).
    const transition = rounds.step(dt);
    if (transition === 'timeout' && !bomb.state.planted) {
      endRound('jackal', 'Time expired — the Charge was never planted');
    }
  }
  fx.step(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const phase = rounds.state.phase;
    if (phase === 'live' && input.state.firing && weapons.ready()) {
      shoot(weapons.spread(player.groundSpeed()));
    }
    if (input.pressed('KeyR')) weapons.reload();
    if (input.pressed('KeyB') && phase === 'buy') {
      const open = document.getElementById('buy').hidden;
      hud.showBuy(open);
      if (open) hud.setBuyAffordability(rounds.state.money, weapons.owned);
    }
    if (phase === 'buy') {
      if (input.pressed('Digit1')) buyItem('sidearm');
      if (input.pressed('Digit2')) buyItem('carbine');
      if (input.pressed('Digit3')) buyItem('smg');
      if (input.pressed('Digit4')) buyItem('dmr');
      if (input.pressed('Digit5')) buyItem('grenade');
    }
    if (input.pressed('KeyG') && phase === 'live') {
      camera.getWorldDirection(direction);
      tmpPoint.copy(camera.position).addScaledVector(direction, 0.5);
      weapons.throwGrenade(tmpPoint, direction, random);
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setTimer(rounds.state.timeLeft);
    hud.setCrosshair(6 + weapons.spread(player.groundSpeed()) * 1400);
    if (bomb.state.planted) {
      hud.setBomb(`Charge planted — ${Math.max(0, Math.ceil(bomb.state.fuseLeft))}s`);
    }
    input.endFrame();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  rounds.startMatch();
  if (name === 'menu') {
    player.reset(new THREE.Vector3(0.6, 0, 8.6));
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('menu');
  } else if (name === 'buy') {
    rounds.state.money = 4200;
    weapons.buy('carbine');
    player.reset(new THREE.Vector3(-6, 0, 11));
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.4, -8));
    hud.setMoney(rounds.state.money);
    hud.setBuyAffordability(rounds.state.money, weapons.owned);
    hud.showBuy(true);
  } else if (name === 'fight') {
    rounds.startRound();
    const target = bots.bots[2];
    target.body.position.set(8, 0, -4);
    target.group.position.set(8, 0, -4);
    target.state = 'engage';
    target.lastKnown.copy(player.position());
    target.hasKnown = true;
    target.reactionAt = 1e9;
    const flank = bots.bots[0];
    flank.body.position.set(4.5, 0, -3);
    flank.group.position.set(4.5, 0, -3);
    flank.state = 'engage';
    flank.lastKnown.copy(player.position());
    flank.hasKnown = true;
    flank.reactionAt = 1e9;
    player.reset(new THREE.Vector3(8.5, 0, 7.5));
    settle(20);
    tmpTarget.set(8, 1.2, -4);
    aimAt(tmpTarget);
    shoot(0);
    settle(6);
    aimAt(tmpTarget);
  } else if (name === 'plant') {
    rounds.startRound();
    player.reset(new THREE.Vector3(-13.5, 0, -8));
    settle(20);
    for (let i = 0; i < 100; i += 1) {
      const progress = bomb.tryPlant(player.position(), FIXED_STEP);
      if (progress >= 0.55) break;
    }
    const guardA = bots.bots[0];
    guardA.body.position.set(-17, 0, -8);
    guardA.group.position.set(-17, 0, -8);
    guardA.state = 'hunt';
    guardA.lastKnown.copy(player.position());
    guardA.hasKnown = true;
    const guardB = bots.bots[1];
    guardB.body.position.set(-18, 0, -13);
    guardB.group.position.set(-18, 0, -13);
    guardB.state = 'hold';
    aimAt(new THREE.Vector3(-15.5, 0.8, -11));
    settle(4);
    hud.setPlant(0.55, 'Planting the Charge…');
  }
  hud.setScore(rounds.state.wins.kestrel, rounds.state.wins.jackal, rounds.state.round);
  hud.setAmmo(weapons.state().mag, weapons.state().reserve);
  hud.setMoney(rounds.state.money);
  hud.setTimer(rounds.state.timeLeft);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
