type PublicEventPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PublicEventPage({ params }: PublicEventPageProps) {
  const { slug } = await params;

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-4xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">Public event route</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-normal">{slug}</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Public event data is intentionally not implemented in Phase 1. This route reserves the public URL shape without
        creating event business logic.
      </p>
    </main>
  );
}
