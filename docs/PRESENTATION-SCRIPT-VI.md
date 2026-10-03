# Script thuyết trình — Hoàng Bình Land

## Mở đầu

Kính chào thầy cô và các bạn. Nhóm em xin trình bày dự án Hoàng Bình Land — hệ thống quản lý cho thuê lại bất động sản, mã dự án SLMS-2026.

Trong khoảng 20 phút, nhóm em sẽ đi qua 4 phần: bài toán, giải pháp và kiến trúc, demo 5 luồng nghiệp vụ chính, và cuối cùng là những điểm nhóm em thấy đáng chú ý nhất.

## Bài toán

Mô hình của công ty như sau: công ty thuê nguyên căn từ chủ nhà theo hợp đồng dài hạn, bỏ tiền cải tạo, mua thêm thiết bị, rồi cho thuê lại — hoặc nguyên căn, hoặc chia thành nhiều phòng. Lợi nhuận là phần chênh lệch giữa tiền thu từ khách và tổng chi phí bỏ ra.

Khi làm bằng Excel và Zalo, có 4 vấn đề lớn. Thứ nhất, định giá theo cảm tính — không biết giá thuê bao nhiêu mới thu hồi được vốn cải tạo trong thời hạn hợp đồng với chủ nhà. Thứ hai, tiền điện nước dễ sai và dễ tranh cãi, vì chỉ số ghi tay, không có bằng chứng. Thứ ba, bảo trì không rõ ai chịu tiền — hao mòn tự nhiên hay do khách làm hỏng. Và thứ tư, chủ đầu tư không nhìn được dòng tiền thật của từng căn nhà.

Hệ thống của nhóm em giải quyết từng điểm đó.

## Giải pháp và kiến trúc

Hệ thống có 4 vai trò trên 2 ứng dụng. Admin và Host làm việc trên web: Admin khởi tạo nhà, cấu hình khai thác, tạo hồ sơ đón khách, phát hành hoá đơn điện nước và phân xử khiếu nại; Host là chủ đầu tư, duyệt giá, phân công quản lý theo khu vực và theo dõi dòng tiền. Quản lý vận hành và khách thuê dùng ứng dụng di động: quản lý đón khách, chụp đồng hồ, thu tiền, xử lý bảo trì và trả phòng; khách thuê xác nhận hợp đồng, thanh toán, báo hỏng và trả phòng. Ngoài ra khách vãng lai có thể xem phòng trống trên website công khai mà không cần tài khoản.

Nhóm em chia theo đúng nơi làm việc thực tế: người ngồi văn phòng dùng web, người đi hiện trường dùng điện thoại. Tài khoản Quản lý đăng nhập trên web sẽ bị từ chối có chủ đích.

Về kỹ thuật, frontend web dùng React và Vite, mobile dùng React Native với Expo, backend dùng Spring Boot, xác thực bằng JWT. Hệ thống tích hợp PayOS cho thanh toán chuyển khoản, có webhook tự ghi nhận khi tiền về; Cloudinary để lưu ảnh hiện trạng, ảnh đồng hồ và ảnh hoá đơn; OCR để đọc chỉ số đồng hồ và hoá đơn EVN, hoá đơn nước; Expo Push cho thông báo đẩy và SMS cho mã OTP; Goong Maps cho địa chỉ và bản đồ. Source frontend được tổ chức theo vai trò, nhìn thư mục là biết màn nào phục vụ ai.

Sau đây nhóm em xin demo 5 luồng nghiệp vụ chính: tiếp nhận và định giá bất động sản, khách thuê và hợp đồng, hoá đơn và thanh toán hằng tháng, bảo trì và thiết bị, và cuối cùng là dòng tiền và báo cáo.

## Luồng 1 — Tiếp nhận và định giá

