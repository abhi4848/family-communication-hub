'use client';

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, api } from "../../lib/api";
import { Message, MessageList } from "../../components/MessageList";

type User = {
  id: string;
  name: string;
  role: string;
  email: string;
};

type NotificationResponse = {
  unreadCount: number;
  notifications: Message[];
};

export default function FamilyPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadNotifications() {
    const result = await api<NotificationResponse>("/notifications");

    setUnreadCount(result.unreadCount);
    setUnreadIds(
      result.notifications.map((message) => message.id)
    );
  }

  useEffect(() => {
    async function load() {
      try {
        const [messageResult, userResult] = await Promise.all([
          api<{ messages: Message[] }>("/messages"),
          api<{ user: User }>("/auth/me"),
        ]);

        setMessages(messageResult.messages);
        setCurrentUser(userResult.user);

        await loadNotifications();
      } catch (error) {
        console.error("Failed to load Family Hub:", error);
      }
    }

    load();

    const socket = io(API_URL, {
      withCredentials: true,
    });

    socket.on("connect", () => {
      console.log("Family Hub Socket.IO connected");
    });

    socket.on("disconnect", () => {
      console.log("Family Hub Socket.IO disconnected");
    });

    socket.on("message:new", (message: Message) => {
      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }

        return [...prev, message];
      });

      setCurrentUser((current) => {
        if (current && message.sender.id !== current.id) {
          setUnreadIds((ids) =>
            ids.includes(message.id)
              ? ids
              : [...ids, message.id]
          );

          setUnreadCount((count) => count + 1);
        }

        return current;
      });
    });

    socket.on(
      "message:read",
      ({
        messageId,
        userId,
      }: {
        messageId: string;
        userId: string;
      }) => {
        setCurrentUser((current) => {
          if (current?.id === userId) {
            setUnreadIds((ids) =>
              ids.filter((id) => id !== messageId)
            );

            setUnreadCount((count) =>
              Math.max(0, count - 1)
            );
          }

          return current;
        });
      }
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  async function sendReply() {
    const trimmedReply = reply.trim();

    if (!trimmedReply) return;

    try {
      await api("/messages", {
        method: "POST",
        body: JSON.stringify({
          type: "TEXT",
          body: trimmedReply,
        }),
      });

      setReply("");
    } catch (error) {
      console.error("Failed to send reply:", error);
    }
  }

  async function markRead(id: string) {
    try {
      await api(`/messages/${id}/read`, {
        method: "POST",
      });

      setUnreadIds((ids) =>
        ids.filter((messageId) => messageId !== id)
      );

      setUnreadCount((count) =>
        Math.max(0, count - 1)
      );
    } catch (error) {
      console.error("Failed to mark message as read:", error);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-3 py-4 sm:px-5 sm:py-6 lg:px-6">

      {/* HEADER */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Family Hub
          </h1>

          <p className="text-sm text-slate-500 sm:text-base">
            Live family messages
          </p>
        </div>

        <div className="flex items-center gap-2">

          <div className="rounded-full bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-700 sm:px-4 sm:text-sm">
            🔔 {unreadCount} New
          </div>

          <span className="rounded-full bg-green-100 px-3 py-2 text-xs text-green-700 sm:text-sm">
            ● Live
          </span>

        </div>

      </header>

      {/* MAIN CONTENT */}
      <section className="mt-5 grid grid-cols-1 gap-5 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_300px]">

        {/* MESSAGE AREA */}
        <div className="min-w-0">

          <MessageList
            messages={messages}
            currentUserId={currentUser?.id}
            unreadIds={unreadIds}
            onRead={markRead}
          />

          {/* REPLY BOX */}
          <div className="sticky bottom-2 z-10 mt-4 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:bottom-3 sm:p-3">

            <div className="flex gap-2">

              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendReply();
                  }
                }}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 sm:text-base"
                placeholder="Reply to family..."
              />

              <button
                onClick={sendReply}
                disabled={!reply.trim()}
                className="shrink-0 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
              >
                Send
              </button>

            </div>

          </div>

        </div>

        {/* NOTIFICATION CENTER */}
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">

          <div className="flex items-center justify-between gap-3">

            <h2 className="text-base font-bold sm:text-lg">
              Notification Center
            </h2>

            {unreadCount > 0 && (
              <span className="shrink-0 rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">
                {unreadCount}
              </span>
            )}

          </div>

          {unreadCount === 0 ? (

            <div className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-700">
              ✓ You're all caught up.
            </div>

          ) : (

            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-800">
              You have{" "}
              <strong>{unreadCount}</strong>{" "}
              unread message
              {unreadCount === 1 ? "" : "s"}.
              <br />
              Click a new message to mark it as read.
            </div>

          )}

          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            🟢 Live updates are enabled.
          </div>

        </aside>

      </section>

    </main>
  );
}