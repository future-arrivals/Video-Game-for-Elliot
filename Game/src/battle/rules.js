// Battle arithmetic: the type circle and the one damage formula used by everyone.
// Pure, no DOM. Numbers come from src/data/slice.gen.js (rules, type_chart).
import data from '../data/slice.gen.js';

const BEATS = data.type_chart.beats;               // { sweet: 'spooky', ... }
const BONUS = data.rules.type_bonus;               // strong +1, weak -1, same 0
export const LIFT_BONUS = 2;                       // "+2 Lift" (also the Lift move's lift_badge value)
export const FRESH_BONUS = 1;
export const FOLD_REDUCTION = 1;

export function typeBonus(attackerType, defenderType) {
  if (!attackerType || !defenderType || attackerType === defenderType) return 0;
  if (BEATS[attackerType] === defenderType) return BONUS.attacker_beats_defender;
  if (BEATS[defenderType] === attackerType) return BONUS.defender_beats_attacker;
  return BONUS.same_type;
}

// final = base (+2 Lift) (+1 Fresh) + type bonus - 1 if the target is folded, never below 0.
// `lift` may be a boolean (+2) or the badge's number.
export function finalDamage({ base, lift = false, fresh = false, attackerType, defenderType, targetFolded = false }) {
  const liftAdd = lift === true ? LIFT_BONUS : (typeof lift === 'number' ? lift : 0);
  const n = base + liftAdd + (fresh ? FRESH_BONUS : 0)
    + typeBonus(attackerType, defenderType) - (targetFolded ? FOLD_REDUCTION : 0);
  return Math.max(0, n);
}
