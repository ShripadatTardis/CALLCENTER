
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { QualityScoring } from '@/components/qa/QualityScoring';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, Clock, AlertTriangle, Star, Filter } from 'lucide-react';

const QAReview: React.FC = () => {
  const [selectedCall, setSelectedCall] = useState<string | null>(null);

  const reviewQueue = [
    {
      id: 'call-001',
      callId: 'CALL-20241217-001',
      callerName: 'John Smith',
      intent: 'Billing Inquiry',
      duration: 245,
      outcome: 'resolved',
      priority: 'high',
      assignedReviewer: 'Sarah Johnson',
      status: 'pending',
      submittedAt: '2024-12-17 09:30:00'
    },
    {
      id: 'call-002',
      callId: 'CALL-20241217-002',
      callerName: 'Maria Garcia',
      intent: 'Loan Status',
      duration: 189,
      outcome: 'escalated',
      priority: 'urgent',
      assignedReviewer: 'Mike Chen',
      status: 'in_progress',
      submittedAt: '2024-12-17 10:15:00'
    },
    {
      id: 'call-003',
      callId: 'CALL-20241217-003',
      callerName: 'David Wilson',
      intent: 'Technical Support',
      duration: 367,
      outcome: 'callback_scheduled',
      priority: 'medium',
      assignedReviewer: 'Sarah Johnson',
      status: 'completed',
      submittedAt: '2024-12-17 11:00:00',
      score: 87
    }
  ];

  const completedReviews = [
    {
      id: 'review-001',
      callId: 'CALL-20241216-045',
      callerName: 'Lisa Anderson',
      intent: 'Billing Inquiry',
      reviewer: 'Sarah Johnson',
      score: 92,
      completedAt: '2024-12-16 16:30:00',
      feedback: 'Excellent intent recognition and resolution. Minor improvement needed in empathy expression.'
    },
    {
      id: 'review-002',
      callId: 'CALL-20241216-046',
      callerName: 'Robert Taylor',
      intent: 'Loan Status',
      reviewer: 'Mike Chen',
      score: 78,
      completedAt: '2024-12-16 17:15:00',
      feedback: 'Good resolution but escalation could have been avoided with better clarification questions.'
    }
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'in_progress': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveScoring = (criteria: any[], overallScore: number, feedback: string) => {
    console.log('Saving QA scoring:', { criteria, overallScore, feedback });
    setSelectedCall(null);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Quality Assurance Review</h1>
            <p className="text-slate-600">Review and score AI agent interactions for continuous improvement</p>
          </div>
          <Button variant="outline" className="flex items-center space-x-2">
            <Filter className="h-4 w-4" />
            <span>Filter Reviews</span>
          </Button>
        </div>

        {/* QA Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Pending Reviews</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {reviewQueue.filter(r => r.status === 'pending').length}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">In Progress</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {reviewQueue.filter(r => r.status === 'in_progress').length}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Completed Today</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {reviewQueue.filter(r => r.status === 'completed').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Avg Quality Score</p>
                  <p className="text-2xl font-bold text-green-600">85.7</p>
                </div>
                <Star className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="queue" className="space-y-6">
          <TabsList>
            <TabsTrigger value="queue">Review Queue</TabsTrigger>
            <TabsTrigger value="completed">Completed Reviews</TabsTrigger>
            <TabsTrigger value="analytics">QA Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Calls Awaiting Review</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reviewQueue.map((call) => (
                    <div key={call.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-semibold text-slate-900">{call.callerName}</h3>
                            <Badge variant="outline">{call.intent}</Badge>
                            <Badge className={getPriorityColor(call.priority)}>
                              {call.priority}
                            </Badge>
                            <div className="flex items-center space-x-1">
                              {getStatusIcon(call.status)}
                              <span className="text-sm capitalize">{call.status.replace('_', ' ')}</span>
                            </div>
                          </div>
                          <div className="text-sm text-slate-500 mb-2">
                            Call ID: {call.callId} • Duration: {formatDuration(call.duration)} • Outcome: {call.outcome}
                          </div>
                          <div className="text-sm text-slate-500">
                            Assigned to: {call.assignedReviewer} • Submitted: {new Date(call.submittedAt).toLocaleString()}
                          </div>
                          {call.score && (
                            <div className="mt-2">
                              <span className="text-sm text-slate-500">Quality Score: </span>
                              <span className={`font-medium ${getScoreColor(call.score)}`}>{call.score}/100</span>
                            </div>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          {call.status !== 'completed' && (
                            <Button 
                              size="sm" 
                              onClick={() => setSelectedCall(call.callId)}
                            >
                              {call.status === 'pending' ? 'Start Review' : 'Continue Review'}
                            </Button>
                          )}
                          <Button variant="outline" size="sm">
                            View Call
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recently Completed Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {completedReviews.map((review) => (
                    <div key={review.id} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-semibold text-slate-900">{review.callerName}</h3>
                            <Badge variant="outline">{review.intent}</Badge>
                            <div className="flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span className={`font-medium ${getScoreColor(review.score)}`}>
                                {review.score}/100
                              </span>
                            </div>
                          </div>
                          <div className="text-sm text-slate-500 mb-2">
                            Call ID: {review.callId} • Reviewed by: {review.reviewer}
                          </div>
                          <div className="text-sm text-slate-500">
                            Completed: {new Date(review.completedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-md p-3">
                        <p className="text-sm text-slate-700">{review.feedback}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quality Score Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Excellent (90-100)</span>
                        <span className="text-sm text-slate-500">23%</span>
                      </div>
                      <Progress value={23} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Good (80-89)</span>
                        <span className="text-sm text-slate-500">45%</span>
                      </div>
                      <Progress value={45} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Fair (70-79)</span>
                        <span className="text-sm text-slate-500">22%</span>
                      </div>
                      <Progress value={22} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Poor (Below 70)</span>
                        <span className="text-sm text-slate-500">10%</span>
                      </div>
                      <Progress value={10} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Improvement Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-900">+5.3%</div>
                      <div className="text-sm text-green-700">Quality Score Improvement</div>
                      <div className="text-xs text-green-600 mt-1">vs last month</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-900">89.2%</div>
                      <div className="text-sm text-blue-700">Intent Accuracy</div>
                      <div className="text-xs text-blue-600 mt-1">↑ 2.1% this week</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-900">4.2</div>
                      <div className="text-sm text-purple-700">Avg Reviews/Day</div>
                      <div className="text-xs text-purple-600 mt-1">per reviewer</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Quality Scoring Modal */}
        {selectedCall && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
              <div className="p-6">
                <QualityScoring
                  callId={selectedCall}
                  onSave={handleSaveScoring}
                />
                <div className="flex justify-end mt-6">
                  <Button variant="outline" onClick={() => setSelectedCall(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default QAReview;
