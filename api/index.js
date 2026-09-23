const crypto = require('crypto');

/* =========================================================
   KONFIGURATION
   ========================================================= */

const DISCORD = 'https://discord.com/api/v10';
const GUILD = process.env.DISCORD_GUILD_ID || '1548652649866596473';
const TEAM_ROLE = process.env.DISCORD_TEAM_ROLE_ID || '1551649116675768414';
const BOT = process.env.DISCORD_BOT_TOKEN;
const CLIENT = process.env.DISCORD_CLIENT_ID;
const SECRET = process.env.DISCORD_CLIENT_SECRET;
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const SITE = process.env.SITE_URL;
const SESSION = process.env.SESSION_SECRET;
const APPEAL_CHANNEL = process.env.DISCORD_APPEAL_CHANNEL_ID || '1548705694033780867';

const DISCORD_INVITE = 'https://discord.gg/t7N6D43KFv';
const WIDGET_URL = 'https://discord.com/api/guilds/1548652649866596473/widget.json';

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

function sendHtml(res, html, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
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

async function robloxUserLookup(clean, diag = []) {
  for (const host of ROBLOX_HOSTS.users) {
    try {
      const r = await timedFetch(host + '/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ usernames: [clean], excludeBannedUsers: false })
      });
      if (!r.ok) {
        console.error('Roblox Users API', host, r.status);
        diag.push(`${new URL(host).hostname}: HTTP ${r.status}`);
        continue;
      }
      const data = await r.json();
      return data?.data?.[0] || null;
    } catch (e) {
      console.error('Roblox Users API', host, e.message);
      diag.push(`${new URL(host).hostname}: ${e.message}`);
    }
  }
  return null;
}

