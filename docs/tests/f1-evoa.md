# Test F1 : l'agent H remplit l'e-VOA de Bali jusqu'à l'écran de paiement (ticket 15)

Gabarit à remplir par Clément sur son portable (Chrome local de l'agent lancé par `scripts/lancer-demo.sh`, densité 1, pont `holo local browser`), avec le scan du passeport du ticket 16. **Aucun résultat n'est encore noté : rien n'a été mesuré dans ce fichier.**

Critère de fin du ticket 15 : écran de résumé ou de paiement atteint sans aide humaine, 3 passages sur 3 ; un passage arrêté par « Stop » en cours de route. L'agent ne clique jamais sur « Submit », « Pay », « Bayar », « Kirim ».

Ne jamais noter ici une donnée du passeport (nom, numéro, dates) ni une clé.

## Passages

| Passage | Date et heure | Étapes du formulaire relevées | Blocage | Durée | Coût | Arrêt au paiement (oui/non) | « Stop » testé |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

## Relevé du formulaire (premier passage)

Une ligne par étape après l'étape 1 : titre, champs, boutons, ce qui a bloqué. Sans aucune donnée du passeport.

| Étape | Titre | Champs | Boutons | Ce qui a bloqué |
|---|---|---|---|---|
| | | | | |

## Ajustements de la consigne

Ce qui manquait à l'agent, et ce qui a été changé dans `route_hint` ou `stop_condition` (`lib/bali-papers.ts`).
