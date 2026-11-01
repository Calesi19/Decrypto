import { useState } from 'react';
import type { PlayerView } from '@decrypto/shared';
import { setSoundEnabled, soundEnabled } from '../lib/feedback';
import { TEAMS, teamName } from '../lib/game';
import { ArmedButton, Tag } from './Bits';
import { InterceptChip, MissChip, ToggleSwitch } from './Hardware';

export function CrewPanel(props: { state: PlayerView; busy: boolean; onLeave: () => void }) {
  const { state } = props;
  const [sound, setSound] = useState(soundEnabled);
  return (
    <div className="space-y-5">
      {TEAMS.map((team) => (
        <section key={team} className="space-y-1" aria-label={`${teamName(team)} crew`}>
          <h3 className="stencil text-[24px] leading-none">{teamName(team)}</h3>
          <ul className="crew-list">
            {state.players
              .filter((player) => player.team === team)
              .map((player) => (
                <li key={player.id}>
                  <span className={`truncate ${player.connected ? '' : 'opacity-70'}`}>
                    {player.name}
                    {player.id === state.viewer.id && ' (you)'}
                  </span>
                  <span className="flex flex-none gap-1.5">
                    {player.isEncoder && state.phase !== 'gameover' && <Tag>Encryptor</Tag>}
                    {player.isHost && <Tag>Host</Tag>}
                    {!player.connected && <Tag>Offline</Tag>}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section className="legend">
        <p>
          <InterceptChip filled />
          Two intercepts win the game.
        </p>
        <p>
          <MissChip filled />
          Two misreads lose it.
        </p>
      </section>

      <div className="terminal">
        <ToggleSwitch
          label="Sound effects"
          checked={sound}
          onChange={(next) => {
            setSoundEnabled(next);
            setSound(next);
          }}
        />
      </div>
      <ArmedButton
        label="Leave room"
        armedLabel="Tap again to leave"
        disabled={props.busy}
        onConfirm={props.onLeave}
      />
    </div>
  );
}
