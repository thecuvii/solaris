#!/usr/bin/env python3
"""Generate Strata's Venus cloud-structure map from the Mariner 10 cloud map.

Requires Python 3 with numpy and Pillow:
  python3 -m pip install numpy pillow

The source is a public-domain NASA/JPL/Seal cylindrical cloud map made from
Mariner 10 visible imagery. This script converts its color luminance into a
neutral structure map so the shader, rather than a baked photograph, owns
Venus's aerosol color and illumination. It does not expose Magellan terrain.
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
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "venus"

SOURCE_URL = "https://solarviews.com/raw/venus/venuscyl4.tif"
SOURCE_PAGE = "https://solarviews.com/cap/venus/venuscyl4.htm"
SOURCE_SHA256 = "e68058dedcdc3706b9edbbc3f3bc710b292efb9d943885c562f173cdd3c0b19b"
SOURCE_WIDTH = 1440
SOURCE_HEIGHT = 720
SEAM_BLEND_WIDTH = 24
STITCH_BLEND_WIDTH = 32
STITCH_COLUMNS = (300, 600, 900, 1200)
POLAR_CONVERGENCE_ROWS = 72


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
    frequencies = np.fft.rfftfreq(row.shape[0])
    kernel = np.exp(-2 * np.pi * np.pi * sigma * sigma * frequencies * frequencies)
    transformed = np.fft.rfft(row)
    return np.fft.irfft(transformed * kernel, n=row.shape[0])


def converge_poles(image: np.ndarray) -> None:
    width = image.shape[1]
    for distance in range(POLAR_CONVERGENCE_ROWS):
        progress = (POLAR_CONVERGENCE_ROWS - distance) / POLAR_CONVERGENCE_ROWS
        sigma = (progress**1.7) * width * 0.12
        convergence = progress**3
        for row_index in (distance, image.shape[0] - distance - 1):
            row = image[row_index].astype(np.float64)
            blurred = periodic_blur(row, sigma)
            image[row_index] = blurred * (1 - convergence) + row.mean() * convergence


def repair_seam(image: np.ndarray) -> None:
    for index in range(SEAM_BLEND_WIDTH):
        progress = index / (SEAM_BLEND_WIDTH - 1)
        weight = 1 - progress * progress * (3 - 2 * progress)
        average = (image[:, index] + image[:, -1 - index]) * 0.5
        image[:, index] = image[:, index] * (1 - weight) + average * weight
        image[:, -1 - index] = image[:, -1 - index] * (1 - weight) + average * weight


def repair_source_stitches(image: np.ndarray) -> None:
    for center in STITCH_COLUMNS:
        left = image[:, center - STITCH_BLEND_WIDTH]
        right = image[:, center + STITCH_BLEND_WIDTH]
        for index in range(-STITCH_BLEND_WIDTH, STITCH_BLEND_WIDTH + 1):
            progress = (index + STITCH_BLEND_WIDTH) / (STITCH_BLEND_WIDTH * 2)
            progress = progress * progress * (3 - 2 * progress)
            image[:, center + index] = left * (1 - progress) + right * progress


def process(source: Path, destination: Path) -> None:
    with Image.open(source) as source_image:
        if source_image.size != (SOURCE_WIDTH, SOURCE_HEIGHT):
            raise RuntimeError(
                f"unexpected Mariner map dimensions: {source_image.size} != "
                f"{(SOURCE_WIDTH, SOURCE_HEIGHT)}"
            )
        color = np.asarray(source_image.convert("RGB"), dtype=np.float32) / 255

    luminance = (
        color[..., 0] * 0.2126 + color[..., 1] * 0.7152 + color[..., 2] * 0.0722
    )
    repair_source_stitches(luminance)
    low, high = np.percentile(luminance, [5, 95])
    structure = 0.18 + np.clip((luminance - low) / (high - low), 0, 1) * 0.64
    converge_poles(structure)
    repair_seam(structure)
    encoded = np.rint(np.clip(structure, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(encoded, mode="L").save(
        destination,
        "WEBP",
        quality=96,
        method=6,
        exact=True,
    )


def write_manifest(texture: Path, destination: Path) -> None:
    manifest = {
        "asset": "Mariner 10 visible artistic cylindrical cloud map of Venus",
        "credit": "NASA/JPL/Seal",
        "license": "Public domain under NASA's copyright-free imagery policy",
        "modifications": [
            "converted source sRGB color to relative luminance",
            "softened four visible source-mosaic stitch boundaries over 64 pixels each",
            "robustly normalized cloud structure between the source's 5th and 95th percentiles",
            "progressively removed longitudinal identity over the outermost 72 polar rows",
            "repaired the periodic longitude seam over 24 pixels",
            "encoded a neutral grayscale morphology map without surface, height, or normal data",
        ],
        "numpyVersion": np.__version__,
        "output": texture.name,
        "outputDimensions": [SOURCE_WIDTH, SOURCE_HEIGHT],
        "outputSha256": sha256(texture),
        "pillowVersion": PILLOW_VERSION,
        "sourceDimensions": [SOURCE_WIDTH, SOURCE_HEIGHT],
        "sourcePage": SOURCE_PAGE,
        "sourceSha256": SOURCE_SHA256,
        "sourceUrl": SOURCE_URL,
    }
    serialized = json.dumps(manifest, indent=2)
    for key in ("outputDimensions", "sourceDimensions"):
        serialized = re.sub(
            rf'("{key}": )\[\n\s+([^,\n]+),\n\s+([^\n]+)\n\s+\]',
            rf"\1[\2, \3]",
            serialized,
        )
    destination.write_text(serialized + "\n", encoding="utf-8")


def verify(output: Path) -> None:
    texture = output / "venus-cloud-structure.webp"
    manifest_path = output / "venus-texture-manifest.json"
    if not texture.exists() or not manifest_path.exists():
        raise RuntimeError("Venus texture or manifest is missing; generate them first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("sourceSha256") != SOURCE_SHA256:
        raise RuntimeError("Venus manifest references an unexpected source")
    if manifest.get("outputSha256") != sha256(texture):
        raise RuntimeError("Venus texture does not match its manifest")
    with Image.open(texture) as image:
        if image.size != (SOURCE_WIDTH, SOURCE_HEIGHT):
            raise RuntimeError(f"unexpected Venus texture dimensions: {image.size}")
    print(f"verified {texture.relative_to(ROOT)} ({sha256(texture)})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-venus-texture",
    )
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.verify:
        verify(args.output)
        return

    args.output.mkdir(parents=True, exist_ok=True)
    source = args.cache / "mariner-10-venus-clouds.tif"
    texture = args.output / "venus-cloud-structure.webp"
    manifest = args.output / "venus-texture-manifest.json"
    download(source)
    process(source, texture)
    write_manifest(texture, manifest)
    print(f"wrote {texture.relative_to(ROOT)} ({sha256(texture)})")
    print(f"wrote {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
