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
(vérifié le dimanche 8 novembre à 11 h par Claude sur la copie de relecture de Nathan ; installation : `docs/onboarding/installation.md`)

| Aspect | Status |
|--------|--------|
| Code | ✅ `main` à `b5fc6f7` (PR #110) : 1065 tests, lint, `tsc` et build OK (vérifié à 11 h). Fusionné ce matin : #106 (journal de la voix sans paroles, vol sans double session, réponses H bornées), #107 (Nami dit seulement la phrase affichée, micro rouvert après chaque phrase, plus de carte d'arrivée, vol dans son propre onglet, curseur violet toujours actif), #108 (module Hôtel sur Google Hotels), #109 et #110 (session sans première capture relancée après 35 s, 35 s de pause entre deux sessions, refuser le visa propose le vol, refuser le vol propose l'hôtel, filtre « 4+ rating » visible). Aucune PR ouverte. Points de reprise : étiquettes `demo-sans-hotels-2026-11-08` (`5e4bfec`, avant les hôtels et avant le correctif du vol) et `visa-ok-2026-11-07` (`bfe54e5`). |
| Config | 🔄 Banc du Mac de Nathan : `~/Code/projet/nami-agent` détaché sur `main`, Chrome de l'agent sur 9333, Nami sur le port 3000 (adresse de l'extension réglée sur 3000), lancés par `NAMI_LOCAL_SESSION_ID=91620180-3289-4884-a89b-fa46300a35f9 npm run demo` **depuis un terminal de Nathan** (une session Claude en arrière-plan n'a pas accès à `~/Documents`, où est le passeport ; ne jamais passer `PORT=` à ce script, il casse le pont). H à 11 h : 2 places sur 3 occupées par des sessions figées (`03086dcf`, `9c40ca4a`), 1 libre. Chaque Stop ou session figée peut bloquer une place longtemps. |
| Tests | 🔄 Vus en réel au script sur le banc : visa jusqu'à l'étape 1 en 76 s ; vol jusqu'à la page de réservation en 32 à 55 s, y compris lancé 12 s après une session ; hôtel jusqu'à ses prix en 26 à 59 s. Curseur vu bouger sur Google Flights avec un état simulé. **Échec connu : le parcours à la voix ne marche pas sur le banc de Nathan** (Chrome ouvre le micro du Mac et non le micro système ; mis de côté par Nathan à 10 h 33). **Pas encore** : visa puis vol puis hôtel dans le panneau sur `main`, relevé G1 du vol, vidéo de secours. |

## Next Immediate Action
Sur le banc de Nathan (Nami tourne déjà sur `main`), refaire le parcours **en cliquant** dans le panneau : recharger l'extension dans `chrome://extensions`, un seul onglet sur `about:blank`, « Nouveau voyage », visa, vol, hôtel. Après le visa, le vol peut mettre jusqu'à 30 s à apparaître, c'est la pause voulue : ne pas cliquer sur Stop. Pour lire ce qui s'est passé : journal `~/Code/projet/nami-agent/.next/dev/logs/next-development.log`, journal du pont dans `$TMPDIR/nami-demo/holo-local-browser.log`, et dans le panneau `window.namiVoiceLog` (durée, niveau, nombre de mots de chaque enregistrement, jamais les mots). Si H répond « slots busy » : `GET /sessions/quota`, attendre qu'une place se libère. Si quelque chose casse : `git checkout demo-sans-hotels-2026-11-08`. Ensuite : la voix sur le micro du Mac, puis la vidéo de secours. Rendu à 14 h.
