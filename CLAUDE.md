# Nami : instructions pour les agents (Claude, Devin…)

Agent de voyage du hackathon H Company × 42AI (Paris, 7 et 8 novembre 2026, rendu dimanche 14 h). Lire aussi `AGENTS.md` (règles Next.js 16, générées par `next dev`).

## Contexte produit (vault)
Note de projet de Nathan : `~/Code/perso/obsidian-vault/projets/_actifs/2026-11-hackathon-h-company-nami.md` (décisions, faits vérifiés, historique de la session de cadrage).

## Documents de référence (dans l'ordre)
1. `docs/equipe/checklist.md` : chaque fonctionnalité, son état, son responsable. **À mettre à jour à chaque PR fusionnée.**
2. `docs/equipe/cockpit.md` : façon de travailler, répartition, calendrier, démo, règles.
3. `docs/specs/2026-11-07-cadrage-devin.md` : note de cadrage (v4.3) : routes, contrats, consignes de l'agent H, tests, registre des faits.
4. `docs/tickets/NN-*.md` : une fiche par morceau à construire.

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
(vérifié le samedi 7 novembre à 14 h 07)

| Aspect | Status |
|--------|--------|
| Code | 🔄 Fusionnés : squelette (01), compréhension de la demande par le modèle H (02), voix Gladia (04). PR #6 en brouillon (03 : papiers en direct Linkup, lecture du passeport, affichage) : backend relu et testé (121 tests), affichage en cours chez Devin cloud. Ticket 05 (agent H sur le visa e-VOA) écrit, pas encore lancé. Ticket 06 (tout brancher + mode démo préparé) pas écrit. |
| Config | ✅ Clés dans les secrets de Devin cloud ; `.env*` et `private/` ignorés ; accord écrit du titulaire du passeport. ❌ CLI de H (`hai-agents[cli,browser]`) et Chrome dédié pas encore installés sur le portable de Clément. |
| Tests | ✅ `main` : 69 tests, lint et compilation OK ; F0 (compréhension) et F5 (voix) réussis en réel. ❓ Aucun résultat sur GitHub pour F1 manuel, F6, F8 (Clément), L1 et F7 (Ali, rapport L1 en cours dans la PR #6). |

## Next Immediate Action
Quand la PR #6 sort du brouillon : la récupérer (`git fetch origin pull/6/head:pr6 && git checkout pr6`), lancer `npm test`, `npm run lint`, `npm run build`, simuler la fusion avec `main`, relire l'affichage (cartes des papiers, carte passeport, « Try another country », masquage `?demo=1`) et le rapport L1, puis donner le verdict à Nathan ; Ali fait ensuite ses tests réels L1 et F7 et fusionne. En parallèle, relancer Clément : parcours manuel du e-VOA jusqu'à l'écran de paiement dans `docs/tests/f1-evoa.md`, puis Devin cloud sur `docs/tickets/05-agent-visa.md`.
