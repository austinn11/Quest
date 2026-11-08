// Older saved quests and server replies can still contain the former terminology.
// Normalize presentation without changing assignment IDs, rewards, or saved history.
export function questText(text: string): string {
  return text.replace(/^Wanted:\s*/i, 'Observe ')
    .replace(/\b(?:a rare |a )?bounty is posted at\b/gi, 'Visit')
    .replace(/\bbounty claimed!?/gi, 'Quest complete!')
    .replace(/\bbounties\b/gi, 'quests')
    .replace(/\bbounty\b/gi, 'quest');
}

export function questDisplay<T extends { title: string; description: string; photoGoal?: string }>(quest: T): T {
  return { ...quest, title: typeof quest.title === 'string' ? questText(quest.title) : quest.title, description: typeof quest.description === 'string' ? questText(quest.description) : quest.description,
    photoGoal: quest.photoGoal === undefined ? undefined : questText(quest.photoGoal) };
}
