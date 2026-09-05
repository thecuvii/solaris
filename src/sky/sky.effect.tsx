'use client'

// Requires: react

import { useMemo, useRef, type CSSProperties, type RefObject } from 'react'

import { type CanvasRenderer, useCanvasRenderer } from '../internal/use-canvas-renderer'

/*
 * The Sun as photographed from the Earth's surface: a haze-softened,
 * refraction-flattened disc with per-row atmospheric extinction, limb
 * darkening, thin-cloud striations, seeing shimmer, camera glare, and a
 * mu6k-style lens flare.
 *
 * Single fullscreen pass, no textures, no render targets. The physical
 * ingredients are closed-form fits rather than a scattering integral:
 * Kasten–Young airmass, per-channel Rayleigh/aerosol/ozone optical depth,
 * Neckel per-wavelength limb darkening, the NOAA apparent-elevation
 * refraction polynomial, and Spencer/Vos-style glare wings measured from the
 * disc edge. Display is a normalized photographic exposure: the disc centre
 * is the reference luminance, so the same exposure reads sensibly from
 * horizon to noon.
 */

export type SkyComposition = {
  bottom?: CSSProperties['bottom']
  height: CSSProperties['height']
  width: CSSProperties['width']
}

export type SkyEffectProps = {
  className?: string
  /** Thin horizontal cloud/inversion striations across the low disc. */
  cloudStreaks?: number
  /** Disc layout box. The canvas can be larger so glow is not clipped. */
  composition?: SkyComposition
  /** Editorial yellow→orange→magenta disc grade. Stays on the disc. */
  duskFlush?: number
  /** Linear scene gain relative to the disc centre before tone mapping. */
  exposure?: number
  /** Scattering-sky amount. 0 is a dark indigo plate; 1 is the physical field. */
  field?: number
  /** Lens flare strength: 1/r hotspot with soft noise rays and chromatic ghosts. */
  flare?: number
  /** Direction from the sun to the virtual optical centre, in degrees. Ghosts line up on it. */
  flareAngle?: number
  /** Ray density. 0 is a few broad soft rays; 1 is a dense burst of hairlines. */
  flareRays?: number
  /** Aperture star: eight diaphragm diffraction spikes, rotated by flareAngle. */
  flareStar?: number
  /** Camera glare strength: near-limb bloom, wide wings, and veiling. */
  glare?: number
  /** Aerosol load. Softens the limb, tightens the aureole, and greys the sky. */
  haze?: number
  /** Chappuis ozone absorption multiplier; controls the pink/purple twilight cast. */
  ozone?: number
  /** Disc and glow chroma. 1 preserves the physical tint. */
  saturation?: number
  /** NOAA apparent-elevation refraction multiplier; flattens the low disc. */
  refraction?: number
  /** Refractive shimmer amplitude near the horizon. */
  seeingAmount?: number
  /** Refractive shimmer speed multiplier. */
  seeingSpeed?: number
  /** Slow drift speed of the cloud striations. */
  streakDrift?: number
  style?: CSSProperties
  /** True solar-centre elevation in degrees. */
  sunElevation?: number
  /** Disc radius as a fraction of the shorter composition half-side. */
  sunScale?: number
  /** Extra canvas bleed around the composition box. */
  viewport?: Pick<CSSProperties, 'bottom' | 'left' | 'right' | 'top'>
}

type SkySettings = {
  cloudStreaks: number
  duskFlush: number
  exposure: number
  field: number
  flare: number
  flareAngle: number
  flareRays: number
  flareStar: number
  glare: number
  haze: number
  ozone: number
  refraction: number
  saturation: number
  seeingAmount: number
  seeingSpeed: number
  streakDrift: number
  sunElevation: number
  sunScale: number
}

type SkyUniforms = {
  cloudStreaks: WebGLUniformLocation | null
  compositionCenter: WebGLUniformLocation | null
  compositionScale: WebGLUniformLocation | null
  duskFlush: WebGLUniformLocation | null
  exposure: WebGLUniformLocation | null
  field: WebGLUniformLocation | null
  flare: WebGLUniformLocation | null
  flareAngle: WebGLUniformLocation | null
  flareRays: WebGLUniformLocation | null
  flareStar: WebGLUniformLocation | null
  glare: WebGLUniformLocation | null
  haze: WebGLUniformLocation | null
  ozone: WebGLUniformLocation | null
  refraction: WebGLUniformLocation | null
  resolution: WebGLUniformLocation | null
  saturation: WebGLUniformLocation | null
  seeingAmount: WebGLUniformLocation | null
  seeingSpeed: WebGLUniformLocation | null
  streakDrift: WebGLUniformLocation | null
  sunElevation: WebGLUniformLocation | null
  sunScale: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
}

