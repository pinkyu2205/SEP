# VII. Release Package & User Guides

## 1. Deliverable Package

| No. | Deliverable Item            | Description                                                                                                              |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Project Schedule / Tracking | Task tracking of the whole project. Link: `<điền link>`                                                                  |
| 2   | Source Codes                | Frontend monorepo (web + mobile): https://github.com/pinkyu2205/SEP — Backend: `<điền link repo BE>`                     |
| 3   | Database Script(s)          | `<điền link>`                                                                                                            |
| 4   | Final Report Document       | `<điền link>`                                                                                                            |
| 5   | Test Cases & Test Report    | `<điền link>`                                                                                                            |
| 6   | Import Templates (Excel)    | Intake, operation configuration and tenant onboarding templates, downloadable in-app via "Tải template" / "Tải file mẫu" |
| 7   | Slide Final Presentation    | `<điền link>`                                                                                                            |

_Table 1 - Deliverable Package_

## 2. Installation Guides

### 2.1 System Requirements

#### 2.1.1 Hardware requirements

##### 2.1.1.1 Web Application

| Laptop              | Minimum Requirements    | Recommended                  |
| ------------------- | ----------------------- | ---------------------------- |
| Internet Connection | Wi-Fi (4 Mbps)          | Cable, Wi-Fi (8 Mbps)        |
| Operating System    | Windows 10              | Windows 11                   |
| Computer Processor  | Intel® Core i3 1.4GHz   | Intel® Core i5 2.50GHz       |
| Computer Memory     | 4GB RAM or more         | 8GB RAM or more              |
| Screen Resolution   | 1366 × 768              | 1920 × 1080                  |
| Web Browser         | Chrome (v120 or higher) | Chrome latest stable version |

_Table 2 - Hardware requirements - Web application_

##### 2.1.1.2 Mobile Application

| Item             | Requirement                                                                |
| ---------------- | -------------------------------------------------------------------------- |
| Operating system | Android 8.1 or higher / iOS 13 or higher                                   |
| Storage Minimum  | 256 MB                                                                     |
| RAM              | Minimum of 2 GB                                                            |
| Camera           | Required for meter photos, room condition photos and equipment QR scanning |

_Table 3 - Hardware requirements - Mobile application_

#### 2.1.2 Software requirements

| Software         | Name / Version             | Description                                   |
| ---------------- | -------------------------- | --------------------------------------------- |
| Operating System | Windows 10 / 11, macOS 12+ | Operating system and platform for development |
| Web browser      | Chrome v120 or above       | For web app                                   |
| Node.js          | v20 LTS or above           | Build and run the web application             |
| Java             | JDK 17                     | Run the backend service                       |
| Docker           | v24 or above               | Optional, run the backend as a container      |
| Android System   | Android v8.1 or higher     | For mobile app                                |
| Expo Go          | Latest                     | Run the mobile app in development             |

_Table 4 - Software requirements_

### 2.2 Installation Instruction

#### 2.2.1 Backend

1. Install JDK 17 and the database server.
2. Clone the backend repository and configure its environment file (database connection, JWT secret, mail / SMS credentials, Cloudinary account).
3. Run the service. By default it listens on `http://localhost:8080`.
4. Project starts with `http://localhost:8080/swagger-ui/index.html`.

#### 2.2.2 Web app

1. Install Node.js v20 LTS or above.
2. Clone the repository and install the dependencies:

   ```bash
   git clone https://github.com/pinkyu2205/SEP.git
   cd SEP/frontend-web
   npm install
   ```

3. Create the `.env` file with the keys below:

   | Key                             | Meaning                                                                                                                                                   |
   | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `VITE_API_URL`                  | Backend address. Leave it empty to use the local backend through the Vite proxy (`http://localhost:8080`), or fill it in to point at the deployed server. |
   | `VITE_CLOUDINARY_CLOUD_NAME`    | Cloudinary account that stores uploaded images                                                                                                            |
   | `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary upload preset                                                                                                                                  |
   | `VITE_GOONG_MAPS_KEY`           | Goong Maps key for address autocomplete and the property map                                                                                              |

4. Run `npm run dev` for development, or `npm run build` and `npm run preview` for the production build.
5. Project starts with `http://localhost:5173`.

#### 2.2.3 Mobile app

1. Install Node.js v20 LTS and the Expo CLI.
2. Install the dependencies and start the Expo server:

   ```bash
   cd SEP/mobile-app
   npm install
   npm start
   ```

3. Configure the backend address in the mobile environment file, then scan the QR code with Expo Go or install the built APK.

## 3. User Manual

### 3.1 Overview

The Sub-leasing Management System (SLMS-2026) has 5 main workflows below:

- Property Onboarding & Pricing Workflow
- Tenant & Contract Management Workflow
- Monthly Billing & Payment Workflow
- Maintenance & Equipment Management Workflow
- Cash Flow & Financial Reporting Workflow

Each workflow is executed on two clients. The **web application** is used by the Admin and the Owner, and the **mobile application** is used by the operations Manager and the Tenant. The sections below are therefore split into "Web" and "Mobile" the same way the work itself is split.

