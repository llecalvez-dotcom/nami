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
| F9 | Réglages de démo : « Local browser session », chemins des fichiers | 🔵 PR #14, test réel à faire | Clément | 05 |
| F10 | Agent Activity en direct + « Stop agent » qui arrête vraiment la session H | 🔵 PR #14, test réel à faire | Clément | 05 |
| F11 | Question de l'agent lue à voix haute, réponse validée au clic | 🔵 relié à l'agent dans la PR #14 | Nathan, puis Clément | 04, 05 |
| F12 | Design premium (cartes arrondies, accent violet, photos des destinations, navigation) | ✅ (PR #13, testée par Devin avec les vraies API et relue par Claude) | Léon | sans ticket |
| F14 | Page World map : globe 3D, pays de résidence, envies, visas en cours, pop-up d'avancement au clic | ✅ (PR #13) | Léon | sans ticket |
| F13 | « Fill it for me (beta) » sur les papiers officiels d'un autre pays (après Bali) | ⬜ | Clément | 05, partie B |
| F15 | Accès à l'app par code (`/access`) | ✅ (PR #12, testé par Devin dans le navigateur) | Ali | PR #12 |
| F16 | Conversation à la voix : Nami lit tout à voix haute, réponses à la voix partout, fin de parole et envoi automatiques | 🔵 partie B en relecture (branche `feat/06b-voix`, 216 tests, lint et compilation OK) ; test réel T10 à faire | Nathan | 06, partie B |
| F17 | Validation page par page : l'agent attend un « oui » avant chaque « Suivant » (`confirm_page`) | ⬜ partie A en attente de la fusion de la PR #14 | Nathan | 06, partie A |
| F18 | Extension Chrome : Nami dans le panneau latéral, l'agent dans l'onglet | 🔵 PR du ticket 08 (`feat/08-extension`), test réel avec l'agent H à faire | Léon | 08 |
| F19 | Retrouver le passeport : dans un dossier local (A) ou par l'agent dans le Finder (C) | 🟡 A : recherche locale, aperçu et confirmation ; raccordement `file_paths` après #14 ; C à faire | Ali (A), Clément ou Ali (C) | 09, 10 |
| F20 | UX polish du parcours de démo | 🟡 | Ali | 11 |
| F21 | Couche visuelle dans l'onglet officiel : curseur, onde, contour du champ, cadre et bulle ; état masqué relayé par le panneau | 🟡 ticket 13 : [tests automatiques et contrôle CDP sur e-VOA](../tests/13-couche-visuelle.md) ; passage réel H et vidéo avec ticket 15 encore requis | Léon | 13 |

## 2. Back (routes serveur et logique)

| # | Fonctionnalité | État | Qui | Ticket |
|---|---|---|---|---|
| B1 | `/api/voice/transcribe` : la voix devient du texte (Gladia) | ✅ | Nathan | 04 |
| B2 | `/api/trip/parse` : la phrase devient une demande structurée (modèle H) | ✅ | Nathan | 02 |
| B3 | `lib/planner/` : quelles questions, quels modules, fenêtres d'ouverture | ✅ | Nathan | 02 |
| B4 | `/api/formalities` : papiers cherchés en direct (Linkup) + contrôle des domaines officiels | ✅ (PR #6, L1 réussi) | Ali | 03 |
| B5 | `/api/documents/extract` : lecture du passeport (vision H), un seul fournisseur, consentement exigé par le serveur | 🟡 (cette PR : chiffres de contrôle MRZ et comparaison aux champs imprimés ; divergence signalée, jamais corrigée en silence) | Ali | 03, PR #12 |
| B6 | `lib/h-agent.ts` + `/api/papers/start` + routes `agent` (suivre, répondre, arrêter) | 🔵 PR #14 : relue par Claude, arrêt hors domaine ajouté, à jour avec `main` (222 tests, lint, compilation OK) ; test réel à faire | Clément | 05 |
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
| T4 | F6 : l'agent H pilote le Chrome du portable par l'API | ⬜ (au premier passage réel de la PR #14) | Clément | `docs/tests/f1-evoa.md` |
| T5 | F8 : l'agent H sait déposer un fichier | ⬜ (au premier passage réel de la PR #14) | Clément | `docs/tests/f1-evoa.md` |
| T6 | F1 agent : l'agent remplit le visa jusqu'au paiement, 3 fois sur 3, une fois arrêté par « Stop agent » | ⬜ (PR #14) | Clément | `docs/tests/f1-evoa.md` |
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
| S4 | L'agent ne clique jamais sur payer ou envoyer : consigne, arrêt de la session hors du domaine officiel, main sur « Stop agent » | 🔵 tout est dans la PR #14 (sosies de domaine refusés, testé) ; à vérifier au test réel | Clément |
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
1. Finir le CLI de H, puis test réel de la PR #14 sur son portable : 3 passages, arrêt devant le paiement, une fois « Stop agent » en cours de route ; résultat dans `docs/tests/f1-evoa.md` (T4, T5, T6). Puis fusion. C'est le premier vrai essai du pilotage local : tout le recadrage en dépend.
2. Si l'agent s'arrête avec « it left the official site (….imigrasi.go.id) » alors que le site l'y a envoyé normalement : élargir le domaine de l'e-VOA à `imigrasi.go.id` dans `lib/bali-papers.ts`.
3. Si T9 réussit : ticket 10 (avec Ali).

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
