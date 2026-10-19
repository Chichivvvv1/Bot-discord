export const name = 'ready';
export const once = true;

export function execute(client) {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  console.log(`📡 Sur ${client.guilds.cache.size} serveurs`);

  client.user.setPresence({
    activities: [{ name: '/setup • Sentinel Guard', type: 3 }],
    status: 'online',
  });
}