| Role    | Client       | Responsibility                                                                                              |
| ------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| Admin   | Web          | Property intake, operation configuration, tenant onboarding, utility bill publishing, complaint arbitration |
| Owner    | Web          | Price approval, zone assignment, financial monitoring                                                       |
| Manager | Mobile       | Taking over buildings, receiving tenants, meter readings, room invoices, maintenance, checkout              |
| Tenant  | Mobile       | Signing the contract, paying invoices, reporting faults, requesting checkout                                |
| Guest   | Web (public) | Browsing listings and calling the hotline                                                                   |

### 3.2 Property Onboarding & Pricing Workflow

#### 3.2.1 Web — Property intake

##### 3.2.1.1 `<Admin>` Login

To login into the system, users enter their username and password, then click on "Đăng nhập".

[Ảnh: trang đăng nhập]

After login successfully, the Admin sees the Admin Portal with the intake workflow on the sidebar.

##### 3.2.1.2 `<Admin>` Open the property intake screen

The Admin clicks on "Khởi tạo nhà" to see all buildings taken over from their owners, and what is still missing in each file.

[Ảnh: luồng khởi tạo nhà/1.jpg]

##### 3.2.1.3 `<Admin>` Open the Excel import

The Admin clicks on "Nhập từ Excel" to import the buildings. Buildings are created only from Excel, and the template can be downloaded with "Tải template".

[Ảnh: luồng khởi tạo nhà/2.jpg]

##### 3.2.1.4 `<Admin>` Check the file

The Admin selects the Excel file and clicks on "Kiểm tra file". This step only validates the file and does not write anything into the system.

[Ảnh: luồng khởi tạo nhà/3.jpg]

When the file is valid, the system reports how many buildings and how many handed-over devices it contains. If the file contains a district that does not exist yet, the Admin clicks on "Tạo tự động" to create it and checks the file again.

[Ảnh: luồng khởi tạo nhà/4.jpg]

##### 3.2.1.5 `<Admin>` Import the buildings

The Admin clicks on "Nhập {n} căn" and confirms with "Nhập ngay" to write the buildings into the system.

[Ảnh: luồng khởi tạo nhà/5.jpg]

The system creates the buildings and lists each one with its contract code, the status "Đã khởi tạo" and the link "Cấu hình khai thác" to the next step. A building imported by mistake can be removed with the delete icon on its row.

[Ảnh: luồng khởi tạo nhà/6.jpg]

##### 3.2.1.6 `<Admin>` Complete the property file

The Admin opens a building to fill in the master lease, the electricity customer code, the water subscriber number and the equipment handed over by the owner, then clicks on "Xác nhận & Quay về danh sách" to finish the intake. The utility codes cannot be edited afterwards, so a wrong code has to be corrected by importing the intake file again.

[Ảnh: hồ sơ toà nhà]

#### 3.2.2 Web — Operation configuration

##### 3.2.2.1 `<Admin>` Open the operation configuration screen

The Admin clicks on "Cấu hình khai thác" to follow every imported building on its way to being open for business.

[Ảnh: luồng cấu hình khai thác/1.jpg]

##### 3.2.2.2 `<Admin>` Open the renovation import

The Admin clicks on "Nhập cải tạo từ Excel". The file contains the rental model, the room list, the renovation contract and the equipment bought new, matched to each building by its lease contract code.

[Ảnh: luồng cấu hình khai thác/2.jpg]

##### 3.2.2.3 `<Admin>` Check the file

The Admin selects the file and clicks on "Kiểm tra file".

[Ảnh: luồng cấu hình khai thác/3.jpg]

The system reports the number of buildings, renovation lines, newly bought devices and skipped rows. A building that the file declares as needing no renovation is skipped and keeps its current state.

[Ảnh: luồng cấu hình khai thác/4.jpg]

##### 3.2.2.4 `<Admin>` Import and send to the Owner

The Admin clicks on "Nhập & gửi Owner" and confirms. Importing is also the submission, so there is no separate send button.

[Ảnh: luồng cấu hình khai thác/5.jpg]

Every imported building moves to "Đã gửi Owner" and appears in the Owner approval queue.

[Ảnh: luồng cấu hình khai thác/6.jpg]

##### 3.2.2.5 `<Admin>` Confirm the renovation is finished

When construction is over, the Admin opens the building and clicks on "Xác nhận hoàn thành cải tạo". The Owner can only price a building after this step.

[Ảnh: nút xác nhận hoàn thành cải tạo]

#### 3.2.3 Web — Pricing policy

##### 3.2.3.1 `<Owner>` Set the profit target and the operating cost

The Owner clicks on "Cấu hình giá" and enters the profit target and the monthly operating cost. These numbers drive every price approval, so they must be saved before the first building is priced.

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/1.jpg]

##### 3.2.3.2 `<Owner>` Set the yearly rent increase

The Owner sets the yearly increase, the grace period for new tenants and how early next year's price is quoted, then checks the simulator at the bottom of the block.

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/3.jpg]

##### 3.2.3.3 `<Owner>` Set the risk margins

The Owner sets the vacancy margin and the handover window deducted at the end of the master lease, checks the summary and clicks on "Lưu cấu hình".

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/4.jpg]

##### 3.2.3.4 `<Owner>` Record the manager salary table

The Owner clicks on "Lương quản lý", enters the salary of each operations manager and clicks on "Lưu bảng lương". Each building carries the salary divided by the number of buildings that manager is in charge of.

