import type { ReactNode } from "react";
import { Button, Input } from "./primitives";

export function Search({
  id,
  label = "Search",
  placeholder = "Search",
  defaultValue,
}: {
  id: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="nx-search">
      <label className="nx-sr-only" htmlFor={id}>{label}</label>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <Input id={id} type="search" placeholder={placeholder} defaultValue={defaultValue} />
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="nx-filter-bar" aria-label="Filters">{children}</div>;
}

export type TableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  align?: "start" | "end";
};

export function DataTable<Row extends { id: string }>({
  caption,
  columns,
  rows,
  emptyMessage = "No records available.",
}: {
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  emptyMessage?: string;
}) {
  return (
    <div className="nx-table-wrap">
      <table className="nx-table">
        <caption className="nx-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === "end" ? "nx-align-end" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === "end" ? "nx-align-end" : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="nx-table-empty">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MobileCardList<Row extends { id: string }>({
  rows,
  render,
  emptyMessage = "No records available.",
}: {
  rows: Row[];
  render: (row: Row) => ReactNode;
  emptyMessage?: string;
}) {
  return (
    <div className="nx-mobile-card-list">
      {rows.length ? rows.map((row) => <article key={row.id}>{render(row)}</article>) : <p>{emptyMessage}</p>}
    </div>
  );
}

export function Pagination({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}: {
  currentPage: number;
  totalPages: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  return (
    <nav className="nx-pagination" aria-label="Pagination">
      <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={onPrevious}>Previous</Button>
      <span aria-live="polite">Page {currentPage} of {Math.max(totalPages, 1)}</span>
      <Button variant="secondary" size="sm" disabled={currentPage >= totalPages} onClick={onNext}>Next</Button>
    </nav>
  );
}

export type TimelineItem = {
  id: string;
  title: string;
  description?: string;
  meta?: string;
};

export function Timeline({ items, label = "Timeline" }: { items: TimelineItem[]; label?: string }) {
  return (
    <ol className="nx-timeline" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <span className="nx-timeline-dot" aria-hidden="true" />
          <div>
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
            {item.meta ? <small>{item.meta}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type Step = {
  id: string;
  label: string;
  state: "complete" | "current" | "upcoming";
};

export function Stepper({ steps, label = "Progress" }: { steps: Step[]; label?: string }) {
  return (
    <ol className="nx-stepper" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.id} className={`nx-step nx-step--${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
          <span aria-hidden="true">{step.state === "complete" ? "✓" : index + 1}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}
