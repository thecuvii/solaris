from pathlib import Path
import numpy as np
import subprocess
sample_rate = 48000
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', 'launch-video/output/strings-raw-v1.wav', '-f', 'f32le', '-ar', str(sample_rate), '-ac', '2', '-'])
audio = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(np.float64)
t = np.arange(len(audio)) / sample_rate
gain = np.ones(len(audio))
# Five-millisecond ramps avoid clicks while preserving the picture's hard cuts.
for start, end in [(9.6, 10.6), (30.7, 31.5)]:
    gain[(t >= start) & (t < end)] = 0
    before = (t >= start - .005) & (t < start)
    gain[before] *= (start - t[before]) / .005
    after = (t >= end) & (t < end + .005)
    gain[after] *= (t[after] - end) / .005
gain *= np.minimum(1, t / .035)
u = np.clip((34.6 - t) / 1.05, 0, 1)
gain *= u * u * (3 - 2 * u)
audio *= gain[:, None]
assert np.isfinite(audio).all()
assert np.max(np.abs(audio)) > .0001
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(sample_rate), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', 'launch-video/output/strings-gated-v1.wav'], input=audio.astype('<f4').tobytes(), check=True)
print('Audio valid; peak before mastering:', np.max(np.abs(audio)))
for start, end in [(9.6,10.6), (30.7,31.5)]:
    assert np.max(np.abs(audio[(t>=start)&(t<end)])) == 0
print('Both blackouts are sample-exact silence')
