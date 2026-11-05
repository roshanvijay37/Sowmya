import * as THREE from 'three';
import { isMobile, loadImage, manifest, photoURL, shared, smooth, range, clamp, lerp } from './core.js';
import { beam, contactShadow, cutout, pool, stencilled } from './materials.js';
import { crowd, fountain } from './particles.js';
import { gold, logoGeometry } from './hero.js';

export const STAGE = { curtainZ: -74, wallZ: -134, topZ: -128 };

/* Line-up along the catwalk. Her real looks, from real nights. */
export const LINEUP = [
  { name: 'normal18', z: -88, side: -1, rim: '#ff4f7e' },
  { name: 'normal3', z: -100, side: 1, rim: '#ffd27a' },
  { name: 'solo7', z: -112, side: -1, rim: '#ff42b0' },
  { name: 'normal4', z: -124.5, side: 0, rim: '#ffe0a8' },
];

function curtain(side) {
  const W = 11, H = 13;
  const geo = new THREE.PlaneGeometry(W, H, isMobile ? 200 : 420, 24);
  const uniforms = { uOpen: { value: 0 }, uSide: { value: side }, uTime: shared.uTime, uW: { value: W } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uOpen, uSide, uTime, uW;
      varying vec3 vN, vV; varying float vU, vFold; varying vec2 vUv;
      float folds(float u, float y){
        float f = 96. + 70.*uOpen;
        return sin(u*f + sin(y*.9+u*7.+uTime*.3)*1.1)*.3 + sin(u*f*.37+1.3)*.26;
      }
      void main(){
        vUv = uv;
        float u = uv.x;
        float y = position.y;
        float sway = sin(uTime*.5+u*3.)*.05;
        float gather = mix(1., .13 - .05*smoothstep(-6.,6.,y)*uOpen*0., uOpen);
        float bow = uOpen*uOpen*pow(1.-uv.y, 1.8)*.0;
        float x = (u*uW)*gather;
        vec3 p = vec3(uSide*(uW - x) * 1. - uSide*0., y, 0.);
        p.x = uSide*( (uW*(1.-gather)) + x*1. );
        p.x -= 0.;
        float e = .012;
        float d0 = folds(u,y), dx = folds(u+e,y), dy = folds(u,y+.1);
        p.z = d0 + sway;
        p.x += bow*uSide;
        vec3 n = normalize(vec3(-(dx-d0)/(e*uW*gather)*uSide, -(dy-d0)/.1, 1.));
        vN = normalize(normalMatrix*n);
        vec4 m = modelViewMatrix*vec4(p,1.);
        vV = normalize(-m.xyz);
        vFold = d0;
        vU = u;
        gl_Position = projectionMatrix*m;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vN, vV; varying float vFold, vU; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN), V = normalize(vV);
        float d = max(dot(N,V),0.);
        float sheen = pow(1.-d, 2.6);            // velvet glows at grazing angles
        float occl = smoothstep(-.5,.45,vFold);
        vec3 deep = vec3(.05,.001,.008), body = vec3(.25,.006,.022), edge = vec3(.62,.05,.075);
        vec3 c = mix(deep, body, occl);
        c += edge*sheen*(.35+.65*occl);
        float h = 1.-vUv.y; c *= .72 + .55*smoothstep(.0,.8,h);
        float hem = smoothstep(.055,.04,vUv.y);
        c = mix(c, vec3(1.2,.8,.32)*(.5+.5*occl), hem);
        gl_FragColor = vec4(c,1.);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return { m, uniforms };
}

function ledCenter() {
  const W = 26, H = 12.5;
  const uniforms = {
    uA: { value: null }, uB: { value: null }, uAa: { value: 1 }, uBa: { value: 1 }, uMix: { value: 0 },
    uGain: { value: 1 }, uTime: shared.uTime, uIn: { value: 0 }, uWA: { value: W / H }, uAbs: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, side: THREE.DoubleSide, stencilWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: /* glsl */`
      uniform sampler2D uA, uB; uniform float uMix, uGain, uAa, uBa, uWA, uIn, uTime, uAbs; varying vec2 vUv;
      vec2 cover(vec2 uv, float a){ vec2 s = a>uWA ? vec2(uWA/a,1.) : vec2(1.,a/uWA); return (uv-.5)*s+.5; }
      void main(){
        vec2 cells = vec2(320.,154.);
        vec2 g = vUv*cells;
        vec2 uv = (floor(g)+.5)/cells;
        vec3 a = texture2D(uA, cover(uv,uAa)).rgb, b = texture2D(uB, cover(uv,uBa)).rgb;
        float wipe = smoothstep(-.12,.12, uMix*1.3-.15 - (1.-vUv.y));
        vec3 c = mix(a,b,wipe);
        // While she is centre stage the wall gives way to pure light: no giant cropped bodies behind her.
        float bars = smoothstep(.5,.98,sin(abs(uv.x-.5)*20. - uTime*1.2 + sin(uv.y*5.+uTime*.3)*1.3));
        vec3 glow = mix(vec3(1.2,.08,.42), vec3(1.25,.72,.2), uv.y)*(bars*.8+.05);
        c = mix(c, glow, uAbs);
        vec2 f = fract(g)-.5;
        float dots = smoothstep(.62,.25,length(f));
        float w = fwidth(g.x);
        c *= mix(dots*1.55, 1., clamp(w*1.4,0.,1.));
        gl_FragColor = vec4(c*uGain*uIn, 1.);
      }`,
  });
  const geo = new THREE.PlaneGeometry(W, H);
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  const mirM = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...stencilled, blending: THREE.AdditiveBlending,
    vertexShader: mat.vertexShader,
    fragmentShader: /* glsl */`
      uniform sampler2D uA, uB; uniform float uMix, uGain, uAa, uBa, uWA, uIn, uAbs; varying vec2 vUv;
      vec2 cover(vec2 uv, float a){ vec2 s = a>uWA ? vec2(uWA/a,1.) : vec2(1.,a/uWA); return (uv-.5)*s+.5; }
      void main(){
        float wipe = step(.5,uMix);
        vec3 c = wipe>.5 ? textureLod(uB, cover(vUv,uBa), 4.).rgb : textureLod(uA, cover(vUv,uAa), 4.).rgb;
        gl_FragColor = vec4(c*.2*uGain*uIn*(1.-uAbs*.6), 1.);
      }`,
  });
  const mir = new THREE.Mesh(geo, mirM);
  mir.frustumCulled = false; mir.scale.y = -1; mir.renderOrder = -2;
  return { m, mir, uniforms, W, H };
}

