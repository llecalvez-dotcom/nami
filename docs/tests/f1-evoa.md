# Test F1 : l'agent H remplit l'e-VOA de Bali jusqu'à l'écran de paiement (ticket 15)

> **Mise à jour du 7 novembre, 23 h (ticket 17).** Depuis 21 h, la démo s'arrête à l'étape 1 du formulaire, passeport et photo déposés, sans cliquer sur Next (décision de Nathan, PR #59 : rien n'est envoyé au gouvernement). Avec cette borne, **le critère est atteint** : passages 9 et 10 complets et autonomes, passage 11 coupé par « Stop ». Voir « Passages du soir (ticket 17) » et « Mode d'emploi » en bas de ce fichier. Le relevé des passages 1 à 3 ci-dessous (jusqu'à l'étape 2) reste utile si l'équipe reprend un jour l'objectif du paiement.

Passages réels du samedi 7 novembre 2026 sur le Mac de Clément : Chrome de l'agent lancé par `npm run demo` (port 9333, densité 1 vérifiée par CDP), pont `holo local browser`, Nami sur le port 3000. Les passages sont pilotés par les routes de Nami (`/api/papers/start`, `changes`, `pick`, `answer`, `cancel`) depuis un script local, comme le ferait le panneau ; ce script coupe la session si l'adresse de l'onglet contient `payment`, `checkout`, `bayar` ou `pembayaran` (jamais déclenché).

Données : vrai passeport (accord du titulaire), e-mail de Clément, hôtel de démo à Kuta (code postal 80361), numéro de téléphone de démo. Rien n'a été envoyé ni payé. Aucune donnée du passeport n'est notée ici.

**Résultat : critère du ticket 15 non atteint.** L'agent franchit seul la sélection du visa, l'étape 1 et remplit l'étape 2, mais le site refuse `Next` sans billet retour en PDF (« Return Ticket is empty »). L'écran de paiement n'a jamais été atteint ; le passage arrêté par « Stop » n'a pas été fait. Suite : `docs/tickets/17-suite-agent-evoa.md`.

## Passages

| Passage | Date et heure | Code | Étapes du formulaire relevées | Blocage | Durée | Coût H | Arrêt au paiement | « Stop » testé |
|---|---|---|---|---|---|---|---|---|
| 1 | 7/11, 19 h 49 à 19 h 57 | `main` (`df7d48f`, puis `0233fe0` avec #50 pendant le passage) | sélection du visa, étape 1, début de l'étape 2 | passeport et photo non déposés par `upload_file` ; coupé à la demande de Clément sur « Place of Birth » | 8 min (39 étapes H) | 0,12 $ | non | non (session annulée par `cancel`, statut `interrupted`) |
| 2 | 7/11, 20 h 04 à 20 h 20 | `main` (`0233fe0`) | étape 2 jusqu'à « Arrival Information » (reprise du formulaire du passage 1) | liste des aéroports vide après « Airport » ; code postal sans effet | 16 min dont 5 d'attente d'une réponse (63 étapes H) | 0,26 $ | non | non (l'agent a terminé seul, `completed`) |
| 3 | 7/11, 20 h 23 à 20 h 25 | `devin/1794079157-pick-option-select2` | fin de l'étape 2 (reprise du formulaire du passage 2) | « Return Ticket is empty » au clic sur `Next` | 1 min 50 (17 étapes H) | 0,06 $ | non | non (l'agent a terminé seul, `completed`) |

Les passages 2 et 3 ont repris le formulaire laissé ouvert par le passage précédent : ce ne sont pas des parcours complets depuis la sélection du visa. Coût total : 0,44 $.

## Relevé du formulaire

