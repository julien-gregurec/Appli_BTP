#!/usr/bin/env python3
"""Pièce orchestrale originale pour les vidéos Liria Gestion Pro.

L'écriture suit l'arc de la vidéo, elle ne se contente pas de boucler :

    0-10 s   un violoncelle seul          — le patron, le matin, devant son devis
    10-22 s  altos + pizzicati            — ça se met en route
    22-36 s  violons + cor                — l'équipe est sur le chantier
    36-50 s  tutti, timbales, cuivres     — la marge s'affiche  (Mi m -> Sol M)
    50-58 s  résolution                   — ça retombe, apaisé

La tension vient de la tonalité : on part en **Mi mineur** (incertain) pour
résoudre en **Sol majeur** (la clarté) — même armure, deux couleurs opposées.
C'est le trajet du produit : du devis griffonné à la marge connue.

Tout est synthétisé ici, donc original et diffusable sans risque.

    python3 scripts/video/orchestre.py output/video/fond.wav 58
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 76
NOIRE = 60.0 / BPM
MESURE = NOIRE * 4
RNG = np.random.default_rng(23)

# Notes utiles (Hz). Tout est monté d'une octave par rapport au premier jet :
# la mesure y donnait 824 Hz de brillance et 83 % de graves, là où un orchestre
# équilibré tient 1500-2500 Hz et ~35 %. Les noms gardent leur ancien libellé
# pour ne pas réécrire l'orchestration ; ce sont les fréquences qui montent.
N = {
    "Mi2": 164.81, "Sol2": 196.00, "La2": 220.00, "Si2": 246.94, "Do3": 261.63,
    "Ré3": 293.66, "Mi3": 329.63, "Fa#3": 369.99, "Sol3": 392.00, "La3": 440.00,
    "Si3": 493.88, "Do4": 523.25, "Ré4": 587.33, "Mi4": 659.26, "Fa#4": 739.99,
    "Sol4": 783.99, "La4": 880.00, "Si4": 987.77, "Ré5": 1174.66, "Sol5": 1567.98,
}


def _phase(freq, n, vibrato=0.0, taux=5.2):
    """Phase intégrée. Écrire sin(2*pi*f*vib(t)*t) ferait enfler le vibrato au
    fil de la note : la fréquence instantanée y vaut f*(vib + t*vib')."""
    t = np.arange(n) / SR
    f = np.full(n, float(freq))
    if vibrato:
        montee = np.minimum(1.0, t / 0.35)          # le vibrato s'installe
        f = f * (1 + vibrato * montee * np.sin(2 * np.pi * taux * t))
    return 2 * np.pi * np.cumsum(f) / SR


def corde(freq, duree, registre="violon", intensite=1.0, attaque=0.14):
    """Corde frottée. Le registre change les formants, donc le caractère.

    Un violoncelle n'est pas un violon transposé : sa caisse résonne plus bas,
    ses harmoniques graves portent davantage.
    """
    n = int(duree * SR)
    if n < 2:
        return np.zeros(1)
    t = np.arange(n) / SR
    ph = _phase(freq, n, vibrato=0.004)

    formants = {"violon": (2, 3, 4), "alto": (2, 3), "violoncelle": (1, 2, 3)}[registre]
    rangs = {"violon": 14, "alto": 12, "violoncelle": 16}[registre]
    s = np.zeros(n)
    for h in range(1, rangs):
        poids = (1.0 / h) * (1.6 if h in formants else 1.0)
        s += poids * np.sin(ph * h)
    s /= 3.4
    s += RNG.normal(0, 1, n) * np.exp(-t * 24) * 0.045   # souffle d'archet

    a = min(n, int(attaque * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 0.7
    d = min(n, int(0.4 * SR))
    e[-d:] *= np.linspace(1, 0, d) ** 1.2
    e *= 1 + 0.14 * np.sin(np.pi * np.linspace(0, 1, n))  # pression de l'archet
    # Les pupitres graves reculent : ce sont eux qui écrasaient le spectre.
    niveau = {"violon": 0.26, "alto": 0.15, "violoncelle": 0.11}[registre]
    return s * e * niveau * intensite


def section(freqs, duree, registre, intensite=1.0):
    """Un pupitre : plusieurs instrumentistes, jamais parfaitement ensemble.

    Ce léger désaccord et ces attaques décalées sont ce qui distingue une
    section d'une note unique amplifiée.
    """
    n = int(duree * SR)
    s = np.zeros(n)
    for f in freqs:
        for ecart, retard in ((-0.003, 0.0), (0.0, 0.012), (0.004, 0.022)):
            voix = corde(f * (1 + ecart), duree, registre, intensite * 0.6)
            i = int(retard * SR)
            j = min(n, i + len(voix))
            if j > i:
                s[i:j] += voix[: j - i]
    return s / max(1, len(freqs))


def cor(freq, duree, intensite=1.0):
    """Cor d'harmonie : harmoniques impaires dominantes, attaque enveloppée."""
    n = int(duree * SR)
    t = np.arange(n) / SR
    ph = _phase(freq, n, vibrato=0.002, taux=4.5)
    s = sum(np.sin(ph * h) * (1.0 / h ** 0.85) * (1.4 if h % 2 else 0.7)
            for h in range(1, 10)) / 3.6
    # Le cuivre s'ouvre : le spectre s'enrichit quand le son s'installe.
    ouverture = np.minimum(1.0, t / 0.30)
    s = np.tanh(s * (1 + 1.6 * ouverture)) * 0.55
    a = min(n, int(0.10 * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 1.4
    d = min(n, int(0.5 * SR))
    e[-d:] *= np.linspace(1, 0, d) ** 1.1
    return s * e * 0.10 * intensite


def timbale(freq=73.42, duree=1.6, intensite=1.0):
    n = int(duree * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.35 * np.exp(-t * 22))          # la peau se détend
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    s += 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * np.exp(-t * 8)
    s += RNG.normal(0, 1, n) * np.exp(-t * 60) * 0.3  # frappe de la mailloche
    return s * np.exp(-t * 2.6) * 0.13 * intensite   # la timbale ne doit pas tout couvrir


def pizz(freq, duree=0.5, intensite=1.0):
    """Pizzicato : corde pincée. Attaque nette, extinction rapide."""
    n = int(duree * SR)
    t = np.arange(n) / SR
    ph = _phase(freq, n)
    s = sum(np.sin(ph * h) * (0.55 ** (h - 1)) for h in range(1, 7))
    s += RNG.normal(0, 1, n) * np.exp(-t * 400) * 0.12
    return s * np.exp(-t * 9) * 0.22 * intensite


def harpe(freq, duree=1.2, intensite=1.0):
    n = int(duree * SR)
    t = np.arange(n) / SR
    ph = _phase(freq, n)
    s = sum(np.sin(ph * h) * (0.4 ** (h - 1)) for h in range(1, 6))
    return s * np.exp(-t * 3.2) * 0.18 * intensite


def poser(mix, sig, instant):
    i = int(instant * SR)
    j = min(len(mix), i + len(sig))
    if i < len(mix) and j > i:
        mix[i:j] += sig[: j - i]


def construire(duree=58.0):
    total = int(duree * SR) + SR
    mix = np.zeros(total)
    M = MESURE

    # ── 1. Le violoncelle seul (0-10 s) — sobre, une seule voix.
    for i, (note, longueur) in enumerate([("Mi2", 2.0), ("Sol2", 1.5), ("Si2", 2.5)]):
        poser(mix, corde(N[note], M * longueur / 2, "violoncelle", 0.9, attaque=0.25),
              i * M * 0.9)
    poser(mix, harpe(N["Mi4"], 2.0, 0.5), M * 1.2)
    poser(mix, harpe(N["Si3"], 2.0, 0.4), M * 2.1)

    # ── 2. Les altos et les pizzicati entrent (10-22 s) — ça se met en marche.
    depart = 10.0
    accords_em = [["Mi3", "Sol3", "Si3"], ["Do3", "Mi3", "Sol3"],
                  ["Sol2", "Si2", "Ré3"], ["Ré3", "Fa#3", "La3"]]
    for m in range(3):
        acc = accords_em[m % 4]
        poser(mix, section([N[x] for x in acc], M * 1.05, "alto", 0.8), depart + m * M)
        poser(mix, corde(N["Mi2"] if m % 2 == 0 else N["Sol2"], M, "violoncelle", 0.7),
              depart + m * M)
        # Pizzicati sur les temps : le pouls qui s'installe.
        for temps in range(4):
            poser(mix, pizz(N[acc[temps % 3]] / 2, 0.45, 0.7),
                  depart + m * M + temps * NOIRE)

    # ── 3. Les violons et le cor (22-36 s) — l'équipe est là.
    depart = 22.0
    chant = [("Si4", 1.5), ("La4", 0.5), ("Sol4", 2.0), ("Fa#4", 1.0), ("Mi4", 3.0)]
    instant = depart
    for note, longueur in chant:
        poser(mix, section([N[note]], NOIRE * longueur * 1.05, "violon", 1.0), instant)
        instant += NOIRE * longueur
    for m in range(4):
        acc = accords_em[m % 4]
        poser(mix, section([N[x] for x in acc], M * 1.05, "alto", 0.65), depart + m * M)
        poser(mix, corde(N["Mi2"], M, "violoncelle", 0.8), depart + m * M)
        poser(mix, cor(N["Si2"], M * 0.9, 0.7), depart + m * M)
        for temps in range(4):
            poser(mix, pizz(N[acc[temps % 3]] / 2, 0.45, 0.6),
                  depart + m * M + temps * NOIRE)

    # ── 4. Le tutti (36-50 s) — la marge. Mi mineur bascule en SOL MAJEUR.
    depart = 36.0
    accords_sol = [["Sol3", "Si3", "Ré4"], ["Do4", "Mi4", "Sol4"],
                   ["Ré4", "Fa#4", "La4"], ["Sol3", "Si3", "Ré4"]]
    chant_final = [("Ré5", 2.0), ("Si4", 1.0), ("Do4", 1.0), ("Ré5", 4.0),
                   ("Si4", 2.0), ("Sol5", 6.0)]
    instant = depart
    for note, longueur in chant_final:
        poser(mix, section([N[note]], NOIRE * longueur * 1.05, "violon", 1.15), instant)
        instant += NOIRE * longueur
    for m in range(4):
        acc = accords_sol[m % 4]
        poser(mix, section([N[x] for x in acc], M * 1.05, "alto", 0.9), depart + m * M)
        poser(mix, corde(N["Sol2"] if m != 2 else N["Ré3"], M, "violoncelle", 1.0),
              depart + m * M)
        poser(mix, cor(N["Ré3"], M * 0.95, 1.0), depart + m * M)
        poser(mix, timbale(N["Sol2"] / 2, 1.8, 1.0), depart + m * M)
        poser(mix, timbale(N["Ré3"] / 2, 1.2, 0.6), depart + m * M + NOIRE * 2.5)
        for temps in range(4):
            poser(mix, pizz(N[acc[temps % 3]] / 2, 0.45, 0.5),
                  depart + m * M + temps * NOIRE)

    # ── 5. La résolution (50-58 s) — l'accord de Sol tenu, tout retombe.
    depart = 50.0
    poser(mix, section([N["Sol3"], N["Si3"], N["Ré4"]], 7.0, "alto", 0.75), depart)
    poser(mix, section([N["Sol4"]], 7.0, "violon", 0.8), depart)
    poser(mix, corde(N["Sol2"], 7.0, "violoncelle", 0.9, attaque=0.3), depart)
    poser(mix, timbale(N["Sol2"] / 2, 2.4, 0.7), depart)
    poser(mix, harpe(N["Sol4"], 2.5, 0.5), depart + 0.4)
    poser(mix, harpe(N["Ré5"], 2.5, 0.4), depart + 1.2)

    n = int(duree * SR)
    mix = mix[:n]
    f = min(int(0.6 * SR), n // 8)
    mix[:f] *= np.linspace(0, 1, f)
    sortie = min(int(3.0 * SR), n // 4)
    mix[-sortie:] *= np.linspace(1, 0, sortie) ** 0.8

    # Un soupçon d'air : on ajoute la dérivée du signal, qui accentue le haut
    # du spectre. C'est l'équivalent d'un plateau d'aigus très doux.
    air = np.diff(np.concatenate([[0.0], mix]))
    mix = mix + air * 0.035

    crete = np.max(np.abs(mix)) or 1
    return np.tanh(mix / crete * 1.05) * 0.76


def ecrire(chemin, mono):
    # Élargissement stéréo : les pupitres ne sont pas tous au même endroit.
    stereo = np.stack([mono, np.roll(mono, 320)], axis=1)
    with wave.open(str(chemin), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(stereo, -1, 1) * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    sortie = Path(sys.argv[1] if len(sys.argv) > 1 else "output/video/fond.wav")
    duree = float(sys.argv[2]) if len(sys.argv) > 2 else 58.0
    sortie.parent.mkdir(parents=True, exist_ok=True)
    ecrire(sortie, construire(duree))
    print(f"{sortie} · {duree:.0f}s · Mi mineur -> Sol majeur · {BPM} BPM")
