import React from 'react';
import { Package } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const ProductLookupNode = (props: any) => {
  return <BaseNode {...props} icon={Package} />;
};
