import cors from 'cors';
import express from 'express';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import {
  addPlayer,
  advanceToNextRound,
  buildPlayerView,
  chooseTeam,
  createGame,
  lockGuess,
  setPlayerConnected,
  startGame,
  submitClues,
  updateGuess,
  type GameState,
  type GuessKind,
  type PlayerView,
  type TeamId,
} from '@decrypto/shared';

const PORT = Number(process.env.PORT ?? 3001);
const ROOM_IDLE_LIMIT_MS = 60 * 60 * 1000;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

interface RoomRecord {
  state: GameState;
  playerTokens: Map<string, string>;
  lastActivityAt: number;
}

type Ack<T = unknown> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

interface SessionData {
  roomCode?: string;
  playerId?: string;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'decrypto-server', rooms: rooms.size });
});

// In production the server also serves the built client, so the whole game
// deploys as a single service. Local dev is unaffected: client/dist does not
// exist there, and the Vite dev server proxies /socket.io to this server.
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/dist',
);
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/socket.io')) {
      response.sendFile(path.join(clientDist, 'index.html'));
    } else {
      next();
    }
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

const rooms = new Map<string, RoomRecord>();

function generateRoomCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () =>
      ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
    ).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a player name.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 24) throw new Error('Names must be between 1 and 24 characters.');
  return name;
}

function cleanRoomCode(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a room code.');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) throw new Error('Room codes are 4 letters.');
  return code;
}

function cleanPlayerToken(value: unknown): string {
  if (typeof value === 'string' && value.trim().length >= 8 && value.trim().length <= 128) {
    return value.trim();
  }
  return randomUUID();
}

function getRoom(roomCode: string): RoomRecord {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found. It may have expired.');
  return room;
}

function touch(room: RoomRecord): void {
  room.lastActivityAt = Date.now();
}

async function broadcastRoom(roomCode: string): Promise<void> {
  const room = rooms.get(roomCode);
  if (!room) return;
  const sockets = await io.in(roomCode).fetchSockets();
  for (const remoteSocket of sockets) {
    const playerId = (remoteSocket.data as SessionData).playerId;
    if (!playerId) continue;
    try {
      const view: PlayerView = buildPlayerView(room.state, playerId);
      remoteSocket.emit('game:state', view);
    } catch {
      // A socket can outlive a removed player during lobby cleanup.
    }
  }
}

function viewFor(room: RoomRecord, playerId: string): PlayerView {
  return buildPlayerView(room.state, playerId);
}

function requireSession(socket: Socket): { room: RoomRecord; roomCode: string; playerId: string } {
  const data = socket.data as SessionData;
  if (!data.roomCode || !data.playerId) throw new Error('Join a room first.');
  return { room: getRoom(data.roomCode), roomCode: data.roomCode, playerId: data.playerId };
}

async function attachToRoom(
  socket: Socket,
  room: RoomRecord,
  playerId: string,
): Promise<PlayerView> {
  const previousRoom = (socket.data as SessionData).roomCode;
  if (previousRoom && previousRoom !== room.state.roomCode) await socket.leave(previousRoom);
  socket.data = { roomCode: room.state.roomCode, playerId } satisfies SessionData;
  await socket.join(room.state.roomCode);
  touch(room);
  return viewFor(room, playerId);
}

function respondError<T>(ack: Ack<T> | undefined, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  ack?.({ ok: false, error: message });
}

function respondOk<T>(ack: Ack<T> | undefined, data: T): void {
  ack?.({ ok: true, data });
}

