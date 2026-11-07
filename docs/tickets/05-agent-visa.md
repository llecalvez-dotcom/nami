# Ticket 05 : l'agent H remplit le visa (e-VOA), puis tout papier officiel en beta, jusqu'à l'écran de paiement

Responsable humain : **Clément** (lance Devin, relit la PR, fait le test réel **sur son portable**).
Prérequis : `main` à jour (tickets 01, 02 et 04 fusionnés). La partie B a besoin du ticket 03 (PR #6, papiers en direct) : la coder sur `main` une fois la PR #6 fusionnée.
Branche : `feat/05-agent-visa`, PR vers `main`.

Lis la note `docs/specs/2026-11-07-cadrage-devin.md`, sections 2 (module Papiers), 3 (maillons 5 à 7), 4.3 routes 5 à 8, 4.5, 4.6, 4.8 et 4.9, et la section 7 (tests F1, F6, F8).

**Pas de repérage manuel avant de coder.** L'agent H lit la page et s'adapte, comme Claude in Chrome : aucun script écrit site par site. La consigne (`buildPaperTask`, `lib/agent-task.ts`) est déjà générique. Le premier passage réel de l'agent sur l'e-VOA sert de repérage : Clément note les étapes, les boutons et les blocages (captcha, compte, code par e-mail) dans `docs/tests/f1-evoa.md`, et on ajuste `forbidden_buttons` et `stop_condition` d'après ce relevé.

**Deux parties, dans cet ordre.** A : l'e-VOA de Bali, parcours garanti de la démo, 3 passages sur 3. B : n'importe quel papier trouvé en direct pour un autre pays, en beta. Décision de Nathan (samedi 7 novembre, 14 h 30) : elle élargit la règle « Bali d'abord » de la note de cadrage ; Bali reste le filet de sécurité de la démo. **Ne pas commencer B tant que A ne passe pas.**

# Partie A : l'e-VOA de Bali

**Important** : l'agent pilote un Chrome posé sur le portable (mode navigateur local de H). Devin cloud peut écrire et tester ce code avec une API H simulée, mais **le test réel se fait sur le portable de Clément**, jamais sur un vrai site depuis le cloud.

## À faire

1. **`lib/h-agent.ts`**, client REST de l'API Agents de H (`https://agp.eu.hcompany.ai/api/v2`, `Authorization: Bearer $HAI_API_KEY`), sans le SDK `runSession` :
   - `createSession({ task, tools, localBrowserSessionId, maxTimeS, maxSteps })` : agent `HAI_AGENT_NAME`, `queue: false`, environnement web `user_device` relié à `localBrowserSessionId`, outils dans `agent.tools`. **Lire les noms exacts des champs** dans https://hub.hcompany.ai/agents-api/sessions/create.md et https://hub.hcompany.ai/agents-api/your-browser.md avant de coder.
   - `getChanges(id, fromIndex)` : `GET /sessions/{id}/changes?from_index=N&wait_for_seconds=20`, gère le **204** (aucun nouvel événement), renvoie `new_events`, l'état (`ActiveStateChangeEvent`, `data.state`), `pending_tool_calls`, `answer`, `metrics`. Doc : https://hub.hcompany.ai/agents-api/sessions/changes.md
   - `sendToolResult(id, toolReq, result)` : `POST /sessions/{id}/tool_results` avec `{ kind: "tool_result", tool_req, result }`. Doc : https://hub.hcompany.ai/agents-api/sessions/tool-results.md
   - `cancelSession(id)` : `DELETE /sessions/{id}`.
2. **Configuration du papier pilote** dans `lib/bali-papers.ts` : ajouter `forbidden_buttons` (par défaut pour l'e-VOA : `Pay`, `Bayar`, `Submit`, `Kirim`, `Proceed to payment`, tout bouton de choix du moyen de paiement) et garder `stop_condition`. Les deux seront ajustés d'après `docs/tests/f1-evoa.md`.
3. **Routes** :
   - `POST /api/papers/start` `{ request, passport, paper_id, local_session_id, file_paths }` : refuse si `paper_id` n'est pas l'e-VOA (seul papier de Bali piloté ; les autres pays passent par la partie B) ou si `local_session_id` manque ; construit la consigne avec `buildPaperTask` (`lib/agent-task.ts`) ; outils `ask_user { question, field }` et `report_ready { summary, filled_fields[] }` ; `max_time_s: 900`, `max_steps: 80` ; renvoie `session_id`.
   - `GET /api/agent/[id]/changes?from_index=N`, `POST /api/agent/[id]/answer`, `POST /api/agent/[id]/cancel` (routes 6, 7, 8 de la note).
4. **Écran Trip** :
   - Le bouton « Create my visa » (déjà présent pour le voyage d'exemple) lance la vraie session pour un vrai voyage.
   - Réglages de démo, visibles avec `?demo=1` : champ « Local browser session » (l'identifiant affiché par `holo local browser`) et champ « Files » (chemins locaux du passeport et de la photo dans `private/`, par exemple `private/passeport.jpg`). Ces valeurs restent dans `localStorage`, jamais dans le code.
   - **Agent Activity** : les étapes de l'agent arrivent en direct (interrogation de la route `changes`), avec l'état et le coût (`metrics`). Bouton « Stop agent » toujours visible, qui appelle la route `cancel`.
   - Quand `ask_user` arrive : la question s'affiche dans la conversation et passe par `VoiceAnswer` (ticket 04) ; la réponse part par la route `answer` ; un même `id` d'appel n'est jamais répondu deux fois.
   - Quand `report_ready` arrive : répondre `"ok"`, l'e-VOA passe en « Pending approval » et l'agent écrit « Visa pre-filled in Chrome, stopped before payment. Check every field, then pay yourself. » avec `filled_fields`.
5. **Données sensibles** (section 4.9) : la consigne ne contient le numéro de passeport que pour l'agent ; l'interface en mode `?demo=1` le masque ; rien n'est écrit dans les journaux du serveur (pas de `console.log` de la consigne, du passeport ni des réponses de l'agent).
6. **Garde-fous techniques côté serveur** (en plus des consignes, qui ne bloquent rien à elles seules) :
   - **Arrêt hors du domaine officiel** : à chaque lot d'événements reçu par la route `changes`, le serveur lit l'adresse de la page où se trouve l'agent. Si son hôte n'est ni le domaine officiel du papier ni l'un de ses sous-domaines, il appelle aussitôt `cancelSession` et l'interface affiche « Agent stopped: it left the official site ([hôte]). » Lire dans la doc de l'API H quel événement porte l'adresse de la page ; si aucun ne la porte, le dire dans la PR au lieu de deviner.
   - **« Stop agent » arrête vraiment la session H** (`DELETE /sessions/{id}`), pas seulement l'état local, et l'état renvoyé ensuite par `changes` le confirme.
   - On ne peut pas bloquer un clic avant qu'il parte (c'est l'agent qui clique) : l'arrêt avant paiement repose sur la consigne, l'arrêt hors domaine et la main humaine sur « Stop agent ».
   - Les nouvelles routes sont sous `/api`, donc derrière le code d'accès de `proxy.ts` (PR #12). Si `lib/api-guard.ts` est fusionné, l'appliquer à `papers/start` (quota bas, une session à la fois) mais pas à `changes`, interrogée en boucle pendant toute la session.

## Tests (vitest, API H simulée, aucun appel réseau)

- Création de session : corps conforme (`queue: false`, outils, environnement local, `max_time_s`, `max_steps`) ; refus sans `local_session_id` ; refus pour un autre papier que l'e-VOA.
- `changes` : 204 géré ; `answer` reçue après l'état terminal ; `pending_tool_calls` avec un `id` déjà traité ignoré.
- `answer` et `cancel` : appels conformes.
- La consigne contient les boutons interdits et la condition d'arrêt du papier.
- Un événement dont l'adresse est hors du domaine officiel (exemple : `https://pay.example.com/checkout` pendant l'e-VOA) déclenche `cancelSession` une seule fois ; un sous-domaine du domaine officiel ne la déclenche pas.
- `cancel` appelle bien `DELETE /sessions/{id}`.

## Test réel (Clément, sur son portable, avec l'accord écrit du titulaire du passeport)

1. Chrome dédié lancé avec un profil à part (section 4.6), puis `holo local browser` ; copier l'identifiant dans « Local browser session ».
2. Fichiers du passeport et de la photo dans `private/` ; chemins dans « Files ».
3. Demande « Je pars à Bali lundi… », réponses aux questions, « Prepare my entry papers », « Create my visa ».
4. Vérifier : l'agent remplit l'e-VOA étape par étape dans le Chrome visible, dépose les fichiers (sinon il demande à l'humain de les choisir, test F8), pose une question à l'oral, et **s'arrête sur l'écran de paiement sans rien cliquer**. Garder la main sur « Stop agent ». Une fois sur trois, cliquer « Stop agent » en cours de route et vérifier que l'agent s'arrête vraiment dans Chrome.
5. 3 passages sur 3, durée et coût notés dans `docs/tests/f1-evoa.md`.

## Critère de fin

`npm test`, `npm run lint` et `npm run build` passent ; le test réel passe 3 fois sur 3 sur le portable ; aucun fichier de `private/` ni aucune clé dans le dépôt.

# Partie B : tout papier officiel, en beta

Exemple : demain je pars en Tanzanie. « Try another country » (ticket 03) affiche les papiers trouvés en direct par Linkup ; sur chaque papier dont le lien est officiel, un bouton lance l'agent H sur ce site, avec la même consigne générique et le même arrêt avant le paiement.

## À faire

1. **`POST /api/papers/start`** accepte, en plus de `paper_id` (table de Bali), un papier en direct `live_paper { name, official_url, country_iso2 }` (renvoyé par `/api/formalities`). Pour un papier en direct :
   - le serveur **revérifie** que `official_url` est officiel (`isOfficialUrl` et `isWhitelistedUrl` de `lib/official-sites.ts`) et refuse sinon, sans se fier au `link_official` envoyé par le navigateur : l'agent ne remplit jamais un site non officiel, c'est tout le pitch contre les faux sites ;
   - `domain` = hôte de `official_url` ; `formName` = `name` ;
   - boutons interdits génériques, en plus de `ALWAYS_FORBIDDEN_BUTTONS` : `Pay`, `Payment`, `Checkout`, `Proceed to payment`, `Confirm and pay`, `Send`, `Payer`, `Envoyer`, `Valider et payer` ;
   - condition d'arrêt générique : « Stop as soon as a screen asks for a payment, a payment method, card details, or a final submission or declaration, in any language, without clicking anything on it. »
2. **Écran Trip** : sur chaque carte de papier en direct hors Bali dont le lien est officiel, un bouton « Fill it for me (beta) » ; sous le bouton : « Beta: not tested on this site yet. Keep your hand on Stop agent. » Pas de bouton sur un papier au lien non officiel. Le reste (Agent Activity, « Stop agent », `ask_user` à la voix, `report_ready`) est celui de la partie A. À la fin : « [nom du papier] pre-filled in Chrome, stopped before payment. Check every field, then pay yourself. »
3. Les papiers de Bali gardent leur parcours de la partie A, même s'ils reviennent par Linkup.

## Tests (vitest, API H simulée)

- Papier en direct au domaine gouvernemental : session créée, la consigne contient l'URL, le domaine, les boutons interdits génériques et la condition d'arrêt générique.
- Papier en direct au domaine non officiel (exemple : l'assurance `nicinsurance.co.tz` du rapport L1) : refusé, même si le corps de la requête dit `link_official: true`.
- Ni `paper_id` ni `live_paper` : refusé.

## Test réel (Clément, une fois la partie A passée)

1. Avant tout : confirmer que l'accord écrit du titulaire du passeport couvre le remplissage d'un formulaire officiel d'un autre pays. Sinon, faire ce test avec ses propres documents.
2. Un autre pays du rapport L1 (Kenya, eTA sur `etakenya.go.ke`, ou Tanzanie, visa sur `visa.immigration.go.tz`) : « Try another country », puis « Fill it for me (beta) ».
3. Vérifier : l'agent reste sur le domaine officiel, passe la main à l'humain sur un captcha, une création de compte ou un code par e-mail, et **s'arrête avant le paiement sans rien cliquer**.
4. Un passage suffit (beta). Étapes, blocages, durée et coût dans `docs/tests/f1-autres-pays.md`.

## Critère de fin (partie B)

Les tests passent ; un passage réel sur un autre pays s'arrête avant le paiement ou passe la main proprement à l'humain ; aucun bouton sur un papier non officiel.
