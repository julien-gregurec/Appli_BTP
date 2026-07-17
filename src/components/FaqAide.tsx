type Question = {
  question: string;
  reponse: string;
};

type Categorie = {
  id: string;
  titre: string;
  questions: Question[];
};

const categories: Categorie[] = [
  {
    id: "acces",
    titre: "Compte et accès",
    questions: [
      {
        question: "Comment inviter un salarié dans l’application ?",
        reponse: "Ouvrez Employés, sélectionnez sa fiche puis utilisez l’invitation. L’administrateur prépare d’abord le poste et les autorisations. Le salarié reçoit ensuite son accès personnel et ne voit que les modules autorisés.",
      },
      {
        question: "Pourquoi certains menus ne sont-ils pas visibles ?",
        reponse: "Les menus sont automatiquement masqués selon les droits du compte. L’administrateur peut modifier ces droits dans Paramètres, puis Accès et rôles, et utiliser l’aperçu d’un poste pour contrôler ce que la personne verra.",
      },
      {
        question: "Puis-je rester connecté sur mon téléphone ou mon ordinateur ?",
        reponse: "Oui. La session reste active jusqu’à la déconnexion, sauf mesure de sécurité ou expiration exceptionnelle. Sur un appareil partagé, utilisez toujours Se déconnecter.",
      },
      {
        question: "La copie numérique de la Carte BTP remplace-t-elle la carte officielle ?",
        reponse: "Non. Elle sert uniquement de badge professionnel interne. La Carte BTP officielle ou l’attestation provisoire CIBTP valable reste le document à présenter lors d’un contrôle.",
      },
    ],
  },
  {
    id: "documents",
    titre: "Devis, factures et paiements clients",
    questions: [
      {
        question: "Comment créer rapidement un devis ?",
        reponse: "Dans Devis, choisissez Nouveau devis, sélectionnez ou créez le client et le chantier, puis insérez des prestations enregistrées. Les lignes, remises, taux de TVA et totaux restent modifiables avant validation.",
      },
      {
        question: "Comment transformer un devis accepté en facture ?",
        reponse: "Ouvrez le devis accepté puis utilisez l’action de facturation. Le client, le chantier et les lignes sont repris afin d’éviter une nouvelle saisie. Vérifiez les montants avant de valider la facture.",
      },
      {
        question: "Comment télécharger un devis ou une facture en PDF ?",
        reponse: "Ouvrez la fiche du document puis choisissez Télécharger PDF ou Imprimer. La mise en page, le logo et les mentions utilisent les réglages de l’entreprise.",
      },
      {
        question: "Qui peut voir les prix et les chiffres de l’entreprise ?",
        reponse: "Uniquement les comptes disposant des droits financiers correspondants. Un ouvrier peut consulter les travaux de ses chantiers sans voir les prix clients, fournisseurs, marges ou indicateurs globaux.",
      },
    ],
  },
  {
    id: "terrain",
    titre: "Planning, chantiers et pointage",
    questions: [
      {
        question: "Comment affecter un salarié à un chantier ?",
        reponse: "Depuis le chantier ou le planning, ajoutez l’employé à l’équipe et précisez la date, le nombre d’heures et la tâche. Le chantier apparaît ensuite dans son planning et dans son espace terrain.",
      },
      {
        question: "Comment fonctionne le pointage GPS ?",
        reponse: "Le salarié pointe uniquement en son nom, choisit le chantier et autorise sa position. L’heure et la date sont enregistrées côté serveur. L’arrivée et le départ sont ensuite contrôlés par une personne habilitée.",
      },
      {
        question: "Que faire en cas d’oubli d’arrivée ou de départ ?",
        reponse: "Le pointage peut tout de même être transmis, mais il passe en vérification. Le responsable reçoit une alerte et corrige ou valide les heures en conservant la traçabilité de l’action.",
      },
      {
        question: "Où ajouter des plans et des photos de chantier ?",
        reponse: "Ouvrez le chantier puis Photos et documents. Les droits de consultation permettent de choisir quels profils peuvent accéder aux fichiers déposés.",
      },
    ],
  },
  {
    id: "achats",
    titre: "Achats, fournisseurs et stock",
    questions: [
      {
        question: "Comment réceptionner une commande partiellement ?",
        reponse: "Ouvrez la commande et renseignez, ligne par ligne, les quantités réellement reçues. Les quantités manquantes restent à recevoir et le statut de la commande est mis à jour automatiquement.",
      },
      {
        question: "Comment classer une facture fournisseur ?",
        reponse: "Dans Dépenses, créez ou ouvrez la facture fournisseur, joignez le justificatif puis associez le fournisseur, le chantier et, si nécessaire, le véhicule, l’outil ou la commande concernés.",
      },
      {
        question: "Comment effectuer une entrée ou une sortie de stock ?",
        reponse: "Utilisez Stock ou la borne dépôt. Scannez le QR code ou le code-barres, choisissez le mouvement et le chantier, puis confirmez la quantité. Chaque mouvement reste attribué à l’employé identifié.",
      },
      {
        question: "Que se passe-t-il lorsqu’un outil est hors service ?",
        reponse: "Il devient indisponible pour les nouvelles affectations. Le gestionnaire d’outillage reçoit l’information et peut suivre sa réparation ou enregistrer sa mise au rebut s’il n’est pas réparable.",
      },
    ],
  },
  {
    id: "administratif",
    titre: "Notes de frais, congés et exports",
    questions: [
      {
        question: "Comment envoyer une note de frais ?",
        reponse: "Dans Notes de frais, photographiez ou importez le justificatif, renseignez la dépense et le chantier, puis transmettez-la. Le salarié suit uniquement ses propres demandes ; les responsables habilités contrôlent et valident.",
      },
      {
        question: "Dois-je conserver le justificatif papier ?",
        reponse: "Oui, tant que l’entreprise n’a pas confirmé une procédure de conservation conforme. L’import numérique facilite le traitement comptable mais ne signifie pas automatiquement que l’original papier peut être détruit.",
      },
      {
        question: "Comment demander un congé ?",
        reponse: "Dans Congés, choisissez le type et les dates puis créez la demande. Elle est directement transmise au responsable désigné, sans étape de brouillon supplémentaire.",
      },
      {
        question: "Comment transmettre les données au comptable ?",
        reponse: "Le module Exports permet de télécharger des fichiers Excel mis en forme ou des CSV bruts. Les notes de frais disposent également d’un export avec les justificatifs et leur historique selon les droits du compte.",
      },
    ],
  },
];

