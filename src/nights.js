import * as THREE from 'three';
import { manifest, smooth } from './core.js';
import { photo } from './materials.js';

/* The rising spiral: every night hangs on a helix over the stage and the camera
   climbs the middle of it, turning to face each one. */
export const HELIX = { x: 0, z: -104, y0: 15, stepY: 1.75, stepA: 1.02, r: 8.4 };

export const panelAngle = (i) => Math.PI * .5 + i * HELIX.stepA;

export function buildNights() {
  const group = new THREE.Group();
  const items = manifest.nights.map((name, i) => {
    const a = panelAngle(i);
    const portrait = manifest.p[name] < 1;
    const p = photo(name, { height: portrait ? 6.1 : 4.4, relief: .7, frame: 1, bend: 14 });
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const pos = new THREE.Vector3(HELIX.x, HELIX.y0 + i * HELIX.stepY, HELIX.z).addScaledVector(dir, HELIX.r);
    p.mesh.position.copy(pos);
    p.mesh.lookAt(HELIX.x, pos.y, HELIX.z);
    group.add(p.mesh);
    return { p, pos, a, dir };
  });
  return {
    group, items,
    update(s) {
      const burst = smooth(s, .875, .925);
      for (const it of items) {
        it.p.mesh.userData.tick();
        it.p.mesh.position.copy(it.pos).addScaledVector(it.dir, burst * burst * 60);
        it.p.mesh.position.y += burst * 18;
        it.p.uniforms.uOpacity.value = 1 - smooth(s, .895, .925);
      }
      group.visible = s > .68 && s < .93;
    },
  };
}
