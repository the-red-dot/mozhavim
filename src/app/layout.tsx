import "./globals.css";
import NavMenu from "./components/NavMenu";
import { UserProvider } from "./context/UserContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {/* Wrap the entire app in UserProvider */}
        <UserProvider>
          <NavMenu />
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
