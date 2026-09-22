import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
  Eye,
  EyeOff,
  AlertTriangle,
  GitFork,
  ArrowRight,
  Activity,
  Layers,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { GraphNode, GraphEdge } from '../../types';

interface ServiceGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const NODE_W = 240;
const NODE_H = 100;

interface Point {
  x: number;
  y: number;
}

/**
 * Computes deterministic left-to-right DAG rank layout for resource dependency graph.
 */
function computeDeterministicLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Point> {
  const positions = new Map<string, Point>();
  const RANK_STEP = 330;
  const Y_STEP = 150;

  // Fixed deterministic positions for core runtime models/services
  const predefinedPositions: Record<string, Point> = {
    'search': { x: 80, y: 180 },
    'gemini-2.5-flash': { x: 410, y: 100 },
    'gemini-2.5-flash-lite': { x: 410, y: 280 },
    'postgres-db': { x: 740, y: 180 },
    'pdf-generator': { x: 1070, y: 100 },
    'docker-worker': { x: 1070, y: 280 },

    // Fallbacks for mock data when offline
    'gw-ingress': { x: 80, y: 180 },
    'gw-standby': { x: 80, y: 340 },
    'svc-auth': { x: 410, y: 100 },
    'svc-worker': { x: 410, y: 280 },
    'res-alt-worker-backup': { x: 410, y: 440 },
    'resource-redis': { x: 740, y: 100 },
    'res-alt-cache-memcached': { x: 740, y: 260 },
    'resource-postgres': { x: 740, y: 420 },
    'res-alt-db-replica': { x: 740, y: 580 },
    'resource-queue': { x: 1070, y: 180 },
    'resource-storage': { x: 1070, y: 360 },
  };

  // Compute in-degree based on primary edges
  const inDegree = new Map<string, number>();
  nodes.forEach((n) => inDegree.set(n.id, 0));

  edges
    .filter((e) => e.type === 'in_band' || e.type === 'sync')
    .forEach((e) => {
      if (inDegree.has(e.target)) {
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      }
    });

  const ranks = new Map<string, number>();
  const queue: string[] = [];

  nodes.forEach((n) => {
    if ((inDegree.get(n.id) || 0) === 0) {
      ranks.set(n.id, 0);
      queue.push(n.id);
    }
  });

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currRank = ranks.get(curr) || 0;

    const outEdges = edges.filter((e) => e.source === curr && e.type !== 'fallback');
    for (const e of outEdges) {
      if (!ranks.has(e.target) || ranks.get(e.target)! < currRank + 1) {
        ranks.set(e.target, currRank + 1);
        queue.push(e.target);
      }
    }
  }

  // Fallback target nodes get same rank as source node
  edges
    .filter((e) => e.type === 'fallback')
    .forEach((e) => {
      const srcRank = ranks.get(e.source) ?? 0;
      if (!ranks.has(e.target)) {
        ranks.set(e.target, srcRank);
      }
    });

  // Assign positions
  const rankGroups = new Map<number, string[]>();
  nodes.forEach((n) => {
    const r = ranks.get(n.id) ?? 0;
    if (!rankGroups.has(r)) rankGroups.set(r, []);
    rankGroups.get(r)!.push(n.id);
  });

  nodes.forEach((n) => {
    if (predefinedPositions[n.id]) {
      positions.set(n.id, predefinedPositions[n.id]);
    } else {
      const r = ranks.get(n.id) ?? 0;
      const group = rankGroups.get(r) || [n.id];
      const idx = group.indexOf(n.id);
      const x = 80 + r * RANK_STEP;
      const y = 140 + idx * Y_STEP;
      positions.set(n.id, { x, y });
    }
  });

  return positions;
}

