/**
 * DrosteTunnel — 2-D log-polar recursive descent (Droste / mise en abyme)
 *
 * This is a *pure 2-D* fullscreen shader — no 3-D ray casting.
 * Instead it exploits the Droste effect: a conformal complex-log
 * mapping wraps the plane so that zooming in is equivalent to rotating.
 *
 * Mathematical basis
 * ──────────────────
 * Let z = x + iy (pixel position, centered, aspect-corrected).
 * Apply the complex logarithm:
 *
 *   w = log z = ln|z| + i·arg(z)
 *       ──────   ──────────────────
 *       real part   imaginary part
 *       (zoom)      (rotation)
 *
 * The real part w.x = ln r is the "zoom level"; tiling it with period
 * P = ln(scale) produces self-similar copies scaled by `scale`.
 * Adding a time-driven phase offset to w.x creates the appearance of
 * continuous zooming inward — each step covering half the remaining
 * distance, never arriving.
 *
 * The imaginary part w.y = θ tiles automatically over [−π, π], wrapping
 * around the origin.
 *
 * A square "room" (corridor seen head-on) is drawn procedurally at each
 * tile using distance functions. Each nested copy is exactly `scale`
 * times smaller; the limit of the nesting is the origin.
 *
 * uScale uniform: self-similarity ratio (default 2.0 = Zeno 1/2)
 * uPhase uniform: additional rotation phase (cosmetic)
 */
