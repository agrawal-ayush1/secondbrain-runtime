/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Server,
  Network,
  GitFork,
  CalendarClock,
  ScrollText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
  Zap,
} from 'lucide-react';
import { resourcesService } from '../services/resourcesService';
import { alternativesService } from '../services/alternativesService';
import { schedulerService } from '../services/schedulerService';
import { eventsService } from '../services/eventsService';
import { Resource, Alternative, SchedulerDecision, RuntimeEvent } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [decisions, setDecisions] = useState<SchedulerDecision[]>([]);
  const [recentEvents, setRecentEvents] = useState<RuntimeEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [res, alts, decs, evts] = await Promise.all([
        resourcesService.getAll(),
        alternativesService.getAll(),
        schedulerService.getDecisions(),
        eventsService.getEvents(),
      ]);
      setResources(res);
      setAlternatives(alts);
      setDecisions(decs);
      setRecentEvents(evts.slice(0, 5));
      setIsLoading(false);
    }
    loadData();

    // Subscribe to real-time events
    const unsubR = resourcesService.subscribe(loadData);
    const unsubA = alternativesService.subscribe(loadData);
    const unsubE = eventsService.subscribe(loadData);

    return () => {
      unsubR();
      unsubA();
      unsubE();
    };
  }, []);

  const activeAlternatives = alternatives.filter((a) => a.status === 'active_fallback');

  return (
    <div id="overview-page" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & KPI Metrics */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-outline-variant/30">
          <div>
            <span className="text-label-caps text-outline font-mono uppercase tracking-widest">
              Runtime Orchestrator Core
            </span>
            <h1 className="text-xl font-bold font-mono text-on-surface tracking-tight flex items-center gap-2.5">
              Multi-Service Graph Cluster
              <span className="h-2 w-2 rounded-full bg-tertiary shadow-[0_0_8px_rgba(78,222,163,0.9)]" />
            </h1>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="px-3 py-1 rounded-md bg-tertiary/10 text-tertiary border border-tertiary/30 font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              OPERATIONAL MESH (100% HEALTH)
            </span>
          </div>
        </div>

        {/* 4 Primary Operational Metric Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>ACTIVE RESOURCES</span>
              <Server className="h-4 w-4 text-secondary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-on-surface">
                {resources.filter((r) => r.status === 'healthy' || r.status === 'running').length} / {resources.length}
              </span>
              <span className="text-label-caps text-tertiary font-mono">ONLINE</span>
            </div>
            <p className="text-xs text-outline font-mono">
              0 degraded • 0 quorum partitions
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>MESH P99 LATENCY</span>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-on-surface">14.2 ms</span>
              <span className="text-label-caps text-tertiary font-mono">OPTIMAL</span>
            </div>
            <p className="text-xs text-outline font-mono">
              -2.1ms lower than SLA threshold
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>TOTAL INFLOW QPS</span>
              <TrendingUp className="h-4 w-4 text-secondary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-on-surface">42.8k</span>
              <span className="text-label-caps text-secondary font-mono">REQ/SEC</span>
            </div>
            <p className="text-xs text-outline font-mono">
              Peak traffic window: Ingress & Kafka
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>ARMED ALTERNATIVES</span>
              <GitFork className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-on-surface">
                {alternatives.length}
              </span>
              <span className="text-label-caps text-primary font-mono">
                {activeAlternatives.length} ACTIVE DIVERT
              </span>
            </div>
            <p className="text-xs text-outline font-mono">
              Tier-1 SLA switchover &lt; 100ms
            </p>
          </div>
        </div>
      </div>

      {/* Active Diverter Alert if any */}
      {activeAlternatives.length > 0 && (
        <div className="bg-surface-container border border-secondary/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary/15 border border-secondary/40 flex items-center justify-center text-secondary shrink-0">
              <GitFork className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-secondary uppercase text-label-caps">
                  Active Traffic Diverter Active
                </span>
                <span className="px-1.5 py-0.5 rounded bg-secondary/20 text-secondary text-label-caps">
                  TIER-1 FALLBACK
                </span>
              </div>
              <p className="text-on-surface text-xs mt-0.5">
                <strong className="text-primary">{activeAlternatives[0].name}</strong> is receiving{' '}
                <strong className="text-secondary">{activeAlternatives[0].trafficDiverted}%</strong> of read traffic from{' '}
                <strong className="text-on-surface">{activeAlternatives[0].primaryResourceName}</strong>. Sync lag: {activeAlternatives[0].syncLag}.
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/alternatives')}
            className="shrink-0 px-3.5 py-2 bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/50 rounded-lg flex items-center gap-2 transition-all"
          >
            <span>Manage Alternative Controls</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Topology Quick Preview + Scheduler Decisions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Topology Preview Card */}
        <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Network className="h-4 w-4 text-primary" />
              <h2 className="font-mono text-sm font-semibold text-on-surface uppercase tracking-wide">
                Runtime Topology Mesh
              </h2>
            </div>
            <button
              onClick={() => navigate('/service-graph')}
              className="text-xs font-mono text-primary hover:text-primary-fixed-dim flex items-center gap-1.5 transition-colors"
            >
              <span>Launch Interactive Graph</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mini Topology Visual Representation */}
          <div
            onClick={() => navigate('/service-graph')}
            className="group relative h-64 rounded-lg bg-surface-container-low border border-outline-variant/30 p-4 flex flex-col justify-between overflow-hidden cursor-pointer hover:border-primary/50 transition-all"
          >
            <div className="flex items-center justify-between text-label-caps font-mono text-outline z-10">
              <span>INGRESS LAYER</span>
              <span>CORE MESH SERVICES</span>
              <span>DATA & STORAGE TIER</span>
            </div>

            {/* Schematic visual nodes inside preview */}
            <div className="grid grid-cols-3 gap-4 items-center justify-items-center py-4 z-10">
              <div className="space-y-3 w-full max-w-[130px]">
                <div className="p-2 rounded bg-surface-container border border-tertiary/40 text-center font-mono text-xs">
                  <span className="text-tertiary font-semibold block truncate">resource-api-gateway</span>
                  <span className="text-label-caps text-outline">Envoy • 18.4k qps</span>
                </div>
                <div className="p-1.5 rounded bg-surface-container-lowest border border-primary/40 text-center font-mono text-label-caps text-primary">
                  <span>res-alt-gw-02 (Standby)</span>
                </div>
              </div>

              <div className="space-y-3 w-full max-w-[130px]">
                <div className="p-2 rounded bg-surface-container border border-tertiary/40 text-center font-mono text-xs">
                  <span className="text-tertiary font-semibold block truncate">resource-auth</span>
                  <span className="text-label-caps text-outline">Go • 4.8ms</span>
                </div>
                <div className="p-2 rounded bg-surface-container border border-tertiary/40 text-center font-mono text-xs">
                  <span className="text-tertiary font-semibold block truncate">resource-worker</span>
                  <span className="text-label-caps text-outline">48 Pods • 6.4k/s</span>
                </div>
              </div>

              <div className="space-y-2.5 w-full max-w-[130px]">
                <div className="p-1.5 rounded bg-surface-container border border-tertiary/30 text-center font-mono text-xs truncate">
                  <span className="text-tertiary font-medium">resource-redis</span>
                </div>
                <div className="p-1.5 rounded bg-surface-container border border-secondary/40 text-center font-mono text-xs truncate">
                  <span className="text-secondary font-medium">resource-postgres</span>
                </div>
                <div className="p-1.5 rounded bg-surface-container border border-tertiary/30 text-center font-mono text-xs truncate">
                  <span className="text-tertiary font-medium">resource-queue</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-label-caps font-mono text-outline z-10 pt-2 border-t border-outline-variant/20">
              <span className="flex items-center gap-1.5 text-secondary">
                <Zap className="h-3 w-3" /> 11 Active Directed Graph Edges
              </span>
              <span className="text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">
                Click to Open Graph Canvas <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Scheduler Decisions */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CalendarClock className="h-4 w-4 text-secondary" />
              <h2 className="font-mono text-sm font-semibold text-on-surface uppercase tracking-wide">
                Scheduler Decisions
              </h2>
            </div>
            <button
              onClick={() => navigate('/scheduler')}
              className="text-xs font-mono text-secondary hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto font-mono text-xs">
            {decisions.map((dec) => (
              <div
                key={dec.id}
                onClick={() => navigate('/scheduler')}
                className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 hover:border-secondary/40 cursor-pointer transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-semibold truncate max-w-[200px]">
                    {dec.title}
                  </span>
                  <span className="text-label-caps text-outline">{dec.timeAgo}</span>
                </div>
                <p className="text-on-surface-variant text-label-caps leading-relaxed line-clamp-2">
                  {dec.description}
                </p>
                <div className="text-secondary text-label-caps pt-1 flex items-center gap-1">
                  <span>Target: {dec.targetNode}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section: Resource Fleet Summary & Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resource Fleet Quick Glance */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server className="h-4 w-4 text-tertiary" />
              <h2 className="font-mono text-sm font-semibold text-on-surface uppercase tracking-wide">
                Managed Infrastructure Resources ({resources.length})
              </h2>
            </div>
            <button
              onClick={() => navigate('/resources')}
              className="text-xs font-mono text-tertiary hover:underline flex items-center gap-1"
            >
              <span>View Full Registry</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="divide-y divide-outline-variant/20 font-mono text-xs">
            {resources.map((res) => (
              <div
                key={res.id}
                onClick={() => navigate(`/resources?id=${encodeURIComponent(res.id)}`)}
                className="py-2.5 flex items-center justify-between hover:bg-surface-container-high/30 px-2 rounded cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-tertiary" />
                  <div>
                    <span className="font-semibold text-on-surface">{res.id}</span>
                    <span className="text-label-caps text-outline block">{res.type} • {res.runtime}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div className="hidden sm:block">
                    <span className="text-on-surface font-semibold block">{res.metrics.p99Latency || '12ms'}</span>
                    <span className="text-label-caps text-outline">p99</span>
                  </div>
                  <StatusBadge status={res.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Event Ticker */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ScrollText className="h-4 w-4 text-primary" />
              <h2 className="font-mono text-sm font-semibold text-on-surface uppercase tracking-wide">
                Live Audit & Telemetry Events
              </h2>
            </div>
            <button
              onClick={() => navigate('/events')}
              className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
            >
              <span>Stream All Events</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            {recentEvents.map((evt) => (
              <div
                key={evt.id}
                onClick={() => navigate(`/events?id=${evt.id}`)}
                className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/20 hover:border-primary/40 cursor-pointer transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={evt.severity} size="sm" />
                    <span className="text-on-surface font-semibold">{evt.type}</span>
                  </div>
                  <span className="text-label-caps text-outline">{evt.relativeTime}</span>
                </div>
                <p className="text-on-surface-variant text-label-caps line-clamp-1">
                  {evt.description}
                </p>
                <div className="text-outline text-label-caps flex items-center gap-2 pt-0.5">
                  <span>Resource: {evt.resource}</span>
                  <span>•</span>
                  <span>ID: {evt.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
