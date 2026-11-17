/**
 * Modèle de manœuvrabilité MMG 3 DDL (cavalement, embardée, lacet) — « MMG standard method ».
 *
 * Référence : H. Yasukawa, Y. Yoshimura, « Introduction of MMG standard method for ship maneuvering
 * predictions », Journal of Marine Science and Technology 20(1), 37-52, 2015. DOI 10.1007/s00773-014-0293-y
 *
 * Repère navire : origine au milieu du navire, x vers l'avant, y vers tribord, r > 0 = giration sur tribord,
 * δ > 0 = barre à tribord. Vitesses relatives à l'eau (le courant uniforme ne modifie pas la dynamique,
 * il est ajouté à la vitesse fond). Unités SI dans ce module.
 *
 * Extensions hors méthode standard (approximations documentées) :
 *  - hélice en marche arrière (n < 0) : poussée ≈ -0,7·ρ·n²·D⁴·k0, sans effet de souffle sur le safran ;
 *  - efforts de vent : coefficients simplifiés CX = -0,7·cos γ, CY = -0,85·sin γ (γ = angle du vent apparent) ;
 *  - aux faibles vitesses, les grandeurs adimensionnelles utilisent U ≥ 0,5 m/s.
 */

export interface MMGParams {
  L: number; B: number; d: number; displ: number; xG: number; Dp: number; AR: number; eta: number;
  rho: number;
  // masses ajoutées et inertie (adimensionnelles)
  mx: number; my: number; Jz: number;
  // carène
  R0: number; Xvv: number; Xvr: number; Xrr: number; Xvvvv: number;
  Yv: number; Yr: number; Yvvv: number; Yvvr: number; Yvrr: number; Yrrr: number;
  Nv: number; Nr: number; Nvvv: number; Nvvr: number; Nvrr: number; Nrrr: number;
  // hélice
  tP: number; wP0: number; k0: number; k1: number; k2: number; xP: number; C1: number; C2p: number; C2m: number;
  // safran
  tR: number; aH: number; xH: number; xR: number; eps: number; kappa: number; lR: number; gRp: number; gRm: number; falpha: number;
  // fardage (m²)
  AF: number; AL: number;
  /** Vitesse de service (m/s) pour laquelle on calcule le régime hélice « allure mer ». */
  Us: number;
}

export interface MMGState { u: number; v: number; r: number }

export interface MMGInput {
  /** angle de barre (rad), > 0 tribord */
  delta: number;
  /** régime hélice (tr/s), < 0 en arrière */
  n: number;
  /** vent apparent dans le repère navire : vitesse (m/s) et angle d'où il vient (rad, 0 = de l'avant, > 0 = de tribord) */
  windSpeed: number; windAngle: number;
}

const RHO_AIR = 1.225;

function kT(p: MMGParams, J: number): number { return p.k0 + p.k1 * J + p.k2 * J * J; }

