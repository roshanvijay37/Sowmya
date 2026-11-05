import * as THREE from 'three';
import manifest from './manifest.json';

export const isMobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) || innerWidth < 820;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const range = (v, a, b) => clamp((v - a) / (b - a));
export const smooth = (v, a, b) => { const x = range(v, a, b); return x * x * (3 - 2 * x); };
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// Shared uniforms: every material reads the same clock and the same air.
export const shared = {
  uTime: { value: 0 },
  uFog: { value: new THREE.Color('#000') },
  uFogAmt: { value: 0.02 },
};

/* Images load one at a time in scroll order, so the first screen needs none and
   the rest arrive while the viewer is still in the black room. */
const loader = new THREE.TextureLoader();
const queue = [];
let active = 0, total = 0, done = 0;
const MAX = isMobile ? 2 : 3;
let renderer;
export const setRenderer = (r) => { renderer = r; };

function pump() {
  while (active < MAX && queue.length) {
    const job = queue.shift();
    active++;
    loader.load(job.url, (tex) => {
      job.setup(tex);
      if (renderer) renderer.initTexture(tex);
      job.cb(tex);
      active--; done++;
      pump();
    }, undefined, () => {
      active--;
      if (!job.retried) { job.retried = true; setTimeout(() => { queue.push(job); pump(); }, 1500); }
      else { done++; console.warn('image failed', job.url); }
      pump();
    });
  }
}

export function loadImage(url, cb, depth = false) {
  total++;
  queue.push({
    url, cb,
    setup(tex) {
      if (depth) {
        tex.colorSpace = THREE.NoColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
      } else {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = isMobile ? 2 : 8;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    },
  });
  pump();
}
export const loadState = () => ({ total, done });

const sz = isMobile ? 'm/' : '';
export const photoURL = (n) => `assets/img/p/${sz}${n}.webp`;
export const cutURL = (n) => `assets/img/c/${sz}${n}.webp`;
export const plateURL = (n) => `assets/img/b/${n}.webp`;
export const depthURL = (n) => `assets/img/d/${n}.webp`;
export { manifest };
