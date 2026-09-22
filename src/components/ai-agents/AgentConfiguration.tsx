
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Save, Plus, Trash2, Settings, Brain, MessageSquare } from 'lucide-react';

interface IntentConfig {
  id: string;
  name: string;
  examples: string[];
  confidence_threshold: number;
  responses: string[];
}

interface EscalationRule {
  id: string;
  trigger: string;
  condition: string;
  action: string;
  enabled: boolean;
}

interface AgentConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
}

export const AgentConfiguration: React.FC<AgentConfigurationProps> = ({
  isOpen,
  onClose,
  agentId,
  agentName
}) => {
  const [intents, setIntents] = useState<IntentConfig[]>([
    {
      id: 'billing',
      name: 'Billing Inquiry',
      examples: ['I have a question about my bill', 'Why was I charged?', 'Payment issue'],
      confidence_threshold: 80,
      responses: ['I can help you with your billing inquiry. Let me check your account.']
    },
    {
      id: 'loan_status',
      name: 'Loan Status',
      examples: ['What is my loan status?', 'Has my loan been approved?', 'Loan application'],
      confidence_threshold: 85,
      responses: ['Let me check the current status of your loan application.']
    }
  ]);

  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([
    {
      id: 'low_confidence',
      trigger: 'Low Confidence',
      condition: 'Intent confidence < 60%',
      action: 'Escalate to human agent',
      enabled: true
    },
    {
      id: 'negative_sentiment',
      trigger: 'Negative Sentiment',
      condition: 'Sentiment score < 30%',
      action: 'Transfer to supervisor',
      enabled: true
    },
    {
      id: 'complex_issue',
      trigger: 'Complex Issue',
      condition: 'Multiple failed resolution attempts',
      action: 'Schedule callback with specialist',
      enabled: false
    }
  ]);

  const [generalConfig, setGeneralConfig] = useState({
    max_conversation_turns: 10,
    response_timeout: 30,
    enable_small_talk: true,
    enable_proactive_suggestions: true,
    personality: 'professional',
    language_model: 'advanced',
    enable_sentiment_monitoring: true
  });

  const addIntent = () => {
    const newIntent: IntentConfig = {
      id: `intent_${Date.now()}`,
      name: 'New Intent',
      examples: [],
      confidence_threshold: 75,
      responses: []
    };
    setIntents([...intents, newIntent]);
  };

  const updateIntent = (id: string, field: keyof IntentConfig, value: any) => {
    setIntents(prev => prev.map(intent => 
      intent.id === id ? { ...intent, [field]: value } : intent
    ));
  };

  const deleteIntent = (id: string) => {
    setIntents(prev => prev.filter(intent => intent.id !== id));
  };

  const addExample = (intentId: string) => {
    updateIntent(intentId, 'examples', [...intents.find(i => i.id === intentId)?.examples || [], '']);
  };

  const updateExample = (intentId: string, index: number, value: string) => {
    const intent = intents.find(i => i.id === intentId);
    if (intent) {
      const newExamples = [...intent.examples];
      newExamples[index] = value;
      updateIntent(intentId, 'examples', newExamples);
    }
  };

  const deleteExample = (intentId: string, index: number) => {
    const intent = intents.find(i => i.id === intentId);
    if (intent) {
      const newExamples = intent.examples.filter((_, i) => i !== index);
      updateIntent(intentId, 'examples', newExamples);
    }
  };

  const toggleEscalationRule = (id: string) => {
    setEscalationRules(prev => prev.map(rule => 
      rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configure {agentName}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="intents" className="h-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="intents" className="flex items-center space-x-1">
              <Brain className="h-4 w-4" />
              <span>Intents</span>
            </TabsTrigger>
            <TabsTrigger value="responses" className="flex items-center space-x-1">
              <MessageSquare className="h-4 w-4" />
              <span>Responses</span>
            </TabsTrigger>
            <TabsTrigger value="escalation">Escalation</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <div className="mt-6 h-[60vh] overflow-auto">
            <TabsContent value="intents" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Intent Configuration</h3>
                <Button onClick={addIntent} className="flex items-center space-x-1">
                  <Plus className="h-4 w-4" />
                  <span>Add Intent</span>
                </Button>
              </div>

              {intents.map(intent => (
                <Card key={intent.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Input
                        value={intent.name}
                        onChange={(e) => updateIntent(intent.id, 'name', e.target.value)}
                        className="text-lg font-semibold bg-transparent border-none p-0 h-auto"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteIntent(intent.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Confidence Threshold: {intent.confidence_threshold}%
                      </label>
                      <Slider
                        value={[intent.confidence_threshold]}
                        onValueChange={([value]) => updateIntent(intent.id, 'confidence_threshold', value)}
                        max={100}
                        min={0}
                        step={5}
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium">Training Examples</label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addExample(intent.id)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Example
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {intent.examples.map((example, index) => (
                          <div key={index} className="flex space-x-2">
                            <Input
                              value={example}
                              onChange={(e) => updateExample(intent.id, index, e.target.value)}
                              placeholder="Enter training example..."
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteExample(intent.id, index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="responses" className="space-y-4">
              <h3 className="text-lg font-semibold">Response Templates</h3>
              {intents.map(intent => (
                <Card key={intent.id}>
                  <CardHeader>
                    <CardTitle>{intent.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {intent.responses.map((response, index) => (
                        <Textarea
                          key={index}
                          value={response}
                          onChange={(e) => {
                            const newResponses = [...intent.responses];
                            newResponses[index] = e.target.value;
                            updateIntent(intent.id, 'responses', newResponses);
                          }}
                          placeholder="Enter response template..."
                          rows={2}
                        />
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newResponses = [...intent.responses, ''];
                          updateIntent(intent.id, 'responses', newResponses);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Response
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="escalation" className="space-y-4">
              <h3 className="text-lg font-semibold">Escalation Rules</h3>
              {escalationRules.map(rule => (
                <Card key={rule.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <Badge variant={rule.enabled ? "default" : "secondary"}>
                            {rule.trigger}
                          </Badge>
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => toggleEscalationRule(rule.id)}
                          />
                        </div>
                        <div className="text-sm text-slate-600 mb-1">
                          <strong>Condition:</strong> {rule.condition}
                        </div>
                        <div className="text-sm text-slate-600">
                          <strong>Action:</strong> {rule.action}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="general" className="space-y-4">
              <h3 className="text-lg font-semibold">General Configuration</h3>
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Max Conversation Turns: {generalConfig.max_conversation_turns}
                    </label>
                    <Slider
                      value={[generalConfig.max_conversation_turns]}
                      onValueChange={([value]) => setGeneralConfig(prev => ({ ...prev, max_conversation_turns: value }))}
                      max={20}
                      min={1}
                      step={1}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Response Timeout: {generalConfig.response_timeout}s
                    </label>
                    <Slider
                      value={[generalConfig.response_timeout]}
                      onValueChange={([value]) => setGeneralConfig(prev => ({ ...prev, response_timeout: value }))}
                      max={60}
                      min={5}
                      step={5}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Enable Small Talk</label>
                      <Switch
                        checked={generalConfig.enable_small_talk}
                        onCheckedChange={(checked) => setGeneralConfig(prev => ({ ...prev, enable_small_talk: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Proactive Suggestions</label>
                      <Switch
                        checked={generalConfig.enable_proactive_suggestions}
                        onCheckedChange={(checked) => setGeneralConfig(prev => ({ ...prev, enable_proactive_suggestions: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Sentiment Monitoring</label>
                      <Switch
                        checked={generalConfig.enable_sentiment_monitoring}
                        onCheckedChange={(checked) => setGeneralConfig(prev => ({ ...prev, enable_sentiment_monitoring: checked }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <div className="flex justify-end space-x-2 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex items-center space-x-2">
              <Save className="h-4 w-4" />
              <span>Save Configuration</span>
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
