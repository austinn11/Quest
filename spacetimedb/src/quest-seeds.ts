import { rewardForDifficulty, type QuestTemplate } from './quest-model';
import { geographicTemplates } from './quest-locations';

const definitions: readonly (readonly [string, string, string, 'Exploration' | 'Bestiary' | 'Crafting', 'Easy' | 'Medium' | 'Hard', string])[] = [
  ['easy-cipher', 'A Coded Message', 'Learn a Caesar cipher and encode a short message on paper.', 'Exploration', 'Easy', 'A written coded message and its decoded text.'],
  ['easy-thread', 'A Small Token', 'Make a simple bracelet or small decoration using materials you already own.', 'Crafting', 'Easy', 'A handmade bracelet or small decoration.'],
  ['medium-chronicle', 'The Scholar Chronicle', 'Read a chapter of a book and write a page of notes explaining what you learned.', 'Exploration', 'Medium', 'A page of reading notes beside a book.'],
  ['medium-recipe', 'The Traveling Cook', 'Cook a recipe you have never tried and record the ingredients and result.', 'Crafting', 'Medium', 'A meal prepared by the player with ingredient notes.'],
  ['hard-study', 'Master a New Subject', 'Study a new subject across three sessions and create an illustrated guide explaining it.', 'Exploration', 'Hard', 'An illustrated study guide created by the player.'],
  ['hard-model', 'The Artisan Model', 'Design and build a detailed model from reused materials and document each stage.', 'Crafting', 'Hard', 'A detailed handmade model made from reused materials.'],
  ['easy-campus-scout', 'Scout the Campus', 'Walk to a campus landmark you have not visited before and note one detail about it.', 'Exploration', 'Easy', 'A campus landmark, building sign or outdoor campus feature.'],
  ['easy-new-path', 'The Road Less Traveled', 'Take a different walking route on a familiar journey and record what you notice.', 'Exploration', 'Easy', 'An outdoor photo of a street, path or walking route.'],
  ['easy-birdwatch', 'A Feathered Encounter', 'Observe a bird from a distance and write down its colors, sounds, or behavior.', 'Bestiary', 'Easy', 'A bird photographed outdoors (it may be small or distant).'],
  ['easy-leaf-journal', 'The Herbalist Apprentice', 'Find three different leaves without picking them and sketch their shapes.', 'Bestiary', 'Easy', 'Leaves on a plant, or a sketch of leaf shapes on paper.'],
  ['easy-paper-charm', 'Craft a Paper Charm', 'Fold a paper bookmark, flower, or other small creation and keep it as a token.', 'Crafting', 'Easy', 'A small folded or handmade paper creation.'],
  ['medium-neighborhood', 'Chart the Neighborhood', 'Explore three public landmarks in your neighborhood and sketch a simple route between them.', 'Exploration', 'Medium', 'A public landmark outdoors, or a hand-drawn route sketch.'],
  ['medium-trail-notes', 'The Ranger Notebook', 'Explore a public trail or park and document five interesting features along the route.', 'Exploration', 'Medium', 'An outdoor photo of a trail, path or park.'],
  ['medium-species-notes', 'The Bestiary Begins', 'Observe five different plants or animals and record a distinguishing feature of each.', 'Bestiary', 'Medium', 'A plant or animal photographed outdoors, or handwritten notes about one.'],
  ['medium-pollinators', 'Watch the Garden Keepers', 'Observe a garden across two visits and document insects or birds interacting with plants.', 'Bestiary', 'Medium', 'An insect or bird on or near a plant or flower.'],
  ['medium-repair', 'Mend an Everyday Relic', 'Repair or repurpose a small household item and record the steps you followed.', 'Crafting', 'Medium', 'A repaired or repurposed household item, or the repair in progress.'],
  ['hard-local-history', 'Uncover the Lost Chronicle', 'Visit three local landmarks and research the history behind each one.', 'Exploration', 'Hard', 'A historic landmark, plaque, monument or historical marker.'],
  ['hard-route-guide', 'Create an Explorer Guide', 'Design and test a walking route linking several public places, then write a short guide.', 'Exploration', 'Hard', 'A handwritten route guide or map, or a photo taken along a walking route.'],
  ['hard-field-journal', 'Keep a Field Journal', 'Over several outings, document ten different plants or animals without disturbing them.', 'Bestiary', 'Hard', 'A field journal page with notes or drawings of plants or animals.'],
  ['hard-habitat-study', 'Study a Hidden Kingdom', 'Observe a public natural area on three separate visits and compare the wildlife you find.', 'Bestiary', 'Hard', 'A natural outdoor area with visible wildlife or plants.'],
  ['hard-freshly-baked', 'Freshly Baked', 'Make a loaf of homemade bread from scratch and document your process and finished result.', 'Crafting', 'Hard', 'A homemade loaf of bread.'],
];

