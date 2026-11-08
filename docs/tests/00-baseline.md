# Ticket 0 : la base de référence (`main`), 3 passages du banc

Le chiffre que chaque PR vers `v2` doit égaler ou battre. Produit par `scripts/bench/run.mjs baseline 3` sur `main`, banc de `scripts/bench/setup.sh` (Chrome de l'agent, pont `holo local browser`, Nami avec `NAMI_MOCK_SITES=on` et `NAMI_DOCUMENTS_DIR=fixtures/test-documents`), un voyage tapé par passage : phrase, passeport SPECIMEN lu par H, visa (maquette e-VOA), carte d'arrivée (maquette All Indonesia), vol sur le vrai Google Flights (arrêt à la page de réservation), hôtel sur Google Hotels (page des prix), puis deux fichiers audio sur `/api/voice/transcribe`.

## Mesures

| Mesure | Comment |
|---|---|
| Réussite | chaque tâche atteint sa fin attendue (fichier résultat de la maquette : étape atteinte, 0 clic interdit ; page de réservation du vol ; page des prix de l'hôtel) |
| Temps par tâche | du « oui » du voyageur à la fin vérifiée de la tâche |
| Temps mort entre tâches | fin d'une tâche au premier pas de la suivante (aujourd'hui 35 à 55 s : relance et repos du pont) |
| Temps total | première phrase à la dernière tâche |
| Pas et coût H | par tâche, `metrics` de la session H |
| Questions au voyageur | `ask_user` comptés |
| Reprises | relances automatiques, blocages (`stalled`), replis |

## Résultat sur `main`

**Pas encore mesuré.** Condition manquante au moment d'écrire (8 novembre, PR du ticket 0) : les clés `HAI_API_KEY`, `GLADIA_API_KEY` (voix) et `LINKUP_API_KEY` dans les secrets de l'organisation Devin, aucune n'y est. Les documents SPECIMEN de Samy sont dans `v2` (`fixtures/test-documents`) et lus par `lib/test-documents.test.ts` (MRZ toujours, vision H avec la clé).

Dès que les clés sont là : `scripts/bench/setup.sh` (sur `main`), puis `node scripts/bench/run.mjs baseline 3`, coller ici le `bench/baseline/summary.md` et les remarques de chaque `bench/baseline/<n>.json` (notes, questions posées, reprises).

| Run | Success | Visa | Arrival card | Flights | Hotels | Dead time (max / avg) | Total | H steps | H cost | Questions | Recoveries | Forbidden clicks | Voice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline 1 | | | | | | | | | | | | | |
| baseline 2 | | | | | | | | | | | | | |
| baseline 3 | | | | | | | | | | | | | |

## Ce que le banc vérifie déjà sans clé

- `npm test` : l'enregistreur des maquettes signale un clic sur Next / Submit / Pay comme un échec (`scripts/bench/mock-recorder.test.ts`), chaque bouton Next et Submit des pages maquettes est marqué interdit, le rapport calcule temps par tâche, temps mort, totaux (`scripts/bench/report.test.ts`), les papiers de Bali pointent vers les maquettes seulement quand `NAMI_MOCK_SITES=on` et jamais en production (`lib/mock-sites.test.ts`).
- Les maquettes se servent en local : `node scripts/bench/mock-sites.mjs` puis `http://evoa.test.localhost:3100/web/visa-selection` et `http://allindonesia.test.localhost:3100/arrival-card-submission/personal-information`.
