# Ticket 13 : voir l'agent travailler dans l'onglet (curseur, onde, cadre, bulle)

Responsable humain : **Léon** (lance Devin, relit la PR, teste dans le Chrome de l'agent).
Branche : `feat/13-couche-visuelle` depuis `main`. Une PR.

Lis d'abord `docs/specs/2026-11-07-nami-epure.md` (sections 2, 3 et 6), `extension/README.md`, `extension/manifest.json`, `extension/panel.js`, `components/trip/use-agent-run.ts`, `lib/official-sites.ts`.

## Pourquoi

On est notés sur le computer use, et aujourd'hui on ne voit rien : l'agent H clique dans l'onglet sans curseur ni trace. Nathan veut voir, comme avec Claude in Chrome, un curseur qui se déplace et qui clique, sous les yeux du jury.

Fait mesuré samedi 19 h : les gestes de l'agent H arrivent dans la page comme de vrais événements (`pointerdown`, `mousedown`, `mouseup`, `click`, avec `isTrusted: true`, `clientX`, `clientY` exacts et l'élément visé). Une couche dessinée par-dessus la page peut donc les suivre sans rien changer à l'agent.

## Ce qu'il faut construire

### 1. `extension/agent-overlay.js` (script injecté dans l'onglet du site officiel)

- Déclaré dans `manifest.json` en `content_scripts`, `run_at: "document_idle"`, `all_frames: false`, sur les sites officiels de `lib/official-sites.ts` (`https://evisa.imigrasi.go.id/*`, `https://allindonesia.imigrasi.go.id/*`, `https://lovebali.baliprov.go.id/*`).
- Tout est dessiné dans un hôte unique avec un **Shadow DOM fermé** (`attachShadow({ mode: "closed" })`), en `position: fixed`, `z-index: 2147483647`, **`pointer-events: none` sur tout** : la couche ne doit jamais recevoir un clic, sinon l'agent cliquerait dessus.
- Écoute en phase de capture sur `document` : `pointermove`, `pointerdown`, `click`, `input`, `focusin`. Ne garde que `event.isTrusted`.
- **Curseur** : une flèche SVG (24 px) à la position du dernier `pointermove` ou `pointerdown`, déplacée par transition CSS (`transform`, 300 ms, `ease-out`), pour qu'on la voie glisser d'un point à l'autre. Si aucun `pointermove` n'arrive avant un clic, elle glisse quand même depuis sa position précédente. Effacée en fondu 1,5 s après le dernier geste.
- **Onde** : un cercle qui s'agrandit et s'efface (400 ms) au point de chaque `pointerdown`.
- **Champ rempli** : sur `input` ou `focusin`, un contour lumineux de 2 px autour de l'élément visé, 800 ms.
- **Cadre** : une bordure lumineuse de 3 px autour de la fenêtre tant que l'agent pilote (état reçu du panneau, point 3), avec une étiquette « Nami is filling this in » en haut au centre.
- **Bulle** : en bas à gauche, 320 px de large au plus, le texte de la dernière étape reçue du panneau (« Choosing FRANCE »). Jamais au centre de la page.
- Couleurs : l'accent violet de Nami (voir `app/globals.css`). Aucune police chargée depuis l'extérieur.
- Aucun envoi réseau, aucun stockage, aucun journal : le script ne lit rien de la page hormis les positions et la taille de l'élément visé.

### 2. Nami envoie l'état de l'agent au panneau

Dans `components/trip/use-agent-run.ts` (ou là où les étapes de l'agent sont ajoutées à `agent_steps`) : quand Nami tourne dans le panneau (`window.parent !== window`), envoyer `window.parent.postMessage({ type: "nami:agent-state", active, step }, "*")` à chaque nouvelle étape et à chaque changement d'état (lancé, en attente d'une réponse, arrêté, fini). `step` est le texte affiché dans Agent Activity, sans aucune donnée du passeport (les `secrets` sont déjà masqués).

### 3. Le panneau relaie à l'onglet

Dans `extension/panel.js` : accepter `nami:agent-state` seulement depuis l'iframe de Nami et son origine (même contrôle que `nami:focus-official`), puis `chrome.tabs.sendMessage` vers les onglets dont l'hôte est un site officiel. `agent-overlay.js` l'écoute avec `chrome.runtime.onMessage` et met à jour le cadre et la bulle (texte posé par `textContent`, jamais `innerHTML`).

### 4. Ne pas gêner l'agent

L'agent H voit la page en captures d'écran : il verra aussi la couche. Curseur petit et effacé vite, bulle dans un coin bas, cadre sur le bord seulement. Si un passage montre que l'agent confond le curseur ou la bulle avec la page, réduire encore (bulle masquée pendant les 2 s qui suivent un geste, par exemple).

## Tests

- Test manuel sans agent : ouvrir l'e-VOA dans le Chrome de l'agent avec l'extension, cliquer à la souris : curseur, onde, contour sur un champ. Dans la console du panneau, envoyer un faux `nami:agent-state` : cadre et bulle apparaissent.
- Test réel : un passage de l'agent H (ticket 15) avec la couche active. Critère : l'agent remplit les 5 menus et atteint le formulaire comme sans la couche, et on voit le curseur aller sur chaque menu.
- Vidéo de 20 s du passage, jointe à la PR.

## Critère de fin

`npm test`, `npm run lint`, `npm run build` passent ; aucun clic intercepté par la couche ; passage réel sans régression ; vidéo dans la PR.
