import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getConfig, addLog, getReputation, setReputation } from './kv.js';

export async function ensureLogChannel(guild, cfg) {
  if (!cfg.logChannelId) return null;
  return guild.channels.cache.get(cfg.logChannelId) || await guild.channels.fetch(cfg.logChannelId).catch(() => null);
}

export async function logAction(guild, cfg, { action, targetId, targetTag, moderatorId, moderatorTag, reason, duration }) {
  const channel = await ensureLogChannel(guild, cfg);
  const entry = {
    id: generateId(),
    action,
    targetId,
    targetTag,
    moderatorId,
    moderatorTag,
    reason,
    duration,
    timestamp: new Date().toISOString(),
  };
  await addLog(guild.id, entry);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ ${action.toUpperCase()}`)
    .setColor(actionColor(action))
    .addFields(
      { name: 'Utilisateur', value: `<@${targetId}> (${targetTag || targetId})`, inline: true },
      { name: 'Modérateur', value: `<@${moderatorId}> (${moderatorTag || moderatorId})`, inline: true },
      { name: 'Raison', value: reason || 'Non spécifiée', inline: false },
    )
    .setTimestamp();
  if (duration) embed.addFields({ name: 'Durée', value: formatDuration(duration), inline: true });
  await channel.send({ embeds: [embed] }).catch(() => null);
}

export async function updateReputation(guildId, userId, action, delta) {
  const rep = await getReputation(guildId, userId);
  rep.score = Math.max(0, Math.min(100, rep.score + delta));
  rep.history.push({ action, delta, at: new Date().toISOString() });
  if (rep.history.length > 50) rep.history.shift();
  await setReputation(guildId, userId, rep);
  return rep;
}

export function hasModPermission(member, cfg) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (cfg.modRoleId && member.roles.cache.has(cfg.modRoleId)) return true;
  return false;
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}j`;
}

export function parseDuration(input) {
  if (!input) return null;
  const match = input.match(/^(\d+)([smhdj])$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400, j: 86400 };
  return val * multipliers[unit];
}

export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function actionColor(action) {
  const colors = {
    warn: 0xf1c40f,
    mute: 0xe67e22,
    kick: 0xe74c3c,
    ban: 0xc0392b,
    quarantine: 0x9b59b6,
    unquarantine: 0x2ecc71,
    lock: 0x34495e,
    unlock: 0x27ae60,
    slowmode: 0x3498db,
    antiraid: 0xe91e63,
    message_delete: 0x95a5a6,
  };
  return colors[action] || 0x5865f2;
}

export function isSuspiciousMessage(content, cfg) {
  const checks = [];
  const lower = content.toLowerCase();

  if (cfg.autoMod.blockInvites && /discord\.gg\/[a-z0-9]+/i.test(content)) {
    checks.push('invite_discord');
  }

  if (cfg.autoMod.blockLinks && /https?:\/\//i.test(content)) {
    checks.push('external_link');
  }

  const mentionCount = (content.match(/<@!?\d+>/g) || []).length;
  if (cfg.autoMod.blockMentionSpam && mentionCount >= cfg.autoMod.mentionLimit) {
    checks.push('mention_spam');
  }

  const capsRatio = content.replace(/[^a-zA-Z]/g, '').length ? content.replace(/[^A-Z]/g, '').length / content.replace(/[^a-zA-Z]/g, '').length : 0;
  if (capsRatio > cfg.autoMod.maxCapsRatio && content.length > 8) {
    checks.push('excessive_caps');
  }

  if (new RegExp(`(.)\\1{${cfg.autoMod.maxRepeatedChars - 1},}`).test(content)) {
    checks.push('repeated_chars');
  }

  if (cfg.autoMod.zalgoDetection && /[\u0300-\u036f\u0483-\u0489\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{4,}/.test(content)) {
    checks.push('zalgo_text');
  }

  for (const kw of cfg.autoMod.suspiciousKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      checks.push('suspicious_keyword');
      break;
    }
  }

  if (/[a-zA-Z0-9_-]{23,28}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27}/.test(content)) {
    checks.push('token_leak');
  }

  return checks;
}

export async function applyAutoPunishment(member, cfg, reason, checks) {
  const guild = member.guild;
  try {
    if (checks.includes('raid')) {
      if (cfg.punishments.raid.action === 'ban') {
        await guild.members.ban(member.id, { reason, deleteMessageDays: 1 });
      } else if (cfg.punishments.raid.action === 'kick') {
        await member.kick(reason);
      } else {
        await quarantineUser(member, cfg, 'Système', reason);
      }
      return cfg.punishments.raid.action;
    }

    if (checks.includes('mention_spam') || checks.includes('repeated_chars') || checks.includes('excessive_caps')) {
      const punishment = cfg.punishments.spam;
      if (punishment.action === 'mute') {
        const duration = punishment.duration || 300;
        await member.timeout(duration * 1000, reason);
      } else if (punishment.action === 'kick') {
        await member.kick(reason);
      }
      return punishment.action;
    }

    return null;
  } catch (err) {
    console.error('Auto-punishment error:', err.message);
    return null;
  }
}

export async function quarantineUser(member, cfg, moderatorTag, reason) {
  const guild = member.guild;
  const quarantineRole = guild.roles.cache.get(cfg.quarantineRoleId) || await guild.roles.fetch(cfg.quarantineRoleId).catch(() => null);
  if (!quarantineRole) throw new Error('Rôle de quarantaine introuvable.');

  const previousRoles = member.roles.cache.filter(r => r.id !== guild.id && r.id !== quarantineRole.id).map(r => r.id);
  const rolesToRemove = previousRoles.filter(id => id !== guild.roles.everyone.id);

  await member.roles.remove(rolesToRemove, `Quarantaine: ${reason}`);
  await member.roles.add(quarantineRole, `Quarantaine: ${reason}`);

  const { setQuarantineRoles } = await import('./kv.js');
  await setQuarantineRoles(guild.id, member.id, previousRoles);
}

export async function restoreQuarantineUser(member, cfg) {
  const guild = member.guild;
  const { getQuarantineRoles, deleteQuarantineRoles } = await import('./kv.js');
  const previousRoles = await getQuarantineRoles(guild.id, member.id);
  if (!previousRoles) throw new Error('Aucun rôle à restaurer.');

  const quarantineRole = guild.roles.cache.get(cfg.quarantineRoleId) || await guild.roles.fetch(cfg.quarantineRoleId).catch(() => null);
  if (quarantineRole) await member.roles.remove(quarantineRole, 'Fin de quarantaine');
  await member.roles.add(previousRoles, 'Restauration après quarantaine');
  await deleteQuarantineRoles(guild.id, member.id);
}
