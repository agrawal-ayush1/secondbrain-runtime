/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Network,
  Server,
  GitFork,
  CalendarClock,
  ScrollText,
  Settings,
  Layers,
  ChevronRight,
  ShieldCheck,
  Code,
  Zap,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { resourcesService } from '../../services/resourcesService';
import { alternativesService } from '../../services/alternativesService';
import { settingsService } from '../../services/settingsService';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const isMock = apiClient.isUsingMock();
  const [nodeCount, setNodeCount] = useState<number>(6);
  const [altCount, setAltCount] = useState<number>(1);
  const [clusterId, setClusterId] = useState<string>('sb-cluster-prod-01');

  useEffect(() => {
    async function loadStats() {
      try {
        const [res, alts, setts] = await Promise.all([
          resourcesService.getAll(),
          alternativesService.getAll(),
          settingsService.getSettings(),
        ]);
        setNodeCount(res.length);
        setAltCount(alts.length);
        setClusterId(setts.general?.clusterId || 'sb-cluster-prod-01');
      } catch (err) {
        // Fallback
      }
    }
    loadStats();

    const unsubR = resourcesService.subscribe(loadStats);
    const unsubA = alternativesService.subscribe(loadStats);
    return () => {
      unsubR();
      unsubA();
    };
  }, []);

  const NAV_ITEMS: NavItem[] = [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
    { name: 'Service Graph', path: '/service-graph', icon: Network },
    { name: 'Resources', path: '/resources', icon: Server, badge: `${nodeCount}` },
    { name: 'Alternatives', path: '/alternatives', icon: GitFork, badge: `${altCount}` },
    { name: 'Scheduler', path: '/scheduler', icon: CalendarClock },
    { name: 'Events & Logs', path: '/events', icon: ScrollText, badge: 'Live' },
    { name: 'Developer API', path: '/developer', icon: Code, badge: 'v1' },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside
      id="app-sidebar"
      className="w-64 shrink-0 flex flex-col bg-surface-container-lowest border-r border-outline-variant/30 select-none z-30 h-screen sticky top-0"
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center gap-3 border-b border-outline-variant/30">
        <div className="h-9 w-9 rounded-lg bg-primary-container/20 border border-primary/40 flex items-center justify-center text-primary shadow-[0_0_12px_rgba(208,188,255,0.25)]">
          <Network className="h-5 w-5 text-primary animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-sm font-semibold tracking-wider text-on-surface uppercase flex items-center gap-1.5">
            SecondBrain
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-tertiary shadow-[0_0_6px_rgba(78,222,163,0.8)]" />
          </span>
          <span className="text-label-caps text-outline uppercase tracking-widest">
            Agentic Runtime
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-label-caps text-outline/80 uppercase font-mono tracking-widest">
          Platform Control
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              id={`nav-link-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-mono transition-all duration-150 ${
                isActive
                  ? 'bg-primary-container/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(208,188,255,0.15)] font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? 'text-primary' : 'text-outline group-hover:text-on-surface'
                  }`}
                />
                <span className="tracking-wide text-xs">{item.name}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {item.badge && (
                  <span
                    className={`text-label-caps px-1.5 py-0.5 rounded font-mono ${
                      item.badge === 'Live'
                        ? 'bg-secondary/15 text-secondary border border-secondary/30'
                        : isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-container-highest text-outline'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary opacity-80" />}
              </div>
            </NavLink>
          );
        })}

        {/* System Topology Context Card */}
        <div className="mt-8 pt-4 border-t border-outline-variant/20 px-3">
          <div className="text-label-caps text-outline/80 uppercase font-mono tracking-widest mb-2.5">
            Orchestration Scope
          </div>
          <div className="bg-surface-container/60 border border-outline-variant/30 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-outline text-xs flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-secondary" /> Mesh Nodes
              </span>
              <span className="font-mono text-xs text-on-surface font-semibold">{nodeCount} Active</span>
            </div>
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-outline text-xs flex items-center gap-1.5">
                <GitFork className="h-3 w-3 text-primary" /> Failovers
              </span>
              <span className="font-mono text-xs text-on-surface font-semibold">{altCount} Configured</span>
            </div>
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-outline text-xs flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-tertiary" /> Quota Manager
              </span>
              <span className="font-mono text-xs text-tertiary font-semibold">Enabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Footer Status */}
      <div className="p-3 border-t border-outline-variant/30 bg-surface-container-lowest/80">
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-2.5 space-y-1.5 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-outline text-label-caps uppercase">Cluster</span>
            <span className="text-on-surface text-label-caps font-semibold truncate max-w-[110px]">{clusterId}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-outline text-label-caps uppercase">Runtime</span>
            <span className="text-tertiary text-label-caps font-semibold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-tertiary animate-ping" />
              OPERATIONAL
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20">
            <span className="text-outline text-label-caps uppercase">Backend</span>
            <span className="text-secondary text-label-caps font-semibold flex items-center gap-1">
              <Zap className="h-2.5 w-2.5" />
              {isMock ? 'Mock Engine' : 'FastAPI Controller'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
