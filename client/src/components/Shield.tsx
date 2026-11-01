import type { PlayerView } from '@decrypto/shared';
import { CodeCard, HoldButton, Terminal, ToggleSwitch, useShutters } from './Hardware';

// `peek` shows the keywords only while held. `latch` opens on a hold and stays open,
// for work that needs the keywords on screen: the team cannot decode one-handed.
export function KeywordPanel({ state, mode }: { state: PlayerView; mode: 'peek' | 'latch' }) {
  const { latched, setLatched, held, setHeld, open } = useShutters();
  const team = state.viewer.team;
  if (!team) return null;
  const code = state.encoders[team] === state.viewer.id ? state.currentCode : null;

  return (
    <div className="space-y-3">
      <Terminal
        team={team}
        open={open}
        words={state.keywords[team] ?? []}
        lit={code}
        control={
          latched ? (
            <ToggleSwitch label="Shutters" checked={latched} onChange={setLatched} />
          ) : undefined
        }
      />
      {!latched && (
        <HoldButton
          label={mode === 'latch' ? 'Hold to open' : 'Hold to view'}
          onOpen={() => (mode === 'latch' ? setLatched(true) : setHeld(true))}
          onRelease={() => setHeld(false)}
        />
      )}
      {open && code && <CodeCard code={code} round={state.round} />}
    </div>
  );
}
