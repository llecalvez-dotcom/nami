# État du projet, ce qui reste à faire, prochaines étapes

État au dimanche 8 novembre 2026, 6 h du matin (Paris), `main` à la fusion de la PR #103. Rendu du hackathon H Company × 42AI : dimanche 14 h. Détail fonctionnalité par fonctionnalité dans `docs/equipe/checklist.md` (lignes F1 à F40) ; résultats des tests réels dans `docs/tests/`.

## 1. Ce qui est fait et vu marcher en réel

Parcours complet **à la voix, dans le panneau, sur le Mac de Clément** dans la nuit du 7 au 8 novembre : demande, passeport, photo, visa jusqu'à l'étape 1, carte d'arrivée remplie, vol trouvé et ouvert jusqu'à la page de réservation Google. Clément : « les tests de bout en bout, ils marchent ».

### Compréhension et voix
- Transcription Gladia, compréhension par le modèle H avec repli (`holo4-27b` puis `holo4-35b-a3b`), langue suivie et interface traduite.
- Réponses naturelles comprises : listes fermées (« ouais carrément », « nope », « non merci ») puis interprétation par le modèle H de toute phrase libre (« je suis chaud » = oui, « le moins cher et le plus rapide » = compromis, « le deuxième, celui de Qatar » = ce vol) ; en cas de doute, texte libre, jamais de clic inventé (PR #91, #94, #103).
- Le micro ne s'ouvre jamais tout seul (PR #87). Voix par `say` de macOS (ElevenLabs disponible mais non retenu : Nathan s'en charge).
- Plus de question d'heure d'atterrissage : c'est Nami qui cherche le vol (PR #86, #88).

