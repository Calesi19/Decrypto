import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Code,
  Digit,
  GameState,
  GuessDigit,
  GuessKind,
  GuessState,
  PlayerView,
  RoundReveal,
  TeamId,
} from '@decrypto/shared';

const TOKEN_KEY = 'decrypto-player-token';
const NAME_KEY = 'decrypto-player-name';
const ROOM_KEY = 'decrypto-room-code';
const TEAMS: TeamId[] = ['black', 'white'];
const DIGITS: Digit[] = [1, 2, 3, 4];

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

interface JoinResult {
  roomCode: string;
  playerId: string;
  playerToken: string;
  state: PlayerView;
}

interface StateResult {
  state: PlayerView;
}

function makeToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function storedToken(): string {
  const existing = window.localStorage.getItem(TOKEN_KEY);
  if (existing) return existing;
  const created = makeToken();
  window.localStorage.setItem(TOKEN_KEY, created);
  return created;
}

function teamName(team: TeamId): string {
  return team === 'black' ? 'Black' : 'White';
}

function otherTeam(team: TeamId): TeamId {
  return team === 'black' ? 'white' : 'black';
}

function formatCode(code: Code | readonly (number | null)[] | null | undefined): string {
  return code ? code.map((digit) => digit ?? '—').join(' – ') : '— — —';
}

function playerName(state: PlayerView, playerId: string | null | undefined): string {
  if (!playerId) return 'Unknown player';
  return state.players.find((player) => player.id === playerId)?.name ?? 'Unknown player';
}

