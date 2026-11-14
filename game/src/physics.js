// One shared mover: an axis-aligned body (a box with a radius and a height) resolved
// against the world's colliders one axis at a time, so a wall never swallows a body and
// sliding along a wall just works. The player and the bots both drive it; the only
// difference is who picks the wish direction. All scratch state is allocated once here,
// never per step.
import * as THREE from 'three';

const RADIUS = 0.34;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;

export function createBody(colliders, x, z) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    height: 1.72,
    onGround: true,
    colliders,
  };
}

// The probe lifts the feet and the crown out of the horizontal tests, so standing on a
// floor is not read as walking into a wall. `lift` in metres; returns the collider hit.
export function overlaps(body, x, y, z, height, lift, probe) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  const list = body.colliders;
  for (let i = 0; i < list.length; i += 1) {
    if (probe.intersectsBox(list[i])) return list[i];
  }
  return null;
}

// wish: a unit XZ direction (or zero), speed: target m/s, dt: seconds.
// accel/friction shape how fast the body reaches the wish speed; jump only when told.
export function stepBody(body, wishX, wishZ, speed, dt, accel, friction, probe, wantJump) {
  const blend = Math.min(1, (accel * dt) / speed);
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }

  if (wantJump && body.onGround) {
    body.velocity.y = JUMP_SPEED;
    body.onGround = false;
  }
  body.velocity.y -= GRAVITY * dt;

  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(body, nextX, body.position.y, body.position.z, body.height, 0.04, probe)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(body, body.position.x, body.position.y, nextZ, body.height, 0.04, probe)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }

  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(body, body.position.x, body.position.y, body.position.z, body.height, 0, probe);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  if (body.velocity.y < -30) body.velocity.y = -30;
}

// A cheap point test for small things (grenades, bomb carriers) against the same boxes.
export function pointBlocked(colliders, x, y, z, radius) {
  for (let i = 0; i < colliders.length; i += 1) {
    const box = colliders[i];
    if (
      x > box.min.x - radius && x < box.max.x + radius &&
      y > box.min.y - radius && y < box.max.y + radius &&
      z > box.min.z - radius && z < box.max.z + radius
    ) return box;
  }
  return null;
}