function ledWing(side) {
  const W = 15, H = 12.5;
  const uniforms = { uTime: shared.uTime, uSide: { value: side }, uAmt: { value: 1 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: /* glsl */`
      uniform float uTime, uSide, uAmt; varying vec2 vUv;
      void main(){
        vec2 g = vUv*vec2(90.,75.); vec2 c=(floor(g)+.5)/vec2(90.,75.);
        float k = uSide>0. ? c.x : 1.-c.x;
        float bars = sin(k*18. - uTime*1.4 + sin(c.y*5.+uTime*.3)*1.4);
        bars = smoothstep(.55,.98,bars);
        float sweep = pow(.5+.5*sin(c.y*7.-uTime*.8+k*4.),6.);
        vec3 col = mix(vec3(1.5,.1,.5), vec3(1.5,.8,.2), c.y);
        vec2 f=fract(g)-.5; float dots=smoothstep(.6,.3,length(f));
        float w=fwidth(g.x);
        vec3 o = col*(bars*.9+sweep*.5+.03)*(1.-k*.45)*mix(dots*1.5,1.,clamp(w*1.4,0.,1.));
        gl_FragColor = vec4(o*uAmt,1.);
      }`,
  }));
  m.frustumCulled = false;
  return { m, uniforms };
}

/* A dot-matrix ticker carrying the real shows, as read off her stage backdrops. */
const TICKER = "SOWMYA KOTIAN  ✦  EMCEE  ✦  ANCHOR  ✦  NAMMA TV DANCE WARRIORS 4  ✦  MANGALORE DASARA  ✦  RED FM TULU FILM AWARDS  ✦  KARNATAKA'S BEST DANCER  ✦  FUN GALAXY FREEDOM FESTIVAL  ✦  ";
function ticker(width, H = 1.1) {
  const c = document.createElement('canvas'); c.width = 4096; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 4096, 96);
  g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.font = '700 64px "DM Mono", ui-monospace, Menlo, Consolas, monospace';
  const line = TICKER.repeat(2);
  // Letter-fit: stretches one pass of the text to span the canvas so the seam never shows.
  const w = g.measureText(TICKER).width;
  g.setTransform(4096 / w, 0, 0, 1, 0, 0);
  g.fillText(TICKER, 0, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const uniforms = {
    uT: { value: tex }, uTime: shared.uTime, uRep: { value: width / H / (4096 / 96) * 1.05 },
    uCells: { value: new THREE.Vector2(width * 26, H * 26) },
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, H), new THREE.ShaderMaterial({
    uniforms, side: THREE.FrontSide,   // from behind the words would read backwards
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: /* glsl */`
      uniform sampler2D uT; uniform float uTime, uRep; uniform vec2 uCells; varying vec2 vUv;
      void main(){
        vec2 g = vUv*uCells; vec2 uv=(floor(g)+.5)/uCells;
        float v = texture2D(uT, vec2(uv.x*uRep + uTime*.018, uv.y)).r;
        vec2 f=fract(g)-.5; float dots=smoothstep(.55,.3,length(f));
        float w=fwidth(g.x);
        vec3 c = vec3(2.6,1.65,.6)*smoothstep(.3,.6,v)*mix(dots,.8,clamp(w*1.5,0.,1.));
        gl_FragColor=vec4(c + vec3(.03,.012,.004),1.);
      }`,
  }));
  return { m };
}

