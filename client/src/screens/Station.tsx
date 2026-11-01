import { useRef, useState } from 'react';
import type {
  Digit,
  GuessDigit,
  GuessKind,
  GuessState,
  PlayerView,
  RoundReveal,
  TeamId,
} from '@decrypto/shared';
import { ArmedButton, TaskHead, Teletype } from '../components/Bits';
import { Lamp, Wheels } from '../components/Hardware';
import { KeywordBoard } from '../components/Log';
import { KeywordPanel } from '../components/Shield';
import { cue } from '../lib/feedback';
import { DIGITS, TEAMS, formatCode, otherTeam, playerName, teamName } from '../lib/game';
import { EncryptStation } from './Encrypt';

function GuessPad(props: {
  guess: GuessState;
  title: string;
  clues: string[];
  idPrefix: string;
  disabled: boolean;
  busy: boolean;
  state: PlayerView;
  onUpdate: (draft: GuessDigit[]) => Promise<void>;
  onLock: () => void;
}) {
  const { guess } = props;
  const inFlight = useRef(0);
  const [pending, setPending] = useState<GuessDigit[] | null>(null);
  const draft = pending ?? guess.draft;
  const complete = draft.every((digit) => digit !== null);
  const readOnly = props.disabled || guess.locked;

  // Shows the tap immediately; the server's copy takes over once all taps are acknowledged.
  const commit = (next: GuessDigit[]) => {
    setPending(next);
    inFlight.current += 1;
    void props.onUpdate(next).finally(() => {
      inFlight.current -= 1;
      if (inFlight.current === 0) setPending(null);
    });
  };

  const choose = (position: number, digit: Digit) => {
    const next = draft.map((candidate) => (candidate === digit ? null : candidate));
    next[position] = draft[position] === digit ? null : digit;
    cue('tick');
    commit(next);
  };

  return (
    <div className="space-y-3">
      <div className="pad">
        <h3 className="stencil pad-title mb-2">{props.title}</h3>
        <ol>
          {props.clues.map((clue, position) => (
            <li key={position} className="guess-row">
              <p className="guess-clue">
                <span>
                  <Teletype id={`${props.idPrefix}-${position}`} text={clue} delay={position * 180} />
                </span>
              </p>
              <div className="keys" role="group" aria-label={`Keyword for clue ${position + 1}`}>
                {DIGITS.map((digit) => {
                  const active = draft[position] === digit;
                  return (
                    <button
                      key={digit}
                      type="button"
                      className="keycap"
                      aria-pressed={active}
                      data-used={!active && draft.includes(digit)}
                      disabled={readOnly}
                      onClick={() => choose(position, digit)}
                    >
                      {digit}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="readout">
        <div className="tiles" role="img" aria-label={`Current guess ${formatCode(draft)}`}>
          {draft.map((digit, index) => (
            <span key={index} className="tile" aria-hidden="true">
              {digit ?? '–'}
            </span>
          ))}
        </div>
        <p className="readout-note">
          {guess.locked
            ? `Locked by ${playerName(props.state, guess.lockedBy)}`
            : guess.updatedBy
              ? `Set by ${playerName(props.state, guess.updatedBy)}`
              : 'Your team shares this guess'}
        </p>
      </div>

      {!guess.locked && !props.disabled && (
        <ArmedButton
          primary
          label={complete ? 'Lock it in' : 'Pick all three'}
          armedLabel="Tap again to lock"
          disabled={!complete || props.busy}
          onConfirm={() => {
            cue('confirm');
            props.onLock();
          }}
        />
      )}
    </div>
  );
}

function LockStatus({ state, team, kind }: { state: PlayerView; team: TeamId; kind: GuessKind }) {
  const own = kind === 'intercept' ? state.yourInterceptGuess : state.yourDecodeGuess;
  const theirs = state.opponentGuessStatus?.[kind].locked;
  const rows: [TeamId, boolean][] = [
    [team, !!own?.locked],
    [otherTeam(team), !!theirs],
  ];
  return (
    <div className="status-strip">
      {rows.map(([candidate, locked]) => (
        <p key={candidate}>
          <Lamp on={locked} />
          {teamName(candidate)}: {locked ? 'locked' : 'deciding'}
        </p>
      ))}
    </div>
  );
}

function GuessStation(props: {
  state: PlayerView;
  team: TeamId;
  kind: GuessKind;
  busy: boolean;
  onUpdateGuess: (kind: GuessKind, draft: GuessDigit[]) => Promise<void>;
  onLockGuess: (kind: GuessKind) => void;
}) {
  const { state, team, kind } = props;
  const intercepting = kind === 'intercept';
  const opponent = otherTeam(team);
  const target = intercepting ? opponent : team;
  const isEncryptor = state.encoders[team] === state.viewer.id;
  const silent = !intercepting && isEncryptor;
  const guess = intercepting ? state.yourInterceptGuess : state.yourDecodeGuess;
  const clues = state.submittedClues[target];
  if (!guess || !clues) return null;

  return (
    <div className="space-y-4">
      <TaskHead
        state={state}
        title={intercepting ? 'Intercept attempt' : silent ? 'Stay silent' : 'Decode'}
        note={
          intercepting
            ? `Which ${teamName(opponent)} keyword does each clue point to? Anyone on your team can lock.`
            : silent
              ? 'You wrote these. Watch your team work, and say nothing.'
              : `Match ${playerName(state, state.encoders[team])}'s clues to your keywords.`
        }
      />
      {!intercepting && <KeywordPanel state={state} mode="latch" />}
      <GuessPad
        key={`${kind}-${state.round}`}
        guess={guess}
        title={intercepting ? 'Intercepted clues' : 'Your team’s clues'}
        clues={clues}
        idPrefix={`${state.roomCode}-${state.round}-${target}`}
        disabled={silent}
        busy={props.busy}
        state={state}
        onUpdate={(draft) => props.onUpdateGuess(kind, draft)}
        onLock={() => props.onLockGuess(kind)}
      />
      <LockStatus state={state} team={team} kind={kind} />
      {intercepting && (
        <section className="space-y-2">
          <h3 className="stencil text-[24px] leading-none">{teamName(opponent)} clues so far</h3>
          <KeywordBoard state={state} team={opponent} />
        </section>
      )}
    </div>
  );
}

function RevealCard({ reveal, team }: { reveal: RoundReveal; team: TeamId }) {
  const entry = reveal.teams[team];
  const opponent = otherTeam(team);
  return (
    <article className="case-file">
      <header className="case-head">
        <h3 className="case-title">{teamName(team)}</h3>
        <Wheels code={entry.code} label={`Code ${entry.code.join(', ')}`} />
      </header>
      <ol className="mt-2">
        {entry.clues.map((clue, index) => (
          <li key={index} className="case-line">
            <span>{entry.code[index]}</span>
            <span>{clue}</span>
          </li>
        ))}
      </ol>
      <dl className="case-facts">
        <dt>{teamName(team)} decoded</dt>
        <dd>{formatCode(entry.ownGuess)}</dd>
        {entry.opponentGuess && (
          <>
            <dt>{teamName(opponent)} intercept</dt>
            <dd>{formatCode(entry.opponentGuess)}</dd>
          </>
        )}
      </dl>
      <div className="case-outcome">
        {entry.interceptedByOpponent && (
          <>
            <span className="stencil stamp stamp-big">Intercepted</span>
            <p>{teamName(opponent)} cracked this code and takes a chip.</p>
          </>
        )}
        {entry.ownGuessCorrect ? (
          <span className="stencil stamp stamp-quiet">Decoded</span>
        ) : (
          <>
            <span className="stencil stamp stamp-big stamp-lost">Signal lost</span>
            <p>Miscommunication. {teamName(team)} misread its own clues and takes a chip.</p>
          </>
        )}
      </div>
    </article>
  );
}

export function RevealCards({ state, reveal }: { state: PlayerView; reveal: RoundReveal }) {
  const team = state.viewer.team;
  const order = team ? [team, otherTeam(team)] : TEAMS;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {order.map((candidate) => (
        <RevealCard key={candidate} reveal={reveal} team={candidate} />
      ))}
    </div>
  );
}

function RevealStation(props: { state: PlayerView; busy: boolean; onNextRound: () => void }) {
  const { state } = props;
  const reveal = state.lastReveal;
  return (
    <div className="space-y-4">
      <TaskHead
        state={state}
        title="Codes revealed"
        note={state.round === 1 ? 'No intercept attempts in round 1. The clues are now on file.' : undefined}
      />
      {reveal && <RevealCards state={state} reveal={reveal} />}
      <div className="action-bar">
        {state.isHost ? (
          <button onClick={props.onNextRound} disabled={props.busy} className="hw-btn">
            Start round {state.round + 1}
          </button>
        ) : (
          <p className="text-center">
            Waiting for {playerName(state, state.players.find((player) => player.isHost)?.id)} to
            start round {state.round + 1}
          </p>
        )}
      </div>
    </div>
  );
}

export function Station(props: {
  state: PlayerView;
  busy: boolean;
  onSubmitClues: (clues: string[]) => void;
  onUpdateGuess: (kind: GuessKind, draft: GuessDigit[]) => Promise<void>;
  onLockGuess: (kind: GuessKind) => void;
  onNextRound: () => void;
}) {
  const { state } = props;
  const team = state.viewer.team;
  if (!team) {
    return <TaskHead state={state} title="Observer" note="You are not on a team in this game." />;
  }
  if (state.phase === 'encode') {
    return <EncryptStation state={state} team={team} busy={props.busy} onSubmit={props.onSubmitClues} />;
  }
  if (state.phase === 'intercept' || state.phase === 'decode') {
    return (
      <GuessStation
        state={state}
        team={team}
        kind={state.phase}
        busy={props.busy}
        onUpdateGuess={props.onUpdateGuess}
        onLockGuess={props.onLockGuess}
      />
    );
  }
  if (state.phase === 'reveal') {
    return <RevealStation state={state} busy={props.busy} onNextRound={props.onNextRound} />;
  }
  return null;
}
