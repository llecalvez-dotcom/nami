# Nami : instructions pour les agents (Claude, Devin…)

Agent de voyage du hackathon H Company × 42AI (Paris, 7 et 8 novembre 2026, rendu dimanche 14 h). Lire aussi `AGENTS.md` (règles Next.js 16, générées par `next dev`).

## Contexte produit (vault)
Note de projet de Nathan : `~/Code/perso/obsidian-vault/projets/_actifs/2026-11-hackathon-h-company-nami.md` (décisions, faits vérifiés, historique de la session de cadrage).

## Documents de référence (dans l'ordre)
1. `docs/equipe/checklist.md` : chaque fonctionnalité, son état, son responsable. **À mettre à jour à chaque PR fusionnée.**
2. `docs/equipe/cockpit.md` : façon de travailler, répartition, calendrier, démo, règles.
3. `docs/specs/2026-11-07-recadrage-computer-use.md` : recadrage du samedi 15 h 40, le computer use au centre (prime sur la note de cadrage pour ce qu'il reprend).
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
(vérifié le samedi 7 novembre à 18 h ; mesures détaillées dans `docs/tests/2026-11-07-etat-reel.md`)

| Aspect | Status |
|--------|--------|
| Code | 🔄 Sur `main` (307 tests, lint, compilation OK) : 01 à 04, routes protégées et passeport privé (#12), contrôle MRZ (#18), design (#13, #19, #23), extension panneau latéral (#24, ticket 08), conversation à la voix (#25, ticket 06 partie B), recherche du passeport dans un dossier (#21, ticket 09) et sa lecture (#30, ticket 12 A1), heure d'atterrissage (#28), script de démo `npm run demo` (#31). PR ouvertes : #14 (agent H sur l'e-VOA, Clément, en test réel), #34 (passeport confirmé transmis à l'agent, ticket 12), #33 (durcissement du script de démo), #27 (finition ergonomie), #26 (score des documents). Pas commencés : `confirm_page` (ticket 06 A), dépôt du fichier par Nami (ticket 12 B), outil `choose_option` pour Select2 (ticket 12 C), mode démo préparé, module Vol (jamais construit). |
| Config | ✅ Devin cloud abandonné (plus de crédits) : chacun travaille avec Devin CLI et un `.env.local` local, qui doit contenir `HAI_API_KEY` (nouvelle clé de 14 h 25), `GLADIA_API_KEY`, `LINKUP_API_KEY`, `PASSPORT_READER=h` pour lire la photo, `NAMI_DOCUMENTS_DIR` pour chercher le passeport. Agent : Chrome dédié lancé par `npm run demo` (port 9333, sans mise en veille ni traduction), fenêtre visible à côté de Nami. |
| Tests | 🔄 Mesuré en réel le 7/11 : compréhension ✅, voix ✅, Linkup ✅ (3 à 15 s), lecture du passeport 🟡 (8 s puis échecs à 30 s quand H est chargé), agent H 🟡 (navigue sur l'e-VOA, bloqué par les menus Select2 dès le premier menu ; dépôt de fichier impossible en mode navigateur). Jamais fait : parcours complet jusqu'à l'écran de paiement, T9 (agent de l'ordinateur entier), test dans le bruit de la salle. |

## Next Immediate Action
Débloquer l'agent sur l'e-VOA : 1) lancer `npm run demo` depuis la branche de la PR #14 à jour (Chrome de l'agent sans veille, pont relancé tout seul, Nami), garder la fenêtre de l'agent visible ; 2) passage réel : nouveau voyage « I'm flying to Bali on Monday for a friend's wedding, landing at 2:30 pm », passeport confirmé, « Create my visa » ; vérifier si la consigne clavier pour Select2 (`docs/tickets/12-passeport-automatique.md`, partie C, point 1) ouvre le menu du pays ; 3) sinon coder l'outil `choose_option` (partie C, point 2) ; 4) noter chaque passage dans `docs/tests/f1-evoa.md`.
