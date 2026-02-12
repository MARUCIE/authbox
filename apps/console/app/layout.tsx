import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { navRoutes } from "../lib/routes";

export const metadata: Metadata = {
  title: "Auth Box",
  description:
    "API authorization governance platform for account provisioning, credential lifecycle, assistant access, and audit traceability."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <span>Auth Box</span>
            </div>
            <nav className="nav">
              {navRoutes.map((route) => (
                <Link key={route.href} href={route.href}>
                  {route.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="shell">{children}</main>
        </div>
      </body>
    </html>
  );
}
