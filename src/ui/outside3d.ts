/**
 * Vue extérieure en WebGL (three.js, licence MIT) : même scène que la vue 2D, rendue en 3D réelle.
 *
 * Repère de rendu : X = est, Y = haut, Z = sud (le nord est vers −Z), en mètres, origine au milieu du porteur
 * (rendu relatif au porteur : pas de perte de précision loin de l'origine de la carte).
 * - Rotondité de la Terre : abaissement d²/(2R′) (R′ = 7/6 R, réfraction standard) appliqué dans les shaders de la mer
 *   et du relief, et sur la position des objets mobiles (navires, bouées, feux).
 * - Voile atmosphérique : brouillard exponentiel exp(−3d/V) (Koschmieder), V = visibilité.
 * - Mer : vagues de Gerstner selon la force de Beaufort, réflexion du ciel (Fresnel), moutons, reflet du soleil.
 * - Relief : maillage tiré du trait de côte OpenStreetMap et du relief schématique de la carte.
 * - Navires : silhouettes par type (porte-conteneurs, pétrolier, vraquier, roulier, méthanier, ferry, chalutier, voilier…),
 *   feux de navigation selon les secteurs de l'annexe I (sim/visual.ts), marques de jour, vague d'étrave et sillage.
 * Le cadre de passerelle, les jumelles, le bandeau de relèvements et la console restent dessinés en 2D par-dessus.
 */
import * as THREE from 'three';
import { S, type Target } from '../core/state';
import { D2R, brgOf, clamp, n360 } from '../core/util';
import { CHART } from '../sim/chart';
import { dayShapes, mastH, navLights3D } from '../sim/visual';
import { EYE, HS, NM, RE, beaufort, charOn, flashOn, landHeight, motion } from './outside';

// brouillard exponentiel (Koschmieder) à la place du brouillard quadratique de three.js
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  float fogFactor = 1.0 - exp( - fogDensity * vFogDepth );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

/** 1 / 2R′, fixé à l'initialisation (outside.ts et ce module s'importent mutuellement : pas d'usage au chargement). */
const CURV = { value: 0 };
/** Applique la rotondité de la Terre dans le shader d'un matériau standard (maillages étendus : relief, lumières de côte). */
function curved<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCurv = CURV;
    sh.vertexShader = 'uniform float uCurv;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 wpC = modelMatrix * vec4( transformed, 1.0 );
      wpC.y -= ( wpC.x * wpC.x + wpC.z * wpC.z ) * uCurv;
      vec4 mvPosition = viewMatrix * wpC;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}
const drop = (x: number, z: number): number => (x * x + z * z) * CURV.value;

let renderer: THREE.WebGLRenderer | null = null, scene: THREE.Scene, camera: THREE.PerspectiveCamera, rig: THREE.Object3D;
let deck: THREE.Group, skyMesh: THREE.Mesh, stars: THREE.Points, water: THREE.Mesh, hemi: THREE.HemisphereLight, sun: THREE.DirectionalLight;
let canvas3d: HTMLCanvasElement;
let enabled = true;

/** Rendu 3D disponible et activé. */
export const use3D = (): boolean => !!renderer && enabled;
export function set3D(on: boolean): void { enabled = on; if (canvas3d) canvas3d.style.display = on ? 'block' : 'none'; }

export function init3D(wrap: HTMLElement): boolean {
  try {
    canvas3d = document.createElement('canvas');
    canvas3d.id = 'outside3d';
    wrap.insertBefore(canvas3d, wrap.firstChild);
    renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  } catch {
    renderer = null;
    canvas3d?.remove();
    return false;
  }
  CURV.value = 1 / (2 * RE);
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd3e2ec, 1e-4);
  camera = new THREE.PerspectiveCamera(40, 2, 1, 70000);
  camera.rotation.order = 'YXZ';
  rig = new THREE.Object3D(); rig.rotation.order = 'YXZ';
  rig.add(camera);
  scene.add(rig);
  hemi = new THREE.HemisphereLight(0xdfe9f2, 0x2a3a40, 1); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff4e0, 1.6); sun.position.set(-0.5, 0.6, 0.6); scene.add(sun);
  buildSky(); buildWater(); buildDeck();
  return true;
}

// ---------------------------------------------------------------- ciel et étoiles

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 uTop, uHor, uSea, uSunDir; uniform float uSunK; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float e = d.y;
  vec3 c = e >= 0.0 ? mix(uHor, uTop, pow(smoothstep(0.0, 0.55, e), 0.7)) : mix(uHor, uSea, smoothstep(0.0, -0.05, e));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunK * (pow(s, 600.0) * vec3(1.6, 1.5, 1.3) + pow(s, 12.0) * vec3(0.18, 0.14, 0.08));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
