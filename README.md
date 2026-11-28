# Golden-Hour Desert Oasis — Three.js 0.187.0 WebGL2 + Real Data Scans

Interactive WebGL2 golden-hour desert oasis built with **Three.js 0.187.0**, **React 18**, and **Framer Motion 14.14.0**, engineered for low-end mobile and integrated-GPU budgets (`shade-device-lab`: Adreno 506 / Intel UHD 600).

## Real-Data-First Asset Pipeline
- **Terrain Elevation**: Real [AWS Open Data Terrarium DEM tiles](https://registry.opendata.aws/terrain-tiles/) — Erg Chebbi, Morocco (`13/4005/3349`, 200 m barchan dune relief) and Umm al-Maa Oasis, Libya (`13/4399/3464`, 163 m oasis basin relief).
- **Scanned PBR Surfaces (Poly Haven CC0)**:
  - Sand & Submerged Waterbed: [`coast_sand_01`](https://polyhaven.com/a/coast_sand_01) (Diffuse, OpenGL Normal, Roughness) + [`aerial_sand`](https://polyhaven.com/a/aerial_sand)
  - Ringed Palm Bark: [`bark_brown_02`](https://polyhaven.com/a/bark_brown_02) (Diffuse, OpenGL Normal)
  - Real 3D Photogrammetry Plant Meshes (`assets/real-3d-plants.json`): [`fern_02`](https://polyhaven.com/a/fern_02), [`calathea_orbifolia_01`](https://polyhaven.com/a/calathea_orbifolia_01), and [`flower_gazania`](https://polyhaven.com/a/flower_gazania)
- **100% 3D-Modeled Palm Canopies (Zero Alpha Cut)**: Tapered curved woody rachises + 72 individual 3D V-creased sword leaflets per frond arranged in Fibonacci phyllotaxis (`137.5°`) with sculpted fibrous crownshaft bulbs, instanced in a single opaque draw call for early-Z mobile performance.
- **Optical Water & Screen-Space Post-FX**: Planar reflection + Beer-Lambert cyan-turquoise depth absorption + crisp micro-ripples + HalfFloat HDR unified post-pass (22-tap crepuscular volumetric godrays, 8-tap selective bloom, ACES Filmic tone mapping, and 180 drifting golden-hour dust motes).
