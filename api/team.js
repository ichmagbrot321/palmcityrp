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

// Bot-URL absichern: Leerzeichen entfernen, "http://" ergänzen falls es fehlt,
// abschließende Schrägstriche entfernen. Eine kaputte URL ließ die Funktion
// vorher komplett abstürzen (FUNCTION_INVOCATION_FAILED).
function normalizeBotUrl(raw) {
  let value = String(raw || "").trim().replace(/\/+$/, "");

  if (value && !/^https?:\/\//i.test(value)) {
    value = "http://" + value;
  }

  return value;
}

const BOT_API_URL = normalizeBotUrl(
  process.env.TEAM_API_URL || "http://server.infynix.de:40002"
);

const SITE_URL = "https://palmcityrp.vercel.app";
const OAUTH_REDIRECT_URI =
  "https://notruf-craftopia.vercel.app/api/team-dashboard?action=callback";

const DASHBOARD_PATH = "/team-dashboard";
const SESSION_COOKIE = "td_session";
const OAUTH_COOKIE = "td_oauth";
const SESSION_TTL = 60 * 60 * 24 * 7;
const BOT_TIMEOUT_MS = 8000;

// Aktion -> [Methode, Pfad in der Bot-API]
const ROUTES = {
  health: ["GET", "/team/health"],
  state: ["GET", "/team/state"],
  users: ["GET", "/team/users"],
  hire: ["POST", "/team/hire"],
  rank: ["POST", "/team/rank"],
  kick: ["POST", "/team/kick"],
  probation_end: ["POST", "/team/probation/end"],
  probation_extend: ["POST", "/team/probation/extend"],
  probation_abort: ["POST", "/team/probation/abort"],
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
  application_action: ["POST", "/team/applications/action"],
  history: ["GET", "/team/history"],
  activity: ["GET", "/team/activity"],
  support: ["GET", "/team/support"],
  feedback: ["GET", "/team/feedback"],
  shifts: ["GET", "/team/shifts"],
  shifts_end: ["POST", "/team/shifts/end"],
  // Regelwerk (Rolle + Passwort werden im Bot geprüft)
  rules: ["GET", "/team/rules"],
  rules_unlock: ["POST", "/team/rules/unlock"],
  rules_edit: ["POST", "/team/rules/edit"],
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

  if (!BOT_API_URL) {
    return json(res, 500, {
      ok: false,
      error: "TEAM_API_URL ist in Vercel leer oder ungültig.",
      code: "bot_url_config",
    });
  }

  const route = ROUTES[action];

  if (!route) {
    return json(res, 404, {
      ok: false,
      error: `Unbekannte Dashboard-Aktion: ${action}`,
      code: "route_not_found",
    });
  }

  const [method, path] = route;

  if (req.method !== method) {
    return json(res, 405, {
      ok: false,
      error: `Methode nicht erlaubt. Aktion "${action}" erwartet ${method}, erhalten wurde ${req.method}.`,
      code: "method",
      action,
      expected_method: method,
      received_method: req.method,
      route: path,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOT_TIMEOUT_MS);

  try {
    let target;

    try {
      target = new URL(BOT_API_URL + path);
    } catch (error) {
      console.error("Ungültige TEAM_API_URL:", BOT_API_URL, error);

      return json(res, 500, {
        ok: false,
        error:
          "TEAM_API_URL in Vercel ist keine gültige Adresse. Beispiel: http://server.infynix.de:40002",
        code: "bot_url_config",
      });
    }

    if (method === "GET") {
      for (const [key, value] of url.searchParams) {
        if (key !== "action") {
          target.searchParams.set(key, value);
        }
      }
    }

    const upstream = await fetch(target, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "X-Actor-Id": session.id,
      },
      body,
      signal: controller.signal,
    });

    const contentType = upstream.headers.get("content-type") || "";
    const text = await upstream.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    // Logging OHNE Antwortinhalt bei Regelwerk-Aktionen (enthalten Passwörter/Texte).
    console.error("Dashboard -> Bot", {
      action,
      method,
      target: target.toString(),
      status: upstream.status,
      contentType,
      responsePreview: action.startsWith("rules") ? "(nicht geloggt)" : text.slice(0, 1500),
    });

    if (upstream.status === 401) {
      return json(res, 502, {
        ok: false,
        error:
          "Der API-Key von Vercel und Bot stimmt nicht überein.",
        code: "bad_key",
        action,
        upstream_status: upstream.status,
        upstream_url: target.toString(),
        upstream_content_type: contentType,
        upstream_response: text.slice(0, 1000),
      });
    }

    // 405 vom Bot: Das ist besonders wichtig, weil damit sichtbar wird,
    // ob tatsächlich der aiohttp-Endpunkt oder ein vorgeschalteter Proxy
    // die falsche HTTP-Methode ablehnt.
    if (upstream.status === 405) {
      return json(res, 502, {
        ok: false,
        error:
          `Der Bot/Proxy hat HTTP 405 (Method Not Allowed) zurückgegeben. ` +
          `Gesendet: ${method} ${target.pathname}.`,
        code: "bot_method_not_allowed",
        action,
        request_method: method,
        request_path: target.pathname,
        upstream_status: 405,
        upstream_url: target.toString(),
        upstream_allow: upstream.headers.get("allow") || null,
        upstream_content_type: contentType,
        upstream_response: text.slice(0, 1500),
      });
    }

    // 404 vom Bot: Route existiert im Bot (noch) nicht, z. B. weil die neue
    // team_dashboard_api.py nicht geladen wurde.
    if (upstream.status === 404 && !data) {
      return json(res, 502, {
        ok: false,
        error:
          `Der Bot kennt diese Route nicht (${method} ${target.pathname}). ` +
          `Läuft die neue team_dashboard_api.py?`,
        code: "bot_route_missing",
        action,
        upstream_status: 404,
        upstream_url: target.toString(),
      });
    }

    if (!data) {
      return json(res, 502, {
        ok: false,
        error:
          `Ungültige Antwort vom Bot. (HTTP ${upstream.status})`,
        code: "bad_response",
        action,
        request_method: method,
        request_path: target.pathname,
        upstream_status: upstream.status,
        upstream_url: target.toString(),
        upstream_content_type: contentType,
        upstream_response: text.slice(0, 1500),
      });
    }

    return json(res, upstream.status, data);
  } catch (error) {
    if (error && error.name === "AbortError") {
      console.error("Bot API Timeout:", {
        action,
        method,
        url: `${BOT_API_URL}${path}`,
        timeout_ms: BOT_TIMEOUT_MS,
      });

      return json(res, 504, {
        ok: false,
        error:
          "Der Bot hat zu lange gebraucht. Die Aktion wurde eventuell trotzdem ausgeführt, bitte Seite neu laden.",
        code: "bot_timeout",
        action,
        timeout_ms: BOT_TIMEOUT_MS,
        upstream_url: `${BOT_API_URL}${path}`,
      });
    }

    console.error("Bot API Fehler:", error);

    const reason =
      (error && error.cause && error.cause.code) ||
      (error && error.code) ||
      (error && error.name) ||
      "unbekannt";

    return json(res, 502, {
      ok: false,
      error: `Der Bot ist nicht erreichbar. (Grund: ${reason})`,
      code: "bot_offline",
      action,
      upstream_url: `${BOT_API_URL}${path}`,
      reason,
      detail: error && error.message ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

// Prüft den Bot separat über GET /team/health.
// Dadurch lässt sich unterscheiden:
// - Bot/Port nicht erreichbar
// - API-Key falsch
// - /team/health selbst liefert 405
// - Bot läuft, aber TeamModerationCog fehlt
async function checkBotHealth(session) {
  if (!API_KEY) {
    return {
      ok: false,
      status: 500,
      code: "api_key_config",
      error: "DASHBOARD_API_KEY ist in Vercel nicht gesetzt.",
    };
  }

  let target;

  try {
    target = new URL(BOT_API_URL + "/team/health");
  } catch {
    return {
      ok: false,
      status: 500,
      code: "bot_url_config",
      error:
        "TEAM_API_URL in Vercel ist keine gültige Adresse.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOT_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": API_KEY,
        "X-Actor-Id": session.id,
      },
      signal: controller.signal,
    });

    const contentType = upstream.headers.get("content-type") || "";
    const text = await upstream.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    console.error("Dashboard Bot Health", {
      target: target.toString(),
      status: upstream.status,
      contentType,
      responsePreview: text.slice(0, 1000),
    });

    if (upstream.status === 405) {
      return {
        ok: false,
        status: 502,
        code: "bot_health_method_not_allowed",
        error:
          "GET /team/health wurde vom Bot/Proxy mit HTTP 405 abgelehnt.",
        upstream_status: 405,
        upstream_url: target.toString(),
        upstream_allow: upstream.headers.get("allow") || null,
        upstream_content_type: contentType,
        upstream_response: text.slice(0, 1000),
      };
    }

    if (upstream.status === 401) {
      return {
        ok: false,
        status: 502,
        code: "bad_key",
        error:
          "Der API-Key von Vercel und Bot stimmt nicht überein.",
        upstream_status: 401,
        upstream_url: target.toString(),
        upstream_response: text.slice(0, 1000),
      };
    }

    if (!data) {
      return {
        ok: false,
        status: 502,
        code: "bot_health_bad_response",
        error:
          `Der Bot-Health-Endpunkt lieferte keine gültige JSON-Antwort (HTTP ${upstream.status}).`,
        upstream_status: upstream.status,
        upstream_url: target.toString(),
        upstream_content_type: contentType,
        upstream_response: text.slice(0, 1000),
      };
    }

    return {
      ok: upstream.ok && data.ok !== false,
      status: upstream.status,
      code: upstream.ok ? "ok" : "bot_health_error",
      data,
      upstream_status: upstream.status,
      upstream_url: target.toString(),
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      return {
        ok: false,
        status: 504,
        code: "bot_health_timeout",
        error: "Der Bot-Health-Endpunkt hat nicht rechtzeitig geantwortet.",
        upstream_url: target.toString(),
      };
    }

    const reason =
      (error && error.cause && error.cause.code) ||
      (error && error.code) ||
      (error && error.name) ||
      "unbekannt";

    return {
      ok: false,
      status: 502,
      code: "bot_health_offline",
      error: `Der Bot ist über /team/health nicht erreichbar. (Grund: ${reason})`,
      reason,
      detail: error && error.message ? error.message : String(error),
      upstream_url: target.toString(),
    };
  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// ÖFFENTLICHE TEAM-API
// ============================================================
// Die Website ruft /api/team ohne "action" und ohne Discord-Login auf.
// Dieser Block ergänzt genau diese Route, ohne die bestehende
// Team-Dashboard-API darunter zu verändern.

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PUBLIC_TEAM_GUILD_ID = "1548652649866596473";
const PUBLIC_TEAM_ROLE_ID = "1551649116675768414";

async function getPublicTeamMembers() {
  if (!DISCORD_BOT_TOKEN) {
    throw new Error("DISCORD_BOT_TOKEN fehlt in den Vercel Environment Variables.");
  }

  const members = [];
  let after = "0";

  while (true) {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${PUBLIC_TEAM_GUILD_ID}/members?limit=1000&after=${after}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Discord API ${response.status}: ${body.slice(0, 300)}`
      );
    }

    const page = await response.json();

    if (!Array.isArray(page) || page.length === 0) {
      break;
    }

    for (const member of page) {
      if (
        !Array.isArray(member.roles) ||
        !member.roles.includes(PUBLIC_TEAM_ROLE_ID)
      ) {
        continue;
      }

      members.push({
        id: String(member.user.id),
        username: member.user.username,
        display_name:
          member.nick ||
          member.user.global_name ||
          member.user.username,
        avatar: member.user.avatar
          ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`
          : "https://cdn.discordapp.com/embed/avatars/0.png",
        online: false,
      });
    }

    if (page.length < 1000) {
      break;
    }

    after = page[page.length - 1].user.id;
  }

  members.sort((a, b) =>
    String(a.display_name || "").localeCompare(
      String(b.display_name || ""),
      "de",
      { sensitivity: "base" }
    )
  );

  return members;
}

async function publicTeam(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, {
      error: "Method not allowed",
      code: "method_not_allowed",
    });
  }

  try {
    const members = await getPublicTeamMembers();

    return json(res, 200, {
      guild_id: PUBLIC_TEAM_GUILD_ID,
      role_id: PUBLIC_TEAM_ROLE_ID,
      members,
      count: members.length,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Öffentliche Team-API Fehler:", error);

    return json(res, 502, {
      error: "Discord Team konnte nicht geladen werden.",
      code: "team_api_error",
      detail: error?.message || String(error),
    });
  }
}

// ============================================================
// HANDLER
// ============================================================

async function handle(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const url = new URL(
    req.url,
    `https://${req.headers.host}`
  );

  const action = url.searchParams.get("action") || "";

  // Öffentliche Website-Teamliste: GET /api/team
  // Muss vor der Session-Prüfung behandelt werden, da die Website
  // dafür keinen Discord-Login benötigt.
  if (!action && req.method === "GET") {
    return publicTeam(req, res);
  }

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

  if (action === "health") {
    if (req.method !== "GET") {
      return json(res, 405, {
        ok: false,
        error: `Health erwartet GET, erhalten wurde ${req.method}.`,
        code: "method",
      });
    }

    const health = await checkBotHealth(session);

    return json(
      res,
      health.status || (health.ok ? 200 : 502),
      health.ok
        ? {
            ok: true,
            bot: health.data || null,
            upstream_status: health.upstream_status,
            upstream_url: health.upstream_url,
          }
        : health
    );
  }

  return proxy(req, res, url, action, session);
}

// Sicherheitsnetz: Jeder unerwartete Fehler wird ins Vercel-Log geschrieben
// und als normale JSON-Antwort zurückgegeben (statt FUNCTION_INVOCATION_FAILED).
// Der genaue Fehlertext wird nur angemeldeten Nutzern angezeigt.
export default async function handler(req, res) {
  try {
    return await handle(req, res);
  } catch (error) {
    console.error("Dashboard Handler Fehler:", error);

    if (res.headersSent) {
      return;
    }

    let detail = "";

    try {
      if (getSession(req)) {
        detail = ` (${error && error.message ? error.message : String(error)})`;
      }
    } catch {
      detail = "";
    }

    return json(res, 500, {
      ok: false,
      error: `Interner Fehler im Dashboard-Server${detail}`,
      code: "server_error",
    });
  }
}
