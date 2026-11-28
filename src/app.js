import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { motion, AnimatePresence } from 'framer-motion';
import { WATER_LEVEL, SUN_DIRECTION, clamp, createRng, loadReal3DPlantGeometries } from './assets.js';
import { createSkyDome, createDesertTerrain, createOasisWater } from './world.js';
import { createPalmGrove } from './palms.js';
import { createOasisFoliage } from './foliage.js';

const CAMERA_PRESETS = {
  reference: { label: '1:1 Reference', pos: [0, 3.85, 18.6], target: [0, 0.65, -4.5] },
  lagoon:    { label: 'Lagoon Skim',   pos: [-2.2, 1.5, 12.2], target: [1.5, 0.9, -12.0] },
  canopy:    { label: 'Canopy Up',     pos: [-3.5, 2.2, 14.2], target: [-6.8, 6.2, 9.5] },
  dunes:     { label: 'Dune Crest',    pos: [0.0, 9.2, 25.0], target: [0.0, 1.2, -16.0] },
};

function createOasisAudioEngine() {
  let ctx = null, masterGain = null, windGain = null, windFilter = null, frondGain = null, frondFilter = null, waterGain = null, delayNode = null;
  let enabled = false, initialized = false, lastDropMs = 0;
  const PENTATONIC = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];

  function makeNoiseBuffer(audioCtx, pink) {
    const len = audioCtx.sampleRate * 3;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;
      } else {
        data[i] = white * 0.18;
      }
    }
    return buf;
  }

  function init() {
    if (initialized) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.0;
      masterGain.connect(ctx.destination);

      const pinkBuf = makeNoiseBuffer(ctx, true);
      const whiteBuf = makeNoiseBuffer(ctx, false);

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = pinkBuf; windSrc.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 340; windFilter.Q.value = 0.85;
      windGain = ctx.createGain(); windGain.gain.value = 0.24;
      const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.13;
      const windLfoGain = ctx.createGain(); windLfoGain.gain.value = 95;
      windLfo.connect(windLfoGain); windLfoGain.connect(windFilter.frequency);
      windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(masterGain);
      windSrc.start(); windLfo.start();

      const frondSrc = ctx.createBufferSource();
      frondSrc.buffer = whiteBuf; frondSrc.loop = true;
      frondFilter = ctx.createBiquadFilter(); frondFilter.type = 'bandpass'; frondFilter.frequency.value = 1650; frondFilter.Q.value = 2.1;
      frondGain = ctx.createGain(); frondGain.gain.value = 0.045;
      const frondLfo = ctx.createOscillator(); frondLfo.frequency.value = 0.26;
      const frondLfoGain = ctx.createGain(); frondLfoGain.gain.value = 0.022;
      frondLfo.connect(frondLfoGain); frondLfoGain.connect(frondGain.gain);
      frondSrc.connect(frondFilter); frondFilter.connect(frondGain); frondGain.connect(masterGain);
      frondSrc.start(); frondLfo.start();

      const waterSrc = ctx.createBufferSource();
      waterSrc.buffer = pinkBuf; waterSrc.loop = true;
      const waterFilter = ctx.createBiquadFilter(); waterFilter.type = 'lowpass'; waterFilter.frequency.value = 230;
      waterGain = ctx.createGain(); waterGain.gain.value = 0.18;
      const waterLfo = ctx.createOscillator(); waterLfo.frequency.value = 0.22;
      const waterLfoGain = ctx.createGain(); waterLfoGain.gain.value = 0.06;
      waterLfo.connect(waterLfoGain); waterLfoGain.connect(waterGain.gain);
      waterSrc.connect(waterFilter); waterFilter.connect(waterGain); waterGain.connect(masterGain);
      waterSrc.start(); waterLfo.start();

      delayNode = ctx.createDelay(0.6); delayNode.delayTime.value = 0.28;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const delayLp = ctx.createBiquadFilter(); delayLp.type = 'lowpass'; delayLp.frequency.value = 1400;
      delayNode.connect(delayLp); delayLp.connect(fb); fb.connect(delayNode); delayLp.connect(masterGain);

      initialized = true;
      return true;
    } catch (e) { return false; }
  }

  return {
    setEnabled(on) {
      enabled = !!on;
      if (enabled && !init()) return false;
      if (!ctx || !masterGain) return false;
      try {
        if (enabled && ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setTargetAtTime(enabled ? 0.55 : 0.0, now, 0.25);
      } catch (e) {}
      return enabled;
    },
    isEnabled() { return enabled; },
    updateScrub(velocity) {
      if (!enabled || !ctx || !windFilter || !frondGain) return;
      const now = ctx.currentTime;
      const v = Math.min(1.0, Math.max(0.0, velocity));
      windFilter.frequency.setTargetAtTime(340 + v * 320, now, 0.14);
      frondGain.gain.setTargetAtTime(0.045 + v * 0.095, now, 0.12);
    },
    triggerWaterDrop(panX, intensity) {
      if (!enabled || !ctx || !masterGain) return;
      const nowMs = performance.now();
      if (nowMs - lastDropMs < 130) return;
      lastDropMs = nowMs;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note * 0.92, now);
        osc.frequency.exponentialRampToValueAtTime(note, now + 0.055);
        const amp = Math.min(0.11, 0.035 + intensity * 0.065);
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(amp, now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
        osc.connect(env);
        if (typeof ctx.createStereoPanner === 'function') {
          const panner = ctx.createStereoPanner();
          panner.pan.value = Math.max(-0.85, Math.min(0.85, panX));
          env.connect(panner); panner.connect(masterGain);
          if (delayNode) panner.connect(delayNode);
        } else {
          env.connect(masterGain);
          if (delayNode) env.connect(delayNode);
        }
        osc.start(now); osc.stop(now + 0.7);
      } catch (e) {}
    },
    dispose() {
      try { if (ctx) ctx.close(); } catch (e) {}
      ctx = null; initialized = false; enabled = false;
    },
  };
}

