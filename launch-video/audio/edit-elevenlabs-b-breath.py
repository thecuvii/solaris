"""B revision 2: a short middle tail, bass pickup, and continuous ending."""
from pathlib import Path
import subprocess
import numpy as np

source = Path('launch-video/output/elevenlabs/solaris-b-tidal-engine.mp3')
out = Path('launch-video/output')
sr = 48000

def segment(start, end, speed, duration, extra=''):
    filters = f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,atempo={speed},apad,atrim=duration={duration}'
    if extra:
        filters += ',' + extra
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source), '-af', filters,
        '-ar', str(sr), '-ac', '2', '-f', 'f32le', '-'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()

def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)

audio = np.zeros((round(34.6 * sr), 2), dtype=np.float32)
intro = segment(0, 11.52, 1.2, 9.6)
t = np.arange(len(intro)) / sr
intro *= smooth(t / .02)[:, None]
dry = intro * (1 - smooth((t - 9.57) / .03))[:, None]
audio[:len(dry)] += dry
# Diffuse the last sound into a brief tail, with different stereo delays.
# This is a synthetic tail from the existing mix, not an isolated instrumental stem.
tail = np.zeros((round(9.95 * sr), 2), dtype=np.float32)
for channel in range(2):
    for i in range(32):
        delay = .017 + .0081 * i + channel * .0037
        offset = round(delay * sr)
        count = min(len(intro), len(tail) - offset)
        tail[offset:offset+count, channel] += intro[:count, channel] * (.08 * np.exp(-delay / .15))
t = np.arange(len(tail)) / sr
window = smooth((t - 9.49) / .08) * (1 - smooth((t - 9.65) / .3))
audio[:len(tail)] += tail * window[:, None]
# Restart 150 ms before the Moon returns; open the spectrum over 350 ms.
# At this speed the source's natural release around 42s lands at the title reveal.
body = segment(24.05, 44.642805, .8527, 24.15)
low = segment(24.05, 44.642805, .8527, 24.15, 'lowpass=f=240')
t = np.arange(len(body)) / sr
blend = smooth((t - .15) / .35)[:, None]
body = (low * (1 - blend) + body * blend) * smooth(t / .1)[:, None]
body *= (1 - smooth((t - 23.35) / .8))[:, None]
offset = round(10.45 * sr)
audio[offset:offset+len(body)] += body
# Constant attenuation preserves the source dynamics rather than normalizing each section.
audio *= 10 ** (-2.05 / 20)
assert np.isfinite(audio).all()
assert np.max(np.abs(audio)) < 1
assert np.max(np.abs(audio[round(9.95*sr):round(10.45*sr)])) == 0
for start, end in [(9.6,9.9),(10.45,10.6),(30.7,31.5),(31.5,32.2)]:
    block = audio[round(start*sr):round(end*sr)]
    print(f'{start}-{end}s RMS: {20*np.log10(np.sqrt(np.mean(block**2))+1e-12):.1f} dBFS')
subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(sr),'-ac','2','-i','-',
    '-c:a','pcm_s24le',str(out/'solaris-b-breath-v2.wav')], input=audio.astype('<f4').tobytes(), check=True)
print('34.6 seconds; middle breathing space verified; ending continuous')
