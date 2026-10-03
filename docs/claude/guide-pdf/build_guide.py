#!/usr/bin/env python3
"""Génère les deux PDF ELSATIA à partir de skills_data.py :

  1. « ELSATIA — Guide détaillé des skills installés »  -> docs/claude/ELSATIA_Guide_detaille_skills.pdf
  2. « ELSATIA — Aide-mémoire des commandes »           -> docs/claude/ELSATIA_Aide-memoire_commandes.pdf

Usage (depuis la racine du dépôt) :
    python3 docs/claude/guide-pdf/build_guide.py [--chrome CHEMIN_CHROME]

Prérequis : python3, Chrome/Chromium headless récent, pdftotext et pdfinfo (poppler-utils).
"""
import argparse
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.dirname(ICI)
sys.path.insert(0, ICI)
import skills_data as D  # noqa: E402

GUIDE_HTML = os.path.join(ICI, "guide.html")
GUIDE_PDF = os.path.join(DOCS, "ELSATIA_Guide_detaille_skills.pdf")
AIDE_HTML = os.path.join(ICI, "aide-memoire.html")
AIDE_PDF = os.path.join(DOCS, "ELSATIA_Aide-memoire_commandes.pdf")
TITRE_GUIDE = "ELSATIA — Guide détaillé des skills installés"
TITRE_AIDE = "ELSATIA — Aide-mémoire des commandes"
CHROMES = [
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "chromium", "chromium-browser", "google-chrome",
]

STATUT = {"teste": "Disponible et testé", "non_teste": "Installé, non testé", "bloque": "Bloqué par un prérequis"}
STATUT_CLS = {"teste": "ok", "non_teste": "nt", "bloque": "ko"}
ORIG_COURT = {"projet": "Skill du projet — PR #6", "projet_elsatia": "Skill ELSATIA — PR #6",
              "projet_pr5": "Skill du projet — main (PR #5)", "plugin": "Skill de plugin — PR #6",
              "compte": "Skill du compte claude.ai", "integre": "Skill intégré à Claude Code",
              "utilisateur": "Skill du conteneur"}


def e(t):
    return html.escape(str(t), quote=True)


def code(t):
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", e(t))


def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def cmd_html(c):
    return f"<code>{e(c)}</code>" if c.startswith("/") else code(c)


def mode(s):
    """Mode de déclenchement vérifié : (clé, libellé long, libellé court)."""
    cfg = s["declenchement"]
    essai = D.ESSAIS_AUTO.get(s["nom"])
    if cfg == "manuel":
        return "manuel", "Manuel uniquement (disable-model-invocation: true)", "Manuel uniquement"
    if cfg == "non_confirme":
        return "nc", "Non confirmé", "Non confirmé"
    if cfg == "auto_sans_commande":
        return "auto", "Automatique possible ; aucune commande slash vérifiée", "Automatique possible (pas de commande)"
    if essai and essai[0] == "observe":
        return "obs", "Automatique observée pendant un essai, et manuel possible", "Auto observé + manuel"
    if essai and essai[0] == "non_observe":
        return "auto", "Automatique possible mais non observée à l'essai, et manuel possible", "Auto possible (non observé) + manuel"
    return "auto", "Automatique possible (non testée), et manuel possible", "Auto possible (non testé) + manuel"


def observe_txt(s):
    essai = D.ESSAIS_AUTO.get(s["nom"])
    return essai[1] if essai else s["observe"]


def dispo(s):
    """Disponibilité : main, branche PR #6, session actuelle, nouvelle session."""
    o = s["origine"]
    if o in ("projet", "projet_elsatia", "plugin"):
        return {"main": "Non (PR #6 non fusionnée)", "branche": "Oui", "session": "Oui",
                "nouvelle": "Seulement sur la branche PR #6 ; plugins à installer si absents", "court": "PR #6 seulement"}
    if o == "projet_pr5":
        return {"main": "Oui", "branche": "Oui", "session": "Oui", "nouvelle": "Oui", "court": "main"}
    if s["statut"] == "bloque":
        return {"main": "Sans objet (hors dépôt)", "branche": "Sans objet", "session": "Non (prérequis absent)",
                "nouvelle": "Non dans le cloud", "court": "Hors dépôt — bloqué ici"}
    return {"main": "Sans objet (hors dépôt)", "branche": "Sans objet", "session": "Oui",
            "nouvelle": "Oui (compte ou Claude Code)", "court": "Hors dépôt — partout"}


