# Ticket 18 : module Vol, l'agent H trouve et ouvre le vol sur Google Flights

Responsable humain : **Clément** (lance Devin, relit la PR, fait les passages réels sur le Chrome de l'agent). **Nathan** livre le parcours jusqu'à la question « Tu veux que je te cherche un vol ? » et relit les textes dits par Nami.
Branche : `feat/18-module-vol` depuis `main`. Une PR pour le code, cette fiche d'abord.

Lis d'abord `docs/tests/g0-linkup-vols.md` (pourquoi pas Linkup), `docs/specs/2026-11-07-cadrage-devin.md` (section 4.5 et route 9 : le module Vol tel qu'il était prévu), `docs/tickets/17-suite-agent-evoa.md` et `docs/tests/f1-evoa.md` (ce que l'agent sait faire aujourd'hui), `lib/trip-state.ts` (`decideProposal`, cas `flights`), `lib/paper-agent.ts`, `lib/agent-task.ts` (`buildFlightsTask` existe déjà, jamais branché), `lib/local-chrome.ts` (`guardedExpression`), `app/api/papers/start/route.ts`, `components/panel/panel-screen.tsx`.

## Pourquoi

Le cockpit prévoit depuis le début une deuxième action H après les papiers : « Tu veux que je cherche ton vol ? » (module Vol, P1, test G1). Aujourd'hui, quand l'utilisateur répond oui, Nami dit « Flight search is not wired yet; your choice is saved » (`lib/trip-state.ts`, cas `flights`). Rien d'autre n'existe : `buildFlightsTask` dans `lib/agent-task.ts` est un brouillon de consigne, pas une route.

C'est la fin de la démo : après le visa (borne de l'étape 1) et la carte d'arrivée, l'agent enchaîne sur un deuxième site, avec les vrais prix du jour, sous les yeux du jury. Ça montre que Nami n'est pas « un remplisseur de visa » mais un agent de voyage, et ça fait la transition vers la tagline.

### Pourquoi pas Linkup

L'idée de départ était : Linkup cherche les vols sur les comparateurs, Nami classe, l'agent ouvre la page. Testé le 7 novembre à 23 h 40 avec la vraie clé (`docs/tests/g0-linkup-vols.md`) : Linkup ne voit que les pages d'accroche des comparateurs (« à partir de 646 € »), jamais une liste de vols ; il renvoie 1 vol sans durée ni escales en `standard`, 0 vol en `deep`, et dit lui-même que les données ne sont pas en direct. Présenter ça comme « trouvé sur Skyscanner » casserait la règle « aucun résultat inventé ». Donc : tout en computer use, Linkup ne sert pas aux vols.

## Le parcours, de bout en bout (ce que voit et entend l'utilisateur)

Point de départ : la carte d'arrivée vient d'être remplie (ou l'utilisateur a refusé la carte d'arrivée), Nami propose « Do you also want me to help you find your flights? » (`FLIGHTS_AFTER_VISA`). L'utilisateur dit **oui**. C'est ici que ce ticket commence.

1. **Les dates.** Nami connaît déjà la date de départ (`request.departure_date`, toujours demandée) et souvent la date de retour (`request.return_date`, déduite de « je reste dix jours », sinon `null`).
   - Les deux connues : « Tu pars de Paris le lundi 23 novembre et tu reviens le jeudi 3 décembre. Je cherche avec ces dates ? » Oui : on passe au point 2. Non : « Donne-moi tes dates de départ et de retour. »
   - Retour inconnu : « Tu pars le lundi 23 novembre. Quand veux-tu revenir ? » Réponse à la voix (« le 3 décembre », « dix jours plus tard ») ou au clavier ; comprise par le modèle de `/api/trip/parse` (il sait déjà déduire `return_date` d'une durée ou d'une date). Deux échecs de compréhension : Nami propose trois dates au clic (7, 10 et 14 jours après le départ).
   - Aéroport de départ : Paris (code `PAR`, couvre CDG et Orly) pour la V1 (`origin_country === "FR"`). Pas de question. Si l'utilisateur dit une autre ville dans sa réponse, on la garde (Lyon, Marseille, Nice : codes connus dans une petite table ; sinon Paris et Nami le dit).
