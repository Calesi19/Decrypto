import { useState } from 'react';
import type { PlayerView } from '@decrypto/shared';
import { setSoundEnabled, soundEnabled } from '../lib/feedback';
import { TEAMS, teamName } from '../lib/game';
import { ArmedButton, SectionRule, TeamLabel } from './Bits';

export function Tag({ children }: { children: string }) {
  return (
    <span className="border border-current px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}

export function CrewPanel(props: { state: PlayerView; busy: boolean; onLeave: () => void }) {
  const { state } = props;
  const [sound, setSound] = useState(soundEnabled);
  return (
    <div className="space-y-5">
      {TEAMS.map((team) => (
        <section key={team} className="space-y-1" aria-label={`${teamName(team)} crew`}>
          <TeamLabel team={team} />
          <ul>
            {state.players
              .filter((player) => player.team === team)
              .map((player) => (
                <li
                  key={player.id}
                  className="flex min-h-10 items-center justify-between gap-2 border-b border-rule text-sm"
                >
                  <span className={`truncate ${player.connected ? 'text-ink' : 'text-dim'}`}>
                    {player.name}
                    {player.id === state.viewer.id && ' (you)'}
                  </span>
                  <span className="flex flex-none gap-1.5">
                    {player.isEncoder && state.phase !== 'gameover' && <Tag>Encoder</Tag>}
                    {player.isHost && <Tag>Host</Tag>}
                    {!player.connected && <Tag>Offline</Tag>}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section className="space-y-2 text-sm leading-6 text-muted">
        <SectionRule>Tokens</SectionRule>
        <p>
          <span className="text-secure-ink">INT</span> interceptions made. Two wins the game.
        </p>
        <p>
          <span className="text-compromised-ink">MIS</span> miscommunications. Two loses it.
        </p>
      </section>

      <div className="space-y-2">
        <button
          type="button"
          className="btn"
          aria-pressed={sound}
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }}
        >
          Sound: {sound ? 'On' : 'Off'}
        </button>
        <ArmedButton
          label="Leave room"
          armedLabel="Tap again to leave"
          disabled={props.busy}
          onConfirm={props.onLeave}
        />
      </div>
    </div>
  );
}
