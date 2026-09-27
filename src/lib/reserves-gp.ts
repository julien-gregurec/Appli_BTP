/*
 * Intégration Gestion Pro ↔ ELSATIA Réserves, côté Gestion Pro.
 *
 * Toutes les décisions (droits, idempotence, propriété des champs, versions de plan,
 * isolation des tenants) sont prises par la base : `reserves_synchroniser_chantier_gp`,
 * `reserves_confirmer_plan_gp`, `reserves_etat_chantier_gp` (migration 20260927000402).
 * Ce module ne fait que ce que la base ne peut pas faire elle-même : copier les octets d'un
 * plan du bucket Gestion Pro vers le bucket Réserves, SOUS LA SESSION de l'utilisateur
 * (les policies Storage des deux buckets jugent), puis mettre en forme ce que la fiche
 * chantier affiche. Aucune clé serveur n'est utilisée.
 */

export type EtatReservesChantier =
  | { lie: false; peutSynchroniser: boolean }
  | {
      lie: true;
      chantierReservesId: string;
      peutSynchroniser: boolean;
      total: number;
      ouvertes: number;
      enCours: number;
      attenteLevee: number;
      levees: number;
      enRetard: number;
      plansMajDisponible: number;
      synchroniseAt: string | null;
    };

export type CopiePlan = {
  planId: string;
  sourceChemin: string;
  destinationChemin: string;
  mimeType: string;
};

export type RapportSynchronisation = {
  chantierReservesId: string;
  cree: boolean;
  rattache: boolean;
  champsConserves: string[];
  entreprises: { creees: number; misesAJour: number; rattachees: number; autorise: boolean };
  contacts: { crees: number; misAJour: number; autorise: boolean };
  plans: { crees: number; misAJour: number; conflits: number; autorise: boolean };
  plansACopier: CopiePlan[];
};

type Erreur = { message: string } | null;
type Reponse<T> = PromiseLike<{ data: T | null; error: Erreur }>;

/** Sous-ensemble du client Supabase réellement utilisé : injectable dans les tests. */
export type ClientReservesGp = {
  rpc: (fonction: string, parametres: Record<string, unknown>) => Reponse<unknown>;
  storage: {
    from: (bucket: string) => {
      download: (chemin: string) => Reponse<Blob>;
      upload: (chemin: string, fichier: Blob, options: { contentType: string; upsert: boolean }) => Reponse<unknown>;
    };
  };
};

const BUCKET_GP = "chantier-documents";
const BUCKET_RESERVES = "reserves-plans";

