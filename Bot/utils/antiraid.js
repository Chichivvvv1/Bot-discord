import { logAction, updateReputation, applyAutoPunishment } from './moderation.js';
import { getConfig, setConfig } from './kv.js';

const joinBuckets = new Map();
const messageBuckets = new Map();
const raidStates = new Map();

function getBucket(map, guildId, windowMs) {
  const now = Date.now();
  let bucket = map.get(guildId);
  if (!bucket || now - bucket.reset > windowMs) {
    bucket = { count: 0, reset: now + windowMs, samples: [] };
    map.set(guildId, bucket);
  }
  return bucket;
}

export async function onMemberJoin(member, client) {
  const cfg = await getConfig(member.guild.id);
  if (!cfg.enabled) return;

  const levels = { off: Infinity, low: 20, medium: 10, high: 5 };
  const threshold = levels[cfg.antiRaidLevel] || levels.medium;
  const windowMs = 60000;
  const bucket = getBucket(joinBuckets, member.guild.id, windowMs);
  bucket.count++;
  bucket.samples.push({ id: member.id, at: Date.now() });
  bucket.samples = bucket.samples.filter(s => Date.now() - s.at < windowMs);

  if (bucket.count >= threshold) {
    await triggerRaidLock(member.guild, cfg, client);
    await applyAutoPunishment(member, cfg, 'Détection anti-raid', ['raid']);
    await updateReputation(member.guild.id, member.id, 'raid_join', -40);
  }

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86400000;
  if (accountAgeDays < 7) {
    await updateReputation(member.guild.id, member.id, 'new_account', -5);
  }
}

export async function onMessageCreate(message, client) {
  if (message.author.bot) return;
  const cfg = await getConfig(message.guild.id);
  if (!cfg.enabled) return;
  if (!cfg.autoMod) return;

  const bucket = getBucket(messageBuckets, message.guild.id, 10000);
  bucket.count++;

  const checks = (await import('./moderation.js')).isSuspiciousMessage(message.content, cfg);
  if (checks.length === 0) return;

  await message.delete().catch(() => null);

  const action = await applyAutoPunishment(message.member, cfg, `Auto-mod: ${checks.join(', ')}`, checks);
  await logAction(message.guild, cfg, {
    action: 'message_delete',
    targetId: message.author.id,
    targetTag: message.author.tag,
    moderatorId: client.user.id,
    moderatorTag: client.user.tag,
    reason: `Auto-mod: ${checks.join(', ')}${action ? ` -> ${action}` : ''}`,
  });

  if (checks.includes('token_leak')) {
    await updateReputation(message.guild.id, message.author.id, 'token_leak', -25);
  } else {
    await updateReputation(message.guild.id, message.author.id, 'auto_mod', -3);
  }
}

async function triggerRaidLock(guild, cfg, client) {
  if (raidStates.get(guild.id)) return;
  raidStates.set(guild.id, true);

  await logAction(guild, cfg, {
    action: 'antiraid',
    targetId: guild.id,
    targetTag: guild.name,
    moderatorId: client.user.id,
    moderatorTag: client.user.tag,
    reason: `Anti-raid niveau ${cfg.antiRaidLevel} déclenché`,
  });

  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased() && !channel.locked) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: 'Anti-raid lockdown' }).catch(() => null);
    }
  }

  setTimeout(async () => {
    raidStates.delete(guild.id);
    for (const channel of guild.channels.cache.values()) {
      if (channel.isTextBased()) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: 'Fin anti-raid' }).catch(() => null);
      }
    }
  }, 300000);
}

export async function lockServer(guild, cfg, client) {
  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: 'Lockdown manuel' }).catch(() => null);
    }
  }
  await logAction(guild, cfg, {
    action: 'lock',
    targetId: guild.id,
    targetTag: guild.name,
    moderatorId: client.user.id,
    moderatorTag: client.user.tag,
    reason: 'Lockdown manuel',
  });
}

export async function unlockServer(guild, cfg, client) {
  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: 'Fin lockdown' }).catch(() => null);
    }
  }
  await logAction(guild, cfg, {
    action: 'unlock',
    targetId: guild.id,
    targetTag: guild.name,
    moderatorId: client.user.id,
    moderatorTag: client.user.tag,
    reason: 'Fin lockdown',
  });
}
