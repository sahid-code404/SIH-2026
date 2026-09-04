"use client";

import { useState } from "react";
import { Dialog, Drawer, Popover, Sheet } from "./ui/overlays";
import {
  DataTable,
  FilterBar,
  MobileCardList,
  Pagination,
  Search,
  Stepper,
  Timeline,
  type TableColumn,
} from "./ui/patterns";
import { Button, Card, Select, StatusBadge } from "./ui/primitives";

type ComponentRow = {
  id: string;
  component: string;
  category: string;
  state: "Implemented" | "In review";
};

const rows: ComponentRow[] = [
  { id: "button", component: "Button", category: "Action", state: "Implemented" },
  { id: "dialog", component: "Dialog / Sheet / Drawer", category: "Overlay", state: "Implemented" },
  { id: "table", component: "DataTable / MobileCardList", category: "Data", state: "Implemented" },
  { id: "stepper", component: "Timeline / Stepper", category: "Workflow", state: "In review" },
];

const columns: TableColumn<ComponentRow>[] = [
  { key: "component", header: "Component", render: (row) => <strong>{row.component}</strong> },
  { key: "category", header: "Category", render: (row) => row.category },
  {
    key: "state",
    header: "State",
    align: "end",
    render: (row) => <StatusBadge tone={row.state === "Implemented" ? "success" : "info"}>{row.state}</StatusBadge>,
  },
];

export function DesignSystemShowcase() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);

  return (
    <div className="nx-pattern-stack">
      <Card className="nx-pattern-panel" as="section">
        <h3>Overlays</h3>
        <p>Native dialog semantics provide focus trapping and Escape handling; close controls remain explicit.</p>
        <div className="nx-button-row">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>Open sheet</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          <Popover label="Open popover">
            This is a neutral disclosure surface for compact contextual information.
          </Popover>
        </div>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Dialog component review"
        description="Neutral design-system example. No domain action is performed."
        footer={<Button onClick={() => setDialogOpen(false)}>Done</Button>}
      >
        <p>Dialog content remains readable, keyboard-contained by the native modal dialog, and dismissible with Escape.</p>
      </Dialog>

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Sheet component review"
        description="Right-side detail surface for future contextual workflows."
        footer={<Button onClick={() => setSheetOpen(false)}>Done</Button>}
      >
        <p>The sheet uses the same modal semantics and token system as the centered dialog.</p>
      </Sheet>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Drawer component review"
        description="Bottom-aligned modal surface for narrow or touch-focused tasks."
        footer={<Button onClick={() => setDrawerOpen(false)}>Done</Button>}
      >
        <p>The drawer is a layout variant, not a separate accessibility model.</p>
      </Drawer>

      <div className="nx-pattern-split">
        <Card className="nx-pattern-panel" as="section">
          <h3>Responsive data pattern</h3>
          <p>The table becomes a card list on narrow screens without duplicating business data sources.</p>
          <FilterBar>
            <Search id="component-search" placeholder="Search component examples" />
            <Select aria-label="Component category" defaultValue="all" style={{ width: "auto", minWidth: 150 }}>
              <option value="all">All categories</option>
              <option value="action">Action</option>
              <option value="overlay">Overlay</option>
              <option value="data">Data</option>
              <option value="workflow">Workflow</option>
            </Select>
          </FilterBar>

          <div style={{ marginTop: 12 }}>
            <DataTable caption="Implemented design-system component examples" columns={columns} rows={rows} />
            <MobileCardList
              rows={rows}
              render={(row) => (
                <div style={{ display: "grid", gap: 5 }}>
                  <strong>{row.component}</strong>
                  <span>{row.category}</span>
                  <StatusBadge tone={row.state === "Implemented" ? "success" : "info"}>{row.state}</StatusBadge>
                </div>
              )}
            />
            <Pagination
              currentPage={page}
              totalPages={3}
              onPrevious={() => setPage((value) => Math.max(1, value - 1))}
              onNext={() => setPage((value) => Math.min(3, value + 1))}
            />
          </div>
        </Card>

        <Card className="nx-pattern-panel" as="section">
          <h3>Workflow anatomy</h3>
          <p>Generic progression patterns are implemented before inspection-specific state machines are introduced.</p>
          <Stepper
            label="Component review progression"
            steps={[
              { id: "define", label: "Define", state: "complete" },
              { id: "implement", label: "Implement", state: "complete" },
              { id: "review", label: "Review", state: "current" },
              { id: "verify", label: "Verify", state: "upcoming" },
            ]}
          />
          <div style={{ marginTop: 18 }}>
            <Timeline
              label="Design-system implementation timeline example"
              items={[
                { id: "tokens", title: "Semantic tokens", description: "Centralized palette, radius, depth and motion contracts." },
                { id: "primitives", title: "Core primitives", description: "Buttons, fields, choices, statuses and notices." },
                { id: "patterns", title: "Responsive patterns", description: "Overlays, data presentation and workflow anatomy." },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
