#!/usr/bin/env python3
"""Generate the web Moon textures from NASA SVS LROC and LOLA masters.

Requires Python 3 with numpy, Pillow, and tifffile:
  python3 -m pip install numpy pillow tifffile

The script downloads fixed CGI Moon Kit assets, verifies their hashes, writes a
4K sRGB albedo WebP, and packs a tangent-space normal plus normalized LOLA
height into an RGBA WebP. Source TIFFs stay in a temporary cache and are not
part of the web bundle.
"""

from __future__ import annotations

import argparse
import hashlib
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "moon"

ALBEDO_SOURCE = (
    "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
    "lroc_color_16bit_srgb_4k.tif"
)
ALBEDO_SHA256 = "9731fa8af425b6c2f88f277ecca82bf8c603f3743894f64ed7b25c5bfefa22ff"
DEM_SOURCE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif"
DEM_SHA256 = "1ea42bf44f7e9d694f79c3afa7145f97fbf06cc67372067d9fe73dce43bad796"

OUTPUT_WIDTH = 4096
OUTPUT_HEIGHT = 2048
MOON_RADIUS_KM = 1737.4
HEIGHT_MIN_KM = -10.0
HEIGHT_MAX_KM = 12.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, expected_sha256: str, destination: Path) -> None:
    if destination.exists() and sha256(destination) == expected_sha256:
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    print(f"downloading {url}")
    with urllib.request.urlopen(url) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)

    actual_sha256 = sha256(temporary)
    if actual_sha256 != expected_sha256:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(
            f"unexpected SHA-256 for {url}: {actual_sha256} != {expected_sha256}"
        )
    temporary.replace(destination)


def write_albedo(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        albedo = image.convert("RGB")
        if albedo.size != (OUTPUT_WIDTH, OUTPUT_HEIGHT):
            albedo = albedo.resize((OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.Resampling.LANCZOS)
        albedo.save(destination, "WEBP", quality=94, method=6, exact=True)


def write_normal_height(source: Path, destination: Path) -> tuple[float, float]:
    source_height = tifffile.imread(source).astype(np.float32, copy=False)
    height_image = Image.fromarray(source_height, mode="F").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    height = np.asarray(height_image, dtype=np.float32).copy()
    del source_height, height_image

    latitude = (
        np.pi / 2
        - (np.arange(OUTPUT_HEIGHT, dtype=np.float32) + 0.5) * (np.pi / OUTPUT_HEIGHT)
    )
    cosine_latitude = np.cos(latitude)
    stable_cosine = np.maximum(cosine_latitude, 0.05)[:, None]
    longitude_step = 2 * np.pi / OUTPUT_WIDTH
    latitude_step = np.pi / OUTPUT_HEIGHT

    east_slope = np.roll(height, -1, axis=1)
    east_slope -= np.roll(height, 1, axis=1)
    east_slope /= 2 * MOON_RADIUS_KM * stable_cosine * longitude_step

    north_slope = np.empty_like(height)
    north_slope[1:-1] = height[:-2] - height[2:]
    north_slope[0] = height[0] - height[1]
    north_slope[-1] = height[-2] - height[-1]
    north_slope /= 2 * MOON_RADIUS_KM * latitude_step

    # Equirectangular longitude collapses at the poles. Fade east derivatives
    # there rather than preserving coordinate noise as physical relief.
    pole_stability = np.clip(cosine_latitude / 0.08, 0.0, 1.0)[:, None]
    east_slope *= pole_stability

    normal_length = np.sqrt(east_slope * east_slope + north_slope * north_slope + 1.0)
    encoded = np.empty((OUTPUT_HEIGHT, OUTPUT_WIDTH, 4), dtype=np.uint8)
    encoded[..., 0] = np.rint((-east_slope / normal_length * 0.5 + 0.5) * 255).astype(
        np.uint8
    )
    encoded[..., 1] = np.rint((-north_slope / normal_length * 0.5 + 0.5) * 255).astype(
        np.uint8
    )
    encoded[..., 2] = np.rint((1.0 / normal_length * 0.5 + 0.5) * 255).astype(np.uint8)
    encoded[..., 3] = np.rint(
        np.clip((height - HEIGHT_MIN_KM) / (HEIGHT_MAX_KM - HEIGHT_MIN_KM), 0.0, 1.0)
        * 255
    ).astype(np.uint8)

    Image.fromarray(encoded, mode="RGBA").save(
        destination,
        "WEBP",
        quality=96,
        method=6,
        exact=True,
    )
    return float(np.min(height)), float(np.max(height))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-moon-textures",
    )
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    albedo_source = args.cache / "lroc_color_16bit_srgb_4k.tif"
    dem_source = args.cache / "ldem_16.tif"
    download(ALBEDO_SOURCE, ALBEDO_SHA256, albedo_source)
    download(DEM_SOURCE, DEM_SHA256, dem_source)

    albedo_output = args.output / "moon-albedo.webp"
    normal_height_output = args.output / "moon-normal-height.webp"
    write_albedo(albedo_source, albedo_output)
    height_min, height_max = write_normal_height(dem_source, normal_height_output)

    height_scale = (HEIGHT_MAX_KM - HEIGHT_MIN_KM) / MOON_RADIUS_KM
    print(f"wrote {albedo_output.relative_to(ROOT)} ({sha256(albedo_output)})")
    print(f"wrote {normal_height_output.relative_to(ROOT)} ({sha256(normal_height_output)})")
    print(
        f"LOLA resized range {height_min:.4f}..{height_max:.4f} km; "
        f"packed height scale {height_scale:.8f} lunar radii"
    )


if __name__ == "__main__":
    main()
