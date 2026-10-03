# 3.2 Ứng dụng Web

> **Phạm vi.** Hệ thống Hoàng Bình Land gồm hai ứng dụng. **Ứng dụng web** mô tả ở mục này phục
> vụ ba vai trò: **Khách vãng lai** (website công khai, không cần tài khoản), **Quản trị viên**
> (Admin — vận hành hệ thống) và **Chủ nhà** (Owner — chủ sở hữu bất động sản). Hai vai trò còn
> lại là **Quản lý vận hành** (Manager) và **Khách thuê** (Tenant) chỉ làm việc trên ứng dụng di
> động, được mô tả ở mục 3.3. Tài khoản Quản lý vận hành đăng nhập trên web sẽ bị từ chối có chủ
> đích (xem 3.2.2.1).
>
> Các màn hình được nhóm theo vai trò, sắp theo đúng thứ tự menu bên trái của từng cổng. Nhãn
> giao diện được trích nguyên văn tiếng Việt như hiển thị trên sản phẩm.

---

## 3.2.1 `<Khách vãng lai>` Website công khai

### 3.2.1.1 `<Khách vãng lai>` Xem trang chủ

- **Điều kiện kích hoạt:** Khách vãng lai mở địa chỉ gốc của website `/`.
- **Mô tả chức năng:** Trang chủ giới thiệu Hoàng Bình Land và cho phép người truy cập bắt đầu tìm
  chỗ thuê mà không cần tạo tài khoản.
- **Bố cục màn hình:**

  `[Ảnh: trang chủ công khai — banner, thanh tìm kiếm nhanh, danh sách nổi bật]`

- **Chi tiết chức năng:**
  - Phần banner nêu định vị của công ty và ba cam kết ("Hợp đồng điện tử", "Giá minh bạch",
    "Quản lý đồng hành") kèm các con số: số bất động sản đang quản lý, số khách thuê đã đồng hành
    và mức độ hỗ trợ.
  - Thanh tìm kiếm nhanh cho chọn "Khu vực", "Mức giá", "Loại hình thuê" rồi bấm "Tìm kiếm".
  - Khối "Bất động sản được quan tâm nhất" liệt kê các tin nổi bật; "Xem tất cả" chuyển sang trang
    danh sách đầy đủ.
  - Thành công: các tin nổi bật hiển thị dạng thẻ gồm ảnh, tên, quận/huyện, diện tích và giá thuê
    theo tháng.
  - Thất bại: khi không gọi được API công khai, khối đó hiển thị trạng thái rỗng, phần còn lại của
    trang vẫn dùng được bình thường.

### 3.2.1.2 `<Khách vãng lai>` Tìm kiếm và lọc bất động sản cho thuê

- **Điều kiện kích hoạt:** Khách bấm "Xem nhà đang cho thuê" ở trang chủ, submit thanh tìm kiếm
  nhanh, hoặc mở thẳng `/properties`.
- **Mô tả chức năng:** Cho phép khách duyệt toàn bộ bất động sản đang mở cho thuê và thu hẹp danh
  sách theo ngân sách và khu vực mong muốn.
- **Bố cục màn hình:**

  `[Ảnh: trang danh sách — khung bộ lọc bên trái, thẻ kết quả bên phải]`

- **Chi tiết chức năng:**
  - Bộ lọc cơ bản: quận/huyện ("Tất cả quận/huyện"), loại hình thuê ("Mọi loại hình"), khoảng giá
    ("Giá tối thiểu" / "Giá tối đa").
  - "Lọc nâng cao" bổ sung diện tích, "Số phòng ngủ" và "Tiện ích".
  - "Xóa bộ lọc" xoá mọi điều kiện và tải lại toàn bộ danh sách.
  - Chỉ những bất động sản đã được Owner duyệt giá và còn chỗ trống mới được đăng lên trang này;
    nhà đã kín khách không xuất hiện.
  - Thành công: kết quả hiển thị dạng thẻ, bấm vào thẻ sẽ mở trang chi tiết.
  - Thất bại: khi không có kết quả, trang hiển thị "Không tìm thấy bất động sản phù hợp" kèm gợi ý
    "Hãy thử điều chỉnh hoặc xóa bớt bộ lọc."; khi toàn bộ danh mục rỗng thì hiển thị "Hiện chưa có
    chỗ trống".

### 3.2.1.3 `<Khách vãng lai>` Xem chi tiết bất động sản

- **Điều kiện kích hoạt:** Khách bấm vào một thẻ bất động sản ở trang chủ hoặc trang danh sách.
- **Mô tả chức năng:** Cung cấp đủ thông tin để khách quyết định có gọi điện đặt lịch xem nhà hay
  không.
- **Bố cục màn hình:**

  `[Ảnh: trang chi tiết — thư viện ảnh, khối giá, bảng chi phí, bản đồ]`

- **Chi tiết chức năng:**
  - Trang hiển thị thư viện ảnh, "Giá thuê", "Diện tích", "Khu vực", "Loại hình", "Mô tả chi tiết",
    "Nội thất & tiện ích" và "Vị trí trên bản đồ".
  - Khối "Chi phí & điều khoản" công khai trước mọi khoản tiền: "Đặt cọc", "Đơn giá điện",
    "Đơn giá nước", "Phí dịch vụ" và, với nhà chia phòng, "Số phòng trong dãy".
  - Khối "Cam kết từ Hoàng Bình Land" khẳng định tin đăng đã được xác minh và do công ty trực tiếp
    quản lý, hỗ trợ xem nhà 24/7.
  - Thẻ liên hệ rút gọn lặp lại hotline để khách gọi ngay từ trang này.
  - "Bất động sản tương tự" gợi ý các tin khác cùng khu vực.
  - Thành công: toàn bộ thông tin chi tiết được hiển thị.
  - Thất bại: nếu nhà vừa được thuê hoặc đã gỡ khỏi danh sách, trang hiển thị "Không tìm thấy bất
    động sản" kèm giải thích tin có thể đã được thuê.

### 3.2.1.4 `<Khách vãng lai>` Liên hệ với công ty

- **Điều kiện kích hoạt:** Khách bấm "Liên hệ tư vấn" trên thanh điều hướng, ở banner, hoặc thẻ
  liên hệ trong trang chi tiết.
- **Mô tả chức năng:** Đưa người quan tâm tới đúng một người thật để được tư vấn.
- **Bố cục màn hình:**

  `[Ảnh: trang liên hệ — thẻ hotline và địa chỉ văn phòng]`

- **Chi tiết chức năng:**
  - Trang hiển thị hotline và địa chỉ văn phòng. Bấm "Gọi ngay {hotline}" sẽ mở trình quay số trên
    trình duyệt di động.
  - Hệ thống cố ý không đặt form gửi yêu cầu tư vấn: không hứa gọi lại khi chưa có cơ chế theo dõi.
    Mọi yêu cầu tư vấn đi vào hệ thống qua hotline.

### 3.2.1.5 `<Khách vãng lai>` Trang kết quả thanh toán

- **Điều kiện kích hoạt:** Cổng thanh toán chuyển hướng trình duyệt về `/payment-success` hoặc
  `/payment-cancel` sau khi khách thuê thanh toán hoá đơn từ ứng dụng di động.
- **Mô tả chức năng:** Báo cho người trả tiền biết kết quả giao dịch và đưa họ quay lại ứng dụng.
- **Bố cục màn hình:**

  `[Ảnh: trang kết quả thanh toán — trạng thái thành công và trạng thái huỷ]`

- **Chi tiết chức năng:**
  - Thành công: trang hiển thị "Thanh toán thành công", mã đơn và ghi chú "Cảm ơn bạn. Hoá đơn sẽ
    được cập nhật trạng thái đã thanh toán trong ít phút."
  - Thất bại / huỷ: trang hiển thị "Đã huỷ thanh toán" và "Giao dịch chưa được thực hiện. Bạn có
    thể quay lại ứng dụng và thanh toán lại bất cứ lúc nào."
  - Cả hai trạng thái đều có "Về trang chủ". Trang này chỉ là điểm tiếp nhận chuyển hướng, bản thân
    nó không đổi trạng thái hoá đơn — việc đó do backend xử lý khi cổng thanh toán gọi về.

---

## 3.2.2 `<Khách vãng lai>` Xác thực / Phân quyền

### 3.2.2.1 `<Khách vãng lai>` Đăng nhập

- **Điều kiện kích hoạt:** Khách mở `/login` (hoặc bị chuyển về đây khi mở một URL cần đăng nhập),
  nhập "Tên đăng nhập" và "Mật khẩu" rồi bấm "Đăng nhập".
- **Mô tả chức năng:** Khách đăng nhập vào cổng quản trị để hệ thống xác định vai trò và mở đúng
  cổng làm việc tương ứng.
- **Bố cục màn hình:**

  `[Ảnh: trang đăng nhập — khối thương hiệu bên trái, form đăng nhập bên phải]`

- **Chi tiết chức năng:**
  - Ô mật khẩu có thể bật/tắt hiển thị bằng nút "Hiện mật khẩu" / "Ẩn mật khẩu".
  - Nút hiển thị "Đang đăng nhập..." trong lúc gửi yêu cầu; gõ lại vào một trong hai ô sẽ xoá thông
    báo lỗi cũ.
  - Backend trả về JWT token và vai trò tài khoản; token được lưu lại để mọi lời gọi API sau đó tự
    đính kèm theo chuẩn Bearer.
  - Thành công:
    - Vai trò `ROLE_ADMIN` → chuyển tới cổng quản trị `/admin`.
    - Vai trò `ROLE_OWNER` (Owner) → chuyển tới cổng chủ nhà `/owner`.
    - Nếu người dùng bị chuyển về trang đăng nhập từ một URL cần quyền, và URL đó thuộc đúng cổng
      của họ, hệ thống đưa họ về đúng URL ban đầu thay vì trang chủ của cổng.
  - Thất bại:
    - Sai thông tin đăng nhập → "Tên đăng nhập hoặc mật khẩu không đúng."
    - Không gọi được máy chủ → "Không kết nối được máy chủ. Kiểm tra lại backend rồi thử lại."
    - Vai trò `ROLE_MANAGER` → phiên làm việc bị từ chối, token vừa lưu bị xoá ngay, kèm thông báo
      "Tài khoản Quản lý vận hành vui lòng sử dụng ứng dụng di động."

### 3.2.2.2 `<Đã đăng nhập>` Phân quyền truy cập theo vai trò

- **Điều kiện kích hoạt:** Người dùng đã đăng nhập điều hướng tới bất kỳ URL nào của hệ thống.
- **Mô tả chức năng:** Mọi tuyến đường đều được bảo vệ để người dùng chỉ vào được các màn hình
  thuộc vai trò của mình.
- **Bố cục màn hình:**

  `[Ảnh: khung cổng Admin và khung cổng Owner đặt cạnh nhau]`

- **Chi tiết chức năng:**
  - Chưa đăng nhập → chuyển về `/login`, URL vừa yêu cầu được ghi nhớ.
  - Đăng nhập sai vai trò → chuyển về trang chủ cổng của chính họ (`/admin` với Admin, `/owner` với
    Owner) thay vì hiện lỗi từ chối quyền.
  - Đã đăng nhập mà mở `/login` → được đưa thẳng về cổng của mình.
  - Admin xem được các màn của Owner để giám sát, trừ ba sổ tiền ("Hoá đơn", "Công nợ", "Sổ cọc")
    chỉ dành riêng cho Owner.
  - Phiên đăng nhập đã lưu mà vai trò không phải Admin hoặc Owner sẽ bị loại bỏ khi tải trang.

### 3.2.2.3 `<Đã đăng nhập>` Đăng xuất

- **Điều kiện kích hoạt:** Người dùng bấm "Đăng xuất" ở khu vực tài khoản trên sidebar.
- **Mô tả chức năng:** Kết thúc phiên làm việc hiện tại trên trình duyệt này.
- **Bố cục màn hình:**

  `[Ảnh: khu vực tài khoản trên sidebar kèm nút đăng xuất]`

- **Chi tiết chức năng:**
  - Hệ thống xoá hồ sơ người dùng đã lưu và JWT token, đồng thời đặt lại kết quả dò quyền xem hoá
    đơn để tài khoản đăng nhập sau không thừa hưởng quyền của người trước.
  - Người dùng được chuyển về màn hình đăng nhập.

---

## 3.2.3 `<Admin>` Bảng điều hành

### 3.2.3.1 `<Admin>` Xem tổng quan hệ thống

- **Điều kiện kích hoạt:** Admin đăng nhập, hoặc bấm "Bảng điều hành" trên sidebar.
- **Mô tả chức năng:** Một màn hình duy nhất trả lời câu hỏi "hiện giờ có gì bất thường không" cho
  toàn hệ thống: tiền đã thu, hợp đồng, người dùng và việc đang chờ xử lý.
- **Bố cục màn hình:**

  `[Ảnh: bảng điều hành Admin — thẻ KPI, biểu đồ doanh thu, danh sách việc chờ]`

