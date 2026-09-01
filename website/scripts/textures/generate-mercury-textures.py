#!/usr/bin/env python3
"""Generate Strata's web Mercury textures from fixed USGS MESSENGER products.

Requires Python 3 with numpy, Pillow, and tifffile:
  python3 -m pip install numpy pillow tifffile

The color output is a restrained gray-brown display texture derived from the
USGS 1000/750/430 nm mosaic. It is not natural RGB or absolute albedo. Terrain
normal and packed height come only from the independent USGS MESSENGER DEM.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "mercury"

ALBEDO_URL = (
    "https://planetarymaps.usgs.gov/mosaic/"
    "Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif"
)
ALBEDO_SHA256 = "dfd0af2895bc91b028576359b2a0da6c86b5381619fd8e6d58d7d62876362032"
ALBEDO_SOURCE_WIDTH = 23_054
ALBEDO_SOURCE_HEIGHT = 11_527

DEM_URL = (
    "https://planetarymaps.usgs.gov/mosaic/"
    "Mercury_Messenger_USGS_DEM_Global_665m_v2.tif"
)
DEM_SHA256 = "defce776241dcaf44cb0f081ee508c17dbea28aa5a22880bf7a5e8c25f96cbea"
DEM_SOURCE_WIDTH = 23_040
DEM_SOURCE_HEIGHT = 11_520

OUTPUT_WIDTH = 2_048
OUTPUT_HEIGHT = 1_024
MERCURY_DATUM_RADIUS_METERS = 2_439_400.0
HEIGHT_MIN_METERS = -10_764.0
HEIGHT_MAX_METERS = 8_994.0
ALBEDO_POLAR_CONVERGENCE_ROWS = 72
ALBEDO_SEAM_BLEND_WIDTH = 32
HEIGHT_POLAR_CONVERGENCE_ROWS = 28


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


def inpaint_missing(image: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Fill only missing display color from immediate valid neighbors.

    Longitude wraps; latitude does not. Repeated propagation fills coverage
    gaps without adding crater-shaped or other authored morphology.
    """

    result = image.astype(np.float32, copy=True)
    filled = valid.copy()
    for _ in range(max(image.shape)):
        if bool(np.all(filled)):
            break
        total = np.zeros_like(result)
        count = np.zeros(filled.shape, dtype=np.float32)

        left_valid = np.roll(filled, 1, axis=1)
        right_valid = np.roll(filled, -1, axis=1)
        total += np.roll(result, 1, axis=1) * left_valid[..., None]
        total += np.roll(result, -1, axis=1) * right_valid[..., None]
        count += left_valid.astype(np.float32)
        count += right_valid.astype(np.float32)

        total[1:] += result[:-1] * filled[:-1, :, None]
        total[:-1] += result[1:] * filled[1:, :, None]
        count[1:] += filled[:-1]
        count[:-1] += filled[1:]

        can_fill = ~filled & (count > 0)
        if not bool(np.any(can_fill)):
            raise RuntimeError("unable to fill Mercury color no-data")
        result[can_fill] = total[can_fill] / count[can_fill][:, None]
        filled[can_fill] = True
    return result


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


