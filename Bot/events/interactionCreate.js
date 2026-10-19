export const name = 'interactionCreate';

export async function execute(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Erreur commande ${interaction.commandName}:`, err);
    const reply = { content: '❌ Une erreur est survenue.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(reply).catch(() => null);
    } else {
      await interaction.reply(reply).catch(() => null);
    }
  }
}
