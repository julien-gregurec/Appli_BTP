"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StatutFacteur = "verified" | "unverified";
type Facteur = { id: string; nom: string | null; statut: StatutFacteur };
type Enrolement = { factorId: string; qrCode: string; secret: string };

// Messages neutres, sans détail technique. Aucun secret, QR ou code n'est
// journalisé : ce composant s'exécute uniquement dans le navigateur et ne
// contient aucun appel console/analytics.
const MESSAGE_ERREUR = "Action impossible pour le moment. Réessayez dans un instant.";
const MESSAGE_CODE = "Code incorrect ou expiré.";

export function SecuriteMfaClient() {
  const [supabase] = useState(() => createClient());

  const [chargement, setChargement] = useState(true);
  const [facteurs, setFacteurs] = useState<Facteur[]>([]);
  const [sessionAal2, setSessionAal2] = useState(false);
  const [enrolement, setEnrolement] = useState<Enrolement | null>(null);
  const [code, setCode] = useState("");
  const [afficherCle, setAfficherCle] = useState(false);
  const [confirmationReprise, setConfirmationReprise] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      const [liste, niveau] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      const totp = (liste.data?.totp ?? []).map((facteur) => ({
        id: facteur.id,
        nom: facteur.friendly_name ?? null,
        statut: (facteur.status === "verified" ? "verified" : "unverified") as StatutFacteur,
      }));
      setFacteurs(totp);
      setSessionAal2(niveau.data?.currentLevel === "aal2");
    } catch {
      setMessage(MESSAGE_ERREUR);
    } finally {
      setChargement(false);
    }
  }, [supabase]);

  useEffect(() => {
    let annule = false;
    Promise.resolve()
      .then(() => rafraichir())
      .catch(() => {
        if (!annule) setMessage(MESSAGE_ERREUR);
      });
    return () => {
      annule = true;
    };
  }, [rafraichir]);

  const facteurVerifie = facteurs.find((facteur) => facteur.statut === "verified") ?? null;
  const facteurEnAttente = facteurs.find((facteur) => facteur.statut === "unverified") ?? null;

  async function demarrerEnrolement() {
    // Empêche deux enrôlements concurrents.
    if (enCours) return;
    setEnCours(true);
    setMessage(null);
    setSucces(null);
    try {
      // Un enrôlement inachevé n'est retiré que sur action explicite de
      // l'utilisateur (bouton « Recommencer » confirmé).
      if (facteurEnAttente) {
        await supabase.auth.mfa.unenroll({ factorId: facteurEnAttente.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authentificateur ELSATIA (${new Date().toLocaleDateString("fr-CA")})`,
      });
      if (error || !data) {
        setMessage(MESSAGE_ERREUR);
        return;
      }
      setEnrolement({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setConfirmationReprise(false);
      setAfficherCle(false);
      setCode("");
    } catch {
      setMessage(MESSAGE_ERREUR);
    } finally {
      setEnCours(false);
    }
  }

  async function validerCode() {
    if (enCours || !enrolement) return;
    if (!/^\d{6}$/.test(code)) {
      setMessage(MESSAGE_CODE);
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const defi = await supabase.auth.mfa.challenge({ factorId: enrolement.factorId });
      if (defi.error || !defi.data) {
        setMessage(MESSAGE_ERREUR);
        return;
      }
      const verification = await supabase.auth.mfa.verify({
        factorId: enrolement.factorId,
        challengeId: defi.data.id,
        code,
      });
      if (verification.error) {
        setMessage(MESSAGE_CODE);
        return;
      }
      // Le secret et le QR ne sont plus nécessaires : on les retire de l'état.
      setEnrolement(null);
      setCode("");
      setAfficherCle(false);
      await rafraichir();
      setSucces("Facteur vérifié. Votre session est désormais de niveau renforcé (aal2).");
    } catch {
      setMessage(MESSAGE_ERREUR);
    } finally {
      setEnCours(false);
    }
  }

  function annulerEnrolement() {
    setEnrolement(null);
    setCode("");
    setAfficherCle(false);
    setMessage(null);
  }

  if (chargement) {
    return <p className="text-sm text-neutral-500">Chargement…</p>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}
      {succes && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{succes}</p>
      )}

      <section className="rounded-md border p-4">
        <h2 className="font-semibold">État des facteurs</h2>
        {facteurs.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">Aucun facteur configuré.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {facteurs.map((facteur) => (
              <li key={facteur.id} className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    facteur.statut === "verified" ? "bg-green-600" : "bg-amber-500"
                  }`}
                />
                <span>{facteur.nom ?? "Application d’authentification"}</span>
                <span className="text-neutral-500">
                  · {facteur.statut === "verified" ? "vérifié" : "en attente"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-neutral-500">
          Session courante :{" "}
          <strong>{sessionAal2 ? "authentification renforcée (aal2)" : "standard (aal1)"}</strong>
        </p>
      </section>

      {facteurVerifie ? (
        <section className="rounded-md border border-green-200 bg-green-50/50 p-4">
          <h2 className="font-semibold">Authentification renforcée active</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Un facteur TOTP vérifié protège ce compte. La suppression d’un facteur vérifié
            n’est pas proposée dans cette version.
          </p>
          {!sessionAal2 && (
            <p className="mt-2 text-sm text-amber-800">
              Votre session actuelle n’est pas de niveau renforcé. Reconnectez-vous pour
              l’élever avant d’accéder aux opérations sensibles.
            </p>
          )}
        </section>
      ) : enrolement ? (
        <section className="space-y-4 rounded-md border p-4">
          <h2 className="font-semibold">Enrôlement en cours</h2>
          <p className="text-sm text-neutral-600">
            Scannez ce QR code dans votre application d’authentification, puis saisissez le
            code à six chiffres. Ce QR code n’est affiché qu’ici.
          </p>
          {/* Le QR est un data URI renvoyé par Supabase ; il n'est ni téléchargé
              ni journalisé. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrolement.qrCode}
            alt="QR code d’enrôlement à scanner"
            className="h-48 w-48 rounded-md border bg-white p-2"
          />
          <div className="text-sm">
            <button
              type="button"
              onClick={() => setAfficherCle((valeur) => !valeur)}
              className="text-neutral-600 underline"
            >
              {afficherCle ? "Masquer la clé manuelle" : "Afficher la clé manuelle"}
            </button>
            {afficherCle && (
              <p className="mt-2 break-all rounded-md bg-neutral-100 px-3 py-2 font-mono text-xs">
                {enrolement.secret}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="mfa-code" className="text-sm font-medium">
              Code à six chiffres
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(evenement) => setCode(evenement.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-lg tracking-[0.5em]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={validerCode}
              disabled={enCours}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Valider le code
            </button>
            <button
              type="button"
              onClick={annulerEnrolement}
              disabled={enCours}
              className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </section>
      ) : facteurEnAttente ? (
        <section className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="font-semibold">Un enrôlement est déjà en attente</h2>
          <p className="text-sm text-neutral-600">
            Un enrôlement TOTP a été démarré mais jamais confirmé. Pour en recommencer un,
            l’enrôlement en attente sera d’abord supprimé.
          </p>
          {confirmationReprise ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={demarrerEnrolement}
                disabled={enCours}
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirmer et recommencer
              </button>
              <button
                type="button"
                onClick={() => setConfirmationReprise(false)}
                disabled={enCours}
                className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmationReprise(true)}
              className="rounded-md border px-3 py-2 text-sm font-medium"
            >
              Recommencer l’enrôlement
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-semibold">Ajouter une application d’authentification</h2>
          <p className="text-sm text-neutral-600">
            Vous aurez besoin d’une application TOTP (Google Authenticator, 1Password, Aegis…).
          </p>
          <button
            type="button"
            onClick={demarrerEnrolement}
            disabled={enCours}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Démarrer l’enrôlement
          </button>
        </section>
      )}
    </div>
  );
}
