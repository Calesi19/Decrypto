import { WORDS } from './words.js';

export type TeamId = 'black' | 'white';
export type Digit = 1 | 2 | 3 | 4;
export type Code = readonly [Digit, Digit, Digit];
export type MutableCode = [Digit, Digit, Digit];
export type GuessDigit = Digit | null;
export type GuessDraft = [GuessDigit, GuessDigit, GuessDigit];
export type Phase =
  | 'lobby'
  | 'encode'
  | 'intercept'
  | 'decode'
  | 'reveal'
  | 'gameover';
export type GuessKind = 'intercept' | 'decode';
export type Winner = TeamId | 'draw';

export type RandomSource = () => number;

export interface Player {
  id: string;
  name: string;
  team: TeamId | null;
  connected: boolean;
}

export interface GuessState {
  draft: GuessDraft;
  locked: boolean;
  updatedBy: string | null;
  lockedBy: string | null;
}

export type ClueHistory = Record<TeamId, Record<Digit, string[]>>;
export type TokenCounts = Record<TeamId, number>;

export interface RoundRevealTeam {
  team: TeamId;
  code: Code;
  clues: string[];
  ownGuess: Code | null;
  ownGuessCorrect: boolean;
  opponentGuess: Code | null;
  interceptedByOpponent: boolean;
}

export interface RoundReveal {
  round: number;
  revealedAt: number;
  teams: Record<TeamId, RoundRevealTeam>;
  interceptionTokensAwarded: TeamId[];
  miscommunicationTokensAwarded: TeamId[];
}

export interface GameState {
  roomCode: string;
  hostId: string;
  players: Player[];
  phase: Phase;
  round: number;
  keywords: Record<TeamId, string[] | null>;
  codes: Record<TeamId, Code | null>;
  encoders: Record<TeamId, string | null>;
  clues: Record<TeamId, string[] | null>;
  interceptGuesses: Record<TeamId, GuessState>;
  decodeGuesses: Record<TeamId, GuessState>;
  interceptionTokens: TokenCounts;
  miscommunicationTokens: TokenCounts;
  clueHistory: ClueHistory;
  roundHistory: RoundReveal[];
  lastReveal: RoundReveal | null;
  winner: Winner | null;
  endReason: string | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  team: TeamId | null;
  connected: boolean;
  isHost: boolean;
  isEncoder: boolean;
}

export interface PlayerView {
  roomCode: string;
  phase: Phase;
  round: number;
  maxRounds: 8;
  viewer: { id: string; name: string; team: TeamId | null };
  isHost: boolean;
  players: PublicPlayer[];
  encoders: Record<TeamId, string | null>;
  keywords: Record<TeamId, string[] | null>;
  allKeywordsRevealed: boolean;
  currentCode: Code | null;
  submittedClues: Record<TeamId, string[] | null>;
  yourInterceptGuess: GuessState | null;
  yourDecodeGuess: GuessState | null;
  opponentGuessStatus: Record<GuessKind, { locked: boolean }> | null;
  interceptionTokens: TokenCounts;
  miscommunicationTokens: TokenCounts;
  clueHistory: ClueHistory;
  lastReveal: RoundReveal | null;
  roundHistory: RoundReveal[];
  winner: Winner | null;
  endReason: string | null;
}

export const TEAMS: readonly TeamId[] = ['black', 'white'];
export const MAX_ROUNDS = 8;

export function otherTeam(team: TeamId): TeamId {
  return team === 'black' ? 'white' : 'black';
}

function emptyGuess(): GuessState {
  return { draft: [null, null, null], locked: false, updatedBy: null, lockedBy: null };
}

function emptyHistory(): ClueHistory {
  return {
    black: { 1: [], 2: [], 3: [], 4: [] },
    white: { 1: [], 2: [], 3: [], 4: [] },
  };
}

