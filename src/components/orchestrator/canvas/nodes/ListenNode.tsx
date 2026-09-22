import React from 'react';
import { Mic } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const ListenNode = (props: any) => {
  return <BaseNode {...props} icon={Mic} />;
};
