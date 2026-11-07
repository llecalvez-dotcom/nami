# Ticket 03 : papiers de Bali, Linkup et lecture du passeport

Responsable humain : **Ali** (lance Devin, relit la PR, fait les tests réels L1 et F7).
Prérequis : ticket 01 fusionné dans `main`.
Branche : `feat/03-papiers-documents`, PR vers `main`.

Lis la note, sections 2 (module Papiers, Documents), 4.3 routes 4 et 12, 4.9, 5 (lignes Indonésie) et 8 (test 3).

## À faire

1. `lib/bali-papers.ts` (créé au ticket 01) : vérifier qu'il reprend les faits observés de la section 5 (e-VOA 500 000 IDR, carte d'arrivée gratuite ouverte 72 h avant l'arrivée, taxe de Bali 150 000 IDR, domaines officiels).
2. `POST /api/formalities` (route 4, version 4.3 de la note) : **recherche en direct à chaque demande, pour tous les pays, Bali compris**. Linkup avec `includeDomains` = `diplomatie.gouv.fr` + domaines gouvernementaux du pays, question « passeport français ». Chaque papier affiche l'heure et la source (« found at 14:02 on diplomatie.gouv.fr »). `structuredOutputSchema` en chaîne JSON, réponse `{ data, sources }`.
   - `lib/bali-papers.ts` est le **corrigé** : test qui compare la réponse en direct pour Bali à la table (3 papiers, coûts, domaines), et **secours affiché honnêtement** si Linkup échoue ou dépasse 15 s (« verified by hand on 7 Nov 2026 »). Si la réponse en direct contredit la table, afficher la réponse en direct avec l'alerte « differs from our last check ».
   - Hors V1 : même recherche, papiers affichés avec leurs sources, sans proposition de remplissage (« automatic filling is validated country by country; Bali is the first »).
   - Champ libre dans l'écran Trip, visible en mode `?demo=1` : « Try another country » pour lancer la recherche sur un pays choisi par le jury.
3. Contrôle de domaine complet (`lib/official-sites.ts`) : étiquettes de fin, liste blanche, requête HEAD côté serveur, sources non officielles marquées et non cliquables.
4. `POST /api/documents/extract` (route 12) : image en mémoire, jamais écrite sur disque ni journalisée ; modèle de vision de H, repli Claude ; 7 champs, confiance par champ ; alerte si le passeport expire moins de 6 mois après le retour.
5. Dans l'écran Trip : carte « Send me a photo of your passport » avec dépôt de fichier, champs affichés pour confirmation au clic ; mode masquage avec `?demo=1` (2 derniers caractères du numéro, date de naissance masquée).

## Tests (vitest)

- Test d'acceptation 3 de la note sur des réponses Linkup simulées.
- Route 12 avec un modèle simulé : champs valides, champ manquant, passeport bientôt expiré.
- Aucun fichier réel de `private/` dans les tests ni dans le dépôt.

## Critère de fin

`npm test` et `npm run build` passent ; Ali obtient en direct les 3 papiers de Bali avec leurs liens officiels (test L1), un pays hors V1 en direct aussi, et la lecture du vrai passeport (test F7) remplit les champs.
