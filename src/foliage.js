import * as THREE from 'three';
import { SUN_DIRECTION, REAL_SCANS, REAL_3D_PLANT_URLS, loadRealScanTex, getTerrainHeight, getBasinSignedDistance, createRng, makeCanvasTex } from './assets.js';

function createPaintedFlowerSprigTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const blooms = [
    { x: 256, y: 155, r: 74 },
    { x: 152, y: 228, r: 64 },
    { x: 362, y: 222, r: 66 },
    { x: 218, y: 306, r: 58 },
    { x: 312, y: 318, r: 54 },
    { x: 112, y: 315, r: 46 },
    { x: 396, y: 308, r: 48 },
  ];
  ctx.strokeStyle = 'rgba(210, 195, 175, 0.72)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  blooms.forEach((b) => {
    ctx.beginPath();
    ctx.moveTo(256, 470);
    ctx.quadraticCurveTo((256 + b.x) * 0.5, (470 + b.y) * 0.5 + 16, b.x, b.y);
    ctx.stroke();
  });

  blooms.forEach((b, bi) => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(bi * 0.65);
    for (let p = 0; p < 5; p++) {
      const ang = (p / 5) * Math.PI * 2;
      ctx.save();
      ctx.rotate(ang);
      const grad = ctx.createRadialGradient(0, -b.r * 0.32, 3, 0, -b.r * 0.45, b.r * 0.72);
      grad.addColorStop(0.0, '#6e4c48');
      grad.addColorStop(0.35, '#d8b6aa');
      grad.addColorStop(0.78, '#f8e8dc');
      grad.addColorStop(1.0, '#fffaf2');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, -b.r * 0.44, b.r * 0.34, b.r * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const cGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, b.r * 0.24);
    cGrad.addColorStop(0.0, '#fff4b8');
    cGrad.addColorStop(0.7, '#e8a838');
    cGrad.addColorStop(1.0, 'rgba(180, 110, 30, 0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  return makeCanvasTex(canvas, true, 1, 1);
}

function createArchingVioletSprayTexture() {
  const size = 256;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = createRng(6619);
  ctx.clearRect(0, 0, size, size);

  for (const [sx, endX, ctrlX] of [[126, 56, 78], [130, 198, 176]]) {
    ctx.strokeStyle = '#2d4716';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(sx, size * 0.96);
    ctx.quadraticCurveTo(ctrlX, size * 0.56, endX, size * 0.18);
    ctx.stroke();

    for (let i = 0; i < 14; i++) {
      const t = i / 13, u = 1 - t;
      const fx = u * u * sx + 2 * u * t * ctrlX + t * t * endX + (rng() - 0.5) * 16;
      const fy = u * u * (size * 0.90) + 2 * u * t * (size * 0.54) + t * t * (size * 0.18) + (rng() - 0.5) * 10;
      const r = (7.2 + rng() * 5.2) * (1.0 - t * 0.35);
      for (let p = 0; p < 4; p++) {
        const a = rng() * 0.6 + (p / 4) * Math.PI * 2;
        const px = fx + Math.cos(a) * r, py = fy + Math.sin(a) * r;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo((fx + px) * 0.5 - Math.sin(a) * r * 0.44, (fy + py) * 0.5 + Math.cos(a) * r * 0.44, px, py);
        ctx.quadraticCurveTo((fx + px) * 0.5 + Math.sin(a) * r * 0.44, (fy + py) * 0.5 - Math.cos(a) * r * 0.44, fx, fy);
        ctx.fillStyle = p % 2 === 0 ? '#a47ce8' : '#6c42b2';
        ctx.fill();
      }
    }
  }
  return makeCanvasTex(canvas, true, 1, 1);
}

function createOasisFoliage(realGeos) {
  const group = new THREE.Group();
  const rng = createRng(88421);
  const { fernGeo, calaGeo, flowGeo } = realGeos;

  // Shared botanical SSS shader program (single cache key -> fewer shader compiles on Adreno 5xx)
  function attachBotanicalSSS(mat, sunDirVec, sssHex, strength, _key) {
    mat.customProgramCacheKey = () => 'oasis-bot-sss-shared-v51';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: sunDirVec.clone() };
      shader.uniforms.uSssCol = { value: new THREE.Color(sssHex) };
      shader.uniforms.uSssAmt = { value: strength };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBotWorldPos;\nvarying vec3 vBotWorldNorm;\nvarying float vBotLocalY;')
        .replace('#include <worldpos_vertex>', /* glsl */ `
          #include <worldpos_vertex>
          vBotLocalY = clamp(position.y, 0.0, 1.6);
          #ifdef USE_INSTANCING
            vBotWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
            vBotWorldNorm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          #else
            vBotWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vBotWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
          #endif
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSssCol;\nuniform float uSssAmt;\nvarying vec3 vBotWorldPos;\nvarying vec3 vBotWorldNorm;\nvarying float vBotLocalY;')
        .replace('#include <emissivemap_fragment>', /* glsl */ `
          #include <emissivemap_fragment>
          vec3 bV = normalize(cameraPosition - vBotWorldPos);
          vec3 bN = normalize(vBotWorldNorm) * (gl_FrontFacing ? 1.0 : -1.0);
          float hAO = mix(0.46, 1.0, smoothstep(0.02, 0.62, vBotLocalY));
          diffuseColor.rgb *= hAO;
          float wrapL = clamp(dot(bN, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
          float backL = pow(clamp(dot(bV, -uSunDir), 0.0, 1.0), 3.0) * (0.28 + 0.72 * wrapL);
          float rimL  = pow(1.0 - abs(dot(bN, bV)), 2.8) * smoothstep(0.28, 0.90, wrapL);
          totalEmissiveRadiance += uSssCol * diffuseColor.rgb * (backL * 0.75 + rimL * 0.28 + wrapL * 0.06) * uSssAmt * hAO;
        `);
    };
  }

  const realFernMat = new THREE.MeshStandardMaterial({
    color: 0x5d7d3e,
    roughness: 0.74,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#0c1706'),
    emissiveIntensity: 0.04,
  });
  const realCalaMat = new THREE.MeshStandardMaterial({
    color: 0x527239,
    roughness: 0.68,
    metalness: 0.0,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#0a1506'),
    emissiveIntensity: 0.04,
  });
  const realFlowMat = new THREE.MeshStandardMaterial({
    color: 0x8e8344,
    roughness: 0.72,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#141808'),
    emissiveIntensity: 0.05,
  });

  const flowerTex = createPaintedFlowerSprigTexture();
  const violetTex = createArchingVioletSprayTexture();
  const flowerMat = new THREE.MeshStandardMaterial({
    map: flowerTex, alphaTest: 0.28, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.62,
    emissive: new THREE.Color('#1c1214'), emissiveIntensity: 0.08,
  });
  const violetMat = new THREE.MeshStandardMaterial({
    map: violetTex, alphaTest: 0.28, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.56,
    emissive: new THREE.Color('#2a124d'), emissiveIntensity: 0.14,
  });

  function createCrossCardGeo(w, h) {
    const hw = w * 0.5;
    const pos = [-hw,0,0, hw,0,0, hw,h,0, -hw,h,0,  0,0,-hw, 0,0,hw, 0,h,hw, 0,h,-hw];
    const uvs = [0,0, 1,0, 1,1, 0,1,  0,0, 1,0, 1,1, 0,1];
    const idx = [0,1,2, 0,2,3,  4,5,6, 4,6,7];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  const fernM = [], fernC = [];
  const calaM = [], calaC = [];
  const flowM = [], flowC = [];
  const flw2M = [], flw2C = [];
  const violM = [], violC = [];
  const dummy = new THREE.Object3D();

  const FOLIAGE_TINTS = [
    new THREE.Color('#88a258'),
    new THREE.Color('#adc674'),
    new THREE.Color('#cce088'),
    new THREE.Color('#6a8244'),
  ];
  const BLOOM_TINTS = [
    new THREE.Color('#c24838'),
    new THREE.Color('#dc7f3e'),
    new THREE.Color('#b64c78'),
    new THREE.Color('#7a56b8'),
    new THREE.Color('#cc5c3e'),
  ];
  const VIOLET_TINTS = [new THREE.Color('#c8a4ff'), new THREE.Color('#a87ef0'), new THREE.Color('#d6b8ff')];

  function placeGardenCluster(x, z, scaleBoost, isFG) {
    const y = getTerrainHeight(x, z);
    for (let k = 0; k < 2; k++) {
      dummy.position.set(x + (rng() - 0.5) * 1.0, y - 0.08, z + (rng() - 0.5) * 1.0);
      dummy.rotation.set((rng() - 0.5) * 0.14, rng() * Math.PI * 2, (rng() - 0.5) * 0.14);
      const sc = (isFG ? 1.08 + rng() * 0.42 : 0.92 + rng() * 0.40) * scaleBoost;
      dummy.scale.set(sc, sc * 0.90, sc);
      dummy.updateMatrix();
      calaM.push(dummy.matrix.clone());
      calaC.push(FOLIAGE_TINTS[Math.floor(rng() * FOLIAGE_TINTS.length)]);
    }
    if (isFG || rng() < 0.70) {
      dummy.position.set(x + (rng() - 0.5) * 0.85, y - 0.05, z + (rng() - 0.5) * 0.85);
      dummy.rotation.set((rng() - 0.5) * 0.16, rng() * Math.PI * 2, (rng() - 0.5) * 0.16);
      const sf = (isFG ? 1.25 + rng() * 0.45 : 0.95 + rng() * 0.40) * scaleBoost;
      dummy.scale.set(sf * 1.12, sf * 0.92, sf * 1.12);
      dummy.updateMatrix();
      fernM.push(dummy.matrix.clone());
      fernC.push(FOLIAGE_TINTS[Math.floor(rng() * 3)]);
    }
    if (rng() < (isFG ? 0.88 : 0.72)) {
      dummy.position.set(x + (rng() - 0.5) * 0.95, y + 0.38 + rng() * 0.28 * scaleBoost, z + (rng() - 0.5) * 0.95);
      dummy.rotation.set((rng() - 0.5) * 0.22, rng() * Math.PI * 2, (rng() - 0.5) * 0.22);
      dummy.scale.setScalar((isFG ? 1.15 + rng() * 0.40 : 0.95 + rng() * 0.35) * scaleBoost);
      dummy.updateMatrix();
      flowM.push(dummy.matrix.clone());
      flowC.push(new THREE.Color('#b6d478'));
    }
    const nFlw = isFG ? 5 : 3;
    for (let f = 0; f < nFlw; f++) {
      dummy.position.set(x + (rng() - 0.5) * 1.1, y + 0.36 + rng() * 0.46 * scaleBoost, z + (rng() - 0.5) * 1.1);
      dummy.rotation.set((rng() - 0.5) * 0.30, rng() * Math.PI * 2, (rng() - 0.5) * 0.30);
      dummy.scale.setScalar((isFG ? 0.72 + rng() * 0.30 : 0.64 + rng() * 0.28) * scaleBoost);
      dummy.updateMatrix();
      flw2M.push(dummy.matrix.clone());
      flw2C.push(BLOOM_TINTS[Math.floor(rng() * BLOOM_TINTS.length)]);
    }
    if (rng() < (isFG ? 0.82 : 0.62)) {
      const nv = isFG ? 2 : 1;
      for (let v = 0; v < nv; v++) {
        dummy.position.set(x + (rng() - 0.5) * 1.0, y + 0.34 + rng() * 0.40 * scaleBoost, z + (rng() - 0.5) * 1.0);
        dummy.rotation.set((rng() - 0.5) * 0.40, rng() * Math.PI * 2, (rng() - 0.5) * 0.40);
        dummy.scale.setScalar((0.88 + rng() * 0.38) * scaleBoost);
        dummy.updateMatrix();
        violM.push(dummy.matrix.clone());
        violC.push(VIOLET_TINTS[Math.floor(rng() * VIOLET_TINTS.length)]);
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    const bx = 3.8 + i * 0.65, bz = 13.0 + (i % 2) * 0.45;
    dummy.position.set(bx, getTerrainHeight(bx, bz) - 0.05, bz);
    dummy.rotation.set(0.05, i * 1.4, 0.04);
    dummy.scale.set(1.05, 1.08, 1.05);
    dummy.updateMatrix();
    calaM.push(dummy.matrix.clone());
    calaC.push(new THREE.Color('#92b45c'));
  }

  const leftArc  = Array.from({ length: 28 }, (_, i) => Math.PI * 0.58 + (i / 27) * Math.PI * 0.76);
  const rightArc = Array.from({ length: 28 }, (_, i) => -Math.PI * 0.34 + (i / 27) * Math.PI * 0.76);
  for (const list of [leftArc, rightArc]) {
    list.forEach((ang) => {
      for (const rMul of [1.03, 1.22]) {
        const x = Math.cos(ang) * 11.0 * rMul + (rng() - 0.5) * 0.75;
        const z = Math.sin(ang) * 8.8 * rMul + 2.0 + (rng() - 0.5) * 0.75;
        if (Math.abs(x) < 3.9 && z < -4.5) continue;
        if (Math.abs(x) < 4.0 && z > 9.8) continue;
        if (x > 6.2 && x < 12.6 && z > 0.6 && z < 7.6) continue;
        if (getBasinSignedDistance(x, z) < 0.18) continue;
        placeGardenCluster(x, z, 1.02 + rng() * 0.32, false);
      }
    });
  }

  const fgSpots = [
    [-6.4, 11.8, 1.15], [-5.2, 12.8, 1.18], [-4.6, 13.8, 1.05], [-6.2, 14.2, 1.18], [-7.4, 13.0, 1.20], [-8.0, 11.0, 1.12],
    [ 6.4, 11.8, 1.15], [ 5.2, 12.8, 1.18], [ 4.6, 13.8, 1.05], [ 6.2, 14.2, 1.18], [ 7.4, 13.0, 1.20], [ 8.0, 11.0, 1.12],
    [-7.8, 3.6, 0.96], [-7.4, 5.0, 0.92],
  ];
  fgSpots.forEach(([fx, fz, sc]) => placeGardenCluster(fx, fz, sc, true));

  function buildInstanced(geo, mat, matrices, colors) {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  attachBotanicalSSS(realFernMat, SUN_DIRECTION, '#c8be54', 0.36, 'bot-sss-fern');
  attachBotanicalSSS(realCalaMat, SUN_DIRECTION, '#b2b84a', 0.30, 'bot-sss-cala');
  attachBotanicalSSS(realFlowMat, SUN_DIRECTION, '#c8b252', 0.28, 'bot-sss-flow');
  group.add(buildInstanced(fernGeo, realFernMat, fernM, fernC));
  group.add(buildInstanced(calaGeo, realCalaMat, calaM, calaC));
  group.add(buildInstanced(flowGeo, realFlowMat, flowM, flowC));

  function build3DSwordFernBush(cx, cz) {
    const positions = [], uvs = [], colors = [], indices = [];
    const fRng = createRng(33109);
    const colCore = new THREE.Color('#102008');
    const colMid  = new THREE.Color('#2d4d16');
    const colTip  = new THREE.Color('#6a842e');
    const tmp = new THREE.Color();

    const frondCount = 11;
    for (let f = 0; f < frondCount; f++) {
      const yaw = -0.95 + (f / (frondCount - 1)) * 2.15 + (fRng() - 0.5) * 0.16;
      const elev = 0.22 + (f % 3) * 0.16 + fRng() * 0.10;
      const fLen = 1.45 + (f % 2) * 0.45 + fRng() * 0.25;
      const cY = Math.cos(yaw), sY = Math.sin(yaw);

      const pairs = 24;
      for (let i = 0; i < pairs; i++) {
        const t = 0.10 + (i / (pairs - 1)) * 0.88;
        const d = t * fLen;
        const archY = Math.sin(t * Math.PI * 0.78) * (0.42 + elev * 0.55) - Math.pow(t, 2.2) * 0.45;
        const rx = sY * d, ry = archY, rz = cY * d;
        const env = Math.sin(Math.pow(t, 0.75) * Math.PI);
        const pLen = (0.06 + env * 0.24) * (0.9 + fRng() * 0.2);
        const pW   = 0.018 + env * 0.016;

        for (const side of [-1, 1]) {
          const v0 = positions.length / 3;
          const ox = cY * side, oz = -sY * side;
          const fx = sY * 0.35, fz = cY * 0.35;
          const bx = rx, by = ry, bz = rz;
          const mx = rx + (ox + fx) * pLen * 0.52, my = ry + 0.018, mz = rz + (oz + fz) * pLen * 0.52;
          const tx = rx + (ox + fx) * pLen,        ty = ry - 0.015, tz = rz + (oz + fz) * pLen;

          tmp.copy(colCore).lerp(colMid, Math.min(t * 1.3, 1.0)).lerp(colTip, Math.max(0, (t - 0.45) / 0.55));
          const sv = 0.85 + fRng() * 0.30;
          const cr = Math.min(1, tmp.r * sv), cg = Math.min(1, tmp.g * sv), cb = Math.min(1, tmp.b * sv);

          positions.push(
            bx - sY * pW, by, bz - cY * pW,
            bx + sY * pW, by, bz + cY * pW,
            mx - sY * pW * 0.7, my, mz - cY * pW * 0.7,
            mx + sY * pW * 0.7, my, mz + cY * pW * 0.7,
            tx, ty, tz
          );
          uvs.push(0.5,t, 0.5,t, 0.8,t, 0.8,t, 1.0,t);
          for (let k = 0; k < 5; k++) colors.push(cr, cg, cb);
          indices.push(v0, v0+2, v0+1,  v0+1, v0+2, v0+3,  v0+2, v0+4, v0+3);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide, roughness: 0.70, emissive: new THREE.Color('#101d07'), emissiveIntensity: 0.06,
    });
    attachBotanicalSSS(mat, SUN_DIRECTION, '#c8c452', 0.40, 'bot-sss-hero-fern');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, getTerrainHeight(cx, cz) + 0.04, cz);
    mesh.receiveShadow = true;
    return mesh;
  }

  function build3DAgaveRosette(cx, cz) {
    const positions = [], uvs = [], colors = [], indices = [];
    const aRng = createRng(44921);
    const colBase = new THREE.Color('#14280e');
    const colMid  = new THREE.Color('#2b4a1e');
    const colTip  = new THREE.Color('#6a8236');
    const tmp = new THREE.Color();
    const GOLDEN = 2.39996323;

    const blades = 24;
    for (let b = 0; b < blades; b++) {
      const frac = b / (blades - 1);
      const yaw = b * GOLDEN + (aRng() - 0.5) * 0.14;
      const pitch = THREE.MathUtils.lerp(1.18, 0.24, Math.pow(frac, 0.85));
      const len = THREE.MathUtils.lerp(0.85, 1.42, frac) * (0.9 + aRng() * 0.2);
      const maxW = 0.085 + frac * 0.045;
      const cY = Math.cos(yaw), sY = Math.sin(yaw);

      const vStart = positions.length / 3;
      const segs = 5;
      for (let s = 0; s <= segs; s++) {
        const f = s / segs;
        const d = f * len;
        const horiz = Math.cos(pitch) * d;
        const up = Math.sin(pitch) * d - Math.pow(f, 2.2) * 0.22 * len;
        const px = sY * horiz, py = up, pz = cY * horiz;
        const w = maxW * (f < 0.25 ? (0.65 + f * 1.4) : Math.pow(1.0 - (f - 0.25) / 0.75, 0.85));
        const vFold = w * 0.35;

        tmp.copy(colBase).lerp(colMid, Math.min(f * 1.3, 1.0)).lerp(colTip, Math.max(0, (f - 0.55) / 0.45));
        const cr = tmp.r, cg = tmp.g, cb = tmp.b;
        if (s < segs) {
          positions.push(
            px - cY * w, py + vFold, pz + sY * w,
            px,          py - vFold, pz,
            px + cY * w, py + vFold, pz - sY * w
          );
          uvs.push(0, f, 0.5, f, 1, f);
          colors.push(cr*1.08, cg*1.08, cb*1.08, cr*0.82, cg*0.82, cb*0.82, cr*1.08, cg*1.08, cb*1.08);
        } else {
          positions.push(px, py, pz);
          uvs.push(0.5, 1);
          colors.push(cr*1.15, cg*1.15, cb*1.15);
        }
      }
      for (let s = 0; s < segs - 1; s++) {
        const r0 = vStart + s * 3, r1 = r0 + 3;
        indices.push(r0, r1, r0+1, r0+1, r1, r1+1, r0+1, r1+1, r0+2, r0+2, r1+1, r1+2);
      }
      const rL = vStart + (segs - 1) * 3, tipV = rL + 3;
      indices.push(rL, tipV, rL+1, rL+1, tipV, rL+2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide, roughness: 0.58, metalness: 0.02,
      emissive: new THREE.Color('#0c1706'), emissiveIntensity: 0.05,
    });
    attachBotanicalSSS(mat, SUN_DIRECTION, '#a6ba4c', 0.32, 'bot-sss-hero-agave');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, getTerrainHeight(cx, cz) - 0.02, cz);
    mesh.receiveShadow = true;
    return mesh;
  }

  const heroFern1 = build3DSwordFernBush(-2.95, 12.6);
  heroFern1.position.y += 0.26;
  heroFern1.scale.setScalar(1.78);
  group.add(heroFern1);
  const heroFern2 = build3DSwordFernBush(-4.25, 11.7);
  heroFern2.position.y += 0.20;
  heroFern2.scale.setScalar(1.42);
  group.add(heroFern2);
  const heroAgave1 = build3DAgaveRosette(2.75, 12.5);
  heroAgave1.position.y += 0.14;
  heroAgave1.scale.setScalar(1.62);
  group.add(heroAgave1);
  const heroAgave2 = build3DAgaveRosette(4.05, 11.6);
  heroAgave2.position.y += 0.10;
  heroAgave2.scale.setScalar(1.36);
  group.add(heroAgave2);

  group.add(buildInstanced(createCrossCardGeo(0.95, 0.95), flowerMat, flw2M, flw2C));
  const leftVioletSpots = [
    [-4.6, 11.4, 1.18], [-3.8, 12.1, 1.12], [-5.2, 12.4, 1.22], [-4.2, 13.0, 1.08],
    [-5.6, 10.6, 1.16], [-3.3, 11.7, 0.96], [-4.9, 13.5, 1.15], [-6.1, 11.9, 1.20],
    [-3.9, 10.9, 1.02], [-5.4, 13.1, 1.12],
  ];
  const deepVioletCols = [new THREE.Color('#8a52e8'), new THREE.Color('#703cd0'), new THREE.Color('#a674ff')];
  leftVioletSpots.forEach(([vx, vz, vsc], vi) => {
    dummy.position.set(vx, getTerrainHeight(vx, vz) + 0.38, vz);
    dummy.rotation.set(0.08, vi * 1.15, 0.04);
    dummy.scale.setScalar(vsc);
    dummy.updateMatrix();
    violM.push(dummy.matrix.clone());
    violC.push(deepVioletCols[vi % deepVioletCols.length]);
    flw2M.push(dummy.matrix.clone());
    flw2C.push(deepVioletCols[(vi + 1) % deepVioletCols.length]);
  });
  group.add(buildInstanced(createCrossCardGeo(0.92, 1.18), violetMat, violM, violC));

  return { group };
}

export { createOasisFoliage };