export function createGame(roomCode: string, host: { id: string; name: string }): GameState {
  return {
    roomCode,
    hostId: host.id,
    players: [{ id: host.id, name: host.name, team: null, connected: true }],
    phase: 'lobby',
    round: 0,
    keywords: { black: null, white: null },
    codes: { black: null, white: null },
    encoders: { black: null, white: null },
    clues: { black: null, white: null },
    interceptGuesses: { black: emptyGuess(), white: emptyGuess() },
    decodeGuesses: { black: emptyGuess(), white: emptyGuess() },
    interceptionTokens: { black: 0, white: 0 },
    miscommunicationTokens: { black: 0, white: 0 },
    clueHistory: emptyHistory(),
    roundHistory: [],
    lastReveal: null,
    winner: null,
    endReason: null,
  };
}

export function addPlayer(state: GameState, player: { id: string; name: string }): Player {
  const existing = state.players.find((candidate) => candidate.id === player.id);
  if (existing) {
    existing.connected = true;
    existing.name = player.name;
    return existing;
  }
  if (state.phase !== 'lobby') throw new Error('This game has already started.');
  const created: Player = { id: player.id, name: player.name, team: null, connected: true };
  state.players.push(created);
  return created;
}

export function setPlayerConnected(state: GameState, playerId: string, connected: boolean): void {
  const player = requirePlayer(state, playerId);
  player.connected = connected;
}

export function chooseTeam(state: GameState, playerId: string, team: TeamId | null): void {
  if (state.phase !== 'lobby') throw new Error('Teams cannot change after the game starts.');
  const player = requirePlayer(state, playerId);
  player.team = team;
}

export function teamPlayers(state: GameState, team: TeamId): Player[] {
  return state.players.filter((player) => player.team === team);
}

export function generateCode(rng: RandomSource = Math.random): Code {
  const digits: Digit[] = [1, 2, 3, 4];
  for (let index = digits.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [digits[index], digits[swapIndex]] = [digits[swapIndex], digits[index]];
  }
  return [digits[0], digits[1], digits[2]];
}

export function dealKeywords(
  rng: RandomSource = Math.random,
  wordBank: readonly string[] = WORDS,
): Record<TeamId, string[]> {
  const seen = new Set<string>();
  const uniqueWords: string[] = [];
  for (const rawWord of wordBank) {
    const word = rawWord.trim();
    const key = word.toLocaleLowerCase();
    if (word && !seen.has(key)) {
      seen.add(key);
      uniqueWords.push(word);
    }
  }
  if (uniqueWords.length < 8) throw new Error('The word bank must contain at least 8 unique words.');

  const shuffled = [...uniqueWords];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return {
    black: shuffled.slice(0, 4),
    white: shuffled.slice(4, 8),
  };
}

export function startGame(
  state: GameState,
  playerId: string,
  rng: RandomSource = Math.random,
  wordBank: readonly string[] = WORDS,
): void {
  if (state.phase !== 'lobby') throw new Error('The game has already started.');
  if (playerId !== state.hostId) throw new Error('Only the host can start the game.');
  if (state.players.some((player) => !player.team)) {
    throw new Error('Every player must choose a team before the game starts.');
  }
  for (const team of TEAMS) {
    if (teamPlayers(state, team).length < 2) {
      throw new Error('Each team needs at least 2 players to start.');
    }
  }

  state.keywords = dealKeywords(rng, wordBank);
  state.round = 1;
  beginRound(state, rng);
}

function beginRound(state: GameState, rng: RandomSource): void {
  state.phase = 'encode';
  state.clues = { black: null, white: null };
  state.interceptGuesses = { black: emptyGuess(), white: emptyGuess() };
  state.decodeGuesses = { black: emptyGuess(), white: emptyGuess() };
  state.codes = {
    black: generateCode(rng),
    white: generateCode(rng),
  };

  for (const team of TEAMS) {
    const members = teamPlayers(state, team);
    const encoderIndex = (state.round - 1) % members.length;
    state.encoders[team] = members[encoderIndex]?.id ?? null;
  }
}

