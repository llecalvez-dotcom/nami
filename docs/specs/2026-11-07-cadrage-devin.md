# Note de cadrage : agent de formalités de voyage (hackathon H Company x 42AI, 7 et 8 novembre 2026)

Destinataire : Devin, qui construit l'application. L'équipe (4 personnes) mène en parallèle les tests de faisabilité de la section 7.
Rendu : dimanche 8 novembre, 14 h. Démo : 1 min 30 de pitch puis 1 min 30 de démo.
Règle du hackathon (supposée, calquée sur l'édition de San Francisco) : tout est construit pendant l'événement, et toute brique open source est créditée dans le README.
Version 2 : corrigée après une relecture critique (samedi 7 novembre, midi).

## 1. Intention

Un Français dit à voix haute « je pars en Malaisie après-demain ». L'application :
1. comprend la demande (voix transcrite par Gladia) ;
2. trouve les formalités d'entrée à jour pour un passeport français, avec les sources officielles (Linkup) ;
3. fait payer un forfait transparent de 4,99 € (Stripe, mode test) ;
4. lance un agent H qui pré-remplit le formulaire du site officiel dans un Chrome visible à l'écran. Quand il lui manque une information, l'agent pose la question à voix haute, l'utilisateur répond, et l'agent reprend ;
5. s'arrête avant toute action d'envoi : captcha, bouton d'envoi ou paiement. L'utilisateur termine lui-même dans ce même Chrome.

Pitch : les faux sites administratifs facturent des démarches gratuites. Selon la DGCCRF, environ 1 million de victimes par an, pour 150 M€ facturés indûment (https://next.ink/brief-article/la-dgccrf-lance-lalerte-contre-les-faux-sites-administratifs/). Des sites copiés font payer jusqu'à 80 $ la carte d'arrivée malaisienne (MDAC), qui est gratuite. Notre agent ne va que sur le site officiel, affiche le vrai prix et coûte 4,99 €. Réponse prête si le jury demande « vous aussi, vous faites payer une démarche gratuite » : on paie le pré-remplissage, la vérification de l'adresse officielle et la checklist sourcée, jamais la démarche ; le prix est affiché avant, et le lien officiel gratuit est donné dans tous les cas.

Modèle : Veeza (https://www.veeza.ai/en, Y Combinator 2026), agent de visa pour les passeports égyptiens. Notre différence : un public français, l'arrivée directe sur le site officiel, la voix pendant que l'agent travaille.

## 2. Périmètre

Inclus :
- Voyageur : passeport français uniquement.
- Pays rodés (agent autorisé) : **Malaisie (MDAC)**, et un second formulaire court d'une seule page, sans compte et sans téléversement. Le candidat est la **Thaïlande (TDAC)**, retenu seulement s'il passe le test F2. Un pays n'est rodé que si sa condition d'arrêt (section 4.6) est écrite et testée.
- Mode générique pour tout autre pays : liste des formalités et lien officiel vérifié, **sans agent**.
- Cas « rien à faire » : Espagne, où un passeport français suffit.
- Profil voyageur fictif, pré-rempli et modifiable, stocké dans `localStorage` (« coffre voyageur »).
- Fenêtre d'ouverture par pays. La MDAC et la TDAC ne s'ouvrent que dans les 3 jours avant l'arrivée, jour de saisie compris. Si le voyage est plus lointain, l'app affiche « à remplir à partir du <date> » et ne lance pas l'agent.

Exclus :
- Envoi, captcha et paiement sur un site officiel : jamais, ni par l'agent ni par l'application.
- Création de compte et téléversement de documents sur un site officiel. L'e-Visa éthiopien est retiré pour cette raison : il exige un compte et une photo.
- Données réelles d'une personne : persona fictive uniquement.
- Prise de rendez-vous en centre de visa, base de données, comptes utilisateurs, téléphonie, lecture automatique du passeport.

## 3. Chaîne du mécanisme, et capacité de chaque maillon

| # | Maillon | Capacité | Statut |
|---|---|---|---|
| 1 | Micro du navigateur → Gladia en temps réel → texte | Les noms de pays, de villes et les dates passent. Les numéros, adresses et codes de vol ne se dictent pas : ils viennent du profil. La salle sera bruyante : champ texte de secours, et chaque réponse est validée par un clic. | Test F5 |
| 2 | Texte → intention (pays, dates, motif) | Modèle de H (Models API, même partenaire) ; repli Claude Haiku. | Test F0 |
| 3 | Intention → formalités, URL officielle et sources (Linkup) | Linkup peut renvoyer des sites copiés. Contrôle de domaine sur l'URL **et** sur chaque source ; URL fixées en dur pour les pays rodés. | Tranché par conception |
| 4 | Profil, voyage et URL → agent H qui pré-remplit | Site MDAC observé par la relecture : une seule page, qui se termine par un captcha à glissière « Drag To Verify » puis l'envoi. Condition d'arrêt écrite pour chaque pays. | Tests F1, F2 |
| 5 | Agent bloqué → question vocale → réponse → reprise | Mécanisme documenté (outil personnalisé, `awaiting_tool_results`). Jamais essayé par nous. | Test F3 |
| 6 | Formulaire pré-rempli → l'utilisateur termine | Le navigateur cloud de H ne prévoit pas de prise de main humaine. Il faut le **mode navigateur local** de H, où l'agent pilote un Chrome du portable. | Test F6 |
| 7 | Jury : 1 min 30 de démo | Durée de remplissage inconnue. Déroulé seconde par seconde en section 9. | Test F1 (durée) |

## 4. Architecture (pour Devin)

### 4.1 Stack
- Une seule app **Next.js (App Router) en TypeScript**, Tailwind, zod. Pas de base de données.
- Serveur sans état : chaque route API est un appel court.
- **Démo sur le portable**, en `next start`. Le mode navigateur local de H l'impose (section 4.5).
- Clés côté serveur uniquement, dans `.env.local` (dans `.gitignore` dès le premier commit), jamais de préfixe `NEXT_PUBLIC_` : `HAI_API_KEY`, `GLADIA_API_KEY`, `LINKUP_API_KEY`, `STRIPE_SECRET_KEY`. Plus `HAI_AGENT_NAME` (configurable, validé au test F1) et `HAI_LOCAL_BROWSER_SESSION_ID` (section 4.5). Fournir `.env.example` avec les noms, sans les valeurs.

### 4.2 Écran
Le portable affiche côte à côte notre app (à gauche) et le Chrome piloté par l'agent (à droite, une fenêtre séparée lancée à part).
Notre app contient la conversation (bouton micro, transcription en direct, champ texte de secours), la liste des formalités avec les sources et la mention « officiel » ou « non officiel » sur chacune, le paiement, le statut de l'agent, le fil de ses étapes et un bouton « Arrêter l'agent » toujours visible. Interface en français.

### 4.3 Routes API

1. `POST /api/voice/session` : appelle `POST https://api.gladia.io/v2/live` (en-tête `x-gladia-key`) avec `model: "solaria-1"`, `encoding: "wav/pcm"`, `bit_depth: 16`, `channels: 1`, `sample_rate: 16000`, `language_config: { languages: ["fr", "en"], code_switching: true }`, `messages_config: { receive_partial_transcripts: true }`. Renvoie l'`url` WebSocket ; le navigateur s'y connecte lui-même et la clé ne quitte pas le serveur.
   Navigateur : `getUserMedia`, puis AudioWorklet. L'`AudioContext` tourne en général à 48 kHz : **rééchantillonner à 16 kHz** en PCM 16 bits avant l'envoi binaire (sinon déclarer le vrai `sample_rate`). Messages reçus : `type === "transcript"`, texte dans `data.utterance.text`. Un partiel est remplacé par le message suivant de même `data.id`, et `data.is_final` marque la version définitive. Arrêt par `{"type":"stop_recording"}`.
   Doc : https://docs.gladia.io/chapters/live-stt/getting-started

2. `POST /api/intent` `{ transcript, today }` → `{ country_iso2, country_name, arrival_date, departure_date, purpose }`, validé par zod. Modèle : Models API de H (compatible OpenAI, `https://api.hcompany.ai/v1/chat/completions`, doc https://hub.hcompany.ai/models-api/chat-completions.md, nom du modèle donné par https://hub.hcompany.ai/models-api/list-models.md). Si F0 échoue, Claude Haiku avec une clé `ANTHROPIC_API_KEY`. Les dates relatives (« après-demain ») sont résolues à partir de `today`. S'il manque une date, l'interface la demande.

3. `POST /api/requirements` `{ country_iso2, arrival_date, purpose }` → `POST https://api.linkup.so/v1/search` (`Authorization: Bearer`), avec `depth: "standard"`, `outputType: "structured"`, `includeSources: true`. Attention : `structuredOutputSchema` est un **schéma JSON passé en chaîne de caractères** (`JSON.stringify`), et la réponse a la forme `{ data, sources }`. Schéma de `data` : `formalities[]` contenant `name`, `required` (booléen), `official_url`, `official_cost`, `opens_days_before_arrival` (nombre ou null), `documents[]`. Question : « Formalités d'entrée pour un ressortissant français voyageant en <pays> pour <motif> à partir du <date> : visa, e-Visa, autorisation électronique, carte d'arrivée en ligne. Donner l'URL du site gouvernemental officiel. » Pour les pays rodés, ajouter `includeDomains` avec leurs domaines officiels.
   Doc : https://docs.linkup.so/pages/documentation/api-reference/endpoint/post-search

   **Contrôle du domaine** (`lib/official-sites.ts`, testé unitairement) :
   - extraire `new URL(u).hostname` et comparer ses **étiquettes de fin** à une liste de suffixes gouvernementaux (`gov`, `gov.xx`, `gouv.fr`, `go.xx`, `gob.xx`, `govt.xx`, `gc.ca`…), plus une liste blanche d'exceptions connues (`canada.ca`…). Jamais de recherche de sous-chaîne sur l'URL entière (`gov.example.com` et `example.com/gov` doivent être refusés) ;
   - le contrôle s'applique à `official_url` **et à chaque source**. Une source refusée est marquée « source non officielle » et n'est pas cliquable ;
   - pays rodés : URL officielle en dur, jamais celle de Linkup. Malaisie : `https://imigresen-online.imi.gov.my/mdac/main?registerMain` ; Thaïlande : URL relevée au test F2.

4. `POST /api/checkout` `{ trip, formality }` → Stripe Checkout, mode `payment`, 4,99 EUR, `metadata` avec le pays, `success_url` = `<app>/?checkout_session_id={CHECKOUT_SESSION_ID}`. **Avant la redirection**, le navigateur range le voyage, l'intention et les formalités dans `sessionStorage`, et les restaure au retour. Mode test seulement, carte 4242 4242 4242 4242.

5. `POST /api/agent/start` `{ checkout_session_id, profile, trip, country_iso2 }` → relit d'abord la session Stripe côté serveur (`payment_status === "paid"` et pays identique dans `metadata`). Sinon : 402. Vérifie ensuite que le pays est rodé et que la date du jour est dans la fenêtre d'ouverture. Puis crée une session H par l'API REST : `POST https://agp.eu.hcompany.ai/api/v2/sessions`, `Authorization: Bearer $HAI_API_KEY`, avec :
   - l'agent `HAI_AGENT_NAME` ;
   - l'environnement web branché sur le navigateur local (section 4.5) ;
   - les outils personnalisés dans `agent.tools` : `ask_user` `{ question: string, field: string }` et `report_ready` `{ summary: string, filled_fields: string[] }` ;
   - `max_time_s: 900` et un `max_steps` (valeur proposée : 80, ajustée après F1).
   Le statut de création peut être `queued` (offre gratuite limitée à 3 sessions simultanées par organisation) : l'afficher, ne pas le traiter comme une erreur. Limite acceptée : sans base de données, un même paiement peut relancer l'agent.
   Doc : https://hub.hcompany.ai/agents-api/sessions/create.md ; outils https://hub.hcompany.ai/agents-api/custom-tools.md ; agents disponibles https://hub.hcompany.ai/agents-api/agents/list.md

6. `GET /api/agent/[id]/changes?from_index=N` → relais vers `GET /sessions/{id}/changes?from_index=N&wait_for_seconds=20` (25 au maximum). Gérer le **204 No Content** (rien de nouveau : renvoyer `{ new_events: [] }` sans appeler `res.json()`). Champs utiles : `new_events`, l'état (`ActiveStateChangeEvent`, `data.state`), `pending_tool_calls` (`{ tool_name, args, id }`). États à afficher : `queued`, `running`, `awaiting_tool_results`, `paused`, `idle`, et les états terminaux (`completed`, `failed`, `timed_out`, `interrupted`).
   Doc : https://hub.hcompany.ai/agents-api/sessions/changes.md

7. `POST /api/agent/[id]/answer` `{ tool_req, result }` → `POST /sessions/{id}/tool_results` avec `{ kind: "tool_result", tool_req, result }`. Les `id` d'appels déjà traités sont gardés côté client, pour ne jamais répondre deux fois (un appel traité peut rester listé).
   Doc : https://hub.hcompany.ai/agents-api/sessions/tool-results.md

8. `POST /api/agent/[id]/cancel` → `DELETE /sessions/{id}`.

Ne pas utiliser `runSession` du SDK avec une fonction `fn` : elle devrait attendre une réponse humaine pendant des minutes. Tout passe par l'API REST avec `fetch`, et en cas de doute sur un nom de champ, on lit la doc citée au lieu de l'inventer.

### 4.4 Boucle vocale pendant l'agent
Quand `pending_tool_calls` contient `ask_user` :
1. afficher la question et la lire avec `speechSynthesis` (voix `fr-FR`) ;
2. ouvrir le micro **seulement dans `utterance.onend`**, pour que Gladia ne transcrive pas la voix de l'app ;
3. le texte final s'affiche dans un champ modifiable et part **au clic sur « Valider »**, jamais automatiquement ;
4. le champ texte de secours reste toujours visible.

Quand `report_ready` arrive :
- l'app répond aussitôt `"ok"` (route 7) pour que la session se termine proprement ;
- elle affiche : « Formulaire pré-rempli dans la fenêtre Chrome. Vérifiez chaque champ, faites vous-même la vérification (captcha) et cliquez vous-même sur Envoyer » ;
- elle affiche aussi `summary` et `filled_fields`.
En mode navigateur local, le Chrome reste ouvert à la fin de la session (doc H) : l'utilisateur y termine.

### 4.5 Navigateur : local d'abord, cloud en repli
- **Voie retenue (si le test F6 passe)** : le mode navigateur local de H. Sur le portable de démo, un Chrome dédié est lancé avec un profil à part (jamais le profil personnel : l'agent peut lire cookies et stockage) :
  `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-for-agents"`
  Puis `holo local browser` (CLI `hai-agents[cli,browser]`) tourne dans un terminal et affiche un `session_id`, que l'on met dans `HAI_LOCAL_BROWSER_SESSION_ID`. La route 5 le passe dans `agent.environments[kind=web].session_id`. Le nom exact du champ dans le corps JSON est à relever dans la doc (https://hub.hcompany.ai/agents-api/your-browser.md et sessions/create).
  Ce que ça règle : l'utilisateur voit le formulaire et termine lui-même (captcha et envoi compris), sans iframe ni lien de partage.
- **Repli (si F6 échoue)** : le navigateur cloud. On affiche la vue de l'agent par le lien de partage public (https://hub.hcompany.ai/agents-api/sessions/share.md, à appeler au démarrage, et à tester en iframe). On ne répond pas à `report_ready` tant que l'utilisateur n'a pas cliqué « Terminer », qui appelle la route 8. Dans le pitch, on dit honnêtement que le produit final basculera le formulaire dans le navigateur de l'utilisateur.

### 4.6 Consigne donnée à l'agent (gabarit dans `lib/agent-task.ts`, une condition d'arrêt par pays dans `lib/official-sites.ts`)
« Va sur <official_url>. Pré-remplis le formulaire <nom> pour le voyageur décrit ci-dessous. Règles absolues : ne touche jamais à un captcha ni à un élément de vérification (glissière, case "je ne suis pas un robot") ; ne clique jamais sur un bouton qui envoie, valide ou paie ; ne quitte jamais le domaine <domaine> ; n'invente aucune information. Si une information te manque, appelle `ask_user` avec une question courte en français. <condition d'arrêt du pays>. Voyageur : <profil JSON>. Voyage : <voyage JSON>. »
Condition d'arrêt MDAC : « Remplis les champs jusqu'à City/Postcode inclus, puis appelle `report_ready` et arrête-toi. Ne touche jamais l'élément "Drag To Verify" ni aucun bouton situé en dessous. »
Condition d'arrêt TDAC : écrite après le test F2.

### 4.7 Profil fictif par défaut (`lib/persona.ts`)
Persona inventée, sans rapport avec une vraie personne : nom, prénoms, date et lieu de naissance, nationalité FR, numéro de passeport au format français (2 chiffres, 2 lettres, 5 chiffres), dates de délivrance et d'expiration, adresse en France, e-mail de démo de l'équipe, téléphone fictif, **adresse d'hébergement en Malaisie (alphanumérique, sans accents), code postal, État, numéro de vol**.
Volontairement absents, pour que l'agent ait des questions à poser à l'oral : **la date de départ de Malaisie et le mode de transport** (avion, terre, mer). Ce sont des réponses qui supportent la voix.

## 5. Registre des faits

| Fait | Statut | Source ou voie de vérification |
|---|---|---|
| H : outils personnalisés, `awaiting_tool_results`, `POST /tool_results`, `changes` qui renvoie `new_events` ou 204, `wait_for_seconds` ≤ 25 | OBSERVÉ | Doc H, lue le 07/11 |
| H : `max_time_s` borne l'attente d'un outil ; un appel non résolu en fin de tour échoue | OBSERVÉ | Doc custom-tools |
| H : au-delà de 3 sessions, la création renvoie `queued` | OBSERVÉ (relecture) | Doc plans-and-limits |
| H : `h/web-surfer-pro` existe | SUPPOSÉ (seul `h/web-surfer-flash` est nommé dans la doc) | `agents/list` au test F1 |
| H : mode navigateur local par CDP, documenté en Python et en CLI, pas en TypeScript ; outils personnalisés dans ce mode non documentés | OBSERVÉ | Doc your-browser |
| H : Models API compatible OpenAI ; même clé que l'Agents API | OBSERVÉ (existence) ; clé : SUPPOSÉ | Test F0 |
| H : aucune gestion des captchas | OBSERVÉ | Doc H |
| H gratuit : 60 M de tokens par mois et 3 sessions simultanées **par organisation** | DIT (page tarifs) | Console H |
| Gladia : WebSocket temps réel, jeton sans clé côté navigateur, `solaria-1` | OBSERVÉ | Doc Gladia |
| Gladia : 100+ langues, latence < 300 ms | DIT (Gladia) | Test F5 |
| Linkup : `structuredOutputSchema` en chaîne, réponse `{ data, sources }` | OBSERVÉ (relecture) | Doc Linkup |
| MDAC : une seule page, captcha à glissière « Drag To Verify », puis envoi | OBSERVÉ (relecture, formulaire officiel) | Test F1 |
| MDAC : voyage dans les 3 jours, jour de saisie compris ; gratuite | OBSERVÉ (texte du formulaire) et DIT (guide Exodus 06/2026) | Test F1 |
| TDAC : formulaire court, fenêtre de 3 jours, sans compte | SUPPOSÉ | Test F2 |
| Espagne : rien à faire pour un passeport français | SUPPOSÉ (UE) | Réponse Linkup relue |
| Prix sponsors Gladia et Devin, règle « tout construire sur place » | DIT (organisateurs, édition de San Francisco) | Discord |

## 6. Ordres de grandeur

- **Temps** : de samedi 10 h 30 à dimanche 14 h, soit 27,5 h.
- **Heures limites** : verdict F0, F1, F3 et F6 avant **samedi 15 h**. Sinon on bascule sur le repli prévu. Verdict F2 avant 17 h. Vidéo de secours enregistrée **samedi 22 h quel que soit l'état**. Gel du code **dimanche 11 h**, puis répétitions seulement.
- **Démo** : 90 s. Si le pré-remplissage MDAC dure plus de 2 min (mesuré en F1), on le lance pendant le pitch (section 9).
- **Tokens H** : relever les tokens de la première session F1 (`GET /sessions/{id}/status`), puis calculer combien de sessions tiennent dans les 60 M. Créer un **compte H « démo »** séparé, que personne n'utilise le dimanche, pour ne pas finir en file d'attente pendant le passage.
- **Coût par voyageur** : 1 appel Linkup, 1 appel au modèle, 1 à 3 min de Gladia, 1 session H. Le chiffre de tokens H relevé en F1 va dans le pitch, en face des 4,99 €.
- **Règle triviale** : un tableau en dur de 10 pays fait aussi bien que Linkup sur les pays rodés. Pour montrer ce que Linkup apporte, faire la mesure F7 si le temps le permet. Sinon, ne pas annoncer de taux de justesse dans le pitch.
- **Preuve de fiabilité** : un passage réussi prouve un cas. Il faut 3 réussites sur 3 essais par pays rodé avant la démo, et chaque échec est noté avec sa cause.

## 7. Tests de faisabilité (l'équipe, tout de suite)

| Test | Quoi | Go | No-go et repli |
|---|---|---|---|
| F0 | Un appel `chat/completions` de la Models API de H avec `HAI_API_KEY` sur « je pars en Malaisie après-demain » | JSON d'intention correct | Claude Haiku |
| F1 | Agent H sur la MDAC avec la persona, la consigne 4.6 et une arrivée dans 2 jours ; d'abord `GET agents/list` pour le nom de l'agent | Champs remplis jusqu'à City/Postcode, **captcha jamais touché**, 3 fois sur 3 ; durée et tokens notés | Changer de pays rodé ; en dernier recours, clone local annoncé comme tel |
| F2 | Même chose sur la TDAC (relever l'URL, la présence d'un captcha et la condition d'arrêt) | 3 fois sur 3, sans compte ni téléversement | Un seul pays rodé |
| F3 | Session avec `ask_user`, réponse envoyée à la main par `POST /tool_results` | L'agent reprend et remplit le champ, 3 fois sur 3 | `sendMessage` (message utilisateur) au lieu d'un outil |
| F6 | Mode navigateur local : Chrome dédié, `holo local browser`, session créée **par l'API REST** sur ce navigateur, avec `ask_user` | L'agent remplit dans le Chrome du portable, l'outil fonctionne, et le formulaire reste modifiable à la main après la fin de la session | Repli cloud (section 4.5) |
| F5 | Gladia dans la salle : 10 réponses typiques (dates, ville, mode de transport) | 8 sur 10 justes sans correction | Champ texte mis en avant |
| F7 (optionnel) | Linkup sur 10 pays non rodés, comparé aux fiches de France Diplomatie (`required` et domaine officiel) et à la règle « UE : rien ; sinon visa » | Linkup fait mieux que la règle | Pas de chiffre dans le pitch |

Installer `hai-agents[cli,browser]` sur le portable de démo : à faire par l'équipe, dans un environnement Python isolé.

## 8. Tests d'acceptation

Devin valide les tests 1 à 4 et 8. Un coéquipier nommé valide les tests 5 à 7, qui demandent un micro et une vraie session H.

1. « Je pars en Malaisie après-demain pour des vacances » : intention correcte, MDAC listée avec son lien officiel, « gratuit », « s'ouvre 3 jours avant l'arrivée », sources marquées « officiel » ou « non officiel ».
2. « Je vais à Barcelone en mars » : « Aucune formalité pour un passeport français », aucun lancement possible.
3. Tests unitaires de `lib/official-sites.ts` et de la route 3 sur des **réponses Linkup simulées** (fixtures) : URL gouvernementale acceptée ; `gov.example.com`, `example.com/gov` et un site copié refusés ; une source non officielle marquée et non cliquable ; un pays non rodé jamais lancé.
4. Paiement : `start` sans `checkout_session_id` payé renvoie 402 ; carte 4242, retour sur l'app avec l'état restauré, puis lancement autorisé.
5. Malaisie, arrivée dans 2 jours : l'agent pré-remplit dans le Chrome visible, pose au moins une question à voix haute, la réponse est validée au clic, l'agent reprend et s'arrête avec `report_ready`. Le captcha n'est pas touché, rien n'est envoyé. 3 fois sur 3.
6. Malaisie, arrivée dans 3 semaines : « à remplir à partir du <date> », aucun lancement.
7. Micro coupé : tout le parcours marche au clavier.
8. Aucune clé dans le code livré au navigateur : rechercher les **valeurs réelles** des clés dans `.next/static`. Aucun `.env*` commité sauf `.env.example`.

## 9. Démo : déroulé (à répéter dimanche matin)

- Avant le passage : app ouverte, Chrome dédié ouvert, `holo local browser` lancé, compte H « démo » en place, persona chargée.
- 0:00 à 1:30, pitch : la douleur (1 million de victimes, la MDAC à 80 $ chez les faux sites). À 0:20, le démonstrateur dit à voix haute « je pars en Malaisie après-demain » : la transcription Gladia s'affiche, puis la checklist Linkup avec ses sources « officielles ». Paiement 4242 en 10 s, et l'agent démarre pendant que l'orateur continue.
- 1:30 à 3:00, démo : le Chrome se remplit en direct. L'agent demande « Quelle est votre date de départ de Malaisie ? », réponse à voix haute, clic sur Valider, l'agent reprend. Arrêt sur `report_ready` : « Vous vérifiez, vous faites le captcha, vous envoyez. »
- Si l'agent est plus lent que prévu : la vidéo de secours prend le relais à l'endroit où il en est.

## 10. Retour arrière et exploitation

- Chaque test en échec a son repli (section 7). En dernier recours, clone local du formulaire, présenté comme tel : on ne montre jamais un faux site comme s'il était le vrai.
- Démo sur le portable, connexion de secours par partage de connexion du téléphone.
- README : architecture, partenaires et rôle de chacun, crédits open source, commandes de lancement (app, Chrome dédié, `holo local browser`).

## 11. Questions ouvertes (aucune ne bloque le build)

- Q1 : critères des prix Devin et Gladia, à demander sur Discord.
- Q2 : nom du produit.