const skyU = {
  uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSea: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(-0.55, 0.45, 0.7).normalize() }, uSunK: { value: 1 },
};
function buildSky(): void {
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
  skyMesh.renderOrder = -10; skyMesh.frustumCulled = false;
  scene.add(skyMesh);
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const az = Math.random() * Math.PI * 2, el = Math.asin(Math.random() * 0.98 + 0.01);
    pos.set([Math.cos(el) * Math.sin(az) * 900, Math.sin(el) * 900, Math.cos(el) * Math.cos(az) * 900], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
  stars.renderOrder = -9; stars.frustumCulled = false;
  scene.add(stars);
}

// ---------------------------------------------------------------- mer

const WATER_VS = `#include <common>
uniform float uTime, uCurv; uniform vec2 uOff; uniform vec4 uW[4];
varying vec3 vWp; varying vec3 vN; varying float vCrest;
#include <logdepthbuf_pars_vertex>
void main(){
  vec3 p = position; vec2 xz = p.xz + uOff; float d = length(p.xz);
  float fade = 1.0 - smoothstep(900.0, 3500.0, d);
  vec3 disp = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0); float crest = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 D = uW[i].xy; float k = uW[i].z; float A = uW[i].w * fade;
    float w = sqrt(9.81 * k); float th = k * dot(D, xz) - w * uTime; float Q = min(0.55 / (k * uW[i].w * 4.0 + 1e-4), 1.0);
    float c = cos(th), s = sin(th);
    disp.x += Q * A * D.x * c; disp.z += Q * A * D.y * c; disp.y += A * s;
    n.x -= D.x * k * A * c; n.z -= D.y * k * A * c; n.y -= Q * k * A * s;
    crest += s * k * uW[i].w;
  }
  p += disp;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  wp.y -= (wp.x * wp.x + wp.z * wp.z) * uCurv;
  vWp = wp.xyz; vN = normalize(n); vCrest = crest;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const WATER_FS = `uniform vec3 uCam, uTop, uHor, uDeep, uFog, uSunDir; uniform float uFogK, uSunK, uFoam, uTime, uRip; uniform vec2 uOff;
varying vec3 vWp; varying vec3 vN; varying float vCrest;
#include <logdepthbuf_pars_fragment>
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * nz(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
void main(){
  #include <logdepthbuf_fragment>
  vec3 V = normalize(uCam - vWp); float dist = length(vWp.xz);
  vec2 w = vWp.xz + uOff;
  // vaguelettes : gradient d'un bruit fractal qui dérive avec le vent, atténué avec la distance (anti-crénelage)
  float near = 1.0 - smoothstep(80.0, 1800.0, dist);
  vec2 q = w * 0.18 + vec2(uTime * 0.25, uTime * 0.17);
  float e = 0.35, f0 = fbm(q);
  vec2 gr = vec2(fbm(q + vec2(e, 0.0)) - f0, fbm(q + vec2(0.0, e)) - f0) / e;
  vec3 N = normalize(vN + vec3(-gr.x, 0.0, -gr.y) * uRip * near);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 sky = mix(uHor, uTop, pow(smoothstep(0.0, 0.55, R.y), 0.7));
  vec3 col = mix(uDeep, sky, clamp(F, 0.0, 1.0) * 0.9);
  col += uSunK * pow(max(dot(R, uSunDir), 0.0), 180.0) * vec3(1.3, 1.2, 1.0) * (0.4 + 0.6 * near);
  // moutons : écume sur les crêtes, en taches qui naissent et meurent
  float wc = fbm(w * 0.06 + vec2(uTime * 0.03, -uTime * 0.02)) + vCrest * 0.35 + 0.12 * nz(w * 0.5 + uTime);
  float foam = smoothstep(0.73, 0.83, wc) * uFoam * (1.0 - smoothstep(500.0, 3500.0, dist));
  col = mix(col, vec3(0.88, 0.91, 0.93) * (0.25 + 0.75 * uSunK + 0.05), foam);
  col = mix(col, uFog, 1.0 - exp(-uFogK * dist));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const waterU = {
  uTime: { value: 0 }, uCurv: CURV, uOff: { value: new THREE.Vector2() },
  uW: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uCam: { value: new THREE.Vector3() }, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
  uDeep: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSunDir: skyU.uSunDir,
  uFogK: { value: 1e-4 }, uSunK: { value: 1 }, uFoam: { value: 0 }, uRip: { value: 0.3 },
};
function buildWater(): void {
  // grille polaire à pas géométrique : fine sous l'étrave, lâche à l'horizon (45 km)
  const nr = 150, ns = 256, pos: number[] = [], idx: number[] = [];
  const r = (i: number) => (i === 0 ? 0 : 2 * Math.pow(45000 / 2, (i - 1) / (nr - 1)));
  for (let i = 0; i < nr; i++) for (let j = 0; j < ns; j++) { const a = (j / ns) * Math.PI * 2; pos.push(Math.sin(a) * r(i), 0, Math.cos(a) * r(i)); }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < ns; j++) {
    const a = i * ns + j, b = i * ns + ((j + 1) % ns), c = (i + 1) * ns + j, d = (i + 1) * ns + ((j + 1) % ns);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  water = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: false }));
  water.frustumCulled = false;
  scene.add(water);
}

// ---------------------------------------------------------------- pont du porteur (VLCC vu de la passerelle)

