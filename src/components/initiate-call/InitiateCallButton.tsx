
import React from 'react';
import { Button } from '@/components/ui/button';
import { Phone, Loader2 } from 'lucide-react';

interface InitiateCallButtonProps {
  onInitiateCall: () => void;
  isLoading: boolean;
  isDisabled: boolean;
}

export const InitiateCallButton: React.FC<InitiateCallButtonProps> = ({
  onInitiateCall,
  isLoading,
  isDisabled
}) => {
  return (
    <div className="pt-1">
      <Button
        onClick={onInitiateCall}
        disabled={isDisabled}
        className="w-full h-9"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Initiating Call...
          </>
        ) : (
          <>
            <Phone className="w-4 h-4 mr-2" />
            Initiate Call
          </>
        )}
      </Button>
    </div>
  );
};
