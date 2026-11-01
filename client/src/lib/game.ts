import type { Code, Digit, PlayerView, TeamId } from '@decrypto/shared';

export const TEAMS: TeamId[] = ['black', 'white'];
export const DIGITS: Digit[] = [1, 2, 3, 4];

// The protocol keeps the ids 'black' and 'white'; every player-facing surface says Alpha and Beta.
export function teamName(team: TeamId): string {
  return team === 'black' ? 'Alpha' : 'Beta';
}

export function teamMark(team: TeamId): 'A' | 'B' {
  return team === 'black' ? 'A' : 'B';
}

export function teamInk(team: TeamId): string {
  return team === 'black' ? 'text-alpha-ink' : 'text-beta-ink';
}

export function teamFill(team: TeamId): string {
  return team === 'black' ? 'bg-alpha' : 'bg-beta';
}

export function teamBorder(team: TeamId): string {
  return team === 'black' ? 'border-alpha' : 'border-beta';
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

export function messageId(round: number, team: TeamId): string {
  return `${String(round).padStart(2, '0')}-${teamMark(team)}`;
}

export function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false });
}

export function phaseLabel(phase: PlayerView['phase']): string {
  switch (phase) {
    case 'encode':
      return 'Encode';
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
