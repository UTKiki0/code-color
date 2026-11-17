import { BOMB_RADIUS, type ItemBottle } from '../game/rules';

// Names and one-line descriptions of the board items, for the screen reader labels and messages.
// (Their pictures come from the sprite sheet; see styles.css.)
const AREA = 2 * BOMB_RADIUS + 1;
export const ITEM_INFO: Record<ItemBottle, { label: string; description: string }> = {
  lineRow: { label: 'Row line', description: 'clears its whole row' },
  lineCol: { label: 'Column line', description: 'clears its whole column' },
  bomb: { label: 'Bomb', description: `clears a ${AREA}x${AREA} area` },
  colorRed: { label: 'Red clear', description: 'clears every red bottle' },
  colorYellow: { label: 'Yellow clear', description: 'clears every yellow bottle' },
  colorBlue: { label: 'Blue clear', description: 'clears every blue bottle' },
  colorGrey: { label: 'Grey clear', description: 'clears every grey bottle' },
};