CSS = """
@page { size: A4; margin: 16mm 14mm 18mm 14mm;
  @bottom-left { content: "%(titre)s"; font: 8pt sans-serif; color: #64748b; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font: 8pt sans-serif; color: #64748b; } }
@page large { size: A4 landscape; margin: 12mm 12mm 16mm 12mm; }
@page couverture { @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
body { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif; font-size: 9.5pt; color: #0f172a; line-height: 1.42; margin: 0; }
h1 { font-size: 20pt; color: #1e3a8a; margin: 0 0 8pt; }
h2 { font-size: 15pt; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 3pt; margin: 0 0 10pt; break-after: avoid; }
h3 { font-size: 11.5pt; color: #1e3a8a; margin: 12pt 0 5pt; break-after: avoid; }
a { color: #1d4ed8; text-decoration: none; }
code { font-family: "DejaVu Sans Mono", monospace; font-size: 8.2pt; background: #eef2ff; padding: 0 2pt; border-radius: 2pt; overflow-wrap: anywhere; }
.section { break-before: page; }
.large { page: large; }
.couv { page: couverture; height: 255mm; display: flex; flex-direction: column; justify-content: center; }
.couv h1 { font-size: 28pt; }
.couv .sous { font-size: 12.5pt; color: #334155; margin-bottom: 16pt; }
.encadre { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4pt; padding: 7pt 9pt; margin: 8pt 0; break-inside: avoid; }
.alerte { border-left: 4px solid #b45309; background: #fffbeb; }
table { border-collapse: collapse; width: 100%%; margin: 4pt 0 10pt; table-layout: fixed; }
th, td { border: 1px solid #cbd5e1; padding: 3pt 4pt; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
th { background: #1e3a8a; color: #fff; font-weight: bold; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.petit td, .petit th { font-size: 7.6pt; line-height: 1.3; }
.ok { color: #166534; font-weight: bold; } .nt { color: #92400e; font-weight: bold; } .ko { color: #b91c1c; font-weight: bold; }
.obs { color: #166534; font-weight: bold; } .manuel { color: #6d28d9; font-weight: bold; } .nc { color: #b91c1c; font-weight: bold; }
.badge { display: inline-block; font-size: 6.8pt; padding: 0 3pt; border-radius: 3pt; background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; white-space: normal; line-height: 1.25; }
.badge.main { background: #dcfce7; color: #166534; border-color: #22c55e; }
.badge.hors { background: #e2e8f0; color: #334155; border-color: #94a3b8; }
.orig { color: #64748b; font-size: 6.9pt; }
.toc { list-style: none; padding: 0; margin: 0; }
.toc li { display: flex; align-items: baseline; padding: 1.3pt 0; }
.toc li .pts { flex: 1 1 auto; border-bottom: 1px dotted #94a3b8; margin: 0 4pt; transform: translateY(-3pt); }
.toc li.n2 { padding-left: 14pt; font-size: 8.7pt; }
.cols { columns: 2; column-gap: 10mm; }
.fiche { break-inside: avoid-page; border-top: 1px solid #cbd5e1; padding-top: 4pt; margin-top: 8pt; }
.fiche h3 { margin-top: 4pt; }
.fiche .meta { font-size: 8.2pt; color: #334155; margin-bottom: 4pt; }
.fiche dl { display: grid; grid-template-columns: 35mm 1fr; gap: 2pt 6pt; margin: 0; }
.fiche dt { font-weight: bold; color: #1e3a8a; font-size: 8.5pt; }
.fiche dd { margin: 0; font-size: 8.7pt; }
.copie { font-family: "DejaVu Sans Mono", monospace; font-size: 8.1pt; background: #0f172a; color: #e2e8f0; padding: 4pt 6pt; border-radius: 3pt; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 3pt; }
ul.liste li { margin: 1.5pt 0; }
"""


def head(titre):
    return (f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{e(titre)}</title>'
            f"<style>{CSS % {'titre': titre}}</style></head><body>")


