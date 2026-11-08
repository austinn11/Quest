import { rewardForDifficulty, type QuestTemplate } from './quest-model';

// Site coordinates verified against Texas Parks & Wildlife's Texas Discovery Loop:
// https://tpwd.texas.gov/huntwild/wildlife/wildlife-trails/ppww/texas-discovery-loop
// These are site reference points, not promises of an accessible entrance or walking route.
const locations = [
  ['easy-white-rock-scout', 'Scout the Lakeward Path', 'Visit the Old Fish Hatchery Nature Area at White Rock Lake and record three details from a public path. Respect posted access signs.', 'Exploration', 'Easy', 'Old Fish Hatchery Nature Area / White Rock Lake', 'Nature area', 32.8158, -96.7284, 'A lake shore, nature path or nature-area sign outdoors.'],
  ['easy-lagoon-watch', 'The Lagoon Watch', 'Observe wildlife from the public paths around Leonhardt Lagoon and sketch one creature without approaching or feeding it. Check Fair Park access before visiting.', 'Bestiary', 'Easy', 'Leonhardt Lagoon, Fair Park', 'Lagoon', 32.7781, -96.7622, 'A lagoon or pond with wildlife, or a sketch of a creature.'],
  ['medium-discovery-sketch', 'The Garden Scribe', 'Visit Texas Discovery Gardens and create a field sketch of three plants, adding one observation for each. Check current admission and opening hours before visiting.', 'Crafting', 'Medium', 'Texas Discovery Gardens', 'Garden', 32.7757, -96.76, 'A field sketch of plants on paper.'],
  ['medium-arboretum-bestiary', 'Keepers of the Living Garden', 'At the Dallas Arboretum, record five plants or animals you observe from permitted paths. Check current admission and opening hours before visiting.', 'Bestiary', 'Medium', 'Dallas Arboretum and Botanical Garden', 'Botanical garden', 32.8222, -96.7163, 'Plants, flowers or animals in a garden setting.'],
  ['hard-cedar-ridge', 'Chronicle of the Cedar Ridge', 'Explore an open marked trail at Cedar Ridge Preserve and create a route journal with ten observations. Choose a route suited to your ability and check trail conditions first.', 'Exploration', 'Hard', 'Cedar Ridge Preserve', 'Nature preserve', 32.6376, -96.9614, 'A trail, overlook or wooded landscape, or a handwritten route journal.'],
  ['hard-cedar-hill', 'The Prairie Field Chronicle', 'Across three visits to Cedar Hill State Park, compare plants and wildlife from permitted trails. Check entry requirements and trail conditions before each visit.', 'Bestiary', 'Hard', 'Cedar Hill State Park', 'State park', 32.5721, -96.9862, 'Prairie, trail or wildlife in a park landscape, or handwritten field notes.'],
] as const;

export const geographicTemplates: QuestTemplate[] = locations.map(([templateId, title, description, category, difficulty, locationName, locationType, latitude, longitude, photoGoal]) => ({
  templateId, title, description, category: { tag: category }, difficulty: { tag: difficulty },
  xpReward: rewardForDifficulty({ tag: difficulty }), locationName, locationType, latitude, longitude, isActive: true, photoGoal, bountyTarget: undefined,
}));
