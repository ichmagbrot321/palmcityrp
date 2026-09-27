const API = "/api/team-dashboard";
const POLL_MS = 5000;

const $ = (selector, root = document) => root.querySelector(selector);

class ApiErr extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Baut DOM-Elemente ohne innerHTML (kein XSS durch Nutzernamen). */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;

    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }

  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  return el;
}

// Feste, eigene Icons (keine Nutzerdaten).
const ICONS = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-4.2-1.1L3 20l1.5-4.4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  history: '<path d="M3 3v5h5"<path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>',
  headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 14v4a2 2 0 0 1-2 2h-1v-6h3z"/><path d="M3 14v4a2 2 0 0 0 2 2h1v-6H3z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
};

function icon(name) {
  const span = document.createElement("span");
  span.className = "ico";
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return span;
}

function fillStaticIcons() {
  for (const el of document.querySelectorAll("[data-icon]")) {
    el.replaceChildren(icon(el.dataset.icon).firstChild);
  }
}

const TITLES = {
  team: ["Teamliste", "Ränge, Verwarnungen und Entfernen"],
  users: ["Nutzer", "Hole Mitglieder ins Team"],
  bans: ["Teamsperren", "Personen, die sich nicht fürs Team bewerben können"],
  absences: ["Abmeldungen", "Wer ist wie lange abwesend und warum"],
  complaints: ["Beschwerden", "Teambeschwerden bearbeiten"],
  applications: ["Bewerbungen", "Teambewerbungen und Status"],
  activity: ["Aktivität", "Nachrichten und Voice-Zeit im Team"],
  history: ["Verlauf", "Alle Aktionen mit Suche, Filter und Export"],
  departures: ["Austritte", "Freiwillige Austritte und erkannte Server-Aktionen"],
  support: ["Support", "Bewertungen, Tickets und Voice-Support pro Teammitglied"],
  feedback: ["Team-Feedback", "Rückmeldungen aus dem Discord-Feedback-Panel"],
  settings: ["Einstellungen", "Rangleiste festlegen"],
};

const S = {
  me: null,
  data: null,
  tab: "team",
  expanded: new Set(),
  memberNotes: loadMemberNotes(),
  draft: [],
  dirty: false,
  keys: {},
  userQuery: "",
  userTimer: null,
  activity: null,
  activityAt: 0,
  activityDays: 7,
  inactiveCount: 0,
  histTimer: null,
  support: null,
  supportAt: 0,
  ratingsExpanded: new Set(),
  feedback: null,
  feedbackAt: 0,
  appFilter: "all",
  appQuery: "",
  appSort: "newest",
};

