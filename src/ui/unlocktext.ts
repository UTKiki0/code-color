import { characterById, type CharacterId } from '../game/characters';

// The lines that announce unlocked characters. They are shown only on the end-of-run screens
// (Developer's choice, 2026-11-17), and list everything unlocked during that run, so a first-time
// winner sees Stroke from the first boss and Roll from the win together.
export function unlockMessage(ids: CharacterId[], canSave: boolean): string[] {
  if (ids.length === 0) return [];
  const names = ids.map((id) => characterById(id).name).join(' and ');
  const lines = [`Unlocked this run: ${names}!`];
  if (!canSave) lines.push('Progress cannot be saved in this browser, so this will not be kept.');
  return lines;
}
