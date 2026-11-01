import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerView } from '@decrypto/shared';
import { cue } from '../lib/feedback';
import { phaseStep } from '../lib/game';

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
      data-armed={armed}
      className={`hw-btn ${props.primary ? '' : 'hw-btn-plain'}`}
    >
      {armed ? props.armedLabel : props.label}
    </button>
  );
}

export function Tag({ children }: { children: string }) {
  return <span className="tag">{children}</span>;
}

export function TaskHead(props: { state: PlayerView; title: string; note?: string }) {
  const { step, steps } = phaseStep(props.state);
  return (
    <header>
      {step > 0 && (
        <p className="task-step">
          Step {step} of {steps}
        </p>
      )}
      <h2 className="stencil task-title">{props.title}</h2>
      {props.note && <p className="task-note">{props.note}</p>}
    </header>
  );
}

export function Notice(props: {
  tone?: 'paper';
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  quiet?: boolean;
}) {
  return (
    <div role={props.quiet ? undefined : 'alert'} className="notice" data-tone={props.tone}>
      <span>{props.children}</span>
      {props.onDismiss && (
        <button type="button" onClick={props.onDismiss} className="min-h-11 flex-none px-1 underline">
          {props.dismissLabel ?? 'Clear'}
        </button>
      )}
    </div>
  );
}
