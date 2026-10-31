import { describe, expect, it } from 'vitest';
import {
  WORDS,
  addPlayer,
  advanceToNextRound,
  buildPlayerView,
  chooseTeam,
  codesEqual,
  createGame,
  dealKeywords,
  generateCode,
  lockGuess,
  startGame,
  submitClues,
  teamPlayers,
  updateGuess,
  type Code,
  type GameState,
  type TeamId,
} from '../src/index.js';

const TEST_WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

function constantRng(value: number) {
  return () => value;
}

function makeGame(): GameState {
  const state = createGame('TEST', { id: 'b1', name: 'Black One' });
  addPlayer(state, { id: 'b2', name: 'Black Two' });
  addPlayer(state, { id: 'w1', name: 'White One' });
  addPlayer(state, { id: 'w2', name: 'White Two' });
  chooseTeam(state, 'b1', 'black');
  chooseTeam(state, 'b2', 'black');
  chooseTeam(state, 'w1', 'white');
  chooseTeam(state, 'w2', 'white');
  startGame(state, 'b1', constantRng(0.37), TEST_WORDS);
  return state;
}

function wrongCode(code: Code): Code {
  return [code[1], code[2], code[0]];
}

function submitAllClues(state: GameState, label: string): void {
  for (const team of ['black', 'white'] as TeamId[]) {
    const encoder = state.encoders[team];
    if (!encoder) throw new Error('Missing encoder');
    submitClues(state, encoder, [
      `${label}-${team}-first`,
      `${label}-${team}-second`,
      `${label}-${team}-third`,
    ]);
  }
}

function setAndLock(state: GameState, team: TeamId, kind: 'intercept' | 'decode', code: Code): void {
  const members = teamPlayers(state, team);
  const actor =
    kind === 'decode'
      ? members.find((player) => player.id !== state.encoders[team])
      : members[0];
  if (!actor) throw new Error('Missing guess actor');
  updateGuess(state, actor.id, kind, code);
  lockGuess(state, actor.id, kind);
}

interface RoundOptions {
  blackOwn?: Code;
  whiteOwn?: Code;
  blackIntercept?: Code;
  whiteIntercept?: Code;
}

function finishRound(state: GameState, label: string, options: RoundOptions = {}): void {
  const round = state.round;
  const blackCode = state.codes.black;
  const whiteCode = state.codes.white;
  if (!blackCode || !whiteCode) throw new Error('Codes missing');
  submitAllClues(state, label);

  if (round > 1) {
    setAndLock(state, 'black', 'intercept', options.blackIntercept ?? wrongCode(whiteCode));
    setAndLock(state, 'white', 'intercept', options.whiteIntercept ?? wrongCode(blackCode));
  }
  setAndLock(state, 'black', 'decode', options.blackOwn ?? blackCode);
  setAndLock(state, 'white', 'decode', options.whiteOwn ?? whiteCode);

  if (state.phase === 'reveal') advanceToNextRound(state, state.hostId, constantRng(0.37));
}

describe('word bank and dealing', () => {
  it('contains at least 300 unique single-word keywords', () => {
    const normalized = WORDS.map((word) => word.trim().toLocaleLowerCase());
    expect(new Set(normalized).size).toBeGreaterThanOrEqual(300);
    expect(WORDS.every((word) => /^[A-Za-z]+$/.test(word.trim()))).toBe(true);
  });

  it('deals four distinct keywords to each team with no overlap', () => {
    const dealt = dealKeywords(constantRng(0.21));
    expect(dealt.black).toHaveLength(4);
    expect(dealt.white).toHaveLength(4);
    expect(new Set([...dealt.black, ...dealt.white]).size).toBe(8);
  });
});

describe('code generation', () => {
  it('always creates three distinct digits from 1 through 4', () => {
    for (let index = 0; index < 1000; index += 1) {
      const code = generateCode(Math.random);
      expect(code).toHaveLength(3);
      expect(new Set(code).size).toBe(3);
      expect(code.every((digit) => digit >= 1 && digit <= 4)).toBe(true);
    }
  });
});

describe('clues and phases', () => {
  it('rejects a clue identical to a team keyword, ignoring case', () => {
    const state = makeGame();
    const encoder = state.encoders.black;
    const keyword = state.keywords.black?.[0];
    if (!encoder || !keyword) throw new Error('Missing test data');
    expect(() => submitClues(state, encoder, [keyword.toUpperCase(), 'safe', 'also-safe']))
      .toThrow(/cannot be one of your keywords/i);
  });

  it('skips the interception phase entirely in round 1', () => {
    const state = makeGame();
    submitAllClues(state, 'round-one');
    expect(state.phase).toBe('decode');
    const blackPlayer = teamPlayers(state, 'black')[0];
    expect(() => updateGuess(state, blackPlayer.id, 'intercept', [1, 2, 3])).toThrow();
  });

  it('prevents the Encoder from editing their own team decode guess', () => {
    const state = makeGame();
    submitAllClues(state, 'encoder-rule');
    const encoder = state.encoders.black;
    if (!encoder) throw new Error('Missing encoder');
    expect(() => updateGuess(state, encoder, 'decode', [1, 2, 3])).toThrow(/Encoder cannot/);
  });

  it('allows the Encoder to help intercept the opposing code in round 2', () => {
    const state = makeGame();
    finishRound(state, 'first');
    submitAllClues(state, 'second');
    expect(state.phase).toBe('intercept');
    const encoder = state.encoders.black;
    if (!encoder) throw new Error('Missing encoder');
    expect(() => updateGuess(state, encoder, 'intercept', [1, 2, 3])).not.toThrow();
  });

  it('rotates the Encoder by round', () => {
    const state = makeGame();
    const firstBlackEncoder = state.encoders.black;
    finishRound(state, 'rotate-one');
    expect(state.round).toBe(2);
    expect(state.encoders.black).not.toBe(firstBlackEncoder);
  });
});