/** Efforts (N, N·m) appliqués au navire. */
export function mmgForces(p: MMGParams, s: MMGState, inp: MMGInput): { X: number; Y: number; N: number } {
  const { L, d, rho } = p;
  const u = s.u, vm = s.v, r = s.r, n = inp.n, delta = inp.delta;
  const Ureal = Math.hypot(u, vm), U = Math.max(Ureal, 0.5);
  const vd = vm / U, rd = (r * L) / U;
  const beta = Math.atan2(-vm, Math.max(Math.abs(u), 1e-6));
  const q = 0.5 * rho * L * d;

  // --- carène
  const XHd = p.Xvv * vd * vd + p.Xvr * vd * rd + p.Xrr * rd * rd + p.Xvvvv * vd ** 4;
  const XH = -p.R0 * q * u * Math.abs(u) + q * U * U * XHd;
  const YH = q * U * U * (p.Yv * vd + p.Yr * rd + p.Yvvv * vd ** 3 + p.Yvvr * vd * vd * rd + p.Yvrr * vd * rd * rd + p.Yrrr * rd ** 3);
  const NH = q * L * U * U * (p.Nv * vd + p.Nr * rd + p.Nvvv * vd ** 3 + p.Nvvr * vd * vd * rd + p.Nvrr * vd * rd * rd + p.Nrrr * rd ** 3);

  // --- hélice
  const betaP = beta - p.xP * rd;
  const C2 = betaP >= 0 ? p.C2p : p.C2m;
  const oneMinusWP = (1 - p.wP0) * (1 + (1 - Math.exp(-p.C1 * Math.abs(betaP))) * (C2 - 1));
  let XP = 0, KT = 0, J = 0;
  const ahead = n > 0.01 && u >= 0;
  if (ahead) {
    J = (u * oneMinusWP) / (n * p.Dp);
    KT = kT(p, J);
    XP = (1 - p.tP) * rho * n * n * p.Dp ** 4 * KT;
  } else if (n < -0.01) {
    XP = -(1 - p.tP) * 0.7 * rho * n * n * p.Dp ** 4 * p.k0;
  }

  // --- safran
  let uR: number;
  if (ahead && KT > 0 && J > 1e-4) {
    const s1 = 1 + p.kappa * (Math.sqrt(1 + (8 * KT) / (Math.PI * J * J)) - 1);
    uR = p.eps * u * oneMinusWP * Math.sqrt(p.eta * s1 * s1 + (1 - p.eta));
  } else if (ahead) {
    // hélice qui pousse alors que le navire est quasi stoppé : souffle seul (J → 0)
    const slip = Math.sqrt((8 * Math.max(KT, p.k0)) / Math.PI) * n * p.Dp * p.kappa;
    uR = p.eps * Math.sqrt(p.eta) * Math.max(slip, u * oneMinusWP);
  } else {
    uR = p.eps * u * oneMinusWP;
  }
  const betaR = beta - p.lR * rd;
  const gR = betaR < 0 ? p.gRm : p.gRp;
  const vR = U * gR * betaR;
  const UR2 = uR * uR + vR * vR;
  const alphaR = delta - Math.atan2(vR, Math.abs(uR) + 1e-9);
  const FN = 0.5 * rho * p.AR * UR2 * p.falpha * Math.sin(alphaR) * (uR >= 0 ? 1 : 0.3);
  const XR = -(1 - p.tR) * FN * Math.sin(delta);
  const YR = -(1 + p.aH) * FN * Math.cos(delta);
  const NR = -(p.xR * L + p.aH * p.xH * L) * FN * Math.cos(delta);

  // --- vent (simplifié)
  const qa = 0.5 * RHO_AIR * inp.windSpeed * inp.windSpeed;
  const XW = qa * p.AF * -0.7 * Math.cos(inp.windAngle);
  const YW = qa * p.AL * -0.85 * Math.sin(inp.windAngle);

  return { X: XH + XP + XR + XW, Y: YH + YR + YW, N: NH + NR };
}

/** Masses et inerties dimensionnelles. */
export function mmgMass(p: MMGParams) {
  const m = p.rho * p.displ, k = 0.5 * p.rho * p.L * p.L * p.d;
  return { m, mx: p.mx * k, my: p.my * k, Jz: p.Jz * 0.5 * p.rho * p.L ** 4 * p.d, IzG: m * (0.25 * p.L) ** 2 };
}

/** Dérivées temporelles (u̇, v̇m, ṙ). */
export function mmgDeriv(p: MMGParams, s: MMGState, inp: MMGInput): MMGState {
  const M = mmgMass(p), { X, Y, N } = mmgForces(p, s, inp);
  const xGm = p.xG * M.m;
  const du = (X + (M.m + M.my) * s.v * s.r + xGm * s.r * s.r) / (M.m + M.mx);
  // système 2x2 pour v̇m et ṙ
  const a11 = M.m + M.my, a12 = xGm, a21 = xGm, a22 = M.IzG + p.xG * p.xG * M.m + M.Jz;
  const b1 = Y - (M.m + M.mx) * s.u * s.r, b2 = N - xGm * s.u * s.r;
  const det = a11 * a22 - a12 * a21;
  return { u: du, v: (b1 * a22 - a12 * b2) / det, r: (a11 * b2 - a21 * b1) / det };
}

/** Pas d'intégration RK4. */
export function mmgStep(p: MMGParams, s: MMGState, inp: MMGInput, dt: number): MMGState {
  const add = (a: MMGState, b: MMGState, h: number): MMGState => ({ u: a.u + b.u * h, v: a.v + b.v * h, r: a.r + b.r * h });
  const k1 = mmgDeriv(p, s, inp);
  const k2 = mmgDeriv(p, add(s, k1, dt / 2), inp);
  const k3 = mmgDeriv(p, add(s, k2, dt / 2), inp);
  const k4 = mmgDeriv(p, add(s, k3, dt), inp);
  return {
    u: s.u + (dt / 6) * (k1.u + 2 * k2.u + 2 * k3.u + k4.u),
    v: s.v + (dt / 6) * (k1.v + 2 * k2.v + 2 * k3.v + k4.v),
    r: s.r + (dt / 6) * (k1.r + 2 * k2.r + 2 * k3.r + k4.r),
  };
}

/** Régime hélice (tr/s) assurant l'équilibre en ligne droite à la vitesse u (m/s), par dichotomie. */
export function rpsForSpeed(p: MMGParams, u: number): number {
  let lo = 0.02, hi = 10;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const X = mmgForces(p, { u, v: 0, r: 0 }, { delta: 0, n: mid, windSpeed: 0, windAngle: 0 }).X;
    if (X > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
