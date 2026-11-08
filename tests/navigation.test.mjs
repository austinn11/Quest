import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { Timestamp } from 'spacetimedb';
import { postLoginPath } from '../src/auth/return-path.ts';
import { totalXpForLevel } from '../shared/progression.ts';

let server;
let renderPage;

before(async () => {
  server = await createServer({
    configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    logLevel: 'error',
  });
  ({ renderPage } = await server.ssrLoadModule('/tests/navigation-harness.tsx'));
});

after(async () => { await server?.close(); });

const pages = [
  ['/', 'Dashboard'],
  ['/map', 'World Map'],
  ['/questboard', 'Questboard'],
  ['/journal', 'Quest Journal'],
  ['/bestiary', 'Bestiary'],
  ['/guild', 'Guild'],
  ['/friends', 'Friends'],
  ['/profile', 'Player Profile'],
];

for (const [path, title] of pages) {
  test(`${path} renders its page with all navigation links and one active item`, () => {
    const html = renderPage(path);
    assert.ok(html.includes(`<h1>${title}</h1>`));
    const nav = html.match(/<nav\b[^>]*aria-label="Main navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    const links = [...nav.matchAll(/<a\b([^>]*)>/g)].map(match => match[1]);
    assert.deepEqual(links.map(link => link.match(/href="([^"]*)"/)[1]), pages.map(page => page[0]));
    const active = links.filter(link => link.includes('aria-current="page"'));
    assert.equal(active.length, 1);
    assert.ok(active[0].includes(`href="${path}"`));
    assert.ok(html.includes('Sign out'));
  });
}

test('profile route retains the username editor and progression display', () => {
  const html = renderPage('/profile');
  assert.ok(html.includes('TestHero'));
  assert.ok(html.includes('Edit username'));
  assert.ok(html.includes('Total XP'));
  assert.ok(html.includes('150'));
});

test('profile displays independently derived skill titles, XP and accessible progress', () => {
  const html = renderPage('/profile', {}, 0, { explorationXp: 199, bestiaryXp: 200, craftingXp: 1400 });
  assert.ok(html.includes('<dt>Total XP</dt><dd>1,799</dd>'));
  for (const [name, level, title, xp] of [['Exploration', 1, 'Beginner', '199'], ['Bestiary', 2, 'Beginner', '200'], ['Crafting', 5, 'Novice', '1,400']]) {
    const card = html.match(new RegExp(`<article[^>]*aria-label="${name} progression"[\\s\\S]*?<\\/article>`))?.[0];
    assert.ok(card);
    assert.ok(card.includes(`Level ${level}`));
    assert.ok(card.includes(title));
    assert.ok(card.includes(`${xp} XP`));
    assert.ok(card.includes('role="progressbar"'));
  }
});

test('maximum skill progression shows Mythic and a full bar without a level 51 requirement', () => {
  const html = renderPage('/profile', {}, 0, { explorationXp: totalXpForLevel(50) + 50000, bestiaryXp: 0, craftingXp: 0 });
  const card = html.match(/<article[^>]*aria-label="Exploration progression"[\s\S]*?<\/article>/)?.[0];
  assert.ok(card.includes('Level 50'));
  assert.ok(card.includes('Mythic'));
  assert.ok(card.includes('Maximum level reached'));
  assert.ok(card.includes('aria-valuemax="100" aria-valuenow="100"'));
  assert.ok(card.includes('width:100%'));
  assert.ok(!card.includes('level 51'));
});

test('Profile, Dashboard and Questboard show identical XP-derived level and next-level progress', () => {
  for (const path of ['/profile', '/', '/questboard']) {
    const html = renderPage(path, {}, 350);
    assert.ok(html.includes('<dt>Level</dt><dd>2</dd>'));
    assert.ok(html.includes('<dt>Total XP</dt><dd>350</dd>'));
    assert.ok(html.includes('<dt>XP to level 3</dt><dd>150</dd>'));
    assert.ok(html.includes('aria-label="XP progress toward level 3"'));
    assert.ok(html.includes('aria-valuemax="300" aria-valuenow="150"'));
    assert.ok(html.includes('width:50%'));
    assert.ok(!html.includes('Level up!'));
  }
});

test('world map lists only assigned geographic quests and retains non-geographic quest access', () => {
  const slots = [
    { slotId: 'test:0', slotIndex: 0, templateId: 'campus', assignedAt: Timestamp.UNIX_EPOCH, status: { tag: 'Available' }, difficulty: { tag: 'Easy' } },
    { slotId: 'test:1', slotIndex: 1, templateId: 'craft', assignedAt: Timestamp.UNIX_EPOCH, status: { tag: 'Available' }, difficulty: { tag: 'Easy' } },
  ];
  const html = renderPage('/map', { ready: true, slots, templates: [
    { templateId: 'campus', title: 'The campus expedition', latitude: 32.9858, longitude: -96.7501 },
    { templateId: 'craft', title: 'A craft without a destination' },
    { templateId: 'not-assigned', title: 'An unassigned destination must not appear', latitude: 32.8, longitude: -96.8 },
  ] });
  assert.ok(html.includes('The campus expedition'));
  assert.ok(html.includes('1 assigned quest has'));
  assert.ok(!html.includes('An unassigned destination must not appear'));
  assert.ok(html.includes('Open your Questboard'));
  assert.ok(html.includes('My location'));
  assert.ok(html.includes('Interactive world map'));
  assert.ok(renderPage('/map', { ready: true }).includes('Your current quests have no fixed map destinations'));
});

test('quest cards link only valid destinations and map deep links open the same completable assignment', () => {
  const slots = [
    { slotId: 'test:0', slotIndex: 0, templateId: 'campus', assignedAt: Timestamp.UNIX_EPOCH, status: { tag: 'Available' }, difficulty: { tag: 'Easy' } },
    { slotId: 'test:1', slotIndex: 1, templateId: 'craft', assignedAt: Timestamp.UNIX_EPOCH, status: { tag: 'Available' }, difficulty: { tag: 'Easy' } },
  ];
  const templates = [
    { templateId: 'campus', title: 'A mapped adventure', description: 'Explore a local landmark.', category: { tag: 'Exploration' }, xpReward: 50, latitude: 32.9858, longitude: -96.7501 },
    { templateId: 'craft', title: 'A craft anywhere', description: 'Fold a paper charm.', category: { tag: 'Crafting' }, xpReward: 50 },
  ];
  const board = { ready: true, slots, templates };
  const cards = renderPage('/questboard', board);
  assert.equal((cards.match(/>View on map<\/a>/g) ?? []).length, 1);
  assert.ok(cards.includes('/map?slot=0&amp;assignedAt=0'));
  const map = renderPage('/map?slot=0&assignedAt=0', board);
  assert.ok(map.includes('<h3>A mapped adventure</h3>'));
  assert.ok(map.includes('Complete quest'));
  assert.ok(map.includes('/questboard#quest-slot-0'));
  const offline = renderPage('/map?slot=0&assignedAt=0', { ...board, connected: false, ready: false, hasSnapshot: true });
  assert.match(offline, /<button type="button" disabled="" aria-busy="false">Complete quest<\/button>/);
  assert.ok(renderPage('/map?slot=0&assignedAt=1', board).includes('That assignment has changed'));
  const unmapped = renderPage('/map?slot=1&assignedAt=0', board);
  assert.ok(unmapped.includes('This quest has no fixed map location'));
  assert.ok(!unmapped.includes('Complete quest'));
});

test('Journal links a matching cooldown completion to the map and removes that link after replacement', () => {
  const slot = { slotId: 'test:0', slotIndex: 0, templateId: 'campus', assignedAt: Timestamp.UNIX_EPOCH, status: { tag: 'Cooldown' }, difficulty: { tag: 'Easy' }, completedAt: new Timestamp(1000n), refreshAt: new Timestamp(2000n) };
  const templates = [{ templateId: 'campus', title: 'A completed expedition', description: 'Visit a landmark.', category: { tag: 'Exploration' }, difficulty: { tag: 'Easy' }, latitude: 32, longitude: -96 }];
  const completion = { completionId: 1n, templateId: 'campus', slotIndex: 0, xpAwarded: 50, completedAt: slot.completedAt };
  const board = { ready: true, templates, completions: [completion] };
  assert.ok(renderPage('/journal', { ...board, slots: [slot] }).includes('View completed quest on map'));
  const refreshed = { ...slot, status: { tag: 'Available' }, assignedAt: new Timestamp(3000n), completedAt: undefined, refreshAt: undefined };
  const journal = renderPage('/journal', { ...board, slots: [refreshed] });
  assert.ok(!journal.includes('View completed quest on map'));
  assert.ok(journal.includes('+50 XP earned'));
  assert.ok(journal.includes('A completed expedition'));
});

test('questboard displays loading and retryable initialization errors', () => {
  assert.ok(renderPage('/questboard').includes('Preparing your Questboard...'));
  const html = renderPage('/questboard', { slots: [], templates: [], ready: false, error: 'Not enough active Easy quest templates.', retry: () => {} });
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('Not enough active Easy quest templates.'));
  assert.ok(html.includes('Retry Questboard'));
  assert.ok(!html.includes('Preparing your Questboard...'));
});

test('questboard renders six assigned quests in slot order with catalogue objectives and rewards', () => {
  const difficulties = ['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Hard'];
  const slots = difficulties.map((difficulty, slotIndex) => ({
    slotId: `owner:${slotIndex}`, slotIndex, difficulty: { tag: difficulty },
    templateId: `template-${slotIndex}`, status: { tag: 'Available' },
    assignedAt: Timestamp.UNIX_EPOCH,
  }));
  const templates = slots.map(slot => ({
    templateId: slot.templateId, title: `Adventure ${slot.slotIndex + 1}`,
    description: `Objective ${slot.slotIndex + 1}`, category: { tag: 'Exploration' },
    xpReward: { Easy: 50, Medium: 100, Hard: 200 }[slot.difficulty.tag],
  }));
  const html = renderPage('/questboard', { slots: slots.reverse(), templates, ready: true, error: null, retry: () => {} });
  assert.equal((html.match(/<li\b/g) ?? []).length, 6);
  assert.equal((html.match(/class="quest-status">Available<\/span>/g) ?? []).length, 6);
  assert.equal((html.match(/<ol class="questboard"/g) ?? []).length, 1);
  assert.ok(!html.includes('Questboard overview'));
  assert.ok(!html.includes('Assigned slots'));
  for (const difficulty of ['Easy', 'Medium', 'Hard']) assert.ok(!html.includes(`${difficulty} quests</h2>`));
  assert.equal((html.match(/<summary>Inspect quest<\/summary>/g) ?? []).length, 6);
  assert.ok(html.indexOf('Adventure 1') < html.indexOf('Adventure 6'));
  for (const template of templates) {
    assert.ok(html.includes(template.title));
    assert.ok(html.includes(template.description));
    assert.ok(html.includes(`${template.xpReward} XP reward`));
  }
  assert.ok(!html.includes('Preparing your Questboard...'));
});

test('cooldown slots show persisted dates and countdowns without an available completion action', () => {
  const html = renderPage('/questboard', {
    ready: true,
    slots: [{ slotId: 'test:5', slotIndex: 5, difficulty: { tag: 'Hard' }, templateId: 'hard-template', status: { tag: 'Cooldown' }, assignedAt: Timestamp.UNIX_EPOCH, completedAt: new Timestamp(1000000n), refreshAt: new Timestamp(2000000n) }],
    templates: [{ templateId: 'hard-template', title: 'The old watchtower', description: 'Explore a safe local landmark.', category: { tag: 'Exploration' }, xpReward: 200, isActive: false, latitude: 32.9858, longitude: -96.7501 }],
  });
  assert.ok(html.includes('Cooldown'));
  assert.ok(html.includes('Eligible for replacement'));
  assert.ok(html.includes('1970-01-01T00:00:02.000Z'));
  assert.ok(html.includes('32.98580, -96.75010'));
  assert.ok(html.includes('The old watchtower'));
  assert.ok(html.includes('Replacement in'));
  assert.ok(html.includes('2s'));
  assert.ok(!html.includes('Complete quest'));
});

test('completion is disabled on stale data and elapsed countdowns wait for server confirmation', () => {
  const slot = { slotId: 'test:0', slotIndex: 0, difficulty: { tag: 'Easy' }, templateId: 'easy-template', status: { tag: 'Available' }, assignedAt: Timestamp.UNIX_EPOCH };
  const template = { templateId: 'easy-template', title: 'A local expedition', description: 'Find a safe new walking route.', category: { tag: 'Exploration' }, xpReward: 50 };
  const connected = renderPage('/questboard', { ready: true, slots: [slot], templates: [template] });
  assert.match(connected, /<button type="button" aria-busy="false">Complete quest<\/button>/);
  const offline = renderPage('/questboard', { connected: false, ready: false, hasSnapshot: true, slots: [slot], templates: [template] });
  assert.match(offline, /<button type="button" disabled="" aria-busy="false">Complete quest<\/button>/);
  const elapsed = renderPage('/questboard', { ready: true, now: 3000, slots: [{ ...slot, status: { tag: 'Cooldown' }, completedAt: new Timestamp(1000000n), refreshAt: new Timestamp(2000000n) }], templates: [template] });
  assert.ok(elapsed.includes('Cooldown elapsed. Awaiting a replacement'));
  assert.ok(!elapsed.includes('Complete quest'));
  const refreshFailure = renderPage('/questboard', { ready: true, refreshError: 'Database busy' });
  assert.ok(refreshFailure.includes('Database busy'));
  assert.ok(refreshFailure.includes('Retry replacements'));
});

test('journal has its own loading and empty states and does not list current assignments', () => {
  assert.ok(renderPage('/journal').includes('Opening your Quest Journal...'));
  const html = renderPage('/journal', {
    ready: true,
    slots: [{ templateId: 'assigned', slotIndex: 0 }],
    templates: [{ templateId: 'assigned', title: 'Current quest should stay on the board' }],
  });
  assert.ok(html.includes('Your story is unwritten'));
  assert.ok(html.includes('Explore your assigned quests'));
  assert.ok(!html.includes('Current quest should stay on the board'));
});

test('journal orders history by completion time, preserves repeat completions, and uses awarded XP', () => {
  const completions = [
    { completionId: 1n, templateId: 'old', slotIndex: 0, xpAwarded: 37, completedAt: new Timestamp(1000000n) },
    { completionId: 2n, templateId: 'new', slotIndex: 3, xpAwarded: 83, completedAt: new Timestamp(2000000n) },
    { completionId: 3n, templateId: 'old', slotIndex: 1, xpAwarded: 41, completedAt: new Timestamp(3000000n) },
  ];
  const templates = [
    { templateId: 'old', title: 'First adventure', description: 'A remembered walk.', category: { tag: 'Exploration' }, difficulty: { tag: 'Easy' }, xpReward: 999, isActive: false },
    { templateId: 'new', title: 'Second adventure', description: 'A completed craft.', category: { tag: 'Crafting' }, difficulty: { tag: 'Medium' }, xpReward: 888 },
  ];
  const html = renderPage('/journal', { ready: true, completions, templates });
  const timestamps = [...html.matchAll(/<time dateTime="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(timestamps, ['1970-01-01T00:00:03.000Z', '1970-01-01T00:00:02.000Z', '1970-01-01T00:00:01.000Z']);
  assert.equal((html.match(/<h3>First adventure<\/h3>/g) ?? []).length, 2);
  for (const xp of [37, 83, 41]) assert.ok(html.includes(`+${xp} XP earned`));
  assert.ok(html.includes('<dd>161</dd>'));
  assert.ok(!html.includes('999'));
  assert.ok(!html.includes('888'));
  assert.ok(!html.includes('Your story is unwritten'));
  assert.deepEqual(completions.map(completion => completion.completionId), [1n, 2n, 3n]);
});

test('missing template information preserves saved assignments and historical rewards', () => {
  const board = renderPage('/questboard', { ready: true, slots: [{ slotId: 'test:0', slotIndex: 0, difficulty: { tag: 'Easy' }, status: { tag: 'Available' }, templateId: 'missing', assignedAt: Timestamp.UNIX_EPOCH }] });
  assert.ok(board.includes('Quest details unavailable'));
  assert.ok(board.includes('Your assignment is still saved'));
  const journal = renderPage('/journal', { ready: true, completions: [{ completionId: 99n, templateId: 'missing', slotIndex: 0, xpAwarded: 50, completedAt: Timestamp.UNIX_EPOCH }] });
  assert.ok(journal.includes('An accomplished adventure'));
  assert.ok(journal.includes('+50 XP earned'));
  assert.ok(journal.includes('Your accomplishment remains recorded'));
});

test('disconnected and failed subscriptions do not masquerade as an empty journal', () => {
  for (const path of ['/questboard', '/journal']) {
    const offline = renderPage(path, { connected: false, ready: false });
    assert.ok(offline.includes('Waiting for the database connection'));
    const failed = renderPage(path, { subscriptionError: 'Subscription denied', ready: false });
    assert.ok(failed.includes('Subscription denied'));
    assert.ok(failed.includes(path === '/questboard' ? 'Retry Questboard' : 'Retry Journal'));
    assert.ok(!failed.includes('Your story is unwritten'));
  }
  const cached = renderPage('/journal', { connected: false, hasSnapshot: true, completions: [{ completionId: 1n, templateId: 'missing', slotIndex: 0, xpAwarded: 50, completedAt: Timestamp.UNIX_EPOCH }] });
  assert.ok(cached.includes('may be out of date'));
  assert.ok(cached.includes('+50 XP earned'));
});

test('journal remains readable if board initialization fails and links back to the board', () => {
  const html = renderPage('/journal', { ready: true, error: 'Not enough templates', initializing: false });
  assert.ok(html.includes('Your story is unwritten'));
  assert.ok(html.includes('Return to your Questboard'));
  assert.ok(!html.includes('Not enough templates'));
  assert.ok(renderPage('/questboard', { ready: true }).includes('Your board awaits'));
});

test('unknown paths show a recovery link inside the shared layout', () => {
  const html = renderPage('/unknown-path');
  assert.ok(html.includes('<h1>Page not found</h1>'));
  assert.ok(html.includes('Return home'));
  assert.ok(html.includes('Main navigation'));
});

test('login restores local deep links and rejects external or callback destinations', () => {
  for (const [path] of pages) assert.equal(postLoginPath({ returnTo: path }), path);
  assert.equal(postLoginPath({ returnTo: '/journal?status=active#quests' }), '/journal?status=active#quests');
  for (const returnTo of ['https://example.com', '//example.com', '/\\example.com', '/callback', '/callback?code=old', '/\n/evil']) {
    assert.equal(postLoginPath({ returnTo }), '/');
  }
  assert.equal(postLoginPath(undefined), '/');
});

test('nearby quests are opt-in and each notice says what photo proves it', () => {
  const slot = { slotId: 'me:0', slotIndex: 0, difficulty: { tag: 'Easy' }, templateId: 'local-000000000001', status: { tag: 'Available' }, assignedAt: Timestamp.UNIX_EPOCH };
  const templates = [{
    templateId: 'local-000000000001', title: 'Wildlife of Duck Pond', description: 'At Duck Pond, photograph a bird.',
    category: { tag: 'Bestiary' }, difficulty: { tag: 'Easy' }, xpReward: 50, isActive: true,
    latitude: 32.99, longitude: -96.75, locationName: 'Duck Pond', locationType: 'Lake or pond',
    photoGoal: 'A living bird photographed outdoors.',
  }];
  const html = renderPage('/questboard', { ready: true, slots: [slot], templates });
  assert.ok(html.includes('Find quests near me'));
  assert.ok(html.includes('A living bird photographed outdoors.'));
  assert.match(html, /<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(html, /<button type="button" aria-busy="false">Claim bounty<\/button>/);
  const located = renderPage('/questboard', {
    ready: true, slots: [slot], templates,
    location: { status: { kind: 'ready', message: 'Quests near you · 12 places within 8.0 km' }, enable() {}, disable() {}, retry() {} },
  });
  assert.ok(located.includes('Quests near you · 12 places within 8.0 km'));
  assert.ok(located.includes('Stop using my location'));
  assert.ok(!located.includes('Find quests near me'));
});

test('location use can be stopped while finding places or recovering from an error', () => {
  for (const kind of ['locating', 'scouting', 'error']) {
    const html = renderPage('/questboard', {
      ready: true,
      location: { status: { kind, message: 'Lookup failed' }, enable() {}, disable() {}, retry() {} },
    });
    assert.ok(html.includes('Stop using my location'), `${kind} must allow cancellation`);
  }
});

test('the journal shows what the AI judge saw in an accepted photo', () => {
  const completions = [{ completionId: 1n, templateId: 'local-000000000001', slotIndex: 0, xpAwarded: 50, completedAt: new Timestamp(1000000n), proofNote: 'A grackle on a fence' }];
  const templates = [{ templateId: 'local-000000000001', title: 'Wildlife of Duck Pond', description: 'Photograph a bird.', category: { tag: 'Bestiary' }, difficulty: { tag: 'Easy' }, xpReward: 50 }];
  const html = renderPage('/journal', { ready: true, completions, templates });
  assert.ok(html.includes('The guild saw: A grackle on a fence'));
});

const PHOTO = 'data:image/jpeg;base64,QUJD';
const heronBounty = {
  templateId: 'local-000000000002', title: 'Wanted: Heron or Egret', description: 'A bounty is posted at Duck Pond. Capture a heron or egret on camera there.',
  category: { tag: 'Bestiary' }, difficulty: { tag: 'Hard' }, xpReward: 200, isActive: true, latitude: 32.99, longitude: -96.75,
  locationName: 'Duck Pond', locationType: 'Lake or pond', photoGoal: 'A heron or egret, photographed in the wild.', bountyTarget: 'Heron or Egret',
};

test('Bestiary quests are wanted posters that show the capture once claimed', () => {
  const open = { slotId: 'me:5', slotIndex: 5, difficulty: { tag: 'Hard' }, templateId: heronBounty.templateId, status: { tag: 'Available' }, assignedAt: Timestamp.UNIX_EPOCH };
  const html = renderPage('/questboard', { ready: true, slots: [open], templates: [heronBounty] });
  assert.match(html, /class="notice-sheet bounty-sheet"/);
  assert.match(html, /<p class="bounty-wanted" aria-hidden="true">Wanted<\/p>/);
  assert.ok(html.includes('<h2><span class="visually-hidden">Wanted: </span>Heron or Egret</h2>'));
  assert.ok(html.includes('Last seen near Duck Pond'));
  assert.ok(html.includes('<strong>200 XP</strong>'));
  assert.ok(!html.includes('bounty-alias'), 'a generated title is not repeated');
  assert.match(html, /<button type="button" aria-busy="false">Claim bounty<\/button>/);

  const completedAt = new Timestamp(5_000_000n);
  const claimed = { ...open, status: { tag: 'Cooldown' }, completedAt, refreshAt: new Timestamp(9_000_000_000n) };
  const completions = [{ completionId: 7n, templateId: heronBounty.templateId, slotIndex: 5, xpAwarded: 200, completedAt }];
  const captures = [{ captureId: 1n, completionId: 7n, templateId: heronBounty.templateId, bountyTarget: 'Heron or Egret', creature: 'Great Egret', verified: true, photo: PHOTO, locationName: 'Duck Pond', capturedAt: completedAt }];
  const done = renderPage('/questboard', { ready: true, slots: [claimed], templates: [heronBounty], completions, captures });
  assert.ok(done.includes(`<img src="${PHOTO}" alt="Your capture: Great Egret"/>`));
  assert.ok(done.includes('Captured: Great Egret'));
  assert.ok(done.includes('Bounty claimed'));
  assert.ok(!done.includes('Claim bounty'));
});

test('catalogue bounties keep their original title beneath the wanted name', () => {
  const birdwatch = { templateId: 'easy-birdwatch', title: 'A Feathered Encounter', description: 'Observe a bird from a distance.', category: { tag: 'Bestiary' }, difficulty: { tag: 'Easy' }, xpReward: 50, isActive: true, bountyTarget: 'Wild Bird' };
  const slot = { slotId: 'me:0', slotIndex: 0, difficulty: { tag: 'Easy' }, templateId: 'easy-birdwatch', status: { tag: 'Available' }, assignedAt: Timestamp.UNIX_EPOCH };
  const html = renderPage('/questboard', { ready: true, slots: [slot], templates: [birdwatch] });
  assert.ok(html.includes('Wild Bird</h2>'));
  assert.ok(html.includes('<p class="bounty-alias">A Feathered Encounter</p>'));
});

test('the Bestiary page lists private captures with photos, newest first, and has an empty state', () => {
  const captures = [
    { captureId: 1n, completionId: 1n, templateId: 'a', bountyTarget: 'Wild Bird', creature: 'Northern Cardinal', verified: true, photo: PHOTO, locationName: 'Lone Oak Park', capturedAt: new Timestamp(1_000_000n) },
    { captureId: 2n, completionId: 2n, templateId: 'b', bountyTarget: 'Turtle', creature: 'Red-eared Slider', verified: false, photo: PHOTO, locationName: undefined, capturedAt: new Timestamp(2_000_000n) },
    { captureId: 3n, completionId: 3n, templateId: 'c', bountyTarget: 'Wild Bird', creature: 'northern cardinal', verified: true, photo: PHOTO, locationName: undefined, capturedAt: new Timestamp(3_000_000n) },
  ];
  const html = renderPage('/bestiary', { ready: true, captures });
  assert.ok(html.includes('<h1>Bestiary</h1>'));
  assert.ok(html.includes('<strong>3</strong> captures'));
  assert.ok(html.includes('<strong>2</strong> kinds of creature'));
  const names = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]);
  assert.deepEqual(names, ['northern cardinal', 'Red-eared Slider', 'Northern Cardinal']);
  assert.equal((html.match(/<img src="data:image\/jpeg;base64,QUJD"/g) ?? []).length, 3);
  assert.ok(html.includes('Verified by the guild'));
  assert.ok(html.includes('Not AI-checked'));
  assert.ok(html.includes('Bounty: Turtle'));
  const empty = renderPage('/bestiary', { ready: true });
  assert.ok(empty.includes('No creatures captured yet'));
  assert.ok(empty.includes('See open bounties'));
  assert.ok(renderPage('/bestiary').includes('Opening your Bestiary...'));
});

test('journal entries for claimed bounties show the captured photo', () => {
  const completedAt = new Timestamp(5_000_000n);
  const completions = [{ completionId: 7n, templateId: heronBounty.templateId, slotIndex: 5, xpAwarded: 200, completedAt }];
  const captures = [{ captureId: 1n, completionId: 7n, templateId: heronBounty.templateId, bountyTarget: 'Heron or Egret', creature: 'Great Egret', verified: true, photo: PHOTO, locationName: 'Duck Pond', capturedAt: completedAt }];
  const html = renderPage('/journal', { ready: true, completions, templates: [heronBounty], captures });
  assert.match(html, /<a class="journal-capture" href="\/bestiary"/);
  assert.ok(html.includes('Captured: Great Egret'));
});

test('without a guild, the Guild page offers invite codes, founding, and the open directory', () => {
  const directory = [
    { guildId: 1n, name: 'Owl Watch', motto: 'Eyes open.', crest: 'dusk', isOpen: true, memberCount: 3, totalXp: 900n, foundedAt: new Timestamp(1n) },
    { guildId: 2n, name: 'Fox Den', motto: '', crest: 'ember', isOpen: false, memberCount: 1, totalXp: 2000n, foundedAt: new Timestamp(1n) },
  ];
  const html = renderPage('/guild', {}, 150, undefined, { directory });
  assert.ok(html.includes('<h1>Guild</h1>'));
  assert.ok(html.includes('Join with an invite code'));
  assert.ok(html.includes('Found a guild'));
  assert.ok(html.indexOf('Fox Den') < html.indexOf('Owl Watch'), 'ranked by guild XP');
  assert.ok(html.includes('3 members · 900 XP'));
  assert.equal((html.match(/>Join<\/button>/g) ?? []).length, 1, 'only open guilds can be joined from the directory');
  assert.ok(html.includes('Invite only'));
  assert.ok(renderPage('/guild', {}, 150, undefined, { ready: false }).includes('Opening the guild hall...'));
});

test('members see their guild, invite code, and roster with the leader first', () => {
  const guild = { guildId: 1n, name: 'The Wandering Owls', motto: 'We see the trail at night.', crest: 'dusk', isOpen: true, joinCode: 'K7Q2MX', role: 'Leader', memberCount: 2, totalXp: 1100n, foundedAt: new Timestamp(1_000_000n) };
  const members = [
    { memberId: 'b', name: 'Bob', xp: 750, level: 3, role: 'Member', joinedAt: new Timestamp(2n), isYou: false },
    { memberId: 'a', name: 'Alice', xp: 350, level: 2, role: 'Leader', joinedAt: new Timestamp(1n), isYou: true },
  ];
  const html = renderPage('/guild', {}, 150, undefined, { guild, members });
  assert.ok(html.includes('The Wandering Owls</h2>'));
  assert.ok(html.includes('<span class="guild-crest crest-dusk crest-lg" aria-hidden="true">WO</span>'));
  assert.ok(html.includes('<code class="guild-code">K7Q2MX</code>'));
  assert.ok(html.indexOf('Alice (you)') < html.indexOf('Bob'));
  assert.ok(html.includes('Make the guild invite only'));
  assert.ok(html.includes('Leave guild'));
  assert.ok(!html.includes('Found a guild'));
  const member = renderPage('/guild', {}, 150, undefined, { guild: { ...guild, role: 'Member' }, members });
  assert.ok(!member.includes('Make the guild invite only'));
});

test('guild members see shared guild quests with progress, their share and rewards', () => {
  const guild = { guildId: 1n, name: 'Owl Watch', motto: '', crest: 'moss', isOpen: true, joinCode: 'K7Q2MX', role: 'Member', memberCount: 2, totalXp: 400n, foundedAt: new Timestamp(1n) };
  const far = new Timestamp(BigInt(Date.now() + 3 * 86_400_000) * 1000n);
  const quests = [
    { guildQuestId: 1n, kind: 'Bestiary', title: 'The Great Hunt', description: 'Claim 5 Bestiary bounties as a guild.', target: 5, progress: 2, rewardXp: 100, startedAt: new Timestamp(1n), endsAt: far, completedAt: undefined, yourContribution: 1, contributors: 2 },
    { guildQuestId: 2n, kind: 'Experience', title: 'Strength in Numbers', description: 'Earn 450 quest XP together this week.', target: 450, progress: 450, rewardXp: 150, startedAt: new Timestamp(1n), endsAt: far, completedAt: new Timestamp(2n), yourContribution: 200, contributors: 2 },
  ];
  const html = renderPage('/guild', {}, 150, undefined, { guild, quests });
  assert.ok(html.includes('Guild quests'));
  assert.ok(html.includes('The Great Hunt'));
  assert.ok(html.includes('2 / 5'));
  assert.ok(html.includes('Your share: 1'));
  assert.ok(html.includes('Reward: +100 XP each'));
  assert.ok(html.includes('aria-valuemax="5" aria-valuenow="2"'));
  assert.ok(html.includes('+150 XP paid to 2 members'));
  assert.ok(html.includes('Completed'));
  assert.match(html, /\d days? left/);
  assert.ok(renderPage('/guild', {}, 150, undefined, { guild, quests: [] }).includes('Posting this week'));
});

test('the Friends page shows requests, friends with party invites, and the party with its shared quest', () => {
  const friends = [{ friendshipId: 1n, username: 'Bob', level: 3, totalXp: 750, inYourParty: true, inAParty: true }, { friendshipId: 2n, username: 'Cara', level: 1, totalXp: 0, inYourParty: false, inAParty: false }];
  const requests = [{ requestId: 9n, username: 'Dan', incoming: true, createdAt: new Timestamp(1n) }];
  const invites = [{ inviteId: 4n, fromName: 'Eve', partySize: 2, createdAt: new Timestamp(1n) }];
  const party = { partyId: 1n, isLeader: true, leaderName: 'TestHero', questTemplateId: 'easy-birdwatch', questTitle: 'A Feathered Encounter', questDescription: 'Observe a bird.', questCategory: 'Bestiary', questXpEach: 62, questPhotoGoal: 'A bird photographed outdoors.', questLocationName: undefined, lastQuestTitle: 'Scout the Campus', lastCompletedBy: 'Bob', lastObservation: undefined, lastXpEach: 62, lastCompletedAt: new Timestamp(1_000_000n) };
  const partyMembers = [{ memberId: 'a', username: 'TestHero', level: 1, isLeader: true, isYou: true, joinedAt: new Timestamp(1n) }, { memberId: 'b', username: 'Bob', level: 3, isLeader: false, isYou: false, joinedAt: new Timestamp(2n) }];
  const html = renderPage('/friends', {}, 150, undefined, {}, { friends, requests, invites, party, partyMembers });
  assert.ok(html.includes('<h1>Friends</h1>'));
  assert.ok(html.includes('Eve invited you to their party (2/4)'));
  assert.ok(html.includes('wants to be friends'));
  assert.ok(html.includes('A Feathered Encounter'));
  assert.ok(html.includes('+62 XP each'));
  assert.ok(html.includes('Complete together'));
  assert.ok(html.includes('Change the party quest'));
  assert.ok(html.includes('completed by Bob'));
  assert.ok(html.includes('In your party'));
  assert.equal((html.match(/>Invite to party<\/button>/g) ?? []).length, 1, 'only friends outside your party get an invite button');

  const solo = renderPage('/friends', {}, 150, undefined, {}, {});
  assert.ok(solo.includes('Start a party'));
  assert.ok(solo.includes('No friends yet'));
  const member = renderPage('/friends', {}, 150, undefined, {}, { party: { ...party, isLeader: false, leaderName: 'Bob', questTitle: undefined, questTemplateId: undefined }, partyMembers });
  assert.ok(member.includes('Waiting for Bob to choose a party quest.'));
  assert.ok(!member.includes('Party quest</span>'));
});