export default class DrosteTunnel {
  constructor(THREE, options = {}) {
    this.THREE = THREE;

    this.uniforms = {
      uTime:        { value: 0.0 },
      uSpeed:       { value: options.speed ?? 0.5 },
      uScale:       { value: options.scale ?? 2.0 },
      uColorScheme: { value: options.colorScheme ?? 0.0 },
      uResolution:  { value: new THREE.Vector2(800, 600) },
      uTwist:       { value: options.twist ?? 0.0 },
    };

    const vertexShader = /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */`
      precision highp float;

      uniform float uTime;
      uniform float uSpeed;
      uniform float uScale;
      uniform float uColorScheme;
      uniform vec2  uResolution;
      uniform float uTwist;

      varying vec2 vUv;

      const float PI    = 3.14159265359;
      const float TAU   = 6.28318530718;

      // ── Complex multiply ─────────────────────────────────────────────────────
      vec2 cmul(vec2 a, vec2 b) {
        return vec2(a.x * b.x - a.y * b.y,
                    a.x * b.y + a.y * b.x);
      }

      // ── Complex logarithm ────────────────────────────────────────────────────
      vec2 clog(vec2 z) {
        return vec2(log(length(z)), atan(z.y, z.x));
      }

      // ── Complex exponential ──────────────────────────────────────────────────
      vec2 cexp(vec2 w) {
        return exp(w.x) * vec2(cos(w.y), sin(w.y));
      }

      // ── Cosine palette ───────────────────────────────────────────────────────
      vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
        return a + b * cos(TAU * (c * t + d));
      }

      // ── Procedural room pattern ──────────────────────────────────────────────
      // Draws a corridor cross-section: nested rectangles with tiled floor/ceiling.
      // uv: position in [0, 1]² for the current tile.
      // Returns (base_color, intensity, is_edge)
      vec3 roomPattern(vec2 uv, float level) {
        float hueShift = fract(level * 0.618033);

        // Remap to [−1, 1]²
        vec2 p = uv * 2.0 - 1.0;

        // Outer frame: distance to the rectangle border
        vec2 q     = abs(p) - vec2(0.85, 0.85);
        float outerDist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);

        // Inner frame (the "door opening" / hallway entrance)
        vec2 qi    = abs(p) - vec2(0.55, 0.55);
        float innerDist = length(max(qi, 0.0)) + min(max(qi.x, qi.y), 0.0);

        // Floor stripe (bottom strip)
        float floorLine = smoothstep(0.02, 0.0, abs(p.y + 0.75));
        // Ceiling stripe
        float ceilLine  = smoothstep(0.02, 0.0, abs(p.y - 0.75));

        // Vertical wall lines (perspective lines converging to center)
        float vanishLeft  = smoothstep(0.015, 0.0,
          abs(p.y - p.x * (0.75 / 0.85) ));
        float vanishRight = smoothstep(0.015, 0.0,
          abs(p.y + p.x * (0.75 / 0.85) ));

        // Frame glow
        float outerFrame = smoothstep(0.06, 0.0, abs(outerDist));
        float innerFrame = smoothstep(0.06, 0.0, abs(innerDist));

        // Background fill (the walls)
        float wallMask = step(0.0, -innerDist) * (1.0 - step(0.0, -outerDist));

        // Build color
        vec3 wallColor, frameColor, lineColor;

        if (uColorScheme < 0.5) {
          // Cyberpunk
          wallColor  = cosPalette(hueShift,
            vec3(0.1, 0.1, 0.15), vec3(0.1, 0.1, 0.2),
            vec3(1.0), vec3(0.0, 0.33, 0.67));
          frameColor = cosPalette(hueShift + 0.2,
            vec3(0.5), vec3(0.5),
            vec3(1.0), vec3(0.0, 0.33, 0.67));
          lineColor  = vec3(0.0, 1.0, 0.8);
        } else if (uColorScheme < 1.5) {
          // Golden Hour
          wallColor  = vec3(0.12, 0.08, 0.04) * (0.5 + hueShift);
          frameColor = cosPalette(hueShift,
            vec3(0.6, 0.5, 0.2), vec3(0.4, 0.3, 0.1),
            vec3(1.0, 0.7, 0.4), vec3(0.0, 0.15, 0.3));
          lineColor  = vec3(1.0, 0.8, 0.3);
        } else if (uColorScheme < 2.5) {
          // Void
          wallColor  = vec3(0.02, 0.0, 0.05) + vec3(0.0, 0.0, 0.1) * hueShift;
          frameColor = mix(vec3(0.4, 0.2, 0.8), vec3(0.8, 0.6, 1.0), hueShift);
          lineColor  = vec3(0.5, 0.3, 1.0);
        } else {
          // Matrix
          float g    = 0.2 + 0.6 * fract(level * 0.618);
          wallColor  = vec3(0.0, 0.03, 0.0);
          frameColor = vec3(0.0, g, 0.0);
          lineColor  = vec3(0.0, 1.0, 0.1);
        }

        // Compose
        vec3 color = wallColor * wallMask;
        color     += frameColor * max(outerFrame, innerFrame);
        color     += lineColor  * max(floorLine, ceilLine) * 0.6;
        color     += lineColor  * max(vanishLeft, vanishRight) * 0.4;

        // The void inside the door opening
        float voidMask = step(0.0, -innerDist - 0.01);
        color          = mix(color, vec3(0.0), voidMask);

        return color;
      }

      // ── Droste mapping ───────────────────────────────────────────────────────
      // Takes screen UV → applies log-polar tiling → returns tile UV and level.
      // The zoom is driven by uTime so that each period we descend one scale.
      vec2 drosteUV(vec2 z, float t, float scale, out float level) {
        // Avoid singularity at origin
        if (length(z) < 1e-5) {
          level = 0.0;
          return vec2(0.5);
        }

        vec2 w = clog(z);

        // Period of tiling in the real (log-zoom) direction
        float P = log(scale);

        // Animate: advance phase so we zoom inward continuously
        w.x -= t * P;

        // Optional twist: rotate phase as zoom advances
        w.y += uTwist * w.x;

        // Tile in both directions
        level  = -floor(w.x / P);      // nesting level (increases inward)
        w.x    = mod(w.x, P);          // fractional zoom within one period

        // Map back: now w is in [0, P] × [−π, π]
        // Normalize to [0, 1]²
        vec2 uv = vec2(w.x / P, w.y / TAU + 0.5);
        return uv;
      }

      void main() {
        vec2 screenUV  = (vUv - 0.5) * 2.0;
        screenUV.x    *= uResolution.x / uResolution.y;

        float t = uTime * uSpeed;

        // ── Apply Droste mapping ─────────────────────────────────────────────
        float level;
        vec2  tileUV = drosteUV(screenUV, t, uScale, level);

        // Slight cross-fade: blend two levels to soften the tile boundary
        float blendFrac = fract(t);
        float level2;
        vec2  tileUV2   = drosteUV(screenUV, t + 0.001, uScale, level2);

        // ── Sample room pattern ──────────────────────────────────────────────
        vec3 roomA = roomPattern(tileUV,  level);
        vec3 roomB = roomPattern(tileUV2, level2);
        vec3 color = mix(roomA, roomB, smoothstep(0.0, 0.1, fract(t * 0.5)));

        // ── Radial vignette to emphasize the tunnel center ───────────────────
        float r        = length(screenUV) / max(uResolution.x, uResolution.y)
                         * min(uResolution.x, uResolution.y);
        float vignette = 1.0 - smoothstep(0.4, 1.0, length(vUv - 0.5) * 2.0);
        color         *= vignette;

        // ── Gamma ────────────────────────────────────────────────────────────
        color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(dt, params) {
    this.uniforms.uTime.value        += dt;
    this.uniforms.uSpeed.value        = params.speed;
    this.uniforms.uScale.value        = 1.0 / params.subdivisionRatio;
    this.uniforms.uColorScheme.value  = params.colorScheme;
    this.uniforms.uTwist.value        = params.twist;
    // DrosteTunnel ignores FOV — the log-polar geometry handles perspective
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
  }
}
