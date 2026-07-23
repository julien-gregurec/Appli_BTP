"use client";

import { useMemo, useState } from "react";

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
    titre: "Compte, rôles et accès",
    questions: [
      {
        question: "Comment inviter un salarié dans l’application ?",
        reponse: "Créez d’abord sa fiche dans Employés, choisissez son poste et vérifiez les autorisations. Depuis la fiche, envoyez ensuite l’invitation ou communiquez son numéro d’inscription. Le salarié active son compte personnel ; il ne doit jamais utiliser le compte d’un collègue.",
      },
      {
        question: "Pourquoi certains menus ou indicateurs ne sont-ils pas visibles ?",
        reponse: "Le menu, le tableau de bord et les chiffres sont filtrés par les droits du poste. L’administrateur règle séparément la consultation et la gestion dans Paramètres > Accès et rôles. Un droit refusé masque le module et l’accès direct reste bloqué côté serveur.",
      },
      {
        question: "Comment vérifier ce que voit un poste ?",
        reponse: "Dans Paramètres > Accès et rôles, ouvrez l’aperçu du poste. Contrôlez les modules, les actions de gestion, les prix, les indicateurs financiers, les chantiers visibles et les validations avant d’inviter les utilisateurs.",
      },
      {
        question: "Un salarié peut-il rester connecté ?",
        reponse: "Oui, sur ses appareils personnels. Chaque compte inclut deux appareils. Au-delà, un supplément peut être facturé selon l’offre ; l’administrateur retrouve l’avertissement dans Abonnement et peut révoquer les anciens appareils depuis la fiche employé.",
      },
      {
        question: "Comment suspendre ou fermer l’accès d’un salarié ?",
        reponse: "Ouvrez sa fiche Employés puis mettez son compte en pause ou fermez-le. La fiche et l’historique métier restent conservés. Un compte en pause peut rester facturable selon les conditions de l’abonnement.",
      },
      {
        question: "La copie numérique de la Carte BTP remplace-t-elle la carte officielle ?",
        reponse: "Non. Elle sert de badge professionnel interne et porte l’avertissement prévu. La Carte BTP officielle ou l’attestation provisoire CIBTP encore valable reste le document à présenter lors d’un contrôle.",
      },
    ],
  },
  {
    id: "clients-documents",
    titre: "Clients, devis et documents",
    questions: [
      {
        question: "Puis-je créer un client et un chantier pendant la création d’un devis ?",
        reponse: "Oui. L’éditeur permet de sélectionner un dossier existant ou de créer les informations manquantes sans quitter le devis. Vérifiez ensuite la liaison client–chantier avant l’enregistrement.",
      },
      {
        question: "Comment utiliser les prestations préenregistrées ?",
        reponse: "Dans Devis, choisissez une prestation du catalogue. La désignation, la description, le type, l’unité, le prix HT et la TVA sont repris ; la ligne reste modifiable dans le devis.",
      },
      {
        question: "Pourquoi un devis accepté ne peut-il pas rester sans chantier ?",
        reponse: "Le chantier reçoit les tâches, les heures et la rentabilité issues du devis. Pour préserver cette synchronisation, rattachez le devis au bon chantier avant ou au moment de son acceptation.",
      },
      {
        question: "Comment transformer un devis en facture ?",
        reponse: "Ouvrez un devis accepté puis utilisez l’action de facturation. Le client, le chantier et les lignes sont repris. Contrôlez la TVA, l’échéance et les mentions avant d’émettre le document.",
      },
      {
        question: "Comment personnaliser les devis et factures ?",
        reponse: "Dans Paramètres, choisissez le modèle, la police, les couleurs, la position du logo et les mentions. Téléchargez un aperçu PDF avant d’utiliser le modèle pour des documents réels.",
      },
      {
        question: "La signature numérique remplace-t-elle toujours une signature qualifiée ?",
        reponse: "Non. Le niveau de signature requis dépend du document et de l’enjeu. Utilisez le circuit prévu dans Liria, conservez l’identité, l’horodatage et l’audit, puis faites valider les cas sensibles par votre conseil juridique.",
      },
    ],
  },
  {
    id: "facturation",
    titre: "Facturation, situations et encaissements",
    questions: [
      {
        question: "Pourquoi aucun devis n’apparaît dans Situation ou Acompte ?",
        reponse: "Ces listes proposent uniquement les devis acceptés. Une situation exige aussi un chantier rattaché. Acceptez le devis, associez-le au chantier puis rechargez la page.",
      },
      {
        question: "Quelle différence entre acompte, situation, solde, avoir et DGD ?",
        reponse: "L’acompte finance le démarrage ; la situation facture l’avancement cumulé ; le solde clôture le montant restant ; l’avoir corrige une facture sans la supprimer ; le DGD formalise le décompte final. Faites valider votre méthode par le comptable.",
      },
      {
        question: "Comment fonctionne l’avancement cumulé ?",
        reponse: "Saisissez le pourcentage total atteint depuis le début du marché. Liria déduit les situations précédentes pour calculer la période. Ne saisissez pas seulement le pourcentage réalisé depuis la dernière situation.",
      },
      {
        question: "Comment un client paie-t-il en ligne ?",
        reponse: "Depuis la facture client, une personne autorisée génère un lien de paiement et l’envoie au client. Le paiement arrive sur le compte Stripe connecté de l’entreprise. Le dirigeant ne doit pas payer lui-même une facture destinée à son client.",
      },
      {
        question: "Comment enregistrer un paiement reçu hors ligne ?",
        reponse: "Sur la fiche facture, enregistrez le règlement réellement reçu avec sa date, son mode et sa référence. Le reste dû et le statut se mettent à jour ; n’anticipez jamais une confirmation bancaire.",
      },
      {
        question: "Une facture émise peut-elle être supprimée ?",
        reponse: "Non. Pour conserver une numérotation et un audit cohérents, corrigez-la par un avoir puis créez, si nécessaire, une nouvelle facture.",
      },
    ],
  },
  {
    id: "chantier",
    titre: "Chantiers, planning et travaux",
    questions: [
      {
        question: "Comment affecter un salarié à un chantier ?",
        reponse: "Depuis le chantier ou le planning, ajoutez l’employé à l’équipe et précisez la date, la durée et la tâche. Le chantier apparaît ensuite dans son planning, son espace terrain et ses choix de pointage.",
      },
      {
        question: "Un ouvrier voit-il tous les chantiers ?",
        reponse: "Non, sauf si l’administrateur lui accorde un périmètre plus large. Par défaut, un profil terrain consulte uniquement les chantiers auxquels il est affecté, sans les prix ni les marges.",
      },
      {
        question: "Où trouver les travaux issus du devis ?",
        reponse: "Après acceptation du devis lié au chantier, les travaux autorisés apparaissent dans le suivi du chantier et dans Mes travaux. Les profils sans droit financier voient le contenu utile, sans les prix.",
      },
      {
        question: "Comment ajouter des plans, photos et documents ?",
        reponse: "Ouvrez le chantier puis Photos et documents. Déposez le fichier, choisissez sa catégorie et son niveau de visibilité. N’accordez l’accès qu’aux postes qui en ont besoin.",
      },
      {
        question: "Comment suivre les coûts réels du chantier ?",
        reponse: "Validez les heures, classez les factures fournisseurs, notes de frais, sous-traitants, déplacements et sorties de stock sur le chantier. La rentabilité dépend de ce classement.",
      },
      {
        question: "Peut-on planifier du bureau, du dépôt ou une visite médicale ?",
        reponse: "Oui. Lorsqu’une activité n’est pas un chantier, choisissez le type d’activité prévu (bureau, dépôt, visite médicale ou autre) afin que le temps reste expliqué sans créer un faux chantier.",
      },
    ],
  },
  {
    id: "pointage",
    titre: "Pointage, congés et déplacements",
    questions: [
      {
        question: "Comment fonctionne le pointage GPS ?",
        reponse: "Le salarié pointe uniquement en son nom, choisit le chantier ou l’activité et autorise sa position. La date et l’heure de référence sont enregistrées côté serveur. Le responsable habilité contrôle ensuite les anomalies.",
      },
      {
        question: "Un responsable peut-il pointer à la place d’un salarié ?",
        reponse: "Non. Il peut consulter, corriger ou valider selon ses droits, mais il ne doit pas créer une arrivée ou un départ au nom d’un autre utilisateur. Cette règle protège la valeur de la preuve.",
      },
      {
        question: "Que faire si l’arrivée ou le départ a été oublié ?",
        reponse: "Transmettez le pointage incomplet ou demandez sa correction. Il passe en vérification. Les durées anormales, notamment au-delà des seuils configurés, doivent être contrôlées et justifiées.",
      },
      {
        question: "Qui voit les pointages de l’équipe ?",
        reponse: "Un salarié voit ses propres pointages. Seuls les postes auxquels l’administrateur a accordé la gestion ou la validation voient et traitent ceux des autres.",
      },
      {
        question: "Comment demander un congé ?",
        reponse: "Dans Congés, choisissez le type et les dates puis créez la demande. Elle est transmise au responsable. Après validation, l’absence apparaît au planning et n’est pas une journée à pointer.",
      },
      {
        question: "Comment déclarer un grand déplacement ?",
        reponse: "Choisissez la période et le chantier, renseignez hébergement, repas et transport, ajoutez les justificatifs puis soumettez. Les éléments validés peuvent être repris dans la préparation de la paie.",
      },
    ],
  },
  {
    id: "achats",
    titre: "Achats, fournisseurs et sous-traitants",
    questions: [
      {
        question: "Comment réceptionner une commande partiellement ?",
        reponse: "Ouvrez la commande et renseignez chaque quantité réellement reçue. Les manquants restent à recevoir et le statut passe automatiquement à réception partielle jusqu’à la livraison complète.",
      },
      {
        question: "Comment scanner plusieurs articles reçus ?",
        reponse: "Depuis le dépôt, ouvrez une session de réception, scannez les articles les uns après les autres, corrigez les quantités puis contrôlez les commandes proposées. Une série peut rapprocher plusieurs commandes avant validation.",
      },
      {
        question: "Comment classer une facture fournisseur ?",
        reponse: "Dans Factures fournisseurs, saisissez ou importez la pièce, associez le fournisseur, la commande et le chantier. Ajoutez si nécessaire le véhicule, l’outil ou le sous-traitant concerné.",
      },
      {
        question: "Comment la TVA d’un achat est-elle calculée ?",
        reponse: "Saisissez le HT puis choisissez le taux applicable parmi les taux prévus. La TVA et le TTC sont recalculés dans l’interface et côté serveur. Vérifiez toujours le taux figurant sur la facture.",
      },
      {
        question: "Où enregistrer le RIB d’un fournisseur ou sous-traitant ?",
        reponse: "Depuis sa fiche, utilisez la section Coordonnées bancaires. Le RIB complet est chiffré ; seules ses dernières positions restent visibles. Il doit être vérifié avant une préparation de virement.",
      },
      {
        question: "Peut-on connecter n’importe quel fournisseur ?",
        reponse: "Tout fournisseur peut être référencé et ses tarifs peuvent être importés. Une synchronisation automatique exige toutefois un accès officiel API, EDI, PunchOut ou OAuth fourni par le partenaire ; Liria ne stocke jamais son mot de passe portail.",
      },
    ],
  },
  {
    id: "stock",
    titre: "Stock, dépôt, inventaire et matériel",
    questions: [
      {
        question: "Comment fonctionne le compte dépôt ?",
        reponse: "C’est un compte dédié verrouillé sur le stock, la réception et les mouvements. L’employé s’identifie avec son code ou son QR puis son mot de passe stock. Seules les personnes habilitées peuvent sortir du mode dépôt.",
      },
      {
        question: "Comment effectuer une sortie groupée ?",
        reponse: "Scannez tous les articles, corrigez les quantités, choisissez la destination — chantier, véhicule ou outillage selon l’écran — puis vérifiez le récapitulatif avant de confirmer.",
      },
      {
        question: "Le scanner reconnaît-il le type de QR code ?",
        reponse: "Oui, les préfixes et références permettent de distinguer un employé, un chantier, un véhicule, un outil ou un article. Vérifiez néanmoins le nom affiché avant tout mouvement.",
      },
      {
        question: "Les prix du stock sont-ils visibles par tous ?",
        reponse: "Non. La consultation et la gestion des prix d’achat, prix de revente et valeur de stock dépendent des droits accordés par l’administrateur.",
      },
      {
        question: "Que se passe-t-il lorsqu’un outil est hors service ?",
        reponse: "Il devient indisponible pour les affectations. Le gestionnaire suit sa réparation et, s’il est irréparable, enregistre sa mise au rebut avec l’historique nécessaire.",
      },
      {
        question: "Comment préparer la clôture annuelle du stock ?",
        reponse: "Créez un inventaire sur les références voulues, comptez les quantités puis validez. Le rapport compare théorique et compté, valorise l’écart au prix d’achat figé et s’exporte en Excel ou CSV pour contrôle comptable.",
      },
    ],
  },
  {
    id: "frais-paie",
    titre: "Notes de frais, paie et banque",
    questions: [
      {
        question: "Comment envoyer une note de frais ?",
        reponse: "Photographiez ou importez l’original, saisissez la dépense, choisissez chantier, dépôt, bureau ou sans chantier, puis soumettez. Le salarié suit ses propres notes ; les responsables habilités les contrôlent.",
      },
      {
        question: "Dois-je conserver le justificatif papier ?",
        reponse: "Oui, jusqu’à confirmation par votre entreprise d’une procédure de conservation conforme. L’import numérique facilite le traitement mais n’autorise pas automatiquement la destruction du papier.",
      },
      {
        question: "Comment les notes de frais sont-elles regroupées ?",
        reponse: "Le responsable peut les consulter par employé et période avant validation. L’historique personnel reste accessible depuis la fiche employé selon les droits.",
      },
      {
        question: "Liria produit-il les bulletins de paie officiels ?",
        reponse: "Non. Liria prépare les variables issues des heures, congés et déplacements, puis les transmet au cabinet. Le bulletin légal et la DSN restent produits par le prestataire de paie.",
      },
      {
        question: "Où enregistrer le RIB d’un employé ?",
        reponse: "Depuis sa fiche Employés, dans la section bancaire réservée. Le RIB est chiffré et doit être vérifié avant de préparer un salaire ou un remboursement.",
      },
      {
        question: "Un bulletin reçu déclenche-t-il automatiquement le salaire ?",
        reponse: "Non. Le bulletin contrôlé permet de préparer une source. Un lot doit ensuite être validé puis transmis au prestataire bancaire avec authentification forte. Aucun argent ne part sans ces étapes.",
      },
    ],
  },
  {
    id: "crm",
    titre: "CRM, messagerie, appels d’offres et interventions",
    questions: [
      {
        question: "Comment conserver l’historique d’un appel ou rendez-vous ?",
        reponse: "Dans CRM et relances, choisissez le client, le canal, le sens, l’objet et le compte rendu. Programmez un rappel si une nouvelle action est attendue.",
      },
      {
        question: "Comment envoyer une consigne à toute l’équipe d’un chantier ?",
        reponse: "Dans Messagerie, créez une conversation de type chantier. Seules les personnes autorisées sur ce chantier doivent accéder au fil.",
      },
      {
        question: "Qui doit voir les appels d’offres ?",
        reponse: "En général la direction, le commercial et les personnes chargées de préparer les réponses. L’administrateur peut retirer ce module aux chefs d’équipe et profils terrain.",
      },
      {
        question: "À quoi servent les ouvrages et métrés ?",
        reponse: "Les ouvrages sont des modèles chiffrés réutilisables. Les métrés enregistrent dimensions, déductions, unité, formule et résultat afin d’accélérer un devis tout en gardant le calcul justifiable.",
      },
      {
        question: "Comment créer un bon d’intervention ?",
        reponse: "Créez l’intervention avec client, site, problème, priorité, date et intervenants. Sur place, renseignez travaux, temps, pièces et photos, puis recueillez la validation prévue avant clôture.",
      },
    ],
  },
  {
    id: "pilotage",
    titre: "Rentabilité, trésorerie et comptabilité",
    questions: [
      {
        question: "Pourquoi la rentabilité d’un chantier est-elle incomplète ?",
        reponse: "Vérifiez qu’un devis accepté est lié, que les heures sont validées, que les coûts horaires existent et que factures, notes de frais, sous-traitants, déplacements et sorties de stock sont classés sur ce chantier.",
      },
      {
        question: "Comment voir le détail d’une échéance de trésorerie ?",
        reponse: "Dépliez la semaine concernée. Le détail indique date, retard, type, référence, tiers, chantier, montant et lien vers le document source.",
      },
      {
        question: "Comment transmettre les données au comptable ?",
        reponse: "Dans Exports comptables, choisissez la période et le journal. Préférez le classeur Excel mis en forme pour la lecture ou le CSV UTF-8 si son logiciel l’exige. Les justificatifs peuvent être exportés avec leur manifeste.",
      },
      {
        question: "Pourquoi les accents sont-ils incorrects dans un CSV ?",
        reponse: "Le tableur a probablement ouvert le fichier avec un mauvais encodage. Utilisez l’export Excel recommandé ou importez le CSV comme UTF-8 avec le séparateur indiqué.",
      },
      {
        question: "Les graphiques tiennent-ils compte de mes droits ?",
        reponse: "Oui. Les totaux et états de chantier sont calculés uniquement sur le périmètre que le compte peut consulter. Un ouvrier ne doit pas recevoir une vue globale de l’entreprise.",
      },
    ],
  },
  {
    id: "abonnement-ia",
    titre: "Abonnement, stockage, IA et notifications",
    questions: [
      {
        question: "Où voir le coût de Liria Gestion Pro ?",
        reponse: "L’administrateur ouvre Administration > Abonnement. Il y retrouve l’offre, les comptes facturables, options, dépassements d’appareils, stockage, factures et accès au portail Stripe.",
      },
      {
        question: "Pourquoi un compte affiche-t-il un supplément d’appareil ?",
        reponse: "Deux appareils sont inclus par compte. Lorsqu’un troisième appareil est utilisé pendant le mois, le supplément annoncé peut s’appliquer. Révoquez les appareils obsolètes depuis la fiche employé.",
      },
      {
        question: "Comment le stockage est-il compté ?",
        reponse: "Les photos, plans, justificatifs, factures et autres documents privés occupent le stockage de l’entreprise. L’écran Abonnement affiche la consommation et le quota de l’offre.",
      },
      {
        question: "L’assistant IA peut-il voir toutes les données ?",
        reponse: "Non. Il est limité par les mêmes droits et le même périmètre que l’utilisateur. Une personne qui ne voit pas les prix ou un chantier ne doit pas pouvoir les obtenir par l’IA.",
      },
      {
        question: "Une réponse IA est-elle automatiquement appliquée ?",
        reponse: "Non. Elle reste une proposition à relire. Contrôlez toujours montants, dates, références, obligations juridiques et destinataire avant envoi ou décision.",
      },
      {
        question: "Comment activer les notifications ?",
        reponse: "Autorisez-les sur l’appareil lorsque Liria le propose. Les alertes restent filtrées par les droits : planning, pointages, validations, échéances et autres événements autorisés.",
      },
    ],
  },
  {
    id: "securite",
    titre: "Sécurité, imports et dépannage",
    questions: [
      {
        question: "Puis-je importer les données d’un autre logiciel ?",
        reponse: "Oui, via Paramètres > Import, avec les exports disponibles de Batappli, Batigest ou d’autres logiciels. Commencez dans une entreprise de test, contrôlez la correspondance des colonnes et conservez l’export source.",
      },
      {
        question: "Liria stocke-t-il mes mots de passe fournisseur ou bancaire ?",
        reponse: "Non. Les connecteurs doivent utiliser des accès officiels API, EDI, PunchOut ou OAuth. L’authentification bancaire forte se déroule chez le prestataire réglementé.",
      },
      {
        question: "Que faire si un module affiche une page vide ou une erreur d’autorisation ?",
        reponse: "Notez la page, l’heure, le compte et l’action effectuée. Actualisez une fois, puis vérifiez les droits et le statut de la fiche. Si le problème persiste, envoyez ces éléments au support sans joindre de secret.",
      },
      {
        question: "Comment utiliser Liria sur mobile ?",
        reponse: "Ouvrez l’adresse sécurisée puis installez l’application web sur l’écran d’accueil. Autorisez la caméra, la position et les notifications uniquement si le poste utilise ces fonctions.",
      },
      {
        question: "Comment retrouver une réponse plus détaillée ?",
        reponse: "Utilisez la recherche de cette FAQ puis ouvrez le manuel PDF complet en haut de la page Aide. Il décrit chaque module, les droits, les étapes, les synchronisations et les erreurs fréquentes.",
      },
    ],
  },
];

