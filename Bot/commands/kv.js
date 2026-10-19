const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_NAMESPACE_ID = process.env.CLOUDFLARE_NAMESPACE_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function key(...parts) {
  return parts.join(':');
}

async function kvRequest(method, kvKey, value) {
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.warn('⚠️ Cloudflare KV non configuré. Utilisation du cache mémoire.');
    return null;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(kvKey)}`;
  const headers = {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method,
      headers: method === 'GET' ? { Authorization: `Bearer ${CF_API_TOKEN}` } : headers,
      body: value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : undefined,
    });
    if (method === 'GET' && res.status === 404) return null;
    if (method === 'GET') {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return text; }
    }
    return res.ok;
  } catch (err) {
    console.error('KV error:', err.message);
    return null;
  }
}

const memoryCache = new Map();

export async function getConfig(guildId) {
  const k = key('config', guildId);
  const cached = memoryCache.get(k);
  if (cached && Date.now() - cached.ts < 30000) return cached.data;
  const data = await kvRequest('GET', k);
  const cfg = data || getDefaultConfig();
  memoryCache.set(k, { data: cfg, ts: Date.now() });
  return cfg;
}

export async function setConfig(guildId, cfg) {
  const k = key('config', guildId);
  memoryCache.set(k, { data: cfg, ts: Date.now() });
  return kvRequest('PUT', k, cfg);
}

export async function getLogs(guildId, userId, limit = 50) {
  const k = key('logs', guildId);
  const all = (await kvRequest('GET', k)) || [];
  let filtered = all;
  if (userId) filtered = filtered.filter(l => l.targetId === userId);
  return filtered.slice(-limit);
}

export async function addLog(guildId, logEntry) {
  const k = key('logs', guildId);
  const all = (await kvRequest('GET', k)) || [];
  all.push(logEntry);
  if (all.length > 500) all.shift();
  return kvRequest('PUT', k, all);
}

export async function getReputation(guildId, userId) {
  const k = key('reputation', guildId, userId);
  return (await kvRequest('GET', k)) || { score: 100, history: [] };
}

export async function setReputation(guildId, userId, rep) {
  const k = key('reputation', guildId, userId);
  return kvRequest('PUT', k, rep);
}

export async function getQuarantineRoles(guildId, userId) {
  const k = key('quarantine', guildId, userId);
  return await kvRequest('GET', k);
}

export async function setQuarantineRoles(guildId, userId, roles) {
  const k = key('quarantine', guildId, userId);
  return kvRequest('PUT', k, roles);
}

export async function deleteQuarantineRoles(guildId, userId) {
  const k = key('quarantine', guildId, userId);
  return kvRequest('DELETE', k);
}

export function getDefaultConfig() {
  return {
    enabled: true,
    logChannelId: null,
    modRoleId: null,
    quarantineRoleId: null,
    mutedRoleId: null,
    antiRaidLevel: 'medium',
    autoMod: {
      blockInvites: true,
      blockLinks: false,
      blockMentionSpam: true,
      mentionLimit: 5,
      maxCapsRatio: 0.7,
      maxRepeatedChars: 10,
      zalgoDetection: true,
      maxMessagesPer10s: 6,
      maxJoinsPer60s: 10,
      suspiciousKeywords: ['token', 'discord.gg/', 'free nitro', 'steamcommunity.com/gift', 'dlscord'],
    },
    punishments: {
      spam: { action: 'mute', duration: 300 },
      raid: { action: 'quarantine' },
      lowReputation: { threshold: 30, action: 'kick' },
    },
    lockdownMessage: '🛡️ Le serveur est temporairement verrouillé pour cause de raid suspect.',
    welcomeMessage: null,
  };
}
