import type { PlayerView } from '@decrypto/shared';
import { DIGITS, formatCode, playerName, teamName } from '../lib/game';
import { TeamLabel } from './Bits';
import { FilterSlider, ShieldStrip } from './Filter';

export function ShieldPanel({ state }: { state: PlayerView }) {
  const team = state.viewer.team;
  if (!team) return null;
  const words = state.keywords[team] ?? [];
  const encoderId = state.encoders[team];
  return (
    <section aria-label={`${teamName(team)} encryption shield`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <TeamLabel team={team} />
        <p className="truncate text-xs text-muted">
          Encoder: {encoderId === state.viewer.id ? 'you' : playerName(state, encoderId)}
        </p>
      </div>
      <div className="space-y-1">
        {DIGITS.map((digit) => (
          <ShieldStrip
            key={digit}
            tag={String(digit)}
            text={words[digit - 1] ?? ''}
            seed={`${team}-${digit}`}
          />
        ))}
      </div>
      {state.currentCode && (
        <div className="space-y-1">
          <p className="eyebrow text-muted">Your code this round</p>
          <ShieldStrip
            tag="»"
            text={formatCode(state.currentCode)}
            seed={`${team}-code-${state.round}`}
          />
        </div>
      )}
      <FilterSlider />
    </section>
  );
}
