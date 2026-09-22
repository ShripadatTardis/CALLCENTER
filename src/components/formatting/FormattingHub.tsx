
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Calendar, Phone, MessageSquare, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VapiResponseLog {
  id: number;
  session_id: string | null;
  whatsapp_number: string;
  original_text: string;
  formatted_text: string;
  format_strategy: 'LOCAL' | 'AI' | 'DISABLED';
  created_at: string;
}

export const FormattingHub: React.FC = () => {
  const [logs, setLogs] = useState<VapiResponseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vapi_response_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (searchTerm) {
        query = query.or(`whatsapp_number.ilike.%${searchTerm}%,session_id.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching logs:', error);
      } else {
        // Type conversion to ensure format_strategy is properly typed
        const typedLogs: VapiResponseLog[] = (data || []).map(log => ({
          ...log,
          format_strategy: log.format_strategy as 'LOCAL' | 'AI' | 'DISABLED'
        }));
        setLogs(typedLogs);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchLogs();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleRefresh = () => {
    fetchLogs();
  };

  const toggleExpanded = (logId: number) => {
    setExpandedLog(expandedLog === logId ? null : logId);
  };

  const formatStrategy = (strategy: 'LOCAL' | 'AI' | 'DISABLED') => {
    return strategy.toLowerCase();
  };

  const getStrategyBadgeColor = (strategy: 'LOCAL' | 'AI' | 'DISABLED') => {
    switch (strategy) {
      case 'AI':
        return 'bg-blue-100 text-blue-800';
      case 'LOCAL':
        return 'bg-green-100 text-green-800';
      case 'DISABLED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Formatting Hub</h1>
        <Button onClick={handleRefresh} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by WhatsApp number or session ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formatting Logs ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 && !loading && (
            <div className="text-center py-8 space-y-4">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium">No formatting logs found</h3>
                <p className="text-muted-foreground">
                  {searchTerm 
                    ? "No logs match your search criteria." 
                    : "Formatting may be disabled, or no WhatsApp conversations have occurred yet."}
                </p>
                <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
                  <strong>Note:</strong> When formatting is disabled via the FORMATTING_ENABLED environment variable, 
                  messages are not logged to preserve system resources and maintain privacy.
                </div>
              </div>
            </div>
          )}
          
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={getStrategyBadgeColor(log.format_strategy)}>
                        {formatStrategy(log.format_strategy)}
                      </Badge>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {log.whatsapp_number}
                      </div>
                      {log.session_id && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                          {log.session_id.substring(0, 8)}...
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {log.format_strategy === 'DISABLED' ? 'Original Message (Formatting Disabled):' : 'Formatted Message:'}
                    </div>
                    <div className={`border rounded p-3 text-sm whitespace-pre-wrap ${
                      log.format_strategy === 'DISABLED' 
                        ? 'bg-gray-50 border-gray-200' 
                        : 'bg-green-50 border-green-200'
                    }`}>
                      {log.formatted_text}
                    </div>
                  </div>

                  {log.format_strategy !== 'DISABLED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleExpanded(log.id)}
                      className="w-full"
                    >
                      {expandedLog === log.id ? 'Hide Original' : 'Show Original'}
                    </Button>
                  )}

                  {expandedLog === log.id && log.format_strategy !== 'DISABLED' && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Original Message:</div>
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm whitespace-pre-wrap">
                        {log.original_text}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