function trussBeams(group) {
  const rod = new THREE.CylinderGeometry(.045, .045, 1, 6);
  const parts = [];
  const add = (a, b) => parts.push([a.clone(), b.clone()]);
  const bay = (from, to, step = 1.1, size = .55) => {
    const dir = to.clone().sub(from); const L = dir.length(); dir.normalize();
    const u = Math.abs(dir.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v = dir.clone().cross(u).normalize(); const w = dir.clone().cross(v).normalize();
    const offs = [v.clone().add(w), v.clone().sub(w), v.clone().negate().sub(w), v.clone().negate().add(w)].map(o => o.multiplyScalar(size / 2));
    offs.forEach(o => add(from.clone().add(o), to.clone().add(o)));
    const n = Math.floor(L / step);
    for (let i = 0; i < n; i++) {
      const a = from.clone().addScaledVector(dir, i * step), b = from.clone().addScaledVector(dir, (i + 1) * step);
      for (let k = 0; k < 4; k++) add(a.clone().add(offs[k]), (i % 2 ? a : b).clone().add(offs[(k + 1) % 4]));
    }
  };
  const Y = 9.6;
  for (const z of [-80, -96, -112, -128]) bay(new THREE.Vector3(-13, Y, z), new THREE.Vector3(13, Y, z));
  for (const x of [-13, 13]) {
    bay(new THREE.Vector3(x, Y, -78), new THREE.Vector3(x, Y, -130));
    if (!isMobile) for (const z of [-80, -128]) bay(new THREE.Vector3(x, -2, z), new THREE.Vector3(x, Y, z));
  }
  const mesh = new THREE.InstancedMesh(rod, new THREE.MeshStandardMaterial({ color: '#2a2a33', metalness: .9, roughness: .4 }), parts.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y0 = new THREE.Vector3(0, 1, 0);
  parts.forEach(([a, b], i) => {
    const d = b.clone().sub(a); const L = d.length();
    Q.setFromUnitVectors(Y0, d.normalize()); P.copy(a).add(b).multiplyScalar(.5); S.set(1, L, 1);
    mesh.setMatrixAt(i, M.compose(P, Q, S));
  });
  mesh.frustumCulled = false;
  group.add(mesh);
}

export function buildStage(scene) {
  const group = new THREE.Group();
  const { curtainZ, wallZ, topZ } = STAGE;

  /* Curtain */
  const cl = curtain(-1), cr = curtain(1);
  cl.m.position.set(0, 5.6, curtainZ); cr.m.position.set(0, 5.6, curtainZ);
  group.add(cl.m, cr.m);
  const pelmet = new THREE.Mesh(new THREE.BoxGeometry(26, 1.1, .5), new THREE.MeshStandardMaterial({ color: '#3a0208', roughness: .7 }));
  pelmet.position.set(0, 12, curtainZ);
  group.add(pelmet);

  /* Stencil: the shapes reflections are allowed to appear in */
  const catwalkW = 6.4, walkLen = -curtainZ + topZ * -1;
  const maskMat = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
    stencilZPass: THREE.ReplaceStencilOp, stencilFunc: THREE.AlwaysStencilFunc,
  });
  const floorShapes = [
    new THREE.PlaneGeometry(catwalkW, Math.abs(topZ - curtainZ) + 4).rotateX(-Math.PI / 2).translate(0, 0, (topZ + curtainZ) / 2),
    new THREE.PlaneGeometry(44, wallZ * -1 + topZ + 4 + 4).rotateX(-Math.PI / 2).translate(0, 0, (wallZ + topZ) / 2),
  ];
  floorShapes.forEach((g) => { const m = new THREE.Mesh(g, maskMat); m.renderOrder = -3; m.frustumCulled = false; group.add(m); });

  /* Glossy floor over the reflections */
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime },
    transparent: true, depthWrite: true,
    vertexShader: 'varying vec3 vW; void main(){vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vW;
      void main(){
        float seams = smoothstep(.02,.0,abs(fract(vW.z/2.)-.5)-.494);
        float wall = smoothstep(-80.,-134.,vW.z);
        vec3 c = vec3(.004,.003,.007) + seams*.01 + vec3(.05,.006,.03)*wall*wall;
        gl_FragColor=vec4(c,.86);
      }`,
  });
  floorShapes.forEach((g) => { const m = new THREE.Mesh(g, floorMat); m.renderOrder = -1; m.frustumCulled = false; group.add(m); });

  /* Chasing light strips down both edges of the catwalk */
  const stripMat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime },
    vertexShader: 'varying vec3 vW; void main(){vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vW;
      void main(){
        float k = pow(.5+.5*sin(vW.z*.55 + uTime*3.2), 8.);
        vec3 c = mix(vec3(.7,.35,.12), vec3(4.,2.3,.9), k);
        gl_FragColor=vec4(c,1.);
      }`,
  });
  for (const x of [-catwalkW / 2, catwalkW / 2]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(.07, .05, Math.abs(topZ - curtainZ)), stripMat);
    s.position.set(x, .03, (topZ + curtainZ) / 2);
    s.frustumCulled = false;
    group.add(s);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.4, Math.abs(topZ - curtainZ)), new THREE.MeshBasicMaterial({ color: '#060608' }));
    skirt.position.set(x, -.7, (topZ + curtainZ) / 2);
    group.add(skirt);
  }

  /* The LED wall */
  const centre = ledCenter();
  centre.m.position.set(0, centre.H / 2 + .1, wallZ);
  centre.mir.position.set(0, -centre.H / 2 - .1, wallZ);
  group.add(centre.m, centre.mir);
  const wings = [-1, 1].map((side) => {
    const w = ledWing(side);
    w.m.position.set(side * 19.4, 6.35, wallZ + 2.4);
    w.m.rotation.y = -side * .34;
    group.add(w.m);
    return w;
  });
  const LEDS = manifest.led.map((n) => ({ name: n, tex: null, a: manifest.p[n] }));
  LEDS.forEach((l, i) => loadImage(photoURL(l.name), (t) => {
    l.tex = t; if (i === 0) { centre.uniforms.uA.value = t; centre.uniforms.uAa.value = l.a; }
    if (i === 1) { centre.uniforms.uB.value = t; centre.uniforms.uBa.value = l.a; }
    if (centre.uniforms.uA.value && centre.uniforms.uB.value) centre.uniforms.uIn.value = 1;
  }));

  /* Tickers */
  // One ticker on the wall's top edge: same depth as the wall, so it can never cross her name.
  const t1 = ticker(44, 1.7); t1.m.position.set(0, 13.55, wallZ + .2); group.add(t1.m);

  trussBeams(group);

  /* Moving heads */
  const colors = ['#ff2fa0', '#3f7dff', '#ffc65c', '#ff2fa0', '#7a4dff', '#ffc65c'];
  const movers = [];
  const count = isMobile ? 12 : 22;
  for (let i = 0; i < count; i++) {
    const row = i % 2 ? -1 : 1;
    const z = -80 - (i * 2 % count) / count * 48;
    const b = beam({ len: 17, top: .05, bottom: 1.3, color: colors[i % 6], power: 1.1 });
    b.position.set(row * (3.8 + (i % 4) * 2.7), 9.2, z);
    group.add(b);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % 6]).multiplyScalar(6) }));
    head.position.copy(b.position);
    group.add(head);
    movers.push({ b, i, row });
  }

  /* Sowmya */
  const dancers = LINEUP.map((d, i) => {
    const c = cutout(d.name, { height: d.side === 0 ? 3.55 : 3.15, rim: d.rim });
    const x = d.side * 1.55;
    c.mesh.position.set(x, 0, d.z);
    c.mir.position.set(x, 0, d.z);
    group.add(c.mesh, c.mir);
    const spot = beam({ len: 9.4, top: .08, bottom: 1.55, color: '#fff0d8', power: .8 });
    spot.position.set(x, 9.4, d.z);
    group.add(spot);
    const p = pool(2.2, '#ffe9c8', .15);
    p.position.set(x, .012, d.z);
    group.add(p);
    const sh = contactShadow(manifest.c[d.name] * (d.side === 0 ? 3.55 : 3.15));
    sh.position.set(x, .016, d.z + .05);
    group.add(sh);
    return { ...d, c, x, spot, pool: p };
  });

  /* Crowd + pyro */
  const people = crowd();
  group.add(people.pts);
  const pyros = [[-3.4, -104], [3.4, -104], [-3.4, -120], [3.4, -120], [-9, -127], [9, -127]].map(([x, z]) => {
    const f = fountain(x, z); group.add(f.pts); return f;
  });

  /* The closing signature above the wall */
  const finale = new THREE.Mesh(logoGeometry(34, .5), gold({ roughness: .36, envMapIntensity: .75, emissive: '#6b4310', emissiveIntensity: .06 }));
  finale.position.set(0, 26.4, wallZ - 1);
  group.add(finale);
  const fKey = new THREE.DirectionalLight('#ffe7c0', .9);
  fKey.position.set(-46, 34, -96); fKey.target = finale;
  group.add(fKey);

  /* Searchlights behind her name for the last shot */
  const searchlights = [0, 1, 2, 3, 4, 5].map((i) => {
    const b = beam({ len: 95, top: .25, bottom: 7, color: i % 2 ? '#ffc65c' : '#ff4fa3', power: .5 });
    b.position.set((i - 2.5) * 11, 2, wallZ - 6);
    group.add(b);
    return b;
  });

  const ledState = { i: 0, next: 1, t0: 0 };
  const CYCLE = 6;

  return {
    group, centre, wings, people, pyros, dancers, cl, cr, finale, fKey,
    update(s, time, cam, px, calm) {
      // Behind the camera for the rest of the show, and in the way of the last wide shot.
      cl.m.visible = cr.m.visible = pelmet.visible = s < .6;
      const open = smooth(s, .432, .492);
      cl.uniforms.uOpen.value = open;
      cr.uniforms.uOpen.value = open;

      movers.forEach(({ b, i, row }) => {
        const t = time * (.34 + (i % 5) * .05) + i;
        b.rotation.z = Math.sin(t) * .55 + row * .14;
        b.rotation.x = Math.cos(t * .8 + i) * .32;
      });

      for (const d of dancers) {
        d.c.mesh.userData.tick();
        const near = (cam.position.z - d.z);
        const on = d.side === 0 ? smooth(near, 12, 7.5) : smooth(near, 9.5, 6.6);
        const lit = s > .7 ? 1 : on;
        d.c.uniforms.uOn.value = lit;
        d.c.uniforms.uNear.value = smooth(Math.hypot(cam.position.x - d.x, cam.position.z - d.z), 2.8, 4.6);
        const a = Math.atan2(cam.position.x - d.x, cam.position.z - d.z);
        const yaw = clamp(a, -.75, .75);
        d.c.mesh.rotation.y = yaw; d.c.mir.rotation.y = yaw;
        d.spot.material.uniforms.uPower.value = .55 * lit;
        d.pool.material.uniforms.uP.value = .15 * lit;
      }

      const pyro = calm ? 0 : smooth(s, .6, .66);
      pyros.forEach((f) => { f.uniforms.uAmt.value = pyro; f.uniforms.uPx.value = px; });

      people.uniforms.uAmt.value = smooth(s, .48, .54);
      people.uniforms.uPx.value = px;

      // Wall: wipes to the next night every few seconds
      const u = centre.uniforms;
      const elapsed = time - ledState.t0;
      if (elapsed > CYCLE) {
        ledState.t0 = time; ledState.i = ledState.next; ledState.next = (ledState.next + 1) % LEDS.length;
        const a = LEDS[ledState.i], b = LEDS[ledState.next];
        if (a.tex) { u.uA.value = a.tex; u.uAa.value = a.a; }
        if (b.tex) { u.uB.value = b.tex; u.uBa.value = b.a; }
        u.uMix.value = 0;
      } else u.uMix.value = smooth(elapsed, CYCLE - 1.1, CYCLE);
      u.uGain.value = 1.18;
      u.uAbs.value = smooth(s, .615, .655) * (1 - smooth(s, .722, .745));

      const fin = smooth(s, .9, .985);
      finale.material.emissiveIntensity = .06 + fin * .34;
      finale.material.envMapIntensity = .75 + fin * 1.75;
      fKey.intensity = .9 + fin * 2.4;
      searchlights.forEach((b, i) => {
        b.visible = fin > .001;
        b.material.uniforms.uPower.value = fin * .5;
        b.rotation.z = Math.PI + Math.sin(time * .35 + i * 1.7) * .34 + (i - 2.5) * .12;
      });
      finale.scale.setScalar(.92 + fin * .08);
    },
  };
}
