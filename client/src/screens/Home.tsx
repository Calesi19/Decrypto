import { Notice, SectionRule } from '../components/Bits';
import { Classification, LinkLight } from '../components/Header';
import { useInstall } from '../lib/pwa';

const MANUAL = [
  ['Teams', 'Two teams, two or more players each. Your team shares four secret keywords, numbered 1 to 4, for the whole game.'],
  ['Encode', 'Each round one Encoder gets a three-digit code such as 3-1-4 and writes one clue per digit.'],
  ['Intercept', 'From round 2, each team tries to crack the other team’s code from every clue given so far.'],
  ['Decode', 'Then your team decodes its own clues. The Encoder stays silent.'],
  ['Win', 'Two interceptions win. Two miscommunications lose. Eight rounds at most.'],
];

export function HomeScreen(props: {
  connected: boolean;
  name: string;
  roomCode: string;
  error: string | null;
  busy: boolean;
  onNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onClearError: () => void;
}) {
  const { canPrompt, showIosHint, install } = useInstall();
  const locked = props.busy || !props.connected;

  return (
    <div className="shell !grid-rows-[auto_minmax(0,1fr)]">
      <Classification />
      <main id="main" className="scroller gutter pb-[calc(24px+var(--safe-bottom))]">
        <div className="mx-auto flex min-h-full w-full max-w-[520px] flex-col gap-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow text-muted">Field cipher unit</p>
            <LinkLight connected={props.connected} />
          </div>

          <div>
            <h1 className="wordmark">
              <span className="wordmark-cipher" aria-hidden="true">
                7KQX-ZR2M
              </span>
              <span className="wordmark-clear">DECRYPTO</span>
            </h1>
            <p className="mt-3 text-[15px] leading-6 text-ink">
              Give clues your team can crack and the other team cannot.
            </p>
          </div>

          {!props.connected && (
            <Notice>Rooms need a live link. Searching for signal.</Notice>
          )}
          {props.error && (
            <Notice tone="red" onDismiss={props.onClearError}>
              {props.error}
            </Notice>
          )}

          <label className="block">
            <span className="eyebrow mb-1.5 block text-muted">Callsign</span>
            <input
              value={props.name}
              onChange={(event) => props.onNameChange(event.target.value)}
              className="field"
              placeholder="Your name at the table"
              maxLength={24}
              autoComplete="nickname"
              enterKeyHint="done"
            />
          </label>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              props.onJoin();
            }}
          >
            <label className="block">
              <span className="eyebrow mb-1.5 block text-muted">Have a room code?</span>
              <span className="grid grid-cols-[minmax(0,1fr)_104px] gap-2">
                <input
                  value={props.roomCode}
                  onChange={(event) =>
                    props.onRoomCodeChange(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
                  }
                  className="field text-center font-display !text-2xl uppercase tracking-[0.4em]"
                  placeholder="ABCD"
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                />
                <button
                  disabled={locked}
                  className={`btn ${props.roomCode.length === 4 ? 'btn-primary' : ''}`}
                >
                  Join
                </button>
              </span>
            </label>
          </form>

          <SectionRule>Or</SectionRule>

          <button
            onClick={props.onCreate}
            disabled={locked}
            className={`btn ${props.roomCode.length === 4 ? '' : 'btn-primary'}`}
          >
            Open a new room
          </button>

          <details className="group border-t border-rule pt-3">
            <summary className="eyebrow flex min-h-11 cursor-pointer list-none items-center justify-between text-muted [&::-webkit-details-marker]:hidden">
              Field manual
              <span aria-hidden="true" className="group-open:hidden">
                +
              </span>
              <span aria-hidden="true" className="hidden group-open:inline">
                –
              </span>
            </summary>
            <dl className="space-y-3 pb-2 pt-1 text-sm leading-6">
              {MANUAL.map(([term, detail]) => (
                <div key={term} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                  <dt className="eyebrow pt-1 text-phosphor">{term}</dt>
                  <dd className="text-muted">{detail}</dd>
                </div>
              ))}
            </dl>
          </details>

          {canPrompt && (
            <button onClick={() => void install()} className="btn">
              Install on this device
            </button>
          )}
          {showIosHint && (
            <p className="text-xs leading-5 text-dim">
              To install: Safari share button, then Add to Home Screen.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
