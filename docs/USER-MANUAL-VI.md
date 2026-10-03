# VII. Gói bàn giao & Hướng dẫn sử dụng

## 1. Gói bàn giao

| STT | Hạng mục bàn giao | Mô tả |
|---|---|---|
| 1 | Kế hoạch & theo dõi tiến độ | Bảng theo dõi công việc của cả dự án. Link: `<điền link>` |
| 2 | Mã nguồn | Monorepo frontend (web + mobile): https://github.com/pinkyu2205/SEP — Backend: `<điền link repo BE>` |
| 3 | Script cơ sở dữ liệu | `<điền link>` |
| 4 | Tài liệu báo cáo cuối kỳ | `<điền link>` |
| 5 | Test case & báo cáo kiểm thử | `<điền link>` |
| 6 | Bộ file Excel mẫu | File mẫu khởi tạo nhà, cấu hình khai thác và đón khách, tải ngay trong ứng dụng bằng "Tải template" / "Tải file mẫu" |
| 7 | Slide bảo vệ | `<điền link>` |

*Bảng 1 - Gói bàn giao*

## 2. Hướng dẫn cài đặt

### 2.1 Yêu cầu hệ thống

#### 2.1.1 Yêu cầu phần cứng

##### 2.1.1.1 Ứng dụng web

| Máy tính | Tối thiểu | Khuyến nghị |
|---|---|---|
| Kết nối Internet | Wi-Fi (4 Mbps) | Cáp, Wi-Fi (8 Mbps) |
| Hệ điều hành | Windows 10 | Windows 11 |
| Bộ xử lý | Intel® Core i3 1.4GHz | Intel® Core i5 2.50GHz |
| Bộ nhớ | 4GB RAM trở lên | 8GB RAM trở lên |
| Độ phân giải màn hình | 1366 × 768 | 1920 × 1080 |
| Trình duyệt | Chrome (v120 trở lên) | Chrome bản ổn định mới nhất |

*Bảng 2 - Yêu cầu phần cứng - Ứng dụng web*

##### 2.1.1.2 Ứng dụng di động

| Hạng mục | Yêu cầu |
|---|---|
| Hệ điều hành | Android 8.1 trở lên / iOS 13 trở lên |
| Bộ nhớ trống tối thiểu | 256 MB |
| RAM | Tối thiểu 2 GB |
| Camera | Bắt buộc, dùng để chụp ảnh đồng hồ, ảnh hiện trạng phòng và quét QR thiết bị |

*Bảng 3 - Yêu cầu phần cứng - Ứng dụng di động*

#### 2.1.2 Yêu cầu phần mềm

| Phần mềm | Tên / Phiên bản | Mô tả |
|---|---|---|
| Hệ điều hành | Windows 10 / 11, macOS 12+ | Nền tảng phát triển và vận hành |
| Trình duyệt | Chrome v120 trở lên | Dùng cho ứng dụng web |
| Node.js | v20 LTS trở lên | Build và chạy ứng dụng web |
| Java | JDK 17 | Chạy dịch vụ backend |
| Docker | v24 trở lên | Tuỳ chọn, chạy backend dạng container |
| Hệ điều hành Android | Android v8.1 trở lên | Dùng cho ứng dụng di động |
| Expo Go | Mới nhất | Chạy ứng dụng di động ở môi trường phát triển |

*Bảng 4 - Yêu cầu phần mềm*

### 2.2 Hướng dẫn cài đặt

#### 2.2.1 Backend

1. Cài JDK 17 và máy chủ cơ sở dữ liệu.
2. Clone repository backend và cấu hình file môi trường (kết nối cơ sở dữ liệu, JWT secret, thông tin gửi mail / SMS, tài khoản Cloudinary).
3. Chạy dịch vụ. Mặc định lắng nghe tại `http://localhost:8080`.
4. Dự án khởi động tại `http://localhost:8080/swagger-ui/index.html`.

#### 2.2.2 Ứng dụng web

1. Cài Node.js v20 LTS trở lên.
2. Clone repository và cài thư viện:

   ```bash
   git clone https://github.com/pinkyu2205/SEP.git
   cd SEP/frontend-web
   npm install
   ```

3. Tạo file `.env` với các khoá sau:

   | Khoá | Ý nghĩa |
   |---|---|
   | `VITE_API_URL` | Địa chỉ backend. Để trống nếu dùng backend chạy máy local qua proxy của Vite (`http://localhost:8080`), hoặc điền vào nếu trỏ tới máy chủ đã triển khai. |
   | `VITE_CLOUDINARY_CLOUD_NAME` | Tài khoản Cloudinary lưu ảnh tải lên |
   | `VITE_CLOUDINARY_UPLOAD_PRESET` | Upload preset của Cloudinary |
   | `VITE_GOONG_MAPS_KEY` | Khoá Goong Maps cho gợi ý địa chỉ và bản đồ bất động sản |

4. Chạy `npm run dev` cho môi trường phát triển, hoặc `npm run build` và `npm run preview` cho bản phát hành.
5. Dự án khởi động tại `http://localhost:5173`.

#### 2.2.3 Ứng dụng di động

1. Cài Node.js v20 LTS và Expo CLI.
2. Cài thư viện và khởi chạy máy chủ Expo:

   ```bash
   cd SEP/mobile-app
   npm install
   npm start
   ```

3. Cấu hình địa chỉ backend trong file môi trường của mobile, sau đó quét mã QR bằng Expo Go hoặc cài file APK đã build.

## 3. Hướng dẫn sử dụng

### 3.1 Tổng quan

Hệ thống Quản lý Cho thuê lại (SLMS-2026) có 5 luồng nghiệp vụ chính:

- Luồng tiếp nhận và định giá bất động sản
- Luồng quản lý khách thuê và hợp đồng
- Luồng hoá đơn và thanh toán hằng tháng
- Luồng quản lý bảo trì và thiết bị
- Luồng dòng tiền và báo cáo tài chính

Mỗi luồng được thực hiện trên hai ứng dụng. **Ứng dụng web** dành cho Admin và Host, **ứng dụng di động** dành cho Quản lý vận hành và Khách thuê. Vì vậy các mục dưới đây được tách thành "Web" và "Mobile" đúng theo cách công việc được phân chia.

| Vai trò | Ứng dụng | Trách nhiệm |
|---|---|---|
| Admin | Web | Khởi tạo nhà, cấu hình khai thác, đón khách, phát hành hoá đơn điện nước, phân xử khiếu nại |
| Host | Web | Duyệt giá, phân công khu vực, theo dõi tài chính |
| Quản lý vận hành | Mobile | Tiếp quản toà nhà, đón khách, chốt chỉ số đồng hồ, gửi hoá đơn phòng, bảo trì, trả phòng |
| Khách thuê | Mobile | Ký hợp đồng, thanh toán hoá đơn, báo hỏng, yêu cầu trả phòng |
| Khách vãng lai | Web (công khai) | Xem tin cho thuê và gọi hotline |

