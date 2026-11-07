# Ticket 10 (si T9 réussit) : l'agent H cherche le passeport sur l'ordinateur

Responsable humain : **Clément** ou **Ali**, selon qui est libre après T9.
Prérequis : **test T9 réussi** (`docs/tests/t9-bureau.md`, les deux étapes) ; PR #14 fusionnée.
Branche : `feat/10-bureau`, PR vers `main`.

**Ne pas lancer ce ticket si T9 a échoué** : l'option A du recadrage s'applique alors (ticket 09).

Lis d'abord `docs/specs/2026-11-07-recadrage-computer-use.md` (sections 4, 5 et 6) et https://hub.hcompany.ai/agents-api/your-desktop.md.

## But

Option C du recadrage : quand le passeport manque, un agent H qui pilote **l'ordinateur entier** l'ouvre dans le Finder sous les yeux du jury, montre ce qu'il a trouvé, attend l'accord, puis l'agent du navigateur remplit le formulaire (PR #14) avec ce fichier.

## À faire

1. `lib/h-agent.ts` : `createSession` accepte un environnement `{ id: "laptop", kind: "desktop", session_id }` (le `session_id` affiché par `holo local desktop`), à la place de l'environnement navigateur. Noms exacts des champs dans la doc ; `shell` reste `false`.
2. `POST /api/documents/find-on-desktop` `{ local_desktop_session_id }` : session H courte (`max_time_s: 180`, `max_steps: 30`) avec la consigne : « Open Finder. Look only in Documents and Downloads. Find the file that is a scan of a passport identity page. Do not open any file other than to preview it, do not move, rename or delete anything, do not open any other application. Then call found_document with its folder and file name. » Outil `found_document { folder, name }`.
3. Dans la conversation : la proposition « Shall I look for it on your computer? » ; pendant la recherche, les étapes en direct (Agent Activity) ; à l'appel de `found_document`, une carte « Is this your passport? » avec le nom et le dossier ; « yes » à la voix ou au clic.
4. Le chemin confirmé (`~/<folder>/<name>`, résolu côté serveur, vérifié comme existant et sous Documents ou Downloads) part dans les `file_paths` de `/api/papers/start`.
5. Réglage de démo (`?demo=1`) : champ « Local desktop session », comme « Local browser session ».
6. Les deux sessions ne tournent jamais en même temps : la session de l'ordinateur est terminée (ou annulée) avant de lancer celle du navigateur.

## Tests (vitest, API H simulée)

- Corps de création de session conforme pour `kind: "desktop"` ; refus sans `local_desktop_session_id`.
- `found_document` avec un chemin hors de Documents et Downloads, ou contenant `..` : refusé.
- La session du navigateur n'est pas lancée tant que celle de l'ordinateur tourne.

## Test réel (sur le portable de démo, faux passeport ou passeport du titulaire avec son accord)

3 passages : le bon fichier trouvé, aucune autre application ouverte, aucun fichier modifié ; durée notée dans `docs/tests/t9-bureau.md` (section « Dans Nami »).

## Critère de fin

`npm test`, `npm run lint` et `npm run build` passent ; 3 passages réels sur 3 ; aucune donnée du passeport dans les journaux.