function buildDeck(): void {
  deck = new THREE.Group();
  const L = 320, B = 58, fb = 8, a0 = -L / 2 + 58;
  const deckC = new THREE.MeshLambertMaterial({ color: 0x6a3e30 }), sideC = new THREE.MeshLambertMaterial({ color: 0x2a2d31 }), white = new THREE.MeshLambertMaterial({ color: 0xc9c3b5 });
  const sh = new THREE.Shape([new THREE.Vector2(-B / 2, a0), new THREE.Vector2(B / 2, a0), new THREE.Vector2(B / 2, L / 2 - 34), new THREE.Vector2(B / 3, L / 2 - 8), new THREE.Vector2(0, L / 2), new THREE.Vector2(-B / 3, L / 2 - 8), new THREE.Vector2(-B / 2, L / 2 - 34)]);
  const hull = new THREE.ExtrudeGeometry(sh, { depth: fb + 6, bevelEnabled: false });
  hull.rotateX(-Math.PI / 2); hull.translate(0, -6, 0);
  deck.add(new THREE.Mesh(hull, [deckC, sideC]));
  const bar = (a0b: number, a1b: number, b0: number, b1: number, z0: number, z1: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(b1 - b0, z1 - z0, a1b - a0b); g.translate((b0 + b1) / 2, (z0 + z1) / 2, -(a0b + a1b) / 2);
    deck.add(new THREE.Mesh(g, m));
  };
  bar(a0, L / 2 - 30, -0.6, 0.6, fb + 1.6, fb + 2.4, white);           // passerelle de pont
  const pipe = new THREE.MeshLambertMaterial({ color: 0x7d8288 }), crane = new THREE.MeshLambertMaterial({ color: 0xd8c9a0 });
  bar(L / 2 - 16, L / 2 - 15.4, -0.3, 0.3, fb, fb + 26, white);         // mât avant
  for (const b of [-14, 14]) { bar(-5.4, -4.6, b - 0.4, b + 0.4, fb, fb + 12, crane); bar(-5, 12, b - 0.25, b + 0.25, fb + 11, fb + 11.6, crane); } // grues de manifold
  for (const b of [-7.5, -5, -2.5, 2.5, 5, 7.5]) bar(a0 + 4, L / 2 - 40, b - 0.3, b + 0.3, fb + 0.3, fb + 0.9, pipe); // tuyauteries
  bar(L / 2 - 30, L / 2 - 8, -B / 3, B / 3, fb, fb + 2.5, sideC);       // gaillard
  rig.add(deck);
}

// ---------------------------------------------------------------- relief côtier

let terrainKey = '', terrain: THREE.Mesh | null = null, shore: THREE.Points | null = null;
function buildTerrain(): void {
  terrainKey = CHART.key;
  if (terrain) { scene.remove(terrain); terrain.geometry.dispose(); terrain = null; }
  if (shore) { scene.remove(shore); shore.geometry.dispose(); shore = null; }
  if (!CHART.land.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of CHART.land) for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const dx = 0.1, nx = Math.ceil((x1 - x0) / dx) + 3, ny = Math.ceil((y1 - y0) / dx) + 3; x0 -= dx; y0 -= dx;
  const N = nx * ny, land = new Uint8Array(N), dist = new Float32Array(N).fill(1e9);
  // terre : remplissage par balayage de lignes
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * dx, xs: number[] = [];
    for (const r of CHART.land) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const p = r[i], q = r[k];
      if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
    xs.sort((u, v) => u - v);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const i0 = Math.max(0, Math.ceil((xs[m] - x0) / dx)), i1 = Math.min(nx - 1, Math.floor((xs[m + 1] - x0) / dx));
      for (let i = i0; i <= i1; i++) land[j * nx + i] = 1;
    }
  }
  // distance à la mer (chanfrein, en mailles) pour la remontée du relief depuis le rivage
  for (let k = 0; k < N; k++) if (!land[k]) dist[k] = 0;
  const S2 = Math.SQRT2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = dist[k];
    if (i > 0) v = Math.min(v, dist[k - 1] + 1);
    if (j > 0) { v = Math.min(v, dist[k - nx] + 1); if (i > 0) v = Math.min(v, dist[k - nx - 1] + S2); if (i < nx - 1) v = Math.min(v, dist[k - nx + 1] + S2); }
    dist[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let v = dist[k];
    if (i < nx - 1) v = Math.min(v, dist[k + 1] + 1);
    if (j < ny - 1) { v = Math.min(v, dist[k + nx] + 1); if (i < nx - 1) v = Math.min(v, dist[k + nx + 1] + S2); if (i > 0) v = Math.min(v, dist[k + nx - 1] + S2); }
    dist[k] = v;
  }
  const lhs = CHART.marks.filter((m) => m.kind === 'lh');
  const vid = new Int32Array(N).fill(-1), pos: number[] = [], col: number[] = [], idx: number[] = [], lights: number[] = [];
  const cSand = new THREE.Color(0xc9b98f), cGrass = new THREE.Color(0x5f6f45), cScrub = new THREE.Color(0x77734f), cRock = new THREE.Color(0x8d877a), cChalk = new THREE.Color(CHART.key === 'pdc' ? 0xe4e0d2 : 0xb3ad9f), tmp = new THREE.Color();
  const need = (i: number, j: number) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const u = i + a, v = j + b; if (u >= 0 && v >= 0 && u < nx && v < ny && land[v * nx + u]) return true; } return false; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!need(i, j)) continue;
    const k = j * nx + i, x = x0 + i * dx, y = y0 + j * dx;
    let h = -8;
    const lh = landHeight(x, y), dNM = dist[k] * dx;
    if (land[k]) {
      const ramp = 0.45 - 0.38 * lh.cliff;
      h = Math.max(2.5, lh.h * Math.min(1, dNM / ramp) ** 0.8);
      for (const m of lhs) { const dm = Math.hypot(x - m.x, y - m.y); if (dm < 0.35) h = Math.min(h, Math.max(2.5, (m.elev ?? 40) - 16)); }
    }
    vid[k] = pos.length / 3;
    pos.push(x * NM, h, -y * NM);
    if (h < 0) tmp.copy(cSand).multiplyScalar(0.7);
    else if (lh.cliff > 0.35 && dNM < 0.25) tmp.copy(cChalk);
    else if (dNM < 0.08 && h < 15) tmp.copy(cSand);
    else if (h > 260) tmp.copy(cRock);
    else tmp.copy(cGrass).lerp(cScrub, clamp((h - 40) / 200, 0, 1) * 0.8 + ((i * 7 + j * 13) % 5) * 0.03);
    col.push(tmp.r, tmp.g, tmp.b);
    if (land[k] && dNM < 0.7 && h < 160 && ((i * 73856093) ^ (j * 19349663)) % 7 === 0) lights.push(x * NM + (((i * 31) % 7) - 3) * 20, h + 6, -y * NM + (((j * 17) % 7) - 3) * 20);
  }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = vid[j * nx + i], b = vid[j * nx + i + 1], c = vid[(j + 1) * nx + i], d = vid[(j + 1) * nx + i + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    if (!(land[j * nx + i] || land[j * nx + i + 1] || land[(j + 1) * nx + i] || land[(j + 1) * nx + i + 1])) continue;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  terrain = new THREE.Mesh(g, curved(new THREE.MeshLambertMaterial({ vertexColors: true })));
  terrain.frustumCulled = false;
  scene.add(terrain);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
  shore = new THREE.Points(lg, curved(new THREE.PointsMaterial({ color: 0xffcf8a, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false })));
  shore.frustumCulled = false;
  scene.add(shore);
}

