export const name = 'guildMemberAdd';

export async function execute(member, client) {
  const { onMemberJoin } = await import('../utils/antiraid.js');
  await onMemberJoin(member, client);
}
