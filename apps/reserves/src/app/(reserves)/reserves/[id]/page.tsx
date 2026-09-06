import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigerShellReserves, estCompteIntervenant, peutValiderLevee } from "@/lib/acces-reserves";
import { listerIntervenants } from "@/lib/donnees";
import { EtiquetteStatut } from "@/components/Etiquette";
import {
  LIBELLES_PRIORITE, estEnRetard, peutDemanderLevee, transitionAutorisee,
  type PrioriteReserve, type StatutReserve,
} from "@/lib/workflow";
import {
  ajouterPhotoAction, assignerAction, commenterAction, demanderLeveeAction,
  repondreResponsabiliteAction, rouvrirAction, statuerLeveeAction,
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

type Photo = { id: string; usage: string; legende: string | null; storage_path: string; created_at: string };
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reserves")
    .select("id, numero, titre, description, statut, priorite, echeance, photo_obligatoire_levee, chantier_id, intervenant_id, position_x, position_y")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const reserve = data as Detail;

  const [{ data: historique }, { data: photos }, { data: messages }, intervenants] = await Promise.all([
    supabase.from("reserves_historique")
      .select("id, action, statut_avant, statut_apres, commentaire, created_at")
      .eq("reserve_id", id).order("created_at", { ascending: true }),
    supabase.from("reserves_photos")
      .select("id, usage, legende, storage_path, created_at")
      .eq("reserve_id", id).order("created_at", { ascending: true }),
    supabase.from("reserves_messages").select("id, contenu, created_at")
      .order("created_at", { ascending: true }),
    listerIntervenants(reserve.chantier_id),
  ]);

  const intervenant = estCompteIntervenant(contexte.roleReserves);
  const erreur = typeof query.error === "string" ? query.error : null;
  const photosTravaux = (photos ?? []).filter((p) => p.usage === "travaux" || p.usage === "levee");
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

      {erreur && <div className="message erreur">{erreur}</div>}

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
          <label>
            Photo justificative (chemin de stockage, facultatif)
            <input name="photo_path" maxLength={500} />
          </label>
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
      <h2>Photos ({(photos ?? []).length})</h2>
      {(photos ?? []).length === 0 ? (
        <p className="vide">Aucune photo rattachée.</p>
      ) : (
        <ul className="liste">
          {(photos as Photo[]).map((p) => (
            <li key={p.id} className="carte">
              <b>{p.usage}</b>
              <div className="reserve-meta">
                <span>{p.legende ?? "Sans légende"}</span>
                <span>{new Date(p.created_at).toLocaleString("fr-FR")}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="carte" action={ajouterPhotoAction}>
        <input type="hidden" name="reserve_id" value={id} />
        <label>
          Chemin de stockage de la photo
          <input name="storage_path" required maxLength={500} placeholder="entreprise/reserve/photo.jpg" />
        </label>
        <label>
          Usage
          <select name="usage" defaultValue="constat">
            <option value="constat">Constat</option>
            <option value="travaux">Travaux réalisés</option>
            <option value="levee">Levée</option>
            <option value="preuve_refus">Preuve de refus</option>
          </select>
        </label>
        <label>
          Légende
          <input name="legende" maxLength={500} />
        </label>
        <div className="actions">
          <button className="bouton secondaire" type="submit">Rattacher la photo</button>
        </div>
      </form>

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
      <form className="carte" action={commenterAction}>
        <input type="hidden" name="reserve_id" value={id} />
        <label>
          Message
          <textarea name="contenu" required maxLength={4000} />
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
