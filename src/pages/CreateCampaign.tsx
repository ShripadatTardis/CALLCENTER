import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, FileText, Calendar, Settings, Users, Play, ChevronRight,
  DollarSign, AlertCircle, TrendingUp, Phone,
  CreditCard, ArrowUpCircle, Zap, Wifi,
  Plane, CheckCircle, Award, Luggage,
  Hotel, Clock, Star, MessageSquare,
  Stethoscope, Shield, Heart,
  Wrench, Car, ShieldAlert,
  Banknote, FileCheck, RefreshCw, Gift
} from 'lucide-react';
import { useIndustry } from '@/contexts/IndustryContext';
import { getIndustryCampaignTypes, generateIndustrySpecificScripts, generateIndustrySpecificSalesforceCampaigns } from '@/utils/industryDataGenerator';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';

const CreateCampaign: React.FC = () => {
  const navigate = useNavigate();
  const { selectedIndustry, industryConfig } = useIndustry();
  const [currentStep, setCurrentStep] = useState(1);
  const [targetAudienceSource, setTargetAudienceSource] = useState<'csv' | 'salesforce'>('csv');
  const [selectedSalesforceCampaign, setSelectedSalesforceCampaign] = useState('');
  const [callWindowError, setCallWindowError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    campaignType: '',
    description: '',
    targetLanguage: 'english',
    scriptId: '',
    retryEnabled: true,
    maxAttempts: 2,
    triggerType: 'scheduled',
    scheduledTime: '',
    channel: 'voice',
    pullInterval: 5,
    callWindowStart: '09:00',
    callWindowEnd: '20:00',
    // Retry Policy
    retryPolicyMode: 'default',
    maxAttemptsPerLead: 5,
    minGapBetweenAttempts: 120,
    retryWindowDays: 3,
    timeOfDayRotation: true,
    sameDaySecondAttempt: true,
    // Callback Handling
    enableCallbacks: true,
    minCallbackDelay: 15,
    maxCallbackWindowDays: 7,
    respectLeadTimezone: true,
    autoRetryMissedCallback: true,
    missedCallbackRetryGap: 60,
    // Lead Recycling
    enableRecycling: true,
    recycleDelayDays: 14,
    tagUnreachableLeads: true
  });

  const totalSteps = 6;
  const progress = (currentStep / totalSteps) * 100;

  // Get industry-specific campaign types, scripts, and Salesforce campaigns
  const campaignTypes = getIndustryCampaignTypes(selectedIndustry);
  const industryScripts = generateIndustrySpecificScripts(selectedIndustry);
  const salesforceCampaigns = generateIndustrySpecificSalesforceCampaigns(selectedIndustry);

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Basic Information';
      case 2: return 'Campaign Type & Script';
      case 3: return 'Target Audience';
      case 4: return 'Scheduling & Settings';
      case 5: return 'Retry & Callback Policy';
      case 6: return 'Review & Launch';
      default: return 'Campaign Setup';
    }
  };

  // Reset target audience source when campaign type changes
  useEffect(() => {
    if (formData.campaignType !== 'lead_followup' && targetAudienceSource === 'salesforce') {
      setTargetAudienceSource('csv');
      setSelectedSalesforceCampaign('');
    }
  }, [formData.campaignType, targetAudienceSource]);

  const selectedScript = industryScripts.find(script => script.id === formData.scriptId);

  const getCampaignTypeIcon = (campaignTypeValue: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      // Banking
      'loan_emi_reminder': <DollarSign className="h-5 w-5" />,
      'overdue_loan_followup': <AlertCircle className="h-5 w-5" />,
      'document_reminder': <FileText className="h-5 w-5" />,
      'cross_sell': <TrendingUp className="h-5 w-5" />,
      // Telecom
      'bill_payment_reminder': <CreditCard className="h-5 w-5" />,
      'plan_upgrade': <ArrowUpCircle className="h-5 w-5" />,
      'service_activation': <Zap className="h-5 w-5" />,
      'network_update': <Wifi className="h-5 w-5" />,
      // Airlines
      'flight_reminder': <Plane className="h-5 w-5" />,
      'booking_confirmation': <CheckCircle className="h-5 w-5" />,
      'loyalty_program': <Award className="h-5 w-5" />,
      'checkin_notification': <Luggage className="h-5 w-5" />,
      // Hotels
      'reservation_confirmation': <Hotel className="h-5 w-5" />,
      'checkin_reminder': <Clock className="h-5 w-5" />,
      'feedback_collection': <MessageSquare className="h-5 w-5" />,
      // Hospitals
      'appointment_reminder': <Calendar className="h-5 w-5" />,
      'health_checkup': <Stethoscope className="h-5 w-5" />,
      'insurance_verification': <Shield className="h-5 w-5" />,
      'followup_care': <Heart className="h-5 w-5" />,
      // Automotive
      'service_reminder': <Wrench className="h-5 w-5" />,
      'lead_followup': <Users className="h-5 w-5" />,
      'test_drive': <Car className="h-5 w-5" />,
      'warranty_alert': <ShieldAlert className="h-5 w-5" />,
      // Insurance
      'premium_reminder': <Banknote className="h-5 w-5" />,
      'claim_update': <FileCheck className="h-5 w-5" />,
      'policy_renewal': <RefreshCw className="h-5 w-5" />,
      'new_policy_offer': <Gift className="h-5 w-5" />,
      // Default for all welcome calls
      'welcome_call': <Phone className="h-5 w-5" />
    };
    
    return iconMap[campaignTypeValue] || <Phone className="h-5 w-5" />;
  };

  const validateCallWindow = () => {
    const start = formData.callWindowStart.split(':').map(Number);
    const end = formData.callWindowEnd.split(':').map(Number);
    
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    
    if (endMinutes <= startMinutes) {
      setCallWindowError('Call window end time must be later than start time.');
      return false;
    }
    
    setCallWindowError('');
    return true;
  };

  const handleNext = () => {
    if (currentStep === 4) {
      if (!validateCallWindow()) {
        return;
      }
    }
    
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    // Mock campaign creation
    console.log('Creating campaign:', formData);
    console.log('Target Source:', targetAudienceSource);
    console.log('Salesforce Campaign:', selectedSalesforceCampaign);
    navigate('/outbound-campaigns');
  };

  return (
    <Layout>
      <div className="p-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => navigate('/outbound-campaigns')} className="cursor-pointer">
                Outbound Campaigns
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Create New Outbound Calling Campaign</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Page Title and Progress */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Create New Outbound Calling Campaign</h1>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>Step {currentStep} of {totalSteps}: {getStepTitle()}</span>
              <span>{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        </div>

        {/* Form Content */}
        <div className="space-y-6 max-w-4xl">
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="campaignName">Campaign Name</Label>
                <Input
                  id="campaignName"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter campaign name"
                />
              </div>
              <div>
                <Label htmlFor="description">Campaign Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this campaign"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 2: Campaign Type & Script */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Select Campaign Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {campaignTypes.map((type) => (
                      <div
                        key={type.value}
                        onClick={() => setFormData({ ...formData, campaignType: type.value })}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          formData.campaignType === type.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            {getCampaignTypeIcon(type.value)}
                          </div>
                          <div className="font-medium">{type.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {formData.campaignType && (
                <Card>
                  <CardHeader>
                    <CardTitle>Select Script</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {industryScripts
                        .filter((script) => script.campaignType === formData.campaignType)
                        .map((script) => (
                          <div
                            key={script.id}
                            onClick={() => setFormData({ ...formData, scriptId: script.id })}
                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                              formData.scriptId === script.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <div className="font-medium">{script.name}</div>
                            <div className="text-sm text-muted-foreground mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap border-l-2 border-primary/20 pl-3">
                              {script.content}
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Target Audience */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Target Audience</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Select Target Audience Source</Label>
                  <div className="flex space-x-4 mt-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="csv"
                        checked={targetAudienceSource === 'csv'}
                        onChange={() => setTargetAudienceSource('csv')}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="csv" className="font-normal cursor-pointer">Upload CSV/Excel File</Label>
                    </div>
                    {formData.campaignType === 'lead_followup' && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="salesforce"
                          checked={targetAudienceSource === 'salesforce'}
                          onChange={() => setTargetAudienceSource('salesforce')}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="salesforce" className="font-normal cursor-pointer">Connect to Salesforce</Label>
                      </div>
                    )}
                  </div>
                </div>

                {targetAudienceSource === 'csv' ? (
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Drop your CSV/Excel file here</div>
                      <div className="text-xs text-muted-foreground">or click to browse</div>
                    </div>
                    <Button variant="outline" size="sm" className="mt-4">
                      <FileText className="h-4 w-4 mr-2" />
                      Choose File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Select Salesforce Campaign</Label>
                    <select
                      value={selectedSalesforceCampaign}
                      onChange={(e) => setSelectedSalesforceCampaign(e.target.value)}
                      className="w-full border border-input rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Choose a Salesforce campaign</option>
                      {salesforceCampaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name} ({campaign.leads} leads)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Scheduling & Settings */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5" />
                    <span>Campaign Trigger</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="triggerType">Trigger Type</Label>
                    <select
                      id="triggerType"
                      value={formData.triggerType}
                      onChange={(e) => setFormData({ ...formData, triggerType: e.target.value })}
                      className="w-full border border-input rounded-md px-3 py-2 text-sm"
                    >
                      <option value="immediate">Start Immediately</option>
                      <option value="scheduled">Scheduled (One-time)</option>
                      <option value="scheduled_interval">Scheduled with Intervals</option>
                    </select>
                  </div>

                  {(formData.triggerType === 'scheduled' || formData.triggerType === 'scheduled_interval') && (
                    <div>
                      <Label htmlFor="scheduledTime">
                        {formData.triggerType === 'scheduled_interval' ? 'Start Date & Time' : 'Scheduled Time'}
                      </Label>
                      <Input
                        id="scheduledTime"
                        type="datetime-local"
                        value={formData.scheduledTime}
                        onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                      />
                      {formData.triggerType === 'scheduled_interval' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          The first lead pull will begin at this date and time
                        </p>
                      )}
                    </div>
                  )}

                  {formData.triggerType === 'scheduled_interval' && (
                    <div>
                      <Label htmlFor="pullInterval">Pull New Leads Every (minutes)</Label>
                      <Input
                        id="pullInterval"
                        type="number"
                        min="1"
                        max="1440"
                        value={formData.pullInterval}
                        onChange={(e) => setFormData({ ...formData, pullInterval: parseInt(e.target.value) || 5 })}
                        placeholder="e.g., 5, 10, 30"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        System will automatically pull new leads from the source every {formData.pullInterval} minutes
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Daily Call Window</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="callWindowStart">Start Time</Label>
                      <Input
                        id="callWindowStart"
                        type="time"
                        value={formData.callWindowStart}
                        onChange={(e) => setFormData({ ...formData, callWindowStart: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="callWindowEnd">End Time</Label>
                      <Input
                        id="callWindowEnd"
                        type="time"
                        value={formData.callWindowEnd}
                        onChange={(e) => setFormData({ ...formData, callWindowEnd: e.target.value })}
                      />
                    </div>
                  </div>
                  {callWindowError && (
                    <p className="text-sm text-destructive">{callWindowError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Calls will only be placed during this time window each day
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 5: Retry & Callback Policy */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Retry Policy</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Defines how many times and how often to re-attempt a lead when there is no contact (No Answer, Busy, Voicemail)
                  </p>
                  
                  <div>
                    <Label>Choose a retry policy</Label>
                    <div className="space-y-3 mt-2">
                      <div className="flex items-start space-x-2">
                        <input
                          type="radio"
                          id="defaultPolicy"
                          checked={formData.retryPolicyMode === 'default'}
                          onChange={() => setFormData({ ...formData, retryPolicyMode: 'default' })}
                          className="h-4 w-4 mt-1"
                        />
                        <div className="flex-1">
                          <Label htmlFor="defaultPolicy" className="font-medium cursor-pointer">
                            Use default Lead Qualification policy (recommended)
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Balanced strategy: up to 5 attempts over 3 days with time-of-day variation
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-2">
                        <input
                          type="radio"
                          id="customPolicy"
                          checked={formData.retryPolicyMode === 'custom'}
                          onChange={() => setFormData({ ...formData, retryPolicyMode: 'custom' })}
                          className="h-4 w-4 mt-1"
                        />
                        <div className="flex-1">
                          <Label htmlFor="customPolicy" className="font-medium cursor-pointer">
                            Custom retry settings
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {formData.retryPolicyMode === 'default' && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="font-medium text-blue-900 mb-2">Default Lead Qualification – Balanced</div>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Max attempts: 5</li>
                        <li>• Minimum gap between attempts: 2 hours</li>
                        <li>• Attempt window: 3 days from first attempt</li>
                        <li>• Time-of-day rotation: Morning / Afternoon / Evening</li>
                        <li>• Same-day reattempt after No Answer: Yes (after 10–15 minutes)</li>
                      </ul>
                    </div>
                  )}
                  
                  {formData.retryPolicyMode === 'custom' && (
                    <div className="space-y-4 p-4 bg-muted rounded-lg border">
                      <div>
                        <Label htmlFor="maxAttemptsPerLead">Maximum call attempts per lead</Label>
                        <Input
                          id="maxAttemptsPerLead"
                          type="number"
                          min="1"
                          max="8"
                          value={formData.maxAttemptsPerLead}
                          onChange={(e) => setFormData({ ...formData, maxAttemptsPerLead: parseInt(e.target.value) || 5 })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Includes the first call + all retries
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="minGapBetweenAttempts">Minimum gap between attempts (minutes)</Label>
                        <Input
                          id="minGapBetweenAttempts"
                          type="number"
                          min="30"
                          max="1440"
                          value={formData.minGapBetweenAttempts}
                          onChange={(e) => setFormData({ ...formData, minGapBetweenAttempts: parseInt(e.target.value) || 120 })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          VoiceForce will not attempt the same lead again before this gap
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="retryWindowDays">Retry window (days)</Label>
                        <Input
                          id="retryWindowDays"
                          type="number"
                          min="1"
                          max="14"
                          value={formData.retryWindowDays}
                          onChange={(e) => setFormData({ ...formData, retryWindowDays: parseInt(e.target.value) || 3 })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          After this many days from the first attempt, VoiceForce will stop retrying and move the lead to recycling
                        </p>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="timeOfDayRotation"
                          checked={formData.timeOfDayRotation}
                          onChange={(e) => setFormData({ ...formData, timeOfDayRotation: e.target.checked })}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <Label htmlFor="timeOfDayRotation" className="font-normal cursor-pointer">
                            Rotate call times across the day
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            If checked, attempts are distributed between morning, afternoon and evening (within your allowed call window)
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="sameDaySecondAttempt"
                          checked={formData.sameDaySecondAttempt}
                          onChange={(e) => setFormData({ ...formData, sameDaySecondAttempt: e.target.checked })}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <Label htmlFor="sameDaySecondAttempt" className="font-normal cursor-pointer">
                            Attempt a second call on the same day after no answer
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            If the customer doesn't pick up, VoiceForce will try again after 10–15 minutes, as long as the call window allows
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5" />
                    <span>Callback Handling</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Controls what happens when the customer explicitly asks to be called later
                  </p>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <Label htmlFor="enableCallbacks" className="font-medium cursor-pointer">
                        Allow customers to schedule callbacks
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        If a customer says 'call me later', VoiceForce will schedule a callback and honour it
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      id="enableCallbacks"
                      checked={formData.enableCallbacks}
                      onChange={(e) => setFormData({ ...formData, enableCallbacks: e.target.checked })}
                      className="h-5 w-5"
                    />
                  </div>
                  
                  {formData.enableCallbacks && (
                    <div className="space-y-4 p-4 border rounded-lg">
                      <div className="font-medium">Callback Scheduling Rules</div>
                      
                      <div>
                        <Label htmlFor="minCallbackDelay">Minimum delay before a callback (minutes)</Label>
                        <Input
                          id="minCallbackDelay"
                          type="number"
                          min="5"
                          max="1440"
                          value={formData.minCallbackDelay}
                          onChange={(e) => setFormData({ ...formData, minCallbackDelay: parseInt(e.target.value) || 15 })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Callbacks will be scheduled at least this many minutes in the future, respecting the customer's requested time
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="maxCallbackWindowDays">Maximum days in the future for callbacks</Label>
                        <Input
                          id="maxCallbackWindowDays"
                          type="number"
                          min="1"
                          max="30"
                          value={formData.maxCallbackWindowDays}
                          onChange={(e) => setFormData({ ...formData, maxCallbackWindowDays: parseInt(e.target.value) || 7 })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          If a customer asks for a date beyond this window, VoiceForce will propose the nearest available date
                        </p>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="respectLeadTimezone"
                          checked={formData.respectLeadTimezone}
                          onChange={(e) => setFormData({ ...formData, respectLeadTimezone: e.target.checked })}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <Label htmlFor="respectLeadTimezone" className="font-normal cursor-pointer">
                            Respect lead's timezone when scheduling callbacks
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            If a timezone is available, callbacks use the lead's timezone; otherwise, the campaign timezone
                          </p>
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t">
                        <div className="font-medium mb-3">Missed Callback Behaviour</div>
                        
                        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex-1">
                            <Label htmlFor="autoRetryMissedCallback" className="font-medium cursor-pointer">
                              If a scheduled callback is missed (no answer), retry
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              If the customer doesn't answer at the callback time, VoiceForce will retry once more later in the day
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            id="autoRetryMissedCallback"
                            checked={formData.autoRetryMissedCallback}
                            onChange={(e) => setFormData({ ...formData, autoRetryMissedCallback: e.target.checked })}
                            className="h-5 w-5"
                          />
                        </div>
                        
                        {formData.autoRetryMissedCallback && (
                          <div className="mt-3">
                            <Label htmlFor="missedCallbackRetryGap">Gap before retrying a missed callback (minutes)</Label>
                            <Input
                              id="missedCallbackRetryGap"
                              type="number"
                              min="30"
                              max="1440"
                              value={formData.missedCallbackRetryGap}
                              onChange={(e) => setFormData({ ...formData, missedCallbackRetryGap: parseInt(e.target.value) || 60 })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              How long after the missed callback to try again, within the call window
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="h-5 w-5" />
                    <span>Recycling No-Contact Leads</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Defines what happens once retry attempts are exhausted
                  </p>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <Label htmlFor="enableRecycling" className="font-medium cursor-pointer">
                        Move unreachable leads to recycle pool
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        After max attempts are exhausted, leads are paused and can be reactivated later
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      id="enableRecycling"
                      checked={formData.enableRecycling}
                      onChange={(e) => setFormData({ ...formData, enableRecycling: e.target.checked })}
                      className="h-5 w-5"
                    />
                  </div>
                  
                  {formData.enableRecycling && (
                    <div className="space-y-4 p-4 border rounded-lg">
                      <div>
                        <Label htmlFor="recycleDelayDays">Recycle delay (days)</Label>
                        <Input
                          id="recycleDelayDays"
                          type="number"
                          min="1"
                          max="90"
                          value={formData.recycleDelayDays}
                          onChange={(e) => setFormData({ ...formData, recycleDelayDays: parseInt(e.target.value) || 14 })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          After this many days, these leads can be targeted again in a future campaign or recycle run
                        </p>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="tagUnreachableLeads"
                          checked={formData.tagUnreachableLeads}
                          onChange={(e) => setFormData({ ...formData, tagUnreachableLeads: e.target.checked })}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <Label htmlFor="tagUnreachableLeads" className="font-normal cursor-pointer">
                            Tag unreachable leads
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Adds a 'unreachable' tag to leads exhausted by this campaign
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 6: Review & Launch */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium">Name:</span> {formData.name || 'Not specified'}
                    </div>
                    <div>
                      <span className="font-medium">Type:</span> {
                        campaignTypes.find(t => t.value === formData.campaignType)?.label || 'Not selected'
                      }
                    </div>
                    <div>
                      <span className="font-medium">Language:</span> {formData.targetLanguage}
                    </div>
                    <div>
                      <span className="font-medium">Trigger:</span> {
                        formData.triggerType === 'scheduled_interval' ? 'Scheduled with Intervals' : 
                        formData.triggerType === 'scheduled' ? 'Scheduled' : 'Manual'
                      }
                    </div>
                    <div>
                      <span className="font-medium">Target Source:</span> {
                        targetAudienceSource === 'csv' ? 'CSV Upload' : 'Salesforce'
                      }
                    </div>
                    {targetAudienceSource === 'salesforce' && selectedSalesforceCampaign && (
                      <div>
                        <span className="font-medium">Salesforce Campaign:</span> {
                          salesforceCampaigns.find(c => c.id === selectedSalesforceCampaign)?.name || 'Not selected'
                        }
                      </div>
                    )}
                    {formData.triggerType === 'scheduled_interval' && (
                      <div>
                        <span className="font-medium">Pull Interval:</span> Every {formData.pullInterval} minutes
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="font-medium">Call Window:</span> {formData.callWindowStart} - {formData.callWindowEnd}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Description:</span> {formData.description || 'Not provided'}
                  </div>
                  {selectedScript && (
                    <div>
                      <span className="font-medium">Script:</span> {selectedScript.name}
                    </div>
                  )}
                  
                  <div className="border-t pt-3 mt-3">
                    <div className="font-medium mb-2">Retry & Callback Policy</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Retry Policy:</span>{' '}
                        {formData.retryPolicyMode === 'default' ? 'Default (Balanced)' : 'Custom'}
                      </div>
                      {formData.retryPolicyMode === 'custom' && (
                        <>
                          <div>
                            <span className="text-muted-foreground">Max Attempts:</span> {formData.maxAttemptsPerLead}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Min Gap:</span> {formData.minGapBetweenAttempts} min
                          </div>
                          <div>
                            <span className="text-muted-foreground">Retry Window:</span> {formData.retryWindowDays} days
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-muted-foreground">Callbacks:</span>{' '}
                        {formData.enableCallbacks ? 'Enabled' : 'Disabled'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Lead Recycling:</span>{' '}
                        {formData.enableRecycling ? `Enabled (${formData.recycleDelayDays} days)` : 'Disabled'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
            >
              Previous
            </Button>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={() => navigate('/outbound-campaigns')}>
                Cancel
              </Button>
              {currentStep < totalSteps ? (
                <Button onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button onClick={handleSubmit}>
                  <Play className="h-4 w-4 mr-2" />
                  Launch Campaign
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CreateCampaign;
