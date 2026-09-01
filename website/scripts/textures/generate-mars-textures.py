#!/usr/bin/env python3
"""Generate Strata's web Mars textures from USGS Viking and NASA MOLA data.

Requires Python 3 with numpy and Pillow:
  python3 -m pip install numpy pillow

The script downloads fixed public-domain source products, verifies their
hashes, downsamples the Viking color mosaic in sRGB, and derives a tangent-space
octahedral normal plus unsigned 16-bit height from MOLA topography. It never
derives terrain, roughness, or height from the color image.
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
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "mars"

ALBEDO_URL = "https://planetarymaps.usgs.gov/mosaic/Mars_Viking_ClrMosaic_global_925m.tif"
ALBEDO_SHA256 = "5b3c6bea36cec0ec65b9ce5927db6b1c555c5fae60a227c774f9fcaecdf5bb33"
ALBEDO_SOURCE_WIDTH = 23_059
ALBEDO_SOURCE_HEIGHT = 11_530

MOLA_URL = (
    "https://pds-geosciences.wustl.edu/mgs/"
    "urn-nasa-pds-mgs_mola_topography_derived/meg016/megt90n000eb.img"
)
MOLA_XML_URL = (
    "https://pds-geosciences.wustl.edu/mgs/"
    "urn-nasa-pds-mgs_mola_topography_derived/meg016/megt90n000eb.xml"
)
MOLA_SHA256 = "d18d9b9ab8c5516d02e157dd2cde0f1d0d160c21940e953ba22391269a545e7b"
MOLA_XML_SHA256 = "4ba8d77f2c72f80d4c554213ab6e24b44c861fff2e25433db095a19cc0a6f660"
MOLA_WIDTH = 5_760
MOLA_HEIGHT = 2_880

OUTPUT_WIDTH = 4_096
OUTPUT_HEIGHT = 2_048
MARS_MEAN_RADIUS_METERS = 3_389_500.0
HEIGHT_MIN_METERS = -8_177.0
HEIGHT_MAX_METERS = 21_171.0
ALBEDO_POLAR_CONVERGENCE_ROWS = 160
ALBEDO_SEAM_BLEND_WIDTH = 64
HEIGHT_POLAR_CONVERGENCE_ROWS = 48


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


def periodic_blur(row: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return row
    frequencies = np.fft.rfftfreq(row.shape[0])
    kernel = np.exp(-2 * np.pi * np.pi * sigma * sigma * frequencies * frequencies)
    transformed = np.fft.rfft(row, axis=0)
    if row.ndim == 1:
        return np.fft.irfft(transformed * kernel, n=row.shape[0], axis=0)
    return np.fft.irfft(transformed * kernel[:, None], n=row.shape[0], axis=0)


def converge_poles(image: np.ndarray, row_count: int) -> None:
    width = image.shape[1]
    for distance in range(row_count):
        progress = (row_count - distance) / row_count
        sigma = (progress**1.7) * width * 0.12
        convergence = progress**3
        for row_index in (distance, image.shape[0] - distance - 1):
            row = image[row_index].astype(np.float64)
            blurred = periodic_blur(row, sigma)
            mean = row.mean(axis=0, keepdims=True)
            image[row_index] = blurred * (1 - convergence) + mean * convergence


def repair_color_seam(image: np.ndarray) -> None:
    for index in range(ALBEDO_SEAM_BLEND_WIDTH):
        progress = index / (ALBEDO_SEAM_BLEND_WIDTH - 1)
        weight = 1 - progress * progress * (3 - 2 * progress)
        left = image[:, index].astype(np.float32)
        right = image[:, -1 - index].astype(np.float32)
        average = (left + right) * 0.5
        image[:, index] = np.rint(left * (1 - weight) + average * weight).astype(np.uint8)
        image[:, -1 - index] = np.rint(
            right * (1 - weight) + average * weight
        ).astype(np.uint8)


def write_albedo(source: Path, destination: Path) -> None:
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(source) as source_image:
        if source_image.size != (ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT):
            raise RuntimeError(
                f"unexpected Viking dimensions: {source_image.size} != "
                f"{(ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT)}"
            )
        albedo = source_image.convert("RGB").resize(
            (OUTPUT_WIDTH, OUTPUT_HEIGHT),
            Image.Resampling.LANCZOS,
            reducing_gap=3.0,
        )
    pixels = np.asarray(albedo, dtype=np.uint8).copy()
    del albedo
    converge_poles(pixels, ALBEDO_POLAR_CONVERGENCE_ROWS)
    repair_color_seam(pixels)
    Image.fromarray(pixels, mode="RGB").save(
        destination,
        "WEBP",
        quality=95,
        method=6,
        exact=True,
    )


def write_normal_height(source: Path, destination: Path) -> tuple[float, float]:
    source_height = np.memmap(
        source,
        dtype=">i2",
        mode="r",
        shape=(MOLA_HEIGHT, MOLA_WIDTH),
    )
    observed_minimum = float(np.min(source_height))
    observed_maximum = float(np.max(source_height))
    if (observed_minimum, observed_maximum) != (HEIGHT_MIN_METERS, HEIGHT_MAX_METERS):
        raise RuntimeError(
            "unexpected MOLA height range: "
            f"{observed_minimum}..{observed_maximum} != "
            f"{HEIGHT_MIN_METERS}..{HEIGHT_MAX_METERS}"
        )

    source_float = np.asarray(source_height, dtype=np.float32)
    height_image = Image.fromarray(source_float, mode="F").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    del source_height, source_float
    height = np.asarray(height_image, dtype=np.float32).copy()
    del height_image

    # MOLA is 0..360°E; the albedo GeoTIFF and shader use -180..180°E.
    height = np.roll(height, -(OUTPUT_WIDTH // 2), axis=1)
    converge_poles(height, HEIGHT_POLAR_CONVERGENCE_ROWS)

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
    east_slope /= 2 * MARS_MEAN_RADIUS_METERS * stable_cosine * longitude_step

    north_slope = np.empty_like(height)
    north_slope[1:-1] = height[:-2] - height[2:]
    north_slope[0] = height[0] - height[1]
    north_slope[-1] = height[-2] - height[-1]
    north_slope /= 2 * MARS_MEAN_RADIUS_METERS * latitude_step

    # Equirectangular longitude collapses at the poles. Fade east derivatives
    # there rather than preserving coordinate noise as physical terrain.
    pole_stability = np.clip(cosine_latitude / 0.08, 0.0, 1.0)[:, None]
    east_slope *= pole_stability

    # Encode the upward tangent normal with octahedral RG. Since z is positive,
    # no lower-hemisphere fold is needed. BA stores normalized uint16 height.
    denominator = np.abs(east_slope) + np.abs(north_slope) + 1.0
    octahedral_x = -east_slope / denominator
    octahedral_y = -north_slope / denominator
    encoded = np.empty((OUTPUT_HEIGHT, OUTPUT_WIDTH, 4), dtype=np.uint8)
    encoded[..., 0] = np.rint(np.clip(octahedral_x * 0.5 + 0.5, 0.0, 1.0) * 255).astype(
        np.uint8
    )
    encoded[..., 1] = np.rint(np.clip(octahedral_y * 0.5 + 0.5, 0.0, 1.0) * 255).astype(
        np.uint8
    )

    normalized_height = np.clip(
        (height - HEIGHT_MIN_METERS) / (HEIGHT_MAX_METERS - HEIGHT_MIN_METERS),
        0.0,
        1.0,
    )
    encoded_height = np.rint(normalized_height * 65_535).astype(np.uint16)
    encoded[..., 2] = (encoded_height >> 8).astype(np.uint8)
    encoded[..., 3] = (encoded_height & 255).astype(np.uint8)
    Image.fromarray(encoded, mode="RGBA").save(destination, "PNG", optimize=True)
    return float(np.min(height)), float(np.max(height))


def write_manifest(albedo: Path, normal_height: Path, destination: Path) -> None:
    manifest = {
        "albedo": {
            "asset": "Mars Viking Global Color Mosaic 925m",
            "credit": "NASA/JPL/USGS",
            "license": "Public domain; no use constraints",
            "modifications": [
                "downsampled the photometrically normalized global color mosaic in sRGB",
                "preserved the source's -180..180 degree positive-east longitude convention",
                "progressively removed longitudinal detail at the equirectangular poles",
                "repaired the periodic longitude color seam over 64 pixels",
                "did not derive height, normal, or roughness from color",
            ],
            "output": albedo.name,
            "outputDimensions": [OUTPUT_WIDTH, OUTPUT_HEIGHT],
            "outputSha256": sha256(albedo),
            "sourceDimensions": [ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT],
            "sourceNoData": 0,
            "sourceSha256": ALBEDO_SHA256,
            "sourceUrl": ALBEDO_URL,
        },
        "mola": {
            "asset": "MOLA MEGDR 16 pixels per degree topography",
            "channelContract": {
                "rg": "upward tangent-space normal, octahedral encoded",
                "ba": "unsigned 16-bit normalized height, big byte then little byte",
            },
            "credit": "NASA/GSFC/MOLA Science Team/PDS Geosciences Node",
            "doi": "10.17189/1519460",
            "heightRangeMeters": [HEIGHT_MIN_METERS, HEIGHT_MAX_METERS],
            "licenseGuidance": "NASA Images and Media Usage Guidelines",
            "modifications": [
                "decoded signed big-endian int16 topography in meters",
                "rotated 0..360 east longitude to -180..180 east for albedo alignment",
                "resampled height to 4096x2048 before metric spherical derivatives",
                "converged longitude at both poles before deriving normals",
                "generated seam-wrapped tangent normals without displacing the silhouette",
                "packed actual MOLA normal and 16-bit height into linear RGBA8 PNG",
            ],
            "output": normal_height.name,
            "outputDimensions": [OUTPUT_WIDTH, OUTPUT_HEIGHT],
            "outputSha256": sha256(normal_height),
            "sourceDataType": "SignedMSB2 meters",
            "sourceDimensions": [MOLA_WIDTH, MOLA_HEIGHT],
            "sourceSha256": MOLA_SHA256,
            "sourceUrl": MOLA_URL,
            "sourceXmlSha256": MOLA_XML_SHA256,
            "sourceXmlUrl": MOLA_XML_URL,
        },
        "numpyVersion": np.__version__,
        "pillowVersion": PILLOW_VERSION,
    }
    serialized = json.dumps(manifest, indent=2)
    for key in ("heightRangeMeters", "outputDimensions", "sourceDimensions"):
        serialized = re.sub(
            rf'("{key}": )\[\n\s+([^,\n]+),\n\s+([^\n]+)\n\s+\]',
            rf"\1[\2, \3]",
            serialized,
        )
    destination.write_text(serialized + "\n", encoding="utf-8")


def verify(output: Path) -> None:
    albedo = output / "mars-albedo.webp"
    normal_height = output / "mars-normal-height.png"
    manifest_path = output / "mars-texture-manifest.json"
    if not albedo.exists() or not normal_height.exists() or not manifest_path.exists():
        raise RuntimeError("Mars textures or manifest are missing; generate them first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["albedo"].get("sourceSha256") != ALBEDO_SHA256:
        raise RuntimeError("Mars manifest references an unexpected albedo source")
    if manifest["mola"].get("sourceSha256") != MOLA_SHA256:
        raise RuntimeError("Mars manifest references an unexpected MOLA source")
    if manifest["albedo"].get("outputSha256") != sha256(albedo):
        raise RuntimeError("Mars albedo does not match its manifest")
    if manifest["mola"].get("outputSha256") != sha256(normal_height):
        raise RuntimeError("Mars normal-height does not match its manifest")
    with Image.open(albedo) as image:
        if image.size != (OUTPUT_WIDTH, OUTPUT_HEIGHT) or image.mode != "RGB":
            raise RuntimeError("unexpected Mars albedo texture contract")
    with Image.open(normal_height) as image:
        if image.size != (OUTPUT_WIDTH, OUTPUT_HEIGHT) or image.mode != "RGBA":
            raise RuntimeError("unexpected Mars normal-height texture contract")
    print(f"verified {albedo.relative_to(ROOT)} ({sha256(albedo)})")
    print(f"verified {normal_height.relative_to(ROOT)} ({sha256(normal_height)})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-mars-textures",
    )
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.verify:
        verify(args.output)
        return

    args.output.mkdir(parents=True, exist_ok=True)
    albedo_source = args.cache / "Mars_Viking_ClrMosaic_global_925m.tif"
    mola_source = args.cache / "megt90n000eb.img"
    mola_xml = args.cache / "megt90n000eb.xml"
    download(ALBEDO_URL, ALBEDO_SHA256, albedo_source)
    download(MOLA_URL, MOLA_SHA256, mola_source)
    download(MOLA_XML_URL, MOLA_XML_SHA256, mola_xml)

    albedo = args.output / "mars-albedo.webp"
    normal_height = args.output / "mars-normal-height.png"
    manifest = args.output / "mars-texture-manifest.json"
    write_albedo(albedo_source, albedo)
    resized_minimum, resized_maximum = write_normal_height(mola_source, normal_height)
    write_manifest(albedo, normal_height, manifest)
    print(f"wrote {albedo.relative_to(ROOT)} ({sha256(albedo)})")
    print(f"wrote {normal_height.relative_to(ROOT)} ({sha256(normal_height)})")
    print(
        f"MOLA resized range {resized_minimum:.1f}..{resized_maximum:.1f} m; "
        f"packed range {HEIGHT_MIN_METERS:.1f}..{HEIGHT_MAX_METERS:.1f} m"
    )
    print(f"wrote {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
