import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';

import Dashboard from '@/pages/dashboard';
import TaskQueue from '@/pages/tasks/index';
import DeployTask from '@/pages/tasks/new';
import TaskDetail from '@/pages/tasks/detail';
import Agents from '@/pages/agents';
import Models from '@/pages/models';
import MemoryGraph from '@/pages/memory';
import ConfigCenter from '@/pages/settings';
import MayaPage from '@/pages/maya/index';
import TradingPage from '@/pages/trading';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={MayaPage} />
        <Route path="/maya" component={MayaPage} />
        <Route path="/trading" component={TradingPage} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/tasks/new" component={DeployTask} />
        <Route path="/tasks/:id" component={TaskDetail} />
        <Route path="/tasks" component={TaskQueue} />
        <Route path="/agents" component={Agents} />
        <Route path="/models" component={Models} />
        <Route path="/memory" component={MemoryGraph} />
        <Route path="/settings" component={ConfigCenter} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
