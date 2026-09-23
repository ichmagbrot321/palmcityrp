const GUILD_ID = "1548652649866596473";
const TEAM_ROLE_ID = "1551649116675768414";
const DISCORD_API = "https://discord.com/api/v10";

function send(res, status, data) {
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, {
      error: "Method not allowed"
    });
  }

  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    return send(res, 500, {
      error: "DISCORD_BOT_TOKEN fehlt",
      details:
        "Die Environment Variable DISCORD_BOT_TOKEN wurde in dieser Vercel Function nicht gefunden."
    });
  }

  try {
    const members = [];
    let after = "0";

    while (true) {
      const url =
        `${DISCORD_API}/guilds/${GUILD_ID}/members` +
        `?limit=1000&after=${encodeURIComponent(after)}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bot ${token}`,
          Accept: "application/json"
        },
        cache: "no-store"
      });

      const responseText = await response.text();

      let page;

      try {
        page = responseText ? JSON.parse(responseText) : null;
      } catch {
        return send(res, 502, {
          error: "Ungültige Antwort von Discord",
          status: response.status,
          details: responseText.slice(0, 1000)
        });
      }

      if (!response.ok) {
        return send(res, 502, {
          error: "Discord API Fehler",
          status: response.status,
          details: page || responseText.slice(0, 1000)
        });
      }

      if (!Array.isArray(page) || page.length === 0) {
        break;
      }

      for (const member of page) {
        if (
          !member ||
          !Array.isArray(member.roles) ||
          !member.roles.includes(TEAM_ROLE_ID)
        ) {
          continue;
        }

        const user = member.user || {};

        const avatar = user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
          : "https://cdn.discordapp.com/embed/avatars/0.png";

        members.push({
          id: String(user.id || ""),
          username: user.username || "",
          display_name:
            member.nick ||
            user.global_name ||
            user.username ||
            "Unbekannt",
          avatar,
          online: false
        });
      }

      if (page.length < 1000) {
        break;
      }

      const lastMember = page[page.length - 1];

      if (!lastMember?.user?.id) {
        break;
      }

      after = String(lastMember.user.id);
    }

    members.sort((a, b) =>
      String(a.display_name).localeCompare(
        String(b.display_name),
        "de"
      )
    );

    res.setHeader(
      "Cache-Control",
      "s-maxage=30, stale-while-revalidate=60"
    );

    return send(res, 200, {
      success: true,
      guild_id: GUILD_ID,
      role_id: TEAM_ROLE_ID,
      count: members.length,
      members,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error("Palm City Team API Fehler:", error);

    return send(res, 500, {
      error: "Interner Serverfehler",
      message: error?.message || String(error),
      name: error?.name || "Error",
      stack:
        process.env.NODE_ENV === "development"
          ? error?.stack || null
          : undefined
    });
  }
}
