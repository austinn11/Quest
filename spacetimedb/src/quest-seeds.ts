import { rewardForDifficulty, type QuestTemplate } from './quest-model';
import { geographicTemplates } from './quest-locations';

const definitions: readonly (readonly [string, string, string, 'Exploration' | 'Bestiary' | 'Crafting', 'Easy' | 'Medium' | 'Hard', string])[] = [
  ['easy-campus-scout', 'Scout the Campus', 'Walk to a campus landmark you have never visited before and photograph it, or its sign, so the guild knows where you went.', 'Exploration', 'Easy', 'A campus landmark, building sign or outdoor campus feature.'],
  ['easy-new-path', 'The Road Less Traveled', 'Take a different walking route on a familiar journey and photograph the most interesting thing you pass along the way.', 'Exploration', 'Easy', 'An outdoor photo of a street, path or something seen along a walking route.'],
  ['easy-birdwatch', 'A Feathered Encounter', 'Find a wild bird and photograph it from a respectful distance. Small or far away is fine; do not chase or feed it.', 'Bestiary', 'Easy', 'A real bird photographed outdoors (it may be small or distant).'],
  ['easy-leaf-journal', 'The Herbalist Apprentice', 'Find three different kinds of leaves without picking them and photograph them together in one shot, or sketch their shapes and photograph the sketch.', 'Bestiary', 'Easy', 'Leaves from at least two kinds of plant, or a sketch of leaf shapes on paper.'],
  ['easy-paper-charm', 'Craft a Paper Charm', 'Fold a paper bookmark, flower or other small creation by hand and photograph the finished charm.', 'Crafting', 'Easy', 'A small folded or handmade paper creation.'],
  ['medium-neighborhood', 'Chart the Neighborhood', 'Visit three public landmarks near you, then draw a simple map of the route between them. Photograph your map.', 'Exploration', 'Medium', 'A hand-drawn map or route sketch with places marked.'],
  ['medium-trail-notes', 'The Ranger\'s Trail', 'Walk a public trail or park path and photograph the best view, marker or feature you find along it.', 'Exploration', 'Medium', 'An outdoor photo of a trail, path, park view or trail marker.'],
  ['medium-species-notes', 'The Bestiary Begins', 'Find a wild plant or animal you cannot name yet and photograph it clearly enough that it could be identified.', 'Bestiary', 'Medium', 'A clear photo of a wild plant, insect or animal outdoors.'],
  ['medium-pollinators', 'Watch the Garden Keepers', 'Find a bee, butterfly, other insect or bird visiting a flower and photograph it in the act.', 'Bestiary', 'Medium', 'An insect or bird on or right next to a flower or plant.'],
  ['medium-repair', 'Mend an Everyday Relic', 'Repair or repurpose a small household item and photograph the finished result.', 'Crafting', 'Medium', 'A repaired or repurposed household item.'],
  ['hard-local-history', 'Uncover the Lost Chronicle', 'Find a historical marker, plaque or monument near you and photograph it so its text or subject can be seen.', 'Exploration', 'Hard', 'A historical marker, plaque or monument with its text or subject visible.'],
  ['hard-route-guide', 'Create an Explorer\'s Guide', 'Design a walking route linking several public places and draw it as a guide: a map with the stops labelled and a tip for each. Photograph the guide.', 'Exploration', 'Hard', 'A hand-drawn map or route guide with written labels.'],
  ['hard-field-journal', 'Keep a Field Journal', 'Fill one journal page with drawings of at least five different plants or animals you have seen, each labelled with its name. Photograph the page.', 'Bestiary', 'Hard', 'A handwritten field journal page with several drawings of plants or animals and notes.'],
  ['hard-habitat-study', 'Study a Hidden Kingdom', 'Go to a natural area such as a creek, pond or woodland and photograph wildlife in its habitat: an animal, a nest, tracks or a burrow.', 'Bestiary', 'Hard', 'Wildlife or signs of wildlife (nest, tracks, burrow) in a natural outdoor setting.'],
  ['hard-freshly-baked', 'Freshly Baked', 'Bake a loaf of bread from scratch and photograph the finished loaf.', 'Crafting', 'Hard', 'A homemade loaf of bread.'],
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
