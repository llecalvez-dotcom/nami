# Recadrage du samedi 19 h 30 : Nami épuré, le computer use qu'on voit

Décision de Nathan, samedi 7 novembre à 19 h 30, après 5 heures de tests réels de l'agent H sur l'e-VOA. Prime sur la note de recadrage de 15 h 40 (`2026-11-07-recadrage-computer-use.md`) pour tout ce qu'elle reprend. Tickets : 13, 14, 15, 16.

## 1. Pourquoi

- On est notés sur le computer use. Aujourd'hui, la démo montre surtout un site web avec des cartes ; l'agent travaille dans une autre fenêtre, sans qu'on voie ce qu'il fait.
- Le concept de départ : une extension qui converse à la voix, qui clique toute seule sous nos yeux, qui va chercher le passeport et la photo sur l'ordinateur. On l'a dispersé en écrans (Trip, World map, cartes, réglages).
- Nathan : « je veux une extension où on voit, comme quand j'utilise Claude in Chrome, la souris qui clique et qui se déplace ».

## 2. Le produit, en une phrase

Nami vit dans le panneau latéral de Chrome. On lui dit « je veux partir à Bali lundi » ; elle converse à la voix, trouve le passeport et la photo sur l'ordinateur, puis remplit le visa dans l'onglet d'à côté, où l'on voit le curseur se déplacer, cliquer et remplir chaque champ, jusqu'à l'écran de paiement, qu'elle laisse au voyageur.

```
┌──────────────────────────────────────┬──────────────────────┐
│ evisa.imigrasi.go.id                 │  Nami                │
│ ┌──────────────────────────────────┐ │                      │
│ │  (cadre lumineux : Nami pilote)  │ │  « Je veux partir    │
│ │                                  │ │    à Bali lundi »    │
│ │  Passport country  [FRANCE ▾]    │ │                      │
│ │                     ↖ curseur    │ │  J'ai trouvé ton     │
│ │  Purpose  [General, Family…]  ◉  │ │  passeport. C'est    │
│ │           (onde du clic)         │ │  bien toi ? [Oui]    │
│ │                                  │ │                      │
│ │  ┌ Je choisis le motif du ┐      │ │  Je remplis ton visa,│
│ │  └ voyage                 ┘      │ │  regarde à gauche.   │
│ └──────────────────────────────────┘ │                      │
│                                      │       ( 🎤 )         │
└──────────────────────────────────────┴──────────────────────┘
```

## 3. Le parcours de la démo (ce que voit le jury)

1. Chrome ouvert, panneau Nami à droite, un onglet vide à gauche. Un seul geste : le micro.
2. « I'm flying to Bali on Monday for a friend's wedding, landing at 2:30 pm. » Nami répond à voix haute ; une seule question si elle manque d'une information.
3. « For Bali you need an e-VOA. I need your passport: shall I look for it on this computer? » « Yes. » Elle montre le passeport trouvé, lu et contrôlé (MRZ) : « Is this you? » « Yes. » Même chose pour la photo d'identité.
4. « I'm filling in your e-VOA on the official site. Watch the left tab. » Dans l'onglet : cadre lumineux, curseur qui glisse vers chaque menu, onde à chaque clic, bulle « Choosing FRANCE », champs qui se remplissent, fichiers déposés.
5. Une question de l'agent arrive dans la conversation, lue à voix haute ; on répond à la voix.
6. L'agent s'arrête sur l'écran de paiement : « Your e-VOA is ready. Check it and pay: I never click Pay. »

