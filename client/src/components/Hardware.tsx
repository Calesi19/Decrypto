import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Code, Digit, PlayerView, TeamId } from '@decrypto/shared';
import { cue } from '../lib/feedback';
import { DIGITS, TEAMS, teamName } from '../lib/game';

const HOLD_MS = 500;
const SAND_SECONDS = 30;
const REEL: Digit[] = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4];

// Two ways open: latched stays open until closed, held lasts while the button is down.
// Either way, backgrounding the app seals the unit.
export function useShutters() {
  const [latched, setLatched] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const seal = () => {
      if (document.visibilityState !== 'hidden') return;
      setLatched(false);
      setHeld(false);
    };
    document.addEventListener('visibilitychange', seal);
    return () => document.removeEventListener('visibilitychange', seal);
  }, []);

  return { latched, setLatched, held, setHeld, open: latched || held };
}

export function Lamp({ on }: { on: boolean }) {
  return <span className="lamp" data-on={on} aria-hidden="true" />;
}

export function InterceptChip({ filled }: { filled: boolean }) {
  return (
    <svg className="chip" viewBox="0 0 20 20" aria-hidden="true">
      {filled ? (
        <>
          <circle cx="10" cy="10" r="9.5" fill="var(--accent)" />
          <circle cx="10" cy="10" r="5" fill="none" stroke="var(--on-accent)" strokeWidth="1.6" />
          <path d="M10 2.5V7M10 13V17.5M2.5 10H7M13 10H17.5" stroke="var(--on-accent)" strokeWidth="1.6" />
        </>
      ) : (
        <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--chip-empty)" strokeWidth="1.6" strokeDasharray="3 2.4" />
      )}
    </svg>
  );
}

export function MissChip({ filled }: { filled: boolean }) {
  return (
    <svg className="chip" viewBox="0 0 20 20" aria-hidden="true">
      {filled ? (
        <>
          <circle cx="10" cy="10" r="9.5" fill="var(--chip-miss)" />
          <path d="M3.5 11 L7 7 L9.5 13 L12.5 6.5 L14.5 11 L16.5 9.5" fill="none" stroke="var(--chip-miss-ink)" strokeWidth="1.6" />
        </>
      ) : (
        <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--chip-empty)" strokeWidth="1.6" strokeDasharray="3 2.4" />
      )}
    </svg>
  );
}

function ScoreRow({ state, team }: { state: PlayerView; team: TeamId }) {
  const interceptions = state.interceptionTokens[team];
  const misses = state.miscommunicationTokens[team];
  const yours = state.viewer.team === team;
  return (
    <div
      className="score-row"
      role="img"
      aria-label={`${teamName(team)}${yours ? ' (your team)' : ''}: ${interceptions} of 2 interceptions, ${misses} of 2 miscommunications`}
    >
      <span className="stencil score-team">{teamName(team)}</span>
      <span className="chips">
        {[0, 1].map((slot) => (
          <InterceptChip key={slot} filled={slot < interceptions} />
        ))}
      </span>
      <span className="score-label">Intercepts</span>
      <span className="chips">
        {[0, 1].map((slot) => (
          <MissChip key={slot} filled={slot < misses} />
        ))}
      </span>
      <span className="score-label">Misreads</span>
    </div>
  );
}

