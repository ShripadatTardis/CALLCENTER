
import React from 'react';
import { FeatureCard } from './FeatureCard';
import { Phone, MessageSquare, BarChart3, Shield } from 'lucide-react';

export const HeroSection: React.FC = () => {
  return (
    <div className="hidden lg:flex lg:flex-1 lg:relative lg:bg-gradient-to-br lg:from-blue-50 lg:to-indigo-100">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.1'%3E%3Ccircle cx='7' cy='7' r='7'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
      </div>
      
      {/* Content */}
      <div className="relative flex flex-col justify-center px-8 py-12 sm:px-12 lg:px-16 xl:px-20">
        <div className="max-w-xl">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            TARDIS VoiceForce®
          </h1>
          <p className="mt-6 text-xl text-slate-600 leading-relaxed">
            AI-powered voice automation platform that delivers intelligent, personalized customer interactions at scale.
          </p>
          
          {/* Features Grid */}
          <div className="mt-12 space-y-6">
            <FeatureCard
              icon={Phone}
              title="Real-time Call Management"
              description="Monitor live conversations and AI agent performance"
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
            />
            <FeatureCard
              icon={MessageSquare}
              title="Intelligent Responses"
              description="AI agents that understand context and intent"
              iconBgColor="bg-green-100"
              iconColor="text-green-600"
            />
            <FeatureCard
              icon={BarChart3}
              title="Advanced Analytics"
              description="Deep insights into customer interactions"
              iconBgColor="bg-purple-100"
              iconColor="text-purple-600"
            />
            <FeatureCard
              icon={Shield}
              title="Quality Assurance"
              description="Automated quality scoring and feedback"
              iconBgColor="bg-orange-100"
              iconColor="text-orange-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
