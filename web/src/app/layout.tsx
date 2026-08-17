import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { siteUrl } from "./sitemap";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Without this, the Open Graph image URL resolves against localhost and every shared link
  // previews as broken — on a page whose entire job is being shared.
  metadataBase: new URL(siteUrl()),
  title: "Rouse — the alarm your brain can't learn",
  description:
    "An alarm sound that has never existed before and will never repeat. Some are rare. Generate one in your browser.",
  openGraph: {
    title: "Rouse — the alarm your brain can't learn",
    description:
      "Hear an alarm sound that has never existed before and will never repeat. Generated in your browser.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
