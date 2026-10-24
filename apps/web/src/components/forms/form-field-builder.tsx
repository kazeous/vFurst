"use client";

import { Button } from "@/components/ui/button";
import type { FormField } from "@/lib/form-fields";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";

function emptyField(type: FormField["type"]): FormField {
  return {
    id: crypto.randomUUID(),
    type,
    label: type === "select" ? "New choice question" : "New question",
    required: false,
    options: type === "select" ? ["Option 1", "Option 2"] : undefined
  };
}

function SortableField({
  field,
  updateField,
  removeField
}: {
  field: FormField;
  updateField: (field: FormField) => void;
  removeField: (fieldId: string) => void;
}) {
  const sortable = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition
  };

  return (
    <div ref={sortable.setNodeRef} style={style} className="vf-sort-row">
      <button type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} aria-label="Reorder field">
        ::
      </button>
      <div className="vf-builder-field">
        <div className="vf-subform-row">
          <label>
            Label
            <input value={field.label} onChange={(event) => updateField({ ...field, label: event.target.value })} />
          </label>
          <label>
            Type
            <select
              value={field.type}
              onChange={(event) => {
                const nextType = event.target.value as FormField["type"];
                updateField({
                  ...field,
                  type: nextType,
                  options: nextType === "select" ? field.options ?? ["Option 1"] : undefined
                });
              }}
            >
              <option value="text">Text</option>
              <option value="textarea">Textarea</option>
              <option value="select">Select</option>
              <option value="checkbox">Checkbox</option>
            </select>
          </label>
          <label className="vf-check">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => updateField({ ...field, required: event.target.checked })}
            />
            Required
          </label>
        </div>
        {field.type === "select" ? (
          <label>
            Options
            <input
              value={(field.options ?? []).join(", ")}
              onChange={(event) =>
                updateField({
                  ...field,
                  options: event.target.value
                    .split(",")
                    .map((option) => option.trim())
                    .filter(Boolean)
                })
              }
            />
          </label>
        ) : null}
        <Button label="Remove field" type="button" size="sm" variant="destructive" onClick={() => removeField(field.id)} />
      </div>
    </div>
  );
}

export function FormFieldBuilder({ initialFields, name = "formSchema" }: { initialFields: FormField[]; name?: string }) {
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [preview, setPreview] = useState(false);
  const schemaValue = useMemo(() => JSON.stringify(fields), [fields]);

  function updateField(nextField: FormField) {
    setFields((current) => current.map((field) => (field.id === nextField.id ? nextField : field)));
  }

  function removeField(fieldId: string) {
    setFields((current) => current.filter((field) => field.id !== fieldId));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setFields((current) => {
      const oldIndex = current.findIndex((field) => field.id === active.id);
      const newIndex = current.findIndex((field) => field.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  return (
    <div className="vf-stack">
      <input type="hidden" name={name} value={schemaValue} />
      <div className="vf-actions">
        <div className="vf-inline-forms">
          <Button label="Text" type="button" size="sm" onClick={() => setFields((current) => [...current, emptyField("text")])} />
          <Button label="Textarea" type="button" size="sm" onClick={() => setFields((current) => [...current, emptyField("textarea")])} />
          <Button label="Select" type="button" size="sm" onClick={() => setFields((current) => [...current, emptyField("select")])} />
          <Button label="Checkbox" type="button" size="sm" onClick={() => setFields((current) => [...current, emptyField("checkbox")])} />
        </div>
        <Button label={preview ? "Edit" : "Preview"} type="button" size="sm" onClick={() => setPreview((value) => !value)} />
      </div>
      {preview ? (
        <div className="vf-form">
          {fields.map((field) => (
            <label key={field.id} className={field.type === "checkbox" ? "vf-check" : undefined}>
              {field.type === "checkbox" ? <input type="checkbox" disabled /> : field.label}
              {field.type === "text" ? <input disabled /> : null}
              {field.type === "textarea" ? <textarea disabled rows={3} /> : null}
              {field.type === "select" ? (
                <select disabled>
                  {(field.options ?? []).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : null}
              {field.type === "checkbox" ? field.label : null}
            </label>
          ))}
          {fields.length === 0 ? <p className="vf-empty">No custom questions yet.</p> : null}
        </div>
      ) : (
        <DndContext onDragEnd={onDragEnd}>
          <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
            <div className="vf-sort-list">
              {fields.map((field) => (
                <SortableField key={field.id} field={field} updateField={updateField} removeField={removeField} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