Công ty tiếp nhận nhà theo lô, và các thông tin nhà được lưu trong file Excel. Bước "Kiểm tra file" chỉ kiểm tra, chưa ghi gì vào hệ thống — hệ thống báo có bao nhiêu căn, bao nhiêu thiết bị chủ nhà bàn giao. Nếu file có quận/huyện chưa có trong danh mục, bấm "Tạo tự động".

Nhập xong, mỗi căn đi kèm hợp đồng với chủ nhà, mã khách hàng điện và số danh bộ nước. Hai mã này chỉ xem, không sửa trên web, vì nó là khoá để khớp hoá đơn EVN về sau; muốn đổi thì phải nhập lại file, tránh sửa tay nhầm.

Tiếp theo là cấu hình khai thác. File thứ hai khai báo cách khai thác — nguyên căn hay chia phòng — danh sách phòng, hợp đồng cải tạo và thiết bị mua mới. Nhập xong là tự gửi Host duyệt giá. Khi thi công xong, Admin bấm "Xác nhận hoàn thành cải tạo" thì Host mới duyệt được.

Và đây là phần nhóm em đầu tư nhiều nhất: duyệt giá. Host không đoán giá, mà hệ thống tính ngược từ vốn. Tiền đã bỏ ra gồm tiền thuê trả chủ nhà, chi phí cải tạo và thiết bị mua mới; thiết bị chủ nhà bàn giao thì không tính vào vốn. Bảng "Từng khoản vốn và lịch khấu hao" cho thấy mỗi khoản thu hồi bao nhiêu mỗi tháng. Cộng thêm chi phí vận hành, lương quản lý phân bổ theo số nhà người đó phụ trách, dự phòng sửa chữa và dự phòng trống phòng, hệ thống ra được giá thuê tối thiểu để đạt mục tiêu lợi nhuận mà Host đã cấu hình.

Host có thể lấy giá đề xuất, làm tròn lên 100 nghìn, hoặc tự nhập giá, và thấy ngay phần lãi của cả kỳ. Với nhà chia phòng, vốn được chia đều theo số phòng chứ không theo diện tích — đây là quyết định nghiệp vụ, để giá dễ giải thích với khách. Host bấm kích hoạt, và phòng trống tự lên website công khai.

Khi nhà đang kinh doanh mà cần cải tạo thêm, Admin mở một đợt cải tạo mới. Mỗi dòng phải ghi rõ là thêm mới — tức nâng cấp, được tính vào giá — hay thay thế đồ tương đương, thì công ty tự chịu. Host duyệt lại giá niêm yết, nhưng khách đang ở vẫn giữ nguyên giá trong hợp đồng.

## Luồng 2 — Khách thuê và hợp đồng

Trước khi đón khách, Host phân công quản lý theo khu vực. Mỗi quận/huyện có đúng một quản lý vận hành, gán khu vực là gán cho mọi nhà bên trong, không phải gán từng căn. Nhà chưa có quản lý thì không đón khách được.

Admin tạo hồ sơ đón khách — nhập tay từng hồ sơ hoặc import Excel. Hợp đồng được tạo ở trạng thái "Chờ đón khách", hệ thống sinh file hợp đồng và báo cho quản lý phụ trách khu vực. Khi import Excel, hệ thống kiểm tra sức chứa từng nhà trước khi tạo bất cứ hợp đồng nào. Số điện thoại và CCCD của khách luôn bị che, bấm vào biểu tượng con mắt mới xem được.

Trên app, quản lý thấy danh sách chờ đón khách, sắp theo độ gấp: quá hạn, hôm nay, ngày mai. Tại hiện trường, quản lý làm 4 việc.

Một, thu tiền cọc và tiền nhà kỳ đầu trong một lần. Tiền mặt thì ghi nhận ngay, chuyển khoản thì hệ thống sinh link PayOS, tiền về là tự cập nhật. Tiền nhà kỳ đầu tính từ ngày vào ở đến hết tháng.