export function submitClues(
  state: GameState,
  playerId: string,
  rawClues: readonly string[],
): void {
  if (state.phase !== 'encode') throw new Error('Clues can only be submitted during the encode phase.');
  const player = requirePlayer(state, playerId);
  if (!player.team) throw new Error('Choose a team before submitting clues.');
  if (state.encoders[player.team] !== playerId) {
    throw new Error('Only your team Encoder can submit clues.');
  }
  if (state.clues[player.team]) throw new Error('Your team has already submitted clues.');
  if (rawClues.length !== 3) throw new Error('Submit exactly 3 clues.');

  const clues = rawClues.map((clue) => clue.trim());
  if (clues.some((clue) => clue.length === 0)) throw new Error('Clues cannot be blank.');

  const keywords = state.keywords[player.team];
  if (!keywords) throw new Error('Keywords have not been dealt.');
  const keywordSet = new Set(keywords.map((keyword) => keyword.toLocaleLowerCase()));
  const forbidden = clues.find((clue) => keywordSet.has(clue.toLocaleLowerCase()));
  if (forbidden) throw new Error(`A clue cannot be one of your keywords: ${forbidden}`);

  state.clues[player.team] = clues;
  if (state.clues.black && state.clues.white) {
    state.phase = state.round === 1 ? 'decode' : 'intercept';
  }
}

export function updateGuess(
  state: GameState,
  playerId: string,
  kind: GuessKind,
  draft: readonly GuessDigit[],
): void {
  const { player, team } = validateGuessActor(state, playerId, kind);
  const guesses = kind === 'intercept' ? state.interceptGuesses : state.decodeGuesses;
  const guess = guesses[team];
  if (guess.locked) throw new Error('That guess has already been locked in.');
  guess.draft = validateGuessDraft(draft);
  guess.updatedBy = player.id;
}

export function lockGuess(state: GameState, playerId: string, kind: GuessKind): Code {
  const { team } = validateGuessActor(state, playerId, kind);
  const guesses = kind === 'intercept' ? state.interceptGuesses : state.decodeGuesses;
  const guess = guesses[team];
  if (guess.locked) throw new Error('That guess has already been locked in.');
  const complete = asCompleteCode(guess.draft);
  if (!complete) throw new Error('Choose 3 distinct digits before locking in.');

  guess.locked = true;
  guess.lockedBy = playerId;

  if (kind === 'intercept') {
    if (state.interceptGuesses.black.locked && state.interceptGuesses.white.locked) {
      state.phase = 'decode';
    }
  } else if (state.decodeGuesses.black.locked && state.decodeGuesses.white.locked) {
    resolveReveal(state);
  }
  return complete;
}

function validateGuessActor(
  state: GameState,
  playerId: string,
  kind: GuessKind,
): { player: Player; team: TeamId } {
  const expectedPhase = kind === 'intercept' ? 'intercept' : 'decode';
  if (state.phase !== expectedPhase) {
    throw new Error(`You cannot work on the ${kind} guess during the ${state.phase} phase.`);
  }
  const player = requirePlayer(state, playerId);
  if (!player.team) throw new Error('Choose a team before guessing.');
  if (kind === 'decode' && state.encoders[player.team] === playerId) {
    throw new Error('The Encoder cannot edit or lock in their own team decode guess.');
  }
  return { player, team: player.team };
}

function validateGuessDraft(draft: readonly GuessDigit[]): GuessDraft {
  if (draft.length !== 3) throw new Error('A guess must have exactly 3 positions.');
  const values = draft.map((digit) => {
    if (digit === null) return null;
    if (!Number.isInteger(digit) || digit < 1 || digit > 4) {
      throw new Error('Guess digits must be between 1 and 4.');
    }
    return digit as Digit;
  }) as GuessDraft;

  const chosen = values.filter((digit): digit is Digit => digit !== null);
  if (new Set(chosen).size !== chosen.length) throw new Error('Guess digits cannot repeat.');
  return values;
}

function asCompleteCode(draft: GuessDraft): Code | null {
  if (draft.some((digit) => digit === null)) return null;
  return [draft[0] as Digit, draft[1] as Digit, draft[2] as Digit];
}

export function codesEqual(left: Code | null, right: Code | null): boolean {
  return !!left && !!right && left.every((digit, index) => digit === right[index]);
}

