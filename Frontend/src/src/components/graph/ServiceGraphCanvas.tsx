/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
  Eye,
  EyeOff,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import { GraphNode, GraphEdge } from '../../types';

interface ServiceGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export const ServiceGraphCanvas: React.FC<ServiceGraphCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showStandby, setShowStandby] = useState(true);
  const [animateFlow, setAnimateFlow] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter nodes and edges based on standby toggle
  const visibleNodes = showStandby ? nodes : nodes.filter((n) => !n.isStandby);
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter(
    (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking on SVG canvas background
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === 'graph-bg-rect') {
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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.5));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 20, y: 30 });
  };

  // Node dimension constants
  const NODE_W = 200;
  const NODE_H = 88;

  const getNodeCenter = (nodeId: string) => {
    const n = nodes.find((item) => item.id === nodeId);
    if (!n) return { x: 0, y: 0, right: 0, left: 0, top: 0, bottom: 0 };
    return {
      x: n.x + NODE_W / 2,
      y: n.y + NODE_H / 2,
      left: n.x,
      right: n.x + NODE_W,
      top: n.y,
      bottom: n.y + NODE_H,
    };
  };

  // Calculate clean bezier curve between nodes
  const calculatePath = (sourceId: string, targetId: string) => {
    const s = getNodeCenter(sourceId);
    const t = getNodeCenter(targetId);

    // Source exit point is usually the right side of source, target entry point is left side of target
    let startX = s.right;
    let startY = s.y;
    let endX = t.left;
    let endY = t.y;

    if (t.x < s.x) {
      // If target is to the left
      startX = s.left;
      endX = t.right;
    }

    const deltaX = Math.abs(endX - startX) * 0.5;
    return `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`;
  };

  return (
    <div
      ref={containerRef}
      id="service-graph-canvas-container"
      className="relative w-full h-full flex-1 overflow-hidden bg-surface-container-lowest select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Background Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #494454 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Floating Canvas Controls Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 bg-surface-container/90 backdrop-blur border border-outline-variant/40 rounded-xl p-1.5 shadow-xl font-mono text-xs">
        <div className="flex items-center gap-1 border-r border-outline-variant/30 pr-2">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="text-label-caps text-on-surface px-1">
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
            onClick={handleReset}
            title="Reset Scale"
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
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
              ? 'bg-tertiary/15 text-tertiary border border-tertiary/40'
              : 'text-outline hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          {animateFlow ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span>Flow Animation</span>
        </button>
      </div>

      {/* Floating Topology Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-surface-container-low/90 backdrop-blur border border-outline-variant/30 rounded-xl p-3 shadow-lg font-mono text-xs space-y-2 hidden md:block">
        <div className="text-label-caps text-outline uppercase tracking-wider">
          Connection Archetypes
        </div>
        <div className="flex flex-col gap-1.5 text-label-caps text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-tertiary rounded" />
            <span>Active In-Band Wire Flow (gRPC/mTLS)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-5 border-b-2 border-dashed border-primary" />
            <span>Configured Alternative Fallback Path</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-5 border-b-2 border-dotted border-secondary" />
            <span>State Synchronization & WAL Backup</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas for Edges & Interactive Nodes */}
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
          x="-2000"
          y="-2000"
          width="5000"
          height="5000"
          fill="transparent"
        />

        {/* SVG Defs for markers and gradients */}
        <defs>
          <marker
            id="arrow-solid"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#4edea3" />
          </marker>
          <marker
            id="arrow-standby"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#d0bcff" />
          </marker>
          <marker
            id="arrow-secondary"
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

        {/* Render Edges */}
        <g id="edges-layer">
          {visibleEdges.map((edge) => {
            const isFallback = edge.type === 'fallback';
            const isSync = edge.type === 'sync';
            const pathData = calculatePath(edge.source, edge.target);

            let strokeColor = '#4edea3';
            let strokeDash = 'none';
            let markerEnd = 'url(#arrow-solid)';

            if (isFallback) {
              strokeColor = '#d0bcff';
              strokeDash = '6 4';
              markerEnd = 'url(#arrow-standby)';
            } else if (isSync) {
              strokeColor = '#4cd7f6';
              strokeDash = '3 3';
              markerEnd = 'url(#arrow-secondary)';
            }

            return (
              <g key={edge.id} className="group">
                {/* Background fat path for easier hover */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  className="cursor-pointer"
                />
                {/* Rendered Edge Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isFallback ? 1.5 : 2}
                  strokeDasharray={strokeDash}
                  markerEnd={markerEnd}
                  opacity={isFallback ? 0.7 : 0.85}
                  className="transition-all duration-300"
                />
                {/* Optional Animated Packet Flow Pulse */}
                {animateFlow && edge.animated && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#dae2fd"
                    strokeWidth="3"
                    strokeDasharray="4 28"
                    className="pointer-events-none"
                    style={{
                      animation: 'dash-flow 2s linear infinite',
                    }}
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Render Nodes */}
        <g id="nodes-layer">
          {visibleNodes.map((node) => {
            const isSelected = selectedNodeId === node.id || selectedNodeId === node.resourceId;
            const isStandby = node.isStandby;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
                className="cursor-pointer group"
              >
                {/* Node Box Outer Shadow / Container */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="10"
                  fill={isStandby ? '#131b2e' : '#171f33'}
                  stroke={
                    isSelected
                      ? '#d0bcff'
                      : isStandby
                      ? '#494454'
                      : '#2d3449'
                  }
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeDasharray={isStandby ? '4 3' : 'none'}
                  className={`transition-all duration-200 ${
                    isSelected
                      ? 'filter drop-shadow-[0_0_12px_rgba(208,188,255,0.4)]'
                      : 'group-hover:stroke-outline'
                  }`}
                />

                {/* Status Indicator Dot */}
                <circle
                  cx="16"
                  cy="20"
                  r="4"
                  fill={
                    node.status === 'healthy'
                      ? '#4edea3'
                      : node.status === 'standby'
                      ? '#d0bcff'
                      : node.status === 'degraded'
                      ? '#4cd7f6'
                      : '#ffb4ab'
                  }
                  className={node.status === 'healthy' ? 'animate-pulse' : ''}
                />

                {/* Node Label */}
                <text
                  x="28"
                  y="23"
                  fill="#dae2fd"
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
                </text>

                {/* Subtitle / Type */}
                <text
                  x="16"
                  y="42"
                  fill="#958ea0"
                  fontSize="10"
                  fontFamily="Geist, sans-serif"
                >
                  {node.subtitle}
                </text>

                {/* Divider Line */}
                <line
                  x1="12"
                  y1="52"
                  x2={NODE_W - 12}
                  y2="52"
                  stroke="#222a3d"
                  strokeWidth="1"
                />

                {/* Bottom Metric Badges */}
                <g transform="translate(14, 68)">
                  <text
                    x="0"
                    y="0"
                    fill="#4cd7f6"
                    fontSize="9.5"
                    fontWeight="500"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    p99: {node.metrics.p99 || '12ms'}
                  </text>
                  <text
                    x="80"
                    y="0"
                    fill="#cbc3d7"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.metrics.cpu ? `cpu: ${node.metrics.cpu}` : node.metrics.weight || `rep: ${node.metrics.replicas || '1'}`}
                  </text>
                </g>

                {/* Standby Label Tag if applicable */}
                {isStandby && (
                  <g transform={`translate(${NODE_W - 55}, 12)`}>
                    <rect
                      width="45"
                      height="15"
                      rx="3"
                      fill="#3c0091"
                      stroke="#d0bcff"
                      strokeWidth="0.8"
                    />
                    <text
                      x="22"
                      y="11"
                      textAnchor="middle"
                      fill="#d0bcff"
                      fontSize="8"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      STANDBY
                    </text>
                  </g>
                )}
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
