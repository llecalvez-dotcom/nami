# Ticket 04 : la voix (Gladia)

Responsable humain : **Nathan** (lance Devin, relit la PR, fait le test réel F5 dans la salle).
Prérequis : ticket 01 fusionné dans `main`.
Branche : `feat/04-voix`, PR vers `main`.

Lis la note, sections 4.3 route 1 et 4.8.

## À faire

1. Bouton micro de l'accueil et de la conversation : enregistrement par `MediaRecorder` (10 à 20 s, arrêt au second clic), indicateur d'enregistrement visible.
2. `POST /api/voice/transcribe` (route 1) : envoi à Gladia en mode pré-enregistré côté serveur (téléversement de l'audio, création de la transcription, attente du résultat), langues `fr` et `en`, clé `GLADIA_API_KEY` jamais envoyée au navigateur. Lire la doc https://docs.gladia.io avant de coder (noms exacts des champs).
3. Le texte transcrit s'affiche dans un champ modifiable, puis part vers la route 2 au clic sur « Send ».
4. Préparer la boucle vocale de l'agent (section 4.8) en composant réutilisable : lire une question avec `speechSynthesis`, ouvrir le micro seulement dans `utterance.onend`, réponse envoyée au clic sur « Validate ».

## Tests

- Route 1 avec Gladia simulé : succès, erreur, délai dépassé.
- Micro refusé par le navigateur : le champ texte reste utilisable.

## Critère de fin

`npm test` et `npm run build` passent ; Nathan dicte la phrase du scénario dans la salle et le texte arrive dans la conversation.
