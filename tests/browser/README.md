# Location lifecycle regression tests

These tests run the real location hook under React Strict Mode in a headless browser. Geolocation, OpenStreetMap responses, and the database call are simulated; they do not send location data or change Maincloud.

With Playwright and its Chromium browser installed, run from the repository root:

```sh
node --test tests/browser/quest-area.test.mjs
```

For an existing external Playwright installation, set `QUEST_PLAYWRIGHT_MODULE` to its `index.mjs` file URL. To use an installed Chrome browser, set `QUEST_BROWSER_EXECUTABLE` to its executable path. These optional browser tests run separately from `npm test` and do not add an application dependency. The test server and browser shut down automatically.
