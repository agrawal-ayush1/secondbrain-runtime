/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResourceStatus, AlternativeStatus, WorkloadStatus, EventSeverity } from '../../types';

interface StatusBadgeProps {
  status: ResourceStatus | AlternativeStatus | WorkloadStatus | EventSeverity | string;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm', showDot = true }) => {
  const norm = status.toLowerCase();

  let bgClass = 'bg-surface-container-high text-on-surface-variant border-outline-variant/30';
  let dotClass = 'bg-outline';
  let label = status;

  if (norm === 'healthy' || norm === 'success' || norm === 'running' || norm === 'available' || norm === 'ready' || norm === 'completed') {
    bgClass = 'bg-tertiary/10 text-tertiary border-tertiary/30';
    dotClass = 'bg-tertiary shadow-[0_0_8px_rgba(78,222,163,0.6)]';
  } else if (norm === 'active_fallback' || norm === 'active' || norm === 'warning' || norm === 'degraded' || norm === 'retry_pending') {
    bgClass = 'bg-secondary/15 text-secondary border-secondary/40';
    dotClass = 'bg-secondary shadow-[0_0_8px_rgba(76,215,246,0.6)]';
  } else if (norm === 'offline' || norm === 'error' || norm === 'failed' || norm === 'critical') {
    bgClass = 'bg-error/15 text-error border-error/40';
    dotClass = 'bg-error shadow-[0_0_8px_rgba(255,180,171,0.6)]';
  } else if (norm === 'standby' || norm === 'queued' || norm === 'info' || norm === 'reserve') {
    bgClass = 'bg-primary/10 text-primary border-primary/30';
    dotClass = 'bg-primary shadow-[0_0_8px_rgba(208,188,255,0.4)]';
  }

  const sizeClasses = {
    sm: 'text-label-caps px-2 py-0.5 rounded-full border',
    md: 'text-xs px-2.5 py-1 rounded-md border font-medium',
    lg: 'text-sm px-3 py-1.5 rounded-md border font-medium',
  }[size];

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-wider ${sizeClasses} ${bgClass}`}>
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${dotClass} animate-pulse`} />}
      <span>{label.replace('_', ' ')}</span>
    </span>
  );
};
