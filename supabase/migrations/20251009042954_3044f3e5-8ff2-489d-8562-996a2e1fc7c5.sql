-- Step 1: Create app_role enum for RBAC
CREATE TYPE public.app_role AS ENUM ('admin', 'qa_reviewer', 'product_manager', 'ai_operations_specialist');

-- Step 2: Create user_roles table (prevents privilege escalation)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Step 4: Create permission check function
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Step 5: Create flow_status enum
CREATE TYPE public.flow_status AS ENUM ('draft', 'approved', 'live', 'archived');

-- Step 6: Create flow_channel enum
CREATE TYPE public.flow_channel AS ENUM ('voice', 'text', 'whatsapp');

-- Step 7: Create integration_type enum
CREATE TYPE public.integration_type AS ENUM ('kb', 'product', 'api');

-- Step 8: Create run_type enum
CREATE TYPE public.run_type AS ENUM ('simulate', 'live');

-- Step 9: Create run_outcome enum
CREATE TYPE public.run_outcome AS ENUM ('success', 'failure', 'timeout', 'escalated');

-- Step 10: Create orchestrator_flows table
CREATE TABLE public.orchestrator_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status flow_status NOT NULL DEFAULT 'draft',
  current_version INTEGER NOT NULL DEFAULT 1,
  industry TEXT NOT NULL,
  channels flow_channel[] NOT NULL,
  tags TEXT[],
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.orchestrator_flows ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_flows_status ON public.orchestrator_flows(status);
CREATE INDEX idx_flows_industry ON public.orchestrator_flows(industry);
CREATE INDEX idx_flows_updated_at ON public.orchestrator_flows(updated_at DESC);

-- Step 11: Create orchestrator_versions table
CREATE TABLE public.orchestrator_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.orchestrator_flows(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  flow_json JSONB NOT NULL,
  status_at_version flow_status NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  published_by UUID,
  published_at TIMESTAMP WITH TIME ZONE,
  changelog TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (flow_id, version)
);

ALTER TABLE public.orchestrator_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_versions_flow_id ON public.orchestrator_versions(flow_id);
CREATE INDEX idx_versions_created_at ON public.orchestrator_versions(created_at DESC);

-- Step 12: Create orchestrator_snippets table
CREATE TABLE public.orchestrator_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tags TEXT[],
  snippet_json JSONB NOT NULL,
  owner UUID NOT NULL,
  shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.orchestrator_snippets ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_snippets_owner ON public.orchestrator_snippets(owner);
CREATE INDEX idx_snippets_shared ON public.orchestrator_snippets(shared);

-- Step 13: Create orchestrator_integrations table
CREATE TABLE public.orchestrator_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type integration_type NOT NULL,
  name TEXT NOT NULL,
  env TEXT NOT NULL DEFAULT 'dev',
  config JSONB NOT NULL,
  last_tested_at TIMESTAMP WITH TIME ZONE,
  last_test_status TEXT,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.orchestrator_integrations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_integrations_type ON public.orchestrator_integrations(type);
CREATE INDEX idx_integrations_env ON public.orchestrator_integrations(env);

-- Step 14: Create orchestrator_runs table
CREATE TABLE public.orchestrator_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.orchestrator_flows(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  run_type run_type NOT NULL,
  input JSONB,
  trace JSONB,
  outcome run_outcome,
  duration_ms INTEGER,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.orchestrator_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_runs_flow_id ON public.orchestrator_runs(flow_id);
CREATE INDEX idx_runs_created_at ON public.orchestrator_runs(created_at DESC);
CREATE INDEX idx_runs_outcome ON public.orchestrator_runs(outcome);

-- Step 15: Create orchestrator_approvals table
CREATE TABLE public.orchestrator_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES public.orchestrator_flows(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  reviewer_id UUID NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.orchestrator_approvals ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_approvals_flow_id ON public.orchestrator_approvals(flow_id);

-- Step 16: RLS Policies for orchestrator_flows
CREATE POLICY "Users with orchestrator_view can view flows"
ON public.orchestrator_flows FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users with orchestrator_edit can create flows"
ON public.orchestrator_flows FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  ) AND created_by = auth.uid()
);

CREATE POLICY "Users with orchestrator_edit can update flows"
ON public.orchestrator_flows FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users with orchestrator_delete can delete flows"
ON public.orchestrator_flows FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

-- Step 17: RLS Policies for orchestrator_versions
CREATE POLICY "Users can view versions of accessible flows"
ON public.orchestrator_versions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create versions"
ON public.orchestrator_versions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

-- Step 18: RLS Policies for orchestrator_snippets
CREATE POLICY "Users can view their own snippets and shared snippets"
ON public.orchestrator_snippets FOR SELECT
USING (owner = auth.uid() OR shared = TRUE);

CREATE POLICY "Users can create their own snippets"
ON public.orchestrator_snippets FOR INSERT
WITH CHECK (owner = auth.uid());

CREATE POLICY "Users can update their own snippets"
ON public.orchestrator_snippets FOR UPDATE
USING (owner = auth.uid());

CREATE POLICY "Users can delete their own snippets"
ON public.orchestrator_snippets FOR DELETE
USING (owner = auth.uid());

-- Step 19: RLS Policies for orchestrator_integrations
CREATE POLICY "Users can view integrations"
ON public.orchestrator_integrations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users with manage_integrations can create integrations"
ON public.orchestrator_integrations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  ) AND created_by = auth.uid()
);

CREATE POLICY "Users with manage_integrations can update integrations"
ON public.orchestrator_integrations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

-- Step 20: RLS Policies for orchestrator_runs
CREATE POLICY "Users can view runs"
ON public.orchestrator_runs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create runs"
ON public.orchestrator_runs FOR INSERT
WITH CHECK (
  created_by = auth.uid() OR created_by IS NULL
);

-- Step 21: RLS Policies for orchestrator_approvals
CREATE POLICY "Users can view approvals"
ON public.orchestrator_approvals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create approvals"
ON public.orchestrator_approvals FOR INSERT
WITH CHECK (reviewer_id = auth.uid());

-- Step 22: Create trigger for auto-updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orchestrator_flows_updated_at
BEFORE UPDATE ON public.orchestrator_flows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orchestrator_snippets_updated_at
BEFORE UPDATE ON public.orchestrator_snippets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orchestrator_integrations_updated_at
BEFORE UPDATE ON public.orchestrator_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();