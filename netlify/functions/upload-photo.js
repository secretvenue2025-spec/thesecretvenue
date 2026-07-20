// netlify/functions/upload-photo.js
//
// Receives a photo from admin.html, commits it to the GitHub repo (server-side,
// using a secret token that never reaches the browser), and updates manifest.json
// so the public booking page can pick up the new photo automatically.

const GITHUB_OWNER  = process.env.GITHUB_OWNER;   // e.g. "keymeat"
const GITHUB_REPO   = process.env.GITHUB_REPO;    // e.g. "secret-venue-gallery"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;   // fine-grained PAT, Contents: Read & Write, scoped to this repo only

const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

function ghHeaders() {
  return {
    "Authorization": `Bearer ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

// Strips any mention of the underlying storage provider from error text before it
// reaches the browser — keeps status codes / detail intact so a developer can still
// troubleshoot, without exposing which service is being used behind the scenes.
function sanitizeError(msg) {
  return String(msg)
    .replace(/api\.github\.com/gi, "storage-api")
    .replace(/raw\.githubusercontent\.com/gi, "storage-cdn")
    .replace(/github\.com/gi, "storage service")
    .replace(/github/gi, "storage service");
}

async function getManifest() {
  const res = await fetch(`${API}/manifest.json?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
  if (res.status === 404) {
    return { sha: null, data: { photos: [] } };
  }
  if (!res.ok) throw new Error(`Failed to read manifest.json (${res.status})`);
  const json = await res.json();
  const data = JSON.parse(Buffer.from(json.content, "base64").toString("utf-8"));
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
  // Require a logged-in Netlify Identity user (admin.html sends the JWT automatically)
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not logged in" }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { filename, contentBase64, label } = JSON.parse(event.body);
    if (!filename || !contentBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "filename and contentBase64 are required" }) };
    }

    const ext = (filename.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const safeName = `${Date.now()}.${ext}`;
    const path = `photos/${safeName}`;

    // 1. Upload the image file itself
    await putFile(path, contentBase64, `Add photo ${safeName} via admin panel`, null);

    // 2. Update manifest.json with the new entry
    const { sha, data } = await getManifest();
    data.photos.push({
      id: safeName,
      url: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`,
      label: label || "General",
      addedAt: new Date().toISOString(),
      addedBy: user.email,
    });
    const manifestB64 = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
    await putFile("manifest.json", manifestB64, `Update manifest for ${safeName}`, sha);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, photo: data.photos[data.photos.length - 1] }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: sanitizeError(err.message) }) };
  }
};
