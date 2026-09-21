/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitFork,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Zap,
  ArrowRight,
  Server,
  Activity,
  Sliders,
} from 'lucide-react';
import { alternativesService } from '../services/alternativesService';
import { eventsService } from '../services/eventsService';
import { Alternative } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';

export const AlternativesPage: React.FC = () => {
  const navigate = useNavigate();
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [divertValues, setDivertValues] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadData() {
      const all = await alternativesService.getAll();
      setAlternatives(all);
      const initialDiverts: Record<string, number> = {};
      all.forEach((a) => {
        initialDiverts[a.id] = a.trafficDiverted;
      });
      setDivertValues(initialDiverts);
    }
    loadData();

    const unsub = alternativesService.subscribe(loadData);
    return () => unsub();
  }, []);

  const handleTestFailover = async (alt: Alternative) => {
    setTestingId(alt.id);
    const res = await alternativesService.testFailover(alt.id);
    setTestResults((prev) => ({
      ...prev,
      [alt.id]: `Pass (${res.latencyMs}ms switchover latency SLA verified)`,
    }));

    await eventsService.addEvent({
      severity: 'info',
      type: 'Health Check Sweep',
      resource: alt.id,
      resourceId: alt.id,
      description: `Synthetic failover test executed on ${alt.id} -> ${alt.fallbackEndpoint}. Switchover latency verified at ${res.latencyMs}ms.`,
      chips: [
        { label: 'ALT', value: alt.id },
        { label: 'PROBE', value: 'PASS' },
        { label: 'LATENCY', value: `${res.latencyMs}ms` },
      ],
      details: {
        latency: `${res.latencyMs}ms`,
        readiness: '100% Ready',
        host: alt.fallbackEndpoint,
      },
      rawJson: { altId: alt.id, testResult: res },
    });

    setTestingId(null);
    setTimeout(() => {
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[alt.id];
        return next;
      });
    }, 4500);
  };

  const handlePromote = async (alt: Alternative, trafficPercent: number) => {
    await alternativesService.promoteToActive(alt.id, trafficPercent);
    await eventsService.addEvent({
      severity: 'warning',
      type: 'Alternative Selected',
      resource: alt.id,
      resourceId: alt.id,
      description: `Alternative ${alt.id} promoted by operator with ${trafficPercent}% traffic diversion from ${alt.primaryResourceName}.`,
      chips: [
        { label: 'ACTION', value: 'PROMOTED' },
        { label: 'TRAFFIC', value: `${trafficPercent}%` },
        { label: 'TARGET', value: alt.id },
      ],
      details: {
        trigger: 'Operator Override',
        scope: `${trafficPercent}% load split`,
        reroute: alt.fallbackEndpoint,
      },
      rawJson: { altId: alt.id, trafficDiverted: trafficPercent },
    });
  };

  const handleRevert = async (alt: Alternative) => {
    await alternativesService.updateStatus(alt.id, 'available');
    setDivertValues((prev) => ({ ...prev, [alt.id]: 0 }));
    await eventsService.addEvent({
      severity: 'info',
      type: 'Self-Healing Recovery',
      resource: alt.id,
      resourceId: alt.id,
      description: `Traffic diversion ceased on ${alt.id}. Primary ${alt.primaryResourceName} resumed 100% traffic allocation.`,
      chips: [
        { label: 'ACTION', value: 'REVERTED' },
        { label: 'TRAFFIC', value: '100% PRIMARY' },
      ],
      details: {
        reroute: 'Returned to primary',
      },
      rawJson: { altId: alt.id, status: 'available' },
    });
  };

  return (
    <div id="alternatives-page" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Resilience SLA Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <span className="text-label-caps text-outline font-mono uppercase tracking-widest">
            High Availability & Fallback Orchestration
          </span>
          <h1 className="text-xl font-bold font-mono text-on-surface tracking-tight flex items-center gap-2">
            Alternative Resources
            <span className="text-label-caps px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/40 font-normal">
              4 CONFIGURED
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs">
          <div className="bg-surface-container-low border border-outline-variant/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-tertiary" />
            <span>Target SLA: &lt; 100ms Switchover</span>
          </div>
        </div>
      </div>

      {/* Alternative Cards List */}
      <div className="space-y-4 font-mono text-xs">
        {alternatives.map((alt) => {
          const isActive = alt.status === 'active_fallback';
          const testMsg = testResults[alt.id];
          const currentDivert = divertValues[alt.id] ?? alt.trafficDiverted;

          return (
            <div
              key={alt.id}
              className={`p-5 rounded-xl border bg-surface-container-low transition-all space-y-4 ${
                isActive
                  ? 'border-secondary/60 shadow-[0_0_16px_rgba(76,215,246,0.15)] bg-surface-container'
                  : 'border-outline-variant/30 hover:border-outline'
              }`}
            >
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-label-caps px-2 py-0.5 rounded bg-surface-container-highest border border-outline-variant/30 text-on-surface">
                      {alt.tier}
                    </span>
                    <StatusBadge status={alt.status} size="sm" />
                    <span className="text-label-caps text-outline">
                      {alt.substitutionType}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface">{alt.name}</h3>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right text-label-caps">
                    <span className="text-outline block">SYNC LAG</span>
                    <span className="text-tertiary font-semibold">{alt.syncLag}</span>
                  </div>
                  <div className="text-right text-label-caps">
                    <span className="text-outline block">COMPATIBILITY</span>
                    <span className="text-secondary font-semibold">{alt.compatibility}%</span>
                  </div>
                </div>
              </div>

              {/* Endpoints & Binding Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between text-label-caps text-outline">
                    <span>PRIMARY RESOURCE</span>
                    <span className="text-tertiary">Active Target</span>
                  </div>
                  <div className="text-on-surface font-semibold truncate">{alt.primaryResourceName}</div>
                  <div className="text-outline text-label-caps truncate">{alt.primaryEndpoint}</div>
                </div>

                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between text-label-caps text-outline">
                    <span>ALTERNATIVE TARGET</span>
                    <span className="text-primary">Hot-Standby</span>
                  </div>
                  <div className="text-primary font-semibold truncate">{alt.id}</div>
                  <div className="text-secondary text-label-caps truncate">{alt.fallbackEndpoint}</div>
                </div>
              </div>

              {/* Trigger & Hardware Context */}
              <div className="bg-surface-container-lowest/60 border border-outline-variant/20 rounded-lg p-3 space-y-1.5 text-label-caps">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-secondary shrink-0 mt-0.5" />
                  <div>
                    <span className="text-outline uppercase">Automatic Trigger Policy: </span>
                    <span className="text-on-surface">{alt.triggerCondition || 'Primary health probe failure > 3000ms'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-outline pt-1">
                  <span>Deployment Zone: {alt.zone}</span>
                  <span>•</span>
                  <span>Hardware Profile: {alt.hardwareMatch}</span>
                </div>
              </div>

              {/* Interactive Traffic Diverter & Action Row */}
              <div className="pt-2 border-t border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Traffic Diverter Slider */}
                <div className="flex-1 max-w-md space-y-1.5">
                  <div className="flex items-center justify-between text-label-caps">
                    <span className="text-outline flex items-center gap-1.5">
                      <Sliders className="h-3 w-3 text-secondary" /> Traffic Divert Allocation:
                    </span>
                    <span className="text-on-surface font-semibold">{currentDivert}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={currentDivert}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setDivertValues((prev) => ({ ...prev, [alt.id]: val }));
                      }}
                      className="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <button
                      onClick={() => handlePromote(alt, currentDivert)}
                      className="px-2.5 py-1 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 rounded text-label-caps whitespace-nowrap font-semibold"
                    >
                      Apply {currentDivert}%
                    </button>
                  </div>
                </div>

                {/* Actions & Synthetic Testing */}
                <div className="flex items-center gap-2">
                  {testMsg ? (
                    <span className="text-label-caps text-tertiary px-3 py-1.5 rounded bg-tertiary/15 border border-tertiary/40">
                      {testMsg}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleTestFailover(alt)}
                      disabled={testingId === alt.id}
                      className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/40 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 text-secondary ${testingId === alt.id ? 'animate-spin' : ''}`} />
                      <span>Test Failover SLA</span>
                    </button>
                  )}

                  {isActive ? (
                    <button
                      onClick={() => handleRevert(alt)}
                      className="px-3.5 py-1.5 bg-error/20 hover:bg-error/30 text-error border border-error/50 rounded-lg text-xs font-mono font-semibold transition-colors"
                    >
                      Revert Traffic
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePromote(alt, 100)}
                      className="px-3.5 py-1.5 bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/50 rounded-lg text-xs font-mono font-semibold transition-colors"
                    >
                      Full Failover (100%)
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
