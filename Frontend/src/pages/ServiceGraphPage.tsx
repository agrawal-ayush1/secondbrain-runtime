/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Network,
  Activity,
  Layers,
  GitFork,
  CheckCircle2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { graphService } from '../services/graphService';
import { resourcesService } from '../services/resourcesService';
import { alternativesService } from '../services/alternativesService';
import { ServiceGraph, GraphNode, Resource } from '../types';
import { ServiceGraphCanvas } from '../components/graph/ServiceGraphCanvas';
import { NodeDetailDrawer } from '../components/graph/NodeDetailDrawer';

export const ServiceGraphPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [graph, setGraph] = useState<ServiceGraph | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    searchParams.get('select') || null
  );
  const [isTestingFailover, setIsTestingFailover] = useState(false);

  useEffect(() => {
    async function loadData() {
      const [g, r] = await Promise.all([
        graphService.getGraph(),
        resourcesService.getAll(),
      ]);
      setGraph(g);
      setResources(r);
    }
    loadData();

    const unsubG = graphService.subscribe(loadData);
    const unsubR = resourcesService.subscribe(loadData);
    return () => {
      unsubG();
      unsubR();
    };
  }, []);

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    if (nodeId) {
      setSearchParams({ select: nodeId });
    } else {
      setSearchParams({});
    }
  };

  const handleCloseDrawer = () => {
    setSelectedNodeId(null);
    setSearchParams({});
  };

  const handleTestFailover = async (altId: string) => {
    setIsTestingFailover(true);
    await alternativesService.testFailover(altId);
    setIsTestingFailover(false);
  };

  const selectedNode = graph?.nodes.find(
    (n) => n.id === selectedNodeId || n.resourceId === selectedNodeId
  );
  const selectedResource = resources.find(
    (r) => r.id === selectedNode?.resourceId || r.id === selectedNode?.id
  );

  // Dynamic Topology Metrics derived from actual graph data
  const totalNodes = graph?.nodes.length || 0;
  const activeNodesCount = graph?.nodes.filter((n) => !n.isStandby).length || graph?.totalActive || 0;
  const constrainedCount = graph?.nodes.filter((n) => n.isConstrained || n.status === 'degraded' || n.status === 'offline').length || 0;
  const fallbackRoutesCount = graph?.edges.filter((e) => e.type === 'fallback').length || 0;
  const wireFlowsCount = graph?.edges.filter((e) => e.type === 'in_band').length || 0;

  return (
    <div id="service-graph-page" className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Topology Meta Toolbar */}
      <div className="h-12 px-6 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between shrink-0 font-mono text-xs z-10">
        <div className="flex items-center gap-6 overflow-x-auto py-1">
          <div className="flex items-center gap-2 text-on-surface">
            <Network className="h-4 w-4 text-primary" />
            <span className="text-outline text-label-caps">SERVICE GRAPH:</span>
            <span className="font-semibold text-xs text-on-surface">Runtime Dependency Topology</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-tertiary shadow-[0_0_6px_rgba(78,222,163,0.8)]" />
            <span className="text-on-surface font-semibold">{activeNodesCount} Active Nodes</span>
          </div>

          {constrainedCount > 0 ? (
            <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-error/15 border border-error/40 text-error">
              <span className="h-2 w-2 rounded-full bg-error animate-ping" />
              <span className="font-bold">{constrainedCount} Constrained</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-outline">
              <span className="h-2 w-2 rounded-full bg-tertiary/60" />
              <span>0 Constrained</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-outline">
            <GitFork className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary font-semibold">{fallbackRoutesCount} Alternative Routes</span>
          </div>

          <div className="flex items-center gap-2 text-outline">
            <Activity className="h-3.5 w-3.5 text-secondary" />
            <span className="text-secondary font-semibold">{wireFlowsCount} Dependency Wire Flows</span>
          </div>
        </div>

        {/* Quick Node Search Select */}
        <div className="hidden md:flex items-center gap-2">
          <select
            value={selectedNodeId || ''}
            onChange={(e) => handleSelectNode(e.target.value)}
            className="bg-surface-container border border-outline-variant/40 rounded px-2.5 py-1 text-xs font-mono text-on-surface focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="">Select / Focus Node...</option>
            {graph?.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} ({n.type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Canvas & Detail Drawer Container */}
      <div className="flex-1 flex relative overflow-hidden">
        {graph && (
          <ServiceGraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        )}

        {/* Slide-over Node Inspector */}
        {selectedNode && (
          <NodeDetailDrawer
            node={selectedNode}
            resource={selectedResource}
            onClose={handleCloseDrawer}
            onTestFailover={handleTestFailover}
          />
        )}
      </div>
    </div>
  );
};
