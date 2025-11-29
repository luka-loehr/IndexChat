import "./globals.css";

export const metadata = {
  title: "IndexChat - PDF Q&A",
  description: "Ask questions about your PDF documents",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
