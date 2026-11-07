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
(vérifié le dimanche 8 novembre vers 0 h 30 ; point de reprise : étiquette `visa-ok-2026-11-07`, note `docs/tests/2026-11-07-passage-panneau-visa-ok.md`)

| Aspect | Status |
|--------|--------|
| Code | ✅ `main` à `f055767` (≈ 746 tests, lint, build OK). **Partie 1 validée en réel** : depuis le panneau, à la voix, le visa e-VOA va jusqu'au bout (4 menus choisis de façon visible, Detail & Apply, Apply, passeport déposé et lu par le site, photo déposée, arrêt à l'étape 1 sans rien envoyer ; 19 étapes H, 0,05 $). Fusionné cette nuit : #64 (voix ElevenLabs), #67, #68 (panneau : une étape à la fois, tableau peint de la porte de Bali, de l'aube à la nuit, police système, texte sur mur clair), #69 (souris violette sur les clics de l'agent), #71 (garde-fou tolérant un onglet d'accueil, onglet unique, photo HEIC convertie, copie gardée 15 min), #72 (relevés de Clément), #73 (langue : seulement sur une phrase de 3 mots), #74 (pas de relecture au rechargement), #76 (module Vol de Clément), #77 (menus visibles, voix courte). **Ouvertes** : #78 (Nouveau voyage repart de zéro), #79 (réessayer un papier après un échec), #80 (note du point de reprise), #70 (Ali, papiers toute destination, touche le panneau, à relire), #75. |
| Config | ✅ Banc du Mac de Nathan : `~/Code/projet/nami-agent` sur la branche `etat/visa-ok-2026-11-07` (code du passage réussi), Nami sur 3010 (`NAMI_AGENT_CHROME_PORT=9333`, `NAMI_LOCAL_SESSION_ID`), voix ElevenLabs par les haut-parleurs ; Chrome de l'agent sur 9333 en densité 1 (flou sur Retina, voulu), extension Nami chargée dedans (micro autorisé par ses options) ; pont `holo local browser` en boucle dans un terminal de Nathan. Le panneau s'ouvre **dans la fenêtre du Chrome de l'agent**, jamais dans le Chrome personnel. Documents : passeport en scan à plat, photo d'identité JPEG (copie `~/Downloads/photo-identite-jpeg.jpg`). |
| Tests | 🔄 Visa de bout en bout depuis le panneau ✅ (1 passage complet, session `5b7f9eb3`) ; scripts de Clément : 2 passages complets sur 3. **Carte d'arrivée jamais ouverte en réel** : lancée pendant le redémarrage du pont holo (« Connection refused on the WebDriver port »), relance proposée à minuit, résultat non vu. Pas encore : vidéo de secours, module Vol branché après le visa (Clément). |

## Next Immediate Action
1) Fusionner #78, #79 et #80, puis mettre le banc sur `main` (`cd ~/Code/projet/nami-agent && git fetch && git checkout --detach origin/main`) et redémarrer `next dev` sur 3010 (`NAMI_AGENT_CHROME_PORT=9333 NAMI_LOCAL_SESSION_ID=<id du pont> npx next dev -p 3010`). 2) Recharger l'extension dans le Chrome de l'agent, ouvrir un onglet neuf sur `https://evisa.imigrasi.go.id/web/visa-selection` (un seul onglet), ouvrir le panneau dans cette fenêtre. 3) Passage complet à la voix (« Je pars à Bali lundi pour le mariage d'un ami », oui à chaque étape), en enregistrant l'écran (Cmd+Maj+5) pour la vidéo de secours ; attendre quelques secondes après « Your visa is ready » avant d'accepter la carte d'arrivée, pour que le pont holo redémarre. Si quelque chose casse : `git checkout visa-ok-2026-11-07` dans le banc et redémarrer `next dev`.
