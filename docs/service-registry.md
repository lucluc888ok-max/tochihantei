# サービス登録一覧

最終更新: 2026-05-06

---

## 使用中

| サービス | 用途 | アカウント | 費用 |
|---------|------|-----------|------|
| Vercel | フロントエンド配信 | GitHubと連携 | 無料 |
| Railway | バックエンドAPI | Hobby プラン | $5/月（約750円） |
| GitHub | コード管理 | lucluc888ok-max | 無料 |
| Google (Gemini API) | AI解析APIキー | dnisida1@gmail.com | 従量課金（現状ほぼ無料） |
| Cloudflare | ドメイン管理（tochi-ai.com） | dnisida1@gmail.com | ドメイン更新費のみ（年払い） |
| Firebase Authentication | ログイン認証（メール+パスワード） | dnisida1@gmail.com | 無料（月10万認証まで） |
| Supabase | ユーザー・利用回数管理DB | dnisida1@gmail.com | 無料枠（500MB・月50万リクエスト） |

## 不要（解約・放置でOK）

| サービス | 状況 |
|---------|------|
| Render | Railway移行済み・使用していない |

## 今後登録予定

| サービス | 用途 | タイミング |
|---------|------|-----------|
| Stripe | 決済・サブスクリプション管理 | マネタイズ開始時 |
| Resend | メール送信（登録確認・パスワードリセット） | マネタイズ開始時 |

## ドメイン

| ドメイン | 用途 | 登録先 | 状況 |
|---------|------|--------|------|
| tochi-ai.com | 本番サービスURL | Cloudflare | 設定済み・稼働中 |

## 環境変数一覧

### Vercel（フロントエンド）
| 変数名 | 用途 |
|--------|------|
| `VITE_API_BASE_URL` | バックエンドURL（Railway） |
| `VITE_FIREBASE_API_KEY` | Firebase Webアプリ設定 |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Webアプリ設定 |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Webアプリ設定 |
| `VITE_FIREBASE_APP_ID` | Firebase Webアプリ設定 |

### Railway（バックエンド）
| 変数名 | 用途 |
|--------|------|
| `GEMINI_API_KEY` | Gemini AI解析 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK（トークン検証） |
| `SUPABASE_URL` | SupabaseプロジェクトURL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
