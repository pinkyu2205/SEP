import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Contact,
  Eye,
  EyeOff,
  Fingerprint,
  Info,
  Lock,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  EmptyState,
  PAGE_SIZE,
  SectionShell,
  StatusPill,
} from './shared';
import { userService } from '@/services/user.service';
import { propertyService } from '@/services/property.service';
import { hostService, type HostContractDto } from '@/services/host.service';
import { UserDetailDrawer } from './users/UserDetailDrawer';
import type { UserResponse, UserStatus, CreateUserRequest } from '@/types/api.types';

// Hệ thống CHỈ có 4 role (mỗi role = 1 loại tài khoản):
//   admin=ROLE_ADMIN · host=ROLE_OWNER (Chủ nhà) · manager=ROLE_MANAGER · tenant=ROLE_TENANT (Khách thuê).
// 'guest' chỉ là người xem trang public — KHÔNG có account/role.
const roleMap: Record<string, { label: string; color: string }> = {
  'ROLE_ADMIN': { label: 'Admin Hệ Thống', color: 'bg-slate-950 text-white' },
  'ROLE_OWNER': { label: 'Chủ Nhà', color: 'bg-cyan-100 text-cyan-800' },
  'ROLE_MANAGER': { label: 'Quản Lý', color: 'bg-indigo-100 text-indigo-700' },
  'ROLE_TENANT': { label: 'Khách thuê', color: 'bg-emerald-100 text-emerald-700' },
};

// Admin (quyền cao nhất) tạo được cả 4 role trên.
const CREATABLE_ROLES = ['ROLE_ADMIN', 'ROLE_OWNER', 'ROLE_MANAGER', 'ROLE_TENANT'] as const;

