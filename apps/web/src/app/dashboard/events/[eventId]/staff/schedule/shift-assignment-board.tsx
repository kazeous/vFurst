"use client";

import { assignShift } from "@/actions/staff-actions";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useTransition } from "react";

type BoardVolunteer = {
  id: string;
  name: string;
  departmentId: string;
};

type BoardShift = {
  id: string;
  roleId: string;
  departmentId: string;
  label: string;
  date: string;
  startTime: string;
  endTime: string;
};

function VolunteerCard({ volunteer }: { volunteer: BoardVolunteer }) {
  const draggable = useDraggable({
    id: volunteer.id,
    data: volunteer
  });

  return (
    <div
      ref={draggable.setNodeRef}
      className="vf-drag-card"
      style={{
        transform: draggable.transform
          ? `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`
          : undefined
      }}
      {...draggable.listeners}
      {...draggable.attributes}
    >
      {volunteer.name}
    </div>
  );
}

function ShiftDrop({ shift }: { shift: BoardShift }) {
  const droppable = useDroppable({
    id: shift.id,
    data: shift
  });

  return (
    <div ref={droppable.setNodeRef} className={droppable.isOver ? "vf-drop-card vf-drop-card-active" : "vf-drop-card"}>
      <strong>{shift.label}</strong>
      <span>
        {shift.date} {shift.startTime}-{shift.endTime}
      </span>
    </div>
  );
}

export function ShiftAssignmentBoard({
  volunteers,
  shifts
}: {
  volunteers: BoardVolunteer[];
  shifts: BoardShift[];
}) {
  const [isPending, startTransition] = useTransition();

  function onDragEnd(event: DragEndEvent) {
    const volunteer = event.active.data.current as BoardVolunteer | undefined;
    const shift = event.over?.data.current as BoardShift | undefined;

    if (!volunteer || !shift || volunteer.departmentId !== shift.departmentId) {
      return;
    }

    const formData = new FormData();
    formData.set("applicationId", volunteer.id);
    formData.set("roleId", shift.roleId);
    formData.set("shiftDate", shift.date);
    formData.set("shiftStart", shift.startTime);
    formData.set("shiftEnd", shift.endTime);
    formData.set("shiftLabel", shift.label);

    startTransition(() => {
      void assignShift(formData);
    });
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="vf-dnd-board">
        <div className="vf-section">
          <h2>Approved volunteers</h2>
          <div className="vf-drag-list">
            {volunteers.map((volunteer) => (
              <VolunteerCard key={volunteer.id} volunteer={volunteer} />
            ))}
            {volunteers.length === 0 ? <p className="vf-empty">No approved volunteers to assign.</p> : null}
          </div>
        </div>
        <div className="vf-section">
          <h2>Drop onto shift</h2>
          <div className="vf-drop-grid">
            {shifts.map((shift) => (
              <ShiftDrop key={shift.id} shift={shift} />
            ))}
            {shifts.length === 0 ? <p className="vf-empty">Create role shifts before using drag assignment.</p> : null}
          </div>
          {isPending ? <p className="vf-muted">Assigning shift...</p> : null}
        </div>
      </div>
    </DndContext>
  );
}