### 3.2 Luồng tiếp nhận và định giá bất động sản

#### 3.2.1 Web — Khởi tạo nhà

##### 3.2.1.1 `<Admin>` Đăng nhập

Để đăng nhập vào hệ thống, người dùng nhập tên đăng nhập và mật khẩu rồi bấm "Đăng nhập".

[Ảnh: trang đăng nhập]

Đăng nhập thành công, Admin vào cổng quản trị với quy trình tiếp nhận nhà nằm trên sidebar.

##### 3.2.1.2 `<Admin>` Mở màn khởi tạo nhà

Admin bấm "Khởi tạo nhà" để xem toàn bộ toà nhà đã tiếp nhận từ chủ nhà, kèm phần còn thiếu của từng hồ sơ.

[Ảnh: luồng khởi tạo nhà/1.jpg]

##### 3.2.1.3 `<Admin>` Mở hộp thoại nhập Excel

Admin bấm "Nhập từ Excel" để nhập danh sách nhà. Nhà chỉ được tạo từ file Excel, và file mẫu tải về bằng nút "Tải template".

[Ảnh: luồng khởi tạo nhà/2.jpg]

##### 3.2.1.4 `<Admin>` Kiểm tra file

Admin chọn file Excel rồi bấm "Kiểm tra file". Bước này chỉ kiểm tra file, chưa ghi gì vào hệ thống.

[Ảnh: luồng khởi tạo nhà/3.jpg]

File hợp lệ thì hệ thống báo số căn nhà và số thiết bị bàn giao có trong file. Nếu file có quận/huyện chưa tồn tại, Admin bấm "Tạo tự động" để hệ thống tạo rồi kiểm tra file lại.

[Ảnh: luồng khởi tạo nhà/4.jpg]

##### 3.2.1.5 `<Admin>` Nhập nhà vào hệ thống

Admin bấm "Nhập {n} căn" và xác nhận bằng "Nhập ngay" để ghi dữ liệu vào hệ thống.

[Ảnh: luồng khởi tạo nhà/5.jpg]

Hệ thống tạo các toà nhà và liệt kê từng căn kèm mã hợp đồng, trạng thái "Đã khởi tạo" và đường dẫn "Cấu hình khai thác" sang bước tiếp theo. Căn nào nhập nhầm thì xoá bằng biểu tượng xoá ngay trên dòng đó.

[Ảnh: luồng khởi tạo nhà/6.jpg]

##### 3.2.1.6 `<Admin>` Hoàn tất hồ sơ toà nhà

Admin mở từng toà nhà để bổ sung hợp đồng với chủ nhà, mã khách hàng điện, số danh bộ nước và thiết bị chủ nhà bàn giao, rồi bấm "Xác nhận & Quay về danh sách" để hoàn tất khởi tạo. Hai mã điện nước sau đó không sửa được trên web, nhập sai thì phải nhập lại file khởi tạo.

[Ảnh: hồ sơ toà nhà]

#### 3.2.2 Web — Cấu hình khai thác

##### 3.2.2.1 `<Admin>` Mở màn cấu hình khai thác

Admin bấm "Cấu hình khai thác" để theo dõi mọi toà nhà đã nhập trên đường đưa vào kinh doanh.

[Ảnh: luồng cấu hình khai thác/1.jpg]

##### 3.2.2.2 `<Admin>` Mở hộp thoại nhập cải tạo

Admin bấm "Nhập cải tạo từ Excel". File chứa cách khai thác, danh sách phòng, hợp đồng cải tạo và thiết bị mua mới, khớp với từng toà nhà theo mã hợp đồng thuê.

[Ảnh: luồng cấu hình khai thác/2.jpg]

##### 3.2.2.3 `<Admin>` Kiểm tra file

Admin chọn file rồi bấm "Kiểm tra file".

[Ảnh: luồng cấu hình khai thác/3.jpg]

Hệ thống báo số căn, số dòng cải tạo, số thiết bị mua mới và số dòng bị bỏ qua. Căn nào file khai báo là không cần cải tạo thì bị bỏ qua và giữ nguyên trạng thái cũ.

[Ảnh: luồng cấu hình khai thác/4.jpg]

##### 3.2.2.4 `<Admin>` Nhập và gửi Host

Admin bấm "Nhập & gửi Host" rồi xác nhận. Nhập xong cũng chính là đã gửi, nên không có nút gửi riêng.

[Ảnh: luồng cấu hình khai thác/5.jpg]

Mọi căn vừa nhập chuyển sang "Đã gửi Host" và xuất hiện trong hàng chờ duyệt giá của Host.

[Ảnh: luồng cấu hình khai thác/6.jpg]

##### 3.2.2.5 `<Admin>` Xác nhận hoàn thành cải tạo

Thi công xong, Admin mở toà nhà và bấm "Xác nhận hoàn thành cải tạo". Có bước này Host mới duyệt giá được.

[Ảnh: nút xác nhận hoàn thành cải tạo]

#### 3.2.3 Web — Cấu hình duyệt giá

##### 3.2.3.1 `<Host>` Đặt mục tiêu lợi nhuận và chi phí vận hành

Host bấm "Cấu hình giá" và nhập mục tiêu lợi nhuận cùng chi phí vận hành mỗi tháng. Các con số này chi phối mọi lần duyệt giá, nên phải lưu trước khi duyệt căn đầu tiên.

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/1.jpg]

##### 3.2.3.2 `<Host>` Đặt mức tăng giá thuê hằng năm

Host đặt mức tăng mỗi năm, thời gian ân hạn cho khách mới và thời điểm báo giá năm sau, rồi xem khối mô phỏng ở cuối mục.

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/3.jpg]

##### 3.2.3.3 `<Host>` Đặt các biên dự phòng rủi ro

Host đặt biên dự phòng trống phòng và cửa sổ bàn giao bị trừ ở cuối hợp đồng chủ nhà, đối chiếu phần tóm tắt rồi bấm "Lưu cấu hình".

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/4.jpg]

##### 3.2.3.4 `<Host>` Nhập bảng lương quản lý

Host bấm "Lương quản lý", nhập lương của từng quản lý vận hành rồi bấm "Lưu bảng lương". Mỗi căn nhà gánh phần lương chia cho số nhà mà người đó đang phụ trách.

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/màn cấu hình lương cho manager.jpg]

#### 3.2.4 Web — Duyệt giá nhà nguyên căn

##### 3.2.4.1 `<Host>` Mở hàng chờ duyệt giá

Host bấm "Xem & duyệt" ở banner đầu màn "Bất động sản".

[Ảnh: luồng host duyệt nhà/duyệt nhà nguyên căn/1.jpg]

Hàng chờ tách riêng nhà mới cần duyệt giá lần đầu và nhà vừa cải tạo bổ sung cần duyệt lại giá. Host bấm "Duyệt" để mở một hồ sơ.

[Ảnh: luồng host duyệt nhà/duyệt nhà nguyên căn/2.jpg]