function nombre(valeur: unknown): number {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function objet(valeur: unknown): Record<string, unknown> {
  return valeur && typeof valeur === "object" && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {};
}

/** Lecture défensive de `reserves_etat_chantier_gp` : `null` = pas de bloc à afficher. */
export function lireEtatReserves(donnees: unknown): EtatReservesChantier | null {
  if (!donnees || typeof donnees !== "object" || Array.isArray(donnees)) return null;
  const e = donnees as Record<string, unknown>;
  const peutSynchroniser = e.peut_synchroniser === true;
  if (e.lie !== true || typeof e.chantier_reserves_id !== "string") return { lie: false, peutSynchroniser };
  return {
    lie: true,
    chantierReservesId: e.chantier_reserves_id,
    peutSynchroniser,
    total: nombre(e.total),
    ouvertes: nombre(e.ouvertes),
    enCours: nombre(e.en_cours),
    attenteLevee: nombre(e.attente_levee),
    levees: nombre(e.levees),
    enRetard: nombre(e.en_retard),
    plansMajDisponible: nombre(e.plans_maj_disponible),
    synchroniseAt: typeof e.synchronise_at === "string" ? e.synchronise_at : null,
  };
}

export function lireRapportSynchronisation(donnees: unknown): RapportSynchronisation {
  const r = objet(donnees);
  if (typeof r.chantier_reserves_id !== "string") throw new Error("Réponse de synchronisation invalide");
  const ent = objet(r.entreprises);
  const ct = objet(r.contacts);
  const pl = objet(r.plans);
  const copies = Array.isArray(r.plans_a_copier) ? r.plans_a_copier : [];
  return {
    chantierReservesId: r.chantier_reserves_id,
    cree: r.cree === true,
    rattache: r.rattache === true,
    champsConserves: Array.isArray(r.champs_conserves) ? r.champs_conserves.filter((c): c is string => typeof c === "string") : [],
    entreprises: { creees: nombre(ent.creees), misesAJour: nombre(ent.mises_a_jour), rattachees: nombre(ent.rattachees), autorise: ent.autorise === true },
    contacts: { crees: nombre(ct.crees), misAJour: nombre(ct.mis_a_jour), autorise: ct.autorise === true },
    plans: { crees: nombre(pl.crees), misAJour: nombre(pl.mis_a_jour), conflits: nombre(pl.conflits), autorise: pl.autorise === true },
    plansACopier: copies.flatMap((c) => {
      const o = objet(c);
      return typeof o.plan_id === "string" && typeof o.source_chemin === "string"
        && typeof o.destination_chemin === "string" && typeof o.mime_type === "string"
        ? [{ planId: o.plan_id, sourceChemin: o.source_chemin, destinationChemin: o.destination_chemin, mimeType: o.mime_type }]
        : [];
    }),
  };
}

function dejaDepose(erreur: Erreur): boolean {
  return !!erreur && /already exists|duplicate|409/i.test(erreur.message);
}

/**
 * Copie chaque plan préparé par la base. Une copie ratée n'annule rien : le plan Réserves
 * garde son fichier précédent (ou reste « en attente »), et la prochaine synchronisation
 * redemande exactement la même copie — idempotent de bout en bout.
 */
export async function copierPlans(client: ClientReservesGp, copies: CopiePlan[]) {
  let reussies = 0;
  const echecs: string[] = [];
  for (const copie of copies) {
    try {
      const { data: fichier, error: erreurLecture } = await client.storage.from(BUCKET_GP).download(copie.sourceChemin);
      if (erreurLecture || !fichier) throw new Error("lecture");
      const { error: erreurDepot } = await client.storage.from(BUCKET_RESERVES)
        .upload(copie.destinationChemin, fichier, { contentType: copie.mimeType, upsert: false });
      if (erreurDepot && !dejaDepose(erreurDepot)) throw new Error("dépôt");
      const { error: erreurConfirmation } = await client.rpc("reserves_confirmer_plan_gp", {
        p_plan_id: copie.planId, p_chemin: copie.destinationChemin,
      });
      if (erreurConfirmation) throw new Error("confirmation");
      reussies += 1;
    } catch {
      echecs.push(copie.planId);
    }
  }
  return { reussies, echecs };
}

export async function synchroniserChantierReserves(client: ClientReservesGp, chantierGpId: string) {
  const { data, error } = await client.rpc("reserves_synchroniser_chantier_gp", { p_chantier_gp_id: chantierGpId });
  if (error) throw new Error(error.message);
  const rapport = lireRapportSynchronisation(data);
  const copies = await copierPlans(client, rapport.plansACopier);
  return { rapport, copies };
}

function pluriel(n: number, singulier: string, plurielForme: string) {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

const LIBELLES_CHAMPS: Record<string, string> = {
  nom: "nom", reference: "référence", adresse: "adresse", code_postal: "code postal", ville: "ville",
  client: "client", description: "description", date_debut: "date de début", date_fin_prevue: "date de fin",
};

/** Message court, sans jargon technique, affiché sur la fiche chantier après l'action. */
export function messageSynchronisation(
  rapport: RapportSynchronisation,
  copies: { reussies: number; echecs: string[] },
): string {
  const debut = rapport.cree
    ? "Chantier créé dans ELSATIA Réserves"
    : rapport.rattache
      ? "Chantier relié au chantier existant dans ELSATIA Réserves"
      : "Chantier mis à jour dans ELSATIA Réserves";
  const ajouts: string[] = [];
  const entreprises = rapport.entreprises.creees + rapport.entreprises.rattachees;
  if (entreprises) ajouts.push(pluriel(entreprises, "entreprise ajoutée", "entreprises ajoutées"));
  if (rapport.contacts.crees) ajouts.push(pluriel(rapport.contacts.crees, "contact ajouté", "contacts ajoutés"));
  if (copies.reussies) ajouts.push(pluriel(copies.reussies, "plan transmis", "plans transmis"));
  const phrases = [ajouts.length ? `${debut} : ${ajouts.join(", ")}.` : `${debut}.`];
  if (rapport.plans.conflits) {
    phrases.push(`${pluriel(rapport.plans.conflits, "plan a", "plans ont")} une nouvelle version dans Gestion Pro : ${rapport.plans.conflits > 1 ? "ils ont" : "il a"} été annoté ou utilisé dans Réserves et n’${rapport.plans.conflits > 1 ? "ont" : "a"} pas été remplacé${rapport.plans.conflits > 1 ? "s" : ""}.`);
  }
  if (copies.echecs.length) {
    phrases.push(`${pluriel(copies.echecs.length, "plan n’a", "plans n’ont")} pas pu être transmis : relancez la mise à jour.`);
  }
  if (rapport.champsConserves.length) {
    phrases.push(`Modifié dans Réserves, conservé : ${rapport.champsConserves.map((c) => LIBELLES_CHAMPS[c] ?? c).join(", ")}.`);
  }
  return phrases.join(" ");
}

export function urlChantierReserves(baseReserves: string | null, chantierReservesId: string): string | null {
  if (!baseReserves) return null;
  return `${baseReserves.replace(/\/+$/, "")}/chantiers/${encodeURIComponent(chantierReservesId)}`;
}

export function messageErreurSynchronisation(message: string): string {
  if (/côté Gestion Pro/i.test(message)) return "Vous n’avez pas accès à ce chantier dans Gestion Pro.";
  if (/côté Réserves|non autoris/i.test(message)) return "Votre rôle dans ELSATIA Réserves ne permet pas de gérer les chantiers.";
  if (/introuvable/i.test(message)) return "Chantier introuvable.";
  return "La transmission vers ELSATIA Réserves a échoué. Réessayez dans un instant.";
}
