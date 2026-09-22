import React from 'react';
import { PlayCircle } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const StartNode = (props: any) => {
  return (
    <BaseNode
      {...props}
      icon={PlayCircle}
      hasInput={false}
      hasOutput={true}
      variant="start"
    />
  );
};
