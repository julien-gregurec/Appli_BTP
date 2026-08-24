import Link from "next/link";
import { redirect } from "next/navigation";
import { previsualiserChantierDepuisDevis, creerChantierDepuisDevisAction } from "@/app/actions/chantiers";
import { CreerChantierConfirmButton } from "@/components/CreerChantierConfirmButton";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "block text-sm font-medium";

export default async function CreerChantierDepuisDevisPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error: erreurAction } = await searchParams;

  const previsualisation = await previsualiserChantierDepuisDevis(id);

  if (!previsualisation.eligible) {
    return (
      <main className="p-8">
        <div className="mx-auto max-w-xl space-y-4">
          <Link href={`/devis/${id}`} className="text-sm text-neutral-500 hover:underline">← Devis</Link>
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{previsualisation.motif}</p>
        </div>
      </main>
    );
  }

  if (previsualisation.chantierExistantId) {
    redirect(`/chantiers/${previsualisation.chantierExistantId}?success=${encodeURIComponent("Ce chantier existait déjà pour ce devis.")}`);
  }

  const creer = creerChantierDepuisDevisAction.bind(null, id);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <Link href={`/devis/${id}`} className="text-sm text-neutral-500 hover:underline">← Devis {previsualisation.devisNumero}</Link>
          <h1 className="mt-1 text-xl font-semibold">Créer un chantier depuis le devis</h1>
          <p className="text-sm text-neutral-500">Vérifiez et complétez les informations avant de créer le chantier. Rien n’est enregistré tant que vous n’avez pas confirmé.</p>
        </div>

        {erreurAction && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreurAction}</p>}

        <form action={creer} className="space-y-4 rounded-md border border-neutral-200 p-5 dark:border-neutral-800">
          <div>
            <span className={label}>Client</span>
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{previsualisation.clientNom}</p>
          </div>

          <label className="block">
            <span className={label}>Nom du chantier</span>
            <input name="nom" defaultValue={previsualisation.nomSuggere} required className={`${input} mt-1`} />
          </label>

          <label className="block">
            <span className={label}>Adresse</span>
            <input name="adresse" defaultValue={previsualisation.adresseSuggeree} className={`${input} mt-1`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>Code postal</span>
              <input name="code_postal" defaultValue={previsualisation.codePostalSuggere} className={`${input} mt-1`} />
            </label>
            <label className="block">
              <span className={label}>Ville</span>
              <input name="ville" defaultValue={previsualisation.villeSuggeree} className={`${input} mt-1`} />
            </label>
          </div>

          <label className="block">
            <span className={label}>Description</span>
            <textarea name="description" rows={3} defaultValue={previsualisation.descriptionSuggeree} className={`${input} mt-1`} />
          </label>

          <div className="rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
            <p><span className="text-neutral-500">Devis source :</span> {previsualisation.devisNumero ?? "—"}</p>
            <p><span className="text-neutral-500">Budget prévisionnel (montant du devis) :</span> {previsualisation.montantHt.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT</p>
          </div>

          <div className="flex items-center gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <CreerChantierConfirmButton
              clientNom={previsualisation.clientNom}
              devisNumero={previsualisation.devisNumero}
              montantHt={previsualisation.montantHt}
              className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white"
            />
            <Link href={`/devis/${id}`} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">Annuler</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
