import { rewardForDifficulty, type QuestTemplate } from './quest-model';

// Site coordinates verified against Texas Parks & Wildlife's Texas Discovery Loop:
// https://tpwd.texas.gov/huntwild/wildlife/wildlife-trails/ppww/texas-discovery-loop
// These are site reference points, not promises of an accessible entrance or walking route.
const locations = [
  ['easy-white-rock-scout', 'Scout the Lakeward Path', 'Visit the Old Fish Hatchery Nature Area at White Rock Lake and photograph the lake or the nature-area sign from a public path. Respect posted access signs.', 'Exploration', 'Easy', 'Old Fish Hatchery Nature Area / White Rock Lake', 'Nature area', 32.8158, -96.7284, 'A lake shore, nature path or nature-area sign outdoors.'],
  ['easy-lagoon-watch', 'The Lagoon Watch', 'From the public paths around Leonhardt Lagoon, photograph a turtle, fish, bird or other creature without approaching or feeding it. Check Fair Park access before visiting.', 'Bestiary', 'Easy', 'Leonhardt Lagoon, Fair Park', 'Lagoon', 32.7781, -96.7622, 'An animal at or near a lagoon or pond.'],
  ['medium-discovery-sketch', 'The Garden Scribe', 'Visit Texas Discovery Gardens and draw a field sketch of three plants with a label for each. Photograph your sketch. Check current admission and opening hours before visiting.', 'Crafting', 'Medium', 'Texas Discovery Gardens', 'Garden', 32.7757, -96.76, 'A field sketch of plants on paper.'],
  ['medium-arboretum-bestiary', 'Keepers of the Living Garden', 'At the Dallas Arboretum, photograph an animal or insect living in the gardens, seen from permitted paths. Check current admission and opening hours before visiting.', 'Bestiary', 'Medium', 'Dallas Arboretum and Botanical Garden', 'Botanical garden', 32.8222, -96.7163, 'An animal or insect in a garden setting.'],
  ['hard-cedar-ridge', 'Chronicle of the Cedar Ridge', 'Hike an open marked trail at Cedar Ridge Preserve and photograph the view from an overlook or a trail marker along the way. Choose a route suited to your ability and check trail conditions first.', 'Exploration', 'Hard', 'Cedar Ridge Preserve', 'Nature preserve', 32.6376, -96.9614, 'A trail marker, overlook view or wooded trail landscape.'],
  ['hard-cedar-hill', 'The Prairie Field Chronicle', 'At Cedar Hill State Park, photograph a wild animal, bird or reptile from a permitted trail. Check entry requirements and trail conditions before visiting.', 'Bestiary', 'Hard', 'Cedar Hill State Park', 'State park', 32.5721, -96.9862, 'A wild animal, bird or reptile in a park or prairie landscape.'],
] as const;

export const geographicTemplates: QuestTemplate[] = locations.map(([templateId, title, description, category, difficulty, locationName, locationType, latitude, longitude, photoGoal]) => ({
  templateId, title, description, category: { tag: category }, difficulty: { tag: difficulty },
  xpReward: rewardForDifficulty({ tag: difficulty }), locationName, locationType, latitude, longitude, isActive: true, photoGoal, bountyTarget: undefined,
}));