type SkyResources = {
  program: WebGLProgram
  uniforms: SkyUniforms
  vertexArray: WebGLVertexArrayObject
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float uCloudStreaks;
uniform vec2 uCompositionCenter;
uniform float uCompositionScale;
uniform float uDuskFlush;
uniform float uExposure;
uniform float uField;
uniform float uFlare;
uniform float uFlareAngle;
uniform float uFlareRays;
uniform float uFlareStar;
uniform float uGlare;
uniform float uHaze;
uniform float uOzone;
uniform float uRefraction;
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uSeeingAmount;
uniform float uSeeingSpeed;
uniform float uStreakDrift;
uniform float uSunElevation;
uniform float uSunScale;
uniform float uTime;

out vec4 fragColor;

const float PI = 3.141592653589793;
// Apparent solar radius in degrees (0.533 deg diameter).
const float SUN_RADIUS = 0.2665;
// Editorial exaggeration of the differential extinction across the disc.
const float DISC_GRADIENT_STRETCH = 2.5;
// Single-scatter sky gain relative to the disc-centre exposure reference.
const float SKY_GAIN = 0.22;
const vec3 LUMINANCE = vec3(0.2126, 0.7152, 0.0722);
// Sea-level zenith optical depths for ~(650, 550, 450) nm.
const vec3 TAU_RAYLEIGH = vec3(0.050, 0.098, 0.218);
const vec3 TAU_AEROSOL = vec3(0.045, 0.050, 0.060);
// Chappuis band: green/yellow peak (Heckel / Frostbite RGB fit, zenith-OD units).
const vec3 TAU_OZONE = vec3(0.012, 0.035, 0.0016);
// Neckel per-wavelength limb-darkening exponents (blue darkens fastest).
const vec3 LIMB_EXPONENT = vec3(0.397, 0.503, 0.652);
const vec3 GLARE_TINT = vec3(1.0, 0.80, 0.46);
const vec3 INDIGO_FIELD = vec3(0.016, 0.014, 0.032);

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}

float valueNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm2(vec2 p) {
  return 0.55 * valueNoise2(p) +
    0.3 * valueNoise2(p * 2.07 + vec2(3.1, 7.7)) +
    0.15 * valueNoise2(p * 4.19 + vec2(9.3, 1.7));
}

// One cirrus sheet: long filaments across the view, broken along their length.
// x is density, y is a silver-lining mask that peaks on the filament edge.
vec2 cirrusSheet(
  vec2 field,
  float tilt,
  float alongScale,
  float acrossScale,
  float drift,
  float seed
) {
  float cosine = cos(tilt);
  float sine = sin(tilt);
  float along = field.x * cosine + field.y * sine;
  float across = -field.x * sine + field.y * cosine;
  vec2 p = vec2(along * alongScale + drift, across * acrossScale + seed);
  vec2 warp = vec2(
    fbm2(p * 0.42 + vec2(seed, 4.6)),
    fbm2(p * 0.42 + vec2(9.1, seed))
  ) - 0.5;
  p += warp * 0.62;
  float body = fbm2(p);
  float grain = fbm2(p * 2.35 + vec2(14.0, seed));
  float band = smoothstep(0.36, 0.56, body) * (1.0 - smoothstep(0.64, 0.9, body));
  float breakup = smoothstep(0.22, 0.68, fbm2(vec2(along * 0.18 + drift * 0.22, across * 1.15 + seed)));
  band *= mix(0.5, 1.0, grain) * breakup;
  return vec2(band, band * (1.0 - band) * 4.0);
}

// NOAA solar-position refraction in degrees for a true elevation in degrees.
float refractionCorrection(float elevationDegrees) {
  if (elevationDegrees > 85.0) return 0.0;
  float tangent = tan(radians(elevationDegrees));
  if (elevationDegrees > 5.0) {
    return (58.1 / tangent - 0.07 / pow(tangent, 3.0) + 0.000086 / pow(tangent, 5.0)) /
      3600.0;
  }
  if (elevationDegrees > -0.575) {
    return (
      1735.0 - 518.2 * elevationDegrees + 103.4 * elevationDegrees * elevationDegrees -
      12.79 * pow(elevationDegrees, 3.0) + 0.711 * pow(elevationDegrees, 4.0)
    ) / 3600.0;
  }
  return (-20.772 / tangent) / 3600.0;
}

float apparentElevation(float trueElevation) {
  return trueElevation + refractionCorrection(trueElevation) * uRefraction;
}

// Kasten–Young (1989) relative airmass; ~38 at the horizon.
float airmass(float elevationDegrees) {
  float h = max(elevationDegrees, 0.0);
  return 1.0 / (sin(radians(h)) + 0.50572 * pow(h + 6.07995, -1.6364));
}

vec3 opticalDepth() {
  return TAU_RAYLEIGH + TAU_AEROSOL * mix(0.3, 2.5, uHaze) + TAU_OZONE * uOzone;
}

vec3 transmittance(float elevationDegrees) {
  return exp(-opticalDepth() * airmass(elevationDegrees));
}

float rayleighPhase(float mu) {
  return (3.0 / (16.0 * PI)) * (1.0 + mu * mu);
}

