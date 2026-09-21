import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigerShellReserves, estCompteIntervenant, peutValiderLevee } from "@/lib/acces-reserves";
import {
  BUCKET_PHOTOS, listerIntervenants, listerPhotosReserve, signerFichiers,
} from "@/lib/donnees";
import { GaleriePhotos } from "@/components/GaleriePhotos";
import { ChampPhoto } from "@/components/ChampPhoto";
import { EtiquetteStatut } from "@/components/Etiquette";
import { CleIdempotence } from "@/components/CleIdempotence";
import {
  LIBELLES_PRIORITE, estEnRetard, peutDemanderLevee, transitionAutorisee,
  type PrioriteReserve, type StatutReserve,
} from "@/lib/workflow";
import {
  assignerAction, commenterAction, demanderLeveeAction, repondreResponsabiliteAction,
  transfererResponsabiliteAction,
  rouvrirAction, statuerLeveeAction, supprimerPhotoAction, televerserPhotoAction,
} from "@/app/actions";

export const metadata: Metadata = { title: "Réserve" };

type Detail = {
  id: string; numero: number; titre: string; description: string | null;
  statut: StatutReserve; priorite: PrioriteReserve; echeance: string | null;
  photo_obligatoire_levee: boolean; chantier_id: string; intervenant_id: string | null;
  position_x: number | null; position_y: number | null;
};

type LigneHistorique = {
  id: string; action: string; statut_avant: string | null; statut_apres: string | null;
  commentaire: string | null; created_at: string;
};

type Message = { id: string; contenu: string; created_at: string };

const LIBELLES_ACTION: Record<string, string> = {
  creation: "Réserve créée",
  assignation: "Attribuée à une entreprise",
  reassignation: "Réattribuée",
  acceptation: "Responsabilité acceptée",
  refus_responsabilite: "Responsabilité refusée",
  commentaire: "Commentaire",
  photo_ajoutee: "Photo ajoutée",
  demande_levee: "Levée demandée",
  levee_validee: "Levée validée",
  levee_refusee: "Levée refusée",
  reouverture: "Réserve rouverte",
  annulation: "Réserve annulée",
  modification: "Modification",
};