- **Chi tiết chức năng:**
  - Thanh đầu trang có ô tìm kiếm toàn hệ thống ("Tìm người dùng, Owner, nhà thuê, hóa đơn, hợp
    đồng…"), chuông thông báo kèm số chưa đọc và menu tài khoản.
  - Số liệu hoá đơn nhóm theo trạng thái ("Đã thu", "Chưa thu", "Quá hạn", "Đã huỷ") và theo loại
    ("Tiền phòng", "Tiền điện", "Tiền nước", "Dịch vụ", "Phí bảo trì", "Khác").
  - Số liệu thanh toán nhóm theo trạng thái đối soát ("Chờ đối soát", "Đã xác nhận", "Bị từ chối")
    và theo hình thức ("Chuyển khoản", "Tiền mặt", "Ví điện tử").
  - Số liệu tài khoản nhóm theo vai trò ("Owner (chủ nhà)", "Quản lý vận hành", "Khách thuê").
  - Số liệu bảo trì nhóm theo tiến độ ("Chờ xử lý", "Đang xử lý").
  - Thành công: mỗi thẻ đều dẫn thẳng tới màn hình xử lý được con số đứng sau nó.
  - Thất bại: khối nào không tải được sẽ có nút thử lại riêng, không chặn cả trang.

---

## 3.2.4 `<Admin>` Quản lý người dùng và phân quyền

### 3.2.4.1 `<Admin>` Xem danh sách người dùng

- **Điều kiện kích hoạt:** Admin bấm "Người dùng & phân quyền" trong nhóm "Hệ thống".
- **Mô tả chức năng:** Hiển thị mọi tài khoản trong hệ thống kèm vai trò và trạng thái.
- **Bố cục màn hình:**

  `[Ảnh: "Quản lý Người dùng & Phân quyền" — tìm kiếm, lọc vai trò, lọc trạng thái, bảng]`

- **Chi tiết chức năng:**
  - Bảng gồm các cột "NGƯỜI DÙNG", "SỐ ĐIỆN THOẠI", "VAI TRÒ", "TRẠNG THÁI" và "THAO TÁC" (biểu
    tượng xem chi tiết và biểu tượng vô hiệu hoá), có phân trang ("Hiển thị 6 / 23 users",
    "Trước" / "Sau").
  - Vai trò gồm "Admin Hệ Thống", "Chủ Nhà", "Quản Lý", "Khách thuê"; trạng thái gồm "Đang hoạt
    động", "Chưa kích hoạt", "Chờ duyệt", "Vô hiệu hóa".
  - Bộ lọc: "Tất cả vai trò", "Tất cả trạng thái" và ô tìm kiếm ("Tìm theo tên, username, số điện
    thoại...").
  - Thất bại: khi không có tài khoản nào khớp, bảng hiển thị "Không tìm thấy user phù hợp bộ lọc
    hiện tại."

### 3.2.4.2 `<Admin>` Tạo tài khoản quản lý vận hành

- **Điều kiện kích hoạt:** Admin bấm "+ Tạo tài khoản".
- **Mô tả chức năng:** Tạo tài khoản đăng nhập cho quản lý vận hành dùng trên ứng dụng di động.
  Tài khoản khách thuê không tạo ở đây mà sinh ra từ quy trình đón khách (3.2.7).
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại tạo tài khoản — họ tên, tên đăng nhập, số điện thoại, mật khẩu]`

- **Chi tiết chức năng:**
  - Các trường bắt buộc: "Họ và tên" (ví dụ "Nguyễn Văn A"), "Tên đăng nhập", "Số điện thoại",
    mật khẩu.
  - Kiểm tra phía giao diện: "Vui lòng nhập tên đăng nhập.", "Mật khẩu phải có ít nhất 6 ký tự.",
    "Vui lòng nhập số điện thoại."
  - Thành công: tài khoản được tạo và xuất hiện trong danh sách, sẵn sàng để Owner phân công khu vực
    (3.2.32).
  - Thất bại: hộp thoại giữ nguyên dữ liệu đã nhập và hiển thị "Có lỗi xảy ra khi tạo tài khoản".

### 3.2.4.3 `<Admin>` Xem chi tiết và đổi trạng thái tài khoản

- **Điều kiện kích hoạt:** Admin bấm biểu tượng xem chi tiết trên một dòng, sau đó kích hoạt hoặc
  vô hiệu hoá tài khoản.
- **Mô tả chức năng:** Mở hồ sơ tài khoản và cho phép bật/tắt quyền sử dụng.
- **Bố cục màn hình:**

  `[Ảnh: khung chi tiết người dùng]`

- **Chi tiết chức năng:**
  - Khung chi tiết hiển thị thông tin định danh, vai trò, trạng thái và khối lượng công việc của
    tài khoản.
  - Thành công: trạng thái mới được áp dụng và dòng dữ liệu được tải lại.
  - Thất bại: hiển thị "Lỗi khi cập nhật trạng thái" và giữ nguyên trạng thái cũ.
  - Tài khoản quản lý bị vô hiệu hoá sẽ được đánh dấu trên bảng phân công khu vực, để không khu vực
    nào âm thầm rơi vào tình trạng không có người phụ trách.

---

## 3.2.5 `<Admin>` Tiếp nhận nhà — bước 1: khởi tạo hồ sơ nhà

> Quy trình tiếp nhận được hiển thị thành thanh tiến trình hai bước trên cả hai màn hình của nhóm
> "Tiếp nhận": **1 Khởi tạo nhà** → **2 Cấu hình khai thác**.

### 3.2.5.1 `<Admin>` Xem danh sách nhà đã tiếp nhận

- **Điều kiện kích hoạt:** Admin bấm "Khởi tạo nhà" trong nhóm "Tiếp nhận".
- **Mô tả chức năng:** Liệt kê mọi toà nhà đã tiếp nhận từ chủ nhà, kèm phần hồ sơ còn thiếu.
- **Bố cục màn hình:**

  `[Ảnh: "Khởi tạo nhà" — thanh tiến trình, 5 thẻ KPI, thanh tìm kiếm, thẻ toà nhà]`

- **Chi tiết chức năng:**
  - Năm thẻ KPI đồng thời là bộ lọc nhanh: "TỔNG TÒA NHÀ", "CẦN XỬ LÝ" ("còn việc phải làm"),
    "THIẾU HĐ CHỦ NHÀ" ("chưa đính hợp đồng đầu vào"), "ĐANG NHÁP" ("chưa hoàn tất khởi tạo") và
    "ĐÃ KHỞI TẠO" ("hồ sơ đã hoàn tất"), mỗi thẻ kèm tỷ lệ phần trăm trên danh mục.
  - Các chip trạng thái dưới thanh tìm kiếm hiển thị số lượng theo từng nhóm, ví dụ "Tất cả 12" và
    "Đã khởi tạo 12".
  - Ô tìm kiếm khớp theo tên, địa chỉ, khu vực hoặc quản lý và bỏ qua dấu tiếng Việt ("Tìm theo tên
    tòa nhà, địa chỉ, khu vực, quản lý... (không cần dấu)"); "Bộ lọc" mở bộ lọc nâng cao; danh sách
    xem được dạng thẻ hoặc dạng bảng.
  - Có thể chọn cách sắp xếp ("Mới thêm gần nhất") và số dòng mỗi trang ("9 / trang"); phần đầu
    danh sách ghi rõ phạm vi ("Hiển thị 1–9 trên 12 tòa nhà").
  - Mỗi thẻ hiển thị tên toà nhà, địa chỉ, quận/huyện, loại hình thuê, thời hạn hợp đồng với chủ
    nhà kèm thời gian còn lại ("HĐ CHỦ NHÀ 15/09/2026 → 14/09/2028 · còn 2 năm") và các số phòng /
    tầng / diện tích. Thẻ có ô tick để thao tác hàng loạt.

### 3.2.5.2 `<Admin>` Nhập nhà từ Excel

- **Điều kiện kích hoạt:** Admin bấm "Nhập từ Excel".
- **Mô tả chức năng:** Đây là con đường duy nhất để một toà nhà vào hệ thống. Một file duy nhất
  mang trọn hồ sơ tiếp nhận — toà nhà, hợp đồng thuê ký với chủ nhà và thiết bị được bàn giao — nên
  cả lô nhà được tiếp nhận trong một lần.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại "Nhập nhà từ Excel" — ba bước đánh số]`

- **Chi tiết chức năng:**
  - Hộp thoại nêu rõ nội dung file cần có ("File gồm hợp đồng thuê và thiết bị bàn giao. Kiểm tra
    file (và ảnh nếu có) rồi mới nhập.") và có nút "Tải template".
  - **Bước 1 — "Kiểm tra file Excel":** Admin kéo thả file `.xlsx` / `.xls` rồi bấm "Kiểm tra file".
    Ở bước này hệ thống chưa ghi gì vào dữ liệu.
    - Thành công: "File hợp lệ — {n} căn · {m} thiết bị bàn giao", kèm thông báo nổi "File hợp lệ —
      {n} căn sẵn sàng nhập". "Kiểm tra lại" cho phép kiểm tra lại từ đầu.
    - Thất bại: "Chỉ chấp nhận file Excel (.xlsx hoặc .xls)", "File có {n} lỗi cần sửa" kèm dòng,
      cột và lý do của từng lỗi, hoặc "Có lỗi không xác định khi xử lý file."
    - Thiếu khu vực: khi file nhắc tới quận/huyện chưa có trong danh mục, hộp thoại báo "Có khu vực
      trong file chưa tồn tại trong hệ thống" và liệt kê ra ("Tỉnh/TP: …", "Quận/Huyện: … (thuộc
      …)"). Admin chọn để hệ thống tự tạo ("Tạo tự động" / "Tạo khu vực & kiểm tra lại" → "Đã tạo
      {n} khu vực mới vào Quản lý Khu vực") hoặc tự thêm bằng tay ("Để tôi tự thêm").
  - **Bước 2 — "Kiểm tra ảnh (.zip) — tùy chọn":** ảnh của các toà nhà được đính kèm trong một file
    nén ("Nén folder ảnh thành .zip, mỗi folder con đặt tên đúng **mã hợp đồng**. Tối đa 200MB ·
    thay thế ảnh hiện có."), sau đó bấm "Kiểm tra ảnh".
    - Thành công: "Khớp {n} căn — {m} ảnh sẽ gắn".
    - Thất bại: "Chỉ chấp nhận file .zip", "File ZIP vượt 200MB", "Không đọc được file ZIP. Kiểm
      tra lại định dạng .zip.", hoặc "Không folder ảnh nào khớp mã hợp đồng trong file".
    - Chốt chặn: nếu đã đính kèm ảnh mà chưa kiểm tra, hệ thống từ chối nhập với thông báo "Bạn đã
      đính kèm ảnh — hãy bấm "Kiểm tra ảnh" ở bước 2 trước khi nhập."
  - **Bước 3 — "Nhập nhà vào hệ thống":** nút "Nhập {n} căn" yêu cầu xác nhận — "Xác nhận nhập dữ
    liệu? Hệ thống sẽ tạo {n} căn nhà từ file {tên file}. Thao tác này ghi trực tiếp vào hệ thống."
    — với hai lựa chọn "Nhập ngay" / "Huỷ".
  - Thành công: "Đã nhập {n} căn nhà" và bảng kết quả liệt kê theo từng dòng "CĂN NHÀ", "MÃ HĐ",
    "TRẠNG THÁI" ("Đã khởi tạo") và "BƯỚC TIẾP THEO" ("Cấu hình khai thác →"), kèm biểu tượng xoá
    để gỡ căn vừa nhập nhầm ("Xóa căn vừa nhập theo mã HĐ "{mã}"?" → "Đã xóa "{tên nhà}""). Dòng
    thông báo xác nhận "Đã nhập {n} căn nhà — sang Cấu hình khai thác để nhập cải tạo." và "Nhập
    file khác" khởi động lại hộp thoại.
  - Thành công một phần: "Nhập nhà OK nhưng gắn ảnh lỗi."

### 3.2.5.3 `<Admin>` Mở hồ sơ toà nhà

- **Điều kiện kích hoạt:** Admin bấm vào thẻ toà nhà, hoặc biểu tượng xem chi tiết trên dòng của nó.
- **Mô tả chức năng:** Hiển thị toàn bộ hồ sơ tiếp nhận của một toà nhà và cho phép bổ sung, chỉnh
  sửa những gì file Excel đã mang vào.
- **Bố cục màn hình:**

  `[Ảnh: hồ sơ toà nhà — thông tin cơ bản, khối hợp đồng, khối thiết bị, bản đồ]`

- **Chi tiết chức năng:**
  - "Thông tin cơ bản" gồm "Tên Tòa nhà", "Địa chỉ", "Khu vực", "Diện tích", "Số tầng",
    "Tổng phòng".
  - "Hợp đồng với chủ nhà" gồm "Tổng tiền thuê *", "Ngày bắt đầu *", "Ngày kết thúc *" và file hợp
    đồng ("Tải xuống hợp đồng"); lưu bằng "Lưu Hợp đồng" / "Cập nhật Hợp đồng".
  - Mã định danh tiện ích hiển thị tại đây: "Mã khách hàng điện" và "Mã khách hàng nước" ("Số danh
    bộ nước"). Toà nhà chưa có mã bị đánh dấu "Chưa có — hoá đơn điện sẽ không được đối chiếu", vì
    các màn phát hành hoá đơn (3.2.15, 3.2.16) đối chiếu hoá đơn giấy với chính mã này. Mã chỉ để
    xem trên web: muốn đổi thì nhập lại file tiếp nhận.
  - "Khai báo trang thiết bị có sẵn" liệt kê thiết bị chủ nhà bàn giao — tìm theo tên ("Gõ tên
    thiết bị để tìm..."), kèm số lượng và tình trạng ("Mới 100%", "Đang dùng tốt") — lưu bằng
    "Lưu Thiết bị".
  - Cột bên phải hiển thị "Vị trí trên bản đồ" và "Hình ảnh tòa nhà".
  - Hồ sơ còn thiếu sẽ hiện nhắc nhở "Hồ sơ còn ở dạng nháp — bổ sung hợp đồng đầu vào & thiết bị
    bàn giao rồi bấm "Xác nhận & Quay về danh sách" ở cuối trang để hoàn tất khởi tạo." Nút này hỏi
    "Xác nhận hoàn tất khởi tạo?" → "Xác nhận".
  - Thất bại: "Vui lòng điền đầy đủ thông tin thiết bị (chọn thiết bị và số lượng > 0)", "Lỗi lưu
    hợp đồng", "Lỗi lưu manifest".

### 3.2.5.4 `<Admin>` Vô hiệu hoá, kích hoạt lại hoặc xoá hồ sơ nhà

- **Điều kiện kích hoạt:** Admin bấm biểu tượng vô hiệu hoá, kích hoạt lại hoặc xoá trên thẻ toà
  nhà, hoặc chọn nhiều thẻ rồi thao tác hàng loạt.
- **Mô tả chức năng:** Đưa một toà nhà ra khỏi diện khai thác, đưa trở lại, hoặc xoá hẳn hồ sơ đã
  nhập nhầm.
- **Bố cục màn hình:**

  `[Ảnh: thanh chọn hàng loạt và các hộp thoại xác nhận]`

- **Chi tiết chức năng:**
  - Thao tác khả dụng phụ thuộc trạng thái: hồ sơ còn nháp có "Vô hiệu hóa" và "Xóa nháp"; nhà đang
    khai thác có "Vô hiệu hóa (cần phòng trống)" và "Xóa (cần phòng trống)"; nhà đã vô hiệu có
    "Kích hoạt lại" và "Xóa vĩnh viễn".
  - Xác nhận: "Xóa tòa nhà này?" → "Xóa vĩnh viễn"; "Vô hiệu hóa tòa nhà này?" → "Vô hiệu hóa";
    "Kích hoạt lại tòa nhà này?" → "Kích hoạt lại".
  - Chốt chặn: toà nhà còn phòng có khách thì không xoá cũng không vô hiệu hoá được — "Còn {n}
    phòng đang có khách thuê — không thể thực hiện. Chờ hết hợp đồng hoặc chuyển khách trước."
  - Thành công: "Đã xóa căn nhà" / "Đã vô hiệu hóa" / "Đã kích hoạt lại tòa nhà"; thao tác hàng
    loạt báo "Đã {hành động} {n}/{tổng} tòa nhà" và liệt kê mọi toà nhà không xử lý được.
  - Thất bại: "Căn nhà đã được xóa trước đó", "Bạn cần quyền ADMIN để xóa căn nhà này", "Không gọi
    được máy chủ", hoặc khi còn hoá đơn / chỉ số / hợp đồng tham chiếu tới toà nhà: "BE lỗi 500 —
    còn dữ liệu liên quan (hóa đơn / chỉ số / hợp đồng) chưa dọn được."

---

## 3.2.6 `<Admin>` Tiếp nhận nhà — bước 2: cấu hình khai thác

### 3.2.6.1 `<Admin>` Xem danh sách cấu hình khai thác

- **Điều kiện kích hoạt:** Admin bấm "Cấu hình khai thác" trong nhóm "Tiếp nhận".
- **Mô tả chức năng:** Theo dõi mọi toà nhà đã nhập trên chặng đường từ "vừa tiếp nhận" tới "mở bán"
  ("Cấu hình cải tạo / phòng và theo dõi tiến độ đưa từng tòa nhà vào kinh doanh"), để không hồ sơ
  nào bị kẹt mà không ai biết.
- **Bố cục màn hình:**

  `[Ảnh: "Cấu hình khai thác" — thẻ KPI, chip trạng thái, thẻ toà nhà]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "TỔNG TÒA NHÀ", "CHỜ CẤU HÌNH" ("chưa chọn loại hình"), "ĐÃ CẤU HÌNH" ("đã xác định
    loại hình") và "ĐANG CẢI TẠO" ("cần xác nhận hoàn thành").
  - Chip trạng thái liệt kê tiến trình kèm số lượng: "Tất cả", "Đang cải tạo", "Chờ Owner duyệt giá",
    "Đang kinh doanh"; các công cụ tìm kiếm, lọc, đổi kiểu xem, sắp xếp và phân trang giống 3.2.5.1.
  - Mỗi thẻ hiển thị loại hình khai thác do file Excel quyết định ("Nhà nguyên căn" / "Phòng trọ"),
    chặng hiện tại và, trong lúc thi công, dấu hiệu "Đang thi công cải tạo".
  - Dạng bảng bổ sung các cột "KHU VỰC", "LOẠI HÌNH", "PHÒNG", "TẦNG", "DIỆN TÍCH", "QUẢN LÝ"
    ("Chưa gán" cho tới khi Owner phân công khu vực) và "TRẠNG THÁI" ("Đã cải tạo xong", "Đang kinh
    doanh", …).

### 3.2.6.2 `<Admin>` Nhập cấu hình khai thác từ Excel

- **Điều kiện kích hoạt:** Admin bấm "Nhập cải tạo từ Excel".
- **Mô tả chức năng:** Nạp mọi thứ cần thiết để định giá toà nhà: cách khai thác, danh sách phòng,
  hợp đồng cải tạo và thiết bị mua mới. Nhập xong là hồ sơ tự động sang Owner — không có bước "gửi"
  riêng.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại "Cấu hình khai thác từ Excel" — kiểm tra file và nhập]`

- **Chi tiết chức năng:**
  - Hộp thoại nêu rõ nội dung và hệ quả: "File gồm cấu hình khai thác (nguyên căn / chia phòng),
    danh sách phòng, hợp đồng cải tạo và thiết bị mua mới — khớp theo mã HĐ thuê của căn đã khởi
    tạo. Nhập xong, các căn **tự động được gửi Owner** duyệt." "Tải template" tải file mẫu.
  - "Kiểm tra file" kiểm tra trước khi ghi.
    - Thành công: "File hợp lệ — {n} căn · {m} dòng cải tạo · {k} thiết bị mua mới · {x} bỏ qua",
      kèm thông báo nổi "File hợp lệ — {n} căn sẵn sàng"; "Kiểm tra lại" chạy lại.
    - Thất bại: lỗi được liệt kê theo từng dòng và hệ thống không ghi gì.
  - "Nhập & gửi Owner" yêu cầu xác nhận — "Xác nhận nhập cải tạo & gửi Owner? Hệ thống sẽ nhập cải tạo
    & thiết bị mua mới cho {n} căn nhà từ file {tên file}, sau đó tự động gửi Owner duyệt." — với
    "Nhập & gửi Owner" / "Huỷ".
  - Thành công: "Đã nhập cải tạo cho {n} căn — đã gửi Owner duyệt · {x} bỏ qua." Bảng kết quả hiển
    thị "CĂN NHÀ", "MÃ HĐ" và "TRẠNG THÁI" ("Đã gửi Owner", hoặc "Bỏ qua" với căn mà file khai báo
    là không cần cải tạo). "Nhập file khác" khởi động lại hộp thoại.
  - Căn bị bỏ qua vẫn giữ nguyên trạng thái cũ và có thể gửi Owner ở lần sau.

### 3.2.6.3 `<Admin>` Mở hồ sơ cấu hình của một toà nhà

- **Điều kiện kích hoạt:** Admin bấm vào một toà nhà trong danh sách "Cấu hình khai thác".
- **Mô tả chức năng:** Hiển thị những gì đã cấu hình và đã chi cho toà nhà, kèm các thao tác đẩy hồ
  sơ đi tiếp.
- **Bố cục màn hình:**

  `[Ảnh: hồ sơ cấu hình — tab "Tổng quan", "Thiết bị", "Lịch sử cải tạo", "Cải tạo lại"]`

- **Chi tiết chức năng:**
  - Phần đầu lặp lại tên toà nhà, địa chỉ, quận/huyện, loại hình, nhãn chặng hiện tại ("Đang cải
    tạo", "Đã cải tạo xong", "Đang kinh doanh") và quản lý vận hành phụ trách.
  - Các tab: "Tổng quan", "Thiết bị", "Lịch sử cải tạo" và "Cải tạo lại" (3.2.6.5).
  - "Lịch sử cải tạo" hiển thị các đợt: gộp chung ("Tổng đến hiện tại" — tổng vốn, luỹ kế theo thời
    gian, hạng mục theo loại, thiết bị theo vị trí) hoặc tách từng đợt ("Từng đợt", mỗi đợt ghi
    "(hoàn thành)" hoặc "(đang thi công)", đợt đang chạy mở sẵn).

### 3.2.6.4 `<Admin>` Xác nhận hoàn thành cải tạo

- **Điều kiện kích hoạt:** Admin bấm "Xác nhận hoàn thành cải tạo" trên toà nhà đang thi công.
- **Mô tả chức năng:** Tuyên bố việc thi công đã xong — đây là điều kiện để Owner định giá toà nhà.
- **Bố cục màn hình:**

  `[Ảnh: phần đầu hồ sơ toà nhà kèm nút "Xác nhận hoàn thành cải tạo"]`

- **Chi tiết chức năng:**
  - Thành công: toà nhà chuyển sang "Đã cải tạo xong" và xuất hiện trong hàng chờ duyệt giá của
    Owner (3.2.25).
  - Thất bại: trạng thái giữ nguyên và hiển thị thông báo lỗi từ máy chủ.

### 3.2.6.5 `<Admin>` Mở đợt cải tạo bổ sung

- **Điều kiện kích hoạt:** Admin mở tab "Cải tạo lại" trên toà nhà đang kinh doanh.
- **Mô tả chức năng:** Mở một đợt cải tạo mới cho toà nhà đang chạy — ví dụ khi cần nâng cấp thiết
  bị — và theo dõi chi phí đợt này tách khỏi đợt ban đầu.
- **Bố cục màn hình:**

  `[Ảnh: tab "Cải tạo lại" — thông báo mở đợt mới và khung nhập cải tạo bổ sung]`

- **Chi tiết chức năng:**
  - Khi mở đợt, hệ thống hiển thị "Đã mở đợt cải tạo mới. Tải file cải tạo bổ sung để hoàn tất."
  - "Nhập cải tạo bổ sung từ Excel" chỉ nhận file của đúng toà nhà đó ("Chỉ nhập cho {tên nhà} — mọi
    dòng phải có mã HĐ {mã}"). File gồm hợp đồng cải tạo và thiết bị mua mới, mỗi dòng đánh dấu
    `THÊM_MỚI` hoặc `THAY_THẾ`; nhập xong hệ thống "tự động gửi Owner duyệt lại giá (vì đổi chi
    phí/thiết bị)".
  - Thành công: "Đã nhập cải tạo bổ sung — {n} dòng cải tạo, {m} thiết bị. Đã gửi Owner duyệt lại
    giá." kèm nút "Hoàn tất & quay lại".
  - Quy tắc nghiệp vụ: khách đang ở không bao giờ bị tính tiền cho đợt cải tạo bổ sung. Chỉ hạng mục
    nâng cấp (`THÊM_MỚI`) mới làm tăng giá niêm yết cho khách sau này; thay thiết bị tương đương
    (`THAY_THẾ`) thì không.

---

## 3.2.7 `<Admin>` Hồ sơ đón khách

### 3.2.7.1 `<Admin>` Xem danh sách hồ sơ đón khách

- **Điều kiện kích hoạt:** Admin bấm "Hồ sơ đón khách" trong nhóm "Tiếp nhận".
- **Mô tả chức năng:** Mỗi dòng là một hợp đồng thuê đã chốt nhưng chưa bắt đầu — "Khách đã xem nhà
  và chốt thuê — đang chờ quản lý tới đón khách & thu cọc. Quản lý vận hành của nhà tự động phụ
  trách."
- **Bố cục màn hình:**

  `[Ảnh: "Hồ sơ đón khách" — thẻ KPI, hàng bộ lọc, bảng hồ sơ]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "TỔNG HỒ SƠ" ("đang chờ đón khách"), "QUÁ HẠN ĐÓN" ("đã qua ngày hẹn"), "ĐÓN HÔM NAY",
    "TRONG 7 NGÀY", "CHƯA CÓ FILE HĐ" ("cần tạo lại file").
  - Bộ lọc: ô tìm kiếm không dấu ("Tìm tên khách, SĐT, mã HĐ, tên nhà, số phòng, quản lý…"),
    "Nhà: Tất cả", "Quản lý: Tất cả", "Lịch đón: Tất cả", "File HĐ: Tất cả" và "Sắp xếp: Mới tạo
    trước"; bộ đếm bên phải ghi "{n}/{m} hồ sơ · {k} nhà".
  - Khối "Chỗ trống của các nhà ở trang này" tóm tắt tình trạng phòng trống của các toà nhà đang
    hiển thị ("{n} nhà đang có hồ sơ ở trang hiện tại · {m} hết chỗ") kèm "Xem chi tiết" và "Xem tất
    cả nhà →".
  - Bảng gồm "KHÁCH THUÊ" (tên và số điện thoại che một phần, bấm biểu tượng con mắt để hiện),
    "NHÀ · PHÒNG", "QUẢN LÝ", "GIÁ THUÊ · CỌC", "NGÀY ĐÓN" (ngày quá hạn và ngày hôm nay được làm
    nổi, ví dụ "Đón hôm nay"), "HỢP ĐỒNG" (mã hợp đồng) và "THAO TÁC" — sửa, tải file hợp đồng, xoá.
  - Trạng thái rỗng: "Chưa có hồ sơ đón khách nào. Bấm "Tạo hồ sơ" hoặc import Excel để bắt đầu."
  - Thất bại: "Không tải được file hợp đồng." khi không tải được tài liệu.

### 3.2.7.2 `<Admin>` Tạo hồ sơ đón khách

- **Điều kiện kích hoạt:** Admin bấm "Tạo hồ sơ".
- **Mô tả chức năng:** Ghi nhận thoả thuận thuê đã chốt với khách — phòng nào, ai thuê, điều khoản
  ra sao — và sinh file hợp đồng để khách ký.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại "Tạo hợp đồng nháp" — chọn nhà/phòng, thông tin định danh, điều khoản tiền]`

- **Chi tiết chức năng:**
  - Ô chọn bất động sản chỉ hiện những nhà còn chỗ ("Chỉ hiện nhà còn chỗ — {n}/{m} nhà hết chỗ đã
    được ẩn") và hiển thị tình trạng trống của căn đang chọn ("{n} CHỖ TRỐNG · {m} phòng · tất cả
    đều trống"). Danh sách phòng ghi kèm diện tích và giá niêm yết ("101 · 26m² · 5.056.816đ").
  - Quản lý vận hành không chọn tay: "Quản lý phụ trách: {tên} (tự động gán + gửi thông báo sau khi
    lưu)".
  - Thông tin định danh khách: "Họ và tên khách *", "Số điện thoại *", "CCCD *", "Ngày sinh",
    "Ngày cấp CCCD", "Nơi cấp CCCD", "Hộ khẩu thường trú". Người ở cùng thêm bằng "+ Thêm thành
    viên" và gỡ bằng "Xóa thành viên".
  - Điều khoản tiền: "Giá thuê (đ/tháng) *" được điền sẵn theo giá Owner đã duyệt ("Lấy theo giá niêm
    yết Owner đã duyệt"), cùng "Tiền cọc (đ) *" và "Số tháng cọc"; thời hạn thuê có sẵn các mốc
    "6 tháng" / "1 năm" / "2 năm".
  - Kiểm tra dữ liệu: "SĐT không đúng định dạng Việt Nam (10 số, đầu 03/05/07/08/09).", "CCCD phải
    gồm đúng 12 chữ số.", "Ngày sinh không hợp lệ — khách phải sinh từ 1930 và đủ 18 tuổi.",
    "SĐT thuộc tài khoản nội bộ — không thể onboard làm khách.", "Vui lòng chọn bất động sản",
    "Vui lòng chọn phòng", "Vui lòng chọn ngày bắt đầu hợp đồng.", "Ngày kết thúc phải sau ngày bắt
    đầu hợp đồng.", và "Nhà này chưa có quản lý phụ trách — vui lòng gán quản lý cho nhà trước khi
    tạo hợp đồng."
  - Đối chiếu với hợp đồng chủ nhà: ngày vào ở sớm hơn ngày hợp đồng chủ nhà có hiệu lực sẽ bị từ
    chối ("Công ty chưa có quyền quản lý căn này trước ngày đó."), ngày kết thúc vượt quá hạn hợp
    đồng chủ nhà cũng bị từ chối và ô ngày bị xoá ("Tới ngày trả nhà sẽ vẫn còn khách bên trong.").
  - "Xem lại & Lưu" mở bước đọc lại "Xác nhận thông tin — Kiểm tra lại trước khi lưu — sau bước này
    sẽ tạo/gán manager/sinh file.", liệt kê bất động sản và phòng, khách thuê, SĐT/CCCD, ngày sinh,
    ngày và nơi cấp CCCD, hộ khẩu thường trú, giá thuê, tiền cọc kèm số tháng, ngày dự kiến đón
    khách, ngày bắt đầu và kết thúc hợp đồng, nội thất bàn giao. "Quay lại sửa" trở về form;
    "Xác nhận & Lưu" ghi nhận.
  - Thành công: "Đã tạo hợp đồng nháp & gửi thông báo cho {tên quản lý}." — hợp đồng nháp và file
    hợp đồng được tạo, quản lý phụ trách được báo đi đón khách.
  - Thành công một phần: "Đã tạo hợp đồng nháp nhưng KHÔNG sinh được file — có thể tạo lại ở danh
    sách nháp."

### 3.2.7.3 `<Admin>` Sửa hồ sơ đón khách

- **Điều kiện kích hoạt:** Admin bấm biểu tượng sửa trên một dòng.
- **Mô tả chức năng:** Sửa hồ sơ trước khi khách vào ở và sinh lại file hợp đồng để giấy tờ khớp với
  dữ liệu.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại sửa hồ sơ kèm ô tick xác nhận đổi thông tin định danh]`

- **Chi tiết chức năng:**
  - Đổi số điện thoại, số CCCD hoặc ngày sinh bắt buộc Admin tick xác nhận trước ("Vui lòng tick xác
    nhận trước khi lưu thay đổi thông tin định danh (SĐT/CCCD/ngày sinh).") vì đây là các trường
    định danh tài khoản khách thuê.
  - Tiến trình hiển thị "Đang cập nhật hợp đồng..." rồi "Đang tạo lại file hợp đồng...".
  - Thành công: "Đã cập nhật hợp đồng nháp & tạo lại file."
  - Thành công một phần: "Đã cập nhật thông tin nhưng KHÔNG tạo lại được file — có thể thử lại."

### 3.2.7.4 `<Admin>` Import hồ sơ đón khách từ Excel

- **Điều kiện kích hoạt:** Admin bấm "Import Excel".
- **Mô tả chức năng:** Tạo hàng loạt hợp đồng thuê một lần, dùng khi lấp đầy cả một toà nhà.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại "Import hợp đồng nháp từ Excel" — báo cáo kiểm tra và xác nhận]`

- **Chi tiết chức năng:**
  - Chỉ chấp nhận "`.xlsx`" và "`.xls`" ("Chỉ chấp nhận file Excel (.xlsx hoặc .xls)").
  - "Kiểm tra file" kiểm tra và báo "File hợp lệ — {n} hợp đồng sẵn sàng" hoặc "{n} hợp đồng sẵn
    sàng · {m} dòng để lại", nêu rõ từng dòng bị loại — ví dụ dòng vượt sức chứa của phòng ("{phòng}
    (thừa {n} khách)") hoặc dòng thuộc nhà chưa hoạt động ("{n} hợp đồng thuộc nhà chưa hoạt động —
    để lại lần này").
  - Việc import được xác nhận bằng "Xác nhận import hợp đồng nháp? Hệ thống sẽ tạo {n} hợp đồng nháp
    từ file {tên file}. Quản lý phụ trách của từng nhà sẽ nhận thông báo đón khách." → "Import" /
    "Huỷ".
  - Thành công: "Đã tạo {n} hợp đồng nháp." kèm "Đã tự động tạo file hợp đồng cho toàn bộ."
  - Thành công một phần: "Tạo file thất bại cho {n} hợp đồng — vào "Sửa" từng dòng để tạo lại."
  - Thất bại: "Chưa có dòng nào import được — xem chi tiết bên dưới." hoặc "Chưa import được: cả {n}
    hợp đồng đều thuộc nhà chưa hoạt động".

### 3.2.7.5 `<Admin>` Huỷ hồ sơ đón khách

- **Điều kiện kích hoạt:** Admin bấm biểu tượng xoá trên một dòng, hoặc chọn nhiều dòng rồi xoá cùng
  lúc.
- **Mô tả chức năng:** Bỏ một hợp đồng sẽ không diễn ra, trả phòng về trạng thái còn trống.
- **Bố cục màn hình:**

  `[Ảnh: thanh chọn hàng loạt kèm hộp thoại xác nhận huỷ]`

- **Chi tiết chức năng:**
  - Huỷ từng hồ sơ hỏi "Huỷ hồ sơ đón khách của {tên khách}?" và báo "Đã huỷ hồ sơ đón khách."
  - Xoá hàng loạt báo "Đã xoá {n} hồ sơ đón khách."
  - Thành công: phòng trở lại trạng thái còn trống và có thể chào khách khác.

---

## 3.2.8 `<Admin>` Giám sát tình trạng nhà & phòng

### 3.2.8.1 `<Admin>` Xem tình trạng nhà và phòng

- **Điều kiện kích hoạt:** Admin bấm "Tình trạng nhà & phòng" trong nhóm "Vận hành".
- **Mô tả chức năng:** "Quản lý đã tiếp quản nhà chưa, mỗi nhà còn mấy phòng nhận được khách, và hồ
  sơ bàn giao đã đủ chưa" — toàn bộ sự thật vận hành của danh mục gói trong một bảng.
- **Bố cục màn hình:**

  `[Ảnh: "Tình trạng từng nhà" — thẻ KPI, chip lọc, các dòng toà nhà mở rộng được]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "TOÀ NHÀ THEO DÕI", "QUẢN LÝ ĐÃ NHẬN NHÀ" ("Đã tiếp quản hết"), "CHỖ CÒN TRỐNG" ("nhà
    còn nhận khách") và "PHÒNG ĐÃ GIAO KHÁCH" ("Đã bàn giao cho khách thuê").
  - Chip lọc: "Tất cả", "Chưa nhận nhà", "Còn phòng trống", "Chưa mở phòng", "Hết chỗ", "Thiếu hồ sơ
    bàn giao"; ô tìm kiếm khớp theo toà nhà hoặc quản lý.
  - Mỗi dòng hiển thị toà nhà, chặng hiện tại ("Đang khai thác"), quản lý vận hành, việc quản lý đã
    nhận nhà hay chưa ("Đã nhận" kèm thời điểm) và tóm tắt phòng / chỗ trống.
  - Mở rộng một dòng sẽ liệt kê các phòng kèm "Phòng", "Khách thuê", "Ngày vào ở", "Kích hoạt HĐ",
    "Hồ sơ bàn giao" ("Đủ (1 ảnh + chỉ số)" khi đầy đủ) và "Trạng thái HĐ" ("Đã giao phòng").
  - Cuối mỗi khối nêu rõ vì sao hồ sơ bàn giao quan trọng: "Thiếu ảnh hiện trạng hoặc chỉ số
    điện/nước thì lúc khách trả phòng sẽ không có căn cứ để trừ cọc — nhắc quản lý bổ sung sớm."

---

## 3.2.9 `<Admin>` Giám sát bảo trì & thiết bị

### 3.2.9.1 `<Admin>` Xem danh sách phiếu bảo trì

- **Điều kiện kích hoạt:** Admin bấm "Bảo trì & thiết bị" trong nhóm "Vận hành". Mục menu này có
  nhãn đếm số phiếu đang mở.
- **Mô tả chức năng:** "Theo dõi yêu cầu sửa chữa của khách, tiến độ xử lý của quản lý và chi phí
  từng phiếu."
- **Bố cục màn hình:**

  `[Ảnh: "Bảo trì & thiết bị" — thẻ KPI, tab trạng thái, bảng phiếu]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "TỔNG PHIẾU", "CẦN XỬ LÝ" ("chưa ai nhận kiểm tra"), "ĐANG SỬA" ("quản lý đang xử lý"),
    "LỖI DO KHÁCH" ("gồm cả chờ trừ cọc") và "HOÀN TẤT" (kèm tổng chi phí).
  - Tab trạng thái: "Cần xử lý", "Đang sửa", "Lỗi do khách", "Đã xong", "Tất cả"; sắp xếp theo
    "Ưu tiên xử lý", "Mới nhất" hoặc "Chi phí cao nhất"; ô tìm kiếm khớp mã phiếu, tên/SĐT khách,
    thiết bị, nhà, phòng hoặc quản lý.
  - Bảng gồm "PHIẾU" (mã phiếu, mức ưu tiên và thiết bị), "NHÀ · PHÒNG", "KHÁCH THUÊ" (tên và SĐT),
    "QUẢN LÝ", "CHI PHÍ", "TRẠNG THÁI" và "CẬP NHẬT" (thời gian tương đối, ví dụ "1 ngày trước").
    Nhãn "TRỰC TIẾP" cho biết trang đang tự làm mới.
  - Nút trên đầu trang: "Báo lỗi do khách" (3.2.18), "Danh mục thiết bị" (3.2.21), "Làm mới",
    "Xuất CSV".
  - Mở một phiếu sẽ thấy ảnh bằng chứng, chia nhóm "Ảnh hiện trạng", "Bằng chứng lỗi do khách",
    "Khách tự sửa", "Sau sửa chữa" và "Hoá đơn".
  - Thất bại: "Không tải được danh sách — kiểm tra kết nối máy chủ." / "Không tải thêm được — thử
    lại sau."

---

## 3.2.10 `<Admin>` Cấp mã nhập tay chỉ số đồng hồ

### 3.2.10.1 `<Admin>` Tạo mã cho một lần nhập tay

- **Điều kiện kích hoạt:** Quản lý không chụp được ảnh đồng hồ và gọi cho Admin; Admin mở "Cấp mã
  đồng hồ" rồi điền khối "Tạo mã nhập tay đồng hồ".
- **Mô tả chức năng:** Bình thường mỗi chỉ số phải có ảnh đồng hồ làm bằng chứng. Màn này cấp một mã
  dùng một lần để một quản lý gõ tay đúng một chỉ số — "Quản lý gọi xin mã khi không chụp được ảnh
  đồng hồ. Tạo mã, đọc cho họ, mã tự chết sau khi dùng."
- **Bố cục màn hình:**

  `[Ảnh: "Cấp mã đồng hồ" — thẻ KPI, form tạo mã, khung hiển thị mã, nhật ký mã đã cấp]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "MÃ CÒN HIỆU LỰC" ("Chưa dùng và chưa hết hạn"), "MÃ ĐÃ ĐƯỢC DÙNG" ("Mỗi mã chỉ dùng
    được một lần") và "LẦN GÕ TAY CHỈ SỐ" ("Số lần bỏ qua ảnh đồng hồ").
  - Form nhận ghi chú không bắt buộc ("Ghi chú (không bắt buộc)", ví dụ "VD: Quản lý An — đón khách
    P.302, đồng hồ trong hộp khoá") — "Ghi ai xin và vì sao. Lúc soi lại nhật ký, đây là thứ phân
    biệt trường hợp chính đáng với thói quen ngại chụp ảnh." — và thời hạn tính theo phút ("Hạn dùng
    (phút)", mặc định 10: "Đủ để gọi điện đọc mã là được. Càng ngắn càng ít rủi ro mã bị chuyền
    tay."). "Tạo mã" phát hành mã.
  - Mã sinh ra hiển thị cỡ lớn để đọc qua điện thoại ("Đọc mã này cho quản lý"), kèm "Chép mã" /
    "Đã chép" và đồng hồ đếm ngược ("Còn {mm:ss}"). Khi chưa cấp mã nào, khung hiển thị "Chưa tạo mã
    nào — Mã sẽ hiện ở đây cỡ lớn để đọc qua điện thoại."
  - Chốt chặn: nếu còn mã chưa ai dùng, hệ thống cảnh báo "Đang có {n} mã chưa ai dùng. Đọc lại một
    mã sẵn có, hoặc chờ chúng hết hạn rồi hãy tạo thêm — mỗi mã còn hạn là một lần bỏ qua được ảnh
    đồng hồ.", kèm hai lựa chọn "Vẫn tạo mã mới" hoặc "Thôi, đọc lại mã cũ".
  - "Mã đã cấp" là nhật ký kiểm soát — "MÃ", "TRẠNG THÁI" ("Đã dùng" / "Hết hạn"), "GHI CHÚ",
    "TẠO LÚC", "HẾT HẠN" — kèm "Chỉ mã còn dùng được" và "Tải lại". Mã hết hạn không cần thu hồi:
    "Mã hết hạn không cần thu hồi — tới giờ là tự hỏng."
  - Thất bại: "Không tạo được mã. Thử lại, hoặc kiểm tra tài khoản có vai trò Admin không." /
    "Không tải được dữ liệu. Kiểm tra kết nối hoặc quyền truy cập (cần vai trò Admin)."

---

## 3.2.11 `<Admin>` Giám sát phân công khu vực

### 3.2.11.1 `<Admin>` Xem bảng phân công khu vực

- **Điều kiện kích hoạt:** Admin bấm "Phân công khu vực" trong nhóm "Vận hành".
- **Mô tả chức năng:** Cho biết quận/huyện nào do quản lý vận hành nào phụ trách. Quy tắc được ghi
  ngay trên trang: "Mỗi quận/huyện do **một** quản lý vận hành phụ trách — gán cho khu vực là gán
  cho mọi nhà bên trong. Xem toàn hệ thống; việc gán/đổi quản lý do Owner quyết định."
- **Bố cục màn hình:**

  `[Ảnh: "Khu vực & Quản lý" (giao diện Admin) — thẻ KPI, bộ lọc, các dòng khu vực]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "Tổng khu vực" và "{n}/{m} Đều đã có quản lý".
  - Bộ lọc: tìm theo tên quận/huyện hoặc tên quản lý, "Tất cả quản lý", và sắp xếp "Việc cần xử lý
    trước".
  - Mỗi dòng hiển thị quận/huyện, nhãn phủ sóng ("Đã gán"), quy mô ("{n} nhà · {m} đơn vị") và quản
    lý kèm số khu vực người đó phụ trách. "Xem chi tiết" mở rộng danh sách nhà bên trong.
  - Admin chỉ có quyền xem ở màn này: việc phân công là quyết định của Owner (3.2.32), nên màn này
    không có nút "Đổi quản lý".

---

## 3.2.12 `<Admin>` Giám sát hoá đơn và thanh toán

### 3.2.12.1 `<Admin>` Xem hoá đơn và tiền cọc

- **Điều kiện kích hoạt:** Admin bấm "Thanh toán" trong nhóm "Tài chính".
- **Mô tả chức năng:** "Toàn bộ hoá đơn thật của hệ thống (tiền phòng, điện, nước, dịch vụ, bảo trì)
  — mới phát hành nằm trên đầu."
- **Bố cục màn hình:**

  `[Ảnh: "Hoá đơn & Thanh toán" — hai tab, thẻ KPI, bảng hoá đơn]`

- **Chi tiết chức năng:**
  - Hai tab kèm số lượng: "Hoá đơn" và "Tiền cọc".
  - Thẻ KPI: "TỔNG HOÁ ĐƠN" (kèm tổng tiền), "ĐÃ THANH TOÁN", "CHỜ THU", "QUÁ HẠN".
  - Bộ lọc: ô tìm kiếm ("Tìm mã hoá đơn, toà nhà, phòng, khách thuê..."), "Tất cả loại hoá đơn",
    "Tất cả toà nhà", ô chọn kỳ ("Tất cả các kỳ") và sắp xếp ("Mới phát hành nhất"). Nhãn "TRỰC
    TIẾP" cho biết trang đang tự làm mới.
  - Bảng gồm "MÃ HOÁ ĐƠN", "KỲ THANH TOÁN" (kèm nhãn loại hoá đơn và số ngày được tính, ví dụ "Tiền
    nhà 18/09–30/09/2026 (13/30 ngày)"), "TOÀ NHÀ / PHÒNG", "KHÁCH THUÊ", "SỐ TIỀN", "PHÁT HÀNH",
    "HẠN THU" và "TRẠNG THÁI"; mỗi dòng mở rộng để xem chi tiết.
  - Loại hoá đơn: "Tiền phòng", "Tiền điện", "Tiền nước", "Dịch vụ", "Phí bảo trì", "Khác". Trạng
    thái hoá đơn: "Chờ thanh toán", "Đã thanh toán", "Quá hạn", "Đã huỷ". Thanh toán được đối soát
    qua "Chờ đối soát", "Đã xác nhận", "Bị từ chối", theo hình thức "Chuyển khoản", "Tiền mặt" hoặc
    "Ví điện tử".
  - Lúc khách nhận phòng, tiền thu một lần nhưng được ghi thành hai hoá đơn: hoá đơn gộp
    `HD-ONBOARD-…` ("Khoản gộp — không tính vào tổng", gồm cọc và tiền nhà kỳ đầu) và hoá đơn tiền
    nhà kỳ đầu `HD-RENT-…` ("Thu cùng cọc lúc nhận phòng"), để tổng không bị cộng trùng.
  - Quy tắc nghiệp vụ: hoá đơn chỉ có thu đủ hoặc chưa thu — hệ thống không ghi nhận thu một phần;
    khách không trả được thì chấm dứt hợp đồng.
  - Quy tắc nghiệp vụ: tiền cọc không bao giờ dùng để trừ nợ hoá đơn. Khách phải thanh toán đủ mọi
    khoản trước, cọc được hoàn nguyên vẹn sau.

---

## 3.2.13 `<Admin>` Giám sát hợp đồng

### 3.2.13.1 `<Admin>` Xem hợp đồng khách thuê

- **Điều kiện kích hoạt:** Admin bấm "Hợp đồng" trong nhóm "Tài chính".
- **Mô tả chức năng:** Theo dõi mọi hợp đồng thuê trong hệ thống và làm nổi những hợp đồng sắp cần
  quyết định.
- **Bố cục màn hình:**

  `[Ảnh: "Theo dõi hợp đồng thuê" — thẻ KPI, thanh tìm kiếm, bảng hợp đồng]`

- **Chi tiết chức năng:**
  - Các nhóm: "Đang hiệu lực", "Chờ kích hoạt" ("Đã ký, chờ thu tiền / đón khách"), "Chờ đón khách"
    ("Đã lập hồ sơ, chưa giao phòng"), "Sắp hết hạn ≤{n}n" ("Cần chốt gia hạn sớm") và "Đã kết thúc"
    ("Chấm dứt + hết hạn"). Hợp đồng bị huỷ trước khi khách kịp vào ở được đếm riêng để không làm
    lệch tỷ lệ.
  - Ô tìm kiếm nhận mã hợp đồng, tên khách, SĐT, CCCD, toà nhà, phòng hoặc quản lý; bấm vào một dòng
    sẽ mở chi tiết hợp đồng.
  - Thất bại: "Chưa tải được dữ liệu — bấm "Làm mới" để thử lại."; trạng thái rỗng là "Chưa có hợp
    đồng khách thuê nào trong hệ thống." và "Không có hợp đồng nào khớp bộ lọc. Thử xoá bớt điều
    kiện lọc."

---

## 3.2.14 `<Admin>` Xử lý đơn xin gia hạn hợp đồng

### 3.2.14.1 `<Admin>` Xem danh sách đơn gia hạn

- **Điều kiện kích hoạt:** Admin bấm "Đơn gia hạn" trong nhóm "Tài chính".
- **Mô tả chức năng:** Tập hợp đơn của khách thuê muốn ở thêm. Admin là người quyết định; quản lý
  vận hành chỉ góp ý.
- **Bố cục màn hình:**

  `[Ảnh: "Đơn xin gia hạn hợp đồng" — tab chờ duyệt và tab lịch sử]`

- **Chi tiết chức năng:**
  - Hai tab: "Chờ duyệt" và "Lịch sử đã xử lý"; ô tìm kiếm khớp tên khách, SĐT hoặc tên nhà.
  - Mỗi đơn hiển thị khách thuê, toà nhà và phòng, thời gian xin thêm ("xin {n} tháng") kèm lý do
    của khách ("(không ghi gì)" khi bỏ trống).
  - Thất bại: "Không tải được danh sách đơn. Bấm Làm mới để thử lại."; trạng thái rỗng là "Không có
    đơn nào chờ duyệt" và "Không có đơn nào khớp từ khoá."

### 3.2.14.2 `<Admin>` Duyệt đơn gia hạn

- **Điều kiện kích hoạt:** Admin duyệt một đơn đang chờ.
- **Mô tả chức năng:** Gia hạn hợp đồng. Duyệt chỉ dời ngày kết thúc và không đổi gì khác — "Khách
  xin ở thêm. Duyệt là dời ngày kết thúc — giá thuê giữ nguyên, không đổi gì khác."
- **Bố cục màn hình:**

  `[Ảnh: thẻ đơn gia hạn kèm nút duyệt]`

- **Chi tiết chức năng:**
  - Thành công: "Đã gia hạn hợp đồng thêm {n} tháng." và đơn chuyển sang tab lịch sử.
  - Thất bại: "Không duyệt được đơn." và đơn vẫn ở trạng thái chờ.

### 3.2.14.3 `<Admin>` Từ chối đơn gia hạn

- **Điều kiện kích hoạt:** Admin bấm "Từ chối đơn" và nhập lý do.
- **Mô tả chức năng:** Từ chối đơn và cho khách biết vì sao.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại từ chối kèm ô nhập lý do]`

- **Chi tiết chức năng:**
  - Lý do là bắt buộc và tối thiểu 10 ký tự ("Ghi rõ lý do (ít nhất 10 ký tự) — khách sẽ đọc được
    nội dung này."), vì khách đọc nguyên văn nội dung này.
  - Thành công: "Đã từ chối đơn và báo cho khách."
  - Thất bại: "Không ghi nhận được." và hộp thoại giữ nguyên lý do đã nhập.

---

## 3.2.15 `<Admin>` Phát hành hoá đơn điện EVN

> Phân công: quản lý vận hành chốt chỉ số từng phòng trên ứng dụng di động, Admin nhập hoá đơn giấy
> của cả toà nhà. "Admin tải hoá đơn EVN của từng nhà, hệ thống tính đơn giá rồi đẩy xuống cho quản
> lý."

### 3.2.15.1 `<Admin>` Phát hành hoá đơn cho một toà nhà

- **Điều kiện kích hoạt:** Admin bấm "Hoá đơn điện EVN" trong nhóm "Tài chính", chọn toà nhà và kỳ
  tiêu thụ, rồi bấm "Phát hành đơn giá cho kỳ này".
- **Mô tả chức năng:** Ghi nhận hoá đơn tổng nhận từ điện lực — đây là căn cứ để tính hoá đơn của
  từng phòng.
- **Bố cục màn hình:**

  `[Ảnh: "Phát hành hoá đơn điện EVN" — tải ảnh hoá đơn, các số liệu, danh sách đã phát hành]`

- **Chi tiết chức năng:**
  - Kỳ tiêu thụ được chọn ở đầu trang ("KỲ TIÊU THỤ", tháng và năm) và danh sách nhà chỉ hiện những
    toà đang có khách ("Chỉ hiện nhà đang có khách ở — {n} nhà trống đã được ẩn").
  - "Ảnh hoá đơn EVN" đọc hoá đơn giấy: "Chọn ảnh hoá đơn EVN — Hệ thống tự đọc tổng kWh · tổng tiền
    · kỳ".
    - Thành công: "Đọc được: {các số đọc được}. Đối chiếu lại với ảnh trước khi phát hành." Ảnh có
      thể phóng to ("🔍 Phóng to"), đổi ("Đổi ảnh khác") hoặc xoá ("Xoá ảnh"), và mọi số liệu đọc ra
      vẫn sửa được.
    - Thất bại: "Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay.", "Đã tải ảnh nhưng dịch vụ đọc
      hoá đơn đang lỗi. Vui lòng nhập tay số liệu.", "Không tải được ảnh lên."
  - Các số liệu gồm "Tổng kWh *", "Tổng tiền (đ) *" và "Kỳ thanh toán *", kèm nút điền nhanh ("Điền
    nhanh: Kỳ {tháng}/{năm} · Tháng trước"). Từ đó khung "ĐƠN GIÁ HỆ THỐNG SẼ DÙNG" hiển thị đơn giá
    áp dụng cho mọi hoá đơn phòng của toà nhà.
  - Tiến độ chốt chỉ số được nêu rõ trước khi phát hành: "{n}/{m} phòng đã chốt chỉ số kỳ
    {tháng}/{năm}".
    - "Phát hành sẽ tính tiền và gửi hoá đơn cho {n} phòng này ngay."
    - Phòng chưa có chỉ số không bị bỏ sót: "{m} phòng còn lại sẽ tự phát hành ngay khi quản lý chốt
      số, không cần bạn đẩy lại giấy."
    - Nếu chưa phòng nào có chỉ số: "Phát hành bây giờ sẽ không gửi được hoá đơn nào — chưa phòng
      nào có chỉ số."
    - "Xem chỉ số & ảnh đồng hồ từng phòng" mở rộng phần chỉ số kèm ảnh đồng hồ quản lý đã gửi.
  - Nhà nguyên căn thì hoá đơn đi thẳng tới khách thuê; nhà chia phòng thì hoá đơn tổng được chia
    cho các phòng đã chốt chỉ số.
  - Toà nhà đã có hoá đơn của kỳ sẽ bị gắn nhãn "Đã phát hành" ngay trong ô chọn và không thể phát
    hành lần hai.
  - Khối phía dưới "Đã phát hành — kỳ {tháng}/{năm}" liệt kê những gì đã phát hành ("Các nhà dưới
    đây đã có đơn giá điện của kỳ. Hoá đơn đã gửi tới khách của mọi phòng đã chốt chỉ số."), kèm
    "Tải lại" và, khi chưa có gì, "Chưa phát hành hoá đơn EVN nào cho kỳ {tháng}/{năm}."
  - Thất bại: "Không tải được danh sách nhà"; lỗi phát hành được hiển thị và hệ thống không tạo gì.

### 3.2.15.2 `<Admin>` Phát hành theo lô từ file .zip

- **Điều kiện kích hoạt:** Admin bấm "Nhập từ .zip".
- **Mô tả chức năng:** Nhập cả tháng hoá đơn đã scan trong một lần thay vì làm từng toà nhà.
- **Bố cục màn hình:**

  `[Ảnh: "Hoá đơn điện từ file .zip" — bảng theo lô, mỗi dòng một toà nhà]`

- **Chi tiết chức năng:**
  - Một kỳ áp cho cả lô ("KỲ CẢ LÔ … áp cho {n}/{m} nhà"), các dòng lọc theo trạng thái: "Tất cả",
    "Cần sửa", "Sẵn sàng", "Bỏ qua".
  - Cảnh báo được ghi thẳng trên màn hình: "Số liệu do máy đọc từ ảnh — **phải kiểm lại trước khi
    phát hành**. Sai tổng kWh là sai đơn giá, mà quản lý dựng hoá đơn từng phòng trên chính đơn giá
    đó."
  - Mỗi dòng hiển thị ảnh thu nhỏ của bản scan, tên toà nhà, mã khách hàng (sửa được, có dấu tick
    khi khớp với mã đã lưu), "TỔNG KWH", "TỔNG TIỀN · ĐƠN GIÁ", "CHỈ SỐ CÔNG TƠ (đầu kỳ → cuối kỳ)"
    và "TRẠNG THÁI" ("Sẵn sàng"). Nhà chia phòng hiển thị "quản lý ghi từng phòng" thay cho cặp chỉ
    số.
  - "Phát hành {n} nhà" phát hành mọi dòng đã sẵn sàng; "Đóng" thoát mà không phát hành.

### 3.2.15.3 `<Admin>` Thu hồi hoá đơn đã phát hành

- **Điều kiện kích hoạt:** Admin bấm "Thu hồi hoá đơn này" trên một dòng đã phát hành.
- **Mô tả chức năng:** Huỷ hoá đơn phát hành từ ảnh sai hoặc nhầm toà nhà. Admin là vai duy nhất
  được làm việc này.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại xác nhận thu hồi]`

- **Chi tiết chức năng:**
  - Thành công: dòng chuyển sang "Đã thu hồi" và toà nhà có thể phát hành lại cho kỳ đó.
  - Thất bại: dòng giữ trạng thái "Đang hiệu lực" và hiển thị lỗi.

---

## 3.2.16 `<Admin>` Phát hành hoá đơn nước

### 3.2.16.1 `<Admin>` Phát hành hoá đơn nước

- **Điều kiện kích hoạt:** Admin bấm "Hoá đơn nước" trong nhóm "Tài chính" và thực hiện đúng ba bước
  như 3.2.15: chọn nhà và kỳ, tải ảnh hoá đơn, phát hành.
- **Mô tả chức năng:** Cùng mô hình với điện, chỉ khác ở định danh đồng hồ là "số danh bộ" và đơn vị
  là m³.
- **Bố cục màn hình:**

  `[Ảnh: "Phát hành hoá đơn nước" và bảng theo lô "Hoá đơn nước từ file .zip"]`

- **Chi tiết chức năng:**
  - Các trường đọc được: số danh bộ, kỳ hoá đơn, chỉ số cũ và mới, tổng tiền — "Đọc được: {...}.
    Đối chiếu lại với ảnh trước khi phát hành."
  - Chốt chặn định danh: nếu toà nhà đã lưu số danh bộ mà số đọc trên giấy không khớp, hệ thống từ
    chối phát hành, hiển thị cả hai giá trị và nhắc kiểm tra xem có đang chọn nhầm căn không. Nếu
    toà nhà đã có số danh bộ mà Admin để trống ô trên giấy thì cũng bị từ chối.
  - "Nhập từ .zip" dùng đúng bảng theo lô như 3.2.15.2, với "TỔNG M³" thay cho "TỔNG KWH" và kỳ hoá
    đơn sửa được theo từng dòng; "Thu hồi hoá đơn này" thu hồi hoá đơn đã phát hành.
  - Thành công: hoá đơn tổng được tạo và hoá đơn của khách được tính theo đúng quy tắc như điện.
  - Thành công một phần: "Đã tạo hoá đơn tổng nhưng CHƯA gửi được cho khách thuê: {lý do}. Đừng phát
    hành lại — vào mục đã phát hành để gửi lại cho khách."
  - Thất bại: "Không phát hành được hoá đơn nước.", "Không đọc được số từ ảnh — nhập tay giúp
    mình.", "Không tải được ảnh lên.", "Không tải được danh sách hoá đơn nước."

---

## 3.2.17 `<Admin>` Phân xử khiếu nại hoàn cọc

### 3.2.17.1 `<Admin>` Xem danh sách khiếu nại hoàn cọc

- **Điều kiện kích hoạt:** Admin bấm "Hoàn cọc" trong nhóm "Khiếu nại".
- **Mô tả chức năng:** Tập hợp các vụ khách thuê cho rằng tiền cọc hoàn lại không đúng thoả thuận.
  Chỉ Admin được phân xử, vì lời khiếu nại nhắm vào chính Owner và quản lý.
- **Bố cục màn hình:**

  `[Ảnh: khiếu nại hoàn cọc — tab đang chờ và tab lịch sử]`

- **Chi tiết chức năng:**
  - Tab: "Đang chờ xử lý" và "Lịch sử đã xử lý"; ô tìm kiếm khớp tên khách, SĐT hoặc tên nhà.
  - Mỗi vụ hiển thị nội dung khách khiếu nại ("(không ghi nội dung)" khi bỏ trống), số tiền và kết
    cục: "Khách đã xác nhận nhận đủ", "Đã chuyển lại", "Đã bác khiếu nại".
  - Khoản hoàn cọc khách tự xác nhận được ghi "Khách tự xác nhận đã nhận đủ ngày {ngày} — không cần
    phân xử".
  - Trạng thái rỗng: "Không có khiếu nại nào đang chờ" ("Mọi khoản hoàn cọc đều đã được khách xác
    nhận hoặc chưa phát sinh tranh chấp.") và "Chưa có khiếu nại nào từng xảy ra".
  - Thất bại: "Tài khoản này không có quyền xem hồ sơ trả phòng (403)." hoặc "Không gọi được API —
    kiểm tra kết nối máy chủ."

### 3.2.17.2 `<Admin>` Kết luận khiếu nại hoàn cọc

- **Điều kiện kích hoạt:** Admin bấm "Kết luận khiếu nại" trên một vụ đang chờ.
- **Mô tả chức năng:** Khép vụ việc bằng một kết luận có ghi lý do để cả hai bên cùng đọc.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại kết luận — kết quả và lý do]`

- **Chi tiết chức năng:**
  - Admin ghi nhận kết quả và lập luận; vụ việc sau đó hiển thị "Đã khép" kèm "Quản trị viên kết
    luận ngày {ngày}".
  - Thành công: vụ việc chuyển sang tab lịch sử, Owner và khách thuê đều thấy kết luận.
  - Thất bại: vụ việc vẫn ở trạng thái chờ; "Huỷ" đóng hộp thoại mà không kết luận.

---

## 3.2.18 `<Admin>` Xét duyệt báo lỗi do khách

### 3.2.18.1 `<Admin>` Xem danh sách phiếu báo lỗi do khách

- **Điều kiện kích hoạt:** Admin bấm "Báo lỗi do khách" trong nhóm "Khiếu nại", hoặc nút cùng tên
  trên màn bảo trì. Mục menu có nhãn đếm số phiếu đang chờ quyết định.
- **Mô tả chức năng:** Khi quản lý khẳng định hư hỏng là do khách gây ra thì chi phí sẽ tính cho
  khách — nên lời khẳng định đó do Admin xét, không để người đưa ra tự quyết.
- **Bố cục màn hình:**

  `[Ảnh: bảng xét duyệt báo lỗi — bộ lọc, bằng chứng, nút quyết định]`

- **Chi tiết chức năng:**
  - Mỗi dòng gồm "Mã phiếu", "Nhà", "Phòng", "Khách thuê", "SĐT", "Thiết bị", "Mô tả lỗi", "Ngày báo
    cáo" và, khi đã xử lý, "Kết luận", "Người duyệt", "Ngày duyệt", "Ghi chú".
  - Trạng thái: "Chờ duyệt", "Đã duyệt", "Không duyệt".
  - "Xuất CSV" xuất đúng những gì đang hiển thị ("Xuất CSV danh sách đang hiển thị (đã áp tìm
    kiếm/lọc)"); "Làm mới" tải lại; "Bỏ lọc" xoá điều kiện lọc.
  - Thất bại: "Tài khoản này không có quyền xem báo lỗi do khách (403).", "Không gọi được API — kiểm
    tra kết nối máy chủ.", "Không tải thêm được — thử lại."

### 3.2.18.2 `<Admin>` Duyệt hoặc không duyệt phiếu báo lỗi

- **Điều kiện kích hoạt:** Admin bấm "Xem xét & duyệt" hoặc "Không duyệt" trên phiếu đang chờ.
- **Mô tả chức năng:** Quyết định khách có phải trả tiền cho hư hỏng đó hay không.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại quyết định kèm ảnh bằng chứng]`

- **Chi tiết chức năng:**
  - Duyệt nghĩa là xác nhận lỗi do khách và chi phí sửa chữa tính cho khách.
  - Không duyệt thì phải ghi chú; lý do mặc định được gợi ý là "Không đủ căn cứ xác định lỗi do
    khách." và chi phí do công ty chịu.
  - Thành công: phiếu hiển thị kết luận, người duyệt và ngày duyệt.
  - Thất bại: phiếu vẫn ở trạng thái chờ; "Huỷ" đóng hộp thoại.

---

## 3.2.19 `<Admin>` Phân xử khiếu nại hoá đơn điện/nước

### 3.2.19.1 `<Admin>` Xem danh sách khiếu nại hoá đơn

- **Điều kiện kích hoạt:** Admin bấm "Hoá đơn điện nước" trong nhóm "Khiếu nại".
- **Mô tả chức năng:** "Khách thuê báo hoá đơn không phải của nhà mình, hoặc chỉ số không khớp với
  ảnh đồng hồ. Đối chiếu ảnh gốc rồi kết luận — trong lúc chờ, hoá đơn đã tạm ngừng tính quá hạn nên
  đừng để treo lâu." Chỉ Admin được phân xử: lời tố nhắm vào chính người phát hành hoá đơn hoặc
  người đọc đồng hồ, và Admin cũng là vai duy nhất thu hồi được hoá đơn đã phát hành.
- **Bố cục màn hình:**

  `[Ảnh: "Khiếu nại hoá đơn điện / nước" — tab, bộ lọc loại, danh sách vụ việc]`

- **Chi tiết chức năng:**
  - Tab: "Đang chờ xử lý" và "Lịch sử đã xử lý", mỗi tab kèm số lượng; bộ lọc loại: "Tất cả",
    "Điện", "Nước".
  - Mỗi vụ được đặt cạnh hoá đơn tổng gốc ("Hoá đơn EVN gốc · {kỳ}" hoặc "Hoá đơn nước gốc · {kỳ}")
    kèm "Chỉ số cũ", "Chỉ số mới" và đơn giá, để Admin đối chiếu lời khiếu nại với hoá đơn giấy.
  - Ô tìm kiếm nhận tên khách, SĐT, mã hoá đơn hoặc tên nhà.
  - Trạng thái rỗng: "Không có khiếu nại nào đang chờ — Mọi hoá đơn điện/nước đều đang được khách
    chấp nhận."
  - Thất bại: "Tài khoản này không có quyền phân xử khiếu nại hoá đơn (403)." / "Không gọi được API
    — kiểm tra kết nối máy chủ."

### 3.2.19.2 `<Admin>` Kết luận khiếu nại hoá đơn

- **Điều kiện kích hoạt:** Admin bấm "Kết luận khiếu nại".
- **Mô tả chức năng:** Giải quyết hoá đơn đang bị khiếu nại.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại kết luận với ba kết quả có thể chọn]`

- **Chi tiết chức năng:**
  - Các kết quả: "Công nhận sai" (hoá đơn sai), "Bác khiếu nại" (hoá đơn đúng), "Khách tự rút"
    (khách rút khiếu nại).
  - Thành công: vụ việc chuyển sang tab lịch sử kèm kết luận; nếu công nhận hoá đơn sai, Admin thu
    hồi và phát hành lại theo 3.2.15.3 / 3.2.16.1.
  - Thất bại: vụ việc vẫn ở trạng thái chờ; "Huỷ" đóng hộp thoại.

---

## 3.2.20 `<Admin>` Quản lý danh mục khu vực

### 3.2.20.1 `<Admin>` Quản lý tỉnh/thành và quận/huyện

- **Điều kiện kích hoạt:** Admin bấm "Danh mục khu vực" trong nhóm "Hệ thống".
- **Mô tả chức năng:** "Danh mục tỉnh/thành và quận/huyện — dùng khi import bất động sản và phân
  công quản lý vận hành."
- **Bố cục màn hình:**

  `[Ảnh: "Khu vực" — danh sách tỉnh/thành bên trái, quận/huyện của tỉnh đang chọn bên phải]`

- **Chi tiết chức năng:**
  - Cột trái liệt kê tỉnh/thành kèm số quận/huyện; chọn một tỉnh sẽ hiện các quận/huyện bên phải với
    các cột "QUẬN", "BẤT ĐỘNG SẢN" và "QUẢN LÝ PHỤ TRÁCH" ("Chưa có quản lý" khi chưa gán), mỗi dòng
    có "Sửa" và biểu tượng xoá.
  - "+ Thêm Tỉnh/Thành phố" và "+ Thêm Quận/Huyện" thêm thủ công; "Import Excel" nạp danh mục hàng
    loạt; ô tìm kiếm lọc theo quận.
  - Cuối bảng chỉ rõ nơi phân công: "Gán / đổi quản lý cho khu vực tại **Khu vực & Quản lý**."
  - Xoá tỉnh/thành phải xác nhận ("Xoá tỉnh/thành phố") và bị từ chối khi còn bất động sản tham
    chiếu tới.
  - Thành công: quận/huyện mới trở thành lựa chọn hợp lệ khi import bất động sản và khi khách lọc
    trên website công khai.

---

## 3.2.21 `<Admin>` Trang thiết bị & mã QR

### 3.2.21.1 `<Admin>` Xem thiết bị theo nhà và in tem QR

- **Điều kiện kích hoạt:** Admin bấm "Danh mục thiết bị" trong nhóm "Hệ thống", hoặc nút "Danh mục
  thiết bị" trên màn bảo trì, rồi chọn toà nhà.
- **Mô tả chức năng:** "Xem toàn bộ thiết bị trong tòa nhà và in tem QR để dán — khách thuê quét QR
  để báo bảo trì." Tem QR là thứ biến một món đồ hỏng trong phòng thành phiếu bảo trì đã biết sẵn
  thiết bị nào.
- **Bố cục màn hình:**

  `[Ảnh: "Trang thiết bị & Mã QR" — ô chọn nhà, thiết bị theo từng phòng kèm mã QR]`

- **Chi tiết chức năng:**
  - Ô chọn toà nhà và ô tìm kiếm ("Tìm theo tên, mã thiết bị, phòng…") thu hẹp danh sách; các chip
    tình trạng ("Tất cả", "Mới", "Hoạt động tốt", …) lọc tiếp.
  - Danh sách xem theo "Theo phòng" (nhóm theo phòng) hoặc dạng "Bảng", phần đầu ghi "{n} thiết bị ·
    {m} phòng/khu vực".
  - Mỗi thiết bị hiển thị mã QR, tên, mã thiết bị ("Mã EQ-46"), tình trạng và lịch sử sửa chữa
    ("{n} lần bảo trì"), kèm "QR lớn" để phóng to một tem.
  - In tem: chọn khổ tem ("Nhỏ" / "Vừa" / "Lớn"), sau đó "In tất cả tem QR ({n})" in phần đang chọn
    và "In toàn bộ nhà ({n})" in mọi tem của toà nhà. Có thể tick từng thiết bị hoặc cả phòng
    ("Chọn tất cả {n} tem", "Chọn phòng").
  - Thiết bị được đặt trong phòng ("Phòng {số}") hoặc khu vực dùng chung ("Khu vực chung / Toàn
    nhà"); tình trạng gồm "Mới", "Hoạt động tốt", "Đang bảo trì", "Đang hỏng", "Đã thanh lý"; bảo
    hành hiển thị "Còn bảo hành" / "BH còn {n} ngày" / "Hết bảo hành".

---

## 3.2.22 `<Admin>` Trung tâm thông báo

### 3.2.22.1 `<Admin>` Đọc thông báo hệ thống

- **Điều kiện kích hoạt:** Admin bấm chuông thông báo trên thanh đầu trang, rồi chọn "Xem tất cả".
- **Mô tả chức năng:** Tập hợp các sự kiện Admin cần phản ứng, theo đúng thứ tự phát sinh.
- **Bố cục màn hình:**

  `[Ảnh: trung tâm thông báo của Admin]`

- **Chi tiết chức năng:**
  - Chuông hiển thị số thông báo chưa đọc và tự cập nhật trong lúc mở hệ thống.
  - Mỗi thông báo có thể đánh dấu "Đã đọc"; "Đọc hết" xoá toàn bộ nhãn chưa đọc một lần.
  - Thất bại: danh sách hiển thị "Tải lại" khi không tải được.

---

## 3.2.23 `<Owner>` Bảng điều hành

### 3.2.23.1 `<Owner>` Xem tổng quan kinh doanh

- **Điều kiện kích hoạt:** Owner đăng nhập, hoặc bấm "Bảng điều hành" trên sidebar.
- **Mô tả chức năng:** Cho chủ nhà biết trong một màn hình: tháng này danh mục thu được bao nhiêu và
  đang có việc gì chờ họ quyết định.
- **Bố cục màn hình:**

  `[Ảnh: bảng điều hành Owner — thẻ doanh thu/chi phí/lợi nhuận, tỷ lệ lấp đầy, danh sách việc chờ]`

- **Chi tiết chức năng:**
  - Thanh đầu trang có ô tìm kiếm ("Tìm kiếm bất động sản, quản lý, khách thuê..."), đồng hồ kèm
    ngày, chuông thông báo và menu tài khoản.
  - Thẻ tiền: "Doanh thu tháng này" ("{n} nhà đã duyệt giá"), "Tổng chi phí" ("Thuê căn + chi phí
    ghi nhận"), "Lợi nhuận ròng" ("Biên LN {n}%"), "Tỷ lệ lấp đầy" ("{n}/{m} phòng · đã duyệt giá").
  - Chi phí tách thành "Thuê nhà nguyên căn" (tiền công ty trả chủ nhà) và "Chi phí khác".
  - Danh sách việc: "Nhà chờ duyệt giá" ("Chờ bạn chốt giá để vận hành", kèm nhãn "Cần duyệt") và
    "Bảo trì chờ xử lý"; trạng thái rỗng "Không có nhà nào chờ".
  - Chỉ những toà nhà đã được duyệt giá mới được tính vào các con số, nên số liệu phản ánh đúng phần
    danh mục thực sự có khả năng sinh tiền.

---

## 3.2.24 `<Owner>` Danh mục bất động sản

### 3.2.24.1 `<Owner>` Xem danh sách bất động sản

- **Điều kiện kích hoạt:** Owner bấm "Bất động sản" trong nhóm "Vận hành".
- **Mô tả chức năng:** Toàn bộ toà nhà công ty đang vận hành cho chủ nhà này, kèm các con số mà một
  người chủ quan tâm: đang thu bao nhiêu, lấp đầy đến đâu, còn gì chờ quyết định.
- **Bố cục màn hình:**

  `[Ảnh: "Bất động sản" — banner chờ duyệt giá, thẻ KPI, thẻ toà nhà]`

- **Chi tiết chức năng:**
  - Dòng mô tả dưới tiêu đề tóm tắt cả danh mục: "{n} tòa nhà đang quản lý · {m} phòng · đang thu
    {tiền}/tháng · niêm yết cả danh mục {tiền}/tháng".
  - Khi có hồ sơ chờ định giá, một banner màu hổ phách hiện lên trên cùng: "{n} hồ sơ đang chờ bạn
    phê duyệt giá" kèm tên các toà nhà và nút "Xem & duyệt →" (3.2.25).
  - Thẻ KPI: "TỔNG TÒA NHÀ", "ĐANG CÓ KHÁCH" ("{n}/{m} chỗ đã có người"), "ĐANG ĐỂ TRỐNG" ("chưa có
    khách nào") và "CHƯA THU ĐỦ THÁNG {kỳ}" ("Còn {tiền} chưa thu ({n} HĐ)").
  - Ô tìm kiếm không dấu, "Bộ lọc", nút đổi giữa dạng thẻ và dạng bảng, sắp xếp ("Mới thêm gần
    nhất") và số dòng mỗi trang hoạt động như các màn của Admin; chip trạng thái hiển thị số lượng
    ("Tất cả", "Hoạt động").
  - Mỗi thẻ hiển thị trạng thái vận hành ("Hoạt động"), trạng thái kinh doanh ("Đang cho thuê" /
    "Còn phòng trống"), loại hình ("Chia phòng" / "Nguyên căn"), quận/huyện, "ĐANG THU {tiền} từ {n}
    hợp đồng" và thanh lấp đầy ("{n}/{m} phòng có khách").
  - Trạng thái rỗng: "Không có tòa nhà nào khớp bộ lọc." và "Chưa có tòa nhà nào đang quản lý."

### 3.2.24.2 `<Owner>` Xem chi tiết một toà nhà

- **Điều kiện kích hoạt:** Owner bấm vào một thẻ bất động sản.
- **Mô tả chức năng:** Mọi thông tin của một toà nhà: phòng, thiết bị và trạng thái kinh doanh hiện
  tại.
- **Bố cục màn hình:**

  `[Ảnh: chi tiết bất động sản của Owner — tab "Tổng quan" / "Phòng" / "Thiết bị"]`

- **Chi tiết chức năng:**
  - Các tab: "Tổng quan", "Phòng", "Thiết bị".
  - Trạng thái phòng: "Phòng trống", "Đang thuê", "Bảo trì", "Chưa mở cho thuê"; toà nhà đã sẵn sàng
    kinh doanh được đánh dấu "Sẵn sàng cho thuê".
  - Thư viện ảnh mở toàn màn hình, chuyển ảnh bằng phím mũi tên ("Ảnh trước (←)") và đóng bằng
    "Đóng (Esc)".

---

## 3.2.25 `<Owner>` Duyệt giá & kích hoạt nhà mới

### 3.2.25.1 `<Owner>` Mở hàng chờ duyệt giá

- **Điều kiện kích hoạt:** Owner bấm "Xem & duyệt →" trên banner, hoặc thẻ "Nhà chờ duyệt giá" ở bảng
  điều hành.
- **Mô tả chức năng:** Liệt kê các hồ sơ Admin đã gửi sang, tách theo loại quyết định cần đưa ra.
- **Bố cục màn hình:**

  `[Ảnh: "Hồ sơ chờ bạn phê duyệt giá" — hai cột, ô tìm kiếm]`

- **Chi tiết chức năng:**
  - Tiêu đề đếm cả hai loại: "{n} nhà mới · {m} cải tạo bổ sung — bấm vào một hồ sơ để xem và duyệt",
    kèm ô tìm kiếm theo tên nhà, địa chỉ hoặc khu vực.
  - Cột trái — "Nhà mới — duyệt giá lần đầu": "Chưa từng cho thuê. Duyệt xong nhà được kích hoạt và
    bắt đầu nhận khách."
  - Cột phải — "Cải tạo bổ sung — duyệt lại giá": "Nhà đang cho thuê vừa cải tạo thêm. Chốt giá niêm
    yết mới; khách đang ở giữ giá hợp đồng." (3.2.26)
  - Mỗi dòng mở hồ sơ bằng "Duyệt ›"; cuối hộp thoại tổng kết "Tổng {n} hồ sơ chờ duyệt". Cột không
    có hồ sơ hiển thị "Không có hồ sơ nào".

### 3.2.25.2 `<Owner>` Xem toàn bộ tiền đã bỏ ra cho toà nhà

- **Điều kiện kích hoạt:** Owner mở một hồ sơ từ hàng chờ.
- **Mô tả chức năng:** "Duyệt giá & Kích hoạt Tòa nhà — Xem toàn bộ tiền đã bỏ ra cho {tên nhà}, đặt
  mục tiêu lãi, rồi chốt giá cho thuê." Đây là quyết định biến một hồ sơ tiếp nhận thành sản phẩm
  bán được.
- **Bố cục màn hình:**

  `[Ảnh: trang duyệt giá — thông tin toà nhà, bản đồ, ba thẻ chi phí]`

- **Chi tiết chức năng:**
  - "THÔNG TIN TÒA NHÀ" hiển thị địa chỉ, "Loại hình", "Diện tích", "Cải tạo", "Số tầng", "Tổng
    phòng", "Mã KH điện", "Số danh bộ nước" và mô tả chi tiết, đặt cạnh bản đồ. Phần đầu trang ghi
    thời điểm Admin gửi ("Admin gửi duyệt: {ngày}").
  - "TIỀN ĐÃ BỎ RA CHO TÒA NHÀ NÀY" — "Ba khoản dưới đây cộng lại là toàn bộ tiền bạn bỏ ra cho căn
    này — phải thu lại đủ qua tiền thuê trước khi hết hợp đồng":
    1. "TIỀN THUÊ TRẢ CHỦ NHÀ" kèm mã hợp đồng, tên chủ nhà, thời hạn, số tháng và trạng thái ("Đang
       trong thời hạn thuê");
    2. "CHI PHÍ CẢI TẠO" chi tiết từng hạng mục (ví dụ "Sơn sửa", "Điện nước", "Sàn nhà", "Kết cấu")
       kèm nội dung công việc;
    3. "THIẾT BỊ MUA MỚI" — "Chỉ tính thiết bị công ty **mua mới** để cho thuê. Đồ chủ nhà bàn giao
       được ghi nhận riêng và **không** tính vào tiền bỏ ra."
  - "TỔNG TIỀN ĐÃ BỎ RA" cộng ba khoản trên.
  - "TỪNG KHOẢN VỐN VÀ LỊCH KHẤU HAO" liệt kê từng khoản — "KHOẢN", "ÁP CHO" ("Cả nhà", "Khu vực
    chung", "Phòng {số}", hoặc "Chia đều các phòng"), "SỐ TIỀN", "SỐ THÁNG", "ĐÃ LẤY LẠI", "CÒN
    LẠI", "MỖI THÁNG" — kèm các tổng "TỔNG CÁC KHOẢN", "ĐÃ LẤY LẠI TỚI HÔM NAY", "CÒN PHẢI LẤY LẠI"
    và "MỖI THÁNG". Quy tắc được nêu một lần: "Mỗi khoản được lấy lại đều theo tháng từ ngày bắt đầu
    của nó. Khoản của đợt trước giữ nguyên số tiền mỗi tháng — đợt cải tạo bổ sung chỉ cộng thêm
    khoản mới, không tính lại từ đầu."
  - "THIẾT BỊ VẬN HÀNH" tóm tắt thiết bị đang lắp ("{n} đang dùng · {tiền}").

### 3.2.25.3 `<Owner>` Tính giá thuê đề xuất

- **Điều kiện kích hoạt:** Owner xem khối mục tiêu, hoặc bấm "Tính lại theo cấu hình".
- **Mô tả chức năng:** Tính ra mức giá thuê vừa thu hồi được vốn vừa đạt mục tiêu lãi của chủ nhà,
  và trình bày từng bước thay vì chỉ đưa ra một con số.
- **Bố cục màn hình:**

  `[Ảnh: khối "MỤC TIÊU CỦA BẠN" và khối "TỪ TIỀN BỎ RA TỚI GIÁ THUÊ — TỪNG BƯỚC"]`

- **Chi tiết chức năng:**
  - "MỤC TIÊU CỦA BẠN" lặp lại chính sách giá (3.2.27) — "Lấy từ Cấu hình duyệt giá — áp dụng cho
    mọi căn nhà. Muốn đổi thì sửa ở đó, không sửa riêng từng căn": "Cách tính giá", "Lãi muốn thu mỗi
    tháng", "Chi phí vận hành khác", phần lương quản lý phân bổ ("Lương QL — {tên} ({khu vực} ·
    {lương} ÷ {n} nhà đang phụ trách)"), "Tổng chi phí mỗi tháng", "Tăng giá thuê mỗi năm", "Cộng
    thêm phòng trống" và "Trừ tháng trả nhà". "Sửa cấu hình duyệt giá" chuyển sang 3.2.27.
  - "TỪ TIỀN BỎ RA TỚI GIÁ THUÊ — TỪNG BƯỚC" — "Mỗi dòng là một bước tính, dùng đúng con số của dòng
    phía trên":
    - "Tổng tiền đã bỏ ra" → "Thời hạn hợp đồng với chủ nhà";
    - "Đã trôi mất trước khi cho thuê được" (kèm phép tính viết rõ, ví dụ "HĐ chủ nhà 18/09/2026 →
      17/09/2029 = 36 tháng tròn … Chỉ đếm tháng tròn");
    - "Trừ mấy tháng cuối để trả nhà cho chủ" — "Khách dọn đi, tháo nội thất, sơn sửa hoàn trả hiện
      trạng cho chủ nhà — nhà trống, không thu được tiền";
    - "Số tháng có tiền vào — dùng để chia vốn";
    - "Mỗi tháng phải lấy lại" + "Chi phí vận hành mỗi tháng" + "Dự phòng sửa chữa sau bảo hành" =
      "Thu tối thiểu mỗi tháng";
    - "Tiền lời muốn bỏ túi mỗi tháng" và "Cộng thêm cho tháng trống phòng {n}%" cho ra "GIÁ THUÊ
      PHẢI ĐẠT MỖI THÁNG".
  - Thất bại: "Chưa tải được cấu hình duyệt giá. Tải lại trang hoặc mở "Cấu hình duyệt giá"."; "Cấu
    hình chưa có tiền lãi mục tiêu / tỷ lệ sinh lời mục tiêu. Vào "Cấu hình duyệt giá" để nhập
    trước."; "Không tính được giá"; "Không tải được dữ liệu".

### 3.2.25.4 `<Owner>` Chốt giá thuê

- **Điều kiện kích hoạt:** Owner sửa các ô giá ở phần cuối trang.
- **Mô tả chức năng:** Ấn định mức giá sẽ chào cho khách thuê.
- **Bố cục màn hình:**

  `[Ảnh: "CHỐT GIÁ THUÊ CẢ CĂN" (nguyên căn) và "CHỐT GIÁ THUÊ TỪNG PHÒNG" (chia phòng)]`

- **Chi tiết chức năng:**
  - Nhà nguyên căn — "CHỐT GIÁ THUÊ CẢ CĂN": "Giá đề xuất đã bao gồm lãi mục tiêu. Bạn có thể sửa,
    hệ thống sẽ cảnh báo nếu xuống dưới mức hoà vốn." Khối này hiển thị "GIÁ GỢI Ý (ĐÃ TÍNH LÃI)" và
    ô sửa được "Giá cho thuê áp dụng / tháng", kèm "Lấy giá đề xuất" và "↑ Làm tròn 100k".
  - Nhà chia phòng — "CHỐT GIÁ THUÊ TỪNG PHÒNG ({n} phòng)": "Mỗi phòng một dòng, cùng loại số thẳng
    cột để so sánh. Bấm tên phòng để xem phòng đó gánh bao nhiêu tiền." Bảng gồm "PHÒNG" (kèm diện
    tích), "VỐN CÒN PHẢI LẤY LẠI", "HOÀN VỐN / THÁNG", "GIÁ ĐỀ XUẤT", ô sửa được "GIÁ ÁP DỤNG" và
    "LÃI TRƯỚC VẬN HÀNH", kèm dòng tổng và phần kiểm tra "TỔNG TIỀN THUÊ CÁC PHÒNG / THÁNG — Mục
    tiêu cần đạt: {tiền}" ("Vượt mục tiêu {tiền}"). Thao tác hàng loạt: "Lấy giá đề xuất cho tất cả"
    và "Làm tròn lên 100k tất cả".
  - **Quy tắc nghiệp vụ:** phần thu hồi vốn được **chia đều cho các phòng**, không chia theo diện
    tích — cột "ÁP CHO" ghi rõ "Chia đều các phòng", nên hai phòng khác diện tích trong cùng toà nhà
    có cùng giá niêm yết.
  - "NẾU CHỐT GIÁ NÀY, CẢ KỲ {n} THÁNG" cho thấy hệ quả: "Tổng tiền thuê thu về", "Trừ tiền đã bỏ
    ra", "Lãi dự kiến cả kỳ", "Lãi trung bình mỗi tháng".
  - "LÃI LỖ THẬT CỦA CẢ KỲ {n} THÁNG" đưa ra con số trung thực — "Chi phí vận hành đã cộng vào giá
    thuê nên khách trả, nhưng đó vẫn là tiền bạn chi ra hằng tháng — phải trừ đi, không thì tính lãi
    hai lần": tổng tiền thuê thu được, trừ tiền đã bỏ ra, trừ chi phí vận hành, trừ dự phòng sửa
    chữa sau bảo hành → "TIỀN LỜI THẬT CẢ KỲ" và "Tiền lời thật trung bình mỗi tháng". Khối bên cạnh
    giải thích "VÌ SAO LÃI RÒNG {tiền}/THÁNG CHỨ KHÔNG PHẢI {mục tiêu}" (lãi mục tiêu × số tháng
    cộng biên dự phòng trống phòng), kèm lưu ý "Phần vượt mục tiêu chủ yếu đến từ biên dự phòng
    trống phòng — nó chỉ thành lãi khi phòng cho thuê được liên tục."
  - Một thanh cố định luôn hiển thị quyết định khi cuộn trang: "GIÁ CHỐT / THÁNG", "TIỀN LỜI THẬT /
    THÁNG" (kèm mục tiêu bên dưới), "TIỀN LỜI THẬT CẢ KỲ ({n} THÁNG)" và nút "Xác nhận & Kích hoạt".

### 3.2.25.5 `<Owner>` Kích hoạt cho thuê

- **Điều kiện kích hoạt:** Owner bấm "Xác nhận & Kích hoạt".
- **Mô tả chức năng:** Ấn định giá niêm yết và mở toà nhà cho kinh doanh.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại "XÁC NHẬN LẦN CUỐI — Kích hoạt cho thuê"]`

- **Chi tiết chức năng:**
  - Hộp thoại nhắc lại "GIÁ CHỐT / THÁNG", "TIỀN LỜI THẬT / THÁNG", "Kỳ thu được tiền", "Tiền lời
    thật cả kỳ" và nêu tên quản lý sẽ tiếp quản ("Quản lý sẽ nhận nhà: {tên} · {khu vực}").
  - "SAU KHI KÍCH HOẠT" nêu rõ hệ quả: "Nhà lên danh sách cho thuê và quản lý khu vực bắt đầu vận
    hành."; "Giá này là giá bán cho khách vào ở. **Chỉ sửa được khi đơn vị còn TRỐNG** — có khách
    rồi thì khoá tới lúc khách rời đi, vì hợp đồng đã ký là cam kết hai chiều."; "Muốn đổi giá thì
    đổi ngay bây giờ, đừng chờ tới lúc đã nhận khách."
  - "Xem lại" quay về trang; "Kích hoạt cho thuê" xác nhận.
  - Thành công: toà nhà lên sóng — các chỗ còn trống xuất hiện trên website công khai (3.2.1.2) và
    quản lý vận hành bắt đầu tiếp quản.
  - Thất bại: "Lỗi khi xác nhận" — giá chưa được chốt và hồ sơ vẫn nằm trong hàng chờ.

---

## 3.2.26 `<Owner>` Duyệt lại giá sau cải tạo bổ sung

### 3.2.26.1 `<Owner>` Duyệt giá niêm yết mới

- **Điều kiện kích hoạt:** Owner mở một hồ sơ ở cột "Cải tạo bổ sung — duyệt lại giá".
- **Mô tả chức năng:** Quyết định phần tiền chi cho đợt cải tạo mới có được tính vào giá cho khách
  sau này hay không, và ở mức nào.
- **Bố cục màn hình:**

  `[Ảnh: trang duyệt lại giá — chi phí đợt này, khách đang ở, giá niêm yết mới]`

- **Chi tiết chức năng:**
  - "Tổng chi đợt này" tách thành "Tính vào giá" (hạng mục nâng cấp, làm tăng giá niêm yết) và
    "Công ty tự chịu" (thay thế tương đương, không làm tăng giá); "Khoản công ty tự chịu tính thế
    nào" giải thích cách tách, "Quy tắc tính giá niêm yết mới" nêu đầy đủ quy tắc.
  - "KHÁCH ĐANG Ở" nêu tên những khách giữ nguyên giá hợp đồng, hoặc xác nhận "Không phòng nào có
    khách — giá mới áp dụng ngay khi duyệt."
  - "Xem chi tiết từng khoản vốn và lịch khấu hao" mở đúng bảng vốn như 3.2.25.2, trong đó đợt mới
    được cộng thêm thành các dòng mới chứ không tính lại lịch khấu hao từ đầu.
  - Các phương án giá: "Giá cũ + phần cải tạo", "Giữ nguyên giá cũ", "Làm tròn lên 100k", áp dụng
    bằng "Dùng giá này".
  - Thanh cố định hiển thị "GIÁ NIÊM YẾT MỚI / THÁNG" kèm chênh lệch so với giá cũ ("+{tiền} so với
    cũ") và nút "Duyệt giá mới", xác nhận bằng "Duyệt giá niêm yết mới?".
  - Thành công: giá mới áp cho các hợp đồng sau này; khách đang ở không bị ảnh hưởng.
  - Thất bại: giữ nguyên giá cũ và hiển thị lỗi.

---

## 3.2.27 `<Owner>` Cấu hình duyệt giá

### 3.2.27.1 `<Owner>` Đặt mục tiêu lãi, chi phí và các biên dự phòng

- **Điều kiện kích hoạt:** Owner bấm "Cấu hình giá" trong nhóm "Hệ thống", hoặc "Sửa cấu hình duyệt
  giá" từ một trang duyệt giá.
- **Mô tả chức năng:** "Cấu hình duyệt giá — Áp dụng cho **tất cả** căn nhà. Màn duyệt giá của từng
  căn sẽ dùng đúng những số này — không phải nhập lại ở đó nữa."
- **Bố cục màn hình:**

  `[Ảnh: "Cấu hình duyệt giá" — bốn khối cấu hình và khung tóm tắt "MÁY CHỦ SẼ NHẬN"]`

- **Chi tiết chức năng:**
  - **"MỤC TIÊU LỢI NHUẬN" — "Định giá theo cách nào?"**: "Theo tiền lãi" ("Biết muốn lãi/tháng") với
    ô "Tiền lãi muốn thu mỗi tháng" ("Tiền lời **thực nhận** mỗi tháng của **mỗi căn**, sau khi đã
    trừ chi phí vận hành và phần thu hồi vốn"), hoặc "Theo % sinh lời" ("Biết % lời/năm") với ô "Tỷ
    lệ sinh lời mong muốn mỗi năm".
  - **"CHI PHÍ VẬN HÀNH MỖI THÁNG"**: "Chi phí vận hành khác (không gồm lương quản lý)" — "Internet,
    vệ sinh, bảo trì định kỳ… — tiền mặt chi ra hằng tháng cho mỗi căn." Bên dưới, "Lương quản lý vận
    hành" chỉ hiển thị để đối chiếu ("Chỉ hiển thị để đối chiếu. Mỗi căn gánh **lương ÷ số nhà**
    người đó đang phụ trách") dưới dạng bảng "QUẢN LÝ", "LƯƠNG / THÁNG", "ĐANG COI" và "MỖI NHÀ
    GÁNH", kèm "Sửa bảng lương" chuyển sang 3.2.31.
  - **"TĂNG GIÁ THUÊ HẰNG NĂM"**: "Tăng mỗi năm dương lịch" (%, "Áp vào 01/01, cộng dồn. Để 0 nếu
    không tăng"), "Ân hạn cho khách mới" (số tháng — khách chưa thuê đủ số tháng đó tính tới 01/01
    thì kỳ tăng được hoãn sang năm sau) và "Báo giá năm sau trước" (số tháng — từ mốc này quản lý
    chốt giá với khách theo mức của năm sau). Khối mô phỏng ("THỬ: KHÁCH BẮT ĐẦU THUÊ" + "GIÁ LÚC
    KÝ") hiển thị lịch giá theo từng năm, kèm lưu ý "Kỳ bị hoãn là **bỏ hẳn**, không nợ rồi trả bù
    vào năm sau."
    - Cảnh báo pháp lý ngay tại chỗ: "Điều khoản này phải có trong hợp đồng khách ký. Hợp đồng chỉ
      ghi mỗi "{giá}/tháng" rồi sau đó báo tăng là **sửa hợp đồng đơn phương** — khách có quyền từ
      chối. Mẫu hợp đồng phải in rõ mức tăng (5%/năm) và mốc tăng (01/01) để khách đọc trước khi ký."
    - Trạng thái: "Đang chạy thật. Hệ thống tự tăng giá vào 01/01 hằng năm, bỏ qua khách còn trong ân
      hạn, và **báo cho khách trước 15 ngày**. Điều khoản được in sẵn vào file hợp đồng. Sửa ở đây là
      đổi chính sách cho các hợp đồng ký sau khi lưu."
  - **"DỰ PHÒNG RỦI RO"**: "Biên dự phòng trống phòng" (%, "Bù những tháng phòng bỏ trống. Thường để
    10%.", kèm mục "Cách {n}% này vào giá" giải thích cách tính) và "Trừ cửa sổ bàn giao cuối kỳ"
    (số tháng, "Số tháng cuối hợp đồng chủ nhà **không tính doanh thu**: khách dọn đi, tháo nội thất,
    sơn sửa hoàn trả hiện trạng — nhà trống, không thu được tiền. Để 0 nếu không cần chừa tháng
    nào."). Có một chốt chặn: hợp đồng chủ nhà còn dưới sáu tháng thì không bị trừ thêm tháng nào,
    "vì trừ 1 tháng trên 3 tháng là mất 1/3 thời gian thu tiền".
  - **"MÁY CHỦ SẼ NHẬN"** phản chiếu đúng những gì sẽ được lưu — "Cách định giá", "Lãi mục tiêu /
    tháng", "Chi phí vận hành khác", "+ Lương QL (bình quân)", "Tổng chi phí / tháng", "Biên trống
    phòng", "Cửa sổ bàn giao" — và giải thích vì sao hai dòng chi phí được cộng gộp trước khi gửi.
    "Lưu cấu hình" lưu lại; "Về danh sách bất động sản" thoát.
  - Kiểm tra dữ liệu: "Nhập tiền lãi muốn thu mỗi tháng (lớn hơn 0)." / "Nhập tỷ lệ sinh lời mong
    muốn mỗi năm (lớn hơn 0%)."
  - Thành công: "Đã lưu cấu hình lên máy chủ — mọi màn duyệt giá dùng số này.", kèm nhãn "Đã đồng bộ
    máy chủ".
  - Thành công một phần: "Đã lưu trên máy này. Máy chủ chưa nhận được — xem cảnh báo bên dưới.", nhãn
    "Chỉ lưu trên máy này".
  - Cấu hình chưa từng nhập sẽ hiển thị "Chưa cấu hình", và mọi màn duyệt giá đều bị chặn cho tới khi
    nhập xong.

---

## 3.2.28 `<Owner>` Quản lý khách thuê

### 3.2.28.1 `<Owner>` Xem danh sách khách thuê

- **Điều kiện kích hoạt:** Owner bấm "Khách thuê" trong nhóm "Vận hành".
- **Mô tả chức năng:** "Ai đang ở đâu, phòng nào còn trống."
- **Bố cục màn hình:**

  `[Ảnh: "Khách thuê" — thẻ KPI, cột bất động sản bên trái, bảng khách thuê]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "KHÁCH ĐANG Ở", "CHỖ CÒN TRỐNG" ("Trên tổng {n} chỗ"), "SẮP HẾT HẠN ≤60N" ("Cần chốt
    gia hạn sớm") và "KHÁCH ĐÃ RỜI ĐI" ("Nằm ở tab riêng, tra khi cần").
  - Cột bên trái liệt kê các toà nhà kèm tỷ lệ lấp đầy ("4/5"), tìm kiếm được và lọc nhanh bằng "Chỉ
    hiện căn đang có khách".
  - Các tab: "Đang thuê", "Sơ đồ phòng" (toà nhà vẽ thành sơ đồ, mỗi phòng tô màu theo trạng thái) và
    "Đã rời đi"; ô tìm kiếm khớp tên khách, SĐT, CCCD hoặc phòng.
  - Bảng gồm "KHÁCH THUÊ" (tên, số điện thoại và số CCCD — mặc định che một phần, bấm biểu tượng con
    mắt của từng ô để hiện), "CHỖ Ở" (toà nhà, phòng và "Đang ở"), "THỜI GIAN THUÊ" (thời hạn và số
    năm), "TIỀN PHÒNG" và "LỊCH SỬ" ("{n} hợp đồng").
  - "Xem điều khoản & hồ sơ hợp đồng →" mở màn hợp đồng (3.2.29).
  - Thất bại: "Không tải được danh sách bất động sản", "Không tải được dữ liệu khách thuê", "Không
    tải được danh sách phòng của căn này".

---

## 3.2.29 `<Owner>` Quản lý hợp đồng

### 3.2.29.1 `<Owner>` Xem hợp đồng

- **Điều kiện kích hoạt:** Owner bấm "Hợp đồng" trong nhóm "Vận hành".
- **Mô tả chức năng:** "Hợp đồng cho khách thuê (nguồn thu) và master lease ký với chủ nhà (nguồn
  chi) — bấm một dòng để xem toàn bộ chi tiết."
- **Bố cục màn hình:**

  `[Ảnh: "Hợp đồng" — hai tab, sáu thẻ KPI, bảng hợp đồng]`

- **Chi tiết chức năng:**
  - Hai tab kèm số lượng: "Quản lý ↔ Khách thuê" và "Owner ↔ Chủ nhà (master lease)".
  - Thẻ KPI: "TỔNG HỢP ĐỒNG" ("{n} đang chạy"), "ĐANG HIỆU LỰC" ("{tiền}/tháng"), "CHỜ ĐÓN KHÁCH"
    ("Đã lập hồ sơ, chưa giao phòng"), "CHỜ KÍCH HOẠT" ("Đã giao phòng, chờ thu tiền"), "SẮP HẾT HẠN
    ≤60N" ("Cần chốt gia hạn sớm") và "ĐÃ KẾT THÚC" ("Chấm dứt + hết hạn").
  - Tab hiển thị: "Đang theo dõi", "Đã kết thúc", "Tất cả"; bộ lọc "Tất cả trạng thái", "Tất cả bất
    động sản" và sắp xếp "Mới tạo trước"; ô tìm kiếm khớp mã HĐ, tên khách, SĐT, CCCD, toà nhà hoặc
    phòng. Khi hợp đồng đã kết thúc bị ẩn, danh sách ghi rõ ("Còn {n} kết quả ở nhóm đã kết thúc —
    xem tất cả").
  - Bảng gồm "MÃ HĐ", "KHÁCH THUÊ" (kèm SĐT che một phần và biểu tượng con mắt), "BẤT ĐỘNG SẢN" (toà
    nhà, phòng và quận/huyện), "THỜI HẠN" (thời hạn kèm "Còn {n} ngày" hoặc "Quá hạn {n} ngày"),
    "GIÁ THUÊ / CỌC" và "TRẠNG THÁI" ("Chờ đón khách", "Đang hiệu lực", …). Bấm một dòng để mở khung
    chi tiết hợp đồng.
  - Lưu ý: trạng thái "Chờ đón khách" là hợp đồng đã lập chờ khách vào ở — giao diện không bao giờ
    gọi đó là "nháp".
  - Thất bại: "Không tìm thấy hợp đồng {mã} trong danh sách đang tải."; trang có sẵn "Làm mới",
    "Thử lại" và "Xoá bộ lọc".

---

## 3.2.30 `<Owner>` Đơn xin gia hạn

### 3.2.30.1 `<Owner>` Theo dõi đơn xin gia hạn

- **Điều kiện kích hoạt:** Owner bấm "Đơn gia hạn" trong nhóm "Vận hành".
- **Mô tả chức năng:** Cho chủ nhà thấy khách nào xin ở thêm và đơn đã được xử lý ra sao. Quyền
  quyết định thuộc về Admin (3.2.14).
- **Bố cục màn hình:**

  `[Ảnh: danh sách đơn gia hạn phía Owner]`

- **Chi tiết chức năng:**
  - Mỗi đơn hiển thị khách thuê, toà nhà và phòng, thời gian xin thêm và trạng thái hiện tại ("Chờ
    duyệt" hoặc đã xử lý).
  - Thành công: Owner chủ động biết phòng nào sắp trống, phòng nào tiếp tục có khách.

---

## 3.2.31 `<Owner>` Quản lý nhân sự vận hành

### 3.2.31.1 `<Owner>` Xem danh sách quản lý vận hành

- **Điều kiện kích hoạt:** Owner bấm "Quản lý vận hành" trong nhóm "Nhân sự".
- **Mô tả chức năng:** "{n} quản lý vận hành đang giám sát các bất động sản Hoàng Bình Land" — những
  người trực tiếp vận hành và khối lượng việc từng người đang gánh.
- **Bố cục màn hình:**

  `[Ảnh: "Quản lý vận hành" — hai thẻ KPI, các dòng quản lý kèm khối lượng việc]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "{n} Quản lý · đều đang hoạt động" và "{m} Khách thuê đang ở".
  - Mỗi dòng hiển thị họ tên, tên đăng nhập và số điện thoại, kèm khối lượng việc: "{n} khu vực",
    "{m} nhà", "{k} khách", "{p}% lấp đầy", "{q} bảo trì"; bấm để mở rộng chi tiết.
  - Ô tìm kiếm khớp tên hoặc số điện thoại; quản lý chưa có khu vực được đánh dấu "Chưa phụ trách khu
    vực nào".

### 3.2.31.2 `<Owner>` Nhập bảng lương quản lý

- **Điều kiện kích hoạt:** Owner bấm "Lương quản lý" trong nhóm "Nhân sự", hoặc "Sửa bảng lương" trong
  màn cấu hình duyệt giá.
- **Mô tả chức năng:** Ghi nhận mức lương của từng quản lý vận hành, để phân bổ vào các toà nhà họ
  phụ trách và đưa vào công thức tính giá (3.2.27).
- **Bố cục màn hình:**

  `[Ảnh: trang lương quản lý — ô nhập lương từng người, tóm tắt quỹ lương]`

- **Chi tiết chức năng:**
  - Mỗi dòng hiển thị quản lý, các khu vực phụ trách ("Phụ trách", "đang coi") và ô nhập lương; người
    chưa có khu vực hiện "Chưa gán", ô lương bỏ trống hiện "Chưa nhập".
  - Thẻ tóm tắt: "Tổng quỹ lương", "Số nhà gánh lương" ("{n} nhà"), "Bình quân mỗi nhà".
  - "Lưu bảng lương" lưu lại; nút hiển thị "Đang lưu…" trong lúc xử lý.
  - Thành công: "Đã lưu bảng lương lên máy chủ." kèm nhãn "Đã đồng bộ máy chủ".
  - Thành công một phần: "Đã lưu trên máy này — máy chủ chưa có nơi lưu bảng lương.", nhãn "Chỉ lưu
    trên máy này".

---

## 3.2.32 `<Owner>` Phân công khu vực cho quản lý

### 3.2.32.1 `<Owner>` Xem bảng phân công khu vực

- **Điều kiện kích hoạt:** Owner bấm "Phân công khu vực" trong nhóm "Nhân sự".
- **Mô tả chức năng:** "Khu vực & Quản lý — Mỗi quận/huyện do **một** quản lý vận hành phụ trách —
  gán cho khu vực là gán cho mọi nhà bên trong." Owner là vai quyết định việc này.
- **Bố cục màn hình:**

  `[Ảnh: "Khu vực & Quản lý" (giao diện Owner) — thẻ KPI, các dòng khu vực kèm thao tác]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "Tổng khu vực" và "{n}/{m} Đều đã có quản lý".
  - Bộ lọc: tìm theo tên quận/huyện hoặc tên quản lý, "Tất cả quản lý", sắp xếp "Việc cần xử lý
    trước"; mỗi dòng hiển thị quận/huyện, nhãn "Đã gán", quy mô ("{n} nhà · {m} đơn vị") và quản lý
    đang phụ trách.
  - Khu vực có tài khoản quản lý bị vô hiệu hoá sẽ được cảnh báo "Tài khoản quản lý của khu vực này
    đang không hoạt động".

### 3.2.32.2 `<Owner>` Gán, đổi hoặc gỡ quản lý của một khu vực

- **Điều kiện kích hoạt:** Owner bấm "Đổi quản lý" trên một dòng khu vực, hoặc "Gỡ" để khu vực trở về
  trạng thái chưa gán.
- **Mô tả chức năng:** Giao toàn bộ toà nhà của một quận/huyện cho một quản lý, chỉ bằng một thao
  tác.
- **Bố cục màn hình:**

  `[Ảnh: hộp thoại đổi quản lý kèm phần tóm tắt phạm vi ảnh hưởng]`

- **Chi tiết chức năng:**
  - Trước khi xác nhận, hộp thoại nêu rõ phạm vi ảnh hưởng: bao nhiêu toà nhà ("{n} nhà") và bao
    nhiêu hợp đồng đang chạy ("{n} hợp đồng") sẽ đổi người phụ trách.
  - Thành công: khu vực hiển thị quản lý mới và mọi toà nhà bên trong đi theo; kết quả phân công này
    chính là "quản lý vận hành của toà nhà" mà phần còn lại của hệ thống đọc — bao gồm cả form đón
    khách (3.2.7.2), vốn từ chối tạo hợp đồng cho toà nhà chưa có quản lý.
  - Thất bại: giữ nguyên phân công cũ và hiển thị lỗi từ máy chủ; "Hủy" đóng hộp thoại mà không đổi
    gì.

---

## 3.2.33 `<Owner>` Quản lý dòng tiền

### 3.2.33.1 `<Owner>` Đối soát dòng tiền vào và ra

- **Điều kiện kích hoạt:** Owner bấm "Tổng quan" trong nhóm "Tài chính".
- **Mô tả chức năng:** "Quản lý Dòng tiền — Đối soát dòng tiền vào/ra & lợi nhuận ròng các nhà đã
  duyệt giá."
- **Bố cục màn hình:**

  `[Ảnh: "Quản lý Dòng tiền" — thẻ KPI, biểu đồ theo tháng, cơ cấu chi, bảng đối soát từng nhà]`

- **Chi tiết chức năng:**
  - Kỳ xem được chọn ở đầu trang (ô chọn tháng cùng ba mức "Tháng" / "Quý" / "Năm"), kèm "Xuất Excel"
    và nút tải lại.
  - Thẻ KPI kèm mức thay đổi so với kỳ trước: "DÒNG TIỀN VÀO" ("Còn {tiền} chưa thu ({n} HĐ)"),
    "DÒNG TIỀN RA" ("Thuê căn + chi phí khác"), "LỢI NHUẬN RÒNG" ("Biên LN {x}% · ROI {y}%") và
    "TỶ LỆ LẤP ĐẦY TB" ("{n} nhà đã duyệt giá").
  - "Dòng tiền vào / ra & lợi nhuận ròng — theo tháng" vẽ ba chuỗi số liệu qua các kỳ gần nhất;
    "Cơ cấu dòng tiền ra" tách chi phí theo hạng mục.
  - "Đối soát tự động theo từng nhà đã duyệt giá" — "So khớp dòng tiền vào (thu phòng, dịch vụ) với
    dòng tiền ra (thuê căn + chi phí) → lợi nhuận ròng, lấp đầy & ROI" — tìm kiếm theo tên nhà hoặc
    quản lý, lọc theo trạng thái quản lý và loại hình ("Tất cả", "Nguyên căn", "Theo phòng"), sắp xếp
    theo "Lợi nhuận cao → thấp".

---

## 3.2.34 `<Owner>` Quản lý hoá đơn

### 3.2.34.1 `<Owner>` Xem danh sách hoá đơn

- **Điều kiện kích hoạt:** Owner bấm "Hoá đơn" trong nhóm "Tài chính". Màn này chỉ dành cho Owner,
  Admin không mở được.
- **Mô tả chức năng:** Mọi hoá đơn đã phát hành cho khách thuê trong danh mục và tình trạng thu tiền.
- **Bố cục màn hình:**

  `[Ảnh: hoá đơn phía Owner — thẻ KPI, bộ lọc, bảng hoá đơn]`

- **Chi tiết chức năng:**
  - Bộ lọc: loại hoá đơn ("Mọi loại hoá đơn" / "Tiền phòng" / "Tiền điện" / "Tiền nước" / "Dịch vụ" /
    "Phí bảo trì" / "Khác"), bất động sản ("Tất cả bất động sản"), trạng thái ("Chờ thanh toán",
    "Đã thanh toán", "Quá hạn", "Đã huỷ") và đối soát ("Chờ đối soát", "Đã xác nhận", "Bị từ chối").
  - Sắp xếp: "Mới phát hành nhất", "Hạn thu gần nhất", "Số tiền cao → thấp", "Số tiền thấp → cao",
    "Cũ nhất". "Xuất Excel" xuất danh sách đang lọc.
  - Thất bại: trang có nút "Tải lại dữ liệu".

---

## 3.2.35 `<Owner>` Quản lý công nợ

### 3.2.35.1 `<Owner>` Xem công nợ theo tuổi nợ

- **Điều kiện kích hoạt:** Owner bấm "Công nợ" trong nhóm "Tài chính". Chỉ dành cho Owner.
- **Mô tả chức năng:** Hiển thị số tiền khách đang nợ, sắp theo độ dài thời gian nợ — cơ sở để quyết
  định gọi ai trước.
- **Bố cục màn hình:**

  `[Ảnh: công nợ — các nhóm tuổi nợ, bảng khách nợ]`

- **Chi tiết chức năng:**
  - Nhóm tuổi nợ: "Chưa tới hạn", "Quá hạn 1–30 ngày", "Quá hạn 31–60 ngày", "Quá hạn 61–90 ngày",
    "Quá hạn > 90 ngày", hoặc "Mọi tuổi nợ"; trạng thái "Chưa thu", "Quá hạn", "Đã thu".
  - Sắp xếp: "Mới nhất (hạn thu gần đây)", "Quá hạn lâu nhất", "Số tiền cao → thấp", "Số tiền thấp →
    cao", "Cũ nhất"; danh sách lọc được theo từng bất động sản.

---

## 3.2.36 `<Owner>` Sổ cọc

### 3.2.36.1 `<Owner>` Theo dõi tiền cọc

- **Điều kiện kích hoạt:** Owner bấm "Sổ cọc" trong nhóm "Tài chính". Chỉ dành cho Owner.
- **Mô tả chức năng:** "Tiền cọc đang giữ của khách thuê — khoản phải hoàn khi kết thúc hợp đồng
  (không phải doanh thu)."
- **Bố cục màn hình:**

  `[Ảnh: "Sổ cọc" — thẻ KPI, chip trạng thái, bảng tiền cọc]`

- **Chi tiết chức năng:**
  - Thẻ KPI: "TỔNG CỌC ĐANG GIỮ" ("Khoản phải trả lại khách"), "SỐ KHOẢN ĐANG GIỮ" ("trên tổng {n}
    khoản trong sổ"), "ĐÃ HOÀN" và "CẦN TẤT TOÁN" ("HĐ hết hạn nhưng còn giữ cọc").
  - "Danh sách cọc theo hợp đồng" nêu tổng ("{n} khoản · tổng {tiền}") và lọc bằng các chip trạng
    thái kèm số lượng: "Tất cả", "Chưa thu", "Đang giữ", "Khách báo chưa nhận", "Chờ khách xác nhận",
    "Đã hoàn", "Tịch thu". Ô tìm kiếm khớp khách thuê, mã hợp đồng, bất động sản, phòng hoặc SĐT; sắp
    xếp mặc định "Mới nhất (giữ cọc gần đây)".
  - Bảng gồm "KHÁCH THUÊ" (kèm mã hợp đồng), "BẤT ĐỘNG SẢN / PHÒNG", "TIỀN CỌC", "GIỮ TỪ", "KẾT THÚC
    HĐ", "TRẠNG THÁI" và thao tác "Đánh dấu đã hoàn"; "Xuất Excel" xuất toàn bộ sổ.
  - Mỗi dòng tự giải thích trạng thái của nó, ví dụ: "Đã hoàn cọc và khách đã xác nhận nhận đủ.",
    "Đã ghi nhận chuyển cọc, đang chờ khách xác nhận đã nhận đủ.", "Hợp đồng đã hết hạn nhưng chưa
    thanh lý — chờ quản lý kiểm tra phòng và quyết toán xong.", "Khách chưa gửi yêu cầu trả phòng —
    cọc đang bảo đảm cho hợp đồng đang chạy."
  - **Quy tắc nghiệp vụ:** tiền cọc không bao giờ đem trừ vào các khoản khách còn nợ. Chưa thu đủ thì
    chưa hoàn cọc được — dòng dữ liệu ghi rõ "Khách còn khoản chưa thanh toán {tiền}. Thu đủ rồi mới
    hoàn cọc được."
  - Nếu khách không đồng ý với số tiền được hoàn, vụ việc được chuyển lên Admin phân xử (3.2.17).

---

## 3.2.37 `<Owner>` Báo cáo & phân tích

### 3.2.37.1 `<Owner>` Xem báo cáo tài chính và hiệu suất vận hành

- **Điều kiện kích hoạt:** Owner bấm "Báo cáo" trong nhóm "Tài chính".
- **Mô tả chức năng:** "Hiệu suất vận hành và tài chính Hoàng Bình Land" qua nhiều kỳ liên tiếp.
- **Bố cục màn hình:**

  `[Ảnh: "Báo cáo & Phân tích" — thẻ KPI, biểu đồ nhiều kỳ, bảng báo cáo tài chính]`

- **Chi tiết chức năng:**
  - Khoảng xem chuyển giữa "6 kỳ" và "12 kỳ", kèm nút tải lại và "Xuất Excel".
  - Thẻ KPI: "DOANH THU {n} KỲ", "CHI PHÍ {n} KỲ", "LỢI NHUẬN RÒNG" ("Biên lợi nhuận {x}%") và
    "TỶ LỆ LẤP ĐẦY HIỆN TẠI" ("{n}/{m} phòng đang thuê").
  - "Doanh thu · Chi phí · Lợi nhuận theo kỳ" vẽ ba chuỗi số liệu; "Báo cáo tài chính — {n} kỳ gần
    đây" lập bảng "KỲ", "DOANH THU", "CHI PHÍ", "LỢI NHUẬN" và "BIÊN LỢI NHUẬN" (kỳ chưa phát sinh
    doanh thu ghi "chưa có doanh thu").
  - Bất động sản xếp hạng được theo "Doanh thu cao → thấp", "Lợi nhuận cao → thấp", "Lấp đầy cao
    nhất", "Lấp đầy thấp nhất", "Tên nhà A → Z"; "Hiệu suất quản lý" liệt kê từng quản lý kèm "SĐT",
    "Số nhà phụ trách" và "HĐ khách đang hiệu lực".

---

## 3.2.38 `<Owner>` Trung tâm thông báo

### 3.2.38.1 `<Owner>` Đọc và lọc thông báo

- **Điều kiện kích hoạt:** Owner bấm "Thông báo" trong nhóm "Hệ thống", hoặc chuông trên thanh đầu
  trang. Mục menu hiển thị số thông báo chưa đọc.
- **Mô tả chức năng:** "Trung tâm Thông báo — {n} thông báo chưa đọc": các sự kiện chủ nhà không được
  bỏ lỡ, lọc theo chủ đề.
- **Bố cục màn hình:**

  `[Ảnh: "Trung tâm Thông báo" — lọc theo loại, lọc theo trạng thái, danh sách thông báo]`

- **Chi tiết chức năng:**
  - "LOẠI THÔNG BÁO" lọc theo nhóm kèm số lượng, ví dụ "Tất cả (50)", "Chờ phê duyệt (11)" và
    "Cảnh báo phòng trống (39)"; các nhóm khác hệ thống dùng gồm "Hợp đồng hết hạn", "Hóa đơn chưa
    thu" và "Bảo trì trễ hạn".
  - "TRẠNG THÁI" lọc theo "Tất cả", "Chưa đọc", "Đã đọc".
  - Mỗi thông báo hiển thị chủ đề, nhóm, mức ưu tiên khi cần ("Cao"), nội dung và thời điểm — ví dụ
    "Căn đã trống, giá quay về {tiền} — kiểm tra lại giá trước khi đăng." — kèm nút đánh dấu đã đọc
    và nút xoá. "Đánh dấu tất cả đã đọc" xoá toàn bộ nhãn chưa đọc.
  - Thành công: bấm vào một thông báo sẽ mở đúng màn hình xử lý được việc đó — ví dụ thông báo duyệt
    giá mở 3.2.25.
