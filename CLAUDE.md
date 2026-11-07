# Nami : instructions pour les agents (Claude, Devin…)

Agent de voyage du hackathon H Company × 42AI (Paris, 7 et 8 novembre 2026, rendu dimanche 14 h). Lire aussi `AGENTS.md` (règles Next.js 16, générées par `next dev`).

## Contexte produit (vault)
Note de projet de Nathan : `~/Code/perso/obsidian-vault/projets/_actifs/2026-11-hackathon-h-company-nami.md` (décisions, faits vérifiés, historique de la session de cadrage).

## Documents de référence (dans l'ordre)
1. `docs/equipe/checklist.md` : chaque fonctionnalité, son état, son responsable. **À mettre à jour à chaque PR fusionnée.**
2. `docs/equipe/cockpit.md` : façon de travailler, répartition, calendrier, démo, règles.
2b. `docs/specs/2026-11-07-refonte-panneau.md` : refonte visuelle du panneau validée le samedi 23 h 30 (une étape à la fois, la vague, à la voix), à coder.
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
(vérifié le samedi 7 novembre vers 23 h 45 ; passages réels du soir dans `docs/tests/2026-11-07-passage-voix-soir.md` et `docs/tests/2026-11-07-etat-reel.md`)

| Aspect | Status |
|--------|--------|
| Code | 🔄 `main` à `089ccf7` (≈ 692 tests, lint, compilation OK). Fusionné ce soir (#46 à #63) : recadrage Nami épuré et tickets 13 à 16 ; page `/panel` (ticket 14) avec parcours tout à la voix (visa d'abord, passeport cherché, lu, confirmé à la voix, photo, agent lancé seul, vol proposé après) ; couche visuelle dans l'onglet (#49, souris violette) ; agent jusqu'à l'étape 1 de l'e-VOA (#48, densité 1, chemin des menus, `pick_option`) ; dépôt du passeport et de la photo (#50, #51) ; carte d'arrivée All Indonesia après le visa (#62) ; langue suivie (Gladia détecte, `/api/translate` traduit, #60) ; date d'atterrissage proposée (#61) ; MRZ robuste (nom composé, ligne 2, virgules, seconde lecture, #56) ; compréhension fiable (schéma simple, second essai, #57, #63) ; onglet vide avant l'agent (#58) ; arrêt à l'étape 1 avant tout envoi (#59). **Ouvertes** : #64 (voix : ElevenLabs Matilda par les haut-parleurs du Mac, file débloquée, micro seulement après une phrase dite, phrases fantômes ; second essai sur `holo4-35b-a3b`), #65 (ticket 17, billet retour, `fill_field`, nom à particule, Clément). **Pas commencé** : refonte visuelle du panneau, validée (`docs/specs/2026-11-07-refonte-panneau.md`). |
| Config | ✅ Banc du Mac de Nathan : Nami sur 3010 depuis `~/Code/projet/nami-agent` (détaché sur `main` + fichiers de la #64 copiés), lancé avec `NAMI_AGENT_CHROME_PORT=9333` et `NAMI_LOCAL_SESSION_ID` ; `ELEVENLABS_API_KEY` vient de `~/.zshrc` (env du serveur) ; Chrome de l'agent sur 9333 en densité 1, extension chargée dedans ; pont `holo local browser` en boucle dans un terminal de Nathan. ⚠️ Nathan ouvre encore le panneau Nami dans son Chrome personnel : la souris violette ne s'affiche que si le panneau est ouvert dans la fenêtre du Chrome de l'agent. |
| Tests | 🔄 Réel le 7/11 au soir : compréhension FR/EN ✅ (0,4 à 1,2 s), passeport 5 lectures sur 5 confirmées par la MRZ ✅, agent : 5 menus Select2 + Detail & Apply + Apply + étape 1 + dépôt du passeport et de la photo ✅ (31 étapes, 0,09 $) ; le site refuse la photo du passeport prise au téléphone (sa propre lecture MRZ) et n'affiche pas l'aperçu de la photo d'identité ; traduction fr/es/de ✅ (0,5 à 0,8 s, 8 à 12 s quand H traîne) ; voix : macOS entendue, ElevenLabs dite par l'API (non confirmée à l'oreille). Jamais fait : carte d'arrivée en réel, souris violette en réel, parcours complet à la voix dans le panneau de la fenêtre de l'agent. |

## Next Immediate Action
1) Fusionner la PR #64 (voix) et relire la #65 (Clément). 2) Coder la refonte du panneau validée par Nathan, en suivant `docs/specs/2026-11-07-refonte-panneau.md` (une étape à la fois, la vague, une couleur par papier, carte du passeport A21, carte de l'agent, moment final, Gambetta chargée depuis Fontshare, image de fond quand Nathan l'aura générée avec le prompt de la fiche), sur une branche `feat/refonte-panneau`, juge aveugle avant de montrer. 3) Sur le banc : Nami relancé sur 3010 (`cd ~/Code/projet/nami-agent && NAMI_AGENT_CHROME_PORT=9333 NAMI_LOCAL_SESSION_ID=<id du pont> npx next dev -p 3010`), panneau ouvert **dans la fenêtre du Chrome de l'agent**, passage complet à la voix : « Je pars à Bali lundi pour le mariage d'un ami », oui à chaque étape, visa jusqu'à l'étape 1 puis carte d'arrivée.
