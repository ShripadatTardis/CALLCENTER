
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { NPSScript } from '@/types/auth';
import { 
  Plus, 
  Phone, 
  MessageSquare, 
  MessageCircle, 
  Mail,
  Upload,
  Calendar,
  Settings,
  Eye,
  CheckCircle,
  FileText,
  Play
} from 'lucide-react';

interface CreateNPSCampaignDialogProps {
  children: React.ReactNode;
  npsScripts: NPSScript[];
}

export const CreateNPSCampaignDialog: React.FC<CreateNPSCampaignDialogProps> = ({
  children,
  npsScripts
}) => {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    channel: 'voice',
    scriptId: '',
    targetLanguage: 'English',
    triggerType: 'manual',
    scheduledTime: '',
    maxAttempts: 3,
    csvFile: null as File | null
  });

  const totalSteps = 6;
  const progress = (currentStep / totalSteps) * 100;

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'voice': return <Phone className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      case 'sms': return <MessageCircle className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      default: return <Phone className="h-4 w-4" />;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Basic Information';
      case 2: return 'Script Selection';
      case 3: return 'Target Audience';
      case 4: return 'AI Configuration';
      case 5: return 'Scheduling & Settings';
      case 6: return 'Review & Launch';
      default: return 'Campaign Setup';
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps) setCurrentStep(currentStep + 1);
  };

  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = () => {
    console.log('Creating NPS Campaign:', formData);
    setOpen(false);
    setCurrentStep(1);
    // Reset form
    setFormData({
      name: '',
      description: '',
      channel: 'voice',
      scriptId: '',
      targetLanguage: 'English',
      triggerType: 'manual',
      scheduledTime: '',
      maxAttempts: 3,
      csvFile: null
    });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter campaign name"
                />
              </div>
              <div>
                <Label htmlFor="targetLanguage">Target Language</Label>
                <select
                  id="targetLanguage"
                  value={formData.targetLanguage}
                  onChange={(e) => setFormData({ ...formData, targetLanguage: e.target.value })}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm"
                >
                  <option value="English">English</option>
                  <option value="Swahili">Swahili</option>
                  <option value="French">French</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="description">Campaign Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the purpose and goals of this NPS campaign"
                rows={3}
              />
            </div>
            <div>
              <Label>Target Channel</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {['voice', 'whatsapp', 'sms', 'email'].map((channel) => (
                  <div
                    key={channel}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.channel === channel
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setFormData({ ...formData, channel })}
                  >
                    <div className="flex items-center space-x-2">
                      {getChannelIcon(channel)}
                      <span className="capitalize font-medium">{channel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 2:
        const filteredScripts = npsScripts.filter(script => script.type === formData.channel);
        return (
          <div className="space-y-4">
            <div>
              <Label>Select NPS Script Template</Label>
              <div className="mt-2 space-y-3">
                {filteredScripts.map((script) => (
                  <div
                    key={script.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.scriptId === script.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setFormData({ ...formData, scriptId: script.id })}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{script.name}</h4>
                      <Badge variant="outline" className="capitalize">{script.type}</Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{script.content}</p>
                    <div className="flex gap-1">
                      {script.placeholders.map((placeholder) => (
                        <Badge key={placeholder} variant="outline" className="text-xs">
                          {`{{${placeholder}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Upload className="h-5 w-5" />
                  <span>Upload Customer List</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <div className="text-lg font-medium mb-2">Upload CSV or Excel File</div>
                  <div className="text-sm text-muted-foreground mb-4">
                    Required columns: Name, Mobile Number, Account ID, Language
                  </div>
                  <Button variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Choose File
                  </Button>
                </div>
                {formData.csvFile && (
                  <div className="mt-4 text-sm text-green-600 text-center">
                    ✓ File uploaded: {formData.csvFile.name}
                  </div>
                )}
                <div className="mt-4 text-sm text-muted-foreground">
                  <strong>File Format:</strong> CSV or Excel (.xlsx)<br/>
                  <strong>Max Size:</strong> 10MB<br/>
                  <strong>Sample Format:</strong> Name, Mobile Number, Language, Account ID
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>AI Agent Configuration</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Conversation AI Settings</Label>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>NPS Question Delivery</span>
                      <Badge variant="outline">Enabled</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Score Collection (0-10)</span>
                      <Badge variant="outline">Auto-detect</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Follow-up Questions</span>
                      <Badge variant="outline">Optional</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Multi-language Support</span>
                      <Badge variant="outline">{formData.targetLanguage}</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Campaign Trigger</Label>
                <select
                  value={formData.triggerType}
                  onChange={(e) => setFormData({ ...formData, triggerType: e.target.value })}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm"
                >
                  <option value="manual">Manual Launch</option>
                  <option value="scheduled">Scheduled Launch</option>
                </select>
              </div>
              {formData.triggerType === 'scheduled' && (
                <div>
                  <Label htmlFor="scheduledTime">Scheduled Date & Time</Label>
                  <Input
                    id="scheduledTime"
                    type="datetime-local"
                    value={formData.scheduledTime}
                    onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                  />
                </div>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Retry Logic</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="maxAttempts">Maximum Retry Attempts</Label>
                  <select
                    id="maxAttempts"
                    value={formData.maxAttempts}
                    onChange={(e) => setFormData({ ...formData, maxAttempts: parseInt(e.target.value) })}
                    className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                  >
                    <option value={1}>1 attempt</option>
                    <option value={2}>2 attempts</option>
                    <option value={3}>3 attempts</option>
                    <option value={5}>5 attempts</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 6:
        const selectedScript = npsScripts.find(s => s.id === formData.scriptId);
        return (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold">Campaign Summary</h3>
            </div>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Name:</span> {formData.name || 'Not specified'}
                  </div>
                  <div>
                    <span className="font-medium">Channel:</span> 
                    <div className="flex items-center space-x-1 inline-flex ml-2">
                      {getChannelIcon(formData.channel)}
                      <span className="capitalize">{formData.channel}</span>
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Language:</span> {formData.targetLanguage}
                  </div>
                  <div>
                    <span className="font-medium">Trigger:</span> {formData.triggerType}
                  </div>
                  <div>
                    <span className="font-medium">Max Attempts:</span> {formData.maxAttempts}
                  </div>
                  {selectedScript && (
                    <div>
                      <span className="font-medium">Script:</span> {selectedScript.name}
                    </div>
                  )}
                </div>
                <div>
                  <span className="font-medium">Description:</span> {formData.description || 'Not provided'}
                </div>
                {formData.csvFile && (
                  <div>
                    <span className="font-medium">CSV File:</span> {formData.csvFile.name}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create NPS Campaign</DialogTitle>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>Step {currentStep} of {totalSteps}: {getStepTitle()}</span>
              <span>{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {renderStepContent()}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
          >
            Previous
          </Button>
          <div className="space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {currentStep < totalSteps ? (
              <Button onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
                <Play className="h-4 w-4 mr-2" />
                Create Campaign
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
