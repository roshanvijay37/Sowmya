import * as THREE from 'three';
import { loadImage, manifest, plateURL, shared } from './core.js';
import { beam, contactShadow, cutout, photo } from './materials.js';

/* Wardrobe. Her portraits stand over still water, and the world
   takes on the colour of what she is wearing, walking from green to gold to red, so
   the red velvet curtain at the end of the corridor feels inevitable. */
export const SPACING = 8.4;
export const START_Z = -10;

export function buildSilk() {
  const group = new THREE.Group();
  const items = manifest.silk.map((name, i) => {
    const side = i % 2 ? 1 : -1;
    const z = START_Z - i * SPACING;
    const x = side * 2.45;
    const rotY = -side * .5;
    const free = manifest.free.includes(name);
    let p, c;
    if (free) {
      // Head to toe in the photo: she stands on the water herself.
      c = cutout(name, { height: 5.1, rim: '#ffe3b4', stencil: false });
      c.uniforms.uOn.value = 1;
      c.mesh.position.set(x, 0, z); c.mir.position.set(x, 0, z);
      group.add(c.mesh, c.mir);
      const sh = contactShadow(manifest.c[name] * 5.1);
      sh.position.set(x, .012, z + .05);
      group.add(sh);
    } else {
      // The photo stops at her waist or knees, so it stays whole: nothing about her is cut.
      p = photo(name, { height: 5.3, relief: .6, frame: 1, mirror: true });
      p.mesh.position.set(x, 3.05, z); p.mesh.rotation.y = rotY;
      p.mir.position.set(x, -3.05, z); p.mir.rotation.y = rotY;
      group.add(p.mesh, p.mir);
    }

    // Behind her, her real surroundings: the photo's own background as a soft cloud of colour.
    const plateU = { uMap: { value: null }, uIn: { value: 0 }, uFog: shared.uFog, uFogAmt: shared.uFogAmt };
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(19, 15), new THREE.ShaderMaterial({
      uniforms: plateU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; varying float vD; void main(){vUv=uv; vec4 m=modelViewMatrix*vec4(position,1.); vD=-m.z; gl_Position=projectionMatrix*m;}',
      fragmentShader: `uniform sampler2D uMap; uniform float uIn, uFogAmt; uniform vec3 uFog; varying vec2 vUv; varying float vD;
        void main(){
          vec2 q=(vUv-.5)*2.;
          float a=pow(max(0.,1.-dot(q,q)),2.4);
          vec3 c=texture2D(uMap, vUv*.8+.1).rgb;
          float l=dot(c,vec3(.3,.6,.1));
          c=mix(vec3(l),c,1.5)*.62;                 // richer and calmer than the raw background
          c=mix(c,uFog,clamp(1.-exp(-vD*uFogAmt),0.,1.));
          gl_FragColor=vec4(max(c,vec3(0.)), a*uIn*.62);
        }`,
    }));
    plate.position.set(x + side * 1, 4.4, z - 2.6);
    plate.rotation.y = rotY * .6;
    plate.renderOrder = -1;
    loadImage(plateURL(name), (t) => { plateU.uMap.value = t; plateU.uIn.value = 1; });
    group.add(plate);
    const shaft = beam({ len: 15, top: .35, bottom: 2.3, color: '#fff2dc', power: .2 });
    shaft.position.set(x - side * 3.2, 12.4, z - .6);
    shaft.rotation.z = side * .25;
    group.add(shaft);
    return { p, c, side, z, x, mesh: (p || c).mesh };
  });

  // Still water: a dark glass sheet above the upside-down silk.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 150), new THREE.ShaderMaterial({
    uniforms: { uFog: shared.uFog, uFogAmt: shared.uFogAmt, uTime: shared.uTime, uTint: { value: new THREE.Color() } },
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vW; varying float vD; void main(){vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 m=viewMatrix*w; vD=-m.z; gl_Position=projectionMatrix*m;}',
    fragmentShader: /* glsl */`
      uniform vec3 uFog, uTint; uniform float uFogAmt, uTime; varying vec3 vW; varying float vD;
      void main(){
        float r = sin(vW.z*2.4 + uTime*.7 + sin(vW.x*1.6)*1.5)*.5 + .5;
        float fog = clamp(1.-exp(-vD*uFogAmt*1.4), 0., 1.);
        vec3 c = mix(uTint, uFog, fog);
        gl_FragColor = vec4(c + r*.01*exp(-vD*.14), mix(.48, 1., fog));
      }`,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, -45);
  water.renderOrder = -1;
  group.add(water);

  return {
    group, items, water,
    update(cam) {
      for (const it of items) {
        it.mesh.userData.tick();
        if (it.c) {
          const yaw = Math.max(-.75, Math.min(.75, Math.atan2(cam.position.x - it.x, cam.position.z - it.z)));
          it.c.mesh.rotation.y = it.c.mir.rotation.y = yaw;
        }
      }
    },
  };
}
