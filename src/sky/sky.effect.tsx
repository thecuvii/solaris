'use client'

import { OrbCanvas } from '../internal/orb-canvas'
import type { OrbRendererSpec } from '../internal/orb-renderer'
import { getUniformLocations, type UniformLocations } from '../internal/uniforms'
import {
  clamp,
  COMPOSITION_GLSL,
  COMPOSITION_UNIFORM_NAMES,
  createProgram,
  createVertexArray,
} from '../internal/webgl'
import type { OrbCanvasProps } from '../orb'

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

export type SkyEffectProps = Omit<OrbCanvasProps, 'lean'> & {
  /** Thin horizontal cloud/inversion striations across the low disc. Range 0–1. @default 0 */
  cloudStreaks?: number
  /** Editorial yellow→orange→magenta disc grade. Stays on the disc. Range 0–1. @default 0 */
  duskFlush?: number
  /** Linear scene gain relative to the disc centre before tone mapping. Range 0–8. @default 1.8 */
  exposure?: number
  /** Scattering-sky amount. 0 is a dark indigo plate; 1 is the physical field. @default 0 */
  field?: number
  /** Lens flare strength: 1/r hotspot with soft noise rays and chromatic ghosts. Range 0–2. @default 0.02 */
  flare?: number
  /** Direction from the sun to the virtual optical centre, in degrees. Ghosts line up on it. @default 63 */
  flareAngle?: number
  /** Ray density. 0 is a few broad soft rays; 1 is a dense burst of hairlines. @default 0.56 */
  flareRays?: number
  /** Aperture star: eight diaphragm diffraction spikes, rotated by flareAngle. Range 0–1. @default 0.25 */
  flareStar?: number
  /** Camera glare strength: near-limb bloom, wide wings, and veiling. Range 0–2. @default 0.14 */
  glare?: number
  /** Aerosol load. Softens the limb, tightens the aureole, and greys the sky. Range 0–1. @default 0.55 */
  haze?: number
  /** Chappuis ozone absorption multiplier; controls the pink/purple twilight cast. Range 0–2. @default 0.69 */
  ozone?: number
  /** NOAA apparent-elevation refraction multiplier; flattens the low disc. Range 0–1.5. @default 0.5 */
  refraction?: number
  /** Disc and glow chroma. 1 preserves the physical tint. Range 0–2. @default 0.9 */
  saturation?: number
  /** Refractive shimmer amplitude near the horizon. Range 0–1. @default 0.29 */
  seeingAmount?: number
  /** Refractive shimmer speed multiplier. Range 0–3. @default 0.76 */
  seeingSpeed?: number
  /** Slow drift speed of the cloud striations. Range 0–3. @default 2.19 */
  streakDrift?: number
  /** True solar-centre elevation in degrees. Range -1–70. @default 3 */
  sunElevation?: number
  /** Disc radius as a fraction of the shorter composition half-side. Range 0.02–0.6. @default 0.02 */
  sunScale?: number
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
  lean: boolean
  ozone: number
  refraction: number
  saturation: number
  seeingAmount: number
  seeingSpeed: number
  streakDrift: number
  sunElevation: number
  sunScale: number
}

const UNIFORM_NAMES = [
  ...COMPOSITION_UNIFORM_NAMES,
  'uApparentBottom',
  'uApparentCentre',
  'uApparentTop',
  'uBloomInner',
  'uBloomOuter',
  'uBloomTint',
  'uCentreLuminance',
  'uCloudStreaks',
  'uDirectSunFactor',
  'uDrift',
  'uDuskFlush',
  'uExposure',
  'uField',
  'uFlare',
  'uFlareAmount',
  'uFlarePos',
  'uFlareRad',
  'uFlareRays',
  'uFlareStar',
  'uGlare',
  'uGlowScale',
  'uGlowTint',
  'uHaze',
  'uOpticalDepth',
  'uOver',
  'uResolution',
  'uSaturation',
  'uSeeingAmount',
  'uSeeingPhase',
  'uSkyLightFactor',
  'uSunElevation',
  'uSunScale',
  'uSunTransmittance',
  'uTime',
] as const

