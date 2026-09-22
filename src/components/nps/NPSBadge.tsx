
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NPSBadgeProps {
  score?: number;
  category?: 'detractor' | 'passive' | 'promoter';
  variant?: 'default' | 'compact';
}

export const NPSBadge: React.FC<NPSBadgeProps> = ({
  score,
  category,
  variant = 'default'
}) => {
  const getCategoryFromScore = (score: number) => {
    if (score >= 9) return 'promoter';
    if (score >= 7) return 'passive';
    return 'detractor';
  };

  const getScoreFromCategory = (category: string) => {
    const categoryMap = { detractor: 5, passive: 7, promoter: 9 };
    return categoryMap[category as keyof typeof categoryMap] || 0;
  };

  const displayScore = score !== undefined ? score : getScoreFromCategory(category || '');
  const displayCategory = category || getCategoryFromScore(score || 0);

  const getCategoryColor = (category: string) => {
    const colors = {
      detractor: 'bg-red-100 text-red-800 border-red-200',
      passive: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      promoter: 'bg-green-100 text-green-800 border-green-200'
    };
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      detractor: 'Detractor',
      passive: 'Passive',
      promoter: 'Promoter'
    };
    return labels[category as keyof typeof labels] || '';
  };

  if (displayScore === 0) {
    return <Badge variant="outline">No NPS</Badge>;
  }

  return (
    <Badge 
      className={cn(
        getCategoryColor(displayCategory),
        "border font-medium"
      )}
    >
      {variant === 'compact' 
        ? `${displayScore}/10`
        : `${getCategoryLabel(displayCategory)} (${displayScore}/10)`
      }
    </Badge>
  );
};
