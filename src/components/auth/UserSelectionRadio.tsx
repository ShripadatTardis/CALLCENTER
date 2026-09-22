import React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { sampleUsers } from '@/data/sampleUsers';
import { getRoleDisplayName } from '@/lib/auth';

interface UserSelectionRadioProps {
  selectedUser: string;
  onUserSelection: (userId: string) => void;
}

export const UserSelectionRadio: React.FC<UserSelectionRadioProps> = ({
  selectedUser,
  onUserSelection,
}) => {
  return (
    <div className="p-4 bg-slate-50 rounded-lg border">
      <h4 className="font-medium text-sm text-slate-900 mb-3 flex items-center">
        <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
        Quick Demo Access
      </h4>
      <RadioGroup value={selectedUser} onValueChange={onUserSelection} className="space-y-3">
        {sampleUsers.map((user) => (
          <div key={user.id} className="flex items-center space-x-3 p-2 rounded hover:bg-white transition-colors">
            <RadioGroupItem value={user.id} id={user.id} />
            <Label htmlFor={user.id} className="flex-1 cursor-pointer">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-900">{user.name}</span>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {getRoleDisplayName(user.role)}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{user.email}</div>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
};
