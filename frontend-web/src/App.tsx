import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HostLayout } from './layouts/HostLayout';
import { Dashboard } from './pages/dashboard/Dashboard';
import { PropertyList } from './pages/properties/PropertyList';
import { PropertyDetail } from './pages/properties/PropertyDetail';
import { TenantList } from './pages/tenants/TenantList';
import { ManagerList } from './pages/managers/ManagerList';
import { ContractList } from './pages/contracts/ContractList';
import { EquipmentList } from './pages/equipments/EquipmentList';
import { MaintenanceList } from './pages/maintenance/MaintenanceList';
import { FinancialManagement } from './pages/financial/FinancialManagement';
import { ReportsAnalytics } from './pages/reports/ReportsAnalytics';
import { NotificationCenter } from './pages/notifications/NotificationCenter';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<HostLayout />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/properties" element={<PropertyList />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />

          <Route path="/operations-managers" element={<ManagerList />} />
          <Route path="/managers" element={<ManagerList />} />

          <Route path="/tenants" element={<TenantList />} />

          <Route path="/contracts" element={<ContractList />} />

          <Route path="/maintenance" element={<MaintenanceList />} />

          <Route path="/financial" element={<FinancialManagement />} />

          <Route path="/equipments" element={<EquipmentList />} />

          <Route path="/reports" element={<ReportsAnalytics />} />

          <Route path="/notifications" element={<NotificationCenter />} />

          <Route
            path="/settings"
            element={
              <div className="p-6">
                <h1 className="text-2xl font-bold text-slate-900">Cài đặt</h1>
                <p className="text-slate-500 mt-2">Cấu hình hệ thống — tính năng đang phát triển.</p>
              </div>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
