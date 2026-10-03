#!/usr/bin/env python3
"""Génère le guide HTML puis le PDF « ELSATIA — Guide pratique des skills Claude ».

Usage (depuis la racine du dépôt) :
    python3 docs/claude/guide-pdf/build_guide.py [--chrome CHEMIN_CHROME]

Prérequis : python3, un Chrome/Chromium headless, pdftotext (poppler-utils).
Sorties :
    docs/claude/guide-pdf/guide.html                      (HTML intermédiaire)
    docs/claude/ELSATIA_Guide_pratique_skills_Claude.pdf  (PDF final)
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
sys.path.insert(0, ICI)
import skills_data as D  # noqa: E402

HTML_OUT = os.path.join(ICI, "guide.html")
PDF_OUT = os.path.join(os.path.dirname(ICI), "ELSATIA_Guide_pratique_skills_Claude.pdf")
CHROMES = [
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "chromium", "chromium-browser", "google-chrome",
]

DECL = {
    "auto": "Les deux : automatique possible et manuel",
    "manuel": "Manuel uniquement",
    "auto_sans_commande": "Automatique possible ; aucune commande vérifiée",
    "non_confirme": "Non confirmé",
}
STATUT = {"teste": "Disponible et testé", "non_teste": "Installé, non testé", "bloque": "Bloqué par un prérequis"}
ORIG_COURT = {"projet": "ajouté par cette mission", "projet_elsatia": "ELSATIA, créé par cette mission",
              "projet_pr5": "PR #5 — déjà installé", "plugin": "plugin ajouté par cette mission",
              "compte": "préexistant (compte)", "integre": "préexistant (intégré)", "utilisateur": "préexistant (conteneur)"}
STATUT_CLS = {"teste": "ok", "non_teste": "nt", "bloque": "ko"}


def e(t):
    return html.escape(str(t), quote=True)


def code(t):
    """Échappe et met en forme `code`."""
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", e(t))


def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def observe_court(s):
    o = s["observe"].lower()
    if s["declenchement"] == "manuel":
        return "Sans objet"
    if "automatique observée" in o:
        return "Observé à l'essai"
    if "non observée" in o:
        return "Non observé à l'essai"
    return "Non testé"


def commande_html(c):
    if c.startswith("/"):
        return f"<code>{e(c)}</code>"
    return code(c)


def build_html(pages=None):
    pages = pages or {}
    dom_nom = dict(D.DOMAINES)
    skills = D.SKILLS
    par_dom = {k: [s for s in skills if s["domaine"] == k] for k, _ in D.DOMAINES}
    n_teste = sum(s["statut"] == "teste" for s in skills)
    n_nt = sum(s["statut"] == "non_teste" for s in skills)
    n_ko = sum(s["statut"] == "bloque" for s in skills)

    def pg(anchor):
        return f'<span class="pg">{pages.get(anchor, "")}</span>'

    out = []
    a = out.append
    a(f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>ELSATIA — Guide pratique des skills Claude</title>
<style>
@page {{ size: A4; margin: 16mm 14mm 18mm 14mm;
  @bottom-left {{ content: "ELSATIA — Guide pratique des skills Claude"; font: 8pt sans-serif; color: #64748b; }}
  @bottom-right {{ content: "Page " counter(page) " / " counter(pages); font: 8pt sans-serif; color: #64748b; }} }}
@page large {{ size: A4 landscape; margin: 12mm 12mm 16mm 12mm; }}
@page couverture {{ @bottom-left {{ content: none; }} @bottom-right {{ content: none; }} }}
* {{ box-sizing: border-box; }}
body {{ font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif; font-size: 9.5pt; color: #0f172a; line-height: 1.42; margin: 0; }}
h1 {{ font-size: 20pt; color: #1e3a8a; margin: 0 0 8pt; }}
h2 {{ font-size: 15pt; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 3pt; margin: 0 0 10pt; break-after: avoid; }}
h3 {{ font-size: 11.5pt; color: #1e3a8a; margin: 14pt 0 5pt; break-after: avoid; }}
a {{ color: #1d4ed8; text-decoration: none; }}
code {{ font-family: "DejaVu Sans Mono", monospace; font-size: 8.3pt; background: #eef2ff; padding: 0 2pt; border-radius: 2pt; overflow-wrap: anywhere; }}
.section {{ break-before: page; }}
.large {{ page: large; }}
.couv {{ page: couverture; height: 255mm; display: flex; flex-direction: column; justify-content: center; }}
.couv h1 {{ font-size: 30pt; }}
.couv .sous {{ font-size: 13pt; color: #334155; margin-bottom: 18pt; }}
.encadre {{ border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4pt; padding: 7pt 9pt; margin: 8pt 0; break-inside: avoid; }}
.alerte {{ border-left: 4px solid #b45309; background: #fffbeb; }}
table {{ border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; table-layout: fixed; }}
th, td {{ border: 1px solid #cbd5e1; padding: 3pt 4pt; vertical-align: top; text-align: left; overflow-wrap: anywhere; word-break: normal; }}
th {{ background: #1e3a8a; color: #fff; font-weight: bold; }}
thead {{ display: table-header-group; }}
tr {{ break-inside: avoid; }}
.recap td, .recap th {{ font-size: 7.4pt; line-height: 1.3; }}
.ok {{ color: #166534; font-weight: bold; }} .nt {{ color: #92400e; font-weight: bold; }} .ko {{ color: #b91c1c; font-weight: bold; }}
.orig {{ color: #64748b; font-size: 6.8pt; }}
.toc {{ list-style: none; padding: 0; margin: 0; }}
.toc li {{ display: flex; align-items: baseline; padding: 1.3pt 0; }}
.toc li a {{ flex: 0 1 auto; }} .toc li .pts {{ flex: 1 1 auto; border-bottom: 1px dotted #94a3b8; margin: 0 4pt; transform: translateY(-3pt); }}
.toc li.n2 {{ padding-left: 14pt; font-size: 8.8pt; }}
.fiche {{ break-inside: avoid-page; border-top: 1px solid #cbd5e1; padding-top: 4pt; margin-top: 8pt; }}
.fiche h3 {{ margin-top: 4pt; }}
.fiche .meta {{ font-size: 8.3pt; color: #334155; margin-bottom: 4pt; }}
.fiche dl {{ display: grid; grid-template-columns: 34mm 1fr; gap: 2pt 6pt; margin: 0; }}
.fiche dt {{ font-weight: bold; color: #1e3a8a; font-size: 8.6pt; }}
.fiche dd {{ margin: 0; font-size: 8.8pt; }}
.copie {{ font-family: "DejaVu Sans Mono", monospace; font-size: 8.2pt; background: #0f172a; color: #e2e8f0; padding: 4pt 6pt; border-radius: 3pt; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 3pt; }}
ul.liste li {{ margin: 1.5pt 0; }}
.cols {{ columns: 2; column-gap: 10mm; }}
</style></head><body>
""")
    # ------------------------------------------------------------ couverture
    a(f"""<div class="couv"><h1>ELSATIA — Guide pratique des skills Claude</h1>
<div class="sous">Tous les skills installés et accessibles, ce qu'ils font, quand les utiliser, comment les appeler.</div>
<div class="encadre"><b>Date :</b> {e(D.DATE)}<br><b>Environnement vérifié :</b> {e(D.ENVIRONNEMENT)}</div>
<div class="encadre"><b>Bilan :</b> {len(skills)} skills recensés — {n_teste} disponibles et testés, {n_nt} installés non testés, {n_ko} bloqués par un prérequis.
Plus {len(D.MCP)} connecteurs MCP et {len(D.LOGICIELS)} logiciels associés, présentés à part.</div>
<div class="encadre alerte"><b>Règles ELSATIA :</b> aucun skill ne publie sur les réseaux, ni ne se connecte à un compte social ou à la Production.
Toujours utiliser des données fictives pour les démonstrations. Aucun secret dans une demande.</div></div>""")

    # ------------------------------------------------------------ sommaire
    toc = [("sommaire", "Sommaire", 1), ("lecture", "1. Comment lire ce guide", 1), ("recap", "2. Tableau récapitulatif", 1),
           ("classement", "3. Classement par mode de déclenchement", 1), ("fiches", "4. Fiches détaillées par domaine", 1)]
    for k, nom in D.DOMAINES:
        toc.append((f"dom-{k}", f"{nom} ({len(par_dom[k])})", 2))
    toc += [("mcp", "5. Connecteurs MCP et logiciels associés", 1), ("envs", "6. Cloud et poste local", 1),
            ("annexe", "Annexe A — Non installés : à installer, reportés, non retenus", 1),
            ("annexe-b", "Annexe B — Commandes intégrées non confirmées", 1), ("methode", "Annexe C — Méthode de vérification", 1)]
    a('<div class="section" id="sommaire"><h2>Sommaire</h2><ul class="toc">')
    for anc, titre, lvl in toc[1:]:
        a(f'<li class="n{lvl}"><a href="#{anc}">{e(titre)}</a><span class="pts"></span>{pg(anc)}</li>')
    a("</ul>")
    a('<h3>Index des fiches</h3><ul class="toc cols">')
    for k, _ in D.DOMAINES:
        for s in par_dom[k]:
            anc = "f-" + slug(s["nom"])
            a(f'<li class="n2"><a href="#{anc}">{e(s["nom"])}</a><span class="pts"></span>{pg(anc)}</li>')
    a("</ul></div>")

    # ------------------------------------------------------------ lecture
    a('<div class="section" id="lecture"><h2>1. Comment lire ce guide</h2>')
    a("""<div class="encadre"><b>Skill, plugin, connecteur, logiciel : quelle différence ?</b><ul class="liste">
<li><b>Skill</b> : un mode d'emploi (fichier SKILL.md) que Claude charge pour une tâche précise. Il s'appelle avec <code>/nom</code>.</li>
<li><b>Plugin</b> : un paquet qui peut contenir des skills, des agents, des hooks ou un connecteur. Ses skills s'appellent <code>/plugin:skill</code>.</li>
<li><b>Connecteur MCP</b> : un accès à un service extérieur (documentation, GitHub…). Ce n'est pas un skill (voir section 5).</li>
<li><b>Logiciel associé</b> : un programme installé sur la machine (Playwright, ffmpeg, yt-dlp, Remotion) dont certains skills ont besoin.</li></ul></div>""")
    a("<h3>Origine des skills</h3><table><thead><tr><th style='width:30%'>Origine</th><th>Signification</th><th style='width:12%'>Nombre</th></tr></thead><tbody>")
    for k, v in D.ORIGINES.items():
        a(f"<tr><td><code>{e(k)}</code></td><td>{e(v)}</td><td>{sum(s['origine'] == k for s in skills)}</td></tr>")
    a("</tbody></table>")
    a("""<h3>Mode de déclenchement</h3><ul class="liste">
<li><b>Les deux</b> : Claude <i>peut</i> choisir le skill seul (sa description correspond à votre demande), et vous pouvez toujours l'appeler avec sa commande.</li>
<li><b>Manuel uniquement</b> : le skill porte <code>disable-model-invocation: true</code>. Claude ne le choisit jamais seul.</li>
<li><b>Automatique possible ; aucune commande vérifiée</b> : visible pour Claude, mais absent de la liste des commandes slash. Demandez-le par une phrase.</li>
<li><b>Non confirmé</b> : le comportement n'a pas pu être établi.</li></ul>
<div class="encadre alerte">La sélection automatique <b>n'est jamais garantie</b>. Elle dépend de la formulation de la demande, de la configuration et de la session.
Pendant les essais, pour des questions courtes, Claude a souvent répondu directement sans charger le skill. La colonne « Observé » distingue un déclenchement
<i>réellement observé</i> d'un déclenchement seulement <i>possible</i>. <b>Pour être sûr d'utiliser un skill, tapez sa commande.</b></div></div>""")

    # ------------------------------------------------------------ récap
    a('<div class="section large" id="recap"><h2>2. Tableau récapitulatif</h2>')
    a("<p>Sont classés ici les skills installés et accessibles, par domaine. Les connecteurs MCP et les logiciels figurent en section 5, les éléments non installés en annexe A.</p>")
    for k, nom in D.DOMAINES:
        a(f"<h3>{e(nom)}</h3><table class='recap'><thead><tr>"
          "<th style='width:13%'>Nom exact</th><th style='width:14%'>Fonction</th><th style='width:12%'>Apps / activités ELSATIA</th>"
          "<th style='width:10%'>Déclenchement vérifié</th><th style='width:7%'>Observé</th><th style='width:17%'>Quand Claude le sélectionne</th>"
          "<th style='width:15%'>Commande manuelle</th><th style='width:8%'>Statut</th><th style='width:4%'>Fiche</th></tr></thead><tbody>")
        for s in par_dom[k]:
            anc = "f-" + slug(s["nom"])
            sit = "Jamais seul (manuel uniquement)." if s["declenchement"] == "manuel" else s["situations"]
            a(f"<tr><td><a href='#{anc}'><code>{e(s['nom'])}</code></a><br><span class='orig'>{e(ORIG_COURT[s['origine']])}</span></td><td>{code(s['fonction'])}</td><td>{code(s['apps'])}</td>"
              f"<td>{e(DECL[s['declenchement']])}</td><td>{e(observe_court(s))}</td><td>{code(sit)}</td><td>{commande_html(s['commande'])}</td>"
              f"<td class='{STATUT_CLS[s['statut']]}'>{e(STATUT[s['statut']])}</td><td>p.&nbsp;{pages.get(anc, '')}</td></tr>")
        a("</tbody></table>")
    a("</div>")

    # ------------------------------------------------------------ classement
    a('<div class="section" id="classement"><h2>3. Classement par mode de déclenchement</h2>')
    auto = [s for s in skills if s["declenchement"] in ("auto", "auto_sans_commande")]
    man = [s for s in skills if s["declenchement"] == "manuel"]
    nc = [s for s in skills if s["declenchement"] == "non_confirme" or s["statut"] == "bloque"]
    a("<h3>3.1 Skills que Claude peut sélectionner automatiquement</h3>")
    a("<p>Tous peuvent <b>aussi</b> être appelés manuellement avec leur commande, sauf ceux marqués « aucune commande vérifiée » (à demander par une phrase). "
      "<b>Observé</b> signale un déclenchement automatique constaté pendant les essais.</p><ul class='liste cols'>")
    for s in auto:
        tag = " — <b>observé</b>" if observe_court(s) == "Observé à l'essai" else ""
        cmd = commande_html(s["commande"]) if s["declenchement"] == "auto" else "<i>aucune commande vérifiée</i>"
        a(f"<li><a href='#f-{slug(s['nom'])}'>{e(s['nom'])}</a> : {cmd}{tag}</li>")
    a("</ul><h3>3.2 Skills à déclencher manuellement</h3><ul class='liste'>")
    for s in man:
        a(f"<li><a href='#f-{slug(s['nom'])}'>{e(s['nom'])}</a> : {commande_html(s['commande'])}</li>")
    a("</ul><h3>3.3 Skills dont le déclenchement ou la disponibilité reste à confirmer</h3><ul class='liste'>")
    for s in nc:
        a(f"<li><a href='#f-{slug(s['nom'])}'>{e(s['nom'])}</a> : {e(STATUT[s['statut']])} — {e(s['observe'])}</li>")
    a(f"<li>Commandes intégrées sans description vérifiée : {', '.join('<code>/' + e(c) + '</code>' for c in D.COMMANDES_NON_CONFIRMEES)} (<a href='#annexe-b'>annexe B</a>).</li>")
    a("<li>Connecteur <code>context7</code> : installé, mais bloqué par le réseau (<a href='#mcp'>section 5</a>).</li></ul></div>")

    # ------------------------------------------------------------ fiches
    a('<div class="section" id="fiches"><h2>4. Fiches détaillées par domaine</h2>')
    a("<p>Chaque fiche se termine par une demande prête à copier-coller. Les commandes indiquées ont été relevées dans l'inventaire de session. "
      "Les exemples utilisent des données fictives.</p>")
    first = True
    for k, nom in D.DOMAINES:
        a(f'<div class="{"" if first else "section"}" id="dom-{k}"><h2 style="margin-top:6pt">{e(nom)}</h2>')
        first = False
        for s in par_dom[k]:
            anc = "f-" + slug(s["nom"])
            a(f'<div class="fiche" id="{anc}"><h3>{e(s["nom"])}</h3>'
              f'<div class="meta">{e(D.ORIGINES[s["origine"]])} · <b>Déclenchement :</b> {e(DECL[s["declenchement"]])} · '
              f'<b>Statut :</b> <span class="{STATUT_CLS[s["statut"]]}">{e(STATUT[s["statut"]])}</span> · <b>Commande :</b> {commande_html(s["commande"])}</div><dl>')
            rows = [("À quoi il sert", s["sert"]), ("Quand l'utiliser", s["quand"]), ("Ce que Claude peut faire", s["peut_faire"]),
                    ("À fournir", s["fournir"]), ("Résultat attendu", s["resultat"]), ("Limites, prérequis, coûts", s["limites"]),
                    ("Permissions et données", s["permissions"]), ("Précautions de sécurité", s["securite"]),
                    ("Déclenchement observé", s["observe"]), ("Résultat de l'essai", s["resultat_test"]),
                    ("Exemple 1", s["ex1"]), ("Exemple 2", s["ex2"])]
            for t, v in rows:
                a(f"<dt>{e(t)}</dt><dd>{code(v)}</dd>")
            a(f'</dl><div class="copie">{e(s["copier"])}</div></div>')
        a("</div>")
    a("</div>")

    # ------------------------------------------------------------ MCP & logiciels
    a('<div class="section" id="mcp"><h2>5. Connecteurs MCP et logiciels associés</h2>')
    a("<p>Ce ne sont pas des skills. Ils donnent un accès ou un outil dont certains skills ont besoin.</p>")
    a("<h3>Connecteurs MCP</h3><table><thead><tr><th style='width:18%'>Nom</th><th style='width:14%'>Statut</th><th>Rôle et état</th><th style='width:24%'>Données transmises</th><th style='width:20%'>Appel</th></tr></thead><tbody>")
    for m in D.MCP:
        a(f"<tr><td><code>{e(m['nom'])}</code></td><td class='{STATUT_CLS[m['statut']]}'>{e(STATUT[m['statut']])}</td><td>{code(m['role'])} {code(m['detail'])}</td><td>{code(m['donnees'])}</td><td>{code(m['appel'])}</td></tr>")
    a("</tbody></table><h3>Logiciels associés</h3><table><thead><tr><th style='width:20%'>Logiciel</th><th style='width:12%'>Statut</th><th style='width:20%'>Emplacement</th><th>Vérification</th><th style='width:22%'>Sur poste local</th></tr></thead><tbody>")
    for l in D.LOGICIELS:
        a(f"<tr><td>{e(l['nom'])}</td><td class='{STATUT_CLS[l['statut']]}'>{e(STATUT[l['statut']])}</td><td>{code(l['lieu'])}</td><td>{code(l['detail'])}</td><td>{code(l['local'])}</td></tr>")
    a("</tbody></table>")
    a("<div class='encadre alerte'>Les skills Instagram rédigent : ils ne sont <b>pas</b> connectés à un compte Instagram. "
      "Les skills Remotion sont des instructions : le moteur de rendu est un logiciel séparé, à installer hors de l'application métier.</div></div>")

    # ------------------------------------------------------------ environnements
    a('<div class="section" id="envs"><h2>6. Cloud et poste local</h2><table><thead><tr><th style="width:24%">Élément</th><th>Cette session cloud</th><th>Nouvelle session cloud</th><th>Poste local</th></tr></thead><tbody>')
    envs = [
        ("Skills du dépôt (.claude/skills)", "Disponibles", "Disponibles sur cette branche, puis sur main après fusion", "Disponibles après git pull"),
        ("Plugins (.claude/settings.json)", "Installés", "Déclarés dans le projet ; installation automatique au démarrage non vérifiée. À défaut : claude plugin install <nom> --scope project", "Le marketplace peut s'appeler claude-plugins-official : /plugin install context7@claude-plugins-official, etc. (non testé)"),
        ("Skills du compte (anthropic-skills:*)", "Disponibles", "Disponibles (synchronisés avec le compte)", "Selon la synchronisation du compte (non vérifié)"),
        ("context7", "Bloqué par le réseau", "Bloqué tant que mcp.context7.com n'est pas autorisé", "Devrait fonctionner (non testé)"),
        ("watch (yt-dlp)", "Opérationnel", "Réinstaller : uv tool install yt-dlp==2026.8.19", "Installer python3, ffmpeg et yt-dlp"),
        ("Playwright / Chromium", "Préinstallés", "Préinstallés dans l'image", "npm i -g playwright@1.56.1 && npx playwright install chromium"),
        ("Rendu Remotion", "Essai réussi (hors dépôt)", "À recréer dans un dossier dédié", "Projet séparé ; licence Remotion"),
        ("Navigateur intégré, Chrome, computer-use", "Indisponibles", "Indisponibles", "Avec l'app Claude de bureau ou l'extension Chrome"),
    ]
    for r in envs:
        a("<tr>" + "".join(f"<td>{code(x)}</td>" for x in r) + "</tr>")
    a("</tbody></table></div>")

    # ------------------------------------------------------------ annexes
    a('<div class="section" id="annexe"><h2>Annexe A — Non installés : à installer, reportés, non retenus</h2>')
    a("<div class='encadre alerte'>Les éléments de cette annexe <b>ne sont pas disponibles</b>. Ils ne doivent pas être utilisés comme s'ils l'étaient.</div>")
    for key, titre in [("a_installer", "A.1 Restent à installer (après prérequis ou validation)"), ("reportes", "A.2 Reportés"), ("non_retenus", "A.3 Examinés et non retenus")]:
        a(f"<h3>{e(titre)}</h3><table><thead><tr><th style='width:32%'>Élément</th><th>Raison et prérequis</th></tr></thead><tbody>")
        for n, r in D.ANNEXE[key]:
            a(f"<tr><td>{code(n)}</td><td>{code(r)}</td></tr>")
        a("</tbody></table>")
    a("</div>")
    a('<div class="section" id="annexe-b"><h2>Annexe B — Commandes intégrées non confirmées</h2>')
    a("<p>Ces commandes figurent dans l'inventaire des commandes slash d'une session neuve, mais pas dans la liste des skills que Claude peut choisir seul. "
      "Leur description n'était pas visible : leur fonction n'est donc <b>pas décrite ici</b>, pour ne rien inventer. Statut : <b>non confirmé</b>.</p><ul class='liste cols'>")
    for c in D.COMMANDES_NON_CONFIRMEES:
        a(f"<li><code>/{e(c)}</code></li>")
    a("</ul></div>")
    a('<div class="section" id="methode"><h2>Annexe C — Méthode de vérification</h2><ul class="liste">'
      "<li>Inventaire : événement <code>init</code> d'une session neuve <code>claude -p</code> lancée dans le dépôt (skills, commandes slash, plugins, serveurs MCP), et lecture des en-têtes SKILL.md (<code>disable-model-invocation</code>).</li>"
      "<li>Essais : 40 sessions non interactives avec des données fictives. 27 demandes formulées naturellement ou par commande, 8 appels explicites complémentaires, puis 5 essais des skills de la PR #5. "
      "En mode non interactif, les écritures de fichiers et les commandes non autorisées sont refusées : aucun essai n'a modifié le dépôt.</li>"
      "<li>Déclenchement automatique « observé » : appel effectif de l'outil Skill constaté dans le journal de la session.</li>"
      "<li>Logiciels : Playwright (capture d'une page fictive), watch (vidéo fictive générée avec ffmpeg), Remotion (rendu MP4 1080×1920), scripts Python des skills (données fictives).</li>"
      "<li>Intégrité : contenu des plugins identique au commit audité. Provenance et empreintes des skills copiés : <code>.claude/skills/ELSATIA-SOURCES.lock.json</code> et, pour la PR #5, <code>skills-lock.json</code>.</li>"
      "<li>Source modifiable de ce guide : <code>docs/claude/guide-pdf/skills_data.py</code>. Régénération : <code>python3 docs/claude/guide-pdf/build_guide.py</code>.</li></ul></div>")
    a("</body></html>")
    return "\n".join(out)


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


