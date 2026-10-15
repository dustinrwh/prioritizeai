import { STATUSES, STATUS_LABELS, compareForBoard, todayISO, type Status, type SubmissionDTO } from '@prioritize/shared';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Drawer from '../components/Drawer';
import PlanModal from '../components/PlanModal';
import { Avatar, PriorityBadge, TypeChip, useToast } from '../components/ui';
import { ApiFail } from '../lib/api';
import { fmtDate } from '../lib/format';
import { usePatchSubmission, useSubmissions } from '../lib/queries';

function CardBody({ s, highlight }: { s: SubmissionDTO; highlight?: boolean }) {
  const overdue = s.date_needed_by < todayISO();
  return (
    <div className={`rounded-md border bg-surface p-3 text-left ${highlight ? 'border-accent' : 'border-line'}`}>
      <div className="text-sm font-medium line-clamp-2">{s.title}</div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <PriorityBadge priority={s.priority} />
        <TypeChip type={s.type} />
      </div>
      <div className={`mt-2 text-xs font-mono ${overdue ? 'text-critical' : 'text-muted'}`}>Needed {fmtDate(s.date_needed_by)}</div>
      {(s.status === 'planned' || s.status === 'done') && s.start_date && <div className="text-xs font-mono text-muted">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</div>}
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{s.impacted_users.toLocaleString()} users</span>
        <Avatar user={s.submitted_by} size={20} />
      </div>
    </div>
  );
}

function Card({ s, onOpen, highlight }: { s: SubmissionDTO; onOpen: () => void; highlight: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: s.id, data: { s } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className={`cursor-grab rounded-md hover:bg-surface-2 ${isDragging ? 'opacity-30' : ''} ${highlight ? 'animate-pulse' : ''}`}>
      <CardBody s={s} highlight={highlight} />
    </div>
  );
}

function Column({ status, items, onOpen, highlightId }: { status: Status; items: SubmissionDTO[]; onOpen: (id: string) => void; highlightId?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={STATUS_LABELS[status]} className={`w-80 shrink-0 flex flex-col rounded-lg border bg-surface/60 ${isOver ? 'border-accent' : 'border-line'}`}>
      <header className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h2 className="text-sm font-semibold">{STATUS_LABELS[status]}</h2>
        <span className="chip" aria-label={`${items.length} cards`}>{items.length}</span>
      </header>
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {items.map((s) => <Card key={s.id} s={s} onOpen={() => onOpen(s.id)} highlight={s.id === highlightId} />)}
      </div>
    </section>
  );
}

export default function Backlog() {
  const { data = [], isLoading } = useSubmissions();
  const patch = usePatchSubmission();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  const [highlightId, setHighlightId] = useState<string | undefined>((loc.state as { highlight?: string } | null)?.highlight);
  const [dragging, setDragging] = useState<SubmissionDTO | null>(null);
  const [planFor, setPlanFor] = useState<SubmissionDTO | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const openId = params.get('s');

  useEffect(() => { if (highlightId) { const t = setTimeout(() => setHighlightId(undefined), 4000); return () => clearTimeout(t); } }, [highlightId]);

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const s = e.active.data.current?.s as SubmissionDTO | undefined;
    const to = e.over?.id as Status | undefined;
    if (!s || !to || to === s.status) return;
    if (to === 'planned') { setPlanFor(s); return; }
    try { await patch.mutateAsync({ id: s.id, patch: { status: to } }); }
    catch (err) { toast(err instanceof ApiFail ? err.message : 'Could not move card', 'error'); }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 gap-4">
      <h1 className="text-xl font-semibold">Backlog</h1>
      {isLoading ? <p className="text-muted">Loading…</p> : (
        <DndContext sensors={sensors} onDragStart={(e) => setDragging((e.active.data.current?.s as SubmissionDTO) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex gap-4 flex-1 min-h-0 overflow-x-auto pb-2" style={{ height: 'calc(100vh - 8.5rem)' }}>
            {STATUSES.map((st) => (
              <Column key={st} status={st} items={data.filter((s) => s.status === st).sort(compareForBoard)} onOpen={(id) => setParams({ s: id })} highlightId={highlightId} />
            ))}
          </div>
          <DragOverlay>{dragging && <div className="border-l-2 border-accent rounded-md"><CardBody s={dragging} /></div>}</DragOverlay>
        </DndContext>
      )}
      {planFor && (
        <PlanModal title={planFor.title} initialStart={planFor.start_date} initialEnd={planFor.end_date} onCancel={() => setPlanFor(null)}
          onConfirm={async (start, end) => { await patch.mutateAsync({ id: planFor.id, patch: { status: 'planned', start_date: start, end_date: end } }); setPlanFor(null); }} />
      )}
      {openId && <Drawer id={openId} onClose={() => setParams({})} />}
    </div>
  );
}
