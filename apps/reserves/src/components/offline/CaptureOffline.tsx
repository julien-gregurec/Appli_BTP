"use client";

import { useState } from "react";
import type { ChantierCache, Identite, ReserveCache } from "@/lib/offline/base-locale";
import { changerEtat, enregistrerMutation } from "@/lib/offline/base-locale";
import { creerMutation, type Mutation, type TypeMutation } from "@/lib/offline/contrat";
import { MIMES_PHOTO, TAILLE_MAX_PHOTO, formaterOctets } from "@/lib/images";
import { compresserPhoto } from "@/lib/images-navigateur";
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
/** Lit une chaîne d'une charge utile de brouillon, sans jamais faire confiance au type. */
function chaine(payload: Record<string, unknown> | undefined, cle: string): string {
  const valeur = payload?.[cle];
  return typeof valeur === "string" ? valeur : "";
}

export function CaptureOffline({
  identite, chantiers, reserves, surEnregistrement, brouillon = null, surAbandonEdition,
}: {
  identite: Identite;
  chantiers: ChantierCache[];
  reserves: ReserveCache[];
  surEnregistrement: () => void | Promise<void>;
  /**
   * Brouillon en cours de reprise. Le parent remonte le composant (via `key`) quand il
   * change : l'état initial ci-dessous est donc toujours celui du brouillon ouvert.
   */
  brouillon?: Mutation | null;
  surAbandonEdition?: () => void;
}) {
  const edition = brouillon !== null;
  const [type, setType] = useState<TypeMutation>(brouillon?.type ?? "reserve_creer");
  const [chantierId, setChantierId] = useState(
    brouillon?.chantierId ?? chantiers[0]?.id ?? "");
  const [reserveId, setReserveId] = useState(brouillon?.reserveId ?? reserves[0]?.id ?? "");
  const [titre, setTitre] = useState(chaine(brouillon?.payload, "titre"));
  const [description, setDescription] = useState(chaine(brouillon?.payload, "description"));
  const [priorite, setPriorite] = useState(
    chaine(brouillon?.payload, "priorite") || "normale");
  const [contenu, setContenu] = useState(
    chaine(brouillon?.payload, "contenu")
    || chaine(brouillon?.payload, "commentaire")
    || chaine(brouillon?.payload, "legende"));
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [poids, setPoids] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  function choisirPhoto(fichierChoisi: File | null) {
    setErreur(null);
    if (apercu) URL.revokeObjectURL(apercu);
    setPoids(null);
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
    setPoids(formaterOctets(fichierChoisi.size));
  }

  /**
   * Enregistre la saisie, soit en BROUILLON (conservé sur l'appareil, non transmis), soit
   * directement EN FILE.
   *
   * Le brouillon manquait à la V5 : l'état existait dans le contrat de la file, mais
   * aucun écran ne savait ni en créer un, ni le rouvrir. Une saisie interrompue — un
   * constat qu'on commence en montant à l'étage — n'avait donc que deux issues : partir
   * telle quelle, incomplète, ou être perdue.
   */
  async function enregistrer(evenement: React.FormEvent, destination: "brouillon" | "en_attente") {
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
        }, { etat: destination, id: brouillon?.id });
      } else if (type === "commentaire_ajouter") {
        if (!reserveId || contenu.trim() === "") {
          setErreur("Choisissez une réserve et écrivez le commentaire.");
          return;
        }
        mutation = creerMutation({
          ...commun, type: "commentaire_ajouter", payload: { contenu: contenu.trim() },
        }, { etat: destination, id: brouillon?.id });
      } else if (type === "photo_ajouter") {
        if (!reserveId || !fichier) {
          setErreur("Choisissez une réserve et une photo.");
          return;
        }
        // Compression AVANT la mise en file, comme sur le chemin en ligne. Stocker le
        // cliché brut saturait le quota du navigateur en quelques constats et imposait
        // de téléverser des dizaines de mégaoctets au retour du réseau ; le passage par
        // le canvas retire au passage les métadonnées EXIF, coordonnées GPS comprises.
        const compressee = await compresserPhoto(fichier);
        photo = compressee;
        mutation = creerMutation({
          ...commun, type: "photo_ajouter",
          payload: {
            usage: "constat", legende: contenu.trim() || null,
            nomFichier: compressee.name, taille: compressee.size, mime: compressee.type,
          },
        }, { etat: destination, id: brouillon?.id });
      } else {
        if (!reserveId) { setErreur("Choisissez une réserve."); return; }
        mutation = creerMutation({
          ...commun, type: "levee_demander",
          payload: { commentaire: contenu.trim() || null },
        }, { etat: destination, id: brouillon?.id });
      }

      // Reprise d'un brouillon : la mutation garde son identifiant — donc sa clé
      // d'idempotence — et l'on repasse par la machine à états plutôt que d'écraser la
      // ligne, pour qu'un brouillon déjà soumis dans un autre onglet ne redevienne pas
      // modifiable en douce.
      if (edition && brouillon) {
        await enregistrerMutation(
          identite,
          { ...brouillon, ...mutation, id: brouillon.id, etat: "brouillon" },
          photo,
        );
        if (destination === "en_attente") {
          await changerEtat(identite, brouillon.id, "en_attente");
        }
      } else {
        await enregistrerMutation(identite, mutation, photo);
      }

      if (destination === "brouillon") {
        setMessage("Brouillon conservé sur l’appareil. Rien n’a été transmis.");
      } else {
        setMessage(
          await reseauJoignable()
            ? "Enregistré sur l’appareil. L’envoi part maintenant."
            : "Enregistré sur l’appareil. L’envoi partira dès le retour du réseau.",
        );
      }
      if (!edition) {
        setTitre(""); setDescription(""); setContenu("");
        if (apercu) URL.revokeObjectURL(apercu);
        setFichier(null); setApercu(null); setPoids(null);
      }
      await surEnregistrement();
      if (edition) surAbandonEdition?.();
    } catch {
      setErreur("Impossible d’enregistrer sur cet appareil : la mémoire locale est refusée ou pleine.");
    } finally {
      setEnvoi(false);
    }
  }

  const cible = type === "reserve_creer";
  if (!edition && chantiers.length === 0 && reserves.length === 0) return null;

  return (
    <form className="carte" onSubmit={(e) => void enregistrer(e, "en_attente")}
          data-test="capture-offline">
      <h2 className="sans-marge">{edition ? "Reprendre le brouillon" : "Saisir maintenant"}</h2>
      <p className="mention">
        La saisie est conservée sur l’appareil et transmise au retour du réseau. Elle
        n’est <strong>pas</strong> encore enregistrée sur le serveur.
      </p>

      <label>
        Action
        <select value={type} data-test="type-mutation" disabled={edition}
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
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apercu} alt="Aperçu de la photo à envoyer" data-test="apercu"
                   style={{ maxWidth: 220, borderRadius: 6, border: "1px solid #ccc" }} />
              {poids && (
                <p className="mention" data-test="poids-photo">
                  {poids} · la photo est allégée au moment de l’enregistrement.
                </p>
              )}
            </>
          )}
        </>
      )}

      {erreur && <div className="message erreur" data-test="erreur-capture">{erreur}</div>}
      {message && <div className="message" data-test="message-capture">{message}</div>}

      <div className="actions">
        <button className="bouton" type="submit" disabled={envoi} data-test="enregistrer">
          {envoi ? "Enregistrement…" : "Mettre en file d’envoi"}
        </button>
        {/* Le brouillon est le seul état d'où l'on peut encore CORRIGER : une fois en
            file, la saisie part telle quelle. Le proposer explicitement évite d'avoir à
            choisir entre « envoyer incomplet » et « tout ressaisir ». */}
        <button className="bouton secondaire" type="button" disabled={envoi}
                data-test="enregistrer-brouillon"
                onClick={(e) => void enregistrer(e, "brouillon")}>
          {edition ? "Conserver le brouillon" : "Garder en brouillon"}
        </button>
        {edition && (
          <button className="bouton secondaire" type="button" disabled={envoi}
                  data-test="abandonner-edition" onClick={() => surAbandonEdition?.()}>
            Fermer sans modifier
          </button>
        )}
      </div>
    </form>
  );
}
