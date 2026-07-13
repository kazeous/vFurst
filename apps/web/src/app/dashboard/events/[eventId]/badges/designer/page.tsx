import { saveBadgeTemplate } from "@/actions/phase5-actions";
import { BadgeDesigner } from "@/app/dashboard/events/[eventId]/badges/designer/badge-designer";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type BadgeLayout = {
  width: number;
  height: number;
  elements: Array<{
    id: string;
    type: "text" | "image" | "barcode" | "qr";
    x: number;
    y: number;
    w: number;
    h: number;
    field?: string;
    value?: string;
  }>;
};

function parseLayout(value: unknown): BadgeLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const layout = value as Partial<BadgeLayout>;
  return typeof layout.width === "number" && typeof layout.height === "number" && Array.isArray(layout.elements)
    ? (layout as BadgeLayout)
    : null;
}

export default async function BadgeDesignerPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      badgeTemplates: {
        orderBy: {
          updatedAt: "desc"
        }
      },
      registrationTypes: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const activeTemplate = event.badgeTemplates[0];

  return (
    <div className="vf-page vf-focus-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Badges</p>
          <h1>Badge designer</h1>
          <p className="vf-muted">Design the layout used for generated PDF sheets and Zebra ZPL badge printing.</p>
        </div>
        <div className="vf-actions">
          <Button label="Badge queue" href={`/dashboard/events/${event.id}/badges`} />
        </div>
      </header>

      <form id="badge-template-form" action={saveBadgeTemplate} className="vf-section">
        <input type="hidden" name="eventId" value={event.id} />
        <div className="vf-form-grid">
          {event.registrationTypes.map((type) => (
            <label key={type.id} className="vf-check">
              <input type="checkbox" name="defaultTypeIds" value={type.id} defaultChecked />
              {type.name}
            </label>
          ))}
        </div>
        <Button label="Save template" type="submit" variant="primary" />
      </form>

      <BadgeDesigner initialLayout={parseLayout(activeTemplate?.layout)} templateId={activeTemplate?.id} templateName={activeTemplate?.name ?? "Default badge"} />
    </div>
  );
}
