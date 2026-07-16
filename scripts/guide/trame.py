"""Trame commune à tous les chapitres de module.

Chaque module est décrit par un dictionnaire (voir modules.py) et mis en page
par `chapitre()`. Toutes les sections sont facultatives : un module sans
document imprimé n'aura simplement pas cette partie.

Ordre imposé, identique partout, pour qu'un lecteur s'y retrouve d'un chapitre
à l'autre :
    1. À quoi ça sert        6. Statuts et cycle de vie
    2. Qui y a accès         7. Le document imprimé
    3. L'écran principal     8. Sur mobile
    4. Créer pas à pas       9. Liens avec les autres modules
    5. La fiche             10. Erreurs fréquentes
"""
from reportlab.lib.units import cm
from generer_manuel import (Titre, capture, encadre, etapes, p, saut_de_chapitre,
                            section, tableau, titre)


def chapitre(m):
    b = [Titre(m["titre"], 1), p(m["chapo"], "chapo")]

    if m.get("droits"):
        b += titre("Qui y a accès", 2)
        if m.get("droits_intro"):
            b += [p(m["droits_intro"])]
        b += tableau(["Droit", "Ce qu'il permet"],
                     [[f"<b>{c}</b>", d] for c, d in m["droits"]], [4.5 * cm, 11.9 * cm])

    if m.get("note_droits"):
        b += encadre(*m["note_droits"])

    if m.get("liste"):
        img, leg = m["liste"]
        b += section("L'écran principal", 2, capture(img, leg))
        if m.get("intro_liste"):
            b += [p(m["intro_liste"])]
        if m.get("colonnes"):
            b += tableau(["Colonne", "Ce qu'elle contient"], m["colonnes"], [3.6 * cm, 12.8 * cm])

    if m.get("formulaire"):
        img, leg = m["formulaire"]
        b += section(m.get("titre_creer", "Créer pas à pas"), 2, capture(img, leg))
    elif m.get("titre_creer"):
        b += titre(m["titre_creer"], 2)
    if m.get("etapes"):
        b += etapes(m["etapes"])

    if m.get("champs"):
        b += titre("Le détail des champs", 3) + [
            p("Les champs marqués comme obligatoires doivent être renseignés pour enregistrer.")]
        b += tableau(["Champ", "Rôle", "Remarque"], m["champs"], [3.2 * cm, 7.2 * cm, 6 * cm])

    if m.get("statuts"):
        b += titre("Le cycle de vie", 2) + [
              p(m.get("intro_statuts",
                      "Chaque statut décrit où en est le dossier et déclenche des effets ailleurs "
                      "dans le logiciel."))]
        b += tableau(["Statut", "Ce que ça signifie", "Ce que ça déclenche"], m["statuts"],
                     [2.8 * cm, 6.4 * cm, 7.2 * cm])

    if m.get("note"):
        b += encadre(*m["note"])

    if m.get("fiche"):
        img, leg = m["fiche"]
        b += section("La fiche en détail", 2, capture(img, leg))

    if m.get("impression"):
        img, leg = m["impression"]
        b += titre("Le document imprimé", 2) + [p(m["impression_texte"])]
        b += capture(img, leg, hauteur_max=9.5 * cm, rogner=True)

    if m.get("mobile"):
        img, leg = m["mobile"]
        b += section("Sur mobile", 2, [p(m["mobile_texte"])] + capture(img, leg, hauteur_max=8.5 * cm))

    if m.get("liens"):
        b += titre("Liens avec les autres modules", 2)
        b += tableau(["Module", "Ce qui circule"], m["liens"], [3.6 * cm, 12.8 * cm])

    if m.get("erreurs"):
        b += titre("Erreurs fréquentes", 2)
        b += tableau(["Symptôme", "Cause probable", "Solution"], m["erreurs"],
                     [4 * cm, 5.6 * cm, 6.8 * cm])

    b += [saut_de_chapitre()]
    return b