Hai, chụp ảnh hiện trạng phòng, làm bằng chứng khi trả phòng sau này.

Ba, chụp đồng hồ điện và nước. OCR đọc chỉ số, quản lý chỉ sửa nếu sai. Nếu không chụp được thì phải xin mã do Admin cấp, dùng một lần, có thời hạn — không có chuyện gõ tay tuỳ ý.

Bốn, xác nhận bằng OTP hai chiều. Quản lý và khách mỗi người nhận một mã riêng, và hợp đồng chỉ có hiệu lực khi cả hai cùng nhập đúng. Khi khách nhập xong, máy quản lý hiện "Hoàn tất khởi tạo" và khách có tài khoản để dùng app.

Nếu khách thương lượng giá khác giá niêm yết, quản lý gửi giá mới để Host duyệt trước.

Trong thời gian thuê, khách có thể xin gia hạn, Admin duyệt thì chỉ dời ngày kết thúc và giữ nguyên giá. Khi trả phòng, quy trình gồm 6 bước: khách gửi yêu cầu; quản lý duyệt và hệ thống tự chốt tiền nhà theo ngày rời; quản lý lập biên bản kiểm tra phòng, chụp lại đồng hồ; gửi bảng quyết toán; khách xác nhận và thanh toán phần còn thiếu; cuối cùng là hoàn cọc. Nếu khách không đồng ý quyết toán thì gửi khiếu nại, và Admin phân xử trên web.

## Luồng 3 — Hoá đơn và thanh toán hằng tháng

Tiền nhà chạy hoàn toàn tự động. Ngày 28 tháng trước, hệ thống nhắc khách chuẩn bị. Ngày 1, hệ thống tự phát hành hoá đơn tiền nhà cho mọi hợp đồng đang hiệu lực. Từ ngày 2 đến ngày 4 nhắc mỗi ngày nếu khách chưa trả, ngày 5 là hạn cuối, ngày 7 nhắc lần cuối, và từ ngày 8 quản lý được quyền chấm dứt hợp đồng. Quản lý không phải gửi tay, chỉ theo dõi. Có hai nguyên tắc: không phạt trễ hạn, và hệ thống không tự cắt hợp đồng — quyết định chấm dứt luôn do con người bấm.

Với điện nước, cuối tháng quản lý mở "Việc của tôi" và chụp đồng hồ từng phòng; việc chốt điện chỉ hiện đúng từ ngày cuối tháng để tránh chụp sớm. Bên web, Admin tải hoá đơn tổng của EVN lên — từng tờ, hoặc cả lô bằng file zip. Hệ thống đọc số liệu và khớp với toà nhà theo mã khách hàng. Từ tổng tiền và tổng số điện, hệ thống ra đơn giá thực của kỳ đó, rồi chia cho từng phòng theo chỉ số quản lý đã chụp. Phòng nào chưa chốt số thì tự phát hành ngay khi quản lý chụp xong. Nếu phát hành nhầm thì Admin thu hồi và phát hành lại. Hoá đơn nước làm tương tự.

Các hoá đơn điện, nước, sửa chữa và dịch vụ có hạn 5 ngày kể từ khi phát hành, không phí trễ hạn; quá hạn thì hệ thống báo cho các bên liên quan và mở quyền chấm dứt hợp đồng.

Về phía khách, khách mở hoá đơn trên app, thấy đủ chỉ số, lượng tiêu thụ, đơn giá, thành tiền, và thanh toán qua PayOS. Thanh toán xong, hoá đơn tự cập nhật. Nếu thấy hoá đơn sai, khách gửi tra soát ngay trên hoá đơn, và trong lúc tra soát thì hạn thanh toán tạm dừng.

Nhóm em giữ hai quy tắc tiền. Hoá đơn chỉ có thu đủ hoặc chưa thu, không thu một phần. Và tiền cọc không bao giờ dùng để trừ nợ — khách trả đủ phí, cọc được hoàn nguyên vẹn. Quản lý theo dõi tất cả ở màn "Tiền khách thuê", chia thành đang nợ, đã thu, chờ duyệt và tiền cọc.

