import React from 'react';
import { MessageSquare } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const ComposeReplyNode = (props: any) => {
  return <BaseNode {...props} icon={MessageSquare} />;
};
