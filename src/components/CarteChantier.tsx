import { carteTuiles, coordonneesValides, lienOpenStreetMap, lienRechercheAdresse } from "@/lib/carte-tuiles";

// CH-09 : carte de localisation du chantier (tuiles OpenStreetMap, sans script
// ni clé d'API). Sans coordonnées enregistrées, affiche l'adresse et un lien de
// recherche : aucun géocodage automatique n'est fait côté serveur.
export function CarteChantier({
  latitude,
  longitude,
  rayonMetres,
  adresse,
}: {
  latitude: number | null;
  longitude: number | null;
  rayonMetres: number | null;
  adresse: string | null;
}) {
  const adresseLisible = adresse?.trim() || null;
  if (!coordonneesValides(latitude, longitude)) {
    return (
      <section aria-label="Carte du chantier" className="space-y-2 rounded-md border p-5">
        <h2 className="text-sm font-semibold">Carte</h2>
        {adresseLisible && <p className="text-sm" data-testid="adresse-chantier">{adresseLisible}</p>}
        <p className="text-sm text-neutral-500">Position GPS non renseignée : la carte s’affichera une fois la position enregistrée ci-dessous.</p>
        {adresseLisible && (
          <a href={lienRechercheAdresse(adresseLisible)} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-700 hover:underline">
            Rechercher l’adresse sur OpenStreetMap
          </a>
        )}
      </section>
    );
  }

  const lat = Number(latitude), lng = Number(longitude);
  const carte = carteTuiles(lat, lng, { rayonMetres });
  return (
    <section aria-label="Carte du chantier" className="space-y-2 rounded-md border p-5">
      <h2 className="text-sm font-semibold">Carte</h2>
      {adresseLisible && <p className="text-sm" data-testid="adresse-chantier">{adresseLisible}</p>}
      <div
        role="img"
        aria-label={`Carte centrée sur ${lat.toFixed(5)}, ${lng.toFixed(5)}`}
        data-testid="carte-chantier"
        data-latitude={lat}
        data-longitude={lng}
        className="relative h-72 w-full overflow-hidden rounded-md bg-neutral-100"
      >
        <div
          className="absolute"
          style={{
            width: carte.largeur,
            height: carte.hauteur,
            left: `calc(50% - ${carte.marqueur.gauche}px)`,
            top: `calc(50% - ${carte.marqueur.haut}px)`,
          }}
        >
          {carte.tuiles.map((tuile) => (
            // Tuiles publiques OSM : servies telles quelles, sans optimisation Next.
            <img /* eslint-disable-line @next/next/no-img-element */
              key={`${tuile.x}-${tuile.y}`}
              src={tuile.url}
              alt=""
              width={256}
              height={256}
              loading="lazy"
              draggable={false}
              className="absolute max-w-none select-none"
              style={{ left: tuile.gauche, top: tuile.haut }}
            />
          ))}
          {carte.rayonPixels !== null && (
            <span
              aria-hidden
              className="absolute rounded-full border-2 border-[#c9a24a] bg-[#c9a24a]/15"
              style={{
                width: carte.rayonPixels * 2,
                height: carte.rayonPixels * 2,
                left: carte.marqueur.gauche - carte.rayonPixels,
                top: carte.marqueur.haut - carte.rayonPixels,
              }}
            />
          )}
          <span
            data-testid="marqueur-chantier"
            aria-hidden
            className="absolute h-4 w-4 rounded-full border-2 border-white bg-red-600 shadow"
            style={{ left: carte.marqueur.gauche - 8, top: carte.marqueur.haut - 8 }}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-500">
        <a href={lienOpenStreetMap(lat, lng)} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
          Ouvrir dans OpenStreetMap
        </a>
        <span>
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:underline">contributeurs OpenStreetMap</a>
        </span>
      </div>
    </section>
  );
}