def write_albedo(source: Path, destination: Path) -> tuple[int, int]:
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(source) as source_image:
        if source_image.size != (ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT):
            raise RuntimeError(
                f"unexpected Mercury color dimensions: {source_image.size} != "
                f"{(ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT)}"
            )
        reduced_color = source_image.convert("RGB").resize(
            (OUTPUT_WIDTH, OUTPUT_HEIGHT),
            Image.Resampling.LANCZOS,
            reducing_gap=3.0,
        )
    color = np.asarray(reduced_color, dtype=np.float32).copy()
    del reduced_color

    source_pixels = tifffile.memmap(source)
    if source_pixels.shape != (3, ALBEDO_SOURCE_HEIGHT, ALBEDO_SOURCE_WIDTH):
        raise RuntimeError(f"unexpected planar Mercury color shape: {source_pixels.shape}")
    valid_source = np.any(source_pixels != 0, axis=0)
    source_valid_count = int(np.count_nonzero(valid_source))
    mask_image = Image.fromarray(valid_source.astype(np.uint8) * 255, mode="L")
    del valid_source, source_pixels
    reduced_mask = mask_image.resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT),
        Image.Resampling.LANCZOS,
        reducing_gap=3.0,
    )
    coverage = np.asarray(reduced_mask, dtype=np.float32)
    del mask_image, reduced_mask

    reliable = coverage >= 32
    color[reliable] *= 255.0 / coverage[reliable, None]
    color = np.clip(color, 0.0, 255.0)
    color = inpaint_missing(color, reliable)

    # The source channels are independently stretched 1000/750/430 nm display
    # bands, not natural RGB. Preserve luminance and only a restrained fraction
    # of their relative chroma before a subtle warm-gray balance.
    luminance = np.sum(color * np.array([0.25, 0.55, 0.20]), axis=2, keepdims=True)
    color = luminance + (color - luminance) * 0.09
    color *= np.array([1.035, 1.0, 0.955])
    color = np.clip(color, 0.0, 255.0)
    converge_poles(color, ALBEDO_POLAR_CONVERGENCE_ROWS)
    encoded = np.rint(np.clip(color, 0.0, 255.0)).astype(np.uint8)
    repair_color_seam(encoded)
    Image.fromarray(encoded, mode="RGB").save(
        destination,
        "WEBP",
        quality=95,
        method=6,
        exact=True,
    )
    return source_valid_count, ALBEDO_SOURCE_WIDTH * ALBEDO_SOURCE_HEIGHT - source_valid_count


def source_dem_range(source: np.ndarray) -> tuple[float, float]:
    minimum = np.inf
    maximum = -np.inf
    for row in range(0, source.shape[0], 128):
        chunk = np.asarray(source[row : row + 128])
        minimum = min(minimum, float(np.min(chunk)))
        maximum = max(maximum, float(np.max(chunk)))
    return minimum, maximum


