import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ============================================================
// KONFIGURATION
// ============================================================

const CLIENT_ID = "1547984607255994388";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const API_KEY = process.env.DASHBOARD_API_KEY;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  (API_KEY
    ? createHmac("sha256", API_KEY).update("td-session-v1").digest("hex")
    : "");

const BOT_API_URL = (
  process.env.TEAM_API_URL || "http://server.infynix.de:40002"
).replace(/\/$/, "");

const SITE_URL = "https://palmcityrp.vercel.app";
const OAUTH_REDIRECT_URI =
  "https://palmcityrp.vercel.app/api/team-dashboard?action=callback";

const DASHBOARD_PATH = "/team-dashboard";
const SESSION_COOKIE = "td_session";
const OAUTH_COOKIE = "td_oauth";
const SESSION_TTL = 60 * 60 * 24 * 7;
const BOT_TIMEOUT_MS = 8000;

// Aktion -> [Methode, Pfad in der Bot-API]
const ROUTES = {
  state: ["GET", "/team/state"],
  users: ["GET", "/team/users"],
  hire: ["POST", "/team/hire"],
  rank: ["POST", "/team/rank"],
  kick: ["POST", "/team/kick"],
  warn: ["POST", "/team/warn"],
  warn_remove: ["POST", "/team/warn/remove"],
  ban_remove: ["POST", "/team/ban/remove"],
  ranks_config: ["POST", "/team/config/ranks"],
  absence_end: ["POST", "/team/absence/end"],
  complaint_status: ["POST", "/team/complaint/status"],
  complaint_warn: ["POST", "/team/complaint/warn"],
  absence_extend: ["POST", "/team/absence/extend"],
  absence_approve: ["POST", "/team/absence/approve"],
  absence_reject: ["POST", "/team/absence/reject"],
  applications_status: ["POST", "/team/applications/status"],
  history: ["GET", "/team/history"],
  activity: ["GET", "/team/activity"],
  support: ["GET", "/team/support"],
};

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

