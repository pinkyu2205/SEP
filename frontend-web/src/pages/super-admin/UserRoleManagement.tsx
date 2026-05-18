import { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  Search,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import type { PlatformAccountStatus, PlatformRole, PlatformUser } from '../../types';
import { ROLE_SCOPE_RULES } from '../../types';
import { PLATFORM_HOSTS, PLATFORM_USERS, SUPER_ADMIN_PERMISSIONS } from '../../utils/superAdminMockData';
import {
  EmptyState,
  PAGE_SIZE,
  SectionShell,
  StatusPill,
  accountStatusMap,
  roleConfig,
} from './shared';

interface CreateUserForm {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: PlatformRole;
  hostId: string;
  districts: string;
}

const EMPTY_FORM: CreateUserForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  role: 'manager',
  hostId: PLATFORM_HOSTS[0]?.id ?? '',
  districts: '',
};

export const UserRoleManagement = () => {
  const [users, setUsers] = useState<PlatformUser[]>(PLATFORM_USERS);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | PlatformRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PlatformAccountStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_FORM);
  const [createError, setCreateError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    return users.filter(user => {
      const matchesSearch = !keyword || [user.fullName, user.email, user.phone, user.hostName, user.assignedScope]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(keyword));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, statusFilter, userSearch, users]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreateModal = () => {
    setCreateForm(EMPTY_FORM);
    setCreateError('');
    setShowPassword(false);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!createForm.fullName.trim()) return setCreateError('Vui lòng nhập họ tên.');
    if (!createForm.email.trim() || !createForm.email.includes('@')) return setCreateError('Email không hợp lệ.');
    if (!createForm.phone.trim()) return setCreateError('Vui lòng nhập số điện thoại.');
    if (createForm.password.length < 6) return setCreateError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (createForm.role === 'host' && !createForm.districts.trim()) return setCreateError('Vui lòng nhập khu vực hoạt động.');
    if (users.some(u => u.email.toLowerCase() === createForm.email.trim().toLowerCase())) {
      return setCreateError('Email này đã tồn tại trong hệ thống.');
    }

    const selectedHost = PLATFORM_HOSTS.find(h => h.id === createForm.hostId);
    const nextId = `user-${Date.now()}`;

    const newUser: PlatformUser = {
      id: nextId,
      fullName: createForm.fullName.trim(),
      email: createForm.email.trim(),
      phone: createForm.phone.trim(),
      role: createForm.role,
      status: 'pending_approval',
      ...(createForm.role === 'host' && {
        assignedScope: createForm.districts.trim(),
        scopeDetail: '0 buildings · 0 rooms',
      }),
      ...(createForm.role === 'manager' && {
        hostId: selectedHost?.id,
        hostName: selectedHost?.businessName,
        assignedScope: selectedHost?.districts ?? 'Chờ phân quyền',
        scopeDetail: `${selectedHost?.buildings ?? 0} buildings · ${selectedHost?.rooms ?? 0} rooms`,
      }),
      ...(createForm.role === 'super_admin' && {
        assignedScope: 'Toàn nền tảng',
      }),
      createdAt: new Date().toISOString().slice(0, 10),
      lastLoginAt: 'Chưa đăng nhập',
    };

    setUsers(prev => [newUser, ...prev]);
    setCurrentPage(1);
    setShowCreateModal(false);
    setSelectedUser(newUser);
  };

  const updateUserStatus = (userId: string, nextStatus: PlatformAccountStatus) => {
    setUsers(prev => prev.map(user => user.id === userId ? { ...user, status: nextStatus } : user));
    setSelectedUser(prev => prev?.id === userId ? { ...prev, status: nextStatus } : prev);
  };

  const updateUserRole = (userId: string, role: PlatformRole) => {
    setUsers(prev => prev.map(user => user.id === userId ? { ...user, role } : user));
    setSelectedUser(prev => prev?.id === userId ? { ...prev, role } : prev);
  };

  return (
    <div className="space-y-6">
      <SectionShell
        title="User & Role Management"
        subtitle="Xem toàn bộ users, tạo tài khoản, đổi vai trò, khóa/mở khóa, kích hoạt/vô hiệu hóa và reset mật khẩu"
        icon={Users}
        action={
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Tạo tài khoản
          </button>
        }
      >
        <div className="mb-5 grid gap-3 lg:grid-cols-4">
          {Object.entries(SUPER_ADMIN_PERMISSIONS).map(([role, cfg]) => (
            <div key={role} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <StatusPill label={cfg.label} color={roleConfig[role as PlatformRole].color} />
                <span className="text-xs font-black text-slate-400">#{cfg.rank}</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">{ROLE_SCOPE_RULES[role as PlatformRole]}</p>
              <p className="mt-3 text-xs font-bold text-slate-900">{cfg.permissions.length || 1} permission scope</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={userSearch}
              onChange={event => { setUserSearch(event.target.value); setCurrentPage(1); }}
              className="input-field pl-9"
              placeholder="Tìm theo tên, email, số điện thoại, Host hoặc phạm vi..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={event => { setRoleFilter(event.target.value as 'all' | PlatformRole); setCurrentPage(1); }}
              className="input-field w-48"
            >
              <option value="all">Tất cả vai trò</option>
              {Object.entries(roleConfig).map(([role, cfg]) => <option key={role} value={role}>{cfg.label}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={event => { setStatusFilter(event.target.value as 'all' | PlatformAccountStatus); setCurrentPage(1); }}
              className="input-field w-44"
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(accountStatusMap).map(([status, cfg]) => <option key={status} value={status}>{cfg.label}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedUsers.map(user => {
                const status = accountStatusMap[user.status];
                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{user.fullName}</p>
                      <p className="text-xs text-slate-500">{user.email} · {user.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill label={roleConfig[user.role].label} color={roleConfig[user.role].color} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill label={status.label} color={status.color} dot={status.dot} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="font-medium text-slate-800">{user.assignedScope ?? 'Toàn nền tảng'}</p>
                      {user.scopeDetail && <p className="text-xs text-slate-500">{user.scopeDetail}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{user.lastLoginAt ?? 'Chưa đăng nhập'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setSelectedUser(user)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Xem / chỉnh sửa">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => updateUserStatus(user.id, user.status === 'locked' ? 'active' : 'locked')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={user.status === 'locked' ? 'Mở khóa' : 'Khóa'}>
                          {user.status === 'locked' ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </button>
                        <button onClick={() => updateUserStatus(user.id, user.status === 'inactive' ? 'active' : 'inactive')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={user.status === 'inactive' ? 'Kích hoạt' : 'Vô hiệu hóa'}>
                          {user.status === 'inactive' ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                        </button>
                        <button onClick={() => window.alert(`Đã tạo yêu cầu reset mật khẩu cho ${user.fullName}`)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Reset mật khẩu">
                          <KeyRound className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagedUsers.length === 0 && <EmptyState text="Không tìm thấy user phù hợp bộ lọc hiện tại." />}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Hiển thị {pagedUsers.length} / {filteredUsers.length} users
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
              className="btn-secondary flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Trước
            </button>
            <span className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
              {safePage}/{pageCount}
            </span>
            <button
              disabled={safePage >= pageCount}
              onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))}
              className="btn-secondary flex items-center gap-1 disabled:opacity-50"
            >
              Sau
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SectionShell>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Đóng modal" className="absolute inset-0 bg-slate-950/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-black text-slate-950">Tạo tài khoản mới</h3>
                <p className="text-sm text-slate-500">Điền thông tin để tạo tài khoản cho người dùng</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Họ và tên <span className="text-rose-500">*</span></span>
                  <input
                    value={createForm.fullName}
                    onChange={e => setCreateForm(prev => ({ ...prev, fullName: e.target.value }))}
                    className="input-field"
                    placeholder="Nguyễn Văn A"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Số điện thoại <span className="text-rose-500">*</span></span>
                  <input
                    value={createForm.phone}
                    onChange={e => setCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="input-field"
                    placeholder="0901234567"
                    type="tel"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Email <span className="text-rose-500">*</span></span>
                <input
                  value={createForm.email}
                  onChange={e => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                  className="input-field"
                  placeholder="user@company.vn"
                  type="email"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Mật khẩu <span className="text-rose-500">*</span></span>
                <div className="relative">
                  <input
                    value={createForm.password}
                    onChange={e => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                    className="input-field pr-10"
                    placeholder="Ít nhất 6 ký tự"
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Vai trò</span>
                  <select
                    value={createForm.role}
                    onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value as PlatformRole, districts: '', hostId: PLATFORM_HOSTS[0]?.id ?? '' }))}
                    className="input-field"
                  >
                    {Object.entries(roleConfig).map(([role, cfg]) => <option key={role} value={role}>{cfg.label}</option>)}
                  </select>
                </label>

                {createForm.role === 'host' && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">Khu vực hoạt động <span className="text-rose-500">*</span></span>
                    <input
                      value={createForm.districts}
                      onChange={e => setCreateForm(prev => ({ ...prev, districts: e.target.value }))}
                      className="input-field"
                      placeholder="Quận 1, Quận 3..."
                    />
                  </label>
                )}

                {createForm.role === 'manager' && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">Thuộc Host <span className="text-rose-500">*</span></span>
                    <select
                      value={createForm.hostId}
                      onChange={e => setCreateForm(prev => ({ ...prev, hostId: e.target.value }))}
                      className="input-field"
                    >
                      {PLATFORM_HOSTS.map(h => (
                        <option key={h.id} value={h.id}>{h.ownerName}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-700">Permission scope của vai trò <span className="font-black text-slate-900">{roleConfig[createForm.role].label}</span>:</p>
                <p className="mt-1 text-xs text-slate-600">{SUPER_ADMIN_PERMISSIONS[createForm.role].scope}</p>
              </div>

              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Hủy</button>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Tạo tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Đóng modal" className="absolute inset-0 bg-slate-950/50" onClick={() => setSelectedUser(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-black text-slate-950">Quản lý tài khoản</h3>
                <p className="text-sm text-slate-500">Chỉnh vai trò, quyền truy cập và trạng thái tài khoản</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xl font-black text-slate-950">{selectedUser.fullName}</p>
                <p className="mt-1 text-sm text-slate-600">{selectedUser.email} · {selectedUser.phone}</p>
                <p className="mt-1 text-xs text-slate-500">{selectedUser.assignedScope ?? 'Toàn nền tảng'}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Role</span>
                  <select value={selectedUser.role} onChange={event => updateUserRole(selectedUser.id, event.target.value as PlatformRole)} className="input-field">
                    {Object.entries(roleConfig).map(([role, cfg]) => <option key={role} value={role}>{cfg.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Account status</span>
                  <select value={selectedUser.status} onChange={event => updateUserStatus(selectedUser.id, event.target.value as PlatformAccountStatus)} className="input-field">
                    {Object.entries(accountStatusMap).map(([status, cfg]) => <option key={status} value={status}>{cfg.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-900">Permission scope</p>
                <p className="mt-1 text-sm text-slate-600">{SUPER_ADMIN_PERMISSIONS[selectedUser.role].scope}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUPER_ADMIN_PERMISSIONS[selectedUser.role].permissions.length > 0 ? (
                    SUPER_ADMIN_PERMISSIONS[selectedUser.role].permissions.map(permission => (
                      <span key={permission} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{permission}</span>
                    ))
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">tenant.self_access</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => updateUserStatus(selectedUser.id, 'active')} className="btn-primary">Activate</button>
                <button onClick={() => updateUserStatus(selectedUser.id, 'inactive')} className="btn-secondary">Deactivate</button>
                <button onClick={() => updateUserStatus(selectedUser.id, selectedUser.status === 'locked' ? 'active' : 'locked')} className="btn-secondary">{selectedUser.status === 'locked' ? 'Unlock' : 'Lock'}</button>
                <button onClick={() => window.alert(`Đã gửi link reset mật khẩu tới ${selectedUser.email}`)} className="btn-secondary">Reset password</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
