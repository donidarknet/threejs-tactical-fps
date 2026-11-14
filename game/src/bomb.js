// The Charge: the bomb objective, as a small state machine. The carrier (the player)
// holds E inside a site to plant; the fuse runs 35 seconds; the Jackals walk in to
// defuse, and taking a bullet resets their progress. The module owns the timers and
// the blinking charge mesh, and calls back when the round is decided by the bomb.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const FUSE_SECONDS = 35;

export function createBomb(scene, map, hooks) {
  const { onExploded, onDefused } = hooks;
  const mesh = new THREE.Group();
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.5, metalness: 0.3 }),
  );
  const lightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.foe) }),
  );
  lightMesh.position.set(0, 0.16, 0);
  mesh.add(caseMesh, lightMesh);
  mesh.visible = false;
  scene.add(mesh);

  const state = {
    carried: true,
    planted: false,
    site: null,
    position: new THREE.Vector3(),
    plantProgress: 0,
    fuseLeft: 0,
    blink: 0,
  };

  function tryPlant(playerPos, dt) {
    if (!state.carried || state.planted) return 0;
    let site = null;
    for (const key of Object.keys(map.sites)) {
      const s = map.sites[key];
      const dx = playerPos.x - s.center.x;
      const dz = playerPos.z - s.center.z;
      if (dx * dx + dz * dz < s.radius * s.radius) {
        site = key;
        break;
      }
    }
    if (!site) {
      state.plantProgress = 0;
      return 0;
    }
    state.plantProgress = Math.min(1, state.plantProgress + dt / PLANT_SECONDS);
    if (state.plantProgress >= 1) {
      state.carried = false;
      state.planted = true;
      state.site = site;
      state.position.set(playerPos.x, 0.12, playerPos.z);
      state.fuseLeft = FUSE_SECONDS;
      mesh.position.copy(state.position);
      mesh.visible = true;
    }
    return state.plantProgress;
  }

  function step(dt) {
    if (state.planted) {
      state.fuseLeft -= dt;
      state.blink += dt;
      const on = Math.sin(state.blink * 10) > 0;
      lightMesh.material.color.set(on ? PALETTE.accent : PALETTE.foe);
      if (state.fuseLeft <= 0) {
        state.planted = false;
        mesh.visible = false;
        onExploded();
      }
    }
  }

  function reset() {
    state.carried = true;
    state.planted = false;
    state.site = null;
    state.plantProgress = 0;
    state.fuseLeft = 0;
    mesh.visible = false;
  }

  return {
    state,
    tryPlant,
    step,
    reset,
    defuseCalled() {
      if (!state.planted) return;
      state.planted = false;
      mesh.visible = false;
      onDefused();
    },
  };
}

export const BOMB_TIMING = { PLANT_SECONDS, DEFUSE_SECONDS, FUSE_SECONDS };
