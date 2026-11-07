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
(vérifié le samedi 7 novembre à 15 h 15)

| Aspect | Status |
|--------|--------|
| Code | 🔄 Fusionnés : 01, 02, 03 (PR #6), 04, routes protégées et passeport privé (PR #12), design + page World map (PR #13), fiche du coffre chiffré hors hackathon (PR #11). PR #14 (ticket 05 partie A, agent H sur l'e-VOA, Clément) : arrêt hors domaine ajouté, à jour avec `main`, 222 tests, lint et compilation OK ; test réel 3 sur 3 à faire. Partie B et ticket 06 pas commencés. |
| Config | ✅ Clés dans les secrets de Devin cloud (`HAI_API_KEY` remplacée à 14 h 25) ; `.env*` et `private/` ignorés ; accord écrit du titulaire du passeport. Nouvelles variables : `PASSPORT_READER` (`off` par défaut, `h` pour la démo), `NAMI_ACCESS_CODE` (obligatoire en production). ❓ CLI de H et Chrome dédié sur le portable de Clément ; `.env.local` locaux avec la nouvelle clé H. |
| Tests | ✅ `main` : 172 tests, lint et compilation OK ; F0, F5 (voix) et L1 (Linkup, 5 pays sur 5) réussis en réel. ❓ T8 (vrai passeport, Ali). ⬜ T4 à T6 (agent H sur le portable de Clément). |

## Next Immediate Action
PR #14 relue et à jour : attendre le test réel de Clément (CLI de H en cours d'installation), relire `docs/tests/f1-evoa.md` puis mettre la checklist à jour après la fusion. En parallèle, écrire `docs/tickets/06-demo.md` (tout brancher + mode démo préparé, avec `PASSPORT_READER=h`, `NAMI_ACCESS_CODE` si en ligne, redémarrage du serveur avant la démo pour les quotas) et préparer le pitch avec Nathan.