async function robloxAvatar(userId) {
  const id = String(userId || '').trim();
  if (!/^\d+$/.test(id)) return null;

  const cached = cacheGet(imageCache, id);
  if (cached) return cached;

  const imageHeaders = {
    Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
    'User-Agent': UA
  };

  let url = null;

  for (const host of ROBLOX_HOSTS.thumbs) {
    const api = `${host}/v1/users/avatar-headshot?userIds=${encodeURIComponent(id)}&size=150x150&format=Png&isCircular=false`;
    for (let attempt = 0; attempt < 3 && !url; attempt++) {
      try {
        const r = await timedFetch(api, { headers: { Accept: 'application/json', 'User-Agent': UA } });
        if (!r.ok) {
          console.error('Roblox Thumbnail API', host, r.status);
          break;
        }
        const data = await r.json().catch(() => null);
        const item = data?.data?.find(x => String(x.targetId) === id) || data?.data?.[0];
        if (item?.imageUrl && item.state === 'Completed') {
          url = item.imageUrl;
          break;
        }
        if (item && item.state !== 'Pending') break;
      } catch (e) {
        console.error('Roblox Thumbnail API', host, e.message);
        break;
      }
      await wait(500);
    }
    if (url) break;
  }

  const browserUrl = url || `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(id)}&width=150&height=150&format=png`;

  try {
    const img = await timedFetch(browserUrl, { headers: imageHeaders });
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

async function robloxProfile(username, diag = []) {
  const clean = String(username || '').trim();
  if (!ROBLOX_NAME.test(clean)) return null;

  const key = clean.toLowerCase();
  const cached = cacheGet(profileCache, key);
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

    if (profile.avatarData) cacheSet(profileCache, key, profile);
    return profile;
  } catch (e) {
    console.error('Roblox Profil Fehler:', e);
    return null;
  }
}

async function getAllGuildMembers() {
  const members = [];
  let after = '0';

  for (;;) {
    const r = await dapi(`/guilds/${encodeURIComponent(GUILD)}/members?limit=1000&after=${encodeURIComponent(after)}`);

    if (!r.ok) {
      throw new Error(`Discord Mitglieder API HTTP ${r.status}`);
    }

    const page = Array.isArray(r.data) ? r.data : [];
    members.push(...page);

    if (page.length < 1000) break;

    after = String(page[page.length - 1].user.id);
  }

  return members;
}

async function getPublicTeam() {
  const members = await getAllGuildMembers();

  return members
    .filter(m => Array.isArray(m.roles) && m.roles.includes(TEAM_ROLE))
    .map(m => {
      const u = m.user || {};

      const avatarUrl = u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

      return {
        id: u.id,
        username: u.username || '',
        display_name: m.nick || u.global_name || u.username || 'Unbekannt',
        avatar: avatarUrl,
        online: false
      };
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'de'));
}

const HOME_HTML = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#07101f">
  <meta name="description" content="Palm City RP – neuer Notruf Hamburg RP Server. Baue mit uns eine Stadt, in der Entscheidungen Geschichten schreiben.">
  <title>Palm City RP — Deine Stadt. Deine Entscheidungen.</title>
  <style>
    :root{
      --bg:#040711;--bg2:#07101f;--card:rgba(10,18,34,.72);
      --line:rgba(110,170,255,.16);--text:#f5f8ff;--muted:#a9b7ce;
      --blue:#4aa8ff;--cyan:#5ee7ff;--green:#51e58b;--danger:#ff5c6c;
      --shadow:0 25px 80px rgba(0,0,0,.45);--radius:24px;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:
      radial-gradient(circle at 15% 10%,rgba(45,108,255,.13),transparent 30%),
      radial-gradient(circle at 85% 25%,rgba(0,214,255,.08),transparent 28%),
      linear-gradient(180deg,#03050b 0%,#06101e 50%,#03050b 100%);line-height:1.6;overflow-x:hidden}
    a{text-decoration:none;color:inherit}
    .noise{position:fixed;inset:0;pointer-events:none;opacity:.025;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
    .nav{position:fixed;z-index:50;top:16px;left:50%;transform:translateX(-50%);width:min(1160px,calc(100% - 28px));display:flex;align-items:center;justify-content:space-between;padding:11px 12px 11px 16px;border:1px solid var(--line);background:rgba(4,9,18,.72);backdrop-filter:blur(18px);border-radius:18px;box-shadow:0 12px 45px rgba(0,0,0,.28)}
    .brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.08em}
    .brand-mark{width:38px;height:38px;border-radius:50%;border:1px solid rgba(100,190,255,.45);background:url("logo.png") center/cover no-repeat;box-shadow:0 0 25px rgba(54,160,255,.3)}
    .brand span{font-size:14px}.brand small{display:block;color:#7f91ac;font-size:9px;letter-spacing:.16em;margin-top:-2px}
    .navlinks{display:flex;gap:22px;color:#b9c7da;font-size:13px}.navlinks a:hover{color:#fff}
    .nav-cta{padding:10px 15px;border-radius:12px;background:#fff;color:#07101c;font-weight:850;font-size:12px}
    .hero{min-height:860px;display:grid;place-items:center;position:relative;padding:150px 20px 100px;isolation:isolate}
    .hero:before{content:"";position:absolute;inset:0;z-index:-3;background:linear-gradient(180deg,rgba(2,5,12,.2),#040711 82%),url("logo.png") center top/cover no-repeat}
    .hero:after{content:"";position:absolute;inset:0;z-index:-2;background:radial-gradient(circle at 50% 42%,rgba(36,138,255,.2),transparent 32%),linear-gradient(90deg,rgba(2,6,13,.82),transparent 45%,rgba(2,6,13,.62))}
    .hero-inner{width:min(1120px,100%);display:grid;grid-template-columns:1.15fr .85fr;gap:60px;align-items:center}
    .eyebrow{display:inline-flex;gap:9px;align-items:center;padding:7px 11px;border:1px solid rgba(92,184,255,.24);border-radius:999px;background:rgba(7,17,32,.58);color:#a9d9ff;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
    .dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 14px var(--green)}
    h1{font-size:clamp(54px,8vw,98px);line-height:.91;letter-spacing:-.07em;margin:23px 0 24px;max-width:800px}
    h1 em{font-style:normal;background:linear-gradient(100deg,#fff 10%,#8bdcff 52%,#4c8dff);-webkit-background-clip:text;background-clip:text;color:transparent}
    .hero p{max-width:670px;color:#c0ccdc;font-size:18px;line-height:1.75}
    .buttons{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:14px 19px;border-radius:14px;font-size:13px;font-weight:850;border:1px solid rgba(255,255,255,.12);transition:.2s transform,.2s box-shadow,.2s background}
    .btn:hover{transform:translateY(-2px)}
    .btn-primary{background:linear-gradient(135deg,#f8fbff,#bfe9ff);color:#07101c;box-shadow:0 12px 38px rgba(74,168,255,.24)}
    .btn-secondary{background:rgba(10,20,38,.72);color:#eaf4ff}
    .hero-card{border:1px solid var(--line);background:rgba(5,13,26,.66);backdrop-filter:blur(18px);border-radius:28px;padding:18px;box-shadow:var(--shadow)}
    .hero-card img{width:100%;aspect-ratio:1/1;border-radius:20px;object-fit:cover;object-position:center;display:block}
    .mini-status{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding:13px 14px;border-radius:15px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}
    .online{display:flex;align-items:center;gap:8px;color:#b9ffd2;font-size:12px;font-weight:800}.online i{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green)}
    .count{font-size:22px;font-weight:900}.label{color:#8292aa;font-size:10px;text-transform:uppercase;letter-spacing:.12em}
    section{width:min(1120px,calc(100% - 36px));margin:auto;padding:105px 0}
    .section-head{display:flex;justify-content:space-between;gap:30px;align-items:end;margin-bottom:36px}
    .kicker{color:#6ebdff;text-transform:uppercase;letter-spacing:.17em;font-size:10px;font-weight:900;margin-bottom:9px}
    h2{font-size:clamp(34px,5vw,58px);line-height:1;letter-spacing:-.05em}
    .section-head p{max-width:500px;color:var(--muted)}
    .mission{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .mission-card{padding:28px;border-radius:var(--radius);border:1px solid var(--line);background:linear-gradient(145deg,rgba(15,29,52,.8),rgba(6,12,24,.75));box-shadow:var(--shadow)}
    .mission-card.large{grid-row:span 2}.mission-card h3{font-size:22px;margin:12px 0 9px}.mission-card p{color:#aebbd0}.icon{font-size:24px}
    .features{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.feature{padding:23px;border:1px solid var(--line);border-radius:20px;background:rgba(9,17,32,.62)}.feature strong{display:block;margin:12px 0 5px}.feature span{font-size:13px;color:#93a2b9}
    .team-wrap{border:1px solid var(--line);border-radius:30px;padding:24px;background:linear-gradient(145deg,rgba(10,20,37,.85),rgba(4,10,20,.78));box-shadow:var(--shadow)}
    .team-top{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:20px}.team-top .status{font-size:11px;color:#8fa0b8}
    .team-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .member{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);border-radius:17px}
    .avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;background:#0d1a2e;border:1px solid rgba(105,180,255,.22)}
    .member-name{font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.member-role{font-size:11px;color:#7f91aa}
    .member-dot{margin-left:auto;width:8px;height:8px;border-radius:50%;background:#64748b}.member-dot.online{background:var(--green);box-shadow:0 0 10px rgba(81,229,139,.65)}
    .empty{padding:30px;text-align:center;color:#8292aa}.skeleton{height:78px;border-radius:17px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));background-size:200% 100%;animation:shine 1.3s infinite}
    @keyframes shine{to{background-position:-200% 0}}
    .discord-box{position:relative;overflow:hidden;border:1px solid rgba(88,164,255,.25);border-radius:30px;padding:42px;background:linear-gradient(135deg,rgba(19,48,87,.82),rgba(7,13,27,.9));box-shadow:var(--shadow)}
    .discord-box:after{content:"";position:absolute;width:330px;height:330px;border-radius:50%;right:-130px;top:-170px;background:rgba(74,168,255,.13);filter:blur(5px)}
    .discord-content{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:35px;align-items:center}
    .stats{display:flex;gap:24px;margin-top:22px}.stat strong{display:block;font-size:26px}.stat span{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#8292aa}
    .widget{min-width:280px;padding:20px;border-radius:20px;background:rgba(2,8,18,.55);border:1px solid rgba(255,255,255,.08)}.widget-head{display:flex;align-items:center;gap:12px}.widget-logo{width:48px;height:48px;border-radius:14px;object-fit:cover}.widget-name{font-weight:900}.widget-sub{font-size:11px;color:#7f91aa}.member-list{display:flex;margin:17px 0 4px}.member-list img{width:30px;height:30px;border-radius:50%;border:2px solid #07101f;margin-left:-7px}.member-list img:first-child{margin-left:0}.widget-note{font-size:10px;color:#718198}
    .appeal{display:grid;grid-template-columns:1fr auto;gap:30px;align-items:center;padding:35px;border:1px solid rgba(255,95,110,.18);border-radius:25px;background:linear-gradient(135deg,rgba(45,13,23,.5),rgba(10,15,27,.75))}
    .appeal p{color:#aebbd0;margin-top:9px}.footer{border-top:1px solid rgba(255,255,255,.07);padding:35px 20px;color:#718198;font-size:11px}.footer-inner{width:min(1120px,100%);margin:auto;display:flex;justify-content:space-between;gap:20px}
    @media(max-width:900px){.navlinks{display:none}.hero-inner,.mission,.discord-content,.appeal{grid-template-columns:1fr}.hero{min-height:auto;padding-top:135px}.hero-card{max-width:520px;margin:auto}.features{grid-template-columns:1fr 1fr}.team-grid{grid-template-columns:1fr 1fr}.section-head{display:block}.section-head p{margin-top:15px}}
    @media(max-width:600px){h1{font-size:52px}.hero p{font-size:15px}.features,.team-grid{grid-template-columns:1fr}.stats{gap:18px}.widget{min-width:0}.discord-box{padding:25px}.footer-inner{display:block}.footer-inner div+div{margin-top:8px}}
  </style>
</head>
<body>
<div class="noise"></div>
<nav class="nav">
  <a class="brand" href="#home"><div class="brand-mark"></div><div><span>PALM CITY RP</span><small>NOTRUF HAMBURG RP</small></div></a>
  <div class="navlinks"><a href="#mission">Mission</a><a href="#team">Team</a><a href="#discord">Discord</a><a href="#einspruch">Widerspruch</a></div>
  <a class="nav-cta" href="${DISCORD_INVITE}" target="_blank" rel="noopener">DISCORD BEITRETEN</a>
</nav>

<main id="home">
  <header class="hero">
    <div class="hero-inner">
      <div>
        <div class="eyebrow"><i class="dot"></i> Neuer Notruf Hamburg RP Server</div>
        <h1>DEINE STADT.<br><em>DEINE GESCHICHTE.</em></h1>
        <p>Palm City RP entsteht gerade von Grund auf. Wir wollen keinen Server, auf dem alles nach einer Session vergessen ist. Wir bauen eine Stadt, in der Entscheidungen Konsequenzen haben und Charaktere ihre eigene Geschichte schreiben.</p>
        <div class="buttons">
          <a class="btn btn-primary" href="${DISCORD_INVITE}" target="_blank" rel="noopener">🌴 Discord beitreten</a>
          <a class="btn btn-secondary" href="https://palmcityrp.vercel.app/einspruch" target="_blank" rel="noopener">⚖ Widerspruch einreichen</a>
        </div>
      </div>
      <div class="hero-card">
        <img src="logo.png" alt="Palm City RP">
        <div class="mini-status"><div><div class="label">Discord Status</div><div class="online"><i></i><span id="heroStatus">Wird geladen…</span></div></div><div><div class="label">Mitglieder</div><div class="count" id="heroMembers">—</div></div></div>
      </div>
    </div>
  </header>

  <section id="mission">
    <div class="section-head"><div><div class="kicker">Unsere Mission</div><h2>RP, das bleibt.</h2></div><p>Wir wollen Palm City gemeinsam mit der Community entwickeln und von Anfang an eine Basis schaffen, auf der langfristige Geschichten entstehen können.</p></div>
    <div class="mission">
      <article class="mission-card large"><div class="icon">📖</div><h3>Deine Vergangenheit zählt.</h3><p>Ein Charakter soll nicht jeden Tag bei null anfangen. Schwere Straftaten, Entscheidungen und Erlebnisse können Teil seiner Geschichte werden. Wer im RP eine schwere Vergangenheit aufbaut, kann später beispielsweise Probleme bei einer Bewerbung für den Polizeidienst bekommen.</p></article>
      <article class="mission-card"><div class="icon">⚖️</div><h3>Ein echtes Rechtssystem.</h3><p>Anwälte, Gerichte und nachvollziehbare Verfahren sollen RP nicht nur dekorativ machen, sondern echte Geschichten ermöglichen.</p></article>
      <article class="mission-card"><div class="icon">🛡️</div><h3>Regeln mit Augenmaß.</h3><p>RP und Regelverstöße sind nicht dasselbe. Dein Charakter darf Fehler machen. Wer tatsächlich gegen Serverregeln verstößt, muss natürlich mit Konsequenzen rechnen.</p></article>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="kicker">Palm City</div><h2>Was uns wichtig ist.</h2></div></div>
    <div class="features">
      <div class="feature"><div class="icon">🚔</div><strong>Serious RP</strong><span>Langfristige Geschichten statt ständigem Neustart.</span></div>
      <div class="feature"><div class="icon">⚖️</div><strong>Recht & Ordnung</strong><span>Anwälte, Gerichte und nachvollziehbare Konsequenzen.</span></div>
      <div class="feature"><div class="icon">🧠</div><strong>Freie Charaktere</strong><span>Fehler und Entwicklung gehören zu gutem RP.</span></div>
      <div class="feature"><div class="icon">🌴</div><strong>Gemeinsam bauen</strong><span>Du kannst Palm City von Anfang an mitprägen.</span></div>
    </div>
  </section>

  <section id="team">
    <div class="section-head"><div><div class="kicker">Das Team</div><h2>Die Menschen hinter Palm City.</h2></div><p>Die Teamliste wird automatisch aus Discord geladen. Dafür wird die Palm-City-Teamrolle verwendet.</p></div>
    <div class="team-wrap">
      <div class="team-top"><div><strong id="teamCount">Team wird geladen…</strong><div class="status">Rolle: ${TEAM_ROLE}</div></div><div class="status" id="teamUpdated">Live-Daten</div></div>
      <div class="team-grid" id="teamGrid">
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      </div>
    </div>
  </section>

  <section id="discord">
    <div class="discord-box">
      <div class="discord-content">
        <div>
          <div class="kicker">Discord</div><h2>Werde Teil von Palm City.</h2>
          <p style="color:#aebbd0;margin-top:12px;max-width:600px">Wir sind noch am Anfang. Genau deshalb kannst du nicht nur zuschauen, sondern mitbestimmen, wie Palm City am Ende aussieht.</p>
          <div class="stats"><div class="stat"><strong id="discordMembers">—</strong><span>Mitglieder</span></div><div class="stat"><strong id="discordOnline">—</strong><span>Online</span></div></div>
          <div class="buttons"><a class="btn btn-primary" href="${DISCORD_INVITE}" target="_blank" rel="noopener">Discord öffnen →</a></div>
        </div>
        <div class="widget">
          <div class="widget-head"><img class="widget-logo" id="widgetLogo" src="logo.png" alt=""><div><div class="widget-name" id="widgetName">Palm City RP</div><div class="widget-sub" id="widgetSub">Discord Server</div></div></div>
          <div class="member-list" id="widgetMembers"></div><div class="widget-note" id="widgetNote">Discord Widget wird geladen…</div>
        </div>
      </div>
    </div>
  </section>

  <section id="einspruch">
    <div class="appeal">
      <div><div class="kicker">Moderation</div><h2>Eine Entscheidung anfechten?</h2><p>Du bist mit einer Moderationsentscheidung nicht einverstanden? Öffne unser Einspruchssystem und reiche deinen Fall direkt ein.</p></div>
      <a class="btn btn-secondary" style="border-color:rgba(255,95,110,.3)" href="https://palmcityrp.vercel.app/einspruch" target="_blank" rel="noopener">Widerspruch einreichen →</a>
    </div>
  </section>
</main>

<footer class="footer"><div class="footer-inner"><div>© <span id="year"></span> Palm City RP</div><div>Notruf Hamburg RP · Deine Stadt. Deine Entscheidungen.</div></div></footer>

<script>
const TEAM_API = "/api/team";

document.getElementById("year").textContent = new Date().getFullYear();

async function loadWidget(){
  try{
    const r = await fetch("/api/public-widget", {cache:"no-store"});
    if(!r.ok) throw new Error("Widget nicht verfügbar");
    const d = await r.json();
    const members = Number(d.presence_count || 0);
    document.getElementById("heroMembers").textContent = d.members?.length ? (d.members.length + "+") : "—";
    document.getElementById("heroStatus").textContent = members + " online";
    document.getElementById("discordMembers").textContent = d.members?.length ? (d.members.length + "+") : "—";
    document.getElementById("discordOnline").textContent = members;
    document.getElementById("widgetName").textContent = d.name || "Palm City RP";
    if(d.instant_invite) document.querySelectorAll('a[href*="discord.gg/t7N6D43KFv"]').forEach(a => a.href = d.instant_invite);
    if(d.icon_url) document.getElementById("widgetLogo").src = d.icon_url;
    const list = document.getElementById("widgetMembers");
    list.innerHTML = "";
    (d.members || []).slice(0, 8).forEach(m=>{
      const img = document.createElement("img");
      img.src = m.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png";
      img.alt = m.username || "";
      img.title = m.username || "";
      list.appendChild(img);
    });
    document.getElementById("widgetNote").textContent = d.members?.length ? `${d.members.length} aktive Nutzer im Widget` : "Discord-Widget ist aktiv";
  }catch(e){
    document.getElementById("heroStatus").textContent = "Discord";
    document.getElementById("widgetNote").textContent = "Discord-Widget konnte gerade nicht geladen werden.";
  }
}

async function loadTeam(){
  const grid = document.getElementById("teamGrid");
  try{
    const r = await fetch(TEAM_API, {cache:"no-store"});
    if(!r.ok) throw new Error("Team API " + r.status);
    const data = await r.json();
    const members = Array.isArray(data.members) ? data.members : [];
    document.getElementById("teamCount").textContent = `${members.length} Teammitglied${members.length === 1 ? "" : "er"}`;
    document.getElementById("teamUpdated").textContent = "● automatisch aktualisiert";
    grid.innerHTML = "";
    if(!members.length){ grid.innerHTML = `<div class="empty">Noch keine Teammitglieder gefunden.</div>`; return; }
    members.forEach(m=>{
      const card=document.createElement("div"); card.className="member";
      card.innerHTML=`<img class="avatar" src="${m.avatar}" alt=""><div style="min-width:0"><div class="member-name">${escapeHtml(m.display_name)}</div><div class="member-role">Palm City Team</div></div><span class="member-dot ${m.online ? "online" : ""}"></span>`;
      grid.appendChild(card);
    });
  }catch(e){
    document.getElementById("teamCount").textContent = "Teamliste momentan nicht erreichbar";
    document.getElementById("teamUpdated").textContent = "API prüfen";
    grid.innerHTML = `<div class="empty">Die Discord-Teamliste konnte nicht geladen werden. Prüfe den Bot-Token und die Vercel-Umgebungsvariable DISCORD_BOT_TOKEN.</div>`;
  }
}

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

loadWidget();
loadTeam();
setInterval(loadWidget, 60000);
setInterval(loadTeam, 60000);
</script>
</body>
</html>`;

module.exports = async (req, res) => {
  try {
    noStore(res);
    const u = new URL(req.url, `https://${req.headers.host}`);
    const p = u.pathname;

    /* =====================================================
       ÖFFENTLICHE WEBSITE / ÖFFENTLICHE APIS
       ===================================================== */

    if (p === '/' && req.method === 'GET') {
      return sendHtml(res, HOME_HTML);
    }

    if (p === '/api/public-widget' && req.method === 'GET') {
      try {
        const r = await timedFetch(WIDGET_URL, {
          headers: { Accept: 'application/json', 'User-Agent': UA }
        });
        const data = await r.json().catch(() => null);

        if (!r.ok || !data) {
          return send(res, 502, { error: 'Discord Widget konnte nicht geladen werden.' });
        }

        return send(res, 200, data);
      } catch (e) {
        console.error('Discord Widget Fehler:', e);
        return send(res, 502, { error: 'Discord Widget momentan nicht erreichbar.' });
      }
    }

    if (p === '/api/team' && req.method === 'GET') {
      try {
        if (!BOT) return send(res, 500, { error: 'DISCORD_BOT_TOKEN fehlt.' });

        const members = await getPublicTeam();

        return send(res, 200, {
          guild_id: GUILD,
          role_id: TEAM_ROLE,
          members,
          count: members.length,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.error('Team API Fehler:', e);
        return send(res, 502, {
          error: 'Discord Team konnte nicht geladen werden.',
          detail: e.message
        });
      }
    }

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

    if (p === '/api/logout') {
      return redirect(res, '/', [setCookie('pc_session', '', 0)]);
    }

    const me = session(req);
    if (!me) return send(res, 401, { error: 'Nicht angemeldet.' });

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

    if (p === '/api/roblox-lookup' && req.method === 'GET') {
      const name = String(u.searchParams.get('username') || '').trim();

      if (!ROBLOX_NAME.test(name)) {
        return send(res, 400, { error: 'Ungültiger Roblox Benutzername.' });
      }

      const profile = await robloxProfile(name);

      if (!profile) {
        return send(res, 404, {
          error: 'Dieser Roblox Benutzername wurde nicht gefunden. Bitte überprüfe die Schreibweise.'
        });
      }

      return send(res, 200, { profile });
    }

    if (p === '/api/me') {
      res.setHeader('Set-Cookie', sessionCookie(me));

      const [b, ws, link, ap] = await Promise.all([
        ban(me.id),
        cases(me.id, 'discord'),
        db(`roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`),
        db(`appeals?discord_id=eq.${encodeURIComponent(me.id)}&order=created_at.desc&select=*`)
      ]);

      const rl = link.ok ? (link.data || [])[0] : null;
      let rc = [];
      let rp = null;

      if (rl) {
        [rp, rc] = await Promise.all([
          robloxProfile(rl.username),
          robloxCases(rl.username)
        ]);
      }

      return send(res, 200, {
        user: me,
        banned: !!b,
        ban: b ? { reason: b.reason } : null,
        warns: ws.filter(x =>
          ['warn', 'discord_warn'].includes(String(x.action).toLowerCase())
        ),
        roblox: {
          username: rl?.username || null,
          profile: rp,
          cases: rc
        },
        appeals: ap.ok ? ap.data || [] : []
      });
    }

    if (p === '/api/roblox' && req.method === 'POST') {
      const x = await readJson(req);
      const name = String(x.username || '').trim();

      if (!ROBLOX_NAME.test(name)) {
        return send(res, 400, { error: 'Ungültiger Roblox Benutzername.' });
      }

      const existing = await db(
        `roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`
      );

      if (!existing.ok) {
        return send(res, 500, {
          error: 'Roblox Verknüpfung konnte nicht geprüft werden.'
        });
      }

      if (existing.data?.length) {
        return send(res, 409, {
          error: 'Dein Roblox Benutzername wurde bereits fest hinterlegt und kann nicht geändert werden.'
        });
      }

      const diag = [];
      const rp = await robloxProfile(name, diag);

      if (!rp?.id) {
        if (diag.length) {
          return send(res, 502, {
            error:
              'Roblox ist vom Server aus gerade nicht erreichbar (' +
              diag.join('; ') +
              '). Bitte versuche es später erneut.'
          });
        }

        return send(res, 404, {
          error: 'Dieser Roblox Benutzername wurde nicht gefunden. Bitte überprüfe die Schreibweise.'
        });
      }

      if (x.preview) {
        return send(res, 200, {
          ok: true,
          preview: true,
          profile: rp
        });
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
        : send(res, 500, {
            error: 'Roblox Name konnte nicht gespeichert werden.'
          });
    }

    if (p === '/api/appeals' && req.method === 'POST') {
      const x = await readJson(req);
      const type = String(x.type || '');
      const reason = String(x.reason || '').trim();
      const caseId = x.case_id ? String(x.case_id) : null;

      if (
        !['discord_ban', 'discord_warn', 'roblox'].includes(type) ||
        reason.length < 10 ||
        reason.length > 2000
      ) {
        return send(res, 400, { error: 'Ungültiger Antrag.' });
      }

      if (type === 'discord_ban' && !(await ban(me.id))) {
        return send(res, 400, { error: 'Du bist aktuell nicht gebannt.' });
      }

      if (type !== 'discord_ban' && !caseId) {
        return send(res, 400, { error: 'Kein Fall ausgewählt.' });
      }

      if (caseId) {
        const r = await db(
          `moderation_cases?guild_id=eq.${encodeURIComponent(GUILD)}&case_id=eq.${encodeURIComponent(caseId)}&select=*`
        );

        const c = r.ok ? r.data?.[0] : null;

        if (!c) {
          return send(res, 403, {
            error: 'Dieser Fall gehört nicht zu dir.'
          });
        }

        let owns = false;

        if (type === 'roblox') {
          const link = await db(
            `roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`
          );

          const rl = link.ok ? link.data?.[0] : null;

          owns =
            !!rl &&
            String(c.source).toLowerCase() === 'roblox' &&
            String(c.roblox_username || '').toLowerCase() ===
              String(rl.username).toLowerCase();
        } else {
          owns = String(c.user_id) === String(me.id);
        }

        if (!owns) {
          return send(res, 403, {
            error: 'Dieser Fall gehört nicht zu dir.'
          });
        }
      }

      const dupQuery =
        `appeals?discord_id=eq.${encodeURIComponent(me.id)}` +
        `&type=eq.${encodeURIComponent(type)}` +
        `&status=in.(open,pending)` +
        `&${caseId
          ? 'case_id=eq.' + encodeURIComponent(caseId)
          : 'case_id=is.null'}` +
        `&select=*`;

      const dup = await db(dupQuery);

      if (dup.ok && dup.data?.length) {
        return send(res, 409, {
          error: 'Für diesen Fall läuft bereits ein Antrag.'
        });
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
        body: JSON.stringify({
          ...appealData,
          discord_notified: false,
          bot_handled: false
        })
      });

      if (!r.ok) {
        r = await db('appeals', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(appealData)
        });
      }

      if (!r.ok) {
        console.error(
          'Supabase appeals insert failed:',
          r.status,
          r.data
        );

        return send(res, 500, {
          error:
            'Der Antrag konnte nicht gespeichert werden. Supabase: ' +
            (
              r.data?.message ||
              r.data?.hint ||
              r.data?.details ||
              ('HTTP ' + r.status)
            )
        });
      }

      const appeal = Array.isArray(r.data) ? r.data[0] : r.data;
      const appealId = appeal?.id ?? appeal?.appeal_id;

      if (!appealId) {
        console.error(
          'Supabase appeal insert returned no id:',
          r.data
        );

        return send(res, 500, {
          error:
            'Der Antrag wurde gespeichert, aber es wurde keine Antrags-ID zurückgegeben.'
        });
      }

      const title =
        type === 'discord_ban'
          ? '🔨 Neuer Entbannungsantrag'
          : type === 'discord_warn'
            ? '⚠️ Neuer Warnungs-Widerspruch'
            : '🎮 Neuer Roblox-Widerspruch';

      const detail = caseId
        ? `Fall: #${caseId}`
        : 'Kein Fall';

      const msgBody = {
        content:
          `**${title}**\n\n` +
          `**Antrag:** #${appealId}\n` +
          `**Nutzer:** ${me.username} (${me.id})\n` +
          `**${detail}**\n` +
          `**Begründung:** ${reason}`.slice(0, 2000),

        allowed_mentions: {
          parse: []
        },

        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: 'Annehmen',
                emoji: { name: '✅' },
                custom_id: `webappeal:accept:${appealId}`
              },
              {
                type: 2,
                style: 4,
                label: 'Ablehnen',
                emoji: { name: '❌' },
                custom_id: `webappeal:reject:${appealId}`
              }
            ]
          }
        ]
      };

      const dr = await dapi(
        `/channels/${encodeURIComponent(APPEAL_CHANNEL)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(msgBody)
        }
      );

      if (!dr.ok) {
        console.error(
          'Discord appeal message failed:',
          dr.status,
          dr.data
        );

        return send(res, 502, {
          error:
            'Der Antrag wurde gespeichert, konnte aber nicht nach Discord gesendet werden.'
        });
      }

      const patch = JSON.stringify({
        discord_notified: true,
        discord_message_id: dr.data?.id || null
      });

      let ur = await db(
        `appeals?id=eq.${encodeURIComponent(appealId)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: patch
        }
      );

      if (!ur.ok) {
        await db(
          `appeals?appeal_id=eq.${encodeURIComponent(appealId)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: patch
          }
        );
      }

      return send(res, 200, {
        ok: true,
        appeal_id: appealId
      });
    }

    return send(res, 404, {
      error: 'Nicht gefunden.'
    });

  } catch (e) {
    console.error(e);
    return send(res, 500, {
      error: 'Interner Fehler.'
    });
  }
};
