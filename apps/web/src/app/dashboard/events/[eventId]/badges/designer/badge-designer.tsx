"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

type BadgeElement = {
  id: string;
  type: "text" | "image" | "barcode" | "qr";
  x: number;
  y: number;
  w: number;
  h: number;
  field?: string;
  value?: string;
  assetKey?: string;
};

type BadgeLayout = {
  width: number;
  height: number;
  elements: BadgeElement[];
};

const sampleData: Record<string, string> = {
  "attendee.name": "Sam Rivera",
  "attendee.badgeName": "Sam",
  "attendee.email": "sam@example.com",
  "registration.type": "Weekend Pass",
  "registration.badgeNumber": "VF-1042",
  "event.name": "vFurst Expo"
};

const starterLayout: BadgeLayout = {
  width: 360,
  height: 240,
  elements: [
    { id: "event", type: "text", x: 24, y: 22, w: 312, h: 30, field: "event.name", value: "{{event.name}}" },
    { id: "name", type: "text", x: 24, y: 82, w: 220, h: 36, field: "attendee.name", value: "{{attendee.name}}" },
    { id: "type", type: "text", x: 24, y: 126, w: 180, h: 24, field: "registration.type", value: "{{registration.type}}" },
    { id: "qr", type: "qr", x: 252, y: 78, w: 72, h: 72, field: "registration.badgeNumber", value: "{{registration.badgeNumber}}" }
  ]
};

function resolveElementText(element: BadgeElement) {
  if (element.type === "text") {
    return element.field ? sampleData[element.field] ?? element.value ?? element.field : element.value ?? "Text";
  }

  if (element.type === "image") {
    return element.assetKey ? "Loading image…" : "Upload PNG/JPEG";
  }

  if (element.type === "barcode") {
    return sampleData[element.field ?? "registration.badgeNumber"] ?? "VF-1042";
  }

  return "QR";
}

function nextElement(type: BadgeElement["type"]): BadgeElement {
  const id = `${type}-${Date.now()}`;

  if (type === "text") {
    return { id, type, x: 32, y: 32, w: 180, h: 30, field: "attendee.name", value: "{{attendee.name}}" };
  }

  if (type === "image") {
    return { id, type, x: 32, y: 72, w: 96, h: 72 };
  }

  if (type === "barcode") {
    return { id, type, x: 32, y: 160, w: 180, h: 42, field: "registration.badgeNumber", value: "{{registration.badgeNumber}}" };
  }

  return { id, type, x: 232, y: 132, w: 76, h: 76, field: "registration.badgeNumber", value: "{{registration.badgeNumber}}" };
}

