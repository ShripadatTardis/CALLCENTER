
import React from 'react';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBgColor: string;
  iconColor: string;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon: Icon,
  title,
  description,
  iconBgColor,
  iconColor,
}) => {
  return (
    <div className="flex items-center space-x-4 p-4 bg-white/50 rounded-lg backdrop-blur-sm">
      <div className={`p-3 ${iconBgColor} rounded-lg`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
};
