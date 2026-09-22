import React from 'react';
import { Handle, Position } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BaseNodeProps {
  data: {
    label: string;
    type: string;
    config?: any;
    hasError?: boolean;
    hasConfig?: boolean;
  };
  selected?: boolean;
  icon: LucideIcon;
  hasInput?: boolean;
  hasOutput?: boolean;
  variant?: 'start' | 'end' | 'default';
}

export const BaseNode: React.FC<BaseNodeProps> = ({
  data,
  selected,
  icon: Icon,
  hasInput = true,
  hasOutput = true,
  variant = 'default',
}) => {
  return (
    <Card
      className={cn(
        'relative transition-all min-w-[200px]',
        selected ? 'ring-2 ring-primary shadow-soft-lg' : 'hover:shadow-soft-md',
        data.hasError && 'border-destructive'
      )}
    >
      {hasInput && variant !== 'start' && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 !bg-primary border-2 border-background"
        />
      )}
      
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={cn(
            "h-4 w-4",
            variant === 'start' ? "text-green-500" :
            variant === 'end' ? "text-red-500" :
            "text-primary"
          )} />
          <span className="font-medium text-sm text-foreground">{data.label}</span>
          {data.hasError && (
            <div className="ml-auto w-2 h-2 rounded-full bg-destructive" />
          )}
          {data.hasConfig && (
            <Badge variant="outline" className="text-xs ml-auto">
              Configured
            </Badge>
          )}
        </div>
        <Badge variant="outline" className="text-xs badge-blue">
          {data.type}
        </Badge>
      </div>

      {hasOutput && variant !== 'end' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 !bg-primary border-2 border-background"
        />
      )}
    </Card>
  );
};
