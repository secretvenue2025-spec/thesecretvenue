// netlify/functions/add-reel.js
//
// Adds an Instagram reel/post URL to reels.json in the GitHub repo, so the
// booking page's Instagram section can be managed from admin.html the same
// way photos are — no code edits needed for new reels.

const GITHUB_OWNER  = process.env.GITHUB_OWNER;
const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;

const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
const MAX_REELS = 12; // keeps the strip from growing unbounded

function ghHeaders() {
  return {
    "Authorization": `Bearer ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

function sanitizeError(msg) {
  return String(msg)
    .replace(/api\.github\.com/gi, "storage-api")
    .replace(/raw\.githubusercontent\.com/gi, "storage-cdn")
    .replace(/github\.com/gi, "storage service")
    .replace(/github/gi, "storage service");
}

// Extracts the reel/post shortcode from a URL, e.g.
// "https://www.instagram.com/reel/DQqjTgJEmb2/?utm_source=..." -> "DQqjTgJEmb2"
function extractShortcode(url) {
  const match = String(url).match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// Strips tracking params so we always store/compare a clean canonical URL.
function canonicalUrl(url, shortcode) {
  const isReel = /\/reel\//.test(url);
  return `https://www.instagram.com/${isReel ? "reel" : "p"}/${shortcode}/`;
}

async function getManifest() {
  const res = await fetch(`${API}/reels.json?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
  if (res.status === 404) {
    return { sha: null, data: { reels: [] } };
  }
  if (!res.ok) throw new Error(`Failed to read reels.json (${res.status})`);
  const json = await res.json();
  const data = JSON.parse(Buffer.from(json.content, "base64").toString("utf-8"));
  if (!Array.isArray(data.reels)) data.reels = [];
  return { sha: json.sha, data };
}

async function putFile(path, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/${path}`, { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage write failed for ${path}: ${res.status} ${err}`);
  }
  return res.json();
}

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not logged in" }) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { url } = JSON.parse(event.body);
    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "url is required" }) };
    }
    const shortcode = extractShortcode(url);
    if (!shortcode) {
      return { statusCode: 400, body: JSON.stringify({ error: "That doesn't look like an Instagram post or reel link" }) };
    }
    const clean = canonicalUrl(url, shortcode);

    const { sha, data } = await getManifest();

    if (data.reels.some((r) => r.id === shortcode)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, reel: data.reels.find((r) => r.id === shortcode), note: "already existed" }) };
    }
    if (data.reels.length >= MAX_REELS) {
      return { statusCode: 400, body: JSON.stringify({ error: `You can have up to ${MAX_REELS} reels — remove one before adding another.` }) };
    }

    const newReel = { id: shortcode, url: clean, addedAt: new Date().toISOString(), addedBy: user.email };
    data.reels.push(newReel);

    const manifestB64 = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
    await putFile("reels.json", manifestB64, `Add reel ${shortcode} via admin panel`, sha);

    return { statusCode: 200, body: JSON.stringify({ ok: true, reel: newReel }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: sanitizeError(err.message) }) };
  }
};
