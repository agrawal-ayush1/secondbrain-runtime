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
    searchParams.get('select') || 'gw-ingress'
  );
  const [filterQuery, setFilterQuery] = useState('');
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
    setSearchParams({ select: nodeId });
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

  return (
    <div id="service-graph-page" className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Topology Meta Toolbar */}
      <div className="h-12 px-6 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between shrink-0 font-mono text-xs z-10">
        <div className="flex items-center gap-6 overflow-x-auto py-1">
          <div className="flex items-center gap-2 text-on-surface">
            <span className="text-outline text-label-caps">TOPOLOGY:</span>
            <span className="font-semibold text-xs">Production Mesh v2.8</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-tertiary shadow-[0_0_6px_rgba(78,222,163,0.8)]" />
            <span className="text-on-surface font-semibold">{graph?.totalActive || 7} Active Nodes</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-on-surface-variant">{graph?.totalStandby || 1} Hot Standby</span>
          </div>

          <div className="flex items-center gap-2 text-outline">
            <span className="text-secondary font-semibold">11 Active Wire Flows</span>
          </div>

          <div className="flex items-center gap-2 text-outline">
            <span className="text-primary font-semibold">4 Alternative Routes</span>
          </div>
        </div>

        {/* Quick Node Search Select */}
        <div className="hidden md:flex items-center gap-2">
          <select
            value={selectedNodeId || ''}
            onChange={(e) => handleSelectNode(e.target.value)}
            className="bg-surface-container border border-outline-variant/40 rounded px-2.5 py-1 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="" disabled>Jump to Node...</option>
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