float miePhase(float mu) {
  float g = mix(0.65, 0.82, uHaze);
  float gg = g * g;
  float num = 3.0 * (1.0 - gg) * (1.0 + mu * mu);
  float den = (8.0 * PI) * (2.0 + gg) * pow(max(1.0 + gg - 2.0 * g * mu, 1e-4), 1.5);
  return num / den;
}

// Heckel skyDome softSunDisc: gaussian core, limb roll-off, exponential halo.
float softSunDisc(float theta, float radius) {
  float safeRadius = max(radius, 1e-5);
  float core = exp(-pow(theta / max(safeRadius * 0.7, 1e-5), 2.0));
  float limb = smoothstep(safeRadius * 1.3, safeRadius * 0.2, theta);
  float halo = exp(-theta / max(safeRadius * 18.0, 1e-5));
  return core * limb + 0.25 * halo;
}

vec3 saturateColor(vec3 color, float amount) {
  float luminance = max(dot(color, LUMINANCE), 0.0);
  return mix(vec3(luminance), color, amount);
}

// Lens flare after mu6k (Shadertoy 4sX3Rs), the pattern most procedural
// flares derive from. uv is frame space with the optical centre at 0 and
// the frame height spanning 1; pos is the sun in that space.
//
// Hotspot: a 1/r glow (long tail, unlike the gaussian camera glare) whose
// angular noise modulation gives the soft uneven rays seen in photos.
float flareRays(vec2 uv, vec2 pos, float rayGain, float sizeScale, float density) {
  vec2 main = uv - pos;
  float ang = atan(main.x, main.y);
  // Glow footprint grows with the disc's apparent size.
  float r = length(main) / sizeScale;
  float dist = pow(r, 0.1);
  // mu6k uses 1/(16r+1); the extra quadratic term shortens the tail so the
  // far field is veiled rather than flooded.
  float f0 = 1.0 / (r * r * 160.0 + r * 16.0 + 1.0);
  // Seamless in angle: noise is fed trig functions of the angle, as in mu6k.
  // Broad rays are always present; the fine set fades in with density.
  float coarse = sin(valueNoise1(sin(ang * 2.0 + pos.x) * 4.0 - cos(ang * 3.0 + pos.y)) * 16.0);
  float fine = sin(valueNoise1(sin(ang * 5.0) * 7.0 + cos(ang * 7.0) * 3.0 + 31.0) * 24.0);
  // Hairline streaks: density sets both how many angles the noise can light
  // up (frequency) and how few survive the threshold (power).
  float hairFreq = mix(3.0, 11.0, density);
  float hairNoise = valueNoise1(sin(ang * 9.0) * hairFreq + cos(ang * 13.0) * hairFreq * 0.45 + 57.0);
  float hair = pow(hairNoise, mix(30.0, 6.0, density));
  float rays = coarse * 0.1 + fine * 0.06 * density + hair * mix(0.55, 0.3, density);
  return f0 + f0 * (rays * rayGain + dist * 0.1 + 0.8);
}

// Aperture star: diaphragm diffraction spikes. Each spike is a soft line of
// roughly constant width that fades along its length, so it reads as a
// bright wedge near the disc and tapers out, not a hairline to the edge.
// Eight primary spikes plus a weaker interleaved set; lengths vary.
float apertureSpike(vec2 p, float dirAngle, float len, float width) {
  vec2 d = vec2(cos(dirAngle), sin(dirAngle));
  float along = dot(p, d);
  float across = abs(p.x * d.y - p.y * d.x);
  float w = width + along * 0.035;
  float taper = exp(-pow(max(along, 0.0) / len, 1.5));
  return exp(-pow(across / w, 2.0)) * taper * step(0.0, along);
}

float apertureStar(vec2 p, float rotation, float sizeScale) {
  p /= sizeScale;
  float star = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = rotation + fi * (PI / 4.0);
    float len = mix(0.09, 0.22, hash11(fi + 3.0));
    star += apertureSpike(p, a, len, 0.005);
    star += apertureSpike(p, a + PI / 8.0, len * 0.45, 0.0035) * 0.35;
  }
  return star;
}

