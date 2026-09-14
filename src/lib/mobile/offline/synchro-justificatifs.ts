"use client";

/**
 * Transmission d'une note de frais préparée hors ligne AVEC ses justificatifs.
 *
 * Réserve R3. L'ordre est imposé par la politique de stockage : le bucket `notes-frais`
 * n'accepte un fichier que sous une note qui existe déjà. D'où trois temps, et une règle :
 * rien n'est déclaré « transmis » avant le dernier.
 *
 *   1. la note est créée en `brouillon` par la route de rejeu (idempotente sur sa clé
 *      primaire, fournie par l'appareil) ;
 *   2. chaque fichier est d'abord VÉRIFIÉ (déjà déposé ?) puis, s'il ne l'est pas, déposé par
 *      la route de dépôt existante — unique chemin d'import des pièces ;
 *   3. l'opération n'est close que lorsque tous les fichiers sont acquittés. Les fichiers ne
 *      quittent l'appareil qu'à ce moment.
 *
 * Toute interruption — coupure, fermeture de l'application, session expirée — laisse
 * l'opération reprenable là où elle s'est arrêtée : l'état se DÉDUIT de ce qui est vrai
 * (note créée ? fichiers déposés ?), il n'est jamais déclaré d'avance.
 */
import { classerReponseDepot, etapeDeduite, fichiersADeposer, type Etape } from "@/lib/mobile/offline/justificatifs";
import { changerEtat, effacerJustificatifs, lireJustificatifs, marquerJustificatifDepose, type IdentiteBase } from "@/lib/mobile/offline/base-locale";
import { reponseEstPerteDeSession, type MutationLocale } from "@/lib/mobile/offline/contrat";

export type IssueTransmission = { etape: Etape; motif?: string };

async function noteExisteCoteServeur(mutation: MutationLocale): Promise<"creee" | "a_creer" | "refus" | "indisponible"> {
  let reponse: Response;
  try {
    reponse = await fetch("/api/mobile/offline/mutations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mutations: [{ ...mutation, type: "note_frais_brouillon" }] }),
    });
  } catch {
    return "indisponible";
  }
  // Session perdue : le proxy a redirigé vers /login et `fetch` a reçu du HTML en 200.
  // Ce n'est ni un refus ni une création — on attend la reconnexion.
  if (reponseEstPerteDeSession({ status: reponse.status, redirected: reponse.redirected, contentType: reponse.headers.get("content-type") })) {
    return "indisponible";
  }
  if (!reponse.ok) return "indisponible";
  let issue: string | undefined;
  try {
    const { resultats } = (await reponse.json()) as { resultats: { issue: string; motif?: string }[] };
    issue = resultats?.[0]?.issue;
  } catch {
    return "indisponible";
  }
  // `applique` et `rejeu` disent la même chose : la note existe maintenant côté serveur.
  if (issue === "applique" || issue === "rejeu") return "creee";
  if (issue === "refus" || issue === "conflit") return "refus";
  return "indisponible";
}

async function dejaDepose(identite: IdentiteBase, noteId: string, empreinte: string): Promise<{ present: boolean; documentId: string | null } | null> {
  const parametres = new URLSearchParams({
    note_id: noteId, empreinte, entreprise_id: identite.entrepriseId, utilisateur_id: identite.utilisateurId,
  });
  try {
    const reponse = await fetch(`/api/mobile/offline/justificatif-present?${parametres}`);
    if (!reponse.ok) return null;
    return (await reponse.json()) as { present: boolean; documentId: string | null };
  } catch {
    return null;
  }
}

/**
 * Transmet UNE note avec ses fichiers. Renvoie l'étape atteinte, qui est aussi ce que
 * l'utilisateur voit.
 */