### Documents
- Passeport retrouvé dans le dossier local, lu par la vision H, MRZ vérifiée (chiffres de contrôle, comparaison aux champs), confirmé à la voix ; photo d'identité trouvée (HEIC converti) ; zone glisser-déposer quand un document manque (PR #90).
- Lecture réessayée une fois quand H est lent ; message « H did not answer » distinct de « document illisible » ; « Try again » sur le même fichier (PR #101).

### Agent H : visa et carte d'arrivée
- e-VOA : menus, Detail & Apply, Apply, étape 1 avec passeport déposé et lu par le site, photo déposée, arrêt avant tout Next ; 60 à 125 s selon H ; « Stop agent » à tout moment.
- Carte d'arrivée All Indonesia remplie, arrêt avant Submit (comportement voulu).
- Pont `holo local browser` relancé frais avant chaque session d'après son journal (PR #92, #99) : plus d'échecs en boucle sur un chromedriver mort.
- Garde-fous : arrêt si l'agent quitte le domaine officiel, mots Submit / Pay / Bayar / Kirim interdits, aucun envoi.

### Module Vol (ticket 18)
- Après « oui » au vol : ville de départ demandée, dates confirmées, critère à la voix ou au clic ; Google Flights pré-rempli (`hl=en`) ; Nami lit elle-même les vols dans la page ; 2 ou 3 vols réels proposés en boutons courts et lisibles ; vol ouvert jusqu'à la page des options de réservation ; jamais réservé (PR #76, #82, #96, #97, #100, #103). Meilleur passage : vols proposés à 13 s, page de réservation à 27 s, fin à 31 s.
- Garde-fou hors Google armé seulement une fois Google Flights vu (PR #100) ; une relance ne repose ni la ville, ni les dates, ni le critère (PR #103) ; critères combinés = meilleur compromis.
- Linkup écarté pour les prix en direct après test (`docs/tests/g0-linkup-vols.md`).

### Panneau et extension
- Une étape à la fois, « la vague », coches Passeport / Photo / Visa / Carte d'arrivée / Flight avec état, ligne d'état permanente « ce que fait l'agent » (PR #95).
- Clic sur une coche : l'onglet où l'agent a travaillé revient tel quel, jamais une nouvelle page tant qu'un onglet du site existe ; sinon site rouvert et ligne d'état qui le dit (PR #102).
- Couche visuelle dans l'onglet (souris violette, contour, cadre, bulle), redemandée à chaque page chargée.
- Le panneau attend quand l'utilisateur finit une démarche à la main.

### Robustesse quand H est lent (PR #101, 8 novembre)
- Session ouverte mais jamais pilotée : abandonnée à 45 s et relancée une fois automatiquement avec les mêmes paramètres ; puis relance manuelle.
- Stop ou abandon libère le navigateur localement sans attendre H : plus de 409.
- Tous les appels H bornés (création 30 s, autres 20 s, long-poll 35 s) ; « Busy » (concurrence) distingué du quota, réessai automatique ; quotas de test relevés.

### Qualité
- 1018 tests vitest, lint et build verts sur `main` ; tests de routes, de flux, de panneau et d'extension.

## 2. Limites volontaires (ne pas « corriger »)

- Le visa s'arrête à l'étape 1, la carte d'arrivée avant Submit, le vol sur la page de réservation : l'utilisateur envoie et paie lui-même.
- Aucune donnée personnelle envoyée à une compagnie ou à un comparateur ; aucune connexion à un compte.
- Démo en local uniquement : les routes de l'agent n'ont pas de contrôle du propriétaire de session (seul le code d'accès de `proxy.ts`), ne pas déployer en public.
- Hôtel : « soon ».

## 3. Ce qui bloque au moment d'écrire

- **L'API H Agents est saturée côté H Company** : 6 sessions du compte restent `running` avec 0 step depuis des heures, `DELETE` répond 204 sans effet, et toute nouvelle session répond 429 « slots busy » / « platform rate-limited ». Aucun agent ne peut démarrer tant que H n'a pas purgé ces sessions ou relevé la limite. Ids transmis à Clément pour H Company : `5eaa1f6f-b01f-4620-8afc-64ed2fc81ab5`, `98abba10-3832-4672-bd4b-4af4e5b874de`, `ced1ce54-2e17-4c4f-911b-9be78fdb9e5e`, `d143e6b2-b1a2-47d0-a2cd-be9a39ebc663`, `6a1ab4bc-213c-4184-b88d-6909825c8196`, `ce4f90d5-9e96-4f55-a16d-eb6a8f7a3d6b`.
- Le modèle `holo4-27b` était très lent dans la nuit : `HAI_MODEL=holo4-35b-a3b` est posé **temporairement** dans le `.env.local` du banc (sauvegarde `.env.local.bak-*` à côté). À retirer quand H est revenu.

## 4. Ce qui reste à faire (par priorité)

### Avant le rendu (dimanche)
1. **Dès que H est débloqué** : parcours complet à la voix sur `main` (`fe38c45` ou plus récent), avec l'extension rechargée (PR #102 touche `extension/`). Vérifier en particulier : relance automatique d'une session muette, Stop puis nouvelle session sans 409, « Search again » sans question reposée, options de vol lisibles, coche Visa qui ramène l'onglet du formulaire.
2. **Vidéo de secours** du parcours complet (Cmd+Maj+5), avec les règles de départ de `installation.md` section 9. Jamais faite.
3. Pitch de 3 minutes (`docs/equipe/cockpit.md`, « Démo en 3 minutes ») et répétitions ; gel du code dimanche 11 h.
4. Relevé G1 du module Vol (3 passages, `scripts/passage-vol.mjs`, `docs/tests/g1-vols.md`) : jamais consigné, le script existe.
5. Mettre à jour la section « Current Project State » de `CLAUDE.md` (encore à `f0254c1`, 837 tests) : `main` à la PR #103, 1018 tests, banc de Clément, PR #86 à #103 fusionnées.
6. Après la démo (S5 de la checklist) : supprimer les sessions H, les documents hors dépôt et les sauvegardes `.env.local.bak-*`.

### Dette technique connue (petites PR)
- Remarque de revue sur `lib/h-agent.ts` (PR #101) : la lecture du corps JSON de la réponse de `createSession` n'est pas bornée si H envoie les en-têtes puis se fige ; borner la lecture du corps comme le reste de l'appel.
- `lib/api-guard.ts` : les quotas ont été relevés pour une soirée de tests (`formalities` 60, `extract` 30, `parse` 60, `say` 1200, `transcribe` 120) ; décider des valeurs de démo.
- `.env.example` ne liste pas toutes les variables lues par le code (`HAI_VISION_MODEL`, `NAMI_AGENT_SETTLE_S`, `ELEVENLABS_*`, `NAMI_MAC_VOICE`, `NAMI_STREAM_PLAYER`) ; `installation.md` section 4 les documente, l'exemple pourrait les reprendre.
- Les registres en mémoire (`globalThis` : préflight, stall, quotas) sont perdus à chaque redémarrage et faux après un rechargement à chaud qui change leur forme : acceptable en démo locale, à revoir pour un déploiement.
- `/api/voice/intent` : le modèle renvoie parfois un seul critère quand la phrase en nomme deux ; contourné côté panneau (`namesSeveralCriteria`), le prompt pourrait être durci.

### Chantiers ouverts (checklist, après le hackathon)
- F17 : validation page par page (`confirm_page`) avant chaque « Suivant » (ticket 06, partie A).
- T6b : un autre pays en beta (Kenya ou Tanzanie), l'agent s'arrête avant le paiement.
- B6b : `/api/papers/start` pour un papier en direct de n'importe quel pays, domaine revérifié par le serveur (ticket 05, partie B).
- T9 / ticket 10 : l'agent pilote l'ordinateur entier (Finder) ; T10 : parcours à la voix dans le bruit de la salle (jamais fait au micro de salle).
- Ticket 07 : coffre chiffré des documents.
- Voix ElevenLabs en production (Nathan), module Hôtel, déploiement public avec contrôle du propriétaire des sessions.

## 5. Prochaines étapes, dans l'ordre, pour qui reprend le projet

1. Installer selon `installation.md` (sections 1 à 8), vérifier chaque section.
2. Vérifier l'état de H (section 11 de `installation.md`) : s'il reste des sessions `running` à 0 step, contacter H Company avant toute chose.
3. Un passage visa au script (`node scripts/passage-evoa.mjs reprise-1`), puis un passage vol (`node scripts/passage-vol.mjs reprise-vol best 1`), puis le parcours complet à la voix. Consigner dans `docs/tests/`.
4. Enregistrer la vidéo de secours.
5. Traiter la dette technique de la section 4 par petites PR, une par sujet, checklist mise à jour à chaque fusion.

## 6. Repères

- Dépôt : https://github.com/llecalvez-dotcom/nami ; `main` fusionne les PR #86 à #103 de la nuit du 7 au 8 novembre.
- Point de repli vu marcher à la voix le 7 novembre : tag `visa-ok-2026-11-07` (visa seul, avant le module Vol).
- Équipe : Léon (front et conversation), Clément (agent H, banc de démo), Ali (papiers et intelligence), Nathan (voix, démo, qualité), avec Devin (construction) et Claude (cadrage, relecture).
- Discord H Company : https://discord.gg/y7bf5YRmST
