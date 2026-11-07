# Ticket 08 : extension Chrome, Nami dans le panneau latéral

Responsable humain : **Léon** (lance Devin, relit la PR, teste dans le Chrome dédié).
Prérequis : `main` à jour.
Branche : `feat/08-extension`, PR vers `main`.

Lis d'abord `docs/specs/2026-11-07-recadrage-computer-use.md` (sections 2 à 4).

## But

Une seule fenêtre Chrome pendant la démo : l'agent H clique dans l'onglet, Nami (conversation, voix, étapes de l'agent, « Stop agent ») vit dans le panneau latéral. L'extension ne contient **aucune logique d'agent** : elle affiche Nami, c'est tout. Les clics restent faits par l'agent H.

## À faire

1. Dossier `extension/` à la racine (Manifest V3), hors de la compilation Next :
   - `manifest.json` : `name` « Nami », `side_panel.default_path` `panel.html`, permission `sidePanel`, icône simple ; clic sur l'icône = ouverture du panneau (`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` dans un `background.js`).
   - `panel.html` : une `iframe` plein cadre vers l'adresse de Nami (par défaut `http://localhost:3000`), avec `allow="microphone; autoplay"`.
   - `options.html` : champ pour changer l'adresse de Nami, gardée dans `chrome.storage.local`.
2. Côté Nami : une mise en page étroite propre (largeur de 360 à 480 px) pour l'accueil, l'écran Trip et la carte de l'agent, sans défilement horizontal. Le globe peut être masqué en largeur étroite.
3. Bouton « Open the official site » dans la carte de l'agent : n'ouvre rien lui-même, c'est l'agent qui navigue ; il sert à remettre l'onglet de l'agent au premier plan (`window.open` sur l'adresse officielle si aucun onglet ne l'a).
4. `extension/README.md` : installation par `chrome://extensions`, mode développeur, « Load unpacked », dans le **Chrome dédié** de l'agent (profil à part, celui de `holo local browser`), jamais dans le profil personnel.

## Points à vérifier et à écrire dans la PR

- **Micro** dans l'iframe du panneau : `getUserMedia` marche-t-il ? Sinon, ouvrir une fois `http://localhost:3000` dans un onglet pour accorder le micro, puis réessayer ; dire ce qui marche.
- **Cookie d'accès** : le cookie `nami_access` est `SameSite=Strict`, donc refusé dans une iframe d'extension. En démo, Nami tourne en local **sans** `NAMI_ACCESS_CODE` (le contrôle d'accès est alors désactivé en développement). Ne pas affaiblir le cookie.
- **Stockage** : dans l'iframe, `localStorage` est séparé de celui d'un onglet normal. Le parcours de démo se fait entièrement dans le panneau.
- **L'agent H et le panneau** : vérifier, au test réel avec Clément, que l'agent pilote bien l'onglet et ignore le panneau.

## Critère de fin

`npm test`, `npm run lint` et `npm run build` passent ; l'extension se charge sans erreur ; parcours de l'accueil jusqu'au dossier dans le panneau, à la souris et à la voix ; capture d'écran du panneau à côté d'un onglet dans la PR.
