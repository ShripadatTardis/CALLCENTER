
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useIndustryData, useIndustryTerminology } from '@/hooks/useIndustryData';
import { 
  Search, 
  Filter, 
  Star, 
  Download, 
  Calendar, 
  Clock,
  Eye,
  Settings,
  BarChart3,
  TrendingUp,
  Crown,
  Target,
  Heart,
  Activity,
  Shield,
  DollarSign,
  Monitor,
  Plus
} from 'lucide-react';

const iconMap = {
  BarChart3,
  TrendingUp,
  Crown,
  Target,
  Heart,
  Activity,
  Shield,
  DollarSign,
  Monitor,
  Plus,
  Settings,
  PhoneCall: Activity,
  UserCheck: Activity,
  CheckCircle: Shield,
  Server: Monitor,
  Users: Activity,
  AlertTriangle: Shield,
  Brain: Activity,
  Zap: Settings,
  MapPin: Heart
};

const Reports: React.FC = () => {
  const { user } = useAuth();
  const { industryName } = useIndustryData();
  const { getTerminology } = useIndustryTerminology();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [favorites, setFavorites] = useState<string[]>([]);

  // Generate industry-specific reports
  const generateIndustryReports = () => {
    const reportCategories = [
      { id: 'executive', name: 'Executive Reports', icon: 'Crown' },
      { id: 'campaign_performance', name: `${getTerminology('campaign')} Performance`, icon: 'Target' },
      { id: 'customer_experience', name: `${getTerminology('customer')} Experience`, icon: 'Heart' },
      { id: 'ai_performance', name: 'AI Performance', icon: 'Activity' },
      { id: 'operational', name: 'Operational', icon: 'Settings' },
      { id: 'qa_compliance', name: 'QA & Compliance', icon: 'Shield' },
      { id: 'financial', name: 'Financial', icon: 'DollarSign' },
      { id: 'technical', name: 'Technical', icon: 'Monitor' },
      { id: 'custom', name: 'Custom Reports', icon: 'Plus' }
    ];

    return [
      {
        id: 'exec-dashboard',
        name: `${industryName} Executive Dashboard`,
        description: `High-level KPIs and business metrics for ${industryName} operations`,
        category: 'executive',
        type: 'dashboard',
        permissions: ['view_executive_reports'],
        icon: 'BarChart3',
        estimatedTime: '2-3 minutes',
        dataSource: ['calls', 'campaigns', 'agents', 'csat'],
        exportFormats: ['pdf', 'powerpoint'],
        lastGenerated: new Date(Date.now() - 2 * 60 * 60 * 1000)
      },
      {
        id: 'campaign-performance',
        name: `${getTerminology('campaign')} Performance Analysis`,
        description: `Detailed analysis of ${getTerminology('campaign')} effectiveness and ROI`,
        category: 'campaign_performance',
        type: 'detailed',
        permissions: ['view_campaign_reports'],
        icon: 'Target',
        estimatedTime: '3-4 minutes',
        dataSource: ['campaigns', 'contacts', 'outcomes'],
        exportFormats: ['excel', 'csv', 'pdf']
      },
      {
        id: 'customer-experience',
        name: `${getTerminology('customer')} Experience Analytics`,
        description: `${getTerminology('customer')} satisfaction trends and feedback analysis`,
        category: 'customer_experience',
        type: 'trend',
        permissions: ['view_csat_analytics'],
        icon: 'Heart',
        estimatedTime: '4-5 minutes',
        dataSource: ['csat_scores', 'feedback', 'interactions'],
        exportFormats: ['excel', 'pdf', 'csv']
      }
    ];
  };

  const industryReports = generateIndustryReports();

  // Filter reports based on user permissions
  const filteredReports = industryReports.filter(report => {
    const hasPermissions = report.permissions.some(permission => 
      hasPermission(user, permission)
    );
    const matchesSearch = report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || report.category === selectedCategory;
    
    return hasPermissions && matchesSearch && matchesCategory;
  });

  const toggleFavorite = (reportId: string) => {
    setFavorites(prev => 
      prev.includes(reportId) 
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  const getCategoryIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName as keyof typeof iconMap];
    return IconComponent || BarChart3;
  };

  const getReportIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName as keyof typeof iconMap];
    return IconComponent || BarChart3;
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      executive: 'bg-purple-100 text-purple-800 border-purple-200',
      campaign_performance: 'bg-blue-100 text-blue-800 border-blue-200',
      customer_experience: 'bg-green-100 text-green-800 border-green-200',
      ai_performance: 'bg-orange-100 text-orange-800 border-orange-200',
      operational: 'bg-slate-100 text-slate-800 border-slate-200',
      qa_compliance: 'bg-red-100 text-red-800 border-red-200',
      financial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      technical: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      custom: 'bg-pink-100 text-pink-800 border-pink-200'
    };
    return colors[category as keyof typeof colors] || colors.operational;
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{industryName} Reports</h1>
            <p className="text-slate-600">Comprehensive analytics and business intelligence reports for {industryName}</p>
          </div>
          <div className="flex space-x-3">
            <Button variant="outline" className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Scheduled Reports</span>
            </Button>
            <Button className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600">
              <Plus className="h-4 w-4" />
              <span>Create Custom Report</span>
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                <Input
                  placeholder="Search reports by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-3">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm min-w-[180px]"
                >
                  <option value="all">All Categories</option>
                  {[
                    { id: 'executive', name: 'Executive Reports' },
                    { id: 'campaign_performance', name: `${getTerminology('campaign')} Performance` },
                    { id: 'customer_experience', name: `${getTerminology('customer')} Experience` }
                  ].map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" className="flex items-center space-x-2">
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{filteredReports.length}</div>
                  <div className="text-sm text-slate-600">Available Reports</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Star className="h-8 w-8 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold">{favorites.length}</div>
                  <div className="text-sm text-slate-600">Favorite Reports</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Calendar className="h-8 w-8 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">12</div>
                  <div className="text-sm text-slate-600">Scheduled Reports</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Download className="h-8 w-8 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">156</div>
                  <div className="text-sm text-slate-600">Downloads This Month</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reports Grid by Category */}
        {[
          { id: 'executive', name: 'Executive Reports', icon: 'Crown' },
          { id: 'campaign_performance', name: `${getTerminology('campaign')} Performance`, icon: 'Target' },
          { id: 'customer_experience', name: `${getTerminology('customer')} Experience`, icon: 'Heart' }
        ].map(category => {
          const categoryReports = filteredReports.filter(report => report.category === category.id);
          if (categoryReports.length === 0) return null;

          const CategoryIcon = getCategoryIcon(category.icon);

          return (
            <div key={category.id}>
              <div className="flex items-center space-x-3 mb-4">
                <CategoryIcon className="h-6 w-6 text-slate-700" />
                <h2 className="text-xl font-semibold text-slate-900">{category.name}</h2>
                <Badge variant="outline" className="text-xs">
                  {categoryReports.length} report{categoryReports.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {categoryReports.map((report) => {
                  const ReportIcon = getReportIcon(report.icon);
                  const isFavorite = favorites.includes(report.id);
                  
                  return (
                    <Card key={report.id} className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition-colors">
                              <ReportIcon className="h-5 w-5 text-slate-600 group-hover:text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <CardTitle className="text-base font-semibold">{report.name}</CardTitle>
                              <Badge className={`text-xs mt-1 ${getCategoryColor(report.category)}`}>
                                {report.type.replace('_', ' ')}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(report.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-slate-400'}`} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-slate-600 line-clamp-2">{report.description}</p>
                        
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{report.estimatedTime}</span>
                          </div>
                          {report.lastGenerated && (
                            <span>Updated {new Date(report.lastGenerated).toLocaleDateString()}</span>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex space-x-1">
                            {report.exportFormats.slice(0, 3).map(format => (
                              <Badge key={format} variant="outline" className="text-xs uppercase">
                                {format}
                              </Badge>
                            ))}
                            {report.exportFormats.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{report.exportFormats.length - 3}
                              </Badge>
                            )}
                          </div>
                          <div className="flex space-x-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Download className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Settings className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredReports.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No reports found</h3>
                <p className="text-slate-600 mb-4">
                  Try adjusting your search terms or category filter.
                </p>
                <Button variant="outline">
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Reports;
