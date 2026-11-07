# Test F1 : l'agent H remplit l'e-VOA de Bali jusqu'à l'écran de paiement (ticket 15)

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
