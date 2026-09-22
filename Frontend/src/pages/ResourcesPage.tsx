/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Server,
  Search,
  Filter,
  Network,
  GitFork,
  ArrowRight,
  RefreshCw,
  Activity,
  Cpu,
  CheckCircle2,
  ExternalLink,
  X,
  Layers,
  Terminal,
} from 'lucide-react';
import { resourcesService } from '../services/resourcesService';
import { alternativesService } from '../services/alternativesService';
import { eventsService } from '../services/eventsService';
import { Resource, ResourceCategory, ResourceStatus } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';

const CATEGORIES: { id: ResourceCategory; label: string }[] = [
  { id: 'all', label: 'All Resources' },
  { id: 'ingress', label: 'Ingress' },
  { id: 'service', label: 'Services' },
  { id: 'compute', label: 'Compute' },
  { id: 'cache', label: 'Caches' },
  { id: 'db', label: 'Databases' },
  { id: 'queue', label: 'Queues' },
  { id: 'storage', label: 'Storage' },
];

export const ResourcesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ResourceCategory>('all');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    searchParams.get('id') || null
  );
  const [isRestarting, setIsRestarting] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const all = await resourcesService.getAll();
      setResources(all);
    }
    loadData();

    const unsub = resourcesService.subscribe(loadData);
    return () => unsub();
  }, []);

  // Filter logic
  const filteredResources = resources.filter((res) => {
    if (selectedCategory !== 'all' && res.category !== selectedCategory) {
      return false;
    }
    if (statusFilter !== 'all' && res.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        res.id.toLowerCase().includes(q) ||
        res.name.toLowerCase().includes(q) ||
        res.type.toLowerCase().includes(q) ||
        res.endpoint.toLowerCase().includes(q) ||
        res.runtime.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedResource = resources.find((r) => r.id === selectedResourceId);

  const handleRestart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRestarting(id);
    await resourcesService.restartResource(id);
    await eventsService.addEvent({
      severity: 'info',
      type: 'Resource Started',
      resource: id,
      resourceId: id,
      description: `Resource ${id} rolling restart triggered by operator. Pods re-initialized with zero downtime.`,
      chips: [
        { label: 'ACTION', value: 'ROLLING RESTART' },
        { label: 'TARGET', value: id },
        { label: 'STATUS', value: 'RUNNING' },
      ],
      details: {
        trigger: 'Operator Manual Trigger',
        scope: 'Pod Replicas',
        warmupTime: '10s',
      },
      rawJson: { action: 'RESTART', resourceId: id },
    });
    setTimeout(() => setIsRestarting(null), 1000);
  };

  return (
    <div id="resources-page" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <span className="text-label-caps text-outline font-mono uppercase tracking-widest">
            Registry & Workload Endpoints
          </span>
          <h1 className="text-xl font-bold font-mono text-on-surface tracking-tight flex items-center gap-2">
            Resource Inventory
            <span className="text-label-caps px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/40 text-on-surface font-normal">
              {resources.length} MANAGED
            </span>
          </h1>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by ID, IP, or type..."
              className="w-56 pl-8 pr-3 py-1.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs font-mono text-on-surface placeholder:text-outline/70 focus:outline-none focus:border-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="all">All Statuses</option>
            <option value="healthy">Healthy</option>
            <option value="running">Running</option>
            <option value="degraded">Degraded</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 font-mono text-xs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-primary/20 text-primary border border-primary/50 font-semibold'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container border border-outline-variant/30'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Resource Cards Grid / Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredResources.map((res) => {
          const isSelected = selectedResourceId === res.id;

          return (
            <div
              key={res.id}
              onClick={() => setSelectedResourceId(res.id)}
              className={`p-4 rounded-xl bg-surface-container-low border transition-all cursor-pointer space-y-3 font-mono text-xs flex flex-col justify-between ${
                isSelected
                  ? 'border-primary shadow-[0_0_16px_rgba(208,188,255,0.25)] bg-surface-container'
                  : 'border-outline-variant/30 hover:border-outline hover:bg-surface-container/60'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-label-caps text-outline uppercase">{res.type}</span>
                    <h3 className="text-sm font-semibold text-on-surface truncate">{res.id}</h3>
                  </div>
                  <StatusBadge status={res.status} size="sm" />
                </div>

                <div className="p-2 rounded bg-surface-container-lowest border border-outline-variant/30 text-label-caps space-y-1">
                  <div className="text-secondary truncate">{res.endpoint}</div>
                  <div className="text-outline truncate">{res.runtime}</div>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-outline-variant/20 text-center">
                  <div>
                    <span className="text-label-caps text-outline block">P99</span>
                    <span className="text-on-surface font-semibold">{res.metrics?.p99Latency || '12ms'}</span>
                  </div>
                  <div>
                    <span className="text-label-caps text-outline block">CPU</span>
                    <span className="text-on-surface font-semibold">{res.metrics?.cpu || 32}%</span>
                  </div>
                  <div>
                    <span className="text-label-caps text-outline block">REPLICAS</span>
                    <span className="text-on-surface font-semibold">{res.metrics?.replicas || '1 / 1'}</span>
                  </div>
                </div>
              </div>

              {/* Action and links footer */}
              <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/service-graph?select=${encodeURIComponent(res.id)}`);
                    }}
                    title="View in Service Graph"
                    className="p-1.5 rounded bg-surface-container border border-outline-variant/40 text-outline hover:text-primary hover:border-primary/50 transition-colors"
                  >
                    <Network className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={(e) => handleRestart(res.id, e)}
                    disabled={isRestarting === res.id}
                    title="Trigger rolling restart"
                    className="p-1.5 rounded bg-surface-container border border-outline-variant/40 text-outline hover:text-secondary hover:border-secondary/50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRestarting === res.id ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <button
                  onClick={() => setSelectedResourceId(res.id)}
                  className="text-label-caps text-primary hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>Details</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Resource Detailed Modal / Slide-over */}
      {selectedResource && (
        <div className="fixed inset-0 bg-surface-container-lowest/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/40 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 font-mono text-xs space-y-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-outline-variant/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-label-caps text-outline uppercase">
                    {selectedResource.category} • {selectedResource.type}
                  </span>
                  <StatusBadge status={selectedResource.status} size="sm" />
                </div>
                <h2 className="text-base font-bold text-on-surface">
                  {selectedResource.id}
                </h2>
                <p className="text-secondary text-xs">{selectedResource.endpoint}</p>
              </div>

              <button
                onClick={() => setSelectedResourceId(null)}
                className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Spec & Telemetry Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-container/60 p-3 rounded-xl border border-outline-variant/30">
              <div>
                <span className="text-label-caps text-outline block">P99 LATENCY</span>
                <span className="text-sm font-semibold text-on-surface">{selectedResource.metrics.p99Latency || '14.2ms'}</span>
              </div>
              <div>
                <span className="text-label-caps text-outline block">CPU LOAD</span>
                <span className="text-sm font-semibold text-on-surface">{selectedResource.metrics.cpu || 32}%</span>
              </div>
              <div>
                <span className="text-label-caps text-outline block">MEMORY</span>
                <span className="text-sm font-semibold text-on-surface">{selectedResource.metrics.memory || '4.2 GB'}</span>
              </div>
              <div>
                <span className="text-label-caps text-outline block">ERROR RATE</span>
                <span className="text-sm font-semibold text-tertiary">{selectedResource.metrics.errorRate || '0.00%'}</span>
              </div>
            </div>

            {/* Upstream & Downstream Dependencies */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-label-caps text-outline uppercase tracking-wider block">
                  Inbound Upstream Clients
                </span>
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-3 space-y-2">
                  {selectedResource.upstreamClients && selectedResource.upstreamClients.length > 0 ? (
                    selectedResource.upstreamClients.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-on-surface">
                        <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                        <span>{c}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-outline">Top of mesh (Edge Ingress)</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-label-caps text-outline uppercase tracking-wider block">
                  Outbound Downstream Dependencies
                </span>
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-3 space-y-2">
                  {selectedResource.downstreamDeps && selectedResource.downstreamDeps.length > 0 ? (
                    selectedResource.downstreamDeps.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-on-surface">
                        <span className="truncate">{d.name}</span>
                        <StatusBadge status={d.status} size="sm" showDot={false} />
                      </div>
                    ))
                  ) : (
                    <div className="text-outline">Terminal storage/leaf node</div>
                  )}
                </div>
              </div>
            </div>

            {/* Configured Alternatives */}
            {selectedResource.alternatives.length > 0 && (
              <div className="space-y-2">
                <span className="text-label-caps text-outline uppercase tracking-wider block">
                  Associated Failover Resource
                </span>
                <div className="bg-surface-container/80 border border-primary/40 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-primary">{selectedResource.alternatives[0]}</div>
                    <div className="text-label-caps text-outline">Hot standby ready for instant failover reroute</div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedResourceId(null);
                      navigate('/alternatives');
                    }}
                    className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 rounded-lg text-label-caps font-semibold"
                  >
                    View in Alternatives
                  </button>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-outline-variant/30">
              <button
                onClick={() => {
                  setSelectedResourceId(null);
                  navigate(`/service-graph?select=${encodeURIComponent(selectedResource.id)}`);
                }}
                className="px-4 py-2 bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/40 rounded-lg flex items-center gap-2"
              >
                <Network className="h-4 w-4 text-primary" />
                <span>Locate in Graph</span>
              </button>

              <button
                onClick={() => setSelectedResourceId(null)}
                className="px-4 py-2 bg-primary-container/20 hover:bg-primary-container/30 text-primary border border-primary/50 rounded-lg font-semibold"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
