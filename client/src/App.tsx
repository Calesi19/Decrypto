import { useEffect, useRef, useState } from 'react';
import { Notice } from './components/Bits';
import { CrewPanel } from './components/Crew';
import { FilterProvider } from './components/Filter';
import { GameHeader } from './components/Header';
import { LogPanel } from './components/Log';
import { ShieldPanel } from './components/Shield';
import { Sheet } from './components/Sheet';
import { cue } from './lib/feedback';
import { phaseLabel } from './lib/game';
import { useAppUpdate, useWakeLock } from './lib/pwa';
import { useGameSession } from './lib/session';
import { GameOver } from './screens/GameOver';
import { HomeScreen } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Station } from './screens/Station';

type SheetName = 'shield' | 'log' | 'crew';

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
    if (gameState?.phase === 'reveal' || gameState?.phase === 'gameover') cue('stamp');
    else if (gameState) cue('phase');
  }, [gameState, stage]);

  useEffect(() => {
    document.title =
      gameState && gameState.phase !== 'lobby'
        ? `${phaseLabel(gameState.phase)} · ${gameState.roomCode} · Decrypto`
        : 'Decrypto — Field Cipher Unit';
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
  const hasShield = !lobby && !over && !!gameState.viewer.team;
  const locked = busy || !connected;
  const dock: { name: SheetName; label: string; count?: number }[] = [
    ...(hasShield ? [{ name: 'shield' as const, label: 'Shield' }] : []),
    { name: 'log', label: 'Log', count: gameState.roundHistory.length },
    { name: 'crew', label: 'Crew', count: gameState.players.length },
  ];
  const crew = <CrewPanel state={gameState} busy={busy} onLeave={actions.leaveRoom} />;

  return (
    <FilterProvider sealKey={stage}>
      <div className="shell">
        <a href="#main" className="skip-link">
          Skip to station
        </a>
        <GameHeader state={gameState} connected={connected} />

        {/* Zero height: notices float over the station instead of shoving it down mid-tap. */}
        <div className="relative z-[2] h-0">
          <div className="absolute inset-x-0 top-0 space-y-px">
            {!connected && <Notice>Link lost. Holding your seat while we reconnect.</Notice>}
            {error && (
              <Notice tone="red" onDismiss={session.clearError}>
                {error}
              </Notice>
            )}
            {updateNotice}
          </div>
        </div>

        <div className="console" data-layout={lobby ? 'lobby' : 'game'}>
          {!lobby && (
            <aside className="scroller gutter hidden space-y-6 py-4 console:block" aria-label="Team">
              {hasShield && <ShieldPanel state={gameState} />}
              {crew}
            </aside>
          )}
          <main id="main" tabIndex={-1} className="scroller gutter outline-none">
            <div key={stage} className={`screen-in h-full ${lobby ? '' : 'mx-auto max-w-[640px] py-4'}`}>
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
            <aside className="scroller gutter hidden py-4 console:block" aria-label="Intercept log">
              <LogPanel state={gameState} />
            </aside>
          )}
        </div>

        {!lobby && (
          <nav
            aria-label="Station tools"
            className="dock relative z-[1] grid auto-cols-fr grid-flow-col border-t border-rule bg-casing pb-[var(--safe-bottom)] console:hidden"
          >
            {dock.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setSheet(item.name)}
                className="eyebrow flex min-h-14 items-center justify-center gap-2 border-l border-rule text-ink first:border-l-0"
              >
                {item.label}
                {item.count !== undefined && <span className="text-muted">{item.count}</span>}
              </button>
            ))}
          </nav>
        )}
      </div>

      <Sheet open={sheet === 'shield'} title="Encryption shield" onClose={() => setSheet(null)}>
        <ShieldPanel state={gameState} />
      </Sheet>
      <Sheet open={sheet === 'log'} title="Intercept log" onClose={() => setSheet(null)}>
        <LogPanel state={gameState} />
      </Sheet>
      <Sheet open={sheet === 'crew'} title="Crew" onClose={() => setSheet(null)}>
        {crew}
      </Sheet>
      <p className="sr-only" aria-live="polite">
        {lobby ? 'Lobby' : `Round ${gameState.round}, ${phaseLabel(gameState.phase)}`}
      </p>
    </FilterProvider>
  );
}
