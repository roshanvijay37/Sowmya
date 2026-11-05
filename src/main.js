import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, damp, isMobile, lerp, loadState, range, setRenderer, shared, smooth, manifest } from './core.js';
import { PANEL_H } from './nights.js';
import { buildHero } from './hero.js';
import { buildSilk, SPACING, START_Z } from './silk.js';
import { buildStage, LINEUP } from './stage.js';
import { buildNights, HELIX, panelAngle } from './nights.js';
import { drift, dust } from './particles.js';

const canvas = document.getElementById('gl');
const params = new URLSearchParams(location.search);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
function plainPage(why) {
  document.documentElement.classList.remove('js', 'live');
  throw new Error('plain mode: ' + why);
}
if (!webgl2() || params.has('plain')) plainPage('no webgl2');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true, powerPreference: 'high-performance' });
} catch (e) { plainPage(e.message); }
setRenderer(renderer);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the final pass does the sRGB encode
renderer.autoClear = true;

const maxRatio = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
let pixelRatio = maxRatio;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#000');
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, .04, 400);

/* -------- Light the metal: a small stage rig rendered into a reflection map. */
function buildEnvironment() {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#050406');
  const add = (w, h, x, y, z, c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  add(8, 2, 0, 8, 3, '#fff1d8', 14);
  add(3, 8, -9, 1, 2, '#ffd9a0', 7);
  add(2, 9, 9, 0, 3, '#ff6cb4', 5);
  add(12, 1, 0, -7, 4, '#c78a3a', 3);
  add(3, 3, -5, 6, 9, '#fff', 3);
  add(10, 2, 0, 3, -9, '#6d8cff', 3);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, .03).texture;
  pm.dispose();
}
buildEnvironment();
// A phone can drop the GPU when it is backgrounded; keep the page alive and relight the metal on return.
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', buildEnvironment);

/* -------- Sky: a colour wash that follows the mood of each act. */
const skyU = { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uTime: shared.uTime };
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: /* glsl */`
    uniform vec3 uTop,uBot; uniform float uTime; varying vec3 vP;
    void main(){
      vec3 d=normalize(vP);
      float k=smoothstep(-.25,.75,d.y);
      float mist=.5+.5*sin(d.x*3.+uTime*.05+sin(d.y*5.)*1.2)*sin(d.z*2.5-uTime*.04);
      float glow=pow(max(0.,dot(d,normalize(vec3(0.,.1,-1.)))),6.);
      gl_FragColor=vec4(mix(uBot,uTop,k)*(.82+.3*mist)+uTop*glow*1.3,1.);
    }`,
}));
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

scene.add(new THREE.HemisphereLight('#6d5a44', '#0b0910', .5));

/* -------- World */
const hero = buildHero(scene);
scene.add(hero.group);
const silk = buildSilk();
scene.add(silk.group);
const stage = buildStage(scene);
scene.add(stage.group);
const nights = buildNights();
scene.add(nights.group);
const dustP = dust();
scene.add(dustP.pts);
const petals = drift();
scene.add(petals.mesh);

/* -------- Moods, by scroll */
const c = (h) => new THREE.Color(h);
const MOODS = [
  [0, '#000000', '#000000', 0],
  [.16, '#000000', '#000000', 0],
  [.175, '#141d16', '#040806', .03],
  [.245, '#16271b', '#040a06', .03],
  [.30, '#2e2408', '#0c0802', .03],
  [.345, '#30102a', '#0b030a', .03],
  [.395, '#32090e', '#0b0204', .03],
  [.44, '#2c060b', '#080103', .03],
  [.49, '#12040e', '#030104', .004],
  [.70, '#1a0720', '#030104', .004],
  [.74, '#0c0a24', '#040410', .002],
  [.88, '#101440', '#05040e', .002],
  [.94, '#100514', '#030104', .0012],
  [1, '#140616', '#030104', .0012],
];
function mood(s) {
  let i = 0;
  while (i < MOODS.length - 2 && s > MOODS[i + 1][0]) i++;
  const a = MOODS[i], b = MOODS[i + 1], k = smooth(s, a[0], b[0]);
  skyU.uTop.value.copy(c(a[1])).lerp(c(b[1]), k);
  skyU.uBot.value.copy(c(a[2])).lerp(c(b[2]), k);
  shared.uFog.value.copy(skyU.uBot.value).lerp(skyU.uTop.value, .55);
  shared.uFogAmt.value = lerp(a[3], b[3], k);
  silk.water.material.uniforms.uTint.value.copy(skyU.uBot.value).multiplyScalar(.45);
}

