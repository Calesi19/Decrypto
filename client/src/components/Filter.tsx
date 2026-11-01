import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cue } from '../lib/feedback';

interface FilterValue {
  reveal: number;
  setReveal: (value: number) => void;
  setDragging: (dragging: boolean) => void;
  toggle: () => void;
}

const FilterContext = createContext<FilterValue | null>(null);

function useFilter(): FilterValue {
  const value = useContext(FilterContext);
  if (!value) throw new Error('Filter components need a FilterProvider.');
  return value;
}

// Holds the one gel for the whole app. `sealKey` changes with the phase, and hiding the
// app also seals it, so a phone left on the table never stays decrypted.
export function FilterProvider({ sealKey, children }: { sealKey: string; children: ReactNode }) {
  const [reveal, setReveal] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setReveal(0), [sealKey]);

  useEffect(() => {
    const seal = () => {
      if (document.visibilityState === 'hidden') setReveal(0);
    };
    document.addEventListener('visibilitychange', seal);
    return () => document.removeEventListener('visibilitychange', seal);
  }, []);

  const toggle = useCallback(() => {
    setReveal((current) => (current > 50 ? 0 : 100));
    cue('tick');
  }, []);

  const value = useMemo(() => ({ reveal, setReveal, setDragging, toggle }), [reveal, toggle]);

  return (
    <FilterContext.Provider value={value}>
      <div
        className="filter-scope"
        data-dragging={dragging}
        style={{ '--reveal': reveal } as CSSProperties}
      >
        {children}
      </div>
    </FilterContext.Provider>
  );
}

function cipherFor(seed: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTVWXZ0123456789';
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  let output = '';
  // Fixed length: the masked strip must not give away how long the word is.
  for (let index = 0; index < 10; index += 1) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    output += alphabet[(hash >>> 0) % alphabet.length];
    if (index === 3) output += '-';
  }
  return output;
}

export function ShieldStrip(props: { tag: string; text: string; seed: string }) {
  const { toggle } = useFilter();
  const cipher = useMemo(() => cipherFor(props.seed), [props.seed]);
  return (
    <button type="button" className="strip" onClick={toggle}>
      <span className="strip-layer strip-cipher" aria-hidden="true">
        <span className="strip-tag">#</span>
        <span>{cipher}</span>
      </span>
      <span className="strip-layer strip-clear">
        <span className="strip-tag">{props.tag}</span>
        <span className="min-w-0 break-words">{props.text}</span>
      </span>
    </button>
  );
}

export function FilterSlider() {
  const { reveal, setReveal, setDragging, toggle } = useFilter();
  const open = reveal > 50;
  const [touched, setTouched] = useState(false);

  const settle = () => {
    setDragging(false);
    setTouched(true);
    if (reveal >= 88) setReveal(100);
    else if (reveal <= 12) setReveal(0);
    if (reveal >= 88) cue('tick');
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
      <label htmlFor="decrypt-filter" className="eyebrow self-center text-muted">
        Decrypt filter
      </label>
      <span className="eyebrow self-center text-right text-muted" aria-hidden="true">
        {reveal === 0 ? 'Sealed' : reveal === 100 ? 'Open' : `${Math.round(reveal)}%`}
      </span>
      <input
        id="decrypt-filter"
        type="range"
        min={0}
        max={100}
        value={reveal}
        className="filter-range"
        data-nudge={!touched && reveal === 0}
        aria-valuetext={reveal === 0 ? 'Sealed' : `${Math.round(reveal)} percent decrypted`}
        onPointerDown={() => setDragging(true)}
        onPointerUp={settle}
        onPointerCancel={settle}
        onChange={(event) => setReveal(Number(event.target.value))}
      />
      <button
        type="button"
        onClick={toggle}
        className="btn min-w-[76px] !w-auto !px-3"
        aria-pressed={open}
      >
        {open ? 'Seal' : 'Open'}
      </button>
    </div>
  );
}
