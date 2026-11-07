# Ticket 12B: local CDP smoke test

Scope: the file handoff only, not a live H run or the real e-VOA form.

Run with Node.js 22+ and Chrome on PATH:

```sh
source ~/.nvm/nvm.sh
NAMI_CDP_SMOKE=1 npm test -- lib/agent-passport-upload.smoke.test.ts
```

The opt-in test starts its own headless Chrome and loopback HTTP server. Chrome
maps the official e-VOA host to that local server using a test-only host resolver
flag. The application domain check is unchanged. No external website, H session,
real passport, or OS file picker is used.

The fixture is a fictitious .jpg file, not a valid passport image, in a temporary document directory. The
normal document search supplies its opaque ID, which is bound to a test session.
The production upload function connects to that Chrome using native WebSocket
CDP, selects the official-host tab, and sets the file input.

Result on the development machine (Node.js 24.22.2):

```text
Test Files  1 passed (1)
     Tests  1 passed (1)
```

The page reported exactly one selected file, one input event and one change
event. This also checks that the fallback event dispatcher does not duplicate
Chrome's native events. Chrome and the HTTP server were stopped and fixtures
removed by the test.

Not verified: the H bridge on Nathan's Mac, actual e-VOA file validation, the
full H tool round trip, or visual Agent Activity. Use port 9333 on Nathan's Mac
if that is the port of his existing dedicated Chrome. The application never
starts Chrome; only this opt-in test does.

## Ticket 16 : résultat du test réel rapporté par Ali

Passage sur le vrai site e-VOA avec l'agent H, un passeport fictif et une
photo fictive. Les résultats ci-dessous sont ceux rapportés par Ali, pas une
nouvelle exécution du test local décrit plus haut.

| Point vérifié | Résultat |
|---|---|
| Les 5 menus déroulants via `pick_option` | ✅ remplis sans rechargement de la page |
| Dépôt du passeport | ✅ dans le bon champ |
| Dépôt de la photo d'identité | ✅ dans le bon champ |
| Aperçu de l'écran | ✅ |
| « Stop agent » | ✅ |
| Franchissement de la page 1 et pages suivantes | Non testé : passage interrompu avant, la session d'Ali ayant atteint sa limite d'utilisation |
| Parcours jusqu'au résumé ou au paiement | Non testé |
| Réduction des grandes images et nettoyage des fichiers temporaires en réel | Non testé |
| Acceptation d'un vrai scan et d'une vraie photo d'identité par le site | Non testé : documents fictifs uniquement |

**Erreur de lecture du site** : le site lit lui-même le passeport. Sur le
passeport fictif, il a lu l'année de naissance 2000 au lieu de 1990. L'agent
a remarqué l'erreur mais ne l'a pas corrigée. Le dépôt dans le bon champ ne
valide donc pas l'exactitude des données lues par le site.

**Suite proposée, ticket 15 (Clément)** : ajouter à `lib/agent-task.ts` une
consigne demandant, après la fenêtre du site, de comparer chaque champ aux
données du voyageur et de corriger les écarts. Correction non testée.

L'avertissement « MRZ composite check digit » du passeport fictif provient de
la lecture par H, pas de notre propre contrôle MRZ.

**Clics décalés sur Retina** : Ali rapporte que la cause était la densité de
l'écran, pas la taille de la fenêtre. Le lancement par `npm run demo` avec
`--force-device-scale-factor=1` pour le Chrome de l'agent corrige ce décalage.
Ne pas redimensionner la fenêtre pendant que l'agent travaille.

**Préparation manuelle, point 4 du ticket 16** : placer dans
`NAMI_DOCUMENTS_DIR` un scan à plat de la page photo du passeport et une photo
d'identité dont le nom contient « photo ». Vérifier à la main leur acceptation
par le site avant la démo. Cette préparation n'est pas automatisée ; sa
validation avec de vrais documents n'est pas testée ici.

**Bilan** : menus et dépôts validés sur ce passage partiel avec des documents
fictifs. Le critère de fin du ticket 16 reste à vérifier : la page 1 n'a pas
été franchie pendant ce test. Aucun résultat au-delà de cette page n'est validé.
