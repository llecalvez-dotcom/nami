# Coche d'un papier : l'onglet de l'agent, jamais une nouvelle page (8 novembre 2026)

Constat sur le banc (Mac de Clément, 8 nov. 4 h 35), après le parcours complet (visa rempli par l'agent jusqu'à l'étape 1 sur `evisa.imigrasi.go.id`, carte d'arrivée sur `allindonesia.imigrasi.go.id`, Vol sur Google Flights) : cliquer sur la coche Visa ouvre une nouvelle page du site (page d'accueil) au lieu de ramener l'onglet où l'agent avait rempli le formulaire. « Toutes les démarches sont perdues. »

## Cause, lue dans le code

La coche envoie `nami:focus-official` avec l'URL du papier (`paperUrl`, `lib/official-tab.ts`) et `extension/panel.js` cherchait un onglet dont l'URL « correspond » (`match`). Cette correspondance exigeait que l'hôte de l'onglet soit **celui de l'URL demandée ou un de ses sous-domaines**. Or :

1. Pour Bali, les papiers viennent de la recherche en direct (`/api/formalities`, `applyBaliTable` dans `lib/formalities.ts`) : le papier `evoa` garde l'`official_url` **trouvée en direct**, pas celle de la table (`https://evisa.imigrasi.go.id/web/visa-selection`). Si elle est sur un autre hôte du domaine (`molina.imigrasi.go.id`, l'ancienne adresse de l'e-VOA, ou `www.imigrasi.go.id`, ou la page d'accueil du domaine substituée par `checkOfficialLink` quand le lien ne répond pas), l'onglet `evisa.imigrasi.go.id` de l'agent n'était pas reconnu et un onglet neuf s'ouvrait sur cette URL.
2. Même sur le bon hôte, deux onglets du site étaient départagés par « la page exacte d'abord » : un onglet resté sur la page de départ passait devant l'onglet où l'agent avait avancé dans le formulaire.

Le panneau lui-même ne navigue jamais : `showOfficialSite` ouvre un onglet neuf (`window.open`) seulement hors du panneau ou si l'extension ne répond pas ; `chrome.tabs.update` n'a jamais reçu d'URL. Les démarches étaient perdues parce que l'utilisateur se retrouvait sur un nouvel onglet, pas parce que l'ancien avait été rechargé.

## Règle désormais

Dans `extension/agent-state.js` (logique pure, testée) et `extension/panel.js` :

- **Même site** (`sameSite`) : même hôte, hôte avec ou sans `www`, autre sous-domaine du même domaine enregistré (`registeredDomain`, un label de plus sous `go.id`, `gov.uk`, `com.au`…). Les trois hôtes officiels connus (`evisa`, `allindonesia`, `lovebali`) restent trois sites distincts bien que deux partagent `imigrasi.go.id`. Pour Google, seule la section `/travel/flights` compte (jamais une recherche Google ni Google Hotels, jamais `consent.google.com`).
- **Choix de l'onglet** (`pickTab`) : tant qu'un onglet du site existe, on le ramène au premier plan, **jamais de nouvel onglet dans ce cas**. Ordre : l'onglet où l'agent a travaillé pour ce site, puis un onglet du site connu du papier (`paperSites`) ou du site exact demandé, puis tout onglet du même domaine enregistré ; à égalité, l'onglet utilisé le plus récemment (`lastAccessed`). La coche envoie maintenant le papier (`paper: visa | arrival_card | flights`) pour que le panneau sache, quand l'URL trouvée en direct est ailleurs sur `imigrasi.go.id`, s'il faut l'onglet du visa ou celui de la carte d'arrivée.
- **Mémoire de l'onglet de l'agent** : à chaque état `nami:agent-state` actif relayé par le panneau, l'extension note dans `chrome.storage.session` (`agentTabs`, par site) l'onglet où l'agent travaille (une page de ses sites, sinon l'onglet affiché ; le plus récent entre eux) et son URL. Un onglet qui a depuis changé de site n'est plus celui du papier.
- **Nouvel onglet** seulement quand aucun onglet du site n'existe plus (`result: "opened"`) ; la ligne d'état du panneau dit alors pendant 8 s « The visa tab was closed, I reopened the site » (ou carte d'arrivée, ou « The Google Flights tab was closed, I reopened it »), pour que l'utilisateur comprenne qu'il repart de la première page.
- L'URL d'un onglet existant n'est jamais modifiée (`chrome.tabs.update(id, { active: true })` seulement), vérifié par un test.

## Tests automatiques

- `extension/agent-state.test.ts` : domaine enregistré, clé de site, même site (page profonde, www, sous-domaine, autre site officiel, recherche Google, hôte sosie, http), choix de l'onglet (page profonde → focus sans ouverture ; www / sous-domaine / domaine nu ; onglet de l'agent mémorisé, même après un onglet plus récent ouvert à la main ; onglet de l'agent parti sur un autre site ; papier connu contre URL ailleurs sur le domaine ; aucun onglet → `null`), onglet de l'agent.
- `extension/panel.test.ts` : le même parcours depuis le message du panneau, mémoire par site pendant le visa puis la carte d'arrivée, aucune URL passée à `chrome.tabs.update`, résultat `opened` quand aucun onglet, absence de papier (dossier) et de `chrome.storage.session`.
- `lib/official-tab.test.ts` : le papier voyage dans `nami:focus-official` (coche et mise au premier plan au début de session).
- `components/panel/panel-screen.test.ts` : `StatusLine` affiche le message de réouverture, dans la couleur du papier, même sans session ; textes sans tiret.

## À vérifier au prochain passage réel

Après `chrome://extensions` → recharger l'extension Nami et rouvrir le panneau : parcours visa puis carte d'arrivée puis Vol ; cliquer Visa doit ramener l'onglet de l'étape 1 de l'e-VOA tel quel ; cliquer Flight l'onglet Google Flights ; fermer l'onglet du visa puis cliquer Visa doit ouvrir le site et afficher la ligne « The visa tab was closed, I reopened the site ».
