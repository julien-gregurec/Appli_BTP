"use client";

import { useState } from "react";
import type { ChantierCache, Identite, ReserveCache } from "@/lib/offline/base-locale";
import { enregistrerMutation } from "@/lib/offline/base-locale";
import { creerMutation, type TypeMutation } from "@/lib/offline/contrat";
import { MIMES_PHOTO, TAILLE_MAX_PHOTO } from "@/lib/images";
import { reseauJoignable } from "@/lib/offline/reseau";

/**
 * Saisie de terrain sans réseau.
 *
 * C'est ici que le hors-ligne devient utile plutôt que consultatif : sur un chantier sans
 * couverture, on constate, on commente, on photographie. Chaque saisie part directement
 * en file — avec sa clé d'idempotence — et sera rejouée telle quelle au retour du réseau.
 *
 * Le périmètre est volontairement CELUI QUI EST ÉPROUVÉ : création de réserve,
 * commentaire, photo, demande de levée. Rien d'autre n'est proposé hors ligne, plutôt que
 * d'offrir une action qui échouerait silencieusement à la synchronisation.
 */
export function CaptureOffline({
  identite, chantiers, reserves, surEnregistrement,
}: {
  identite: Identite;
  chantiers: ChantierCache[];
  reserves: ReserveCache[];
  surEnregistrement: () => void | Promise<void>;
}) {
  const [type, setType] = useState<TypeMutation>("reserve_creer");
  const [chantierId, setChantierId] = useState(chantiers[0]?.id ?? "");
  const [reserveId, setReserveId] = useState(reserves[0]?.id ?? "");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [contenu, setContenu] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  function choisirPhoto(fichierChoisi: File | null) {
    setErreur(null);
    if (apercu) URL.revokeObjectURL(apercu);
    if (!fichierChoisi) { setFichier(null); setApercu(null); return; }

    // Les mêmes règles qu'en ligne, appliquées AVANT la mise en file : refuser au retour
    // du réseau une photo prise trois heures plus tôt serait inacceptable sur un chantier.
    if (!(MIMES_PHOTO as readonly string[]).includes(fichierChoisi.type)) {
      setFichier(null); setApercu(null);
      setErreur(fichierChoisi.type === "image/heic" || fichierChoisi.type === "image/heif"
        ? "Le format HEIC n’est pas pris en charge. Réglez l’appareil photo sur « Le plus compatible »."
        : `Format non pris en charge (${fichierChoisi.type || "inconnu"}).`);
      return;
    }
    if (fichierChoisi.size > TAILLE_MAX_PHOTO) {
      setFichier(null); setApercu(null);
      setErreur("Photo trop volumineuse : 15 Mo au maximum.");
      return;
    }
    setFichier(fichierChoisi);
    // Aperçu local : la preuve est visible sur l'appareil avant même d'être transmise.
    setApercu(URL.createObjectURL(fichierChoisi));
  }

  async function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur(null); setMessage(null); setEnvoi(true);
    try {
      const commun = {
        entrepriseId: identite.entrepriseId,
        utilisateurId: identite.utilisateurId,
        chantierId: type === "reserve_creer" ? chantierId : null,
        reserveId: type === "reserve_creer" ? null : reserveId,
      };

      let mutation;
      let photo: Blob | null = null;

      if (type === "reserve_creer") {
        if (!chantierId || titre.trim() === "") {
          setErreur("Indiquez le chantier et l’intitulé de la réserve.");
          return;
        }
        mutation = creerMutation({
          ...commun, type: "reserve_creer",
          payload: { titre: titre.trim(), description: description.trim() || null, priorite },
        }, { etat: "en_attente" });
      } else if (type === "commentaire_ajouter") {
        if (!reserveId || contenu.trim() === "") {
          setErreur("Choisissez une réserve et écrivez le commentaire.");
          return;
        }
        mutation = creerMutation({
          ...commun, type: "commentaire_ajouter", payload: { contenu: contenu.trim() },
        }, { etat: "en_attente" });
      } else if (type === "photo_ajouter") {
        if (!reserveId || !fichier) {
          setErreur("Choisissez une réserve et une photo.");
          return;
        }
        photo = fichier;
        mutation = creerMutation({
          ...commun, type: "photo_ajouter",
          payload: {
            usage: "constat", legende: contenu.trim() || null,
            nomFichier: fichier.name, taille: fichier.size, mime: fichier.type,
          },
        }, { etat: "en_attente" });
      } else {
        if (!reserveId) { setErreur("Choisissez une réserve."); return; }
        mutation = creerMutation({
          ...commun, type: "levee_demander",
          payload: { commentaire: contenu.trim() || null },
        }, { etat: "en_attente" });
      }

      await enregistrerMutation(identite, mutation, photo);
      setMessage(
        await reseauJoignable()
          ? "Enregistré sur l’appareil. L’envoi part maintenant."
          : "Enregistré sur l’appareil. L’envoi partira dès le retour du réseau.",
      );
      setTitre(""); setDescription(""); setContenu("");
      if (apercu) URL.revokeObjectURL(apercu);
      setFichier(null); setApercu(null);
      await surEnregistrement();
    } catch {
      setErreur("Impossible d’enregistrer sur cet appareil : la mémoire locale est refusée ou pleine.");
    } finally {
      setEnvoi(false);
    }
  }

  const cible = type === "reserve_creer";
  if (chantiers.length === 0 && reserves.length === 0) return null;

  return (
    <form className="carte" onSubmit={enregistrer} data-test="capture-offline">
      <h2 className="sans-marge">Saisir maintenant</h2>
      <p className="mention">
        La saisie est conservée sur l’appareil et transmise au retour du réseau. Elle
        n’est <strong>pas</strong> encore enregistrée sur le serveur.
      </p>

      <label>
        Action
        <select value={type} data-test="type-mutation"
                onChange={(e) => setType(e.target.value as TypeMutation)}>
          <option value="reserve_creer">Constater une réserve</option>
          <option value="commentaire_ajouter">Ajouter un commentaire</option>
          <option value="photo_ajouter">Joindre une photo</option>
          <option value="levee_demander">Demander la levée</option>
        </select>
      </label>

      {cible ? (
        <label>
          Chantier
          <select value={chantierId} data-test="chantier"
                  onChange={(e) => setChantierId(e.target.value)}>
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
      ) : (
        <label>
          Réserve
          <select value={reserveId} data-test="reserve"
                  onChange={(e) => setReserveId(e.target.value)}>
            {reserves.map((r) => (
              <option key={r.id} value={r.id}>n°{r.numero} — {r.titre}</option>
            ))}
          </select>
        </label>
      )}

      {type === "reserve_creer" && (
        <>
          <label>
            Intitulé
            <input value={titre} data-test="titre" maxLength={180} required
                   placeholder="Relevé d’étanchéité insuffisant"
                   onChange={(e) => setTitre(e.target.value)} />
          </label>
          <label>
            Description
            <textarea value={description} data-test="description" rows={3}
                      onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            Priorité
            <select value={priorite} onChange={(e) => setPriorite(e.target.value)}>
              <option value="basse">Basse</option>
              <option value="normale">Normale</option>
              <option value="haute">Haute</option>
              <option value="bloquante">Bloquante</option>
            </select>
          </label>
        </>
      )}

      {(type === "commentaire_ajouter" || type === "levee_demander") && (
        <label>
          {type === "commentaire_ajouter" ? "Commentaire" : "Motif (facultatif)"}
          <textarea value={contenu} data-test="contenu" rows={3}
                    required={type === "commentaire_ajouter"}
                    onChange={(e) => setContenu(e.target.value)} />
        </label>
      )}

      {type === "photo_ajouter" && (
        <>
          <label>
            Photo
            <input type="file" data-test="photo" accept={MIMES_PHOTO.join(",")}
                   onChange={(e) => choisirPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <label>
            Légende
            <input value={contenu} data-test="legende"
                   onChange={(e) => setContenu(e.target.value)} />
          </label>
          {apercu && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={apercu} alt="Aperçu de la photo à envoyer" data-test="apercu"
                 style={{ maxWidth: 220, borderRadius: 6, border: "1px solid #ccc" }} />
          )}
        </>
      )}

      {erreur && <div className="message erreur" data-test="erreur-capture">{erreur}</div>}
      {message && <div className="message" data-test="message-capture">{message}</div>}

      <div className="actions">
        <button className="bouton" type="submit" disabled={envoi} data-test="enregistrer">
          {envoi ? "Enregistrement…" : "Enregistrer sur l’appareil"}
        </button>
      </div>
    </form>
  );
}
