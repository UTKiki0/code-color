import { BOMB_RADIUS, type ItemBottle } from '../game/rules';

// Names and one-line descriptions of the board items, shown to the player. The glyph is the
// text mark drawn on the item, so an item is never identified by color alone.
const AREA = 2 * BOMB_RADIUS + 1;
export const ITEM_INFO: Record<ItemBottle, { label: string; glyph: string; description: string }> = {
  lineRow: { label: 'Row line', glyph: '↔', description: 'clears its whole row' },
  lineCol: { label: 'Column line', glyph: '↕', description: 'clears its whole column' },
  bomb: { label: 'Bomb', glyph: '✸', description: `clears a ${AREA}x${AREA} area` },
  colorRed: { label: 'Red clear', glyph: 'ALL', description: 'clears every red bottle' },
  colorYellow: { label: 'Yellow clear', glyph: 'ALL', description: 'clears every yellow bottle' },
  colorBlue: { label: 'Blue clear', glyph: 'ALL', description: 'clears every blue bottle' },
  colorWhite: { label: 'White clear', glyph: 'ALL', description: 'clears every white bottle' },
};
