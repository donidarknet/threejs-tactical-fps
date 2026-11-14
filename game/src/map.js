// Kestrel Station: a decommissioned freight relay yard at dusk, built from boxes.
// Two bomb sites (Relay Hall west, Freight Dock east), a long north lane with one
// clean sightline, a container cross at mid, and crates to crouch behind. Every box
// is a collider for bodies and a surface a bullet stops on. The map owns the spawn
// points, the bot routes and the line-of-sight test, so the AI never guesses.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HALF_X = 20;
const HALF_Z = 16;
const WALL_H = 5;

export function createMap(scene) {
  const group = new THREE.Group();
  group.name = 'kestrel-station';
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.94,
      metalness: 0.04,
    });
  }
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  const siteMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.site),
    emissive: new THREE.Color(PALETTE.site),
    emissiveIntensity: 0.55,
    roughness: 0.5,
    transparent: true,
    opacity: 0.65,
  });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter.
  box(2 * HALF_X + 0.8, 0.4, 2 * HALF_Z + 0.8, 0, -0.2, 0, 'ground');
  box(0.4, WALL_H, 2 * HALF_Z + 0.8, -HALF_X - 0.2, WALL_H / 2, 0, 'surface');
  box(0.4, WALL_H, 2 * HALF_Z + 0.8, HALF_X + 0.2, WALL_H / 2, 0, 'surface');
  box(2 * HALF_X + 0.8, WALL_H, 0.4, 0, WALL_H / 2, -HALF_Z - 0.2, 'surface');
  box(2 * HALF_X + 0.8, WALL_H, 0.4, 0, WALL_H / 2, HALF_Z + 0.2, 'surface');

  // The container cross at mid: two long boxes with a gap between them, so mid has
  // a left lane, a right lane and a tight squeeze through the middle.
  box(6.2, 2.6, 2.4, -3.4, 1.3, 0, 'surface');
  box(6.2, 2.6, 2.4, 3.4, 1.3, 0, 'surface');
  box(2.4, 2.6, 6.2, 0, 1.3, -5.4, 'hairline');
  box(2.4, 1.3, 2.4, 0, 0.65, 4.6, 'hairline');

  // Crates to crouch behind, scattered so no lane is a shooting gallery.
  box(1.2, 1.1, 1.2, -8, 0.55, 6, 'hairline');
  box(1.2, 1.1, 1.2, 8, 0.55, 6, 'hairline');
  box(1.2, 1.1, 1.2, -11, 0.55, -2, 'hairline');
  box(1.2, 1.1, 1.2, 11, 0.55, -2, 'hairline');
  box(1.2, 1.1, 3.6, -14, 0.55, 4, 'hairline');
  box(1.2, 1.1, 3.6, 14, 0.55, 4, 'hairline');
  box(3.6, 1.1, 1.2, -4, 0.55, -9, 'hairline');
  box(3.6, 1.1, 1.2, 4, 0.55, -9, 'hairline');
  box(1.6, 0.7, 1.6, -7.5, 0.35, -12.5, 'hairline');
  box(1.6, 0.7, 1.6, 7.5, 0.35, -12.5, 'hairline');

  // Tall pillars break the long north lane into three sightlines instead of one.
  box(1.2, 4.6, 1.2, -9, 2.3, -13.2, 'surface');
  box(1.2, 4.6, 1.2, 9, 2.3, -13.2, 'surface');
  box(1.2, 4.6, 1.2, 0, 2.3, -13.2, 'surface');

  // South platform: a half-metre slab the player can jump onto for a sightline
  // over the mid crates. Bots never climb it; they walk around it.
  box(5, 0.5, 3, 0, 0.25, 10.5, 'surface');

  // Site pads: a glowing disc and a beacon column, so a site reads at a glance.
  function sitePad(x, z) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.08, 40), siteMaterial);
    pad.position.set(x, 0.04, z);
    pad.receiveShadow = true;
    group.add(pad);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 4.4, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site), transparent: true, opacity: 0.28 }),
    );
    beam.position.set(x, 2.2, z);
    group.add(beam);
    return { pad, beam };
  }
  const padA = sitePad(-15.5, -11);
  const padB = sitePad(15.5, -11);

  // Sodium lamps on the walls: emissive boxes, no extra lights.
  for (const [x, z] of [[-19.5, 0], [19.5, 0], [0, -15.5], [-10, -15.5], [10, -15.5], [0, 15.5]]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.28), lampMaterial);
    lamp.position.set(x, 4.2, z);
    group.add(lamp);
  }

  // Light: a low amber sun from the west, a cool dusk fill, and a sky gradient.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 68);
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.sky), new THREE.Color(PALETTE.ground), 1.25);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 2.1);
  key.position.set(-16, 18, 10);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.75);
  fill.position.set(12, 10, 12);
  scene.add(fill);

  const sites = {
    A: { name: 'Relay Hall', center: new THREE.Vector3(-15.5, 0, -11), radius: 4, pad: padA.pad, beam: padA.beam },
    B: { name: 'Freight Dock', center: new THREE.Vector3(15.5, 0, -11), radius: 4, pad: padB.pad, beam: padB.beam },
  };

  return {
    group,
    colliders,
    shootables,
    sites,
    playerSpawn: new THREE.Vector3(0, 0, 13.5),
    botSpawns: [
      new THREE.Vector3(-8, 0, -13.5),
      new THREE.Vector3(-4, 0, -13.5),
      new THREE.Vector3(0, 0, -13.5),
      new THREE.Vector3(4, 0, -13.5),
      new THREE.Vector3(8, 0, -13.5),
    ],
    routes: {
      toA: [
        new THREE.Vector3(0, 0, 8),
        new THREE.Vector3(-6, 0, 2),
        new THREE.Vector3(-12, 0, -4),
        new THREE.Vector3(-15, 0, -9),
      ],
      toB: [
        new THREE.Vector3(0, 0, 8),
        new THREE.Vector3(6, 0, 2),
        new THREE.Vector3(12, 0, -4),
        new THREE.Vector3(15, 0, -9),
      ],
      mid: [
        new THREE.Vector3(0, 0, 8),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -6),
        new THREE.Vector3(0, 0, -12),
      ],
    },
    holds: {
      A: [new THREE.Vector3(-17.5, 0, -7.5), new THREE.Vector3(-12.5, 0, -13.5)],
      B: [new THREE.Vector3(17.5, 0, -7.5), new THREE.Vector3(12.5, 0, -13.5)],
      mid: [new THREE.Vector3(-1.5, 0, -4), new THREE.Vector3(1.5, 0, -4)],
    },
  };
}

// True when nothing solid stands between two points. The raycaster and the
// direction vector are passed in and reused, so the check allocates nothing.
export function losClear(shootables, raycaster, from, to, direction) {
  direction.copy(to).sub(from);
  const distance = direction.length();
  if (distance < 0.001) return true;
  direction.multiplyScalar(1 / distance);
  raycaster.set(from, direction);
  raycaster.far = distance;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  return !hit || hit.distance > distance - 0.35;
}
