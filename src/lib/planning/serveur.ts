import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { possedeDroitFin } from "@/lib/droits-devis";
import { instant, type Conflit, type Disponibilite, type Equipe, type Evenement, type Ressource, type Salarie, type StatutEvenement, type TypeEvenement } from "@/lib/planning/modele";

export type DonneesPlanningV2 = {
  evenements: Evenement[];
  conflits: Conflit[];
  salaries: Salarie[];
  equipes: Equipe[];
  ressources: Ressource[];
  chantiers: Array<{ id: string; nom: string; clientId: string | null; adresse: string | null }>;
  clients: Array<{ id: string; nom: string }>;
  disponibilites: Disponibilite[];
  droits: { gerer: boolean; affecter: boolean };
  permissions: string[] | null;
};

const nom = (c: Record<string, unknown>) => (typeof c.societe === "string" && c.societe) || [c.prenom, c.nom].filter(Boolean).join(" ") || "Client";

/** Planning v2 sur une plage de jours (« AAAA-MM-JJ »), sous la RLS de l'utilisateur. */
export async function chargerPlanningV2(supabase: SupabaseClient, ctx: ContexteEntreprise, jours: string[]): Promise<DonneesPlanningV2> {
  const debut = instant(jours[0], 0);
  const fin = instant(jours[jours.length - 1], 1440);
  const permissions = await permissionsUtilisateur(ctx);
  const [{ data: evenements }, { data: affectations }, { data: employes }, { data: equipes }, { data: membres }, { data: ressources }, { data: chantiers }, { data: clients }, { data: dispos }, { data: conflits }] = await Promise.all([
    supabase.from("planning_evenements").select("id, titre, type, statut, debut, fin, journee_entiere, couleur, chantier_id, client_id, adresse, notes")
      .eq("entreprise_id", ctx.entrepriseId).lt("debut", fin).gt("fin", debut).order("debut"),
    supabase.from("planning_affectations").select("evenement_id, employe_id, equipe_id, ressource_id").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("employes").select("id, prenom, nom, statut").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    supabase.from("equipes").select("id, nom, couleur, actif").eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("nom"),
    supabase.from("equipes_membres").select("equipe_id, employe_id").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("planning_ressources").select("id, type, nom, couleur, actif").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    supabase.from("chantiers").select("id, nom, client_id, adresse, ville, statut").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    supabase.from("clients").select("id, nom, prenom, societe").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    supabase.from("planning_disponibilites").select("employe_id, jour_semaine, debut, fin").eq("entreprise_id", ctx.entrepriseId),
    supabase.rpc("conflits_planning", { p_entreprise_id: ctx.entrepriseId, p_debut: debut, p_fin: fin }),
  ]);
  const parEvenement = new Map<string, Evenement["affectations"]>();
  for (const a of (affectations ?? []) as Array<Record<string, string | null>>) {
    const liste = parEvenement.get(String(a.evenement_id)) ?? [];
    liste.push({ employeId: a.employe_id ?? null, equipeId: a.equipe_id ?? null, ressourceId: a.ressource_id ?? null });
    parEvenement.set(String(a.evenement_id), liste);
  }
  return {
    evenements: ((evenements ?? []) as Array<Record<string, unknown>>).map((e) => ({
      id: String(e.id), titre: String(e.titre), type: String(e.type) as TypeEvenement, statut: String(e.statut) as StatutEvenement,
      debut: new Date(String(e.debut)).toISOString(), fin: new Date(String(e.fin)).toISOString(), journeeEntiere: e.journee_entiere === true,
      couleur: (e.couleur as string | null) ?? null, chantierId: (e.chantier_id as string | null) ?? null, clientId: (e.client_id as string | null) ?? null,
      adresse: (e.adresse as string | null) ?? null, notes: (e.notes as string | null) ?? null, affectations: parEvenement.get(String(e.id)) ?? [],
    })),
    conflits: ((conflits ?? []) as Array<Record<string, unknown>>).map((c) => ({ evenementId: String(c.evenement_id), type: String(c.type_conflit) as Conflit["type"], sujetId: String(c.sujet_id), detail: String(c.detail) })),
    salaries: ((employes ?? []) as Array<Record<string, unknown>>).map((s) => ({ id: String(s.id), nom: [s.prenom, s.nom].filter(Boolean).join(" ") || "Salarié", actif: s.statut === "actif" })),
    equipes: ((equipes ?? []) as Array<Record<string, unknown>>).map((q) => ({
      id: String(q.id), nom: String(q.nom), couleur: (q.couleur as string | null) ?? null,
      membres: ((membres ?? []) as Array<{ equipe_id: string; employe_id: string }>).filter((m) => m.equipe_id === q.id).map((m) => m.employe_id),
    })),
    ressources: ((ressources ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), type: String(r.type) as Ressource["type"], nom: String(r.nom), couleur: (r.couleur as string | null) ?? null, actif: r.actif !== false })),
    chantiers: ((chantiers ?? []) as Array<Record<string, unknown>>).filter((c) => !["termine", "annule", "archive"].includes(String(c.statut)))
      .map((c) => ({ id: String(c.id), nom: String(c.nom), clientId: (c.client_id as string | null) ?? null, adresse: [c.adresse, c.ville].filter(Boolean).join(", ") || null })),
    clients: ((clients ?? []) as Array<Record<string, unknown>>).map((c) => ({ id: String(c.id), nom: nom(c) })),
    disponibilites: ((dispos ?? []) as Array<Record<string, unknown>>).map((d) => ({ employeId: String(d.employe_id), jourSemaine: Number(d.jour_semaine), debut: String(d.debut).slice(0, 5), fin: String(d.fin).slice(0, 5) })),
    droits: { gerer: permissions === null || permissions.includes("gerer_planning"), affecter: possedeDroitFin(permissions, "affecter_ressources") },
    permissions,
  };
}
