import { Notice } from '../components/Bits';
import { Lamp, Wheels } from '../components/Hardware';
import { useInstall } from '../lib/pwa';

const MANUAL = [
  ['Teams', 'Two teams, two or more players each. Your team shares four secret keywords, numbered 1 to 4, for the whole game.'],
  ['Encrypt', 'Each round one Encryptor gets a three-digit code such as 3-1-4 and writes one clue per digit.'],
  ['Intercept', 'From round 2, each team tries to crack the other team’s code from every clue given so far.'],
  ['Decode', 'Then your team decodes its own clues. The Encryptor stays silent.'],
  ['Win', 'Two intercepts win. Two misreads lose. Eight rounds at most.'],
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
  const hasCode = props.roomCode.length === 4;

  return (
    <div className="shell shell-plain">
      <main
        id="main"
        className="scroller gutter pb-[calc(24px+var(--safe-bottom))] pt-[calc(12px+var(--safe-top))]"
      >
        <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col gap-4 py-4">
          <section className="terminal home-unit">
            <div className="flex items-center justify-between gap-3">
              <Wheels code={[3, 1, 4]} />
              <span className="terminal-vents" aria-hidden="true" />
              <Lamp on={props.connected} />
              <span className="sr-only" role="status">
                {props.connected ? 'Link up' : 'No signal'}
              </span>
            </div>
            <h1 className="stencil wordmark">Decrypto</h1>
            <p className="home-screen">
              Give clues your team can crack and the other team cannot.
            </p>
          </section>

          {!props.connected && <Notice>Rooms need a live link. Searching for signal.</Notice>}
          {props.error && (
            <Notice tone="paper" onDismiss={props.onClearError}>
              {props.error}
            </Notice>
          )}

          <label className="block">
            <span className="hw-label">Your name</span>
            <input
              value={props.name}
              onChange={(event) => props.onNameChange(event.target.value)}
              className="hw-field"
              maxLength={24}
              autoComplete="nickname"
              enterKeyHint="done"
            />
          </label>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              props.onJoin();
            }}
          >
            <label className="block">
              <span className="hw-label">Room code</span>
              <span className="grid grid-cols-[minmax(0,1fr)_112px] items-start gap-3">
                <input
                  value={props.roomCode}
                  onChange={(event) =>
                    props.onRoomCodeChange(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
                  }
                  className="hw-field text-center uppercase tracking-[0.3em]"
                  placeholder="ABCD"
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                />
                <button disabled={locked} className={`hw-btn ${hasCode ? '' : 'hw-btn-plain'}`}>
                  Join
                </button>
              </span>
            </label>
          </form>

          <button
            onClick={props.onCreate}
            disabled={locked}
            className={`hw-btn ${hasCode ? 'hw-btn-plain' : ''}`}
          >
            Open a new room
          </button>

          <details className="manual">
            <summary className="stencil">How to play</summary>
            <dl className="space-y-2 pb-3">
              {MANUAL.map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-semibold">{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </details>

          {canPrompt && (
            <button onClick={() => void install()} className="hw-btn hw-btn-plain">
              Install on this device
            </button>
          )}
          {showIosHint && <p>To install: Safari share button, then Add to Home Screen.</p>}
        </div>
      </main>
    </div>
  );
}
