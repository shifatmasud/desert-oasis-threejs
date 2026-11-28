import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// =========================================================================
// 1. AEOLIAN BARCHAN GEOMETRY + REAL AWS TERRARIUM DEM + POLY HAVEN CC0
// =========================================================================
const SUN_DIRECTION = new THREE.Vector3(-0.85, 0.28, 0.44).normalize();
const WATER_LEVEL = 0.0;
const REAL_DEM_SIZE = 64;

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
function smax(a, b, k = 1.6) {
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

export const REAL_SCAN_URIS = {
  sandDiff:      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coast_sand_01/coast_sand_01_diff_1k.jpg',
  sandNor:       'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coast_sand_01/coast_sand_01_nor_gl_1k.jpg',
  sandRough:     'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coast_sand_01/coast_sand_01_rough_1k.jpg',
  duneRippleNor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_sand/aerial_sand_nor_gl_1k.jpg',
  barkDiff:      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/bark_brown_02/bark_brown_02_diff_1k.jpg',
  barkNor:       'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/bark_brown_02/bark_brown_02_nor_gl_1k.jpg',
};

function decodeB64Bytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const REAL_ERG_DEM = decodeB64Bytes("XVxZVFBOTUxPUEpEOCowNzc3OTo6ODQ0Nzo6Ojw/QD49Pj4+Pjs5NzY2Oj07PD9ANiYjJioqKywtNkBFRkJAQl1ZVFBOTUxISk5FOzEyOjo6Ojg4Ozo1NDc6Ojo8Pj8/Pz0+QEBAPjw5Nzg5OTo8PzkwLS0sKigqMTtGS0pEP0BcV1FOTElIREM9MTc8QD8+Pz46Oz07ODc4Ojs7Ojs9Pz47Oj5AQUA/PDk4NzQzNjo7NzAsKiosMjpBRUVCOjU8WVVQS0lHQkJALB8rOj07OTg5OTk5OTk5Ojs9PTo4Ozw6NzY5PD4+PTs7OzgxLzE1NjMvLjA0NzxCR0lBQkE7RFhTTUlHRT89OiYSER0tMy8vNDY0Mzc4ODo+Pz47Ojo6ODY1Njg7PDs7PD07NTM0NjY1ODk7QD9BR1JUTVFVUVNYVE9MR0Q/NjQnBwIQJy0uNT89NTQ3OTk6Pj06OTo6Ojg3NjY2OT0/PTg1ODs/QEBFTEs/Ozw+Pk5fWVRYVlVWVVZTTkdCOzI0LxEHFS0zND9JRj05OTs7Ojo2NDY4ODk4Nzc2NjtBQjsxLTM8SE9OVV5VPS0wNDxQW1lYV1BNUFdZV1BIQjs1NTUoHyUxPEJISkU7ODk7OTY0MjM1Nzc2NjY2ODs+QD84MS0vOUhPT1NUSzwzNjxEUFRZWVVRTU9aWVZTTUdDPTc2NS8sLTlERUE+OjQ1NjMxMzc4Nzg4NzY2ODw+Pjw8PTcwLDQ/Q0VGQjw8P0FISktSWFhXVVJSWVdSU1JNSEM8NzUtJiYsMDAxODw2NTMuLzc/QD48Ozs5ODo8Ozg4PUA4MC0vNjw9Pzo0NTc5QENFTVRYWlhWVlVTT09QTUlHQzs1LCQhHhsfJCwzODk1Ly44Q0lGQT8/OjY3NzUzNDc1NDMyLjE4PTw2MjAtLjU8QkxTWl5cW1tRTUlISEtPTkpBODMsIhcWHygtMzs5MzI1OkBGRD47OjQvLi8wMzIyNj1AOjEwOT88Ozo2MS0xPkJLWF9iY2FiUEpGRUJIUlNPRkNDOygbHCYuMjg4MS8zNzs/QDw2NDMtKSkoKi8wMj9MTj4tMTw/PUBCQDs1N0FGTlxiZWhlZFNMREJBREtOSkVITEUyJCEnKzA2MiwuNDY5PT00LiwsKigoJCUrLTJBUUs5KzQ+QEBAQ0REQ0NJUVhgZGhqaGRUTkA8QEFDQTs3PERHPy0kJSgsLy8uMDU3Nzg2LygnKSssKSUmKy0wP0o7NDQ4P0NCQEFDSE1RVl1lampsbmxpU0w/Ojw7PDowKC05RUUzJSQmKiwuMTQ2NTMyMCsnKC0yNDAsLTEyNTw/NjY6PUJFREFAQ0hOVVxia3FzcXFycVVQRTs0Mzg6NCssNj47LiMiJCYqLzQ5ODYxMC8qJigvNzo3NTQxMjU0LSc1Pj9CRUZGRklMUFdeZGtzdnR1dXVYU0o8Liw3QD0zLjExKSAdHx8cHzA3NTg3MzEwLSclKzM5OzkyLC0vKyUlNDw9P0RLTlBSWV5gY2dscnR0dXV1V1JKPTMzPkZANCsnJCAcHiAcGBwpLCs1Ojg5OTMvKioxO0I+MywsLCkpLzY3OT9IUFRYXWZraWhscHR0dHV1dVZTSkA9PkRFPjMoIx8hKC0oHyAoJCEsOT49Q0c5ODcxOEVLRzw0Ly4uLi8yNTpBSlJYXmVrbm1tcHV6enp5dnZcV0lCQ0REQjw1LCUjKTU3LygnKCkrNz86OkBJPDY7PEJLSkM7My4uMi4vMzk+Q0pRW2NnbHJ0dHV7gYKCgXt4YlpJQUVIRUI9NjAqKS41NzQwKyowNDc5NTg8PTs2OEVLRD03LyUiKS8kLzk+QkVJUFxma3N4enp7f4SHiIaBfFhOQkBFSktIQDcyLy4vMzY2MjAxNTc2NDU3OTU3OT9EQz03NC8lJCcsLjQ6QUZJTVNeaHB3e3t8fYCFiImHg4FDQUBER0lMSUA4MzAtLjM4NDEzNTc8PTg1Njg4NDNEPzU7Ojk2LzEtLj86OUFITlZeZWxydXh6e3t/hYiHhYWFN0VQT0pIR0Q/ODItKi0xNDEvMTQ4PkA7ODk6OjEsOTs0ODo2MzAyMjI3Oj5DSlNfZ2xxdXV2d3p7goiJhoWHhzlLW1dQS0VBPTYwKSUvMS8uLi8yODw/Pjw8ODcxMzk6Njg6NTM0NDU4OT9GS1BYY2puc3d4d3h+ho+QkI6KiIhFUVVVVVFHPjYwLi0rMTEuLjAxMTU5Pj87Ozc0NDc4OTo5NjQ0NjY3Oz1FTFNZYGZqbHJ3en2EipKXl5aVj4uMRkVDS01JQTcwLzEyNDU1MzQ3NTIyNjs/QDo2NDU0NTk7ODMzNTc4OTxCS1NZXmNoaWpweIGMlJaZl5eZmZiWlT01O0NEPTg0MTI0Njo9PDk3OTg3NDU4Qkk5NTU1Njg5NzUyMjQ4ODtBSVJaX2JkZ2tudH6Nm6CgoJ6dnqGjop5APEFHRkE7NjU1Njs+QD48Njg5Ozs6PEVGOTo5ODw8NTAsKy80Ojo9RExUW19jZGlweIKMmaSoq6yrqaioqaWgS0tOUE1IPjU7QT49Pj4+PDY2OT1BQkI/PD5AOzw+ODQtHh4vNzw9QUhOVFpgY2ZueIKOnaestLW0s7Kwrq2opVhXWFtaUkU+REpEPj09PDo3Njc9QkJCPjxCQz84NkVAJhMaMDk8PkJKUVhdYmZsdoOMlqKss72+vby7uri1srJjZGlxc2dZVFJPSUNBPTg3ODg4PD49P0FBQ0RANjBKQx8TIjM4PD5BR05VW2Jpcn6KkJegqre/xMfGxMTBv7/DanB8iIZ7bmRaUU5JQzo2ODs8PD09PDw/QEJDPjkzODQfFyk2Njw+QERHTVVhbXaBi5GYoau3wcfLy8rJx8fLz3B4hIeBenJnWU9OSUI8Oj0+PT09Pjw6OzxAPjk3NTAsIR4pMzc6PkFESU5ZZnJ5gIuWnqStuMXMztHRz83O09d8goaDfndvZltTTUZCPj0+Pj8+PT48OTc5PTk3NjYwKykqLjQ5OkFFSU1TXmp0eoCJk5yiqbXGz9TZ2dbT1Nfag4SAfHx6cGReWVJJPTk5OjxAQD49Ozk2Njg3ODczMTEzNDU4Oz9GSk5TWWFpcXmBipKZn6e1xM/Y3+Hd2tjZ2oB8cmpqaV5TVVVQST45Ojo6PT8+PDs7OTU0Njg2MzU3ODg6PD1CSU1RVl1kbXV8g42VmqGqtcDL2OTo5uHd3Nh2cWNZVExBPURIRURFRUI/Ojk6Ojs9Pjw3NDU2NDY5OTk6PkFBREpOUVVbY295gIaNlJujq7K9ydjn7u7p49/Wa2NZVVJIPTc5P0FCRkpIQTo3Nzg6PD4+OjU1NzY3Ojo4Oj5CRklMTlBTV11oc32FjJWdpauzv8rX5ezv7+jg1WJYUlFPST82MztDQkNLT0M6NzY4ODk6PTw3ODk5ODo6ODo+Q0dLTU9RU1dfaXN+iJKcoqqxuMLL1+Lo7fDt5NhcUk9OSUI6MzI2Ozk3O0A+PDo6Ozg2Njk6Nzk6Ojk5Ojo7QEZKTFBTVFZaY2x1gY6aoqeutbvCzdnl6evv8eziX1VQTkY+OTg5NjAsKSgrNj09PT06NTc4NzU3Oz08Ojo8PUJITE5RVFRXXGRueoeVn6arsri+xs/b5urs7vHx7GRcVVBHQEFFQjcsJyYnKzQ8Pj09Ozk6OjY0NztAQj46OzxBR0pNUFJTVlxmc4GOmaGor7W8wMXM1d3j6u/x8/JjYVxWTEhOTT8vKScmJyszOj49PDs6Ojs3NDU6QEZCOjo6PUNJTVBSVVlga3mFkJihpqmvtbi6wcfO2OXv9fb3aGRdW1xeX1M7Ly4tKysvNTs+PTw8PDw7NzQ1Oj9FQj08PT9DSU1RVVlfZ3F8iJGZoaSioaewtba8xM/b7PX5/XFoXl5lamhaRT03MzIzNTg7Pj48PDw5NzY1NjpAQUA/PkFER0lNUVZdZGx1gIqUnaSmop6irbO1ub/H0uLu9v1zaWBhZGZhVk1GPjc3Ojk3ODs9PDs8Ojc0Njg9QT8+Pj5CRUdJTVFXX2dweYSMlZ2lqammpaits7m8v8rZ5u72bGVgYGFgVElJR0I7Oj05NDU5Ojs8OTs7MzY9QD89PD0+QENGSU1SWmFncHuFjpafqa6vrKemqa+0uLrE1eLo7mFdW1pWUUpHSkhDPzw3MS4yPD06PTUsODs6PT49PTw8P0JDRkpOVl5kaXB7hpGZoayysq2pqayvr7C3xtLa4udYUVJRSkE+Q0RCRUM7LyInMjw/PT45OUNAPD0/Pzw8PkNHR0dKUVlgZmxzfIiSmJ+qsbKwrKuurquorr7L0dfgTklKTEU7Oj07PkZFPSgVJENDOz49RFJQQz0+Pjw7PUBCRklJTVZbYWhweIGMlZuiqa6wsKyoqaqopKaywsnN10hJSEhEPDw8OUFHR0ArHCxOSDw/PklUTEQ+Pz47PEBAQERHSlJaXmNqc3uDjZWdo6aop6Ogn6GlpqOkrrnAxsxISEZEQjw3ODlBR0Y/ODY8QUJCQUBFR0M/PkJFQEBDQUFER01UXGFkaXF4gIeNkZaZmJeTlJmdoaOipKqxub7BPz8/Pj49OTk8PT9CPz0+Pz0/QT5AQT47PEFDQUJGRkNERklOU1tgY2dtdXyDhoqSlJCOjpKXnZ6bmZ6lqrK4ujAwMTk+QD89PTw+QUA8PD0/QD4+Pjw4NjtBQkBESEZER0tPU1heYWRoaHF7foCIkpWSjY6Tl5ybk46SnKCotbgoKCY0PUFCQT8/Q0JAPTs8P0BBQT85MzI4P0BDSEdFRUhMUFRaX2JlZ2VpdHh4f4mPkY+NkpWWkouHiZSboa21JiQjMjw+QUJBQUNEQz87OTxARUQ+Ni8uMz1BRUlIRUVGR0xSVlthYWFkYmpxcnZ9hImLiIqNjIiFh4yTnJ+lryEdIjo7NTw/PkBCRUU/Ojg6PkRFOTIwLjE/SURHSEdFRUZMUlVaXVxeYWNma3R6e32Cgn18goOFiZKWmJ6foqoYFyw+Ni8zNDY9PkFDPzs8Pz1AQTk1NTIzPkpAQURFRUVHTlNVWFpbXV9laGt0eHl6enl2d36FjZebm5ygn52eGBw0QDkzMC41Ozw/Q0A+QEA7Ojs7OTY1Mi00OUNDQkZKS1FVV1hZXF5hZ2xucXN2d3d3d3l/ipiio6KempiUkh4mOEI7NTIxNjk+QkE9PT8+OzQxNTQxMS4kKjdEQkBGTFBVWVpaWlxgZWltb3N3dnZ4ent9gY6fpKmrnpKRjYYiKzk8MCswNDU5QEM9ODc6Pz0yLjAwLysoKzQ6PDs/Rk1TWFpaW1pbYGZra2x0d3d2eHh4fYGNn6SrqJiOin91JSovMCUeKDY2OkBAPTc1OUA9NDQ2NTApJiwyNzk2PUhSWFlaW1xaW2BkZ2hna29xdHZ0dXyDjJmkpZySi3xrZA==");
const REAL_UMM_DEM = decodeB64Bytes("VVNQVFhcXVxeW1RbWllZXGBgYV9gXmFlbHBvb3d5eYOFgoaDg3x7eHVubW1pYmBYSkE/PTA2cIBqZ2x/gX13dFVSUlJSVllbVlRSUVZWV1ldYGBcWVpZY2ppaWptd3t+fnyFioSAfndzbWtwamRjV0tEOzo6VoeQkm91kZWUi4FXU1JNS1FUWlVSVVZYV1dWWWFgYFlaYGNlZ291dHR9gHZ6foB+end3dXFsbmdjXVROSz5IXm+No7ijm6yunpCLVFNPS01RT1FVUVJXWFdYUlpbWF5eWmBgXmRscHd0eIF+gICBf3h0fXp1cm5qZ11XVkxFT2WGobLIzsfAt6SVkFFUUFBSVVJOTkxPWVhWVlVWVVFTWFxhYF5kcnF0dXZ6fX6BgoB3dn57dnRxbmVcVEtES1V1rMDO3t3Sw7qroJNGT1BOTVBQUUxMT1NSTlBRUlNTWFxdXF9iZGprc3p4eXh5d3t/d3l8eHVxb2pmX1ZNV2FsqcbQ3ODo2Mezq6GQPkFGREdJSk1NTExOUExMSUxXWltbXFtdXmJnZnF6d3Z1dXR2eHh9f3h1cG1samFUUV9qksfL1tfd59S+rKGgjzk+PD1FSElKS0xJSUxKRkdJUVpcWV1cXV1fZGNqeXRwcnV5enh4d3l5c3Fva2lgTEpicrvj3N7az9vJxLWZmZI1PD48QkdGR0lMRUNFR0ZGTFBTWl5gWlpdYGVndXhwb3N6enx8fHd5fXt6dnFvYkxUdprG6+rc0cbKxsm6m4eJMzw+Ojo9QUlJRz9AR0pMS09MS1ZaWlBWWVlgY25zdXR3fX2AgYGDgIF7fH55cl9lfZK/1+bl29bPvsHKuJd6dDI4Nzo8OztCRkZERklNTUpPTU1OT1NYWFddaGVpcHN2bnV+g4SIiIaBdXd9dGVghJGUwuLXydfi1bytwrWcl3ctNjc4OTo3Nj1HTElGSUpKT11OTEtRW1pXYW9tdXd4eHV4fYOHjo2Lh4N/fHZpdIiSoK7D1b3Ez7u1qZGQlZh6MjU1Ojk4Nzg7PkVFPUBGSkdITklKT1peXWVra3d6eXeFi4GNjJGSjIqIgX9zZ3qUq7W1vNa9oK+srKONioqJcDM0MDY4MzA2OjQ1QkI/RElFR0xMUVJWX2FkbHF1fYKIl6Wfm52cnZaRiIaTcWZ2mL7CuL7IuaWcmaOWiYRqbnEzMy0w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");

function sampleDemArray(arr, u, v) {
  const S = REAL_DEM_SIZE;
  const fx = clamp(u, 0.0, 0.999) * (S - 1);
  const fy = clamp(v, 0.0, 0.999) * (S - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, S - 1), y1 = Math.min(y0 + 1, S - 1);
  const tx = fx - x0, ty = fy - y0;
  const a = arr[y0 * S + x0] / 255.0;
  const b = arr[y0 * S + x1] / 255.0;
  const c = arr[y1 * S + x0] / 255.0;
  const d = arr[y1 * S + x1] / 255.0;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

const realDemRgba = new Uint8Array(REAL_DEM_SIZE * REAL_DEM_SIZE * 4);
for (let i = 0; i < REAL_DEM_SIZE * REAL_DEM_SIZE; i++) {
  realDemRgba[i * 4 + 0] = REAL_ERG_DEM[i];
  realDemRgba[i * 4 + 1] = REAL_UMM_DEM[i];
  realDemRgba[i * 4 + 2] = 0;
  realDemRgba[i * 4 + 3] = 255;
}
const REAL_DEM_TEX = new THREE.DataTexture(realDemRgba, REAL_DEM_SIZE, REAL_DEM_SIZE, THREE.RGBAFormat);
REAL_DEM_TEX.minFilter = THREE.LinearFilter;
REAL_DEM_TEX.magFilter = THREE.LinearFilter;
REAL_DEM_TEX.wrapS = THREE.ClampToEdgeWrapping;
REAL_DEM_TEX.wrapT = THREE.ClampToEdgeWrapping;
REAL_DEM_TEX.needsUpdate = true;

const _texLoader = new THREE.TextureLoader();
_texLoader.setCrossOrigin('anonymous');

export function loadRealScanTex(url, isColor = true, repX = 1, repY = 1) {
  const tex = _texLoader.load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = 4;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

export const REAL_SCANS = {
  sandDiff:      loadRealScanTex(REAL_SCAN_URIS.sandDiff, true, 1, 1),
  sandNor:       loadRealScanTex(REAL_SCAN_URIS.sandNor, false, 1, 1),
  sandRough:     loadRealScanTex(REAL_SCAN_URIS.sandRough, false, 1, 1),
  duneRippleNor: loadRealScanTex(REAL_SCAN_URIS.duneRippleNor, false, 1, 1),
  barkDiff:      loadRealScanTex(REAL_SCAN_URIS.barkDiff, true, 1, 5),
  barkNor:       loadRealScanTex(REAL_SCAN_URIS.barkNor, false, 1, 5),
};

export const REAL_3D_PLANT_URLS = {
  fern_02: {
    gltf: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/fern_02/fern_02_1k.gltf',
    diffUri: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/fern_02/fern_02_diff_1k.jpg',
  },
  calathea_orbifolia_01: {
    gltf: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/calathea_orbifolia_01/calathea_orbifolia_01_1k.gltf',
    diffUri: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/calathea_orbifolia_01/calathea_orbifolia_01_diff_1k.jpg',
  },
  flower_gazania: {
    gltf: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/flower_gazania/flower_gazania_1k.gltf',
    diffUri: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/flower_gazania/flower_gazania_diff_1k.jpg',
  },
};

function normalizeLoadedGeo(geo, targetHeight = 1.0) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  const h = Math.max(0.001, bb.max.y - bb.min.y);
  const s = targetHeight / h;
  geo.translate(-cx, -bb.min.y, -cz);
  geo.scale(s, s, s);
  geo.computeVertexNormals();
  return geo;
}

function fallbackPlantGeo(kind) {
  const g = new THREE.ConeGeometry(kind === 'cala' ? 0.55 : 0.42, 0.85, 7, 3);
  g.translate(0, 0.42, 0);
  return g;
}

export async function loadReal3DPlantGeometries() {
  const manager = new THREE.LoadingManager();
  const neutralLeafSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#78965a"/></svg>';
  const neutralLeafTexture = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(neutralLeafSvg);
  manager.setURLModifier((url) => /\\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(url) ? neutralLeafTexture : url);
  const loader = new GLTFLoader(manager);
  loader.setCrossOrigin('anonymous');
  async function fetchOne(url, kind) {
    try {
      const gltf = await loader.loadAsync(url);
      let best = null;
      let bestCount = 0;
      gltf.scene.traverse((obj) => {
        if (obj.isMesh && obj.geometry && obj.geometry.attributes.position) {
          const c = obj.geometry.attributes.position.count;
          if (c > bestCount) { bestCount = c; best = obj.geometry.clone(); }
        }
      });
      return best ? normalizeLoadedGeo(best, kind === 'cala' ? 0.92 : 0.85) : fallbackPlantGeo(kind);
    } catch (e) {
      return fallbackPlantGeo(kind);
    }
  }
  const [fernGeo, calaGeo, flowGeo] = await Promise.all([
    fetchOne(REAL_3D_PLANT_URLS.fern_02.gltf, 'fern'),
    fetchOne(REAL_3D_PLANT_URLS.calathea_orbifolia_01.gltf, 'cala'),
    fetchOne(REAL_3D_PLANT_URLS.flower_gazania.gltf, 'flow'),
  ]);
  return { fernGeo, calaGeo, flowGeo };
}

function sharpCrest(x, z, crestX, zCenter, zWidth, height, leftSlopeW, rightSlopeW) {
  const dx = x - crestX;
  const sideW = dx < 0 ? leftSlopeW : rightSlopeW;
  const adx = Math.sqrt(dx * dx + 0.025) - 0.1581;
  const cross = Math.max(0.0, 1.0 - Math.max(0.0, adx) / sideW);
  const zEnv = Math.exp(-Math.pow((z - zCenter) / zWidth, 2));
  return height * cross * zEnv;
}

function getBasinSignedDistance(x, z) {
  const cx = 0.0, cz = 2.0;
  const rx = 10.8, rz = 8.7;
  const dx = x - cx, dz = z - cz;
  const angle = Math.atan2(dz, dx);
  const rightCoveIndent = -0.34 * Math.exp(-Math.pow((angle - 0.24) / 0.34, 2));
  const backLeftCove = 0.09 * Math.exp(-Math.pow((angle + 2.45) / 0.55, 2));
  const shoreLobes =
    0.038 * Math.sin(angle * 2.0 + 0.4) +
    0.025 * Math.cos(angle * 3.0 - 0.8) +
    0.014 * Math.sin(angle * 5.0 + 1.2);
  const radialScale = 1.0 + shoreLobes + rightCoveIndent + backLeftCove;
  const nx = dx / (rx * radialScale);
  const nz = dz / (rz * radialScale);
  return (Math.hypot(nx, nz) - 1.0) * 0.5 * (rx + rz) * radialScale;
}

function getDuneOnlyHeight(x, z) {
  const cPeak = sharpCrest(x, z, 3.8 + Math.sin((z + 54.0) * 0.075) * 3.2 - (z + 54.0) * 0.12, -54.0, 28.0, 11.2, 30.0, 11.5);
  const leftRidge = sharpCrest(x, z, -22.5 + Math.sin((z + 38.0) * 0.068) * 3.2 + (z + 38.0) * 0.15, -38.0, 24.0, 10.8, 26.0, 13.5);
  const rightMassif = sharpCrest(x, z, 32.0 + Math.sin((z + 44.0) * 0.055) * 4.8, -44.0, 32.0, 11.2, 34.0, 22.0);
  const rightFore = sharpCrest(x, z, 22.5 + (z + 28.0) * 0.16, -28.0, 18.0, 7.8, 22.0, 16.0);
  const farLeft = Math.max(0.0, (-x - 18.0) * 0.20) * smoothstep(-16.0, -45.0, z) * (1.0 - smoothstep(-72.0, -105.0, z));
  const backSaddle = 2.2 * Math.exp(-Math.pow((z + 24.0) / 11.0, 2)) * (0.45 + 0.55 * smoothstep(2.0, 18.0, x));
  let d = smax(cPeak, leftRidge, 5.2);
  d = smax(d, rightMassif, 2.2);
  d = smax(d, rightFore, 1.8);
  d = smax(d, farLeft, 1.8);
  const demU = clamp((x + 60.0) / 120.0, 0.0, 1.0);
  const demV = clamp((-z - 12.0) / 76.0, 0.0, 1.0);
  const realErg = sampleDemArray(REAL_ERG_DEM, demU, demV);
  const realUmm = sampleDemArray(REAL_UMM_DEM, demU, demV);
  const realRelief = (realErg - 0.45) * 3.1 + (realUmm - 0.5) * 0.85;
  const farEnv = smoothstep(-15.0, -32.0, z);
  return Math.max(0.0, d + backSaddle * 0.32 + realRelief * farEnv);
}

function getTerrainHeight(x, z) {
  const sd = getBasinSignedDistance(x, z);
  let y = 0.0;
  if (sd < 0.0) {
    const inward = clamp(-sd / 7.5, 0.0, 1.0);
    const bowl = Math.pow(smoothstep(0.0, 1.0, inward), 0.72);
    const deepLeft = Math.exp(-(Math.pow(x + 4.5, 2) / 46.0 + Math.pow(z + 1.2, 2) / 34.0));
    const frontShallow = smoothstep(3.2, 10.4, z) * 0.62;
    const depth = clamp(0.95 + 1.25 * deepLeft - frontShallow, 0.22, 2.25);
    y = -bowl * depth;
  } else {
    y = 0.04 + 0.52 * smoothstep(0.0, 9.5, sd);
  }
  if (z > 9.0 && sd >= 0.0) {
    const fgT = smoothstep(9.5, 17.5, z);
    const gentleBeach = 0.04 + fgT * 0.52 + 0.05 * Math.sin(x * 0.18 + 0.4);
    const centerMask = 1.0 - smoothstep(4.5, 13.5, Math.abs(x));
    y = y * (1.0 - centerMask * 0.80) + gentleBeach * (centerMask * 0.80);
  }
  const duneMask = smoothstep(-7.5, -18.5, z) * smoothstep(0.4, 5.2, sd);
  if (duneMask > 0.001) {
    const centerGap = (1.0 - smoothstep(2.4, 8.5, Math.abs(x))) * smoothstep(-7.5, -11.5, z) * (1.0 - smoothstep(-18.0, -25.0, z));
    y += getDuneOnlyHeight(x, z) * duneMask * (1.0 - 0.55 * centerGap);
  }
  return y;
}

function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTex(canvas, isColor = true, rx = 1, ry = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.wrapS = rx !== 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = ry !== 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (rx !== 1 || ry !== 1) tex.repeat.set(rx, ry);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export { WATER_LEVEL, SUN_DIRECTION, clamp, smoothstep, REAL_DEM_TEX, sharpCrest, getBasinSignedDistance, getDuneOnlyHeight, getTerrainHeight, createRng, makeCanvasTex };
