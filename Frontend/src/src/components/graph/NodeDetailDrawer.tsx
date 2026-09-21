/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  ExternalLink,
  Activity,
  Cpu,
  Clock,
  Layers,
  GitFork,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { GraphNode, Resource } from '../../types';
import { StatusBadge } from '../common/StatusBadge';

interface NodeDetailDrawerProps {
  node: GraphNode | null;
  resource?: Resource;
  onClose: () => void;
  onTestFailover?: (altId: string) => void;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  node,
  resource,
  onClose,
  onTestFailover,
}) => {
  const navigate = useNavigate();

  if (!node) return null;

  const isStandby = node.isStandby;

  return (
    <div
      id="node-detail-drawer"
      className="w-96 bg-surface-container-low border-l border-outline-variant/30 flex flex-col h-full shadow-2xl z-20 animate-fade-in text-on-surface"
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-outline-variant/30 flex items-start justify-between bg-surface-container-lowest/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-label-caps text-outline font-mono uppercase">
              {node.type}
            </span>
            {isStandby && (
              <span className="text-label-caps bg-primary/20 text-primary border border-primary/40 px-1.5 py-0.5 rounded font-mono">
                HOT-STANDBY
              </span>
            )}
          </div>
          <h2 className="text-sm font-semibold font-mono text-on-surface break-all">
            {node.label}
          </h2>
          <p className="text-xs text-on-surface-variant font-mono">{node.subtitle}</p>
        </div>

        <button
          onClick={onClose}
          id="close-node-drawer-btn"
          className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drawer Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs font-mono">
        {/* Status & Health Card */}
        <div className="bg-surface-container/70 border border-outline-variant/30 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-outline uppercase text-label-caps">Node State</span>
            <StatusBadge status={node.status} size="sm" />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/20 text-xs">
            <div>
              <span className="text-outline text-label-caps block">P99 LATENCY</span>
              <span className="text-on-surface font-semibold">
                {node.metrics.p99 || resource?.metrics.p99Latency || '12.4ms'}
              </span>
            </div>
            <div>
              <span className="text-outline text-label-caps block">CPU UTIL</span>
              <span className="text-on-surface font-semibold">
                {node.metrics.cpu || `${resource?.metrics.cpu || 32}%`}
              </span>
            </div>
            <div>
              <span className="text-outline text-label-caps block">REPLICAS</span>
              <span className="text-on-surface font-semibold">
                {node.metrics.replicas || resource?.metrics.replicas || '1 / 1'}
              </span>
            </div>
            <div>
              <span className="text-outline text-label-caps block">CONNECTIONS</span>
              <span className="text-on-surface font-semibold">
                {node.metrics.conns || resource?.metrics.conns || '840'}
              </span>
            </div>
          </div>
        </div>

        {/* Runtime & Endpoint Spec */}
        <div className="space-y-1.5">
          <span className="text-label-caps text-outline uppercase tracking-wider block">
            Endpoint & Network Binding
          </span>
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-lg p-2.5 space-y-1">
            <div className="text-secondary text-xs truncate">
              {resource?.endpoint || `${node.id}.prod.internal:443`}
            </div>
            <div className="flex items-center gap-2 text-label-caps text-outline pt-1">
              <span>Namespace: {resource?.namespace || 'default-prod'}</span>
              <span>•</span>
              <span>{resource?.runtime || 'Envoy / Linux'}</span>
            </div>
          </div>
        </div>

        {/* Dependencies */}
        {resource?.downstreamDeps && resource.downstreamDeps.length > 0 && (
          <div className="space-y-2">
            <span className="text-label-caps text-outline uppercase tracking-wider block">
              Outbound Dependencies ({resource.downstreamDeps.length})
            </span>
            <div className="space-y-1.5">
              {resource.downstreamDeps.map((dep, idx) => (
                <div
                  key={idx}
                  onClick={() => navigate(`/resources?id=${dep.name}`)}
                  className="group flex items-center justify-between p-2 rounded bg-surface-container/50 border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <ArrowRight className="h-3 w-3 text-secondary shrink-0" />
                    <div>
                      <div className="text-on-surface group-hover:text-primary font-semibold truncate">
                        {dep.name}
                      </div>
                      <div className="text-label-caps text-outline truncate">{dep.role}</div>
                    </div>
                  </div>
                  <StatusBadge status={dep.status} size="sm" showDot={false} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upstream Inflow */}
        {resource?.upstreamClients && resource.upstreamClients.length > 0 && (
          <div className="space-y-2">
            <span className="text-label-caps text-outline uppercase tracking-wider block">
              Inbound Clients ({resource.upstreamClients.length})
            </span>
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded p-2 text-xs space-y-1 text-on-surface-variant">
              {resource.upstreamClients.map((client, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                  <span>{client}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Configured Alternatives / Failovers */}
        <div className="space-y-2">
          <span className="text-label-caps text-outline uppercase tracking-wider flex items-center justify-between">
            <span>Configured Failover Paths</span>
            <span className="text-primary font-semibold">Tier-1 SLA</span>
          </span>

          {resource?.alternatives && resource.alternatives.length > 0 ? (
            resource.alternatives.map((altId, idx) => (
              <div
                key={idx}
                className="bg-surface-container/80 border border-primary/30 rounded-lg p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">{altId}</span>
                  <span className="text-label-caps bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                    HOT STANDBY
                  </span>
                </div>
                <div className="text-label-caps text-outline">
                  SLA Cutover: &lt; 100ms • Zero Quorum Loss
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => navigate('/alternatives')}
                    className="flex-1 py-1 px-2 bg-primary-container/20 hover:bg-primary-container/40 text-primary border border-primary/40 rounded text-label-caps font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <GitFork className="h-3 w-3" /> Inspect Alternative
                  </button>
                  {onTestFailover && (
                    <button
                      onClick={() => onTestFailover(altId)}
                      className="py-1 px-2 bg-surface-container-highest hover:bg-surface-bright text-on-surface border border-outline-variant/40 rounded text-label-caps font-semibold transition-colors"
                    >
                      Probe
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-3 rounded bg-surface-container/30 border border-outline-variant/20 text-outline text-center text-xs">
              No direct secondary alternative registered for this node.
            </div>
          )}
        </div>
      </div>

      {/* Drawer Action Bar */}
      <div className="p-3 border-t border-outline-variant/30 bg-surface-container-lowest/80 flex items-center gap-2">
        <button
          id="drawer-inspect-in-resources-btn"
          onClick={() => navigate(`/resources?id=${encodeURIComponent(node.resourceId)}`)}
          className="flex-1 py-2 px-3 bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/40 rounded-lg font-mono text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5 text-secondary" />
          <span>Full Resource View</span>
        </button>
        <button
          id="drawer-view-events-btn"
          onClick={() => navigate(`/events?resourceId=${encodeURIComponent(node.resourceId)}`)}
          className="py-2 px-3 bg-surface-container hover:bg-surface-container-high text-outline hover:text-on-surface border border-outline-variant/30 rounded-lg font-mono text-xs transition-colors"
        >
          Logs
        </button>
      </div>
    </div>
  );
};
