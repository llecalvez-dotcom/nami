# Vitesse de l'agent sur le visa : mesures de la nuit du 7 au 8 novembre

Banc du Mac de Nathan (Chrome de l'agent sur 9333, pont `holo local browser` en boucle, Nami sur 3010), passages lancés par `scripts/passage-evoa.mjs` (même chemin que le panneau : routes de Nami, passeport et photo déposés, arrêt à l'étape 1, rien d'envoyé). Temps = de la création de la session H à `report_ready`, lu dans les horodatages des événements H. Coût H total des passages : environ 0,60 $.

## Où partait le temps (passage de référence `5b7f9eb3`, minuit, avant les changements)

98,8 s jusqu'à `report_ready`, 19 étapes, 0,049 $ :

- 4,6 s de démarrage chez H (incompressible) ;
- 9,5 s de faux départ : l'agent voyait un nouvel onglet, a tenté de basculer vers un onglet du visa qui n'existait pas (erreur), puis a ouvert l'adresse ;
- 2,1 à 3,3 s de réflexion du modèle à chaque étape : il relit environ 15 600 jetons (capture et texte de la page), il ne raisonne presque pas (1 000 jetons de raisonnement sur tout le passage) ;
- 2 s d'attente fixe après chaque geste (`settle_s: 2`, défaut de H : 1) ;
- deux « vérifications » après les dépôts (attente de 3 s plus une étape chacune), parce que la consigne disait « take a screenshot to verify » ;
- 2,8 à 3,3 s par menu montré à l'écran.

## Résultats

| Réglage | Passages réussis | Temps jusqu'à `report_ready` | Étapes | Coût |
|---|---|---|---|---|
| Référence (avant) | 1 | 98,8 s | 19 | 0,049 $ |
| Lot 1, `settle_s` 2 | 1 | 85,2 s | 16 | 0,039 $ |
| Lot 1 + correctif `wait_web`, `settle_s` 1 | 3 sur 3 | 66,5 / 69,5 / 72,7 s | 15 | 0,031 à 0,037 $ |
| **`settle_s` 0,5 (retenu)** | **3 sur 3** | **59,9 / 60,5 / 64,8 s** | **14 à 15** | **0,029 à 0,033 $** |
| `settle_s` 0,5 sans texte de page (`markdown: false`) | 2 sur 2 (+1 figé) | 62,4 / 64,8 s | 15 | 0,032 à 0,035 $ |
| `holo4-35b-a3b`, `settle_s` 0,5 | 3 sur 3 | 70,2 / 76,5 / 86,3 s | 17 à 21 | 0,029 à 0,037 $ |

Retenu : `holo4-27b`, réflexion `medium`, `settle_s` 0,5, texte de la page gardé (aucun gain sans lui, et il aide à lire « PRANCIS »). Le modèle rapide fait plus d'étapes (un `wait_web` après presque chaque menu, des clics en trop) : plus lent sur ce formulaire.

Parcours obtenu, identique d'un passage à l'autre : `go_to`, 4 × `pick_option`, Page Down, Detail & Apply, Apply, OK, `upload_file` passeport, Page Down, Ok, (défilement), `upload_file` photo, `report_ready`.

## Ce qui a changé dans le code (PR `feat/agent-plus-rapide`)

- Départ sur une page blanche : la tâche dit « Open <adresse> in the current tab with go_to; do not look for or switch to another tab ». Condition de départ : l'onglet de l'agent sur `about:blank` (plus besoin de l'ouvrir sur la page du visa).
- Après un dépôt, le résultat de `upload_file` dit la suite : passeport, Nami attend que le site montre sa lecture (« Reupload ») puis dit « Page Down puis Ok » ; photo, « step 1 is done: call report_ready now ».
- Menus enchaînés sans défiler (`pick_option` marche hors de l'écran), nouvel essai si une liste dépendante charge encore ; menus montrés en environ 1,2 s au lieu de 2,6 (accord de Nathan).
- **Il n'existe pas d'action « capture » chez H** : sur « take a screenshot », l'agent a une fois utilisé `refresh_web`, qui efface le formulaire (1 passage sur 3, rattrapé par l'agent). Toutes les consignes disent maintenant « look at the page with wait_web (1 second), never refresh_web ».
- `settle_s` 0,5 par défaut ; réglables : `NAMI_AGENT_SETTLE_S`, `NAMI_AGENT_MARKDOWN=off`. `holo3-122b-a10b` retiré (pas d'outils d'après la page des modèles de H).
- **Session figée** : 3 sessions sur 17 cette nuit, toujours à la première étape, le modèle de H n'a jamais répondu à la première capture ; la session ignorait `DELETE` et sa limite de 15 min, et le verrou de Nami refusait toute nouvelle session. Désormais : sans réponse 20 s avant la première action (40 s ensuite), Nami abandonne la session, la signale en échec (« réessayer » de la PR #79) et laisse la suivante prendre le navigateur. Vu en réel : arrêt propre au bout d'environ 45 s (seuil de 40 s à ce moment-là).
- Voix : `eleven_v4_turbo` (accord de Nathan) par `/stream`, lu par `play` (sox) pendant la réception, puis mis en cache. Mesuré : premier octet en 0,12 s (contre 1,92 s pour `eleven_v4` sans flux) ; une phrase de 4 s dite en 3,99 s génération comprise.
- Gladia interrogé toutes les 250 ms au lieu de chaque seconde.

## Pas fait, et pourquoi

- Indiquer la langue à Gladia pour sauter sa détection : gain non chiffré, et la langue d'un voyageur qui change de langue ne serait plus suivie.
- Préchauffer les phrases : inutile avec la voix en flux (le son part tout de suite).
- `reasoning_effort` `low` : le modèle ne raisonne presque pas en `medium` (1 000 jetons par passage), gain attendu nul.

## Pièges notés pendant les mesures

- **Le pont `holo` met jusqu'à 55 s à revenir** quand une session démarre juste après la précédente : 6 étapes « A step failed », puis l'agent reprend. Le banc attend maintenant un nouveau processus de pont plus 8 s. C'est le problème à régler avant d'enchaîner visa, carte d'arrivée et vols : piste documentée par H, une seule session gardée ouverte (`idle_timeout_s`) et les tâches suivantes envoyées par `POST /sessions/{id}/messages` (non testé avec le pont local).
- Vers 1 h, la lecture du passeport par la Models API de H a renvoyé des 502 après 30 s puis une 429 : charge de H pendant le hackathon, pas notre code.
- Le panneau ouvert dans le Chrome de l'agent se recharge à chaque redémarrage de `next dev` et redit sa question en cours ; il entend aussi ce que disent les haut-parleurs (micro ouvert après une question).
