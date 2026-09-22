/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  ArrowRight,
  Zap,
  Server,
  Activity,
  Layers,
} from 'lucide-react';
import { schedulerService } from '../services/schedulerService';
import { Workload, SchedulerDecision } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { SimulationControlBar } from '../components/common/SimulationControlBar';

export const SchedulerPage: React.FC = () => {
  const navigate = useNavigate();
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [decisions, setDecisions] = useState<SchedulerDecision[]>([]);
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<string>('W1');
  const [isRescheduling, setIsRescheduling] = useState(false);

  async function loadData() {
    try {
      const [wl, decs] = await Promise.all([
        schedulerService.getWorkloads(),
        schedulerService.getDecisions(),
      ]);
      setWorkloads(wl);
      setDecisions(decs);
    } catch (err) {
      console.error('Error loading scheduler data:', err);
    }
  }

  useEffect(() => {
    loadData();
    const unsub = schedulerService.subscribe(loadData);
    return () => unsub();
  }, []);

  const selectedWorkload = workloads.find((w) => w.id === selectedWorkloadId) || workloads[0];

  const handleReschedule = async (workloadId: string) => {
    setIsRescheduling(true);
    await schedulerService.triggerReschedule(workloadId);
    await loadData();
    setTimeout(() => setIsRescheduling(false), 500);
  };

  return (
    <div id="scheduler-page" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <span className="text-label-caps text-outline font-mono uppercase tracking-widest">
            ServiceGraph Workload Orchestrator
          </span>
          <h1 className="text-xl font-bold font-mono text-on-surface tracking-tight flex items-center gap-2">
            Workload Scheduler
            <span className="text-label-caps px-2 py-0.5 rounded bg-tertiary/10 text-tertiary border border-tertiary/30 font-normal">
              ENGINE ACTIVE
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-surface-container-low border border-outline-variant/30 px-3 py-1.5 rounded-lg flex items-center gap-2 text-outline">
            <Zap className="h-3.5 w-3.5 text-secondary" />
            <span>Policy: Dynamic ServiceGraph Fallback + Quorum Reservation</span>
          </div>
        </div>
      </div>

      {/* Global Simulator Control Bar */}
      <SimulationControlBar onWorkflowCreated={loadData} />

      {/* Main Two-Column View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
        {/* Left 2 Columns: Workloads List & Selected Inspector */}
        <div className="lg:col-span-2 space-y-5">
          {/* Workload Cards List */}
          <div className="space-y-3">
            <span className="text-label-caps text-outline uppercase tracking-wider block">
              Active Managed Controller Workloads ({workloads.length})
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {workloads.map((wl) => {
                const isSelected = selectedWorkloadId === wl.id;

                return (
                  <div
                    key={wl.id}
                    onClick={() => setSelectedWorkloadId(wl.id)}
                    className={`p-4 rounded-xl border bg-surface-container-low cursor-pointer transition-all space-y-2.5 ${
                      isSelected
                        ? 'border-primary shadow-[0_0_14px_rgba(208,188,255,0.2)] bg-surface-container'
                        : 'border-outline-variant/30 hover:border-outline'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-label-caps text-outline uppercase">{wl.id}</span>
                        <h3 className="text-xs font-bold text-on-surface truncate">{wl.name}</h3>
                      </div>
                      <StatusBadge status={wl.status} size="sm" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-label-caps text-outline">
                        <span>Target: {wl.targetResourceName || wl.current_task || 'search'}</span>
                        <span>{wl.duration || '1m 30s'}</span>
                      </div>
                      {wl.progress !== undefined && (
                        <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-primary h-full transition-all duration-300"
                            style={{ width: `${wl.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Workload Deep Evaluation Detail */}
          {selectedWorkload && (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-5">
              <div className="flex items-start justify-between pb-3 border-b border-outline-variant/20">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-label-caps text-outline uppercase">SELECTED WORKLOAD SPEC</span>
                    <StatusBadge status={selectedWorkload.status} size="sm" />
                  </div>
                  <h2 className="text-base font-bold text-on-surface">
                    {selectedWorkload.name} ({selectedWorkload.id})
                  </h2>
                  <p className="text-secondary text-xs">{selectedWorkload.targetEndpoint || `Task Sequence: ${(selectedWorkload.task_sequence || []).join(' → ')}`}</p>
                </div>

                <button
                  onClick={() => handleReschedule(selectedWorkload.id)}
                  disabled={isRescheduling}
                  className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 font-semibold"
                >
                  <RotateCcw className={`h-3 w-3 ${isRescheduling ? 'animate-spin' : ''}`} />
                  <span>Step Scheduler Pass</span>
                </button>
              </div>

              {/* Active Placement Decision */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 space-y-1">
                <span className="text-label-caps text-outline uppercase block">Active Placement Rationale</span>
                <p className="text-on-surface text-xs font-semibold">{selectedWorkload.schedulerDecision || `Scheduled task: ${selectedWorkload.current_task || selectedWorkload.targetResourceId}`}</p>
                <div className="text-secondary text-label-caps pt-0.5">
                  Selected Candidate: {selectedWorkload.selectedResource || selectedWorkload.targetResourceId}
                </div>
              </div>

              {/* Evaluated Candidates Breakdown */}
              {selectedWorkload.alternativesEvaluated && selectedWorkload.alternativesEvaluated.length > 0 && (
                <div className="space-y-2">
                  <span className="text-label-caps text-outline uppercase tracking-wider block">
                    Target Candidate Scoring Matrix
                  </span>
                  <div className="space-y-2">
                    {selectedWorkload.alternativesEvaluated.map((alt, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/20 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-on-surface">{alt.name}</span>
                            {alt.score && (
                              <span className="text-label-caps px-1.5 py-0.2 rounded bg-tertiary/20 text-tertiary">
                                Score: {alt.score}/100
                              </span>
                            )}
                          </div>
                          <div className="text-label-caps text-outline">{alt.note}</div>
                        </div>

                        <StatusBadge status={alt.status} size="sm" showDot={false} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Execution Event Trace */}
              {selectedWorkload.eventTrace && selectedWorkload.eventTrace.length > 0 && (
                <div className="space-y-2">
                  <span className="text-label-caps text-outline uppercase tracking-wider block">
                    Scheduler Event Trace
                  </span>
                  <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 space-y-2">
                    {selectedWorkload.eventTrace.map((tr, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <span className="text-label-caps text-outline shrink-0">{tr.time}</span>
                        <span className="text-on-surface-variant">{tr.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Historical Scheduler Decisions Stream */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-4 flex flex-col">
          <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
            <CalendarClock className="h-4 w-4 text-secondary" />
            <h2 className="font-mono text-sm font-semibold text-on-surface uppercase tracking-wide">
              Decisions Stream ({decisions.length})
            </h2>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {decisions.map((dec) => (
              <div
                key={dec.id}
                onClick={() => setSelectedWorkloadId(dec.workloadId)}
                className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 hover:border-secondary/50 cursor-pointer transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-semibold truncate">{dec.title}</span>
                  <span className="text-label-caps text-outline shrink-0">{dec.timeAgo}</span>
                </div>
                <p className="text-on-surface-variant text-label-caps leading-relaxed line-clamp-2">
                  {dec.description}
                </p>
                <div className="text-secondary text-label-caps pt-1">
                  Target Node: {dec.targetNode}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
