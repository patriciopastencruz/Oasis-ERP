"use client";
import { useState, useTransition, type ReactNode } from "react";
import { reorderRouteAction } from "@/modules/finance/distribution/application/actions";

type Row = {
  id: string;
  driverId: string | null;
  deliveryDate: string;
  content: ReactNode;
};

export function DraggableOrderRows({ rows }: { rows: Row[] }) {
  const [order, setOrder] = useState(rows);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const draggingRow = order.find((r) => r.id === draggingId);

  function handleDrop(targetId: string) {
    const dragged = draggingRow;
    setDraggingId(null);
    if (!dragged || !dragged.driverId || dragged.id === targetId) return;
    const target = order.find((r) => r.id === targetId);
    if (!target || target.driverId !== dragged.driverId) return;

    const next = order.filter((r) => r.id !== dragged.id);
    const targetIndex = next.findIndex((r) => r.id === targetId);
    next.splice(targetIndex, 0, dragged);
    setOrder(next);

    const siblingIds = next
      .filter((r) => r.driverId === dragged.driverId)
      .map((r) => r.id);
    startTransition(() => {
      reorderRouteAction(dragged.driverId!, dragged.deliveryDate, siblingIds);
    });
  }

  return (
    <tbody>
      {order.map((row) => (
        <tr
          key={row.id}
          draggable={!!row.driverId}
          onDragStart={() => setDraggingId(row.id)}
          onDragEnd={() => setDraggingId(null)}
          onDragOver={(e) => {
            if (row.driverId && draggingRow?.driverId === row.driverId)
              e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(row.id);
          }}
          className={`border-b border-[#e2e7ed] ${row.driverId ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === row.id ? "opacity-40" : ""}`}
        >
          {row.content}
        </tr>
      ))}
    </tbody>
  );
}
