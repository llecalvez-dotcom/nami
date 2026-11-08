# Test G1 : module Vol sur le banc, et vitesse de la recherche

- **Quoi** : le module Vol de bout en bout (ticket 18) : Google Flights ouvert par l'agent H dans le Chrome de l'agent, vols lus et vérifiés par Nami, choix, ouverture du vol jusqu'à la page des options de réservation, rien de réservé.
- **Comment** : `npm run demo` sur le Mac (Chrome de l'agent sur 9333, pont `holo local browser`, Nami sur 3000), un seul onglet `about:blank` plus le panneau, puis `node scripts/passage-vol.mjs passage-1 cheapest 1`, `passage-2 fastest 2`, `passage-3 best 1 12`. Le script écrit `~/nami-runs/<label>-timing.json` et une ligne `TIMING:` à la fin.
- **Cible** (après le retour de Clément du 8 nov., « la recherche de vol est ultra longue ») : **vols proposés en moins de 60 s** après le départ de la session, page de réservation en moins de 2 min.

## Ce qui est mesuré en unitaire (PR `feat/vol-plus-rapide`)

- `lib/flights/extract.test.ts` : la lecture directe des vols par Nami dans les aria-labels de la liste Google Flights, sur des libellés **réels** relevés le 8 novembre 2026 par le port DevTools (Paris vers Bali, 23 nov. au 3 déc., 1 adulte, EUR), en anglais (`From 642 euros round trip total. 1 stop flight with Etihad. Leaves … at 9:55 AM on Monday, November 23 and arrives at … at 11:35 AM on Tuesday, November 24. Total duration 18 hr 40 min. Layover (1 of 1) is a 2 hr 35 min layover at … in Abu Dhabi. Select flight`) et en français (`À partir de 733 euros aller-retour (prix total). Vol avec Etihad, 1 escale. Départ de … à 01:35 le jeudi, décembre 3, arrivée à … à 12:25 le jeudi, décembre 3. Durée totale : 17 h 50 min. L'escale (1 sur 1) est une escale de 1 h 15 min à Abou Dabi (…). Sélectionner le vol`). Variantes vues en réel : billets séparés, deux compagnies (« ITA and Cathay Pacific »), deux escales, escale sans aéroport (« in Milan »), arrivée à J+2, durée en heures rondes (« 18 hr », « 19 h »), prix en dollars. **Construits d'après le format, à confirmer en réel** : vol direct (« Nonstop flight with », « sans escale »), deux compagnies en français (« KLM et Garuda Indonesia »), prix groupé « 1 240 € ».
- `lib/flights/read.test.ts` et `app/api/agent/[id]/flights/route.test.ts` : la page d'abord (au moins 2 vols lus), sinon le rapport de l'agent vérifié contre le texte de la page, sinon « attends 2 s » quand Google charge encore (« Loading results », « Chargement des résultats… ») ou « lis la page toi-même » autrement. Un vol dont la compagnie ou le prix n'est pas dans le texte de la page est toujours écarté.
- `lib/flights-agent.test.ts` : consignes courtes (pas de lecture ni de défilement par l'agent, `report_flights` sans vols dès que la liste est affichée, `wait_web` 2 s si la page charge), clic aller / retour guidé par compagnie, prix et heure, 40 étapes au plus.

## Ce qui reste à mesurer sur le banc

| Passage | Critère | Choix | Vols proposés (s) | Lus par | Page de réservation (s) | Étapes | Résultat |
|---|---|---|---|---|---|---|---|
| passage-1 | cheapest | 1 | | | | | |
| passage-2 | fastest | 2 | | | | | |
| passage-3 | best | 1, arrêt après 12 étapes | | | | | |

Avant la PR : l'agent ouvrait l'URL, refusait les cookies, vérifiait les champs, lisait les vols un à un (défilement, captures) puis appelait `report_flights` avec la liste ; chaque étape H coûte 3 à 8 s, la lecture seule en prenait 6 à 10. Attendu après : ouverture, cookies, `wait_web`, `report_flights` (4 étapes, 20 à 30 s plus le démarrage de la session), puis 2 à 4 clics et `report_ready`.

À relever aussi : la colonne « Lus par » (`page` = lecture directe par Nami, `agent` = repli), le nombre de `(still loading, wait asked)`, et si le libellé réel d'un vol direct ou d'un vol à deux compagnies en français est bien lu (sinon le coller dans `extract.test.ts`).

## Constats du 8 novembre (depuis le Chrome de la VM Devin, États-Unis)

1. **La langue de la page suit le navigateur, pas `hl=fr`** : avec un Chrome en anglais la page est en anglais malgré `hl=fr` ; avec `Accept-Language: fr`, elle est en français. L'extraction lit les deux.
2. **L'URL `q=Flights from Paris to Bali on … through …` n'est comprise que par la page en anglais.** Avec le navigateur en français (comme sur le Mac de Clément, à confirmer), la même URL ouvre la page d'accueil de Google Flights sans aucune recherche (« Trouvez des vols à petit prix au départ de … ») ; une variante en français (`q=Vols aller-retour de Paris à Bali du … au …`) n'est pas comprise non plus. L'agent doit alors remplir le formulaire lui-même, ce qui coûte 6 à 10 étapes : une cause probable de la lenteur vue en réel. Piste (hors de cette PR, `googleFlightsUrl` appartient au sous-agent « ville de départ ») : `hl=en` dans l'URL pour forcer la page en anglais, ou une URL `tfs=` construite.
3. **Réglage de `NAMI_AGENT_SETTLE_S`** : garder 0,5 (défaut depuis #84). Google affiche la liste 2 à 4 s après la page : plutôt que d'allonger chaque geste, l'agent appelle `wait_web` 2 s une fois, et la réponse de `report_flights` lui redit d'attendre si la page porte encore « Chargement des résultats… ».
4. Les aria-labels sont dupliqués dans le DOM (chaque vol apparaît deux fois, le prix seul trois fois) : l'extraction ne compte chaque libellé qu'une fois, dans l'ordre de la liste ; l'index donné à l'agent est la position depuis le haut des résultats (« Meilleurs vols » puis « Autres vols »).
5. Après le clic sur un vol aller, l'URL passe en `/travel/flights/search?tfs=…`, la page dit « Choose return to Paris » / « Sélectionner un vol de retour vers Paris », et chaque vol retour affiche le **prix total** aller-retour : c'est ce prix que l'agent cherche sur la liste retour.
