import React from 'react';
import { Hash } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const CollectDTMFNode = (props: any) => {
  return <BaseNode {...props} icon={Hash} />;
};
