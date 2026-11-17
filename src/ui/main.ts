import './styles.css';
import { BOSS_ABILITIES, type BossAbility } from '../game/rules';
import { startSession, type SessionMode } from './session';

// Options in the address (all are for testing and are not shown to players):
//   ?seed=123   a repeatable game; otherwise each load is random
//   ?fullPaint  start with full paint bottles, so mixing and rainbow can be tried quickly
//   ?battle     a single regular battle instead of a run (?battle=2 for stage 2's battle)
//   ?boss       a single boss battle instead of a run (?boss=3 for stage 3's boss)
//   ?ability=heal  with ?boss, give that boss this ability (paintThief, inkBlot, shield, heal)
//   ?testing    show the weapon dropdown during a run
const params = new URLSearchParams(window.location.search);

const seedParam = params.get('seed');
const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : Date.now();

// A stage number from 1 to 3, defaulting to 1 when the option has no usable value.
const stageParam = (name: string) => Math.min(3, Math.max(1, Math.round(Number(params.get(name))) || 1));
const mode: SessionMode = params.has('boss')
  ? { kind: 'boss', stage: stageParam('boss') }
  : params.has('battle')
    ? { kind: 'battle', stage: stageParam('battle') }
    : { kind: 'run' };

const abilityParam = params.get('ability') as BossAbility | null;
const ability = abilityParam && BOSS_ABILITIES.includes(abilityParam) ? abilityParam : undefined;

const app = document.getElementById('app');
if (app) startSession(app, seed, { ability, fullPaint: params.has('fullPaint'), mode, testing: params.has('testing') });
