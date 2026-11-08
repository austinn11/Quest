export const NATURE_TYPES = ['park', 'nature reserve', 'garden', 'lake or pond', 'woods', 'beach', 'picnic area'];
export function matchesLocation(required: string | undefined, kind: string): boolean {
  return required === 'any' || (required === 'nature' ? NATURE_TYPES.includes(kind) : required === kind);
}
// The same projection supplies the photo judge and every frontend quest display.
export function atDestination<T extends { title: string; description: string; photoGoal?: string; latitude?: number; longitude?: number; locationName?: string; locationType?: string }>(template: T, location: { name: string; locationType: string; latitude: number; longitude: number }): T {
  const render = (text: string) => text.split('{location}').join(location.name);
  // Names alone can mislead ("Big Bend" is also a national park), so the objective says what kind of place it is.
  const kind = location.locationType.trim();
  const described = kind ? `${location.name} (${/^[aeiou]/i.test(kind) ? 'an' : 'a'} ${kind.toLowerCase()})` : location.name;
  return { ...template, title: render(template.title).slice(0, 100), description: template.description.replace('{location}', described).split('{location}').join(location.name), photoGoal: template.photoGoal === undefined ? undefined : render(template.photoGoal).slice(0, 300), locationName: location.name, locationType: location.locationType, latitude: location.latitude, longitude: location.longitude };
}
