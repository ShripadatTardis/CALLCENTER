
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant }) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'engaged':
      case 'in-progress':
      case 'resolved':
        return 'bg-green-100 text-green-800 hover:bg-green-100';
      case 'idle':
      case 'pending':
      case 'awaiting_input':
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
      case 'escalated':
      case 'escalation_triggered':
      case 'dropped':
        return 'bg-red-100 text-red-800 hover:bg-red-100';
      case 'complete':
      case 'callback_scheduled':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Badge
      variant={variant || "outline"}
      className={cn("font-medium", !variant && getStatusColor(status))}
    >
      {formatStatus(status)}
    </Badge>
  );
};
