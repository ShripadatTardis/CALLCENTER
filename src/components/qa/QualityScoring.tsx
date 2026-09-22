
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Star, CheckCircle, XCircle, AlertCircle, Save } from 'lucide-react';

interface ScoringCriteria {
  id: string;
  name: string;
  description: string;
  weight: number;
  score: number;
  comments: string;
}

interface QualityScoringProps {
  callId: string;
  onSave: (scores: ScoringCriteria[], overallScore: number, feedback: string) => void;
}

export const QualityScoring: React.FC<QualityScoringProps> = ({ callId, onSave }) => {
  const [criteria, setCriteria] = useState<ScoringCriteria[]>([
    {
      id: 'intent_accuracy',
      name: 'Intent Recognition Accuracy',
      description: 'How accurately did the AI identify the customer intent?',
      weight: 25,
      score: 0,
      comments: ''
    },
    {
      id: 'response_quality',
      name: 'Response Quality',
      description: 'Was the AI response helpful, accurate, and professional?',
      weight: 30,
      comments: '',
      score: 0
    },
    {
      id: 'conversation_flow',
      name: 'Conversation Flow',
      description: 'Did the conversation follow a logical flow?',
      weight: 20,
      score: 0,
      comments: ''
    },
    {
      id: 'escalation_handling',
      name: 'Escalation Handling',
      description: 'Were escalations handled appropriately?',
      weight: 15,
      score: 0,
      comments: ''
    },
    {
      id: 'customer_satisfaction',
      name: 'Customer Satisfaction',
      description: 'Overall customer experience and satisfaction',
      weight: 10,
      score: 0,
      comments: ''
    }
  ]);

  const [overallFeedback, setOverallFeedback] = useState('');

  const updateCriteriaScore = (id: string, score: number) => {
    setCriteria(prev => prev.map(c => 
      c.id === id ? { ...c, score } : c
    ));
  };

  const updateCriteriaComments = (id: string, comments: string) => {
    setCriteria(prev => prev.map(c => 
      c.id === id ? { ...c, comments } : c
    ));
  };

  const calculateOverallScore = () => {
    const totalWeightedScore = criteria.reduce((sum, c) => sum + (c.score * c.weight), 0);
    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    return totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (score >= 60) return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  const overallScore = calculateOverallScore();

  const handleSave = () => {
    onSave(criteria, overallScore, overallFeedback);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Quality Assessment - Call {callId}</span>
            <div className="flex items-center space-x-2">
              {getScoreIcon(overallScore)}
              <span className={`text-lg font-bold ${getScoreColor(overallScore)}`}>
                {overallScore}/100
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            {[1, 2, 3, 4, 5].map(star => (
              <div key={star} className="text-center p-3 bg-slate-50 rounded-lg">
                <div className="flex justify-center mb-2">
                  {Array.from({ length: star }, (_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <div className="text-xs text-slate-600">{star} Star{star > 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
          <Progress value={overallScore} className="h-3" />
        </CardContent>
      </Card>

      {criteria.map(criterion => (
        <Card key={criterion.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{criterion.name}</CardTitle>
                <p className="text-sm text-slate-600 mt-1">{criterion.description}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center space-x-2">
                  {getScoreIcon(criterion.score)}
                  <span className={`text-lg font-bold ${getScoreColor(criterion.score)}`}>
                    {criterion.score}/100
                  </span>
                </div>
                <Badge variant="outline" className="mt-1">
                  Weight: {criterion.weight}%
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Score: {criterion.score}/100
              </label>
              <Slider
                value={[criterion.score]}
                onValueChange={([value]) => updateCriteriaScore(criterion.id, value)}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Comments</label>
              <Textarea
                placeholder="Provide specific feedback for this criterion..."
                value={criterion.comments}
                onChange={(e) => updateCriteriaComments(criterion.id, e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Overall Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Provide overall feedback and recommendations for improvement..."
            value={overallFeedback}
            onChange={(e) => setOverallFeedback(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end mt-4">
            <Button onClick={handleSave} className="flex items-center space-x-2">
              <Save className="h-4 w-4" />
              <span>Save Assessment</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
