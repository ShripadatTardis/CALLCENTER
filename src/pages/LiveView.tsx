import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Activity, Users, Phone, Clock, TrendingUp, AlertTriangle, Search, Filter, Monitor, Headphones, Volume2, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useIndustry } from '@/contexts/IndustryContext';
import { 
  generateIndustrySpecificLiveViewCalls, 
  generateIndustrySpecificLiveViewAgents,
  generateIndustrySpecificTranscripts 
} from '@/utils/industryDataGenerator';

const LiveView: React.FC = () => {
  const { selectedIndustry, industryConfig } = useIndustry();
  
  // Generate industry-specific data
  const industryLiveViewCalls = generateIndustrySpecificLiveViewCalls(selectedIndustry);
  const industryLiveViewAgents = generateIndustrySpecificLiveViewAgents(selectedIndustry);
  const industryTranscripts = generateIndustrySpecificTranscripts(selectedIndustry);
  
  const [calls, setCalls] = useState(industryLiveViewCalls);
  const [agents, setAgents] = useState(industryLiveViewAgents);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [transferReason, setTransferReason] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  // Update data when industry changes
  useEffect(() => {
    setCalls(generateIndustrySpecificLiveViewCalls(selectedIndustry));
    setAgents(generateIndustrySpecificLiveViewAgents(selectedIndustry));
  }, [selectedIndustry]);

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCalls(prevCalls => 
        prevCalls.map(call => {
          if (call.stage === 'in-progress') {
            return {
              ...call,
              duration: call.duration + 1
            };
          }
          return call;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Filter calls based on search and filters
  const filteredCalls = calls.filter(call => {
    const matchesSearch = 
      call.callerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.callerNumber.includes(searchTerm) ||
      call.intent.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || call.stage === statusFilter;
    const matchesIntent = intentFilter === 'all' || call.intent === intentFilter;
    
    return matchesSearch && matchesStatus && matchesIntent;
  });

  const activeCalls = calls.filter(call => call.stage === 'in-progress' || call.stage === 'connecting');
  const transferredCalls = calls.filter(call => call.stage === 'escalated');
  const engagedAgents = agents.filter(agent => agent.status === 'engaged' || agent.status === 'awaiting_input');
  const idleAgents = agents.filter(agent => agent.status === 'idle');

  // Get unique intents for filter dropdown
  const uniqueIntents = [...new Set(calls.map(call => call.intent as string))] as string[];

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate average handle time with a cap of 3:09 (189 seconds)
  const calculateAvgHandleTime = () => {
    if (activeCalls.length === 0) return 0;
    const totalTime = activeCalls.reduce((acc, call) => acc + call.duration, 0);
    const avgTime = Math.round(totalTime / activeCalls.length);
    return Math.min(avgTime, 189); // Cap at 3:09 minutes
  };

  const getSentimentColor = (score: number) => {
    if (score >= 0.7) return 'text-green-600';
    if (score >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAgentStatusColor = (status: string) => {
    switch (status) {
      case 'engaged': return 'bg-green-500';
      case 'idle': return 'bg-gray-400';
      case 'awaiting_input': return 'bg-yellow-500';
      case 'escalation_triggered': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const handleMonitor = (call: any) => {
    setSelectedCall(call);
  };

  const handleTransferToHuman = () => {
    if (!transferReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a transfer reason",
        variant: "destructive"
      });
      return;
    }

    // Update call status to transferred
    setCalls(prevCalls => 
      prevCalls.map(call => 
        call.id === selectedCall?.id 
          ? { ...call, stage: 'escalated' as const, escalationTrigger: transferReason }
          : call
      )
    );

    toast({
      title: "Call Transferred",
      description: `Call from ${selectedCall?.callerName} has been transferred to a human agent successfully`
    });

    // Reset form
    setTransferReason('');
    setTransferNotes('');
    setSelectedCall(null);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Live View Dashboard</h1>
            <p className="text-slate-600">Real-time monitoring of all AI agents and active calls for {industryConfig.name}</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 text-sm text-slate-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live Updates</span>
            </div>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{activeCalls.length}</div>
              <p className="text-xs text-muted-foreground">
                {calls.filter(call => call.stage === 'connecting').length} connecting
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Engaged Agents</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{engagedAgents.length}</div>
              <p className="text-xs text-muted-foreground">
                {idleAgents.length} idle agents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Handle Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {formatDuration(calculateAvgHandleTime())}
              </div>
              <p className="text-xs text-muted-foreground">
                Current active calls
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transfers to Human</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{Math.max(1, transferredCalls.length)}</div>
              <p className="text-xs text-muted-foreground">
                Today: 3 transfers
              </p>
            </CardContent>
          </Card>
        </div>

        {/* AI Agents Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>AI Agents Status - {industryConfig.name}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {agents.map((agent) => (
                <div key={agent.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-900">{agent.name}</h3>
                    <div className={`w-3 h-3 rounded-full ${getAgentStatusColor(agent.status)}`}></div>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <Badge variant="outline" className="text-xs">
                        {agent.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Cluster:</span>
                      <span className="text-xs">{agent.intentCluster}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Success Rate:</span>
                      <span className="text-xs font-medium">{(agent.successRate * 100).toFixed(0)}%</span>
                    </div>
                    {agent.status === 'engaged' && agent.engagementTime && (
                      <div className="flex justify-between">
                        <span>Call Time:</span>
                        <span className="text-xs font-mono">{formatDuration(agent.engagementTime)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Live Calls with Search and Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Phone className="h-5 w-5" />
                <span>Live Calls ({filteredCalls.length})</span>
              </CardTitle>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search by name, number, or intent..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="connecting">Connecting</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="escalated">Transferred</SelectItem>
                      <SelectItem value="complete">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={intentFilter} onValueChange={setIntentFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Intent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Intents</SelectItem>
                      {uniqueIntents.map(intent => (
                        <SelectItem key={intent} value={intent}>{intent}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caller</TableHead>
                    <TableHead>Intent</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls.slice(0, 20).map((call) => (
                    <TableRow key={call.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-slate-900">{call.callerName}</div>
                          <div className="text-sm text-slate-500">{call.callerNumber}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{call.intent}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700">{call.aiAgentId}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-slate-700">{formatDuration(call.duration)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className={`font-medium ${getSentimentColor(call.sentimentScore)}`}>
                            {(call.sentimentScore * 100).toFixed(0)}%
                          </span>
                          <div className="w-12 bg-slate-200 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full"
                              style={{ width: `${call.sentimentScore * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={call.stage} />
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => handleMonitor(call)}>
                                <Monitor className="h-4 w-4 mr-1" />
                                Monitor
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Call Monitoring - {call.callerName}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Caller Information</Label>
                                    <div className="text-sm bg-slate-50 p-3 rounded-lg">
                                      <p><strong>Name:</strong> {call.callerName}</p>
                                      <p><strong>Phone:</strong> {call.callerNumber}</p>
                                      <p><strong>Intent:</strong> {call.intent}</p>
                                      <p><strong>Channel:</strong> {call.channel}</p>
                                      <p><strong>Context:</strong> {call.context}</p>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Call Details</Label>
                                    <div className="text-sm bg-slate-50 p-3 rounded-lg">
                                      <p><strong>Duration:</strong> {formatDuration(call.duration)}</p>
                                      <p><strong>Status:</strong> {call.stage}</p>
                                      <p><strong>Sentiment:</strong> {(call.sentimentScore * 100).toFixed(0)}%</p>
                                      <p><strong>Agent:</strong> {call.aiAgentId}</p>
                                      <p><strong>Industry:</strong> {industryConfig.name}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-2 hidden">
                                  <Label className="text-sm font-medium">Live Audio Controls</Label>
                                  <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
                                    <Button size="sm" variant="outline">
                                      <Headphones className="h-4 w-4 mr-2" />
                                      Listen In
                                    </Button>
                                    <Button size="sm" variant="outline">
                                      <Volume2 className="h-4 w-4 mr-2" />
                                      Mute/Unmute
                                    </Button>
                                    <div className="flex-1">
                                      <div className="w-full bg-slate-200 rounded-full h-2">
                                        <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-1">Audio Level</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Recent Transcript</Label>
                                  <div className="bg-slate-50 p-3 rounded-lg text-sm max-h-32 overflow-y-auto">
                                    <p><strong>{industryConfig.features.terminology.customer}:</strong> {industryTranscripts.customer}</p>
                                    <p><strong>AI Agent:</strong> {industryTranscripts.agent}</p>
                                    <p><strong>{industryConfig.features.terminology.customer}:</strong> {industryTranscripts.customer2}</p>
                                    <p><strong>AI Agent:</strong> {industryTranscripts.agent2}</p>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Call Analysis</Label>
                                  <div className="bg-slate-50 p-3 rounded-lg text-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <p><strong>Sentiment Trend:</strong> Improving</p>
                                        <p><strong>Key Topics:</strong> {call.intent.replace('_', ' ')}, {industryConfig.features.terminology.service}</p>
                                      </div>
                                      <div>
                                        <p><strong>Resolution Status:</strong> In Progress</p>
                                        <p><strong>Confidence Score:</strong> 85%</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          
                          {(call.stage === 'in-progress' || call.escalationTrigger) && false && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="destructive" size="sm" onClick={() => setSelectedCall(call)}>
                                  <UserPlus className="h-4 w-4 mr-1" />
                                  Transfer to Human
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Transfer to Human Agent - {call.callerName}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                                    <p className="text-sm text-amber-800">
                                      <strong>Note:</strong> This will immediately transfer the call to the next available human agent.
                                    </p>
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="reason">Transfer Reason</Label>
                                    <Select value={transferReason} onValueChange={setTransferReason}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select reason for human transfer" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="complex_technical_issue">Complex Technical Issue</SelectItem>
                                        <SelectItem value="customer_dissatisfaction">{industryConfig.features.terminology.customer} Dissatisfaction</SelectItem>
                                        <SelectItem value="high_value_transaction">High Value Transaction</SelectItem>
                                        <SelectItem value="fraud_suspicion">Fraud Suspicion</SelectItem>
                                        <SelectItem value="policy_exception">Policy Exception Required</SelectItem>
                                        <SelectItem value="supervisor_requested">Supervisor Requested</SelectItem>
                                        <SelectItem value="empathy_required">Empathy/Emotional Support Needed</SelectItem>
                                        <SelectItem value="ai_limitation">AI Agent Limitation</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="notes">Transfer Notes for Human Agent</Label>
                                    <Textarea
                                      id="notes"
                                      placeholder="Provide context and background information for the human agent..."
                                      value={transferNotes}
                                      onChange={(e) => setTransferNotes(e.target.value)}
                                      rows={4}
                                    />
                                  </div>
                                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                                    <h4 className="font-medium text-blue-800 mb-2">Transfer Summary:</h4>
                                    <div className="text-sm text-blue-700">
                                      <p><strong>Caller:</strong> {call.callerName}</p>
                                      <p><strong>Call Duration:</strong> {formatDuration(call.duration)}</p>
                                      <p><strong>Current Intent:</strong> {call.intent}</p>
                                      <p><strong>Sentiment Score:</strong> {(call.sentimentScore * 100).toFixed(0)}%</p>
                                      <p><strong>Industry:</strong> {industryConfig.name}</p>
                                    </div>
                                  </div>
                                  <div className="flex justify-end space-x-2">
                                    <Button variant="outline" onClick={() => setSelectedCall(null)}>
                                      Cancel
                                    </Button>
                                    <Button variant="destructive" onClick={handleTransferToHuman}>
                                      Transfer Now
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filteredCalls.length > 20 && (
              <div className="mt-4 text-center">
                <Button variant="outline">
                  View All {filteredCalls.length} Calls
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Human Transfer Alerts */}
        {transferredCalls.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-800 flex items-center space-x-2">
                <UserPlus className="h-5 w-5" />
                <span>Active Human Transfers ({Math.max(1, transferredCalls.length)})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transferredCalls.length > 0 ? transferredCalls.map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200">
                    <div>
                      <div className="font-medium text-orange-900">{call.callerName}</div>
                      <div className="text-sm text-orange-700">Transfer Reason: {call.escalationTrigger}</div>
                      <div className="text-xs text-orange-600">Total Duration: {formatDuration(call.duration)}</div>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100">
                        View Details
                      </Button>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                        Connect Agent
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200">
                    <div>
                      <div className="font-medium text-orange-900">Sarah Johnson</div>
                      <div className="text-sm text-orange-700">Transfer Reason: Complex Technical Issue</div>
                      <div className="text-xs text-orange-600">Total Duration: 2:45</div>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100">
                        View Details
                      </Button>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                        Connect Agent
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default LiveView;
