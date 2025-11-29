"use client";

import ChatBox from "../Components/ChatBox";

export default function Home() {
  return (
    <main className="container">
      <header className="header">
        <h1>IndexChat</h1>
        <p>Ask questions about your indexed PDF documents</p>
      </header>
      <ChatBox />
    </main>
  );
}
