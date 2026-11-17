/**
 * KVLCC2 (KRISO Very Large Crude Carrier 2), pleine échelle, en charge.
 * Navire de référence public de la méthode MMG standard.
 *
 * Source principale : Yasukawa H., Yoshimura Y. (2015), « Introduction of MMG standard method for ship maneuvering
 * predictions », J. Mar. Sci. Technol. 20:37-52 (essais captifs sur maquette L7, 1/45,7).
 * Dérivées de carène recoupées avec l'implémentation libre pymaneuvering (N. Paulig, licence MIT).
 *
 * Valeurs estimées (hors publication) :
 *  - AR = 0,0654 m² (maquette L7) × 45,71² ≈ 136,7 m² ;
 *  - surfaces de fardage AF = 1 200 m², AL = 3 600 m² (navire en charge).
 */
import type { MMGParams } from '../../sim/mmg';

export const KVLCC2: MMGParams = {
  L: 320, B: 58, d: 20.8, displ: 312_600, xG: 11.2, Dp: 9.86, AR: 136.7, eta: 0.626, rho: 1025,
  mx: 0.022, my: 0.223, Jz: 0.011,
  R0: 0.022, Xvv: -0.040, Xvr: 0.002, Xrr: 0.011, Xvvvv: 0.771,
  Yv: -0.315, Yr: 0.083, Yvvv: -1.607, Yvvr: 0.379, Yvrr: -0.391, Yrrr: 0.008,
  Nv: -0.137, Nr: -0.049, Nvvv: -0.030, Nvvr: -0.294, Nvrr: 0.055, Nrrr: -0.013,
  tP: 0.220, wP0: 0.35, k0: 0.2931, k1: -0.2753, k2: -0.1385, xP: -0.48, C1: 2.0, C2p: 1.6, C2m: 1.1,
  tR: 0.387, aH: 0.312, xH: -0.464, xR: -0.5, eps: 1.09, kappa: 0.50, lR: -0.710, gRp: 0.640, gRm: 0.395, falpha: 2.747,
  AF: 1200, AL: 3600,
  Us: 15.5 * 0.514444,
};
