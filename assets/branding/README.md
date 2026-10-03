# Skirmish Arena identity

The SKYLINE wordmark and SA monogram are original vector artwork for this game. The lettering is drawn as paths; no font files or stock marks are embedded. Existing interface text continues using system fonts.

- `wordmark.svg`: transparent light lettering with a blue second line, for navy surfaces.
- `wordmark-mono.svg`: monochrome navy artwork, for light surfaces.
- `monogram.svg` / `monogram-mono.svg`: compact SA emblem, transparent.
- Matching transparent PNG exports and 256/512 PNG app icons are included.
- Root `app-icon.svg` is the PWA icon; `launcher/src-tauri/icons/icon.ico` contains 16, 24, 32, 48, 64, 128 and 256-pixel Windows icon images.

The SVG files are editable sources. `tools/export-branding.cjs` retains the original path geometry and exports runtime artwork with Chromium via Playwright. Set `SAR_PLAYWRIGHT` to your installed Playwright module if it is not resolvable from the checkout, then run `node tools/export-branding.cjs`.

Application IDs, installer product identity, signing keys and save locations are independent of this artwork and remain unchanged.
