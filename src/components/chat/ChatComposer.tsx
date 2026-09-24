import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({ onSend, disabled }) => {
  const [value, setValue] = useState('');

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Type a message..."
        disabled={disabled}
      />
      <Button onClick={submit} disabled={disabled || !value.trim()}>
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
};
