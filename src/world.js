// Static atmosphere: smog sky, wet ground, distant megacity skyline, rain, searchlights.
import * as THREE from 'three';
import { TILE } from './config.js';
import { MAT } from './materials.js';
import { Parts, meshesFromPartMaps } from './geom.js';
import { mulberry32 } from './rng.js';

export const FOG_COLOR = new THREE.Color(0x1a0c2c);

export class World {
  constructor(scene) {
    this.scene = scene;
    scene.background = FOG_COLOR.clone();
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0024);

    scene.add(new THREE.HemisphereLight(0x5a3a9a, 0x0a0612, 0.55));
    const moon = new THREE.DirectionalLight(0x8a7cff, 0.35);
    moon.position.set(-200, 300, -100);
    scene.add(moon);

    this.makeSky();
    this.makeGround();
    this.makeSkyline();
    this.makeRain();
    this.makeBeams();
    this.makeGrid();
  }

  makeSky() {
    const geo = new THREE.SphereGeometry(2600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uHorizon: { value: FOG_COLOR }, },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime; uniform vec3 uHorizon;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float h = vDir.y;
          vec3 zenith = vec3(0.012, 0.008, 0.03);
          vec3 col = mix(uHorizon * 1.15, zenith, smoothstep(0.0, 0.55, h));
          // city glow bleeding into the smog near the horizon
          col += vec3(0.35, 0.08, 0.32) * exp(-abs(h) * 9.0) * 0.55;
          col += vec3(0.05, 0.25, 0.3) * exp(-abs(h - 0.05) * 14.0) * 0.25;
          // drifting smog clouds lit from below
          vec2 uv = vDir.xz / max(h, 0.05) * 1.4 + vec2(uTime * 0.01, 0.0);
          float n = noise(uv) * 0.5 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.2;
          col += vec3(0.16, 0.05, 0.18) * smoothstep(0.45, 0.9, n) * smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(0.35, 0.8, h));
          if (h < 0.0) col = uHorizon;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  makeGround() {
    const g = new THREE.PlaneGeometry(6000, 6000);
    g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, MAT.ground);
    this.ground.position.y = -0.02;
    this.scene.add(this.ground);
  }

  // Ring of dark low-detail towers so the city sits inside an endless sprawl.
  // It travels with the camera, so the sprawl never ends on the horizon.
  makeSkyline() {
    const r = mulberry32(1337);
    const P = new Parts();
    for (let k = 0; k < 700; k++) {
      const ang = r() * Math.PI * 2;
      const dist = r.range(600, 1500);
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      const w = r.range(14, 40), d = r.range(14, 40);
      const h = r.range(20, 120) + (r() < 0.15 ? r.range(80, 260) : 0);
      P.boxB(r() < 0.6 ? 'winSky' : 'winD', w, h, d, x, 0, z, ang);
      if (r() < 0.25) P.box('neon_' + r.pick(['magenta', 'cyan', 'amber', 'violet']), w + 0.6, 0.6, d + 0.6, x, h, z, ang, false);
      if (r() < 0.3) P.box('blinkA', 1.2, 1.2, 1.2, x, h + 2, z, 0, false);
    }
    this.skyline = new THREE.Group();
    meshesFromPartMaps([P.merge()], MAT).forEach((m) => { m.matrixAutoUpdate = true; this.skyline.add(m); });
    this.scene.add(this.skyline);
  }

  makeRain() {
    const N = 9000, BOX = 90;
    const pos = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let k = 0; k < N; k++) {
      const x = Math.random() * BOX, y = Math.random() * BOX, z = Math.random() * BOX;
      for (let e = 0; e < 2; e++) {
        pos.set([x, y, z], (k * 2 + e) * 3);
        end[k * 2 + e] = e;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX } },
      vertexShader: `
        uniform float uTime; uniform vec3 uCam; uniform float uBox; attribute float aEnd; varying float vA;
        void main(){
          vec3 p = position;
          p.y -= uTime * 38.0;
          p.x -= uTime * 4.0;
          p = uCam + mod(p - uCam, uBox) - uBox * 0.5;
          p.y += aEnd * 1.1; p.x += aEnd * 0.12;
          vA = aEnd;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.55, 0.65, 0.95, 0.22 * vA + 0.04); }`,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  makeBeams() {
    this.beams = [];
    const geo = new THREE.ConeGeometry(14, 700, 24, 1, true);
    geo.translate(0, -350, 0);
    geo.rotateX(Math.PI); // apex at origin, cone opens upward
    this.beamRoot = new THREE.Group();
    this.scene.add(this.beamRoot);
    const spots = [[-560, -300], [620, -80], [60, 700], [-220, -720], [480, 560]];
    spots.forEach(([x, z], k) => {
      const m = new THREE.Mesh(geo, MAT.beam);
      m.position.set(x, 0, z);
      m.userData.phase = k * 1.7;
      this.beamRoot.add(m);
      this.beams.push(m);
    });
  }

  makeGrid() {
    const pts = [], N = 30, H = N * TILE;
    for (let k = -N; k <= N; k++) {
      const p = k * TILE;
      pts.push(-H, 0.08, p, H, 0.08, p, p, 0.08, -H, p, 0.08, H);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: new THREE.Color(0x2ef6ff).multiplyScalar(0.5), transparent: true, opacity: 0.22, toneMapped: false,
    }));
    this.scene.add(this.grid);
  }

  update(dt, t, camera, focus) {
    this.sky.material.uniforms.uTime.value = t;
    this.sky.position.copy(camera.position);
    const cx = camera.position.x, cz = camera.position.z;
    this.skyline.position.set(cx, 0, cz);
    this.beamRoot.position.set(cx, 0, cz);
    this.ground.position.set(cx, -0.02, cz);
    if (focus) this.grid.position.set(Math.round(focus.x / TILE) * TILE, 0, Math.round(focus.z / TILE) * TILE);
    this.rainMat.uniforms.uTime.value = t;
    this.rainMat.uniforms.uCam.value.copy(camera.position);
    for (const b of this.beams) {
      const p = b.userData.phase;
      b.rotation.z = Math.sin(t * 0.21 + p) * 0.35;
      b.rotation.x = Math.cos(t * 0.17 + p) * 0.3;
    }
  }
}
