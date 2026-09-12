import { Lien as Link } from "@/components/Lien";
import { createClient } from "@/lib/supabase/server";
import { euros } from "@/lib/devis";
import { typeFactureLabel } from "@/lib/factures";
import { dateFr } from "@/lib/devis/document-modele";

type Facture = { id: string; numero: string | null; type: string; statut: string; montant_ttc: number | string | null; date_emission: string | null; facture_origine_id: string | null };
type Situation = { id: string; numero: string | null; statut: string; montant_periode_ht: number | string | null; date_situation: string | null; facture_id: string | null };
type Chantier = { id: string; nom: string; statut: string };

/**
 * Documents issus d'un devis (GP V1) : factures, acomptes, avoirs, situations, chantier — lus par la RPC
 * `documents_issus_devis` sous la RLS de l'utilisateur (un poste sans accès aux factures n'en voit aucune).
 * N'est rendu que moteur v2 actif (la RPC arrive avec ses migrations).
 */
export async function DocumentsIssusDevis({ devisId }: { devisId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("documents_issus_devis", { p_devis_id: devisId });
  const d = (data ?? {}) as { factures?: Facture[]; situations?: Situation[]; chantiers?: Chantier[] };
  const factures = d.factures ?? [];
  const situations = d.situations ?? [];
  const chantiers = d.chantiers ?? [];
  const total = factures.length + situations.length + chantiers.length;
  const ligne = "flex min-h-11 items-center justify-between gap-3 border-t border-neutral-100 text-sm first:border-t-0 dark:border-neutral-800";

  return (
    <section aria-labelledby="documents-issus" className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 id="documents-issus" className="font-semibold">Documents issus de ce devis</h2>
      {total === 0 ? (
        <p className="mt-1 text-sm text-neutral-500">Aucune facture, situation ni chantier n’a encore été créé depuis ce devis.</p>
      ) : (
        <ul className="mt-2">
          {chantiers.map((c) => (
            <li key={c.id} className={ligne}><Link href={`/chantiers/${c.id}`} className="hover:underline">Chantier — {c.nom}</Link><span className="text-neutral-500">{c.statut}</span></li>
          ))}
          {factures.map((f) => (
            <li key={f.id} className={ligne}>
              <Link href={`/factures/${f.id}`} className="hover:underline">{typeFactureLabel(f.type)} {f.numero ?? "(brouillon)"}{f.facture_origine_id ? " · avoir" : ""}</Link>
              <span className="tabular-nums text-neutral-500">{f.date_emission ? dateFr(f.date_emission) : ""} · {f.statut} · {euros(Number(f.montant_ttc ?? 0))} TTC</span>
            </li>
          ))}
          {situations.map((s) => (
            <li key={s.id} className={ligne}>
              <Link href="/facturation-avancee" className="hover:underline">Situation {s.numero ?? ""}</Link>
              <span className="tabular-nums text-neutral-500">{s.date_situation ? dateFr(s.date_situation) : ""} · {s.statut} · {euros(Number(s.montant_periode_ht ?? 0))} HT{s.facture_id ? " · facturée" : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