function OasisApp() {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const windRef = useRef(null);
  const waterMatRef = useRef(null);
  const rendererRef = useRef(null);
  const audioRef = useRef(null);
  const goldenScrubRef = useRef(0.5);
  const sunLightRef = useRef(null);
  const postMatRef = useRef(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [activePreset, setActivePreset] = useState('reference');
  const [windAmp, setWindAmp] = useState(0.16);
  const [reflectStrength, setReflectStrength] = useState(0.95);
  const [exposure, setExposure] = useState(1.06);
  const [cameraGoal, setCameraGoal] = useState(null);
  const [soundOn, setSoundOn] = useState(false);
  const [goldenScrub, setGoldenScrub] = useState(0.5);

  useEffect(() => {
    let disposed = false;
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 1344;
    const height = container.clientHeight || 768;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#e8c3a8', 40, 165);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.2, 360);
    camera.position.set(0, 3.85, 18.6);
    camera.lookAt(0, 0.65, -4.5);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.65, -4.5);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 8;
    controls.maxDistance = 42;
    controls.update();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight('#b698c6', '#724934', 0.56));

    const sunLight = new THREE.DirectionalLight('#ffc97a', 4.25);
    sunLight.position.copy(SUN_DIRECTION).multiplyScalar(68);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.radius = 6.0;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.04;
    Object.assign(sunLight.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 40, far: 95 });
    scene.add(sunLight);

    const bounceLight = new THREE.DirectionalLight('#f4cf96', 0.72);
    bounceLight.position.set(14, 6, 22);
    scene.add(bounceLight);

    const sky = createSkyDome(SUN_DIRECTION);
    scene.add(sky);
    scene.add(createDesertTerrain(SUN_DIRECTION));
    const palms = createPalmGrove(SUN_DIRECTION);
    scene.add(palms.group);
    windRef.current = palms.windUniforms;

    loadReal3DPlantGeometries().then((realGeos) => {
      if (disposed) return;
      const foliage = createOasisFoliage(realGeos);
      scene.add(foliage.group);
    });

    const water = createOasisWater(SUN_DIRECTION);

    const moteCount = 240;
    const motePos = new Float32Array(moteCount * 3);
    const moteSeed = new Float32Array(moteCount);
    const moteSize = new Float32Array(moteCount);
    const moteRng = createRng(9931);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3 + 0] = -12.0 + moteRng() * 24.0;
      motePos[i * 3 + 1] = 0.35 + moteRng() * 3.1;
      motePos[i * 3 + 2] = 4.5 + moteRng() * 12.5;
      moteSeed[i] = moteRng() * 6.2831;
      moteSize[i] = 0.65 + moteRng() * 1.35;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
    moteGeo.setAttribute('aSize', new THREE.BufferAttribute(moteSize, 1));
    const moteMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0.0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
      vertexShader: /* glsl */ `
        in float aSeed; in float aSize;
        uniform float uTime; uniform float uPixelRatio;
        out float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.35 + aSeed) * 0.45;
          p.y += cos(uTime * 0.28 + aSeed * 1.7) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = max(-mv.z, 1.0);
          gl_PointSize = clamp((72.0 * aSize / dist) * uPixelRatio, 2.5, 14.0);
          float shimmer = 0.55 + 0.45 * sin(uTime * 1.1 + aSeed * 2.3);
          float sunShaftBoost = 0.65 + 0.65 * smoothstep(8.0, -7.0, p.x);
          vAlpha = shimmer * sunShaftBoost * smoothstep(28.0, 3.5, dist);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        in float vAlpha; out vec4 fragColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float core = smoothstep(0.26, 0.0, d);
          float halo = pow(1.0 - d * 2.0, 2.0) * 0.65;
          fragColor = vec4(1.0, 0.80, 0.52, (core * 0.15 + halo * 0.65) * vAlpha * 0.12);
        }
      `,
    });
    scene.add(new THREE.Points(moteGeo, moteMat));

    const mistMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0.0 } },
      vertexShader: /* glsl */ `out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform float uTime; in vec2 vUv; out vec4 fragColor;
        float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(mHash(i), mHash(i + vec2(1,0)), u.x), mix(mHash(i + vec2(0,1)), mHash(i + vec2(1,1)), u.x), u.y);
        }
        void main() {
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x) * smoothstep(0.0, 0.42, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float n = mNoise(vUv * vec2(3.6, 2.0) + vec2(uTime * 0.04, 0.0)) * 0.65 + mNoise(vUv * vec2(7.2, 4.0) - vec2(uTime * 0.03, 0.0)) * 0.35;
          float alpha = edge * smoothstep(0.45, 0.88, n) * 0.018;
          fragColor = vec4(1.0, 0.82, 0.64, alpha) * 0.32;
        }
      `,
    });
    const mistGeo = new THREE.PlaneGeometry(18, 3.6);
    [{ x: -3.5, y: 1.0, z: -5.5, ry: 0.12 }, { x: 2.0, y: 1.2, z: -7.8, ry: -0.08 }, { x: -1.0, y: 0.75, z: -1.5, ry: 0.04 }].forEach((m) => {
      const mesh = new THREE.Mesh(mistGeo, mistMat);
      mesh.position.set(m.x, m.y, m.z); mesh.rotation.y = m.ry; scene.add(mesh);
    });

    const postRT = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType });
    postRT.depthTexture = new THREE.DepthTexture(width, height);
    postRT.depthTexture.type = THREE.UnsignedIntType;
    const postScene = new THREE.Scene();
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse:      { value: postRT.texture },
        tDepth:        { value: postRT.depthTexture },
        uSunScreenPos: { value: new THREE.Vector2(0.07, 0.86) },
        uTexelSize:    { value: new THREE.Vector2(1.0 / width, 1.0 / height) },
        uGodrayWeight: { value: 0.52 },
        uBloomWeight:  { value: 0.22 },
      },
      vertexShader: /* glsl */ `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uSunScreenPos;
        uniform vec2 uTexelSize;
        uniform float uGodrayWeight;
        uniform float uBloomWeight;
        in vec2 vUv;
        out vec4 fragColor;

        float getLinearDepth(vec2 uv) {
          float z = texture(tDepth, clamp(uv, vec2(0.002), vec2(0.998))).r;
          float n = 0.2, f = 360.0;
          return (2.0 * n * f) / (f + n - (z * 2.0 - 1.0) * (f - n));
        }

        void main() {
          vec3 baseCol = texture(tDiffuse, vUv).rgb;
          float centerDepth = getLinearDepth(vUv);

          // A. 8-Tap Depth-Based SSAO
          if (centerDepth < 90.0) {
            float occ = 0.0;
            float aoRad = clamp(0.016 * (14.0 / max(centerDepth, 3.0)), 0.004, 0.022);
            vec2 aoDirs[8] = vec2[8](
              vec2( 1.0,  0.0), vec2(-1.0,  0.0), vec2( 0.0,  1.0), vec2( 0.0, -1.0),
              vec2( 0.707, 0.707), vec2(-0.707, 0.707), vec2( 0.707,-0.707), vec2(-0.707,-0.707)
            );
            for (int k = 0; k < 8; k++) {
              float rMul = (k < 4) ? 0.65 : 1.0;
              float sDepth = getLinearDepth(vUv + aoDirs[k] * aoRad * rMul);
              float diff = centerDepth - sDepth;
              float rangeCheck = smoothstep(2.2, 0.2, abs(diff));
              occ += smoothstep(0.04, 0.45, diff) * rangeCheck;
            }
            float ssao = 1.0 - clamp((occ / 8.0) * 0.86, 0.0, 0.68);
            baseCol *= mix(vec3(0.58, 0.46, 0.62), vec3(1.0), ssao);
          }

          // B. Full-Scene 16-Step Dual-Scale IGN Screen-Space Detailed Shadows
          if (centerDepth < 145.0) {
            float farFade = smoothstep(145.0, 95.0, centerDepth);
            float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            vec2 toSunUv = uSunScreenPos - vUv;
            vec2 sunRayDir = toSunUv / max(length(toSunUv), 0.001);
            float microMaxR = clamp(0.018 * (12.0 / max(centerDepth, 3.0)), 0.005, 0.024);
            float macroMaxR = clamp(0.068 * (16.0 / max(centerDepth, 4.0)), 0.018, 0.072);
            float minBias   = 0.024 + centerDepth * 0.0046;
            float maxThick  = 0.36  + centerDepth * 0.045;

            float microShadow = 0.0;
            for (int s = 0; s < 8; s++) {
              float t = (float(s) + 0.35 + ign * 0.65) / 8.0;
              vec2 rayUv = vUv + sunRayDir * (t * microMaxR);
              if (rayUv.x < 0.002 || rayUv.x > 0.998 || rayUv.y < 0.002 || rayUv.y > 0.998) break;
              float rayDepth = getLinearDepth(rayUv);
              float dz = (centerDepth - t * (0.04 + centerDepth * 0.008)) - rayDepth;
              float hit = smoothstep(minBias, minBias * 2.8, dz) * smoothstep(maxThick * 0.55, minBias * 4.5, dz);
              microShadow = max(microShadow, hit * (1.0 - t * 0.32));
            }
            float macroShadow = 0.0;
            for (int s = 0; s < 8; s++) {
              float t = (float(s) + 0.40 + ign * 0.60) / 8.0;
              vec2 rayUv = vUv + sunRayDir * (microMaxR + t * (macroMaxR - microMaxR));
              if (rayUv.x < 0.002 || rayUv.x > 0.998 || rayUv.y < 0.002 || rayUv.y > 0.998) break;
              float rayDepth = getLinearDepth(rayUv);
              float dz = (centerDepth - (0.08 + t * (0.24 + centerDepth * 0.025))) - rayDepth;
              float hit = smoothstep(minBias * 1.4, minBias * 3.6, dz) * smoothstep(maxThick * 1.35, minBias * 6.0, dz);
              macroShadow = max(macroShadow, hit * (1.0 - t * 0.52));
            }
            float totalSSShadow = clamp(max(microShadow * 0.92, macroShadow * 0.68), 0.0, 1.0) * farFade;
            baseCol *= mix(vec3(1.0), vec3(0.46, 0.36, 0.48), totalSSShadow * 0.72);
          }

          // 1. Depth-Gated 32-Tap Volumetric Godrays
          vec2 sunPos = uSunScreenPos;
          vec2 deltaUv = (vUv - sunPos) * (0.92 / 32.0);
          vec2 sampleUv = vUv;
          float illumDecay = 1.0;
          vec3 godrays = vec3(0.0);
          for (int i = 0; i < 32; i++) {
            sampleUv -= deltaUv;
            vec2 clampedUv = clamp(sampleUv, vec2(0.002), vec2(0.998));
            vec3 s = texture(tDiffuse, clampedUv).rgb;
            float sDepth = getLinearDepth(clampedUv);
            float luma = dot(s, vec3(0.299, 0.587, 0.114));
            float isSky = smoothstep(135.0, 210.0, sDepth);
            float skyPass = isSky * smoothstep(0.28, 0.65, luma) * smoothstep(0.32, 0.62, clampedUv.y);
            godrays += s * skyPass * illumDecay;
            illumDecay *= 0.945;
          }
          godrays *= (1.0 / 32.0);
          vec2 toSun = vUv - sunPos;
          float sunDist = length(toSun);
          float radialFalloff = smoothstep(1.25, 0.0, sunDist);
          float ang = atan(toSun.y, toSun.x);
          float beamDetail = 0.75 + 0.25 * sin(ang * 14.0 + 1.2) * cos(ang * 7.0 - 0.5);
          vec3 col = baseCol + godrays * vec3(1.00, 0.78, 0.46) * uGodrayWeight * radialFalloff * beamDetail;
          col += vec3(1.00, 0.80, 0.50) * exp(-sunDist * 4.6) * 0.08;

          // 2. Soft Golden-Hour Bloom
          vec2 off = uTexelSize * 4.5;
          vec3 bloom = vec3(0.0);
          vec2 taps[8] = vec2[8](
            vec2( 1.0,  0.0), vec2(-1.0,  0.0), vec2( 0.0,  1.0), vec2( 0.0, -1.0),
            vec2( 0.7,  0.7), vec2(-0.7,  0.7), vec2( 0.7, -0.7), vec2(-0.7, -0.7)
          );
          for (int j = 0; j < 8; j++) {
            vec3 bs = texture(tDiffuse, clamp(vUv + taps[j] * off, vec2(0.002), vec2(0.998))).rgb;
            float bl = dot(bs, vec3(0.299, 0.587, 0.114));
            bloom += bs * smoothstep(0.66, 1.15, bl);
          }
          col += (bloom / 8.0) * vec3(1.0, 0.86, 0.68) * uBloomWeight;

          // 3. Cohesive Minimal Anime Color Grading
          col *= 1.0 - dot(vUv - 0.5, vUv - 0.5) * 0.24;
          col *= 1.04;
          col = (col * (2.45 * col + 0.035)) / (col * (2.38 * col + 0.58) + 0.14);
          col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          vec3 shadowHarm    = vec3(0.16, 0.11, 0.17);
          vec3 highlightHarm = vec3(1.02, 0.96, 0.90);
          col = mix(max(col, shadowHarm * 0.24), col, smoothstep(0.0, 0.26, luma));
          col *= mix(vec3(0.96, 0.94, 1.02), highlightHarm, smoothstep(0.26, 0.84, luma));
          float newLuma = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(newLuma), col, 0.91);
          col = mix(col, col * col * (3.0 - 2.0 * col), 0.25);
          fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
    });
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

    postMatRef.current = postMat;
    sunLightRef.current = sunLight;
    const audioEngine = createOasisAudioEngine();
    audioRef.current = audioEngine;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2(0, 0);
    const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(WATER_LEVEL));
    const waterHit = new THREE.Vector3();
    let rippleCursor = 0, lastRippleMs = 0, lastHitX = 999, lastHitZ = 999, lastPtrX = 0, lastPtrY = 0;
    let scrubWindBoost = 0, targetParallaxX = 0, targetParallaxY = 0, curParallaxX = 0, curParallaxY = 0;
    let isDraggingOrbit = false, waterElapsed = 0;

    function handleScrubPointer(clientX, clientY, isTouch) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      const dx = nx - lastPtrX, dy = ny - lastPtrY;
      const speed = Math.min(1.0, Math.hypot(dx, dy) * (isTouch ? 16.0 : 12.0));
      lastPtrX = nx; lastPtrY = ny;
      scrubWindBoost = Math.min(0.28, scrubWindBoost + speed * 0.14);
      if (!isDraggingOrbit) { targetParallaxX = nx * 0.18; targetParallaxY = ny * 0.08; }
      audioEngine.updateScrub(speed);

      pointerNdc.set(nx, ny);
      raycaster.setFromCamera(pointerNdc, camera);
      if (raycaster.ray.intersectPlane(waterPlane, waterHit)) {
        const rx = waterHit.x / 7.3, rz = (waterHit.z - 0.15) / 6.3;
        if (rx * rx + rz * rz < 1.04) {
          const nowMs = performance.now();
          const moveDist = Math.hypot(waterHit.x - lastHitX, waterHit.z - lastHitZ);
          if (nowMs - lastRippleMs > 85 && moveDist > 0.22) {
            lastRippleMs = nowMs; lastHitX = waterHit.x; lastHitZ = waterHit.z;
            const ripArr = water.material.uniforms.uRipples.value;
            ripArr[rippleCursor].set(waterHit.x, waterHit.z, waterElapsed, Math.min(1.0, 0.45 + speed * 0.65));
            rippleCursor = (rippleCursor + 1) % ripArr.length;
            audioEngine.triggerWaterDrop(nx, speed);
          }
        }
      }
    }

    const domEl = renderer.domElement;
    const onPointerDown = (e) => { isDraggingOrbit = true; handleScrubPointer(e.clientX, e.clientY, e.pointerType === 'touch'); };
    const onPointerUp = () => { isDraggingOrbit = false; };
    const onPointerMove = (e) => { handleScrubPointer(e.clientX, e.clientY, e.pointerType === 'touch'); };
    const onTouchMove = (e) => { if (e.touches && e.touches.length === 1) handleScrubPointer(e.touches[0].clientX, e.touches[0].clientY, true); };
    domEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    domEl.addEventListener('pointermove', onPointerMove, { passive: true });
    domEl.addEventListener('touchmove', onTouchMove, { passive: true });

    function renderWithPostFX() {
      const scrubDelta = goldenScrubRef.current - 0.5;
      const sunX = clamp(0.07 + scrubDelta * 0.24, 0.02, 0.34);
      const sunY = clamp(0.86 - Math.abs(scrubDelta) * 0.14 + scrubDelta * 0.06, 0.68, 0.94);
      postMat.uniforms.uSunScreenPos.value.set(sunX, sunY);
      postMat.uniforms.uGodrayWeight.value = 0.52 + (0.5 - Math.abs(scrubDelta)) * 0.10;
      renderer.setRenderTarget(postRT);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    }

    scene.add(water.mesh);
    waterMatRef.current = water.material;

    let rafId = 0, lastTime = performance.now();
    const animate = (now) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) * 0.001, 0.05);
      lastTime = now;
      waterElapsed += dt;
      scrubWindBoost = Math.max(0, scrubWindBoost - dt * 0.18);
      if (windRef.current) windRef.current.uWindAmp.value = Math.min(0.48, windAmp + scrubWindBoost);
      curParallaxX += (targetParallaxX - curParallaxX) * Math.min(1, dt * 4.0);
      curParallaxY += (targetParallaxY - curParallaxY) * Math.min(1, dt * 4.0);
      sky.update(dt);
      palms.update(now * 0.001);
      controls.update();
      if (!isDraggingOrbit && (Math.abs(curParallaxX) > 0.0005 || Math.abs(curParallaxY) > 0.0005)) {
        camera.position.x += curParallaxX * 0.02;
        camera.position.y += curParallaxY * 0.015;
      }
      water.mesh.update(renderer, scene, camera, dt);
      moteMat.uniforms.uTime.value = now * 0.001;
      mistMat.uniforms.uTime.value = now * 0.001;
      renderWithPostFX();
    };
    rafId = requestAnimationFrame(animate);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h); postRT.setSize(w, h);
      postMat.uniforms.uTexelSize.value.set(1.0 / Math.max(w, 1), 1.0 / Math.max(h, 1));
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('touchmove', onTouchMove);
      audioEngine.dispose();
      controls.dispose();
      water.reflectTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (!cameraGoal || !cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current, ctrl = controlsRef.current;
    const startPos = cam.position.clone(), endPos = new THREE.Vector3(...cameraGoal.pos);
    const startTgt = ctrl.target.clone(), endTgt = new THREE.Vector3(...cameraGoal.target);
    let t = 0, id = 0;
    const step = () => {
      t = Math.min(1, t + 0.05);
      const ease = 1 - Math.pow(1 - t, 3);
      cam.position.lerpVectors(startPos, endPos, ease);
      ctrl.target.lerpVectors(startTgt, endTgt, ease);
      ctrl.update();
      if (t < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [cameraGoal]);

  useEffect(() => { if (windRef.current) windRef.current.uWindAmp.value = windAmp; }, [windAmp]);
  useEffect(() => { if (waterMatRef.current) waterMatRef.current.uniforms.uReflectStrength.value = reflectStrength; }, [reflectStrength]);
  useEffect(() => { if (rendererRef.current) rendererRef.current.toneMappingExposure = exposure; }, [exposure]);
  useEffect(() => {
    goldenScrubRef.current = goldenScrub;
    if (sunLightRef.current) {
      const d = goldenScrub - 0.5;
      sunLightRef.current.color.setRGB(1.0, Math.max(0.68, Math.min(0.92, 0.84 - d * 0.16)), Math.max(0.46, Math.min(0.82, 0.64 + d * 0.22)));
      sunLightRef.current.position.set(-28 + d * 18, 18 - Math.abs(d) * 4, -22);
    }
  }, [goldenScrub]);

  const toggleSound = () => {
    const next = !soundOn;
    if (audioRef.current) audioRef.current.setEnabled(next);
    setSoundOn(next);
  };

  return React.createElement(
    'div', { style: { width: '100%', height: '100%', position: 'relative' } },
    React.createElement('div', { ref: mountRef, style: { width: '100%', height: '100%' } }),
    React.createElement(
      motion.button,
      { className: 'hud-pill', whileHover: { scale: 1.03 }, whileTap: { scale: 0.96 }, onClick: () => setPanelOpen((v) => !v) },
      React.createElement('span', { style: { width: 7, height: 7, borderRadius: '50%', background: '#f1c682', display: 'inline-block' } }),
      panelOpen ? 'Close Studio' : 'Oasis Studio'
    ),
    React.createElement(
      'div', { className: 'scrub-dock' },
      React.createElement(
        'button',
        { className: `sound-btn ${soundOn ? 'on' : ''}`, onClick: toggleSound, type: 'button', 'aria-label': 'Toggle Oasis Sound' },
        React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: soundOn ? '#9cf2d2' : '#f1c682', display: 'inline-block' } }),
        soundOn ? 'Sound On' : 'Sound'
      ),
      React.createElement(
        'label', { className: 'scrub-wrap' },
        React.createElement('span', null, 'Sun Scrub'),
        React.createElement('input', {
          className: 'scrub-slider', type: 'range', min: 0, max: 1, step: 0.01, value: goldenScrub,
          onChange: (e) => setGoldenScrub(parseFloat(e.target.value)),
          onInput: (e) => setGoldenScrub(parseFloat(e.target.value)),
        })
      ),
      React.createElement('span', { className: 'scrub-hint' }, 'Hover / Touch Water')
    ),
    React.createElement(
      AnimatePresence, null,
      panelOpen && React.createElement(
        motion.div,
        {
          className: 'hud-panel',
          initial: { opacity: 0, y: -10, scale: 0.96 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: -8, scale: 0.96 },
          transition: { type: 'spring', stiffness: 320, damping: 26 },
        },
        React.createElement('div', { className: 'hud-title' }, 'Camera Presets'),
        React.createElement(
          'div', { className: 'preset-grid' },
          Object.entries(CAMERA_PRESETS).map(([key, preset]) =>
            React.createElement(
              motion.button,
              { key, whileTap: { scale: 0.95 }, className: `preset-btn ${activePreset === key ? 'active' : ''}`, onClick: () => { setActivePreset(key); setCameraGoal(preset); } },
              preset.label
            )
          )
        ),
        React.createElement(
          'div', { className: 'slider-row' },
          React.createElement('div', { className: 'slider-label' }, React.createElement('span', null, 'Canopy Wind Sway'), React.createElement('span', null, windAmp.toFixed(2))),
          React.createElement('input', { type: 'range', min: 0, max: 0.45, step: 0.01, value: windAmp, onChange: (e) => setWindAmp(parseFloat(e.target.value)) })
        ),
        React.createElement(
          'div', { className: 'slider-row' },
          React.createElement('div', { className: 'slider-label' }, React.createElement('span', null, 'Water Reflection'), React.createElement('span', null, Math.round(reflectStrength * 100) + '%')),
          React.createElement('input', { type: 'range', min: 0.2, max: 1.3, step: 0.05, value: reflectStrength, onChange: (e) => setReflectStrength(parseFloat(e.target.value)) })
        ),
        React.createElement(
          'div', { className: 'slider-row' },
          React.createElement('div', { className: 'slider-label' }, React.createElement('span', null, 'Filmic Exposure'), React.createElement('span', null, exposure.toFixed(2))),
          React.createElement('input', { type: 'range', min: 0.8, max: 1.4, step: 0.02, value: exposure, onChange: (e) => setExposure(parseFloat(e.target.value)) })
        ),
        React.createElement('div', { className: 'badge-row' }, React.createElement('span', null, 'Three.js 0.187.0 WebGL2'), React.createElement('span', null, 'Motion 14.14'))
      )
    )
  );
}

createRoot(document.getElementById('root')).render(React.createElement(OasisApp));