function normaliser(texte: string) {
  return texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
}

export function FaqAide() {
  const [recherche, setRecherche] = useState("");
  const categoriesFiltrees = useMemo(() => {
    const terme = normaliser(recherche.trim());
    if (!terme) return categories;
    return categories
      .map((categorie) => ({
        ...categorie,
        questions: categorie.questions.filter((item) =>
          normaliser(`${categorie.titre} ${item.question} ${item.reponse}`).includes(terme),
        ),
      }))
      .filter((categorie) => categorie.questions.length > 0);
  }, [recherche]);
  const total = categories.reduce((somme, categorie) => somme + categorie.questions.length, 0);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950" aria-labelledby="faq-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78028]">Réponses immédiates</p>
        <h2 id="faq-title" className="mt-1 text-lg font-semibold">Questions fréquentes</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Recherchez parmi {total} réponses, puis ouvrez la question correspondant à votre situation.
        </p>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Rechercher dans la FAQ</span>
        <input
          type="search"
          value={recherche}
          onChange={(event) => setRecherche(event.target.value)}
          placeholder="Ex. pointage, TVA, RIB, situation, stock…"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#c9a24a] focus:ring-2 focus:ring-[#c9a24a]/20 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {!recherche && (
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Catégories de la FAQ">
          {categories.map((categorie) => (
            <a key={categorie.id} href={`#faq-${categorie.id}`} className="whitespace-nowrap rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:border-[#c9a24a] hover:bg-[#c9a24a]/10 dark:border-neutral-700">
              {categorie.titre}
            </a>
          ))}
        </nav>
      )}

      <div className="mt-5 space-y-6">
        {categoriesFiltrees.map((categorie) => (
          <div key={categorie.id} id={`faq-${categorie.id}`} className="scroll-mt-24">
            <h3 className="mb-2 text-sm font-semibold text-[#a78028]">
              {categorie.titre} <span className="font-normal text-neutral-400">({categorie.questions.length})</span>
            </h3>
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
        {categoriesFiltrees.length === 0 && (
          <p className="rounded-md border border-dashed p-5 text-center text-sm text-neutral-500">
            Aucune réponse ne correspond. Essayez un mot plus court ou écrivez au support ci-dessous.
          </p>
        )}
      </div>
    </section>
  );
}