##### 3.2.4.2 `<Host>` Xem tiền đã bỏ ra cho toà nhà

Host xem ba khối chi phí: tiền thuê trả chủ nhà, chi phí cải tạo và thiết bị mua mới. Thiết bị chủ nhà bàn giao được ghi nhận riêng và không tính vào tiền bỏ ra.

[Ảnh: luồng host duyệt nhà/duyệt nhà nguyên căn/3.jpg]

##### 3.2.4.3 `<Host>` Xem từng khoản vốn và lịch khấu hao

Host cuộn xuống khối "TỪNG KHOẢN VỐN VÀ LỊCH KHẤU HAO" để xem mỗi khoản thu hồi được bao nhiêu một tháng và phòng nào đang gánh khoản đó.

[Ảnh: luồng host duyệt nhà/duyệt nhà nguyên căn/4.jpg]

##### 3.2.4.4 `<Host>` Đối chiếu mục tiêu và giá hệ thống tính ra

Host đối chiếu mục tiêu lợi nhuận lấy từ "Cấu hình giá" và đọc các bước tính dẫn tới mức giá thuê phải đạt mỗi tháng. Muốn đổi mục tiêu thì bấm "Sửa cấu hình duyệt giá", sau đó bấm "Tính lại theo cấu hình".

[Ảnh: luồng host duyệt nhà/duyệt nhà nguyên căn/5.jpg]

##### 3.2.4.5 `<Host>` Chốt giá thuê

Host bấm "Lấy giá đề xuất", hoặc "↑ Làm tròn 100k", hoặc tự gõ con số khác. Trang hiển thị tiếp phần lãi của cả kỳ sau khi đã trừ chi phí vận hành và dự phòng sửa chữa.

[Ảnh: luồng host duyệt nhà/duyệt nhà nguyên căn/6.jpg]

##### 3.2.4.6 `<Host>` Kích hoạt cho thuê

Host bấm "Xác nhận & Kích hoạt", đọc hộp thoại xác nhận cuối rồi bấm "Kích hoạt cho thuê". Các chỗ trống lên website công khai và quản lý vận hành bắt đầu tiếp quản. Giá chỉ sửa được khi đơn vị còn trống, nên phải chỉnh trước khi khách ký hợp đồng.

[Ảnh: luồng host duyệt nhà/duyệt nhà nguyên căn/7.jpg]

#### 3.2.5 Web — Duyệt giá nhà chia phòng

##### 3.2.5.1 `<Host>` Xem tiền đã bỏ ra cho toà nhà

Host mở hồ sơ theo cách tương tự và xem ba khối chi phí như trên. Phần mô tả ghi rõ toà nhà được chia thành mấy phòng.

[Ảnh: luồng host duyệt nhà/duyệt nhà theo phòng/3.jpg]

##### 3.2.5.2 `<Host>` Chốt giá thuê từng phòng

Host điền cả cột giá bằng "Lấy giá đề xuất cho tất cả" và "Làm tròn lên 100k tất cả", hoặc gõ giá riêng cho từng phòng, rồi đối chiếu tổng với dòng mục tiêu ở cuối bảng. Vốn được chia đều cho các phòng chứ không chia theo diện tích, nên hai phòng khác diện tích có cùng giá đề xuất.

[Ảnh: luồng host duyệt nhà/duyệt nhà theo phòng/6.jpg]

#### 3.2.6 Web — Cải tạo bổ sung và duyệt lại giá

##### 3.2.6.1 `<Admin>` Mở toà nhà

Admin mở một toà nhà đang ở trạng thái "Đang kinh doanh" từ màn cấu hình khai thác.

[Ảnh: luồng cải tạo bổ xung/1.jpg]

##### 3.2.6.2 `<Admin>` Mở đợt cải tạo mới

Admin bấm tab "Cải tạo lại". Toà nhà chuyển sang "Đang cải tạo" và chờ file cải tạo bổ sung.

[Ảnh: luồng cải tạo bổ xung/3.jpg]

##### 3.2.6.3 `<Admin>` Nhập file cải tạo bổ sung

Admin chọn file rồi bấm "Kiểm tra file". File chỉ nhận đúng mã hợp đồng thuê của toà nhà này, và mỗi dòng phải ghi rõ THÊM_MỚI nếu là nâng cấp hoặc THAY_THẾ nếu thay đồ tương đương.

[Ảnh: luồng cải tạo bổ xung/5.jpg]

Admin bấm "Nhập cải tạo bổ sung". Hệ thống nhập đợt cải tạo và tự động gửi Host duyệt lại giá, sau đó Admin bấm "Xác nhận hoàn thành cải tạo" khi thi công xong.

[Ảnh: luồng cải tạo bổ xung/7.jpg]

##### 3.2.6.4 `<Host>` Xem đợt cải tạo vừa làm

Host mở hồ sơ ở cột bên phải của hàng chờ và đọc phần chi phí được tách thành khoản tính vào giá và khoản công ty tự chịu. Khách đang ở giữ nguyên giá trong hợp đồng.

[Ảnh: luồng cải tạo bổ xung/9.jpg]

Host có thể mở bảng khấu hao để thấy đợt mới được cộng thêm vào đợt cũ.

[Ảnh: luồng cải tạo bổ xung/11.jpg]

##### 3.2.6.5 `<Host>` Duyệt giá niêm yết mới

Host bấm "Duyệt giá mới" rồi xác nhận. Hộp thoại ghi rõ giá cũ, giá mới và số phòng được áp dụng ngay.

[Ảnh: luồng cải tạo bổ xung/13.jpg]

#### 3.2.7 Mobile — Tiếp quản toà nhà

##### 3.2.7.1 `<Quản lý>` Đăng nhập

Để đăng nhập vào hệ thống, Quản lý nhập số điện thoại hoặc tài khoản cùng mật khẩu rồi bấm "Đăng nhập". Tài khoản chưa kích hoạt sẽ được mời "Kích hoạt ngay".

[Ảnh: mobile — màn đăng nhập]

##### 3.2.7.2 `<Quản lý>` Mở danh sách toà nhà

Đăng nhập thành công, Quản lý bấm "Toà nhà" để xem các nhà thuộc khu vực mình phụ trách, lọc theo "Tất cả", "Còn phòng", "Sắp hết hạn", "Bảo trì" hoặc "Chưa mở".

[Ảnh: mobile — danh sách toà nhà của quản lý]

##### 3.2.7.3 `<Quản lý>` Xem danh sách phòng và đổi trạng thái phòng

Quản lý bấm vào một toà nhà để xem các phòng với trạng thái "Trống", "Đang thuê", "Đang bảo trì", "Ngưng khai thác", và đổi trạng thái bằng "Đưa phòng vào bảo trì (sau khi khách đồng ý)", "Bảo trì hoàn tất — phòng sẵn sàng cho thuê" hoặc "Tắt khai thác hoàn toàn".

[Ảnh: mobile — danh sách phòng của một toà nhà]

