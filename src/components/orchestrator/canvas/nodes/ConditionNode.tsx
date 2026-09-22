import React from 'react';
import { Handle, Position } from 'reactflow';
import { Code } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const ConditionNode = ({ data, selected }: any) => {
  return (
    <Card
      className={cn(
        'relative transition-all min-w-[200px]',
        selected ? 'ring-2 ring-primary shadow-soft-lg' : 'hover:shadow-soft-md',
        data.hasError && 'border-destructive'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-primary border-2 border-background"
      />
      
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Code className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm text-foreground">{data.label}</span>
          {data.hasError && (
            <div className="ml-auto w-2 h-2 rounded-full bg-destructive" />
          )}
        </div>
        <Badge variant="outline" className="text-xs badge-blue mb-2">
          {data.type}
        </Badge>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            True
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            False
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '55px' }}
        className="w-3 h-3 !bg-green-500 border-2 border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '75px' }}
        className="w-3 h-3 !bg-red-500 border-2 border-background"
      />
    </Card>
  );
};
