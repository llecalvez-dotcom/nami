# Pont H et chromedriver mort : pourquoi « A step failed » en boucle (8 novembre 2026)

Constat sur le banc (Mac de Clément) : à la voix, la deuxième session H d'affilée (« Try again », carte d'arrivée juste après le visa, module Vol) échouait à chaque commande avec « A step failed », alors que le passage au script marchait.

Cause, lue dans la lib H (`hai_agents_local/bridge.py`, `hai_drivers/web/selenium/driver.py`) et dans les logs du pont :

1. Le pont `holo local browser` crée un seul chromedriver par processus (`_serve` : `self._driver = create_driver()` une fois) et le garde jusqu'à la fin du processus.
2. À la fin de chaque session H (report_ready, échec, Stop, abandon), H envoie au pont la commande `destroy` → `driver.destroy()` → `service.stop()` : le chromedriver est arrêté, mais l'objet reste dans le pont.
3. Le pont ne se termine (et la boucle de `scripts/lancer-demo.sh` ne le relance) que lorsque H répond 410 Gone sur le long-poll des commandes, 20 à 45 s plus tard.
4. Toute session créée dans cette fenêtre échoue sur chaque commande : `HTTPConnectionPool(host='localhost', port=55635): Max retries exceeded` (le port du chromedriver mort). Chaque session ratée renvoie un `destroy` et repousse la fenêtre.
5. Le script `passage-evoa.mjs` marche parce qu'il n'y a qu'une session par pont frais.

Correctif côté Nami seulement (`lib/local-bridge.ts`, banc uniquement : darwin ou linux, `NODE_ENV` différent de production, `NAMI_LOCAL_SESSION_ID` défini) : avant `createSession`, si le pont en cours est celui qui a déjà servi une session, Nami l'arrête (SIGTERM), attend un nouveau pid (20 s au plus), la ligne « Local web bridge serving session id » dans son log (`NAMI_BRIDGE_LOG`, sinon 4 s), puis `GET /json/version` du Chrome de l'agent. Après `createSession`, le pid courant est noté comme utilisé. Sans `pgrep`, sans pont trouvé ou hors banc : rien ne change, jamais d'erreur bloquante, une ligne de log serveur.

À vérifier au prochain passage réel : deux sessions d'affilée à la voix (visa puis carte d'arrivée) sans « A step failed », délai ajouté de 5 à 10 s entre le « oui » et le premier clic de l'agent.
