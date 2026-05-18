import * as THREE from 'three';
import ZenoTunnel from './ZenoTunnel.js';
import { setupUI } from './ui.js';

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('canvas'),
  antialias: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const tunnel = new ZenoTunnel(THREE);
scene.add(tunnel.mesh);

const params = {
  speed: 1.0,
  subdivisionRatio: 0.5,
  colorScheme: 0,
  twist: 0.05,
  fov: 1.2,
  paused: false,
};

setupUI(params);

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  tunnel.setSize(w, h);
}
window.addEventListener('resize', onResize);
onResize();

let lastTime = performance.now();
let fpsFrames = 0, fpsClock = 0, fps = 0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  fpsFrames++;
  fpsClock += dt;
  if (fpsClock >= 0.5) {
    fps = Math.round(fpsFrames / fpsClock);
    fpsFrames = 0;
    fpsClock = 0;
    document.getElementById('fps').textContent = fps + ' fps';
  }

  if (!params.paused) {
    tunnel.update(dt, params);

    const camZ = tunnel.uniforms.uTime.value * params.speed;
    document.getElementById('depth-display').textContent =
      'Depth: ×' + Math.pow(2, parseFloat(Math.log2(camZ + 1).toFixed(1))).toFixed(1);
    document.getElementById('level-display').textContent =
      'Level: ' + Math.floor(Math.log2(Math.max(camZ, 0.5) + 0.5));
  }

  renderer.render(scene, camera);
}
animate();