[Ảnh: host/cấu hình giá cho để tính tiền duyệt giá nhà/màn cấu hình lương cho manager.jpg]

#### 3.2.4 Web — Price approval of a whole-house property

##### 3.2.4.1 `<Owner>` Open the approval queue

The Owner clicks on "Xem & duyệt" in the banner at the top of "Bất động sản".

[Ảnh: luồng owner duyệt nhà/duyệt nhà nguyên căn/1.jpg]

The queue separates new buildings that need a first price from buildings that were renovated again and need a new listed price. The Owner clicks on "Duyệt" to open a file.

[Ảnh: luồng owner duyệt nhà/duyệt nhà nguyên căn/2.jpg]

##### 3.2.4.2 `<Owner>` Review the money spent on the building

The Owner reviews the three cost blocks: the rent paid to the building owner, the renovation cost and the equipment bought new. Equipment handed over by the owner is recorded separately and is not counted as money spent.

[Ảnh: luồng owner duyệt nhà/duyệt nhà nguyên căn/3.jpg]

##### 3.2.4.3 `<Owner>` Review the capital and depreciation schedule

The Owner scrolls to "TỪNG KHOẢN VỐN VÀ LỊCH KHẤU HAO" to see how much of each item is recovered every month and which rooms carry it.

[Ảnh: luồng owner duyệt nhà/duyệt nhà nguyên căn/4.jpg]

##### 3.2.4.4 `<Owner>` Review the target and the computed rent

The Owner checks the profit target taken from "Cấu hình giá" and reads the step-by-step calculation that ends at the rent the building must reach every month. To change the target, the Owner clicks on "Sửa cấu hình duyệt giá" and then on "Tính lại theo cấu hình".

[Ảnh: luồng owner duyệt nhà/duyệt nhà nguyên căn/5.jpg]

##### 3.2.4.5 `<Owner>` Fix the rent

The Owner clicks on "Lấy giá đề xuất", or on "↑ Làm tròn 100k", or types another figure. The page then shows the profit of the whole period after operating cost and the repair reserve are deducted.

[Ảnh: luồng owner duyệt nhà/duyệt nhà nguyên căn/6.jpg]

##### 3.2.4.6 `<Owner>` Activate the property

The Owner clicks on "Xác nhận & Kích hoạt", reads the final dialog, then clicks on "Kích hoạt cho thuê". The vacant units go live on the public website and the operations manager starts running the building. The price can only be changed while the unit is empty, so it must be corrected before a tenant signs.

[Ảnh: luồng owner duyệt nhà/duyệt nhà nguyên căn/7.jpg]

#### 3.2.5 Web — Price approval of a room-by-room property

##### 3.2.5.1 `<Owner>` Review the money spent on the building

The Owner opens the file the same way and reviews the same three cost blocks. The description states how many rooms the building was split into.

[Ảnh: luồng owner duyệt nhà/duyệt nhà theo phòng/3.jpg]

##### 3.2.5.2 `<Owner>` Fix the rent of each room

The Owner fills the price column with "Lấy giá đề xuất cho tất cả" and "Làm tròn lên 100k tất cả", or types a figure for each room, and checks the total against the target line at the bottom of the table. The capital is divided equally across the rooms, not by area, so two rooms of different size get the same suggested rent.

[Ảnh: luồng owner duyệt nhà/duyệt nhà theo phòng/6.jpg]

#### 3.2.6 Web — Supplementary renovation and re-pricing

##### 3.2.6.1 `<Admin>` Open the building

The Admin opens a building whose state is "Đang kinh doanh" from the operation configuration screen.

[Ảnh: luồng cải tạo bổ xung/1.jpg]

##### 3.2.6.2 `<Admin>` Open a new renovation round

The Admin clicks on the tab "Cải tạo lại". The building switches to "Đang cải tạo" and waits for the supplementary file.

[Ảnh: luồng cải tạo bổ xung/3.jpg]

##### 3.2.6.3 `<Admin>` Import the supplementary file

The Admin selects the file and clicks on "Kiểm tra file". The file accepts only this building's lease contract code, and each line is marked THÊM_MỚI for an upgrade or THAY_THẾ for a like-for-like replacement.

[Ảnh: luồng cải tạo bổ xung/5.jpg]

The Admin clicks on "Nhập cải tạo bổ sung". The system imports the round and sends it to the Owner for re-pricing automatically, then the Admin confirms the work is over with "Xác nhận hoàn thành cải tạo".

[Ảnh: luồng cải tạo bổ xung/7.jpg]

##### 3.2.6.4 `<Owner>` Review the new round

The Owner opens the file from the right-hand column of the approval queue and reads how the spending is split between the part that raises the price and the part the company absorbs. Tenants already living in the building keep their contract price.

[Ảnh: luồng cải tạo bổ xung/9.jpg]

The Owner can expand the capital schedule to see the new round added on top of the original one.

[Ảnh: luồng cải tạo bổ xung/11.jpg]

##### 3.2.6.5 `<Owner>` Approve the new listed price

The Owner clicks on "Duyệt giá mới" and confirms. The dialog states the old price, the new price and how many rooms it applies to immediately.

[Ảnh: luồng cải tạo bổ xung/13.jpg]

#### 3.2.7 Mobile — Taking over the building

##### 3.2.7.1 `<Manager>` Login

