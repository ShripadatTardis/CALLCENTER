
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
    <div className="mt-6 flex justify-center">
      <Button
        onClick={onInitiateCall}
        disabled={isDisabled}
        size="lg"
        className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Initiating Call...
          </>
        ) : (
          <>
            <Phone className="w-5 h-5 mr-2" />
            Initiate Call
          </>
        )}
      </Button>
    </div>
  );
};