// ---------------------------------------------------------------- feux (halos)

const LCOL: Record<string, number> = { W: 0xfff8e4, R: 0xff3028, G: 0x28ff82, Y: 0xffd628, A: 0xffbe6e };
let glowTex: THREE.Texture;
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.14, 'rgba(255,255,255,1)'); g.addColorStop(0.24, 'rgba(255,255,255,0.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const pool: THREE.Sprite[] = [];
let used = 0, pxK = 1;
const camP = new THREE.Vector3();
/** Halo d'un feu au point (repère de rendu, m) : taille en pixels, intensité a (0..1). */
function glow(x: number, y: number, z: number, col: string, a: number, px: number, sy = 1): void {
  if (!glowTex) glowTex = glowTexture();
  let s = pool[used];
  if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, transparent: true, fog: false })); s.renderOrder = 5; pool.push(s); scene.add(s); }
  used++;
  s.visible = true;
  // rapproché de 3 % vers l'œil : le halo n'est pas coupé par la houle derrière le feu, la terre masque toujours
  s.position.set(x, y - drop(x, z), z).lerp(camP, 0.03);
  (s.material as THREE.SpriteMaterial).color.setHex(LCOL[col] ?? LCOL.W);
  (s.material as THREE.SpriteMaterial).opacity = a;
  s.scale.set(px * pxK, px * pxK * sy, 1);
}

// ---------------------------------------------------------------- navires

interface ShipObj { g: THREE.Group; wake: THREE.Mesh; bow: THREE.Mesh; win: THREE.Object3D[]; shapes: THREE.Group; key: string }
const ships = new Map<number, ShipObj>();
const HULL = [0x2c3137, 0x5b2424, 0x1f3a57, 0x2b4630, 0x43403c, 0x6b3a1f];
const CONT = [0x9c3b2d, 0x2d5f8a, 0x7c7c74, 0x3f6b3a, 0xb88a2a, 0x5a3d6e, 0xd6d2c6, 0x2a7f86];
const matCache = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number): THREE.MeshLambertMaterial => { let m = matCache.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); matCache.set(c, m); } return m; };
const winMat = new THREE.MeshBasicMaterial({ color: 0xffc77a, fog: true });

