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
(vérifié le samedi 7 novembre à 14 h 35)

| Aspect | Status |
|--------|--------|
| Code | 🔄 Fusionnés : squelette (01), compréhension par le modèle H (02), papiers en direct Linkup + lecture du passeport + affichage (03, PR #6), voix Gladia (04). Ticket 05 élargi (PR #9) : partie A e-VOA de Bali, partie B tout papier officiel en beta ; pas encore lancé sur Devin. Ticket 06 (tout brancher + mode démo préparé) pas écrit. |
| Config | ✅ Clés dans les secrets de Devin cloud (`HAI_API_KEY` remplacée à 14 h 25, vérifiée par Devin : `/api/trip/parse` en 200) ; `.env*` et `private/` ignorés ; accord écrit du titulaire du passeport. ❌ CLI de H (`hai-agents[cli,browser]`) et Chrome dédié pas encore installés sur le portable de Clément. ❓ Les `.env.local` locaux ont-ils la nouvelle clé H ? |
| Tests | ✅ `main` : 131 tests, lint et compilation OK ; F0 (compréhension), F5 (voix) et L1 (Linkup, 5 pays sur 5) réussis en réel. ❓ F7 (vrai passeport, Ali), F6 et F8 (Clément) sans résultat sur GitHub. |

## Next Immediate Action
Relancer Clément : Devin cloud sur `docs/tickets/05-agent-visa.md` partie A (e-VOA de Bali, sans repérage manuel), et installer le CLI de H et le Chrome dédié sur son portable pendant que Devin code. Relire la PR 05 dès qu'elle arrive (tests, lint, compilation, fusion simulée). En parallèle : Ali fait le test F7 (`docs/tests/f7-passeport.md`), Claude écrit le ticket 06 et prépare le pitch avec Nathan.
