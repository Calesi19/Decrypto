import { useState } from 'react';
import type { PlayerView, RoundReveal, TeamId } from '@decrypto/shared';
import { DIGITS, TEAMS, clock, formatCode, messageId, otherTeam } from '../lib/game';
import { SectionRule, TeamLabel } from './Bits';
import { ShieldStrip } from './Filter';

type LogView = 'round' | 'keyword';

function teamOrder(viewerTeam: TeamId | null): TeamId[] {
  return viewerTeam ? [viewerTeam, otherTeam(viewerTeam)] : TEAMS;
}

function LogEntry({ reveal, team }: { reveal: RoundReveal; team: TeamId }) {
  const entry = reveal.teams[team];
  return (
    <article className="printout">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <TeamLabel team={team} />
        <p className="text-xs text-muted">
          MSG {messageId(reveal.round, team)} · {clock(reveal.revealedAt)}
        </p>
      </header>
      <ol className="mt-2">
        {entry.clues.map((clue, index) => (
          <li key={index} className="printout-line">
            <span className="font-display text-lg text-phosphor">{entry.code[index]}</span>
            <span className="text-white">{clue}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">
        Code {formatCode(entry.code)}
        {entry.interceptedByOpponent && <span className="text-intercepted"> · Intercepted</span>}
        {!entry.ownGuessCorrect && (
          <span className="text-compromised-ink"> · Miscommunication</span>
        )}
      </p>
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
          <SectionRule>Round {String(reveal.round).padStart(2, '0')}</SectionRule>
          {order.map((team) => (
            <LogEntry key={team} reveal={reveal} team={team} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function KeywordBoard({ state, team }: { state: PlayerView; team: TeamId }) {
  const masked = team === state.viewer.team && !state.allKeywordsRevealed;
  const words = state.keywords[team];
  return (
    <div className={`grid gap-2 ${masked ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {DIGITS.map((digit) => {
        const clues = state.clueHistory[team][digit];
        return (
          <div key={digit} className="min-w-0 border border-rule bg-[#16181c]">
            {masked ? (
              <ShieldStrip
                tag={String(digit)}
                text={words?.[digit - 1] ?? ''}
                seed={`${team}-${digit}`}
              />
            ) : (
              <p className="flex items-baseline gap-2 border-b border-rule bg-plate px-2.5 py-1.5 font-display text-lg uppercase tracking-[0.08em] text-white">
                <span className="text-phosphor">{digit}</span>
                <span className="min-w-0 break-words">{words?.[digit - 1] ?? ''}</span>
              </p>
            )}
            <ul className="space-y-0.5 px-2.5 py-2 text-sm">
              {clues.length ? (
                clues.map((clue, index) => (
                  <li key={`${clue}-${index}`} className="break-words text-ink">
                    {clue}
                  </li>
                ))
              ) : (
                <li className="text-dim">No traffic</li>
              )}
            </ul>
          </div>
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
          <TeamLabel team={team} />
          <KeywordBoard state={state} team={team} />
        </section>
      ))}
    </div>
  );
}

function EmptyLog() {
  return (
    <p className="border border-dashed border-rule p-4 text-sm leading-6 text-muted">
      No traffic logged yet. Every clue files here at the end of its round.
    </p>
  );
}

export function LogPanel({ state }: { state: PlayerView }) {
  const [view, setView] = useState<LogView>('round');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px bg-rule p-px" role="group" aria-label="Sort the log">
        {(['round', 'keyword'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className={`eyebrow min-h-11 ${
              view === option ? 'bg-ink text-black' : 'bg-casing text-muted'
            }`}
          >
            By {option}
          </button>
        ))}
      </div>
      {view === 'round' ? <ByRound state={state} /> : <ByKeyword state={state} />}
    </div>
  );
}
