import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export default function ProspectDialog({
  name, active, sections, onSelect, onClose, children,
}: {
  name: string;
  active: string;
  sections: { id: string; label: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useId();
  const open = active !== "none";
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    content.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [active]);
  return createPortal(
    <dialog
      ref={dialog}
      className="prospect-dialog"
      aria-labelledby={heading}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className="prospect-dialog-heading">
        <div><span>Business details</span><h2 id={heading}>{name}</h2></div>
        <button className="prospect-close" onClick={onClose} autoFocus>
          <Icon name="close" size={17} /> Close
        </button>
      </header>
      <nav className="prospect-sections" aria-label="Business sections">
        {sections.map((section) => (
          <button key={section.id} aria-pressed={active === section.id}
            onClick={() => onSelect(section.id)}>{section.label}</button>
        ))}
      </nav>
      <div className="prospect-dialog-content" ref={content}>{children}</div>
    </dialog>, document.body,
  );
}