// Ghosts: soft discs and Lorentzian blobs along the sun-to-centre axis in
// barrel-warped coordinates, each channel offset slightly for dispersion.
vec3 flareGhosts(vec2 uv, vec2 pos) {
  vec2 uvd = uv * length(uv);
  vec3 c = vec3(0.0);
  vec3 k;
  // Far Lorentzian blobs past the optical centre.
  k = vec3(0.8, 0.85, 0.9);
  c += vec3(
    1.0 / (1.0 + 32.0 * pow(length(uvd + k.x * pos), 2.0)),
    1.0 / (1.0 + 32.0 * pow(length(uvd + k.y * pos), 2.0)),
    1.0 / (1.0 + 32.0 * pow(length(uvd + k.z * pos), 2.0))
  ) * vec3(0.25, 0.23, 0.21) * 0.25;
  // Soft discs between the sun and the centre.
  vec2 uvx = mix(uv, uvd, -0.5);
  k = vec3(0.4, 0.45, 0.5);
  c += vec3(
    max(0.01 - pow(length(uvx + k.x * pos), 2.4), 0.0) * 6.0,
    max(0.01 - pow(length(uvx + k.y * pos), 2.4), 0.0) * 5.0,
    max(0.01 - pow(length(uvx + k.z * pos), 2.4), 0.0) * 3.0
  );
  // Tight discs.
  uvx = mix(uv, uvd, -0.4);
  k = vec3(0.2, 0.4, 0.6);
  c += vec3(
    max(0.01 - pow(length(uvx + k.x * pos), 5.5), 0.0) * 2.0,
    max(0.01 - pow(length(uvx + k.y * pos), 5.5), 0.0) * 2.0,
    max(0.01 - pow(length(uvx + k.z * pos), 5.5), 0.0) * 2.0
  );
  // Large disc on the sun side of the centre.
  uvx = mix(uv, uvd, -0.5);
  k = vec3(0.3, 0.325, 0.35);
  c += vec3(
    max(0.01 - pow(length(uvx - k.x * pos), 1.6), 0.0) * 6.0,
    max(0.01 - pow(length(uvx - k.y * pos), 1.6), 0.0) * 3.0,
    max(0.01 - pow(length(uvx - k.z * pos), 1.6), 0.0) * 5.0
  );
  return c;
}

vec3 acesToneMap(vec3 color) {
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

vec3 linearToSrgb(vec3 color) {
  color = max(color, 0.0);
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), color));
}

