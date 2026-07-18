export type AppareilCompteActif = {
  utilisateur_id: string;
};

export type EmployeCompteFacturable = {
  utilisateur_id: string | null;
  prenom: string | null;
  nom: string | null;
  poste_id: string | null;
  compte_application_statut: string | null;
};

export type PosteCompteTarife = {
  id: string;
  nom: string;
  tarif_compte_mensuel: number | string | null;
};

export type DepassementAppareilsFacturable = {
  utilisateurId: string;
  nom: string;
  posteNom: string;
  nbAppareils: number;
  supplementMensuelHt: number;
};

/**
 * Calcule les comptes salariés réellement facturables qui dépassent la limite
 * de deux appareils actifs. Les appareils orphelins, les comptes fermés et les
 * fiches sans utilisateur ne doivent jamais déclencher d'alerte client.
 */
export function calculerDepassementsAppareilsFacturables(params: {
  appareils: AppareilCompteActif[];
  employes: EmployeCompteFacturable[];
  postes: PosteCompteTarife[];
}): DepassementAppareilsFacturable[] {
  const employesFacturables = new Map(
    params.employes
      .filter((employe) =>
        Boolean(employe.utilisateur_id)
        && ["actif", "pause"].includes(employe.compte_application_statut ?? ""),
      )
      .map((employe) => [employe.utilisateur_id as string, employe]),
  );
  const postes = new Map(params.postes.map((poste) => [poste.id, poste]));
  const nombres = new Map<string, number>();

  for (const appareil of params.appareils) {
    if (!employesFacturables.has(appareil.utilisateur_id)) continue;
    nombres.set(appareil.utilisateur_id, (nombres.get(appareil.utilisateur_id) ?? 0) + 1);
  }

  return [...nombres.entries()]
    .filter(([, nbAppareils]) => nbAppareils > 2)
    .map(([utilisateurId, nbAppareils]) => {
      const employe = employesFacturables.get(utilisateurId)!;
      const poste = employe.poste_id ? postes.get(employe.poste_id) : undefined;
      return {
        utilisateurId,
        nom: [employe.prenom, employe.nom].filter(Boolean).join(" ") || "Salarié",
        posteNom: poste?.nom ?? "Poste non renseigné",
        nbAppareils,
        supplementMensuelHt: Math.max(0, Number(poste?.tarif_compte_mensuel ?? 0)),
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}