##### 3.2.7.4 `<Quản lý>` Xem việc cần làm trong ngày

Quản lý bấm "My Task — hôm nay" ở trang chủ để xem việc tới hạn, ví dụ "Chốt chỉ số điện — hạn hôm nay" hoặc "Phòng chưa chụp công tơ", rồi bấm "Xử lý →" để đi thẳng tới màn xử lý việc đó.

[Ảnh: mobile — trang chủ quản lý với My Task]

### 3.3 Luồng quản lý khách thuê và hợp đồng

#### 3.3.1 Web — Chuẩn bị đội vận hành

##### 3.3.1.1 `<Admin>` Tạo tài khoản quản lý vận hành

Admin bấm "Người dùng & phân quyền", bấm "Tạo tài khoản" rồi nhập họ tên, tên đăng nhập, số điện thoại và mật khẩu.

[Ảnh: admin/màn người dùng & phân quyền.jpg]

##### 3.3.1.2 `<Host>` Phân công quản lý cho khu vực

Host bấm "Phân công khu vực", bấm "Đổi quản lý" ở một quận/huyện rồi chọn người phụ trách. Mỗi quận/huyện có đúng một quản lý, và gán cho khu vực là gán cho mọi nhà bên trong. Nhà chưa có quản lý thì không đón khách được.

[Ảnh: host/màn phân công khu vực cho Manager quản lý.jpg]

##### 3.3.1.3 `<Host>` Xem khối lượng việc của từng quản lý

Host bấm "Quản lý vận hành" để xem mỗi người đang phụ trách mấy khu vực, mấy toà nhà, bao nhiêu khách thuê và còn bao nhiêu phiếu bảo trì đang mở.

[Ảnh: host/màn quản lý manager hệ thống.jpg]

##### 3.3.1.4 `<Admin>` Quản lý danh mục khu vực

Admin bấm "Danh mục khu vực" để thêm hoặc sửa tỉnh/thành và quận/huyện, vì danh mục này là nền cho việc import bất động sản và phân công khu vực.

[Ảnh: admin/màn khu vực bất động sản.jpg]

#### 3.3.2 Web — Tạo từng hồ sơ đón khách

##### 3.3.2.1 `<Admin>` Mở màn hồ sơ đón khách

Admin bấm "Hồ sơ đón khách" để xem các hợp đồng đang chờ quản lý tới đón khách.

[Ảnh: luồng đón khách/1.jpg]

##### 3.3.2.2 `<Admin>` Nhập thông tin hợp đồng

Admin bấm "Tạo hồ sơ", chọn bất động sản và phòng, nhập thông tin định danh của khách, rồi kiểm tra giá thuê, tiền cọc và thời hạn thuê. Danh sách chỉ hiện nhà còn chỗ, và quản lý phụ trách được gán tự động theo khu vực.

[Ảnh: luồng đón khách/nhập tay.jpg]

##### 3.3.2.3 `<Admin>` Xem lại và lưu

Admin bấm "Xem lại & Lưu", đọc lại toàn bộ thông tin rồi bấm "Xác nhận & Lưu". Hệ thống tạo hợp đồng nháp, sinh file hợp đồng và gửi thông báo cho quản lý đi đón khách.

[Ảnh: luồng đón khách/nhập tay1.jpg]

#### 3.3.3 Web — Nhập hồ sơ đón khách từ Excel

##### 3.3.3.1 `<Admin>` Mở hộp thoại import

Admin bấm "Import Excel". Mỗi dòng là một hợp đồng, và toà nhà phải đang hoạt động, đã có quản lý phụ trách.

[Ảnh: luồng đón khách/2.jpg]

##### 3.3.3.2 `<Admin>` Kiểm tra file

Admin chọn file rồi bấm "Kiểm tra file". Hệ thống kiểm tra sức chứa của từng nhà và chỉ ra những dòng không xếp được, trước khi tạo bất cứ hợp đồng nào.

[Ảnh: luồng đón khách/3.jpg]

##### 3.3.3.3 `<Admin>` Import hợp đồng

Admin bấm "Import {n} hợp đồng" rồi xác nhận.

[Ảnh: luồng đón khách/4.jpg]

Hệ thống tạo các hợp đồng, sau đó sinh file hợp đồng cho từng cái và báo kết quả theo từng mã hợp đồng.

[Ảnh: luồng đón khách/5.jpg]

##### 3.3.3.4 `<Admin>` Theo dõi hồ sơ

Admin có thể sửa hồ sơ, tải file hợp đồng hoặc huỷ hồ sơ từ các nút thao tác trên dòng. Số điện thoại mặc định bị che và hiện ra khi bấm biểu tượng con mắt.

[Ảnh: luồng đón khách/6.jpg]

#### 3.3.4 Mobile — Đón khách

##### 3.3.4.1 `<Quản lý>` Mở danh sách chờ đón khách

Quản lý bấm "Đón khách — thu tiền" để xem các hợp đồng chờ bắt đầu, sắp theo độ gấp: "QUÁ HẠN {n} NGÀY", "HÔM NAY", "NGÀY MAI" hoặc "CÒN {n} NGÀY". Hợp đồng chưa đặt ngày đón hiện "CHƯA ĐẶT NGÀY ĐÓN".

[Ảnh: mobile — danh sách chờ đón khách]

##### 3.3.4.2 `<Quản lý>` Gửi Host duyệt giá mới khi cần

Nếu khách chốt mức giá khác giá niêm yết, Quản lý bấm "Nhập giá mới" và "Nhập tiền cọc" rồi gửi hợp đồng cho Host. Thẻ hợp đồng chuyển sang "Chờ Host duyệt giá", và hiện "Host từ chối giá" nếu Host không đồng ý.

[Ảnh: mobile — nhập giá mới gửi Host duyệt]

##### 3.3.4.3 `<Quản lý>` Thu cọc và tiền nhà kỳ đầu

Quản lý chọn hình thức thu ở mục "Hình thức thu cọc". Thu tiền mặt được ghi nhận ngay, còn chuyển khoản sẽ tạo link thanh toán PayOS và thẻ hiện "Chờ khách chuyển tiền" cho tới khi hệ thống ghi nhận được giao dịch.

[Ảnh: mobile — thu cọc và tiền nhà kỳ đầu]

##### 3.3.4.4 `<Quản lý>` Ghi hiện trạng phòng và chỉ số đồng hồ

Quản lý chụp ít nhất một ảnh hiện trạng phòng, sau đó chụp đồng hồ điện và đồng hồ nước. Hệ thống đọc chỉ số từ ảnh và Quản lý sửa lại nếu sai. Không có ảnh đồng hồ thì chỉ nhập tay được bằng mã do Admin cấp, kèm tick xác nhận chịu trách nhiệm.

[Ảnh: mobile — ảnh hiện trạng phòng và chỉ số công tơ]

##### 3.3.4.5 `<Quản lý>` Xác nhận hợp đồng bằng OTP hai chiều

