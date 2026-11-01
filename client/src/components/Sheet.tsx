import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';

const DISMISS_DISTANCE = 72;

// A bottom sheet on the native <dialog>, which brings focus trapping and Esc for free.
// Opening pushes a history entry so Android's back gesture closes the sheet, not the app.
export function Sheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(props.onClose);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!props.open || !dialog) return;

    dialog.showModal();
    // The title takes focus: it announces the sheet, and Close would show a focus ring on touch.
    dialog.querySelector('h2')?.focus();
    window.history.pushState({ sheet: true }, '');
    let leftByBack = false;
    const onPop = () => {
      leftByBack = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      dialog.close();
      dialog.style.transform = '';
      if (!leftByBack) window.history.back();
    };
  }, [props.open]);

  const onGripDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onGripMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null || !dialogRef.current) return;
    const distance = Math.max(0, event.clientY - dragStart.current);
    dialogRef.current.style.transform = `translateY(${distance}px)`;
  };

  const onGripUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    const distance = event.clientY - dragStart.current;
    dragStart.current = null;
    if (distance > DISMISS_DISTANCE) props.onClose();
    else if (dialogRef.current) dialogRef.current.style.transform = '';
  };

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={props.title}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) props.onClose();
      }}
    >
      <div
        className="sheet-grip gutter"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
      >
        <h2 tabIndex={-1} className="stencil sheet-title">
          {props.title}
        </h2>
        <button type="button" onClick={props.onClose} className="hw-key sheet-close">
          Close
        </button>
      </div>
      <div className="scroller gutter pb-[calc(20px+var(--safe-bottom))] pt-4">{props.children}</div>
    </dialog>
  );
}