To login into the system, the Manager enters their phone number or username and their password, then taps on "Đăng nhập". An account that has never been activated is offered "Kích hoạt ngay".

[Ảnh: mobile — màn đăng nhập]

##### 3.2.7.2 `<Manager>` Open the building list

After login successfully, the Manager taps on "Toà nhà" to see the buildings of the districts they are in charge of, filtered by "Tất cả", "Còn phòng", "Sắp hết hạn", "Bảo trì" or "Chưa mở".

[Ảnh: mobile — danh sách toà nhà của quản lý]

##### 3.2.7.3 `<Manager>` Open a room list and set a room status

The Manager taps a building to see its rooms with the states "Trống", "Đang thuê", "Đang bảo trì" and "Ngưng khai thác", and changes a state with "Đưa phòng vào bảo trì (sau khi khách đồng ý)", "Bảo trì hoàn tất — phòng sẵn sàng cho thuê" or "Tắt khai thác hoàn toàn".

[Ảnh: mobile — danh sách phòng của một toà nhà]

##### 3.2.7.4 `<Manager>` Read the daily task board

The Manager taps on "My Task — hôm nay" on the home screen to see the work due today, for example "Chốt chỉ số điện — hạn hôm nay" or "Phòng chưa chụp công tơ", and taps on "Xử lý →" to go straight to the screen that clears it.

[Ảnh: mobile — trang chủ quản lý với My Task]

### 3.3 Tenant & Contract Management Workflow

#### 3.3.1 Web — Preparing the operations team

##### 3.3.1.1 `<Admin>` Create an operations manager account

The Admin clicks on "Người dùng & phân quyền", then on "Tạo tài khoản", and enters the full name, username, phone number and password.

[Ảnh: admin/màn người dùng & phân quyền.jpg]

##### 3.3.1.2 `<Owner>` Assign a manager to a zone

The Owner clicks on "Phân công khu vực", then on "Đổi quản lý" on a district, and selects the manager. One district has exactly one manager, and assigning the district assigns every building inside it. A building without a manager cannot receive tenants.

[Ảnh: host/màn phân công khu vực cho Manager quản lý.jpg]

##### 3.3.1.3 `<Owner>` Review the workload of each manager

The Owner clicks on "Quản lý vận hành" to see how many zones, buildings, tenants and open maintenance tickets each manager is carrying.

[Ảnh: host/màn quản lý manager hệ thống.jpg]

##### 3.3.1.4 `<Admin>` Review the zone catalogue

The Admin clicks on "Danh mục khu vực" to add or rename the provinces and districts that the property import and the zone assignment are built on.

[Ảnh: admin/màn khu vực bất động sản.jpg]

#### 3.3.2 Web — Tenant onboarding of one profile

##### 3.3.2.1 `<Admin>` Open the onboarding screen

The Admin clicks on "Hồ sơ đón khách" to see the tenancies that are waiting for the manager to receive the tenant.

[Ảnh: luồng đón khách/1.jpg]

##### 3.3.2.2 `<Admin>` Fill in the tenancy

The Admin clicks on "Tạo hồ sơ", selects the property and the room, fills in the tenant identity, then checks the rent, the deposit and the tenancy term. Only buildings with a vacant room are listed, and the manager in charge is assigned automatically from the zone.

[Ảnh: luồng đón khách/nhập tay.jpg]

##### 3.3.2.3 `<Admin>` Review and save

The Admin clicks on "Xem lại & Lưu", reads the summary, then clicks on "Xác nhận & Lưu". The system creates the draft contract, renders the contract file and notifies the manager to receive the tenant.

[Ảnh: luồng đón khách/nhập tay1.jpg]

#### 3.3.3 Web — Tenant onboarding from Excel

##### 3.3.3.1 `<Admin>` Open the import

The Admin clicks on "Import Excel". One row is one tenancy, and the building must already be in business with a manager in charge.

[Ảnh: luồng đón khách/2.jpg]

##### 3.3.3.2 `<Admin>` Check the file

The Admin selects the file and clicks on "Kiểm tra file". The system checks the capacity of every building and reports the rows that do not fit before anything is created.

[Ảnh: luồng đón khách/3.jpg]

##### 3.3.3.3 `<Admin>` Import the contracts

The Admin clicks on "Import {n} hợp đồng" and confirms.

[Ảnh: luồng đón khách/4.jpg]

The system creates the contracts, then renders the contract file of each one and reports the result per contract code.

[Ảnh: luồng đón khách/5.jpg]

##### 3.3.3.4 `<Admin>` Follow up the profiles

The Admin can edit a profile, download its contract file or cancel it from the row actions. The phone number is masked by default and is revealed with the eye icon.

[Ảnh: luồng đón khách/6.jpg]

#### 3.3.4 Mobile — Receiving the tenant

##### 3.3.4.1 `<Manager>` Open the reception list

The Manager taps on "Đón khách — thu tiền" to see the tenancies waiting to start, sorted by urgency: "QUÁ HẠN {n} NGÀY", "HÔM NAY", "NGÀY MAI" or "CÒN {n} NGÀY". A tenancy with no move-in date shows "CHƯA ĐẶT NGÀY ĐÓN".

[Ảnh: mobile — danh sách chờ đón khách]

##### 3.3.4.2 `<Manager>` Send a new price to the Owner when needed

