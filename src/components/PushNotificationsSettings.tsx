"use client";

import { useEffect, useState } from "react";
import { enregistrerAbonnementPushAction, supprimerAbonnementPushAction, definirPreferenceNotificationAction } from "@/app/actions/push";

type TypeNotification = { cle: string; libelle: string };

function urlBase64VersUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Normalise = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const brut = window.atob(base64Normalise);
  const tableau = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) tableau[i] = brut.charCodeAt(i);
  return tableau;
}

export function PushNotificationsSettings({ clePubliqueVapid, types, preferencesActuelles }: { clePubliqueVapid: string | null; types: TypeNotification[]; preferencesActuelles: Record<string, boolean> }) {
  const [supporte] = useState(() => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
  const [statut, setStatut] = useState<"inactif" | "actif" | "verification">("verification");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [preferences, setPreferences] = useState(preferencesActuelles);

  useEffect(() => {
    if (!supporte) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((abonnement) => setStatut(abonnement ? "actif" : "inactif"))
      .catch(() => setStatut("inactif"));
  }, [supporte]);

  async function activer() {
    if (!clePubliqueVapid) { setErreur("Les notifications push ne sont pas encore configurées sur ce serveur."); return; }
    setErreur(null);
    setEnCours(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setErreur("Autorisation refusée par le navigateur."); return; }
      const registration = await navigator.serviceWorker.ready;
      const abonnement = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64VersUint8Array(clePubliqueVapid) });
      const json = abonnement.toJSON();
      const res = await enregistrerAbonnementPushAction({
        endpoint: abonnement.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        appareil: navigator.userAgent.slice(0, 200),
      });
      if ("error" in res) { setErreur(res.error); return; }
      setStatut("actif");
    } catch {
      setErreur("Impossible d'activer les notifications sur cet appareil.");
    } finally {
      setEnCours(false);
    }
  }

  async function desactiver() {
    setEnCours(true);
    setErreur(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const abonnement = await registration.pushManager.getSubscription();
      if (abonnement) {
        await supprimerAbonnementPushAction(abonnement.endpoint);
        await abonnement.unsubscribe();
      }
      setStatut("inactif");
    } catch {
      setErreur("Impossible de désactiver les notifications sur cet appareil.");
    } finally {
      setEnCours(false);
    }
  }

  async function basculerType(cle: string, actif: boolean) {
    setPreferences((prev) => ({ ...prev, [cle]: actif }));
    const res = await definirPreferenceNotificationAction(cle, actif);
    if ("error" in res) { setErreur(res.error); setPreferences((prev) => ({ ...prev, [cle]: !actif })); }
  }

  if (!supporte) {
    return <p className="rounded-md border border-dashed p-4 text-sm text-neutral-500">Les notifications push ne sont pas prises en charge sur ce navigateur.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Notifications sur cet appareil</p>
            <p className="text-xs text-neutral-500">{statut === "actif" ? "Activées — cet appareil recevra les notifications ci-dessous." : "Désactivées sur cet appareil."}</p>
          </div>
          {statut === "actif" ? (
            <button type="button" onClick={desactiver} disabled={enCours} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Désactiver</button>
          ) : (
            <button type="button" onClick={activer} disabled={enCours || statut === "verification"} className="rounded-md bg-liria-navy px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Activer sur cet appareil</button>
          )}
        </div>
        {erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}
      </div>

      <div className="rounded-md border p-4">
        <p className="text-sm font-medium">Ce que je veux recevoir</p>
        <p className="mt-1 text-xs text-neutral-500">Uniquement les types pertinents pour ton poste actuel. Désactivé par défaut jusqu&apos;à activation ci-dessus.</p>
        <div className="mt-3 space-y-2">
          {types.map((t) => (
            <label key={t.cle} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={preferences[t.cle] !== false} onChange={(e) => basculerType(t.cle, e.target.checked)} />
              <span>{t.libelle}</span>
            </label>
          ))}
          {!types.length && <p className="text-sm text-neutral-500">Aucun type de notification n&apos;est pertinent pour ton poste actuel.</p>}
        </div>
      </div>
    </div>
  );
}
