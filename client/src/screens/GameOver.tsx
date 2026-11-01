import type { PlayerView, TeamId } from '@decrypto/shared';
import { ArmedButton, SectionRule, StationHead, TeamLabel } from '../components/Bits';
import { TEAMS, teamBorder, teamFill, teamName } from '../lib/game';
import { RevealCards } from './Station';

function Dossier({ state, team }: { state: PlayerView; team: TeamId }) {
  const won = state.winner === team;
  return (
    <article className={`border bg-casing p-3 ${won ? teamBorder(team) : 'border-rule'}`}>
      <div className="flex items-center justify-between gap-3">
        <TeamLabel team={team} />
        <p className="text-xs text-muted">
          INT {state.interceptionTokens[team]} · MIS {state.miscommunicationTokens[team]}
        </p>
      </div>
      <ol className="mt-2">
        {(state.keywords[team] ?? []).map((word, index) => (
          <li key={word} className="printout-line">
            <span className="font-display text-lg text-phosphor">{index + 1}</span>
            <span className="font-display text-xl uppercase tracking-[0.08em] text-white">{word}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

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
      <section
        className={`stamp-in p-4 text-black ${
          winner && winner !== 'draw' ? teamFill(winner) : 'bg-ink'
        }`}
        style={{ transform: 'none' }}
      >
        <p className="eyebrow">Transmission closed // Declassified</p>
        <h2 className="mt-1 font-display text-[40px] uppercase leading-none tracking-[0.04em]">
          {headline}
        </h2>
        <p className="mt-2 text-sm font-semibold">
          {winner && winner !== 'draw' ? `Team ${teamName(winner)} wins. ` : ''}
          {state.endReason}
        </p>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        {TEAMS.map((team) => (
          <Dossier key={team} state={state} team={team} />
        ))}
      </div>

      {state.lastReveal && (
        <div className="space-y-2">
          <SectionRule>Final round</SectionRule>
          <RevealCards state={state} reveal={state.lastReveal} />
        </div>
      )}

      <div className="space-y-2">
        <StationHead eyebrow="Debrief" title="Stand down" />
        <ArmedButton
          label="Leave room"
          armedLabel="Tap again to leave"
          disabled={props.busy}
          onConfirm={props.onLeave}
        />
      </div>
    </div>
  );
}
