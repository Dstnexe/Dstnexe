import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN = "Dstnexe";
const COMMAND = "curl -s https://api.dstn.dev/v1/profile";
const CHAR_WIDTH = 8.4;
const COMMAND_X = 45;

const THEMES = {
  dark: {
    PANEL: "#0d1117",
    BORDER: "#30363d",
    FG: "#e6edf3",
    MUTED: "#8b949e",
    GREEN: "#3fb950",
    KEY: "#79c0ff",
    STR: "#a5d6ff",
    AMBER: "#d29922",
    YELLOW: "#f2cc60",
    ORANGE: "#ffa657",
    RED: "#ff7b72",
    CYAN: "#39d0d8",
    BLUE: "#58a6ff",
    BLURPLE: "#a5b4fc",
    VIO: "#d2a8ff",
    PHPC: "#a9aede",
    ACC1: "#3fb950",
    ACC2: "#58a6ff",
    ACC3: "#bc8cff",
    GLOW: "0.5",
    AMBIENT: "0.12",
  },
  light: {
    PANEL: "#ffffff",
    BORDER: "#d1d9e0",
    FG: "#1f2328",
    MUTED: "#57606a",
    GREEN: "#1a7f37",
    KEY: "#0550ae",
    STR: "#0a3069",
    AMBER: "#9a6700",
    YELLOW: "#9a6700",
    ORANGE: "#bc4c00",
    RED: "#cf222e",
    CYAN: "#1b7c83",
    BLUE: "#0969da",
    BLURPLE: "#5865f2",
    VIO: "#8250df",
    PHPC: "#5c63a2",
    ACC1: "#1a7f37",
    ACC2: "#0969da",
    ACC3: "#8250df",
    GLOW: "0",
    AMBIENT: "0",
  },
};

const FALLBACK_STATS = {
  contributions30d: 87,
  followers: 3,
  days14: [2, 5, 1, 0, 3, 7, 4, 6, 2, 8, 3, 5, 9, 4],
};

async function fetchStats() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.warn("GH_TOKEN not set, using fallback stats");
    return FALLBACK_STATS;
  }

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const query = `
    query ($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        followers { totalCount }
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }`;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { login: LOGIN, from: from.toISOString(), to: to.toISOString() },
    }),
  });

  const { data, errors } = await res.json();
  if (errors) throw new Error(JSON.stringify(errors));

  const user = data.user;
  const calendar = user.contributionsCollection.contributionCalendar;
  const days = calendar.weeks.flatMap((w) => w.contributionDays);
  return {
    contributions30d: calendar.totalContributions,
    followers: user.followers.totalCount,
    days14: days.slice(-14).map((d) => d.contributionCount),
  };
}

function typingAnimation() {
  const steps = COMMAND.length + 1;
  const widths = [];
  const cursorXs = [];
  const keyTimes = [];
  for (let i = 0; i < steps; i++) {
    widths.push((i * CHAR_WIDTH).toFixed(1));
    cursorXs.push((COMMAND_X + i * CHAR_WIDTH).toFixed(1));
    keyTimes.push((i / (steps - 1)).toFixed(4));
  }
  return {
    TYPE_VALUES: widths.join(";"),
    CURSOR_VALUES: cursorXs.join(";"),
    TYPE_KEYTIMES: keyTimes.join(";"),
  };
}

function barsMarkup(days14) {
  const max = Math.max(...days14, 1);
  const base = 708;
  return days14
    .map((count, i) => {
      const h = Math.max(4, Math.round((count / max) * 64));
      const x = 744 + i * 24;
      const y = base - h;
      const begin = (1.6 + i * 0.06).toFixed(2);
      const isToday = i === days14.length - 1;
      const pulse = isToday
        ? `<animate attributeName="opacity" values="0.9;0.5;0.9" dur="2.2s" begin="2.5s" repeatCount="indefinite"/>`
        : "";
      return [
        `<rect x="${x}" y="${base}" width="18" height="0" rx="3" fill="url(#gradBar)" opacity="0.9">`,
        `<animate attributeName="height" from="0" to="${h}" dur="0.5s" begin="${begin}s" fill="freeze"/>`,
        `<animate attributeName="y" from="${base}" to="${y}" dur="0.5s" begin="${begin}s" fill="freeze"/>`,
        pulse,
        `</rect>`,
      ].join("");
    })
    .join("\n    ");
}

const stats = await fetchStats();
const template = readFileSync(join(root, "template.svg"), "utf8");

const shared = {
  ...typingAnimation(),
  BARS: barsMarkup(stats.days14),
  CONTRIB_30D: String(stats.contributions30d),
  FOLLOWERS: String(stats.followers),
};

for (const [name, colors] of Object.entries(THEMES)) {
  const tokens = { ...shared, ...colors };
  let svg = template;
  for (let pass = 0; pass < 2; pass++) {
    svg = svg.replace(/\{\{(\w+)\}\}/g, (match, key) => tokens[key] ?? match);
  }
  const unresolved = svg.match(/\{\{\w+\}\}/g);
  if (unresolved) throw new Error(`Unresolved tokens: ${unresolved.join(", ")}`);
  writeFileSync(join(root, `${name}.svg`), svg);
  console.log(`wrote ${name}.svg`);
}
