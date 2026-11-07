# Ticket 13 : couche visuelle

## Contrôle manuel, 7 novembre 2026

Chrome for Testing 156 séparé, profil `/tmp/chrome-t13`, extension chargée depuis le worktree `nami-t13`, CDP sur `127.0.0.1:9444`, `--force-device-scale-factor=1`. Ajout de `--no-first-run --no-default-browser-check --no-sandbox` pour ce banc Linux. Aucun changement du navigateur ni du serveur de démo sur le port 3000.

Site réel : `https://evisa.imigrasi.go.id/`, puis clic sur Sign In. Aucun compte utilisé, aucun formulaire envoyé. Pas de motif temporaire ajouté au manifest.

- Hôte injecté, `shadowRoot === null` (fermé), `pointer-events: none`, `devicePixelRatio === 1`.
- Faux état envoyé depuis le service worker de l'extension par `chrome.tabs.sendMessage` : cadre violet, étiquette et bulle « Choosing FRANCE » visibles.
- `Input.dispatchMouseEvent` : déplacement, pression et relâchement dans le champ e-mail. Événements `pointermove`, `pointerdown`, `focusin`, `click` avec `isTrusted: true`, cible `username`.
- `Input.insertText` : texte fictif `overlay-test`, événement `input` fiable, champ toujours actif et valeur reçue. Curseur, onde et contour lumineux visibles sur les captures.
- Clic sous la bulle : `document.elementFromPoint(40, innerHeight - 28)` retourne l'image du site, pas la couche. Le même élément reçoit le clic fiable : `Click-through at bubble position: true`.
- État inactif : cadre et bulle disparaissent, les effets des gestes restent jusqu'à leur expiration.

Captures locales, hors dépôt :

```text
/home/ubuntu/t13-shots/frame-bubble.png
/home/ubuntu/t13-shots/cursor-ripple-field.png
/home/ubuntu/t13-shots/input-highlight.png
/home/ubuntu/t13-shots/inactive.png
```

## Couverture automatisée

`lib/agent-overlay.test.ts` : message limité à type/active/step, dernier texte, absence de session, liste vide, secrets masqués, attente/pause/fin/erreur, publication uniquement en iframe.

`extension/panel.test.ts` : contrôle origine et fenêtre source, trois hôtes HTTPS exacts, exclusion d'un domaine trompeur, messages invalides, état inactif, texte borné et onglet sans récepteur.

## Reste à valider

Pas de passage réel de H, pas de vidéo de 20 s. Les cinq menus, l'absence de confusion visuelle par H et l'arrivée au formulaire restent à vérifier avec le ticket 15. Le contrôle manuel utilise un état fictif depuis l'extension, pas un parcours Nami complet. Le statut reste jaune jusqu'à ce passage.
