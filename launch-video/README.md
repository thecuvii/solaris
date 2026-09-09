# Solaris launch video

The 34.6-second film uses the real React showcase UI and Solaris WebGL shaders.
The timeline stages presets, parameter/code NumberFlow animations, two navigation
passes, three shadow laps, the real Sky UI, preset morphs, and a sun-to-logo ending.

## Preview

Run `pnpm dev` and open `http://localhost:3000/earth/launch/`.
The preview stays black until the opening frame is initialized, then plays without
music. `/sky/launch/?capture=1` is the preloaded Sky page used by the director.

Use `/earth/launch/?capture=1` to disable autoplay. After initialization:

```js
window.solarisShot.seek(23)
window.solarisShot.play()
```

The approved composition targets a 1920 × 1080 CSS viewport. Higher-resolution
exports retain that framing and rasterize at twice the pixel density.

## Render

Requires the running local website, installed Chrome, Playwright (a repository
dev dependency), and FFmpeg on PATH. Run from the repository root:

```sh
node launch-video/render.mjs       # 1080p30, v27
node launch-video/render-4k.mjs    # native 4K30, v28
node launch-video/render-4k60.mjs  # native 4K60, v29
```

Capture freezes browser time and advances it at the output frame rate, including
NumberFlow Web Animations. The 4K scripts verify canvas backing resolution and
lift Sky's interactive DPR cap only in the capture browser's compiled response.
No resolution cap is changed in the published library.

The scripts write PNG sequences, render reports and silent H.264 MP4 files to
`output/`, which is ignored by Git. A 4K60 render produces 2076 frames and can take
substantial time, especially through the Sky section. Do not edit the website
while capturing: hot reload can reset measured positions and the timeline.

## Local assets and music

The end card uses a locally installed PP Neue Montreal Medium font, synthesized
bold by the browser. To match the approved film, place a licensed copy at
`website/public/launch-assets/PPNeueMontreal-Medium.woff2`. The font is not included;
Arial is the fallback.

The approved soundtrack is the ElevenLabs B / Tidal Engine edit. Its source MP3
belongs at `output/elevenlabs/solaris-b-tidal-engine.mp3`. With Python + NumPy and
FFmpeg available, run `python3 launch-video/audio/edit-elevenlabs-b-breath.py` to
create `output/solaris-b-breath-v2.wav`, then combine it with the silent render:

```sh
ffmpeg -y -i launch-video/output/solaris-launch-opening-v29-4k60.mp4 \
  -i launch-video/output/solaris-b-breath-v2.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k \
  -t 34.6 -movflags +faststart launch-video/output/solaris-launch-v29-4k60.mp4
```

Downloaded music, fonts, generated audio, frames and final videos remain local.
The `audio/` folder also retains the earlier string-study and hard-cut experiments;
those are not the approved soundtrack.

## Source map

- `website/modules/launch-video/launch-timeline.ts`: timing, light poses and preset interpolation.
- `launch-director.tsx`: playback, seeking, measured camera/UI staging and first-paint readiness.
- `launch-quick-cuts.tsx`: persistent planet renderers for the montage.
- `launch-overlays.tsx` and `launch-cursor.ts`: code, navigation and measured pointer choreography.
- `launch-sky-director.tsx`: real Sky controls exit independently of the stationary background.
- `launch-sky.tsx` and `launch-brand-motion.ts`: Sky-to-logo continuity and the end card.

The accompanying Mars, Mercury and Pluto shader fixes interpolate decoded height
values to avoid packed-texture self-shadow artifacts while retaining terrain detail.
