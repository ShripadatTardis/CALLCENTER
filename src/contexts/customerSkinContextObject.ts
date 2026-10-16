import { createContext } from 'react';
import type { CustomerSkin } from '@/theme/customerConfigs';

export interface CustomerSkinContextValue {
  skin: CustomerSkin;
  setSkin: (skin: CustomerSkin) => void;
}

export const CustomerSkinContext = createContext<CustomerSkinContextValue | undefined>(undefined);
