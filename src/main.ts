import './ui/style.css';
import { VERSION } from './core/version';
(document.getElementById('ver') as HTMLElement).textContent = `V${VERSION}`;
import { S } from './core/state';
import { newScenario } from './sim/scenarios';
import { simStep, DT } from './sim/loop';
import { initRender, draw, setSimFrac } from './ui/render';
import { initEcdis, drawEcdis, initMini, drawMini } from './ui/ecdis';
import { initOutside, drawOutside } from './ui/outside';
import { initDebrief, drawDebrief } from './ui/debrief';
import { currentView, initControls, upd } from './ui/controls';
import { initRudder, drawRudder } from './ui/rudder';
import { initTelegraph, drawTelegraph } from './ui/telegraph';
import { hornTick } from './ui/audio';

const canvas = document.getElementById('radar') as HTMLCanvasElement;
const ecdis = document.getElementById('ecdis') as HTMLCanvasElement;
initControls(canvas, ecdis);
newScenario();
initRender(canvas);
initEcdis(ecdis);
initMini(document.getElementById('miniEc') as HTMLCanvasElement);
initOutside(document.getElementById('outside') as HTMLCanvasElement);
initDebrief(document.getElementById('debrief') as HTMLCanvasElement);
initRudder(document.getElementById('rudInd') as HTMLCanvasElement, document.getElementById('rotInd') as HTMLCanvasElement);
initTelegraph(document.getElementById('telegraph') as HTMLCanvasElement);
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
  if (v === 'visual') drawMini();
  if (v === 'debrief') drawDebrief();
  drawRudder();
  drawTelegraph();
  hornTick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
