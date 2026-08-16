/** GLSL ES 3.00 shader sources. */

export const CLOTH_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;

uniform mat4 uProj;
uniform mat4 uView;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;

void main() {
  vWorldPos = aPos;
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}
`;

export const CLOTH_FRAG = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;

uniform vec3 uLightDir; // normalized, pointing toward the light
uniform vec3 uViewPos;
uniform vec3 uBaseColor;
uniform vec3 uColor2;
uniform float uUseVertexColor; // 1 = strain heatmap, 0 = checker
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uOpacity;

out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 base;
  if (uUseVertexColor > 0.5) {
    base = vColor;
  } else {
    float ch = mod(floor(vWorldPos.x * 8.0) + floor(vWorldPos.y * 8.0), 2.0);
    base = mix(uBaseColor, uColor2, ch);
  }
  vec3 L = normalize(uLightDir);
  float diff = abs(dot(n, L)); // double-sided
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 64.0);
  vec3 col = base * (0.16 + 0.92 * diff) + vec3(spec * 0.35);
  float fog = smoothstep(uFogStart, uFogEnd, distance(uViewPos, vWorldPos));
  col = mix(col, uFogColor, fog);
  fragColor = vec4(col, uOpacity);
}
`;

export const SPHERE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * wp;
}
`;

export const SPHERE_FRAG = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;

uniform vec3 uLightDir;
uniform vec3 uViewPos;
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;

out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  float diff = abs(dot(n, L));
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 48.0);
  vec3 col = uColor * (0.14 + 0.9 * diff) + vec3(spec * 0.5);
  float fog = smoothstep(uFogStart, uFogEnd, distance(uViewPos, vWorldPos));
  col = mix(col, uFogColor, fog);
  fragColor = vec4(col, 1.0); // opaque sphere
}
`;

export const FLAT_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;

uniform mat4 uProj;
uniform mat4 uView;

void main() {
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}
`;

export const FLAT_FRAG = `#version 300 es
precision highp float;

uniform vec4 uColor;

out vec4 fragColor;

void main() {
  fragColor = uColor;
}
`;
