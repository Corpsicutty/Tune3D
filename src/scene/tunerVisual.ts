import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import '@babylonjs/loaders/glTF';

import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';

import type { Camera } from '@babylonjs/core/Cameras/camera';



export type TunerVisual = {

  updateFromCents: (cents: number | null, volume: number) => void;

  dispose: () => void;

};



const CENTS_SPAN = 50;

const OUTER_RADIUS = 2.35;

const BALL_RADIUS = 0.14;

const BALL_GLB_URL = '/models/tuner-marble.glb';

const RING_GLB_URL = '/models/tuner-rings.glb';

const RING_STEP = 5;
const RING_CENTS: number[] = [];
for (let c = CENTS_SPAN; c >= 0; c -= RING_STEP) {
  RING_CENTS.push(c);
}

function isMajorRing(cents: number): boolean {
  return cents % 10 === 0;
}



// Reference appearance targets (display space, post color management)
const RING_CYAN = new Color3(0.447, 0.741, 0.969); // #72BDF7
const RING_INNER_BASE = new Color3(0.024, 0.227, 0.451); // #063A73
const RING_OUTER_BASE = new Color3(0.029, 0.318, 0.604); // #07519A
const RING_INNER_EMISSION = new Color3(0.082, 0.549, 1.0); // #158CFF
const RING_OUTER_EMISSION = new Color3(0.149, 0.608, 1.0); // #269BFF
const CYAN = RING_CYAN;
const CYAN_DIM = new Color3(0.16, 0.48, 0.74);
const GREEN = new Color3(0.337, 1.0, 0.482); // #56FF7B
const IN_TUNE_CENTS = 5;
const WARM_SHARP = new Color3(1.0, 0.541, 0.271); // #FF8A45
const WARM_FLAT = new Color3(0.976, 0.541, 0.851); // #F98AD9

function saturateColor(color: Color3, amount: number): Color3 {
  const gray = (color.r + color.g + color.b) / 3;
  return new Color3(
    gray + (color.r - gray) * amount,
    gray + (color.g - gray) * amount,
    gray + (color.b - gray) * amount,
  );
}
const IDLE_CYAN = new Color3(0.02, 0.169, 0.384); // #052B62 orb body
const ORB_HIGHLIGHT = new Color3(0.682, 0.937, 1.0); // #AEEFFF



type RingVisual = {

  cents: number;

  mesh: Mesh;

  mat: StandardMaterial | PBRMaterial | null;

  glow?: Mesh;

  glowMat?: StandardMaterial;

  flareMesh?: Mesh;

  baseColor: Color3;

  baseIntensity: number;

  glowLevel: number;

  glowScale: number;

  proximityWidth: number;

  isGlass: boolean;

};



function makeRingGlassMat(
  scene: Scene,
  name: string,
  opts: {
    base: Color3;
    emission: Color3;
    emissionStrength: number;
    roughness: number;
    coatIntensity: number;
    specularIntensity?: number;
  },
): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = opts.base;
  mat.emissiveColor = opts.emission;
  mat.emissiveIntensity = opts.emissionStrength;
  mat.metallic = 0;
  mat.roughness = opts.roughness;
  mat.indexOfRefraction = 1.46;
  mat.specularIntensity = opts.specularIntensity ?? 0.52;
  mat.environmentIntensity = 0.85;
  mat.directIntensity = 1.15;
  mat.alpha = 1;
  mat.clearCoat.isEnabled = true;
  mat.clearCoat.intensity = opts.coatIntensity;
  mat.clearCoat.roughness = 0.028;
  mat.clearCoat.tintColor = new Color3(1, 1, 1);
  mat.backFaceCulling = false;
  return mat;
}

function makeGlowHaloMat(scene: Scene, name: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = saturateColor(color, 1.15).scale(0.22);
  mat.alpha = 0.022;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  return mat;
}

/** Radial falloff disc — reads as bloom, not a solid sphere edge. */
function makeSoftBallBloomMat(scene: Scene, name: string): StandardMaterial {
  const size = 256;
  const tex = new DynamicTexture(`${name}-tex`, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.1)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.025)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.hasAlpha = true;
  tex.update();

  const mat = new StandardMaterial(name, scene);
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  mat.alpha = 0.85;
  return mat;
}

function createBallBloomHalo(scene: Scene, root: TransformNode): { ballGlow: Mesh; ballGlowMat: StandardMaterial } {
  const ballGlowMat = makeSoftBallBloomMat(scene, 'ball-bloom-halo');
  const ballGlow = MeshBuilder.CreatePlane(
    'ball-bloom-halo',
    { width: BALL_RADIUS * 5.5, height: BALL_RADIUS * 5.5 },
    scene,
  );
  ballGlow.parent = root;
  ballGlow.position.z = -0.02;
  ballGlow.material = ballGlowMat;
  return { ballGlow, ballGlowMat };
}



