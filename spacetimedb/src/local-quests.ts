import { DIFFICULTY_MAX_METERS, MAX_LOCAL_QUESTS_PER_AREA } from './quest-config';
import { isNaturePlace, type Place, type PlaceKind } from '../../shared/nearby-places';
import { distanceMeters } from '../../shared/geo';
import { rewardForDifficulty, type QuestTemplate } from './quest-model';
import { bountyFor } from './bounties';

type Difficulty = 'Easy' | 'Medium' | 'Hard';
type Category = 'Exploration' | 'Bestiary' | 'Crafting';
type Recipe = { title: string; description: string; photoGoal: string; bountyTarget?: string };
type Random = (n: number) => number;

const away = (meters: number) => meters < 950 ? `about ${Math.max(100, Math.round(meters / 100) * 100)} m away` : `about ${(meters / 1000).toFixed(1)} km away`;
const pickOne = <T>(options: readonly T[], random: Random) => options[random(options.length)];
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Places fall into groups that suggest what a quest there should ask for.
type Group = 'view' | 'water' | 'culture' | 'history' | 'art' | 'green';
const GROUP: Record<PlaceKind, Group> = {
  viewpoint: 'view', peak: 'view',
  'lake or pond': 'water', beach: 'water',
  museum: 'culture', library: 'culture',
  monument: 'history', memorial: 'history', 'historic site': 'history',
  artwork: 'art', fountain: 'art', attraction: 'art',
  park: 'green', garden: 'green', woods: 'green', 'nature reserve': 'green', 'picnic area': 'green',
};

// How interesting a place usually is to visit. Notable landscapes and landmarks beat street furniture.
const INTEREST: Record<PlaceKind, number> = {
  viewpoint: 5, peak: 5, 'nature reserve': 5, museum: 4, 'historic site': 4, monument: 4, garden: 4,
  woods: 4, 'lake or pond': 4, beach: 4, park: 3, memorial: 3, attraction: 3,
  artwork: 2, fountain: 2, library: 2, 'picnic area': 2,
};

// Exploration: what to look for depends on the kind of place.
const EXPLORE_GOAL: Record<Group, (place: Place) => { task: string; photo: string }> = {
  view: place => ({ task: `reach the top and photograph the view from ${place.name}`, photo: `A wide outdoor view or skyline seen from ${place.name}.` }),
  water: place => ({ task: `walk the shore of ${place.name} and photograph the water from a public path`, photo: `The water or shoreline of ${place.name}, photographed outdoors.` }),
  culture: place => ({ task: `find ${place.name} and photograph its sign or entrance from outside`, photo: `The outside, sign or entrance of ${place.name}.` }),
  history: place => ({ task: `find ${place.name}, read its plaque or marker, and photograph it`, photo: `A monument, plaque or historical marker at ${place.name}.` }),
  art: place => ({ task: `find ${place.name} and photograph it, along with anything nearby that tells you about it`, photo: `The artwork, fountain or attraction ${place.name}, photographed in person.` }),
  green: place => ({ task: `find a sign, trail or path at ${place.name} and photograph it`, photo: `An outdoor photo at ${place.name}: its sign, a trail or a path.` }),
};

const EXPLORE_TITLES: Record<Difficulty, ((name: string) => string)[]> = {
  Easy: [name => `Scout ${name}`, name => `A Visit to ${name}`, name => `First Steps to ${name}`],
  Medium: [name => `The Road to ${name}`, name => `Pilgrimage to ${name}`, name => `The ${name} Trek`],
  Hard: [name => `Expedition to ${name}`, name => `The Long March to ${name}`, name => `Beyond the Map: ${name}`],
};

