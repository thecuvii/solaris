#!/usr/bin/env python3
"""Generate Strata's transparent AIA 304 Sun observation texture.

Requires Python 3 with numpy and Pillow:
  python3 -m pip install numpy pillow

The fixed NASA SVS TIFF is an 8-bit sRGB coded-color visualization, not raw
or linear AIA radiance. This script preserves that palette, makes the observed
disk opaque independently of brightness, separates attached off-limb emission
from the nonzero red frame background, and records the exact transform.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "v1" / "sun"

SOURCE_PAGE = "https://svs.gsfc.nasa.gov/3983/"
SOURCE_URL = (
    "https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003983/frames/"
    "4096x4096_1x1_30p/304A-Frames/SDOAIA304A_Jewelbox.00000.tif"
)
SOURCE_SHA256 = "f3dfceec148259ee3980cf20accca505da986a27dc32f507481ce4c4e9d6963c"
SOURCE_SIZE = 4096
SOURCE_UNIQUE_COLORS = 342
OUTPUT_SIZE = 1024

# Robust radial-drop fit on the 1024-square downsampled observation.
DISK_CENTER = (514.25, 512.85)
DISK_RADIUS = 403.75
DISK_FEATHER = 1.25

RADIAL_BASELINE_PERCENTILE = 55
RADIAL_SMOOTHING_WIDTH = 15
EXTERIOR_EXTENT = 92.0
ATTACHMENT_DISTANCE = 10.0
RED_EXCESS_START = 38.0
RED_EXCESS_END = 75.0
GREEN_START = 6.0
GREEN_END = 32.0
RED_EXCESS_WEIGHT = 0.82
COMPONENT_THRESHOLD = 0.12
MINIMUM_COMPONENT_AREA = 3
COMPONENT_EXPANSION = 9
EDGE_DILATION_STEPS = 8


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display_path(path: Path) -> Path:
    return path.relative_to(ROOT) if path.is_relative_to(ROOT) else path


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


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    progress = np.clip((value - edge0) / (edge1 - edge0), 0, 1)
    return progress * progress * (3 - 2 * progress)


def radial_background(red: np.ndarray, radial_index: np.ndarray) -> np.ndarray:
    maximum_radius = int(radial_index.max())
    profile = np.zeros(maximum_radius + 1, dtype=np.float32)
    first_radius = int(DISK_RADIUS - 24)
    for radius in range(first_radius, maximum_radius + 1):
        values = red[radial_index == radius]
        profile[radius] = (
            np.percentile(values, RADIAL_BASELINE_PERCENTILE)
            if values.size
            else profile[radius - 1]
        )
    profile[:first_radius] = profile[first_radius]

    padding = RADIAL_SMOOTHING_WIDTH // 2
    kernel = np.ones(RADIAL_SMOOTHING_WIDTH, dtype=np.float32)
    kernel /= kernel.sum()
    return np.convolve(np.pad(profile, (padding, padding), mode="edge"), kernel, mode="valid")


def attached_components(candidate: np.ndarray, radius: np.ndarray) -> np.ndarray:
    height, width = candidate.shape
    visited = np.zeros_like(candidate, dtype=bool)
    retained = np.zeros_like(candidate, dtype=np.uint8)

    for start_y, start_x in zip(*np.nonzero(candidate & ~visited), strict=True):
        if visited[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        visited[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        attached = False

        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            attached = attached or radius[y, x] < DISK_RADIUS + ATTACHMENT_DISTANCE
            for offset_y in (-1, 0, 1):
                for offset_x in (-1, 0, 1):
                    if offset_x == 0 and offset_y == 0:
                        continue
                    neighbor_y = y + offset_y
                    neighbor_x = x + offset_x
                    if (
                        0 <= neighbor_y < height
                        and 0 <= neighbor_x < width
                        and candidate[neighbor_y, neighbor_x]
                        and not visited[neighbor_y, neighbor_x]
                    ):
                        visited[neighbor_y, neighbor_x] = True
                        queue.append((neighbor_y, neighbor_x))

        if attached and len(component) >= MINIMUM_COMPONENT_AREA:
            for y, x in component:
                retained[y, x] = 255

    expanded = Image.fromarray(retained, mode="L").filter(
        ImageFilter.MaxFilter(COMPONENT_EXPANSION)
    )
    return np.asarray(expanded, dtype=np.uint8) > 0


def dilate_hidden_color(color: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    result = color.copy()
    valid = alpha > 0
    result[~valid] = 0

    for _ in range(EDGE_DILATION_STEPS):
        accumulated = np.zeros_like(result, dtype=np.uint32)
        contributors = np.zeros(valid.shape, dtype=np.uint16)
        for offset_y in (-1, 0, 1):
            for offset_x in (-1, 0, 1):
                if offset_x == 0 and offset_y == 0:
                    continue
                source_y = slice(max(0, -offset_y), min(OUTPUT_SIZE, OUTPUT_SIZE - offset_y))
                source_x = slice(max(0, -offset_x), min(OUTPUT_SIZE, OUTPUT_SIZE - offset_x))
                target_y = slice(max(0, offset_y), min(OUTPUT_SIZE, OUTPUT_SIZE + offset_y))
                target_x = slice(max(0, offset_x), min(OUTPUT_SIZE, OUTPUT_SIZE + offset_x))
                source_valid = valid[source_y, source_x]
                accumulated[target_y, target_x] += (
                    result[source_y, source_x].astype(np.uint32) * source_valid[..., None]
                )
                contributors[target_y, target_x] += source_valid

        fill = ~valid & (contributors > 0)
        result[fill] = np.rint(
            accumulated[fill] / contributors[fill, None]
        ).astype(np.uint8)
        valid |= fill

    return result


def process(source: Path, destination: Path) -> dict[str, int | float]:
    with Image.open(source) as source_image:
        if source_image.size != (SOURCE_SIZE, SOURCE_SIZE):
            raise RuntimeError(
                f"unexpected AIA dimensions: {source_image.size} != "
                f"{(SOURCE_SIZE, SOURCE_SIZE)}"
            )
        if source_image.mode != "RGB":
            raise RuntimeError(f"unexpected AIA mode: {source_image.mode} != RGB")
        colors = source_image.getcolors(maxcolors=SOURCE_UNIQUE_COLORS + 1)
        if colors is None or len(colors) != SOURCE_UNIQUE_COLORS:
            raise RuntimeError("AIA coded-color palette changed; inspect the fixed source")
        resized = source_image.resize(
            (OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS
        )
        color = np.asarray(resized, dtype=np.uint8)

    y, x = np.indices((OUTPUT_SIZE, OUTPUT_SIZE), dtype=np.float32)
    radial_distance = np.sqrt((x - DISK_CENTER[0]) ** 2 + (y - DISK_CENTER[1]) ** 2)
    radial_index = np.floor(radial_distance).astype(np.int32)
    baseline = radial_background(color[..., 0].astype(np.float32), radial_index)
    red_excess = color[..., 0].astype(np.float32) - baseline[radial_index]

    green_support = smoothstep(GREEN_START, GREEN_END, color[..., 1].astype(np.float32))
    red_support = smoothstep(RED_EXCESS_START, RED_EXCESS_END, red_excess)
    emission_strength = np.maximum(green_support, red_support * RED_EXCESS_WEIGHT)
    exterior = (radial_distance > DISK_RADIUS - 1) & (
        radial_distance < DISK_RADIUS + EXTERIOR_EXTENT
    )
    connected = attached_components(
        (emission_strength > COMPONENT_THRESHOLD) & exterior,
        radial_distance,
    )
    emission_premultiplied = np.stack(
        [
            np.clip(red_excess, 0, 255),
            color[..., 1].astype(np.float32),
            color[..., 2].astype(np.float32),
        ],
        axis=-1,
    ) / 255
    off_limb = np.where(connected, emission_premultiplied.max(axis=-1), 0)
    emission_color = emission_premultiplied / np.maximum(off_limb[..., None], 1 / 255)

    disk = 1 - smoothstep(
        DISK_RADIUS - DISK_FEATHER,
        DISK_RADIUS + DISK_FEATHER,
        radial_distance,
    )
    alpha = np.maximum(disk, off_limb)
    alpha_bytes = np.rint(np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    straight_color = color.copy()
    off_limb_dominates = off_limb > disk
    straight_color[off_limb_dominates] = np.rint(
        np.clip(emission_color[off_limb_dominates], 0, 1) * 255
    ).astype(np.uint8)
    dilated_color = dilate_hidden_color(straight_color, alpha_bytes)
    output = np.dstack([dilated_color, alpha_bytes])
    Image.fromarray(output, mode="RGBA").save(
        destination,
        "PNG",
        compress_level=9,
        optimize=True,
    )

    return {
        "exteriorAlphaPixels": int(np.count_nonzero((alpha_bytes > 0) & (disk < 1))),
        "maximumAlphaRadius": float(radial_distance[alpha_bytes > 0].max()),
        "opaqueDiskPixels": int(np.count_nonzero(disk >= 1)),
    }


def write_manifest(texture: Path, destination: Path, metrics: dict[str, int | float]) -> None:
    manifest = {
        "asset": "SDO/AIA 304 Angstrom fixed full-disk coded-color observation",
        "credit": (
            "NASA/Goddard Space Flight Center Scientific Visualization Studio, "
            "the SDO Science Team, and the Virtual Solar Observatory"
        ),
        "displayMode": "False-color AIA 304 Angstrom (30.4 nm)",
        "license": "NASA Images and Media Usage Guidelines",
        "modifications": [
            "preserved the fixed 8-bit sRGB SVS coded-color visualization",
            "downsampled the 4096-square frame to 1024-square with Lanczos filtering",
            "fitted an opaque disk independently of on-disk brightness",
            "subtracted a smooth exterior radial background before retaining attached off-limb emission",
            "stored background-subtracted off-limb emission as straight color plus coverage alpha",
            "removed support touching the rectangular frame background",
            "dilated hidden RGB eight pixels beneath the transparent edge for safe linear filtering",
        ],
        "numpyVersion": np.__version__,
        "observationRangeUtc": ["2011-09-25T08:00:00Z", "2011-09-26T01:00:00Z"],
        "observationTimeUtc": "2011-09-25T08:00:00Z",
        "output": texture.name,
        "outputDimensions": [OUTPUT_SIZE, OUTPUT_SIZE],
        "outputSha256": sha256(texture),
        "pillowVersion": PILLOW_VERSION,
        "processing": {
            "attachmentDistance": ATTACHMENT_DISTANCE,
            "componentExpansion": COMPONENT_EXPANSION,
            "componentThreshold": COMPONENT_THRESHOLD,
            "diskCenter": list(DISK_CENTER),
            "diskFeather": DISK_FEATHER,
            "diskRadius": DISK_RADIUS,
            "edgeDilationSteps": EDGE_DILATION_STEPS,
            "exteriorExtent": EXTERIOR_EXTENT,
            "greenRange": [GREEN_START, GREEN_END],
            "minimumComponentArea": MINIMUM_COMPONENT_AREA,
            "radialBaselinePercentile": RADIAL_BASELINE_PERCENTILE,
            "radialSmoothingWidth": RADIAL_SMOOTHING_WIDTH,
            "redExcessRange": [RED_EXCESS_START, RED_EXCESS_END],
            "redExcessWeight": RED_EXCESS_WEIGHT,
        },
        "processingMetrics": metrics,
        "sourceDimensions": [SOURCE_SIZE, SOURCE_SIZE],
        "sourcePage": SOURCE_PAGE,
        "sourceSha256": SOURCE_SHA256,
        "sourceUniqueColors": SOURCE_UNIQUE_COLORS,
        "sourceUrl": SOURCE_URL,
    }
    destination.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def verify(output: Path) -> None:
    texture = output / "sun-aia-304.png"
    manifest_path = output / "sun-texture-manifest.json"
    if not texture.exists() or not manifest_path.exists():
        raise RuntimeError("Sun texture or manifest is missing; generate them first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("sourceSha256") != SOURCE_SHA256:
        raise RuntimeError("Sun manifest references an unexpected source")
    if manifest.get("outputSha256") != sha256(texture):
        raise RuntimeError("Sun texture does not match its manifest")

    with Image.open(texture) as image:
        if image.size != (OUTPUT_SIZE, OUTPUT_SIZE) or image.mode != "RGBA":
            raise RuntimeError("unexpected Sun texture dimensions or mode")
        alpha = np.asarray(image, dtype=np.uint8)[..., 3]
    y, x = np.indices((OUTPUT_SIZE, OUTPUT_SIZE), dtype=np.float32)
    radial_distance = np.sqrt((x - DISK_CENTER[0]) ** 2 + (y - DISK_CENTER[1]) ** 2)
    if np.any(alpha[radial_distance < DISK_RADIUS - DISK_FEATHER] != 255):
        raise RuntimeError("Sun disk contains translucent on-disk pixels")
    if np.any(alpha[[0, -1]]) or np.any(alpha[:, [0, -1]]):
        raise RuntimeError("Sun exterior alpha reaches a rectangular texture edge")
    if not np.any(alpha[radial_distance > DISK_RADIUS + 8] > 0):
        raise RuntimeError("Sun texture lost all meaningful off-limb emission")
    print(f"verified {display_path(texture)} ({sha256(texture)})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "strata-sun-texture",
    )
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.verify:
        verify(args.output)
        return

    args.output.mkdir(parents=True, exist_ok=True)
    source = args.cache / "SDOAIA304A_Jewelbox.00000.tif"
    texture = args.output / "sun-aia-304.png"
    manifest = args.output / "sun-texture-manifest.json"
    download(source)
    metrics = process(source, texture)
    write_manifest(texture, manifest, metrics)
    print(f"wrote {display_path(texture)} ({sha256(texture)})")
    print(f"wrote {display_path(manifest)}")


if __name__ == "__main__":
    main()
