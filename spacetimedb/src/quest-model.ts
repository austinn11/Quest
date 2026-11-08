import { t, table, type Infer } from 'spacetimedb/server';

export const QuestCategory = t.enum('QuestCategory', {
  Exploration: t.unit(),
  Bestiary: t.unit(),
  Crafting: t.unit()
});

export const QuestDifficulty = t.enum('QuestDifficulty', {
  Easy: t.unit(),
  Medium: t.unit(),
  Hard: t.unit()
});

export const QuestScope = t.enum('QuestScope', {
  Shared: t.unit(),
  Personal: t.unit(),
});

// Available is derived from the absence of participation, not stored per player.
export const QuestProgressStatus = t.enum('QuestProgressStatus', {
  Active: t.unit(),
  Completed: t.unit(),
});

export const QuestLocation = t.object('QuestLocation', {
  name: t.string(),
  latitude: t.f64(),
  longitude: t.f64(),
});

export const quests = table(
  { name: 'quests' },
  {
    id: t.string().primaryKey(),
    creatorIdentity: t.identity().index('btree'),
    title: t.string(),
    description: t.string(),
    category: QuestCategory.index('btree'),
    difficulty: QuestDifficulty.index('btree'),
    xpReward: t.u32(),
    location: t.option(QuestLocation),
    scope: QuestScope.index('btree'),
    createdAt: t.timestamp(),
  }
);

export const playerQuestProgress = table(
  { name: 'player_quest_progress' },
  {
    // Derived on the server from the identity + quest ID, enforcing one participation per pair.
    id: t.string().primaryKey(),
    playerIdentity: t.identity().index('btree'),
    questId: t.string().index('btree'),
    status: QuestProgressStatus,
    acceptedAt: t.timestamp(),
    completedAt: t.option(t.timestamp()),
    xpReward: t.u32(),
  }
);

type QuestInput = {
  title: string;
  description: string;
  category: Infer<typeof QuestCategory>;
  difficulty: Infer<typeof QuestDifficulty>;
  location?: Infer<typeof QuestLocation>;
};

const rewards = { Easy: 50, Medium: 100, Hard: 200 } as const;
const categories = new Set(Object.keys(QuestCategory.variants));

export function validateQuest(input: QuestInput): string | null {
  const titleLength = input.title.trim().length;
  if (titleLength < 3 || titleLength > 100) return 'Quest titles must contain 3 to 100 characters.';
  const descriptionLength = input.description.trim().length;
  if (descriptionLength < 10 || descriptionLength > 2000) return 'Quest descriptions must contain 10 to 2000 characters.';
  if (!categories.has(input.category.tag)) return 'Choose a valid quest category.';
  if (!Object.prototype.hasOwnProperty.call(rewards, input.difficulty.tag)) return 'Choose a valid quest difficulty.';
  if (input.location) {
    const { name, latitude, longitude } = input.location;
    if (!name.trim() || name.trim().length > 120) return 'Location names must contain 1 to 120 characters.';
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return 'Latitude must be between -90 and 90.';
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return 'Longitude must be between -180 and 180.';
  }
  return null;
}

export function rewardForDifficulty(difficulty: Infer<typeof QuestDifficulty>): number {
  return rewards[difficulty.tag];
}

type SampleQuest = QuestInput & { id: string };

// Stable IDs make seeding safe to repeat on initialization and connection after upgrades.
export const sampleQuests: SampleQuest[] = [
  {
    id: 'sample-campus-explorer',
    title: 'Scout the Campus',
    description: 'Take a walk around UT Dallas and discover a campus landmark you have not visited before.',
    category: { tag: 'Exploration' }, difficulty: { tag: 'Easy' },
    location: { name: 'UT Dallas', latitude: 32.9858, longitude: -96.7501 },
  },
  {
    id: 'sample-nature-observer',
    title: 'Keep a Field Journal',
    description: 'Over several outings, observe and document ten different plants or animals without disturbing them.',
    category: { tag: 'Bestiary' }, difficulty: { tag: 'Easy' },
  },
  {
    id: 'sample-trail-walk',
    title: 'Freshly Baked',
    description: 'Make a loaf of homemade bread and cook it on a campfire.',
    category: { tag: 'Crafting' }, difficulty: { tag: 'Hard' },
  },
];
