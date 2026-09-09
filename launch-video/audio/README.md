# Solaris string study 1

Original 34.6-second D-minor/add9 cue for the v20 picture. Cello sustains and
accelerating cello pulses lead; sparse violin appears during Sky and the end card.
No percussion, piano, voice, or external music recording.

Uses the macOS built-in General MIDI DLS bank through AVAudioUnitSampler (programs
42 cello and 40 violin), with medium-hall reverb. This is a sampled-instrument
arrangement mockup, not a live performance or an external generative-music model.
The system sound bank is referenced locally and is not copied into this repository.

Regenerate the score with `python3 launch-video/audio/compose.py`, then render with
`swift launch-video/audio/render-strings.swift`. Run `finish.py` with Python + NumPy
and FFmpeg available to gate the blackouts and fade the final tail.

Master the gated WAV using FFmpeg:

```sh
ffmpeg -y -i launch-video/output/strings-gated-v1.wav -af 'highpass=f=45,lowpass=f=8500,loudnorm=I=-18:TP=-1.5:LRA=11' -ar 48000 -c:a pcm_s24le launch-video/output/solaris-strings-v1.wav
ffmpeg -y -i launch-video/output/solaris-launch-opening-v20.mp4 -i launch-video/output/solaris-strings-v1.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -t 34.6 -movflags +faststart launch-video/output/solaris-launch-v21-strings.mp4
```

Gates: 9.6–10.6 seconds and 30.7–31.5 seconds. Final note starts alongside the
logo shadow/title at 31.5 seconds, with the tail fading to silence by 34.6 seconds.
Master measured -18.49 LUFS integrated, -6.07 dBTP. Final video and stereo 48 kHz
audio both have 34.6-second duration; full-file decode passed.
