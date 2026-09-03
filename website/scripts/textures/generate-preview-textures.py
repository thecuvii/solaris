#!/usr/bin/env python3
"""Generate smaller showcase textures from the existing v1 maps.

Requires Python 3 with numpy and Pillow:
  python3 -m pip install numpy pillow

Color maps are Lanczos-resized. Packed height maps are decoded to metric
elevation, resized as floats, then packed again with newly derived spherical
normals so 16-bit height bytes are never bilinear-filtered as RGBA.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
TEXTURES = ROOT / "public" / "textures" / "v1"

PREVIEW_2048 = (2_048, 1_024)
PREVIEW_1024 = (1_024, 512)
WRAP_PAD = 32

MARS_MEAN_RADIUS_METERS = 3_389_500.0
MARS_HEIGHT_MIN_METERS = -8_177.0
MARS_HEIGHT_MAX_METERS = 21_171.0

MOON_RADIUS_KM = 1_737.4
MOON_HEIGHT_MIN_KM = -10.0
MOON_HEIGHT_MAX_KM = 12.0

MERCURY_DATUM_RADIUS_METERS = 2_439_400.0
MERCURY_HEIGHT_MIN_METERS = -10_764.0
MERCURY_HEIGHT_MAX_METERS = 8_994.0

PLUTO_DATUM_RADIUS_METERS = 1_188_300.0
PLUTO_HEIGHT_MIN_METERS = -4_101.0
PLUTO_HEIGHT_MAX_METERS = 6_491.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resize_periodic(array: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    height, width = array.shape[:2]
    padded = np.concatenate([array[:, -WRAP_PAD:], array, array[:, :WRAP_PAD]], axis=1)
    mode = "F" if array.ndim == 2 else "RGB" if array.shape[2] == 3 else "RGBA"
    image = Image.fromarray(padded, mode=mode)
    scaled_width = int(round(padded.shape[1] * (size[0] / width)))
    resized = np.asarray(image.resize((scaled_width, size[1]), Image.Resampling.LANCZOS))
    pad = int(round(WRAP_PAD * (size[0] / width)))
    return np.ascontiguousarray(resized[:, pad : pad + size[0]])


def sphere_slopes(height: np.ndarray, radius: float) -> tuple[np.ndarray, np.ndarray]:
    output_height, output_width = height.shape
    latitude = (
        np.pi / 2
        - (np.arange(output_height, dtype=np.float32) + 0.5) * (np.pi / output_height)
    )
    cosine_latitude = np.cos(latitude)
    stable_cosine = np.maximum(cosine_latitude, 0.05)[:, None]
    longitude_step = 2 * np.pi / output_width
    latitude_step = np.pi / output_height

    east_slope = np.roll(height, -1, axis=1)
    east_slope -= np.roll(height, 1, axis=1)
    east_slope /= 2 * radius * stable_cosine * longitude_step

    north_slope = np.empty_like(height)
    north_slope[1:-1] = height[:-2] - height[2:]
    north_slope[0] = height[0] - height[1]
    north_slope[-1] = height[-2] - height[-1]
    north_slope /= 2 * radius * latitude_step
    east_slope *= np.clip(cosine_latitude / 0.08, 0.0, 1.0)[:, None]
    return east_slope, north_slope


def decode_uint16_height(packed: np.ndarray, minimum: float, maximum: float) -> np.ndarray:
    encoded = (packed[..., 2].astype(np.uint16) << 8) | packed[..., 3].astype(np.uint16)
    return encoded.astype(np.float32) / 65_535.0 * (maximum - minimum) + minimum


def pack_octahedral_height(
    height: np.ndarray,
    radius: float,
    minimum: float,
    maximum: float,
    measured: np.ndarray | None = None,
) -> np.ndarray:
    east_slope, north_slope = sphere_slopes(height, radius)
    denominator = np.abs(east_slope) + np.abs(north_slope) + 1.0
    encoded = np.empty((*height.shape, 4), dtype=np.uint8)
    encoded[..., 0] = np.rint(np.clip(-east_slope / denominator * 0.5 + 0.5, 0.0, 1.0) * 255).astype(
        np.uint8
    )
    encoded[..., 1] = np.rint(
        np.clip(-north_slope / denominator * 0.5 + 0.5, 0.0, 1.0) * 255
    ).astype(np.uint8)
    packed_height = height if measured is None else np.where(measured, height, 0.0)
    if measured is not None:
        encoded[~measured, :2] = 128
    normalized = np.clip((packed_height - minimum) / (maximum - minimum), 0.0, 1.0)
    encoded_height = np.rint(normalized * 65_535).astype(np.uint16)
    encoded[..., 2] = (encoded_height >> 8).astype(np.uint8)
    encoded[..., 3] = (encoded_height & 255).astype(np.uint8)
    return encoded


def write_color_webp(source: Path, destination: Path, size: tuple[int, int], quality: int) -> None:
    with Image.open(source) as image:
        if image.mode != "RGB":
            raise RuntimeError(f"unexpected color contract: {source.name} {image.mode}")
        pixels = resize_periodic(np.asarray(image, dtype=np.uint8), size)
    Image.fromarray(pixels, mode="RGB").save(
        destination,
        "WEBP",
        quality=quality,
        method=6,
        exact=True,
    )


def write_octahedral_png(
    source: Path,
    destination: Path,
    size: tuple[int, int],
    radius: float,
    minimum: float,
    maximum: float,
) -> None:
    with Image.open(source) as image:
        if image.mode != "RGBA":
            raise RuntimeError(f"unexpected height contract: {source.name} {image.mode}")
        packed = np.asarray(image, dtype=np.uint8)
    height = resize_periodic(decode_uint16_height(packed, minimum, maximum), size)
    encoded = pack_octahedral_height(height, radius, minimum, maximum)
    Image.fromarray(encoded, mode="RGBA").save(destination, "PNG", optimize=True)


def write_moon_normal_height(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        if image.mode != "RGBA":
            raise RuntimeError(f"unexpected Moon height contract: {image.mode}")
        packed = np.asarray(image, dtype=np.uint8)
    height = resize_periodic(
        packed[..., 3].astype(np.float32) / 255.0 * (MOON_HEIGHT_MAX_KM - MOON_HEIGHT_MIN_KM)
        + MOON_HEIGHT_MIN_KM,
        PREVIEW_2048,
    )
    east_slope, north_slope = sphere_slopes(height, MOON_RADIUS_KM)
    normal_length = np.sqrt(east_slope * east_slope + north_slope * north_slope + 1.0)
    encoded = np.empty((PREVIEW_2048[1], PREVIEW_2048[0], 4), dtype=np.uint8)
    encoded[..., 0] = np.rint((-east_slope / normal_length * 0.5 + 0.5) * 255).astype(np.uint8)
    encoded[..., 1] = np.rint((-north_slope / normal_length * 0.5 + 0.5) * 255).astype(np.uint8)
    encoded[..., 2] = np.rint((1.0 / normal_length * 0.5 + 0.5) * 255).astype(np.uint8)
    encoded[..., 3] = np.rint(
        np.clip((height - MOON_HEIGHT_MIN_KM) / (MOON_HEIGHT_MAX_KM - MOON_HEIGHT_MIN_KM), 0.0, 1.0)
        * 255
    ).astype(np.uint8)
    Image.fromarray(encoded, mode="RGBA").save(
        destination,
        "WEBP",
        quality=96,
        method=6,
        exact=True,
    )


def write_pluto_albedo(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        if image.mode != "RGBA":
            raise RuntimeError(f"unexpected Pluto albedo contract: {image.mode}")
        packed = np.asarray(image, dtype=np.uint8)
    color = resize_periodic(packed[..., :3], PREVIEW_1024)
    confidence = resize_periodic(np.clip((packed[..., 3].astype(np.float32) - 1.0) / 254.0, 0.0, 1.0), PREVIEW_1024)
    encoded = np.empty((PREVIEW_1024[1], PREVIEW_1024[0], 4), dtype=np.uint8)
    encoded[..., :3] = color
    encoded[..., 3] = np.rint(np.clip(confidence, 0.0, 1.0) * 254).astype(np.uint8) + 1
    Image.fromarray(encoded, mode="RGBA").save(destination, "PNG", optimize=True)


def write_pluto_normal_height(source: Path, albedo_source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        packed = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    with Image.open(albedo_source) as image:
        albedo = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    height = resize_periodic(
        decode_uint16_height(packed, PLUTO_HEIGHT_MIN_METERS, PLUTO_HEIGHT_MAX_METERS),
        PREVIEW_1024,
    )
    confidence = resize_periodic(
        np.clip((albedo[..., 3].astype(np.float32) - 1.0) / 254.0, 0.0, 1.0),
        PREVIEW_1024,
    )
    encoded = pack_octahedral_height(
        height,
        PLUTO_DATUM_RADIUS_METERS,
        PLUTO_HEIGHT_MIN_METERS,
        PLUTO_HEIGHT_MAX_METERS,
        measured=confidence > 0.02,
    )
    Image.fromarray(encoded, mode="RGBA").save(destination, "PNG", optimize=True)


def write_sun_webp(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        if image.size != (1024, 1024) or image.mode != "RGBA":
            raise RuntimeError(f"unexpected Sun contract: {image.size} {image.mode}")
        image.save(destination, "WEBP", quality=96, method=6, exact=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--textures", type=Path, default=TEXTURES)
    args = parser.parse_args()
    textures = args.textures

    jobs: list[tuple[str, callable[[], None]]] = [
        (
            "mars/mars-albedo-2048.webp",
            lambda: write_color_webp(
                textures / "mars" / "mars-albedo.webp",
                textures / "mars" / "mars-albedo-2048.webp",
                PREVIEW_2048,
                95,
            ),
        ),
        (
            "mars/mars-normal-height-2048.png",
            lambda: write_octahedral_png(
                textures / "mars" / "mars-normal-height.png",
                textures / "mars" / "mars-normal-height-2048.png",
                PREVIEW_2048,
                MARS_MEAN_RADIUS_METERS,
                MARS_HEIGHT_MIN_METERS,
                MARS_HEIGHT_MAX_METERS,
            ),
        ),
        (
            "moon/moon-albedo-2048.webp",
            lambda: write_color_webp(
                textures / "moon" / "moon-albedo.webp",
                textures / "moon" / "moon-albedo-2048.webp",
                PREVIEW_2048,
                94,
            ),
        ),
        (
            "moon/moon-normal-height-2048.webp",
            lambda: write_moon_normal_height(
                textures / "moon" / "moon-normal-height.webp",
                textures / "moon" / "moon-normal-height-2048.webp",
            ),
        ),
        (
            "jupiter/jupiter-albedo-2048.webp",
            lambda: write_color_webp(
                textures / "jupiter" / "jupiter-albedo.webp",
                textures / "jupiter" / "jupiter-albedo-2048.webp",
                PREVIEW_2048,
                96,
            ),
        ),
        (
            "mercury/mercury-albedo-1024.webp",
            lambda: write_color_webp(
                textures / "mercury" / "mercury-albedo.webp",
                textures / "mercury" / "mercury-albedo-1024.webp",
                PREVIEW_1024,
                95,
            ),
        ),
        (
            "mercury/mercury-normal-height-1024.png",
            lambda: write_octahedral_png(
                textures / "mercury" / "mercury-normal-height.png",
                textures / "mercury" / "mercury-normal-height-1024.png",
                PREVIEW_1024,
                MERCURY_DATUM_RADIUS_METERS,
                MERCURY_HEIGHT_MIN_METERS,
                MERCURY_HEIGHT_MAX_METERS,
            ),
        ),
        (
            "pluto/pluto-albedo-1024.png",
            lambda: write_pluto_albedo(
                textures / "pluto" / "pluto-albedo.png",
                textures / "pluto" / "pluto-albedo-1024.png",
            ),
        ),
        (
            "pluto/pluto-normal-height-1024.png",
            lambda: write_pluto_normal_height(
                textures / "pluto" / "pluto-normal-height.png",
                textures / "pluto" / "pluto-albedo.png",
                textures / "pluto" / "pluto-normal-height-1024.png",
            ),
        ),
        (
            "sun/sun-aia-304.webp",
            lambda: write_sun_webp(
                textures / "sun" / "sun-aia-304.png",
                textures / "sun" / "sun-aia-304.webp",
            ),
        ),
    ]

    for name, write in jobs:
        write()
        destination = textures / name
        print(f"wrote {destination.relative_to(ROOT)} ({destination.stat().st_size} bytes, {sha256(destination)})")


if __name__ == "__main__":
    main()