| Étape | Titre | Champs | Boutons | Ce qui a bloqué |
|---|---|---|---|---|
| Sélection | Visa selection | pays du passeport, General, Family, or Social, Tourism, Family Visit, and Transit, B1 - Tourist (Visa On Arrival) ; séjour 30 jours rempli seul | Detail & Apply, puis Apply dans la fenêtre des conditions, OK dans la fenêtre des messages | rien : menus Select2 choisis par `pick_option` sans rechargement |
| 1 | Pièces jointes | passeport (`#passport-attachment`, caché), photo d'identité (`#picture`, caché) ; 5 champs fichier cachés sur la page ; le site lit lui-même la MRZ et affiche une fenêtre de confirmation à faire défiler jusqu'à Ok | Ok, Next | `upload_file` : « no file input found » pour le passeport (Nami sans #50), photo non gérée ; photo du passeport prise au téléphone refusée (« Unable to read passport data »), copie recadrée sur la page photo et redressée acceptée. Les deux fichiers ont été déposés par script CDP, pas par Nami. |
| 2 | Données personnelles | prénom, nom (remplis par le site, le nom complet dans First Name), sexe, date de naissance, numéro et expiration du document, Passport/Country/Region et Issuing Country (`PRANCIS`, rempli par le site), lieu de naissance, téléphone, Document Type (Passport seul choix) | | l'agent a pris `PRANCIS` pour une erreur de lecture ; il a gardé un seul mot du nom à particule |
| 2 | Address in Indonesia | Residence Type (HOTEL), adresse, Postal Code ; Province, City, District, Village et Immigration Office remplis par le site après le code postal | | le site ne cherche le code postal qu'au `keyup` ; la saisie de H ne le déclenche pas ; débloqué à la main (`keyup` déclenché par script) |
| 2 | Arrival Information | Port of Entry Mode (`#port_mode` : Airport, Seaport, Landport), Port of Entry (`#airport_id`, 48 options, Bali = `NGURAH RAI AIRPORT`) | | la liste ne se charge qu'à l'événement `select2:select` de `#port_mode` (`filterAirportByMode`), pas au `change` envoyé par `pick_option` ; l'agent cherchait « Denpasar » (message de la liste : « Your country is not whitelisted Passport subject ») ; `pick_option("Port of Entry")` vise `port_mode`, car `#airport_id` n'a pas de `<label>` |
| 2 | Return Ticket, Applicant Contact Confirmation | Return Ticket (PDF, obligatoire), Email, Email Confirmation | Next | « Return Ticket is empty » : impossible de passer à l'étape 3 sans PDF |

Étapes 3 et suivantes, résumé et paiement : jamais vus.

## Ce que l'agent a fait seul, et ce qui a été fait pour lui

- **H Computer Use :** navigation, défilement, clics (Detail & Apply, Apply, OK, Next, Ok de la confirmation, ouverture des listes, choix de NGURAH RAI AIRPORT par la recherche de la liste), saisie des champs texte. Densité 1 : tous les clics tombent au bon endroit sur le Retina.
- **Nami (`pick_option` par CDP, à la demande de H) :** les 4 menus de la sélection du visa, Document Type, Residence Type, Port of Entry Mode.
- **Opérateur, par script CDP :** dépôt du passeport (copie recadrée) et de la photo, fermeture d'une fenêtre d'erreur, `keyup` sur le code postal, sélection de « Airport » avec l'événement `select2:select` (passage 2).
- **Opérateur, par `answer` :** lieu de naissance, e-mail, hôtel, téléphone, `PRANCIS`, aéroport, billet retour absent.

## Sécurité

Aucun clic sur Submit, Pay, Bayar ou Kirim ; l'étape 2 n'a jamais été dépassée ; `report_ready` n'a jamais été appelé (l'arrêt automatique au paiement reste à voir en réel) ; aucun `left_official_site`.

## Ajustements de la consigne

