/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  RefreshCw,
  Terminal,
  ShieldAlert,
  Globe,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';
import { alternativesService } from '../../services/alternativesService';
import { eventsService } from '../../services/eventsService';
import { apiClient } from '../../services/apiClient';

const ROUTE_TITLES: Record<string, { title: string; category: string }> = {
  '/': { title: 'Operational Overview', category: 'RUNTIME CONTROL' },
  '/service-graph': { title: 'Runtime Service Graph', category: 'TOPOLOGY MAP' },
  '/resources': { title: 'Resource Registry', category: 'INFRASTRUCTURE' },
  '/alternatives': { title: 'Alternative Resources & Fallbacks', category: 'RESILIENCE' },
  '/scheduler': { title: 'Workload Scheduler', category: 'ORCHESTRATION' },
  '/events': { title: 'Events & Audit Logs', category: 'OBSERVABILITY' },
  '/settings': { title: 'System Configuration', category: 'ADMINISTRATION' },
};

export const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    const unsub = apiClient.subscribeRefresh(() => setRefreshTick((t) => t + 1));
    return () => unsub();
  }, []);

  const currentMeta = ROUTE_TITLES[location.pathname] || {
    title: 'Service Graph Orchestrator',
    category: 'SYSTEM',
  };

  const handleTriggerProbe = async () => {
    setIsProbing(true);
    setProbeResult(null);
    try {
      // Test failover on the primary hot standby gateway
      const res = await alternativesService.testFailover('res-alt-gw-02');
      await eventsService.addEvent({
        severity: 'info',
        type: 'Health Check Sweep',
        resource: 'res-alt-gw-02',
        resourceId: 'res-alt-gw-02',
        description: `Manual synthetic failover probe executed by operator. RTT: ${res.latencyMs}ms. Status: Ready.`,
        chips: [
          { label: 'PROBE', value: 'MANUAL TRIGGER' },
          { label: 'RTT', value: `${res.latencyMs}ms` },
          { label: 'RESULT', value: 'PASS' },
        ],
        details: {
          latency: `${res.latencyMs}ms`,
          strategy: 'Synthetic gRPC Probe',
          readiness: '100% Ready',
        },
        rawJson: { probeType: 'MANUAL_SYNTHETIC', target: 'res-alt-gw-02', latencyMs: res.latencyMs },
      });
      setProbeResult(`Probe Pass: ${res.latencyMs}ms RTT`);
      setTimeout(() => setProbeResult(null), 4000);
    } catch {
      setProbeResult('Probe timeout');
      setTimeout(() => setProbeResult(null), 4000);
    } finally {
      setIsProbing(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/resources?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header
      id="app-header"
      className="h-16 px-6 bg-surface-container-lowest/90 backdrop-blur border-b border-outline-variant/30 flex items-center justify-between sticky top-0 z-20"
    >
      {/* Route Title & Breadcrumb */}
      <div className="flex items-center gap-4">
        <div>
          <div className="text-label-caps text-outline font-mono tracking-widest uppercase">
            {currentMeta.category}
          </div>
          <h1 className="text-sm font-semibold tracking-wide text-on-surface flex items-center gap-2">
            {currentMeta.title}
            <span className="inline-block px-2 py-0.5 rounded text-label-caps bg-tertiary/10 text-tertiary border border-tertiary/30 font-mono font-normal">
              LIVE
            </span>
          </h1>
        </div>
      </div>

      {/* Global Actions & Search */}
      <div className="flex items-center gap-4">
        {/* Quick Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative hidden md:block">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search resource, node, or workload..."
            className="w-64 pl-9 pr-3 py-1.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs font-mono text-on-surface placeholder:text-outline/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </form>

        {/* Synthetic Probe Test Action */}
        <div className="flex items-center gap-2">
          {probeResult ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-tertiary/15 border border-tertiary/40 rounded-lg text-xs font-mono text-tertiary animate-fade-in">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{probeResult}</span>
            </div>
          ) : (
            <button
              id="trigger-failover-probe-btn"
              onClick={handleTriggerProbe}
              disabled={isProbing}
              title="Execute a synthetic failover probe to verify hot-standby readiness SLA"
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container-high text-xs font-mono text-on-surface rounded-lg transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-primary ${isProbing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Probe Standby SLA</span>
            </button>
          )}
        </div>

        {/* Runtime Connectivity Status Badge */}
        <div className="flex items-center gap-2">
          {apiClient.getMode() === 'ONLINE' && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs font-mono text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold">ONLINE</span>
            </div>
          )}

          {apiClient.getMode() === 'OFFLINE RUNTIME' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 px-3 py-1 bg-amber-500/15 border border-amber-500/40 rounded-lg text-xs font-mono text-amber-300">
              <div className="flex items-center gap-1.5 font-bold">
                <WifiOff className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                <span>OFFLINE RUNTIME</span>
              </div>
              <span className="text-[10px] text-amber-200/80 border-t sm:border-t-0 sm:border-l sm:border-amber-500/30 sm:pl-2">
                Local orchestration active | Queue: {apiClient.getPendingOpsCount()} ops
              </span>
            </div>
          )}

          {apiClient.getMode() === 'SYNCING' && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/15 border border-blue-500/40 rounded-lg text-xs font-mono text-blue-300">
              <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              <span className="font-bold">SYNCING</span>
            </div>
          )}

          {apiClient.getMode() === 'SYNCED' && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-xs font-mono text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-bold">SYNCED</span>
            </div>
          )}
        </div>

        {/* Region & Environment Chip */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-surface-container border border-outline-variant/30 rounded-md text-label-caps font-mono text-outline">
          <Globe className="h-3 w-3 text-secondary" />
          <span>us-central1 / SIMULATED</span>
        </div>

        {/* Notification indicator to Events */}
        <button
          id="header-events-shortcut-btn"
          onClick={() => navigate('/events')}
          title="View recent runtime events"
          className="relative p-2 rounded-lg bg-surface-container-low border border-outline-variant/30 text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-secondary shadow-[0_0_6px_rgba(76,215,246,0.9)]" />
        </button>

        {/* Operator User Badge */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-outline-variant/30">
          <div className="h-8 w-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center font-mono text-xs font-semibold text-primary">
            OP
          </div>
          <div className="hidden xl:flex flex-col text-left">
            <span className="font-mono text-xs font-medium text-on-surface leading-tight">
              sre-admin
            </span>
            <span className="text-label-caps text-outline font-mono leading-tight">
              PROD-CLUSTER
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