def write_normal_height(source: Path, destination: Path) -> tuple[float, float]:
    source_height = tifffile.memmap(source)
    if source_height.shape != (DEM_SOURCE_HEIGHT, DEM_SOURCE_WIDTH):
        raise RuntimeError(f"unexpected Mercury DEM shape: {source_height.shape}")
    if source_height.dtype != np.dtype("int16"):
        raise RuntimeError(f"unexpected Mercury DEM type: {source_height.dtype}")
    observed_range = source_dem_range(source_height)
    if observed_range != (HEIGHT_MIN_METERS, HEIGHT_MAX_METERS):
        raise RuntimeError(
            f"unexpected Mercury DEM range: {observed_range} != "
            f"{(HEIGHT_MIN_METERS, HEIGHT_MAX_METERS)}"
        )

    # The source dimensions are divisible by four. Area-reduce first to avoid
    # allocating a full 1 GiB float image, then apply the final Lanczos resize.
    quarter = np.empty((DEM_SOURCE_HEIGHT // 4, DEM_SOURCE_WIDTH // 4), dtype=np.float32)
    for output_row in range(quarter.shape[0]):
        block = np.asarray(
            source_height[output_row * 4 : output_row * 4 + 4],
            dtype=np.float32,
        ).reshape(4, quarter.shape[1], 4)
        quarter[output_row] = block.mean(axis=(0, 2))
    del source_height

    height_image = Image.fromarray(quarter, mode="F").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    del quarter
    height = np.asarray(height_image, dtype=np.float32).copy()
    del height_image
    height = np.clip(height, HEIGHT_MIN_METERS, HEIGHT_MAX_METERS)

    # DEM is 0..360°E; the color source and shader are -180..180°E.
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
    east_slope /= 2 * MERCURY_DATUM_RADIUS_METERS * stable_cosine * longitude_step

    north_slope = np.empty_like(height)
    north_slope[1:-1] = height[:-2] - height[2:]
    north_slope[0] = height[0] - height[1]
    north_slope[-1] = height[-2] - height[-1]
    north_slope /= 2 * MERCURY_DATUM_RADIUS_METERS * latitude_step

    pole_stability = np.clip(cosine_latitude / 0.08, 0.0, 1.0)[:, None]
    east_slope *= pole_stability

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


def png_chunks(path: Path) -> list[str]:
    chunks: list[str] = []
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"not a PNG: {path}")
        while True:
            length_bytes = handle.read(4)
            if not length_bytes:
                break
            length = struct.unpack(">I", length_bytes)[0]
            chunk = handle.read(4).decode("ascii")
            chunks.append(chunk)
            handle.seek(length + 4, 1)
            if chunk == "IEND":
                break
    return chunks


def assert_linear_png(path: Path) -> None:
    forbidden = {"cHRM", "gAMA", "iCCP", "sRGB"}
    present = forbidden.intersection(png_chunks(path))
    if present:
        raise RuntimeError(f"packed Mercury data PNG has color metadata: {sorted(present)}")


def write_manifest(
    albedo: Path,
    normal_height: Path,
    source_valid_count: int,
    source_missing_count: int,
    destination: Path,
) -> None:
    manifest = {
        "albedo": {
            "asset": "Mercury MESSENGER MDIS Global Color Mosaic 665m v3",
            "bandsMappedToDisplayRgbNanometers": [1000, 750, 430],
            "colorStatus": (
                "restrained gray-brown display color derived from independently stretched "
                "multispectral bands; not human-eye natural RGB or absolute albedo"
            ),
            "credit": "MESSENGER Team / Arizona State University / USGS",
            "license": "Public domain; please cite authors",
            "modifications": [
                "downsampled color and validity separately to prevent black no-data contamination",
                "filled remaining no-data only by iterative neighboring display-color propagation",
                "compressed multispectral display chroma into a subtle gray-brown appearance",
                "progressively converged longitudinal identity at both equirectangular poles",
                "repaired only the periodic longitude color seam over 32 output pixels",
                "did not derive height, normal, roughness, craters, or rays from color",
            ],
            "output": albedo.name,
            "outputDimensions": [OUTPUT_WIDTH, OUTPUT_HEIGHT],
            "outputSha256": sha256(albedo),
            "sourceDimensions": [ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT],
            "sourceNoDataPixels": source_missing_count,
            "sourceSha256": ALBEDO_SHA256,
            "sourceUrl": ALBEDO_URL,
            "sourceValidPixels": source_valid_count,
        },
        "dem": {
            "asset": "Mercury MESSENGER Global DEM 665m v2",
            "channelContract": {
                "rg": "east/north/up tangent-space normal, octahedral encoded",
                "ba": "unsigned 16-bit normalized height, high byte then low byte",
            },
            "credit": (
                "USGS Astrogeology Science Center / MESSENGER Team / NASA / ASU / "
                "Johns Hopkins APL / Carnegie Institution for Science"
            ),
            "datumRadiusMeters": MERCURY_DATUM_RADIUS_METERS,
            "derivation": (
                "MDIS NAC/WAC-G image tie-point control network; nearest 11 points, "
                "median-centered 1-sigma filter, median radius, and smoothing"
            ),
            "heightRangeMeters": [HEIGHT_MIN_METERS, HEIGHT_MAX_METERS],
            "license": "No access constraints; please cite authors",
            "modifications": [
                "area-reduced the source before Lanczos resampling to 2048x1024",
                "rotated 0..360 degrees east to -180..180 degrees east for color alignment",
                "converged longitude at both poles before metric spherical derivatives",
                "derived seam-wrapped tangent normals without displacing the silhouette",
                "packed actual DEM normal and unsigned 16-bit height into linear RGBA8 PNG",
                "wrote no PNG gamma, chromaticity, sRGB, or ICC color-transform chunks",
            ],
            "output": normal_height.name,
            "outputDimensions": [OUTPUT_WIDTH, OUTPUT_HEIGHT],
            "outputSha256": sha256(normal_height),
            "pngChunks": png_chunks(normal_height),
            "sourceDataType": "signed int16 meters relative to datum",
            "sourceDimensions": [DEM_SOURCE_WIDTH, DEM_SOURCE_HEIGHT],
            "sourceSha256": DEM_SHA256,
            "sourceUrl": DEM_URL,
        },
        "numpyVersion": np.__version__,
        "pillowVersion": PILLOW_VERSION,
        "tifffileVersion": tifffile.__version__,
    }
    serialized = json.dumps(manifest, indent=2)
    for key in (
        "bandsMappedToDisplayRgbNanometers",
        "heightRangeMeters",
        "outputDimensions",
        "sourceDimensions",
    ):
        serialized = re.sub(
            rf'("{key}": )\[\n\s+([^,\n]+),\n\s+([^,\n]+)(?:,\n\s+([^\n]+))?\n\s+\]',
            lambda match: (
                f'{match.group(1)}[{match.group(2)}, {match.group(3)}'
                + (f", {match.group(4)}" if match.group(4) else "")
                + "]"
            ),
            serialized,
        )
    destination.write_text(serialized + "\n", encoding="utf-8")


def verify(output: Path) -> None:
    albedo = output / "mercury-albedo.webp"
    normal_height = output / "mercury-normal-height.png"
    manifest_path = output / "mercury-texture-manifest.json"
    if not albedo.exists() or not normal_height.exists() or not manifest_path.exists():
        raise RuntimeError("Mercury textures or manifest are missing; generate them first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["albedo"].get("sourceSha256") != ALBEDO_SHA256:
        raise RuntimeError("Mercury manifest references an unexpected color source")
    if manifest["dem"].get("sourceSha256") != DEM_SHA256:
        raise RuntimeError("Mercury manifest references an unexpected DEM source")
    if manifest["albedo"].get("outputSha256") != sha256(albedo):
        raise RuntimeError("Mercury albedo does not match its manifest")
    if manifest["dem"].get("outputSha256") != sha256(normal_height):
        raise RuntimeError("Mercury normal-height does not match its manifest")
    with Image.open(albedo) as image:
        if image.size != (OUTPUT_WIDTH, OUTPUT_HEIGHT) or image.mode != "RGB":
            raise RuntimeError("unexpected Mercury albedo texture contract")
    with Image.open(normal_height) as image:
        if image.size != (OUTPUT_WIDTH, OUTPUT_HEIGHT) or image.mode != "RGBA":
            raise RuntimeError("unexpected Mercury normal-height texture contract")
    assert_linear_png(normal_height)
    print(f"verified {albedo.relative_to(ROOT)} ({sha256(albedo)})")
    print(f"verified {normal_height.relative_to(ROOT)} ({sha256(normal_height)})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-mercury-textures",
    )
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.verify:
        verify(args.output)
        return

    args.output.mkdir(parents=True, exist_ok=True)
    albedo_source = args.cache / "Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif"
    dem_source = args.cache / "Mercury_Messenger_USGS_DEM_Global_665m_v2.tif"
    download(ALBEDO_URL, ALBEDO_SHA256, albedo_source)
    download(DEM_URL, DEM_SHA256, dem_source)

    albedo = args.output / "mercury-albedo.webp"
    normal_height = args.output / "mercury-normal-height.png"
    manifest = args.output / "mercury-texture-manifest.json"
    source_valid_count, source_missing_count = write_albedo(albedo_source, albedo)
    resized_minimum, resized_maximum = write_normal_height(dem_source, normal_height)
    assert_linear_png(normal_height)
    write_manifest(albedo, normal_height, source_valid_count, source_missing_count, manifest)
    print(f"wrote {albedo.relative_to(ROOT)} ({sha256(albedo)})")
    print(f"wrote {normal_height.relative_to(ROOT)} ({sha256(normal_height)})")
    print(
        f"Mercury DEM resized range {resized_minimum:.1f}..{resized_maximum:.1f} m; "
        f"packed range {HEIGHT_MIN_METERS:.1f}..{HEIGHT_MAX_METERS:.1f} m"
    )
    print(f"wrote {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