// Crafting: make something inspired by the place, then photograph what you made.
const CRAFT: Record<Difficulty, ((place: Place, distance: string) => Recipe)[]> = {
  Easy: [
    (place, distance) => GROUP[place.kind] === 'art'
      ? { title: `Echo of ${place.name}`, description: `Visit ${place.name}, ${distance}, and draw your own version of it. Photograph your drawing.`, photoGoal: 'A hand-drawn sketch or drawing on paper.' }
      : { title: `Sketch of ${place.name}`, description: `Visit ${place.name}, ${distance}, and draw a quick sketch of it. Photograph your sketch, with the place behind it if you can.`, photoGoal: 'A hand-drawn sketch or drawing on paper.' },
    (place, distance) => GROUP[place.kind] === 'history'
      ? { title: `Words of ${place.name}`, description: `At ${place.name}, ${distance}, copy the inscription or the most interesting line from its plaque by hand. Photograph your page.`, photoGoal: 'Handwritten text copied onto paper.' }
      : { title: `Leaf and Line at ${place.name}`, description: `At ${place.name}, ${distance}, find a plant or tree and sketch one of its leaves without picking it. Photograph your sketch.`, photoGoal: 'A hand-drawn sketch of a leaf or plant on paper.' },
  ],
  Medium: [
    (place, distance) => ({ title: `Field Guide Page: ${place.name}`, description: `Create a one-page field guide to ${place.name}, ${distance}: a drawing plus three handwritten notes about what you saw. Photograph the page.`, photoGoal: 'A handmade page with a drawing and handwritten notes.' }),
    (place, distance) => ({ title: `Postcard from ${place.name}`, description: `Visit ${place.name}, ${distance}, then design a postcard of it by hand: a drawing on one side, a short message on the other. Photograph your postcard.`, photoGoal: 'A handmade postcard with a drawing or a handwritten message.' }),
  ],
  Hard: [
    (place, distance) => ({ title: `A Map of ${place.name}`, description: `Explore ${place.name}, ${distance}, and draw your own map of it with at least five labelled features. Photograph the finished map.`, photoGoal: 'A hand-drawn map with written labels.' }),
    (place, distance) => ({ title: `The ${place.name} Chronicle`, description: `Spend time at ${place.name}, ${distance}, and make an illustrated journal spread: at least two drawings and a short account of your visit. Photograph it.`, photoGoal: 'A handmade journal page with drawings and handwriting.' }),
  ],
};

function exploreRecipe(place: Place, difficulty: Difficulty, random: Random): Recipe {
  const goal = EXPLORE_GOAL[GROUP[place.kind]](place);
  const route = difficulty === 'Easy' ? 'Walk there' : difficulty === 'Medium' ? 'Travel on foot or by bike' : 'Plan your route and make the journey';
  const care = difficulty === 'Hard' ? ' Check opening hours and trail conditions first.' : ' Stay on public paths.';
  return {
    title: pickOne(EXPLORE_TITLES[difficulty], random)(place.name),
    description: `${place.name} is a ${place.kind} ${away(place.distance)}. ${route}, ${goal.task}.${care}`,
    photoGoal: goal.photo,
  };
}

function bountyRecipe(place: Place, difficulty: Difficulty, random: Random): Recipe {
  const bounty = bountyFor(place, difficulty, random);
  const intro = difficulty === 'Hard' ? 'A rare bounty is posted at' : 'A bounty is posted at';
  return {
    title: `Wanted: ${bounty.target}`,
    description: `${intro} ${place.name}, ${away(place.distance)}. Capture ${bounty.detail} on camera there. Keep your distance, stay on paths and never feed wildlife.`,
    photoGoal: `${capitalise(bounty.detail)}, photographed in the wild (not a pet, toy or picture of a screen).`,
    bountyTarget: bounty.target,
  };
}

function recipeFor(category: Category, difficulty: Difficulty, place: Place, random: Random): Recipe {
  if (category === 'Bestiary') return bountyRecipe(place, difficulty, random);
  if (category === 'Exploration') return exploreRecipe(place, difficulty, random);
  // Mapping needs ground to walk around: only parks, gardens, woods and shores get map quests.
  const walkable = GROUP[place.kind] === 'green' || GROUP[place.kind] === 'water';
  const options = difficulty === 'Hard' && !walkable ? CRAFT.Hard.slice(1) : CRAFT[difficulty];
  return pickOne(options, random)(place, away(place.distance));
}

// Each difficulty aims for a distance band, scoring places closest to its sweet spot highest.
const BAND: Record<Difficulty, { min: number; ideal: number }> = {
  Easy: { min: 0, ideal: 700 },
  Medium: { min: 1_000, ideal: 2_500 },
  Hard: { min: 3_000, ideal: 5_500 },
};
const CLUSTER_METERS = 250;
const PER_CATEGORY = 2;
const TOP_CHOICES = 4;

function bandPlaces(places: readonly Place[], difficulty: Difficulty): Place[] {
  const max = DIFFICULTY_MAX_METERS[difficulty];
  const preferred = places.filter(place => place.distance >= BAND[difficulty].min && place.distance <= max);
  // Sparse areas fall back to anything within reach for this difficulty.
  return preferred.length ? preferred : places.filter(place => place.distance <= max);
}

