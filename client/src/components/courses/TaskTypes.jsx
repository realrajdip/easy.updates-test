import React, { useEffect, useState } from 'react';
import {
  CheckCircle2, Circle, ExternalLink, Link2, MessageSquareText,
  CheckSquare, XCircle, Trash2, Plus, ListChecks, BadgeCheck
} from 'lucide-react';
import { Markdown } from './Blocks';

/* ────────────────────────────────────────────────────────────────────── */
/* Task type registry                                                     */
/* ────────────────────────────────────────────────────────────────────── */

export const TASK_TYPES = [
  { key: 'check',    label: 'Checkbox',   icon: CheckSquare,       description: 'Mark as done' },
  { key: 'link',     label: 'Visit link', icon: Link2,             description: 'Open a URL and confirm' },
  { key: 'response', label: 'Response',   icon: MessageSquareText, description: 'Written reflection' },
  { key: 'quiz',     label: 'Quiz',       icon: ListChecks,        description: 'Multiple-choice question' }
];

export const taskTypeMeta = (type) =>
  TASK_TYPES.find((t) => t.key === type) || TASK_TYPES[0];

/* ────────────────────────────────────────────────────────────────────── */
/* Editor fields per task type                                            */
/* ────────────────────────────────────────────────────────────────────── */

export const TaskTypeEditor = ({ task, onChange }) => {
  const update = (patch) => onChange({ ...task, ...patch });
  const type = task.type || 'check';

  if (type === 'link') {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">URL to visit</span>
        <input
          className="input"
          value={task.url || ''}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://…"
        />
        <span className="text-[11px] text-ink-dim">
          Participants will see an "Open link" button. Clicking it marks the task complete.
        </span>
      </label>
    );
  }

  if (type === 'response') {
    return (
      <p className="text-[12px] text-ink-dim leading-relaxed">
        Participants will write a free-text answer. Submitting it marks the task complete and stores their response for owners/managers to review.
      </p>
    );
  }

  if (type === 'quiz') {
    const options = task.options?.length ? task.options : ['', ''];
    const correctIndex = Number.isInteger(task.correctIndex) ? task.correctIndex : 0;

    const setOption = (i, val) => {
      const next = [...options];
      next[i] = val;
      update({ options: next });
    };
    const addOption = () => {
      if (options.length >= 8) return;
      update({ options: [...options, ''] });
    };
    const removeOption = (i) => {
      if (options.length <= 2) return;
      const next = options.filter((_, idx) => idx !== i);
      let ci = correctIndex;
      if (i === correctIndex) ci = 0;
      else if (i < correctIndex) ci = correctIndex - 1;
      update({ options: next, correctIndex: ci });
    };

    return (
      <div className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Options · pick the correct answer</span>
        {options.map((o, i) => {
          const active = i === correctIndex;
          return (
            <div key={i} className={`flex items-center gap-2 rounded-md border ${active ? 'border-success/40 bg-success/[0.05]' : 'border-hairline-soft'} p-2`}>
              <button
                type="button"
                onClick={() => update({ correctIndex: i })}
                title={active ? 'Correct answer' : 'Mark as correct'}
                className="shrink-0"
              >
                {active
                  ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : <Circle className="h-4 w-4 text-ink-muted" />}
              </button>
              <input
                className="input border-transparent !bg-transparent flex-1"
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
              />
              <button
                type="button"
                className="btn-icon h-7 w-7 hover:text-danger"
                onClick={() => removeOption(i)}
                disabled={options.length <= 2}
                title="Remove option"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn-ghost btn-xs justify-start"
          onClick={addOption}
          disabled={options.length >= 8}
        >
          <Plus className="h-3 w-3" />
          Add option
        </button>
        <p className="text-[11px] text-ink-dim">Only a correct answer marks the task complete. Wrong attempts are tracked.</p>
      </div>
    );
  }

  return (
    <p className="text-[12px] text-ink-dim leading-relaxed">
      A simple checkbox the participant ticks when done.
    </p>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Runtime — what participants interact with                              */
/* ────────────────────────────────────────────────────────────────────── */

const TaskShell = ({ task, done, children, edit, onIconClick, iconInteractive }) => (
  <li className={`surface-2 rounded-lg p-4 flex flex-col gap-3 transition-colors border ${
    done ? 'border-success/30' : 'border-transparent hover:border-hairline-soft'
  }`}>
    <div className="flex items-start gap-3">
      {iconInteractive ? (
        <button
          type="button"
          onClick={onIconClick}
          disabled={!onIconClick}
          className={`mt-0.5 shrink-0 ${onIconClick ? 'cursor-pointer' : 'cursor-not-allowed'}`}
          title={done ? 'Mark not done' : 'Mark done'}
        >
          {done
            ? <CheckCircle2 className="h-5 w-5 text-success" />
            : <Circle className="h-5 w-5 text-ink-muted hover:text-ink" />}
        </button>
      ) : (
        <div className="mt-0.5 shrink-0">
          {done
            ? <CheckCircle2 className="h-5 w-5 text-success" />
            : <Circle className="h-5 w-5 text-ink-dim" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className={`text-[14px] tracking-tight flex-1 min-w-0 ${done ? 'text-ink-muted' : 'text-ink font-medium'}`}>
            {task.title}
          </p>
          <TaskTypeBadge type={task.type} />
          {!task.required && <span className="text-[10px] uppercase tracking-[0.16em] text-ink-dim shrink-0">optional</span>}
        </div>
        {task.instructions && (
          <p className="text-[12px] text-ink-muted mt-1 leading-relaxed whitespace-pre-wrap">
            <Markdown text={task.instructions} />
          </p>
        )}
      </div>
      {edit && <div className="flex items-center gap-1 shrink-0">{edit}</div>}
    </div>
    {children && <div className="pl-8">{children}</div>}
  </li>
);

const TaskTypeBadge = ({ type }) => {
  const meta = taskTypeMeta(type);
  const Icon = meta.icon;
  return (
    <span className="chip shrink-0" title={meta.label}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
};

export const TaskRunner = ({ task, progress, role, onSubmit, edit }) => {
  const completedSet = new Set((progress?.completedTaskIds || []).map(String));
  const myResponse = (progress?.responses || []).find((r) => String(r.taskId) === String(task._id));
  const done = completedSet.has(String(task._id));
  const canInteract = !!role;

  if (task.type === 'check') {
    return (
      <TaskShell
        task={task}
        done={done}
        edit={edit}
        iconInteractive
        onIconClick={canInteract ? () => onSubmit({ completed: !done }) : null}
      />
    );
  }

  if (task.type === 'link') {
    const safe = /^https?:\/\//i.test(task.url || '');
    return (
      <TaskShell task={task} done={done} edit={edit}>
        <div className="flex flex-wrap items-center gap-2">
          {safe ? (
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => canInteract && onSubmit({})}
              className={`btn btn-sm ${done ? 'btn-secondary' : 'btn-primary'}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {done ? 'Open again' : 'Open link'}
            </a>
          ) : (
            <span className="text-[12px] text-danger">Invalid URL — contact the course owner.</span>
          )}
          {done && (
            <span className="chip chip-success"><CheckCircle2 className="h-3 w-3" />Visited</span>
          )}
        </div>
        {task.url && <p className="text-[11px] text-ink-dim mt-1 truncate">{task.url}</p>}
      </TaskShell>
    );
  }

  if (task.type === 'response') {
    return (
      <TaskShell task={task} done={done} edit={edit}>
        <ResponseRunner
          task={task}
          existing={myResponse?.text || ''}
          canInteract={canInteract}
          done={done}
          onSubmit={(text) => onSubmit({ response: text })}
        />
      </TaskShell>
    );
  }

  if (task.type === 'quiz') {
    return (
      <TaskShell task={task} done={done} edit={edit}>
        <QuizRunner
          task={task}
          existing={myResponse}
          canInteract={canInteract}
          done={done}
          onSubmit={(choiceIndex) => onSubmit({ choiceIndex })}
        />
      </TaskShell>
    );
  }

  return null;
};

/* ── Response runner ─────────────────────────────────────────────────── */
const ResponseRunner = ({ existing, canInteract, done, onSubmit }) => {
  const [text, setText] = useState(existing || '');
  const [editing, setEditing] = useState(!existing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setText(existing || '');
    setEditing(!existing);
  }, [existing]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing && existing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="surface-1 border border-hairline-soft rounded-md p-3 text-[13px] text-ink whitespace-pre-wrap leading-relaxed">
          {existing}
        </div>
        {canInteract && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-xs self-start">
            Edit response
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        disabled={!canInteract}
        placeholder="Write your response…"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={!canInteract || !text.trim() || busy}
          data-loading={busy ? 'true' : undefined}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          {done ? 'Save changes' : 'Submit response'}
        </button>
        {existing && (
          <button type="button" onClick={() => { setText(existing); setEditing(false); }} className="btn btn-ghost btn-sm">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

/* ── Quiz runner ─────────────────────────────────────────────────────── */
const QuizRunner = ({ task, existing, canInteract, done, onSubmit }) => {
  const [choice, setChoice] = useState(existing?.choiceIndex ?? null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    setChoice(existing?.choiceIndex ?? null);
    setLastResult(existing?.isCorrect === true ? 'correct'
      : existing?.isCorrect === false ? 'wrong' : null);
  }, [existing]);

  const submit = async () => {
    if (choice == null || busy) return;
    setBusy(true);
    try {
      await onSubmit(choice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {(task.options || []).map((opt, i) => {
          const picked = choice === i;
          const isLockedRight = done && existing?.choiceIndex === i;
          return (
            <button
              type="button"
              key={i}
              onClick={() => canInteract && !done && setChoice(i)}
              disabled={!canInteract || done}
              className={`text-left rounded-md p-3 border transition-colors flex items-center gap-3 ${
                isLockedRight
                  ? 'border-success/40 bg-success/[0.06]'
                  : picked
                    ? 'border-accent/40 bg-accent/[0.06]'
                    : 'border-hairline-soft bg-surface-1 hover:border-hairline'
              }`}
            >
              {picked || isLockedRight
                ? <CheckCircle2 className={`h-4 w-4 ${isLockedRight ? 'text-success' : 'text-accent'}`} />
                : <Circle className="h-4 w-4 text-ink-muted" />}
              <span className="text-[13px] text-ink tracking-tight">{opt}</span>
            </button>
          );
        })}
      </div>

      {lastResult === 'wrong' && !done && (
        <div className="flex items-center gap-2 text-[12px] text-danger">
          <XCircle className="h-3.5 w-3.5" />
          Not quite — try a different option.
        </div>
      )}
      {done && (
        <div className="flex items-center gap-2 text-[12px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Correct{existing?.attempts ? ` · ${existing.attempts} attempt${existing.attempts === 1 ? '' : 's'}` : ''}
        </div>
      )}

      {!done && (
        <button
          type="button"
          className="btn btn-primary btn-sm self-start"
          onClick={submit}
          disabled={!canInteract || choice == null || busy}
          data-loading={busy ? 'true' : undefined}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          Submit answer
        </button>
      )}
    </div>
  );
};
