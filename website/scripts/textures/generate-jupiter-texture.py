#!/usr/bin/env python3
"""Generate Strata's web Jupiter texture from the fixed Hubble OPAL 2019 map.

Requires Python 3 with numpy and Pillow:
  python3 -m pip install numpy pillow

The source has no observations above 80 degrees latitude. This script fills
those black polar rows by progressively removing longitudinal detail until each
pole converges to one color, repairs the periodic longitude seam, and preserves
the source's native 3600x1800 information content. It does not derive height or
normal data from the color image.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "jupiter"

SOURCE_URL = (
    "https://assets.science.nasa.gov/content/dam/science/missions/hubble/"
    "releases/2019/08/STScI-01EVSV9A3VN7VYXN5H6Z1GDG93.tif/"
    "jcr:content/renditions/Full%20Res.png"
)
SOURCE_SHA256 = "e79f89b68b4f1c73387b9871e82a31fb4f53e3885fb2f53dd074d8ac78cb38e3"
SOURCE_WIDTH = 3600
SOURCE_HEIGHT = 1800
NORTH_FIRST_DATA_ROW = 101
NORTH_FILL_ANCHOR_ROW = 120
SOUTH_DATA_ROW = 1698
SEAM_BLEND_WIDTH = 32


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


def periodic_blur(row: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return row
    frequencies = np.fft.rfftfreq(row.shape[0])
    kernel = np.exp(-2 * np.pi * np.pi * sigma * sigma * frequencies * frequencies)
    transformed = np.fft.rfft(row, axis=0)
    return np.fft.irfft(transformed * kernel[:, None], n=row.shape[0], axis=0)


def fill_pole(image: np.ndarray, data_row: int, rows: range) -> None:
    edge = image[data_row].astype(np.float64)
    mean = edge.mean(axis=0, keepdims=True)
    row_count = len(rows)
    for index, row_index in enumerate(rows):
        distance = index + 1
        t = distance / row_count
        sigma = (t**1.7) * SOURCE_WIDTH * 0.14
        blurred = periodic_blur(edge, sigma)
        pole_convergence = t**3
        image[row_index] = np.clip(
            blurred * (1 - pole_convergence) + mean * pole_convergence,
            0,
            255,
        ).astype(np.uint8)


def repair_seam(image: np.ndarray) -> None:
    for index in range(SEAM_BLEND_WIDTH):
        progress = index / (SEAM_BLEND_WIDTH - 1)
        weight = 1 - progress * progress * (3 - 2 * progress)
        left = image[:, index].astype(np.float32)
        right = image[:, -1 - index].astype(np.float32)
        average = (left + right) * 0.5
        image[:, index] = np.rint(left * (1 - weight) + average * weight).astype(np.uint8)
        image[:, -1 - index] = np.rint(
            right * (1 - weight) + average * weight
        ).astype(np.uint8)


def process(source: Path, destination: Path) -> None:
    with Image.open(source) as source_image:
        if source_image.size != (SOURCE_WIDTH, SOURCE_HEIGHT):
            raise RuntimeError(
                f"unexpected OPAL dimensions: {source_image.size} != "
                f"{(SOURCE_WIDTH, SOURCE_HEIGHT)}"
            )
        pixels = np.asarray(source_image.convert("RGB"), dtype=np.uint8).copy()

    if np.any(pixels[:NORTH_FIRST_DATA_ROW]) or np.any(pixels[SOUTH_DATA_ROW + 1 :]):
        raise RuntimeError("OPAL polar no-data rows changed; recalibrate the fill bounds")
    north_is_valid = np.all(np.any(pixels[NORTH_FILL_ANCHOR_ROW] > 0, axis=1))
    south_is_valid = np.all(np.any(pixels[SOUTH_DATA_ROW] > 0, axis=1))
    if not north_is_valid or not south_is_valid:
        raise RuntimeError("OPAL valid latitude bounds changed; recalibrate the fill bounds")

    fill_pole(
        pixels,
        NORTH_FILL_ANCHOR_ROW,
        range(NORTH_FILL_ANCHOR_ROW - 1, -1, -1),
    )
    fill_pole(
        pixels,
        SOUTH_DATA_ROW,
        range(SOUTH_DATA_ROW + 1, SOURCE_HEIGHT),
    )
    repair_seam(pixels)

    Image.fromarray(pixels, mode="RGB").save(
        destination,
        "WEBP",
        quality=96,
        method=6,
        exact=True,
    )


def write_manifest(texture: Path, destination: Path) -> None:
    manifest = {
        "asset": "Hubble OPAL Jupiter global map 2019",
        "credit": "NASA, ESA, A. Simon (GSFC), M.H. Wong (UC Berkeley)",
        "grsCenterDegrees": [-107, -21],
        "grsRadiiDegrees": [13, 6],
        "license": "CC BY 4.0",
        "modifications": [
            "filled unobserved polar rows without adding named features",
            "removed chromatic edge artifacts above approximately 78 degrees north",
            "repaired the periodic longitude seam over 32 pixels",
            "converted the sRGB PNG to native-resolution WebP",
        ],
        "numpyVersion": np.__version__,
        "output": texture.name,
        "outputDimensions": [SOURCE_WIDTH, SOURCE_HEIGHT],
        "outputSha256": sha256(texture),
        "pillowVersion": PILLOW_VERSION,
        "sourceSha256": SOURCE_SHA256,
        "sourceUrl": SOURCE_URL,
    }
    destination.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def verify(output: Path) -> None:
    texture = output / "jupiter-albedo.webp"
    manifest_path = output / "jupiter-texture-manifest.json"
    if not texture.exists() or not manifest_path.exists():
        raise RuntimeError("Jupiter texture or manifest is missing; generate them first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("sourceSha256") != SOURCE_SHA256:
        raise RuntimeError("Jupiter manifest references an unexpected source")
    if manifest.get("outputSha256") != sha256(texture):
        raise RuntimeError("Jupiter texture does not match its manifest")
    with Image.open(texture) as image:
        if image.size != (SOURCE_WIDTH, SOURCE_HEIGHT):
            raise RuntimeError(f"unexpected Jupiter texture dimensions: {image.size}")
    print(f"verified {texture.relative_to(ROOT)} ({sha256(texture)})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-jupiter-textures",
    )
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.verify:
        verify(args.output)
        return

    args.output.mkdir(parents=True, exist_ok=True)
    source = args.cache / "hubble-opal-jupiter-2019.png"
    texture = args.output / "jupiter-albedo.webp"
    manifest = args.output / "jupiter-texture-manifest.json"
    download(source)
    process(source, texture)
    write_manifest(texture, manifest)
    print(f"wrote {texture.relative_to(ROOT)} ({sha256(texture)})")
    print(f"wrote {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
