# Ticket 05 : l'agent H remplit le visa (e-VOA) jusqu'à l'écran de paiement

Responsable humain : **Clément** (lance Devin, relit la PR, fait le test réel **sur son portable**).
Prérequis : `main` à jour (tickets 01, 02 et 04 fusionnés).
Branche : `feat/05-agent-visa`, PR vers `main`.

Lis la note `docs/specs/2026-11-07-cadrage-devin.md`, sections 2 (module Papiers), 3 (maillons 5 à 7), 4.3 routes 5 à 8, 4.5, 4.6, 4.8 et 4.9, et la section 7 (tests F1, F6, F8). Si `docs/tests/f1-evoa.md` existe, ses relevés (boutons, étapes, condition d'arrêt) priment sur les valeurs par défaut ci-dessous.

**Important** : l'agent pilote un Chrome posé sur le portable (mode navigateur local de H). Devin cloud peut écrire et tester ce code avec une API H simulée, mais **le test réel se fait sur le portable de Clément**, jamais sur un vrai site depuis le cloud.

## À faire

1. **`lib/h-agent.ts`**, client REST de l'API Agents de H (`https://agp.eu.hcompany.ai/api/v2`, `Authorization: Bearer $HAI_API_KEY`), sans le SDK `runSession` :
   - `createSession({ task, tools, localBrowserSessionId, maxTimeS, maxSteps })` : agent `HAI_AGENT_NAME`, `queue: false`, environnement web `user_device` relié à `localBrowserSessionId`, outils dans `agent.tools`. **Lire les noms exacts des champs** dans https://hub.hcompany.ai/agents-api/sessions/create.md et https://hub.hcompany.ai/agents-api/your-browser.md avant de coder.
   - `getChanges(id, fromIndex)` : `GET /sessions/{id}/changes?from_index=N&wait_for_seconds=20`, gère le **204** (aucun nouvel événement), renvoie `new_events`, l'état (`ActiveStateChangeEvent`, `data.state`), `pending_tool_calls`, `answer`, `metrics`. Doc : https://hub.hcompany.ai/agents-api/sessions/changes.md
   - `sendToolResult(id, toolReq, result)` : `POST /sessions/{id}/tool_results` avec `{ kind: "tool_result", tool_req, result }`. Doc : https://hub.hcompany.ai/agents-api/sessions/tool-results.md
   - `cancelSession(id)` : `DELETE /sessions/{id}`.
2. **Configuration du papier pilote** dans `lib/bali-papers.ts` : ajouter `forbidden_buttons` (par défaut pour l'e-VOA : `Pay`, `Bayar`, `Submit`, `Kirim`, `Proceed to payment`, tout bouton de choix du moyen de paiement) et garder `stop_condition`. Les deux seront ajustés d'après `docs/tests/f1-evoa.md`.
3. **Routes** :
   - `POST /api/papers/start` `{ request, passport, paper_id, local_session_id, file_paths }` : refuse si `paper_id` n'est pas l'e-VOA (seul pilote en V1) ou si `local_session_id` manque ; construit la consigne avec `buildPaperTask` (`lib/agent-task.ts`) ; outils `ask_user { question, field }` et `report_ready { summary, filled_fields[] }` ; `max_time_s: 900`, `max_steps: 80` ; renvoie `session_id`.
   - `GET /api/agent/[id]/changes?from_index=N`, `POST /api/agent/[id]/answer`, `POST /api/agent/[id]/cancel` (routes 6, 7, 8 de la note).
4. **Écran Trip** :
   - Le bouton « Create my visa » (déjà présent pour le voyage d'exemple) lance la vraie session pour un vrai voyage.
   - Réglages de démo, visibles avec `?demo=1` : champ « Local browser session » (l'identifiant affiché par `holo local browser`) et champ « Files » (chemins locaux du passeport et de la photo dans `private/`, par exemple `private/passeport.jpg`). Ces valeurs restent dans `localStorage`, jamais dans le code.
   - **Agent Activity** : les étapes de l'agent arrivent en direct (interrogation de la route `changes`), avec l'état et le coût (`metrics`). Bouton « Stop agent » toujours visible, qui appelle la route `cancel`.
   - Quand `ask_user` arrive : la question s'affiche dans la conversation et passe par `VoiceAnswer` (ticket 04) ; la réponse part par la route `answer` ; un même `id` d'appel n'est jamais répondu deux fois.
   - Quand `report_ready` arrive : répondre `"ok"`, l'e-VOA passe en « Pending approval » et l'agent écrit « Visa pre-filled in Chrome, stopped before payment. Check every field, then pay yourself. » avec `filled_fields`.
5. **Données sensibles** (section 4.9) : la consigne ne contient le numéro de passeport que pour l'agent ; l'interface en mode `?demo=1` le masque ; rien n'est écrit dans les journaux du serveur (pas de `console.log` de la consigne, du passeport ni des réponses de l'agent).

## Tests (vitest, API H simulée, aucun appel réseau)

- Création de session : corps conforme (`queue: false`, outils, environnement local, `max_time_s`, `max_steps`) ; refus sans `local_session_id` ; refus pour un autre papier que l'e-VOA.
- `changes` : 204 géré ; `answer` reçue après l'état terminal ; `pending_tool_calls` avec un `id` déjà traité ignoré.
- `answer` et `cancel` : appels conformes.
- La consigne contient les boutons interdits et la condition d'arrêt du papier.

## Test réel (Clément, sur son portable, avec l'accord écrit du titulaire du passeport)

1. Chrome dédié lancé avec un profil à part (section 4.6), puis `holo local browser` ; copier l'identifiant dans « Local browser session ».
2. Fichiers du passeport et de la photo dans `private/` ; chemins dans « Files ».
3. Demande « Je pars à Bali lundi… », réponses aux questions, « Prepare my entry papers », « Create my visa ».
4. Vérifier : l'agent remplit l'e-VOA étape par étape dans le Chrome visible, dépose les fichiers (sinon il demande à l'humain de les choisir, test F8), pose une question à l'oral, et **s'arrête sur l'écran de paiement sans rien cliquer**. Garder la main sur « Stop agent ».
5. 3 passages sur 3, durée et coût notés dans `docs/tests/f1-evoa.md`.

## Critère de fin

`npm test`, `npm run lint` et `npm run build` passent ; le test réel passe 3 fois sur 3 sur le portable ; aucun fichier de `private/` ni aucune clé dans le dépôt.
