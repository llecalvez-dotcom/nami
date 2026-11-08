# Nami : instructions pour les agents (Claude, Devin…)

Agent de voyage du hackathon H Company × 42AI (Paris, 7 et 8 novembre 2026, rendu dimanche 14 h). Lire aussi `AGENTS.md` (règles Next.js 16, générées par `next dev`).

## Contexte produit (vault)
Note de projet de Nathan : `~/Code/perso/obsidian-vault/projets/_actifs/2026-11-hackathon-h-company-nami.md` (décisions, faits vérifiés, historique de la session de cadrage).

## Documents de référence (dans l'ordre)
1. `docs/equipe/checklist.md` : chaque fonctionnalité, son état, son responsable. **À mettre à jour à chaque PR fusionnée.**
2. `docs/equipe/cockpit.md` : façon de travailler, répartition, calendrier, démo, règles.
2b. `docs/specs/2026-11-07-refonte-panneau.md` : refonte visuelle du panneau (une étape à la fois, la vague, à la voix), codée (#67, #68) puis passée en direction « tableau accroché » façon Apple à la demande de Nathan.
2c. `docs/tests/2026-11-07-passage-panneau-visa-ok.md` : **point de reprise**, le visa de bout en bout depuis le panneau, et les conditions de départ à refaire avant chaque démo.
3. `docs/specs/2026-11-07-nami-epure.md` : recadrage du samedi 19 h 30, Nami épuré dans le panneau latéral, l'agent qu'on voit cliquer (prime sur les deux notes suivantes pour ce qu'il reprend ; tickets 13 à 16).
3b. `docs/specs/2026-11-07-recadrage-computer-use.md` : recadrage du samedi 15 h 40, le computer use au centre.
4. `docs/specs/2026-11-07-cadrage-devin.md` : note de cadrage (v4.3) : routes, contrats, consignes de l'agent H, tests, registre des faits.
5. `docs/tickets/NN-*.md` : une fiche par morceau à construire.

## Structure
- `app/` : pages Next.js et routes API (`app/api/trip/parse`, `app/api/voice/transcribe`, à venir `formalities`, `documents/extract`, `papers/start`, `agent/[id]/…`).
- `components/` : écrans (`home/`, `trip/`), voix (`voice/`), composants shadcn (`ui/`).
- `lib/` : contrats zod (`contracts.ts`), moteur de questions et de propositions (`planner/`), papiers de Bali relevés à la main (`bali-papers.ts`), contrôle des domaines officiels (`official-sites.ts`), consignes de l'agent H (`agent-task.ts`), clients Gladia et modèle H.
- `data/` : données d'exemple (affichées « Sample data »).
- `docs/` : cadrage, tickets, équipe, brief d'origine ; `docs/tests/` : résultats des tests réels (un fichier par test).
- `private/` : vrais documents de la démo, **ignoré par Git**, jamais commité.

## Règles non négociables
- Une branche et une PR par ticket, vers `main` ; jamais de fusion par un agent ; relecture humaine avant fusion.
- Aucune clé dans le dépôt : `.env.local` en local (ignoré), secrets de l'organisation Devin sur le cloud. Noms des variables : `.env.example`.
- L'agent H ne clique jamais sur l'envoi final ni sur le paiement d'un site officiel. Aucun résultat inventé présenté comme trouvé sur un site réel.
- Vrais documents uniquement avec l'accord écrit du titulaire (obtenu), jamais dans Git, jamais lisibles en public.
- Aucun tiret cadratin ni demi-cadratin dans les textes de l'interface.

## Current Project State
(vérifié le dimanche 8 novembre vers 2 h 40 par Devin, après les fusions de la nuit)

| Aspect | Status |
|--------|--------|
| Code | ✅ `main` à `f0254c1` (837 tests, lint, build OK, vérifié par Devin). Fusionné dans la nuit du 7 au 8 : #82 (module Vol de Clément : Google Flights en computer use, critère et choix à la voix ou au clic, vols vérifiés contre la page, arrêt sur la page des options de réservation), #78 (Nouveau voyage repart de zéro), #79 (réessayer un papier après un échec), #80, #81 (docs), #84 (visa 60 s au lieu de 98 : départ sur `about:blank`, `wait_web` au lieu de « take a screenshot », session H figée abandonnée après 20 à 40 s, `settle_s` 0,5, voix ElevenLabs `eleven_v4_turbo` en flux par sox `play`, Gladia toutes les 250 ms ; **pas testé à la voix depuis le panneau**), #75 (Ali : une seule question passeport et départ, heure d'atterrissage seulement pour Bali), #70 (Ali : papiers en direct pour toute destination, carte passeport limitée à Bali). #83 fermée (doublon de #84). **Aucune PR ouverte.** Point de repli vu marcher en réel à la voix : tag `visa-ok-2026-11-07`. |
| Config | 🔄 Nathan a arrêté ; le banc est maintenant le Mac de Clément : clone `~/nami` sur `main`, `npm run demo` (Chrome de l'agent sur 9333 en densité 1, profil `~/chrome-for-agents` ; pont `holo local browser` relancé en boucle, session `NAMI_LOCAL_SESSION_ID` fixe dans `.env.local` ; Nami sur 3000 avec `NAMI_AGENT_CHROME_PORT=9333`). `sox` installé (voix en flux). `.env.local` : `HAI_API_KEY`, `GLADIA_API_KEY`, `LINKUP_API_KEY`, `PASSPORT_READER=h`, `NAMI_DOCUMENTS_DIR` (passeport scanné et photo JPEG), `ELEVENLABS_API_KEY` à ajouter. Extension Nami à charger (« Load unpacked », dossier `extension/`) dans le Chrome de l'agent ; un seul onglet, sur `about:blank` depuis #84 ; le panneau s'ouvre **dans la fenêtre du Chrome de l'agent**. |
| Tests | 🔄 Visa de bout en bout depuis le panneau ✅ sur le banc de Nathan avant #84 (session `5b7f9eb3`) ; #84 mesurée au script 3 sur 3 (60 à 65 s), pas à la voix. **À refaire sur le banc de Clément avec `main`** : visa au script (`scripts/passage-evoa.mjs`) puis à la voix, carte d'arrivée (jamais vue en réel), puis test G1 du module Vol (`scripts/passage-vol.mjs`, 3 passages, relevé dans `docs/tests/g1-vols.md`), puis parcours complet visa + carte + vol à la voix. Pas encore : vidéo de secours. |

## Next Immediate Action
1) Sur le Mac de Clément : `npm run demo`, extension Nami chargée dans le Chrome de l'agent, un seul onglet sur `about:blank`, panneau ouvert dans cette fenêtre (`http://localhost:3000/panel`). 2) `node scripts/passage-evoa.mjs passage-clement-1` (attendu : ~60 s, arrêt à l'étape 1, rien d'envoyé) puis un passage complet à la voix (« Je pars à Bali lundi pour le mariage d'un ami », oui à chaque étape) jusqu'à la carte d'arrivée. 3) Module Vol : fermer les vieux onglets Google, `node scripts/passage-vol.mjs passage-1 cheapest 1`, `passage-2 fastest 2`, `passage-3 best 1 12` ; relevé dans `docs/tests/g1-vols.md` ; `NAMI_AGENT_SETTLE_S=1` si Google Flights charge trop lentement. 4) Parcours complet à la voix visa + carte + vol, enregistré (Cmd+Maj+5) pour la vidéo de secours. Si quelque chose casse : `git checkout visa-ok-2026-11-07` et redémarrer `npm run demo`.