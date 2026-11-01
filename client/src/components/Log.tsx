import { useState } from 'react';
import type { PlayerView, RoundReveal, TeamId } from '@decrypto/shared';
import { DIGITS, TEAMS, formatCode, otherTeam, teamName } from '../lib/game';

type LogView = 'round' | 'keyword';

function teamOrder(viewerTeam: TeamId | null): TeamId[] {
  return viewerTeam ? [viewerTeam, otherTeam(viewerTeam)] : TEAMS;
}

function LogEntry({ reveal, team }: { reveal: RoundReveal; team: TeamId }) {
  const entry = reveal.teams[team];
  return (
    <article className="case-file">
      <header className="case-head">
        <h4 className="case-title">{teamName(team)}</h4>
        <p>{formatCode(entry.code)}</p>
      </header>
      <ol className="mt-1">
        {entry.clues.map((clue, index) => (
          <li key={index} className="case-line">
            <span>{entry.code[index]}</span>
            <span>{clue}</span>
          </li>
        ))}
      </ol>
      {(entry.interceptedByOpponent || !entry.ownGuessCorrect) && (
        <p className="mt-2 text-[15px]">
          {entry.interceptedByOpponent && 'Intercepted. '}
          {!entry.ownGuessCorrect && 'Miscommunication.'}
        </p>
      )}
    </article>
  );
}

function ByRound({ state }: { state: PlayerView }) {
  if (state.roundHistory.length === 0) return <EmptyLog />;
  const order = teamOrder(state.viewer.team);
  return (
    <div className="space-y-5">
      {[...state.roundHistory].reverse().map((reveal) => (
        <section key={reveal.round} className="space-y-2">
          <h3 className="stencil text-[24px] leading-none">Round {reveal.round}</h3>
          {order.map((team) => (
            <LogEntry key={team} reveal={reveal} team={team} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function KeywordBoard({ state, team }: { state: PlayerView; team: TeamId }) {
  // Your own words stay out of the log: it is often read with the phone flat on the table.
  const visible = team !== state.viewer.team || state.allKeywordsRevealed;
  const words = visible ? state.keywords[team] : null;
  return (
    <div className="dossier-grid">
      {DIGITS.map((digit) => {
        const clues = state.clueHistory[team][digit];
        const word = words?.[digit - 1];
        return (
          <article key={digit} className="dossier">
            <h4 className="dossier-head">
              Keyword {digit}
              {word ? (
                <span className="dossier-word">{word}</span>
              ) : (
                <span className="redacted" role="img" aria-label="Classified" />
              )}
            </h4>
            <ul>
              {clues.length ? (
                clues.map((clue, index) => <li key={`${clue}-${index}`}>{clue}</li>)
              ) : (
                <li className="dossier-none">Nothing on file</li>
              )}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function ByKeyword({ state }: { state: PlayerView }) {
  return (
    <div className="space-y-5">
      {teamOrder(state.viewer.team).map((team) => (
        <section key={team} className="space-y-2">
          <h3 className="stencil text-[24px] leading-none">{teamName(team)}</h3>
          <KeywordBoard state={state} team={team} />
        </section>
      ))}
    </div>
  );
}

function EmptyLog() {
  return (
    <p className="case-file">Nothing on file yet. Every clue is filed at the end of its round.</p>
  );
}

export function LogPanel({ state }: { state: PlayerView }) {
  const [view, setView] = useState<LogView>('round');
  return (
    <div className="space-y-4">
      <div className="segment" role="group" aria-label="Sort the log">
        {(['round', 'keyword'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className="hw-key"
          >
            By {option}
          </button>
        ))}
      </div>
      {view === 'round' ? <ByRound state={state} /> : <ByKeyword state={state} />}
    </div>
  );
}
