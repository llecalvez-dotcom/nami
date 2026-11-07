# Ticket 16 : la photo d'identité, le bon champ du passeport, un scan que le site accepte

Responsable humain : **Ali** (lance Devin, relit la PR, fait le test réel).
Branche : `feat/16-photo-et-scan` depuis `main`. Une PR.

Lis d'abord `docs/specs/2026-11-07-nami-epure.md` (sections 3 et 8), `lib/agent-passport-upload.ts`, `lib/documents.ts`, `app/api/documents/find/route.ts`, `components/trip/document-finder.tsx`, `lib/agent-task.ts`.

## Pourquoi

Passage réel du samedi 19 h 05, étape 1 du formulaire de l'e-VOA :

1. `upload_file` a répondu « no file input found ». La page a **5 champs fichier, tous cachés** : `initial_file`, `path_attachment`, `path_attachment_crop`, `passport-attachment` (images png, jpg, jpeg) et `picture` (images). Le code ne prend qu'un champ visible, ou le seul champ de la page.
2. L'étape 1 demande aussi la **photo d'identité** (`picture`) ; `upload_file` ne gère que le passeport.
3. Nathan a déposé le passeport à la main : le site l'a refusé (« Invalid Data. Unable to read several fields from your passport. Please ensure your passport is clear, well-lit, and positioned correctly »). Le site lit lui-même l'image : une photo prise au téléphone, de travers ou avec des reflets, ne passe pas, quel que soit l'agent.

## Ce qu'il faut faire

1. **Bon champ** dans `lib/agent-passport-upload.ts`, à la place de la ligne qui choisit `input` :
   ```js
   // e-VOA step 1: five hidden file inputs; the passport one is named passport-attachment.
   const named = inputs.filter(input => new RegExp(PURPOSE, "i").test(input.id + " " + input.name));
   const input = visible.length === 1 ? visible[0] : named.length === 1 ? named[0] : inputs.length === 1 ? inputs[0] : null;
   ```
   avec `PURPOSE` = `passport` pour le passeport et `picture|photo` pour la photo (testé sur le banc de Nathan pour le passeport, pas encore en passage réel).
2. **Photo d'identité** :
   - `/api/documents/find?kind=photo` : mêmes règles que le passeport (dossier `NAMI_DOCUMENTS_DIR`, images seulement), classement par mots du nom (`photo`, `identite`, `identity`, `id`, `portrait`) ; aperçu et confirmation comme le passeport, sans lecture par le modèle.
   - `upload_file { purpose: "photo" }` accepté ; le fichier déposé est la photo confirmée, jamais un autre.
   - La consigne de l'agent (`lib/agent-task.ts`) dit déjà « purpose passport or photo » : vérifier qu'elle reste juste.
3. **Scan lisible par le site** : avant de déposer, si l'image fait plus de 2 000 px de côté, la réduire (côté long 2 000 px, JPEG qualité 90) dans un fichier temporaire supprimé après le dépôt, sans jamais l'écrire dans le dépôt Git ni dans les journaux. Ne pas recadrer ni redresser : c'est au voyageur de fournir un scan à plat. Dans la carte du passeport, une phrase : « For the official site, use a flat, well-lit scan of the photo page. »
4. **Pour la démo** : préparer avec le titulaire un scan à plat de la page photo du passeport (scanner ou appli de scan du téléphone, sans reflet) et une photo d'identité sur fond clair, dans le dossier de démo. Vérifier à la main que le site les accepte avant le passage de l'agent.

## Tests

- vitest (CDP simulé) : page à 5 champs cachés → `passport-attachment` pour le passeport, `picture` pour la photo ; deux champs « passport » → « no file input found » ; `kind=photo` trouve une image nommée `photo-identite.jpg` et refuse un PDF.
- Test réel avec le ticket 15 : passeport et photo déposés par Nami, acceptés par le site, sans clic humain. Résultat dans `docs/tests/t12-depot-fichier-cdp.md`, sans aucune donnée du passeport.

## Critère de fin

`npm test`, `npm run lint`, `npm run build` passent ; l'étape 1 de l'e-VOA franchie avec les deux fichiers déposés par Nami et acceptés par le site.
