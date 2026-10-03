# 3.2 Web Application

> **Scope note.** The Hoang Binh Land platform is split across two clients. The **web
> application** described in this section serves three roles — **Guest** (public website,
> no account), **Admin** (system operator) and **Owner** (property owner). The two
> remaining roles, **Manager** (operations manager) and **Tenant**, work exclusively on the
> mobile application and are described in section 3.3. A Manager account that signs in on
> the web is rejected on purpose (see 3.2.2.1).
>
> Screens are grouped by role, following the order of the left navigation menu of each
> portal. Vietnamese labels are quoted exactly as they appear in the user interface.

---

## 3.2.1 `<Guest>` Public Website

### 3.2.1.1 `<Guest>` View home page

- **Function trigger:** Guest opens the website root URL `/`.
- **Function description:** The home page introduces Hoang Binh Land and lets a visitor start
  looking for a place to rent without creating an account.
- **Screen layout:**

  `[Screenshot: public home page — hero banner, quick search bar, featured properties]`

- **Function details:**
  - The hero section shows the company positioning and three commitments ("Hợp đồng điện tử",
    "Giá minh bạch", "Quản lý đồng hành") together with counters for properties under
    management, tenants served and support availability.
  - A quick search bar lets the Guest pick "Khu vực", "Mức giá" and "Loại hình thuê", then
    press "Tìm kiếm".
  - The section "Bất động sản được quan tâm nhất" lists featured listings; "Xem tất cả"
    navigates to the full listing page.
  - Success: featured listings are rendered as cards showing photo, name, district, area and
    monthly rent.
  - Fail: when the public API cannot be reached, the section renders an empty state and the
    rest of the page stays usable.

### 3.2.1.2 `<Guest>` Search and filter rental listings

- **Function trigger:** Guest clicks "Xem nhà đang cho thuê" on the home page, submits the quick
  search bar, or opens `/properties` directly.
- **Function description:** This feature lets a Guest browse every property that is open for
  rent and narrow the list down to what fits their budget and location.
- **Screen layout:**

  `[Screenshot: property list page — filter panel on the left, result cards on the right]`

- **Function details:**
  - Basic filters: district ("Tất cả quận/huyện"), rental type ("Mọi loại hình"), price range
    ("Giá tối thiểu" / "Giá tối đa").
  - "Lọc nâng cao" adds area, number of bedrooms ("Số phòng ngủ") and amenities ("Tiện ích").
  - "Xóa bộ lọc" clears every criterion and reloads the full list.
  - Only properties whose listing price has already been approved and which still have a vacant
    unit are published to this page; a fully occupied property is not listed.
  - Success: matching properties are displayed as cards; clicking a card opens the detail page.
  - Fail: when nothing matches, the page shows "Không tìm thấy bất động sản phù hợp" with the
    hint "Hãy thử điều chỉnh hoặc xóa bớt bộ lọc."; when the whole catalogue is empty it shows
    "Hiện chưa có chỗ trống".

### 3.2.1.3 `<Guest>` View property detail

- **Function trigger:** Guest clicks a property card on the home page or on the listing page.
- **Function description:** This feature gives a Guest every piece of information needed to
  decide whether to call and book a viewing.
- **Screen layout:**

  `[Screenshot: property detail page — image gallery, price box, cost table, map]`

- **Function details:**
  - The page shows the image gallery, "Giá thuê", "Diện tích", "Khu vực", "Loại hình",
    "Mô tả chi tiết", "Nội thất & tiện ích" and "Vị trí trên bản đồ".
  - The block "Chi phí & điều khoản" publishes the money terms up front: "Đặt cọc",
    "Đơn giá điện", "Đơn giá nước", "Phí dịch vụ" and, for a room-by-room property,
    "Số phòng trong dãy".
  - The block "Cam kết từ Hoàng Bình Land" states that the listing is verified and operated
    directly by the company, with viewing support available 24/7.
  - A compact contact card repeats the hotline so the Guest can call from this page.
  - "Bất động sản tương tự" suggests other listings in the same area.
  - Success: full detail is rendered.
  - Fail: if the property has just been rented or taken down, the page shows "Không tìm thấy
    bất động sản" and explains the listing may already be rented.

### 3.2.1.4 `<Guest>` Contact the company

- **Function trigger:** Guest clicks "Liên hệ tư vấn" in the header, the hero section, or the
  contact card of a detail page.
- **Function description:** This feature routes an interested visitor to a real person.
- **Screen layout:**

  `[Screenshot: contact page — hotline card and office address]`

- **Function details:**
  - The page shows the hotline and the office address. Pressing "Gọi ngay <hotline>" opens the
    phone dialler on a mobile browser.
  - No web enquiry form is offered on purpose: the system does not promise a callback it cannot
    track. Every enquiry enters the system through the hotline.

### 3.2.1.5 `<Guest>` Payment result page

- **Function trigger:** The payment gateway redirects the browser to `/payment-success` or
  `/payment-cancel` after a tenant pays an invoice from the mobile application.
- **Function description:** This page tells the payer what happened and sends them back to the app.
- **Screen layout:**

  `[Screenshot: payment result page — success state and cancelled state]`

- **Function details:**
  - Success: the page shows "Thanh toán thành công", the order code, and the note "Cảm ơn bạn.
    Hoá đơn sẽ được cập nhật trạng thái đã thanh toán trong ít phút."
  - Fail / cancelled: the page shows "Đã huỷ thanh toán" and "Giao dịch chưa được thực hiện.
    Bạn có thể quay lại ứng dụng và thanh toán lại bất cứ lúc nào."
  - Both states offer "Về trang chủ". This page is a landing target only; it never changes the
    invoice state by itself — the backend does that when the gateway calls back.

---

## 3.2.2 `<Guest>` Authentication / Authorization

### 3.2.2.1 `<Guest>` Login

- **Function trigger:** Guest opens `/login` (or is redirected there when opening a protected
  URL), fills in "Tên đăng nhập" and "Mật khẩu", then clicks "Đăng nhập".
- **Function description:** Guests log into the administration console so that the system can
  identify their role and open the portal that belongs to that role.
- **Screen layout:**

  `[Screenshot: login page — brand panel on the left, credential form on the right]`

- **Function details:**
  - The password field can be toggled with the "Hiện mật khẩu" / "Ẩn mật khẩu" control.
  - The button shows "Đang đăng nhập..." while the request is in flight; typing in either field
    clears the previous error message.
  - The backend returns a JWT token and the account role; the token is stored so that every
    later API call carries it as a Bearer token.
  - Success:
    - Role `ROLE_ADMIN` → the user is redirected to the admin portal `/admin`.
    - Role `ROLE_OWNER` (Owner) → the user is redirected to the owner portal `/owner`.
    - If the user was redirected to the login page from a protected URL, and that URL belongs to
      their own portal, they land on the original URL instead of the portal home.
  - Fail:
    - Wrong credentials → "Tên đăng nhập hoặc mật khẩu không đúng."
    - Server unreachable → "Không kết nối được máy chủ. Kiểm tra lại backend rồi thử lại."
    - Role `ROLE_MANAGER` → the session is refused and the stored token is removed immediately,
      with the message "Tài khoản Quản lý vận hành vui lòng sử dụng ứng dụng di động."

### 3.2.2.2 `<Authenticated>` Route authorization

- **Function trigger:** An authenticated user navigates to any URL of the console.
- **Function description:** Every route is guarded so that a signed-in user can only reach the
  screens of their own role.
- **Screen layout:**

  `[Screenshot: admin portal shell and owner portal shell side by side]`

- **Function details:**
  - Not signed in → the user is sent to `/login`, and the requested URL is remembered.
  - Signed in with the wrong role → the user is sent to the home page of their own portal
    (`/admin` for Admin, `/owner` for Owner) instead of seeing a permission error.
  - Already signed in and opening `/login` → the user is sent straight back to their portal.
  - Owner screens are also readable by Admin for supervision, except the three money ledgers
    ("Hoá đơn", "Công nợ", "Sổ cọc") which stay Owner-only.
  - A stored session whose role is neither Admin nor Owner is discarded on load.

### 3.2.2.3 `<Authenticated>` Logout

- **Function trigger:** User clicks the "Đăng xuất" button in the sidebar account area.
- **Function description:** Ends the current session on this browser.
- **Screen layout:**

  `[Screenshot: sidebar account area with the logout button]`

- **Function details:**
  - The system clears the stored user profile and the JWT token, and resets the cached
    invoice-permission probe so the next account does not inherit the previous user's access.
  - The user is redirected to the login screen.

---

## 3.2.3 `<Admin>` Dashboard

### 3.2.3.1 `<Admin>` View system overview

- **Function trigger:** Admin signs in, or clicks "Bảng điều hành" in the sidebar.
- **Function description:** A single board that answers "is anything wrong right now" across the
  whole system: money collected, contracts, users and pending work.
- **Screen layout:**

  `[Screenshot: admin dashboard — KPI cards, revenue chart, pending work lists]`

