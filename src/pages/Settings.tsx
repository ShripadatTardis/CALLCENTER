
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Bell, Shield, Database, SlidersHorizontal } from 'lucide-react';

const Settings: React.FC = () => {
  const [notifications, setNotifications] = useState(true);
  const [autoEscalation, setAutoEscalation] = useState(false);
  const [dataRetention, setDataRetention] = useState('90');

  const handleSave = () => {
    console.log('Settings saved');
  };

  return (
    <Layout>
      <div className="bg-slate-950 min-h-full text-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-end">
          <Button size="sm" className="h-8 bg-cyan-600 hover:bg-cyan-500" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="bg-slate-900 border border-slate-800 h-9">
            <TabsTrigger value="general" className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />General
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              <Bell className="h-3.5 w-3.5 mr-1.5" />Notifications
            </TabsTrigger>
            <TabsTrigger value="security" className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              <Shield className="h-3.5 w-3.5 mr-1.5" />Security
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              <Database className="h-3.5 w-3.5 mr-1.5" />AI Configuration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-name" className="text-xs text-slate-400">Company Name</Label>
                <Input id="company-name" defaultValue="TARDIS AI Corporation" className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time-zone" className="text-xs text-slate-400">Time Zone</Label>
                <select className="w-full h-8 border border-slate-700 bg-slate-900 text-slate-200 rounded-md px-2 text-xs">
                  <option>UTC-05:00 (Eastern Time)</option>
                  <option>UTC-08:00 (Pacific Time)</option>
                  <option>UTC+00:00 (GMT)</option>
                </select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="email-notifications" className="text-xs text-slate-300">Email Notifications</Label>
                  <p className="text-xs text-slate-500">Receive email alerts for escalations and system events</p>
                </div>
                <Switch id="email-notifications" checked={notifications} onCheckedChange={setNotifications} />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div>
                  <Label htmlFor="auto-escalation" className="text-xs text-slate-300">Auto Escalation Alerts</Label>
                  <p className="text-xs text-slate-500">Automatically notify supervisors when calls are escalated</p>
                </div>
                <Switch id="auto-escalation" checked={autoEscalation} onCheckedChange={setAutoEscalation} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="mt-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="session-timeout" className="text-xs text-slate-400">Session Timeout (minutes)</Label>
                <Input id="session-timeout" type="number" defaultValue="30" className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-retention" className="text-xs text-slate-400">Data Retention Period (days)</Label>
                <Input
                  id="data-retention"
                  type="number"
                  value={dataRetention}
                  onChange={(e) => setDataRetention(e.target.value)}
                  className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="escalation-threshold" className="text-xs text-slate-400">Escalation Threshold (%)</Label>
                <Input id="escalation-threshold" type="number" defaultValue="85" className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200" />
                <p className="text-[11px] text-slate-500">Confidence threshold for automatic escalation</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-call-duration" className="text-xs text-slate-400">Max Call Duration (minutes)</Label>
                <Input id="max-call-duration" type="number" defaultValue="15" className="h-8 text-xs border-slate-700 bg-slate-900 text-slate-200" />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Settings;
