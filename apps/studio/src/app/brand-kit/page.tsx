import { canManageWorkspace } from "@elsatia/studio-domain";
import Shell from "../../components/Shell";
import Notice from "../../components/Notice";
import Submit from "../../components/Submit";
import { getActiveStudioWorkspace } from "../../lib/workspaces";
import { getBrandKit, listLogoCandidates } from "../../lib/brand-kit";
import { saveBrandKit } from "../actions";
export default async function BrandKit({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveStudioWorkspace(params.workspace);
  const canEdit = canManageWorkspace(context.membership.role);
  const [kit, candidates] = await Promise.all([
    getBrandKit(context.workspace.id),
    canEdit ? listLogoCandidates(context.workspace.id) : Promise.resolve([]),
  ]);
  return (
    <Shell context={context} page="brand">
      <p className="eyebrow">IDENTITÉ DE MARQUE</p>
      <h1>Votre marque, à chaque vidéo.</h1>
      <p>
        Renseignez une fois votre entreprise, vos coordonnées et votre logo :
        ils préremplissent le style de chaque nouveau montage. Les vidéos déjà
        créées ne changent pas.
      </p>
      <Notice message={params.error} />
      {params.saved === "1" && (
        <p role="status" className="notice">
          Identité de marque enregistrée.
        </p>
      )}
      {!canEdit && (
        <p role="status">
          Seuls les propriétaires et administrateurs modifient l’identité de
          marque. Vous la retrouvez dans le style de vos montages.
        </p>
      )}
      <section className="card">
        <form action={saveBrandKit} aria-label="Identité de marque">
          <input type="hidden" name="workspace" value={context.workspace.id} />
          <input type="hidden" name="revision" value={kit?.revision ?? ""} />
          <fieldset disabled={!canEdit}>
            <label>
              Nom de l’entreprise
              <input
                name="company_name"
                maxLength={100}
                defaultValue={kit?.company_name ?? ""}
              />
            </label>
            <label>
              Signature (texte de fin par défaut)
              <input
                name="tagline"
                maxLength={140}
                defaultValue={kit?.tagline ?? ""}
              />
            </label>
            <label>
              Téléphone
              <input
                name="phone"
                maxLength={40}
                defaultValue={kit?.phone ?? ""}
              />
            </label>
            <label>
              Site web
              <input
                name="website"
                maxLength={200}
                defaultValue={kit?.website ?? ""}
              />
            </label>
            <label>
              Logo
              <select name="logo" defaultValue={kit?.logo?.id ?? ""}>
                <option value="">Sans logo</option>
                {kit?.logo &&
                  !candidates.some((c) => c.id === kit.logo!.id) && (
                    <option value={kit.logo.id}>
                      {kit.logo.original_filename}
                    </option>
                  )}
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.original_filename} — {c.project_name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Pour ajouter un logo, importez d’abord une image PNG ou JPEG dans
              l’un de vos projets, puis choisissez-la ici.
            </p>
          </fieldset>
          {canEdit && <Submit>Enregistrer l’identité de marque</Submit>}
        </form>
      </section>
    </Shell>
  );
}