- `pick_option` (`lib/local-chrome.ts`) : déclenche aussi `select2:select` après `change`, et préfère un libellé exact à une inclusion.
- `route_hint` de l'e-VOA (`lib/bali-papers.ts`) : `upload_file` pour le passeport et la photo à l'étape 1 ; `PRANCIS` est correct ; nom de famille complet (tous les mots) ; province et ville remplies par le code postal, sinon `ask_user` ; Port of Entry de Bali = `NGURAH RAI AIRPORT` par `pick_option`.
- Vu au passage 3 : l'agent a bien cherché `NGURAH RAI AIRPORT`, mais `pick_option` a encore visé `port_mode` (pas de `<label>` sur `#airport_id`) ; il s'en est sorti par la recherche de la liste. Le nom de famille n'a pas été revérifié (formulaire repris).

## Passages du soir (ticket 17, 22 h 00 à 22 h 50), borne de l'étape 1

Banc : même Mac, Chrome de l'agent port 9333 en densité 1, pont `holo local browser`, Nami port 3000, branche `feat/17-suite-agent-evoa` (PR #65, qui contient `main` jusqu'à la PR #63). Chaque passage part de la page de choix du visa (onglet remis sur `https://evisa.imigrasi.go.id/web/visa-selection` par CDP). Pilotage par `scripts/passage-evoa.mjs`, qui transmet aussi la photo (`photo_document_id`) et gère `fill_field`. Documents : scan recadré du passeport et photo d'identité dans `NAMI_DOCUMENTS_DIR`, pas de billet retour.

| Passage | Heure | Résultat | Étapes H | Coût H | Durée |
|---|---|---|---|---|---|
| 4 | 22 h 02 | Trouve le formulaire encore à l'étape 2 (laissé par le passage 3) : s'arrête aussitôt, comme la borne le demande | 1 | 0,01 $ | 23 s |
| 5 | 22 h 05 | Visa choisi, **passeport déposé par Nami** (`upload_file passport -> uploaded`), photo déposée par script (le script ne transmettait pas encore la photo), `report_ready` à l'étape 1 | 33 | 0,09 $ | 2 min 51 |
| 6 | 22 h 17 | Échec de banc : pont holo mort, chaque étape H échoue après 60 s ; annulé | 0 | 0 | |
| 7 | 22 h 23 | Visa choisi, passeport déposé par Nami, lecture OK ; coupé par l'opérateur (`cancel`) pendant une question sur la borne | ~20 | n. c. | 2 min 17 |
| 8 | 22 h 29 | Échec de banc : pont holo mort à nouveau ; annulé | 0 | 0 | |
| **9** | 22 h 36 | **Complet et autonome** : visa (France, General, Tourism, B1), Detail & Apply, Apply, OK, passeport et photo déposés par Nami, fenêtre de lecture confirmée (Ok), `report_ready`, aucun Next | 39 | 0,11 $ | 3 min 32 |
| **10** | 22 h 41 | **Complet et autonome**, même parcours | 29 | 0,07 $ | 2 min 31 |
| **11** | 22 h 47 | **Coupé par « Stop »** (annulation après 15 étapes, visa France choisi) : session `idle`, Chrome intact, rien de déposé | 8 | 0,02 $ | 50 s |

Coût H des passages 4 à 11 : environ 0,30 $. Aucun Next, Submit, Pay, Bayar ni Kirim ; aucune donnée du formulaire envoyée. Le dépôt du passeport envoie l'image au lecteur MRZ du site (`mrz.imigrasi.go.id`) : c'est inhérent à l'étape 1 et accepté par la borne.

### Ce que ces passages prouvent