export default function App() {
  const [socket] = useState<Socket>(() =>
    io({ autoConnect: true, transports: ['websocket', 'polling'] }),
  );
  const [connected, setConnected] = useState(socket.connected);
  const [gameState, setGameState] = useState<PlayerView | null>(null);
  const [name, setName] = useState(() => window.localStorage.getItem(NAME_KEY) ?? '');
  const [roomCodeInput, setRoomCodeInput] = useState(
    () => window.localStorage.getItem(ROOM_KEY) ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef<PlayerView | null>(null);
  const autoJoinAttempted = useRef(false);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const emitAck = useCallback(
    <T,>(event: string, payload: unknown): Promise<T> =>
      new Promise((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error('The server took too long to respond.')),
          10_000,
        );
        socket.emit(event, payload, (response: AckResponse<T>) => {
          window.clearTimeout(timeout);
          if (!response) reject(new Error('No response from the server.'));
          else if (response.ok) resolve(response.data);
          else reject(new Error(response.error));
        });
      }),
    [socket],
  );

  const rememberSession = useCallback((result: JoinResult) => {
    window.localStorage.setItem(TOKEN_KEY, result.playerToken);
    window.localStorage.setItem(ROOM_KEY, result.roomCode);
    setRoomCodeInput(result.roomCode);
    setGameState(result.state);
  }, []);

  const joinSavedRoom = useCallback(async () => {
    const savedRoom = window.localStorage.getItem(ROOM_KEY);
    const savedName = window.localStorage.getItem(NAME_KEY);
    if (!savedRoom || !savedName || stateRef.current) return;
    try {
      const result = await emitAck<JoinResult>('room:join', {
        roomCode: savedRoom,
        name: savedName,
        playerToken: storedToken(),
      });
      rememberSession(result);
    } catch {
      window.localStorage.removeItem(ROOM_KEY);
    }
  }, [emitAck, rememberSession]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (!autoJoinAttempted.current) {
        autoJoinAttempted.current = true;
        void joinSavedRoom();
      }
    };
    const onDisconnect = () => setConnected(false);
    const onState = (nextState: PlayerView) => {
      setGameState(nextState);
      window.localStorage.setItem(ROOM_KEY, nextState.roomCode);
    };
    const onConnectError = (connectError: Error) => {
      setConnected(false);
      setError(`Connection error: ${connectError.message}`);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game:state', onState);
    socket.on('connect_error', onConnectError);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game:state', onState);
      socket.off('connect_error', onConnectError);
    };
  }, [joinSavedRoom, socket]);

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const createRoom = () =>
    runAction(async () => {
      const cleanName = name.trim();
      if (!cleanName) throw new Error('Enter your name first.');
      window.localStorage.setItem(NAME_KEY, cleanName);
      const result = await emitAck<JoinResult>('room:create', {
        name: cleanName,
        playerToken: storedToken(),
      });
      rememberSession(result);
    });

  const joinRoom = () =>
    runAction(async () => {
      const cleanName = name.trim();
      const cleanRoom = roomCodeInput.trim().toUpperCase();
      if (!cleanName) throw new Error('Enter your name first.');
      if (!/^[A-Za-z]{4}$/.test(cleanRoom)) throw new Error('Enter a 4-letter room code.');
      window.localStorage.setItem(NAME_KEY, cleanName);
      const result = await emitAck<JoinResult>('room:join', {
        roomCode: cleanRoom,
        name: cleanName,
        playerToken: storedToken(),
      });
      rememberSession(result);
    });

  const chooseTeam = (team: TeamId | null) =>
    runAction(async () => {
      const result = await emitAck<StateResult>('game:chooseTeam', { team });
      setGameState(result.state);
    });

  const startGame = () =>
    runAction(async () => {
      const result = await emitAck<StateResult>('game:start', {});
      setGameState(result.state);
    });

  const submitClues = (clues: string[]) =>
    runAction(async () => {
      const result = await emitAck<StateResult>('game:submitClues', { clues });
      setGameState(result.state);
    });

  const updateGuess = (kind: GuessKind, draft: GuessDigit[]) =>
    runAction(async () => {
      const result = await emitAck<StateResult>('game:updateGuess', { kind, draft });
      setGameState(result.state);
    });

  const lockGuess = (kind: GuessKind) =>
    runAction(async () => {
      const result = await emitAck<StateResult>('game:lockGuess', { kind });
      setGameState(result.state);
    });

  const nextRound = () =>
    runAction(async () => {
      const result = await emitAck<StateResult>('game:nextRound', {});
      setGameState(result.state);
    });

  const leaveRoom = () =>
    runAction(async () => {
      await emitAck('room:leave', {});
      setGameState(null);
      window.localStorage.removeItem(ROOM_KEY);
    });

  if (!gameState) {
    return (
      <HomeScreen
        connected={connected}
        name={name}
        roomCode={roomCodeInput}
        error={error}
        busy={busy}
        onNameChange={(value) => {
          setName(value);
          window.localStorage.setItem(NAME_KEY, value);
        }}
        onRoomCodeChange={setRoomCodeInput}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <GameHeader state={gameState} connected={connected} onLeave={leaveRoom} busy={busy} />
      {error && <ErrorBanner message={error} />}

      {gameState.phase === 'lobby' ? (
        <Lobby state={gameState} busy={busy} onChooseTeam={chooseTeam} onStart={startGame} />
      ) : gameState.phase === 'gameover' ? (
        <GameOver state={gameState} />
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <KeywordPanel state={gameState} />
            <PhasePanel
              state={gameState}
              busy={busy}
              onSubmitClues={submitClues}
              onUpdateGuess={updateGuess}
              onLockGuess={lockGuess}
              onNextRound={nextRound}
            />
            <ClueHistoryBoard state={gameState} />
          </div>
          <aside className="space-y-4">
            <PlayersPanel state={gameState} />
            <RoundSummary state={gameState} />
          </aside>
        </div>
      )}

      {gameState.phase !== 'lobby' && gameState.phase !== 'gameover' && (
        <div className="mt-4 lg:hidden">
          <PlayersPanel state={gameState} />
        </div>
      )}
    </main>
  );
}

