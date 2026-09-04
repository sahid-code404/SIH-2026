"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./primitives";

type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

function NativeDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  variant,
}: OverlayProps & { variant: "dialog" | "sheet" | "drawer" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `${variant}-title`;
  const descriptionId = description ? `${variant}-description` : undefined;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`nx-dialog nx-dialog--${variant}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="nx-dialog-panel">
        <header className="nx-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <Button variant="ghost" size="sm" aria-label={`Close ${title}`} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </header>

        <div className="nx-dialog-body">{children}</div>
        {footer ? <footer className="nx-dialog-footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

export function Dialog(props: OverlayProps) {
  return <NativeDialog {...props} variant="dialog" />;
}

export function Sheet(props: OverlayProps) {
  return <NativeDialog {...props} variant="sheet" />;
}

export function Drawer(props: OverlayProps) {
  return <NativeDialog {...props} variant="drawer" />;
}

export function Popover({
  label,
  children,
  align = "end",
}: {
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <details className={`nx-popover nx-popover--${align}`}>
      <summary>{label}</summary>
      <div className="nx-popover-panel">{children}</div>
    </details>
  );
}
