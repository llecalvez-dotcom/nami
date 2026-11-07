# ✅ Checklist globale Nami

État vérifié sur `main` le samedi 7 novembre à 14 h 07 (dernières fusions : PR #5 voix, PR #7 docs). PR #6 (ticket 03) en brouillon. À mettre à jour à chaque PR fusionnée ou test passé.

**Légende** : ✅ fait et testé en réel · 🟡 codé et testé automatiquement, pas encore testé en réel · 🔵 en cours · ⬜ à faire · ❓ fait peut-être, mais rien sur GitHub

## 1. Front (ce qu'on voit à l'écran)

| # | Fonctionnalité | État | Qui | Ticket |
|---|---|---|---|---|
| F1 | Accueil « Where to next? », champ texte, bouton micro | ✅ | Nathan | 01, 04 |
| F2 | Écran Trip : conversation à gauche, dossier du voyage à droite | 🟡 (design de base) | Léon | 01 |
| F3 | Questions de l'agent, une à la fois (passeport, atterrissage, motif…) | ✅ | Nathan | 02 |
| F4 | Propositions : « Prepare my entry papers », vol, hôtel « soon » | ✅ | Nathan | 02 |
| F5 | Cartes des papiers avec heure, source, officiel ou non | ⬜ (aujourd'hui : table écrite à la main) | Ali | 03 |
| F6 | Champ « Try another country » pour le jury | ⬜ | Ali | 03 |
| F7 | Dépôt de la photo du passeport, champs à confirmer | ⬜ | Ali | 03 |
| F8 | Masquage des données sensibles en démo (`?demo=1`) | ⬜ | Ali | 03 |
| F9 | Réglages de démo : « Local browser session », chemins des fichiers | ⬜ | Clément | 05 |
| F10 | Agent Activity en direct + « Stop agent » réel | ⬜ (aujourd'hui : simulé) | Clément | 05 |
| F11 | Question de l'agent lue à voix haute, réponse validée au clic | 🟡 (composant prêt, pas encore relié à l'agent) | Nathan, puis Clément | 04, 05 |
| F12 | Design premium (typo éditoriale, images, finitions) | ⬜ | Léon | sans ticket |

## 2. Back (routes serveur et logique)

| # | Fonctionnalité | État | Qui | Ticket |
|---|---|---|---|---|
| B1 | `/api/voice/transcribe` : la voix devient du texte (Gladia) | ✅ | Nathan | 04 |
| B2 | `/api/trip/parse` : la phrase devient une demande structurée (modèle H) | ✅ | Nathan | 02 |
| B3 | `lib/planner/` : quelles questions, quels modules, fenêtres d'ouverture | ✅ | Nathan | 02 |
| B4 | `/api/formalities` : papiers cherchés en direct (Linkup) + contrôle des domaines officiels | 🔵 PR #6 (brouillon), relue et testée par Claude | Ali | 03 |
| B5 | `/api/documents/extract` : lecture du passeport (vision H) | 🔵 PR #6 (brouillon), relue et testée par Claude | Ali | 03 |
| B6 | `lib/h-agent.ts` + `/api/papers/start` + routes `agent` (suivre, répondre, arrêter) | ⬜ (ticket écrit) | Clément | 05 |
| B7 | Mode démo préparé (sessions lancées 5 min avant, heure réelle affichée) | ⬜ (ticket à écrire) | Nathan | 06 |
| B8 | Module Vol (Google Flights), seulement s'il reste du temps | ⬜ | Clément | 07 |

## 3. Tests de faisabilité (avec les vraies clés)

| # | Ce qu'on vérifie | État | Qui | Résultat attendu dans |
|---|---|---|---|---|
| T1 | F0 : le modèle H comprend 5 demandes variées | ✅ | Nathan | |
| T2 | F5 : la voix est comprise dans le bruit de la salle | ✅ | Nathan | |
| T3 | F1 manuel : parcours du visa e-VOA à la main jusqu'au paiement (étapes, boutons, captcha) | ❓ | Clément | `docs/tests/f1-evoa.md` |
| T4 | F6 : l'agent H pilote le Chrome du portable par l'API | ❓ | Clément | `docs/tests/f6-local.md` |
| T5 | F8 : l'agent H sait déposer un fichier | ❓ | Clément | `docs/tests/f8-upload.md` |
| T6 | F1 agent : l'agent remplit le visa jusqu'au paiement, 3 fois sur 3 | ⬜ (après le ticket 05) | Clément | `docs/tests/f1-evoa.md` |
| T7 | L1 : Linkup trouve les papiers justes (Bali + 5 pays) | 🔵 rapport en cours dans la PR #6 | Ali | `docs/tests/l1-linkup.md` |
| T8 | F7 : lecture du vrai passeport, 7 champs justes | ❓ | Ali | `docs/tests/f7-passeport.md` |

## 4. Sécurité et données

| # | Élément | État | Qui |
|---|---|---|---|
| S1 | Clés API dans les secrets de Devin cloud, jamais dans Git | ✅ | Nathan |
| S2 | `.env*` et `private/` ignorés par Git | ✅ | Claude |
| S3 | Accord écrit du titulaire du passeport | ✅ | Nathan |
| S4 | L'agent ne clique jamais sur payer ou envoyer (liste de boutons interdits) | ⬜ (dans le ticket 05) | Clément |
| S5 | Après la démo : supprimer les sessions H et le dossier `private/` | ⬜ | Nathan |

## 5. Organisation, démo et pitch

| # | Élément | État | Qui |
|---|---|---|---|
| O1 | Note de cadrage, cockpit, tickets 01 à 04 | ✅ | Claude |
| O2 | Ticket 05 + mode opératoire + cette checklist | ✅ (PR #7) | Nathan |
| O3 | Ticket 06 : tout brancher ensemble + mode démo préparé | ⬜ (dès que 03 et 05 avancent) | Claude (écriture), Nathan (exécution) |
| O4 | Texte du pitch de 3 minutes | ⬜ | Claude, Nathan |
| O5 | Vidéo de secours (samedi 22 h, quel que soit l'état) | ⬜ | Nathan |
| O6 | Questions Discord : critères des prix Devin et Gladia, modalités du rendu | ⬜ | Nathan |
| O7 | Gel du code (dimanche 11 h), répétitions, rendu (dimanche 14 h) | ⬜ | Tous |

## 6. Ce que chacun fait maintenant, dans l'ordre

**Clément (agent H)**
1. Ouvrir à la main https://evisa.imigrasi.go.id avec le passeport du collègue, aller jusqu'à l'écran de paiement **sans payer**. Noter chaque étape, chaque bouton, captcha ou compte demandé, dans `docs/tests/f1-evoa.md` (même en vrac). 30 minutes.
2. Lancer Devin cloud sur `docs/tickets/05-agent-visa.md`.
3. Pendant que Devin code : installer le CLI de H sur son portable (`pip install "hai-agents[cli,browser]"`), lancer le Chrome dédié et `holo local browser` (note, section 4.6).
4. Quand la PR 05 arrive : test réel sur son portable, 3 passages, arrêt sur l'écran de paiement.

**Ali (papiers et passeport)**
1. Lancer Devin cloud sur `docs/tickets/03-papiers-et-documents.md`.
2. En parallèle : tests L1 et F7, résultats dans `docs/tests/`.
3. Quand la PR 03 arrive : test réel, puis fusion.

**Léon (design)**
1. `git pull`, `npm install`, `npm run dev` : regarder l'app telle qu'elle est.
2. Branche `feat/design`, design premium des écrans, PR vers `main`.

**Nathan (voix, compréhension, démo)**
1. Fusionner la PR de docs (ticket 05, mode opératoire, checklist).
2. Faire le point avec l'équipe et faire remplir les ❓.
3. Préparer le pitch et le plan de la vidéo avec Claude.
4. Exécuter le ticket 06 quand Claude l'aura écrit.
