export default class ZenoTunnel {
  constructor(THREE, options = {}) {
    this.THREE = THREE;

    this.uniforms = {
      uTime:             { value: 0.0 },
      uSpeed:            { value: options.speed ?? 1.0 },
      uSubdivisionRatio: { value: options.subdivisionRatio ?? 0.5 },
      uColorScheme:      { value: options.colorScheme ?? 0.0 },
      uResolution:       { value: new THREE.Vector2(800, 600) },
      uFov:              { value: options.fov ?? 1.2 },
      uTwist:            { value: options.twist ?? 0.05 },
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

      // Cosine palette
      vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
        return a + b * cos(6.28318 * (c * t + d));
      }

      void main() {
        vec2 screenUV = (vUv - 0.5) * 2.0; // [-1, 1]
        // Correct for aspect ratio
        screenUV.x *= uResolution.x / uResolution.y;

        float camZ = uTime * uSpeed;

        // Ray direction with perspective
        vec3 ro = vec3(0.0, 0.0, camZ);
        vec3 rd = normalize(vec3(screenUV * uFov, 1.0));

        // Apply camera twist
        float twistAngle = camZ * uTwist;
        float cosT = cos(twistAngle);
        float sinT = sin(twistAngle);
        rd.xy = vec2(cosT * rd.x - sinT * rd.y, sinT * rd.x + cosT * rd.y);

        // Tunnel half-width
        const float W = 1.0;

        // Analytically intersect square tunnel: x=+/-W, y=+/-W
        float best_t = 1e9;
        float wallAxis = 0.0; // 0=x-wall, 1=y-wall
        float wallSign = 1.0;

        // x = +W plane
        if (abs(rd.x) > 1e-6) {
          float t1 = (W - ro.x) / rd.x;
          if (t1 > 1e-4) {
            float hitY = ro.y + t1 * rd.y;
            if (abs(hitY) <= W && t1 < best_t) {
              best_t = t1; wallAxis = 0.0; wallSign = 1.0;
            }
          }
          // x = -W plane
          float t2 = (-W - ro.x) / rd.x;
          if (t2 > 1e-4) {
            float hitY2 = ro.y + t2 * rd.y;
            if (abs(hitY2) <= W && t2 < best_t) {
              best_t = t2; wallAxis = 0.0; wallSign = -1.0;
            }
          }
        }

        // y = +W plane
        if (abs(rd.y) > 1e-6) {
          float t3 = (W - ro.y) / rd.y;
          if (t3 > 1e-4) {
            float hitX = ro.x + t3 * rd.x;
            if (abs(hitX) <= W && t3 < best_t) {
              best_t = t3; wallAxis = 1.0; wallSign = 1.0;
            }
          }
          // y = -W plane
          float t4 = (-W - ro.y) / rd.y;
          if (t4 > 1e-4) {
            float hitX2 = ro.x + t4 * rd.x;
            if (abs(hitX2) <= W && t4 < best_t) {
              best_t = t4; wallAxis = 1.0; wallSign = -1.0;
            }
          }
        }

        // Vanishing point case
        if (best_t >= 1e8) {
          float vpDepth = abs(camZ) + 0.5;
          float logD = log(vpDepth) / log(max(1.0 / uSubdivisionRatio, 1.001));
          float t_level = fract(logD);
          float ringGlow = exp(-t_level * 8.0);
          vec3 color = vec3(ringGlow * 0.8, ringGlow, ringGlow * 0.9);
          gl_FragColor = vec4(color, 1.0);
          return;
        }

        // Hit point
        vec3 hitPoint = ro + best_t * rd;
        float depth = abs(hitPoint.z - camZ) + 0.5;

        // Zeno level calculation
        float logBase = log(max(1.0 / uSubdivisionRatio, 1.001));
        float logDepth = log(depth) / logBase;
        float level = floor(logDepth);
        float t_level = fract(logDepth);

        // Wall UV for grid pattern
        vec2 wallUV;
        if (wallAxis < 0.5) {
          // x-wall: use (z, y) as UV
          wallUV = vec2(hitPoint.z, hitPoint.y);
        } else {
          // y-wall: use (x, z) as UV
          wallUV = vec2(hitPoint.x, hitPoint.z);
        }

        // Tiled UV scaled by level
        float tileScale = pow(2.0, level);
        vec2 tileUV = wallUV * tileScale * (uSubdivisionRatio * 2.0);

        // Grid lines
        vec2 gridFract = abs(fract(tileUV) - 0.5);
        float gridLine = 1.0 - smoothstep(0.02, 0.07, min(gridFract.x, gridFract.y));

        // Zeno ring glow at level boundaries
        float ringGlow = exp(-t_level * 8.0);

        // Base color from scheme
        vec3 baseColor;
        float hueShift = fract(level * 0.618033);

        if (uColorScheme < 0.5) {
          // Cyberpunk
          vec3 a = vec3(0.5, 0.5, 0.5);
          vec3 b = vec3(0.5, 0.5, 0.5);
          vec3 c = vec3(1.0, 1.0, 1.0);
          vec3 d = vec3(0.0, 0.33, 0.67);
          baseColor = cosPalette(hueShift + t_level * 0.1, a, b, c, d);
        } else if (uColorScheme < 1.5) {
          // Golden Hour
          vec3 a = vec3(0.6, 0.5, 0.2);
          vec3 b = vec3(0.4, 0.3, 0.1);
          vec3 c = vec3(1.0, 0.7, 0.4);
          vec3 d = vec3(0.0, 0.15, 0.3);
          baseColor = cosPalette(hueShift + t_level * 0.1, a, b, c, d);
        } else if (uColorScheme < 2.5) {
          // Void
          baseColor = mix(vec3(0.02, 0.0, 0.08), vec3(0.8, 0.7, 1.0), pow(t_level, 2.0));
          baseColor += vec3(0.05, 0.0, 0.15) * hueShift;
        } else {
          // Matrix
          baseColor = vec3(0.0, 0.2 + 0.8 * fract(level * 0.618), 0.0);
        }

        // Blend grid lines (brighter on grid)
        vec3 gridColor = mix(baseColor, vec3(1.0) * (0.6 + 0.4 * hueShift), gridLine * 0.7);

        // Add Zeno ring glow
        vec3 ringColor = mix(gridColor, vec3(1.0, 1.0, 1.0), ringGlow * 0.6);

        // Depth fog
        float fogFactor = exp(-depth * 0.005);
        vec3 foggedColor = mix(vec3(0.0), ringColor, fogFactor);

        // Vignette using original screen UV (not aspect-corrected)
        vec2 vigUV = (vUv - 0.5) * 2.0;
        float vignette = 1.0 - smoothstep(0.5, 1.3, length(vigUV));
        vec3 finalColor = foggedColor * vignette;

        // Gamma correction
        finalColor = pow(max(finalColor, vec3(0.0)), vec3(1.0 / 2.2));

        gl_FragColor = vec4(finalColor, 1.0);
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
    this.uniforms.uTime.value += dt;
    this.uniforms.uSpeed.value = params.speed;
    this.uniforms.uSubdivisionRatio.value = params.subdivisionRatio;
    this.uniforms.uColorScheme.value = params.colorScheme;
    this.uniforms.uFov.value = params.fov;
    this.uniforms.uTwist.value = params.twist;
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
  }
}
