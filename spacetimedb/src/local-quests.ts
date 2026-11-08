import { DIFFICULTY_MAX_METERS, MAX_LOCAL_QUESTS_PER_AREA } from './quest-config';
import { isNaturePlace, type Place } from '../../shared/nearby-places';
import { rewardForDifficulty, type QuestTemplate } from './quest-model';
import { bountyFor } from './bounties';

type Difficulty = 'Easy' | 'Medium' | 'Hard';
type Category = 'Exploration' | 'Bestiary' | 'Crafting';
type Recipe = { title: string; description: string; photoGoal: string; bountyTarget?: string };
type Random = (n: number) => number;

const away = (meters: number) => meters < 950 ? `about ${Math.max(100, Math.round(meters / 100) * 100)} m away` : `about ${(meters / 1000).toFixed(1)} km away`;

// Fixed wording keeps generation free, instant and predictable; the AI only judges photos.
const recipes: Record<Category, Record<Difficulty, (place: Place, random: Random) => Recipe>> = {
  Exploration: {
    Easy: place => ({
      title: `Scout ${place.name}`,
      description: `Walk to ${place.name}, a ${place.kind} ${away(place.distance)}, and photograph a sign, landmark or view that shows you made it. Stay on public paths.`,
      photoGoal: `An outdoor photo taken at ${place.name} (a ${place.kind}): its sign, a landmark, a path or a view of the place.`,
    }),
    Medium: place => ({
      title: `The Road to ${place.name}`,
      description: `Travel on foot or by bike to ${place.name}, a ${place.kind} ${away(place.distance)}, and photograph its most striking feature.`,
      photoGoal: `An outdoor photo of a notable feature of ${place.name} (a ${place.kind}).`,
    }),
    Hard: place => ({
      title: `Expedition to ${place.name}`,
      description: `Make the journey to ${place.name}, a ${place.kind} ${away(place.distance)}. Explore it end to end and photograph the best view you find. Check opening hours and plan your route first.`,
      photoGoal: `An outdoor photo of a view or landmark at ${place.name} (a ${place.kind}).`,
    }),
  },
  // Bestiary quests are bounties: a named creature to capture on camera at a nearby place.
  Bestiary: {
    Easy: (place, random) => bountyRecipe(place, bountyFor(place, 'Easy', random), 'A bounty is posted at'),
    Medium: (place, random) => bountyRecipe(place, bountyFor(place, 'Medium', random), 'A bounty is posted at'),
    Hard: (place, random) => bountyRecipe(place, bountyFor(place, 'Hard', random), 'A rare bounty is posted at'),
  },
  Crafting: {
    Easy: place => ({
      title: `Sketch of ${place.name}`,
      description: `Visit ${place.name}, ${away(place.distance)}, and draw a quick sketch of it. Photograph your sketch, with the place behind it if you can.`,
      photoGoal: 'A hand-drawn sketch or drawing on paper.',
    }),
    Medium: place => ({
      title: `Field Guide Page: ${place.name}`,
      description: `Create a one-page field guide to ${place.name}, ${away(place.distance)}: a drawing plus three handwritten notes about what you saw. Photograph the page.`,
      photoGoal: 'A handmade page with a drawing and handwritten notes.',
    }),
    Hard: place => ({
      title: `A Map of ${place.name}`,
      description: `Explore ${place.name}, ${away(place.distance)}, and draw your own map of it with at least five labelled features. Photograph the finished map.`,
      photoGoal: 'A hand-drawn map with written labels.',
    }),
  },
};

function bountyRecipe(place: Place, bounty: { target: string; detail: string }, intro: string): Recipe {
  return {
    title: `Wanted: ${bounty.target}`,
    description: `${intro} ${place.name}, ${away(place.distance)}. Capture ${bounty.detail} on camera there. Keep your distance, stay on paths and never feed wildlife.`,
    photoGoal: `${bounty.detail.charAt(0).toUpperCase()}${bounty.detail.slice(1)}, photographed in the wild (not a pet, toy or picture of a screen).`,
    bountyTarget: bounty.target,
  };
}

const BAND_MIN_METERS: Record<Difficulty, number> = { Easy: 0, Medium: 1_000, Hard: 3_000 };
const PER_CATEGORY = 2;

function bandPlaces(places: readonly Place[], difficulty: Difficulty): Place[] {
  const max = DIFFICULTY_MAX_METERS[difficulty];
  const preferred = places.filter(place => place.distance >= BAND_MIN_METERS[difficulty] && place.distance <= max);
  // Sparse areas fall back to anything within reach for this difficulty.
  return preferred.length ? preferred : places.filter(place => place.distance <= max);
}

export type LocalQuestDraft = QuestTemplate & { photoGoal: string };


// `random(n)` returns an integer in [0, n). `newId()` returns a unique local template ID.
export function generateLocalQuests(places: readonly Place[], random: (n: number) => number, newId: () => string): LocalQuestDraft[] {
  const quests: LocalQuestDraft[] = [];
  for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
    const band = bandPlaces(places, difficulty);
    const usedInDifficulty = new Set<string>();
    // Bestiary needs natural places, so it chooses first; others prefer places not yet used.
    for (const category of ['Bestiary', 'Crafting', 'Exploration'] as const) {
      const candidates = band.filter(place => category !== 'Bestiary' || isNaturePlace(place));
      const usedInCategory = new Set<string>();
      for (let count = 0; count < PER_CATEGORY && quests.length < MAX_LOCAL_QUESTS_PER_AREA; count++) {
        const available = candidates.filter(place => !usedInCategory.has(place.id));
        const fresh = available.filter(place => !usedInDifficulty.has(place.id));
        // Sparse areas may reuse a place for a different kind of quest.
        const pool = fresh.length ? fresh : available;
        if (!pool.length) break;
        const place = pool[random(pool.length)];
        usedInCategory.add(place.id);
        usedInDifficulty.add(place.id);
        const recipe = recipes[category][difficulty](place, random);
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
          locationType: place.kind.charAt(0).toUpperCase() + place.kind.slice(1),
        });
      }
    }
  }
  return quests;
}
