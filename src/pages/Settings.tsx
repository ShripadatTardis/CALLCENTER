
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Save, Bell, Shield, Database, SlidersHorizontal, Sun, Moon, Monitor } from 'lucide-react';
import { type AppearancePreference } from '@/contexts/ThemeContext';
import { useTheme } from '@/hooks/useTheme';

const Settings: React.FC = () => {
  const [notifications, setNotifications] = useState(true);
  const [autoEscalation, setAutoEscalation] = useState(false);
  const [dataRetention, setDataRetention] = useState('90');
  const { preference, setPreference } = useTheme();

  const handleSave = () => {
    console.log('Settings saved');
  };

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <div className="flex items-center justify-end">
          <Button size="sm" className="h-8 bg-cyan-600 hover:bg-cyan-500" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="general">
          {/* overflow-x-auto: at ~390px the 5 triggers (with icons/labels)
              exceeded viewport width and clipped Appearance off-screen with
              no way to reach it — found during Session 10.5B's responsive
              survey; Appearance reachability at mobile width is an explicit
              requirement. */}
          <TabsList className="bg-card border border-border h-9 flex-nowrap overflow-x-auto max-w-full justify-start">
            <TabsTrigger value="general" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />General
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">
              <Bell className="h-3.5 w-3.5 mr-1.5" />Notifications
            </TabsTrigger>
            <TabsTrigger value="security" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">
              <Shield className="h-3.5 w-3.5 mr-1.5" />Security
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">
              <Database className="h-3.5 w-3.5 mr-1.5" />AI Configuration
            </TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs shrink-0 data-[state=active]:bg-muted data-[state=active]:text-foreground">
              <Sun className="h-3.5 w-3.5 mr-1.5" />Appearance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="mt-3">
            <div className="rounded-md border border-border bg-card p-4 space-y-3 max-w-md">
              <div>
                <Label className="text-xs text-foreground">Appearance</Label>
                <p className="text-xs text-muted-foreground">Choose how VoiceForce looks on this device.</p>
              </div>
              <ToggleGroup
                type="single"
                value={preference}
                onValueChange={(value) => value && setPreference(value as AppearancePreference)}
                className="justify-start gap-2"
                aria-label="Appearance preference"
              >
                <ToggleGroupItem
                  value="light"
                  aria-label="Light"
                  className="h-8 px-3 text-xs gap-1.5 border border-border bg-card text-foreground data-[state=on]:bg-cyan-600 data-[state=on]:text-white data-[state=on]:border-cyan-600"
                >
                  <Sun className="h-3.5 w-3.5" />Light
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="dark"
                  aria-label="Dark"
                  className="h-8 px-3 text-xs gap-1.5 border border-border bg-card text-foreground data-[state=on]:bg-cyan-600 data-[state=on]:text-white data-[state=on]:border-cyan-600"
                >
                  <Moon className="h-3.5 w-3.5" />Dark
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="system"
                  aria-label="System"
                  className="h-8 px-3 text-xs gap-1.5 border border-border bg-card text-foreground data-[state=on]:bg-cyan-600 data-[state=on]:text-white data-[state=on]:border-cyan-600"
                >
                  <Monitor className="h-3.5 w-3.5" />System
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                {preference === 'system'
                  ? 'Use your device appearance — VoiceForce switches automatically if your device changes.'
                  : `VoiceForce always displays in ${preference} mode on this device.`}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="general" className="mt-3">
            <div className="rounded-md border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-name" className="text-xs text-muted-foreground">Company Name</Label>
                <Input id="company-name" defaultValue="TARDIS AI Corporation" className="h-8 text-xs border-border bg-card text-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time-zone" className="text-xs text-muted-foreground">Time Zone</Label>
                <select className="w-full h-8 border border-border bg-card text-foreground rounded-md px-2 text-xs">
                  <option>UTC-05:00 (Eastern Time)</option>
                  <option>UTC-08:00 (Pacific Time)</option>
                  <option>UTC+00:00 (GMT)</option>
                </select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-3">
            <div className="rounded-md border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="email-notifications" className="text-xs text-foreground">Email Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive email alerts for escalations and system events</p>
                </div>
                <Switch id="email-notifications" checked={notifications} onCheckedChange={setNotifications} />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div>
                  <Label htmlFor="auto-escalation" className="text-xs text-foreground">Auto Escalation Alerts</Label>
                  <p className="text-xs text-muted-foreground">Automatically notify supervisors when calls are escalated</p>
                </div>
                <Switch id="auto-escalation" checked={autoEscalation} onCheckedChange={setAutoEscalation} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="mt-3">
            <div className="rounded-md border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="session-timeout" className="text-xs text-muted-foreground">Session Timeout (minutes)</Label>
                <Input id="session-timeout" type="number" defaultValue="30" className="h-8 text-xs border-border bg-card text-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data-retention" className="text-xs text-muted-foreground">Data Retention Period (days)</Label>
                <Input
                  id="data-retention"
                  type="number"
                  value={dataRetention}
                  onChange={(e) => setDataRetention(e.target.value)}
                  className="h-8 text-xs border-border bg-card text-foreground"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-3">
            <div className="rounded-md border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="escalation-threshold" className="text-xs text-muted-foreground">Escalation Threshold (%)</Label>
                <Input id="escalation-threshold" type="number" defaultValue="85" className="h-8 text-xs border-border bg-card text-foreground" />
                <p className="text-[11px] text-muted-foreground">Confidence threshold for automatic escalation</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-call-duration" className="text-xs text-muted-foreground">Max Call Duration (minutes)</Label>
                <Input id="max-call-duration" type="number" defaultValue="15" className="h-8 text-xs border-border bg-card text-foreground" />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Settings;
