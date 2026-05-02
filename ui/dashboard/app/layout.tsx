import "./globals.css";
import { BroadcastStatusStrip } from "./components/BroadcastStatusStrip";
import { ThermalAlertBanner } from "./components/ThermalAlertBanner";
import { SecurityStatusBar } from "./components/SecurityStatusBar";

export const metadata = {
  title: "Junction Core OS",
  description: "Broadcast control surface — switching, routing, and facility monitoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThermalAlertBanner />
        <SecurityStatusBar />
        <BroadcastStatusStrip />
        {children}
      </body>
    </html>
  );
}
