import './ui/style.css';
import { S } from './core/state';
import { newScenario } from './sim/scenarios';
import { simStep, DT } from './sim/loop';
import { initRender, draw, setSimFrac } from './ui/render';
import { initEcdis, drawEcdis } from './ui/ecdis';
import { initOutside, drawOutside } from './ui/outside';
import { initDebrief, drawDebrief } from './ui/debrief';
import { currentView, initControls, upd } from './ui/controls';

const canvas = document.getElementById('radar') as HTMLCanvasElement;
const ecdis = document.getElementById('ecdis') as HTMLCanvasElement;
initControls(canvas, ecdis);
newScenario();
initRender(canvas);
initEcdis(ecdis);
initOutside(document.getElementById('outside') as HTMLCanvasElement);
initDebrief(document.getElementById('debrief') as HTMLCanvasElement);
upd();
setInterval(upd, 250);

// Boucle unique : la simulation avance au pas fixe DT quelle que soit la vue affichée.
let last = performance.now(), acc = 0;
function frame(now: number): void {
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!S.paused && !S.over) {
    acc += rdt * S.ts;
    let n = 0;
    while (acc >= DT && n < 200) { simStep(DT); acc -= DT; n++; if (S.over) break; }
    if (n >= 200) acc = 0; // retard irrattrapable : on repart d'un pas entier
  }
  setSimFrac(acc);
  const v = currentView;
  if (v === 'radar' || v === 'split' || v === 'bridge') draw();
  if (v === 'ecdis' || v === 'split' || v === 'bridge') drawEcdis();
  if (v === 'visual' || v === 'bridge') drawOutside();
  if (v === 'debrief') drawDebrief();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
