# The Secret Venue — Self-Serve Photo Gallery: Setup Guide

**Status: the code in this bundle is already configured for the real repo**
(`keymeat2025/demosecretvenue`) — `upload-photo.js`, `delete-photo.js`,
`admin.html`, and `netlify.toml` all point to it. You don't need to edit any
repo names in the code. This guide is for the one-time environment setup on
Netlify's side, and for reference if you ever move to a different repo.

## 1. GitHub repo (already exists)
Repo: `github.com/keymeat2025/demosecretvenue`, containing:
- `manifest.json` at the root — `{ "photos": [] }` to start, now populated with real photos
- a `photos/` folder where uploaded images live

Nothing to do here unless you're setting this up fresh for a *different* venue —
in that case, create an equivalent repo and update `GITHUB_OWNER` / `GITHUB_REPO`
in `upload-photo.js`, `delete-photo.js`, `admin.html`, and `netlify.toml`.

## 2. Scoped GitHub token
1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
2. Repository access: **Only select repositories** → `demosecretvenue` only.
3. Permissions: **Contents → Read and write**. Nothing else.
4. Generate, copy the token (starts with `github_pat_...`) — you won't see it again.

This token can ONLY touch this one repo's files — even if it ever leaked, the blast
radius is just these photos, not your other repos or client sites.

## 3. Deploy to Netlify
1. Push this whole folder (this `index.html`, `admin.html`, `netlify.toml`,
   `netlify/functions/`) to your site's repo, or drag-and-drop deploy via
   Netlify's UI.
2. Site settings → **Environment variables** → add:
   - `GITHUB_OWNER` = `keymeat2025`
   - `GITHUB_REPO` = `demosecretvenue`
   - `GITHUB_BRANCH` = `main`
   - `GITHUB_TOKEN` = the token from step 2
3. Redeploy so the functions pick up the env vars.

## 4. Netlify Identity (the owner's login)
1. Netlify site → **Identity** tab → Enable Identity (if not already on).
2. Registration preferences → **Invite only** (so randoms can't sign up).
3. Invite users → enter the venue owner's/staff's email → they get an email to set a password.

## 5. Custom domain (optional)
Netlify → Domain settings → Add custom domain → follow the DNS instructions,
same as your other client sites.

## Day-to-day use (owner)
1. Go to `yourdomain.com/admin.html`
2. Log in with the invited email
3. Pick a category, choose one or more photos (up to 10 at a time), tap Upload
4. Photo(s) appear on the live booking page's gallery within about a minute
5. To remove a photo, tap the ✕ on its thumbnail in the "Current Gallery" grid

## Notes
- Gallery is capped at 100 photos total (`MAX_GALLERY_TOTAL` in `admin.html`) —
  delete old ones before hitting the limit.
- `admin.html`'s visual style now matches the main site's plum/gold redesign;
  none of its upload/delete logic changed, so behavior is identical to before.