Quản lý và khách mỗi người nhận một mã riêng. Quản lý nhập mã của mình, thẻ chuyển sang "Chờ khách nhập OTP", và hợp đồng chỉ có hiệu lực khi cả hai mã đều được nhập đúng.

[Ảnh: mobile — nhập OTP xác nhận hợp đồng]

##### 3.3.4.6 `<Quản lý>` Hoàn tất đón khách

Hệ thống hiện "Hoàn tất khởi tạo 🎉" kèm mã hợp đồng, tên khách, phòng và tài khoản đăng nhập của khách, sau đó Quản lý bấm "Về trang chủ".

[Ảnh: mobile — hoàn tất đón khách]

#### 3.3.5 Mobile — Ký và theo dõi hợp đồng

##### 3.3.5.1 `<Khách thuê>` Kích hoạt tài khoản và đăng nhập

Khách mở ứng dụng và nhập số điện thoại cùng mật khẩu được cấp lúc đón khách. Tài khoản chưa kích hoạt thì bấm "Kích hoạt ngay".

[Ảnh: mobile — màn đăng nhập khách thuê]

##### 3.3.5.2 `<Khách thuê>` Xác nhận hợp đồng

Khách mở "Xác nhận hợp đồng", đọc hợp đồng và biên bản bàn giao, rồi nhập mã 6 chữ số gửi về điện thoại. Màn hình ghi rõ hai bên mỗi người giữ một mã riêng và hợp đồng chỉ có hiệu lực khi cả hai cùng nhập đúng; "Gửi lại mã" gửi mã mới sau khi hết thời gian chờ.

[Ảnh: mobile — xác nhận hợp đồng bằng OTP]

##### 3.3.5.3 `<Khách thuê>` Xem trang chủ

Đăng nhập thành công, khách thấy toà nhà và phòng của mình, các hoá đơn cần trả, tình trạng các yêu cầu bảo trì và hợp đồng còn bao nhiêu ngày.

[Ảnh: mobile — trang chủ khách thuê]

##### 3.3.5.4 `<Khách thuê>` Xem hợp đồng

Khách bấm "Chi tiết hợp đồng" để đọc điều khoản và bấm "📥 Tải PDF hợp đồng" để tải file đã ký.

[Ảnh: mobile — chi tiết hợp đồng khách thuê]

#### 3.3.6 Mobile — Trả phòng

##### 3.3.6.1 `<Khách thuê>` Gửi yêu cầu trả phòng

Khách bấm "🚪 Yêu cầu trả phòng", chọn ngày dọn đi và lý do rồi gửi yêu cầu. Màn hình hiện sáu bước của quy trình: "Gửi yêu cầu", "Quản lý duyệt", "Kiểm tra phòng", "Bạn xác nhận quyết toán", "Hoàn tiền cọc" và "Hoàn tất".

[Ảnh: mobile — yêu cầu trả phòng]

##### 3.3.6.2 `<Quản lý>` Duyệt yêu cầu

Quản lý mở "Duyệt yêu cầu trả phòng" và duyệt, hệ thống sẽ chốt tiền phòng tháng đó theo ngày rời phòng và gửi hoá đơn kỳ cuối cho khách. Từ chối thì phải ghi lý do để khách hiểu và điều chỉnh.

[Ảnh: mobile — duyệt yêu cầu trả phòng]

##### 3.3.6.3 `<Quản lý>` Lập biên bản kiểm tra phòng

Đến ngày hẹn, Quản lý bấm "Lập biên bản kiểm tra", chụp ảnh hiện trạng phòng và chụp lại hai đồng hồ. Hệ thống kiểm tra ảnh có đúng là đồng hồ cần chụp không và đọc chỉ số chốt từ ảnh.

[Ảnh: mobile — biên bản kiểm tra phòng khi trả]

##### 3.3.6.4 `<Quản lý>` Gửi bảng quyết toán

Quản lý rà lại các khoản trong bảng quyết toán — "Tiền điện", "Tiền nước", "Tiền nhà", "Phí dịch vụ", "Phí bảo trì", "Bồi thường hư hỏng", "Khoản khác" — rồi gửi cho khách.

[Ảnh: mobile — bảng quyết toán trả phòng]

##### 3.3.6.5 `<Khách thuê>` Xác nhận quyết toán và nhận cọc

Khách bấm "Xem và xác nhận bảng quyết toán", thanh toán phần còn thiếu, cuối cùng bấm "Xác nhận bạn đã nhận đủ tiền cọc". Khách không đồng ý thì gửi khiếu nại, và Admin sẽ phân xử trên web.

[Ảnh: mobile — khách xác nhận quyết toán và nhận cọc]

#### 3.3.7 Web — Theo dõi hợp đồng và khách thuê

##### 3.3.7.1 `<Admin>` Kiểm tra tình trạng nhà và phòng

Admin bấm "Tình trạng nhà & phòng" để xem quản lý đã tiếp quản nhà chưa, còn mấy phòng trống và hồ sơ bàn giao của từng phòng có khách đã đủ chưa.

[Ảnh: admin/màn tình trạng phòng & nhà.jpg]

##### 3.3.7.2 `<Admin>` Giám sát hợp đồng khách thuê

Admin bấm "Hợp đồng" để theo dõi mọi hợp đồng thuê trong hệ thống và những hợp đồng sắp hết hạn.

[Ảnh: admin/màn admin xem hợp đồng của khách thuê.jpg]

##### 3.3.7.3 `<Host>` Xem danh sách khách thuê

Host bấm "Khách thuê" để xem ai đang ở phòng nào, phòng nào còn trống và hợp đồng nào sắp hết hạn trong 60 ngày.

[Ảnh: host/màn quản lý khách thuê.jpg]

##### 3.3.7.4 `<Host>` Xem danh sách hợp đồng

Host bấm "Hợp đồng" để xem hợp đồng khách thuê ở một tab và hợp đồng master lease ký với chủ nhà ở tab còn lại.

[Ảnh: host/màn quản lý hợp đồng.jpg]

##### 3.3.7.5 `<Admin>` Duyệt đơn xin gia hạn

Admin bấm "Đơn gia hạn" rồi duyệt đơn, thao tác này chỉ dời ngày kết thúc và giữ nguyên giá thuê. Từ chối đơn thì phải ghi lý do tối thiểu 10 ký tự, vì khách đọc nguyên văn nội dung đó.

[Ảnh: admin/màn admin xem đơn giai hạn ở thêm của khách thuê.jpg]

##### 3.3.7.6 `<Host>` Theo dõi đơn xin gia hạn

Host bấm "Đơn gia hạn" để biết khách nào xin ở thêm và đơn đã được xử lý ra sao. Quyền quyết định thuộc về Admin.

[Ảnh: host/màn theo dõi đơn giai hạn của khách thuê.jpg]

### 3.4 Luồng hoá đơn và thanh toán hằng tháng

#### 3.4.1 Hoá đơn tiền phòng tự động hằng tháng

