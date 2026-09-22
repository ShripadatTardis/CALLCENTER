
import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16',
    xl: 'h-16'
  };

  return (
    <img 
      src="/lovable-uploads/6138fbbf-ad76-48a4-b751-54274a6fcfa3.png" 
      alt="TARDIS Logo" 
      className={`w-auto ${sizeClasses[size]} ${className}`}
    />
  );
};
