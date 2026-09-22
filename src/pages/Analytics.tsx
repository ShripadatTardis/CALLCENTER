
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Calendar, Download, TrendingUp, Clock, Target, CheckCircle } from 'lucide-react';
import { useIndustryData, useIndustryTerminology } from '@/hooks/useIndustryData';

const Analytics: React.FC = () => {
  const { callLogs, terminology, industryName } = useIndustryData();
  const { getTerminology } = useIndustryTerminology();
  
  // Calculate dynamic data from industry call logs
  const totalCalls = callLogs.length;
  
  // Call Volume & Resolution Trends data (blue and green bars)
  const callVolumeData = [
    { name: 'Mon', calls: 140, resolved: 120 },
    { name: 'Tue', calls: 160, resolved: 140 },
    { name: 'Wed', calls: 180, resolved: 160 },
    { name: 'Thu', calls: 200, resolved: 180 },
    { name: 'Fri', calls: 220, resolved: 200 },
    { name: 'Sat', calls: 140, resolved: 130 },
    { name: 'Sun', calls: 100, resolved: 90 },
  ];

  // Query Distribution by Intent pie chart data - dynamic based on industry
  const getIntentDistribution = () => {
    const intents = [...new Set(callLogs.map(call => call.intent))];
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];
    
    return intents.slice(0, 5).map((intent, index) => ({
      name: intent,
      value: Math.floor(Math.random() * 30) + 15, // Random percentage between 15-45
      color: colors[index]
    }));
  };

  const intentDistributionData = getIntentDistribution();

  // Hourly Performance Metrics data (line chart)
  const hourlyData = [
    { time: '9AM', performance: 95 },
    { time: '10AM', performance: 92 },
    { time: '11AM', performance: 94 },
    { time: '12PM', performance: 90 },
    { time: '1PM', performance: 88 },
    { time: '2PM', performance: 92 },
    { time: '3PM', performance: 95 },
    { time: '4PM', performance: 97 },
    { time: '5PM', performance: 94 },
  ];

  // Calculate real metrics from industry data
  const resolvedCalls = callLogs.filter(call => call.status === 'completed').length;
  const fcrRate = ((resolvedCalls / totalCalls) * 100).toFixed(1);
  const avgDuration = Math.round(callLogs.reduce((sum, call) => sum + call.duration, 0) / totalCalls);
  const avgIntentAccuracy = '94.7'; // Static for consistency

  return (
    <Layout>
      <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{industryName} Performance Analytics</h1>
            <p className="text-sm text-gray-500">Comprehensive insights into AI performance and {getTerminology('customer')} {getTerminology('interactions')}</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm" className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Date Range</span>
            </Button>
            <Button variant="outline" size="sm" className="flex items-center space-x-2">
              <Download className="h-4 w-4" />
              <span>Export Report</span>
            </Button>
          </div>
        </div>

        {/* Top Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total {getTerminology('interactions')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{totalCalls}</div>
              <p className="text-xs text-gray-500">All {getTerminology('interactions')}</p>
              <p className="text-xs text-green-600 mt-1">+15.3% from last week</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">First Call Resolution</CardTitle>
              <CheckCircle className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{fcrRate}%</div>
              <p className="text-xs text-gray-500">FCR Rate</p>
              <p className="text-xs text-green-600 mt-1">+4.1% from last week</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Handle Time</CardTitle>
              <Clock className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{Math.floor(avgDuration / 60)}m {avgDuration % 60}s</div>
              <p className="text-xs text-gray-500">Per {getTerminology('interaction')}</p>
              <p className="text-xs text-green-600 mt-1">-8% from last week</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Intent Accuracy</CardTitle>
              <Target className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">94.7%</div>
              <p className="text-xs text-gray-500">Classification accuracy</p>
              <p className="text-xs text-green-600 mt-1">+2.1% from last week</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Call Volume & Resolution Trends */}
          <Card className="bg-white border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Call Volume & Resolution Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={callVolumeData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="resolved" fill="#10B981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Query Distribution by Intent */}
          <Card className="bg-white border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Query Distribution by Intent</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={intentDistributionData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}%`}
                    labelLine={false}
                  >
                    {intentDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Hourly Performance Metrics */}
        <Card className="bg-white border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Hourly Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="performance" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Resolution Metrics */}
          <Card className="bg-white border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Resolution Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">First Call Resolution</span>
                  <span className="text-sm font-medium">89.2%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-gray-800 h-2 rounded-full" style={{ width: '89.2%' }}></div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Second Call Resolution</span>
                  <span className="text-sm font-medium">7.3%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-gray-600 h-2 rounded-full" style={{ width: '7.3%' }}></div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Escalation Rate</span>
                  <span className="text-sm font-medium">3.5%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-gray-400 h-2 rounded-full" style={{ width: '3.5%' }}></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Satisfaction */}
          <Card className="bg-white border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Customer Satisfaction</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-6">
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600">78%</div>
                  <div className="text-xs text-gray-500">Positive</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-yellow-600">18%</div>
                  <div className="text-xs text-gray-500">Neutral</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-red-600">4%</div>
                  <div className="text-xs text-gray-500">Negative</div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">4.2/5.0</div>
                <div className="text-sm text-gray-500">Average Satisfaction Score</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Learning & Improvement Opportunities */}
        <Card className="bg-white border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">AI Learning & Improvement Opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Intent Recognition</h4>
                <p className="text-sm text-gray-600">94.7% accuracy with room for improvement in technical support queries</p>
                <Button variant="outline" size="sm" className="text-blue-600 border-blue-600 hover:bg-blue-50">
                  Review Training Data
                </Button>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Response Quality</h4>
                <p className="text-sm text-gray-600">Strong performance in billing queries, consider expanding to other areas</p>
                <Button variant="outline" size="sm" className="text-green-600 border-green-600 hover:bg-green-50">
                  Expand Templates
                </Button>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Escalation Patterns</h4>
                <p className="text-sm text-gray-600">Complex technical issues account for 68% of escalations</p>
                <Button variant="outline" size="sm" className="text-orange-600 border-orange-600 hover:bg-orange-50">
                  Optimize Handlers
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Analytics;
