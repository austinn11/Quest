import { rewardForDifficulty, type QuestTemplate } from './quest-model';
import { geographicTemplates } from './quest-locations';

const definitions: readonly (readonly [string, string, string, 'Exploration' | 'Bestiary' | 'Crafting', 'Easy' | 'Medium' | 'Hard', string])[] = [
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
  bountyTarget: undefined,
})), ...geographicTemplates]);

function withBounties(templates: QuestTemplate[]): QuestTemplate[] {
  return templates.map(template => ({ ...template, bountyTarget: BOUNTY_TARGETS[template.templateId] }));
}
