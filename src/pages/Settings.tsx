
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, Save, Bell, Shield, Database } from 'lucide-react';

const Settings: React.FC = () => {
  const [notifications, setNotifications] = useState(true);
  const [autoEscalation, setAutoEscalation] = useState(false);
  const [dataRetention, setDataRetention] = useState('90');

  const handleSave = () => {
    console.log('Settings saved');
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
            <p className="text-slate-600">Manage your TARDIS AI platform configuration</p>
          </div>
          <Button onClick={handleSave} className="flex items-center space-x-2">
            <Save className="h-4 w-4" />
            <span>Save Changes</span>
          </Button>
        </div>

        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <SettingsIcon className="h-5 w-5" />
              <span>General Settings</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company Name</Label>
                <Input id="company-name" defaultValue="TARDIS AI Corporation" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time-zone">Time Zone</Label>
                <select className="w-full border border-slate-300 rounded-md px-3 py-2">
                  <option>UTC-05:00 (Eastern Time)</option>
                  <option>UTC-08:00 (Pacific Time)</option>
                  <option>UTC+00:00 (GMT)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Notifications</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-sm text-slate-500">Receive email alerts for escalations and system events</p>
              </div>
              <Switch 
                id="email-notifications" 
                checked={notifications} 
                onCheckedChange={setNotifications} 
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-escalation">Auto Escalation Alerts</Label>
                <p className="text-sm text-slate-500">Automatically notify supervisors when calls are escalated</p>
              </div>
              <Switch 
                id="auto-escalation" 
                checked={autoEscalation} 
                onCheckedChange={setAutoEscalation} 
              />
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Security & Privacy</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
              <Input id="session-timeout" type="number" defaultValue="30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-retention">Data Retention Period (days)</Label>
              <Input 
                id="data-retention" 
                type="number" 
                value={dataRetention} 
                onChange={(e) => setDataRetention(e.target.value)} 
              />
            </div>
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>AI Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="escalation-threshold">Escalation Threshold (%)</Label>
              <Input id="escalation-threshold" type="number" defaultValue="85" />
              <p className="text-sm text-slate-500">Confidence threshold for automatic escalation</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-call-duration">Max Call Duration (minutes)</Label>
              <Input id="max-call-duration" type="number" defaultValue="15" />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;
