export const name = 'messageCreate';

export async function execute(message, client) {
  if (!message.guild || message.author.bot) return;
  const { onMessageCreate } = await import('../utils/antiraid.js');
  await onMessageCreate(message, client);
}