If the tenant agreed on a price different from the listed one, the Manager taps on "Nhập giá mới" and "Nhập tiền cọc" and sends the contract to the Owner. The card then shows "Chờ Owner duyệt giá", and "Owner từ chối giá" if the Owner declines.

[Ảnh: mobile — nhập giá mới gửi Owner duyệt]

##### 3.3.4.3 `<Manager>` Collect the deposit and the first rent

The Manager selects the collection method under "Hình thức thu cọc". Cash is recorded immediately, while a transfer creates a PayOS payment link and the card shows "Chờ khách chuyển tiền" until the payment is confirmed.

[Ảnh: mobile — thu cọc và tiền nhà kỳ đầu]

##### 3.3.4.4 `<Manager>` Record the room condition and the meter readings

The Manager takes at least one photo of the room condition, then photographs the electricity and water meters. The system reads the figures from the meter photos and the Manager corrects them if needed. Without a meter photo the reading can only be entered by hand with a passcode issued by the Admin, and the Manager must tick the responsibility checkbox.

[Ảnh: mobile — ảnh hiện trạng phòng và chỉ số công tơ]

##### 3.3.4.5 `<Manager>` Confirm the contract with a two-sided OTP

The Manager and the tenant each receive their own code. The Manager enters theirs, the card shows "Chờ khách nhập OTP", and the contract only takes effect once both codes have been entered.

[Ảnh: mobile — nhập OTP xác nhận hợp đồng]

##### 3.3.4.6 `<Manager>` Finish the reception

The system shows "Hoàn tất khởi tạo 🎉" with the contract code, the tenant, the room and the tenant's login account, then the Manager taps on "Về trang chủ".

[Ảnh: mobile — hoàn tất đón khách]

#### 3.3.5 Mobile — Signing and following the contract

##### 3.3.5.1 `<Tenant>` Activate the account and login

The tenant opens the application and enters the phone number and password given at reception. An account that is not active yet is activated with "Kích hoạt ngay".

[Ảnh: mobile — màn đăng nhập khách thuê]

##### 3.3.5.2 `<Tenant>` Confirm the contract

The tenant opens "Xác nhận hợp đồng", reads the contract and the handover record, then enters the 6-digit code sent to their phone. The screen explains that both sides hold a separate code and the contract only takes effect when both are entered, and "Gửi lại mã" re-sends the code after the countdown.

[Ảnh: mobile — xác nhận hợp đồng bằng OTP]

##### 3.3.5.3 `<Tenant>` Read the home screen

After login successfully, the tenant sees their building and room, the invoices that need paying, the state of their maintenance requests and how many days the contract still has.

[Ảnh: mobile — trang chủ khách thuê]

##### 3.3.5.4 `<Tenant>` Open the contract

The tenant taps on "Chi tiết hợp đồng" to read the terms and taps on "📥 Tải PDF hợp đồng" to download the signed file.

[Ảnh: mobile — chi tiết hợp đồng khách thuê]

#### 3.3.6 Mobile — Checkout

##### 3.3.6.1 `<Tenant>` Request the checkout

The tenant taps on "🚪 Yêu cầu trả phòng", picks the move-out date and a reason, then submits the request. The screen shows the six stages of the process: "Gửi yêu cầu", "Quản lý duyệt", "Kiểm tra phòng", "Bạn xác nhận quyết toán", "Hoàn tiền cọc" and "Hoàn tất".

[Ảnh: mobile — yêu cầu trả phòng]

##### 3.3.6.2 `<Manager>` Approve the request

The Manager opens "Duyệt yêu cầu trả phòng" and approves it, which makes the system close the rent of that month on the move-out date and send the final invoice. Rejecting the request requires a reason the tenant can act on.

[Ảnh: mobile — duyệt yêu cầu trả phòng]

##### 3.3.6.3 `<Manager>` Inspect the room

On the agreed date the Manager taps on "Lập biên bản kiểm tra", photographs the room condition and photographs both meters again. The system checks that each photo really is the right meter and reads the closing figures from it.

[Ảnh: mobile — biên bản kiểm tra phòng khi trả]

##### 3.3.6.4 `<Manager>` Send the settlement

The Manager reviews the settlement lines — "Tiền điện", "Tiền nước", "Tiền nhà", "Phí dịch vụ", "Phí bảo trì", "Bồi thường hư hỏng" and "Khoản khác" — then sends it to the tenant.

[Ảnh: mobile — bảng quyết toán trả phòng]

##### 3.3.6.5 `<Tenant>` Confirm the settlement and the deposit

The tenant taps on "Xem và xác nhận bảng quyết toán", pays whatever is still owed, and finally confirms with "Xác nhận bạn đã nhận đủ tiền cọc". A tenant who disagrees raises a complaint, which the Admin arbitrates on the web.

[Ảnh: mobile — khách xác nhận quyết toán và nhận cọc]

#### 3.3.7 Web — Following contracts and tenants

##### 3.3.7.1 `<Admin>` Check property and room status

The Admin clicks on "Tình trạng nhà & phòng" to see whether each manager has taken over their buildings, how many rooms are still free and whether the handover file of each occupied room is complete.

[Ảnh: admin/màn tình trạng phòng & nhà.jpg]

##### 3.3.7.2 `<Admin>` Monitor tenant contracts