// OpenStreetMap names sometimes describe infrastructure or projects rather than somewhere worth visiting.
const ADMINISTRATIVE_NAME = /\b(phase|project|enhancement|improvement|renovation|expansion|tank|tower|substation|utility|lot|parcel|easement|detention|retention|drainage|sign)\b|\b[IVX]{2,}\b|\d{3,}/i;
const SMALL_LANDMARKS: ReadonlySet<PlaceKind> = new Set(['artwork', 'memorial', 'monument', 'fountain', 'attraction']);

// Names a player can recognise and find. One-word art and memorial names ("Endless") say little on their own.
export function nameQuality(place: Place): number {
  let penalty = 0;
  if (ADMINISTRATIVE_NAME.test(place.name)) penalty += 4;
  if (SMALL_LANDMARKS.has(place.kind) && !/\s/.test(place.name)) penalty += 3;
  return penalty ? -penalty : 0;
}

// Higher is better: interesting places, at a fitting distance, unlike what this difficulty already uses.
export function scorePlace(place: Place, difficulty: Difficulty, chosen: readonly Place[]): number {
  const { ideal } = BAND[difficulty];
  const fit = Math.max(0, 1 - Math.abs(place.distance - ideal) / Math.max(ideal, 1_000));
  const sameKind = chosen.filter(other => other.kind === place.kind).length;
  const crowded = chosen.filter(other => distanceMeters(other.latitude, other.longitude, place.latitude, place.longitude) < CLUSTER_METERS).length;
  return INTEREST[place.kind] + nameQuality(place) + 2 * fit - 2 * sameKind - 3 * crowded;
}

// Weighted choice among the best few, so boards favour good places without always being identical.
function choosePlace(pool: readonly Place[], difficulty: Difficulty, chosen: readonly Place[], random: Random): Place {
  const ranked = [...pool]
    .map(place => ({ place, score: scorePlace(place, difficulty, chosen) }))
    .sort((a, b) => b.score - a.score || a.place.distance - b.place.distance || (a.place.id < b.place.id ? -1 : 1))
    .slice(0, TOP_CHOICES);
  const weights = ranked.map((_, index) => TOP_CHOICES - index);
  let ticket = random(weights.reduce((total, weight) => total + weight, 0));
  for (let index = 0; index < ranked.length; index++) {
    if (ticket < weights[index]) return ranked[index].place;
    ticket -= weights[index];
  }
  return ranked[0].place;
}

export type LocalQuestDraft = QuestTemplate & { photoGoal: string };

// `random(n)` returns an integer in [0, n). `newId()` returns a unique local template ID.
export function generateLocalQuests(places: readonly Place[], random: Random, newId: () => string): LocalQuestDraft[] {
  const quests: LocalQuestDraft[] = [];
  for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
    const band = bandPlaces(places, difficulty);
    const chosen: Place[] = [];
    // Bestiary needs natural places, so it chooses first; others prefer places not yet used.
    for (const category of ['Bestiary', 'Crafting', 'Exploration'] as const) {
      const candidates = band.filter(place => category !== 'Bestiary' || isNaturePlace(place));
      const usedInCategory = new Set<string>();
      for (let count = 0; count < PER_CATEGORY && quests.length < MAX_LOCAL_QUESTS_PER_AREA; count++) {
        const available = candidates.filter(place => !usedInCategory.has(place.id));
        const fresh = available.filter(place => !chosen.some(other => other.id === place.id));
        // Sparse areas may reuse a place for a different kind of quest.
        const pool = fresh.length ? fresh : available;
        if (!pool.length) break;
        const place = choosePlace(pool, difficulty, chosen, random);
        usedInCategory.add(place.id);
        if (!chosen.some(other => other.id === place.id)) chosen.push(place);
        const recipe = recipeFor(category, difficulty, place, random);
        quests.push({
          templateId: newId(),
          title: recipe.title.slice(0, 100),
          description: recipe.description,
          photoGoal: recipe.photoGoal,
          bountyTarget: recipe.bountyTarget,
          category: { tag: category },
          difficulty: { tag: difficulty },
          xpReward: rewardForDifficulty({ tag: difficulty }),
          latitude: place.latitude,
          longitude: place.longitude,
          isActive: true,
          locationName: place.name,
          locationType: capitalise(place.kind),
        });
      }
    }
  }
  return quests;
}