// Persönliche Teamnotizen werden lokal pro Teammitglied gespeichert.
function loadMemberNotes() {
  try {
    const raw = localStorage.getItem("palm-city-team-notes");
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function saveMemberNote(member, value) {
  const text = String(value || "").trim().slice(0, 2000);
  if (text) S.memberNotes[member.id] = text;
  else delete S.memberNotes[member.id];

  try {
    localStorage.setItem("palm-city-team-notes", JSON.stringify(S.memberNotes));
  } catch {
    // Falls der Browser lokalen Speicher blockiert, bleibt die Notiz bis zum Neuladen erhalten.
  }
  toast(text ? "Notiz gespeichert." : "Notiz gelöscht.");
  renderTeam(true);
}

// ============================================================
// API
// ============================================================

async function api(action, { method = "GET", params = {}, body } = {}) {
  const url = new URL(API, location.origin);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let res;

  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiErr(0, "Keine Verbindung zum Server.", "network");
  }

  let data = null;
  try { data = await res.json(); } catch { /* ignorieren */ }

  if (!res.ok || !data || data.ok === false) {
    throw new ApiErr(res.status, data?.error || "Unbekannter Fehler.", data?.code || "error");
  }

  return data;
}

// ============================================================
// UI-HELFER
// ============================================================

function toast(message, isError = false) {
  const el = h(
    "div",
    { class: "toast" + (isError ? " error" : ""), role: "status" },
    icon(isError ? "alert" : "check"),
    message
  );
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 4200);
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function avatar(url) {
  return h("img", { src: url || "", alt: "", width: 42, height: 42, loading: "lazy" });
}

function button(label, onclick, cls = "", disabled = false, iconName = null) {
  return h(
    "button",
    { type: "button", class: "btn small " + cls, onclick, disabled },
    iconName ? icon(iconName) : null,
    label
  );
}

function rankBadge(member) {
  if (!member.rank_name) return h("span", { class: "badge none" }, "Kein Rang");

  return h(
    "span",
    { class: "badge rank", style: member.rank_color ? `--c:${member.rank_color}` : "" },
    h("i"),
    member.rank_name
  );
}

function modal({ title, subtitle, content, confirm, danger = false, onConfirm }) {
  const error = h("p", { class: "err", hidden: true });
  const okButton = h("button", { type: "button", class: "btn " + (danger ? "danger" : "primary") }, confirm);
  const cancel = h("button", { type: "button", class: "btn ghost" }, "Abbrechen");

  const box = h(
    "div",
    { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("h3", {}, title),
    subtitle ? h("p", { class: "sub" }, subtitle) : null,
    content,
    error,
    h("div", { class: "modal-actions" }, cancel, okButton)
  );

  const back = h("div", { class: "backdrop" }, box);

  const onKey = (event) => { if (event.key === "Escape") close(); };

  function close() {
    back.remove();
    document.removeEventListener("keydown", onKey);
  }

  back.addEventListener("click", (event) => { if (event.target === back) close(); });
  cancel.addEventListener("click", close);

  okButton.addEventListener("click", async () => {
    okButton.disabled = true;
    error.hidden = true;

    try {
      await onConfirm();
      close();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      okButton.disabled = false;
      if (err.code === "no_access") refresh();
    }
  });

  document.addEventListener("keydown", onKey);
  document.body.append(back);
  (box.querySelector("select, textarea") || okButton).focus();
}

function rankSelect(ranks, selectedId) {
  return h(
    "select",
    { id: "rankSelect" },
    [...ranks].reverse().map((rank) =>
      h("option", { value: rank.id, selected: rank.id === selectedId }, rank.name)
    )
  );
}

// ============================================================
// AKTIONEN
// ============================================================

async function act(action, body) {
  const data = await api(action, { method: "POST", body });
  toast(data.message || "Gespeichert.");
  await refresh();
  return data;
}

async function quickRank(member, direction) {
  try {
    await act("rank", { user_id: member.id, action: direction });
  } catch (err) {
    toast(err.message, true);
    if (err.code === "no_access") await refresh();
  }
}

function openRankModal(member) {
  const ranks = S.data.ranks;
  if (!ranks.length) return toast("Es ist noch keine Rangleiste eingerichtet. Ein Administrator kann sie unter „Einstellungen“ anlegen.", true);

  const select = rankSelect(ranks, member.rank_id);

  modal({
    title: "Rang setzen",
    subtitle: member.name,
    content: h("div", { class: "field" }, h("label", { for: "rankSelect" }, "Neuer Rang"), select),
    confirm: "Rang setzen",
    onConfirm: () => act("rank", { user_id: member.id, action: "set", rank_id: select.value }),
  });
}

function openWarnModal(member) {
  const reason = h("textarea", { id: "reason", maxlength: 300, placeholder: "Was ist vorgefallen?" });

  modal({
    title: "Verwarnung geben",
    subtitle: member.name,
    content: h("div", { class: "field" }, h("label", { for: "reason" }, "Grund"), reason),
    confirm: "Verwarnen",
    onConfirm: async () => {
      await act("warn", { user_id: member.id, reason: reason.value });
      S.expanded.add(member.id);
      renderTeam(true);
    },
  });
}

function openKickModal(member) {
  const reason = h("textarea", { id: "reason", maxlength: 300, placeholder: "Optional" });
  const lockDefault = Number((S.data.settings && S.data.settings.lock_days_default) || 0);
  const lock = h("input", { id: "lockDays", type: "number", min: 0, max: 3650, value: String(lockDefault) });

  modal({
    title: "Aus dem Team entfernen",
    subtitle: member.name,
    danger: true,
    content: h(
      "div",
      {},
      h("div", { class: "field" }, h("label", { for: "reason" }, "Grund"), reason),
      h("div", { class: "field" }, h("label", { for: "lockDays" }, "Teamsperre in Tagen (0 = dauerhaft)"), lock),
      h("p", { class: "sub" }, "Die Person erhält die Teamkick-Rolle (Teamsperre) und verliert alle Teamrollen. Nach Ablauf der Sperre kann sie sich automatisch wieder bewerben.")
    ),
    confirm: "Aus dem Team entfernen",
    onConfirm: () =>
      act("kick", {
        user_id: member.id,
        reason: reason.value,
        lock_days: lock.value.trim() === "" ? lockDefault : Math.max(0, Math.round(Number(lock.value) || 0)),
      }),
  });
}

function openHireModal(user) {
  const ranks = S.data.ranks;
  if (!ranks.length) return toast("Es ist noch keine Rangleiste eingerichtet. Ein Administrator kann sie unter „Einstellungen“ anlegen.", true);

  const select = rankSelect(ranks, ranks[0].id);

  modal({
    title: "Ins Team holen",
    subtitle: user.name,
    content: h("div", { class: "field" }, h("label", { for: "rankSelect" }, "Startrang"), select),
    confirm: "Ins Team holen",
    onConfirm: async () => {
      await act("hire", { user_id: user.id, rank_id: select.value });
      await loadUsers();
    },
  });
}

async function removeWarn(member, warn) {
  try {
    await act("warn_remove", { user_id: member.id, warn_id: warn.id });
  } catch (err) {
    toast(err.message, true);
  }
}

async function removeBan(ban) {
  try {
    await act("ban_remove", { user_id: ban.user_id });
  } catch (err) {
    toast(err.message, true);
  }
}

// ============================================================
// RENDER
// ============================================================

function rankStyle(member) {
  return member.rank_color ? `--rank:${member.rank_color}` : "";
}

function memberCard(member) {
  const ranks = S.data.ranks;
  const open = S.expanded.has(member.id);
  const count = member.warns.length;
  const note = S.memberNotes[member.id] || "";

  const toggle = () => {
    if (open) S.expanded.delete(member.id);
    else S.expanded.add(member.id);
    renderTeam(true);
  };

  const head = h(
    "button",
    {
      type: "button",
      class: "team-card-head",
      "aria-expanded": String(open),
      "aria-label": `${member.name} ${open ? "schließen" : "öffnen"}`,
      onclick: toggle,
    },
    h(
      "div",
      { class: "who" },
      avatar(member.avatar),
      h(
        "div",
        { class: "names" },
        h("strong", {}, member.name),
        h("span", { class: "sub mono" }, "@" + member.username),
        h(
          "div",
          { class: "tags" },
          rankBadge(member),
          member.absence
            ? h("span", { class: "badge info", title: member.absence.reason }, icon("clock"), "Abgemeldet")
            : null,
          count
            ? h("span", { class: "badge warn" }, icon("alert"), count === 1 ? "1 Verwarnung" : `${count} Verwarnungen`)
            : h("span", { class: "badge ok" }, icon("check"), "Keine Verwarnung"),
          note ? h("span", { class: "badge info" }, icon("message"), "Notiz vorhanden") : null
        )
      )
    ),
    h("span", { class: "team-card-chevron", "aria-hidden": "true" }, "⌄")
  );

  const noteInput = h("textarea", {
    maxlength: 2000,
    placeholder: "Interne Notiz zu diesem Teammitglied …",
    "aria-label": `Notiz für ${member.name}`,
    value: note,
  });

  const details = h(
    "div",
    { class: "team-card-details" },
    h(
      "div",
      { class: "team-card-actions" },
      h(
        "div",
        { class: "seg" },
        button("Uprank", () => quickRank(member, "up"), "", !ranks.length || member.rank_index >= ranks.length - 1, "up"),
        button("Downrank", () => quickRank(member, "down"), "", member.rank_index <= 0, "down")
      ),
      button("Rang setzen", () => openRankModal(member), "", !ranks.length, "award"),
      button("Verwarnen", () => openWarnModal(member), "", false, "alert"),
      button("Entfernen", () => openKickModal(member), "danger", false, "userMinus")
    ),
    h(
      "div",
      { class: "team-card-notes" },
      h("label", { for: `team-note-${member.id}` }, "Interne Notiz"),
      h("textarea", {
        id: `team-note-${member.id}`,
        maxlength: 2000,
        placeholder: "Interne Notiz zu diesem Teammitglied …",
        "aria-label": `Notiz für ${member.name}`,
      }),
      h(
        "div",
        { class: "team-note-actions" },
        h("span", { class: "team-note-meta" }, "Wird lokal in diesem Browser gespeichert."),
        button("Notiz löschen", () => saveMemberNote(member, ""), "ghost", !note, "x"),
        button("Notiz speichern", () => saveMemberNote(member, noteInput.value), "primary", false, "check")
      )
    ),
    count
      ? h(
          "div",
          { class: "team-warns" },
          h("div", { class: "team-warns-title" }, "Verwarnungen"),
          ...member.warns.map((warn) =>
            h(
              "div",
              { class: "warn-item" },
              h(
                "div",
                {},
                h("p", {}, warn.reason),
                h("span", { class: "sub" }, `${warn.by_name} · ${formatDate(warn.at)}`)
              ),
              button("Entfernen", () => removeWarn(member, warn), "ghost", false, "x")
            )
          )
        )
      : null
  );

  // Das Feld wird erst nach dem Erzeugen eingesetzt, damit der aktuelle Text sauber bleibt.
  details.querySelector("textarea")?.remove();
  details.querySelector(".team-card-notes")?.insertBefore(noteInput, details.querySelector(".team-note-actions"));

  return h("li", { class: `team-card${open ? " is-open" : ""}`, style: rankStyle(member) }, head, open ? details : null);
}

function stat(iconName, value, label, cls = "") {
  const box = h("span", { class: "ico-box" });
  box.append(icon(iconName).firstChild);
  return h("div", { class: "stat " + cls }, box, h("div", {}, h("strong", {}, value), h("span", {}, label)));
}

function renderStats() {
  const { team, bans } = S.data;
  const warns = team.reduce((sum, member) => sum + member.warns.length, 0);

  const key = JSON.stringify([team.length, warns, bans.length]);
  if (key === S.keys.stats) return;
  S.keys.stats = key;

  $("#stats").replaceChildren(
    stat("users", team.length, "Im Team"),
    stat("alert", warns, "Verwarnungen", "warn"),
    stat("ban", bans.length, "Teamsperren", "bad")
  );
}

function renderTeam(force = false) {
  renderStats();

  const query = $("#teamSearch").value.trim().toLowerCase();

  const list = S.data.team.filter(
    (member) => !query || member.name.toLowerCase().includes(query) || member.username.toLowerCase().includes(query)
  );

  const key = JSON.stringify([list, S.data.ranks, [...S.expanded]]);
  if (!force && key === S.keys.team) return;
  S.keys.team = key;

  const box = $("#teamList");

  if (!list.length) {
    box.className = "list";
    box.replaceChildren(
      h(
        "li",
        { class: "empty" },
        query ? "Kein Teammitglied gefunden. Versuche einen anderen Namen." : "Noch keine Teammitglieder. Hole Nutzer über den Tab „Nutzer“ ins Team."
      )
    );
    return;
  }

  box.className = "team-grid";
  box.replaceChildren(...list.map(memberCard));
}

function renderUsers(users, total) {
  const box = $("#userList");
  const key = JSON.stringify([users, S.data.ranks]);
  if (key === S.keys.users) return;
  S.keys.users = key;

  if (!users.length) {
    box.replaceChildren(h("li", { class: "empty" }, "Keine Nutzer gefunden. Versuche einen anderen Namen."));
    $("#userNote").textContent = "";
    return;
  }

  box.replaceChildren(
    ...users.map((user) =>
      h(
        "li",
        { class: "row wide-actions" },
        h(
          "div",
          { class: "who" },
          avatar(user.avatar),
          h("div", { class: "names" }, h("strong", {}, user.name), h("span", { class: "sub mono" }, "@" + user.username))
        ),
        h(
          "div",
          { class: "actions" },
          user.banned ? h("span", { class: "badge bad" }, icon("ban"), "Teamsperre") : null,
          user.applicant ? h("span", { class: "badge info" }, icon("clock"), "Bewerbung offen") : null,
          button("Ins Team holen", () => openHireModal(user), "primary", user.banned || user.applicant, "userPlus")
        )
      )
    )
  );

  $("#userNote").textContent =
    total > users.length ? `${users.length} von ${total} Nutzern angezeigt. Nutze die Suche, um weitere zu finden.` : "";
}

function renderBans() {
  const bans = S.data.bans;
  const key = JSON.stringify(bans);
  if (key === S.keys.bans) return;
  S.keys.bans = key;

  const box = $("#banList");

  if (!bans.length) {
    box.replaceChildren(h("li", { class: "empty" }, "Keine Teamsperren aktiv."));
    return;
  }

  box.replaceChildren(
    ...bans.map((ban) =>
      h(
        "li",
        { class: "row wide-actions banned" },
        h(
          "div",
          { class: "who" },
          avatar(ban.avatar),
          h(
            "div",
            { class: "names" },
            h("strong", {}, ban.name),
            h(
              "span",
              { class: "sub" },
              (ban.reason || "Kein Grund angegeben") + ` · ${ban.by_name}, ${formatDate(ban.at)}` + (ban.until ? ` · Sperre bis ${formatDate(ban.until)}` : " · dauerhaft") + (ban.on_server ? "" : " · nicht auf dem Server")
            )
          )
        ),
        h("div", { class: "actions" }, button("Sperre aufheben", () => removeBan(ban), "", false, "unlock"))
      )
    )
  );
}

// ============================================================
// ABMELDUNGEN + BESCHWERDEN
// ============================================================

const ABSENCE_LABELS = {
  active: "Aktiv",
  pending: "Wartet auf Genehmigung",
  ended: "Beendet",
  expired: "Abgelaufen",
  rejected: "Abgelehnt",
  cancelled: "Zurückgezogen",
};
const COMPLAINT_LABELS = { open: "Offen", in_progress: "In Bearbeitung", resolved: "Erledigt", rejected: "Abgelehnt" };

function spanText(startIso, endIso) {
  const minutes = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const dayText = `${days} ${days === 1 ? "Tag" : "Tage"}`;

  if (days && hours) return `${dayText} ${hours} Std`;
  if (days) return dayText;
  return `${Math.max(hours, 1)} Std`;
}

function remainingText(endIso) {
  const ms = new Date(endIso) - Date.now();
  if (ms <= 0) return "abgelaufen";

  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days) return `noch ${days} T ${hours} Std`;
  if (hours) return `noch ${hours} Std ${mins} Min`;
  return `noch ${Math.max(mins, 1)} Min`;
}

function absenceRow(item) {
  const active = item.status === "active";
  const pending = item.status === "pending";
  const canApprove = S.data.actor.can_approve;
  const statusClass = { active: "info", pending: "warn", ended: "ok", expired: "", rejected: "bad", cancelled: "" }[item.status] || "";

  const notes = [];
  if (item.status === "rejected") notes.push(`Abgelehnt von ${item.decided_by_name || "?"}: ${item.decision_note || "ohne Angabe"}`);
  if (item.decided_by_name && item.status !== "rejected" && item.status !== "pending") notes.push(`Genehmigt von ${item.decided_by_name}`);
  if (!active && !pending && item.status !== "rejected" && item.ended_by_name) notes.push(`Beendet von ${item.ended_by_name}, ${formatDate(item.ended_at)}`);
  if (item.extended) notes.push(`${item.extended}× verlängert`);

  let actions = null;

  if (pending) {
    actions = h(
      "div",
      { class: "actions" },
      canApprove
        ? [
            button("Genehmigen", () => approveAbsence(item), "primary", false, "check"),
            button("Ablehnen", () => openRejectAbsenceModal(item), "danger", false, "x"),
          ]
        : h("span", { class: "sub" }, "Nur die Leitung kann entscheiden.")
    );
  } else if (active) {
    actions = h(
      "div",
      { class: "actions" },
      button("Verlängern", () => openExtendAbsenceModal(item), "", false, "clock"),
      button("Beenden", () => openEndAbsenceModal(item), "", false, "x")
    );
  }

  return h(
    "li",
    { class: "row " + (pending ? "pending" : active ? "away" : "closed") },
    h(
      "div",
      { class: "who" },
      avatar(item.avatar),
      h(
        "div",
        { class: "names" },
        h("strong", {}, item.name),
        h("span", { class: "sub" }, `${formatDate(item.start)} bis ${formatDate(item.end)}`)
      )
    ),
    h(
      "div",
      { class: "tags" },
      h("span", { class: "badge " + statusClass }, ABSENCE_LABELS[item.status] || item.status),
      h("span", { class: "badge" }, icon("clock"), spanText(item.start, item.end)),
      active ? h("span", { class: "badge info" }, remainingText(item.end)) : null
    ),
    h("p", { class: "detail" }, item.reason || "Kein Grund angegeben."),
    notes.length ? h("p", { class: "detail muted" }, notes.join(" · ")) : null,
    actions
  );
}

const DEPARTURE_LABELS = { voluntary: "Freiwilliger Austritt", teamkick: "Teamkick", moderated: "Server-Aktion" };

function departureKind(item) {
  const status = String(item?.status || "moderated");
  return DEPARTURE_LABELS[status] ? status : "moderated";
}

function departureRow(item) {
  const kind = departureKind(item);
  const label = DEPARTURE_LABELS[kind];
  const statusClass = kind === "voluntary" ? "ok" : kind === "teamkick" ? "warn" : "bad";
  const reason = item.reason || (kind === "voluntary" ? "Freiwillig aus dem Server ausgetreten" : "Server-Aktion erkannt");
  const details = [
    item.rank_name ? `Letzter Rang: ${item.rank_name}` : "",
    item.moderator_name ? `Ausgeführt von: ${item.moderator_name}` : "",
    item.detection ? `Erkennung: ${item.detection}` : "",
  ].filter(Boolean).join(" · ");

  return h("li", { class: `row departure-row ${kind}` },
    h("div", { class: "who" }, avatar(item.avatar),
      h("div", { class: "names" },
        h("strong", {}, item.name || item.username || "Unbekannter Nutzer"),
        h("span", { class: "sub mono" }, `@${item.username || "unknown"} · ${item.user_id || "–"}`)
      )
    ),
    h("div", { class: "tags" },
      h("span", { class: `badge ${statusClass} departure-kind` }, label),
      h("span", { class: "badge" }, icon("clock"), formatDate(item.departed_at))
    ),
    h("p", { class: "detail" }, reason),
    details ? h("p", { class: "detail muted" }, details) : null
  );
}

function renderDepartures() {
  const all = Array.isArray(S.data.departures) ? S.data.departures : [];
  const query = String($("#departureSearch")?.value || "").trim().toLowerCase();
  const filter = $("#departureFilter")?.value || "all";
  const filtered = all.filter(item => {
    const kind = departureKind(item);
    if (filter !== "all" && kind !== filter) return false;
    if (!query) return true;
    return [item.name, item.username, item.user_id, item.rank_name, item.reason, item.moderator_name, item.detection]
      .filter(Boolean).join(" ").toLowerCase().includes(query);
  });
  const counts = all.reduce((acc, item) => { const k = departureKind(item); acc[k] = (acc[k] || 0) + 1; return acc; }, { voluntary: 0, teamkick: 0, moderated: 0 });
  $("#departureStats")?.replaceChildren(
    h("div", { class: "departure-stat voluntary" }, h("strong", {}, counts.voluntary), h("span", {}, "Freiwillige Austritte")),
    h("div", { class: "departure-stat teamkick" }, h("strong", {}, counts.teamkick), h("span", {}, "Teamkicks")),
    h("div", { class: "departure-stat moderated" }, h("strong", {}, counts.moderated), h("span", {}, "Server-Aktionen"))
  );
  const meta = $("#departureMeta");
  if (meta) meta.textContent = `${filtered.length} von ${all.length} Austritten`;
  const list = $("#departureList");
  if (!list) return;
  list.replaceChildren(...(filtered.length ? filtered.map(departureRow) : [h("li", { class: "empty departure-empty" }, all.length ? "Keine Austritte passen zu deinem Filter." : "Noch keine Team-Austritte erfasst.")]));
}

function exportDeparturesCsv() {
  const rows = Array.isArray(S.data?.departures) ? S.data.departures : [];
  const esc = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["Zeitpunkt", "Name", "Username", "User-ID", "Status", "Letzter Rang", "Grund", "Moderator", "Erkennung"];
  const data = rows.map(item => [item.departed_at, item.name, item.username, item.user_id, departureKind(item), item.rank_name, item.reason, item.moderator_name, item.detection]);
  const csv = [header, ...data].map(row => row.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `team-austritte-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function renderAbsences() {
  const list = S.data.absences || [];
  const key = JSON.stringify([list, S.data.actor.can_approve, Math.floor(Date.now() / 60000)]);
  if (key === S.keys.absences) return;
  S.keys.absences = key;

  $("#absenceList").replaceChildren(
    ...(list.length
      ? list.map(absenceRow)
      : [h("li", { class: "empty" }, "Keine Abmeldungen. Teammitglieder melden sich mit „/abmeldung neu“ ab.")])
  );
}

async function approveAbsence(item) {
  try {
    await act("absence_approve", { absence_id: item.id });
  } catch (err) {
    toast(err.message, true);
  }
}

function openRejectAbsenceModal(item) {
  const note = h("textarea", { id: "absNote", maxlength: 300, placeholder: "Warum wird die Abmeldung abgelehnt? Geht per DM an die Person." });

  modal({
    title: "Abmeldung ablehnen",
    subtitle: item.name,
    danger: true,
    content: h(
      "div",
      {},
      h("p", { class: "detail" }, item.reason),
      h("div", { class: "field" }, h("label", { for: "absNote" }, "Grund"), note)
    ),
    confirm: "Ablehnen",
    onConfirm: () => act("absence_reject", { absence_id: item.id, note: note.value }),
  });
}

function openExtendAbsenceModal(item) {
  const duration = h("input", { id: "absExtend", type: "text", maxlength: 40, placeholder: "z. B. 3 Tage, 1 Woche oder bis 24.12." });

  modal({
    title: "Abmeldung verlängern",
    subtitle: `${item.name} · aktuell bis ${formatDate(item.end)}`,
    content: h(
      "div",
      {},
      h("div", { class: "field" }, h("label", { for: "absExtend" }, "Zusätzliche Dauer"), duration),
      h(
        "p",
        { class: "sub" },
        `Insgesamt sind höchstens 60 Tage möglich. Über ${S.data.settings.absence_approval_days} Tage gesamt darf nur die Leitung verlängern.`
      )
    ),
    confirm: "Verlängern",
    onConfirm: () => act("absence_extend", { absence_id: item.id, duration: duration.value }),
  });
}

function openEndAbsenceModal(item) {
  modal({
    title: "Abmeldung beenden",
    subtitle: item.name,
    content: h("p", { class: "sub" }, "Die Abmeldung wird vorzeitig beendet und die Rolle „Abgemeldet“ entfernt. Die Person bekommt eine Nachricht per DM."),
    confirm: "Beenden",
    onConfirm: () => act("absence_end", { absence_id: item.id }),
  });
}

function complaintRow(item) {
  const open = item.status === "open" || item.status === "in_progress";
  const stateClass = item.status === "resolved" ? "done" : item.status === "rejected" ? "closed" : "pending";
  const badgeClass = item.status === "resolved" ? "ok" : item.status === "rejected" ? "" : "warn";

  return h(
    "li",
    { class: "row " + stateClass },
    h(
      "div",
      { class: "who" },
      avatar(item.target_avatar),
      h(
        "div",
        { class: "names" },
        h("strong", {}, `#${item.id} · über ${item.target_name}`),
        h("span", { class: "sub" }, `von ${item.complainant_name} · ${formatDate(item.created_at)}`)
      )
    ),
    h("div", { class: "tags" }, h("span", { class: "badge " + badgeClass }, COMPLAINT_LABELS[item.status] || item.status)),
    h("p", { class: "detail" }, item.reason),
    item.evidence ? h("p", { class: "detail muted" }, "Beweise: " + item.evidence) : null,
    item.note
      ? h("p", { class: "detail muted" }, `Notiz${item.handled_by_name ? " von " + item.handled_by_name : ""}: ${item.note}`)
      : null,
    h(
      "div",
      { class: "actions" },
      open ? button("Teamwarn erteilen", () => openComplaintWarnModal(item), "danger", false, "alert") : null,
      button(open ? "Bearbeiten" : "Status ändern", () => openComplaintModal(item), open ? "primary" : "", false, "check")
    )
  );
}

