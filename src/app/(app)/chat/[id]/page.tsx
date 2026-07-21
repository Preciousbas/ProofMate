import { ChatAccessGate } from "@/components/ChatAccessGate";
import { ChatThread } from "@/components/ChatThread";
import { use } from "react";

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <ChatAccessGate>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <ChatThread conversationId={id} />
      </div>
    </ChatAccessGate>
  );
}
