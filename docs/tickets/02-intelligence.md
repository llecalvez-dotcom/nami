# Ticket 02 : compréhension de la demande et moteur de suggestions

Responsable humain : **Nathan** (lance Devin, relit la PR et fait le test réel F0).
Prérequis : ticket 01 fusionné dans `main` (contrats `lib/contracts.ts`).
Branche : `feat/02-intelligence`, PR vers `main`.

Lis la note `docs/specs/2026-11-07-cadrage-devin.md`, sections 1 (« Intelligence attendue »), 4.3 routes 2 et 3, 4.4, et 8 (tests 1 et 2).

## À faire

1. `lib/planner/` (fonctions pures) : `nextQuestion(draft)`, `suggestModules(request)`, `formalityWindows(request, formalities)`, exactement comme décrit en 4.3 point 3 (ordre des questions, Bali seulement, liste « aucun visa pour un passeport français » = UE + EEE + Suisse nommée comme telle, fenêtres en heures dans `Asia/Makassar`, 00:00 heure de Bali par défaut si l'heure d'atterrissage manque, réponse « un dossier à la fois » pour plusieurs voyageurs).
2. `POST /api/trip/parse` (route 2) : appel à la Models API de H (`HAI_API_KEY`, compatible OpenAI), sortie validée par zod en `TripRequestDraft` ; dates relatives résolues avec `today` ; liste des champs changés calculée dans le code. Repli Claude Haiku (`ANTHROPIC_API_KEY`) derrière une variable `LLM_PROVIDER=h|anthropic`.
3. Brancher dans l'écran Trip : la demande produit une carte « question » tant que `nextQuestion` n'est pas `null`, puis les cartes « proposition » de `suggestModules`.

## Tests (vitest)

- Test d'acceptation 1 de la note, cas par cas (Bali lundi, Barcelone, Genève, Jakarta, Lombok, Tanzanie, départ de Bruxelles, deux voyageurs).
- Test d'acceptation 2 (fenêtres, dont changement de jour).
- Route 2 avec le modèle simulé (pas d'appel réseau dans les tests).

## Critère de fin

`npm test` et `npm run build` passent ; le parcours « demande tapée → questions → proposition Papiers » marche dans l'app avec le vrai modèle (Ali le vérifie avec sa clé).
