import React from 'react';
import { Globe } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const APICallNode = (props: any) => {
  return <BaseNode {...props} icon={Globe} />;
};
