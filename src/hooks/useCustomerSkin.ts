import { useContext } from 'react';
import { CustomerSkinContext } from '@/contexts/customerSkinContextObject';

export function useCustomerSkin() {
  const ctx = useContext(CustomerSkinContext);
  if (!ctx) throw new Error('useCustomerSkin must be used within CustomerSkinProvider');
  return ctx;
}
