# Ticket 09 : retrouver le passeport dans un dossier local

Responsable humain : **Ali** (lance Devin, relit la PR, teste avec un faux passeport).
Prérequis : `main` à jour (PR #12 et #18 fusionnées si possible).
Branche : `feat/09-documents`, PR vers `main`.

Lis d'abord `docs/specs/2026-11-07-recadrage-computer-use.md` (sections 3 et 5, option A), et `lib/passport.ts`, `components/trip/passport-card.tsx`.

## But

Si l'utilisateur n'a pas déposé son passeport, Nami propose : « I don't have your passport yet. Shall I look for it in your documents? » Sur « yes », il cherche dans un dossier choisi à l'avance, montre ce qu'il a trouvé avec un aperçu, et l'utilisateur confirme. Le chemin du fichier confirmé part ensuite à l'agent H (`file_paths`), pour qu'il le dépose sur le site officiel.

## À faire

1. **Seulement en local** : la fonction n'existe que si `NAMI_DOCUMENTS_DIR` est défini (chemin absolu d'un dossier) **et** `NODE_ENV !== "production"`. Sinon, les routes répondent 404 et l'interface ne propose rien. Ajouter `NAMI_DOCUMENTS_DIR` à `.env.example`.
2. `GET /api/documents/find?kind=passport` : liste les fichiers de `NAMI_DOCUMENTS_DIR` (et ses sous-dossiers, 2 niveaux au plus) de type `jpg`, `jpeg`, `png`, `heic`, `pdf`, au plus 10 Mo, classés par score : nom contenant `passport`, `passeport`, `pasaporte`, `reisepass` (fort), `id`, `identity`, `identite`, `scan` (faible). Renvoie `{ id, name, folder, size_bytes, modified_at, score }`, au plus 5 résultats. **Jamais le chemin absolu** vers le navigateur : `id` est un jeton opaque gardé côté serveur.
3. `GET /api/documents/preview?id=…` : image réduite (ou première page du PDF si simple, sinon une icône) du fichier choisi. Refuser tout `id` inconnu ; aucun accès hors de `NAMI_DOCUMENTS_DIR` (chemins résolus avec `realpath`, liens symboliques refusés s'ils sortent du dossier).
4. Dans la conversation : la question de Nami ci-dessus quand le passeport manque ; sur « yes », une carte avec les résultats (aperçu, nom, dossier, date) ; « This one » confirme, « None of these » propose le dépôt manuel. Rien n'est lu par un modèle sans le consentement déjà en place (PR #12) : la recherche se fait **sur les noms de fichiers**, pas sur le contenu.
5. Le fichier confirmé : son chemin absolu est ajouté côté serveur aux `file_paths` de `/api/papers/start` (le navigateur n'envoie que l'`id`).
6. Aucun nom de fichier, chemin ni aperçu dans les journaux du serveur.

## Tests (vitest, dossier temporaire créé par le test)

- Sans `NAMI_DOCUMENTS_DIR`, ou en production : 404.
- Classement : `passeport-scan.jpg` avant `scan-facture.pdf` avant `photo.jpg` ; fichiers trop gros ou d'un autre type ignorés.
- `preview` refuse un `id` inconnu, `../`, et un lien symbolique qui sort du dossier.
- Le chemin absolu n'apparaît jamais dans une réponse.

## Test réel (Ali, faux passeport seulement)

Dossier de test avec `passeport-scan.jpg` (faux), `facture.pdf`, `photo.jpg` : le faux passeport sort en premier, l'aperçu s'affiche, « This one » le confirme. Noter dans `docs/tests/t10-recherche-documents.md`.

## Critère de fin

`npm test`, `npm run lint` et `npm run build` passent ; aucune route active en production ; aucun chemin absolu renvoyé au navigateur.
