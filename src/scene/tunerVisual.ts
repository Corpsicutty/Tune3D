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
const CYAN_DIM = new Color3(0.12, 0.38, 0.62);
const GREEN = new Color3(0.337, 1.0, 0.482); // #56FF7B
const IN_TUNE_CENTS = 5;
const WARM_SHARP = new Color3(1.0, 0.541, 0.271); // #FF8A45
const WARM_FLAT = new Color3(0.976, 0.541, 0.851); // #F98AD9
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
  mat.emissiveColor = color.scale(0.35);
  mat.alpha = 0.035;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  return mat;
}



function makeBallMat(scene: Scene): PBRMaterial {
  const mat = new PBRMaterial('ball-glass', scene);
  mat.metallic = 0;
  mat.roughness = 0.05;
  mat.alpha = 1;
  mat.albedoColor = IDLE_CYAN;
  mat.emissiveColor = new Color3(0.031, 0.49, 1.0);
  mat.emissiveIntensity = 0.35;
  mat.environmentIntensity = 0.9;
  mat.directIntensity = 1.2;
  mat.specularIntensity = 0.7;
  mat.clearCoat.isEnabled = true;
  mat.clearCoat.intensity = 0.85;
  mat.clearCoat.roughness = 0.012;
  mat.clearCoat.tintColor = ORB_HIGHLIGHT;
  mat.backFaceCulling = false;
  mat.indexOfRefraction = 1.46;
  return mat;
}

