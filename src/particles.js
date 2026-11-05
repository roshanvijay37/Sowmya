import * as THREE from 'three';
import { shared, isMobile } from './core.js';

/* Petals in the silk corridor, confetti on the stage: one instanced system that wraps
   around the camera, so it always fills the frame without simulating the whole world. */
export function drift(count = isMobile ? 500 : 1400) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = count;
  const uniforms = {
    uTime: shared.uTime, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(26, 16, 34) },
    uFall: { value: 1 }, uAmt: { value: 0 }, uPetal: { value: 1 }, uSize: { value: .09 },
    uA: { value: new THREE.Color('#fff') }, uB: { value: new THREE.Color('#fff') }, uC: { value: new THREE.Color('#fff') },
    uGlow: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uFall, uSize, uAmt, uPetal; uniform vec3 uCenter, uBox, uA, uB, uC;
      varying vec2 vUv; varying vec3 vC; varying float vA, vShade;
      mat3 rot(vec3 a, float t){ float c=cos(t),s=sin(t),o=1.-c;
        return mat3(o*a.x*a.x+c,o*a.x*a.y-a.z*s,o*a.z*a.x+a.y*s, o*a.x*a.y+a.z*s,o*a.y*a.y+c,o*a.y*a.z-a.x*s, o*a.z*a.x-a.y*s,o*a.y*a.z+a.x*s,o*a.z*a.z+c); }
      void main(){
        vUv = uv;
        float t = uTime*(.5+aSeed.w);
        vec3 b = aSeed.xyz * uBox;
        b.y -= t*uFall;
        b.x += sin(t*.7 + aSeed.x*20.)*.8;
        b.z += cos(t*.5 + aSeed.y*20.)*.8;
        vec3 w = mod(b - uCenter + uBox*.5, uBox) - uBox*.5;
        vec3 axis = normalize(aSeed.zxy - .5 + .01);
        mat3 R = rot(axis, t*2.2 + aSeed.x*6.28);
        float s = uSize*(.6+aSeed.y*.9)*(uPetal>.5 ? 1.5 : 1.);
        vec3 q = position*vec3(s, s*(uPetal>.5 ? .62 : 1.4), s);
        if (uPetal>.5) q.z += sin(position.x*3.)*s*.25;
        vec3 world = w + uCenter + R*q;
        float e = dot(abs(w)/(uBox*.5), vec3(0.,1.,0.));
        // Nothing may touch the lens: a single flake this close would fill the screen.
        vA = uAmt * (1.-smoothstep(.7,1.,e)) * smoothstep(1.6, 3.4, length(w));
        vShade = .55 + .45*abs((R*vec3(0.,0.,1.)).z);
        float k = fract(aSeed.w*7.3);
        vC = k<.34 ? uA : (k<.67 ? uB : uC);
        gl_Position = projectionMatrix*viewMatrix*vec4(world,1.);
      }`,
    fragmentShader: /* glsl */`
      uniform float uPetal, uGlow; varying vec2 vUv; varying vec3 vC; varying float vA, vShade;
      void main(){
        float a = 1.;
        if (uPetal>.5){ float d=length((vUv-.5)*vec2(2.,2.)); a=1.-smoothstep(.75,1.,d); }
        if (a*vA<.01) discard;
        gl_FragColor = vec4(vC*vShade*uGlow, a*vA);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return { mesh, uniforms };
}

/* Thousands of phone lights: the crowd either side of the catwalk, in a raked bowl. */
export function crowd(count = isMobile ? 7000 : 20000) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const side = Math.random() < .5 ? -1 : 1;
    const x = 5.5 + Math.pow(Math.random(), .8) * 95;
    const z = -70 - Math.pow(Math.random(), .85) * 66 + (x > 30 ? (x - 30) * 1.1 : 0);
    const rake = Math.max(0, x - 8) * .17;
    pos[i * 3] = side * x; pos[i * 3 + 1] = -1.2 + rake + Math.random() * .7; pos[i * 3 + 2] = z;
    seed[i * 2] = Math.random(); seed[i * 2 + 1] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(seed, 2));
  const uniforms = { uTime: shared.uTime, uAmt: { value: 0 }, uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec2 aS; uniform float uTime, uPx; varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position;
        float wave = sin(uTime*1.1 + p.x*.09 + p.z*.05);
        p.x += sin(uTime*1.3 + aS.x*6.28)*.26;
        p.y += wave*.42 + .3*sin(uTime*2. + aS.y*6.28);
        vec4 mv = modelViewMatrix*vec4(p,1.);
        float tw = .55 + .45*sin(uTime*(1.+aS.y*3.) + aS.x*40.);
        vA = tw;
        vC = mix(vec3(1.,.93,.82), aS.x<.5 ? vec3(1.,.72,.45) : vec3(.72,.82,1.), aS.y*.7);
        gl_PointSize = uPx*clamp(170./-mv.z, 2.8, 9.);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmt; varying float vA; varying vec3 vC;
      void main(){ float d=length(gl_PointCoord-.5)*2.; float a=pow(max(0.,1.-d),2.); gl_FragColor=vec4(vC*3.2*a*vA*uAmt, a*uAmt); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, uniforms };
}

/* Sparkler fountains, the same cold pyro as in her photos. */
export function fountain(x, z, count = isMobile ? 160 : 420) {
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(seed, 4));
  const uniforms = { uTime: shared.uTime, uAmt: { value: 0 }, uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aS; uniform float uTime, uPx; varying float vA;
      void main(){
        float life = .9 + aS.w*1.1;
        float t = mod(uTime + aS.x*7., life);
        float k = t/life;
        float a = aS.y*6.283; float r = aS.z*.22;
        vec3 v = vec3(cos(a)*r*1.6, 5.4+aS.z*3.2, sin(a)*r*1.6);
        vec3 p = v*t + vec3(0.,-4.7*t*t,0.);
        vec4 mv = modelViewMatrix*vec4(p,1.);
        vA = (1.-k)*(1.-k)*(.5+.5*sin(uTime*40.+aS.x*60.));
        gl_PointSize = uPx*clamp(24./-mv.z,1.,9.);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmt; varying float vA;
      void main(){ float d=length(gl_PointCoord-.5)*2.; float a=pow(max(0.,1.-d),1.5);
        gl_FragColor=vec4(vec3(3.4,2.5,1.5)*a*vA*uAmt, a*uAmt); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.position.set(x, 0, z);
  pts.frustumCulled = false;
  return { pts, uniforms };
}

/* Dust hanging in the first spotlight. */
export function dust(count = isMobile ? 260 : 700) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - .5) * 13; pos[i * 3 + 1] = Math.random() * 8 - 1; pos[i * 3 + 2] = (Math.random() - .35) * 11;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: shared.uTime, uAmt: { value: 0 }, uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aS; uniform float uTime, uPx; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*.13 + aS*30.)*.6; p.y += cos(uTime*.11 + aS*50.)*.5; p.z += sin(uTime*.09 + aS*70.)*.5;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        vA = .45+.55*sin(uTime*.5 + aS*40.);
        gl_PointSize = uPx*clamp(16./-mv.z,1.,6.)*(.5+aS);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmt; varying float vA;
      void main(){ float d=length(gl_PointCoord-.5)*2.; float a=pow(max(0.,1.-d),2.);
        gl_FragColor=vec4(vec3(1.3,1.05,.72)*a*vA*uAmt, a*uAmt*.8); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, uniforms };
}
