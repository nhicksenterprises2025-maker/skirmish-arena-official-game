# Cached desktop bootstrap regression

The HTML is an explicit minimal stale-inline fixture reproducing the previous activation deadlock: awaiting registration.update() before sending SKIP_WAITING. It is not an archived owner page. The exact legacy cache was already removed by worker activation when extraction was attempted; no account cache or profile was cleared to produce this fixture.

The worker is a pinned copy of the unchanged immutable-shell routing, evaluated with Balance 7 metadata. It demonstrates that query strings cannot escape a cached desktop-launch.html, whereas desktop-entry.html and desktop-launch.js pass through. The lifecycle test then fetches the real installed-entry source from an isolated backend and executes its actual external bootstrap for both a Balance 7 worker and the first FIELDCRAFT revision, retaining unrelated account caches.
