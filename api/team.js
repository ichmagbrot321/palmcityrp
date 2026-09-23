const GUILD_ID = "1548652649866596473";
const TEAM_ROLE_ID = "1551649116675768414";
const DISCORD_API = "https://discord.com/api/v10";

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    return new Response(
      JSON.stringify({
        error: "DISCORD_BOT_TOKEN fehlt in den Vercel Environment Variables."
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const members = [];
    let after = "0";

    while (true) {
      const url =
        `${DISCORD_API}/guilds/${GUILD_ID}/members` +
        `?limit=1000&after=${after}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bot ${token}`
        }
      });

      if (!response.ok) {
        const details = await response.text();

        return new Response(
          JSON.stringify({
            error: "Discord API Fehler",
            status: response.status,
            details: details.slice(0, 500)
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const page = await response.json();

      if (!Array.isArray(page) || page.length === 0) {
        break;
      }

      for (const member of page) {
        if (
          Array.isArray(member.roles) &&
          member.roles.includes(TEAM_ROLE_ID)
        ) {
          const user = member.user || {};

          members.push({
            id: user.id,
            username: user.username || "",
            display_name:
              member.nick ||
              user.global_name ||
              user.username ||
              "Unbekannt",
            avatar: user.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
              : "https://cdn.discordapp.com/embed/avatars/0.png",
            online: false
          });
        }
      }

      if (page.length < 1000) {
        break;
      }

      after = page[page.length - 1].user.id;
    }

    members.sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "de")
    );

    return new Response(
      JSON.stringify({
        success: true,
        guild_id: GUILD_ID,
        role_id: TEAM_ROLE_ID,
        count: members.length,
        members,
        updated_at: new Date().toISOString()
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control":
            "s-maxage=30, stale-while-revalidate=60"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Interner Serverfehler",
        details: String(error?.message || error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
