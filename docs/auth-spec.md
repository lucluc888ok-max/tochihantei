# 認証・アカウント管理 仕様書

## 現状の仕様

### 認証の仕組み
- **Firebase Authentication**（メール＋パスワード）
- ユーザーが登録 → 即ログイン完了（メール確認なし ※要改善）
- バックエンドは Firebase Admin SDK で IDトークンを検証し UID を特定
- Supabase の `users` テーブルでプラン管理、`usage_logs` で月次利用回数管理

### プラン判定ロジック
```
users.plan = "free"     → 月5回まで (FREE_PLAN_LIMIT = 5)
users.plan = "standard" → 無制限
```

---

## 実装済み機能

| 機能 | 状態 |
|------|------|
| メール＋パスワード登録 | ✅ |
| メール＋パスワードログイン | ✅ |
| ログアウト | ✅ |
| 月次利用回数管理 | ✅ |
| 履歴クラウド保存 | ✅ |
| URLシェア | ✅ |

---

## 実装する機能

### 1. パスワードリセット

**方式**: Firebase `sendPasswordResetEmail()`

**フロー:**
```
ログイン画面「パスワードを忘れた方」リンクをクリック
  ↓
メアド入力フォームに切り替え
  ↓
送信 → Firebaseがリセットメールを自動送信（メールサーバー不要）
  ↓
「メールを送りました」メッセージ表示
  ↓
ユーザーがリンクをクリック → Firebaseのパスワード再設定ページ
```

**変更箇所:**
- フロントエンド: ログインモーダルに「パスワードを忘れた」モードを追加
- バックエンド: 変更なし

---

### 2. メール確認（Email Verification）

**方式**: Firebase `sendEmailVerification()`

**フロー:**
```
アカウント登録完了
  ↓
Firebase が確認メールを自動送信
  ↓
アプリ上に「確認メールを送りました」バナーを表示（再送ボタンあり）
  ↓
ユーザーがメール内リンクをクリック
  ↓
emailVerified = true → バナーが消える
```

**方針（未確認ユーザーの扱い）:**
- 案A（採用）: 未確認でもシミュレーション使用可。ただしバナーで促す
- 案B: 未確認はシミュレーション不可

**変更箇所:**
- フロントエンド: 登録後に `sendEmailVerification()` / バナー追加 / 再送ボタン追加
- バックエンド: 変更なし

---

### 3. 管理者のプラン変更UI

**管理者の識別方法:**
- 環境変数 `ADMIN_EMAIL` / `VITE_ADMIN_EMAIL` で管理者メアドを設定
- バックエンドはトークンの email と `ADMIN_EMAIL` を照合して管理者チェック

**APIエンドポイント:**
- `GET  /api/admin/users` — ユーザー一覧（uid, email, plan, 今月利用回数）
- `PATCH /api/admin/users/{uid}/plan` — プラン変更（"free" or "standard"）

**管理者UI（`/admin` パネル）:**
```
┌─────────────────────────────────────────────────┐
│ ユーザー管理                                       │
├──────────────┬──────────┬───────────┬───────────┤
│ メールアドレス │ プラン    │ 今月利用   │ 操作      │
├──────────────┼──────────┼───────────┼───────────┤
│ aaa@xxx.com  │ free     │ 3回       │ [標準に変更]│
│ bbb@xxx.com  │ standard │ 12回      │ [無料に戻す]│
└──────────────┴──────────┴───────────┴───────────┘
```

**変更箇所:**
- バックエンド: `api/endpoints/admin.py` 新規作成
- フロントエンド: 管理者メアドでログイン時のみ「管理」ボタン表示 → パネル展開

---

### 4. 有料プランへの昇格フロー（Stripe連携・未実装）

**Stripe登録後に実装する。**

**フロー:**
```
ユーザーが「有料プランへ」ボタンをクリック
  ↓
バックエンドが Stripe チェックアウト URL を発行
  ↓
Stripe 決済ページへリダイレクト
  ↓
決済完了 → Stripe が Webhook をバックエンドに通知
  ↓
バックエンドが Supabase の users.plan を "standard" に更新
  ↓
次回シミュレーション時から無制限
```

**必要な環境変数:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`（月額25,000円のプライスID）

**必要なエンドポイント:**
- `POST /api/checkout` — チェックアウトセッション作成
- `POST /api/stripe-webhook` — Webhook受信・plan更新

---

## 環境変数一覧

### Backend (Railway)
| 変数名 | 用途 |
|--------|------|
| `GEMINI_API_KEY` | Gemini API |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK |
| `SUPABASE_URL` | Supabase接続 |
| `SUPABASE_SERVICE_KEY` | Supabase接続 |
| `ADMIN_EMAIL` | 管理者メアド（プラン変更権限） |

### Frontend (Vercel)
| 変数名 | 用途 |
|--------|------|
| `VITE_API_BASE_URL` | バックエンドURL |
| `VITE_FIREBASE_API_KEY` | Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase |
| `VITE_FIREBASE_PROJECT_ID` | Firebase |
| `VITE_FIREBASE_APP_ID` | Firebase |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps |
| `VITE_ADMIN_EMAIL` | 管理者メアド（管理ボタン表示制御） |

---

## Supabase テーブル構成

### users
| カラム | 型 | 説明 |
|--------|----|------|
| uid | text (PK) | Firebase UID |
| email | text | メールアドレス |
| plan | text | "free" or "standard" |

### usage_logs
| カラム | 型 | 説明 |
|--------|----|------|
| uid | text | Firebase UID |
| year_month | text | "2026-05" 形式 |
| count | int | 当月利用回数 |
