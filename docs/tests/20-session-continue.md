# Ticket 20 : une session H pour tout le voyage, spike et mesures

Question : une session H ouverte avec `idle_timeout_s` peut-elle recevoir une deuxième tâche par `POST /sessions/{id}/messages` tout en gardant le navigateur du pont local (`holo local browser`), et combien de temps sépare la fin d'une tâche du premier pas de la suivante ?

Pourquoi : aujourd'hui visa, carte d'arrivée, vol et hôtel ouvrent chacun une session H ; chaque nouvelle session passe par une relance du pont et une attente `CHANNEL_REST_MS` de 35 s (jusqu'à 55 s mesurés, `2026-11-08-mesure-vitesse-visa.md`), alors que H lui-même met 2 à 3 s par pas.

## Ce que dit H (SDK `hai_agents` 1.4.3, lu le 8 novembre)

- `idle_timeout_s` à la création : « after each answer the session goes `idle` and waits that long for your next message, carrying its full context and browser state across turns ».
- `POST /api/v2/sessions/{id}/messages` avec `{ "type": "user_message", "message": "..." }` (ou un lot `{ "type": "batch", "messages": [...] }`) : « redirects the agent on its next step and wakes an `idle` session ».
- Statut `idle` dans `TrajectoryStatus`, en plus de `running`, `completed`, `failed`, `timed_out`, `interrupted`.
- Les outils et les `instructions` de l'agent sont fixés à la création : la session du voyage porte donc l'union des outils (papiers, vol, hôtel) et chaque message réécrit toutes les règles de sa tâche.

## Le spike : `scripts/session-continue.mjs`

```
HAI_API_KEY=... NAMI_LOCAL_SESSION_ID=<id du pont> node scripts/session-continue.mjs <label>
```

1. Crée une session (`idle_timeout_s` 600) dont la première tâche ouvre `about:blank`, puis l'accueil de l'e-VOA, puis appelle `report_ready`.
2. Répond à `report_ready`, attend que la session soit `idle`.
3. Envoie une deuxième tâche par message : ouvrir Google Flights, appeler `report_ready`.
4. Note l'heure du premier événement et du premier pas de la deuxième tâche, si elle a bien le navigateur (événements de navigation), et si elle atteint `report_ready`.
5. Supprime la session, écrit `~/nami-runs/session-continue-<label>.json`.

Les deux tâches n'ouvrent que des pages publiques et ne remplissent rien.

## Résultat du spike

À remplir au premier passage sur un banc (Chrome de l'agent sur 9333, pont `holo local browser` attaché, clé H). Colonnes attendues (le JSON les donne) :

| Passage | Statut après la tâche 1 | Message accepté | Tâche 2 a le navigateur | Écart fin tâche 1 → premier pas tâche 2 | Tâche 2 jusqu'à `report_ready` |
|---|---|---|---|---|---|
| | | | | | |

Si la tâche 2 n'a pas le navigateur (le pont a reçu `destroy` à la fin de la tâche 1, ou le message est refusé) : la continuation n'est pas utilisable avec le pont local, la partie A reste derrière `NAMI_H_SESSION_MODE=per_task` et la PR le dit.

## Mesures du parcours (partie A, mode `single`)

Parcours visa, carte d'arrivée, vol à la voix, JSON de temps des scripts `passage-*.mjs`. Attendu : moins de 5 s entre la fin d'une tâche et le premier pas de la suivante (contre 35 à 55 s), visa arrêté à l'étape 1, carte d'arrivée arrêtée avant Submit, vol jusqu'à la page de réservation, rien d'envoyé ni payé.

| Passage | Fin visa → premier pas carte | Fin carte → premier pas vol | Arrêts respectés | Remarques |
|---|---|---|---|---|
| | | | | |

## Partie B : trois modes

Même parcours en voix seule, en saisie seule (interrupteur Voix / Saisie sur Saisie, micro jamais ouvert seul), en clics seuls. Attendu : même résultat dans les trois.

| Mode | Résultat | Remarques |
|---|---|---|
| Voix seule | | |
| Saisie seule | | |
| Clics seuls | | |
