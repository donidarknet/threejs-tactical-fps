// The arsenal: four guns and one grenade, each with its own numbers. The module owns
// the view model, the magazine, the reload, the bloom that punishes spraying and the
// spread that punishes firing on the move. It never touches the world: main.js does
// the ray and the damage, and reports back what a shot hit. Grenades are projectiles
// here too, with a fuse and a bounce; the explosion's damage is main.js's job.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { pointBlocked } from './physics.js';

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P-4 Sidearm', key: '1', price: 0,
    damage: 26, headMult: 4, mag: 12, reserve: 36, gap: 0.22, reload: 1.4,
    auto: false, spreadStill: 0.002, spreadMove: 0.02, bloomPerShot: 0.004, bloomMax: 0.03,
    recoil: 0.008, barrel: 0.22, colour: 'ink',
  },
  carbine: {
    id: 'carbine', name: 'VK-7 Carbine', key: '2', price: 2700,
    damage: 34, headMult: 4, mag: 30, reserve: 90, gap: 0.105, reload: 1.9,
    auto: true, spreadStill: 0.0022, spreadMove: 0.028, bloomPerShot: 0.0035, bloomMax: 0.035,
    recoil: 0.011, barrel: 0.42, colour: 'ink',
  },
  smg: {
    id: 'smg', name: 'Rook-9 SMG', key: '3', price: 1500,
    damage: 22, headMult: 4, mag: 32, reserve: 96, gap: 0.085, reload: 1.6,
    auto: true, spreadStill: 0.004, spreadMove: 0.034, bloomPerShot: 0.004, bloomMax: 0.045,
    recoil: 0.007, barrel: 0.3, colour: 'hairline',
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', key: '4', price: 4750,
    damage: 82, headMult: 3.5, mag: 5, reserve: 15, gap: 0.9, reload: 2.6,
    auto: false, spreadStill: 0.0006, spreadMove: 0.05, bloomPerShot: 0.02, bloomMax: 0.06,
    recoil: 0.03, barrel: 0.62, colour: 'accent',
  },
};

export const GRENADE = { id: 'grenade', name: 'Spark Grenade', key: '5', price: 300, fuse: 1.4, radius: 6, maxDamage: 120 };
const GRENADE_THROW_COOLDOWN = 0.8;

