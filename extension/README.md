# Extension Chrome Nami (ticket 08)

Nami vit dans le panneau latéral de Chrome, l'agent H clique dans l'onglet. L'extension n'a **aucune logique d'agent** : elle affiche Nami (`http://localhost:3000` par défaut) dans une `iframe` plein cadre, c'est tout.

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

## « Open the official site »

Le bouton de la carte Agent Activity ne clique rien et ne remplit rien : c'est l'agent qui navigue. Dans le panneau, Nami envoie un `postMessage` (`nami:focus-official`) à `panel.js`, qui vérifie l'origine de Nami et l'adresse en `https`, puis met au premier plan l'onglet déjà ouvert sur ce domaine (ou un de ses sous-domaines). S'il n'y en a aucun, il en ouvre un. Hors du panneau, le bouton ouvre simplement le site dans un nouvel onglet. La permission `tabs` sert seulement à trouver cet onglet.

## Points vérifiés

- **Micro** : dans le panneau, le micro dépend de l'autorisation donnée à l'extension, pas à `localhost:3000`. Autoriser le micro une fois dans un onglet normal ne suffit pas. Ouvrir les options de l'extension, cliquer sur « Allow the microphone », accepter, puis rouvrir le panneau (vérifié dans Chrome 156 avec un micro simulé ; à confirmer avec le vrai micro du portable).
- **Cookie d'accès** : `nami_access` est `SameSite=Strict`, donc refusé dans l'`iframe` du panneau. En démo, Nami tourne en local sans `NAMI_ACCESS_CODE` : le contrôle d'accès est alors désactivé en développement. Le cookie n'est pas affaibli.
- **Stockage** : dans l'`iframe`, le `localStorage` de Nami est séparé de celui d'un onglet normal (stockage partitionné par l'extension). Les voyages créés dans un onglet n'apparaissent pas dans le panneau : faire tout le parcours de démo dans le panneau.
- **L'agent H et le panneau** : à vérifier au test réel avec Clément (l'agent doit piloter l'onglet et ignorer le panneau).
