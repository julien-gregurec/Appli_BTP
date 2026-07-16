#!/usr/bin/env python3
"""Fond musical original pour les vidéos Liria Gestion Pro.

Composé sur les paramètres d'un morceau de référence indiqué par Julien
(« Balaclava ») : **86 BPM, tonalité de Sol**. Un tempo et une tonalité sont des
faits, pas une œuvre : la composition ci-dessous est originale et diffusable
commercialement, sans risque de blocage ni de réclamation.

Choix assumé : les bases de données reportent souvent la relative majeure.
« Sol » recouvre aussi **Mi mineur** — même armure, couleur beaucoup plus
sombre, et c'est la tonalité de référence du genre. On construit en Mi mineur.

Structure calquée sur un intro, comme demandé : la mélodie tourne d'abord
seule, puis la 808 et les hi-hats entrent.

    python3 scripts/video/musique.py output/video/fond.wav 60
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 86
NOIRE = 60.0 / BPM
MESURE = NOIRE * 4
RNG = np.random.default_rng(11)

# Mi mineur — i · VI · III · VII, l'ossature du genre.
PROGRESSION = [
    ("Em", 82.41, [164.81, 196.00, 246.94]),
    ("C",  65.41, [130.81, 164.81, 196.00]),
    ("G",  98.00, [196.00, 246.94, 293.66]),
    ("D",  73.42, [146.83, 185.00, 220.00]),
]


def env(n, attaque=0.006, chute=0.30, courbe=1.5):
    e = np.ones(n)
    a = max(1, int(attaque * SR))
    d = min(n, max(1, int(chute * SR)))
    e[:a] = np.linspace(0, 1, a)
    e[-d:] *= np.linspace(1, 0, d) ** courbe
    return e


def bass_808(freq, duree, glisse_vers=None):
    """808 glissée : la hauteur file d'une note vers la suivante.

    Ce glissando est la signature du genre — une 808 qui se contente d'attaquer
    sa note sonne comme une basse quelconque.
    """
    n = int(duree * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 2.6 * np.exp(-t * 30))          # chute d'attaque
    if glisse_vers:
        depart = int(n * 0.62)                      # glissando sur le dernier tiers
        pente = np.zeros(n)
        pente[depart:] = np.linspace(0, 1, n - depart) ** 1.8
        cible = glisse_vers * (1 + 2.6 * np.exp(-t * 30))
        f = f * (1 - pente) + cible * pente
    onde = np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * 2.4) * 0.5
    return onde * np.exp(-t * 0.9) * env(n, 0.004, 0.25)


def kick(duree=0.28):
    n = int(duree * SR)
    t = np.arange(n) / SR
    f = 160 * np.exp(-t * 38) + 50
    return (np.sin(2 * np.pi * np.cumsum(f) / SR)
            + RNG.normal(0, 1, n) * np.exp(-t * 320) * 0.28) * np.exp(-t * 10) * 0.55


def caisse(duree=0.22):
    n = int(duree * SR)
    t = np.arange(n) / SR
    return (RNG.normal(0, 1, n) * np.exp(-t * 20) * 0.7
            + np.sin(2 * np.pi * 200 * t) * np.exp(-t * 30) * 0.4) * 0.62


def hat(duree=0.045, ouvert=False):
    n = int(duree * SR)
    t = np.arange(n) / SR
    b = RNG.normal(0, 1, n)
    b = np.diff(np.concatenate([[0], b]))
    b = np.diff(np.concatenate([[0], b]))            # passe-haut raide : ça claque
    b += 0.3 * np.sin(2 * np.pi * 9000 * t)
    return b * np.exp(-t * (11 if ouvert else 95)) * 0.4


def cloche(freq, duree):
    """Cloche : le motif mélodique qui porte l'intro à lui seul."""
    n = int(duree * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * t)
         + 0.5 * np.sin(2 * np.pi * freq * 2.01 * t)
         + 0.25 * np.sin(2 * np.pi * freq * 3.99 * t)
         + 0.12 * np.sin(2 * np.pi * freq * 5.4 * t))
    return s * env(n, 0.003, min(0.45, duree), 2.2) * 0.42


