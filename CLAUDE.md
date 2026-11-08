# Nami : instructions pour les agents (Claude, Devin…)

Agent de voyage du hackathon H Company × 42AI (Paris, 7 et 8 novembre 2026, rendu dimanche 14 h). Lire aussi `AGENTS.md` (règles Next.js 16, générées par `next dev`).

## Contexte produit (vault)
Note de projet de Nathan : `~/Code/perso/obsidian-vault/projets/_actifs/2026-11-hackathon-h-company-nami.md` (décisions, faits vérifiés, historique de la session de cadrage).

## Documents de référence (dans l'ordre)
0. `docs/onboarding/installation.md` et `docs/onboarding/etat-et-suite.md` : **installer et faire tourner Nami de zéro** (prérequis, `.env.local`, Chrome de l'agent, pont, extension, dépannage) et l'état du projet avec ce qui reste à faire. À lire en premier sur une machine neuve.
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
(vérifié le dimanche 8 novembre à 9 h par Claude sur la copie de relecture de Nathan ; état détaillé : `docs/onboarding/etat-et-suite.md`, installation : `docs/onboarding/installation.md`)

| Aspect | Status |
|--------|--------|
| Code | ✅ `main` à `04444eb` (PR #104) : 1019 tests, lint, `tsc` et build OK (vérifié à 9 h). Fusionné dans la nuit : #78 à #84 (dont #84 : visa en 60 s au lieu de 99, départ sur `about:blank`, `wait_web` au lieu de « take a screenshot », `settle_s` 0,5, voix `eleven_v4_turbo` en flux), puis #85 à #104 par Clément et Devin (module Vol de bout en bout, pont `holo` frais avant chaque session, session H muette relancée une fois, plus de 409, compréhension naturelle des oui et non, coches du panneau qui ramènent l'onglet, doc d'onboarding). #83 fermée (doublon de #84). Aucune PR ouverte. Point de reprise connu bon : étiquette `visa-ok-2026-11-07` (`bfe54e5`). |
| Config | 🔄 Deux bancs. **Mac de Clément** : banc de référence de la nuit (`npm run demo`, Nami sur 3000), voix macOS `say` (pas de clé ElevenLabs), `HAI_MODEL=holo4-35b-a3b` posé temporairement quand H était lent. **Mac de Nathan** : `~/Code/projet/nami-agent` encore sur la branche locale `banc/lot1` (code de #84 avant les PR #85 à #104), Nami sur 3010 (`NAMI_AGENT_CHROME_PORT=9333`, `NAMI_LOCAL_SESSION_ID`), Chrome de l'agent sur 9333, pont `holo` en boucle dans un terminal de Nathan. H à 9 h : 2 sessions sur 3 comptées actives (sessions figées de la nuit), 1 place libre. |
| Tests | 🔄 Parcours complet à la voix (visa, carte d'arrivée, vol jusqu'à la page de réservation) vu marcher sur le Mac de Clément dans la nuit (`docs/onboarding/etat-et-suite.md` § 1). Mesures de vitesse du visa : `docs/tests/2026-11-08-mesure-vitesse-visa.md`. **Pas encore** : parcours complet sur `main` à jour (#101 à #103 non revus en réel ensemble), relevé G1 du vol (3 passages), vidéo de secours, voix ElevenLabs sur le banc de démo. |

## Next Immediate Action
Revoir les améliorations de Clément (PR #85 à #104) puis faire un passage de contrôle sur le banc du Mac de Nathan : `cd ~/Code/projet/nami-agent && git fetch && git checkout --detach origin/main`, redémarrer Nami (`NAMI_AGENT_CHROME_PORT=9333 NAMI_LOCAL_SESSION_ID=<id du pont> npx next dev -p 3010`), recharger l'extension dans le Chrome de l'agent, un seul onglet sur `about:blank`, panneau ouvert dans cette fenêtre, puis `node scripts/passage-evoa.mjs controle-1` (attendu : 60 à 65 s, arrêt à l'étape 1) avant un passage complet à la voix. Si H refuse (429, « slots busy ») : vérifier `GET /sessions/quota` et attendre que les sessions figées de la nuit expirent. Si quelque chose casse : `git checkout visa-ok-2026-11-07`.
