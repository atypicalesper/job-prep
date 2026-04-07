'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Plus, Trash2, Check, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import {
  type Pathway,
  type PathwayItem,
  loadPathways,
  savePathways,
  mkPathway,
  mkItem,
} from '@/lib/pathway';

// ─── helpers ──────────────────────────────────────────────────────────────────

function pct(pathway: Pathway) {
  if (!pathway.items.length) return 0;
  return Math.round((pathway.items.filter(i => i.done).length / pathway.items.length) * 100);
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PathwayClient() {
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [newName, setNewName]   = useState('');
  const [adding, setAdding]     = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPathways(loadPathways());
  }, []);

  function persist(next: Pathway[]) {
    setPathways(next);
    savePathways(next);
  }

  function addPathway() {
    if (!newName.trim()) return;
    persist([...pathways, mkPathway(newName)]);
    setNewName('');
    setAdding(false);
  }

  function deletePathway(id: string) {
    persist(pathways.filter(p => p.id !== id));
  }

  function renamePathway(id: string, name: string) {
    persist(pathways.map(p => p.id === id ? { ...p, name } : p));
  }

  function updateItems(id: string, items: PathwayItem[]) {
    persist(pathways.map(p => p.id === id ? { ...p, items } : p));
  }

  const totalItems = pathways.reduce((s, p) => s + p.items.length, 0);
  const doneItems  = pathways.reduce((s, p) => s + p.items.filter(i => i.done).length, 0);

  return (
    <div className="px-4 sm:px-8 py-8 sm:py-10 max-w-3xl mx-auto">

      {/* header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--fg)' }}>
            🗺️ My Pathways
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Build custom study plans and track your progress.
          </p>
        </div>

        {!adding && (
          <button
            onClick={() => { setAdding(true); setTimeout(() => newNameRef.current?.focus(), 0); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={14} />
            New Pathway
          </button>
        )}
      </div>

      {/* new pathway form */}
      {adding && (
        <div
          className="flex items-center gap-2 mb-6 p-3 rounded-xl border"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}
        >
          <input
            ref={newNameRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') addPathway();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            placeholder="Pathway name…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--fg)' }}
          />
          <button
            onClick={addPathway}
            disabled={!newName.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Create
          </button>
          <button
            onClick={() => { setAdding(false); setNewName(''); }}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--sidebar-hover)]"
            style={{ color: 'var(--muted)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* empty state */}
      {pathways.length === 0 && !adding && (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed text-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-4xl mb-4">🗺️</span>
          <p className="font-semibold mb-1" style={{ color: 'var(--fg)' }}>No pathways yet</p>
          <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>Create a study plan to track topics you want to cover.</p>
          <button
            onClick={() => { setAdding(true); setTimeout(() => newNameRef.current?.focus(), 0); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={14} /> Create first pathway
          </button>
        </div>
      )}

      {/* pathway cards */}
      <div className="space-y-4">
        {pathways.map(pathway => (
          <PathwayCard
            key={pathway.id}
            pathway={pathway}
            onDelete={() => deletePathway(pathway.id)}
            onRename={name => renamePathway(pathway.id, name)}
            onItemsChange={items => updateItems(pathway.id, items)}
          />
        ))}
      </div>

      {/* summary stats */}
      {pathways.length > 0 && totalItems > 0 && (
        <div
          className="mt-8 pt-6 border-t flex gap-6 flex-wrap text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          {[
            [String(pathways.length), 'Pathways'],
            [String(totalItems),      'Topics'],
            [String(doneItems),       'Completed'],
          ].map(([n, label]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <span
                className="text-xl font-extrabold tabular-nums"
                style={{ color: 'var(--accent)', letterSpacing: '-0.02em' }}
              >
                {n}
              </span>
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── pathway card ─────────────────────────────────────────────────────────────

interface CardProps {
  pathway: Pathway;
  onDelete: () => void;
  onRename: (name: string) => void;
  onItemsChange: (items: PathwayItem[]) => void;
}

function PathwayCard({ pathway, onDelete, onRename, onItemsChange }: CardProps) {
  const [expanded, setExpanded]         = useState(true);
  const [editingName, setEditingName]   = useState(false);
  const [nameVal, setNameVal]           = useState(pathway.name);
  const [newTopic, setNewTopic]         = useState('');
  const [addingTopic, setAddingTopic]   = useState(false);
  const [editingItem, setEditingItem]   = useState<string | null>(null);
  const topicRef    = useRef<HTMLInputElement>(null);
  const nameRef     = useRef<HTMLInputElement>(null);
  const itemEditRef = useRef<HTMLInputElement>(null);

  const done  = pathway.items.filter(i => i.done).length;
  const total = pathway.items.length;
  const p     = pct(pathway);

  function commitName() {
    if (nameVal.trim()) onRename(nameVal.trim());
    else setNameVal(pathway.name);
    setEditingName(false);
  }

  function addTopic() {
    if (!newTopic.trim()) return;
    onItemsChange([...pathway.items, mkItem(newTopic)]);
    setNewTopic('');
    setTimeout(() => topicRef.current?.focus(), 0);
  }

  function toggleItem(id: string) {
    onItemsChange(pathway.items.map(i => i.id === id ? { ...i, done: !i.done } : i));
  }

  function deleteItem(id: string) {
    onItemsChange(pathway.items.filter(i => i.id !== id));
  }

  function commitItemEdit(id: string, text: string) {
    if (text.trim()) {
      onItemsChange(pathway.items.map(i => i.id === id ? { ...i, text: text.trim() } : i));
    }
    setEditingItem(null);
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
    >
      {/* card header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-0.5 rounded transition-colors hover:bg-[var(--sidebar-hover)] shrink-0"
          style={{ color: 'var(--muted)' }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {editingName ? (
          <input
            ref={nameRef}
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setNameVal(pathway.name); setEditingName(false); }
            }}
            className="flex-1 bg-transparent outline-none font-semibold text-sm"
            style={{ color: 'var(--fg)' }}
            autoFocus
          />
        ) : (
          <span
            className="flex-1 font-semibold text-sm truncate"
            style={{ color: 'var(--fg)' }}
          >
            {pathway.name}
          </span>
        )}

        {/* progress chip */}
        {total > 0 && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
            style={{
              color: p === 100 ? 'var(--success)' : 'var(--accent)',
              backgroundColor: p === 100
                ? 'rgba(var(--success-rgb,34,197,94),0.12)'
                : 'var(--accent-glow)',
            }}
          >
            {done}/{total}
          </span>
        )}

        <button
          onClick={() => { setEditingName(true); setTimeout(() => nameRef.current?.focus(), 0); }}
          className="p-1 rounded transition-colors hover:bg-[var(--sidebar-hover)] shrink-0"
          style={{ color: 'var(--muted)' }}
          title="Rename"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded transition-colors hover:bg-[var(--sidebar-hover)] shrink-0"
          style={{ color: 'var(--muted)' }}
          title="Delete pathway"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* progress bar */}
      {total > 0 && (
        <div className="px-4 pb-2">
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${p}%`,
                backgroundColor: p === 100 ? 'var(--success)' : 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}

      {/* items */}
      {expanded && (
        <div className="pb-3">
          {pathway.items.length === 0 && !addingTopic && (
            <p className="text-xs px-4 pt-1 pb-2" style={{ color: 'var(--muted)' }}>
              No topics yet. Add one below.
            </p>
          )}

          {pathway.items.map(item => (
            <div
              key={item.id}
              className="group flex items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-[var(--sidebar-hover)]"
            >
              {/* checkbox */}
              <button
                onClick={() => toggleItem(item.id)}
                className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all"
                style={{
                  borderColor: item.done ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: item.done ? 'var(--accent)' : 'transparent',
                }}
                aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
              >
                {item.done && <Check size={10} color="white" strokeWidth={3} />}
              </button>

              {/* text / inline edit */}
              {editingItem === item.id ? (
                <input
                  ref={itemEditRef}
                  defaultValue={item.text}
                  onBlur={e => commitItemEdit(item.id, e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') commitItemEdit(item.id, (e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setEditingItem(null);
                  }}
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: 'var(--fg)' }}
                  autoFocus
                />
              ) : (
                <span
                  className="flex-1 text-sm cursor-default leading-5"
                  style={{
                    color: item.done ? 'var(--muted)' : 'var(--fg)',
                    textDecoration: item.done ? 'line-through' : 'none',
                  }}
                  onDoubleClick={() => setEditingItem(item.id)}
                  title="Double-click to edit"
                >
                  {item.text}
                </span>
              )}

              {/* row actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => { setEditingItem(item.id); setTimeout(() => itemEditRef.current?.focus(), 0); }}
                  className="p-0.5 rounded hover:bg-[var(--border)]"
                  style={{ color: 'var(--muted)' }}
                  title="Edit"
                >
                  <Pencil size={10} />
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="p-0.5 rounded hover:bg-[var(--border)]"
                  style={{ color: 'var(--muted)' }}
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}

          {/* add topic row */}
          <div className="px-4 pt-1">
            {addingTopic ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border shrink-0" style={{ borderColor: 'var(--border)' }} />
                <input
                  ref={topicRef}
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') addTopic();
                    if (e.key === 'Escape') { setAddingTopic(false); setNewTopic(''); }
                  }}
                  onBlur={() => { if (!newTopic.trim()) setAddingTopic(false); }}
                  placeholder="Add a topic…"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: 'var(--fg)' }}
                  autoFocus
                />
                <button
                  onClick={addTopic}
                  disabled={!newTopic.trim()}
                  className="text-xs px-2 py-0.5 rounded transition-colors disabled:opacity-30"
                  style={{ color: 'var(--accent)' }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingTopic(true)}
                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80 py-0.5"
                style={{ color: 'var(--muted)' }}
              >
                <Plus size={11} /> Add topic
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
