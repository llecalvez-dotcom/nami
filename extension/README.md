# Extension Chrome Nami (ticket 08)

Nami vit dans le panneau latéral de Chrome, l'agent H clique dans l'onglet. L'extension n'a **aucune logique d'agent** : elle affiche l'écran épuré de Nami (`http://localhost:3000/panel` par défaut, ticket 14) dans une `iframe` plein cadre et rend ses gestes visibles dans les onglets officiels (ticket 13). Sans réglage visible : la session du navigateur local vient de `NAMI_LOCAL_SESSION_ID` dans le `.env.local` de Nami.

## Installation

À faire **dans le Chrome dédié de l'agent** (le profil à part de `holo local browser`), **jamais dans ton profil personnel**.

1. Lancer Nami en local, **sans** `NAMI_ACCESS_CODE` : `npm run dev` (voir plus bas, « Cookie d'accès »).
2. Dans le Chrome dédié, ouvrir `chrome://extensions`.
3. Activer le **mode développeur** (en haut à droite).
4. Cliquer sur **Load unpacked** et choisir le dossier `extension/` du dépôt.
5. Épingler l'extension Nami (icône puzzle), puis cliquer sur son icône : le panneau latéral s'ouvre sur Nami.

Après une modification d'un fichier de `extension/`, cliquer sur le bouton de rechargement de la carte Nami dans `chrome://extensions`, puis rouvrir le panneau.

## Options

Clic droit sur l'icône, **Options** :
- **Nami address** : l'adresse de Nami (par défaut `http://localhost:3000`), gardée dans `chrome.storage.local`. Rouvrir le panneau après l'enregistrement.
- **Allow the microphone** : voir plus bas.

## Fichiers

| Fichier | Rôle |
|---|---|
| `manifest.json` | Manifest V3 : panneau latéral `panel.html`, permissions `sidePanel`, `storage`, `tabs` |
| `background.js` | Clic sur l'icône = ouverture du panneau (`setPanelBehavior({ openPanelOnActionClick: true })`) |
| `panel.html`, `panel.js` | L'`iframe` vers Nami (`allow="microphone; autoplay"`) ; remet l'onglet du site officiel au premier plan quand Nami le demande |
| `options.html`, `options.js` | Adresse de Nami, autorisation du micro |
| `settings.js` | Adresse par défaut et lecture de l'adresse enregistrée |
| `agent-overlay.js` | Curseur, onde, contour du champ, cadre et bulle dans un Shadow DOM fermé, sans intercepter les gestes |

## Voir l'agent travailler (ticket 13)

Le script est injecté à `document_idle`, uniquement dans le cadre principal des trois hôtes HTTPS : `evisa.imigrasi.go.id`, `allindonesia.imigrasi.go.id` et `lovebali.baliprov.go.id`, issus de `lib/official-sites.ts`. Il suit seulement les événements réels (`isTrusted`) en capture : `pointermove`, `pointerdown`, `click`, `input`, `focusin`.

La flèche violette de 24 px glisse en 300 ms et disparaît après 1,5 s ; l'onde dure 400 ms et le contour du champ 800 ms. Le cadre de 3 px porte « Nami is filling this in ». La bulle de 320 px maximum reste en bas à gauche. Toute la couche, y compris ses enfants et pseudo-éléments, a `pointer-events: none`. Elle ne lit ni champs ni texte de la page : seulement les coordonnées des gestes et les dimensions de la cible. Aucun réseau, stockage ou journal dans la couche.

`useAgentRun` observe les changements du voyage et envoie au parent `{ type: "nami:agent-state", active, step }`, seulement dans une iframe. Le dernier texte d'Agent Activity est déjà masqué ; les secrets sont masqués à nouveau avant l'envoi. Aucun objet passeport ni résultat brut n'est transmis. Le cadre s'éteint en attente d'une réponse, en pause et à la fin ; quitter le panneau envoie aussi l'état inactif.

`panel.js` n'accepte cet état que de l'iframe Nami et de son origine configurée, comme pour `nami:focus-official`. Il transmet le message aux seuls onglets HTTPS des trois hôtes, via `chrome.tabs.sendMessage`, sans ouvrir ni activer d'onglet. La couche accepte uniquement les messages de l'extension et pose la bulle avec `textContent`, jamais du HTML.

Test manuel : recharger l'extension puis l'onglet officiel. Déplacer la souris, cliquer dans un champ et saisir du texte pour voir flèche, onde et contour. Depuis la console du panneau, envoyer un état fictif :

```js
const tabs = await chrome.tabs.query({ url: "https://evisa.imigrasi.go.id/*" });
await chrome.tabs.sendMessage(tabs[0].id, {
  type: "nami:agent-state", active: true, step: "Choosing FRANCE"
});
```

Vérifier le cadre et la bulle, puis envoyer `active: false`. Vérifier qu'un clic sur un élément situé sous la couche l'active toujours. Lancer le Chrome de l'agent avec `--force-device-scale-factor=1` sur écran Retina. Le passage réel de l'agent H sur les cinq menus et la vidéo de 20 s restent à faire avec le ticket 15 avant validation finale.

## « Open the official site »

Le bouton de la carte Agent Activity ne clique rien et ne remplit rien : c'est l'agent qui navigue. Dans le panneau, Nami envoie un `postMessage` (`nami:focus-official`) à `panel.js`, qui vérifie l'origine de Nami et l'adresse en `https`, puis met au premier plan l'onglet déjà ouvert sur ce domaine (ou un de ses sous-domaines). S'il n'y en a aucun, il en ouvre un. Hors du panneau, le bouton ouvre simplement le site dans un nouvel onglet. La permission `tabs` sert seulement à trouver cet onglet.

## Points vérifiés

- **Micro** : dans le panneau, le micro dépend de l'autorisation donnée à l'extension, pas à `localhost:3000`. Autoriser le micro une fois dans un onglet normal ne suffit pas. Ouvrir les options de l'extension, cliquer sur « Allow the microphone », accepter, puis rouvrir le panneau (vérifié dans Chrome 156 avec un micro simulé ; à confirmer avec le vrai micro du portable).
- **Cookie d'accès** : `nami_access` est `SameSite=Strict`, donc refusé dans l'`iframe` du panneau. En démo, Nami tourne en local sans `NAMI_ACCESS_CODE` : le contrôle d'accès est alors désactivé en développement. Le cookie n'est pas affaibli.
- **Stockage** : dans l'`iframe`, le `localStorage` de Nami est séparé de celui d'un onglet normal (stockage partitionné par l'extension). Les voyages créés dans un onglet n'apparaissent pas dans le panneau : faire tout le parcours de démo dans le panneau.
- **L'agent H et le panneau** : à vérifier au test réel avec Clément (l'agent doit piloter l'onglet et ignorer le panneau).