describe('scoring and game end', () => {
  it('awards an interception token for an exact opposing guess', () => {
    const state = makeGame();
    finishRound(state, 'score-r1');
    const blackCode = state.codes.black;
    const whiteCode = state.codes.white;
    if (!blackCode || !whiteCode) throw new Error('Codes missing');
    finishRound(state, 'score-r2', {
      blackIntercept: whiteCode,
      whiteIntercept: wrongCode(blackCode),
    });
    expect(state.interceptionTokens.black).toBe(1);
    expect(state.interceptionTokens.white).toBe(0);
  });

  it('awards a miscommunication token for a wrong own-team guess', () => {
    const state = makeGame();
    const blackCode = state.codes.black;
    if (!blackCode) throw new Error('Code missing');
    finishRound(state, 'miss-r1', { blackOwn: wrongCode(blackCode) });
    expect(state.miscommunicationTokens.black).toBe(1);
    expect(state.miscommunicationTokens.white).toBe(0);
  });

  it('ends the game when a team reaches two interceptions', () => {
    const state = makeGame();
    finishRound(state, 'win-r1');
    for (const label of ['win-r2', 'win-r3']) {
      const blackCode = state.codes.black;
      const whiteCode = state.codes.white;
      if (!blackCode || !whiteCode) throw new Error('Codes missing');
      finishRound(state, label, {
        blackIntercept: wrongCode(whiteCode),
        whiteIntercept: blackCode,
      });
      if (state.phase === 'gameover') break;
    }
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('white');
    expect(state.interceptionTokens.white).toBe(2);
  });

  it('declares a draw when both teams reach two interceptions together with equal tokens', () => {
    const state = makeGame();
    finishRound(state, 'both-r1');
    for (const label of ['both-r2', 'both-r3']) {
      const blackCode = state.codes.black;
      const whiteCode = state.codes.white;
      if (!blackCode || !whiteCode) throw new Error('Codes missing');
      finishRound(state, label, {
        blackIntercept: whiteCode,
        whiteIntercept: blackCode,
      });
      if (state.phase === 'gameover') break;
    }
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('draw');
    expect(state.interceptionTokens).toEqual({ black: 2, white: 2 });
  });

  it('ends the game when a team reaches two miscommunications', () => {
    const state = makeGame();
    for (const label of ['loss-r1', 'loss-r2']) {
      const blackCode = state.codes.black;
      if (!blackCode) throw new Error('Code missing');
      finishRound(state, label, { blackOwn: wrongCode(blackCode) });
      if (state.phase === 'gameover') break;
    }
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('white');
    expect(state.miscommunicationTokens.black).toBe(2);
  });

  it('uses more interceptions as the first 8-round tiebreak', () => {
    const state = makeGame();
    finishRound(state, 'tie-i-r1');
    const whiteCode = state.codes.white;
    if (!whiteCode) throw new Error('Code missing');
    finishRound(state, 'tie-i-r2', { blackIntercept: whiteCode });
    for (let round = 3; round <= 8; round += 1) finishRound(state, `tie-i-r${round}`);
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('black');
    expect(state.interceptionTokens).toEqual({ black: 1, white: 0 });
  });

  it('uses fewer miscommunications as the second 8-round tiebreak', () => {
    const state = makeGame();
    const blackCode = state.codes.black;
    if (!blackCode) throw new Error('Code missing');
    finishRound(state, 'tie-m-r1', { blackOwn: wrongCode(blackCode) });
    for (let round = 2; round <= 8; round += 1) finishRound(state, `tie-m-r${round}`);
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('white');
    expect(state.interceptionTokens).toEqual({ black: 0, white: 0 });
    expect(state.miscommunicationTokens).toEqual({ black: 1, white: 0 });
  });

  it('declares a draw after 8 tied rounds', () => {
    const state = makeGame();
    for (let round = 1; round <= 8; round += 1) finishRound(state, `draw-r${round}`);
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('draw');
  });
});

describe('player view privacy', () => {
  it('shows a team only its own keywords and shows a live code only to its Encoder', () => {
    const state = makeGame();
    state.codes.black = [1, 2, 3];
    state.codes.white = [4, 3, 1];

    const blackEncoder = state.encoders.black;
    const blackTeammate = teamPlayers(state, 'black').find((player) => player.id !== blackEncoder);
    if (!blackEncoder || !blackTeammate) throw new Error('Missing players');

    const encoderView = buildPlayerView(state, blackEncoder);
    expect(encoderView.keywords.black).toEqual(state.keywords.black);
    expect(encoderView.keywords.white).toBeNull();
    expect(encoderView.currentCode).toEqual([1, 2, 3]);

    const teammateView = buildPlayerView(state, blackTeammate.id);
    expect(teammateView.currentCode).toBeNull();

    const serialized = JSON.stringify(teammateView);
    for (const keyword of state.keywords.white ?? []) {
      expect(serialized).not.toContain(keyword);
    }
    expect(serialized).not.toContain('"currentCode":[4,3,1]');
    expect(serialized).not.toContain('"code":[4,3,1]');
  });

  it('reveals both keyword sets only at game over', () => {
    const state = makeGame();
    state.phase = 'gameover';
    state.winner = 'black';
    const view = buildPlayerView(state, 'w1');
    expect(view.keywords.black).toEqual(state.keywords.black);
    expect(view.keywords.white).toEqual(state.keywords.white);
    expect(view.allKeywordsRevealed).toBe(true);
  });

  it('recognizes equal codes without treating different orders as equal', () => {
    expect(codesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(codesEqual([1, 2, 3], [3, 2, 1])).toBe(false);
  });
});