export function createWeapons(camera, hooks) {
  const { fx, audio } = hooks;
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  model.position.set(0.26, -0.22, -0.48);
  model.scale.setScalar(0.85);
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const owned = new Set(['sidearm']);
  let currentId = 'sidearm';
  let cooldown = 0;
  let reloadLeft = 0;
  let flashLeft = 0;
  let kick = 0;
  let bloom = 0;
  let triggerLatch = false;
  let grenades = 0;
  let throwCooldown = 0;
  const projectiles = [];
  const projectileMeshes = [];
  const grenadeNext = new THREE.Vector3();
  const grenadeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.4 });

  function buildModel(def) {
    while (model.children.length > 0) model.remove(model.children[0]);
    const mat = def.colour === 'accent' ? accentMat : bodyMat;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), mat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
    barrel.position.set(0, 0.025, -0.21 - def.barrel / 2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accentMat);
    sight.position.set(0, 0.075, -0.1);
    model.add(receiver, barrel, stock, sight);
  }
  buildModel(WEAPONS.sidearm);

  function def() {
    return WEAPONS[currentId];
  }

  function step(dt) {
    cooldown = Math.max(0, cooldown - dt);
    flashLeft = Math.max(0, flashLeft - dt);
    throwCooldown = Math.max(0, throwCooldown - dt);
    kick += (0 - kick) * Math.min(1, dt * 14);
    bloom = Math.max(0, bloom - dt * 0.06);
    model.position.z = -0.48 + kick;
    model.rotation.x = kick * 2.2;
    flash.visible = flashLeft > 0;
    if (flashLeft > 0) flash.rotation.z = flashLeft * 30;
    flashLight.intensity = flashLeft > 0 ? 18 : 0;
    if (reloadLeft > 0) {
      reloadLeft = Math.max(0, reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - reloadLeft) * 2);
      if (reloadLeft === 0) {
        const need = def().mag - ammo[currentId].mag;
        const take = Math.min(need, ammo[currentId].reserve);
        ammo[currentId].mag += take;
        ammo[currentId].reserve -= take;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      p.fuse -= dt;
      p.velocity.y -= 20 * dt;
      grenadeNext.copy(p.position).addScaledVector(p.velocity, dt);
      const hit = hooks.colliders ? pointBlocked(hooks.colliders, grenadeNext.x, grenadeNext.y, grenadeNext.z, 0.12) : null;
      if (hit) {
        // Bounce off the box: flip the velocity along the shallowest axis.
        const cx = (hit.min.x + hit.max.x) / 2;
        const cy = (hit.min.y + hit.max.y) / 2;
        const cz = (hit.min.z + hit.max.z) / 2;
        const dx = Math.abs(grenadeNext.x - cx) - (hit.max.x - hit.min.x) / 2;
        const dy = Math.abs(grenadeNext.y - cy) - (hit.max.y - hit.min.y) / 2;
        const dz = Math.abs(grenadeNext.z - cz) - (hit.max.z - hit.min.z) / 2;
        if (dx > dy && dx > dz) p.velocity.x *= -0.45;
        else if (dy > dx && dy > dz) p.velocity.y *= -0.45;
        else p.velocity.z *= -0.45;
        p.velocity.multiplyScalar(0.8);
      } else {
        p.position.copy(grenadeNext);
      }
      if (p.position.y < 0.09) {
        p.position.y = 0.09;
        p.velocity.y = Math.abs(p.velocity.y) * 0.45;
        p.velocity.x *= 0.75;
        p.velocity.z *= 0.75;
      }
      projectileMeshes[i].position.copy(p.position);
      if (p.fuse <= 0) {
        hooks.onGrenade(p.position);
        fx.explosion(p.position);
        audio.explosion();
        hooks.scene.remove(projectileMeshes[i]);
        projectiles.splice(i, 1);
        projectileMeshes.splice(i, 1);
      }
    }
  }

  return {
    catalog: WEAPONS,
    grenadeDef: GRENADE,
    owned,
    currentId: () => currentId,
    def,
    state() {
      return ammo[currentId];
    },
    ammoOf(id) {
      return ammo[id];
    },
    grenades: () => grenades,
    buy(id) {
      if (owned.has(id)) return { ok: false, cost: 0, reason: 'owned' };
      const cost = WEAPONS[id].price;
      owned.add(id);
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return { ok: true, cost };
    },
    buyGrenade() {
      grenades += 1;
      return GRENADE.price;
    },
    select(id) {
      if (!owned.has(id) || id === currentId) return false;
      currentId = id;
      reloadLeft = 0;
      cooldown = 0;
      bloom = 0;
      buildModel(WEAPONS[id]);
      return true;
    },
    ready() {
      return ammo[currentId].mag > 0 && cooldown === 0 && reloadLeft === 0;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove + bloom;
    },
    tryFire(firing) {
      if (!firing) {
        triggerLatch = false;
        return { fired: false, spread: 0 };
      }
      const d = def();
      if (!d.auto && triggerLatch) return { fired: false, spread: 0 };
      if (ammo[currentId].mag <= 0 || cooldown > 0 || reloadLeft > 0) return { fired: false, spread: 0 };
      ammo[currentId].mag -= 1;
      cooldown = d.gap;
      flashLeft = 0.06;
      kick = 0.055;
      bloom = Math.min(d.bloomMax, bloom + d.bloomPerShot);
      triggerLatch = true;
      audio.shot(currentId);
      return { fired: true, spread: d.spreadStill + bloom };
    },
    reload() {
      if (reloadLeft > 0 || ammo[currentId].mag === def().mag || ammo[currentId].reserve === 0) return false;
      reloadLeft = def().reload;
      audio.reload();
      return true;
    },
    throwGrenade(origin, direction, random) {
      if (grenades <= 0 || throwCooldown > 0) return false;
      grenades -= 1;
      throwCooldown = GRENADE_THROW_COOLDOWN;
      const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
      mesh.position.copy(origin);
      hooks.scene.add(mesh);
      const velocity = direction.clone().multiplyScalar(16);
      velocity.y += 4 + random() * 0.5;
      projectiles.push({ position: origin.clone(), velocity, fuse: GRENADE.fuse });
      projectileMeshes.push(mesh);
      audio.throwGrenade();
      return true;
    },
    refill() {
      for (const id of Object.keys(WEAPONS)) {
        ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      owned.clear();
      owned.add('sidearm');
      currentId = 'sidearm';
      grenades = 0;
      cooldown = 0;
      reloadLeft = 0;
      bloom = 0;
      buildModel(WEAPONS.sidearm);
      for (const mesh of projectileMeshes) hooks.scene.remove(mesh);
      projectiles.length = 0;
      projectileMeshes.length = 0;
    },
    step,
  };
}
