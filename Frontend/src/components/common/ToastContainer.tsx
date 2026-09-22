/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsub = apiClient.onToast((message, type) => {
      const id = Math.random().toString();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md font-mono text-xs">
      {toasts.map((t) => {
        const bg =
          t.type === 'error'
            ? 'bg-error/20 border-error/50 text-error'
            : t.type === 'warn'
            ? 'bg-secondary/20 border-secondary/50 text-secondary'
            : t.type === 'success'
            ? 'bg-tertiary/20 border-tertiary/50 text-tertiary'
            : 'bg-surface-container-high border-outline-variant/50 text-on-surface';

        return (
          <div
            key={t.id}
            className={`p-3 rounded-lg border shadow-xl flex items-start gap-2.5 animate-fade-in ${bg}`}
          >
            {t.type === 'error' || t.type === 'warn' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-outline hover:text-on-surface"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
