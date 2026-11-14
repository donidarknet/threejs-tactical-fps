// The match: buy phase, live round, round end, next round. One store for the
// economy and the score, so the HUD, the buy menu and the bots all read the same
// numbers. First to 5 round wins takes the match; after 9 rounds the higher score
// wins, and a 4-4 after 9 is a draw. Money: win +2600, loss +1500, kill +300,
// plant +300, defuse +300.
import { WEAPONS, GRENADE } from './weapons.js';

const BUY_SECONDS = 12;
const ROUND_SECONDS = 100;
const END_SECONDS = 4;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const START_MONEY = 800;
const WIN_BONUS = 2600;
const LOSS_BONUS = 1500;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;
const DEFUSE_BONUS = 300;

export function createRounds(hooks) {
  const { onPhase, onMatchEnd } = hooks;
  const state = {
    phase: 'menu',
    round: 1,
    wins: { kestrel: 0, jackal: 0 },
    money: START_MONEY,
    timeLeft: BUY_SECONDS,
    endReason: '',
    matchWinner: null,
  };

  function setPhase(phase, timeLeft) {
    state.phase = phase;
    state.timeLeft = timeLeft;
    onPhase(phase, state);
  }

  return {
    state,
    startMatch() {
      state.round = 1;
      state.wins.kestrel = 0;
      state.wins.jackal = 0;
      state.money = START_MONEY;
      state.matchWinner = null;
      setPhase('buy', BUY_SECONDS);
    },
    earnKill() {
      state.money += KILL_BONUS;
    },
    earnPlant() {
      state.money += PLANT_BONUS;
    },
    earnDefuse() {
      state.money += DEFUSE_BONUS;
    },
    buyWeapon(id) {
      const cost = WEAPONS[id].price;
      if (state.phase !== 'buy' || state.money < cost) return false;
      state.money -= cost;
      return true;
    },
    buyGrenade() {
      if (state.phase !== 'buy' || state.money < GRENADE.price) return false;
      state.money -= GRENADE.price;
      return true;
    },
    startRound() {
      setPhase('live', ROUND_SECONDS);
    },
    endRound(winner, reason) {
      if (state.phase !== 'live') return;
      state.endReason = reason;
      if (winner === 'kestrel') {
        state.wins.kestrel += 1;
        state.money += WIN_BONUS;
      } else {
        state.wins.jackal += 1;
        state.money += LOSS_BONUS;
      }
      setPhase('roundEnd', END_SECONDS);
    },
    step(dt) {
      if (state.phase !== 'buy' && state.phase !== 'live' && state.phase !== 'roundEnd') return null;
      state.timeLeft -= dt;
      if (state.timeLeft > 0) return null;
      if (state.phase === 'buy') {
        setPhase('live', ROUND_SECONDS);
        return 'live';
      }
      if (state.phase === 'live') {
        return 'timeout';
      }
      // roundEnd finished: next round, or the match is over.
      if (state.wins.kestrel >= WIN_ROUNDS || state.wins.jackal >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
        const winner = state.wins.kestrel === state.wins.jackal ? 'draw' : state.wins.kestrel > state.wins.jackal ? 'kestrel' : 'jackal';
        state.matchWinner = winner;
        setPhase('matchEnd', 0);
        onMatchEnd(winner, state);
        return 'matchEnd';
      }
      state.round += 1;
      setPhase('buy', BUY_SECONDS);
      return 'buy';
    },
  };
}

export const ROUND_TIMING = { BUY_SECONDS, ROUND_SECONDS, END_SECONDS, WIN_ROUNDS, MAX_ROUNDS, START_MONEY };
