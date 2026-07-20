import {

  Color3,

  Color4,

  DirectionalLight,

  DynamicTexture,

  HemisphericLight,

  Mesh,

  MeshBuilder,

  PBRMaterial,

  Scene,

  StandardMaterial,

  TransformNode,

  Vector3,

} from '@babylonjs/core';

import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';

import type { Camera } from '@babylonjs/core/Cameras/camera';



export type TunerVisual = {

  updateFromCents: (cents: number | null, volume: number) => void;

  dispose: () => void;

};



const CENTS_SPAN = 50;

const OUTER_RADIUS = 2.35;

const BALL_RADIUS = 0.14;

const RING_STEP = 5;
const RING_CENTS: number[] = [];
for (let c = CENTS_SPAN; c >= 0; c -= RING_STEP) {
  RING_CENTS.push(c);
}

function isMajorRing(cents: number): boolean {
  return cents % 10 === 0;
}



const CYAN = new Color3(0.22, 0.78, 1);

const CYAN_DIM = new Color3(0.12, 0.42, 0.72);

const GREEN = new Color3(0.18, 1, 0.55);

const IN_TUNE_CENTS = 5;
const WARM_SHARP = new Color3(1, 0.42, 0.1);
const WARM_FLAT = new Color3(1, 0.68, 0.15);
const IDLE_CYAN = new Color3(0.28, 0.58, 0.98);



type RingVisual = {

  cents: number;

  mat: StandardMaterial;

  glowMat: StandardMaterial;

  glow: Mesh;

  baseColor: Color3;

  baseIntensity: number;

  glowLevel: number;

  glowScale: number;

  proximityWidth: number;

};



function makeNeonMat(scene: Scene, name: string, color: Color3, intensity = 1): StandardMaterial {

  const mat = new StandardMaterial(name, scene);

  mat.diffuseColor = Color3.Black();

  mat.specularColor = Color3.Black();

  mat.emissiveColor = color.scale(intensity);

  mat.disableLighting = true;

  return mat;

}



function makeGlowHaloMat(scene: Scene, name: string, color: Color3): StandardMaterial {

  const mat = new StandardMaterial(name, scene);

  mat.diffuseColor = Color3.Black();

  mat.specularColor = Color3.Black();

  mat.emissiveColor = color.scale(0.65);

  mat.alpha = 0.1;

  mat.disableLighting = true;

  mat.backFaceCulling = false;

  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;

  return mat;

}



function makeBallMat(scene: Scene): PBRMaterial {
  const mat = new PBRMaterial('ball-glass', scene);
  mat.metallic = 0;
  mat.roughness = 0.025;
  mat.alpha = 0.74;
  mat.albedoColor = IDLE_CYAN.scale(0.22);
  mat.emissiveColor = IDLE_CYAN.scale(0.38);
  mat.emissiveIntensity = 1.15;
  mat.environmentIntensity = 1.5;
  mat.directIntensity = 0.9;
  mat.specularIntensity = 1.25;
  mat.clearCoat.isEnabled = true;
  mat.clearCoat.intensity = 1;
  mat.clearCoat.roughness = 0.012;
  mat.clearCoat.tintColor = new Color3(1, 1, 1);
  mat.backFaceCulling = false;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.indexOfRefraction = 1.52;
  return mat;
}

