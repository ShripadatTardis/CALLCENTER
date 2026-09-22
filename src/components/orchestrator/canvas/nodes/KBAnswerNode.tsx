import React from 'react';
import { BookOpen } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const KBAnswerNode = (props: any) => {
  return <BaseNode {...props} icon={BookOpen} />;
};
