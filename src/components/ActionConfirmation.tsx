import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export default function ActionConfirmation({
  title, description, recipient, subject, nextLabel, onNext, onClose,
}: {
  title: string;
  description: string;
  recipient: string;
  subject: string;
  nextLabel: string;
  onNext: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const detail = useId();
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(
    <dialog ref={dialog} className="action-confirmation" aria-labelledby={heading}
      aria-describedby={detail}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); onClose();
        }
      }}>
      <button className="icon-button confirmation-close" onClick={onClose} aria-label="Close confirmation">
        <Icon name="close" size={18} />
      </button>
      <span className="confirmation-check" aria-hidden="true"><Icon name="check" size={28} /></span>
      <h2 id={heading}>{title}</h2>
      <p id={detail}>{description}</p>
      <dl><dt>To</dt><dd>{recipient}</dd><dt>Subject</dt><dd>{subject}</dd></dl>
      <div className="confirmation-actions">
        <button className="button button-blue" onClick={onNext} autoFocus>{nextLabel}</button>
        <button className="text-link" onClick={onClose}>Done</button>
      </div>
    </dialog>, document.body,
  );
}
