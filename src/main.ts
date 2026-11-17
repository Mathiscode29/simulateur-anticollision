import './ui/style.css';
import { S } from './core/state';
import { newScenario } from './sim/scenarios';
import { simStep, DT } from './sim/loop';
import { initRender, draw } from './ui/render';
import { initControls, upd } from './ui/controls';

const canvas = document.getElementById('radar') as HTMLCanvasElement;
initControls(canvas);
newScenario();
initRender(canvas);
upd();
setInterval(upd, 250);

let last = performance.now(), acc = 0;
function frame(now: number): void {
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!S.paused && !S.over) {
    acc += rdt * S.ts;
    let n = 0;
    while (acc >= DT && n < 200) { simStep(DT); acc -= DT; n++; if (S.over) break; }
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
