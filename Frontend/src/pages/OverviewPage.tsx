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
import { graphService } from '../services/graphService';
import { Resource, Alternative, SchedulerDecision, RuntimeEvent, ServiceGraph } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { SimulationControlBar } from '../components/common/SimulationControlBar';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [decisions, setDecisions] = useState<SchedulerDecision[]>([]);
  const [recentEvents, setRecentEvents] = useState<RuntimeEvent[]>([]);
  const [graphData, setGraphData] = useState<ServiceGraph | null>(null);

  async function loadData() {
    try {
      const [res, alts, decs, evts, graph] = await Promise.all([
        resourcesService.getAll(),
        alternativesService.getAll(),
        schedulerService.getDecisions(),
        eventsService.getEvents(),
        graphService.getGraph(),
      ]);
      setResources(res);
      setAlternatives(alts);
      setDecisions(decs);
      setRecentEvents(evts.slice(0, 5));
      setGraphData(graph);
    } catch (e) {
      console.error('Error loading overview data:', e);
    }
  }

  useEffect(() => {
    loadData();

    // Subscribe to real-time events & global refresh
    const unsubR = resourcesService.subscribe(loadData);
    const unsubA = alternativesService.subscribe(loadData);
    const unsubE = eventsService.subscribe(loadData);

    return () => {
      unsubR();
      unsubA();
      unsubE();
    };
  }, []);

  const activeAlternatives = alternatives.filter((a) => a.status === 'active_fallback' || a.status === 'available');
  const degradedResources = resources.filter((r) => r.status === 'degraded' || r.status === 'offline');

  return (
    <div id="overview-page" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & KPI Metrics */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-outline-variant/30">
          <div>
            <span className="text-label-caps text-outline font-mono uppercase tracking-widest">
              SECOND BRAIN RUNTIME
            </span>
            <h1 className="text-xl font-bold font-mono text-on-surface tracking-tight flex items-center gap-2.5">
              Runtime Resource Orchestration for Agentic Workloads
              <span className="h-2 w-2 rounded-full bg-tertiary shadow-[0_0_8px_rgba(78,222,163,0.9)]" />
            </h1>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="px-3 py-1 rounded-md bg-tertiary/10 text-tertiary border border-tertiary/30 font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              BACKEND CONTROLLER ONLINE
            </span>
          </div>
        </div>

        {/* Global Simulator Control Panel */}
        <SimulationControlBar onWorkflowCreated={loadData} />

        {/* 4 Primary Operational Metric Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>MANAGED RESOURCES</span>
              <Server className="h-4 w-4 text-secondary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-on-surface">
                {resources.filter((r) => r.status === 'healthy' || r.status === 'running').length} / {resources.length}
              </span>
              <span className="text-label-caps text-tertiary font-mono">ONLINE</span>
            </div>
            <p className="text-xs text-outline font-mono">
              {degradedResources.length} constrained • {resources.length} active nodes
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>CONTROLLER MODE</span>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-on-surface">SIMULATED</span>
              <span className="text-label-caps text-tertiary font-mono">ACTIVE</span>
            </div>
            <p className="text-xs text-outline font-mono">
              Quota-aware RPM/TPM/RPD tracking
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>RESERVATIONS</span>
              <TrendingUp className="h-4 w-4 text-secondary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-on-surface">
                {resources.reduce((sum, r) => sum + (r.capacity?.reserved || 0), 0).toFixed(1)}
              </span>
              <span className="text-label-caps text-secondary font-mono">RESERVED UNITS</span>
            </div>
            <p className="text-xs text-outline font-mono">
              Soft reservations enabled
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-outline text-label-caps font-mono">
              <span>FALLBACK PAIRS</span>
              <GitFork className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-on-surface">
                {alternatives.length}
              </span>
              <span className="text-label-caps text-primary font-mono">CONFIGURED</span>
            </div>
            <p className="text-xs text-outline font-mono">
              Dynamic ServiceGraph rerouting
            </p>
          </div>
        </div>
      </div>

      {/* Constrained Resource Warning Alert if any */}
      {degradedResources.length > 0 && (
        <div className="bg-surface-container border border-error/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-error/15 border border-error/40 flex items-center justify-center text-error shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-error uppercase text-label-caps">
                  Resource Constraint Triggered
                </span>
                <span className="px-1.5 py-0.5 rounded bg-error/20 text-error text-label-caps font-bold">
                  RATE LIMITED / CONSTRAINED
                </span>
              </div>
              <p className="text-on-surface text-xs mt-0.5">
                Resource <strong className="text-error">{degradedResources[0]?.id}</strong> is temporarily constrained. Scheduler rerouted active workloads to fallback <strong className="text-tertiary">gemini-2.5-flash-lite</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/resources')}
            className="shrink-0 px-3.5 py-2 bg-error/20 hover:bg-error/30 text-error border border-error/50 rounded-lg flex items-center gap-2 transition-all"
          >
            <span>Inspect Constrained Resources</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Live Topology Graph + Scheduler Decisions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Dynamic Topology Preview Card */}
        <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Network className="h-4 w-4 text-primary" />
              <h2 className="font-mono text-sm font-semibold text-on-surface uppercase tracking-wide">
                Runtime ServiceGraph Nodes
              </h2>
            </div>
            <button
              onClick={() => navigate('/service-graph')}
              className="text-xs font-mono text-primary hover:underline flex items-center gap-1.5 transition-colors font-semibold"
            >
              <span>Launch Canvas</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Dynamic Backend-Driven Graph Nodes Grid */}
          <div
            onClick={() => navigate('/service-graph')}
            className="group relative min-h-[220px] rounded-lg bg-surface-container-low border border-outline-variant/30 p-4 flex flex-col justify-between cursor-pointer hover:border-primary/50 transition-all space-y-4"
          >
            <div className="flex items-center justify-between text-label-caps font-mono text-outline z-10">
              <span>LIVE CONTROLLER SERVICE GRAPH NODES ({graphData?.nodes.length || resources.length})</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 z-10 font-mono text-xs">
              {(graphData?.nodes || []).map((node) => {
                const isConstrained = node.isConstrained || node.status === 'degraded' || node.status === 'offline';
                return (
                  <div
                    key={node.id}
                    className={`p-2.5 rounded-lg border flex flex-col justify-between space-y-1 transition-all ${
                      isConstrained
                        ? 'bg-error/15 border-error/50 text-error'
                        : 'bg-surface-container border-outline-variant/40 text-on-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold truncate">{node.id}</span>
                      <StatusBadge status={node.status || 'healthy'} size="sm" showDot={true} />
                    </div>
                    <div className="text-[10px] text-outline truncate">{node.subtitle || node.type}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-label-caps font-mono text-outline z-10 pt-2 border-t border-outline-variant/20">
              <span className="flex items-center gap-1.5 text-secondary">
                <Zap className="h-3 w-3" /> {graphData?.edges.length || 5} Dynamic Graph Dependencies
              </span>
              <span className="text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold">
                Open Service Graph Canvas <ArrowRight className="h-3 w-3" />
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
                Managed Controller Resources ({resources.length})
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
                  <span className={`h-2 w-2 rounded-full ${res.status === 'degraded' ? 'bg-error' : 'bg-tertiary'}`} />
                  <div>
                    <span className="font-semibold text-on-surface">{res.id}</span>
                    <span className="text-label-caps text-outline block">{res.type} • {res.runtime || 'SecondBrain Controller'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div className="hidden sm:block">
                    <span className="text-on-surface font-semibold block">{res.capacity?.available} / {res.capacity?.total} {res.capacity?.unit}</span>
                    <span className="text-label-caps text-outline">AVAILABLE</span>
                  </div>
                  <StatusBadge status={res.status || 'healthy'} size="sm" />
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
                Live Audit & Controller Log Events
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
                  <span className="text-label-caps text-outline">{evt.timestamp}</span>
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
