#!/usr/bin/env python3
"""The daily Reel's soundtrack, generated from scratch so there is nothing to license.

Every track is five bars and a short tail. Bar 1 is the intro under the headline; the games land
on the beats of bar 2, one chime each; bars 3 and 4 hold the card while it's read; bar 5 resolves
under the App Store card. Tempo, key and chords come from src/tracks.json, one entry per weekday,
which the video reads too, so its cuts land on the music.

Standard library only. Writes public/music/<weekday>-<rows>.wav (48 kHz, 16-bit stereo):
    python3 scripts/music.py                  # all seven days, five rows
    python3 scripts/music.py monday 3         # one day, three games on the card
"""
import json, math, os, random, struct, sys, wave

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
with open(os.path.join(ROOT, 'src', 'tracks.json')) as fh:
    TABLE = json.load(fh)
TAIL = TABLE['tail']
OUT = os.path.join(ROOT, 'public', 'music')

# Diatonic seventh chords, as semitones above the key.
CHORDS = {'I': [0, 4, 7, 11], 'ii': [2, 5, 9, 12], 'iii': [4, 7, 11, 14], 'IV': [5, 9, 12, 16], 'V': [7, 11, 14, 17], 'vi': [9, 12, 16, 19]}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Bus:
    def __init__(self, n):
        self.n, self.L, self.R = n, [0.0] * n, [0.0] * n

    def add(self, t, samples, gain, pan=0.0):
        """Mix `samples` in at `t` seconds; equal-power pan from -1 (left) to 1 (right)."""
        start = int(round(t * SR))
        gl, gr = gain * math.cos((pan + 1) * math.pi / 4), gain * math.sin((pan + 1) * math.pi / 4)
        L, R = self.L, self.R
        for j in range(max(0, start), min(self.n, start + len(samples))):
            v = samples[j - start]
            L[j] += v * gl
            R[j] += v * gr


def _blep(t, dt):
    if t < dt:
        t /= dt
        return t + t - t * t - 1.0
    if t > 1.0 - dt:
        t = (t - 1.0) / dt
        return t * t + t + t + 1.0
    return 0.0


def pad(freqs, length, rng, cutoff=950.0, attack=0.45, release=0.9):
    """Two detuned band-limited saws per note through a 12 dB low-pass, swelling in."""
    n = int((length + release) * SR)
    acc = [0.0] * n
    for f in freqs:
        for cents in (-7.0, 7.0):
            inc = f * 2 ** (cents / 1200) / SR
            ph = rng.random()
            for i in range(n):
                ph += inc
                if ph >= 1.0:
                    ph -= 1.0
                acc[i] += 2.0 * ph - 1.0 - _blep(ph, inc)
    a = 1 - math.exp(-2 * math.pi * cutoff / SR)
    y1 = y2 = 0.0
    for i in range(n):
        y1 += a * (acc[i] - y1)
        y2 += a * (y1 - y2)
        t = i / SR
        env = min(1.0, t / attack) if t < length else max(0.0, 1.0 - (t - length) / release)
        acc[i] = y2 * env
    return acc


def pluck(freq, rng, length=1.1, decay=0.9965):
    """Karplus-Strong, tuned with an all-pass fractional delay so it sits in tune with the pad."""
    D = SR / freq
    N = int(D - 0.5)
    frac = D - 0.5 - N
    if frac < 0.15:
        N -= 1
        frac += 1.0
    C = (1 - frac) / (1 + frac)
    buf, lp = [], 0.0
    for _ in range(N):  # a slightly darkened noise burst: a softer pick
        lp += 0.55 * (rng.uniform(-1, 1) - lp)
        buf.append(lp)
    out, idx, prev, ax, ay = [], 0, 0.0, 0.0, 0.0
    total = int(length * SR)
    for i in range(total):
        x = buf[idx]
        avg = decay * 0.5 * (x + prev)
        prev = x
        y = C * avg + ax - C * ay
        ax, ay = avg, y
        buf[idx] = y
        idx += 1
        if idx == N:
            idx = 0
        out.append(x)
    fade = int(0.06 * SR)
    for k in range(fade):
        out[total - 1 - k] *= k / fade
    return out


def chime(freq, length=1.8, bright=1.6):
    """A two-operator FM electric piano: round, with a soft bell edge on the attack."""
    out = []
    w = 2 * math.pi * freq / SR
    for i in range(int(length * SR)):
        t = i / SR
        index = bright * math.exp(-t * 5.0) + 0.15
        out.append(math.sin(w * i + index * math.sin(w * i)) * math.exp(-t * 2.4) * min(1.0, t / 0.003))
    return out


