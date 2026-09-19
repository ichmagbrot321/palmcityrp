const crypto = require('crypto');

/* =========================================================
   KONFIGURATION
   ========================================================= */

const DISCORD = 'https://discord.com/api/v10';
const GUILD = process.env.DISCORD_GUILD_ID || '1548652649866596473';
const BOT = process.env.DISCORD_BOT_TOKEN;
const CLIENT = process.env.DISCORD_CLIENT_ID;
const SECRET = process.env.DISCORD_CLIENT_SECRET;
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const SITE = process.env.SITE_URL;
const SESSION = process.env.SESSION_SECRET;
const APPEAL_CHANNEL = process.env.DISCORD_APPEAL_CHANNEL_ID || '1548705694033780867';

const SESSION_MAX_AGE = 60 * 60 * 24 * 365 * 10;
const ROBLOX_NAME = /^[A-Za-z0-9_]{3,20}$/;
const UA = 'PalmCityRP-Moderationsportal/1.1';

/* =========================================================
   HELFER
   ========================================================= */

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50000) {
        req.destroy();
        reject(new Error('Body zu groß'));
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function redirect(res, location, cookies = []) {
  res.statusCode = 302;
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.setHeader('Location', location);
  res.end();
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION).update(value).digest('base64url');
}
const enc = value => Buffer.from(value).toString('base64url');
const dec = value => Buffer.from(value, 'base64url').toString();

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function setCookie(name, value, maxAge) {
  const expires = maxAge <= 0
    ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    : `; Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`;
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}${expires}; Priority=High`;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

function session(req) {
  const raw = getCookie(req, 'pc_session');
  if (!raw) return null;
  try {
    const [payload, signature] = raw.split('.');
    if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
    const data = JSON.parse(dec(payload));
    return data.exp > Date.now() ? data.u : null;
  } catch {
    return null;
  }
}

function sessionCookie(user) {
  const payload = enc(JSON.stringify({ u: user, exp: Date.now() + SESSION_MAX_AGE * 1000 }));
  return setCookie('pc_session', payload + '.' + sign(payload), SESSION_MAX_AGE);
}

async function db(path, opt = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opt,
    headers: {
      apikey: SKEY,
      Authorization: `Bearer ${SKEY}`,
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
}

async function dapi(path, opt = {}) {
  const r = await fetch(DISCORD + path, {
    ...opt,
    headers: {
      Authorization: `Bot ${BOT}`,
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
}

function avatar(u) {
  return u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

async function ban(id) {
  const r = await dapi(`/guilds/${GUILD}/bans/${id}`);
  return r.ok ? r.data : null;
}

async function cases(id, source) {
  const q = `guild_id=eq.${encodeURIComponent(GUILD)}&user_id=eq.${encodeURIComponent(id)}&source=eq.${encodeURIComponent(source)}&order=created_at.desc&select=*`;
  const r = await db(`moderation_cases?${q}`);
  return r.ok ? r.data || [] : [];
}

/* "_" und "%" sind bei ILIKE Platzhalter, deshalb escapen */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, c => '\\' + c);
}

async function robloxCases(username) {
  const q = `guild_id=eq.${encodeURIComponent(GUILD)}&source=eq.roblox&roblox_username=ilike.${encodeURIComponent(escapeLike(username))}&order=created_at.desc&select=*`;
  const r = await db(`moderation_cases?${q}`);
  return r.ok ? r.data || [] : [];
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function timedFetch(url, opt = {}, ms = 7000) {
  return fetch(url, { ...opt, signal: AbortSignal.timeout(ms) });
}

/* =========================================================
   ROBLOX PROFIL + AVATAR
   ========================================================= */

const CACHE_MS = 10 * 60 * 1000;
const profileCache = new Map();
const imageCache = new Map();

function cacheGet(map, key) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  map.delete(key);
  return null;
}

function cacheSet(map, key, value) {
  if (map.size > 300) map.delete(map.keys().next().value);
  map.set(key, { t: Date.now(), v: value });
}

const ROBLOX_HOSTS = {
  users: ['https://users.roblox.com', 'https://users.roproxy.com'],
  thumbs: ['https://thumbnails.roblox.com', 'https://thumbnails.roproxy.com']
};

/* Erstes brauchbares Ergebnis gewinnt; null, wenn alle leer oder fehlgeschlagen sind */
function firstFound(promises) {
  return new Promise(resolve => {
    let left = promises.length;
    const done = () => { if (--left === 0) resolve(null); };
    promises.forEach(p => p.then(v => (v ? resolve(v) : done()), done));
  });
}

/* Benutzer per Name suchen, beide Server gleichzeitig */
function robloxUserLookup(clean, diag = []) {
  return firstFound(ROBLOX_HOSTS.users.map(async host => {
    const name = new URL(host).hostname;
    try {
      const r = await timedFetch(host + '/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ usernames: [clean], excludeBannedUsers: false })
      }, 4500);
      if (!r.ok) {
        console.error('Roblox Users API', name, r.status);
        diag.push(`${name}: HTTP ${r.status}`);
        return null;
      }
      const data = await r.json();
      return data?.data?.[0] || null;
    } catch (e) {
      console.error('Roblox Users API', name, e.message);
      diag.push(`${name}: ${e.message}`);
      return null;
    }
  }));
}

/* Avatar holen: { url, body, contentType }. body fehlt, wenn nur der Browser laden kann. */
async function robloxAvatar(userId) {
  const id = String(userId || '').trim();
  if (!/^\d+$/.test(id)) return null;

  const cached = cacheGet(imageCache, id);
  if (cached) return cached;

  const imageHeaders = {
    Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
    'User-Agent': UA
  };

  const url = await firstFound(ROBLOX_HOSTS.thumbs.map(async host => {
    const api = `${host}/v1/users/avatar-headshot?userIds=${encodeURIComponent(id)}&size=150x150&format=Png&isCircular=false`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await timedFetch(api, { headers: { Accept: 'application/json', 'User-Agent': UA } }, 4000);
        if (!r.ok) {
          console.error('Roblox Thumbnail API', host, r.status);
          return null;
        }
        const data = await r.json().catch(() => null);
        const item = data?.data?.find(x => String(x.targetId) === id) || data?.data?.[0];
        if (item?.imageUrl && item.state === 'Completed') return item.imageUrl;
        if (item && item.state !== 'Pending') return null;
      } catch (e) {
        console.error('Roblox Thumbnail API', host, e.message);
        return null;
      }
      await wait(600);
    }
    return null;
  }));

  const browserUrl = url || `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(id)}&width=150&height=150&format=png`;

  try {
    const img = await timedFetch(browserUrl, { headers: imageHeaders }, 4000);
    const type = img.headers.get('content-type') || '';
    if (img.ok && type.startsWith('image/')) {
      const result = { url: browserUrl, body: Buffer.from(await img.arrayBuffer()), contentType: type };
      cacheSet(imageCache, id, result);
      return result;
    }
    console.error('Roblox Avatar Download', img.status, type);
  } catch (e) {
    console.error('Roblox Avatar Download:', e.message);
  }

  return { url: browserUrl, body: null, contentType: null };
}

async function robloxAvatarImage(userId) {
  const a = await robloxAvatar(userId);
  return a && a.body ? a : null;
}

function cachedRobloxProfile(username) {
  return cacheGet(profileCache, String(username || '').toLowerCase());
}

/* Profil: ID, Name, Anzeigename, Avatar (Data-URI, Proxy-URL, Direkt-URL) */
async function robloxProfile(username, diag = []) {
  const clean = String(username || '').trim();
  if (!ROBLOX_NAME.test(clean)) return null;

  const cached = cachedRobloxProfile(clean);
  if (cached) return cached;

  try {
    const p = await robloxUserLookup(clean, diag);
    if (!p?.id) return null;

    const id = String(p.id);
    const avatarInfo = await robloxAvatar(id);

    const profile = {
      id,
      username: p.name || clean,
      displayName: p.displayName || p.name || clean,
      avatarData: avatarInfo?.body
        ? `data:${avatarInfo.contentType};base64,${avatarInfo.body.toString('base64')}`
        : null,
      avatarUrl: avatarInfo?.url || null,
      avatarProxy: `/api/roblox-avatar?userId=${encodeURIComponent(id)}`
    };

    if (profile.avatarData) cacheSet(profileCache, clean.toLowerCase(), profile);
    return profile;
  } catch (e) {
    console.error('Roblox Profil Fehler:', e);
    return null;
  }
}

/* =========================================================
   HANDLER
   ========================================================= */

module.exports = async (req, res) => {
  try {
    noStore(res);
    const u = new URL(req.url, `https://${req.headers.host}`);
    const p = u.pathname;

    /* ---------- Login ---------- */
    if (p === '/api/login') {
      const state = enc(crypto.randomBytes(24));
      const url = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(CLIENT)}&response_type=code&redirect_uri=${encodeURIComponent(SITE + '/api/callback')}&scope=identify&state=${state}`;
      return redirect(res, url, [setCookie('pc_state', state, 600)]);
    }

    if (p === '/api/callback') {
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      const saved = getCookie(req, 'pc_state');

      if (!code || !state || !saved || !safeEqual(saved, state)) {
        return send(res, 400, { error: 'Ungültige Anmeldung.' });
      }

      const body = new URLSearchParams({
        client_id: CLIENT,
        client_secret: SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: SITE + '/api/callback'
      });

      const t = await fetch(DISCORD + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const td = await t.json().catch(() => ({}));

      if (!td.access_token) {
        return send(res, 401, { error: 'Discord Anmeldung fehlgeschlagen.' });
      }

      const me = await fetch(DISCORD + '/users/@me', {
        headers: { Authorization: `Bearer ${td.access_token}` }
      }).then(r => (r.ok ? r.json() : null));

      if (!me) return send(res, 401, { error: 'Discord Anmeldung fehlgeschlagen.' });

      const user = {
        id: me.id,
        username: me.username,
        global_name: me.global_name,
        avatar: avatar(me)
      };

      return redirect(res, '/', [sessionCookie(user), setCookie('pc_state', '', 0)]);
    }

    /* ---------- Logout ---------- */
    if (p === '/api/logout') {
      return redirect(res, '/', [setCookie('pc_session', '', 0)]);
    }

    /* ---------- Ab hier nur eingeloggt ---------- */
    const me = session(req);
    if (!me) return send(res, 401, { error: 'Nicht angemeldet.' });

    /* ---------- Roblox Avatar Proxy ---------- */
    if (p === '/api/roblox-avatar') {
      const userId = u.searchParams.get('userId');
      if (!/^\d+$/.test(String(userId || ''))) {
        return send(res, 400, { error: 'Ungültige Roblox User ID.' });
      }

      const image = await robloxAvatarImage(userId);
      if (!image) {
        return send(res, 404, { error: 'Roblox Avatar konnte nicht geladen werden.' });
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', image.contentType);
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.setHeader('Content-Length', String(image.body.length));
      return res.end(image.body);
    }

    /* ---------- Roblox Vorschau (vor dem Speichern) ---------- */
    if (p === '/api/roblox-lookup' && req.method === 'GET') {
      const name = String(u.searchParams.get('username') || '').trim();
      if (!ROBLOX_NAME.test(name)) {
        return send(res, 400, { error: 'Ungültiger Roblox Benutzername.' });
      }
      const profile = await robloxProfile(name);
      if (!profile) {
        return send(res, 404, { error: 'Dieser Roblox Benutzername wurde nicht gefunden. Bitte überprüfe die Schreibweise.' });
      }
      return send(res, 200, { profile });
    }

    /* ---------- Übersicht ---------- */
    if (p === '/api/me') {
      res.setHeader('Set-Cookie', sessionCookie(me));

      /* Nur das Roblox-Profil nachladen (langsame Roblox-Abfrage getrennt von der Übersicht) */
      if (u.searchParams.get('roblox')) {
        const link = await db(`roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`);
        const rl = link.ok ? (link.data || [])[0] : null;
        if (!rl) return send(res, 200, { profile: null });
        const diag = [];
        const profile = await robloxProfile(rl.username, diag);
        return send(res, 200, { profile, error: profile ? null : (diag.join('; ') || 'Profil nicht gefunden') });
      }

      const [b, ws, link, ap] = await Promise.all([
        ban(me.id),
        cases(me.id, 'discord'),
        db(`roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`),
        db(`appeals?discord_id=eq.${encodeURIComponent(me.id)}&order=created_at.desc&select=*`)
      ]);

      const rl = link.ok ? (link.data || [])[0] : null;
      const rc = rl ? await robloxCases(rl.username) : [];
      const rp = rl ? cachedRobloxProfile(rl.username) : null;

      return send(res, 200, {
        user: me,
        banned: !!b,
        ban: b ? { reason: b.reason } : null,
        warns: ws.filter(x => ['warn', 'discord_warn'].includes(String(x.action).toLowerCase())),
        roblox: {
          username: rl?.username || null,
          profile: rp,
          cases: rc
        },
        appeals: ap.ok ? ap.data || [] : []
      });
    }

    /* ---------- Roblox Namen verknüpfen ---------- */
    if (p === '/api/roblox' && req.method === 'POST') {
      const x = await readJson(req);
      const name = String(x.username || '').trim();

      if (!ROBLOX_NAME.test(name)) {
        return send(res, 400, { error: 'Ungültiger Roblox Benutzername.' });
      }

      const existing = await db(`roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`);
      if (!existing.ok) {
        return send(res, 500, { error: 'Roblox Verknüpfung konnte nicht geprüft werden.' });
      }
      if (existing.data?.length) {
        return send(res, 409, { error: 'Dein Roblox Benutzername wurde bereits fest hinterlegt und kann nicht geändert werden.' });
      }

      const diag = [];
      let rp = await robloxProfile(name, diag);
      let unverified = false;

      if (!rp?.id) {
        if (!diag.length) {
          return send(res, 404, { error: 'Dieser Roblox Benutzername wurde nicht gefunden. Bitte überprüfe die Schreibweise.' });
        }
        /* Roblox ist vom Server aus nicht erreichbar: Name trotzdem zulassen, Profil kommt später */
        console.error('Roblox nicht erreichbar, Name ohne Prüfung:', diag.join('; '));
        unverified = true;
        rp = { id: null, username: name, displayName: name, avatarData: null, avatarUrl: null, avatarProxy: null, unverified: true };
      }

      /* Nur Vorschau: nichts speichern */
      if (x.preview) {
        return send(res, 200, { ok: true, preview: true, profile: rp, unverified });
      }

      const r = await db('roblox_links', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          discord_id: me.id,
          username: rp.username,
          updated_at: new Date().toISOString()
        })
      });

      return r.ok
        ? send(res, 200, { ok: true, profile: rp })
        : send(res, 500, { error: 'Roblox Name konnte nicht gespeichert werden.' });
    }

    /* ---------- Anträge ---------- */
    if (p === '/api/appeals' && req.method === 'POST') {
      const x = await readJson(req);
      const type = String(x.type || '');
      const reason = String(x.reason || '').trim();
      const caseId = x.case_id ? String(x.case_id) : null;

      if (!['discord_ban', 'discord_warn', 'roblox'].includes(type) || reason.length < 10 || reason.length > 2000) {
        return send(res, 400, { error: 'Ungültiger Antrag.' });
      }

      if (type === 'discord_ban' && !(await ban(me.id))) {
        return send(res, 400, { error: 'Du bist aktuell nicht gebannt.' });
      }

      if (type !== 'discord_ban' && !caseId) {
        return send(res, 400, { error: 'Kein Fall ausgewählt.' });
      }

      /* Fall muss dem Nutzer gehören. Roblox-Fälle gehören über den verknüpften Roblox-Namen. */
      if (caseId) {
        const r = await db(`moderation_cases?guild_id=eq.${encodeURIComponent(GUILD)}&case_id=eq.${encodeURIComponent(caseId)}&select=*`);
        const c = r.ok ? r.data?.[0] : null;
        if (!c) return send(res, 403, { error: 'Dieser Fall gehört nicht zu dir.' });

        let owns = false;
        if (type === 'roblox') {
          const link = await db(`roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`);
          const rl = link.ok ? link.data?.[0] : null;
          owns = !!rl
            && String(c.source).toLowerCase() === 'roblox'
            && String(c.roblox_username || '').toLowerCase() === String(rl.username).toLowerCase();
        } else {
          owns = String(c.user_id) === String(me.id);
        }

        if (!owns) return send(res, 403, { error: 'Dieser Fall gehört nicht zu dir.' });
      }

      /* Keine doppelten offenen Anträge */
      const dupQuery = `appeals?discord_id=eq.${encodeURIComponent(me.id)}&type=eq.${encodeURIComponent(type)}&status=in.(open,pending)&${caseId ? 'case_id=eq.' + encodeURIComponent(caseId) : 'case_id=is.null'}&select=*`;
      const dup = await db(dupQuery);
      if (dup.ok && dup.data?.length) {
        return send(res, 409, { error: 'Für diesen Fall läuft bereits ein Antrag.' });
      }

      const appealData = {
        discord_id: me.id,
        discord_username: me.username,
        type,
        case_id: caseId,
        reason,
        status: 'open',
        created_at: new Date().toISOString()
      };

      let r = await db('appeals', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...appealData, discord_notified: false, bot_handled: false })
      });

      if (!r.ok) {
        r = await db('appeals', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(appealData)
        });
      }

      if (!r.ok) {
        console.error('Supabase appeals insert failed:', r.status, r.data);
        return send(res, 500, {
          error: 'Der Antrag konnte nicht gespeichert werden. Supabase: ' + (r.data?.message || r.data?.hint || r.data?.details || ('HTTP ' + r.status))
        });
      }

      const appeal = Array.isArray(r.data) ? r.data[0] : r.data;
      const appealId = appeal?.id ?? appeal?.appeal_id;

      if (!appealId) {
        console.error('Supabase appeal insert returned no id:', r.data);
        return send(res, 500, { error: 'Der Antrag wurde gespeichert, aber es wurde keine Antrags-ID zurückgegeben.' });
      }

      const title = type === 'discord_ban'
        ? '🔨 Neuer Entbannungsantrag'
        : type === 'discord_warn'
          ? '⚠️ Neuer Warnungs-Widerspruch'
          : '🎮 Neuer Roblox-Widerspruch';

      const detail = caseId ? `Fall: #${caseId}` : 'Kein Fall';

      const msgBody = {
        content: `**${title}**\n\n**Antrag:** #${appealId}\n**Nutzer:** ${me.username} (${me.id})\n**${detail}**\n**Begründung:** ${reason}`.slice(0, 2000),
        allowed_mentions: { parse: [] },
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: 'Annehmen', emoji: { name: '✅' }, custom_id: `webappeal:accept:${appealId}` },
              { type: 2, style: 4, label: 'Ablehnen', emoji: { name: '❌' }, custom_id: `webappeal:reject:${appealId}` }
            ]
          }
        ]
      };

      const dr = await dapi(`/channels/${encodeURIComponent(APPEAL_CHANNEL)}/messages`, {
        method: 'POST',
        body: JSON.stringify(msgBody)
      });

      if (!dr.ok) {
        console.error('Discord appeal message failed:', dr.status, dr.data);
        return send(res, 502, { error: 'Der Antrag wurde gespeichert, konnte aber nicht nach Discord gesendet werden.' });
      }

      const patch = JSON.stringify({
        discord_notified: true,
        discord_message_id: dr.data?.id || null
      });

      let ur = await db(`appeals?id=eq.${encodeURIComponent(appealId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: patch
      });

      if (!ur.ok) {
        await db(`appeals?appeal_id=eq.${encodeURIComponent(appealId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: patch
        });
      }

      return send(res, 200, { ok: true, appeal_id: appealId });
    }

    return send(res, 404, { error: 'Nicht gefunden.' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Interner Fehler.' });
  }
};