The Admin clicks on "Hợp đồng" to follow every tenancy in the system and the ones that expire soon.

[Ảnh: admin/màn admin xem hợp đồng của khách thuê.jpg]

##### 3.3.7.3 `<Owner>` Review tenants

The Owner clicks on "Khách thuê" to see who is living in which room, which rooms are free and which tenancies expire within 60 days.

[Ảnh: host/màn quản lý khách thuê.jpg]

##### 3.3.7.4 `<Owner>` Review contracts

The Owner clicks on "Hợp đồng" to see the tenancies on one tab and the master leases signed with the building owners on the other.

[Ảnh: host/màn quản lý hợp đồng.jpg]

##### 3.3.7.5 `<Admin>` Approve an extension request

The Admin clicks on "Đơn gia hạn" and approves the request, which only moves the end date and leaves the rent unchanged. Rejecting a request requires a reason of at least 10 characters, which the tenant reads word for word.

[Ảnh: admin/màn admin xem đơn giai hạn ở thêm của khách thuê.jpg]

##### 3.3.7.6 `<Owner>` Follow extension requests

The Owner clicks on "Đơn gia hạn" to see which tenants asked to stay longer and how each request was settled. The decision itself belongs to the Admin.

[Ảnh: host/màn theo dõi đơn giai hạn của khách thuê.jpg]

### 3.4 Monthly Billing & Payment Workflow

#### 3.4.1 Mobile — Locking the meter readings

##### 3.4.1.1 `<Manager>` Open the meter task

The Manager taps on "Ghi điện nước" or on the home card "Cần chụp công tơ" to see the rooms whose meter has not been photographed yet, grouped by building and marked "Quá hạn {n} ngày", "Hạn hôm nay" or "Còn {n} ngày".

[Ảnh: mobile — danh sách phòng cần chụp công tơ]

##### 3.4.1.2 `<Manager>` Photograph and lock a reading

The Manager photographs the meter, checks the figure the system read from the photo, and saves it. Electricity must be closed on the last day of the month, because without a photo the bill cannot be published.

[Ảnh: mobile — chụp công tơ và chốt chỉ số]

##### 3.4.1.3 `<Manager>` Send the room bills

Once the Admin has published the master bill, the Manager opens "Hoá đơn EVN" to see each room with its readings, its consumption, the unit price and the amount, and sends the invoices to the tenants. Each row then shows "📬 Đã gửi — khách chưa mở xem", "👁 Khách đã xem hoá đơn — chưa trả tiền" or "✓ Khách đã thanh toán".

[Ảnh: mobile — hoá đơn điện nước từng phòng]

#### 3.4.2 Web — Publishing the bill of one building

##### 3.4.2.1 `<Admin>` Publish an electricity bill

The Admin clicks on "Hoá đơn điện EVN", selects the consumption period and the building, uploads the photo of the paper bill, checks the figures the system read from it, then clicks on "Phát hành đơn giá cho kỳ này". Rooms whose meter reading is not locked yet are billed automatically as soon as the manager locks them.

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/1.jpg]

##### 3.4.2.2 `<Admin>` Publish a water bill

The Admin clicks on "Hoá đơn nước" and repeats the same steps, with m³ instead of kWh and the subscriber number as the meter identity.

[Ảnh: luồng admin gửi hoá đơn điện nước/nước/1.jpg]

##### 3.4.2.3 `<Admin>` Issue a meter passcode

When a manager cannot photograph a meter, the Admin clicks on "Cấp mã đồng hồ", writes who asked and why, sets the lifetime in minutes, clicks on "Tạo mã" and reads the code out to the manager. The code works once and dies when it expires.

[Ảnh: admin/màn cấp mã đồng hồ điện nước onboard.jpg]

#### 3.4.3 Web — Publishing a batch from a .zip archive

##### 3.4.3.1 `<Admin>` Match the archive to the buildings

The Admin clicks on "Nhập từ .zip" and selects the archive. The system matches each scan to a building by its customer code and reports how many matched, then the Admin clicks on "Đọc số liệu {n} nhà".

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/2.jpg]

##### 3.4.3.2 `<Admin>` Check the figures

The Admin checks every row against its scan and corrects whatever the reader got wrong, because a wrong total gives a wrong unit price and the managers build every room bill on that unit price.

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/3.jpg]

The water batch works the same way.

[Ảnh: luồng admin gửi hoá đơn điện nước/nước/3.jpg]

##### 3.4.3.3 `<Admin>` Publish the batch

The Admin clicks on "Phát hành {n} nhà" and reads the confirmation, which lists the buildings and warns when the billing period was taken from the selected month instead of the paper.

[Ảnh: luồng admin gửi hoá đơn điện nước/điện/4.jpg]

##### 3.4.3.4 `<Admin>` Revoke a bill issued by mistake

The Admin clicks on "Thu hồi hoá đơn này" on the wrong row in the published list. The building can then be published again for that period.

[Ảnh: danh sách đã phát hành]

#### 3.4.4 Mobile — Paying an invoice

##### 3.4.4.1 `<Tenant>` Open the invoice list

The tenant taps on "Hoá đơn" to see every invoice with its type and its state: "Chờ thanh toán", "Đã thanh toán", "Quá hạn" or "Đã huỷ".

