import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "VFurst",
  description: "Original event and convention management SaaS"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-background">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link className="text-lg font-semibold tracking-normal" href="/">
              VFurst
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link className="text-muted-foreground hover:text-foreground" href="/events/sample">
                Public event
              </Link>
              <Link className="text-muted-foreground hover:text-foreground" href="/dashboard">
                Dashboard
              </Link>
              <Link className="rounded-md bg-primary px-3 py-2 text-primary-foreground" href="/auth/sign-in">
                Sign in
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