/* -------- Camera path: two takes, cut on the white flash inside the mic */
const M = hero.micAt;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const K = (t, p, l, f = 36, r = 0) => ({ t, p, l, f, r });

const take1 = [
  K(0, V(0, 1.85, 8.6), V(0, 1.85, 0), 36),
  K(.04, V(-.5, 1.8, 7.1), V(.2, 1.9, 0), 36, .01),
  K(.085, V(1.3, 2.6, 3.6), V(M.x, M.y - .05, 0), 34, -.05),
  K(.125, V(M.x - .1, M.y + .02, 1.5), V(M.x, M.y, 0), 30, .03),
  K(.15, V(M.x, M.y, .78), M.clone(), 30),
  K(.17, V(M.x, M.y, -.05), V(M.x, M.y, -2), 30),
];

const sideZ = (i) => START_Z - i * SPACING;
const tallFov = (f, a) => (a >= 1.4 ? f : clamp(f * (1 + (1.4 - a) * .62), f, 78));
let lockedAspect = innerWidth / innerHeight;
function buildTake2() {
const take2 = [K(.17, V(.3, 1.9, -1.5), V(-1, 2.2, -10), 46)];
manifest.silk.forEach((_, i) => {
  const side = i % 2 ? 1 : -1;
  const t = .19 + i * (.235 / 6);
  const free = manifest.free.includes(manifest.silk[i]);
  take2.push(K(t, V(-side * .5, 2.2 + Math.sin(i) * .15, sideZ(i) + (free ? 6.9 : 7.3)), V(side * 2.25, free ? 2.3 : 3.05, sideZ(i)), 44, side * .025));
});
take2.push(K(.45, V(0, 2.1, -70), V(0, 3, -90), 46));
take2.push(K(.49, V(0, 2.3, -76.5), V(0, 2.4, -100), 48));
const stageT = (i) => .52 + i * .05;
LINEUP.slice(0, -1).forEach((d, i) => {
  take2.push(K(stageT(i), V(-d.side * .95, 1.5, d.z + 6), V(d.side * 1.25, 1.7, d.z), 40, d.side * .02));
});
take2.push(K(.67, V(.0, 1.55, -115.5), V(0, 1.85, -124.5), 40));
take2.push(K(.69, V(1.5, 1.4, -117), V(0, 1.82, -124.5), 40, .02));
take2.push(K(.712, V(-1.2, 1.9, -116.8), V(0, 1.82, -124.5), 42, -.015));
take2.push(K(.735, V(0, 7, -113), V(0, 12, -124), 48));
take2.push(K(.75, V(0, 13, -104), V(HELIX.r * Math.cos(panelAngle(0)), 15, HELIX.z + HELIX.r * Math.sin(panelAngle(0))), 50));
const nightN = manifest.nights.length;
manifest.nights.forEach((name, i) => {
  const a = panelAngle(i);
  const t = .765 + i * (.112 / (nightN - 1));
  const y = HELIX.y0 + i * HELIX.stepY;
  // Stand exactly far enough back to see the whole photo on this screen, not a fixed distance.
  const aspect = lockedAspect;
  const v = THREE.MathUtils.degToRad(tallFov(46, aspect)) / 2;
  const width = PANEL_H(name) * manifest.p[name];
  const dist = clamp(width * 1.1 / (2 * Math.tan(v) * aspect), 4.6, HELIX.r + 3.1);
  const back = dist - HELIX.r;
  take2.push(K(t, V(-Math.cos(a) * back, y + .1, HELIX.z - Math.sin(a) * back), V(Math.cos(a) * HELIX.r, y, HELIX.z + Math.sin(a) * HELIX.r), 46));
});
take2.push(K(.905, V(0, 56, -92), V(0, 30, -133), 46));
take2.push(K(.95, V(0, 27, -68), V(0, 19, -133), 44));
take2.push(K(1, V(0, 15, -63), V(0, 17, -133), 44));
return take2;
}