io.on('connection', (socket) => {
  socket.on(
    'room:create',
    async (payload: { name?: unknown; playerToken?: unknown } = {}, ack?: Ack) => {
      try {
        const name = cleanName(payload.name);
        const playerToken = cleanPlayerToken(payload.playerToken);
        const playerId = randomUUID();
        const roomCode = generateRoomCode();
        const room: RoomRecord = {
          state: createGame(roomCode, { id: playerId, name }),
          playerTokens: new Map([[playerToken, playerId]]),
          lastActivityAt: Date.now(),
        };
        rooms.set(roomCode, room);
        const state = await attachToRoom(socket, room, playerId);
        await broadcastRoom(roomCode);
        respondOk(ack, { roomCode, playerId, playerToken, state });
      } catch (error) {
        respondError(ack, error);
      }
    },
  );

  socket.on(
    'room:join',
    async (
      payload: { roomCode?: unknown; name?: unknown; playerToken?: unknown } = {},
      ack?: Ack,
    ) => {
      try {
        const roomCode = cleanRoomCode(payload.roomCode);
        const room = getRoom(roomCode);
        const name = cleanName(payload.name);
        const playerToken = cleanPlayerToken(payload.playerToken);
        let playerId = room.playerTokens.get(playerToken);

        if (playerId) {
          addPlayer(room.state, { id: playerId, name });
        } else {
          if (room.state.phase !== 'lobby') {
            throw new Error('This game has already started, so new players cannot join.');
          }
          playerId = randomUUID();
          room.playerTokens.set(playerToken, playerId);
          addPlayer(room.state, { id: playerId, name });
        }

        const state = await attachToRoom(socket, room, playerId);
        await broadcastRoom(roomCode);
        respondOk(ack, { roomCode, playerId, playerToken, state });
      } catch (error) {
        respondError(ack, error);
      }
    },
  );

  socket.on('game:chooseTeam', async (payload: { team?: TeamId | null } = {}, ack?: Ack) => {
    try {
      const { room, roomCode, playerId } = requireSession(socket);
      if (payload.team !== null && payload.team !== 'black' && payload.team !== 'white') {
        throw new Error('Choose Black, White, or no team.');
      }
      chooseTeam(room.state, playerId, payload.team ?? null);
      touch(room);
      const state = viewFor(room, playerId);
      await broadcastRoom(roomCode);
      respondOk(ack, { state });
    } catch (error) {
      respondError(ack, error);
    }
  });

  socket.on('game:start', async (_payload: unknown, ack?: Ack) => {
    try {
      const { room, roomCode, playerId } = requireSession(socket);
      startGame(room.state, playerId);
      touch(room);
      const state = viewFor(room, playerId);
      await broadcastRoom(roomCode);
      respondOk(ack, { state });
    } catch (error) {
      respondError(ack, error);
    }
  });

  socket.on(
    'game:submitClues',
    async (payload: { clues?: unknown } = {}, ack?: Ack) => {
      try {
        const { room, roomCode, playerId } = requireSession(socket);
        if (!Array.isArray(payload.clues) || payload.clues.some((clue) => typeof clue !== 'string')) {
          throw new Error('Submit 3 text clues.');
        }
        submitClues(room.state, playerId, payload.clues as string[]);
        touch(room);
        const state = viewFor(room, playerId);
        await broadcastRoom(roomCode);
        respondOk(ack, { state });
      } catch (error) {
        respondError(ack, error);
      }
    },
  );

  const validateGuessKind = (value: unknown): GuessKind => {
    if (value !== 'intercept' && value !== 'decode') throw new Error('Unknown guess type.');
    return value;
  };

  socket.on(
    'game:updateGuess',
    async (payload: { kind?: unknown; draft?: unknown } = {}, ack?: Ack) => {
      try {
        const { room, roomCode, playerId } = requireSession(socket);
        const kind = validateGuessKind(payload.kind);
        if (!Array.isArray(payload.draft)) throw new Error('A guess must have 3 positions.');
        updateGuess(room.state, playerId, kind, payload.draft as never);
        touch(room);
        const state = viewFor(room, playerId);
        await broadcastRoom(roomCode);
        respondOk(ack, { state });
      } catch (error) {
        respondError(ack, error);
      }
    },
  );

  socket.on('game:lockGuess', async (payload: { kind?: unknown } = {}, ack?: Ack) => {
    try {
      const { room, roomCode, playerId } = requireSession(socket);
      const kind = validateGuessKind(payload.kind);
      lockGuess(room.state, playerId, kind);
      touch(room);
      const state = viewFor(room, playerId);
      await broadcastRoom(roomCode);
      respondOk(ack, { state });
    } catch (error) {
      respondError(ack, error);
    }
  });

  socket.on('game:nextRound', async (_payload: unknown, ack?: Ack) => {
    try {
      const { room, roomCode, playerId } = requireSession(socket);
      advanceToNextRound(room.state, playerId);
      touch(room);
      const state = viewFor(room, playerId);
      await broadcastRoom(roomCode);
      respondOk(ack, { state });
    } catch (error) {
      respondError(ack, error);
    }
  });

  socket.on('room:leave', async (_payload: unknown, ack?: Ack) => {
    try {
      const { room, roomCode, playerId } = requireSession(socket);
      if (room.state.phase === 'lobby') {
        room.state.players = room.state.players.filter((player) => player.id !== playerId);
        for (const [token, mappedPlayerId] of room.playerTokens.entries()) {
          if (mappedPlayerId === playerId) room.playerTokens.delete(token);
        }
        if (room.state.players.length === 0) {
          rooms.delete(roomCode);
        } else if (room.state.hostId === playerId) {
          room.state.hostId = room.state.players[0].id;
        }
      } else {
        setPlayerConnected(room.state, playerId, false);
      }
      await socket.leave(roomCode);
      socket.data = {} satisfies SessionData;
      await broadcastRoom(roomCode);
      respondOk(ack, { left: true });
    } catch (error) {
      respondError(ack, error);
    }
  });

  socket.on('disconnect', async () => {
    const data = socket.data as SessionData;
    if (!data.roomCode || !data.playerId) return;
    const room = rooms.get(data.roomCode);
    if (!room) return;
    try {
      setPlayerConnected(room.state, data.playerId, false);
      touch(room);
      await broadcastRoom(data.roomCode);
    } catch {
      // The seat may already have been removed by an explicit lobby leave.
    }
  });
});

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - ROOM_IDLE_LIMIT_MS;
  for (const [roomCode, room] of rooms.entries()) {
    if (room.lastActivityAt < cutoff) rooms.delete(roomCode);
  }
}, 60_000);
cleanupTimer.unref();

httpServer.listen(PORT, () => {
  console.log(`Decrypto server listening on :${PORT}`);
});
