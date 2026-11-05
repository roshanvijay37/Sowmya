import * as THREE from 'three';
import { loadImage, manifest, plateURL, shared } from './core.js';
import { beam, photo } from './materials.js';

/* Wardrobe. Each portrait hangs as a length of silk over still water, and the world
   takes on the colour of what she is wearing, walking from green to gold to red, so
   the red velvet curtain at the end of the corridor feels inevitable. */
export const SPACING = 8.4;
export const START_Z = -10;

export function buildSilk() {
  const group = new THREE.Group();
  const items = manifest.silk.map((name, i) => {
    const side = i % 2 ? 1 : -1;
    const p = photo(name, { height: 5.4, relief: .95, cloth: .22, mirror: true, mist: 1 });
    const z = START_Z - i * SPACING;
    const x = side * 2.45;
    const y = 2.5;
    const rotY = -side * .5;
    p.mesh.position.set(x, y, z); p.mesh.rotation.y = rotY;
    p.mir.position.set(x, -y, z); p.mir.rotation.y = rotY;
    group.add(p.mesh, p.mir);

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
    return { p, side, z, x };
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
    update() { for (const it of items) it.p.mesh.userData.tick(); },
  };
}