def locate_pages(pdf_path):
    """Retrouve la page de chaque ancre grâce aux titres imprimés."""
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True).stdout).group(1))
    texts = [subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", pdf_path, "-"], capture_output=True, text=True).stdout for i in range(1, n + 1)]
    pages = {}
    titres = {"lecture": "1. Comment lire ce guide", "recap": "2. Tableau récapitulatif", "classement": "3. Classement par mode",
              "fiches": "4. Fiches détaillées par domaine", "mcp": "5. Connecteurs MCP et logiciels", "envs": "6. Cloud et poste local",
              "annexe": "Annexe A — Non installés", "annexe-b": "Annexe B — Commandes", "methode": "Annexe C — Méthode"}
    start = 3  # après la couverture et le sommaire
    for anc, t in titres.items():
        for i in range(start - 1, n):
            if t in texts[i]:
                pages[anc] = i + 1
                break
    for k, nom in D.DOMAINES:
        for i in range(pages.get("fiches", 3) - 1, n):
            if re.search(r"^\s*" + re.escape(nom) + r"\s*$", texts[i], re.M):
                pages[f"dom-{k}"] = i + 1
                break
    fiches_debut = pages.get("fiches", 3) - 1
    for s in D.SKILLS:
        motif = re.compile(r"^\s*" + re.escape(s["nom"]) + r"\s*$", re.M)
        for i in range(fiches_debut, n):
            if motif.search(texts[i]):
                pages["f-" + slug(s["nom"])] = i + 1
                break
    return pages, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome")
    args = ap.parse_args()
    chrome = find_chrome(args.chrome)
    pages = {}
    for passe in range(3):  # passes successives jusqu'à stabilité des numéros de page
        with open(HTML_OUT, "w", encoding="utf-8") as f:
            f.write(build_html(pages))
        render(chrome, HTML_OUT, PDF_OUT)
        nouvelles, n = locate_pages(PDF_OUT)
        if nouvelles == pages:
            break
        pages = nouvelles
    manquantes = [("f-" + slug(s["nom"])) for s in D.SKILLS if ("f-" + slug(s["nom"])) not in pages]
    print(f"PDF : {PDF_OUT} ({n} pages, {len(D.SKILLS)} fiches, passes : {passe + 1})")
    if manquantes:
        print("Ancres non localisées :", manquantes)
        sys.exit(1)


if __name__ == "__main__":
    main()
