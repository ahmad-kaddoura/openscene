import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import { storage } from '@/services/storage/indexeddb';
import type { ChatMessage, GenerativeUIComponent } from '@/core/types';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;

  loadMessages: (projectId: string) => Promise<void>;
  addMessage: (projectId: string, role: ChatMessage['role'], content: string, generativeUI?: GenerativeUIComponent[], metadata?: Record<string, unknown>) => Promise<void>;
  updateLastAssistantMessage: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: (projectId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    messages: [],
    isLoading: false,
    isStreaming: false,

    loadMessages: async (projectId) => {
      set((s) => { s.isLoading = true; });
      try {
        const msgs = await storage.getChatMessages(projectId);
        set((s) => {
          s.messages = (msgs as ChatMessage[]).sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          s.isLoading = false;
        });
      } catch {
        set((s) => { s.isLoading = false; });
      }
    },

    addMessage: async (projectId, role, content, generativeUI, metadata) => {
      const msg: ChatMessage = {
        id: nanoid(),
        projectId,
        role,
        content,
        timestamp: new Date().toISOString(),
        generativeUI,
        metadata,
      };
      await storage.saveChatMessage(msg);
      set((s) => {
        s.messages.push(msg);
      });
    },

    updateLastAssistantMessage: (content) => {
      set((s) => {
        for (let i = s.messages.length - 1; i >= 0; i--) {
          if (s.messages[i].role === 'assistant') {
            s.messages[i].content = content;
            break;
          }
        }
      });
    },

    setStreaming: (streaming) => {
      set((s) => { s.isStreaming = streaming; });
    },

    clearMessages: async (projectId) => {
      await storage.clearChatMessages(projectId);
      set((s) => { s.messages = []; });
    },
  }))
);