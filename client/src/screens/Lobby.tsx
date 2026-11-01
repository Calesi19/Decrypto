import { useState } from 'react';
import type { PlayerView, TeamId } from '@decrypto/shared';
import { Notice, Tag, TaskHead } from '../components/Bits';
import { Lamp } from '../components/Hardware';
import { TEAMS, playerName, teamName } from '../lib/game';

function TeamBay(props: {
  team: TeamId;
  state: PlayerView;
  busy: boolean;
  onChooseTeam: (team: TeamId | null) => void;
}) {
  const members = props.state.players.filter((player) => player.team === props.team);
  const selected = props.state.viewer.team === props.team;
  return (
    <article className="terminal" data-team={props.team}>
      <div className="terminal-plate">
        <h3 className="stencil terminal-name">Team {teamName(props.team)}</h3>
        <Lamp on={selected} />
        <span className="terminal-vents" aria-hidden="true" />
      </div>
      <ul className="roster">
        {members.length ? (
          members.map((player) => (
            <li key={player.id}>
              <span className={`truncate ${player.connected ? '' : 'roster-off'}`}>
                {player.name}
                {player.id === props.state.viewer.id && ' (you)'}
              </span>
              <span className="flex flex-none gap-1.5">
                {player.isHost && <Tag>Host</Tag>}
                {!player.connected && <Tag>Offline</Tag>}
              </span>
            </li>
          ))
        ) : (
          <li className="roster-empty">Nobody yet</li>
        )}
      </ul>
      <button
        type="button"
        onClick={() => props.onChooseTeam(selected ? null : props.team)}
        disabled={props.busy}
        aria-pressed={selected}
        aria-label={`${selected ? 'Leave' : 'Join'} Team ${teamName(props.team)}`}
        className="hw-key"
      >
        {selected ? 'Leave team' : 'Join team'}
      </button>
    </article>
  );
}

function ShareRoom({ roomCode }: { roomCode: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/?room=${roomCode}`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Decrypto', text: `Join room ${roomCode}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Dismissing the share sheet rejects; nothing went wrong.
    }
  };

  return (
    <button type="button" onClick={() => void share()} className="hw-key min-w-[84px] px-3">
      {copied ? 'Copied' : 'Share'}
    </button>
  );
}

export function Lobby(props: {
  state: PlayerView;
  busy: boolean;
  onChooseTeam: (team: TeamId | null) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const { state } = props;
  const unassigned = state.players.filter((player) => !player.team);
  const short = TEAMS.filter(
    (team) => state.players.filter((player) => player.team === team).length < 2,
  );
  const ready = short.length === 0 && unassigned.length === 0;
  const host = state.players.find((player) => player.isHost);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[640px] flex-col gap-4 pt-4">
      <TaskHead state={state} title="Pick a side" note="Two players or more on each team." />

      <div className="room-plate">
        <p className="home-screen room-code">
          <span className="sr-only">Room code </span>
          {state.roomCode}
        </p>
        <ShareRoom roomCode={state.roomCode} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TEAMS.map((team) => (
          <TeamBay
            key={team}
            team={team}
            state={state}
            busy={props.busy}
            onChooseTeam={props.onChooseTeam}
          />
        ))}
      </div>

      {unassigned.length > 0 && (
        <Notice quiet tone="paper">
          Still choosing: {unassigned.map((player) => player.name).join(', ')}
        </Notice>
      )}

      {short.length > 0 && (
        <p>
          {short.map(teamName).join(' and ')} {short.length > 1 ? 'need' : 'needs'} at least two
          players.
        </p>
      )}

      {/* Sticky: browser chrome eats the viewport, and the host must always reach Begin. */}
      <div className="action-bar mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-3">
        <button
          type="button"
          onClick={props.onLeave}
          disabled={props.busy}
          className="hw-btn hw-btn-plain"
        >
          Leave
        </button>
        {state.isHost ? (
          <button onClick={props.onStart} disabled={!ready || props.busy} className="hw-btn">
            {ready ? 'Begin' : 'Waiting for teams'}
          </button>
        ) : (
          <p className="text-center">Waiting for {playerName(state, host?.id)}</p>
        )}
      </div>
    </div>
  );
}