##### 3.4.1.1 `<Hệ thống>` Tự phát hành hoá đơn tiền phòng

Ngày 1 hằng tháng, hệ thống tự phát hành hoá đơn tiền phòng cho mọi hợp đồng đang hiệu lực và báo cho khách, quản lý không phải gửi tay. Toàn bộ chu kỳ được chốt như sau:

| Ngày trong tháng | Hệ thống làm gì |
|---|---|
| 28 (tháng trước) | Nhắc khách chuẩn bị, ngày 1 tới hạn đóng tiền phòng |
| 1 | Tự phát hành hoá đơn tiền phòng cho mọi hợp đồng đang hiệu lực và báo khách |
| 2 – 4 | Nhắc khách mỗi ngày nếu chưa thanh toán |
| 5 | Hạn cuối thanh toán |
| 7 | Nhắc lần cuối |
| Từ ngày 8 | Quản lý được quyền chấm dứt hợp đồng vì không thanh toán |

*Bảng 5 - Chu kỳ tiền phòng hằng tháng*

Trả trễ không bị phạt tiền, và hệ thống không tự cắt hợp đồng. Điện và nước không nằm trong chu kỳ này — quản lý chốt chỉ số rồi gửi hoá đơn điện nước riêng (mục 3.4.2).

##### 3.4.1.2 `<Khách thuê>` Nhận và thanh toán hoá đơn tiền phòng

Ngày 1 khách nhận thông báo và mở hoá đơn ở mục "Hoá đơn", nơi hoá đơn tiền phòng nằm cùng chỗ với hoá đơn điện và nước, rồi thanh toán trước ngày 5.

[Ảnh: mobile — thông báo và hoá đơn tiền phòng tháng mới]

##### 3.4.1.3 `<Quản lý>` Theo dõi việc thu tiền phòng

Quản lý bấm "Tiền phòng tự động", chọn một toà nhà và xem mỗi phòng một dòng: hoá đơn đã phát hành chưa ("Chờ phát hành", "✓ Đã phát hành · tự động") và khách đã trả chưa ("✓ Khách đã thanh toán", "Khách chưa thanh toán", "Quá hạn {n} ngày"). Hợp đồng mới vào trong tháng sẽ hiện "✓ Khách đã trả lúc đón khách".

[Ảnh: mobile — màn Tiền phòng tự động của quản lý]

##### 3.4.1.4 `<Quản lý>` Chấm dứt hợp đồng do không thanh toán

Từ ngày 8, phòng vẫn chưa trả tiền sẽ hiện nút "⛔ Chấm dứt hợp đồng". Quản lý bấm nút này, đọc cảnh báo ghi rõ đã quá hạn bao nhiêu ngày và đã nhắc đủ các mốc, rồi xác nhận và xử lý trả phòng. Thao tác không đảo ngược được, và hệ thống để quyết định cho con người chứ không tự cắt theo lịch.

[Ảnh: mobile — chấm dứt hợp đồng do quá hạn]

##### 3.4.1.5 `<Hệ thống>` Tính tiền kỳ đầu và kỳ cuối

Khách vào giữa tháng không có hoá đơn kỳ đầu riêng: tiền từ ngày nhận phòng đến hết tháng đã được thu chung một lần với tiền cọc lúc đón khách (mục 3.3.4.3), từ tháng sau mới chạy chu kỳ bình thường. Khách trả phòng giữa tháng nhận hoá đơn kỳ cuối tính từ ngày 1 đến ngày quản lý duyệt rời phòng, phát hành ngay lúc duyệt và được đưa vào bảng quyết toán (mục 3.3.6.4).

#### 3.4.2 Mobile — Chốt chỉ số đồng hồ

##### 3.4.2.1 `<Quản lý>` Mở việc chốt chỉ số

Quản lý bấm "Ghi điện nước" hoặc thẻ "Cần chụp công tơ" ở trang chủ để xem các phòng chưa chụp đồng hồ, nhóm theo toà nhà và đánh dấu "Quá hạn {n} ngày", "Hạn hôm nay" hoặc "Còn {n} ngày".

[Ảnh: mobile — danh sách phòng cần chụp công tơ]

##### 3.4.2.2 `<Quản lý>` Chụp ảnh và chốt chỉ số

Quản lý chụp đồng hồ, đối chiếu con số hệ thống đọc được từ ảnh rồi lưu lại. Điện phải chốt xong trong ngày cuối tháng, vì chưa có ảnh thì không phát hành được hoá đơn.

[Ảnh: mobile — chụp công tơ và chốt chỉ số]

##### 3.4.2.3 `<Quản lý>` Gửi hoá đơn cho từng phòng

Sau khi Admin phát hành hoá đơn tổng, Quản lý mở "Hoá đơn EVN" để xem từng phòng với chỉ số, lượng tiêu thụ, đơn giá và thành tiền, rồi gửi hoá đơn cho khách. Mỗi dòng sau đó hiện "📬 Đã gửi — khách chưa mở xem", "👁 Khách đã xem hoá đơn — chưa trả tiền" hoặc "✓ Khách đã thanh toán".

[Ảnh: mobile — hoá đơn điện nước từng phòng]

#### 3.4.3 Web — Phát hành hoá đơn cho từng toà nhà

##### 3.4.3.1 `<Admin>` Phát hành hoá đơn điện

Admin bấm "Hoá đơn điện EVN", chọn kỳ tiêu thụ và toà nhà, tải ảnh hoá đơn giấy lên, đối chiếu các số liệu hệ thống đọc được rồi bấm "Phát hành đơn giá cho kỳ này". Phòng nào chưa chốt chỉ số sẽ tự phát hành ngay khi quản lý chốt số.

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/1.jpg]

##### 3.4.3.2 `<Admin>` Phát hành hoá đơn nước

Admin bấm "Hoá đơn nước" và làm y các bước trên, chỉ khác đơn vị là m³ và định danh đồng hồ là số danh bộ.

[Ảnh: luồng admin gửi hoá đơn điện nước/nước/1.jpg]

##### 3.4.3.3 `<Admin>` Cấp mã nhập tay chỉ số đồng hồ

Khi quản lý không chụp được ảnh đồng hồ, Admin bấm "Cấp mã đồng hồ", ghi rõ ai xin và vì sao, đặt hạn dùng theo phút, bấm "Tạo mã" rồi đọc mã cho quản lý. Mã chỉ dùng được một lần và tự hết hiệu lực khi hết hạn.

[Ảnh: admin/màn cấp mã đồng hồ điện nước onboard.jpg]

#### 3.4.4 Web — Phát hành theo lô từ file .zip

##### 3.4.4.1 `<Admin>` Khớp file nén với các toà nhà

Admin bấm "Nhập từ .zip" và chọn file nén. Hệ thống khớp từng bản scan với toà nhà theo mã khách hàng và báo số nhà khớp được, sau đó Admin bấm "Đọc số liệu {n} nhà".

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/2.jpg]

