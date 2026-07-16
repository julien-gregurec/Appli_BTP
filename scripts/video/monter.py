#!/usr/bin/env python3
"""Monte les trois propositions de vidéo à partir des mêmes rushes.

Les plans sont découpés une fois depuis l'enregistrement réel de l'application
(output/video/plans/*.mp4). Chaque proposition les réassemble différemment :

  1. punchy   — 45 s, musique + gros textes, aucune voix. Style pub SaaS.
  2. journee  — une journée sur le chantier, récit + voix + musique.
  3. avant    — avant/après, la douleur puis la solution.

    python3 scripts/video/monter.py punchy|journee|avant|tout
"""
import json
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
FF = "/private/tmp/claude-501/-Users-juliengregurec/0fd16bf3-830d-4b6c-a1d8-e3dba37c1072/scratchpad/node_modules/@ffmpeg-installer/darwin-x64/ffmpeg"
TTS = "/private/tmp/claude-501/-Users-juliengregurec/0fd16bf3-830d-4b6c-a1d8-e3dba37c1072/scratchpad/.venv/bin/edge-tts"
PLANS = RACINE / "output/video/plans"
TMP = RACINE / "output/video/montage"
SORTIE = RACINE / "output/video"
# Piste originale composée d'après l'analyse du morceau de référence fourni
# (tempo, tonalité, équilibre spectral). Voir scripts/video/musique.py.
MUSIQUE = RACINE / "output/video/fond.wav"
IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
ARIAL_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

MARINE = "0x0d1b2a"
OR = "0xc9a24a"


