import { useEffect, useState, useCallback } from "react";

interface ToastMessage {
  id: number;
  text: string;
  isError: boolean;
  leaving: boolean;
}

let toastId = 0;
let addToastFn: ((text: string, isError: boolean) => void) | null = null;

export function showToast(text: string, isError = false) {
  addToastFn?.(text, isError);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, isError: boolean) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, text, isError, leaving: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );
    }, 2600);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2900);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  return (
    <div className="fixed bottom-6 right-6 z-[10000] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto px-[18px] py-2.5 rounded-[10px] text-[13px] font-semibold text-white"
          style={{
            background: t.isError ? "#ff453a" : "#30d158",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
            animation: t.leaving
              ? "toast-out 0.3s ease-in forwards"
              : "toast-in 0.3s ease-out",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