- `upload_file` dépose le passeport (`#passport-attachment`, PR #50) et la photo (`#picture`, ticket 16) sur le vrai site, sans aide, dès que le panneau transmet `document_id` et `photo_document_id` à `/api/papers/start`.
- Le site lit le scan recadré sans erreur et affiche la fenêtre de confirmation ; H la confirme (Ok), ce qui recopie les données dans le formulaire sans rien envoyer.
- `pick_option` choisit les 4 menus du visa sans rechargement. Réserve : aux passages 9 et 10, l'agent n'a pas cru le retour « Picked FRANCE » et a refait le menu à la main (ouverture, recherche, clic : 5 étapes de plus) ; la consigne lui dit maintenant de faire confiance au retour de `pick_option`.
- `report_ready` arrête la session (`interrupted`) ; « Stop » (`cancel`) aussi (`idle`).
- Fenêtre de lecture du passeport : `scroll_web` ne la fait pas défiler (3 échecs à chaque passage), Page Down oui ; ajouté à la consigne.

### Non testé en réel

Tout ce que la PR #65 livre pour l'étape 2 : `upload_file { purpose: "return_ticket" }`, `fill_field` (code postal, `keyup`), `pick_option("Port of Entry")` sur le HTML réel (`#airport_id` sans `<label>`), nom à particule dans Last Name. Couvert par les tests unitaires seulement. Le parcours depuis le panneau (en cliquant dans Nami plutôt que par le script) n'a pas été refait ce soir.

### Pièges du banc, relevés ce soir

1. **Pont holo** : `holo local browser` se termine avec chaque session H. `npm run demo` le relance en boucle ; lancé à la main, il ne redémarre pas, et chaque étape H échoue après 60 s (« A step failed, the agent retries »). Relancer : `holo local browser --session-id $(cat ~/.config/nami/local-browser-session-id) --debug-port 9333`, en boucle et détaché.
2. **Serveur Nami pas rechargé** après un `git checkout` d'une autre branche : `next dev` a gardé d'anciens modules de `lib/` (`/api/documents/find?kind=photo` répondait « Unsupported document kind ») ; redémarrer `next dev` avec `NAMI_AGENT_CHROME_PORT=9333`.
3. **Lecture du passeport par H** : trois 502 de suite à 30 s quand H est chargé (passage 11, première tentative) ; réessayer une minute plus tard.
4. **Verrou du navigateur** : `/api/papers/start` répond 409 « Another Nami agent is using this browser » pendant environ 20 s après un `cancel`.
5. **Formulaire laissé ouvert** : si l'onglet est encore sur le formulaire d'un passage précédent, l'agent s'arrête aussitôt (passage 4) ; remettre l'onglet sur la page de choix du visa avant chaque passage.

## Mode d'emploi (refaire un passage)

1. Sur le Mac, `.env.local` avec `HAI_API_KEY`, `PASSPORT_READER=h`, `NAMI_DOCUMENTS_DIR` (dossier qui contient le scan du passeport et la photo ; jamais dans Git). Puis `npm run demo` : il lance le Chrome de l'agent (port 9333, densité 1), le pont holo (relancé à chaque session) et Nami (port 3000), et écrit l'identifiant de session locale dans `~/.config/nami/local-browser-session-id`.
2. Dans le Chrome de l'agent, ouvrir `https://evisa.imigrasi.go.id/web/visa-selection` et ne plus y toucher.
3. Lancer un passage : `node scripts/passage-evoa.mjs passage-12` (un passage « Stop » : `node scripts/passage-evoa.mjs passage-13 15`, qui annule après 15 étapes). Le script lit le passeport par `/api/documents/extract-found`, démarre la session par `/api/papers/start` avec le passeport et la photo, puis suit `/api/agent/<id>/changes` et exécute `pick_option`, `fill_field` et `upload_file` par les routes de Nami, comme le panneau. Il coupe la session sur `report_ready`, sur une adresse de paiement, ou après N étapes.
4. Une question `ask_user` hors des cas connus attend un fichier `<label>-answer-N.txt` dans `~/nami-runs` (ou `NAMI_RUNS_DIR`). Les réponses de démo viennent de `NAMI_DEMO_EMAIL`, `NAMI_DEMO_PHONE`, `NAMI_DEMO_ADDRESS` ; sans elles, le script attend.
5. Noter dans ce fichier la ligne du passage (étapes H, coût et durée sont dans la dernière ligne du journal). Les journaux peuvent contenir des données lues sur le passeport (l'agent les cite) : les supprimer après la démo (`rm -rf ~/nami-runs`).