##### 3.4.4.2 `<Admin>` Đối chiếu số liệu

Admin đối chiếu từng dòng với ảnh scan và sửa lại những số máy đọc sai, vì sai tổng là sai đơn giá, mà quản lý dựng hoá đơn từng phòng trên chính đơn giá đó.

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/3.jpg]

Hoá đơn nước nhập theo lô tương tự.

[Ảnh: luồng admin gửi hoá đơn điện nước/nước/3.jpg]

##### 3.4.4.3 `<Admin>` Phát hành cả lô

Admin bấm "Phát hành {n} nhà" và đọc hộp xác nhận, trong đó liệt kê các toà nhà và cảnh báo khi kỳ hoá đơn được lấy theo tháng đang chọn thay vì theo giấy.

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/4.jpg]

##### 3.4.4.4 `<Admin>` Thu hồi hoá đơn phát hành nhầm

Admin bấm "Thu hồi hoá đơn này" ở dòng sai trong danh sách đã phát hành. Toà nhà sau đó phát hành lại được cho kỳ đó.

[Ảnh: danh sách đã phát hành]

#### 3.4.5 Mobile — Thanh toán hoá đơn

##### 3.4.5.1 `<Khách thuê>` Mở danh sách hoá đơn

Khách bấm "Hoá đơn" để xem mọi hoá đơn kèm loại và trạng thái: "Chờ thanh toán", "Đã thanh toán", "Quá hạn" hoặc "Đã huỷ".

[Ảnh: mobile — danh sách hoá đơn của khách thuê]

##### 3.4.5.2 `<Khách thuê>` Thanh toán hoá đơn

Khách mở một hoá đơn, đọc chỉ số, lượng tiêu thụ, đơn giá và thành tiền rồi thanh toán. Các hình thức gồm "🏦 Chuyển khoản ngân hàng", "💵 Tiền mặt" và "💳 Ví điện tử"; thanh toán trực tuyến xong sẽ quay về trang kết quả và hoá đơn được cập nhật trong ít phút.

[Ảnh: mobile — chi tiết hoá đơn và thanh toán]

##### 3.4.5.3 `<Khách thuê>` Gửi yêu cầu tra soát hoá đơn

Khách thấy hoá đơn sai thì gửi yêu cầu tra soát ngay trên hoá đơn đó. Trong lúc đang tra soát, hoá đơn tạm ngừng tính quá hạn; bấm "Rút yêu cầu tra soát?" để rút lại và hạn thanh toán chạy tiếp.

[Ảnh: mobile — gửi yêu cầu tra soát hoá đơn]

##### 3.4.5.4 `<Quản lý>` Thu tiền mặt của khách

Quản lý mở hoá đơn của phòng và ghi nhận khoản thu, hoá đơn được đóng ngay và xuất hiện trong lịch sử thu tiền.

[Ảnh: mobile — thu tiền mặt của khách]

#### 3.4.6 Web — Theo dõi tiền đã thu

##### 3.4.6.1 `<Admin>` Giám sát hoá đơn và thanh toán

Admin bấm "Thanh toán" để xem toàn bộ hoá đơn của hệ thống ở một tab và tiền cọc ở tab còn lại. Hoá đơn chỉ có thu đủ hoặc chưa thu, vì hệ thống không ghi nhận thu một phần.

[Ảnh: admin/màn admin xem hoá đơn thanh toán.jpg]

##### 3.4.6.2 `<Host>` Xem hoá đơn của khách thuê

Host bấm "Hoá đơn" để lọc hoá đơn đã phát hành cho khách của mình và xuất kết quả ra Excel.

[Ảnh: host/màn theo dõi hoá đơn thanh toán.jpg]

##### 3.4.6.3 `<Admin>` Phân xử khiếu nại hoá đơn điện nước

Admin bấm "Hoá đơn điện nước" trong nhóm khiếu nại, đối chiếu lời khiếu nại với hoá đơn gốc rồi kết luận. Trong lúc hoá đơn đang bị khiếu nại, hệ thống tạm ngừng tính quá hạn.

[Ảnh: admin/màn khiếu nại hoá đơn điện nước từ khách thuê.jpg]

#### 3.5.1 Mobile — Báo hỏng

##### 3.5.1.1 `<Khách thuê>` Quét mã QR thiết bị

Khách bấm "Quét mã QR thiết bị" và hướng camera vào tem dán trên thiết bị để mở đúng món đồ đó. Mã không thuộc phòng đang thuê sẽ bị từ chối, và hệ thống mời "Chọn từ danh sách thiết bị".

[Ảnh: mobile — quét QR thiết bị]

##### 3.5.1.2 `<Khách thuê>` Tạo yêu cầu bảo trì

Khách nhập tiêu đề sự cố, chọn danh mục hư hỏng, đính kèm ít nhất một ảnh hiện trạng và đề xuất lịch hẹn. Hệ thống nhận diện thiết bị trong ảnh và gắn vào yêu cầu.

[Ảnh: mobile — tạo yêu cầu bảo trì]

##### 3.5.1.3 `<Khách thuê>` Theo dõi yêu cầu

Khách bấm "Bảo trì" để theo dõi yêu cầu qua các trạng thái "Chờ xử lý", "Đang xử lý", "Đã hoàn thành", và xem lại lịch sử sửa chữa của phòng.

[Ảnh: mobile — danh sách yêu cầu bảo trì của khách]

#### 3.5.2 Mobile — Xử lý phiếu bảo trì

##### 3.5.2.1 `<Quản lý>` Mở phiếu

Quản lý bấm "Bảo trì" để xem các phiếu của nhà mình theo mức ưu tiên "🚨 Khẩn cấp", "🟡 Trung bình", "🟢 Thấp", rồi mở một phiếu để đọc mô tả và xem ảnh.

[Ảnh: mobile — danh sách phiếu bảo trì của quản lý]

##### 3.5.2.2 `<Quản lý>` Sửa chữa và đóng phiếu

Quản lý cập nhật tiến độ, đính kèm "🖼️ Ảnh sau sửa chữa" và "🧾 Ảnh hoá đơn", nhập chi phí rồi đóng phiếu.

[Ảnh: mobile — cập nhật tiến độ và đóng phiếu]

##### 3.5.2.3 `<Quản lý>` Báo lỗi do khách gây ra

Khi hư hỏng do khách gây ra, Quản lý đính kèm "⚠️ Bằng chứng lỗi" và gửi báo cáo, phiếu được chuyển cho Admin xét duyệt chứ không tính thẳng cho khách.

[Ảnh: mobile — báo lỗi do khách]

#### 3.5.3 Web — Bảo trì và thiết bị

##### 3.5.3.1 `<Admin>` Giám sát phiếu bảo trì

Admin bấm "Bảo trì & thiết bị" để theo dõi mọi yêu cầu sửa chữa từ lúc khách báo tới lúc đóng phiếu, kèm chi phí và ảnh bằng chứng.

[Ảnh: admin/màn bảo trì thiết bị.jpg]