def badge(s):
    d = dispo(s)["court"]
    cls = "main" if d == "main" else ("hors" if d.startswith("Hors") else "")
    return f'<span class="badge {cls}">{e(d)}</span>'


def mode_html(s):
    k, _, court = mode(s)
    cls = {"obs": "obs", "manuel": "manuel", "nc": "nc"}.get(k, "")
    return f'<span class="{cls}">{e(court)}</span>'


# ======================================================================= GUIDE DÉTAILLÉ
def build_guide(pages=None):
    pages = pages or {}
    sk = D.SKILLS
    par_dom = {k: [s for s in sk if s["domaine"] == k] for k, _ in D.DOMAINES}
    compte = lambda f: sum(1 for s in sk if f(s))  # noqa: E731

    def pg(a):
        return f'<span class="pg">{pages.get(a, "")}</span>'

    o = [head(TITRE_GUIDE)]
    a = o.append
    a(f"""<div class="couv"><h1>{e(TITRE_GUIDE)}</h1>
<div class="sous">Chaque skill installé ou accessible : fonction, usages ELSATIA, déclenchement vérifié, commande, exemples, prérequis et état des tests.</div>
<div class="encadre"><b>Date :</b> {e(D.DATE)}<br><b>Environnement vérifié :</b> {e(D.ENVIRONNEMENT)}</div>
<div class="encadre"><b>État des PR :</b> {code(D.ETAT_PR)}</div>
<div class="encadre"><b>Bilan :</b> {len(sk)} skills — {compte(lambda s: s['statut'] == 'teste')} disponibles et testés,
{compte(lambda s: s['statut'] == 'non_teste')} installés non testés, {compte(lambda s: s['statut'] == 'bloque')} bloqués par un prérequis.
{compte(lambda s: s['origine'] in ('projet', 'projet_elsatia', 'plugin'))} d'entre eux ne sont disponibles <b>que sur la branche de la PR #6, non fusionnée</b>.</div>
<div class="encadre alerte"><b>Règles ELSATIA :</b> aucun skill ne publie sur les réseaux, ni ne se connecte à un compte social ou à la Production.
Données fictives pour toute démonstration, aucun secret dans une demande.</div></div>""")

    toc = [("lecture", "1. Comment lire ce guide", 1), ("recap", "2. Tableau récapitulatif", 1),
           ("classement", "3. Classement par mode de déclenchement", 1), ("dispo", "4. Disponibilité par environnement", 1),
           ("fiches", "5. Fiches détaillées par domaine", 1)]
    toc += [(f"dom-{k}", f"{n} ({len(par_dom[k])})", 2) for k, n in D.DOMAINES]
    toc += [("annexe-outils", "6. Plugins, connecteurs MCP et logiciels", 1),
            ("annexe-a", "Annexe A — Non installés : à installer, reportés, non retenus", 1),
            ("annexe-b", "Annexe B — Commandes intégrées non confirmées", 1),
            ("annexe-c", "Annexe C — Vérifications et blocages", 1)]
    a('<div class="section" id="sommaire"><h2>Sommaire</h2><ul class="toc">')
    for anc, t, lvl in toc:
        a(f'<li class="n{lvl}"><a href="#{anc}">{e(t)}</a><span class="pts"></span>{pg(anc)}</li>')
    a('</ul><h3>Index des fiches</h3><ul class="toc cols">')
    for k, _ in D.DOMAINES:
        for s in par_dom[k]:
            anc = "f-" + slug(s["nom"])
            a(f'<li class="n2"><a href="#{anc}">{e(s["nom"])}</a><span class="pts"></span>{pg(anc)}</li>')
    a("</ul></div>")

    # 1. lecture
    a('<div class="section" id="lecture"><h2>1. Comment lire ce guide</h2>')
    a("""<h3>Skill, plugin, connecteur, logiciel</h3><ul class="liste">
<li><b>Skill</b> : mode d'emploi (SKILL.md) que Claude charge pour une tâche. Appel manuel : <code>/nom</code>.</li>
<li><b>Plugin</b> : paquet pouvant contenir des skills, agents, hooks ou un connecteur. Ses skills s'appellent <code>/plugin:skill</code>.</li>
<li><b>Connecteur MCP</b> : accès à un service extérieur (documentation, GitHub). Ce n'est pas un skill.</li>
<li><b>Logiciel associé</b> : programme installé sur la machine (Playwright, ffmpeg, yt-dlp, Remotion, WhisperX).</li></ul>
<h3>Mode de déclenchement vérifié</h3><ul class="liste">
<li><span class="obs">Auto observé + manuel</span> : Claude a effectivement chargé le skill seul pendant un essai (appel de l'outil Skill constaté dans le journal).</li>
<li><b>Auto possible (non observé) + manuel</b> : la configuration le permet, mais Claude a répondu sans le charger lors de l'essai. Ce n'est <b>pas</b> un skill manuel.</li>
<li><b>Auto possible (non testé) + manuel</b> : la configuration le permet ; aucun essai de sélection automatique n'a été fait.</li>
<li><span class="manuel">Manuel uniquement</span> : prouvé par la configuration (<code>disable-model-invocation: true</code>) et par le refus de l'outil Skill.</li>
<li><span class="nc">Non confirmé</span> : comportement qui n'a pas pu être établi.</li></ul>
<div class="encadre alerte">La sélection automatique <b>n'est jamais garantie</b> : elle dépend de la formulation, de la configuration et de la session.
<b>Pour être sûr d'utiliser un skill, tapez sa commande.</b> Tous les skills « auto » acceptent aussi l'appel manuel.</div>
<h3>Disponibilité</h3><ul class="liste">
<li><span class="badge">PR #6 seulement</span> : présent sur la branche <code>claude/stoic-shannon-9ax0mp</code>, pas encore sur <code>main</code>.</li>
<li><span class="badge main">main</span> : déjà fusionné dans <code>main</code> (PR #5), donc aussi présent sur la branche.</li>
<li><span class="badge hors">Hors dépôt</span> : fourni par Claude Code ou par le compte claude.ai, indépendamment du dépôt.</li></ul></div>""")

    # 2. récap
    a('<div class="section large" id="recap"><h2>2. Tableau récapitulatif</h2>')
    for k, nom in D.DOMAINES:
        a(f"<h3>{e(nom)}</h3><table class='petit'><thead><tr><th style='width:15%'>Nom exact</th><th style='width:20%'>Fonction</th>"
          "<th style='width:14%'>Apps / activités</th><th style='width:12%'>Déclenchement vérifié</th><th style='width:16%'>Commande</th>"
          "<th style='width:10%'>Disponibilité</th><th style='width:8%'>Statut</th><th style='width:5%'>Fiche</th></tr></thead><tbody>")
        for s in par_dom[k]:
            anc = "f-" + slug(s["nom"])
            a(f"<tr><td><a href='#{anc}'><code>{e(s['nom'])}</code></a><br><span class='orig'>{e(ORIG_COURT[s['origine']])}</span></td>"
              f"<td>{code(s['fonction'])}</td><td>{code(s['apps'])}</td><td>{mode_html(s)}</td><td>{cmd_html(s['commande'])}</td>"
              f"<td>{badge(s)}</td><td class='{STATUT_CLS[s['statut']]}'>{e(STATUT[s['statut']])}</td><td>p.&nbsp;{pages.get(anc, '')}</td></tr>")
        a("</tbody></table>")
    a("</div>")

    # 3. classement
    a('<div class="section" id="classement"><h2>3. Classement par mode de déclenchement</h2>')
    groupes = [("obs", "3.1 Sélection automatique observée pendant un essai (appel manuel aussi possible)"),
               ("auto", "3.2 Sélection automatique possible, non observée ou non testée (appel manuel aussi possible)"),
               ("manuel", "3.3 Manuel uniquement (preuve de configuration)"),
               ("nc", "3.4 Déclenchement ou disponibilité à confirmer")]
    for key, titre in groupes:
        if key == "nc":
            lst = [s for s in sk if mode(s)[0] == "nc" or s["statut"] == "bloque"]
        else:
            lst = [s for s in sk if mode(s)[0] == key and not (key == "auto" and s["statut"] == "bloque")]
        a(f"<h3>{e(titre)} — {len(lst)}</h3><ul class='liste{' cols' if len(lst) > 8 else ''}'>")
        for s in lst:
            extra = ""
            if key == "nc":
                extra = f" — {e(STATUT[s['statut']])}"
            a(f"<li><a href='#f-{slug(s['nom'])}'>{e(s['nom'])}</a> : {cmd_html(s['commande'])}{extra}</li>")
        if key == "nc":
            a(f"<li>Commandes intégrées sans description vérifiée : {', '.join('<code>/' + e(c) + '</code>' for c in D.COMMANDES_NON_CONFIRMEES)} (annexe B).</li>")
        a("</ul>")
    a("</div>")

    # 4. dispo
    a('<div class="section large" id="dispo"><h2>4. Disponibilité par environnement</h2>')
    a("<table><thead><tr><th style='width:22%'>Élément</th><th>main</th><th>Branche PR #6</th><th>Session actuelle (cloud)</th><th>Nouvelle session cloud</th><th>Poste local</th></tr></thead><tbody>")
    for r in D.DISPO_ENV:
        a("<tr>" + "".join(f"<td>{code(x)}</td>" for x in r) + "</tr>")
    a("</tbody></table></div>")

    # 5. fiches
    a('<div class="section" id="fiches"><h2>5. Fiches détaillées par domaine</h2>')
    a("<p>Chaque fiche se termine par une demande prête à copier-coller. Les commandes proviennent de l'inventaire d'une session neuve ; les exemples utilisent des données fictives.</p>")
    for i, (k, nom) in enumerate(D.DOMAINES):
        a(f'<div class="{"section" if i else ""}" id="dom-{k}"><h2 style="margin-top:6pt">{e(nom)}</h2>')
        for s in par_dom[k]:
            anc = "f-" + slug(s["nom"])
            d = dispo(s)
            a(f'<div class="fiche" id="{anc}"><h3>{e(s["nom"])}</h3><div class="meta">{e(D.ORIGINES[s["origine"]])} · {badge(s)} · '
              f'<b>Statut :</b> <span class="{STATUT_CLS[s["statut"]]}">{e(STATUT[s["statut"]])}</span></div><dl>')
            rows = [("Fonction détaillée", s["sert"]), ("Usages et apps ELSATIA", s["apps"]), ("Quand l'utiliser", s["quand"]),
                    ("Ce que Claude peut faire", s["peut_faire"]), ("Déclenchement vérifié", mode(s)[1]),
                    ("Quand Claude le choisit", "Jamais seul." if s["declenchement"] == "manuel" else s["situations"]),
                    ("Observation", observe_txt(s)), ("Commande exacte", None), ("À fournir", s["fournir"]),
                    ("Résultat attendu", s["resultat"]), ("Prérequis, coûts, limites", s["limites"]),
                    ("Permissions et données transmises", s["permissions"]), ("Précautions", s["securite"]),
                    ("Disponibilité", f"main : {d['main']} · branche PR #6 : {d['branche']} · session actuelle : {d['session']} · nouvelle session : {d['nouvelle']}"),
                    ("État des tests", s["resultat_test"]), ("Exemple 1", s["ex1"]), ("Exemple 2", s["ex2"])]
            for t, v in rows:
                a(f"<dt>{e(t)}</dt><dd>{cmd_html(s['commande']) if v is None else code(v)}</dd>")
            a(f'</dl><div class="copie">{e(s["copier"])}</div></div>')
        a("</div>")
    a("</div>")

    # 6. outils
    a('<div class="section" id="annexe-outils"><h2>6. Plugins, connecteurs MCP et logiciels</h2>')
    a("<h3>Plugins (paquets) et skills qu'ils fournissent</h3><table><thead><tr><th style='width:22%'>Plugin</th><th style='width:16%'>Version</th><th>Contenu</th><th style='width:20%'>Disponibilité</th></tr></thead><tbody>")
    for p in D.PLUGINS:
        a(f"<tr><td><code>{e(p['nom'])}</code></td><td>{code(p['version'])}</td><td>{code(p['contenu'])}</td><td>{code(p['dispo'])}</td></tr>")
    a("</tbody></table><h3>Connecteurs MCP</h3><table><thead><tr><th style='width:18%'>Nom</th><th style='width:12%'>Statut</th><th>Rôle et état</th><th style='width:24%'>Données transmises</th><th style='width:20%'>Appel</th></tr></thead><tbody>")
    for m in D.MCP:
        a(f"<tr><td><code>{e(m['nom'])}</code></td><td class='{STATUT_CLS[m['statut']]}'>{e(STATUT[m['statut']])}</td><td>{code(m['role'])} {code(m['detail'])}</td><td>{code(m['donnees'])}</td><td>{code(m['appel'])}</td></tr>")
    a("</tbody></table><h3>Logiciels associés</h3><table><thead><tr><th style='width:20%'>Logiciel</th><th style='width:12%'>Statut</th><th style='width:20%'>Emplacement</th><th>Vérification</th><th style='width:22%'>Poste local</th></tr></thead><tbody>")
    for l in D.LOGICIELS:
        a(f"<tr><td>{e(l['nom'])}</td><td class='{STATUT_CLS[l['statut']]}'>{e(STATUT[l['statut']])}</td><td>{code(l['lieu'])}</td><td>{code(l['detail'])}</td><td>{code(l['local'])}</td></tr>")
    a("</tbody></table><div class='encadre alerte'>Les skills Instagram rédigent : ils ne sont pas connectés à un compte. Les skills Remotion sont des instructions : le moteur de rendu est un logiciel séparé, hors de l'application métier.</div></div>")

    # annexes
    a('<div class="section" id="annexe-a"><h2>Annexe A — Non installés : à installer, reportés, non retenus</h2>')
    a("<div class='encadre alerte'>Ces éléments <b>ne sont pas disponibles</b> et ne doivent pas être utilisés comme s'ils l'étaient.</div>")
    for key, titre in [("a_installer", "A.1 Restent à installer (après prérequis ou validation)"), ("reportes", "A.2 Reportés"), ("non_retenus", "A.3 Examinés et non retenus")]:
        a(f"<h3>{e(titre)}</h3><table><thead><tr><th style='width:32%'>Élément</th><th>Raison et prérequis</th></tr></thead><tbody>")
        for n, r in D.ANNEXE[key]:
            a(f"<tr><td>{code(n)}</td><td>{code(r)}</td></tr>")
        a("</tbody></table>")
    a("</div>")
    a('<div class="section" id="annexe-b"><h2>Annexe B — Commandes intégrées non confirmées</h2>'
      "<p>Ces commandes figurent dans l'inventaire des commandes slash d'une session neuve, mais pas dans la liste des skills que Claude peut choisir seul. "
      "Leur description n'était pas visible : leur fonction n'est <b>pas décrite</b>, pour ne rien inventer. Statut : <b>non confirmé</b>.</p><ul class='liste cols'>")
    a("".join(f"<li><code>/{e(c)}</code></li>" for c in D.COMMANDES_NON_CONFIRMEES))
    a("</ul></div>")
    a('<div class="section" id="annexe-c"><h2>Annexe C — Vérifications et blocages</h2>')
    for t, items in D.VERIFICATIONS:
        a(f"<h3>{e(t)}</h3><ul class='liste'>" + "".join(f"<li>{code(x)}</li>" for x in items) + "</ul>")
    a("</div></body></html>")
    return "\n".join(o)


