export const metadata = { title: 'Body & Mind ON' };

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