function openComplaintWarnModal(item) {
  const reason = h("textarea", {
    id: "complaintWarnReason",
    maxlength: 300,
    placeholder: `Optional. Standard: „Teambeschwerde #${item.id}: …“`,
  });

  modal({
    title: `Teamwarn zu Beschwerde #${item.id}`,
    subtitle: `für ${item.target_name}`,
    danger: true,
    content: h(
      "div",
      {},
      h("p", { class: "detail" }, item.reason),
      h("div", { class: "field" }, h("label", { for: "complaintWarnReason" }, "Grund der Verwarnung"), reason),
      h("p", { class: "sub" }, "Die Person wird verwarnt (mit DM), die Beschwerde wird als erledigt markiert und der Einreicher benachrichtigt.")
    ),
    confirm: "Verwarnen und erledigen",
    onConfirm: () => act("complaint_warn", { complaint_id: item.id, reason: reason.value }),
  });
}

function renderComplaints() {
  const list = S.data.complaints || [];
  const key = JSON.stringify(list);
  if (key === S.keys.complaints) return;
  S.keys.complaints = key;

  $("#complaintList").replaceChildren(
    ...(list.length
      ? list.map(complaintRow)
      : [h("li", { class: "empty" }, "Keine Beschwerden. Spieler reichen sie mit „/beschwerde neu“ ein.")])
  );
}

