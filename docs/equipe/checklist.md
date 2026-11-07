# ✅ Checklist globale Nami

État vérifié sur `main` le samedi 7 novembre à 15 h 05 (dernières fusions : PR #12 routes protégées et passeport privé, PR #15 garde-fous du ticket 05). `main` : 164 tests OK. PR ouvertes : #13 (design, prête), #14 (agent H sur l'e-VOA, corrections demandées), #11 (coffre chiffré, hors hackathon). À mettre à jour à chaque PR fusionnée ou test passé.

**Légende** : ✅ fait et testé en réel · 🟡 codé et testé automatiquement, pas encore testé en réel · 🔵 en cours · ⬜ à faire · ❓ fait peut-être, mais rien sur GitHub

**Échéances** : vidéo de secours samedi 22 h · gel du code dimanche 11 h · rendu dimanche 14 h.

## 1. Front (ce qu'on voit à l'écran)

| # | Fonctionnalité | État | Qui | Ticket |
|---|---|---|---|---|
| F1 | Accueil « Where to next? », champ texte, bouton micro | ✅ | Nathan | 01, 04 |
| F2 | Écran Trip : conversation à gauche, dossier du voyage à droite | 🟡 (design de base ; refonte dans la PR #13) | Léon | 01 |
| F3 | Questions de l'agent, une à la fois (passeport, atterrissage, motif…) | ✅ | Nathan | 02 |
| F4 | Propositions : « Prepare my entry papers », vol, hôtel « soon » | ✅ | Nathan | 02 |
| F5 | Cartes des papiers avec heure, source, officiel ou non | ✅ (testé par Devin avec les vraies clés : Bali, Tanzanie, Japon, Kenya) | Ali | 03 |
| F6 | Champ « Try another country » pour le jury (visible avec `?demo=1`) | ✅ | Ali | 03 |
| F7 | Passeport : saisie à la main par défaut ; lecture de la photo seulement si `PASSPORT_READER=h` et case de consentement cochée | 🟡 (testé par Devin sur un faux passeport ; vrai passeport pas testé, voir T8) | Ali | 03, PR #12 |
| F8 | Masquage des données sensibles en démo (`?demo=1`) | ✅ (2 derniers caractères du numéro, date de naissance cachée) | Ali | 03 |
| F9 | Réglages de démo : « Local browser session », chemins des fichiers | 🔵 codé dans la PR #14 | Clément | 05 |
| F10 | Agent Activity en direct + « Stop agent » qui arrête vraiment la session H | 🔵 codé dans la PR #14 | Clément | 05 |
| F11 | Question de l'agent lue à voix haute, réponse validée au clic | 🔵 relié à l'agent dans la PR #14 | Nathan, puis Clément | 04, 05 |
| F12 | Design premium (cartes arrondies, accent violet, photos des destinations, navigation) | 🟡 (branche `feat/design`, PR en relecture) | Léon | sans ticket |
| F14 | Page World map : globe 3D, pays de résidence, envies, visas en cours, pop-up d'avancement au clic | 🟡 (branche `feat/design`, PR en relecture) | Léon | sans ticket |
| F13 | « Fill it for me (beta) » sur les papiers officiels d'un autre pays (après Bali) | ⬜ | Clément | 05, partie B |
| F15 | Accès à l'app par code (`/access`) | ✅ (PR #12, testé par Devin dans le navigateur) | Ali | PR #12 |

## 2. Back (routes serveur et logique)

| # | Fonctionnalité | État | Qui | Ticket |
|---|---|---|---|---|
| B1 | `/api/voice/transcribe` : la voix devient du texte (Gladia) | ✅ | Nathan | 04 |
| B2 | `/api/trip/parse` : la phrase devient une demande structurée (modèle H) | ✅ | Nathan | 02 |
| B3 | `lib/planner/` : quelles questions, quels modules, fenêtres d'ouverture | ✅ | Nathan | 02 |
| B4 | `/api/formalities` : papiers cherchés en direct (Linkup) + contrôle des domaines officiels | ✅ (PR #6, L1 réussi) | Ali | 03 |
| B5 | `/api/documents/extract` : lecture du passeport (vision H), un seul fournisseur, consentement exigé par le serveur | 🟡 (sur une fausse image, « Z » lu « 2 » sans alerte : à juger en T8) | Ali | 03, PR #12 |
| B6 | `lib/h-agent.ts` + `/api/papers/start` + routes `agent` (suivre, répondre, arrêter) | 🔵 PR #14 : relue par Claude (172 tests), arrêt hors domaine et rebasage demandés à 15 h 03 | Clément | 05 |
| B6b | `/api/papers/start` accepte un papier en direct de n'importe quel pays, domaine officiel revérifié par le serveur | ⬜ (après la partie A) | Clément | 05, partie B |
| B7 | Mode démo préparé (sessions lancées 5 min avant, heure réelle affichée) | ⬜ (ticket 06 à écrire) | Nathan | 06 |
| B8 | Module Vol (Google Flights), seulement s'il reste du temps | ⬜ | Clément | sans ticket |
| B9 | Routes payantes protégées : code d'accès, quotas par 10 min, taille et concurrence limitées | ✅ (PR #12) | Ali | PR #12 |

## 3. Tests de faisabilité (avec les vraies clés)

| # | Ce qu'on vérifie | État | Qui | Résultat attendu dans |
|---|---|---|---|---|
| T1 | F0 : le modèle H comprend 5 demandes variées | ✅ | Nathan | |
| T2 | F5 : la voix est comprise dans le bruit de la salle | ✅ | Nathan | |
| T3 | ~~F1 manuel~~ : supprimé. Le premier passage réel de l'agent sur l'e-VOA sert de repérage | sans objet | Clément | `docs/tests/f1-evoa.md` |
| T4 | F6 : l'agent H pilote le Chrome du portable par l'API | ⬜ (au premier passage réel de la PR #14) | Clément | `docs/tests/f1-evoa.md` |
| T5 | F8 : l'agent H sait déposer un fichier | ⬜ (au premier passage réel de la PR #14) | Clément | `docs/tests/f1-evoa.md` |
| T6 | F1 agent : l'agent remplit le visa jusqu'au paiement, 3 fois sur 3, une fois arrêté par « Stop agent » | ⬜ (PR #14) | Clément | `docs/tests/f1-evoa.md` |
| T6b | Autre pays en beta (Kenya ou Tanzanie) : l'agent s'arrête avant le paiement ou passe la main, 1 passage | ⬜ (après T6) | Clément | `docs/tests/f1-autres-pays.md` |
| T7 | L1 : Linkup trouve les papiers justes (Bali + 5 pays) | ✅ 5 pays sur 5 pour le papier principal, Bali identique à la table | Ali | `docs/tests/l1-linkup.md` |
| T8 | F7 : lecture du vrai passeport, 7 champs justes (avec `PASSPORT_READER=h` en local) | ❓ | Ali | `docs/tests/f7-passeport.md` |

## 4. Sécurité et données

| # | Élément | État | Qui |
|---|---|---|---|
| S1 | Clés API dans les secrets de Devin cloud, jamais dans Git | ✅ (`HAI_API_KEY` remplacée à 14 h 25) | Nathan |
| S2 | `.env*` et `private/` ignorés par Git | ✅ | Claude |
| S3 | Accord écrit du titulaire du passeport | ✅ | Nathan |
| S4 | L'agent ne clique jamais sur payer ou envoyer : consigne, arrêt de la session hors du domaine officiel, main sur « Stop agent » | 🔵 consigne dans la PR #14 ; arrêt hors domaine demandé | Clément |
| S4b | L'agent ne remplit jamais un site non officiel (domaine revérifié par le serveur) | ⬜ (ticket 05, partie B) | Clément |
| S4c | L'accord du titulaire du passeport couvre-t-il un formulaire d'un autre pays ? Sinon, test beta avec les documents de Clément | ⬜ | Nathan |
| S5 | Après la démo : supprimer les sessions H et le dossier `private/` | ⬜ | Nathan |
| S6 | Passeport : aucune image envoyée sans consentement, rien dans `localStorage`, bouton « Clear passport data » | ✅ (PR #12) | Ali |

## 5. Organisation, démo et pitch

| # | Élément | État | Qui |
|---|---|---|---|
| O1 | Note de cadrage, cockpit, tickets 01 à 04 | ✅ | Claude |
| O2 | Ticket 05 (parties A et B, garde-fous) + mode opératoire + cette checklist | ✅ (PR #7, #9, #15) | Nathan, Claude |
| O3 | Ticket 06 : tout brancher + mode démo préparé. À y mettre : `PASSPORT_READER=h`, `NAMI_ACCESS_CODE` si l'app est en ligne, redémarrer le serveur juste avant la démo (quotas remis à zéro), internet pour les photos | ⬜ | Claude (écriture), Nathan (exécution) |
| O4 | Texte du pitch de 3 minutes | ⬜ | Claude, Nathan |
| O5 | Vidéo de secours (samedi 22 h, quel que soit l'état) | ⬜ | Nathan |
| O6 | Questions Discord : critères des prix Devin et Gladia, modalités du rendu | ⬜ | Nathan |
| O7 | Gel du code (dimanche 11 h), répétitions, rendu (dimanche 14 h) | ⬜ | Tous |
| O8 | PR #11 (coffre chiffré) : chantier d'après le hackathon, laissée ouverte ; son numéro 07 est à changer | ⬜ | Ali |

## 6. Ce que chacun fait maintenant, dans l'ordre

**Ordre de fusion** : #13 (design, prête) maintenant, puis #14 (agent) une fois rebasée et testée en réel.

**Clément (agent H)**
1. Suivre la PR #14 : son Devin ajoute l'arrêt hors du domaine officiel et se rebase sur `main` (demandé à 15 h 03).
2. Installer le CLI de H sur son portable (`pip install "hai-agents[cli,browser]"`), lancer le Chrome dédié et `holo local browser` (note, section 4.6).
3. Test réel de la PR #14 sur son portable : 3 passages, arrêt sur l'écran de paiement, une fois « Stop agent » en cours de route ; étapes, blocages, durée et coût dans `docs/tests/f1-evoa.md` (couvre T4, T5 et T6). Puis fusion.
4. Ensuite seulement : partie B (tout pays en beta), un passage réel sur le Kenya ou la Tanzanie.

**Ali (papiers, passeport, sécurité)**
1. Test T8 : en local avec `PASSPORT_READER=h`, cocher le consentement, déposer la photo de son vrai passeport, compter les champs justes sur 7, résultat dans `docs/tests/f7-passeport.md` (sans aucune donnée du passeport dans le fichier).
2. PR #11 : la laisser ouverte, renuméroter la fiche (le 07 est pris).

**Léon (design)**
1. Fusionner la PR #13 (relue et testée par Claude : 172 tests, lint, compilation, écrans vérifiés).
2. Texte de la conversation : elle annonce « 3 entry papers » alors que le dossier en direct de Bali peut afficher 4 cartes.

**Nathan (démo, pitch)**
1. Fusionner #13 puis cette mise à jour de la checklist.
2. Trancher S4c (accord du titulaire pour un autre pays).
3. Avec Claude : ticket 06, puis texte du pitch et plan de la vidéo de secours (22 h).
4. Questions Discord (O6).
