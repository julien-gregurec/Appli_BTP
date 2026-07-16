#!/usr/bin/env python3
"""Fond musical original pour les vidéos Liria Gestion Pro.

Composé d'après l'analyse d'un morceau de référence fourni par Julien
(« Notre destinée ») — dont les mesures objectives sont :

    tempo 80,5 BPM · Do# majeur · rapport grave/aigu 25,9 (808 très présente)
    brillance 2510 Hz (hi-hats claquants) · 3,7 frappes/s

Seuls ces PARAMÈTRES sont repris : un tempo, une tonalité et un équilibre
sonore ne sont pas protégeables. La composition ci-dessous est originale, donc
utilisable commercialement sans risque de blocage ni de réclamation.

    python3 scripts/video/musique.py output/video/fond.wav 60
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 80.5
NOIRE = 60.0 / BPM
RNG = np.random.default_rng(7)

# Do# majeur. I – V – vi – IV : la progression la plus universelle.
DO_D = 138.59
PROGRESSION = [
    ("C#", [138.59, 174.61, 207.65]),   # Do#
    ("G#", [103.83, 130.81, 155.56]),   # Sol#
    ("A#m", [116.54, 138.59, 174.61]),  # La#m
    ("F#", [92.50, 116.54, 138.59]),    # Fa#
]


def enveloppe(n, attaque=0.008, chute=0.35, courbe=1.4):
    env = np.ones(n)
    a = max(1, int(attaque * SR))
    d = min(n, int(chute * SR))
    env[:a] = np.linspace(0, 1, a)
    env[-d:] *= np.linspace(1, 0, d) ** courbe
    return env


def bass_808(freq, duree):
    """808 : sinusoïde grave dont la hauteur plonge à l'attaque, puis tient.

    C'est cette chute de hauteur qui fait la signature du son, et la saturation
    douce qui lui donne du corps sans le rendre agressif.
    """
    n = int(duree * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 3.2 * np.exp(-t * 32))      # le « pitch drop »
    onde = np.sin(2 * np.pi * np.cumsum(f) / SR)
    onde = np.tanh(onde * 2.1) * 0.44            # saturation : du corps
    return onde * np.exp(-t * 1.5) * enveloppe(n, 0.004, 0.20)


def kick(duree=0.30):
    n = int(duree * SR)
    t = np.arange(n) / SR
    f = 150 * np.exp(-t * 34) + 48
    corps = np.sin(2 * np.pi * np.cumsum(f) / SR)
    clic = RNG.normal(0, 1, n) * np.exp(-t * 300) * 0.3
    return (corps + clic) * np.exp(-t * 9)


def caisse(duree=0.20):
    n = int(duree * SR)
    t = np.arange(n) / SR
    bruit = RNG.normal(0, 1, n) * np.exp(-t * 22)
    corps = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 32) * 0.5
    return (bruit * 0.7 + corps) * 0.72


def hat(duree=0.05, ouvert=False):
    n = int(duree * SR)
    t = np.arange(n) / SR
    # Bruit filtré vers l'aigu : c'est la brillance mesurée à 2510 Hz.
    b = RNG.normal(0, 1, n)
    # Deux dérivées successives : pente passe-haut plus raide, donc un hat qui
    # claque au lieu de siffler. La mesure de brillance visait 2400 Hz.
    b = np.diff(np.concatenate([[0], b]))
    b = np.diff(np.concatenate([[0], b]))
    b += 0.35 * np.sin(2 * np.pi * 8200 * t)     # un peu de métal
    return b * np.exp(-t * (12 if ouvert else 90)) * 0.42


def pluck(freq, duree):
    """Pluck mélodique : quelques harmoniques, attaque nette, chute rapide."""
    n = int(duree * SR)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * freq * h * t) * (0.6 ** (h - 1)) for h in (1, 2, 3, 4))
    return s * enveloppe(n, 0.004, min(0.30, duree * 0.9), 2.0) * 0.52


def nappe(accord, duree):
    n = int(duree * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in accord:
        for ecart in (-0.005, 0.005):            # deux voix désaccordées
            ff = f * 2 * (1 + ecart)
            for h in range(1, 7):
                s += np.sin(2 * np.pi * ff * h * t) / (h * 1.6)
    return s / len(accord) * enveloppe(n, 0.25, 0.5, 1.0) * 0.085


def poser(mix, signal, instant):
    i = int(instant * SR)
    j = min(len(mix), i + len(signal))
    if i < len(mix):
        mix[i:j] += signal[: j - i]


def construire(duree_totale):
    total = int(duree_totale * SR) + SR
    mix = np.zeros(total)
    pompage = np.ones(total)
    mesure = NOIRE * 4
    n_mes = int(np.ceil(duree_totale / mesure)) + 1

    for m in range(n_mes):
        t0 = m * mesure
        nom, accord = PROGRESSION[m % 4]
        fondamentale = accord[0]

        poser(mix, nappe(accord, mesure * 1.02), t0)

        # 808 : la fondamentale sur le 1, une relance sur le 3 et demi.
        poser(mix, bass_808(fondamentale / 2, NOIRE * 2.2), t0)
        poser(mix, bass_808(fondamentale / 2, NOIRE * 1.4), t0 + NOIRE * 2.5)

        # Kick sur 1 et sur 3, caisse claire sur 2 et 4 (le squelette du genre).
        for temps in (0, 2.5):
            poser(mix, kick() * 0.55, t0 + temps * NOIRE)
            j = int((t0 + temps * NOIRE) * SR)
            L = min(int(NOIRE * 0.8 * SR), max(0, len(pompage) - j))
            if L > 1:
                pompage[j:j + L] = np.minimum(pompage[j:j + L], np.linspace(0.5, 1, L) ** 0.7)
        for temps in (1, 3):
            poser(mix, caisse(), t0 + temps * NOIRE)

        # Hi-hats en doubles-croches, avec des triolets qui accélèrent : la
        # signature trap. La vélocité alterne pour éviter l'effet machine.
        pas = NOIRE / 4
        for i in range(16):
            inst = t0 + i * pas
            vel = 1.0 if i % 4 == 0 else (0.55 if i % 2 else 0.75)
            poser(mix, hat(ouvert=(i == 14)) * vel, inst)
            if m % 4 == 3 and i >= 12:            # roulement de fin de phrase
                for k in range(3):
                    poser(mix, hat() * 0.5, inst + k * pas / 3)

        # Mélodie : arpège de l'accord, deux octaves au-dessus.
        motif = [0, 2, 1, 2, 0, 1, 2, 1]
        for i, deg in enumerate(motif):
            poser(mix, pluck(accord[deg] * 4, NOIRE * 0.45), t0 + i * NOIRE / 2)

    mix = mix[: int(duree_totale * SR)] * pompage[: int(duree_totale * SR)]

    f = min(int(1.2 * SR), len(mix) // 4)
    mix[:f] *= np.linspace(0, 1, f)
    mix[-f:] *= np.linspace(1, 0, f)

    crete = np.max(np.abs(mix)) or 1
    return np.tanh(mix / crete * 1.15) * 0.75


def ecrire(chemin, mono):
    # Élargissement stéréo : très léger décalage entre les deux oreilles.
    stereo = np.stack([mono, np.roll(mono, 180)], axis=1)
    with wave.open(str(chemin), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(stereo, -1, 1) * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    sortie = Path(sys.argv[1] if len(sys.argv) > 1 else "output/video/fond.wav")
    duree = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    sortie.parent.mkdir(parents=True, exist_ok=True)
    ecrire(sortie, construire(duree))
    print(f"{sortie} · {duree:.0f}s · Do# majeur · {BPM} BPM · {sortie.stat().st_size/1e6:.1f} Mo")
