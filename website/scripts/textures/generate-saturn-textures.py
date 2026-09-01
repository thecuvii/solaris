#!/usr/bin/env python3
"""Generate Strata's reproducible Saturn atmosphere and ring data textures.

Requires Python 3 with numpy and Pillow:
  python3 -m pip install numpy pillow

The atmosphere begins with NASA/JPL-Caltech's explicitly fictional 720x360
planetary map. This script removes unsupported longitudinal identity, retains a
robust latitude color profile, and layers a deterministic artistic cloud atlas
without claiming Cassini-derived global detail.

The ring texture is linear RGBA data generated from the official PDS ring
boundaries. RGB stores particle tint; alpha stores sqrt(normal optical depth / 4)
so sparse rings retain precision. Sub-ring variation is deterministic artistic
reconstruction rather than a measured occultation profile.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "saturn"

SOURCE_URL = (
    "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/"
    "image/saturn/Saturn.tif"
)
SOURCE_SHA256 = "aca2a8ae07c9b506d13b656ba89ecacb383f32f1e5ffe52fae6b8c16c581816f"
SOURCE_WIDTH = 720
SOURCE_HEIGHT = 360
ATMOSPHERE_WIDTH = 2048
ATMOSPHERE_HEIGHT = 1024
RING_WIDTH = 4096
RING_HEIGHT = 4
RING_INNER_KM = 66_900.0
RING_OUTER_KM = 140_500.0
TAU_ENCODING_MAX = 4.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(destination: Path) -> None:
    if destination.exists() and sha256(destination) == SOURCE_SHA256:
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    print(f"downloading {SOURCE_URL}")
    with urllib.request.urlopen(SOURCE_URL) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)

    actual_sha256 = sha256(temporary)
    if actual_sha256 != SOURCE_SHA256:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(
            f"unexpected SHA-256 for {SOURCE_URL}: {actual_sha256} != {SOURCE_SHA256}"
        )
    temporary.replace(destination)


def smooth_profile(profile: np.ndarray) -> np.ndarray:
    kernel = np.array([1, 4, 6, 4, 1], dtype=np.float64)
    kernel /= kernel.sum()
    result = profile.astype(np.float64)
    for _ in range(2):
        padded = np.pad(result, ((2, 2), (0, 0)), mode="edge")
        result = sum(kernel[index] * padded[index : index + len(result)] for index in range(5))
    return result


def process_atmosphere(source: Path, destination: Path) -> None:
    with Image.open(source) as source_image:
        if source_image.size != (SOURCE_WIDTH, SOURCE_HEIGHT):
            raise RuntimeError(
                f"unexpected Saturn dimensions: {source_image.size} != "
                f"{(SOURCE_WIDTH, SOURCE_HEIGHT)}"
            )
        pixels = np.asarray(source_image.convert("RGB"), dtype=np.float64) / 255.0

    sorted_rows = np.sort(pixels, axis=1)
    trim = SOURCE_WIDTH // 5
    profile = sorted_rows[:, trim:-trim].mean(axis=1)
    profile = smooth_profile(profile)

    broad_profile = profile.copy()
    for _ in range(10):
        broad_profile = smooth_profile(broad_profile)
    profile = broad_profile + (profile - broad_profile) * 0.56

    luminance = profile @ np.array([0.2126, 0.7152, 0.0722])
    profile = luminance[:, None] + (profile - luminance[:, None]) * 0.42
    mean_color = profile[52:-52].mean(axis=0, keepdims=True)
    profile = mean_color + (profile - mean_color) * 0.78
    north_anchor = 34
    south_anchor = SOURCE_HEIGHT - north_anchor - 1
    for row in range(north_anchor):
        convergence = ((north_anchor - row) / north_anchor) ** 1.6
        profile[row] = profile[row] * (1 - convergence) + profile[north_anchor] * (
            0.88 * convergence
        )
    for row in range(south_anchor + 1, SOURCE_HEIGHT):
        convergence = ((row - south_anchor) / north_anchor) ** 1.6
        profile[row] = profile[row] * (1 - convergence) + profile[south_anchor] * (
            0.86 * convergence
        )
    profile *= np.array([0.995, 1.0, 1.035])
    profile = np.clip(profile, 0.0, 1.0)

    strip = Image.fromarray(np.rint(profile[:, None] * 255).astype(np.uint8), mode="RGB")
    latitude_strip = strip.resize(
        (1, ATMOSPHERE_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    latitude_color = np.asarray(latitude_strip, dtype=np.float32)[:, 0] / 255.0

    longitude = np.linspace(0.0, 2.0 * np.pi, ATMOSPHERE_WIDTH, endpoint=False)[None, :]
    latitude_normalized = np.linspace(-1.0, 1.0, ATMOSPHERE_HEIGHT)[:, None]
    latitude_radians = latitude_normalized * (0.5 * np.pi)
    rng = np.random.default_rng(0x5A7A11)

    broad = np.zeros((ATMOSPHERE_HEIGHT, ATMOSPHERE_WIDTH), dtype=np.float32)
    filament = np.zeros_like(broad)
    for index in range(14):
        longitude_frequency = int(rng.integers(1, 8))
        latitude_frequency = int(rng.integers(9, 58))
        phase = float(rng.uniform(0.0, 2.0 * np.pi))
        shear_frequency = int(rng.integers(2, 9))
        shear = np.sin(latitude_radians * shear_frequency + phase * 0.37)
        amplitude = 1.0 / (1.0 + index * 0.24)
        broad += amplitude * np.sin(
            longitude * longitude_frequency
            + latitude_radians * latitude_frequency
            + shear * (0.6 + 0.08 * index)
            + phase
        )
    for index in range(18):
        longitude_frequency = int(rng.integers(5, 24))
        latitude_frequency = int(rng.integers(48, 176))
        phase = float(rng.uniform(0.0, 2.0 * np.pi))
        amplitude = 1.0 / (1.0 + index * 0.18)
        filament += amplitude * np.sin(
            longitude * longitude_frequency
            + latitude_radians * latitude_frequency
            + broad * 0.025
            + phase
        )

    broad /= max(float(broad.std()), 1e-6)
    filament /= max(float(filament.std()), 1e-6)
    zonal = np.sin(latitude_radians * 94.0 + broad * 0.7) + 0.42 * np.sin(
        latitude_radians * 187.0 - filament * 0.35
    )
    cloud_structure = broad * 0.46 + filament * 0.22 + zonal * 0.32

    def storm(longitude_degrees: float, latitude_value: float, width: float, height: float) -> np.ndarray:
        center = np.deg2rad(longitude_degrees)
        longitude_distance = np.angle(np.exp(1j * (longitude - center)))
        latitude_distance = latitude_normalized - latitude_value
        return np.exp(
            -0.5 * ((longitude_distance / width) ** 2 + (latitude_distance / height) ** 2)
        )

    def vortex(
        longitude_degrees: float,
        latitude_value: float,
        width: float,
        height: float,
        handedness: float,
    ) -> np.ndarray:
        center = np.deg2rad(longitude_degrees)
        x = np.angle(np.exp(1j * (longitude - center))) / width
        y = (latitude_normalized - latitude_value) / height
        radius = np.sqrt(x * x + y * y)
        angle = np.arctan2(y, x)
        envelope = np.exp(-0.5 * radius * radius)
        spiral = np.sin(angle * 3.0 * handedness + radius * 4.6)
        return envelope * (0.54 + spiral * 0.46)

    storm_field = (
        0.92 * vortex(36.0, -0.36, 0.15, 0.036, 1.0)
        - 0.68 * vortex(132.0, 0.18, 0.11, 0.03, -1.0)
        + 0.48 * storm(278.0, 0.46, 0.11, 0.028)
    )
    polar_fade = smoothstep(0.0, 0.16, 1.0 - np.abs(latitude_normalized))
    cloud_structure = np.clip(cloud_structure * polar_fade + storm_field, -2.5, 2.5)
    cloud_structure /= 2.5

    base = latitude_color[:, None, :]
    warm_shift = np.stack(
        (
            cloud_structure * 0.032,
            cloud_structure * 0.012,
            cloud_structure * -0.024,
        ),
        axis=-1,
    )
    cloud_albedo = base * (1.0 + cloud_structure[..., None] * 0.145) + warm_shift
    cloud_albedo = np.clip(cloud_albedo, 0.0, 1.0)
    cloud_optical_structure = np.clip(
        0.52 + cloud_structure * 0.36 + storm_field * 0.14,
        0.0,
        1.0,
    )

    rgba = np.concatenate((cloud_albedo, cloud_optical_structure[..., None]), axis=-1)
    atmosphere = Image.fromarray(np.rint(rgba * 255).astype(np.uint8), mode="RGBA")
    atmosphere.save(destination, "WEBP", quality=96, method=6, exact=True)


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def band_mask(radius: np.ndarray, start: float, end: float, feather: float = 30.0) -> np.ndarray:
    return smoothstep(start - feather, start + feather, radius) * (
        1.0 - smoothstep(end - feather, end + feather, radius)
    )


def gap_mask(radius: np.ndarray, start: float, end: float, feather: float = 12.0) -> np.ndarray:
    return 1.0 - band_mask(radius, start, end, feather)


def filtered_noise(rng: np.random.Generator, length: int, radius: int) -> np.ndarray:
    values = rng.standard_normal(length)
    coordinate = np.arange(-radius, radius + 1, dtype=np.float64)
    sigma = max(radius * 0.38, 0.75)
    kernel = np.exp(-0.5 * (coordinate / sigma) ** 2)
    kernel /= kernel.sum()
    padded = np.pad(values, radius, mode="reflect")
    result = np.convolve(padded, kernel, mode="same")[radius:-radius]
    result -= result.mean()
    result /= max(result.std(), 1e-6)
    return result


def process_rings(destination: Path) -> None:
    radius = np.linspace(RING_INNER_KM, RING_OUTER_KM, RING_WIDTH)
    tau = np.zeros(RING_WIDTH, dtype=np.float64)
    tint = np.zeros((RING_WIDTH, 3), dtype=np.float64)
    weight = np.zeros(RING_WIDTH, dtype=np.float64)
    rng = np.random.default_rng(0xCA551A1)
    micro_noise = filtered_noise(rng, RING_WIDTH, 2)
    fine_noise = filtered_noise(rng, RING_WIDTH, 7)
    medium_noise = filtered_noise(rng, RING_WIDTH, 29)
    broad_noise = filtered_noise(rng, RING_WIDTH, 113)

    def add_region(
        start: float,
        end: float,
        optical_depth: np.ndarray | float,
        color: tuple[float, float, float],
        feather: float = 30.0,
    ) -> None:
        nonlocal tau, tint, weight
        mask = band_mask(radius, start, end, feather)
        local_tau = np.asarray(optical_depth) * mask
        tau += local_tau
        tint += mask[:, None] * np.asarray(color)[None, :]
        weight += mask

    d_detail = 0.017 * np.exp(0.22 * medium_noise + 0.1 * fine_noise)
    add_region(66_900, 74_510, d_detail, (0.34, 0.29, 0.26), 55)

    c_detail = 0.095 * np.exp(
        0.28 * broad_noise + 0.2 * medium_noise + 0.08 * micro_noise
    )
    add_region(74_658, 92_000, c_detail, (0.5, 0.42, 0.39), 40)

    b_detail = 1.08 + 0.3 * broad_noise + 0.18 * medium_noise + 0.065 * fine_noise
    b_detail = np.clip(b_detail, 0.42, 2.25)
    b_bowl = 0.78 + 0.55 * np.exp(-((radius - 105_000.0) / 8_500.0) ** 2)
    add_region(92_000, 117_580, b_detail * b_bowl, (0.74, 0.61, 0.47), 45)

    cassini_detail = 0.055 * np.exp(0.46 * medium_noise + 0.22 * fine_noise)
    add_region(117_580, 122_050, cassini_detail, (0.35, 0.34, 0.33), 24)

    a_detail = 0.58 + 0.18 * broad_noise + 0.12 * medium_noise + 0.055 * micro_noise
    a_detail = np.clip(a_detail, 0.16, 1.28)
    add_region(122_050, 136_780, a_detail, (0.64, 0.57, 0.51), 35)

    tau *= gap_mask(radius, 133_423, 133_745, 12)
    tau *= gap_mask(radius, 136_505, 136_555, 7)

    f_core = np.exp(-0.5 * ((radius - 140_180.0) / 38.0) ** 2)
    f_halo = np.exp(-0.5 * ((radius - 140_180.0) / 135.0) ** 2)
    add_region(139_600, 140_480, 0.92 * f_core + 0.11 * f_halo, (0.5, 0.49, 0.47), 8)

    tint /= np.maximum(weight[:, None], 1e-6)
    tint_variation = np.stack((fine_noise, medium_noise, broad_noise), axis=-1)
    tint *= 1.0 + tint_variation * np.array([0.065, 0.048, 0.036])
    tint = np.clip(tint, 0.0, 1.0)
    encoded_tau = np.sqrt(np.clip(tau / TAU_ENCODING_MAX, 0.0, 1.0))

    pixels = np.concatenate((tint, encoded_tau[:, None]), axis=1)
    row = np.rint(pixels * 255).astype(np.uint8)[None, :, :]
    image = np.repeat(row, RING_HEIGHT, axis=0)
    Image.fromarray(image, mode="RGBA").save(destination, "PNG", optimize=True)


def write_manifest(atmosphere: Path, rings: Path, destination: Path) -> None:
    manifest = {
        "atmosphere": {
            "asset": "NASA/JPL-Caltech Saturn fictional planetary map",
            "credit": "NASA/JPL-Caltech",
            "licenseGuidance": "NASA Images and Media Usage Guidelines",
            "modifications": [
                "collapsed the source to a robust latitude profile to remove unsupported longitudinal identity",
                "gently reduced saturation and balanced the warm color cast",
                "softened the unsupported source-pole colors into restrained polar caps",
                "layered deterministic non-observational zonal filaments and storms over the latitude profile",
                "stored cloud optical structure in alpha for restrained shader normal perturbation",
                "resampled the result to a 2048x1024 periodic sRGB WebP",
            ],
            "output": atmosphere.name,
            "outputDimensions": [ATMOSPHERE_WIDTH, ATMOSPHERE_HEIGHT],
            "outputSha256": sha256(atmosphere),
            "sourceDimensions": [SOURCE_WIDTH, SOURCE_HEIGHT],
            "sourceIsFictional": True,
            "sourceSha256": SOURCE_SHA256,
            "sourceUrl": SOURCE_URL,
        },
        "numpyVersion": np.__version__,
        "pillowVersion": PILLOW_VERSION,
        "rings": {
            "basis": "PDS Ring-Moon Systems Node Saturn ring boundaries and optical-depth ranges",
            "channelContract": {
                "rgb": "linear artistic particle tint",
                "alpha": f"square root of normal optical depth divided by {TAU_ENCODING_MAX}",
            },
            "dataStatus": "deterministic nonperiodic artistic reconstruction, not a measured occultation profile",
            "output": rings.name,
            "outputDimensions": [RING_WIDTH, RING_HEIGHT],
            "outputSha256": sha256(rings),
            "radialRangeKm": [RING_INNER_KM, RING_OUTER_KM],
            "sourceUrl": "https://pds-rings.seti.org/saturn/saturn_rings_table.html",
        },
    }
    serialized = json.dumps(manifest, indent=2)
    for key in ("outputDimensions", "radialRangeKm", "sourceDimensions"):
        serialized = re.sub(
            rf'("{key}": )\[\n\s+([^,\n]+),\n\s+([^\n]+)\n\s+\]',
            rf"\1[\2, \3]",
            serialized,
        )
    destination.write_text(serialized + "\n", encoding="utf-8")


def verify(output: Path) -> None:
    atmosphere = output / "saturn-atmosphere.webp"
    rings = output / "saturn-rings.png"
    manifest_path = output / "saturn-texture-manifest.json"
    if not atmosphere.exists() or not rings.exists() or not manifest_path.exists():
        raise RuntimeError("Saturn textures or manifest are missing; generate them first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["atmosphere"].get("sourceSha256") != SOURCE_SHA256:
        raise RuntimeError("Saturn manifest references an unexpected atmosphere source")
    if manifest["atmosphere"].get("outputSha256") != sha256(atmosphere):
        raise RuntimeError("Saturn atmosphere does not match its manifest")
    if manifest["rings"].get("outputSha256") != sha256(rings):
        raise RuntimeError("Saturn rings do not match their manifest")
    with Image.open(atmosphere) as image:
        if image.size != (ATMOSPHERE_WIDTH, ATMOSPHERE_HEIGHT) or image.mode != "RGBA":
            raise RuntimeError("unexpected Saturn atmosphere texture contract")
        alpha_extrema = image.getchannel("A").getextrema()
        if alpha_extrema[0] >= alpha_extrema[1]:
            raise RuntimeError("Saturn atmosphere cloud structure is missing")
    with Image.open(rings) as image:
        if image.size != (RING_WIDTH, RING_HEIGHT) or image.mode != "RGBA":
            raise RuntimeError("unexpected Saturn ring texture contract")
    print(f"verified {atmosphere.relative_to(ROOT)} ({sha256(atmosphere)})")
    print(f"verified {rings.relative_to(ROOT)} ({sha256(rings)})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-saturn-textures",
    )
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.verify:
        verify(args.output)
        return

    args.output.mkdir(parents=True, exist_ok=True)
    source = args.cache / "nasa-jpl-saturn.tif"
    atmosphere = args.output / "saturn-atmosphere.webp"
    rings = args.output / "saturn-rings.png"
    manifest = args.output / "saturn-texture-manifest.json"
    download(source)
    process_atmosphere(source, atmosphere)
    process_rings(rings)
    write_manifest(atmosphere, rings, manifest)
    print(f"wrote {atmosphere.relative_to(ROOT)} ({sha256(atmosphere)})")
    print(f"wrote {rings.relative_to(ROOT)} ({sha256(rings)})")
    print(f"wrote {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
