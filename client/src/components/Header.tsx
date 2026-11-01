import type { Phase, PlayerView, TeamId } from '@decrypto/shared';
import { TEAMS, phaseLabel, teamBorder, teamName } from '../lib/game';
import { TeamTag } from './Bits';

const TAPE: Phase[] = ['encode', 'intercept', 'decode', 'reveal'];

export function Classification() {
  return (
    <p className="eyebrow bg-alpha pb-0.5 pt-[calc(var(--safe-top)+2px)] text-center !text-[10px] text-black">
      Top secret // Eyes only
    </p>
  );
}

export function LinkLight({ connected }: { connected: boolean }) {
  return (
    <span className="eyebrow flex items-center gap-2 text-muted" role="status">
      <span
        className={`h-2 w-2 ${connected ? 'bg-phosphor' : 'bg-intercepted'}`}
        aria-hidden="true"
      />
      {connected ? 'Link up' : 'No signal'}
    </span>
  );
}

function Pips({ label, count, fill }: { label: string; count: number; fill: string }) {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      <span className="text-[10px] font-semibold tracking-[0.1em] text-muted">{label}</span>
      {[0, 1].map((slot) => (
        <span
          key={slot}
          className={`h-2.5 w-2.5 border ${slot < count ? `${fill} border-transparent` : 'border-dim'}`}
        />
      ))}
    </span>
  );
}

function TeamScore({ state, team }: { state: PlayerView; team: TeamId }) {
  const interceptions = state.interceptionTokens[team];
  const misses = state.miscommunicationTokens[team];
  const yours = state.viewer.team === team;
  return (
    <div
      role="img"
      aria-label={`${teamName(team)}${yours ? ' (your team)' : ''}: ${interceptions} of 2 interceptions, ${misses} of 2 miscommunications`}
      className={`flex min-w-0 items-center justify-between gap-1.5 border-b-2 px-2 py-1.5 console:justify-start console:gap-6 console:px-4 ${
        yours ? teamBorder(team) : 'border-transparent'
      }`}
    >
      <TeamTag team={team} />
      <Pips label="INT" count={interceptions} fill="bg-secure-ink" />
      <Pips label="MIS" count={misses} fill="bg-compromised" />
    </div>
  );
}

function PhaseTape({ state }: { state: PlayerView }) {
  const current = TAPE.indexOf(state.phase);
  return (
    <ol className="tape border-t border-rule" aria-label="Round progress">
      {TAPE.map((phase, index) => {
        const skipped = phase === 'intercept' && state.round === 1;
        return (
          <li
            key={phase}
            className="tape-cell"
            aria-current={index === current ? 'step' : undefined}
            data-state={skipped ? 'skip' : index < current ? 'past' : 'next'}
          >
            {phaseLabel(phase)}
          </li>
        );
      })}
    </ol>
  );
}

export function GameHeader({ state, connected }: { state: PlayerView; connected: boolean }) {
  const inPlay = state.phase !== 'lobby';
  return (
    <header className="relative z-[1] bg-casing">
      <Classification />
      <div className="gutter flex min-h-11 items-center justify-between gap-3 border-b border-rule">
        <p className="flex items-baseline gap-3 font-display text-xl tracking-[0.14em] text-white">
          <span className="sr-only">Room</span>
          {state.roomCode}
          {inPlay && state.phase !== 'gameover' && (
            <span className="eyebrow text-muted">
              Rnd {String(state.round).padStart(2, '0')}/{String(state.maxRounds).padStart(2, '0')}
            </span>
          )}
        </p>
        <LinkLight connected={connected} />
      </div>
      {inPlay && (
        <div className="grid grid-cols-2 divide-x divide-rule">
          {TEAMS.map((team) => (
            <TeamScore key={team} state={state} team={team} />
          ))}
        </div>
      )}
      {inPlay && state.phase !== 'gameover' && <PhaseTape state={state} />}
    </header>
  );
}