function makeBallCoreMat(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial('ball-core', scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = IDLE_CYAN.scale(0.72);
  mat.alpha = 0.82;
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
  mat: PBRMaterial,
  coreMat: StandardMaterial,
  color: Color3,
  hasSignal: boolean,
  cents: number,
  breathe: number,
): void {
  const inTune = hasSignal && Math.abs(cents) <= IN_TUNE_CENTS;
  mat.albedoColor = color.scale(hasSignal ? 0.3 : 0.22);
  mat.emissiveColor = color.scale(hasSignal ? 0.45 : 0.4);
  mat.emissiveIntensity = (hasSignal ? 0.9 : 1.2) * breathe;
  mat.roughness = hasSignal ? 0.035 : 0.02;
  mat.alpha = inTune ? 0.66 : 0.74;
  mat.clearCoat.intensity = inTune ? 1.2 : 1;
  mat.clearCoat.roughness = 0.01;
  coreMat.emissiveColor = color.scale(hasSignal ? 0.9 : 0.75);
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

    ctx.shadowBlur = 18;

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

  dash.color = new Color3(0.18, 0.55, 0.85);

  dash.alpha = 0.35;

  dash.parent = parent;

}



function buildCircleTuner(scene: Scene, root: TransformNode): {

  tunerRoot: TransformNode;

  ball: Mesh;

  ballMat: PBRMaterial;

  ballCoreMat: StandardMaterial;

  ballGlow: Mesh;

  ballGlowMat: StandardMaterial;

  rings: RingVisual[];

} {

  const tunerRoot = new TransformNode('tuner-root', scene);

  tunerRoot.parent = root;



  buildVerticalDash(scene, tunerRoot);



  const rings: RingVisual[] = [];

  for (let i = 0; i < RING_CENTS.length; i++) {
    const cents = RING_CENTS[i];
    const radius = ringRadiusForCents(cents);
    const isOuter = cents === CENTS_SPAN;
    const isCenter = cents === 0;
    const isMajor = isMajorRing(cents);
    const isMinor = !isCenter && !isMajor;

    const dimFactor = 0.45 + (i / (RING_CENTS.length - 1)) * 0.55;
    const baseIntensity = isOuter ? 1.55 : isMajor ? 0.95 : 0.38;
    const baseColor = Color3.Lerp(CYAN_DIM, CYAN, dimFactor);
    const glowScale = isOuter ? 1 : isMajor ? 1 : 0.35;
    const proximityWidth = isCenter ? 0.22 : isMinor ? 0.1 : 0.18;

    const mat = makeNeonMat(scene, `ring-mat-${cents}`, baseColor, baseIntensity);
    const glowMat = makeGlowHaloMat(scene, `ring-glow-mat-${cents}`, baseColor);
    if (isMinor) {
      glowMat.alpha = 0.04;
      glowMat.emissiveColor = baseColor.scale(0.3);
    }

    let glow: Mesh;

    if (isCenter) {
      const dot = MeshBuilder.CreateDisc('center-dot', { radius: 0.055, tessellation: 32 }, scene);
      dot.parent = tunerRoot;
      orientToCamera(dot);
      dot.material = mat;

      const dotGlow = MeshBuilder.CreateDisc('center-glow', { radius: 0.14, tessellation: 32 }, scene);
      dotGlow.parent = tunerRoot;
      orientToCamera(dotGlow);
      dotGlow.material = glowMat;
      glow = dotGlow;

      addGlowLabel(scene, tunerRoot, '0', 0, 0, '#3dff9a', 48, true);
    } else {
      const tube = isOuter ? 0.052 : isMajor ? 0.022 : 0.011;

      const ring = MeshBuilder.CreateTorus(
        `ring-${cents}`,
        { diameter: radius * 2, thickness: tube, tessellation: 64 },
        scene,
      );
      ring.parent = tunerRoot;
      orientToCamera(ring);
      ring.material = mat;

      const glowTube = tube * (isOuter ? 3.8 : isMajor ? 2.6 : 1.6);
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
      mat,
      glowMat,
      glow,
      baseColor,
      baseIntensity,
      glowLevel: 0,
      glowScale,
      proximityWidth,
    });

    if (!isCenter) {
      const fontSize = isOuter ? 24 : isMajor ? 22 : 16;
      const labelColor = isMajor ? '#6ecfff' : '#3d6888';
      const labelOffset = isMinor ? 0.14 : 0.18;
      addGlowLabel(scene, tunerRoot, `${cents}`, radius + labelOffset, 0, labelColor, fontSize, isMajor);
    }
  }



  addGlowLabel(scene, tunerRoot, '♯', OUTER_RADIUS * 0.78, OUTER_RADIUS * 0.28, '#ffb56a', 40, true);

  addGlowLabel(scene, tunerRoot, '♭', -OUTER_RADIUS * 0.78, OUTER_RADIUS * 0.28, '#ff8ad0', 40, true);



  const ballMat = makeBallMat(scene);

  const ball = MeshBuilder.CreateSphere('tuner-ball', { diameter: BALL_RADIUS * 2, segments: 32 }, scene);

  ball.parent = tunerRoot;

  ball.material = ballMat;

  const ballCoreMat = makeBallCoreMat(scene);

  const ballCore = MeshBuilder.CreateSphere('ball-core', { diameter: BALL_RADIUS * 1.38, segments: 24 }, scene);

  ballCore.parent = ball;

  ballCore.position.set(BALL_RADIUS * 0.24, BALL_RADIUS * 0.3, -BALL_RADIUS * 0.2);

  ballCore.material = ballCoreMat;



  const ballGlowMat = makeGlowHaloMat(scene, 'ball-glow-mat', IDLE_CYAN);

  ballGlowMat.alpha = 0.32;

  const ballGlow = MeshBuilder.CreateSphere('ball-glow', { diameter: BALL_RADIUS * 4.2, segments: 24 }, scene);

  ballGlow.parent = ball;

  ballGlow.material = ballGlowMat;



  return { tunerRoot, ball, ballMat, ballCoreMat, ballGlow, ballGlowMat, rings };

}