# ======================================================================= AIDE-MÉMOIRE
def build_aide(pages=None):
    par_nom = {s["nom"]: s for s in D.SKILLS}
    o = [head(TITRE_AIDE)]
    a = o.append
    a(f"<h1>{e(TITRE_AIDE)}</h1><p style='margin-top:0'>{e(D.DATE)} — tapez la commande pour être sûr d'utiliser le skill. "
      "« Auto » signifie que Claude <i>peut</i> le choisir seul, sans garantie. "
      "<span class='badge'>PR #6</span> : disponible seulement sur la branche non fusionnée. "
      "<span class='badge main'>main</span> : déjà dans main. Sans badge : fourni par Claude Code ou le compte.</p>")
    for k, nom in D.AIDE_DOMAINES:
        a(f"<h3>{e(nom)}</h3><table class='petit'><thead><tr><th style='width:24%'>Besoin</th><th style='width:17%'>Skill</th>"
          "<th style='width:13%'>Automatique ou manuel</th><th style='width:20%'>Commande exacte</th><th>Exemple court</th></tr></thead><tbody>")
        for dom, besoin, nom_skill, ex in D.AIDE_MEMOIRE:
            if dom != k:
                continue
            s = par_nom[nom_skill]
            o_ = s["origine"]
            b = " <span class='badge'>PR #6</span>" if o_ in ("projet", "projet_elsatia", "plugin") else (" <span class='badge main'>main</span>" if o_ == "projet_pr5" else "")
            a(f"<tr><td>{code(besoin)}</td><td><code>{e(nom_skill)}</code>{b}</td><td>{mode_html(s)}</td>"
              f"<td>{cmd_html(s['commande'])}</td><td>{code(ex)}</td></tr>")
        a("</tbody></table>")
    a("<h3>Bloqués ou non installés — à ne pas utiliser</h3><table class='petit'><thead><tr><th style='width:30%'>Élément</th><th style='width:16%'>État</th><th>Raison</th></tr></thead><tbody>")
    for n, etat, r in D.AIDE_BLOQUES:
        a(f"<tr><td>{code(n)}</td><td>{e(etat)}</td><td>{code(r)}</td></tr>")
    a("</tbody></table>")
    a(f"<p class='orig'>Détails : « {e(TITRE_GUIDE)} ». Source : docs/claude/guide-pdf/skills_data.py.</p></body></html>")
    return "\n".join(o)