- **Function details:**
  - The portal header carries a global search box ("Tìm người dùng, Owner, nhà thuê, hóa đơn, hợp
    đồng…"), the notification bell with its unread counter, and the account menu.
  - Invoice figures are grouped by state ("Đã thu", "Chưa thu", "Quá hạn", "Đã huỷ") and by type
    ("Tiền phòng", "Tiền điện", "Tiền nước", "Dịch vụ", "Phí bảo trì", "Khác").
  - Payment figures are grouped by reconciliation state ("Chờ đối soát", "Đã xác nhận",
    "Bị từ chối") and by method ("Chuyển khoản", "Tiền mặt", "Ví điện tử").
  - Account figures are grouped by role ("Owner (chủ nhà)", "Quản lý vận hành", "Khách thuê").
  - Maintenance figures are grouped by progress ("Chờ xử lý", "Đang xử lý").
  - Success: every card links to the screen that can act on the number behind it.
  - Fail: a section that cannot load shows its own retry control without blocking the page.

---

## 3.2.4 `<Admin>` Manage users and permissions

### 3.2.4.1 `<Admin>` View user list

- **Function trigger:** Admin clicks "Người dùng & phân quyền" in the "Hệ thống" group.
- **Function description:** Shows every account in the system with its role and status.
- **Screen layout:**

  `[Screenshot: "Quản lý Người dùng & Phân quyền" — search, role filter, status filter, table]`

- **Function details:**
  - The table lists "NGƯỜI DÙNG", "SỐ ĐIỆN THOẠI", "VAI TRÒ", "TRẠNG THÁI" and "THAO TÁC"
    (a view icon and a disable icon), and is paginated ("Hiển thị 6 / 23 users", "Trước" / "Sau").
  - Roles are labelled "Admin Hệ Thống", "Chủ Nhà", "Quản Lý", "Khách thuê"; statuses are
    "Đang hoạt động", "Chưa kích hoạt", "Chờ duyệt", "Vô hiệu hóa".
  - Filters: "Tất cả vai trò", "Tất cả trạng thái", plus the search box
    ("Tìm theo tên, username, số điện thoại...").
  - Fail: when no account matches, the table shows "Không tìm thấy user phù hợp bộ lọc hiện tại."

### 3.2.4.2 `<Admin>` Create an operations manager account

- **Function trigger:** Admin clicks "+ Tạo tài khoản".
- **Function description:** Creates the login used by an operations manager on the mobile app.
  Tenant accounts are not created here — they are created by the onboarding flow (3.2.7).
- **Screen layout:**

  `[Screenshot: create account modal — full name, username, phone, password]`

- **Function details:**
  - Required fields: "Họ và tên" (e.g. "Nguyễn Văn A"), "Tên đăng nhập", "Số điện thoại", password.
  - Client-side validation: "Vui lòng nhập tên đăng nhập.", "Mật khẩu phải có ít nhất 6 ký tự.",
    "Vui lòng nhập số điện thoại."
  - Success: the account is created and appears in the list, ready to be assigned to a zone by the
    Owner (3.2.32).
  - Fail: the modal keeps the entered data and shows "Có lỗi xảy ra khi tạo tài khoản".

### 3.2.4.3 `<Admin>` View user detail and change status

- **Function trigger:** Admin clicks the view icon on a row, then enables or disables the account.
- **Function description:** Opens the account profile and lets the Admin enable or disable it.
- **Screen layout:**

  `[Screenshot: user detail drawer]`

- **Function details:**
  - The drawer shows identity, role, status and the account workload.
  - Success: the new status is applied and the row refreshes.
  - Fail: "Lỗi khi cập nhật trạng thái" is shown and the previous status is kept.
  - A disabled manager account is flagged on the zone board so that no district silently stays
    without a working manager.

---

## 3.2.5 `<Admin>` Property intake — step 1: create the property records

> The intake process is displayed as a two-step progress bar on both screens of the "Tiếp nhận"
> group: **1 Khởi tạo nhà** → **2 Cấu hình khai thác**.

### 3.2.5.1 `<Admin>` View the property intake list

- **Function trigger:** Admin clicks "Khởi tạo nhà" in the "Tiếp nhận" group.
- **Function description:** Lists every building taken over from an owner, with what is still
  missing in its intake file.
- **Screen layout:**

  `[Screenshot: "Khởi tạo nhà" — progress bar, 5 KPI cards, search bar, building cards]`

- **Function details:**
  - Five KPI cards double as filters: "TỔNG TÒA NHÀ", "CẦN XỬ LÝ" ("còn việc phải làm"),
    "THIẾU HĐ CHỦ NHÀ" ("chưa đính hợp đồng đầu vào"), "ĐANG NHÁP" ("chưa hoàn tất khởi tạo") and
    "ĐÃ KHỞI TẠO" ("hồ sơ đã hoàn tất"), each with its percentage of the portfolio.
  - Status chips under the search bar show the counts per state, for example "Tất cả 12" and
    "Đã khởi tạo 12".
  - The search box matches name, address, zone or manager and ignores Vietnamese accents
    ("Tìm theo tên tòa nhà, địa chỉ, khu vực, quản lý... (không cần dấu)"); "Bộ lọc" opens the
    advanced filters, and the list can be shown as cards or as a table.
  - Sorting ("Mới thêm gần nhất") and page size ("9 / trang") are selectable; the header states
    the range ("Hiển thị 1–9 trên 12 tòa nhà").
  - Each card shows the building name, address, district, rental type, the master lease period
    with its remaining time ("HĐ CHỦ NHÀ 15/09/2026 → 14/09/2028 · còn 2 năm"), and the room /
    floor / area figures. Cards can be selected with a checkbox for bulk actions.

### 3.2.5.2 `<Admin>` Import properties from Excel

- **Function trigger:** Admin clicks "Nhập từ Excel".
- **Function description:** This is the only way a building enters the system. One spreadsheet
  carries the whole intake file — the building, the master lease signed with its owner and the
  equipment handed over — so a batch of buildings is taken over in a single pass.
- **Screen layout:**

  `[Screenshot: "Nhập nhà từ Excel" modal — the three numbered steps]`

- **Function details:**
  - The modal states what the file must contain ("File gồm hợp đồng thuê và thiết bị bàn giao.
    Kiểm tra file (và ảnh nếu có) rồi mới nhập.") and offers "Tải template".
  - **Step 1 — "Kiểm tra file Excel":** the Admin drops an `.xlsx` / `.xls` file and clicks
    "Kiểm tra file". Nothing is written yet.
    - Success: "File hợp lệ — {n} căn · {m} thiết bị bàn giao", and a toast repeats
      "File hợp lệ — {n} căn sẵn sàng nhập". "Kiểm tra lại" re-runs the check.
    - Fail: "Chỉ chấp nhận file Excel (.xlsx hoặc .xls)", "File có {n} lỗi cần sửa" with the
      offending row, column and reason, or "Có lỗi không xác định khi xử lý file."
    - Missing zones: when the file references a district that is not in the catalogue, the modal
      reports "Có khu vực trong file chưa tồn tại trong hệ thống" and lists them
      ("Tỉnh/TP: …", "Quận/Huyện: … (thuộc …)"). The Admin either lets the system create them
      ("Tạo tự động" / "Tạo khu vực & kiểm tra lại" → "Đã tạo {n} khu vực mới vào Quản lý Khu
      vực") or adds them by hand ("Để tôi tự thêm").
  - **Step 2 — "Kiểm tra ảnh (.zip) — tùy chọn":** photos of the buildings can be attached in one
    archive ("Nén folder ảnh thành .zip, mỗi folder con đặt tên đúng **mã hợp đồng**. Tối đa 200MB
    · thay thế ảnh hiện có."), then verified with "Kiểm tra ảnh".
    - Success: "Khớp {n} căn — {m} ảnh sẽ gắn".
    - Fail: "Chỉ chấp nhận file .zip", "File ZIP vượt 200MB", "Không đọc được file ZIP. Kiểm tra
      lại định dạng .zip.", or "Không folder ảnh nào khớp mã hợp đồng trong file".
    - Guard: if an archive was attached but not verified, the import is refused with "Bạn đã đính
      kèm ảnh — hãy bấm "Kiểm tra ảnh" ở bước 2 trước khi nhập."
  - **Step 3 — "Nhập nhà vào hệ thống":** "Nhập {n} căn" asks for confirmation — "Xác nhận nhập
    dữ liệu? Hệ thống sẽ tạo {n} căn nhà từ file {tên file}. Thao tác này ghi trực tiếp vào hệ
    thống." — with "Nhập ngay" / "Huỷ".
  - Success: "Đã nhập {n} căn nhà" and the result table lists, per row, "CĂN NHÀ", "MÃ HĐ",
    "TRẠNG THÁI" ("Đã khởi tạo") and "BƯỚC TIẾP THEO" ("Cấu hình khai thác →"), with a delete
    icon to undo a row that was imported by mistake ("Xóa căn vừa nhập theo mã HĐ "{mã}"?" →
    "Đã xóa "{tên nhà}""). The banner confirms "Đã nhập {n} căn nhà — sang Cấu hình khai thác để
    nhập cải tạo." and "Nhập file khác" restarts the modal.
  - Partial success: "Nhập nhà OK nhưng gắn ảnh lỗi."

### 3.2.5.3 `<Admin>` Open a property file

- **Function trigger:** Admin clicks a building card, or the view icon on its row.
- **Function description:** Shows the full intake file of one building and lets the Admin complete
  or correct what the spreadsheet carried.
- **Screen layout:**

  `[Screenshot: property file — building information, master lease block, equipment block, map]`

- **Function details:**
  - "Thông tin cơ bản" shows "Tên Tòa nhà", "Địa chỉ", "Khu vực", "Diện tích", "Số tầng",
    "Tổng phòng".
  - "Hợp đồng với chủ nhà" holds "Tổng tiền thuê *", "Ngày bắt đầu *", "Ngày kết thúc *" and the
    contract file ("Tải xuống hợp đồng"); it is saved with "Lưu Hợp đồng" / "Cập nhật Hợp đồng".
  - The utility identifiers are shown here: "Mã khách hàng điện" and "Mã khách hàng nước"
    ("Số danh bộ nước"). A building without them is flagged "Chưa có — hoá đơn điện sẽ không được
    đối chiếu", because the publishing screens (3.2.15, 3.2.16) match the paper bill against these
    codes. They are read-only on the web: changing them means importing the intake file again.
  - "Khai báo trang thiết bị có sẵn" lists the equipment handed over by the owner — searched by
    name ("Gõ tên thiết bị để tìm..."), with quantity and condition ("Mới 100%", "Đang dùng tốt")
    — and is saved with "Lưu Thiết bị".
  - The right column shows "Vị trí trên bản đồ" and "Hình ảnh tòa nhà".
  - A file that is still incomplete shows the reminder "Hồ sơ còn ở dạng nháp — bổ sung hợp đồng
    đầu vào & thiết bị bàn giao rồi bấm "Xác nhận & Quay về danh sách" ở cuối trang để hoàn tất
    khởi tạo." The button asks "Xác nhận hoàn tất khởi tạo?" → "Xác nhận".
  - Fail: "Vui lòng điền đầy đủ thông tin thiết bị (chọn thiết bị và số lượng > 0)",
    "Lỗi lưu hợp đồng", "Lỗi lưu manifest".

### 3.2.5.4 `<Admin>` Disable, re-enable or delete a property record

- **Function trigger:** Admin clicks the disable, re-enable or delete icon on a building card, or
  selects several cards and applies the action in bulk.
- **Function description:** Removes a building from operation, brings it back, or erases a record
  imported by mistake.
- **Screen layout:**

  `[Screenshot: bulk selection bar and the confirmation dialogs]`

- **Function details:**
  - Available actions depend on the state: a record still in draft offers "Vô hiệu hóa" and
    "Xóa nháp"; a building in operation offers "Vô hiệu hóa (cần phòng trống)" and "Xóa (cần phòng
    trống)"; a disabled one offers "Kích hoạt lại" and "Xóa vĩnh viễn".
  - Confirmations: "Xóa tòa nhà này?" → "Xóa vĩnh viễn"; "Vô hiệu hóa tòa nhà này?" → "Vô hiệu
    hóa"; "Kích hoạt lại tòa nhà này?" → "Kích hoạt lại".
  - Guard: a building that still has an occupied room can be neither deleted nor disabled —
    "Còn {n} phòng đang có khách thuê — không thể thực hiện. Chờ hết hợp đồng hoặc chuyển khách
    trước."
  - Success: "Đã xóa căn nhà" / "Đã vô hiệu hóa" / "Đã kích hoạt lại tòa nhà"; a bulk action
    reports "Đã {hành động} {n}/{tổng} tòa nhà" and lists every building it could not process.
  - Fail: "Căn nhà đã được xóa trước đó", "Bạn cần quyền ADMIN để xóa căn nhà này",
    "Không gọi được máy chủ", or, when invoices / meter readings / contracts still reference the
    building, "BE lỗi 500 — còn dữ liệu liên quan (hóa đơn / chỉ số / hợp đồng) chưa dọn được."

---

## 3.2.6 `<Admin>` Property intake — step 2: operation configuration

### 3.2.6.1 `<Admin>` View the operation configuration list

- **Function trigger:** Admin clicks "Cấu hình khai thác" in the "Tiếp nhận" group.
- **Function description:** Follows every imported building along the road from "just taken over"
  to "open for business" ("Cấu hình cải tạo / phòng và theo dõi tiến độ đưa từng tòa nhà vào kinh
  doanh"), so nothing stalls unnoticed.
- **Screen layout:**

  `[Screenshot: "Cấu hình khai thác" — KPI cards, status chips, building cards]`

- **Function details:**
  - KPI cards: "TỔNG TÒA NHÀ", "CHỜ CẤU HÌNH" ("chưa chọn loại hình"), "ĐÃ CẤU HÌNH" ("đã xác định
    loại hình") and "ĐANG CẢI TẠO" ("cần xác nhận hoàn thành").
  - Status chips list the pipeline with its counts: "Tất cả", "Đang cải tạo", "Chờ Owner duyệt giá",
    "Đang kinh doanh"; the same search, filter, layout, sorting and paging controls as 3.2.5.1.
  - Each card shows the rental type decided by the spreadsheet ("Nhà nguyên căn" / "Phòng trọ"),
    the current stage and, while construction is running, the marker "Đang thi công cải tạo".
  - The table view adds the columns "KHU VỰC", "LOẠI HÌNH", "PHÒNG", "TẦNG", "DIỆN TÍCH",
    "QUẢN LÝ" ("Chưa gán" until the Owner assigns a zone) and "TRẠNG THÁI" ("Đã cải tạo xong",
    "Đang kinh doanh", …).

### 3.2.6.2 `<Admin>` Import the operation configuration from Excel

- **Function trigger:** Admin clicks "Nhập cải tạo từ Excel".
- **Function description:** Loads everything the building needs in order to be priced: how it will
  be sold, its rooms, the renovation contract and the equipment bought for it. Importing also
  hands the file to the Owner — no separate "submit" step exists.
- **Screen layout:**

  `[Screenshot: "Cấu hình khai thác từ Excel" modal — file check and import]`

- **Function details:**
  - The modal states the content and the consequence: "File gồm cấu hình khai thác (nguyên căn /
    chia phòng), danh sách phòng, hợp đồng cải tạo và thiết bị mua mới — khớp theo mã HĐ thuê của
    căn đã khởi tạo. Nhập xong, các căn **tự động được gửi Owner** duyệt." "Tải template" downloads
    the template.
  - "Kiểm tra file" validates first.
    - Success: "File hợp lệ — {n} căn · {m} dòng cải tạo · {k} thiết bị mua mới · {x} bỏ qua",
      with a toast "File hợp lệ — {n} căn sẵn sàng"; "Kiểm tra lại" re-runs it.
    - Fail: the errors are listed per row and nothing is written.
  - "Nhập & gửi Owner" asks for confirmation — "Xác nhận nhập cải tạo & gửi Owner? Hệ thống sẽ nhập
    cải tạo & thiết bị mua mới cho {n} căn nhà từ file {tên file}, sau đó tự động gửi Owner duyệt."
    — with "Nhập & gửi Owner" / "Huỷ".
  - Success: "Đã nhập cải tạo cho {n} căn — đã gửi Owner duyệt · {x} bỏ qua." The result table
    shows "CĂN NHÀ", "MÃ HĐ" and "TRẠNG THÁI" ("Đã gửi Owner", or "Bỏ qua" for a building the file
    declares as needing no renovation). "Nhập file khác" restarts the modal.
  - A building that is skipped keeps its previous state and can still be sent to the Owner later.

### 3.2.6.3 `<Admin>` Open a building's configuration file

- **Function trigger:** Admin clicks a building in the "Cấu hình khai thác" list.
- **Function description:** Shows what has been configured and spent on one building, and carries
  the actions that move it forward.
- **Screen layout:**

  `[Screenshot: building configuration file — tabs "Tổng quan", "Thiết bị", "Lịch sử cải tạo", "Cải tạo lại"]`

- **Function details:**
  - The header repeats the building name, address, district, rental type, the current stage badge
    ("Đang cải tạo", "Đã cải tạo xong", "Đang kinh doanh") and the operations manager in charge.
  - Tabs: "Tổng quan", "Thiết bị", "Lịch sử cải tạo" and "Cải tạo lại" (3.2.6.5).
  - "Lịch sử cải tạo" shows the rounds: either merged ("Tổng đến hiện tại" — total capital,
    cumulative spending, items by category, equipment by location) or one block per round
    ("Từng đợt", each marked "(hoàn thành)" or "(đang thi công)", the active one expanded).

### 3.2.6.4 `<Admin>` Confirm that the renovation is finished

- **Function trigger:** Admin clicks "Xác nhận hoàn thành cải tạo" on a building under construction.
- **Function description:** Declares that construction is over, which is what lets the Owner price
  the building.
- **Screen layout:**

  `[Screenshot: building header with the "Xác nhận hoàn thành cải tạo" action]`

- **Function details:**
  - Success: the building moves to "Đã cải tạo xong" and appears in the Owner's approval queue
    (3.2.25).
  - Fail: the state is unchanged and the server message is displayed.

### 3.2.6.5 `<Admin>` Start a supplementary renovation

- **Function trigger:** Admin opens the tab "Cải tạo lại" on a building that is already in business.
- **Function description:** Opens a new renovation round on a running building — for example when
  equipment has to be upgraded — and tracks its cost separately from the original one.
- **Screen layout:**

  `[Screenshot: tab "Cải tạo lại" — new round banner and the supplementary import panel]`

- **Function details:**
  - Opening the round shows "Đã mở đợt cải tạo mới. Tải file cải tạo bổ sung để hoàn tất."
  - "Nhập cải tạo bổ sung từ Excel" accepts only the file of that one building ("Chỉ nhập cho
    {tên nhà} — mọi dòng phải có mã HĐ {mã}"). The file holds the renovation contract and the newly
    bought equipment, each marked `THÊM_MỚI` or `THAY_THẾ`, and importing "tự động gửi Owner duyệt
    lại giá (vì đổi chi phí/thiết bị)".
  - Success: "Đã nhập cải tạo bổ sung — {n} dòng cải tạo, {m} thiết bị. Đã gửi Owner duyệt lại
    giá." followed by "Hoàn tất & quay lại".
  - Business rule: a tenant already living in the building is never charged for the supplementary
    renovation. Only an upgrade (`THÊM_MỚI`) raises the listing price for future tenants; replacing
    equipment with an equivalent item (`THAY_THẾ`) does not.

---

## 3.2.7 `<Admin>` Tenant onboarding profiles

### 3.2.7.1 `<Admin>` View the onboarding list

- **Function trigger:** Admin clicks "Hồ sơ đón khách" in the "Tiếp nhận" group.
- **Function description:** One row per tenancy that has been agreed but not started yet — "Khách
  đã xem nhà và chốt thuê — đang chờ quản lý tới đón khách & thu cọc. Quản lý vận hành của nhà tự
  động phụ trách."
- **Screen layout:**

  `[Screenshot: "Hồ sơ đón khách" — KPI cards, filter row, profile table]`

- **Function details:**
  - KPI cards: "TỔNG HỒ SƠ" ("đang chờ đón khách"), "QUÁ HẠN ĐÓN" ("đã qua ngày hẹn"),
    "ĐÓN HÔM NAY", "TRONG 7 NGÀY", "CHƯA CÓ FILE HĐ" ("cần tạo lại file").
  - Filters: the accent-insensitive search ("Tìm tên khách, SĐT, mã HĐ, tên nhà, số phòng, quản
    lý…"), "Nhà: Tất cả", "Quản lý: Tất cả", "Lịch đón: Tất cả", "File HĐ: Tất cả" and
    "Sắp xếp: Mới tạo trước"; the counter on the right reads "{n}/{m} hồ sơ · {k} nhà".
  - A panel "Chỗ trống của các nhà ở trang này" summarises vacancy for the buildings on the current
    page ("{n} nhà đang có hồ sơ ở trang hiện tại · {m} hết chỗ") with "Xem chi tiết" and
    "Xem tất cả nhà →".
  - The table lists "KHÁCH THUÊ" (name and masked phone number, revealed with the eye icon),
    "NHÀ · PHÒNG", "QUẢN LÝ", "GIÁ THUÊ · CỌC", "NGÀY ĐÓN" (overdue and same-day dates are
    highlighted, e.g. "Đón hôm nay"), "HỢP ĐỒNG" (its code) and "THAO TÁC" — edit, download the
    contract file, delete.
  - Empty state: "Chưa có hồ sơ đón khách nào. Bấm "Tạo hồ sơ" hoặc import Excel để bắt đầu."
  - Fail: "Không tải được file hợp đồng." when the document cannot be downloaded.

### 3.2.7.2 `<Admin>` Create an onboarding profile

- **Function trigger:** Admin clicks "Tạo hồ sơ".
- **Function description:** Records the tenancy agreed with a visitor — which room, who, on what
  terms — and generates the contract document the tenant will sign.
- **Screen layout:**

  `[Screenshot: "Tạo hợp đồng nháp" modal — property/room picker, tenant identity, money terms]`

- **Function details:**
  - The property picker only offers buildings that still have a vacant unit ("Chỉ hiện nhà còn
    chỗ — {n}/{m} nhà hết chỗ đã được ẩn") and shows the vacancy of the selected one ("{n} CHỖ
    TRỐNG · {m} phòng · tất cả đều trống"). The room list shows each room with its area and its
    listed rent ("101 · 26m² · 5.056.816đ").
  - The operations manager is not chosen by hand: "Quản lý phụ trách: {tên} (tự động gán + gửi
    thông báo sau khi lưu)".
  - Tenant identity: "Họ và tên khách *", "Số điện thoại *", "CCCD *", "Ngày sinh", "Ngày cấp
    CCCD", "Nơi cấp CCCD", "Hộ khẩu thường trú". Additional occupants are added with
    "+ Thêm thành viên" and removed with "Xóa thành viên".
  - Money terms: "Giá thuê (đ/tháng) *" is pre-filled from the price the Owner approved ("Lấy theo
    giá niêm yết Owner đã duyệt"), together with "Tiền cọc (đ) *" and "Số tháng cọc"
    ("6 tháng" / "1 năm" / "2 năm" presets are offered for the tenancy term).
  - Validation: "SĐT không đúng định dạng Việt Nam (10 số, đầu 03/05/07/08/09).", "CCCD phải gồm
    đúng 12 chữ số.", "Ngày sinh không hợp lệ — khách phải sinh từ 1930 và đủ 18 tuổi.",
    "SĐT thuộc tài khoản nội bộ — không thể onboard làm khách.", "Vui lòng chọn bất động sản",
    "Vui lòng chọn phòng", "Vui lòng chọn ngày bắt đầu hợp đồng.", "Ngày kết thúc phải sau ngày
    bắt đầu hợp đồng.", and "Nhà này chưa có quản lý phụ trách — vui lòng gán quản lý cho nhà
    trước khi tạo hợp đồng."
  - Validation against the master lease: a move-in date before the master lease starts is refused
    ("Công ty chưa có quyền quản lý căn này trước ngày đó."), and an end date beyond it is refused
    and cleared ("Tới ngày trả nhà sẽ vẫn còn khách bên trong.").
  - "Xem lại & Lưu" opens the read-back dialog "Xác nhận thông tin — Kiểm tra lại trước khi lưu —
    sau bước này sẽ tạo/gán manager/sinh file.", listing the property and room, the tenant, phone
    and ID number, date of birth, ID issue date and place, permanent address, rent, deposit and
    its number of months, the expected move-in date, the contract dates and the handed-over
    furniture. "Quay lại sửa" returns to the form; "Xác nhận & Lưu" commits.
  - Success: "Đã tạo hợp đồng nháp & gửi thông báo cho {tên quản lý}." — the draft contract and
    its document are created and the manager is told to receive the tenant.
  - Partial success: "Đã tạo hợp đồng nháp nhưng KHÔNG sinh được file — có thể tạo lại ở danh sách
    nháp."

### 3.2.7.3 `<Admin>` Edit an onboarding profile

- **Function trigger:** Admin clicks the edit icon on a row.
- **Function description:** Corrects a profile before the tenant moves in and regenerates the
  contract document so the paper matches the record.
- **Screen layout:**

  `[Screenshot: edit modal with the identity-change confirmation checkbox]`

- **Function details:**
  - Changing the phone number, the ID card number or the date of birth requires the Admin to tick
    the confirmation first ("Vui lòng tick xác nhận trước khi lưu thay đổi thông tin định danh
    (SĐT/CCCD/ngày sinh).") because those fields identify the tenant's account.
  - Progress is shown as "Đang cập nhật hợp đồng..." then "Đang tạo lại file hợp đồng...".
  - Success: "Đã cập nhật hợp đồng nháp & tạo lại file."
  - Partial success: "Đã cập nhật thông tin nhưng KHÔNG tạo lại được file — có thể thử lại."

### 3.2.7.4 `<Admin>` Import onboarding profiles from Excel

- **Function trigger:** Admin clicks "Import Excel".
- **Function description:** Creates a batch of tenancies at once, for a building that is filled in
  one move.
- **Screen layout:**

  `[Screenshot: "Import hợp đồng nháp từ Excel" modal — validation report and confirmation]`

- **Function details:**
  - Only "`.xlsx`" and "`.xls`" are accepted ("Chỉ chấp nhận file Excel (.xlsx hoặc .xls)").
  - "Kiểm tra file" validates and reports "File hợp lệ — {n} hợp đồng sẵn sàng" or "{n} hợp đồng
    sẵn sàng · {m} dòng để lại", naming each rejected row — for example rows that exceed the room
    capacity ("{phòng} (thừa {n} khách)") or rows whose building is not in business yet ("{n} hợp
    đồng thuộc nhà chưa hoạt động — để lại lần này").
  - The import is confirmed with "Xác nhận import hợp đồng nháp? Hệ thống sẽ tạo {n} hợp đồng nháp
    từ file {tên file}. Quản lý phụ trách của từng nhà sẽ nhận thông báo đón khách." →
    "Import" / "Huỷ".
  - Success: "Đã tạo {n} hợp đồng nháp." followed by "Đã tự động tạo file hợp đồng cho toàn bộ."
  - Partial success: "Tạo file thất bại cho {n} hợp đồng — vào "Sửa" từng dòng để tạo lại."
  - Fail: "Chưa có dòng nào import được — xem chi tiết bên dưới." or "Chưa import được: cả {n} hợp
    đồng đều thuộc nhà chưa hoạt động".

### 3.2.7.5 `<Admin>` Cancel onboarding profiles

- **Function trigger:** Admin clicks the delete icon on a row, or selects several rows and deletes
  them together.
- **Function description:** Drops a tenancy that will not happen, freeing the room for someone else.
- **Screen layout:**

  `[Screenshot: bulk selection bar with the cancel confirmation]`

- **Function details:**
  - Single cancel asks "Huỷ hồ sơ đón khách của {tên khách}?" and reports "Đã huỷ hồ sơ đón khách."
  - Bulk delete reports "Đã xoá {n} hồ sơ đón khách."
  - Success: the room returns to vacant and can be offered again.

---

## 3.2.8 `<Admin>` Monitor property and room status

### 3.2.8.1 `<Admin>` View property and room status

- **Function trigger:** Admin clicks "Tình trạng nhà & phòng" in the "Vận hành" group.
- **Function description:** "Quản lý đã tiếp quản nhà chưa, mỗi nhà còn mấy phòng nhận được khách,
  và hồ sơ bàn giao đã đủ chưa" — the operational truth of the portfolio in one table.
- **Screen layout:**

  `[Screenshot: "Tình trạng từng nhà" — KPI cards, filter chips, expandable per-building rows]`

- **Function details:**
  - KPI cards: "TOÀ NHÀ THEO DÕI", "QUẢN LÝ ĐÃ NHẬN NHÀ" ("Đã tiếp quản hết"), "CHỖ CÒN TRỐNG"
    ("nhà còn nhận khách") and "PHÒNG ĐÃ GIAO KHÁCH" ("Đã bàn giao cho khách thuê").
  - Filter chips: "Tất cả", "Chưa nhận nhà", "Còn phòng trống", "Chưa mở phòng", "Hết chỗ",
    "Thiếu hồ sơ bàn giao"; a search box matches building or manager.
  - Each row shows the building, its stage ("Đang khai thác"), the operations manager, whether the
    manager has taken it over ("Đã nhận" with the timestamp) and the room / vacancy summary.
  - Expanding a row lists its rooms with "Phòng", "Khách thuê", "Ngày vào ở", "Kích hoạt HĐ",
    "Hồ sơ bàn giao" ("Đủ (1 ảnh + chỉ số)" when complete) and "Trạng thái HĐ" ("Đã giao phòng").
  - The row footer states why the handover file matters: "Thiếu ảnh hiện trạng hoặc chỉ số
    điện/nước thì lúc khách trả phòng sẽ không có căn cứ để trừ cọc — nhắc quản lý bổ sung sớm."

---

## 3.2.9 `<Admin>` Monitor maintenance and equipment

### 3.2.9.1 `<Admin>` View maintenance tickets

- **Function trigger:** Admin clicks "Bảo trì & thiết bị" in the "Vận hành" group. The menu item
  carries a badge with the number of open tickets.
- **Function description:** "Theo dõi yêu cầu sửa chữa của khách, tiến độ xử lý của quản lý và chi
  phí từng phiếu."
- **Screen layout:**

  `[Screenshot: "Bảo trì & thiết bị" — KPI cards, status tabs, ticket table]`

- **Function details:**
  - KPI cards: "TỔNG PHIẾU", "CẦN XỬ LÝ" ("chưa ai nhận kiểm tra"), "ĐANG SỬA" ("quản lý đang xử
    lý"), "LỖI DO KHÁCH" ("gồm cả chờ trừ cọc") and "HOÀN TẤT" (with the total cost).
  - Status tabs: "Cần xử lý", "Đang sửa", "Lỗi do khách", "Đã xong", "Tất cả"; sorting by
    "Ưu tiên xử lý", "Mới nhất" or "Chi phí cao nhất"; the search box matches ticket code, tenant
    name or phone, equipment, building, room or manager.
  - The table lists "PHIẾU" (its code, priority and the equipment), "NHÀ · PHÒNG", "KHÁCH THUÊ"
    (name and phone), "QUẢN LÝ", "CHI PHÍ", "TRẠNG THÁI" and "CẬP NHẬT" (relative time, e.g.
    "1 ngày trước"). A live badge ("TRỰC TIẾP") shows the page is refreshing by itself.
  - Header actions: "Báo lỗi do khách" (3.2.18), "Danh mục thiết bị" (3.2.21), "Làm mới",
    "Xuất CSV".
  - Opening a ticket shows its photo evidence, grouped as "Ảnh hiện trạng", "Bằng chứng lỗi do
    khách", "Khách tự sửa", "Sau sửa chữa" and "Hoá đơn".
  - Fail: "Không tải được danh sách — kiểm tra kết nối máy chủ." / "Không tải thêm được — thử lại
    sau."

---

## 3.2.10 `<Admin>` Issue meter override passcodes

### 3.2.10.1 `<Admin>` Issue a passcode for manual meter entry

- **Function trigger:** A manager cannot photograph a meter and calls the Admin; the Admin opens
  "Cấp mã đồng hồ" and fills in "Tạo mã nhập tay đồng hồ".
- **Function description:** Normally a meter reading must be backed by a photo. This screen issues
  a one-time passcode that lets one manager submit one reading by hand — "Quản lý gọi xin mã khi
  không chụp được ảnh đồng hồ. Tạo mã, đọc cho họ, mã tự chết sau khi dùng."
- **Screen layout:**

  `[Screenshot: "Cấp mã đồng hồ" — KPI cards, issue form, generated code panel, issued log]`

- **Function details:**
  - KPI cards: "MÃ CÒN HIỆU LỰC" ("Chưa dùng và chưa hết hạn"), "MÃ ĐÃ ĐƯỢC DÙNG" ("Mỗi mã chỉ
    dùng được một lần") and "LẦN GÕ TAY CHỈ SỐ" ("Số lần bỏ qua ảnh đồng hồ").
  - The form takes an optional note ("Ghi chú (không bắt buộc)", e.g. "VD: Quản lý An — đón khách
    P.302, đồng hồ trong hộp khoá") — "Ghi ai xin và vì sao. Lúc soi lại nhật ký, đây là thứ phân
    biệt trường hợp chính đáng với thói quen ngại chụp ảnh." — and a lifetime in minutes
    ("Hạn dùng (phút)", default 10: "Đủ để gọi điện đọc mã là được. Càng ngắn càng ít rủi ro mã bị
    chuyền tay."). "Tạo mã" issues it.
  - The generated code is displayed large, to be read out over the phone ("Đọc mã này cho quản
    lý"), with "Chép mã" / "Đã chép" and a live countdown ("Còn {mm:ss}"). Before any code is
    issued the panel shows "Chưa tạo mã nào — Mã sẽ hiện ở đây cỡ lớn để đọc qua điện thoại."
  - Guard: if unused passcodes are still alive, the system warns "Đang có {n} mã chưa ai dùng. Đọc
    lại một mã sẵn có, hoặc chờ chúng hết hạn rồi hãy tạo thêm — mỗi mã còn hạn là một lần bỏ qua
    được ảnh đồng hồ.", offering "Vẫn tạo mã mới" or "Thôi, đọc lại mã cũ".
  - "Mã đã cấp" is the audit trail — "MÃ", "TRẠNG THÁI" ("Đã dùng" / "Hết hạn"), "GHI CHÚ",
    "TẠO LÚC", "HẾT HẠN" — with "Chỉ mã còn dùng được" and "Tải lại". Expired codes need no
    revocation: "Mã hết hạn không cần thu hồi — tới giờ là tự hỏng."
  - Fail: "Không tạo được mã. Thử lại, hoặc kiểm tra tài khoản có vai trò Admin không." /
    "Không tải được dữ liệu. Kiểm tra kết nối hoặc quyền truy cập (cần vai trò Admin)."

---

## 3.2.11 `<Admin>` Monitor zone assignment

### 3.2.11.1 `<Admin>` View the zone assignment board

- **Function trigger:** Admin clicks "Phân công khu vực" in the "Vận hành" group.
- **Function description:** Shows which district is covered by which operations manager. The rule
  is stated on the page: "Mỗi quận/huyện do **một** quản lý vận hành phụ trách — gán cho khu vực
  là gán cho mọi nhà bên trong. Xem toàn hệ thống; việc gán/đổi quản lý do Owner quyết định."
- **Screen layout:**

  `[Screenshot: "Khu vực & Quản lý" (admin view) — KPI cards, filters, zone rows]`

- **Function details:**
  - KPI cards: "Tổng khu vực" and "{n}/{m} Đều đã có quản lý".
  - Filters: search by district or manager name, "Tất cả quản lý", and sorting by "Việc cần xử lý
    trước".
  - Each row shows the district, its coverage badge ("Đã gán"), its size ("{n} nhà · {m} đơn vị")
    and the manager with the number of districts they cover. "Xem chi tiết" expands the buildings
    inside.
  - The Admin has read-only access here: the assignment itself is a Owner decision (3.2.32), so this
    screen carries no "Đổi quản lý" action.

---

## 3.2.12 `<Admin>` Monitor billing and payments

### 3.2.12.1 `<Admin>` View invoices and deposits

- **Function trigger:** Admin clicks "Thanh toán" in the "Tài chính" group.
- **Function description:** "Toàn bộ hoá đơn thật của hệ thống (tiền phòng, điện, nước, dịch vụ,
  bảo trì) — mới phát hành nằm trên đầu."
- **Screen layout:**

  `[Screenshot: "Hoá đơn & Thanh toán" — two tabs, KPI cards, invoice table]`

- **Function details:**
  - Two tabs carry their counts: "Hoá đơn" and "Tiền cọc".
  - KPI cards: "TỔNG HOÁ ĐƠN" (with the total amount), "ĐÃ THANH TOÁN", "CHỜ THU", "QUÁ HẠN".
  - Filters: the search box ("Tìm mã hoá đơn, toà nhà, phòng, khách thuê..."), "Tất cả loại hoá
    đơn", "Tất cả toà nhà", the period selector ("Tất cả các kỳ") and the sort ("Mới phát hành
    nhất"). A live badge ("TRỰC TIẾP") shows the page refreshing by itself.
  - The table lists "MÃ HOÁ ĐƠN", "KỲ THANH TOÁN" (with the invoice type chip and the covered days,
    e.g. "Tiền nhà 18/09–30/09/2026 (13/30 ngày)"), "TOÀ NHÀ / PHÒNG", "KHÁCH THUÊ", "SỐ TIỀN",
    "PHÁT HÀNH", "HẠN THU" and "TRẠNG THÁI"; a row expands for its detail.
  - Invoice types: "Tiền phòng", "Tiền điện", "Tiền nước", "Dịch vụ", "Phí bảo trì", "Khác".
    Invoice states: "Chờ thanh toán", "Đã thanh toán", "Quá hạn", "Đã huỷ". Payments are
    reconciled through "Chờ đối soát", "Đã xác nhận", "Bị từ chối", by "Chuyển khoản", "Tiền mặt"
    or "Ví điện tử".
  - When a tenant moves in, the money is collected once but recorded as two invoices: the envelope
    `HD-ONBOARD-…` ("Khoản gộp — không tính vào tổng", covering deposit plus first rent) and the
    first rent invoice `HD-RENT-…` ("Thu cùng cọc lúc nhận phòng"), so the total is not
    double-counted.
  - Business rule: an invoice is either paid in full or not at all — the system never records a
    partial collection; when a tenant cannot pay, the tenancy is terminated instead.
  - Business rule: the deposit is never used to settle an unpaid invoice. The tenant clears every
    charge first, and the deposit is then returned untouched.

---

## 3.2.13 `<Admin>` Monitor contracts

### 3.2.13.1 `<Admin>` View tenant contracts

- **Function trigger:** Admin clicks "Hợp đồng" in the "Tài chính" group.
- **Function description:** Tracks every tenancy in the system and highlights the ones that need a
  decision soon.
- **Screen layout:**

  `[Screenshot: "Theo dõi hợp đồng thuê" — KPI cards, search bar, contract table]`

- **Function details:**
  - Groups: "Đang hiệu lực", "Chờ kích hoạt" ("Đã ký, chờ thu tiền / đón khách"), "Chờ đón khách"
    ("Đã lập hồ sơ, chưa giao phòng"), "Sắp hết hạn ≤{n}n" ("Cần chốt gia hạn sớm") and
    "Đã kết thúc" ("Chấm dứt + hết hạn"). Tenancies aborted before the tenant ever moved in are
    counted separately so the ratio is not distorted.
  - The search box accepts contract code, tenant name, phone number, ID card number, building,
    room or manager; clicking a row opens the contract detail.
  - Fail: "Chưa tải được dữ liệu — bấm "Làm mới" để thử lại."; empty states are "Chưa có hợp đồng
    khách thuê nào trong hệ thống." and "Không có hợp đồng nào khớp bộ lọc. Thử xoá bớt điều kiện
    lọc."

---

## 3.2.14 `<Admin>` Handle contract extension requests

### 3.2.14.1 `<Admin>` View extension requests

- **Function trigger:** Admin clicks "Đơn gia hạn" in the "Tài chính" group.
- **Function description:** Collects the requests sent by tenants who want to stay longer. The
  Admin decides; the operations manager can only advise.
- **Screen layout:**

  `[Screenshot: "Đơn xin gia hạn hợp đồng" — pending tab and history tab]`

- **Function details:**
  - Two tabs: "Chờ duyệt" and "Lịch sử đã xử lý"; the search box matches tenant name, phone number
    or building name.
  - Each request shows the tenant, the building and room, the requested duration ("xin {n} tháng")
    and the tenant's reason ("(không ghi gì)" when left blank).
  - Fail: "Không tải được danh sách đơn. Bấm Làm mới để thử lại."; empty states are "Không có đơn
    nào chờ duyệt" and "Không có đơn nào khớp từ khoá."

### 3.2.14.2 `<Admin>` Approve an extension request

- **Function trigger:** Admin approves a pending request.
- **Function description:** Extends the tenancy. Approving moves the end date and changes nothing
  else — "Khách xin ở thêm. Duyệt là dời ngày kết thúc — giá thuê giữ nguyên, không đổi gì khác."
- **Screen layout:**

  `[Screenshot: request card with the approve action]`

- **Function details:**
  - Success: "Đã gia hạn hợp đồng thêm {n} tháng." and the request moves to the history tab.
  - Fail: "Không duyệt được đơn." and the request stays pending.

### 3.2.14.3 `<Admin>` Reject an extension request

- **Function trigger:** Admin clicks "Từ chối đơn" and types the reason.
- **Function description:** Declines the request and tells the tenant why.
- **Screen layout:**

  `[Screenshot: reject dialog with the reason field]`

- **Function details:**
  - The reason is mandatory and at least 10 characters long ("Ghi rõ lý do (ít nhất 10 ký tự) —
    khách sẽ đọc được nội dung này."), because the tenant reads it verbatim.
  - Success: "Đã từ chối đơn và báo cho khách."
  - Fail: "Không ghi nhận được." and the dialog stays open with the typed reason.

---

## 3.2.15 `<Admin>` Publish electricity (EVN) bills

> Division of labour: the operations manager locks each room's meter reading in the mobile app,
> and the Admin enters the paper bill of the whole building. "Admin tải hoá đơn EVN của từng nhà,
> hệ thống tính đơn giá rồi đẩy xuống cho quản lý."

### 3.2.15.1 `<Admin>` Publish the bill of one building

- **Function trigger:** Admin clicks "Hoá đơn điện EVN" in the "Tài chính" group, picks the
  building and the consumption period, then clicks "Phát hành đơn giá cho kỳ này".
- **Function description:** Records the master bill received from the electricity company, which
  is what the per-room tenant bills are computed from.
- **Screen layout:**

  `[Screenshot: "Phát hành hoá đơn điện EVN" — photo upload, figures, issued list]`

- **Function details:**
  - The period is chosen at the top ("KỲ TIÊU THỤ", month and year) and the list of buildings only
    offers the ones that have tenants ("Chỉ hiện nhà đang có khách ở — {n} nhà trống đã được ẩn").
  - "Ảnh hoá đơn EVN" reads the paper bill: "Chọn ảnh hoá đơn EVN — Hệ thống tự đọc tổng kWh ·
    tổng tiền · kỳ".
    - Success: "Đọc được: {các số đọc được}. Đối chiếu lại với ảnh trước khi phát hành." The photo
      can be enlarged ("🔍 Phóng to"), replaced ("Đổi ảnh khác") or removed ("Xoá ảnh"), and every
      extracted value stays editable.
    - Fail: "Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay.", "Đã tải ảnh nhưng dịch vụ đọc
      hoá đơn đang lỗi. Vui lòng nhập tay số liệu.", "Không tải được ảnh lên."
  - The figures are "Tổng kWh *", "Tổng tiền (đ) *" and "Kỳ thanh toán *", with quick fills
    ("Điền nhanh: Kỳ {tháng}/{năm} · Tháng trước"). From them the panel "ĐƠN GIÁ HỆ THỐNG SẼ DÙNG"
    shows the unit price that every room bill of that building will use.
  - Reading progress is stated before publishing: "{n}/{m} phòng đã chốt chỉ số kỳ {tháng}/{năm}".
    - "Phát hành sẽ tính tiền và gửi hoá đơn cho {n} phòng này ngay."
    - "{m} phòng còn lại sẽ tự phát hành ngay khi quản lý chốt số, không cần bạn đẩy lại giấy."
    - If no room has a reading yet: "Phát hành bây giờ sẽ không gửi được hoá đơn nào — chưa phòng
      nào có chỉ số."
    - "Xem chỉ số & ảnh đồng hồ từng phòng" expands the readings with the meter photos.
  - A whole-house property is billed straight to its tenant; a room-by-room property has the master
    bill split across the rooms whose reading is locked.
  - A building that already has a bill for the period is labelled "Đã phát hành" in the picker and
    cannot be published twice.
  - The lower section "Đã phát hành — kỳ {tháng}/{năm}" lists what has been issued ("Các nhà dưới
    đây đã có đơn giá điện của kỳ. Hoá đơn đã gửi tới khách của mọi phòng đã chốt chỉ số."), with
    "Tải lại" and, when nothing exists yet, "Chưa phát hành hoá đơn EVN nào cho kỳ {tháng}/{năm}."
  - Fail: "Không tải được danh sách nhà"; the publication error is displayed and nothing is created.

### 3.2.15.2 `<Admin>` Publish a whole batch from a `.zip` archive

- **Function trigger:** Admin clicks "Nhập từ .zip".
- **Function description:** Enters a whole month of scanned bills at once instead of one building
  at a time.
- **Screen layout:**

  `[Screenshot: "Hoá đơn điện từ file .zip" — batch table with per-building rows]`

- **Function details:**
  - One period applies to the batch ("KỲ CẢ LÔ … áp cho {n}/{m} nhà"), and the rows are filtered
    by state: "Tất cả", "Cần sửa", "Sẵn sàng", "Bỏ qua".
  - The warning is explicit: "Số liệu do máy đọc từ ảnh — **phải kiểm lại trước khi phát hành**.
    Sai tổng kWh là sai đơn giá, mà quản lý dựng hoá đơn từng phòng trên chính đơn giá đó."
  - Each row shows the scan thumbnail, the building, its editable customer code (validated against
    the stored one, with a tick when they match), "TỔNG KWH", "TỔNG TIỀN · ĐƠN GIÁ", "CHỈ SỐ CÔNG
    TƠ (đầu kỳ → cuối kỳ)" and "TRẠNG THÁI" ("Sẵn sàng"). A room-by-room building shows "quản lý
    ghi từng phòng" instead of a single meter pair.
  - "Phát hành {n} nhà" publishes every ready row; "Đóng" leaves without publishing.

### 3.2.15.3 `<Admin>` Revoke a published bill

- **Function trigger:** Admin clicks "Thu hồi hoá đơn này" on an issued row.
- **Function description:** Cancels a bill issued from a wrong photo or for the wrong building. The
  Admin is the only role allowed to do this.
- **Screen layout:**

  `[Screenshot: revoke confirmation dialog]`

- **Function details:**
  - Success: the row is marked "Đã thu hồi" and the building can be published again for that period.
  - Fail: the row keeps the state "Đang hiệu lực" and the error is displayed.

---

## 3.2.16 `<Admin>` Publish water bills

### 3.2.16.1 `<Admin>` Publish a water bill

- **Function trigger:** Admin clicks "Hoá đơn nước" in the "Tài chính" group and follows the same
  three steps as 3.2.15: pick the building and period, upload the paper bill, publish.
- **Function description:** Same model as electricity, with the subscriber number ("số danh bộ")
  as the identity of the meter and m³ as the unit.
- **Screen layout:**

  `[Screenshot: "Phát hành hoá đơn nước" and the "Hoá đơn nước từ file .zip" batch table]`

- **Function details:**
  - Extracted fields: subscriber number, billing period, previous and new readings, total amount —
    "Đọc được: {...}. Đối chiếu lại với ảnh trước khi phát hành."
  - Guard on identity: if the building already has a stored subscriber number and the number read
    from the paper does not match, publication is refused, both values are shown, and the Admin is
    asked to check whether the wrong building was selected. If the building has a stored number and
    the paper field was left empty, publication is refused as well.
  - "Nhập từ .zip" runs the same batch table as 3.2.15.2, with "TỔNG M³" in place of "TỔNG KWH" and
    the billing period editable per row; "Thu hồi hoá đơn này" revokes an issued bill.
  - Success: the master bill is created and the tenants' bills follow the same rule as electricity.
  - Partial success: "Đã tạo hoá đơn tổng nhưng CHƯA gửi được cho khách thuê: {lý do}. Đừng phát
    hành lại — vào mục đã phát hành để gửi lại cho khách."
  - Fail: "Không phát hành được hoá đơn nước.", "Không đọc được số từ ảnh — nhập tay giúp mình.",
    "Không tải được ảnh lên.", "Không tải được danh sách hoá đơn nước."

---

## 3.2.17 `<Admin>` Arbitrate deposit refund disputes

### 3.2.17.1 `<Admin>` View refund disputes

- **Function trigger:** Admin clicks "Hoàn cọc" in the "Khiếu nại" group.
- **Function description:** Collects the cases where a tenant says the returned deposit is not what
  was agreed. Only the Admin can arbitrate, because the dispute is aimed at the Owner and the
  manager themselves.
- **Screen layout:**

  `[Screenshot: refund disputes — pending tab and history tab]`

- **Function details:**
  - Tabs: "Đang chờ xử lý" and "Lịch sử đã xử lý"; the search box matches tenant name, phone number
    or building name.
  - Each case shows the tenant's claim ("(không ghi nội dung)" when left blank), the amount, and
    how it ended: "Khách đã xác nhận nhận đủ", "Đã chuyển lại", "Đã bác khiếu nại".
  - A refund the tenant confirmed by themselves is labelled "Khách tự xác nhận đã nhận đủ ngày
    {ngày} — không cần phân xử".
  - Empty states: "Không có khiếu nại nào đang chờ" ("Mọi khoản hoàn cọc đều đã được khách xác nhận
    hoặc chưa phát sinh tranh chấp.") and "Chưa có khiếu nại nào từng xảy ra".
  - Fail: "Tài khoản này không có quyền xem hồ sơ trả phòng (403)." or "Không gọi được API — kiểm
    tra kết nối máy chủ."

### 3.2.17.2 `<Admin>` Conclude a refund dispute

- **Function trigger:** Admin clicks "Kết luận khiếu nại" on a pending case.
- **Function description:** Ends the dispute with a written decision both sides can read.
- **Screen layout:**

  `[Screenshot: conclusion dialog — outcome and reasoning]`

- **Function details:**
  - The Admin records the outcome and the reasoning; the case then shows "Đã khép" together with
    "Quản trị viên kết luận ngày {ngày}".
  - Success: the case moves to the history tab and both the Owner and the tenant see the decision.
  - Fail: the case stays pending; "Huỷ" closes the dialog without deciding.

---

## 3.2.18 `<Admin>` Review tenant-fault reports

### 3.2.18.1 `<Admin>` View tenant-fault reports

- **Function trigger:** Admin clicks "Báo lỗi do khách" in the "Khiếu nại" group, or the button of
  the same name on the maintenance screen. The menu item carries a badge with the number of reports
  waiting for a decision.
- **Function description:** When a manager claims that damage was caused by the tenant, the cost is
  charged to that tenant — so the claim is judged by the Admin, not by the person who made it.
- **Screen layout:**

  `[Screenshot: fault review table — filters, evidence, decision buttons]`

- **Function details:**
  - Each row carries "Mã phiếu", "Nhà", "Phòng", "Khách thuê", "SĐT", "Thiết bị", "Mô tả lỗi",
    "Ngày báo cáo" and, once decided, "Kết luận", "Người duyệt", "Ngày duyệt", "Ghi chú".
  - States: "Chờ duyệt", "Đã duyệt", "Không duyệt".
  - "Xuất CSV" exports exactly what is on screen ("Xuất CSV danh sách đang hiển thị (đã áp tìm
    kiếm/lọc)"); "Làm mới" reloads; "Bỏ lọc" clears the filters.
  - Fail: "Tài khoản này không có quyền xem báo lỗi do khách (403).", "Không gọi được API — kiểm
    tra kết nối máy chủ.", "Không tải thêm được — thử lại."

### 3.2.18.2 `<Admin>` Approve or reject a tenant-fault report

- **Function trigger:** Admin clicks "Xem xét & duyệt" or "Không duyệt" on a pending report.
- **Function description:** Decides whether the tenant pays for the damage.
- **Screen layout:**

  `[Screenshot: decision dialog with the evidence photos]`

- **Function details:**
  - Approving confirms the tenant is at fault and the repair is charged to them.
  - Rejecting requires a note; the default reason offered is "Không đủ căn cứ xác định lỗi do
    khách." and the cost stays with the company.
  - Success: the report shows the decision, the reviewer and the decision date.
  - Fail: the report stays pending; "Huỷ" closes the dialog.

---

## 3.2.19 `<Admin>` Arbitrate utility invoice disputes

### 3.2.19.1 `<Admin>` View utility invoice disputes

- **Function trigger:** Admin clicks "Hoá đơn điện nước" in the "Khiếu nại" group.
- **Function description:** "Khách thuê báo hoá đơn không phải của nhà mình, hoặc chỉ số không khớp
  với ảnh đồng hồ. Đối chiếu ảnh gốc rồi kết luận — trong lúc chờ, hoá đơn đã tạm ngừng tính quá
  hạn nên đừng để treo lâu." Only the Admin can judge: the accusation points at the person who
  issued the bill or at the manager who read the meter, and the Admin is the only role who can
  revoke an issued bill.
- **Screen layout:**

  `[Screenshot: "Khiếu nại hoá đơn điện / nước" — tabs, type filter, case list]`

- **Function details:**
  - Tabs: "Đang chờ xử lý" and "Lịch sử đã xử lý", each with its count; type filter: "Tất cả",
    "Điện", "Nước".
  - Each case is shown next to the original master bill ("Hoá đơn EVN gốc · {kỳ}" or "Hoá đơn nước
    gốc · {kỳ}") with "Chỉ số cũ", "Chỉ số mới" and the unit price, so the Admin compares the
    claim with the paper.
  - The search box accepts tenant name, phone number, invoice code or building name.
  - Empty state: "Không có khiếu nại nào đang chờ — Mọi hoá đơn điện/nước đều đang được khách chấp
    nhận."
  - Fail: "Tài khoản này không có quyền phân xử khiếu nại hoá đơn (403)." / "Không gọi được API —
    kiểm tra kết nối máy chủ."

### 3.2.19.2 `<Admin>` Conclude a utility invoice dispute

- **Function trigger:** Admin clicks "Kết luận khiếu nại".
- **Function description:** Settles the contested bill.
- **Screen layout:**

  `[Screenshot: conclusion dialog with the three possible outcomes]`

- **Function details:**
  - Possible outcomes: "Công nhận sai" (the bill was wrong), "Bác khiếu nại" (the bill stands),
    "Khách tự rút" (the tenant withdrew the complaint).
  - Success: the case moves to the history tab with its conclusion; when the bill is recognised as
    wrong, the Admin revokes and re-issues it through 3.2.15.3 / 3.2.16.1.
  - Fail: the case stays pending; "Huỷ" closes the dialog.

---

## 3.2.20 `<Admin>` Manage the zone catalogue

### 3.2.20.1 `<Admin>` Manage provinces and districts

- **Function trigger:** Admin clicks "Danh mục khu vực" in the "Hệ thống" group.
- **Function description:** "Danh mục tỉnh/thành và quận/huyện — dùng khi import bất động sản và
  phân công quản lý vận hành."
- **Screen layout:**

  `[Screenshot: "Khu vực" — province list on the left, districts of the selected province on the right]`

- **Function details:**
  - The left column lists the provinces with their district counts; selecting one lists its
    districts on the right with the columns "QUẬN", "BẤT ĐỘNG SẢN" and "QUẢN LÝ PHỤ TRÁCH"
    ("Chưa có quản lý" when none), each row offering "Sửa" and a delete icon.
  - "+ Thêm Tỉnh/Thành phố" and "+ Thêm Quận/Huyện" add entries by hand; "Import Excel" loads the
    catalogue in bulk; a search box filters the districts.
  - The footer points at where assignment happens: "Gán / đổi quản lý cho khu vực tại **Khu vực &
    Quản lý**."
  - Deleting a province is confirmed ("Xoá tỉnh/thành phố") and refused while properties still
    reference it.
  - Success: new districts become selectable in the property import and in the public filters.

---

## 3.2.21 `<Admin>` Equipment register and QR tags

### 3.2.21.1 `<Admin>` View a building's equipment and print its QR tags

- **Function trigger:** Admin clicks "Danh mục thiết bị" in the "Hệ thống" group, or "Danh mục
  thiết bị" on the maintenance screen, then selects a building.
- **Function description:** "Xem toàn bộ thiết bị trong tòa nhà và in tem QR để dán — khách thuê
  quét QR để báo bảo trì." The QR tag is what turns a broken item in a room into a maintenance
  ticket that already knows which equipment it is about.
- **Screen layout:**

  `[Screenshot: "Trang thiết bị & Mã QR" — building picker, per-room equipment with QR codes]`

- **Function details:**
  - The building picker and a search box ("Tìm theo tên, mã thiết bị, phòng…") narrow the list;
    condition chips ("Tất cả", "Mới", "Hoạt động tốt", …) filter it further.
  - The list is shown "Theo phòng" (grouped by room) or as a "Bảng", with the header stating
    "{n} thiết bị · {m} phòng/khu vực".
  - Each item shows its QR code, its name, its equipment code ("Mã EQ-46"), its condition and its
    repair history ("{n} lần bảo trì"), plus "QR lớn" to enlarge a single tag.
  - Printing: the tag size is chosen ("Nhỏ" / "Vừa" / "Lớn"), then "In tất cả tem QR ({n})" prints
    the current selection and "In toàn bộ nhà ({n})" prints every tag of the building. Individual
    items or whole rooms can be ticked ("Chọn tất cả {n} tem", "Chọn phòng").
  - Equipment is located either in a room ("Phòng {số}") or in the shared area ("Khu vực chung /
    Toàn nhà"); condition states are "Mới", "Hoạt động tốt", "Đang bảo trì", "Đang hỏng",
    "Đã thanh lý", and warranty is shown as "Còn bảo hành" / "BH còn {n} ngày" / "Hết bảo hành".

---

## 3.2.22 `<Admin>` Notification centre

### 3.2.22.1 `<Admin>` Read system notifications

- **Function trigger:** Admin clicks the bell icon in the header, then "Xem tất cả".
- **Function description:** Collects the events the Admin must react to, in the order they happened.
- **Screen layout:**

  `[Screenshot: admin notification centre]`

- **Function details:**
  - The bell carries the unread counter and refreshes while the console is open.
  - Each item can be marked "Đã đọc"; "Đọc hết" clears the whole unread badge at once.
  - Fail: the list offers "Tải lại" when it cannot load.

---

## 3.2.23 `<Owner>` Dashboard

### 3.2.23.1 `<Owner>` View business overview

- **Function trigger:** Owner signs in, or clicks "Bảng điều hành" in the sidebar.
- **Function description:** Tells the property owner, in one screen, how much the portfolio earned
  this month and what is waiting for their decision.
- **Screen layout:**

  `[Screenshot: owner dashboard — revenue / cost / profit cards, occupancy, pending lists]`

- **Function details:**
  - The portal header carries the search box ("Tìm kiếm bất động sản, quản lý, khách thuê..."),
    a live clock with the date, the notification bell and the account menu.
  - Money cards: "Doanh thu tháng này" ("{n} nhà đã duyệt giá"), "Tổng chi phí" ("Thuê căn + chi
    phí ghi nhận"), "Lợi nhuận ròng" ("Biên LN {n}%"), "Tỷ lệ lấp đầy" ("{n}/{m} phòng · đã duyệt
    giá").
  - Cost is broken down into "Thuê nhà nguyên căn" (what the company pays the building owners) and
    "Chi phí khác".
  - Work lists: "Nhà chờ duyệt giá" ("Chờ bạn chốt giá để vận hành", with a "Cần duyệt" badge) and
    "Bảo trì chờ xử lý"; empty state "Không có nhà nào chờ".
  - Only buildings whose price has been approved are counted, so the figures describe the part of
    the portfolio that is able to earn.

---

## 3.2.24 `<Owner>` Property portfolio

### 3.2.24.1 `<Owner>` View the property list

- **Function trigger:** Owner clicks "Bất động sản" in the "Vận hành" group.
- **Function description:** Every building the company operates for this owner, with the numbers an
  owner cares about: what is being collected, how full it is, and what is waiting for a decision.
- **Screen layout:**

  `[Screenshot: "Bất động sản" — approval banner, KPI cards, property cards]`

- **Function details:**
  - The page subtitle states the portfolio at a glance: "{n} tòa nhà đang quản lý · {m} phòng ·
    đang thu {tiền}/tháng · niêm yết cả danh mục {tiền}/tháng".
  - When files are waiting to be priced, an amber banner appears above everything else:
    "{n} hồ sơ đang chờ bạn phê duyệt giá" with the building names and "Xem & duyệt →" (3.2.25).
  - KPI cards: "TỔNG TÒA NHÀ", "ĐANG CÓ KHÁCH" ("{n}/{m} chỗ đã có người"), "ĐANG ĐỂ TRỐNG"
    ("chưa có khách nào") and "CHƯA THU ĐỦ THÁNG {kỳ}" ("Còn {tiền} chưa thu ({n} HĐ)").
  - The accent-insensitive search, "Bộ lọc", the card / table switch, the sort ("Mới thêm gần
    nhất") and the page size work as on the admin lists; status chips show the counts
    ("Tất cả", "Hoạt động").
  - Each card shows the operating state ("Hoạt động"), the commercial state ("Đang cho thuê" /
    "Còn phòng trống"), the rental type ("Chia phòng" / "Nguyên căn"), the district, "ĐANG THU
    {tiền} từ {n} hợp đồng" and the occupancy bar ("{n}/{m} phòng có khách").
  - Empty states: "Không có tòa nhà nào khớp bộ lọc." and "Chưa có tòa nhà nào đang quản lý."

### 3.2.24.2 `<Owner>` View a property

- **Function trigger:** Owner clicks a property card.
- **Function description:** Everything about one building: its rooms, its equipment and its current
  commercial state.
- **Screen layout:**

  `[Screenshot: owner property detail — tabs "Tổng quan" / "Phòng" / "Thiết bị"]`

- **Function details:**
  - Tabs: "Tổng quan", "Phòng", "Thiết bị".
  - Room states: "Phòng trống", "Đang thuê", "Bảo trì", "Chưa mở cho thuê"; a building ready to be
    sold is marked "Sẵn sàng cho thuê".
  - The photo gallery opens full screen, is navigated with the arrow keys ("Ảnh trước (←)") and
    closed with "Đóng (Esc)".

---

## 3.2.25 `<Owner>` Approve the listing price of a new property

### 3.2.25.1 `<Owner>` Open the approval queue

- **Function trigger:** Owner clicks "Xem & duyệt →" in the banner, or the dashboard card "Nhà chờ
  duyệt giá".
- **Function description:** Lists the files the Admin has handed over, separated by what kind of
  decision they need.
- **Screen layout:**

  `[Screenshot: "Hồ sơ chờ bạn phê duyệt giá" — two columns, search box]`

- **Function details:**
  - The dialog header counts both kinds: "{n} nhà mới · {m} cải tạo bổ sung — bấm vào một hồ sơ để
    xem và duyệt", with a search box over building name, address or district.
  - Left column — "Nhà mới — duyệt giá lần đầu": "Chưa từng cho thuê. Duyệt xong nhà được kích
    hoạt và bắt đầu nhận khách."
  - Right column — "Cải tạo bổ sung — duyệt lại giá": "Nhà đang cho thuê vừa cải tạo thêm. Chốt
    giá niêm yết mới; khách đang ở giữ giá hợp đồng." (3.2.26)
  - Each row opens the file with "Duyệt ›"; the footer totals "Tổng {n} hồ sơ chờ duyệt". An empty
    column shows "Không có hồ sơ nào".

### 3.2.25.2 `<Owner>` Review the money already spent on the building

- **Function trigger:** Owner opens a file from the queue.
- **Function description:** "Duyệt giá & Kích hoạt Tòa nhà — Xem toàn bộ tiền đã bỏ ra cho {tên
  nhà}, đặt mục tiêu lãi, rồi chốt giá cho thuê." This is the decision that turns an intake file
  into a sellable property.
- **Screen layout:**

  `[Screenshot: price approval page — building information, map, the three cost cards]`

- **Function details:**
  - "THÔNG TIN TÒA NHÀ" shows the address, "Loại hình", "Diện tích", "Cải tạo", "Số tầng",
    "Tổng phòng", "Mã KH điện", "Số danh bộ nước" and the description, next to the map. The header
    states when the Admin submitted it ("Admin gửi duyệt: {ngày}").
  - "TIỀN ĐÃ BỎ RA CHO TÒA NHÀ NÀY" — "Ba khoản dưới đây cộng lại là toàn bộ tiền bạn bỏ ra cho căn
    này — phải thu lại đủ qua tiền thuê trước khi hết hợp đồng":
    1. "TIỀN THUÊ TRẢ CHỦ NHÀ" with the master lease code, the owner's name, the period, its length
       and its state ("Đang trong thời hạn thuê");
    2. "CHI PHÍ CẢI TẠO" itemised (e.g. "Sơn sửa", "Điện nước", "Sàn nhà", "Kết cấu") with what each
       item covers;
    3. "THIẾT BỊ MUA MỚI" — "Chỉ tính thiết bị công ty **mua mới** để cho thuê. Đồ chủ nhà bàn giao
       được ghi nhận riêng và **không** tính vào tiền bỏ ra."
  - "TỔNG TIỀN ĐÃ BỎ RA" sums the three.
  - "TỪNG KHOẢN VỐN VÀ LỊCH KHẤU HAO" lists every item — "KHOẢN", "ÁP CHO" ("Cả nhà", "Khu vực
    chung", "Phòng {số}", or "Chia đều các phòng"), "SỐ TIỀN", "SỐ THÁNG", "ĐÃ LẤY LẠI", "CÒN LẠI",
    "MỖI THÁNG" — with the totals "TỔNG CÁC KHOẢN", "ĐÃ LẤY LẠI TỚI HÔM NAY", "CÒN PHẢI LẤY LẠI" and
    "MỖI THÁNG". The rule is stated once: "Mỗi khoản được lấy lại đều theo tháng từ ngày bắt đầu của
    nó. Khoản của đợt trước giữ nguyên số tiền mỗi tháng — đợt cải tạo bổ sung chỉ cộng thêm khoản
    mới, không tính lại từ đầu."
  - "THIẾT BỊ VẬN HÀNH" summarises what is installed ("{n} đang dùng · {tiền}").

### 3.2.25.3 `<Owner>` Compute the suggested rent

- **Function trigger:** Owner reviews the target panel, or clicks "Tính lại theo cấu hình".
- **Function description:** Derives the rent that recovers the capital and reaches the owner's
  profit target, showing every step instead of a single number.
- **Screen layout:**

  `[Screenshot: "MỤC TIÊU CỦA BẠN" panel and "TỪ TIỀN BỎ RA TỚI GIÁ THUÊ — TỪNG BƯỚC"]`

- **Function details:**
  - "MỤC TIÊU CỦA BẠN" repeats the pricing policy (3.2.27) — "Lấy từ Cấu hình duyệt giá — áp dụng
    cho mọi căn nhà. Muốn đổi thì sửa ở đó, không sửa riêng từng căn": "Cách tính giá", "Lãi muốn
    thu mỗi tháng", "Chi phí vận hành khác", the manager's salary share ("Lương QL — {tên} ({khu
    vực} · {lương} ÷ {n} nhà đang phụ trách)"), "Tổng chi phí mỗi tháng", "Tăng giá thuê mỗi năm",
    "Cộng thêm phòng trống" and "Trừ tháng trả nhà". "Sửa cấu hình duyệt giá" jumps to 3.2.27.
  - "TỪ TIỀN BỎ RA TỚI GIÁ THUÊ — TỪNG BƯỚC" — "Mỗi dòng là một bước tính, dùng đúng con số của dòng
    phía trên":
    - "Tổng tiền đã bỏ ra" → "Thời hạn hợp đồng với chủ nhà";
    - "Đã trôi mất trước khi cho thuê được" (with the arithmetic spelled out, e.g. "HĐ chủ nhà
      18/09/2026 → 17/09/2029 = 36 tháng tròn … Chỉ đếm tháng tròn");
    - "Trừ mấy tháng cuối để trả nhà cho chủ" — "Khách dọn đi, tháo nội thất, sơn sửa hoàn trả hiện
      trạng cho chủ nhà — nhà trống, không thu được tiền";
    - "Số tháng có tiền vào — dùng để chia vốn";
    - "Mỗi tháng phải lấy lại" + "Chi phí vận hành mỗi tháng" + "Dự phòng sửa chữa sau bảo hành" =
      "Thu tối thiểu mỗi tháng";
    - "Tiền lời muốn bỏ túi mỗi tháng" and "Cộng thêm cho tháng trống phòng {n}%" give
      "GIÁ THUÊ PHẢI ĐẠT MỖI THÁNG".
  - Fail: "Chưa tải được cấu hình duyệt giá. Tải lại trang hoặc mở "Cấu hình duyệt giá"."; "Cấu
    hình chưa có tiền lãi mục tiêu / tỷ lệ sinh lời mục tiêu. Vào "Cấu hình duyệt giá" để nhập
    trước."; "Không tính được giá"; "Không tải được dữ liệu".

### 3.2.25.4 `<Owner>` Fix the rent

- **Function trigger:** Owner edits the price fields at the bottom of the page.
- **Function description:** Sets the price that will actually be quoted to tenants.
- **Screen layout:**

  `[Screenshot: "CHỐT GIÁ THUÊ CẢ CĂN" (whole house) and "CHỐT GIÁ THUÊ TỪNG PHÒNG" (per room)]`

- **Function details:**
  - Whole house — "CHỐT GIÁ THUÊ CẢ CĂN": "Giá đề xuất đã bao gồm lãi mục tiêu. Bạn có thể sửa, hệ
    thống sẽ cảnh báo nếu xuống dưới mức hoà vốn." The panel shows "GIÁ GỢI Ý (ĐÃ TÍNH LÃI)" and the
    editable "Giá cho thuê áp dụng / tháng", with "Lấy giá đề xuất" and "↑ Làm tròn 100k".
  - Room by room — "CHỐT GIÁ THUÊ TỪNG PHÒNG ({n} phòng)": "Mỗi phòng một dòng, cùng loại số thẳng
    cột để so sánh. Bấm tên phòng để xem phòng đó gánh bao nhiêu tiền." The table lists "PHÒNG"
    (with its area), "VỐN CÒN PHẢI LẤY LẠI", "HOÀN VỐN / THÁNG", "GIÁ ĐỀ XUẤT", the editable
    "GIÁ ÁP DỤNG" and "LÃI TRƯỚC VẬN HÀNH", with a totals row and the check "TỔNG TIỀN THUÊ CÁC
    PHÒNG / THÁNG — Mục tiêu cần đạt: {tiền}" ("Vượt mục tiêu {tiền}"). Bulk actions:
    "Lấy giá đề xuất cho tất cả" and "Làm tròn lên 100k tất cả".
  - **Business rule:** the recovery is divided **equally across the rooms**, not weighted by area —
    the per-room column "ÁP CHO" reads "Chia đều các phòng", and two rooms of different size in the
    same building carry the same listed rent.
  - "NẾU CHỐT GIÁ NÀY, CẢ KỲ {n} THÁNG" previews the consequence: "Tổng tiền thuê thu về",
    "Trừ tiền đã bỏ ra", "Lãi dự kiến cả kỳ", "Lãi trung bình mỗi tháng".
  - "LÃI LỖ THẬT CỦA CẢ KỲ {n} THÁNG" then shows the honest figure — "Chi phí vận hành đã cộng vào
    giá thuê nên khách trả, nhưng đó vẫn là tiền bạn chi ra hằng tháng — phải trừ đi, không thì
    tính lãi hai lần": total rent received, minus capital, minus operating cost, minus the
    post-warranty repair reserve → "TIỀN LỜI THẬT CẢ KỲ" and "Tiền lời thật trung bình mỗi tháng".
    A side panel explains "VÌ SAO LÃI RÒNG {tiền}/THÁNG CHỨ KHÔNG PHẢI {mục tiêu}" (target × months
    plus the vacancy margin), noting that "Phần vượt mục tiêu chủ yếu đến từ biên dự phòng trống
    phòng — nó chỉ thành lãi khi phòng cho thuê được liên tục."
  - A sticky bar keeps the decision visible while scrolling: "GIÁ CHỐT / THÁNG", "TIỀN LỜI THẬT /
    THÁNG" (with the target beneath it), "TIỀN LỜI THẬT CẢ KỲ ({n} THÁNG)" and the action
    "Xác nhận & Kích hoạt".

### 3.2.25.5 `<Owner>` Activate the property

- **Function trigger:** Owner clicks "Xác nhận & Kích hoạt".
- **Function description:** Fixes the listing price and opens the building for business.
- **Screen layout:**

  `[Screenshot: "XÁC NHẬN LẦN CUỐI — Kích hoạt cho thuê" dialog]`

- **Function details:**
  - The dialog repeats "GIÁ CHỐT / THÁNG", "TIỀN LỜI THẬT / THÁNG", "Kỳ thu được tiền", "Tiền lời
    thật cả kỳ" and names the manager who will take the building over ("Quản lý sẽ nhận nhà:
    {tên} · {khu vực}").
  - "SAU KHI KÍCH HOẠT" states the consequences: "Nhà lên danh sách cho thuê và quản lý khu vực bắt
    đầu vận hành."; "Giá này là giá bán cho khách vào ở. **Chỉ sửa được khi đơn vị còn TRỐNG** — có
    khách rồi thì khoá tới lúc khách rời đi, vì hợp đồng đã ký là cam kết hai chiều."; "Muốn đổi giá
    thì đổi ngay bây giờ, đừng chờ tới lúc đã nhận khách."
  - "Xem lại" returns to the page; "Kích hoạt cho thuê" commits.
  - Success: the building goes live — its vacant units appear on the public website (3.2.1.2) and
    the operations manager starts running it.
  - Fail: "Lỗi khi xác nhận" — the price is not fixed and the file stays in the queue.

---

## 3.2.26 `<Owner>` Approve a new price after a supplementary renovation

### 3.2.26.1 `<Owner>` Re-approve the listing price

- **Function trigger:** Owner opens a file from the column "Cải tạo bổ sung — duyệt lại giá".
- **Function description:** Decides whether the money spent on the new round is passed on to future
  tenants, and at what price.
- **Screen layout:**

  `[Screenshot: repricing page — cost of this round, tenants in place, new listed price]`

- **Function details:**
  - "Tổng chi đợt này" is split into "Tính vào giá" (an upgrade, which raises the listing price) and
    "Công ty tự chịu" (a like-for-like replacement, which does not); "Khoản công ty tự chịu tính thế
    nào" explains the split and "Quy tắc tính giá niêm yết mới" states the rule in full.
  - "KHÁCH ĐANG Ở" names the tenants who keep their current rent, or confirms "Không phòng nào có
    khách — giá mới áp dụng ngay khi duyệt."
  - "Xem chi tiết từng khoản vốn và lịch khấu hao" opens the same capital table as 3.2.25.2, where
    the new round is added as extra rows rather than restarting the schedule.
  - Price options: "Giá cũ + phần cải tạo", "Giữ nguyên giá cũ", "Làm tròn lên 100k", applied with
    "Dùng giá này".
  - The sticky bar shows "GIÁ NIÊM YẾT MỚI / THÁNG" with the difference against the old price
    ("+{tiền} so với cũ") and the action "Duyệt giá mới", confirmed with "Duyệt giá niêm yết mới?".
  - Success: the new price applies to future tenancies; tenants already in place are untouched.
  - Fail: the previous price stays and the error is displayed.

---

## 3.2.27 `<Owner>` Configure the pricing policy

### 3.2.27.1 `<Owner>` Set the profit target, the costs and the risk margins

- **Function trigger:** Owner clicks "Cấu hình giá" in the "Hệ thống" group, or "Sửa cấu hình duyệt
  giá" from a price approval page.
- **Function description:** "Cấu hình duyệt giá — Áp dụng cho **tất cả** căn nhà. Màn duyệt giá của
  từng căn sẽ dùng đúng những số này — không phải nhập lại ở đó nữa."
- **Screen layout:**

  `[Screenshot: "Cấu hình duyệt giá" — the four blocks and the "MÁY CHỦ SẼ NHẬN" summary]`

- **Function details:**
  - **"MỤC TIÊU LỢI NHUẬN" — "Định giá theo cách nào?"**: "Theo tiền lãi" ("Biết muốn lãi/tháng")
    with the field "Tiền lãi muốn thu mỗi tháng" ("Tiền lời **thực nhận** mỗi tháng của **mỗi căn**,
    sau khi đã trừ chi phí vận hành và phần thu hồi vốn"), or "Theo % sinh lời" ("Biết % lời/năm")
    with "Tỷ lệ sinh lời mong muốn mỗi năm".
  - **"CHI PHÍ VẬN HÀNH MỖI THÁNG"**: "Chi phí vận hành khác (không gồm lương quản lý)" —
    "Internet, vệ sinh, bảo trì định kỳ… — tiền mặt chi ra hằng tháng cho mỗi căn." Underneath,
    "Lương quản lý vận hành" is shown for reference only ("Chỉ hiển thị để đối chiếu. Mỗi căn gánh
    **lương ÷ số nhà** người đó đang phụ trách") as a table of "QUẢN LÝ", "LƯƠNG / THÁNG",
    "ĐANG COI" and "MỖI NHÀ GÁNH", with "Sửa bảng lương" jumping to 3.2.31.
  - **"TĂNG GIÁ THUÊ HẰNG NĂM"**: "Tăng mỗi năm dương lịch" (%, "Áp vào 01/01, cộng dồn. Để 0 nếu
    không tăng"), "Ân hạn cho khách mới" (months — a tenant who has not rented that long by 01/01
    has the increase postponed a year) and "Báo giá năm sau trước" (months — from that point the
    manager quotes next year's price). A simulator ("THỬ: KHÁCH BẮT ĐẦU THUÊ" + "GIÁ LÚC KÝ") shows
    the resulting schedule year by year, noting that "Kỳ bị hoãn là **bỏ hẳn**, không nợ rồi trả bù
    vào năm sau."
    - A contract warning is shown in place: "Điều khoản này phải có trong hợp đồng khách ký. Hợp
      đồng chỉ ghi mỗi "{giá}/tháng" rồi sau đó báo tăng là **sửa hợp đồng đơn phương** — khách có
      quyền từ chối. Mẫu hợp đồng phải in rõ mức tăng (5%/năm) và mốc tăng (01/01) để khách đọc
      trước khi ký."
    - Status: "Đang chạy thật. Hệ thống tự tăng giá vào 01/01 hằng năm, bỏ qua khách còn trong ân
      hạn, và **báo cho khách trước 15 ngày**. Điều khoản được in sẵn vào file hợp đồng. Sửa ở đây
      là đổi chính sách cho các hợp đồng ký sau khi lưu."
  - **"DỰ PHÒNG RỦI RO"**: "Biên dự phòng trống phòng" (%, "Bù những tháng phòng bỏ trống. Thường
    để 10%.", with "Cách {n}% này vào giá" explaining the arithmetic) and "Trừ cửa sổ bàn giao cuối
    kỳ" (months, "Số tháng cuối hợp đồng chủ nhà **không tính doanh thu**: khách dọn đi, tháo nội
    thất, sơn sửa hoàn trả hiện trạng — nhà trống, không thu được tiền. Để 0 nếu không cần chừa
    tháng nào."). A guard is stated: a master lease with under six months left is never shortened
    further, "vì trừ 1 tháng trên 3 tháng là mất 1/3 thời gian thu tiền".
  - **"MÁY CHỦ SẼ NHẬN"** mirrors what will be stored — "Cách định giá", "Lãi mục tiêu / tháng",
    "Chi phí vận hành khác", "+ Lương QL (bình quân)", "Tổng chi phí / tháng", "Biên trống phòng",
    "Cửa sổ bàn giao" — and explains why the two cost lines are merged before sending. "Lưu cấu
    hình" saves; "Về danh sách bất động sản" leaves.
  - Validation: "Nhập tiền lãi muốn thu mỗi tháng (lớn hơn 0)." / "Nhập tỷ lệ sinh lời mong muốn mỗi
    năm (lớn hơn 0%)."
  - Success: "Đã lưu cấu hình lên máy chủ — mọi màn duyệt giá dùng số này.", with the badge
    "Đã đồng bộ máy chủ".
  - Partial success: "Đã lưu trên máy này. Máy chủ chưa nhận được — xem cảnh báo bên dưới.", badge
    "Chỉ lưu trên máy này".
  - A policy that has never been filled shows "Chưa cấu hình", and every price approval blocks
    until it is.

---

## 3.2.28 `<Owner>` Tenants

### 3.2.28.1 `<Owner>` View tenants

- **Function trigger:** Owner clicks "Khách thuê" in the "Vận hành" group.
- **Function description:** "Ai đang ở đâu, phòng nào còn trống."
- **Screen layout:**

  `[Screenshot: "Khách thuê" — KPI cards, property sidebar, tenant table]`

- **Function details:**
  - KPI cards: "KHÁCH ĐANG Ở", "CHỖ CÒN TRỐNG" ("Trên tổng {n} chỗ"), "SẮP HẾT HẠN ≤60N" ("Cần chốt
    gia hạn sớm") and "KHÁCH ĐÃ RỜI ĐI" ("Nằm ở tab riêng, tra khi cần").
  - The left sidebar lists the buildings with their occupancy ("4/5"), searchable and narrowable
    with "Chỉ hiện căn đang có khách".
  - Tabs: "Đang thuê", "Sơ đồ phòng" (the building drawn as a room map, each room coloured by
    state) and "Đã rời đi"; the search box matches tenant name, phone, ID number or room.
  - The table lists "KHÁCH THUÊ" (name, phone and ID number, each masked by default and revealed
    with its eye icon), "CHỖ Ở" (building, room and "Đang ở"), "THỜI GIAN THUÊ" (period and length),
    "TIỀN PHÒNG" and "LỊCH SỬ" ("{n} hợp đồng").
  - "Xem điều khoản & hồ sơ hợp đồng →" opens the contract screen (3.2.29).
  - Fail: "Không tải được danh sách bất động sản", "Không tải được dữ liệu khách thuê", "Không tải
    được danh sách phòng của căn này".

---

## 3.2.29 `<Owner>` Contracts

### 3.2.29.1 `<Owner>` View contracts

- **Function trigger:** Owner clicks "Hợp đồng" in the "Vận hành" group.
- **Function description:** "Hợp đồng cho khách thuê (nguồn thu) và master lease ký với chủ nhà
  (nguồn chi) — bấm một dòng để xem toàn bộ chi tiết."
- **Screen layout:**

  `[Screenshot: "Hợp đồng" — two tabs, six KPI cards, contract table]`

- **Function details:**
  - Tabs with their counts: "Quản lý ↔ Khách thuê" and "Owner ↔ Chủ nhà (master lease)".
  - KPI cards: "TỔNG HỢP ĐỒNG" ("{n} đang chạy"), "ĐANG HIỆU LỰC" ("{tiền}/tháng"),
    "CHỜ ĐÓN KHÁCH" ("Đã lập hồ sơ, chưa giao phòng"), "CHỜ KÍCH HOẠT" ("Đã giao phòng, chờ thu
    tiền"), "SẮP HẾT HẠN ≤60N" ("Cần chốt gia hạn sớm") and "ĐÃ KẾT THÚC" ("Chấm dứt + hết hạn").
  - View tabs: "Đang theo dõi", "Đã kết thúc", "Tất cả"; filters "Tất cả trạng thái", "Tất cả bất
    động sản" and the sort "Mới tạo trước"; the search box matches contract code, tenant name,
    phone, ID number, building or room. When ended contracts are hidden, the list says so
    ("Còn {n} kết quả ở nhóm đã kết thúc — xem tất cả").
  - The table lists "MÃ HĐ", "KHÁCH THUÊ" (with the masked phone and its eye icon), "BẤT ĐỘNG SẢN"
    (building, room and district), "THỜI HẠN" (period plus "Còn {n} ngày" or "Quá hạn {n} ngày"),
    "GIÁ THUÊ / CỌC" and "TRẠNG THÁI" ("Chờ đón khách", "Đang hiệu lực", …). A row opens the
    contract drawer.
  - Note: the state "Chờ đón khách" is a prepared tenancy waiting for the tenant to move in — the
    user interface never calls it a "draft".
  - Fail: "Không tìm thấy hợp đồng {mã} trong danh sách đang tải."; the page offers "Làm mới",
    "Thử lại" and "Xoá bộ lọc".

---

## 3.2.30 `<Owner>` Extension requests

### 3.2.30.1 `<Owner>` Follow extension requests

- **Function trigger:** Owner clicks "Đơn gia hạn" in the "Vận hành" group.
- **Function description:** Lets the owner see which tenants asked to stay longer and how each
  request was settled. The decision itself belongs to the Admin (3.2.14).
- **Screen layout:**

  `[Screenshot: owner extension requests list]`

- **Function details:**
  - Requests are listed with the tenant, the building and room, the requested duration and the
    current state ("Chờ duyệt" or decided).
  - Success: the Owner can anticipate which rooms will free up and which will not.

---

## 3.2.31 `<Owner>` Operations managers

### 3.2.31.1 `<Owner>` View operations managers

- **Function trigger:** Owner clicks "Quản lý vận hành" in the "Nhân sự" group.
- **Function description:** "{n} quản lý vận hành đang giám sát các bất động sản Hoàng Bình Land" —
  the people who run the buildings day to day, and how much each carries.
- **Screen layout:**

  `[Screenshot: "Quản lý vận hành" — two KPI cards, manager rows with their workload]`

- **Function details:**
  - KPI cards: "{n} Quản lý · đều đang hoạt động" and "{m} Khách thuê đang ở".
  - Each row shows the name, the username and phone number, and the workload: "{n} khu vực",
    "{m} nhà", "{k} khách", "{p}% lấp đầy", "{q} bảo trì"; the row expands for the detail.
  - The search box matches name or phone number; a manager with no district is flagged "Chưa phụ
    trách khu vực nào".

### 3.2.31.2 `<Owner>` Record the manager salary table

- **Function trigger:** Owner clicks "Lương quản lý" in the "Nhân sự" group, or "Sửa bảng lương" in
  the pricing policy.
- **Function description:** Records what each operations manager is paid, so the salary can be
  spread over the buildings they cover and enter the price calculation (3.2.27).
- **Screen layout:**

  `[Screenshot: salary page — per-manager salary inputs, payroll summary]`

- **Function details:**
  - Each row shows the manager, the districts they cover ("Phụ trách", "đang coi") and the salary
    field; a manager with no district shows "Chưa gán", an empty salary shows "Chưa nhập".
  - Summary cards: "Tổng quỹ lương", "Số nhà gánh lương" ("{n} nhà"), "Bình quân mỗi nhà".
  - "Lưu bảng lương" saves; the button shows "Đang lưu…" while saving.
  - Success: "Đã lưu bảng lương lên máy chủ." with the badge "Đã đồng bộ máy chủ".
  - Partial success: "Đã lưu trên máy này — máy chủ chưa có nơi lưu bảng lương.", badge "Chỉ lưu
    trên máy này".

---

## 3.2.32 `<Owner>` Assign operations managers to zones

### 3.2.32.1 `<Owner>` View the zone assignment board

- **Function trigger:** Owner clicks "Phân công khu vực" in the "Nhân sự" group.
- **Function description:** "Khu vực & Quản lý — Mỗi quận/huyện do **một** quản lý vận hành phụ
  trách — gán cho khu vực là gán cho mọi nhà bên trong." The Owner is the role that decides.
- **Screen layout:**

  `[Screenshot: "Khu vực & Quản lý" (owner view) — KPI cards, zone rows with their actions]`

- **Function details:**
  - KPI cards: "Tổng khu vực" and "{n}/{m} Đều đã có quản lý".
  - Filters: search by district or manager name, "Tất cả quản lý", and the sort "Việc cần xử lý
    trước"; each row shows the district, its badge ("Đã gán"), its size ("{n} nhà · {m} đơn vị")
    and the assigned manager.
  - A district whose manager account is disabled is flagged "Tài khoản quản lý của khu vực này đang
    không hoạt động".

### 3.2.32.2 `<Owner>` Assign, change or remove the manager of a zone

- **Function trigger:** Owner clicks "Đổi quản lý" on a district row, or "Gỡ" to leave it unassigned.
- **Function description:** Hands every building of a district over to a manager, in one action.
- **Screen layout:**

  `[Screenshot: assign manager dialog with the impact summary]`

- **Function details:**
  - Before confirming, the dialog states the blast radius: how many buildings ("{n} nhà") and how
    many running contracts ("{n} hợp đồng") change hands.
  - Success: the district shows the new manager and every building inside follows; this assignment
    is what the rest of the system reads as the building's operations manager — including the
    onboarding form (3.2.7.2), which refuses to create a tenancy in a building with no manager.
  - Fail: the previous assignment is kept and the server error is displayed; "Hủy" closes the dialog
    without changing anything.

---

## 3.2.33 `<Owner>` Cash-flow overview

### 3.2.33.1 `<Owner>` Reconcile money in and money out

- **Function trigger:** Owner clicks "Tổng quan" in the "Tài chính" group.
- **Function description:** "Quản lý Dòng tiền — Đối soát dòng tiền vào/ra & lợi nhuận ròng các nhà
  đã duyệt giá."
- **Screen layout:**

  `[Screenshot: "Quản lý Dòng tiền" — KPI cards, monthly chart, cost structure, per-property table]`

- **Function details:**
  - The period is chosen at the top (month picker plus "Tháng" / "Quý" / "Năm"), with "Xuất Excel"
    and a refresh control.
  - KPI cards, each with its change against the previous period: "DÒNG TIỀN VÀO" ("Còn {tiền} chưa
    thu ({n} HĐ)"), "DÒNG TIỀN RA" ("Thuê căn + chi phí khác"), "LỢI NHUẬN RÒNG" ("Biên LN {x}% ·
    ROI {y}%") and "TỶ LỆ LẤP ĐẦY TB" ("{n} nhà đã duyệt giá").
  - "Dòng tiền vào / ra & lợi nhuận ròng — theo tháng" charts the three series across the recent
    periods; "Cơ cấu dòng tiền ra" breaks the spending down by category.
  - "Đối soát tự động theo từng nhà đã duyệt giá" — "So khớp dòng tiền vào (thu phòng, dịch vụ) với
    dòng tiền ra (thuê căn + chi phí) → lợi nhuận ròng, lấp đầy & ROI" — is searchable by building
    or manager, filterable by management state and rental type ("Tất cả", "Nguyên căn", "Theo
    phòng"), and sortable ("Lợi nhuận cao → thấp").

---

## 3.2.34 `<Owner>` Invoices

### 3.2.34.1 `<Owner>` View invoices

- **Function trigger:** Owner clicks "Hoá đơn" in the "Tài chính" group. This screen is Owner-only:
  the Admin cannot open it.
- **Function description:** Every invoice issued to the tenants of this portfolio and its collection
  state.
- **Screen layout:**

  `[Screenshot: owner invoices — KPI cards, filters, invoice table]`

- **Function details:**
  - Filters: invoice type ("Mọi loại hoá đơn" / "Tiền phòng" / "Tiền điện" / "Tiền nước" / "Dịch
    vụ" / "Phí bảo trì" / "Khác"), property ("Tất cả bất động sản"), state ("Chờ thanh toán",
    "Đã thanh toán", "Quá hạn", "Đã huỷ") and reconciliation ("Chờ đối soát", "Đã xác nhận",
    "Bị từ chối").
  - Sorting: "Mới phát hành nhất", "Hạn thu gần nhất", "Số tiền cao → thấp", "Số tiền thấp → cao",
    "Cũ nhất". "Xuất Excel" exports the filtered list.
  - Fail: the page offers "Tải lại dữ liệu".

---

## 3.2.35 `<Owner>` Receivables

### 3.2.35.1 `<Owner>` View receivables by age

- **Function trigger:** Owner clicks "Công nợ" in the "Tài chính" group. Owner-only.
- **Function description:** Shows the money owed to the company sorted by how long it has been
  owed, which is what decides who is called first.
- **Screen layout:**

  `[Screenshot: receivables aging — aging buckets, debtor table]`

- **Function details:**
  - Aging buckets: "Chưa tới hạn", "Quá hạn 1–30 ngày", "Quá hạn 31–60 ngày", "Quá hạn 61–90 ngày",
    "Quá hạn > 90 ngày", or "Mọi tuổi nợ"; states "Chưa thu", "Quá hạn", "Đã thu".
  - Sorting: "Mới nhất (hạn thu gần đây)", "Quá hạn lâu nhất", "Số tiền cao → thấp", "Số tiền thấp
    → cao", "Cũ nhất"; the list can be narrowed to one property.

---

## 3.2.36 `<Owner>` Deposit ledger

### 3.2.36.1 `<Owner>` Track deposits

- **Function trigger:** Owner clicks "Sổ cọc" in the "Tài chính" group. Owner-only.
- **Function description:** "Tiền cọc đang giữ của khách thuê — khoản phải hoàn khi kết thúc hợp
  đồng (không phải doanh thu)."
- **Screen layout:**

  `[Screenshot: "Sổ cọc" — KPI cards, status chips, deposit table]`

- **Function details:**
  - KPI cards: "TỔNG CỌC ĐANG GIỮ" ("Khoản phải trả lại khách"), "SỐ KHOẢN ĐANG GIỮ" ("trên tổng
    {n} khoản trong sổ"), "ĐÃ HOÀN" and "CẦN TẤT TOÁN" ("HĐ hết hạn nhưng còn giữ cọc").
  - "Danh sách cọc theo hợp đồng" states the totals ("{n} khoản · tổng {tiền}") and is filtered by
    status chips with counts: "Tất cả", "Chưa thu", "Đang giữ", "Khách báo chưa nhận", "Chờ khách
    xác nhận", "Đã hoàn", "Tịch thu". The search box matches tenant, contract code, property, room
    or phone; sorting starts at "Mới nhất (giữ cọc gần đây)".
  - The table lists "KHÁCH THUÊ" (with the contract code), "BẤT ĐỘNG SẢN / PHÒNG", "TIỀN CỌC",
    "GIỮ TỪ", "KẾT THÚC HĐ", "TRẠNG THÁI" and the action "Đánh dấu đã hoàn"; "Xuất Excel" exports
    the ledger.
  - Each row explains its own state, for example: "Đã hoàn cọc và khách đã xác nhận nhận đủ.",
    "Đã ghi nhận chuyển cọc, đang chờ khách xác nhận đã nhận đủ.", "Hợp đồng đã hết hạn nhưng chưa
    thanh lý — chờ quản lý kiểm tra phòng và quyết toán xong.", "Khách chưa gửi yêu cầu trả phòng —
    cọc đang bảo đảm cho hợp đồng đang chạy."
  - **Business rule:** the deposit is never netted against unpaid charges. It cannot be returned
    while the tenant still owes money — the row then states "Khách còn khoản chưa thanh toán
    {tiền}. Thu đủ rồi mới hoàn cọc được."
  - If a tenant contests the returned amount, the case is escalated to the Admin (3.2.17).

---

## 3.2.37 `<Owner>` Reports and analytics

### 3.2.37.1 `<Owner>` View financial and operational reports

- **Function trigger:** Owner clicks "Báo cáo" in the "Tài chính" group.
- **Function description:** "Hiệu suất vận hành và tài chính Hoàng Bình Land" over consecutive
  periods.
- **Screen layout:**

  `[Screenshot: "Báo cáo & Phân tích" — KPI cards, multi-period chart, financial table]`

- **Function details:**
  - The window is switched between "6 kỳ" and "12 kỳ", with a refresh control and "Xuất Excel".
  - KPI cards: "DOANH THU {n} KỲ", "CHI PHÍ {n} KỲ", "LỢI NHUẬN RÒNG" ("Biên lợi nhuận {x}%") and
    "TỶ LỆ LẤP ĐẦY HIỆN TẠI" ("{n}/{m} phòng đang thuê").
  - "Doanh thu · Chi phí · Lợi nhuận theo kỳ" charts the three series; "Báo cáo tài chính — {n} kỳ
    gần đây" tabulates "KỲ", "DOANH THU", "CHI PHÍ", "LỢI NHUẬN" and "BIÊN LỢI NHUẬN" (a period
    with no revenue is labelled "chưa có doanh thu").
  - Properties can be ranked by "Doanh thu cao → thấp", "Lợi nhuận cao → thấp", "Lấp đầy cao nhất",
    "Lấp đầy thấp nhất", "Tên nhà A → Z"; "Hiệu suất quản lý" lists each manager with "SĐT",
    "Số nhà phụ trách" and "HĐ khách đang hiệu lực".

---

## 3.2.38 `<Owner>` Notification centre

### 3.2.38.1 `<Owner>` Read notifications

- **Function trigger:** Owner clicks "Thông báo" in the "Hệ thống" group, or the bell in the header.
  The menu item carries the unread count.
- **Function description:** "Trung tâm Thông báo — {n} thông báo chưa đọc": the events an owner must
  not miss, filtered by what they are about.
- **Screen layout:**

  `[Screenshot: "Trung tâm Thông báo" — type filters, status filters, notification list]`

- **Function details:**
  - "LOẠI THÔNG BÁO" filters by category with its count, for example "Tất cả (50)", "Chờ phê duyệt
    (11)" and "Cảnh báo phòng trống (39)"; other categories used by the system are "Hợp đồng hết
    hạn", "Hóa đơn chưa thu" and "Bảo trì trễ hạn".
  - "TRẠNG THÁI" filters by "Tất cả", "Chưa đọc", "Đã đọc".
  - Each item shows its subject, its category, its priority when relevant ("Cao"), its body and its
    timestamp — for example "Căn đã trống, giá quay về {tiền} — kiểm tra lại giá trước khi đăng." —
    with a mark-as-read control and a dismiss control. "Đánh dấu tất cả đã đọc" clears the badge.
  - Success: opening a notification navigates to the screen that can act on it — for example a
    price approval opens 3.2.25.