/** Silhouette d'un navire en coordonnées navire (avant vers −Z, tribord vers +X, haut vers +Y, origine au milieu à la flottaison). */
function buildShip(t: Target): ShipObj {
  const g = new THREE.Group(), L = t.L, B = t.type === 'sail' ? L / 3.2 : Math.max(3, L / 7), fb = t.type === 'sail' ? 1 : clamp(0.045 * L, 1.2, 12), dr = clamp(0.05 * L, 0.8, 16);
  const kind = /conteneur/i.test(t.name) ? 'pc' : /trolier/i.test(t.name) ? 'tank' : /thanier/i.test(t.name) ? 'lng' : /roulier|voitures/i.test(t.name) ? 'roro'
    : /transbordeur|ferry/i.test(t.name) ? 'ferry' : /vraquier/i.test(t.name) ? 'bulk' : t.type === 'fish' ? 'fish' : t.type === 'sail' ? 'sail' : t.type === 'ram' ? 'ram' : 'cargo';
  const win: THREE.Object3D[] = [];
  const box = (a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, m: THREE.Material, parent: THREE.Object3D = g) => {
    const bg = new THREE.BoxGeometry(Math.max(0.05, b1 - b0), Math.max(0.05, z1 - z0), Math.max(0.05, a1 - a0)); bg.translate((b0 + b1) / 2, (z0 + z1) / 2, -(a0 + a1) / 2);
    const me = new THREE.Mesh(bg, m); parent.add(me); return me;
  };
  // coque : plan de pont effilé à l'avant, extrudé de la quille au pont
  const hb = B / 2, sh = new THREE.Shape([new THREE.Vector2(-hb * 0.85, -L / 2), new THREE.Vector2(hb * 0.85, -L / 2), new THREE.Vector2(hb, -0.35 * L), new THREE.Vector2(hb, 0.22 * L),
    new THREE.Vector2(hb * 0.7, 0.4 * L), new THREE.Vector2(0, L / 2), new THREE.Vector2(-hb * 0.7, 0.4 * L), new THREE.Vector2(-hb, 0.22 * L), new THREE.Vector2(-hb, -0.35 * L)]);
  const hg = new THREE.ExtrudeGeometry(sh, { depth: fb + dr, bevelEnabled: false }); hg.rotateX(-Math.PI / 2); hg.translate(0, -dr, 0);
  const hullC = kind === 'ferry' || kind === 'sail' ? 0xeeeeea : kind === 'roro' ? (t.id % 2 ? 0x1f3a57 : 0xe9e7df) : HULL[t.id % HULL.length];
  g.add(new THREE.Mesh(hg, [mat(kind === 'ferry' || kind === 'sail' ? 0xdcdcd6 : 0x3a3a3a), mat(hullC)]));
  const white = mat(0xe9e7df), grey = mat(0x6d7174), dark = mat(0x2a2a2a);
  const hs = clamp(0.09 * L, 3, 26), aft0 = -0.46 * L, aft1 = -0.33 * L;
  const house = (a0: number, a1: number, h: number, w = 0.85) => {
    box(a0, a1, -hb * w, hb * w, fb, fb + h, white);
    box(a1 - 0.03 * L, a1, -hb * 1.05, hb * 1.05, fb + h - 2.5, fb + h, white); // passerelle et ailerons
    for (let k = 0; k < 3; k++) win.push(box(a1 + 0.002, a1 + 0.004, -hb * w * 0.8, hb * w * 0.8, fb + h * (0.3 + 0.22 * k), fb + h * (0.3 + 0.22 * k) + 0.8, winMat));
  };
  const funnel = (a: number, h: number) => box(a - 0.025 * L, a + 0.015 * L, -B / 7, B / 7, fb + h * 0.6, fb + h + 0.04 * L, mat(t.id % 3 ? 0x2a2a2a : 0xb23a2a));
  switch (kind) {
    case 'pc': {
      house(aft0, aft1, hs + 6); funnel(aft0 + 0.03 * L, hs + 6);
      for (let a = -0.3 * L; a < 0.36 * L; a += 13) {
        const tiers = Math.round(L / 60) + ((t.id * 7 + Math.round(a)) % 4);
        for (let k = 0; k < tiers; k++) box(a, a + 12, -hb * 0.92, hb * 0.92, fb + k * 2.6, fb + (k + 1) * 2.6 - 0.15, mat(CONT[(t.id + Math.round(a) + k * 3) % CONT.length]));
      }
      break;
    }
    case 'tank':
      house(aft0, aft1, hs); funnel(aft0 + 0.03 * L, hs);
      box(aft1, 0.42 * L, -0.6, 0.6, fb, fb + 1.6, grey); box(-0.03 * L, 0.03 * L, -hb * 0.9, hb * 0.9, fb, fb + 2.2, grey);
      break;
    case 'lng':
      house(aft0, aft1, hs); funnel(aft0 + 0.03 * L, hs);
      for (let k = 0; k < 4; k++) { const sg = new THREE.SphereGeometry(hb * 0.85, 18, 10); sg.translate(0, fb + hb * 0.45, -(-0.24 * L + k * 0.17 * L)); g.add(new THREE.Mesh(sg, mat(0xd9d4c4))); }
      break;
    case 'roro':
      box(-0.47 * L, 0.36 * L, -hb, hb, fb, fb + 0.12 * L, mat(t.id % 2 ? 0xe9e7df : 0x1f3a57));
      box(0.3 * L, 0.36 * L, -hb * 1.02, hb * 1.02, fb + 0.12 * L, fb + 0.12 * L + 3, white);
      for (let k = 0; k < 2; k++) win.push(box(0.36 * L + 0.01, 0.36 * L + 0.02, -hb * 0.8, hb * 0.8, fb + 0.12 * L + 0.8 + k, fb + 0.12 * L + 1.4 + k, winMat));
      break;
    case 'ferry': {
      const h = clamp(0.1 * L, 6, 24);
      box(-0.42 * L, 0.3 * L, -hb * 0.95, hb * 0.95, fb, fb + h, white);
      box(-0.42 * L, 0.3 * L, -hb * 0.96, hb * 0.96, fb + h * 0.45, fb + h * 0.55, mat(0x1f3a57)); // bandeau de fenêtres
      box(0.22 * L, 0.3 * L, -hb * 1.05, hb * 1.05, fb + h, fb + h + 3, white);
      funnel(-0.2 * L, h);
      for (let k = 0; k < 4; k++) win.push(box(-0.4 * L + k * 0.17 * L, -0.3 * L + k * 0.17 * L, -hb * 0.97, hb * 0.97, fb + h * 0.47, fb + h * 0.53, winMat));
      break;
    }
    case 'bulk':
      house(aft0, aft1, hs); funnel(aft0 + 0.03 * L, hs);
      for (let a = -0.28 * L; a < 0.36 * L; a += 0.11 * L) box(a, a + 0.08 * L, -hb * 0.7, hb * 0.7, fb, fb + 2.2, mat(0x7a4a2e));
      break;
    case 'fish':
      box(0.1 * L, 0.3 * L, -hb * 0.75, hb * 0.75, fb, fb + clamp(0.12 * L, 2.5, 6), white);
      win.push(box(0.3 * L + 0.01, 0.3 * L + 0.02, -hb * 0.6, hb * 0.6, fb + 1.5, fb + 2.3, winMat));
      box(-0.42 * L, -0.38 * L, -hb, -hb + 0.5, fb, fb + 0.25 * L, dark); box(-0.42 * L, -0.38 * L, hb - 0.5, hb, fb, fb + 0.25 * L, dark); box(-0.42 * L, -0.38 * L, -hb, hb, fb + 0.25 * L - 0.6, fb + 0.25 * L, dark);
      break;
    case 'sail': {
      const sm = new THREE.MeshLambertMaterial({ color: 0xf4f2ea, side: THREE.DoubleSide });
      box(0.04 * L, 0.06 * L, -0.08, 0.08, fb, 1.3 * L, dark);
      if (t.stw > 0.3) {
        const s1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, fb + 1, -0.05 * L), new THREE.Vector3(0, 1.28 * L, -0.05 * L), new THREE.Vector3(0, fb + 1.2, 0.42 * L)]);
        const s2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, fb + 0.5, -0.08 * L), new THREE.Vector3(0, 1.2 * L, -0.08 * L), new THREE.Vector3(0, fb + 0.3, -0.48 * L)]);
        s1.computeVertexNormals(); s2.computeVertexNormals();
        const m1 = new THREE.Mesh(s1, sm), m2 = new THREE.Mesh(s2, sm); m1.rotation.y = 0.25; m2.rotation.y = 0.15; g.add(m1, m2);
      }
      break;
    }
    case 'ram':
      house(0.1 * L, 0.3 * L, hs); box(-0.46 * L, -0.42 * L, -hb * 0.8, hb * 0.8, fb, fb + 0.15 * L, mat(0xd06a1a));
      break;
    default: // cargo, caboteur, NUC
      house(aft0, aft1, hs); funnel(aft0 + 0.03 * L, hs);
      for (let a = -0.24 * L; a < 0.34 * L; a += 0.14 * L) { box(a, a + 0.09 * L, -hb * 0.7, hb * 0.7, fb, fb + 1.6, mat(0x3c5a6e)); if (L > 90) box(a - 0.02 * L, a - 0.012 * L, -0.4, 0.4, fb, fb + 0.1 * L, mat(0xd8a12a)); }
  }
  // mâts portant les feux (mêmes hauteurs que sim/visual.ts)
  if (kind !== 'sail') {
    const hM = mastH(L);
    box(0.24 * L, 0.26 * L, -0.25, 0.25, fb, hM + 0.5, dark);
    if (L >= 50 && kind !== 'fish') box(-0.31 * L, -0.29 * L, -0.25, 0.25, fb, hM + Math.max(4.5, 0.04 * L) + 0.5, dark);
  }
  // marques de jour
  const shapes = new THREE.Group();
  for (const s of dayShapes(t)) {
    const r = 0.45;
    const geo = s.shape === 'ball' ? new THREE.SphereGeometry(r, 10, 8) : s.shape === 'diamond' ? new THREE.OctahedronGeometry(r * 1.2) : new THREE.ConeGeometry(r, r * 1.6, 12);
    if (s.shape === 'coneDown') geo.rotateX(Math.PI);
    geo.translate(0, s.z, -s.a);
    shapes.add(new THREE.Mesh(geo, mat(0x0a0a0a)));
  }
  g.add(shapes);
  // vague d'étrave et sillage : surfaces d'écume translucides
  const foam = new THREE.MeshBasicMaterial({ color: 0xf3f6f7, transparent: true, opacity: 0.6, depthWrite: false });
  const wg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-hb * 0.8, 0.15, L / 2), new THREE.Vector3(hb * 0.8, 0.15, L / 2), new THREE.Vector3(hb * 2.6, 0.15, L / 2 + 1.6 * L), new THREE.Vector3(-hb * 2.6, 0.15, L / 2 + 1.6 * L)]);
  wg.setIndex([0, 2, 1, 0, 3, 2]);
  const wake = new THREE.Mesh(wg, foam.clone()); g.add(wake);
  const bg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.25, -L / 2 - 2), new THREE.Vector3(-hb * 1.3, 0.2, -0.3 * L), new THREE.Vector3(hb * 1.3, 0.2, -0.3 * L)]);
  const bow = new THREE.Mesh(bg, foam.clone()); (bow.material as THREE.Material).side = THREE.DoubleSide; g.add(bow);
  g.rotation.order = 'YXZ';
  scene.add(g);
  return { g, wake, bow, win, shapes, key: `${t.type}|${t.name}|${t.stw > 0.3}` };
}

