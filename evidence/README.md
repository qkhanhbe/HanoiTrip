# Evidence index

Mỗi file M1–M11 tách ba trạng thái: `verified local`, `implemented but unverified in Azure`, và `pending`. Không dùng output local thay cho bằng chứng cloud. Artifact/screenshot thật phải redacted và gắn ngày, commit SHA, lệnh hoặc URL run.

| Milestone | Trạng thái hiện tại                                                   |
| --------- | --------------------------------------------------------------------- |
| M1–M8     | Terraform/workflow/app đã chuẩn bị; chờ Azure apply và evidence thật  |
| M9        | Local checks đạt; chờ PR Actions + ruleset + hai negative PR bắt buộc |
| M10       | CD disabled-by-default đã có; chờ OIDC/resources và end-to-end run    |
| M11       | JSON logs/alerts IaC/runbook đã có; chờ dashboard/query/trigger thật  |
