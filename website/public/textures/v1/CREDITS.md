# Earth texture credits

The six Earth maps in this directory are derivatives of the Earth texture set distributed with the three.js [`webgpu_tsl_earth`](https://github.com/mrdoob/three.js/blob/444f238c63b594fbaf1d5adde301fa7e10c29a83/examples/webgpu_tsl_earth.html) example at commit `444f238c63b594fbaf1d5adde301fa7e10c29a83`. That example credits the maps as “Earth textures from Solar System Scope (resized and merged).” The fixed source files are:

- [`earth_day_4096.jpg`](https://github.com/mrdoob/three.js/blob/444f238c63b594fbaf1d5adde301fa7e10c29a83/examples/textures/planets/earth_day_4096.jpg)
- [`earth_night_4096.jpg`](https://github.com/mrdoob/three.js/blob/444f238c63b594fbaf1d5adde301fa7e10c29a83/examples/textures/planets/earth_night_4096.jpg)
- [`earth_bump_roughness_clouds_4096.jpg`](https://github.com/mrdoob/three.js/blob/444f238c63b594fbaf1d5adde301fa7e10c29a83/examples/textures/planets/earth_bump_roughness_clouds_4096.jpg)

Credit: [Solar System Scope (INOVE)](https://www.solarsystemscope.com/textures/). Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Solar System Scope says its texture pack is based on NASA elevation and imagery data and describes the Earth maps as merged and adjusted from geodata, space photography, and NASA Blue Marble imagery.

Local adaptations:

- `earth-day.webp` and `earth-night.webp` are 2048×1024 WebP conversions of the three.js day and night maps.
- `earth-cloud.webp` and `earth-roughness.webp` are 2048×1024 WebP extractions of the cloud and roughness channels in the packed three.js map.
- `earth-normal.webp` is a seam-wrapped 2048×1024 tangent-space normal map generated with Sobel derivatives from the packed bump channel.
- `earth-material.webp` is a high-contrast 2048×1024 ocean/material mask derived from the packed roughness channel; white identifies water and black identifies land.

# Moon texture credits

The two Moon maps in this directory are derived from NASA's [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), prepared by Ernie Wright using imagery and elevation data from NASA's Lunar Reconnaissance Orbiter. Credit: NASA's Scientific Visualization Studio; LROC WAC imagery courtesy NASA/GSFC/Arizona State University; LOLA elevation data courtesy NASA/GSFC/MIT.

Fixed source files:

- [`lroc_color_16bit_srgb_4k.tif`](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif), SHA-256 `9731fa8af425b6c2f88f277ecca82bf8c603f3743894f64ed7b25c5bfefa22ff`
- [`ldem_16.tif`](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif), SHA-256 `1ea42bf44f7e9d694f79c3afa7145f97fbf06cc67372067d9fe73dce43bad796`

Local adaptations, reproducible with `scripts/generate-moon-textures.py`:

- `moon-albedo.webp` is a 4096×2048 sRGB WebP conversion of the LROC WAC color map.
- `moon-normal-height.webp` is a 4096×2048 linear RGBA WebP. RGB stores a seam-wrapped tangent-space normal derived on the sphere from the LOLA DEM. Alpha stores elevation normalized over the fixed range −10 km to 12 km; the shader converts that range to `22 / 1737.4` lunar radii for terrain self-shadowing.

# Jupiter texture credits

`jupiter-albedo.webp` is derived from the 3600×1800 [Hubble OPAL Jupiter global map from 2019](https://science.nasa.gov/asset/hubble/jupiter-global-map-2019/), assembled from observations acquired by the NASA/ESA Hubble Space Telescope. Credit: NASA, ESA, A. Simon (GSFC), M.H. Wong (UC Berkeley). OPAL high-level science products are distributed by the [Mikulski Archive for Space Telescopes](https://archive.stsci.edu/hlsp/opal) under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Local adaptations, reproducible with `scripts/generate-jupiter-texture.py`:

- Filled the source's unobserved polar rows without inventing named cloud features.
- Removed chromatic projection artifacts above approximately 78° north.
- Repaired the periodic longitude seam over 32 pixels.
- Converted the sRGB PNG to a native-resolution 3600×1800 WebP without deriving height or normal data from color.

The fixed source SHA-256, generated output hash, source URL, GRS calibration, tool versions, and modification record are stored in `jupiter-texture-manifest.json`.

OPAL acknowledgment: “This work used data acquired from the NASA/ESA HST Space Telescope, associated with OPAL program (PI: Simon, GO13937), and archived by the Space Telescope Science Institute, which is operated by the Association of Universities for Research in Astronomy, Inc., under NASA contract NAS 5-26555. All maps are available at http://dx.doi.org/10.17909/T9G593.”

# Saturn texture credits

`saturn-atmosphere.webp` begins with the 720×360 [`Saturn.tif`](https://science.nasa.gov/3d-resources/saturn/) distributed by NASA 3D Resources and credited to NASA/JPL-Caltech. NASA explicitly describes that source as a “Fictional” planetary map; this project does not present it as a Cassini global observation. Use follows the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

`saturn-rings.png` is an original, deterministic radial data texture based on the ring boundaries and normal optical-depth ranges published by the NASA Planetary Data System [Ring-Moon Systems Node](https://pds-rings.seti.org/saturn/saturn_rings_table.html). It is an artistic reconstruction, not a measured VIMS, RSS, or imaging profile. RGB stores linear particle tint and alpha stores the square root of normal optical depth divided by four, preserving precision in sparse rings before the shader decodes it.

Local adaptations, reproducible with `scripts/generate-saturn-textures.py`:

- Collapsed the fictional atmosphere source to a robust latitude profile, removing its unsupported longitudinal identity and baked bright features.
- Built a periodic 2048×1024 RGBA cloud atlas from that profile with muted color and deterministic, explicitly non-observational zonal filaments and storms. Alpha stores synthetic cloud optical structure used for restrained shading perturbation; it is not measured opacity, terrain, or a Cassini-derived normal map.
- Generated the D, C, B, Cassini Division, A, Encke/Keeler gaps, and F-ring radial structure from PDS boundaries with deterministic, nonperiodic artistic sub-ring variation.

The fixed source SHA-256, generated output hashes, source URLs, dimensions, channel contract, tool versions, and modification record are stored in `saturn-texture-manifest.json`.

# Mars texture credits

`mars-albedo.webp` is derived from the USGS Astrogeology Science Center [Mars Viking Global Color Mosaic 925m](https://planetarymaps.usgs.gov/mosaic/Mars_Viking_ClrMosaic_global_925m.tif), a photometrically normalized global mosaic assembled from Viking Orbiter imagery. Credit: NASA/JPL/USGS. The USGS product is in the public domain and declares no use constraints.

`mars-normal-height.png` is derived from the Mars Orbiter Laser Altimeter [MOLA MEGDR 16 pixels per degree topography](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megt90n000eb.xml), DOI [`10.17189/1519460`](https://doi.org/10.17189/1519460). Credit: NASA/GSFC/MOLA Science Team/PDS Geosciences Node. Use follows the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

Local adaptations, reproducible with `scripts/generate-mars-textures.py`:

- Downsampled the 23059×11530 Viking mosaic to a 4096×2048 sRGB WebP, preserving its −180°..180° positive-east longitude convention, progressively removing longitude identity at the projection poles, and repairing the periodic color seam over 64 pixels.
- Decoded MOLA's signed big-endian elevation in meters, aligned its 0°..360° east longitudes to the Viking mosaic, and resampled it to 4096×2048 without deriving any terrain data from color.
- Derived metric spherical slopes from MOLA after converging longitude at the poles. RG stores an octahedrally encoded upward tangent normal; BA stores unsigned 16-bit normalized height over the observed range −8177 m to 21171 m.
- The shader uploads the packed MOLA image to separate filtered-normal and nearest-height textures, so byte interpolation cannot corrupt the 16-bit terrain samples used for low-sun self-shadowing.

The fixed source SHA-256 hashes, generated output hashes, source URLs, dimensions, channel contract, tool versions, and full modification record are stored in `mars-texture-manifest.json`.

# Mercury texture credits

`mercury-albedo.webp` is derived from the USGS Astrogeology Science Center [Mercury MESSENGER MDIS Global Color Mosaic 665m v3](https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_color_mosaic_665m). Credit: MESSENGER Team / Arizona State University / USGS. The USGS product is public domain and requests citation of its authors. Its display channels are independently stretched MDIS WAC bands centered at 1000, 750, and 430 nm; this project does not present them as human-eye natural RGB or absolute albedo.

`mercury-normal-height.png` is derived independently from the USGS [Mercury MESSENGER Global DEM 665m v2](https://astrogeology.usgs.gov/search/map/mercury_messenger_global_dem_665m). Credit: USGS Astrogeology Science Center / MESSENGER Team / NASA / Arizona State University / Johns Hopkins Applied Physics Laboratory / Carnegie Institution for Science. The DEM was produced from a global MDIS NAC/WAC-G image tie-point control network, not from color brightness or directly from MLA.

Local adaptations, reproducible with `scripts/generate-mercury-textures.py`:

- Downsampled the color mosaic and its validity mask separately, filled remaining no-data only from neighboring display color, compressed the multispectral chroma into a restrained gray-brown appearance, converged the equirectangular poles, and repaired the periodic color seam.
- Aligned the DEM's 0°..360° positive-east longitude to the color map's −180°..180° convention, resampled it to 2048×1024, and derived metric spherical tangent normals without displacing the silhouette.
- RG stores an octahedrally encoded east/north/up tangent normal. BA stores unsigned 16-bit normalized height over the observed source range −10764 m to 8994 m, high byte then low byte, relative to the 2439400 m datum radius.
- The packed data PNG is lossless and contains no gamma, chromaticity, sRGB, or ICC color-transform chunks. The shader uploads it to separate filtered-normal and nearest/manual-decoded height textures.
- Surface relief visibility is a finite, curvature-aware DEM approximation for the Gallery card, not a claim of physical crater ray tracing.

The fixed source SHA-256 hashes, generated output hashes, source URLs, dimensions, channel contract, tool versions, no-data count, and full modification record are stored in `mercury-texture-manifest.json`.

# Pluto texture credits

`pluto-albedo.png` is derived from the [PIA11707 Pluto Global Color Map](https://www.jpl.nasa.gov/images/pia11707-pluto-color-map/), assembled from New Horizons Ralph/MVIC color-filter observations. Credit: NASA/JHUAPL/SwRI. It is approximate display color, not calibrated bolometric albedo. Use follows the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

`pluto-normal-height.png` is derived independently from the USGS Astrogeology Science Center [Pluto New Horizons LORRI-MVIC Global DEM 300m](https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_dem_300m), produced by the New Horizons Team. Credit: New Horizons Team / NASA / JHUAPL / SwRI / LPI / USGS Astrogeology Science Center. The product has no access constraints and requests citation of its authors.

Local adaptations, reproducible with `scripts/generate-pluto-textures.py`:

- Registered the color map without flip or longitude roll to the DEM's positive-east 0°..360° Simple Cylindrical grid, then downsampled color and validity independently.
- Completed only unobserved southern RGB with low-frequency warm neutral color. The completion contains no authored named terrain, craters, height, normals, or roughness and is not presented as New Horizons data.
- Kept unknown DEM terrain at datum with an up normal and zero decoded relief confidence; confidence feathers only inward from reliable coverage so the boundary cannot become a synthetic cliff or occluder.
- Packed octahedral tangent normal in RG and unsigned 16-bit height over −4101 m to 6491 m in BA. The separate albedo alpha transport stores `round(confidence × 254) + 1`; the shader decodes zero confidence without sacrificing hidden RGB bytes.
- Preserved the periodic longitude seam, converged color at the projection poles, and wrote both assets as lossless PNG without deriving relief from color.

The fixed source SHA-256 hashes, output hashes, source dimensions and counts, datum, height range, registration, channel contract, processing steps, and tool versions are stored in `pluto-texture-manifest.json`. Full evidence and exclusions are recorded in `research/pluto-rendering-webgl-shader-survey.md` and `research/pluto-reference-manifest.json`. These adaptations do not imply NASA, JHUAPL, SwRI, LPI, or USGS endorsement.

# Venus texture credits

`venus-cloud-structure.webp` is derived from the 1440×720 [visible artistic cylindrical map of Venus](https://solarviews.com/cap/venus/venuscyl4.htm) produced from Mariner 10 imagery by NASA/JPL/Seal. The source page distributes it under NASA's copyright-free imagery policy. It is used only as a broad cloud-structure anchor; this project does not present it as a calibrated UV, visible-albedo, or optical-depth map.

Local adaptations, reproducible with `scripts/generate-venus-texture.py`:

- Removed the source's baked color and encoded relative cloud luminance as neutral grayscale structure.
- Softened four visible source-mosaic stitch boundaries, repaired the periodic longitude seam, and progressively removed longitude identity near the equirectangular poles.
- Did not use Magellan radar terrain or derive height, normals, roughness, or solid-surface material from the image.

The fixed source SHA-256, output hash, source URL, dimensions, tool versions, and modification record are stored in `venus-texture-manifest.json`.

# Neptune procedural model

The Neptune look contains no NASA, ESA, or Hubble image pixels. Its deterministic linear data planes provide only broad optical-depth structure, sparse high-cloud seeds, a signed latitude-dependent wind lookup, and one explicitly representative vortex descriptor. The rendered weather is not a current map of Neptune.

The visual model is informed by Voyager 2 and Hubble observations. Its restrained greenish-cyan baseline follows the true-color reconstruction in [Irwin et al. (2024)](https://doi.org/10.1093/mnras/stad3761), rather than the heavily enhanced cobalt-blue Voyager presentation commonly reproduced online. Atmospheric layering and methane interpretation also reference [Irwin et al. (2022)](https://doi.org/10.1029/2022JE007189), while wind and transient-vortex behavior reference [Sromovsky et al. (1993)](https://doi.org/10.1006/icar.1993.1114) and [Wong et al. (2022)](https://doi.org/10.1016/j.icarus.2022.115123).

The default lighting phase and weather-map tilt are artistic presentation choices made to reveal atmospheric depth; they are not Neptune's approximately full Earth-observed phase or physical axial obliquity. Automatic rotation is display-time compressed and its public speed is measured in radians per second, not Neptune hours. The source generator and effect contain no copied external shader code. Generator seed, dimensions, channel contracts, runtime, and output hashes are recorded in `neptune-source-manifest.json`.

# Uranus procedural model

The Uranus look contains no NASA, ESA, STScI, journal, or third-party image pixels. Its deterministic 1024×512 linear RGBA data plane stores only broad aerosol variation, conservative upper-haze structure, a latitude-dominated methane-depletion proxy, and a pole-symmetric hood eligibility mask. The shader's current-northern-spring-inspired body and ring pose is artistic geometry, not a dated ephemeris or a reconstructed global map. Its lighting phase is also an artistic presentation chosen for dimensional legibility, not Uranus's nearly full Earth-observed phase. Automatic rotation is display-time compressed and its public speed is measured in radians per second, not Uranus hours.

The pale greenish-blue visible-color target and subtle polar hood are informed by [Irwin et al. (2024)](https://doi.org/10.1093/mnras/stad3761), [Irwin et al. (2022)](https://doi.org/10.1029/2022JE007189), [James et al. (2023)](https://doi.org/10.1029/2023JE007904), and [Sromovsky et al. (2014)](https://doi.org/10.1016/j.icarus.2014.05.016). Natural-color comparison references NASA and Erich Karkoschka's University of Arizona [Hubble Uranus composite](https://science.nasa.gov/asset/hubble/uranus-in-natural-colors/). Voyager 2 references credit NASA/JPL; infrared morphology references credit NASA, ESA, CSA, and STScI with image processing by Joseph DePasquale, Alyssa Pagan, and Macarena Garcia Marin.

The ten dense rings are original analytic geometry derived from radii, widths, eccentricities, and representative optical depths published by the [PDS Ring-Moon Systems Node](https://pds-rings.seti.org/uranus/uranus_rings_table.html), citing Nicholson et al. (2018) and Showalter & Lissauer (2006). Their restrained dark reflectance references [Svitek & Danielson (1987)](https://ntrs.nasa.gov/citations/19880039585) and [Karkoschka (1997)](https://doi.org/10.1006/icar.1996.5631). Measured geometry and optical-depth inputs remain intact, but unresolved opacity, reflected radiance, and ring-cast shadows use a documented artistic display gain for card-scale legibility; they are not photometrically physical. Narrow-ring antialiasing and both mutual shadows are computed analytically; the renderer does not copy an external shader or redistribute reference imagery. Full evidence, exclusions, frozen measurements, and scoring rules are recorded in `research/uranus-rendering-webgl-shader-survey.md` and `research/uranus-reference-manifest.json`.

# Sun AIA 304 observation

`sun-aia-304.png` is derived from frame 0 of NASA Scientific Visualization Studio's fixed [SDO/AIA 304 Å “Jewelbox” sequence](https://svs.gsfc.nasa.gov/3983/), observed at approximately 2011-09-25 08:00 UTC. The exact 4096×4096 source is [`SDOAIA304A_Jewelbox.00000.tif`](https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003983/frames/4096x4096_1x1_30p/304A-Frames/SDOAIA304A_Jewelbox.00000.tif), SHA-256 `f3dfceec148259ee3980cf20accca505da986a27dc32f507481ce4c4e9d6963c`.

Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio, the SDO Science Team, and the Virtual Solar Observatory. Use follows the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

The TIFF is an 8-bit sRGB coded-color visualization of the AIA 304 Å (30.4 nm) channel, not natural visible color, raw detector data, linear physical radiance, or a simultaneous white-light/corona exposure. The local Effect preserves that observational identity and adds no analytic corona, prominence arches, sphere projection, PBR lighting, star field, or third-party shader code.

Local adaptations, reproducible with `scripts/generate-sun-texture.py`:

- Preserved the fixed SVS coded-color palette while downsampling the source to a 1024×1024 RGBA PNG.
- Fitted a fully opaque observed disk independently of RGB intensity, so dark on-disk filaments remain opaque.
- Subtracted the smooth dark-red exterior background and retained only connected, attached off-limb emission; background-subtracted emission is stored as straight color plus coverage alpha.
- Dilated hidden edge color for safe filtering. The copied Effect builds its mip chain with alpha-weighted RGB so minification does not create a dark fringe.
- Applies only restrained linear-light grading and a small periodic displacement of high-frequency residual detail; the low-pass observation, active-region positions, prominences, and alpha remain fixed.

The source URL, output hash, processing thresholds, fitted center/radius, observation time, tool versions, and full modification record are stored in `sun-texture-manifest.json`. Research, rejected visual models, source-code audits, and validation criteria are recorded in `research/sun-rendering-webgl-shader-survey.md`.

# Solar Sky model

`SOLAR SKY` is a procedural Earth-atmosphere renderer and contains no photographic sky, horizon, or solar-disk texture. Its four-wavelength spectral transport and fitted multiple-scattering model are adapted from Fernando García Liñán's implementation as converted for Blender. The adapted algorithm carries these notices:

- SPDX-FileCopyrightText: 2022 Fernando García Liñán
- SPDX-FileCopyrightText: 2011-2025 Blender Authors
- SPDX-License-Identifier: MIT

The original MIT-licensed conversion is [`sky_multiple_scattering.cpp`](https://projects.blender.org/blender/blender/src/commit/084aefd0e03ace27317e0a252ac206f3a461bd96/intern/sky/sky_multiple_scattering.cpp). The React lifecycle, WebGL2 render targets and caching, observer refraction, apparent-disk deformation, terrain-horizon composition, camera, and final display pass were implemented independently for Strata. Full research, source-code audits, selected architecture, physical boundaries, and validation criteria are recorded in `research/ground-observer-sun-rendering-survey.md`.

# Titan procedural model

The Titan look contains no NASA, JPL, journal, simulator, or third-party image pixels or shader code. Its deterministic 1024×512 linear RGBA source stores only low-frequency main-haze optical-depth variation, broad latitude structure, detached-layer column variation, and a northern-winter polar-hood eligibility mask. It deliberately contains no visible, near-infrared, or radar surface geography.

The muted orange natural-visible body is informed by Cassini ISS products [PIA06081](https://www.jpl.nasa.gov/images/pia06081-titan-in-natural-color) and [PIA06230](https://photojournal.jpl.nasa.gov/catalog/PIA06230). The detached-layer altitude, optical gap, and strongly phase-dependent geometry are informed by [PIA07774](https://science.nasa.gov/photojournal/titans-halo-2/), [PIA06090](https://science.nasa.gov/photojournal/purple-haze/), and Seignovert et al. ([2017](https://doi.org/10.1016/j.icarus.2017.03.026), [2021](https://doi.org/10.3847/1538-4357/abcd3b)). Credit for the reference imagery: NASA/JPL/Space Science Institute and NASA/JPL-Caltech/Space Science Institute.

The default freezes a representative 2005–2007 pre-equinox northern-winter atmosphere rather than claiming a timeless reconstruction. Its finite main-haze transport, visible-color coefficients, lower detached-layer profile, bounded forward-scattering display gain, and compressed card-scale exposure are documented visual fits, not a Cassini radiative-transfer retrieval. Enhanced UV color is used only for geometry, never copied as literal visible radiance; the 938 nm surface mosaic is explicitly excluded. Full evidence, source-code audits, numerical contracts, exclusions, and validation gates are recorded in `research/titan-rendering-webgl-shader-survey.md` and `research/titan-reference-manifest.json`.
