// The player: a body from physics.js plus a head. Acceleration, friction, crouch and
// jump live here; the collision itself is the shared mover, so the player and the
// bots agree about what a wall is. Health is simple: 100, no regen, damage comes in
// with a direction so the HUD can flash where it came from.
import { createBody, overlaps, stepBody } from './physics.js';
import * as THREE from 'three';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 44;
const AIR_ACCEL = 10;
const FRICTION = 9.5;
const MAX_HEALTH = 100;

export function createPlayer(colliders) {
  const body = createBody(colliders, 0, 13.5);
  const probe = new THREE.Box3();
  const state = {
    body,
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    health: MAX_HEALTH,
    alive: true,
    lastDamageDir: 0,
  };

  function look(dx, dy, sensitivity = 0.0021) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching) {
      const headroom = overlaps(body, body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02, probe);
      if (!headroom) {
        state.crouching = false;
        body.height = STAND_HEIGHT;
      }
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const speed = state.crouching ? CROUCH_SPEED : WALK_SPEED;
    let wishX = 0;
    let wishZ = 0;
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      const length = Math.hypot(wishX, wishZ);
      wishX /= length;
      wishZ /= length;
    }
    const accel = body.onGround ? GROUND_ACCEL : AIR_ACCEL;
    stepBody(body, wishX, wishZ, speed, dt, accel, FRICTION, probe, keys.has('Space'));
  }

  function damage(amount, fromYaw) {
    if (!state.alive) return 0;
    state.health -= amount;
    state.lastDamageDir = fromYaw;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
    }
    return amount;
  }

  function reset(spawn) {
    body.position.copy(spawn);
    body.velocity.set(0, 0, 0);
    body.height = STAND_HEIGHT;
    body.onGround = true;
    state.yaw = 0;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.crouching = false;
    state.health = MAX_HEALTH;
    state.alive = true;
  }

  return {
    state,
    body,
    step,
    look,
    recoil,
    damage,
    reset,
    position() {
      return body.position;
    },
    eyeHeight() {
      return state.eye;
    },
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