function json(res, status, body) {
  res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

function redirect(res, location, cookies = []) {
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.status(302).setHeader("Location", location);
  res.end();
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function parseCookies(header = "") {
  const out = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }

  return out;
}

function sign(value) {
  return createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function makeToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature || "");

  if (
    given.length !== expected.length ||
    !timingSafeEqual(given, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );

    if (!payload.exp || payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getSession(req) {
  return readToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

// ============================================================
// DISCORD-LOGIN
// ============================================================

function login(req, res) {
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: "identify",
    state,
    prompt: "consent",
  });

  return redirect(
    res,
    `https://discord.com/oauth2/authorize?${params}`,
    [cookie(OAUTH_COOKIE, state, 600)]
  );
}

async function callback(req, res, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = parseCookies(req.headers.cookie)[OAUTH_COOKIE];
  const clearOauth = cookie(OAUTH_COOKIE, "", 0);

  if (!code || !state || !savedState || state !== savedState) {
    return redirect(
      res,
      `${DASHBOARD_PATH}?error=login`,
      [clearOauth]
    );
  }

  try {
    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: OAUTH_REDIRECT_URI,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text().catch(() => "");

      console.error(
        "Discord OAuth Token Fehler:",
        tokenResponse.status,
        errorText
      );

      throw new Error("token");
    }

    const { access_token: accessToken } = await tokenResponse.json();

    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!userResponse.ok) {
      throw new Error("user");
    }

    const user = await userResponse.json();

    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${Number(
          (BigInt(user.id) >> 22n) % 6n
        )}.png`;

    const token = makeToken({
      id: String(user.id),
      name: user.global_name || user.username,
      avatar,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    });

    return redirect(
      res,
      DASHBOARD_PATH,
      [
        cookie(SESSION_COOKIE, token, SESSION_TTL),
        clearOauth,
      ]
    );
  } catch (error) {
    console.error("Discord Login Fehler:", error);

    return redirect(
      res,
      `${DASHBOARD_PATH}?error=login`,
      [clearOauth]
    );
  }
}

// ============================================================
// PROXY ZUR BOT-API
// ============================================================

async function proxy(req, res, url, action, session) {
  if (!API_KEY) {
    return json(res, 500, {
      ok: false,
      error: "DASHBOARD_API_KEY ist in Vercel nicht gesetzt.",
      code: "api_key_config",
    });
  }

  const [method, path] = ROUTES[action];

  if (req.method !== method) {
    return json(res, 405, {
      ok: false,
      error: "Methode nicht erlaubt.",
      code: "method",
    });
  }

  let body;

  if (method === "POST") {
    const origin = req.headers.origin;
    let originHost = null;

    try {
      originHost = origin ? new URL(origin).host : null;
    } catch {
      originHost = null;
    }

    if (originHost !== req.headers.host) {
      return json(res, 403, {
        ok: false,
        error: "Ungültige Herkunft.",
        code: "origin",
      });
    }

    body =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});
  }

  const target = new URL(BOT_API_URL + path);

  if (method === "GET") {
    for (const [key, value] of url.searchParams) {
      if (key !== "action") {
        target.searchParams.set(key, value);
      }
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    BOT_TIMEOUT_MS
  );

  try {
    const upstream = await fetch(target, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "X-Actor-Id": session.id,
      },
      body,
      signal: controller.signal,
    });

    const text = await upstream.text();

    let data = null;

    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (upstream.status === 401) {
      return json(res, 502, {
        ok: false,
        error:
          "Der API-Key von Vercel und Bot stimmt nicht überein.",
        code: "bad_key",
      });
    }

    if (!data) {
      return json(res, 502, {
        ok: false,
        error: "Ungültige Antwort vom Bot.",
        code: "bad_response",
      });
    }

    return json(res, upstream.status, data);
  } catch (error) {
    if (error && error.name === "AbortError") {
      return json(res, 504, {
        ok: false,
        error:
          "Der Bot hat zu lange gebraucht. Die Aktion wurde eventuell trotzdem ausgeführt, bitte Seite neu laden.",
        code: "bot_timeout",
      });
    }

    console.error("Bot API Fehler:", error);

    return json(res, 502, {
      ok: false,
      error: "Der Bot ist nicht erreichbar.",
      code: "bot_offline",
    });
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// HANDLER
// ============================================================

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const url = new URL(
    req.url,
    `https://${req.headers.host}`
  );

  const action = url.searchParams.get("action") || "";

  // OAuth darf unabhängig vom Bot-API-Key funktionieren.
  // Die Bot-API wird erst bei geschützten Dashboard-Aktionen benötigt.
  if (action === "login") {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json(res, 500, {
        ok: false,
        error: "Discord OAuth ist nicht vollständig konfiguriert. DISCORD_CLIENT_SECRET fehlt.",
        code: "oauth_config",
      });
    }
    return login(req, res);
  }

  if (action === "callback") {
    if (!CLIENT_ID || !CLIENT_SECRET || !SESSION_SECRET) {
      return json(res, 500, {
        ok: false,
        error: "Discord OAuth ist nicht vollständig konfiguriert. DISCORD_CLIENT_SECRET oder SESSION_SECRET fehlt.",
        code: "oauth_config",
      });
    }
    return callback(req, res, url);
  }

  if (action === "logout") {
    return redirect(
      res,
      DASHBOARD_PATH,
      [cookie(SESSION_COOKIE, "", 0)]
    );
  }

  const session = getSession(req);

  if (!session) {
    return json(res, 401, {
      ok: false,
      error: "Nicht angemeldet.",
      code: "no_session",
    });
  }

  if (action === "me") {
    return json(res, 200, {
      ok: true,
      user: {
        id: session.id,
        name: session.name,
        avatar: session.avatar,
      },
    });
  }

  if (!ROUTES[action]) {
    return json(res, 404, {
      ok: false,
      error: "Unbekannte Aktion.",
      code: "not_found",
    });
  }

  return proxy(req, res, url, action, session);
}