export function DeskBar({ state, connected }: { state: PlayerView; connected: boolean }) {
  const title =
    state.phase === 'lobby'
      ? 'Briefing room'
      : state.phase === 'gameover'
        ? 'Case closed'
        : `Round ${state.round} of ${state.maxRounds}`;
  return (
    <header className="deskbar">
      <div className="gutter">
        <div className="deskbar-top">
          <p className="stencil text-[22px] leading-none">{title}</p>
          <p className="flex items-center gap-2">
            <span className="deskbar-room">
              <span className="sr-only">Room </span>
              {state.roomCode}
            </span>
            <Lamp on={connected} />
            <span className="sr-only" role="status">
              {connected ? 'Link up' : 'No signal'}
            </span>
          </p>
        </div>
        {state.phase !== 'lobby' && (
          <div className="scoreboard">
            {TEAMS.map((team) => (
              <ScoreRow key={team} state={state} team={team} />
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

export function Terminal(props: {
  team: TeamId;
  open: boolean;
  words: string[];
  lit?: Code | null;
  control?: ReactNode;
}) {
  const { team, open, words, lit } = props;
  return (
    <section className="terminal" aria-label={`${teamName(team)} terminal`}>
      <div className="terminal-plate">
        <p className="stencil terminal-name">{teamName(team)}</p>
        <Lamp on={open} />
        <span className="terminal-vents" aria-hidden="true" />
        {props.control}
      </div>
      <div className="windows">
        {DIGITS.map((digit, order) => (
          <div
            key={digit}
            className="window"
            data-open={open}
            data-lit={!lit || lit.includes(digit)}
            style={{ '--order': order } as CSSProperties}
          >
            <div className="shutter" aria-hidden="true">
              {digit}
            </div>
            {/* The word only enters the page while open, so nothing can leak from a sealed unit. */}
            {open ? (
              <>
                <span className="window-digit">{digit}</span>
                <span className="window-word">{words[digit - 1]}</span>
                {lit?.includes(digit) && (
                  <span className="window-lamp">
                    <Lamp on />
                  </span>
                )}
              </>
            ) : (
              <span className="sr-only">Window {digit} closed</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// A stray tap reveals nothing: the button has to stay down until the bar fills.
export function HoldButton(props: {
  label: string;
  onOpen: () => void;
  onRelease?: () => void;
}) {
  const [held, setHeld] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const opened = useRef(false);

  const press = () => {
    if (held) return;
    setHeld(true);
    cue('tick');
    timer.current = window.setTimeout(() => {
      opened.current = true;
      cue('relay');
      props.onOpen();
    }, HOLD_MS);
  };

  const release = () => {
    window.clearTimeout(timer.current);
    setHeld(false);
    if (opened.current) props.onRelease?.();
    opened.current = false;
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) press();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    release();
  };

  // Screen readers fire a bare click and cannot hold, so they get a direct open.
  const onClick = (event: MouseEvent) => {
    if (event.detail === 0) props.onOpen();
  };

  return (
    <button
      type="button"
      className="hw-btn hold"
      data-held={held}
      style={{ '--hold-ms': `${HOLD_MS}ms` } as CSSProperties}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onBlur={release}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onClick={onClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{props.label}</span>
    </button>
  );
}

export function ToggleSwitch(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      className="toggle"
      onClick={() => {
        cue('tick');
        props.onChange(!props.checked);
      }}
    >
      {props.label}
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-bat" />
      </span>
    </button>
  );
}

export function Wheels({ code, label }: { code: Code; label?: string }) {
  return (
    <div
      className="wheels"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {code.map((digit, index) => (
        <span key={index} className="wheel" aria-hidden="true">
          <span
            className="wheel-reel"
            style={
              {
                '--stop': 4 * (index + 1) + digit - 1,
                '--roll': `${0.8 + index * 0.26}s`,
              } as CSSProperties
            }
          >
            {REEL.map((value, position) => (
              <span key={position}>{value}</span>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

export function CodeCard({ code, round }: { code: Code; round: number }) {
  useEffect(() => {
    const timers = code.map((_, index) => window.setTimeout(() => cue('tick'), 800 + index * 260));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [code]);

  return (
    <div className="reader">
      <div className="code-card">
        <Wheels code={code} label={`Your code is ${code.join(', ')}`} />
        <div className="card-label">
          <p className="stencil card-title">Code card</p>
          <p className="card-round">Round {round}</p>
        </div>
        {/* The punches are the code itself: one column per digit, one row per keyword. */}
        <div className="punches" aria-hidden="true">
          {DIGITS.map((row) =>
            code.map((digit, column) => (
              <span key={`${row}-${column}`} className="punch" data-hole={digit === row} />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function sandStart(key: string): number {
  try {
    const saved = Number(window.sessionStorage.getItem(key));
    if (saved) return saved;
    const now = Date.now();
    window.sessionStorage.setItem(key, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

// A prompt, not a rule: running out of sand changes nothing in the game.
export function SandTimer({ runKey, sender }: { runKey: string; sender: string }) {
  const [start] = useState(() => sandStart(`decrypto-sand-${runKey}`));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const left = Math.max(0, SAND_SECONDS - (now - start) / 1000);
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = still ? 0.5 : left / SAND_SECONDS;
  return (
    <div className="sand" role="timer" aria-label={`${sender} transmitted. Sand timer running.`}>
      <svg className="sand-glass" viewBox="0 0 44 66" aria-hidden="true">
        <defs>
          <clipPath id="sand-top">
            <rect x="0" y={31 - 24 * top} width="44" height={24 * top} />
          </clipPath>
          <clipPath id="sand-bottom">
            <rect x="0" y={61 - 24 * (1 - top)} width="44" height={24 * (1 - top)} />
          </clipPath>
        </defs>
        <rect x="3" y="1" width="38" height="4" rx="2" fill="var(--case-muted)" />
        <rect x="3" y="61" width="38" height="4" rx="2" fill="var(--case-muted)" />
        <path
          d="M7 6H37V15C37 24 26 28 24 33C26 38 37 42 37 51V60H7V51C7 42 18 38 20 33C18 28 7 24 7 15Z"
          fill="var(--screen)"
          stroke="var(--case-muted)"
          strokeWidth="1.5"
        />
        <g fill="var(--accent)">
          <path clipPath="url(#sand-top)" d="M10 7H34V15C34 23 25 27 22 32C19 27 10 23 10 15Z" />
          <path clipPath="url(#sand-bottom)" d="M10 59V52C10 43 19 39 22 34C25 39 34 43 34 52V59Z" />
          {left > 0 && <rect x="21.4" y="31" width="1.2" height="29" />}
        </g>
      </svg>
      <div>
        <p className="sand-time">0:{String(Math.ceil(left)).padStart(2, '0')}</p>
        <p className="sand-note">
          {left > 0 ? `${sender} transmitted. Wrap it up.` : 'Sand is out. Transmit when ready.'}
        </p>
      </div>
    </div>
  );
}
