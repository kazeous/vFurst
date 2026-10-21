export type BadgeElement = {
  id?: string;
  type: "text" | "image" | "barcode" | "qr";
  x: number;
  y: number;
  w: number;
  h: number;
  field?: string;
  value?: string;
  assetKey?: string;
};

export type BadgeLayout = {
  width: number;
  height: number;
  elements: BadgeElement[];
};

export type RasterImage = {
  key: string;
  format: "png" | "jpeg";
  bytes: Uint8Array;
  width: number;
  height: number;
  rgba: Uint8Array;
};

export type Bitmap = { bytesPerRow: number; rows: number; bitmap: Uint8Array };

export type ResolvedElement =
  | { kind: "text"; element: BadgeElement; text: string }
  | { kind: "code"; element: BadgeElement; data: string }
  | { kind: "image"; element: BadgeElement; image: RasterImage };

export type BadgeContent = { elements: ResolvedElement[]; dropped: string[] };