def bass(freq, length):
    """Sine bass with a little saturation, so phone speakers still carry the line."""
    out, w = [], 2 * math.pi * freq / SR
    n = int((length + 0.12) * SR)
    for i in range(n):
        t = i / SR
        x = math.sin(w * i) + 0.5 * math.sin(2 * w * i) + 0.3 * math.sin(3 * w * i) + 0.15 * math.sin(4 * w * i)
        env = min(1.0, t / 0.006) * (0.65 + 0.35 * math.exp(-t * 5)) * (1.0 if t <= length else max(0.0, 1 - (t - length) / 0.12))
        out.append(math.tanh(1.3 * x) * env)
    return out


def kick(rng):
    out, ph, hp_prev, hp_y = [], 0.0, 0.0, 0.0
    for i in range(int(0.5 * SR)):
        t = i / SR
        ph += 2 * math.pi * (50 + 120 * math.exp(-t * 30)) / SR
        body = math.sin(ph) * math.exp(-t * 7.5)
        x = rng.uniform(-1, 1)
        hp_y = 0.6 * (hp_y + x - hp_prev)
        hp_prev = x
        click = hp_y * math.exp(-t * 400) * 0.5  # the beater: what a phone speaker hears
        out.append(math.tanh(1.5 * (body + click)))
    return out


def snare(rng):
    out, lp, prev = [], 0.0, 0.0
    for i in range(int(0.32 * SR)):
        t = i / SR
        x = rng.uniform(-1, 1)
        lp += 0.35 * (x - lp)
        band = lp - prev
        prev = lp
        tone = math.sin(2 * math.pi * 185 * t) * math.exp(-t * 30)
        out.append((1.6 * band * math.exp(-t * 18) + 0.5 * tone) * min(1.0, t / 0.001))
    return out


def hat(rng, open_=False):
    out, prev, prev2 = [], 0.0, 0.0
    decay = 22 if open_ else 75
    for i in range(int((0.25 if open_ else 0.07) * SR)):
        x = rng.uniform(-1, 1)
        y = x - 2 * prev + prev2  # second difference: only the top end survives
        prev2, prev = prev, x
        out.append(0.25 * y * math.exp(-(i / SR) * decay))
    return out


def riser(length, rng):
    """Filtered noise that opens up into the next bar."""
    out, lp = [], 0.0
    n = int(length * SR)
    for i in range(n):
        p = i / n
        a = 0.02 + 0.5 * p * p
        lp += a * (rng.uniform(-1, 1) - lp)
        out.append(lp * p * p)
    return out


def reverb(L, R, room=0.82, damp=0.35):
    """A small Freeverb: six damped combs and three all-passes per side, the right side spread."""
    scale = SR / 44100

    def side(x, spread):
        n = len(x)
        out = [0.0] * n
        for d0 in (1116, 1188, 1277, 1356, 1422, 1491):
            d = int((d0 + spread) * scale)
            buf, idx, store = [0.0] * d, 0, 0.0
            for i in range(n):
                y = buf[idx]
                store = y * (1 - damp) + store * damp
                buf[idx] = x[i] + store * room
                idx += 1
                if idx == d:
                    idx = 0
                out[i] += y
        for d0 in (556, 441, 341):
            d = int((d0 + spread) * scale)
            buf, idx = [0.0] * d, 0
            for i in range(n):
                b = buf[idx]
                buf[idx] = out[i] + b * 0.5
                out[i] = b - out[i]
                idx += 1
                if idx == d:
                    idx = 0
        return out

    return side(L, 0), side(R, 23)


