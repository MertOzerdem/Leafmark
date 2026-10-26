# Leafmark

Leafmark is a private reading journal designed for iPad. The active delivery target is a Safari Home Screen web app. The earlier Expo iOS implementation remains in the repository as shelved source.

The PWA is a static site hosted by GitHub Pages. It has no Leafmark backend, paid runtime service, cloud account, or device sync. The journal stays in browser storage on the iPad; export and restore are the way to move it to another device.

Published app: [https://mertozerdem.github.io/Leafmark/](https://mertozerdem.github.io/Leafmark/)

## Build and preview

```sh
npm ci
npm run web:export
npm run web:serve
```

Open `http://127.0.0.1:4173/Leafmark/` in a browser. The first visit and app updates need internet; after the app shell has been cached, it can open offline.

## Install on iPad

Open the published Leafmark site in Safari, tap **Share**, then choose **Add to Home Screen**. Launch Leafmark from the Home Screen for its standalone window and local storage behavior.

## Checks

```sh
npm run typecheck
npm test
npx playwright test --config playwright.config.ts
```
