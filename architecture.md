# HanoiTrip architecture

HanoiTrip là một SPA React và API Fastify được đóng gói trong cùng một image. MySQL lưu hành trình yêu thích; route demo chỉ phục vụ phát triển, còn Google Routes là adapter live dự kiến.

## Luồng traffic

```mermaid
flowchart LR
    User[Người dùng trong IP allowlist] -->|HTTPS| Restriction[App Service access restriction]
    Restriction --> Prod[Production slot\nReact + Fastify]
    Runner[GitHub CD runner tạm thời] -->|HTTPS khi release| Stage[Staging slot\ncùng image SHA]
    Prod -->|TLS 3306| DB[(MySQL Flexible Server)]
    Stage -->|TLS 3306| DB
    Prod -->|HTTPS server-side| Routes[Google Routes API]
    Browser[Browser] -->|tiles/style| Map[OpenFreeMap]
    Prod -->|JSON logs + metrics| Logs[Log Analytics / Azure Monitor]
```

MySQL chỉ allow outbound IP của hai slot và IP runner tạm trong lúc migration. Production/staging mặc định từ chối inbound ngoài allowlist. IP runner được xóa trong bước `always()` của CD.

## Luồng identity và secret

```mermaid
flowchart LR
    ProdMI[Production system-assigned MI] -->|AcrPull| ACR[Azure Container Registry]
    StageMI[Staging system-assigned MI] -->|AcrPull| ACR
    ProdMI -->|Get secret| KV[Key Vault]
    StageMI -->|Get secret| KV
    KV -->|Key Vault reference| Settings[App settings]
    Deploy[GitHub deploy OIDC identity] -->|AcrPush + scoped deploy role| Azure[Resource group]
    Plan[GitHub plan OIDC identity] -->|read + state data plane| State[(Terraform Blob state)]
```

ACR admin user bị tắt. GitHub dùng OIDC, không lưu client secret. App settings chỉ giữ Key Vault reference cho password/key server-side; browser key là public-by-design nhưng phải giới hạn referrer và API.

## Luồng release

```mermaid
flowchart LR
    Branch[feat/fix/chore branch] --> PR[Pull request]
    PR --> CI[App tests + Terraform checks + Docker build/image scan]
    PR --> Security[Gitleaks + Trivy + Semgrep]
    CI --> Gate[Required checks]
    Security --> Gate
    Gate -->|squash merge| Main[main]
    Main --> Build[Build một image tag SHA]
    Build --> ACR[Push ACR]
    ACR --> Stage[Deploy staging + migrate + warm-up]
    Stage --> Observe[Poll staging SHA; bắt đầu quan sát production]
    Observe --> Swap[Swap staging → production]
    Swap --> Verify{Production trả SHA mới\n3 lần, 0 non-200?}
    Verify -->|Có| Done[Giữ bản mới]
    Verify -->|Không| Rollback[Reverse swap + xác nhận SHA cũ]
```

Migration phải additive/backward-compatible vì hai phiên bản dùng chung production DB trong thời gian swap.

## Ranh giới hiện tại

Kiến trúc local, Terraform và workflow đã có trong repo. Không có Azure credential/resource trong workspace, nên sơ đồ Azure là kiến trúc mục tiêu, chưa phải bằng chứng deploy. Trạng thái thật nằm trong `evidence/M*.md` và `known-issues.md`.
