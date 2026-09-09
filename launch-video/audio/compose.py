"""Original D-minor/add9 string study, synchronized to the v20 picture."""
import json
from pathlib import Path
notes = []
def note(t, d, pitch, velocity=65, part=0):
    notes.append(dict(time=round(t, 6), duration=round(d, 6), note=pitch, velocity=velocity, part=part))
# An exposed cello fifth; a slight lift accompanies the city lights.
note(.15, 2.55, 38, 62)
note(1.6, 2.65, 45, 52)
note(3.12, 1.32, 50, 61)
# Navigation pulses accelerate with the same quadratic travel as the image.
pattern = [50, 57, 53, 57, 52, 57, 53, 45]
for i in range(26):
    u = (-1 + (1 + 8 * i / 25) ** .5) / 2
    t = 4.6 + 4.8 * u
    if t < 9.36:
        note(t, min(.14, 9.52 - t), pattern[i % 8], 51 + i // 4, 1)
note(4.6, 2.15, 38, 48)
note(7.0, 2.48, 41, 49)
# Relighting: one continuous motif, increasingly close-spaced as the laps accelerate.
t = 10.6
for lap, frames in enumerate([18, 12, 7]):
    step = frames / 30
    for i, pitch in enumerate([50, 57, 53, 60, 57, 52, 53, 45]):
        note(t + i * step, step * .52, pitch, 59 + lap * 5 + (i % 2) * 3, 1)
    note(t, 8 * step - .1, [38, 34, 43][lap], 56)
    t += 8 * step
# Pullback resolves the pulse into a sustained chord.
note(20.48, 2.4, 38, 58)
note(21.05, 2.35, 45, 48)
note(22.0, 2.35, 64, 39, 2)
# Sky: long, overlapping bow gestures with sparse high violin.
for t, bass, fifth, upper in [(23.05, 38, 45, 69), (25.35, 34, 41, 65), (27.7, 43, 50, 69)]:
    note(t, 2.6, bass, 49)
    note(t + .18, 2.35, fifth, 41)
    note(t + .38, 2.2, upper, 39, 2)
note(29.55, 1.08, 62, 34, 2)
# A final open fifth lands with the logo shadow and title, leaving room for its tail.
note(31.5, 1.35, 38, 62)
note(31.54, 1.42, 45, 48)
note(31.6, 1.3, 62, 36, 2)
Path('launch-video/audio/score.json').write_text(json.dumps(sorted(notes, key=lambda n:n['time']), indent=2) + '\n')
print(f'{len(notes)} notes composed')
