
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-6xl font-bold text-gray-300 mb-4">404</CardTitle>
            <h1 className="text-2xl font-bold text-gray-900">Page Not Found</h1>
            <p className="text-gray-600 mt-2">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => navigate(-1)} 
              variant="outline" 
              className="w-full flex items-center justify-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Go Back</span>
            </Button>
            <Link to="/dashboard" className="block">
              <Button className="w-full flex items-center justify-center space-x-2">
                <Home className="h-4 w-4" />
                <span>Go to Dashboard</span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default NotFound;