[Ảnh: mobile — danh sách hoá đơn của khách thuê]

##### 3.4.4.2 `<Tenant>` Pay the invoice

The tenant opens an invoice, reads the readings, the consumption, the unit price and the amount, then pays it. The payment methods are "🏦 Chuyển khoản ngân hàng", "💵 Tiền mặt" and "💳 Ví điện tử"; an online payment returns to the result page and the invoice is marked paid within a few minutes.

[Ảnh: mobile — chi tiết hoá đơn và thanh toán]

##### 3.4.4.3 `<Tenant>` Dispute an invoice

A tenant who believes the invoice is wrong raises a complaint from the invoice itself. While the complaint is open, the invoice stops counting as overdue, and "Rút yêu cầu tra soát?" withdraws it so the due date runs again.

[Ảnh: mobile — gửi yêu cầu tra soát hoá đơn]

##### 3.4.4.4 `<Manager>` Collect a payment in cash

The Manager opens the invoice of the room and records the collection, which closes the invoice immediately and appears in the payment history.

[Ảnh: mobile — thu tiền mặt của khách]

#### 3.4.5 Web — Following the money collected

##### 3.4.5.1 `<Admin>` Monitor invoices and payments

The Admin clicks on "Thanh toán" to see every invoice of the system on one tab and the deposits on the other. An invoice is either paid in full or not paid at all, because the system never records a partial collection.

[Ảnh: admin/màn admin xem hoá đơn thanh toán.jpg]

##### 3.4.5.2 `<Owner>` Review invoices

The Owner clicks on "Hoá đơn" to filter the invoices issued to their tenants and export the result to Excel.

[Ảnh: host/màn theo dõi hoá đơn thanh toán.jpg]

##### 3.4.5.3 `<Admin>` Arbitrate a utility bill complaint

The Admin clicks on "Hoá đơn điện nước" in the complaint group, compares the claim with the original bill, then concludes the case. While a bill is under complaint the system stops counting it as overdue.

[Ảnh: admin/màn khiếu nại hoá đơn điện nước từ khách thuê.jpg]

##### 3.4.5.4 `<Manager>` Terminate a contract for non-payment

When the rent is long overdue and every reminder has been sent, the Manager opens the invoice and taps on "Chấm dứt hợp đồng", then handles the move-out. The system warns that the action cannot be undone.

[Ảnh: mobile — chấm dứt hợp đồng do quá hạn]

### 3.5 Maintenance & Equipment Management Workflow

#### 3.5.1 Mobile — Reporting a fault

##### 3.5.1.1 `<Tenant>` Scan the equipment QR tag

The tenant taps on "Quét mã QR thiết bị" and points the camera at the tag stuck on the equipment to open that exact item. A code that does not belong to the room is refused, and "Chọn từ danh sách thiết bị" is offered instead.

[Ảnh: mobile — quét QR thiết bị]

##### 3.5.1.2 `<Tenant>` Create the maintenance request

The tenant enters the title of the problem, picks the category, attaches at least one photo of the damage and proposes a time for the visit. The system recognises the equipment in the photo and attaches it to the request.

[Ảnh: mobile — tạo yêu cầu bảo trì]

##### 3.5.1.3 `<Tenant>` Follow the request

The tenant taps on "Bảo trì" to follow the request through "Chờ xử lý", "Đang xử lý" and "Đã hoàn thành", and reads the repair history of the room.

[Ảnh: mobile — danh sách yêu cầu bảo trì của khách]

#### 3.5.2 Mobile — Handling the ticket

##### 3.5.2.1 `<Manager>` Open the ticket

The Manager taps on "Bảo trì" to see the tickets of their buildings by priority — "🚨 Khẩn cấp", "🟡 Trung bình", "🟢 Thấp" — and opens one to read the description and the photos.

[Ảnh: mobile — danh sách phiếu bảo trì của quản lý]

##### 3.5.2.2 `<Manager>` Repair and close the ticket

The Manager updates the progress, attaches "🖼️ Ảnh sau sửa chữa" and "🧾 Ảnh hoá đơn", enters the cost and closes the ticket.

[Ảnh: mobile — cập nhật tiến độ và đóng phiếu]

##### 3.5.2.3 `<Manager>` Report a fault caused by the tenant

When the damage was caused by the tenant, the Manager attaches "⚠️ Bằng chứng lỗi" and reports it, which sends the ticket to the Admin for a decision instead of charging the tenant directly.

[Ảnh: mobile — báo lỗi do khách]

#### 3.5.3 Web — Maintenance and equipment

##### 3.5.3.1 `<Admin>` Monitor maintenance tickets

The Admin clicks on "Bảo trì & thiết bị" to follow every repair request from the moment a tenant reports it to the moment it is closed, with its cost and its photo evidence.

[Ảnh: admin/màn bảo trì thiết bị.jpg]

##### 3.5.3.2 `<Admin>` Review a tenant-fault report

The Admin clicks on "Báo lỗi do khách", looks at the evidence, then clicks on "Xem xét & duyệt" to charge the repair to the tenant, or on "Không duyệt" with a note to leave the cost with the company.

[Ảnh: màn Báo lỗi do khách]

##### 3.5.3.3 `<Admin>` Print equipment QR tags

