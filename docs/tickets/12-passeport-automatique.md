# Ticket 12 : le passeport sans rien taper, jusqu'au dépôt sur le site officiel

Responsable humain : **Ali** (lance Devin, relit la PR, teste avec un faux passeport puis, avec son accord, un vrai).
Prérequis : partie A depuis `main` ; partie B depuis la branche de la PR #14 (`feat/05-agent-visa`) tant qu'elle n'est pas fusionnée, en prévenant Clément.
Branches : `feat/12a-passeport-auto` puis `feat/12b-depot-fichier`, une PR chacune.

Lis d'abord `docs/specs/2026-11-07-recadrage-computer-use.md` (sections 3 et 5), `docs/tickets/09-recherche-documents.md` (section « Intégration différée »), `lib/documents.ts`, `lib/passport.ts`, `app/api/documents/extract/route.ts`, `components/trip/document-finder.tsx`, `components/trip/passport-card.tsx`.

## Pourquoi

Test de Nathan, samedi 17 h 20 : saisir son passeport à la main dans 7 champs est lent, source d'erreurs (dates à l'envers, nom et prénom inversés) et contraire au produit. Ce qu'il veut : un clic, Nami trouve le passeport, le lit, montre les champs, un « oui », et l'agent le dépose sur le site officiel. Aujourd'hui, chaque morceau existe à part, mais rien ne les relie : la recherche dans un dossier (#21) ne mène ni à la lecture (#12, #18) ni à l'agent (#14), et l'agent du navigateur ne sait pas déposer un fichier (test de Clément).

## Partie A : trouver, lire, confirmer (indépendante du test T9)

1. **Dans la conversation**, quand le passeport manque et que Nami doit lancer l'agent : « I need your passport. Shall I look for it on this computer? » (lue à voix haute, « yes » à la voix ou au clic, comme les autres propositions). Sur « yes » : la recherche du ticket 09 (`/api/documents/find?kind=passport`), puis la carte des résultats avec aperçu.
2. **Lecture du fichier trouvé, côté serveur** : nouvelle route `POST /api/documents/extract-found` `{ id, consent_provider }`. Le serveur retrouve le chemin avec `resolveDocumentPath(id)`, lit le fichier sur le disque et le passe au même lecteur que `/api/documents/extract` (même consentement exigé, même contrôle MRZ, mêmes limites). Le navigateur n'envoie jamais l'image ni le chemin.
3. **Champs remplis tout seuls** dans la carte passeport, avec les alertes MRZ ; l'utilisateur vérifie et clique « These are right » (ou dit « yes »). Les champs restent modifiables. Le mode démo affiche les champs en clair **pendant la saisie** et ne les masque qu'une fois confirmés.
4. **Le fichier confirmé part à l'agent** : `/api/papers/start` accepte `document_id`, le résout côté serveur et ajoute son chemin aux `file_paths` (étape différée du ticket 09). Le navigateur n'envoie que l'`id`.
5. **Saisie à la main** : reste possible, mais les dates passent par un sélecteur de date (`type="date"`) au lieu d'un texte `AAAA-MM-JJ`, et le nom et le prénom ont un exemple clair (« Surname: as printed, e.g. DUPONT »).
6. Rien dans les journaux du serveur : ni chemin, ni nom de fichier, ni champ du passeport.

Configuration de démo : `NAMI_DOCUMENTS_DIR` pointe vers le dossier où se trouve le passeport (par exemple `~/Downloads` en chemin absolu), `PASSPORT_READER=h`.

Tests (vitest) : `extract-found` refuse un `id` inconnu, refuse sans consentement (403, aucun appel au lecteur), lit le bon fichier ; `/api/papers/start` avec `document_id` ajoute le bon chemin et refuse un `id` inconnu ; la proposition « Shall I look for it » apparaît seulement si le passeport manque.

## Partie B : l'agent dépose le fichier sur le site officiel

L'agent H en mode navigateur ne voit pas la fenêtre de sélection de fichiers de macOS. Deux voies, selon le test T9 (`docs/tests/t9-bureau.md`) :

- **Si T9 réussit son étape 2** : ticket 10 (l'agent de l'ordinateur entier dépose le fichier).
- **Sinon, ou en attendant** (voie par défaut) : **Nami dépose le fichier quand l'agent le demande.**
  1. Nouvel outil de l'agent : `upload_file { purpose: "passport" | "photo" }`, avec la consigne : « When the form asks for a file, click nothing in the file picker: call upload_file with what the field asks for, wait for the answer, then check that the page shows the file and continue. »
  2. Le serveur de Nami (sur le même portable) se branche au Chrome de l'agent par son port de débogage (`NAMI_AGENT_CHROME_PORT`, 9222 par défaut ; 9333 sur le Mac de Nathan), trouve l'onglet dont l'hôte est le domaine officiel du papier, cherche le champ `input[type=file]` visible ou le seul de la page, et y place le fichier confirmé (CDP `DOM.setFileInputFiles`, ou `elementHandle.uploadFile` de `puppeteer-core` en `connect`, sans lancer de navigateur). Réponse à l'agent : `"uploaded"`, ou `"no file input found"` (l'agent passe alors la main à l'humain par `ask_user`).
  3. Jamais hors du domaine officiel, jamais un autre fichier que celui confirmé par l'utilisateur, jamais en production.
  4. Dans la conversation : « Nami gave the passport to the agent » dans Agent Activity.
  5. Ajouter la dépendance choisie (`puppeteer-core` ou `chrome-remote-interface`) au `package.json`, et l'expliquer dans la PR.

Tests (vitest, CDP simulé) : bon onglet choisi parmi plusieurs ; aucun onglet officiel → pas de dépôt ; deux champs fichier sans indice → réponse « no file input found » ; le chemin déposé est celui du `document_id` confirmé.

## Partie C : les menus Select2 (responsable : **Clément**, même branchement CDP que la partie B)

Constat du samedi 18 h (page `evisa.imigrasi.go.id/web/visa-selection` lue le jour même) : les 5 menus en cascade de l'e-VOA (`#selectCountry`, `#selectParentActivity`, `#selectActivity`, `#selectVisa`, `#selectStay`) sont des menus **Select2 4.0.13** (bibliothèque d'interface, pas un dispositif anti-robots ; aucun captcha ni détection d'automatisation sur cette page). Select2 cache le vrai `<select>` et n'ouvre sa liste que sur un `mousedown` du bouton gauche ; l'agent H, qui clique sans cet événement, ne l'ouvre jamais, et `select_option` sur le `<select>` caché change la valeur sans prévenir la page (le menu suivant ne se charge pas). Au test de Nathan, l'agent a passé 3 essais puis a demandé à l'humain.

1. **Essai rapide (consigne, déjà dans la copie de test de Nathan)** : ajouter à `buildPaperTask` la ligne « Some dropdowns (Select2, shown as a box with a small arrow) only open on a real mouse press and ignore plain clicks. If such a dropdown does not open after one click, use the keyboard instead: click it once so it has focus, press Enter to open it, type the first letters of the value (for example FRANCE), wait for the list to filter, then press Enter to pick the highlighted option. Then check on a fresh screenshot that the box shows the value before moving on. » Select2 ouvre sa liste sur Entrée ou Espace quand il a le focus. Noter dans `docs/tests/f1-evoa.md` si ça suffit.
2. **Solution sûre : outil `choose_option { field, option }`**. Consigne : « For a dropdown you cannot open, call choose_option with the label of the field and the exact text of the option to pick, wait for the answer, then check the page on a fresh screenshot. »
   - Le serveur de Nami, branché au Chrome de l'agent comme en partie B, sur l'onglet du domaine officiel : trouve le `<select>` dont le libellé, l'`id`, le `name` ou le placeholder Select2 correspond à `field`, puis l'`<option>` dont le texte correspond à `option` (sans casse ni accents, correspondance unique, sinon refus).
   - Il choisit l'option avec le moyen de la page : `jQuery(select).val(value).trigger("change")` si jQuery et Select2 sont présents, sinon `select.value = value` puis un événement `change` qui remonte. Il vérifie ensuite que la valeur est prise et renvoie `"selected: <texte>"`, ou `"no such field"`, `"no such option"`, `"several matches"`.
   - Jamais hors du domaine officiel ; jamais sur un bouton ni un champ texte ; seulement des `<select>`.
3. Tests (vitest, CDP simulé) : option trouvée sans casse ni accents (« france » → « FRANCE ») ; deux options proches → « several matches » ; page sans jQuery → repli sur l'événement `change` ; onglet hors domaine → refus.

Critère : au test réel, les 5 menus de la page de choix du visa remplis par l'agent sans aide humaine, 3 fois sur 3.

## Test réel

Avec le portable de démo : « Create my visa » sans passeport → « Shall I look for it? » → « yes » → passeport trouvé dans le dossier → champs lus et confirmés → l'agent remplit l'e-VOA et le fichier est déposé sans clic humain → arrêt avant le paiement. Résultat dans `docs/tests/t12-passeport-auto.md` (sans aucune donnée du passeport).

## Critère de fin

`npm test`, `npm run lint` et `npm run build` passent ; aucune saisie à la main nécessaire dans le parcours ; aucune donnée du passeport ni chemin dans les journaux ou les réponses au navigateur.
