import { Client, GatewayIntentBits, Events, Collection, REST, Routes } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== 'production') {
  try {
    const envConfig = await fs.readFile(path.join(__dirname, '.env'), 'utf8');
    const envLines = envConfig.split('\n').filter(Boolean);
    for (const line of envLines) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) {
        process.env[key.trim()] = rest.join('=').trim();
      }
    }
  } catch { /* pas de .env en local */ }
}

const requiredEnv = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Variable manquante: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
  ],
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.reputation = new Map();
client.recentJoins = new Map();
client.recentMessages = new Map();
client.lockedChannels = new Set();

async function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const files = await fs.readdir(commandsPath).catch(() => []);
  const slashCommands = [];
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const cmd = await import(path.join(commandsPath, file));
    client.commands.set(cmd.data.name, cmd);
    slashCommands.push(cmd.data.toJSON());
  }
  return slashCommands;
}

async function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  const files = await fs.readdir(eventsPath).catch(() => []);
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const evt = await import(path.join(eventsPath, file));
    if (evt.once) {
      client.once(evt.name, (...args) => evt.execute(...args, client));
    } else {
      client.on(evt.name, (...args) => evt.execute(...args, client));
    }
  }
}

async function registerCommands(commands) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
    console.log(`✅ ${commands.length} commandes slash enregistrées globalement`);
  } catch (err) {
    console.error('Erreur enregistrement commandes:', err.message);
  }
}

async function main() {
  const commands = await loadCommands();
  await loadEvents();
  await registerCommands(commands);
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