type SkyResources = {
  /** Per-frame constant cache; see {@link frameConstants}. */
  constants: FrameConstants | null
  constantsKey: string
  program: WebGLProgram
  /** Last raw settings object and its clamped mirror, so a stable object is not re-sanitised every frame. */
  sanitized: SkySettings | null
  sanitizedFor: SkySettings | null
  uniforms: UniformLocations<(typeof UNIFORM_NAMES)[number]>
  vertexArray: WebGLVertexArrayObject
}

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float uCloudStreaks;
uniform float uDuskFlush;
uniform float uExposure;
uniform float uField;
uniform float uFlare;
uniform float uFlareRays;
uniform float uFlareStar;
uniform float uGlare;
uniform float uHaze;
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uSeeingAmount;
uniform float uSunElevation;
uniform float uSunScale;
uniform float uTime;

// Per-frame constants that depend only on the settings above. Evaluated once
// on the CPU (see frameConstants) instead of once per fragment.
uniform float uApparentBottom;
uniform float uApparentCentre;
uniform float uApparentTop;
uniform float uBloomInner;
uniform float uBloomOuter;
uniform vec3 uBloomTint;
uniform float uCentreLuminance;
uniform float uDirectSunFactor;
uniform float uDrift;
uniform float uFlareAmount;
uniform vec2 uFlarePos;
uniform float uFlareRad;
uniform float uGlowScale;
uniform vec3 uGlowTint;
uniform vec3 uOpticalDepth;
uniform float uOver;
uniform float uSeeingPhase;
uniform float uSkyLightFactor;
uniform vec3 uSunTransmittance;

${COMPOSITION_GLSL}
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

// Kasten–Young (1989) relative airmass; ~38 at the horizon.
float airmass(float elevationDegrees) {
  float h = max(elevationDegrees, 0.0);
  return 1.0 / (sin(radians(h)) + 0.50572 * pow(h + 6.07995, -1.6364));
}

