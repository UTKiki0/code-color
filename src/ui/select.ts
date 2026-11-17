import { CHARACTERS, type CharacterId } from '../game/characters';
import { el, titleHeading, unlockPopup } from './view';
import { WEAPON_INFO } from './weapons';

// The character select screen, shown before a run. Drawing only: unlocking and saving are decided
// in game/ and save/. A locked character shows how to unlock it and cannot be chosen.

export function renderSelect(
  root: HTMLElement, view: { unlocked: CharacterId[]; canSave: boolean; popup?: { name: string; note?: string } },
): void {
  const screen = el('main', 'game select');
  const top = el('header', 'topbar');
  top.append(titleHeading());
  screen.append(top, el('h2', 'select-heading', {}, 'Choose a character'));

  const list = el('div', 'characters', { role: 'list' });
  for (const c of CHARACTERS) {
    const open = view.unlocked.includes(c.id);
    const card = el('button', `character${open ? '' : ' locked'}`, {
      'data-character': c.id, role: 'listitem', ...(open ? {} : { 'aria-disabled': 'true' }),
    });
    const paint = Object.entries(c.startPaint).filter(([, n]) => n > 0).map(([color, n]) => `${n} ${color}`).join(', ');
    card.append(
      el('strong', '', {}, open ? c.name : `${c.name} (locked)`),
      el('span', '', {}, `${WEAPON_INFO[c.weapon].label}: ${WEAPON_INFO[c.weapon].description}`),
      el('span', '', {}, paint ? `Starts with ${paint} paint.` : 'Starts with no paint.'),
    );
    if (!open) card.append(el('span', 'unlock-hint', {}, c.unlockHint));
    list.append(card);
  }
  screen.append(list);
  if (!view.canSave) {
    screen.append(el('p', 'select-note', { role: 'status' }, 'Progress cannot be saved in this browser, so unlocked characters will not be kept.'));
  }
  if (view.popup) screen.append(unlockPopup(view.popup)); // an unlock waiting from an earlier visit
  root.replaceChildren(screen);
}
