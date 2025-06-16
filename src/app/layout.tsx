// src/app/layout.tsx
import "./globals.css";
import NavMenu from "./components/NavMenu";
import { UserProvider } from "./context/UserContext";
import { TradeProvider } from "./context/TradeContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {/* Wrap the entire app in UserProvider and TradeProvider */}
        <UserProvider>
          <TradeProvider>
            <NavMenu />
            {children}
          </TradeProvider>
        </UserProvider>
      </body>
    </html>
  );
}
