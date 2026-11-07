# Ticket 06 : validation page par page et conversation à la voix

Responsable humain : **Nathan** (lance Devin, relit la PR, teste à la voix sur son Mac).
Prérequis : PR #14 (ticket 05, partie A) fusionnée dans `main`.
Branche : `feat/06-validation-voix`, PR vers `main`.

Lis d'abord `docs/specs/2026-11-07-recadrage-computer-use.md` (sections 3 et 4), puis `docs/tickets/05-agent-visa.md`.

## But

L'utilisateur parle avec Nami du début à la fin, et l'agent H demande son accord à la fin de chaque page avant de cliquer « Suivant ». Le moment visé est la section 3 du recadrage.

## À faire

### A. Validation page par page (`confirm_page`)

1. Nouvel outil de l'agent H, à côté de `ask_user` et `report_ready` (`lib/paper-agent.ts`) :
   `confirm_page { page: string, filled_fields: string[] }`, description : « Call this when every field of the current page is filled, before clicking the button that goes to the next page. Wait for the answer: "yes" means click it; anything else is a correction to apply on this page, then call confirm_page again. »
2. La consigne (`buildPaperTask`, `lib/agent-task.ts`) dit d'appeler `confirm_page` à la fin de chaque page.
3. Dans la conversation : une carte « Agent · page ready » avec le nom de la page et les champs remplis (valeurs sensibles masquées comme aujourd'hui), lue à voix haute, réponse « yes » au clic (bouton « Continue ») ou à la voix ; toute autre réponse est envoyée telle quelle comme correction.
4. Même règle que `ask_user` : un appel n'est jamais répondu deux fois (`handled_tool_ids`).

### B. Conversation à la voix

1. **Nami parle** : chaque nouvel élément de la conversation venant de Nami ou de l'agent (message, question, proposition, `ask_user`, `confirm_page`, fin de l'agent) est lu à voix haute par `speechSynthesis`, un seul à la fois, dans l'ordre. Bouton « Mute » dans l'en-tête, mémorisé dans `localStorage`.
2. **On répond à la voix partout** : chaque question à boutons et chaque proposition a un micro. Le micro s'ouvre tout seul à la fin de la lecture (comme `VoiceAnswer` aujourd'hui).
3. **Fin de parole automatique** : l'enregistrement s'arrête seul après 1,5 s de silence (niveau mesuré par un `AnalyserNode` de Web Audio), en plus du clic et de la limite de 20 s.
4. **Envoi automatique** des réponses courtes, sans clic :
   - proposition : « yes », « oui », « ok », « go », « vas-y » → accepter ; « no », « non », « later », « plus tard » → refuser ;
   - question à boutons : la transcription est comparée aux libellés des boutons (sans casse ni accents) ; une seule correspondance → ce bouton ; sinon, la transcription part comme réponse texte (chemin existant `onAnswerText`) ;
   - `confirm_page` : « yes », « oui », « ok », « continue » → oui ; autre chose → correction ;
   - `ask_user` : la transcription reste dans le champ et part au clic sur « Validate » (une adresse e-mail dictée doit être relue).
5. Les données sensibles ne passent jamais par la voix : pas de micro sur la carte passeport (règle du cadrage).
6. Aucun tiret cadratin ni demi-cadratin dans les textes.

## Tests (vitest, rien de réel)

- Correspondance d'une transcription avec les libellés des boutons : une correspondance, aucune, plusieurs ; accents et casse ignorés.
- « oui », « yes », « ok » acceptent une proposition ; « non », « later » la refusent ; une phrase longue n'est pas prise pour un oui.
- `confirm_page` : la consigne demande l'outil ; « yes » renvoie `"yes"` à H ; une correction est renvoyée telle quelle ; un même `id` n'est jamais répondu deux fois.
- File de lecture : deux éléments arrivés ensemble sont lus l'un après l'autre ; « Mute » coupe la lecture.

## Test réel (Nathan, sur son Mac, avec le micro, dans la salle)

1. Parcours complet à la voix depuis l'accueil, sans clavier : demande, deux questions, « Prepare my entry papers », « Create my visa ».
2. Avec l'agent H (sur le portable de Clément) : au moins une `confirm_page` validée à la voix.
3. Noter dans `docs/tests/f5-conversation-voix.md` : chaque étape, compris ou non, durée, faux départs du micro.

## Critère de fin

`npm test`, `npm run lint` et `npm run build` passent ; le parcours de bout en bout se fait sans clavier ; aucune donnée du passeport dans les journaux.
