
import React from 'react';
import { cn } from '@/lib/utils';

interface NPSRatingProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const NPSRating: React.FC<NPSRatingProps> = ({
  score,
  showLabel = false,
  size = 'md',
  className
}) => {
  const getCategory = (score: number) => {
    if (score >= 9) return 'promoter';
    if (score >= 7) return 'passive';
    return 'detractor';
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      promoter: 'Promoter',
      passive: 'Passive',
      detractor: 'Detractor'
    };
    return labels[category as keyof typeof labels] || '';
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      promoter: 'text-green-600 bg-green-100',
      passive: 'text-yellow-600 bg-yellow-100',  
      detractor: 'text-red-600 bg-red-100'
    };
    return colors[category as keyof typeof colors] || 'text-gray-600 bg-gray-100';
  };

  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-1.5',
    lg: 'text-lg px-4 py-2'
  };

  const category = getCategory(score);

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <div className={cn(
        "rounded-lg font-bold border-2 border-current",
        getCategoryColor(category),
        sizeClasses[size]
      )}>
        {score}/10
      </div>
      {showLabel && (
        <span className={cn("font-medium", getCategoryColor(category).split(' ')[0])}>
          {getCategoryLabel(category)}
        </span>
      )}
    </div>
  );
};
