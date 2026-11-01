import { useRef, useState, type FormEvent } from 'react';
import type {
  Digit,
  GuessDigit,
  GuessKind,
  GuessState,
  PlayerView,
  RoundReveal,
  TeamId,
} from '@decrypto/shared';
import {
  ArmedButton,
  SectionRule,
  StationHead,
  StatusLine,
  TeamLabel,
  Teletype,
} from '../components/Bits';
import { FilterSlider, ShieldStrip } from '../components/Filter';
import { KeywordBoard } from '../components/Log';
import { ShieldPanel } from '../components/Shield';
import { cue } from '../lib/feedback';
import {
  DIGITS,
  TEAMS,
  clock,
  formatCode,
  messageId,
  otherTeam,
  playerName,
  teamName,
} from '../lib/game';

const CLUE_DRAFT_KEY = 'decrypto-clue-draft';

function readClueDraft(key: string): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CLUE_DRAFT_KEY) ?? 'null');
    if (saved?.key === key && Array.isArray(saved.clues)) return saved.clues;
  } catch {
    // A corrupt draft is not worth reporting; start clean.
  }
  return ['', '', ''];
}

function EncodeForm(props: {
  state: PlayerView;
  team: TeamId;
  busy: boolean;
  onSubmit: (clues: string[]) => void;
}) {
  const { state, team } = props;
  const draftKey = `${state.roomCode}-${state.round}-${team}`;
  // Saved on every keystroke: mobile browsers evict backgrounded apps without warning.
  const [clues, setClues] = useState(() => readClueDraft(draftKey));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const keywords = state.keywords[team] ?? [];
  const code = state.currentCode;
  if (!code) return null;

  const clash = clues.map((clue) =>
    keywords.findIndex((word) => word.toLocaleLowerCase() === clue.trim().toLocaleLowerCase()),
  );
  const ready = clues.every((clue) => clue.trim()) && clash.every((index) => index === -1);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const firstEmpty = clues.findIndex((clue) => !clue.trim());
    if (firstEmpty !== -1) {
      inputs.current[firstEmpty]?.focus();
      return;
    }
    if (!ready) return;
    cue('confirm');
    props.onSubmit(clues);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
      <FilterSlider />
      {code.map((digit, index) => (
        <div key={index} data-clue className="space-y-1">
          <ShieldStrip
            tag={String(digit)}
            text={keywords[digit - 1] ?? ''}
            seed={`${team}-${digit}`}
          />
          <label className="block">
            <span className="sr-only">Clue {index + 1}</span>
            <input
              ref={(element) => {
                inputs.current[index] = element;
              }}
              value={clues[index]}
              onChange={(event) => {
                const next = [...clues];
                next[index] = event.target.value;
                setClues(next);
                window.localStorage.setItem(
                  CLUE_DRAFT_KEY,
                  JSON.stringify({ key: draftKey, clues: next }),
                );
              }}
              onFocus={(event) => {
                // After the keyboard opens, keep the keyword and its clue on screen together.
                const pair = event.currentTarget.closest('[data-clue]');
                window.setTimeout(() => pair?.scrollIntoView({ block: 'center' }), 320);
              }}
              onKeyDown={(event) => {
                // Browsers ignore Enter while the submit button is disabled, so it is wired here.
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (index < 2) inputs.current[index + 1]?.focus();
                else event.currentTarget.form?.requestSubmit();
              }}
              className="field"
              placeholder={`Clue ${index + 1}`}
              maxLength={48}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint={index < 2 ? 'next' : 'send'}
              aria-invalid={clash[index] !== -1}
            />
          </label>
          {clash[index] !== -1 && (
            <p className="text-sm text-intercepted">That is keyword {clash[index] + 1}. Pick another.</p>
          )}
        </div>
      ))}
      <button disabled={props.busy || !ready} className="btn btn-primary">
        Transmit clues
      </button>
    </form>
  );
}

