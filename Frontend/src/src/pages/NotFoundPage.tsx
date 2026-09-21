/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      id="not-found-page"
      className="flex-1 flex flex-col items-center justify-center p-8 text-center font-mono space-y-6 min-h-[60vh]"
    >
      <div className="h-16 w-16 rounded-2xl bg-error/15 border border-error/40 flex items-center justify-center text-error shadow-[0_0_24px_rgba(255,180,171,0.3)]">
        <AlertOctagon className="h-8 w-8" />
      </div>

      <div className="space-y-2 max-w-md">
        <span className="text-label-caps text-error uppercase tracking-widest block font-bold">
          404 ROUTING EXCEPTION: TARGET NOT REGISTERED
        </span>
        <h1 className="text-xl font-bold text-on-surface">Page Not Found</h1>
        <p className="text-xs text-outline leading-relaxed">
          The requested path <code className="text-secondary bg-surface-container px-1.5 py-0.5 rounded">{location.pathname}</code> does not match any registered orchestrator endpoint, service graph view, or resource channel.
        </p>
      </div>

      <div className="pt-2">
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-lg active:scale-95"
        >
          <Home className="h-4 w-4" />
          <span>Return to Operational Overview</span>
        </button>
      </div>
    </div>
  );
};