// ---------------------------------------------------------------- bouées, bateaux-feux, phares

interface MarkObj { g: THREE.Group; top: number }
const marks = new Map<string, MarkObj>();
let marksKey = '';
function buildMarks(): void {
  for (const m of marks.values()) scene.remove(m.g);
  marks.clear(); marksKey = CHART.key;
  const cols: Record<string, number[]> = { N: [0xf4d000, 0x111111], S: [0x111111, 0xf4d000], E: [0x111111, 0xf4d000, 0x111111], W: [0xf4d000, 0x111111, 0xf4d000], special: [0xf4d000], safe: [0xc81e1e, 0xf0f0f0] };
  for (const m of CHART.marks) {
    const g = new THREE.Group(); let top = 5.2;
    if (m.kind === 'lh') {
      const z = m.elev ?? 40, tg = new THREE.CylinderGeometry(2.2, 3, 18, 12); tg.translate(0, z - 9, 0);
      g.add(new THREE.Mesh(tg, mat(0xeeeeea)));
      top = z;
    } else if (m.kind === 'lv') {
      const hg = new THREE.BoxGeometry(9, 5, 42); hg.translate(0, 2, 0); g.add(new THREE.Mesh(hg, mat(0xc42020)));
      const tw = new THREE.BoxGeometry(2, 8, 2); tw.translate(0, 9, 0); g.add(new THREE.Mesh(tw, mat(0xc42020)));
      top = 13.5;
    } else {
      const cs = cols[m.kind] ?? cols.safe;
      const fl = new THREE.CylinderGeometry(1.3, 1.3, 1.4, 14); fl.translate(0, 0.5, 0); g.add(new THREE.Mesh(fl, mat(cs[0])));
      cs.forEach((c, i) => { const bg = new THREE.CylinderGeometry(0.6, 0.6, 3.2 / cs.length, 10); bg.translate(0, 1.2 + (i + 0.5) * (3.2 / cs.length), 0); g.add(new THREE.Mesh(bg, mat(c))); });
      const cone = (y: number, up: boolean) => { const cg = new THREE.ConeGeometry(0.5, 0.7, 12); if (!up) cg.rotateX(Math.PI); cg.translate(0, y, 0); g.add(new THREE.Mesh(cg, mat(0x111111))); };
      if (m.kind === 'N') { cone(4.8, true); cone(5.6, true); } else if (m.kind === 'S') { cone(4.8, false); cone(5.6, false); }
      else if (m.kind === 'E') { cone(4.7, false); cone(5.6, true); } else if (m.kind === 'W') { cone(4.7, true); cone(5.6, false); }
      else if (m.kind === 'special') { const x1 = new THREE.BoxGeometry(1.2, 0.2, 0.2); x1.rotateZ(0.8); x1.translate(0, 5.2, 0); const x2 = x1.clone(); x2.rotateY(0); x2.rotateZ(-1.6); g.add(new THREE.Mesh(x1, mat(0xf4d000)), new THREE.Mesh(x2, mat(0xf4d000))); }
      else { const sg = new THREE.SphereGeometry(0.45, 10, 8); sg.translate(0, 5.1, 0); g.add(new THREE.Mesh(sg, mat(0xc81e1e))); }
    }
    scene.add(g);
    marks.set(m.id, { g, top });
  }
}