function makeTake(keys) {
  return {
    keys,
    pos: new THREE.CatmullRomCurve3(keys.map(k => k.p), false, 'catmullrom', .5),
    look: new THREE.CatmullRomCurve3(keys.map(k => k.l), false, 'catmullrom', .5),
  };
}
const takes = [makeTake(take1), makeTake(buildTake2())];
// Turning a phone changes how far back each photo needs the camera.
function reframe() {
  lockedAspect = camera.aspect;
  takes[1] = makeTake(buildTake2());
}
const CUT = .17;
const pos = new THREE.Vector3(), look = new THREE.Vector3();
function cameraAt(s) {
  const T = s < CUT ? takes[0] : takes[1];
  const ks = T.keys;
  let i = 0;
  while (i < ks.length - 2 && s > ks[i + 1].t) i++;
  const f = range(s, ks[i].t, ks[i + 1].t);
  const u = (i + f) / (ks.length - 1);
  T.pos.getPoint(u, pos);
  T.look.getPoint(u, look);
  const e = f * f * (3 - 2 * f);
  const fov = lerp(ks[i].f, ks[i + 1].f, e);
  if (s < .085) {
    // Tall screens: stand further back so the whole signature fits, then close in as usual.
    const v = THREE.MathUtils.degToRad(fovFor(fov)) / 2;
    const need = 3.55 / (Math.tan(v) * camera.aspect);
    pos.z += Math.max(0, need - 8.6) * (1 - smooth(s, 0, .085));
  }
  return { fov, roll: lerp(ks[i].r, ks[i + 1].r, e) };
}

/* -------- Finish: bloom on HDR only, then grain, lens and the sRGB encode */
const size = new THREE.Vector2(innerWidth, innerHeight);
const target = new THREE.WebGLRenderTarget(size.x, size.y, {
  type: THREE.HalfFloatType, samples: isMobile ? 2 : 4, stencilBuffer: true, depthBuffer: true,
});
const composer = new EffectComposer(renderer, target);
composer.setPixelRatio(pixelRatio);
composer.setSize(size.x, size.y);
composer.addPass(new RenderPass(scene, camera));
// A single NaN from the metal's shading would otherwise be blurred into a white slab by bloom.
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;
      if(!(c.r==c.r&&c.g==c.g&&c.b==c.b)||any(greaterThan(c,vec3(1e4)))) c=vec3(0.);
      gl_FragColor=vec4(min(c,vec3(24.)),1.); }`,
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), .62, .7, 1.02);
composer.addPass(bloom);
const finish = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: shared.uTime, uFlash: { value: 0 }, uCA: { value: 0 }, uBlack: { value: 1 }, uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime,uFlash,uCA,uBlack,uAspect; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    vec3 clip(vec3 c){ // identity up to .8 so photographs stay exactly as shot; only stage light rolls off
      vec3 x = max(c-.8, 0.);
      return min(c,vec3(.8)) + .2*(1.-exp(-x*2.6));
    }
    vec3 encode(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055, step(.0031308,c)); }
    void main(){
      vec2 d = vUv-.5;
      float r2 = dot(d,d);
      float ca = uCA*(.0015+r2*.02);
      vec3 c = vec3(texture2D(tDiffuse,vUv+d*ca).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-d*ca).b);
      c = clip(c);
      c = mix(c, vec3(1.,.94,.82), uFlash);
      vec3 o = encode(c);
      o *= 1.-smoothstep(.2,.95,r2*1.5)*.32;
      o += (hash(vUv*1000.+fract(uTime)*17.)-.5)*.035*(1.-o*.5);
      gl_FragColor = vec4(o*(1.-uBlack),1.);
    }`,
});
composer.addPass(finish);

/* -------- Scroll */
const scroller = document.getElementById('scroll');
const sMax = () => Math.max(1, scroller.offsetHeight - innerHeight);
let target01 = 0, s = 0, vel = 0;
const readScroll = () => { target01 = clamp((window.scrollY || 0) / sMax()); };
addEventListener('scroll', readScroll, { passive: true });

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  pointer.tx = e.clientX / innerWidth * 2 - 1;
  pointer.ty = -(e.clientY / innerHeight * 2 - 1);
}, { passive: true });

