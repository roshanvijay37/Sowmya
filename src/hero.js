import * as THREE from 'three';
import logoData from './logo-paths.json';
import { isMobile, shared } from './core.js';
import { beam } from './materials.js';

/* Her logo, as geometry. Traced from Logo/logo.png by tools/trace_logo.py. */
export function logoGeometry(width = 6, depth = .13) {
  const path = new THREE.ShapePath();
  for (const c of logoData.curves) {
    path.moveTo(c.s[0], -c.s[1]);
    for (const g of c.d) {
      if (g[0] === 'L') { path.lineTo(g[1], -g[2]); path.lineTo(g[3], -g[4]); }
      else path.bezierCurveTo(g[1], -g[2], g[3], -g[4], g[5], -g[6]);
    }
  }
  // Sort outlines from holes by winding, so O, a, o and the mic stay open.
  const shapes = path.toShapes(false);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: depth / width, bevelEnabled: true, bevelThickness: .012, bevelSize: .0035, bevelSegments: 3,
    curveSegments: isMobile ? 6 : 10,
  });
  geo.scale(width, width, width);
  geo.center();
  return geo;
}

export const gold = (over = {}) => new THREE.MeshPhysicalMaterial({
  color: '#efc26a', metalness: 1, roughness: .3, clearcoat: .4, clearcoatRoughness: .3, envMapIntensity: 1.25, ...over,
});

function grilleTexture() {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.lineWidth = 11;
  const step = 64;
  for (let i = -S; i < S * 2; i += step) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 16);
  t.anisotropy = 8;
  return t;
}

/* A real capsule microphone, nested in the mic she drew in her logo. */
function buildMic() {
  const g = new THREE.Group();
  const r = .4, half = .42;
  const capsule = new THREE.CapsuleGeometry(r, half * 2, 24, 64);
  // The built-in UVs squash the straight section to a sliver, turning the mesh into stripes.
  {
    const P = capsule.getAttribute('position'), UV = capsule.getAttribute('uv');
    for (let i = 0; i < P.count; i++) {
      UV.setXY(i, Math.atan2(P.getZ(i), P.getX(i)) / (Math.PI * 2) + .5, P.getY(i) / (Math.PI * 2 * r));
    }
  }
  const metal = gold({ roughness: .2 });
  const grille = new THREE.Mesh(capsule, gold({
    alphaMap: grilleTexture(), transparent: true, alphaTest: .03, side: THREE.DoubleSide, color: '#f4d58e', roughness: .3,
  }));
  grille.renderOrder = 1;
  g.add(grille);

  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(r * .93, half * 2, 16, 40), new THREE.MeshBasicMaterial({ color: '#0b0704' }));
  g.add(inner);

  // The element inside: what the viewer flies into.
  const coreU = { uP: { value: .5 } };
  const core = new THREE.Mesh(new THREE.SphereGeometry(r * .5, 32, 32), new THREE.ShaderMaterial({
    uniforms: coreU,
    vertexShader: 'varying vec3 vN,vV; void main(){vN=normalize(normalMatrix*normal); vec4 m=modelViewMatrix*vec4(position,1.); vV=normalize(-m.xyz); gl_Position=projectionMatrix*m;}',
    fragmentShader: 'uniform float uP; varying vec3 vN,vV; void main(){float f=pow(abs(dot(vN,vV)),1.5); gl_FragColor=vec4(vec3(2.6,1.7,.75)*f*uP,1.);}',
  }));
  core.scale.set(.8, 1.5, .8);

  for (const y of [-half * .55, 0, half * .55]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, .017, 12, 80), metal);
    band.rotation.x = Math.PI / 2; band.position.y = y;
    g.add(band);
  }
  const cap = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, .03, 14, 80), metal);
  cap.rotation.x = Math.PI / 2; cap.position.y = -half - .02;
  g.add(cap);
  return { g, inner, grille, core, coreU };
}

export function buildHero(scene) {
  const group = new THREE.Group();
  const width = 6;
  const logo = new THREE.Mesh(logoGeometry(width), gold());
  group.add(logo);
  const CY = 1.8;
  logo.position.y = CY;

  // Centre of the mic drawn in the logo, in logo-widths, read from the trace.
  const mic = buildMic();
  const micAt = new THREE.Vector3(.4195 * width, CY + .195 * width, .02);
  mic.g.position.copy(micAt);
  mic.g.scale.setScalar(.92);
  mic.core.position.copy(micAt);
  group.add(mic.g);
  scene.add(mic.core);
  mic.core.visible = false;

  const key = new THREE.SpotLight('#ffe6bf', 240, 26, .42, .75, 1.6);
  key.position.set(-2.2, 9, 7);
  key.target.position.set(0, 1.9, 0);
  group.add(key, key.target);
  const rim = new THREE.PointLight('#ff5ba6', 16, 14);
  rim.position.set(5, 1, -2.2);
  const rim2 = new THREE.PointLight('#6ea0ff', 12, 14);
  rim2.position.set(-6, 3.4, -2.2);
  group.add(rim, rim2);

  const shaft = beam({ len: 15, top: .07, bottom: 3.5, color: '#ffe3b4', power: .24 });
  shaft.position.copy(key.position);
  group.add(shaft);
  const q = new THREE.Quaternion();
  const dir = key.target.position.clone().sub(key.position).normalize();
  q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  shaft.quaternion.copy(q);

  return {
    group, key, rim, rim2, shaft, logo, mic, micAt,
    update(s, intro, pointer, calm) {
      const flick = intro < 1 && !calm ? (Math.sin(shared.uTime.value * 41) > -.2 || intro > .45 ? 1 : .15) : 1;
      key.intensity = 240 * intro * flick;
      shaft.material.uniforms.uPower.value = .24 * intro * flick;
      rim.intensity = 16 * intro; rim2.intensity = 12 * intro;
      key.target.position.x = pointer.x * 3.4;
      key.target.position.y = 1.9 + pointer.y * 1.8;
      rim.position.x = 5 + Math.sin(shared.uTime.value * .4) * 1.5;
      dir.copy(key.target.position).sub(key.position).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      shaft.quaternion.copy(q);
    },
  };
}
