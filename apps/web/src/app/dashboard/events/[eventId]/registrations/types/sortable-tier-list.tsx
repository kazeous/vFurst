"use client";

import { updateRegistrationTypeOrder } from "@/actions/event-actions";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

type TierItem = {
  id: string;
  name: string;
};

function SortableTier({ tier }: { tier: TierItem }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tier.id });

  return (
    <li
      ref={setNodeRef}
      className="vf-sort-row"
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <button type="button" aria-label={`Reorder ${tier.name}`} {...attributes} {...listeners}>
        ::
      </button>
      <span>{tier.name}</span>
    </li>
  );
}

export function SortableTierList({ eventId, tiers }: { eventId: string; tiers: TierItem[] }) {
  const [items, setItems] = useState(tiers);

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    setItems(reordered);
    await updateRegistrationTypeOrder(eventId, reordered.map((item, index) => ({ id: item.id, sortOrder: index })));
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="vf-sort-list">
          {items.map((tier) => (
            <SortableTier key={tier.id} tier={tier} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