##### 3.5.3.2 `<Admin>` Xét duyệt phiếu báo lỗi do khách

Admin bấm "Báo lỗi do khách", xem bằng chứng rồi bấm "Xem xét & duyệt" để tính chi phí sửa chữa cho khách, hoặc bấm "Không duyệt" kèm ghi chú để công ty chịu chi phí.

[Ảnh: màn Báo lỗi do khách]

##### 3.5.3.3 `<Admin>` In tem QR cho thiết bị

Admin bấm "Danh mục thiết bị", chọn toà nhà và khổ tem, rồi bấm "In tất cả tem QR" hoặc "In toàn bộ nhà". Khách thuê quét tem này để báo hỏng đúng thiết bị.

[Ảnh: admin/màn quản lý thiết bị & mã QR thiết bị.jpg]

### 3.6 Luồng dòng tiền và báo cáo tài chính

#### 3.6.1 Web — Dòng tiền

##### 3.6.1.1 `<Host>` Đối soát tiền vào và tiền ra

Host bấm "Tổng quan" để đối soát tiền vào, tiền ra và lợi nhuận ròng của kỳ, theo từng toà nhà.

[Ảnh: host/màn theo dõi tổng quan dòng tiền của hệ thống.jpg]

##### 3.6.1.2 `<Host>` Theo dõi công nợ

Host bấm "Công nợ" để biết ai đang nợ bao nhiêu, sắp xếp theo thời gian nợ.

[Ảnh: host/màn theo dõi các khoản nợ của khách thuê.jpg]

#### 3.6.2 Web — Tiền cọc

##### 3.6.2.1 `<Host>` Theo dõi sổ cọc

Host bấm "Sổ cọc" để xem các khoản cọc đang giữ. Cọc chỉ hoàn được khi khách đã thanh toán đủ mọi khoản, và không bao giờ dùng để trừ nợ hoá đơn.

[Ảnh: host/màn quản lý tiền cọc của khách thuê.jpg]

##### 3.6.2.2 `<Admin>` Phân xử khiếu nại hoàn cọc

Admin bấm "Hoàn cọc", đọc nội dung khách khiếu nại và hồ sơ trả phòng, rồi bấm "Kết luận khiếu nại" để khép vụ việc bằng một kết luận có ghi lý do.

[Ảnh: admin/màn khiếu nại hoàn cọc cho tenant.jpg]

#### 3.6.3 Web — Báo cáo

##### 3.6.3.1 `<Host>` Xem báo cáo tài chính và hiệu suất vận hành

Host bấm "Báo cáo" để xem doanh thu, chi phí, lợi nhuận và tỷ lệ lấp đầy qua 6 hoặc 12 kỳ, kèm hiệu suất của từng quản lý vận hành.

[Ảnh: host/màn báo cáo phân tích hiệu suất vận hành của hệ thống.jpg]

##### 3.6.3.2 `<Host>` Đọc thông báo

Host bấm "Thông báo" để đọc các sự kiện cần xử lý, lọc theo loại và theo trạng thái đã đọc.

[Ảnh: host/màn thông báo.jpg]

#### 3.6.4 Mobile — Lịch sử thu chi

##### 3.6.4.1 `<Quản lý>` Xem lịch sử thu tiền

Quản lý bấm "Lịch sử thu tiền" để kiểm tra đã thu được những khoản nào ở các nhà mình phụ trách và còn hoá đơn nào chưa thu.

[Ảnh: mobile — lịch sử thu tiền của quản lý]

##### 3.6.4.2 `<Khách thuê>` Xem lịch sử thanh toán

Khách bấm "Lịch sử thanh toán" để xem lại mọi khoản đã trả, kèm hình thức và ngày thanh toán.

[Ảnh: mobile — lịch sử thanh toán của khách thuê]

### 3.7 Xử lý sự cố thường gặp

| Thông báo trên màn hình | Nghĩa là gì | Cách xử lý |
|---|---|---|
| "Tài khoản Quản lý vận hành vui lòng sử dụng ứng dụng di động." | Tài khoản quản lý đăng nhập trên web | Dùng ứng dụng di động, web chỉ dành cho Admin và Host |
| "Không kết nối được máy chủ. Kiểm tra lại backend rồi thử lại." | Không gọi được backend | Kiểm tra dịch vụ API đã chạy chưa và `VITE_API_URL` có trỏ đúng không |
| "Có khu vực trong file chưa tồn tại trong hệ thống" | File Excel có quận/huyện chưa nằm trong danh mục | Bấm "Tạo tự động", hoặc thêm ở "Danh mục khu vực" rồi kiểm tra file lại |
| "Chưa import được: cả {n} hợp đồng đều thuộc nhà chưa hoạt động" | Các toà nhà chưa được Host kích hoạt | Hoàn tất luồng duyệt giá trước, rồi mới import hợp đồng khách |
| "Nhà này chưa có quản lý phụ trách…" | Khu vực của toà nhà chưa có quản lý | Nhờ Host phân công quản lý cho khu vực |
| "Cấu hình chưa có tiền lãi mục tiêu…" | Cấu hình duyệt giá chưa từng được nhập | Mở "Cấu hình giá" và lưu lại |
| "Số danh bộ không khớp…" | Số danh bộ trên giấy khác số đã lưu | Kiểm tra lại toà nhà đang chọn, sau đó sửa ô số danh bộ rồi bấm lại |
| "Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay." | Hệ thống không đọc được ảnh hoá đơn | Nhập tay các con số, ảnh vẫn được lưu làm bằng chứng |
| "Ảnh không phải đồng hồ điện / nước" | Ảnh chụp trên mobile không phải đồng hồ đang cần | Chụp lại gần hơn, lấy rõ ô số và tránh ánh sáng phản chiếu |
| "Chưa có chỉ số {điện/nước}. Chụp ảnh đồng hồ để OCR tự điền, hoặc xin mã quản trị để nhập tay." | Chỉ số chưa có bằng chứng ảnh | Chụp ảnh đồng hồ, hoặc xin Admin cấp mã nhập tay (mục 3.4.3.3) |
| "Server không gửi được SMS tới số của khách." | Không gửi được mã OTP | Báo Admin kiểm tra cấu hình dịch vụ SMS, bấm lại cũng sẽ lỗi y hệt |
| "Còn {n} phòng đang có khách thuê — không thể thực hiện." | Toà nhà vẫn còn phòng có khách | Chờ hết hợp đồng, hoặc chuyển khách sang chỗ khác trước |
| "Khách còn khoản chưa thanh toán {tiền}. Thu đủ rồi mới hoàn cọc được." | Khách vẫn còn nợ | Thu đủ các hoá đơn còn lại, sau đó hoàn cọc nguyên vẹn |
| "Tài khoản này không có quyền … (403)" | Tài khoản không đủ quyền vào màn đó | Đăng nhập bằng tài khoản Admin |

*Bảng 6 - Xử lý sự cố thường gặp*
