# @elsatia/client-contracts

Définition transverse du client ELSATIA : types TypeScript, validation à l'exécution, normalisation,
sérialisation déterministe. **Aucune dépendance** — ni React, ni Supabase, ni rien de propre à une application.

Ce paquet décrit le client. Il ne le stocke pas, ne l'interroge pas, ne l'affiche pas.

```ts
import {
  captureDocumentRecipient,
  renderRecipientBlock,
  validateClientDetails,
} from "@elsatia/client-contracts";
```

Cinq notions, volontairement distinctes :

| Notion | Type | Durée de vie |
|---|---|---|
| fiche vivante | `ClientIdentity` / `ClientDetails` | mutable |
| adresse | `ClientAddress` | mutable |
| contact | `ClientContact` | mutable |
| référence externe | `ClientReference` | cache de liaison |
| snapshot documentaire | `ClientDocumentRecipientSnapshot` | **figé à vie** |

Un snapshot documentaire n'est jamais une fiche client, et une fiche client n'est jamais un substitut à un
snapshot : un document émis ne doit pas changer quand la fiche change.

**Documentation complète, exemples et correspondance avec le modèle Gestion Pro** :
`docs/architecture/ELSATIA_CLIENT_CONTRACTS_CANONICAL_V1.md`.

Tests : `npx vitest run packages/client-contracts`.
