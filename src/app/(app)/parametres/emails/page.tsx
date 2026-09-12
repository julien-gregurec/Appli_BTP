import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { creerModeleEmailAction, modifierModeleEmailAction, supprimerModeleEmailAction } from "@/app/actions/modeles-email";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { VARIABLES_EMAIL } from "@/lib/email-modeles";

const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const TYPES = [{ cle: "tous", libelle: "Devis et factures" }, { cle: "devis", libelle: "Devis" }, { cle: "facture", libelle: "Factures" }];

type Modele = { id: string; nom: string; type_document: string; objet: string; corps: string; par_defaut: boolean; actif: boolean };

function Formulaire({ m, peutGerer }: { m?: Modele; peutGerer: boolean }) {
  return (
    <form action={m ? modifierModeleEmailAction.bind(null, m.id) : creerModeleEmailAction} className="grid gap-3 sm:grid-cols-2">
      <fieldset disabled={!peutGerer} className="contents">
        <label className="text-xs text-neutral-500">Nom<input name="nom" required maxLength={80} defaultValue={m?.nom ?? ""} className={input} placeholder="Devis standard" /></label>
        <label className="text-xs text-neutral-500">Pour<select name="type_document" defaultValue={m?.type_document ?? "tous"} className={input}>{TYPES.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select></label>
        <label className="text-xs text-neutral-500 sm:col-span-2">Objet<input name="objet" required maxLength={200} defaultValue={m?.objet ?? "Devis {numero} — {entreprise}"} className={input} /></label>
        <label className="text-xs text-neutral-500 sm:col-span-2">Message<textarea name="corps" required rows={7} maxLength={8000} defaultValue={m?.corps ?? "Bonjour {client},\n\nVeuillez trouver ci-joint le devis {numero} d’un montant de {montant_ttc} TTC.\n\nCordialement,\n{prenom} — {entreprise}"} className={input} /></label>
        <label className="flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" name="par_defaut" defaultChecked={m?.par_defaut ?? false} />Proposer par défaut</label>
        <div className="flex justify-end gap-2">
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">{m ? "Enregistrer" : "Créer le modèle"}</button>
        </div>
      </fieldset>
    </form>
  );
}

function Suppression({ id, peutGerer }: { id: string; peutGerer: boolean }) {
  if (!peutGerer) return null;
  return (
    <form action={supprimerModeleEmailAction.bind(null, id)} className="mt-2 flex justify-end">
      <ConfirmSubmitButton message="Supprimer ce modèle ?" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-red-700 dark:border-neutral-700">Supprimer</ConfirmSubmitButton>
    </form>
  );
}

/** Modèles d'e-mail (GP V1, lot G) — objet et message avec variables, par type de document. */
export default async function ParametresEmailsPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ error, succes }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_parametres");
  const { data, error: erreurLecture } = await supabase.from("modeles_email").select("id, nom, type_document, objet, corps, par_defaut, actif").eq("entreprise_id", ctx.entrepriseId).order("type_document").order("nom");
  const modeles = (erreurLecture ? [] : (data ?? [])) as Modele[];

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-1 text-xl font-semibold">Modèles d’e-mail</h1>
          <p className="text-sm text-neutral-500">Objet et message proposés à l’envoi d’un devis ou d’une facture. Variables disponibles : {VARIABLES_EMAIL.map((v) => <code key={v.cle} className="mx-0.5 rounded bg-neutral-100 px-1 dark:bg-neutral-800" title={v.libelle}>{`{${v.cle}}`}</code>)}.</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {succes && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Modèles enregistrés.</p>}
        {erreurLecture && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Les modèles d’e-mail ne sont pas disponibles sur cette version de la base.</p>}
        {!peutGerer && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Votre poste permet de consulter ces modèles, mais pas de les modifier.</p>}
        {modeles.map((m) => (
          <section key={m.id} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="mb-3 text-sm font-semibold">{m.nom} <span className="font-normal text-neutral-500">— {TYPES.find((t) => t.cle === m.type_document)?.libelle}{m.par_defaut ? " · par défaut" : ""}</span></h2>
            <Formulaire m={m} peutGerer={peutGerer} />
            <Suppression id={m.id} peutGerer={peutGerer} />
          </section>
        ))}
        {!erreurLecture && (
          <section className="rounded-md border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
            <h2 className="mb-3 text-sm font-semibold">Nouveau modèle</h2>
            <Formulaire peutGerer={peutGerer} />
          </section>
        )}
      </div>
    </main>
  );
}