export function setupTunerBloom(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  const pipeline = new DefaultRenderingPipeline('tuner-bloom', true, scene, [camera]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.06;
  pipeline.bloomWeight = 0.72;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.75;
  pipeline.fxaaEnabled = true;
  pipeline.glowLayerEnabled = false;
  return pipeline;
}



export async function createTunerVisual(scene: Scene): Promise<TunerVisual> {

  const root = new TransformNode('tuner-stage', scene);

  const { ball, ballMat, ballCoreMat, ballGlow, ballGlowMat, rings } = buildCircleTuner(scene, root);



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

    ball.scaling.set(stretchAmt * scaleBoost, squashAmt * scaleBoost, stretchAmt * scaleBoost);



    ball.position.set(ballX, ballY, 0.06);



    const ballColor = ballTuneColor(displayCents, hasSignal);

    const breathe = 0.85 + Math.sin(time * 1.1) * 0.15;

    applyBallColor(ballMat, ballCoreMat, ballColor, hasSignal, displayCents, breathe);

    ballCoreMat.alpha = 0.72 + volumeLevel * 0.18 + (hasSignal ? 0 : breathe * 0.08);

    ballGlowMat.emissiveColor.copyFrom(ballColor.scale(hasSignal ? 0.75 : 0.55));
    ballGlowMat.alpha = (0.22 + volumeLevel * 0.3) * (hasSignal ? 1 : breathe);

    const ballDist = Math.hypot(ballX, ballY);
    const glowStrength = hasSignal ? 1 : 0.65 * breathe;

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
      Color3.LerpToRef(ring.baseColor, ringTint, t * 0.65, _lit);

      const coreIntensity = (ring.baseIntensity + t * 2.4 * ring.glowScale) * (isOuter ? breatheBoost : 1);
      ring.mat.emissiveColor.copyFrom(_lit.scale(coreIntensity));

      ring.glowMat.emissiveColor.copyFrom(_lit.scale((0.45 + t * 1.8) * ring.glowScale));
      ring.glowMat.alpha = (0.08 + t * 0.48) * (isOuter ? breatheBoost : 1) * ring.glowScale;
      ring.glow.scaling.setAll(1 + t * 0.12 * ring.glowScale);
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
  scene.clearColor = new Color4(0.02, 0.04, 0.08, 0);
  scene.ambientColor = new Color3(0.08, 0.1, 0.18);

  if (!scene.environmentTexture) {
    scene.createDefaultEnvironment({
      createSkybox: false,
      createGround: false,
      enableGroundShadow: false,
    });
    scene.environmentIntensity = 0.55;
  }

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0.2), scene);
  hemi.intensity = 0.42;
  hemi.diffuse = new Color3(0.55, 0.75, 1);
  hemi.groundColor = new Color3(0.02, 0.03, 0.06);

  const key = new DirectionalLight('key', new Vector3(-0.25, 0.45, -1), scene);
  key.intensity = 1.05;
  key.diffuse = new Color3(0.9, 0.95, 1);

  const rim = new DirectionalLight('rim', new Vector3(0.35, 0.15, 0.85), scene);
  rim.intensity = 0.35;
  rim.diffuse = new Color3(0.55, 0.7, 1);

  const fill = new DirectionalLight('fill', new Vector3(0.6, -0.2, 0.5), scene);
  fill.intensity = 0.18;
  fill.diffuse = new Color3(0.7, 0.5, 1);
}


