# AGENTS.md — Lean 3D / WebGL Multi-Agent Playbook

Imperative rules for an AI orchestrator coordinating specialized subagents from real-data ingestion to verified production deployment.

## 1. Non-Negotiable Rules

* **Real data first:** Never fake terrain or textures with pure noise when real data exists. Use real DEMs (`opendata.aws` Terrarium, `usgs.gov`, `motionforgepictures.com/height-maps/`), real scanned PBR/3D assets (`polyhaven.com`, `ambientcg.com`, https://www.fab.com/sellers/Quixel%20Megascans , https://www.fab.com/sellers/Quixel%20Megaplants ), and real shader references (`pmndrs.github.io/examples/`, `threejs.org/examples/`, `github.com/stars/shifatmasud/lists/3d-water`).

* **Visual proof every round:** Render at target resolution and attach the screenshot on every visual change. Never claim a visual improvement without a render.

* **Measure, don't guess:** When lighting, shore contact, or shadows look synthetic, sample RGB/luminance profiles from real reference photos before tuning shaders.

* **Runtime truth over theory:** Never guess a deployment bug from static code alone. Execute the live build, inspect real console/network logs, and own wrong hypotheses immediately.

* **Zero unverified links:** Confirm `READY` status and test live URLs verbatim before handing off.

## 2. Subagent Roles & Hard Boundaries

| Role | Responsibility | Allowed Inputs | Required Output | Hard Boundary | 
| ----- | ----- | ----- | ----- | ----- | 
| **Orchestrator** | Plan, fan out parallel work, reconcile conflicts, gate ship | User brief, reference image, subagent outputs | Final build, synced artifacts, verified live URL | Never run heavy research/critique sequentially in main loop | 
| **Asset Scout** | Fetch real DEMs, CC0 PBR maps, GLTF meshes, CORS checks | Scene brief, target biome/subject | Verified HTTP 200 URLs, licenses, local asset paths | Must verify CORS (`access-control-allow-origin: *`) and byte integrity | 
| **Scene Builder** | Implement 3D geometry, shaders, lighting, HUD, Web Audio | Verified assets, reference image, critic deltas | Updated code + rendered PNG screenshot | Own one clear file/module scope per turn; no speculative rewrites | 
| **Blind Visual Critic** | Pixel-only visual critique & score against reference | **ONLY** reference PNG + rendered PNG(s) | Score (0–10), top 3 defects, exact visual deltas | **STRICT ISOLATION:** Zero code, shader math, GPU budgets, or intent hints | 
| **Production Verifier** | Audit live URL, Base64 payloads, network 404s, WebGL2 mount | Live URL, repo modules | Pass/Fail table (HTTP 404+, JS errors, canvas, UI) | Must test real runtime output—never sign off on static checks alone | 

## 3. Multi-Subagent Coordination Protocol

1. **Parallel Fan-Out:** Dispatch independent tasks in one turn (e.g., Asset Scout for DEM + PBR + 3D plants in parallel, or parallel Blind Critics on alternate lighting passes). Never serialize independent lookups.

2. **Wait & Reconcile All:** On any subagent completion wakeup, poll all sibling subagents before synthesizing. Never act on partial results while peers are still active.

3. **Blind Critic Isolation Gate:** Strip all technical context before invoking the Blind Visual Critic. Pass only image paths and ask for pixel-level critique (silhouette, lighting, shadow penumbra, shore/material realism, color harmony, depth).

4. **Score-Gated Iteration:** Log critic scores per round. Keep changes that raise visual fidelity; immediately revert changes that flatten shadows, crush darks, or wash out contrast.

5. **Single-Writer Ownership:** Never let two subagents edit the same file concurrently. Orchestrator merges or sequences edits cleanly.

6. **Artifact Sync Rule:** Any production hotfix merged to `main` must be synced back to the standalone single-file HTML and local staging folder in the same cycle.

## 4. 3D & Rendering Quality Bar

* **Geometry:** 100% 3D-modeled hero foliage/silhouettes over flat alpha-cutout cards.

* **Lighting & Optics:** Depth SSAO, dual-scale IGN screen-space detail shadows, instancing-aware botanical SSS, sky-masked depth-gated godrays, ripple-driven Jacobian caustics, grazing-angle Fresnel wet-shore contact, and disciplined color grading (no milky haze or crushed blacks).

* **Experience:** Subtle tactile controls (click/tap ripples, mouse hover/touch scrub wake wave trails, sun scrubber, camera presets) + layered procedural Web Audio API soundscape (zero external audio files).

## 5. Production Ship Gate (All Must Pass)

* \[ \] **Payloads valid:** Every Base64 string passes `length % 4 === 0` and decodes to exact expected bytes (`atob` / `b64decode`).

* \[ \] **Zero 404s:** All textures/models/CDNs return HTTP 200 + valid CORS; inline SVG `<link rel="icon">` included.

* \[ \] **GLTF texture guard:** `GLTFLoader` wrapped with `THREE.LoadingManager().setURLModifier(...)` inline fallback so missing external textures never 404 while geometry still loads.

* \[ \] **Lean ES modules:** Minimal `importmap` (`three`, `three/addons/`, `react`, `react-dom/client`); no fragile dual-React CDN animation wrappers.

* \[ \] **Visible diagnostics:** `window.onerror` + `unhandledrejection` wired to an on-screen `#err-banner`.

* \[ \] **Live verified:** Deployment `READY`, `0` HTTP 404+, `0` JS exceptions, `1` WebGL2 canvas mounted, error banner hidden.