float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 screen = (2.0 * (gl_FragCoord.xy - uCompositionCenter)) / uCompositionScale;
  // Angular offset from the apparent disc centre, in degrees.
  vec2 angular = screen * (SUN_RADIUS / uSunScale);

  float trueCentre = uSunElevation;
  float apparentCentre = apparentElevation(trueCentre);
  float apparentTop = apparentElevation(trueCentre + SUN_RADIUS);
  float apparentBottom = apparentElevation(trueCentre - SUN_RADIUS);
  float apparentElev = apparentCentre + angular.y;

  // Seeing: low-frequency animated warp of the viewing direction near the horizon.
  float horizonProximity = exp(-max(apparentElev, 0.0) / 2.5);
  float seeingPhase = uTime * uSeeingSpeed;
  vec2 seeing = vec2(
    fbm2(angular * 7.0 + vec2(seeingPhase * 0.55, 0.0)),
    fbm2(angular * 7.0 + vec2(13.7, -seeingPhase * 0.45))
  ) - 0.5;
  vec2 discAngular = angular + seeing * (0.025 * uSeeingAmount * horizonProximity);
  float discApparentElev = apparentCentre + discAngular.y;

  // Apparent -> true disc coordinate. The lower half is compressed more than
  // the upper half because refraction grows fastest toward the horizon.
  float yTrue = discApparentElev < apparentCentre
    ? (discApparentElev - apparentCentre) / max(apparentCentre - apparentBottom, 1e-4) * SUN_RADIUS
    : (discApparentElev - apparentCentre) / max(apparentTop - apparentCentre, 1e-4) * SUN_RADIUS;
  float radial = length(vec2(discAngular.x, yTrue)) / SUN_RADIUS;
  float edgeDistance = (radial - 1.0) * SUN_RADIUS;
  float outsideEdge = max(edgeDistance, 0.0);

  // Direct sunlight colour; the disc centre defines the exposure reference.
  vec3 sunTransmittance = transmittance(trueCentre);
  float centreLuminance = max(dot(sunTransmittance, LUMINANCE), 1e-5);
  vec3 sunTint = sunTransmittance / centreLuminance;
  float skyLightFactor = smoothstep(-9.0, 3.5, trueCentre);
  float directSunFactor = smoothstep(-4.5, 1.7, trueCentre);

  // Disc: per-row extinction, Neckel limb darkening, Heckel softSunDisc edge.
  float muLimb = sqrt(max(1.0 - radial * radial, 0.0));
  vec3 limb = mix(pow(vec3(muLimb), LIMB_EXPONENT), vec3(1.0), uHaze * 0.85);
  float rowElevation = trueCentre + yTrue * DISC_GRADIENT_STRETCH;
  vec3 discRadiance = transmittance(rowElevation) / centreLuminance * limb;
  discRadiance = saturateColor(discRadiance, uSaturation);
  vec3 glowTint = saturateColor(sunTint * GLARE_TINT, uSaturation);
  float theta = length(vec2(discAngular.x, yTrue));
  float height = clamp(yTrue / SUN_RADIUS, -1.2, 1.2);
  // Physical path: Heckel softSunDisc, haze-widened. Poster path: keep the
  // geometric radius and let haze only blur the limb, so the grade cannot
  // paint the field.
  float physicalRadius = SUN_RADIUS * mix(1.0, 1.55, uHaze);
  float sunShapePhysical = softSunDisc(theta, physicalRadius);
  // Poster disc is a hard circle with ~1 px AA. Haze must not feather it.
  float pixelSoft = (SUN_RADIUS / max(uSunScale, 1e-4)) * 1.25 / max(uCompositionScale, 1.0);
  float sunShapePoster = 1.0 - smoothstep(SUN_RADIUS, SUN_RADIUS + pixelSoft, theta);
  float sunShape = mix(sunShapePhysical, sunShapePoster, uDuskFlush);
  float bloomWidth = SUN_RADIUS * 0.008;
  float posterBloom = exp(-pow(max(theta - SUN_RADIUS, 0.0) / max(bloomWidth, 1e-5), 2.0));
  // Same stops as the display grade: yellow → orange → hot magenta.
  float toAmber = smoothstep(0.95, 0.08, height);
  float toMagenta = smoothstep(0.18, -0.78, height);
  vec3 posterRamp = mix(vec3(1.16, 1.06, 0.34), vec3(1.08, 0.50, 0.08), toAmber);
  posterRamp = mix(posterRamp, vec3(1.04, 0.12, 0.44), toMagenta);

  // Cirrus / stratus: a few anisotropic sheets, not 1D scanlines.
  float streakHeight = mix(0.28, 1.0, exp(-max(discApparentElev, 0.0) / 11.0));
  float drift = uTime * uStreakDrift;
  vec2 streakField = vec2(angular.x, discApparentElev);
  vec2 sheetA = cirrusSheet(streakField, 0.045, 0.42, 11.0, drift * 0.085, 3.2);
  vec2 sheetB = cirrusSheet(streakField, -0.08, 0.28, 16.5, drift * 0.13, 18.7);
  vec2 sheetC = cirrusSheet(streakField, 0.12, 0.2, 22.0, drift * 0.055, 41.4);
  float streakOptical = (sheetA.x * 0.72 + sheetB.x * 0.5 + sheetC.x * 0.32) * streakHeight;
  float streakLining = (sheetA.y * 0.7 + sheetB.y * 0.45 + sheetC.y * 0.28) * streakHeight;
  float streakDepth = streakOptical * uCloudStreaks;
  float streaks = exp(-streakDepth * 1.85);
  float skyStreaks = exp(-streakDepth * 0.42);

  // Two-airmass single scatter (Heckel light-march, closed form for a ground observer).
  vec3 viewTransmittance = transmittance(apparentElev);
  float phaseMu = cos(radians(length(angular)));
  vec3 extinction = max(opticalDepth(), vec3(1e-5));
  vec3 scatterCoeff =
    TAU_RAYLEIGH * rayleighPhase(phaseMu) +
    TAU_AEROSOL * mix(0.3, 2.5, uHaze) * miePhase(phaseMu);
  vec3 physicalSky =
    scatterCoeff / extinction * (1.0 - viewTransmittance) * sunTransmittance /
    centreLuminance * SKY_GAIN * skyLightFactor;
  vec3 sky = mix(INDIGO_FIELD, physicalSky, uField);

  // Camera glare: near-limb bloom and Vos-style wings. Veiling is sky-only so a
  // zero field stays an indigo plate instead of a full-screen wash.
  float glareGauss = exp(-pow(outsideEdge / (0.05 + 0.22 * uHaze), 2.0));
  float glareWings = 0.012 / pow(outsideEdge + 0.15, 2.0) + 0.0015 / pow(outsideEdge + 0.15, 3.0);
  vec3 physicalGlare = glowTint * (
    uGlare * (0.42 * glareGauss + glareWings * mix(0.2, 1.0, uField) + 0.015 * uField)
  ) * directSunFactor;
  // Poster: a tight limb veil only. Vos wings + wide gauss are what made the
  // indigo plate look like a purple halo.
  vec3 posterGlare = posterRamp * posterBloom * (0.03 + 0.10 * uGlare);
  vec3 glare = mix(physicalGlare, posterGlare, uDuskFlush);

  // Lens flare (mu6k layout). The sun sits at the composition centre, so a
  // virtual optical centre is placed along uFlareAngle; ghosts line up on
  // that axis. Frame space: height 1, sun at flarePos.
  float canvasUnit = min(uResolution.x, uResolution.y);
  vec2 fromSun = (gl_FragCoord.xy - uCompositionCenter) / canvasUnit;
  float flareRad = radians(uFlareAngle);
  vec2 flareAxis = vec2(cos(flareRad), sin(flareRad));
  vec2 flarePos = -flareAxis * 0.32;
  vec2 flareUv = fromSun + flarePos;
  float flareAmt = uFlare * mix(directSunFactor, 1.0, uDuskFlush * 0.55);
  // Disc radius in frame units. The flare was tuned around a ~0.01 disc; a
  // larger disc grows the glow (sub-linearly, so a full-frame disc does not
  // flood the image) and the bloom must always cover the disc, or it reads
  // as a white dot painted on the sun.
  float discFrame = uSunScale * uCompositionScale / (2.0 * canvasUnit);
  float discRatio = max(discFrame / 0.0095, 1.0);
  float glowScale = clamp(pow(discRatio, 0.5), 1.0, 4.0);
  float hotspot = flareRays(flareUv, flarePos, 1.15, glowScale, uFlareRays);
  vec3 ghosts = flareGhosts(flareUv, flarePos);
  // Halo ring (Chapman): a circle about the optical centre whose radius is
  // the centre-to-sun distance, so it always passes through the sun.
  float haloRing = exp(-pow((length(flareUv) - length(flarePos)) / 0.04, 2.0));
  float star = apertureStar(fromSun, flareRad, glowScale);
  // Sensor bloom. Charge spill grows with over-exposure: below clipping it is
  // a faint warm glow around the disc; past it the blown region turns white
  // and outgrows the disc, as in photographs. Super-gaussian plateau gives a
  // clipped core with a quick shoulder; the tight term lifts the deep-orange
  // low-sun disc so it does not show as a yellow dot inside the white.
  float flareR = length(fromSun);
  float over = max(uExposure * 0.45 - 0.8, 0.0);
  float bloomOuter = max(0.04, discFrame * 1.7);
  float bloomInner = max(0.014, discFrame * 1.15);
  float bloomShape = exp(-pow(flareR / bloomOuter, 3.0)) * 0.45 + exp(-pow(flareR / bloomInner, 2.0)) * 0.45;
  float bloom = bloomShape * (0.35 + over * 1.4);
  vec3 bloomTint = mix(glowTint, vec3(1.0), clamp(0.3 + over * 0.35, 0.3, 0.85));
  // Rays and glow carry the sky's warm tint; ghosts lean red-orange like
  // real coatings do. All scene-linear so exposure and ACES shape them.
  vec3 flareEnergy = (
    glowTint * hotspot * 0.3 +
    bloomTint * bloom +
    ghosts * vec3(1.0, 0.42, 0.26) * 1.0 +
    vec3(1.0, 0.38, 0.18) * haloRing * (0.1 + 0.18 * uFlareStar) +
    mix(glowTint, vec3(1.0), 0.3) * star * 0.45 * uFlareStar
  ) * flareAmt;

  // Apparent horizon with a dark ground. A zero field is a full indigo plate.
  float pixelAngle = (SUN_RADIUS / uSunScale) * 3.0 / max(uCompositionScale, 1.0);
  // Haze softens the skyline into a fog band instead of a ruled edge.
  float horizonSoft = pixelAngle + uHaze * 1.2;
  float horizonMask = mix(1.0, smoothstep(-horizonSoft, horizonSoft, apparentElev), uField);
  vec3 above = sky * mix(1.0, skyStreaks, 0.62) +
    discRadiance * sunShape * streaks * mix(directSunFactor, 1.0, uDuskFlush) +
    glowTint * streakLining * sunShape * uCloudStreaks * 0.2 * mix(directSunFactor, 1.0, uDuskFlush);
  // Backlit terrain is a silhouette; it takes only a whisper of skylight.
  vec3 ground = sky * 0.025 + vec3(0.004, 0.003, 0.004);
  vec3 scene = mix(ground, above, horizonMask) + glare + flareEnergy;

  vec3 mapped = acesToneMap(scene * uExposure * 0.45);
  float posterCore = sunShapePoster;
  mapped = mix(
    mapped,
    saturateColor(posterRamp, mix(1.0, uSaturation, 0.55)),
    posterCore * uDuskFlush
  );
  // Sensor grain rides with the flare: a lens that flares is a camera, and a
  // perfectly smooth gradient is the first thing that reads as CG. Heavier
  // in the shadows, gone in clipped highlights.
  float grain = hash21(gl_FragCoord.xy + fract(uTime * 7.0) * vec2(17.0, 31.0)) - 0.5;
  mapped += grain * 0.035 * uFlare * uField * (1.0 - dot(mapped, LUMINANCE));
  vec3 displayColor = linearToSrgb(mapped);
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(clamp(displayColor + dither, 0.0, 1.0), 1.0);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create Sky shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown Sky shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  let fragmentShader: WebGLShader | null = null
  let program: WebGLProgram | null = null
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    program = gl.createProgram()
    if (!program) throw new Error('Unable to create Sky shader program')
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Unknown Sky shader link error')
    }
    return program
  } catch (error) {
    if (program) gl.deleteProgram(program)
    throw error
  } finally {
    gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
  }
}

function getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): SkyUniforms {
  return {
    cloudStreaks: gl.getUniformLocation(program, 'uCloudStreaks'),
    compositionCenter: gl.getUniformLocation(program, 'uCompositionCenter'),
    compositionScale: gl.getUniformLocation(program, 'uCompositionScale'),
    duskFlush: gl.getUniformLocation(program, 'uDuskFlush'),
    exposure: gl.getUniformLocation(program, 'uExposure'),
    field: gl.getUniformLocation(program, 'uField'),
    flare: gl.getUniformLocation(program, 'uFlare'),
    flareAngle: gl.getUniformLocation(program, 'uFlareAngle'),
    flareRays: gl.getUniformLocation(program, 'uFlareRays'),
    flareStar: gl.getUniformLocation(program, 'uFlareStar'),
    glare: gl.getUniformLocation(program, 'uGlare'),
    haze: gl.getUniformLocation(program, 'uHaze'),
    ozone: gl.getUniformLocation(program, 'uOzone'),
    refraction: gl.getUniformLocation(program, 'uRefraction'),
    resolution: gl.getUniformLocation(program, 'uResolution'),
    saturation: gl.getUniformLocation(program, 'uSaturation'),
    seeingAmount: gl.getUniformLocation(program, 'uSeeingAmount'),
    seeingSpeed: gl.getUniformLocation(program, 'uSeeingSpeed'),
    streakDrift: gl.getUniformLocation(program, 'uStreakDrift'),
    sunElevation: gl.getUniformLocation(program, 'uSunElevation'),
    sunScale: gl.getUniformLocation(program, 'uSunScale'),
    time: gl.getUniformLocation(program, 'uTime'),
  }
}