function badgeAssetUrl(assetBaseUrl: string, key: string) {
  if (!assetBaseUrl) return "";
  return `${assetBaseUrl}/${key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function BadgeImage({ element, assetBaseUrl }: { element: BadgeElement; assetBaseUrl: string }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!element.assetKey) {
      setImage(null);
      return;
    }

    const nextImage = new window.Image();
    const url = badgeAssetUrl(assetBaseUrl, element.assetKey);
    if (!url) {
      setImage(null);
      return;
    }
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = url;

    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [assetBaseUrl, element.assetKey]);

  return image ? (
    <KonvaImage image={image} width={element.w} height={element.h} />
  ) : (
    <Text
      text={resolveElementText(element)}
      width={element.w}
      height={element.h}
      align="center"
      verticalAlign="middle"
      fill="#111827"
      fontSize={13}
    />
  );
}

export function BadgeDesigner({
  initialLayout,
  templateName,
  templateId,
  assetBaseUrl
}: {
  initialLayout: BadgeLayout | null;
  templateName: string;
  templateId?: string;
  assetBaseUrl: string;
}) {
  const [layout, setLayout] = useState<BadgeLayout>(initialLayout ?? starterLayout);
  const [selectedId, setSelectedId] = useState<string | null>(layout.elements[0]?.id ?? null);
  const selectedRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedElement = layout.elements.find((element) => element.id === selectedId) ?? null;
  const serializedLayout = useMemo(() => JSON.stringify(layout), [layout]);

  useEffect(() => {
    if (selectedRef.current && transformerRef.current) {
      transformerRef.current.nodes([selectedRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, layout.elements]);

  function updateElement(id: string, updates: Partial<BadgeElement>) {
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => (element.id === id ? { ...element, ...updates } : element))
    }));
  }

  function addElement(type: BadgeElement["type"]) {
    const element = nextElement(type);
    setLayout((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(element.id);
  }

  function moveLayer(direction: -1 | 1) {
    if (!selectedId) {
      return;
    }

    setLayout((current) => {
      const index = current.elements.findIndex((element) => element.id === selectedId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.elements.length) {
        return current;
      }

      const elements = [...current.elements];
      const [element] = elements.splice(index, 1);
      elements.splice(nextIndex, 0, element!);
      return { ...current, elements };
    });
  }

  return (
    <div className="vf-designer">
      <div className="vf-toolbar">
        <Button label="Text" type="button" onClick={() => addElement("text")} />
        <Button label="Image" type="button" onClick={() => addElement("image")} />
        <Button label="Barcode" type="button" onClick={() => addElement("barcode")} />
        <Button label="QR" type="button" onClick={() => addElement("qr")} />
        <Button label="Back" type="button" onClick={() => moveLayer(-1)} />
        <Button label="Front" type="button" onClick={() => moveLayer(1)} />
      </div>

      <div className="vf-designer-grid">
        <div className="vf-canvas-shell">
          <Stage width={layout.width} height={layout.height} onMouseDown={(event) => event.target === event.target.getStage() && setSelectedId(null)}>
            <Layer>
              <Rect width={layout.width} height={layout.height} fill="#ffffff" stroke="#d0d7de" cornerRadius={8} />
              {layout.elements.map((element) => {
                const selected = element.id === selectedId;
                return (
                  <Group
                    key={element.id}
                    ref={selected ? selectedRef : undefined}
                    x={element.x}
                    y={element.y}
                    width={element.w}
                    height={element.h}
                    draggable
                    onClick={() => setSelectedId(element.id)}
                    onTap={() => setSelectedId(element.id)}
                    onDragEnd={(event) => updateElement(element.id, { x: Math.round(event.target.x()), y: Math.round(event.target.y()) })}
                    onTransformEnd={(event) => {
                      const node = event.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      node.scaleX(1);
                      node.scaleY(1);
                      updateElement(element.id, {
                        x: Math.round(node.x()),
                        y: Math.round(node.y()),
                        w: Math.max(24, Math.round(element.w * scaleX)),
                        h: Math.max(18, Math.round(element.h * scaleY))
                      });
                    }}
                  >
                    <Rect
                      width={element.w}
                      height={element.h}
                      fill={element.type === "text" ? "transparent" : element.type === "image" ? "#eef2f7" : "#f8fafc"}
                      stroke={selected ? "#0f62fe" : element.type === "text" ? "transparent" : "#8c959f"}
                      dash={element.type === "image" ? [5, 4] : undefined}
                      cornerRadius={element.type === "qr" ? 6 : 3}
                    />
                    {element.type === "image" ? (
                      <BadgeImage element={element} assetBaseUrl={assetBaseUrl} />
                    ) : (
                      <Text
                        text={resolveElementText(element)}
                        width={element.w}
                        height={element.h}
                        align={element.type === "barcode" || element.type === "qr" ? "center" : "left"}
                        verticalAlign="middle"
                        fill="#111827"
                        fontSize={element.type === "barcode" ? 14 : element.type === "qr" ? 18 : Math.min(22, Math.max(12, element.h - 8))}
                        fontStyle={element.id === "name" ? "bold" : "normal"}
                      />
                    )}
                  </Group>
                );
              })}
              <Transformer ref={transformerRef} rotateEnabled={false} enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} />
            </Layer>
          </Stage>
        </div>

        <div className="vf-section vf-inspector">
          <h2>Template</h2>
          <label>
            Name
            <input name="name" form="badge-template-form" defaultValue={templateName} />
          </label>
          <input name="layout" form="badge-template-form" type="hidden" value={serializedLayout} readOnly />
          {templateId ? <input name="templateId" form="badge-template-form" type="hidden" value={templateId} readOnly /> : null}

          <div className="vf-form-grid">
            <label>
              Width
              <input type="number" value={layout.width} onChange={(event) => setLayout((current) => ({ ...current, width: Number(event.target.value) || 360 }))} />
            </label>
            <label>
              Height
              <input type="number" value={layout.height} onChange={(event) => setLayout((current) => ({ ...current, height: Number(event.target.value) || 240 }))} />
            </label>
          </div>

          {selectedElement ? (
            <div className="vf-form">
              <h3>Selected layer</h3>
              {selectedElement.type === "image" ? (
                <>
                  <label>
                    PNG or JPEG asset
                    <input
                      name={`badgeImage:${selectedElement.id}`}
                      form="badge-template-form"
                      type="file"
                      accept="image/png,image/jpeg"
                      required={!selectedElement.assetKey}
                    />
                  </label>
                  <p className="vf-muted">
                    {selectedElement.assetKey
                      ? "A tenant-owned asset is attached. Choose another file to replace it when saving."
                      : "The file is uploaded to this organization when you save the template."}
                  </p>
                </>
              ) : (
                <>
                  <label>
                    Data field
                    <select value={selectedElement.field ?? ""} onChange={(event) => updateElement(selectedElement.id, { field: event.target.value || undefined })}>
                      <option value="">None</option>
                      {Object.keys(sampleData).map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Text / fallback
                    <input value={selectedElement.value ?? ""} onChange={(event) => updateElement(selectedElement.id, { value: event.target.value })} />
                  </label>
                </>
              )}
              <Button
                label="Remove layer"
                type="button"
                onClick={() => {
                  setLayout((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== selectedElement.id) }));
                  setSelectedId(null);
                }}
              />
            </div>
          ) : (
            <p className="vf-muted">Select a layer to edit its placeholder field.</p>
          )}
        </div>
      </div>
    </div>
  );
}
