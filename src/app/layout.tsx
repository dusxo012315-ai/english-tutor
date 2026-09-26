import type { Metadata } from "next";
import { StoreProvider } from "@/components/provider";
import { AppShell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "Reading Room · 나만의 영어 읽기 공간",
  description: "읽고, 듣고, 기록하는 개인 영어 학습 공간. ChatGPT Companion과 함께 공부하세요.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
