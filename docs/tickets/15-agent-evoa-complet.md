# Ticket 15 : l'agent remplit l'e-VOA jusqu'à l'écran de paiement, 3 fois sur 3

Responsable humain : **Clément** (lance Devin, relit la PR, fait les 3 passages réels).
Branche : `feat/15-agent-evoa-complet` depuis `main`. Une PR.

Lis d'abord `docs/specs/2026-11-07-nami-epure.md` (sections 5 et 8), `docs/tests/2026-11-07-etat-reel.md` (section « Passages de 18 h à 19 h 30 »), `scripts/lancer-demo.sh`, `lib/bali-papers.ts`, `lib/agent-task.ts`, `lib/paper-agent.ts`, `lib/local-chrome.ts`.

## Pourquoi

Samedi 19 h, une fois le Chrome de l'agent passé en densité 1, l'agent H a atteint seul l'étape 1 du formulaire (18 étapes, 0,04 $). Personne n'a encore vu les étapes suivantes. C'est le cœur de la démo.

## Ce qu'il faut faire

1. **Densité 1** : dans `scripts/lancer-demo.sh`, ajouter `--force-device-scale-factor=1` aux options du Chrome de l'agent, avec un commentaire : « Retina: without it, H's clicks land at twice their coordinates (measured on 2026-11-07). » Si le script réutilise un Chrome déjà lancé, vérifier sa densité par CDP (`Runtime.evaluate` de `devicePixelRatio`) et s'arrêter avec un message clair si elle n'est pas 1.
2. **Chemin des menus** dans la consigne (vérifié à la main samedi 19 h) :
   - `lib/bali-papers.ts` : champ optionnel `route_hint?: string` dans `BaliPaper`, rempli pour `evoa` :
     « The e-VOA is applied for on this visa selection page: do not look for another page or site. Pick, in this order: the passport country (for example FRANCE), then General, Family, or Social, then Tourism, Family Visit, and Transit, then B1 - Tourist (Visa On Arrival). The length of stay (30 Days) fills itself. Then click Detail & Apply: a window with the visa conditions opens; click Apply in it to reach the application form. »
   - `lib/agent-task.ts` : `routeHint?: string` dans `PaperTaskInput`, ajouté à la tâche juste après la première ligne ; `lib/paper-agent.ts` le transmet (`routeHint: paper.route_hint`).
   - Sans ce chemin, au passage de 18 h 40, l'agent a cru que la page n'était pas l'e-VOA et il est parti sur un autre site.
3. **`pick_option` dit ce qui existe** : quand aucune option ne correspond, `lib/local-chrome.ts` renvoie la liste des options du menu visé (30 au plus) : « No list has an option matching X. Options of selectParentActivity: … Call pick_option again with the closest one. » (au passage de 18 h 40, « Tourism » n'existait pas, et l'agent ne le savait pas). Intégrer aussi la PR #45 si elle est fusionnée avant.
4. **Session du navigateur local sans saisie** : `/api/papers/start` utilise `NAMI_LOCAL_SESSION_ID` (nouvelle variable serveur, dans `.env.example`) quand le navigateur n'en envoie pas. `scripts/lancer-demo.sh` affiche la ligne à mettre dans `.env.local`. Nécessaire pour le ticket 14 (aucun réglage visible).
5. **Relevé du formulaire** : au premier passage réel, noter dans `docs/tests/f1-evoa.md` chaque étape après l'étape 1 (titre, champs, boutons, ce qui a bloqué), sans aucune donnée du passeport. Ajuster la consigne (`route_hint` ou `stop_condition`) avec ce qui manque.
6. **Arrêt** : vérifier que l'agent s'arrête sur l'écran de résumé ou de paiement et que `report_ready` arrête la session (PR #38). Jamais « Submit », « Pay », « Bayar », « Kirim ».

## Tests

- vitest : `route_hint` présent dans la tâche de l'e-VOA ; message de `pick_option` sans correspondance avec la liste des options ; `NAMI_LOCAL_SESSION_ID` utilisé quand le corps n'a pas de session, refusé s'il est mal formé.
- **3 passages réels** sur un portable, Chrome de l'agent en densité 1, avec le scan du passeport du ticket 16 : écran de paiement atteint sans aide humaine, 3 fois sur 3. Une fois, « Stop » au milieu du passage. Durée et coût de chaque passage dans `docs/tests/f1-evoa.md`.

## Critère de fin

`npm test`, `npm run lint`, `npm run build` passent ; 3 passages sur 3 jusqu'à l'écran de paiement, notés dans `docs/tests/f1-evoa.md`.
