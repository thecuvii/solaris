# Changelog

All notable changes to `@thecuvii/solaris` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0](https://github.com/thecuvii/solaris/commits/v0.1.0) (2026-09-06)

### Added

- Initial public release with `Earth`, `Jupiter`, `LunarEclipse`, `Mars`, `Mercury`, `Moon`,
  `Neptune`, `Pluto`, `Saturn`, `Sky`, `Sun`, `Titan`, `Uranus`, and `Venus` components.
- Per-planet subpath exports (`@thecuvii/solaris/moon`, …) so consumers only ship the
  shaders they render.
- `preloadTextureImages` for warming the texture cache ahead of mount.
- `onStatusChange`, `onReady`, and `onError` lifecycle callbacks on every textured planet.
