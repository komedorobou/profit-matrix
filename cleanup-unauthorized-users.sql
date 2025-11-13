-- ============================================================================
-- クレジットカード未登録ユーザーの一括削除スクリプト
-- ============================================================================
-- Supabase SQL Editor で実行してください
-- ============================================================================
--
-- このスクリプトは以下を削除します：
-- 1. stripe_customer_id が NULL のユーザー
-- 2. オーナーアカウント以外（komedorobouinuzini を含まないメール）
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: 削除対象ユーザーを確認（実行前に必ず確認）
-- ============================================================================

SELECT
    '👀 削除対象ユーザー一覧' as action,
    id,
    email,
    plan,
    subscription_status,
    stripe_customer_id,
    created_at
FROM public.profiles
WHERE stripe_customer_id IS NULL
  AND email NOT LIKE '%komedorobouinuzini%'
ORDER BY created_at DESC;

-- ============================================================================
-- STEP 2: 削除実行（上記の確認後、この部分のコメントを外して実行）
-- ============================================================================

/*
-- profilesテーブルから削除
DELETE FROM public.profiles
WHERE stripe_customer_id IS NULL
  AND email NOT LIKE '%komedorobouinuzini%';

-- auth.usersからも削除（Admin API経由で個別削除が必要）
-- 以下のクエリで削除対象のユーザーIDを取得してから、
-- Supabase Dashboard の Authentication > Users で手動削除してください

SELECT
    '🗑️ auth.users から削除が必要なID' as action,
    au.id,
    au.email
FROM auth.users au
WHERE au.id NOT IN (
    SELECT id FROM public.profiles
)
ORDER BY au.created_at DESC;
*/

COMMIT;

-- ============================================================================
-- 実行手順:
-- ============================================================================
-- 1. まず STEP 1 だけ実行して削除対象を確認
-- 2. 問題なければ STEP 2 のコメント /* */ を外して実行
-- 3. auth.users からは Supabase Dashboard で手動削除
-- ============================================================================
