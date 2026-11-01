import type { Code, Digit, PlayerView, TeamId } from '@decrypto/shared';

export const TEAMS: TeamId[] = ['black', 'white'];
export const DIGITS: Digit[] = [1, 2, 3, 4];

export function teamName(team: TeamId): string {
  return team === 'black' ? 'Black' : 'White';
}

export function otherTeam(team: TeamId): TeamId {
  return team === 'black' ? 'white' : 'black';
}

export function formatCode(code: Code | readonly (number | null)[] | null | undefined): string {
  return code ? code.map((digit) => digit ?? '_').join('-') : '_-_-_';
}

export function playerName(state: PlayerView, playerId: string | null | undefined): string {
  if (!playerId) return 'Unknown';
  return state.players.find((player) => player.id === playerId)?.name ?? 'Unknown';
}

// Round 1 has no interception, so it is one step shorter.
export function phaseStep(state: PlayerView): { step: number; steps: number } {
  const order = ['encode', 'intercept', 'decode', 'reveal'].filter(
    (phase) => phase !== 'intercept' || state.round > 1,
  );
  return { step: order.indexOf(state.phase) + 1, steps: order.length };
}

export function phaseLabel(phase: PlayerView['phase']): string {
  switch (phase) {
    case 'encode':
      return 'Encrypt';
    case 'intercept':
      return 'Intercept';
    case 'decode':
      return 'Decode';
    case 'reveal':
      return 'Reveal';
    case 'gameover':
      return 'Closed';
    default:
      return 'Lobby';
  }
}
