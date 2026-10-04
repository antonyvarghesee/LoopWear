"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: "success" | "error" | "info";
}

interface ToastContextType {
  toast: (msg: Omit<ToastMessage, "id">) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setMessages((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-4 rounded-xl border bg-background shadow-lg transition-all animate-in slide-in-from-bottom-5",
              m.type === "error"
                ? "border-destructive/30 text-destructive"
                : m.type === "success"
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "border-border text-foreground",
            )}
          >
            {m.type === "success" && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />}
            {m.type === "error" && <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />}
            {(!m.type || m.type === "info") && <Info className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />}
            <div className="flex-1">
              <p className="text-sm font-semibold">{m.title}</p>
              {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
            </div>
            <button
              onClick={() => removeToast(m.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