// Every Bestiary quest is presented as a bounty for a named creature.
const BOUNTY_TARGETS: Record<string, string> = {
  'easy-birdwatch': 'Wild Bird',
  'easy-leaf-journal': 'Three Leaf Specimens',
  'medium-species-notes': 'An Unnamed Creature',
  'medium-pollinators': 'Garden Pollinator',
  'hard-field-journal': 'Ten Field Specimens',
  'hard-habitat-study': 'Hidden Wildlife',
  'easy-lagoon-watch': 'Lagoon Creature',
  'medium-arboretum-bestiary': 'Garden Dweller',
  'hard-cedar-hill': 'Prairie Creature',
};

// Seven per difficulty retain generic quests alongside curated geographic adventures.
export const seedTemplates: QuestTemplate[] = withBounties([...definitions.map(([templateId, title, description, category, difficulty, photoGoal]) => ({
  templateId, title, description,
  category: { tag: category }, difficulty: { tag: difficulty },
  xpReward: rewardForDifficulty({ tag: difficulty }),
  latitude: templateId === 'easy-campus-scout' ? 32.9858 : undefined,
  longitude: templateId === 'easy-campus-scout' ? -96.7501 : undefined,
  isActive: true,
  locationName: templateId === 'easy-campus-scout' ? 'University of Texas at Dallas campus' : undefined,
  locationType: templateId === 'easy-campus-scout' ? 'Campus' : undefined,
  photoGoal,
  bountyTarget: undefined, questType: { tag: 'Anywhere' as const }, requiredLocationType: undefined,
})), ...geographicTemplates.map(template => ({ ...template, questType: { tag: 'Location' as const }, requiredLocationType: undefined })), ...locationRecipes()]);

function withBounties(templates: QuestTemplate[]): QuestTemplate[] {
  return templates.map(template => ({ ...template, bountyTarget: template.bountyTarget ?? BOUNTY_TARGETS[template.templateId], questType: template.latitude !== undefined ? { tag: 'Location' } : template.questType, requiredLocationType: template.requiredLocationType }));
}

function locationRecipes(): QuestTemplate[] {
  const recipes = [
    ['green-scout', 'Explore {location}', 'Visit {location} using public paths and document the landscape.', 'Exploration', 'nature'],
    ['culture-scout', 'Discover {location}', 'Visit {location} during public opening hours and record one interesting detail.', 'Exploration', 'any'],
    ['field-bounty', 'Wildlife at {location}', 'Observe wildlife at {location} from public paths without disturbing or feeding animals.', 'Bestiary', 'nature'],
    ['plant-study', 'The Flora of {location}', 'Document plants at {location} without picking or damaging them.', 'Bestiary', 'nature'],
    ['sketch-place', 'Sketch {location}', 'Visit {location} and draw a sketch inspired by the place. Leave everything as you found it.', 'Crafting', 'any'],
    ['map-place', 'Chart {location}', 'Visit {location} and draw a map of its public paths or features.', 'Crafting', 'nature'],
  ] as const;
  return (['Easy', 'Medium', 'Hard'] as const).flatMap(difficulty => recipes.map(([id, title, objective, category, requiredLocationType]) => ({
    templateId: 'region-' + difficulty.toLowerCase() + '-' + id, title,
    description: objective + (difficulty === 'Medium' ? ' Record five observations in your notes.' : difficulty === 'Hard' ? ' Make three visits and compile a detailed illustrated account.' : ' Record one observation.'),
    category: { tag: category }, difficulty: { tag: difficulty }, xpReward: rewardForDifficulty({ tag: difficulty }),
    latitude: undefined, longitude: undefined, isActive: true, locationName: undefined, locationType: undefined,
    photoGoal: category === 'Crafting' ? 'A drawing or map made by the player, inspired by {location}.' : category === 'Bestiary' ? 'A plant or wild animal photographed outdoors at {location}.' : 'An outdoor feature or public sign at {location}.',
    bountyTarget: category === 'Bestiary' ? (id === 'plant-study' ? 'Local Flora' : 'Local Wildlife') : undefined,
    questType: { tag: 'Location' }, requiredLocationType,
  })));
}
