import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GuessDigit, GuessKind, PlayerView, TeamId } from '@decrypto/shared';

const TOKEN_KEY = 'decrypto-player-token';
const NAME_KEY = 'decrypto-player-name';
const ROOM_KEY = 'decrypto-room-code';

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

// The server answered "no", as opposed to the signal dropping before it could answer.
class ServerRefusal extends Error {}

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

function roomFromLink(): string | null {
  const room = new URLSearchParams(window.location.search).get('room');
  const clean = room?.trim().toUpperCase() ?? '';
  return /^[A-Z]{4}$/.test(clean) ? clean : null;
}

export function useGameSession() {
  const [socket] = useState<Socket>(() =>
    io({ autoConnect: true, transports: ['websocket', 'polling'] }),
  );
  const [connected, setConnected] = useState(socket.connected);
  const [gameState, setGameState] = useState<PlayerView | null>(null);
  const [name, setNameValue] = useState(() => window.localStorage.getItem(NAME_KEY) ?? '');
  const [roomCode, setRoomCode] = useState(() => {
    const linked = roomFromLink();
    if (linked) {
      if (linked !== window.localStorage.getItem(ROOM_KEY)) window.localStorage.removeItem(ROOM_KEY);
      window.history.replaceState(null, '', window.location.pathname);
      return linked;
    }
    return window.localStorage.getItem(ROOM_KEY) ?? '';
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef<PlayerView | null>(null);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const emitAck = useCallback(
    <T,>(event: string, payload: unknown): Promise<T> =>
      new Promise((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error('No answer from the server. Check your signal.')),
          10_000,
        );
        socket.emit(event, payload, (response: AckResponse<T>) => {
          window.clearTimeout(timeout);
          if (!response) reject(new Error('No response from the server.'));
          else if (response.ok) resolve(response.data);
          else reject(new ServerRefusal(response.error));
        });
      }),
    [socket],
  );

  const rememberSession = useCallback((result: JoinResult) => {
    window.localStorage.setItem(TOKEN_KEY, result.playerToken);
    window.localStorage.setItem(ROOM_KEY, result.roomCode);
    setRoomCode(result.roomCode);
    setGameState(result.state);
  }, []);

  // Runs on every connect, not just the first: phones drop the socket whenever the
  // app is backgrounded, and the new socket has to re-attach to its seat.
  const rejoinSavedRoom = useCallback(async () => {
    const savedRoom = window.localStorage.getItem(ROOM_KEY);
    const savedName = window.localStorage.getItem(NAME_KEY);
    if (!savedRoom || !savedName) return;
    try {
      const result = await emitAck<JoinResult>('room:join', {
        roomCode: savedRoom,
        name: savedName,
        playerToken: storedToken(),
      });
      rememberSession(result);
    } catch (rejoinError) {
      if (!(rejoinError instanceof ServerRefusal)) return;
      window.localStorage.removeItem(ROOM_KEY);
      setGameState(null);
      if (stateRef.current) setError('That room has closed.');
    }
  }, [emitAck, rememberSession]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      void rejoinSavedRoom();
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setConnected(false);
    const onState = (nextState: PlayerView) => {
      setGameState(nextState);
      window.localStorage.setItem(ROOM_KEY, nextState.roomCode);
    };
    const onWake = () => {
      if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game:state', onState);
    socket.on('connect_error', onConnectError);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game:state', onState);
      socket.off('connect_error', onConnectError);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [rejoinSavedRoom, socket]);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, []);

  const stateAction = (event: string, payload: unknown = {}) =>
    runAction(async () => {
      const result = await emitAck<StateResult>(event, payload);
      setGameState(result.state);
    });

  const setName = (value: string) => {
    setNameValue(value);
    window.localStorage.setItem(NAME_KEY, value);
  };

  const enter = (event: 'room:create' | 'room:join', payload: object) =>
    runAction(async () => {
      const cleanName = name.trim();
      if (!cleanName) throw new Error('Enter a callsign first.');
      window.localStorage.setItem(NAME_KEY, cleanName);
      const result = await emitAck<JoinResult>(event, {
        ...payload,
        name: cleanName,
        playerToken: storedToken(),
      });
      rememberSession(result);
    });

  const actions = {
    createRoom: () => enter('room:create', {}),
    joinRoom: () => {
      const cleanRoom = roomCode.trim().toUpperCase();
      if (!/^[A-Za-z]{4}$/.test(cleanRoom)) {
        setError('Room codes are 4 letters.');
        return;
      }
      void enter('room:join', { roomCode: cleanRoom });
    },
    chooseTeam: (team: TeamId | null) => stateAction('game:chooseTeam', { team }),
    startGame: () => stateAction('game:start'),
    submitClues: (clues: string[]) => stateAction('game:submitClues', { clues }),
    // Guess taps are optimistic, so they skip `busy` and leave the keypad live between taps.
    updateGuess: async (kind: GuessKind, draft: GuessDigit[]) => {
      try {
        const result = await emitAck<StateResult>('game:updateGuess', { kind, draft });
        setGameState(result.state);
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Something went wrong.');
      }
    },
    lockGuess: (kind: GuessKind) => stateAction('game:lockGuess', { kind }),
    nextRound: () => stateAction('game:nextRound'),
    leaveRoom: () =>
      runAction(async () => {
        await emitAck('room:leave', {});
        setGameState(null);
        window.localStorage.removeItem(ROOM_KEY);
      }),
  };

  return {
    connected,
    gameState,
    name,
    setName,
    roomCode,
    setRoomCode,
    error,
    clearError: () => setError(null),
    busy,
    actions,
  };
}
