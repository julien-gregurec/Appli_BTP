import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  HABILITATION_TYPES,
  libelleHabilitation,
  statutCarteBtp,
  habilitationStatut,
  AVERTISSEMENT_CIBTP,
} from "@/lib/carte-btp";
import { ajouterHabilitationAction, supprimerHabilitationAction } from "@/app/actions/habilitations";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function CarteBtpPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; succes?: string }>;
}) {
  const { id } = await params;
  const msg = await searchParams;
  const ctx = await getContexteEntreprise();
  const sb = await createClient();

  const [{ data: employe }, { data: entreprise }, { data: habilitations }, { data: affectations }] = await Promise.all([
    sb.from("employes").select("id, prenom, nom, poste, identifiant_interne, numero_inscription, reference_interne, telephone, email, carte_btp_numero, carte_btp_expiration, carte_btp_mime_type, carte_btp_storage_path").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    sb.from("entreprises").select("nom, siret").eq("id", ctx.entrepriseId).maybeSingle(),
    sb.from("habilitations_employe").select("id, type, libelle, date_obtention, date_expiration").eq("employe_id", id).eq("entreprise_id", ctx.entrepriseId).order("type"),
    sb.from("affectations").select("date, chantier:chantiers(id, nom)").eq("employe_id", id).eq("entreprise_id", ctx.entrepriseId).order("date", { ascending: false }).limit(60),
  ]);

  if (!employe) notFound();

  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const aUnFichier = !!employe.carte_btp_storage_path;
  const statut = statutCarteBtp(employe.carte_btp_expiration, aUnFichier);
  const estImage = (employe.carte_btp_mime_type ?? "").startsWith("image/");
  const chantiers = [...new Map((affectations ?? []).map((a) => un(a.chantier)).filter(Boolean).map((c) => [c!.id, c!.nom])).entries()];
  const ajouter = ajouterHabilitationAction.bind(null, id);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href={`/employes/${id}`} className="text-sm text-neutral-500 hover:underline">← Fiche salarié</Link>
          <h1 className="mt-1 text-xl font-semibold">Carte professionnelle — {employe.prenom} {employe.nom}</h1>
        </div>

        {msg.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
        {msg.succes && <p className="rounded bg-green-50 p-3 text-sm text-green-700">Habilitation enregistrée.</p>}

        {/* Badge */}
        <div className="overflow-hidden rounded-xl border border-[#243447] shadow-sm">
          <div className="flex items-center justify-between bg-[#0d1b2a] px-5 py-3 text-white">
            <div>
              <div className="text-sm font-semibold tracking-[0.14em]">{entreprise?.nom ?? "—"}</div>
              {entreprise?.siret && <div className="text-[11px] text-white/60">SIRET {entreprise.siret}</div>}
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: statut.couleur, color: "#fff" }}>{statut.libelle}</span>
          </div>

          <div className="grid gap-5 p-5 sm:grid-cols-[180px_1fr]">
            <div>
              {aUnFichier && estImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/employes/${id}/carte-btp`} alt="Carte BTP" className="w-full rounded-md border object-contain" />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md border border-dashed border-neutral-300 text-center text-xs text-neutral-400">
                  {aUnFichier ? "Document non image" : "Aucune carte importée"}
                </div>
              )}
              {aUnFichier && (
                <a href={`/api/employes/${id}/carte-btp?download=1`} className="mt-2 block rounded-md border border-neutral-300 px-3 py-1.5 text-center text-xs dark:border-neutral-700">
                  Ouvrir / télécharger la carte
                </a>
              )}
              <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-neutral-400">Copie numérique — ne remplace pas l&apos;original</p>
            </div>

            <div className="space-y-2 text-sm">
              <div><span className="text-neutral-500">Nom : </span><span className="font-medium">{employe.prenom} {employe.nom}</span></div>
              <div><span className="text-neutral-500">Fonction : </span>{employe.poste || "—"}</div>
              <div><span className="text-neutral-500">N° interne : </span><span className="font-mono">{employe.identifiant_interne ?? employe.reference_interne ?? "—"}</span></div>
              <div><span className="text-neutral-500">N° carte BTP : </span><span className="font-mono">{employe.carte_btp_numero ?? "—"}</span></div>
              <div><span className="text-neutral-500">Validité : </span>{employe.carte_btp_expiration ?? "—"}</div>
              <div>
                <span className="text-neutral-500">Chantiers affectés : </span>
                {chantiers.length ? chantiers.map(([cid, nom]) => <Link key={cid} href={`/chantiers/${cid}`} className="mr-1 hover:underline">{nom}</Link>) : "—"}
              </div>
            </div>
          </div>

          <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">⚠️ {AVERTISSEMENT_CIBTP}</p>
        </div>

        {/* Habilitations */}
        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Habilitations et qualifications</h2>
          {habilitations && habilitations.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {habilitations.map((h) => {
                const st = habilitationStatut(h.date_expiration);
                const supprimer = supprimerHabilitationAction.bind(null, h.id, id);
                return (
                  <div key={h.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="font-medium">{libelleHabilitation(h.type)}</span>
                    {h.libelle && <span className="text-neutral-500">{h.libelle}</span>}
                    <span className="text-xs text-neutral-400">
                      {h.date_obtention ? `obtenu ${h.date_obtention}` : ""}{h.date_expiration ? ` · expire ${h.date_expiration}` : ""}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: st.couleur + "22", color: st.couleur }}>{st.libelle}</span>
                    <form action={supprimer} className="ml-auto">
                      <ConfirmSubmitButton message="Retirer cette habilitation ?" className="text-xs text-neutral-400 hover:text-red-600">Retirer</ConfirmSubmitButton>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Aucune habilitation enregistrée.</p>
          )}

          <form action={ajouter} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Type</label>
              <select name="type" className={input}>
                {HABILITATION_TYPES.map((h) => <option key={h.cle} value={h.cle}>{h.libelle}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Précision</label>
              <input name="libelle" placeholder="CACES R482 cat. A…" className={input + " w-40"} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Obtention</label>
              <input name="date_obtention" type="date" className={input} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Expiration</label>
              <input name="date_expiration" type="date" className={input} />
            </div>
            <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Ajouter</button>
          </form>
        </section>
      </div>
    </main>
  );
}