export default async function PageReserve({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contexte = await exigerShellReserves();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reserves")
    .select("id, numero, titre, description, statut, priorite, echeance, photo_obligatoire_levee, chantier_id, intervenant_id, position_x, position_y")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const reserve = data as Detail;

  const [{ data: historique }, photos, { data: messages }, intervenants] = await Promise.all([
    supabase.from("reserves_historique")
      .select("id, action, statut_avant, statut_apres, commentaire, created_at")
      .eq("reserve_id", id).order("created_at", { ascending: true }),
    listerPhotosReserve(id),
    supabase.from("reserves_messages").select("id, contenu, created_at")
      .order("created_at", { ascending: true }),
    listerIntervenants(reserve.chantier_id),
  ]);

  // Aucun fichier n'est public : chaque vignette reçoit une URL signée de courte durée.
  const liens = await signerFichiers(BUCKET_PHOTOS, photos.map((p) => p.storage_path));
  const photosAffichees = photos.map((p) => ({
    id: p.id, usage: p.usage, legende: p.legende,
    url: liens.get(p.storage_path) ?? null,
    taille_octets: p.taille_octets, nom_fichier: p.nom_fichier,
    deposee_par_hote: p.deposee_par_hote, created_at: p.created_at,
  }));

  const intervenant = estCompteIntervenant(contexte.roleReserves);
  const photosTravaux = photos.filter((p) => p.usage === "travaux" || p.usage === "levee");
  const levee = peutDemanderLevee({
    statut: reserve.statut,
    photoObligatoireLevee: reserve.photo_obligatoire_levee,
    nbPhotosTravaux: photosTravaux.length,
  });

  return (
    <>
      <p className="sous-titre" style={{ marginBottom: 4 }}>
        <Link href={`/chantiers/${reserve.chantier_id}`}>← Retour au chantier</Link>
      </p>
      <h1>n°{reserve.numero} — {reserve.titre}</h1>
      <p className="reserve-meta" style={{ marginTop: 0 }}>
        <EtiquetteStatut statut={reserve.statut} />
        <span className="etiquette">{LIBELLES_PRIORITE[reserve.priorite]}</span>
        {reserve.echeance && (
          <span className={estEnRetard(reserve) ? "etiquette retard" : "etiquette"}>
            Échéance {reserve.echeance}
          </span>
        )}
        {reserve.photo_obligatoire_levee && <span className="etiquette attente">Photo exigée pour la levée</span>}
      </p>

      {reserve.description && <div className="carte">{reserve.description}</div>}

      {/* ── Actions de l'entreprise intervenante ─────────────────────────── */}
      {intervenant && transitionAutorisee(reserve.statut, "acceptee", "intervenant") && (
        <form className="carte" action={repondreResponsabiliteAction}>
          <h2 style={{ marginTop: 0 }}>Prenez-vous cette réserve à votre charge ?</h2>
          <input type="hidden" name="reserve_id" value={id} />
          <label>
            Motif (obligatoire en cas de refus)
            <textarea name="motif" maxLength={2000} placeholder="Ouvrage non exécuté par nos équipes…" />
          </label>
          <p className="mention">
            Pour joindre une preuve en cas de refus, ajoutez d’abord une photo
            « Preuve de refus » ci-dessous, puis revenez ici.
          </p>
          <div className="actions">
            <button className="bouton" type="submit" name="accepte" value="oui">J’accepte</button>
            <button className="bouton danger" type="submit" name="accepte" value="non">Je refuse</button>
          </div>
        </form>
      )}

      {intervenant && transitionAutorisee(reserve.statut, "levee_demandee", "intervenant") && (
        <form className="carte" action={demanderLeveeAction}>
          <h2 style={{ marginTop: 0 }}>Demander la levée</h2>
          <input type="hidden" name="reserve_id" value={id} />
          {!levee.possible && <div className="message">{levee.motif}</div>}
          <label>
            Commentaire
            <textarea name="commentaire" maxLength={2000} placeholder="Reprise conforme au descriptif" />
          </label>
          <div className="actions">
            <button className="bouton" type="submit" disabled={!levee.possible}>
              Demander la levée
            </button>
          </div>
        </form>
      )}

      {/* ── Actions de l'organisation hôte ───────────────────────────────── */}
      {!intervenant && transitionAutorisee(reserve.statut, "assignee", "hote") && (
        <form className="carte" action={assignerAction}>
          <h2 style={{ marginTop: 0 }}>
            {reserve.intervenant_id ? "Réattribuer la réserve" : "Attribuer la réserve"}
          </h2>
          <input type="hidden" name="reserve_id" value={id} />
          <label>
            Entreprise
            <select name="intervenant_id" required defaultValue={reserve.intervenant_id ?? ""}>
              <option value="" disabled>Choisir une entreprise</option>
              {intervenants.map((i) => (
                <option key={i.id} value={i.id}>{i.nom}{i.corps_etat ? ` — ${i.corps_etat}` : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Commentaire
            <textarea name="commentaire" maxLength={2000} />
          </label>
          <div className="actions">
            <button className="bouton" type="submit">
              {reserve.statut === "levee" ? "Rouvrir et réattribuer" : "Attribuer"}
            </button>
          </div>
        </form>
      )}

      {/* Transfert de responsabilité. La matrice de 00270 autorise la réassignation
          depuis « acceptée », « levée demandée » et « levée refusée » : c'est le cas réel
          d'une entreprise révoquée en cours de chantier. Le motif est obligatoire, et
          l'historique conserve nommément l'entreprise dessaisie. */}
      {!intervenant && reserve.intervenant_id
        && ["acceptee", "levee_demandee", "levee_refusee"].includes(reserve.statut) && (
        <details className="carte">
          <summary>Transférer la responsabilité à une autre entreprise</summary>
          <form action={transfererResponsabiliteAction}>
            <input type="hidden" name="reserve_id" value={id} />
            <label>
              Nouvelle entreprise
              <select name="intervenant_cible_id" required defaultValue="">
                <option value="" disabled>Choisir une entreprise</option>
                {intervenants
                  .filter((i) => i.id !== reserve.intervenant_id && i.statut !== "revoquee")
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nom}{i.corps_etat ? ` — ${i.corps_etat}` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Motif du transfert (obligatoire)
              <textarea name="motif" required maxLength={2000}
                        placeholder="Entreprise révoquée du chantier, reprise confiée à…" />
            </label>
            <p className="mention">
              La réserve repart au statut « assignée » chez la nouvelle entreprise, qui
              devra accepter la responsabilité. L’entreprise dessaisie est prévenue et son
              passage reste au dossier.
            </p>
            <div className="actions">
              <button className="bouton" type="submit">Transférer</button>
            </div>
          </form>
        </details>
      )}

      {!intervenant && peutValiderLevee(contexte.roleReserves)
        && reserve.statut === "levee_demandee" && (
        <form className="carte" action={statuerLeveeAction}>
          <h2 style={{ marginTop: 0 }}>Statuer sur la levée</h2>
          <input type="hidden" name="reserve_id" value={id} />
          <label>
            Commentaire (obligatoire en cas de refus)
            <textarea name="commentaire" maxLength={2000} />
          </label>
          <div className="actions">
            <button className="bouton" type="submit" name="validee" value="oui">Valider la levée</button>
            <button className="bouton danger" type="submit" name="validee" value="non">Refuser la levée</button>
          </div>
        </form>
      )}

      {!intervenant && peutValiderLevee(contexte.roleReserves) && reserve.statut === "levee" && (
        <form className="carte" action={rouvrirAction}>
          <h2 style={{ marginTop: 0 }}>Rouvrir la réserve</h2>
          <input type="hidden" name="reserve_id" value={id} />
          <label>
            Motif de réouverture
            <textarea name="commentaire" required maxLength={2000} />
          </label>
          <div className="actions">
            <button className="bouton danger" type="submit">Rouvrir</button>
          </div>
        </form>
      )}

      {/* ── Photos ──────────────────────────────────────────────────────── */}
      <h2>Photos</h2>
      <GaleriePhotos photos={photosAffichees} />

      <form className="carte" action={televerserPhotoAction} encType="multipart/form-data">
        {/* Un double envoi sur un réseau de chantier ne doit pas créer deux photos. */}
        <CleIdempotence nom="origine_client_id_photo" />
        <input type="hidden" name="reserve_id" value={id} />
        <ChampPhoto
          nom="photo"
          requis
          libelle="Ajouter une photo"
          aide={intervenant && reserve.statut === "acceptee"
            ? "Une photo après intervention atteste de l’état de l’ouvrage au moment de votre demande de levée."
            : undefined}
        />
        <div className="paire">
          <label>
            Nature
            <select name="usage" defaultValue={intervenant ? "travaux" : "constat"}>
              <option value="constat">Constat — avant</option>
              <option value="travaux">Travaux réalisés — après</option>
              <option value="levee">Levée</option>
              <option value="preuve_refus">Preuve de refus</option>
            </select>
          </label>
          <label>Légende<input name="legende" maxLength={500} /></label>
        </div>
        <div className="actions">
          <button className="bouton secondaire" type="submit">Joindre la photo</button>
        </div>
      </form>

      {photosAffichees.length > 0 && (
        <details className="carte">
          <summary>Retirer une photo</summary>
          <p className="mention">
            Une photo qui a accompagné une décision — acceptation, refus, demande ou
            validation de levée — est verrouillée et ne peut plus être retirée. Les
            autres restent tracées à l’historique après leur retrait.
          </p>
          {photosAffichees.map((photo) => (
            <form key={photo.id} action={supprimerPhotoAction} className="ligne-role">
              <input type="hidden" name="reserve_id" value={id} />
              <input type="hidden" name="photo_id" value={photo.id} />
              <span className="mention">
                {photo.usage} · {photo.legende ?? photo.nom_fichier ?? "sans légende"}
              </span>
              <input name="motif" placeholder="Motif" maxLength={500} />
              <button className="bouton danger" type="submit">Retirer</button>
            </form>
          ))}
        </details>
      )}

      {/* ── Échanges ────────────────────────────────────────────────────── */}
      <h2>Échanges</h2>
      {(messages ?? []).length === 0 ? (
        <p className="vide">Aucun message.</p>
      ) : (
        <ul className="liste">
          {(messages as Message[]).map((m) => (
            <li key={m.id} className="carte">
              {m.contenu}
              <div className="reserve-meta">{new Date(m.created_at).toLocaleString("fr-FR")}</div>
            </li>
          ))}
        </ul>
      )}
      <form className="carte" action={commenterAction} encType="multipart/form-data">
        {/* Même protection pour le message et sa pièce jointe éventuelle. */}
        <CleIdempotence />
        <CleIdempotence nom="origine_client_id_photo" />
        <input type="hidden" name="reserve_id" value={id} />
        <label>
          Message
          <textarea name="contenu" required maxLength={4000} />
        </label>
        {/* La pièce jointe est une photo de la réserve, déposée par la séquence de la V2
            (chemin composé par la base, vérifié contre la réserve réelle). Son usage
            « échange » la distingue d'une preuve : elle ne satisfait jamais l'exigence de
            photo à la levée. */}
        <label>
          Photo jointe (facultatif)
          <input type="file" name="piece_jointe" accept="image/jpeg,image/png,image/webp" />
        </label>
        <div className="actions">
          <button className="bouton secondaire" type="submit">Envoyer</button>
        </div>
      </form>

      {/* ── Historique ──────────────────────────────────────────────────── */}
      <h2>Historique</h2>
      <ul className="chrono">
        {(historique as LigneHistorique[] ?? []).map((h) => (
          <li key={h.id}>
            <time>{new Date(h.created_at).toLocaleString("fr-FR")}</time>
            <b>{LIBELLES_ACTION[h.action] ?? h.action}</b>
            {h.statut_avant && h.statut_apres && h.statut_avant !== h.statut_apres && (
              <span> — {h.statut_avant} → {h.statut_apres}</span>
            )}
            {h.commentaire && <div>{h.commentaire}</div>}
          </li>
        ))}
      </ul>
      <p className="mention">
        L’historique est immuable : il ne peut être ni corrigé ni effacé depuis
        l’application, y compris par un administrateur de votre organisation.
      </p>
    </>
  );
}
