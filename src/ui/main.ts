import './styles.css';
import { startSession } from './session';

// ?seed=123 in the address makes a battle repeatable; otherwise each load is random.
const seedParam = new URLSearchParams(window.location.search).get('seed');
const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : Date.now();

// ?fullPaint starts every battle with full paint bottles, so mixing and rainbow can be tested quickly.
const fullPaint = new URLSearchParams(window.location.search).has('fullPaint');

const app = document.getElementById('app');
if (app) startSession(app, seed, { fullPaint });
