import * as THREE from 'three';
import { WATER_LEVEL, SUN_DIRECTION, clamp, smoothstep, REAL_SCANS, REAL_DEM_TEX, getTerrainHeight, getBasinSignedDistance } from './assets.js';

function createSkyDome(sunDir) {
  const vertexShader = /* glsl */ `
    out vec3 vWorldDir;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldDir = normalize(position);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;
  const fragmentShader = /* glsl */ `
    precision highp float;
    uniform vec3 uSunDir;
    uniform float uTime;
    in vec3 vWorldDir;
    out vec4 fragColor;

    float hash21(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }
    float noise2D(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }
    float fbm5(vec2 p) {
      float value = 0.0, amp = 0.5;
      mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
      for (int i = 0; i < 5; i++) {
        value += amp * noise2D(p);
        p = rot * p * 2.02 + vec2(13.7, 7.1);
        amp *= 0.5;
      }
      return value;
    }
    vec3 srgbToLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }

    void main() {
      vec3 dir = normalize(vWorldDir);
      vec3 colHorizon  = srgbToLinear(vec3(0.945, 0.815, 0.725));
      vec3 colRose     = srgbToLinear(vec3(0.835, 0.705, 0.685));
      vec3 colLavender = srgbToLinear(vec3(0.745, 0.650, 0.670));
      vec3 colZenith   = srgbToLinear(vec3(0.585, 0.515, 0.575));

      float elev = clamp(dir.y / 0.27, 0.0, 1.0);
      vec3 skyCol = mix(colHorizon, colRose, smoothstep(0.0, 0.34, elev));
      skyCol = mix(skyCol, colLavender, smoothstep(0.30, 0.72, elev));
      skyCol = mix(skyCol, colZenith, smoothstep(0.68, 1.0, elev));

      float leftGlow = smoothstep(0.38, -0.52, dir.x) * exp(-max(dir.y, 0.0) * 5.8);
      skyCol += srgbToLinear(vec3(1.0, 0.88, 0.68)) * leftGlow * 0.58;

      if (dir.y > 0.03 && dir.z < 0.0) {
        vec2 sp = vec2(dir.x / max(-dir.z, 0.2), dir.y / max(-dir.z, 0.2));
        vec2 p = vec2(sp.x * 4.2 + uTime * 0.006, sp.y * 15.5);
        vec2 warp = vec2(fbm5(p * 1.15 + vec2(2.3, 1.7)), fbm5(p * 1.15 + vec2(-3.1, 4.2)));
        float n = fbm5(p * 1.55 + warp * 1.45);
        float nFine = fbm5(p * 3.8 - warp * 0.75);
        float billow = n * 0.65 + nFine * 0.35;

        float rightZone = smoothstep(0.06, 0.24, sp.x) * smoothstep(0.54, 0.32, sp.x) * smoothstep(0.13, 0.185, sp.y) * smoothstep(0.28, 0.21, sp.y);
        float midCirrus = smoothstep(-0.26, 0.06, sp.x) * smoothstep(0.28, 0.08, sp.x) * smoothstep(0.16, 0.20, sp.y) * smoothstep(0.25, 0.20, sp.y) * 0.65;
        float env = clamp(rightZone + midCirrus, 0.0, 1.0);
        float density = smoothstep(0.42, 0.55, billow + env * 0.34) * env;

        float sunStep = fbm5((p + vec2(-0.22, -0.32)) * 1.65 + warp * 1.55);
        float lit = clamp(0.38 + (n - sunStep) * 6.4 + (0.21 - sp.y) * 3.8, 0.0, 1.0);
        vec3 colLit    = srgbToLinear(vec3(1.00, 0.82, 0.68));
        vec3 colShaded = srgbToLinear(vec3(0.76, 0.58, 0.66));
        vec3 cloudCol = mix(colShaded, colLit, lit);
        skyCol = mix(skyCol, cloudCol, clamp(density * 0.94, 0.0, 0.92));
      }
      fragColor = vec4(max(skyCol, vec3(0.0)) * 0.94, 1.0);
    }
  `;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(260, 48, 32),
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: { uSunDir: { value: sunDir.clone() }, uTime: { value: 0.0 } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.update = (dt) => { mesh.material.uniforms.uTime.value += dt; };
  return mesh;
}

function createDesertTerrain(sunDir) {
  const geometry = new THREE.PlaneGeometry(230, 185, 128, 104);
  geometry.rotateX(-Math.PI * 0.5);
  geometry.translate(0.0, 0.0, -52.0);

  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const colSubmerged = new THREE.Color('#b8ac98');
  const colWetShore  = new THREE.Color('#d2c0a8');
  const colMidSlope  = new THREE.Color('#f0d4ae');
  const colSunCrest  = new THREE.Color('#fce9ce');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const wetT = smoothstep(-0.25, 0.06, y);
    const drySmooth = smoothstep(0.04, 0.38, y);
    const crestSmooth = smoothstep(0.5, 9.5, y);
    tmp.copy(colSubmerged).lerp(colWetShore, wetT).lerp(colMidSlope, drySmooth).lerp(colSunCrest, crestSmooth * drySmooth * 0.70);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0,
  });

  const warmTaupeShadow = new THREE.Color('#a67868');
  const hazeColor = new THREE.Color('#eab796');
  material.customProgramCacheKey = () => 'desert-terrain-realdata-v9';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: sunDir.clone() };
    shader.uniforms.uShadowTint = { value: warmTaupeShadow };
    shader.uniforms.uHazeColor = { value: hazeColor };
    shader.uniforms.uSandDiff = { value: REAL_SCANS.sandDiff };
    shader.uniforms.uSandNor = { value: REAL_SCANS.sandNor };
    shader.uniforms.uSandRough = { value: REAL_SCANS.sandRough };
    shader.uniforms.uDuneRippleNor = { value: REAL_SCANS.duneRippleNor };
    shader.uniforms.uRealDem = { value: REAL_DEM_TEX };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        uniform vec3 uSunDir;
        uniform vec3 uShadowTint;
        uniform vec3 uHazeColor;
        uniform sampler2D uSandDiff;
        uniform sampler2D uSandNor;
        uniform sampler2D uSandRough;
        uniform sampler2D uDuneRippleNor;
        uniform sampler2D uRealDem;
        varying vec3 vTerrainWorldPos;

        float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x),
            mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float gSmax(float a, float b, float k) {
          float h = max(k - abs(a - b), 0.0) / k;
          return max(a, b) + h * h * k * 0.25;
        }
        float gSharpCrest(float x, float z, float cx, float zc, float zw, float h, float lw, float rw) {
          float dx = x - cx;
          float sw = dx < 0.0 ? lw : rw;
          float adx = sqrt(dx * dx + 0.004) - 0.0632;
          float cross = max(0.0, 1.0 - max(0.0, adx) / sw);
          float zEnv = exp(-pow((z - zc) / zw, 2.0));
          return h * cross * zEnv;
        }
        float gDuneHeight(vec2 xz) {
          float x = xz.x, z = xz.y;
          float cPeak  = gSharpCrest(x, z, 3.8 + sin((z + 54.0) * 0.075) * 3.2 - (z + 54.0) * 0.12, -54.0, 28.0, 11.2, 30.0, 11.5);
          float lRidge = gSharpCrest(x, z, -22.5 + sin((z + 38.0) * 0.068) * 3.2 + (z + 38.0) * 0.15, -38.0, 24.0, 10.8, 26.0, 13.5);
          float rMass  = gSharpCrest(x, z, 32.0 + sin((z + 44.0) * 0.055) * 4.8, -44.0, 32.0, 11.2, 34.0, 22.0);
          float rFore  = gSharpCrest(x, z, 22.5 + (z + 28.0) * 0.16, -28.0, 18.0, 7.8, 22.0, 16.0);
          float backSaddle = 2.2 * exp(-pow((z + 24.0) / 11.0, 2.0)) * (0.45 + 0.55 * smoothstep(2.0, 18.0, x));
          float d = gSmax(cPeak, lRidge, 5.2);
          d = gSmax(d, rMass, 2.2);
          return gSmax(d, rFore, 1.8) + backSaddle * 0.32;
        }
      `)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        {
          vec2 uvA = vTerrainWorldPos.xz * 0.14;
          vec2 uvB = (mat2(0.798, -0.602, 0.602, 0.798) * vTerrainWorldPos.xz) * 0.085 + vec2(3.7, 1.9);
          float tileBlend = smoothstep(0.22, 0.78, sNoise(vTerrainWorldPos.xz * 0.065));
          vec3 scanSand = mix(texture2D(uSandDiff, uvA).rgb, texture2D(uSandDiff, uvB).rgb, tileBlend);
          float sandLuma = dot(scanSand, vec3(0.299, 0.587, 0.114));
          float microTint = mix(0.94, 1.06, clamp((sandLuma - 0.18) * 1.6 + 0.5, 0.0, 1.0));
          diffuseColor.rgb *= microTint;
        }
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        #include <roughnessmap_fragment>
        float scanRough = texture2D(uSandRough, vTerrainWorldPos.xz * 0.16).r;
        roughnessFactor = clamp(roughnessFactor * mix(0.85, 1.08, scanRough), 0.16, 0.96);
        float wetGloss = pow(1.0 - smoothstep(-0.06, 0.52, vTerrainWorldPos.y), 1.45);
        roughnessFactor = mix(roughnessFactor, 0.14, wetGloss * 0.88);
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */ `
        #include <normal_fragment_maps>
        {
          float duneZone = smoothstep(-11.0, -22.0, vTerrainWorldPos.z) * smoothstep(0.6, 2.2, vTerrainWorldPos.y);
          if (duneZone > 0.01) {
            float eps = 0.14;
            float hL = gDuneHeight(vTerrainWorldPos.xz - vec2(eps, 0.0));
            float hR = gDuneHeight(vTerrainWorldPos.xz + vec2(eps, 0.0));
            float hD = gDuneHeight(vTerrainWorldPos.xz - vec2(0.0, eps));
            float hU = gDuneHeight(vTerrainWorldPos.xz + vec2(0.0, eps));
            vec3 analyticalW = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
            vec3 analyticalV = normalize((viewMatrix * vec4(analyticalW, 0.0)).xyz);
            normal = normalize(mix(normal, analyticalV, duneZone * 0.92));
          }
          float camDist = length(cameraPosition - vTerrainWorldPos);
          float nearFade = 1.0 - smoothstep(16.0, 95.0, camDist);
          vec2 demUV = clamp(vec2((vTerrainWorldPos.x + 60.0) / 120.0, (-vTerrainWorldPos.z - 12.0) / 76.0), 0.01, 0.99);
          float demEps = 1.0 / 64.0;
          float dL = texture2D(uRealDem, demUV - vec2(demEps, 0.0)).r;
          float dR = texture2D(uRealDem, demUV + vec2(demEps, 0.0)).r;
          float dD = texture2D(uRealDem, demUV - vec2(0.0, demEps)).r;
          float dU = texture2D(uRealDem, demUV + vec2(0.0, demEps)).r;
          float farDemMask = smoothstep(-14.0, -30.0, vTerrainWorldPos.z);
          vec2 demSlope = vec2(dL - dR, dD - dU) * 0.22 * farDemMask;

          vec2 sUvA = vTerrainWorldPos.xz * 0.28;
          vec2 sUvB = (mat2(0.798, -0.602, 0.602, 0.798) * vTerrainWorldPos.xz) * 0.17 + vec2(2.1, 4.3);
          float sMix = smoothstep(0.25, 0.75, sNoise(vTerrainWorldPos.xz * 0.07));
          vec3 sandN = mix(texture2D(uSandNor, sUvA).xyz, texture2D(uSandNor, sUvB).xyz, sMix) * 2.0 - 1.0;
          float wWarp = sNoise(vTerrainWorldPos.xz * 0.22) * 3.2;
          float fineRip = sin(vTerrainWorldPos.z * 6.4 - vTerrainWorldPos.x * 2.2 + wWarp * 1.6) * 0.026 * nearFade * (0.35 + 0.65 * sNoise(vTerrainWorldPos.xz * 0.14));
          float grainFade = 1.0 - smoothstep(5.0, 32.0, camDist);
          vec2 dUvA = vTerrainWorldPos.xz * 0.095;
          vec2 dUvB = (mat2(0.866, -0.500, 0.500, 0.866) * vTerrainWorldPos.xz) * 0.068 + vec2(5.2, 1.4);
          vec3 duneRipN = mix(texture2D(uDuneRippleNor, dUvA).xyz, texture2D(uDuneRippleNor, dUvB).xyz, sMix) * 2.0 - 1.0;
          float duneRipMask = smoothstep(-6.0, -14.0, vTerrainWorldPos.z) * smoothstep(0.12, 0.85, vTerrainWorldPos.y);
          vec2 totalPert = demSlope * 0.75 + duneRipN.xy * 0.24 * duneRipMask + vec2(fineRip * 0.25, fineRip) + sandN.xy * 0.10 * grainFade;

          vec3 viewPerturb = (viewMatrix * vec4(totalPert.x, 0.0, totalPert.y, 0.0)).xyz;
          normal = normalize(normal + viewPerturb);
        }
      `)
      .replace('#include <lights_fragment_end>', /* glsl */ `
        #include <lights_fragment_end>
        {
          vec3 viewSun = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          float ndl = dot(normal, viewSun);
          float slipMask = 1.0 - smoothstep(0.14, 0.29, ndl);
          float duneMask = smoothstep(0.35, 1.8, vTerrainWorldPos.y) * smoothstep(-10.5, -19.0, vTerrainWorldPos.z);
          float totalDuneShadow = clamp(slipMask * duneMask, 0.0, 1.0);

          float shadowGrad = clamp(ndl * 1.9 + 0.50, 0.0, 1.0);
          vec3 duneShadowCol = diffuseColor.rgb * mix(vec3(0.27, 0.20, 0.22), vec3(0.48, 0.37, 0.36), shadowGrad);
          reflectedLight.directDiffuse *= mix(1.0, 0.08, totalDuneShadow);
          reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, duneShadowCol, totalDuneShadow * 0.86);

          float crestSun = smoothstep(0.35, 0.82, ndl) * duneMask;
          reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.20, 0.14, 0.06) * crestSun;

          float fgSunBeach = smoothstep(6.0, 12.5, vTerrainWorldPos.z) * smoothstep(0.04, 0.30, vTerrainWorldPos.y);
          reflectedLight.directDiffuse *= (1.0 + fgSunBeach * 0.64);

          float glintNoise = sHash(floor(vTerrainWorldPos.xz * 32.0));
          float sparkle = step(0.990, glintNoise) * smoothstep(0.25, 0.7, ndl) * (1.0 - smoothstep(10.0, 52.0, length(cameraPosition - vTerrainWorldPos)));
          reflectedLight.directSpecular += vec3(1.0, 0.88, 0.65) * sparkle * 0.42;

          float shoreNoise = sNoise(vTerrainWorldPos.xz * 0.90) * 0.04;
          float pondProx = 0.22 + 0.78 * smoothstep(-6.0, 1.0, vTerrainWorldPos.z);
          float wetY = vTerrainWorldPos.y - shoreNoise;
          float dampBand = pow(1.0 - smoothstep(-0.03, 0.16, wetY), 1.50) * smoothstep(-0.40, -0.02, vTerrainWorldPos.y) * pondProx;
          vec3 vDir = normalize(cameraPosition - vTerrainWorldPos);
          float wetFresnel = 0.05 + 0.48 * pow(1.0 - clamp(dot(vec3(0.0, 1.0, 0.0), vDir), 0.0, 1.0), 3.2);
          reflectedLight.directDiffuse *= (1.0 - dampBand * 0.36);
          reflectedLight.indirectDiffuse = mix(
            reflectedLight.indirectDiffuse * (1.0 - dampBand * 0.16),
            vec3(0.24, 0.30, 0.34),
            dampBand * wetFresnel * 0.52
          );

          float dryBeachSun = smoothstep(0.06, 0.20, wetY) * smoothstep(5.0, 9.8, vTerrainWorldPos.z);
          reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.68, 0.42, 0.12) * dryBeachSun;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.18, 0.11, 0.04) * dryBeachSun;

          float fgMask = smoothstep(9.2, 11.2, vTerrainWorldPos.z) * (1.0 - smoothstep(17.8, 19.8, vTerrainWorldPos.z));
          float rightBeach = smoothstep(6.4, 10.5, vTerrainWorldPos.x) * smoothstep(-1.0, 4.5, vTerrainWorldPos.z) * (1.0 - smoothstep(9.5, 13.0, vTerrainWorldPos.z));
          float n1 = sNoise(vec2(vTerrainWorldPos.x * 0.38 + vTerrainWorldPos.z * 0.22, vTerrainWorldPos.z * 0.52 - vTerrainWorldPos.x * 0.18));
          float n2 = sNoise(vec2(vTerrainWorldPos.x * 0.95, vTerrainWorldPos.z * 1.15) + vec2(4.1, 2.7));
          float frondStreak = 0.5 + 0.5 * sin(vTerrainWorldPos.x * 2.4 - vTerrainWorldPos.z * 1.65 + n1 * 2.8);
          float bankEncroach = smoothstep(0.15, 3.8, abs(vTerrainWorldPos.x)) * 0.72 + 0.46 * smoothstep(12.6, 15.6, vTerrainWorldPos.z);
          float fgShadow = smoothstep(0.32, 0.66, (n1 * 0.40 + n2 * 0.22 + frondStreak * 0.38)) * bankEncroach * (fgMask * 0.84 + rightBeach * 0.42);
          reflectedLight.directDiffuse *= (1.0 - fgShadow * 0.76);
          reflectedLight.indirectDiffuse *= (1.0 - fgShadow * 0.30);

          float bankUnder = smoothstep(5.4, 7.6, abs(vTerrainWorldPos.x)) * smoothstep(-10.5, -5.0, vTerrainWorldPos.z) * (1.0 - smoothstep(7.5, 11.0, vTerrainWorldPos.z));
          float bushContact = bankUnder * (0.62 + 0.38 * sNoise(vTerrainWorldPos.xz * 1.4));
          reflectedLight.directDiffuse *= (1.0 - bushContact * 0.72);
          reflectedLight.indirectDiffuse *= (1.0 - bushContact * 0.48);
          reflectedLight.directDiffuse += vec3(0.14, 0.09, 0.04) * (fgMask + rightBeach * 0.7) * (1.0 - fgShadow);
        }
      `)
      .replace('#include <fog_fragment>', /* glsl */ `
        #include <fog_fragment>
        float dist = length(cameraPosition - vTerrainWorldPos);
        float aerial = smoothstep(72.0, 165.0, dist) * 0.07;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, aerial);
      `);
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function createOasisWater(sunDir) {
  const geometry = new THREE.PlaneGeometry(26, 22, 72, 72);
  geometry.rotateX(-Math.PI * 0.5);
  geometry.translate(0.0, WATER_LEVEL, 2.0);

  const pos = geometry.attributes.position;
  const depths = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    depths[i] = Math.max(0.0, WATER_LEVEL - getTerrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));

  const reflectTarget = new THREE.WebGLRenderTarget(384, 216, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
  });
  const reflectCam = new THREE.PerspectiveCamera();

  const vertexShader = /* glsl */ `
    in float aDepth;
    uniform float uTime;
    uniform vec4 uRipples[6];
    uniform vec4 uWakes[18];
    uniform vec2 uWakeDir[18];
    out vec3 vWorldPos;
    out vec4 vClipPos;
    out float vDepth;
    void main() {
      vDepth = aDepth;
      vec3 p = position;
      float waveMask = smoothstep(0.0, 0.35, aDepth);
      float dy = sin(p.x * 0.9 + uTime * 0.95) * 0.006 + cos(p.z * 1.2 - uTime * 0.8) * 0.005;
      // 1) Discrete click/tap radial impact ripples (physical Y vertex displacement)
      for (int r = 0; r < 6; r++) {
        vec4 rp = uRipples[r];
        float age = uTime - rp.z;
        if (rp.w > 0.001 && age >= 0.0 && age < 4.8) {
          float dist = length(p.xz - rp.xy);
          float front = age * 1.65;
          float env = exp(-abs(dist - front) * 2.1) * exp(-age * 0.72) * exp(-dist * 0.24) * rp.w;
          dy += sin((dist - front) * 12.5) * env * 0.085;
        }
      }
      // 2) Continuous mouse hover / touch scrub directional V-wake wave trails (physical Y vertex displacement)
      for (int w = 0; w < 18; w++) {
        vec4 wk = uWakes[w];
        float age = uTime - wk.z;
        if (wk.w > 0.001 && age >= 0.0 && age < 3.4) {
          vec2 dVec = p.xz - wk.xy;
          vec2 dir = uWakeDir[w];
          vec2 perp = vec2(-dir.y, dir.x);
          float along = dot(dVec, dir);
          float across = dot(dVec, perp);
          float behind = max(0.0, -along);
          float spread = 0.18 + age * 0.72 + behind * 0.42;
          float vArm = abs(across) - spread;
          float armEnv = exp(-vArm * vArm * 6.5) * exp(-abs(along + age * 0.42) * 0.95) * exp(-age * 0.82) * wk.w;
          dy += sin(vArm * 11.0 - age * 8.0) * armEnv * 0.115;
        }
      }
      p.y += dy * waveMask;
      vec4 worldPos = modelMatrix * vec4(p, 1.0);
      vWorldPos = worldPos.xyz;
      vClipPos = projectionMatrix * viewMatrix * worldPos;
      gl_Position = vClipPos;
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;
    uniform sampler2D uReflectionMap;
    uniform sampler2D uSandDiff;
    uniform sampler2D uDuneRippleNor;
    uniform vec3 uSunDir;
    uniform float uTime;
    uniform float uReflectStrength;
    uniform vec4 uRipples[6];
    uniform vec4 uWakes[18];
    uniform vec2 uWakeDir[18];

    in vec3 vWorldPos;
    in vec4 vClipPos;
    in float vDepth;
    out vec4 fragColor;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    vec3 getWaterNormal(vec2 p, float t) {
      float eps = 0.062;
      vec2 uv1 = vec2(p.x * 0.85 + p.y * 0.35, p.y * 2.10 - p.x * 0.25) + vec2(t * 0.11, t * 0.06);
      vec2 uv2 = vec2(p.x * 1.55 - p.y * 0.55, p.y * 3.80 + p.x * 0.40) - vec2(t * 0.14, -t * 0.08);
      float h0 = noise(uv1) * 0.58 + noise(uv2) * 0.42;
      float hx = noise(uv1 + vec2(eps, 0.0)) * 0.58 + noise(uv2 + vec2(eps, 0.0)) * 0.42;
      float hz = noise(uv1 + vec2(0.0, eps * 1.8)) * 0.58 + noise(uv2 + vec2(0.0, eps * 1.8)) * 0.42;
      float mRip0 = (noise(p * 8.5 + vec2(t * 0.24, -t * 0.18)) - 0.5) * 0.065;
      float mRipX = (noise((p + vec2(eps, 0.0)) * 8.5 + vec2(t * 0.24, -t * 0.18)) - 0.5) * 0.065;
      float mRipZ = (noise((p + vec2(0.0, eps)) * 8.5 + vec2(t * 0.24, -t * 0.18)) - 0.5) * 0.065;
      h0 += mRip0; hx += mRipX; hz += mRipZ;
      float strength = 0.105;
      vec2 ripGrad = vec2(0.0);
      // 1) Discrete click/tap radial impact ripples (matching vertex deformation)
      for (int r = 0; r < 6; r++) {
        vec4 rp = uRipples[r];
        float age = t - rp.z;
        if (rp.w > 0.001 && age >= 0.0 && age < 4.8) {
          vec2 dVec = p - rp.xy;
          float dist = length(dVec);
          float front = age * 1.65;
          float env = exp(-abs(dist - front) * 2.1) * exp(-age * 0.72) * exp(-dist * 0.24) * rp.w;
          float waveSlope = cos((dist - front) * 12.5) * env * 0.52;
          ripGrad += (dVec / max(dist, 0.02)) * waveSlope;
        }
      }
      // 2) Continuous mouse hover / touch scrub directional V-wake trails (matching vertex deformation)
      for (int w = 0; w < 18; w++) {
        vec4 wk = uWakes[w];
        float age = t - wk.z;
        if (wk.w > 0.001 && age >= 0.0 && age < 3.4) {
          vec2 dVec = p - wk.xy;
          vec2 dir = uWakeDir[w];
          vec2 perp = vec2(-dir.y, dir.x);
          float along = dot(dVec, dir);
          float across = dot(dVec, perp);
          float behind = max(0.0, -along);
          float spread = 0.18 + age * 0.72 + behind * 0.42;
          float vArm = abs(across) - spread;
          float armEnv = exp(-vArm * vArm * 6.5) * exp(-abs(along + age * 0.42) * 0.95) * exp(-age * 0.82) * wk.w;
          float crest = cos(vArm * 11.0 - age * 8.0) * armEnv * 0.68;
          float sgn = across >= 0.0 ? 1.0 : -1.0;
          vec2 wakeNormalDir = normalize(perp * sgn - dir * 0.38);
          ripGrad += wakeNormalDir * crest;
        }
      }
      return normalize(vec3((h0 - hx) * strength / eps + ripGrad.x, 1.0, (h0 - hz) * strength / eps + ripGrad.y));
    }

    void main() {
      float depth = max(vDepth, 0.0);
      if (depth <= 0.002) discard;

      vec3 N = getWaterNormal(vWorldPos.xz, uTime);
      vec3 V = normalize(cameraPosition - vWorldPos);
      vec3 L = normalize(uSunDir);

      vec2 refrXZ = vWorldPos.xz + N.xz * depth * 0.36;
      vec3 scanBed = texture(uSandDiff, refrXZ * 0.28).rgb;
      float bedRip = (texture(uDuneRippleNor, refrXZ * 0.18).x - 0.5) * 0.14;
      vec3 wetSandTone = mix(vec3(0.66, 0.55, 0.41), vec3(0.84, 0.74, 0.56), smoothstep(0.02, 0.36, depth));
      vec3 submergedSand = mix(wetSandTone, scanBed * vec3(1.06, 0.96, 0.78), 0.24) + vec3(bedRip * 0.16);

      float cEps = 0.095;
      vec3 Nx = getWaterNormal(vWorldPos.xz + vec2(cEps, 0.0), uTime);
      vec3 Nz = getWaterNormal(vWorldPos.xz + vec2(0.0, cEps), uTime);
      float convR = -((Nx.x - N.x) + (Nz.z - N.z)) / cEps;
      float convB = -((Nx.x - N.x) * 0.92 + (Nz.z - N.z) * 1.08 + (Nx.z - Nz.x) * 0.25) / cEps;
      float focusR = pow(clamp(convR * 0.38 + 0.48, 0.0, 1.35), 2.4);
      float focusG = pow(clamp((convR * 0.5 + convB * 0.5) * 0.38 + 0.48, 0.0, 1.35), 2.4);
      float focusB = pow(clamp(convB * 0.38 + 0.48, 0.0, 1.35), 2.4);
      float rippleDepthEnv = smoothstep(0.10, 0.34, depth) * smoothstep(1.45, 0.20, depth);
      float slopeBoost = 1.0 + clamp(length(N.xz) * 2.8, 0.0, 2.2);
      vec3 caustics = vec3(focusR * 1.08, focusG * 1.12, focusB * 0.94) * rippleDepthEnv * 0.24 * slopeBoost;
      // Underwater Tyndall sunbeams refracting along uSunDir
      vec2 beamUV = refrXZ - L.xz * depth * 0.65;
      float sunBeam = pow(clamp(noise(beamUV * 2.6 + vec2(uTime * 0.16, -uTime * 0.11)), 0.0, 1.0), 3.0);
      vec3 tyndall = vec3(0.95, 0.86, 0.62) * sunBeam * smoothstep(0.12, 0.52, depth) * exp(-depth * 0.85) * 0.22;
      // Submerged sunlit micro-bubbles & drifting silt motes
      vec2 moteCell = floor(refrXZ * 9.5 + vec2(uTime * 0.08, -uTime * 0.05));
      float moteSpark = smoothstep(0.965, 0.998, hash(moteCell + floor(uTime * 0.5) * 0.01));
      vec3 subMotes = vec3(0.82, 0.96, 0.92) * moteSpark * smoothstep(0.14, 0.45, depth) * 0.26;
      submergedSand += caustics + tyndall + subMotes;

      float backLeftBay = smoothstep(2.5, -7.2, vWorldPos.x) * smoothstep(4.2, -4.8, vWorldPos.z);
      float optDepth = depth * (1.42 + backLeftBay * 1.15);
      vec3 transmittance = exp(-optDepth * vec3(2.15, 0.42, 0.48));
      vec3 scatterCol = mix(vec3(0.24, 0.82, 0.76), vec3(0.006, 0.08, 0.14), clamp(depth * 0.55 + backLeftBay * 0.78, 0.0, 1.0));
      vec3 waterBody = submergedSand * transmittance + scatterCol * (1.0 - transmittance);

      vec2 ndc = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
      vec2 baseUV = vec2(ndc.x, 1.0 - ndc.y) + vec2(N.x * 0.032, N.z * 0.058);
      vec3 reflCol =
        texture(uReflectionMap, clamp(baseUV + vec2(-0.0022, 0.0), 0.004, 0.996)).rgb * 0.22 +
        texture(uReflectionMap, clamp(baseUV,                      0.004, 0.996)).rgb * 0.56 +
        texture(uReflectionMap, clamp(baseUV + vec2( 0.0022, 0.0), 0.004, 0.996)).rgb * 0.22;

      vec3 peachSkyRefl = vec3(0.94, 0.80, 0.78);
      float centerBack = exp(-(vWorldPos.x * vWorldPos.x / 28.0 + (vWorldPos.z + 2.0) * (vWorldPos.z + 2.0) / 24.0));
      reflCol = mix(reflCol, max(reflCol, peachSkyRefl * 0.96), centerBack * 0.58);

      float NoV = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = (0.04 + 0.60 * pow(1.0 - NoV, 3.0)) * uReflectStrength;
      float edgeClarity = smoothstep(0.10, 0.58, depth);
      vec3 color = mix(waterBody, reflCol, clamp(fresnel * edgeClarity, 0.04, 0.64));
      color += vec3(0.42, 0.30, 0.26) * centerBack * 0.68;

      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 96.0);
      color += vec3(1.0, 0.88, 0.72) * spec * 0.58;
      // Dynamic wake/ripple crest micro-foam & shimmering capillary highlights
      float crestSlope = length(N.xz);
      float crestFoam = smoothstep(0.15, 0.36, crestSlope) * smoothstep(0.05, 0.22, depth);
      float foamLace = smoothstep(0.35, 0.78, noise(vWorldPos.xz * 12.0 + vec2(uTime * 0.6, -uTime * 0.4)));
      color = mix(color, vec3(0.94, 0.97, 0.95), crestFoam * (0.36 + foamLace * 0.34));

      float frontRightMask = smoothstep(0.5, 6.2, vWorldPos.z) + smoothstep(3.8, 8.6, vWorldPos.x);
      float smoothWave = sin(vWorldPos.x * 0.95 + vWorldPos.z * 0.45 + uTime * 0.35) * 0.014
                       + (noise(vWorldPos.xz * 1.6 + vec2(uTime * 0.06, -uTime * 0.04)) - 0.5) * 0.022;
      float waveDepth = depth + smoothWave;
      float lipLine = smoothstep(0.046, 0.028, waveDepth) * smoothstep(0.012, 0.026, waveDepth);
      float lipSoft = smoothstep(0.095, 0.055, waveDepth) * smoothstep(0.025, 0.050, waveDepth) * 0.22;
      float lipMask = clamp((lipLine + lipSoft) * clamp(frontRightMask * 0.65 + 0.18, 0.0, 1.0), 0.0, 1.0);
      color = mix(color, vec3(0.86, 0.96, 0.94), lipMask * 0.46);
      color += vec3(0.36, 0.40, 0.38) * lipLine * 0.44;

      float organicDepth = max(0.0, waveDepth);
      float alpha = smoothstep(0.0, 0.12, organicDepth);
      vec3 linearWater = pow(max(color, vec3(0.0)), vec3(2.15)) * 1.15;
      fragColor = vec4(linearWater, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: {
      uReflectionMap: { value: reflectTarget.texture },
      uSandDiff: { value: REAL_SCANS.sandDiff },
      uDuneRippleNor: { value: REAL_SCANS.duneRippleNor },
      uSunDir: { value: sunDir.clone() },
      uTime: { value: 0.0 },
      uReflectStrength: { value: 0.96 },
      uRipples: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99.0, 0.0)) },
      uWakes: { value: Array.from({ length: 18 }, () => new THREE.Vector4(0, 0, -99.0, 0.0)) },
      uWakeDir: { value: Array.from({ length: 18 }, () => new THREE.Vector2(1, 0)) },
    },
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;

  // 3D Ballistic Water Spray & Micro-Droplets (click/tap bursts + wake crest spray)
  const MAX_SPRAY = 900;
  const sprayPos = new Float32Array(MAX_SPRAY * 3);
  const sprayVel = new Float32Array(MAX_SPRAY * 3);
  const sprayLife = new Float32Array(MAX_SPRAY);
  const sprayMaxLife = new Float32Array(MAX_SPRAY);
  const spraySize = new Float32Array(MAX_SPRAY);
  for (let i = 0; i < MAX_SPRAY; i++) { sprayPos[i * 3 + 1] = -99.0; sprayLife[i] = 0.0; sprayMaxLife[i] = 1.0; spraySize[i] = 0.0; }
  let sprayCursor = 0;

  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  sprayGeo.setAttribute('aLife', new THREE.BufferAttribute(sprayLife, 1));
  sprayGeo.setAttribute('aSize', new THREE.BufferAttribute(spraySize, 1));
  const sprayMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    vertexShader: /* glsl */ `
      in float aLife;
      in float aSize;
      uniform float uPixelRatio;
      out float vAlpha;
      void main() {
        vAlpha = clamp(aLife, 0.0, 1.0);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uPixelRatio * (9.5 / max(-mvPos.z, 1.0)), 1.2, 4.2 * uPixelRatio);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      in float vAlpha;
      out vec4 fragColor;
      void main() {
        if (vAlpha <= 0.01) discard;
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c);
        if (r2 > 0.25) discard;
        float core = exp(-r2 * 14.0);
        vec3 col = mix(vec3(0.76, 0.94, 0.96), vec3(1.0, 0.92, 0.74), core);
        fragColor = vec4(col * 0.95, core * vAlpha * 0.85);
      }
    `,
  });
  const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
  sprayPoints.frustumCulled = false;
  sprayPoints.renderOrder = 4;
  mesh.add(sprayPoints);

  function spawnSpray(wx, wz, count = 18, energy = 1.0, dirX = 0, dirZ = 0) {
    for (let k = 0; k < count; k++) {
      const idx = sprayCursor;
      sprayCursor = (sprayCursor + 1) % MAX_SPRAY;
      const ang = Math.random() * Math.PI * 2.0;
      const spd = (0.25 + Math.random() * 1.35) * energy;
      sprayPos[idx * 3]     = wx + (Math.random() - 0.5) * 0.16;
      sprayPos[idx * 3 + 1] = WATER_LEVEL + 0.03 + Math.random() * 0.05;
      sprayPos[idx * 3 + 2] = wz + (Math.random() - 0.5) * 0.16;
      sprayVel[idx * 3]     = Math.cos(ang) * spd + dirX * 0.85;
      sprayVel[idx * 3 + 1] = (0.85 + Math.random() * 1.55) * energy;
      sprayVel[idx * 3 + 2] = Math.sin(ang) * spd + dirZ * 0.85;
      const maxL = 0.42 + Math.random() * 0.48;
      sprayMaxLife[idx] = maxL;
      sprayLife[idx] = 1.0;
      spraySize[idx] = (0.75 + Math.random() * 1.35) * (0.75 + energy * 0.30);
    }
  }

  function updateSpray(dt) {
    const step = Math.min(dt, 0.05);
    let anyActive = false;
    for (let i = 0; i < MAX_SPRAY; i++) {
      if (sprayLife[i] <= 0.0) continue;
      anyActive = true;
      sprayLife[i] = Math.max(0.0, sprayLife[i] - step / sprayMaxLife[i]);
      sprayVel[i * 3]     *= (1.0 - step * 0.65);
      sprayVel[i * 3 + 1] -= 6.4 * step;
      sprayVel[i * 3 + 2] *= (1.0 - step * 0.65);
      sprayPos[i * 3]     += sprayVel[i * 3] * step;
      sprayPos[i * 3 + 1] += sprayVel[i * 3 + 1] * step;
      sprayPos[i * 3 + 2] += sprayVel[i * 3 + 2] * step;
      if (sprayPos[i * 3 + 1] < WATER_LEVEL - 0.02) {
        sprayLife[i] = 0.0;
        sprayPos[i * 3 + 1] = -99.0;
      }
    }
    if (anyActive) {
      sprayGeo.attributes.position.needsUpdate = true;
      sprayGeo.attributes.aLife.needsUpdate = true;
      sprayGeo.attributes.aSize.needsUpdate = true;
    }
  }

  const lookDir = new THREE.Vector3();
  const targetPt = new THREE.Vector3();
  let reflFrame = 0;

  mesh.update = (renderer, scene, camera, dt) => {
    material.uniforms.uTime.value += dt;
    updateSpray(dt);
    if ((reflFrame++ & 1) !== 0) return;
    reflectCam.copy(camera);
    reflectCam.position.y = 2.0 * WATER_LEVEL - camera.position.y;
    camera.getWorldDirection(lookDir);
    lookDir.y = -lookDir.y;
    targetPt.copy(reflectCam.position).add(lookDir);
    reflectCam.up.set(0, 1, 0);
    reflectCam.lookAt(targetPt);
    reflectCam.updateMatrixWorld();

    mesh.visible = false;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(reflectTarget);
    renderer.clear();
    renderer.render(scene, reflectCam);
    renderer.setRenderTarget(prevTarget);
    mesh.visible = true;
  };

  return { mesh, material, reflectTarget, spawnSpray };
}

export { createSkyDome, createDesertTerrain, createOasisWater };
