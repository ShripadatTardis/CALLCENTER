import React from 'react';
import { Users } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const HumanEscalationNode = (props: any) => {
  return <BaseNode {...props} icon={Users} />;
};
