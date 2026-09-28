import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTROLES_INCIDENT, STATUTS_SERVICE, analyserEtatIncident } from "@elsatia/incident-control";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { LIBELLES_CONTROLES, PORTEES_CONSOLE, SERVICES_STATUT } from "@/lib/incident/console";
import { basculerControleIncidentAction, definirStatutServiceAction } from "@/app/actions/plateforme-incident";

type LigneControle = {
  portee: string; controle: string; actif: boolean; motif: string | null; incident_ref: string | null;
  expire_at: string | null; maj_par_libelle: string | null; maj_at: string;
};
type LigneJournal = {
  id: number; created_at: string; acteur_libelle: string; acteur_role: string | null; action: string;
  portee: string | null; controle: string | null; service: string | null; motif: string; incident_ref: string | null;
};

const dateCourte = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });

export default async function IncidentPlateformePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; succes?: string }>;
}) {
  if (!(await estPlateformeAdmin())) notFound();
  const supabase = await createClient();
  const [controles, journal, etatBrut, messages] = await Promise.all([
    supabase.rpc("plateforme_incident_controles_lister"),
    supabase.rpc("plateforme_incident_journal_lister", { p_limite: 50 }),
    supabase.rpc("incident_etat_public"),
    searchParams,
  ]);
  const lignes = (controles.data ?? []) as LigneControle[];
  const actifs = lignes.filter((l) => l.actif && (!l.expire_at || new Date(l.expire_at) > new Date()));
  const etat = analyserEtatIncident(etatBrut.data);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6a1f]">Administration ELSATIA</p>
            <h1 className="mt-1 text-2xl font-semibold">Incident &amp; mode sûr</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Bascules appliquées par la base en moins de 10 s, sans redéploiement ni suppression de données.
              Réservé au rôle <strong>total</strong> en session renforcée ; chaque bascule est journalisée avec son motif.
              Runbooks : <code>docs/runbooks/incident/</code>.
            </p>
          </div>
          <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">← Plateforme</Link>
        </header>

        {messages.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
        {messages.succes && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-700">{messages.succes}</p>}

        <section aria-labelledby="controles-actifs" className="space-y-3">
          <h2 id="controles-actifs" className="font-semibold">Contrôles actifs ({actifs.length})</h2>
          {actifs.length === 0 ? (
            <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">Aucun contrôle actif : fonctionnement nominal.</p>
          ) : (
            <ul className="space-y-2">
              {actifs.map((l) => (
                <li key={`${l.portee}:${l.controle}`} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                  <form action={basculerControleIncidentAction} className="flex flex-wrap items-center gap-2">
                    <strong>{l.portee}</strong> · {LIBELLES_CONTROLES[l.controle as keyof typeof LIBELLES_CONTROLES] ?? l.controle}
                    <span className="text-xs text-neutral-600">
                      par {l.maj_par_libelle ?? "?"} le {dateCourte(l.maj_at)}{l.expire_at ? ` · expire ${dateCourte(l.expire_at)}` : ""}
                      {l.incident_ref ? ` · ${l.incident_ref}` : ""}
                    </span>
                    <input type="hidden" name="portee" value={l.portee} />
                    <input type="hidden" name="controle" value={l.controle} />
                    <input type="hidden" name="actif" value="false" />
                    <input type="hidden" name="incident_ref" value={l.incident_ref ?? ""} />
                    <input name="motif" required minLength={10} maxLength={500} placeholder="Motif de levée (obligatoire)" className="min-w-64 flex-1 rounded border px-2 py-1" />
                    <button className="rounded bg-neutral-900 px-3 py-1 text-white">Lever</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="nouvelle-bascule" className="rounded-xl border p-5">
          <h2 id="nouvelle-bascule" className="font-semibold">Activer un contrôle</h2>
          <form action={basculerControleIncidentAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="actif" value="true" />
            <label className="text-sm">Portée
              <select name="portee" className="mt-1 block w-full rounded border px-2 py-1">
                {PORTEES_CONSOLE.map((p) => <option key={p.cle} value={p.cle}>{p.libelle}</option>)}
              </select>
            </label>
            <label className="text-sm">Contrôle
              <select name="controle" className="mt-1 block w-full rounded border px-2 py-1">
                {CONTROLES_INCIDENT.map((c) => <option key={c} value={c}>{LIBELLES_CONTROLES[c]}</option>)}
              </select>
            </label>
            <label className="text-sm">Référence d&apos;incident
              <input name="incident_ref" maxLength={64} placeholder="INC-2026-…" className="mt-1 block w-full rounded border px-2 py-1" />
            </label>
            <label className="text-sm">Expiration automatique (minutes, optionnel)
              <input name="expire_minutes" type="number" min={1} max={10080} className="mt-1 block w-full rounded border px-2 py-1" />
            </label>
            <label className="text-sm sm:col-span-2">Motif (interne, jamais public)
              <textarea name="motif" required minLength={10} maxLength={500} className="mt-1 block w-full rounded border px-2 py-1" />
            </label>
            <button className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white sm:col-span-2">Activer</button>
          </form>
        </section>

        <section aria-labelledby="statuts" className="rounded-xl border p-5">
          <h2 id="statuts" className="font-semibold">Statut public par service</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
            {SERVICES_STATUT.map((s) => (
              <li key={s}><code>{s}</code> : <strong>{etat?.statuts[s]?.statut ?? "?"}</strong></li>
            ))}
          </ul>
          <form action={definirStatutServiceAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <select name="service" className="rounded border px-2 py-1">{SERVICES_STATUT.map((s) => <option key={s}>{s}</option>)}</select>
            <select name="statut" className="rounded border px-2 py-1">{STATUTS_SERVICE.map((s) => <option key={s}>{s}</option>)}</select>
            <input name="message_public" maxLength={280} placeholder="Message public (visible des clients)" className="rounded border px-2 py-1" />
            <input name="motif" required minLength={10} maxLength={500} placeholder="Motif interne" className="rounded border px-2 py-1 sm:col-span-2" />
            <button className="rounded border px-3 py-1 text-sm">Publier le statut</button>
          </form>
        </section>

        <section aria-labelledby="journal" className="space-y-2">
          <h2 id="journal" className="font-semibold">Journal (append-only, 50 dernières entrées)</h2>
          <table className="w-full text-left text-xs">
            <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Cible</th><th>Motif</th></tr></thead>
            <tbody>
              {((journal.data ?? []) as LigneJournal[]).map((j) => (
                <tr key={j.id} className="border-t align-top">
                  <td className="py-1 pr-2">{dateCourte(j.created_at)}</td>
                  <td className="pr-2">{j.acteur_libelle} ({j.acteur_role ?? "?"})</td>
                  <td className="pr-2">{j.action}</td>
                  <td className="pr-2">{j.service ?? `${j.portee}:${j.controle}`}</td>
                  <td>{j.motif}{j.incident_ref ? ` [${j.incident_ref}]` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
