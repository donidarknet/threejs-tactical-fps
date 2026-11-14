// The Jackals: five defenders who hold the sites, walk the routes, hear gunfire and
// hunt what they see. One shared raycaster and a few scratch vectors serve all five,
// so the AI allocates nothing while it thinks. A bot is a state machine — hold, patrol,
// hunt, engage, defuse — with a reaction delay and an aim error, so a player who stops,
// aims and lands the first shot wins the duel.
import * as THREE from 'three';
import { stepBody, createBody } from './physics.js';
import { losClear } from './map.js';
import { PALETTE } from './palette.js';
import { range } from './rng.js';

const HEALTH = 100;
const BOT_COUNT = 5;
const WALK_SPEED = 2.9;
const HUNT_SPEED = 3.7;
const STRAFE_SPEED = 2.2;
const EYE_HEIGHT = 1.55;
const SENSE_INTERVAL = 0.12;
const VIEW_DISTANCE = 38;
const VIEW_HALF_ANGLE = 1.05;
const HEAR_DISTANCE = 26;
const FALL_SECONDS = 0.4;

export function createBots(scene, map, hooks) {
  const { random, player, audio, fx, onBotKilled, onDefused, onPlayerDamage } = hooks;
  const raycaster = new THREE.Raycaster();
  const tmpDirection = new THREE.Vector3();
  const tmpToPlayer = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();

  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.22);
  const gunGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.62);
  const torsoMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.1 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.5, metalness: 0.1 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
  const gunMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.3 });

  const bots = [];
  const hitMeshes = [];

  function buildMesh() {
    const group = new THREE.Group();
    const legL = new THREE.Mesh(legGeometry, legMaterial);
    legL.position.set(-0.13, 0.4, 0);
    const legR = new THREE.Mesh(legGeometry, legMaterial);
    legR.position.set(0.13, 0.4, 0);
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 1.14;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.66;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeometry, gunMaterial);
    gun.position.set(0.28, 1.2, -0.3);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return { group, torso, head };
  }

  for (let i = 0; i < BOT_COUNT; i += 1) {
    const spawn = map.botSpawns[i];
    const { group, torso, head } = buildMesh();
    group.position.copy(spawn);
    scene.add(group);
    const bot = {
      id: i,
      group,
      torso,
      head,
      body: createBody(map.colliders, spawn.x, spawn.z),
      health: HEALTH,
      alive: true,
      state: 'hold',
      route: [],
      routeIndex: 0,
      holdPoint: spawn.clone(),
      lastKnown: new THREE.Vector3(),
      hasKnown: false,
      nextSense: random() * SENSE_INTERVAL,
      reactionAt: 0,
      burstLeft: 0,
      burstAt: 0,
      burstPauseUntil: 0,
      strafeSign: random() < 0.5 ? -1 : 1,
      strafeUntil: 0,
      heardAt: 0,
      scanPhase: random() * Math.PI * 2,
      fall: 0,
      defuseProgress: 0,
      seenAt: -10,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  function assignRound() {
    const plan = [
      { route: map.routes.toA, hold: map.holds.A[0] },
      { route: map.routes.toA, hold: map.holds.A[1] },
      { route: map.routes.toB, hold: map.holds.B[0] },
      { route: map.routes.toB, hold: map.holds.B[1] },
      { route: map.routes.mid, hold: map.holds.mid[0] },
    ];
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      bot.route = plan[i].route;
      bot.routeIndex = 0;
      bot.holdPoint = plan[i].hold.clone();
      bot.state = i === 4 ? 'patrol' : 'hold';
    }
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return false;
    bot.health -= amount;
    bot.defuseProgress = 0;
    if (bot.health > 0) {
      // Being shot at is loud and obvious: the bot knows where it came from.
      bot.lastKnown.copy(player.position());
      bot.hasKnown = true;
      return false;
    }
    bot.alive = false;
    bot.fall = 0;
    onBotKilled(bot);
    return true;
  }

  function hearShot(from) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      tmpToPlayer.copy(from).sub(bot.body.position);
      if (tmpToPlayer.length() < HEAR_DISTANCE) {
        bot.lastKnown.copy(from);
        bot.hasKnown = true;
        if (bot.state === 'hold' || bot.state === 'patrol') bot.state = 'hunt';
      }
    }
  }

  function sense(bot, time) {
    if (!player.state.alive) return;
    tmpToPlayer.copy(player.position()).sub(bot.body.position);
    tmpToPlayer.y = 0;
    const distance = tmpToPlayer.length();
    if (distance > VIEW_DISTANCE) return;
    const facing = Math.atan2(-tmpToPlayer.x, -tmpToPlayer.z);
    let angle = facing - bot.body.yaw;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) > VIEW_HALF_ANGLE) return;
    tmpEye.set(bot.body.position.x, bot.body.position.y + EYE_HEIGHT, bot.body.position.z);
    tmpTarget.set(player.position().x, player.position().y + 1.2, player.position().z);
    if (!losClear(map.shootables, raycaster, tmpEye, tmpTarget, tmpDirection)) return;
    const firstSight = !bot.hasKnown || time - bot.seenAt > 2;
    bot.lastKnown.copy(player.position());
    bot.hasKnown = true;
    bot.seenAt = time;
    if (firstSight) bot.reactionAt = time + range(random, 0.35, 0.8);
    if (bot.state !== 'defuse') bot.state = 'engage';
  }

  function shootAt(bot, time) {
    if (time < bot.burstPauseUntil) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.burstAt = time;
    }
    if (time < bot.burstAt) return;
    bot.burstAt = time + 0.13;
    bot.burstLeft -= 1;
    if (bot.burstLeft === 0) bot.burstPauseUntil = time + range(random, 0.7, 1.4);
    tmpToPlayer.copy(player.position()).sub(bot.body.position);
    const distance = tmpToPlayer.length();
    tmpMuzzle.set(bot.body.position.x, bot.body.position.y + 1.35, bot.body.position.z);
    tmpMuzzle.addScaledVector(tmpDirection.copy(tmpToPlayer).normalize(), 0.6);
    let hitChance = Math.max(0.08, 0.34 - distance * 0.006);
    if (player.groundSpeed() > 3) hitChance *= 0.65;
    if (player.state.crouching) hitChance *= 0.8;
    const hit = random() < hitChance;
    tmpTarget.copy(player.position());
    tmpTarget.y += 1.2;
    if (!hit) {
      tmpTarget.x += range(random, -1.2, 1.2);
      tmpTarget.y += range(random, -0.6, 0.9);
      tmpTarget.z += range(random, -1.2, 1.2);
    }
    fx.tracer(tmpMuzzle, tmpTarget, hit);
    audio.botShot(distance);
    if (hit) {
      const amount = Math.round(11 + random() * 5);
      onPlayerDamage(amount, Math.atan2(-(player.position().x - bot.body.position.x), -(player.position().z - bot.body.position.z)));
    }
  }

  function stepBot(bot, dt, time) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / FALL_SECONDS);
      bot.group.rotation.x = -bot.fall * 1.5;
      bot.group.position.y = -bot.fall * 0.1;
      return;
    }
    bot.nextSense -= dt;
    if (bot.nextSense <= 0) {
      bot.nextSense = SENSE_INTERVAL;
      sense(bot, time);
    }

    const probe = botsProbe;
    let wishX = 0;
    let wishZ = 0;
    let speed = 0;
    let faceYaw = bot.body.yaw;

    if (bot.state === 'engage' && player.state.alive) {
      tmpToPlayer.copy(player.position()).sub(bot.body.position);
      tmpToPlayer.y = 0;
      const distance = tmpToPlayer.length();
      faceYaw = Math.atan2(-tmpToPlayer.x, -tmpToPlayer.z);
      if (time > bot.strafeUntil) {
        bot.strafeUntil = time + range(random, 1, 2);
        bot.strafeSign *= -1;
      }
      const sideX = -tmpToPlayer.z / (distance || 1);
      const sideZ = tmpToPlayer.x / (distance || 1);
      if (distance > 14) {
        wishX = tmpToPlayer.x / distance;
        wishZ = tmpToPlayer.z / distance;
        speed = HUNT_SPEED;
      } else if (distance < 5) {
        wishX = -tmpToPlayer.x / distance;
        wishZ = -tmpToPlayer.z / distance;
        speed = HUNT_SPEED;
      } else {
        wishX = sideX * bot.strafeSign;
        wishZ = sideZ * bot.strafeSign;
        speed = STRAFE_SPEED;
      }
      if (time >= bot.reactionAt && bot.hasKnown) shootAt(bot, time);
    } else if (bot.state === 'defuse' && hooks.bombPosition) {
      tmpTarget.copy(hooks.bombPosition);
      tmpToPlayer.copy(tmpTarget).sub(bot.body.position);
      tmpToPlayer.y = 0;
      const distance = tmpToPlayer.length();
      if (distance > 1.8) {
        wishX = tmpToPlayer.x / distance;
        wishZ = tmpToPlayer.z / distance;
        speed = HUNT_SPEED;
        faceYaw = Math.atan2(-tmpToPlayer.x, -tmpToPlayer.z);
      } else {
        bot.defuseProgress += dt / 5;
        faceYaw += dt * 0.4;
        if (bot.defuseProgress >= 1) onDefused();
      }
    } else if (bot.state === 'hunt' && bot.hasKnown) {
      tmpToPlayer.copy(bot.lastKnown).sub(bot.body.position);
      tmpToPlayer.y = 0;
      const distance = tmpToPlayer.length();
      if (distance > 1.5) {
        wishX = tmpToPlayer.x / distance;
        wishZ = tmpToPlayer.z / distance;
        speed = HUNT_SPEED;
        faceYaw = Math.atan2(-tmpToPlayer.x, -tmpToPlayer.z);
      } else {
        bot.hasKnown = false;
        bot.state = bot.route.length > 0 ? 'patrol' : 'hold';
      }
    } else if (bot.state === 'patrol' && bot.route.length > 0) {
      const point = bot.route[bot.routeIndex % bot.route.length];
      tmpToPlayer.copy(point).sub(bot.body.position);
      tmpToPlayer.y = 0;
      const distance = tmpToPlayer.length();
      if (distance < 1.2) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.state = 'hold';
        }
      } else {
        wishX = tmpToPlayer.x / distance;
        wishZ = tmpToPlayer.z / distance;
        speed = WALK_SPEED;
        faceYaw = Math.atan2(-tmpToPlayer.x, -tmpToPlayer.z);
      }
    } else {
      // hold: stand and scan the angle, slowly.
      bot.scanPhase += dt * 0.5;
      faceYaw = Math.atan2(
        -(bot.holdPoint.x - bot.body.position.x),
        -(bot.holdPoint.z - bot.body.position.z),
      ) + Math.sin(bot.scanPhase) * 0.7;
    }

    stepBody(bot.body, wishX, wishZ, speed, dt, 30, 8, probe, false);
    bot.body.yaw = faceYaw;
    bot.group.position.copy(bot.body.position);
    bot.group.rotation.set(0, bot.body.yaw, 0);
  }

  const botsProbe = new THREE.Box3();

  return {
    bots,
    hitMeshes,
    assignRound,
    damage,
    hearShot,
    aliveCount() {
      let count = 0;
      for (const bot of bots) if (bot.alive) count += 1;
      return count;
    },
    sendToDefuse(position) {
      hooks.bombPosition = position;
      for (const bot of bots) {
        if (bot.alive) {
          bot.state = 'defuse';
          bot.defuseProgress = 0;
        }
      }
    },
    reset(spawns) {
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        const spawn = spawns[i % spawns.length];
        bot.body.position.copy(spawn);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = 0;
        bot.health = HEALTH;
        bot.alive = true;
        bot.fall = 0;
        bot.hasKnown = false;
        bot.burstLeft = 0;
        bot.defuseProgress = 0;
        bot.group.rotation.set(0, 0, 0);
        bot.group.position.copy(spawn);
      }
      assignRound();
    },
    step(dt, time) {
      for (const bot of bots) stepBot(bot, dt, time);
    },
  };
}