def sh(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        print(" ".join(str(a) for a in args)[:200])
        print(r.stderr[-1500:])
        raise SystemExit(1)
    return r


def duree(f):
    r = subprocess.run([FF, "-i", str(f)], capture_output=True, text=True)
    for l in r.stderr.split("\n"):
        if "Duration:" in l:
            h, m, s = l.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return 0.0


def texte_fichier(nom, contenu):
    """drawtext lit le texte depuis un fichier : évite tout échappement d'accents."""
    f = TMP / f"txt_{nom}.txt"
    f.write_text(contenu)
    return str(f).replace(":", r"\:")


def plan(cle, debut, longueur, sortie, texte=None, sous_texte=None, zoom=False, taille=64):
    """Découpe un plan, avec incrustation de texte et léger zoom optionnels."""
    filtres = []
    if zoom:
        # Zoom très lent : donne de la vie sans donner le tournis.
        # ATTENTION : `d` est le nombre d'images générées PAR IMAGE D'ENTRÉE,
        # pas la durée du plan. Avec d=longueur*25, chaque image en produisait
        # 75 : un plan de 3 s rendait 225 s de vidéo. d=1 est le bon réglage.
        filtres.append(
            f"zoompan=z='min(zoom+0.0012,1.12)':d=1:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=25")
    if texte:
        filtres.append(
            f"drawbox=x=0:y=ih-190:w=iw:h=190:color={MARINE}@0.88:t=fill")
        filtres.append(
            f"drawtext=fontfile={IMPACT}:textfile={texte_fichier(cle, texte)}:"
            f"fontsize={taille}:fontcolor=white:x=60:y=h-155:"
            f"alpha='if(lt(t,0.3),t/0.3,1)'")
        if sous_texte:
            filtres.append(
                f"drawtext=fontfile={ARIAL_B}:textfile={texte_fichier(cle+'_s', sous_texte)}:"
                f"fontsize=26:fontcolor={OR}:x=62:y=h-72:"
                f"alpha='if(lt(t,0.5),t/0.5,1)'")
    vf = ",".join(filtres) if filtres else "null"
    sh([FF, "-y", "-ss", str(debut), "-t", str(longueur), "-i", str(PLANS / f"{cle}.mp4"),
        "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "25", "-an", str(sortie)])


def carton(texte, sous, longueur, sortie, fond=MARINE, couleur="white", taille=78):
    """Carton plein écran : accroche, transition, chute."""
    filtres = [
        f"drawtext=fontfile={IMPACT}:textfile={texte_fichier('c_' + sortie.stem, texte)}:"
        f"fontsize={taille}:fontcolor={couleur}:x=(w-tw)/2:y=(h-th)/2-40:"
        f"alpha='if(lt(t,0.35),t/0.35,1)'",
    ]
    if sous:
        filtres.append(
            f"drawtext=fontfile={ARIAL_B}:textfile={texte_fichier('cs_' + sortie.stem, sous)}:"
            f"fontsize=30:fontcolor={OR}:x=(w-tw)/2:y=(h-th)/2+60:"
            f"alpha='if(lt(t,0.7),max(0,(t-0.35)/0.35),1)'")
    sh([FF, "-y", "-f", "lavfi", "-i", f"color=c={fond}:s=1280x720:d={longueur}:r=25",
        "-vf", ",".join(filtres), "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-an", str(sortie)])


def coller(morceaux, sortie):
    liste = TMP / f"liste_{sortie.stem}.txt"
    liste.write_text("\n".join(f"file '{m.name}'" for m in morceaux))
    sh([FF, "-y", "-f", "concat", "-safe", "0", "-i", str(liste),
        "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
        "-r", "25", str(sortie)])


def voix(cle, texte, vitesse="+12%", voix_id="fr-FR-VivienneMultilingualNeural"):
    f = TMP / f"v_{cle}.mp3"
    sh([TTS, "-v", voix_id, f"--rate={vitesse}", "-t", texte, "--write-media", str(f)])
    return f, duree(f)


def finaliser(video, sortie, voix_mp3=None, musique_db=-20, avec_musique=True):
    """Ajoute musique (et voix), puis encode aux réglages universels."""
    d = duree(video)
    entrees = ["-i", str(video)]
    if voix_mp3:
        entrees += ["-i", str(voix_mp3)]
    if avec_musique and MUSIQUE.exists():
        # Pas de -stream_loop : la piste fait 8 min, largement plus que nos
        # montages, et la boucle infinie faisait échouer le décodage.
        entrees += ["-t", str(d + 1), "-i", str(MUSIQUE)]

    # La normalisation doit vivre DANS le graphe : ffmpeg refuse -af et
    # -filter_complex sur un même flux (l'erreur était silencieuse).
    NORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
    if voix_mp3 and avec_musique:
        # La musique s'efface sous la voix (ducking) au lieu de la couvrir.
        # Deux précautions indispensables :
        # - aresample/aformat : sidechaincompress exige des entrées de même
        #   format, or la voix sort en 24 kHz mono et la musique en 44,1 kHz.
        # - asplit : ffmpeg ne consomme un flux qu'une fois, et la voix sert
        #   deux fois (déclencheur du ducking, puis mixage).
        FMT = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
        filtre = (f"[1:a]volume=1.6,{FMT},asplit=2[v1][v2];"
                  f"[2:a]volume={musique_db}dB,{FMT},atrim=0:{d}[m];"
                  f"[m][v1]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[mm];"
                  f"[mm][v2]amix=inputs=2:duration=first,{NORM}[a]")
    elif avec_musique:
        filtre = (f"[1:a]volume={musique_db + 8}dB,aresample=48000,"
                  f"aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:{d},{NORM}[a]")
    else:
        filtre = f"[1:a]volume=1.6,{NORM}[a]"

    sh([FF, "-y", *entrees, "-filter_complex", filtre, "-map", "0:v:0", "-map", "[a]",
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-preset", "medium",
        "-crf", "22", "-pix_fmt", "yuv420p", "-r", "25",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k",
        "-shortest", "-movflags", "+faststart", str(sortie)])
    print(f"  -> {sortie.name} · {duree(sortie):.0f}s · {sortie.stat().st_size/1e6:.1f} Mo")


# ═══════════════════════════════════════════════════════════════════
# 1. PUNCHY — 45 s, musique + gros textes, aucune voix.
#    Se regarde sans le son. Cuts courts, chiffres qui claquent.
# ═══════════════════════════════════════════════════════════════════
def punchy():
    m = []
    carton("VOTRE BOÎTE\nDU BÂTIMENT", "Devis. Chantiers. Heures. Marge.", 2.6, TMP / "p00.mp4")
    m.append(TMP / "p00.mp4")

    plans = [
        ("devis", 2.0, 3.0, "108 DEVIS", "537 840 € en portefeuille", True),
        ("devis_creation", 4.0, 3.4, "CHIFFRÉ EN 30 s", "Les totaux se calculent seuls", False),
        ("devis_fiche", 3.0, 2.6, "ACCEPTÉ ?", "Le chantier se remplit tout seul", False),
        ("chantiers", 3.0, 2.6, "24 CHANTIERS", "Chacun sait où il en est", True),
        ("planning", 3.0, 2.8, "QUI EST OÙ ?", "Le planning répond en un écran", False),
        ("pointage", 2.0, 2.8, "372 HEURES", "Pointées au GPS, jamais retapées", True),
        ("stock", 2.0, 2.6, "LE DÉPÔT SUIT", "Chaque sortie part sur un chantier", False),
        ("factures", 2.0, 2.8, "262 058 € ENCAISSÉS", "Et le reste à encaisser, en direct", True),
        ("rentabilite", 3.0, 3.6, "16,8 % DE MARGE", "Calculée, pas devinée", True),
    ]
    for i, (cle, d, l, t, s, z) in enumerate(plans, 1):
        f = TMP / f"p{i:02}.mp4"
        plan(cle, d, l, f, texte=t, sous_texte=s, zoom=z, taille=60)
        m.append(f)

    carton("LIRIA GESTION PRO", "Du devis à la marge. Un seul logiciel.", 3.2, TMP / "p99.mp4",
           couleur="white", taille=64)
    m.append(TMP / "p99.mp4")

    brut = TMP / "punchy_brut.mp4"
    coller(m, brut)
    finaliser(brut, SORTIE / "1_Punchy_45s.mp4", musique_db=-8)


# ═══════════════════════════════════════════════════════════════════
# 2. JOURNÉE — le récit d'une journée, voix + musique.
# ═══════════════════════════════════════════════════════════════════
def journee():
    etapes = [
        ("h07", "Sept heures. Le client rappelle pour son devis. Vous le chiffrez depuis la cuisine, "
                "les totaux se calculent tout seuls, et c'est parti.",
         [("devis_creation", 3.0, None), ("devis_fiche", 2.5, None)], "07:00", "Le devis part avant le café"),
        ("h08", "Huit heures. L'équipe arrive sur le chantier. Chacun pointe depuis son téléphone : "
                "position, heure serveur. Vous, vous n'avez rien à retaper.",
         [("planning", 3.0, None), ("pointage", 2.0, None)], "08:00", "L'équipe pointe, vous ne faites rien"),
        ("h12", "Midi. Il manque du matériel. Le gars passe au dépôt, s'identifie à la borne, "
                "prend ce qu'il faut. La sortie part directement sur le bon chantier.",
         [("stock", 2.5, None)], "12:00", "Le dépôt s'impute tout seul"),
        ("h18", "Dix-huit heures. Vous ouvrez la rentabilité. Le facturé, les heures réellement "
                "pointées, les achats imputés. Votre marge est là. Vous n'avez rien saisi deux fois.",
         [("rentabilite", 3.0, None)], "18:00", "Votre marge, sans un seul tableur"),
    ]
    m = []
    carton("UNE JOURNÉE", "avec Liria Gestion Pro", 2.4, TMP / "j00.mp4")
    m.append(TMP / "j00.mp4")
    pistes = []
    for cle, texte, plans_, heure, accroche in etapes:
        f, d = voix(cle, texte, "+6%")
        pistes.append(f)
        part = d / len(plans_)
        for i, (p, deb, _) in enumerate(plans_):
            g = TMP / f"j_{cle}_{i}.mp4"
            plan(p, deb, part, g, texte=heure if i == 0 else None,
                 sous_texte=accroche if i == 0 else None, zoom=(i == 0), taille=58)
            m.append(g)
    carton("LIRIA GESTION PRO", "Du devis à la marge, sans jamais ressaisir.", 3.0, TMP / "j99.mp4")
    m.append(TMP / "j99.mp4")

    liste = TMP / "voix_journee.txt"
    liste.write_text("\n".join(f"file '{p.name}'" for p in pistes))
    vx = TMP / "voix_journee.mp3"
    sh([FF, "-y", "-f", "concat", "-safe", "0", "-i", str(liste), "-c", "copy", str(vx)])
    # La voix démarre après le carton d'ouverture.
    vx2 = TMP / "voix_journee_cale.mp3"
    sh([FF, "-y", "-i", str(vx), "-af", "adelay=2400|2400", str(vx2)])

    brut = TMP / "journee_brut.mp4"
    coller(m, brut)
    finaliser(brut, SORTIE / "2_Journee_Chantier.mp4", voix_mp3=vx2, musique_db=-22)


# ═══════════════════════════════════════════════════════════════════
# 3. AVANT / APRÈS — la douleur, puis la réponse.
# ═══════════════════════════════════════════════════════════════════
def avant():
    douleurs = [
        ("Un devis sur un coin de table.", "Et le client qui attend trois jours."),
        ("Les heures sur un carnet.", "Recopiées le dimanche soir. Peut-être."),
        ("La marge ? On verra à la fin.", "Souvent trop tard."),
    ]
    reponses = [
        ("devis_creation", 3.5, 3.2, "CHIFFRÉ SUR PLACE", "Totaux et TVA calculés en direct"),
        ("pointage", 2.0, 3.0, "POINTÉ AU GPS", "372 h, zéro ressaisie"),
        ("rentabilite", 3.0, 3.6, "MARGE : 16,8 %", "Connue avant la fin du chantier"),
    ]
    m = []
    carton("AVANT", "", 1.6, TMP / "a00.mp4", fond="0x1a1a1a", couleur="0x8b8f96", taille=90)
    m.append(TMP / "a00.mp4")
    for i, (t, s) in enumerate(douleurs, 1):
        f = TMP / f"a1{i}.mp4"
        carton(t, s, 2.4, f, fond="0x1a1a1a", couleur="0xd0d0d0", taille=52)
        m.append(f)
    carton("APRÈS", "Liria Gestion Pro", 1.8, TMP / "a50.mp4", taille=90)
    m.append(TMP / "a50.mp4")
    for i, (cle, d, l, t, s) in enumerate(reponses, 1):
        f = TMP / f"a2{i}.mp4"
        plan(cle, d, l, f, texte=t, sous_texte=s, zoom=True, taille=58)
        m.append(f)
    carton("ARRÊTEZ DE DEVINER", "Liria Gestion Pro — du devis à la marge.", 3.0, TMP / "a99.mp4")
    m.append(TMP / "a99.mp4")

    brut = TMP / "avant_brut.mp4"
    coller(m, brut)
    finaliser(brut, SORTIE / "3_Avant_Apres.mp4", musique_db=-9)


if __name__ == "__main__":
    TMP.mkdir(parents=True, exist_ok=True)
    quoi = sys.argv[1] if len(sys.argv) > 1 else "tout"
    if quoi in ("punchy", "tout"):
        print("1. Clip punchy :"); punchy()
    if quoi in ("journee", "tout"):
        print("2. Une journée :"); journee()
    if quoi in ("avant", "tout"):
        print("3. Avant / Après :"); avant()