function createResources(gl: WebGL2RenderingContext): SkyResources {
  const vertexArray = gl.createVertexArray()
  if (!vertexArray) throw new Error('Unable to create Sky vertex array')
  try {
    const program = createProgram(gl)
    gl.bindVertexArray(vertexArray)
    return { program, uniforms: getUniforms(gl, program), vertexArray }
  } catch (error) {
    gl.deleteVertexArray(vertexArray)
    throw error
  }
}

function deleteResources(gl: WebGL2RenderingContext, resources: SkyResources): void {
  gl.deleteProgram(resources.program)
  gl.deleteVertexArray(resources.vertexArray)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function sanitizedSettings(settings: SkySettings): SkySettings {
  return {
    cloudStreaks: clamp(settings.cloudStreaks, 0, 1),
    duskFlush: clamp(settings.duskFlush, 0, 1),
    exposure: clamp(settings.exposure, 0, 8),
    field: clamp(settings.field, 0, 1),
    flare: clamp(settings.flare, 0, 2),
    flareAngle: clamp(settings.flareAngle, -180, 180),
    flareRays: clamp(settings.flareRays, 0, 1),
    flareStar: clamp(settings.flareStar, 0, 1),
    glare: clamp(settings.glare, 0, 2),
    haze: clamp(settings.haze, 0, 1),
    ozone: clamp(settings.ozone, 0, 2),
    refraction: clamp(settings.refraction, 0, 1.5),
    saturation: clamp(settings.saturation, 0, 2),
    seeingAmount: clamp(settings.seeingAmount, 0, 1),
    seeingSpeed: clamp(settings.seeingSpeed, 0, 3),
    streakDrift: clamp(settings.streakDrift, 0, 3),
    sunElevation: clamp(settings.sunElevation, -1, 70),
    sunScale: clamp(settings.sunScale, 0.02, 0.6),
  }
}

function createSkyRenderer(
  canvas: HTMLCanvasElement,
  input: {
    compositionRef: RefObject<HTMLDivElement | null>
    hasComposition: boolean
  },
): CanvasRenderer<SkySettings> | null {
  const { compositionRef, hasComposition } = input
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
    stencil: false,
  })
  if (!context) return null
  const gl: WebGL2RenderingContext = context

  let contextLost = false
  let disposed = false
  let resources: SkyResources | null = createResources(gl)
  let startTime = performance.now()
  let compositionCenterX = 0
  let compositionCenterY = 0
  let compositionScale = 1
  let lastFrameSettings: SkySettings | null = null
  let lastSanitized: SkySettings | null = null
  const visualViewport = window.visualViewport

  function resize(): void {
    const bounds = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio, 2)
    const width = Math.max(Math.round(bounds.width * dpr), 1)
    const height = Math.max(Math.round(bounds.height * dpr), 1)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    const compositionBounds = compositionRef.current?.getBoundingClientRect() ?? bounds
    const scaleX = width / Math.max(bounds.width, 1)
    const scaleY = height / Math.max(bounds.height, 1)
    compositionCenterX =
      (compositionBounds.left - bounds.left + compositionBounds.width / 2) * scaleX
    compositionCenterY =
      height - (compositionBounds.top - bounds.top + compositionBounds.height / 2) * scaleY
    compositionScale = Math.max(
      Math.min(compositionBounds.width * scaleX, compositionBounds.height * scaleY),
      1,
    )
  }

  function settingsForFrame(frameSettings: SkySettings): SkySettings {
    if (lastFrameSettings === frameSettings && lastSanitized) return lastSanitized
    lastFrameSettings = frameSettings
    lastSanitized = sanitizedSettings(frameSettings)
    return lastSanitized
  }

  function render(timestamp: number, frameSettings: SkySettings): void {
    if (disposed || contextLost || !resources) return
    const settings = settingsForFrame(frameSettings)
    const { program, uniforms, vertexArray } = resources

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(program)
    gl.bindVertexArray(vertexArray)

    gl.uniform1f(uniforms.cloudStreaks, settings.cloudStreaks)
    gl.uniform2f(uniforms.compositionCenter, compositionCenterX, compositionCenterY)
    gl.uniform1f(uniforms.compositionScale, compositionScale)
    gl.uniform1f(uniforms.duskFlush, settings.duskFlush)
    gl.uniform1f(uniforms.exposure, settings.exposure)
    gl.uniform1f(uniforms.field, settings.field)
    gl.uniform1f(uniforms.flare, settings.flare)
    gl.uniform1f(uniforms.flareAngle, settings.flareAngle)
    gl.uniform1f(uniforms.flareRays, settings.flareRays)
    gl.uniform1f(uniforms.flareStar, settings.flareStar)
    gl.uniform1f(uniforms.glare, settings.glare)
    gl.uniform1f(uniforms.haze, settings.haze)
    gl.uniform1f(uniforms.ozone, settings.ozone)
    gl.uniform1f(uniforms.refraction, settings.refraction)
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
    gl.uniform1f(uniforms.saturation, settings.saturation)
    gl.uniform1f(uniforms.seeingAmount, settings.seeingAmount)
    gl.uniform1f(uniforms.seeingSpeed, settings.seeingSpeed)
    gl.uniform1f(uniforms.streakDrift, settings.streakDrift)
    gl.uniform1f(uniforms.sunElevation, settings.sunElevation)
    gl.uniform1f(uniforms.sunScale, settings.sunScale)
    gl.uniform1f(uniforms.time, (timestamp - startTime) / 1000)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  function handleContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
    resources = null
  }

  function handleContextRestored(): void {
    if (disposed) return
    contextLost = false
    resources = createResources(gl)
    startTime = performance.now()
    resize()
  }

  function bindResizeListeners(): void {
    resizeObserver.observe(canvas)
    if (hasComposition && compositionRef.current) resizeObserver.observe(compositionRef.current)
    window.addEventListener('resize', resize)
    visualViewport?.addEventListener('resize', resize)
    visualViewport?.addEventListener('scroll', resize)
  }

  function unbindResizeListeners(): void {
    resizeObserver.disconnect()
    window.removeEventListener('resize', resize)
    visualViewport?.removeEventListener('resize', resize)
    visualViewport?.removeEventListener('scroll', resize)
  }

  const resizeObserver = new ResizeObserver(resize)
  bindResizeListeners()
  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  try {
    resize()
  } catch (error) {
    disposed = true
    unbindResizeListeners()
    canvas.removeEventListener('webglcontextlost', handleContextLost)
    canvas.removeEventListener('webglcontextrestored', handleContextRestored)
    if (resources) deleteResources(gl, resources)
    resources = null
    throw error
  }

  return {
    render,
    dispose(): void {
      disposed = true
      unbindResizeListeners()
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      if (!contextLost && resources) deleteResources(gl, resources)
      resources = null
    },
  }
}

