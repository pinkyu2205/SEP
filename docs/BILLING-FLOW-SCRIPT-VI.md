# Luồng 3: Hoá đơn và thanh toán hằng tháng

Thời lượng khoảng 5 phút.


## Mở đầu

Nói:
Luồng này có hai loại hoá đơn chạy theo hai cách khác nhau. Tiền nhà thì hệ thống tự làm hoàn toàn. Điện nước thì cần số liệu thực tế, nên là sự phối hợp giữa quản lý trên app và Admin trên web.


## Cảnh 1 — Tiền nhà tự động

Nói:
Ngày 1 hằng tháng, hệ thống tự phát hành hoá đơn tiền nhà cho mọi hợp đồng đang hiệu lực. Không ai phải bấm gửi.

Làm (app khách thuê):
Mở thông báo hoá đơn tiền nhà → vào Hoá đơn → chỉ vào hoá đơn tiền nhà, hạn ngày 5.

Nói:
Khách nhận thông báo ngay và thấy hoá đơn tiền nhà trong app, hạn trả là ngày 5. Nếu chưa trả, hệ thống tự nhắc khách mỗi ngày.

Làm (app quản lý):
Tiền phòng tự động → chọn toà nhà → chỉ một phòng đã trả, một phòng chưa trả.

Nói:
Quản lý chỉ cần theo dõi. Mỗi phòng một dòng, nhìn là biết khách đã trả chưa. Từ ngày 8 mà khách vẫn chưa trả, quản lý mới được quyền chấm dứt hợp đồng. Hệ thống không phạt trễ hạn và không tự cắt hợp đồng, quyết định đó luôn do con người bấm.

Tiền nhà thì tự động như vậy. Còn điện và nước phải dựa vào chỉ số thực tế, và hai loại này chạy theo lịch khác nhau.


## Cảnh 2 — Tiền điện

Nói:
Với tiền điện, nhà nguyên căn và nhà chia phòng làm khác nhau.

Nhà nguyên căn chỉ có một khách và một công tơ, nên hoá đơn EVN chính là hoá đơn của khách. Quản lý không cần chụp gì, Admin phát hành là hoá đơn đi thẳng tới khách.

Nhà chia phòng thì một hoá đơn EVN dùng chung cho nhiều phòng, nên phải chia theo công tơ riêng của từng phòng. Nhóm em xin demo cách này.

Làm (app quản lý):
Việc của tôi → Chốt chỉ số điện → chụp công tơ một phòng → lưu.

Nói:
Ngày cuối tháng, việc chốt chỉ số điện tự hiện trong danh sách việc của quản lý. Hạn là đúng ngày cuối tháng, vì để sang tháng sau thì công tơ đã chạy sang kỳ mới. Quản lý chụp công tơ từng phòng, hệ thống tự đọc số từ ảnh, quản lý chỉ sửa nếu đọc sai. Ảnh được lưu lại làm bằng chứng. Nếu không chụp được thì phải xin Admin cấp mã nhập tay, mã chỉ dùng một lần.

Lúc này hoá đơn chưa gửi cho khách, vì chưa biết giá điện của kỳ đó.

Làm (web Admin):
Hoá đơn điện EVN → chọn kỳ và toà nhà → tải ảnh hoá đơn EVN → đối chiếu số → Phát hành.

Nói:
Đầu tháng sau, hoá đơn EVN về. Admin tải lên, hệ thống đọc số liệu và khớp đúng toà nhà theo mã khách hàng điện. Từ tổng tiền và tổng số điện, hệ thống ra đơn giá thực của kỳ đó. Tiền mỗi phòng bằng số điện phòng đó dùng nhân với đơn giá, nên khách trả đúng giá điện thật.

Phát hành xong là hoá đơn tự tới khách, quản lý không phải gửi tay. Phòng nào lỡ chưa chụp thì tự phát hành ngay khi quản lý chụp xong.

Nhiều nhà thì Admin gom hoá đơn vào một file zip và phát hành một lần. Phát hành nhầm thì thu hồi rồi phát hành lại.


## Cảnh 3 — Tiền nước

Nói:
Tiền nước đi cùng khuôn với điện: quản lý chốt số trước, Admin đưa hoá đơn tổng lên sau, hệ thống tự chia và gửi cho khách. Nhà nguyên căn cũng không cần chụp đồng hồ, hoá đơn nước đi thẳng tới khách.

Khác điện ở một chỗ: nước không có hạn cố định cuối tháng. Người ghi nước của công ty cấp nước xuống mỗi tháng một ngày khác nhau, nên quản lý chụp đồng hồ nước từng phòng đúng ngày đó, để số của các phòng khớp với kỳ trên hoá đơn nước.

