import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform — Next.js + Apollo",
  description: "Контейнеризированная среда разработки",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