function openComplaintModal(item) {
  const select = h(
    "select",
    { id: "complaintStatus" },
    ...Object.entries(COMPLAINT_LABELS).map(([value, label]) => h("option", { value, selected: value === item.status }, label))
  );

  const note = h("textarea", {
    id: "complaintNote",
    maxlength: 500,
    placeholder: "Pflicht bei „Erledigt“ und „Abgelehnt“. Geht per DM an den Einreicher.",
  });

  modal({
    title: `Beschwerde #${item.id}`,
    subtitle: `über ${item.target_name} · von ${item.complainant_name}`,
    content: h(
      "div",
      {},
      h("p", { class: "detail" }, item.reason),
      item.evidence ? h("p", { class: "detail muted" }, "Beweise: " + item.evidence) : null,
      h("div", { class: "field" }, h("label", { for: "complaintStatus" }, "Status"), select),
      h("div", { class: "field" }, h("label", { for: "complaintNote" }, "Notiz"), note)
    ),
    confirm: "Speichern",
    onConfirm: () => act("complaint_status", { complaint_id: item.id, status: select.value, note: note.value }),
  });
}

// ============================================================
// BEWERBUNGEN
// ============================================================

const APP_LABELS = {
  offen: "Offen",
  "vorstellungsgespräch": "Offen",
  bestanden: "Angenommen",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
};

const APP_FILTERS = {
  all: "Alle",
  open: "Offen",
  closed: "Geschlossen",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
};

function applicationIsOpen(item) {
  return Boolean(item?.open) || item?.status === "offen" || item?.status === "vorstellungsgespräch";
}

function applicationIsAccepted(item) {
  return item?.status === "bestanden" || item?.status === "angenommen";
}

function applicationIsRejected(item) {
  return item?.status === "abgelehnt";
}

function applicationStatusClass(status) {
  if (status === "offen" || status === "vorstellungsgespräch") return "application-open";
  if (applicationIsAccepted({ status })) return "application-done";
  return "application-closed";
}

function applicationStatusText(item) {
  if (applicationIsOpen(item)) return "Offen";
  return APP_LABELS[item.status] || item.status || "Geschlossen";
}

function applicationActionLabel(action) {
  return {
    accept: "Bewerbung annehmen",
    reject: "Bewerbung ablehnen",
  }[action] || action;
}

async function applicationAction(item, action) {
  const title = applicationActionLabel(action);
  const irreversible = action === "reject";

  modal({
    title,
    subtitle: `Bewerbung #${item.id} · ${item.applicant_name || item.name || "Unbekannt"}`,
    danger: irreversible,
    content: h(
      "div",
      { class: "application-confirm" },
      h("div", { class: "application-confirm-icon " + (irreversible ? "is-danger" : "is-success") }, icon(irreversible ? "x" : "check")),
      h("div", {},
        h("strong", {}, irreversible ? "Bewerbung wirklich ablehnen?" : "Bewerbung wirklich annehmen?"),
        h("p", { class: "detail" },
          action === "accept"
            ? "Die Bewerbung wird angenommen, die konfigurierten Teamrollen werden vergeben und die Bewerbung im Dashboard abgeschlossen."
            : "Die Bewerbung wird abgelehnt, die Bewerbungssperre wird entfernt und der Bewerber wird per DM informiert."
        )
      )
    ),
    confirm: title,
    onConfirm: () => act("application_action", { application_id: item.id, action }),
  });
}

function toggleApplicationDetails(row, details) {
  const open = details.hidden;
  details.hidden = !open;
  row.classList.toggle("open", open);
}

function applicationRow(item) {
  const row = h("li", { class: "row application-row " + (applicationIsOpen(item) ? "is-open" : "is-closed") });
  const statusClass = applicationStatusClass(item.status);
  const name = item.applicant_name || item.name || "Unbekannter Bewerber";
  const when = formatDate(item.created_at);
  const status = applicationStatusText(item);

  const summary = h(
    "div",
    { class: "application-summary" },
    h(
      "div",
      { class: "application-main" },
      avatar(item.avatar),
      h(
        "div",
        { class: "names" },
        h("strong", {}, name),
        h("span", { class: "sub" }, `${item.username ? "@" + item.username.split("#")[0] : "Discord unbekannt"} · ${item.age ? item.age + " Jahre · " : ""}${when || "Datum unbekannt"}`),
        h(
          "div",
          { class: "application-summary-meta" },
          h("span", { class: "badge " + statusClass }, status),
          item.automatic_rejection ? h("span", { class: "badge bad" }, "Automatisch abgelehnt") : null,
          h("span", { class: "badge none" }, `#${item.id}`)
        )
      )
    ),
    h(
      "div",
      { class: "application-summary-right" },
      h("span", { class: "application-date" }, when || ""),
      h("button", { type: "button", class: "btn small open-app", "aria-expanded": "false" }, "Details", h("span", { class: "application-expand" }, "⌄"))
    )
  );

  const actions = [];
  if (applicationIsOpen(item)) {
    if (S.data.actor.can_manage_applications) {
      actions.push(button("Bewerbung annehmen", () => applicationAction(item, "accept"), "success-app", false, "check"));
      actions.push(button("Bewerbung ablehnen", () => applicationAction(item, "reject"), "danger-app", false, "x"));
    } else {
      actions.push(h("span", { class: "application-readonly" }, "Nur lesbar für deine Berechtigung"));
    }
  } else {
    actions.push(h("span", { class: "application-closed-note" }, icon(applicationIsAccepted(item) ? "check" : "lock"), applicationIsAccepted(item) ? "Abgeschlossen · angenommen" : "Abgeschlossen"));
  }

  const details = h(
    "div",
    { class: "application-details", hidden: true },
    h("div", { class: "application-detail-card accent-blue" }, h("div", { class: "application-detail-label" }, "Discord"), h("p", { class: "application-detail-text" }, item.username || "Keine Angabe")),
    h("div", { class: "application-detail-card accent-violet" }, h("div", { class: "application-detail-label" }, "Bewerbername"), h("p", { class: "application-detail-text" }, item.applicant_name || "Keine Angabe")),
    h("div", { class: "application-detail-card accent-cyan" }, h("div", { class: "application-detail-label" }, "Alter"), h("p", { class: "application-detail-text" }, item.age ? `${item.age} Jahre` : "Keine Angabe")),
    h("div", { class: "application-detail-card accent-amber" }, h("div", { class: "application-detail-label" }, "Eingegangen"), h("p", { class: "application-detail-text" }, when || "Keine Angabe")),
    h("div", { class: "application-detail-card full accent-green" }, h("div", { class: "application-detail-label" }, "RP-Erfahrung"), h("p", { class: "application-detail-text" }, item.rp_experience || "Keine Angabe")),
    h("div", { class: "application-detail-card accent-green" }, h("div", { class: "application-detail-label" }, "Stärken"), h("p", { class: "application-detail-text" }, item.strengths || "Keine Angabe")),
    h("div", { class: "application-detail-card accent-pink" }, h("div", { class: "application-detail-label" }, "Schwächen"), h("p", { class: "application-detail-text" }, item.weaknesses || "Keine Angabe")),
    item.reason ? h("div", { class: "application-detail-card full accent-red" }, h("div", { class: "application-detail-label" }, "Grund / Entscheidung"), h("p", { class: "application-detail-text" }, item.reason)) : null,
    h("div", { class: "application-detail-card full application-action-card" },
      h("div", { class: "application-detail-label" }, applicationIsOpen(item) ? "Verwaltung" : "Abschluss"),
      h("div", { class: "application-actions" }, ...actions)
    )
  );

  const detailButton = summary.querySelector("button");
  detailButton.addEventListener("click", () => {
    toggleApplicationDetails(row, details);
    detailButton.setAttribute("aria-expanded", String(!details.hidden));
  });

  row.append(summary, details);
  return row;
}