Làm (app quản lý):
Ghi điện nước → tab Nước → chụp đồng hồ nước một phòng → lưu.

Nói:
Quản lý chụp đồng hồ nước, hệ thống đọc số từ ảnh như bên điện, đơn vị là mét khối.

Làm (web Admin):
Hoá đơn nước → chọn toà nhà → tải ảnh hoá đơn nước → đối chiếu số → Phát hành.

Nói:
Admin tải hoá đơn nước lên, hệ thống khớp toà nhà theo số danh bộ, tính đơn giá mỗi mét khối rồi chia cho từng phòng theo số đã chụp. Nếu Admin phát hành rồi mà còn phòng chưa chụp, hệ thống nhắc quản lý chụp nốt, chụp xong là hoá đơn phòng đó tự tới khách.

Hoá đơn điện, nước, sửa chữa và dịch vụ có hạn 5 ngày kể từ lúc phát hành, không phí trễ hạn. Quá hạn thì hệ thống báo cho các bên và mở quyền chấm dứt hợp đồng.


## Cảnh 4 — Khách thanh toán

Làm (app khách thuê):
Hoá đơn → mở hoá đơn điện → thanh toán PayOS → Thanh toán thành công.

Nói:
Khách thấy mọi hoá đơn ở một chỗ. Mở ra là thấy đủ chỉ số cũ, chỉ số mới, lượng tiêu thụ, đơn giá và thành tiền. Khách thanh toán qua PayOS, tiền về thì hệ thống tự ghi nhận, không ai phải xác nhận tay.

Nếu thấy hoá đơn sai, khách gửi tra soát ngay trên hoá đơn đó. Trong lúc tra soát, hạn thanh toán tạm dừng, và Admin phân xử trên web.


## Cảnh 5 — Quản lý theo dõi tiền

Làm (app quản lý):
Tiền khách thuê → lướt 3 tab Đang nợ, Đã thu, Cọc.

Nói:
Quản lý theo dõi toàn bộ tiền của khách ở màn này. Khách trả xong là khoản đó tự chuyển sang Đã thu, quản lý không phải xác nhận tay.

Nhóm em giữ hai quy tắc tiền. Một là hoá đơn chỉ có thu đủ hoặc chưa thu, không thu một phần. Hai là tiền cọc tách riêng, không dùng để trừ nợ. Khách trả đủ các khoản phí, cọc được hoàn nguyên vẹn khi trả phòng.


## Chốt luồng

Nói:
Tóm lại, tiền nhà thì tự động, còn điện nước thì con số nào cũng có ảnh làm bằng chứng. Khách trả online và hệ thống tự ghi nhận, nên tiền điện nước không còn là chuyện tranh cãi.


---

## Chuẩn bị trước khi quay

- Tài khoản khách có sẵn 1 hoá đơn tiền nhà chờ thanh toán.
- Một toà nhà chia phòng có phòng đã trả và phòng chưa trả tiền nhà.
- Toà nhà đó còn phòng chưa chụp công tơ kỳ này.
- Ảnh hoá đơn EVN và ảnh hoá đơn nước của đúng toà nhà đó.
- Toà nhà đó còn phòng chưa chụp đồng hồ nước.
- Tài khoản khách có 1 hoá đơn điện chờ thanh toán.


## Nếu hội đồng hỏi

Vì sao nhà nguyên căn không cần chụp đồng hồ?
Cả nhà chỉ có một khách, số trên hoá đơn EVN đã là số của khách, không cần chia.

Vì sao nhà chia phòng không chia đều tiền điện?
Mỗi phòng dùng một lượng khác nhau. Chia theo đồng hồ từng phòng mới công bằng, và có ảnh làm bằng chứng.

Vì sao không phạt trễ hạn?
Công ty ưu tiên giữ khách. Thay vào đó có lịch nhắc rõ ràng và quyền chấm dứt hợp đồng khi quá hạn.

Vì sao không cho trả một phần?
Để tránh công nợ lắt nhắt khó đối soát.

OCR đọc sai thì sao?
Người dùng luôn được đối chiếu và sửa trước khi lưu, ảnh vẫn được giữ làm bằng chứng.

Vì sao điện chốt cuối tháng còn nước thì không?
Điện chốt theo tháng dương lịch nên chốt đúng ngày cuối tháng. Nước thì kỳ tính theo ngày người ghi nước xuống, mỗi tháng một khác, nên quản lý chụp theo đúng ngày đó để khớp với hoá đơn nước.
