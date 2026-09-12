import { AutoPrint } from "@/components/AutoPrint";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { chargerPlanningV2 } from "@/lib/planning/serveur";
import { blocsDeVue, heureFr, joursDeVue, lignesDeVue, salariesDe, TYPES_EVENEMENT, VUES, couleurDe, type Vue } from "@/lib/planning/modele";
import { parametresPlanning } from "@/app/(app)/planning/PlanningV2Page";

const jourFr = (j: string, long = false) => new Intl.DateTimeFormat("fr-FR", long ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${j}T12:00:00`));

/**
 * Planning v2 imprimable (GP V1, lot F) : A4 paysage, une grille dense sujets × jours (ou une liste
 * chronologique en vue compacte / jour), même source de données que l'écran. Servie à l'utilisateur
 * (window.print) et à Chromium headless (/api/documents/planning/pdf).
 */
export default async function ImprimerPlanningPage({ searchParams }: { searchParams: Promise<{ jour?: string; vue?: string }> }) {
  const { jour, vue } = parametresPlanning(await searchParams);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const jours = joursDeVue(vue, jour);
  const donnees = await chargerPlanningV2(supabase, ctx, jours);
  const { data: entreprise } = await supabase.from("entreprises").select("nom, logo_url").eq("id", ctx.entrepriseId).maybeSingle();
  const genre: Vue = vue === "jour" || vue === "semaine" || vue === "mois" ? "salarie" : vue;
  const enListe = vue === "compacte" || vue === "jour";
  const lignes = lignesDeVue(genre, jours, donnees);
  const blocs = blocsDeVue(donnees.evenements, enListe ? "compacte" : genre, jours, donnees.equipes).sort((a, b) => a.jour.localeCompare(b.jour) || a.debutMin - b.debutMin);
  const nomSalarie = (id: string) => donnees.salaries.find((s) => s.id === id)?.nom ?? "?";
  const conflitsDe = (id: string) => donnees.conflits.filter((c) => c.evenementId === id);
  const periode = vue === "jour" ? jourFr(jour, true) : vue === "mois" ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${jour}T12:00:00`)) : `du ${jourFr(jours[0])} au ${jourFr(jours[jours.length - 1])}`;
  const colonnes = vue === "mois" ? jours.filter((j) => j.slice(0, 7) === jour.slice(0, 7)) : jours;

  return (
    <>
      <AutoPrint />
      <style>{`@page { size: A4 landscape; margin: 10mm; } body { background: #fff; }`}</style>
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#0d1b2a", fontSize: "10px", lineHeight: 1.3, padding: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #c9a24a", paddingBottom: "6px", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {entreprise?.logo_url && <img src={entreprise.logo_url} alt="" style={{ height: "36px", objectFit: "contain" }} />}
            <div><div style={{ fontSize: "14px", fontWeight: 700 }}>{entreprise?.nom ?? ctx.entrepriseNom}</div><div style={{ color: "#555" }}>Planning — {VUES.find((v) => v.cle === vue)?.libelle} {periode}</div></div>
          </div>
          <div style={{ textAlign: "right", color: "#555" }}>Édité le {new Date().toLocaleDateString("fr-FR")}<br />{donnees.evenements.length} évènement{donnees.evenements.length > 1 ? "s" : ""}{donnees.conflits.length ? ` · ${donnees.conflits.length} conflit${donnees.conflits.length > 1 ? "s" : ""}` : ""}</div>
        </div>

        {enListe ? (
          <table style={{ width: "100%", fontSize: "10px" }}>
            <thead><tr style={{ background: "#f3f4f6" }}>{["Jour", "Heures", "Évènement", "Type", "Chantier / adresse", "Salariés", "Statut", "Conflits"].map((t) => <th key={t} style={{ textAlign: "left", padding: "3px 4px", border: "1px solid #ddd" }}>{t}</th>)}</tr></thead>
            <tbody>
              {blocs.map((b) => (
                <tr key={`${b.evenement.id}-${b.jour}`}>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>{jourFr(b.jour)}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>{b.evenement.journeeEntiere ? "Journée" : `${heureFr(b.evenement.debut)}–${heureFr(b.evenement.fin)}`}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd", borderLeft: `4px solid ${couleurDe(b.evenement)}` }}>{b.evenement.titre}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd" }}>{TYPES_EVENEMENT.find((t) => t.cle === b.evenement.type)?.libelle}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd" }}>{[donnees.chantiers.find((c) => c.id === b.evenement.chantierId)?.nom, b.evenement.adresse].filter(Boolean).join(" — ")}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd" }}>{salariesDe(b.evenement, donnees.equipes).map(nomSalarie).join(", ")}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd" }}>{b.evenement.statut}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd", color: "#92400e" }}>{conflitsDe(b.evenement.id).map((c) => c.detail).join(" · ")}</td>
                </tr>
              ))}
              {blocs.length === 0 && <tr><td colSpan={8} style={{ padding: "8px", textAlign: "center", color: "#777" }}>Aucun évènement sur la période.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table style={{ width: "100%", tableLayout: "fixed", fontSize: "9px" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={{ width: "110px", textAlign: "left", padding: "3px 4px", border: "1px solid #ddd" }}>{genre === "salarie" ? "Salarié" : genre === "equipe" ? "Équipe" : genre === "chantier" ? "Chantier" : "Ressource"}</th>
                {colonnes.map((j) => <th key={j} style={{ textAlign: "left", padding: "3px 4px", border: "1px solid #ddd" }}>{jourFr(j)}</th>)}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.cle}>
                  <td style={{ padding: "2px 4px", border: "1px solid #ddd", fontWeight: 600, verticalAlign: "top" }}>{l.libelle}</td>
                  {colonnes.map((j) => (
                    <td key={j} style={{ padding: "2px", border: "1px solid #ddd", verticalAlign: "top" }}>
                      {blocs.filter((b) => b.ligne === l.cle && b.jour === j).map((b) => (
                        <div key={b.evenement.id} style={{ borderLeft: `3px solid ${couleurDe(b.evenement)}`, background: "#f8fafc", padding: "1px 3px", marginBottom: "2px", breakInside: "avoid" }}>
                          <div style={{ fontWeight: 600 }}>{b.evenement.journeeEntiere ? "" : `${heureFr(b.evenement.debut)}–${heureFr(b.evenement.fin)} `}{b.evenement.titre}{conflitsDe(b.evenement.id).length ? " ⚠" : ""}</div>
                          {(b.evenement.adresse || donnees.chantiers.find((c) => c.id === b.evenement.chantierId)) && <div style={{ color: "#555" }}>{[donnees.chantiers.find((c) => c.id === b.evenement.chantierId)?.nom, b.evenement.adresse].filter(Boolean).join(" — ")}</div>}
                          {genre !== "salarie" && salariesDe(b.evenement, donnees.equipes).length > 0 && <div style={{ color: "#555" }}>{salariesDe(b.evenement, donnees.equipes).map(nomSalarie).join(", ")}</div>}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
              {lignes.length === 0 && <tr><td colSpan={colonnes.length + 1} style={{ padding: "8px", textAlign: "center", color: "#777" }}>Rien à afficher.</td></tr>}
            </tbody>
          </table>
        )}
        {donnees.conflits.length > 0 && (
          <div style={{ marginTop: "8px", border: "1px solid #fcd34d", background: "#fffbeb", padding: "4px 6px" }}>
            <strong>Conflits</strong>
            <ul style={{ margin: "2px 0 0", paddingLeft: "16px" }}>
              {donnees.conflits.map((c, i) => <li key={i}>{donnees.evenements.find((e) => e.id === c.evenementId)?.titre ?? "Évènement"} — {c.detail}</li>)}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