function applicationMatches(item, filter, query) {
  const q = query.trim().toLowerCase();
  const open = applicationIsOpen(item);

  let statusMatch = true;
  if (filter === "open") statusMatch = open;
  if (filter === "closed") statusMatch = !open;
  if (filter === "accepted") statusMatch = applicationIsAccepted(item);
  if (filter === "rejected") statusMatch = applicationIsRejected(item);

  if (!statusMatch) return false;
  if (!q) return true;

  const haystack = [
    item.id,
    item.user_id,
    item.name,
    item.username,
    item.applicant_name,
    item.age,
    item.strengths,
    item.weaknesses,
    item.rp_experience,
    item.reason,
    APP_LABELS[item.status],
  ].filter(Boolean).join(" ").toLowerCase();

  return haystack.includes(q);
}

function applicationSort(items) {
  const sorted = [...items];
  const sort = S.appSort || "newest";

  if (sort === "oldest") {
    sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  } else if (sort === "name") {
    sorted.sort((a, b) => String(a.applicant_name || a.name || "").localeCompare(String(b.applicant_name || b.name || ""), "de"));
  } else if (sort === "status") {
    sorted.sort((a, b) => applicationStatusText(a).localeCompare(applicationStatusText(b), "de"));
  } else {
    sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  return sorted;
}

function applicationCountLabel(value, label) {
  return h("span", { class: "application-filter-count" }, String(value), " ", label);
}

function renderApplicationList(items) {
  const filter = S.appFilter || "all";
  const query = S.appQuery || "";
  const filtered = applicationSort(items.filter((item) => applicationMatches(item, filter, query)));
  const total = items.length;
  const workspace = $("#appWorkspace");

  if (workspace) {
    const resultNote = h(
      "div",
      { class: "application-result-note" },
      h("span", { class: "application-result-dot" }),
      `${filtered.length} von ${total} Bewerbungen angezeigt`
    );
    workspace.querySelector(".application-result-note")?.replaceWith(resultNote);
  }

  $("#appList").replaceChildren(
    ...(filtered.length
      ? filtered.map(applicationRow)
      : [h("li", { class: "empty application-empty" },
          h("div", { class: "empty-icon" }, icon("search")),
          h("strong", {}, query || filter !== "all" ? "Keine passenden Bewerbungen" : "Noch keine Bewerbungen"),
          h("span", {}, query || filter !== "all" ? "Ändere den Suchbegriff oder den Statusfilter." : "Sobald eine Bewerbung eingeht, erscheint sie hier."),
          query || filter !== "all" ? button("Filter zurücksetzen", () => { S.appFilter = "all"; S.appQuery = ""; renderApplications(true); }, "ghost", false, "x") : null
        )]
    )
  );
}

function renderApplicationWorkspace(items) {
  const openCount = items.filter(applicationIsOpen).length;
  const acceptedCount = items.filter(applicationIsAccepted).length;
  const rejectedCount = items.filter(applicationIsRejected).length;
  const closedCount = items.filter((item) => !applicationIsOpen(item)).length;
  const queryValue = S.appQuery || "";
  const filter = S.appFilter || "all";

  const search = h("input", {
    id: "appSearch",
    type: "search",
    value: queryValue,
    placeholder: "Bewerbungen durchsuchen … Name, Discord, ID oder Inhalt",
    autocomplete: "off",
    "aria-label": "Bewerbungen durchsuchen",
  });
  search.addEventListener("input", () => {
    S.appQuery = search.value;
    renderApplicationList(items);
  });

  const sort = h("select", {
    id: "appSort",
    "aria-label": "Bewerbungen sortieren",
  },
    h("option", { value: "newest" }, "Neueste zuerst"),
    h("option", { value: "oldest" }, "Älteste zuerst"),
    h("option", { value: "name" }, "Nach Bewerbername"),
    h("option", { value: "status" }, "Nach Status")
  );
  sort.value = S.appSort || "newest";
  sort.addEventListener("change", () => {
    S.appSort = sort.value;
    renderApplicationList(items);
  });

  const filterButtons = [
    ["all", "Alle", totalCount(items)],
    ["open", "Offen", openCount],
    ["closed", "Geschlossen", closedCount],
    ["accepted", "Angenommen", acceptedCount],
    ["rejected", "Abgelehnt", rejectedCount],
  ].map(([id, label, count]) => {
    const active = filter === id;
    const node = h("button", {
      type: "button",
      class: "application-filter" + (active ? " active" : ""),
      "aria-pressed": String(active),
      "data-application-filter": id,
    },
      h("span", { class: "application-filter-dot", "aria-hidden": "true" }),
      h("span", {}, label),
      h("span", { class: "application-filter-count" }, String(count))
    );
    node.addEventListener("click", () => {
      S.appFilter = id;
      renderApplications(true);
    });
    return node;
  });

  $("#appWorkspace").replaceChildren(
    h("div", { class: "application-toolbar" },
      h("div", { class: "application-toolbar-heading" },
        h("div", { class: "application-toolbar-kicker" }, "Bewerbungsverwaltung · Live"),
        h("h3", {}, "Bewerbungen verwalten"),
        h("p", {}, "Suche, Filter und Entscheidungen laufen vollständig hier im Dashboard. Discord wird nur für die Eingangsmeldung verwendet."),
      ),
      h("div", { class: "application-toolbar-controls" },
        h("label", { class: "application-search" }, icon("search"), search),
        sort
      )
    ),
    h("div", { class: "application-filter-bar", role: "tablist", "aria-label": "Bewerbungsstatus" }, ...filterButtons),
    h("div", { class: "application-list-meta" },
      h("div", { class: "application-result-note" },
        h("span", { class: "application-result-dot" }),
        `${items.length} Bewerbungen insgesamt`
      ),
      h("div", { class: "application-filter-context" }, `Aktiver Filter: ${APP_FILTERS[filter] || "Alle"}`)
    )
  );
}

function totalCount(items) {
  return Array.isArray(items) ? items.length : 0;
}

function renderApplications(force = false) {
  const apps = S.data.applications;
  const key = JSON.stringify([apps, S.data.actor.can_manage_applications]);
  if (!force && key === S.keys.apps) return;
  S.keys.apps = key;

  if (!apps || !apps.available) {
    $("#appHero").replaceChildren();
    $("#appWorkspace").replaceChildren();
    $("#appList").replaceChildren(h("li", { class: "empty" }, "Das Bewerbungssystem ist im Bot nicht geladen."));
    return;
  }

  const items = Array.isArray(apps.items) ? apps.items : [];
  const openCount = items.filter(applicationIsOpen).length;
  const acceptedCount = items.filter(applicationIsAccepted).length;
  const rejectedCount = items.filter(applicationIsRejected).length;
  const closedCount = items.filter((item) => !applicationIsOpen(item)).length;

  $("#appHero").replaceChildren(
    h("div", { class: "applications-hero" },
      h("div", { class: "applications-hero-copy" },
        h("div", { class: "hero-kicker" }, "Palm City RP · Bewerbungs-Center"),
        h("div", { class: "applications-hero-title" },
          h("div", { class: "applications-status-mark " + (apps.accepting ? "online" : "offline") }, h("span", {})),
          h("div", {},
            h("h2", {}, apps.accepting ? "Bewerbungen sind geöffnet" : "Bewerbungen sind geschlossen"),
            h("p", {}, "Alle Bewerbungen werden direkt im Dashboard verwaltet. Im Discord-Review-Kanal erscheint nur eine kurze Eingangsmeldung.")
          )
        ),
        S.data.actor.can_manage_applications
          ? h("div", { class: "application-actions hero-actions" },
              button(apps.accepting ? "Bewerbungen schließen" : "Bewerbungen öffnen", () => openAppStatusModal(apps.accepting), apps.accepting ? "danger" : "primary", false, apps.accepting ? "ban" : "unlock")
            )
          : null
      ),
      h("div", { class: "application-stats" },
        h("div", { class: "application-stat stat-open" }, h("b", {}, openCount), h("span", {}, "Offen")),
        h("div", { class: "application-stat stat-accepted" }, h("b", {}, acceptedCount), h("span", {}, "Angenommen")),
        h("div", { class: "application-stat stat-rejected" }, h("b", {}, rejectedCount), h("span", {}, "Abgelehnt")),
        h("div", { class: "application-stat stat-closed" }, h("b", {}, closedCount), h("span", {}, "Geschlossen"))
      )
    )
  );

  renderApplicationWorkspace(items);
  renderApplicationList(items);
}

function openAppStatusModal(accepting) {
  modal({
    title: accepting ? "Bewerbungen schließen" : "Bewerbungen öffnen",
    subtitle: "Teambewerbungen",
    danger: accepting,
    content: h(
      "div",
      { class: "application-confirm" },
      h("div", { class: "application-confirm-icon " + (accepting ? "is-danger" : "is-success") }, icon(accepting ? "ban" : "unlock")),
      h("div", {},
        h("strong", {}, accepting ? "Bewerbungsannahme schließen?" : "Bewerbungsannahme öffnen?"),
        h("p", { class: "detail" },
          accepting
            ? "Neue Bewerbungen können danach nicht mehr eingesendet werden. Bestehende Bewerbungen bleiben im Dashboard sichtbar."
            : "Neue Bewerbungen können danach wieder eingesendet werden."
        )
      )
    ),
    confirm: accepting ? "Schließen" : "Öffnen",
    onConfirm: () => act("applications_status", { status: accepting ? "geschlossen" : "offen" }),
  });
}

// ============================================================
// AKTIVITÄT
// ============================================================

const ACT_LABELS = { inactive: "Inaktiv", absent: "Abgemeldet", unknown: "Erfassung läuft", active: "Aktiv" };
const ACT_BADGE = { inactive: "bad", absent: "info", unknown: "", active: "ok" };
const ACT_ROW = { inactive: "pending", absent: "away", unknown: "closed", active: "done" };

function voiceText(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} Std ${minutes} Min` : `${minutes} Min`;
}

function dayText(day) {
  if (!day) return "noch nie";
  return new Date(day + "T12:00:00").toLocaleDateString("de-DE", { dateStyle: "medium" });
}

function activityRow(item) {
  return h(
    "li",
    { class: "row " + ACT_ROW[item.status] },
    h(
      "div",
      { class: "who" },
      avatar(item.avatar),
      h(
        "div",
        { class: "names" },
        h("strong", {}, item.name),
        h("span", { class: "sub" }, item.rank_name || "Kein Rang")
      )
    ),
    h(
      "div",
      { class: "tags" },
      h("span", { class: "badge " + ACT_BADGE[item.status] }, ACT_LABELS[item.status]),
      item.absence_end ? h("span", { class: "badge info" }, icon("clock"), "bis " + formatDate(item.absence_end)) : null,
      item.warns ? h("span", { class: "badge warn" }, icon("alert"), item.warns === 1 ? "1 Verwarnung" : `${item.warns} Verwarnungen`) : null
    ),
    h(
      "p",
      { class: "metrics" },
      h("span", {}, h("b", {}, String(item.messages)), " Nachrichten"),
      h("span", {}, h("b", {}, voiceText(item.voice_seconds)), " Voice"),
      h("span", {}, "zuletzt aktiv: ", h("b", {}, dayText(item.last_active)))
    )
  );
}

function renderActivity() {
  const data = S.activity;
  if (!data) return;

  const key = JSON.stringify(data);
  if (key === S.keys.activity) return;
  S.keys.activity = key;

  if (!data.available) {
    $("#actChips").replaceChildren();
    $("#actNote").textContent = "";
    $("#actList").replaceChildren(h("li", { class: "empty" }, "Die Aktivitätserfassung ist im Bot nicht geladen."));
    return;
  }

  $("#actChips").replaceChildren(
    ...["inactive", "absent", "unknown", "active"]
      .filter((status) => data.counts[status])
      .map((status) => h("span", { class: "badge " + ACT_BADGE[status] }, `${ACT_LABELS[status]}: ${data.counts[status]}`))
  );

  $("#actNote").textContent = data.tracking_ready
    ? `Inaktiv = in den letzten ${data.inactive_after_days} Tagen weder geschrieben noch in Voice und nicht abgemeldet. Gezählt werden nur Teammitglieder.`
    : `Die Erfassung läuft seit ${formatDate(data.tracking_since)}. Inaktive werden erst nach ${data.inactive_after_days} Tagen Erfassung markiert.`;

  $("#actList").replaceChildren(
    ...(data.items.length ? data.items.map(activityRow) : [h("li", { class: "empty" }, "Keine Teammitglieder gefunden.")])
  );
}

async function loadActivity(force = false) {
  if (!S.data || !S.data.features || !S.data.features.activity) return;

  const age = Date.now() - S.activityAt;
  const onTab = S.tab === "activity";

  if (!force && ((onTab && age < 15000) || (!onTab && age < 60000))) return;

  try {
    const data = await api("activity", { params: { days: S.activityDays } });
    S.activity = data;
    S.activityAt = Date.now();
    S.inactiveCount = (data.counts && data.counts.inactive) || 0;
    renderTabs();
    if (S.tab === "activity") renderActivity();
  } catch (err) {
    if (err.code === "no_access") setLocked(err.message);
  }
}

// ============================================================
// VERLAUF + CSV-EXPORT
// ============================================================

const ACTION_LABELS = {
  hire: "Aufnahme",
  up: "Beförderung",
  down: "Degradierung",
  set: "Rang gesetzt",
  warn: "Teamwarn",
  warn_remove: "Warn entfernt",
  kick: "Teamkick",
  ban_remove: "Sperre aufgehoben",
  manual_role: "Rolle manuell geändert",
  absence: "Abmeldung",
  absence_approve: "Abmeldung genehmigt",
  absence_end: "Abmeldung beendet",
  complaint: "Beschwerde",
  complaint_status: "Beschwerde-Status",
};

const ACTION_BADGE = {
  hire: "ok", up: "ok", warn_remove: "ok", ban_remove: "ok", absence_approve: "ok",
  down: "warn", warn: "warn", complaint: "warn", complaint_status: "warn",
  kick: "bad",
  absence: "info", absence_end: "info", manual_role: "info",
};

const SOURCE_LABELS = { dashboard: "Dashboard", discord: "Discord", auto: "Automatisch" };

function historyRow(event) {
  const same = event.actor_id && event.actor_id === event.target_id;

  return h(
    "li",
    { class: "row closed" },
    h(
      "div",
      { class: "who" },
      h(
        "div",
        { class: "names" },
        h("strong", {}, same ? event.target_name : `${event.actor_name} → ${event.target_name}`),
        h("span", { class: "sub" }, `${formatDate(event.at)} · ${event.ref}`)
      )
    ),
    h(
      "div",
      { class: "tags" },
      h("span", { class: "badge " + (ACTION_BADGE[event.action] || "") }, ACTION_LABELS[event.action] || event.action),
      h("span", { class: "badge none" }, SOURCE_LABELS[event.source] || event.source)
    ),
    event.detail ? h("p", { class: "detail muted" }, event.detail) : null
  );
}

function historyParams(limit) {
  const params = { limit };
  const q = $("#histSearch").value.trim();
  const action = $("#histAction").value;
  const source = $("#histSource").value;

  if (q) params.q = q;
  if (action) params.action = action;
  if (source) params.source = source;

  return params;
}

async function loadHistory() {
  if (S.tab !== "history" || !S.data) return;

  try {
    const data = await api("history", { params: historyParams(200) });
    const key = JSON.stringify(data);

    if (key !== S.keys.history) {
      S.keys.history = key;

      $("#histList").replaceChildren(
        ...(data.items.length ? data.items.map(historyRow) : [h("li", { class: "empty" }, "Keine Einträge für diese Filter.")])
      );

      $("#histNote").textContent =
        data.total > data.items.length
          ? `${data.total} Einträge, die neuesten ${data.items.length} werden angezeigt. Der CSV-Export enthält bis zu 5000.`
          : `${data.total} Eintrag${data.total === 1 ? "" : "e"}.`;
    }
  } catch (err) {
    if (err.code === "no_access") setLocked(err.message);
  }
}

function csvCell(value) {
  let text = String(value ?? "");
  // Schutz vor Formel-Injection in Excel/Sheets
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

async function exportHistory() {
  try {
    const data = await api("history", { params: historyParams(5000) });

    const rows = [
      ["Zeit", "Aktion", "Quelle", "Ausgeführt von", "Betroffen", "Details", "Referenz"],
      ...data.items.map((event) => [
        formatDate(event.at),
        ACTION_LABELS[event.action] || event.action,
        SOURCE_LABELS[event.source] || event.source,
        event.actor_name,
        event.target_name,
        event.detail,
        event.ref,
      ]),
    ];

    const csv = "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = h("a", { href: url, download: `team-verlauf-${new Date().toISOString().slice(0, 10)}.csv` });

    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    toast(`${data.items.length} Einträge exportiert.`);
  } catch (err) {
    toast(err.message, true);
  }
}

function starRow(stars, size = 16) {
  const chars = [];

  for (let i = 1; i <= 5; i++) {
    chars.push(h("span", { class: i > stars ? "off" : "" }, "★"));
  }

  return h("span", { class: "stars", style: `font-size:${size}px` }, ...chars);
}

function ratingDistribution(distribution, total) {
  if (!total) return null;

  return h(
    "div",
    { style: "margin-top: 8px" },
    ...[5, 4, 3, 2, 1].map((star) => {
      const count = distribution[String(star)] || 0;
      const pct = Math.round((count / total) * 100);

      return h(
        "div",
        { class: "dist-row" },
        h("span", {}, `${star}★`),
        h("div", { class: "dist-bar" }, h("i", { style: `width:${pct}%` })),
        h("span", {}, String(count))
      );
    })
  );
}

function supportRatingItem(rating) {
  return h(
    "div",
    { class: "rating-item" },
    h(
      "div",
      { class: "top" },
      starRow(rating.stars, 14),
      h("span", { class: "sub" }, formatDate(rating.at))
    ),
    rating.feedback ? h("p", {}, rating.feedback) : null
  );
}

function supportRow(item) {
  const open = S.ratingsExpanded.has(item.id);
  const hasRatings = item.rating_count > 0;

  return h(
    "li",
    { class: "row" },
    h(
      "div",
      { class: "who" },
      avatar(item.avatar),
      h("div", { class: "names" }, h("strong", {}, item.name))
    ),
    h(
      "div",
      { class: "tags" },
      hasRatings
        ? h(
            "button",
            {
              type: "button",
              class: "badge",
              "aria-expanded": String(open),
              onclick: () => {
                open ? S.ratingsExpanded.delete(item.id) : S.ratingsExpanded.add(item.id);
                S.keys.support = "";
                renderSupport();
              },
            },
            starRow(Math.round(item.rating_average)),
            ` ${item.rating_average.toFixed(2)} (${item.rating_count})`
          )
        : h("span", { class: "badge none" }, "Noch keine Bewertung"),
      h("span", { class: "badge" }, icon("check"), `${item.tickets_closed} von ${item.tickets_claimed} Tickets geschlossen`),
      item.voice_sessions
        ? h("span", { class: "badge info" }, icon("headset"), `${item.voice_sessions}× Voice-Support · ${voiceText(item.voice_seconds)}`)
        : null
    ),
    open && hasRatings
      ? h(
          "div",
          { class: "warns" },
          ratingDistribution(item.rating_distribution, item.rating_count),
          h("p", { class: "sub", style: "margin-top: 10px" }, "Einzelne Bewertungen (neueste zuerst):"),
          ...item.ratings.map(supportRatingItem)
        )
      : null
  );
}

function renderSupport() {
  const data = S.support;
  if (!data) return;

  const key = JSON.stringify([data, [...S.ratingsExpanded]]);
  if (key === S.keys.support) return;
  S.keys.support = key;

  if (!data.available) {
    $("#supportList").replaceChildren(h("li", { class: "empty" }, "Das Ticket-System ist im Bot nicht geladen."));
    return;
  }

  $("#supportList").replaceChildren(
    ...(data.items.length ? data.items.map(supportRow) : [h("li", { class: "empty" }, "Keine Teammitglieder gefunden.")])
  );
}

async function loadSupport(force = false) {
  if (!S.data || !S.data.features || !S.data.features.support) return;
  if (!force && Date.now() - S.supportAt < 20000) return;

  try {
    const data = await api("support");
    S.support = data;
    S.supportAt = Date.now();
    if (S.tab === "support") renderSupport();
  } catch (err) {
    if (err.code === "no_access") setLocked(err.message);
  }
}

function feedbackStars(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return value ? "⭐".repeat(value) + "☆".repeat(5 - value) : "Keine Bewertung";
}

function feedbackGroups(items) {
  const groups = new Map();

  for (const item of items || []) {
    const targetId = String(item.target_user_id || `unknown:${item.target_user_name || item.id}`);

    if (!groups.has(targetId)) {
      groups.set(targetId, {
        target_user_id: targetId,
        target_user_name: item.target_user_name || "Unbekannter Staffler",
        target_avatar: item.target_avatar || item.avatar || null,
        items: [],
      });
    }

    groups.get(targetId).items.push(item);
  }

  return [...groups.values()]
    .map(group => {
      const ratings = group.items
        .map(item => Number(item.rating) || 0)
        .filter(rating => rating >= 1 && rating <= 5);

      group.rating_count = ratings.length;
      group.average_rating = ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;

      group.items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      return group;
    })
    .sort((a, b) => a.target_user_name.localeCompare(b.target_user_name, "de", { sensitivity: "base" }));
}

function feedbackDetail(item) {
  return h(
    "div",
    { class: "feedback-detail" },
    h(
      "div",
      { class: "feedback-detail-head" },
      h(
        "div",
        { class: "feedback-reviewer" },
        avatar(item.avatar),
        h("div", { class: "names" },
          h("strong", {}, item.user_name || "Unbekannter Nutzer"),
          h("span", { class: "sub" }, `${formatDate(item.created_at)} · ${item.category || "Sonstiges"}`)
        )
      ),
      h(
        "div",
        { class: "feedback-detail-rating" },
        h("strong", {}, feedbackStars(item.rating)),
        h("span", { class: "sub" }, `${Number(item.rating) || 0}/5`)
      )
    ),
    h("p", { class: "detail feedback-content" }, item.feedback || "Kein Text hinterlegt."),
    item.suggestion
      ? h("div", { class: "feedback-suggestion" }, h("b", {}, "💡 Vorschlag: "), item.suggestion)
      : null
  );
}

function feedbackStaffRow(group) {
  const average = group.average_rating;
  const averageText = average ? average.toFixed(1).replace(".", ",") : "–";
  const overall = average ? `${feedbackStars(Math.round(average))} · ${averageText}/5` : "Noch keine Bewertung";

  return h(
    "li",
    { class: "row feedback-staff-row" },
    h(
      "details",
      { class: "feedback-accordion" },
      h(
        "summary",
        { class: "feedback-summary" },
        h(
          "div",
          { class: "who" },
          avatar(group.target_avatar),
          h("div", { class: "names" },
            h("strong", {}, group.target_user_name),
            h("span", { class: "sub" }, `${group.items.length} ${group.items.length === 1 ? "Bewertung" : "Bewertungen"}`)
          )
        ),
        h(
          "div",
          { class: "feedback-overall" },
          h("span", { class: "overall-label" }, "Gesamtbewertung"),
          h("strong", {}, overall),
          h("span", { class: "sub" }, "Klicken für alle Einzelbewertungen")
        )
      ),
      h(
        "div",
        { class: "feedback-details" },
        h(
          "div",
          { class: "feedback-details-title" },
          h("span", {}, "Einzelne Bewertungen"),
          h("span", { class: "sub" }, "neueste zuerst")
        ),
        ...group.items.map(feedbackDetail)
      )
    )
  );
}

function renderFeedback() {
  const data = S.feedback;
  if (!data) return;

  const key = JSON.stringify(data);
  if (key === S.keys.feedback) return;
  S.keys.feedback = key;

  const items = data.items || [];
  const groups = feedbackGroups(items);
  const rated = items
    .map(item => Number(item.rating) || 0)
    .filter(rating => rating >= 1 && rating <= 5);

  if (rated.length) {
    const average = rated.reduce((sum, rating) => sum + rating, 0) / rated.length;
    $("#feedbackMeta").replaceChildren(
      h("span", {}, `${groups.length} Staffler`),
      h("span", { class: "feedback-meta-sep" }, "•"),
      h("strong", {}, `⭐ ${average.toFixed(1).replace(".", ",")}/5`),
      h("span", { class: "feedback-meta-sep" }, "•"),
      h("span", {}, `${items.length} Bewertungen`)
    );
  } else {
    $("#feedbackMeta").textContent = `${items.length} Bewertungen`;
  }

  $("#feedbackList").replaceChildren(
    ...(groups.length
      ? groups.map(feedbackStaffRow)
      : [h("li", { class: "empty" }, "Noch kein Feedback eingegangen.")]
    )
  );
}

async function loadFeedback(force = false) {
  if (!S.data || !S.data.features || !S.data.features.feedback) return;
  if (!force && Date.now() - S.feedbackAt < 15000) return;

  try {
    const data = await api("feedback");
    S.feedback = data;
    S.feedbackAt = Date.now();
    if (S.tab === "feedback") renderFeedback();
  } catch (err) {
    if (err.code === "no_access") setLocked(err.message);
  }
}

function renderSettings() {
  const box = $("#p-settings");
  const data = S.data;

  if (!data.actor.is_admin) {
    const key = "no-admin";
    if (S.keys.settings === key) return;
    S.keys.settings = key;
    box.replaceChildren(h("p", { class: "empty" }, "Nur Administratoren können die Rangleiste ändern."));
    return;
  }

  if (!S.dirty) S.draft = data.ranks.map((rank) => rank.id);

  const key = JSON.stringify([S.draft, S.dirty, data.roles.length, data.ranks]);
  if (S.keys.settings === key) return;
  S.keys.settings = key;

  const roles = new Map(data.roles.map((role) => [role.id, role]));
  const free = data.roles.filter((role) => !S.draft.includes(role.id));

  const edit = (mutate) => {
    mutate();
    S.dirty = true;
    renderSettings();
  };

  const ladder = h(
    "ol",
    { class: "ladder" },
    [...S.draft.keys()].reverse().map((index) => {
      const id = S.draft[index];
      const role = roles.get(id);

      return h(
        "li",
        {},
        h("span", { class: "lvl" }, `Stufe ${index + 1}`),
        h(
          "span",
          { class: "badge rank nm", style: role?.color ? `--c:${role.color}` : "" },
          h("i"),
          role ? role.name : id
        ),
        button("Höher", () => edit(() => [S.draft[index], S.draft[index + 1]] = [S.draft[index + 1], S.draft[index]]), "ghost", index === S.draft.length - 1, "up"),
        button("Niedriger", () => edit(() => [S.draft[index], S.draft[index - 1]] = [S.draft[index - 1], S.draft[index]]), "ghost", index === 0, "down"),
        button("Entfernen", () => edit(() => S.draft.splice(index, 1)), "danger", false, "x")
      );
    })
  );

  const select = h(
    "select",
    { "aria-label": "Rolle hinzufügen" },
    h("option", { value: "" }, "Rolle auswählen"),
    free.map((role) => h("option", { value: role.id }, role.name))
  );

  const save = h("button", { type: "button", class: "btn primary", disabled: !S.dirty }, icon("check"), "Rangleiste speichern");

  save.addEventListener("click", async () => {
    save.disabled = true;

    try {
      await api("ranks_config", { method: "POST", body: { rank_ids: S.draft } });
      S.dirty = false;
      toast("Rangleiste wurde gespeichert.");
      await refresh();
    } catch (err) {
      toast(err.message, true);
      save.disabled = false;
    }
  });

  box.replaceChildren(
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Rangleiste"),
      h("p", { class: "sub" }, "Diese Rollen sind die Team-Ränge. Der oberste Eintrag ist der höchste Rang. Uprank und Downrank folgen dieser Reihenfolge."),
      S.draft.length ? ladder : h("p", { class: "empty" }, "Noch keine Ränge. Füge unten die erste Rolle hinzu."),
      h(
        "div",
        { class: "add-rank" },
        select,
        button("Hinzufügen", () => { if (select.value) edit(() => S.draft.push(select.value)); }, "", false, "plus")
      ),
      save
    )
  );
}

function renderTabs() {
  const data = S.data;

  const tabs = [
    ["team", "Teamliste", data.team.length, "users"],
    ["users", "Nutzer", null, "userPlus"],
    ["bans", "Sperren", data.bans.length, "ban"],
  ];

  if (data.features && data.features.extras) {
    const away = (data.absences || []).filter((item) => item.status === "active").length;
    const open = (data.complaints || []).filter((item) => item.status === "open" || item.status === "in_progress").length;

    tabs.push(["absences", "Abmeldungen", away, "clock"]);
    tabs.push(["complaints", "Beschwerden", open, "flag"]);
  }

  if (data.features && data.features.departures) {
    const departures = (data.departures || []).length;
    tabs.push(["departures", "Austritte", departures || null, "logout"]);
  }

  if (data.features && data.features.applications) {
    tabs.push(["applications", "Bewerbungen", (data.applications && data.applications.open_count) || 0, "userPlus"]);
  }

  if (data.features && data.features.activity) tabs.push(["activity", "Aktivität", S.inactiveCount || 0, "chart"]);

  if (data.features && data.features.support) tabs.push(["support", "Support", null, "headset"]);
  if (data.features && data.features.feedback) {
    tabs.push(["feedback", "Feedback", (data.feedbacks || []).length || null, "message"]);
  }

  tabs.push(["history", "Verlauf", null, "history"]);

  if (data.actor.is_admin && data.actor.can_config) tabs.push(["settings", "Einstellungen", null, "settings"]);

  const key = JSON.stringify([tabs, S.tab]);
  if (key === S.keys.tabs) return;
  S.keys.tabs = key;

  if (!tabs.some(([id]) => id === S.tab)) S.tab = "team";

  const groups = [
    { label: "Übersicht", ids: ["team", "users", "activity"] },
    { label: "Team", ids: ["applications", "absences", "departures", "complaints", "feedback"] },
    { label: "Kontrolle", ids: ["bans", "support", "history"] },
    { label: "System", ids: ["settings"] },
  ];

  const nodes = [];

  for (const group of groups) {
    const items = tabs.filter(([id]) => group.ids.includes(id));
    if (!items.length) continue;

    nodes.push(
      h(
        "div",
        { class: "tab-section", "data-section": group.label.toLowerCase() },
        h("div", { class: "tab-section-label" }, group.label),
        ...items.map(([id, label, count, iconName]) =>
          h(
            "button",
            {
              type: "button",
              class: "tab",
              role: "tab",
              "aria-selected": String(id === S.tab),
              "data-tab": id,
              onclick: () => switchTab(id),
            },
            icon(iconName),
            h("span", { class: "label" }, label),
            count ? h("span", { class: "count" }, count) : null
          )
        )
      )
    );
  }

  $("#tabs").replaceChildren(...nodes);
}

function switchTab(id) {
  S.tab = id;
  S.keys.tabs = "";

  for (const panel of ["team", "users", "bans", "absences", "departures", "complaints", "applications", "activity", "history", "support", "feedback", "settings"]) {
    const section = $("#p-" + panel);
    if (section) section.hidden = panel !== id;
  }

  renderAll();
  replaySectionMotion();

  const activeTab = $("#tabs").querySelector('[aria-selected="true"]');
  if (activeTab) activeTab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  if (id === "users") loadUsers();
  if (id === "activity") loadActivity(true);
  if (id === "history") loadHistory();
  if (id === "support") loadSupport(true);
  if (id === "feedback") loadFeedback(true);
}

function renderAll() {
  if (!S.data) return;

  renderTabs();

  const [title, subtitle] = TITLES[S.tab];
  $("#pageTitle").textContent = title;
  $("#pageSub").textContent = subtitle;

  if (S.tab === "team") renderTeam();
  if (S.tab === "bans") renderBans();
  if (S.tab === "absences") renderAbsences();
  if (S.tab === "departures") renderDepartures();
  if (S.tab === "complaints") renderComplaints();
  if (S.tab === "applications") renderApplications();
  if (S.tab === "activity" && S.activity) renderActivity();
  if (S.tab === "support" && S.support) renderSupport();
  if (S.tab === "feedback" && S.feedback) renderFeedback();
  if (S.tab === "settings") renderSettings();
}

// ============================================================
// DATEN LADEN (Live-Aktualisierung)
// ============================================================

function setLocked(message) {
  $("#lock").hidden = !message;
  if (message) $("#lockText").textContent = message;
}

function setLive(isLive, text) {
  $("#live").classList.toggle("off", !isLive);
  $("#liveText").textContent = text;
}

async function loadUsers() {
  if (S.tab !== "users" || !S.data) return;

  try {
    const data = await api("users", { params: { q: S.userQuery } });
    renderUsers(data.users, data.total);
  } catch (err) {
    if (err.code === "no_access") setLocked(err.message);
  }
}

async function refresh() {
  try {
    const data = await api("state");
    S.data = data;

    // Feedback kommt bereits im Haupt-State mit. Dadurch ist der Tab
    // sofort nach dem Dashboard-Refresh befüllt und hängt nicht davon ab,
    // ob der separate /team/feedback-Aufruf schon fertig ist.
    S.feedback = {
      items: Array.isArray(data.feedbacks) ? data.feedbacks : [],
    };
    S.feedbackAt = Date.now();
    S.keys.feedback = "";

    setLocked(null);
    setLive(true, "Live · " + new Date().toLocaleTimeString("de-DE"));
    renderAll();
    await loadUsers();
    loadActivity();
    loadHistory();
    loadSupport();
  } catch (err) {
    if (err.code === "no_session") return showLogin();

    if (err.code === "no_access") {
      setLocked(err.message);
      setLive(false, "Kein Zugriff");
      return;
    }

    setLive(false, err.message);
  }
}

function loop() {
  setTimeout(async () => {
    if (!document.hidden && S.me) await refresh();
    loop();
  }, POLL_MS);
}

// ============================================================
// START
// ============================================================

function showLogin(message) {
  S.me = null;
  $("#app").hidden = true;
  $("#login").hidden = false;
  if (message) $("#loginText").textContent = message;
}

async function boot() {
  fillStaticIcons();

  if (new URLSearchParams(location.search).get("error")) {
    history.replaceState(null, "", location.pathname);
    showLogin("Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.");
    return;
  }

  try {
    S.me = (await api("me")).user;
  } catch {
    showLogin();
    return;
  }

  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#meName").textContent = S.me.name;
  $("#meAvatar").src = S.me.avatar;

  $("#teamSearch").addEventListener("input", () => renderTeam());

  const departureSearch = $("#departureSearch");
  const departureFilter = $("#departureFilter");
  const departureExport = $("#departureExport");
  if (departureSearch) departureSearch.addEventListener("input", renderDepartures);
  if (departureFilter) departureFilter.addEventListener("change", renderDepartures);
  if (departureExport) departureExport.addEventListener("click", exportDeparturesCsv);

  $("#userSearch").addEventListener("input", (event) => {
    clearTimeout(S.userTimer);
    S.userTimer = setTimeout(() => {
      S.userQuery = event.target.value.trim();
      loadUsers();
    }, 300);
  });

  $("#histAction").replaceChildren(
    h("option", { value: "" }, "Alle Aktionen"),
    ...Object.entries(ACTION_LABELS).map(([value, label]) => h("option", { value }, label))
  );

  $("#histSearch").addEventListener("input", () => {
    clearTimeout(S.histTimer);
    S.histTimer = setTimeout(loadHistory, 300);
  });
  $("#histAction").addEventListener("change", loadHistory);
  $("#histSource").addEventListener("change", loadHistory);
  $("#histExport").addEventListener("click", exportHistory);

  $("#actDays").addEventListener("change", (event) => {
    S.activityDays = Number(event.target.value) === 30 ? 30 : 7;
    loadActivity(true);
  });

  await refresh();
  loop();
}

boot();


// ============================================================
// PREMIUM MOTION: desktop pointer spotlight
// ============================================================
(function setupMotionLayer() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) return;

  let raf = 0;
  let x = window.innerWidth * 0.72;
  let y = window.innerHeight * 0.18;
  let pending = false;

  const paint = () => {
    raf = 0;
    const root = document.querySelector('.content');
    if (!root) return;
    root.style.setProperty('--mx', `${x}px`);
    root.style.setProperty('--my', `${y}px`);
    pending = false;
  };

  window.addEventListener('pointermove', (event) => {
    x = event.clientX;
    y = event.clientY;
    if (!pending) {
      pending = true;
      raf = requestAnimationFrame(paint);
    }
  }, { passive: true });
})();

// Re-run page entrance animation when the active view changes.
function replaySectionMotion() {
  const active = document.querySelector('main > section:not([hidden])');
  if (!active) return;
  active.classList.remove('motion-refresh');
  void active.offsetWidth;
  active.classList.add('motion-refresh');
  setTimeout(() => active.classList.remove('motion-refresh'), 700);
}

