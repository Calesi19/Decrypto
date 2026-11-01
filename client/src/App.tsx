import { useEffect, useRef, useState } from 'react';
import { Notice } from './components/Bits';
import { CrewPanel } from './components/Crew';
import { DeskBar } from './components/Hardware';
import { LogPanel } from './components/Log';
import { KeywordPanel } from './components/Shield';
import { Sheet } from './components/Sheet';
import { cue } from './lib/feedback';
import { phaseLabel } from './lib/game';
import { useAppUpdate, useWakeLock } from './lib/pwa';
import { useGameSession } from './lib/session';
import { GameOver } from './screens/GameOver';
import { HomeScreen } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Station } from './screens/Station';

type SheetName = 'keywords' | 'log' | 'crew';

const CASE_COLOUR = { black: '#2a2825', white: '#e4dac4' };

export default function App() {
  const session = useGameSession();
  const { connected, gameState, error, busy, actions } = session;
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const applyUpdate = useAppUpdate();
  const stage = gameState ? `${gameState.round}-${gameState.phase}` : 'home';
  const previousStage = useRef(stage);

  useWakeLock(!!gameState && gameState.phase !== 'gameover');

  useEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    setSheet(null);
    document.querySelector('main')?.scrollTo({ top: 0 });
    if (gameState?.phase === 'reveal' || gameState?.phase === 'gameover') {
      cue('stamp');
      const teams = gameState.lastReveal?.teams;
      if (teams && (!teams.black.ownGuessCorrect || !teams.white.ownGuessCorrect)) {
        window.setTimeout(() => cue('static'), 260);
      }
    } else if (gameState) cue('phase');
  }, [gameState, stage]);

  // Set on the root so sheets, which live outside the shell, get the same hardware.
  const team = gameState?.viewer.team ?? 'black';
  useEffect(() => {
    document.documentElement.dataset.team = team;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', CASE_COLOUR[team]);
  }, [team]);

  useEffect(() => {
    document.title =
      gameState && gameState.phase !== 'lobby'
        ? `${phaseLabel(gameState.phase)} · ${gameState.roomCode} · Decrypto`
        : 'Decrypto';
  }, [gameState]);

  const updateNotice = applyUpdate && (
    <Notice onDismiss={applyUpdate} dismissLabel="Reload">
      New build ready.
    </Notice>
  );

  if (!gameState) {
    return (
      <>
        <HomeScreen
          connected={connected}
          name={session.name}
          roomCode={session.roomCode}
          error={error}
          busy={busy}
          onNameChange={session.setName}
          onRoomCodeChange={session.setRoomCode}
          onCreate={actions.createRoom}
          onJoin={actions.joinRoom}
          onClearError={session.clearError}
        />
        {updateNotice && <div className="fixed inset-x-0 bottom-0 z-10">{updateNotice}</div>}
      </>
    );
  }

  const lobby = gameState.phase === 'lobby';
  const over = gameState.phase === 'gameover';
  // Decode keeps the keywords on the station itself, where the team works from them.
  const hasKeywords =
    !!gameState.viewer.team && (gameState.phase === 'intercept' || gameState.phase === 'reveal');
  const locked = busy || !connected;
  const crew = <CrewPanel state={gameState} busy={busy} onLeave={actions.leaveRoom} />;

  return (
    <>
      <div className="shell">
        <a href="#main" className="skip-link">
          Skip to station
        </a>
        <DeskBar state={gameState} connected={connected} />

        {/* Zero height: notices float over the station instead of shoving it down mid-tap. */}
        <div className="relative z-[2] h-0">
          <div className="absolute inset-x-0 top-0 space-y-px">
            {!connected && <Notice>Link lost. Holding your seat while we reconnect.</Notice>}
            {error && (
              <Notice tone="paper" onDismiss={session.clearError}>
                {error}
              </Notice>
            )}
            {updateNotice}
          </div>
        </div>

        <div className="console" data-layout={lobby ? 'lobby' : 'game'}>
          <main id="main" tabIndex={-1} className="scroller gutter outline-none">
            <div
              key={stage}
              className={`screen-in h-full ${lobby ? '' : `mx-auto py-4 ${over ? 'max-w-[640px]' : 'max-w-[460px]'}`}`}
            >
              {lobby ? (
                <Lobby
                  state={gameState}
                  busy={locked}
                  onChooseTeam={actions.chooseTeam}
                  onStart={actions.startGame}
                  onLeave={actions.leaveRoom}
                />
              ) : over ? (
                <GameOver state={gameState} busy={busy} onLeave={actions.leaveRoom} />
              ) : (
                <Station
                  state={gameState}
                  busy={locked}
                  onSubmitClues={actions.submitClues}
                  onUpdateGuess={actions.updateGuess}
                  onLockGuess={actions.lockGuess}
                  onNextRound={actions.nextRound}
                />
              )}
            </div>
          </main>
          {!lobby && (
            <aside className="scroller gutter hidden py-4 console:block" aria-label="Transmission log">
              <LogPanel state={gameState} />
            </aside>
          )}
        </div>

        {!lobby && (
          <nav aria-label="Station tools" className="hw-dock gutter dock relative z-[1]">
            {hasKeywords && (
              <button type="button" onClick={() => setSheet('keywords')} className="hw-key">
                Keywords
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheet('log')}
              className="hw-key dock-log"
            >
              Log
            </button>
            <button type="button" onClick={() => setSheet('crew')} className="hw-key">
              Crew
            </button>
          </nav>
        )}
      </div>

      <Sheet open={sheet === 'keywords'} title="Your keywords" onClose={() => setSheet(null)}>
        {sheet === 'keywords' && <KeywordPanel state={gameState} mode="peek" />}
      </Sheet>
      <Sheet open={sheet === 'log'} title="Transmission log" onClose={() => setSheet(null)}>
        <LogPanel state={gameState} />
      </Sheet>
      <Sheet open={sheet === 'crew'} title="Crew" onClose={() => setSheet(null)}>
        {crew}
      </Sheet>
      <p className="sr-only" aria-live="polite">
        {lobby ? 'Lobby' : `Round ${gameState.round}, ${phaseLabel(gameState.phase)}`}
      </p>
    </>
  );
}
