import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TeamId } from '@decrypto/shared';
import { cue } from '../lib/feedback';
import { teamFill, teamMark, teamName } from '../lib/game';

const CHARACTER_MS = 26;
const typed = new Set<string>();

// Prints like a teletype, once per message. The unprinted tail stays in the layout, so
// the block never reflows as characters land.
export function Teletype(props: { id: string; text: string; delay?: number }) {
  const instant = useMemo(
    () =>
      typed.has(props.id) || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [props.id],
  );
  const [shown, setShown] = useState(instant ? props.text.length : 0);

  useEffect(() => {
    if (shown >= props.text.length) {
      typed.add(props.id);
      return;
    }
    const timer = window.setTimeout(
      () => setShown((count) => count + 1),
      shown === 0 ? (props.delay ?? 0) : CHARACTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [props.delay, props.id, props.text.length, shown]);

  const printing = shown < props.text.length;
  return (
    <>
      <span className="sr-only">{props.text}</span>
      <span aria-hidden="true">
        {props.text.slice(0, shown)}
        {printing && <span className="cursor" />}
        {printing && <span className="invisible">{props.text.slice(shown + 1)}</span>}
      </span>
    </>
  );
}

// For anything that cannot be undone: the first tap arms it, the second fires.
export function ArmedButton(props: {
  label: string;
  armedLabel: string;
  disabled?: boolean;
  primary?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = () => {
    window.clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      props.onConfirm();
      return;
    }
    setArmed(true);
    cue('tick');
    timer.current = window.setTimeout(() => setArmed(false), 3500);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={props.disabled}
      className={`btn ${armed ? 'btn-armed' : props.primary ? 'btn-primary' : ''}`}
    >
      {armed ? props.armedLabel : props.label}
    </button>
  );
}

export function TeamTag({ team, size = 'sm' }: { team: TeamId; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`inline-flex flex-none items-center justify-center font-display text-black ${teamFill(team)} ${
        size === 'lg' ? 'h-8 w-8 text-xl' : 'h-5 w-5 text-sm'
      }`}
      aria-hidden="true"
    >
      {teamMark(team)}
    </span>
  );
}

export function TeamLabel({ team }: { team: TeamId }) {
  return (
    <span className="flex items-center gap-2">
      <TeamTag team={team} />
      <span className="eyebrow">{teamName(team)}</span>
    </span>
  );
}

export function StationHead(props: { eyebrow: string; title: string; note?: string }) {
  return (
    <header>
      <p className="eyebrow text-phosphor">{props.eyebrow}</p>
      <h2 className="headline mt-1">{props.title}</h2>
      {props.note && <p className="mt-2 text-sm leading-6 text-muted">{props.note}</p>}
    </header>
  );
}

export function SectionRule({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <span className="eyebrow flex-none">{children}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

export function StatusLine(props: { label: ReactNode; value: string; live?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-rule last:border-b-0">
      <span>{props.label}</span>
      <span className={`eyebrow ${props.live ? 'text-secure-ink' : 'text-muted'}`}>
        {props.value}
      </span>
    </div>
  );
}

export function Notice(props: {
  tone?: 'amber' | 'red';
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  quiet?: boolean;
}) {
  const toneClass =
    props.tone === 'red'
      ? 'border-compromised text-compromised-ink'
      : 'border-intercepted text-intercepted';
  return (
    <div
      role={props.quiet ? undefined : 'alert'}
      className={`flex items-center justify-between gap-3 border-l-4 bg-plate px-3 py-2 text-sm ${toneClass}`}
    >
      <span>{props.children}</span>
      {props.onDismiss && (
        <button type="button" onClick={props.onDismiss} className="eyebrow min-h-11 flex-none px-1">
          {props.dismissLabel ?? 'Clear'}
        </button>
      )}
    </div>
  );
}
