/**
 * GoldenSpiralTunnel — cylindrical Zeno descent with φ-based geometry
 *
 * Cross-section: circle (cylinder).  Ray-cylinder intersection is
 * analytical (O(1) per pixel).
 *
 * Signature differences from ZenoTunnel:
 *  - default subdivisionRatio = 1/φ ≈ 0.618
 *  - camera orbits the Z-axis as it advances (equiangular spiral path)
 *  - wall UV uses the polar angle θ, producing helical grid lines
 *  - the log base for Zeno levels defaults to φ, so ring spacing feels
 *    "golden": each successive ring is 1/φ closer than the previous
 */
export default class GoldenSpiralTunnel {
  constructor(THREE, options = {}) {
    this.THREE = THREE;

    this.uniforms = {
      uTime:             { value: 0.0 },
      uSpeed:            { value: options.speed ?? 1.0 },
      uSubdivisionRatio: { value: options.subdivisionRatio ?? 0.618 },
      uColorScheme:      { value: options.colorScheme ?? 0.0 },
      uResolution:       { value: new THREE.Vector2(800, 600) },
      uFov:              { value: options.fov ?? 1.2 },
      uTwist:            { value: options.twist ?? 0.03 },
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

      const float PHI = 1.6180339887;
      const float TAU = 6.28318530718;

      // Cosine palette (Inigo Quilez)
      vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
        return a + b * cos(TAU * (c * t + d));
      }

      void main() {
        vec2 screenUV = (vUv - 0.5) * 2.0;
        screenUV.x *= uResolution.x / uResolution.y;

        float camZ = uTime * uSpeed;

        // ── Camera orbits the tunnel axis as it descends ──────────────────────
        // The orbital angle advances by uTwist per unit of depth, so the camera
        // traces a helix whose pitch equals the twist rate.  A small orbit radius
        // (0.2) keeps the view well inside the unit cylinder.
        float orbitAngle = camZ * uTwist;
        float orbitR     = 0.2;
        vec3 ro = vec3(orbitR * cos(orbitAngle), orbitR * sin(orbitAngle), camZ);

        // Ray direction with perspective FOV
        vec3 rd = normalize(vec3(screenUV * uFov, 1.0));

        // Apply the same helical twist to the ray (keeps horizon level)
        float cosT = cos(orbitAngle);
        float sinT = sin(orbitAngle);
        rd.xy = vec2(cosT * rd.x - sinT * rd.y,
                     sinT * rd.x + cosT * rd.y);

        // ── Ray-cylinder intersection ────────────────────────────────────────
        // Infinite cylinder: x² + y² = R²  (R = 1.0)
        //   a·t² + 2b·t + c = 0
        //   a = |rd.xy|²,  b = dot(ro.xy, rd.xy),  c = |ro.xy|² – R²
        // Camera is inside the cylinder so c < 0 and discriminant > 0.
        // We want the forward intersection (+sqrt).
        const float R = 1.0;
        float a    = dot(rd.xy, rd.xy);
        float b    = dot(ro.xy, rd.xy);
        float cOff = dot(ro.xy, ro.xy) - R * R;

        float disc  = b * b - a * cOff;
        float t_hit = (-b + sqrt(max(disc, 0.0))) / a;

        if (t_hit < 1e-4) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        vec3 hit   = ro + t_hit * rd;
        float depth = abs(hit.z - camZ) + 0.5;

        // ── Polar angle on cylinder surface ──────────────────────────────────
        float theta     = atan(hit.y, hit.x);    // [-π, π]
        float thetaNorm = theta / TAU + 0.5;     // [0, 1]

        // ── Zeno level using golden-ratio subdivision ─────────────────────────
        float logBase  = log(max(1.0 / uSubdivisionRatio, 1.001));
        float logDepth = log(depth) / logBase;
        float level    = floor(logDepth);
        float t_level  = fract(logDepth);

        float hueShift = fract(level * 0.618033); // golden-ratio hue stepping

        // ── Spiral UV on cylinder wall ────────────────────────────────────────
        // The Z-axis coordinate is scaled by the current Zeno level so that
        // tiles at deeper levels are proportionally narrower.  A horizontal
        // shear by 0.5 × thetaNorm rotates the grid lines into a helix.
        float tileScale = pow(PHI, level) * 0.5 * uSubdivisionRatio * 2.0;
        float uCoord    = hit.z * tileScale;
        float vCoord    = thetaNorm * 8.0;        // 8 repeats around circumference

        // shear to produce a single family of spiral stripes
        vec2 spiralUV = vec2(
          fract(uCoord + thetaNorm * 2.0),        // spiral shear
          fract(vCoord)
        );

        vec2  gf       = abs(spiralUV - 0.5);
        float gridLine = 1.0 - smoothstep(0.02, 0.07, min(gf.x, gf.y));

        // ── Zeno ring glow at level boundaries ────────────────────────────────
        float ringGlow = exp(-t_level * 8.0);

        // ── Color palettes ────────────────────────────────────────────────────
        float ct = hueShift + t_level * 0.1;
        vec3 baseColor;

        if (uColorScheme < 0.5) {
          // Cyberpunk
          baseColor = cosPalette(ct,
            vec3(0.5), vec3(0.5), vec3(1.0),
            vec3(0.0, 0.33, 0.67));
        } else if (uColorScheme < 1.5) {
          // Golden Hour — warm amber/gold, fitting for φ
          baseColor = cosPalette(ct,
            vec3(0.6, 0.5, 0.2), vec3(0.4, 0.3, 0.1),
            vec3(1.0, 0.7, 0.4), vec3(0.0, 0.15, 0.3));
        } else if (uColorScheme < 2.5) {
          // Void
          baseColor  = mix(vec3(0.02, 0.0, 0.08), vec3(0.8, 0.7, 1.0),
                           pow(t_level, 2.0));
          baseColor += vec3(0.05, 0.0, 0.15) * hueShift;
        } else {
          // Matrix
          baseColor = vec3(0.0, 0.2 + 0.8 * fract(level * 0.618), 0.0);
        }

        vec3 gridColor = mix(baseColor,
                             vec3(1.0) * (0.6 + 0.4 * hueShift),
                             gridLine * 0.7);
        vec3 ringColor = mix(gridColor, vec3(1.0), ringGlow * 0.6);

        // ── Fog & vignette ────────────────────────────────────────────────────
        float fog      = exp(-depth * 0.004);
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
