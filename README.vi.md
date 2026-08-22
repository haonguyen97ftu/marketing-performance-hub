# Marketing Performance Hub — hướng dẫn tiếng Việt

Đây là bộ vận hành quảng cáo trên Google Sheets và Google Apps Script cho 5 nền
tảng: Meta, TikTok, Google Ads, Apple Search Ads và Moloco.

## Nguyên tắc public an toàn

Repo chỉ chứa source code. Token, private key, spreadsheet ID, ad account ID,
tên khách hàng/công ty, campaign export, log production và dữ liệu thanh toán
không được đưa lên GitHub.

Credential do chính người vận hành tạo và nhập tại:

```text
Apps Script → Project Settings → Script Properties
```

Không nhập credential vào sheet, file `.gs`, GitHub Issue, ảnh chụp màn hình,
chat hoặc email. Người có quyền sửa Apps Script có thể xem Script Properties,
vì vậy chỉ cấp quyền Editor cho người thực sự cần vận hành.

## Cài nhanh

1. Tạo Google Sheet riêng tư trong tài khoản/tổ chức vận hành.
2. Mở **Extensions → Apps Script**.
3. Thêm toàn bộ file `.gs` ở root repo, file HTML tên
   `ProjectControlPanel`, và manifest `appsscript.json`.
4. Nhập credential theo [docs/CREDENTIALS.md](docs/CREDENTIALS.md).
5. Chạy `setupMarketingSpendHub`.
6. Chạy `step200SetupProjectControlPanel`.
7. Chạy `step210TestProjectUpgrade`; chỉ tiếp tục khi `status: SUCCESS`.
8. Mở sidebar, bật account cần sync và cài daily trigger.

## Vận hành

- Daily sync giữ mặc định 3 ngày đã hoàn tất để tự bù dữ liệu trễ.
- Range sync hỗ trợ Yesterday, 3/7/14/30 ngày hoặc custom tối đa 31 ngày.
- Sync từ sidebar chạy background, không có popup chặn luồng.
- Payment Monitor dùng threshold và ngày đầu chu kỳ do người vận hành nhập;
  spend lấy từ `Spend_Daily`. Số này không phải billing API xác nhận nếu token
  không có quyền billing.
- Chỉ nên để `Dashboard`, `Accounts` và `Payment_Monitor` hiển thị. Sheet hệ
  thống/log/QA được ẩn, không bị xóa.

## Kiểm tra trước khi public

```bash
bash scripts/security-scan.sh
node scripts/validate-apps-script.js
```

Nếu một lệnh FAIL thì không push. Xem hướng dẫn chi tiết tại:

- [Cài đặt](docs/SETUP.md)
- [Vận hành](docs/OPERATIONS.md)
- [Bảo trì](docs/MAINTENANCE.md)
- [Bảo mật và dữ liệu riêng tư](docs/SECURITY_AND_PRIVACY.md)
- [Xử lý lỗi](docs/TROUBLESHOOTING.md)

