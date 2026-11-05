import * as THREE from 'three';
import { shared, loadImage, photoURL, cutURL, silkURL, depthURL, manifest, isMobile } from './core.js';

/* Floor reflections are real geometry drawn upside down below y=0. The stencil keeps
   them inside the catwalk, so the wide wall behind does not leak into the crowd. */
export const stencilled = { stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: 1, stencilZPass: THREE.KeepStencilOp };

/* ------------------------------------------------------------------ PHOTO
   A plane whose vertices are pushed forward by the photo's depth map, so a person
   really stands in front of the background. Photo pixels stay at or below 1.0, so
   the bloom pass never touches them and no skin tone is shifted. */
const photoVert = /* glsl */`
uniform sampler2D uD; uniform float uRelief, uCloth, uTime, uBend, uDepthOn;
varying vec2 vUv; varying float vWave; varying vec3 vW; varying float vDist;
void main(){
  vUv = uv;
  vec3 p = position;
  float d = texture2D(uD, uv).r;
  vec2 e = smoothstep(vec2(0.), vec2(.09), min(uv, 1.-uv));
  p.z += (d - .3) * uRelief * uDepthOn * e.x * e.y;   // borders stay straight
  float hang = pow(1. - uv.y, 1.4);
  float w = sin(uv.x*5. + uTime*.9 + uv.y*2.6) + .5*sin(uv.x*11. - uTime*1.3 + uv.y*5.);
  p.z += uCloth * hang * w * .13;
  p.x += uCloth * hang * sin(uTime*.6 + uv.y*2.) * .07;
  vWave = uCloth * hang * cos(uv.x*5. + uTime*.9 + uv.y*2.6);
  if (uBend > 0.) p.z += p.x*p.x / (2.*uBend);
  vec4 world = modelMatrix * vec4(p,1.);
  vW = world.xyz;
  vec4 mv = viewMatrix * world;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const photoFrag = /* glsl */`
uniform sampler2D uMap, uD; uniform float uIn, uMirror, uFogAmt, uFrame, uTime, uOpacity, uMist; uniform vec3 uFog, uTint;
varying vec2 vUv; varying float vWave; varying vec3 vW; varying float vDist;
void main(){
  vec2 uv = vUv;
  float h = 0.;
  if (uMirror > .5) {
    h = clamp(-vW.y / 4.6, 0., 1.);
    uv.x += sin(vW.y*6. + uTime*1.4) * .006 * uMirror * (.4+h);
    if (h >= 1.) discard;
  }
  vec3 c = uMirror > .5 ? textureLod(uMap, uv, 1.5 + h*3.5).rgb : texture2D(uMap, uv).rgb;
  c = mix(uTint, c, uIn);
  c *= 1. + clamp(vWave, -1., 1.) * .05;
  if (uFrame > 0.) {
    vec2 e = min(vUv, 1. - vUv);
    float f = 1. - smoothstep(0., .011, min(e.x, e.y*.66));
    c = mix(c, vec3(1.9,1.35,.62) * uFrame, f);
  }
  float a = uOpacity;
  if (uMist > 0.) {
    // Wardrobe photos carry her own cut-out in alpha; her hem sinks into the mist on the water.
    float al = uMirror > .5 ? textureLod(uMap, uv, 1.5 + h*3.5).a : texture2D(uMap, uv).a;
    if (al < .01) discard;
    a *= al * uIn * smoothstep(.015,.17,vUv.y);
  }
  if (uMirror > .5) { a *= pow(1.-h, 1.6) * .55; c *= .8; }
  float fog = 1. - exp(-vDist * uFogAmt);
  c = mix(c, uFog, clamp(fog, 0., 1.));
  gl_FragColor = vec4(c, a);
}`;

export function photo(name, opts = {}) {
  const { height = 4, relief = .5, cloth = 0, bend = 0, frame = 0, mirror = false, tint = '#15110e' } = opts;
  const aspect = manifest.p[name];
  const W = height * aspect, H = height;
  const seg = isMobile ? 1 : 2;
  const geo = new THREE.PlaneGeometry(W, H, Math.round(60 * seg), Math.round(70 * seg));
  const uniforms = {
    uMap: { value: null }, uD: { value: null }, uIn: { value: 0 }, uRelief: { value: relief },
    uDepthOn: { value: 0 }, uCloth: { value: cloth }, uBend: { value: bend }, uMirror: { value: 0 },
    uFrame: { value: frame }, uOpacity: { value: 1 }, uMist: { value: opts.mist || 0 }, uTint: { value: new THREE.Color(tint).convertSRGBToLinear() },
    uTime: shared.uTime, uFog: shared.uFog, uFogAmt: shared.uFogAmt,
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: photoVert, fragmentShader: photoFrag, uniforms, side: THREE.DoubleSide, transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  let mir = null;
  if (mirror) {
    const u2 = { ...uniforms, uMirror: { value: 1 } };
    const m2 = new THREE.ShaderMaterial({
      vertexShader: photoVert, fragmentShader: photoFrag, uniforms: u2, side: THREE.DoubleSide,
      transparent: true, depthWrite: false,
    });
    mir = new THREE.Mesh(geo, m2);
    mir.frustumCulled = false;
    mir.scale.y = -1;
    mir.renderOrder = -2;
  }
  let fadeStart = 0;
  loadImage(opts.mist ? silkURL(name) : photoURL(name), (t) => { uniforms.uMap.value = t; fadeStart = performance.now(); mesh.userData.fade = fadeStart; });
  loadImage(depthURL(name), (t) => { uniforms.uD.value = t; uniforms.uDepthOn.value = 1; }, true);
  mesh.userData.tick = () => {
    if (mesh.userData.fade) uniforms.uIn.value = Math.min(1, (performance.now() - mesh.userData.fade) / 900);
  };
  return { mesh, mir, uniforms, width: W, height: H };
}

/* ------------------------------------------------------------------ CUT-OUT
   Sowmya on stage. The plane turns about Y to face the camera, so the photo is never
   seen from behind or mirrored. uOn is her spotlight: before it fires she is a dim
   figure; lit, she is the photo exactly as shot, plus a coloured rim from the wall
   behind her. Nothing here darkens her once she is lit. */
const cutVert = /* glsl */`
varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const cutFrag = /* glsl */`
uniform sampler2D uMap; uniform float uOn, uIn, uMirror, uTime; uniform vec3 uRim;
varying vec2 vUv; varying vec3 vW;
void main(){
  vec2 uv = vUv;
  float h = 0.;
  if (uMirror > .5) { h = clamp(-vW.y/2.6, 0., 1.); if (h>=1.) discard; }
  vec4 t = uMirror > .5 ? textureLod(uMap, uv, 1.+h*4.) : texture2D(uMap, uv);
  if (t.a < .012) discard;
  float a = t.a * uIn;
  vec3 c = t.rgb * mix(.3, 1., uOn);
  float soft = textureLod(uMap, uv, 4.5).a;
  float rim = clamp((1. - soft) * 1.9, 0., 1.);
  c += uRim * rim * rim * (.25 + .75*uOn) * .55;
  float foot = smoothstep(0., .035, vUv.y);
  if (uMirror > .5) { a *= pow(1.-h, 2.)*.5; c *= .85; } else a *= foot;
  gl_FragColor = vec4(c, a);
}`;

