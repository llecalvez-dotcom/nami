# Ticket 17 : retour des passages réels du ticket 15, ce qu'il reste pour atteindre l'écran de paiement

> **État au samedi 7 novembre, 23 h : ticket fermé avec la borne de Nathan (PR #59).** Depuis 21 h, la démo s'arrête à l'étape 1 du formulaire, une fois le passeport et la photo déposés, sans jamais cliquer sur Next : les étapes suivantes envoient les données du voyageur au gouvernement, et l'équipe ne veut faire aucune déclaration réelle. Avec cette borne, l'agent H fait tout le parcours seul, 3 passages sur 3 dont un coupé par « Stop » (passages 9, 10 et 11 de `docs/tests/f1-evoa.md`). Tout ce qui est écrit plus bas sur « l'écran de paiement » était l'objectif d'origine et n'est plus celui de la démo ; le code de l'étape 2 livré par cette PR (billet retour, `fill_field`, libellé du bloc) reste dans le dépôt, couvert par les tests unitaires, mais n'a pas été vu en réel et ne le sera pas tant que la borne tient. Mode d'emploi du banc et des passages : `docs/tests/f1-evoa.md`, section « Mode d'emploi ».

Responsable humain : **Clément** (passages réels, relecture), avec **Ali** pour le point 2 (ticket 16).
Branche : `feat/17-suite-agent-evoa` depuis `main`, une fois la PR des correctifs du ticket 15 (`devin/1794079157-pick-option-select2`) fusionnée. Une PR.

Lis d'abord `docs/tests/f1-evoa.md` (relevé des 3 passages du samedi 7 novembre), `docs/tickets/15-agent-evoa-complet.md`, `docs/tickets/16-photo-et-scan.md`, `lib/local-chrome.ts` (`pickExpression`), `lib/bali-papers.ts` (`route_hint` de l'e-VOA).

## Pourquoi

Trois passages réels sur le Mac de Clément (densité 1, 0,44 $ au total) : l'agent franchit seul la sélection du visa, l'étape 1 et remplit l'étape 2. Il n'a jamais atteint l'écran de paiement :

- le site refuse `Next` à l'étape 2 sans billet retour en PDF (« Return Ticket is empty ») ;
- le passeport et la photo ont été déposés par script, pas par Nami ;
- le code postal et la liste des aéroports ont demandé une aide par script ;
- le passage arrêté par « Stop » n'a pas été fait.

## Ce qu'il faut faire

État au 7 novembre, 23 h (branche `feat/17-suite-agent-evoa`, code, tests et 8 passages réels sur le Mac de Clément, relevés dans `docs/tests/f1-evoa.md`) :