function HomeScreen(props: {
  connected: boolean;
  name: string;
  roomCode: string;
  error: string | null;
  busy: boolean;
  onNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-xl rounded-3xl border border-phosphor/25 bg-panel/95 p-6 shadow-glow sm:p-9">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-phosphor">Secure channel</p>
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
              props.connected
                ? 'border-phosphor/40 text-phosphor'
                : 'border-danger/50 text-danger'
            }`}
          >
            {props.connected ? 'Online' : 'Offline'}
          </span>
        </div>
        <h1 className="mt-4 font-mono text-5xl font-black uppercase tracking-tight text-white sm:text-6xl">
          Decrypto
        </h1>
        <p className="mt-4 leading-7 text-zinc-300">
          Give coded clues your team can crack and the other team cannot. Protect your four
          keywords, intercept their code, and avoid two miscommunications.
        </p>

        <label className="mt-7 block">
          <span className="mb-2 block font-mono text-xs uppercase tracking-[0.22em] text-zinc-400">
            Your name
          </span>
          <input
            value={props.name}
            onChange={(event) => props.onNameChange(event.target.value)}
            className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white placeholder:text-zinc-600"
            placeholder="e.g. Alex"
            maxLength={24}
            autoComplete="name"
          />
        </label>

        <button
          onClick={props.onCreate}
          disabled={props.busy}
          className="mt-5 w-full rounded-xl bg-phosphor px-5 py-3.5 font-mono font-bold uppercase tracking-widest text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create room
        </button>

        <div className="my-6 flex items-center gap-3 text-zinc-600">
          <span className="h-px flex-1 bg-white/10" />
          <span className="font-mono text-xs uppercase tracking-widest">or join</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="flex gap-3">
          <input
            value={props.roomCode}
            onChange={(event) =>
              props.onRoomCodeChange(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
            }
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-center font-mono text-xl uppercase tracking-[0.35em] text-white placeholder:text-zinc-700"
            placeholder="ABCD"
            maxLength={4}
            autoCapitalize="characters"
          />
          <button
            onClick={props.onJoin}
            disabled={props.busy}
            className="rounded-xl border border-cyber/50 px-5 py-3 font-mono font-bold uppercase tracking-widest text-cyber transition hover:bg-cyber/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join
          </button>
        </div>

        {props.error && <ErrorBanner message={props.error} />}
        <p className="mt-6 text-center text-sm text-zinc-500">
          Four to eight players works best. You need at least two people per team.
        </p>
      </section>
    </main>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-100">
      {message}
    </div>
  );
}

function GameHeader(props: {
  state: PlayerView;
  connected: boolean;
  busy: boolean;
  onLeave: () => void;
}) {
  const { state } = props;
  return (
    <header className="rounded-3xl border border-white/10 bg-panel/95 p-4 shadow-panel sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-phosphor">
            Decrypto terminal
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-black uppercase tracking-widest text-white">
              {state.roomCode}
            </h1>
            <span
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
                props.connected
                  ? 'border-phosphor/40 text-phosphor'
                  : 'border-danger/50 text-danger'
              }`}
            >
              {props.connected ? 'Connected' : 'Reconnecting'}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            {state.phase === 'lobby'
              ? 'Lobby'
              : `Round ${state.round} of ${state.maxRounds} · ${phaseLabel(state.phase)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TokenBadge team="black" state={state} />
          <TokenBadge team="white" state={state} />
          <button
            onClick={props.onLeave}
            disabled={props.busy}
            className="rounded-lg border border-white/15 px-3 py-2 font-mono text-xs uppercase tracking-wider text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            Leave
          </button>
        </div>
      </div>
    </header>
  );
}

function TokenBadge({ team, state }: { team: TeamId; state: PlayerView }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 font-mono text-xs ${
        team === 'black'
          ? 'border-white/25 bg-black text-white'
          : 'border-zinc-200 bg-zinc-100 text-zinc-950'
      }`}
    >
      <span className="mr-2 font-bold uppercase">{teamName(team)}</span>
      <span>Intercept {state.interceptionTokens[team]}/2</span>
      <span className="mx-1 opacity-40">·</span>
      <span>Miss {state.miscommunicationTokens[team]}/2</span>
    </div>
  );
}

function phaseLabel(phase: PlayerView['phase']): string {
  switch (phase) {
    case 'encode':
      return 'Write clues';
    case 'intercept':
      return 'Intercept their code';
    case 'decode':
      return 'Decode your code';
    case 'reveal':
      return 'Round reveal';
    case 'gameover':
      return 'Game over';
    default:
      return 'Lobby';
  }
}