function ClueCard({ state, team }: { state: PlayerView; team: TeamId }) {
  const clues = state.submittedClues[team];
  return (
    <article className="printout">
      <header className="flex items-center justify-between gap-3">
        <TeamLabel team={team} />
        <p className="text-xs text-muted">MSG {messageId(state.round, team)}</p>
      </header>
      {clues ? (
        <ol className="mt-2">
          {clues.map((clue, index) => (
            <li key={index} className="printout-line">
              <span className="text-xs text-dim">{index + 1}</span>
              <span className="text-white">
                <Teletype
                  id={`${state.roomCode}-${state.round}-${team}-${index}`}
                  text={clue}
                  delay={index * 180}
                />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-dim">Awaiting transmission</p>
      )}
    </article>
  );
}

function EncodeStation(props: {
  state: PlayerView;
  team: TeamId;
  busy: boolean;
  onSubmit: (clues: string[]) => void;
}) {
  const { state, team } = props;
  const isEncoder = state.encoders[team] === state.viewer.id;
  const writing = isEncoder && !state.submittedClues[team];
  return (
    <div className="space-y-5">
      <StationHead
        eyebrow={`Encode // MSG ${messageId(state.round, team)}`}
        title={writing ? 'You are encoding' : `${playerName(state, state.encoders[team])} is encoding`}
        note={
          writing
            ? 'One clue per digit, in order. Clues go public the moment you transmit.'
            : 'Both Encoders write at once. Use the time to study your keywords.'
        }
      />
      {writing ? (
        <EncodeForm state={state} team={team} busy={props.busy} onSubmit={props.onSubmit} />
      ) : (
        <div className="console:hidden">
          <ShieldPanel state={state} />
        </div>
      )}
      <div className="space-y-2">
        <SectionRule>This round</SectionRule>
        {[team, otherTeam(team)].map((candidate) => (
          <ClueCard key={candidate} state={state} team={candidate} />
        ))}
      </div>
    </div>
  );
}

function GuessPad(props: {
  guess: GuessState;
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
      <ol className="space-y-3">
        {props.clues.map((clue, position) => (
          <li key={position}>
            <p className="mb-1 flex items-baseline gap-2 text-[15px] text-white">
              <span className="text-xs text-dim">{position + 1}</span>
              <span className="min-w-0 break-words">
                <Teletype id={`${props.idPrefix}-${position}`} text={clue} delay={position * 180} />
              </span>
            </p>
            <div
              className="grid grid-cols-4 gap-1"
              role="group"
              aria-label={`Digit for clue ${position + 1}`}
            >
              {DIGITS.map((digit) => {
                const active = draft[position] === digit;
                return (
                  <button
                    key={digit}
                    type="button"
                    className="key"
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

      <div className="flex items-center justify-between gap-3 border-y border-rule py-2">
        <p className="font-display text-2xl tracking-[0.14em] text-phosphor">
          <span className="sr-only">Current guess </span>
          {formatCode(draft)}
        </p>
        <p className="min-w-0 truncate text-xs text-muted">
          {guess.locked
            ? `Locked by ${playerName(props.state, guess.lockedBy)}`
            : guess.updatedBy
              ? `Edited by ${playerName(props.state, guess.updatedBy)}`
              : 'Shared draft'}
        </p>
      </div>

      {!guess.locked && !props.disabled && (
        <ArmedButton
          primary
          label="Lock in guess"
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
  return (
    <div className="border-t border-rule">
      <StatusLine
        label={<TeamLabel team={team} />}
        value={own?.locked ? 'Locked' : 'Deciding'}
        live={own?.locked}
      />
      <StatusLine
        label={<TeamLabel team={otherTeam(team)} />}
        value={theirs ? 'Locked' : 'Deciding'}
        live={theirs}
      />
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
  const isEncoder = state.encoders[team] === state.viewer.id;
  const silent = !intercepting && isEncoder;
  const guess = intercepting ? state.yourInterceptGuess : state.yourDecodeGuess;
  const clues = state.submittedClues[target];
  if (!guess || !clues) return null;

  return (
    <div className="space-y-5">
      <StationHead
        eyebrow={`${intercepting ? 'Intercept' : 'Decode'} // MSG ${messageId(state.round, target)}`}
        title={intercepting ? `Crack ${teamName(opponent)}` : silent ? 'Stay silent' : 'Decode your clues'}
        note={
          intercepting
            ? 'Which of their keywords does each clue point at? Anyone on your team can lock it.'
            : silent
              ? 'You wrote these. Watch your team work, and say nothing.'
              : 'Match each clue to one of your keywords. Everyone but the Encoder can edit.'
        }
      />
      <GuessPad
        key={`${kind}-${state.round}`}
        guess={guess}
        clues={clues}
        idPrefix={`${state.roomCode}-${state.round}-${target}`}
        disabled={silent}
        busy={props.busy}
        state={state}
        onUpdate={(draft) => props.onUpdateGuess(kind, draft)}
        onLock={() => props.onLockGuess(kind)}
      />
      <LockStatus state={state} team={team} kind={kind} />
      {intercepting ? (
        <div className="space-y-2">
          <SectionRule>{teamName(opponent)} clues so far</SectionRule>
          <KeywordBoard state={state} team={opponent} />
        </div>
      ) : (
        <div className="console:hidden">
          <ShieldPanel state={state} />
        </div>
      )}
    </div>
  );
}

function RevealCard({ reveal, team }: { reveal: RoundReveal; team: TeamId }) {
  const entry = reveal.teams[team];
  const opponent = otherTeam(team);
  return (
    <article className="printout">
      <header className="flex items-center justify-between gap-3">
        <TeamLabel team={team} />
        <p className="text-xs text-muted">
          MSG {messageId(reveal.round, team)} · {clock(reveal.revealedAt)}
        </p>
      </header>
      <p className="mt-2 font-display text-4xl tracking-[0.12em] text-white">
        <span className="sr-only">Code </span>
        {formatCode(entry.code)}
      </p>
      <ol className="mt-1">
        {entry.clues.map((clue, index) => (
          <li key={index} className="printout-line">
            <span className="font-display text-lg text-phosphor">{entry.code[index]}</span>
            <span className="text-white">{clue}</span>
          </li>
        ))}
      </ol>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-rule pt-2 text-sm">
        <dt className="text-muted">{teamName(team)} decoded</dt>
        <dd className="font-display tracking-[0.1em]">{formatCode(entry.ownGuess)}</dd>
        {entry.opponentGuess && (
          <>
            <dt className="text-muted">{teamName(opponent)} intercept</dt>
            <dd className="font-display tracking-[0.1em]">{formatCode(entry.opponentGuess)}</dd>
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {entry.ownGuessCorrect ? (
          <span className="stamp stamp-in text-secure-ink">Secure</span>
        ) : (
          <span className="stamp stamp-in text-compromised-ink">Miscommunication</span>
        )}
        {entry.interceptedByOpponent && (
          <span className="stamp stamp-in text-intercepted [animation-delay:160ms]">Intercepted</span>
        )}
      </div>
    </article>
  );
}

export function RevealCards({ state, reveal }: { state: PlayerView; reveal: RoundReveal }) {
  const team = state.viewer.team;
  const order = team ? [team, otherTeam(team)] : TEAMS;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
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
    <div className="space-y-5">
      <StationHead
        eyebrow={`Reveal // Round ${String(state.round).padStart(2, '0')}`}
        title="Codes declassified"
        note={state.round === 1 ? 'No interceptions in round 1. The clues are now on file.' : undefined}
      />
      {reveal && <RevealCards state={state} reveal={reveal} />}
      {state.isHost ? (
        <div className="sticky bottom-0 -mb-4 bg-obsidian pb-4 pt-2">
          <button onClick={props.onNextRound} disabled={props.busy} className="btn btn-primary">
            Start round {state.round + 1}
          </button>
        </div>
      ) : (
        <p className="border border-rule px-4 py-3 text-center text-sm text-muted">
          Waiting for {playerName(state, state.players.find((player) => player.isHost)?.id)} to
          start round {state.round + 1}
        </p>
      )}
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
    return <StationHead eyebrow="Observer" title="No team" note="You are not on a team in this game." />;
  }
  if (state.phase === 'encode') {
    return <EncodeStation state={state} team={team} busy={props.busy} onSubmit={props.onSubmitClues} />;
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