2. **Nami annonce et l'agent ouvre Google Flights.** « Je cherche tes vols sur Google Flights, regarde à gauche. » L'agent H démarre dans le Chrome de l'agent (même pont `holo local browser`, même densité 1, même souris violette) directement sur une page de résultats pré-remplie : aller-retour Paris vers Denpasar (DPS), dates posées, 1 adulte, économique, prix en euros. Le jury voit la vraie page du jour avec les vrais prix.
3. **Les résultats sont lus.** Une fois la liste affichée (après le consentement aux cookies, « Tout refuser »), Nami récupère les vols affichés : compagnie, prix, nombre d'escales, durée totale, heures de départ et d'arrivée. Chaque vol gardé est vérifié contre le texte réel de la page (voir « Lecture des résultats ») : rien n'est inventé.
4. **Le critère, à la voix ou au clic.** La vague passe en écoute et Nami demande : « J'ai 8 vols. Tu préfères le moins cher, le plus rapide, ou sans escale ? » Quatre choix affichés en gros boutons et compris à la voix : **Le moins cher**, **Le plus rapide**, **Sans escale si possible**, **Le meilleur compromis**. L'utilisateur clique ou parle (« le moins cher », « le plus rapide », « je veux pas d'escale », « le mieux »).
5. **Nami propose 2 ou 3 vols** classés selon le critère, à voix haute et à l'écran : « Le moins cher : Scoot, 646 €, 1 escale à Singapour, 22 h. Juste derrière : Qatar Airways, 790 €, 1 escale à Doha, 18 h 30. Lequel je t'ouvre ? » L'utilisateur choisit à la voix (« le premier », « Qatar », « le moins cher ») ou au clic.
6. **L'agent ouvre le vol choisi.** Dans l'onglet de gauche, la souris violette clique sur le vol aller, puis choisit le vol retour correspondant (même compagnie ou même prix total), et arrive sur la page des options de réservation de Google Flights (« Réserver avec Qatar Airways », « Expedia », etc.). L'agent s'arrête là et appelle `report_ready`. **Il ne clique jamais sur « Continuer », « Réserver », « Book », « Continue to booking », ni sur le site d'une compagnie ou d'une agence.**
7. **Le moment final.** Grande coche dans la couleur du module Vol : « Ton vol est trouvé : Qatar Airways, 790 €, aller le 23 novembre, retour le 3 décembre. Réserve-le quand tu veux, je ne paie jamais. » La page de réservation reste ouverte à gauche. Puis : « Les hôtels, c'est pour bientôt. » Fin de la démo, tagline.

Durée visée du passage de l'agent : moins de 3 minutes (page pré-remplie : il n'a pas de formulaire à remplir, seulement le consentement, la lecture, deux clics).

## Ce qu'il faut construire

### 1. L'état du voyage (`lib/trip-state.ts`, `lib/contracts.ts`)