// ---------------------------------------------------------------- image

export interface View3D { W: number; H: number; yaw: number; rel: number; hfov: number; binoc: boolean; aft: boolean }

function lightA(d: number, rangeNM: number, vis: number, night: boolean): number {
  const rng = Math.min(rangeNM * NM * 1.5, S.env.vis === 'poor' ? vis * 1.4 : Infinity);
  if (d > rng) return 0;
  return clamp(0.4 + 0.9 * (1 - d / rng), 0, 1) * (night ? 1 : d < NM ? 0.12 : 0);
}

export function render3D(v: View3D): void {
  if (!renderer) return;
  const o = S.own, night = S.env.night, fogW = S.env.vis === 'poor';
  const vis = fogW ? 0.4 * NM : night ? 14 * NM : 16 * NM;
  if (terrainKey !== CHART.key) buildTerrain();
  if (marksKey !== CHART.key) buildMarks();
  // taille et caméra
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== v.W || size.y !== v.H) renderer.setSize(v.W, v.H, false);
  camera.aspect = v.W / v.H;
  camera.fov = (2 * Math.atan(Math.tan((v.hfov / 2) * D2R) * (v.H / v.W))) / D2R;
  if (v.binoc) camera.clearViewOffset(); else camera.setViewOffset(v.W, v.H, 0, 0.08 * v.H, v.W, v.H);
  camera.updateProjectionMatrix();
  pxK = 2 / (v.H * camera.projectionMatrix.elements[5]);
  // plate-forme : cap, tangage, roulis ; œil à la passerelle (50 m de l'arrière, 32 m au-dessus de l'eau)
  const m = motion(), damp = v.binoc ? 0.6 : 1;
  rig.rotation.set(m.pitch * D2R * damp, -o.hdg * D2R, m.roll * D2R * damp);
  rig.position.set(0, 0, 0);
  camera.position.set(0, EYE, -(-o.L / 2 + 50));
  camera.rotation.set(0, -v.rel * D2R, 0);
  deck.visible = !v.aft;
  // ciel, lumière, brouillard
  const top = new THREE.Color(), hor = new THREE.Color(), deep = new THREE.Color();
  if (fogW) { top.set(night ? 0x0d1013 : 0xaeb6ba); hor.set(night ? 0x1a1f23 : 0xc9cfd1); deep.set(night ? 0x07090b : 0x4f5b61); }
  else if (night) { top.set(0x02040a); hor.set(0x0d1724); deep.set(0x020406); }
  else { top.set(0x5d93c8); hor.set(0xd3e2ec); deep.set(0x173c52); }
  skyU.uTop.value.copy(top); skyU.uHor.value.copy(hor); skyU.uSea.value.copy(deep).lerp(hor, 0.35);
  skyU.uSunK.value = night || fogW ? 0 : 1;
  scene.background = null;
  (scene.fog as THREE.FogExp2).color.copy(hor); (scene.fog as THREE.FogExp2).density = 3 / vis;
  hemi.intensity = night ? 0.06 : fogW ? 0.9 : 1.15; sun.intensity = night ? 0 : fogW ? 0.35 : 1.7;
  hemi.color.set(night ? 0x334466 : 0xdfe9f2);
  stars.visible = night && !fogW;
  camera.updateMatrixWorld(true);
  const cp = camP; camera.getWorldPosition(cp);
  skyMesh.position.copy(cp); stars.position.copy(cp);
  // mer
  const bf = beaufort(S.env.windKn), hs = HS[bf], to = (S.env.windFrom + 180) * D2R, ox = o.x * NM, oy = o.y * NM;
  const lam = clamp(10 + 16 * hs, 8, 180), A = Math.max(0.05, hs / 2.2);
  [[0, 1, 0.5], [0.45, 0.62, 0.3], [-0.5, 0.41, 0.2], [0.9, 0.27, 0.12]].forEach(([da, lk, ak], i) => {
    const a = to + da, k = (2 * Math.PI) / (lam * lk);
    waterU.uW.value[i].set(Math.sin(a), -Math.cos(a), k, A * ak);
  });
  waterU.uTime.value = S.t; waterU.uOff.value.set(ox, -oy); waterU.uCam.value.copy(cp);
  waterU.uTop.value.copy(top); waterU.uHor.value.copy(hor); waterU.uDeep.value.copy(deep); waterU.uFog.value.copy(hor);
  waterU.uFogK.value = (3 / vis) * (fogW ? 1 : 0.55); waterU.uSunK.value = night || fogW ? 0 : 1;
  waterU.uFoam.value = clamp((bf - 3) / 5, 0, 0.9) * (night ? 0.12 : 1);
  waterU.uRip.value = 0.12 + 0.05 * Math.min(bf, 6);
  water.position.set(0, 0, 0);
  // relief et lumières de côte (repère carte → repère de rendu)
  if (terrain) terrain.position.set(-ox, 0, oy);
  if (shore) { shore.position.set(-ox, 0, oy); shore.visible = night && !fogW; }
  used = 0;
  // navires
  const seen = new Set<number>(), rollK = Math.min(1, hs / 3);
  for (const t of S.targets) {
    const x = t.x * NM - ox, z = -(t.y * NM - oy), d = Math.hypot(x, z);
    let so = ships.get(t.id);
    const key = `${t.type}|${t.name}|${t.stw > 0.3}`;
    if (so && so.key !== key) { scene.remove(so.g); so = undefined; }
    if (!so) { so = buildShip(t); ships.set(t.id, so); }
    seen.add(t.id);
    const vis3 = d < 30 * NM;
    so.g.visible = vis3;
    if (!vis3) continue;
    const ph = t.id * 1.7;
    so.g.position.set(x, -drop(x, z) + 0.3 * hs * Math.sin(S.t * 0.8 + ph) * (t.L < 60 ? 1 : 0.3), z);
    so.g.rotation.set(rollK * (t.L < 60 ? 3 : 0.6) * Math.sin(S.t * 0.6 + ph) * D2R, -t.hdg * D2R, rollK * (t.L < 60 ? 8 : 1.5) * Math.sin(S.t * 0.45 + ph) * D2R);
    const sp = clamp(t.stw / 15, 0, 1);
    (so.wake.material as THREE.MeshBasicMaterial).opacity = (night ? 0.12 : 0.45) * sp; so.wake.visible = t.stw > 2;
    (so.bow.material as THREE.MeshBasicMaterial).opacity = (night ? 0.15 : 0.7) * sp; so.bow.visible = t.stw > 2;
    so.shapes.visible = !night;
    for (const w of so.win) w.visible = night && !fogW && d < 4 * NM;
    // feux de navigation selon les secteurs (sim/visual.ts)
    const ob = n360(brgOf(-x, z) - t.hdg), hsn = Math.sin(t.hdg * D2R), hcs = Math.cos(t.hdg * D2R);
    for (const l of navLights3D(t, ob)) {
      const a = lightA(d, l.range, vis, night);
      if (a <= 0) continue;
      const lx = x + l.a * hsn + l.b * hcs, lz = z - (l.a * hcs - l.b * hsn);
      const px = (v.binoc ? 22 : 16) * (0.7 + 0.5 * a) * (fogW ? 1.8 : 1);
      glow(lx, l.z, lz, l.col, a, px);
      if (night && !fogW && d < 6 * NM) glow(lx, 0.4, lz, l.col, a * 0.22, px * 0.7, 6);
    }
    // projecteurs de pont des chalutiers en pêche
    if (t.type === 'fish' && night && !fogW && d < 6 * NM) glow(x, 6, z, 'W', 0.5 * (1 - d / (6 * NM)) + 0.2, 16);
  }
  for (const [id, so] of ships) if (!seen.has(id)) { scene.remove(so.g); ships.delete(id); }
  // bouées, bateaux-feux et phares
  for (const mk of CHART.marks) {
    const mo = marks.get(mk.id);
    if (!mo) continue;
    const x = mk.x * NM - ox, z = -(mk.y * NM - oy), d = Math.hypot(x, z), ph = mk.id.charCodeAt(0) * 0.37 + mk.id.length;
    const bob = mk.kind === 'lh' ? 0 : (mk.kind === 'lv' ? 0.08 : 0.18) * hs * Math.sin(S.t * (mk.kind === 'lv' ? 0.5 : 1.25) + ph);
    mo.g.position.set(x, bob - drop(x, z), z);
    if (mk.kind !== 'lh') mo.g.rotation.set(0.05 * hs * Math.sin(S.t * 0.9 + ph), (S.env.windFrom + 15 * Math.sin(S.t * 0.2 + ph)) * -D2R, 0.06 * hs * Math.sin(S.t * 1.1 + ph));
    mo.g.visible = d < 25 * NM;
    const range = mk.kind === 'lh' ? mk.range ?? 15 : mk.kind === 'lv' ? 12 : 4, a = lightA(d, range, vis, night);
    const on = mk.kind === 'lh' ? charOn(mk.light ?? 'Fl 10s', S.t + mk.id.length * 1.7) : mk.light ? charOn(mk.light, S.t + mk.id.length * 1.3) : flashOn(mk.kind, mk.id);
    if (a > 0 && on) glow(x, mo.top + bob, z, mk.kind === 'special' ? 'Y' : 'W', a, mk.kind === 'lh' ? 16 : mk.kind === 'lv' ? 13 : 10);
  }
  for (let i = used; i < pool.length; i++) pool[i].visible = false;
  renderer.render(scene, camera);
}
