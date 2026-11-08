import type { Place, PlaceKind } from '../../shared/nearby-places';

type Difficulty = 'Easy' | 'Medium' | 'Hard';
// `target` is the poster name; `detail` reads naturally inside a sentence and guides the AI judge.
export type Bounty = { target: string; detail: string };

type Habitat = 'water' | 'garden' | 'wild' | 'shore';

// Creatures plausibly found at each kind of place. Easy bounties are common; Hard ones need luck and patience.
const BOUNTIES: Record<Habitat, Record<Difficulty, Bounty[]>> = {
  water: {
    Easy: [{ target: 'Duck or Goose', detail: 'a duck, goose or other waterbird' }, { target: 'Wild Bird', detail: 'any wild bird near the water' }],
    Medium: [{ target: 'Turtle', detail: 'a turtle basking or swimming' }, { target: 'Dragonfly', detail: 'a dragonfly or damselfly' }],
    Hard: [{ target: 'Heron or Egret', detail: 'a heron or egret' }, { target: 'Kingfisher', detail: 'a kingfisher' }],
  },
  garden: {
    Easy: [{ target: 'Songbird', detail: 'a wild songbird' }, { target: 'Butterfly or Bee', detail: 'a butterfly, bee or other pollinator' }],
    Medium: [{ target: 'Squirrel', detail: 'a squirrel' }, { target: 'Woodpecker', detail: 'a woodpecker' }],
    Hard: [{ target: 'Bird of Prey', detail: 'a hawk, owl or other bird of prey' }, { target: 'Hummingbird', detail: 'a hummingbird' }],
  },
  wild: {
    Easy: [{ target: 'Wild Bird', detail: 'any wild bird' }, { target: 'Butterfly or Moth', detail: 'a butterfly or moth' }],
    Medium: [{ target: 'Lizard', detail: 'a lizard or skink, from a respectful distance' }, { target: 'Rabbit', detail: 'a wild rabbit' }],
    Hard: [{ target: 'Deer, Fox or Armadillo', detail: 'a deer, fox or armadillo' }, { target: 'Bird of Prey', detail: 'a hawk, owl or other bird of prey' }],
  },
  shore: {
    Easy: [{ target: 'Gull or Tern', detail: 'a gull or tern' }, { target: 'Wild Bird', detail: 'any wild bird on the shore' }],
    Medium: [{ target: 'Shorebird', detail: 'a sandpiper, plover or other shorebird' }, { target: 'Crab', detail: 'a crab' }],
    Hard: [{ target: 'Pelican or Heron', detail: 'a pelican or heron' }, { target: 'Bird of Prey', detail: 'an osprey, hawk or other bird of prey' }],
  },
};

const HABITAT: Partial<Record<PlaceKind, Habitat>> = {
  'lake or pond': 'water',
  park: 'garden', garden: 'garden', 'picnic area': 'garden',
  'nature reserve': 'wild', woods: 'wild',
  beach: 'shore',
};

export function bountyFor(place: Place, difficulty: Difficulty, random: (n: number) => number): Bounty {
  const choices = BOUNTIES[HABITAT[place.kind] ?? 'garden'][difficulty];
  return choices[random(choices.length)];
}
