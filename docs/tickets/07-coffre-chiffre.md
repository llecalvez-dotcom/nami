# Ticket 07 : coffre chiffré réutilisable (chantier séparé, non commencé)

**Statut : à cadrer, aucun code.** Ce ticket décrit un chantier distinct du ticket 03. Il ne change rien à l'app actuelle, où les champs du passeport restent dans la mémoire de la page et ne sont jamais enregistrés.

## But
Permettre à un voyageur de garder ses documents (passeport, photo) et ses champs pour un prochain voyage, sans les ressaisir, et sans que Nami ni un autre utilisateur puisse les lire.

## Questions à trancher avant tout code
1. **Où vit le coffre** : seulement sur l'appareil (IndexedDB chiffré) ou aussi sur un serveur (synchronisation entre appareils). Le stockage sur l'appareil seul est plus simple et n'envoie rien.
2. **Gestion des clés** : clé dérivée d'une phrase secrète (Argon2id ou PBKDF2, sel par utilisateur) ou clé de l'appareil (WebAuthn / passkey avec l'extension PRF). La clé n'est jamais envoyée au serveur ni enregistrée en clair.
3. **Récupération** : une clé perdue veut dire un coffre perdu, sauf clé de récupération imprimée ou second appareil. À dire clairement à l'utilisateur.
4. **Isolation entre utilisateurs** : un coffre par compte, chiffré avec sa propre clé ; côté serveur (si serveur), contrôle d'accès par compte en plus du chiffrement ; jamais de clé commune.
5. **Suppression** : bouton « supprimer mes documents » qui efface le coffre et ses copies (appareil, serveur, sauvegardes), avec un délai annoncé ; suppression automatique après une durée sans usage.
6. **Envoi aux fournisseurs** : sortir un document du coffre pour H ou Claude reste un choix explicite à chaque fois (même règle que le ticket 03 : un seul fournisseur choisi, accord de l'utilisateur, aucun repli automatique).

## Hors champ de ce ticket
- Toute promesse de conformité RGPD : le chiffrement et le consentement ne suffisent pas à l'établir (base légale, durée de conservation, sous-traitants, droits des personnes, analyse d'impact à faire avec un juriste).
- Les vrais documents dans les sessions Devin partagées : celles-ci restent réservées aux données fictives.

## Tests prévus (une fois cadré)
- Chiffrement et déchiffrement avec une clé de test ; échec avec une mauvaise clé.
- Deux utilisateurs : l'un ne peut pas lire le coffre de l'autre.
- Suppression : plus rien après effacement (appareil, et serveur si serveur).
- Spécimen fictif uniquement.
