/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, AlertTriangle, ShieldAlert, RotateCcw, PlusCircle, Layers } from 'lucide-react';
import { simulationService } from '../../services/simulationService';
import { apiClient } from '../../services/apiClient';

export const LIVE_SIMULATION_INTERVAL_MS = 3000;

export const SimulationControlBar: React.FC<{ onWorkflowCreated?: () => void }> = ({ onWorkflowCreated }) => {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isRateLimiting, setIsRateLimiting] = useState(false);
  const [isQuotaExhausting, setIsQuotaExhausting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showNewWfModal, setShowNewWfModal] = useState(false);

  const [wfName, setWfName] = useState('Coding Agent');
  const [wfPreset, setWfPreset] = useState('Coding Agent');
  const [priority, setPriority] = useState(8.0);

  const isMock = apiClient.isUsingMock();

  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(LIVE_SIMULATION_INTERVAL_MS);
  const isExecutingStepRef = React.useRef(false);

  React.useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (isLiveRunning) {
      timer = setInterval(async () => {
        if (isExecutingStepRef.current) return;
        isExecutingStepRef.current = true;
        try {
          await simulationService.stepLive();
          if (onWorkflowCreated) onWorkflowCreated();
        } catch (e) {
          console.error('Error during live tick:', e);
        } finally {
          isExecutingStepRef.current = false;
        }
      }, simSpeed);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLiveRunning, simSpeed, onWorkflowCreated]);

  const handleStep = async () => {
    setIsAdvancing(true);
    try {
      await simulationService.step('run_step');
      if (onWorkflowCreated) onWorkflowCreated();
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleRateLimit = async () => {
    setIsRateLimiting(true);
    try {
      await simulationService.step('rate_limit', 'gemini-2.5-flash', 'W1');
      if (onWorkflowCreated) onWorkflowCreated();
    } finally {
      setIsRateLimiting(false);
    }
  };

  const handleQuotaExhausted = async () => {
    setIsQuotaExhausting(true);
    try {
      await simulationService.step('quota_exhausted', 'gemini-2.5-flash', 'W1');
      if (onWorkflowCreated) onWorkflowCreated();
    } finally {
      setIsQuotaExhausting(false);
    }
  };

  const handleReset = async () => {
    setIsLiveRunning(false);
    setIsResetting(true);
    try {
      await simulationService.reset();
      if (onWorkflowCreated) onWorkflowCreated();
    } finally {
      setIsResetting(false);
    }
  };

  const PRESETS: Record<string, { seq: string[]; prio: number }> = {
    'Research Report': { seq: ['search', 'gemini-2.5-flash', 'postgres-db', 'pdf-generator'], prio: 10.0 },
    'Coding Agent': { seq: ['search', 'gemini-2.5-flash', 'docker-worker'], prio: 8.0 },
    'Knowledge Agent': { seq: ['search', 'gemini-2.5-flash-lite', 'postgres-db'], prio: 5.0 },
    'Content Agent': { seq: ['search', 'gemini-2.5-flash', 'pdf-generator'], prio: 6.0 },
  };

  const handleCreateWf = async (e: React.FormEvent) => {
    e.preventDefault();
    const preset = PRESETS[wfPreset] || PRESETS['Coding Agent'];
    const wfId = `W_${Date.now().toString().slice(-4)}`;
    await simulationService.createWorkflow(wfId, wfName, priority, preset.seq);
    setShowNewWfModal(false);
    if (onWorkflowCreated) onWorkflowCreated();
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-mono text-xs shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
          <Layers className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-on-surface uppercase tracking-wide">
              Runtime Controller Simulator
            </span>
            <span
              className={`text-label-caps px-1.5 py-0.5 rounded font-semibold ${
                isMock
                  ? 'bg-outline-variant/20 text-outline border border-outline-variant/30'
                  : 'bg-tertiary/15 text-tertiary border border-tertiary/30'
              }`}
            >
              {isMock ? 'OFFLINE MOCK' : 'LIVE FASTAPI'}
            </span>
          </div>
          <p className="text-outline text-[11px]">
            Trigger live state transitions, quota failures, and dynamic fallback rerouting.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          onClick={() => setShowNewWfModal(true)}
          className="px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 font-semibold flex items-center gap-1.5 transition-colors"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          <span>Submit Workflow</span>
        </button>

        {/* Live Sim Toggle & Speed Selector Group */}
        <div className="flex items-center gap-1 bg-surface-container-high border border-outline-variant/40 rounded-lg p-0.5">
          <button
            onClick={() => setIsLiveRunning(!isLiveRunning)}
            className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
              isLiveRunning
                ? 'bg-tertiary/20 text-tertiary border border-tertiary/40 shadow-[0_0_10px_rgba(78,222,163,0.3)] animate-pulse'
                : 'hover:bg-surface-bright text-on-surface'
            }`}
          >
            <Play className={`h-3.5 w-3.5 ${isLiveRunning ? 'text-tertiary animate-spin' : 'text-primary'}`} />
            <span>{isLiveRunning ? 'PAUSE LIVE SIM' : 'START LIVE SIM'}</span>
          </button>

          <select
            value={simSpeed}
            onChange={(e) => setSimSpeed(Number(e.target.value))}
            title="Live simulation step speed interval"
            className="bg-transparent border-l border-outline-variant/30 pl-2 pr-1.5 py-1 text-xs font-mono text-outline focus:outline-none cursor-pointer hover:text-on-surface"
          >
            <option value={5000} className="bg-surface-container text-on-surface">5s (Slow)</option>
            <option value={3000} className="bg-surface-container text-on-surface">3s (Normal)</option>
            <option value={1500} className="bg-surface-container text-on-surface">1.5s (Fast)</option>
          </select>
        </div>

        {/* Offline Demo Control Toggle */}
        <button
          onClick={() => apiClient.setSimulatedOffline(!apiClient.isSimulatedOfflineMode())}
          className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-all ${
            apiClient.isSimulatedOfflineMode()
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
              : 'bg-surface-container-high hover:bg-amber-500/10 hover:border-amber-500/40 text-on-surface border-outline-variant/40'
          }`}
          title="Toggle simulated offline mode to test offline orchestration, local event journal, and auto-sync"
        >
          <span className="font-bold">
            {apiClient.isSimulatedOfflineMode() ? 'SIMULATED OFFLINE (ACTIVE)' : 'SIMULATE OFFLINE'}
          </span>
        </button>

        <button
          onClick={handleStep}
          disabled={isAdvancing}
          className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/40 flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Play className={`h-3.5 w-3.5 text-tertiary ${isAdvancing ? 'animate-spin' : ''}`} />
          <span>Advance Step</span>
        </button>

        <button
          onClick={handleRateLimit}
          disabled={isRateLimiting}
          className="px-3 py-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/40 font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <AlertTriangle className={`h-3.5 w-3.5 ${isRateLimiting ? 'animate-spin' : ''}`} />
          <span>Rate Limit Flash</span>
        </button>

        <button
          onClick={handleQuotaExhausted}
          disabled={isQuotaExhausting}
          className="px-3 py-1.5 rounded-lg bg-error/15 hover:bg-error/25 text-error border border-error/40 font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <ShieldAlert className={`h-3.5 w-3.5 ${isQuotaExhausting ? 'animate-spin' : ''}`} />
          <span>Quota Exhausted</span>
        </button>

        <button
          onClick={handleReset}
          disabled={isResetting}
          className="px-2.5 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-outline hover:text-on-surface hover:bg-surface-container-high flex items-center gap-1 transition-colors disabled:opacity-50"
          title="Reset Runtime Controller to initial deterministic state"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          <span>Reset</span>
        </button>
      </div>

      {/* New Workflow Modal */}
      {showNewWfModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/40 rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl text-on-surface">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-primary" />
                Submit New Workflow to Controller
              </h3>
              <button
                onClick={() => setShowNewWfModal(false)}
                className="text-outline hover:text-on-surface"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWf} className="space-y-3 font-mono text-xs">
              <div className="space-y-1">
                <label className="text-outline uppercase text-[10px]">Preset Workflow Type</label>
                <select
                  value={wfPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWfPreset(val);
                    setWfName(val);
                    setPriority(PRESETS[val]?.prio || 8.0);
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded p-2 text-on-surface"
                >
                  <option value="Research Report">Research Report (Search → Flash → Postgres → PDF)</option>
                  <option value="Coding Agent">Coding Agent (Search → Flash → Docker Worker)</option>
                  <option value="Knowledge Agent">Knowledge Agent (Search → Flash Lite → Postgres)</option>
                  <option value="Content Agent">Content Agent (Search → Flash → PDF Generator)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-outline uppercase text-[10px]">Workflow Name</label>
                <input
                  type="text"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded p-2 text-on-surface"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-outline uppercase text-[10px]">Priority Rating (1.0 - 10.0)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(e) => setPriority(parseFloat(e.target.value))}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded p-2 text-on-surface"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewWfModal(false)}
                  className="px-3 py-1.5 rounded bg-surface-container text-outline hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-primary text-on-primary font-semibold hover:bg-primary/90"
                >
                  Submit to FastAPI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
