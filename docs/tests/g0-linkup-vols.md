# Test G0 : Linkup peut-il trouver des vols réels ?

- **Date** : 7 nov. 2026, vers 23 h 40 (Paris). Lancé par Devin pour Clément (module Vol, ticket 18), avec la vraie clé `LINKUP_API_KEY`.
- **Question** : avant de choisir l'architecture du module Vol, savoir si Linkup renvoie de vrais vols (prix, compagnie, escales, durée) pour des dates précises, comme le proposait l'idée de départ (Linkup cherche sur les comparateurs, Nami classe, l'agent H ouvre la page).
- **Requête** : « Vols aller-retour Paris (CDG ou ORY) vers Bali Denpasar (DPS), départ le 23 novembre 2026, retour le 3 décembre 2026, 1 adulte », sortie structurée (`airline`, `price_eur`, `stops`, `duration_hours`, `booking_url`, `data_is_live`, `caveats`), `includeSources`.
- **Trois variantes** : (1) `includeDomains` limité aux comparateurs (google.com, skyscanner, kayak, momondo), `standard` ; (2) sans restriction de domaine, `standard` ; (3) sans restriction, `deep`.

## Résultat : pas pertinent pour les vols

| Variante | Durée | Vols renvoyés | `data_is_live` | Ce que Linkup dit lui-même |
|---|---|---|---|---|
| 1, comparateurs | 3,7 s | 1 (« Transavia France + Scoot », 646 €, escales 0, durée 0) | `false` | « le nombre exact d'escales et les durées ne sont pas précisés ; aucun tarif pour CDG » |
| 2, libre | 4,1 s | 1 (le même, escales et durée à -1) | `false` | « les résultats signalant une absence de vols en novembre 2026 contredisent les offres datées » |
| 3, libre, deep | 22,2 s | 0 | `false` | « Aucun résultat ne donne d'itinéraire réservable ni de tarif pour les dates exactes. Skyscanner indique qu'aucun vol n'est affiché pour novembre 2026 » |

Sources lues : pages SEO statiques des comparateurs (`skyscanner.fr/itineraires/ory/dps/...`, `kayak.fr/vols/Paris-PAR/Bali-IDBA`, `momondo.fr/vols/paris/bali`), blogs et agences (monde-du-voyage, ohana-agency, partirou, algofly). Aucune page de résultats de recherche : elles sont rendues en JavaScript à la demande et ne sont pas indexées.

## Conclusion

Linkup voit « à partir de 646 € » sur une page d'accroche, pas une liste de vols. Il ne peut pas donner la compagnie, la durée ni les escales, ni un lien réservable. L'utiliser pour les vols obligerait à présenter des chiffres approximatifs comme trouvés sur un comparateur, ce que la règle « aucun résultat inventé » interdit.

**Décision (Clément, 7 nov. 23 h 45)** : le module Vol se fait entièrement en computer use. L'agent H ouvre Google Flights pré-rempli dans le Chrome de l'agent, Nami lit les vrais résultats, l'utilisateur choisit son critère à la voix ou au clic, l'agent ouvre le vol choisi et s'arrête avant toute réservation. Voir `docs/tickets/18-module-vol.md`.

Linkup garde un rôle possible pour des informations stables (aéroport de Bali, bagages inclus selon la compagnie), jamais pour les prix.
