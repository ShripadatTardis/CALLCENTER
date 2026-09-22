import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { BaseNode } from './BaseNode';

export const AuthenticationNode = (props: any) => {
  return <BaseNode {...props} icon={ShieldCheck} />;
};
