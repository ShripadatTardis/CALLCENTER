import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, BookOpen, Package, Globe, CheckCircle, XCircle } from 'lucide-react';

export const IntegrationsManager: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const integrations = [
    {
      id: '1',
      type: 'kb',
      name: 'Default Knowledge Base',
      env: 'prod',
      lastTested: '2025-01-08T10:30:00Z',
      status: 'success'
    },
    {
      id: '2',
      type: 'api',
      name: 'Core Banking API',
      env: 'prod',
      lastTested: '2025-01-08T09:15:00Z',
      status: 'success'
    },
    {
      id: '3',
      type: 'product',
      name: 'Product Catalog',
      env: 'stage',
      lastTested: '2025-01-07T14:20:00Z',
      status: 'failure'
    }
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'kb': return BookOpen;
      case 'product': return Package;
      case 'api': return Globe;
      default: return Globe;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'kb': return 'badge-blue';
      case 'product': return 'badge-purple';
      case 'api': return 'badge-green';
      default: return 'badge-blue';
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Manage data sources, APIs, and external services
          </p>
        </div>
        <Button size="lg">
          <Plus className="h-5 w-5 mr-2" />
          Add Integration
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => {
          const Icon = getTypeIcon(integration.type);
          const isSuccess = integration.status === 'success';

          return (
            <Card key={integration.id} className="hover:shadow-soft-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{integration.name}</CardTitle>
                  </div>
                  {isSuccess ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Badge className={getTypeBadge(integration.type)}>
                      {integration.type}
                    </Badge>
                    <Badge variant="outline" className="badge-orange">
                      {integration.env}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Last tested: {new Date(integration.lastTested).toLocaleDateString()}
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
