# App branding

Keep the names **DoReGo** and **Soundglow** consistent in page titles, visible headers,
app manifests, and share metadata. Their existing SVG marks are the source artwork:

- DoReGo: `apps/dorego/public/icon.svg`
- Soundglow: `apps/soundglow/dist/favicon.svg`

Run `node scripts/generate-branding.cjs` from the repository root to regenerate both
sets of raster icons using the workspace's Playwright Chromium installation.
DoReGo's older Python entry point delegates to the same generator.

Both apps supply:

| Surface | Asset |
| --- | --- |
| Modern browser tabs | SVG favicon |
| Conventional browser fallback | `favicon.ico` (16, 32, 48 px) |
| Saved shortcuts/bookmarks | 48 and 192 px PNG icon links |
| Apple favorites/home-screen fallback | `apple-touch-icon.png` (180 px) |
| Installed app | Manifest with 192 and 512 px icons |
| Masked installed app | Separate opaque 1024 px icon with extra safe padding |
| Link sharing | Open Graph title, description, square image, and summary card |

Soundglow uses the same SVG mark in its visible header, rather than a font-dependent
Unicode character. The generated maskable assets are full bleed and leave the mark
inside the central safe area; do not reuse a transparent favicon as a maskable icon.

DoReGo's offline build hashes and caches the complete icon set. Soundglow packages
its linked icons and manifest in each immutable release; that manifest launches the
app root, while its relative icons resolve within the release. Root icon files remain
available for browser discovery. Vercel root icon responses require revalidation.

After an artwork change, regenerate, build both apps, and check the icon links and
manifest icon dimensions in the packaged output, including subpath deployment.
Inspect icons at small sizes and with circular cropping. Browser-owned bookmark and
new-tab icon databases can lag behind the page's favicon; the site cannot force those
to refresh. Revisit the saved URL after deployment, and recreate the shortcut if its
icon remains stale. This is separate from the app's service-worker update mechanism.
