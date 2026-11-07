# Ticket 14 : l'écran épuré du panneau (une conversation, un micro)

Responsable humain : **Nathan** (lance Devin, relit la PR, teste à la voix dans le panneau).
Branche : `feat/14-panneau-epure` depuis `main`. Une PR.

Lis d'abord `docs/specs/2026-11-07-nami-epure.md` (sections 2 à 4), `extension/README.md`, `components/home/home-screen.tsx`, `components/trip/trip-screen.tsx`, `components/trip/conversation.tsx`, `components/trip/passport-card.tsx`, `components/trip/document-finder.tsx`, `components/trip/use-agent-run.ts`, `components/voice/`, `lib/trip-state.ts`.

## Pourquoi

Dans le panneau latéral (environ 400 px de large), l'écran Trip à deux colonnes, les cartes, la World map et les réglages de démo n'ont pas leur place. Le jury doit voir une conversation et, à côté, l'agent qui travaille.

## Ce qu'il faut construire

Une page `app/panel/page.tsx` (et son composant `components/panel/panel-screen.tsx`), faite pour 360 à 480 px de large, qui réutilise la logique existante (`lib/trip-state.ts`, `lib/trip-store.ts`, `useAgentRun`, les composants de voix) sans la dupliquer.

1. **Un seul écran** : en haut, « Nami » ; au milieu, la conversation (bulles de Nami et du voyageur, propositions avec boutons « Yes » / « Not now ») ; en bas, un gros bouton micro et un champ texte de secours. Pas de navigation, pas de liste de voyages, pas de dossier.
2. **Démarrage** : la première phrase (voix ou texte) crée le voyage, comme l'accueil actuel, mais reste sur `/panel` (pas de redirection vers `/trip/[id]`). Le voyage en cours est retrouvé au rechargement (`trip-store`).
3. **Questions** : celles du moteur (`lib/planner/`), une à la fois, lues à voix haute, réponse à la voix ou au clic, comme aujourd'hui.
4. **Passeport** : la proposition « Shall I look for it on this computer? » (déjà dans le ticket 12 A), puis une carte compacte dans la conversation : aperçu flouté, nom, nationalité, date d'expiration, contrôle MRZ, boutons « It's me » et « Edit ». Les champs complets s'ouvrent seulement sur « Edit ». Même chose pour la photo d'identité quand le ticket 16 est fusionné.
5. **Agent** : « Fill in my e-VOA » lance l'agent (même appel que `startVisaSession`). Le message de Nami : « I'm filling in your e-VOA on the official site. Watch the left tab. » Les étapes de l'agent s'affichent sur **une seule ligne vivante** sous ce message (la dernière étape, pas la liste), avec « Stop » à droite. Les questions de l'agent arrivent comme des bulles de Nami, lues à voix haute.
6. **Fin** : à `report_ready`, « Your e-VOA is ready. Check it and pay in the left tab: I never click Pay. »
7. **Onglet de l'agent** : au lancement, envoyer `nami:focus-official` (déjà géré par `extension/panel.js`) pour mettre l'onglet du site au premier plan.
8. **Réglages** : aucune saisie visible. La session du navigateur local vient d'une variable serveur (ticket 15, `NAMI_LOCAL_SESSION_ID`) ; s'il en manque une, message clair dans la conversation.
9. **Option de l'extension** : l'adresse par défaut de Nami dans `extension/settings.js` devient `http://localhost:3000/panel`.

Textes de l'interface en anglais, sans tiret cadratin ni demi-cadratin.

## Ce qu'on ne touche pas

Les routes serveur, `lib/planner/`, les pages existantes (`/`, `/trip/[id]`, `/map`) : elles restent, la démo ne les montre plus.

## Tests

- vitest : `/panel` crée un voyage sans changer de page ; une proposition acceptée lance la recherche du passeport ; la ligne vivante montre la dernière étape seulement.
- Test réel dans le panneau, à la voix, avec l'agent (ticket 15) : du « I'm flying to Bali on Monday… » jusqu'à l'écran de paiement, sans toucher au clavier.

## Critère de fin

`npm test`, `npm run lint`, `npm run build` passent ; parcours complet à la voix dans le panneau ; capture du panneau dans la PR.
