import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Code, PlayerView, TeamId } from '@decrypto/shared';
import { TaskHead, Teletype } from '../components/Bits';
import {
  CodeCard,
  HoldButton,
  Lamp,
  SandTimer,
  Terminal,
  ToggleSwitch,
  useShutters,
} from '../components/Hardware';
import { KeywordPanel } from '../components/Shield';
import { cue } from '../lib/feedback';
import { otherTeam, playerName, teamName } from '../lib/game';

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

function ClueForm(props: {
  draftKey: string;
  code: Code;
  keywords: string[];
  busy: boolean;
  onSubmit: (clues: string[]) => void;
}) {
  const { code, keywords } = props;
  // Saved on every keystroke: mobile browsers evict backgrounded apps without warning.
  const [clues, setClues] = useState(() => readClueDraft(props.draftKey));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const clash = clues.map((clue) =>
    keywords.findIndex((word) => word.toLocaleLowerCase() === clue.trim().toLocaleLowerCase()),
  );
  const filled = clues.every((clue) => clue.trim());
  const ready = filled && clash.every((index) => index === -1);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const firstEmpty = clues.findIndex((clue) => !clue.trim());
    if (firstEmpty !== -1) {
      inputs.current[firstEmpty]?.focus();
      return;
    }
    if (ready) props.onSubmit(clues);
  };

  return (
    <form onSubmit={onSubmit} autoComplete="off" className="space-y-3">
      <div className="pad">
        <h3 className="stencil pad-title">Transmission</h3>
        {code.map((digit, index) => (
          <label key={index} data-clue className="clue-row">
            <span className="clue-digit" aria-hidden="true">
              {digit}
            </span>
            <span className="min-w-0">
              <span className="clue-word">
                <span className="sr-only">Clue {index + 1} for keyword {digit}, </span>
                {keywords[digit - 1]}
              </span>
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
                    JSON.stringify({ key: props.draftKey, clues: next }),
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
                className="clue-input"
                placeholder="Your clue"
                maxLength={48}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint={index < 2 ? 'next' : 'send'}
                aria-invalid={clash[index] !== -1}
              />
              {clash[index] !== -1 && (
                <span className="clue-error block">
                  That is keyword {clash[index] + 1}. Pick another.
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="transmit-bar">
        <button disabled={props.busy || !ready} className="hw-btn">
          {ready ? 'Transmit' : filled ? 'Change the keyword first' : 'Write all three clues'}
        </button>
      </div>
    </form>
  );
}

function Slip({ state, team }: { state: PlayerView; team: TeamId }) {
  const clues = state.submittedClues[team];
  return (
    <article className="slip">
      <h3 className="stencil slip-head">{teamName(team)}</h3>
      {clues ? (
        <>
          <p className="stencil stamp slip-stamp">Transmitted</p>
          <ol>
            {clues.map((clue, index) => (
              <li key={index} className="overflow-hidden break-words">
                <Teletype
                  id={`${state.roomCode}-${state.round}-${team}-${index}`}
                  text={clue}
                  delay={index * 180}
                />
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="slip-wait">
          <Lamp on={false} />
          Awaiting transmission
        </p>
      )}
    </article>
  );
}

export function EncryptStation(props: {
  state: PlayerView;
  team: TeamId;
  busy: boolean;
  onSubmit: (clues: string[]) => void;
}) {
  const { state, team } = props;
  const { latched, setLatched } = useShutters();
  const isEncryptor = state.encoders[team] === state.viewer.id;
  const writing = isEncryptor && !state.submittedClues[team];
  const keywords = state.keywords[team] ?? [];
  const code = state.currentCode;
  const opponent = otherTeam(team);
  const sent = Number(!!state.submittedClues[team]) + Number(!!state.submittedClues[opponent]);
  const lastSent = useRef(sent);

  useEffect(() => {
    if (sent > lastSent.current) cue('teletype');
    lastSent.current = sent;
  }, [sent]);

  return (
    <div className="space-y-4">
      <TaskHead
        state={state}
        title="Encrypt"
        note={
          writing
            ? latched
              ? 'One clue for each digit, in order. Everyone sees them once you transmit.'
              : 'You are the Encryptor. Check nobody is looking, then open up.'
            : `${isEncryptor ? 'Your clues are out.' : `${playerName(state, state.encoders[team])} is writing clues.`} Hold to study your keywords.`
        }
      />

      {state.submittedClues[opponent] && !state.submittedClues[team] && (
        <SandTimer runKey={`${state.roomCode}-${state.round}-${team}`} sender={teamName(opponent)} />
      )}

      {writing && code ? (
        <>
          <Terminal
            team={team}
            open={latched}
            words={keywords}
            lit={code}
            control={
              latched ? (
                <ToggleSwitch label="Shutters" checked={latched} onChange={setLatched} />
              ) : undefined
            }
          />
          {latched ? (
            <>
              <CodeCard code={code} round={state.round} />
              <ClueForm
                draftKey={`${state.roomCode}-${state.round}-${team}`}
                code={code}
                keywords={keywords}
                busy={props.busy}
                onSubmit={props.onSubmit}
              />
            </>
          ) : (
            <HoldButton label="Hold to open" onOpen={() => setLatched(true)} />
          )}
        </>
      ) : (
        <>
          <KeywordPanel state={state} mode="peek" />
          <div className="space-y-2">
            {[team, opponent].map((candidate) => (
              <Slip key={candidate} state={state} team={candidate} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