Durée visée du passage de l'agent : moins de 5 minutes. Si c'est plus long que le créneau du jury, mode démo préparé (session lancée avant, on reprend en direct à l'étape 4).

## 4. Ce qu'on garde, ce qu'on ajoute, ce qu'on coupe

| Garder (construit) | Ajouter | Couper de la démo (le code reste) |
|---|---|---|
| Voix : Gladia, lecture à voix haute, réponses à la voix | Couche visuelle dans l'onglet de l'agent : curseur, onde, cadre, bulle (ticket 13) | Écran Trip en deux colonnes, cartes des papiers |
| Compréhension de la phrase, une question à la fois (`/api/trip/parse`, `lib/planner/`) | Écran épuré `/panel` : conversation et micro, rien d'autre (ticket 14) | World map, liste des voyages |
| Passeport trouvé, lu, contrôlé, confirmé (`/api/documents/*`) | Photo d'identité trouvée et déposée comme le passeport (ticket 16) | Réglages de démo visibles (session locale, chemins de fichiers) |
| Agent H, `pick_option`, `upload_file`, arrêt dur au paiement, vérification avant lancement | Chrome de l'agent à densité 1 et chemin des menus dans la consigne (ticket 15) | Aperçu de l'écran de l'agent dans Nami : l'onglet est visible à côté |
| Extension, panneau latéral (`extension/`) | | |

Les routes serveur et le moteur ne changent pas : on reconstruit la surface, pas les briques.

## 5. Le fait qui débloque tout (mesuré samedi 19 h)

Sur un écran Retina (densité 2), l'agent H calcule ses clics sur une capture deux fois plus grande que la page : chaque clic arrive à des coordonnées doublées (bouton vers (295, 776), clic reçu en (583, 1549), sur le fond de la page). C'était la vraie cause des menus Select2 « qui ne s'ouvrent pas » et du bouton « Detail & Apply » « qui ne répond pas » ; le diagnostic « Select2 n'ouvre que sur mousedown » de 18 h était faux.

Correctif : lancer le Chrome de l'agent avec `--force-device-scale-factor=1`. Résultat mesuré à 19 h 05 : l'agent ouvre le menu du pays d'un vrai clic, tape FRANCE, choisit l'option, remplit les 4 autres menus, ouvre « Detail & Apply », clique « Apply » et atteint l'étape 1 du formulaire en 18 étapes, pour 0,04 $. Détail dans `docs/tests/2026-11-07-etat-reel.md`.

## 6. Comment rendre les clics visibles (ticket 13)

Les gestes de l'agent arrivent dans la page comme de vrais événements de souris (`isTrusted: true`, position exacte, élément visé : mesuré samedi 19 h avec un journal des clics posé dans la page). Un script de l'extension, injecté dans l'onglet du site officiel, les écoute et dessine par-dessus, sans jamais intercepter un clic (`pointer-events: none`). Nami envoie au panneau le texte de chaque étape ; le panneau le relaie à l'onglet pour la bulle.

```
Agent H ──(clics réels)──▶ onglet officiel ──▶ agent-overlay.js : curseur, onde, cadre, bulle
Nami (iframe du panneau) ──postMessage──▶ panel.js ──chrome.tabs.sendMessage──▶ agent-overlay.js
```

## 7. Répartition et calendrier

| Ticket | Qui | Quoi |
|---|---|---|
| 13 | Léon | Couche visuelle dans l'onglet de l'agent |
| 14 | Nathan | Écran épuré `/panel` : conversation, micro, agent dans la conversation |
| 15 | Clément | Passage complet de l'agent sur l'e-VOA jusqu'au paiement, 3 fois sur 3 |
| 16 | Ali | Photo d'identité, bon champ du passeport, scan lisible par le site |
| | Claude | Relecture et test de chaque PR (tests, lint, compilation, fusion simulée), banc de test sur le Mac de Nathan |

- 20 h : tickets lancés sur Devin.
- 22 h : vidéo de secours de ce qui tourne déjà (au minimum : l'agent qui remplit les menus et atteint le formulaire).
- Minuit : premier passage complet dans l'extension.
- Dimanche matin : 3 passages, répétitions.
- Dimanche 11 h : gel du code. 14 h : rendu.

## 8. Risques

| Risque | Parade |
|---|---|
| La couche visuelle gêne l'agent : il voit le curseur et la bulle sur ses captures | Curseur petit et effacé après 1,5 s ; bulle dans un coin bas, jamais sur un champ ; critère du ticket 13 : passage de l'agent sans régression avec la couche active |
| Le site officiel refuse l'image du passeport (« Unable to read several fields from your passport », vu samedi 19 h 10 avec une photo prise au téléphone) | Scan à plat, net, bien éclairé (ticket 16) ; ce refus vient du site, il toucherait n'importe quel agent |
| Étapes du formulaire après l'étape 1 jamais vues | Ticket 15 : relevé de chaque étape au premier passage, consigne ajustée |
| Le pont `holo local browser` s'arrête à chaque fin de session | Boucle de relance (`scripts/lancer-demo.sh`) |
| Écran Retina | `--force-device-scale-factor=1` dans `scripts/lancer-demo.sh` (ticket 15) |
| Lenteurs du modèle texte de H (compréhension en 20 s puis abandon, vu samedi 19 h) | Réessai automatique une fois ; en démo, phrase déjà comprise dans la session préparée |

## 9. Ce qu'on ne fait pas

Vols, hôtel, autres pays que Bali, validation page par page (`confirm_page`), agent de l'ordinateur entier (`holo-desktop`). Tout ça reste dans les tickets d'origine, pour après le hackathon.