/* -------- HUD */
const CUES = [
  [0, '01', 'House lights'], [.13, '02', 'Sound check'], [.175, '03', 'Wardrobe'], [.445, '04', 'Curtain'],
  [.5, '05', 'Live'], [.74, '06', 'The nights'], [.905, '07', 'Encore'],
];
const cueN = document.getElementById('cue-n'), cueT = document.getElementById('cue-t');
const bar = document.getElementById('bar'), hint = document.getElementById('hint');
const end = document.getElementById('end'), who = document.getElementById('who');
let cueShown = -1;
function hud(sv) {
  let idx = 0;
  CUES.forEach((q, i) => { if (sv >= q[0]) idx = i; });
  if (idx !== cueShown) {
    cueShown = idx; cueN.textContent = CUES[idx][1]; cueT.textContent = CUES[idx][2];
    cueT.classList.remove('in'); void cueT.offsetWidth; cueT.classList.add('in');
  }
  bar.style.transform = `scaleY(${sv})`;
  hint.style.opacity = sv < .008 ? 1 : 0;
  who.style.opacity = 1 - smooth(sv, .006, .03);
  const e = smooth(sv, .955, .99);
  end.style.opacity = e;
  end.style.pointerEvents = e > .6 ? 'auto' : 'none';
  end.inert = e <= .6;                 // hidden links must not take a tap or keyboard focus
  end.style.transform = `translateY(${(1 - e) * 26}px)`;
  document.body.classList.toggle('ended', e > .5);
}

/* -------- Layout */
const viewW = () => canvas.clientWidth || innerWidth, viewH = () => canvas.clientHeight || innerHeight;
let lastW = viewW(), lastH = viewH();
function resize(force) {
  // The canvas keeps the tall viewport height, so the URL bar sliding changes nothing and faces never stretch.
  const w = viewW(), h = viewH();
  if (!force && w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  camera.aspect = w / h;
  if ((camera.aspect < 1) !== (lockedAspect < 1)) reframe();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  finish.uniforms.uAspect.value = w / h;
}
addEventListener('resize', () => resize(false));
renderer.setPixelRatio(pixelRatio);
renderer.setSize(viewW(), viewH(), false);
camera.aspect = viewW() / viewH();
lockedAspect = camera.aspect;
takes[1] = makeTake(buildTake2());

// Keep the horizontal view on tall phones instead of cropping the world to a slit.
const fovFor = (f) => tallFov(f, camera.aspect);

/* -------- Frame */
const clock = new THREE.Clock();
let introT = 0, frames = 0, msSum = 0, fast = 0;
const INTRO_DELAY = .45, INTRO_LEN = 2.1;
const frozen = { on: false };

function drive(dt) {
  const time = shared.uTime.value;
  const intro = smooth(introT, INTRO_DELAY, INTRO_DELAY + INTRO_LEN);
  pointer.x = damp(pointer.x, pointer.tx, 3, dt);
  pointer.y = damp(pointer.y, pointer.ty, 3, dt);

  const { fov, roll } = cameraAt(s);
  const heroIn = smooth(.09 - s, 0, .09);
  camera.position.copy(pos);
  camera.position.x += pointer.x * (.1 + heroIn * .25) + (calm ? 0 : Math.sin(time * .31) * .03);
  camera.position.y += pointer.y * (.06 + heroIn * .12) + (calm ? 0 : Math.cos(time * .27) * .025);
  camera.lookAt(look);
  camera.rotateZ(roll);
  camera.fov = fovFor(fov) + clamp(Math.abs(vel) * 90, 0, 7);
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);

  mood(s);

  // Acts appear only while they are on screen.
  const inHero = s < CUT + .002;
  hero.group.visible = inHero;
  dustP.pts.visible = inHero;
  silk.group.visible = s > .155 && s < .5;
  stage.group.visible = s > .43;

  if (inHero) {
    hero.update(s, intro, pointer, calm);
    hero.mic.core.visible = s > .13;
    hero.mic.coreU.uP.value = lerp(.5, 7, smooth(s, .14, .165));
    dustP.uniforms.uAmt.value = intro * (1 - smooth(s, .1, .14));
    dustP.uniforms.uPx.value = pixelRatio;
  } else hero.mic.core.visible = false;

  if (silk.group.visible) silk.update(camera);
  if (stage.group.visible) stage.update(s, calm ? 0 : time, camera, pixelRatio, calm);
  nights.update(s);

  // Petals, then confetti
  const pu = petals.uniforms;
  const onStage = smooth(s, .47, .5);
  pu.uCenter.value.copy(camera.position);
  pu.uPetal.value = onStage > .5 ? 0 : 1;
  pu.uFall.value = lerp(.55, 1.5, onStage);
  pu.uSize.value = lerp(.05, .11, onStage);
  const silkAmt = .42 * smooth(s, .18, .21) * (1 - smooth(s, .43, .47));
  const confAmt = smooth(s, .6, .66) * (.7 - .35 * smooth(s, .74, .78) + .45 * smooth(s, .9, .96));
  pu.uAmt.value = Math.max(silkAmt, confAmt * smooth(s, .5, .6));
  pu.uGlow.value = onStage > .5 ? .9 : 1;
  pu.uBox.value.set(onStage > .5 ? 34 : 24, onStage > .5 ? 26 : 13, 34);
  if (onStage > .5) { pu.uA.value.set('#ffcf6e'); pu.uB.value.set('#ff4fa3'); pu.uC.value.set('#e9b95c'); }
  else if (s < .3) { pu.uA.value.set('#ffffff'); pu.uB.value.set('#ffe9b0'); pu.uC.value.set('#f7c948'); }
  else { pu.uA.value.set('#ffb7d0'); pu.uB.value.set('#ff5a7a'); pu.uC.value.set('#f7c948'); }

  if (calm) pu.uAmt.value = 0;
  const f = finish.uniforms;
  // The cut inside the mic: a white-gold flash, or a dark dip for reduced-motion viewers.
  const cutOn = smooth(s, .152, .168) * (1 - smooth(s, .172, .184));
  f.uFlash.value = calm ? 0 : cutOn;
  f.uBlack.value = Math.max(1 - smooth(introT, 0, .4), calm ? cutOn : 0);
  f.uCA.value = clamp(Math.abs(vel) * 60, 0, 1);
  hud(s);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);
  if (frozen.on) { composer.render(); return; }
  if (document.hidden) return;
  shared.uTime.value += dt;
  introT += dt;
  const prev = s;
  s = damp(s, target01, isMobile ? 7 : 4.4, dt);
  if (Math.abs(s - target01) < 1e-5) s = target01;
  vel = damp(vel, (s - prev) / Math.max(dt, .001) * .1, 8, dt);
  drive(dt);
  composer.render(dt);

  // Spend less on weaker phones and laptops rather than dropping frames.
  const l = loadState();
  if (l.done >= l.total) { frames++; msSum += dt * 1000; }   // image uploads are not a fair measure
  if (frames === 45) {
    const avg = msSum / frames;
    frames = 0; msSum = 0;
    if (avg > 30 && !window.__noAdapt) {
      fast = 0;
      if (pixelRatio > .72) { pixelRatio = Math.max(.72, pixelRatio * .84); resize(true); }
      else bloom.enabled = false;
    } else if (avg < 18 && ++fast >= 3) {
      fast = 0;
      if (!bloom.enabled) bloom.enabled = true;
      else if (pixelRatio < maxRatio) { pixelRatio = Math.min(maxRatio, pixelRatio * 1.12); resize(true); }
    }
  }
}

