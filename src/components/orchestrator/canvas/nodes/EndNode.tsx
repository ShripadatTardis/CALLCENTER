import React from 'react';
import { StopCircle } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const EndNode = (props: any) => {
  return (
    <BaseNode
      {...props}
      icon={StopCircle}
      hasInput={true}
      hasOutput={false}
      variant="end"
    />
  );
};