def violon(freq, duree, intensite=1.0):
    """Violon : ce qui fait l'instrument, c'est l'archet, pas la note.

    - harmoniques en 1/n (corde frottée : spectre riche, proche d'une dent de scie) ;
    - vibrato à 5,5 Hz qui s'installe progressivement, comme un vrai doigt ;
    - attaque lente et souffle d'archet à l'entame ;
    - résonance de caisse : les harmoniques 2 à 4 sont soutenues (formants).
    """
    n = int(duree * SR)
    t = np.arange(n) / SR

    # Le vibrato ne démarre pas net : il monte sur les premiers instants.
    montee = np.minimum(1.0, t / max(0.25, duree * 0.3))
    vib = 1 + 0.004 * montee * np.sin(2 * np.pi * 5.2 * t)

    # La phase s'INTÈGRE. Écrire sin(2*pi*f*vib(t)*t) est une erreur classique :
    # la fréquence instantanée devient f*(vib + t*vib'), et le terme en t fait
    # enfler le vibrato au fil de la note — d'où un chevrotement de plus en plus
    # large. On cumule donc la fréquence, comme pour la 808.
    phase = 2 * np.pi * np.cumsum(freq * vib) / SR

    s = np.zeros(n)
    for h in range(1, 13):
        # Formants de la caisse : les rangs 2 à 4 portent le corps du son.
        poids = (1.0 / h) * (1.5 if h in (2, 3, 4) else 1.0)
        s += poids * np.sin(phase * h)
    s /= 3.2

    # Souffle d'archet : bref, à l'attaque seulement.
    s += RNG.normal(0, 1, n) * np.exp(-t * 26) * 0.05

    # Attaque lente (0,12 s) et chute douce : le geste de l'archet.
    a = min(n, int(0.12 * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 0.7
    d = min(n, int(0.35 * SR))
    e[-d:] *= np.linspace(1, 0, d) ** 1.2
    # Léger gonflement au milieu de la note : la pression de l'archet.
    e *= 1 + 0.12 * np.sin(np.pi * np.linspace(0, 1, n))
    return s * e * 0.20 * intensite


def nappe(accord, duree):
    n = int(duree * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in accord:
        for ecart in (-0.004, 0.004):
            for h in range(1, 6):
                s += np.sin(2 * np.pi * f * (1 + ecart) * h * t) / (h * 1.8)
    return s / len(accord) * env(n, 0.3, 0.6, 1.0) * 0.05


def poser(mix, sig, instant):
    i = int(instant * SR)
    j = min(len(mix), i + len(sig))
    if i < len(mix) and j > i:
        mix[i:j] += sig[: j - i]


def construire(duree_totale):
    total = int(duree_totale * SR) + SR
    mix = np.zeros(total)
    pompage = np.ones(total)
    n_mes = int(np.ceil(duree_totale / MESURE)) + 1
    motif = [0, 2, 1, 0, 2, 1, 2, 0]

    for m in range(n_mes):
        t0 = m * MESURE
        _, basse, accord = PROGRESSION[m % 4]
        _, basse_suiv, _ = PROGRESSION[(m + 1) % 4]

        for i, deg in enumerate(motif):
            poser(mix, cloche(accord[deg] * 2, NOIRE * 0.48), t0 + i * NOIRE / 2)

        # Intro : deux mesures à nu, puis tout entre. C'est ce qui donne un
        # démarrage plutôt qu'une boucle sans début.
        if m < 2:
            poser(mix, nappe(accord, MESURE) * 0.5, t0)
            # Le violon est déjà là dans l'intro, seul avec la cloche : c'est
            # lui qui installe l'ambiance avant que la 808 n'arrive.
            poser(mix, violon(accord[0] * 2, NOIRE * 3.4, 0.85), t0 + NOIRE * 0.5)
            continue

        poser(mix, nappe(accord, MESURE), t0)

        # Violon : une contre-mélodie tenue par-dessus les accords. Il entre
        # après l'intro et respire — il ne joue pas toutes les mesures.
        ligne = [(0, 0, 2.0), (2, 1, 1.6), (0, 2, 2.4), (1, 0, 2.0)]
        deg, octv, longueur = ligne[m % 4]
        poser(mix, violon(accord[deg] * (2 if octv == 0 else 4) / (2 if octv == 2 else 1),
                          NOIRE * longueur, 1.0 if m % 2 == 0 else 0.75), t0)

        poser(mix, bass_808(basse, NOIRE * 2.3), t0)
        poser(mix, bass_808(basse, NOIRE * 1.6, glisse_vers=basse_suiv), t0 + NOIRE * 2.4)

        for temps in (0, 2.5):
            poser(mix, kick(), t0 + temps * NOIRE)
            j = int((t0 + temps * NOIRE) * SR)
            L = min(int(NOIRE * 0.8 * SR), max(0, len(pompage) - j))
            if L > 1:
                pompage[j:j + L] = np.minimum(pompage[j:j + L], np.linspace(0.5, 1, L) ** 0.7)
        for temps in (1, 3):
            poser(mix, caisse(), t0 + temps * NOIRE)

        pas = NOIRE / 4
        for i in range(16):
            inst = t0 + i * pas
            poser(mix, hat(ouvert=(i == 14)) * (1.0 if i % 4 == 0 else 0.6), inst)
            if m % 4 == 3 and i >= 12:               # roulement de fin de phrase
                for k in range(3):
                    poser(mix, hat() * 0.45, inst + k * pas / 3)

    n = int(duree_totale * SR)
    mix = mix[:n] * pompage[:n]
    f = min(int(0.8 * SR), n // 5)
    mix[:f] *= np.linspace(0, 1, f)
    mix[-f:] *= np.linspace(1, 0, f)
    crete = np.max(np.abs(mix)) or 1
    return np.tanh(mix / crete * 1.15) * 0.75


def ecrire(chemin, mono):
    stereo = np.stack([mono, np.roll(mono, 190)], axis=1)
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
    print(f"{sortie} · {duree:.0f}s · Mi mineur (armure de Sol) · {BPM} BPM")