/* -------- Test hook: freezes the show at a scroll position for screenshots */
window.__show = {
  seek(v, time = 12) {
    window.__noAdapt = true;
    frozen.on = true;
    s = target01 = v; vel = 0; introT = 10; shared.uTime.value = time;
    window.scrollTo(0, v * sMax());
    pointer.x = pointer.y = pointer.tx = pointer.ty = 0;
    for (const o of [...silk.items.map(i => i.mesh), ...nights.items.map(i => i.p.mesh), ...stage.dancers.map(d => d.c.mesh)]) o.userData.fade = 1;
    drive(.016);
    composer.render();
  },
  load: loadState,
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tex: renderer.info.memory.textures, pr: pixelRatio, bloom: bloom.enabled }),
};

const go = () => {
  readScroll();
  s = target01;                        // a reload resumes where the visitor was, it does not replay the flight
  const h = document.documentElement;
  h.classList.add('js', 'live');
  // Screen readers keep the plain text; the keyboard should not land on hidden links inside it.
  document.querySelectorAll('#plain a').forEach((a) => { a.tabIndex = -1; });
  renderer.compileAsync(scene, camera).catch(() => {});  // no shader stalls at the first flash or curtain
  frame();
};
(document.fonts?.ready || Promise.resolve()).then(go);
