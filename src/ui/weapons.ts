import {
  BRUSH_RED_BURN_TURNS, BRUSH_YELLOW_EXTRA_DAMAGE, WEAPON_WHITE_BONUS, WEAPONS, type Weapon,
} from '../game/rules';

// Names and one-line descriptions shown to the player. The numbers come from the rules,
// so the text cannot drift from what the game does.
export const WEAPON_INFO: Record<Weapon, { label: string; description: string }> = {
  paintballGun: {
    label: 'Paintball gun',
    description: `White matches deal +${WEAPON_WHITE_BONUS.paintballGun} damage.`,
  },
  brush: {
    label: 'Brush',
    description: `Red spends burn for ${BRUSH_RED_BURN_TURNS} turns; yellow spends deal +${BRUSH_YELLOW_EXTRA_DAMAGE} damage.`,
  },
  roller: {
    label: 'Roller',
    description: 'White matches hit every enemy.',
  },
};

export const WEAPON_LIST = WEAPONS.map((id) => ({ id, ...WEAPON_INFO[id] }));
