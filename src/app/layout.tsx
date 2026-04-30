import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { Provider } from "@/components/ui/provider";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bag It",
  description: "Local-first LEGO MOC manual bagging app.",
  applicationName: "Bag It",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bag It",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Provider>
          {children}
          <ServiceWorkerRegistration />
        </Provider>
      </body>
    </html>
  );
}
