// What a shot leaves behind: tracers, impact dust and the grenade's fireball.
// Everything is pooled and preallocated — a tracer is a line whose two endpoints get
// rewritten, never a new mesh — so a firefight allocates nothing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 14;
const TRACER_LIFE = 0.09;
const PUFF_POOL = 10;
const PUFF_LIFE = 0.5;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, positions, life: 0 });
  }

  const puffs = [];
  const puffGeometry = new THREE.SphereGeometry(0.12, 8, 6);
  const puffMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.muted), transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < PUFF_POOL; i += 1) {
    const mesh = new THREE.Mesh(puffGeometry, puffMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0 });
  }

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22);
  scene.add(blastLight);
  let blastLife = 0;

  function tracer(from, to, hit) {
    for (const item of tracers) {
      if (item.life > 0) continue;
      item.positions[0] = from.x;
      item.positions[1] = from.y;
      item.positions[2] = from.z;
      item.positions[3] = to.x;
      item.positions[4] = to.y;
      item.positions[5] = to.z;
      item.line.geometry.attributes.position.needsUpdate = true;
      item.line.material.color.set(hit ? PALETTE.accent : PALETTE.muted);
      item.line.visible = true;
      item.life = TRACER_LIFE;
      return;
    }
  }

  function impact(point) {
    for (const item of puffs) {
      if (item.life > 0) continue;
      item.mesh.position.copy(point);
      item.mesh.scale.set(1, 1, 1);
      item.mesh.visible = true;
      item.life = PUFF_LIFE;
      return;
    }
  }

  function explosion(point) {
    blast.position.copy(point);
    blast.scale.set(0.3, 0.3, 0.3);
    blast.visible = true;
    blastLight.position.copy(point);
    blastLight.intensity = 60;
    blastLife = 0.45;
  }

  function step(dt) {
    for (const item of tracers) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) item.line.visible = false;
    }
    for (const item of puffs) {
      if (item.life <= 0) continue;
      item.life -= dt;
      const k = 1 + (PUFF_LIFE - item.life) * 4;
      item.mesh.scale.set(k, k, k);
      item.mesh.material.opacity = Math.max(0, item.life / PUFF_LIFE) * 0.7;
      if (item.life <= 0) item.mesh.visible = false;
    }
    if (blastLife > 0) {
      blastLife -= dt;
      const k = 1 + (0.45 - blastLife) * 14;
      blast.scale.set(k, k, k);
      blast.material.opacity = Math.max(0, blastLife / 0.45) * 0.85;
      blastLight.intensity = Math.max(0, blastLife / 0.45) * 60;
      if (blastLife <= 0) {
        blast.visible = false;
        blastLight.intensity = 0;
      }
    }
  }

  return { tracer, impact, explosion, step };
}