function resolveReveal(state: GameState): void {
  const revealTeams = {} as Record<TeamId, RoundRevealTeam>;
  const interceptionTokensAwarded: TeamId[] = [];
  const miscommunicationTokensAwarded: TeamId[] = [];

  for (const team of TEAMS) {
    const code = state.codes[team];
    const clues = state.clues[team];
    if (!code || !clues) throw new Error('Cannot reveal before codes and clues are complete.');

    const ownGuess = asCompleteCode(state.decodeGuesses[team].draft);
    const opponent = otherTeam(team);
    const opponentGuess =
      state.round === 1 ? null : asCompleteCode(state.interceptGuesses[opponent].draft);
    const ownGuessCorrect = codesEqual(ownGuess, code);
    const interceptedByOpponent = state.round > 1 && codesEqual(opponentGuess, code);

    if (!ownGuessCorrect) {
      state.miscommunicationTokens[team] += 1;
      miscommunicationTokensAwarded.push(team);
    }
    if (interceptedByOpponent) {
      state.interceptionTokens[opponent] += 1;
      interceptionTokensAwarded.push(opponent);
    }

    clues.forEach((clue, index) => {
      state.clueHistory[team][code[index]].push(clue);
    });

    revealTeams[team] = {
      team,
      code: [...code] as unknown as Code,
      clues: [...clues],
      ownGuess,
      ownGuessCorrect,
      opponentGuess,
      interceptedByOpponent,
    };
  }

  const reveal: RoundReveal = {
    round: state.round,
    revealedAt: Date.now(),
    teams: revealTeams,
    interceptionTokensAwarded,
    miscommunicationTokensAwarded,
  };
  state.lastReveal = reveal;
  state.roundHistory.push(reveal);

  const winner = resolveThresholdWinner(state);
  if (winner) {
    state.winner = winner;
    state.phase = 'gameover';
    state.endReason =
      winner === 'draw'
        ? 'Both teams reached a token threshold in the same round with no tie-break edge.'
        : winnerReason(state, winner);
    return;
  }

  if (state.round >= MAX_ROUNDS) {
    state.winner = resolveRoundEightWinner(state);
    state.phase = 'gameover';
    state.endReason =
      state.winner === 'draw'
        ? 'After 8 rounds the teams were tied on interception and miscommunication tokens.'
        : `${teamLabel(state.winner)} won the 8-round tiebreak.`;
    return;
  }

  state.phase = 'reveal';
}

function winnerReason(state: GameState, winner: TeamId): string {
  if (state.interceptionTokens[winner] >= 2 && state.miscommunicationTokens[winner] < 2) {
    return `${teamLabel(winner)} reached 2 interception tokens.`;
  }
  if (state.miscommunicationTokens[otherTeam(winner)] >= 2) {
    return `${teamLabel(otherTeam(winner))} reached 2 miscommunication tokens.`;
  }
  return `${teamLabel(winner)} won on the same-round token tiebreak.`;
}

function resolveThresholdWinner(state: GameState): Winner | null {
  const interceptionQualifiers = TEAMS.filter((team) => {
    if (state.interceptionTokens[team] < 2) return false;
    const reachedMiscommunication = state.miscommunicationTokens[team] >= 2;
    const opponentReachedInterception = state.interceptionTokens[otherTeam(team)] >= 2;
    return !reachedMiscommunication || !opponentReachedInterception;
  });

  if (interceptionQualifiers.length === 1) return interceptionQualifiers[0];
  if (interceptionQualifiers.length === 2) return compareTokenTiebreak(state) ?? 'draw';

  const miscommunicationTeams = TEAMS.filter((team) => state.miscommunicationTokens[team] >= 2);
  if (miscommunicationTeams.length === 1) return otherTeam(miscommunicationTeams[0]);
  if (miscommunicationTeams.length === 2) return compareTokenTiebreak(state) ?? 'draw';
  return null;
}

function resolveRoundEightWinner(state: GameState): Winner {
  return compareTokenTiebreak(state) ?? 'draw';
}

function compareTokenTiebreak(state: GameState): Winner | null {
  if (state.interceptionTokens.black !== state.interceptionTokens.white) {
    return state.interceptionTokens.black > state.interceptionTokens.white ? 'black' : 'white';
  }
  if (state.miscommunicationTokens.black !== state.miscommunicationTokens.white) {
    return state.miscommunicationTokens.black < state.miscommunicationTokens.white
      ? 'black'
      : 'white';
  }
  return null;
}

