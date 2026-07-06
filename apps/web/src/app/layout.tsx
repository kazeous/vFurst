import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "../components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "vFurst",
  description: "Manage your event, not a spreadsheet."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="system">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
