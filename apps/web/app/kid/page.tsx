'use client';

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, api } from "../../lib/api";
import { Message, MessageList } from "../../components/MessageList";

const actions = ["I'm Home", "Reached School", "Can I Play?", "Need Help", "Emergency"];

export default function KidPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    const r = await api<{ messages: Message[] }>("/messages");
    setMessages(r.messages);
  }

  useEffect(() => {
    async function load() {
      const [messageResult, userResult, notificationResult] =
        await Promise.all([
          api<{ messages: Message[] }>("/messages"),
          api<{ user: { id: string } }>("/auth/me"),
          api<{
            unreadCount: number;
            notifications: Message[];
          }>("/notifications")
        ]);

      setMessages(messageResult.messages);
      setCurrentUserId(userResult.user.id);

      setUnreadCount(notificationResult.unreadCount);

      setUnreadIds(
        notificationResult.notifications.map(
          (message) => message.id
        )
      );
    }

    load();

    const socket = io(API_URL, {
      withCredentials: true
    });

    socket.on("message:new", (message: Message) => {
      setMessages((prev) => [...prev, message]);

      setCurrentUserId((userId) => {
        if (message.sender.id !== userId) {
          setUnreadIds((ids) =>
            ids.includes(message.id)
              ? ids
              : [...ids, message.id]
          );

          setUnreadCount((count) => count + 1);
        }

        return userId;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  async function sendText() {
    if (!text.trim()) return;
    await api("/messages", { method: "POST", body: JSON.stringify({ type: "TEXT", body: text }) });
    setText("");
  }

  async function quickAction(action: string) {
    await api("/messages", {
      method: "POST",
      body: JSON.stringify({ type: "QUICK_ACTION", quickAction: action, body: action })
    });
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return alert("Voice recording is not supported in this browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    recorder.current = r;
    chunks.current = [];
    r.ondataavailable = e => chunks.current.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });

      // Upload blob to API uploads endpoint
      try {
        const form = new FormData();
        form.append("file", blob, "voice.webm");

        const uploadRes = await fetch(`${API_URL}/uploads`, {
          method: "POST",
          body: form,
          credentials: "include"
        });

        if (!uploadRes.ok) throw new Error("Upload failed");

        const data = await uploadRes.json();
        const mediaUrl = data.url;

        await api("/messages", {
          method: "POST",
          body: JSON.stringify({ type: "VOICE", mediaUrl, body: "Voice message" })
        });
      } catch (err) {
        alert("Failed to upload voice message");
        console.error(err);
      }
    };
    r.start();
    setRecording(true);
  }

  function stopRecording() {
    recorder.current?.stop();
    setRecording(false);
  }

  async function askAI() {
    if (!question.trim()) return;
    const r = await api<{ answer: string }>("/ai/ask", {
      method: "POST",
      body: JSON.stringify({ question, forwardToFamily: false })
    });
    setAiAnswer(r.answer);
  }

  async function askFamily() {
    if (!question.trim()) return;
    const r = await api<{ answer: string }>("/ai/ask", {
      method: "POST",
      body: JSON.stringify({ question, forwardToFamily: true })
    });
    setAiAnswer(r.answer);
    setQuestion("");
  }

  async function markRead(id: string) {
    await api(`/messages/${id}/read`, {
      method: "POST"
    });

    setUnreadIds((ids) =>
      ids.filter((messageId) => messageId !== id)
    );

    setUnreadCount((count) =>
      Math.max(0, count - 1)
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-4 sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-4">

        <div>
          <h1 className="text-3xl font-bold">
            Hi! 👋
          </h1>

          <p className="text-slate-500">
            Family Hub
          </p>
        </div>

        {unreadCount > 0 && (
          <div className="rounded-full bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700">
            🔔 {unreadCount} New
          </div>
        )}

      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {actions.map(action => (
          <button key={action} onClick={() => quickAction(action)}
            className={`min-h-20 rounded-2xl p-3 font-bold shadow-sm ${action === "Emergency" ? "bg-red-100 text-red-800" : "bg-white"}`}>
            {action}
          </button>
        ))}
      </section>

      <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm">
        <textarea value={text} onChange={e => setText(e.target.value)}
          className="min-h-24 w-full resize-none rounded-xl border p-3"
          placeholder="Type a message..." />
        <div className="mt-3 flex gap-2">
          <button onClick={sendText} className="flex-1 rounded-xl bg-slate-900 p-3 font-semibold text-white">Send</button>
          <button onClick={recording ? stopRecording : startRecording}
            className="rounded-xl border px-4 font-semibold">
            {recording ? "⏹ Stop" : "🎤 Voice"}
          </button>
        </div>
      </section>

      <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">🤖 Ask Family Assistant</h2>
        <input value={question} onChange={e => setQuestion(e.target.value)}
          className="mt-3 w-full rounded-xl border p-3" placeholder="Ask a question..." />
        <div className="mt-3 flex gap-2">
          <button onClick={askAI} className="rounded-xl border px-4 py-2">Ask AI</button>
          <button onClick={askFamily} className="rounded-xl bg-slate-900 px-4 py-2 text-white">Ask Family</button>
        </div>
        {aiAnswer && <p className="mt-3 rounded-xl bg-slate-50 p-3">{aiAnswer}</p>}
      </section>

      <section className="mt-5">
        <h2 className="mb-3 text-xl font-bold">Replies & Messages</h2>
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          unreadIds={unreadIds}
          onRead={markRead}
        />
      </section>
    </main>
  );
}