## Luồng 4 — Bảo trì và thiết bị

Mỗi thiết bị trong phòng được dán một tem QR do Admin in từ hệ thống. Khi có hỏng hóc, khách quét tem là mở đúng thiết bị đó — mã không thuộc phòng mình đang thuê sẽ bị từ chối. Khách nhập mô tả, chụp ảnh hoặc quay video, và chọn khung giờ hẹn 30 phút trong khoảng 7 giờ sáng đến 6 giờ chiều, không trùng lịch.

Đến hẹn, quản lý quét QR của đúng thiết bị để chứng minh mình có mặt thật. Hẹn quá 2 giờ mà chưa quét thì phiếu tự huỷ. Sau đó có 2 nhánh: sửa được ngay, hoặc mang đi kiểm tra thêm. Ở nhánh mang đi, lúc này chưa cần biết nguyên nhân, vì thực tế thợ mới là người xác định được.

Cả 2 nhánh đều đi về chung một màn "Chẩn đoán và báo giá", nơi quản lý nhập giá thợ báo và nguyên nhân. Nếu là hao mòn tự nhiên thì công ty trả. Nếu là lỗi do khách và khách đồng ý trả, hệ thống lập hoá đơn, và phải thanh toán xong mới được sửa. Nếu lỗi do khách nhưng khách từ chối trả, công ty trả hộ để khách không bị thiếu đồ dùng, nhưng phiếu bị gắn cờ để cuối tháng rà soát. Nếu phải thay thiết bị, hệ thống tự tính phần khấu hao còn lại.

Đóng phiếu bắt buộc phải có ảnh sau sửa chữa. Trạng thái phòng tự chuyển: đang sửa thì là "Đang bảo trì", sửa xong thì về "Đang thuê" hoặc "Trống". Lịch sử bảo trì được gắn theo từng thiết bị, cả khách và Host đều xem được.

## Luồng 5 — Dòng tiền và báo cáo

Toàn bộ dữ liệu từ các luồng trên đổ về cho Host. Host xem được tiền vào, tiền ra và lợi nhuận ròng theo từng toà nhà; ai đang nợ bao nhiêu; sổ cọc đang giữ; và báo cáo 6 hoặc 12 kỳ gồm doanh thu, chi phí, tỷ lệ lấp đầy và hiệu suất của từng quản lý. Đây chính là câu trả lời cho vấn đề thứ tư — chủ đầu tư nhìn được dòng tiền thật.

## Tổng kết

Tóm lại, có 5 điểm nhóm em thấy đáng giá nhất.

Thứ nhất, định giá từ vốn: giá thuê được tính ngược từ chi phí và mục tiêu lợi nhuận, không theo cảm tính.

Thứ hai, mọi con số đều có bằng chứng: ảnh đồng hồ kèm OCR, mã nhập tay chỉ dùng một lần, QR xác nhận có mặt, ảnh trước và sau sửa chữa.

Thứ ba, tự động hoá phần lặp lại: hoá đơn tiền nhà tự phát hành ngày 1, lịch nhắc tự động, thanh toán PayOS tự ghi nhận, thông báo đẩy tới đúng người.

Thứ tư, con người giữ những quyết định quan trọng: chấm dứt hợp đồng, phân xử khiếu nại và duyệt giá đều cần người bấm.

Và thứ năm, bảo vệ dữ liệu khách: số điện thoại, CCCD luôn được che, hợp đồng xác nhận bằng OTP hai chiều.

Về hướng phát triển, nhóm em sẽ hoàn thiện một số phần backend còn dang dở và mở rộng thêm báo cáo.

Nhóm em xin cảm ơn thầy cô đã lắng nghe, và sẵn sàng nhận câu hỏi ạ.
