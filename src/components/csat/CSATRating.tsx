
import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CSATRatingProps {
  score?: number;
  rating?: 'poor' | 'fair' | 'good' | 'very_good' | 'excellent';
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const CSATRating: React.FC<CSATRatingProps> = ({
  score,
  rating,
  showLabel = false,
  size = 'md',
  className
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

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
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

  const getRatingColor = (rating: string) => {
    const colors = {
      poor: 'text-red-500',
      fair: 'text-orange-500',
      good: 'text-yellow-500',
      very_good: 'text-blue-500',
      excellent: 'text-green-500'
    };
    return colors[rating as keyof typeof colors] || 'text-gray-400';
  };

  if (!displayScore) {
    return <span className="text-slate-400 text-sm">No rating</span>;
  }

  return (
    <div className={cn("flex items-center space-x-1", className)}>
      <div className="flex space-x-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              sizeClasses[size],
              star <= displayScore
                ? cn('fill-current', getRatingColor(displayRating))
                : 'text-gray-300'
            )}
          />
        ))}
      </div>
      {showLabel && (
        <span className={cn("text-sm font-medium", getRatingColor(displayRating))}>
          {getRatingLabel(displayRating)} ({displayScore}/5)
        </span>
      )}
    </div>
  );
};