def track(day, rows=5):
    p = TABLE['days'][day]
    rng = random.Random(p['seed'])
    beat = 60.0 / p['bpm']
    bar = 4 * beat
    n = int((5 * bar + TAIL) * SR)
    dry, wet = Bus(n), Bus(n)
    key = p['key']
    prog = p['prog'] + ['I']
    k, sn = kick(rng), snare(rng)
    drive = p['bpm'] >= 106

    for b, name in enumerate(prog):
        t0 = b * bar
        tones = [key + x for x in CHORDS[name]]
        last = b == 4
        # The bed: each bar's chord; the last one rings into the tail.
        s = pad([hz(m) for m in tones], bar + (TAIL if last else 0.0), rng, cutoff=700.0 if b == 0 else 980.0)
        dry.add(t0, s, 0.036)
        wet.add(t0, s, 0.016)
        if last:
            break
        # Plucked arpeggio: quarters in the intro, eighths once the games arrive.
        steps = [0, 2, 1, 3] if b == 0 else [0, 1, 2, 3, 2, 1, 2, 3]
        sub = beat if b == 0 else beat / 2
        for i, st in enumerate(steps):
            s = pluck(hz(tones[st] + 12), rng)
            pan = -0.35 if i % 2 == 0 else 0.35
            dry.add(t0 + i * sub, s, 0.24, pan)
            wet.add(t0 + i * sub, s, 0.10, pan)
        # Hats: the second half of the intro, then eighths with a little swing.
        for i in range(8):
            if b == 0 and i < 4:
                continue
            off = i * beat / 2 + (0.06 * beat if i % 2 else 0.0)
            dry.add(t0 + off, hat(rng), 0.10 if i % 2 else 0.065, 0.3)
        if b == 0:
            dry.add(t0 + 3 * beat, riser(beat, rng), 0.10)
            continue
        # Bars 2-4: bass, kick, snare.
        root = key - 24 + CHORDS[name][0]
        for bt, ln in ((0, 1.4), (2, 0.9), (3.5, 0.4)):
            dry.add(t0 + bt * beat, bass(hz(root), ln * beat), 0.13)
        for bt in ((0, 1.75, 2.5) if drive else (0, 2.5)):
            dry.add(t0 + bt * beat, k, 0.30)
        for bt in (1, 3):
            dry.add(t0 + bt * beat, sn, 0.13)
            wet.add(t0 + bt * beat, sn, 0.08)
        if b == 3:
            dry.add(t0 + 3 * beat, riser(beat, rng), 0.12)

    # One chime per game, on the beat it lands (beats 4, 5, 6 ...), stepping up the chord.
    for i in range(min(rows, 5)):
        at = (4 + i) * beat
        name = prog[1 + (4 + i) // 4 - 1]
        tone = key + 12 + CHORDS[name][i % 4]
        s = chime(hz(tone))
        dry.add(at, s, 0.16, -0.15 + 0.075 * i)
        wet.add(at, s, 0.08)

    # Bar 5, the App Store card: the home chord, a kick, the bass root and a rising flourish.
    t5 = 4 * bar
    home = [key + x for x in CHORDS['I']]
    dry.add(t5, k, 0.30)
    dry.add(t5, bass(hz(key - 24), bar * 0.8), 0.13)
    for m in [key - 12 + CHORDS['I'][0]] + home:
        s = chime(hz(m), length=3.2, bright=1.0)
        dry.add(t5, s, 0.07)
        wet.add(t5, s, 0.05)
    for i, m in enumerate(home + [home[0] + 12]):
        s = pluck(hz(m + 12), rng, length=2.6, decay=0.9985)
        dry.add(t5 + 0.07 * i, s, 0.18, -0.3 + 0.15 * i)
        wet.add(t5 + 0.07 * i, s, 0.08)

    rL, rR = reverb(wet.L, wet.R)
    L = [d + 0.05 * r for d, r in zip(dry.L, rL)]
    R = [d + 0.05 * r for d, r in zip(dry.R, rR)]
    return master(L, R, bar)


LOUD_DB = -19.0  # RMS above 120 Hz; lands near -14 LUFS integrated (checked with ebur128)


def _rms_above(x, f):
    a = math.exp(-2 * math.pi * f / SR)
    px = py = acc = 0.0
    for v in x:
        py = a * (py + v - px)
        px = v
        acc += py * py
    return math.sqrt(acc / len(x)) or 1e-9


def master(L, R, bar):
    n = len(L)
    # Remove rumble below ~30 Hz, set loudness from what's above 120 Hz (so the bass can't steer
    # it), and keep peaks under -1 dBFS with a soft knee.
    a = math.exp(-2 * math.pi * 30 / SR)
    for buf in (L, R):
        px = py = 0.0
        for i in range(n):
            x = buf[i]
            py = a * (py + x - px)
            px = x
            buf[i] = py
    g = 10 ** (LOUD_DB / 20) / (_rms_above(L, 120.0) + _rms_above(R, 120.0)) * 2
    knee, ceil_ = 0.6, 0.89
    span = ceil_ - knee
    fade_in, fade_out = int(0.012 * SR), int(1.4 * SR)
    for buf in (L, R):
        for i in range(n):
            x = buf[i] * g
            ax = abs(x)
            if ax > knee:
                x = math.copysign(knee + span * math.tanh((ax - knee) / span), x)
            buf[i] = x * min(1.0, i / fade_in) * min(1.0, (n - 1 - i) / fade_out)
    return L, R


def write_wav(path, L, R):
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<hh', int(max(-1.0, min(1.0, a)) * 32767), int(max(-1.0, min(1.0, b)) * 32767)) for a, b in zip(L, R)))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    args = sys.argv[1:]
    days = [args[0]] if args else list(TABLE['days'])
    rows = int(args[1]) if len(args) > 1 else 5
    for day in days:
        if day not in TABLE['days']:
            sys.exit(f'unknown day {day!r}; one of {", ".join(TABLE["days"])}')
        L, R = track(day, rows)
        path = os.path.join(OUT, f'{day}-{rows}.wav')
        write_wav(path, L, R)
        print(f'{path}  {len(L) / SR:.2f}s')
