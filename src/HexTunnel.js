/**
 * HexTunnel — hexagonal prism tunnel with analytical intersection.
 *
 * A regular hexagon has 6 sides paired into 3 sets of parallel planes.
 * The outward-facing normals (in the XY plane) are:
 *   n₀ = ( 1,       0    )   → planes  x       = ±R
 *   n₁ = ( 0.5,  √3/2   )   → planes  0.5x + (√3/2)y = ±R
 *   n₂ = (-0.5,  √3/2   )   → planes -0.5x + (√3/2)y = ±R
 *
 * For each plane, we solve  dot(n, ro.xy) + t·dot(n, rd.xy) = ±R
 * and keep the smallest positive t whose hit-point lies inside the hex.
 *
 * A point p is inside the hex iff  max(|p·n₀|, |p·n₁|, |p·n₂|) ≤ R.
 *
 * Wall pattern: a honeycomb UV grid is computed at each Zeno level.
 * The hex edges glow at the Zeno ring boundaries (same ring-glow
 * mechanism as ZenoTunnel).
 */
export default class HexTunnel {
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

      varying vec2 vUv;

      const float TAU    = 6.28318530718;
      const float SQRT3  = 1.7320508076;
      const float SQRT3H = 0.8660254038;  // sqrt(3)/2

