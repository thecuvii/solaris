# Changelog

All notable changes to `@cuvii/solaris` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0](https://github.com/thecuvii/solaris/commits/v0.1.0) (2026-09-06)

### Added

- Initial public release with `Earth`, `Jupiter`, `LunarEclipse`, `Mars`, `Mercury`, `Moon`,
  `Neptune`, `Pluto`, `Saturn`, `Sky`, `Sun`, `Titan`, `Uranus`, and `Venus` components.
- Per-planet subpath exports (`@cuvii/solaris/moon`, …) so consumers only ship the
  shaders they render.
- `preloadTextureImages` for warming the texture cache ahead of mount.
- `onStatusChange`, `onReady`, and `onError` lifecycle callbacks on every textured planet.
  `onError` also receives renderer failures (shader compilation, framebuffer setup,
  unusable source data) instead of them escaping into React.
- `composition` and `viewport` on every planet to place the orb inside a larger canvas.
- `paused` on every planet; rendering also pauses automatically while off screen and
  respects `prefers-reduced-motion` (frozen clock, no lean, redraw only on change).
- `defaultEarthModel` and the `AtmosphericOrbModel` type; `Earth`'s `model` is now
  optional.
- `lean`, `spin`, and `yaw` on `Sun`; `lean` on `Uranus`.
- Shared `OrbCanvasProps`, `OrbPoseProps`, `OrbLightingProps`, `OrbComposition`, and
  `OrbViewport` types exported from every subpath. Every prop carries JSDoc with its
  unit, range, and default.

### Changed

- Prop names unified across planets: `forwardScatter` (Saturn) and
  `forwardScatteringStrength` (Titan) → `forwardScattering`; `selfShadowStrength`
  (Mars) and `reliefStrength` (Pluto) → `reliefShadowStrength`; `hazeIntensity`
  (Pluto) and `hazeOpacity` (Uranus) → `hazeDensity`.
- `LunarEclipse` `offsetX`/`offsetY` replaced by `sunAzimuth`/`sunElevation`
  (apparent Sun direction relative to the Earth–Moon line; the shadow centre
  falls opposite). `0`/`0` is a central eclipse.
- `Pluto` no longer clamps `spin`.
