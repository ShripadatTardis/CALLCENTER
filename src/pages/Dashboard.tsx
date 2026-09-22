import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Users, Heart, Clock, Star, TrendingUp, FileText, AlertTriangle, BarChart3 } from 'lucide-react';
import { useIndustryData, useIndustryTerminology } from '@/hooks/useIndustryData';

const Dashboard: React.FC = () => {
  const { callLogs, agents, terminology, industryName } = useIndustryData();
  const { getTerminology } = useIndustryTerminology();

  // Calculate real metrics from industry call logs
  const totalCalls = callLogs.length;
  const activeCalls = 2; // Static for the screenshot match
  const avgSentiment = 68; // Static for the screenshot match
  const csatScore = 3.5; // Static for the screenshot match
  const avgHandleTime = "3m 45s"; // Static for the screenshot match

  // Get recent calls data (first 4 calls from industry data)
  const recentCallsData = callLogs.slice(0, 4).map(call => ({
    name: call.customerName,
    type: call.intent,
    phone: call.phoneNumber,
    status: call.status === 'completed' ? 'Complete' : call.status === 'ongoing' ? 'In-Progress' : 'Escalated',
    duration: `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`,
    statusColor: call.status === 'completed' ? 'bg-green-100 text-green-700' : 
                call.status === 'ongoing' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700',
    rating: call.status === 'completed' ? 5 : undefined
  }));

  // Get AI agents data from industry data
  const aiAgentsData = agents.slice(0, 4).map((agent, index) => ({
    name: agent.name,
    type: agent.capabilities?.[0] || agent.description || 'General Support',
    calls: `${Math.floor(Math.random() * 50) + 100} calls • ${Math.floor(Math.random() * 20) + 80}% success`,
    status: index === 0 ? 'Engaged' : index === 1 ? 'Idle' : index === 2 ? 'Escalation Triggered' : 'Awaiting Input',
    duration: index === 0 ? '4m 5s' : index === 2 ? '7m 0s' : index === 3 ? '0m 30s' : '',
    statusColor: index === 0 ? 'bg-green-100 text-green-700' : 
                index === 1 ? 'bg-yellow-100 text-yellow-700' : 
                index === 2 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
  }));

  return (
    <Layout>
      <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard - {industryName}</h1>
          <p className="text-sm text-gray-500">Last updated: 1:55:50 PM</p>
        </div>

        {/* Top Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Calls</CardTitle>
              <Phone className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{activeCalls}</div>
              <p className="text-xs text-gray-500">Currently in progress</p>
              <p className="text-xs text-green-600 mt-1">+12% from last week</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">AI Agents</CardTitle>
              <Users className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">1/4</div>
              <p className="text-xs text-gray-500">Engaged / Total</p>
              <p className="text-xs text-green-600 mt-1">+8% from last week</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Sentiment</CardTitle>
              <Heart className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{avgSentiment}%</div>
              <p className="text-xs text-gray-500">Customer satisfaction</p>
              <p className="text-xs text-green-600 mt-1">+5% from last week</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">CSAT Score</CardTitle>
              <Star className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{csatScore}/5.0</div>
              <p className="text-xs text-gray-500">Customer rating</p>
              <p className="text-xs text-green-600 mt-1">+3.2% from last week</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Handle Time</CardTitle>
              <Clock className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{avgHandleTime}</div>
              <p className="text-xs text-gray-500">Per interaction</p>
              <p className="text-xs text-green-600 mt-1">15% from last week</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Calls */}
          <Card className="bg-white border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Recent Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCallsData.map((call, index) => (
                  <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{call.name}</div>
                      <div className="text-sm text-gray-500">{call.type}</div>
                      <div className="text-xs text-gray-400">{call.phone}</div>
                      {call.rating && (
                        <div className="flex items-center mt-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`h-3 w-3 ${i < call.rating! ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge className={`${call.statusColor} border-none`}>
                        {call.status}
                      </Badge>
                      <div className="text-xs text-gray-500 mt-1">{call.duration}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Agent Status */}
          <Card className="bg-white border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">AI Agent Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {aiAgentsData.map((agent, index) => (
                  <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{agent.name}</div>
                      <div className="text-sm text-gray-500">{agent.type}</div>
                      <div className="text-xs text-gray-400">{agent.calls}</div>
                    </div>
                    <div className="text-right">
                      <Badge className={`${agent.statusColor} border-none`}>
                        {agent.status}
                      </Badge>
                      {agent.duration && (
                        <div className="text-xs text-gray-500 mt-1">{agent.duration}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-white border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button variant="outline" className="justify-start h-auto p-4 flex-col items-start space-y-2">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-600">View Live {getTerminology('interactions')}</span>
                </div>
                <p className="text-sm text-gray-500 text-left">Monitor ongoing interactions</p>
              </Button>

              <Button variant="outline" className="justify-start h-auto p-4 flex-col items-start space-y-2">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span className="font-medium text-orange-600">Review Escalations</span>
                </div>
                <p className="text-sm text-gray-500 text-left">Handle escalated cases</p>
              </Button>

              <Button variant="outline" className="justify-start h-auto p-4 flex-col items-start space-y-2">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  <span className="font-medium text-purple-600">Analytics Report</span>
                </div>
                <p className="text-sm text-gray-500 text-left">Generate performance report</p>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
