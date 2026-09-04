import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`nx-button nx-button--${variant} nx-button--${size} ${className}`.trim()}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section";
}) {
  const Component = as;
  return <Component className={`nx-card ${className}`.trim()}>{children}</Component>;
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="nx-field">
      <label className="nx-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="nx-field-hint">{hint}</p> : null}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`nx-control ${className}`.trim()} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`nx-control nx-textarea ${className}`.trim()} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`nx-control nx-select ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({
  id,
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="nx-choice" htmlFor={id}>
      <input id={id} type="checkbox" className="nx-checkbox" {...props} />
      <span className="nx-choice-copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
    </label>
  );
}

export function Switch({
  id,
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="nx-switch-row" htmlFor={id}>
      <span className="nx-choice-copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      <span className="nx-switch-control">
        <input id={id} type="checkbox" role="switch" {...props} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  return <span className={`nx-status nx-status--${tone}`}>{children}</span>;
}

export function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="nx-section-heading">
      <div>
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="nx-section-action">{action}</div> : null}
    </div>
  );
}

export function InlineNotice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`nx-notice nx-notice--${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
