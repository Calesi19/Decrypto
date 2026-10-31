import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';

const PORT = 3101;
const SERVER_URL = `http://localhost:${PORT}`;
const ROOT = new URL('..', import.meta.url).pathname;

function assert(condition, message) {
  if (!condition) throw new Error(`Smoke assertion failed: ${message}`);
}

async function waitForHealth(child, getLogs) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${SERVER_URL}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for server health\n${getLogs()}`);
}

class TestClient {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.playerId = null;
    this.latest = null;
    this.waiters = new Set();
    this.socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
    });
    this.socket.on('game:state', (state) => {
      this.latest = state;
      for (const waiter of [...this.waiters]) waiter();
    });
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} could not connect`)), 10_000);
      this.socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      this.socket.connect();
    });
  }

  emit(event, payload = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} timed out on ${event}`)), 10_000);
      this.socket.emit(event, payload, (response) => {
        clearTimeout(timer);
        if (!response?.ok) reject(new Error(`${this.name} ${event}: ${response?.error ?? 'no response'}`));
        else resolve(response.data);
      });
    });
  }

  waitFor(predicate, description, timeoutMs = 12_000) {
    if (this.latest && predicate(this.latest)) return Promise.resolve(this.latest);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(check);
      };
      const check = () => {
        if (this.latest && predicate(this.latest)) {
          cleanup();
          resolve(this.latest);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `${this.name} timed out waiting for ${description}; latest=${JSON.stringify(this.latest)}`,
          ),
        );
      }, timeoutMs);
      this.waiters.add(check);
    });
  }

  close() {
    this.socket.disconnect();
  }
}

async function waitForAll(clients, predicate, description) {
  await Promise.all(clients.map((client) => client.waitFor(predicate, description)));
}

function teamClients(clients, state, team) {
  const ids = new Set(state.players.filter((player) => player.team === team).map((player) => player.id));
  return clients.filter((client) => ids.has(client.playerId));
}

function clientById(clients, playerId) {
  const client = clients.find((candidate) => candidate.playerId === playerId);
  if (!client) throw new Error(`No client for player ${playerId}`);
  return client;
}

async function lockGuess(client, kind, code) {
  await client.emit('game:updateGuess', { kind, draft: code });
  await client.emit('game:lockGuess', { kind });
}

async function main() {
  let serverOutput = '';
  const server = spawn('npm', ['run', 'start', '--workspace=server'], {
    cwd: ROOT,
    detached: true,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (serverOutput += chunk.toString()));
  server.stderr.on('data', (chunk) => (serverOutput += chunk.toString()));

  const clients = [
    new TestClient('Ada', 'smoke-token-ada'),
    new TestClient('Ben', 'smoke-token-ben'),
    new TestClient('Cyd', 'smoke-token-cyd'),
    new TestClient('Dee', 'smoke-token-dee'),
  ];

  try {
    await waitForHealth(server, () => serverOutput);
    await Promise.all(clients.map((client) => client.connect()));

    const created = await clients[0].emit('room:create', {
      name: clients[0].name,
      playerToken: clients[0].token,
    });
    clients[0].playerId = created.playerId;
    const roomCode = created.roomCode;

    for (const client of clients.slice(1)) {
      const joined = await client.emit('room:join', {
        roomCode,
        name: client.name,
        playerToken: client.token,
      });
      client.playerId = joined.playerId;
    }

    await clients[0].emit('game:chooseTeam', { team: 'black' });
    await clients[1].emit('game:chooseTeam', { team: 'black' });
    await clients[2].emit('game:chooseTeam', { team: 'white' });
    await clients[3].emit('game:chooseTeam', { team: 'white' });

    await clients[0].emit('game:start', {});
    await waitForAll(clients, (view) => view.phase === 'encode' && view.round === 1, 'encode phase');
    let state = clients[0].latest;

    assert(state.keywords.black?.length === 4, 'Black received four keywords');
    assert(state.keywords.white === null, 'Black view does not expose White keywords');
    const whiteView = clients[2].latest;
    assert(whiteView.keywords.white?.length === 4, 'White received four keywords');
    assert(whiteView.keywords.black === null, 'White view does not expose Black keywords');

    let finalState = null;
    for (let round = 1; round <= 8; round += 1) {
      await waitForAll(
        clients,
        (view) => view.phase === 'encode' && view.round === round,
        `round ${round} encode phase for every client`,
      );
      state = clients[0].latest;
      assert(state.phase === 'encode', `round ${round} starts in encode phase`);
      assert(state.round === round, `round counter is ${round}`);

      const blackEncoder = clientById(clients, state.encoders.black);
      const whiteEncoder = clientById(clients, state.encoders.white);
      const blackCode = blackEncoder.latest.currentCode;
      const whiteCode = whiteEncoder.latest.currentCode;
      assert(blackCode?.length === 3, 'Black Encoder can see the Black code');
      assert(whiteCode?.length === 3, 'White Encoder can see the White code');

      await blackEncoder.emit('game:submitClues', {
        clues: [`round${round}blackalpha`, `round${round}blackbeta`, `round${round}blackgamma`],
      });
      await whiteEncoder.emit('game:submitClues', {
        clues: [`round${round}whitealpha`, `round${round}whitebeta`, `round${round}whitegamma`],
      });

      if (round === 1) {
        await waitForAll(clients, (view) => view.phase === 'decode', 'round 1 decode phase');
        state = clients[0].latest;
      } else {
        await waitForAll(
          clients,
          (view) => view.phase === 'intercept',
          `round ${round} intercept phase`,
        );
        state = clients[0].latest;
        const blackTeam = teamClients(clients, state, 'black');
        const whiteTeam = teamClients(clients, state, 'white');
        await lockGuess(blackTeam[0], 'intercept', whiteCode);
        await lockGuess(whiteTeam[0], 'intercept', blackCode);
        await waitForAll(
          clients,
          (view) => view.phase === 'decode',
          `round ${round} decode phase`,
        );
        state = clients[0].latest;
      }

      const freshState = clients[0].latest;
      const blackDecoder = teamClients(clients, freshState, 'black').find(
        (client) => client.playerId !== freshState.encoders.black,
      );
      const whiteDecoder = teamClients(clients, freshState, 'white').find(
        (client) => client.playerId !== freshState.encoders.white,
      );
      assert(blackDecoder && whiteDecoder, 'both teams have a non-Encoder decoder');
      await lockGuess(blackDecoder, 'decode', blackCode);
      await lockGuess(whiteDecoder, 'decode', whiteCode);

      state = await clients[0].waitFor(
        (view) => view.phase === 'reveal' || view.phase === 'gameover',
        `round ${round} reveal`,
      );
      if (state.phase === 'gameover') {
        finalState = state;
        break;
      }
      await clients[0].emit('game:nextRound', {});
      await clients[0].waitFor(
        (view) => view.round === round + 1 && view.phase === 'encode',
        `round ${round + 1} encode phase`,
      );
    }

    assert(finalState, 'game reaches game-over');
    assert(finalState.phase === 'gameover', 'final phase is gameover');
    assert(
      finalState.interceptionTokens.black === 2,
      `Black reaches two interceptions (got ${finalState.interceptionTokens.black}; history=${JSON.stringify(finalState.roundHistory)})`,
    );
    assert(
      finalState.interceptionTokens.white === 2,
      `White reaches two interceptions (got ${finalState.interceptionTokens.white})`,
    );
    assert(finalState.winner === 'draw', 'simultaneous equal thresholds resolve as a draw');
    assert(finalState.keywords.black?.length === 4, 'Black keywords revealed at game over');
    assert(finalState.keywords.white?.length === 4, 'White keywords revealed at game over');

    console.log(
      `Smoke test passed: room ${roomCode}, ${finalState.roundHistory.length} rounds, winner=${finalState.winner}, tokens B/W interceptions=${finalState.interceptionTokens.black}/${finalState.interceptionTokens.white}.`,
    );
  } finally {
    for (const client of clients) client.close();
    if (server.exitCode === null) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        server.kill('SIGTERM');
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