export function FaqAide() {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950" aria-labelledby="faq-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78028]">Réponses immédiates</p>
        <h2 id="faq-title" className="mt-1 text-lg font-semibold">Questions fréquentes</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Sélectionnez une question pour afficher la réponse. Si votre problème persiste, écrivez au support en bas de page.</p>
      </div>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Catégories de la FAQ">
        {categories.map((categorie) => (
          <a key={categorie.id} href={`#faq-${categorie.id}`} className="whitespace-nowrap rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:border-[#c9a24a] hover:bg-[#c9a24a]/10 dark:border-neutral-700">
            {categorie.titre}
          </a>
        ))}
      </nav>

      <div className="mt-5 space-y-6">
        {categories.map((categorie) => (
          <div key={categorie.id} id={`faq-${categorie.id}`} className="scroll-mt-24">
            <h3 className="mb-2 text-sm font-semibold text-[#a78028]">{categorie.titre}</h3>
            <div className="divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {categorie.questions.map((item) => (
                <details key={item.question} className="group bg-white open:bg-neutral-50 dark:bg-neutral-950 dark:open:bg-neutral-900">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium marker:content-none">
                    <span>{item.question}</span>
                    <span aria-hidden="true" className="grid h-6 w-6 flex-none place-items-center rounded-full bg-neutral-100 text-base leading-none transition group-open:rotate-45 dark:bg-neutral-800">+</span>
                  </summary>
                  <p className="px-4 pb-4 pr-12 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{item.reponse}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
