"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  createTaskCardAction,
  deleteTaskCardAction,
  moveTaskCardAction,
  updateTaskCardAction,
} from "@/modules/tasks/application/actions";
import type { BoardCard } from "@/modules/tasks/application/queries";
import { taskColumns, taskStatuses, isOverdue, type TaskStatus } from "@/modules/tasks/domain/task";

const input =
  "mt-1.5 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0b4f9c]";

type Member = { id: string; first_name: string; last_name: string };
type Unit = { id: string; code: string; name: string };

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-CL");
}

export function TaskBoard({
  companyId,
  cards,
  members,
  units,
}: {
  companyId: string;
  cards: BoardCard[];
  members: Member[];
  units: Unit[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        {creating ? (
          <CreateCardForm
            companyId={companyId}
            members={members}
            units={units}
            onDone={() => {
              setCreating(false);
              router.refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-xl bg-[#083f7d] px-4 py-2.5 text-sm font-semibold text-white"
          >
            + Nueva tarea
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {taskColumns.map((column) => (
          <div key={column.status} className="rounded-2xl bg-slate-100 p-3">
            <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wide text-slate-600">
              {column.label}{" "}
              <span className="font-normal text-slate-400">
                ({cards.filter((c) => c.status === column.status).length})
              </span>
            </h2>
            <div className="space-y-3">
              {cards
                .filter((card) => card.status === column.status)
                .map((card) => (
                  <TaskCard
                    key={card.id}
                    card={card}
                    members={members}
                    units={units}
                  />
                ))}
              {!cards.some((c) => c.status === column.status) && (
                <p className="px-1 text-xs text-slate-400">Sin tareas.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateCardForm({
  companyId,
  members,
  units,
  onDone,
  onCancel,
}: {
  companyId: string;
  members: Member[];
  units: Unit[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim()) {
      setMessage("Escribe un título.");
      return;
    }
    start(async () => {
      const result = await createTaskCardAction({
        company_id: companyId,
        title,
        description: description || undefined,
        assignee_id: assigneeId || undefined,
        business_unit_id: businessUnitId || undefined,
        due_date: dueDate || undefined,
      });
      if (result.success) onDone();
      else setMessage(result.message);
    });
  };

  return (
    <div className="max-w-xl rounded-2xl border bg-white p-4">
      <h2 className="font-semibold">Nueva tarea</h2>
      {message && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {message}
        </p>
      )}
      <div className="mt-3 space-y-3">
        <div>
          <label className="text-sm font-medium">Título</label>
          <input
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </div>
        <div>
          <label className="text-sm font-medium">Descripción (opcional)</label>
          <textarea
            className={input}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Responsable</label>
            <select
              className={input}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.first_name} {member.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Unidad de negocio</label>
            <select
              className={input}
              value={businessUnitId}
              onChange={(e) => setBusinessUnitId(e.target.value)}
            >
              <option value="">General / sin unidad</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Plazo</label>
            <input
              type="date"
              className={input}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded-xl bg-[#083f7d] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Creando…" : "Crear tarea"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  card,
  members,
  units,
}: {
  card: BoardCard;
  members: Member[];
  units: Unit[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const overdue = isOverdue(card.due_date, card.status);
  const index = taskStatuses.indexOf(card.status);

  const move = (status: TaskStatus) => {
    start(async () => {
      const result = await moveTaskCardAction(card.id, status);
      if (result.success) router.refresh();
      else setMessage(result.message);
    });
  };

  const remove = () => {
    if (!confirm(`¿Eliminar la tarea "${card.title}"?`)) return;
    start(async () => {
      const result = await deleteTaskCardAction(card.id);
      if (result.success) router.refresh();
      else setMessage(result.message);
    });
  };

  if (editing)
    return (
      <EditCardForm
        card={card}
        members={members}
        units={units}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
        onCancel={() => setEditing(false)}
      />
    );

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold">{card.title}</p>
      {card.description && (
        <p className="mt-1 text-xs text-slate-500">{card.description}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.business_unit && (
          <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
            {card.business_unit.name}
          </span>
        )}
        {card.assignee && (
          <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
            {card.assignee.first_name} {card.assignee.last_name}
          </span>
        )}
        {card.due_date && (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${overdue ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}
          >
            {overdue ? "Vencida: " : "Plazo: "}
            {formatDate(card.due_date)}
          </span>
        )}
      </div>
      {message && (
        <p className="mt-2 text-xs font-medium text-red-700">{message}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={pending || index === 0}
            onClick={() => move(taskStatuses[index - 1])}
            className="rounded-lg border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-30"
            title="Mover a la columna anterior"
          >
            ◀
          </button>
          <button
            type="button"
            disabled={pending || index === taskStatuses.length - 1}
            onClick={() => move(taskStatuses[index + 1])}
            className="rounded-lg border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-30"
            title="Mover a la siguiente columna"
          >
            ▶
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-[#0b4f9c]"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="text-red-700"
            title="Eliminar tarea"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCardForm({
  card,
  members,
  units,
  onDone,
  onCancel,
}: {
  card: BoardCard;
  members: Member[];
  units: Unit[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [assigneeId, setAssigneeId] = useState(card.assignee?.id ?? "");
  const [businessUnitId, setBusinessUnitId] = useState(
    card.business_unit?.id ?? "",
  );
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!title.trim()) {
      setMessage("Escribe un título.");
      return;
    }
    start(async () => {
      const result = await updateTaskCardAction(card.id, {
        title,
        description: description || undefined,
        assignee_id: assigneeId || undefined,
        business_unit_id: businessUnitId || undefined,
        due_date: dueDate || undefined,
      });
      if (result.success) onDone();
      else setMessage(result.message);
    });
  };

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      {message && (
        <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {message}
        </p>
      )}
      <input
        className={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />
      <textarea
        className={input}
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={2000}
        placeholder="Descripción (opcional)"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className={input}
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="">Sin asignar</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.first_name} {member.last_name}
            </option>
          ))}
        </select>
        <select
          className={input}
          value={businessUnitId}
          onChange={(e) => setBusinessUnitId(e.target.value)}
        >
          <option value="">General / sin unidad</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={input}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-xl bg-[#083f7d] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border px-3 py-2 text-xs font-semibold"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
