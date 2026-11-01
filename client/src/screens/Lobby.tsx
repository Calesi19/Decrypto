import { useState } from 'react';
import type { PlayerView, TeamId } from '@decrypto/shared';
import { Notice, StationHead, TeamTag } from '../components/Bits';
import { Tag } from '../components/Crew';
import { TEAMS, playerName, teamBorder, teamInk, teamName } from '../lib/game';

function TeamBay(props: {
  team: TeamId;
  state: PlayerView;
  busy: boolean;
  onChooseTeam: (team: TeamId | null) => void;
}) {
  const members = props.state.players.filter((player) => player.team === props.team);
  const selected = props.state.viewer.team === props.team;
  return (
    <article className={`border bg-casing ${selected ? teamBorder(props.team) : 'border-rule'}`}>
      <button
        type="button"
        onClick={() => props.onChooseTeam(selected ? null : props.team)}
        disabled={props.busy}
        aria-pressed={selected}
        className="flex min-h-14 w-full items-center gap-3 px-3 text-left"
      >
        <TeamTag team={props.team} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl uppercase tracking-[0.12em] text-white">
            Team {teamName(props.team)}
          </span>
        </span>
        <span className={`eyebrow ${teamInk(props.team)}`}>{selected ? 'Leave' : 'Join'}</span>
      </button>
      <ul className="border-t border-rule px-3 py-1 text-sm">
        {members.length ? (
          members.map((player) => (
            <li key={player.id} className="flex min-h-9 items-center justify-between gap-2">
              <span className={`truncate ${player.connected ? 'text-ink' : 'text-dim'}`}>
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
          <li className="flex min-h-9 items-center text-dim">Nobody yet</li>
        )}
      </ul>
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
    <button type="button" onClick={() => void share()} className="btn !w-auto flex-none">
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
    <div className="mx-auto flex min-h-full w-full max-w-[640px] flex-col gap-5 pt-4">
      <StationHead
        eyebrow="Assembly"
        title="Pick a side"
        note="Share the code. Everyone picks a team, two players minimum on each."
      />

      <div className="flex items-stretch gap-2">
        <p className="flex min-w-0 flex-1 items-center justify-center border border-rule bg-[#0d0d0f] font-display text-3xl tracking-[0.3em] text-phosphor">
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
        <Notice quiet>Unassigned: {unassigned.map((player) => player.name).join(', ')}</Notice>
      )}

      {short.length > 0 && (
        <p className="text-sm text-muted">
          {short.map(teamName).join(' and ')} {short.length > 1 ? 'need' : 'needs'} at least two
          players.
        </p>
      )}

      {/* Sticky: browser chrome eats the viewport, and the host must always reach Begin. */}
      <div className="sticky bottom-0 mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 bg-obsidian pb-[max(16px,var(--safe-bottom))] pt-2">
        <button type="button" onClick={props.onLeave} disabled={props.busy} className="btn">
          Leave
        </button>
        {state.isHost ? (
          <button
            onClick={props.onStart}
            disabled={!ready || props.busy}
            className="btn btn-primary"
          >
            Begin operation
          </button>
        ) : (
          <p className="flex min-h-[52px] items-center justify-center border border-rule px-2 text-center text-sm text-muted">
            Waiting for {playerName(state, host?.id)}
          </p>
        )}
      </div>
    </div>
  );
}
