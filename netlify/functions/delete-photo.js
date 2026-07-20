// netlify/functions/delete-photo.js
//
// Removes a photo file from the GitHub repo and its entry from manifest.json.

const GITHUB_OWNER  = process.env.GITHUB_OWNER;
const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;

const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

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

async function getFile(path) {
  const res = await fetch(`${API}/${path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
  if (!res.ok) return null;
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
    const { photoId } = JSON.parse(event.body);
    if (!photoId) {
      return { statusCode: 400, body: JSON.stringify({ error: "photoId is required" }) };
    }

    // 1. Update manifest.json — remove the entry
    const manifestFile = await getFile("manifest.json");
    if (!manifestFile) {
      return { statusCode: 404, body: JSON.stringify({ error: "manifest.json not found" }) };
    }
    const data = JSON.parse(Buffer.from(manifestFile.content, "base64").toString("utf-8"));
    data.photos = data.photos.filter((p) => p.id !== photoId);
    const manifestB64 = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
    await fetch(`${API}/manifest.json`, {
      method: "PUT",
      headers: ghHeaders(),
      body: JSON.stringify({
        message: `Remove photo ${photoId}`,
        content: manifestB64,
        branch: GITHUB_BRANCH,
        sha: manifestFile.sha,
      }),
    });

    // 2. Delete the actual image file
    const photoPath = `photos/${photoId}`;
    const photoFile = await getFile(photoPath);
    if (photoFile) {
      await fetch(`${API}/${photoPath}`, {
        method: "DELETE",
        headers: ghHeaders(),
        body: JSON.stringify({
          message: `Delete photo ${photoId}`,
          sha: photoFile.sha,
          branch: GITHUB_BRANCH,
        }),
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: sanitizeError(err.message) }) };
  }
};
