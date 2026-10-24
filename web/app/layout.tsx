/**
 * Root layout that wraps every page in the theme, live-data providers and the app shell.
 *
 * Inputs:
 * - Children pages
 *
 * Outputs:
 * - <html> with fonts (Fraunces display, Geist body/mono), day/night theme, tooltips, toasts, the SpacetimeDB connection and the solarpunk shell
 */

import type { Metadata } from "next"
import { Fraunces, Geist, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Providers } from "@/components/app/providers"
import { AppShell } from "@/components/app/app-shell"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["SOFT", "opsz"] })

export const metadata: Metadata = {
  title: "GovFlow",
  description: "Verified, multiplayer payments from the agency to the prime contractor to the subcontractor.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${fraunces.variable}`}>
      <body className="min-h-svh font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider delayDuration={150}>
            <Providers>
              <AppShell>{children}</AppShell>
            </Providers>
            <Toaster position="bottom-right" toastOptions={{ className: "!rounded-2xl" }} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