vec3 transmittance(float elevationDegrees) {
  return exp(-uOpticalDepth * airmass(elevationDegrees));
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
  vec2 screen = compositionPosition();
  // Angular offset from the apparent disc centre, in degrees.
  vec2 angular = screen * (SUN_RADIUS / uSunScale);

  float trueCentre = uSunElevation;
  float apparentCentre = uApparentCentre;
  float apparentElev = apparentCentre + angular.y;

  // Seeing: low-frequency animated warp of the viewing direction near the horizon.
  vec2 discAngular = angular;
  if (uSeeingAmount > 0.0) {
    float horizonProximity = exp(-max(apparentElev, 0.0) / 2.5);
    vec2 seeing = vec2(
      fbm2(angular * 7.0 + vec2(uSeeingPhase * 0.55, 0.0)),
      fbm2(angular * 7.0 + vec2(13.7, -uSeeingPhase * 0.45))
    ) - 0.5;
    discAngular += seeing * (0.025 * uSeeingAmount * horizonProximity);
  }
  float discApparentElev = apparentCentre + discAngular.y;

  // Apparent -> true disc coordinate. The lower half is compressed more than
  // the upper half because refraction grows fastest toward the horizon.
  float yTrue = discApparentElev < apparentCentre
    ? (discApparentElev - apparentCentre) / max(apparentCentre - uApparentBottom, 1e-4) * SUN_RADIUS
    : (discApparentElev - apparentCentre) / max(uApparentTop - apparentCentre, 1e-4) * SUN_RADIUS;
  float radial = length(vec2(discAngular.x, yTrue)) / SUN_RADIUS;
  float edgeDistance = (radial - 1.0) * SUN_RADIUS;
  float outsideEdge = max(edgeDistance, 0.0);

  // Direct sunlight colour; the disc centre defines the exposure reference.
  vec3 sunTransmittance = uSunTransmittance;
  float centreLuminance = uCentreLuminance;
  float skyLightFactor = uSkyLightFactor;
  float directSunFactor = uDirectSunFactor;
  vec3 glowTint = uGlowTint;

  // Disc: per-row extinction, Neckel limb darkening, Heckel softSunDisc edge.
  float muLimb = sqrt(max(1.0 - radial * radial, 0.0));
  vec3 limb = mix(pow(vec3(muLimb), LIMB_EXPONENT), vec3(1.0), uHaze * 0.85);
  float rowElevation = trueCentre + yTrue * DISC_GRADIENT_STRETCH;
  vec3 discRadiance = transmittance(rowElevation) / centreLuminance * limb;
  discRadiance = saturateColor(discRadiance, uSaturation);
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

  // Cirrus / stratus: a few anisotropic sheets, not 1D scanlines. This is the
  // most expensive pass (15 fbm2 evaluations), so it is skipped entirely when
  // the streak amount is zero.
  float streaks = 1.0;
  float skyStreaks = 1.0;
  float streakLining = 0.0;
  if (uCloudStreaks > 0.0) {
    float streakHeight = mix(0.28, 1.0, exp(-max(discApparentElev, 0.0) / 11.0));
    vec2 streakField = vec2(angular.x, discApparentElev);
    vec2 sheetA = cirrusSheet(streakField, 0.045, 0.42, 11.0, uDrift * 0.085, 3.2);
    vec2 sheetB = cirrusSheet(streakField, -0.08, 0.28, 16.5, uDrift * 0.13, 18.7);
    vec2 sheetC = cirrusSheet(streakField, 0.12, 0.2, 22.0, uDrift * 0.055, 41.4);
    float streakOptical = (sheetA.x * 0.72 + sheetB.x * 0.5 + sheetC.x * 0.32) * streakHeight;
    streakLining = (sheetA.y * 0.7 + sheetB.y * 0.45 + sheetC.y * 0.28) * streakHeight;
    float streakDepth = streakOptical * uCloudStreaks;
    streaks = exp(-streakDepth * 1.85);
    skyStreaks = exp(-streakDepth * 0.42);
  }

  // Two-airmass single scatter (Heckel light-march, closed form for a ground observer).
  vec3 viewTransmittance = transmittance(apparentElev);
  float phaseMu = cos(radians(length(angular)));
  vec3 extinction = max(uOpticalDepth, vec3(1e-5));
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
  // virtual optical centre is placed along the flare angle; ghosts line up on
  // that axis. Frame space: height 1, sun at uFlarePos. The whole pass is
  // scaled by uFlareAmount, so it is skipped when that is zero.
  vec3 flareEnergy = vec3(0.0);
  if (uFlareAmount > 0.0) {
    float canvasUnit = min(uResolution.x, uResolution.y);
    vec2 fromSun = (gl_FragCoord.xy - uCompositionCenter) / canvasUnit;
    vec2 flareUv = fromSun + uFlarePos;
    float hotspot = flareRays(flareUv, uFlarePos, 1.15, uGlowScale, uFlareRays);
    vec3 ghosts = flareGhosts(flareUv, uFlarePos);
    // Halo ring (Chapman): a circle about the optical centre whose radius is
    // the centre-to-sun distance, so it always passes through the sun.
    float haloRing = exp(-pow((length(flareUv) - length(uFlarePos)) / 0.04, 2.0));
    float star = uFlareStar > 0.0 ? apertureStar(fromSun, uFlareRad, uGlowScale) : 0.0;
    // Sensor bloom. Charge spill grows with over-exposure: below clipping it is
    // a faint warm glow around the disc; past it the blown region turns white
    // and outgrows the disc, as in photographs. Super-gaussian plateau gives a
    // clipped core with a quick shoulder; the tight term lifts the deep-orange
    // low-sun disc so it does not show as a yellow dot inside the white.
    float flareR = length(fromSun);
    float bloomShape = exp(-pow(flareR / uBloomOuter, 3.0)) * 0.45 + exp(-pow(flareR / uBloomInner, 2.0)) * 0.45;
    float bloom = bloomShape * (0.35 + uOver * 1.4);
    // Rays and glow carry the sky's warm tint; ghosts lean red-orange like
    // real coatings do. All scene-linear so exposure and ACES shape them.
    flareEnergy = (
      glowTint * hotspot * 0.3 +
      uBloomTint * bloom +
      ghosts * vec3(1.0, 0.42, 0.26) * 1.0 +
      vec3(1.0, 0.38, 0.18) * haloRing * (0.1 + 0.18 * uFlareStar) +
      mix(glowTint, vec3(1.0), 0.3) * star * 0.45 * uFlareStar
    ) * uFlareAmount;
  }

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

/*
 * CPU mirrors of the shader's uniform-only math. These must stay in step with
 * the GLSL constants above; the shader reads the results as uniforms.
 */
const SUN_RADIUS = 0.2665
const LUMINANCE = [0.2126, 0.7152, 0.0722] as const
const TAU_RAYLEIGH = [0.05, 0.098, 0.218] as const
const TAU_AEROSOL = [0.045, 0.05, 0.06] as const
const TAU_OZONE = [0.012, 0.035, 0.0016] as const
const GLARE_TINT = [1, 0.8, 0.46] as const

type Vec3 = [number, number, number]

type FrameConstants = {
  apparentBottom: number
  apparentCentre: number
  apparentTop: number
  bloomInner: number
  bloomOuter: number
  bloomTint: Vec3
  centreLuminance: number
  directSunFactor: number
  flareAmount: number
  flarePos: [number, number]
  flareRad: number
  glowScale: number
  glowTint: Vec3
  opticalDepth: Vec3
  over: number
  skyLightFactor: number
  sunTransmittance: Vec3
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

// NOAA solar-position refraction in degrees for a true elevation in degrees.
function refractionCorrection(elevationDegrees: number): number {
  if (elevationDegrees > 85) return 0
  const tangent = Math.tan((elevationDegrees * Math.PI) / 180)
  if (elevationDegrees > 5) {
    return (58.1 / tangent - 0.07 / tangent ** 3 + 0.000086 / tangent ** 5) / 3600
  }
  if (elevationDegrees > -0.575) {
    return (
      (1735 -
        518.2 * elevationDegrees +
        103.4 * elevationDegrees * elevationDegrees -
        12.79 * elevationDegrees ** 3 +
        0.711 * elevationDegrees ** 4) /
      3600
    )
  }
  return -20.772 / tangent / 3600
}

// Kasten–Young (1989) relative airmass; ~38 at the horizon.
function airmass(elevationDegrees: number): number {
  const h = Math.max(elevationDegrees, 0)
  return 1 / (Math.sin((h * Math.PI) / 180) + 0.50572 * (h + 6.07995) ** -1.6364)
}

function saturateColor(color: Vec3, amount: number): Vec3 {
  const luminance = Math.max(
    color[0] * LUMINANCE[0] + color[1] * LUMINANCE[1] + color[2] * LUMINANCE[2],
    0,
  )
  return [
    mix(luminance, color[0], amount),
    mix(luminance, color[1], amount),
    mix(luminance, color[2], amount),
  ]
}

function frameConstants(
  settings: SkySettings,
  compositionScale: number,
  canvasUnit: number,
): FrameConstants {
  const trueCentre = settings.sunElevation
  const apparent = (elevation: number) =>
    elevation + refractionCorrection(elevation) * settings.refraction

  const aerosol = mix(0.3, 2.5, settings.haze)
  const opticalDepth: Vec3 = [
    TAU_RAYLEIGH[0] + TAU_AEROSOL[0] * aerosol + TAU_OZONE[0] * settings.ozone,
    TAU_RAYLEIGH[1] + TAU_AEROSOL[1] * aerosol + TAU_OZONE[1] * settings.ozone,
    TAU_RAYLEIGH[2] + TAU_AEROSOL[2] * aerosol + TAU_OZONE[2] * settings.ozone,
  ]
  const centreAirmass = airmass(trueCentre)
  const sunTransmittance: Vec3 = [
    Math.exp(-opticalDepth[0] * centreAirmass),
    Math.exp(-opticalDepth[1] * centreAirmass),
    Math.exp(-opticalDepth[2] * centreAirmass),
  ]
  const centreLuminance = Math.max(
    sunTransmittance[0] * LUMINANCE[0] +
      sunTransmittance[1] * LUMINANCE[1] +
      sunTransmittance[2] * LUMINANCE[2],
    1e-5,
  )
  const glowTint = saturateColor(
    [
      (sunTransmittance[0] / centreLuminance) * GLARE_TINT[0],
      (sunTransmittance[1] / centreLuminance) * GLARE_TINT[1],
      (sunTransmittance[2] / centreLuminance) * GLARE_TINT[2],
    ],
    settings.saturation,
  )
  const directSunFactor = smoothstep(-4.5, 1.7, trueCentre)

  const flareRad = (settings.flareAngle * Math.PI) / 180
  // Disc radius in frame units. The flare was tuned around a ~0.01 disc; a
  // larger disc grows the glow (sub-linearly, so a full-frame disc does not
  // flood the image) and the bloom must always cover the disc, or it reads
  // as a white dot painted on the sun.
  const discFrame = (settings.sunScale * compositionScale) / (2 * canvasUnit)
  const discRatio = Math.max(discFrame / 0.0095, 1)
  const over = Math.max(settings.exposure * 0.45 - 0.8, 0)
  const bloomMix = clamp(0.3 + over * 0.35, 0.3, 0.85)

  return {
    apparentBottom: apparent(trueCentre - SUN_RADIUS),
    apparentCentre: apparent(trueCentre),
    apparentTop: apparent(trueCentre + SUN_RADIUS),
    bloomInner: Math.max(0.014, discFrame * 1.15),
    bloomOuter: Math.max(0.04, discFrame * 1.7),
    bloomTint: [
      mix(glowTint[0], 1, bloomMix),
      mix(glowTint[1], 1, bloomMix),
      mix(glowTint[2], 1, bloomMix),
    ],
    centreLuminance,
    directSunFactor,
    flareAmount: settings.flare * mix(directSunFactor, 1, settings.duskFlush * 0.55),
    flarePos: [-Math.cos(flareRad) * 0.32, -Math.sin(flareRad) * 0.32],
    flareRad,
    glowScale: clamp(Math.sqrt(discRatio), 1, 4),
    glowTint,
    opticalDepth,
    over,
    skyLightFactor: smoothstep(-9, 3.5, trueCentre),
    sunTransmittance,
  }
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
    lean: settings.lean,
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

/** Clamp once per distinct settings object; the core hands back the same object while nothing changes. */
function settingsForFrame(resources: SkyResources, frameSettings: SkySettings): SkySettings {
  if (resources.sanitizedFor === frameSettings && resources.sanitized) return resources.sanitized
  resources.sanitizedFor = frameSettings
  resources.sanitized = sanitizedSettings(frameSettings)
  return resources.sanitized
}

function constantsForFrame(
  resources: SkyResources,
  settings: SkySettings,
  compositionScale: number,
  canvasUnit: number,
): FrameConstants {
  // Cheap to recompute, but the key lets a resize or settings change reuse
  // the previous result when nothing that feeds it actually moved.
  const key = `${settings.sunElevation}|${settings.refraction}|${settings.haze}|${settings.ozone}|${settings.saturation}|${settings.flareAngle}|${settings.sunScale}|${settings.exposure}|${settings.flare}|${settings.duskFlush}|${compositionScale}|${canvasUnit}`
  if (resources.constants && key === resources.constantsKey) return resources.constants
  resources.constantsKey = key
  resources.constants = frameConstants(settings, compositionScale, canvasUnit)
  return resources.constants
}

const spec: OrbRendererSpec<SkyResources, SkySettings, never> = {
  label: 'Sky',
  // The sky is low-frequency gradients; 1.5x is indistinguishable from 2x
  // and costs 44% fewer fragments for the heaviest shader in the package.
  maxDevicePixelRatio: 1.5,
  createResources(gl) {
    const program = createProgram(gl, FRAGMENT_SHADER, 'Sky')
    return {
      constants: null,
      constantsKey: '',
      program,
      sanitized: null,
      sanitizedFor: null,
      uniforms: getUniformLocations(gl, program, UNIFORM_NAMES),
      vertexArray: createVertexArray(gl, 'Sky'),
    }
  },
  deleteResources(gl, resources) {
    gl.deleteProgram(resources.program)
    gl.deleteVertexArray(resources.vertexArray)
  },
  // Only seeing, streak drift and the flare grain read uTime. Without them the
  // image is static and does not need to be redrawn every frame.
  isAnimated(settings) {
    return (
      (settings.seeingAmount > 0 && settings.seeingSpeed > 0) ||
      (settings.cloudStreaks > 0 && settings.streakDrift > 0) ||
      (settings.flare > 0 && settings.field > 0)
    )
  },
  render(gl, resources, frame) {
    const { composition, elapsed: time, height, width } = frame
    const settings = settingsForFrame(resources, frame.settings)
    const canvasUnit = Math.min(width, height)
    const constants = constantsForFrame(resources, settings, composition.scale, canvasUnit)
    const { uniforms } = resources

    gl.useProgram(resources.program)
    gl.bindVertexArray(resources.vertexArray)

    gl.uniform1f(uniforms.uCloudStreaks, settings.cloudStreaks)
    gl.uniform2f(uniforms.uCompositionCenter, composition.centerX, composition.centerY)
    gl.uniform1f(uniforms.uCompositionScale, composition.scale)
    gl.uniform1f(uniforms.uDuskFlush, settings.duskFlush)
    gl.uniform1f(uniforms.uExposure, settings.exposure)
    gl.uniform1f(uniforms.uField, settings.field)
    gl.uniform1f(uniforms.uFlare, settings.flare)
    gl.uniform1f(uniforms.uFlareRays, settings.flareRays)
    gl.uniform1f(uniforms.uFlareStar, settings.flareStar)
    gl.uniform1f(uniforms.uGlare, settings.glare)
    gl.uniform1f(uniforms.uHaze, settings.haze)
    gl.uniform2f(uniforms.uResolution, width, height)
    gl.uniform1f(uniforms.uSaturation, settings.saturation)
    gl.uniform1f(uniforms.uSeeingAmount, settings.seeingAmount)
    gl.uniform1f(uniforms.uSunElevation, settings.sunElevation)
    gl.uniform1f(uniforms.uSunScale, settings.sunScale)
    gl.uniform1f(uniforms.uTime, time)

    gl.uniform1f(uniforms.uApparentBottom, constants.apparentBottom)
    gl.uniform1f(uniforms.uApparentCentre, constants.apparentCentre)
    gl.uniform1f(uniforms.uApparentTop, constants.apparentTop)
    gl.uniform1f(uniforms.uBloomInner, constants.bloomInner)
    gl.uniform1f(uniforms.uBloomOuter, constants.bloomOuter)
    gl.uniform3f(uniforms.uBloomTint, ...constants.bloomTint)
    gl.uniform1f(uniforms.uCentreLuminance, constants.centreLuminance)
    gl.uniform1f(uniforms.uDirectSunFactor, constants.directSunFactor)
    gl.uniform1f(uniforms.uDrift, time * settings.streakDrift)
    gl.uniform1f(uniforms.uFlareAmount, constants.flareAmount)
    gl.uniform2f(uniforms.uFlarePos, ...constants.flarePos)
    gl.uniform1f(uniforms.uFlareRad, constants.flareRad)
    gl.uniform1f(uniforms.uGlowScale, constants.glowScale)
    gl.uniform3f(uniforms.uGlowTint, ...constants.glowTint)
    gl.uniform1f(uniforms.uOver, constants.over)
    gl.uniform3f(uniforms.uOpticalDepth, ...constants.opticalDepth)
    gl.uniform1f(uniforms.uSeeingPhase, time * settings.seeingSpeed)
    gl.uniform1f(uniforms.uSkyLightFactor, constants.skyLightFactor)
    gl.uniform3f(uniforms.uSunTransmittance, ...constants.sunTransmittance)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  },
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
  onError,
  ozone = 0.69,
  paused,
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
  const settings: SkySettings = {
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
    // Pointer parallax is meaningless for a sky plate.
    lean: false,
    ozone,
    refraction,
    saturation,
    seeingAmount,
    seeingSpeed,
    streakDrift,
    sunElevation,
    sunScale,
  }

  return (
    <OrbCanvas
      className={className}
      composition={composition}
      lean={false}
      onError={onError}
      paused={paused}
      settings={settings}
      source={undefined}
      spec={spec}
      style={style}
      viewport={viewport}
    />
  )
}
