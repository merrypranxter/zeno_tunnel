# Zeno Tunnel — Infinite Descent

> *"That which is in locomotion must arrive at the half-way stage before it arrives at the goal."*
> — Zeno of Elea

A real-time infinite tunnel visualization that makes Zeno's paradox visceral. As you fly forward, each Zeno level is exactly half the depth of the previous — you always have infinitely many thresholds ahead, yet you cross them all.

![Three.js](https://img.shields.io/badge/Three.js-r163-blue) ![Vite](https://img.shields.io/badge/Vite-5.x-purple) ![WebGL](https://img.shields.io/badge/WebGL-2.0-green)

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

---

## The Math

### Zeno's Paradox of Motion

Zeno argued that to travel any distance, you must first travel half of it, then half of the remainder, then half *of that* — an infinite series of steps:

```
distance = 1/2 + 1/4 + 1/8 + ... = Σ (1/2)^n = 1
```

The series converges, so motion *is* possible — but the infinite subdivision is real and renders as infinitely many concentric tunnel rings.

### Ray-Tunnel Intersection

Each frame, a fullscreen quad is rasterized. The fragment shader fires a ray from the camera origin through each pixel:

```
ro = (0, 0, camZ)                    // camera at z = time × speed
rd = normalize((uv × fov, 1.0))      // perspective ray direction
```

The square tunnel has half-width `W = 1.0`. All four wall planes are intersected analytically:

```
t_x+ = ( W - ro.x) / rd.x    →  valid if |ro.y + t·rd.y| ≤ W
t_x- = (-W - ro.x) / rd.x    →  valid if |ro.y + t·rd.y| ≤ W
t_y+ = ( W - ro.y) / rd.y    →  valid if |ro.x + t·rd.x| ≤ W
t_y- = (-W - ro.y) / rd.y    →  valid if |ro.x + t·rd.x| ≤ W
```

The smallest positive `t` wins. No iteration — O(1) per pixel.

### Zeno Level Coloring

The hit depth `d` is mapped to a Zeno level via logarithm:

```glsl
float logBase  = log(1.0 / subdivisionRatio);  // log(2) for Zeno 1/2
float logDepth = log(depth) / logBase;
float level    = floor(logDepth);   // integer level index
float t_level  = fract(logDepth);   // fractional position within level
```

`t_level → 0` marks a Zeno boundary (ring glow); `t_level → 1` is deep inside the current subdivision.

### Subdivision Ratios

| Mode | Ratio | Level spacing |
|------|-------|---------------|
| Zeno (1/2) | 0.5 | Each level is 2× deeper |
| Golden (1/φ) | 0.618 | Levels spaced by golden ratio ≈ 1.618× |
| Third (1/3) | 0.333 | Each level is 3× deeper |

### Camera Twist

The ray direction is rotated in XY by a continuously accumulating angle:

```glsl
twistAngle = camZ × uTwist;
rd.xy = mat2(cos θ, -sin θ, sin θ, cos θ) × rd.xy;
```

This creates a helical descent effect.

### Color Palettes

All palettes use the **cosine palette** technique (Inigo Quilez):

```glsl
color = a + b × cos(2π × (c × t + d))
```

| Scheme | Character |
|--------|-----------|
| Cyberpunk | Electric cyan/magenta/white |
| Golden Hour | Warm amber, orange, gold |
| Void | Deep purple to pale violet |
| Matrix | Pure green phosphor |

The hue shifts per level by the golden ratio (`level × 0.618`), ensuring visually distinct consecutive rings without repetition.

---

## Controls

| Control | Range | Default | Effect |
|---------|-------|---------|--------|
| Speed | 0.1 – 5.0 | 1.0 | Forward flight speed |
| Subdivision Ratio | 3 modes | 0.5 (Zeno) | Zeno level depth spacing |
| Color Scheme | 4 options | Cyberpunk | Visual palette |
| Twist | 0.0 – 0.5 | 0.05 | Helical camera rotation rate |
| FOV | 0.5 – 2.0 | 1.2 | Field of view (perspective strength) |
| Pause/Resume | — | — | Freeze time |

---

## Technical Notes

- **Renderer**: Three.js `ShaderMaterial` on a fullscreen `PlaneGeometry(2,2)` with an `OrthographicCamera`. The entire scene is computed analytically in the fragment shader — no 3D geometry needed.
- **No raymarching**: Intersection is purely analytical (4 plane tests per pixel), so performance is independent of scene complexity.
- **Fog**: Exponential depth fog `exp(-depth × 0.005)` prevents infinite depth aliasing.
- **Gamma correction**: Linear → sRGB via `pow(color, 1/2.2)`.
- **FPS counter**: Averaged over 0.5-second windows for stability.
- **Pixel ratio**: Capped at 2× to balance quality and performance on high-DPI displays.

---

## Project Structure

```
zeno_tunnel/
├── index.html          # Full-screen canvas + HUD overlay
├── package.json        # Vite + Three.js dependencies
└── src/
    ├── main.js         # Three.js setup, render loop, FPS counter
    ├── ZenoTunnel.js   # Core class: uniforms, GLSL shaders, update/resize
    └── ui.js           # DOM event wiring for all controls
```

---

## License

MIT