function makeBallCoreMat(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('ball-core', scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = new Color3(0.03, 0.35, 1.0);
  mat.alpha = 0.55;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  return mat;
}



function ballTuneColor(cents: number, hasSignal: boolean): Color3 {
  if (!hasSignal) return IDLE_CYAN;
  const abs = Math.abs(cents);
  if (abs <= IN_TUNE_CENTS) return GREEN;
  const warmEnd = cents >= 0 ? WARM_SHARP : WARM_FLAT;
  const blend = Math.min((abs - IN_TUNE_CENTS) / (CENTS_SPAN - IN_TUNE_CENTS), 1);
  return Color3.Lerp(GREEN, warmEnd, blend);
}


function applyBallColor(
  shellMat: PBRMaterial | null,
  coreMats: Material[],
  color: Color3,
  hasSignal: boolean,
  cents: number,
  breathe: number,
  volumeLevel: number,
): void {
  const inTune = hasSignal && Math.abs(cents) <= IN_TUNE_CENTS;
  if (shellMat) {
    shellMat.albedoColor = Color3.Lerp(IDLE_CYAN, color.scale(0.35), hasSignal ? 0.45 : 0);
    shellMat.emissiveColor = Color3.Lerp(new Color3(0.031, 0.49, 1.0), color, hasSignal ? 0.35 : 0.1);
    shellMat.emissiveIntensity = (hasSignal ? 0.1 : 0.14) * breathe;
    shellMat.roughness = hasSignal ? 0.045 : 0.055;
    shellMat.alpha = 1;
    shellMat.metallic = 0;
    shellMat.indexOfRefraction = 1.46;
    if (!shellMat.clearCoat.isEnabled) shellMat.clearCoat.isEnabled = true;
    shellMat.clearCoat.intensity = inTune ? 0.88 : 0.78;
    shellMat.clearCoat.roughness = 0.016;
    shellMat.clearCoat.tintColor = inTune ? GREEN : ORB_HIGHLIGHT;
  }
  const coreAlpha = 0.42 + volumeLevel * 0.12 + (hasSignal ? 0 : breathe * 0.04);
  const coreTint = color.scale(hasSignal ? 0.55 : 0.45);
  for (const coreMat of coreMats) {
    if (coreMat instanceof PBRMaterial) {
      coreMat.emissiveColor = coreTint;
      coreMat.emissiveIntensity = (hasSignal ? 0.18 : 0.22) * breathe;
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

  const ballCoreMat = makeBallCoreMat(scene);
  const ballCore = MeshBuilder.CreateSphere('ball-core', { diameter: BALL_RADIUS * 1.38, segments: 24 }, scene);
  ballCore.parent = root;
  ballCore.position.set(BALL_RADIUS * 0.24, BALL_RADIUS * 0.3, -BALL_RADIUS * 0.2);
  ballCore.material = ballCoreMat;

  const ballGlowMat = makeGlowHaloMat(scene, 'ball-glow-mat', IDLE_CYAN);
  ballGlowMat.alpha = 0.08;
  const ballGlow = MeshBuilder.CreateSphere('ball-glow', { diameter: BALL_RADIUS * 2.8, segments: 24 }, scene);
  ballGlow.parent = root;
  ballGlow.material = ballGlowMat;

  return { root, shellMat: ballMat, coreMats: [ballCoreMat], ballGlow, ballGlowMat };
}

async function loadBallVisual(scene: Scene, parent: TransformNode): Promise<BallVisual> {
  const ballGlowMat = makeGlowHaloMat(scene, 'ball-glow-mat', IDLE_CYAN);
  ballGlowMat.alpha = 0.1;

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

    const coreMats: Material[] = [];
    for (let i = 0; i < inclusionMeshes.length; i++) {
      inclusionMeshes[i].name = `tuner-ball-inclusion-${i}`;
      const coreMat = makeBallCoreMat(scene);
      inclusionMeshes[i].material = coreMat;
      coreMats.push(coreMat);
    }

    const ballGlow = MeshBuilder.CreateSphere('ball-glow', { diameter: BALL_RADIUS * 2.8, segments: 24 }, scene);
    ballGlow.parent = root;
    ballGlow.material = ballGlowMat;

    return { root, shellMat, coreMats, ballGlow, ballGlowMat };
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
    proximityWidth: isCenter ? 0.22 : isMinor ? 0.1 : 0.18,
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
      emissionStrength: 2.2,
      roughness: 0.1,
      coatIntensity: 0.55,
      specularIntensity: 0.55,
    };
  }
  if (major) {
    return {
      base: RING_INNER_BASE,
      emission: RING_INNER_EMISSION,
      emissionStrength: 1.4,
      roughness: 0.12,
      coatIntensity: 0.42,
      specularIntensity: 0.48,
    };
  }
  return {
    base: RING_INNER_BASE.scale(0.85),
    emission: RING_INNER_EMISSION.scale(0.75),
    emissionStrength: 0.55,
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
      centerMat.emissiveColor = GREEN.scale(1.2);
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
  pipeline.bloomThreshold = 0.45;
  pipeline.bloomWeight = 0.65;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.7;
  pipeline.fxaaEnabled = true;
  pipeline.glowLayerEnabled = false;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.exposure = 1.0;
  pipeline.imageProcessing.contrast = 1.05;
  return pipeline;
}



export async function createTunerVisual(scene: Scene): Promise<TunerVisual> {

  const root = new TransformNode('tuner-stage', scene);

  const { tunerRoot, rings } = await buildCircleTuner(scene, root);

  const { root: ballRoot, shellMat, coreMats, ballGlow, ballGlowMat } = await loadBallVisual(scene, tunerRoot);



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

    applyBallColor(shellMat, coreMats, ballColor, hasSignal, displayCents, breathe, volumeLevel);

    ballGlowMat.emissiveColor.copyFrom(ballColor.scale(hasSignal ? 0.35 : 0.22));
    ballGlowMat.alpha = (0.06 + volumeLevel * 0.1) * (hasSignal ? 1 : breathe);

    const ballDist = Math.hypot(ballX, ballY);
    const glowStrength = hasSignal ? 0.75 : 0.45 * breathe;

    for (const ring of rings) {
      let proximity: number;
      if (ring.cents === 0) {
        proximity = Math.max(0, 1 - ballDist / ring.proximityWidth);
      } else {
        const ringR = ringRadiusForCents(ring.cents);
        proximity = Math.max(0, 1 - Math.abs(ballDist - ringR) / ring.proximityWidth);
      }

      const isOuter = ring.cents === CENTS_SPAN;
      const breatheBoost = isOuter ? breathe : 1;
      const targetGlow = proximity * glowStrength * breatheBoost * ring.glowScale;
      ring.glowLevel += (targetGlow - ring.glowLevel) * Math.min(1, dt * 10);

      const t = ring.glowLevel;
      const ringTint = hasSignal ? ballColor : CYAN;
      Color3.LerpToRef(ring.baseColor, ringTint, t * 0.4, _lit);

      const coreIntensity =
        (ring.baseIntensity + t * 0.65 * ring.glowScale) * (isOuter ? breatheBoost : 1);

      if (ring.isGlass && ring.mat instanceof PBRMaterial) {
        const preset = ringGlassPreset(ring.cents);
        ring.mat.emissiveColor = Color3.Lerp(preset.emission, _lit, t * 0.35);
        ring.mat.emissiveIntensity = preset.emissionStrength + coreIntensity * (0.55 + t * 0.75);
        ring.mat.albedoColor = Color3.Lerp(preset.base, _lit, t * 0.18);
        ring.mat.alpha = 0.92 + t * 0.06;
        if (ring.flareMesh?.material instanceof PBRMaterial) {
          ring.flareMesh.material.emissiveIntensity = (0.55 + t * 0.85) * breatheBoost;
        } else if (ring.flareMesh?.material instanceof StandardMaterial) {
          ring.flareMesh.material.emissiveColor = _lit.scale(0.65);
        }
      } else if (ring.mat instanceof StandardMaterial) {
        ring.mat.emissiveColor.copyFrom(_lit.scale(0.45 + coreIntensity * 0.35));
        if (ring.glowMat && ring.glow) {
          ring.glowMat.emissiveColor.copyFrom(_lit.scale((0.15 + t * 0.35) * ring.glowScale));
          ring.glowMat.alpha = (0.025 + t * 0.08) * (isOuter ? breatheBoost : 1) * ring.glowScale;
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


