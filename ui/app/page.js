"use client";

import ChatBox from "../Components/ChatBox";
import Sidebar from "../Components/Sidebar";

export default function Home() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="container">
        <header className="header">
          <h1>IndexChat</h1>
          <p>Ask questions about your indexed PDF documents</p>
        </header>
        <ChatBox />
      </main>
    </div>
  );
}
