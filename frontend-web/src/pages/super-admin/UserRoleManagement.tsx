import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  EmptyState,
  PAGE_SIZE,
  SectionShell,
  StatusPill,
} from './shared';
import { userService } from '../../services/user.service';
import type { UserResponse, UserStatus, CreateUserRequest } from '../../types/api.types';

const roleMap: Record<string, { label: string; color: string }> = {
  'ROLE_ADMIN': { label: 'Admin Hệ Thống', color: 'bg-slate-950 text-white' },
  'ROLE_OWNER': { label: 'Chủ Nhà', color: 'bg-cyan-100 text-cyan-800' },
  'ROLE_MANAGER': { label: 'Quản Lý', color: 'bg-indigo-100 text-indigo-700' },
  'ROLE_TENANT': { label: 'Khách thuê', color: 'bg-emerald-100 text-emerald-700' },
  'ROLE_USER': { label: 'Khách hàng', color: 'bg-amber-100 text-amber-700' },
};

const statusMap: Record<string, { label: string; color: string; dot: string }> = {
  'ACTIVE': { label: 'Đang hoạt động', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  'INACTIVE': { label: 'Chưa kích hoạt', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  'PENDING': { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  'DISABLE': { label: 'Vô hiệu hóa', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

const EMPTY_FORM: CreateUserRequest = {
  username: '',
  password: '',
  phoneNumber: '',
  role: 'ROLE_MANAGER',
};

export const UserRoleManagement = () => {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserRequest>(EMPTY_FORM);
  const [createError, setCreateError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await userService.getAllUsers();
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    return users.filter(user => {
      const matchesSearch = !keyword || [user.username, user.phoneNumber]
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

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createForm.username.trim()) return setCreateError('Vui lòng nhập tên đăng nhập.');
    if (createForm.password.length < 6) return setCreateError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (!createForm.phoneNumber?.trim()) return setCreateError('Vui lòng nhập số điện thoại.');

    setIsSubmitting(true);
    setCreateError('');
    try {
      await userService.createUser(createForm);
      setShowCreateModal(false);
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setCreateError(err.response?.data?.message || 'Có lỗi xảy ra khi tạo tài khoản');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateUserStatus = async (userId: string, nextStatus: UserStatus) => {
    try {
      await userService.changeStatus(userId, nextStatus);
      fetchUsers();
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, status: nextStatus } : prev);
      }
    } catch (err) {
      alert('Lỗi khi cập nhật trạng thái');
    }
  };

  return (
    <div className="space-y-6">
      <SectionShell
        title="Quản lý Người dùng & Phân quyền"
        subtitle="Xem toàn bộ users, tạo tài khoản quản lý mới, vô hiệu hóa hoặc thay đổi trạng thái"
        icon={Users}
        action={
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Tạo tài khoản
          </button>
        }
      >
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={userSearch}
              onChange={event => { setUserSearch(event.target.value); setCurrentPage(1); }}
              className="input-field pl-9"
              placeholder="Tìm theo username, số điện thoại..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={event => { setRoleFilter(event.target.value); setCurrentPage(1); }}
              className="input-field w-48"
            >
              <option value="all">Tất cả vai trò</option>
              {Object.entries(roleMap).map(([role, cfg]) => <option key={role} value={role}>{cfg.label}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={event => { setStatusFilter(event.target.value); setCurrentPage(1); }}
              className="input-field w-44"
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(statusMap).map(([status, cfg]) => <option key={status} value={status}>{cfg.label}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3">Tài khoản (Username)</th>
                <th className="px-4 py-3">Số điện thoại</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">Đang tải dữ liệu...</td>
                </tr>
              ) : pagedUsers.map(user => {
                const status = statusMap[user.status] || { label: user.status, color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
                const role = roleMap[user.role] || { label: user.role, color: 'bg-slate-100 text-slate-600' };

                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{user.username}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{user.id.split('-')[0]}...</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {user.phoneNumber || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill label={role.label} color={role.color} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill label={status.label} color={status.color} dot={status.dot} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setSelectedUser(user)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="Chi tiết">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => updateUserStatus(user.id, user.status === 'ACTIVE' ? 'DISABLE' : 'ACTIVE')} className={`rounded-lg p-2 ${user.status === 'ACTIVE' ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`} title={user.status === 'ACTIVE' ? 'Vô hiệu hóa' : 'Kích hoạt'}>
                          {user.status === 'ACTIVE' ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && pagedUsers.length === 0 && <EmptyState text="Không tìm thấy user phù hợp bộ lọc hiện tại." />}

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

      {/* Modal Tạo User */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Đóng modal" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-lg font-black text-slate-950">Tạo tài khoản mới</h3>
                <p className="text-sm text-slate-500 font-medium">Thêm Quản lý (Manager) hoặc Chủ nhà</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-5 p-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tên đăng nhập (Username) *</span>
                <input
                  value={createForm.username}
                  onChange={e => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                  className="input-field"
                  placeholder="manager01"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Số điện thoại *</span>
                <input
                  value={createForm.phoneNumber || ''}
                  onChange={e => setCreateForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  className="input-field"
                  placeholder="0901234567"
                  type="tel"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Mật khẩu *</span>
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

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Phân quyền (Vai trò) *</span>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value }))}
                  className="input-field"
                >
                  {Object.entries(roleMap).map(([role, cfg]) => <option key={role} value={role}>{cfg.label}</option>)}
                </select>
              </label>

              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-100">Hủy</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary rounded-xl px-6 py-2.5 flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                  <Plus className="h-5 w-5" />
                  {isSubmitting ? 'Đang lưu...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xem Chi Tiết */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Đóng modal" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setSelectedUser(null)} />
          <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-lg font-black text-slate-950">Chi tiết tài khoản</h3>
              </div>
              <button onClick={() => setSelectedUser(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 p-6">
              <div className="rounded-2xl bg-slate-50 p-5 border border-slate-100 text-center">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 font-black text-2xl flex items-center justify-center rounded-full mx-auto mb-3">
                  {selectedUser.username.charAt(0).toUpperCase()}
                </div>
                <p className="text-xl font-black text-slate-950">{selectedUser.username}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{selectedUser.phoneNumber}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-bold mb-1">Vai trò</p>
                  <StatusPill label={roleMap[selectedUser.role]?.label || selectedUser.role} color={roleMap[selectedUser.role]?.color || 'bg-slate-100 text-slate-700'} />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-bold mb-1">Trạng thái</p>
                  <StatusPill label={statusMap[selectedUser.status]?.label || selectedUser.status} color={statusMap[selectedUser.status]?.color || 'bg-slate-100 text-slate-700'} dot={statusMap[selectedUser.status]?.dot} />
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                <button onClick={() => updateUserStatus(selectedUser.id, 'ACTIVE')} className="btn-primary w-full py-2.5 rounded-xl font-bold">Kích hoạt tài khoản</button>
                <button onClick={() => updateUserStatus(selectedUser.id, 'DISABLE')} className="w-full py-2.5 rounded-xl font-bold bg-rose-50 text-rose-700 hover:bg-rose-100">Vô hiệu hóa</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
