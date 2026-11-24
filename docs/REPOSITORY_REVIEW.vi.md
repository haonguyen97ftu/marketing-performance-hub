# Rà soát và hướng dẫn vận hành repo

## Nguồn và phạm vi

Google Sheet liên kết và dự án Apps Script gắn với Sheet là nguồn vận hành.
Repo GitHub là bản public của phần mã dùng chung. Khi đồng bộ, lấy mã từ bản
gốc về khu vực làm việc riêng, đối chiếu với `main`, loại ID, dữ liệu thật và
cấu hình riêng rồi mở PR. Dùng Sheet thử nghiệm riêng cho kiểm tra cần chạy
Apps Script. Không dùng repo public để đẩy đè lên dự án gốc.

Rà soát tĩnh dựa trên commit `6a0ebad`. Các tình huống lỗi dưới đây được suy ra
từ trình tự lệnh và chưa được tái hiện trên Google Sheets.

## Phát hiện

| Mức | Phát hiện | Hướng xử lý |
| --- | --- | --- |
| P1 | Cả hai bộ ghi `Age_Monthly` xóa toàn bộ phần thân trước khi ghi dữ liệu mới. Nếu lệnh ghi thất bại sau lệnh xóa, dữ liệu lịch sử của các nền tảng khác cũng có thể mất. Xem [Apple Ads](../AppleAdsAgeReporting.gs#L502-L513) và [Meta/TikTok](../AudienceAgeReporting.gs#L795-L805). | Ghi đầu ra trước, xác nhận thành công rồi xóa phần dư. Kiểm tra lỗi ở bước ghi và trường hợp đầu ra ít dòng hơn dữ liệu cũ. |
| P2 | Sidebar lưu trạng thái `QUEUED` rồi mới tạo trigger. Nếu tạo trigger lỗi, hàng đợi có thể chặn lần thử lại trong 30 phút. Hai yêu cầu đồng thời cũng có thể cùng vượt qua bước kiểm tra trạng thái vì thao tác nhận việc chưa có khóa. Xem [hàng đợi](../ProjectControlPanel.gs#L549-L577). | Khóa thao tác nhận việc, gắn ID cho từng job và hoàn tác trạng thái nếu tạo trigger thất bại. |
| P2 | Bộ quét phát hành xử lý mã thoát khác 0 của `rg` như không có kết quả. Thiếu `rg` hoặc lỗi I/O có thể dẫn đến thông báo đạt. Khi phát hiện kết quả, `rg -n` cũng in cả dòng khớp vào log. Xem [bộ quét](../scripts/security-scan.sh#L9-L19). | Chỉ chấp nhận mã 1 là không khớp. Dừng khi công cụ lỗi và chỉ báo tên tệp hoặc loại phát hiện. |

## Bản đồ luồng

- `ProjectControlPanel.html` gửi yêu cầu qua `google.script.run`. Server lưu
  yêu cầu và trạng thái trong Script Properties, rồi tạo trigger một lần.
  `AutomationTrigger.gs` có đường chạy theo lịch và ghi `Sync_Log`.
- `MasterOrchestrator.gs` chọn tài khoản bật và gọi các connector. Connector
  upsert dữ liệu chuẩn hóa vào `Spend_Raw`. `Spend_Daily` và Dashboard chỉ được
  dựng lại khi mọi nền tảng đang chạy thành công.
- `AppleAdsAgeReporting.gs` và `AudienceAgeReporting.gs` ghi `Age_Monthly`.
  Đây là một luồng riêng, có lệnh chạy từ menu và trigger tháng cài tùy chọn.
- `Credentials.gs` đọc cấu hình từ Script Properties. Kiểm tra cấu hình theo
  [hướng dẫn credentials](CREDENTIALS.md). Thông tin thật nằm trong môi trường
  được cấp quyền.

## Kiểm tra và vận hành

1. Clone repo, tạo nhánh từ `main`. Cài Node.js, Bash và ripgrep. Trên Windows,
   dùng môi trường có Bash và ripgrep khi chạy lệnh quét.
2. Chạy các kiểm tra sau từ thư mục gốc repo.

   ```bash
   rg --version
   bash scripts/security-scan.sh
   node scripts/validate-apps-script.js
   ```

3. Nếu cần kiểm tra tích hợp, tạo Sheet thử nghiệm và dự án Apps Script gắn với
   Sheet đó. Làm theo [hướng dẫn cài đặt](SETUP.md). Chạy
   `setupMarketingSpendHub`, `step200SetupProjectControlPanel` rồi
   `step210TestProjectUpgrade`. Chỉ dùng tài khoản và credential thử nghiệm.
4. Chạy đồng bộ một ngày đã hoàn tất. Đối chiếu `Sync_Log`, `Platform_Log`,
   `Spend_Raw` và `Spend_Daily`. Nếu một nền tảng lỗi, kiểm tra
   `outputsRebuilt` trước khi dùng số liệu Dashboard. Dữ liệu thô có thể đã được
   ghi một phần.
5. Để thử luồng độ tuổi, dùng **Marketing Hub → Audience reporting**. Kiểm tra
   số dòng và dữ liệu ngoài phạm vi trong `Age_Monthly`. Chạy lịch tháng bằng
   `installMonthlyAgeTrigger20261106` nếu cần. Tác vụ chạy khoảng 12 giờ ngày
   2 hằng tháng theo giờ Việt Nam. Dùng `removeMonthlyAgeTrigger20261106` để gỡ.
6. Mở PR với kết quả kiểm tra, tác động lên các sheet và phần cần thử trên
   Apps Script. CI kiểm tra cú pháp và quét nội dung repo. Kiểm tra tích hợp
   với API thật được thực hiện riêng trên Sheet thử nghiệm.

Xem thêm [vận hành](OPERATIONS.md), [khắc phục sự cố](TROUBLESHOOTING.md) và
[quy trình phát hành công khai](PUBLIC_RELEASE_CHECKLIST.md).
