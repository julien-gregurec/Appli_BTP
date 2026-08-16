import type { OffreTarifaire } from "@/lib/tarification";

export const TYPES_COMPTES_TARIFAIRES = ["administratif", "chef_equipe", "terrain"] as const;
export type TypeCompteTarifaire = (typeof TYPES_COMPTES_TARIFAIRES)[number];

export const TARIFS_COMPTES_SUPPLEMENTAIRES = {
  administratif: { libelle: "Administratif", prixMensuelHt: 15 },
  chef_equipe: { libelle: "Chef d’équipe", prixMensuelHt: 9 },
  terrain: { libelle: "Terrain", prixMensuelHt: 5 },
} as const satisfies Record<TypeCompteTarifaire, { libelle: string; prixMensuelHt: number }>;

export type RepartitionComptesTarifaires = Record<TypeCompteTarifaire, number>;

export type PosteCompteTarifaire = {
  id: string;
  nom: string;
  code_offre?: string | null;
  tarif_compte_mensuel?: number | string | null;
};

export type EmployeCompteTarifaire = {
  poste_id: string | null;
  compte_application_statut: string | null;
};

const REPARTITION_VIDE: RepartitionComptesTarifaires = {
  administratif: 0,
  chef_equipe: 0,
  terrain: 0,
};

export function typeCompteTarifaireDepuisPoste(
  poste: Omit<PosteCompteTarifaire, "id"> | null | undefined,
): TypeCompteTarifaire {
  const code = String(poste?.code_offre ?? "").trim().toLowerCase();
  if (["compte_administratif", "administratif"].includes(code)) return "administratif";
  if (["compte_chef_equipe", "chef_equipe"].includes(code)) return "chef_equipe";
  if (["compte_terrain", "terrain"].includes(code)) return "terrain";

  const tarif = Number(poste?.tarif_compte_mensuel ?? 0);
  if (tarif === TARIFS_COMPTES_SUPPLEMENTAIRES.administratif.prixMensuelHt) return "administratif";
  if (tarif === TARIFS_COMPTES_SUPPLEMENTAIRES.chef_equipe.prixMensuelHt) return "chef_equipe";
  if (tarif === TARIFS_COMPTES_SUPPLEMENTAIRES.terrain.prixMensuelHt) return "terrain";

  const nom = String(poste?.nom ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/admin|gerant|direction|directeur|comptab|rh|ressources humaines/.test(nom)) return "administratif";
  if (/chef|conducteur|responsable travaux/.test(nom)) return "chef_equipe";
  return "terrain";
}

export function calculerRepartitionComptesFacturables(params: {
  employes: EmployeCompteTarifaire[];
  postes: PosteCompteTarifaire[];
}): RepartitionComptesTarifaires {
  const postes = new Map(params.postes.map((poste) => [poste.id, poste]));
  return params.employes
    .filter((employe) => ["actif", "pause"].includes(employe.compte_application_statut ?? ""))
    .reduce<RepartitionComptesTarifaires>((repartition, employe) => {
      const type = typeCompteTarifaireDepuisPoste(employe.poste_id ? postes.get(employe.poste_id) : null);
      repartition[type] += 1;
      return repartition;
    }, { ...REPARTITION_VIDE });
}

export function calculerSupplementsComptes(
  repartitionBrute: Partial<RepartitionComptesTarifaires>,
  offre: Pick<OffreTarifaire, "cle" | "comptesInclus" | "administrateursInclus" | "devisObligatoire">,
) {
  const repartition: RepartitionComptesTarifaires = {
    administratif: Math.max(0, Math.floor(repartitionBrute.administratif ?? 0)),
    chef_equipe: Math.max(0, Math.floor(repartitionBrute.chef_equipe ?? 0)),
    terrain: Math.max(0, Math.floor(repartitionBrute.terrain ?? 0)),
  };
  const inclus: RepartitionComptesTarifaires = { ...REPARTITION_VIDE };

  if (offre.devisObligatoire) {
    return {
      repartition,
      inclus,
      supplementaires: { ...REPARTITION_VIDE },
      totalComptes: Object.values(repartition).reduce((total, valeur) => total + valeur, 0),
      totalSupplementaires: 0,
      montantMensuelHt: 0,
    };
  }

  if (offre.cle === "entreprise") {
    const quotaAdministratif = Math.max(0, offre.administrateursInclus ?? 10);
    const quotaSalaries = Math.max(0, offre.comptesInclus - quotaAdministratif);
    inclus.administratif = Math.min(repartition.administratif, quotaAdministratif);
    let restantSalaries = quotaSalaries;
    inclus.chef_equipe = Math.min(repartition.chef_equipe, restantSalaries);
    restantSalaries -= inclus.chef_equipe;
    inclus.terrain = Math.min(repartition.terrain, restantSalaries);
  } else {
    let restant = Math.max(0, offre.comptesInclus);
    for (const type of TYPES_COMPTES_TARIFAIRES) {
      inclus[type] = Math.min(repartition[type], restant);
      restant -= inclus[type];
    }
  }

  const supplementaires: RepartitionComptesTarifaires = {
    administratif: repartition.administratif - inclus.administratif,
    chef_equipe: repartition.chef_equipe - inclus.chef_equipe,
    terrain: repartition.terrain - inclus.terrain,
  };
  const totalComptes = Object.values(repartition).reduce((total, valeur) => total + valeur, 0);
  const totalSupplementaires = Object.values(supplementaires).reduce((total, valeur) => total + valeur, 0);
  const montantMensuelHt = TYPES_COMPTES_TARIFAIRES.reduce(
    (total, type) => total + supplementaires[type] * TARIFS_COMPTES_SUPPLEMENTAIRES[type].prixMensuelHt,
    0,
  );

  return { repartition, inclus, supplementaires, totalComptes, totalSupplementaires, montantMensuelHt };
}