export function cutout(name, opts = {}) {
  const { height = 3.1, rim = '#ff3fa0' } = opts;
  const aspect = manifest.c[name];
  const W = height * aspect;
  const geo = new THREE.PlaneGeometry(W, height);
  geo.translate(0, height / 2, 0);
  const uniforms = {
    uMap: { value: null }, uOn: { value: 0 }, uIn: { value: 0 }, uMirror: { value: 0 },
    uRim: { value: new THREE.Color(rim) }, uTime: shared.uTime,
  };
  const make = (m) => new THREE.ShaderMaterial({
    vertexShader: cutVert, fragmentShader: cutFrag, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, uniforms: m ? { ...uniforms, uMirror: { value: 1 } } : uniforms,
    ...(m ? stencilled : {}),
  });
  const mesh = new THREE.Mesh(geo, make(false));
  const mir = new THREE.Mesh(geo, make(true));
  mir.scale.y = -1; mir.renderOrder = -2;
  mesh.frustumCulled = mir.frustumCulled = false;
  mesh.renderOrder = 2;
  loadImage(cutURL(name), (t) => { uniforms.uMap.value = t; mesh.userData.fade = performance.now(); });
  mesh.userData.tick = () => {
    if (mesh.userData.fade) uniforms.uIn.value = Math.min(1, (performance.now() - mesh.userData.fade) / 700);
  };
  return { mesh, mir, uniforms };
}

/* ------------------------------------------------------------------ LIGHT BEAM */
const beamVert = /* glsl */`
varying float vK; varying vec3 vN, vV, vW;
void main(){
  vK = -position.y / 1.;
  vN = normalize(normalMatrix*normal);
  vec4 mv = modelViewMatrix*vec4(position,1.);
  vV = normalize(-mv.xyz);
  vW = (modelMatrix*vec4(position,1.)).xyz;
  gl_Position = projectionMatrix*mv;
}`;
const beamFrag = /* glsl */`
uniform vec3 uColor; uniform float uPower, uLen, uTime;
varying float vK; varying vec3 vN, vV, vW;
float n(vec3 p){ return sin(p.x*1.3+uTime*.5)*sin(p.y*1.1-uTime*.35)*sin(p.z*1.7+uTime*.27); }
void main(){
  float k = clamp(vK/uLen, 0., 1.);
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 2.4);
  float a = core * pow(1.-k, 1.7) * smoothstep(0., .02, k);
  a *= .78 + .22*n(vW*1.2);
  gl_FragColor = vec4(uColor * uPower * a, a);
}`;
export function beam({ len = 12, top = .06, bottom = 1.5, color = '#fff', power = 1 } = {}) {
  const geo = new THREE.CylinderGeometry(top, bottom, len, 40, 1, true);
  geo.translate(0, -len / 2, 0);
  const uniforms = {
    uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uLen: { value: len }, uTime: shared.uTime,
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: beamVert, fragmentShader: beamFrag, uniforms, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 3;
  return m;
}

/* A soft disc of light on the floor. */
export function pool(radius, color, power = 1) {
  const uniforms = { uC: { value: new THREE.Color(color) }, uP: { value: power } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv-.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 uC; uniform float uP; varying vec2 vUv;
      void main(){ float r=length(vUv)*2.; float a=pow(max(0.,1.-r),1.5)+.0; gl_FragColor=vec4(uC*uP*a,a); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