- Remplacer le cas `flights` de `decideProposal` : accepté, Nami pousse la question des dates (point 1) au lieu du texte « not wired yet ». Refusé : inchangé (« Okay, no flight search for now. »).
- Nouveaux items de conversation : `question` avec `field: "return_date"` (réponse à la voix ou au clic, `options` = 3 dates quand on en arrive là) ; `question` avec `field: "flight_criterion"` (4 options) ; `question` avec `field: "flight_choice"` (2 ou 3 options, une par vol). Tous suivent le mécanisme existant (`answerQuestion`, `answerQuestionWithText`, `matchOption`, `shortAnswer`), donc la voix marche sans rien ajouter côté micro.
- `AgentRun.kind: "flights"` existe déjà dans le contrat ; ajouter `flights?: { options: FlightOption[]; chosen?: number; criterion?: FlightCriterion }` dans `AgentRun.result`.
- Contrat zod `FlightOptionSchema` : `{ airline, price, currency, stops, duration_min, depart_at, arrive_at, layovers: [{ airport, duration_min }], index }` (index = position dans la liste affichée, pour que l'agent sache sur quoi cliquer). `FlightCriterionSchema = z.enum(["cheapest", "fastest", "fewest_stops", "best"])`.
- `agent_steps` pour la carte de l'agent : « Opened Google Flights for 23 Nov to 3 Dec », « Read 8 flights », « You chose the cheapest », « Opened Scoot, 646 € », « Stopped on the booking page, nothing clicked ».
- Fin : `report_ready` sur une session `flights` pousse le message final (point 7) et met le module `hotel` en « soon », pas de nouvelle proposition.

### 2. Le classement (`lib/flights/rank.ts`, pur, testé)

- `rankFlights(options, criterion)` renvoie les 3 meilleurs :
  - `cheapest` : prix croissant, puis durée ;
  - `fastest` : durée croissante, puis prix ;
  - `fewest_stops` : escales croissantes, puis prix ; si aucun direct, Nami le dit (« Aucun vol direct ces jours-là, voici les vols à une escale ») ;
  - `best` : score = 0,5 × prix normalisé + 0,3 × durée normalisée + 0,2 × escales normalisées (plus petit = mieux). Sans magie : les trois poids dans une constante commentée.
- `describeFlight(option, lang)` : la phrase dite par Nami (« Scoot, 646 €, 1 escale à Singapour, 22 h 05 »), traduite comme le reste par `requestTranslations`.

### 3. La session H (`lib/flights-agent.ts`, `app/api/flights/start/route.ts`)

Même squelette que `app/api/papers/start/route.ts` : `guard`, `readJsonLimited`, `NAMI_LOCAL_SESSION_ID`, `preflightBrowser`, `getAvailableSessionSlots`, `createSession`, puis suivi par les routes existantes `/api/agent/[id]/changes`, `/answer`, `/cancel`, `/screen`.

- Corps : `{ request: TripRequest, origin_airport: "PAR", destination_airport: "DPS", depart_date, return_date, local_session_id?, idempotency_key? }`. `return_date` obligatoire ici (aller-retour).
- **`start_url`** : la page de résultats Google Flights pré-remplie. Forme à vérifier au premier passage réel (relevée dans `docs/tests/g1-vols.md`) : `https://www.google.com/travel/flights?q=Flights%20from%20PAR%20to%20DPS%20on%202026-11-23%20through%202026-12-03&hl=fr&curr=EUR`. Si le paramètre `q` ne pré-remplit pas tout, repli : l'agent remplit les champs lui-même avec `fill_field` (consigne de repli dans la tâche), ou on construit l'URL `tfs=` encodée relevée à la main.
- **Tâche de l'agent** (reprend et remplace `buildFlightsTask`) : « You are on Google Flights results for a round trip from Paris to Denpasar (DPS), leaving 2026-11-23, back 2026-12-03, 1 adult, economy. If a cookie consent page appears, click Tout refuser or Reject all. Check that the dates, airports and round trip are right; fix them with the page controls if not. When the list of flights is visible, call `report_flights` with every flight you can read: airline, total price as displayed, number of stops, total duration, departure and arrival times, layover airports. Then wait: the tool result tells you which flight the traveller chose. Click that outbound flight, then the matching return flight (same airline or same total price), until the booking options page. Stop there and call `report_ready`. »
- **Consignes** (variante de `buildPaperInstructions`) : jamais « Continuer », « Réserver », « Book », « Continue », « Select » sur une option de réservation, « Sign in », « Se connecter » ; jamais quitter `google.com` ; jamais saisir de donnée personnelle (aucun passeport dans la tâche : la session Vol ne reçoit ni nom ni numéro) ; captcha ou « trafic inhabituel » : `ask_user` ; `UNTRUSTED_CONTENT_RULE`.
- **Outils** : `ask_user`, `report_ready`, `pick_option`, `fill_field` (existants, garde de domaine sur `google.com`), plus **`report_flights`** (nouveau, voir ci-dessous).
- `bindSessionPaper` devient `bindSessionKind` : la garde de domaine de `pick_option`/`fill_field` suit la session (`evoa`, `arrival_card` ou `flights` → `["www.google.com", "consent.google.com"]`).
- Budget : `FLIGHTS_MAX_STEPS = 60`, `FLIGHTS_MAX_TIME_S = 600`.

### 4. Lecture des résultats, sans rien inventer (`lib/flights/read.ts`, `app/api/agent/[id]/flights/route.ts`)

L'outil `report_flights { flights: FlightOption[] }` est appelé par l'agent quand la liste est à l'écran. Côté Nami :

1. Validation zod (prix nombre, devise, escales entier, durée en minutes).
2. **Vérification contre la page** : par CDP (même `guardedExpression` que `pick_option`, domaine `google.com`), Nami lit le texte de la liste des résultats (`document.body.innerText` et les `aria-label` des éléments de la liste, qui sur Google Flights décrivent chaque vol en toutes lettres : prix, compagnie, escales, durée). Un vol dont le prix ou la compagnie n'apparaît pas dans ce texte est **écarté**. Si moins de 2 vols restent, le résultat de l'outil dit à l'agent de relire la page et de rappeler `report_flights`.
3. Si les `aria-label` de la liste sont lisibles et complets (à relever au premier passage réel), Nami peut construire la liste directement à partir d'eux et ne se servir de l'agent que pour confirmer ; c'est plus rapide et plus sûr que la lecture par capture d'écran. Décision au premier passage, notée dans `docs/tests/g1-vols.md`.
4. Les vols gardés sont rangés dans `agent_run.result.flights.options` ; la conversation pousse la question du critère (point 4 du parcours). La session H reste en attente du résultat de l'outil, exactement comme `ask_user` attend la réponse de l'humain.
5. Quand l'utilisateur a choisi, `/api/agent/[id]/answer` renvoie à l'outil : « The traveller chose flight 2: Qatar Airways, 790 €, departs 13:50. Click it. » L'agent repart.

### 5. Le panneau (`components/panel/panel-screen.tsx`, `lib/panel-focus.ts`)

Rien de neuf dans la mécanique : les trois questions passent par `FocusStage` (une étape à la fois, gros boutons, réponse à la voix). À ajouter :

- Troisième couleur de papier pour le module Vol (le visa est lagon, la carte d'arrivée corail ; proposer une teinte sable ou ciel du soir, cohérente avec la porte de Bali en fond), utilisée par la carte de l'agent, les coches et le moment final.
- Carte de l'agent en mode Vol : étapes « Dates, Résultats, Ton choix, Page de réservation », repérées dans `agent_steps` par mots-clés comme pour le visa.
- Les 2 ou 3 vols proposés affichés en cartes courtes (compagnie, prix en grand, escales, durée), cliquables, lues à voix haute une par une.
- `agentOfficialUrl` (`lib/official-tab.ts`) renvoie l'URL Google Flights pour une session `flights`, pour que l'extension mette le bon onglet en avant et affiche le cadre « Nami pilote ».
- Textes fixes traduits comme le reste (`requestTranslations`) : les quatre critères, « Lequel je t'ouvre ? », le message final.

### 6. Le banc et le script (`scripts/passage-vol.mjs`)

Copie de `scripts/passage-evoa.mjs` : démarre par `/api/flights/start`, suit `/changes`, répond à `report_flights` avec un critère et un choix donnés en argument (`node scripts/passage-vol.mjs passage-1 cheapest 1`), coupe sur `report_ready` ou après N étapes. Il sert aux passages réels sans cliquer dans le panneau.

## Garde-fous (non négociables, comme pour le visa)

- L'agent **ne réserve jamais** : liste noire « Réserver », « Book », « Continuer », « Continue », « Select », « Sign in », « Se connecter » ; `stop_condition` = page des options de réservation de Google Flights. Aucun site de compagnie ni d'agence n'est ouvert par l'agent.
- **Aucune donnée personnelle** dans la session Vol : ni passeport, ni nom, ni e-mail. La tâche ne contient que des villes, des codes d'aéroport et des dates.
- **Aucun vol inventé** : tout vol proposé a été vérifié contre le texte de la page ; en cas de doute, Nami dit « je n'ai pas réussi à lire les vols, regarde à gauche » plutôt que d'afficher un prix.
- Domaine : `google.com` seulement (`www.google.com`, `consent.google.com`) ; sortie du domaine = session arrêtée, comme `left_official_site`.
- Captcha ou « trafic inhabituel » de Google : `ask_user`, l'humain résout, l'agent reprend.

## Décisions prises (Clément, samedi 7 novembre au soir)

1. **Où l'agent s'arrête** : page des options de réservation de Google Flights, puis `report_ready`. Zéro donnée saisie, 100 % sur `www.google.com` (et `consent.google.com` pour « Tout refuser »). Jamais de clic sur Réserver / Book / Continuer / Continue / Pay / Sign in, jamais sur le site d'une compagnie ou d'une agence.
2. **Combien de vols proposés** : au plus 3, en une seule question (« Le moins cher d'abord : Scoot, 646 €, … ; puis … : lequel je t'ouvre ? »), options cliquables « The first / The second / The third : <vol> », donc « le premier », « Qatar » ou un clic marchent.
3. **Repli si Google bloque** : pas de Kayak. Captcha, « trafic inhabituel » ou ville non reconnue : l'agent appelle `ask_user` ; page illisible : Nami dit qu'elle n'a pas pu lire les vols et renvoie vers l'onglet.
4. **Tout en computer use** : aucun Linkup pour les prix (test G0), aucun vol inventé. Chaque vol de `report_flights` est vérifié par CDP contre `document.body.innerText` et les `aria-label` (compagnie et prix collé à sa devise) ; moins de 2 vols vérifiés : relecture demandée à l'agent.
5. **Toutes les destinations** : `request.destination` tel quel dans l'URL (`q=Flights from <origine> to Bali on … through … for N adults economy`, `hl=fr`, `curr=EUR`), voyageurs pris dans la demande (défaut 1).
9. **Ville de départ demandée** (Clément, test réel du 8 novembre : Paris était en dur) : après le « oui » au vol, « Which city do you fly from? », réponse à la voix (nom de ville tel quel, Google le résout) ou au clic (« Paris » proposé) ; gardée dans `request.origin` (champ nullable du contrat voyage, aussi capté par `/api/trip/parse` : « je pars de Lyon ») ; pas de question si elle est déjà connue. `FlightsStart` reçoit `origin` (défaut Paris), `googleFlightsUrl` l'utilise.
10. **Critères combinés** : « le moins cher et le plus rapide » donne le compromis (`best`, libellé « Best compromise », le mot « Best » sert à l'interpréteur vocal) et Nami le dit (« Several criteria: I will balance price, duration and stops. »).
6. **Dates** : `departure_date` toujours connue ; `return_date` confirmée (une question, « oui » ou une nouvelle date à la voix) ou demandée (trois dates au clic : J+7, J+10, J+14, ou une date à la voix). Jamais `arrival_at`.
7. **Ordre des questions** : le critère est demandé avant de lancer l'agent (pendant qu'il ouvre Google, H n'attend pas), le choix du vol après la lecture ; H attend le résultat de `report_flights` pendant le choix, dans les 600 s ; à l'expiration, Nami le dit et propose de relancer.
8. **Session Vol** : outils `ask_user`, `report_ready`, `report_flights` seulement (pas de `<select>` natif sur Google Flights) ; liaison en mémoire comme les papiers ; aucune donnée personnelle dans la session.

## Note du 8 novembre : H lent (F38)

Quand H ouvre la session Vol mais ne pilote jamais le navigateur (aucune action en 45 s), Nami relance la même recherche une fois toute seule, avec les mêmes dates, la même ville de départ et le même critère (`flightsStartBody`), sans reposer une question ; la ligne d'état dit « H is slow, starting again ». Si la relance se fige aussi, « H is not answering right now. Try again in a minute. » et la proposition « Shall I search your flights again? » (`FLIGHTS_RETRY_PROPOSAL`, jamais en double). Une session qui avait déjà agi n'est pas relancée automatiquement. Détails : [docs/tests/2026-11-08-h-lent.md](../tests/2026-11-08-h-lent.md).

## Ce qui est hors de ce ticket

- Choix du siège, bagages, assurance, paiement : jamais.
- Plusieurs voyageurs : 1 adulte en V1 (même borne que le visa).
- Hôtel : reste « soon ».
- Recherche par agent de tous les comparateurs : Google Flights seul en V1, Kayak en repli.

## Tests

- vitest :
  - `rankFlights` : les quatre critères sur un jeu de 6 vols (prix égaux, durée égale, aucun direct) ;
  - `FlightOptionSchema` refuse un prix texte, une durée négative, un index manquant ;
  - vérification contre la page : un vol dont le prix n'est pas dans le texte est écarté ; moins de 2 vols gardés = demande de relecture ;
  - tâche de l'agent : contient les deux dates, PAR, DPS, « round trip », ne contient aucun champ du passeport ;
  - consignes : liste noire présente, domaine `google.com` ;
  - `trip-state` : oui au vol → question des dates ; retour inconnu → question `return_date` ; réponse au critère → question du choix ; `report_ready` sur `flights` → message final et pas de nouvelle proposition ;
  - garde de domaine de `pick_option`/`fill_field` sur une session `flights` : accepte `www.google.com/travel/flights`, refuse `evisa.imigrasi.go.id` et `kayak.fr`.
- **Passages réels (G1)** sur le Chrome de l'agent (densité 1, pont holo, `scripts/passage-vol.mjs`), notés dans `docs/tests/g1-vols.md` : URL pré-remplie qui marche, consentement, nombre de vols lus et gardés, critère, vol ouvert, arrêt sur la page de réservation ; durée, étapes H et coût de chaque passage ; relevé des `aria-label` de la liste. **3 passages sur 3** jusqu'à la page de réservation sans aide humaine, dont un coupé par « Stop ». Puis un passage complet depuis le panneau, à la voix, enchaîné après la carte d'arrivée.

## Critère de fin

`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` passent. Depuis « Do you also want me to help you find your flights? », en disant « oui », puis un critère, puis un choix, à la voix : l'agent ouvre Google Flights pré-rempli, Nami lit et propose les vols réels du jour, l'agent ouvre le vol choisi et s'arrête sur la page des options de réservation sans rien réserver, 3 passages sur 3 notés dans `docs/tests/g1-vols.md`. Aucun prix affiché qui ne soit pas sur la page.