- [x] 1 côté Nami : `upload_file { purpose: "return_ticket" }` (recherche PDF, confirmation, champ `return_ticket`, `ask_user` sans billet).
- [ ] 1 démo : vrai billet retour en PDF dans `private/` : **sans objet** tant que la démo s'arrête à l'étape 1 (PR #59) ; jamais de faux billet.
- [x] 2 : la photo et le scan du ticket 16 étaient déjà sur `main` (PR #50, #51, #53) ; **vu en réel** : `upload_file` dépose le passeport (passages 5, 7, 9, 10) et la photo (9, 10) sans aide, quand le panneau transmet `photo_document_id`.
- [x] 3 : `pickExpression` lit le libellé du bloc `.form-group` sans l'astérisque et préfère le libellé exact.
- [x] 4 : outil `fill_field`, route `/api/agent/[id]/fill`, consigne pour le code postal.
- [x] 5 : nom et prénoms lus par Nami transmis tels quels dans la tâche, avec la consigne de les écrire tels quels.
- [x] 7 : passages réels avec la borne de l'étape 1 : 9 et 10 complets et autonomes, 11 coupé par « Stop » (`docs/tests/f1-evoa.md`).
- [ ] 6 : étapes 3 et suivantes : **sans objet** avec la borne de l'étape 1.
- [ ] 8 : nettoyage du Mac après la démo (`~/nami-runs`, `private/passeport-scan.jpg`).
- [x] Tests vitest des trois points, `npm test`, `npm run lint`, `npm run build`.

1. **Billet retour (bloquant).** Le champ Return Ticket (PDF) est obligatoire à l'étape 2.
   - Pour la démo, mettre dans `private/` un vrai billet retour en PDF (réservation réelle, accord du titulaire). Ne jamais fabriquer de faux document pour un site officiel.
   - Côté Nami : `upload_file { purpose: "return_ticket" }`, avec un fichier PDF trouvé dans `NAMI_DOCUMENTS_DIR` (mots du nom : `billet`, `ticket`, `retour`, `return`, `flight`) et confirmé comme le passeport. Champ de la page à relever au prochain passage (nom et `accept` du champ fichier du Return Ticket), puis choix par nom comme dans le ticket 16.
   - Si aucun billet n'est fourni, l'agent appelle `ask_user` et ne dépose jamais un autre fichier.
2. **Passeport et photo déposés par Nami (ticket 16).** Le correctif #50 (`passport-attachment`) n'a pas encore été vu en passage réel. `upload_file { purpose: "photo" }` vers `#picture` n'existe pas encore. La photo du passeport prise au téléphone est refusée par le lecteur MRZ du site, alors qu'une copie recadrée sur la page photo et redressée passe : il faut un scan à plat dans le dossier de démo.
3. **`pick_option` sur un menu sans `<label>`.** `#airport_id` (Port of Entry) n'a pas de `<label>`, et son `div` le plus proche ne contient que « --- Choose --- ». `pick_option("Port of Entry", ...)` vise donc `#port_mode`, dont le libellé « Port of Entry Mode » contient la chaîne cherchée. Dans `pickExpression`, chercher aussi le libellé du groupe : le texte du `label` ou de l'élément précédent dans le bloc du champ (`.form-group`, `.row`, `.col-*`), sans le « * » des champs obligatoires. Avant de coder, relever le HTML réel autour de `#airport_id`.
4. **Code postal.** Le site ne cherche le code postal qu'à l'événement `keyup` de `#postal_code`, et la saisie de H ne le déclenche pas : Province, City, District et Village restent vides, avec « Postal Code is not valid ». Ajouter un outil Nami `fill_field { field, value }` (CDP, même garde de domaine que `pick_option`) : il écrit la valeur, puis déclenche `input`, `change` et `keyup` (jQuery si présent). Le citer dans la consigne pour le code postal.
5. **Nom de famille à particule.** La consigne dit maintenant de garder tous les mots du nom de famille, mais ce n'est pas revérifié : le passage 3 a repris un formulaire déjà rempli. À vérifier au prochain passage complet ; sinon, donner le nom et les prénoms lus par Nami dans la tâche de l'agent.
6. **Étapes 3 et suivantes, jamais vues.** Au premier passage qui franchit l'étape 2 :
   - relever chaque étape (titre, champs, boutons) dans `docs/tests/f1-evoa.md`, sans donnée du passeport ;
   - compléter `route_hint` ;
   - vérifier que l'agent appelle `report_ready` sur le résumé ou le paiement et que Nami coupe la session.
7. **Passages du critère du ticket 15.** Trois passages depuis la page de choix du visa, jusqu'à l'écran de résumé ou de paiement, sans aide humaine, dont un arrêté par « Stop » en cours de route. Noter pour chacun la durée, le coût et les étapes dans `docs/tests/f1-evoa.md`. Jamais de clic sur Submit, Pay, Bayar ou Kirim.
8. **Après la démo**, supprimer sur le Mac les relevés locaux qui contiennent des données du passeport (`~/nami-runs`) et la copie recadrée `private/passeport-scan.jpg`, si elle n'est plus utile.

## Tests

- vitest :
  - `pickExpression` choisit `#airport_id` pour « Port of Entry » sur une page sans `<label>`, où le libellé est dans le bloc du champ ;
  - `fill_field` déclenche `keyup` et refuse un domaine non officiel ;
  - `upload_file { purpose: "return_ticket" }` choisit le bon champ et refuse une image.
- Passages réels du point 7.

## Critère de fin

Révisé le 7 novembre à 21 h (PR #59, décision de Nathan) : depuis la page de choix du visa, l'agent choisit le visa, ouvre le formulaire, dépose le passeport et la photo par `upload_file`, puis s'arrête (`report_ready`) sans cliquer sur Next, sans aide humaine, 3 passages sur 3, dont un arrêté par « Stop ». **Atteint le 7 novembre à 22 h 45** (passages 9, 10 et 11). `npm test` (739 tests), `npm run lint`, `npx tsc --noEmit` et `npm run build` passent.

L'ancien critère (écran de résumé ou de paiement) n'est plus visé par la démo. Si l'équipe le reprend un jour : il faut un vrai billet retour en PDF, enlever la borne de `stop_condition` dans `lib/bali-papers.ts`, et refaire les points 6 et 7 ci-dessus.
