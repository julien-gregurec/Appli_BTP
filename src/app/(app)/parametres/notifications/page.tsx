import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { typesNotificationsDisponibles } from "@/lib/notifications-registre";
import { PushNotificationsSettings } from "@/components/PushNotificationsSettings";

export default async function NotificationsParametresPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const typesDisponibles = typesNotificationsDisponibles(permissions);

  const { data: preferencesData } = await supabase
    .from("preferences_notifications_push")
    .select("type, actif")
    .eq("utilisateur_id", ctx.userId);
  const preferences = Object.fromEntries((preferencesData ?? []).map((p) => [p.type, p.actif]));

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-1 text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-neutral-500">Reçois une alerte sur ton téléphone ou ton ordinateur dès qu&apos;une action te concerne, même Liria fermé.</p>
        </div>

        <PushNotificationsSettings
          clePubliqueVapid={process.env.VAPID_PUBLIC_KEY ?? null}
          types={typesDisponibles.map((t) => ({ cle: t.cle, libelle: t.libelle }))}
          preferencesActuelles={preferences}
        />
      </div>
    </main>
  );
}