const statusMap: Record<string, { label: string; color: string; dot: string }> = {
  'ACTIVE': { label: 'Đang hoạt động', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  'INACTIVE': { label: 'Chưa kích hoạt', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  'PENDING': { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  'DISABLE': { label: 'Vô hiệu hóa', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

// Hồ sơ bổ sung hiển thị theo từng vai trò khi admin tạo tài khoản.
type ExtraField = 'fullName' | 'email' | 'cccd';

// /auth/register CHỈ lưu username/password/phoneNumber/role/fullName.
// Ẩn 'email' và 'cccd' khỏi form vì register bỏ qua (không lưu) → điền vô vô nghĩa, dễ hiểu lầm.
// CCCD của khách thuê nhập ở luồng Onboarding khách thuê, không phải ở màn tạo account này.
const ROLE_EXTRA_FIELDS: Record<string, ExtraField[]> = {
  ROLE_ADMIN: ['fullName'],
  ROLE_MANAGER: ['fullName'],
  ROLE_OWNER: ['fullName'],
  ROLE_TENANT: ['fullName'],
};

const EXTRA_FIELD_CONFIG: Record<ExtraField, { label: string; placeholder: string; type: string; icon: LucideIcon }> = {
  fullName: { label: 'Họ và tên', placeholder: 'VD: Nguyễn Văn A', type: 'text', icon: Contact },
  email: { label: 'Email', placeholder: 'email@example.com', type: 'email', icon: Mail },
  cccd: { label: 'CCCD / CMND', placeholder: '079xxxxxxxxx', type: 'text', icon: Fingerprint },
};

// Input có icon ở đầu, dùng chung cho form tạo tài khoản.
const IconField = ({
  label,
  required,
  icon: Icon,
  className = '',
  ...rest
}: {
  label: string;
  required?: boolean;
  icon: LucideIcon;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className={`block ${className}`}>
    <span className="mb-1.5 block text-sm font-bold text-slate-700">
      {label}
      {required && <span className="text-rose-500"> *</span>}
    </span>
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input {...rest} className="input-field pl-10" />
    </div>
  </label>
);

const EMPTY_FORM: CreateUserRequest = {
  username: '',
  password: '',
  phoneNumber: '',
  role: 'ROLE_MANAGER',
  fullName: '',
  email: '',
  cccd: '',
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

  /**
   * Tên thật của người dùng phải tra từ nguồn khác: `UserResponse` của BE CHỈ có
   * username/phone/role/status, KHÔNG có fullName (xem api.types.ts). Với khách thuê thì
   * username lại chính là số điện thoại nên cột tên và cột SĐT trùng nhau y hệt.
   *   • Quản lý  → GET /user/managers trả kèm fullName, khớp theo id
   *   • Khách thuê → lấy `lesseeName` trên hợp đồng, khớp theo số điện thoại
   * Không tra được thì mới rơi về username (admin & chủ nhà không có nguồn nào).
   *
   * 👉 XOÁ TOÀN BỘ chỗ này khi BE thêm `fullName` vào UserResponse —
   *    xem doc/BE-NEED-user-fullname-2026-08-14.md
   */
  const [nameById, setNameById] = useState<Map<string, string>>(new Map());
  const [nameByPhone, setNameByPhone] = useState<Map<string, string>>(new Map());

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

  // Tra tên chạy song song và được phép hỏng — hỏng thì bảng vẫn hiện, chỉ là rơi về username.
  const fetchNames = async () => {
    const [mgrs, ctrs] = await Promise.all([
      propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
      hostService.listContracts({ size: 500 }).then(p => p.content).catch(() => [] as HostContractDto[]),
    ]);

    const byId = new Map<string, string>();
    mgrs.forEach(m => { if (m.fullName?.trim()) byId.set(m.id, m.fullName.trim()); });
    setNameById(byId);

    const byPhone = new Map<string, string>();
    ctrs.forEach(c => {
      const phone = c.tenantPhone?.trim();
      const name = c.lesseeName?.trim();
      // HĐ chấm dứt bị BE gỡ tên khách → bỏ qua, đừng ghi đè tên đã lấy được từ HĐ khác.
      if (phone && name && !byPhone.has(phone)) byPhone.set(phone, name);
    });
    setNameByPhone(byPhone);
  };

  /** Tên hiển thị của một tài khoản — null nghĩa là không tra được. */
  const realNameOf = (user: UserResponse): string | null =>
    nameById.get(user.id) ?? (user.phoneNumber ? nameByPhone.get(user.phoneNumber.trim()) ?? null : null);

  useEffect(() => {
    fetchUsers();
    fetchNames();
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    return users.filter(user => {
      const matchesSearch = !keyword || [user.username, user.phoneNumber, realNameOf(user)]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(keyword));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, statusFilter, userSearch, users, nameById, nameByPhone]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Chỉ gửi các field hồ sơ phù hợp với vai trò đang chọn (và có nhập).
      const extras = ROLE_EXTRA_FIELDS[createForm.role] || [];
      const payload: CreateUserRequest = {
        username: createForm.username.trim(),
        password: createForm.password,
        phoneNumber: createForm.phoneNumber?.trim(),
        role: createForm.role,
      };
      if (extras.includes('fullName') && createForm.fullName?.trim()) payload.fullName = createForm.fullName.trim();
      if (extras.includes('email') && createForm.email?.trim()) payload.email = createForm.email.trim();
      if (extras.includes('cccd') && createForm.cccd?.trim()) payload.cccd = createForm.cccd.trim();

      await userService.createUser(payload);
      setShowCreateModal(false);
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      // register trả lỗi dạng { error, fieldErrors:{...} }; login/user trả { message }.
      const data = err.response?.data;
      const fieldErr = data?.fieldErrors ? Object.values(data.fieldErrors)[0] as string : undefined;
      setCreateError(data?.message || data?.error || fieldErr || 'Có lỗi xảy ra khi tạo tài khoản');
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
              placeholder="Tìm theo tên, username, số điện thoại..."
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
                <th className="px-4 py-3">Người dùng</th>
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
                const realName = realNameOf(user);

                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      {/* CHỈ hiện tên người dùng — không kèm username. Username (với khách thuê
                          chính là SĐT) trùng cột bên cạnh, in ra chỉ tổ lặp. Cần username thì
                          mở drawer chi tiết, nó nằm ở hàng thông tin tài khoản. */}
                      <p className="font-bold text-slate-900">{realName ?? user.username}</p>
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
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-white p-6">
              <div className="flex items-start gap-3.5">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-950">Tạo tài khoản mới</h3>
                  <p className="mt-0.5 text-sm font-medium text-slate-500">Tạo tài khoản cho mọi vai trò trong hệ thống</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body (cuộn được) */}
            <form id="create-user-form" onSubmit={handleCreateSubmit} className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Nhóm: Thông tin đăng nhập */}
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Thông tin đăng nhập</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <IconField
                    label="Tên đăng nhập"
                    required
                    icon={User}
                    value={createForm.username}
                    onChange={e => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="manager01"
                  />
                  <IconField
                    label="Số điện thoại"
                    required
                    icon={Phone}
                    type="tel"
                    value={createForm.phoneNumber || ''}
                    onChange={e => setCreateForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    placeholder="0901234567"
                  />
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Mật khẩu <span className="text-rose-500">*</span></span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={createForm.password}
                      onChange={e => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                      className="input-field pl-10 pr-10"
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
              </div>

              {/* Nhóm: Phân quyền & hồ sơ */}
              <div className="space-y-4 border-t border-slate-100 pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Phân quyền & hồ sơ</p>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Vai trò <span className="text-rose-500">*</span></span>
                  <div className="relative">
                    <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={createForm.role}
                      onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value }))}
                      className="input-field pl-10"
                    >
                      {CREATABLE_ROLES.map(role => <option key={role} value={role}>{roleMap[role].label}</option>)}
                    </select>
                  </div>
                  <span className="mt-2 inline-block">
                    <StatusPill
                      label={roleMap[createForm.role]?.label || createForm.role}
                      color={roleMap[createForm.role]?.color || 'bg-slate-100 text-slate-700'}
                    />
                  </span>
                </label>

                {/* Hồ sơ bổ sung theo vai trò đang chọn */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(ROLE_EXTRA_FIELDS[createForm.role] || []).map(field => {
                    const cfg = EXTRA_FIELD_CONFIG[field];
                    return (
                      <IconField
                        key={field}
                        label={cfg.label}
                        icon={cfg.icon}
                        type={cfg.type}
                        value={createForm[field] || ''}
                        onChange={e => setCreateForm(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={cfg.placeholder}
                        className={field === 'fullName' ? 'sm:col-span-2' : ''}
                      />
                    );
                  })}
                </div>

                {createForm.role === 'ROLE_TENANT' && (
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <Info className="h-5 w-5 flex-shrink-0 text-amber-500" />
                    <p>
                      Đây là tài khoản đăng nhập độc lập. Để gắn khách thuê vào phòng kèm hợp đồng (giá thuê, cọc, ngày vào ở),
                      hãy dùng chức năng <strong>Onboarding khách thuê</strong> ở phần Quản lý nhà.
                    </p>
                  </div>
                )}
              </div>

              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {createError}
                </div>
              )}
            </form>

            {/* Footer (cố định) */}
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-4">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl px-5 py-2.5 font-bold text-slate-600 transition hover:bg-slate-200/60">Hủy</button>
              <button type="submit" form="create-user-form" disabled={isSubmitting} className="btn-primary flex items-center gap-2 rounded-xl px-6 py-2.5 shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                <Plus className="h-5 w-5" />
                {isSubmitting ? 'Đang lưu...' : 'Tạo tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chi tiết tài khoản — vai trò hiện tại trong hệ thống + lịch sử phân công */}
      {selectedUser && (
        <UserDetailDrawer
          key={selectedUser.id}
          user={selectedUser}
          displayName={realNameOf(selectedUser)}
          onClose={() => setSelectedUser(null)}
          onStatusChange={(id, status) => updateUserStatus(id, status)}
        />
      )}
    </div>
  );
};