export function SkyEffect({
  className,
  cloudStreaks = 0,
  composition,
  duskFlush = 0,
  exposure = 1.8,
  field = 0,
  flare = 0.02,
  flareAngle = 63,
  flareRays = 0.56,
  flareStar = 0.25,
  glare = 0.14,
  haze = 0.55,
  ozone = 0.69,
  refraction = 0.5,
  saturation = 0.9,
  seeingAmount = 0.29,
  seeingSpeed = 0.76,
  streakDrift = 2.19,
  style,
  sunElevation = 3,
  sunScale = 0.02,
  viewport,
}: SkyEffectProps) {
  const compositionRef = useRef<HTMLDivElement>(null)
  const hasComposition = composition !== undefined
  const frameSettings: SkySettings = {
    cloudStreaks,
    duskFlush,
    exposure,
    field,
    flare,
    flareAngle,
    flareRays,
    flareStar,
    glare,
    haze,
    ozone,
    refraction,
    saturation,
    seeingAmount,
    seeingSpeed,
    streakDrift,
    sunElevation,
    sunScale,
  }
  const rendererInput = useMemo(() => ({ compositionRef, hasComposition }), [hasComposition])
  const canvasRef = useCanvasRenderer(frameSettings, rendererInput, createSkyRenderer)

  if (composition) {
    return (
      <div
        className={className}
        style={{ height: '100%', position: 'relative', width: '100%', ...style }}
      >
        <div
          aria-hidden="true"
          ref={compositionRef}
          style={{
            left: '50%',
            pointerEvents: 'none',
            position: 'absolute',
            transform: 'translateX(-50%)',
            ...composition,
          }}
        />
        <div
          style={{
            bottom: 0,
            left: 0,
            pointerEvents: 'none',
            position: 'absolute',
            right: 0,
            top: 0,
            ...viewport,
          }}
        >
          <canvas
            aria-hidden="true"
            ref={canvasRef}
            style={{ display: 'block', height: '100%', pointerEvents: 'none', width: '100%' }}
          />
        </div>
      </div>
    )
  }

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{ display: 'block', height: '100%', width: '100%', ...style }}
    />
  )
}
