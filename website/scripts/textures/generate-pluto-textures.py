#!/usr/bin/env python3
"""Generate Strata's Pluto textures from fixed New Horizons products.

Requires Python 3 with numpy, Pillow, and tifffile. The display-color source is
the NASA/JHUAPL/SwRI PIA11707 MVIC map. Relief comes only from the independent
USGS New Horizons DEM; unknown DEM samples remain datum/up with zero confidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image, ImageFilter, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "pluto"

ALBEDO_URL = "https://d2pn8kiwq2w21t.cloudfront.net/original_images/jpegPIA11707.jpg"
ALBEDO_SHA256 = "e36f3daa1b3b0e911418ff830ddccf8b63e10a082c6ccc96eb7d8170991962d6"
ALBEDO_SOURCE_WIDTH = 5_926
ALBEDO_SOURCE_HEIGHT = 2_963
ALBEDO_VALID_PIXELS = 12_231_509

DEM_URL = (
    "https://planetarymaps.usgs.gov/mosaic/"
    "Pluto_NewHorizons_Global_DEM_300m_Jul2017_16bit.tif"
)
DEM_SHA256 = "259b3e962540285f9833b13b4ad28c6b38aadb68300a52d733990b4b8870a640"
DEM_SOURCE_WIDTH = 24_888
DEM_SOURCE_HEIGHT = 12_444
DEM_VALID_PIXELS = 143_839_310
DEM_NO_DATA = -32_768

OUTPUT_WIDTH = 2_048
OUTPUT_HEIGHT = 1_024
PLUTO_DATUM_RADIUS_METERS = 1_188_300.0
HEIGHT_MIN_METERS = -4_101.0
HEIGHT_MAX_METERS = 6_491.0
DEM_AREA_REDUCTION = 6
CONFIDENCE_FEATHER_PIXELS = 9
ALBEDO_POLE_CONVERGENCE_ROWS = 72
ALBEDO_SEAM_BLEND_WIDTH = 32


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
        image[:, index] = left * (1 - weight) + average * weight
        image[:, -1 - index] = right * (1 - weight) + average * weight


def complete_unobserved_color(color: np.ndarray, observed: np.ndarray) -> np.ndarray:
    """Low-frequency visual completion for RGB only, without authored terrain."""

    observed_pixels = color[observed]
    if observed_pixels.size == 0:
        raise RuntimeError("Pluto color map contains no observed output pixels")
    neutral = np.mean(observed_pixels, axis=0) * np.array([0.90, 0.88, 0.89])
    low_size = (256, 128)
    mask_image = Image.fromarray(observed.astype(np.float32), mode="F").resize(
        low_size, Image.Resampling.BOX
    )
    low_mask = np.clip(np.asarray(mask_image, dtype=np.float32), 0.0, 1.0).copy()
    low_color = np.empty((low_size[1], low_size[0], 3), dtype=np.float32)
    for channel in range(3):
        premultiplied = color[..., channel] * observed
        reduced = Image.fromarray(premultiplied.astype(np.float32), mode="F").resize(
            low_size, Image.Resampling.BOX
        )
        low_color[..., channel] = np.asarray(reduced, dtype=np.float32)
    reliable = low_mask >= 0.08
    low_color[reliable] /= low_mask[reliable, None]
    low_color[~reliable] = neutral
    np.clip(low_color, 0.0, 255.0, out=low_color)
    filled = reliable.copy()

    for _ in range(max(low_size)):
        if bool(np.all(filled)):
            break
        total = np.roll(low_color, 1, axis=1) * np.roll(filled, 1, axis=1)[..., None]
        total += np.roll(low_color, -1, axis=1) * np.roll(filled, -1, axis=1)[..., None]
        count = np.roll(filled, 1, axis=1).astype(np.float32)
        count += np.roll(filled, -1, axis=1).astype(np.float32)
        total[1:] += low_color[:-1] * filled[:-1, :, None]
        total[:-1] += low_color[1:] * filled[1:, :, None]
        count[1:] += filled[:-1]
        count[:-1] += filled[1:]
        can_fill = ~filled & (count > 0)
        low_color[can_fill] = total[can_fill] / count[can_fill, None]
        filled[can_fill] = True

    original = low_color.copy()
    anchor = np.clip((low_mask - 0.08) / 0.72, 0.0, 1.0)
    anchor = anchor * anchor * (3 - 2 * anchor)
    for _ in range(192):
        average = np.roll(low_color, 1, axis=1) + np.roll(low_color, -1, axis=1)
        vertical = np.empty_like(low_color)
        vertical[1:-1] = low_color[:-2] + low_color[2:]
        vertical[0] = low_color[0] + low_color[1]
        vertical[-1] = low_color[-2] + low_color[-1]
        average = (average + vertical) * 0.25
        low_color = average * (1 - anchor[..., None]) + original * anchor[..., None]

    south_mix = np.clip(
        (np.arange(low_size[1], dtype=np.float32) - low_size[1] * 0.58)
        / (low_size[1] * 0.28),
        0.0,
        1.0,
    )
    south_mix = south_mix * south_mix * (3 - 2 * south_mix)
    low_color = low_color * (1 - south_mix[:, None, None]) + neutral * south_mix[
        :, None, None
    ]
    np.clip(low_color, 0.0, 255.0, out=low_color)

    low_encoded = np.rint(low_color).astype(np.uint8)
    enlarged = Image.fromarray(low_encoded, mode="RGB").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.Resampling.BICUBIC
    )
    return np.asarray(enlarged, dtype=np.float32).copy()


def erode_periodic(mask: np.ndarray) -> np.ndarray:
    eroded = mask & np.roll(mask, 1, axis=1) & np.roll(mask, -1, axis=1)
    vertical = np.zeros_like(mask)
    vertical[1:-1] = mask[:-2] & mask[2:]
    return eroded & vertical


def build_relief_confidence(coverage: np.ndarray) -> np.ndarray:
    current = coverage >= 0.995
    distance = np.zeros(current.shape, dtype=np.uint8)
    for _ in range(CONFIDENCE_FEATHER_PIXELS + 1):
        distance[current] += 1
        current = erode_periodic(current)
    return np.clip(
        (distance.astype(np.float32) - 1) / CONFIDENCE_FEATHER_PIXELS,
        0.0,
        1.0,
    )


def reduce_dem(
    source: Path,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, float | int]]:
    source_height = tifffile.memmap(source)
    expected_shape = (DEM_SOURCE_HEIGHT, DEM_SOURCE_WIDTH)
    if source_height.shape != expected_shape or source_height.dtype != np.dtype("int16"):
        raise RuntimeError(
            f"unexpected Pluto DEM contract: {source_height.shape}/{source_height.dtype}"
        )

    intermediate_height = DEM_SOURCE_HEIGHT // DEM_AREA_REDUCTION
    intermediate_width = DEM_SOURCE_WIDTH // DEM_AREA_REDUCTION
    numerator = np.empty((intermediate_height, intermediate_width), dtype=np.float32)
    coverage = np.empty_like(numerator)
    valid_count = 0
    valid_sum = 0.0
    minimum = np.inf
    maximum = -np.inf
    chunk_rows = 24

    for output_start in range(0, intermediate_height, chunk_rows):
        output_end = min(output_start + chunk_rows, intermediate_height)
        source_chunk = np.asarray(
            source_height[
                output_start * DEM_AREA_REDUCTION : output_end * DEM_AREA_REDUCTION
            ]
        )
        reshaped = source_chunk.reshape(
            output_end - output_start,
            DEM_AREA_REDUCTION,
            intermediate_width,
            DEM_AREA_REDUCTION,
        )
        valid = reshaped != DEM_NO_DATA
        safe = np.where(valid, reshaped, 0).astype(np.float32)
        counts = valid.sum(axis=(1, 3), dtype=np.uint16)
        numerator[output_start:output_end] = safe.sum(axis=(1, 3)) / (
            DEM_AREA_REDUCTION * DEM_AREA_REDUCTION
        )
        coverage[output_start:output_end] = counts / (
            DEM_AREA_REDUCTION * DEM_AREA_REDUCTION
        )
        valid_values = source_chunk[source_chunk != DEM_NO_DATA]
        if valid_values.size:
            valid_count += int(valid_values.size)
            valid_sum += float(valid_values.sum(dtype=np.float64))
            minimum = min(minimum, float(valid_values.min()))
            maximum = max(maximum, float(valid_values.max()))

    del source_height
    if valid_count != DEM_VALID_PIXELS:
        raise RuntimeError(f"unexpected Pluto DEM valid count: {valid_count}")
    if (minimum, maximum) != (HEIGHT_MIN_METERS, HEIGHT_MAX_METERS):
        raise RuntimeError(f"unexpected Pluto DEM range: {(minimum, maximum)}")

    numerator_image = Image.fromarray(numerator, mode="F").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.Resampling.LANCZOS
    )
    coverage_image = Image.fromarray(coverage, mode="F").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.Resampling.LANCZOS
    )
    del numerator, coverage
    output_numerator = np.asarray(numerator_image, dtype=np.float32).copy()
    output_coverage = np.clip(
        np.asarray(coverage_image, dtype=np.float32), 0.0, 1.0
    ).copy()
    del numerator_image, coverage_image

    height = np.zeros_like(output_numerator)
    observed = output_coverage >= 0.995
    height[observed] = output_numerator[observed] / output_coverage[observed]
    height = np.clip(height, HEIGHT_MIN_METERS, HEIGHT_MAX_METERS)
    confidence = build_relief_confidence(output_coverage)
    statistics: dict[str, float | int] = {
        "sourceMaximumMeters": maximum,
        "sourceMeanMeters": valid_sum / valid_count,
        "sourceMinimumMeters": minimum,
        "sourceNoDataPixels": DEM_SOURCE_WIDTH * DEM_SOURCE_HEIGHT - valid_count,
        "sourceValidPixels": valid_count,
    }
    return height, confidence, observed, statistics


def write_normal_height(
    measured_height: np.ndarray,
    confidence: np.ndarray,
    measured: np.ndarray,
    destination: Path,
) -> dict[str, float | int]:
    latitude = np.pi / 2 - (
        np.arange(OUTPUT_HEIGHT, dtype=np.float32) + 0.5
    ) * (np.pi / OUTPUT_HEIGHT)
    cosine_latitude = np.cos(latitude)
    stable_cosine = np.maximum(cosine_latitude, 0.05)[:, None]
    longitude_step = 2 * np.pi / OUTPUT_WIDTH
    latitude_step = np.pi / OUTPUT_HEIGHT

    derivative_supported = measured & np.roll(measured, 1, axis=1) & np.roll(measured, -1, axis=1)
    vertical_supported = np.zeros_like(measured)
    vertical_supported[1:-1] = measured[:-2] & measured[2:]
    derivative_supported &= vertical_supported
    normal_supported = derivative_supported & (confidence > 0)

    east_slope = np.roll(measured_height, -1, axis=1) - np.roll(measured_height, 1, axis=1)
    east_slope /= 2 * PLUTO_DATUM_RADIUS_METERS * stable_cosine * longitude_step
    north_slope = np.empty_like(measured_height)
    north_slope[1:-1] = measured_height[:-2] - measured_height[2:]
    north_slope[0] = 0
    north_slope[-1] = 0
    north_slope /= 2 * PLUTO_DATUM_RADIUS_METERS * latitude_step
    east_slope *= np.clip(cosine_latitude / 0.08, 0.0, 1.0)[:, None]

    denominator = np.abs(east_slope) + np.abs(north_slope) + 1.0
    octahedral_x = -east_slope / denominator
    octahedral_y = -north_slope / denominator
    encoded = np.empty((OUTPUT_HEIGHT, OUTPUT_WIDTH, 4), dtype=np.uint8)
    encoded[..., 0] = np.rint(
        np.clip(octahedral_x * 0.5 + 0.5, 0.0, 1.0) * 255
    ).astype(np.uint8)
    encoded[..., 1] = np.rint(
        np.clip(octahedral_y * 0.5 + 0.5, 0.0, 1.0) * 255
    ).astype(np.uint8)
    encoded[~normal_supported, :2] = 128

    packed_height = np.where(confidence > 0, measured_height, 0.0)
    normalized_height = np.clip(
        (packed_height - HEIGHT_MIN_METERS) / (HEIGHT_MAX_METERS - HEIGHT_MIN_METERS),
        0.0,
        1.0,
    )
    encoded_height = np.rint(normalized_height * 65_535).astype(np.uint16)
    encoded[..., 2] = (encoded_height >> 8).astype(np.uint8)
    encoded[..., 3] = (encoded_height & 255).astype(np.uint8)
    Image.fromarray(encoded, mode="RGBA").save(destination, "PNG", optimize=True)
    return {
        "confidenceZeroPixels": int(np.count_nonzero(confidence <= 0)),
        "confidenceFullPixels": int(np.count_nonzero(confidence >= 1)),
        "resampledMaximumMeters": float(np.max(packed_height[confidence > 0])),
        "resampledMinimumMeters": float(np.min(packed_height[confidence > 0])),
        "unsupportedPositiveConfidencePixels": int(
            np.count_nonzero((confidence > 0) & ~normal_supported)
        ),
    }


def write_albedo(
    source: Path, confidence: np.ndarray, destination: Path
) -> dict[str, int | list[float]]:
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(source) as source_image:
        if source_image.size != (ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT):
            raise RuntimeError(f"unexpected Pluto color dimensions: {source_image.size}")
        source_rgb = np.asarray(source_image.convert("RGB"), dtype=np.uint8).copy()

    luminance = np.sum(
        source_rgb.astype(np.float32) * np.array([0.2126, 0.7152, 0.0722]), axis=2
    )
    valid = luminance > 8
    valid_count = int(np.count_nonzero(valid))
    if valid_count != ALBEDO_VALID_PIXELS:
        raise RuntimeError(f"unexpected Pluto color valid count: {valid_count}")
    source_rgb[~valid] = 0
    color_image = Image.fromarray(source_rgb, mode="RGB").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.Resampling.LANCZOS, reducing_gap=3.0
    )
    mask_image = Image.fromarray(valid.astype(np.uint8) * 255, mode="L").resize(
        (OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.Resampling.LANCZOS, reducing_gap=3.0
    )
    del source_rgb, valid, luminance

    color = np.asarray(color_image, dtype=np.float32).copy()
    coverage = np.asarray(mask_image, dtype=np.float32).copy()
    del color_image, mask_image
    usable = coverage >= 16
    corrected = np.zeros_like(color)
    corrected[usable] = color[usable] * 255.0 / coverage[usable, None]
    corrected = np.clip(corrected, 0.0, 255.0)
    corrected_luminance = np.sum(
        corrected * np.array([0.2126, 0.7152, 0.0722]), axis=2
    )
    observed = (coverage >= 192) & (corrected_luminance > 12)
    for _ in range(3):
        observed = erode_periodic(observed)
    completion = complete_unobserved_color(corrected, observed)
    blend_image = Image.fromarray(observed.astype(np.uint8) * 255, mode="L").filter(
        ImageFilter.GaussianBlur(radius=7)
    )
    blend = np.asarray(blend_image, dtype=np.float32) / 255.0
    blend *= observed
    color = completion * (1 - blend[..., None]) + corrected * blend[..., None]
    converge_poles(color, ALBEDO_POLE_CONVERGENCE_ROWS)
    repair_color_seam(color)

    encoded = np.empty((OUTPUT_HEIGHT, OUTPUT_WIDTH, 4), dtype=np.uint8)
    encoded[..., :3] = np.rint(np.clip(color, 0.0, 255.0)).astype(np.uint8)
    encoded[..., 3] = (
        np.rint(np.clip(confidence, 0.0, 1.0) * 254).astype(np.uint8) + 1
    )
    Image.fromarray(encoded, mode="RGBA").save(destination, "PNG", optimize=True)
    with Image.open(destination) as roundtrip_image:
        roundtrip = np.asarray(roundtrip_image.convert("RGBA"), dtype=np.uint8)
    if not bool(np.array_equal(roundtrip, encoded)):
        raise RuntimeError("Pluto albedo PNG did not preserve hidden RGB/data-alpha bytes")
    return {
        "sourceNoDataPixels": ALBEDO_SOURCE_WIDTH * ALBEDO_SOURCE_HEIGHT - valid_count,
        "sourceValidPixels": valid_count,
        "validRgbMean": np.mean(color[observed], axis=0).round(4).tolist(),
    }


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
        raise RuntimeError(f"packed Pluto data PNG has color metadata: {sorted(present)}")


def write_manifest(
    albedo: Path,
    normal_height: Path,
    color_statistics: dict[str, int | list[float]],
    dem_statistics: dict[str, float | int],
    output_statistics: dict[str, float | int],
    destination: Path,
) -> None:
    manifest = {
        "albedo": {
            "asset": "PIA11707 Pluto Global Color Map",
            "colorStatus": "approximate display color derived from Ralph/MVIC; not calibrated bolometric albedo",
            "credit": "NASA/JHUAPL/SwRI",
            "license": "NASA media; acknowledge source and do not imply endorsement",
            "modifications": [
                "registered without axis flip or longitude roll to the USGS positive-east 0..360-degree browse grid",
                "downsampled display color and validity separately to prevent black no-data contamination",
                "completed only unobserved RGB with progressively low-frequency warm neutral color",
                "did not synthesize named morphology, craters, height, normal, or roughness from color",
                "converged longitude at both equirectangular poles and repaired the periodic color seam",
                "stored independent DEM relief confidence in alpha using byte=round(confidence*254)+1",
                "reserved alpha byte zero so lossless PNG preserves RGB at decoded zero confidence",
            ],
            "output": albedo.name,
            "outputDimensions": [OUTPUT_WIDTH, OUTPUT_HEIGHT],
            "outputSha256": sha256(albedo),
            "sourceDimensions": [ALBEDO_SOURCE_WIDTH, ALBEDO_SOURCE_HEIGHT],
            "sourceSha256": ALBEDO_SHA256,
            "sourceUrl": ALBEDO_URL,
            **color_statistics,
        },
        "dem": {
            "asset": "Pluto New Horizons LORRI-MVIC Global DEM 300m",
            "channelContract": {
                "rg": "east/north/up tangent-space normal, octahedral encoded; shader forces exact up at zero confidence",
                "ba": "unsigned 16-bit normalized height, high byte then low byte",
                "albedoAlpha": "transport byte round(confidence*254)+1; shader decodes clamp((byte-1)/254,0,1), yielding zero outside an inward-feathered reliable DEM interior",
            },
            "credit": "New Horizons Team / NASA / JHUAPL / SwRI / LPI / USGS Astrogeology Science Center",
            "datumRadiusMeters": PLUTO_DATUM_RADIUS_METERS,
            "heightRangeMeters": [HEIGHT_MIN_METERS, HEIGHT_MAX_METERS],
            "license": "No access constraints; please cite authors",
            "modifications": [
                "validity-weighted area-reduced the signed-int16 DEM before Lanczos resampling",
                "preserved the source positive-east 0..360-degree longitude with no flip or roll",
                "kept unknown height at datum, unknown normal at tangent up, and confidence at zero",
                "feathered confidence only inward from reliable DEM coverage",
                "derived metric spherical slopes only where a reliable neighborhood exists",
                "packed normal and height into a lossless linear RGBA8 PNG without color metadata",
            ],
            "output": normal_height.name,
            "outputDimensions": [OUTPUT_WIDTH, OUTPUT_HEIGHT],
            "outputSha256": sha256(normal_height),
            "pngChunks": png_chunks(normal_height),
            "sourceDataType": "signed int16 meters relative to datum; -32768 is no-data",
            "sourceDimensions": [DEM_SOURCE_WIDTH, DEM_SOURCE_HEIGHT],
            "sourceSha256": DEM_SHA256,
            "sourceUrl": DEM_URL,
            **dem_statistics,
            **output_statistics,
        },
        "georeference": {
            "latitude": "row 0 is north; latitude=90-((y+0.5)/height)*180 degrees",
            "longitude": "positive east 0..360 degrees; boundary u=0 is the seam and u=0.5 is 180 degrees east",
            "runtimeLongitudeOffset": False,
            "webglUpload": {
                "UNPACK_COLORSPACE_CONVERSION_WEBGL": "NONE",
                "UNPACK_FLIP_Y_WEBGL": True,
                "UNPACK_PREMULTIPLY_ALPHA_WEBGL": False,
            },
        },
        "numpyVersion": np.__version__,
        "pillowVersion": PILLOW_VERSION,
        "tifffileVersion": tifffile.__version__,
    }
    destination.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def verify(output: Path) -> None:
    albedo = output / "pluto-albedo.png"
    normal_height = output / "pluto-normal-height.png"
    manifest_path = output / "pluto-texture-manifest.json"
    if not albedo.exists() or not normal_height.exists() or not manifest_path.exists():
        raise RuntimeError("Pluto textures or manifest are missing; generate them first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["albedo"].get("outputSha256") != sha256(albedo):
        raise RuntimeError("Pluto albedo does not match its manifest")
    if manifest["dem"].get("outputSha256") != sha256(normal_height):
        raise RuntimeError("Pluto normal-height does not match its manifest")
    if manifest["dem"].get("unsupportedPositiveConfidencePixels") != 0:
        raise RuntimeError("Pluto relief confidence reaches a normal without measured neighbors")
    with Image.open(albedo) as image:
        if image.size != (OUTPUT_WIDTH, OUTPUT_HEIGHT) or image.mode != "RGBA":
            raise RuntimeError("unexpected Pluto albedo texture contract")
        albedo_pixels = np.asarray(image, dtype=np.int16)
    with Image.open(normal_height) as image:
        if image.size != (OUTPUT_WIDTH, OUTPUT_HEIGHT) or image.mode != "RGBA":
            raise RuntimeError("unexpected Pluto normal-height texture contract")
        packed = np.asarray(image, dtype=np.uint16)
    assert_linear_png(normal_height)
    zero_confidence = albedo_pixels[..., 3] == 1
    datum_code = int(round((0 - HEIGHT_MIN_METERS) / (HEIGHT_MAX_METERS - HEIGHT_MIN_METERS) * 65_535))
    packed_height = packed[..., 2] * 256 + packed[..., 3]
    if not bool(np.all(packed_height[zero_confidence] == datum_code)):
        raise RuntimeError("unknown Pluto terrain does not decode to exact datum")
    if not bool(np.all(packed[zero_confidence, :2] == 128)):
        raise RuntimeError("unsupported Pluto boundary terrain does not carry the up-normal sentinel")
    seam_difference = np.abs(
        albedo_pixels[:, 0, :3] - albedo_pixels[:, -1, :3]
    )
    interior_difference = np.abs(
        albedo_pixels[:, 1:, :3] - albedo_pixels[:, :-1, :3]
    )
    if float(np.percentile(seam_difference, 95)) > float(
        np.percentile(interior_difference, 95)
    ):
        raise RuntimeError("Pluto albedo longitude seam exceeds interior p95")
    print(f"verified {albedo.relative_to(ROOT)} ({sha256(albedo)})")
    print(f"verified {normal_height.relative_to(ROOT)} ({sha256(normal_height)})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-pluto-textures",
    )
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify(args.output)
        return

    args.output.mkdir(parents=True, exist_ok=True)
    albedo_source = args.cache / "PIA11707.jpg"
    dem_source = args.cache / "Pluto_DEM_300m_16bit.tif"
    download(ALBEDO_URL, ALBEDO_SHA256, albedo_source)
    download(DEM_URL, DEM_SHA256, dem_source)

    albedo = args.output / "pluto-albedo.png"
    normal_height = args.output / "pluto-normal-height.png"
    manifest = args.output / "pluto-texture-manifest.json"
    (args.output / "pluto-albedo.webp").unlink(missing_ok=True)
    measured_height, confidence, measured, dem_statistics = reduce_dem(dem_source)
    output_statistics = write_normal_height(
        measured_height,
        confidence,
        measured,
        normal_height,
    )
    color_statistics = write_albedo(albedo_source, confidence, albedo)
    assert_linear_png(normal_height)
    write_manifest(
        albedo,
        normal_height,
        color_statistics,
        dem_statistics,
        output_statistics,
        manifest,
    )
    verify(args.output)
    print(f"wrote {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
