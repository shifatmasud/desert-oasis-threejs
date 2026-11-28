import * as THREE from 'three';
import { clamp, REAL_SCANS, getTerrainHeight, createRng } from './assets.js';

function createPalmGrove(sunDir) {
  const group = new THREE.Group();
  const windUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDir.clone() },
    uSssColor: { value: new THREE.Color('#e8bc42') },
    uSssStrength: { value: 1.72 },
    uWindAmp: { value: 0.16 },
  };

  // 100% 3D-Modeled Palm Frond Material (ZERO alpha cut — pure opaque 3D leaflets + early-Z!)
  const frondMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalScale: new THREE.Vector2(0.45, 0.45),
    side: THREE.DoubleSide,
    roughness: 0.56,
    metalness: 0.02,
  });
  frondMaterial.customProgramCacheKey = () => 'oasis-instanced-frond-sss-v8';
  frondMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uSunDir = windUniforms.uSunDir;
    shader.uniforms.uSssColor = windUniforms.uSssColor;
    shader.uniforms.uSssStrength = windUniforms.uSssStrength;
    shader.uniforms.uWindAmp = windUniforms.uWindAmp;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWindAmp;\nvarying vec2 vLeafUv;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;')
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vLeafUv = uv;
        vec4 instPos = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          instPos = instanceMatrix * instPos;
        #endif
        vec3 wOrig = (modelMatrix * instPos).xyz;
        float phase = dot(wOrig.xz, vec2(0.7, 0.5)) + wOrig.y * 0.35;
        float bend = uv.y * uv.y;
        float gust = sin(uTime * 1.35 + phase) * 0.65 + sin(uTime * 2.6 + phase * 1.8) * 0.35;
        transformed.y += gust * uWindAmp * 0.72 * bend;
        transformed.x += sin(uTime * 1.05 + phase) * uWindAmp * 0.35 * bend;
      `)
      .replace('#include <worldpos_vertex>', /* glsl */ `
        #include <worldpos_vertex>
        vec4 lPos = vec4(transformed, 1.0);
        vec3 lNorm = objectNormal;
        #ifdef USE_INSTANCING
          lPos = instanceMatrix * lPos;
          lNorm = mat3(instanceMatrix) * lNorm;
        #endif
        vWorldPos = (modelMatrix * lPos).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * lNorm);
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSssColor;\nuniform float uSssStrength;\nvarying vec2 vLeafUv;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;')
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 n = normalize(vWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);
          float backScatter = pow(clamp(dot(viewDir, -uSunDir), 0.0, 1.0), 1.9);
          float rimFactor = pow(1.0 - abs(dot(n, viewDir)), 1.6);
          float sunWrap = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
          float tipMask = smoothstep(0.12, 0.96, vLeafUv.y);
          float edgeMask = smoothstep(0.15, 0.48, abs(vLeafUv.x - 0.5));
          float sss = (backScatter * 0.90 + rimFactor * sunWrap * 0.90 + 0.08) * (tipMask * 0.72 + edgeMask * 0.45) * uSssStrength;
          float crownAO = smoothstep(0.04, 0.36, vLeafUv.y);
          diffuseColor.rgb *= mix(0.52, 1.0, crownAO);
          totalEmissiveRadiance += uSssColor * diffuseColor.rgb * sss * 2.15 * crownAO + uSssColor * sss * 0.08 * crownAO;
        }
      `);
  };

  const trunkMat = new THREE.MeshStandardMaterial({
    map: REAL_SCANS.barkDiff,
    normalMap: REAL_SCANS.barkNor,
    normalScale: new THREE.Vector2(3.3, 3.3),
    color: new THREE.Color('#86583a'),
    emissive: new THREE.Color('#281509'),
    emissiveIntensity: 0.14,
    roughness: 0.86,
  });
  trunkMat.customProgramCacheKey = () => 'oasis-bark-sunrim-v8';
  trunkMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: sunDir.clone() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBarkWorldPos;\nvarying vec3 vBarkWorldNorm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBarkWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBarkWorldNorm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nvarying vec3 vBarkWorldPos;\nvarying vec3 vBarkWorldNorm;')
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        vec3 bV = normalize(cameraPosition - vBarkWorldPos);
        vec3 bN = normalize(vBarkWorldNorm);
        float ringBand = 0.62 + 0.38 * sin(vBarkWorldPos.y * 24.0 + sin(vBarkWorldPos.x * 6.0) * 0.9);
        diffuseColor.rgb *= ringBand;
        float bTightRim = pow(1.0 - clamp(dot(bN, bV), 0.0, 1.0), 2.5) * smoothstep(-0.05, 0.70, dot(bN, uSunDir));
        totalEmissiveRadiance += vec3(0.98, 0.60, 0.26) * bTightRim * 0.85;
      `);
  };

  function createFrondGeo() {
    const positions = [], uvs = [], colors = [], indices = [];
    const rng = createRng(51231);
    const baseLength = 3.85;
    const rachisSegs = 16;

    function rachisPos(t) {
      const z = t * baseLength;
      const y = Math.sin(t * Math.PI * 0.80) * 0.92 - Math.pow(t, 2.20) * 1.22;
      return [0.0, y, z];
    }
    function rachisTangent(t) {
      const dt = 0.01;
      const a = rachisPos(Math.max(0, t - dt));
      const b = rachisPos(Math.min(1, t + dt));
      const dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dy, dz) || 1;
      return [0.0, dy / len, dz / len];
    }

    const rBaseIdx = positions.length / 3;
    for (let i = 0; i <= rachisSegs; i++) {
      const t = i / rachisSegs;
      const [rx, ry, rz] = rachisPos(t);
      const rad = (1.0 - t * 0.84) * 0.036 + 0.005;
      const cr = THREE.MathUtils.lerp(0.38, 0.56, t);
      const cg = THREE.MathUtils.lerp(0.28, 0.46, t);
      const cb = THREE.MathUtils.lerp(0.11, 0.16, t);
      const ring = [
        [rx,       ry + rad * 0.85, rz],
        [rx - rad, ry - rad * 0.65, rz],
        [rx + rad, ry - rad * 0.65, rz],
      ];
      for (let k = 0; k < 3; k++) {
        positions.push(ring[k][0], ring[k][1], ring[k][2]);
        uvs.push(0.5, t);
        colors.push(cr, cg, cb);
      }
      if (i < rachisSegs) {
        const a = rBaseIdx + i * 3, b = a + 3;
        indices.push(a, b, a+1,  a+1, b, b+1);
        indices.push(a+1, b+1, a+2,  a+2, b+1, b+2);
        indices.push(a+2, b+2, a,  a, b+2, b);
      }
    }

    const pairs = 36, leafSegs = 3;
    const colBase = new THREE.Color('#1a2b18');
    const colMid  = new THREE.Color('#3c5426');
    const colTip  = new THREE.Color('#7a8c3c');
    const tmpCol  = new THREE.Color();

    for (let i = 0; i < pairs; i++) {
      const t = 0.09 + (i / (pairs - 1)) * 0.89;
      const [rx, ry, rz] = rachisPos(t);
      const [, ty, tz] = rachisTangent(t);
      const env = Math.sin(Math.pow((t - 0.06) / 0.94, 0.72) * Math.PI);
      const baseLen = (0.28 + env * 0.84) * (0.90 + rng() * 0.20);
      const baseW   = (0.052 + env * 0.058) * (0.92 + rng() * 0.16);
      const frondTwist = Math.pow(t, 1.5) * 0.30;

      for (const side of [-1, 1]) {
        const vStart = positions.length / 3;
        const len = baseLen * (0.92 + rng() * 0.16);
        const sweepFwd = 0.34 + t * 0.42 + (rng() - 0.5) * 0.12;
        const liftUp   = 0.24 * (1.0 - t * 0.45) + (rng() - 0.5) * 0.14;
        const droopAmt = (0.26 + env * 0.48) * (0.85 + rng() * 0.30);
        const shadeVar = 0.84 + rng() * 0.32;

        const dirX = side * Math.cos(sweepFwd);
        const dirZ = Math.sin(sweepFwd) * tz;
        const dirY = liftUp + Math.sin(sweepFwd) * ty - side * frondTwist * 0.35;

        for (let s = 0; s <= leafSegs; s++) {
          const f = s / leafSegs;
          const dist = f * len;
          const px = rx + dirX * dist;
          const py = ry + dirY * dist - Math.pow(f, 1.95) * droopAmt * len;
          const pz = rz + dirZ * dist;
          const w = baseW * (f < 0.25 ? (0.55 + (f / 0.25) * 0.45) : Math.pow(1.0 - (f - 0.25) / 0.75, 0.72));
          const vCrest = w * 0.32;

          tmpCol.copy(colBase).lerp(colMid, Math.min(f * 1.4, 1.0)).lerp(colTip, Math.max(0, (f - 0.45) / 0.55));
          const rC = Math.min(1, tmpCol.r * shadeVar);
          const gC = Math.min(1, tmpCol.g * shadeVar);
          const bC = Math.min(1, tmpCol.b * shadeVar);

          if (s < leafSegs) {
            const perpZ = 0.85, perpX = -side * 0.35;
            positions.push(
              px - perpX * w, py - vCrest, pz - perpZ * w,
              px,             py + vCrest, pz,
              px + perpX * w, py - vCrest, pz + perpZ * w
            );
            const uEdge = side < 0 ? 0.5 - f * 0.48 : 0.5 + f * 0.48;
            uvs.push(uEdge, t,  uEdge, t,  uEdge, t);
            colors.push(rC*0.92, gC*0.92, bC*0.92,  rC*1.08, gC*1.08, bC*1.08,  rC*0.92, gC*0.92, bC*0.92);
          } else {
            positions.push(px, py, pz);
            const uEdge = side < 0 ? 0.02 : 0.98;
            uvs.push(uEdge, t);
            colors.push(rC*1.12, gC*1.12, bC*1.12);
          }
        }

        for (let s = 0; s < leafSegs - 1; s++) {
          const r0 = vStart + s * 3, r1 = r0 + 3;
          indices.push(r0, r1, r0+1,  r0+1, r1, r1+1);
          indices.push(r0+1, r1+1, r0+2,  r0+2, r1+1, r1+2);
        }
        const rLast = vStart + (leafSegs - 1) * 3, tipV = rLast + 3;
        indices.push(rLast, tipV, rLast+1,  rLast+1, tipV, rLast+2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function buildTrunkGeometry(spec, groundY) {
    const h = spec.h;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(spec.x, groundY - 0.3, spec.z),
      new THREE.Vector3(spec.x + spec.arcX * 0.20, groundY + h * 0.32, spec.z + spec.arcZ * 0.25),
      new THREE.Vector3(spec.x + spec.arcX * 0.58, groundY + h * 0.66, spec.z + spec.arcZ * 0.64),
      new THREE.Vector3(spec.x + spec.arcX,        groundY + h,        spec.z + spec.arcZ),
    ]);

    const lengthSegs = 28, radialSegs = 10;
    const points = curve.getPoints(lengthSegs);
    const tangents = points.map((_, i) => curve.getTangent(i / lengthSegs).normalize());
    const normals = [], binormals = [];
    const refUp = Math.abs(tangents[0].x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    normals[0] = new THREE.Vector3().crossVectors(tangents[0], refUp).normalize();
    binormals[0] = new THREE.Vector3().crossVectors(tangents[0], normals[0]).normalize();
    const rotAxis = new THREE.Vector3();
    for (let i = 1; i <= lengthSegs; i++) {
      normals[i] = normals[i - 1].clone();
      rotAxis.crossVectors(tangents[i - 1], tangents[i]);
      if (rotAxis.length() > 1e-5) {
        rotAxis.normalize();
        normals[i].applyAxisAngle(rotAxis, Math.acos(clamp(tangents[i - 1].dot(tangents[i]), -1, 1)));
      }
      normals[i].sub(tangents[i].clone().multiplyScalar(normals[i].dot(tangents[i]))).normalize();
      binormals[i] = new THREE.Vector3().crossVectors(tangents[i], normals[i]).normalize();
    }

    const baseR = spec.baseR, topR = spec.topR;
    const positions = [], uvs = [], indices = [];
    for (let i = 0; i <= lengthSegs; i++) {
      const t = i / lengthSegs;
      const p = points[i], n = normals[i], b = binormals[i];
      const r = THREE.MathUtils.lerp(baseR, topR, Math.pow(t, 0.72)) + Math.exp(-t * 14.0) * baseR * 0.65 + Math.sin(t * 58.0) * 0.008;
      for (let j = 0; j <= radialSegs; j++) {
        const u = j / radialSegs, th = u * Math.PI * 2;
        const cT = Math.cos(th), sT = Math.sin(th);
        positions.push(p.x + (n.x * cT + b.x * sT) * r, p.y + (n.y * cT + b.y * sT) * r, p.z + (n.z * cT + b.z * sT) * r);
        uvs.push(u, t * (h / 1.7));
      }
    }
    const stride = radialSegs + 1;
    for (let i = 0; i < lengthSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { geo, topPoint: points[lengthSegs].clone(), topTangent: tangents[lengthSegs].clone() };
  }

  const PALM_SPECS = [
    { x: -6.55, z: 10.6, h: 6.2, arcX:  1.15, arcZ: -0.35, baseR: 0.24, topR: 0.11, frondScale: 0.84, count: 36, hero: true },
    { x:  6.55, z: 10.4, h: 6.3, arcX: -1.15, arcZ: -0.30, baseR: 0.24, topR: 0.11, frondScale: 0.82, count: 36, hero: true },
    { x: -12.6, z:  3.2, h: 4.1, arcX: 0.95, arcZ: 0.25, baseR: 0.23, topR: 0.11, frondScale: 0.66, count: 24, hero: false },
    { x: -10.6, z: -1.8, h: 5.1, arcX: 1.25, arcZ: 0.35, baseR: 0.25, topR: 0.12, frondScale: 0.74, count: 26, hero: false },
    { x:  -8.4, z: -6.4, h: 3.3, arcX: 0.72, arcZ: 0.30, baseR: 0.20, topR: 0.09, frondScale: 0.60, count: 22, hero: false },
    { x:  -6.4, z: -8.6, h: 4.5, arcX: 0.95, arcZ: 0.40, baseR: 0.23, topR: 0.11, frondScale: 0.68, count: 24, hero: false },
    { x:   6.6, z: -8.4, h: 4.5, arcX: -1.00, arcZ: 0.38, baseR: 0.23, topR: 0.11, frondScale: 0.68, count: 24, hero: false },
    { x:   8.8, z: -6.2, h: 3.5, arcX: -0.75, arcZ: 0.30, baseR: 0.20, topR: 0.09, frondScale: 0.62, count: 22, hero: false },
    { x:  10.8, z: -1.8, h: 4.9, arcX: -1.20, arcZ: 0.25, baseR: 0.25, topR: 0.12, frondScale: 0.72, count: 26, hero: false },
    { x:  12.4, z:  3.6, h: 4.2, arcX: -1.05, arcZ: -0.15, baseR: 0.23, topR: 0.11, frondScale: 0.66, count: 24, hero: false },
  ];

  const frondMatrices = [];
  const dummy = new THREE.Object3D();
  const alignQuat = new THREE.Quaternion();
  const localQuat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  PALM_SPECS.forEach((spec, idx) => {
    const rng = createRng(4001 + idx * 977);
    const groundY = getTerrainHeight(spec.x, spec.z);
    const { geo, topPoint, topTangent } = buildTrunkGeometry(spec, groundY);
    const trunkMesh = new THREE.Mesh(geo, trunkMat);
    trunkMesh.castShadow = spec.hero;
    trunkMesh.receiveShadow = true;
    group.add(trunkMesh);

    alignQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), topTangent);

    const crownBulbGeo = new THREE.SphereGeometry(spec.topR * 2.05, 10, 8);
    crownBulbGeo.scale(1.0, 1.45, 1.0);
    const crownBulb = new THREE.Mesh(crownBulbGeo, trunkMat);
    crownBulb.position.copy(topPoint).addScaledVector(topTangent, 0.08);
    crownBulb.quaternion.copy(alignQuat);
    group.add(crownBulb);

    const GOLDEN_ANGLE = 2.39996323;
    const totalF = spec.count;
    const basePhase = rng() * Math.PI * 2;
    for (let k = 0; k < totalF; k++) {
      const frac = k / (totalF - 1);
      const yaw = basePhase + k * GOLDEN_ANGLE + (rng() - 0.5) * 0.14;
      const pitch = THREE.MathUtils.lerp(-0.98, 0.44, Math.pow(frac, 0.85)) + (rng() - 0.5) * 0.14;
      const roll = (rng() - 0.5) * 0.36;
      const yOff = THREE.MathUtils.lerp(0.38, -0.14, frac);
      const stageScale = frac < 0.22 ? THREE.MathUtils.lerp(0.62, 0.92, frac / 0.22) : THREE.MathUtils.lerp(1.06, 0.94, (frac - 0.22) / 0.78);

      euler.set(pitch, yaw, roll);
      localQuat.setFromEuler(euler);

      dummy.position.copy(topPoint).addScaledVector(topTangent, yOff);
      dummy.quaternion.copy(alignQuat).multiply(localQuat);
      dummy.scale.setScalar(spec.frondScale * stageScale * (0.90 + rng() * 0.22));
      dummy.updateMatrix();
      frondMatrices.push(dummy.matrix.clone());
    }
  });

  const frondInst = new THREE.InstancedMesh(createFrondGeo(), frondMaterial, frondMatrices.length);
  frondMatrices.forEach((m, i) => frondInst.setMatrixAt(i, m));
  frondInst.instanceMatrix.needsUpdate = true;
  frondInst.castShadow = false;
  frondInst.receiveShadow = true;
  group.add(frondInst);

  return {
    group,
    windUniforms,
    update: (time) => { windUniforms.uTime.value = time; },
  };
}

export { createPalmGrove };