The Admin clicks on "Danh mục thiết bị", selects the building and the tag size, then clicks on "In tất cả tem QR" or "In toàn bộ nhà". Tenants scan these tags to report a fault against the right piece of equipment.

[Ảnh: admin/màn quản lý thiết bị & mã QR thiết bị.jpg]

### 3.6 Cash Flow & Financial Reporting Workflow

#### 3.6.1 Web — Cash flow

##### 3.6.1.1 `<Owner>` Reconcile money in and money out

The Owner clicks on "Tổng quan" to reconcile money in, money out and net profit for the period, per building.

[Ảnh: host/màn theo dõi tổng quan dòng tiền của hệ thống.jpg]

##### 3.6.1.2 `<Owner>` Follow receivables

The Owner clicks on "Công nợ" to see who owes what, sorted by how long the debt has been outstanding.

[Ảnh: host/màn theo dõi các khoản nợ của khách thuê.jpg]

#### 3.6.2 Web — Deposits

##### 3.6.2.1 `<Owner>` Track the deposit ledger

The Owner clicks on "Sổ cọc" to see the deposits being held. A deposit can only be returned once the tenant has cleared every charge, and it is never used to settle an unpaid invoice.

[Ảnh: host/màn quản lý tiền cọc của khách thuê.jpg]

##### 3.6.2.2 `<Admin>` Arbitrate a deposit refund complaint

The Admin clicks on "Hoàn cọc", reads the tenant claim and the checkout file, then clicks on "Kết luận khiếu nại" to close the case with a written decision.

[Ảnh: admin/màn khiếu nại hoàn cọc cho tenant.jpg]

#### 3.6.3 Web — Reporting

##### 3.6.3.1 `<Owner>` View financial and operational reports

The Owner clicks on "Báo cáo" to see revenue, cost, profit and occupancy over 6 or 12 periods, together with the performance of each operations manager.

[Ảnh: host/màn báo cáo phân tích hiệu suất vận hành của hệ thống.jpg]

##### 3.6.3.2 `<Owner>` Read notifications

The Owner clicks on "Thông báo" to read the events that need attention, filtered by category and by read state.

[Ảnh: host/màn thông báo.jpg]

#### 3.6.4 Mobile — Payment history

##### 3.6.4.1 `<Manager>` Review the payments collected

The Manager taps on "Lịch sử thu tiền" to check what has been collected in their buildings and which invoices are still open.

[Ảnh: mobile — lịch sử thu tiền của quản lý]

##### 3.6.4.2 `<Tenant>` Review the payments made

The tenant taps on "Lịch sử thanh toán" to see every payment they have made, with the method and the date of each one.

[Ảnh: mobile — lịch sử thanh toán của khách thuê]

### 3.7 Troubleshooting

| Message on screen                                                                                | Meaning                                                        | Solution                                                                             |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| "Tài khoản Quản lý vận hành vui lòng sử dụng ứng dụng di động."                                  | A manager account tried to sign in on the web                  | Use the mobile app, the web is for Admin and Owner only                               |
| "Không kết nối được máy chủ. Kiểm tra lại backend rồi thử lại."                                  | The backend is unreachable                                     | Check that the API is running and that `VITE_API_URL` points at it                   |
| "Có khu vực trong file chưa tồn tại trong hệ thống"                                              | The Excel file names a district that is not in the catalogue   | Click on "Tạo tự động", or add it in "Danh mục khu vực" and check the file again     |
| "Chưa import được: cả {n} hợp đồng đều thuộc nhà chưa hoạt động"                                 | The buildings have not been activated by the Owner yet          | Finish the price approval workflow first, then import the tenancies                  |
| "Nhà này chưa có quản lý phụ trách…"                                                             | The district of the building has no manager                    | Ask the Owner to assign one                                                           |
| "Cấu hình chưa có tiền lãi mục tiêu…"                                                            | The pricing policy has never been filled in                    | Open "Cấu hình giá" and save it                                                      |
| "Số danh bộ không khớp…"                                                                         | The subscriber number on the paper differs from the stored one | Check the selected building, then correct the field and try again                    |
| "Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay."                                            | The reader could not parse the photo                           | Type the figures by hand, the photo stays attached as evidence                       |
| "Ảnh không phải đồng hồ điện / nước"                                                             | The photo taken on mobile is not the meter that was asked for  | Take the photo again, close enough to read the digits and without glare              |
| "Chưa có chỉ số {điện/nước}. Chụp ảnh đồng hồ để OCR tự điền, hoặc xin mã quản trị để nhập tay." | The reading has no photo evidence                              | Photograph the meter, or ask the Admin for a passcode (3.4.2.3)                      |
| "Server không gửi được SMS tới số của khách."                                                    | The OTP could not be delivered                                 | Ask the Admin to check the SMS provider configuration; retrying gives the same error |
| "Còn {n} phòng đang có khách thuê — không thể thực hiện."                                        | The building still has occupied rooms                          | Wait until the tenancies end, or move the tenants first                              |
| "Khách còn khoản chưa thanh toán {tiền}. Thu đủ rồi mới hoàn cọc được."                          | The tenant still owes money                                    | Collect the outstanding invoices, then refund the deposit in full                    |
| "Tài khoản này không có quyền … (403)"                                                           | The account lacks the permission for that screen               | Sign in with an Admin account                                                        |

_Table 5 - Troubleshooting_
