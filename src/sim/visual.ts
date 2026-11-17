/**
 * Observation visuelle et auditive d'une cible (RIPAM partie C et D).
 * Portées des feux (annexe I / R22) : ≥ 50 m : mât 6 NM, côtés 3, poupe 3, tous horizons 3.
 */
import { S, type Target } from '../core/state';
import { SPECIAL } from '../core/data';
import { brgOf, n360 } from '../core/util';

export function lights(t: Target, r: number, ob: number): string[] {
  const L = t.L, mk = t.stw > 0.3, res: string[] = [];
  const mhR = L >= 50 ? 6 : L >= 20 ? 5 : L >= 12 ? 3 : 2, sdR = L >= 50 ? 3 : L >= 12 ? 2 : 1, stR = L >= 50 ? 3 : 2, arR = L >= 50 ? 3 : 2;
  const fwd = ob <= 112.5 || ob >= 247.5, green = ob <= 112.5 || ob >= 357.5, red = ob >= 247.5 || ob <= 2.5;
  const open = ob < 4 || ob > 356 ? 'alignés' : ob <= 180 ? 'ouverts, le navire se dirige vers votre droite' : 'ouverts, le navire se dirige vers votre gauche';
  const mh = (n: number) => { if (fwd && r <= mhR) res.push(n === 2 ? `deux feux de tête de mât (${open})` : 'un feu de tête de mât'); };
  switch (t.type) {
    case 'fish': if (r <= arR) res.push('vert sur blanc, tous horizons'); if (L >= 50) mh(1); break;
    case 'nuc': if (r <= arR) res.push('deux rouges superposés, tous horizons'); break;
    case 'ram': if (r <= arR) res.push('rouge-blanc-rouge superposés'); if (mk) mh(L >= 50 ? 2 : 1); break;
    case 'sail': break;
    default: mh(L >= 50 ? 2 : 1);
  }
  if (mk) {
    if (r <= sdR) {
      if (green && red) res.push('vert et rouge');
      else if (green) res.push('feu de côté vert');
      else if (red) res.push('feu de côté rouge');
    }
    if (!fwd && r <= stR) res.push('feu de poupe blanc');
  }
  return res;
}

export function visual(t: Target): string {
  const o = S.own, rx = o.x - t.x, ry = o.y - t.y, r = Math.hypot(rx, ry), ob = n360(brgOf(rx, ry) - t.hdg);
  if (S.env.vis === 'poor' && r > 0.25) {
    let s = 'Non visible (brume).';
    if (r < 2) {
      const sig = SPECIAL.has(t.type) ? 'un son prolongé suivi de deux brefs' : t.stw > 0.3 ? 'un son prolongé' : 'deux sons prolongés';
      s += ` Signal de brume entendu, direction incertaine : ${sig}.`;
    }
    return s;
  }
  if (!S.env.night) {
    const vr = t.L >= 100 ? 8 : t.L >= 50 ? 6 : t.L >= 20 ? 4 : 2.5;
    if (r > vr) return 'Hors de portée visuelle.';
    const asp = ob <= 180 ? `vert ${Math.round(ob)}°` : `rouge ${Math.round(360 - ob)}°`;
    const sh = ({ fish: 'deux cônes pointes réunies', nuc: 'deux boules noires', ram: 'boule-bicône-boule' } as Record<string, string>)[t.type];
    return `${t.name} d'environ ${t.L} m, aspect ${asp}${sh ? ' · marque : ' + sh : ''}.`;
  }
  const L = lights(t, r, ob);
  return L.length ? 'Feux : ' + L.join(' + ') + '.' : 'Aucun feu visible à cette distance.';
}
