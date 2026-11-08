# ✅ Checklist globale Nami

État vérifié sur `main` le samedi 7 novembre à 15 h 45 (dernières fusions : PR #13 design et World map, PR #11 fiche du coffre chiffré, PR #16 feuille de route). `main` : 172 tests OK. PR ouverte : #14 (agent H sur l'e-VOA : corrections faites, à jour avec `main`, 222 tests, lint et compilation OK, test réel à faire). À mettre à jour à chaque PR fusionnée ou test passé.

**Légende** : ✅ fait et testé en réel · 🟡 codé et testé automatiquement, pas encore testé en réel · 🔵 en cours · ⬜ à faire · ❓ fait peut-être, mais rien sur GitHub

**Recadrage (15 h 40)** : le computer use passe au centre, voir `docs/specs/2026-11-07-recadrage-computer-use.md`. Option A (navigateur piloté) ou C (ordinateur entier pour les documents) selon le test T9.

**Recadrage (19 h 30)** : Nami épuré dans le panneau latéral, l'agent qu'on voit cliquer (curseur, onde, cadre, bulle), voir `docs/specs/2026-11-07-nami-epure.md`. Tickets 13 (Léon), 14 (Nathan), 15 (Clément), 16 (Ali). Cause des clics ratés de l'agent trouvée : écran Retina, Chrome de l'agent à lancer avec `--force-device-scale-factor=1`.

**Échéances** : vidéo de secours samedi 22 h · gel du code dimanche 11 h · rendu dimanche 14 h.

## 1. Front (ce qu'on voit à l'écran)

| # | Fonctionnalité | État | Qui | Ticket |
|---|---|---|---|---|
| F1 | Accueil « Where to next? », champ texte, bouton micro | ✅ | Nathan | 01, 04 |
| F2 | Écran Trip : conversation à gauche, dossier du voyage à droite | ✅ (refonte de la PR #13) | Léon | 01 |
| F3 | Questions de l'agent, une à la fois (passeport, atterrissage, motif…) | ✅ | Nathan | 02 |
| F4 | Propositions : « Prepare my entry papers », vol, hôtel « soon » | ✅ | Nathan | 02 |
| F5 | Cartes des papiers avec heure, source, officiel ou non | ✅ (testé par Devin avec les vraies clés : Bali, Tanzanie, Japon, Kenya) | Ali | 03 |
| F6 | Champ « Try another country » pour le jury (visible avec `?demo=1`) | ✅ | Ali | 03 |
| F7 | Passeport : saisie à la main par défaut ; lecture de la photo seulement si `PASSPORT_READER=h` et case de consentement cochée | 🟡 (cette PR : contrôle MRZ par champ et alerte de validité en direct, même en saisie manuelle ; données fictives uniquement) | Ali | 03, PR #12 |
| F8 | Masquage des données sensibles en démo (`?demo=1`) | ✅ (2 derniers caractères du numéro, date de naissance cachée) | Ali | 03 |
| F9 | Réglages de démo : « Local browser session », chemins des fichiers | 🟡 PR #40 et #48 fusionnées : réglages H et session prise dans `NAMI_LOCAL_SESSION_ID` du `.env.local` quand le panneau n'en envoie pas, ligne affichée par `scripts/lancer-demo.sh` ; configuration complète à vérifier au passage réel | Clément | 05, 15 |
| F10 | Agent Activity en direct + « Stop agent » qui arrête vraiment la session H | 🟡 PR #44 fusionnée (aperçu de l'écran) ; aperçu et « Stop agent » rapportés OK par Ali sur le passage partiel du ticket 16 ([résultat](../tests/t12-depot-fichier-cdp.md)) ; T6 complet reste à faire | Clément | 05, 15 |
| F11 | Question de l'agent lue à voix haute, réponse validée au clic | 🔵 relié à l'agent dans la PR #14 | Nathan, puis Clément | 04, 05 |
| F12 | Design premium (cartes arrondies, accent violet, photos des destinations, navigation) | ✅ (PR #13, testée par Devin avec les vraies API et relue par Claude) | Léon | sans ticket |
| F14 | Page World map : globe 3D, pays de résidence, envies, visas en cours, pop-up d'avancement au clic | ✅ (PR #13) | Léon | sans ticket |
| F13 | « Fill it for me (beta) » sur les papiers officiels d'un autre pays (après Bali) | ⬜ | Clément | 05, partie B |
| F15 | Accès à l'app par code (`/access`) | ✅ (PR #12, testé par Devin dans le navigateur) | Ali | PR #12 |
| F16 | Conversation à la voix : Nami lit tout à voix haute, réponses à la voix partout, fin de parole et envoi automatiques | 🔵 partie B en relecture (branche `feat/06b-voix`, 216 tests, lint et compilation OK) ; test réel T10 à faire | Nathan | 06, partie B |
| F17 | Validation page par page : l'agent attend un « oui » avant chaque « Suivant » (`confirm_page`) | ⬜ partie A en attente de la fusion de la PR #14 | Nathan | 06, partie A |
| F18 | Extension Chrome : Nami dans le panneau latéral, l'agent dans l'onglet | 🔵 PR du ticket 08 (`feat/08-extension`), test réel avec l'agent H à faire | Léon | 08 |
| F19 | Retrouver le passeport : dans un dossier local (A) ou par l'agent dans le Finder (C) | 🟡 A : recherche locale, aperçu et confirmation ; PR #26 fusionnée (score des mots faibles du nom de fichier corrigé) ; C à faire | Ali (A), Clément ou Ali (C) | 09, 10 |
| F20 | UX polish du parcours de démo | ✅ PR #27 fusionnée (`polish/ux-demo`) | Ali | 11 |
| F21 | Couche visuelle dans l'onglet officiel : curseur, onde, contour du champ, cadre et bulle ; état masqué relayé par le panneau | 🟡 PR #49 fusionnée, ticket 13 : [tests automatiques et contrôle CDP sur e-VOA](../tests/13-couche-visuelle.md) ; passage réel H et vidéo avec ticket 15 encore requis | Léon | 13 |
| F22 | Panneau épuré : parcours visa, passeport et photo à la voix | 🟡 PR #52 et #53 fusionnées ; parcours complet à la voix dans le panneau jusqu'au paiement non testé | Nathan | 14 |
| F23 | Photo d'identité et scan du passeport : recherche, confirmation et dépôt dans les bons champs | 🟡 PR #50, #51 et #53 fusionnées ; dépôts fictifs dans les bons champs rapportés OK par Ali ; page 1 non franchie, scan et photo de démo à préparer manuellement ([résultat](../tests/t12-depot-fichier-cdp.md)) | Ali | 16 |
| F24 | Suite de l'agent e-VOA (ticket 17) : billet retour PDF (`upload_file return_ticket`), libellé du bloc dans `pick_option` (Port of Entry contre Port of Entry Mode), outil `fill_field` pour le code postal (`keyup`), nom à particule transmis tel quel, script de passage `scripts/passage-evoa.mjs` | 🟡 PR #65 : code et tests OK ; **passages réels du 7/11 au soir avec la borne de l'étape 1 (PR #59) : 3 sur 3, dont un « Stop », passeport et photo déposés par Nami** ; le code de l'étape 2 n'est pas vu en réel (borne) ; relevé et mode d'emploi dans `docs/tests/f1-evoa.md` | Clément | 17 |
| F41 | Trois correctifs de relecture (8 nov) : plus aucune parole du voyageur dans le journal de `/api/voice/intent` (seulement sa longueur) ; un vol relancé après une réponse tardive de H garde sa clé d'idempotence (pas de deuxième session) ; corps des réponses H lu sous la même échéance que l'appel (plus de « Busy » sans fin si H s'arrête au milieu d'une réponse) | 🟡 PR ouverte (`fix/trois-correctifs-demo`) | Claude (Nathan) | 18 |
| F38 | H lent ou en panne passagère (banc du 8 nov 4 h 04 à 4 h 20, [note](../tests/2026-11-08-h-lent.md)) : lecture du passeport réessayée une fois puis 503 « H did not answer » au lieu d'accuser le document, « Try again » sur le même fichier ; `FIRST_STALL_MS` 45 s et une relance automatique (mêmes papier, documents, dates, ville, critère) d'une session que H n'a jamais pilotée, « H is slow, starting again » dans la ligne d'état, puis « H is not answering right now » et relance manuelle ; plus de 409 après une annulation ou un abandon (le navigateur est libéré sans attendre H, qui garde ces sessions `running` plus d'une heure ; une session jamais vue agir depuis 45 s est reprise si H lui compte 0 step) ; chaque appel H borné (création 30 s, autres 20 s), slot « Busy » libéré et réessayé par le panneau, distinct du quota « Too many requests » qui dit son délai ; quotas relevés (formalities 60, extract 30, parse 60, say 1200, transcribe 120). | 🔄 PR ouverte (`devin/h-lent`) | Devin (Clément) |
| F40 | Coche d'un papier : l'onglet où l'agent a travaillé revient au premier plan tel quel, jamais une nouvelle page du site tant qu'un onglet du site existe (test réel 8 nov 4 h 35 : la coche Visa ouvrait la page d'accueil et les démarches étaient perdues, parce que l'URL du papier trouvée en direct n'était pas sur l'hôte de l'onglet et que la page exacte passait avant l'onglet avancé) ; `sameSite` / `pickTab` dans `extension/agent-state.js` : même hôte, www ou non, sous-domaine du même domaine enregistré, les trois sites officiels distincts, Google Flights jamais une recherche Google ; onglet de l'agent mémorisé par site dans `chrome.storage.session` à chaque état relayé ; la coche nomme le papier ; nouvel onglet seulement si aucun onglet du site, avec « The visa tab was closed, I reopened the site » dans la ligne d'état ; cause et protocole dans [docs/tests/2026-11-08-coche-onglet.md](../tests/2026-11-08-coche-onglet.md) ; extension à recharger | 🟡 PR ouverte (`devin/1794109385-coche-onglet-agent`) | Devin (Clément) | 14 |
| F39 | Vol, relance sans question reposée et options lisibles (banc de Clément, 8 nov 4 h 30) : après un échec de la session H (« session stalled, given up », perte d'onglet, délai), « Search again » ne repose plus la ville, les dates ni le critère, Nami annonce « I'm looking for your flights… » et relance `/api/flights/start` avec les mêmes paramètres (`flightsAnswered`, `startFlightsFlow` ; une question fermée par « Agent stopped » n'est pas une réponse) ; idem pour « Find my flight » accepté avec les réponses d'une tentative précédente ; « le moins cher et le plus rapide » donne `best` même quand l'intent H renvoie un seul critère (`namesSeveralCriteria`) ; boutons de vol courts « Malaysia Airlines · 834 € · 1 stop Kuala Lumpur · 17 h 55 · leaves 11:10 » (`flightLabel`), phrase dite courte (« Best compromise first: Malaysia Airlines at 834 euros, one stop, 17 h 55; then… »), escale = ville sans l'habillage Google (« Federal Territory of Kuala Lumpur » devient « Kuala Lumpur », `layoverCity`), boutons en colonne pleine largeur sur plusieurs lignes sans chevauchement (`optionButton`) ; relevé dans [docs/tests/2026-11-08-vol-relance.md](../tests/2026-11-08-vol-relance.md) | 🔄 PR ouverte (`devin/1794109331-vol-relance-libelles`) | Devin (Clément) | 18 |
| F37 | Vol : le garde-fou « l'agent a quitté Google Flights » ne s'arme qu'une fois Google Flights vu dans une observation (`onDomainSeen`, `armFlightsGuard`) ; avant, la session Vol était coupée à sa première observation parce que l'onglet courant était encore la carte d'arrivée, d'où « Shall I search your flights again? » en boucle (test réel 8 nov 3 h 50). | ✅ | Devin (Clément) |
| F36 | Pont frais détecté par son journal : un « command destroy » depuis la dernière ligne « serving session id » du journal du pont = chromedriver mort, Nami relance le pont quel que soit son pid (le pont se relance seul toutes les ~22 s au repos, le pid n'est pas une identité fiable ; carte d'arrivée démarrée 2 s après le visa sur un pont cru neuf, 8 nov 3 h 27) ; repli sur le pid sans journal (`lib/local-bridge.ts`). | ✅ | Devin (Clément) |
| F35 | Panneau : navigation, état, visibilité de l'agent. Coches « Passport / Photo / Visa / Arrival card / Flight » cliquables avec état visible (fait / en cours / à faire) : un clic sur un papier ramène son onglet au premier plan dans le Chrome de l'agent (`paperUrl` : page ouverte par l'agent, formulaire officiel, sinon page du site ; `bringToFront` préfère la page exacte puis la section de l'agent, Google Flights jamais une recherche Google ; onglet disparu rouvert) ; ligne d'état permanente sous les coches (`agentStatusLine` : « Nami is opening the e-VOA site », « Filling the form (4/~20) », « Uploading your passport », « Searching flights on Google Flights », « Reading the flights », « Waiting for you », « Done ») ; l'onglet de l'agent est ramené au premier plan dès que l'agent est vu sur le site (jamais ouvert par le panneau : l'agent conduit son propre onglet) ; hors Indonésie, le papier trouvé en direct, sinon coche non cliquable ; souris violette : l'état de l'agent est redemandé par chaque page qui se charge ou revient au premier plan (plus d'overlay absent après un changement de page), Google Flights couvert ; le panneau attend sans minuterie ni répétition (vérifié, voir la PR) | 🔄 PR ouverte (`feat/panneau-navigation-etat`) | Devin | 14 |
| F34 | Recherche de vols plus rapide (retour de Clément : « ultra longue ») : Nami lit elle-même les vols dans les aria-labels de la liste Google Flights (`lib/flights/extract.ts`, formats anglais et français relevés sur la vraie page le 8 nov.), URL en `hl=en` car la requête `q=Flights from …` n'est comprise que par la page anglaise (avec un Chrome en français et `hl=fr`, Google ouvrait l'accueil sans recherche et l'agent remplissait le formulaire : la cause probable de la lenteur), l'agent n'ouvre que l'URL, refuse les cookies et appelle `report_flights` sans rien lire ; repli sur la lecture par l'agent vérifiée contre la page si moins de 2 vols lus ; consigne « attends 2 s » si Google charge encore ; clic aller / retour guidé par compagnie, prix et heure ; 40 étapes au plus ; relevé des durées dans `scripts/passage-vol.mjs` (`<label>-timing.json`) ; protocole et constats dans [docs/tests/g1-vols.md](../tests/g1-vols.md) | 🔄 PR ouverte (`feat/vol-plus-rapide`) ; cible < 60 s jusqu'aux vols proposés, à mesurer sur le banc | Devin | 18 |
| F33 | Module Vol, conversation (test réel de Clément) : ville de départ demandée (« Which city do you fly from? », Paris au clic, ville à la voix, `request.origin`, aussi captée par le parse) ; une seule proposition de vol, jamais reposée une fois le Vol accepté, en cours ou trouvé (`proposeFlights`, `pushProposal` sans doublon) ; critères combinés (« le moins cher et le plus rapide ») = compromis « Best… » et Nami le dit | 🔄 PR ouverte (`feat/vol-origine-et-proposition`) | Devin | 18 |
| F32 | Compréhension naturelle des réponses à la voix : « ouais je suis chaud » = oui, « bof » = non, « le moins cher et le plus rapide » = le meilleur compromis, « le deuxième, celui de Qatar » = ce vol. Les listes fermées (`SHORT_ANSWERS`, `matchOption`) répondent toujours en 0 ms ; sinon `lib/voice/intent.ts` demande au modèle H (`POST /api/voice/intent`, garde `intent` 200 / 10 min, schéma strict, ids vérifiés, 4 s au plus, ~200 ms mesurés) et la réponse est traitée comme un clic sur le bouton ; échec, lenteur ou doute = texte libre comme avant ; une ligne de log serveur par appel | 🔄 PR ouverte (`feat/comprehension-naturelle`) | Devin | 06 |
| F31 | Pont frais avant chaque session H (banc) : le pont `holo local browser` garde un chromedriver mort après la fin d'une session jusqu'au 410 de H (20 à 45 s), et toute session créée entre-temps échoue (« A step failed » en boucle). Nami tue le pont déjà utilisé avant `createSession` et attend sa relance (nouveau pid, ligne « serving session id » du log `NAMI_BRIDGE_LOG`, Chrome joignable) ; `lancer-demo.sh` relance en 1 s et écrit `NAMI_LOCAL_SESSION_ID` et `NAMI_BRIDGE_LOG` dans `.env.local` ; cause dans [docs/tests/2026-11-08-pont-chromedriver-mort.md](../tests/2026-11-08-pont-chromedriver-mort.md) | 🔄 PR ouverte (`fix/pont-frais-avant-session`) | Devin | 17 |
| F30 | Oui / non à la voix élargis : « ouais carrément », « bien sûr », « yes sure », « nope », « non merci pas maintenant »… compris comme un oui ou un non (listes `SHORT_ANSWERS.proposal`, un mot par liste, 4 mots au plus) | 🔄 PR ouverte (`fix/oui-non-plus-large`) | Devin | 06 |
| F29 | Suite de F26 : l'avertissement « passeport valable 6 mois » se calcule aussi sur l'atterrissage supposé (`assumedArrival` passé à la carte passeport) ; le vol choisi qui renseigne `arrival_at` recalcule les fenêtres des papiers de Bali ; si la session Vol échoue ou est arrêtée après le choix, cet `arrival_at` est effacé et les fenêtres reviennent à l'hypothèse | 🔄 PR ouverte (`fix/atterrissage-suite`) | Devin | 18 |
| F28 | Repli photo d'identité et zone d'envoi passeport / photo : quand Nami ne trouve pas le passeport ou la photo sur l'ordinateur, elle le dit, montre la carte (recherche dans le dossier des documents) et une zone glisser-déposer + « Choose a file » (passeport : JPEG, PNG, HEIC, 5 Mo, ce que lit le lecteur ; photo : JPEG, PNG, HEIC, 10 Mo ; billet : PDF, 10 Mo) ; route `POST /api/documents/upload` écrit le fichier dans `NAMI_DOCUMENTS_DIR/nami-uploads/uploaded-<kind>-<horodatage>-<sel>.<ext>` (type lu dans les premiers octets, nom du client ignoré, HEIC converti sur le Mac sinon refusé), le rend visible pour `find` et le parcours reprend (passeport lu et confirmé à la voix, photo « Yes, use it / Go on without it ») ; même zone dans les cartes de l'écran voyage quand la recherche ne trouve rien | 🔄 #87 fusionnée (repli photo) ; PR ouverte (`feat/zone-envoi-documents`, zone d'envoi) | Devin | 16 |
| F27 | Micro jamais ouvert tout seul : `useListenAfterSpeech` supprimé (panneau, écran voyage, réponse dictée) ; le micro s'ouvre sur un clic ou un appui seulement, bouton visible avec son état (écoute / arrêt). Cause : le micro entendait les haut-parleurs, Gladia transcrivait du bruit et Nami changeait de langue | 🔄 PR ouverte (`fix/micro-jamais-seul`) | Devin | 06 |
| F26 | Plus de question d'atterrissage : Nami ne demande plus l'heure d'arrivée (le client ne la connaît pas, c'est Nami qui cherche le vol) ; pour Bali, les fenêtres des papiers supposent le lendemain du départ à 00 h heure de Bali (`assumedArrival`), sans l'écrire dans la demande ; une heure donnée spontanément est gardée, et le vol choisi dans le module Vol la renseigne | 🔄 PR ouverte (`fix/pas-de-question-atterrissage`) | Devin | 18 |
| F25 | Module Vol (ticket 18) : après « oui » au vol, dates confirmées, agent H sur Google Flights pré-rempli, critère à la voix ou au clic, 2-3 vols réels proposés, vol ouvert jusqu'à la page de réservation, jamais réservé ; Linkup écarté après test ([G0](../tests/g0-linkup-vols.md)) | 🔄 codé (branche `feat/18-module-vol-code`, PR ouverte) : contrats, classement, lecture vérifiée contre la page (CDP), route `/api/flights/start`, questions dates / critère / choix à la voix ou au clic, panneau en mode Vol, `scripts/passage-vol.mjs` ; passage réel G1 à faire | Clément | 18 |

## 2. Back (routes serveur et logique)

| # | Fonctionnalité | État | Qui | Ticket |
|---|---|---|---|---|
| B1 | `/api/voice/transcribe` : la voix devient du texte (Gladia) | ✅ | Nathan | 04 |
| B2 | `/api/trip/parse` : la phrase devient une demande structurée (modèle H) | ✅ PR #35 fusionnée (heure d'arrivée en français) | Nathan | 02 |
| B3 | `lib/planner/` : quelles questions, quels modules, fenêtres d'ouverture | ✅ | Nathan | 02 |
| B4 | `/api/formalities` : papiers cherchés en direct (Linkup) + contrôle des domaines officiels | ✅ (PR #6, L1 réussi) | Ali | 03 |
| B5 | `/api/documents/extract` : lecture du passeport (vision H), un seul fournisseur, consentement exigé par le serveur | 🟡 (cette PR : chiffres de contrôle MRZ et comparaison aux champs imprimés ; divergence signalée, jamais corrigée en silence) | Ali | 03, PR #12 |
| B6 | `lib/h-agent.ts` + `/api/papers/start` + routes `agent` (suivre, répondre, arrêter) | 🟡 PR #38 (arrêt au paiement), #39 (vérifications avant lancement), #40 (réglages H), #41 (robustesse des sessions), #45 (réobserver sans recharger) et #48 (ticket 15) fusionnées ; Ali rapporte les 5 menus remplis via `pick_option` sans rechargement ; page 1 non franchie, parcours jusqu'au paiement à faire (T6) | Clément | 05, 15 |
| B6b | `/api/papers/start` accepte un papier en direct de n'importe quel pays, domaine officiel revérifié par le serveur | ⬜ (après la partie A) | Clément | 05, partie B |
| B7 | Mode démo préparé (sessions lancées 5 min avant, heure réelle affichée) | ⬜ (ticket 06 à écrire) | Nathan | 06 |
| B8 | Module Vol (Google Flights), seulement s'il reste du temps | ⬜ | Clément | sans ticket |
| B9 | Routes payantes protégées : code d'accès, quotas par 10 min, taille et concurrence limitées | ✅ (PR #12) | Ali | PR #12 |

## 3. Tests de faisabilité (avec les vraies clés)

| # | Ce qu'on vérifie | État | Qui | Résultat attendu dans |
|---|---|---|---|---|
| T1 | F0 : le modèle H comprend 5 demandes variées | ❓ marqué réussi plus tôt, mais pas refait par un humain | Nathan | |
| T2 | F5 : la voix est comprise dans le bruit de la salle | ❓ jamais fait avec un micro dans la salle ; à refaire au test du ticket 06 | Nathan | `docs/tests/f5-conversation-voix.md` |
| T3 | ~~F1 manuel~~ : supprimé. Le premier passage réel de l'agent sur l'e-VOA sert de repérage | sans objet | Clément | `docs/tests/f1-evoa.md` |
| T4 | F6 : l'agent H pilote le Chrome du portable par l'API | ✅ sur le Mac de Nathan, Chrome de l'agent en densité 1 (passage de 19 h 05, `docs/tests/2026-11-07-etat-reel.md`) ; à refaire sur le portable de Clément | Clément | `docs/tests/f1-evoa.md` |
| T5 | F8 : l'agent H sait déposer un fichier | ✅ dépôt du passeport et de la photo fictifs dans les bons champs rapporté par Ali avec H sur le vrai e-VOA (ticket 16) ; page 1 non franchie, acceptation de vrais documents non testée | Clément, Ali | `docs/tests/t12-depot-fichier-cdp.md` |
| T6 | F1 agent : l'agent remplit le visa jusqu'à la borne de la démo, 3 fois sur 3, une fois arrêté par « Stop agent » | ✅ 7/11, 22 h 36 à 22 h 50, Mac de Clément, PR #65 : passages 9 et 10 complets et autonomes jusqu'à l'étape 1 (passeport et photo déposés, pas de Next, borne de la PR #59), passage 11 coupé par « Stop » ; pilotés par `scripts/passage-evoa.mjs`, pas depuis le panneau ; paiement hors démo depuis la PR #59 | Clément | `docs/tests/f1-evoa.md` |
| T6b | Autre pays en beta (Kenya ou Tanzanie) : l'agent s'arrête avant le paiement ou passe la main, 1 passage | ⬜ (après T6) | Clément | `docs/tests/f1-autres-pays.md` |
| T9 | L'agent H pilote l'ordinateur entier : trouve le passeport dans le Finder, le dépose dans une page (30 min, faux passeport) | ⬜ décide entre A et C | Ali | `docs/tests/t9-bureau.md` |
| T10 | Parcours complet à la voix, sans clavier, dans la salle | ⬜ (après le ticket 06) | Nathan | `docs/tests/f5-conversation-voix.md` |
| T7 | L1 : Linkup trouve les papiers justes (Bali + 5 pays) | ✅ 5 pays sur 5 pour le papier principal, Bali identique à la table | Ali | `docs/tests/l1-linkup.md` |
| T8 | F7 : lecture du vrai passeport, 7 champs justes (avec `PASSPORT_READER=h` en local) ; noter aussi combien d'erreurs le contrôle MRZ a signalées | ❓ | Ali | `docs/tests/f7-passeport.md` |

## 4. Sécurité et données

| # | Élément | État | Qui |
|---|---|---|---|
| S1 | Clés API dans les secrets de Devin cloud, jamais dans Git | ✅ (`HAI_API_KEY` remplacée à 14 h 25) | Nathan |
| S2 | `.env*` et `private/` ignorés par Git | ✅ | Claude |
| S3 | Accord écrit du titulaire du passeport | ✅ | Nathan |
| S4 | L'agent ne clique jamais sur payer ou envoyer : consigne, arrêt de la session hors du domaine officiel, main sur « Stop agent » | 🟡 PR #14, #38 et #48 fusionnées : « Submit », « Pay », « Bayar », « Kirim » interdits, arrêt sur l'écran de résumé ou de paiement, `report_ready` arrête la session (tests vitest, revérifiés au ticket 15) ; jamais vu en réel jusqu'au paiement (T6) | Clément |
| S4b | L'agent ne remplit jamais un site non officiel (domaine revérifié par le serveur) | ⬜ (ticket 05, partie B) | Clément |
| S4c | L'accord du titulaire du passeport couvre un formulaire d'un autre pays | ✅ (confirmé par Nathan à 15 h 10) | Nathan |
| S5 | Après la démo : supprimer les sessions H et le dossier `private/` | ⬜ | Nathan |
| S6 | Passeport : aucune image envoyée sans consentement, rien dans `localStorage`, bouton « Clear passport data » | ✅ (PR #12) | Ali |

## 5. Organisation, démo et pitch

| # | Élément | État | Qui |
|---|---|---|---|
| O1 | Note de cadrage, cockpit, tickets 01 à 04 | ✅ | Claude |
| O2 | Ticket 05 (parties A et B, garde-fous) + mode opératoire + cette checklist | ✅ (PR #7, #9, #15) | Nathan, Claude |
| O3 | Mode démo préparé (ticket à écrire après le verdict de T9). À y mettre : `PASSPORT_READER=h`, Nami en local sans `NAMI_ACCESS_CODE` (panneau latéral), redémarrer le serveur juste avant la démo (quotas), internet pour les photos | ⬜ | Claude (écriture), Nathan (exécution) |
| O9 | Recadrage computer use, protocole T9, tickets 06, 08, 09, 10 | ✅ | Claude |
| O4 | Texte du pitch de 3 minutes | ⬜ | Claude, Nathan |
| O5 | Vidéo de secours (samedi 22 h, quel que soit l'état) | ⬜ | Nathan |
| O6 | Questions Discord : critères des prix Devin et Gladia, modalités du rendu | ⬜ | Nathan |
| O7 | Gel du code (dimanche 11 h), répétitions, rendu (dimanche 14 h) | ⬜ | Tous |
| O8 | Fiche du coffre chiffré (`docs/tickets/07-coffre-chiffre.md`) : chantier d'après le hackathon, rien à coder ce week-end | ✅ fusionnée (PR #11) | Ali |

## 6. Ce que chacun fait maintenant, dans l'ordre

**Clément (agent H)**
1. Ticket 17 : relire la PR `feat/17-suite-agent-evoa` (billet retour, `fill_field`, libellés des menus, nom à particule), mettre un vrai billet retour en PDF dans `private/` (nom contenant `billet`, `ticket`, `retour`, `return` ou `flight`), puis passages réels (points 6 et 7 du ticket) : relever les étapes 3 et suivantes dans `docs/tests/f1-evoa.md`.
2. Ticket 15 : relire la PR `feat/15-agent-evoa-complet`, puis 3 passages réels sur son portable (`scripts/lancer-demo.sh`, Chrome en densité 1) : arrêt devant le paiement, une fois « Stop agent » en cours de route ; résultat dans `docs/tests/f1-evoa.md` (T4, T5, T6), puis ajuster `route_hint` ou `stop_condition`. Tout le recadrage en dépend.
3. Si l'agent s'arrête avec « it left the official site (….imigrasi.go.id) » alors que le site l'y a envoyé normalement : élargir le domaine de l'e-VOA à `imigrasi.go.id` dans `lib/bali-papers.ts`.
4. Si T9 réussit : ticket 10 (avec Ali).

**Ali (papiers, passeport, sécurité)**
1. Fusionner la PR #18 (contrôle MRZ, relue par Claude).
2. Test T9 (30 min) : `docs/tests/t9-bureau.md`, faux passeport seulement. Verdict écrit : A ou C.
3. Devin sur `docs/tickets/09-recherche-documents.md`.

**Léon (design)**
1. Devin sur `docs/tickets/08-extension-panneau.md`.
2. Texte de la conversation : elle annonce « 3 entry papers » alors que le dossier en direct de Bali peut afficher 4 cartes.

**Nathan (voix, démo, pitch)**
1. Relire la PR du ticket 06 partie B (voix) ; partie A (`confirm_page`) sur Devin dès que la PR #14 est fusionnée.
2. Test T10 à la voix dans la salle quand le ticket 06 arrive.
3. Avec Claude : mode démo, pitch, plan de la vidéo de secours (22 h).
4. Questions Discord (O6).