# ======================================================================= RENDU
def find_chrome(arg):
    for c in ([arg] if arg else []) + CHROMES:
        p = c if os.path.isabs(c) else shutil.which(c)
        if p and os.path.exists(p):
            return p
    sys.exit("Chrome/Chromium introuvable : utilisez --chrome CHEMIN")


def render(chrome, html_path, pdf_path):
    with tempfile.TemporaryDirectory() as prof:
        subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", f"--user-data-dir={prof}",
                        "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw", "--virtual-time-budget=5000",
                        f"--print-to-pdf={pdf_path}", "file://" + html_path],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def page_texts(pdf):
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
    return [subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", pdf, "-"], capture_output=True, text=True).stdout
            for i in range(1, n + 1)]


def locate(pdf):
    texts = page_texts(pdf)
    n = len(texts)
    pages = {}
    titres = {"lecture": "1. Comment lire ce guide", "recap": "2. Tableau récapitulatif", "classement": "3. Classement par mode",
              "dispo": "4. Disponibilité par environnement", "fiches": "5. Fiches détaillées par domaine",
              "annexe-outils": "6. Plugins, connecteurs MCP", "annexe-a": "Annexe A — Non installés",
              "annexe-b": "Annexe B — Commandes", "annexe-c": "Annexe C — Vérifications"}
    for anc, t in titres.items():
        for i in range(2, n):
            if t in texts[i]:
                pages[anc] = i + 1
                break
    debut = pages.get("fiches", 3) - 1
    for k, nom in D.DOMAINES:
        for i in range(debut, n):
            if re.search(r"^\s*" + re.escape(nom) + r"\s*$", texts[i], re.M):
                pages[f"dom-{k}"] = i + 1
                break
    for s in D.SKILLS:
        motif = re.compile(r"^\s*" + re.escape(s["nom"]) + r"\s*$", re.M)
        for i in range(debut, n):
            if motif.search(texts[i]):
                pages["f-" + slug(s["nom"])] = i + 1
                break
    return pages, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome")
    chrome = find_chrome(ap.parse_args().chrome)
    pages = {}
    for passe in range(4):
        with open(GUIDE_HTML, "w", encoding="utf-8") as f:
            f.write(build_guide(pages))
        render(chrome, GUIDE_HTML, GUIDE_PDF)
        nouvelles, n = locate(GUIDE_PDF)
        if nouvelles == pages:
            break
        pages = nouvelles
    manquantes = [s["nom"] for s in D.SKILLS if "f-" + slug(s["nom"]) not in pages]
    print(f"Guide : {os.path.relpath(GUIDE_PDF)} ({n} pages, {len(D.SKILLS)} fiches, passes : {passe + 1})")
    with open(AIDE_HTML, "w", encoding="utf-8") as f:
        f.write(build_aide())
    render(chrome, AIDE_HTML, AIDE_PDF)
    print(f"Aide-mémoire : {os.path.relpath(AIDE_PDF)} ({len(page_texts(AIDE_PDF))} pages)")
    if manquantes:
        sys.exit(f"Fiches non localisées : {manquantes}")


if __name__ == "__main__":
    main()
