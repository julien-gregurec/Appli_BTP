import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { signerDocumentMetierAction } from "@/app/actions/signatures-documents";
import { LIBELLES_DOCUMENT_SIGNATURE, type SignatureDocument, type TypeDocumentSignature } from "@/lib/signatures-documents";

export async function SignatureDocumentMetier({
  type,
  documentId,
}: {
  type: TypeDocumentSignature;
  documentId: string;
}) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: employe }, { data: signatures }] = await Promise.all([
    supabase.from("employes").select("id,signature_storage_path")
      .eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle(),
    supabase.from("signatures_documents")
      .select("id,employe_id,nom_signataire,fonction_signataire,signature_sha256,document_sha256,signed_at,declaration")
      .eq("entreprise_id", ctx.entrepriseId).eq("type_document", type).eq("document_id", documentId)
      .order("signed_at"),
  ]);
  const liste = (signatures ?? []) as SignatureDocument[];
  const dejaSignee = employe ? liste.some((item) => item.employe_id === employe.id) : false;

  return (
    <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <h2 className="font-semibold">Signatures du {LIBELLES_DOCUMENT_SIGNATURE[type]}</h2>
        <p className="text-xs text-neutral-500">
          Signature interne traçable : copie figée, date serveur et empreintes SHA-256. Elle ne constitue pas une signature électronique qualifiée eIDAS.
        </p>
      </div>
      {liste.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {liste.map((signature) => (
            <article key={signature.id} className="rounded-md border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/employes/${signature.employe_id}/signature?document=${signature.id}`} alt={`Signature de ${signature.nom_signataire}`} className="h-16 max-w-full object-contain" />
              <p className="mt-2 font-medium">{signature.nom_signataire}</p>
              <p className="text-xs text-neutral-500">{signature.fonction_signataire || "Fonction non renseignée"} · {new Date(signature.signed_at).toLocaleString("fr-FR")}</p>
              <p className="mt-1 font-mono text-[10px] text-neutral-400" title={signature.document_sha256}>Document {signature.document_sha256.slice(0, 12)}…</p>
            </article>
          ))}
        </div>
      ) : <p className="text-sm text-neutral-500">Aucune signature apposée.</p>}

      {!employe ? (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Votre compte n’est pas encore relié à une fiche employé : la signature personnelle est indisponible.</p>
      ) : !employe.signature_storage_path ? (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Enregistrez d’abord votre signature depuis votre fiche employé.</p>
      ) : dejaSignee ? (
        <p className="text-xs font-medium text-green-700">Vous avez déjà signé ce document en votre nom.</p>
      ) : (
        <form action={signerDocumentMetierAction.bind(null, type, documentId)}>
          <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">
            Signer en mon nom avec ma signature enregistrée
          </button>
        </form>
      )}
    </section>
  );
}