export async function transmettreNoteAvecJustificatifs(
  base: IDBDatabase,
  identite: IdentiteBase,
  mutation: MutationLocale,
  typeDocument: string,
): Promise<IssueTransmission> {
  // Refus absolu d'envoyer sous une autre identité, vérifié ICI aussi — la route le vérifie,
  // la RLS le vérifie, mais aucun octet de A ne doit même partir sous la session de B.
  if (mutation.entrepriseId !== identite.entrepriseId || mutation.utilisateurId !== identite.utilisateurId) {
    return { etape: "conflit", motif: "Préparée sous un autre compte : elle ne partira pas depuis celui-ci." };
  }

  const note = await noteExisteCoteServeur(mutation);
  if (note === "indisponible") {
    const fichiers = await lireJustificatifs(base, mutation.id);
    return { etape: etapeDeduite(false, fichiers.map((f) => ({ id: f.id, empreinte: f.empreinte, depose: f.depose }))) };
  }
  if (note === "refus") {
    await changerEtat(base, mutation.id, "conflit", "La note a été refusée par le serveur.");
    return { etape: "conflit", motif: "La note a été refusée par le serveur." };
  }

  // La note existe désormais côté serveur — en brouillon, donc explicitement incomplète.
  const fichiers = await lireJustificatifs(base, mutation.id);

  for (const fichier of fichiersADeposer(fichiers.map((f) => ({ id: f.id, empreinte: f.empreinte, depose: f.depose })))) {
    const complet = fichiers.find((f) => f.id === fichier.id)!;

    // Idempotence : si ce fichier est déjà sous cette note, le dépôt a eu lieu — on ne le
    // refait pas. Sans ce contrôle, un dépôt dont la réponse s'est perdue serait refait, et la
    // note porterait deux fois la même pièce.
    const presence = await dejaDepose(identite, mutation.id, complet.empreinte);
    if (presence === null) return { etape: "envoi_justificatif", motif: "Vérification du justificatif impossible pour le moment." };
    if (presence.present) {
      await marquerJustificatifDepose(base, complet.id, presence.documentId);
      continue;
    }

    const formulaire = new FormData();
    formulaire.set("note_id", mutation.id);
    formulaire.set("type_document", typeDocument);
    // La route exige que l'utilisateur ait confirmé que le document est visible en entier :
    // c'est lui qui l'a affirmé à la capture, sur l'appareil.
    formulaire.set("document_entier", "1");
    formulaire.append("fichiers", new File([complet.contenu], complet.nom, { type: complet.mime }));

    let reponse: Response;
    try {
      reponse = await fetch("/api/notes-frais/upload", { method: "POST", body: formulaire });
    } catch {
      return { etape: "envoi_justificatif", motif: "Coupure pendant l’envoi : il reprendra au retour du réseau." };
    }

    // ── Le point le plus sensible de R3 ────────────────────────────────────────────
    //
    // Si la session expire entre le contrôle de présence et le dépôt, le proxy redirige vers
    // /login et `fetch` reçoit une page HTML avec un statut 200. Lu sur le seul statut, cela
    // passait pour « déposé » : le fichier aurait été marqué envoyé, puis EFFACÉ de l'appareil
    // sans jamais être parti — la perte silencieuse exacte que R3 doit interdire.
    //
    // Un dépôt ne compte donc que sur une réponse JSON, non redirigée, qui dit `success: true`.
    if (reponseEstPerteDeSession({ status: reponse.status, redirected: reponse.redirected, contentType: reponse.headers.get("content-type") })) {
      return { etape: "envoi_justificatif", motif: "Reconnectez-vous pour terminer l’envoi." };
    }
    const classement = classerReponseDepot(reponse.status);
    if (classement === "depose") {
      let corps: { success?: boolean; documentId?: string } = {};
      try { corps = (await reponse.json()) as typeof corps; } catch { corps = {}; }
      if (corps.success !== true) {
        // Réponse inattendue : on ne déclare RIEN. La prochaine reprise commencera par
        // vérifier la présence du fichier — s'il est bien arrivé, ce sera un rejeu.
        return { etape: "envoi_justificatif", motif: "Réponse de dépôt inattendue : vérification à la prochaine reprise." };
      }
      await marquerJustificatifDepose(base, complet.id, corps.documentId ?? null);
      continue;
    }
    if (classement === "conflit") {
      await changerEtat(base, mutation.id, "conflit", "La note n’accepte plus de justificatif.");
      return { etape: "conflit", motif: "La note n’accepte plus de justificatif (validée ou verrouillée)." };
    }
    if (classement === "a_corriger") {
      await changerEtat(base, mutation.id, "echec", `« ${complet.nom} » a été refusé par le serveur.`);
      return { etape: "a_corriger", motif: `« ${complet.nom} » a été refusé : remplacez-le.` };
    }
    // Session expirée ou panne : on s'arrête sans rien perdre. Tout reprendra.
    return { etape: "envoi_justificatif", motif: classement === "attente_session" ? "Reconnectez-vous pour terminer l’envoi." : undefined };
  }

  // Tous les fichiers sont acquittés : alors, et seulement alors, l'opération est close et les
  // fichiers peuvent quitter l'appareil.
  const apres = await lireJustificatifs(base, mutation.id);
  const etape = etapeDeduite(true, apres.map((f) => ({ id: f.id, empreinte: f.empreinte, depose: f.depose })));
  if (etape === "synchronise") {
    await changerEtat(base, mutation.id, "synchronise");
    await effacerJustificatifs(base, mutation.id);
  }
  return { etape };
}
