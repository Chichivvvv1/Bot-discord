# Sentinel Guard — Bot Discord Modération

Bot de modération Discord ultra-sophistiqué avec auto-modération, anti-raid, quarantaine, réputation et logs.

## Fonctionnalités

- 🛡️ **Anti-raid intelligent** : détecte les vagues de joins et verrouille automatiquement
- 🤖 **Auto-modération** : invites, liens, mention spam, caps, zalgo, répétitions, fuites de tokens
- 🚫 **Système de quarantaine** : isole les utilisateurs sans les bannir
- ⭐ **Score de réputation** : actions automatiques selon le comportement
- 📋 **Logs immuables** : stockés dans Cloudflare KV
- 🔒 **Lockdown / slowmode**
- 👮 Commandes slash : `/setup`, `/warn`, `/mute`, `/kick`, `/ban`, `/quarantine`, `/unquarantine`, `/lock`, `/unlock`, `/slowmode`, `/antiraid`, `/reputation`, `/logs`, `/settings`

## Pré-requis

1. Créer une application Discord sur https://discord.com/developers/applications
2. Activer ces **Privileged Gateway Intents** :
   - Server Members Intent
   - Message Content Intent
3. Générer un token de bot et récupérer l'Application ID
4. Créer un namespace Cloudflare KV et générer un API token avec permission `Cloudflare KV: Edit`

## Déploiement Render

1. Uploadez tous les fichiers sur Render (Web Service)
2. Sélectionnez **Node** comme runtime
3. Définissez les variables d'environnement dans le dashboard Render
4. La commande de démarrage est automatiquement `npm start`

Render installera automatiquement `discord.js` grâce au `package.json`.

> ℹ️ Un bot Discord avancé nécessite obligatoirement une librairie réseau. Le `package.json` ne contient qu'une seule dépendance (`discord.js`). Vous n'avez rien à installer localement.

## Configuration in-game

Sur votre serveur Discord, exécutez :
```
/setup mod_role:@Modérateur log_channel:#logs quarantine_role:@Quarantaine
```

Puis réglez l'anti-raid :
```
/antiraid level:high
```
