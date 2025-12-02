import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sign Guard",
  description: "合同扫描件检查工具",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site">
          <div className="container">
            <nav className="nav">
              <a className="brand" href="/">Sign Guard</a>
              <a href="/upload">上传合同</a>
              <a href="/contracts">合同列表</a>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