      // Cosine palette
      vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
        return a + b * cos(TAU * (c * t + d));
      }

      // ── Hex containment check ────────────────────────────────────────────────
      // Returns true if p (2-D) is inside the unit-apothem hexagon.
      // The hex apothem (inradius) R = 1.0.
      bool insideHex(vec2 p) {
        // Three dot products with the three normal directions
        float d0 = abs(p.x);
        float d1 = abs(0.5 * p.x + SQRT3H * p.y);
        float d2 = abs(-0.5 * p.x + SQRT3H * p.y);
        return max(d0, max(d1, d2)) <= 1.0;
      }

      // ── Hexagonal SDF (2-D) ──────────────────────────────────────────────────
      // Returns signed distance to the regular hex boundary.
      float hexSDF(vec2 p) {
        p = abs(p);
        // Fold into the canonical sector
        float dot_k = dot(vec2(-SQRT3H, 0.5), p);
        p -= 2.0 * min(dot_k, 0.0) * vec2(-SQRT3H, 0.5);
        p.x -= clamp(p.x, -0.5, 0.5);
        p.y -= 1.0;
        return length(p) * sign(p.y);
      }

      // ── Hex tunnel intersection ──────────────────────────────────────────────
      // Test one plane: dot(n, xy) = +R or –R.
      // Returns hit t; writes the surface-side normal component.
      void testHexPlane(vec2 n, float sign_d, float R,
                        vec3 ro, vec3 rd,
                        inout float best_t,
                        inout int   best_face,
                        int face_id) {
        float ndRD = dot(n, rd.xy);
        if (abs(ndRD) < 1e-6) return;

        float t = (sign_d * R - dot(n, ro.xy)) / ndRD;
        if (t < 1e-4 || t >= best_t) return;

        vec2 hitXY = ro.xy + t * rd.xy;
        if (!insideHex(hitXY)) return;

        best_t    = t;
        best_face = face_id;
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

        // ── Intersect with the 6 hex faces (3 pairs of parallel planes) ───────
        const float R = 1.0;

        // Normals for the three pairs
        vec2 n0 = vec2(1.0, 0.0);
        vec2 n1 = vec2(0.5, SQRT3H);
        vec2 n2 = vec2(-0.5, SQRT3H);

        float best_t  = 1e9;
        int   bestFace = -1;

        testHexPlane(n0,  1.0, R, ro, rd, best_t, bestFace, 0);
        testHexPlane(n0, -1.0, R, ro, rd, best_t, bestFace, 1);
        testHexPlane(n1,  1.0, R, ro, rd, best_t, bestFace, 2);
        testHexPlane(n1, -1.0, R, ro, rd, best_t, bestFace, 3);
        testHexPlane(n2,  1.0, R, ro, rd, best_t, bestFace, 4);
        testHexPlane(n2, -1.0, R, ro, rd, best_t, bestFace, 5);

        if (best_t >= 1e8) {
          // Vanishing point
          gl_FragColor = vec4(0.0, 0.0, 0.02, 1.0);
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

        // ── Wall UV (depends on which hex face was hit) ───────────────────────
        // For each face, project the hit-point into a local 2-D coordinate:
        //   u = tangential position around the hex
        //   v = hit.z (depth in the tunnel)
        // The face index encodes which pair of planes:
        //   0,1 → n0-face: tangential = hit.y
        //   2,3 → n1-face: tangential = component perpendicular to n1
        //   4,5 → n2-face: tangential = component perpendicular to n2
        float wallU;
        if (bestFace <= 1) {
          wallU = hit.y;
        } else if (bestFace <= 3) {
          // tangential to n1 is (-SQRT3H, 0.5)
          wallU = dot(vec2(-SQRT3H, 0.5), hit.xy);
        } else {
          // tangential to n2 is (SQRT3H, 0.5)
          wallU = dot(vec2(SQRT3H, 0.5), hit.xy);
        }

        float tileScale = pow(2.0, level) * uSubdivisionRatio * 2.0;
        vec2  tileUV    = vec2(wallU, hit.z) * tileScale;

        // ── Honeycomb grid ───────────────────────────────────────────────────
        // Offset every other row for the honeycomb stagger
        float rowIndex  = floor(tileUV.y);
        float stagger   = 0.5 * mod(rowIndex, 2.0);
        vec2  honeycomb = vec2(tileUV.x + stagger, tileUV.y);

        vec2  hf       = abs(fract(honeycomb) - 0.5);
        float gridLine = 1.0 - smoothstep(0.02, 0.07, min(hf.x, hf.y));

        // Hex-edge accent: add a bright glow near the junction lines
        float hexEdge  = 1.0 - smoothstep(0.0, 0.04, min(hf.x, hf.y));

        // ── Ring glow ────────────────────────────────────────────────────────
        float ringGlow = exp(-t_level * 8.0);

        // ── Color ────────────────────────────────────────────────────────────
        float ct = hueShift + t_level * 0.1;
        vec3 baseColor;

        if (uColorScheme < 0.5) {
          baseColor = cosPalette(ct,
            vec3(0.5), vec3(0.5),
            vec3(1.0), vec3(0.0, 0.33, 0.67));
        } else if (uColorScheme < 1.5) {
          baseColor = cosPalette(ct,
            vec3(0.6, 0.5, 0.2), vec3(0.4, 0.3, 0.1),
            vec3(1.0, 0.7, 0.4), vec3(0.0, 0.15, 0.3));
        } else if (uColorScheme < 2.5) {
          baseColor  = mix(vec3(0.02, 0.0, 0.08), vec3(0.8, 0.7, 1.0),
                           pow(t_level, 2.0));
          baseColor += vec3(0.05, 0.0, 0.15) * hueShift;
        } else {
          baseColor = vec3(0.0, 0.2 + 0.8 * fract(level * 0.618), 0.0);
        }

        // Grid blend
        vec3 gridColor = mix(baseColor,
                             vec3(1.0) * (0.6 + 0.4 * hueShift),
                             gridLine * 0.6);
        // Hex-edge bright accent
        gridColor = mix(gridColor, vec3(1.0, 0.9, 0.6), hexEdge * 0.4);
        // Ring glow
        vec3 ringColor = mix(gridColor, vec3(1.0), ringGlow * 0.6);

        // ── Face tint: slight shade difference between faces ─────────────────
        float faceTint = float(bestFace) / 6.0;
        ringColor     *= 0.85 + 0.15 * cos(TAU * faceTint);

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
}