function makeBallMat(scene: Scene): PBRMaterial {
  const mat = new PBRMaterial('ball-glass', scene);
  mat.metallic = 0;
  mat.roughness = 0.035;
  mat.alpha = 0.88;
  mat.albedoColor = IDLE_CYAN.scale(0.35);
  mat.emissiveColor = new Color3(0.031, 0.49, 1.0);
  mat.emissiveIntensity = 0.12;
  mat.environmentIntensity = 0.95;
  mat.directIntensity = 1.25;
  mat.specularIntensity = 0.75;
  mat.clearCoat.isEnabled = true;
  mat.clearCoat.intensity = 0.92;
  mat.clearCoat.roughness = 0.008;
  mat.clearCoat.tintColor = ORB_HIGHLIGHT;
  mat.backFaceCulling = false;
  mat.indexOfRefraction = 1.46;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.subSurface.isTranslucencyEnabled = true;
  mat.subSurface.translucencyIntensity = 0.42;
  mat.subSurface.tintColor = new Color3(0.02, 0.12, 0.35);
  return mat;
}

function makeBallCoreMat(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('ball-core', scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = IDLE_CYAN.scale(1.2);
  mat.alpha = 0.88;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  return mat;
}

function makeInnerHotspotMat(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('ball-hotspot', scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = GREEN.scale(2.5);
  mat.alpha = 0.95;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  return mat;
}

function addBallInnerGlow(
  scene: Scene,
  root: TransformNode,
): { coreMats: StandardMaterial[]; innerHotspotMat: StandardMaterial } {
  const coreMat = makeBallCoreMat(scene);
  const core = MeshBuilder.CreateSphere('ball-inner-core', { diameter: BALL_RADIUS * 1.58, segments: 28 }, scene);
  core.parent = root;
  core.position.set(BALL_RADIUS * 0.1, BALL_RADIUS * 0.14, -BALL_RADIUS * 0.06);
  core.material = coreMat;

  const innerHotspotMat = makeInnerHotspotMat(scene);
  const hotspot = MeshBuilder.CreateSphere('ball-inner-hotspot', { diameter: BALL_RADIUS * 1.02, segments: 24 }, scene);
  hotspot.parent = root;
  hotspot.material = innerHotspotMat;

  return { coreMats: [coreMat], innerHotspotMat };
}



function ballTuneColor(cents: number, hasSignal: boolean): Color3 {
  if (!hasSignal) return saturateColor(IDLE_CYAN, 1.12);
  const abs = Math.abs(cents);
  if (abs <= IN_TUNE_CENTS) return saturateColor(GREEN, 1.18);
  const warmEnd = cents >= 0 ? WARM_SHARP : WARM_FLAT;
  const blend = Math.min((abs - IN_TUNE_CENTS) / (CENTS_SPAN - IN_TUNE_CENTS), 1);
  const eased = Math.pow(blend, 0.5);
  return saturateColor(Color3.Lerp(GREEN, warmEnd, eased), 1.22);
}


function applyBallColor(
  shellMat: PBRMaterial | null,
  coreMats: Material[],
  innerHotspotMat: StandardMaterial,
  color: Color3,
  hasSignal: boolean,
  cents: number,
  breathe: number,
  volumeLevel: number,
): void {
  const inTune = hasSignal && Math.abs(cents) <= IN_TUNE_CENTS;
  const absCents = Math.abs(cents);
  const tuneBlend = hasSignal
    ? Math.min(Math.max(absCents - IN_TUNE_CENTS, 0) / (CENTS_SPAN - IN_TUNE_CENTS), 1)
    : 0;

  if (shellMat) {
    shellMat.albedoColor = Color3.Lerp(IDLE_CYAN.scale(0.28), color.scale(0.32), hasSignal ? 0.78 : 0);
    shellMat.emissiveColor = Color3.Lerp(new Color3(0.02, 0.18, 0.45), color, hasSignal ? 0.55 : 0.1);
    shellMat.emissiveIntensity = (hasSignal ? 0.08 : 0.1) * breathe;
    shellMat.roughness = 0.03;
    shellMat.alpha = hasSignal ? 0.82 : 0.86;
    shellMat.subSurface.translucencyIntensity = hasSignal ? 0.48 : 0.38;
    if (!shellMat.clearCoat.isEnabled) shellMat.clearCoat.isEnabled = true;
    shellMat.clearCoat.intensity = inTune ? 1.0 : 0.88;
    shellMat.clearCoat.tintColor = inTune ? GREEN : ORB_HIGHLIGHT;
  }

  const hotspotStrength = inTune ? 5.8 : hasSignal ? 3.6 + tuneBlend * 1.5 : 1.5;
  const coreStrength = inTune ? 3.5 : hasSignal ? 2.4 + tuneBlend * 1.1 : 1.0;
  const hotspotTint = (hasSignal ? color : IDLE_CYAN).scale(hotspotStrength * breathe);
  const coreTint = (hasSignal ? color : IDLE_CYAN).scale(coreStrength * breathe);

  innerHotspotMat.emissiveColor = hotspotTint;
  innerHotspotMat.alpha = hasSignal ? 0.98 : 0.75;

  const coreAlpha = 0.78 + volumeLevel * 0.18 + (inTune ? 0.12 : 0);
  for (const coreMat of coreMats) {
    if (coreMat instanceof PBRMaterial) {
      coreMat.emissiveColor = coreTint;
      coreMat.emissiveIntensity = (inTune ? 2.2 : hasSignal ? 1.5 : 0.6) * breathe;
      coreMat.alpha = coreAlpha;
    } else if (coreMat instanceof StandardMaterial) {
      coreMat.emissiveColor = coreTint;
      coreMat.alpha = coreAlpha;
    }
  }
}

type BallVisual = {
  root: TransformNode;
  shellMat: PBRMaterial | null;
  coreMats: Material[];
  innerHotspotMat: StandardMaterial;
  ballGlow: Mesh;
  ballGlowMat: StandardMaterial;
};

function createProceduralBallVisual(scene: Scene, parent: TransformNode): BallVisual {
  const root = new TransformNode('tuner-ball-root', scene);
  root.parent = parent;

  const ballMat = makeBallMat(scene);
  const ball = MeshBuilder.CreateSphere('tuner-ball', { diameter: BALL_RADIUS * 2, segments: 32 }, scene);
  ball.parent = root;
  ball.material = ballMat;

  const { coreMats, innerHotspotMat } = addBallInnerGlow(scene, root);
  const { ballGlow, ballGlowMat } = createBallBloomHalo(scene, root);

  return { root, shellMat: ballMat, coreMats, innerHotspotMat, ballGlow, ballGlowMat };
}

async function loadBallVisual(scene: Scene, parent: TransformNode): Promise<BallVisual> {
  try {
    const result = await SceneLoader.ImportMeshAsync('', BALL_GLB_URL, '', scene);
    const root = new TransformNode('tuner-ball-root', scene);
    root.parent = parent;

    const meshes = result.meshes.filter((m): m is Mesh => m instanceof Mesh && m.name !== '__root__');
    meshes.sort(
      (a, b) =>
        b.getBoundingInfo().boundingBox.extendSize.length() -
        a.getBoundingInfo().boundingBox.extendSize.length(),
    );

    const shellMesh = meshes.find((m) => m.name.includes('GlassSphere') || m.name.includes('TestMarble')) ?? meshes[0];
    const inclusionMeshes = meshes.filter((m) => m !== shellMesh);

    if (!shellMesh) throw new Error('No shell mesh in GLB');

    for (const mesh of meshes) {
      mesh.parent = root;
      mesh.rotation.x = 0;
      mesh.rotation.y = 0;
      mesh.rotation.z = 0;
    }

    for (const mesh of result.meshes) {
      if (!(mesh instanceof Mesh) || mesh === shellMesh || inclusionMeshes.includes(mesh as Mesh)) continue;
      if (mesh.name === '__root__' || mesh.getTotalVertices() === 0) mesh.dispose();
    }

    const ext = shellMesh.getBoundingInfo().boundingBox.extendSize;
    const diameter = Math.max(ext.x, ext.y, ext.z) * 2;
    const target = BALL_RADIUS * 2;
    if (diameter > 0 && Math.abs(diameter - target) > 0.01) {
      root.scaling.setAll(target / diameter);
    }

    shellMesh.name = 'tuner-ball-shell';
    const shellMat = makeBallMat(scene);
    shellMesh.material = shellMat;

    // Hide GLB inclusions — use vibrant procedural inner glow for readable tuning feedback.
    for (const inc of inclusionMeshes) {
      inc.setEnabled(false);
    }

    const { coreMats, innerHotspotMat } = addBallInnerGlow(scene, root);
    const { ballGlow, ballGlowMat } = createBallBloomHalo(scene, root);

    return { root, shellMat, coreMats, innerHotspotMat, ballGlow, ballGlowMat };
  } catch (err) {
    console.warn('Failed to load tuner marble GLB, using procedural fallback:', err);
    return createProceduralBallVisual(scene, parent);
  }
}



function resolveCircleCollision(

  ballX: number,

  ballY: number,

  velX: number,

  velY: number,

  maxR: number,

  restitution: number,

  friction: number,

): { x: number; y: number; vx: number; vy: number; hit: boolean } {

  const dist = Math.hypot(ballX, ballY);

  if (dist <= maxR) return { x: ballX, y: ballY, vx: velX, vy: velY, hit: false };



  const nx = ballX / dist;

  const ny = ballY / dist;

  const x = nx * maxR;

  const y = ny * maxR;

  let vx = velX;

  let vy = velY;



  const vn = vx * nx + vy * ny;

  if (vn > 0) {

    vx -= (1 + restitution) * vn * nx;

    vy -= (1 + restitution) * vn * ny;

    const tx = -ny;

    const ty = nx;

    const vt = vx * tx + vy * ty;

    vx -= vt * friction * tx;

    vy -= vt * friction * ty;

  }



  return { x, y, vx, vy, hit: true };

}



function centsToTarget(cents: number): { x: number; y: number } {

  const clamped = Math.max(-CENTS_SPAN, Math.min(CENTS_SPAN, cents));

  const r = (Math.abs(clamped) / CENTS_SPAN) * OUTER_RADIUS;

  const theta = (clamped / CENTS_SPAN) * (Math.PI / 2);

  return { x: Math.sin(theta) * r, y: Math.cos(theta) * r };

}



const FACE_ROTATION = Math.PI / 2;



function orientToCamera(mesh: Mesh): void {

  mesh.rotation.x = FACE_ROTATION;

}



function ringRadiusForCents(cents: number): number {

  return (Math.abs(cents) / CENTS_SPAN) * OUTER_RADIUS;

}

function meshRingRadius(mesh: Mesh): number {
  const ext = mesh.getBoundingInfo().boundingBox.extendSize;
  return Math.max(ext.x, ext.y, ext.z);
}



function addGlowLabel(

  scene: Scene,

  parent: TransformNode,

  text: string,

  x: number,

  y: number,

  color: string,

  fontSize = 36,

  glow = false,

): void {

  const w = fontSize * 1.1;

  const h = fontSize * 1.2;

  const plane = MeshBuilder.CreatePlane(`label-${text}`, { width: w / 80, height: h / 80 }, scene);

  plane.parent = parent;

  plane.position.set(x, y, 0.03);



  const tex = new DynamicTexture(`label-tex-${text}-${x}`, { width: w * 2, height: h * 2 }, scene, false);

  const ctx = tex.getContext() as CanvasRenderingContext2D;

  ctx.clearRect(0, 0, w * 2, h * 2);

  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow ? 8 : 0;
  }

  ctx.fillStyle = color;

  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;

  ctx.textAlign = 'center';

  ctx.textBaseline = 'middle';

  ctx.fillText(text, w, h);

  tex.hasAlpha = true;

  tex.update();



  const mat = new StandardMaterial(`label-mat-${text}-${x}`, scene);

  mat.diffuseTexture = tex;

  mat.emissiveTexture = tex;

  mat.opacityTexture = tex;

  mat.backFaceCulling = false;

  mat.disableLighting = true;

  mat.useAlphaFromDiffuseTexture = true;

  plane.material = mat;

}



function buildVerticalDash(scene: Scene, parent: TransformNode): void {

  const lines: Vector3[][] = [];

  const segments = 18;

  const span = OUTER_RADIUS * 2;

  const step = span / segments;



  for (let i = 0; i < segments; i++) {

    if (i % 2 !== 0) continue;

    const y0 = -OUTER_RADIUS + i * step;

    const y1 = y0 + step * 0.55;

    lines.push([new Vector3(0, y0, 0.01), new Vector3(0, y1, 0.01)]);

  }



  const dash = MeshBuilder.CreateLineSystem('v-dash', { lines }, scene);

  dash.color = new Color3(0.08, 0.35, 0.58);
  dash.alpha = 0.22;

  dash.parent = parent;

}



function ringMetaForCents(cents: number, index: number): {
  baseIntensity: number;
  baseColor: Color3;
  glowScale: number;
  proximityWidth: number;
} {
  const isOuter = cents === CENTS_SPAN;
  const isCenter = cents === 0;
  const major = isMajorRing(cents);
  const isMinor = !isCenter && !major;
  const dimFactor = 0.45 + (index / (RING_CENTS.length - 1)) * 0.55;
  return {
    baseIntensity: isOuter ? 0.32 : major ? 0.18 : 0.07,
    baseColor: Color3.Lerp(CYAN_DIM, CYAN, dimFactor),
    glowScale: isOuter ? 1 : major ? 0.85 : 0.25,
    proximityWidth: isCenter ? 0.32 : isMinor ? 0.16 : 0.28,
  };
}

function parseRingCents(name: string): number | null {
  const match = name.match(/ring[_-]?(\d+)/i);
  if (!match) return null;
  if (name.toLowerCase().includes('flare')) return null;
  return Number.parseInt(match[1], 10);
}

function ringGlassPreset(cents: number): {
  base: Color3;
  emission: Color3;
  emissionStrength: number;
  roughness: number;
  coatIntensity: number;
  specularIntensity: number;
} {
  const isOuter = cents === CENTS_SPAN;
  const major = isMajorRing(cents);
  if (isOuter) {
    return {
      base: RING_OUTER_BASE,
      emission: RING_OUTER_EMISSION,
      emissionStrength: 1.85,
      roughness: 0.1,
      coatIntensity: 0.55,
      specularIntensity: 0.55,
    };
  }
  if (major) {
    return {
      base: RING_INNER_BASE,
      emission: RING_INNER_EMISSION,
      emissionStrength: 1.2,
      roughness: 0.12,
      coatIntensity: 0.42,
      specularIntensity: 0.48,
    };
  }
  return {
    base: RING_INNER_BASE.scale(0.85),
    emission: RING_INNER_EMISSION.scale(0.75),
    emissionStrength: 0.48,
    roughness: 0.16,
    coatIntensity: 0.28,
    specularIntensity: 0.38,
  };
}

function assignRingGlassMat(scene: Scene, cents: number, mesh: Mesh): PBRMaterial {
  const preset = ringGlassPreset(cents);
  const mat = makeRingGlassMat(scene, `ring-glass-${cents}`, preset);
  mesh.material = mat;
  return mat;
}

function buildProceduralRings(scene: Scene, tunerRoot: TransformNode): RingVisual[] {
  const rings: RingVisual[] = [];

  for (let i = 0; i < RING_CENTS.length; i++) {
    const cents = RING_CENTS[i];
    const radius = ringRadiusForCents(cents);
    const isOuter = cents === CENTS_SPAN;
    const isCenter = cents === 0;
    const major = isMajorRing(cents);
    const meta = ringMetaForCents(cents, i);

    let mesh: Mesh;
    let glow: Mesh | undefined;
    let glowMat: StandardMaterial | undefined;
    let mat: PBRMaterial | StandardMaterial;

    if (isCenter) {
      const dot = MeshBuilder.CreateDisc('center-dot', { radius: 0.045, tessellation: 32 }, scene);
      dot.parent = tunerRoot;
      orientToCamera(dot);
      const centerMat = new StandardMaterial('center-zero-mat', scene);
      centerMat.diffuseColor = Color3.Black();
      centerMat.emissiveColor = GREEN.scale(1.45);
      centerMat.disableLighting = true;
      dot.material = centerMat;
      mesh = dot;
      mat = centerMat;
    } else {
      const tube = isOuter ? 0.04 : major ? 0.02 : 0.011;
      const ring = MeshBuilder.CreateTorus(
        `ring-${cents}`,
        { diameter: radius * 2, thickness: tube, tessellation: 64 },
        scene,
      );
      ring.parent = tunerRoot;
      orientToCamera(ring);
      mat = assignRingGlassMat(scene, cents, ring);
      mesh = ring;

      glowMat = makeGlowHaloMat(scene, `ring-glow-mat-${cents}`, meta.baseColor);
      if (!major && !isOuter) {
        glowMat.alpha = 0.02;
      }
      const glowTube = tube * (isOuter ? 2.2 : major ? 1.8 : 1.4);
      glow = MeshBuilder.CreateTorus(
        `ring-glow-${cents}`,
        { diameter: radius * 2, thickness: glowTube, tessellation: 48 },
        scene,
      );
      glow.parent = tunerRoot;
      orientToCamera(glow);
      glow.material = glowMat;
    }

    rings.push({
      cents,
      mesh,
      mat,
      glow,
      glowMat,
      baseColor: meta.baseColor,
      baseIntensity: meta.baseIntensity,
      glowLevel: 0,
      glowScale: meta.glowScale,
      proximityWidth: meta.proximityWidth,
      isGlass: !isCenter,
    });

    if (!isCenter) {
      const fontSize = isOuter ? 24 : major ? 22 : 16;
      const labelColor = isMajorRing(cents) ? '#8DC4FC' : '#3d6888';
      const labelOffset = !major && !isOuter ? 0.14 : 0.18;
      addGlowLabel(scene, tunerRoot, `${cents}`, radius + labelOffset, 0, labelColor, fontSize, false);
    }
  }

  return rings;
}

async function loadRingsFromGlb(scene: Scene, tunerRoot: TransformNode): Promise<RingVisual[] | null> {
  try {
    const result = await SceneLoader.ImportMeshAsync('', RING_GLB_URL, '', scene);
    const ringMeshes = result.meshes.filter(
      (m): m is Mesh => m instanceof Mesh && m.name !== '__root__' && m.getTotalVertices() > 0,
    );
    if (ringMeshes.length === 0) return null;

    const ringsRoot = new TransformNode('rings-glb-root', scene);
    ringsRoot.parent = tunerRoot;
    // glTF Y-up import lays Blender toruses flat; rotate assembly to face camera (like procedural rings).
    ringsRoot.rotation.x = FACE_ROTATION;

    const flareByCents = new Map<number, Mesh>();
    const ringByCents = new Map<number, Mesh>();

    for (const mesh of ringMeshes) {
      const cents = parseRingCents(mesh.name);
      if (cents === null) continue;
      mesh.parent = ringsRoot;
      mesh.rotation.set(0, 0, 0);
      if (mesh.name.toLowerCase().includes('flare')) {
        flareByCents.set(cents, mesh);
      } else {
        ringByCents.set(cents, mesh);
      }
    }

    if (ringByCents.size === 0) {
      const candidates = ringMeshes.filter((m) => !m.name.toLowerCase().includes('flare'));
      candidates.sort((a, b) => meshRingRadius(b) - meshRingRadius(a));
      for (const cents of RING_CENTS) {
        if (ringByCents.has(cents)) continue;
        const target = ringRadiusForCents(cents);
        let best: Mesh | null = null;
        let bestDelta = Infinity;
        for (const mesh of candidates) {
          if (Array.from(ringByCents.values()).includes(mesh)) continue;
          const delta = Math.abs(meshRingRadius(mesh) - target);
          if (delta < bestDelta) {
            bestDelta = delta;
            best = mesh;
          }
        }
        if (best && bestDelta < 0.08) ringByCents.set(cents, best);
      }
    }

    if (ringByCents.size === 0) {
      ringsRoot.dispose();
      return null;
    }

    const rings: RingVisual[] = [];
    for (let i = 0; i < RING_CENTS.length; i++) {
      const cents = RING_CENTS[i];
      const mesh = ringByCents.get(cents);
      if (!mesh) continue;

      const meta = ringMetaForCents(cents, i);
      const mat = assignRingGlassMat(scene, cents, mesh);
      const flareMesh = flareByCents.get(cents);
      if (flareMesh) {
        const flareMat = makeRingGlassMat(scene, `ring-flare-${cents}`, {
          ...ringGlassPreset(cents),
          emissionStrength: 0.55,
          coatIntensity: 0.62,
        });
        flareMesh.material = flareMat;
      }

      rings.push({
        cents,
        mesh,
        mat,
        flareMesh,
        baseColor: meta.baseColor,
        baseIntensity: meta.baseIntensity,
        glowLevel: 0,
        glowScale: meta.glowScale,
        proximityWidth: meta.proximityWidth,
        isGlass: true,
      });
    }

    for (const mesh of result.meshes) {
      if (mesh instanceof Mesh && mesh.parent === null && mesh.name === '__root__') mesh.dispose();
    }

    return rings.length > 0 ? rings : null;
  } catch (err) {
    console.warn('Failed to load tuner rings GLB, using procedural fallback:', err);
    return null;
  }
}

function addTunerLabels(scene: Scene, tunerRoot: TransformNode): void {
  for (let i = 0; i < RING_CENTS.length; i++) {
    const cents = RING_CENTS[i];
    if (cents === 0) {
      addGlowLabel(scene, tunerRoot, '0', 0, 0, '#56FF7B', 48, true);
      continue;
    }
    const radius = ringRadiusForCents(cents);
    const isOuter = cents === CENTS_SPAN;
    const major = isMajorRing(cents);
    const fontSize = isOuter ? 24 : major ? 22 : 16;
    const labelColor = major ? '#8DC4FC' : '#3d6888';
    const labelOffset = !major && !isOuter ? 0.14 : 0.18;
    addGlowLabel(scene, tunerRoot, `${cents}`, radius + labelOffset, 0, labelColor, fontSize, false);
  }

  addGlowLabel(scene, tunerRoot, '♯', OUTER_RADIUS * 0.78, OUTER_RADIUS * 0.28, '#FF8A45', 40, true);
  addGlowLabel(scene, tunerRoot, '♭', -OUTER_RADIUS * 0.78, OUTER_RADIUS * 0.28, '#F98AD9', 40, true);
}

function buildSceneBackground(scene: Scene, parent: TransformNode): void {
  const tex = new DynamicTexture('tuner-bg-tex', { width: 512, height: 512 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(256, 230, 40, 256, 256, 280);
  g.addColorStop(0, '#08142A');
  g.addColorStop(0.55, '#040e1c');
  g.addColorStop(1, '#020816');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  tex.update();

  const bg = MeshBuilder.CreatePlane('tuner-bg', { size: 14, sideOrientation: Mesh.DOUBLESIDE }, scene);
  bg.parent = parent;
  bg.position.z = -0.2;
  orientToCamera(bg);
  const mat = new StandardMaterial('tuner-bg-mat', scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  bg.material = mat;
}

async function buildCircleTuner(scene: Scene, root: TransformNode): Promise<{
  tunerRoot: TransformNode;
  rings: RingVisual[];
}> {
  const tunerRoot = new TransformNode('tuner-root', scene);
  tunerRoot.parent = root;

  buildSceneBackground(scene, tunerRoot);
  buildVerticalDash(scene, tunerRoot);

  // Procedural rings respond reliably to reference PBR; GLB materials fight runtime overrides.
  const rings = buildProceduralRings(scene, tunerRoot);

  addTunerLabels(scene, tunerRoot);

  return { tunerRoot, rings };
}



export function setupTunerBloom(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  const pipeline = new DefaultRenderingPipeline('tuner-bloom', true, scene, [camera]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.44;
  pipeline.bloomWeight = 0.68;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.7;
  pipeline.fxaaEnabled = true;
  pipeline.glowLayerEnabled = false;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.exposure = 1.04;
  pipeline.imageProcessing.contrast = 1.08;
  return pipeline;
}



export async function createTunerVisual(scene: Scene): Promise<TunerVisual> {

  const root = new TransformNode('tuner-stage', scene);

  const { tunerRoot, rings } = await buildCircleTuner(scene, root);

  const { root: ballRoot, shellMat, coreMats, innerHotspotMat, ballGlow, ballGlowMat } = await loadBallVisual(scene, tunerRoot);



  const maxR = OUTER_RADIUS - BALL_RADIUS;

  let ballX = 0;

  let ballY = -maxR;

  let velX = 0;

  let velY = 0;



  let targetCents = 0;

  let displayCents = 0;

  let hasSignal = false;

  let hadSignal = false;

  let volumeLevel = 0;

  let time = 0;



  const GRAVITY = 14;

  const SPRING = 42;

  const DAMPING = 5.5;

  const IDLE_HORIZONTAL_DAMP = 18;

  const WALL_RESTITUTION = 0.82;

  const WALL_FRICTION = 0.06;

  const AIR_DRAG = 0.35;

  const SUBSTEP = 1 / 120;



  const _lit = new Color3();

  let squash = 0;



  scene.onBeforeRenderObservable.add(() => {

    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.033);

    time += dt;



    if (hadSignal && !hasSignal) velX = 0;

    hadSignal = hasSignal;



    if (hasSignal) {

      displayCents += (targetCents - displayCents) * 0.32;

    }



    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));

    const stepDt = dt / steps;



    for (let i = 0; i < steps; i++) {

      velY -= GRAVITY * stepDt;



      if (hasSignal) {

        const target = centsToTarget(displayCents);

        const dx = target.x - ballX;

        const dy = target.y - ballY;

        const pull = SPRING * (1 - Math.abs(displayCents) / CENTS_SPAN * 0.15);

        velX += dx * pull * stepDt;

        velY += dy * pull * stepDt;

        velX *= Math.exp(-DAMPING * stepDt);

        velY *= Math.exp(-DAMPING * stepDt);

      } else {

        velX *= Math.exp(-IDLE_HORIZONTAL_DAMP * stepDt);

        velY *= Math.exp(-AIR_DRAG * stepDt);

      }



      ballX += velX * stepDt;

      ballY += velY * stepDt;



      const hit = resolveCircleCollision(ballX, ballY, velX, velY, maxR, WALL_RESTITUTION, WALL_FRICTION);

      ballX = hit.x;

      ballY = hit.y;

      velX = hit.vx;

      velY = hit.vy;

      if (hit.hit) squash = 0.22;

    }



    squash = Math.max(0, squash - dt * 3.5);

    const squashAmt = 1 - squash;

    const stretchAmt = 1 + squash * 0.45;



    let scaleBoost = hasSignal ? 1 + Math.min(volumeLevel, 0.2) * 0.15 : 0.96;

    const locked = hasSignal && Math.abs(displayCents) < 5;

    if (locked) scaleBoost = 1.1 + Math.sin(time * 6) * 0.04;

    ballRoot.scaling.set(stretchAmt * scaleBoost, squashAmt * scaleBoost, stretchAmt * scaleBoost);

    ballRoot.position.set(ballX, ballY, 0.06);

    const ballColor = ballTuneColor(displayCents, hasSignal);

    const breathe = 0.85 + Math.sin(time * 1.1) * 0.15;

    applyBallColor(shellMat, coreMats, innerHotspotMat, ballColor, hasSignal, displayCents, breathe, volumeLevel);

    const inTune = hasSignal && Math.abs(displayCents) <= IN_TUNE_CENTS;
    const glowTint = inTune ? 1.35 : hasSignal ? 1.0 : 0.35;
    ballGlowMat.emissiveColor.copyFrom(ballColor.scale(glowTint));
    ballGlowMat.alpha = hasSignal ? 0.55 + volumeLevel * 0.25 + (inTune ? 0.15 : 0) : 0.18 * breathe;

    const ballDist = Math.hypot(ballX, ballY);
    const glowStrength = hasSignal ? 0.95 : 0.5 * breathe;

    for (const ring of rings) {
      let proximity: number;
      if (ring.cents === 0) {
        proximity = Math.max(0, 1 - ballDist / ring.proximityWidth);
      } else {
        const ringR = ringRadiusForCents(ring.cents);
        proximity = Math.max(0, 1 - Math.abs(ballDist - ringR) / ring.proximityWidth);
      }
      // Smoothstep — punchy peak when ball crosses a ring
      proximity = proximity * proximity * (3 - 2 * proximity);

      const isOuter = ring.cents === CENTS_SPAN;
      const breatheBoost = isOuter ? breathe : 1;
      const targetGlow = proximity * glowStrength * breatheBoost * ring.glowScale;
      ring.glowLevel += (targetGlow - ring.glowLevel) * Math.min(1, dt * 14);

      const t = ring.glowLevel;
      const ringTint = saturateColor(hasSignal ? ballColor : CYAN, hasSignal ? 1.28 : 1.12);
      const colorMix = Math.min(1, t * 1.05 + (hasSignal && t > 0.12 ? 0.4 : 0));
      Color3.LerpToRef(ring.baseColor, ringTint, colorMix, _lit);

      const coreIntensity =
        (ring.baseIntensity + t * 1.15 * ring.glowScale) * (isOuter ? breatheBoost : 1);

      if (ring.isGlass && ring.mat instanceof PBRMaterial) {
        const preset = ringGlassPreset(ring.cents);
        ring.mat.emissiveColor = Color3.Lerp(preset.emission, ringTint, colorMix * 0.96);
        ring.mat.emissiveIntensity = preset.emissionStrength + coreIntensity * (0.82 + t * 0.55);
        ring.mat.albedoColor = Color3.Lerp(preset.base, ringTint, colorMix * 0.82);
        ring.mat.alpha = 0.94 + t * 0.04;
        if (ring.flareMesh?.material instanceof PBRMaterial) {
          ring.flareMesh.material.emissiveColor = Color3.Lerp(preset.emission, ringTint, colorMix * 0.9);
          ring.flareMesh.material.emissiveIntensity = (preset.emissionStrength * 1.05 + t * 1.1) * breatheBoost;
        } else if (ring.flareMesh?.material instanceof StandardMaterial) {
          ring.flareMesh.material.emissiveColor = ringTint.scale(0.85 + t * 0.55);
        }
      } else if (ring.mat instanceof StandardMaterial) {
        ring.mat.emissiveColor.copyFrom(ringTint.scale(0.75 + coreIntensity * 0.55));
        if (ring.glowMat && ring.glow) {
          ring.glowMat.emissiveColor.copyFrom(ringTint.scale((0.28 + t * 0.65) * ring.glowScale));
          ring.glowMat.alpha = (0.02 + t * 0.12) * (isOuter ? breatheBoost : 1) * ring.glowScale;
          ring.glow.scaling.setAll(1 + t * 0.05 * ring.glowScale);
        }
      }
    }

  });



  return {

    updateFromCents(cents: number | null, volume: number) {

      volumeLevel = Math.min(volume * 6, 1);

      if (cents === null) {

        hasSignal = false;

        return;

      }

      hasSignal = true;

      targetCents = Math.max(-CENTS_SPAN, Math.min(CENTS_SPAN, cents));

    },



    dispose() {

      root.dispose();

    },

  };

}



export function setupTunerLighting(scene: Scene): void {
  scene.clearColor = new Color4(0.008, 0.031, 0.086, 0);
  scene.ambientColor = new Color3(0.06, 0.08, 0.14);

  if (!scene.environmentTexture) {
    scene.createDefaultEnvironment({
      createSkybox: false,
      createGround: false,
      enableGroundShadow: false,
    });
    scene.environmentIntensity = 0.48;
  }

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0.2), scene);
  hemi.intensity = 0.22;
  hemi.diffuse = new Color3(0.35, 0.55, 0.85);
  hemi.groundColor = new Color3(0.01, 0.015, 0.03);

  const key = new DirectionalLight('key', new Vector3(-0.2, 0.55, -1), scene);
  key.intensity = 0.95;
  key.diffuse = new Color3(0.83, 0.945, 1);

  const rim = new DirectionalLight('rim', new Vector3(0.35, 0.15, 0.85), scene);
  rim.intensity = 0.35;
  rim.diffuse = new Color3(0.2, 0.49, 1);

  const fill = new DirectionalLight('fill', new Vector3(0.6, -0.2, 0.5), scene);
  fill.intensity = 0.18;
  fill.diffuse = new Color3(0.2, 0.49, 1);

  const topFlare = new DirectionalLight('top-flare', new Vector3(0.05, 0.92, -0.35), scene);
  topFlare.intensity = 1.15;
  topFlare.diffuse = new Color3(0.85, 0.95, 1);
}