export function advanceToNextRound(
  state: GameState,
  playerId: string,
  rng: RandomSource = Math.random,
): void {
  if (state.phase !== 'reveal') throw new Error('The next round can only start from the reveal.');
  if (playerId !== state.hostId) throw new Error('Only the host can start the next round.');
  if (state.round >= MAX_ROUNDS) throw new Error('The game is over.');
  state.round += 1;
  beginRound(state, rng);
}

function requirePlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error('Player not found in this room.');
  return player;
}

// Team ids stay 'black'/'white' on the wire; players know them as Alpha and Beta.
function teamLabel(team: TeamId): string {
  return team === 'black' ? 'Alpha' : 'Beta';
}

function cloneGuess(guess: GuessState): GuessState {
  return { ...guess, draft: [...guess.draft] as GuessDraft };
}

function cloneHistory(history: ClueHistory): ClueHistory {
  return {
    black: {
      1: [...history.black[1]],
      2: [...history.black[2]],
      3: [...history.black[3]],
      4: [...history.black[4]],
    },
    white: {
      1: [...history.white[1]],
      2: [...history.white[2]],
      3: [...history.white[3]],
      4: [...history.white[4]],
    },
  };
}

function cloneReveal(reveal: RoundReveal): RoundReveal {
  return JSON.parse(JSON.stringify(reveal)) as RoundReveal;
}

export function buildPlayerView(state: GameState, playerId: string): PlayerView {
  const viewer = requirePlayer(state, playerId);
  const viewerTeam = viewer.team;
  const gameOver = state.phase === 'gameover';

  const keywords: Record<TeamId, string[] | null> = { black: null, white: null };
  if (gameOver) {
    keywords.black = state.keywords.black ? [...state.keywords.black] : null;
    keywords.white = state.keywords.white ? [...state.keywords.white] : null;
  } else if (viewerTeam && state.keywords[viewerTeam]) {
    keywords[viewerTeam] = [...state.keywords[viewerTeam]!];
  }

  const isViewerEncoder =
    !!viewerTeam && state.encoders[viewerTeam] === viewer.id;
  const currentCode =
    isViewerEncoder &&
    viewerTeam &&
    (state.phase === 'encode' || state.phase === 'intercept' || state.phase === 'decode')
      ? state.codes[viewerTeam]
      : null;

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    round: state.round,
    maxRounds: MAX_ROUNDS,
    viewer: { id: viewer.id, name: viewer.name, team: viewerTeam },
    isHost: viewer.id === state.hostId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      connected: player.connected,
      isHost: player.id === state.hostId,
      isEncoder: !!player.team && state.encoders[player.team] === player.id,
    })),
    encoders: { ...state.encoders },
    keywords,
    allKeywordsRevealed: gameOver,
    currentCode: currentCode ? ([...currentCode] as unknown as Code) : null,
    submittedClues: {
      black: state.clues.black ? [...state.clues.black] : null,
      white: state.clues.white ? [...state.clues.white] : null,
    },
    yourInterceptGuess: viewerTeam ? cloneGuess(state.interceptGuesses[viewerTeam]) : null,
    yourDecodeGuess: viewerTeam ? cloneGuess(state.decodeGuesses[viewerTeam]) : null,
    opponentGuessStatus: viewerTeam
      ? {
          intercept: { locked: state.interceptGuesses[otherTeam(viewerTeam)].locked },
          decode: { locked: state.decodeGuesses[otherTeam(viewerTeam)].locked },
        }
      : null,
    interceptionTokens: { ...state.interceptionTokens },
    miscommunicationTokens: { ...state.miscommunicationTokens },
    clueHistory: cloneHistory(state.clueHistory),
    lastReveal:
      state.phase === 'reveal' || gameOver
        ? state.lastReveal
          ? cloneReveal(state.lastReveal)
          : null
        : null,
    roundHistory: state.roundHistory.map(cloneReveal),
    winner: state.winner,
    endReason: state.endReason,
  };
}
