"""Fit the generated B cue to the approved 34.6-second v20 picture."""
from pathlib import Path
import subprocess
import numpy as np
source = Path('launch-video/output/elevenlabs/solaris-b-tidal-engine.mp3')
out = Path('launch-video/output')
sr = 48000

def segment(start, end, speed, duration):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(source), '-af',
        f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,atempo={speed},apad,atrim=duration={duration}',
        '-ar', str(sr), '-ac', '2', '-f', 'f32le', '-'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()

audio = np.zeros((round(34.6 * sr), 2), dtype=np.float32)
for dest, start, end, speed, duration in [
    (0, 0, 11.52, 1.2, 9.6),
    (10.6, 23.8, 41.89, .9, 20.1),
    (31.5, 41.89, 44.99, 1, 3.1),
]:
    piece = segment(start, end, speed, duration)
    # Tiny ramps remove sample discontinuities; there is no musical fade before blackout.
    ramp = round(.004 * sr)
    piece[:ramp] *= np.linspace(0, 1, ramp)[:, None]
    piece[-ramp:] *= np.linspace(1, 0, ramp)[:, None]
    offset = round(dest * sr)
    audio[offset:offset + len(piece)] = piece
# Leave the end card's borrowed original tail room to decay fully.
ramp = round(.35 * sr)
audio[-ramp:] *= np.linspace(1, 0, ramp)[:, None]
for start, end in [(9.6, 10.6), (30.7, 31.5)]:
    assert np.max(np.abs(audio[round(start*sr):round(end*sr)])) == 0
assert np.isfinite(audio).all()
subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(sr),'-ac','2','-i','-',
    '-c:a','pcm_s24le',str(out/'solaris-b-picture-edit.wav')], input=audio.astype('<f4').tobytes(), check=True)
print('34.6 seconds; both blackouts sample-exact; original pitch preserved')
