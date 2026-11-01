import type { PlayerView } from '@decrypto/shared';
import { ArmedButton } from '../components/Bits';
import { Terminal } from '../components/Hardware';
import { TEAMS, teamName } from '../lib/game';
import { RevealCards } from './Station';

export function GameOver(props: { state: PlayerView; busy: boolean; onLeave: () => void }) {
  const { state } = props;
  const winner = state.winner;
  const headline =
    winner === 'draw' || !winner
      ? 'Stalemate'
      : winner === state.viewer.team
        ? 'Mission complete'
        : 'Compromised';
  return (
    <div className="space-y-5">
      <section className="case-file">
        <h2 className="stencil stamp stamp-big">{headline}</h2>
        <p className="verdict-note">
          {winner && winner !== 'draw' ? `${teamName(winner)} wins. ` : ''}
          {state.endReason}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {TEAMS.map((team) => (
          <div key={team} data-team={team}>
            <Terminal team={team} open words={state.keywords[team] ?? []} />
          </div>
        ))}
      </div>

      {state.lastReveal && (
        <section className="space-y-2">
          <h3 className="stencil text-[24px] leading-none">Final round</h3>
          <RevealCards state={state} reveal={state.lastReveal} />
        </section>
      )}

      <ArmedButton
        label="Leave room"
        armedLabel="Tap again to leave"
        disabled={props.busy}
        onConfirm={props.onLeave}
      />
    </div>
  );
}