export const ServiceGraphCanvas: React.FC<ServiceGraphCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}) => {
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showStandby, setShowStandby] = useState(true);
  const [animateFlow, setAnimateFlow] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Compute Layout Positions
  const layoutPositions = useMemo(
    () => computeDeterministicLayout(nodes, edges),
    [nodes, edges]
  );

  // Filter visible nodes & edges based on standby toggle
  const visibleNodes = useMemo(() => {
    return showStandby ? nodes : nodes.filter((n) => !n.isStandby);
  }, [nodes, showStandby]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes]
  );

  const visibleEdges = useMemo(() => {
    return edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );
  }, [edges, visibleNodeIds]);

  // Compute connected neighbor node IDs for highlighted selection
  const selectedNeighbors = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const neighbors = new Set<string>([selectedNodeId]);
    edges.forEach((e) => {
      if (e.source === selectedNodeId) neighbors.add(e.target);
      if (e.target === selectedNodeId) neighbors.add(e.source);
    });
    return neighbors;
  }, [selectedNodeId, edges]);

  // Check if primary resource is currently constrained
  const isPrimaryConstrained = useMemo(() => {
    return nodes.some(
      (n) =>
        (n.id === 'gemini-2.5-flash' || n.id === 'resource-worker') &&
        (n.isConstrained || n.status === 'degraded' || n.status === 'offline')
    );
  }, [nodes]);

  // Auto-fit function to center graph cleanly in viewport
  const fitGraph = useCallback(() => {
    if (!containerRef.current || visibleNodes.length === 0) return;
    const container = containerRef.current.getBoundingClientRect();
    const width = container.width || 1000;
    const height = container.height || 600;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    visibleNodes.forEach((node) => {
      const pos = layoutPositions.get(node.id) || { x: node.x, y: node.y };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + NODE_W);
      maxY = Math.max(maxY, pos.y + NODE_H);
    });

    const graphWidth = maxX - minX + 100;
    const graphHeight = maxY - minY + 100;

    const scaleX = (width - 80) / graphWidth;
    const scaleY = (height - 80) / graphHeight;
    let newZoom = Math.min(scaleX, scaleY, 1.1);
    newZoom = Math.max(newZoom, 0.55);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newPanX = width / 2 - centerX * newZoom;
    const newPanY = height / 2 - centerY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [visibleNodes, layoutPositions]);

  useEffect(() => {
    fitGraph();
  }, [fitGraph]);

  // Keyboard shortcut to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectNode('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectNode]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'svg' ||
      target.id === 'graph-bg-rect' ||
      target.id === 'service-graph-canvas-container'
    ) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.45));

  // Compute bezier curve path between source and target with clean arrowhead offsets
  const calculatePath = (
    sourceId: string,
    targetId: string,
    edgeType: string
  ): { path: string; midX: number; midY: number; labelX: number; labelY: number } => {
    const sPos = layoutPositions.get(sourceId) || { x: 0, y: 0 };
    const tPos = layoutPositions.get(targetId) || { x: 0, y: 0 };

    const sCenter = { x: sPos.x + NODE_W / 2, y: sPos.y + NODE_H / 2 };
    const tCenter = { x: tPos.x + NODE_W / 2, y: tPos.y + NODE_H / 2 };

    let startX = sPos.x + NODE_W;
    let startY = sCenter.y;
    let endX = tPos.x;
    let endY = tCenter.y;

    // Special vertical alignment for fallback pair (e.g. flash -> flash-lite)
    if (edgeType === 'fallback' && Math.abs(sPos.x - tPos.x) < 50) {
      if (tPos.y > sPos.y) {
        // Source directly above Target
        startX = sCenter.x;
        startY = sPos.y + NODE_H;
        endX = tCenter.x;
        endY = tPos.y - 8;
      } else {
        startX = sCenter.x;
        startY = sPos.y;
        endX = tCenter.x;
        endY = tPos.y + NODE_H + 8;
      }
      const midY = (startY + endY) / 2;
      return {
        path: `M ${startX} ${startY} L ${endX} ${endY}`,
        midX: startX,
        midY: midY,
        labelX: startX + 12,
        labelY: midY,
      };
    }

    if (tPos.x < sPos.x) {
      startX = sPos.x;
      endX = tPos.x + NODE_W + 8;
    } else {
      endX = tPos.x - 8;
    }

    const deltaX = Math.max(Math.abs(endX - startX) * 0.5, 40);
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    const path = `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`;
    return { path, midX, midY, labelX: midX, labelY: midY - 10 };
  };

  const hoveredNode = nodes.find((n) => n.id === hoveredNodeId);

  return (
    <div
      ref={containerRef}
      id="service-graph-canvas-container"
      className="relative w-full h-full flex-1 overflow-hidden bg-[#0a0f1d] select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'service-graph-canvas-container') {
          onSelectNode('');
        }
      }}
    >
      {/* Background Dot Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: 'radial-gradient(circle at 1.5px 1.5px, #3b82f6 1.5px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Canvas Action Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-surface-container/90 backdrop-blur border border-outline-variant/40 rounded-xl p-1.5 shadow-2xl font-mono text-xs">
        <div className="flex items-center gap-1 border-r border-outline-variant/30 pr-2">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="text-label-caps text-on-surface px-1 font-semibold">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={fitGraph}
            title="Fit & Center Graph"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary border border-primary/30 transition-colors font-semibold"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Fit Graph</span>
          </button>
        </div>

        <div className="flex items-center gap-1 border-r border-outline-variant/30 pr-2">
          <button
            onClick={() => setShowStandby(!showStandby)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-label-caps transition-all ${
              showStandby
                ? 'bg-primary/15 text-primary border border-primary/40'
                : 'text-outline hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {showStandby ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>Standby Nodes</span>
          </button>
        </div>

        <button
          onClick={() => setAnimateFlow(!animateFlow)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-label-caps transition-all ${
            animateFlow
              ? 'bg-tertiary/15 text-tertiary border border-tertiary/40 font-semibold'
              : 'text-outline hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          {animateFlow ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span>Flow Animation</span>
        </button>
      </div>

      {/* Floating Topology Legend */}
      <div className="absolute bottom-4 right-4 z-20 bg-surface-container-low/95 backdrop-blur border border-outline-variant/40 rounded-xl p-3.5 shadow-2xl font-mono text-xs space-y-2 hidden md:block w-72">
        <div className="text-label-caps text-outline uppercase tracking-wider flex items-center justify-between border-b border-outline-variant/20 pb-1">
          <span>RUNTIME TOPOLOGY LEGEND</span>
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 bg-tertiary rounded" />
            <span className="text-on-surface font-semibold">Primary Dependency Wire Flow</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 border-b-2 border-dashed border-primary" />
            <span className="text-primary font-semibold">Alternative Fallback Route</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-tertiary" />
            <span className="text-on-surface-variant">ACTIVE / AVAILABLE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-error animate-ping" />
            <span className="text-error font-semibold">CONSTRAINED / RATE LIMITED</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-primary">STANDBY / RESERVE</span>
          </div>
        </div>
      </div>

      {/* Empty State Banner */}
      {visibleNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 font-mono text-xs">
          <div className="bg-surface-container border border-outline-variant/40 rounded-xl p-6 text-center space-y-2 max-w-sm">
            <Layers className="h-8 w-8 text-outline mx-auto" />
            <h3 className="text-sm font-bold text-on-surface">No Graph Nodes Visible</h3>
            <p className="text-outline text-xs">
              No service dependencies match the current standby toggle filter or backend state.
            </p>
            <button
              onClick={() => setShowStandby(true)}
              className="px-3 py-1.5 bg-primary/20 text-primary border border-primary/40 rounded-lg text-xs font-semibold"
            >
              Show Standby Nodes
            </button>
          </div>
        </div>
      )}

      {/* Interactive Hover Tooltip */}
      {hoveredNode && (
        <div
          className="fixed z-30 pointer-events-none bg-surface-container-lowest/95 backdrop-blur border border-primary/40 rounded-lg p-3 shadow-2xl font-mono text-xs space-y-1 transform -translate-x-1/2 -translate-y-full mb-3 min-w-[200px]"
          style={{ left: hoverPos.x, top: hoverPos.y }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-1">
            <span className="font-bold text-on-surface">{hoveredNode.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
              hoveredNode.isConstrained || hoveredNode.status === 'degraded'
                ? 'bg-error/20 text-error border border-error/40'
                : 'bg-tertiary/20 text-tertiary border border-tertiary/40'
            }`}>
              {hoveredNode.status.toUpperCase()}
            </span>
          </div>
          <div className="text-[11px] text-outline">{hoveredNode.subtitle || hoveredNode.type}</div>
          <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 text-on-surface-variant">
            <div>P99: <strong className="text-secondary">{hoveredNode.metrics.p99 || '12ms'}</strong></div>
            <div>CPU: <strong className="text-on-surface">{hoveredNode.metrics.cpu || '24%'}</strong></div>
          </div>
        </div>
      )}

      {/* SVG Canvas Layer */}
      <svg
        id="service-graph-svg"
        className="w-full h-full block"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <rect
          id="graph-bg-rect"
          x="-3000"
          y="-3000"
          width="8000"
          height="8000"
          fill="transparent"
        />

        {/* SVG Arrowhead Defs */}
        <defs>
          <marker
            id="arrow-primary"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#4edea3" />
          </marker>
          <marker
            id="arrow-fallback"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#d0bcff" />
          </marker>
          <marker
            id="arrow-active-fallback"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#ffb4ab" />
          </marker>
          <marker
            id="arrow-sync"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#4cd7f6" />
          </marker>
        </defs>

        {/* Render Edges Layer */}
        <g id="edges-layer">
          {visibleEdges.map((edge) => {
            const isFallback = edge.type === 'fallback';
            const isSync = edge.type === 'sync';
            const { path, midX, midY, labelX, labelY } = calculatePath(
              edge.source,
              edge.target,
              edge.type
            );

            const isEdgeConnected =
              !selectedNodeId ||
              edge.source === selectedNodeId ||
              edge.target === selectedNodeId;

            // Highlight fallback route when primary model is rate limited
            const isFallbackActive = isFallback && isPrimaryConstrained;

            let strokeColor = '#4edea3';
            let strokeDash = 'none';
            let markerEnd = 'url(#arrow-primary)';
            let strokeWidth = 2.5;

            if (isFallback) {
              strokeColor = isFallbackActive ? '#ffb4ab' : '#d0bcff';
              strokeDash = '6 4';
              markerEnd = isFallbackActive ? 'url(#arrow-active-fallback)' : 'url(#arrow-fallback)';
              strokeWidth = isFallbackActive ? 3.0 : 2.0;
            } else if (isSync) {
              strokeColor = '#4cd7f6';
              strokeDash = '3 3';
              markerEnd = 'url(#arrow-sync)';
              strokeWidth = 1.5;
            }

            return (
              <g
                key={edge.id}
                className="transition-opacity duration-300"
                opacity={isEdgeConnected ? 1.0 : 0.15}
              >
                {/* Thick invisible interaction path */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  className="cursor-pointer"
                />

                {/* Rendered Edge Line */}
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDash}
                  markerEnd={markerEnd}
                  opacity={isFallback ? 0.85 : 0.9}
                  className="transition-all duration-300"
                />

                {/* Animated Wire Flow Pulse */}
                {animateFlow && (edge.animated || isFallbackActive) && (
                  <path
                    d={path}
                    fill="none"
                    stroke={isFallbackActive ? '#ffb4ab' : '#ffffff'}
                    strokeWidth={isFallbackActive ? '3.5' : '3'}
                    strokeDasharray="5 24"
                    className="pointer-events-none"
                    style={{
                      animation: isFallbackActive
                        ? 'dash-flow 1.2s linear infinite'
                        : 'dash-flow 2.2s linear infinite',
                    }}
                  />
                )}

                {/* Explicit Edge Badge for Fallback Paths */}
                {isFallback && (
                  <g transform={`translate(${labelX}, ${labelY})`}>
                    <rect
                      x="-44"
                      y="-9"
                      width="88"
                      height="18"
                      rx="4"
                      fill={isFallbackActive ? '#410002' : '#271947'}
                      stroke={isFallbackActive ? '#ffb4ab' : '#d0bcff'}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={isFallbackActive ? '#ffb4ab' : '#d0bcff'}
                      fontSize="8.5"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {isFallbackActive ? 'REROUTE ACTIVE' : 'FALLBACK ROUTE'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Render Nodes Layer */}
        <g id="nodes-layer">
          {visibleNodes.map((node) => {
            const pos = layoutPositions.get(node.id) || { x: node.x, y: node.y };
            const isSelected =
              selectedNodeId === node.id || selectedNodeId === node.resourceId;
            const isDimmed = selectedNodeId && !selectedNeighbors.has(node.id);
            const isConstrained =
              node.isConstrained || node.status === 'degraded' || node.status === 'offline';
            const isStandby = node.isStandby;

            // Visual Fill & Border Color scheme
            let bgFill = '#121829';
            let borderColor = '#2d3859';
            let statusDotColor = '#4edea3';
            let statusText = 'ACTIVE';

            if (isConstrained) {
              bgFill = '#2a1215';
              borderColor = '#ef4444';
              statusDotColor = '#f43f5e';
              statusText = 'CONSTRAINED';
            } else if (isStandby) {
              bgFill = '#171430';
              borderColor = '#818cf8';
              statusDotColor = '#a855f7';
              statusText = 'STANDBY';
            }

            if (isSelected) {
              borderColor = '#d0bcff';
            }

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
                onMouseEnter={(e) => {
                  setHoveredNodeId(node.id);
                  setHoverPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredNodeId(null)}
                className="cursor-pointer group transition-opacity duration-300"
                opacity={isDimmed ? 0.2 : 1.0}
              >
                {/* Outer Glow Halo when selected or constrained */}
                {(isSelected || isConstrained) && (
                  <rect
                    x="-4"
                    y="-4"
                    width={NODE_W + 8}
                    height={NODE_H + 8}
                    rx="14"
                    fill="none"
                    stroke={isConstrained ? '#ef4444' : '#d0bcff'}
                    strokeWidth="2"
                    opacity="0.6"
                    className={isConstrained ? 'animate-pulse' : ''}
                  />
                )}

                {/* Main Node Rect Container */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="10"
                  fill={bgFill}
                  stroke={borderColor}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeDasharray={isStandby ? '5 4' : 'none'}
                  className="transition-all duration-200 group-hover:stroke-primary"
                />

                {/* Header Section: Status Indicator & Badge */}
                <circle
                  cx="16"
                  cy="20"
                  r="4"
                  fill={statusDotColor}
                  className={isConstrained || node.status === 'healthy' ? 'animate-pulse' : ''}
                />

                <text
                  x="26"
                  y="23"
                  fill={isConstrained ? '#ffb4ab' : '#dae2fd'}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {statusText}
                </text>

                {/* Resource Type Pill */}
                <g transform={`translate(${NODE_W - 75}, 10)`}>
                  <rect
                    width="65"
                    height="16"
                    rx="4"
                    fill="#1e273d"
                    stroke="#3b486c"
                    strokeWidth="0.8"
                  />
                  <text
                    x="32"
                    y="11"
                    textAnchor="middle"
                    fill="#93c5fd"
                    fontSize="8.5"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.type.toUpperCase().slice(0, 9)}
                  </text>
                </g>

                {/* Main Resource Label - Full Unclipped Name */}
                <text
                  x="16"
                  y="46"
                  fill="#ffffff"
                  fontSize="13"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.label}
                </text>

                {/* Subtitle / Sub-Service */}
                <text
                  x="16"
                  y="62"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="Geist, sans-serif"
                >
                  {node.subtitle}
                </text>

                {/* Divider Line */}
                <line
                  x1="12"
                  y1="71"
                  x2={NODE_W - 12}
                  y2="71"
                  stroke="#222f4c"
                  strokeWidth="1"
                />

                {/* Footer Metrics Row */}
                <g transform="translate(14, 87)">
                  <text
                    x="0"
                    y="0"
                    fill="#38bdf8"
                    fontSize="9.5"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    p99: {node.metrics?.p99 || '12ms'}
                  </text>
                  <text
                    x={NODE_W - 110}
                    y="0"
                    fill="#cbd5e1"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.metrics?.cpu ? `cpu: ${node.metrics.cpu}` : node.metrics?.replicas ? `rep: ${node.metrics.replicas}` : 'capacity: ok'}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Animation Style */}
      <style>{`
        @keyframes dash-flow {
          to {
            stroke-dashoffset: -32;
          }
        }
      `}</style>
    </div>
  );
};

