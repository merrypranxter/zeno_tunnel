/**
 * FractalTunnel — square tunnel whose walls are painted with live
 * Mandelbrot / Julia-set iteration color.
 *
 * Geometry: identical square prism to ZenoTunnel (4 analytical plane
 * intersections, O(1) per pixel).
 *
 * Fractal coloring:
 *  - Each wall-surface UV is mapped to a complex number c (Mandelbrot)
 *    or a fixed Julia parameter with z₀ = UV (Julia mode).
 *  - Smooth iteration count coloring eliminates banding:
 *      smoothIter = iter – log₂(log₂(|z|²))
 *  - The UV scale per Zeno level decreases by the subdivision ratio so
 *    deeper ring-bands reveal finer fractal detail — the fractal and the
 *    Zeno subdivision work at the same rate.
 *  - To avoid float32 precision limits the zoom is CYCLIC: it resets
 *    every log₂(1/ratio) depth units, so descent feels infinite while
 *    staying in representable range.
 *
 * uFractalMode uniform:
 *   0.0 = Mandelbrot (c = wall UV, z₀ = 0)
 *   1.0 = Julia      (z₀ = wall UV, c = uJuliaC)
 */
export default class FractalTunnel {
  constructor(THREE, options = {}) {
    this.THREE = THREE;

    this.uniforms = {
      uTime:             { value: 0.0 },
      uSpeed:            { value: options.speed ?? 1.0 },
      uSubdivisionRatio: { value: options.subdivisionRatio ?? 0.5 },
      uColorScheme:      { value: options.colorScheme ?? 0.0 },
      uResolution:       { value: new THREE.Vector2(800, 600) },
      uFov:              { value: options.fov ?? 1.2 },
      uTwist:            { value: options.twist ?? 0.04 },
      uFractalMode:      { value: options.fractalMode ?? 0.0 },
      uJuliaC:           { value: new THREE.Vector2(-0.7269, 0.1889) },
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
      uniform float uSubdivisionRatio;
      uniform float uColorScheme;
      uniform vec2  uResolution;
      uniform float uFov;
      uniform float uTwist;
      uniform float uFractalMode;
      uniform vec2  uJuliaC;

      varying vec2 vUv;

      const float TAU = 6.28318530718;
      const int   MAX_ITER = 64;

      // ── Cosine palette ───────────────────────────────────────────────────────
      vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
        return a + b * cos(TAU * (c * t + d));
      }

      // ── Mandelbrot / Julia iteration ─────────────────────────────────────────
      // Returns smooth iteration count in [0, 1].
      // fractalMode == 0: Mandelbrot  (c = seed, z0 = 0)
      // fractalMode == 1: Julia       (z0 = seed, c = uJuliaC)
      float fractalIter(vec2 seed) {
        vec2 z, c;
        if (uFractalMode < 0.5) {
          z = vec2(0.0);
          c = seed;
        } else {
          z = seed;
          c = uJuliaC;
        }

        float iter = 0.0;
        for (int i = 0; i < MAX_ITER; i++) {
          if (dot(z, z) > 4.0) break;
          z     = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
          iter += 1.0;
        }

        // Smooth coloring: removes escape-time banding
        if (iter < float(MAX_ITER)) {
          float log2z  = log2(dot(z, z)) * 0.5;
          float nu     = log2(log2z);
          iter        += 1.0 - nu;
        }

        return iter / float(MAX_ITER);
      }

      void main() {
        vec2 screenUV = (vUv - 0.5) * 2.0;
        screenUV.x   *= uResolution.x / uResolution.y;

        float camZ = uTime * uSpeed;

        vec3 ro = vec3(0.0, 0.0, camZ);
        vec3 rd = normalize(vec3(screenUV * uFov, 1.0));

        // Camera twist
        float twistAngle = camZ * uTwist;
        float cosT = cos(twistAngle), sinT = sin(twistAngle);
        rd.xy = vec2(cosT * rd.x - sinT * rd.y,
                     sinT * rd.x + cosT * rd.y);

        // ── Square tunnel intersection (same as ZenoTunnel) ──────────────────
        const float W = 1.0;
        float best_t  = 1e9;
        float wallAxis = 0.0, wallSign = 1.0;

        if (abs(rd.x) > 1e-6) {
          float t1 = (W - ro.x) / rd.x;
          if (t1 > 1e-4 && abs(ro.y + t1 * rd.y) <= W && t1 < best_t) {
            best_t = t1; wallAxis = 0.0; wallSign = 1.0;
          }
          float t2 = (-W - ro.x) / rd.x;
          if (t2 > 1e-4 && abs(ro.y + t2 * rd.y) <= W && t2 < best_t) {
            best_t = t2; wallAxis = 0.0; wallSign = -1.0;
          }
        }
        if (abs(rd.y) > 1e-6) {
          float t3 = (W - ro.y) / rd.y;
          if (t3 > 1e-4 && abs(ro.x + t3 * rd.x) <= W && t3 < best_t) {
            best_t = t3; wallAxis = 1.0; wallSign = 1.0;
          }
          float t4 = (-W - ro.y) / rd.y;
          if (t4 > 1e-4 && abs(ro.x + t4 * rd.x) <= W && t4 < best_t) {
            best_t = t4; wallAxis = 1.0; wallSign = -1.0;
          }
        }

        // Vanishing point
        if (best_t >= 1e8) {
          gl_FragColor = vec4(0.0, 0.02, 0.0, 1.0);
          return;
        }

        vec3  hit   = ro + best_t * rd;
        float depth = abs(hit.z - camZ) + 0.5;

        // ── Zeno level ───────────────────────────────────────────────────────
        float logBase  = log(max(1.0 / uSubdivisionRatio, 1.001));
        float logDepth = log(depth) / logBase;
        float level    = floor(logDepth);
        float t_level  = fract(logDepth);
        float hueShift = fract(level * 0.618033);

        // ── Wall UV → fractal coordinate ────────────────────────────────────
        // Surface UV (before scaling)
        vec2 wallUV;
        if (wallAxis < 0.5) {
          wallUV = vec2(hit.z, hit.y);
        } else {
          wallUV = vec2(hit.x, hit.z);
        }

        // Cyclic zoom: per-level scale keeps coordinates in float32 range.
        // Each level zooms in by subdivisionRatio; we cycle so the range
        // stays within approximately [−2, 2] × [−2, 2].
        float zoomScale = pow(uSubdivisionRatio * 2.0, -level);
        // Clamp to avoid denormals at extreme levels
        zoomScale = clamp(zoomScale, 1e-5, 1e5);

        // For Mandelbrot, center on a scenic boundary region.
        // Offset cycles with level to visit different parts of the set.
        vec2 fractalCenter = vec2(
          -0.7269 + 0.3 * cos(level * 2.399),   // golden-angle latitude drift
           0.1889 + 0.3 * sin(level * 2.399)
        );
        vec2 fractalSeed = fractalCenter + wallUV * zoomScale * 0.5;

        float fi = fractalIter(fractalSeed);

        // ── Ring glow ────────────────────────────────────────────────────────
        float ringGlow = exp(-t_level * 8.0);

        // ── Color: map fractal iteration to palette ──────────────────────────
        float colorT = fi * 3.0 + hueShift * 0.5;
        vec3 baseColor;

        if (uColorScheme < 0.5) {
          // Cyberpunk
          baseColor = cosPalette(colorT,
            vec3(0.5), vec3(0.5),
            vec3(1.0), vec3(0.0, 0.33, 0.67));
        } else if (uColorScheme < 1.5) {
          // Golden Hour
          baseColor = cosPalette(colorT,
            vec3(0.6, 0.5, 0.2), vec3(0.4, 0.3, 0.1),
            vec3(1.0, 0.7, 0.4), vec3(0.0, 0.15, 0.3));
        } else if (uColorScheme < 2.5) {
          // Void
          baseColor  = mix(vec3(0.01, 0.0, 0.06), vec3(0.9, 0.8, 1.0), fi);
          baseColor += vec3(0.0, 0.0, 0.2) * (1.0 - fi);
        } else {
          // Matrix — green fractal escape
          baseColor = vec3(0.0, fi * 0.9, fi * 0.15);
        }

        // Add ring glow
        vec3 ringColor = mix(baseColor, vec3(1.0), ringGlow * 0.5);

        // ── Interior of Mandelbrot set is rendered as deep void ──────────────
        // fi == 1.0 means the point did not escape → in the set
        float inSet    = step(0.9999, fi);
        ringColor      = mix(ringColor, vec3(0.0, 0.0, 0.02), inSet);

        // ── Fog, vignette, gamma ─────────────────────────────────────────────
        float fog      = exp(-depth * 0.005);
        vec3  fogged   = mix(vec3(0.0), ringColor, fog);

        vec2  vigUV    = (vUv - 0.5) * 2.0;
        float vignette = 1.0 - smoothstep(0.5, 1.3, length(vigUV));
        vec3  final    = fogged * vignette;

        final = pow(max(final, vec3(0.0)), vec3(1.0 / 2.2));
        gl_FragColor = vec4(final, 1.0);
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
    this.uniforms.uTime.value            += dt;
    this.uniforms.uSpeed.value            = params.speed;
    this.uniforms.uSubdivisionRatio.value = params.subdivisionRatio;
    this.uniforms.uColorScheme.value      = params.colorScheme;
    this.uniforms.uFov.value              = params.fov;
    this.uniforms.uTwist.value            = params.twist;
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
  }

  /** Switch between Mandelbrot (mode=0) and Julia (mode=1) */
  setFractalMode(mode) {
    this.uniforms.uFractalMode.value = mode;
  }

  /** Set the Julia constant c (ignored in Mandelbrot mode) */
  setJuliaC(re, im) {
    this.uniforms.uJuliaC.value.set(re, im);
  }
}
