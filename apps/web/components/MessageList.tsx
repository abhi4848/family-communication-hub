'use client';

export type Message = {
  id: string;
  type: string;
  body?: string | null;
  mediaUrl?: string | null;
  quickAction?: string | null;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    role: string;
  };
};

type MessageListProps = {
  messages: Message[];
  currentUserId?: string;
  unreadIds?: string[];
  onRead?: (id: string) => void;
};

export function MessageList({
  messages,
  currentUserId,
  unreadIds = [],
  onRead
}: MessageListProps) {
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const isOwnMessage = m.sender.id === currentUserId;
        const isUnread = unreadIds.includes(m.id);

        return (
          <article
            key={m.id}
            onClick={() => {
              if (isUnread) {
                onRead?.(m.id);
              }
            }}
            className={`relative cursor-pointer rounded-2xl p-4 transition ${
              isOwnMessage
                ? "ml-8 bg-slate-900 text-white"
                : "mr-8 bg-white shadow-sm"
            } ${
              isUnread
                ? "ring-2 ring-blue-400"
                : ""
            }`}
          >
            {isUnread && (
              <span className="absolute right-3 top-3 rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">
                NEW
              </span>
            )}

            <div className="text-xs opacity-70">
              {m.sender.name} ·{" "}
              {new Date(m.createdAt).toLocaleString()}
            </div>

            {m.type === "QUICK_ACTION" ? (
              <div className="mt-2 text-lg font-semibold">
                ⚡ {m.quickAction}
              </div>
            ) : m.type === "VOICE" ? (
              <audio
                className="mt-3 w-full"
                controls
                src={m.mediaUrl || undefined}
              />
            ) : (
              <p className="mt-2 whitespace-pre-wrap">
                {m.body}
              </p>
            )}

            {isUnread && (
              <div className="mt-2 text-xs font-semibold opacity-70">
                Tap to mark as read
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}