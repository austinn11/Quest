import { rewardForDifficulty, type QuestTemplate } from './quest-model';
import { geographicTemplates } from './quest-locations';

const definitions = [
  ['easy-campus-scout', 'Scout the Campus', 'Walk to a campus landmark you have not visited before and note one detail about it.', 'Exploration', 'Easy'],
  ['easy-new-path', 'The Road Less Traveled', 'Take a different walking route on a familiar journey and record what you notice.', 'Exploration', 'Easy'],
  ['easy-birdwatch', 'A Feathered Encounter', 'Observe a bird from a distance and write down its colors, sounds, or behavior.', 'Bestiary', 'Easy'],
  ['easy-leaf-journal', 'The Herbalist Apprentice', 'Find three different leaves without picking them and sketch their shapes.', 'Bestiary', 'Easy'],
  ['easy-paper-charm', 'Craft a Paper Charm', 'Fold a paper bookmark, flower, or other small creation and keep it as a token.', 'Crafting', 'Easy'],
  ['medium-neighborhood', 'Chart the Neighborhood', 'Explore three public landmarks in your neighborhood and sketch a simple route between them.', 'Exploration', 'Medium'],
  ['medium-trail-notes', 'The Ranger Notebook', 'Explore a public trail or park and document five interesting features along the route.', 'Exploration', 'Medium'],
  ['medium-species-notes', 'The Bestiary Begins', 'Observe five different plants or animals and record a distinguishing feature of each.', 'Bestiary', 'Medium'],
  ['medium-pollinators', 'Watch the Garden Keepers', 'Observe a garden across two visits and document insects or birds interacting with plants.', 'Bestiary', 'Medium'],
  ['medium-repair', 'Mend an Everyday Relic', 'Repair or repurpose a small household item and record the steps you followed.', 'Crafting', 'Medium'],
  ['hard-local-history', 'Uncover the Lost Chronicle', 'Visit three local landmarks and research the history behind each one.', 'Exploration', 'Hard'],
  ['hard-route-guide', 'Create an Explorer Guide', 'Design and test a walking route linking several public places, then write a short guide.', 'Exploration', 'Hard'],
  ['hard-field-journal', 'Keep a Field Journal', 'Over several outings, document ten different plants or animals without disturbing them.', 'Bestiary', 'Hard'],
  ['hard-habitat-study', 'Study a Hidden Kingdom', 'Observe a public natural area on three separate visits and compare the wildlife you find.', 'Bestiary', 'Hard'],
  ['hard-freshly-baked', 'Freshly Baked', 'Make a loaf of homemade bread from scratch and document your process and finished result.', 'Crafting', 'Hard'],
] as const;

// Seven per difficulty retain generic quests alongside curated geographic adventures.
export const seedTemplates: QuestTemplate[] = [...definitions.map(([templateId, title, description, category, difficulty]) => ({
  templateId, title, description,
  category: { tag: category }, difficulty: { tag: difficulty },
  xpReward: rewardForDifficulty({ tag: difficulty }),
  latitude: templateId === 'easy-campus-scout' ? 32.9858 : undefined,
  longitude: templateId === 'easy-campus-scout' ? -96.7501 : undefined,
  isActive: true,
  locationName: templateId === 'easy-campus-scout' ? 'University of Texas at Dallas campus' : undefined,
  locationType: templateId === 'easy-campus-scout' ? 'Campus' : undefined,
})), ...geographicTemplates];
