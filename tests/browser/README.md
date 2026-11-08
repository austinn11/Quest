# Browser regression tests

These tests run the real location hook under React Strict Mode in a headless browser. Geolocation, OpenStreetMap responses, and the database call are simulated; they do not send location data or change Maincloud.

With Playwright and its Chromium browser installed, run from the repository root:

```sh
node --test tests/browser/quest-area.test.mjs
node --test tests/browser/navigation.test.mjs
```

For an existing external Playwright installation, set `QUEST_PLAYWRIGHT_MODULE` to its `index.mjs` file URL. To use an installed Chrome browser, set `QUEST_BROWSER_EXECUTABLE` to its executable path. These optional browser tests run separately from `npm test` and do not add an application dependency. The test server and browser shut down automatically.

The navigation tests mount the real shared header under React Strict Mode with a stubbed database connection and route placeholders. They check all five primary items, existing destination URLs, active parents/children, click and keyboard behavior, history navigation, outside clicks, and menus at phone/tablet/desktop widths. They do not access Maincloud or alter any existing page behavior.