function Lobby(props: {
  state: PlayerView;
  busy: boolean;
  onChooseTeam: (team: TeamId | null) => void;
  onStart: () => void;
}) {
  const { state } = props;
  const counts = useMemo(
    () => ({
      black: state.players.filter((player) => player.team === 'black').length,
      white: state.players.filter((player) => player.team === 'white').length,
      unassigned: state.players.filter((player) => !player.team).length,
    }),
    [state.players],
  );
  const canStart =
    counts.black >= 2 && counts.white >= 2 && counts.unassigned === 0 && state.isHost;

  return (
    <section className="mt-4 rounded-3xl border border-white/10 bg-panel/95 p-5 shadow-panel sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Choose your side</h2>
          <p className="mt-1 text-zinc-400">
            Share room code <span className="font-mono font-bold text-phosphor">{state.roomCode}</span>{' '}
            with your group. Everyone must pick a team before the host can start.
          </p>
        </div>
        {state.isHost ? (
          <button
            onClick={props.onStart}
            disabled={!canStart || props.busy}
            className="rounded-xl bg-phosphor px-5 py-3 font-mono font-bold uppercase tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start game
          </button>
        ) : (
          <p className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400">
            Waiting for {playerName(state, state.players.find((player) => player.isHost)?.id)} to
            start
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {TEAMS.map((team) => (
          <TeamLobbyCard
            key={team}
            team={team}
            state={state}
            busy={props.busy}
            onChooseTeam={props.onChooseTeam}
          />
        ))}
      </div>

      {counts.unassigned > 0 && (
        <div className="mt-4 rounded-xl border border-amberish/30 bg-amberish/10 px-4 py-3 text-sm text-amber-100">
          Still choosing: {state.players.filter((player) => !player.team).map((p) => p.name).join(', ')}
        </div>
      )}
      {(counts.black < 2 || counts.white < 2) && (
        <p className="mt-3 text-sm text-zinc-500">Each team needs at least two players.</p>
      )}
    </section>
  );
}

function TeamLobbyCard(props: {
  team: TeamId;
  state: PlayerView;
  busy: boolean;
  onChooseTeam: (team: TeamId | null) => void;
}) {
  const members = props.state.players.filter((player) => player.team === props.team);
  const selected = props.state.viewer.team === props.team;
  return (
    <article
      className={`rounded-2xl border p-5 ${
        props.team === 'black'
          ? 'border-white/25 bg-zinc-950 text-white'
          : 'border-zinc-200 bg-zinc-100 text-zinc-950'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-xl font-black uppercase tracking-widest">
          {teamName(props.team)} team
        </h3>
        <span className="font-mono text-sm opacity-60">{members.length} players</span>
      </div>
      <ul className="mt-4 space-y-2">
        {members.length ? (
          members.map((player) => (
            <li key={player.id} className="flex items-center justify-between gap-2">
              <span>{player.name}</span>
              <span className="flex gap-1.5">
                {player.isHost && <MiniTag>Host</MiniTag>}
                {player.id === props.state.viewer.id && <MiniTag>You</MiniTag>}
                {!player.connected && <MiniTag>Offline</MiniTag>}
              </span>
            </li>
          ))
        ) : (
          <li className="opacity-60">No players yet</li>
        )}
      </ul>
      <button
        onClick={() => props.onChooseTeam(selected ? null : props.team)}
        disabled={props.busy}
        className={`mt-5 w-full rounded-xl px-4 py-3 font-mono font-bold uppercase tracking-widest disabled:opacity-50 ${
          props.team === 'black'
            ? 'bg-white text-black hover:bg-zinc-200'
            : 'bg-black text-white hover:bg-zinc-800'
        }`}
      >
        {selected ? 'Leave team' : `Join ${teamName(props.team)}`}
      </button>
    </article>
  );
}

function MiniTag({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-current px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider opacity-70">
      {children}
    </span>
  );
}

function KeywordPanel({ state }: { state: PlayerView }) {
  const team = state.viewer.team;
  if (!team) return null;
  const words = state.keywords[team] ?? [];
  const encoderId = state.encoders[team];
  return (
    <section
      className={`rounded-3xl border p-5 shadow-panel ${
        team === 'black'
          ? 'border-white/25 bg-zinc-950 text-white'
          : 'border-zinc-100 bg-zinc-100 text-zinc-950'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-sm font-bold uppercase tracking-[0.25em]">
          {teamName(team)} keywords · private
        </h2>
        <p className="text-sm opacity-70">
          Encoder: {playerName(state, encoderId)} {encoderId === state.viewer.id ? '(you)' : ''}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {words.map((word, index) => (
          <div key={`${word}-${index}`} className="rounded-2xl border border-current/20 bg-black/5 p-3">
            <div className="font-mono text-xs opacity-60">#{index + 1}</div>
            <div className="mt-1 break-words font-mono text-lg font-black uppercase tracking-wide">
              {word}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PhasePanel(props: {
  state: PlayerView;
  busy: boolean;
  onSubmitClues: (clues: string[]) => void;
  onUpdateGuess: (kind: GuessKind, draft: GuessDigit[]) => void;
  onLockGuess: (kind: GuessKind) => void;
  onNextRound: () => void;
}) {
  const { state } = props;
  const team = state.viewer.team;
  if (!team) {
    return (
      <Panel title="No team">
        <p className="text-zinc-400">You are not on a team in this game.</p>
      </Panel>
    );
  }

  if (state.phase === 'encode') {
    const isEncoder = state.encoders[team] === state.viewer.id;
    const ownSubmitted = !!state.submittedClues[team];
    return (
      <Panel
        title="Encode phase"
        subtitle="Both Encoders write at the same time. Submitted clues become public immediately."
      >
        {isEncoder && !ownSubmitted ? (
          <EncodeForm
            key={`${state.roomCode}-${state.round}-${team}`}
            state={state}
            busy={props.busy}
            onSubmit={props.onSubmitClues}
          />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="font-semibold text-white">
              {ownSubmitted
                ? 'Your team clues are public.'
                : `${playerName(state, state.encoders[team])} is writing your team's clues.`}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {state.submittedClues[otherTeam(team)]
                ? 'The other team has submitted. The phase moves when both sets are in.'
                : 'Waiting for the opposing Encoder too.'}
            </p>
          </div>
        )}
        <SubmittedClues state={state} />
      </Panel>
    );
  }

  if (state.phase === 'intercept') {
    const opponent = otherTeam(team);
    return (
      <Panel
        title="Intercept phase"
        subtitle={`Crack the ${teamName(opponent)} code from their clues and the history board.`}
      >
        <CurrentClues team={opponent} state={state} heading={`${teamName(opponent)} clues`} />
        <GuessEditor
          title={`Your interception guess: ${teamName(opponent)} code`}
          description="Anyone on your team can edit this shared draft or lock it in, including your Encoder."
          guess={state.yourInterceptGuess}
          state={state}
          disabled={false}
          busy={props.busy}
          onUpdate={(draft) => props.onUpdateGuess('intercept', draft)}
          onLock={() => props.onLockGuess('intercept')}
        />
        <LockStatus state={state} kind="intercept" />
      </Panel>
    );
  }

  if (state.phase === 'decode') {
    const isEncoder = state.encoders[team] === state.viewer.id;
    return (
      <Panel
        title="Decode phase"
        subtitle="Your team now identifies its own code. The Encoder must stay silent and cannot edit or lock this guess."
      >
        <CurrentClues team={team} state={state} heading={`Your ${teamName(team)} clues`} />
        <GuessEditor
          title="Your decode guess"
          description={
            isEncoder
              ? 'You are the Encoder, so this draft is read-only for you.'
              : 'Anyone on your team except the Encoder can edit or lock in the shared draft.'
          }
          guess={state.yourDecodeGuess}
          state={state}
          disabled={isEncoder}
          busy={props.busy}
          onUpdate={(draft) => props.onUpdateGuess('decode', draft)}
          onLock={() => props.onLockGuess('decode')}
        />
        <LockStatus state={state} kind="decode" />
      </Panel>
    );
  }

  if (state.phase === 'reveal') {
    return (
      <Panel title="Round reveal" subtitle="Codes are now public and the clues have entered the permanent history.">
        {state.lastReveal ? <RevealDetails reveal={state.lastReveal} /> : null}
        {state.isHost ? (
          <button
            onClick={props.onNextRound}
            disabled={props.busy}
            className="mt-5 w-full rounded-xl bg-phosphor px-5 py-3 font-mono font-bold uppercase tracking-widest text-black disabled:opacity-50"
          >
            Start round {state.round + 1}
          </button>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">Waiting for the host to start the next round.</p>
        )}
      </Panel>
    );
  }

  return null;
}

function Panel(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-panel/95 p-5 shadow-panel">
      <h2 className="text-xl font-bold text-white">{props.title}</h2>
      {props.subtitle && <p className="mt-1 text-sm leading-6 text-zinc-400">{props.subtitle}</p>}
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function EncodeForm(props: {
  state: PlayerView;
  busy: boolean;
  onSubmit: (clues: string[]) => void;
}) {
  const [clues, setClues] = useState<string[]>(['', '', '']);
  const team = props.state.viewer.team;
  if (!team || !props.state.currentCode) return null;
  const keywords = props.state.keywords[team] ?? [];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(clues);
      }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">Your secret code</span>
        {props.state.currentCode.map((digit, index) => (
          <span
            key={index}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-phosphor/50 bg-phosphor/10 font-mono text-xl font-black text-phosphor"
          >
            {digit}
          </span>
        ))}
      </div>
      {props.state.currentCode.map((digit, index) => (
        <label key={index} className="block">
          <span className="mb-1.5 block text-sm text-zinc-300">
            Clue {index + 1} for keyword #{digit}
            <span className="text-zinc-500"> ({keywords[digit - 1]})</span>
          </span>
          <input
            value={clues[index]}
            onChange={(event) => {
              const next = [...clues];
              next[index] = event.target.value;
              setClues(next);
            }}
            className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-white placeholder:text-zinc-600"
            placeholder="Write one clue"
            maxLength={48}
            required
          />
        </label>
      ))}
      <p className="text-xs text-zinc-500">A clue cannot exactly match any of your four keywords.</p>
      <button
        disabled={props.busy || clues.some((clue) => !clue.trim())}
        className="w-full rounded-xl bg-phosphor px-5 py-3 font-mono font-bold uppercase tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        Submit clues
      </button>
    </form>
  );
}

function SubmittedClues({ state }: { state: PlayerView }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {TEAMS.map((team) => (
        <CurrentClues key={team} team={team} state={state} heading={`${teamName(team)} clues`} compact />
      ))}
    </div>
  );
}

function CurrentClues(props: {
  team: TeamId;
  state: PlayerView;
  heading: string;
  compact?: boolean;
}) {
  const clues = props.state.submittedClues[props.team];
  return (
    <article
      className={`rounded-2xl border p-4 ${
        props.team === 'black'
          ? 'border-white/20 bg-zinc-950 text-white'
          : 'border-zinc-200 bg-zinc-100 text-zinc-950'
      } ${props.compact ? '' : 'mb-4'}`}
    >
      <h3 className="font-mono text-xs font-bold uppercase tracking-[0.22em]">{props.heading}</h3>
      {clues ? (
        <ol className="mt-3 space-y-2">
          {clues.map((clue, index) => (
            <li key={index} className="flex gap-3">
              <span className="font-mono opacity-50">{index + 1}.</span>
              <span className="font-semibold">{clue}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm opacity-60">Not submitted yet.</p>
      )}
    </article>
  );
}

function GuessEditor(props: {
  title: string;
  description: string;
  guess: GuessState | null;
  state: PlayerView;
  disabled: boolean;
  busy: boolean;
  onUpdate: (draft: GuessDigit[]) => void;
  onLock: () => void;
}) {
  if (!props.guess) return null;
  const guess = props.guess;
  const complete = guess.draft.every((digit) => digit !== null);
  const readOnly = props.disabled || guess.locked || props.busy;

  const choose = (position: number, digit: Digit | null) => {
    const next = [...guess.draft] as GuessDigit[];
    next[position] = digit;
    props.onUpdate(next);
  };

  return (
    <section className="rounded-2xl border border-phosphor/25 bg-black/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-white">{props.title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{props.description}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
            guess.locked
              ? 'border-phosphor/50 text-phosphor'
              : 'border-white/15 text-zinc-400'
          }`}
        >
          {guess.locked ? `Locked by ${playerName(props.state, guess.lockedBy)}` : 'Draft'}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {guess.draft.map((selected, position) => (
          <div key={position} className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-mono text-xs uppercase tracking-wider text-zinc-500">
              Position {position + 1}
            </span>
            {DIGITS.map((digit) => {
              const usedElsewhere = guess.draft.some(
                (candidate, candidatePosition) =>
                  candidatePosition !== position && candidate === digit,
              );
              const active = selected === digit;
              return (
                <button
                  key={digit}
                  onClick={() => choose(position, digit)}
                  disabled={readOnly || usedElsewhere}
                  className={`h-11 w-11 rounded-xl border font-mono text-lg font-black disabled:cursor-not-allowed disabled:opacity-30 ${
                    active
                      ? 'border-phosphor bg-phosphor text-black'
                      : 'border-white/15 bg-white/5 text-white hover:border-phosphor/50'
                  }`}
                >
                  {digit}
                </button>
              );
            })}
            <button
              onClick={() => choose(position, null)}
              disabled={readOnly || selected === null}
              className="h-11 rounded-xl border border-white/10 px-3 font-mono text-xs uppercase tracking-wider text-zinc-400 disabled:opacity-30"
            >
              Clear
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-sm text-zinc-400">
          Draft: <span className="text-white">{formatCode(guess.draft)}</span>
          {guess.updatedBy && (
            <span> · last edited by {playerName(props.state, guess.updatedBy)}</span>
          )}
        </p>
        <button
          onClick={props.onLock}
          disabled={readOnly || !complete}
          className="rounded-xl bg-cyber px-5 py-3 font-mono font-bold uppercase tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          Lock in guess
        </button>
      </div>
      {props.disabled && (
        <p className="mt-3 text-sm text-amber-100">The Encoder cannot edit or lock this guess.</p>
      )}
    </section>
  );
}

function LockStatus({ state, kind }: { state: PlayerView; kind: GuessKind }) {
  const team = state.viewer.team;
  if (!team) return null;
  const own =
    kind === 'intercept' ? state.yourInterceptGuess : state.yourDecodeGuess;
  const opponentLocked = state.opponentGuessStatus?.[kind].locked;
  return (
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-zinc-300">
        Your team: {own?.locked ? 'locked in' : 'still deciding'}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-zinc-300">
        Opponents: {opponentLocked ? 'locked in' : 'still deciding'}
      </div>
    </div>
  );
}

function RevealDetails({ reveal }: { reveal: RoundReveal }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {TEAMS.map((team) => {
        const entry = reveal.teams[team];
        const opponent = otherTeam(team);
        return (
          <article
            key={team}
            className={`rounded-2xl border p-4 ${
              team === 'black'
                ? 'border-white/20 bg-zinc-950 text-white'
                : 'border-zinc-200 bg-zinc-100 text-zinc-950'
            }`}
          >
            <h3 className="font-mono font-black uppercase tracking-widest">{teamName(team)} code</h3>
            <p className="mt-3 font-mono text-3xl font-black">{formatCode(entry.code)}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Own guess</dt>
                <dd className="font-mono font-bold">{formatCode(entry.ownGuess)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Decode result</dt>
                <dd>{entry.ownGuessCorrect ? 'Correct' : 'Miscommunication token'}</dd>
              </div>
              {entry.opponentGuess && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="opacity-60">{teamName(opponent)} intercept guess</dt>
                    <dd className="font-mono font-bold">{formatCode(entry.opponentGuess)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="opacity-60">Interception</dt>
                    <dd>{entry.interceptedByOpponent ? `${teamName(opponent)} token` : 'Failed'}</dd>
                  </div>
                </>
              )}
            </dl>
            <p className="mt-4 text-sm opacity-75">Clues: {entry.clues.join(' · ')}</p>
          </article>
        );
      })}
    </div>
  );
}

function ClueHistoryBoard({ state }: { state: PlayerView }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-panel/95 p-5 shadow-panel">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">Clue history</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Public clues from completed rounds, grouped under the keyword each clue described.
          </p>
        </div>
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          {state.roundHistory.length} rounds revealed
        </span>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {TEAMS.map((team) => (
          <article
            key={team}
            className={`rounded-2xl border p-4 ${
              team === 'black'
                ? 'border-white/20 bg-zinc-950 text-white'
                : 'border-zinc-200 bg-zinc-100 text-zinc-950'
            }`}
          >
            <h3 className="font-mono font-black uppercase tracking-widest">{teamName(team)}</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
              {DIGITS.map((digit) => {
                const keyword = state.keywords[team]?.[digit - 1];
                const clues = state.clueHistory[team][digit];
                return (
                  <div key={digit} className="min-w-0 rounded-xl border border-current/15 p-3">
                    <p className="font-mono text-xs opacity-60">#{digit}</p>
                    <p className="mt-1 break-words font-mono text-sm font-black uppercase">
                      {keyword ?? 'Hidden'}
                    </p>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {clues.length ? (
                        clues.map((clue, index) => <li key={`${clue}-${index}`}>{clue}</li>)
                      ) : (
                        <li className="opacity-45">No clues yet</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlayersPanel({ state }: { state: PlayerView }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-panel/95 p-5 shadow-panel">
      <h2 className="text-lg font-bold text-white">Players</h2>
      <div className="mt-4 space-y-4">
        {TEAMS.map((team) => (
          <div key={team}>
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">
              {teamName(team)}
            </h3>
            <ul className="mt-2 space-y-2">
              {state.players
                .filter((player) => player.team === team)
                .map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
                  >
                    <span className={player.connected ? 'text-zinc-100' : 'text-zinc-500'}>
                      {player.name} {player.id === state.viewer.id && '(you)'}
                    </span>
                    <span className="flex gap-1.5">
                      {player.isEncoder && <MiniTag>Encoder</MiniTag>}
                      {player.isHost && <MiniTag>Host</MiniTag>}
                      {!player.connected && <MiniTag>Offline</MiniTag>}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function RoundSummary({ state }: { state: PlayerView }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-panel/95 p-5 shadow-panel">
      <h2 className="text-lg font-bold text-white">Game summary</h2>
      {state.roundHistory.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No rounds have been revealed yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {state.roundHistory.map((reveal) => (
            <article key={reveal.round} className="rounded-2xl bg-white/5 p-3 text-sm">
              <h3 className="font-mono font-bold text-white">Round {reveal.round}</h3>
              <p className="mt-1 text-zinc-400">
                Black code {formatCode(reveal.teams.black.code)} · White code{' '}
                {formatCode(reveal.teams.white.code)}
              </p>
              <p className="mt-1 text-zinc-500">
                Intercept tokens:{' '}
                {reveal.interceptionTokensAwarded.length
                  ? reveal.interceptionTokensAwarded.map(teamName).join(', ')
                  : 'none'}
                {' · '}Miscommunications:{' '}
                {reveal.miscommunicationTokensAwarded.length
                  ? reveal.miscommunicationTokensAwarded.map(teamName).join(', ')
                  : 'none'}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function GameOver({ state }: { state: PlayerView }) {
  const winnerText =
    state.winner === 'draw'
      ? 'Draw game'
      : state.winner
        ? `${teamName(state.winner)} team wins`
        : 'Game over';
  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-3xl border border-phosphor/30 bg-panel/95 p-6 text-center shadow-glow sm:p-9">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-phosphor">Transmission closed</p>
        <h2 className="mt-3 text-4xl font-black text-white sm:text-5xl">{winnerText}</h2>
        {state.endReason && <p className="mx-auto mt-3 max-w-2xl text-zinc-400">{state.endReason}</p>}
        <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
          {TEAMS.map((team) => (
            <div
              key={team}
              className={`rounded-2xl border p-4 ${
                team === 'black'
                  ? 'border-white/25 bg-black text-white'
                  : 'border-zinc-200 bg-zinc-100 text-zinc-950'
              }`}
            >
              <h3 className="font-mono font-black uppercase tracking-widest">{teamName(team)} keywords</h3>
              <ol className="mt-3 space-y-1 font-mono">
                {(state.keywords[team] ?? []).map((word, index) => (
                  <li key={word}>
                    {index + 1}. {word}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm opacity-70">
                Interceptions {state.interceptionTokens[team]} · Miscommunications{' '}
                {state.miscommunicationTokens[team]}
              </p>
            </div>
          ))}
        </div>
      </section>
      {state.lastReveal && (
        <Panel title="Final round">
          <RevealDetails reveal={state.lastReveal} />
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ClueHistoryBoard state={state} />
        <RoundSummary state={state} />
      </div>
    </div>
  );
}

// Referenced by the shared state type in tests of the public protocol; keeping
// the type import explicit makes accidental client-side use of server state
// easier to spot during review.
export type { GameState };
