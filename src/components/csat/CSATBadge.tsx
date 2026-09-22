
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CSATBadgeProps {
  score?: number;
  rating?: 'poor' | 'fair' | 'good' | 'very_good' | 'excellent';
  variant?: 'default' | 'compact';
}

export const CSATBadge: React.FC<CSATBadgeProps> = ({
  score,
  rating,
  variant = 'default'
}) => {
  const getScoreFromRating = (rating: string) => {
    const ratingMap = { poor: 1, fair: 2, good: 3, very_good: 4, excellent: 5 };
    return ratingMap[rating as keyof typeof ratingMap] || 0;
  };

  const getRatingFromScore = (score: number) => {
    if (score >= 4.5) return 'excellent';
    if (score >= 3.5) return 'very_good';
    if (score >= 2.5) return 'good';
    if (score >= 1.5) return 'fair';
    return 'poor';
  };

  const displayScore = score || getScoreFromRating(rating || '');
  const displayRating = rating || getRatingFromScore(score || 0);

  const getRatingColor = (rating: string) => {
    const colors = {
      poor: 'bg-red-100 text-red-800 border-red-200',
      fair: 'bg-orange-100 text-orange-800 border-orange-200',
      good: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      very_good: 'bg-blue-100 text-blue-800 border-blue-200',
      excellent: 'bg-green-100 text-green-800 border-green-200'
    };
    return colors[rating as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getRatingLabel = (rating: string) => {
    const labels = {
      poor: 'Poor',
      fair: 'Fair',
      good: 'Good', 
      very_good: 'Very Good',
      excellent: 'Excellent'
    };
    return labels[rating as keyof typeof labels] || '';
  };

  if (!displayScore) {
    return <Badge variant="outline">No CSAT</Badge>;
  }

  return (
    <Badge 
      className={cn(
        getRatingColor(displayRating),
        "border font-medium"
      )}
    >
      {variant === 'compact' 
        ? `${displayScore}/5`
        : `${getRatingLabel(displayRating)} (${displayScore}/5)`
      }
    </Badge>
  );
};
